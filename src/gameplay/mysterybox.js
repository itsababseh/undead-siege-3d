// ===== MYSTERY BOX SYSTEM =====
// Extracted from main.js — Phase 4 modularization
import * as THREE from 'three';
import { beep, sfxBuyWeapon } from '../audio/index.js';
import { addFloatText } from '../effects/index.js';

let _scene, _camera, _TILE, _weapons, _player, _weaponMags, _getPoints, _setPoints, _switchWeapon, _mapAt;

export function setMysteryBoxDeps(scene, camera, TILE, weapons, player, weaponMags, pointsAccessor, switchWeapon, mapAt) {
  _scene = scene;
  _camera = camera;
  _TILE = TILE;
  _weapons = weapons;
  _player = player;
  _weaponMags = weaponMags;
  _getPoints = pointsAccessor.get;
  _setPoints = pointsAccessor.set;
  _switchWeapon = switchWeapon;
  // Optional — used by the octopus teleport to pick a walkable tile.
  // If not supplied, teleport falls through to current position.
  _mapAt = typeof mapAt === 'function' ? mapAt : (() => 0);
}

export const mysteryBox = {
  tx: 14, tz: 14,
  cost: 950,
  isOpen: false,
  isSpinning: false,
  spinTimer: 0,
  spinDuration: 3.0,
  currentSpinIdx: 0,
  resultWeaponIdx: -1,
  collectTimer: 0,
  collectDuration: 8,
  // Octopus jump-scare state (AutoGPT homage — CoD's teddy bear)
  rolledOctopus: false,
  octopusPhase: 'none',  // 'none' | 'rising' | 'lunging' | 'flash' | 'teleport' | 'done'
  octopusTimer: 0,
  useCount: 0,           // don't roll octopus on first-ever use this run
};

// Chance the box refuses this roll and yeets itself to a new tile
const MYSTERY_BOX_OCTOPUS_CHANCE = 0.08;
// Octopus animation phase durations (seconds)
const OCTO_RISE_DUR = 0.9;
const OCTO_LUNGE_DUR = 0.4;
const OCTO_FLASH_DUR = 0.12;
const OCTO_TELEPORT_DUR = 0.6;

export const mysteryBoxMeshes = {};

// Timestamp of a "premature" E press. If the spin finishes within this
// window we auto-collect instead of making the user press E again.
let _pendingCollectAt = 0;

export function buildMysteryBox() {
  if (mysteryBoxMeshes.body) {
    _scene.remove(mysteryBoxMeshes.body);
    _scene.remove(mysteryBoxMeshes.lid);
    _scene.remove(mysteryBoxMeshes.glow);
    _scene.remove(mysteryBoxMeshes.light);
    if (mysteryBoxMeshes.trim) _scene.remove(mysteryBoxMeshes.trim);
    if (mysteryBoxMeshes.weaponDisplay) _scene.remove(mysteryBoxMeshes.weaponDisplay);
  }
  
  const bx = mysteryBox.tx * _TILE + _TILE / 2;
  const bz = mysteryBox.tz * _TILE + _TILE / 2;
  
  const bodyGeo = new THREE.BoxGeometry(1.6, 0.9, 1.0);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x442200, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(bx, 0.45, bz);
  body.castShadow = true;
  _scene.add(body);
  
  const trimGeo = new THREE.BoxGeometry(1.65, 0.05, 1.05);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xddaa00, roughness: 0.3, metalness: 0.8, emissive: 0xddaa00, emissiveIntensity: 0.15 });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.position.set(bx, 0.9, bz);
  _scene.add(trim);
  
  const lidGeo = new THREE.BoxGeometry(1.6, 0.15, 1.0);
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x442200, roughness: 0.6, metalness: 0.3 });
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.set(bx, 0.97, bz);
  _scene.add(lid);
  
  const glowGeo = new THREE.CylinderGeometry(0.3, 0.6, 3, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(bx, 2.5, bz);
  _scene.add(glow);
  
  const light = new THREE.PointLight(0x4488ff, 0, 12);
  light.position.set(bx, 2, bz);
  _scene.add(light);
  
  mysteryBoxMeshes.body = body;
  mysteryBoxMeshes.lid = lid;
  mysteryBoxMeshes.trim = trim;
  mysteryBoxMeshes.glow = glow;
  mysteryBoxMeshes.light = light;
  mysteryBoxMeshes.weaponDisplay = null;
}

