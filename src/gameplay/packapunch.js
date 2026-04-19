// ===== PACK-A-PUNCH SYSTEM =====
// Extracted from main.js — Phase 4 modularization
import * as THREE from 'three';
import { beep } from '../audio/index.js';
import { addFloatText, triggerScreenShake } from '../effects/index.js';
import { applyPaPCamo } from '../models/guns.js';

let _scene, _TILE, _camera, _weapons, _player, _getPoints, _setPoints;

export function setPackAPunchDeps(scene, camera, TILE, weapons, player, pointsAccessor) {
  _scene = scene;
  _camera = camera;
  _TILE = TILE;
  _weapons = weapons;
  _player = player;
  _getPoints = pointsAccessor.get;
  _setPoints = pointsAccessor.set;
}

export const packAPunch = {
  tx: 7, tz: 18,
  cost: 5000,
  upgraded: {},
  // True after the first successful PaP this run — gates the
  // enhanced-fanfare effect so it only fires once per game.
  hasFiredFirstFanfare: false,
};

export const papMeshes = {};

export function buildPackAPunch() {
  if (papMeshes.body) {
    _scene.remove(papMeshes.body); _scene.remove(papMeshes.panel); _scene.remove(papMeshes.light);
  }
  
  const px = packAPunch.tx * _TILE + _TILE / 2;
  const pz = packAPunch.tz * _TILE + _TILE / 2;
  
  const bodyGeo = new THREE.BoxGeometry(1.4, 2.6, 1.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(px, 1.3, pz);
  body.castShadow = true;
  _scene.add(body);
  
  const panelGeo = new THREE.PlaneGeometry(1.0, 1.4);
  const panelMat = new THREE.MeshStandardMaterial({ 
    color: 0x8800ff, emissive: 0x8800ff, emissiveIntensity: 0.6, roughness: 0.2 
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(px, 1.5, pz - 0.71);
  _scene.add(panel);
  
  const light = new THREE.PointLight(0x8800ff, 2, 16);
  light.position.set(px, 2.5, pz);
  _scene.add(light);
  
  papMeshes.body = body;
  papMeshes.panel = panel;
  papMeshes.light = light;
}

export function tryPackAPunch() {
  const px = packAPunch.tx * _TILE + _TILE / 2;
  const pz = packAPunch.tz * _TILE + _TILE / 2;
  const d = Math.hypot(px - _camera.position.x, pz - _camera.position.z);
  if (d > _TILE * 2.5) return false;
  
  const wi = _player.curWeapon;
  if (packAPunch.upgraded[wi]) {
    addFloatText(`${_weapons[wi].name} already upgraded!`, '#888');
    return true;
  }
  const points = _getPoints();
  if (points < packAPunch.cost) {
    addFloatText(`Need $${packAPunch.cost} for Pack-a-Punch`, '#f88');
    return true;
  }
  
  _setPoints(points - packAPunch.cost);
  packAPunch.upgraded[wi] = true;
  
  _weapons[wi].dmg = Math.floor(_weapons[wi].dmg * 2);
  _weapons[wi].mag = Math.floor(_weapons[wi].mag * 1.5);
  _weapons[wi].maxAmmo = Math.floor(_weapons[wi].maxAmmo * 1.5);
  _player.mag = _weapons[wi].mag;
  _player.ammo[wi] = _weapons[wi].maxAmmo;
  
  applyPaPCamo(wi);
  
  const papNames = { 'M1911': 'Mustang & Sally', 'MP40': 'The Afterburner', 'Trench Gun': 'Gut Shot', 'Ray Gun': 'Porter\'s X2' };
  const origName = _weapons[wi].name;
  _weapons[wi].name = papNames[origName] || _weapons[wi].name + ' PaP';
  
  // First-ever PaP this run gets an enhanced fanfare — bigger shake,
  // lightning flash, sustained announcer message. Later PaPs just
  // play the standard beep stack so it stays snappy.
  const isFirstEverPaP = !packAPunch.hasFiredFirstFanfare;
  packAPunch.hasFiredFirstFanfare = true;

  if (isFirstEverPaP) {
    triggerScreenShake(2.4, 3);
    // Full white lightning flash via #roundFlash
    const flash = document.getElementById('roundFlash');
    if (flash) {
      flash.style.background = 'rgba(200, 160, 255, 0.7)';
      flash.style.display = 'block';
      flash.style.opacity = '1';
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => {
          flash.style.display = 'none';
          flash.style.background = 'rgba(255,255,255,0.3)';
        }, 300);
      }, 200);
    }
    // Announcer tones — deeper / longer than normal PaP
    beep(160, 'sawtooth', 0.45, 0.18);
    setTimeout(() => beep(320, 'sawtooth', 0.45, 0.18), 130);
    setTimeout(() => beep(640, 'sine', 0.55, 0.22), 290);
    setTimeout(() => beep(1280, 'sine', 0.5, 0.2), 480);
    setTimeout(() => beep(960, 'sine', 0.4, 0.22), 700);
  } else {
    triggerScreenShake(1.0, 6);
    beep(200, 'sine', 0.2, 0.12);
    setTimeout(() => beep(400, 'sine', 0.2, 0.12), 200);
    setTimeout(() => beep(800, 'sine', 0.3, 0.15), 400);
    setTimeout(() => beep(1200, 'sine', 0.2, 0.1), 600);
  }

  addFloatText(isFirstEverPaP ? `🔥 PACK-A-PUNCHED 🔥` : `⚡ PACK-A-PUNCHED! ⚡`, '#a0f', isFirstEverPaP ? 4 : 3);
  addFloatText(`${_weapons[wi].name} - 2x DMG`, '#fc0', 2.5);
  
  return true;
}

export function resetPackAPunch() {
  packAPunch.upgraded = {};
  packAPunch.hasFiredFirstFanfare = false;
}
