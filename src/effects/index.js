// Visual effects system — damage numbers, screen shake, particles, decals, etc.
// Extracted from main.js

import * as THREE from 'three';
import { zombieMeshes } from '../entities/zombies.js';
import { wallMeshes } from '../world/map.js';

// ── Dependency injection ──
let _scene, _camera, _player, _weapons, _controls;
export function setEffectsDeps(scene, camera, player, weapons, controls) {
  _scene = scene; _camera = camera; _player = player; _weapons = weapons; _controls = controls;
}

// ===== FLOATING DAMAGE NUMBERS =====
let hitmarkerTimer = 0;
function showHitmarker(isKill) {
  const hm = document.getElementById('hitmarker');
  hm.className = isKill ? 'show kill' : 'show';
  hitmarkerTimer = isKill ? 0.3 : 0.12;
}
function updateHitmarker(dt) {
  if (hitmarkerTimer > 0) {
    hitmarkerTimer -= dt;
    if (hitmarkerTimer <= 0) {
      document.getElementById('hitmarker').className = '';
    }
  }
}
function spawnDmgNumber(worldX, worldY, worldZ, dmg, isKill) {
  // Project 3D position to screen coordinates
  const vec = new THREE.Vector3(worldX, worldY, worldZ);
  vec.project(_camera);
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const sx = vec.x * hw + hw;
  const sy = -vec.y * hh + hh;
  // Don't show if behind camera
  if (vec.z > 1) return;
  const el = document.createElement('div');
  el.className = 'dmg-num';
  el.textContent = isKill ? '☠ ' + dmg : '-' + dmg;
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  el.style.fontSize = isKill ? '22px' : (dmg >= 100 ? '18px' : '14px');
  el.style.color = isKill ? '#ff4444' : (dmg >= 100 ? '#ff8844' : '#ffcc44');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// ===== VISUAL JUICE SYSTEM =====

// --- Screen Shake ---
let shakeIntensity = 0;
let shakeDecay = 8;
let _prevShakeX = 0, _prevShakeY = 0;  // previous frame's offset (to undo before applying new)

function triggerScreenShake(intensity, decay) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  if (decay) shakeDecay = decay;
}

function updateScreenShake(dt) {
  // Always undo last frame's offset first — prevents cumulative drift
  _camera.position.x -= _prevShakeX;
  _camera.position.y -= _prevShakeY;

  if (shakeIntensity > 0.001) {
    _prevShakeX = (Math.random() - 0.5) * shakeIntensity * 0.015;
    _prevShakeY = (Math.random() - 0.5) * shakeIntensity * 0.015;
    _camera.position.x += _prevShakeX;
    _camera.position.y += _prevShakeY;
    shakeIntensity *= Math.pow(0.05, dt); // exponential decay
  } else {
    shakeIntensity = 0;
    _prevShakeX = 0;
    _prevShakeY = 0;
  }
}

// --- Muzzle Flash Particles (3D sparks) — per-weapon variation (S3.1) ---
const muzzleSparks = [];
const sparkGeo = new THREE.SphereGeometry(0.02, 3, 3);

// Per-weapon muzzle flash profiles
// color     = spark color
// count     = number of sparks
// spread    = cone spread of spark velocities
// speed     = base forward velocity
// life      = base lifetime (randomised +50%)
// scale     = spark mesh scale
const MUZZLE_PROFILES = [
  // 0: M1911 — compact yellow flash, 4 sparks
  { color: 0xffdd44, count: 4, spread: 1.2, speed: 9, life: 0.07, scale: 1.0 },
  // 1: MP40 — rapid orange flicker, 3 sparks per shot (fast rate = lots of sparks)
  { color: 0xff8822, count: 3, spread: 1.0, speed: 10, life: 0.05, scale: 0.8 },
  // 2: Trench Gun — wide cone spread, 12+ sparks, longer life
  { color: 0xffaa33, count: 14, spread: 3.5, speed: 7, life: 0.14, scale: 1.3 },
  // 3: Ray Gun — green energy burst, 6 sparks with glow trail
  { color: 0x00ff44, count: 6, spread: 1.8, speed: 6, life: 0.18, scale: 1.6 },
];

