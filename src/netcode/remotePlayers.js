// Remote player rendering. Lightweight — for M1, each remote player is a
// colored capsule with a floating name label. Nothing fancy.
//
// This file owns a Map<identityHex, {group, body, nameSprite, targetWx,
// targetWz, targetRy, renderWx, renderWz, renderRy}> and reconciles it each
// frame against netcode.getRemotePlayers().

import * as THREE from 'three';

let _scene = null;
let _camera = null;

// identityHex -> render record
const _meshes = new Map();

// Shared resources (one per remote player, but the geometry + base material
// are cached so swapping colors is cheap).
const _capsuleGeo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8);

export function initRemotePlayers(scene, camera) {
  _scene = scene;
  _camera = camera;
}

function colorFromHex(hex) {
  // Stable deterministic color from the identity hex string
  let h = 0;
  for (let i = 0; i < Math.min(hex.length, 16); i++) {
    h = (h * 31 + hex.charCodeAt(i)) >>> 0;
  }
  const hue = (h % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.7, 0.55);
}

function makeNameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 6;
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function createMesh(hex, name) {
  const group = new THREE.Group();
  const color = colorFromHex(hex);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(_capsuleGeo, mat);
  body.position.y = 0.9;
  group.add(body);

  // Small forward indicator — a little nose triangle at the front
  const noseGeo = new THREE.ConeGeometry(0.15, 0.4, 8);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.0, 0.45);
  group.add(nose);

  const nameSprite = makeNameSprite(name || 'Survivor');
  nameSprite.position.y = 1.8;
  group.add(nameSprite);

  _scene.add(group);
  return { group, body, nameSprite, bodyMat: mat, _hex: hex };
}

function disposeMesh(rec) {
  if (!rec) return;
  _scene.remove(rec.group);
  rec.group.traverse((o) => {
    if (o.geometry && o.geometry !== _capsuleGeo) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
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
    rec.downed = !!data.downed;
  }
  for (const [hex, rec] of _meshes) {
    if (!seen.has(hex)) {
      disposeMesh(rec);
      _meshes.delete(hex);
    }
  }

  // 2. Interpolate toward target position each frame (lerp factor tuned for 20Hz)
  const lerp = Math.min(1, dt * 12);
  for (const rec of _meshes.values()) {
    rec.renderWx += (rec.targetWx - rec.renderWx) * lerp;
    rec.renderWz += (rec.targetWz - rec.renderWz) * lerp;

    // Shortest-angle rotation lerp
    let rotDiff = rec.targetRy - rec.renderRy;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    rec.renderRy += rotDiff * lerp;

    rec.group.position.set(rec.renderWx, 0, rec.renderWz);
    rec.group.rotation.y = rec.renderRy;

    // Downed visuals: tilt the capsule onto its side, desaturate the
    // body color, and pulse an emissive red so teammates can see at a
    // glance who needs a revive. The nose indicator rotates with the
    // body; the name sprite stays upright because it's a billboard.
    if (rec.downed) {
      rec.body.rotation.z = Math.PI / 2;
      rec.body.position.y = 0.35;
      const pulse = 0.4 + 0.4 * Math.sin(performance.now() / 250);
      rec.bodyMat.color.setRGB(0.6, 0.15, 0.15);
      rec.bodyMat.emissive.setRGB(pulse, 0, 0);
      rec.bodyMat.emissiveIntensity = 0.8;
    } else if (rec.body.rotation.z !== 0) {
      rec.body.rotation.z = 0;
      rec.body.position.y = 0.9;
      // Restore the per-identity stable color
      rec.bodyMat.color.copy(colorFromHex(rec._hex || ''));
      rec.bodyMat.emissive.copy(rec.bodyMat.color);
      rec.bodyMat.emissiveIntensity = 0.15;
    }
  }
}

export function clearRemotePlayers() {
  for (const rec of _meshes.values()) disposeMesh(rec);
  _meshes.clear();
}
