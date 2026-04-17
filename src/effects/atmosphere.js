// Atmospheric particle systems — dust motes, rising embers, ground fog wisps
// S3.2: Environmental polish for production-quality ambience

import * as THREE from 'three';

let _scene, _camera;

// ── Shared geometry pools (one alloc each, reused by all particles) ──
const dustGeo = new THREE.SphereGeometry(0.015, 4, 4);
const emberGeo = new THREE.SphereGeometry(0.02, 4, 4);
let fogGeo = null; // created once in init
let fogTexture = null; // procedural CanvasTexture, shared

// ── Particle arrays ──
const dustMotes = [];
const embers = [];
const fogWisps = [];

// ── Helpers ──
function randRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function randomPosNearCamera(radius) {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * radius;
  const y = _camera.position.y + (Math.random() - 0.5) * 4;
  return new THREE.Vector3(
    _camera.position.x + Math.cos(angle) * dist,
    Math.max(0.2, y),
    _camera.position.z + Math.sin(angle) * dist
  );
}

// ── Procedural fog texture (radial gradient, white center to transparent edge) ──
function createFogTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(200,200,210,1)');
  grad.addColorStop(0.4, 'rgba(180,180,190,0.5)');
  grad.addColorStop(1, 'rgba(160,160,170,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ===== DUST MOTES =====
function spawnDustMote(idx) {
  const pos = randomPosNearCamera(10);
  if (idx !== undefined && dustMotes[idx]) {
    const d = dustMotes[idx];
    d.mesh.position.copy(pos);
    d.vx = (Math.random() - 0.5) * 0.2;
    d.vy = (Math.random() - 0.5) * 0.06;
    d.vz = (Math.random() - 0.5) * 0.2;
    d.bobPhase = Math.random() * Math.PI * 2;
    d.bobSpeed = randRange(0.8, 1.6);
    return;
  }
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff5e0,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(dustGeo, mat);
  mesh.position.copy(pos);
  _scene.add(mesh);
  dustMotes.push({
    mesh,
    vx: (Math.random() - 0.5) * 0.2,
    vy: (Math.random() - 0.5) * 0.06,
    vz: (Math.random() - 0.5) * 0.2,
    bobPhase: Math.random() * Math.PI * 2,
    bobSpeed: randRange(0.8, 1.6),
  });
}

function updateDustMotes(dt) {
  const camPos = _camera.position;
  for (let i = 0; i < dustMotes.length; i++) {
    const d = dustMotes[i];
    d.bobPhase += dt * d.bobSpeed;

    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt + Math.sin(d.bobPhase) * 0.015 * dt;
    d.mesh.position.z += d.vz * dt;

    const dx = d.mesh.position.x - camPos.x;
    const dy = d.mesh.position.y - camPos.y;
    const dz = d.mesh.position.z - camPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Respawn when too far from camera
    if (distSq > 225) { // 15^2
      spawnDustMote(i);
      continue;
    }

    // Opacity varies with distance (brighter when closer)
    const dist = Math.sqrt(distSq);
    d.mesh.material.opacity = Math.max(0.05, 0.4 * (1 - dist / 15));
  }
}

// ===== EMBERS / ASH =====
function spawnEmber(idx) {
  const angle = Math.random() * Math.PI * 2;
  const dist = randRange(2, 10);
  const pos = new THREE.Vector3(
    _camera.position.x + Math.cos(angle) * dist,
    randRange(0.05, 0.4),
    _camera.position.z + Math.sin(angle) * dist
  );
  const size = randRange(0.5, 1.5); // scale multiplier on shared geo
  const life = randRange(2, 4);

  if (idx !== undefined && embers[idx]) {
    const e = embers[idx];
    e.mesh.position.copy(pos);
    e.mesh.scale.setScalar(size);
    e.vx = (Math.random() - 0.5) * 0.4;
    e.vy = randRange(0.5, 1.0);
    e.vz = (Math.random() - 0.5) * 0.4;
    e.life = life;
    e.maxLife = life;
    e.mesh.material.opacity = 0.8;
    e.mesh.visible = true;
    return;
  }

  const mat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(emberGeo, mat);
  mesh.position.copy(pos);
  mesh.scale.setScalar(size);
  _scene.add(mesh);
  embers.push({
    mesh,
    vx: (Math.random() - 0.5) * 0.4,
    vy: randRange(0.5, 1.0),
    vz: (Math.random() - 0.5) * 0.4,
    life,
    maxLife: life,
  });
}

function updateEmbers(dt) {
  for (let i = 0; i < embers.length; i++) {
    const e = embers[i];
    e.life -= dt;
    if (e.life <= 0) {
      spawnEmber(i);
      continue;
    }

    e.mesh.position.x += e.vx * dt;
    e.mesh.position.y += e.vy * dt;
    e.mesh.position.z += e.vz * dt;

    // Fade out as they rise (based on remaining life fraction)
    const t = e.life / e.maxLife;
    e.mesh.material.opacity = t * 0.8;
  }
}

// ===== FOG WISPS =====
function spawnFogWisp(idx) {
  const angle = Math.random() * Math.PI * 2;
  const dist = randRange(3, 12);
  const pos = new THREE.Vector3(
    _camera.position.x + Math.cos(angle) * dist,
    0.1,
    _camera.position.z + Math.sin(angle) * dist
  );
  const scale = randRange(2, 4);
  const opacity = randRange(0.03, 0.06);
  const driftAngle = Math.random() * Math.PI * 2;
  const driftSpeed = randRange(0.15, 0.35);
  const rotSpeed = randRange(-0.15, 0.15);

  if (idx !== undefined && fogWisps[idx]) {
    const f = fogWisps[idx];
    f.mesh.position.copy(pos);
    f.mesh.scale.set(scale, scale, 1);
    f.mesh.material.opacity = opacity;
    f.baseOpacity = opacity;
    f.driftX = Math.cos(driftAngle) * driftSpeed;
    f.driftZ = Math.sin(driftAngle) * driftSpeed;
    f.rotSpeed = rotSpeed;
    return;
  }

  const mat = new THREE.MeshBasicMaterial({
    map: fogTexture,
    transparent: true,
    opacity: opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(fogGeo, mat);
  mesh.position.copy(pos);
  mesh.rotation.x = -Math.PI / 2; // lay flat on ground
  mesh.rotation.z = Math.random() * Math.PI * 2;
  mesh.scale.set(scale, scale, 1);
  _scene.add(mesh);
  fogWisps.push({
    mesh,
    baseOpacity: opacity,
    driftX: Math.cos(driftAngle) * driftSpeed,
    driftZ: Math.sin(driftAngle) * driftSpeed,
    rotSpeed,
  });
}

function updateFogWisps(dt) {
  const camPos = _camera.position;
  for (let i = 0; i < fogWisps.length; i++) {
    const f = fogWisps[i];
    f.mesh.position.x += f.driftX * dt;
    f.mesh.position.z += f.driftZ * dt;
    f.mesh.rotation.z += f.rotSpeed * dt;

    const dx = f.mesh.position.x - camPos.x;
    const dz = f.mesh.position.z - camPos.z;
    const distSq = dx * dx + dz * dz;

    // Respawn when too far
    if (distSq > 400) { // 20^2
      spawnFogWisp(i);
    }
  }
}

// ===== PUBLIC API =====

export function initAtmosphere(scene, camera) {
  _scene = scene;
  _camera = camera;

  // Create shared fog resources once
  fogGeo = new THREE.PlaneGeometry(1, 1);
  fogTexture = createFogTexture();

  // Spawn initial particles
  for (let i = 0; i < 25; i++) spawnDustMote();
  for (let i = 0; i < 10; i++) spawnEmber();
  for (let i = 0; i < 5; i++) spawnFogWisp();
}

export function updateAtmosphere(dt) {
  updateDustMotes(dt);
  updateEmbers(dt);
  updateFogWisps(dt);
}
