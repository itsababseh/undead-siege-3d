import * as THREE from 'three';
import {
  actx, masterGain,
  initAudio, toggleMute,
  beep, sfxShoot, sfxReload, sfxHit, sfxKill, sfxHurt, sfxEmpty,
  sfxShootM1911, sfxShootMP40, sfxShootTrenchGun, sfxRayGun,
  sfxRound, sfxRoundEnd, sfxBuyWeapon, sfxBuyPerk, sfxDoorOpen,
  sfxWeaponSwitch, sfxZombieAttack, sfxZombieGrunt, sfxBossKill,
  sfxPlayerDeath,
  startBackgroundMusic, updateAmbientSounds,
  playAmbientWind, playDistantScream, playMetalCreak,
  setAudioDeps
} from './audio/index.js';
import {
  ZOMBIE_SPRITE_SIZE, ZOMBIE_FRAMES, ZOMBIE_VARIANTS,
  zombieSpriteSheets, initZombieSprites, createZombieSpriteSheet, drawZombieFrame,
  zombieMeshes, createZombieMesh, removeZombieMesh, updateZombieMesh,
  setZombieDeps
} from './entities/zombies.js';
import { loadTips, loadProgress, initLoadScreen, updateLoadBar, finishLoading } from './ui/loading.js';
import {
  initMenuBackground, stopMenuBackground, restartMenuBackground,
  showMenuScoresEnhanced,
  getLeaderboard, saveScore, showMenuScores
} from './ui/menu.js';
import {
  spawnDmgNumber,
  triggerScreenShake, updateScreenShake,
  triggerDamageVignette, updateDamageVignette,
  updateLowHealthEffect,
  triggerRoundTransition, updateRoundTransition,
  showHitmarker, updateHitmarker,
  triggerHitIndicator, updateHitIndicators,
  resizeHitDirCanvas,
  spawnBloodParticles, spawnBloodSplatter, spawnEnergyParticles,
  spawnMuzzleSparks, updateMuzzleSparks, muzzleSparks,
  updateBloodDecals, bloodDecals,
  startZombieDeathAnim, updateDyingZombies, dyingZombies,
  updateParticles, particles,
  addFloatText, floatTexts,
  resetEffects,
  setEffectsDeps
} from './effects/index.js';
import {
  gunGroup, gunModels, muzzleMesh,
  buildM1911, buildMP40, buildTrenchGun, buildRayGun,
  updateGunModel, setGunDeps, initGunModels
} from './models/guns.js';
import { _arrivedViaPortal, initVibeJamPortals, animateVibeJamPortals, 
         _triggerExitPortal, cleanupVibeJamPortals, handleIncomingPortalUser, setPortalDeps } from './world/portal.js';
import { createTexture, floorTex, ceilTex, wallTextures } from './world/textures.js';
import { wallMeshes, doorMeshes, buildMap, setMapDeps } from './world/map.js';
import { triggerRadioTransmission, updateRadioTransmission, closeRadio, easterEgg,
         buildGenerators, tryActivateGenerator, tryCatalyst, updateGenerators,
         updatePersistentStats, getPlayerRank, setStoryDeps } from './world/story.js';
// Phase 4 extractions
import { mysteryBox, mysteryBoxMeshes, buildMysteryBox, tryMysteryBox,
         collectMysteryBoxWeapon, updateMysteryBox, resetMysteryBox,
         setMysteryBoxDeps } from './gameplay/mysterybox.js';
import { packAPunch, papMeshes, buildPackAPunch, tryPackAPunch,
         resetPackAPunch, setPackAPunchDeps } from './gameplay/packapunch.js';
import { powerUps, POWERUP_TYPES, spawnPowerUp, updatePowerUps,
         cleanupPowerUps, resetRoundPowerUps, setPowerUpDeps } from './gameplay/powerups.js';
import { updateHUD as _updateHUD, showCenterMsg, updateCenterMsg,
         showPause, hidePause, drawFloatTexts, setHudDeps } from './ui/hud.js';
import { drawMinimap, setMinimapDeps } from './ui/minimap.js';


// PointerLockControls removed — using custom FPS camera to prevent roll drift

// UI modules extracted to src/ui/
initLoadScreen();

// ===== CONSTANTS =====
const TILE = 4;
const MAP_W = 24, MAP_H = 24;
const PI = Math.PI, PI2 = PI * 2;
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || ('ontouchstart' in window);

// ===== MAP =====
const mapData = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,3,3,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,3,0,0,0,0,0,0,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,3,0,0,0,0,0,0,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,3,0,0,0,0,0,0,3,1,0,0,2,2,0,0,0,0,2,2,0,0,0,1,
  1,3,0,0,0,0,0,0,3,1,0,0,2,0,0,0,0,0,0,2,0,0,0,1,
  1,3,0,0,0,0,0,0,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,3,0,0,0,0,0,0,3,4,0,0,0,0,0,3,3,0,0,0,0,0,0,1,
  1,3,0,0,0,0,0,0,3,4,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,3,3,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,
  1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,2,2,2,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,2,2,1,
  1,0,0,2,2,0,0,0,0,0,0,2,2,0,0,0,0,0,0,1,1,1,1,1,
  1,0,0,2,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
];
let map = [...mapData];

function mapAt(wx, wz) {
  const mx = Math.floor(wx / TILE), mz = Math.floor(wz / TILE);
  if (mx < 0 || mx >= MAP_W || mz < 0 || mz >= MAP_H) return 1;
  return map[mz * MAP_W + mx];
}

const wallColors = [0x666666, 0x6B4226, 0x4A6B3A, 0x8B3520, 0x8B3520];

// ===== SCENE SETUP =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111118);
scene.fog = new THREE.FogExp2(0x111118, 0.018);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(12 * TILE, 1.6, 12 * TILE);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
document.body.appendChild(renderer.domElement);

// ===== CONTROLS =====
camera.rotation.order = 'YXZ';
const controls = {
  isLocked: false,
  _yaw: 0,
  _pitch: 0,
  _maxPitch: Math.PI / 2.4,
  _skipFrames: 0,
  
  lock() { renderer.domElement.requestPointerLock(); },
  unlock() { document.exitPointerLock(); },
  getDirection(v) { return v.set(0, 0, -1).applyQuaternion(camera.quaternion); },
  getObject() { return camera; },
  moveForward(dist) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    camera.position.addScaledVector(dir, dist);
  },
  moveRight(dist) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    camera.position.addScaledVector(right, dist);
  },
  _applyRotation() { camera.rotation.set(this._pitch, this._yaw, 0, 'YXZ'); }
};

let _mouseSuppress = 0;
function suppressMouse(ms) { _mouseSuppress = performance.now() + (ms || 120); }

