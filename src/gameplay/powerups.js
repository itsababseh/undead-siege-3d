// ===== POWER-UP DROPS =====
// Extracted from main.js — Phase 4 modularization
import * as THREE from 'three';
import { beep } from '../audio/index.js';
import { addFloatText, triggerScreenShake, startZombieDeathAnim, spawnBloodParticles } from '../effects/index.js';
import { removeZombieMesh } from '../entities/zombies.js';

let _scene, _camera, _weapons, _player, _getPoints, _setPoints,
    _getRound, _getZToSpawn, _getZSpawned, _getZombies, _getTotalKills, _setTotalKills;

export function setPowerUpDeps(scene, camera, weapons, player, gameAccessors) {
  _scene = scene;
  _camera = camera;
  _weapons = weapons;
  _player = player;
  _getPoints = gameAccessors.getPoints;
  _setPoints = gameAccessors.setPoints;
  _getRound = gameAccessors.getRound;
  _getZToSpawn = gameAccessors.getZToSpawn;
  _getZSpawned = gameAccessors.getZSpawned;
  _getZombies = gameAccessors.getZombies;
  _getTotalKills = gameAccessors.getTotalKills;
  _setTotalKills = gameAccessors.setTotalKills;
  initPowerUpLightPool();
}

// ===== POWERUP LIGHT POOL =====
// Shared pool of PointLights for powerup drops. Adding/removing lights
// changes Three.js's shader cache key and forces a synchronous recompile —
// that's the random lag spike when a zombie drops an item. Keeping the
// light count constant avoids it.
const POWERUP_LIGHT_POOL_SIZE = 4;
const powerUpLightPool = [];
let powerUpLightPoolInited = false;

function initPowerUpLightPool() {
  if (powerUpLightPoolInited || !_scene) return;
  for (let i = 0; i < POWERUP_LIGHT_POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 8);
    light.position.set(0, -1000, 0);
    _scene.add(light);
    powerUpLightPool.push({ light, inUse: false });
  }
  powerUpLightPoolInited = true;
}

function acquirePowerUpLight() {
  for (const slot of powerUpLightPool) {
    if (!slot.inUse) { slot.inUse = true; return slot; }
  }
  return null; // pool exhausted — powerup just won't glow
}

function releasePowerUpLight(slot) {
  if (!slot) return;
  slot.inUse = false;
  slot.light.intensity = 0;
  slot.light.position.set(0, -1000, 0);
}

export const powerUps = [];

export const POWERUP_TYPES = [
  { id: 'instakill', name: 'INSTA-KILL', color: '#ff4444', duration: 30, icon: '💀',
    apply() { _player._instaKill = true; _player._instaKillTimer = 15; },
    remove() { _player._instaKill = false; } },
  { id: 'maxammo', name: 'MAX AMMO', color: '#44ff44', duration: 0, icon: '🔫',
    apply() { for (let i = 0; i < _weapons.length; i++) { if (_player.owned[i]) _player.ammo[i] = _weapons[i].maxAmmo; } _player.mag = _weapons[_player.curWeapon].mag; },
    remove() {} },
  { id: 'doublepoints', name: 'DOUBLE POINTS', color: '#ffff44', duration: 30, icon: '💰',
    apply() { _player._doublePoints = true; _player._doublePointsTimer = 15; },
    remove() { _player._doublePoints = false; } },
  { id: 'nuke', name: 'NUKE', color: '#ff8800', duration: 0, icon: '☢️',
    apply() { 
      const zombies = _getZombies();
      const pts = zombies.length * 400;
      let totalKills = _getTotalKills();
      for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        totalKills++;
        startZombieDeathAnim(z);
        spawnBloodParticles(z.wx, 1, z.wz, 3);
        removeZombieMesh(z);
      }
      zombies.length = 0;
      _setTotalKills(totalKills);
      _setPoints(_getPoints() + pts);
      triggerScreenShake(3, 4);
      addFloatText(`+${pts}`, '#ff8', 2);
      const flash = document.getElementById('roundFlash');
      flash.style.display = 'block';
      flash.style.opacity = 0.5;
      flash.style.background = 'rgba(255,200,100,0.4)';
      setTimeout(() => { flash.style.opacity = 0; setTimeout(() => { flash.style.display = 'none'; flash.style.background = 'rgba(255,255,255,0.3)'; }, 500); }, 200);
    },
    remove() {} },
];

export let roundPowerUpsDropped = 0;
let _lastPowerUpIdx = -1;
// Pity counter — number of kills since the last drop. Guarantees a
// drop every N kills so a player can't go a whole round without seeing
// one. Resets on every successful drop and on round reset.
let _killsSinceDrop = 0;

export function resetRoundPowerUps() {
  roundPowerUpsDropped = 0;
  // Don't reset _killsSinceDrop — it carries across rounds so a dry
  // run-start won't feel barren.
}

