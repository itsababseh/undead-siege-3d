// Remote player rendering — procedural 3D soldier models.
// Replaces the old canvas-drawn billboard sprite with a full 3D soldier
// built from basic Three.js geometries (boxes, cylinders). Each player
// gets a stable team color derived from their identity hex.
//
// Map: identityHex -> { group, bodyGroup, parts, nameSprite, teamColor,
//                       targetWx, targetWz, targetRy,
//                       renderWx, renderWz, renderRy, _downed, ... }

import * as THREE from 'three';

let _scene = null;

const _meshes = new Map();

// ─── Shared materials (reused across all player instances) ───────────────────

const _bootMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _skinMat = new THREE.MeshLambertMaterial({ color: 0xc8956a });
const _beltMat = new THREE.MeshLambertMaterial({ color: 0x3a2a10 });
const _gloveMat = new THREE.MeshLambertMaterial({ color: 0x2a1a08 });
const _weaponMetalMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const _weaponDarkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _weaponWoodMat = new THREE.MeshLambertMaterial({ color: 0x5a3010 });
const _eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

// Shared geometries (reused across all player instances)
const _geo = {
  boot:     new THREE.BoxGeometry(0.22, 0.15, 0.28),
  leg:      new THREE.BoxGeometry(0.22, 0.50, 0.24),
  belt:     new THREE.BoxGeometry(0.70, 0.06, 0.30),
  torso:    new THREE.BoxGeometry(0.65, 0.50, 0.30),
  arm:      new THREE.BoxGeometry(0.18, 0.45, 0.22),
  glove:    new THREE.BoxGeometry(0.16, 0.10, 0.18),
  neck:     new THREE.CylinderGeometry(0.08, 0.09, 0.10, 8),
  head:     new THREE.BoxGeometry(0.32, 0.30, 0.30),
  helmet:   new THREE.BoxGeometry(0.36, 0.18, 0.34),
  helmetBrim: new THREE.BoxGeometry(0.38, 0.04, 0.38),
  // Weapon parts
  rifleBody:   new THREE.BoxGeometry(0.08, 0.08, 0.55),
  rifleBarrel: new THREE.CylinderGeometry(0.02, 0.025, 0.35, 6),
  rifleStock:  new THREE.BoxGeometry(0.07, 0.06, 0.18),
  torsoSide: new THREE.BoxGeometry(0.12, 0.48, 0.29),
  eye:       new THREE.BoxGeometry(0.06, 0.04, 0.04),
};

// ─── Color helpers ───────────────────────────────────────────────────────────

function colorFromHex(hex) {
  let h = 0;
  for (let i = 0; i < Math.min(hex.length, 16); i++) {
    h = (h * 31 + hex.charCodeAt(i)) >>> 0;
  }
  const hue = (h % 360) / 360;
  const c = new THREE.Color().setHSL(hue, 0.75, 0.55);
  return c;
}

function darken(color, amt) {
  return color.clone().multiplyScalar(amt);
}

// ─── Name tag sprite (unchanged from original) ──────────────────────────────

function makeNameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 5;
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.0, 0.5, 1);
  sp.renderOrder = 1000;
  return sp;
}

// ─── Build procedural 3D soldier ─────────────────────────────────────────────
// Returns { bodyGroup, parts } where parts holds references needed for
// animation and disposal of per-player materials.

