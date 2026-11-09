// Frontline FPS - game server: serves the static client and runs the realtime match over WebSockets.
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  ARENA_HALF, AABBS, SPAWNS, MAX_HP, BODY_DMG, HEAD_DMG, FIRE_INTERVAL, RESPAWN_MS,
  EYE_HEIGHT, HEAD_Y, CHEST_Y, PLAYER_RADIUS, rayMap,
} from './public/shared/map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const WIN_KILLS = Number(process.env.WIN_KILLS) || 20;
const BOT_COUNT = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 3;
const TICK_HZ = 20;
const ROUND_RESET_MS = 8000;

const app = express();
app.use('/vendor/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, players: [...players.values()].filter(p => !p.bot).length }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

const COLORS = ['#4f6b3a', '#6b5a3a', '#3a5a6b', '#5a3a3a', '#55553a', '#3a3a5a', '#6b4a2a', '#2f4f4f'];
const BOT_NAMES = ['Ghost', 'Soap', 'Price', 'Roach', 'Gaz', 'Nikolai', 'Yuri', 'Makarov'];
const players = new Map();
let nextId = 1;
let roundOver = false;
let roundEndsAt = 0;

const round2 = v => Math.round(v * 100) / 100;
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
function broadcast(m, except) {
  const s = JSON.stringify(m);
  for (const p of players.values()) if (p.ws && p !== except && p.ws.readyState === 1) p.ws.send(s);
}
const roster = () => [...players.values()].map(p => ({ id: p.id, name: p.name, k: p.kills, d: p.deaths, bot: !!p.bot, c: p.color, talk: !!p.talking }));
const sendRoster = () => broadcast({ t: 'roster', list: roster(), win: WIN_KILLS });
const humans = () => [...players.values()].filter(p => !p.bot).length;
const eye = p => [p.p[0], p.p[1] + EYE_HEIGHT, p.p[2]];

function sanitizeName(n, id) {
  const s = String(n || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16);
  return s || `Soldier${id}`;
}

function createPlayer(name, ws, bot = false) {
  const id = nextId++;
  const p = {
    id, ws, bot, name: bot ? `[BOT] ${name}` : sanitizeName(name, id), color: COLORS[id % COLORS.length],
    p: [0, 0, 0], yaw: 0, pitch: 0, hp: MAX_HP, alive: false, kills: 0, deaths: 0, seq: 0,
    lastShot: 0, respawnAt: 0,
    // bot brain
    wp: null, nextShot: 0, seenAt: 0, strafe: 1,
  };
  players.set(id, p);
  spawn(p);
  return p;
}

function spawn(p) {
  const others = [...players.values()].filter(o => o !== p && o.alive);
  const scored = SPAWNS.map(s => ({ s, d: others.length ? Math.min(...others.map(o => Math.hypot(o.p[0] - s[0], o.p[2] - s[1]))) : Math.random() * 100 }))
    .sort((a, b) => b.d - a.d);
  const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
  p.p = [pick[0], 0, pick[1]];
  p.yaw = Math.atan2(pick[0], pick[1]); // face the centre
  p.pitch = 0; p.hp = MAX_HP; p.alive = true; p.seq++; p.wp = null;
  broadcast({ t: 'spawn', id: p.id, p: p.p, yaw: p.yaw, seq: p.seq });
}

// Shortest distance between a ray (o + t*d, t>=0) and a point; also returns t.
function rayPoint(o, d, q) {
  const v = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  const t = Math.max(0, v[0] * d[0] + v[1] * d[1] + v[2] * d[2]);
  const c = [o[0] + d[0] * t - q[0], o[1] + d[1] * t - q[1], o[2] + d[2] * t - q[2]];
  return { dist: Math.hypot(...c), t };
}

// Loose server-side validation of a client-reported hit.
function validateHit(shooter, target, o, d, claimHead) {
  const e = eye(shooter);
  if (Math.hypot(o[0] - e[0], o[1] - e[1], o[2] - e[2]) > 3) return null; // shot must originate near shooter
  let best = { dist: Infinity, t: 0 };
  for (let y = 0.2; y <= 1.7; y += 0.15) {
    const r = rayPoint(o, d, [target.p[0], target.p[1] + y, target.p[2]]);
    if (r.dist < best.dist) best = r;
  }
  const head = rayPoint(o, d, [target.p[0], target.p[1] + HEAD_Y, target.p[2]]);
  if (best.dist > 1.3 && head.dist > 1.0) return null;           // generous tolerance for latency
  const tHit = Math.min(best.t, head.t);
  if (tHit > 150) return null;
  if (rayMap(o, d) < tHit - 0.6) return null;                       // blocked by a wall
  return { head: !!claimHead && head.dist < 0.8 };
}

function damage(att, tgt, dmg, head) {
  if (!tgt.alive || roundOver) return;
  tgt.hp = Math.max(0, tgt.hp - dmg);
  const kill = tgt.hp <= 0;
  send(att.ws, { t: 'hit', target: tgt.id, dmg, head, kill });
  send(tgt.ws, { t: 'hurt', by: att.id, dmg, hp: tgt.hp, from: att.p });
  if (!kill) return;
  tgt.alive = false; tgt.deaths++; tgt.respawnAt = Date.now() + RESPAWN_MS;
  if (att !== tgt) att.kills++;
  broadcast({ t: 'kill', killer: att.id, victim: tgt.id, head, kn: att.name, vn: tgt.name });
  sendRoster();
  if (att.kills >= WIN_KILLS) endRound(att);
}

function endRound(winner) {
  roundOver = true;
  roundEndsAt = Date.now() + ROUND_RESET_MS;
  broadcast({ t: 'roundEnd', winner: winner.name, wid: winner.id, list: roster(), ms: ROUND_RESET_MS });
  setTimeout(() => {
    roundOver = false;
    for (const p of players.values()) { p.kills = 0; p.deaths = 0; spawn(p); }
    broadcast({ t: 'roundStart' });
    sendRoster();
  }, ROUND_RESET_MS);
}

function removePlayer(p) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  broadcast({ t: 'leave', id: p.id });
  broadcast({ t: 'feed', msg: `${p.name} left` });
  sendRoster();
}

