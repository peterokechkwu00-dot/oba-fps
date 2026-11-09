// Builds a map arena: canvas-generated textures, buildings, shops, signs, vehicles, palms.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMap, DEFAULT_MAP } from './shared/map.js';

let maxAniso = 4;
const texCache = new Map();

function canvasTex(w, h, draw, key) {
  if (key && texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (key) texCache.set(key, t);
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function speckle(g, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.globalAlpha = rnd(0.05, 0.25); g.fillRect(rnd(0, w), rnd(0, h), rnd(1, size), rnd(1, size)); }
  g.globalAlpha = 1;
}
function shade(hex, f) {
  const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString();
}

// ---------- Textures ----------
const T = {
  ground: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9925f'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, ['#8d6a3f', '#d2b07a', '#7a5a33', '#a07c4c'], 3);
    for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < 0.5 ? '#6f8f3a' : '#59752f'; g.globalAlpha = 0.35; g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 6), rnd(1, 3)); }
    g.globalAlpha = 1;
  }, 'ground'),
  asphalt: () => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#3b3b3d'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 6000, ['#555', '#2a2a2a', '#666', '#4a4440'], 2);
    // potholes / patches
    for (let i = 0; i < 3; i++) { g.fillStyle = '#2b2a29'; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(rnd(0, w), rnd(30, h - 30), rnd(10, 25), rnd(6, 14), 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 8, w, 5); g.fillRect(0, h - 13, w, 5);  // edge lines
    g.fillStyle = '#f2c230'; for (let x = 0; x < w; x += 128) g.fillRect(x + 16, h / 2 - 4, 80, 8); // dashed centre
  }, 'asphalt'),
  dirt: (light) => canvasTex(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    const base = light ? '160,82,45' : '150,62,30';
    grd.addColorStop(0, `rgba(${base},1)`); grd.addColorStop(0.75, `rgba(${base},0.95)`); grd.addColorStop(1, `rgba(${base},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-atop';
    speckle(g, w, h, 3000, ['#7a3315', '#c46a3a', '#5e2a12', '#d08050'], 3);
    for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(70,30,10,0.35)'; g.lineWidth = rnd(2, 5); g.beginPath(); g.moveTo(rnd(0, w), rnd(0, h)); g.bezierCurveTo(rnd(0, w), rnd(0, h), rnd(0, w), rnd(0, h), rnd(0, w), rnd(0, h)); g.stroke(); }
  }, 'dirt' + light),
  concrete: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a8a39a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, ['#8a857c', '#c2bdb3', '#77726a'], 2);
    g.strokeStyle = 'rgba(60,60,60,0.35)'; g.strokeRect(0, 0, w, h);
  }, 'concrete'),
  wall: () => canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#cbb994', '#f5ecd8', '#b8a27a'], 3);
    g.fillStyle = '#8c3b1f'; g.fillRect(0, h - 64, w, 64); // laterite-stained base band
    speckle(g, w, 64, 600, ['#5e2410', '#a0532d'], 3);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 3, h); }
    g.fillStyle = 'rgba(90,50,20,0.25)'; for (let i = 0; i < 25; i++) g.fillRect(rnd(0, w), h - 64 - rnd(0, 40), rnd(1, 3), rnd(10, 40)); // rain streaks
  }, 'wall'),
  crate: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9c6b3a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = y % 32 ? '#8a5b2f' : '#a8763f'; g.fillRect(0, y, w, 15); }
    g.strokeStyle = '#5b3a1a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
  }, 'crate'),
  wood: () => canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#7b5230'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) { g.fillStyle = 'rgba(40,20,5,0.5)'; g.fillRect(0, y, w, 2); }
    speckle(g, w, h, 400, ['#5a3a1e', '#9b6b40'], 4);
  }, 'wood'),
  zinc: (rust = 0.4) => canvasTex(128, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 8) { g.fillStyle = x % 16 ? '#9aa3a8' : '#c4cbcf'; g.fillRect(x, 0, 8, h); }
    for (let i = 0; i < 300 * rust; i++) { g.fillStyle = Math.random() < 0.5 ? '#8a4a22' : '#a35d2c'; g.globalAlpha = rnd(0.2, 0.6); g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 10), rnd(2, 16)); }
    g.globalAlpha = 1;
  }, 'zinc' + rust),
  building: (color) => canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, [shade(color, 0.85), shade(color, 1.08), '#8a7a60'], 3);
    // one window per 4m x 3m tile
    g.fillStyle = shade(color, 0.7); g.fillRect(70, 52, 116, 86);
    g.fillStyle = '#2d3a44'; g.fillRect(78, 58, 100, 74);
    g.fillStyle = '#7fa3b8'; g.globalAlpha = 0.5; g.fillRect(82, 62, 44, 66); g.globalAlpha = 1;
    g.fillStyle = '#e0e0e0'; for (let x = 78; x <= 178; x += 20) g.fillRect(x, 58, 3, 74); // burglar-proof bars
    g.fillRect(78, 93, 100, 3);
    g.fillStyle = 'rgba(80,50,20,0.3)'; g.fillRect(70, 138, 116, 6);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, h - 6, w, 6); // floor line
  }, 'bld' + color),
  shopFront: (color) => canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1000, [shade(color, 0.85), '#8a7a60'], 3);
    // open shop door with goods
    g.fillStyle = '#1d1a17'; g.fillRect(40, 60, 176, 132);
    const goods = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#ffffff', '#8e24aa'];
    for (let y = 72; y < 180; y += 26) { g.fillStyle = '#5d4037'; g.fillRect(44, y + 18, 168, 4); for (let x = 48; x < 208; x += 12) { g.fillStyle = goods[(x + y) % goods.length]; g.fillRect(x, y + rnd(0, 6), 9, 18 - rnd(0, 6)); } }
    g.fillStyle = '#9e9e9e'; g.fillRect(36, 54, 184, 8); // rolled-up shutter
    g.fillStyle = '#795548'; g.fillRect(0, 176, 40, 16); g.fillRect(216, 176, 40, 16);
  }, 'shop' + color),
  painted: (color) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, [shade(color, 0.85), shade(color, 1.1), '#7a6a50'], 3);
    g.fillStyle = 'rgba(120,50,20,0.25)'; g.fillRect(0, h - 18, w, 18);
  }, 'paint' + color),
  tile: (color) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, [shade(color, 0.9), shade(color, 1.08), '#8a7a60'], 2);
    g.strokeStyle = 'rgba(60,40,20,0.28)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  }, 'tile' + color),
  stripes: (a, b, n = 6, vertical = false) => canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; if (vertical) g.fillRect(i * w / n, 0, w / n + 1, h); else g.fillRect(0, i * h / n, w, h / n + 1); }
  }, `str${a}${b}${n}${vertical}`),
  naija: () => canvasTex(96, 128, (g, w, h) => {
    g.fillStyle = '#008751'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(w / 3, 0, w / 3, h);
  }, 'naija'),
  danfo: () => canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#f5b800'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#263238'; g.fillRect(0, 18, w, 52);           // window band
    g.fillStyle = '#f5b800'; for (let x = 0; x < w; x += 72) g.fillRect(x, 18, 8, 52);
    g.fillStyle = '#111'; g.fillRect(0, 88, w, 9); g.fillRect(0, 106, w, 9); // the famous black stripes
    speckle(g, w, h, 500, ['#a87a00', '#6d4c00'], 4);
  }, 'danfo'),
  palmTrunk: () => canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#7b6247'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { g.fillStyle = '#5a4532'; g.fillRect(0, y, w, 3); }
    speckle(g, w, h, 300, ['#4a3828', '#9a8264'], 3);
  }, 'trunk'),
  frond: () => canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#3f7a2a';
    for (let y = 8; y < h; y += 7) { const half = (w / 2 - 2) * Math.sin(Math.PI * y / h); g.save(); g.translate(w / 2, y); g.rotate(-0.4); g.fillRect(-half, 0, half, 3); g.restore(); g.save(); g.translate(w / 2, y); g.rotate(0.4); g.fillRect(0, 0, half, 3); g.restore(); }
    g.fillStyle = '#5a4a20'; g.fillRect(w / 2 - 2, 0, 4, h);
  }, 'frond'),
  yard: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a7d80'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3500, ['#5c5f62', '#9aa0a4', '#6a6d70', '#8a7a60'], 3);
    g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 42 + 8); g.lineTo(w, i * 42 + 16); g.stroke(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(30,30,30,0.2)'; g.fillRect(rnd(0, w), rnd(0, h), rnd(20, 60), rnd(4, 10)); }
  }, 'yard'),
  sandbag: () => canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#c2a36b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = y % 32 ? '#b39158' : '#d4b57a'; g.fillRect(0, y, w, 15); }
    speckle(g, w, h, 600, ['#8a6a38', '#e0c890', '#6e5428'], 3);
    g.strokeStyle = 'rgba(70,50,20,0.45)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  }, 'sandbag'),
  container: (color) => canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 0, 2, h); }
    g.fillStyle = shade(color, 0.7); g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    g.fillStyle = '#222'; g.fillRect(w * 0.72, h * 0.28, w * 0.2, h * 0.44);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
  }, 'ctr' + color),
  water: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1a5f7a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(180,220,230,${rnd(0.08, 0.22)})`; g.lineWidth = rnd(2, 5); g.beginPath(); g.moveTo(0, rnd(0, h)); g.bezierCurveTo(rnd(0, w), rnd(0, h), rnd(0, w), rnd(0, h), w, rnd(0, h)); g.stroke(); }
    speckle(g, w, h, 800, ['#0e3a4a', '#4a8aa0', '#2a7088'], 3);
  }, 'water'),
};

