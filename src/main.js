import * as THREE from 'three';
import {
  actx, masterGain,
  initAudio, toggleMute,
  beep, sfxShoot, sfxReload, sfxHit, sfxKill, sfxHurt, sfxEmpty,
  sfxShootM1911, sfxShootMP40, sfxShootTrenchGun, sfxRayGun,
  sfxRound, sfxRoundEnd, sfxBuyWeapon, sfxBuyPerk, sfxDoorOpen,
  sfxWeaponSwitch, sfxZombieAttack, sfxZombieGrunt, sfxBossKill,
  sfxPlayerDeath, sfxKnife, sfxKnifeMiss,
  startBackgroundMusic, updateAmbientSounds,
  playAmbientWind, playDistantScream, playMetalCreak,
  setAudioDeps
} from './audio/index.js';
import {
  ZOMBIE_SPRITE_SIZE, ZOMBIE_FRAMES, ZOMBIE_VARIANTS,
  zombieSpriteSheets, initZombieSprites, createZombieSpriteSheet, drawZombieFrame,
  zombieMeshes, createZombieMesh, removeZombieMesh, updateZombieMesh,
  updateZombieEyeLightPool, setZombieDeps
} from './entities/zombies.js';
import * as netcode from './netcode/connection.js';
import { initRemotePlayers, updateRemotePlayers, clearRemotePlayers } from './netcode/remotePlayers.js';
import { makeHostZid, createHostSync } from './netcode/hostSync.js';
import {
  initReviveMp, isLocallyDowned, onLocalHpZero,
  tickDowned, tickRevive, hasReviveGrace,
} from './netcode/reviveMp.js';

// Local player name helper — used for high-score submission + chat.
function getLocalPlayerName() {
  return (localStorage.getItem('undead.playerName') || 'Survivor').slice(0, 24);
}
function setLocalPlayerName(name) {
  const trimmed = (name || '').trim().slice(0, 24);
  localStorage.setItem('undead.playerName', trimmed || 'Survivor');
  if (netcode.isConnected()) netcode.callSetPlayerName(trimmed || 'Survivor');
}
window._setLocalPlayerName = setLocalPlayerName;
window._getLocalPlayerName = getLocalPlayerName;
import { initBuying, tryBuy, openDoorLocal } from './gameplay/buying.js';
import {
  initShooting, tryShoot, doReload, finishReload, switchWeapon,
} from './gameplay/shooting.js';
import { initChat, tickChat, isChatInputActive } from './netcode/chat.js';
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
  gunGroup, gunModels, muzzleMesh, knifeModel,
  buildM1911, buildMP40, buildTrenchGun, buildRayGun, buildKnife,
  updateGunModel, setGunDeps, initGunModels, updatePaPCamo, resetPaPCamo
} from './models/guns.js';
import { _arrivedViaPortal, initVibeJamPortals, animateVibeJamPortals, 
         _triggerExitPortal, cleanupVibeJamPortals, handleIncomingPortalUser, setPortalDeps } from './world/portal.js';
import { createTexture, floorTex, ceilTex, wallTextures } from './world/textures.js';
import { wallMeshes, doorMeshes, buildMap, setMapDeps } from './world/map.js';
import { triggerRadioTransmission, updateRadioTransmission, closeRadio, easterEgg,
         buildGenerators, tryActivateGenerator, tryCatalyst, updateGenerators,
         updatePersistentStats, getPlayerRank, setStoryDeps, setStoryDoors } from './world/story.js';
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
// MP revive + downed state lives in src/netcode/reviveMp.js. main.js
// just calls onLocalHpZero / tickDowned / tickRevive from its update
// loop and doesn't track the downed flag itself.
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
  hpRegen: false, hpRegenTimer: 0, reviveSpeedMult: 1,
  perksOwned: {},
  bobPhase: 0,
};
gameState.player = player;

// ===== WEAPONS =====
const weapons = [
  { name: 'M1911', dmg: 40, rate: 0.3, mag: 8, maxAmmo: 999, reload: 1.5, auto: false, spread: 0.02, color: '#fc0' },
  { name: 'MP40', dmg: 25, rate: 0.08, mag: 32, maxAmmo: 192, reload: 2.0, auto: true, spread: 0.06, color: '#6cf' },
  { name: 'Trench Gun', dmg: 120, rate: 0.7, mag: 6, maxAmmo: 54, reload: 2.5, auto: false, spread: 0.1, pellets: 5, color: '#f84' },
  { name: 'Ray Gun', dmg: 1000, rate: 0.35, mag: 20, maxAmmo: 160, reload: 3.0, auto: false, spread: 0.01, color: '#0f0', isRayGun: true, splashRadius: 3.5 },
];
const origWeaponStats = weapons.map(w => ({ name: w.name, dmg: w.dmg, mag: w.mag, maxAmmo: w.maxAmmo }));

// Track per-weapon magazine state
const weaponMags = {};

// ===== DEPENDENCY INJECTION — wire up all extracted modules =====
setAudioDeps(camera, player, weapons);
setZombieDeps(scene, camera);
initRemotePlayers(scene, camera);
initReviveMp({
  camera,
  controls,
  keys,
  sfxPlayerDeath,
  setPlayerHp: (hp) => { player.hp = hp; },
  getReviveSpeedMult: () => player.reviveSpeedMult || 1,
});
initChat();
// NOTE: initBuying + initShooting are wired up AFTER the declarations of
// `zombies`, `doors`, `wallBuys`, `PERK_DURATION` etc. (see wireGameplayModules
// call further down). Calling them here would trip a temporal dead zone
// on those `const`s and silently leave the ctx with undefined refs —
// which is how the refactor originally broke shooting (ctx.zombies was
// bound before the const initializer ran).