// ===== OCTOPUS (AutoGPT homage) =====
// Procedural purple-glowing octopus mesh built from a sphere head and
// 6 tentacles (curved cylinders). Used as the "this gamble didn't pay
// off" response on a mystery box roll — the mechanical cousin of CoD
// Zombies' teddy bear. It rises, lunges at the camera, screams, then
// the box teleports to a new location on the map.
function _buildOctopus(bx, bz) {
  const group = new THREE.Group();
  group.position.set(bx, 1.0, bz);
  // Shared materials — emissive purple/blue gradient
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6a33ff, emissive: 0x3a1aff, emissiveIntensity: 1.6,
    roughness: 0.45, metalness: 0.2, transparent: true, opacity: 0.95
  });
  const tentMat = new THREE.MeshStandardMaterial({
    color: 0x8858ff, emissive: 0x5533cc, emissiveIntensity: 1.2,
    roughness: 0.55, metalness: 0.15, transparent: true, opacity: 0.9
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupMat = new THREE.MeshBasicMaterial({ color: 0x000011 });
  // Head (rounded dome)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat);
  head.scale.set(1.0, 1.1, 1.0);
  group.add(head);
  // Eyes — two wide white spheres with dark pupils, glancing forward
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeMat);
  eyeL.position.set(-0.15, 0.08, 0.34);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeMat);
  eyeR.position.set(0.15, 0.08, 0.34);
  group.add(eyeR);
  const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pupMat);
  pupL.position.set(-0.15, 0.05, 0.42);
  group.add(pupL);
  const pupR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pupMat);
  pupR.position.set(0.15, 0.05, 0.42);
  group.add(pupR);
  // 6 tentacles — curved tubes radiating down-and-out
  const tentacles = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(Math.cos(angle) * 0.25, -0.35, Math.sin(angle) * 0.25),
      new THREE.Vector3(Math.cos(angle) * 0.45, -0.55, Math.sin(angle) * 0.45),
      new THREE.Vector3(Math.cos(angle) * 0.35, -0.75, Math.sin(angle) * 0.35),
    ]);
    const tentGeo = new THREE.TubeGeometry(curve, 10, 0.07, 6, false);
    const tent = new THREE.Mesh(tentGeo, tentMat);
    group.add(tent);
    tentacles.push(tent);
  }
  // Pulsing purple point light attached so the world glows when it appears
  const glowLight = new THREE.PointLight(0xaa66ff, 2.5, 10);
  glowLight.position.set(0, 0, 0);
  group.add(glowLight);
  _scene.add(group);
  return { group, bodyMat, tentMat, glowLight };
}

// Generate a terrifying scream via Web Audio — high wail + distortion noise.
// Uses beep() repeatedly to build up a layered screech effect.
function _playOctopusScream() {
  // Layered wail: descending siren + noise burst
  beep(880, 'sawtooth', 0.55, 0.22);
  setTimeout(() => beep(1320, 'square', 0.45, 0.18), 40);
  setTimeout(() => beep(620, 'sawtooth', 0.45, 0.20), 180);
  setTimeout(() => beep(180, 'sawtooth', 0.25, 0.18), 350);
}

// Flash the full-screen roundFlash element white (repurposed as lightning)
function _lightningFlash() {
  const flash = document.getElementById('roundFlash');
  if (!flash) return;
  flash.style.background = 'rgba(230, 220, 255, 0.92)';
  flash.style.display = 'block';
  flash.style.opacity = '1';
  setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => {
      flash.style.display = 'none';
      flash.style.background = 'rgba(255,255,255,0.3)';
    }, 150);
  }, 80);
}

