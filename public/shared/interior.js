// Hollow, enterable buildings: wall segments with door/window openings,
// floors, interior stairs, props, and lights. Used by layout.js.

const FACE_DIR = {
  n: { ax: 'x', nx: 0, nz: -1 },
  s: { ax: 'x', nx: 0, nz: 1 },
  e: { ax: 'z', nx: 1, nz: 0 },
  w: { ax: 'z', nx: -1, nz: 0 },
};

function facePoint(cx, cz, w, d, face, at = 0) {
  if (face === 's') return { x: cx + at, z: cz + d / 2, nx: 0, nz: 1 };
  if (face === 'n') return { x: cx + at, z: cz - d / 2, nx: 0, nz: -1 };
  if (face === 'e') return { x: cx + w / 2, z: cz + at, nx: 1, nz: 0 };
  return { x: cx - w / 2, z: cz + at, nx: -1, nz: 0 };
}

function subtractY(bands, y0, y1) {
  const next = [];
  for (const [u, v] of bands) {
    if (y1 <= u || y0 >= v) { next.push([u, v]); continue; }
    if (y0 > u + 0.03) next.push([u, y0]);
    if (y1 < v - 0.03) next.push([y1, v]);
  }
  return next.filter(([u, v]) => v - u >= 0.04);
}

function slabWithHole(box, cx, cz, iw, id, y, t, kind, extra, hole) {
  const minX = cx - iw / 2, maxX = cx + iw / 2;
  const minZ = cz - id / 2, maxZ = cz + id / 2;
  const rect = (x0, x1, z0, z1) => {
    const ww = x1 - x0, dd = z1 - z0;
    if (ww < 0.05 || dd < 0.05) return;
    box((x0 + x1) / 2, (z0 + z1) / 2, ww, dd, t, kind, y, extra);
  };
  if (!hole) { rect(minX, maxX, minZ, maxZ); return; }
  const hx0 = Math.max(minX, hole.x - hole.w / 2);
  const hx1 = Math.min(maxX, hole.x + hole.w / 2);
  const hz0 = Math.max(minZ, hole.z - hole.d / 2);
  const hz1 = Math.min(maxZ, hole.z + hole.d / 2);
  if (hx1 - hx0 < 0.05 || hz1 - hz0 < 0.05) { rect(minX, maxX, minZ, maxZ); return; }
  rect(minX, hx0, minZ, maxZ);
  rect(hx1, maxX, minZ, maxZ);
  rect(hx0, hx1, minZ, hz0);
  rect(hx0, hx1, hz1, maxZ);
}

function overlapsXZ(x, z, r, region) {
  if (!region) return false;
  return x + r > region.x - region.w / 2 && x - r < region.x + region.w / 2
    && z + r > region.z - region.d / 2 && z - r < region.z + region.d / 2;
}

function autoWindows({ w, d, floors, floorH, h, doors, flavor }) {
  const wins = [];
  if (flavor === 'bunker') {
    for (const face of ['n', 's', 'e', 'w']) {
      if (doors.some(dr => dr.face === face)) continue;
      const len = (face === 'n' || face === 's') ? w : d;
      wins.push({ face, at: 0, width: Math.min(1.6, len - 1.2), height: 0.4, sill: 1.15 });
    }
    return wins;
  }
  const tallChurch = flavor === 'church' && h >= 5;
  const faces = [
    { face: 'n', len: w }, { face: 's', len: w },
    { face: 'e', len: d }, { face: 'w', len: d },
  ];
  if (tallChurch) {
    for (const { face, len } of faces) {
      const count = Math.max(1, Math.floor((len - 1.8) / 3.2));
      const span = Math.max(0, len - 2.6);
      for (let i = 0; i < count; i++) {
        const at = count === 1 ? 0 : -span / 2 + (span * i) / Math.max(1, count - 1);
        if (doors.some(dr => dr.face === face && Math.abs((dr.at || 0) - at) < (dr.width || 1.7) / 2 + 1.0)) continue;
        wins.push({ face, at, width: 1.15, y0: 1.1, y1: Math.min(h - 0.6, 5.0) });
      }
    }
    return wins;
  }
  for (let f = 0; f < floors; f++) {
    for (const { face, len } of faces) {
      const count = Math.max(1, Math.floor((len - 1.6) / 3.4));
      const span = Math.max(0, len - 2.4);
      for (let i = 0; i < count; i++) {
        const at = count === 1 ? 0 : -span / 2 + (span * i) / Math.max(1, count - 1);
        if (f === 0 && doors.some(dr => dr.face === face && Math.abs((dr.at || 0) - at) < (dr.width || 1.7) / 2 + 0.95)) continue;
        wins.push({ face, at, width: 1.3, height: 1.25, sill: f * floorH + 1.05 });
      }
    }
  }
  return wins;
}