export function signTexture(text, sub, bg, fg, aspect) {
  const W = 1024, H = Math.max(96, Math.min(512, Math.round(W / aspect)));
  return canvasTex(W, H, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.globalAlpha = 0.85; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const mainH = sub ? h * 0.5 : h * 0.62;
    let size = mainH; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    while (g.measureText(text).width > w * 0.9 && size > 10) { size -= 2; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
    g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
    if (sub) { let s2 = h * 0.2; g.font = `bold ${s2}px Arial, sans-serif`; while (g.measureText(sub).width > w * 0.9 && s2 > 8) { s2 -= 1; g.font = `bold ${s2}px Arial, sans-serif`; } g.fillText(sub, w / 2, h * 0.76); }
    // weathering
    speckle(g, w, h, 700, ['#000', '#fff', '#5d4037'], 4);
    g.fillStyle = 'rgba(90,50,20,0.25)'; for (let i = 0; i < 12; i++) g.fillRect(rnd(0, w), rnd(h * 0.6, h), rnd(2, 4), rnd(10, h * 0.4));
  }, `sign${text}${sub}${bg}${fg}${aspect.toFixed(2)}`);
}

// Box geometry with per-face UVs scaled to world size (tileU/tileV metres per texture repeat).
function boxGeo(w, h, d, tileU = 1, tileV = tileU) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tileU, uv.getY(k) * dims[f][1] / tileV);
  }
  return geo;
}
const matCache = new Map();
function mat(tex, opts = {}) {
  const key = (tex ? tex.uuid : '') + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ map: tex || null, ...opts }));
  return matCache.get(key);
}
const FACE_INDEX = { e: 0, w: 1, s: 4, n: 5 };

