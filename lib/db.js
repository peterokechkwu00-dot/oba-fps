// Thin Postgres wrapper. Render uses DATABASE_URL (internal). Local/tests fall back to PGlite.
import pg from 'pg';

let pool = null;
let lite = null;
export let dbReady = false;

function sslFor(url) {
  // External Render URLs need TLS; the private-network hostname does not.
  if (!url) return false;
  if (/\.internal(?:[:/]|$)/.test(url)) return false;
  if (/render\.com/.test(url)) return { rejectUnauthorized: false };
  return false;
}

export async function initDb() {
  const url = process.env.DATABASE_URL || '';
  if (url) {
    pool = new pg.Pool({ connectionString: url, max: 5, ssl: sslFor(url) });
    await pool.query('SELECT 1');
  } else if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    console.warn('DATABASE_URL is not set; accounts, progress and the shop are disabled');
    return;
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    lite = new PGlite();
    console.log('Database: in-memory PGlite (set DATABASE_URL for Postgres)');
  }
  await migrate();
  dbReady = true;
}

export async function query(text, params = []) {
  if (!pool && !lite) throw Object.assign(new Error('database is not configured'), { code: 'NO_DB' });
  if (pool) return pool.query(text, params);
  const r = await lite.query(text, params);
  return { rows: r.rows || [], rowCount: r.affectedRows ?? (r.rows ? r.rows.length : 0) };
}

export async function withTx(fn) {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const q = (text, params = []) => client.query(text, params);
      const result = await fn(q);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }
  // PGlite: run sequentially without a real transaction isolation, but still sequentially.
  await query('BEGIN');
  try {
    const result = await fn(query);
    await query('COMMIT');
    return result;
  } catch (err) {
    try { await query('ROLLBACK'); } catch {}
    throw err;
  }
}

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kills INT NOT NULL DEFAULT 0,
      deaths INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      matches INT NOT NULL DEFAULT 0,
      xp INT NOT NULL DEFAULT 0,
      camo TEXT NOT NULL DEFAULT 'camo_olive',
      rifle TEXT NOT NULL DEFAULT 'rifle_standard',
      tag TEXT NOT NULL DEFAULT 'tag_red'
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (LOWER(username))`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON accounts (LOWER(email)) WHERE email IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions (account_id)`);
  await query(`CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS inventory (
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, item_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      reference TEXT PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      amount_kobo INT NOT NULL,
      status TEXT NOT NULL,
      paystack_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS payments_account_id ON payments (account_id)`);
}

export function publicAccount(row, owned = null) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    kills: row.kills,
    deaths: row.deaths,
    wins: row.wins,
    matches: row.matches,
    xp: row.xp,
    level: 1 + Math.max(0, Math.floor((row.xp || 0) / 250)),
    camo: row.camo,
    rifle: row.rifle,
    tag: row.tag,
    owned: owned || undefined,
  };
}
