// Frontline FPS - game server: serves the static client and runs the realtime match over WebSockets.
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  getMap, listMaps, DEFAULT_MAP, rayMap,
  MAX_HP, MAX_ARMOUR, BODY_DMG, HEAD_DMG, FIRE_INTERVAL, RESPAWN_MS,
  EYE_HEIGHT, HEAD_Y, CHEST_Y, PLAYER_RADIUS, MAG_SIZE, RESERVE_AMMO, MAX_RESERVE,
  AMMO_GIVE, MED_HEAL, ARMOUR_GIVE, ARMOUR_ABSORB, REGEN_DELAY, REGEN_RATE,
  PICKUP_RADIUS, MED_RESPAWN, ARM_RESPAWN, AMMO_RESPAWN,
} from './public/shared/map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const WIN_KILLS = Number(process.env.WIN_KILLS) || 20;
const BOT_COUNT = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 3;
const TICK_HZ = 20;
const VOTE_MS = Number(process.env.VOTE_MS) || 15000;
const PICKUP_RESPAWN_MS = {
  med: Number(process.env.MED_RESPAWN) || MED_RESPAWN,
  armour: Number(process.env.ARM_RESPAWN) || ARM_RESPAWN,
  ammo: Number(process.env.AMMO_RESPAWN) || AMMO_RESPAWN,
};
const REGEN_DELAY_MS = Number(process.env.REGEN_DELAY) || REGEN_DELAY;
const REGEN_HP_S = Number(process.env.REGEN_RATE) || REGEN_RATE;

const app = express();
app.use('/vendor/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({
  ok: true,
  players: [...players.values()].filter(p => !p.bot).length,
  map: map.id,
  name: map.name,
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

const COLORS = ['#4f6b3a', '#6b5a3a', '#3a5a6b', '#5a3a3a', '#55553a', '#3a3a5a', '#6b4a2a', '#2f4f4f'];
const BOT_NAMES = ['Ghost', 'Soap', 'Price', 'Roach', 'Gaz', 'Nikolai', 'Yuri', 'Makarov'];
const players = new Map();
let nextId = 1;
let roundOver = false;
let roundEndsAt = 0;
let votes = new Map();
let voteOptionsArr = [];

let map, AABBS, SPAWNS, ARENA_HALF, pickups;

function applyMap(id) {
  map = getMap(id);
  AABBS = map.AABBS;
  SPAWNS = map.SPAWNS;
  ARENA_HALF = map.ARENA_HALF;
  pickups = map.PICKUPS.map((p, i) => ({ id: i, kind: p.kind, x: p.x, y: p.y || 0, z: p.z, up: true, respawnAt: 0 }));
}
applyMap(process.env.MAP || process.env.DEFAULT_MAP || DEFAULT_MAP);

const mapInfo = () => ({ id: map.id, name: map.name });
const pickupPayload = () => pickups.map(p => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, z: p.z, up: p.up }));
const voteChoices = () => listMaps().filter(m => m.id !== map.id);
const timers = () => ({ vote: VOTE_MS, med: PICKUP_RESPAWN_MS.med, armour: PICKUP_RESPAWN_MS.armour, ammo: PICKUP_RESPAWN_MS.ammo, regenDelay: REGEN_DELAY_MS, regenRate: REGEN_HP_S });
function voteCounts() {
  const counts = {};
  for (const o of voteOptionsArr) counts[o.id] = 0;
  for (const id of votes.values()) if (counts[id] !== undefined) counts[id]++;
  return counts;
}

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
    p: [0, 0, 0], yaw: 0, pitch: 0, hp: MAX_HP, armour: 0, ammo: MAG_SIZE, reserve: RESERVE_AMMO,
    alive: false, kills: 0, deaths: 0, seq: 0,
    lastShot: 0, respawnAt: 0, lastHurt: 0,
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
  p.yaw = Math.atan2(pick[0], pick[1]);
  p.pitch = 0; p.hp = MAX_HP; p.armour = 0; p.ammo = MAG_SIZE; p.alive = true; p.seq++; p.wp = null; p.lastHurt = Date.now();
  broadcast({ t: 'spawn', id: p.id, p: p.p, yaw: p.yaw, seq: p.seq, armour: 0, ammo: p.ammo, reserve: p.reserve });
}

