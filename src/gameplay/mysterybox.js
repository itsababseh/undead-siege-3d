// ===== MYSTERY BOX SYSTEM =====
// Extracted from main.js — Phase 4 modularization
import * as THREE from 'three';
import { beep, sfxBuyWeapon } from '../audio/index.js';
import { addFloatText } from '../effects/index.js';

let _scene, _camera, _TILE, _weapons, _player, _weaponMags, _getPoints, _setPoints;

export function setMysteryBoxDeps(scene, camera, TILE, weapons, player, weaponMags, pointsAccessor) {
  _scene = scene;
  _camera = camera;
  _TILE = TILE;
  _weapons = weapons;
  _player = player;
  _weaponMags = weaponMags;
  _getPoints = pointsAccessor.get;
  _setPoints = pointsAccessor.set;
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
};

export const mysteryBoxMeshes = {};

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
  const roll = Math.random();
  if (roll < 0.1) mysteryBox.resultWeaponIdx = 3;
  else if (roll < 0.4) mysteryBox.resultWeaponIdx = 2;
  else if (roll < 0.7) mysteryBox.resultWeaponIdx = 1;
  else mysteryBox.resultWeaponIdx = 0;
  
  beep(600, 'sine', 0.15, 0.1);
  addFloatText('🎰 Mystery Box...', '#48f', 2);
  return true;
}

export function collectMysteryBoxWeapon() {
  if (mysteryBox.collectTimer <= 0 || mysteryBox.resultWeaponIdx < 0) return false;
  const bx = mysteryBox.tx * _TILE + _TILE / 2;
  const bz = mysteryBox.tz * _TILE + _TILE / 2;
  const d = Math.hypot(bx - _camera.position.x, bz - _camera.position.z);
  if (d > _TILE * 2.5) return false;
  
  const wi = mysteryBox.resultWeaponIdx;
  _weaponMags[_player.curWeapon] = _player.mag;
  _player.owned[wi] = true;
  _player.curWeapon = wi;
  _player.mag = _weapons[wi].mag;
  _player.ammo[wi] = _weapons[wi].maxAmmo;
  _player.reloading = false;
  _player.reloadTimer = 0;
  
  sfxBuyWeapon(_weapons[wi].isRayGun);
  const wName = _weapons[wi].name;
  addFloatText(_weapons[wi].isRayGun ? `⚡ ${wName} ⚡` : `${wName}!`, _weapons[wi].color, 2);
  
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
}
