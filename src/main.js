import * as THREE from 'three';
import {
  actx, masterGain,
  initAudio, toggleMute,
  beep, sfxShoot, sfxReload, sfxHit, sfxKill, sfxHurt, sfxEmpty,
  sfxShootM1911, sfxShootMP40, sfxShootTrenchGun, sfxRayGun,
  sfxRound, sfxRoundEnd, sfxBuyWeapon, sfxBuyPerk, sfxDoorOpen,
  sfxZombieShuffle, sfxFootstep, sfxWeaponSwitch, sfxZombieAttack, sfxZombieGrunt, sfxBossKill,
  sfxBossGroundPound,
  sfxPlayerDeath, sfxKnife, sfxKnifeMiss,
  sfxZombieSpawn, sfxZombieIdle,
  startBackgroundMusic, updateAmbientSounds,
  playAmbientWind, playDistantScream, playDistantHorde, playMetalCreak,
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
import { profBeginFrame, profBegin, profEnd, profEndFrame } from './ui/profiler.js';
import { makeHostZid, createHostSync } from './netcode/hostSync.js';
import {
  initReviveMp, isLocallyDowned, onLocalHpZero, resetDownedState,
  tickDowned, tickRevive, hasReviveGrace,
} from './netcode/reviveMp.js';

// True only when the player is in an actual multiplayer match — i.e.
// connected to the server AND assigned to a lobby. The death screen
// auto-connects to submit high scores, so `netcode.isConnected()` alone
// over-reports MP and would put SP players into MP-mode AI / chat HUD
// after their first death + retry. Use this everywhere the question is
// "are we in a multiplayer game right now?".
function isInActiveMatch() {
  if (!netcode.isConnected()) return false;
  try {
    const lobbyId = netcode.getMyLobbyId();
    return lobbyId && lobbyId !== 0n;
  } catch (e) {
    return false;
  }
}
window._isInActiveMatch = isInActiveMatch;
// Bridge for powerups.js to call netcode without a circular import
window._netcodeCallConsumePowerUp = (puId) => { netcode.callConsumePowerUp(puId); };

// Watchdog state — used by the end-of-round stall guard. Updated each
// time a zombie is removed; the per-frame check below force-rages any
// remaining zombies if no kill has happened in a while and the round
// is on its tail end. Reset to 0 on round start (nextRound).
let _lastZombieDeathTime = 0;
// Tracks the previous frame's MP target roster size so we can detect
// transitions (player downed / revived / joined / left) and force
// every zombie to re-pick its chase target immediately instead of
// waiting up to ~1s for their natural re-pick timer to expire.
let _prevTargetsCount = -1;
// Throttles for window-breach sound effects so simultaneous breaches
// don't pile up audio nodes (lag culprit during chaotic moments).
let _lastBreachThud = 0;
let _lastBreachBang = 0;
window._resetZombieDeathTimer = () => { _lastZombieDeathTime = performance.now(); };

// Local player name helper — used for high-score submission + chat.
// If the player never set a name, we generate a distinct fallback once
// per browser ("Player-1234") and persist it so MP teammates see a
// unique identifier instead of every untitled player rendering as
// "Survivor". The user can still override via the name input.
function getLocalPlayerName() {
  let name = (localStorage.getItem('undead.playerName') || '').trim();
  if (!name) {
    name = `Player-${Math.floor(1000 + Math.random() * 9000)}`;
    try { localStorage.setItem('undead.playerName', name); } catch (e) {}
  }
  return name.slice(0, 24);
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
  resetKillStreak, onKillFromMain,
  resetRunStats, getRunStats, recordKnifeKill } from './gameplay/shooting.js';
import { initChat, tickChat, isChatInputActive, closeChatInput } from './netcode/chat.js';
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
  spawnTracer, updateTracers, tracers,
  updateBloodDecals, bloodDecals,
  startZombieDeathAnim, updateDyingZombies, dyingZombies,
  updateParticles, particles, clearParticles,
  addFloatText, floatTexts,
  resetEffects,
  setEffectsDeps,
  spawnDirtParticles
} from './effects/index.js';
import {
  gunGroup, gunModels, muzzleMesh, knifeModel,
  buildM1911, buildMP40, buildTrenchGun, buildRayGun, buildKnife,
  updateGunModel, setGunDeps, initGunModels, updatePaPCamo, resetPaPCamo,
  forceGunMeshRefresh
} from './models/guns.js';
// Expose to gameplay modules that mutate player.curWeapon outside the
// official switchWeapon() path (mystery box collect, wall-buy) — they
// call this so the held FP mesh swap is guaranteed to land same-frame.
window._forceGunMeshRefresh = forceGunMeshRefresh;
import { _arrivedViaPortal, initVibeJamPortals, animateVibeJamPortals, 
         _triggerExitPortal, cleanupVibeJamPortals, handleIncomingPortalUser, setPortalDeps } from './world/portal.js';
import { createTexture, floorTex, ceilTex, wallTextures } from './world/textures.js';
import { wallMeshes, doorMeshes, buildMap, setMapDeps, setMapDoors } from './world/map.js';
import { buildPosters } from './world/posters.js';
import {
  windows, windowSpecs, PLANKS_PER_WINDOW,
  buildWindows, cleanupWindows, resetAllPlanks,
  setPlank, intactPlanks, isAtWindow, breakNextPlank, repairNextPlank,
  nearestWindow, pickSpawnWindow, outsideSpawnPosition, setWindowDeps
} from './world/windows.js';
import { buildProps, setPropDeps } from './world/props.js';
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
         cleanupPowerUps, resetRoundPowerUps, setPowerUpDeps,
         spawnPowerUpMesh, removePowerUpMesh, applyPowerUpType } from './gameplay/powerups.js';
import { updateHUD as _updateHUD, showCenterMsg, updateCenterMsg,
         showPause, hidePause, drawFloatTexts, setHudDeps,
         showRoundBanner, updateRoundBanner } from './ui/hud.js';
import { drawMinimap, setMinimapDeps } from './ui/minimap.js';
import { initAtmosphere, updateAtmosphere } from './effects/atmosphere.js';
import { initPostProcessing, renderPostProcessing, resizePostProcessing } from './effects/postprocessing.js';
import { initFlicker, updateFlicker } from './effects/flicker.js';
import { initIntro, startIntro, updateIntro, endIntro,
         isIntroActive, getIntroTimer, INTRO_KEYFRAMES } from './ui/intro.js';
import { initSpectator, tickSpectator } from './netcode/spectator.js';
import { initDeathScreen, showDeath, isDeathShown, resetDeathShown } from './ui/deathScreen.js';
import { initScoreboard, incrementLocalDowns, resetLocalDowns } from './ui/scoreboard.js';


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
scene.background = new THREE.Color(0x25252e);
scene.fog = new THREE.FogExp2(0x25252e, 0.006);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(12 * TILE, 1.6, 12 * TILE);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.4;
document.body.appendChild(renderer.domElement);

// ===== POST-PROCESSING =====
initPostProcessing(renderer, scene, camera);

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

// Pointer-lock requests fail silently if not initiated from a user
// gesture. That happens to MP clients when the host starts the match —
// _onMatchStarted runs from a netcode callback (no gesture context) so
// controls.lock() is rejected by the browser, no pointerlockchange
// fires, and the player can't rotate. Same scenario after an MP
// revive: the revive notification arrives async, so the implicit
// re-lock fails. Catching pointerlockerror lets us surface the
// click-to-refocus hint so the player knows what to do.
document.addEventListener('pointerlockerror', () => {
  if ((state === 'playing' || state === 'roundIntro') && !isLocallyDowned()) {
    if (isInActiveMatch()) {
      showMpUnlockHint();
    }
  }
});

// On focus loss / tab switch / minimize, clear any held gameplay keys.
// Without this, holding Shift (or W) while alt-tabbing leaves the key
// latched in our `keys` map — you return and the player is still
// "sprinting" or "moving forward" until you press+release the key.
function _clearHeldKeys() {
  for (const k of Object.keys(keys)) keys[k] = false;
  // Also reset any derived movement state that relies on held keys
  player.sprinting = false;
}
document.addEventListener('visibilitychange', () => {
  suppressMouse(200);
  if (document.hidden) _clearHeldKeys();
});
window.addEventListener('focus', () => suppressMouse(200));
window.addEventListener('blur', () => { suppressMouse(200); _clearHeldKeys(); });

// ===== LIGHTING =====
const ambientLight = new THREE.AmbientLight(0x8899bb, 2.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xccddee, 1.6);
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

// Player-following "torch" light REMOVED. Two problems with it:
//   1. At camera height (1.6) it painted a bright tracking oval on
//      the ceiling directly above the player.
//   2. At shin height (0.6) the grazing falloff across the flat tiled
//      floor produced visible contour bands that shifted as the
//      camera moved — looked like pink streaks on the ground.
// The map's static wall lights + ambient already illuminate the
// arena well enough; the personal torch just added visual noise.
// Kept as a no-op stub so the two per-frame `playerLight.position.set`
// calls below don't need removing (they now operate on a detached
// light that nothing renders, which costs nothing).
const playerLight = new THREE.PointLight(0xffeedd, 0, 0);

const muzzleLight = new THREE.PointLight(0xffcc44, 0, 12);
scene.add(muzzleLight);

// ===== ATMOSPHERIC PARTICLES =====
initAtmosphere(scene, camera);

// ===== GAME STATE =====
let state = 'menu';
let paused = false;

// MP Last Stand (downed + crawl + pistol). When a player is downed in
// multiplayer we drop their camera to prone, force-equip the M1911,
// and slow their movement to a crawl. Teammates can still revive them.
// In single-player there is no last stand — death is final.
const DOWNED_SPEED_MULT = 0.28;     // crawl crawl
const DOWNED_CAM_Y = 0.55;          // near-ground view
let mpDownedPrevWeapon = 0;         // remembered so we can restore on revive

// ===== INTRO CINEMATIC =====
// Implementation lives in src/ui/intro.js. Wired once here and driven
// from the game loop / input handlers below. gunGroup is passed as a
// getter because it's populated lazily during scene build.
initIntro({
  camera,
  controls,
  getGunGroup: () => gunGroup,
  onEnd: () => nextRound(),
});
// MP revive + downed state lives in src/netcode/reviveMp.js. main.js
// just calls onLocalHpZero / tickDowned / tickRevive from its update
// loop and doesn't track the downed flag itself.
let round = 0, points = 500, totalKills = 0;
const gameState = { get points() { return points; }, set points(v) { points = v; },
                    get round() { return round; }, set round(v) { round = v; },
                    get totalKills() { return totalKills; }, set totalKills(v) { totalKills = v; },
                    player: null };
let zToSpawn = 0, zSpawned = 0, maxAlive = 0, spawnTimer = 0;
let _veryLastSpawnFailCount = 0; // consecutive failures on last-zombie spawn
let _roundStartTime = 0; // performance.now() when the round started
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
initChat(() => state);
// NOTE: initBuying + initShooting are wired up AFTER the declarations of
// `zombies`, `doors`, `wallBuys`, `PERK_DURATION` etc. Calling them here
// would trip a temporal dead zone on those `const`s.
// Register netcode subscription callbacks. Done in a microtask so that
// any forward-referenced helpers (openDoorLocal etc.) are guaranteed to
// be initialized by the time the callback body runs.
queueMicrotask(() => _hostSync.register());
setEffectsDeps(scene, camera, player, weapons, controls);
setGunDeps(scene, camera, player, weapons);
initGunModels();
setPortalDeps(scene, camera, TILE);
setMapDeps(scene, TILE, MAP_W, MAP_H, map);
setPropDeps(scene, TILE, MAP_W, MAP_H, map);
setWindowDeps(scene, TILE, wallMeshes);
// Expose window helpers + the beep SFX to the buying module so it can
// run the repair interaction without creating a circular import.
window.__siegeWindows = {
  nearestWindow,
  intactPlanks,
  repairNextPlank,
  PLANKS_PER_WINDOW,
  beep,
};
setStoryDeps(scene, camera, TILE, gameState, addFloatText);

// Points accessor for gameplay modules
const pointsAccessor = { get: () => points, set: (v) => { points = v; } };
setMysteryBoxDeps(scene, camera, TILE, weapons, player, weaponMags, pointsAccessor, switchWeapon, mapAt);
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
const JUGG_SHIELD_HITS = 3; // hits absorbed before shield breaks
const perks = [
  // Juggernog now behaves like CoD Zombies: a hit-absorbing shield.
  // Player takes zero HP damage while shieldHits > 0. Each zombie hit
  // decrements shieldHits; when it reaches 0 (or the timer expires),
  // the shield is gone.
  { id:'juggernog', name:'Juggernog', desc:`Shield (${JUGG_SHIELD_HITS} hits)`, cost:2500, color:'#f66', minRound:1,
    apply() { player.shieldHits = JUGG_SHIELD_HITS; },
    unapply() { player.shieldHits = 0; }},
  { id:'speedcola', name:'Speed Cola', desc:'Faster Reload', cost:3000, color:'#4e4', minRound:3,
    apply() { player.reloadMult = 0.5; },
    unapply() { player.reloadMult = 1; }},
  { id:'doubletap', name:'Double Tap', desc:'2x Fire Rate', cost:2000, color:'#fc0', minRound:5,
    apply() { player.fireRateMult = 0.5; },
    unapply() { player.fireRateMult = 1; }},
  { id:'quickrevive', name:'Quick Revive', desc:'HP Regen + Fast Revive', cost:1500, color:'#4af', minRound:1,
    apply() { player.hpRegen = true; player.reviveSpeedMult = 4; },
    unapply() { player.hpRegen = false; player.reviveSpeedMult = 1; }},
  // New perk — was the old Juggernog behavior. Permanent for the run
  // (no timer), so it doesn't show a countdown pill in the HUD — the
  // bigger HP bar is its own feedback.
  { id:'health', name:'Health', desc:'+75 Max HP (permanent)', cost:2500, color:'#e84', minRound:1, permanent: true,
    apply() { player.maxHp = 175; player.hp = Math.min(player.hp + 75, 175); },
    unapply() { player.maxHp = 100; player.hp = Math.min(player.hp, 100); }},
];
const perkMachines = [
  { tx:10, tz:11, perkIdx:0 },
  { tx:19, tz:6, perkIdx:1 },
  { tx:5, tz:5, perkIdx:2 },
  { tx:21, tz:14, perkIdx:3 },
  { tx:14, tz:17, perkIdx:4 }, // Health — new machine in the main arena
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
// `tiles` lists EVERY map cell that should be cleared and have its mesh
// removed when the door opens. The west wing has TWO walls in front of
// the barracks: the door itself at col 9 (cells 4) AND the green
// barracks wall one tile inside at col 8 (cells 3). We list both so
// opening the door actually grants entry instead of leaving a 1-tile
// pocket where zombies get trapped.
const doors = [
  { id:'west', tiles:[[9,7],[9,8],[8,7],[8,8]], cost:1250, opened:false, label:'West Wing' },
  { id:'east', tiles:[[19,11],[19,12]], cost:2000, opened:false, label:'East Chamber' },
];
setStoryDoors(doors);
// Now that `doors` is defined, hand the reference to the map builder so
// it can pre-extract the door-extension tiles into per-tile meshes
// (called BEFORE buildMap; deferred until after the doors const exists).
setMapDoors(doors);

// ===== DEPENDENCY INJECTION (buying & shooting) =====
// These calls must come AFTER the const declarations for zombies, wallBuys,
// perks, perkMachines, PERK_DURATION, and doors that they reference.
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
  switchWeapon,
});
initShooting({
  player, weapons, zombies, camera, muzzleLight, TILE,
  mapAt,
  sfxShoot, sfxEmpty, sfxHit, sfxKill, sfxBossKill, sfxReload, sfxWeaponSwitch,
  setGunKick: (v) => { gunKick = v; },
  spawnMuzzleSparks, spawnBloodParticles, spawnEnergyParticles, spawnDirtParticles,
  spawnDmgNumber, spawnBloodSplatter, spawnPowerUp,
  showHitmarker, addFloatText,
  startZombieDeathAnim, removeZombieMesh,
  triggerScreenShake,
  spawnTracer,
  weaponMags,
  getPoints: () => points,
  setPoints: (v) => { points = v; },
  getTotalKills: () => totalKills,
  setTotalKills: (v) => { totalKills = v; },
  getState: () => state,
  setQuickSwapWeapon: (v) => { _quickSwapWeapon = v; },
});

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

