// Drivable vehicles: types, per-map spawns, arcade physics, seat layout.
// Shared by the server (authoritative) and the client / tests.

export const VEHICLE_RESPAWN = 45000;
export const VEHICLE_ENTER_R = 2.9;
export const VEHICLE_TYPES = {
  keke: {
    seats: 3, maxSpeed: 17, accel: 16, brake: 20, turn: 3.1, grip: 5.5,
    hp: 80, mass: 1.1, h: 1.7, halfW: 0.7, halfL: 1.25, color: '#f7c600',
  },
  car: {
    seats: 4, maxSpeed: 22, accel: 13, brake: 18, turn: 2.05, grip: 8.5,
    hp: 140, mass: 2.0, h: 1.5, halfW: 0.9, halfL: 2.15, color: '#c62828',
  },
  danfo: {
    seats: 6, maxSpeed: 12, accel: 7.5, brake: 14, turn: 1.25, grip: 7,
    hp: 220, mass: 4.2, h: 2.4, halfW: 1.15, halfL: 2.8, color: '#f5b800',
  },
};
export const TYPE_IDS = { keke: 0, car: 1, danfo: 2 };
export const ID_TYPES = ['keke', 'car', 'danfo'];

/** Local seat positions: +X right, +Y up, -Z forward (yaw 0 faces -Z). Nigeria RHD: driver on +X. */
export const SEATS = {
  keke:  [[0.0, 0.62, -0.45], [-0.32, 0.62, 0.45], [0.32, 0.62, 0.45]],
  car:   [[0.38, 0.62, -0.45], [-0.38, 0.62, -0.45], [0.38, 0.62, 0.55], [-0.38, 0.62, 0.55]],
  danfo: [[0.5, 0.85, -1.7], [-0.5, 0.85, -0.6], [0.5, 0.85, -0.6], [-0.5, 0.85, 0.5], [0.5, 0.85, 0.5], [0.0, 0.85, 1.5]],
};

// Sensible roadside / motor-park / yard placements. yaw 0 faces -Z, π/2 faces -X.
const SPAWNS = {
  oba: [
    { type: 'danfo', x: -24, z: -20, yaw: 0 },
    { type: 'keke', x: -26, z: -31, yaw: 0 },
    { type: 'keke', x: -10, z: -21, yaw: Math.PI / 2 },
    { type: 'car', x: -16, z: -28, yaw: Math.PI / 2 },
    { type: 'car', x: 22, z: 3.4, yaw: Math.PI / 2 },
    { type: 'keke', x: 26, z: 3.4, yaw: Math.PI / 2 },
    { type: 'danfo', x: -1.6, z: 27, yaw: 0 },
  ],
  onitsha: [
    { type: 'danfo', x: -18, z: 5.8, yaw: Math.PI / 2 },
    { type: 'car', x: 14, z: 5.8, yaw: Math.PI / 2 },
    { type: 'keke', x: 4, z: -10.5, yaw: 0 },
    { type: 'keke', x: -6, z: 12, yaw: 0 },
    { type: 'car', x: 18, z: 22, yaw: 0 },
  ],
  nnewi: [
    { type: 'danfo', x: 4, z: -10, yaw: Math.PI / 2 },
    { type: 'car', x: -16, z: 20, yaw: 0 },
    { type: 'keke', x: -4, z: 12, yaw: 0 },
    { type: 'keke', x: 20, z: -18, yaw: Math.PI / 2 },
    { type: 'car', x: 16, z: 32, yaw: Math.PI / 2 },
  ],
  awka: [
    { type: 'danfo', x: 22, z: 16, yaw: Math.PI / 2 },
    { type: 'car', x: -8, z: 16, yaw: Math.PI / 2 },
    { type: 'keke', x: 8, z: 28, yaw: 0 },
    { type: 'keke', x: -24, z: 8, yaw: 0 },
    { type: 'car', x: 8, z: -10, yaw: 0 },
  ],
};

export function vehicleSpawns(mapId) {
  return (SPAWNS[mapId] || SPAWNS.oba).map(s => ({ ...s }));
}

export function localToWorld(x, z, yaw, lx, ly, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, ly, z - lx * s + lz * c];
}

