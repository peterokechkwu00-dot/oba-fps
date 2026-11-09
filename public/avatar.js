// Rigged third-person soldier: Mixamo Vanguard (via three.js examples), cloned per player.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { HEAD_Y } from './shared/map.js';
import { buildRifle, applyRifleSkin } from './weapon.js';
import { getItem } from './shared/catalog.js';

export let lowDetail = false;
export function setSoldierQuality(low) { lowDetail = !!low; }

const MODEL_URL = '/models/Soldier.glb';
// This Vanguard already faces the game's -Z forward at root yaw 0.
const FACE = 0;
// Rifle sits in the metre-space wrapper under the right-hand bone (palm-ish).
// Orientation is rewritten every frame so the muzzle tracks character forward.
const RIFLE_POS = new THREE.Vector3(0.03, 0.06, 0.02);
const RIFLE_SCALE = 1;

let proto = null;          // { scene, animations }
let protoError = null;
const waiting = [];
let loadPromise = null;

export function preloadSoldiers() {
  if (loadPromise) return loadPromise;
  loadPromise = new GLTFLoader().loadAsync(MODEL_URL).then(gltf => {
    proto = { scene: gltf.scene, animations: gltf.animations };
    proto.scene.updateMatrixWorld(true);
    for (const s of waiting.splice(0)) s._assemble();
    return proto;
  }).catch(err => {
    protoError = err;
    console.warn('Soldier.glb failed to load, using box fallback:', err);
    for (const s of waiting.splice(0)) s._assemble();
  });
  return loadPromise;
}

let speakerTex = null;
function speakerSprite() {
  if (!speakerTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.fillStyle = '#7CFC00'; g.beginPath(); g.moveTo(14, 25); g.lineTo(24, 25); g.lineTo(36, 14); g.lineTo(36, 50); g.lineTo(24, 39); g.lineTo(14, 39); g.fill();
    g.strokeStyle = '#7CFC00'; g.lineWidth = 4; for (const r of [8, 15]) { g.beginPath(); g.arc(38, 32, r, -0.9, 0.9); g.stroke(); }
    speakerTex = new THREE.CanvasTexture(c); speakerTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: speakerTex, transparent: true, depthTest: false }));
  s.scale.set(0.32, 0.32, 1); s.position.set(-0.98, 0, 0); s.visible = false; s.renderOrder = 3; return s;
}

function nameSprite(name, color = '#ff5a4f') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 8, 256, 48);
  g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color || '#ff5a4f'; g.fillText(name.slice(0, 18), 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 3;
  return s;
}


let ankaraTex = null;
function ankaraTexture() {
  if (ankaraTex) return ankaraTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const colors = ['#c62828', '#f9a825', '#1b7a3a', '#1565c0', '#6a1b9a', '#fff8e1'];
  g.fillStyle = '#1b5e20'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = colors[(x / 32 + y / 32 | 0) % colors.length];
      g.beginPath(); g.moveTo(x + 16, y); g.lineTo(x + 32, y + 16); g.lineTo(x + 16, y + 32); g.lineTo(x, y + 16); g.fill();
    }
  }
  ankaraTex = new THREE.CanvasTexture(c);
  ankaraTex.colorSpace = THREE.SRGBColorSpace;
  ankaraTex.wrapS = ankaraTex.wrapT = THREE.RepeatWrapping;
  ankaraTex.repeat.set(3, 3);
  return ankaraTex;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const _headW = new THREE.Vector3();
const _hipsW = new THREE.Vector3();
const _spineW = new THREE.Vector3();