document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked) return;
  if (controls._skipFrames > 0) { controls._skipFrames--; return; }
  if (performance.now() < _mouseSuppress) return;
  let mx = e.movementX || 0;
  let my = e.movementY || 0;
  if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
  const maxDelta = 120;
  mx = Math.max(-maxDelta, Math.min(maxDelta, mx));
  my = Math.max(-maxDelta, Math.min(maxDelta, my));
  controls._yaw -= mx * 0.002;
  controls._pitch -= my * 0.002;
  controls._pitch = Math.max(-controls._maxPitch, Math.min(controls._maxPitch, controls._pitch));
  controls._applyRotation();
});

document.addEventListener('pointerlockchange', () => {
  const wasLocked = controls.isLocked;
  controls.isLocked = document.pointerLockElement === renderer.domElement;
  if (controls.isLocked && !wasLocked) { controls._skipFrames = 5; suppressMouse(200); }
  if (!controls.isLocked && wasLocked) { suppressMouse(200); }
});

document.addEventListener('visibilitychange', () => suppressMouse(200));
window.addEventListener('focus', () => suppressMouse(200));
window.addEventListener('blur', () => suppressMouse(200));

// ===== LIGHTING =====
const ambientLight = new THREE.AmbientLight(0x445566, 1.2);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x8899bb, 0.7);
dirLight.position.set(50, 30, 50);
scene.add(dirLight);

const lights = [];
function addLight(x, z, color, intensity, distance) {
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(x * TILE + TILE/2, 2.5, z * TILE + TILE/2);
  scene.add(light);
  lights.push(light);
  return light;
}

addLight(12, 6, 0xffaa66, 4, 30);
addLight(15, 12, 0xff6644, 3, 28);
addLight(5, 5, 0x66ff88, 2.5, 25);
addLight(12, 19, 0xffaa44, 3, 28);
addLight(21, 14, 0x4488ff, 2.5, 25);
addLight(8, 15, 0xff8844, 2.5, 26);
addLight(15, 3, 0xff6666, 2.5, 26);
addLight(3, 7, 0x88ff88, 2, 22);
addLight(18, 6, 0xffcc88, 2.5, 25);
addLight(6, 18, 0xffaa77, 2.5, 25);
addLight(18, 18, 0xffbb88, 2.5, 25);
addLight(12, 12, 0xffeedd, 3, 30);

const playerLight = new THREE.PointLight(0xffeedd, 1.8, 20);
playerLight.position.copy(camera.position);
scene.add(playerLight);

const muzzleLight = new THREE.PointLight(0xffcc44, 0, 12);
scene.add(muzzleLight);

// ===== GAME STATE =====
let state = 'menu';
let paused = false;
let round = 0, points = 500, totalKills = 0;
const gameState = { get points() { return points; }, set points(v) { points = v; },
                    get round() { return round; }, set round(v) { round = v; },
                    get totalKills() { return totalKills; }, set totalKills(v) { totalKills = v; },
                    player: null };
let zToSpawn = 0, zSpawned = 0, maxAlive = 0, spawnTimer = 0;
let roundIntroTimer = 0;
let doorsOpenedCount = 0;
const keys = {};
const prevKeys = {};
let mouseDown = false;

const player = {
  hp: 100, maxHp: 100, speed: 8,
  curWeapon: 0, mag: 8,
  ammo: [999, 0, 0, 0],
  owned: [true, false, false, false],
  reloading: false, reloadTimer: 0,
  fireTimer: 0, fireRateMult: 1, reloadMult: 1,
  hpRegen: false, hpRegenTimer: 0,
  perksOwned: {},
  bobPhase: 0,
};
gameState.player = player;

// ===== WEAPONS =====
const weapons = [
  { name: 'M1911', dmg: 40, rate: 0.3, mag: 8, maxAmmo: 999, reload: 1.5, auto: false, spread: 0.02, color: '#fc0' },
  { name: 'MP40', dmg: 25, rate: 0.08, mag: 32, maxAmmo: 192, reload: 2.0, auto: true, spread: 0.06, color: '#6cf' },
  { name: 'Trench Gun', dmg: 120, rate: 0.7, mag: 6, maxAmmo: 54, reload: 2.5, auto: false, spread: 0.1, pellets: 5, color: '#f84' },
  { name: 'Ray Gun', dmg: 300, rate: 0.35, mag: 20, maxAmmo: 160, reload: 3.0, auto: false, spread: 0.01, color: '#0f0', isRayGun: true },
];
const origWeaponStats = weapons.map(w => ({ name: w.name, dmg: w.dmg, mag: w.mag, maxAmmo: w.maxAmmo }));

// Track per-weapon magazine state
const weaponMags = {};

// ===== DEPENDENCY INJECTION — wire up all extracted modules =====
setAudioDeps(camera, player, weapons);
setZombieDeps(scene, camera);
setEffectsDeps(scene, camera, player, weapons, controls);
setGunDeps(scene, camera, player, weapons);
initGunModels();
setPortalDeps(scene, camera, TILE);
setMapDeps(scene, TILE, MAP_W, MAP_H, map);
setStoryDeps(scene, camera, TILE, gameState, addFloatText);

// Points accessor for gameplay modules
const pointsAccessor = { get: () => points, set: (v) => { points = v; } };
setMysteryBoxDeps(scene, camera, TILE, weapons, player, weaponMags, pointsAccessor);
setPackAPunchDeps(scene, camera, TILE, weapons, player, pointsAccessor);

// Zombies array (shared mutable reference)
const zombies = [];

setPowerUpDeps(scene, camera, weapons, player, {
  getPoints: () => points,
  setPoints: (v) => { points = v; },
  getRound: () => round,
  getZToSpawn: () => zToSpawn,
  getZSpawned: () => zSpawned,
  getZombies: () => zombies,
  getTotalKills: () => totalKills,
  setTotalKills: (v) => { totalKills = v; },
});

// ===== WALL BUYS =====
const wallBuys = [
  { tx: 12, tz: 4, wi: 1, cost: 1000 },
  { tx: 12, tz: 19, wi: 2, cost: 1500 },
  { tx: 15, tz: 7, wi: 3, cost: 10000, minRound: 10 },
];

// ===== PERKS =====
const perks = [
  { id:'juggernog', name:'Juggernog', desc:'+75 HP', cost:2500, color:'#e44', minRound:1,
    apply() { player.maxHp = 175; player.hp = Math.min(player.hp+75, 175); }},
  { id:'speedcola', name:'Speed Cola', desc:'Faster Reload', cost:3000, color:'#4e4', minRound:3,
    apply() { player.reloadMult = 0.5; }},
  { id:'doubletap', name:'Double Tap', desc:'2x Fire Rate', cost:2000, color:'#fc0', minRound:5,
    apply() { player.fireRateMult = 0.5; }},
  { id:'quickrevive', name:'Quick Revive', desc:'HP Regen', cost:1500, color:'#4af', minRound:1,
    apply() { player.hpRegen = true; }},
];
const perkMachines = [
  { tx:10, tz:11, perkIdx:0 },
  { tx:19, tz:6, perkIdx:1 },
  { tx:5, tz:5, perkIdx:2 },
  { tx:21, tz:14, perkIdx:3 },
];