const num = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = v => Array.isArray(v) && v.length === 3 && v.every(num);

wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'join') {
      if (me) return;
      me = createPlayer(m.name, ws);
      send(ws, { t: 'welcome', id: me.id, seq: me.seq, p: me.p, yaw: me.yaw, win: WIN_KILLS, list: roster(), roundOver });
      broadcast({ t: 'feed', msg: `${me.name} joined` }, me);
      sendRoster();
      return;
    }
    if (!me) return;
    if (m.t === 'st') {
      if (!me.alive || m.seq !== me.seq || !vec3(m.p) || !num(m.yaw) || !num(m.pitch)) return;
      const L = ARENA_HALF - PLAYER_RADIUS;
      me.p = [Math.max(-L, Math.min(L, m.p[0])), Math.max(0, Math.min(20, m.p[1])), Math.max(-L, Math.min(L, m.p[2]))];
      me.yaw = m.yaw; me.pitch = Math.max(-1.6, Math.min(1.6, m.pitch));
    } else if (m.t === 'shoot') {
      const now = Date.now();
      if (!me.alive || roundOver || now - me.lastShot < FIRE_INTERVAL * 0.8) return;
      if (!vec3(m.o) || !vec3(m.d) || !vec3(m.e)) return;
      me.lastShot = now;
      const len = Math.hypot(...m.d) || 1;
      const d = m.d.map(v => v / len);
      broadcast({ t: 'shot', id: me.id, o: m.o.map(round2), e: m.e.map(round2) }, me);
      if (m.hit) {
        const tgt = players.get(m.hit);
        if (tgt && tgt !== me && tgt.alive) {
          const v = validateHit(me, tgt, m.o, d, m.head);
          if (v) damage(me, tgt, v.head ? HEAD_DMG : BODY_DMG, v.head);
        }
      }
    } else if (m.t === 'chat' && typeof m.msg === 'string') {
      // rate limit: >= 600 ms apart and at most 6 messages per 10 s
      const now = Date.now();
      me.chatTimes = (me.chatTimes || []).filter(t => now - t < 10000);
      if (me.chatTimes.length >= 6 || now - (me.chatTimes.at(-1) || 0) < 600) { send(ws, { t: 'chat', id: 0, name: '', msg: 'You are sending messages too fast.' }); return; }
      const msg = m.msg.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
      if (!msg) return;
      me.chatTimes.push(now);
      broadcast({ t: 'chat', id: me.id, name: me.name, msg });
    } else if (m.t === 'rtc') {
      // WebRTC signalling relay (SDP offers/answers + ICE candidates) between human players
      const to = players.get(m.to);
      if (to && to.ws && to !== me && m.data && typeof m.data === 'object') send(to.ws, { t: 'rtc', from: me.id, data: m.data });
    } else if (m.t === 'talk') {
      me.talking = !!m.on;
      broadcast({ t: 'talk', id: me.id, on: me.talking }, me);
    }
  });
  ws.on('close', () => { if (me) removePlayer(me); });
  ws.on('error', () => {});
});