function spawnMuzzleSparks() {
  if (!_camera) return;
  const dir = new THREE.Vector3();
  _camera.getWorldDirection(dir);
  const origin = _camera.position.clone().add(dir.clone().multiplyScalar(1.2));
  // Offset slightly to gun position
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  origin.add(right.multiplyScalar(0.15));
  origin.y -= 0.1;

  const wIdx = _player.curWeapon;
  const prof = MUZZLE_PROFILES[wIdx] || MUZZLE_PROFILES[0];

  for (let i = 0; i < prof.count; i++) {
    // Ray Gun sparks get a random green-cyan hue for energy feel
    let c = prof.color;
    if (wIdx === 3) {
      c = Math.random() > 0.5 ? 0x00ff44 : 0x44ffaa;
    }
    // MP40 flicker: alternate orange/yellow
    if (wIdx === 1) {
      c = Math.random() > 0.4 ? 0xff8822 : 0xffcc44;
    }
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(origin);
    mesh.scale.setScalar(prof.scale);
    _scene.add(mesh);

    muzzleSparks.push({
      mesh,
      vx: dir.x * prof.speed + (Math.random() - 0.5) * prof.spread,
      vy: dir.y * prof.speed + Math.random() * 2 + (Math.random() - 0.5) * prof.spread,
      vz: dir.z * prof.speed + (Math.random() - 0.5) * prof.spread,
      life: prof.life + Math.random() * prof.life * 0.5,
    });
  }
}

// --- Tracer Rounds (S3.1) ---
const tracers = [];
const _tracerGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4, 1);
_tracerGeo.rotateX(Math.PI / 2); // align along Z axis
let _mp40ShotCount = 0; // throttle: only every 3rd MP40 bullet gets a tracer

function spawnTracer(origin, hitPoint, weaponIdx) {
  if (!_scene) return;
  // MP40: only show every 3rd bullet
  if (weaponIdx === 1) {
    _mp40ShotCount++;
    if (_mp40ShotCount % 3 !== 0) return;
  }

  const isRayGun = weaponIdx === 3;
  const color = isRayGun ? 0x44ff66 : 0xffffaa;

  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(_tracerGeo, mat);

  // Start position = slightly in front of camera (gun muzzle area)
  mesh.position.copy(origin);

  // Direction from origin to hit
  const dir = new THREE.Vector3().subVectors(hitPoint, origin).normalize();
  // Orient the cylinder along the travel direction
  mesh.lookAt(hitPoint);

  const totalDist = origin.distanceTo(hitPoint);
  const speed = 100; // units per second
  const maxLife = Math.min(totalDist / speed, 0.15); // cap at 0.15s

  _scene.add(mesh);
  tracers.push({
    mesh,
    dx: dir.x * speed,
    dy: dir.y * speed,
    dz: dir.z * speed,
    life: maxLife,
    isRayGun,
  });
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    if (tr.life <= 0) {
      _scene.remove(tr.mesh);
      tr.mesh.material.dispose();
      tracers.splice(i, 1);
      continue;
    }
    tr.mesh.position.x += tr.dx * dt;
    tr.mesh.position.y += tr.dy * dt;
    tr.mesh.position.z += tr.dz * dt;
    // Fade out in last 30%
    const fade = Math.min(1, tr.life / 0.05);
    tr.mesh.material.opacity = fade * 0.9;
    // Ray Gun tracer slight scale pulse
    if (tr.isRayGun) {
      const pulse = 1 + Math.sin(performance.now() * 0.03) * 0.3;
      tr.mesh.scale.set(pulse, pulse, 1);
    }
  }
}

function updateMuzzleSparks(dt) {
  for (let i = muzzleSparks.length - 1; i >= 0; i--) {
    const s = muzzleSparks[i];
    s.life -= dt;
    if (s.life <= 0) {
      _scene.remove(s.mesh);
      s.mesh.material.dispose();
      muzzleSparks.splice(i, 1);
      continue;
    }
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.mesh.material.opacity = s.life * 5;
    s.mesh.scale.setScalar(1 + (1 - s.life * 5) * 2);
  }
}

// --- Zombie Death Animation (dissolve + collapse) ---
const dyingZombies = [];