function stairShaft(cx, cz, w, d, wallT, doorFace, width, len) {
  const ix0 = cx - w / 2 + wallT, ix1 = cx + w / 2 - wallT;
  const iz0 = cz - d / 2 + wallT, iz1 = cz + d / 2 - wallT;
  // Keep the shaft off the door wall.
  const alongZ = (iz1 - iz0) >= len + 0.2 && doorFace !== 'n' && doorFace !== 's' || (ix1 - ix0) < len + 0.2;
  if ((iz1 - iz0) >= len + 0.2 && doorFace !== 's' && (alongZ || doorFace === 'e' || doorFace === 'w' || (ix1 - ix0) < len + 0.2)) {
    const onWest = doorFace !== 'w';
    const x = onWest ? ix0 + width / 2 + 0.05 : ix1 - width / 2 - 0.05;
    const z0 = iz0 + 0.05;
    return { axis: 'z', sign0: 1, x, z: z0, width, len, startLow: { x, z: z0 } };
  }
  if ((iz1 - iz0) >= len + 0.2) {
    const onWest = doorFace !== 'w';
    const x = onWest ? ix0 + width / 2 + 0.05 : ix1 - width / 2 - 0.05;
    const z1 = iz1 - 0.05;
    return { axis: 'z', sign0: -1, x, z: z1, width, len, startLow: { x, z: z1 } };
  }
  const onNorth = doorFace !== 'n';
  const z = onNorth ? iz0 + width / 2 + 0.05 : iz1 - width / 2 - 0.05;
  const x0 = doorFace === 'w' ? ix1 - 0.05 : ix0 + 0.05;
  const sign0 = doorFace === 'w' ? -1 : 1;
  return { axis: 'x', sign0, x: x0, z, width, len, startLow: { x: x0, z } };
}

function flightHole(shaft, sign, n, run, width) {
  const along = (n - 2) * run; // centre of the last ~3 treads
  const holeAlong = 3 * run + 0.15;
  if (shaft.axis === 'z') {
    return {
      x: shaft.x,
      z: shaft.startLow.z + sign * along,
      w: width + 0.25,
      d: holeAlong,
    };
  }
  return {
    x: shaft.startLow.x + sign * along,
    z: shaft.z,
    w: holeAlong,
    d: width + 0.25,
  };
}

function addFlight(box, shaft, sign, y0, rise, run, n, width) {
  for (let i = 0; i < n; i++) {
    const along = run * i + run / 2;
    const h = rise * (i + 1);
    if (shaft.axis === 'z') {
      box(shaft.x, shaft.startLow.z + sign * along, width, run, h, 'stair', y0, { batch: true });
    } else {
      box(shaft.startLow.x + sign * along, shaft.z, run, width, h, 'stair', y0, { batch: true });
    }
  }
}

