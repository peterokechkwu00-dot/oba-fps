// Map: "Onitsha Main Market" — dense market lanes, warehouses, Niger Bridge backdrop.
import { createLayout } from './layout.js';

export function buildOnitsha() {
  const L = createLayout('onitsha', 'Onitsha Main Market', { sky: '#b7d4e6', fog: '#d5e4ec', ground: 'laterite' });
  const { box, shop, pickup, perimeter, N, S, E, W, ROADS, DIRT, PALMS, UMBRELLAS, BILLBOARDS, RIVERS } = L;
  perimeter(5);

  // Niger River + bridge backdrop (west, just outside the wall)
  RIVERS.push({ x: -50, z: 0, w: 16, d: 90 });
  box(-44, 0, 18, 8, 1.2, 'concrete', 3); // bridge deck (visual, mostly outside)
  box(-44, -4.2, 18, 0.4, 1.0, 'parapet', 4.2);
  box(-44, 4.2, 18, 0.4, 1.0, 'parapet', 4.2);
  box(-36, 0, 2, 2, 6, 'concrete'); // pier
  box(-50, 0, 2, 2, 6, 'concrete');

  // Main market roads
  ROADS.push({ x: 0, z: 0, w: 80, d: 8, main: true });
  ROADS.push({ x: 0, z: -20, w: 8, d: 40 });
  ROADS.push({ x: 16, z: 20, w: 8, d: 32 });

  DIRT.push({ x: -22, z: -24, w: 36, d: 28, light: true });
  DIRT.push({ x: 22, z: -24, w: 36, d: 28, light: true });
  DIRT.push({ x: -20, z: 24, w: 40, d: 26, light: true });
  DIRT.push({ x: 22, z: 26, w: 30, d: 22, light: true });

  BILLBOARDS.push({ x: 0, z: -5.5, y: 3.2, w: 14, h: 1.8, rot: 0, text: 'ONITSHA MAIN MARKET', sub: 'OCHANJA • MAIN MARKET • BRIDGE HEAD', bg: '#b71c1c', fg: '#ffeb3b' });
  box(-7, -5.5, 0.25, 0.25, 5, 'pole'); box(7, -5.5, 0.25, 0.25, 5, 'pole');

  // Roadside shops along the main street
  shop(-32, -6.5, 6, 3.2, 'OCHANJA PHONES', S, '#0d47a1');
  shop(-24, -6.5, 6, 3.2, 'ELECTRICAL PARTS', S, '#f9a825', '#000');
  shop(20, -6.5, 6, 3.2, 'OKWE TEXTILES', S, '#6a1b9a');
  shop(28, -6.5, 6, 3.2, 'BRIDGE HEAD PHARMACY', S, '#00695c');
  shop(-32, 6.5, 6, 3.2, 'GOD IS GOOD SHOES', N, '#c62828');
  shop(-24, 6.5, 6, 3.2, 'GENERATOR SALES', N, '#37474f', '#ffd54f');
  shop(20, 6.5, 6, 3.2, 'NWANYI OMA PROVISIONS', N, '#e65100');
  shop(28, 6.5, 6, 3.2, 'POS • CASH OUT', N, '#1565c0', '#ffeb3b');

  // Dense stall blocks (leave walkable alleys)
  const cols = [['#e53935', '#fff'], ['#1e88e5', '#fdd835'], ['#43a047', '#fff'], ['#fb8c00', '#fff'], ['#8e24aa', '#fdd835']];
  let ui = 0;
  function stallBlock(xs, zs) {
    for (const z of zs) for (const x of xs) {
      box(x, z, 2.5, 1.5, 0.95, 'stall');
      const [c1, c2] = cols[ui++ % cols.length];
      UMBRELLAS.push({ x, z, c1, c2 });
    }
  }
  stallBlock([-36, -31, -26], [-14, -20, -26, -32]);
  stallBlock([-14, -9], [-14, -20, -26, -32]);
  stallBlock([8, 13, 24, 29, 34], [-14, -20, -26, -32]);
  stallBlock([-36, -31, -14, -9], [14, 20, 26, 32]);
  stallBlock([24, 29, 34], [14, 22, 30]);

  // Warehouses along the north, with roof access
  box(-22, -36, 22, 7, 5, 'building', 0, { c: '#b0bec5', sign: { text: 'WAREHOUSE A — IMPORTERS', face: S, bg: '#263238', fg: '#ffd54f' } });
  for (let i = 0; i < 8; i++) box(-11.5 + i * 0.9, -32, 1, 3, 4.5 - 0.55 * i, 'concrete');
  box(-22, -32.6, 22, 0.3, 1.0, 'parapet', 5);
  box(-32.85, -36, 0.3, 7, 1.0, 'parapet', 5);
  box(22, -36, 22, 7, 5, 'building', 0, { c: '#90a4ae', sign: { text: 'WAREHOUSE B — WHOLESALE', face: S, bg: '#37474f', fg: '#fff' } });
  for (let i = 0; i < 8; i++) box(11.5 - i * 0.9, -32, 1, 3, 4.5 - 0.55 * i, 'concrete');
  box(22, -32.6, 22, 0.3, 1.0, 'parapet', 5);
  box(32.85, -36, 0.3, 7, 1.0, 'parapet', 5);

  // South warehouses / packing sheds
  box(-30, 36, 16, 7, 4, 'building', 0, { c: '#cfd8dc', sign: { text: 'PACKING SHED', face: N, bg: '#455a64', fg: '#fff' } });
  box(8, 36, 18, 7, 4, 'building', 0, { c: '#bcaaa4', sign: { text: 'NIGER BRIDGE STORES', face: N, bg: '#4e342e', fg: '#ffe082' } });
  for (let i = 0; i < 6; i++) box(17 + i, 32.5, 1, 3, 3.5 - 0.55 * i, 'concrete');
  box(8, 32.6, 18, 0.3, 1.0, 'parapet', 4);

  // Cover walls and crate stacks
  box(-16, 16, 8, 0.6, 2.2, 'wall');
  box(10, -10, 0.6, 8, 2.2, 'wall');
  box(32, 16, 0.6, 10, 2.4, 'wall');
  box(-8, 28, 1.4, 1.4, 1.4, 'crate'); box(-6.4, 28, 1.4, 1.4, 1.4, 'crate'); box(-7.2, 28, 1.4, 1.4, 1.4, 'crate', 1.4);
  box(36, -8, 1.5, 1.5, 1.5, 'crate');
  box(4, 24, 1.3, 1.3, 1.3, 'crate');

  PALMS.push({ x: -37, z: 2, h: 8 }, { x: 37, z: 2, h: 7.5 }, { x: -6, z: 37, h: 8 }, { x: 36, z: 37, h: 7 });

  L.SPAWNS = [
    [-37, -28], [37, -28], [-37, 28], [37, 28], [-37, 8], [37, 0], [0, -38], [-10, 37],
    [-20, -12], [20, -12], [-20, 12], [12, 16], [-8, -28], [16, 28], [8, -18], [-16, 34],
  ];

  pickup('med', 28, -4.2);           // outside the pharmacy
  pickup('med', -28, -16);          // stall lanes
  pickup('med', -22, 16);
  pickup('med', 6, 36, 4);          // packing-shed roof
  pickup('med', 22, 12);
  pickup('armour', 0, 0);           // market square, contested
  pickup('armour', -22, -36, 5);    // warehouse A roof
  pickup('armour', 12, 36, 4);      // packing-shed roof
  pickup('ammo', -14, -16);
  pickup('ammo', 24, -16);
  pickup('ammo', -22, 22);
  pickup('ammo', 16, 20);
  pickup('ammo', 28, -36, 5);       // warehouse B roof

  return L.finish();
}
