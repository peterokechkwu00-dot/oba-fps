// On-screen touch controls for phones and tablets. Desktop play is unchanged.
const params = new URLSearchParams(location.search);

export const isTouch = detectTouch();
export const state = { fwd: 0, str: 0, sprint: false, jump: false, fire: false, active: false };

export const LOOK_SENS = 0.0048; // radians per CSS pixel; reduced automatically while aiming
const JOY_RADIUS = 68;
const JOY_DEAD = 0.12;
const JOY_SPRINT = 0.72;

function detectTouch() {
  if (params.has('touch')) return true;
  if (params.has('desktop')) return false;
  const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  return touch && coarse;
}

const $ = id => document.getElementById(id);
const pointers = new Map(); // pointerId -> { kind, ... }
let opts = {};

export function initTouch(handlers) {
  opts = handlers || {};
  if (!isTouch) return;
  document.documentElement.classList.add('touch');
  document.body.classList.add('touch');
  preventPageGestures();
  wirePad();
  wireButtons();
  maybeShowRotateHint();
  const syncOrient = () => document.body.classList.toggle('portrait', innerHeight > innerWidth);
  syncOrient();
  addEventListener('resize', syncOrient);
  addEventListener('orientationchange', syncOrient);
}

export async function requestImmersive() {
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await (screen.orientation && screen.orientation.lock('landscape')); } catch {}
}

export function setTouchVisible(on) {
  state.active = !!on;
  const ui = $('touchui');
  if (ui) ui.classList.toggle('hidden', !on);
  if (on) maybeShowRotateHint();
}

export function setAiming(on) { $('btnAim')?.classList.toggle('on', !!on); }
export function refreshMic(mic) {
  const b = $('btnMic'); if (!b || !mic) return;
  b.textContent = mic.denied ? '⚠️' : (mic.micOn ? '🎤' : '🔇');
  b.classList.toggle('on', !!(mic.micOn && !mic.denied));
  b.classList.toggle('muted', !mic.micOn || !!mic.denied);
}

function preventPageGestures() {
  const allow = t => t.closest && t.closest('input, textarea, #chatinput, #scoreboard, #settings, #rotatehint');
  document.addEventListener('touchmove', e => { if (!allow(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => { if (!allow(e.target)) e.preventDefault(); });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
}

function applyJoy(x, y) {
  const mag = Math.hypot(x, y);
  if (mag < JOY_DEAD) { state.fwd = 0; state.str = 0; state.sprint = false; return; }
  state.str = x; state.fwd = -y;
  state.sprint = mag >= JOY_SPRINT && state.fwd > 0.2;
}

function hideJoy() {
  applyJoy(0, 0);
  $('joybase')?.classList.add('hidden');
}

function wirePad() {
  const pad = $('touchpad'), base = $('joybase'), knob = $('joystick');
  if (!pad) return;

  pad.addEventListener('pointerdown', e => {
    if (!state.active) return;
    e.preventDefault();
    try { pad.setPointerCapture(e.pointerId); } catch {}
    const hasJoy = [...pointers.values()].some(p => p.kind === 'joy');
    if (e.clientX < innerWidth * 0.5 && !hasJoy) {
      pointers.set(e.pointerId, { kind: 'joy', ox: e.clientX, oy: e.clientY });
      base.classList.remove('hidden');
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      knob.style.transform = 'translate(-50%,-50%)';
      applyJoy(0, 0);
    } else {
      pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  });

  const onMove = e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (p.kind === 'joy') {
      const dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, JOY_RADIUS);
      const nx = dx / len * cl, ny = dy / len * cl;
      knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      applyJoy(nx / JOY_RADIUS, ny / JOY_RADIUS);
    } else if (p.kind === 'look') {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      opts.onLook?.(dx, dy);
    }
  };
  const onUp = e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    pointers.delete(e.pointerId);
    if (p.kind === 'joy') hideJoy();
    if (p.fire) state.fire = false;
  };
  addEventListener('pointermove', onMove, { capture: true });
  addEventListener('pointerup', onUp, { capture: true });
  addEventListener('pointercancel', onUp, { capture: true });
  addEventListener('blur', () => { pointers.clear(); hideJoy(); state.fire = false; state.jump = false; });
}

function bindHold(el, down, up) {
  if (!el) return;
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch {}
    down(e);
  });
  const end = e => { e.stopPropagation(); up?.(e); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function wireButtons() {
  bindHold($('btnFire'), e => {
    state.fire = true;
    pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, fire: true });
    opts.onFireStart?.();
  }, () => { state.fire = false; });

  bindHold($('btnJump'), () => { state.jump = true; }, () => { state.jump = false; });
  bindHold($('btnAim'), () => opts.onAimToggle?.());
  bindHold($('btnReload'), () => opts.onReload?.());
  bindHold($('btnMic'), () => { opts.onMic?.(); });
  bindHold($('btnChat'), () => opts.onChat?.());
  bindHold($('btnScore'), () => opts.onScore?.());
  $('sbclose')?.addEventListener('click', () => opts.onScoreClose?.());
}

function maybeShowRotateHint() {
  const hint = $('rotatehint'); if (!hint) return;
  if (sessionStorage.getItem('fps-rotate-ok')) { hint.classList.add('hidden'); return; }
  const show = () => {
    const portrait = innerHeight > innerWidth;
    hint.classList.toggle('hidden', !portrait || !!sessionStorage.getItem('fps-rotate-ok'));
  };
  $('rotateok')?.addEventListener('click', e => {
    e.preventDefault(); sessionStorage.setItem('fps-rotate-ok', '1'); hint.classList.add('hidden');
  });
  addEventListener('resize', show);
  addEventListener('orientationchange', show);
  show();
}