function addMesh(scene, geo, material, x, y, z, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m;
}

function queueMesh(store, geo, material, x, y, z, cast = true, receive = true) {
  const g = geo.clone();
  g.translate(x, y, z);
  const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
  if (!store.has(key)) store.set(key, { material, geos: [], cast, receive });
  store.get(key).geos.push(g);
}

function flushQueued(root, store, colliders) {
  for (const b of store.values()) {
    if (!b.geos.length) continue;
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    root.add(m);
    if (colliders) colliders.push(m);
  }
  store.clear();
}


export function buildCar(rot, color = '#c62828') {
  const g = new THREE.Group();
  const bodyC = mat(null, { color });
  const dark = mat(null, { color: shade(color, 0.7) });
  const black = mat(null, { color: '#1a1a1a' });
  const glass = new THREE.MeshLambertMaterial({ color: '#8fb8cc', transparent: true, opacity: 0.45 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.5), bodyC); cabin.position.set(0, 1.25, -0.15); cabin.castShadow = true; g.add(cabin);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), dark); hull.position.set(0, 0.62, 0); hull.castShadow = true; g.add(hull);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 1.1), bodyC); hood.position.set(0, 0.95, -1.4); g.add(hood);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.9), bodyC); boot.position.set(0, 0.95, 1.4); g.add(boot);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 0.05), glass); wind.position.set(0, 1.35, -0.92); g.add(wind);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.4, 0.05), glass); rear.position.set(0, 1.3, 0.62); g.add(rear);
  const lightGeo = new THREE.BoxGeometry(0.28, 0.14, 0.08);
  for (const x of [-0.55, 0.55]) {
    const f = new THREE.Mesh(lightGeo, mat(null, { color: '#fff8dc' })); f.position.set(x, 0.62, -2.12); g.add(f);
    const r = new THREE.Mesh(lightGeo, mat(null, { color: '#c62828' })); r.position.set(x, 0.62, 2.12); g.add(r);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
  for (const [x, z] of [[-0.85, -1.25], [0.85, -1.25], [-0.85, 1.25], [0.85, 1.25]]) {
    const w = new THREE.Mesh(wheelGeo, black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.32, z); w.castShadow = true; g.add(w);
  }
  g.rotation.y = rot ? Math.PI / 2 : 0;
  return g;
}