function rayPoint(o, d, q) {
  const v = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  const t = Math.max(0, v[0] * d[0] + v[1] * d[1] + v[2] * d[2]);
  const c = [o[0] + d[0] * t - q[0], o[1] + d[1] * t - q[1], o[2] + d[2] * t - q[2]];
  return { dist: Math.hypot(...c), t };
}

function validateHit(shooter, target, o, d, claimHead) {
  const e = eye(shooter);
  if (Math.hypot(o[0] - e[0], o[1] - e[1], o[2] - e[2]) > 3) return null;
  let best = { dist: Infinity, t: 0 };
  for (let y = 0.2; y <= 1.7; y += 0.15) {
    const r = rayPoint(o, d, [target.p[0], target.p[1] + y, target.p[2]]);
    if (r.dist < best.dist) best = r;
  }
  const head = rayPoint(o, d, [target.p[0], target.p[1] + HEAD_Y, target.p[2]]);
  if (best.dist > 1.3 && head.dist > 1.0) return null;
  const tHit = Math.min(best.t, head.t);
  if (tHit > 150) return null;
  if (rayMap(o, d, AABBS) < tHit - 0.6) return null;
  return { head: !!claimHead && head.dist < 0.8 };
}

function damage(att, tgt, dmg, head) {
  if (!tgt.alive || roundOver) return;
  const raw = dmg;
  let leftover = dmg;
  if (tgt.armour > 0) {
    const absorb = Math.min(tgt.armour, Math.round(dmg * ARMOUR_ABSORB));
    tgt.armour -= absorb;
    leftover = dmg - absorb;
  }
  tgt.hp = Math.max(0, tgt.hp - leftover);
  tgt.lastHurt = Date.now();
  const kill = tgt.hp <= 0;
  send(att.ws, { t: 'hit', target: tgt.id, dmg: raw, head, kill });
  send(tgt.ws, { t: 'hurt', by: att.id, dmg: raw, hp: tgt.hp, armour: tgt.armour, from: att.p });
  if (!kill) return;
  tgt.alive = false; tgt.deaths++; tgt.respawnAt = Date.now() + RESPAWN_MS; tgt.armour = 0;
  if (att !== tgt) att.kills++;
  broadcast({ t: 'kill', killer: att.id, victim: tgt.id, head, kn: att.name, vn: tgt.name });
  sendRoster();
  if (att.kills >= WIN_KILLS) endRound(att);
}

function endRound(winner) {
  roundOver = true;
  votes = new Map();
  voteOptionsArr = voteChoices();
  const ms = VOTE_MS;
  roundEndsAt = Date.now() + ms;
  broadcast({ t: 'roundEnd', winner: winner.name, wid: winner.id, list: roster(), ms, maps: voteOptionsArr, current: mapInfo() });
  setTimeout(finishVote, ms);
}

function finishVote() {
  const counts = voteCounts();
  let best = -1, winners = [];
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) { best = n; winners = [id]; }
    else if (n === best) winners.push(id);
  }
  if (!winners.length) winners = voteOptionsArr.map(m => m.id);
  const next = winners[Math.floor(Math.random() * winners.length)];
  applyMap(next);
  roundOver = false;
  votes = new Map();
  voteOptionsArr = [];
  for (const p of players.values()) { p.kills = 0; p.deaths = 0; spawn(p); }
  broadcast({ t: 'roundStart', map: mapInfo(), pickups: pickupPayload() });
  sendRoster();
}

function grantPickup(p, pk, now) {
  if (pk.kind === 'med') {
    if (p.hp >= MAX_HP) return false;
    p.hp = Math.min(MAX_HP, p.hp + MED_HEAL);
  } else if (pk.kind === 'armour') {
    if (p.armour >= MAX_ARMOUR) return false;
    p.armour = Math.min(MAX_ARMOUR, p.armour + ARMOUR_GIVE);
  } else if (pk.kind === 'ammo') {
    if (p.reserve >= MAX_RESERVE) return false;
    p.reserve = Math.min(MAX_RESERVE, p.reserve + AMMO_GIVE);
  } else return false;
  pk.up = false;
  pk.respawnAt = now + (PICKUP_RESPAWN_MS[pk.kind] || 15000);
  send(p.ws, { t: 'got', kind: pk.kind, hp: p.hp, armour: p.armour, reserve: p.reserve, id: pk.id });
  broadcast({ t: 'pickup', id: pk.id, up: false, by: p.id, kind: pk.kind });
  return true;
}