function startZombieDeathAnim(z) {
  const data = zombieMeshes.get(z);
  if (!data) return;
  const { group, mesh, planeMat, tex, frameCanvas, hpSprite, hpCanvas, hpTex, spriteH } = data;

  // Mark the zombie as dying so the shared eye-light pool skips it
  z._dying = true;
  if (hpSprite) hpSprite.visible = false;
  
  dyingZombies.push({
    mesh: group,        // the Group (contains plane + lights)
    planeMat,           // for fading
    tex,                // for disposal
    hpTex,              // for disposal
    frameCanvas,        // for disposal
    timer: 0,
    duration: 0.6 + Math.random() * 0.3,
    startY: group.position.y,
    fallDir: (Math.random() - 0.5) * 0.5,
    isBoss: z.isBoss,
    wx: z.wx, wz: z.wz,
  });
  
  // Detach from Map so removeZombieMesh won't double-remove
  zombieMeshes.delete(z);
}

function updateDyingZombies(dt) {
  for (let i = dyingZombies.length - 1; i >= 0; i--) {
    const dz = dyingZombies[i];
    dz.timer += dt;
    const t = dz.timer / dz.duration;
    
    if (t >= 1) {
      _scene.remove(dz.mesh);
      // Dispose all children properly
      dz.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      if (dz.hpTex) dz.hpTex.dispose();
      dyingZombies.splice(i, 1);
      continue;
    }
    
    // Collapse downward + tilt + dissolve
    dz.mesh.position.y = dz.startY * (1 - t * 0.8);
    dz.mesh.rotation.x = t * 1.2; // fall forward
    dz.mesh.rotation.z = dz.fallDir * t * 2;
    dz.mesh.scale.y = Math.max(0.1, 1 - t * 0.7);
    
    // Fade out via planeMat (the billboard material)
    if (dz.planeMat) {
      dz.planeMat.transparent = true;
      dz.planeMat.opacity = 1 - t;
    }
  }
}

// --- Blood Splatter Decals on Walls ---
const bloodDecals = [];
const MAX_BLOOD_DECALS = 30;

function spawnBloodSplatter(x, y, z) {
  // Raycast to nearby walls to place decals
  const directions = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.7, 0, 0.7), new THREE.Vector3(-0.7, 0, -0.7),
  ];
  
  const origin = new THREE.Vector3(x, y, z);
  const rc = new THREE.Raycaster();
  
  for (const dir of directions) {
    rc.set(origin, dir.normalize());
    rc.far = 3;
    const hits = rc.intersectObjects(wallMeshes);
    if (hits.length > 0 && hits[0].distance < 3) {
      const hit = hits[0];
      // Create blood splatter plane
      const size = 0.3 + Math.random() * 0.6;
      const splatGeo = new THREE.PlaneGeometry(size, size);
      
      // Draw blood splatter on canvas
      const splatCanvas = document.createElement('canvas');
      splatCanvas.width = 64; splatCanvas.height = 64;
      const sctx = splatCanvas.getContext('2d');
      
      // Random blood splatter pattern
      const cx = 32, cy = 32;
      for (let s = 0; s < 5 + Math.random() * 8; s++) {
        const r = 5 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        const sx = cx + Math.cos(angle) * Math.random() * 15;
        const sy = cy + Math.sin(angle) * Math.random() * 15;
        sctx.beginPath();
        sctx.fillStyle = `rgba(${120 + Math.random()*60}, 0, 0, ${0.6 + Math.random()*0.4})`;
        sctx.arc(sx, sy, r, 0, Math.PI * 2);
        sctx.fill();
      }
      // Drips
      for (let d = 0; d < 3; d++) {
        const dx = 10 + Math.random() * 44;
        sctx.fillStyle = `rgba(${100 + Math.random()*40}, 0, 0, 0.7)`;
        sctx.fillRect(dx, 30 + Math.random() * 10, 2 + Math.random() * 3, 10 + Math.random() * 20);
      }
      
      const splatTex = new THREE.CanvasTexture(splatCanvas);
      const splatMat = new THREE.MeshBasicMaterial({ 
        map: splatTex, transparent: true, opacity: 0.8,
        depthWrite: false, side: THREE.DoubleSide
      });
      
      const splat = new THREE.Mesh(splatGeo, splatMat);
      splat.position.copy(hit.point);
      // Offset slightly from wall to prevent z-fighting
      splat.position.add(hit.face.normal.clone().multiplyScalar(0.02));
      splat.lookAt(hit.point.clone().add(hit.face.normal));
      // Random rotation
      splat.rotateZ(Math.random() * Math.PI * 2);
      
      _scene.add(splat);
      bloodDecals.push({ mesh: splat, life: 15 + Math.random() * 10 }); // 15-25 seconds
      
      // Limit decal count
      while (bloodDecals.length > MAX_BLOOD_DECALS) {
        const old = bloodDecals.shift();
        _scene.remove(old.mesh);
        old.mesh.material.map.dispose();
        old.mesh.material.dispose();
        old.mesh.geometry.dispose();
      }
      
      break; // Only one splatter per kill
    }
  }
}

