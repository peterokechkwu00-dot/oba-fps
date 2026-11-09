// Auth, XP/progress, Paystack verify + webhook signature + idempotency.
import http from 'http';
import crypto from 'crypto';
import { spawn as spawnProc } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[account]', ...a);
let ok = true;
const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); if (!cond) ok = false; };

function waitListen(child, ms = 12000) {
  return new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('server start timeout: ' + buf)), ms);
    const on = d => { buf += d; if (/listening/.test(buf)) { clearTimeout(t); res(); } };
    child.stdout.on('data', on);
    child.stderr.on('data', on);
    child.on('exit', code => { clearTimeout(t); rej(new Error(`server exited ${code}: ${buf}`)); });
  });
}

async function withServer(env, fn) {
  const port = Number(env.PORT);
  const child = spawnProc('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOTS: '0',
      DATABASE_URL: '',
      PAYSTACK_SECRET_KEY: '',
      PAYSTACK_PUBLIC_KEY: '',
      ALLOW_DEV_PURCHASES: '',
      NODE_ENV: 'test',
      ...env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitListen(child);
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    try { child.kill('SIGKILL'); } catch {}
  }
}

async function req(base, path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const rawCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie().join(',')
    : (res.headers.get('set-cookie') || '');
  const sid = rawCookie.match(/sid=([^;]+)/)?.[1];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: sid ? `sid=${sid}` : cookie || '', rawCookie };
}

function wsClient(url, name, cookie) {
  const ws = new WebSocket(url, { headers: cookie ? { Cookie: cookie } : {} });
  const c = { ws, name, msgs: [], seq: 0, id: 0, waiters: [] };
  ws.on('message', d => {
    const m = JSON.parse(d); c.msgs.push(m);
    if (m.t === 'welcome') { c.id = m.id; c.seq = m.seq; }
    if (m.t === 'spawn' && m.id === c.id) c.seq = m.seq;
    c.waiters = c.waiters.filter(w => (w.f(m) ? (w.res(m), false) : true));
  });
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (f, ms = 6000) => new Promise((res, rej) => {
    const old = c.msgs.find(f); if (old) return res(old);
    c.waiters.push({ f, res });
    setTimeout(() => rej(new Error(`${name}: timeout waiting`)), ms);
  });
  c.open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return c;
}

function startMockPaystack(port, grant) {
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer sk_test_dummy')) {
      res.statusCode = 401; res.end(JSON.stringify({ status: false, message: 'Invalid key' }));
      return;
    }
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/transaction/initialize') {
        const j = JSON.parse(raw || '{}');
        grant.lastInit = j;
        grant.byRef = grant.byRef || {};
        grant.byRef[j.reference] = {
          itemId: j.metadata?.itemId,
          amount: j.amount,
          accountId: j.metadata?.accountId,
        };
        res.end(JSON.stringify({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/mock', access_code: 'acc', reference: j.reference },
        }));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/transaction/verify/')) {
        const reference = decodeURIComponent(req.url.split('/').pop());
        const rec = (grant.byRef && grant.byRef[reference]) || {};
        const itemId = rec.itemId || grant.itemId || 'camo_eagles';
        const amount = rec.amount || grant.amountKobo || 50000;
        const accountId = rec.accountId || grant.accountId;
        res.end(JSON.stringify({
          status: true,
          data: {
            status: grant.txStatus || 'success',
            amount,
            id: 4242,
            reference,
            metadata: { accountId, itemId },
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ status: false, message: 'not found' }));
    });
  });
  return new Promise(res => server.listen(port, '127.0.0.1', () => res(server)));
}