// ===== EAGER WORLD PRELOAD =====
// Build the entire static world now, while the menu is showing. Before
// this change the full scene construction (walls, floors, props,
// generators, windows, mystery box, PaP) ran synchronously inside
// initGame() on ENLIST click, producing a visible freeze and follow-up
// stutters as the first-render frame lazily uploaded textures and
// compiled shaders. Doing it here means:
//   1. The construction cost is absorbed by the menu-loading phase
//      (the user already sees a progress bar).
//   2. When ENLIST runs, initGame() only resets entity/state data —
//      no geometry is rebuilt.
//   3. Shader programs can be pre-compiled BEFORE the intro cinematic
//      starts, eliminating the random per-frame hitches caused by
//      just-in-time compile when new materials enter the view frustum.
buildMysteryBox();
buildPackAPunch();
buildMap();
buildPosters(scene, TILE);
buildProps();
buildPerkMachines();
buildWindows();
buildGenerators();
// Vibe-jam portals are kept dynamic (rebuilt per-run) because they
// track the current spawn pose.

// Shader warmup runs inside _startGame behind the opaque black
// transition overlay — NOT here. Doing it on module load was partly
// visible through the menu (blocker is rgba(0,0,0,0.92) so the canvas
// leaks 8% through), and it wasn't catching every shader variant the
// intro dollies through anyway (first ~4 frames of the intro still
// triggered 400–900ms compile spikes). Moving the warmup to happen
// immediately AFTER initGame() (same scene state the intro will use)
// and BEFORE the overlay fades out guarantees every program is
// compiled by the time the cinematic renders its first live frame.
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
  getRemotePlayers: () => netcode.getRemotePlayers(),
});




// ===== GAME INIT =====
function initGame() {
  resetDeathShown();
  try { resetRunStats(); } catch(e) {}
  // Clear any leftover MP state from a previous session
  if (typeof hideMpUnlockHint === 'function') hideMpUnlockHint();
  resetDownedState();
  player.hp = 100; player.maxHp = 100;
  player.curWeapon = 0; player.mag = weapons[0].mag;
  player.ammo = [999, 0, 0, 0];
  player.owned = [true, false, false, false];
  player.reloading = false; player.reloadTimer = 0;
  player.fireTimer = 0; player.fireRateMult = 1; player.reloadMult = 1;
  player.hpRegen = false; player.hpRegenTimer = 0; player.reviveSpeedMult = 1;
  player.shieldHits = 0;
  player.sprinting = false;
  player.perksOwned = {};
  mpDownedPrevWeapon = 0;
  
  // In MP assign each player a different spawn slot so they don't
  // stack on top of each other. Slot index = position in the lobby
  // player list (sorted by identity hex for determinism).
  // SP always uses the centre (slot 0 == default).
  (function _placePlayer() {
    // 4 separated spawn points arranged in a loose square around the
    // map centre (tile 12,12). Each faces inward (toward the centre).
    const MP_SLOTS = [
      { x: 12 * TILE, z: 12 * TILE, yaw: 0 },           // centre (SP / host)
      { x: 10 * TILE, z: 10 * TILE, yaw:  0.785 },      // NW, face SE
      { x: 14 * TILE, z: 10 * TILE, yaw: -0.785 },      // NE, face SW
      { x: 10 * TILE, z: 14 * TILE, yaw:  2.356 },      // SW, face NE
      { x: 14 * TILE, z: 14 * TILE, yaw: -2.356 },      // SE, face NW
    ];
    let slot = 0;
    if (isInActiveMatch()) {
      // Sort lobby players by identity hex for a stable, deterministic
      // index. Each client computes the same ordering, so no sync needed.
      const myHex = netcode.getLocalIdentity
        ? (typeof netcode.getLocalIdentity() === 'object'
            ? netcode.getLocalIdentity()?.toHexString?.() || ''
            : String(netcode.getLocalIdentity()))
        : '';
      const roster = netcode.getLobbyPlayers
        ? netcode.getLobbyPlayers().map(p => {
            const id = p.identity;
            return typeof id?.toHexString === 'function' ? id.toHexString() : String(id);
          }).sort()
        : [];
      const idx = roster.indexOf(myHex);
      slot = Math.max(0, idx) + 1; // +1 so slot 0 (centre) is unused in MP
      if (slot >= MP_SLOTS.length) slot = (slot % (MP_SLOTS.length - 1)) + 1;
    }
    const s = MP_SLOTS[slot] || MP_SLOTS[0];
    camera.position.set(s.x, 1.6, s.z);
    controls._yaw = s.yaw;
    controls._pitch = 0;
    controls._applyRotation();
  })();
  
  for (const k in weaponMags) delete weaponMags[k];
  
  zombies.forEach(z => removeZombieMesh(z));
  zombies.length = 0;
  
  clearParticles();
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

  // NOTE: the world geometry (walls, props, perk machines, windows,
  // generators, mystery box, PaP) is built ONCE at module load up
  // above. We only reset STATE here — no rebuild. This keeps ENLIST
  // and FIGHT AGAIN nearly free instead of re-running the whole
  // scene construction every time.
  easterEgg.generators.forEach(g => g.activated = false);
  easterEgg.activatedOrder = [];
  easterEgg.allActivated = false;
  easterEgg.catalystReady = false;
  easterEgg.catalystUsed = false;
  easterEgg.questComplete = false;
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

  // Windows keep their meshes but need planks restored on restart.
  resetAllPlanks();

  // Portals are dynamic (track spawn pose) — cleanup + recreate each run.
  cleanupVibeJamPortals();
  initVibeJamPortals();
  
  round = 0; points = 500; totalKills = 0;
  zToSpawn = 0; zSpawned = 0; maxAlive = 0; spawnTimer = 0;
  resetLocalDowns();

  // Tell the server we're starting/restarting a game. Flips our
  // Player.alive flag back to true so the all-dead-reset check
  // doesn't fire on us.
  if (netcode.isConnected()) {
    try { netcode.callReportPlayerAlive(true); } catch (e) {}
  }

  // Intro cinematic — plays ONCE per page load, in BOTH SP and MP.
  // In MP every player's client hits initGame() when the lobby status
  // flips 'lobby' → 'playing', so everyone sees the dolly at the same
  // moment. Each player can skip their own (any key / click / button)
  // — the host's simulation only starts producing zombies after their
  // own intro ends (via nextRound), so there's no divergence risk.
  // Still skipped by the portal-resume and FIGHT-AGAIN paths via
  // _skipIntro, and re-plays suppressed by _introPlayedThisSession.
  if (!_skipIntro && !_introPlayedThisSession) {
    _introPlayedThisSession = true;
    state = 'intro';
    startIntro();
  } else {
    _skipIntro = false;
    nextRound();
  }
}

let _skipIntro = false;
let _introPlayedThisSession = false;
// Set by resume / rejoin paths so the cinematic only plays on a fresh
// single-player run. Reset at end of initGame.
function markSkipIntro() { _skipIntro = true; }

function resetKnifeState() {
  knifeAnimTimer = 0;
  knifeCooldown = 0;
  knifeModel.visible = false;
  knifeModel.position.set(0, 0, 0);
  knifeModel.rotation.set(0, 0, 0);
  gunModels.forEach((m, i) => { m.visible = (i === player.curWeapon); });
}

// Milestone rank banners per 5 rounds. CoD-style wave-survived power
// fantasy: bigger glow + shake + sustained float text as you hit each
// 5x tier. Keyed by round number that was just CLEARED (so showing
// after round++ makes sense: round === 5 means just survived 4 rounds
// and is about to enter round 5's wave).
const _MILESTONE_RANKS = {
  5:  { title: 'VETERAN',   color: '#ffc266' },
  10: { title: 'HARDENED',  color: '#ff8833' },
  15: { title: 'ELITE',     color: '#ff4466' },
  20: { title: 'LEGEND',    color: '#cc44ff' },
  25: { title: 'MYTHIC',    color: '#66ffcc' },
  30: { title: 'IMMORTAL',  color: '#ffff66' },
};
function _triggerMilestoneFanfare(rank) {
  // Screen shake (moderate — not enough to disorient)
  triggerScreenShake(0.9, 4);
  // Quick bright white flash using the existing round-flash element
  const flash = document.getElementById('roundFlash');
  if (flash) {
    flash.style.background = 'rgba(255, 240, 210, 0.6)';
    flash.style.display = 'block';
    flash.style.opacity = '1';
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => {
        flash.style.display = 'none';
        flash.style.background = 'rgba(255,255,255,0.3)';
      }, 260);
    }, 140);
  }
  // Announcer-ish SFX — quick rising two-tone chime stack
  try {
    beep(520, 'sine', 0.35, 0.15);
    setTimeout(() => beep(780, 'sine', 0.35, 0.18), 110);
    setTimeout(() => beep(1040, 'sine', 0.5, 0.20), 240);
  } catch (e) {}
  // Big center message. Uses existing showCenterMsg; extra float text
  // for glow stacking so this reads as more eventful than a normal
  // round intro.
  showCenterMsg(`WAVE SURVIVED`, `— ${rank.title} —`, rank.color, 3.2);
  addFloatText(`★ ${rank.title} ★`, rank.color, 4);
}

function nextRound() {
  try { resetKillStreak(); } catch(e) {}
  round++;
  const roundEntering = round;
  // Reset the stuck-zombie watchdog at the start of each round so the
  // first kill of the wave isn't immediately deemed "overdue".
  _lastZombieDeathTime = performance.now();
  // Instantly clean up any in-progress knife animation so there's no
  // ghost shank lingering into the new round.
  resetKnifeState();
  // Fire milestone fanfare AFTER knife reset / before the rest of
  // nextRound so the banner visually lands before the ROUND X intro.
  // "WAVE SURVIVED — VETERAN" shows as round 5 begins (meaning you
  // just cleared round 4 and are about to enter round 5).
  if (_MILESTONE_RANKS[roundEntering]) {
    _triggerMilestoneFanfare(_MILESTONE_RANKS[roundEntering]);
  } else if (roundEntering > 30 && roundEntering % 5 === 0) {
    // Beyond round 30 keep rewarding persistence with generic fanfare
    _triggerMilestoneFanfare({ title: `SURVIVOR ${roundEntering}`, color: '#ffaaff' });
  }
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
  _veryLastSpawnFailCount = 0;
  _roundStartTime = performance.now();
  resetRoundPowerUps();
  maxAlive = Math.min(
    Math.floor((6 + round * 2 + doorsOpenedCount * 2) * (0.7 + playerScale * 0.3)),
    30 + (playerScale - 1) * 5
  );
  spawnTimer = 0;
  state = 'roundIntro';
  roundIntroTimer = 3;
  sfxRound();
  const isBossRound = round % 5 === 0;
  showCenterMsg(
    isBossRound ? `⚠ BOSS ROUND ${round}` : `ROUND ${round}`,
    isBossRound ? `${zToSpawn} hostiles + 💀 BOSS` : `${zToSpawn} zombies`,
    isBossRound ? '#ff3344' : '#c00',
    3
  );
  showRoundBanner(round, round % 5 === 0 ? 'BOSS ROUND' : `${zToSpawn} HOSTILES INBOUND`);
  setTimeout(() => triggerRadioTransmission(round), 2000);
}

function getDifficultyTier() { return Math.floor((round - 1) / 5); }

// Wipe all active, duration-based perks. Called when the local player
// goes down (or dies in SP) so timed buffs don't survive a revive.
// Power-ups (insta-kill, double points) are also cleared because they
// wouldn't make sense carrying over through a down.
// Called by reviveMp.js when a teammate revives us. We restore the
// weapon we had when we went down. reviveMp already resets player.hp.
window.__onMpRevived = () => {
  if (player.owned[mpDownedPrevWeapon]) {
    player.curWeapon = mpDownedPrevWeapon;
    const saved = weaponMags[mpDownedPrevWeapon];
    player.mag = (typeof saved === 'number') ? saved : weapons[mpDownedPrevWeapon].mag;
  }
  addFloatText('REVIVED!', '#4f4', 2.5);
  // Pointer lock was released when the downed overlay went up. The
  // revive happens via a server callback, NOT a user gesture, so any
  // controls.lock() here would be silently rejected by the browser
  // and the player wouldn't be able to rotate. Try the lock anyway,
  // and surface the click-to-refocus hint after a short delay if it
  // didn't take so the player knows to click the canvas.
  try { controls.lock(); } catch (e) {}
  setTimeout(() => {
    if (!controls.isLocked && (state === 'playing' || state === 'roundIntro')
        && !isLocallyDowned() && isInActiveMatch()) {
      showMpUnlockHint();
    }
  }, 250);
};

// If the MP refocus hint is up when we go down, hide it — the red
// DOWNED overlay should be the only thing on screen. The downed
// overlay is larger than the hint and the hint would peek out above it.
window.__onMpDownedStart = () => {
  hideMpUnlockHint();
  // Cancel any in-progress knife swing so the knife mesh doesn't stay
  // floating on the screen through the downed overlay. Without this,
  // knifing a zombie the same frame you go down leaves the knife
  // lunging in mid-air until the downed player is revived.
  knifeAnimTimer = 0;
  knifeCooldown = 0;
  if (knifeModel) {
    knifeModel.visible = false;
    knifeModel.position.set(0, 0, 0);
    knifeModel.rotation.set(0, 0, 0);
  }
};

function clearAllTimedPerks() {
  for (const p of perks) {
    if (p.permanent) continue; // Health & other permanent perks survive a down
    if (player.perksOwned[p.id] > 0) {
      player.perksOwned[p.id] = 0;
      try { p.unapply(); } catch (e) {}
    }
  }
  player._instaKill = false; player._instaKillTimer = 0;
  player._doublePoints = false; player._doublePointsTimer = 0;
  player.shieldHits = 0;
}

// Collision radius for zombies so they don't visually clip walls when
// their center is a few pixels from the tile edge.
const ZOMBIE_RADIUS = 0.6;

// Axis-aware walkability: returns true only if (x,z) AND the point
// `radius` past it in each movement direction are all open. Used so
// zombies stop before their body clips into a wall.
function _zombieCanOccupy(x, z, mx, mz, radius) {
  if (mapAt(x, z) !== 0) return false;
  const rx = mx !== 0 ? radius * Math.sign(mx) : 0;
  const rz = mz !== 0 ? radius * Math.sign(mz) : 0;
  if (rx && mapAt(x + rx, z) !== 0) return false;
  if (rz && mapAt(x, z + rz) !== 0) return false;
  return true;
}

