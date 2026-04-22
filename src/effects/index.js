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

  // S4.2: Capture boss light + shadow refs for death animation & cleanup
  const bossLight = data.bossLight || null;
  const bossShadow = data.bossShadow || null;

  // S4.2: Boss death — flash the attached light bright white briefly
  if (z.isBoss && bossLight) {
    bossLight.color.setHex(0xffffff);
    bossLight.intensity = 3.0;
  }
  
  dyingZombies.push({
    mesh: group,        // the Group (contains plane + lights)
    planeMat,           // for fading
    tex,                // for disposal
    hpTex,              // for disposal
    frameCanvas,        // for disposal
    timer: 0,
    duration: z.isBoss ? 1.0 + Math.random() * 0.3 : 0.6 + Math.random() * 0.3,
    startY: group.position.y,
    fallDir: (Math.random() - 0.5) * 0.5,
    isBoss: z.isBoss,
    wx: z.wx, wz: z.wz,
    bossLight, bossShadow,
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
      // S4.2: Boss light + shadow are children of group — already removed
      // by _scene.remove(dz.mesh) and disposed by traverse above.
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

    // S4.2: Boss death light — fade from bright white flash to zero
    if (dz.isBoss && dz.bossLight) {
      dz.bossLight.intensity = Math.max(0, 3.0 * (1 - t * 2)); // fade out in first half
    }
    // S4.2: Boss shadow fade
    if (dz.isBoss && dz.bossShadow) {
      dz.bossShadow.material.opacity = 0.35 * (1 - t);
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
  // Cap at 0.6 so the overlay never blocks too much of the screen
  vignetteIntensity = Math.min(0.6, vignetteIntensity + amount * 0.010);
}

let heartbeatPhase = 0;

function updateDamageVignette(dt) {
  vignetteIntensity *= Math.pow(0.02, dt);
  if (vignetteIntensity < 0.001) vignetteIntensity = 0;
  _applyVignetteOverlay();
}

function _applyVignetteOverlay() {
  // Combine damage vignette, progressive low-HP tint, and the critical
  // heartbeat pulse into a single inset shadow. Take the max of each
  // layer so they don't overwrite each other.
  const dmg = vignetteIntensity;

  // Progressive tint: ramps smoothly from 0 at 60% HP to 0.28 at 0% HP.
  // Subtle at half HP, clearly visible near death. Separate from the
  // critical heartbeat so players get feedback BEFORE they're dying.
  let progTint = 0;
  if (_player && _player.hp > 0 && state_isPlaying) {
    const pct = _player.hp / _player.maxHp;
    if (pct < 0.60) {
      // Quadratic curve — barely any effect at 50%, strong at 10%
      const k = (0.60 - pct) / 0.60; // 0..1
      progTint = k * k * 0.28;
    }
  }

  // Critical heartbeat (<15% HP) — faster pulse on top of the progressive tint
  let pulse = 0;
  if (_player && _player.hp > 0 && _player.hp < _player.maxHp * 0.15 && state_isPlaying) {
    pulse = 0.22 + Math.abs(Math.sin(heartbeatPhase)) * 0.14;
  }

  const alpha = Math.max(dmg * 0.35, pulse, progTint);
  const hasLowHp = progTint > 0.005 || pulse > 0;
  const spread = Math.max(dmg * 15, hasLowHp ? 12 + progTint * 20 : 0);
  const blur = Math.max(40 + dmg * 60, hasLowHp ? 55 + progTint * 40 : 0);
  const vig = document.getElementById('dmgOverlay');
  if (alpha > 0.005) {
    vig.style.boxShadow = `inset 0 0 ${blur}px ${spread}px rgba(180,0,0,${alpha.toFixed(3)})`;
    vig.style.display = 'block';
  } else {
    vig.style.boxShadow = '';
  }
}

// updateLowHealthEffect also drives the progressive tint, so it runs
// every frame we're in gameplay (not just <15% HP like before).
let state_isPlaying = false;
function updateLowHealthEffect(dt, state) {
  state_isPlaying = (state === 'playing');
  if (_player.hp > 0 && _player.hp < _player.maxHp * 0.15 && state_isPlaying) {
    heartbeatPhase += dt * 3;
  } else {
    heartbeatPhase = 0;
  }
  // Always refresh the overlay so progressive tint scales with HP live
  _applyVignetteOverlay();
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
  const w = hitDirCanvas.width;
  const h = hitDirCanvas.height;
  hitDirCtx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;

  // CoD-style directional damage overlay: a big red radial gradient
  // whose centre sits JUST PAST the screen edge in the direction of
  // the attacker. The brightest red hugs the edge closest to the hit
  // and fades across the screen away from it. Stacks additively when
  // multiple attackers are hitting from similar directions.
  //
  // The previous implementation drew a small crescent arc at an
  // interior radius (~38% of the screen) — it looked like a
  // hovering red badge rather than screen-edge damage feedback.
  for (let i = hitIndicators.length - 1; i >= 0; i--) {
    const hi = hitIndicators[i];
    hi.life -= dt * 1.0; // fade over ~1.0s

    if (hi.life <= 0) {
      hitIndicators.splice(i, 1);
      continue;
    }

    // Screen-space angle. 0 = up, PI/2 = right, PI = down, -PI/2 = left.
    //
    // hi.angle comes from atan2(dx, dz) - yaw in triggerHitIndicator.
    // With Three.js's default camera-looks-down-minus-Z convention, a
    // zombie directly IN FRONT of the player produces atan2(0, -1) = PI
    // and a zombie to their RIGHT produces +PI/2 — which means the raw
    // world angle is rotated 180° from what the screen wants AND the
    // horizontal is inverted relative to screen space. The conversion
    // `PI - hi.angle` folds both of those in: front→0 (up),
    // right→PI/2 (right), left→-PI/2 (left), behind→PI (down).
    const screenAng = Math.PI - hi.angle;
    const ex = Math.sin(screenAng);
    const ey = -Math.cos(screenAng);

    // Position the gradient center offscreen in the hit direction —
    // just past the far edge so the red peak lands ON the screen edge
    // the player is being hit from.
    const edgeDist = Math.max(w, h) * 0.55;
    const gx = cx + ex * edgeDist;
    const gy = cy + ey * edgeDist;

    // Quick fade in, slow fade out for a punchy-but-not-spammy feel.
    const fadeIn = Math.min(1, (1 - hi.life) * 6);
    const fadeOut = Math.min(1, hi.life * 2.2);
    const alpha = fadeIn * fadeOut * hi.intensity * 0.75;
    if (alpha < 0.01) continue;

    const radius = Math.max(w, h) * 0.95;
    const grad = hitDirCtx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    grad.addColorStop(0,    `rgba(200,  20,  10, ${alpha})`);
    grad.addColorStop(0.25, `rgba(170,   0,   0, ${alpha * 0.75})`);
    grad.addColorStop(0.55, `rgba(110,   0,   0, ${alpha * 0.3})`);
    grad.addColorStop(1,    `rgba(0,     0,   0, 0)`);

    hitDirCtx.fillStyle = grad;
    hitDirCtx.fillRect(0, 0, w, h);

    // Decay intensity so a flurry of hits from the same direction
    // doesn't saturate into a solid red wall.
    hi.intensity = Math.max(0.5, hi.intensity - dt * 0.3);
  }
}

function clearHitIndicators() {
  hitIndicators.length = 0;
  hitDirCtx.clearRect(0, 0, hitDirCanvas.width, hitDirCanvas.height);
}

// ===== PARTICLES =====
// Pooled InstancedMesh approach: one InstancedMesh per color family (blood/dirt/energy)
// collapses hundreds of short-lived spheres into 3 draw calls with zero per-spawn
// allocation. Fade is via per-instance scale — InstancedMesh shares one material,
// so opacity can't vary per instance without a custom shader.
const MAX_PARTICLES = 220;
const POOL_CAP = 220;
const particles = [];
const _particleGeo = new THREE.SphereGeometry(0.05, 4, 4);
const _bloodMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
// Dirt mat is white; per-instance color (setColorAt) tints each slot to a shade.
const _dirtMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const _energyMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
const _dirtColors = [0x5a3a1a, 0x6b4423, 0x4a2f12, 0x7a5533, 0x3d2b10]
  .map(c => new THREE.Color(c));

const _tmpMat4 = new THREE.Matrix4();
const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
const _tmpColor = new THREE.Color();
let _pools = null;

function _ensurePools() {
  if (_pools) return _pools;
  const make = (mat) => {
    const im = new THREE.InstancedMesh(_particleGeo, mat, POOL_CAP);
    im.count = POOL_CAP;
    im.frustumCulled = false;
    for (let i = 0; i < POOL_CAP; i++) im.setMatrixAt(i, _zeroMat);
    im.instanceMatrix.needsUpdate = true;
    _scene.add(im);
    const free = new Array(POOL_CAP);
    for (let i = 0; i < POOL_CAP; i++) free[i] = POOL_CAP - 1 - i;
    return { im, free, dirty: false };
  };
  _pools = { blood: make(_bloodMat), dirt: make(_dirtMat), energy: make(_energyMat) };
  return _pools;
}

function _acquire(poolKey) {
  const pool = _ensurePools()[poolKey];
  if (pool.free.length === 0) return null;
  return { pool, slot: pool.free.pop() };
}

function _release(pool, slot) {
  pool.im.setMatrixAt(slot, _zeroMat);
  pool.dirty = true;
  pool.free.push(slot);
}

function spawnBloodParticles(x, y, z, count = 5) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = _acquire('blood');
    if (!a) break;
    particles.push({
      pool: a.pool, slot: a.slot,
      x, y, z, size: 1,
      vx: (Math.random()-0.5)*3,
      vy: Math.random()*3 + 1,
      vz: (Math.random()-0.5)*3,
      life: 0.5 + Math.random()*0.5,
    });
  }
}

