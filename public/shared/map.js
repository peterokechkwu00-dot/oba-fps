// Compatibility barrel: constants + the default (Oba) layout, plus the map registry.
export * from './layout.js';
export { getMap, listMaps, MAPS } from './maps.js';

import { getMap, DEFAULT_MAP } from './maps.js';

const _m = getMap(DEFAULT_MAP);
export const BOXES = _m.BOXES;
export const AABBS = _m.AABBS;
export const SPAWNS = _m.SPAWNS;
export const ROADS = _m.ROADS;
export const DIRT = _m.DIRT;
export const PALMS = _m.PALMS;
export const UMBRELLAS = _m.UMBRELLAS;
export const BILLBOARDS = _m.BILLBOARDS;
export const CANOPIES = _m.CANOPIES;
export const RIVERS = _m.RIVERS;
export const PICKUPS = _m.PICKUPS;
export const MAP_NAME = _m.name;
