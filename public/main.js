// Frontline: Oba — browser client
import * as THREE from 'three';
import {
  MAP_NAME, AABBS, ARENA_HALF, PLAYER_RADIUS as R, PLAYER_HEIGHT as H, EYE_HEIGHT, MAX_HP,
  FIRE_INTERVAL, MAG_SIZE, RESERVE_AMMO, RELOAD_MS, RESPAWN_MS,
} from './shared/map.js';
import { buildWorld } from './world.js';
import { Soldier } from './avatar.js';
import * as sfx from './audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
for (const id of ['mapname', 'menumap', 'sbmap']) $(id).textContent = MAP_NAME;
$('name').value = localStorage.getItem('fps-name') || '';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('autojoin') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BASE_FOV = 75, ADS_FOV = 50;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
const { colliders } = buildWorld(scene, renderer);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- First-person weapon (view model) ----------
const gun = new THREE.Group();
{
  const metal = new THREE.MeshLambertMaterial({ color: '#2b2b2b' }), wood = new THREE.MeshLambertMaterial({ color: '#6b4a2a' });
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); gun.add(me); return me; };
  add(new THREE.BoxGeometry(0.07, 0.09, 0.42), metal, 0, 0, -0.05);
  add(new THREE.BoxGeometry(0.075, 0.07, 0.22), wood, 0, -0.01, -0.3);          // handguard
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8).rotateX(Math.PI / 2), metal, 0, 0.015, -0.5);
  add(new THREE.BoxGeometry(0.05, 0.16, 0.07), metal, 0, -0.11, -0.12).rotation.x = 0.35; // curved mag
  add(new THREE.BoxGeometry(0.045, 0.11, 0.05), wood, 0, -0.09, 0.06).rotation.x = -0.3;  // grip
  add(new THREE.BoxGeometry(0.06, 0.08, 0.22), wood, 0, -0.03, 0.25);            // stock
  add(new THREE.BoxGeometry(0.02, 0.035, 0.02), metal, 0, 0.06, -0.42);          // front sight
  add(new THREE.BoxGeometry(0.04, 0.03, 0.03), metal, 0, 0.055, 0.08);           // rear sight
}
const muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
muzzleFlash.position.set(0, 0.015, -0.66); muzzleFlash.visible = false; gun.add(muzzleFlash);
const muzzleLight = new THREE.PointLight('#ffbb55', 0, 8); muzzleLight.position.set(0, 0.02, -0.7); gun.add(muzzleLight);
const HIP = new THREE.Vector3(0.2, -0.21, -0.45), ADS = new THREE.Vector3(0, -0.068, -0.32);
gun.scale.setScalar(0.8); gun.position.copy(HIP); camera.add(gun);

// ---------- State ----------
const me = {
  id: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, hp: MAX_HP, alive: false, seq: 0,
  ammo: MAG_SIZE, reserve: RESERVE_AMMO, reloading: false, reloadEnd: 0, lastShot: 0, recoil: 0, stepT: 0,
};
const keys = {}; let mouseDown = false, aiming = false, locked = false, joined = false, ws = null;
let roster = [], winKills = 20, roundOver = false, deathTimer = 0, roundTimerEnd = 0;
const remotes = new Map(); // id -> { s: Soldier, buf: [], speed, last: Vector3 }
const nameOf = id => (roster.find(r => r.id === id) || {}).name || `#${id}`;

// ---------- Networking ----------
function connect(name) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  $('status').textContent = 'Connecting…';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onclose = () => { $('status').textContent = 'Disconnected from server. Refresh to rejoin.'; showMenu(); joined = false; };
  ws.onerror = () => { $('status').textContent = 'Could not connect to the game server.'; };
  ws.onmessage = ev => { const m = JSON.parse(ev.data); handlers[m.t]?.(m); };
}
const net = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

