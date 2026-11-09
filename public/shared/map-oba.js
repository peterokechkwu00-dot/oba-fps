// Map: "Oba, Anambra" — stylised junction town on the Onitsha–Owerri road.
import { createLayout } from './layout.js';

export function buildOba() {
  const L = createLayout('oba', 'Oba, Anambra', { sky: '#9ccbe8', fog: '#cfe2ea', ground: 'laterite' });
  const { box, shop, enterable, pickup, N, S, E, W, ROADS, DIRT, PALMS, UMBRELLAS, BILLBOARDS, CANOPIES } = L;
  function keke(x, z, alongX = false) { return box(x, z, alongX ? 2.6 : 1.4, alongX ? 1.4 : 2.6, 1.7, 'keke', 0, { rot: alongX ? 1 : 0 }); }
  function danfo(x, z, alongX = false) { return box(x, z, alongX ? 5.5 : 2.2, alongX ? 2.2 : 5.5, 2.4, 'danfo', 0, { rot: alongX ? 1 : 0 }); }

// Perimeter compound walls
box(0, -40.5, 82, 1, 5, 'wall');
box(0, 40.5, 82, 1, 5, 'wall');
box(-40.5, 0, 1, 82, 5, 'wall');
box(40.5, 0, 1, 82, 5, 'wall');

// Onitsha–Owerri Road (east-west) and the junction road (north-south)
ROADS.push({ x: 0, z: 0, w: 80, d: 10, main: true });
ROADS.push({ x: 0, z: -22.5, w: 8, d: 35 });
ROADS.push({ x: 0, z: 22.5, w: 8, d: 35 });

// Junction roundabout monument (cover in the open)
box(0, 0, 4, 4, 0.6, 'concrete');
box(0, 0, 1.2, 1.2, 4.2, 'monument', 0.6);

// ---- Roadside shops & kiosks ----
// North side of the road (face south toward the road)
shop(-36, -8, 4.5, 3, 'MAMA NKECHI KITCHEN', S, '#c0392b');
shop(-30.5, -8, 4.5, 3, 'GOD IS GOOD VENTURES', S, '#1e8449', '#fff', '#e8d9a8');
shop(8, -8, 4.5, 3, 'EBUKA PHONES & ACC.', S, '#2471a3', '#fff', '#cfd8dc');
shop(13.5, -8, 4.5, 3, 'CHIDI PROVISION STORE', S, '#f1c40f', '#1a1a1a');
enterable({ id: 'pharmacy', x: 19, z: -8, w: 4, d: 3, h: 3, floors: 1, c: '#e0f2f1', flavor: 'shop',
  sign: { text: 'OBA PHARMACY', face: S, bg: '#16a085', fg: '#fff' },
  doors: [{ face: S, at: 0, width: 1.6, height: 2.15 }],
  stairs: false, parapet: false });
shop(31, -8, 4.5, 3, 'IFEANYI BOUTIQUE', S, '#8e44ad', '#fff', '#f3e5f5');
shop(36.5, -8, 4, 3, 'MTN • AIRTIME', S, '#ffcc00', '#000', '#fff8e1');
// South side of the road (face north)
shop(-36, 8, 4.5, 3, 'OKEKE SPARE PARTS', N, '#34495e', '#f1c40f');
shop(-30.5, 8, 4.5, 3, 'NNEKA HAIR SALON', N, '#e91e63', '#fff', '#fce4ec');
shop(-25, 8, 4, 3, 'GLO • DATA', N, '#2e7d32', '#fff');
shop(8, 8, 4.5, 3, 'GOD\'S TIME ELECTRONICS', N, '#d35400', '#fff', '#fbe9e7');
shop(13.5, 8, 4.5, 3, 'ONYE AGHALA NWANNE', N, '#1565c0', '#fff');
shop(19, 8, 4, 3, 'CHINEDU PROVISIONS', N, '#c62828', '#fff', '#ffebee');
// Small kiosks on the junction road
shop(-6.5, -16, 2.5, 2.5, 'POS • CASH OUT', E, '#0d47a1', '#ffeb3b', '#bbdefb', 2.6);
shop(6.5, 18, 2.5, 2.5, 'RECHARGE CARD', W, '#f9a825', '#000', '#fff3e0', 2.6);
shop(-6.5, 30, 2.5, 2.5, 'SUYA SPOT', E, '#bf360c', '#fff', '#ffe0b2', 2.6);

// ---- NW: Oba Motor Park ----
DIRT.push({ x: -17, z: -24, w: 24, d: 26 });
danfo(-24, -20); danfo(-19.5, -20); danfo(-12, -31, true);
keke(-26, -31); keke(-23.5, -31); keke(-21, -31); keke(-10, -21); keke(-14, -24.5, true);
box(-8.5, -33, 1.2, 1.2, 1.2, 'crate'); box(-8.5, -34.4, 1.2, 1.2, 1.2, 'crate');
shop(-27, -12.5, 3, 2.5, 'TICKETS • ONITSHA/OWERRI', S, '#004d40', '#ffeb3b', '#dcedc8', 2.6);
box(-22, -11, 0.25, 0.25, 4, 'pole'); box(-12, -11, 0.25, 0.25, 4, 'pole');
BILLBOARDS.push({ x: -17, z: -11, y: 3.0, w: 10, h: 1.6, rot: 0, text: 'OBA MOTOR PARK', sub: 'ONITSHA • OWERRI • NNEWI • LAGOS', bg: '#1b5e20', fg: '#ffeb3b' });
// West compound: two-storey house behind a fence
enterable({ id: 'house', x: -34, z: -27, w: 8, d: 8, h: 6, floors: 2, c: '#e6d3a3', flavor: 'house',
  doors: [{ face: E, at: 0, width: 1.6, height: 2.2 }], stairs: true, parapet: true });
box(-29.8, -18, 0.3, 9, 2, 'fence');
box(-34.5, -13.6, 9.6, 0.3, 2, 'fence');
PALMS.push({ x: -37, z: -17, h: 8 }, { x: -31, z: -36, h: 7 }, { x: -6.8, z: -37, h: 9 });

// ---- NE: Oba Market ----
DIRT.push({ x: 22, z: -24, w: 30, d: 24, light: true });
const umbrellaCols = [['#e53935', '#fff'], ['#1e88e5', '#fdd835'], ['#43a047', '#fff'], ['#fb8c00', '#fff'], ['#8e24aa', '#fdd835']];
let ui = 0;
for (const z of [-16, -22, -28]) for (const x of [9, 14.5, 20, 25.5]) {
  if (z === -22 && x === 14.5) continue; // open lane
  box(x, z, 2.6, 1.4, 0.95, 'stall');
  const [c1, c2] = umbrellaCols[ui++ % umbrellaCols.length];
  UMBRELLAS.push({ x, z, c1, c2 });
}
box(9, -34, 1.5, 1.5, 1.5, 'crate'); box(10.6, -34, 1.5, 1.5, 1.5, 'crate'); box(9.8, -34, 1.5, 1.5, 1.5, 'crate', 1.5);
box(20, -35.5, 1.3, 1.3, 1.3, 'crate'); box(15, -19, 1, 1, 1, 'crate');
box(17.5, -12, 0.25, 0.25, 4, 'pole'); box(26.5, -12, 0.25, 0.25, 4, 'pole');
BILLBOARDS.push({ x: 22, z: -12, y: 3.0, w: 9, h: 1.5, rot: 0, text: 'OBA MARKET', sub: 'Welcome • Nnoo', bg: '#b71c1c', fg: '#fff' });
// Market block (1 storey, roof access by stairs on the west side)
enterable({ id: 'union', x: 33, z: -28, w: 8, d: 12, h: 3, floors: 1, c: '#f0e2c0', flavor: 'office',
  sign: { text: 'OBA MARKET UNION OFFICE', face: S, bg: '#0d47a1', fg: '#fff' },
  doors: [{ face: S, at: 1.8, width: 1.7, height: 2.2 }], stairs: false, parapet: false });
for (let i = 0; i < 5; i++) box(28.5 - i, -31.5, 1, 3, 2.5 - 0.5 * i, 'concrete');
box(36.85, -28, 0.3, 12, 1.1, 'parapet', 3);
box(33, -33.85, 8, 0.3, 1.1, 'parapet', 3);
box(33, -24, 1.2, 1.2, 1.2, 'crate', 3);
box(34.5, -27.5, 1.2, 1.2, 1.2, 'crate', 3);
PALMS.push({ x: 37.5, z: -15, h: 8 }, { x: 6.5, z: -26, h: 7.5 });

// ---- SW: Oba Plaza ----
DIRT.push({ x: -24, z: 26, w: 22, d: 8 });
enterable({ id: 'plaza', x: -31, z: 27, w: 12, d: 10, h: 9, floors: 3, c: '#b0bec5', flavor: 'plaza',
  sign: { text: 'OBA PLAZA', face: E, bg: '#263238', fg: '#ffd54f' },
  doors: [{ face: E, at: 1.5, width: 1.8, height: 2.2 }], stairs: true, parapet: true });
// One-storey wing with roof access (stairs on east side)
enterable({ id: 'bank', x: -20, z: 18, w: 10, d: 8, h: 3.5, floors: 1, c: '#ffe0b2', flavor: 'bank',
  sign: { text: 'UNITY BANK • ATM', face: N, bg: '#5d4037', fg: '#fff' },
  doors: [{ face: N, at: -1.5, width: 1.7, height: 2.2 }], stairs: false, parapet: false });
for (let i = 0; i < 6; i++) box(-14.5 + i, 20.5, 1, 3, 3.0 - 0.5 * i, 'concrete');
box(-20, 14.15, 10, 0.3, 1.1, 'parapet', 3.5);
box(-24.85, 18, 0.3, 8, 1.1, 'parapet', 3.5);
box(-21, 19, 1.2, 1.2, 1.2, 'crate', 3.5);
// Residential compound & fence
box(-12, 33, 8, 6, 3, 'building', 0, { c: '#c8e6c9' });
box(-17.5, 35, 0.3, 10, 2, 'fence');
box(-8.5, 26, 8, 0.3, 2, 'fence');
box(-30, 12.5, 1.5, 1.5, 1.5, 'crate'); box(-28.5, 12.5, 1.5, 1.5, 1.5, 'crate');
PALMS.push({ x: -37, z: 14, h: 8 }, { x: -8, z: 14, h: 7 }, { x: -22, z: 37, h: 9 }, { x: -37, z: 37, h: 7.5 });

// ---- SE: Filling station, church ----
DIRT.push({ x: 30, z: 33, w: 18, d: 10 });
CANOPIES.push({ x: 30, z: 17, w: 13, d: 8, y: 4.5, c: '#d32f2f' });
for (const px of [25, 35]) for (const pz of [14, 20]) box(px, pz, 0.5, 0.5, 4.5, 'pillar');
box(28, 17, 0.9, 0.7, 1.5, 'pump'); box(32, 17, 0.9, 0.7, 1.5, 'pump');
box(37.5, 11.5, 0.25, 0.25, 4.5, 'pole');
BILLBOARDS.push({ x: 37.5, z: 11.6, y: 4.0, w: 4, h: 1.3, rot: 0, text: 'OBA FILLING STN', sub: 'PMS ₦ • DIESEL', bg: '#c62828', fg: '#fff' });
enterable({ id: 'church', x: 30, z: 28, w: 10, d: 7, h: 6, floors: 2, c: '#fff9c4', flavor: 'church',
  sign: { text: "ST. MICHAEL'S CATHOLIC CHURCH", face: N, bg: '#fafafa', fg: '#1a237e' },
  doors: [{ face: N, at: 0, width: 1.8, height: 2.3 }], stairs: true, parapet: true });
box(14, 30, 8, 7, 3, 'building', 0, { c: '#ffccbc', sign: { text: 'ADAORA FASHION HOUSE', face: N, bg: '#ad1457', fg: '#fff' } });
box(20.5, 22, 6, 0.3, 2, 'fence');
box(10, 22, 1.4, 1.4, 1.4, 'crate'); box(20, 36.5, 1.3, 1.3, 1.3, 'crate');
PALMS.push({ x: 38, z: 37, h: 8.5 }, { x: 22, z: 37.5, h: 7.5 }, { x: 7, z: 36, h: 8 }, { x: 38, z: 24, h: 7 });

// ---- Vehicles & cover on the roads ----
danfo(-17, 2.4, true);
keke(14, -2.4, true);
keke(26, 2.6, true);
keke(-31, -2.5, true);
keke(2, -24);
danfo(-1.6, 27);
box(33, -1.5, 1.2, 1.2, 1.0, 'crate'); box(-8, 2.5, 1.2, 1.2, 1.2, 'crate');
box(2.6, 12, 1, 1, 1, 'crate'); box(-2.5, -12, 1, 1, 1, 'crate');


  L.SPAWNS = [
    [-36, -36], [36, -36], [-36, 36], [36, 36], [-38, 0], [38, 0], [0, -37], [0, 37],
    [-17, -36], [17, -38], [-24, 34.5], [20, 34], [-12, -26], [26, -18], [-8, 20], [36, 9],
  ];

  // ---- Pickups ----
  // Medkits: pharmacy, motor park, market lane, filling station, market rooftop
  pickup('med', 19, -5.0);
  pickup('med', -16, -16);
  pickup('med', 30, -18);
  pickup('med', 24, 12);
  pickup('med', 31, -29, 3);
  // Armour: contested mid, bank roof, filling-station forecourt
  pickup('armour', 2.2, 0, 0.6);
  pickup('armour', -18, 18, 3.5);
  pickup('armour', 30, 22);
  // Ammo: motor park, market, under the filling-station canopy, roadside, plaza
  pickup('ammo', -15, -26);
  pickup('ammo', 16, -32);
  pickup('ammo', 30, 14);
  pickup('ammo', -5, 6);
  pickup('ammo', -26, 14);
  // Indoor: plaza ground & first floor, church nave
  pickup('med', -31, 27);
  pickup('ammo', -31, 27, 3);
  pickup('ammo', 30, 28);

  return L.finish();
}
