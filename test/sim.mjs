// Headless multiplayer test: two WebSocket clients join, move, and one shoots the other
// until a kill, verifying hit / hurt / kill / spawn (respawn) messages flow.
// Usage: node test/sim.mjs [ws://localhost:3000/ws]
import WebSocket from 'ws';
import { spawn as spawnProc } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { getMap, listMaps, rayMap, standHeight, PLAYER_RADIUS as PR, PLAYER_HEIGHT as PH, DEFAULT_MAP } from '../public/shared/map.js';
import { vehicleSpawns, firstFreeSeat, createVehicle, VEHICLE_TYPES } from '../public/shared/vehicles.js';

const URL = process.argv[2] || `ws://localhost:${process.env.PORT || 3000}/ws`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[sim]', ...a);

function client(name, url = URL) {
  const ws = new WebSocket(url); const c = { ws, name, msgs: [], seq: 0, id: 0, waiters: [] };
  ws.on('message', d => {
    const m = JSON.parse(d); c.msgs.push(m);
    if (m.t === 'welcome') { c.id = m.id; c.seq = m.seq; }
    if (m.t === 'spawn' && m.id === c.id) c.seq = m.seq;
    c.waiters = c.waiters.filter(w => (w.f(m) ? (w.res(m), false) : true));
  });
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (f, ms = 5000) => new Promise((res, rej) => { const old = c.msgs.find(f); if (old) return res(old); c.waiters.push({ f, res }); setTimeout(() => rej(new Error(`${name}: timeout waiting`)), ms); });
  c.open = new Promise(r => ws.on('open', r));
  return c;
}
const _unused = 0;
const pos = (c, p, yaw = 0) => c.send({ t: 'st', p, yaw, pitch: 0, seq: c.seq });

