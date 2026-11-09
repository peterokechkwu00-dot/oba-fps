// Frontline: Oba — browser client
import * as THREE from 'three';
import {
  DEFAULT_MAP, getMap, PLAYER_RADIUS as R, PLAYER_HEIGHT as H, EYE_HEIGHT, MAX_HP,
  FIRE_INTERVAL, MAG_SIZE, RESERVE_AMMO, RELOAD_MS, RESPAWN_MS,
} from './shared/map.js';
import { buildWorld, setWorldQuality } from './world.js';
import { createPickupField } from './pickups.js';
import { Soldier, preloadSoldiers, setSoldierQuality } from './avatar.js';
import { loadQuality, saveQuality } from './graphics.js';
import { queryAABBs } from './shared/grid.js';
import { applySnapshot } from './shared/netsnap.js';
import { initAccount, currentLoadout } from './account.js';
import { getItem } from './shared/catalog.js';
import * as sfx from './audio.js';
import { buildRifle, flashTexture, applyRifleSkin } from './weapon.js';
import * as comms from './comms.js';
import { isTouch, state as touch, LOOK_SENS, initTouch, requestImmersive, setTouchVisible, setAiming, refreshMic, setEnterVisible } from './touch.js';
import { createVehicleField, updateExplosions } from './drive.js';
import { VEHICLE_ENTER_R, VEHICLE_TYPES, vehicleSpawns, packVehicle, createVehicle, seatWorld } from './shared/vehicles.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
$('name').value = localStorage.getItem('fps-name') || '';

// ---------- Renderer / scene ----------
const qualityState = loadQuality();
const renderer = new THREE.WebGLRenderer({ antialias: qualityState.preset.antialias && !isTouch, powerPreference: isTouch ? 'high-performance' : 'default', preserveDrawingBuffer: params.has('autojoin') });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityState.preset.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.shadowMap.enabled = !!qualityState.preset.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setSoldierQuality(qualityState.resolved === 'low');
setWorldQuality(qualityState.preset);
preloadSoldiers();
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BASE_FOV = 75, ADS_FOV = 50;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, qualityState.preset.far);
camera.rotation.order = 'YXZ';
scene.add(camera);
const netStore = { ps: new Map(), vs: new Map() };
let lastPickups = null, lastVehicles = null;
let pingMs = 0, pingSentAt = 0;
let fpsFrames = 0, fpsStamp = 0, fpsVal = 0;
let lastDrive = { th: 0, st: 0, br: false };

let currentMap = getMap(DEFAULT_MAP);
let AABBS = currentMap.AABBS;
let ARENA_HALF = currentMap.ARENA_HALF;
let colliders = [];
let pickupField = null;
let vehicleField = null;
function setMapName(name) {
  for (const id of ['mapname', 'menumap', 'sbmap']) { const el = $(id); if (el) el.textContent = name; }
}
function loadClientMap(id, pickupList, vehicleList) {
  currentMap = getMap(id);
  AABBS = currentMap.AABBS;
  ARENA_HALF = currentMap.ARENA_HALF;
  setMapName(currentMap.name);
  lastPickups = pickupList || lastPickups;
  lastVehicles = vehicleList || lastVehicles;
  const built = buildWorld(scene, renderer, { low: qualityState.resolved === 'low', quality: qualityState.preset, map: currentMap });
  colliders = built.colliders;
  pickupField?.dispose();
  pickupField = createPickupField(scene, lastPickups || currentMap.PICKUPS.map((p, i) => ({ ...p, id: i, up: true })));
  vehicleField?.dispose();
  vehicleField = createVehicleField(scene);
  const rows = lastVehicles || vehicleSpawns(currentMap.id).map((sp, i) => packVehicle(createVehicle(i + 1, sp)));
  vehicleField.sync(rows, { full: true });
}
function syncGfxSelects() {
  for (const id of ['gfx', 'gfx2']) {
    const el = $(id); if (el) el.value = qualityState.mode;
  }
}
function applyQuality(mode) {
  const next = saveQuality(mode);
  qualityState.mode = next.mode;
  qualityState.resolved = next.resolved;
  qualityState.preset = next.preset;
  setWorldQuality(next.preset);
  setSoldierQuality(next.resolved === 'low');
  renderer.setPixelRatio(Math.min(devicePixelRatio, next.preset.pixelRatio));
  renderer.shadowMap.enabled = !!next.preset.shadows;
  camera.far = next.preset.far;
  camera.updateProjectionMatrix();
  syncGfxSelects();
  const keepVeh = (vehicleField?.all() || []).map(r => {
    const st = r.last || r.render;
    if (!st) return null;
    return packVehicle({ ...st, seats: st.seats || [] });
  }).filter(Boolean);
  loadClientMap(currentMap.id, lastPickups, keepVeh.length ? keepVeh : lastVehicles);
}
function bindGfxSelect(id) {
  const el = $(id); if (!el) return;
  el.value = qualityState.mode;
  el.onchange = () => applyQuality(el.value);
}
bindGfxSelect('gfx');
bindGfxSelect('gfx2');
loadClientMap(DEFAULT_MAP);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); weaponCamera.aspect = camera.aspect; weaponCamera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- First-person weapon (own scene + camera so it never clips into walls) ----------
const weaponScene = new THREE.Scene();
const weaponCamera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.01, 5);
if (qualityState.preset.env) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  weaponScene.environment = env; weaponScene.environmentIntensity = 0.55;
  scene.environment = env; scene.environmentIntensity = 0.35; // only affects PBR (the third-person rifles)
}
weaponScene.add(new THREE.HemisphereLight('#dfeaff', '#7a5234', 0.9));
const keyLight = new THREE.DirectionalLight('#fff0d6', 2.4); keyLight.position.set(-0.5, 1, 0.35); weaponScene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#a8c8ff', 1.2); rimLight.position.set(1, 0.25, -0.8); weaponScene.add(rimLight);
const flashLightVM = new THREE.PointLight('#ffb050', 0, 1.2, 2); flashLightVM.position.set(0.05, 0, -0.75); weaponScene.add(flashLightVM);
const rig = new THREE.Group(); weaponScene.add(rig);
const rifle = buildRifle('high'); rig.add(rifle);
const RU = rifle.userData;
const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const muzzleFlash = new THREE.Group(); muzzleFlash.visible = false; RU.muzzle.add(muzzleFlash);
muzzleFlash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), flashMat));
for (const rz of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.22).rotateX(-Math.PI / 2).translate(0, 0, -0.1), flashMat); m.rotation.z = rz; muzzleFlash.add(m); }
const muzzleLight = new THREE.PointLight('#ffbb55', 0, 9); muzzleLight.position.set(0.1, -0.05, -1); camera.add(muzzleLight);
const HIP = new THREE.Vector3(0.2, -0.185, -0.46);
const ADS = new THREE.Vector3(-RU.sight.x, -RU.sight.y, -0.2 - RU.sight.z); // red-dot centred on screen
const anim = { swayX: 0, swayY: 0, kick: 0, kickRot: 0, bobT: 0, aimK: 0, flashT: 0 };
rig.position.copy(HIP);