log('--- auth, shop (no keys), progress ---');
await withServer({ PORT: 3197, BOTS: 0, WIN_KILLS: 1, MAP: 'oba' }, async (base) => {
  const health = await req(base, '/health');
  check(health.status === 200 && health.data.db === true && health.data.payments === false, 'health reports db ready, payments off');

  const bad = await req(base, '/api/auth/signup', { method: 'POST', body: { username: 'ab', password: 'short' } });
  check(bad.status === 400, 'signup rejects short username/password');

  const su = await req(base, '/api/auth/signup', { method: 'POST', body: { username: 'Soap_01', password: 'secret123', email: 'soap@example.com' } });
  check(su.status === 201 && su.data.account?.username === 'Soap_01' && su.cookie.startsWith('sid='), `signup sets session cookie (status ${su.status})`);
  check(su.data.account.level === 1 && su.data.account.xp === 0 && su.data.account.owned?.includes('camo_olive'), 'new account starts at level 1 with free items');

  const dupe = await req(base, '/api/auth/signup', { method: 'POST', body: { username: 'soap_01', password: 'secret1234' } });
  check(dupe.status === 409, 'duplicate username is rejected');

  const me = await req(base, '/api/auth/me', { cookie: su.cookie });
  check(me.status === 200 && me.data.account?.username === 'Soap_01', 'session cookie authenticates /api/auth/me');

  await req(base, '/api/auth/logout', { method: 'POST', cookie: su.cookie });
  const after = await req(base, '/api/auth/me', { cookie: su.cookie });
  check(!after.data.account, 'logout clears the session');

  const li = await req(base, '/api/auth/login', { method: 'POST', body: { username: 'Soap_01', password: 'secret123' } });
  check(li.status === 200 && li.cookie.startsWith('sid='), 'login issues a new session');
  const wrong = await req(base, '/api/auth/login', { method: 'POST', body: { username: 'Soap_01', password: 'nope-nope' } });
  check(wrong.status === 401, 'wrong password is rejected');

  let limited = false;
  for (let i = 0; i < 10; i++) {
    const r = await req(base, '/api/auth/login', { method: 'POST', body: { username: 'brute', password: 'wrongpass' } });
    if (r.status === 429) { limited = true; break; }
  }
  check(limited, 'login is rate-limited after repeated attempts');

  const shop = await req(base, '/api/shop', { cookie: li.cookie });
  check(shop.status === 200 && shop.data.paymentsEnabled === false, 'shop renders with payments coming soon (no keys)');
  const pay = await req(base, '/api/shop/pay', { method: 'POST', body: { itemId: 'camo_eagles' }, cookie: li.cookie });
  check(pay.status === 503 && /coming soon/i.test(pay.data.error || ''), `pay without keys: ${pay.status} ${pay.data.error}`);

  const guestPay = await req(base, '/api/shop/pay', { method: 'POST', body: { itemId: 'camo_eagles' } });
  check(guestPay.status === 401, 'guests cannot buy');

  const eq = await req(base, '/api/shop/equip', { method: 'POST', body: { itemId: 'camo_olive' }, cookie: li.cookie });
  check(eq.status === 200 && eq.data.equipped?.camo === 'camo_olive', 'can equip a free starter camo');
  const deny = await req(base, '/api/shop/equip', { method: 'POST', body: { itemId: 'camo_gold' }, cookie: li.cookie });
  check(deny.status === 403, 'cannot equip a paid item that is not owned');

  const dev = await req(base, '/api/shop/dev-purchase', { method: 'POST', body: { itemId: 'camo_gold' }, cookie: li.cookie });
  check(dev.status === 404, 'dev-purchase is disabled without ALLOW_DEV_PURCHASES');

  // Progress: logged-in player gets a kill and wins the round (WIN_KILLS=1)
  const wsUrl = base.replace('http', 'ws') + '/ws';
  const a = wsClient(wsUrl, 'Soap_01', li.cookie);
  const b = wsClient(wsUrl, 'Bravo');
  await Promise.all([a.open, b.open]);
  a.send({ t: 'join', name: 'ignored' });
  b.send({ t: 'join', name: 'Bravo' });
  const wa = await a.wait(m => m.t === 'welcome');
  await b.wait(m => m.t === 'welcome');
  check(wa.cosmetics?.camo === 'camo_olive' && a.id, `logged-in join uses account cosmetics (${wa.cosmetics?.camo})`);

  const A = [-2, 0, -1.5], Bpos = [10, 0, -1.5];
  const pos = (c, p, yaw) => c.send({ t: 'st', p, yaw, pitch: 0, seq: c.seq });
  for (let i = 0; i < 10; i++) { pos(a, A, -Math.PI / 2); pos(b, Bpos, Math.PI / 2); await sleep(35); }
  const o = [A[0], 1.6, A[2]], target = [Bpos[0], 1.15, Bpos[2]];
  const d = target.map((v, i) => v - o[i]); const L = Math.hypot(...d); const dir = d.map(v => v / L);
  for (let i = 0; i < 8; i++) {
    pos(a, A, -Math.PI / 2); pos(b, Bpos, Math.PI / 2);
    a.send({ t: 'shoot', o, d: dir, e: target, hit: b.id, head: false });
    await sleep(130);
    if (a.msgs.some(m => m.t === 'roundEnd')) break;
  }
  await a.wait(m => m.t === 'kill' && m.victim === b.id, 4000).catch(() => null);
  await sleep(250);
  const prof = await req(base, '/api/auth/me', { cookie: li.cookie });
  const acc = prof.data.account || {};
  check(acc.kills >= 1 && acc.xp >= 50, `kill grants XP (kills=${acc.kills}, xp=${acc.xp})`);
  check(acc.wins >= 1 && acc.matches >= 1 && acc.xp >= 250, `win grants match + 200 XP (wins=${acc.wins}, matches=${acc.matches}, xp=${acc.xp})`);
  const board = await req(base, '/api/leaderboard');
  check(board.data.list?.[0]?.username === 'Soap_01' && board.data.list[0].xp === acc.xp, 'leaderboard ranks the player by XP');
  a.ws.close(); b.ws.close();
});