export function buildKeke(rot) {
  const g = new THREE.Group();
  const yellow = mat(null, { color: '#f7c600' }), green = mat(null, { color: '#1b7a3a' }), black = mat(null, { color: '#1a1a1a' });
  const glass = new THREE.MeshLambertMaterial({ color: '#8fb8cc', transparent: true, opacity: 0.45 });
  const parts = [
    [new THREE.BoxGeometry(1.3, 0.45, 2.3), yellow, 0, 0.55, 0.05],
    [new THREE.BoxGeometry(1.3, 0.75, 1.2), yellow, 0, 1.1, 0.55],
    [new THREE.BoxGeometry(1.32, 0.12, 1.22), green, 0, 0.95, 0.55],
    [new THREE.BoxGeometry(0.7, 0.75, 0.55), yellow, 0, 0.75, -1.0],
    [new THREE.BoxGeometry(1.38, 0.08, 2.1), black, 0, 1.68, 0.1],
    [new THREE.BoxGeometry(1.15, 0.6, 0.04), glass, 0, 1.3, -0.78],
    [new THREE.BoxGeometry(1.0, 0.35, 0.5), black, 0, 0.95, 0.0],
  ];
  for (const [x, z] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 1.1], [0.62, 1.1]]) parts.push([new THREE.BoxGeometry(0.05, 1.0, 0.05), black, x, 1.2, z]);
  for (const [geo, m, x, y, z] of parts) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); }
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 14);
  for (const [x, z] of [[0, -1.0], [-0.62, 0.75], [0.62, 0.75]]) { const w = new THREE.Mesh(wheelGeo, black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.26, z); w.castShadow = true; g.add(w); }
  g.rotation.y = rot ? Math.PI / 2 : 0;
  return g;
}
export function buildDanfo(rot) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(2.2, 2.0, 5.5, 1, 1), [
    mat(T.danfo()), mat(T.danfo()), mat(null, { color: '#f5b800' }), mat(null, { color: '#222' }), mat(T.danfo()), mat(T.danfo()),
  ]);
  // single tile per face
  const uv = body.geometry.attributes.uv; const dims = [[5.5, 2], [5.5, 2], [2.2, 5.5], [2.2, 5.5], [2.2, 2], [2.2, 2]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) / dims[f][0], uv.getY(k) / dims[f][1]); }
  body.position.y = 1.4; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const black = mat(null, { color: '#151515' });
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 16);
  for (const [x, z] of [[-1.0, -1.8], [1.0, -1.8], [-1.0, 1.8], [1.0, 1.8]]) { const w = new THREE.Mesh(wheelGeo, black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w); }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.25, 0.15), mat(null, { color: '#555' })); bumper.position.set(0, 0.5, -2.8); g.add(bumper);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 3.5), mat(null, { color: '#333' })); rack.position.set(0, 2.5, 0.4); g.add(rack);
  g.rotation.y = rot ? Math.PI / 2 : 0;
  return g;
}
export function buildTruck(rot, color = '#3e4a2c') {
  const g = new THREE.Group();
  const bodyC = mat(null, { color });
  const dark = mat(null, { color: shade(color, 0.65) });
  const black = mat(null, { color: '#1a1a1a' });
  const glass = new THREE.MeshLambertMaterial({ color: '#8fb8cc', transparent: true, opacity: 0.45 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.2), bodyC); cab.position.set(0, 1.5, -2.0); cab.castShadow = true; g.add(cab);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 4.0), dark); bed.position.set(0, 1.1, 1.2); bed.castShadow = true; g.add(bed);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.12, 4.0), black); rail.position.set(0, 1.75, 1.2); g.add(rail);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.05), glass); wind.position.set(0, 1.85, -3.1); g.add(wind);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16);
  for (const [x, z] of [[-1.05, -2.0], [1.05, -2.0], [-1.05, 0.4], [1.05, 0.4], [-1.05, 2.4], [1.05, 2.4]]) {
    const w = new THREE.Mesh(wheelGeo, black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); w.castShadow = true; g.add(w);
  }
  g.rotation.y = rot ? Math.PI / 2 : 0;
  return g;
}
function buildPalm(h) {
  const g = new THREE.Group();
  const trunkMat = mat(T.palmTrunk());
  const segs = 5, lean = rnd(-0.25, 0.25), leanZ = rnd(-0.25, 0.25);
  let x = 0, z = 0;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs; const r0 = 0.28 - i * 0.025, r1 = r0 - 0.025;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, sh, 8), trunkMat);
    const nx = x + lean * (i / segs) * 0.6, nz = z + leanZ * (i / segs) * 0.6;
    s.position.set(nx, sh * (i + 0.5), nz); s.castShadow = true; g.add(s); x = nx; z = nz;
  }
  const frondMat = new THREE.MeshLambertMaterial({ map: T.frond(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const top = new THREE.Group(); top.position.set(x, h, z); g.add(top);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.6), frondMat);
    f.geometry.translate(0, 1.8, 0);
    const holder = new THREE.Group(); holder.rotation.y = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
    f.rotation.x = -(Math.PI / 2 + rnd(-0.55, 0.35)); // radiate outward, some drooping
    f.castShadow = true; holder.add(f); top.add(holder);
  }
  const nut = new THREE.SphereGeometry(0.12, 6, 6), nutMat = mat(null, { color: '#4e6b1e' });
  for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(nut, nutMat); n.position.set(Math.cos(i * 1.6) * 0.25, -0.2, Math.sin(i * 1.6) * 0.25); top.add(n); }
  return g;
}

