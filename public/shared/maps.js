// Registry of every playable map. Server and client load a map by id.
import { DEFAULT_MAP } from './layout.js';
import { buildOba } from './map-oba.js';
import { buildOnitsha } from './map-onitsha.js';
import { buildNnewi } from './map-nnewi.js';
import { buildAwka } from './map-awka.js';

const BUILDERS = {
  oba: buildOba,
  onitsha: buildOnitsha,
  nnewi: buildNnewi,
  awka: buildAwka,
};

const cache = new Map();

export { DEFAULT_MAP };

export function listMaps() {
  return [
    { id: 'oba', name: 'Oba, Anambra' },
    { id: 'onitsha', name: 'Onitsha Main Market' },
    { id: 'nnewi', name: 'Nnewi Industrial' },
    { id: 'awka', name: 'Awka Barracks' },
  ];
}

export function getMap(id) {
  const key = BUILDERS[id] ? id : DEFAULT_MAP;
  if (!cache.has(key)) cache.set(key, BUILDERS[key]());
  return cache.get(key);
}

export const MAPS = listMaps();