// Register netcode subscription callbacks. Done in a microtask so that
// any forward-referenced helpers (openDoorLocal etc.) are guaranteed to
// be initialized by the time the callback body runs.
queueMicrotask(() => _hostSync.register());
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
const PERK_DURATION = 90; // seconds — all perks expire after 90s
const perks = [
  { id:'juggernog', name:'Juggernog', desc:'+75 HP', cost:2500, color:'#e44', minRound:1,
    apply() { player.maxHp = 175; player.hp = Math.min(player.hp+75, 175); },
    unapply() { player.maxHp = 100; player.hp = Math.min(player.hp, 100); }},
  { id:'speedcola', name:'Speed Cola', desc:'Faster Reload', cost:3000, color:'#4e4', minRound:3,
    apply() { player.reloadMult = 0.5; },
    unapply() { player.reloadMult = 1; }},
  { id:'doubletap', name:'Double Tap', desc:'2x Fire Rate', cost:2000, color:'#fc0', minRound:5,
    apply() { player.fireRateMult = 0.5; },
    unapply() { player.fireRateMult = 1; }},
  { id:'quickrevive', name:'Quick Revive', desc:'HP Regen + Fast Revive', cost:1500, color:'#4af', minRound:1,
    apply() { player.hpRegen = true; player.reviveSpeedMult = 4; },
    unapply() { player.hpRegen = false; player.reviveSpeedMult = 1; }},
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
setStoryDoors(doors);

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

// Wire the extracted gameplay modules AFTER all their const-scoped
// dependencies have been declared (zombies, doors, wallBuys, perks,
// PERK_DURATION, weaponMags, etc). Doing this at the top of the file
// would hit a TDZ on those consts and leave the modules' ctx holding
// undefined references — that's how shooting silently stopped hitting
// anything after the first pass of the refactor.
initBuying({
  camera,
  TILE,
  wallBuys, perkMachines, perks, weapons, player,
  weaponMags,
  doors,
  map, MAP_W, doorMeshes, scene,
  PERK_DURATION,
  addFloatText,
  sfxBuyWeapon, sfxBuyPerk, sfxDoorOpen,
  getPoints: () => points,
  setPoints: (v) => { points = v; },
  getRound: () => round,
  getZToSpawn: () => zToSpawn,
  setZToSpawn: (v) => { zToSpawn = v; },
  getMaxAlive: () => maxAlive,
  setMaxAlive: (v) => { maxAlive = v; },
  getDoorsOpenedCount: () => doorsOpenedCount,
  setDoorsOpenedCount: (v) => { doorsOpenedCount = v; },
  tryActivateGenerator,
  tryCatalyst,
  tryMysteryBox,
  collectMysteryBoxWeapon,
  tryPackAPunch,
});
initShooting({
  player, weapons, zombies, camera, muzzleLight, TILE,
  mapAt,
  sfxShoot, sfxEmpty, sfxHit, sfxKill, sfxBossKill, sfxReload, sfxWeaponSwitch,
  setGunKick: (v) => { gunKick = v; },
  spawnMuzzleSparks, spawnBloodParticles, spawnEnergyParticles,
  spawnDmgNumber, spawnBloodSplatter, spawnPowerUp,
  showHitmarker, addFloatText,
  startZombieDeathAnim, removeZombieMesh,
  triggerScreenShake,
  weaponMags,
  getPoints: () => points,
  setPoints: (v) => { points = v; },
  getTotalKills: () => totalKills,
  setTotalKills: (v) => { totalKills = v; },
  getState: () => state,
  setQuickSwapWeapon: (v) => { _quickSwapWeapon = v; },
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
  player.hpRegen = false; player.hpRegenTimer = 0; player.reviveSpeedMult = 1;
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
  resetPaPCamo();
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

  // Tell the server we're starting/restarting a game. Flips our
  // Player.alive flag back to true so the all-dead-reset check
  // doesn't fire on us.
  if (netcode.isConnected()) {
    try { netcode.callReportPlayerAlive(true); } catch (e) {}
  }

  nextRound();
}

function resetKnifeState() {
  knifeAnimTimer = 0;
  knifeCooldown = 0;
  knifeModel.visible = false;
  knifeModel.position.set(0, 0, 0);
  knifeModel.rotation.set(0, 0, 0);
  gunModels.forEach((m, i) => { m.visible = (i === player.curWeapon); });
}

function nextRound() {
  round++;
  // Instantly clean up any in-progress knife animation so there's no
  // ghost shank lingering into the new round.
  resetKnifeState();
  // Scale the wave by the number of active players in MP so a four-
  // player squad doesn't breeze through a solo-tuned wave count.
  // Treat everyone who's online as contributing to the scale whether
  // or not they're currently alive — downed players will be revived
  // during the round.
  let playerScale = 1;
  if (netcode.isConnected()) {
    const remoteCount = netcode.getRemotePlayers().size;
    playerScale = 1 + remoteCount; // local + remotes
  }
  zToSpawn = Math.floor((6 + round * 3 + doorsOpenedCount * 2) * (0.6 + playerScale * 0.4));
  zSpawned = 0;
  resetRoundPowerUps();
  maxAlive = Math.min(
    Math.floor((6 + round * 2 + doorsOpenedCount * 2) * (0.7 + playerScale * 0.3)),
    30 + (playerScale - 1) * 5
  );
  spawnTimer = 0;
  state = 'roundIntro';
  roundIntroTimer = 3;
  sfxRound();
  showCenterMsg(`ROUND ${round}`, `${zToSpawn} zombies${round%5===0 ? ' · 💀 BOSS ROUND' : ''}`, '#c00', 3);
  setTimeout(() => triggerRadioTransmission(round), 2000);
}

function getDifficultyTier() { return Math.floor((round - 1) / 5); }

// Build the list of player-target positions for spawn distance checks.
// Host camera + every remote player so zombies don't spawn on top of
// any lobby member.
function _spawnTargets() {
  const out = [{ x: camera.position.x, z: camera.position.z }];
  if (netcode.isConnected()) {
    for (const rp of netcode.getRemotePlayers().values()) {
      out.push({ x: rp.wx, z: rp.wz });
    }
  }
  return out;
}

// Find a random open tile suitable for spawning. Respects closed
// doors (mapAt returns 1 for closed-door tiles), enforces a min
// distance from the nearest player (3 tiles) so zombies don't
// pop in your face, and a max distance (14 tiles) so they don't
// spawn somewhere they physically can't reach.
function _findRandomSpawnTile() {
  const targets = _spawnTargets();
  const minDist = TILE * 3;
  const maxDist = TILE * 14;
  for (let attempt = 0; attempt < 40; attempt++) {
    const tx = Math.floor(Math.random() * MAP_W);
    const tz = Math.floor(Math.random() * MAP_H);
    const wx = tx * TILE + TILE * 0.5;
    const wz = tz * TILE + TILE * 0.5;
    if (mapAt(wx, wz) !== 0) continue;
    let minD = Infinity;
    for (const t of targets) {
      const dx = wx - t.x, dz = wz - t.z;
      const d = Math.hypot(dx, dz);
      if (d < minD) minD = d;
    }
    if (minD < minDist) continue;
    if (minD > maxDist) continue;
    return { wx, wz };
  }
  return null;
}

function spawnZombie() {
  // M4: truly random spawn locations across the whole accessible
  // floor. Falls back to the hardcoded spawnPts list if the random
  // picker can't find a suitable tile after 40 tries (rare — usually
  // happens only when the player is in a tiny sealed area).
  let pick = _findRandomSpawnTile();
  if (!pick) {
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
    let roll = Math.random() * totalWeight;
    pick = pool[0];
    for (const c of pool) {
      roll -= 1 / Math.max(c.d, 1);
      if (roll <= 0) { pick = c; break; }
    }
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
    hostZid: makeHostZid(),
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

  // Multiplayer: if we're host, tell the server about this new zombie.
  // Non-hosts don't get here because the spawn loop is gated earlier.
  if (netcode.isConnected() && netcode.isHost()) {
    const zType = isBoss ? 2 : isElite ? 1 : 0;
    netcode.callSpawnZombie({
      hostZid: z.hostZid,
      zombieType: zType,
      wx: z.wx, wz: z.wz, ry: 0,
      hp: z.hp, maxHp: z.maxHp,
    });
  }
}

// Host-sync logic lives in src/netcode/hostSync.js. main.js wires it up
// once via createHostSync(ctx).register(). The ctx passes in the live
// arrays and getters/setters for the few mutable primitives that the
// sync layer needs to read/write.
const _hostSync = createHostSync({
  zombies,
  doors,
  player,
  PI2,
  getRound: () => round,
  setRound: (v) => { round = v; },
  setState: (v) => { state = v; },
  setRoundIntroTimer: (v) => { roundIntroTimer = v; },
  getTotalKills: () => totalKills,
  setTotalKills: (v) => { totalKills = v; },
  getPoints: () => points,
  setPoints: (v) => { points = v; },
  createZombieMesh,
  removeZombieMesh,
  startZombieDeathAnim,
  spawnBloodSplatter,
  sfxKill,
  sfxBossKill,
  sfxRound,
  showHitmarker,
  showCenterMsg,
  addFloatText,
  triggerScreenShake,
  openDoorLocal: (door) => openDoorLocal(door),
  // Match lifecycle callbacks — invoked when GameState.status flips.
  // Defined lower in main.js as _onMatchStarted / _onMatchEnded; wrap
  // so the closures see the fresh definitions at call time.
  onMatchStarted: () => { if (typeof _onMatchStarted === 'function') _onMatchStarted(); },
  onMatchEnded: () => { if (typeof _onMatchEnded === 'function') _onMatchEnded(); },
});



// ===== INPUT =====
const gameKeys = ['w','a','s','d','r','e','q','f','1','2','3','4'];
let _quickSwapWeapon = 0;
// True when a text/number/textarea input (or contentEditable) currently
// owns the keyboard — e.g. the main-menu NAME field, the in-game chat
// input, or any future search boxes. When true, the game must NOT treat
// keystrokes as gameplay input (no WASD pan, no E buy, no F knife) and
// must NOT preventDefault so the native input actually receives chars.
function isTextInputFocused() {
  if (isChatInputActive()) return true;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener('keydown', e => {
  if (isTextInputFocused()) {
    // Clear any held gameplay keys so releasing focus mid-hold doesn't
    // leave WASD latched, and let the event reach the focused element.
    for (const kk of Object.keys(keys)) keys[kk] = false;
    return;
  }
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (gameKeys.includes(k)) e.preventDefault();
});
document.addEventListener('keyup', e => {
  if (isTextInputFocused()) return;
  keys[e.key.toLowerCase()] = false;
});

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
    // Don't show the pause overlay while locally downed — the downed
    // overlay is already on screen and stacking the pause overlay on
    // top confuses the revive flow (clicking to "resume" shouldn't
    // touch the downed state).
    if (isLocallyDowned()) return;
    if ((state === 'playing' || state === 'roundIntro') && !paused && !_startingGame) {
      // In multiplayer the world is shared — pausing would only stop YOUR
      // local view while other players and the server keep running, which
      // is confusing. Unlock the cursor but keep the game simulating.
      if (netcode.isConnected()) {
        showPause();
      } else {
        paused = true;
        showPause();
      }
    }
  }
});
renderer.domElement.addEventListener('click', () => {
  // Clicks while downed do nothing — you can't resume yourself, you
  // need a teammate revive (or a session reset).
  if (isLocallyDowned()) return;
  if ((state === 'playing' || state === 'roundIntro') && paused) {
    paused = false; hidePause();
    controls.lock();
  } else if ((state === 'playing' || state === 'roundIntro') && !controls.isLocked) {
    // Either MP cursor-unlock (no paused flag) or an ordinary re-lock —
    // both just relock the pointer and drop the overlay.
    hidePause();
    controls.lock();
  }
});
document.getElementById('pauseOverlay').addEventListener('click', () => {
  if (isLocallyDowned()) return;
  if ((state === 'playing' || state === 'roundIntro')) {
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

// Shooting (tryShoot + doReload + finishReload + switchWeapon) lives in
// src/gameplay/shooting.js and is wired via initShooting(ctx).
// ===== KNIFE =====
const KNIFE_RANGE = 2.5;
const KNIFE_COOLDOWN = 0.6;
let knifeCooldown = 0;
let knifeAnimTimer = 0;
const KNIFE_ANIM_DUR = 0.4;

function getKnifeDamage() {
  if (player._instaKill) return 999999;
  return Math.ceil(50 + round * 20);
}

function tryKnife() {
  if (state !== 'playing' && state !== 'roundIntro') return;
  if (knifeCooldown > 0) return;
  knifeCooldown = KNIFE_COOLDOWN;
  knifeAnimTimer = KNIFE_ANIM_DUR;

  // Show knife model briefly, hide current gun
  knifeModel.visible = true;
  gunModels.forEach(m => { m.visible = false; });

  // Find closest zombie in front of player within range
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let bestZ = null, bestD = Infinity;
  for (const z of zombies) {
    const dx = z.wx - camera.position.x;
    const dz = z.wz - camera.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > KNIFE_RANGE) continue;
    // Check zombie is in front of player (dot product)
    const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
    if (dot < 0.3) continue;
    if (dist < bestD) { bestD = dist; bestZ = z; }
  }

  if (bestZ) {
    const mpActive = netcode.isConnected();
    const dmg = getKnifeDamage();

    // Visual + audio feedback fires immediately in both modes.
    sfxKnife();
    bestZ.flash = 1;
    points += player._doublePoints ? 20 : 10;
    spawnBloodParticles(bestZ.wx, 1.2, bestZ.wz, 5);
    showHitmarker(false);
    spawnDmgNumber(bestZ.wx, 1.8 + Math.random() * 0.4, bestZ.wz, dmg, false);
    triggerScreenShake(0.2, 8);

    if (mpActive) {
      // MP: route damage through the reducer so the server owns HP.
      // The subscription update/delete callbacks will apply the HP
      // drop locally (and fire the death VFX in killLocalZombieByHostZid
      // on delete). Same pattern as tryShoot. Without this, knifing
      // would locally kill+splice the zombie while the server row
      // keeps going — next sync tick re-spawns the mesh and you get
      // stacked ghost zombies.
      const dmgApplied = player._instaKill ? 999999 : dmg;
      try { netcode.callDamageZombie(bestZ.hostZid, dmgApplied); }
      catch (e) { console.warn('[mp] damageZombie (knife) failed', e); }
    } else {
      // Single-player path — mutate local HP as before.
      bestZ.hp -= dmg;
      if (player._instaKill && bestZ.hp > 0) bestZ.hp = 0;

      if (bestZ.hp <= 0) {
        const idx = zombies.indexOf(bestZ);
        if (idx >= 0) {
          totalKills++;
          const basePts = bestZ.isBoss ? 500 : bestZ.isElite ? 120 : 60;
          const pts = player._doublePoints ? basePts * 2 : basePts;
          points += pts;
          sfxKill();
          showHitmarker(true);
          spawnDmgNumber(bestZ.wx, 2.2, bestZ.wz, dmg, true);
          spawnBloodParticles(bestZ.wx, 1, bestZ.wz, 8);
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
  } else {
    sfxKnifeMiss();
  }
}

// Buying (wall buys, perk machines, doors, delegated interactions) lives
// in src/gameplay/buying.js. Wired up below via initBuying(ctx).


// ===== UPDATE LOOP =====
function update(dt) {
  // Snapshot prevKeys at the *start* of the frame so rising-edge detection
  // (keyPressed) still works correctly if anything throws mid-frame. Otherwise
  // a thrown error before the old end-of-frame snapshot would make the next
  // frame re-fire the same key and lock the game up.
  try {
    _update(dt);
  } finally {
    for (const k in keys) prevKeys[k] = keys[k];
  }
}

function _update(dt) {
  if (paused) return;

  // MP lobby / sub-menu: not in a game yet, short-circuit everything.
  if (state === 'mpLobby' || state === 'mpMenu') return;

  // MP downed state. If we're non-host (or single-player), the overlay
  // handler is all we need — there's no world sim to tick locally.
  // BUT: if we're the HOST and we go down, we still need to run the
  // zombie spawn / AI / wave-advance loop so everyone else doesn't see
  // the world freeze. Fall through to the rest of _update with a
  // `_iAmDowned` flag that gates the player-action code.
  const _iAmDowned = isLocallyDowned();
  if (_iAmDowned) {
    tickDowned();
    if (!netcode.isConnected() || !netcode.isHost()) return;
    // Host + downed: keep ticking the world. Skip spectator check and
    // revive interaction — we can't revive teammates while downed and
    // we can't spectate ourselves.
  } else {
    // MP spectator: joined mid-match. Camera snaps to a live teammate,
    // no movement/shooting/buying. When the round ends the server flips
    // our spectating flag, tickSpectator detects the transition, and we
    // drop into the game next frame.
    if (tickSpectator()) {
      return;
    }
    tickRevive(dt);
  }

  if (state === 'roundIntro') {
    roundIntroTimer -= dt;
    if (roundIntroTimer <= 0) state = 'playing';
    if (!_iAmDowned) updateMovement(dt);
    return;
  }
  if (state === 'dead' || state !== 'playing') return;

  // Player-action block — skipped when downed. The host still runs the
  // zombie sim + wave advance below, so zombies and other players
  // continue to act even though the host can't move/shoot.
  if (!_iAmDowned) {
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

    // Perk expiration timers
    for (const perk of perks) {
      if (player.perksOwned[perk.id] > 0) {
        player.perksOwned[perk.id] -= dt;
        if (player.perksOwned[perk.id] <= 0) {
          player.perksOwned[perk.id] = 0;
          perk.unapply();
          addFloatText(`${perk.name} EXPIRED!`, '#888', 2.5);
          beep(300, 'sine', 0.15, 0.08);
          beep(200, 'sine', 0.15, 0.08);
        }
      }
    }

    if (player.reloading) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) finishReload();
    }

    // Knife cooldown & animation
    if (knifeCooldown > 0) knifeCooldown -= dt;
    if (knifeAnimTimer > 0) {
      knifeAnimTimer -= dt;
      const t = 1 - (knifeAnimTimer / KNIFE_ANIM_DUR);
      const lunge = Math.sin(t * Math.PI);
      knifeModel.position.set(-lunge * 0.05, lunge * 0.06, -lunge * 0.25);
      knifeModel.rotation.x = -lunge * 0.6;
      knifeModel.rotation.z = lunge * 0.35;
      if (knifeAnimTimer <= 0) {
        knifeModel.visible = false;
        knifeModel.position.set(0, 0, 0);
        knifeModel.rotation.set(0, 0, 0);
        gunModels.forEach((m, i) => { m.visible = (i === player.curWeapon); });
      }
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
    if (keyPressed('f')) tryKnife();
  }
  
  // Multiplayer authority check. In MP, only the host runs the zombie
  // spawn loop, AI, collision, and wave progression. Non-hosts mirror the
  // Zombie table from the server via subscription callbacks (see below).
  const _mpActive = netcode.isConnected();
  const _isHostOrSP = !_mpActive || netcode.isHost();

  if (_isHostOrSP && zSpawned < zToSpawn) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && zombies.length < maxAlive) {
      spawnZombie();
      spawnTimer = Math.max(0.5, 2.5 - round * 0.12);
    }
  }

  // Build the list of valid attack/AI targets once per frame. In MP this
  // includes the local player plus every remote player; in SP it's just
  // the local camera. Downed + spectating players are EXCLUDED — zombies
  // should ignore crawling or spectator teammates and chase the still-
  // standing ones. If every candidate is downed there's nothing alive
  // to chase, and the AI falls through to no-movement (covered by the
  // targets.length === 0 guard below).
  const targets = [];
  if (!_iAmDowned) {
    targets.push({ x: camera.position.x, z: camera.position.z, isLocal: true });
  }
  if (_mpActive) {
    for (const rp of netcode.getRemotePlayers().values()) {
      if (rp.downed || rp.spectating) continue;
      targets.push({ x: rp.wx, z: rp.wz, isLocal: false });
    }
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.flash = Math.max(0, z.flash - dt * 5);

    // Non-host zombies (server-driven) smoothly track their target wx/wz
    // toward the last-received server position. Without this they only
    // move when a subscription update arrives (~20 Hz), producing visible
    // step/stutter motion. Lerp factor 10 gives ~100ms catch-up — fast
    // enough to feel responsive, slow enough to smooth the steps.
    if (z._remote && z._targetWx !== undefined) {
      const lerp = Math.min(1, dt * 10);
      z.wx += (z._targetWx - z.wx) * lerp;
      z.wz += (z._targetWz - z.wz) * lerp;
    }

    // Local distance — used by the attack check and some FX. Always the
    // local camera, because each client applies attacks to its own player.
    const localDx = camera.position.x - z.wx;
    const localDz = camera.position.z - z.wz;
    const localD = Math.hypot(localDx, localDz);

    // AI distance — used by the movement loop. On host, this is the
    // NEAREST player (local or remote) so zombies don't all chase one
    // guy. Each zombie commits to its chosen target for ~0.5-1s to
    // prevent frame-to-frame oscillation when two players are near-
    // equidistant (the old code re-picked every frame and zombies
    // walked in place between two players).
    let dx, dz, d;
    if (_isHostOrSP && _mpActive && targets.length > 0) {
      z._targetPickTimer = (z._targetPickTimer || 0) - dt;
      const needRepick =
        z._aiTargetIdx === undefined ||
        z._aiTargetIdx >= targets.length ||
        z._targetPickTimer <= 0;
      if (needRepick) {
        let bestD = Infinity, bestI = 0;
        for (let ti = 0; ti < targets.length; ti++) {
          const tx = targets[ti].x - z.wx, tz = targets[ti].z - z.wz;
          const td = tx * tx + tz * tz;
          if (td < bestD) { bestD = td; bestI = ti; }
        }
        z._aiTargetIdx = bestI;
        z._targetPickTimer = 0.5 + Math.random() * 0.5;
      }
      const t = targets[z._aiTargetIdx] || targets[0];
      dx = t.x - z.wx;
      dz = t.z - z.wz;
      d = Math.hypot(dx, dz);
    } else if (_isHostOrSP && _mpActive && targets.length === 0) {
      // Everyone's downed (or us + all remotes). Zombies have nobody
      // alive to chase — zero out the direction so the movement block
      // below becomes a no-op (d=0 fails the d>1.5 check).
      dx = 0; dz = 0; d = 0;
    } else {
      dx = localDx;
      dz = localDz;
      d = localD;
    }

    if (_isHostOrSP && d > 1.5) {
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
    
    // Attack check always uses LOCAL distance — each client applies
    // damage to its own player regardless of who the AI is chasing.
    // Fires whether the pause overlay is up or not; in MP, pausing
    // doesn't make you invulnerable. Downed players already have hp=0
    // and can't take more damage, so skip the attack while downed
    // (also means host-while-downed doesn't fire sfxHurt every frame).
    // Post-revive grace window (2s) also blocks damage so a just-
    // revived player can't be instant re-downed by the same biter.
    if (!_iAmDowned && !hasReviveGrace() && localD < 1.8 && state === 'playing') {
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
          // onLocalHpZero handles the MP-downed path and returns true
          // when it took over. If we're in SP it returns false and we
          // fall through to the old permanent-death flow.
          if (!onLocalHpZero()) {
            state = 'dead';
            sfxPlayerDeath();
            controls.unlock();
            setTimeout(showDeath, 1000);
          }
          break;
        }
      }
    }
    
    updateZombieMesh(z, dt);
  }

  updateZombieEyeLightPool(zombies);

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
  
  if (_isHostOrSP && zSpawned >= zToSpawn && zombies.length === 0) {
    // Clean up knife immediately so no ghost shank on round transition
    resetKnifeState();
    const bonus = round * 100;
    points += bonus;
    sfxRoundEnd();
    triggerRoundTransition();
    addFloatText(`+${bonus} ROUND BONUS`, '#fc0', 2);
    nextRound();
    if (_mpActive) {
      try { netcode.callAdvanceRound(); } catch (e) { console.warn('[mp] advanceRound failed', e); }
    }
  }
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
  // Also push to the global SpacetimeDB leaderboard when connected —
  // both SP and MP death paths reach here (MP session-reset path
  // submits separately in hostSync to handle the all-died case).
  if (netcode.isConnected() && round > 0) {
    netcode.callSubmitHighScore({
      name: getLocalPlayerName(),
      round, points, kills: totalKills,
    });
  }
  
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

    // Global leaderboard from SpacetimeDB (top 5). Rendered next to
    // the local board so you can see where this run lands in the
    // world ranking right after the death screen opens.
    let globalLbHTML = '';
    if (netcode.isConnected()) {
      const globals = netcode.getHighScores().slice(0, 5);
      if (globals.length === 0) {
        globalLbHTML = '<div style="color:#555;text-align:center">No global scores yet</div>';
      } else {
        const myName = getLocalPlayerName();
        globalLbHTML = globals.map((s, i) => {
          const mine = s.name === myName && s.round === round && s.points === points && s.kills === totalKills;
          const color = mine ? '#fc0' : '#aaf';
          return `<div style="color:${color};${mine?'font-weight:bold':''}">
            ${i+1}. ${String(s.name || 'Anon').slice(0,12)} · R${s.round} · ${s.points} pts${mine?' ← YOU':''}
          </div>`;
        }).join('');
      }
    } else {
      globalLbHTML = '<div style="color:#555;text-align:center">Connect MP for global scores</div>';
    }

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
      <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:10px;position:relative">
        <div style="min-width:180px">
          <div style="margin:8px 0;font-size:11px;letter-spacing:2px;color:#666">📂 YOUR BEST</div>
          <div style="font-size:12px;line-height:1.8">${lbHTML}</div>
        </div>
        <div style="min-width:220px">
          <div style="margin:8px 0;font-size:11px;letter-spacing:2px;color:#4af">🌐 GLOBAL TOP 5</div>
          <div style="font-size:12px;line-height:1.8">${globalLbHTML}</div>
        </div>
      </div>
      <button onclick="window._startGame()" style="margin-top:16px;background:none;border:2px solid #c00;color:#c00;padding:12px 40px;font:bold 16px 'Courier New';cursor:pointer;letter-spacing:3px;position:relative;overflow:hidden;transition:all 0.3s">FIGHT AGAIN</button>
      <br>
      <button onclick="window._vibeJamPortal()" style="margin-top:10px;background:none;border:2px solid #0f4;color:#0f4;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;position:relative;overflow:hidden;transition:all 0.3s">🌀 VIBE JAM PORTAL</button>
      <div style="margin-top:8px;padding:6px 12px;border:1px solid #fc0;background:rgba(255,204,0,0.08);border-radius:4px;display:inline-block"><span style="color:#fc0;font-size:10px;letter-spacing:1px;text-shadow:0 0 6px rgba(255,204,0,0.4)">⚠️ CAUTION: Transports you to a random Vibe Jam 2026 game!</span></div>
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
  
  // Multiplayer runs on the menu too so the connect button works
  // and the local transform keeps streaming even while paused.
  netcode.update(dt);
  netcode.setLocalTransform(camera.position.x, camera.position.z, controls._yaw);
  updateRemotePlayers(dt, netcode.getRemotePlayers());
  tickChat();

  if (state === 'menu' || state === 'mpLobby') return;

  update(dt);
  controls._applyRotation();
  updateCenterMsg(dt);
  updateGunModel(dt, gunKick);
  updatePaPCamo();
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

// ===== NAME INPUT + GLOBAL LEADERBOARD (menu) =====
(() => {
  const nameInput = document.getElementById('menuNameInput');
  const lbWrap = document.getElementById('menuGlobalLb');
  const lbList = document.getElementById('menuGlobalLbList');
  if (!nameInput || !lbWrap || !lbList) return;

  // Seed the name input from localStorage so existing players keep their name.
  nameInput.value = getLocalPlayerName();
  nameInput.addEventListener('change', () => setLocalPlayerName(nameInput.value));
  nameInput.addEventListener('blur', () => setLocalPlayerName(nameInput.value));

  function renderLb() {
    if (!netcode.isConnected()) {
      lbWrap.style.display = 'none';
      return;
    }
    const scores = netcode.getHighScores();
    if (!scores || scores.length === 0) {
      lbWrap.style.display = 'block';
      lbList.innerHTML = '<div style="color:#555;text-align:center">No scores yet — be the first.</div>';
      return;
    }
    lbWrap.style.display = 'block';
    const top = scores.slice(0, 10);
    lbList.innerHTML = top.map((s, i) => {
      const rank = (i + 1).toString().padStart(2, ' ');
      const name = (s.name || 'Anon').slice(0, 14).padEnd(14, ' ');
      return `<div><span style="color:#666">${rank}.</span> <span style="color:#fff">${escapeMenuHtml(name)}</span> <span style="color:#fc0">R${s.round}</span> <span style="color:#4af">${s.points}</span> <span style="color:#8f8">${s.kills}k</span></div>`;
    }).join('');
  }

  function escapeMenuHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  netcode.setOnHighScoresChange(renderLb);
  netcode.onStatus(({ status }) => { if (status === 'connected') renderLb(); else renderLb(); });
  // Initial render attempt in case we connect before this code runs.
  renderLb();
})();

// ===== MULTIPLAYER: MENU + LOBBY (M4 multi-room) =====
//
// States:
//   menu    → main menu (ENLIST / MULTIPLAYER / name input)
//   mpMenu  → multiplayer sub-menu (FILL SQUAD / CREATE / JOIN / BROWSE)
//   mpLobby → inside a specific lobby waiting for host START GAME
//   playing / roundIntro / dead — as before
//
// Transitions:
//   menu  ──MULTIPLAYER──▶ connect → mpMenu
//   mpMenu ──CREATE/JOIN/FILL──▶ server sets player.lobbyId → mpLobby
//   mpMenu ──BACK──▶ disconnect → menu
//   mpLobby ──host START──▶ lobby.status = playing → _onMatchStarted → game
//   mpLobby ──LEAVE──▶ leave_lobby → player.lobbyId=0 → mpMenu
//   playing ──all wipe──▶ resetLobbyMatch → status=lobby → _onMatchEnded → mpLobby
//
// The lobbyId transitions are driven by netcode.setOnMyLobbyChange —
// main.js doesn't poll, it reacts.

const _mainMenuPanel = document.getElementById('mainMenuPanel');
const _mpMenuPanel = document.getElementById('mpMenuPanel');
const _lobbyPanel = document.getElementById('lobbyPanel');
const _lobbyPlayerList = document.getElementById('lobbyPlayerList');
const _lobbyStartBtn = document.getElementById('lobbyStartBtn');
const _lobbyLeaveBtn = document.getElementById('lobbyLeaveBtn');
const _lobbyHostHint = document.getElementById('lobbyHostHint');
const _lobbyStatusLine = document.getElementById('lobbyStatusLine');
const _lobbyInviteCodeEl = document.getElementById('lobbyInviteCode');
const _lobbyCopyCodeBtn = document.getElementById('lobbyCopyCodeBtn');
const _lobbyCopyHint = document.getElementById('lobbyCopyHint');
const _lobbyPublicToggleBtn = document.getElementById('lobbyPublicToggleBtn');
const _multiBtnEl = document.getElementById('multiBtn');
const _multiStatusEl = document.getElementById('multiStatus');
const _menuNameInputEl = document.getElementById('menuNameInput');
const _mpMenuStatusEl = document.getElementById('mpMenuStatus');
const _mpFillSquadBtn = document.getElementById('mpFillSquadBtn');
const _mpCreateLobbyBtn = document.getElementById('mpCreateLobbyBtn');
const _mpJoinCodeInput = document.getElementById('mpJoinCodeInput');
const _mpJoinByCodeBtn = document.getElementById('mpJoinByCodeBtn');
const _mpBackBtn = document.getElementById('mpBackBtn');
const _mpPublicListEl = document.getElementById('mpPublicList');

function escapeMenuHtmlMp(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Panel show/hide (one of three is visible inside #blocker at any
// given time: mainMenu / mpMenu / lobbyPanel). ─────────────────────
function hideAllMpPanels() {
  if (_mainMenuPanel) _mainMenuPanel.style.display = 'none';
  if (_mpMenuPanel) _mpMenuPanel.style.display = 'none';
  if (_lobbyPanel) _lobbyPanel.style.display = 'none';
}
function showMainMenuPanel() {
  hideAllMpPanels();
  if (_mainMenuPanel) _mainMenuPanel.style.display = 'contents';
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.classList.remove('hidden');
  document.getElementById('hud')?.classList.add('hidden');
}
function showMpMenuPanel() {
  state = 'mpMenu';
  hideAllMpPanels();
  if (_mpMenuPanel) _mpMenuPanel.style.display = 'block';
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.classList.remove('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  renderPublicLobbiesList();
  if (_mpMenuStatusEl) _mpMenuStatusEl.textContent = '';
}
function showLobbyPanel() {
  state = 'mpLobby';
  hideAllMpPanels();
  if (_lobbyPanel) _lobbyPanel.style.display = 'block';
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.classList.remove('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  renderLobbyPanel();
}

// ── Lobby panel renderer ──────────────────────────────────────────
function renderLobbyPanel() {
  if (!_lobbyPanel || _lobbyPanel.style.display === 'none') return;
  const lobby = netcode.getMyLobby();
  if (!lobby) return;
  const isHost = netcode.isHost();
  const localName = getLocalPlayerName();
  const remotes = Array.from(netcode.getRemotePlayers().values());
  const totalCount = 1 + remotes.length;

  if (_lobbyStatusLine) {
    _lobbyStatusLine.textContent =
      `${isHost ? 'YOU ARE HOST' : 'WAITING FOR HOST'} · ${totalCount}/5 PLAYERS`;
  }

  if (_lobbyInviteCodeEl) _lobbyInviteCodeEl.textContent = lobby.inviteCode || '------';

  if (_lobbyPublicToggleBtn) {
    _lobbyPublicToggleBtn.textContent = `LOBBY: ${lobby.isPublic ? 'PUBLIC' : 'PRIVATE'}`;
    _lobbyPublicToggleBtn.style.display = isHost ? 'inline-block' : 'none';
    _lobbyPublicToggleBtn.style.color = lobby.isPublic ? '#8f8' : '#aaa';
    _lobbyPublicToggleBtn.style.borderColor = lobby.isPublic ? '#8f8' : '#888';
  }

  if (_lobbyPlayerList) {
    const rows = [];
    rows.push(`<div><span style="color:#4af">▶</span> <b style="color:#fff">${escapeMenuHtmlMp(localName)}</b> <span style="color:#8f8">(you${isHost ? ', host' : ''})</span></div>`);
    for (const rp of remotes) {
      const nm = rp.name || 'Survivor';
      const tag = rp.spectating ? '<span style="color:#fc0">(spectating)</span>'
                : rp.downed ? '<span style="color:#f66">(downed)</span>'
                : '';
      rows.push(`<div><span style="color:#555">·</span> <span style="color:#ddd">${escapeMenuHtmlMp(nm)}</span> ${tag}</div>`);
    }
    _lobbyPlayerList.innerHTML = rows.join('');
  }

  if (_lobbyStartBtn) {
    if (isHost) {
      _lobbyStartBtn.disabled = false;
      _lobbyStartBtn.style.opacity = '1';
      _lobbyStartBtn.textContent = 'START GAME';
    } else {
      _lobbyStartBtn.disabled = true;
      _lobbyStartBtn.style.opacity = '0.4';
      _lobbyStartBtn.textContent = 'WAITING FOR HOST…';
    }
  }
  if (_lobbyHostHint) {
    _lobbyHostHint.textContent = isHost
      ? 'Share the invite code with friends. You decide when to start.'
      : '';
  }
}

// ── Public lobbies list renderer (MP menu) ───────────────────────
function renderPublicLobbiesList() {
  if (!_mpPublicListEl) return;
  if (!netcode.isConnected()) {
    _mpPublicListEl.innerHTML = '<div style="color:#555;text-align:center;padding:8px">connecting…</div>';
    return;
  }
  const list = netcode.getPublicLobbies();
  if (list.length === 0) {
    _mpPublicListEl.innerHTML = '<div style="color:#555;text-align:center;padding:8px">No public lobbies yet</div>';
    return;
  }
  const rows = list.map(l => {
    const host = escapeMenuHtmlMp((l.hostName || 'Anon').slice(0, 14));
    const status = l.status === 'playing' ? `<span style="color:#fc0">R${l.round}</span>` : '<span style="color:#8f8">waiting</span>';
    return `<div class="mpLobbyRow" data-code="${escapeMenuHtmlMp(l.inviteCode)}" style="cursor:pointer;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center">
      <span><span style="color:#4af">${escapeMenuHtmlMp(l.inviteCode)}</span> <span style="color:#ddd">${host}</span></span>
      <span><span style="color:#888">${l.playerCount}/5</span> ${status}</span>
    </div>`;
  });
  _mpPublicListEl.innerHTML = rows.join('');
  // Delegated click: each row carries its invite code.
  for (const el of _mpPublicListEl.querySelectorAll('.mpLobbyRow')) {
    el.addEventListener('click', () => {
      const code = el.getAttribute('data-code');
      if (code) netcode.callJoinLobbyByCode(code);
    });
  }
}

// ── Back out of MP entirely (disconnect, return to main menu) ─────
function leaveMpCompletely() {
  netcode.disconnect();
  showMainMenuPanel();
  state = 'menu';
}

// ── Match lifecycle — invoked by hostSync when lobby.status flips ─
function _onMatchStarted() {
  hideAllMpPanels();
  if (typeof window._startGame === 'function') window._startGame();
}

function _onMatchEnded() {
  // Capture the ended-run stats BEFORE we reset local state so the
  // summary overlay shows them. hostSync already submitted the score
  // to the global leaderboard via callSubmitHighScore when it saw
  // the status flip, so by the time this runs the global list is
  // either up-to-date or about to be (subscription delta in-flight).
  const endedRound = round;
  const endedKills = totalKills;
  const endedPoints = points;

  paused = false;
  hidePause();
  zombies.forEach(z => removeZombieMesh(z));
  zombies.length = 0;
  points = 500; totalKills = 0; round = 0;
  zToSpawn = 0; zSpawned = 0; maxAlive = 0; spawnTimer = 0;
  document.getElementById('hud')?.classList.add('hidden');
  const downedOv = document.getElementById('downedOverlay');
  if (downedOv) downedOv.style.display = 'none';
  const specOv = document.getElementById('spectatorOverlay');
  if (specOv) specOv.style.display = 'none';
  const blocker = document.getElementById('blocker');
  if (blocker) {
    blocker.classList.remove('hidden');
    blocker.style.opacity = '';
  }

  // Show the run summary + leaderboard before returning to the
  // lobby panel. User clicks CONTINUE to dismiss and go back to
  // waiting-for-host.
  showMpRunSummary(endedRound, endedKills, endedPoints);
}

// Match-ended summary overlay (MP only). Displays the ended run's
// stats + the global leaderboard, with a CONTINUE button that
// dismisses and returns to the lobby panel. Refreshes the leaderboard
// once after a short delay to catch the score submission echo.
function showMpRunSummary(endedRound, endedKills, endedPoints) {
  let overlay = document.getElementById('mpRunSummaryOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mpRunSummaryOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:60;background:rgba(0,0,0,0.88);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:monospace;color:#fff;text-align:center;padding:20px;
    `;
    document.body.appendChild(overlay);
  }

  const renderBody = () => {
    const myName = getLocalPlayerName();
    const globals = netcode.isConnected() ? netcode.getHighScores().slice(0, 10) : [];
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const globalHtml = globals.length === 0
      ? '<div style="color:#555;text-align:center;padding:8px">No scores yet</div>'
      : globals.map((s, i) => {
        const mine = s.name === myName && s.round === endedRound && s.points === endedPoints && s.kills === endedKills;
        const color = mine ? '#fc0' : '#aaf';
        return `<div style="color:${color};${mine?'font-weight:bold':''}">
          ${String(i+1).padStart(2,' ')}. ${esc((s.name || 'Anon').slice(0,14))} · R${s.round} · ${s.points} pts${mine?' ← YOU':''}
        </div>`;
      }).join('');

    overlay.innerHTML = `
      <h1 style="color:#c00;font-size:clamp(32px,6vw,56px);text-shadow:0 0 40px #c00;letter-spacing:6px;margin:0 0 6px">RUN ENDED</h1>
      <div style="color:#aaa;font-size:13px;letter-spacing:3px;margin-bottom:18px">SQUAD WIPED</div>
      <div style="display:flex;gap:28px;justify-content:center;flex-wrap:wrap;margin-bottom:18px">
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedRound}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">ROUND</div></div>
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedKills}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">KILLS</div></div>
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedPoints}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">POINTS</div></div>
      </div>
      <div style="border-top:1px solid #333;padding-top:12px;max-width:420px;width:100%">
        <div style="color:#4af;font-size:11px;letter-spacing:2px;margin-bottom:8px">🌐 GLOBAL LEADERBOARD</div>
        <div id="mpRunSummaryLb" style="font:12px monospace;line-height:1.8;color:#aaa;text-align:left;padding:0 20px">${globalHtml}</div>
      </div>
      <button id="mpRunSummaryContinue" style="margin-top:22px;background:none;border:2px solid #4af;color:#4af;padding:10px 32px;font:bold 14px 'Courier New';cursor:pointer;letter-spacing:3px">CONTINUE</button>
    `;
    const btn = document.getElementById('mpRunSummaryContinue');
    if (btn) btn.addEventListener('click', dismissMpRunSummary);
  };

  renderBody();
  overlay.style.display = 'flex';
  // The leaderboard score submission is in-flight as we render —
  // refresh once after ~500ms to pick up the echoed high_score row.
  setTimeout(renderBody, 500);
  setTimeout(renderBody, 1500);
}

function dismissMpRunSummary() {
  const overlay = document.getElementById('mpRunSummaryOverlay');
  if (overlay) overlay.style.display = 'none';
  // Return to the lobby panel so host can click START GAME again.
  showLobbyPanel();
}

// ── Wire up all the buttons + subscription reactions ─────────────
(() => {
  if (!_multiBtnEl || !_multiStatusEl) return;

  netcode.onStatus(({ status: s, message }) => {
    switch (s) {
      case 'connected':
        _multiBtnEl.textContent = 'LEAVE MP';
        _multiBtnEl.style.background = '#2a5';
        _multiStatusEl.textContent = 'connected';
        _multiStatusEl.style.color = '#8f8';
        // After connect, player.lobbyId is 0 so we land on the MP menu.
        // If we're already in a lobby (e.g. invite link auto-joined),
        // the onMyLobbyChange callback will transition us to mpLobby.
        if (state !== 'playing' && state !== 'roundIntro' && state !== 'mpLobby') {
          if (netcode.getMyLobbyId() === 0n) {
            showMpMenuPanel();
          } else {
            showLobbyPanel();
          }
        }
        // Pending action from the main menu? (e.g. a URL ?invite= asked
        // us to connect-then-join.)
        if (_pendingMpAction) {
          const act = _pendingMpAction;
          _pendingMpAction = null;
          try { act(); } catch (e) { console.warn('[mp] pending action failed', e); }
        }
        break;
      case 'connecting':
        _multiBtnEl.textContent = 'MULTIPLAYER: …';
        _multiBtnEl.style.background = '#555';
        _multiStatusEl.textContent = 'connecting…';
        _multiStatusEl.style.color = '#fc8';
        break;
      case 'error':
        _multiBtnEl.textContent = 'MULTIPLAYER: OFF';
        _multiBtnEl.style.background = '';
        _multiStatusEl.textContent = `error: ${message || 'check console'}`;
        _multiStatusEl.style.color = '#f88';
        showMainMenuPanel();
        state = 'menu';
        break;
      default:
        _multiBtnEl.textContent = 'MULTIPLAYER: OFF';
        _multiBtnEl.style.background = '';
        _multiStatusEl.textContent = '';
        if (state === 'mpMenu' || state === 'mpLobby') {
          showMainMenuPanel();
          state = 'menu';
        }
    }
  });

  // When the local player's lobbyId changes (create/join/leave/kicked),
  // flip between mpMenu and mpLobby views automatically.
  netcode.setOnMyLobbyChange((newLobbyId) => {
    if (newLobbyId && newLobbyId !== 0n) {
      if (state === 'mpMenu' || state === 'menu') {
        showLobbyPanel();
      } else if (state === 'mpLobby') {
        renderLobbyPanel();
      }
    } else {
      // Left the lobby → go back to the MP sub-menu
      if (netcode.isConnected() && (state === 'mpLobby' || state === 'playing' || state === 'roundIntro' || state === 'dead')) {
        showMpMenuPanel();
      }
    }
  });

  // Browse list auto-refreshes whenever any lobby row changes.
  netcode.setOnLobbyListChange(() => {
    if (state === 'mpMenu') renderPublicLobbiesList();
  });

  // Main menu MULTIPLAYER button — opens the MP sub-menu.
  _multiBtnEl.addEventListener('click', () => {
    if (state === 'mpMenu' || state === 'mpLobby') {
      leaveMpCompletely();
      return;
    }
    if (!requireLocalName()) return;
    if (netcode.isConnected() || netcode.getStatus() === 'connecting') {
      showMpMenuPanel();
      return;
    }
    netcode.connect();
    // onStatus 'connected' will flip to showMpMenuPanel once the
    // connection lands.
  });

  function requireLocalName() {
    const nm = getLocalPlayerName();
    if (!nm || nm === 'Survivor') {
      if (_menuNameInputEl) {
        _menuNameInputEl.focus();
        _menuNameInputEl.style.transition = 'box-shadow 0.25s';
        _menuNameInputEl.style.boxShadow = '0 0 10px #4af';
        setTimeout(() => { _menuNameInputEl.style.boxShadow = ''; }, 600);
      }
      _multiStatusEl.textContent = 'set a name first ↑';
      _multiStatusEl.style.color = '#fc8';
      return false;
    }
    return true;
  }

  // MP sub-menu buttons
  if (_mpFillSquadBtn) {
    _mpFillSquadBtn.addEventListener('click', () => {
      _mpMenuStatusEl.textContent = 'finding a squad…';
      _mpMenuStatusEl.style.color = '#fc8';
      netcode.callFillSquad();
    });
  }
  if (_mpCreateLobbyBtn) {
    _mpCreateLobbyBtn.addEventListener('click', () => {
      _mpMenuStatusEl.textContent = 'creating lobby…';
      _mpMenuStatusEl.style.color = '#fc8';
      netcode.callCreateLobby(false); // private by default
    });
  }
  if (_mpJoinByCodeBtn && _mpJoinCodeInput) {
    const doJoin = () => {
      const code = (_mpJoinCodeInput.value || '').trim().toUpperCase();
      if (!code) return;
      _mpMenuStatusEl.textContent = `joining ${code}…`;
      _mpMenuStatusEl.style.color = '#fc8';
      netcode.callJoinLobbyByCode(code);
    };
    _mpJoinByCodeBtn.addEventListener('click', doJoin);
    _mpJoinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doJoin(); }
    });
  }
  if (_mpBackBtn) {
    _mpBackBtn.addEventListener('click', leaveMpCompletely);
  }

  // Lobby panel buttons
  if (_lobbyStartBtn) {
    _lobbyStartBtn.addEventListener('click', () => {
      if (!netcode.isHost()) return;
      netcode.callStartGame();
    });
  }
  if (_lobbyLeaveBtn) {
    _lobbyLeaveBtn.addEventListener('click', () => netcode.callLeaveLobby());
  }
  if (_lobbyCopyCodeBtn) {
    _lobbyCopyCodeBtn.addEventListener('click', async () => {
      const lobby = netcode.getMyLobby();
      if (!lobby) return;
      // Copy just the code, plus a shareable URL version via ?invite=
      const url = `${window.location.origin}${window.location.pathname}?invite=${lobby.inviteCode}`;
      try {
        await navigator.clipboard.writeText(url);
        if (_lobbyCopyHint) _lobbyCopyHint.textContent = 'invite link copied!';
      } catch (e) {
        if (_lobbyCopyHint) _lobbyCopyHint.textContent = lobby.inviteCode;
      }
      setTimeout(() => { if (_lobbyCopyHint) _lobbyCopyHint.textContent = ''; }, 1500);
    });
  }
  if (_lobbyPublicToggleBtn) {
    _lobbyPublicToggleBtn.addEventListener('click', () => {
      if (!netcode.isHost()) return;
      const lobby = netcode.getMyLobby();
      if (!lobby) return;
      netcode.callSetLobbyPublic(!lobby.isPublic);
    });
  }

  // Low-freq redraws while panels are visible. Lobby panel also
  // redraws on any local player update via setOnLocalPlayerUpdate,
  // but a 500ms tick covers slow-moving UI bits (player count,
  // status text) without any extra plumbing.
  setInterval(() => {
    if (state === 'mpLobby') renderLobbyPanel();
    if (state === 'mpMenu') renderPublicLobbiesList();
  }, 500);

  netcode.setOnLocalPlayerUpdate(() => {
    if (state === 'mpLobby') renderLobbyPanel();
  });
})();

// Queue of actions to run once we reach 'connected' status. Used by the
// URL ?invite=CODE bootstrap below — we kick off the connect on page
// load, then once the connection's live we call joinLobbyByCode.
let _pendingMpAction = null;

// ── URL ?invite=CODE bootstrap ────────────────────────────────────
(() => {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('invite') || '').trim().toUpperCase();
  if (!code) return;
  // Wait for the page-load dust to settle, then auto-connect + auto-join.
  setTimeout(() => {
    const nm = getLocalPlayerName();
    if (!nm || nm === 'Survivor') {
      // Name not set — can't auto-join. Highlight the name input and
      // leave the code in the MP join input so clicking MULTIPLAYER +
      // JOIN BY CODE finishes it.
      if (_menuNameInputEl) _menuNameInputEl.focus();
      if (_mpJoinCodeInput) _mpJoinCodeInput.value = code;
      return;
    }
    _pendingMpAction = () => netcode.callJoinLobbyByCode(code);
    if (netcode.isConnected()) {
      _pendingMpAction();
      _pendingMpAction = null;
    } else if (netcode.getStatus() !== 'connecting') {
      netcode.connect();
    }
  }, 100);
})();

// ===== SPECTATOR CAMERA + OVERLAY =====
//
// When the server says we're spectating (we joined mid-match), the main
// update loop skips normal input + movement and this block takes over
// the camera each frame.
const _spectatorOverlay = document.getElementById('spectatorOverlay');
const _spectatorTargetEl = document.getElementById('spectatorTarget');
let _wasSpectating = false;

function tickSpectator() {
  if (!netcode.isConnected()) {
    if (_spectatorOverlay && _spectatorOverlay.style.display !== 'none') {
      _spectatorOverlay.style.display = 'none';
    }
    _wasSpectating = false;
    return false;
  }
  const spec = netcode.isLocalPlayerSpectating();
  if (!spec) {
    if (_wasSpectating) {
      // Transition spectating → live: drop us into the match at a
      // spawn point with a fresh HP/ammo setup (but KEEP points/round).
      _wasSpectating = false;
      if (_spectatorOverlay) _spectatorOverlay.style.display = 'none';
      player.hp = player.maxHp;
      player.reloading = false;
      player.reloadTimer = 0;
      camera.position.set(12 * TILE, 1.6, 12 * TILE);
      controls._yaw = 0;
      controls._pitch = 0;
      controls._applyRotation();
    }
    return false;
  }
  _wasSpectating = true;
  if (_spectatorOverlay && _spectatorOverlay.style.display !== 'block') {
    _spectatorOverlay.style.display = 'block';
  }
  // Snap camera to the first live (non-spectator, non-downed) remote
  // player so the spectator sees what they're doing.
  let target = null;
  let targetName = '';
  for (const rp of netcode.getRemotePlayers().values()) {
    if (rp.spectating) continue;
    if (rp.downed) continue;
    target = rp;
    targetName = rp.name || 'Survivor';
    break;
  }
  if (target) {
    camera.position.set(target.wx, 1.6, target.wz);
    // Face the same direction as the target (approximate — remote ry
    // is updated via subscription).
    controls._yaw = target.ry || 0;
    controls._applyRotation();
    if (_spectatorTargetEl) _spectatorTargetEl.textContent = `Watching ${targetName}`;
  } else if (_spectatorTargetEl) {
    _spectatorTargetEl.textContent = 'No live teammates — waiting…';
  }
  return true;
}

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
