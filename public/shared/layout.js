// Shared layout helpers used to author every map (server + client).
import { addEnterable } from './interior.js';
import { attachGrid, rayAABB, rayMap, standHeight, queryAABBs, getGrid } from './grid.js';
export { rayAABB, rayMap, standHeight, queryAABBs, getGrid, attachGrid };

export const N = 'n', S = 's', E = 'e', W = 'w';

export function createLayout(id, name, theme = {}) {
  const BOXES = [];
  const ROADS = [];
  const DIRT = [];
  const PALMS = [];
  const UMBRELLAS = [];
  const BILLBOARDS = [];
  const CANOPIES = [];
  const RIVERS = [];
  const PICKUPS = [];
  const LIGHTS = [];
  const INTERIORS = [];
  let SPAWNS = [];
  const ARENA_HALF = theme.arenaHalf || 40;

  function box(x, z, w, d, h, k = 'crate', y = 0, extra = {}) {
    const b = { x, y, z, w, h, d, k, ...extra };
    BOXES.push(b);
    return b;
  }
  function shop(x, z, w, d, text, face, bg, fg = '#fff', c = '#d9cfb8', h = 3) {
    return box(x, z, w, d, h, 'shop', 0, { c, sign: { text, face, bg, fg } });
  }
  function pickup(kind, x, z, y = 0) { PICKUPS.push({ kind, x, y, z }); }
  function perimeter(h = 5) {
    box(0, -ARENA_HALF - 0.5, ARENA_HALF * 2 + 2, 1, h, 'wall');
    box(0, ARENA_HALF + 0.5, ARENA_HALF * 2 + 2, 1, h, 'wall');
    box(-ARENA_HALF - 0.5, 0, 1, ARENA_HALF * 2 + 2, h, 'wall');
    box(ARENA_HALF + 0.5, 0, 1, ARENA_HALF * 2 + 2, h, 'wall');
  }
  function enterable(opts) { return addEnterable({ box, BOXES, LIGHTS, INTERIORS }, opts); }
  function finish() {
    for (const p of PALMS) box(p.x, p.z, 0.5, 0.5, p.h, 'palm', 0, { invisible: true });
    const AABBS = BOXES.filter(b => b.solid !== false).map(b => ({
      min: [b.x - b.w / 2, b.y, b.z - b.d / 2],
      max: [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2],
    }));
    attachGrid(AABBS, ARENA_HALF);
    return {
      id, name, theme, ARENA_HALF, BOXES, AABBS, ROADS, DIRT, PALMS, UMBRELLAS,
      BILLBOARDS, CANOPIES, RIVERS, PICKUPS, SPAWNS, LIGHTS, INTERIORS,
    };
  }
  return {
    BOXES, ROADS, DIRT, PALMS, UMBRELLAS, BILLBOARDS, CANOPIES, RIVERS, PICKUPS, LIGHTS, INTERIORS,
    get SPAWNS() { return SPAWNS; },
    set SPAWNS(v) { SPAWNS = v; },
    box, shop, pickup, perimeter, enterable, finish, N, S, E, W, ARENA_HALF,
  };
}

// Gameplay constants (shared by server and client).
export const MAP_NAME = 'Oba, Anambra'; // default; prefer getMap().name
export const DEFAULT_MAP = 'oba';
export const ARENA_HALF = 40;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.6;
export const HEAD_Y = 1.68;
export const CHEST_Y = 1.15;
export const MAX_HP = 100;
export const MAX_ARMOUR = 100;
export const BODY_DMG = 25;
export const HEAD_DMG = 50;
export const ARMOUR_ABSORB = 2 / 3;
export const FIRE_INTERVAL = 100;
export const MAG_SIZE = 30;
export const RESERVE_AMMO = 150;
export const MAX_RESERVE = 270;
export const AMMO_GIVE = 90;
export const MED_HEAL = 50;
export const ARMOUR_GIVE = 50;
export const RELOAD_MS = 1800;
export const RESPAWN_MS = 3000;
export const REGEN_DELAY = 5000;
export const REGEN_RATE = 10;
export const PICKUP_RADIUS = 1.45;
export const MED_RESPAWN = 20000;
export const ARM_RESPAWN = 30000;
export const AMMO_RESPAWN = 15000;
export const PICKUP_RESPAWN = { med: MED_RESPAWN, armour: ARM_RESPAWN, ammo: AMMO_RESPAWN };