// Step along the line from (x1,z1) to (x2,z2) in TILE/2 increments,
// returning false if any step hits a wall. Used before teleport/snap
// to avoid clipping through walls.
function _lineIsClear(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return mapAt(x2, z2) === 0;
  const steps = Math.max(1, Math.ceil(d / (TILE * 0.5)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t, z = z1 + dz * t;
    if (mapAt(x, z) !== 0) return false;
  }
  return true;
}

// Build the list of player-target positions for spawn distance checks.
// Host camera + every remote player so zombies don't spawn on top of
// any lobby member.
// Brown dust + plank fragments that puff out from a window the moment
// its last plank falls. Caller supplies the window ref. Particles go a
// little above floor height (0.05) and burst slightly outward toward
// the player side of the window so it draws the eye inside the bunker.
function _spawnBreachDust(w) {
  const inwardX = -w.normalX;
  const inwardZ = -w.normalZ;
  // Two clusters: one IN the window plane (chunky planks), one a half-
  // tile inside (wispy dust trailing in).
  spawnDirtParticles(w.centerX, w.centerZ, 14);
  spawnDirtParticles(
    w.centerX + inwardX * TILE * 0.4,
    w.centerZ + inwardZ * TILE * 0.4,
    8
  );
}

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
// Which sealed zone is this tile in? Returns 'west' | 'east' | null.
// Zombies must not spawn inside a sealed zone before its door is opened.
function _tileZone(tx, tz) {
  // West wing: tiles enclosed by the sealed inner-room walls.
  // Columns 1-8, rows 1-9 (row 9 is the bottom window row of the west
  // bunker — cell=3 tiles that are inside the sealed zone).
  if (tx >= 1 && tx <= 8 && tz >= 1 && tz <= 9) return 'west';
  // East chamber: columns 20-22, rows 11-18, sealed behind the east door.
  if (tx >= 20 && tx <= 22 && tz >= 11 && tz <= 18) return 'east';
  return null;
}

function _findRandomSpawnTile(opts) {
  const targets = _spawnTargets();
  const minDist = TILE * (opts && opts.minTiles != null ? opts.minTiles : 3);
  const maxDist = TILE * (opts && opts.maxTiles != null ? opts.maxTiles : 9);
  for (let attempt = 0; attempt < 40; attempt++) {
    const tx = Math.floor(Math.random() * MAP_W);
    const tz = Math.floor(Math.random() * MAP_H);
    const wx = tx * TILE + TILE * 0.5;
    const wz = tz * TILE + TILE * 0.5;
    if (mapAt(wx, wz) !== 0) continue;
    // Reject tiles inside a sealed zone whose door hasn't been opened.
    const zone = _tileZone(tx, tz);
    if (zone) {
      const door = doors.find(d => d.id === zone);
      if (!door || !door.opened) continue;
    }
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
  // CoD-Zombies feel: zombies should overwhelmingly come from the
  // boarded-up windows so the player sees planks shake and shatter
  // as the horde claws in. Random-tile spawning is the fallback path
  // for cases where windows can't be used:
  //  - Boss zombies always use the random tile path (a boss should
  //    not get bottlenecked on planks).
  //  - The VERY LAST zombie of any round uses random tile spawn so
  //    a slow plank-break can't strand the round-end condition.
  //  - All windows are saturated (each has hit the per-window
  //    attacker cap) — overflow falls back to random tiles.
  //  - All windows have already been fully breached (no planks left
  //    anywhere) — at that point there's nothing dramatic to break,
  //    so random spawns keep variety up.
  const PER_WINDOW_ATTACKER_CAP = 4;
  let targetWindow = null;
  let pick = null;
  const _isBossSpawn = round % 5 === 0 && zSpawned === zToSpawn - 1;
  const _isVeryLastSpawn = (zToSpawn - zSpawned) <= 1;
  // VERY-LAST-SPAWN PRIORITY: bypass the normal pickers entirely and
  // place the final zombie at the closest window's INSIDE-bunker
  // position so the player engages within ~1 second of it spawning.
  // Previous behavior routed it through random-tile + walked it in
  // from up to 14 tiles away — that's the "waiting for the last
  // zombie" complaint.
  if (_isVeryLastSpawn && windows.length > 0 && !_isBossSpawn) {
    const targets = _spawnTargets();
    let best = null, bestD = Infinity;
    // Only consider windows that don't lead into a locked zone.
    const eligibleWindows = windows.filter(w => {
      if (!w.doorId) return true;
      const d = doors.find(dd => dd.id === w.doorId);
      return d && d.opened;
    });
    for (const w of eligibleWindows) {
      let nearest = Infinity;
      for (const t of targets) {
        const d = Math.hypot(w.centerX - t.x, w.centerZ - t.z);
        if (d < nearest) nearest = d;
      }
      if (nearest < bestD) { bestD = nearest; best = w; }
    }
    if (best) {
      pick = {
        wx: best.centerX - best.normalX * TILE * 1.6,
        wz: best.centerZ - best.normalZ * TILE * 1.6,
      };
      targetWindow = null; // appears INSIDE — no plank choreography
    }
  }
  if (!pick && windows.length > 0 && !_isBossSpawn && !_isVeryLastSpawn) {
    // Prefer windows that still have planks AND aren't dogpiled. Among
    // candidates, BIAS toward windows close to a player so the horde
    // visibly crashes through whichever boards the squad is defending.
    // Score = attackerCount * 8 + tilesToNearestPlayer; lower is better.
    // Adding 8x weight on attackers keeps a single window from getting
    // monopolized even when the player camps right next to it.
    const candidateWindows = windows.filter(w => {
      // Exclude windows that feed into a locked zone (e.g. east wall windows
      // e-12 / e-14 lead directly into the east wing — if that door is closed
      // a zombie spawned there is immediately trapped and can never reach the player).
      if (w.doorId) {
        const d = doors.find(dd => dd.id === w.doorId);
        if (!d || !d.opened) return false;
      }
      return intactPlanks(w) > 0 && w.attackers.length < PER_WINDOW_ATTACKER_CAP;
    });
    if (candidateWindows.length > 0) {
      const targets = _spawnTargets();
      const scored = candidateWindows.map(w => {
        let nearest = Infinity;
        for (const t of targets) {
          const dx = w.centerX - t.x, dz = w.centerZ - t.z;
          const d = Math.hypot(dx, dz) / TILE; // distance in tiles
          if (d < nearest) nearest = d;
        }
        // A small jitter (±0.5) breaks ties without making selection
        // feel deterministic when multiple windows are equidistant.
        const score = w.attackers.length * 8 + nearest + (Math.random() - 0.5);
        return { w, score };
      });
      scored.sort((a, b) => a.score - b.score);
      targetWindow = scored[0].w;
      const pos = outsideSpawnPosition(targetWindow);
      if (pos) pick = { wx: pos.x, wz: pos.z };
    }
  }
  // M4: truly random spawn locations across the whole accessible
  // floor. Falls back to the hardcoded spawnPts list if the random
  // picker can't find a suitable tile after 40 tries (rare — usually
  // happens only when the player is in a tiny sealed area).
  if (!pick) pick = _findRandomSpawnTile();
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
    if (candidates.length) {
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
  }
  // GUARANTEED-SPAWN FALLBACKS — without these, a player camped in a
  // sealed area can stall the round forever because both the random
  // tile picker and the spawnPts list returned nothing. Try, in
  // order: any window's inside-bunker position, then ANY open tile
  // on the map. zSpawned is only incremented if we actually push a
  // zombie below, so the round-end check is never stranded by a
  // silent return.
  if (!pick && windows.length > 0) {
    // Pick any window — even fully-breached or dogpiled — but NEVER
    // a window that leads into a locked zone (those would trap the zombie).
    const eligibleFallbackWindows = windows.filter(w => {
      if (!w.doorId) return true;
      const d = doors.find(dd => dd.id === w.doorId);
      return d && d.opened;
    });
    const fallbackPool = eligibleFallbackWindows.length > 0 ? eligibleFallbackWindows : [];
    if (fallbackPool.length === 0) { /* fall through to tile scan below */ }
    const w = fallbackPool.length > 0 ? fallbackPool[Math.floor(Math.random() * fallbackPool.length)] : null;
    if (!w) { /* no eligible windows — skip to tile scan */ }
    else
    pick = {
      wx: w.centerX - w.normalX * TILE * 1.6,
      wz: w.centerZ - w.normalZ * TILE * 1.6,
    };
    targetWindow = null; // already inside, don't queue plank-breaks
  }
  if (!pick) {
    // Absolute last resort: scan the map for any walkable tile far
    // enough from every player. CRITICAL: must reject tiles inside a
    // sealed zone whose door is closed — otherwise the spawned zombie
    // is unreachable and the round never ends ("last zombie behind
    // east wing" bug). Falls through to ANY open accessible tile if
    // no far-enough one exists.
    const minDist = TILE * 2;
    const targets = _spawnTargets();
    const scan = [];
    for (let tz = 1; tz < MAP_H - 1; tz++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        const wx = tx * TILE + TILE * 0.5;
        const wz = tz * TILE + TILE * 0.5;
        if (mapAt(wx, wz) !== 0) continue;
        // Skip sealed-area tiles whose containing door isn't opened.
        const zone = _tileZone(tx, tz);
        if (zone) {
          const door = doors.find(d => d.id === zone);
          if (!door || !door.opened) continue;
        }
        let nearest = Infinity;
        for (const t of targets) {
          const d = Math.hypot(wx - t.x, wz - t.z);
          if (d < nearest) nearest = d;
        }
        scan.push({ wx, wz, d: nearest });
      }
    }
    if (scan.length) {
      const farEnough = scan.filter(s => s.d >= minDist);
      const pool = farEnough.length ? farEnough : scan;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  if (!pick) {
    // True dead end — nothing walkable on the entire map. Bail
    // without incrementing zSpawned so the next tick retries; the
    // global watchdog will eventually teleport survivors anyway.
    return;
  }
  
  const tier = getDifficultyTier();
  const tierMult = 1 + tier * 0.5;
  let hp = Math.floor((50 + round * 20) * tierMult);
  let baseSpd = 50 + Math.min(round * 5, 90) + Math.random() * 20;
  let spd = (baseSpd + tier * 15) / 14;
  let dmg = Math.floor((10 + round * 3) * (1 + tier * 0.3));
  
  let isBoss = false, isElite = false;
  // Per-5-round boss tier. bossTier = 0 at round 5 (the first boss
  // round), 1 at round 10, 2 at round 15, etc. Used below to scale
  // BOTH the HP mult and the speed mult so late-game bosses are
  // meaningfully tougher without regressing the round-5 feel. The
  // slope per tier is: HP +7× per tier (was +5×), speed +0.035 per
  // tier on top of the 0.7 base (capped at 0.88 so a hard speed cap
  // below keeps the player's sprint always faster — see boss cap).
  const bossTier = Math.max(0, Math.floor((round - 5) / 5));
  if (round % 5 === 0 && zSpawned === zToSpawn - 1) {
    isBoss = true;
    const bossHpMult = 12 + bossTier * 7;
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
  if (isBoss) {
    // Boss speed mult scales with the bossTier computed above. Round 5
    // keeps the original 0.7 (unchanged feel for the first boss).
    // Each tier adds 0.035, capped at 0.88 so phase-3 (×1.5) plus the
    // hard cap below never let the boss outrun a sprinting player.
    speedMult = Math.min(0.88, 0.7 + bossTier * 0.035);
    hasLimp = false;
  }
  if (isElite) { speedMult = 1.15 + Math.random() * 0.2; hasLimp = false; }
  // FINAL 2 zombies of a round always sprint — no slow-shamble or
  // limp roll. They appear close to the player AND close the gap
  // fast so the player engages immediately instead of standing
  // around. Applies to both the very-last spawn AND the
  // second-to-last (anything with remaining ≤ 2).
  const _isFinalTwoSpawn = (zToSpawn - zSpawned) <= 2;
  if (_isFinalTwoSpawn && !isBoss) {
    speedMult = 1.15 + Math.random() * 0.2;
    hasLimp = false;
  }
  spd *= speedMult;
  // Hard cap: no non-boss zombie may exceed 95% of player sprint speed
  // (player.speed * SPRINT_MULT * 0.95 ≈ 11 u/s). This guarantees a
  // player who's actively sprinting can always out-distance any single
  // zombie even on late rounds — otherwise the tier + fast-branch +
  // final-two stack can produce 14-16+ u/s zombies that outrun sprint.
  if (!isBoss) {
    const ZOMBIE_MAX_SPEED = player.speed * SPRINT_MULT * 0.95;
    spd = Math.min(spd, ZOMBIE_MAX_SPEED);
  } else {
    // Boss cap — with tier scaling bosses can now reach speedMult 0.88,
    // and phase 3 additionally multiplies by 1.5, so a raw-cap check
    // is needed to keep the sprint-outrun guarantee. Cap the stored
    // base speed at 60% of player sprint (~6.96 u/s). Phase-3 max then
    // lands at ~10.44 u/s — safely below the 11.02 u/s sprint speed so
    // a player fleeing with Shift held can always open the gap.
    const BOSS_BASE_MAX = player.speed * SPRINT_MULT * 0.60;
    spd = Math.min(spd, BOSS_BASE_MAX);
  }

  const _aiSpeedMult = isBoss ? 0.7 : (0.85 + Math.random() * 0.3);
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
    _spawnRising: false, // set true by createZombieMesh; safe default for early access
    stuckCheck: null,
    _speedMult: _aiSpeedMult,
    _staggerSeed: (Math.random() - 0.5) * 0.3,
    _lunging: false,
    _lungeTimer: 0,
    _lungeWindup: false,
    _lungeCooldown: 0,
    // Window AI — set if spawned outside a barricaded window. Zombie
    // walks to the window, breaks planks one by one, then walks inside
    // and clears _targetWindow to switch to normal chase AI.
    _targetWindow: targetWindow,
    _atWindow: false,
    _plankBreakTimer: 1.2 + Math.random() * 0.6,
  };
  if (targetWindow) targetWindow.attackers.push(z);
  // S4.2: Boss phase properties
  if (isBoss) {
    z._bossPhase = 1;
    z._bossBaseSpd = z.spd;
    z._groundPoundTimer = 5 + Math.random() * 3; // 5-8s initial delay
    z._groundPounding = false;
    z._groundPoundPause = 0;
    z._zigzagTimer = 0;
    z._zigzagDir = 1;
  }

  const offX = (Math.random()-0.5)*1.5;
  const offZ = (Math.random()-0.5)*1.5;
  if (mapAt(z.wx + offX, z.wz + offZ) === 0) { z.wx += offX; z.wz += offZ; }
  else if (mapAt(z.wx + offX, z.wz) === 0) { z.wx += offX; }
  else if (mapAt(z.wx, z.wz + offZ) === 0) { z.wz += offZ; }
  zombies.push(z);
  zSpawned++;
  createZombieMesh(z);

  // Spawn emergence effects — dirt burst + underground rumble sound
  // Throttle: max one sound per 200ms to avoid audio node explosion on mass spawns
  const _now = performance.now();
  if (!spawnZombie._lastSfx || _now - spawnZombie._lastSfx > 200) {
    sfxZombieSpawn();
    spawnZombie._lastSfx = _now;
  }
  spawnDirtParticles(z.wx, z.wz);

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
  showRoundBanner,
  addFloatText,
  triggerScreenShake,
  openDoorLocal: (door) => openDoorLocal(door),
  // Match lifecycle callbacks — invoked when GameState.status flips.
  // Defined lower in main.js as _onMatchStarted / _onMatchEnded; wrap
  // so the closures see the fresh definitions at call time.
  onMatchStarted: () => { if (typeof _onMatchStarted === 'function') _onMatchStarted(); },
  onMatchEnded: () => { if (typeof _onMatchEnded === 'function') _onMatchEnded(); },
  // Power-up MP wiring
  spawnPowerUpMesh, removePowerUpMesh, applyPowerUpType,
  onKillFromMain,
  // Host migration callback — fires when the lobby host changes.
  // Surfaces the auto-rejoin overlay + announces the new host.
  onHostChanged: (prevHex, newHex, becameHost, lostHost) => {
    try { _onHostChanged(prevHex, newHex, becameHost, lostHost); } catch (e) {}
  },
});



// ===== INPUT =====
const gameKeys = ['w','a','s','d','r','e','q','f','shift','1','2','3','4'];
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
  // Skip intro cinematic on any key (after small grace to prevent
  // accidental-skip from menu clicks lingering)
  if (isIntroActive() && getIntroTimer() > 0.2) { endIntro(); return; }
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
    // Don't show any overlay while locally downed — the downed overlay
    // is already on screen.
    if (isLocallyDowned()) return;
    if ((state === 'playing' || state === 'roundIntro') && !paused && !_startingGame) {
      // SINGLE PLAYER: real pause. Game freezes, full overlay shown.
      // MULTIPLAYER: NO pause — the world is shared and the server keeps
      // ticking even if you walk away. Show a small unobtrusive
      // "click to refocus" hint instead so the player can re-engage
      // without obscuring gameplay (or dying behind a fake pause screen).
      if (isInActiveMatch()) {
        showMpUnlockHint();
      } else {
        paused = true;
        showPause();
      }
    }
  } else {
    // Pointer just got locked — hide the MP unlock hint if it was up.
    hideMpUnlockHint();
  }
});
renderer.domElement.addEventListener('click', () => {
  // While downed, a click shouldn't resume the game (can't self-revive),
  // but it SHOULD re-lock the pointer if the player alt-tabbed out and
  // came back. Without this, you'd come back to a downed screen with a
  // free cursor and no way to look around while waiting for a revive.
  if (isLocallyDowned()) {
    if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
    return;
  }
  // Clicks during the intro cinematic skip it (after small grace)
  if (isIntroActive() && getIntroTimer() > 0.2) { endIntro(); return; }
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
document.getElementById('pauseOverlay').addEventListener('click', (e) => {
  if (isLocallyDowned()) return;
  // Buttons inside the overlay handle their own logic and stop
  // propagation; this listener fires for clicks on empty space and
  // resumes the game (single-player only — MP doesn't pause).
  if (e.target && (e.target.id === 'pauseEndRunBtn' || e.target.id === 'pauseMainMenuBtn')) return;
  if ((state === 'playing' || state === 'roundIntro')) {
    paused = false; hidePause();
    controls.lock();
  }
});

// SP pause menu: END RUN — bring up the death/game-over screen with
// current stats. Score still gets submitted to the leaderboard since
// showDeath() handles that.
document.getElementById('pauseEndRunBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state !== 'playing' && state !== 'roundIntro') return;
  paused = false; hidePause();
  player.hp = 0;
  state = 'dead';
  try { sfxPlayerDeath(); } catch (err) {}
  try { controls.unlock(); } catch (err) {}
  setTimeout(showDeath, 600);
});

// SP pause menu: MAIN MENU — abandon the run, return to title screen.
// Resets game state cleanly so a follow-up ENLIST starts fresh.
document.getElementById('pauseMainMenuBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state !== 'playing' && state !== 'roundIntro') return;
  paused = false; hidePause();
  // Reset state so the next ENLIST starts a clean run
  state = 'menu';
  try { controls.unlock(); } catch (err) {}
  // Drop active zombies + restore the menu scene
  zombies.forEach(z => { try { removeZombieMesh(z); } catch (err) {} });
  zombies.length = 0;
  // Hide the HUD, restore the menu blocker
  document.getElementById('hud')?.classList.add('hidden');
  const blocker = document.getElementById('blocker');
  if (blocker) {
    blocker.classList.remove('hidden');
    blocker.style.opacity = '1';
  }
  // If the death screen replaced blocker.innerHTML earlier, the menu
  // panel reference is stale. Easiest reliable path: full reload to a
  // fresh menu state. UX-wise this is identical to clicking "MAIN MENU"
  // in any console game.
  setTimeout(() => { window.location.reload(); }, 100);
});