log('--- Paystack verify, webhook, idempotency ---');
const grant = { itemId: 'camo_eagles', amountKobo: 50000, txStatus: 'success', accountId: null };
const mock = await startMockPaystack(3196, grant);
await withServer({
  PORT: 3195, BOTS: 0,
  PAYSTACK_SECRET_KEY: 'sk_test_dummy',
  PAYSTACK_PUBLIC_KEY: 'pk_test_dummy',
  PAYSTACK_API_BASE: 'http://127.0.0.1:3196',
  ALLOW_DEV_PURCHASES: '1',
  NODE_ENV: 'test',
}, async (base) => {
  const su = await req(base, '/api/auth/signup', { method: 'POST', body: { username: 'Price', password: 'secret123', email: 'price@example.com' } });
  check(su.status === 201, 'signup on payments server');
  grant.accountId = su.data.account.id;
  const cookie = su.cookie;

  const shop = await req(base, '/api/shop', { cookie });
  check(shop.data.paymentsEnabled === true && shop.data.publicKey === 'pk_test_dummy', 'shop exposes public key when configured');

  const start = await req(base, '/api/shop/pay', { method: 'POST', body: { itemId: 'camo_eagles' }, cookie });
  check(start.status === 200 && start.data.authorization_url && start.data.reference, `initialize returns authorization_url (${start.status})`);
  const reference = start.data.reference;

  const v1 = await req(base, '/api/shop/verify?reference=' + encodeURIComponent(reference), { cookie });
  check(v1.status === 200 && v1.data.ok && v1.data.account.owned.includes('camo_eagles'), 'verify grants the item after a successful Paystack charge');
  const v2 = await req(base, '/api/shop/verify?reference=' + encodeURIComponent(reference), { cookie });
  check(v2.status === 200 && v2.data.already === true, 'second verify is idempotent');
  const ownedOnce = (v2.data.account.owned || []).filter(id => id === 'camo_eagles').length;
  check(ownedOnce === 1, 'inventory has the item once after two verifies');

  // New payment + webhook signature
  const start2 = await req(base, '/api/shop/pay', { method: 'POST', body: { itemId: 'camo_tan' }, cookie });
  const ref2 = start2.data.reference;
  check(!!ref2, 'second initialize (tan camo)');
  const payload = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: ref2,
      amount: 50000,
      id: 99,
      metadata: { accountId: grant.accountId, itemId: 'camo_tan' },
    },
  });
  const badHook = await fetch(base + '/api/paystack/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': '00'.repeat(64) },
    body: payload,
  });
  check(badHook.status === 401, 'webhook rejects a bad HMAC signature');
  const sig = crypto.createHmac('sha512', 'sk_test_dummy').update(payload).digest('hex');
  const goodHook = await fetch(base + '/api/paystack/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': sig },
    body: payload,
  });
  check(goodHook.status === 200, 'webhook accepts a valid HMAC SHA512 signature');
  await sleep(150);
  const afterHook = await req(base, '/api/auth/me', { cookie });
  check(afterHook.data.account.owned.includes('camo_tan'), 'webhook grants the item after verified success');

  // Webhook again + verify = still one copy
  await fetch(base + '/api/paystack/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': sig },
    body: payload,
  });
  const v3 = await req(base, '/api/shop/verify?reference=' + encodeURIComponent(ref2), { cookie });
  check(v3.status === 200 && v3.data.already === true, `verify after webhook is idempotent (${v3.status} ${v3.data.error || v3.data.reason || ''})`);
  const owned = v3.data.account?.owned || afterHook.data.account?.owned || [];
  const countTan = owned.filter(id => id === 'camo_tan').length;
  check(countTan === 1, 'tan camo appears once after webhook + verify');

  const fake = await req(base, '/api/shop/dev-purchase', { method: 'POST', body: { itemId: 'rifle_gold' }, cookie });
  check(fake.status === 200 && fake.data.account.owned.includes('rifle_gold'), 'dev-purchase works only when ALLOW_DEV_PURCHASES=1 (non-production)');
});
mock.close();

{
  const prevN = process.env.NODE_ENV, prevA = process.env.ALLOW_DEV_PURCHASES;
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_DEV_PURCHASES = '1';
  const { devPurchasesEnabled } = await import('../lib/shop.js');
  check(devPurchasesEnabled() === false, 'dev-purchase is disabled in production even if ALLOW_DEV_PURCHASES=1');
  process.env.NODE_ENV = prevN;
  process.env.ALLOW_DEV_PURCHASES = prevA;
}

log(ok ? 'ALL ACCOUNT TESTS PASSED' : 'SOME ACCOUNT TESTS FAILED');
process.exit(ok ? 0 : 1);
