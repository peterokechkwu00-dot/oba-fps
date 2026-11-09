import crypto from 'crypto';
import { dbReady, query, withTx, publicAccount } from './db.js';
import { ITEMS, getItem, isFree, DEFAULT_LOADOUT } from '../public/shared/catalog.js';
import { accountFromReq, ownedItems } from './auth.js';
import { clientIp, rateLimit, tooMany } from './rateLimit.js';

export function paymentsEnabled() {
  return !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY);
}

export function devPurchasesEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_PURCHASES === '1';
}

function apiBase() {
  return (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '');
}

async function paystack(path, { method = 'GET', body } = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw Object.assign(new Error('Paystack is not configured'), { code: 'NO_KEYS' });
  const res = await fetch(apiBase() + path, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || `Paystack error (${res.status})`);
    err.payload = data;
    throw err;
  }
  return data;
}

export function verifyPaystackSignature(rawBody, signature, secret) {
  if (!secret || !rawBody) return false;
  const sig = String(signature || '');
  if (!/^[0-9a-f]{128}$/i.test(sig)) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const got = Buffer.from(sig, 'hex');
  if (hash.length !== got.length) return false;
  return crypto.timingSafeEqual(hash, got);
}

function publicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function grantItem(q, accountId, itemId) {
  await q(
    `INSERT INTO inventory (account_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [accountId, itemId],
  );
}

// Grant after a verified Paystack success. Idempotent on the payment reference.
export async function fulfillPayment(reference, { paystackId, amountKobo, itemId, accountId } = {}) {
  if (!dbReady) throw Object.assign(new Error('database is not configured'), { code: 'NO_DB' });
  return withTx(async q => {
    const { rows } = await q(`SELECT * FROM payments WHERE reference = $1`, [reference]);
    const row = rows[0];
    if (!row) {
      // Webhook arrived before our initialize row, or a stray event. If metadata is complete, still record it.
      if (!accountId || !itemId || !amountKobo) return { ok: false, reason: 'unknown_reference' };
      const item = getItem(itemId);
      if (!item || item.priceKobo !== amountKobo) return { ok: false, reason: 'amount_mismatch' };
      await q(
        `INSERT INTO payments (reference, account_id, item_id, amount_kobo, status, paystack_id, verified_at)
         VALUES ($1, $2, $3, $4, 'success', $5, NOW())
         ON CONFLICT (reference) DO NOTHING`,
        [reference, accountId, itemId, amountKobo, paystackId || null],
      );
      await grantItem(q, accountId, itemId);
      return { ok: true, granted: true, already: false };
    }
    if (itemId && row.item_id !== itemId) return { ok: false, reason: 'item_mismatch' };
    if (accountId && row.account_id !== accountId) return { ok: false, reason: 'account_mismatch' };
    if (amountKobo != null && row.amount_kobo !== amountKobo) return { ok: false, reason: 'amount_mismatch' };
    if (row.status === 'success') {
      await grantItem(q, row.account_id, row.item_id);
      return { ok: true, granted: true, already: true };
    }
    await q(
      `UPDATE payments SET status = 'success', paystack_id = COALESCE($2, paystack_id), verified_at = NOW()
       WHERE reference = $1`,
      [reference, paystackId || null],
    );
    await grantItem(q, row.account_id, row.item_id);
    return { ok: true, granted: true, already: false };
  });
}

export async function verifyReference(reference) {
  const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = data.data || {};
  if (tx.status !== 'success') return { ok: false, reason: 'not_success', tx };
  const amountKobo = Number(tx.amount);
  const itemId = tx.metadata?.itemId || null;
  const accountId = tx.metadata?.accountId ? Number(tx.metadata.accountId) : null;
  const result = await fulfillPayment(reference, {
    paystackId: String(tx.id || tx.reference || ''),
    amountKobo,
    itemId,
    accountId,
  });
  return { ...result, tx };
}

function requireAccount(req, res) {
  return accountFromReq(req).then(acc => {
    if (!acc) {
      res.status(401).json({ error: 'Log in to use the shop. Guests cannot buy items.' });
      return null;
    }
    return acc;
  });
}

export function mountShop(app) {
  app.get('/api/shop', async (req, res) => {
    try {
      const acc = dbReady ? await accountFromReq(req) : null;
      const owned = acc ? await ownedItems(acc.id) : [];
      res.json({
        items: ITEMS,
        owned,
        equipped: acc ? { camo: acc.camo, rifle: acc.rifle, tag: acc.tag } : { ...DEFAULT_LOADOUT },
        paymentsEnabled: paymentsEnabled(),
        publicKey: paymentsEnabled() ? process.env.PAYSTACK_PUBLIC_KEY : null,
        devPurchases: devPurchasesEnabled(),
        guest: !acc,
      });
    } catch (err) {
      console.error('shop', err);
      res.status(500).json({ error: 'Could not load the shop.' });
    }
  });

  app.post('/api/shop/equip', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Shop is temporarily unavailable.' });
    const acc = await requireAccount(req, res);
    if (!acc) return;
    const item = getItem(String(req.body?.itemId || ''));
    if (!item) return res.status(400).json({ error: 'Unknown item.' });
    try {
      const owned = await ownedItems(acc.id);
      if (!isFree(item) && !owned.includes(item.id)) {
        return res.status(403).json({ error: 'You do not own that item.' });
      }
      const col = item.slot; // camo | rifle | tag
      if (!['camo', 'rifle', 'tag'].includes(col)) return res.status(400).json({ error: 'Cannot equip that.' });
      const { rows } = await query(
        `UPDATE accounts SET ${col} = $2 WHERE id = $1 RETURNING *`,
        [acc.id, item.id],
      );
      const nextOwned = owned.includes(item.id) || isFree(item) ? owned : owned.concat(item.id);
      if (isFree(item)) {
        await query(
          `INSERT INTO inventory (account_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [acc.id, item.id],
        );
      }
      res.json({ account: publicAccount(rows[0], nextOwned), equipped: { camo: rows[0].camo, rifle: rows[0].rifle, tag: rows[0].tag } });
    } catch (err) {
      console.error('equip', err);
      res.status(500).json({ error: 'Could not equip that item.' });
    }
  });

  app.post('/api/shop/pay', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Shop is temporarily unavailable.' });
    const acc = await requireAccount(req, res);
    if (!acc) return;
    if (!paymentsEnabled()) {
      return res.status(503).json({ error: 'Payments coming soon.', paymentsEnabled: false });
    }
    const ip = clientIp(req);
    if (!rateLimit(`pay:${acc.id}:${ip}`, 10, 15 * 60 * 1000)) return tooMany(res);
    const item = getItem(String(req.body?.itemId || ''));
    if (!item) return res.status(400).json({ error: 'Unknown item.' });
    if (isFree(item)) return res.status(400).json({ error: 'That item is free — just equip it.' });
    let email = (acc.email || String(req.body?.email || '').trim().toLowerCase()) || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Add a valid email to pay with Paystack.' });
    }
    try {
      const owned = await ownedItems(acc.id);
      if (owned.includes(item.id)) return res.status(409).json({ error: 'You already own that item.' });
      if (!acc.email && req.body?.email) {
        try {
          await query(`UPDATE accounts SET email = $2 WHERE id = $1 AND email IS NULL`, [acc.id, email]);
        } catch (err) {
          if (err.code === '23505') return res.status(409).json({ error: 'That email is already in use.' });
          throw err;
        }
      }
      const reference = `oba_${acc.id}_${item.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await query(
        `INSERT INTO payments (reference, account_id, item_id, amount_kobo, status) VALUES ($1, $2, $3, $4, 'pending')`,
        [reference, acc.id, item.id, item.priceKobo],
      );
      const init = await paystack('/transaction/initialize', {
        method: 'POST',
        body: {
          email,
          amount: item.priceKobo,
          currency: 'NGN',
          reference,
          callback_url: `${publicUrl(req)}/?shop=1`,
          metadata: { accountId: acc.id, itemId: item.id, itemName: item.name },
        },
      });
      const auth = init.data || {};
      res.json({
        reference,
        authorization_url: auth.authorization_url,
        access_code: auth.access_code,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      });
    } catch (err) {
      console.error('pay', err);
      res.status(502).json({ error: err.message || 'Could not start payment.' });
    }
  });

  app.get('/api/shop/verify', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Shop is temporarily unavailable.' });
    if (!paymentsEnabled()) return res.status(503).json({ error: 'Payments coming soon.' });
    const acc = await requireAccount(req, res);
    if (!acc) return;
    const reference = String(req.query.reference || req.query.trxref || '');
    if (!reference) return res.status(400).json({ error: 'Missing payment reference.' });
    try {
      const { rows } = await query(`SELECT * FROM payments WHERE reference = $1`, [reference]);
      const row = rows[0];
      if (row && row.account_id !== acc.id) return res.status(403).json({ error: 'That payment is not yours.' });
      const result = await verifyReference(reference);
      if (!result.ok) return res.status(400).json({ error: 'Payment is not complete yet.', reason: result.reason });
      const fresh = (await query(`SELECT * FROM accounts WHERE id = $1`, [acc.id])).rows[0];
      const owned = await ownedItems(acc.id);
      res.json({ ok: true, already: !!result.already, account: publicAccount(fresh, owned) });
    } catch (err) {
      console.error('verify', err);
      res.status(502).json({ error: err.message || 'Could not verify payment.' });
    }
  });

  // DEV-only fake purchase. Disabled in production and unless ALLOW_DEV_PURCHASES=1.
  app.post('/api/shop/dev-purchase', async (req, res) => {
    if (!devPurchasesEnabled()) return res.status(404).json({ error: 'Not found.' });
    if (!dbReady) return res.status(503).json({ error: 'Shop is temporarily unavailable.' });
    const acc = await requireAccount(req, res);
    if (!acc) return;
    const item = getItem(String(req.body?.itemId || ''));
    if (!item) return res.status(400).json({ error: 'Unknown item.' });
    try {
      await query(
        `INSERT INTO inventory (account_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [acc.id, item.id],
      );
      const fresh = (await query(`SELECT * FROM accounts WHERE id = $1`, [acc.id])).rows[0];
      const owned = await ownedItems(acc.id);
      res.json({ ok: true, account: publicAccount(fresh, owned) });
    } catch (err) {
      console.error('dev-purchase', err);
      res.status(500).json({ error: 'Could not grant the item.' });
    }
  });
}

export function paystackWebhookHandler(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const sig = req.headers['x-paystack-signature'];
  if (!secret || !verifyPaystackSignature(raw, sig, secret)) {
    return res.status(401).json({ error: 'Invalid signature.' });
  }
  res.status(200).json({ ok: true });
  let event;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { return; }
  const typ = event.event || event.type;
  if (typ !== 'charge.success') return;
  const tx = event.data || {};
  const reference = tx.reference;
  if (!reference) return;
  fulfillPayment(reference, {
    paystackId: String(tx.id || ''),
    amountKobo: Number(tx.amount),
    itemId: tx.metadata?.itemId,
    accountId: tx.metadata?.accountId ? Number(tx.metadata.accountId) : null,
  }).catch(err => console.error('webhook fulfill', err));
}
