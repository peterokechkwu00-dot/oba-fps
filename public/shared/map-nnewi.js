// Map: "Nnewi Industrial" — auto-parts yard, factory sheds, containers, cranes, catwalks.
import { createLayout } from './layout.js';

export function buildNnewi() {
  const L = createLayout('nnewi', 'Nnewi Industrial', { sky: '#9aaeb8', fog: '#c5cdd0', ground: 'concrete' });
  const { box, shop, pickup, perimeter, N, S, E, W, ROADS, DIRT, BILLBOARDS, CANOPIES } = L;
  perimeter(6);

  ROADS.push({ x: 0, z: 0, w: 80, d: 10, main: true });
  ROADS.push({ x: 0, z: -22, w: 8, d: 32 });
  ROADS.push({ x: 0, z: 22, w: 8, d: 32 });
  DIRT.push({ x: -24, z: -24, w: 40, d: 28 });
  DIRT.push({ x: 24, z: 24, w: 40, d: 28 });
  DIRT.push({ x: 24, z: -24, w: 36, d: 26 });
  DIRT.push({ x: -24, z: 24, w: 36, d: 26 });

  BILLBOARDS.push({ x: 0, z: -6.5, y: 3.4, w: 16, h: 1.8, rot: 0, text: 'NNEWI AUTO SPARE PARTS', sub: 'ENGINE BLOCKS • GEARBOX • TYRES', bg: '#1a237e', fg: '#ffc107' });
  box(-8, -6.5, 0.3, 0.3, 5.2, 'pole'); box(8, -6.5, 0.3, 0.3, 5.2, 'pole');

  // Factory sheds (west and east) with roof access
  box(-28, -16, 18, 36, 5, 'building', 0, { c: '#78909c', sign: { text: 'MACHINE SHOP A', face: E, bg: '#263238', fg: '#ffd54f' } });
  for (let i = 0; i < 8; i++) box(-18.5 + i, 2, 1.1, 4, 4.5 - 0.55 * i, 'concrete');
  box(-19, -16, 0.3, 36, 1.1, 'parapet', 5);
  box(-28, 1.85, 18, 0.3, 1.1, 'parapet', 5);

  box(28, 12, 18, 36, 5, 'building', 0, { c: '#90a4ae', sign: { text: 'MACHINE SHOP B', face: W, bg: '#37474f', fg: '#fff' } });
  for (let i = 0; i < 8; i++) box(18.5 - i, -6, 1.1, 4, 4.5 - 0.55 * i, 'concrete');
  box(19, 12, 0.3, 36, 1.1, 'parapet', 5);
  box(28, -5.85, 18, 0.3, 1.1, 'parapet', 5);

  // Catwalk between a mid platform and shed A roof (south end)
  box(-8, 8, 22, 2.4, 0.35, 'concrete', 5);
  box(-8, 6.9, 22, 0.25, 1.0, 'parapet', 5.35);
  box(-8, 9.1, 22, 0.25, 1.0, 'parapet', 5.35);
  for (let i = 0; i < 8; i++) box(3 + i, 8, 1.1, 2.4, 4.5 - 0.55 * i, 'concrete');

  // Crane (yard centre-north)
  box(0, -22, 4, 4, 1.5, 'concrete');
  box(0, -22, 1.2, 1.2, 16, 'metal', 1.5);
  box(4, -22, 18, 1.4, 1.2, 'metal', 16.5);
  box(12, -22, 0.4, 0.4, 15, 'pole'); // cable hint

  // Office + gate shop
  box(-30, 30, 14, 10, 7, 'building', 0, { c: '#b0bec5', sign: { text: 'INNOSON PARTS — NNEWI', face: S, bg: '#0d47a1', fg: '#fff' } });
  shop(-16, 30, 6, 4, 'TYRE BAY', S, '#d84315');
  shop(16, -32, 8, 4, 'ENGINE BLOCKS', N, '#1b5e20', '#ffeb3b', '#cfd8dc');
  shop(30, -32, 8, 4, 'OIL & FILTERS', N, '#e65100');

  // Container stacks (cover + elevation)
  const cc = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#4e342e'];
  function stack(x, z, n, alongX = true, rot = 0) {
    const w = alongX ? 6.2 : 2.5, d = alongX ? 2.5 : 6.2;
    for (let i = 0; i < n; i++) box(x, z, w, d, 2.5, 'container', i * 2.5, { c: cc[(x + z + i) % cc.length], rot });
  }
  stack(-8, -30, 2); stack(-8, -26.8, 1);
  stack(8, -18, 3, false);
  stack(12, 28, 2); stack(12, 31.2, 1);
  stack(-12, 16, 2, false);
  stack(32, -14, 2);
  stack(-32, -36, 1);
  stack(10, -8, 2);
  stack(-20, 8, 1, false);

  // Low cover walls / workbenches
  box(0, 16, 10, 0.6, 1.6, 'wall');
  box(-8, 0, 0.6, 8, 1.8, 'wall');
  box(10, 8, 8, 0.6, 1.5, 'wall');
  box(0, 32, 1.5, 1.5, 1.5, 'crate'); box(2, 32, 1.5, 1.5, 1.5, 'crate');

  // Parked trucks
  box(-16, -8, 2.4, 6.5, 2.5, 'truck', 0, { rot: 0, c: '#37474f' });
  box(16, 20, 6.5, 2.4, 2.5, 'truck', 0, { rot: 1, c: '#455a64' });

  CANOPIES.push({ x: 16, z: -32, w: 16, d: 8, y: 4.2, c: '#1565c0' });
  box(10, -36, 0.5, 0.5, 4.2, 'pillar'); box(22, -36, 0.5, 0.5, 4.2, 'pillar');
  box(10, -28, 0.5, 0.5, 4.2, 'pillar'); box(22, -28, 0.5, 0.5, 4.2, 'pillar');

  L.SPAWNS = [
    [-37, -36], [37, -36], [-37, 36], [37, 36], [-37, 10], [37, -18], [0, -37], [0, 37],
    [-16, 20], [12, -12], [-8, 24], [4, 20], [-20, -36], [24, 32], [0, -12], [-12, -4],
  ];

  pickup('med', 16, -27);            // in front of engine shop
  pickup('med', -20, 24);
  pickup('med', -28, -16, 5);        // shop A roof
  pickup('med', 0, 20);
  pickup('armour', 0, 0);            // yard centre, contested
  pickup('armour', -8, 8, 5.35);     // catwalk
  pickup('armour', 28, 12, 5);       // shop B roof
  pickup('ammo', 4, -14);
  pickup('ammo', -8, 12);
  pickup('ammo', 10, -4);
  pickup('ammo', -2, -30);
  pickup('ammo', 12, 24);

  return L.finish();
}