// Pick a random walkable tile that's far enough from both the current
// box location AND the player. Respects sealed zones via _mapAt so we
// never teleport behind a closed door. Falls back to current position
// if no suitable tile found (should be rare on a 24x24 map).
function _pickTeleportTile() {
  // Prefer tiles 10+ away in Manhattan distance
  const attempts = 80;
  const px = _camera.position.x, pz = _camera.position.z;
  const curBx = mysteryBox.tx * _TILE + _TILE / 2;
  const curBz = mysteryBox.tz * _TILE + _TILE / 2;
  // Sealed-zone gate: if a tile is inside the west wing or east chamber
  // and the door isn't opened, reject. We don't have direct door state
  // access here (that's in state.js / main.js), so use a permissive
  // rectangle check — don't teleport into those wings at all, period.
  // Players keep the box in the main arena.
  const inSealedZone = (tx, tz) =>
    (tx >= 1 && tx <= 8 && tz >= 1 && tz <= 8) ||      // west wing
    (tx >= 20 && tx <= 22 && tz >= 11 && tz <= 18);    // east chamber
  for (let i = 0; i < attempts; i++) {
    // Map is 24x24 with outer wall at 0 and 23
    const tx = 2 + Math.floor(Math.random() * 20);
    const tz = 2 + Math.floor(Math.random() * 20);
    if (inSealedZone(tx, tz)) continue;
    const wx = tx * _TILE + _TILE / 2;
    const wz = tz * _TILE + _TILE / 2;
    // Must be on an open tile
    if (_mapAt(wx, wz) !== 0) continue;
    // Min distance from current box + player (10 tiles Manhattan)
    const dBox = Math.abs(wx - curBx) + Math.abs(wz - curBz);
    const dPlr = Math.abs(wx - px) + Math.abs(wz - pz);
    if (dBox < _TILE * 8) continue;
    if (dPlr < _TILE * 6) continue;
    return { tx, tz };
  }
  // Fallback: don't teleport, just return current position
  return { tx: mysteryBox.tx, tz: mysteryBox.tz };
}

function _teleportMysteryBoxTo(tx, tz) {
  mysteryBox.tx = tx;
  mysteryBox.tz = tz;
  buildMysteryBox(); // rebuild meshes at new position
}

function _cleanupOctopus() {
  if (mysteryBoxMeshes.octopus) {
    _scene.remove(mysteryBoxMeshes.octopus.group);
    try {
      mysteryBoxMeshes.octopus.group.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    } catch (e) {}
    mysteryBoxMeshes.octopus = null;
  }
}

export function tryMysteryBox() {
  if (mysteryBox.isSpinning || mysteryBox.collectTimer > 0) return false;
  const bx = mysteryBox.tx * _TILE + _TILE / 2;
  const bz = mysteryBox.tz * _TILE + _TILE / 2;
  const d = Math.hypot(bx - _camera.position.x, bz - _camera.position.z);
  if (d > _TILE * 2.5) return false;
  
  const points = _getPoints();
  if (points < mysteryBox.cost) {
    addFloatText(`Need $${mysteryBox.cost} for Mystery Box`, '#f88');
    return true;
  }
  
  _setPoints(points - mysteryBox.cost);
  mysteryBox.isSpinning = true;
  mysteryBox.spinTimer = 0;
  mysteryBox.useCount++;
  // Octopus roll — 8% chance to refuse the gamble and yeet the box
  // elsewhere. Skipped on the player's very first box use to avoid
  // rage-quits on round 2.
  mysteryBox.rolledOctopus = mysteryBox.useCount > 1 && Math.random() < MYSTERY_BOX_OCTOPUS_CHANCE;
  if (mysteryBox.rolledOctopus) {
    mysteryBox.resultWeaponIdx = -1;
  } else {
    const roll = Math.random();
    if (roll < 0.1) mysteryBox.resultWeaponIdx = 3;
    else if (roll < 0.4) mysteryBox.resultWeaponIdx = 2;
    else if (roll < 0.7) mysteryBox.resultWeaponIdx = 1;
    else mysteryBox.resultWeaponIdx = 0;
  }

  beep(600, 'sine', 0.15, 0.1);
  addFloatText('🎰 Mystery Box...', '#48f', 2);
  return true;
}