// ===== PERK MACHINE 3D MESHES =====
const perkMeshObjects = [];
function buildPerkMachines() {
  perkMeshObjects.forEach(po => {
    scene.remove(po.body); scene.remove(po.panel); scene.remove(po.light);
  });
  perkMeshObjects.length = 0;
  
  perkMachines.forEach(pm => {
    const perk = perks[pm.perkIdx];
    const color = new THREE.Color(perk.color);
    const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 1.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(pm.tx * TILE + TILE/2, 1.1, pm.tz * TILE + TILE/2);
    body.castShadow = true;
    scene.add(body);
    const panelGeo = new THREE.PlaneGeometry(0.8, 1.2);
    const panelMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(pm.tx * TILE + TILE/2, 1.3, pm.tz * TILE + TILE/2 - 0.61);
    scene.add(panel);
    const pLight = new THREE.PointLight(color.getHex(), 1.5, 14);
    pLight.position.set(pm.tx * TILE + TILE/2, 2.5, pm.tz * TILE + TILE/2);
    scene.add(pLight);
    perkMeshObjects.push({ body, panel, light: pLight, pm });
  });
}
buildPerkMachines();
updateLoadBar(50, 'Fortifying defenses...');

// ===== WALL BUY MARKERS =====
wallBuys.forEach(wb => {
  const isRay = weapons[wb.wi].isRayGun;
  const mColor = isRay ? 0x00ff44 : 0xffcc00;
  const markerGeo = new THREE.PlaneGeometry(1.5, 1);
  const markerMat = new THREE.MeshStandardMaterial({ color: mColor, emissive: mColor, emissiveIntensity: isRay ? 0.5 : 0.3, transparent: true, opacity: 0.7 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(wb.tx * TILE + TILE/2, 1.8, wb.tz * TILE + TILE/2 + 0.1);
  scene.add(marker);
  if (isRay) {
    const glow = new THREE.PointLight(0x00ff44, 1.5, 10);
    glow.position.set(wb.tx * TILE + TILE/2, 2, wb.tz * TILE + TILE/2);
    scene.add(glow);
  }
});

// ===== DOORS =====
const doors = [
  { id:'west', tiles:[[9,7],[9,8]], cost:1250, opened:false, label:'West Wing' },
  { id:'east', tiles:[[19,11],[19,12]], cost:2000, opened:false, label:'East Chamber' },
];

// ===== SPAWN POINTS =====
const spawnPts = [
  {x:11,z:1.5,door:null},{x:18,z:1.5,door:null},{x:11,z:9,door:null},{x:18,z:9,door:null},
  {x:15,z:5,door:null},{x:13,z:7,door:null},{x:1.5,z:11,door:null},{x:1.5,z:20,door:null},
  {x:8,z:22,door:null},{x:15,z:22,door:null},{x:19,z:20,door:null},{x:5,z:15,door:null},
  {x:10,z:18,door:null},{x:17,z:15,door:null},
  {x:3,z:2.5,door:'west'},{x:7,z:2.5,door:'west'},{x:3,z:5,door:'west'},
  {x:5,z:8,door:'west'},{x:7,z:5,door:'west'},{x:2,z:7,door:'west'},
  {x:21,z:11,door:'east'},{x:22,z:13,door:'east'},{x:21,z:15,door:'east'},
  {x:22,z:17,door:'east'},{x:20.5,z:14,door:'east'},{x:21,z:17.5,door:'east'},
];

// Build mystery box & PaP
buildMysteryBox();
buildPackAPunch();
updateLoadBar(65, 'Tuning radio frequencies...');

// ===== HUD & MINIMAP DEPENDENCY INJECTION =====
setHudDeps({
  camera, TILE, weapons, player, isMobile,
  getPoints: () => points,
  getRound: () => round,
  getTotalKills: () => totalKills,
  getZombies: () => zombies,
  perks, perkMachines, doors, wallBuys,
  mysteryBox, packAPunch, easterEgg,
  powerUps, POWERUP_TYPES,
});

setMinimapDeps({
  camera, TILE, MAP_W, MAP_H, map, player,
  doors, perkMachines, perks,
  mysteryBox, packAPunch, easterEgg,
  getZombies: () => zombies,
  powerUps, POWERUP_TYPES,
});


// ===== GAME INIT =====
let _deathShown = false;
function initGame() {
  _deathShown = false;
  player.hp = 100; player.maxHp = 100;
  player.curWeapon = 0; player.mag = weapons[0].mag;
  player.ammo = [999, 0, 0, 0];
  player.owned = [true, false, false, false];
  player.reloading = false; player.reloadTimer = 0;
  player.fireTimer = 0; player.fireRateMult = 1; player.reloadMult = 1;
  player.hpRegen = false; player.hpRegenTimer = 0;
  player.perksOwned = {};
  
  camera.position.set(12 * TILE, 1.6, 12 * TILE);
  controls._yaw = 0;
  controls._pitch = 0;
  controls._applyRotation();
  
  for (const k in weaponMags) delete weaponMags[k];
  
  zombies.forEach(z => removeZombieMesh(z));
  zombies.length = 0;
  
  particles.forEach(p => { scene.remove(p.mesh); p.mesh.material.dispose(); });
  particles.length = 0;
  floatTexts.length = 0;
  
  for (let i = 0; i < weapons.length; i++) {
    weapons[i].name = origWeaponStats[i].name;
    weapons[i].dmg = origWeaponStats[i].dmg;
    weapons[i].mag = origWeaponStats[i].mag;
    weapons[i].maxAmmo = origWeaponStats[i].maxAmmo;
  }
  resetPackAPunch();
  resetMysteryBox();
  cleanupPowerUps();
  
  buildMysteryBox();
  buildPackAPunch();
  
  easterEgg.generators.forEach(g => g.activated = false);
  easterEgg.activatedOrder = [];
  easterEgg.allActivated = false;
  easterEgg.catalystReady = false;
  easterEgg.catalystUsed = false;
  easterEgg.questComplete = false;
  buildGenerators();
  closeRadio();
  
  muzzleSparks.forEach(s => { scene.remove(s.mesh); s.mesh.material.dispose(); });
  muzzleSparks.length = 0;
  dyingZombies.forEach(dz => {
    scene.remove(dz.mesh);
    dz.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) { if (child.material.map) child.material.map.dispose(); child.material.dispose(); }
    });
    if (dz.hpTex) dz.hpTex.dispose();
  });
  dyingZombies.length = 0;
  bloodDecals.forEach(d => { scene.remove(d.mesh); if (d.mesh.material.map) d.mesh.material.map.dispose(); d.mesh.material.dispose(); d.mesh.geometry.dispose(); });
  bloodDecals.length = 0;
  resetEffects();
  document.getElementById('roundFlash').style.display = 'none';
  
  map.length = 0;
  map.push(...mapData);
  doors.forEach(d => { d.opened = false; });
  doorsOpenedCount = 0;
  
  buildMap();
  buildPerkMachines();
  
  cleanupVibeJamPortals();
  initVibeJamPortals();
  
  round = 0; points = 500; totalKills = 0;
  zToSpawn = 0; zSpawned = 0; maxAlive = 0; spawnTimer = 0;
  
  nextRound();
}