function tickPickups(now) {
  for (const pk of pickups) {
    if (!pk.up) {
      if (now >= pk.respawnAt) { pk.up = true; broadcast({ t: 'pickup', id: pk.id, up: true }); }
      continue;
    }
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.p[0] - pk.x, p.p[2] - pk.z) > PICKUP_RADIUS) continue;
      if (Math.abs(p.p[1] - pk.y) > 1.6) continue;
      if (grantPickup(p, pk, now)) break;
    }
  }
}

function usefulPickup(b) {
  let best = null, bestD = 48;
  for (const pk of pickups) {
    if (!pk.up || pk.y > 0.6) continue;
    if (pk.kind === 'med' && b.hp >= MAX_HP) continue;
    if (pk.kind === 'armour' && b.armour >= MAX_ARMOUR) continue;
    if (pk.kind === 'ammo' && b.reserve >= MAX_RESERVE) continue;
    const d = Math.hypot(pk.x - b.p[0], pk.z - b.p[2]);
    if (d < bestD) { bestD = d; best = pk; }
  }
  return best;
}

function removePlayer(p) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  votes.delete(p.id);
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
      send(ws, {
        t: 'welcome', id: me.id, seq: me.seq, p: me.p, yaw: me.yaw, win: WIN_KILLS, list: roster(),
        roundOver, map: mapInfo(), pickups: pickupPayload(), maps: listMaps(),
        armour: me.armour, ammo: me.ammo, reserve: me.reserve, timers: timers(),
        vote: roundOver ? { maps: voteOptionsArr, ms: Math.max(0, roundEndsAt - Date.now()), counts: voteCounts() } : null,
      });
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
      if (num(m.reserve)) me.reserve = Math.max(0, Math.min(MAX_RESERVE, Math.round(m.reserve)));
      if (num(m.ammo)) me.ammo = Math.max(0, Math.min(MAG_SIZE, Math.round(m.ammo)));
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
    } else if (m.t === 'vote' && typeof m.map === 'string') {
      if (!roundOver) return;
      if (!voteOptionsArr.some(o => o.id === m.map)) return;
      votes.set(me.id, m.map);
      broadcast({ t: 'votes', counts: voteCounts(), n: votes.size });
    } else if (m.t === 'chat' && typeof m.msg === 'string') {
      const now = Date.now();
      me.chatTimes = (me.chatTimes || []).filter(t => now - t < 10000);
      if (me.chatTimes.length >= 6 || now - (me.chatTimes.at(-1) || 0) < 600) { send(ws, { t: 'chat', id: 0, name: '', msg: 'You are sending messages too fast.' }); return; }
      const msg = m.msg.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
      if (!msg) return;
      me.chatTimes.push(now);
      broadcast({ t: 'chat', id: me.id, name: me.name, msg });
    } else if (m.t === 'rtc') {
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
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
}
function hasLOS(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  return rayMap(a, d.map(v => v / len), AABBS) > len - 0.3;
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
    const pk = usefulPickup(b);
    if (pk) b.wp = [pk.x, pk.z];
    else if (!b.wp || Math.hypot(b.wp[0] - b.p[0], b.wp[1] - b.p[2]) < 1) b.wp = randomWaypoint();
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
    if (p.alive && !roundOver && p.hp < MAX_HP && now - p.lastHurt >= REGEN_DELAY_MS) {
      p.hp = Math.min(MAX_HP, p.hp + REGEN_HP_S * dt);
    }
    if (p.bot) updateBot(p, dt, now);
  }
  tickPickups(now);
  if (humans() === 0) return;
  broadcast({
    t: 's', ts: now,
    ps: [...players.values()].map(p => [p.id, round2(p.p[0]), round2(p.p[1]), round2(p.p[2]), round2(p.yaw), round2(p.pitch), Math.round(p.hp), Math.round(p.armour), p.alive ? 1 : 0]),
  });
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`Frontline FPS server listening on http://localhost:${PORT} (map: ${map.name}, bots: ${BOT_COUNT}, win: ${WIN_KILLS} kills)`));
