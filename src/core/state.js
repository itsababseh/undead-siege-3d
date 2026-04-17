// Central game state — all modules import from here
// Uses mutable objects so all modules share live references

export const TILE = 4;
export const MAP_W = 24, MAP_H = 24;
export const PI = Math.PI, PI2 = PI * 2;
export const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || ('ontouchstart' in window);

export const game = {
  state: 'menu',
  paused: false,
  round: 0,
  points: 500,
  totalKills: 0,
  zToSpawn: 0,
  zSpawned: 0,
  maxAlive: 0,
  spawnTimer: 0,
  roundIntroTimer: 0,
  doorsOpenedCount: 0,
  mouseDown: false,
  _deathShown: false,
  _deathTriggered: false,
  _startingGame: false,
  roundPowerUpsDropped: 0,
  _lastPowerUpIdx: -1,
};

export const keys = {};
export const prevKeys = {};

export const player = {
  hp: 100, maxHp: 100, speed: 8,
  curWeapon: 0, mag: 8,
  ammo: [999, 0, 0, 0],
  owned: [true, false, false, false],
  reloading: false, reloadTimer: 0, reloadTotal: 0,
  fireTimer: 0, fireRateMult: 1, reloadMult: 1,
  hpRegen: false, hpRegenTimer: 0,
  shieldHits: 0, // Juggernog shield-hits remaining (0 = no shield)
  perksOwned: {},
  bobPhase: 0,
  _lastFiring: false,
  _instaKill: false, _instaKillTimer: 0,
  _doublePoints: false, _doublePointsTimer: 0,
};

export const weapons = [
  { name: 'M1911', dmg: 40, rate: 0.3, mag: 8, maxAmmo: 999, reload: 1.5, auto: false, spread: 0.02, color: '#fc0' },
  { name: 'MP40', dmg: 25, rate: 0.08, mag: 32, maxAmmo: 192, reload: 2.0, auto: true, spread: 0.06, color: '#6cf' },
  { name: 'Trench Gun', dmg: 120, rate: 0.7, mag: 6, maxAmmo: 54, reload: 2.5, auto: false, spread: 0.1, pellets: 5, color: '#f84' },
  { name: 'Ray Gun', dmg: 300, rate: 0.35, mag: 20, maxAmmo: 160, reload: 3.0, auto: false, spread: 0.01, color: '#0f0', isRayGun: true },
];
export const origWeaponStats = weapons.map(w => ({ name: w.name, dmg: w.dmg, mag: w.mag, maxAmmo: w.maxAmmo }));
export const weaponMags = {};

export const wallBuys = [
  { tx: 12, tz: 4, wi: 1, cost: 1000 },
  { tx: 12, tz: 19, wi: 2, cost: 1500 },
  { tx: 15, tz: 7, wi: 3, cost: 10000, minRound: 10 },
];

export const perks = [];  // populated by systems/perks.js after import
export const perkMachines = [
  { tx:10, tz:11, perkIdx:0 },
  { tx:19, tz:6, perkIdx:1 },
  { tx:5, tz:5, perkIdx:2 },
  { tx:21, tz:14, perkIdx:3 },
];

export const doors = [
  { id:'west', tiles:[[9,7],[9,8]], cost:1250, opened:false, label:'West Wing' },
  { id:'east', tiles:[[19,11],[19,12]], cost:2000, opened:false, label:'East Chamber' },
];

export const spawnPts = [
  {x:11,z:1.5,door:null},{x:18,z:1.5,door:null},{x:11,z:9,door:null},{x:18,z:9,door:null},
  {x:15,z:5,door:null},{x:13,z:7,door:null},{x:1.5,z:11,door:null},{x:1.5,z:20,door:null},
  {x:8,z:22,door:null},{x:15,z:22,door:null},{x:19,z:20,door:null},{x:5,z:15,door:null},
  {x:10,z:18,door:null},{x:17,z:15,door:null},
  {x:3,z:2.5,door:'west'},{x:7,z:2.5,door:'west'},{x:3,z:5,door:'west'},
  {x:5,z:8,door:'west'},{x:7,z:5,door:'west'},{x:2,z:7,door:'west'},
  {x:21,z:11,door:'east'},{x:22,z:13,door:'east'},{x:21,z:15,door:'east'},
  {x:22,z:17,door:'east'},{x:20.5,z:14,door:'east'},{x:21,z:17.5,door:'east'},
];

// Three.js refs (set during scene init)
export const refs = {
  scene: null, camera: null, renderer: null, controls: null,
  gunGroup: null, muzzleLight: null, muzzleMesh: null, playerLight: null,
  raycaster: null, ambientLight: null, dirLight: null,
};

// Entity arrays
export const zombies = [];
export const dyingZombies = [];
export const muzzleSparks = [];
export const bloodDecals = [];
export const particles = [];
export const floatTexts = [];
export const hitIndicators = [];
export const powerUps = [];
export const lights = [];
export const wallMeshes = [];
export const doorMeshes = [];
export const perkMeshObjects = [];
export const gunModels = [];

// Visual effects state
export const fx = {
  gunKick: 0, dmgFlash: 0,
  shakeIntensity: 0, shakeDecay: 8, _prevShakeX: 0, _prevShakeY: 0,
  vignetteIntensity: 0, slowMoFactor: 1,
  roundTransitionTimer: 0, roundTransitionPhase: 'none',
  hitmarkerTimer: 0, centerMsgTimer: 0,
  heartbeatPhase: 0, floatTextSlot: 0,
};

// Audio state
export const audio = {
  ctx: null, masterGain: null, muted: false, bgMusicStarted: false,
  bgGains: [], bgNodes: [], ambientTimer: 0, zombieGroanTimer: 0,
};

// Loading
export const loadProgress = { value: 0, target: 0 };
export const wallColors = [0x666666, 0x6B4226, 0x4A6B3A, 0x8B3520, 0x8B3520];

// Input
export const input = {
  joystickX: 0, joystickY: 0, mobileFiring: false,
  touchLookId: null, touchLookX: 0, touchLookY: 0,
  _quickSwapWeapon: 0, _lastWeapon: 0, _mouseSuppress: 0,
};

// Map
export const mapData = [
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
export let map = [...mapData];
export function resetMap() { map = [...mapData]; }

export function mapAt(wx, wz) {
  const mx = Math.floor(wx / TILE), mz = Math.floor(wz / TILE);
  if (mx < 0 || mx >= MAP_W || mz < 0 || mz >= MAP_H) return 1;
  return map[mz * MAP_W + mx];
}