function nextRound() {
  round++;
  zToSpawn = Math.floor(6 + round * 3 + doorsOpenedCount * 2);
  zSpawned = 0;
  resetRoundPowerUps();
  maxAlive = Math.min(6 + round * 2 + doorsOpenedCount * 2, 30);
  spawnTimer = 0;
  state = 'roundIntro';
  roundIntroTimer = 3;
  sfxRound();
  showCenterMsg(`ROUND ${round}`, `${zToSpawn} zombies${round%5===0 ? ' · 💀 BOSS ROUND' : ''}`, '#c00', 3);
  setTimeout(() => triggerRadioTransmission(round), 2000);
}

function getDifficultyTier() { return Math.floor((round - 1) / 5); }

function spawnZombie() {
  const candidates = [];
  for (const s of spawnPts) {
    if (s.door) {
      const door = doors.find(d => d.id === s.door);
      if (!door || !door.opened) continue;
    }
    const wx = s.x * TILE, wz = s.z * TILE;
    if (mapAt(wx, wz) !== 0) continue;
    const d = Math.hypot(wx - camera.position.x, wz - camera.position.z);
    candidates.push({ wx, wz, d });
  }
  if (!candidates.length) return;
  const minDist = TILE * 3;
  const viable = candidates.filter(c => c.d >= minDist);
  const pool = viable.length > 0 ? viable : candidates;
  const totalWeight = pool.reduce((sum, c) => sum + 1 / Math.max(c.d, 1), 0);
  let roll = Math.random() * totalWeight, pick = pool[0];
  for (const c of pool) {
    roll -= 1 / Math.max(c.d, 1);
    if (roll <= 0) { pick = c; break; }
  }
  
  const tier = getDifficultyTier();
  const tierMult = 1 + tier * 0.5;
  let hp = Math.floor((50 + round * 20) * tierMult);
  let baseSpd = 50 + Math.min(round * 5, 90) + Math.random() * 20;
  let spd = (baseSpd + tier * 15) / 14;
  let dmg = Math.floor((10 + round * 3) * (1 + tier * 0.3));
  
  let isBoss = false, isElite = false;
  if (round % 5 === 0 && zSpawned === zToSpawn - 1) {
    isBoss = true;
    const bossHpMult = 12 + Math.floor((round - 5) / 5) * 5;
    hp *= bossHpMult;
    spd *= 0.6; dmg *= 4;
  } else if (round >= 3 && Math.random() < 0.15) {
    isElite = true; hp = Math.floor(hp * 2.5); spd *= 1.15; dmg = Math.floor(dmg * 1.8);
  }
  
  const speedRoll = Math.random();
  let speedMult, hasLimp;
  if (speedRoll < 0.12) { speedMult = 1.05 + Math.random() * 0.15; hasLimp = false; }
  else if (speedRoll < 0.32) { speedMult = 0.45 + Math.random() * 0.2; hasLimp = false; }
  else if (speedRoll < 0.55) { speedMult = 0.5 + Math.random() * 0.3; hasLimp = true; }
  else { speedMult = 0.75 + Math.random() * 0.5; hasLimp = false; }
  if (isBoss) { speedMult = 0.7; hasLimp = false; }
  if (isElite) { speedMult = 1.15 + Math.random() * 0.2; hasLimp = false; }
  spd *= speedMult;

  const z = {
    wx: pick.wx, wz: pick.wz,
    hp, maxHp: hp, spd, dmg,
    atkTimer: 1, flash: 0,
    radius: isBoss ? 1.5 : 0.8,
    isBoss, isElite,
    _animOffset: Math.random() * PI2,
    _hasLimp: hasLimp,
    _limpPhase: Math.random() * Math.PI * 2,
    _limpSeverity: hasLimp ? (0.3 + Math.random() * 0.5) : 0,
    _baseSpd: spd,
    stuckCheck: null,
  };
  const offX = (Math.random()-0.5)*1.5;
  const offZ = (Math.random()-0.5)*1.5;
  if (mapAt(z.wx + offX, z.wz + offZ) === 0) { z.wx += offX; z.wz += offZ; }
  else if (mapAt(z.wx + offX, z.wz) === 0) { z.wx += offX; }
  else if (mapAt(z.wx, z.wz + offZ) === 0) { z.wz += offZ; }
  zombies.push(z);
  zSpawned++;
  createZombieMesh(z);
}