// ===== MP "click to refocus" hint =====
// Small, non-blocking element shown when the cursor is unlocked during
// multiplayer gameplay. Replaces the full pause overlay (MP can't pause
// because the server keeps simulating). Click anywhere on the canvas
// to relock the cursor.
let _mpHintEl = null;
function showMpUnlockHint() {
  if (!_mpHintEl) {
    _mpHintEl = document.createElement('div');
    _mpHintEl.id = 'mpUnlockHint';
    _mpHintEl.style.cssText = `
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      z-index:48;pointer-events:none;
      background:rgba(0,0,0,0.78);border:1px solid #4af;border-radius:4px;
      padding:8px 18px;font:bold 12px monospace;color:#cfe9ff;
      letter-spacing:2px;text-shadow:0 0 6px rgba(68,170,255,0.6);
      box-shadow:0 0 14px rgba(68,170,255,0.25)`;
    _mpHintEl.innerHTML = '⚠ MULTIPLAYER — game still running &nbsp;·&nbsp; CLICK TO REFOCUS';
    document.body.appendChild(_mpHintEl);
  }
  _mpHintEl.style.display = 'block';
}
function hideMpUnlockHint() {
  if (_mpHintEl) _mpHintEl.style.display = 'none';
}

// ===== HOST MIGRATION OVERLAY =====
// Surfaces during the gap between the previous host going silent and
// the server reassigning hostIdentity to a non-host's claim_host call.
// Hidden the moment _onHostChanged fires (migration completed).
let _hostMigrationEl = null;
function _ensureHostMigrationEl() {
  if (_hostMigrationEl) return _hostMigrationEl;
  _hostMigrationEl = document.createElement('div');
  _hostMigrationEl.id = 'hostMigrationOverlay';
  _hostMigrationEl.style.cssText = `
    position:fixed;left:50%;top:30%;transform:translateX(-50%);
    z-index:55;pointer-events:none;display:none;
    background:rgba(20,8,8,0.92);border:2px solid #c00;border-radius:6px;
    padding:14px 26px;font:bold 14px monospace;color:#fcc;
    letter-spacing:2px;text-shadow:0 0 8px rgba(255,80,80,0.7);
    box-shadow:0 0 24px rgba(200,40,40,0.45);text-align:center;min-width:280px`;
  _hostMigrationEl.innerHTML =
    '⚠ HOST DISCONNECTED ⚠<br/>' +
    '<span style="font-size:11px;color:#fa8;letter-spacing:1.5px;">finding new host…</span>';
  document.body.appendChild(_hostMigrationEl);
  return _hostMigrationEl;
}
function showHostMigrationOverlay() { _ensureHostMigrationEl().style.display = 'block'; }
function hideHostMigrationOverlay() { if (_hostMigrationEl) _hostMigrationEl.style.display = 'none'; }

// Threshold (seconds since last hostHeartbeat) before we consider the
// host disconnected and surface the auto-rejoin overlay. Server-side
// timeout is 10s — we show UI a couple seconds earlier so the player
// has feedback before the reassignment actually happens.
const HOST_STALE_UI_THRESHOLD_SEC = 6;
function _tickHostMigrationUI() {
  // Only relevant during an active MP match where we're not the host
  // and not downed (downed overlay covers the screen).
  if (!isInActiveMatch() || netcode.isHost() || isLocallyDowned()
      || (state !== 'playing' && state !== 'roundIntro')) {
    hideHostMigrationOverlay();
    return;
  }
  const stale = netcode.getHostStaleSec();
  if (stale > HOST_STALE_UI_THRESHOLD_SEC && stale < Infinity) {
    showHostMigrationOverlay();
  } else {
    hideHostMigrationOverlay();
  }
}