let ok = true; const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); if (!cond) ok = false; };
try {
  const a = client('Alpha'), b = client('Bravo');
  await Promise.all([a.open, b.open]);
  a.send({ t: 'join', name: 'Alpha' }); b.send({ t: 'join', name: 'Bravo' });
  await a.wait(m => m.t === 'welcome'); await b.wait(m => m.t === 'welcome');
  check(a.id && b.id && a.id !== b.id, `both joined (ids ${a.id}, ${b.id})`);
  // Move both onto the open main road, facing each other 12m apart (x=-2 and x=10, z=-1.5)
  const A = [-2, 0, -1.5], B = [10, 0, -1.5];
  for (let i = 0; i < 10; i++) { pos(a, A, -Math.PI / 2); pos(b, B, Math.PI / 2); await sleep(35); }
  const snap = await a.wait(m => m.t === 's' && m.ps.some(p => p[0] === b.id && Math.abs(p[1] - B[0]) < 0.01));
  check(!!snap, 'snapshot reflects Bravo position update');
  // Alpha shoots Bravo in the chest
  const o = [A[0], 1.6, A[2]], target = [B[0], 1.15, B[2]];
  const d = target.map((v, i) => v - o[i]); const L = Math.hypot(...d); const dir = d.map(v => v / L);
  let hits = 0;
  for (let i = 0; i < 6; i++) {
    pos(a, A, -Math.PI / 2); pos(b, B, Math.PI / 2);
    a.send({ t: 'shoot', o, d: dir, e: target, hit: b.id, head: false });
    await sleep(130);
    if (b.msgs.some(m => m.t === 'kill')) break;
  }
  hits = a.msgs.filter(m => m.t === 'hit' && m.target === b.id).length;
  const hurts = b.msgs.filter(m => m.t === 'hurt');
  check(hits >= 1, `Alpha received ${hits} hit confirmations`);
  check(hurts.length >= 1 && hurts[0].hp === 75, `Bravo took damage (hp sequence: ${hurts.map(h => h.hp).join(',')})`);
  check(b.msgs.some(m => m.t === 'shot' && m.id === a.id), 'Bravo saw Alpha\'s shot (tracer broadcast)');
  const kill = await b.wait(m => m.t === 'kill' && m.victim === b.id, 3000);
  check(kill.killer === a.id, `kill broadcast: ${kill.kn} -> ${kill.vn}`);
  const roster = await a.wait(m => m.t === 'roster' && m.list.find(r => r.id === a.id)?.k === 1);
  check(!!roster, 'roster/scoreboard updated (Alpha kills = 1, Bravo deaths = ' + roster.list.find(r => r.id === b.id).d + ')');
  // wall-blocked shot must be rejected: shoot through the monument at the junction
  const t0 = Date.now();
  const sp = await b.wait(m => m.t === 'spawn' && m.id === b.id && m.seq > 1, 5000);
  check(Date.now() - t0 > 2000, `Bravo respawned after ~3s at (${sp.p.map(v => v.toFixed(1)).join(', ')})`);
  // headshot test after respawn
  b.seq = sp.seq; await sleep(50);
  for (let i = 0; i < 5; i++) { pos(a, A, -Math.PI / 2); pos(b, B, Math.PI / 2); await sleep(35); }
  const hd = [B[0] - o[0], 1.68 - o[1], B[2] - o[2]]; const hl = Math.hypot(...hd);
  const before = a.msgs.length;
  a.send({ t: 'shoot', o, d: hd.map(v => v / hl), e: [B[0], 1.68, B[2]], hit: b.id, head: true });
  const hh = await a.wait(m => m.t === 'hit' && a.msgs.indexOf(m) >= before, 2000);
  check(hh.head && hh.dmg === 50, `headshot registered for ${hh.dmg} damage`);
  // Blocked shot: Bravo hides behind the junction monument, Alpha shoots through it
  await sleep(150);
  const Bh = [0, 0, 3.5], Ah = [0, 0, -6];
  for (let i = 0; i < 6; i++) { pos(a, Ah, 0); pos(b, Bh, Math.PI); await sleep(35); }
  const o2 = [Ah[0], 1.6, Ah[2]]; const d2 = [0, 1.15 - 1.6, Bh[2] - Ah[2]]; const l2 = Math.hypot(...d2);
  const n0 = a.msgs.filter(m => m.t === 'hit').length;
  await sleep(120);
  a.send({ t: 'shoot', o: o2, d: d2.map(v => v / l2), e: [0, 1.15, 3.5], hit: b.id, head: false });
  await sleep(400);
  check(a.msgs.filter(m => m.t === 'hit').length === n0, 'shot through the monument was rejected by server (wall check)');
  // ---- Text chat ----
  a.send({ t: 'chat', msg: '  Hello from Oba! <script>alert(1)</script>  ' });
  const ch = await b.wait(m => m.t === 'chat' && m.id === a.id, 2000);
  check(ch.name === 'Alpha' && ch.msg === 'Hello from Oba! <script>alert(1)</script>', `chat broadcast received by Bravo: "${ch.msg}" (client renders via textContent, so HTML is inert)`);
  check(a.msgs.some(m => m.t === 'chat' && m.id === a.id), 'sender also receives its own chat line');
  await sleep(700);
  a.send({ t: 'chat', msg: 'x'.repeat(500) });
  const long = await b.wait(m => m.t === 'chat' && m.id === a.id && m.msg.startsWith('xxx'), 2000);
  check(long.msg.length === 120, `long message truncated to ${long.msg.length} chars`);
  a.send({ t: 'chat', msg: 'spam1' }); a.send({ t: 'chat', msg: 'spam2' });
  await sleep(300);
  check(!b.msgs.some(m => m.t === 'chat' && m.msg === 'spam2') && a.msgs.some(m => m.t === 'chat' && m.id === 0 && /too fast/.test(m.msg)), 'rate limit blocks rapid-fire messages and warns the sender');
  // ---- Voice signalling relay ----
  a.send({ t: 'rtc', to: b.id, data: { sdp: { type: 'offer', sdp: 'v=0 fake-offer' } } });
  const off = await b.wait(m => m.t === 'rtc' && m.from === a.id, 2000);
  check(off.data.sdp.type === 'offer', 'WebRTC offer relayed A -> B with correct sender id');
  b.send({ t: 'rtc', to: a.id, data: { sdp: { type: 'answer', sdp: 'v=0 fake-answer' } } });
  b.send({ t: 'rtc', to: a.id, data: { ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0' } } });
  const ans = await a.wait(m => m.t === 'rtc' && m.from === b.id && m.data.sdp, 2000);
  const ice = await a.wait(m => m.t === 'rtc' && m.from === b.id && m.data.ice, 2000);
  check(ans.data.sdp.type === 'answer' && !!ice.data.ice.candidate, 'answer + ICE candidate relayed B -> A');
  a.send({ t: 'talk', on: true });
  const tk = await b.wait(m => m.t === 'talk' && m.id === a.id, 2000);
  check(tk.on === true, 'push-to-talk state (speaking indicator) broadcast');
  // ---- leave message ----
  a.ws.close();
  const lv = await b.wait(m => m.t === 'feed' && /Alpha left/.test(m.msg), 2000);
  check(!!lv, 'leave message shown to remaining players');
  b.ws.close();
} catch (e) { ok = false; log('ERROR', e.message); }

function overlapsPlayer(x, y, z, a, r = PR, h = PH) {
  return x + r > a.min[0] && x - r < a.max[0] && z + r > a.min[2] && z - r < a.max[2] && y + h > a.min[1] && y < a.max[1];
}

log('--- soldier model ---');
try {
  const glb = await import('fs/promises').then(fs => fs.readFile(path.join(ROOT, 'public/models/Soldier.glb')));
  const magic = glb.readUInt32LE(0);
  check(magic === 0x46546C67 && glb.length > 100000, `Soldier.glb is a glTF binary (${glb.length} bytes)`);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.slice(20, 20 + jsonLen).toString('utf8'));
  const clips = (json.animations || []).map(a => a.name).sort();
  check(clips.join(',') === 'Idle,Run,TPose,Walk', `clips: ${clips.join(', ')}`);
  const bones = (json.nodes || []).map(n => n.name);
  check(['mixamorig:Hips','mixamorig:Spine2','mixamorig:Head','mixamorig:RightHand'].every(b => bones.includes(b)), 'mixamo hips/spine/head/right-hand bones present');
} catch (e) { ok = false; log('ERROR', e.message); }

log('--- map data ---');
try {
  const ids = listMaps().map(m => m.id);
  check(ids.join(',') === 'oba,onitsha,nnewi,awka', `registry lists four maps (${ids.join(', ')})`);
  check(DEFAULT_MAP === 'oba', 'default map is oba');
  for (const { id, name } of listMaps()) {
    const m = getMap(id);
    const solids = m.BOXES.filter(b => b.solid !== false);
    check(m.id === id && m.name === name && m.AABBS.length === solids.length, `${id}: id/name/aabbs match`);
    check(Array.isArray(m.INTERIORS) && m.INTERIORS.length >= 3, `${id}: ${m.INTERIORS?.length || 0} enterable buildings`);
    check(m.SPAWNS.length >= 8, `${id}: ${m.SPAWNS.length} spawn points`);
    const blocked = m.SPAWNS.filter(s => m.AABBS.some(a => overlapsPlayer(s[0], 0, s[1], a)));
    check(blocked.length === 0, `${id}: all spawns are walkable`);
    const kinds = { med: 0, armour: 0, ammo: 0 };
    for (const pk of m.PICKUPS) kinds[pk.kind]++;
    check(kinds.med >= 3 && kinds.armour >= 2 && kinds.ammo >= 3, `${id}: pickups med=${kinds.med} armour=${kinds.armour} ammo=${kinds.ammo}`);
    const t = rayMap([0, 20, 0], [0, -1, 0], m.AABBS);
    check(t < 30, `${id}: downward ray hits geometry (t=${t.toFixed(2)})`);
  }
  const through = rayMap([0, 1.6, -6], [0, 0, 1], getMap('oba').AABBS);
  check(through < 7, `oba monument blocks a shot along +Z from (0,-6) (t=${through.toFixed(2)})`);
  const w = rayMap([-22, 1.6, -20], [0, 0, -1], getMap('onitsha').AABBS);
  check(w < 16, `onitsha warehouse blocks a shot north from the lane (t=${w.toFixed(2)})`);
  const shed = rayMap([0, 1.6, -16], [-1, 0, 0], getMap('nnewi').AABBS);
  check(shed < 20, `nnewi west shed blocks a shot west from the yard (t=${shed.toFixed(2)})`);
  const hq = rayMap([0, 1.6, -16], [0, 0, -1], getMap('awka').AABBS);
  check(hq < 16, `awka HQ blocks a shot north across the parade ground (t=${hq.toFixed(2)})`);

  // Enterable interiors: walkable floors, shots through windows, walls still block
  for (const { id } of listMaps()) {
    const m = getMap(id);
    const indoor = (m.PICKUPS || []).filter(pk => m.INTERIORS.some(b =>
      pk.x >= b.x - b.w / 2 + 0.4 && pk.x <= b.x + b.w / 2 - 0.4 &&
      pk.z >= b.z - b.d / 2 + 0.4 && pk.z <= b.z + b.d / 2 - 0.4));
    check(indoor.length >= 1, `${id}: at least one indoor pickup (${indoor.length})`);
    for (const b of m.INTERIORS) {
      const stuck = m.AABBS.some(a =>
        b.inside[0] + PR > a.min[0] && b.inside[0] - PR < a.max[0] &&
        b.inside[1] + PR > a.min[2] && b.inside[1] - PR < a.max[2] &&
        0 + PH > a.min[1] && 0 < a.max[1]);
      check(!stuck, `${id}/${b.id}: ground floor interior is walkable`);
      for (const lv of (b.levels || [])) {
        if (lv.y <= 0) continue;
        const sh = standHeight(lv.x, lv.z, m.AABBS, lv.y + 0.05);
        const bodyHit = m.AABBS.some(a =>
          lv.x + PR > a.min[0] && lv.x - PR < a.max[0] &&
          lv.z + PR > a.min[2] && lv.z - PR < a.max[2] &&
          lv.y + PH > a.min[1] && lv.y < a.max[1]);
        check(Math.abs(sh - lv.y) < 0.3 && !bodyHit, `${id}/${b.id}: floor at y=${lv.y.toFixed(2)} is standable (stand=${sh.toFixed(2)})`);
      }
      if (b.window) {
        const t = rayMap(b.window.o, b.window.d, m.AABBS);
        check(t > b.window.through, `${id}/${b.id}: shot through a window (t=${t.toFixed(2)} > ${b.window.through.toFixed(2)})`);
      }
      if (b.wall) {
        const t = rayMap(b.wall.o, b.wall.d, m.AABBS);
        check(t < b.wall.maxT, `${id}/${b.id}: wall still blocks a shot (t=${t.toFixed(2)})`);
      }
    }
  }
} catch (e) { ok = false; log('ERROR', e.message); }

function waitListen(child, ms = 8000) {
  return new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('server start timeout: ' + buf)), ms);
    const on = d => { buf += d; if (/listening/.test(buf)) { clearTimeout(t); res(); } };
    child.stdout.on('data', on);
    child.stderr.on('data', on);
    child.on('exit', code => { clearTimeout(t); rej(new Error(`server exited ${code}: ${buf}`)); });
  });
}