// ===== INPUT =====
const gameKeys = ['w','a','s','d','r','e','q','1','2','3','4'];
let _quickSwapWeapon = 0;
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (gameKeys.includes(k)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

renderer.domElement.addEventListener('mousedown', () => {
  initAudio(); startBackgroundMusic(); mouseDown = true;
});
renderer.domElement.addEventListener('mouseup', () => { mouseDown = false; });

let _lastWeapon = 0;
document.addEventListener('wheel', e => {
  if (state !== 'playing') return;
  e.preventDefault();
  const dir = e.deltaY > 0 ? 1 : -1;
  const owned = [];
  for (let i = 0; i < weapons.length; i++) { if (player.owned[i]) owned.push(i); }
  if (owned.length <= 1) return;
  const cur = owned.indexOf(player.curWeapon);
  const next = owned[(cur + dir + owned.length) % owned.length];
  switchWeapon(next);
}, { passive: false });

document.addEventListener('pointerlockchange', () => {
  if (!controls.isLocked) {
    if ((state === 'playing' || state === 'roundIntro') && !paused && !_startingGame) {
      paused = true;
      showPause();
    }
  }
});
renderer.domElement.addEventListener('click', () => {
  if ((state === 'playing' || state === 'roundIntro') && paused) {
    paused = false; hidePause();
    controls.lock();
  } else if ((state === 'playing' || state === 'roundIntro') && !controls.isLocked) {
    controls.lock();
  }
});
document.getElementById('pauseOverlay').addEventListener('click', () => {
  if ((state === 'playing' || state === 'roundIntro') && paused) {
    paused = false; hidePause();
    controls.lock();
  }
});

function keyPressed(k) { return keys[k] && !prevKeys[k]; }

// ===== MOBILE CONTROLS =====
let joystickX = 0, joystickY = 0, mobileFiring = false;
let touchLookId = null, touchLookX = 0, touchLookY = 0;

if (isMobile) {
  document.getElementById('mobileControls').style.display = 'block';
  const ws = document.getElementById('weaponSwitcher');
  weapons.forEach((w, i) => {
    const btn = document.createElement('div');
    btn.className = `wsBtn${i===0?' active':''}${i>0?' locked':''}`;
    btn.textContent = w.name;
    btn.dataset.idx = i;
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (player.owned[i]) switchWeapon(i);
    });
    ws.appendChild(btn);
  });
  const ctrlInfo = document.getElementById('controlsInfo');
  if (ctrlInfo) ctrlInfo.innerHTML = 'Joystick move · Swipe aim · Tap FIRE<br>Tap buttons to reload/buy/switch';
  
  const jBase = document.getElementById('joystickBase');
  const jKnob = document.getElementById('joystickKnob');
  let jTouch = null, jCenterX = 0, jCenterY = 0;
  
  document.getElementById('joystickArea').addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    jTouch = t.identifier;
    const rect = jBase.getBoundingClientRect();
    jCenterX = rect.left + rect.width/2;
    jCenterY = rect.top + rect.height/2;
  });
  document.getElementById('joystickArea').addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === jTouch) {
        const dx = t.clientX - jCenterX, dy = t.clientY - jCenterY;
        const dist = Math.min(Math.hypot(dx, dy), 50);
        const angle = Math.atan2(dy, dx);
        joystickX = Math.cos(angle) * (dist / 50);
        joystickY = Math.sin(angle) * (dist / 50);
        jKnob.style.transform = `translate(${-50+joystickX*40}%, ${-50+joystickY*40}%)`;
      }
    }
  });
  document.getElementById('joystickArea').addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === jTouch) {
        jTouch = null; joystickX = 0; joystickY = 0;
        jKnob.style.transform = 'translate(-50%,-50%)';
      }
    }
  });
  
  document.getElementById('fireBtn').addEventListener('touchstart', e => { e.preventDefault(); mobileFiring = true; initAudio(); startBackgroundMusic(); });
  document.getElementById('fireBtn').addEventListener('touchend', e => { e.preventDefault(); mobileFiring = false; });
  document.getElementById('reloadBtn').addEventListener('touchstart', e => { e.preventDefault(); doReload(); });
  document.getElementById('buyBtn').addEventListener('touchstart', e => { e.preventDefault(); tryBuy(); });
  
  const touchSensitivity = 0.004;
  renderer.domElement.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.3 && touchLookId === null) {
        touchLookId = t.identifier;
        touchLookX = t.clientX;
        touchLookY = t.clientY;
      }
    }
  });
  renderer.domElement.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId) {
        const dx = t.clientX - touchLookX;
        const dy = t.clientY - touchLookY;
        controls._yaw -= dx * touchSensitivity;
        controls._pitch -= dy * touchSensitivity;
        controls._pitch = Math.max(-controls._maxPitch, Math.min(controls._maxPitch, controls._pitch));
        controls._applyRotation();
        touchLookX = t.clientX;
        touchLookY = t.clientY;
      }
    }
  });
  renderer.domElement.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId) touchLookId = null;
    }
  });
}


// ===== SHOOTING =====
const raycaster = new THREE.Raycaster();
let gunKick = 0, dmgFlash = 0;

function tryShoot() {
  if (player.reloading || player.fireTimer > 0) return;
  const w = weapons[player.curWeapon];
  if (player.mag <= 0) { sfxEmpty(); doReload(); return; }
  
  player.mag--;
  player.fireTimer = w.rate * player.fireRateMult;
  sfxShoot();
  gunKick = 1;
  spawnMuzzleSparks();
  const shakeAmt = player.curWeapon === 2 ? 0.6 : (w.isRayGun ? 0.4 : 0.2);
  triggerScreenShake(shakeAmt, 10);
  
  muzzleLight.intensity = 3;
  muzzleLight.color.set(w.isRayGun ? 0x00ff44 : 0xffcc44);
  muzzleLight.position.copy(camera.position);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  muzzleLight.position.add(dir.multiplyScalar(1));
  
  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const spreadX = (Math.random() - 0.5) * w.spread * 2;
    const spreadY = (Math.random() - 0.5) * w.spread * 2;
    
    const shootDir = new THREE.Vector3();
    camera.getWorldDirection(shootDir);
    shootDir.x += spreadX; shootDir.y += spreadY;
    shootDir.normalize();
    
    let bestZ = null, bestD = Infinity;
    for (const z of zombies) {
      const zScale = z.isBoss ? 1.6 : z.isElite ? 1.2 : 1;
      const zHeight = 2.2 * zScale;
      const hitRadius = z.isBoss ? 1.4 : z.isElite ? 1.0 : 0.8;
      const ox = camera.position.x - z.wx;
      const oz = camera.position.z - z.wz;
      const dxS = shootDir.x, dyS = shootDir.y, dzS = shootDir.z;
      const dxdz2 = dxS * dxS + dzS * dzS;
      if (dxdz2 < 0.0001) continue;
      const tClosest = -(ox * dxS + oz * dzS) / dxdz2;
      if (tClosest < 0.3) continue;
      const hDistSq = (ox + tClosest * dxS) ** 2 + (oz + tClosest * dzS) ** 2;
      if (hDistSq > hitRadius * hitRadius) continue;
      const yAtClosest = camera.position.y + tClosest * dyS;
      if (yAtClosest < -0.3 || yAtClosest > zHeight + 0.3) continue;
      let blocked = false;
      const step = TILE * 0.25;
      for (let t = step; t < tClosest; t += step) {
        const cx = camera.position.x + dxS * t;
        const cz = camera.position.z + dzS * t;
        if (mapAt(cx, cz) !== 0) { blocked = true; break; }
      }
      if (!blocked && tClosest < bestD) { bestD = tClosest; bestZ = z; }
    }
    
    if (bestZ) {
      bestZ.hp -= w.dmg;
      bestZ.flash = 1;
      sfxHit();
      points += player._doublePoints ? 20 : 10;
      if (player._instaKill && bestZ.hp > 0) bestZ.hp = 0;
      spawnBloodParticles(bestZ.wx, 1.2, bestZ.wz, 3);
      showHitmarker(false);
      spawnDmgNumber(bestZ.wx, 1.8 + Math.random() * 0.4, bestZ.wz, w.dmg, false);
      
      if (bestZ.hp <= 0) {
        const idx = zombies.indexOf(bestZ);
        if (idx >= 0) {
          totalKills++;
          const basePts = bestZ.isBoss ? 500 : bestZ.isElite ? 120 : 60;
          const pts = player._doublePoints ? basePts * 2 : basePts;
          points += pts;
          sfxKill();
          showHitmarker(true);
          spawnDmgNumber(bestZ.wx, 2.2, bestZ.wz, w.dmg, true);
          if (w.isRayGun) { spawnEnergyParticles(bestZ.wx, 1, bestZ.wz, 10); }
          else { spawnBloodParticles(bestZ.wx, 1, bestZ.wz, 8); }
          const c = bestZ.isBoss ? '#f44' : bestZ.isElite ? '#ff8' : '#fc0';
          addFloatText(bestZ.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, bestZ.isBoss ? 2.5 : 1);
          startZombieDeathAnim(bestZ);
          spawnBloodSplatter(bestZ.wx, 1.2, bestZ.wz);
          spawnPowerUp(bestZ.wx, bestZ.wz);
          triggerScreenShake(bestZ.isBoss ? 1.5 : bestZ.isElite ? 0.5 : 0.15, 8);
          removeZombieMesh(bestZ);
          zombies.splice(idx, 1);
          if (bestZ.isBoss) {
            sfxBossKill();
            triggerScreenShake(2.5, 5);
          }
        }
      }
    }
  }
  
  if (player.mag <= 0) doReload();
}

