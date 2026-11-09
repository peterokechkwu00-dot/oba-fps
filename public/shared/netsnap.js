// Compact snapshot packing: quantized floats, deltas of only-changed entities.
// Full snapshots are marked f:1 so clients can drop stale entities; deltas omit unchanged rows.

export const q2 = v => Math.round(v * 100) / 100;

export function packPlayer(p) {
  return [
    p.id, q2(p.p[0]), q2(p.p[1]), q2(p.p[2]), q2(p.yaw), q2(p.pitch),
    Math.round(p.hp), Math.round(p.armour || 0), p.alive ? 1 : 0,
  ];
}

export function sameRow(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function changedRows(curr, prevById, idIndex = 0) {
  const out = [];
  for (let i = 0; i < curr.length; i++) {
    const row = curr[i];
    if (!sameRow(row, prevById.get(row[idIndex]))) out.push(row);
  }
  return out;
}

/** Apply a snapshot message onto a { ps: Map, vs: Map } store. */
export function applySnapshot(store, m) {
  if (!store.ps) store.ps = new Map();
  if (!store.vs) store.vs = new Map();
  if (m.f) { store.ps.clear(); store.vs.clear(); }
  if (m.ps) for (const row of m.ps) store.ps.set(row[0], row);
  if (m.vs) for (const row of m.vs) store.vs.set(row[0], row);
  return store;
}

export function snapshotBytes(m) {
  return Buffer.byteLength(JSON.stringify(m));
}