async function withTestServer(env, fn) {
  const port = Number(env.PORT);
  const child = spawnProc('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, BOTS: '0', ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitListen(child);
    await fn(`ws://127.0.0.1:${port}/ws`);
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    try { child.kill('SIGKILL'); } catch {}
  }
}

log('--- pickups, armour, regen, map vote ---');
try {
  await withTestServer({
    PORT: 3199, BOTS: 0, WIN_KILLS: 1, VOTE_MS: 1500,
    MED_RESPAWN: 400, ARM_RESPAWN: 8000, AMMO_RESPAWN: 400,
    REGEN_DELAY: 400, REGEN_RATE: 20, MAP: 'oba',
  }, async (url) => {
    const a = client('Alpha', url), b = client('Bravo', url);
    await Promise.all([a.open, b.open]);
    a.send({ t: 'join', name: 'Alpha' }); b.send({ t: 'join', name: 'Bravo' });
    const wa = await a.wait(m => m.t === 'welcome');
    const wb = await b.wait(m => m.t === 'welcome');
    check(wa.map?.id === 'oba' && wb.map?.name === 'Oba, Anambra', `welcome includes map (${wa.map?.id})`);
    check(Array.isArray(wa.pickups) && wa.pickups.length >= 10, `welcome includes ${wa.pickups.length} pickups`);
    check(wa.timers?.vote === 1500 && wa.timers?.med === 400, `timers honoured (vote=${wa.timers?.vote}, med=${wa.timers?.med})`);

    const stand = async (c, p, n = 8) => { for (let i = 0; i < n; i++) { pos(c, p); await sleep(40); } };

    // Armour at the junction plinth, then a body shot: 2/3 absorbed, raw dmg still 25
    const Arm = [3.4, 0, 0];
    await stand(b, Arm);
    const gotArm = await b.wait(m => m.t === 'got' && m.kind === 'armour', 3000);
    check(gotArm.armour === 50, `armour pickup granted 50 (armour=${gotArm.armour})`);

    // Step off the pad immediately so the vest cannot be taken twice
    const A = [3.4, 0, 10], Bpos = [3.4, 0, 4];
    pos(b, Bpos);
    await stand(a, A); await stand(b, Bpos, 6);
    const o = [A[0], 1.6, A[2]], tgt = [Bpos[0], 1.15, Bpos[2]];
    const dir = tgt.map((v, i) => v - o[i]); const ln = Math.hypot(...dir);
    const beforeHits = a.msgs.filter(m => m.t === 'hit').length;
    a.send({ t: 'shoot', o, d: dir.map(v => v / ln), e: tgt, hit: b.id, head: false });
    const hurt = await b.wait(m => m.t === 'hurt' && m.hp < 100, 2000);
    const hit = await a.wait(m => m.t === 'hit' && a.msgs.filter(x => x.t === 'hit').length > beforeHits, 2000);
    check(hit.dmg === 25, `hit still reports raw damage ${hit.dmg}`);
    check(hurt.hp === 92 && hurt.armour === 33, `armour absorbed 17 of 25 (hp=${hurt.hp}, armour=${hurt.armour})`);

    // Medkit heals (do this before regen fills health), cap 100, no grant when full
    const Med = [19, 0, -5];
    const gots = () => b.msgs.filter(m => m.t === 'got' && m.kind === 'med').length;
    const nMed = gots();
    await stand(b, Med);
    const gotMed = await b.wait(m => m.t === 'got' && m.kind === 'med', 3000);
    check(gotMed.hp === 100, `medkit healed to cap (hp=${gotMed.hp})`);
    await sleep(250);
    check(gots() === nMed + 1, 'full health does not consume another medkit');
    const disappeared = b.msgs.some(m => m.t === 'pickup' && m.id === gotMed.id && m.up === false);
    check(disappeared, 'pickup removed for everyone after it was taken');
    const back = await b.wait(m => m.t === 'pickup' && m.id === gotMed.id && m.up === true, 3000);
    check(!!back, 'medkit respawned after its timer');
    await sleep(200);
    check(gots() === nMed + 1, 'respawned medkit is not taken while health is already full');

    // Regen: step off, take a body shot, wait past the delay
    const Off = [10, 0, -1.5];
    await stand(b, Off); await stand(a, [-8, 0, -1.5]);
    const oR = [-8, 1.6, -1.5], tR = [10, 1.15, -1.5];
    const dR = tR.map((v, i) => v - oR[i]), lR = Math.hypot(...dR);
    a.send({ t: 'shoot', o: oR, d: dR.map(v => v / lR), e: tR, hit: b.id, head: false });
    const hurt2 = await b.wait(m => m.t === 'hurt' && m.hp < 100, 2000);
    const hp0 = hurt2.hp;
    const mark = b.msgs.length;
    await sleep(900);
    const snap = await b.wait(m => m.t === 's' && b.msgs.indexOf(m) >= mark && m.ps.some(p => p[0] === b.id && p[6] > hp0), 3000);
    const row = snap.ps.find(p => p[0] === b.id);
    check(row[6] > hp0, `health regen after delay (hp ${hp0} -> ${row[6]})`);

    // Ammo crate
    const Ammo = [-5, 0, 6];
    await stand(b, [0, 0, 6]); // step off the med
    await stand(b, Ammo);
    const gotAmmo = await b.wait(m => m.t === 'got' && m.kind === 'ammo', 3000);
    check(gotAmmo.reserve === 240, `ammo pickup +90 reserve (reserve=${gotAmmo.reserve})`);

    // First kill wins the round (WIN_KILLS=1). Bravo may have leftover armour — shoot until dead.
    await stand(a, [-8, 0, -1.5]); await stand(b, [8, 0, -1.5]);
    const o2 = [-8, 1.6, -1.5], t2 = [8, 1.15, -1.5];
    const d2 = t2.map((v, i) => v - o2[i]); const l2 = Math.hypot(...d2);
    for (let i = 0; i < 12; i++) {
      pos(a, [-8, 0, -1.5], -Math.PI / 2); pos(b, [8, 0, -1.5], Math.PI / 2);
      a.send({ t: 'shoot', o: o2, d: d2.map(v => v / l2), e: t2, hit: b.id, head: false });
      await sleep(120);
      if (a.msgs.some(m => m.t === 'roundEnd')) break;
    }
    const end = await a.wait(m => m.t === 'roundEnd', 4000);
    check(end.maps?.length === 3 && end.maps.every(m => m.id !== 'oba'), `vote offers the 3 other maps (${(end.maps || []).map(m => m.id).join(', ')})`);
    check(end.ms === 1500, `vote window is 15s (test: ${end.ms}ms)`);
    a.send({ t: 'vote', map: 'onitsha' });
    b.send({ t: 'vote', map: 'onitsha' });
    const vc = await a.wait(m => m.t === 'votes' && m.counts?.onitsha >= 2, 2000);
    check(vc.counts.onitsha === 2, `both votes counted (onitsha=${vc.counts.onitsha})`);
    const rs = await a.wait(m => m.t === 'roundStart', 3000);
    check(rs.map?.id === 'onitsha' && Array.isArray(rs.pickups) && rs.pickups.length > 0, `round starts on the voted map (${rs.map?.id})`);
    const sp = await b.wait(m => m.t === 'spawn' && m.id === b.id && m.seq > 1, 2000);
    const onitshaSpawns = getMap('onitsha').SPAWNS;
    const onSpawn = onitshaSpawns.some(s => Math.abs(s[0] - sp.p[0]) < 0.01 && Math.abs(s[1] - sp.p[2]) < 0.01);
    check(onSpawn, `post-switch spawn is on the new map (${sp.p.map(v => v.toFixed(1)).join(', ')})`);

    // Wall check on the new map: warehouse A occupies z ≈ -39.5..-32.5 at x=-22
    b.seq = sp.seq;
    const Ah = [-22, 0, -20], Bh = [-22, 0, -38];
    // Bravo may be blocked at -38 (inside warehouse). Place him south of the far wall, north of the warehouse? 
    // Instead shoot through the warehouse from the lane toward a player standing past it, near the north wall.
    // Player at z=-38 is inside the warehouse AABB (z -39.5..-32.5) — server still accepts position clamp but collision isn't applied to st.
    // The wall check uses rayMap, so a shot from z=-20 to z=-38 should be blocked.
    for (let i = 0; i < 6; i++) { pos(a, Ah, 0); pos(b, Bh, Math.PI); await sleep(35); }
    const o3 = [-22, 1.6, -20], d3 = [0, 1.15 - 1.6, -38 - -20], l3 = Math.hypot(...d3);
    const nHit = a.msgs.filter(m => m.t === 'hit').length;
    a.send({ t: 'shoot', o: o3, d: d3.map(v => v / l3), e: [-22, 1.15, -38], hit: b.id, head: false });
    await sleep(400);
    check(a.msgs.filter(m => m.t === 'hit').length === nHit, 'shot through Onitsha warehouse was rejected (per-map collision)');
    a.ws.close(); b.ws.close();
  });
} catch (e) { ok = false; log('ERROR', e.message); }