function doReload() {
  if (player.reloading) return;
  const w = weapons[player.curWeapon];
  if (player.mag >= w.mag) return;
  if (player.ammo[player.curWeapon] <= 0 && player.ammo[player.curWeapon] !== 999) return;
  player.reloading = true;
  player.reloadTotal = w.reload * player.reloadMult;
  player.reloadTimer = player.reloadTotal;
  sfxReload();
}

function finishReload() {
  const w = weapons[player.curWeapon];
  const need = w.mag - player.mag;
  if (player.ammo[player.curWeapon] === 999) { player.mag = w.mag; }
  else {
    const take = Math.min(need, player.ammo[player.curWeapon]);
    player.mag += take;
    player.ammo[player.curWeapon] -= take;
  }
  player.reloading = false;
}

function switchWeapon(idx) {
  if (idx === player.curWeapon || !player.owned[idx]) return;
  if (state !== 'playing' && state !== 'roundIntro') return;
  weaponMags[player.curWeapon] = player.mag;
  _quickSwapWeapon = player.curWeapon;
  player.curWeapon = idx;
  player.mag = (weaponMags[idx] !== undefined) ? weaponMags[idx] : weapons[idx].mag;
  player.reloading = false;
  player.reloadTimer = 0;
  sfxWeaponSwitch();
}

// ===== BUYING =====
function tryBuy() {
  const px = camera.position.x, pz = camera.position.z;
  
  for (const wb of wallBuys) {
    const bx = (wb.tx + 0.5) * TILE, bz = (wb.tz + 0.5) * TILE;
    const d = Math.hypot(bx - px, bz - pz);
    if (d < TILE * 2) {
      if (wb.minRound && round < wb.minRound) {
        addFloatText(`${weapons[wb.wi].name} unlocks Round ${wb.minRound}`, '#888');
        return;
      }
      if (!player.owned[wb.wi] && points >= wb.cost) {
        points -= wb.cost;
        weaponMags[player.curWeapon] = player.mag;
        player.owned[wb.wi] = true;
        player.curWeapon = wb.wi;
        player.mag = weapons[wb.wi].mag;
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        player.reloading = false;
        player.reloadTimer = 0;
        sfxBuyWeapon(weapons[wb.wi].isRayGun);
        if (weapons[wb.wi].isRayGun) { addFloatText(`⚡ RAY GUN ⚡`, '#0f0', 2.5); }
        else { addFloatText(`${weapons[wb.wi].name}!`, '#6f6', 1.5); }
      } else if (player.owned[wb.wi] && points >= Math.floor(wb.cost/2)) {
        points -= Math.floor(wb.cost/2);
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        sfxBuyWeapon(false);
        addFloatText('Ammo!', '#6f6', 1);
      }
      return;
    }
  }
  
  for (const pm of perkMachines) {
    const perk = perks[pm.perkIdx];
    const bx = (pm.tx + 0.5) * TILE, bz = (pm.tz + 0.5) * TILE;
    const d = Math.hypot(bx - px, bz - pz);
    if (d < TILE * 2) {
      if (player.perksOwned[perk.id]) { addFloatText(`Already have ${perk.name}`, '#888'); }
      else if (round < perk.minRound) { addFloatText(`${perk.name} unlocks round ${perk.minRound}`, '#888'); }
      else if (points >= perk.cost) {
        points -= perk.cost;
        player.perksOwned[perk.id] = true;
        perk.apply();
        sfxBuyPerk();
        addFloatText(`${perk.name} ACTIVE!`, perk.color, 2.5);
      } else { addFloatText(`Need $${perk.cost} for ${perk.name}`, '#f88'); }
      return;
    }
  }
  
  if (tryActivateGenerator()) return;
  if (tryCatalyst()) return;
  if (tryMysteryBox()) return;
  if (collectMysteryBoxWeapon()) return;
  if (tryPackAPunch()) return;
  tryBuyDoor();
}

function tryBuyDoor() {
  const px = camera.position.x, pz = camera.position.z;
  for (const door of doors) {
    if (door.opened) continue;
    for (const [tx, tz] of door.tiles) {
      const bx = (tx + 0.5) * TILE, bz = (tz + 0.5) * TILE;
      const d = Math.hypot(bx - px, bz - pz);
      if (d < TILE * 2.5) {
        if (points >= door.cost) {
          points -= door.cost;
          door.opened = true;
          doorsOpenedCount++;
          for (const [dtx, dtz] of door.tiles) { map[dtz * MAP_W + dtx] = 0; }
          doorMeshes.filter(dm => door.tiles.some(([dx,dz]) => dm.x === dx && dm.z === dz))
            .forEach(dm => { scene.remove(dm.mesh); });
          sfxDoorOpen();
          zToSpawn += 4;
          maxAlive = Math.min(maxAlive + 3, 30);
          addFloatText(`${door.label} OPENED!`, '#4f4', 2.5);
          addFloatText('More zombies incoming!', '#f84', 2);
        } else { addFloatText(`Need $${door.cost} for ${door.label}`, '#f88'); }
        return;
      }
    }
  }
}