function addProps(box, flavor, cx, cz, w, d, wallT, y, floorH, avoid, inside) {
  const ix0 = cx - w / 2 + wallT + 0.55, ix1 = cx + w / 2 - wallT - 0.55;
  const iz0 = cz - d / 2 + wallT + 0.55, iz1 = cz + d / 2 - wallT - 0.55;
  const place = (x, z, ww, dd, hh, k, yy = y, extra = {}) => {
    if (overlapsXZ(x, z, Math.max(ww, dd) / 2 + 0.2, avoid)) return;
    if (inside && Math.hypot(x - inside[0], z - inside[1]) < 1.15) return;
    box(x, z, ww, dd, hh, k, yy, extra);
  };
  const midX = (ix0 + ix1) / 2, midZ = (iz0 + iz1) / 2;
  if (flavor === 'church' && y < 0.1) {
    const pewZ0 = midZ - 1.2;
    for (let i = -1; i <= 1; i++) {
      if (i === 0) continue;
      place(cx + i * Math.min(2.2, (ix1 - ix0) / 3), pewZ0, 1.8, 0.45, 0.55, 'pew');
      place(cx + i * Math.min(2.2, (ix1 - ix0) / 3), pewZ0 + 1.4, 1.8, 0.45, 0.55, 'pew');
    }
    place(cx, iz0 + 0.9, 1.1, 0.7, 1.0, 'counter');
    return;
  }
  if (flavor === 'shop' || flavor === 'bank' || flavor === 'pharmacy') {
    place(midX, iz0 + 0.15, Math.min(2.6, ix1 - ix0 - 0.4), 0.55, 1.05, 'counter', y);
    place(ix0 + 0.1, midZ, 0.4, Math.min(2.2, iz1 - iz0 - 1.2), 1.6, 'shelf', y);
    place(ix1 - 0.55, iz1 - 0.55, 0.7, 0.7, 0.7, 'crate', y);
    return;
  }
  if (flavor === 'warehouse' || flavor === 'factory' || flavor === 'shed') {
    const gap = 2.6;
    for (let x = ix0 + 0.8; x <= ix1 - 0.8; x += gap) {
      place(x, iz0 + 0.5, 1.1, 0.45, 1.8, 'shelf', y);
      if (iz1 - iz0 > 6) place(x, iz1 - 0.5, 1.1, 0.45, 1.8, 'shelf', y);
    }
    place(midX + 2, midZ, 1.1, 1.1, 1.1, 'crate', y);
    place(midX + 2.2, midZ + 1.2, 1.1, 1.1, 1.1, 'crate', y);
    place(midX - 2.2, midZ + 0.8, 1.2, 1.0, 0.85, 'table', y);
    return;
  }
  if (flavor === 'barracks') {
    place(ix0 + 0.9, iz0 + 1.0, 2.0, 0.8, 0.55, 'table', y);
    place(ix1 - 0.9, iz0 + 1.0, 2.0, 0.8, 0.55, 'table', y);
    place(ix0 + 0.6, iz1 - 0.5, 0.9, 0.4, 1.5, 'shelf', y);
    place(ix1 - 0.7, iz1 - 0.7, 0.8, 0.8, 0.8, 'crate', y);
    return;
  }
  if (flavor === 'bunker') {
    place(midX, midZ + 0.8, 1.2, 0.7, 0.7, 'crate', y);
    place(midX - 0.9, midZ - 0.6, 0.9, 0.9, 0.85, 'crate', y);
    return;
  }
  // default office / plaza / house / hq / sickbay / armoury
  place(midX + Math.min(1.8, (ix1 - ix0) / 4), midZ, 1.4, 0.8, 0.75, 'table', y);
  place(ix0 + 0.15, midZ, 0.4, Math.min(2.4, Math.max(1.0, iz1 - iz0 - 1.6)), 1.7, 'shelf', y);
  place(ix1 - 0.7, iz1 - 0.7, 0.8, 0.8, 0.8, 'crate', y);
  if (flavor === 'bank' || flavor === 'office') place(midX, iz0 + 0.2, Math.min(3.0, ix1 - ix0 - 0.6), 0.55, 1.05, 'counter', y);
}

/**
 * Convert a solid footprint into an enterable structure.
 * Returns the INTERIORS metadata entry.
 */