const handlers = {
  welcome(m) {
    me.id = m.id; me.seq = m.seq; winKills = m.win; roster = m.list; roundOver = m.roundOver;
    me.pos.set(...m.p); me.yaw = m.yaw; me.alive = true; me.hp = MAX_HP;
    joined = true; $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('sbwin').textContent = winKills;
    updateScore(); feedSys(`Welcome to ${MAP_NAME}, ${nameOf(me.id)}!`);
  },
  roster(m) { roster = m.list; winKills = m.win; for (const r of roster) remotes.get(r.id)?.s.setName(r.name); updateScore(); renderScoreboard(); },
  s(m) {
    const now = performance.now(), seen = new Set();
    for (const [id, x, y, z, yaw, pitch, hp, alive] of m.ps) {
      seen.add(id);
      if (id === me.id) { me.hp = hp; continue; }
      let r = remotes.get(id);
      if (!r) {
        const info = roster.find(p => p.id === id) || {};
        r = { s: new Soldier(id, info.name || `#${id}`, info.c), buf: [], speed: 0, last: new THREE.Vector3(x, y, z) };
        scene.add(r.s.root); remotes.set(id, r); r.s.root.position.set(x, y, z);
      }
      r.buf.push({ t: now, x, y, z, yaw, pitch });
      if (r.buf.length > 40) r.buf.shift();
      if (!!alive !== r.s.alive) r.s.setAlive(!!alive);
    }
    for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.s.root); remotes.delete(id); }
  },
  spawn(m) {
    if (m.id === me.id) {
      me.pos.set(...m.p); me.vel.set(0, 0, 0); me.yaw = m.yaw; me.pitch = 0; me.seq = m.seq; me.hp = MAX_HP; me.alive = true;
      me.ammo = MAG_SIZE; me.reserve = RESERVE_AMMO; me.reloading = false; $('death').classList.add('hidden'); sfx.spawn();
    } else { const r = remotes.get(m.id); if (r) { r.buf = []; r.s.setAlive(true); r.s.root.position.set(...m.p); } }
  },
  shot(m) {
    const r = remotes.get(m.id); const from = new THREE.Vector3(...m.o);
    if (r) { r.s.muzzle(); r.s.gunTip(from); }
    tracer(from, new THREE.Vector3(...m.e), 0xffd27a);
    const dist = from.distanceTo(me.pos);
    const toSrc = from.clone().sub(camera.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    sfx.shot(Math.max(0, 1 - dist / 70) * 0.8, toSrc.dot(right));
  },
  hit(m) {
    const hm = $('hitmarker'); hm.className = m.kill ? 'kill' : (m.head ? 'head' : ''); hm.style.opacity = 1;
    clearTimeout(hm._t); hm._t = setTimeout(() => (hm.style.opacity = 0), 160);
    sfx.hit(m.kill, m.head);
  },
  hurt(m) {
    me.hp = m.hp; const v = $('vignette'); v.style.opacity = 0.9; setTimeout(() => (v.style.opacity = me.hp < 30 ? 0.45 : 0), 180); sfx.hurt();
  },
  kill(m) {
    const div = document.createElement('div');
    const cls = id => (id === me.id ? 'me' : '');
    div.innerHTML = `<span class="k ${cls(m.killer)}">${esc(m.kn)}</span> ${m.head ? '🎯' : '︻デ═一'} <span class="v ${cls(m.victim)}">${esc(m.vn)}</span>`;
    pushFeed(div);
    if (m.victim === me.id) {
      me.alive = false; mouseDown = false; deathTimer = performance.now() + RESPAWN_MS; sfx.death();
      $('killedby').textContent = m.killer === me.id ? 'You took yourself out' : `Killed by ${m.kn}${m.head ? ' (headshot)' : ''}`;
      $('death').classList.remove('hidden');
    } else if (m.killer === me.id) center(`ELIMINATED ${m.vn}${m.head ? ' · HEADSHOT' : ''}`);
    const r = remotes.get(m.victim); if (r) r.s.setAlive(false);
  },
  roundEnd(m) {
    roundOver = true; roster = m.list; roundTimerEnd = performance.now() + m.ms;
    $('winner').textContent = m.wid === me.id ? 'VICTORY — YOU WIN THE ROUND!' : `${m.winner} WINS THE ROUND`;
    $('roundend').classList.remove('hidden'); $('death').classList.add('hidden');
    renderScoreboard(); $('scoreboard').classList.remove('hidden'); if (m.wid === me.id) sfx.win();
  },
  roundStart() { roundOver = false; $('roundend').classList.add('hidden'); $('scoreboard').classList.add('hidden'); center('NEW ROUND — FIGHT!'); },
  feed(m) { feedSys(m.msg); },
  leave(m) { const r = remotes.get(m.id); if (r) { scene.remove(r.s.root); remotes.delete(m.id); } },
};