// Called by hostSync when the lobby's hostIdentity changes. Hide the
// disconnect overlay immediately + announce the new host. Zombie
// ownership flip already happened inline in hostSync before this.
function _onHostChanged(prevHex, newHex, becameHost, lostHost) {
  hideHostMigrationOverlay();
  if (becameHost) {
    addFloatText('YOU ARE NOW THE HOST', '#fc8', 3);
  } else if (newHex) {
    const name = netcode.getPlayerNameByHex(newHex);
    if (name) addFloatText(`${name.toUpperCase()} IS NOW THE HOST`, '#fca', 2.5);
    else addFloatText('NEW HOST ELECTED', '#fca', 2);
  }
  if (lostHost) {
    // We were host but got reassigned — usually because our connection
    // glitched. No special UI; the AI authority flip already happened
    // and gameplay continues from the new host's stream.
  }
}

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
  // Joystick release handler — also wired to touchcancel so the knob
  // recenters if the OS interrupts the touch (phone call, system modal).
  const joystickRelease = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === jTouch) {
        jTouch = null; joystickX = 0; joystickY = 0;
        jKnob.style.transform = 'translate(-50%,-50%)';
      }
    }
  };
  document.getElementById('joystickArea').addEventListener('touchend', joystickRelease);
  document.getElementById('joystickArea').addEventListener('touchcancel', joystickRelease);

  document.getElementById('fireBtn').addEventListener('touchstart', e => { e.preventDefault(); mobileFiring = true; initAudio(); startBackgroundMusic(); });
  // Fire release — also touchcancel so a system interruption doesn't
  // leave the fire button latched and the player auto-shooting forever.
  const fireRelease = e => { e.preventDefault(); mobileFiring = false; };
  document.getElementById('fireBtn').addEventListener('touchend', fireRelease);
  document.getElementById('fireBtn').addEventListener('touchcancel', fireRelease);
  document.getElementById('reloadBtn').addEventListener('touchstart', e => { e.preventDefault(); doReload(); });
  document.getElementById('buyBtn').addEventListener('touchstart', e => {
    e.preventDefault();
    // Downed players are on the ground — buying is disabled until revived
    if (isLocallyDowned()) return;
    tryBuy();
  });
  // Mobile revive button — hold to fill the revive bar (touch
  // equivalent of holding E on desktop). reviveMp.js reads this via
  // window._mobileReviveHeld through the keys-shim getter installed
  // in initReviveMp ctx. Show/hide is driven from reviveMp.js's per-
  // frame check (sets display:flex when a downed teammate is in range).
  const _reviveBtn = document.getElementById('reviveBtn');
  if (_reviveBtn) {
    const holdOn  = e => { e.preventDefault(); window._mobileReviveHeld = true; };
    const holdOff = e => { e.preventDefault(); window._mobileReviveHeld = false; };
    _reviveBtn.addEventListener('touchstart', holdOn);
    _reviveBtn.addEventListener('touchend', holdOff);
    _reviveBtn.addEventListener('touchcancel', holdOff);
    // Mouse fallback (helpful for browser dev / desktop touch testing)
    _reviveBtn.addEventListener('mousedown', holdOn);
    _reviveBtn.addEventListener('mouseup', holdOff);
    _reviveBtn.addEventListener('mouseleave', holdOff);
  }
  
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
  // Same intro-desync gate — no knifing during the cinematic even if
  // the render loop has somehow drifted off state='intro' while the
  // overlay is still up.
  if (isIntroActive()) return;
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
    if (z._spawnRising) continue; // invulnerable while emerging from ground
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
    const mpActive = isInActiveMatch();
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
          try { recordKnifeKill(); } catch(e) {}
          const basePts = bestZ.isBoss ? 500 : bestZ.isElite ? 120 : 60;
          const pts = player._doublePoints ? basePts * 2 : basePts;
          points += pts;
          sfxKill();
          onKillFromMain(bestZ.isBoss);
          showHitmarker(true);
          spawnDmgNumber(bestZ.wx, 2.2, bestZ.wz, dmg, true);
          // S4.2: Boss death — double blood particles
          spawnBloodParticles(bestZ.wx, 1, bestZ.wz, bestZ.isBoss ? 16 : 8);
          const c = bestZ.isBoss ? '#f44' : bestZ.isElite ? '#ff8' : '#fc0';
          addFloatText(bestZ.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, bestZ.isBoss ? 2.5 : 1);
          startZombieDeathAnim(bestZ);
          spawnBloodSplatter(bestZ.wx, 1.2, bestZ.wz);
          spawnPowerUp(bestZ.wx, bestZ.wz);
          triggerScreenShake(bestZ.isBoss ? 1.5 : bestZ.isElite ? 0.5 : 0.15, 8);
          if (bestZ._targetWindow && bestZ._targetWindow.attackers) {
            const ai = bestZ._targetWindow.attackers.indexOf(bestZ);
            if (ai >= 0) bestZ._targetWindow.attackers.splice(ai, 1);
          }
          removeZombieMesh(bestZ);
          zombies.splice(idx, 1);
          _lastZombieDeathTime = performance.now();
          if (bestZ.isBoss) {
            sfxBossKill();
            // S4.2: Longer, more intense screen shake on boss death
            triggerScreenShake(4, 4);
            spawnDirtParticles(bestZ.wx, bestZ.wz, 16);
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
    // Pass dt + the live keys map so spectator camera can smooth the
    // follow lerp and let A/D cycle through teammates while watching.
    if (tickSpectator(dt, keys)) {
      return;
    }
    tickRevive(dt);
  }

  if (state === 'roundIntro') {
    roundIntroTimer -= dt;
    if (roundIntroTimer <= 0) state = 'playing';
  }

  if (state !== 'playing' && state !== 'roundIntro') return;

  // Buying, weapon switching, reloading, and movement work during both
  // playing and roundIntro so players can purchase between rounds.
  // When MP-downed (_iAmDowned) the player can still crawl + shoot
  // pistol so they're not a sitting duck waiting for a revive.
  if (_iAmDowned) {
    // Downed crawl (MP last stand): slow movement, camera dropped,
    // weapon locked to pistol. Player can still shoot + reload while
    // they wait for a teammate to revive them.
    updateMovement(dt);
    if (player.curWeapon !== 0) player.curWeapon = 0;
    camera.position.y += (DOWNED_CAM_Y - camera.position.y) * Math.min(1, dt * 6);
    // Tick fire timer + reload timer so the pistol actually cycles
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    if (player.reloading) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) finishReload();
    }
    if (keyPressed('r')) doReload();
    const isFiringDown = mouseDown || mobileFiring;
    // Same intro-desync gate as the standing fire path above.
    if (isFiringDown && state === 'playing' && !isIntroActive()) {
      const wD = weapons[0];
      if (wD.auto) tryShoot(); else { if (!player._lastFiring) tryShoot(); }
    }
    player._lastFiring = isFiringDown;
    playerLight.position.set(camera.position.x, 0.6, camera.position.z);
  } else if (!_iAmDowned) {
    updateMovement(dt);

    if (keyPressed('1') && player.owned[0]) { _quickSwapWeapon = player.curWeapon; switchWeapon(0); }
    if (keyPressed('2') && player.owned[1]) { _quickSwapWeapon = player.curWeapon; switchWeapon(1); }
    if (keyPressed('3') && player.owned[2]) { _quickSwapWeapon = player.curWeapon; switchWeapon(2); }
    if (keyPressed('4') && player.owned[3]) { _quickSwapWeapon = player.curWeapon; switchWeapon(3); }
    if (keyPressed('q') && player.owned[_quickSwapWeapon]) { const prev = player.curWeapon; switchWeapon(_quickSwapWeapon); _quickSwapWeapon = prev; }
    if (keyPressed('r')) doReload();
    if (keyPressed('e')) tryBuy();
    if (keyPressed('f')) tryKnife();

    if (player.reloading) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) finishReload();
    }
  }

  // Combat and active-round systems only run during 'playing'
  if (state === 'roundIntro') return;

  // Player-action block — skipped when downed. The host still runs the
  // zombie sim + wave advance below, so zombies and other players
  // continue to act even though the host can't move/shoot.
  if (!_iAmDowned) {
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    playerLight.position.set(camera.position.x, 0.6, camera.position.z);

    if (player.hpRegen && player.hp < player.maxHp && player.hp > 0) {
      player.hpRegenTimer += dt;
      if (player.hpRegenTimer >= 2) { player.hp = Math.min(player.hp + 5, player.maxHp); player.hpRegenTimer = 0; }
    }

    // Perk expiration timers — permanent perks skip decrement
    for (const perk of perks) {
      if (perk.permanent) continue;
      if (player.perksOwned[perk.id] > 0) {
        const prevTime = player.perksOwned[perk.id];
        player.perksOwned[perk.id] -= dt;
        const curTime = player.perksOwned[perk.id];
        // 15-second warning: one downward beep + amber flash on pill
        if (prevTime > 15 && curTime <= 15) {
          beep(440, 'sine', 0.25, 0.12);
          beep(330, 'sine', 0.25, 0.10);
          addFloatText(`${perk.name} FADING…`, '#fa0', 2.0);
        }
        // 5-second warning: rapid double beep
        if (prevTime > 5 && curTime <= 5) {
          beep(520, 'sine', 0.12, 0.10);
          setTimeout(() => beep(520, 'sine', 0.12, 0.10), 150);
        }
        if (player.perksOwned[perk.id] <= 0) {
          player.perksOwned[perk.id] = 0;
          perk.unapply();
          addFloatText(`${perk.name} EXPIRED!`, '#888', 2.5);
          beep(300, 'sine', 0.15, 0.08);
          beep(200, 'sine', 0.15, 0.08);
        }
      }
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
    // Double gate — state === 'playing' AND intro not active. The
    // render loop's state=='intro' early-return already blocks this
    // path in the normal flow, but if the intro overlay is still up
    // from a desync (see desync-guard in animate loop) we still
    // shouldn't fire bullets. Same check on the downed-crawl fire
    // path below.
    if (isFiring && state === 'playing' && !isIntroActive()) {
      if (w.auto) { tryShoot(); }
      else { if (!player._lastFiring) tryShoot(); }
    }
    player._lastFiring = isFiring;
  }
  
  // Multiplayer authority check. In MP, only the host runs the zombie
  // spawn loop, AI, collision, and wave progression. Non-hosts mirror the
  // Zombie table from the server via subscription callbacks (see below).
  // IMPORTANT: "MP active" means we're actually in a multiplayer match
  // (connected AND in a lobby), not just connected to the server. The
  // death screen auto-connects to submit scores, which would otherwise
  // flip every subsequent SP run into MP mode (chat HUD appears, host
  // checks fail, etc.). See isInActiveMatch() for the canonical test.
  const _mpActive = isInActiveMatch();
  const _isHostOrSP = !_mpActive || netcode.isHost();

  if (_isHostOrSP && zSpawned < zToSpawn) {
    spawnTimer -= dt;
    const remaining = zToSpawn - zSpawned;
    // When only 1-2 zombies left to spawn, ignore the maxAlive cap and
    // use a short cooldown. Otherwise players can wait 10+ seconds for
    // the final zombie to appear if earlier ones are still alive,
    // which feels like the game is broken.
    const isFinalSpawn = remaining <= 2;
    const isVeryLast = remaining <= 1;
    // PRESSURE BOOST: if there are zero zombies alive AND we still
    // owe spawns to the round, fire IMMEDIATELY (override the
    // spawn timer). Previously the player would stand around for up
    // to 2.5s with nothing happening — that's the "waiting for the
    // last zombie" complaint. Combined with the close-to-player
    // spawn pick in spawnZombie() (see _isVeryLastSpawn branch), the
    // last zombie now appears within ~half a second of the previous
    // kill and arrives close enough to engage immediately.
    const noneAlive = zombies.length === 0;
    if (noneAlive) spawnTimer = 0;
    const canSpawn = isFinalSpawn || zombies.length < maxAlive;
    if (spawnTimer <= 0 && canSpawn) {
      const beforeSpawned = zSpawned;
      profBegin('spawnZombie'); try { spawnZombie(); } finally { profEnd(); }
      const baseRate = Math.max(0.5, 2.5 - round * 0.12);
      // Very last spawn gets a near-instant retry cadence (0.25s) so
      // even if the first attempt silently bailed (no walkable tile),
      // the round doesn't stall waiting on the next regular tick.
      // Other final-2 spawns cap at 0.6s to keep the wave snappy.
      if (isVeryLast) {
        if (zSpawned > beforeSpawned) {
          _veryLastSpawnFailCount = 0;
          spawnTimer = 0.25;
        } else {
          // Silent fail on very last spawn — retry quickly.
          // spawnZombie() respects all door/zone guards so a silent fail
          // means the map had no valid tile this frame — just retry.
          spawnTimer = 0.15;
        }
      } else {
        spawnTimer = isFinalSpawn ? Math.min(baseRate, 0.6) : baseRate;
      }
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
  // Detect a CHANGE in the target roster (someone went down, was
  // revived, joined, left, etc.) and force every zombie to re-pick
  // its target on the next frame. Without this, a zombie that was
  // mid-chase on the now-downed player keeps walking toward their
  // old position for up to a full second (the re-pick timer cap),
  // which the player perceives as "zombies are stuck on me even
  // though I'm down". The roster size is a cheap proxy — we don't
  // need a deep diff because any roster change should re-pick.
  if (_isHostOrSP && _mpActive) {
    const rosterKey = targets.length;
    if (_prevTargetsCount !== rosterKey) {
      _prevTargetsCount = rosterKey;
      for (const z of zombies) z._targetPickTimer = 0;
    }
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.flash = Math.max(0, z.flash - dt * 5);

    // Skip movement + attack while zombie is still emerging from the ground
    // Init stall probe BEFORE continue so watchdog tracks rising zombies
    if (!z._stallProbe) {
      z._stallProbe = { x: z.wx, z: z.wz, sinceMs: performance.now() };
    }
    if (z._spawnRising) { updateZombieMesh(z, dt); continue; }

    // === CLIMB-THROUGH TWEEN (just after a window breach) ===
    // 0.55s lerped vault from the window plane to the inside-bunker
    // landing tile, with a sine-wave y-arc so it reads as a clamber.
    // Position is driven by the tween — chase + window AI are skipped
    // for this frame so they can't override z.wx / z.wz mid-vault.
    if (z._climbing) {
      z._climbing.t += dt;
      const p = Math.min(1, z._climbing.t / z._climbing.dur);
      const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
      z.wx = z._climbing.startX + (z._climbing.endX - z._climbing.startX) * ease;
      z.wz = z._climbing.startZ + (z._climbing.endZ - z._climbing.startZ) * ease;
      // Force render position to match wx/wz so the smoothing lerp in
      // updateZombieMesh doesn't lag behind the tween.
      z._renderX = z.wx; z._renderZ = z.wz;
      // Sine-wave vault arc — 0 at start/end, ~0.55 at midpoint.
      z._climbYOff = Math.sin(p * Math.PI) * 0.55;
      if (p >= 1) {
        z._climbing = null;
        z._climbYOff = 0;
      }
      updateZombieMesh(z, dt);
      continue;
    }

    // === WINDOW AI (zombies targeting a barricaded window) ===
    // This runs on host/SP only — non-host clients get authoritative
    // positions via netcode and don't simulate zombie behavior.
    if (_isHostOrSP && z._targetWindow) {
      profBegin('ai:window');
      const w = z._targetWindow;
      // CRITICAL ROUND END SHORTCUT: if all spawns are done and ≤2
      // zombies remain, ANY zombie still trudging toward a window or
      // pounding planks gets promoted: planks instantly cleared,
      // zombie hard-warped to the inside-bunker landing position,
      // straight into chase AI. Eliminates the worst-case round-1
      // wait where slow window-spawn zombies are the last few alive.
      if (zSpawned >= zToSpawn && zombies.length <= 2) {
        while (intactPlanks(w) > 0) breakNextPlank(w);
        z.wx = w.centerX - w.normalX * TILE * 1.6;
        z.wz = w.centerZ - w.normalZ * TILE * 1.6;
        const ai = w.attackers.indexOf(z);
        if (ai >= 0) w.attackers.splice(ai, 1);
        z._targetWindow = null;
        z._atWindow = false;
        // Boost speed so they reach the player promptly
        z._speedMult = Math.max(z._speedMult || 1, 1.3);
        // Reset render lerp so the warp doesn't show a slide
        z._renderX = z.wx; z._renderZ = z.wz;
        updateZombieMesh(z, dt);
        // Match the profBegin('ai:window') above before we `continue`
        // — otherwise the profiler's section stack leaks one entry
        // per shortcut hit per frame (no-op when profiler disabled).
        profEnd();
        continue;
      }
      // If the window has been fully breached (no planks left), stop
      // targeting it — teleport the zombie a couple tiles INSIDE the
      // bunker so they're in walkable space (the window tile itself
      // is still mapAt=1 / wall) and clear their window state.
      if (intactPlanks(w) === 0) {
        // Start a 0.5s climb-through tween instead of hard-teleporting.
        // The zombie arcs from its current position (at the window) to a
        // tile-and-a-half inside the bunker, with a sine-wave rise so it
        // looks like it's vaulting the sill. _climbYOff drives the mesh
        // y-lift in updateZombieMesh; while _climbing is set, the rest
        // of the AI is suspended (handled in the per-frame branch above).
        z._climbing = {
          startX: z.wx, startZ: z.wz,
          endX: w.centerX - w.normalX * TILE * 1.6,
          endZ: w.centerZ - w.normalZ * TILE * 1.6,
          t: 0, dur: 0.55,
        };
        const atkIdx = w.attackers.indexOf(z);
        if (atkIdx >= 0) w.attackers.splice(atkIdx, 1);
        z._targetWindow = null;
        z._atWindow = false;
        // Soft thud as they crash through the breach. Rate-limited
        // to one thud per ~250ms across all zombies so simultaneous
        // breaches don't pile audio nodes during chaotic moments.
        const _now = performance.now();
        if (!_lastBreachThud || _now - _lastBreachThud > 250) {
          try { beep(110, 'sawtooth', 0.25, 0.2); } catch (e) {}
          _lastBreachThud = _now;
        }
        updateZombieMesh(z, dt);
        profEnd();
        continue;
      } else {
        // Otherwise move toward the window center (outside face) until
        // we're at the window, then start breaking planks.
        // END-OF-ROUND PRESSURE: when all spawns are done and the round
        // is on its tail end (≤2 alive), boost the walk-to-window speed
        // 4x. Slow zombies on round 1 otherwise take 8+ seconds JUST to
        // reach the window before they even start breaking planks —
        // that's the "still waiting on level 1" complaint.
        const _endOfRoundPressure = (zSpawned >= zToSpawn) && (zombies.length <= 2);
        const dx = w.centerX - z.wx;
        const dz = w.centerZ - z.wz;
        const d = Math.hypot(dx, dz);
        if (d > 1.4) {
          // Walk toward the window's outside face. Use zombie's own
          // speed + stagger so this matches the normal movement feel.
          let step = z.spd * dt * (z._speedMult || 1);
          if (_endOfRoundPressure) step *= 4;
          z.wx += (dx / d) * step;
          z.wz += (dz / d) * step;
          z._atWindow = false;
        } else {
          // We're at the window — beat a plank off every N seconds,
          // scaling slightly with round so late-game windows fall faster
          // First time this zombie touches the window — announce it
          // with a low, attention-grabbing BANG so the player knows
          // which board is under attack. Only the very first attacker
          // on an otherwise-quiet window plays this; later attackers
          // joining the same dogpile would just spam the audio mix.
          if (!z._atWindow && (w.attackers.length <= 1)) {
            // Rate-limit the bang to once per 700ms across all windows
            // — multiple zombies arriving at different windows in the
            // same frame would otherwise stack 9 audio nodes.
            const _now = performance.now();
            if (_now - _lastBreachBang > 700) {
              try {
                beep(70, 'sawtooth', 0.55, 0.35);
                setTimeout(() => beep(45, 'square', 0.4, 0.25), 40);
                setTimeout(() => beep(180, 'sawtooth', 0.25, 0.08), 90);
              } catch (e) {}
              triggerScreenShake(0.5, 5);
              _lastBreachBang = _now;
            }
          }
          z._atWindow = true;
          z._atWindowTime = (z._atWindowTime || 0) + dt;
          z._plankBreakTimer -= dt;
          // SAFETY NET: if this zombie is one of the last 3 alive AND all
          // outstanding spawns are done, force-accelerate plank breaking so
          // the round can end. Prevents 'stuck zombie' hangs reported on r1.
          // Also: once *anyone* has been at this window > 12s (which would
          // only happen if SFX/timer logic broke), force-clear regardless.
          const _allSpawned = zSpawned >= zToSpawn;
          const _lastFew = zombies.length <= 3;
          // ≤2 alive at end of round → smash planks IMMEDIATELY (no
          // 2.5s wait). Player is standing around with nothing to
          // shoot, get the zombie inside NOW.
          const _critical = _allSpawned && zombies.length <= 2;
          if (_critical || (_allSpawned && _lastFew && z._atWindowTime > 2.5) || z._atWindowTime > 12) {
            // Rage mode: smash a plank every frame until clear
            const brokenIdx = breakNextPlank(w);
            if (brokenIdx >= 0) {
              try { beep(180, 'sawtooth', 0.35, 0.09); } catch (e) {}
              if (intactPlanks(w) === 0) _spawnBreachDust(w);
            }
          } else if (z._plankBreakTimer <= 0) {
            const brokenIdx = breakNextPlank(w);
            if (brokenIdx >= 0) {
              // Sharp wood-crack SFX via beep stack
              try {
                beep(180, 'sawtooth', 0.35, 0.09);
                setTimeout(() => beep(90, 'square', 0.2, 0.08), 30);
              } catch (e) {}
              triggerScreenShake(0.3, 6);
              // BREACH! When the last plank falls, kick out a thicker
              // brown dust burst at the window so the player can see
              // (and hear, via the climb-through thud) where the horde
              // just got in. Cheap re-use of spawnDirtParticles.
              if (intactPlanks(w) === 0) _spawnBreachDust(w);
            }
            z._plankBreakTimer = Math.max(0.8, 1.8 - round * 0.05) + Math.random() * 0.3;
          }
        }
      }
      // Still let the zombie mesh animate + take the usual per-frame
      // cleanup path. Skip the rest of the AI (boss phases, chase, etc.)
      updateZombieMesh(z, dt);
      profEnd();
      continue;
    }

    profBegin('ai:chase');
    // === S4.2: BOSS HEALTH PHASES ===
    if (z.isBoss && _isHostOrSP) {
      const hpRatio = z.hp / z.maxHp;
      const prevPhase = z._bossPhase || 1;
      if (hpRatio > 0.6) z._bossPhase = 1;
      else if (hpRatio > 0.3) z._bossPhase = 2;
      else z._bossPhase = 3;

      // Apply phase speed multipliers (relative to boss base speed)
      if (z._bossPhase === 2) {
        z.spd = z._bossBaseSpd * 1.3;
      } else if (z._bossPhase === 3) {
        z.spd = z._bossBaseSpd * 1.5;
      } else {
        z.spd = z._bossBaseSpd;
      }

      // Ground pound attack (Phase 2+)
      if (z._bossPhase >= 2) {
        if (z._groundPounding) {
          z._groundPoundPause -= dt;
          if (z._groundPoundPause <= 0) {
            z._groundPounding = false;
            // Trigger ground pound effects
            triggerScreenShake(3, 12);
            spawnDirtParticles(z.wx, z.wz, 20);
            sfxBossGroundPound();
            // Damage player if within 4 units
            const gpDx = camera.position.x - z.wx;
            const gpDz = camera.position.z - z.wz;
            const gpDist = Math.hypot(gpDx, gpDz);
            if (gpDist < 4 && state === 'playing' && !_iAmDowned && !hasReviveGrace()) {
              player.hp -= 15;
              sfxHurt();
              triggerDamageVignette(15);
              triggerHitIndicator(z.wx, z.wz);
              if (player.hp <= 0) {
                player.hp = 0;
                clearAllTimedPerks();
                incrementLocalDowns();
                if (!onLocalHpZero()) {
                  state = 'dead';
                  sfxPlayerDeath();
                  controls.unlock();
                  // 400ms (was 1000ms) — gives the death sound a beat
                  // to land but doesn't leave the player staring at a
                  // frozen scene. Inner blocker reveal in showDeath
                  // is now 300ms with a 1.5s watchdog fallback so the
                  // player ALWAYS sees a tappable FIGHT AGAIN button.
                  setTimeout(showDeath, 400);
                }
              }
            }
            z._groundPoundTimer = 5 + Math.random() * 3; // reset 5-8s
          }
        } else {
          z._groundPoundTimer -= dt;
          if (z._groundPoundTimer <= 0) {
            z._groundPounding = true;
            z._groundPoundPause = 0.5; // pause before slam
          }
        }
      }

      // Phase 3: erratic zigzag movement
      if (z._bossPhase >= 3) {
        z._zigzagTimer -= dt;
        if (z._zigzagTimer <= 0) {
          z._zigzagDir *= -1;
          z._zigzagTimer = 0.3 + Math.random() * 0.4;
        }
      }
    }

    // Local distance — used by the attack check, extrapolation, and some
    // FX. Always the local camera, because each client applies attacks to
    // its own player. Computed BEFORE the remote-lerp block so the
    // extrapolation below has valid values (fixes TDZ crash on non-host).
    const localDx = camera.position.x - z.wx;
    const localDz = camera.position.z - z.wz;
    const localD = Math.hypot(localDx, localDz);

    // Non-host zombies (server-driven) smoothly track their target wx/wz
    // toward the last-received server position. Lerp factor 15 gives
    // snappy catch-up (~65ms). Also extrapolate using the delta between
    // consecutive server updates so zombies keep moving between ticks
    // instead of freezing until the next subscription event arrives.
    //
    // IMPORTANT: we do NOT gate this on _zombieCanOccupy. The host is
    // authoritative for the zombie's position — it intentionally places
    // zombies at window cells (which have mapAt=1) while they pound
    // planks, then teleports them inside the bunker on breach, and the
    // watchdog may warp far away. Requiring a walkable map cell here
    // would freeze the remote client's zombie any time the host's
    // position lands on a wall tile, which produced the "MP zombie
    // stuck / glitched" reports. Trust the host.
    if (z._remote && z._targetWx !== undefined) {
      const gap = z._targetWx - z.wx;
      const gapZ = z._targetWz - z.wz;
      const gapD = Math.hypot(gap, gapZ);
      if (gapD > TILE * 3) {
        // Large gap — authoritative snap. Skip the line-clear gate
        // (a window-breach / watchdog-warp legitimately crosses a
        // wall in map terms, and refusing the snap stranded the
        // zombie at its last lerp position forever).
        z.wx = z._targetWx;
        z.wz = z._targetWz;
      } else {
        const lerp = Math.min(1, dt * 15);
        z.wx += gap * lerp;
        z.wz += gapZ * lerp;
        // Extrapolation between server ticks — keeps zombies
        // moving smoothly in the 50ms between 20Hz syncs when
        // they're near-locked on target. Guarded by localD > 1.5
        // so we don't extrapolate onto the player when they're
        // right on top.
        if (gapD < 0.5 && localD > 1.5 && z.spd > 0) {
          const ex = (localDx / localD) * z.spd * dt * 0.5;
          const ez = (localDz / localD) * z.spd * dt * 0.5;
          z.wx += ex;
          z.wz += ez;
        }
      }
    }

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

    // Track alive time for ALL zombies (host, SP, and remote)
    if (!z._aliveTimer) z._aliveTimer = 0;
    z._aliveTimer += dt;

    // S4.1: Lunge timer tick — runs even if d <= 1.5 so the lunge completes
    if (z._lungeWindup) {
      z._lungeTimer -= dt;
      if (z._lungeTimer <= 0) {
        z._lungeWindup = false;
        z._lunging = true;
        z._lungeTimer = 0.3;
      }
    } else if (z._lunging) {
      z._lungeTimer -= dt;
      if (z._lungeTimer <= 0) {
        z._lunging = false;
        z._lungeCooldown = 2;
      }
    }
    if (z._lungeCooldown > 0) z._lungeCooldown -= dt;

    if (_isHostOrSP && d > 1.5) {
      let curSpd = z.spd * (z._speedMult || 1);
      if (z._hasLimp) {
        z._limpPhase += dt * (3 + z._limpSeverity * 2);
        const limpFactor = 1 - z._limpSeverity * (0.5 + 0.5 * Math.sin(z._limpPhase));
        curSpd = z._baseSpd * (z._speedMult || 1) * Math.max(0.1, limpFactor);
      }
      if (z._lunging) curSpd *= 2;
      else if (z._lungeWindup) curSpd = 0;

      // S4.2: Boss ground pound pause — freeze movement during windup
      if (z.isBoss && z._groundPounding) { curSpd = 0; }

      // S4.1: Stagger approach — add a perpendicular offset based on per-zombie seed
      let stagger = z._staggerSeed || 0;
      // S4.2: Boss Phase 3 erratic zigzag — add strong perpendicular offset
      if (z.isBoss && z._bossPhase >= 3) {
        stagger += z._zigzagDir * 0.6;
      }
      const dirX = dx / d, dirZ = dz / d;
      const perpDirX = -dirZ, perpDirZ = dirX;
      let mx = (dirX + perpDirX * stagger) * curSpd * dt;
      let mz = (dirZ + perpDirZ * stagger) * curSpd * dt;

      // S4.1: Horde separation — boid-like repulsion, squared distance to skip sqrt
      const sepThreshSq = 9;
      for (const oz of zombies) {
        if (oz === z) continue;
        const sx = z.wx - oz.wx, sz = z.wz - oz.wz;
        const sdSq = sx * sx + sz * sz;
        if (sdSq >= sepThreshSq || sdSq < 0.0001) continue;
        const invD = 1 / Math.sqrt(sdSq);
        mx += sx * invD * 0.03 * dt * 60;
        mz += sz * invD * 0.03 * dt * 60;
      }

      const nx = z.wx + mx, nz = z.wz + mz;
      let movedX = false, movedZ = false;
      // Include the zombie's body radius so they stop before clipping walls
      if (_zombieCanOccupy(nx, z.wz, mx, 0, ZOMBIE_RADIUS)) { z.wx = nx; movedX = true; }
      if (_zombieCanOccupy(z.wx, nz, 0, mz, ZOMBIE_RADIUS)) { z.wz = nz; movedZ = true; }
      if (!movedX && !movedZ) {
        const perpX = (-dz / d) * z.spd * dt * 0.7;
        const perpZ = (dx / d) * z.spd * dt * 0.7;
        if (_zombieCanOccupy(z.wx + perpX, z.wz, perpX, 0, ZOMBIE_RADIUS)) { z.wx += perpX; movedX = true; }
        else if (_zombieCanOccupy(z.wx - perpX, z.wz, -perpX, 0, ZOMBIE_RADIUS)) { z.wx -= perpX; movedX = true; }
        if (_zombieCanOccupy(z.wx, z.wz + perpZ, 0, perpZ, ZOMBIE_RADIUS)) { z.wz += perpZ; movedZ = true; }
        else if (_zombieCanOccupy(z.wx, z.wz - perpZ, 0, -perpZ, ZOMBIE_RADIUS)) { z.wz -= perpZ; movedZ = true; }
      }

      // Stuck detection — nudge zombie toward player when it hasn't
      // moved. Never auto-kill; just keep teleporting it closer.
      if (!z.stuckCheck) z.stuckCheck = { x: z.wx, z: z.wz, timer: 0, totalStuck: 0 };
      z.stuckCheck.timer += dt;
      if (z.stuckCheck.timer >= 2) {
        const stuckDist = Math.hypot(z.wx - z.stuckCheck.x, z.wz - z.stuckCheck.z);
        if (stuckDist < TILE * 0.3) {
          z.stuckCheck.totalStuck += z.stuckCheck.timer;
          // Nudge toward player to break free — but only if the destination
          // is reachable WITHOUT clipping through a wall. Without the line
          // check, a zombie against a wall would tunnel straight through.
          const nudgeStr = TILE * (z.stuckCheck.totalStuck > 8 ? 1.5 : 1.0);
          const tryNudge = (ox, oz) => {
            const tx = z.wx + ox, tz = z.wz + oz;
            if (mapAt(tx, tz) !== 0) return false;
            if (!_lineIsClear(z.wx, z.wz, tx, tz)) return false;
            z.wx = tx; z.wz = tz; return true;
          };
          const nudgeX = (dx / d) * nudgeStr;
          const nudgeZ = (dz / d) * nudgeStr;
          if (!tryNudge(nudgeX, nudgeZ)) {
            if (!tryNudge(nudgeX, 0)) {
              if (!tryNudge(0, nudgeZ)) {
                const perpX = (-dz / d) * nudgeStr;
                const perpZ = (dx / d) * nudgeStr;
                if (!tryNudge(perpX, perpZ)) tryNudge(-perpX, -perpZ);
              }
            }
          }
        } else { z.stuckCheck.totalStuck = 0; }
        z.stuckCheck.x = z.wx;
        z.stuckCheck.z = z.wz;
        z.stuckCheck.timer = 0;
      }
    }
    
    // Zombie shuffle footstep — proximity-gated, distance-scaled volume
    if (!z._spawnRising && d < 18) {
      if (!z._stepTimer) z._stepTimer = Math.random() * 0.5; // stagger on spawn
      z._stepTimer -= dt;
      if (z._stepTimer <= 0) {
        const distFrac = Math.min(d / 18, 1);
        sfxZombieShuffle(distFrac);
        // Step interval: ~0.45s close, ~0.7s far, randomised ±15%
        z._stepTimer = (0.45 + distFrac * 0.25) * (0.85 + Math.random() * 0.3);
      }
    }

    // S2.6: Zombie idle ambient groan — periodic low-vol moans from nearby zombies
    if (!z._spawnRising && d < 18) {
      if (!z._idleTimer) z._idleTimer = 3 + Math.random() * 6; // stagger on spawn
      z._idleTimer -= dt;
      if (z._idleTimer <= 0) {
        sfxZombieIdle(z.wx, z.wz, camera.position.x, camera.position.z);
        // Interval: 4–10s, further zombies groan less often
        const distFrac = Math.min(d / 18, 1);
        z._idleTimer = (4 + distFrac * 4) * (0.8 + Math.random() * 0.4);
      }
    }

    // S4.1: Lunge trigger — when within 2-3 units, chance to initiate a speed burst
    if (_isHostOrSP && localD > 1.8 && localD < 3 && !z._lunging && !z._lungeWindup && z._lungeCooldown <= 0) {
      const lungeChance = z.isBoss ? 0.6 : 0.3;
      if (Math.random() < lungeChance * dt) {
        z._lungeWindup = true;
        z._lungeTimer = 0.15;
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
        // Juggernog shield absorbs a hit without costing HP
        if (player.shieldHits > 0) {
          player.shieldHits--;
          sfxHurt();
          sfxZombieAttack();
          triggerScreenShake(0.5, 6);
          triggerHitIndicator(z.wx, z.wz);
          addFloatText(player.shieldHits > 0 ? `SHIELD (${player.shieldHits})` : 'SHIELD BROKEN', '#ff6', 1.2);
          // Visual: shield absorb flash
          const _sf = document.getElementById('shieldFlash');
          if (_sf) {
            _sf.className = '';
            void _sf.offsetWidth; // reflow to restart animation
            _sf.className = player.shieldHits === 0 ? 'broken' : 'pulse';
          }
          // When all shield hits consumed, clear Juggernog timer too
          if (player.shieldHits === 0) {
            const jugg = perks.find(p => p.id === 'juggernog');
            if (jugg && player.perksOwned['juggernog'] > 0) {
              player.perksOwned['juggernog'] = 0;
              jugg.unapply();
            }
          }
          z.atkTimer = 1;
          profEnd();
          continue;
        }
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
          clearAllTimedPerks();
          // MP: onLocalHpZero() enters the downed/crawl state so
          // teammates can revive. Returns true when it took over.
          // Scoreboard tally — count a down whether we're going into the
          // MP downed state or the SP game-over screen.
          incrementLocalDowns();
          if (onLocalHpZero()) {
            // Prepare MP last-stand crawl: remember what gun we had so
            // we can restore it on revive, then force-equip the pistol.
            mpDownedPrevWeapon = player.curWeapon;
            weaponMags[player.curWeapon] = player.mag;
            player.curWeapon = 0;
            player.mag = weapons[0].mag;
            player.ammo[0] = weapons[0].maxAmmo;
            player.reloading = false;
            player.reloadTimer = 0;
            player.fireTimer = 0;
            player.sprinting = false;
            profEnd();
            break;
          }
          // SP: instant death, no self-revive (no one to revive you).
          state = 'dead';
          sfxPlayerDeath();
          controls.unlock();
          // 400ms (was 1000ms) — see the matching path above; the
          // showDeath() call now self-recovers via watchdog if its
          // fancy render misbehaves on mobile.
          setTimeout(showDeath, 400);
          profEnd();
          break;
        }
      }
    }

    updateZombieMesh(z, dt);
    profEnd();
  }

  profBegin('eyeLights'); try { updateZombieEyeLightPool(zombies); } finally { profEnd(); }

  profBegin('particles'); try { updateParticles(dt); } finally { profEnd(); }
  updateAtmosphere(dt);
  
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
  
  // ── STUCK-ZOMBIE WATCHDOG (per-zombie staleness) ────────────────────
  // Watchdog only acts on zombies that demonstrably aren't moving — NOT
  // on a global "no-kill" timer (that approach culled actively-pursued
  // zombies if the player took >12s between kills). Each frame we
  // record where each zombie was; if a zombie hasn't moved more than
  // half a tile in 25 seconds AND it's the round's tail end (all
  // spawned, ≤3 alive), we escalate ONLY that zombie:
  //
  //   T+25s on z : RAGE — clear planks if window zombie / teleport
  //                non-window zombie near a player + speed boost.
  //   T+40s on z : WARP — hard-teleport into a tile within 6 of player.
  //   T+60s on z : CULL — remove that one zombie, credit player.
  //
  // The thresholds are deliberately huge — any zombie that's actively
  // chasing or breaking planks resets its own staleness clock every
  // frame and never trips the watchdog.
  for (const z of zombies) {
    if (!z._stallProbe) {
      z._stallProbe = { x: z.wx, z: z.wz, sinceMs: performance.now() };
    } else {
      const moved = Math.hypot(z.wx - z._stallProbe.x, z.wz - z._stallProbe.z);
      if (moved > TILE * 0.5) {
        z._stallProbe.x = z.wx;
        z._stallProbe.z = z.wz;
        z._stallProbe.sinceMs = performance.now();
      }
    }
  }
  if (_isHostOrSP && zSpawned >= zToSpawn && zombies.length > 0 && zombies.length <= 3) {
    // Find the most-stale zombie. If it's been still long enough,
    // escalate. We only act on ONE zombie per frame so a casual
    // player isn't punished by mass culls.
    let stalest = null, stalestSinceMs = performance.now();
    for (const z of zombies) {
      if (z._stallProbe && z._stallProbe.sinceMs < stalestSinceMs) {
        stalest = z;
        stalestSinceMs = z._stallProbe.sinceMs;
      }
    }
    // Skip if the stalest zombie is still rising from the ground — it
    // physically can't move yet and shouldn't trip the stuck-zombie alarm.
    if (stalest && stalest._spawnRising) {
      // It's rising — not actually stuck. Just wait.
    } else {
    const _stallMs = stalest ? (performance.now() - stalestSinceMs) : 0;
    const _isLastStandingZombie = zombies.length === 1 && zSpawned >= zToSpawn;
    const _stallThreshMult = _isLastStandingZombie ? 0.3 : 1.0;
    // 0.3x: rage@7.5s, warp@12s, cull@18s — fast-tracks the final lone zombie
    const _runRage = stalest && _stallMs > 25000 * _stallThreshMult && _stallMs <= 40000 * _stallThreshMult;
    const _runWarp = stalest && _stallMs > 40000 * _stallThreshMult && _stallMs <= 60000 * _stallThreshMult;
    const _runCull = stalest && _stallMs > 60000 * _stallThreshMult;
    if (_runRage || _runWarp || _runCull) {
      // Pick a tile near the player to teleport stuck zombies onto.
      // Used by RAGE (for non-window zombies) and WARP (for everyone).
      const _findTeleTile = (radiusTiles) => {
        for (let attempt = 0; attempt < 30; attempt++) {
          const ang = Math.random() * Math.PI * 2;
          const r = TILE * (2 + Math.random() * radiusTiles);
          const tx = camera.position.x + Math.cos(ang) * r;
          const tz = camera.position.z + Math.sin(ang) * r;
          if (mapAt(tx, tz) === 0) {
            const mx = Math.floor(tx / TILE), mz = Math.floor(tz / TILE);
            const zone = _tileZone(mx, mz);
            if (zone) {
              const door = doors.find(d => d.id === zone);
              if (!door || !door.opened) continue;
            }
            return { x: tx, z: tz };
          }
        }
        return null;
      };
      // Operate on the single stalest zombie, not the whole array.
      const z = stalest;
      const idx = zombies.indexOf(z);
      if (_runCull && idx >= 0) {
        totalKills++;
        onKillFromMain(z.isBoss);
        const basePts = z.isBoss ? 500 : (z.isElite ? 120 : 60);
        points += basePts;
        if (z.isBoss) {
          try { sfxBossKill(); } catch (e) {}
          try { triggerScreenShake(4, 4); } catch (e) {}
          try { spawnDirtParticles(z.wx, z.wz, 16); } catch (e) {}
          try { spawnPowerUp(z.wx, z.wz); } catch (e) {}
        }
        if (z._targetWindow && z._targetWindow.attackers) {
          const ai = z._targetWindow.attackers.indexOf(z);
          if (ai >= 0) z._targetWindow.attackers.splice(ai, 1);
        }
        try { removeZombieMesh(z); } catch (e) {}
        zombies.splice(idx, 1);
        if (netcode.isConnected() && netcode.isHost()) {
          try { netcode.callRemoveZombie(z.hostZid); } catch (e) {}
        }
      } else if (_runWarp) {
        const tile = _findTeleTile(6);
        if (tile) { z.wx = tile.x; z.wz = tile.z; }
        if (z._targetWindow) {
          const ai = z._targetWindow.attackers.indexOf(z);
          if (ai >= 0) z._targetWindow.attackers.splice(ai, 1);
          z._targetWindow = null;
          z._atWindow = false;
        }
        z._speedMult = Math.max(z._speedMult || 1, 1.6);
        z.stuckCheck = null;
        z._stallProbe = { x: z.wx, z: z.wz, sinceMs: performance.now() };
      } else {
        // RAGE
        if (z._targetWindow) {
          const w = z._targetWindow;
          while (intactPlanks(w) > 0) breakNextPlank(w);
          z.wx = w.centerX - w.normalX * TILE * 1.6;
          z.wz = w.centerZ - w.normalZ * TILE * 1.6;
          const ai = w.attackers.indexOf(z);
          if (ai >= 0) w.attackers.splice(ai, 1);
          z._targetWindow = null;
          z._atWindow = false;
        } else {
          const tile = _findTeleTile(6); // tighter radius so zombie can't land in unreachable area
          if (tile) { z.wx = tile.x; z.wz = tile.z; }
        }
        z._speedMult = Math.max(z._speedMult || 1, 1.4);
        z.stuckCheck = null;
        z._stallProbe = { x: z.wx, z: z.wz, sinceMs: performance.now() };
      }
    }
    } // end !_spawnRising guard
  }

  // (90s force-clear removed — fix spawn-behind-doors instead)
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

// Sprint tuning — kept conservative so it never turns the game into a foot race
const SPRINT_MULT = 1.45;      // 1.45x walk speed (~11.6 units/s)
const SPRINT_BOB_RATE = 15;    // walk is 10, sprint bob is snappier
const WALK_BOB_RATE = 10;
const SPRINT_FOV = 82;         // walk FOV is 75; subtle widen for speed feel
const WALK_FOV = 75;
const FOV_LERP_RATE = 6;

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

  // --- Sprint: Shift + forward movement (CoD-style) ---
  // Only forward sprint allowed (not backwards), not while reloading,
  // not while knifing. Keyboard-only for now; mobile keeps walk pace.
  const shiftHeld = !!keys['shift'];
  const movingForward = !isMobile && !!keys['w'] && !keys['s'];
  const canSprint = movingForward && shiftHeld && !player.reloading && !(knifeAnimTimer > 0);
  player.sprinting = !!canSprint;
  const speedMult = canSprint ? SPRINT_MULT : 1;

  // MP downed state: crawl speed, no sprint. Works the same for desktop
  // keyboard and mobile joystick since the multiplier is applied after
  // the direction vector is computed.
  let effectiveSpeedMult = speedMult;
  if (isLocallyDowned()) {
    effectiveSpeedMult = DOWNED_SPEED_MULT;
    player.sprinting = false;
  }

  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx = (mx / len) * player.speed * effectiveSpeedMult * dt;
    mz = (mz / len) * player.speed * effectiveSpeedMult * dt;
    const margin = 0.6;
    const nx = camera.position.x + mx;
    const nz = camera.position.z + mz;
    if (mapAt(nx + margin * Math.sign(mx), camera.position.z) === 0) camera.position.x = nx;
    if (mapAt(camera.position.x, nz + margin * Math.sign(mz)) === 0) camera.position.z = nz;
    const prevBobSin = Math.sin(player.bobPhase);
    player.bobPhase += dt * (canSprint ? SPRINT_BOB_RATE : WALK_BOB_RATE);
    // Fire footstep on each downward zero-crossing of sin(bobPhase) — one step per stride
    if (prevBobSin > 0 && Math.sin(player.bobPhase) <= 0) sfxFootstep();
  }

  if (!isMobile && !isLocallyDowned()) {
    // Bob amplitude slightly higher when sprinting for extra motion feel
    const bobAmp = canSprint ? 0.09 : 0.06;
    camera.position.y = 1.6 + Math.sin(player.bobPhase) * bobAmp;
    // Smoothly lerp FOV toward target — gives a subtle "speed lines" effect
    const targetFov = canSprint ? SPRINT_FOV : WALK_FOV;
    const fovLerp = Math.min(1, dt * FOV_LERP_RATE);
    camera.fov += (targetFov - camera.fov) * fovLerp;
    camera.updateProjectionMatrix();
  }
}