function buildSoldier(teamColor) {
  const bodyGroup = new THREE.Group();

  // Per-player materials (team colored — must be disposed per player)
  const teamMat = new THREE.MeshLambertMaterial({ color: teamColor });
  const teamDarkMat = new THREE.MeshLambertMaterial({ color: darken(teamColor, 0.55) });
  const teamMidMat = new THREE.MeshLambertMaterial({ color: darken(teamColor, 0.75) });

  const perPlayerMats = [teamMat, teamDarkMat, teamMidMat];

  // ── Leg pivots (pivot at hip so legs swing from top) ──
  // Left leg pivot at y=0.65 (hip height)
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.15, 0.65, 0);
  bodyGroup.add(leftLegPivot);

  const leftLeg = new THREE.Mesh(_geo.leg, teamDarkMat);
  leftLeg.position.set(0, -0.25, 0); // hang down from pivot
  leftLegPivot.add(leftLeg);

  const leftBoot = new THREE.Mesh(_geo.boot, _bootMat);
  leftBoot.position.set(0, -0.575, 0);
  leftLegPivot.add(leftBoot);

  // Right leg pivot
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.15, 0.65, 0);
  bodyGroup.add(rightLegPivot);

  const rightLeg = new THREE.Mesh(_geo.leg, teamDarkMat);
  rightLeg.position.set(0, -0.25, 0);
  rightLegPivot.add(rightLeg);

  const rightBoot = new THREE.Mesh(_geo.boot, _bootMat);
  rightBoot.position.set(0, -0.575, 0);
  rightLegPivot.add(rightBoot);

  // ── Belt ──
  const belt = new THREE.Mesh(_geo.belt, _beltMat);
  belt.position.set(0, 0.68, 0);
  bodyGroup.add(belt);

  // ── Torso ──
  const torso = new THREE.Mesh(_geo.torso, teamMat);
  torso.position.set(0, 0.95, 0);
  bodyGroup.add(torso);

  // Torso side shading (darker panels on left and right)
  const torsoSideL = new THREE.Mesh(_geo.torsoSide, teamMidMat);
  torsoSideL.position.set(-0.27, 0.95, 0);
  bodyGroup.add(torsoSideL);

  const torsoSideR = new THREE.Mesh(_geo.torsoSide, teamMidMat);
  torsoSideR.position.set(0.27, 0.95, 0);
  bodyGroup.add(torsoSideR);

  // ── Arms (pivot at shoulder) ──
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.42, 1.15, 0);
  bodyGroup.add(leftArmPivot);

  const leftArm = new THREE.Mesh(_geo.arm, teamMat);
  leftArm.position.set(0, -0.225, 0);
  leftArmPivot.add(leftArm);

  const leftGlove = new THREE.Mesh(_geo.glove, _gloveMat);
  leftGlove.position.set(0, -0.50, 0);
  leftArmPivot.add(leftGlove);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.42, 1.15, 0);
  // Right arm angled forward to hold weapon
  rightArmPivot.rotation.x = -0.35;
  bodyGroup.add(rightArmPivot);

  const rightArm = new THREE.Mesh(_geo.arm, teamMat);
  rightArm.position.set(0, -0.225, 0);
  rightArmPivot.add(rightArm);

  const rightGlove = new THREE.Mesh(_geo.glove, _gloveMat);
  rightGlove.position.set(0, -0.50, 0);
  rightArmPivot.add(rightGlove);

  // ── Neck ──
  const neck = new THREE.Mesh(_geo.neck, _skinMat);
  neck.position.set(0, 1.25, 0);
  bodyGroup.add(neck);

  // ── Head ──
  const head = new THREE.Mesh(_geo.head, _skinMat);
  head.position.set(0, 1.45, 0);
  bodyGroup.add(head);

  // Eyes (small dark boxes on front of head)
  const leftEye = new THREE.Mesh(_geo.eye, _eyeMat);
  leftEye.position.set(-0.07, 1.47, -0.14);
  bodyGroup.add(leftEye);

  const rightEye = new THREE.Mesh(_geo.eye, _eyeMat);
  rightEye.position.set(0.07, 1.47, -0.14);
  bodyGroup.add(rightEye);

  // ── Helmet ──
  const helmet = new THREE.Mesh(_geo.helmet, teamDarkMat);
  helmet.position.set(0, 1.59, 0);
  bodyGroup.add(helmet);

  const helmetBrim = new THREE.Mesh(_geo.helmetBrim, teamMidMat);
  helmetBrim.position.set(0, 1.52, -0.02);
  bodyGroup.add(helmetBrim);

  // ── Weapon (switchable — see _buildWeaponInto below) ──
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0.30, 0.80, -0.20);
  weaponGroup.rotation.x = -0.15;
  bodyGroup.add(weaponGroup);
  _buildWeaponInto(weaponGroup, 0); // default to pistol until first broadcast arrives

  // ── Downed indicator light (hidden by default) ──
  const downedLight = new THREE.PointLight(0xff2200, 0, 4);
  downedLight.position.set(0, 1.0, 0);
  bodyGroup.add(downedLight);

  return {
    bodyGroup,
    parts: {
      leftLegPivot,
      rightLegPivot,
      leftArmPivot,
      rightArmPivot,
      torso,
      downedLight,
      weaponGroup,
      weaponIdx: 0,
      perPlayerMats,
    },
  };
}

// Ray Gun glow material (separate so we can make it emissive)
const _rayGunMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
const _rayGunGlowMat = new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.55 });
// Extra geometries for weapon variants
const _wGeo = {
  pistolBody:     new THREE.BoxGeometry(0.08, 0.09, 0.22),
  pistolBarrel:   new THREE.BoxGeometry(0.05, 0.06, 0.15),
  pistolGrip:     new THREE.BoxGeometry(0.06, 0.14, 0.08),
  smgBody:        new THREE.BoxGeometry(0.08, 0.09, 0.40),
  smgBarrel:      new THREE.CylinderGeometry(0.018, 0.02, 0.28, 6),
  smgMag:         new THREE.BoxGeometry(0.05, 0.20, 0.06),
  shotgunBody:    new THREE.BoxGeometry(0.1, 0.1, 0.55),
  shotgunBarrel:  new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8),
  shotgunStock:   new THREE.BoxGeometry(0.09, 0.08, 0.22),
  rayBody:        new THREE.BoxGeometry(0.13, 0.12, 0.45),
  rayCoil:        new THREE.TorusGeometry(0.08, 0.02, 6, 16),
  rayEmitter:     new THREE.SphereGeometry(0.06, 10, 8),
};

