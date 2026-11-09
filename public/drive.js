// Client-side vehicle meshes, interpolation, smoke and explosion.
import * as THREE from 'three';
import { buildKeke, buildDanfo, buildCar } from './world.js';
import { unpackVehicle, VEHICLE_TYPES, ID_TYPES, vehicleSpeed, stepVehicle } from './shared/vehicles.js';

const builders = { keke: () => buildKeke(0), danfo: () => buildDanfo(0), car: () => buildCar(0) };

export function createVehicleField(scene) {
  const root = new THREE.Group(); root.name = '__vehicles'; scene.add(root);
  const byId = new Map();
  const smokeTex = makeSmoke();
  const tmp = new THREE.Object3D();

  function ensure(row) {
    const u = unpackVehicle(row);
    let rec = byId.get(u.id);
    if (!rec) {
      const mesh = (builders[u.type] || builders.car)();
      root.add(mesh);
      rec = { id: u.id, type: u.type, mesh, buf: [], smoke: null, fire: null, last: u };
      byId.set(u.id, rec);
    }
    rec.last = u;
    rec.mesh.visible = !!u.alive;
    rec.buf.push({ t: performance.now(), ...u });
    if (rec.buf.length > 8) rec.buf.shift();
    const typ = VEHICLE_TYPES[u.type];
    const hurt = typ && u.alive && u.hp <= typ.hp * 0.4;
    if (hurt && !rec.smoke) rec.smoke = makeParticles(root, u.x, typ.h, u.z, 0x666666);
    if (!hurt && rec.smoke) { root.remove(rec.smoke); rec.smoke = null; }
    return rec;
  }

  return {
    root,
    sync(rows, opts = {}) {
      const seen = new Set();
      for (const row of rows || []) {
        const rec = ensure(row);
        seen.add(rec.id);
        rec.simT = performance.now();
      }
      if (opts.full) {
        for (const [id, rec] of byId) {
          if (seen.has(id)) continue;
          root.remove(rec.mesh);
          if (rec.smoke) root.remove(rec.smoke);
          byId.delete(id);
        }
      }
    },
    update(dt, now, driveOpts = {}) {
      const rt = now - 100;
      const drivingId = driveOpts.id || 0;
      for (const rec of byId.values()) {
        const b = rec.buf;
        if (!b.length) continue;
        let x, y, z, yaw, hp, alive, seats;
        const last = b[b.length - 1];
        if (drivingId && rec.id === drivingId && driveOpts.aabbs) {
          // Client-side prediction for the vehicle we are driving: start from the
          // latest server state and step with our last inputs up to ~150ms ahead.
          const v = {
            ...last, vx: rec.predVx || 0, vz: rec.predVz || 0, speed: rec.predSpeed || 0,
            throttle: driveOpts.inputs?.th || 0, steer: driveOpts.inputs?.st || 0, brake: !!driveOpts.inputs?.br,
            sx: last.x, sz: last.z, syaw: last.yaw, seats: last.seats || [],
          };
          const ahead = Math.min(0.15, Math.max(0, (now - (rec.simT || now)) / 1000));
          if (ahead > 0) stepVehicle(v, ahead, driveOpts.aabbs, []);
          rec.predVx = v.vx; rec.predVz = v.vz; rec.predSpeed = v.speed;
          x = v.x; y = v.y; z = v.z; yaw = v.yaw; hp = last.hp; alive = last.alive; seats = last.seats;
        } else {
          let a = b[0], c = last, pair = false;
          for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; pair = true; break; }
          const k = !pair || c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
          x = a.x + (c.x - a.x) * k;
          y = a.y + (c.y - a.y) * k;
          z = a.z + (c.z - a.z) * k;
          yaw = lerpAngle(a.yaw, c.yaw, k);
          hp = c.hp; alive = c.alive; seats = c.seats;
        }
        rec.mesh.position.set(x, y, z);
        rec.mesh.rotation.y = yaw;
        rec.render = { id: rec.id, x, y, z, yaw, type: rec.type, hp, alive, seats };
        if (rec.smoke) {
          rec.smoke.position.set(x, y + VEHICLE_TYPES[rec.type].h - 0.2, z);
          rec.smoke.rotation.y += dt * 0.8;
          for (const p of rec.smoke.children) {
            p.position.y += dt * 0.8; p.material.opacity = Math.max(0, p.material.opacity - dt * 0.35);
            if (p.position.y > 2.2) { p.position.y = 0.2; p.material.opacity = 0.55; }
          }
        }
      }
    },
    get(id) { return byId.get(id); },
    all() { return [...byId.values()]; },
    explode(id, sceneRef) {
      const rec = byId.get(id);
      if (!rec) return;
      const p = rec.mesh.position;
      boom(sceneRef || scene, p.x, p.y + 0.8, p.z);
    },
    dispose() {
      scene.remove(root);
      byId.clear();
    },
  };
}

function lerpAngle(a, b, t) {
  let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function makeSmoke() { return null; }

function makeParticles(root, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const mat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 6, 5), mat.clone());
    m.position.set((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
    g.add(m);
  }
  root.add(g);
  return g;
}

const sparks = [];
function boom(scene, x, y, z) {
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a00, transparent: true }));
  fire.position.set(x, y, z); scene.add(fire);
  sparks.push({ m: fire, life: 0.45, max: 0.45, scale: 3.5 });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd27a : 0x333333, transparent: true }));
    s.position.set(x, y, z);
    s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6);
    scene.add(s);
    sparks.push({ m: s, life: 0.5, max: 0.5, vel: s.userData.v });
  }
}

export function updateExplosions(dt, scene) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.vel) s.m.position.addScaledVector(s.vel, dt);
    if (s.scale) s.m.scale.setScalar(1 + (s.max - s.life) / s.max * s.scale);
    s.m.material.opacity = Math.max(0, s.life / s.max);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
  }
}