// ===== DEATH SCREEN =====
// Implementation in src/ui/deathScreen.js. initDeathScreen wires it
// here; showDeath / isDeathShown / resetDeathShown are re-imported at
// the top of main.js for use from the update loop and initGame().
initDeathScreen({ gameState, getLocalPlayerName });
// Hold-TAB scoreboard overlay — builds its DOM and input handlers here.
// getLocalStats is a thunk so we always read the live `points`, `round`,
// `totalKills` values (they're let-bound and mutate as the game runs).
initScoreboard({
  getLocalPlayerName,
  getLocalStats: () => ({ points, round, kills: totalKills }),
  netcode,
});
// ===== FLICKER LIGHTS =====
// Implementation lives in src/effects/flicker.js. initFlicker() seeds
// per-light state; updateFlicker(dt) runs once per frame from the main
// game loop below.
initFlicker({ lights });

// ===== MAIN GAME LOOP =====
let lastTime = performance.now();

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  profBeginFrame();

  // Multiplayer runs on the menu too so the connect button works
  // and the local transform keeps streaming even while paused.
  netcode.update(dt);
  netcode.setLocalTransform(camera.position.x, camera.position.z, controls._yaw);
  netcode.broadcastLocalWeapon(player.curWeapon | 0);
  profBegin('remotePlayers'); try { updateRemotePlayers(dt, netcode.getRemotePlayers()); } finally { profEnd(); }
  tickChat();
  // Surface the "host disconnected, finding new host…" overlay during
  // the gap between heartbeat lapse and server-side hostIdentity
  // reassignment. Hidden by _onHostChanged the moment migration lands.
  _tickHostMigrationUI();

  if (state === 'menu' || state === 'mpLobby') { profEndFrame(); return; }

  // Intro cinematic: camera-only path. Game logic + HUD disabled until
  // the 5-second dolly ends. Route through the post-processing stack
  // (bloom / vignette / grade / grain) so the intro matches the darker
  // in-game look — without it the intro looked brightly-lit and the
  // game suddenly went dim when play started, a jarring transition.
  if (state === 'intro') {
    updateIntro(dt);
    // Intro module sets _active=false when the dolly finishes; fall
    // through to normal rendering on the frame it hands off to nextRound().
    if (!isIntroActive() && state === 'intro') {
      // Safety: shouldn't happen (onEnd calls nextRound which sets
      // state), but if it does just render empty scene this frame.
    }
    profBegin('render'); try { renderPostProcessing(); } finally { profEnd(); }
    profEndFrame();
    return;
  }
  // DESYNC GUARD: if the intro overlay is still active (letterbox /
  // subtitle / skip hint visible, gun hidden) but state has drifted
  // off 'intro' — e.g. portal-resume + MP match-start raced, or a
  // previous intro somehow left `_active=true` — we'd end up running
  // full gameplay under the intro overlay (reported as "I'm in the
  // intro but shooting with no gun visible"). Force-end the intro so
  // the overlay clears and the gun comes back. Safe to call from any
  // state: endIntro() no-ops when _active is already false.
  if (isIntroActive() && state !== 'intro') {
    try { endIntro(); } catch (e) { console.warn('[intro] desync force-end failed', e); }
  }

  profBegin('update'); try { update(dt); } finally { profEnd(); }
  controls._applyRotation();
  updateCenterMsg(dt);
  updateRoundBanner(dt);
  // Always decay visual-only values (gun recoil, damage flash, muzzle light)
  // so they don't get stuck mid-animation when the update loop returns early
  // during roundIntro or other non-playing states.
  gunKick = Math.max(0, gunKick - dt * 6);
  dmgFlash = Math.max(0, dmgFlash - dt * 4);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 20);
  profBegin('gun'); try { updateGunModel(dt, gunKick); updatePaPCamo(); } finally { profEnd(); }
  updateFlicker(dt);
  updateHitmarker(dt);
  updateScreenShake(dt);
  updateMuzzleSparks(dt);
  updateTracers(dt);
  profBegin('dyingZombies'); try { updateDyingZombies(dt); } finally { profEnd(); }
  updateBloodDecals(dt);
  updateRoundTransition(dt);
  updateDamageVignette(dt);
  updateLowHealthEffect(dt, state);
  updateHitIndicators(dt);
  profBegin('atmosphere'); try { animateVibeJamPortals(dt, state); } finally { profEnd(); }
  if (!isDeathShown()) {
    profBegin('hud'); try { _updateHUD(dmgFlash, switchWeapon); } finally { profEnd(); }
    profBegin('minimap'); try { drawMinimap(); } finally { profEnd(); }
    drawFloatTexts(floatTexts);
  }
  
  const t = performance.now() / 1000;
  for (const po of perkMeshObjects) {
    const perk = perks[po.pm.perkIdx];
    const owned = player.perksOwned[perk.id];
    po.panel.material.emissiveIntensity = owned ? 0.15 : 0.4 + Math.sin(t * 2) * 0.2;
    po.light.intensity = owned ? 0.2 : 0.5 + Math.sin(t * 2 + 1) * 0.3;
  }
  
  profBegin('render'); try { renderPostProcessing(); } finally { profEnd(); }
  profEndFrame();
}

