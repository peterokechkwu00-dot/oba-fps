// Shared shop catalog and XP rules. The server is the authority for prices and grants.
export const XP_KILL = 50;
export const XP_WIN = 200;
export const XP_PER_LEVEL = 250;

export function levelFromXp(xp) {
  return 1 + Math.max(0, Math.floor((Number(xp) || 0) / XP_PER_LEVEL));
}
export function xpIntoLevel(xp) {
  return (Number(xp) || 0) % XP_PER_LEVEL;
}

export const ITEMS = [
  { id: 'camo_olive',  slot: 'camo',  name: 'Olive Field',        priceKobo: 0,      free: true,  color: '#4f6b3a' },
  { id: 'camo_eagles', slot: 'camo',  name: 'Green Eagles',       priceKobo: 50000,  color: '#1b7a3a' },
  { id: 'camo_tan',    slot: 'camo',  name: 'Desert Tan',         priceKobo: 50000,  color: '#c2a36b' },
  { id: 'camo_urban',  slot: 'camo',  name: 'Urban Grey',         priceKobo: 50000,  color: '#5c6370' },
  { id: 'camo_ankara', slot: 'camo',  name: 'Ankara Pattern',     priceKobo: 150000, color: '#c62828', pattern: 'ankara' },
  { id: 'camo_gold',   slot: 'camo',  name: 'Gold',               priceKobo: 200000, color: '#d4a017' },

  { id: 'rifle_standard', slot: 'rifle', name: 'Standard Issue',      priceKobo: 0,      free: true },
  { id: 'rifle_carbon',   slot: 'rifle', name: 'Carbon',              priceKobo: 100000 },
  { id: 'rifle_gwg',      slot: 'rifle', name: 'Green-White-Green',   priceKobo: 150000 },
  { id: 'rifle_gold',     slot: 'rifle', name: 'Gold',                priceKobo: 200000 },

  { id: 'tag_red',   slot: 'tag', name: 'Crimson Tag',     priceKobo: 0,      free: true,  color: '#ff5a4f' },
  { id: 'tag_white', slot: 'tag', name: 'White Tag',       priceKobo: 50000,  color: '#f5f5f5' },
  { id: 'tag_lime',  slot: 'tag', name: 'Lime Tag',        priceKobo: 50000,  color: '#c9e265' },
  { id: 'tag_green', slot: 'tag', name: 'Eagle Green Tag', priceKobo: 50000,  color: '#2e7d32' },
  { id: 'tag_gold',  slot: 'tag', name: 'Gold Tag',        priceKobo: 100000, color: '#ffd54f' },
];

export const DEFAULT_LOADOUT = { camo: 'camo_olive', rifle: 'rifle_standard', tag: 'tag_red' };

export const RIFLE_SKINS = {
  rifle_standard: { metal: '#a4a8ad', black: '#1d1e21', polymer: '#26272a', wood: '#8a4f27', mag: '#7a3a22' },
  rifle_carbon:   { metal: '#3a3d42', black: '#111111', polymer: '#1a1a1a', wood: '#222222', mag: '#2a2a2a' },
  rifle_gwg:      { metal: '#1b7a3a', black: '#0e3d1e', polymer: '#f2f2f2', wood: '#1b7a3a', mag: '#1b7a3a' },
  rifle_gold:     { metal: '#d4b44a', black: '#8a7018', polymer: '#c9a227', wood: '#e8c547', mag: '#b8860b' },
};

export function getItem(id) { return ITEMS.find(i => i.id === id) || null; }
export function itemsBySlot(slot) { return ITEMS.filter(i => i.slot === slot); }
export function formatNaira(kobo) {
  const n = Math.round(kobo / 100);
  return '₦' + n.toLocaleString('en-NG');
}
export function isFree(item) { return !item.priceKobo || item.free; }