export function collectMysteryBoxWeapon() {
  if (mysteryBox.collectTimer <= 0 || mysteryBox.resultWeaponIdx < 0) {
    // Buffer the press: if a weapon becomes available within the next
    // ~0.6s (e.g. the user mashed E right before the spin finished),
    // auto-collect then. Fixes the classic "first time using the box
    // nothing happens" glitch.
    _pendingCollectAt = performance.now() + 600;
    return false;
  }
  const bx = mysteryBox.tx * _TILE + _TILE / 2;
  const bz = mysteryBox.tz * _TILE + _TILE / 2;
  const d = Math.hypot(bx - _camera.position.x, bz - _camera.position.z);
  // 3-tile radius — a hair more forgiving than the 2.5-tile tryMysteryBox
  // range so standing right at the edge still collects.
  if (d > _TILE * 3.0) return false;
  
  const wi = mysteryBox.resultWeaponIdx;
  // "Same gun re-roll" — if the box gives you back the weapon you're
  // currently holding, treat it as a free max-ammo refill instead of
  // a swap. Matches player expectation (it's effectively a Max Ammo
  // drop for that weapon).
  const sameAsCurrent = (wi === _player.curWeapon);
  // Perform the switch inline. We DON'T call shooting.js's switchWeapon
  // because that has guard clauses (state check, early returns) that
  // can silently reject the switch — the user then "collects" the gun
  // but nothing changes. Doing it here guarantees the swap lands.
  if (!sameAsCurrent) {
    _weaponMags[_player.curWeapon] = _player.mag;
    _player.curWeapon = wi;
  }
  _player.owned[wi] = true;
  _player.ammo[wi] = _weapons[wi].maxAmmo;
  _player.mag = _weapons[wi].mag;
  _weaponMags[wi] = _weapons[wi].mag;
  _player.reloading = false;
  _player.reloadTimer = 0;
  _player.fireTimer = 0;

  sfxBuyWeapon(_weapons[wi].isRayGun);
  const wName = _weapons[wi].name;
  if (sameAsCurrent) {
    addFloatText(`${wName} — AMMO REFILL`, '#44ff44', 2);
  } else {
    addFloatText(_weapons[wi].isRayGun ? `⚡ ${wName} ⚡` : `${wName}!`, _weapons[wi].color, 2);
  }
  
  mysteryBox.collectTimer = 0;
  mysteryBox.resultWeaponIdx = -1;
  if (mysteryBoxMeshes.weaponDisplay) {
    _scene.remove(mysteryBoxMeshes.weaponDisplay);
    mysteryBoxMeshes.weaponDisplay = null;
  }
  return true;
}