function spawnDirtParticles(x, z, count = 12) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = _acquire('dirt');
    if (!a) break;
    _tmpColor.copy(_dirtColors[Math.floor(Math.random() * _dirtColors.length)]);
    a.pool.im.setColorAt(a.slot, _tmpColor);
    if (a.pool.im.instanceColor) a.pool.im.instanceColor.needsUpdate = true;
    particles.push({
      pool: a.pool, slot: a.slot,
      x: x + (Math.random()-0.5)*1.2, y: 0.05, z: z + (Math.random()-0.5)*1.2,
      size: 0.6 + Math.random() * 0.8,
      vx: (Math.random()-0.5)*2.5,
      vy: Math.random()*4 + 2,
      vz: (Math.random()-0.5)*2.5,
      life: 0.8 + Math.random()*0.6,
    });
  }
}

function spawnEnergyParticles(x, y, z, count = 8) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = _acquire('energy');
    if (!a) break;
    particles.push({
      pool: a.pool, slot: a.slot,
      x, y, z, size: 1.5,
      vx: (Math.random()-0.5)*5,
      vy: Math.random()*4 + 2,
      vz: (Math.random()-0.5)*5,
      life: 0.7 + Math.random()*0.5,
    });
  }
}

function updateParticles(dt) {
  if (_pools) {
    _pools.blood.dirty = false;
    _pools.dirt.dirty = false;
    _pools.energy.dirty = false;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      _release(p.pool, p.slot);
      particles.splice(i, 1);
      continue;
    }
    p.vy -= 9.8 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    // Scale-fade: last ~0.33s shrinks to zero (stands in for per-instance opacity).
    const s = p.size * Math.min(1, p.life * 3);
    _tmpMat4.makeScale(s, s, s);
    _tmpMat4.setPosition(p.x, p.y, p.z);
    p.pool.im.setMatrixAt(p.slot, _tmpMat4);
    p.pool.dirty = true;
  }

  if (_pools) {
    if (_pools.blood.dirty) _pools.blood.im.instanceMatrix.needsUpdate = true;
    if (_pools.dirt.dirty) _pools.dirt.im.instanceMatrix.needsUpdate = true;
    if (_pools.energy.dirty) _pools.energy.im.instanceMatrix.needsUpdate = true;
  }
}

function clearParticles() {
  if (_pools) {
    for (const key of ['blood', 'dirt', 'energy']) {
      const pool = _pools[key];
      for (let i = 0; i < POOL_CAP; i++) pool.im.setMatrixAt(i, _zeroMat);
      pool.im.instanceMatrix.needsUpdate = true;
      pool.free.length = 0;
      for (let i = POOL_CAP - 1; i >= 0; i--) pool.free.push(i);
    }
  }
  particles.length = 0;
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
  updateParticles, particles, clearParticles,
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