export function addEnterable(ctx, opts) {
  const { box, BOXES, LIGHTS, INTERIORS } = ctx;
  const cx = opts.x, cz = opts.z, w = opts.w, d = opts.d, h = opts.h;
  const c = opts.c || '#c9b7a4';
  const flavor = opts.flavor || 'building';
  const wallT = opts.wallT || 0.3;
  const roofT = opts.roofT || 0.25;
  const floors = Math.max(1, opts.floors || Math.max(1, Math.round(h / 3)));
  const floorH = h / floors;
  const wantStairs = opts.stairs !== false && (floors >= 2 || (opts.stairs === true) || (h >= 3.8 && Math.min(w, d) >= 6));
  const wantParapet = opts.parapet !== false && h >= 3;
  const doors = (opts.doors && opts.doors.length)
    ? opts.doors
    : [{ face: (opts.sign && opts.sign.face) || 's', at: opts.doorAt != null ? opts.doorAt : 0, width: 1.7, height: 2.2 }];
  for (const dr of doors) {
    dr.width = dr.width || 1.7;
    dr.height = dr.height || 2.2;
    dr.at = dr.at || 0;
    dr.y0 = 0;
    dr.y1 = dr.height;
  }
  const windows = opts.windows || autoWindows({ w, d, floors, floorH, h, doors, flavor });
  for (const win of windows) {
    win.width = win.width || 1.3;
    win.y0 = win.y0 != null ? win.y0 : (win.sill != null ? win.sill : 1.05);
    win.y1 = win.y1 != null ? win.y1 : win.y0 + (win.height || 1.25);
  }

  const openings = [];
  for (const dr of doors) openings.push({ face: dr.face, at: dr.at, width: dr.width, y0: 0, y1: dr.height });
  for (const win of windows) openings.push({ face: win.face, at: win.at, width: win.width, y0: win.y0, y1: win.y1 });

  // Four walls, N/S full width, E/W inset so corners don't double up.
  for (const face of ['n', 's', 'e', 'w']) {
    const isNS = face === 'n' || face === 's';
    const sign = (face === 's' || face === 'e') ? 1 : -1;
    const length = isNS ? w : Math.max(0.4, d - 2 * wallT);
    const faceOpens = openings.filter(o => o.face === face);
    const splits = new Set([-length / 2, length / 2]);
    for (const o of faceOpens) {
      const a = Math.max(-length / 2, o.at - o.width / 2);
      const b = Math.min(length / 2, o.at + o.width / 2);
      if (b > a + 0.04) { splits.add(a); splits.add(b); }
    }
    const xs = [...splits].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1], mid = (a + b) / 2, segW = b - a;
      if (segW < 0.04) continue;
      let bands = [[0, h]];
      for (const o of faceOpens) {
        if (mid <= o.at - o.width / 2 + 1e-5 || mid >= o.at + o.width / 2 - 1e-5) continue;
        bands = subtractY(bands, o.y0, o.y1);
      }
      for (const [y0, y1] of bands) {
        const hh = y1 - y0;
        if (isNS) box(cx + mid, cz + sign * (d / 2 - wallT / 2), segW, wallT, hh, 'iwall', y0, { c });
        else box(cx + sign * (w / 2 - wallT / 2), cz + mid, wallT, segW, hh, 'iwall', y0, { c });
      }
    }
  }

  // Stair shaft (optional) and floor slabs with holes.
  let shaft = null, holes = [];
  const iw = Math.max(0.8, w - 2 * wallT);
  const idp = Math.max(0.8, d - 2 * wallT);
  if (wantStairs) {
    const riseMax = 0.52;
    const width = 1.3;
    // One flight per storey (including the roof).
    const nPer = Math.max(4, Math.ceil(floorH / riseMax));
    const rise = floorH / nPer;
    const run = 0.5;
    const len = nPer * run;
    if (Math.min(iw, idp) > width + 0.8 && Math.max(iw, idp) > len + 0.6) {
      shaft = stairShaft(cx, cz, w, d, wallT, doors[0].face, width, len);
      shaft.nPer = nPer; shaft.rise = rise; shaft.run = run; shaft.width = width;
      for (let f = 0; f < floors; f++) {
        const sign = (f % 2 === 0) ? shaft.sign0 : -shaft.sign0;
        if (f % 2 === 1) {
          // switchback: start at the far end of the previous flight
          if (shaft.axis === 'z') shaft.startLow = { x: shaft.x, z: (shaft._baseZ ?? (shaft.startLow.z)) + shaft.sign0 * len };
          else shaft.startLow = { x: (shaft._baseX ?? (shaft.startLow.x)) + shaft.sign0 * len, z: shaft.z };
        } else {
          if (shaft._baseZ == null) { shaft._baseZ = shaft.startLow.z; shaft._baseX = shaft.startLow.x; }
          if (shaft.axis === 'z') shaft.startLow = { x: shaft.x, z: shaft._baseZ };
          else shaft.startLow = { x: shaft._baseX, z: shaft.z };
        }
        addFlight(box, shaft, sign, f * floorH, rise, run, nPer, width);
        holes.push({ level: f + 1, y: (f + 1) * floorH, hole: flightHole(shaft, sign, nPer, run, width) });
      }
      // restore startLow for overlap tests: the union of the shaft rectangle
      if (shaft.axis === 'z') {
        const zMid = shaft._baseZ + shaft.sign0 * len / 2;
        shaft.region = { x: shaft.x, z: zMid, w: width + 0.4, d: len + 0.4 };
      } else {
        const xMid = shaft._baseX + shaft.sign0 * len / 2;
        shaft.region = { x: xMid, z: shaft.z, w: len + 0.4, d: width + 0.4 };
      }
    }
  }

  // Visual-only ground floor (distinct interior tiles)
  box(cx, cz, iw - 0.02, idp - 0.02, 0.03, 'ifloor', 0.01, { solid: false, c: opts.floorC || '#c4b49a' });

  // Upper floors + roof. Keep a solid roof only when a standing player fits under it.
  for (let f = 1; f <= floors; f++) {
    const top = f * floorH;
    const y = top - roofT;
    const hole = (holes.find(hh => Math.abs(hh.y - top) < 1e-6) || {}).hole;
    const col = f === floors ? '#d8d0c4' : (opts.floorC || '#c4b49a');
    const extra = { c: col };
    if (f === floors && y < 1.85) extra.solid = false;
    slabWithHole(box, cx, cz, f === floors ? w : iw, f === floors ? d : idp, y, roofT, 'floor', extra, hole);
  }

  // Interior partition for very large footprints (one doorway, avoid the stair shaft)
  if (Math.max(w, d) >= 16 && Math.min(w, d) >= 8) {
    const doorW = 2.0, doorH = 2.2;
    const alongZ = d >= w; // partition runs along the long axis
    if (alongZ) {
      const px = cx + w * 0.18;
      if (!shaft || !overlapsXZ(px, cz, 0.4, shaft.region)) {
        const half = idp / 2;
        const segs = [[-half, -doorW / 2], [doorW / 2, half]];
        for (const [a, b] of segs) {
          const mid = (a + b) / 2, seg = b - a;
          if (seg > 0.08) box(px, cz + mid, wallT, seg, h, 'iwall', 0, { c });
        }
        if (h - doorH > 0.1) box(px, cz, wallT, doorW, h - doorH, 'iwall', doorH, { c });
      }
    } else {
      const pz = cz + d * 0.18;
      if (!shaft || !overlapsXZ(cx, pz, 0.4, shaft.region)) {
        const half = iw / 2;
        const segs = [[-half, -doorW / 2], [doorW / 2, half]];
        for (const [a, b] of segs) {
          const mid = (a + b) / 2, seg = b - a;
          if (seg > 0.08) box(cx + mid, pz, seg, wallT, h, 'iwall', 0, { c });
        }
        if (h - doorH > 0.1) box(cx, pz, doorW, wallT, h - doorH, 'iwall', doorH, { c });
      }
    }
  }

  // Columns for large rooms
  if (Math.min(w, d) >= 12) {
    const step = 8;
    for (let x = cx - w / 2 + 4; x <= cx + w / 2 - 4; x += step) {
      for (let z = cz - d / 2 + 4; z <= cz + d / 2 - 4; z += step) {
        if (shaft && overlapsXZ(x, z, 0.6, shaft.region)) continue;
        if (Math.hypot(x - cx, z - cz) < 1.2) continue;
        box(x, z, 0.45, 0.45, h - roofT, 'pillar', 0);
      }
    }
  }

  // Props on each occupiable floor (not the roof)
  const inside = [cx, cz];
  // Nudge the "inside" test point off the stair shaft and any centre column
  if (shaft && overlapsXZ(inside[0], inside[1], 1.2, shaft.region)) {
    inside[0] = cx + (cx >= shaft.x ? 1.6 : -1.6);
    inside[1] = cz + (cz >= (shaft.region.z) ? 1.2 : -1.2);
  }
  // Clamp inside to inner volume
  inside[0] = Math.max(cx - w / 2 + wallT + 1.1, Math.min(cx + w / 2 - wallT - 1.1, inside[0]));
  inside[1] = Math.max(cz - d / 2 + wallT + 1.1, Math.min(cz + d / 2 - wallT - 1.1, inside[1]));

  if (opts.props !== false) {
    for (let f = 0; f < floors; f++) {
      addProps(box, flavor, cx, cz, w, d, wallT, f * floorH, floorH, shaft && shaft.region, inside);
    }
  }

  if (wantParapet) {
    const ph = 1.0, pt = 0.25;
    box(cx, cz + d / 2 - pt / 2, w, pt, ph, 'parapet', h);
    box(cx, cz - d / 2 + pt / 2, w, pt, ph, 'parapet', h);
    box(cx + w / 2 - pt / 2, cz, pt, d - 2 * pt, ph, 'parapet', h);
    box(cx - w / 2 + pt / 2, cz, pt, d - 2 * pt, ph, 'parapet', h);
  }

  // Sign + rooftop tank hook (no solid volume)
  box(cx, cz, w, d, h, 'facade', 0, { c, sign: opts.sign, solid: false, tank: h >= 6 && flavor !== 'church' });

  // Lights
  if (opts.light !== false) {
    for (let f = 0; f < floors; f++) {
      LIGHTS.push({
        x: inside[0],
        y: f * floorH + Math.min(floorH - 0.35, 2.55),
        z: inside[1],
        color: flavor === 'bunker' ? '#d8c07a' : '#ffd9a0',
        intensity: 2.0,
        distance: Math.max(8, Math.min(14, Math.max(w, d) * 0.7)),
      });
    }
  }

  function pointInSolid(x, y, z) {
    if (!BOXES) return false;
    for (const b of BOXES) {
      if (b.solid === false) continue;
      if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2
        && y >= b.y && y <= b.y + b.h
        && z >= b.z - b.d / 2 && z <= b.z + b.d / 2) return true;
    }
    return false;
  }
  function pathClear(o, d, dist) {
    // Origin and a few samples short of the opening must be free; the opening itself is empty.
    const wallDist = dist - wallT - 0.05;
    for (let t = 0; t <= wallDist; t += 0.15) {
      if (pointInSolid(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t)) return false;
    }
    return true;
  }

  // Test rays fire from *inside* the room so buildings against the arena wall still work.
  const testDoor = doors[0];
  let windowRay = null, wallRay = null;
  const winCandidates = [
    ...windows.filter(wn => !doors.some(dr => dr.face === wn.face && Math.abs((dr.at || 0) - wn.at) < 0.1)),
    ...windows,
  ];
  for (const testWin of winCandidates) {
    const y = Math.min(Math.max((testWin.y0 + testWin.y1) / 2, testWin.y0 + 0.2), Math.min(testWin.y1 - 0.2, Math.max(1.2, h - 0.35)));
    const depth = (testWin.face === 'n' || testWin.face === 's') ? d : w;
    const inward = Math.max(0.75, Math.min(2.0, depth / 2 - wallT - 0.4));
    const through = inward + wallT + 0.05;
    for (const side of [0, 0.25, -0.25]) {
      const fp = facePoint(cx, cz, w, d, testWin.face, testWin.at + side);
      const o = [fp.x - fp.nx * inward, y, fp.z - fp.nz * inward];
      const dir = [fp.nx, 0, fp.nz];
      if (!pathClear(o, dir, through)) continue;
      windowRay = { o, d: dir, through };
      break;
    }
    if (windowRay) break;
  }
  const tried = new Set();
  for (const face of [testDoor.face, 'n', 's', 'e', 'w']) {
    if (tried.has(face)) continue;
    tried.add(face);
    const len = (face === 'n' || face === 's') ? w : d;
    const faceOpens = openings.filter(o => o.face === face);
    let at = null;
    for (let x = -len / 2 + 0.8; x <= len / 2 - 0.8; x += 0.15) {
      const blocked = faceOpens.some(o => Math.abs(x - o.at) < o.width / 2 + 0.2 && 1.6 > o.y0 && 1.6 < o.y1);
      if (!blocked) { at = x; break; }
    }
    if (at == null) continue;
    const fp = facePoint(cx, cz, w, d, face, at);
    const inward = wallT + 0.5;
    wallRay = {
      o: [fp.x - fp.nx * inward, 1.55, fp.z - fp.nz * inward],
      d: [fp.nx, 0, fp.nz],
      maxT: 0.7,
    };
    break;
  }

  const levels = [];
  for (let f = 0; f < floors; f++) levels.push({ x: inside[0], z: inside[1], y: f * floorH });
  levels.push({ x: inside[0], z: inside[1], y: h }); // roof

  const rec = {
    id: opts.id || flavor,
    x: cx, z: cz, w, d, h, floors, floorH, flavor,
    inside,
    door: testDoor,
    levels,
    window: windowRay,
    wall: wallRay,
  };
  INTERIORS.push(rec);
  return rec;
}

export { facePoint };