// ---------- State ----------
const me = {
  id: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, hp: MAX_HP, alive: false, seq: 0,
  ammo: MAG_SIZE, reserve: RESERVE_AMMO, armour: 0, reloading: false, reloadEnd: 0, lastShot: 0, recoil: 0, stepT: 0,
  vehicleId: 0, seat: -1,
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (comms.handle(m)) return; handlers[m.t]?.(m); };
}
const net = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function applyRemoteCosmetics(s, info) {
  if (!s || !info) return;
  s.setCosmetics({ camo: info.camo, rifle: info.rifle, tag: info.tag });
}

const handlers = {
  welcome(m) {
    me.id = m.id; me.seq = m.seq; winKills = m.win; roster = m.list; roundOver = m.roundOver;
    me.pos.set(...m.p); me.yaw = m.yaw; me.alive = true; me.hp = MAX_HP;
    me.armour = m.armour || 0; if (m.reserve != null) me.reserve = m.reserve; if (m.ammo != null) me.ammo = m.ammo;
    if (m.map) loadClientMap(m.map.id, m.pickups, m.vehicles);
    else if (m.vehicles) { lastVehicles = m.vehicles; vehicleField?.sync(m.vehicles, { full: true }); }
    joined = true; $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('sbwin').textContent = winKills;
    updateScore(); comms.chatLine('', `Welcome to ${currentMap.name}, ${nameOf(me.id)}! ` + (isTouch ? 'Voice is open-mic — tap 🎤 to mute, CHAT to type.' : 'Voice chat is open-mic — press V to mute/unmute, T to type.'), 'sys');
    for (const r of roster) if (r.talk) comms.talking.add(r.id);
    comms.connectVoice(m.list);
    applyRifleSkin(rifle, (m.cosmetics && m.cosmetics.rifle) || currentLoadout().rifle);
    if (m.vote) showVote(m.vote.maps, m.vote.ms, m.vote.counts);
  },
  roster(m) { roster = m.list; winKills = m.win; for (const r of roster) { const rem = remotes.get(r.id); if (rem) { rem.s.setName(r.name); applyRemoteCosmetics(rem.s, r); } } updateScore(); renderScoreboard(); },
  s(m) {
    applySnapshot(netStore, m);
    const now = performance.now(), seen = new Set();
    for (const row of netStore.ps.values()) {
      const [id, x, y, z, yaw, pitch, hp, armourOrAlive, maybeAlive] = row;
      const armour = maybeAlive === undefined ? 0 : armourOrAlive;
      const alive = maybeAlive === undefined ? armourOrAlive : maybeAlive;
      seen.add(id);
      if (id === me.id) { me.hp = hp; if (maybeAlive !== undefined) me.armour = armour; continue; }
      let r = remotes.get(id);
      if (!r) {
        const info = roster.find(p => p.id === id) || {};
        const tint = getItem(info.camo)?.color || info.c;
        r = { s: new Soldier(id, info.name || `#${id}`, tint), buf: [], speed: 0, speedX: 0, speedZ: 0, last: new THREE.Vector3(x, y, z) };
        scene.add(r.s.root); remotes.set(id, r); r.s.root.position.set(x, y, z); r.s.setSpeaking(comms.talking.has(id));
        applyRemoteCosmetics(r.s, info);
      }
      r.buf.push({ t: now, x, y, z, yaw, pitch });
      if (r.buf.length > 40) r.buf.shift();
      if (!!alive !== r.s.alive) r.s.setAlive(!!alive);
    }
    if (m.f) {
      for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.s.root); remotes.delete(id); }
    }
    if (m.vs || m.f) vehicleField?.sync(m.vs || [], { full: !!m.f });
  },
  pong(m) { pingMs = Math.max(0, performance.now() - (m.n || 0)); },
  spawn(m) {
    if (m.id === me.id) {
      me.pos.set(...m.p); me.vel.set(0, 0, 0); me.yaw = m.yaw; me.pitch = 0; me.seq = m.seq; me.hp = MAX_HP; me.alive = true;
      me.armour = m.armour != null ? m.armour : 0; me.ammo = m.ammo != null ? m.ammo : MAG_SIZE;
      if (m.reserve != null) me.reserve = m.reserve;
      me.reloading = false; $('death').classList.add('hidden'); sfx.spawn();
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
    me.hp = m.hp; if (m.armour != null) me.armour = m.armour;
    const v = $('vignette'); v.style.opacity = 0.9; setTimeout(() => (v.style.opacity = me.hp < 30 ? 0.45 : 0), 180); sfx.hurt();
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
    showVote(m.maps, m.ms);
  },
  roundStart(m) {
    roundOver = false; hideVote();
    $('roundend').classList.add('hidden'); $('scoreboard').classList.add('hidden');
    if (m && m.map) loadClientMap(m.map.id, m.pickups, m.vehicles);
    center(`NEW ROUND — ${currentMap.name}`);
  },
  got(m) {
    if (m.hp != null) me.hp = m.hp;
    if (m.armour != null) me.armour = m.armour;
    if (m.reserve != null) me.reserve = m.reserve;
    pickupField?.setUp(m.id, false);
    const label = m.kind === 'med' ? '+50 HEALTH' : m.kind === 'armour' ? '+50 ARMOUR' : '+90 AMMO';
    showToast(label);
    sfx.pickup(m.kind);
  },
  pickup(m) { pickupField?.setUp(m.id, m.up); },
  venter(m) { if (m.ok) { me.vehicleId = m.id; me.seat = m.seat; if (m.seat === 0) aiming = false; } },
  vexit(m) { me.vehicleId = 0; me.seat = -1; },
  vboom(m) { vehicleField?.explode(m.id, scene); sfx.explode?.(); me.vehicleId = me.vehicleId === m.id ? 0 : me.vehicleId; if (me.vehicleId === 0) me.seat = -1; },
  vspawn(m) { /* next snapshot carries the respawned vehicle */ },
  horn(m) { sfx.horn(); },
  votes(m) { updateVoteCounts(m.counts); },
  feed(m) { comms.chatLine('', m.msg, 'sys'); },
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
function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 1800);
}
let myVote = null;
function showVote(maps, ms, counts) {
  const box = $('mapvote'), opts = $('voteopts');
  if (!box || !maps || !maps.length) return;
  myVote = null; box.classList.remove('hidden');
  if (ms) roundTimerEnd = performance.now() + ms;
  opts.innerHTML = maps.map(m => `<button type="button" class="vote-opt" data-id="${m.id}"><span>${esc(m.name)}</span><span class="vc" data-c="${m.id}">0 votes</span></button>`).join('');
  opts.onclick = ev => {
    const b = ev.target.closest('.vote-opt'); if (!b) return;
    myVote = b.dataset.id;
    net({ t: 'vote', map: myVote });
    for (const el of opts.querySelectorAll('.vote-opt')) el.classList.toggle('picked', el.dataset.id === myVote);
  };
  if (counts) updateVoteCounts(counts);
}
function updateVoteCounts(counts) {
  if (!counts) return;
  for (const [id, n] of Object.entries(counts)) {
    const el = document.querySelector(`#voteopts .vc[data-c="${id}"]`);
    if (el) el.textContent = `${n} vote${n === 1 ? '' : 's'}`;
  }
}
function hideVote() { const box = $('mapvote'); if (box) box.classList.add('hidden'); myVote = null; }
function updateScore() {
  const mine = roster.find(r => r.id === me.id); const lead = [...roster].sort((a, b) => b.k - a.k)[0];
  $('score').textContent = `Kills ${mine ? mine.k : 0} / ${winKills}` + (lead ? ` · Leader: ${lead.name} (${lead.k})` : '') + ` · Players ${roster.length}`;
}
function renderScoreboard() {
  $('sbbody').innerHTML = [...roster].sort((a, b) => b.k - a.k || a.d - b.d).map(r =>
    `<tr class="${r.id === me.id ? 'me' : ''}"><td class="spk">${comms.talking.has(r.id) ? '🔊' : ''}</td><td class="${r.bot ? 'bot' : ''}">${esc(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td>` +
    `<td>${r.bot || r.id === me.id ? '' : `<button class="mute ${comms.muted.has(r.id) ? 'on' : ''}" data-id="${r.id}">${comms.muted.has(r.id) ? '🔇 Muted' : '🔈 Mute'}</button>`}</td></tr>`).join('');
}