function updateBloodDecals(dt) {
  for (let i = bloodDecals.length - 1; i >= 0; i--) {
    const d = bloodDecals[i];
    d.life -= dt;
    if (d.life <= 0) {
      _scene.remove(d.mesh);
      d.mesh.material.map.dispose();
      d.mesh.material.dispose();
      d.mesh.geometry.dispose();
      bloodDecals.splice(i, 1);
      continue;
    }
    // Fade out in last 3 seconds
    if (d.life < 3) {
      d.mesh.material.opacity = (d.life / 3) * 0.8;
    }
  }
}

// --- Round Transition Effect ---
let roundTransitionTimer = 0;
let roundTransitionPhase = 'none'; // 'none', 'slowmo', 'flash'
let slowMoFactor = 1;

function triggerRoundTransition() {
  roundTransitionPhase = 'flash';
  roundTransitionTimer = 0.8;
}

function updateRoundTransition(dt) {
  if (roundTransitionPhase === 'none') { slowMoFactor = 1; return; }
  
  roundTransitionTimer -= dt;
  
  if (roundTransitionPhase === 'flash') {
    // Quick white flash then fade
    const flashEl = document.getElementById('roundFlash');
    if (roundTransitionTimer > 0.5) {
      // Flash in
      const t = (0.8 - roundTransitionTimer) / 0.3;
      flashEl.style.opacity = Math.min(0.3, t * 0.3);
      flashEl.style.display = 'block';
    } else if (roundTransitionTimer > 0) {
      // Fade out
      flashEl.style.opacity = (roundTransitionTimer / 0.5) * 0.3;
    } else {
      flashEl.style.display = 'none';
      flashEl.style.opacity = 0;
      roundTransitionPhase = 'none';
    }
  }
  
  slowMoFactor = roundTransitionPhase === 'none' ? 1 : 1;
}

// --- Damage Vignette (red edge pulse when hurt) ---
let vignetteIntensity = 0;

function triggerDamageVignette(amount) {
  vignetteIntensity = Math.min(1, vignetteIntensity + amount * 0.015);
}

function updateDamageVignette(dt) {
  if (vignetteIntensity > 0.01) {
    const vig = document.getElementById('dmgOverlay');
    vig.style.boxShadow = `inset 0 0 ${60 + vignetteIntensity * 100}px ${vignetteIntensity * 40}px rgba(180, 0, 0, ${vignetteIntensity * 0.5})`;
    vig.style.display = 'block';
    vignetteIntensity *= Math.pow(0.1, dt);
  } else {
    vignetteIntensity = 0;
    const vig = document.getElementById('dmgOverlay');
    vig.style.boxShadow = '';
  }
}

// --- Low Health Heartbeat Overlay ---
let heartbeatPhase = 0;

function updateLowHealthEffect(dt, state) {
  if (_player.hp > 0 && _player.hp < _player.maxHp * 0.25 && state === 'playing') {
    heartbeatPhase += dt * 3; // heartbeat speed
    const pulse = Math.abs(Math.sin(heartbeatPhase));
    const vig = document.getElementById('dmgOverlay');
    const baseAlpha = 0.15 + pulse * 0.15;
    vig.style.boxShadow = `inset 0 0 80px 30px rgba(180, 0, 0, ${baseAlpha})`;
    vig.style.display = 'block';
  } else {
    heartbeatPhase = 0;
  }
}

// --- Directional Hit Indicators (CoD-style red arcs) ---
const hitIndicators = [];
const hitDirCanvas = document.getElementById('hitDirCanvas');
const hitDirCtx = hitDirCanvas.getContext('2d');

function resizeHitDirCanvas() {
  hitDirCanvas.width = window.innerWidth;
  hitDirCanvas.height = window.innerHeight;
}
resizeHitDirCanvas();
window.addEventListener('resize', resizeHitDirCanvas);

