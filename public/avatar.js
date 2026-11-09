// Remote player "soldier" figure with name tag, simple walk animation and hitboxes.
import * as THREE from 'three';
import { HEAD_Y } from './shared/map.js';
import { buildRifle } from './weapon.js';

let speakerTex = null;
function speakerSprite() {
  if (!speakerTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.fillStyle = '#7CFC00'; g.beginPath(); g.moveTo(14, 25); g.lineTo(24, 25); g.lineTo(36, 14); g.lineTo(36, 50); g.lineTo(24, 39); g.lineTo(14, 39); g.fill();
    g.strokeStyle = '#7CFC00'; g.lineWidth = 4; for (const r of [8, 15]) { g.beginPath(); g.arc(38, 32, r, -0.9, 0.9); g.stroke(); }
    speakerTex = new THREE.CanvasTexture(c); speakerTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: speakerTex, transparent: true }));
  s.scale.set(0.32, 0.32, 1); s.position.set(-0.98, 2.25, 0); s.visible = false; return s;
}

function nameSprite(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 8, 256, 48);
  g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff5a4f'; g.fillText(name.slice(0, 18), 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.25;
  return s;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

export class Soldier {
  constructor(id, name, color = '#4f6b3a') {
    this.id = id; this.name = name;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const uni = new THREE.MeshLambertMaterial({ color });
    const vest = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.6) });
    const skin = new THREE.MeshLambertMaterial({ color: '#6b4430' });
    const dark = new THREE.MeshLambertMaterial({ color: '#222' });
    const add = (parent, geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };

    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.14 * s, 0.9, 0); this.body.add(hip);
      add(hip, new THREE.BoxGeometry(0.22, 0.85, 0.26), uni, 0, -0.42, 0);
      add(hip, new THREE.BoxGeometry(0.24, 0.12, 0.34), dark, 0, -0.84, -0.04);
      this.legs.push(hip);
    }
    add(this.body, new THREE.BoxGeometry(0.56, 0.62, 0.32), uni, 0, 1.2, 0);
    add(this.body, new THREE.BoxGeometry(0.6, 0.45, 0.38), vest, 0, 1.25, 0);
    this.head = new THREE.Group(); this.head.position.set(0, HEAD_Y, 0); this.body.add(this.head);
    add(this.head, new THREE.BoxGeometry(0.28, 0.3, 0.28), skin, 0, 0, 0);
    add(this.head, new THREE.BoxGeometry(0.34, 0.14, 0.36), vest, 0, 0.13, 0.01);
    add(this.head, new THREE.BoxGeometry(0.22, 0.06, 0.02), dark, 0, 0.03, -0.145);

    // arms + gun pitch together
    this.aim = new THREE.Group(); this.aim.position.set(0, 1.42, 0); this.body.add(this.aim);
    const rArm = add(this.aim, new THREE.BoxGeometry(0.13, 0.13, 0.42), uni, 0.24, -0.12, -0.12); rArm.rotation.y = 0.35;
    const lArm = add(this.aim, new THREE.BoxGeometry(0.13, 0.13, 0.55), uni, 0.0, -0.1, -0.33); lArm.rotation.y = -0.45;
    this.rifle = buildRifle('low'); this.rifle.position.set(0.11, -0.04, -0.2); this.aim.add(this.rifle);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    this.flash.position.z = -0.03; this.flash.visible = false; this.rifle.userData.muzzle.add(this.flash);

    // hitboxes (used by local raycasts)
    this.hitBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.6), hitMat); this.hitBody.position.y = 0.75;
    this.hitHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), hitMat); this.hitHead.position.y = HEAD_Y;
    for (const [m, part] of [[this.hitBody, 'body'], [this.hitHead, 'head']]) { m.userData = { pid: id, part }; this.root.add(m); }

    this.tag = nameSprite(name); this.root.add(this.tag);
    this.speaker = speakerSprite(); this.root.add(this.speaker);
    this.walk = 0; this.alive = true; this.deadT = 0; this.flashT = 0;
  }
  setName(name) { if (name === this.name) return; this.name = name; this.root.remove(this.tag); this.tag = nameSprite(name); this.root.add(this.tag); }
  setSpeaking(on) { this.speaker.visible = !!on && this.alive; }
  muzzle() { this.flash.visible = true; this.flashT = 0.05; }
  gunTip(out) { return this.flash.getWorldPosition(out); }
  setAlive(a) { this.alive = a; this.deadT = 0; if (a) { this.body.rotation.set(0, 0, 0); this.body.position.y = 0; this.tag.visible = true; } else { this.tag.visible = false; this.speaker.visible = false; } }
  update(dt, speed, pitch) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (!this.alive) {
      this.deadT += dt; const k = Math.min(1, this.deadT / 0.5);
      this.body.rotation.x = k * Math.PI / 2 * 0.98; this.body.position.y = k * 0.15;
      return;
    }
    this.walk += dt * speed * 1.6;
    const sw = Math.min(1, speed / 5) * 0.6;
    this.legs[0].rotation.x = Math.sin(this.walk) * sw; this.legs[1].rotation.x = -Math.sin(this.walk) * sw;
    this.aim.rotation.x = pitch; this.head.rotation.x = pitch * 0.6;
  }
}
