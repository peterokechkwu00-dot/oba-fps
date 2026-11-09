import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbReady, query, publicAccount } from './db.js';
import { ITEMS, DEFAULT_LOADOUT, isFree } from '../public/shared/catalog.js';
import { clientIp, rateLimit, tooMany } from './rateLimit.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE = 'sid';

function cookieSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function setSessionCookie(req, res, token) {
  const parts = [
    `${COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  ];
  if (cookieSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req, res) {
  const parts = [`${COOKIE}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (cookieSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

export async function accountFromCookie(header) {
  if (!dbReady) return null;
  const token = parseCookies(header)[COOKIE];
  if (!token || token.length < 16) return null;
  const { rows } = await query(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  return rows[0] || null;
}

export async function accountFromReq(req) {
  if (req.account) return req.account;
  req.account = await accountFromCookie(req.headers.cookie);
  return req.account;
}

async function grantStarters(accountId) {
  for (const item of ITEMS.filter(isFree)) {
    await query(
      `INSERT INTO inventory (account_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [accountId, item.id],
    );
  }
}

export async function ownedItems(accountId) {
  const { rows } = await query(`SELECT item_id FROM inventory WHERE account_id = $1`, [accountId]);
  return rows.map(r => r.item_id);
}

function normalizeUsername(v) {
  return String(v || '').trim();
}
function normalizeEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return s || null;
}

async function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (token, account_id, expires_at) VALUES ($1, $2, $3)`,
    [token, accountId, new Date(Date.now() + SESSION_MS)],
  );
  return token;
}

function noDb(res) {
  return res.status(503).json({ error: 'Accounts are temporarily unavailable.' });
}

export function mountAuth(app) {
  app.get('/api/auth/me', async (req, res) => {
    if (!dbReady) return res.json({ account: null, db: false });
    try {
      const acc = await accountFromReq(req);
      if (!acc) return res.json({ account: null, db: true });
      const owned = await ownedItems(acc.id);
      res.json({ account: publicAccount(acc, owned), db: true });
    } catch (err) {
      console.error('auth/me', err);
      res.status(500).json({ error: 'Could not load account.' });
    }
  });

  app.post('/api/auth/signup', async (req, res) => {
    if (!dbReady) return noDb(res);
    const ip = clientIp(req);
    if (!rateLimit(`signup:${ip}`, 5, 15 * 60 * 1000)) return tooMany(res);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const email = normalizeEmail(req.body?.email);
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–16 letters, numbers or underscores.' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be 8–72 characters.' });
    }
    if (email && !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'That email does not look valid.' });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await query(
        `INSERT INTO accounts (username, email, password_hash, camo, rifle, tag)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [username, email, hash, DEFAULT_LOADOUT.camo, DEFAULT_LOADOUT.rifle, DEFAULT_LOADOUT.tag],
      );
      const acc = rows[0];
      await grantStarters(acc.id);
      const token = await createSession(acc.id);
      setSessionCookie(req, res, token);
      const owned = await ownedItems(acc.id);
      res.status(201).json({ account: publicAccount(acc, owned) });
    } catch (err) {
      const msg = String(err.message || err);
      if (err.code === '23505' || /unique|duplicate/i.test(msg)) {
        if (/email/i.test(msg)) return res.status(409).json({ error: 'That email is already in use.' });
        return res.status(409).json({ error: 'That username is taken.' });
      }
      console.error('signup', err);
      res.status(500).json({ error: 'Could not create the account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!dbReady) return noDb(res);
    const ip = clientIp(req);
    if (!rateLimit(`login:${ip}`, 8, 15 * 60 * 1000)) return tooMany(res);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });
    try {
      const { rows } = await query(`SELECT * FROM accounts WHERE LOWER(username) = LOWER($1)`, [username]);
      const acc = rows[0];
      const ok = acc && await bcrypt.compare(password, acc.password_hash);
      if (!ok) return res.status(401).json({ error: 'Wrong username or password.' });
      const token = await createSession(acc.id);
      setSessionCookie(req, res, token);
      const owned = await ownedItems(acc.id);
      res.json({ account: publicAccount(acc, owned) });
    } catch (err) {
      console.error('login', err);
      res.status(500).json({ error: 'Could not log in.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    if (dbReady) {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) {
        try { await query(`DELETE FROM sessions WHERE token = $1`, [token]); } catch (err) { console.error('logout', err); }
      }
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', async (_req, res) => {
    if (!dbReady) return res.json({ list: [], db: false });
    try {
      const { rows } = await query(
        `SELECT username, kills, deaths, wins, matches, xp, camo, rifle, tag
         FROM accounts ORDER BY xp DESC, kills DESC, wins DESC, username ASC LIMIT 20`,
      );
      res.json({
        list: rows.map((r, i) => ({
          rank: i + 1,
          username: r.username,
          kills: r.kills,
          deaths: r.deaths,
          wins: r.wins,
          matches: r.matches,
          xp: r.xp,
          level: 1 + Math.max(0, Math.floor((r.xp || 0) / 250)),
        })),
        db: true,
      });
    } catch (err) {
      console.error('leaderboard', err);
      res.status(500).json({ error: 'Could not load the leaderboard.' });
    }
  });
}
