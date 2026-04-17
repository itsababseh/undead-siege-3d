// Remote player rendering — canvas-drawn human soldier billboard sprites.
// Replaces the old colored capsule with a DOOM-style sprite: a soldier
// body with legs, arms, a helmet, and a rifle held at hip level.
// Each player gets a stable team color derived from their identity hex.
//
// Map: identityHex -> { group, sprite, nameSprite, targetWx, targetWz,
//                       targetRy, renderWx, renderWz, renderRy, downed }

import * as THREE from 'three';

let _scene = null;
let _camera = null;

const _meshes = new Map();

// Sprite canvas size
const SPR_W = 128, SPR_H = 192;

// ─── Color helpers ────────────────────────────────────────────────────────────

function colorFromHex(hex) {
  let h = 0;
  for (let i = 0; i < Math.min(hex.length, 16); i++) {
    h = (h * 31 + hex.charCodeAt(i)) >>> 0;
  }
  const hue = (h % 360) / 360;
  // Convert HSL to hex string for canvas
  const c = new THREE.Color().setHSL(hue, 0.75, 0.55);
  return `#${c.getHexString()}`;
}

function darken(hex, amt = 0.6) {
  // Parse hex color and darken by multiplying RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const rr = Math.floor(r * amt).toString(16).padStart(2, '0');
  const gg = Math.floor(g * amt).toString(16).padStart(2, '0');
  const bb = Math.floor(b * amt).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

// ─── Soldier sprite drawing ───────────────────────────────────────────────────

function drawSoldier(ctx, teamColor, downed = false) {
  const w = SPR_W, h = SPR_H;
  ctx.clearRect(0, 0, w, h);

  if (downed) {
    // Fallen soldier — draw horizontally across bottom
    ctx.save();
    ctx.translate(w / 2, h * 0.72);
    ctx.rotate(Math.PI / 2);
    _drawSoldierBody(ctx, teamColor, 0.7);
    ctx.restore();
    // Pulse red overlay
    ctx.globalAlpha = 0.25 + 0.2 * Math.abs(Math.sin(performance.now() / 300));
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    ctx.globalAlpha = 1;
    return;
  }
  _drawSoldierBody(ctx, teamColor, 1.0);
}

function _drawSoldierBody(ctx, teamColor, alpha) {
  const w = SPR_W, h = SPR_H;
  const dark = darken(teamColor, 0.55);
  const mid = darken(teamColor, 0.75);
  ctx.globalAlpha = alpha;

  // ── Boots ──
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(w * 0.30, h * 0.85, w * 0.15, h * 0.10); // left boot
  ctx.fillRect(w * 0.55, h * 0.85, w * 0.15, h * 0.10); // right boot

  // ── Legs ──
  ctx.fillStyle = dark;
  ctx.fillRect(w * 0.30, h * 0.62, w * 0.16, h * 0.24); // left leg
  ctx.fillRect(w * 0.54, h * 0.62, w * 0.16, h * 0.24); // right leg

  // ── Belt ──
  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(w * 0.26, h * 0.60, w * 0.48, h * 0.05);

  // ── Torso / jacket ──
  ctx.fillStyle = teamColor;
  ctx.fillRect(w * 0.26, h * 0.38, w * 0.48, h * 0.24);

  // Jacket shading — darker sides
  ctx.fillStyle = mid;
  ctx.fillRect(w * 0.26, h * 0.38, w * 0.10, h * 0.24); // left shadow
  ctx.fillRect(w * 0.64, h * 0.38, w * 0.10, h * 0.24); // right shadow

  // Jacket detail line
  ctx.fillStyle = dark;
  ctx.fillRect(w * 0.49, h * 0.38, w * 0.02, h * 0.22);

  // ── Arms ──
  // Left arm (near side) — slightly forward
  ctx.fillStyle = teamColor;
  ctx.fillRect(w * 0.15, h * 0.38, w * 0.13, h * 0.26);
  // Right arm (holding rifle grip)
  ctx.fillRect(w * 0.72, h * 0.38, w * 0.13, h * 0.20);

  // ── Gloves ──
  ctx.fillStyle = '#2a1a08';
  ctx.fillRect(w * 0.15, h * 0.62, w * 0.13, h * 0.07);
  ctx.fillRect(w * 0.72, h * 0.56, w * 0.13, h * 0.07);

  // ── Rifle (M1 Garand style) ──
  // Stock
  ctx.fillStyle = '#5a3010';
  ctx.fillRect(w * 0.68, h * 0.58, w * 0.24, h * 0.05);
  // Body / receiver
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(w * 0.60, h * 0.50, w * 0.32, h * 0.08);
  // Barrel
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(w * 0.56, h * 0.51, w * 0.38, h * 0.04);
  // Barrel tip
  ctx.fillStyle = '#333';
  ctx.fillRect(w * 0.56, h * 0.50, w * 0.04, h * 0.06);
  // Sight
  ctx.fillStyle = '#111';
  ctx.fillRect(w * 0.62, h * 0.48, w * 0.03, h * 0.03);

  // ── Neck ──
  ctx.fillStyle = '#c8956a';
  ctx.fillRect(w * 0.43, h * 0.30, w * 0.14, h * 0.09);

  // ── Head ──
  // Face
  ctx.fillStyle = '#c8956a';
  ctx.beginPath();
  ctx.ellipse(w * 0.50, h * 0.22, w * 0.14, h * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Helmet ──
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(w * 0.50, h * 0.18, w * 0.17, h * 0.10, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // Helmet brim
  ctx.fillStyle = mid;
  ctx.fillRect(w * 0.32, h * 0.24, w * 0.36, h * 0.03);

  // ── Eyes ──
  ctx.fillStyle = '#fff';
  ctx.fillRect(w * 0.41, h * 0.21, w * 0.07, h * 0.03);
  ctx.fillRect(w * 0.52, h * 0.21, w * 0.07, h * 0.03);
  ctx.fillStyle = '#222';
  ctx.fillRect(w * 0.44, h * 0.21, w * 0.03, h * 0.03);
  ctx.fillRect(w * 0.55, h * 0.21, w * 0.03, h * 0.03);

  // ── Outline pass — thin black edge ──
  ctx.globalAlpha = alpha * 0.6;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  // Head outline
  ctx.beginPath();
  ctx.ellipse(w * 0.50, h * 0.22, w * 0.14, h * 0.10, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Torso outline
  ctx.strokeRect(w * 0.26, h * 0.38, w * 0.48, h * 0.24);

  ctx.globalAlpha = 1;
}

// ─── Three.js sprite from canvas ─────────────────────────────────────────────

function makeSoldierSprite(teamColor) {
  const canvas = document.createElement('canvas');
  canvas.width = SPR_W;
  canvas.height = SPR_H;
  const ctx = canvas.getContext('2d');
  drawSoldier(ctx, teamColor, false);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
  const sprite = new THREE.Sprite(mat);
  // Scale: soldiers appear ~1.9 units tall (matches player eye height)
  sprite.scale.set(1.0, 1.9, 1);
  sprite.position.y = 0.95; // center of sprite at mid-body, feet at y=0
  return { sprite, canvas, ctx, tex, mat };
}

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

function createMesh(hex, name) {
  const group = new THREE.Group();
  const teamColor = colorFromHex(hex);

  const { sprite, canvas, ctx, tex, mat } = makeSoldierSprite(teamColor);
  group.add(sprite);

  const nameSprite = makeNameSprite(name || 'Survivor');
  nameSprite.position.y = 2.1;
  group.add(nameSprite);

  _scene.add(group);
  return { group, sprite, canvas, ctx, tex, mat, nameSprite, teamColor, _hex: hex, _downed: false };
}

function disposeMesh(rec) {
  if (!rec) return;
  _scene.remove(rec.group);
  rec.tex.dispose();
  rec.mat.dispose();
  if (rec.nameSprite.material.map) rec.nameSprite.material.map.dispose();
  rec.nameSprite.material.dispose();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initRemotePlayers(scene, camera) {
  _scene = scene;
  _camera = camera;
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
    const nowDowned = !!data.downed;
    // Redraw sprite if downed state changed
    if (nowDowned !== rec._downed) {
      rec._downed = nowDowned;
      drawSoldier(rec.ctx, rec.teamColor, nowDowned);
      rec.tex.needsUpdate = true;
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

    // Pulse red downed overlay each frame (needs canvas redraw for animation)
    if (rec._downed) {
      drawSoldier(rec.ctx, rec.teamColor, true);
      rec.tex.needsUpdate = true;
    }
  }
}

export function clearRemotePlayers() {
  for (const rec of _meshes.values()) disposeMesh(rec);
  _meshes.clear();
}