// ---------- Bots ----------
function botBlocked(x, z) {
  const r = PLAYER_RADIUS + 0.1;
  if (Math.abs(x) > ARENA_HALF - 1 || Math.abs(z) > ARENA_HALF - 1) return true;
  for (const a of AABBS) {
    if (a.min[1] > 1) continue;
    if (x + r > a.min[0] && x - r < a.max[0] && z + r > a.min[2] && z - r < a.max[2]) return true;
  }
  return false;
}
function randomWaypoint() {
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() * 2 - 1) * 36, z = (Math.random() * 2 - 1) * 36;
    if (!botBlocked(x, z)) return [x, z];
  }
  return [0, 30];
}
function hasLOS(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  return rayMap(a, d.map(v => v / len)) > len - 0.3;
}
function updateBot(b, dt, now) {
  if (!b.alive || roundOver || humans() === 0) return;
  const e = eye(b);
  let target = null, best = 45;
  for (const o of players.values()) {
    if (o === b || !o.alive) continue;
    const c = [o.p[0], o.p[1] + CHEST_Y, o.p[2]];
    const dist = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
    if (dist < best && hasLOS(e, c)) { best = dist; target = o; }
  }
  let mx = 0, mz = 0, speed = 4.2;
  if (target) {
    const dx = target.p[0] - b.p[0], dz = target.p[2] - b.p[2];
    b.yaw = Math.atan2(-dx, -dz);
    b.pitch = Math.atan2(target.p[1] - b.p[1], Math.hypot(dx, dz));
    if (!b.seenAt) b.seenAt = now;
    // strafe
    if (Math.random() < 0.02) b.strafe *= -1;
    mx = Math.cos(b.yaw) * b.strafe; mz = -Math.sin(b.yaw) * b.strafe; speed = 2.5;
    if (now - b.seenAt > 650 && now > b.nextShot) {
      b.nextShot = now + 380 + Math.random() * 520;
      const c = [target.p[0], target.p[1] + CHEST_Y, target.p[2]];
      const hit = Math.random() < Math.max(0.12, 0.42 - best / 100);
      const end = hit ? c : [c[0] + (Math.random() - 0.5) * 3, c[1] + (Math.random() - 0.3) * 2, c[2] + (Math.random() - 0.5) * 3];
      broadcast({ t: 'shot', id: b.id, o: e.map(round2), e: end.map(round2) });
      if (hit) { const head = Math.random() < 0.12; damage(b, target, head ? HEAD_DMG : BODY_DMG, head); }
    }
  } else {
    b.seenAt = 0;
    if (!b.wp || Math.hypot(b.wp[0] - b.p[0], b.wp[1] - b.p[2]) < 1) b.wp = randomWaypoint();
    const dx = b.wp[0] - b.p[0], dz = b.wp[1] - b.p[2], l = Math.hypot(dx, dz) || 1;
    mx = dx / l; mz = dz / l;
    b.yaw = Math.atan2(-mx, -mz); b.pitch = 0;
  }
  const nx = b.p[0] + mx * speed * dt, nz = b.p[2] + mz * speed * dt;
  if (!botBlocked(nx, nz)) { b.p[0] = nx; b.p[2] = nz; }
  else if (!botBlocked(nx, b.p[2])) b.p[0] = nx;
  else if (!botBlocked(b.p[0], nz)) b.p[2] = nz;
  else { b.wp = randomWaypoint(); b.strafe *= -1; }
}
for (let i = 0; i < BOT_COUNT; i++) createPlayer(BOT_NAMES[i % BOT_NAMES.length], null, true);

// ---------- Main loop ----------
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const p of players.values()) {
    if (!p.alive && !roundOver && now >= p.respawnAt) spawn(p);
    if (p.bot) updateBot(p, dt, now);
  }
  if (humans() === 0) return;
  broadcast({
    t: 's', ts: now,
    ps: [...players.values()].map(p => [p.id, round2(p.p[0]), round2(p.p[1]), round2(p.p[2]), round2(p.yaw), round2(p.pitch), p.hp, p.alive ? 1 : 0]),
  });
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`Frontline FPS server listening on http://localhost:${PORT} (bots: ${BOT_COUNT}, win: ${WIN_KILLS} kills)`));
