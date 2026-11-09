// All sound effects synthesised with WebAudio — no audio files needed.
let ctx = null, master = null, noiseBuf = null;
export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(t, dur, type, freq, peak, q = 1, dest = master) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.002, peak, dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, dur, type, f0, f1, peak, dest = master) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.003, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
const ok = () => ctx && ctx.state === 'running';

export function shot(vol = 1, pan = 0) {
  if (!ok() || vol < 0.02) return;
  const t = ctx.currentTime;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; let dest = master;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master); dest = p; }
  const g = ctx.createGain(); g.gain.value = vol; g.connect(dest);
  noise(t, 0.16, 'lowpass', 2600 * (0.5 + vol / 2), 0.9, 0.7, g);
  noise(t, 0.05, 'highpass', 3000, 0.35, 0.5, g);
  tone(t, 0.12, 'sine', 160, 45, 0.9, g);
  noise(t + 0.02, 0.4, 'bandpass', 700, 0.12, 0.8, g); // tail/echo
}
export function hit(kill, head) {
  if (!ok()) return; const t = ctx.currentTime;
  tone(t, 0.06, 'square', head ? 2400 : 1800, head ? 2200 : 1700, 0.12);
  if (kill) { tone(t + 0.07, 0.09, 'square', 1200, 1100, 0.15); tone(t + 0.16, 0.18, 'triangle', 1600, 1500, 0.2); }
}
export function empty() { if (!ok()) return; tone(ctx.currentTime, 0.03, 'square', 900, 600, 0.12); }
export function reload() {
  if (!ok()) return; const t = ctx.currentTime;
  noise(t + 0.1, 0.06, 'bandpass', 1800, 0.4, 3); tone(t + 0.1, 0.05, 'square', 400, 300, 0.08);   // mag out
  noise(t + 0.95, 0.08, 'bandpass', 1300, 0.5, 3); tone(t + 0.95, 0.05, 'square', 300, 220, 0.1);  // mag in
  noise(t + 1.45, 0.05, 'bandpass', 2500, 0.45, 4); noise(t + 1.6, 0.07, 'bandpass', 2000, 0.5, 4); // bolt
}
export function hurt() { if (!ok()) return; const t = ctx.currentTime; tone(t, 0.18, 'sine', 120, 60, 0.6); noise(t, 0.1, 'lowpass', 500, 0.4); }
export function death() { if (!ok()) return; const t = ctx.currentTime; tone(t, 0.9, 'sawtooth', 300, 40, 0.25); noise(t, 0.6, 'lowpass', 400, 0.3); }
export function step(vol = 0.25) { if (!ok()) return; noise(ctx.currentTime, 0.07, 'lowpass', 600 + Math.random() * 300, vol, 1); }
export function land() { if (!ok()) return; noise(ctx.currentTime, 0.12, 'lowpass', 400, 0.5); }
export function spawn() { if (!ok()) return; const t = ctx.currentTime; tone(t, 0.15, 'triangle', 440, 660, 0.15); tone(t + 0.12, 0.2, 'triangle', 660, 880, 0.15); }
export function win() { if (!ok()) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.15, 0.35, 'triangle', f, f, 0.25)); }
export function impact() { if (!ok()) return; noise(ctx.currentTime, 0.05, 'bandpass', 3500, 0.15, 2); }
export function pickup(kind) {
  if (!ok()) return; const t = ctx.currentTime;
  const seq = kind === 'armour' ? [392, 523, 659] : kind === 'ammo' ? [330, 440, 554] : [523, 659, 784];
  seq.forEach((f, i) => tone(t + i * 0.06, 0.14, 'triangle', f, f * 1.05, 0.22));
}
export function toast() { /* reserved */ }
