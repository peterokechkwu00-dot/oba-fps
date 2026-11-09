import { dbReady, query } from './db.js';
import { XP_KILL, XP_WIN, levelFromXp } from '../public/shared/catalog.js';

export { XP_KILL, XP_WIN, levelFromXp };

export async function recordKill(accountId) {
  if (!dbReady || !accountId) return;
  try {
    await query(`UPDATE accounts SET kills = kills + 1, xp = xp + $2 WHERE id = $1`, [accountId, XP_KILL]);
  } catch (err) { console.error('recordKill', err); }
}

export async function recordDeath(accountId) {
  if (!dbReady || !accountId) return;
  try {
    await query(`UPDATE accounts SET deaths = deaths + 1 WHERE id = $1`, [accountId]);
  } catch (err) { console.error('recordDeath', err); }
}

export async function recordMatch(winnerAccountId, participantIds) {
  if (!dbReady) return;
  const ids = [...new Set((participantIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    for (const id of ids) {
      const xp = id === winnerAccountId ? XP_WIN : 0;
      const win = id === winnerAccountId ? 1 : 0;
      await query(
        `UPDATE accounts SET matches = matches + 1, wins = wins + $2, xp = xp + $3 WHERE id = $1`,
        [id, win, xp],
      );
    }
  } catch (err) { console.error('recordMatch', err); }
}