function _clearGroup(group) {
  while (group.children.length) {
    const c = group.children.pop();
    if (c.material && c.material !== _rayGunMat && c.material !== _rayGunGlowMat &&
        c.material !== _weaponMetalMat && c.material !== _weaponDarkMat && c.material !== _weaponWoodMat) {
      // instance-owned material, dispose
      try { c.material.dispose(); } catch (e) {}
    }
  }
}

function _buildWeaponInto(group, idx) {
  _clearGroup(group);
  switch (idx) {
    case 0: { // M1911 pistol
      const body = new THREE.Mesh(_wGeo.pistolBody, _weaponMetalMat);
      body.position.set(0, 0.02, -0.02);
      group.add(body);
      const barrel = new THREE.Mesh(_wGeo.pistolBarrel, _weaponDarkMat);
      barrel.position.set(0, 0.03, -0.18);
      group.add(barrel);
      const grip = new THREE.Mesh(_wGeo.pistolGrip, _weaponWoodMat);
      grip.position.set(0, -0.07, 0.02);
      group.add(grip);
      break;
    }
    case 1: { // MP40 SMG
      const body = new THREE.Mesh(_wGeo.smgBody, _weaponMetalMat);
      body.position.set(0, 0, -0.05);
      group.add(body);
      const barrel = new THREE.Mesh(_wGeo.smgBarrel, _weaponDarkMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.42);
      group.add(barrel);
      const mag = new THREE.Mesh(_wGeo.smgMag, _weaponDarkMat);
      mag.position.set(0, -0.14, -0.02);
      group.add(mag);
      break;
    }
    case 2: { // Trench Gun
      const body = new THREE.Mesh(_wGeo.shotgunBody, _weaponMetalMat);
      body.position.set(0, 0, -0.10);
      group.add(body);
      const barrel = new THREE.Mesh(_wGeo.shotgunBarrel, _weaponDarkMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.55);
      group.add(barrel);
      const stock = new THREE.Mesh(_wGeo.shotgunStock, _weaponWoodMat);
      stock.position.set(0, -0.02, 0.24);
      group.add(stock);
      break;
    }
    case 3: { // Ray Gun
      const body = new THREE.Mesh(_wGeo.rayBody, _rayGunMat);
      body.position.set(0, 0.02, -0.10);
      group.add(body);
      const coil = new THREE.Mesh(_wGeo.rayCoil, _rayGunGlowMat);
      coil.rotation.y = Math.PI / 2;
      coil.position.set(0, 0.02, -0.30);
      group.add(coil);
      const emitter = new THREE.Mesh(_wGeo.rayEmitter, _rayGunGlowMat);
      emitter.position.set(0, 0.02, -0.40);
      group.add(emitter);
      break;
    }
    default: {
      // Fallback: generic rifle
      const body = new THREE.Mesh(_geo.rifleBody, _weaponMetalMat);
      body.position.set(0, 0, -0.10);
      group.add(body);
      const barrel = new THREE.Mesh(_geo.rifleBarrel, _weaponDarkMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.55);
      group.add(barrel);
      const stock = new THREE.Mesh(_geo.rifleStock, _weaponWoodMat);
      stock.position.set(0, -0.01, 0.22);
      group.add(stock);
    }
  }
}

// ─── Mesh lifecycle ──────────────────────────────────────────────────────────

function createMesh(hex, name) {
  const group = new THREE.Group();
  const teamColor = colorFromHex(hex);

  const { bodyGroup, parts } = buildSoldier(teamColor);
  group.add(bodyGroup);

  const nameSprite = makeNameSprite(name || 'Survivor');
  nameSprite.position.y = 2.05;
  group.add(nameSprite);

  _scene.add(group);

  return {
    group,
    bodyGroup,
    parts,
    nameSprite,
    teamColor,
    _hex: hex,
    _downed: false,
    _downedLerp: 0, // 0 = upright, 1 = fully fallen
    _animTime: Math.random() * 100, // offset so soldiers don't animate in sync
    _torsoBaseY: 0.95, // base torso Y for breathing/bob
  };
}