// ---------- Comms (text + voice chat) ----------
comms.initComms({
  net: m => net(m), myId: () => me.id, nameOf,
  onTalkChange: (id, on) => { remotes.get(id)?.s.setSpeaking(on); if (!$('scoreboard').classList.contains('hidden')) renderScoreboard(); },
});
$('sbbody').addEventListener('click', e => { const b = e.target.closest('button.mute'); if (!b) return; comms.toggleMute(Number(b.dataset.id)); renderScoreboard(); });

function toggleScoreboard() {
  const sb = $('scoreboard');
  if (sb.classList.contains('hidden')) { renderScoreboard(); sb.classList.remove('hidden'); sb.classList.add('interactive'); }
  else if (!roundOver) { sb.classList.add('hidden'); sb.classList.remove('interactive'); }
}
initTouch({
  onLook(dx, dy) {
    if (!me.alive) return;
    const sens = LOOK_SENS * (aiming ? 0.55 : 1);
    me.yaw -= dx * sens;
    me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - dy * sens));
    anim.swayX = Math.max(-0.04, Math.min(0.04, anim.swayX + dx * 0.00015));
    anim.swayY = Math.max(-0.04, Math.min(0.04, anim.swayY + dy * 0.00015));
  },
  onAimToggle() { if (me.alive) { aiming = !aiming; setAiming(aiming); } },
  onReload() { startReload(); },
  onFireStart() { if (me.ammo === 0 && !me.reloading) { sfx.empty(); startReload(); } },
  onMic() { comms.toggleMic(); refreshMic(comms.micState()); },
  onChat() { if (comms.isChatting()) comms.closeChat(); else comms.openChat(); },
  onScore() { toggleScoreboard(); },
  onScoreClose() { if (!roundOver) { $('scoreboard').classList.add('hidden'); $('scoreboard').classList.remove('interactive'); } },
  onEnter() { tryEnterExit(); },
});