export function updateMysteryBox(dt) {
  const bx = mysteryBox.tx * _TILE + _TILE / 2;
  const bz = mysteryBox.tz * _TILE + _TILE / 2;
  
  if (mysteryBox.isSpinning) {
    mysteryBox.spinTimer += dt;
    const t = mysteryBox.spinTimer / mysteryBox.spinDuration;
    
    if (mysteryBoxMeshes.lid) {
      mysteryBoxMeshes.lid.rotation.x = Math.min(t * 3, 1) * -0.8;
      mysteryBoxMeshes.lid.position.y = 0.97 + Math.min(t * 3, 1) * 0.3;
    }
    
    mysteryBoxMeshes.glow.material.opacity = 0.15 + Math.sin(t * 20) * 0.1;
    mysteryBoxMeshes.light.intensity = 1.5 + Math.sin(t * 15) * 0.5;
    
    const spinRate = Math.max(0.05, 0.3 - t * 0.25);
    if (mysteryBox.spinTimer % spinRate < dt) {
      mysteryBox.currentSpinIdx = (mysteryBox.currentSpinIdx + 1) % _weapons.length;
    }
    
    if (Math.floor(mysteryBox.spinTimer * 8) !== Math.floor((mysteryBox.spinTimer - dt) * 8)) {
      beep(800 + Math.random() * 400, 'square', 0.02, 0.04);
    }
    
    if (t >= 1) {
      mysteryBox.isSpinning = false;

      // Octopus path — no weapon, trigger jump-scare + teleport
      if (mysteryBox.rolledOctopus) {
        mysteryBox.octopusPhase = 'rising';
        mysteryBox.octopusTimer = 0;
        mysteryBoxMeshes.octopus = _buildOctopus(bx, bz);
        // Slam the lid open violently and kill the normal glow
        if (mysteryBoxMeshes.lid) {
          mysteryBoxMeshes.lid.rotation.x = -1.2;
          mysteryBoxMeshes.lid.position.y = 1.35;
        }
        mysteryBoxMeshes.glow.material.opacity = 0;
        mysteryBoxMeshes.light.color.setHex(0xaa55ff);
        mysteryBoxMeshes.light.intensity = 3;
        addFloatText('😱 THE BOX REFUSES!', '#c88aff', 3);
        return; // Fall through into the non-spinning branches next frame
      }

      mysteryBox.collectTimer = mysteryBox.collectDuration;

      const indicatorGeo = new THREE.BoxGeometry(0.8, 0.3, 0.15);
      const w = _weapons[mysteryBox.resultWeaponIdx];
      const indicatorMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(w.color), transparent: true, opacity: 0.8
      });
      const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
      indicator.position.set(bx, 2, bz);
      _scene.add(indicator);
      mysteryBoxMeshes.weaponDisplay = indicator;

      if (_weapons[mysteryBox.resultWeaponIdx].isRayGun) {
        beep(800, 'sine', 0.15, 0.12);
        setTimeout(() => beep(1200, 'sine', 0.15, 0.12), 100);
        setTimeout(() => beep(1600, 'sine', 0.2, 0.1), 200);
      } else {
        beep(500, 'sine', 0.1, 0.1);
        setTimeout(() => beep(700, 'sine', 0.15, 0.1), 120);
      }

      addFloatText(`${w.name}! [E] to grab`, w.color, 5);

      // If the player pressed E while the spin was still running
      // (premature press), auto-collect now — exactly as if they had
      // tapped E the instant the weapon appeared.
      if (performance.now() < _pendingCollectAt) {
        _pendingCollectAt = 0;
        collectMysteryBoxWeapon();
      }
    }
  } else if (mysteryBox.rolledOctopus && mysteryBox.octopusPhase !== 'none') {
    // ========================================================
    // OCTOPUS JUMP-SCARE ANIMATION + TELEPORT
    // ========================================================
    mysteryBox.octopusTimer += dt;
    const oc = mysteryBoxMeshes.octopus;
    if (oc) {
      if (mysteryBox.octopusPhase === 'rising') {
        // Scale up from 0 to 1, rise from y=0.5 to y=1.3, wobble
        const p = Math.min(1, mysteryBox.octopusTimer / OCTO_RISE_DUR);
        const eased = p * p * (3 - 2 * p);
        const s = 0.2 + eased * 0.9;
        oc.group.scale.set(s, s, s);
        oc.group.position.y = 0.55 + eased * 0.9;
        oc.group.rotation.y += dt * 3;
        oc.glowLight.intensity = 1.5 + Math.sin(mysteryBox.octopusTimer * 15) * 1.5;
        if (mysteryBox.octopusTimer >= OCTO_RISE_DUR) {
          mysteryBox.octopusPhase = 'lunging';
          mysteryBox.octopusTimer = 0;
          _playOctopusScream();
        }
      } else if (mysteryBox.octopusPhase === 'lunging') {
        // Lunge toward camera — scale up dramatically and move partway there
        const p = Math.min(1, mysteryBox.octopusTimer / OCTO_LUNGE_DUR);
        const eased = p * p;
        const s = 1.1 + eased * 2.0;
        oc.group.scale.set(s, s, s);
        // Interpolate position toward the camera
        const targetX = _camera.position.x;
        const targetY = _camera.position.y;
        const targetZ = _camera.position.z;
        oc.group.position.x = bx + (targetX - bx) * eased * 0.85;
        oc.group.position.y = 1.45 + (targetY - 1.45) * eased * 0.85;
        oc.group.position.z = bz + (targetZ - bz) * eased * 0.85;
        oc.group.rotation.y += dt * 6;
        if (mysteryBox.octopusTimer >= OCTO_LUNGE_DUR) {
          mysteryBox.octopusPhase = 'flash';
          mysteryBox.octopusTimer = 0;
          _lightningFlash();
        }
      } else if (mysteryBox.octopusPhase === 'flash') {
        // Short white-out while we pick a teleport tile and rebuild
        if (mysteryBox.octopusTimer >= OCTO_FLASH_DUR) {
          mysteryBox.octopusPhase = 'teleport';
          mysteryBox.octopusTimer = 0;
          _cleanupOctopus();
          const dest = _pickTeleportTile();
          _teleportMysteryBoxTo(dest.tx, dest.tz);
          addFloatText('📦 The box moved!', '#fc6', 3);
        }
      } else if (mysteryBox.octopusPhase === 'teleport') {
        // Post-teleport settle — brief purple glow pulse on new box
        if (mysteryBoxMeshes.light) {
          mysteryBoxMeshes.light.intensity = 2 + Math.sin(mysteryBox.octopusTimer * 12) * 1.5;
          mysteryBoxMeshes.light.color.setHex(0xaa55ff);
        }
        if (mysteryBox.octopusTimer >= OCTO_TELEPORT_DUR) {
          mysteryBox.octopusPhase = 'done';
          mysteryBox.rolledOctopus = false;
          mysteryBox.resultWeaponIdx = -1;
          if (mysteryBoxMeshes.light) {
            mysteryBoxMeshes.light.color.setHex(0x4488ff); // back to default blue
          }
        }
      }
    } else {
      // Octopus mesh missing (should be rare) — clean up phase state
      mysteryBox.octopusPhase = 'none';
      mysteryBox.rolledOctopus = false;
    }
  } else if (mysteryBox.collectTimer > 0) {
    mysteryBox.collectTimer -= dt;
    
    if (mysteryBoxMeshes.weaponDisplay) {
      mysteryBoxMeshes.weaponDisplay.position.y = 2 + Math.sin(performance.now() / 500) * 0.2;
      mysteryBoxMeshes.weaponDisplay.rotation.y += dt * 2;
    }
    
    mysteryBoxMeshes.glow.material.opacity = 0.1;
    mysteryBoxMeshes.light.intensity = 1;
    
    if (mysteryBox.collectTimer < 3 && Math.sin(mysteryBox.collectTimer * 8) > 0) {
      mysteryBoxMeshes.light.intensity = 2;
    }
    
    if (mysteryBox.collectTimer <= 0) {
      mysteryBox.resultWeaponIdx = -1;
      if (mysteryBoxMeshes.weaponDisplay) {
        _scene.remove(mysteryBoxMeshes.weaponDisplay);
        mysteryBoxMeshes.weaponDisplay = null;
      }
      if (mysteryBoxMeshes.lid) {
        mysteryBoxMeshes.lid.rotation.x = 0;
        mysteryBoxMeshes.lid.position.y = 0.97;
      }
      mysteryBoxMeshes.glow.material.opacity = 0;
      mysteryBoxMeshes.light.intensity = 0;
      beep(200, 'sine', 0.2, 0.08);
    }
  } else {
    const t = performance.now() / 1000;
    mysteryBoxMeshes.glow.material.opacity = 0;
    mysteryBoxMeshes.light.intensity = 0.3 + Math.sin(t * 1.5) * 0.15;
    if (mysteryBoxMeshes.lid) {
      mysteryBoxMeshes.lid.rotation.x = 0;
      mysteryBoxMeshes.lid.position.y = 0.97;
    }
  }
}

export function resetMysteryBox() {
  mysteryBox.isSpinning = false;
  mysteryBox.spinTimer = 0;
  mysteryBox.collectTimer = 0;
  mysteryBox.resultWeaponIdx = -1;
  mysteryBox.rolledOctopus = false;
  mysteryBox.octopusPhase = 'none';
  mysteryBox.octopusTimer = 0;
  mysteryBox.useCount = 0;
  mysteryBox.tx = 14;
  mysteryBox.tz = 14;
  _pendingCollectAt = 0;
  _cleanupOctopus();
}