export function clearWorld(scene) {
  const old = scene.getObjectByName('__world');
  if (!old) return;
  scene.remove(old);
  old.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

export function buildWorld(scene, renderer, opts = {}) {
  const map = opts.map || getMap(DEFAULT_MAP);
  const low = !!opts.low;
  const { BOXES, ROADS, DIRT, PALMS, UMBRELLAS, BILLBOARDS, CANOPIES, RIVERS, ARENA_HALF, theme } = map;
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  clearWorld(scene);
  const root = new THREE.Group(); root.name = '__world'; scene.add(root);
  const colliders = [];
  const solidBatches = new Map();
  const ghostBatches = new Map();

  const sky = (theme && theme.sky) || '#9ccbe8';
  const fog = (theme && theme.fog) || '#cfe2ea';
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(fog, 45, 150);
  root.add(new THREE.HemisphereLight('#cfe8ff', '#a0643a', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d0', 2.4);
  sun.position.set(30, 55, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 140 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  root.add(sun); root.add(sun.target);

  const gt = (theme && theme.ground === 'concrete') ? T.yard() : T.ground();
  const groundGeo = new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4);
  groundGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 21; });
  const ground = new THREE.Mesh(groundGeo, mat(gt)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  colliders.push(ground);

  for (const r of (RIVERS || [])) {
    const tex = T.water().clone(); tex.needsUpdate = true; tex.repeat.set(r.w / 12, r.d / 12);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshLambertMaterial({ map: tex, color: '#4aa0b8' }));
    m.rotation.x = -Math.PI / 2; m.position.set(r.x, -0.15, r.z); root.add(m);
  }
  for (const p of DIRT) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshLambertMaterial({ map: T.dirt(!!p.light), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.01, p.z); m.receiveShadow = true; root.add(m);
  }
  for (const r of ROADS) {
    const alongZ = r.d > r.w; const len = alongZ ? r.d : r.w, wid = alongZ ? r.w : r.d;
    const tex = T.asphalt().clone(); tex.needsUpdate = true; tex.repeat.set(len / 12, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; if (alongZ) m.rotation.z = Math.PI / 2;
    m.position.set(r.x, 0.02, r.z); m.receiveShadow = true; root.add(m);
    const kerbMat = mat(T.stripes('#e0e0e0', '#222', 8, true));
    for (const side of [-1, 1]) {
      const kg = boxGeo(alongZ ? 0.25 : len, 0.15, alongZ ? len : 0.25, 2, 1);
      addMesh(root, kg, kerbMat, r.x + (alongZ ? side * (wid / 2 + 0.12) : 0), 0.075, r.z + (alongZ ? 0 : side * (wid / 2 + 0.12)), false, true);
    }
  }

  const concreteMat = mat(T.concrete());
  const roofMat = mat(T.concrete(), { color: '#d8d0c4' });
  const zincRoof = mat(T.zinc(0.8));
  const metalMat = mat(T.painted('#455a64'));
  const invisible = new THREE.MeshBasicMaterial({ visible: false });

  for (const b of BOXES) {
    const cx = b.x, cy = b.y + b.h / 2, cz = b.z;
    let mesh = null;
    switch (b.k) {
      case 'wall': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 4, 5), [mat(T.wall()), mat(T.wall()), concreteMat, concreteMat, mat(T.wall()), mat(T.wall())], cx, cy, cz); break;
      case 'concrete': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 2), concreteMat, cx, cy, cz); break;
      case 'monument': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, b.w, b.h), [mat(T.naija()), mat(T.naija()), concreteMat, concreteMat, mat(T.naija()), mat(T.naija())], cx, cy, cz); break;
      case 'crate': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, b.w, b.h), mat(T.crate()), cx, cy, cz); break;
      case 'stall': {
        mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 1.3), mat(T.wood()), cx, cy, cz);
        const goodsCols = ['#e53935', '#fdd835', '#43a047', '#fb8c00', '#6d4c41'];
        for (let i = 0; i < 6; i++) addMesh(root, new THREE.SphereGeometry(rnd(0.1, 0.18), 6, 5), mat(null, { color: goodsCols[i % 5] }), cx + rnd(-1.1, 1.1), b.y + b.h + 0.1, cz + rnd(-0.5, 0.5), false, false);
        break;
      }
      case 'fence': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 2, 2), mat(T.zinc(1)), cx, cy, cz); break;
      case 'parapet': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 2), mat(T.painted('#d7ccc8')), cx, cy, cz); break;
      case 'pole': mesh = addMesh(root, boxGeo(b.w, b.h, b.d), mat(null, { color: '#444' }), cx, cy, cz); break;
      case 'pillar': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 1, 1), mat(T.stripes('#ffffff', '#c62828', 8)), cx, cy, cz); break;
      case 'pump': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, b.w, b.h), mat(T.stripes('#c62828', '#fafafa', 3)), cx, cy, cz); break;
      case 'metal': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 2), metalMat, cx, cy, cz); break;
      case 'sandbag': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 1, 0.5), mat(T.sandbag()), cx, cy, cz); break;
      case 'bunker': mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 2), mat(T.painted('#5d6456')), cx, cy, cz); break;
      case 'container': {
        const col = b.c || '#c62828';
        mesh = addMesh(root, boxGeo(b.w, b.h, b.d, b.w, b.h), mat(T.container(col)), cx, cy, cz);
        if (b.rot) mesh.rotation.y = Math.PI / 2;
        break;
      }
      case 'shop': {
        const side = mat(T.painted(b.c)), front = mat(T.shopFront(b.c));
        const mats = [side, side, zincRoof, side, side, side];
        mats[FACE_INDEX[b.sign.face]] = front;
        const faceW = (b.sign.face === 'n' || b.sign.face === 's') ? b.w : b.d;
        const geo = boxGeo(b.w, b.h, b.d, 2.5, b.h);
        const fi = FACE_INDEX[b.sign.face], uv = geo.attributes.uv;
        for (let i = 0; i < 4; i++) { const k = fi * 4 + i; uv.setXY(k, i % 2, i < 2 ? 1 : 0); }
        mesh = addMesh(root, geo, mats, cx, cy, cz);
        const aw = new THREE.Mesh(new THREE.BoxGeometry(faceW, 0.06, 1.0), zincRoof);
        placeOnFace(aw, b, 0.5, b.h - 0.95); aw.castShadow = true; root.add(aw);
        break;
      }
      case 'building': {
        const wallMat = mat(T.building(b.c));
        mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 4, 3), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat], cx, cy, cz);
        if (b.h >= 6) { const tank = addMesh(root, new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), mat(null, { color: '#263238' }), cx + b.w / 4, b.y + b.h + 0.7, cz - b.d / 4); tank.castShadow = true; }
        break;
      }
      case 'keke': { const m = buildKeke(b.rot); m.position.set(b.x, b.y, b.z); root.add(m); mesh = addMesh(root, new THREE.BoxGeometry(b.w, b.h, b.d), invisible, cx, cy, cz, false, false); break; }
      case 'danfo': { const m = buildDanfo(b.rot); m.position.set(b.x, b.y, b.z); root.add(m); mesh = addMesh(root, new THREE.BoxGeometry(b.w, b.h, b.d), invisible, cx, cy, cz, false, false); break; }
      case 'truck': { const m = buildTruck(b.rot, b.c); m.position.set(b.x, b.y, b.z); root.add(m); mesh = addMesh(root, new THREE.BoxGeometry(b.w, b.h, b.d), invisible, cx, cy, cz, false, false); break; }
      case 'palm': mesh = addMesh(root, new THREE.BoxGeometry(b.w, b.h, b.d), invisible, cx, cy, cz, false, false); break;
      case 'iwall':
        queueMesh(solidBatches, boxGeo(b.w, b.h, b.d, 3, 3), mat(T.painted(b.c || '#c9b7a4')), cx, cy, cz);
        break;
      case 'floor':
        queueMesh(b.solid === false ? ghostBatches : solidBatches, boxGeo(b.w, b.h, b.d, 2, 2), mat(T.concrete(), { color: b.c || '#d8d0c4' }), cx, cy, cz);
        break;
      case 'ifloor':
        queueMesh(ghostBatches, boxGeo(b.w, b.h, b.d, 2, 2), mat(T.tile(b.c || '#c4b49a')), cx, cy, cz, false, true);
        break;
      case 'stair':
        queueMesh(solidBatches, boxGeo(b.w, b.h, b.d, 2), concreteMat, cx, cy, cz);
        break;
      case 'table':
      case 'counter':
      case 'pew':
        mesh = addMesh(root, boxGeo(b.w, b.h, b.d, b.w, b.h), mat(T.wood()), cx, cy, cz);
        break;
      case 'shelf':
        mesh = addMesh(root, boxGeo(b.w, b.h, b.d, 1, 1), mat(T.wood()), cx, cy, cz);
        break;
      case 'facade':
        if (b.tank) addMesh(root, new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), mat(null, { color: '#263238' }), cx + b.w / 4, b.y + b.h + 0.7, cz - b.d / 4);
        break;
      default: mesh = addMesh(root, boxGeo(b.w, b.h, b.d), concreteMat, cx, cy, cz);
    }
    if (mesh && b.solid !== false) colliders.push(mesh);
    if (b.sign) {
      const faceW = (b.sign.face === 'n' || b.sign.face === 's') ? b.w : b.d;
      const sw = Math.min(faceW * 0.92, b.k === 'building' ? 9 : 5), sh = b.k === 'building' ? Math.min(1.4, sw / 4) : 0.75;
      const sy = b.k === 'shop' ? b.h - 0.45 : (b.h >= 6 ? b.h - 1.1 : b.h - 0.7);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshLambertMaterial({ map: signTexture(b.sign.text, '', b.sign.bg, b.sign.fg, sw / sh) }));
      placeOnFace(plane, b, 0.12, sy); root.add(plane);
    }
  }
  flushQueued(root, solidBatches, colliders);
  flushQueued(root, ghostBatches, null);

  const lights = map.LIGHTS || [];
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0' });
  const cap = low ? 0 : 8;
  lights.forEach((l, i) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bulbMat);
    bulb.position.set(l.x, l.y, l.z); root.add(bulb);
    if (i < cap) {
      const pt = new THREE.PointLight(l.color || '#ffd9a0', l.intensity || 1.8, l.distance || 10, 2);
      pt.position.set(l.x, l.y, l.z); pt.castShadow = false; root.add(pt);
    }
  });

  for (const sign of BILLBOARDS) {
    const tex = signTexture(sign.text, sign.sub, sign.bg, sign.fg, sign.w / sign.h);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sign.w, sign.h, 0.12), [mat(null, { color: '#333' }), mat(null, { color: '#333' }), mat(null, { color: '#333' }), mat(null, { color: '#333' }), mat(tex), mat(tex)]);
    m.position.set(sign.x, sign.y + sign.h / 2, sign.z); m.rotation.y = sign.rot || 0; m.castShadow = true; root.add(m);
  }
  for (const u of UMBRELLAS) {
    addMesh(root, new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), mat(null, { color: '#ddd' }), u.x, 1.2, u.z, false, false);
    const c = addMesh(root, new THREE.ConeGeometry(1.7, 0.55, 8, 1, true), new THREE.MeshLambertMaterial({ map: T.stripes(u.c1, u.c2, 8, true), side: THREE.DoubleSide }), u.x, 2.55, u.z, true, false);
    c.rotation.y = Math.random();
  }
  for (const c of CANOPIES) {
    const m = addMesh(root, boxGeo(c.w, 0.6, c.d, 2, 0.6), [mat(T.stripes(c.c, '#fff', 3)), mat(T.stripes(c.c, '#fff', 3)), mat(null, { color: '#ddd' }), mat(null, { color: '#f5f5f5' }), mat(T.stripes(c.c, '#fff', 3)), mat(T.stripes(c.c, '#fff', 3))], c.x, c.y + 0.3, c.z);
    m.castShadow = true;
  }
  for (const p of PALMS) { const m = buildPalm(p.h); m.position.set(p.x, 0, p.z); root.add(m); }

  const farMat = mat(null, { color: '#9aa7ad' });
  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2, r = rnd(52, 70), hh = rnd(4, 14);
    // leave a gap on the west for the Niger backdrop
    if (RIVERS && RIVERS.length && Math.cos(ang) < -0.7) continue;
    addMesh(root, new THREE.BoxGeometry(rnd(4, 10), hh, rnd(4, 10)), farMat, Math.cos(ang) * r, hh / 2, Math.sin(ang) * r, false, false);
    if (i % 3 === 0) { const pal = buildPalm(rnd(9, 12)); pal.position.set(Math.cos(ang + 0.07) * (r - 5), 0, Math.sin(ang + 0.07) * (r - 5)); root.add(pal); }
  }
  return { colliders, root, map };
}

// Position an object flat against a box face (offset metres out from the face, at height y above box bottom).
function placeOnFace(obj, b, offset, y) {
  const f = b.sign.face;
  const py = b.y + y;
  if (f === 's') { obj.position.set(b.x, py, b.z + b.d / 2 + offset); obj.rotation.y = 0; }
  if (f === 'n') { obj.position.set(b.x, py, b.z - b.d / 2 - offset); obj.rotation.y = Math.PI; }
  if (f === 'e') { obj.position.set(b.x + b.w / 2 + offset, py, b.z); obj.rotation.y = Math.PI / 2; }
  if (f === 'w') { obj.position.set(b.x - b.w / 2 - offset, py, b.z); obj.rotation.y = -Math.PI / 2; }
}