// ---------- HUD helpers ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function pushFeed(div) {
  const f = $('killfeed'); f.prepend(div); while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 700); }, 6000);
}
function feedSys(msg) { const d = document.createElement('div'); d.className = 'sys'; d.textContent = msg; pushFeed(d); }
function center(msg) { const c = $('centermsg'); c.textContent = msg; c.style.opacity = 1; clearTimeout(c._t); c._t = setTimeout(() => (c.style.opacity = 0), 1800); }
function updateScore() {
  const mine = roster.find(r => r.id === me.id); const lead = [...roster].sort((a, b) => b.k - a.k)[0];
  $('score').textContent = `Kills ${mine ? mine.k : 0} / ${winKills}` + (lead ? ` · Leader: ${lead.name} (${lead.k})` : '') + ` · Players ${roster.length}`;
}
function renderScoreboard() {
  $('sbbody').innerHTML = [...roster].sort((a, b) => b.k - a.k || a.d - b.d).map(r =>
    `<tr class="${r.id === me.id ? 'me' : ''}"><td class="${r.bot ? 'bot' : ''}">${esc(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td></tr>`).join('');
}

// ---------- Input ----------
function showMenu() { $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); }
function join() {
  const name = $('name').value.trim() || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem('fps-name', name); sfx.init(); connect(name); lock();
}
$('play').onclick = join;
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
function lock() { try { const p = renderer.domElement.requestPointerLock(); p?.catch?.(() => {}); } catch {} }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; if (!locked) mouseDown = false; });
renderer.domElement.addEventListener('mousedown', e => {
  if (!joined) return; sfx.init();
  if (!locked) { lock(); return; }
  if (e.button === 0) { mouseDown = true; if (me.ammo === 0 && !me.reloading) { sfx.empty(); startReload(); } }
  if (e.button === 2) aiming = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) aiming = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!locked || !me.alive) return;
  const sens = 0.0022 * (aiming ? 0.6 : 1);
  me.yaw -= e.movementX * sens; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - e.movementY * sens));
});
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); if (joined) { renderScoreboard(); $('scoreboard').classList.remove('hidden'); } return; }
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab' && !roundOver) $('scoreboard').classList.add('hidden'); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