function triggerHitIndicator(zombieX, zombieZ) {
  // Calculate angle from player to zombie in world space
  const px = _camera.position.x;
  const pz = _camera.position.z;
  const dx = zombieX - px;
  const dz = zombieZ - pz;
  // World angle to the zombie (atan2 gives angle from +Z axis)
  const worldAngle = Math.atan2(dx, dz);
  // Relative angle = world angle minus camera yaw
  // controls._yaw is the camera's yaw (rotation around Y axis)
  const relAngle = worldAngle - _controls._yaw;
  
  // Check if we should merge with existing indicator at similar angle
  for (let i = 0; i < hitIndicators.length; i++) {
    const hi = hitIndicators[i];
    let angleDiff = Math.abs(hi.angle - relAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    if (angleDiff < 0.4) {
      // Refresh existing indicator
      hi.life = 1.0;
      hi.intensity = Math.min(1.5, hi.intensity + 0.3);
      return;
    }
  }
  
  hitIndicators.push({
    angle: relAngle,
    life: 1.0,      // fades from 1 to 0
    intensity: 1.0   // extra brightness for stacking hits
  });
}

function updateHitIndicators(dt) {
  hitDirCtx.clearRect(0, 0, hitDirCanvas.width, hitDirCanvas.height);
  
  const cx = hitDirCanvas.width / 2;
  const cy = hitDirCanvas.height / 2;
  // Distance from center to edge where arcs are drawn
  const radiusX = hitDirCanvas.width * 0.38;
  const radiusY = hitDirCanvas.height * 0.38;
  const arcLen = 0.55; // radians, width of the arc
  
  for (let i = hitIndicators.length - 1; i >= 0; i--) {
    const hi = hitIndicators[i];
    hi.life -= dt * 1.2; // fade over ~0.8 seconds
    
    if (hi.life <= 0) {
      hitIndicators.splice(i, 1);
      continue;
    }
    
    // The angle points FROM center TOWARD the attacker
    // In screen space: 0 = top, PI/2 = right, PI = bottom, -PI/2 = left
    const screenAngle = -hi.angle; // negate because screen Y is inverted
    
    // Calculate position on an ellipse at the screen edge
    const edgeX = cx + Math.sin(screenAngle) * radiusX;
    const edgeY = cy - Math.cos(screenAngle) * radiusY;
    
    // Alpha based on remaining life (quick fade in, slow fade out)
    const fadeIn = Math.min(1, (1 - hi.life) * 8); // quick fade in
    const fadeOut = Math.min(1, hi.life * 2.5);     // slower fade out  
    const alpha = fadeIn * fadeOut * hi.intensity * 0.85;
    
    if (alpha < 0.01) continue;
    
    hitDirCtx.save();
    hitDirCtx.translate(edgeX, edgeY);
    hitDirCtx.rotate(screenAngle);
    
    // Draw a CoD-style crescent/arc shape
    // The arc points inward toward the attacker direction
    const arcRadius = Math.min(hitDirCanvas.width, hitDirCanvas.height) * 0.12;
    
    // Outer arc
    hitDirCtx.beginPath();
    hitDirCtx.arc(0, 0, arcRadius, -arcLen, arcLen);
    // Inner arc (smaller radius, reversed direction to close the shape)
    const innerRadius = arcRadius * 0.55;
    hitDirCtx.arc(0, 0, innerRadius, arcLen, -arcLen, true);
    hitDirCtx.closePath();
    
    // Red gradient fill
    const grad = hitDirCtx.createRadialGradient(0, 0, innerRadius, 0, 0, arcRadius * 1.3);
    grad.addColorStop(0, `rgba(220, 20, 0, ${alpha})`);
    grad.addColorStop(0.5, `rgba(180, 0, 0, ${alpha * 0.8})`);
    grad.addColorStop(1, `rgba(120, 0, 0, 0)`);
    hitDirCtx.fillStyle = grad;
    hitDirCtx.fill();
    
    // Brighter core for emphasis
    hitDirCtx.beginPath();
    hitDirCtx.arc(0, 0, arcRadius * 0.92, -arcLen * 0.7, arcLen * 0.7);
    hitDirCtx.arc(0, 0, innerRadius * 1.15, arcLen * 0.7, -arcLen * 0.7, true);
    hitDirCtx.closePath();
    hitDirCtx.fillStyle = `rgba(255, 40, 20, ${alpha * 0.6})`;
    hitDirCtx.fill();
    
    hitDirCtx.restore();
    
    // Decay intensity for stacked hits
    hi.intensity = Math.max(0.5, hi.intensity - dt * 0.3);
  }
}

function clearHitIndicators() {
  hitIndicators.length = 0;
  hitDirCtx.clearRect(0, 0, hitDirCanvas.width, hitDirCanvas.height);
}

// ===== PARTICLES =====
const particles = [];
const particleGeo = new THREE.SphereGeometry(0.05, 4, 4);

function spawnBloodParticles(x, y, z, count = 5) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, y, z);
    _scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*3,
      vy: Math.random()*3 + 1,
      vz: (Math.random()-0.5)*3,
      life: 0.5 + Math.random()*0.5,
    });
  }
}

