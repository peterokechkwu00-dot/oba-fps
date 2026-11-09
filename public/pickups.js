// Floating, rotating, glowing pickup models (canvas/procedural only).
import * as THREE from 'three';

function glowMat(color, opacity = 0.28) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

export function createPickupMesh(kind) {
  const g = new THREE.Group();
  g.userData.kind = kind;
  if (kind === 'med') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), new THREE.MeshLambertMaterial({ color: '#f5f5f5', emissive: '#7a1010', emissiveIntensity: 0.25 }));
    box.castShadow = true; g.add(box);
    const crossM = new THREE.MeshLambertMaterial({ color: '#c62828', emissive: '#ff1744', emissiveIntensity: 0.4 });
    const cx = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.1), crossM); g.add(cx);
    const cy = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.38), crossM); g.add(cy);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 16), glowMat('#ff5252'));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.35; g.add(halo);
  } else if (kind === 'armour') {
    const blue = new THREE.MeshLambertMaterial({ color: '#1565c0', emissive: '#0d47a1', emissiveIntensity: 0.45 });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.28), blue); vest.castShadow = true; g.add(vest);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.08), new THREE.MeshLambertMaterial({ color: '#90caf9', emissive: '#42a5f5', emissiveIntensity: 0.3 }));
    plate.position.z = 0.16; g.add(plate);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 16), glowMat('#448aff'));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.4; g.add(halo);
  } else {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.4), new THREE.MeshLambertMaterial({ color: '#2e7d32', emissive: '#1b5e20', emissiveIntensity: 0.35 }));
    crate.castShadow = true; g.add(crate);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.43), new THREE.MeshLambertMaterial({ color: '#81c784' }));
    lid.position.y = 0.2; g.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.42), new THREE.MeshLambertMaterial({ color: '#ffd54f' }));
    g.add(band);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 16), glowMat('#69f0ae'));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.32; g.add(halo);
  }
  return g;
}

export function createPickupField(scene, list) {
  const root = new THREE.Group(); root.name = '__pickups';
  const items = (list || []).map(p => {
    const mesh = createPickupMesh(p.kind);
    mesh.position.set(p.x, (p.y || 0) + 0.55, p.z);
    mesh.visible = p.up !== false;
    root.add(mesh);
    return { id: p.id, kind: p.kind, x: p.x, y: p.y || 0, z: p.z, mesh, baseY: (p.y || 0) + 0.55 };
  });
  scene.add(root);
  return {
    items,
    setUp(id, up) {
      const it = items.find(i => i.id === id);
      if (it) it.mesh.visible = !!up;
    },
    sync(list2) {
      for (const p of list2 || []) this.setUp(p.id, p.up);
    },
    update(now) {
      const t = now / 1000;
      for (const it of items) {
        if (!it.mesh.visible) continue;
        it.mesh.rotation.y = t * 1.4;
        it.mesh.position.y = it.baseY + Math.sin(t * 2.4 + it.id) * 0.12;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