// ---------- Physics & collision ----------
function overlapsAt(x, y, z, a) {
  return x + R > a.min[0] && x - R < a.max[0] && z + R > a.min[2] && z - R < a.max[2] && y + H > a.min[1] && y < a.max[1];
}
const blockedAt = (x, y, z) => AABBS.some(a => overlapsAt(x, y, z, a));
function moveAxis(i, amt) {
  const p = me.pos; const key = i === 0 ? 'x' : 'z';
  p[key] += amt;
  for (const a of AABBS) {
    if (!overlapsAt(p.x, p.y, p.z, a)) continue;
    const step = a.max[1] - p.y;
    if (step > 0 && step <= 0.55 && me.onGround && !blockedAt(p.x, a.max[1] + 0.001, p.z)) { p.y = a.max[1]; continue; }
    p[key] = amt > 0 ? a.min[i] - R - 1e-4 : a.max[i] + R + 1e-4;
  }
  const L = ARENA_HALF - R; p[key] = Math.max(-L, Math.min(L, p[key]));
}
function physics(dt) {
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = !me.alive ? 0 : (aiming ? 3.2 : sprint && fwd > 0 ? 8.5 : 5.5);
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let wx = -sin * fwd + cos * str, wz = -cos * fwd - sin * str; const l = Math.hypot(wx, wz);
  if (l > 0) { wx /= l; wz /= l; }
  const accel = me.onGround ? 14 : 3;
  me.vel.x += (wx * speed - me.vel.x) * Math.min(1, accel * dt);
  me.vel.z += (wz * speed - me.vel.z) * Math.min(1, accel * dt);
  if (me.alive && keys.Space && me.onGround) { me.vel.y = 7; me.onGround = false; }
  me.vel.y -= 20 * dt;
  const wasGround = me.onGround;
  moveAxis(0, me.vel.x * dt); moveAxis(2, me.vel.z * dt);
  me.pos.y += me.vel.y * dt; me.onGround = false;
  if (me.pos.y <= 0) { me.pos.y = 0; me.vel.y = Math.max(0, me.vel.y); me.onGround = true; }
  for (const a of AABBS) {
    if (!overlapsAt(me.pos.x, me.pos.y, me.pos.z, a)) continue;
    if (me.vel.y <= 0) { me.pos.y = a.max[1]; me.vel.y = 0; me.onGround = true; } else { me.pos.y = a.min[1] - H - 1e-3; me.vel.y = 0; }
  }
  if (!wasGround && me.onGround) sfx.land();
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (me.onGround && hs > 1) { me.stepT += dt * hs; if (me.stepT > 2.4) { me.stepT = 0; sfx.step(sprint ? 0.3 : 0.2); } }
  return hs;
}

// ---------- Shooting ----------
const raycaster = new THREE.Raycaster();
const tracers = [];
const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
function tracer(from, to, color = 0xfff1a8) {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to)); scene.add(m); tracers.push({ m, life: 0.08 });
}
const sparks = [];
function spark(p, color = '#ffd27a') {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(p); scene.add(m); sparks.push({ m, life: 0.25 });
}
function startReload() {
  if (!me.alive || me.reloading || me.ammo === MAG_SIZE || me.reserve <= 0) return;
  me.reloading = true; me.reloadEnd = performance.now() + RELOAD_MS; sfx.reload();
}
function shoot(now, moving) {
  if (!me.alive || roundOver || me.reloading || now - me.lastShot < FIRE_INTERVAL) return;
  if (me.ammo <= 0) { startReload(); return; }
  me.lastShot = now; me.ammo--;
  let spread = aiming ? 0.004 : 0.018; if (moving) spread += 0.02; if (!me.onGround) spread += 0.05; spread += me.recoil * 0.25;
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, -1).normalize().applyQuaternion(camera.quaternion);
  raycaster.set(origin, dir); raycaster.far = 200;
  const targets = colliders.slice();
  for (const r of remotes.values()) if (r.s.alive) targets.push(r.s.hitHead, r.s.hitBody);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
  const pid = hit?.object.userData.pid || 0, head = hit?.object.userData.part === 'head';
  net({ t: 'shoot', o: origin.toArray(), d: dir.toArray(), e: end.toArray(), hit: pid, head });
  // effects
  const tip = muzzleFlash.getWorldPosition(new THREE.Vector3());
  tracer(tip, end); if (hit) { spark(end, pid ? '#b01515' : '#ffd27a'); if (!pid) sfx.impact(); }
  muzzleFlash.visible = true; muzzleFlash.rotation.z = Math.random() * 3; muzzleLight.intensity = 6;
  setTimeout(() => { muzzleFlash.visible = false; muzzleLight.intensity = 0; }, 45);
  me.recoil = Math.min(0.12, me.recoil + (aiming ? 0.012 : 0.02)); me.yaw += (Math.random() - 0.5) * 0.006;
  gun.position.z += 0.05;
  sfx.shot(1, 0);
}