function disposeMesh(rec) {
  if (!rec) return;
  _scene.remove(rec.group);

  // Dispose per-player materials
  for (const mat of rec.parts.perPlayerMats) {
    mat.dispose();
  }

  // Dispose name sprite resources
  if (rec.nameSprite.material.map) rec.nameSprite.material.map.dispose();
  rec.nameSprite.material.dispose();
}

// ─── Animation helpers ───────────────────────────────────────────────────────

function animateSoldier(rec, dt) {
  rec._animTime += dt;
  const t = rec._animTime;
  const parts = rec.parts;

  // Detect movement from interpolation delta
  const dx = rec.targetWx - rec.renderWx;
  const dz = rec.targetWz - rec.renderWz;
  const speed = Math.sqrt(dx * dx + dz * dz);
  rec._isMoving = speed > 0.01;

  if (rec._isMoving) {
    // Walk animation — legs and arms swing
    const swing = Math.sin(t * 8);
    parts.leftLegPivot.rotation.x = swing * 0.4;
    parts.rightLegPivot.rotation.x = -swing * 0.4;

    // Arms swing opposite to legs
    parts.leftArmPivot.rotation.x = -swing * 0.3;
    // Right arm keeps its forward angle plus swing
    parts.rightArmPivot.rotation.x = -0.35 + swing * 0.2;

    // Subtle torso bob
    parts.torso.position.y = rec._torsoBaseY + Math.abs(Math.sin(t * 16)) * 0.02;
  } else {
    // Idle — lerp limbs back to rest, subtle breathing
    const lerpRate = 1 - Math.pow(0.01, dt * 5);
    parts.leftLegPivot.rotation.x *= (1 - lerpRate);
    parts.rightLegPivot.rotation.x *= (1 - lerpRate);
    parts.leftArmPivot.rotation.x *= (1 - lerpRate);
    parts.rightArmPivot.rotation.x += (-0.35 - parts.rightArmPivot.rotation.x) * lerpRate;

    // Breathing
    parts.torso.position.y = rec._torsoBaseY + Math.sin(t * 1.5) * 0.01;
  }

  // ── Downed state ──
  const targetDowned = rec._downed ? 1 : 0;
  const downedLerp = 1 - Math.pow(0.01, dt * 4);
  rec._downedLerp += (targetDowned - rec._downedLerp) * downedLerp;

  // Tilt body on Z axis (fall to side)
  rec.bodyGroup.rotation.z = rec._downedLerp * (Math.PI / 2);
  // Shift pivot so body falls toward ground
  rec.bodyGroup.position.y = -rec._downedLerp * 0.5;

  // Pulsing red light when downed
  if (rec._downed) {
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 3));
    parts.downedLight.intensity = pulse * 2;
  } else {
    parts.downedLight.intensity = 0;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initRemotePlayers(scene, camera) {
  _scene = scene;
}

export function updateRemotePlayers(dt, remoteMap) {
  if (!_scene) return;

  // 1. Reconcile: add new, remove gone
  const seen = new Set();
  for (const [hex, data] of remoteMap) {
    seen.add(hex);
    let rec = _meshes.get(hex);
    if (!rec) {
      rec = createMesh(hex, data.name);
      rec.renderWx = data.wx;
      rec.renderWz = data.wz;
      rec.renderRy = data.ry;
      _meshes.set(hex, rec);
    }
    rec.targetWx = data.wx;
    rec.targetWz = data.wz;
    rec.targetRy = data.ry;
    rec._downed = !!data.downed;
    // Swap weapon model if their curWeapon changed since we last drew
    const newWeapon = (data.curWeapon ?? 0) | 0;
    if (newWeapon !== rec.parts.weaponIdx) {
      _buildWeaponInto(rec.parts.weaponGroup, newWeapon);
      rec.parts.weaponIdx = newWeapon;
    }
  }
  for (const [hex, rec] of _meshes) {
    if (!seen.has(hex)) {
      disposeMesh(rec);
      _meshes.delete(hex);
    }
  }

  // 2. Interpolate position + rotation
  const lerp = Math.min(1, dt * 12);
  for (const rec of _meshes.values()) {
    rec.renderWx += (rec.targetWx - rec.renderWx) * lerp;
    rec.renderWz += (rec.targetWz - rec.renderWz) * lerp;

    let rotDiff = rec.targetRy - rec.renderRy;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    rec.renderRy += rotDiff * lerp;

    rec.group.position.set(rec.renderWx, 0, rec.renderWz);
    rec.group.rotation.y = rec.renderRy;

    // 3. Animate the 3D soldier
    animateSoldier(rec, dt);
  }
}

export function clearRemotePlayers() {
  for (const rec of _meshes.values()) disposeMesh(rec);
  _meshes.clear();
}