export function seatWorld(v, seat) {
  const typ = v.type;
  const off = (SEATS[typ] || SEATS.car)[seat] || SEATS.car[0];
  const p = localToWorld(v.x, v.z, v.yaw, off[0], off[1], off[2]);
  return [p[0], (v.y || 0) + off[1], p[2]];
}

export function exitPos(v, side = 1) {
  const typ = VEHICLE_TYPES[v.type] || VEHICLE_TYPES.car;
  const p = localToWorld(v.x, v.z, v.yaw, side * (typ.halfW + 1.0), 0, 0);
  return [p[0], v.y || 0, p[2]];
}

export function createVehicle(id, spawn) {
  const typ = VEHICLE_TYPES[spawn.type] || VEHICLE_TYPES.car;
  return {
    id,
    type: spawn.type,
    sx: spawn.x, sz: spawn.z, syaw: spawn.yaw || 0,
    x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw || 0,
    vx: 0, vz: 0, speed: 0,
    hp: typ.hp, alive: true, wreckUntil: 0, respawnAt: 0,
    seats: Array(typ.seats).fill(0),
    throttle: 0, steer: 0, brake: false,
    lastHorn: 0, lastRun: 0,
  };
}

export function resetVehicle(v) {
  const typ = VEHICLE_TYPES[v.type];
  v.x = v.sx; v.y = 0; v.z = v.sz; v.yaw = v.syaw;
  v.vx = 0; v.vz = 0; v.speed = 0;
  v.hp = typ.hp; v.alive = true; v.wreckUntil = 0; v.respawnAt = 0;
  v.seats = Array(typ.seats).fill(0);
  v.throttle = 0; v.steer = 0; v.brake = false;
}

function bodyPoints(x, z, yaw, typ) {
  const pts = [];
  for (const lz of [-typ.halfL, 0, typ.halfL]) {
    for (const lx of [-typ.halfW, typ.halfW]) {
      const p = localToWorld(x, z, yaw, lx, 0, lz);
      pts.push([p[0], p[2]]);
    }
  }
  return pts;
}

function aabbHits(px, pz, typ, aabbs, y) {
  for (const a of aabbs) {
    if (a.min[1] >= typ.h + (y || 0) || a.max[1] <= (y || 0) + 0.12) continue;
    if (px > a.min[0] && px < a.max[0] && pz > a.min[2] && pz < a.max[2]) return true;
  }
  return false;
}

function vehicleHits(px, pz, typ, self, others) {
  for (const o of others) {
    if (o === self || !o.alive) continue;
    const ot = VEHICLE_TYPES[o.type];
    const dx = px - o.x, dz = pz - o.z;
    const r = typ.halfW + ot.halfW + 0.15;
    // crude circle check at each sample is enough with 6 samples
    if (dx * dx + dz * dz < r * r) {
      // tighter: project into other's local frame
      const p = localToWorld(0, 0, -o.yaw, dx, 0, dz); // not quite
      const c = Math.cos(-o.yaw), s = Math.sin(-o.yaw);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      // Wait, inverse of localToWorld from origin: 
      // wx = lx*c + lz*s, wz = -lx*s + lz*c
      // Better invert properly below.
    }
  }
  return false;
}

function inOtherVehicle(x, z, typY, self, others) {
  for (const o of others) {
    if (o === self || !o.alive) continue;
    const ot = VEHICLE_TYPES[o.type];
    const dx = x - o.x, dz = z - o.z;
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    // inverse of world = origin + right*lx + back*lz
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < ot.halfW + typY.halfW * 0.4 && Math.abs(lz) < ot.halfL + typY.halfL * 0.4) return o;
  }
  return null;
}

export function vehicleBlocked(x, z, yaw, typ, aabbs, y, self, others) {
  const pts = bodyPoints(x, z, yaw, typ);
  for (const [px, pz] of pts) {
    if (Math.abs(px) > 39.2 || Math.abs(pz) > 39.2) return true;
    if (aabbHits(px, pz, typ, aabbs, y)) return true;
  }
  if (others && inOtherVehicle(x, z, typ, self, others)) return true;
  return false;
}

