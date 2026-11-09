// Procedural AK/M4-hybrid assault rifle. Units are metres; the muzzle points down -Z.
// Origin sits just above the pistol grip. buildRifle('high') is the first-person view model,
// buildRifle('low') is a cheaper version for other players (cached and cloned).
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Worn gunmetal: dark parkerised base, fine grain, bright edge scratches.
function wearTextures() {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#34373b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 40 + Math.random() * 30 | 0; g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${150 + rnd(0, 60)},${150 + rnd(0, 60)},${160 + rnd(0, 60)},${rnd(0.08, 0.35)})`; g.lineWidth = rnd(0.4, 1.3);
      const x = rnd(0, w), y = rnd(0, h), a = rnd(0, Math.PI), l = rnd(4, 30);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(90,60,40,${rnd(0.05, 0.12)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(4, 14), 0, 7); g.fill(); }
  });
  const rough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = 110 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(40,40,40,0.6)'; g.lineWidth = 1; const x = rnd(0, w), y = rnd(0, h), a = rnd(0, Math.PI), l = rnd(4, 30); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }, false);
  return { map, rough };
}
function woodTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#6b3a1c'); grd.addColorStop(0.5, '#8a4f27'); grd.addColorStop(1, '#5e3217');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(40,18,6,${rnd(0.15, 0.4)})`; g.lineWidth = rnd(0.5, 1.8);
      const y0 = rnd(0, h); g.beginPath(); g.moveTo(0, y0);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / rnd(20, 50) + i) * rnd(1, 4));
      g.stroke();
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,220,180,${rnd(0.02, 0.08)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 8), 1); }
  });
}
function polymerTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#26272a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const v = 25 + Math.random() * 25 | 0; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    for (let i = 0; i < 25; i++) { g.strokeStyle = 'rgba(120,120,120,0.15)'; g.beginPath(); const x = rnd(0, w), y = rnd(0, h); g.moveTo(x, y); g.lineTo(x + rnd(-10, 10), y + rnd(-10, 10)); g.stroke(); }
  });
}
export function flashTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c); grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,210,110,0.95)'); grd.addColorStop(0.6, 'rgba(255,120,30,0.35)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    const spikes = 7;
    for (let i = 0; i <= spikes * 2; i++) { const a = (i / (spikes * 2)) * Math.PI * 2, r = i % 2 ? c * 0.28 : c * rnd(0.75, 1); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    g.fill();
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,240,0.9)'; g.beginPath(); g.arc(c, c, c * 0.18, 0, 7); g.fill();
  });
}

let M = null;
function materials() {
  if (M) return M;
  const wear = wearTextures();
  M = {
    metal: new THREE.MeshStandardMaterial({ color: '#a4a8ad', map: wear.map, roughnessMap: wear.rough, metalness: 0.85, roughness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: '#1d1e21', map: wear.map, metalness: 0.6, roughness: 0.6 }),
    polymer: new THREE.MeshStandardMaterial({ map: polymerTexture(), metalness: 0.0, roughness: 0.78 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), metalness: 0.0, roughness: 0.5 }),
    mag: new THREE.MeshStandardMaterial({ color: '#7a3a22', map: polymerTexture(), metalness: 0.05, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: '#7fa6ff', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff2a1a' }),
    bore: new THREE.MeshBasicMaterial({ color: '#050505' }),
  };
  return M;
}

// Extrude a side-profile drawn as (forward, up) points, width along X, centred on x=0.
function profile(points, width, bevel = 0.002, uvScale = 6) {
  const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]); for (const p of points.slice(1)) s.lineTo(p[0], p[1]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2); // shape-x (forward) -> -Z, extrusion -> X
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  return geo;
}
const cylZ = (r1, r2, len, seg = 16, open = false) => new THREE.CylinderGeometry(r1, r2, len, seg, 1, open).rotateX(Math.PI / 2);

