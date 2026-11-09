// Headless multiplayer test: two WebSocket clients join, move, and one shoots the other
// until a kill, verifying hit / hurt / kill / spawn (respawn) messages flow.
// Usage: node test/sim.mjs [ws://localhost:3000/ws]
import WebSocket from 'ws';
const URL = process.argv[2] || `ws://localhost:${process.env.PORT || 3000}/ws`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[sim]', ...a);

function client(name) {
  const ws = new WebSocket(URL); const c = { ws, name, msgs: [], seq: 0, id: 0, waiters: [] };
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
log(ok ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(ok ? 0 : 1);
