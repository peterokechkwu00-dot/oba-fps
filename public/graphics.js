// Graphics quality presets. Auto picks Low on phones / weak devices.
export const PRESETS = {
  low: {
    pixelRatio: 1,
    shadows: false,
    shadowSize: 0,
    antialias: false,
    fogNear: 18,
    fogFar: 55,
    far: 68,
    lights: 0,
    aniso: 1,
    texScale: 0.5,
    palms: 'simple',
    farProps: 10,
    farPalms: false,
    stallGoods: false,
    env: false,
  },
  medium: {
    pixelRatio: 1.25,
    shadows: false,
    shadowSize: 0,
    antialias: false,
    fogNear: 28,
    fogFar: 90,
    far: 110,
    lights: 3,
    aniso: 2,
    texScale: 0.75,
    palms: 'reduced',
    farProps: 22,
    farPalms: false,
    stallGoods: false,
    env: true,
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    shadowSize: 2048,
    antialias: true,
    fogNear: 45,
    fogFar: 150,
    far: 220,
    lights: 8,
    aniso: 8,
    texScale: 1,
    palms: 'full',
    farProps: 40,
    farPalms: true,
    stallGoods: true,
    env: true,
  },
};

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.maxTouchPoints > 0) return true;
  if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

export function detectAuto() {
  if (isMobileDevice()) return 'low';
  if (typeof navigator !== 'undefined') {
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return 'low';
    if ((navigator.hardwareConcurrency || 4) >= 8 && (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) >= 1.5) return 'high';
  }
  return 'medium';
}

const KEY = 'fps-graphics';

export function loadQuality() {
  let mode = 'auto';
  try { mode = localStorage.getItem(KEY) || 'auto'; } catch {}
  if (!PRESETS[mode] && mode !== 'auto') mode = 'auto';
  const resolved = mode === 'auto' ? detectAuto() : mode;
  return { mode, resolved, preset: PRESETS[resolved] || PRESETS.medium };
}

export function saveQuality(mode) {
  try { localStorage.setItem(KEY, mode); } catch {}
  return loadQuality();
}