// ===== START =====
let _startingGame = false;
window._startGame = function() {
  if (_startingGame) return;
  _startingGame = true;
  paused = false;
  hidePause();

  // Show the black transition overlay BEFORE the heavy init work runs.
  // initGame() builds the map, props, windows, generators, perk machines,
  // mystery box, PaP and portals synchronously, and the first render
  // after that compiles shaders + uploads textures to the GPU. Without
  // the overlay painted first, the user sees a huge visible hitch; with
  // it, the hitch happens behind a black screen.
  const trans = document.getElementById('gameTransition');
  if (trans) {
    trans.style.transition = 'none';
    trans.classList.add('active');
    trans.style.opacity = '1';
  }

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

  // Blur any focused input (name field, join code, chat) so
  // isTextInputFocused() doesn't block WASD movement. This is critical
  // for MP where the lobby name/code input may still have focus.
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
    document.activeElement.blur();
  }
  // Clear any latched keys from pre-game typing
  for (const kk of Object.keys(keys)) keys[kk] = false;

  initAudio();
  startBackgroundMusic();

  // Wait two animation frames so the browser actually paints the black
  // overlay before we run the heavy work. rAF x2 is the reliable
  // pattern: the first rAF queues, the second fires after paint.
  // The entire warmup happens behind the fully-opaque transition
  // overlay so the user never sees the preload frames.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { initGame(); } catch (e) { console.error('initGame error:', e); }

    // ---- Shader warmup ----
    // initGame() has now set up the exact scene state the intro will
    // use (state = 'intro', camera at keyframe 0). Walk the camera
    // through every intro keyframe and render the FULL composer chain
    // a couple of times at each pose. Each unique camera pose can
    // force Three.js to compile new shader permutations; rendering
    // them all now — while the black overlay covers the screen — means
    // the intro's first live frames are already cached. Without this
    // the profiler shows 400–900ms spikes on the first ~4 frames of
    // the cinematic, 100% in post-processing render.
    try {
      const savedPos = camera.position.clone();
      const savedYaw = controls._yaw;
      const savedPitch = controls._pitch;
      const poses = INTRO_KEYFRAMES.concat([
        { x: 12 * TILE, y: 1.6, z: 12 * TILE, yaw: 0, pitch: 0 },
      ]);
      for (const p of poses) {
        camera.position.set(p.x, p.y, p.z);
        controls._yaw = p.yaw;
        controls._pitch = p.pitch;
        controls._applyRotation();
        // Two passes per keyframe: first triggers compile, second
        // exercises the cached program path.
        try { renderer.compile(scene, camera); } catch (e) {}
        try { renderPostProcessing(); } catch (e) {}
        try { renderPostProcessing(); } catch (e) {}
      }

      // Pre-warm gameplay-specific shaders: zombies + blood particles
      // only enter the scene once gameplay starts, so their materials
      // haven't been compiled yet by the keyframe passes above. Spawn
      // a throwaway zombie near the player, fire a blood burst and a
      // damage number on it, render a couple frames so every particle
      // / sprite program compiles, then clean it all up.
      try {
        const WARMUP_X = 12 * TILE + 2;
        const WARMUP_Z = 12 * TILE + 2;
        const warmZ = {
          hostZid: 0n,
          wx: WARMUP_X, wz: WARMUP_Z,
          hp: 1, maxHp: 1, spd: 0, dmg: 0,
          atkTimer: 1, flash: 0, radius: 0.8,
          isBoss: false, isElite: false,
          _animOffset: 0, _hasLimp: false, _limpPhase: 0, _limpSeverity: 0,
          _baseSpd: 0, _spawnRising: false, stuckCheck: null,
          _speedMult: 1, _staggerSeed: 0,
          _lunging: false, _lungeTimer: 0, _lungeWindup: false, _lungeCooldown: 0,
          _targetWindow: null, _atWindow: false, _plankBreakTimer: 0,
        };
        createZombieMesh(warmZ);
        // Position camera to actually see the warmup zombie.
        camera.position.set(WARMUP_X - 3, 1.6, WARMUP_Z);
        controls._yaw = Math.PI / 2;
        controls._pitch = 0;
        controls._applyRotation();
        try { spawnBloodParticles(WARMUP_X, 1.2, WARMUP_Z, 8); } catch (e) {}
        try { spawnDmgNumber(WARMUP_X, 1.8, WARMUP_Z, 100, false); } catch (e) {}
        try { renderer.compile(scene, camera); } catch (e) {}
        try { renderPostProcessing(); } catch (e) {}
        try { renderPostProcessing(); } catch (e) {}
        removeZombieMesh(warmZ);
      } catch (e) { console.warn('[warmup] entity warmup failed', e); }

      // Restore to intro keyframe 0 so the cinematic starts cleanly.
      camera.position.copy(savedPos);
      controls._yaw = savedYaw;
      controls._pitch = savedPitch;
      controls._applyRotation();
    } catch (e) { console.warn('[warmup] failed', e); }

    if (!isMobile) { controls.lock(); }

    // Wait one more paint frame so the first real intro frame renders
    // behind the still-opaque overlay too, then fade the overlay out.
    requestAnimationFrame(() => {
      if (trans) {
        trans.style.transition = 'opacity 0.35s ease-out';
        trans.classList.remove('active');
        trans.style.opacity = '0';
      }
      _startingGame = false;
    });
  }));
};

document.getElementById('startBtn').addEventListener('click', window._startGame);

