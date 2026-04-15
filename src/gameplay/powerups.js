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

export function resetRoundPowerUps() {
  roundPowerUpsDropped = 0;
}

export function spawnPowerUp(wx, wz) {
  const round = _getRound();
  const dropChance = Math.min(0.08 + (round - 1) * 0.02, 0.28);
  
  const minDrops = round >= 5 ? 2 : round >= 2 ? 1 : 0;
  const zombies = _getZombies();
  const zToSpawn = _getZToSpawn();
  const zSpawned = _getZSpawned();
  const zombiesRemaining = zToSpawn - zSpawned + zombies.length;
  const needGuarantee = roundPowerUpsDropped < minDrops && zombiesRemaining <= Math.max(3, Math.floor(zToSpawn * 0.15));
  
  if (!needGuarantee && Math.random() > dropChance) return;
  
  let typeIdx;
  const available = [];
  for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
    if (ti === _lastPowerUpIdx) continue;
    const pid = POWERUP_TYPES[ti].id;
    if (pid === 'instakill' && _player._instaKill) continue;
    if (pid === 'doublepoints' && _player._doublePoints) continue;
    available.push(ti);
  }
  if (available.length === 0) {
    for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
      if (ti !== _lastPowerUpIdx) available.push(ti);
    }
  }
  if (available.length === 0) available.push(0);
  typeIdx = available[Math.floor(Math.random() * available.length)];
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
  
  const light = new THREE.PointLight(new THREE.Color(type.color).getHex(), 2, 8);
  light.position.set(wx, 1.2, wz);
  _scene.add(light);
  
  const pu = { typeIdx, wx, wz, mesh, light, life: 20, bobPhase: Math.random() * Math.PI * 2 };
  powerUps.push(pu);
  roundPowerUpsDropped++;
}

export function updatePowerUps(dt) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.life -= dt;
    pu.bobPhase += dt * 3;
    
    pu.mesh.position.y = 0.8 + Math.sin(pu.bobPhase) * 0.15;
    pu.mesh.rotation.y += dt * 2;
    pu.mesh.rotation.x = Math.sin(pu.bobPhase * 0.7) * 0.2;
    
    pu.light.intensity = 1.5 + Math.sin(pu.bobPhase * 2) * 0.5;
    
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
      
      _scene.remove(pu.mesh); _scene.remove(pu.light);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
      powerUps.splice(i, 1);
      continue;
    }
    
    if (pu.life <= 0) {
      _scene.remove(pu.mesh); _scene.remove(pu.light);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
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
    if (pu.light) _scene.remove(pu.light); 
    if (pu.mesh.material) pu.mesh.material.dispose(); 
    if (pu.mesh.geometry) pu.mesh.geometry.dispose(); 
  });
  powerUps.length = 0;
  _player._instaKill = false; _player._instaKillTimer = 0;
  _player._doublePoints = false; _player._doublePointsTimer = 0;
}