// ===== UPDATE LOOP =====
function update(dt) {
  if (paused) return;
  
  if (state === 'roundIntro') {
    roundIntroTimer -= dt;
    if (roundIntroTimer <= 0) state = 'playing';
    updateMovement(dt);
    return;
  }
  if (state === 'dead' || state !== 'playing') return;
  
  updateMovement(dt);
  
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  gunKick = Math.max(0, gunKick - dt * 6);
  dmgFlash = Math.max(0, dmgFlash - dt * 4);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 20);
  playerLight.position.copy(camera.position);
  
  if (player.hpRegen && player.hp < player.maxHp && player.hp > 0) {
    player.hpRegenTimer += dt;
    if (player.hpRegenTimer >= 2) { player.hp = Math.min(player.hp + 5, player.maxHp); player.hpRegenTimer = 0; }
  }
  
  if (player.reloading) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) finishReload();
  }
  
  const w = weapons[player.curWeapon];
  const isFiring = mouseDown || mobileFiring;
  if (isFiring && state === 'playing') {
    if (w.auto) { tryShoot(); }
    else { if (!player._lastFiring) tryShoot(); }
  }
  player._lastFiring = isFiring;
  
  if (keyPressed('1') && player.owned[0]) { _quickSwapWeapon = player.curWeapon; switchWeapon(0); }
  if (keyPressed('2') && player.owned[1]) { _quickSwapWeapon = player.curWeapon; switchWeapon(1); }
  if (keyPressed('3') && player.owned[2]) { _quickSwapWeapon = player.curWeapon; switchWeapon(2); }
  if (keyPressed('4') && player.owned[3]) { _quickSwapWeapon = player.curWeapon; switchWeapon(3); }
  if (keyPressed('q') && player.owned[_quickSwapWeapon]) { const prev = player.curWeapon; switchWeapon(_quickSwapWeapon); _quickSwapWeapon = prev; }
  if (keyPressed('r')) doReload();
  if (keyPressed('e')) tryBuy();
  
  if (zSpawned < zToSpawn) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && zombies.length < maxAlive) {
      spawnZombie();
      spawnTimer = Math.max(0.5, 2.5 - round * 0.12);
    }
  }
  
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.flash = Math.max(0, z.flash - dt * 5);
    
    const dx = camera.position.x - z.wx;
    const dz = camera.position.z - z.wz;
    const d = Math.hypot(dx, dz);
    
    if (d > 1.5) {
      let curSpd = z.spd;
      if (z._hasLimp) {
        z._limpPhase += dt * (3 + z._limpSeverity * 2);
        const limpFactor = 1 - z._limpSeverity * (0.5 + 0.5 * Math.sin(z._limpPhase));
        curSpd = z._baseSpd * Math.max(0.1, limpFactor);
      }
      let mx = (dx / d) * curSpd * dt;
      let mz = (dz / d) * curSpd * dt;
      
      for (const oz of zombies) {
        if (oz === z) continue;
        const sx = z.wx - oz.wx, sz = z.wz - oz.wz;
        const sd = Math.hypot(sx, sz);
        if (sd < 2 && sd > 0.01) {
          mx += (sx / sd) * 0.03 * dt * 60;
          mz += (sz / sd) * 0.03 * dt * 60;
        }
      }
      
      const nx = z.wx + mx, nz = z.wz + mz;
      let movedX = false, movedZ = false;
      if (mapAt(nx, z.wz) === 0) { z.wx = nx; movedX = true; }
      if (mapAt(z.wx, nz) === 0) { z.wz = nz; movedZ = true; }
      if (!movedX && !movedZ) {
        const perpX = (-dz / d) * z.spd * dt * 0.7;
        const perpZ = (dx / d) * z.spd * dt * 0.7;
        if (mapAt(z.wx + perpX, z.wz) === 0) { z.wx += perpX; movedX = true; }
        else if (mapAt(z.wx - perpX, z.wz) === 0) { z.wx -= perpX; movedX = true; }
        if (mapAt(z.wx, z.wz + perpZ) === 0) { z.wz += perpZ; movedZ = true; }
        else if (mapAt(z.wx, z.wz - perpZ) === 0) { z.wz -= perpZ; movedZ = true; }
      }
      
      if (!z.stuckCheck) z.stuckCheck = { x: z.wx, z: z.wz, timer: 0, totalStuck: 0 };
      z.stuckCheck.timer += dt;
      if (z.stuckCheck.timer >= 4) {
        const stuckDist = Math.hypot(z.wx - z.stuckCheck.x, z.wz - z.stuckCheck.z);
        if (stuckDist < TILE * 0.3) {
          z.stuckCheck.totalStuck += z.stuckCheck.timer;
          if (z.stuckCheck.totalStuck >= 12) {
            z.hp = 0;
            removeZombieMesh(z);
            zombies.splice(i, 1);
            continue;
          }
          const nudgeStr = TILE * 1.5;
          const nudgeX = (dx / d) * nudgeStr;
          const nudgeZ = (dz / d) * nudgeStr;
          if (mapAt(z.wx + nudgeX, z.wz + nudgeZ) === 0) { z.wx += nudgeX; z.wz += nudgeZ; }
          else if (mapAt(z.wx + nudgeX, z.wz) === 0) { z.wx += nudgeX; }
          else if (mapAt(z.wx, z.wz + nudgeZ) === 0) { z.wz += nudgeZ; }
          else {
            const perpX = (-dz / d) * nudgeStr;
            const perpZ = (dx / d) * nudgeStr;
            if (mapAt(z.wx + perpX, z.wz + perpZ) === 0) { z.wx += perpX; z.wz += perpZ; }
            else if (mapAt(z.wx - perpX, z.wz - perpZ) === 0) { z.wx -= perpX; z.wz -= perpZ; }
          }
        } else { z.stuckCheck.totalStuck = 0; }
        z.stuckCheck.x = z.wx;
        z.stuckCheck.z = z.wz;
        z.stuckCheck.timer = 0;
      }
    }
    
    if (d < 1.8 && state === 'playing') {
      z.atkTimer -= dt;
      if (z.atkTimer <= 0) {
        player.hp -= z.dmg;
        sfxHurt();
        sfxZombieAttack();
        dmgFlash = 1;
        triggerScreenShake(0.8, 6);
        triggerDamageVignette(z.dmg);
        triggerHitIndicator(z.wx, z.wz);
        z.atkTimer = 1;
        if (player.hp <= 0) {
          player.hp = 0;
          state = 'dead';
          sfxPlayerDeath();
          controls.unlock();
          setTimeout(showDeath, 1000);
          break;
        }
      }
    }
    
    updateZombieMesh(z, dt);
  }
  
  updateParticles(dt);
  
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].life -= dt;
    floatTexts[i].y -= 0.03 * dt;
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }
  
  updateAmbientSounds(dt, zombies, state, paused);
  updateMysteryBox(dt);
  updatePowerUps(dt);
  updateRadioTransmission(dt);
  updateGenerators(dt);
  
  if (zSpawned >= zToSpawn && zombies.length === 0) {
    const bonus = round * 100;
    points += bonus;
    sfxRoundEnd();
    triggerRoundTransition();
    addFloatText(`+${bonus} ROUND BONUS`, '#fc0', 2);
    nextRound();
  }
  
  for (const k in keys) prevKeys[k] = keys[k];
}

function updateMovement(dt) {
  let mx = 0, mz = 0;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  
  if (isMobile) {
    mx = forward.x * (-joystickY) + right.x * joystickX;
    mz = forward.z * (-joystickY) + right.z * joystickX;
  } else {
    if (keys['w']) { mx += forward.x; mz += forward.z; }
    if (keys['s']) { mx -= forward.x; mz -= forward.z; }
    if (keys['a']) { mx -= right.x; mz -= right.z; }
    if (keys['d']) { mx += right.x; mz += right.z; }
  }
  
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx = (mx / len) * player.speed * dt;
    mz = (mz / len) * player.speed * dt;
    const margin = 0.6;
    const nx = camera.position.x + mx;
    const nz = camera.position.z + mz;
    if (mapAt(nx + margin * Math.sign(mx), camera.position.z) === 0) camera.position.x = nx;
    if (mapAt(camera.position.x, nz + margin * Math.sign(mz)) === 0) camera.position.z = nz;
    player.bobPhase += dt * 10;
  }
  
  if (!isMobile) {
    camera.position.y = 1.6 + Math.sin(player.bobPhase) * 0.06;
  }
}