// Pre-allocated dirt materials — shared across particles to avoid per-spawn alloc
const _dirtMats = [0x5a3a1a, 0x6b4423, 0x4a2f12, 0x7a5533, 0x3d2b10].map(
  c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
);

function spawnDirtParticles(x, z, count = 12) {
  for (let i = 0; i < count; i++) {
    // Clone from pool so each particle can fade independently
    const mat = _dirtMats[Math.floor(Math.random() * _dirtMats.length)].clone();
    const size = 0.6 + Math.random() * 0.8;
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x + (Math.random()-0.5)*1.2, 0.05, z + (Math.random()-0.5)*1.2);
    mesh.scale.setScalar(size);
    _scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*2.5,
      vy: Math.random()*4 + 2,
      vz: (Math.random()-0.5)*2.5,
      life: 0.8 + Math.random()*0.6,
    });
  }
}

function spawnEnergyParticles(x, y, z, count = 8) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(1.5);
    _scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*5,
      vy: Math.random()*4 + 2,
      vz: (Math.random()-0.5)*5,
      life: 0.7 + Math.random()*0.5,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      _scene.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vy -= 9.8 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    p.mesh.material.opacity = p.life;
  }
}

// ===== FLOATING TEXTS (screen-space) =====
const floatTexts = [];
let floatTextSlot = 0;
function addFloatText(text, color, duration = 1.5) {
  // Stack float texts vertically so they don't overlap
  const baseY = 0.32;
  const yOffset = (floatTextSlot % 6) * 0.045; // 6 slots, spaced 4.5% apart
  floatTextSlot++;
  floatTexts.push({ text, color, life: duration, maxLife: duration, x: 0.5 + (Math.random()-0.5)*0.06, y: baseY + yOffset });
}


export {
  // Floating damage numbers
  spawnDmgNumber,
  // Screen effects
  triggerScreenShake, updateScreenShake, shakeIntensity, _prevShakeX,
  triggerDamageVignette, updateDamageVignette, vignetteIntensity,
  updateLowHealthEffect,
  triggerRoundTransition, updateRoundTransition, roundTransitionPhase,
  // Hitmarker
  showHitmarker, updateHitmarker,
  // Hit indicators
  triggerHitIndicator, updateHitIndicators, clearHitIndicators, hitIndicators,
  resizeHitDirCanvas,
  // Blood & combat effects
  spawnBloodParticles, spawnBloodSplatter, spawnEnergyParticles, spawnDirtParticles,
  spawnMuzzleSparks, updateMuzzleSparks, muzzleSparks,
  spawnTracer, updateTracers, tracers,
  updateBloodDecals, bloodDecals,
  // Zombie death
  startZombieDeathAnim, updateDyingZombies, dyingZombies,
  // Particles
  updateParticles, particles,
  // Float text
  addFloatText, floatTexts,
  // Reset all effects state (called on game restart)
  resetEffects
};

function resetEffects() {
  shakeIntensity = 0;
  _prevShakeX = 0;
  _prevShakeY = 0;
  vignetteIntensity = 0;
  roundTransitionPhase = 'none';
  roundTransitionTimer = 0;
  heartbeatPhase = 0;
  hitmarkerTimer = 0;
  clearHitIndicators();
  // Clean up tracers (S3.1)
  for (let i = tracers.length - 1; i >= 0; i--) {
    _scene.remove(tracers[i].mesh);
    tracers[i].mesh.material.dispose();
  }
  tracers.length = 0;
  _mp40ShotCount = 0;
}