// ===== NAME INPUT + GLOBAL LEADERBOARD (inside MULTIPLAYER screen) =====
(() => {
  const nameInput = document.getElementById('menuNameInput');
  if (nameInput) {
    nameInput.value = getLocalPlayerName();
    nameInput.addEventListener('change', () => setLocalPlayerName(nameInput.value));
    nameInput.addEventListener('blur', () => setLocalPlayerName(nameInput.value));
  }

  // Leaderboard lives in the MP menu panel now — main-menu rendering
  // was unreliable because netcode auto-connect from the idle menu
  // often never resolved. Users hit MULTIPLAYER → we connect in
  // response, then the board populates reliably.
  const mainLbWrap = document.getElementById('menuGlobalLb');
  if (mainLbWrap) mainLbWrap.style.display = 'none';

  const mpLbWrap = document.getElementById('mpMenuGlobalLb');
  const mpLbList = document.getElementById('mpMenuGlobalLbList');
  if (!mpLbWrap || !mpLbList) return;

  function escapeMenuHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderLb() {
    // Only show while the MP menu panel is actually on screen.
    const mpPanel = document.getElementById('mpMenuPanel');
    if (!mpPanel || getComputedStyle(mpPanel).display === 'none') {
      mpLbWrap.style.display = 'none';
      return;
    }
    mpLbWrap.style.display = 'block';
    const status = netcode.getStatus();
    if (!netcode.isConnected()) {
      const msg = (status === 'error' || status === 'disconnected')
        ? 'Leaderboard offline — try again later'
        : 'Connecting to global leaderboard…';
      mpLbList.innerHTML = `<div style="color:#555;text-align:center">${msg}</div>`;
      return;
    }
    const scores = netcode.getHighScores();
    if (!scores || scores.length === 0) {
      mpLbList.innerHTML = '<div style="color:#555;text-align:center">No scores yet — be the first to post one!</div>';
      return;
    }
    const top = scores.slice(0, 5);
    mpLbList.innerHTML = top.map((s, i) => {
      const rank = i + 1;
      const isSquad = typeof s.name === 'string' && s.name.includes(', ');
      const name = String(s.name || 'Anon').slice(0, 60);
      const nameColor = isSquad ? '#8fcfff' : '#fff';
      const prefix = isSquad ? '👥 ' : '';
      return `<div style="display:flex;gap:8px;align-items:baseline;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="color:#666;min-width:18px">${rank}.</span>
        <span style="color:${nameColor};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeMenuHtml(name)}">${prefix}${escapeMenuHtml(name)}</span>
        <span style="color:#fc0;min-width:32px;text-align:right">R${s.round}</span>
        <span style="color:#4af;min-width:42px;text-align:right">${s.points}</span>
        <span style="color:#8f8;min-width:32px;text-align:right">${s.kills}k</span>
      </div>`;
    }).join('');
  }

  netcode.setOnHighScoresChange(renderLb);
  netcode.onStatus(() => renderLb());

  // Expose so showMpMenuPanel() can re-render when the panel opens.
  window._refreshMpLeaderboard = renderLb;
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
  // Surface the global leaderboard now that the panel is visible.
  try { window._refreshMpLeaderboard?.(); } catch (e) {}
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
  // Make sure a stale open chat input from the lobby doesn't steal
  // keyboard focus into gameplay
  closeChatInput();
  if (typeof window._startGame === 'function') window._startGame();
  // Non-host clients reach _onMatchStarted via a netcode subscription
  // callback — NOT a user gesture — so the controls.lock() that
  // _startGame fires is silently rejected by the browser. Result: the
  // player can't rotate at the start of the round. Schedule a visible
  // "click to refocus" hint after the start animation settles so they
  // know to click the canvas to engage. The hint hides itself the
  // moment pointer lock actually takes (pointerlockchange handler).
  setTimeout(() => {
    if (!controls.isLocked && (state === 'playing' || state === 'roundIntro')
        && !isLocallyDowned() && isInActiveMatch()) {
      showMpUnlockHint();
    }
  }, 600);
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

  state = 'dead';
  paused = false;
  hidePause();
  hideMpUnlockHint();
  // Clear the downed flag so the next match doesn't start with a stale
  // prone overlay flashing for the first few frames.
  resetDownedState();
  // Release the mouse so the user can actually click the overlay
  // buttons. Without this the pointer stays locked to the canvas from
  // the moment the squad wipes, blocking PLAY AGAIN / BACK TO LOBBY.
  try { controls.unlock(); } catch (e) {}
  try { document.exitPointerLock(); } catch (e) {}
  zombies.forEach(z => removeZombieMesh(z));
  zombies.length = 0;
  points = 500; totalKills = 0; round = 0;
  zToSpawn = 0; zSpawned = 0; maxAlive = 0; spawnTimer = 0;
  document.getElementById('hud')?.classList.add('hidden');
  const downedOv = document.getElementById('downedOverlay');
  if (downedOv) downedOv.style.display = 'none';
  const specOv = document.getElementById('spectatorOverlay');
  if (specOv) specOv.style.display = 'none';
  // Clear the death veil so it doesn't darken the summary overlay
  document.getElementById('deathVeil').style.background = 'rgba(0,0,0,0)';
  const blocker = document.getElementById('blocker');
  if (blocker) {
    blocker.classList.add('hidden');
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
      position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.92);
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
      <h1 style="color:#c00;font-size:clamp(32px,6vw,56px);text-shadow:0 0 60px #c00,0 0 120px rgba(200,0,0,0.3);letter-spacing:6px;margin:0 0 6px">SQUAD WIPED</h1>
      <div style="color:#aaa;font-size:13px;letter-spacing:3px;margin-bottom:18px">SURVIVED ${endedRound} ROUND${endedRound!==1?'S':''}</div>
      <div style="display:flex;gap:28px;justify-content:center;flex-wrap:wrap;margin-bottom:18px">
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedRound}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">ROUND</div></div>
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedKills}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">KILLS</div></div>
        <div><div style="color:#fc0;font-size:28px;font-weight:bold">${endedPoints}</div><div style="font-size:10px;color:#aaa;letter-spacing:2px">POINTS</div></div>
      </div>
      <div style="border-top:1px solid #333;padding-top:12px;max-width:420px;width:100%">
        <div style="color:#4af;font-size:11px;letter-spacing:2px;margin-bottom:8px">🌐 GLOBAL LEADERBOARD</div>
        <div id="mpRunSummaryLb" style="font:12px monospace;line-height:1.8;color:#aaa;text-align:left;padding:0 20px">${globalHtml}</div>
      </div>
      <button id="mpRunSummaryPlayAgain" style="margin-top:22px;background:none;border:2px solid #c00;color:#c00;padding:12px 40px;font:bold 16px 'Courier New';cursor:pointer;letter-spacing:3px;transition:all 0.3s">PLAY SOLO</button>
      <br>
      <button id="mpRunSummaryContinue" style="margin-top:10px;background:none;border:2px solid #4af;color:#4af;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;transition:all 0.3s">REJOIN LOBBY</button>
      <br>
      <button id="mpRunSummaryShare" style="margin-top:10px;background:none;border:2px solid #1da1f2;color:#1da1f2;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;transition:all 0.3s">🐦 SHARE ON X</button>
    `;
    const playBtn = document.getElementById('mpRunSummaryPlayAgain');
    if (playBtn) playBtn.addEventListener('click', () => {
      dismissMpRunSummary();
      // "PLAY SOLO" means DROP the MP lobby first, otherwise the next
      // _startGame() call still runs inside the connected lobby and
      // the player re-enters multiplayer instead of singleplayer.
      // Also clear the once-per-session intro guard so the cinematic
      // plays again on this fresh SP run.
      try { netcode.disconnect(); } catch (e) {}
      _introPlayedThisSession = false;
      if (typeof window._startGame === 'function') window._startGame();
    });
    const btn = document.getElementById('mpRunSummaryContinue');
    if (btn) btn.addEventListener('click', dismissMpRunSummary);
    const shareBtn = document.getElementById('mpRunSummaryShare');
    if (shareBtn) shareBtn.addEventListener('click', () => {
      if (typeof window._shareTwitter === 'function') window._shareTwitter(endedRound, endedKills, endedPoints);
    });
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
        // Push the local player name to the server NOW. Without this,
        // players who set their name in the menu before connecting
        // (the common path) show up as "Survivor" in the lobby + on
        // their teammates' name tags / scoreboard / chat. Uses
        // getLocalPlayerName() so the auto-generated "Player-####"
        // fallback gets sent for users who never typed a name.
        try {
          const myName = getLocalPlayerName();
          if (myName) netcode.callSetPlayerName(myName);
        } catch (e) {}
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
      // Server confirmed our lobby assignment — any pending invite-link
      // join has succeeded. Clear the sessionStorage stash so future
      // refreshes don't re-attempt to join a lobby we're already in.
      try { _clearPendingInvite(); } catch (e) {}
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
      // Arrow used to be ↑ but the name input sits BELOW the status
      // message in the menu layout, so the visual cue pointed at the
      // wrong element. Use ↓ to actually direct the player to the
      // input. (With the new auto-generated Player-#### fallback in
      // getLocalPlayerName(), this codepath rarely triggers anymore.)
      _multiStatusEl.textContent = 'set a name first ↓';
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

// ── URL ?mp=1 bootstrap (death-screen MULTIPLAYER button reloads to this) ──
(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mp') !== '1') return;
  // Strip ?mp=1 so future reloads/shares don't re-trigger
  const url = new URL(window.location.href);
  url.searchParams.delete('mp');
  history.replaceState({}, '', url.toString());
  // Wait for menu DOM + button listeners to wire up, then click MULTIPLAYER
  setTimeout(() => {
    if (_multiBtnEl) _multiBtnEl.click();
  }, 300);
})();

// ── URL ?invite=CODE bootstrap ────────────────────────────────────
// Hardened against page refreshes during the auth-handshake window:
//
//   1. The invite code is mirrored into sessionStorage on first load.
//      If the page reloads BEFORE the join lands, we still know what
//      lobby the user wanted, even if the URL got stripped by some
//      other code path or the share link they used was edited.
//
//   2. The bootstrap runs on EVERY page load AND every transition to
//      'connected' status. The 'connected' branch in onStatus already
//      drains _pendingMpAction; this just re-arms it after a refresh
//      so the drain succeeds on the next connect.
//
//   3. The sessionStorage entry is cleared ONLY after we observe our
//      lobbyId become non-zero (i.e. join actually succeeded). Until
//      then, every refresh re-attempts. Shipped via setOnMyLobbyChange
//      so the cleanup runs whenever the server confirms our lobby
//      assignment, regardless of which code path triggered the join.
const _INVITE_KEY = 'undead.pendingInvite';
function _readPendingInvite() {
  try {
    const urlCode = (new URLSearchParams(window.location.search).get('invite') || '').trim().toUpperCase();
    if (urlCode) return urlCode;
    const stashed = (sessionStorage.getItem(_INVITE_KEY) || '').trim().toUpperCase();
    return stashed || '';
  } catch (e) { return ''; }
}
function _stashPendingInvite(code) {
  try { sessionStorage.setItem(_INVITE_KEY, code); } catch (e) {}
}
function _clearPendingInvite() {
  try { sessionStorage.removeItem(_INVITE_KEY); } catch (e) {}
}
function _attemptInviteJoin() {
  const code = _readPendingInvite();
  if (!code) return;
  _stashPendingInvite(code); // ensure it survives any URL rewrite
  // No name-required gate any more — getLocalPlayerName auto-generates
  // a Player-#### so the join can always proceed. The user can still
  // edit their name later from the MP menu.
  _pendingMpAction = () => {
    try { netcode.callJoinLobbyByCode(code); } catch (e) {
      console.warn('[mp] auto-join via invite failed', e);
    }
  };
  if (netcode.isConnected()) {
    _pendingMpAction();
    _pendingMpAction = null;
  } else if (netcode.getStatus() !== 'connecting') {
    netcode.connect();
  }
}
// Initial run (waits for the page-load dust to settle).
setTimeout(_attemptInviteJoin, 100);
// Re-arm if the player ever fully drops back to disconnected (e.g.
// they refresh, click LEAVE MP, then we get a stash hit on next
// connect). 'connected' status is also handled inline in onStatus
// via the existing _pendingMpAction drain — no double-fire risk.
// Successful joins clear the stash via setOnMyLobbyChange below.

// ===== SPECTATOR CAMERA + OVERLAY =====
// Implementation in src/netcode/spectator.js. tickSpectator() is called
// from the update loop inside the MP branch.
initSpectator({ camera, controls, player, netcode, TILE });

// ===== PORTAL RETURN (SP pause / MP rejoin) =====
// Before the portal navigates the tab to vibej.am, snapshot enough state
// so that hitting the browser back button drops the player back into
// their run. For SP that's a paused resume at the same round/hp. For MP
// we store the lobby invite code and try to rejoin via netcode.
const PORTAL_RETURN_KEY = 'siege.portalReturn';
const PORTAL_RETURN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Exposed to portal.js so the in-game portal ring also snapshots state
// before it navigates away.
window.__siegeSnapshotPortal = () => {
  if (state === 'playing' || state === 'roundIntro') _snapshotPortalState();
};

// Exposed so the portal logic can check downed state without importing
// from src/netcode/. A downed player must NOT be able to escape via the
// portal — they can still be revived by teammates.
window.__siegeIsLocallyDowned = () => isLocallyDowned();

function _snapshotPortalState() {
  try {
    const lobby = netcode.isConnected() ? netcode.getMyLobby() : null;
    const mpMode = !!lobby;
    const snapshot = {
      ts: Date.now(),
      mode: mpMode ? 'mp' : 'sp',
      lobbyCode: mpMode ? String(lobby.inviteCode || '') : '',
      round, points, totalKills,
      zToSpawn, zSpawned, maxAlive, spawnTimer, doorsOpenedCount,
      cam: {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: controls._yaw, pitch: controls._pitch,
      },
      player: {
        hp: player.hp, maxHp: player.maxHp,
        curWeapon: player.curWeapon, mag: player.mag,
        ammo: player.ammo.slice(),
        owned: player.owned.slice(),
        reloadMult: player.reloadMult,
        fireRateMult: player.fireRateMult,
        hpRegen: player.hpRegen,
        shieldHits: player.shieldHits,
        perksOwned: { ...player.perksOwned },
      },
      weaponMags: { ...weaponMags },
      doorsOpened: doors.filter(d => d.opened).map(d => d.id),
      name: getLocalPlayerName(),
    };
    sessionStorage.setItem(PORTAL_RETURN_KEY, JSON.stringify(snapshot));
  } catch (e) { console.warn('[portal] snapshot failed', e); }
}

function _loadPortalSnapshot() {
  try {
    const raw = sessionStorage.getItem(PORTAL_RETURN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.ts !== 'number') return null;
    if (Date.now() - s.ts > PORTAL_RETURN_TTL_MS) { _clearPortalSnapshot(); return null; }
    return s;
  } catch (e) { return null; }
}
function _clearPortalSnapshot() {
  try { sessionStorage.removeItem(PORTAL_RETURN_KEY); } catch (e) {}
}

// Resume a Single-Player run. Restore state, show a paused overlay;
// clicking anywhere resumes. Uses the existing pause infrastructure.
function _resumeSinglePlayerRun(snap) {
  // Don't play the intro cinematic when resuming from a portal — the
  // player already saw it in their original session.
  markSkipIntro();
  state = 'playing';
  paused = true;
  round = snap.round | 0;
  points = snap.points | 0;
  totalKills = snap.totalKills | 0;
  // Zombies are not snapshotted — on bfcache restore the array could
  // still hold the pre-portal zombies (desynced from zSpawned), on
  // fresh reload it's empty. Either way, restart the wave cleanly:
  // clear alive zombies and reset progression counters so the round
  // respawns from scratch. Points + round + loadout are preserved;
  // only the in-flight wave is reset. Consistent UX in both paths.
  zombies.forEach(z => { try { removeZombieMesh(z); } catch (e) {} });
  zombies.length = 0;
  zToSpawn = snap.zToSpawn | 0;
  zSpawned = 0;
  spawnTimer = 0;
  maxAlive = snap.maxAlive | 0;
  doorsOpenedCount = snap.doorsOpenedCount | 0;
  // Camera + look direction
  camera.position.set(snap.cam.x, snap.cam.y, snap.cam.z);
  controls._yaw = snap.cam.yaw;
  controls._pitch = snap.cam.pitch;
  controls._applyRotation();
  // Player
  Object.assign(player, snap.player);
  player.ammo = snap.player.ammo.slice();
  player.owned = snap.player.owned.slice();
  player.perksOwned = { ...snap.player.perksOwned };
  for (const k in weaponMags) delete weaponMags[k];
  Object.assign(weaponMags, snap.weaponMags);
  // Re-apply each active perk's effect (buffs are state-side, not just
  // timer-side, so we need to call apply() to re-activate the effect)
  for (const p of perks) {
    if (player.perksOwned[p.id] > 0) { try { p.apply(); } catch (e) {} }
  }
  // Open the doors that were open before
  for (const door of doors) {
    if (snap.doorsOpened.includes(door.id) && !door.opened) {
      try { openDoorLocal(door); } catch (e) {}
    }
  }
  // Make sure the menu/blocker is hidden
  document.getElementById('blocker')?.classList.add('hidden');
  document.getElementById('hud')?.classList.remove('hidden');
  // Enter paused state so the player sees the world and can click to resume
  showPause();
  _clearPortalSnapshot();
  addFloatText('Run resumed — click to continue', '#fc0', 3);
}

// Attempt to rejoin the MP lobby the player left. If the lobby still
// exists and is in 'playing' state, they rejoin the match. Otherwise
// we show them the match-ended summary with their last-known stats.
function _attemptMultiplayerRejoin(snap) {
  // Make sure netcode is connecting/connected
  if (!netcode.isConnected() && netcode.getStatus() !== 'connecting') {
    try { netcode.connect(); } catch (e) {}
  }
  // Wait up to 4s for the connection to land, then try to join by code
  const deadline = Date.now() + 4000;
  const tryJoin = () => {
    if (netcode.isConnected()) {
      try { netcode.callJoinLobbyByCode(snap.lobbyCode); }
      catch (e) { console.warn('[portal] rejoin failed', e); }
      // The lobby subscription will react from here; host-status change
      // handlers will pull us into the match if it's still playing.
      // Schedule a check: if after 3s we didn't enter the match, show
      // the run-ended summary using the snapshot stats.
      setTimeout(() => {
        const lobby = netcode.getMyLobby();
        if (!lobby || lobby.status !== 'playing') {
          // Squad must have wiped or the lobby is gone — show summary
          if (typeof showMpRunSummary === 'function') {
            try { showMpRunSummary(snap.round | 0, snap.totalKills | 0, snap.points | 0); } catch (e) {}
          }
        }
      }, 3000);
      _clearPortalSnapshot();
      return;
    }
    if (Date.now() < deadline) return setTimeout(tryJoin, 200);
    // Gave up waiting — show summary from snapshot
    _clearPortalSnapshot();
    if (typeof showMpRunSummary === 'function') {
      try { showMpRunSummary(snap.round | 0, snap.totalKills | 0, snap.points | 0); } catch (e) {}
    }
  };
  tryJoin();
}

// Browser "back" from the portal destination. If bfcache is used the
// page is restored with JS state intact; `persisted` is true. We also
// handle a full page reload via the sessionStorage path.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const snap = _loadPortalSnapshot();
  if (!snap) return;
  if (snap.mode === 'sp') _resumeSinglePlayerRun(snap);
  else if (snap.mode === 'mp') _attemptMultiplayerRejoin(snap);
});

// On fresh page load, check for a recent portal snapshot. If found,
// auto-resume (SP) or auto-rejoin (MP).
(() => {
  const snap = _loadPortalSnapshot();
  if (!snap) return;
  // Wait a tick so all subsystems are initialized
  setTimeout(() => {
    if (snap.mode === 'sp') _resumeSinglePlayerRun(snap);
    else if (snap.mode === 'mp') _attemptMultiplayerRejoin(snap);
  }, 800);
})();

window._shareTwitter = function(r, k, p) {
  const gameUrl = 'https://itsababseh.github.io/undead-siege-3d/';
  const txt = encodeURIComponent(
    `I survived Round ${r} in Undead Siege 3D — ${k} kills, ${p} pts! Can you beat it? 🧟\n\ncc @whatdoesababsay @Auto_GPT #vibejam #UndeadSiege3D`
  );
  // url= param triggers Twitter's card crawler (og:image, og:title etc.)
  // Keep the URL out of the text so it doesn't eat tweet characters
  window.open(`https://twitter.com/intent/tweet?text=${txt}&url=${encodeURIComponent(gameUrl)}`, '_blank');
};
window._vibeJamPortal = function() {
  // Block downed players from portal-escaping their own revive
  if (isLocallyDowned()) {
    addFloatText('Cannot use portal while downed', '#f88', 2);
    return;
  }
  // Only snapshot if we're actually in a run — portal from the menu
  // shouldn't leave resume state lying around.
  if (state === 'playing' || state === 'roundIntro') {
    _snapshotPortalState();
  }
  _triggerExitPortal();
};

// Death screen multiplayer button — page-reloads to ?mp=1 which the
// bootstrap below auto-triggers. We can't just rebuild the menu DOM here
// because the death screen replaced blocker.innerHTML, detaching the
// original mainMenuPanel + multiBtn nodes that this function would need.
window._deathMultiplayer = function() {
  const url = new URL(window.location.href);
  url.searchParams.set('mp', '1');
  window.location.href = url.toString();
};

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
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  resizePostProcessing(w, h);
});

requestAnimationFrame(gameLoop);
updateLoadBar(95, 'Waking the undead...');

setTimeout(() => finishLoading(), 600);