// ===== DEATH SCREEN =====
function showDeath() {
  if (_deathShown) return;
  _deathShown = true;
  updatePersistentStats();
  closeRadio();
  const board = saveScore(round, totalKills, points);
  
  const veil = document.getElementById('deathVeil');
  veil.style.background = 'rgba(0,0,0,0.85)';

  setTimeout(() => {
    const blocker = document.getElementById('blocker');
    blocker.classList.remove('hidden');
    blocker.style.opacity = '0';

    // Hide HUD elements during death screen
    document.getElementById('pointsBox').style.display = 'none';
    document.getElementById('ammoBox').style.display = 'none';
    document.getElementById('roundBox').style.display = 'none';
    document.getElementById('hpBarWrap').style.display = 'none';
    document.getElementById('killsLabel').style.display = 'none';
    document.getElementById('minimap').style.display = 'none';
    document.getElementById('weaponSwitcher').style.display = 'none';
    document.getElementById('perkIcons').style.display = 'none';

    let lbHTML = '';
    board.slice(0, 5).forEach((e, i) => {
      const isThis = e.round === round && e.kills === totalKills && e.points === points;
      lbHTML += `<div style="color:${isThis?'#fc0':'#aaa'};${isThis?'font-weight:bold':''}">
        ${i+1}. R${e.round} · ${e.kills} kills · ${e.points} pts${isThis?' ← YOU':''}
      </div>`;
    });
    
    blocker.innerHTML = `
      <div class="menu-bg"><canvas id="menuBgCanvas"></canvas></div>
      <h1 style="color:#c00;text-shadow:0 0 60px #c00,0 0 120px rgba(200,0,0,0.3);position:relative">YOU DIED</h1>
      <div class="sub" style="position:relative">SURVIVED ${round} ROUND${round!==1?'S':''}</div>
      <div class="menu-divider"></div>
      <div style="color:#888;font-size:14px;margin:10px 0;line-height:2;text-align:center;position:relative">
        <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap">
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${round}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">ROUND</div></div>
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${totalKills}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">KILLS</div></div>
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${points}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">POINTS</div></div>
        </div>
      </div>
      <div class="menu-divider"></div>
      <div style="margin:8px 0;font-size:11px;letter-spacing:2px;color:#666;position:relative">🏆 HIGH SCORES</div>
      <div style="font-size:12px;line-height:1.8;position:relative">${lbHTML}</div>
      <button onclick="window._startGame()" style="margin-top:16px;background:none;border:2px solid #c00;color:#c00;padding:12px 40px;font:bold 16px 'Courier New';cursor:pointer;letter-spacing:3px;position:relative;overflow:hidden;transition:all 0.3s">FIGHT AGAIN</button>
      <br>
      <button onclick="window._vibeJamPortal()" style="margin-top:10px;background:none;border:2px solid #0f4;color:#0f4;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;position:relative;overflow:hidden;transition:all 0.3s">🌀 VIBE JAM PORTAL</button>
    `;
    
    const rank = getPlayerRank();
    const rankEl = document.createElement('div');
    rankEl.style.cssText = 'margin-top:10px;text-align:center;position:relative;';
    rankEl.innerHTML = `<div style="color:${rank.color};font-size:13px;letter-spacing:2px">${rank.rank}</div><div style="color:#aaa;font-size:10px">${rank.desc}</div>`;
    blocker.appendChild(rankEl);
    
    document.getElementById('hud').classList.add('hidden');
    restartMenuBackground();
    requestAnimationFrame(() => {
      blocker.style.transition = 'opacity 0.8s ease-in';
      blocker.style.opacity = '1';
      veil.style.background = 'rgba(0,0,0,0)';
    });
  }, 1000);
}

// ===== FLICKER LIGHTS =====
function updateLights(dt) {
  const t = performance.now() / 1000;
  for (let i = 0; i < lights.length; i++) {
    const base = lights[i]._baseIntensity || lights[i].intensity;
    if (!lights[i]._baseIntensity) lights[i]._baseIntensity = lights[i].intensity;
    lights[i].intensity = base * (0.7 + 0.3 * Math.sin(t * (2 + i * 0.7) + i * 1.5));
  }
}

// ===== MAIN GAME LOOP =====
let lastTime = performance.now();

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  
  if (state === 'menu') return;
  
  update(dt);
  controls._applyRotation();
  updateCenterMsg(dt);
  updateGunModel(dt, gunKick);
  updateLights(dt);
  updateHitmarker(dt);
  updateScreenShake(dt);
  updateMuzzleSparks(dt);
  updateDyingZombies(dt);
  updateBloodDecals(dt);
  updateRoundTransition(dt);
  updateDamageVignette(dt);
  updateLowHealthEffect(dt, state);
  updateHitIndicators(dt);
  animateVibeJamPortals(dt, state);
  if (!_deathShown) {
    _updateHUD(dmgFlash, switchWeapon);
    drawMinimap();
    drawFloatTexts(floatTexts);
  }
  
  const t = performance.now() / 1000;
  for (const po of perkMeshObjects) {
    const perk = perks[po.pm.perkIdx];
    const owned = player.perksOwned[perk.id];
    po.panel.material.emissiveIntensity = owned ? 0.15 : 0.4 + Math.sin(t * 2) * 0.2;
    po.light.intensity = owned ? 0.2 : 0.5 + Math.sin(t * 2 + 1) * 0.3;
  }
  
  renderer.render(scene, camera);
}

// ===== START =====
let _startingGame = false;
window._startGame = function() {
  if (_startingGame) return;
  _startingGame = true;
  paused = false;
  hidePause();
  
  const trans = document.getElementById('gameTransition');
  trans.classList.remove('active');
  
  stopMenuBackground();
  const blocker = document.getElementById('blocker');
  blocker.style.opacity = '';
  blocker.style.transition = '';
  blocker.classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('deathVeil').style.background = 'rgba(0,0,0,0)';

  // Show HUD elements when game starts
  document.getElementById('pointsBox').style.display = 'block';
  document.getElementById('ammoBox').style.display = 'block';
  document.getElementById('roundBox').style.display = 'block';
  document.getElementById('hpBarWrap').style.display = 'block';
  document.getElementById('killsLabel').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
  document.getElementById('weaponSwitcher').style.display = 'flex';
  document.getElementById('perkIcons').style.display = 'flex';

  initAudio();
  startBackgroundMusic();
  
  try { initGame(); } catch (e) { console.error('initGame error:', e); }
  
  if (!isMobile) { controls.lock(); }
  
  _startingGame = false;
};

document.getElementById('startBtn').addEventListener('click', window._startGame);

window._vibeJamPortal = function() { _triggerExitPortal(); };

if (_arrivedViaPortal) {
  const _portalAutoStart = setInterval(() => {
    const btn = document.getElementById('startBtn');
    if (btn && btn.offsetParent !== null) {
      clearInterval(_portalAutoStart);
      // Open portal door for incoming users
      handleIncomingPortalUser();
      setTimeout(() => {
        if (typeof window._startGame === 'function') window._startGame();
      }, 300);
    }
  }, 200);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(gameLoop);
updateLoadBar(95, 'Waking the undead...');

setTimeout(() => finishLoading(), 600);