function bone(root, name) {
  const aliases = [
    name,
    name.replace('mixamorig:', 'mixamorig'),
    name.replace('mixamorig', 'mixamorig:'),
    name.replace(/:/g, ''),
  ];
  for (const n of aliases) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

function tintMaterials(root, color) {
  const tint = new THREE.Color(color);
  const bodyTint = tint.clone();
  const visorTint = tint.clone().multiplyScalar(0.35);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = !lowDetail;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map(m => {
      const c = m.clone();
      const isVisor = /visor/i.test(o.name || '') || /visor/i.test(c.name || '');
      if (!c.userData) c.userData = {};
      if (!c.userData.baseColor) c.userData.baseColor = (c.color ? c.color.clone() : new THREE.Color('#fff'));
      c.color = c.userData.baseColor.clone().multiply(isVisor ? visorTint : bodyTint);
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

const hitMatShared = hitMat;
const _ws = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _rightAx = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _qWorld = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qExtra = new THREE.Quaternion();
const _eExtra = new THREE.Euler();

// Mixamo bones are authored in centimetres (world scale ~0.01). Parent `obj`
// through a wrapper so its position/rotation/scale stay in metres.
function attachInMeters(parent, obj) {
  parent.updateWorldMatrix(true, false);
  parent.getWorldScale(_ws);
  const wrap = new THREE.Group();
  wrap.name = 'meterWrap';
  wrap.scale.setScalar(1 / Math.max(_ws.x, 1e-6));
  parent.add(wrap);
  wrap.add(obj);
  return wrap;
}

function applyBindExtra(bone, bindQ, x, y, z) {
  if (!bone || !bindQ) return;
  _eExtra.set(x, y, z);
  _qExtra.setFromEuler(_eExtra);
  bone.quaternion.copy(bindQ).multiply(_qExtra);
}

// Two-hand rifle hold targets in character space (m). Forward is -Z, right is +X.
// Overridable at runtime via window.__hold for calibration.
// Offsets from the hips (m). Forward is -Z, right is +X. Follows walk/run hip motion.
const DEFAULT_HOLD = {
  rh: [0.20, 0.18, -0.34],
  lh: [0.04, 0.16, -0.55],
  rPole: [0.50, -0.06, -0.14],
  lPole: [-0.52, -0.08, -0.24],
};

const _ik0 = new THREE.Vector3();
const _ik1 = new THREE.Vector3();
const _ik2 = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikN = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikUpper = new THREE.Vector3();
const _ikTgt = new THREE.Vector3();
const _ikX = new THREE.Vector3();
const _ikY = new THREE.Vector3();
const _ikZ = new THREE.Vector3();
const _ikUp = new THREE.Vector3(0, 1, 0);

function setBoneAimY(bone, worldDir, worldUp) {
  _ikY.copy(worldDir).normalize();
  _ikX.crossVectors(worldUp, _ikY);
  if (_ikX.lengthSq() < 1e-8) _ikX.crossVectors(_ikUp, _ikY);
  _ikX.normalize();
  _ikZ.crossVectors(_ikX, _ikY).normalize();
  _m4.makeBasis(_ikX, _ikY, _ikZ);
  _qWorld.setFromRotationMatrix(_m4);
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qParent);
  bone.quaternion.copy(_qParent.invert()).multiply(_qWorld);
}

function twoBoneIK(upper, mid, effector, targetW, poleW) {
  if (!upper || !mid || !effector) return;
  upper.updateWorldMatrix(true, false);
  mid.updateWorldMatrix(true, false);
  effector.updateWorldMatrix(true, false);
  upper.getWorldPosition(_ik0);
  mid.getWorldPosition(_ik1);
  effector.getWorldPosition(_ik2);
  const len1 = _ik0.distanceTo(_ik1);
  const len2 = _ik1.distanceTo(_ik2);
  if (len1 < 1e-5 || len2 < 1e-5) return;
  _ikDir.copy(targetW).sub(_ik0);
  let d = _ikDir.length();
  if (d < 1e-5) return;
  const maxD = len1 + len2 - 0.004;
  if (d > maxD) { _ikDir.multiplyScalar(maxD / d); d = maxD; }
  _ikDir.multiplyScalar(1 / d);
  _ikPole.copy(poleW).sub(_ik0);
  _ikN.crossVectors(_ikDir, _ikPole);
  if (_ikN.lengthSq() < 1e-8) _ikN.crossVectors(_ikDir, _ikUp);
  _ikN.normalize();
  const cos = THREE.MathUtils.clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
  _ikUpper.copy(_ikDir).applyAxisAngle(_ikN, Math.acos(cos));
  setBoneAimY(upper, _ikUpper, _ikN);
  mid.updateWorldMatrix(true, false);
  mid.getWorldPosition(_ik1);
  _ikDir.copy(targetW).sub(_ik1);
  if (_ikDir.lengthSq() < 1e-10) return;
  setBoneAimY(mid, _ikDir, _ikN);
}

const _qRoot = new THREE.Quaternion();
function charPoint(root, hips, arr, pitch, out) {
  if (hips) hips.getWorldPosition(out);
  else root.getWorldPosition(out).setY(out.y + 0.98);
  _ikDir.set(arr[0], arr[1], arr[2]);
  root.getWorldQuaternion(_qRoot);
  _ikDir.applyQuaternion(_qRoot);
  if (pitch) {
    _rightAx.set(1, 0, 0).applyQuaternion(_qRoot);
    _ikDir.applyAxisAngle(_rightAx, pitch);
  }
  return out.add(_ikDir);
}

export class Soldier {
  constructor(id, name, color = '#4f6b3a') {
    this.id = id; this.name = name; this.color = color;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.alive = true; this.deadT = 0; this.flashT = 0; this.recoil = 0;
    this.mixer = null; this.actions = {}; this.currentClip = null;
    this.model = null; this.ready = false;
    this._pitch = 0; this._strafe = 0; this._air = 0;

    this.hitBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.55), hitMatShared);
    this.hitBody.position.y = 0.75;
    this.hitHead = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), hitMatShared);
    this.hitHead.position.y = HEAD_Y;
    for (const [m, part] of [[this.hitBody, 'body'], [this.hitHead, 'head']]) {
      m.userData = { pid: id, part }; this.root.add(m);
    }

    this.tagAnchor = new THREE.Group(); this.tagAnchor.position.y = 2.15; this.root.add(this.tagAnchor);
    this.tagColor = '#ff5a4f';
    this.cosmetics = { camo: null, rifle: null, tag: null };
    this.tag = nameSprite(name, this.tagColor); this.tagAnchor.add(this.tag);
    this.speaker = speakerSprite(); this.tagAnchor.add(this.speaker);

    if (proto || protoError) this._assemble();
    else {
      waiting.push(this);
      preloadSoldiers();
    }
  }

  _assemble() {
    if (this.ready) return;
    if (!proto) { this._assembleFallback(); return; }
    const clone = cloneSkinned(proto.scene);
    clone.rotation.y = FACE;
    clone.traverse(o => { o.frustumCulled = true; });
    tintMaterials(clone, this.color);
    this.body.add(clone);
    this.model = clone;

    this.hips = bone(clone, 'mixamorig:Hips');
    this.spine = bone(clone, 'mixamorig:Spine');
    this.spine1 = bone(clone, 'mixamorig:Spine1');
    this.spine2 = bone(clone, 'mixamorig:Spine2');
    this.neck = bone(clone, 'mixamorig:Neck');
    this.head = bone(clone, 'mixamorig:Head');
    this.leftUpLeg = bone(clone, 'mixamorig:LeftUpLeg');
    this.rightUpLeg = bone(clone, 'mixamorig:RightUpLeg');
    this.leftArm = bone(clone, 'mixamorig:LeftArm');
    this.leftForeArm = bone(clone, 'mixamorig:LeftForeArm');
    this.leftHand = bone(clone, 'mixamorig:LeftHand');
    this.rightArm = bone(clone, 'mixamorig:RightArm');
    this.rightForeArm = bone(clone, 'mixamorig:RightForeArm');
    this.rightHand = bone(clone, 'mixamorig:RightHand');

    // Thin team-colour plate, shoulder pads and a helmet band — readable without hiding the mesh.
    const accent = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color).multiplyScalar(0.7) });
    if (this.spine2) {
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.035), accent);
      vest.position.set(0, 0.02, 0.09); vest.castShadow = !lowDetail;
      attachInMeters(this.spine2, vest);
      this.vest = vest;
    }
    if (this.head) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.035, 14), accent);
      band.position.set(0, 0.09, 0.0); band.castShadow = !lowDetail;
      attachInMeters(this.head, band);
      this.helmetBand = band;
    }
    for (const [arm, sx] of [[this.rightArm, 1], [this.leftArm, -1]]) {
      if (!arm) continue;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.14), accent);
      pad.position.set(0.02 * sx, 0.05, 0.01); pad.castShadow = !lowDetail;
      attachInMeters(arm, pad);
    }

    // Rifle parented to the right hand bone
    const grip = new THREE.Group();
    grip.name = 'rifleGrip';
    grip.position.copy(RIFLE_POS);
    grip.scale.setScalar(RIFLE_SCALE);
    this.rifle = buildRifle('low');
    grip.add(this.rifle);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    this.flash.position.z = -0.03; this.flash.visible = false;
    (this.rifle.userData.muzzle || this.rifle).add(this.flash);
    if (this.rightHand) attachInMeters(this.rightHand, grip);
    else { grip.position.set(0.2, 1.2, -0.2); this.body.add(grip); }
    this.grip = grip;
    if (typeof location !== 'undefined' && /debugbones=1/.test(location.search)) {
      const axesH = new THREE.AxesHelper(0.35); this.rightHand && this.rightHand.add(axesH);
      const axesG = new THREE.AxesHelper(0.55); grip.add(axesG);
      const axesR = new THREE.AxesHelper(0.7); this.rifle.add(axesR);
    }

    this.bindQ = {};
    for (const k of ['leftArm', 'leftForeArm', 'leftHand', 'rightArm', 'rightForeArm', 'rightHand']) {
      if (this[k]) this.bindQ[k] = this[k].quaternion.clone();
    }

    this.mixer = new THREE.AnimationMixer(clone);
    for (const name of ['Idle', 'Walk', 'Run']) {
      const clip = THREE.AnimationClip.findByName(proto.animations, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveWeight(0);
      this.actions[name.toLowerCase()] = action;
    }
    if (this.actions.idle) { this.actions.idle.setEffectiveWeight(1); this.actions.idle.play(); this.currentClip = 'idle'; }
    this.ready = true;
    if (this.cosmetics) this.setCosmetics(this.cosmetics);
  }

  _assembleFallback() {
    // Keep the game playable if the glTF fails to load (offline, etc.).
    const uni = new THREE.MeshLambertMaterial({ color: this.color });
    const vest = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color).multiplyScalar(0.6) });
    const skin = new THREE.MeshLambertMaterial({ color: '#6b4430' });
    const add = (parent, geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.14 * s, 0.9, 0); this.body.add(hip);
      add(hip, new THREE.BoxGeometry(0.22, 0.85, 0.26), uni, 0, -0.42, 0);
      this.legs.push(hip);
    }
    add(this.body, new THREE.BoxGeometry(0.56, 0.62, 0.32), uni, 0, 1.2, 0);
    add(this.body, new THREE.BoxGeometry(0.6, 0.45, 0.38), vest, 0, 1.25, 0);
    this.head = new THREE.Group(); this.head.position.set(0, HEAD_Y, 0); this.body.add(this.head);
    add(this.head, new THREE.BoxGeometry(0.28, 0.3, 0.28), skin, 0, 0, 0);
    this.aim = new THREE.Group(); this.aim.position.set(0, 1.42, 0); this.body.add(this.aim);
    this.rifle = buildRifle('low'); this.rifle.position.set(0.11, -0.04, -0.2); this.aim.add(this.rifle);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    this.flash.position.z = -0.03; this.flash.visible = false; this.rifle.userData.muzzle.add(this.flash);
    this.ready = true; this.fallback = true;
    if (this.cosmetics) this.setCosmetics(this.cosmetics);
  }

  setName(name) {
    if (name === this.name) return; this.name = name;
    this.tagAnchor.remove(this.tag); if (this.tag.material.map) this.tag.material.map.dispose();
    this.tag = nameSprite(name, this.tagColor); this.tagAnchor.add(this.tag);
  }
  setTagColor(color) {
    if (!color || color === this.tagColor) return;
    this.tagColor = color;
    this.tagAnchor.remove(this.tag); if (this.tag.material.map) this.tag.material.map.dispose();
    this.tag = nameSprite(this.name, this.tagColor); this.tagAnchor.add(this.tag);
  }
  setCamo(color, pattern) {
    if (!this.model) { this._pendingCamo = { color, pattern }; return; }
    const tint = new THREE.Color(color || this.color);
    this.color = color || this.color;
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const c of mats) {
        if (!c || !c.color) continue;
        const base = (c.userData && c.userData.baseColor) ? c.userData.baseColor : new THREE.Color('#ffffff');
        c.color.copy(base).multiply(tint);
        if (pattern === 'ankara') { c.map = ankaraTexture(); c.needsUpdate = true; }
      }
    });
  }
  setRifleSkin(id) {
    this._rifleSkin = id;
    if (this.rifle) applyRifleSkin(this.rifle, id);
  }
  setCosmetics(c = {}) {
    this.cosmetics = { camo: c.camo || this.cosmetics?.camo, rifle: c.rifle || this.cosmetics?.rifle, tag: c.tag || this.cosmetics?.tag };
    const camo = getItem(this.cosmetics.camo);
    if (camo) this.setCamo(camo.color, camo.pattern);
    if (this.cosmetics.rifle) this.setRifleSkin(this.cosmetics.rifle);
    const tag = getItem(this.cosmetics.tag);
    if (tag?.color) this.setTagColor(tag.color);
  }
  setSpeaking(on) { this.speaker.visible = !!on && this.alive; }
  muzzle() { if (this.flash) { this.flash.visible = true; this.flashT = 0.05; } this.recoil = Math.min(1, this.recoil + 0.65); }
  gunTip(out) { return this.flash ? this.flash.getWorldPosition(out) : out.set(0, 1.4, 0); }

  setAlive(a) {
    this.alive = a; this.deadT = 0; this.recoil = 0;
    if (a) {
      this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
      this.tag.visible = true;
      if (this.actions.idle) this._crossfade('idle', 0.05);
    } else {
      this.tag.visible = false; this.speaker.visible = false;
      if (this.mixer) this.mixer.stopAllAction();
    }
  }

  _crossfade(name, t = 0.2) {
    if (this.currentClip === name || !this.actions[name]) return;
    const next = this.actions[name];
    const prev = this.actions[this.currentClip];
    next.reset().setEffectiveWeight(1).fadeIn(t).play();
    if (prev && prev !== next) prev.fadeOut(t);
    this.currentClip = name;
  }

  update(dt, speed, pitch, info = {}) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.flash) this.flash.visible = false; }
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this._pitch = pitch || 0;

    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.7);
      const ease = k * k * (3 - 2 * k);
      // Collapse backward onto the ground
      this.body.rotation.x = ease * (-Math.PI / 2) * 0.98;
      this.body.position.y = Math.sin(ease * Math.PI) * 0.25;
      this._updateHitboxes();
      this._updateTag();
      return;
    }

    if (this.fallback) {
      this.walk = (this.walk || 0) + dt * speed * 1.6;
      const sw = Math.min(1, speed / 5) * 0.6;
      if (this.legs) { this.legs[0].rotation.x = Math.sin(this.walk) * sw; this.legs[1].rotation.x = -Math.sin(this.walk) * sw; }
      if (this.aim) this.aim.rotation.x = this._pitch;
      if (this.head) this.head.rotation.x = this._pitch * 0.6;
      return;
    }

    if (!this.ready) return;

    const airborne = (info.y || 0) > 0.18;
    const vx = info.vx || 0, vz = info.vz || 0;
    const yaw = info.yaw || 0;
    // Movement relative to facing (yaw 0 = -Z). Forward component and sideways component.
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    const forward = vx * fwdX + vz * fwdZ;
    const side = vx * rightX + vz * rightZ;
    const moving = speed > 0.45;
    const strafeAmt = moving ? Math.max(-1, Math.min(1, side / Math.max(speed, 0.01))) : 0;
    this._strafe += (strafeAmt - this._strafe) * Math.min(1, dt * 8);
    this._air += ((airborne ? 1 : 0) - this._air) * Math.min(1, dt * 10);

    let clip = 'idle';
    if (airborne) clip = speed > 2 ? 'run' : 'idle';
    else if (speed > 6.2) clip = 'run';
    else if (moving) clip = 'walk';
    this._crossfade(clip, airborne ? 0.12 : 0.2);
    const act = this.actions[this.currentClip];
    if (act) {
      if (this.currentClip === 'walk') act.timeScale = THREE.MathUtils.clamp(speed / 4.2, 0.7, 1.6);
      else if (this.currentClip === 'run') act.timeScale = THREE.MathUtils.clamp(speed / 8.5, 0.85, 1.35);
      else act.timeScale = 1;
    }
    if (this.mixer) this.mixer.update(dt);

    // Aim pitch on the spine / neck / head, applied AFTER the mixer so it stacks on the clip.
    const p = this._pitch;
    if (this.spine) this.spine.rotation.x += p * 0.25;
    if (this.spine1) this.spine1.rotation.x += p * 0.3;
    if (this.spine2) this.spine2.rotation.x += p * 0.35;
    if (this.neck) this.neck.rotation.x += p * 0.25;
    if (this.head) this.head.rotation.x += p * 0.2;

    // Strafe: lean and twist the hips toward the move direction
    if (this.hips) {
      this.hips.rotation.z += this._strafe * 0.28;
      this.hips.rotation.y += this._strafe * 0.18;
    }
    if (this.spine) this.spine.rotation.z += this._strafe * -0.12;

    // Jump pose: tuck the thighs slightly and lift the arms
    if (this._air > 0.05) {
      const a = this._air;
      if (this.leftUpLeg) this.leftUpLeg.rotation.x -= 0.55 * a;
      if (this.rightUpLeg) this.rightUpLeg.rotation.x -= 0.55 * a;
      if (this.leftArm) this.leftArm.rotation.z += 0.35 * a;
      if (this.rightArm) this.rightArm.rotation.z -= 0.2 * a;
    }

    const holdRifle = typeof location === 'undefined' || !/nohold=1/.test(location.search);
    // Two-bone IK so both hands stay on the rifle through idle/walk/run (clips are unarmed).
    if (holdRifle && this.rightArm && this.rightForeArm && this.rightHand) {
      const H = (typeof window !== 'undefined' && window.__hold) ? window.__hold : DEFAULT_HOLD;
      this.root.updateWorldMatrix(true, false);
      const pitch = this._pitch || 0;
      charPoint(this.root, this.hips, H.rh || DEFAULT_HOLD.rh, pitch, _ikTgt);
      charPoint(this.root, this.hips, H.rPole || DEFAULT_HOLD.rPole, pitch, _ikPole);
      twoBoneIK(this.rightArm, this.rightForeArm, this.rightHand, _ikTgt, _ikPole.clone());
      this._alignRifle();
      if (this.leftArm && this.leftForeArm && this.leftHand && this.rifle) {
        this.rifle.updateWorldMatrix(true, false);
        _ikTgt.set(0, 0.01, -0.28).applyMatrix4(this.rifle.matrixWorld);
        charPoint(this.root, this.hips, H.lPole || DEFAULT_HOLD.lPole, pitch, _ikPole);
        twoBoneIK(this.leftArm, this.leftForeArm, this.leftHand, _ikTgt, _ikPole.clone());
      }
    } else {
      this._alignRifle();
    }

    // Fire recoil: a short backward kick through the upper spine and gun arm
    if (this.recoil > 0) {
      const r = this.recoil;
      if (this.spine2) this.spine2.rotation.x -= 0.18 * r;
      if (this.rightArm) this.rightArm.rotation.x -= 0.25 * r;
    }

    this._alignRifle();
    this._updateHitboxes();
    this._updateTag();
  }

  _alignRifle() {
    if (!this.grip || !this.grip.parent) return;
    this.root.updateWorldMatrix(true, false);
    this.grip.parent.updateWorldMatrix(true, false);
    _fwd.set(0, 0, -1).transformDirection(this.root.matrixWorld);
    if (this._pitch) {
      _rightAx.set(1, 0, 0).transformDirection(this.root.matrixWorld);
      _fwd.applyAxisAngle(_rightAx, this._pitch);
    }
    _eye.setFromMatrixPosition(this.grip.parent.matrixWorld);
    _target.copy(_eye).add(_fwd);
    _m4.lookAt(_eye, _target, _up);
    _qWorld.setFromRotationMatrix(_m4);
    this.grip.parent.getWorldQuaternion(_qParent);
    this.grip.quaternion.copy(_qParent.invert()).multiply(_qWorld);
    if (this.recoil > 0) this.grip.rotateX(-0.22 * this.recoil);
  }

  _updateHitboxes() {
    if (this.head) {
      this.head.getWorldPosition(_headW);
      this.root.worldToLocal(_headW);
      this.hitHead.position.copy(_headW);
    }
    if (this.hips && this.spine2) {
      this.hips.getWorldPosition(_hipsW);
      this.spine2.getWorldPosition(_spineW);
      this.root.worldToLocal(_hipsW);
      this.root.worldToLocal(_spineW);
      this.hitBody.position.lerpVectors(_hipsW, _spineW, 0.45);
      this.hitBody.position.y += 0.15;
    }
  }

  _updateTag() {
    if (this.head) {
      this.head.getWorldPosition(_headW);
      this.root.worldToLocal(_headW);
      this.tagAnchor.position.set(_headW.x, _headW.y + 0.32, _headW.z);
    }
  }
}

// Kick off the download as soon as the module is evaluated (menu flyover / join).
preloadSoldiers();