// ---------- Main loop ----------
let lastT = performance.now(), sendAcc = 0;
const tmpV = new THREE.Vector3();
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (joined) {
    // reload
    if (me.reloading && now >= me.reloadEnd) { const n = Math.min(MAG_SIZE - me.ammo, me.reserve); me.ammo += n; me.reserve -= n; me.reloading = false; }
    const hs = physics(dt);
    if (mouseDown && locked) shoot(now, hs > 1.5);
    me.recoil = Math.max(0, me.recoil - dt * 0.35);
    // camera
    if (me.alive) {
      const bob = me.onGround ? Math.sin(now / 1000 * hs * 1.7) * Math.min(1, hs / 8) * 0.04 : 0;
      camera.position.set(me.pos.x, me.pos.y + EYE_HEIGHT + bob, me.pos.z);
      camera.rotation.set(me.pitch + me.recoil, me.yaw, 0);
      gun.visible = true;
    } else {
      camera.position.y += (me.pos.y + 0.4 - camera.position.y) * Math.min(1, dt * 4);
      camera.rotation.z += (0.5 - camera.rotation.z) * Math.min(1, dt * 3);
      gun.visible = false;
    }
    const targetFov = aiming && me.alive ? ADS_FOV : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
    const gunTarget = aiming ? ADS : HIP;
    gun.position.lerp(tmpV.copy(gunTarget).add(new THREE.Vector3(0, me.reloading ? -0.15 : 0, 0)), Math.min(1, dt * 14));
    gun.rotation.x = me.reloading ? -0.5 : 0;
    // network state @ 30Hz
    sendAcc += dt;
    if (sendAcc >= 1 / 30 && me.alive) { sendAcc = 0; net({ t: 'st', p: me.pos.toArray().map(v => Math.round(v * 100) / 100), yaw: me.yaw, pitch: me.pitch, seq: me.seq }); }
    // remote interpolation (render 100ms in the past)
    const rt = now - 100;
    for (const r of remotes.values()) {
      const b = r.buf; if (!b.length) continue;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
      const root = r.s.root;
      root.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      root.rotation.y = lerpAngle(a.yaw, c.yaw, k);
      const sp = Math.hypot(root.position.x - r.last.x, root.position.z - r.last.z) / Math.max(dt, 1e-3);
      r.speed += (sp - r.speed) * Math.min(1, dt * 10); r.last.copy(root.position);
      r.s.update(dt, r.speed, a.pitch + (c.pitch - a.pitch) * k);
    }
    // HUD
    $('hpnum').textContent = Math.ceil(me.hp); $('hpfill').style.width = `${me.hp}%`;
    $('hpfill').style.background = me.hp < 30 ? '#e53935' : '';
    $('mag').textContent = me.ammo; $('reserve').textContent = me.reserve;
    $('mag').style.color = me.ammo <= 5 ? '#ff5252' : '';
    $('reloading').classList.toggle('hidden', !me.reloading);
    $('clickhint').classList.toggle('hidden', locked || !me.alive || roundOver);
    const gap = 6 + (me.recoil * 120) + (hs > 1.5 ? 6 : 0) + (me.onGround ? 0 : 10) - (aiming ? 4 : 0);
    const ch = $('crosshair').children; ch[0].style.top = `${-gap - 9}px`; ch[1].style.top = `${gap}px`; ch[2].style.left = `${-gap - 9}px`; ch[3].style.left = `${gap}px`;
    $('crosshair').style.display = aiming ? 'none' : '';
    if (!me.alive) $('respawn').textContent = `Respawning in ${Math.max(0, (deathTimer - now) / 1000).toFixed(1)}s`;
    if (roundOver) $('roundtimer').textContent = `Next round in ${Math.max(0, Math.ceil((roundTimerEnd - now) / 1000))}s`;
  } else {
    // menu flyover
    const t = now / 1000 * 0.08;
    camera.position.set(Math.cos(t) * 30, 14, Math.sin(t) * 30); camera.lookAt(0, 2, 0);
  }
  for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life / 0.08) * 0.85; if (tr.life <= 0) { scene.remove(tr.m); tr.m.material.dispose(); tracers.splice(i, 1); } }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.m.material.opacity = s.life / 0.25; s.m.scale.setScalar(1 + (0.25 - s.life) * 4); if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); } }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Test hook: ?autojoin=Name joins immediately (used for headless screenshots)
if (params.has('autojoin')) { $('name').value = params.get('autojoin') || 'Tester'; join(); }
window.__game = { me, remotes, get joined() { return joined; } };