function build(detail) {
  const m = materials(); const hi = detail === 'high';
  const root = new THREE.Group(); root.name = 'rifle';
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = !hi; parent.add(me); return me; };
  const seg = hi ? 18 : 8;

  // Receiver + dust cover
  add(new THREE.BoxGeometry(0.048, 0.062, 0.27), m.metal, 0, 0.01, -0.06);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.25, seg, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), m.metal, 0, 0.041, -0.06);
  add(new THREE.BoxGeometry(0.05, 0.012, 0.09), m.black, 0, -0.026, -0.16); // mag well housing
  // Picatinny rail on top for the red dot
  add(new THREE.BoxGeometry(0.022, 0.008, 0.15), m.black, 0, 0.069, -0.07);
  if (hi) for (let i = 0; i < 14; i++) add(new THREE.BoxGeometry(0.025, 0.004, 0.005), m.black, 0, 0.075, -0.0 - i * 0.0105);

  // Barrel, gas system, front sight, muzzle brake
  add(cylZ(0.0095, 0.0095, 0.42, seg), m.metal, 0, 0.004, -0.40);
  add(cylZ(0.009, 0.009, 0.22, seg), m.metal, 0, 0.034, -0.30);
  add(new THREE.BoxGeometry(0.03, 0.05, 0.032), m.metal, 0, 0.018, -0.425);
  add(cylZ(0.014, 0.014, 0.024, seg), m.metal, 0, 0.004, -0.555);
  add(new THREE.BoxGeometry(0.004, 0.034, 0.006), m.black, 0, 0.032, -0.555);
  if (hi) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.003, 0.034, 0.012), m.black, 0.011 * s, 0.03, -0.555);
  add(cylZ(0.0135, 0.0135, 0.058, seg), m.black, 0, 0.004, -0.64);
  add(cylZ(0.0062, 0.0062, 0.002, seg), m.bore, 0, 0.004, -0.6695);
  if (hi) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.006, 0.009), m.bore, 0.0118 * s, 0.006, -0.625 - i * 0.014);

  // Quad-rail handguard
  add(cylZ(0.031, 0.031, 0.19, 8), m.black, 0, 0.016, -0.29).rotation.z = Math.PI / 8;
  for (const [x, y, rz] of [[0, 0.049, 0], [0, -0.017, 0], [0.033, 0.016, Math.PI / 2], [-0.033, 0.016, Math.PI / 2]]) {
    const r = add(new THREE.BoxGeometry(0.02, 0.007, 0.18), m.black, x, y, -0.29); r.rotation.z = rz;
    if (hi) for (let i = 0; i < 12; i++) { const t = add(new THREE.BoxGeometry(0.023, 0.0035, 0.005), m.black, x * 1.1, y + (y > 0.04 ? 0.004 : y < 0 ? -0.004 : 0), -0.21 - i * 0.0145); t.rotation.z = rz; }
  }
  if (hi) for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.002, 0.012, 0.02), m.bore, 0.031 * s, 0.016, -0.235 - i * 0.04);

  // Wooden stock
  add(profile([[-0.07, 0.035], [-0.12, 0.033], [-0.33, 0.012], [-0.335, -0.085], [-0.30, -0.095], [-0.16, -0.035], [-0.07, -0.02]], 0.04, hi ? 0.004 : 0, 8), m.wood);
  add(new THREE.BoxGeometry(0.044, 0.105, 0.012), m.polymer, 0, -0.035, 0.338); // butt pad
  // Pistol grip
  add(profile([[0.0, -0.022], [0.035, -0.022], [0.02, -0.06], [0.0, -0.125], [-0.032, -0.128], [-0.03, -0.1], [-0.012, -0.045]], 0.03, hi ? 0.003 : 0, 10), m.polymer);
  if (hi) for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.031, 0.003, 0.004), m.black, 0, -0.055 - i * 0.014, -0.008 + i * 0.006);
  // Trigger guard + trigger
  const guard = new THREE.Shape(); guard.moveTo(0.035, -0.022); guard.lineTo(0.11, -0.022); guard.lineTo(0.105, -0.06); guard.lineTo(0.04, -0.062); guard.lineTo(0.03, -0.045); guard.lineTo(0.035, -0.022);
  const hole = new THREE.Path(); hole.moveTo(0.042, -0.026); hole.lineTo(0.1, -0.026); hole.lineTo(0.097, -0.055); hole.lineTo(0.045, -0.056); hole.lineTo(0.038, -0.045); hole.lineTo(0.042, -0.026); guard.holes.push(hole);
  const gGeo = new THREE.ExtrudeGeometry(guard, { depth: 0.008, bevelEnabled: false }); gGeo.translate(0, 0, -0.004); gGeo.rotateY(Math.PI / 2);
  add(gGeo, m.metal);
  add(profile([[0.06, -0.024], [0.068, -0.024], [0.064, -0.04], [0.058, -0.05], [0.055, -0.045], [0.058, -0.034]], 0.006, 0), m.metal);

  // Magazine (curved, bakelite) on its own pivot so it can drop during reloads
  const magGroup = new THREE.Group(); magGroup.position.set(0, -0.03, -0.14); root.add(magGroup);
  const magPts = [], back = [];
  const N = hi ? 10 : 4;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = -0.2 * t; const ur = -0.028 + 0.1 * Math.pow(t, 1.5); magPts.push([ur + 0.056 + 0.012 * t, y]); back.unshift([ur, y]); }
  magGroup.add(new THREE.Mesh(profile([...magPts, ...back], 0.027, hi ? 0.002 : 0, 8), m.mag));
  if (hi) for (let i = 1; i < 5; i++) { const t = i / 5.5; const rib = add(new THREE.BoxGeometry(0.029, 0.004, 0.05), m.mag, 0, -0.2 * t, -(-0.028 + 0.1 * Math.pow(t, 1.5) + 0.03), magGroup); rib.rotation.x = -0.35 * t; }
  const plate = add(new THREE.BoxGeometry(0.03, 0.008, 0.07), m.black, 0, -0.202, -0.1, magGroup); plate.rotation.x = -0.5;

  // Charging handle (right side), selector, rivets
  const chGroup = new THREE.Group(); chGroup.position.set(0.026, 0.024, -0.14); root.add(chGroup);
  add(new THREE.BoxGeometry(0.006, 0.01, 0.03), m.metal, 0, 0, 0, chGroup);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.018, 10).rotateZ(Math.PI / 2), m.metal, 0.01, 0, -0.012, chGroup);
  add(new THREE.BoxGeometry(0.004, 0.008, 0.085), m.metal, 0.026, 0.028, -0.02).rotation.x = 0.12;
  if (hi) for (const z of [0.03, -0.02, -0.1, -0.16]) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, 8).rotateZ(Math.PI / 2), m.black, 0.0245 * s, -0.008, z);

  // Red-dot sight (high detail only)
  let sight = null;
  if (hi) {
    add(new THREE.BoxGeometry(0.028, 0.014, 0.05), m.black, 0, 0.081, -0.075);
    add(cylZ(0.0195, 0.0195, 0.07, 24, true), m.black, 0, 0.108, -0.075).material = m.black.clone();
    root.children[root.children.length - 1].material.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 12).rotateZ(Math.PI / 2), m.black, 0.022, 0.108, -0.07);
    add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.01, 12), m.black, 0, 0.13, -0.07);
    const lens = add(new THREE.CircleGeometry(0.018, 24), m.glass, 0, 0.108, -0.105); lens.rotation.y = Math.PI;
    add(new THREE.SphereGeometry(0.00075, 8, 8), m.dot, 0, 0.108, -0.104);
    sight = new THREE.Vector3(0, 0.108, -0.075);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.004, -0.675); root.add(muzzle);
  root.userData = { mag: magGroup, magRest: magGroup.position.clone(), charge: chGroup, chargeRest: chGroup.position.clone(), muzzle, sight };
  return root;
}

const cache = {};
// Returns a new rifle. 'high' is built fresh (one per client); 'low' is cloned from a cached template.
export function buildRifle(detail = 'high') {
  if (detail === 'high') return build('high');
  if (!cache.low) cache.low = build('low');
  const g = cache.low.clone(true);
  g.userData = { muzzle: g.children[g.children.length - 1] };
  return g;
}