// ---------- Input ----------
function showMenu() { $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); }
function join() {
  const name = $('name').value.trim() || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem('fps-name', name); sfx.init();
  if (isTouch) { requestImmersive(); setTouchVisible(true); }
  else lock();
  connect(name); comms.startVoice();
}
$('play').onclick = join;
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
function lock() { if (isTouch) return; try { const p = renderer.domElement.requestPointerLock(); p?.catch?.(() => {}); } catch {} }
document.addEventListener('pointerlockchange', () => {
  if (isTouch) return;
  const was = locked; locked = document.pointerLockElement === renderer.domElement;
  const sb = $('scoreboard');
  if (!locked) { mouseDown = false; aiming = false; if (was && joined) { renderScoreboard(); sb.classList.remove('hidden'); sb.classList.add('interactive'); } }
  else { sb.classList.remove('interactive'); if (!roundOver) sb.classList.add('hidden'); }
});
renderer.domElement.addEventListener('mousedown', e => {
  if (!joined || isTouch) return; sfx.init();
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
  anim.swayX = Math.max(-0.04, Math.min(0.04, anim.swayX + e.movementX * 0.00006)); anim.swayY = Math.max(-0.04, Math.min(0.04, anim.swayY + e.movementY * 0.00006));
});
addEventListener('keydown', e => {
  if (comms.isChatting()) return;
  if (joined && (e.code === 'KeyT' || e.code === 'Enter')) { e.preventDefault(); for (const k in keys) keys[k] = false; mouseDown = false; comms.openChat(); return; }
  if (joined && e.code === 'KeyV') { if (!e.repeat) comms.toggleMic(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (joined) { renderScoreboard(); $('scoreboard').classList.remove('hidden'); } return; }
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (joined && e.code === 'KeyE' && !e.repeat) tryEnterExit();
  if (joined && e.code === 'KeyH' && !e.repeat) net({ t: 'horn' });
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab' && !roundOver && locked) $('scoreboard').classList.add('hidden'); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

function nearestVehicle() {
  if (!vehicleField) return null;
  let best = null, bestD = VEHICLE_ENTER_R;
  for (const rec of vehicleField.all()) {
    const st = rec.render || rec.last;
    if (!st || !st.alive) continue;
    const d = Math.hypot(st.x - me.pos.x, st.z - me.pos.z);
    if (d < bestD) { bestD = d; best = { ...st, id: rec.id }; }
  }
  return best;
}
function tryEnterExit() {
  if (!me.alive || roundOver) return;
  if (me.vehicleId) { net({ t: 'exit' }); return; }
  const near = nearestVehicle();
  if (near) net({ t: 'enter', id: near.id });
}
function updateVehHint() {
  const el = $('vehhint');
  if (!el) return;
  if (!joined || !me.alive) { el.classList.add('hidden'); setEnterVisible(false, false); return; }
  if (me.vehicleId) {
    el.textContent = isTouch ? 'EXIT  ·  joystick to drive  ·  passengers can shoot' : 'E exit   ·   WASD drive   ·   H horn   ·   passengers can look and shoot';
    el.classList.remove('hidden');
    setEnterVisible(true, true);
    return;
  }
  const near = nearestVehicle();
  if (near) {
    const typ = near.type || 'vehicle';
    el.textContent = isTouch ? `ENTER ${typ}` : `Press E to enter ${typ}`;
    el.classList.remove('hidden');
    setEnterVisible(true, false);
  } else {
    el.classList.add('hidden');
    setEnterVisible(false, false);
  }
}
let driveSend = 0;
function sendDrive(dt) {
  if (!me.vehicleId || me.seat !== 0) return;
  driveSend += dt;
  if (driveSend < 1 / 20) return;
  driveSend = 0;
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + (touch.fwd || 0);
  const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) - (touch.str || 0);
  const br = !!(keys.Space || (keys.KeyS && fwd <= 0 && !touch.fwd));
  lastDrive = { th: Math.max(-1, Math.min(1, fwd)), st: Math.max(-1, Math.min(1, steer)), br };
  net({ t: 'drive', ...lastDrive });
}

// ---------- Physics & collision ----------
function overlapsAt(x, y, z, a) {
  return x + R > a.min[0] && x - R < a.max[0] && z + R > a.min[2] && z - R < a.max[2] && y + H > a.min[1] && y < a.max[1];
}
const blockedAt = (x, y, z) => queryAABBs(AABBS, x, z, R + 0.05).some(a => overlapsAt(x, y, z, a));
function moveAxis(i, amt) {
  const p = me.pos; const key = i === 0 ? 'x' : 'z';
  p[key] += amt;
  const nearby = queryAABBs(AABBS, p.x, p.z, R + Math.abs(amt) + 0.6);
  for (const a of nearby) {
    if (!overlapsAt(p.x, p.y, p.z, a)) continue;
    const step = a.max[1] - p.y;
    if (step > 0 && step <= 0.55 && me.onGround && !blockedAt(p.x, a.max[1] + 0.001, p.z)) { p.y = a.max[1]; continue; }
    p[key] = amt > 0 ? a.min[i] - R - 1e-4 : a.max[i] + R + 1e-4;
  }
  const L = ARENA_HALF - R; p[key] = Math.max(-L, Math.min(L, p[key]));
}
function physics(dt) {
  if (me.vehicleId) {
    const rec = vehicleField?.get(me.vehicleId);
    const st = rec?.render || rec?.last;
    if (st) {
      const seat = me.seat >= 0 ? me.seat : 0;
      const sw = seatWorld({ x: st.x, y: st.y, z: st.z, yaw: st.yaw, type: st.type }, seat);
      me.pos.set(sw[0], sw[1], sw[2]);
      if (seat === 0) me.yaw = st.yaw;
      const spd = Math.hypot((st.x - (rec._lx ?? st.x)) / Math.max(dt, 1e-3), (st.z - (rec._lz ?? st.z)) / Math.max(dt, 1e-3));
      rec._lx = st.x; rec._lz = st.z;
      me.vel.set(0, 0, 0); me.onGround = true;
      sendDrive(dt);
      sfx.engine(Math.min(1, spd / 16));
      return spd;
    }
  } else {
    sfx.engine(0);
  }
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + (touch.fwd || 0);
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + (touch.str || 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight || touch.sprint;
  const speed = !me.alive ? 0 : (aiming ? 3.2 : sprint && fwd > 0.2 ? 8.5 : 5.5);
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let wx = -sin * fwd + cos * str, wz = -cos * fwd - sin * str; const l = Math.hypot(wx, wz);
  if (l > 0) { wx /= l; wz /= l; }
  const accel = me.onGround ? 14 : 3;
  me.vel.x += (wx * speed - me.vel.x) * Math.min(1, accel * dt);
  me.vel.z += (wz * speed - me.vel.z) * Math.min(1, accel * dt);
  if (me.alive && (keys.Space || touch.jump) && me.onGround) { me.vel.y = 7; me.onGround = false; }
  me.vel.y -= 20 * dt;
  const wasGround = me.onGround;
  moveAxis(0, me.vel.x * dt); moveAxis(2, me.vel.z * dt);
  const yBefore = me.pos.y;
  me.pos.y += me.vel.y * dt; me.onGround = false;
  if (me.pos.y <= 0) { me.pos.y = 0; me.vel.y = Math.max(0, me.vel.y); me.onGround = true; }
  const nearbyY = queryAABBs(AABBS, me.pos.x, me.pos.z, R + 0.2);
  for (const a of nearbyY) {
    const over = me.pos.x + R > a.min[0] && me.pos.x - R < a.max[0] && me.pos.z + R > a.min[2] && me.pos.z - R < a.max[2];
    if (!over) continue;
    // Catch thin floor slabs that a fast fall would otherwise tunnel through.
    if (me.vel.y <= 0 && yBefore >= a.max[1] - 1e-4 && me.pos.y < a.max[1]) {
      me.pos.y = a.max[1]; me.vel.y = 0; me.onGround = true; continue;
    }
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
const sparkGeo = new THREE.SphereGeometry(0.06, 5, 4);
function tracer(from, to, color = 0xfff1a8) {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to)); scene.add(m); tracers.push({ m, life: 0.08 });
}
const sparks = [];
function spark(p, color = '#ffd27a') {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(p); scene.add(m); sparks.push({ m, life: 0.25 });
}
const _mwA = new THREE.Vector3(), _mwB = new THREE.Vector3(), _shootO = new THREE.Vector3(), _shootD = new THREE.Vector3();
function startReload() {
  if (!me.alive || me.reloading || me.ammo === MAG_SIZE || me.reserve <= 0) return;
  me.reloading = true; me.reloadEnd = performance.now() + RELOAD_MS; sfx.reload();
}
// The view model has its own camera/FOV: project its muzzle to the screen, then back into the world.
function muzzleWorld() {
  rig.updateMatrixWorld(true);
  const p = RU.muzzle.getWorldPosition(_mwA).project(weaponCamera);
  _mwB.set(p.x, p.y, 0.5).unproject(camera).sub(camera.position).normalize();
  return _mwA.copy(camera.position).addScaledVector(_mwB, 0.8);
}
function shoot(now, moving) {
  if (me.vehicleId && me.seat === 0) return;
  if (!me.alive || roundOver || me.reloading || now - me.lastShot < FIRE_INTERVAL) return;
  if (me.ammo <= 0) { startReload(); return; }
  me.lastShot = now; me.ammo--;
  let spread = aiming ? 0.004 : 0.018; if (moving) spread += 0.02; if (!me.onGround) spread += 0.05; spread += me.recoil * 0.25;
  const origin = camera.getWorldPosition(_shootO);
  const dir = _shootD.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, -1).normalize().applyQuaternion(camera.quaternion);
  raycaster.set(origin, dir); raycaster.far = 200;
  const targets = colliders.slice();
  for (const r of remotes.values()) if (r.s.alive) targets.push(r.s.hitHead, r.s.hitBody);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
  const pid = hit?.object.userData.pid || 0, head = hit?.object.userData.part === 'head';
  net({ t: 'shoot', o: origin.toArray(), d: dir.toArray(), e: end.toArray(), hit: pid, head });
  // effects
  const tip = muzzleWorld();
  tracer(tip, end); if (hit) { spark(end, pid ? '#b01515' : '#ffd27a'); if (!pid) sfx.impact(); }
  muzzleFlash.visible = true; muzzleFlash.rotation.z = Math.random() * Math.PI; muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
  anim.flashT = 0.04; muzzleLight.intensity = 7; flashLightVM.intensity = 4;
  me.recoil = Math.min(0.12, me.recoil + (aiming ? 0.012 : 0.02)); me.yaw += (Math.random() - 0.5) * 0.006;
  anim.kick += aiming ? 0.018 : 0.03; anim.kickRot += aiming ? 0.025 : 0.05; anim.swayX += (Math.random() - 0.5) * 0.006;
  sfx.shot(1, 0);
}

// ---------- View-model animation: sway, bob, recoil, reload ----------
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
function updateViewModel(dt, now, hs) {
  anim.aimK += ((aiming && me.alive && !me.reloading ? 1 : 0) - anim.aimK) * Math.min(1, dt * 12);
  const k = anim.aimK;
  anim.swayX *= Math.exp(-dt * 7); anim.swayY *= Math.exp(-dt * 7);
  anim.kick *= Math.exp(-dt * 16); anim.kickRot *= Math.exp(-dt * 12);
  if (anim.flashT > 0) { anim.flashT -= dt; if (anim.flashT <= 0) { muzzleFlash.visible = false; muzzleLight.intensity = 0; flashLightVM.intensity = 0; } }
  const moving = me.onGround && hs > 0.5;
  if (moving) anim.bobT += dt * hs * 1.25;
  const amp = (moving ? Math.min(1, hs / 6) : 0) * (1 - k * 0.85);
  const breathe = Math.sin(now / 1000 * 1.6) * 0.0015 * (1 - k * 0.7);
  // reload choreography
  let rx = 0, rz = 0, ry = 0, drop = 0, magRot = 0, charge = 0;
  if (me.reloading) {
    const p = clamp01(1 - (me.reloadEnd - now) / RELOAD_MS);
    const tilt = ease(clamp01(p / 0.15)) * ease(clamp01((1 - p) / 0.15));
    rx = 0.22 * tilt; rz = 0.5 * tilt; ry = -0.03 * tilt;
    if (p < 0.38) { const t = ease(clamp01((p - 0.15) / 0.2)); drop = t; magRot = t * 0.5; }
    else if (p < 0.5) { drop = 1; magRot = 0.5; }
    else { const t = ease(clamp01((p - 0.5) / 0.18)); drop = 1 - t; magRot = 0.5 * (1 - t); }
    if (p > 0.72 && p < 0.86) charge = Math.sin(Math.PI * (p - 0.72) / 0.14);
  }
  RU.mag.position.set(RU.magRest.x, RU.magRest.y - drop * 0.28, RU.magRest.z + drop * 0.05);
  RU.mag.rotation.x = magRot; RU.mag.visible = drop < 0.99;
  RU.charge.position.set(RU.chargeRest.x, RU.chargeRest.y, RU.chargeRest.z + charge * 0.06);
  const base = tmpV.copy(HIP).lerp(ADS, k);
  rig.position.set(
    base.x + Math.sin(anim.bobT) * 0.009 * amp - anim.swayX * 0.5,
    base.y - Math.abs(Math.cos(anim.bobT)) * 0.008 * amp + anim.swayY * 0.5 + breathe + ry,
    base.z + anim.kick);
  rig.rotation.set(anim.kickRot + anim.swayY * 1.2 + rx + 0.04 * (1 - k), -anim.swayX * 1.5 + 0.16 * (1 - k), rz + Math.sin(anim.bobT) * 0.01 * amp);
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
    if ((mouseDown && locked) || (isTouch && touch.fire)) shoot(now, hs > 1.5);
    me.recoil = Math.max(0, me.recoil - dt * 0.35);
    // camera
    if (me.alive && me.vehicleId && me.seat === 0 && !(window.__game?.forceView)) {
      const rec = vehicleField?.get(me.vehicleId);
      const st = rec?.render || rec?.last;
      if (st) {
        const typ = VEHICLE_TYPES[st.type] || VEHICLE_TYPES.car;
        const back = typ.halfL + 4.0, height = typ.h + 1.15;
        const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
        camera.position.set(st.x - fx * back, st.y + height, st.z - fz * back);
        camera.lookAt(st.x + fx * 3.2, st.y + 1.05, st.z + fz * 3.2);
        camera.rotation.z = 0;
        rig.visible = false;
      }
    } else if (me.alive) {
      const bob = me.onGround ? Math.sin(now / 1000 * hs * 1.7) * Math.min(1, hs / 8) * 0.04 : 0;
      camera.position.set(me.pos.x, me.pos.y + EYE_HEIGHT + bob, me.pos.z);
      camera.rotation.set(me.pitch + me.recoil, me.yaw, 0);
      rig.visible = !(me.vehicleId && me.seat === 0);
    } else {
      camera.position.y += (me.pos.y + 0.4 - camera.position.y) * Math.min(1, dt * 4);
      camera.rotation.z += (0.5 - camera.rotation.z) * Math.min(1, dt * 3);
      rig.visible = false;
    }
    const targetFov = aiming && me.alive ? ADS_FOV : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
    if (window.__game?.forceView) {
      const fv = window.__game.forceView;
      camera.position.set(...fv.pos);
      camera.lookAt(...fv.look);
      camera.rotation.z = 0;
      camera.fov = fv.fov || 70; camera.updateProjectionMatrix();
      rig.visible = !fv.hideGun;
    }
    updateViewModel(dt, now, hs);
    // network state @ 30Hz
    sendAcc += dt;
    if (sendAcc >= 1 / 30 && me.alive) { sendAcc = 0; net({ t: 'st', p: me.pos.toArray().map(v => Math.round(v * 100) / 100), yaw: me.yaw, pitch: me.pitch, seq: me.seq, ammo: me.ammo, reserve: me.reserve }); }
    // Ping every 0.5s so the HUD can show RTT (Lagos→Frankfurt is often 150–250ms).
    if (now - pingSentAt > 500) { pingSentAt = now; net({ t: 'ping', n: now }); }
    // Own movement is predicted locally (physics runs here; the server accepts `st`).
    // Remotes render ~100ms in the past; briefly extrapolate if a packet is late.
    const rt = now - 100;
    const camPos = camera.position;
    const fwdX = -Math.sin(camera.rotation.y), fwdZ = -Math.cos(camera.rotation.y);
    for (const r of remotes.values()) {
      const b = r.buf; if (!b.length) continue;
      let a = b[0], c = b[b.length - 1], pair = false, pitch = c.pitch;
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; pair = true; break; }
      const root = r.s.root;
      if (pair) {
        const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
        root.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
        root.rotation.y = lerpAngle(a.yaw, c.yaw, k);
        pitch = a.pitch + (c.pitch - a.pitch) * k;
      } else if (rt > c.t) {
        const ext = Math.min(0.1, (rt - c.t) / 1000);
        root.position.set(c.x + (r.speedX || 0) * ext, c.y, c.z + (r.speedZ || 0) * ext);
        root.rotation.y = c.yaw;
        pitch = c.pitch;
      } else {
        root.position.set(a.x, a.y, a.z);
        root.rotation.y = a.yaw;
        pitch = a.pitch;
      }
      const vx = (root.position.x - r.last.x) / Math.max(dt, 1e-3);
      const vz = (root.position.z - r.last.z) / Math.max(dt, 1e-3);
      const sp = Math.hypot(vx, vz);
      r.speed += (sp - r.speed) * Math.min(1, dt * 10);
      r.speedX = vx; r.speedZ = vz;
      const dx = root.position.x - camPos.x, dz = root.position.z - camPos.z;
      const dist = Math.hypot(dx, camPos.y - root.position.y, dz);
      const culled = dist > 8 && (dx * fwdX + dz * fwdZ) < -2;
      r.s.update(dt, r.speed, pitch, { y: root.position.y, vx, vz, yaw: root.rotation.y, dist, culled });
      r.last.copy(root.position);
    }
    // HUD
    $('hpnum').textContent = Math.ceil(me.hp); $('hpfill').style.width = `${Math.max(0, Math.min(100, me.hp))}%`;
    $('hpfill').style.background = me.hp < 30 ? '#e53935' : '';
    $('arnum').textContent = Math.ceil(me.armour); $('arfill').style.width = `${Math.max(0, Math.min(100, me.armour))}%`;
    $('mag').textContent = me.ammo; $('reserve').textContent = me.reserve;
    $('mag').style.color = me.ammo <= 5 ? '#ff5252' : '';
    $('reloading').classList.toggle('hidden', !me.reloading);
    $('clickhint').classList.toggle('hidden', isTouch || locked || !me.alive || roundOver);
    if (isTouch) refreshMic(comms.micState());
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
  pickupField?.update(now);
  vehicleField?.update(dt, now, {
    id: me.vehicleId && me.seat === 0 ? me.vehicleId : 0,
    aabbs: AABBS,
    inputs: lastDrive,
  });
  updateExplosions(dt, scene);
  if (joined) updateVehHint();
  fpsFrames++;
  if (now - fpsStamp >= 250) {
    fpsVal = fpsFrames / Math.max(0.001, (now - fpsStamp) / 1000);
    fpsFrames = 0; fpsStamp = now;
    const el = $('perfhud');
    if (el) el.textContent = `${Math.round(fpsVal)} FPS · ${Math.round(pingMs)} ms`;
  }
  for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life / 0.08) * 0.85; if (tr.life <= 0) { scene.remove(tr.m); tr.m.material.dispose(); tracers.splice(i, 1); } }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.m.material.opacity = s.life / 0.25; s.m.scale.setScalar(1 + (0.25 - s.life) * 4); if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); } }
  renderer.clear();
  renderer.render(scene, camera);
  if (joined && rig.visible) { renderer.clearDepth(); renderer.render(weaponScene, weaponCamera); }
}
requestAnimationFrame(frame);

initAccount({
  onLoadoutChange(load) { applyRifleSkin(rifle, load.rifle); },
});

// Test hook: ?autojoin=Name joins immediately (used for headless screenshots)
if (params.has('autojoin')) { $('name').value = params.get('autojoin') || 'Tester'; join(); }
window.__game = { me, remotes, comms, anim, rifle, touch, isTouch, camera, scene, renderer, setAim: v => { aiming = v; setAiming(v); }, reload: () => startReload(), fire: () => { me.lastShot = 0; shoot(performance.now(), false); }, get joined() { return joined; }, get map() { return currentMap; }, forceView: null, get vehicles() { return vehicleField; }, tryEnterExit, keys, net, get fps() { return fpsVal; }, get ping() { return pingMs; }, get quality() { return qualityState; }, applyQuality };