log('--- vehicles ---');
try {
  for (const { id } of listMaps()) {
    const sp = vehicleSpawns(id);
    const kinds = new Set(sp.map(s => s.type));
    check(sp.length >= 4, `${id}: ${sp.length} vehicle spawns`);
    check(kinds.has('keke') && kinds.has('car') && kinds.has('danfo'), `${id}: has keke, car and danfo`);
    const blocked = sp.filter(s => {
      const m = getMap(id);
      return m.AABBS.some(a =>
        s.x > a.min[0] && s.x < a.max[0] && s.z > a.min[2] && s.z < a.max[2] && a.min[1] <= 0.2 && a.max[1] > 0.6);
    });
    check(blocked.length === 0, `${id}: vehicle spawns are not inside solid volumes` + (blocked.length ? ` (${JSON.stringify(blocked)})` : ''));
  }
  const keke = createVehicle(1, { type: 'keke', x: 0, z: 0, yaw: 0 });
  check(firstFreeSeat(keke) === 0, 'empty keke offers the driver seat');
  keke.seats[0] = 1; keke.seats[1] = 2; keke.seats[2] = 3;
  check(firstFreeSeat(keke) === -1, 'a full keke (3 seats) rejects another rider');
  check(VEHICLE_TYPES.car.seats === 4 && VEHICLE_TYPES.danfo.seats === 6, 'car seats 4, danfo seats 6');

  await withTestServer({
    PORT: 3195, BOTS: 0, WIN_KILLS: 50, VOTE_MS: 15000, MAP: 'oba', VEH_RESPAWN: 600,
  }, async (url) => {
    const a = client('Alpha', url), b = client('Bravo', url);
    await Promise.all([a.open, b.open]);
    a.send({ t: 'join', name: 'Alpha' }); b.send({ t: 'join', name: 'Bravo' });
    const wa = await a.wait(m => m.t === 'welcome');
    await b.wait(m => m.t === 'welcome');
    check(Array.isArray(wa.vehicles) && wa.vehicles.length >= 4, `welcome includes ${wa.vehicles?.length} vehicles`);
    const types = new Set((wa.vehicles || []).map(v => v[1]));
    check(types.has(0) && types.has(1) && types.has(2), 'welcome vehicles include keke, car and danfo');

    const kekeRow = wa.vehicles.find(v => v[1] === 0);
    const carRow = wa.vehicles.find(v => v[1] === 1);
    check(!!kekeRow && !!carRow, 'found a keke and a car to test');
    const kx = kekeRow[2], kz = kekeRow[4], kid = kekeRow[0];
    const stand = async (c, p, n = 8) => { for (let i = 0; i < n; i++) { pos(c, p); await sleep(40); } };

    await stand(a, [kx + 1.6, 0, kz]);
    a.send({ t: 'enter', id: kid });
    const en = await a.wait(m => m.t === 'venter', 3000);
    check(en.ok && en.seat === 0, `Alpha enters the keke as driver (ok=${en.ok}, seat=${en.seat})`);

    await stand(b, [kx - 1.6, 0, kz]);
    b.send({ t: 'enter', id: kid });
    const en2 = await b.wait(m => m.t === 'venter', 3000);
    check(en2.ok && en2.seat === 1, `Bravo enters as passenger (ok=${en2.ok}, seat=${en2.seat})`);

    const snap = await a.wait(m => m.t === 's' && m.vs?.some(v => v[0] === kid && v[8] === a.id && v[9] === b.id), 3000);
    check(!!snap, 'snapshot lists both occupants in the keke seats');

    a.send({ t: 'drive', th: 1, st: 0, br: false });
    await sleep(400);
    const moved = await a.wait(m => m.t === 's' && m.vs?.some(v => v[0] === kid && Math.abs(v[2] - kx) + Math.abs(v[4] - kz) > 0.4), 3000);
    check(!!moved, 'driving the keke moves it');

    b.send({ t: 'exit' });
    const ex = await b.wait(m => m.t === 'vexit', 2000);
    check(ex.id === kid, 'Bravo exited the keke');
    a.send({ t: 'exit' });
    await a.wait(m => m.t === 'vexit', 2000);

    // Seat limit: fill remaining mentally already tested statically; here a third enter after 2 is seat 2 if we re-enter
    // Damage + explosion + respawn on the empty car
    const cx = carRow[2], cz = carRow[4], cid = carRow[0];
    const from = [cx, 0, cz + 6];
    await stand(a, from);
    await stand(b, [cx + 3.5, 0, cz]); // close enough for blast, not inside the car
    const hpBefore = 100;
    const o = [from[0], 1.6, from[2]], d = [0, (0.7 - 1.6), cz - from[2]];
    const ln = Math.hypot(...d);
    let boom = null;
    for (let i = 0; i < 20; i++) {
      pos(a, from);
      a.send({ t: 'shoot', o, d: d.map(v => v / ln), e: [cx, 0.7, cz] });
      await sleep(120);
      boom = a.msgs.find(m => m.t === 'vboom' && m.id === cid);
      if (boom) break;
    }
    check(!!boom, 'enough shots destroy the car and it explodes');
    const hurt = b.msgs.find(m => m.t === 'hurt' && m.hp < hpBefore);
    check(!!hurt, `explosion damaged a nearby player (hp=${hurt?.hp})`);
    const back = await a.wait(m => m.t === 'vspawn' || (m.t === 's' && m.vs?.some(v => v[0] === cid && v[7] === 1 && v[6] >= 140)), 4000);
    check(!!back, 'destroyed car respawned after its timer');

    a.ws.close(); b.ws.close();
  });
} catch (e) { ok = false; log('ERROR', e.message); }

log(ok ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(ok ? 0 : 1);