export function spawnPowerUp(wx, wz) {
  const round = _getRound();
  // Base drop chance scales with round. Slightly more generous than
  // before (floor at 10%, ceiling at 30%) so round 1 doesn't feel
  // completely dry.
  const dropChance = Math.min(0.10 + (round - 1) * 0.02, 0.30);

  _killsSinceDrop++;

  // Minimum drops per round. Scales with round.
  const minDrops = round >= 5 ? 3 : round >= 2 ? 2 : 1;
  const zombies = _getZombies();
  const zToSpawn = _getZToSpawn();
  const zSpawned = _getZSpawned();
  const zombiesRemaining = zToSpawn - zSpawned + zombies.length;

  // End-of-round catchup: if we're close to done and haven't hit the
  // minimum yet, force-drop. Triggers earlier now (30% remaining vs 15%)
  // so drops don't all stack on the last zombie.
  const needCatchup = roundPowerUpsDropped < minDrops
    && zombiesRemaining <= Math.max(4, Math.floor(zToSpawn * 0.30));

  // Pity guarantee: after 18 kills with no drop, force one. Keeps the
  // "where are the drops?" feeling at bay across long mid-round streaks.
  const pityTrigger = _killsSinceDrop >= 18;

  if (!needCatchup && !pityTrigger && Math.random() > dropChance) return;
  
  let typeIdx;
  const available = [];
  // Build weighted pool. Nukes are excluded in rounds 1-2 (too powerful
  // when the zombie count is tiny — feels unfair and trivialises those rounds).
  // From round 3 onward nuke weight scales up with round so they're
  // genuinely exciting mid-game without being a guaranteed cleanup tool early.
  const weights = [];
  for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
    if (ti === _lastPowerUpIdx) continue;
    const pid = POWERUP_TYPES[ti].id;
    if (pid === 'instakill' && _player._instaKill) continue;
    if (pid === 'doublepoints' && _player._doublePoints) continue;
    // Nukes: locked out rounds 1-2; weight 0.5 round 3-4, scales to 1.0 by round 6+
    if (pid === 'nuke') {
      if (round < 3) continue;
      const nukeWeight = Math.min(1.0, 0.3 + (round - 3) * 0.175);
      weights.push({ ti, w: nukeWeight });
    } else {
      weights.push({ ti, w: 1.0 });
    }
    available.push(ti);
  }
  if (available.length === 0) {
    for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
      if (ti !== _lastPowerUpIdx) available.push(ti);
    }
    weights.length = 0;
    for (const ti of available) weights.push({ ti, w: 1.0 });
  }
  if (available.length === 0) { available.push(0); weights.push({ ti: 0, w: 1.0 }); }
  // Weighted random selection
  const totalW = weights.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * totalW;
  typeIdx = weights[weights.length - 1].ti;
  for (const entry of weights) {
    roll -= entry.w;
    if (roll <= 0) { typeIdx = entry.ti; break; }
  }
  _lastPowerUpIdx = typeIdx;
  const type = POWERUP_TYPES[typeIdx];
  
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({ 
    color: new THREE.Color(type.color), 
    emissive: new THREE.Color(type.color), emissiveIntensity: 0.5,
    transparent: true, opacity: 0.85
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(wx, 0.8, wz);
  _scene.add(mesh);
  
  const lightSlot = acquirePowerUpLight();
  if (lightSlot) {
    lightSlot.light.color.setHex(new THREE.Color(type.color).getHex());
    lightSlot.light.intensity = 2;
    lightSlot.light.position.set(wx, 1.2, wz);
  }

  const pu = { typeIdx, wx, wz, mesh, lightSlot, life: 20, bobPhase: Math.random() * Math.PI * 2 };
  powerUps.push(pu);
  roundPowerUpsDropped++;
  _killsSinceDrop = 0; // Reset pity counter on successful drop
}

export function updatePowerUps(dt) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.life -= dt;
    pu.bobPhase += dt * 3;
    
    pu.mesh.position.y = 0.8 + Math.sin(pu.bobPhase) * 0.15;
    pu.mesh.rotation.y += dt * 2;
    pu.mesh.rotation.x = Math.sin(pu.bobPhase * 0.7) * 0.2;
    
    if (pu.lightSlot) {
      pu.lightSlot.light.position.y = pu.mesh.position.y + 0.4;
      pu.lightSlot.light.intensity = 1.5 + Math.sin(pu.bobPhase * 2) * 0.5;
    }

    if (pu.life < 5) {
      pu.mesh.material.opacity = 0.4 + Math.sin(pu.life * 6) * 0.4;
    }

    const d = Math.hypot(pu.wx - _camera.position.x, pu.wz - _camera.position.z);
    if (d < 2) {
      const type = POWERUP_TYPES[pu.typeIdx];
      type.apply();
      addFloatText(`${type.icon} ${type.name}!`, type.color, 3);
      beep(600, 'sine', 0.1, 0.12);
      setTimeout(() => beep(900, 'sine', 0.15, 0.12), 100);
      triggerScreenShake(0.3, 10);

      _scene.remove(pu.mesh);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
      releasePowerUpLight(pu.lightSlot);
      powerUps.splice(i, 1);
      continue;
    }

    if (pu.life <= 0) {
      _scene.remove(pu.mesh);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
      releasePowerUpLight(pu.lightSlot);
      powerUps.splice(i, 1);
    }
  }
  
  if (_player._instaKill && _player._instaKillTimer > 0) {
    _player._instaKillTimer -= dt;
    if (_player._instaKillTimer <= 0) { _player._instaKill = false; addFloatText('Insta-Kill ended', '#888', 1.5); }
  }
  if (_player._doublePoints && _player._doublePointsTimer > 0) {
    _player._doublePointsTimer -= dt;
    if (_player._doublePointsTimer <= 0) { _player._doublePoints = false; addFloatText('Double Points ended', '#888', 1.5); }
  }
}

export function cleanupPowerUps() {
  powerUps.forEach(pu => {
    _scene.remove(pu.mesh);
    if (pu.mesh.material) pu.mesh.material.dispose();
    if (pu.mesh.geometry) pu.mesh.geometry.dispose();
    releasePowerUpLight(pu.lightSlot);
  });
  powerUps.length = 0;
  _player._instaKill = false; _player._instaKillTimer = 0;
  _player._doublePoints = false; _player._doublePointsTimer = 0;
}
