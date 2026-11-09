// Map: "Awka Barracks" — military compound, sandbags, watchtowers, bunkers, trucks.
import { createLayout } from './layout.js';

export function buildAwka() {
  const L = createLayout('awka', 'Awka Barracks', { sky: '#c5d4b0', fog: '#d7dcc8', ground: 'laterite' });
  const { box, shop, pickup, perimeter, N, S, E, W, ROADS, DIRT, PALMS, BILLBOARDS } = L;
  perimeter(6);

  ROADS.push({ x: 0, z: 16, w: 80, d: 8, main: true }); // inner road
  ROADS.push({ x: 0, z: 0, w: 10, d: 50 });
  DIRT.push({ x: 0, z: -8, w: 56, d: 40 }); // parade ground
  DIRT.push({ x: -28, z: 30, w: 28, d: 16 });
  DIRT.push({ x: 28, z: 30, w: 28, d: 16 });

  BILLBOARDS.push({ x: 0, z: 20.5, y: 3.2, w: 14, h: 1.7, rot: 0, text: 'AWKA BARRACKS', sub: '82 DIVISION • RESTRICTED AREA', bg: '#1b5e20', fg: '#ffeb3b' });
  box(-7, 20.5, 0.3, 0.3, 5, 'pole'); box(7, 20.5, 0.3, 0.3, 5, 'pole');

  // HQ / barracks buildings — kept clear of corner watchtowers
  box(0, -30, 22, 8, 6, 'building', 0, { c: '#cfd8dc', sign: { text: '82 DIVISION HQ', face: S, bg: '#1b5e20', fg: '#ffeb3b' } });
  box(-22, 32, 16, 8, 4, 'building', 0, { c: '#b0bec5', sign: { text: 'BARRACKS A', face: N, bg: '#33691e', fg: '#fff' } });
  box(22, 32, 16, 8, 4, 'building', 0, { c: '#b0bec5', sign: { text: 'BARRACKS B', face: N, bg: '#33691e', fg: '#fff' } });
  box(30, -16, 10, 8, 4, 'building', 0, { c: '#90a4ae', sign: { text: 'ARMOURY', face: W, bg: '#b71c1c', fg: '#fff' } });
  box(-30, -16, 10, 8, 4, 'building', 0, { c: '#a5d6a7', sign: { text: 'SICK BAY', face: E, bg: '#004d40', fg: '#fff' } });
  shop(0, 34, 8, 4, 'CHECK POINT • ID', S, '#33691e', '#ffeb3b', '#c8e6c9', 3);

  // Stairs onto HQ roof (south face, toward the parade ground)
  for (let i = 0; i < 8; i++) box(8 - i, -25.5, 1.1, 3, 5.4 - 0.65 * i, 'concrete');
  box(0, -26.15, 22, 0.3, 1.1, 'parapet', 6);
  box(-10.85, -30, 0.3, 8, 1.1, 'parapet', 6);
  box(10.85, -30, 0.3, 8, 1.1, 'parapet', 6);
  // Armoury roof (stairs on the west face)
  for (let i = 0; i < 6; i++) box(24.5 - i, -16, 1.1, 3, 3.5 - 0.55 * i, 'concrete');
  box(25.15, -16, 0.3, 8, 1.0, 'parapet', 4);

  // Watchtowers (climbable) at four corners — stairs run inward along the nearer wall axis
  function tower(x, z, alongX) {
    box(x, z, 1.4, 1.4, 6, 'concrete');
    box(x, z, 4.4, 4.4, 0.35, 'concrete', 6);
    box(x + 2.05, z, 0.3, 4.4, 1.15, 'parapet', 6.35);
    box(x - 2.05, z, 0.3, 4.4, 1.15, 'parapet', 6.35);
    box(x, z + 2.05, 4.4, 0.3, 1.15, 'parapet', 6.35);
    box(x, z - 2.05, 4.4, 0.3, 1.15, 'parapet', 6.35);
    const dir = alongX ? Math.sign(-x) : Math.sign(-z); // toward the interior
    for (let i = 0; i < 10; i++) {
      const off = 2.6 + i * 0.85;
      const hx = alongX ? x + dir * off : x;
      const hz = alongX ? z : z + dir * off;
      box(hx, hz, alongX ? 0.9 : 2.6, alongX ? 2.6 : 0.9, 5.6 - 0.55 * i, 'concrete');
    }
  }
  tower(-36, -36, true);
  tower(36, -36, true);
  tower(-36, 36, true);
  tower(36, 36, true);

  // Sandbag fighting positions on the parade ground
  function bags(x, z, w, d) { box(x, z, w, d, 1.1, 'sandbag'); }
  bags(-12, -8, 8, 1.2); bags(-12, -4, 1.2, 6);
  bags(12, -8, 8, 1.2); bags(12, -4, 1.2, 6);
  bags(0, 6, 10, 1.2);
  bags(-20, 8, 6, 1.2); bags(20, 8, 6, 1.2);
  bags(-8, 22, 8, 1.2); bags(8, 22, 8, 1.2);

  // Bunkers
  box(-16, -6, 7, 5, 2.0, 'bunker');
  box(16, -6, 7, 5, 2.0, 'bunker');
  box(0, -18, 6, 4, 1.8, 'bunker');

  // Inner fences
  box(-16, 28, 0.3, 16, 2, 'fence');
  box(16, 28, 0.3, 16, 2, 'fence');

  // Military trucks
  box(-10, 12, 2.4, 6.5, 2.6, 'truck', 0, { rot: 0, c: '#3e4a2c' });
  box(10, 12, 2.4, 6.5, 2.6, 'truck', 0, { rot: 0, c: '#3e4a2c' });
  box(-24, 22, 6.5, 2.4, 2.6, 'truck', 0, { rot: 1, c: '#4a5336' });
  box(26, 0, 6.5, 2.4, 2.6, 'truck', 0, { rot: 1, c: '#3e4a2c' });

  // Crate / ammo stacks
  box(-4, 28, 1.3, 1.3, 1.3, 'crate'); box(-2.5, 28, 1.3, 1.3, 1.3, 'crate');
  box(32, -18, 1.4, 1.4, 1.4, 'crate');
  box(-30, 8, 1.4, 1.4, 1.4, 'crate');

  PALMS.push({ x: -8, z: -24, h: 8 }, { x: 8, z: -24, h: 7.5 }, { x: -37, z: 8, h: 8 }, { x: 37, z: 8, h: 8 });

  L.SPAWNS = [
    [-20, -22], [20, -22], [-26, 26], [26, 26], [-38, 0], [38, 0], [0, 37], [0, -22],
    [-16, 0], [16, 0], [-16, 16], [16, 16], [-8, 28], [8, -10], [-22, 4], [22, 4],
  ];

  pickup('med', -30, -10);           // outside sick bay
  pickup('med', 0, 30);              // near checkpoint
  pickup('med', -16, -10);           // beside west bunker
  pickup('med', 0, -30, 6);          // HQ roof
  pickup('armour', 0, 0);            // parade ground, contested
  pickup('armour', 30, -16, 4);      // armoury roof
  pickup('armour', -36, -36, 6.35);  // north-west tower
  pickup('ammo', 16, 16);
  pickup('ammo', -16, 16);
  pickup('ammo', 16, -10);
  pickup('ammo', -14, 10);
  pickup('ammo', 36, 36, 6.35);      // south-east tower

  return L.finish();
}
