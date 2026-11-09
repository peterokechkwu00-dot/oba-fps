// Uniform XZ spatial hash for AABB queries and raycasts.
// Cells are 4m; a WeakMap ties a grid to the AABBS array so existing rayMap(o,d,aabbs)
// call sites automatically take the fast path after attachGrid().

export function rayAABB(o, d, a) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < a.min[i] || o[i] > a.max[i]) return Infinity;
    } else {
      let t1 = (a.min[i] - o[i]) / d[i], t2 = (a.max[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function buildGrid(aabbs, arenaHalf = 40, cell = 4) {
  const pad = 4;
  const origin = -arenaHalf - pad;
  const cols = Math.max(1, Math.ceil(((arenaHalf + pad) * 2) / cell));
  const cells = Array.from({ length: cols * cols }, () => []);
  for (let i = 0; i < aabbs.length; i++) {
    const a = aabbs[i];
    let x0 = Math.floor((a.min[0] - origin) / cell);
    let x1 = Math.floor((a.max[0] - origin) / cell);
    let z0 = Math.floor((a.min[2] - origin) / cell);
    let z1 = Math.floor((a.max[2] - origin) / cell);
    if (x1 < 0 || z1 < 0 || x0 >= cols || z0 >= cols) continue;
    if (x0 < 0) x0 = 0; if (z0 < 0) z0 = 0;
    if (x1 >= cols) x1 = cols - 1; if (z1 >= cols) z1 = cols - 1;
    for (let z = z0; z <= z1; z++) {
      const row = z * cols;
      for (let x = x0; x <= x1; x++) cells[row + x].push(i);
    }
  }
  return { origin, cell, cols, cells, items: aabbs, arenaHalf };
}

const GRID_FOR = new WeakMap();

export function attachGrid(aabbs, arenaHalf) {
  const g = buildGrid(aabbs, arenaHalf);
  GRID_FOR.set(aabbs, g);
  return g;
}

export function getGrid(aabbs) {
  return aabbs ? GRID_FOR.get(aabbs) : undefined;
}

export function queryAABBs(aabbs, x, z, pad = 0.5) {
  const g = getGrid(aabbs);
  if (!g) return aabbs;
  const x0 = Math.floor((x - pad - g.origin) / g.cell);
  const x1 = Math.floor((x + pad - g.origin) / g.cell);
  const z0 = Math.floor((z - pad - g.origin) / g.cell);
  const z1 = Math.floor((z + pad - g.origin) / g.cell);
  const out = [];
  const seen = new Set();
  for (let cz = z0; cz <= z1; cz++) {
    if (cz < 0 || cz >= g.cols) continue;
    const row = cz * g.cols;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cx >= g.cols) continue;
      const list = g.cells[row + cx];
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (seen.has(i)) continue;
        seen.add(i);
        out.push(g.items[i]);
      }
    }
  }
  return out;
}

export function rayMap(o, d, aabbs) {
  let best = Infinity;
  if (d[1] < -1e-6) {
    const t = -o[1] / d[1];
    if (t >= 0) best = t;
  }
  const g = getGrid(aabbs);
  if (!g) {
    for (let i = 0; i < aabbs.length; i++) {
      const t = rayAABB(o, d, aabbs[i]);
      if (t < best) best = t;
    }
    return best;
  }
  const { origin, cell, cols, cells, items } = g;
  const visited = new Uint8Array(items.length);
  const test = (cx, cz) => {
    if ((cx | cz) < 0 || cx >= cols || cz >= cols) return;
    const list = cells[cz * cols + cx];
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (visited[i]) continue;
      visited[i] = 1;
      const t = rayAABB(o, d, items[i]);
      if (t < best) best = t;
    }
  };

  const dx = d[0], dz = d[2];
  const len = Math.hypot(dx, dz);
  const maxT = 200;
  if (len < 1e-8) {
    test(Math.floor((o[0] - origin) / cell), Math.floor((o[2] - origin) / cell));
    return best;
  }

  const minW = origin, maxW = origin + cols * cell;
  let tEnter = 0, tLeave = maxT;
  const slab = (p, dir) => {
    if (Math.abs(dir) < 1e-12) {
      if (p < minW || p > maxW) tLeave = -1;
      return;
    }
    let t1 = (minW - p) / dir, t2 = (maxW - p) / dir;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tEnter) tEnter = t1;
    if (t2 < tLeave) tLeave = t2;
  };
  slab(o[0], dx); slab(o[2], dz);
  if (tEnter > tLeave || tLeave < 0) return best;

  const t0 = tEnter < 0 ? 0 : tEnter;
  const x = o[0] + dx * t0, z = o[2] + dz * t0;
  let cx = Math.floor((x - origin) / cell);
  let cz = Math.floor((z - origin) / cell);
  if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
  if (cz < 0) cz = 0; else if (cz >= cols) cz = cols - 1;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const invDx = stepX === 0 ? 0 : 1 / dx;
  const invDz = stepZ === 0 ? 0 : 1 / dz;
  let tMaxX = stepX === 0 ? Infinity : ((origin + (stepX > 0 ? cx + 1 : cx) * cell) - o[0]) * invDx;
  let tMaxZ = stepZ === 0 ? Infinity : ((origin + (stepZ > 0 ? cz + 1 : cz) * cell) - o[2]) * invDz;
  const tDeltaX = stepX === 0 ? Infinity : cell * Math.abs(invDx);
  const tDeltaZ = stepZ === 0 ? Infinity : cell * Math.abs(invDz);
  const endT = Math.min(maxT, tLeave + 1e-4);

  let guard = cols * 4 + 8;
  while (guard-- > 0) {
    test(cx, cz);
    const nextT = tMaxX < tMaxZ ? tMaxX : tMaxZ;
    if (nextT >= best || nextT > endT) break;
    if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    if (cx < 0 || cz < 0 || cx >= cols || cz >= cols) break;
  }
  return best;
}

/** Highest walkable surface under (x, z) whose top is at or below `cap`. */
export function standHeight(x, z, aabbs, cap = 40) {
  let y = 0;
  const list = queryAABBs(aabbs, x, z, 0.02);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (x >= a.min[0] && x <= a.max[0] && z >= a.min[2] && z <= a.max[2] && a.max[1] <= cap + 1e-6 && a.max[1] > y) y = a.max[1];
  }
  return y;
}