export function standY(x, z, aabbs, cap = 8) {
  let y = 0;
  for (const a of aabbs) {
    if (x >= a.min[0] && x <= a.max[0] && z >= a.min[2] && z <= a.max[2] && a.max[1] <= cap + 1e-6 && a.max[1] > y && a.max[1] < 3.2) y = a.max[1];
  }
  return y;
}

/** Arcade integration. Mutates v. dt in seconds. */
export function stepVehicle(v, dt, aabbs, others) {
  if (!v.alive) return;
  const typ = VEHICLE_TYPES[v.type];
  const th = Math.max(-1, Math.min(1, v.throttle || 0));
  const st = Math.max(-1, Math.min(1, v.steer || 0));
  if (v.brake || !v.seats[0]) {
    const dec = typ.brake * (v.seats[0] ? 1 : 0.55);
    if (v.speed > 0) v.speed = Math.max(0, v.speed - dec * dt);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + dec * dt);
  }
  if (!v.brake && v.seats[0]) {
    const target = th * typ.maxSpeed;
    const rate = (th * v.speed < 0) ? typ.brake : typ.accel;
    if (v.speed < target) v.speed = Math.min(target, v.speed + rate * dt);
    else v.speed = Math.max(target, v.speed - rate * dt);
  }
  const spd01 = Math.min(1, Math.abs(v.speed) / typ.maxSpeed);
  if (Math.abs(v.speed) > 0.25) v.yaw += st * typ.turn * (0.2 + 0.8 * spd01) * Math.sign(v.speed) * dt;

  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const wantX = fx * v.speed, wantZ = fz * v.speed;
  const k = Math.min(1, typ.grip * dt);
  v.vx += (wantX - v.vx) * k;
  v.vz += (wantZ - v.vz) * k;

  const nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
  const ny = standY(nx, nz, aabbs);
  if (!vehicleBlocked(nx, nz, v.yaw, typ, aabbs, ny, v, others)) {
    v.x = nx; v.z = nz; v.y = ny;
  } else if (!vehicleBlocked(nx, v.z, v.yaw, typ, aabbs, standY(nx, v.z, aabbs), v, others)) {
    v.x = nx; v.vx *= 0.4; v.speed *= 0.6; v.y = standY(nx, v.z, aabbs);
  } else if (!vehicleBlocked(v.x, nz, v.yaw, typ, aabbs, standY(v.x, nz, aabbs), v, others)) {
    v.z = nz; v.vz *= 0.4; v.speed *= 0.6; v.y = standY(v.x, nz, aabbs);
  } else {
    v.vx = 0; v.vz = 0; v.speed *= 0.3;
  }
  v.x = Math.max(-39, Math.min(39, v.x));
  v.z = Math.max(-39, Math.min(39, v.z));
}

export function firstFreeSeat(v) {
  return v.seats.findIndex(s => !s);
}

export function occupierSeat(v, playerId) {
  return v.seats.findIndex(s => s === playerId);
}

export function vehicleSpeed(v) {
  return Math.hypot(v.vx || 0, v.vz || 0);
}

/** Axis-aligned bounds used for bullet tests (slightly padded). */
export function vehicleBounds(v) {
  const typ = VEHICLE_TYPES[v.type];
  const pad = typ.halfL;
  return {
    min: [v.x - pad, v.y, v.z - pad],
    max: [v.x + pad, v.y + typ.h, v.z + pad],
  };
}

export function packVehicle(v) {
  return [
    v.id, TYPE_IDS[v.type] ?? 1,
    Math.round(v.x * 100) / 100, Math.round((v.y || 0) * 100) / 100, Math.round(v.z * 100) / 100,
    Math.round(v.yaw * 1000) / 1000,
    Math.round(v.hp), v.alive ? 1 : 0,
    ...v.seats,
  ];
}

export function unpackVehicle(row) {
  const type = ID_TYPES[row[1]] || 'car';
  const n = VEHICLE_TYPES[type].seats;
  return {
    id: row[0], type,
    x: row[2], y: row[3], z: row[4], yaw: row[5],
    hp: row[6], alive: !!row[7],
    seats: row.slice(8, 8 + n),
  };
}
