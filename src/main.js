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
  playAmbientWind, playDistantScream, playMetalCreak
} from './audio/index.js';
import {
  ZOMBIE_SPRITE_SIZE, ZOMBIE_FRAMES, ZOMBIE_VARIANTS,
  zombieSpriteSheets, initZombieSprites, createZombieSpriteSheet, drawZombieFrame,
  zombieMeshes, createZombieMesh, removeZombieMesh, updateZombieMesh
} from './entities/zombies.js';
import { loadTips, loadProgress, initLoadScreen, updateLoadBar, finishLoading } from './ui/loading.js';
import {
  initMenuBackground, stopMenuBackground, restartMenuBackground,
  showMenuScoresEnhanced,
  getLeaderboard, saveScore, showMenuScores
} from './ui/menu.js';



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

// Wall colors (Three.js hex): 1=grey, 2=brown, 3=green, 4=door-west(red), 5=door-east(red)
const wallColors = [0x666666, 0x6B4226, 0x4A6B3A, 0x8B3520, 0x8B3520];

// ===== VIBE JAM PORTAL SYSTEM =====
const _vjPortalParams = new URLSearchParams(window.location.search);
const _arrivedViaPortal = _vjPortalParams.get('portal') === 'true' || _vjPortalParams.get('portal') === '1';
const _portalReferer = _vjPortalParams.get('ref') || '';
let _exitPortalGroup = null;
let _startPortalGroup = null;
let _startPortalActiveAt = 0;
let _portalInited = false;

function _makePortalMesh(color, pos, label) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  // Glowing torus ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.35, 16, 64),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 })
  );
  group.add(ring);
  // Inner swirling disc
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  group.add(disc);
  // Particle ring
  const pCount = 300;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount * 3);
  const pColors = new Float32Array(pCount * 3);
  const pr = ((color >> 16) & 0xff) / 255, pg = ((color >> 8) & 0xff) / 255, pb = (color & 0xff) / 255;
  for (let i = 0; i < pCount * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + (Math.random() - 0.5) * 0.8;
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius;
    positions[i + 2] = (Math.random() - 0.5) * 0.6;
    const jitter = 0.8 + Math.random() * 0.2;
    pColors[i] = pr * jitter; pColors[i + 1] = pg * jitter; pColors[i + 2] = pb * jitter;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  group.add(new THREE.Points(geom, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.6 })));
  // Label above portal
  if (label) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center';
    ctx.fillText(label, 256, 42);
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.8),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide })
    );
    labelMesh.position.y = 3.5;
    group.add(labelMesh);
  }
  const light = new THREE.PointLight(color, 2, 12);
  light.position.copy(group.position);
  return { group, light, particles: geom };
}

function initVibeJamPortals() {
  if (_portalInited) return;
  _portalInited = true;
  // Exit portal — in the top-right open area (tile col 17, row 3) — always accessible
  const exitPos = { x: 17 * TILE + TILE / 2, y: 1.6, z: 3 * TILE + TILE / 2 };
  const ep = _makePortalMesh(0x00ff44, exitPos, 'VIBE JAM PORTAL');
  _exitPortalGroup = ep;
  scene.add(ep.group); scene.add(ep.light);
  // Start (return) portal — only if player arrived via another jam game
  if (_arrivedViaPortal && _portalReferer) {
    const startPos = { x: 12 * TILE, y: 1.6, z: 13 * TILE };
    const sp = _makePortalMesh(0xff4444, startPos, 'RETURN PORTAL');
    _startPortalGroup = sp;
    scene.add(sp.group); scene.add(sp.light);
    _startPortalActiveAt = Date.now() + 5000;
  }
}

function animateVibeJamPortals(dt) {
  if (!_portalInited) return;
  const t = Date.now() * 0.001;
  if (_exitPortalGroup) {
    _exitPortalGroup.group.rotation.z += dt * 0.5;
    const pp = _exitPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i);
    _exitPortalGroup.particles.attributes.position.needsUpdate = true;
    _exitPortalGroup.light.intensity = 2 + Math.sin(t * 3) * 0.8;
    // Check proximity
    if (state === 'playing' || state === 'roundIntro') {
      const dx = camera.position.x - _exitPortalGroup.group.position.x;
      const dz = camera.position.z - _exitPortalGroup.group.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 3) _triggerExitPortal();
    }
  }
  if (_startPortalGroup) {
    _startPortalGroup.group.rotation.z -= dt * 0.5;
    const pp = _startPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i * 0.7);
    _startPortalGroup.particles.attributes.position.needsUpdate = true;
    _startPortalGroup.light.intensity = 2 + Math.sin(t * 2.5) * 0.8;
    if (Date.now() >= _startPortalActiveAt && (state === 'playing' || state === 'roundIntro')) {
      const dx = camera.position.x - _startPortalGroup.group.position.x;
      const dz = camera.position.z - _startPortalGroup.group.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 3) _triggerReturnPortal();
    }
  }
}

function _triggerExitPortal() {
  const params = new URLSearchParams();
  params.set('portal', 'true');
  params.set('ref', window.location.hostname);
  params.set('username', 'Survivor');
  params.set('color', 'red');
  window.location.href = 'https://vibej.am/portal/2026?' + params.toString();
}

function _triggerReturnPortal() {
  let url = _portalReferer;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const params = new URLSearchParams(window.location.search);
  params.delete('ref');
  const s = params.toString();
  window.location.href = url + (s ? '?' + s : '');
}

function cleanupVibeJamPortals() {
  if (_exitPortalGroup) { scene.remove(_exitPortalGroup.group); scene.remove(_exitPortalGroup.light); _exitPortalGroup = null; }
  if (_startPortalGroup) { scene.remove(_startPortalGroup.group); scene.remove(_startPortalGroup.light); _startPortalGroup = null; }
  _portalInited = false;
}

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
// Custom FPS controls — ONLY yaw (Y) and pitch (X), NEVER roll (Z)
// Replaces PointerLockControls to prevent all Euler↔quaternion roll drift
camera.rotation.order = 'YXZ'; // match standard FPS: Y=yaw, X=pitch, Z=roll(locked to 0)
const controls = {
  isLocked: false,
  _yaw: 0,    // horizontal rotation (radians)
  _pitch: 0,  // vertical rotation (radians, clamped)
  _maxPitch: Math.PI / 2.4,  // 75° — comfortable FPS pitch limit
  _skipFrames: 0,  // skip N mousemove events after pointer lock acquired (spike guard)
  
  lock() {
    renderer.domElement.requestPointerLock();
  },
  unlock() {
    document.exitPointerLock();
  },
  getDirection(v) {
    return v.set(0, 0, -1).applyQuaternion(camera.quaternion);
  },
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
  // Apply current yaw/pitch to camera — call every frame
  _applyRotation() {
    camera.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
  }
};

// --- Mouse spike suppression state ---
let _mouseSuppress = 0;  // timestamp until which mouse input is suppressed

// Suppress mouse input briefly after events that cause bogus movementX/Y spikes
function suppressMouse(ms) {
  _mouseSuppress = performance.now() + (ms || 120);
}

// Mouse handler — raw input with spike rejection only (no smoothing)
document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked) return;

  // Skip first N mousemove events after pointer lock acquired
  if (controls._skipFrames > 0) {
    controls._skipFrames--;
    return;
  }

  // Time-based suppression (after pointer lock, focus, visibility changes)
  if (performance.now() < _mouseSuppress) return;

  let mx = e.movementX || 0;
  let my = e.movementY || 0;

  // Drop truly bogus spikes (browser bugs on focus/lock changes)
  // Normal fast flicks at 800-1600 DPI rarely exceed 150px per event
  if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;

  // Soft cap: allow fast aiming but prevent extreme single-frame jumps
  const maxDelta = 120;
  mx = Math.max(-maxDelta, Math.min(maxDelta, mx));
  my = Math.max(-maxDelta, Math.min(maxDelta, my));

  // Apply directly — no smoothing, no delta blending
  controls._yaw -= mx * 0.002;
  controls._pitch -= my * 0.002;
  controls._pitch = Math.max(-controls._maxPitch, Math.min(controls._maxPitch, controls._pitch));
  controls._applyRotation();
});

// Pointer lock state — skip first events + time-suppress after lock/unlock
document.addEventListener('pointerlockchange', () => {
  const wasLocked = controls.isLocked;
  controls.isLocked = document.pointerLockElement === renderer.domElement;
  if (controls.isLocked && !wasLocked) {
    controls._skipFrames = 5;  // skip first 5 events (up from 3)
    suppressMouse(200);         // also suppress for 200 ms
  }
  if (!controls.isLocked && wasLocked) {
    suppressMouse(200);         // suppress after unlock too
  }
});

// Suppress mouse after tab/window focus changes — browsers send huge phantom deltas
document.addEventListener('visibilitychange', () => suppressMouse(200));
window.addEventListener('focus', () => suppressMouse(200));
window.addEventListener('blur', () => suppressMouse(200));

// ===== LIGHTING =====
const ambientLight = new THREE.AmbientLight(0x445566, 1.2);
scene.add(ambientLight);

// Main directional light (overhead fill)
const dirLight = new THREE.DirectionalLight(0x8899bb, 0.7);
dirLight.position.set(50, 30, 50);
scene.add(dirLight);

// Point lights for atmosphere
const lights = [];
function addLight(x, z, color, intensity, distance) {
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(x * TILE + TILE/2, 2.5, z * TILE + TILE/2);
  scene.add(light);
  lights.push(light);
  return light;
}

// Flickering ceiling lights
addLight(12, 6, 0xffaa66, 4, 30);
addLight(15, 12, 0xff6644, 3, 28);
addLight(5, 5, 0x66ff88, 2.5, 25); // West wing green
addLight(12, 19, 0xffaa44, 3, 28);
addLight(21, 14, 0x4488ff, 2.5, 25); // East chamber blue
addLight(8, 15, 0xff8844, 2.5, 26);
addLight(15, 3, 0xff6666, 2.5, 26);
addLight(3, 7, 0x88ff88, 2, 22);
// Extra fill lights for dark corners
addLight(18, 6, 0xffcc88, 2.5, 25);
addLight(6, 18, 0xffaa77, 2.5, 25);
addLight(18, 18, 0xffbb88, 2.5, 25);
addLight(12, 12, 0xffeedd, 3, 30); // Center area bright

// Player torch light (always illuminates area around player)
const playerLight = new THREE.PointLight(0xffeedd, 1.8, 20);
playerLight.position.copy(camera.position);
scene.add(playerLight);

// Muzzle flash light
const muzzleLight = new THREE.PointLight(0xffcc44, 0, 12);
scene.add(muzzleLight);

// ===== TEXTURES (procedural) =====
function createTexture(width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

const wallTexGrey = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    const y = i * 22;
    ctx.fillStyle = '#666';
    ctx.fillRect(0, y, w, 2);
    if (i % 2 === 0) { ctx.fillRect(w/2 - 1, y, 2, 22); }
    else { ctx.fillRect(0, y, 2, 22); ctx.fillRect(w - 2, y, 2, 22); }
  }
  // Grime
  for(let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.15})`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*20+2, Math.random()*20+2);
  }
});

const wallTexBrown = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#7A5030';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 16 + (j % 2) * 8;
      const y = j * 32;
      ctx.fillStyle = `rgb(${100+Math.random()*25},${65+Math.random()*20},${35+Math.random()*15})`;
      ctx.fillRect(x, y, 15, 30);
      ctx.strokeStyle = '#4A3218';
      ctx.strokeRect(x, y, 15, 30);
    }
  }
});

const wallTexGreen = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#4A7A40';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${Math.random()>0.5?10:60},${55+Math.random()*45},${Math.random()*25},0.3)`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*15+3, Math.random()*15+3);
  }
  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for(let i = 0; i < 5; i++) {
    ctx.beginPath();
    let cx = Math.random()*w, cy = Math.random()*h;
    ctx.moveTo(cx, cy);
    for(let j = 0; j < 4; j++) { cx += Math.random()*30-15; cy += Math.random()*30; ctx.lineTo(cx,cy); }
    ctx.stroke();
  }
});

const wallTexDoor = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#6B2A15';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7B3520';
  ctx.fillRect(8, 8, w-16, h-16);
  // Metal bands
  ctx.fillStyle = '#444';
  ctx.fillRect(0, 20, w, 6); ctx.fillRect(0, h-26, w, 6); ctx.fillRect(0, h/2-3, w, 6);
  // Rivets
  ctx.fillStyle = '#666';
  for(let y of [23, h/2, h-23]) {
    for(let x = 10; x < w; x += 20) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, PI2); ctx.fill();
    }
  }
});

const floorTex = createTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#3a3a35';
  ctx.fillRect(0, 0, w, h);
  // Tile pattern
  const ts = 32;
  for(let x = 0; x < w; x += ts) {
    for(let y = 0; y < h; y += ts) {
      const v = 45 + Math.random()*15;
      ctx.fillStyle = `rgb(${v},${v},${v-3})`;
      ctx.fillRect(x+1, y+1, ts-2, ts-2);
    }
  }
  // Blood stains
  ctx.fillStyle = 'rgba(60,10,10,0.3)';
  for(let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*w, Math.random()*h, Math.random()*20+10, 0, PI2);
    ctx.fill();
  }
});
floorTex.repeat.set(MAP_W, MAP_H);

const ceilTex = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#2a2a25';
  ctx.fillRect(0, 0, w, h);
  for(let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(${20+Math.random()*20},${18+Math.random()*18},${15+Math.random()*15},0.4)`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*30+5, Math.random()*30+5);
  }
});
ceilTex.repeat.set(MAP_W, MAP_H);

const wallTextures = [wallTexGrey, wallTexBrown, wallTexGreen, wallTexDoor, wallTexDoor];

// ===== BUILD 3D MAP =====
const wallMeshes = [];
const doorMeshes = []; // track door meshes for removal

function buildMap() {
  // Remove old walls
  wallMeshes.forEach(m => scene.remove(m));
  wallMeshes.length = 0;
  doorMeshes.length = 0;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -PI / 2;
  floor.position.set(MAP_W * TILE / 2, 0, MAP_H * TILE / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  wallMeshes.push(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE);
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1, metalness: 0 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = PI / 2;
  ceil.position.set(MAP_W * TILE / 2, 3.2, MAP_H * TILE / 2);
  scene.add(ceil);
  wallMeshes.push(ceil);

  // Walls
  const wallH = 3.2;
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = map[z * MAP_W + x];
      if (cell === 0) continue;
      const ci = Math.min(cell - 1, wallTextures.length - 1);
      const mat = new THREE.MeshStandardMaterial({ map: wallTextures[ci], roughness: 0.85, metalness: 0.05 });
      const geo = new THREE.BoxGeometry(TILE, wallH, TILE);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * TILE + TILE / 2, wallH / 2, z * TILE + TILE / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      wallMeshes.push(mesh);
      if (cell === 4 || cell === 5) {
        doorMeshes.push({ mesh, x, z, cell });
      }
    }
  }
}
buildMap();
updateLoadBar(25, 'Loading weapons cache...');

// Audio system extracted to src/audio/index.js

// Leaderboard extracted to src/ui/menu.js

// ===== GAME STATE =====
let state = 'menu'; // menu, roundIntro, playing, dead
let paused = false;
let round = 0, points = 500, totalKills = 0;
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

// ===== WEAPONS =====
const weapons = [
  { name: 'M1911', dmg: 40, rate: 0.3, mag: 8, maxAmmo: 999, reload: 1.5, auto: false, spread: 0.02, color: '#fc0' },
  { name: 'MP40', dmg: 25, rate: 0.08, mag: 32, maxAmmo: 192, reload: 2.0, auto: true, spread: 0.06, color: '#6cf' },
  { name: 'Trench Gun', dmg: 120, rate: 0.7, mag: 6, maxAmmo: 54, reload: 2.5, auto: false, spread: 0.1, pellets: 5, color: '#f84' },
  { name: 'Ray Gun', dmg: 300, rate: 0.35, mag: 20, maxAmmo: 160, reload: 3.0, auto: false, spread: 0.01, color: '#0f0', isRayGun: true },
];
// Store original weapon stats for PaP reset
const origWeaponStats = weapons.map(w => ({ name: w.name, dmg: w.dmg, mag: w.mag, maxAmmo: w.maxAmmo }));

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
  // Clean up old perk meshes on restart
  perkMeshObjects.forEach(po => {
    scene.remove(po.body); scene.remove(po.panel); scene.remove(po.light);
  });
  perkMeshObjects.length = 0;
  
  perkMachines.forEach(pm => {
    const perk = perks[pm.perkIdx];
    const color = new THREE.Color(perk.color);
    
    // Machine body
    const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 1.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(pm.tx * TILE + TILE/2, 1.1, pm.tz * TILE + TILE/2);
    body.castShadow = true;
    scene.add(body);
    
    // Glowing panel
    const panelGeo = new THREE.PlaneGeometry(0.8, 1.2);
    const panelMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(pm.tx * TILE + TILE/2, 1.3, pm.tz * TILE + TILE/2 - 0.61);
    scene.add(panel);
    
    // Perk light
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
  // West wing
  {x:3,z:2.5,door:'west'},{x:7,z:2.5,door:'west'},{x:3,z:5,door:'west'},
  {x:5,z:8,door:'west'},{x:7,z:5,door:'west'},{x:2,z:7,door:'west'},
  // East chamber
  {x:21,z:11,door:'east'},{x:22,z:13,door:'east'},{x:21,z:15,door:'east'},
  {x:22,z:17,door:'east'},{x:20.5,z:14,door:'east'},{x:21,z:17.5,door:'east'},
];


// ===== MYSTERY BOX SYSTEM =====
const mysteryBox = {
  tx: 14, tz: 14, // location on map
  cost: 950,
  isOpen: false,
  isSpinning: false,
  spinTimer: 0,
  spinDuration: 3.0,
  currentSpinIdx: 0,
  resultWeaponIdx: -1,
  collectTimer: 0,
  collectDuration: 8, // seconds to grab weapon before it closes
};

const mysteryBoxMeshes = {};

function buildMysteryBox() {
  // Clean up old
  if (mysteryBoxMeshes.body) {
    scene.remove(mysteryBoxMeshes.body);
    scene.remove(mysteryBoxMeshes.lid);
    scene.remove(mysteryBoxMeshes.glow);
    scene.remove(mysteryBoxMeshes.light);
    if (mysteryBoxMeshes.trim) scene.remove(mysteryBoxMeshes.trim);
    if (mysteryBoxMeshes.weaponDisplay) scene.remove(mysteryBoxMeshes.weaponDisplay);
  }
  
  const bx = mysteryBox.tx * TILE + TILE / 2;
  const bz = mysteryBox.tz * TILE + TILE / 2;
  
  // Box body (ornate chest)
  const bodyGeo = new THREE.BoxGeometry(1.6, 0.9, 1.0);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x442200, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(bx, 0.45, bz);
  body.castShadow = true;
  scene.add(body);
  
  // Gold trim
  const trimGeo = new THREE.BoxGeometry(1.65, 0.05, 1.05);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xddaa00, roughness: 0.3, metalness: 0.8, emissive: 0xddaa00, emissiveIntensity: 0.15 });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.position.set(bx, 0.9, bz);
  scene.add(trim);
  
  // Lid
  const lidGeo = new THREE.BoxGeometry(1.6, 0.15, 1.0);
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x442200, roughness: 0.6, metalness: 0.3 });
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.set(bx, 0.97, bz);
  scene.add(lid);
  
  // Glow beam (visible when spinning/collecting)
  const glowGeo = new THREE.CylinderGeometry(0.3, 0.6, 3, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(bx, 2.5, bz);
  scene.add(glow);
  
  // Point light
  const light = new THREE.PointLight(0x4488ff, 0, 12);
  light.position.set(bx, 2, bz);
  scene.add(light);
  
  mysteryBoxMeshes.body = body;
  mysteryBoxMeshes.lid = lid;
  mysteryBoxMeshes.trim = trim;
  mysteryBoxMeshes.glow = glow;
  mysteryBoxMeshes.light = light;
  mysteryBoxMeshes.weaponDisplay = null;
}

function tryMysteryBox() {
  if (mysteryBox.isSpinning || mysteryBox.collectTimer > 0) return false;
  const bx = mysteryBox.tx * TILE + TILE / 2;
  const bz = mysteryBox.tz * TILE + TILE / 2;
  const d = Math.hypot(bx - camera.position.x, bz - camera.position.z);
  if (d > TILE * 2.5) return false;
  
  if (points < mysteryBox.cost) {
    addFloatText(`Need $${mysteryBox.cost} for Mystery Box`, '#f88');
    return true;
  }
  
  points -= mysteryBox.cost;
  mysteryBox.isSpinning = true;
  mysteryBox.spinTimer = 0;
  // Random result (weighted: ray gun rare)
  const roll = Math.random();
  if (roll < 0.1) mysteryBox.resultWeaponIdx = 3; // 10% Ray Gun
  else if (roll < 0.4) mysteryBox.resultWeaponIdx = 2; // 30% Trench Gun
  else if (roll < 0.7) mysteryBox.resultWeaponIdx = 1; // 30% MP40
  else mysteryBox.resultWeaponIdx = 0; // 30% M1911 (teddy bear / dud equivalent)
  
  beep(600, 'sine', 0.15, 0.1);
  addFloatText('🎰 Mystery Box...', '#48f', 2);
  return true;
}

function collectMysteryBoxWeapon() {
  if (mysteryBox.collectTimer <= 0 || mysteryBox.resultWeaponIdx < 0) return false;
  const bx = mysteryBox.tx * TILE + TILE / 2;
  const bz = mysteryBox.tz * TILE + TILE / 2;
  const d = Math.hypot(bx - camera.position.x, bz - camera.position.z);
  if (d > TILE * 2.5) return false;
  
  const wi = mysteryBox.resultWeaponIdx;
  // Save current weapon's magazine before switching
  weaponMags[player.curWeapon] = player.mag;
  player.owned[wi] = true;
  player.curWeapon = wi;
  player.mag = weapons[wi].mag;
  player.ammo[wi] = weapons[wi].maxAmmo;
  player.reloading = false;
  player.reloadTimer = 0;
  
  sfxBuyWeapon(weapons[wi].isRayGun);
  const wName = weapons[wi].name;
  addFloatText(weapons[wi].isRayGun ? `⚡ ${wName} ⚡` : `${wName}!`, weapons[wi].color, 2);
  
  mysteryBox.collectTimer = 0;
  mysteryBox.resultWeaponIdx = -1;
  // Remove weapon display
  if (mysteryBoxMeshes.weaponDisplay) {
    scene.remove(mysteryBoxMeshes.weaponDisplay);
    mysteryBoxMeshes.weaponDisplay = null;
  }
  return true;
}

function updateMysteryBox(dt) {
  const bx = mysteryBox.tx * TILE + TILE / 2;
  const bz = mysteryBox.tz * TILE + TILE / 2;
  
  if (mysteryBox.isSpinning) {
    mysteryBox.spinTimer += dt;
    const t = mysteryBox.spinTimer / mysteryBox.spinDuration;
    
    // Open lid
    if (mysteryBoxMeshes.lid) {
      mysteryBoxMeshes.lid.rotation.x = Math.min(t * 3, 1) * -0.8;
      mysteryBoxMeshes.lid.position.y = 0.97 + Math.min(t * 3, 1) * 0.3;
    }
    
    // Glow beam
    mysteryBoxMeshes.glow.material.opacity = 0.15 + Math.sin(t * 20) * 0.1;
    mysteryBoxMeshes.light.intensity = 1.5 + Math.sin(t * 15) * 0.5;
    
    // Spinning weapon name display (text-based, shown via floatText)
    const spinRate = Math.max(0.05, 0.3 - t * 0.25); // speeds up then slows
    if (mysteryBox.spinTimer % spinRate < dt) {
      mysteryBox.currentSpinIdx = (mysteryBox.currentSpinIdx + 1) % weapons.length;
    }
    
    // Spinning sound clicks
    if (Math.floor(mysteryBox.spinTimer * 8) !== Math.floor((mysteryBox.spinTimer - dt) * 8)) {
      beep(800 + Math.random() * 400, 'square', 0.02, 0.04);
    }
    
    if (t >= 1) {
      // Spin complete — show result
      mysteryBox.isSpinning = false;
      mysteryBox.collectTimer = mysteryBox.collectDuration;
      
      // Create floating weapon indicator
      const indicatorGeo = new THREE.BoxGeometry(0.8, 0.3, 0.15);
      const w = weapons[mysteryBox.resultWeaponIdx];
      const indicatorMat = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(w.color), transparent: true, opacity: 0.8 
      });
      const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
      indicator.position.set(bx, 2, bz);
      scene.add(indicator);
      mysteryBoxMeshes.weaponDisplay = indicator;
      
      // Result sound
      if (weapons[mysteryBox.resultWeaponIdx].isRayGun) {
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
    
    // Weapon display bobs up and down
    if (mysteryBoxMeshes.weaponDisplay) {
      mysteryBoxMeshes.weaponDisplay.position.y = 2 + Math.sin(performance.now() / 500) * 0.2;
      mysteryBoxMeshes.weaponDisplay.rotation.y += dt * 2;
    }
    
    // Glow
    mysteryBoxMeshes.glow.material.opacity = 0.1;
    mysteryBoxMeshes.light.intensity = 1;
    
    // Flash warning when about to close
    if (mysteryBox.collectTimer < 3 && Math.sin(mysteryBox.collectTimer * 8) > 0) {
      mysteryBoxMeshes.light.intensity = 2;
    }
    
    if (mysteryBox.collectTimer <= 0) {
      // Weapon despawns
      mysteryBox.resultWeaponIdx = -1;
      if (mysteryBoxMeshes.weaponDisplay) {
        scene.remove(mysteryBoxMeshes.weaponDisplay);
        mysteryBoxMeshes.weaponDisplay = null;
      }
      // Close lid
      if (mysteryBoxMeshes.lid) {
        mysteryBoxMeshes.lid.rotation.x = 0;
        mysteryBoxMeshes.lid.position.y = 0.97;
      }
      mysteryBoxMeshes.glow.material.opacity = 0;
      mysteryBoxMeshes.light.intensity = 0;
      beep(200, 'sine', 0.2, 0.08);
    }
  } else {
    // Idle state — gentle glow pulse
    const t = performance.now() / 1000;
    mysteryBoxMeshes.glow.material.opacity = 0;
    mysteryBoxMeshes.light.intensity = 0.3 + Math.sin(t * 1.5) * 0.15;
    // Reset lid
    if (mysteryBoxMeshes.lid) {
      mysteryBoxMeshes.lid.rotation.x = 0;
      mysteryBoxMeshes.lid.position.y = 0.97;
    }
  }
}

// ===== PACK-A-PUNCH SYSTEM =====
const packAPunch = {
  tx: 7, tz: 18, // location on map
  cost: 5000,
  upgraded: {}, // weaponIdx -> true
};

const papMeshes = {};

function buildPackAPunch() {
  if (papMeshes.body) {
    scene.remove(papMeshes.body); scene.remove(papMeshes.panel); scene.remove(papMeshes.light);
  }
  
  const px = packAPunch.tx * TILE + TILE / 2;
  const pz = packAPunch.tz * TILE + TILE / 2;
  
  // Machine body (purple/orange theme like CoD)
  const bodyGeo = new THREE.BoxGeometry(1.4, 2.6, 1.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(px, 1.3, pz);
  body.castShadow = true;
  scene.add(body);
  
  // Glowing panel (purple/electric)
  const panelGeo = new THREE.PlaneGeometry(1.0, 1.4);
  const panelMat = new THREE.MeshStandardMaterial({ 
    color: 0x8800ff, emissive: 0x8800ff, emissiveIntensity: 0.6, roughness: 0.2 
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(px, 1.5, pz - 0.71);
  scene.add(panel);
  
  // Light
  const light = new THREE.PointLight(0x8800ff, 2, 16);
  light.position.set(px, 2.5, pz);
  scene.add(light);
  
  papMeshes.body = body;
  papMeshes.panel = panel;
  papMeshes.light = light;
}

function tryPackAPunch() {
  const px = packAPunch.tx * TILE + TILE / 2;
  const pz = packAPunch.tz * TILE + TILE / 2;
  const d = Math.hypot(px - camera.position.x, pz - camera.position.z);
  if (d > TILE * 2.5) return false;
  
  const wi = player.curWeapon;
  if (packAPunch.upgraded[wi]) {
    addFloatText(`${weapons[wi].name} already upgraded!`, '#888');
    return true;
  }
  if (points < packAPunch.cost) {
    addFloatText(`Need $${packAPunch.cost} for Pack-a-Punch`, '#f88');
    return true;
  }
  
  points -= packAPunch.cost;
  packAPunch.upgraded[wi] = true;
  
  // Apply upgrade: 2x damage, +50% mag, enhanced effects
  weapons[wi].dmg = Math.floor(weapons[wi].dmg * 2);
  weapons[wi].mag = Math.floor(weapons[wi].mag * 1.5);
  weapons[wi].maxAmmo = Math.floor(weapons[wi].maxAmmo * 1.5);
  player.mag = weapons[wi].mag;
  player.ammo[wi] = weapons[wi].maxAmmo;
  
  // Rename weapon (CoD style)
  const papNames = { 'M1911': 'Mustang & Sally', 'MP40': 'The Afterburner', 'Trench Gun': 'Gut Shot', 'Ray Gun': 'Porter\'s X2' };
  const origName = weapons[wi].name;
  weapons[wi].name = papNames[origName] || weapons[wi].name + ' PaP';
  
  // Visual/audio feedback
  triggerScreenShake(1.0, 6);
  beep(200, 'sine', 0.2, 0.12);
  setTimeout(() => beep(400, 'sine', 0.2, 0.12), 200);
  setTimeout(() => beep(800, 'sine', 0.3, 0.15), 400);
  setTimeout(() => beep(1200, 'sine', 0.2, 0.1), 600);
  
  addFloatText(`⚡ PACK-A-PUNCHED! ⚡`, '#a0f', 3);
  addFloatText(`${weapons[wi].name} - 2x DMG`, '#fc0', 2.5);
  
  return true;
}

// ===== POWER-UP DROPS =====
const powerUps = [];
const POWERUP_TYPES = [
  { id: 'instakill', name: 'INSTA-KILL', color: '#ff4444', duration: 30, icon: '💀',
    apply() { player._instaKill = true; player._instaKillTimer = 15; /* refresh, never stack */ },
    remove() { player._instaKill = false; } },
  { id: 'maxammo', name: 'MAX AMMO', color: '#44ff44', duration: 0, icon: '🔫',
    apply() { for (let i = 0; i < weapons.length; i++) { if (player.owned[i]) player.ammo[i] = weapons[i].maxAmmo; } player.mag = weapons[player.curWeapon].mag; },
    remove() {} },
  { id: 'doublepoints', name: 'DOUBLE POINTS', color: '#ffff44', duration: 30, icon: '💰',
    apply() { player._doublePoints = true; player._doublePointsTimer = 15; /* refresh, never stack */ },
    remove() { player._doublePoints = false; } },
  { id: 'nuke', name: 'NUKE', color: '#ff8800', duration: 0, icon: '☢️',
    apply() { 
      // Kill all zombies
      const pts = zombies.length * 400;
      for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        totalKills++;
        startZombieDeathAnim(z);
        spawnBloodParticles(z.wx, 1, z.wz, 3);
        removeZombieMesh(z);
      }
      zombies.length = 0;
      points += pts;
      triggerScreenShake(3, 4);
      addFloatText(`+${pts}`, '#ff8', 2);
      // White flash
      const flash = document.getElementById('roundFlash');
      flash.style.display = 'block';
      flash.style.opacity = 0.5;
      flash.style.background = 'rgba(255,200,100,0.4)';
      setTimeout(() => { flash.style.opacity = 0; setTimeout(() => { flash.style.display = 'none'; flash.style.background = 'rgba(255,255,255,0.3)'; }, 500); }, 200);
    },
    remove() {} },
];

let roundPowerUpsDropped = 0; // track drops per round for guaranteed minimum
let _lastPowerUpIdx = -1; // anti-repeat tracker

function spawnPowerUp(wx, wz) {
  // Power-up drop chance scales with round
  // Round 1: 8%, Round 3: 12%, Round 5: 16%, Round 10: 23%, caps at 28%
  const dropChance = Math.min(0.08 + (round - 1) * 0.02, 0.28);
  
  // Guarantee at least 1 power-up per round starting round 2, and 2+ per round starting round 5
  const minDrops = round >= 5 ? 2 : round >= 2 ? 1 : 0;
  const zombiesRemaining = zToSpawn - zSpawned + zombies.length;
  const needGuarantee = roundPowerUpsDropped < minDrops && zombiesRemaining <= Math.max(3, Math.floor(zToSpawn * 0.15));
  
  if (!needGuarantee && Math.random() > dropChance) return;
  
  // Anti-repeat: never drop the same power-up twice in a row
  // Also avoid dropping a timed power-up that's currently active (prevents stacking)
  let typeIdx;
  const available = [];
  for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
    if (ti === _lastPowerUpIdx) continue; // no repeat
    const pid = POWERUP_TYPES[ti].id;
    // Skip timed power-ups that are currently active (prevents double stacking)
    if (pid === 'instakill' && player._instaKill) continue;
    if (pid === 'doublepoints' && player._doublePoints) continue;
    available.push(ti);
  }
  if (available.length === 0) {
    // Fallback: allow any except last
    for (let ti = 0; ti < POWERUP_TYPES.length; ti++) {
      if (ti !== _lastPowerUpIdx) available.push(ti);
    }
  }
  if (available.length === 0) available.push(0); // absolute fallback
  typeIdx = available[Math.floor(Math.random() * available.length)];
  _lastPowerUpIdx = typeIdx;
  const type = POWERUP_TYPES[typeIdx];
  
  // Create 3D pickup
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({ 
    color: new THREE.Color(type.color), 
    emissive: new THREE.Color(type.color), emissiveIntensity: 0.5,
    transparent: true, opacity: 0.85
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(wx, 0.8, wz);
  scene.add(mesh);
  
  // Glow light
  const light = new THREE.PointLight(new THREE.Color(type.color).getHex(), 2, 8);
  light.position.set(wx, 1.2, wz);
  scene.add(light);
  
  const pu = { typeIdx, wx, wz, mesh, light, life: 20, bobPhase: Math.random() * Math.PI * 2 };
  powerUps.push(pu);
  roundPowerUpsDropped++;
}

function updatePowerUps(dt) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.life -= dt;
    pu.bobPhase += dt * 3;
    
    // Bob and rotate
    pu.mesh.position.y = 0.8 + Math.sin(pu.bobPhase) * 0.15;
    pu.mesh.rotation.y += dt * 2;
    pu.mesh.rotation.x = Math.sin(pu.bobPhase * 0.7) * 0.2;
    
    // Pulse glow
    pu.light.intensity = 1.5 + Math.sin(pu.bobPhase * 2) * 0.5;
    
    // Flash when about to expire
    if (pu.life < 5) {
      pu.mesh.material.opacity = 0.4 + Math.sin(pu.life * 6) * 0.4;
    }
    
    // Check pickup (player walks over)
    const d = Math.hypot(pu.wx - camera.position.x, pu.wz - camera.position.z);
    if (d < 2) {
      // Collect!
      const type = POWERUP_TYPES[pu.typeIdx];
      type.apply();
      addFloatText(`${type.icon} ${type.name}!`, type.color, 3);
      beep(600, 'sine', 0.1, 0.12);
      setTimeout(() => beep(900, 'sine', 0.15, 0.12), 100);
      triggerScreenShake(0.3, 10);
      
      scene.remove(pu.mesh); scene.remove(pu.light);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
      powerUps.splice(i, 1);
      continue;
    }
    
    // Despawn
    if (pu.life <= 0) {
      scene.remove(pu.mesh); scene.remove(pu.light);
      pu.mesh.material.dispose(); pu.mesh.geometry.dispose();
      powerUps.splice(i, 1);
    }
  }
  
  // Update timed power-ups
  if (player._instaKill && player._instaKillTimer > 0) {
    player._instaKillTimer -= dt;
    if (player._instaKillTimer <= 0) { player._instaKill = false; addFloatText('Insta-Kill ended', '#888', 1.5); }
  }
  if (player._doublePoints && player._doublePointsTimer > 0) {
    player._doublePointsTimer -= dt;
    if (player._doublePointsTimer <= 0) { player._doublePoints = false; addFloatText('Double Points ended', '#888', 1.5); }
  }
}

buildMysteryBox();
buildPackAPunch();
updateLoadBar(65, 'Tuning radio frequencies...');

// ===== STORY / PROGRESSION SYSTEM =====

// --- Radio Transmissions (narrative between rounds) ---
const radioTransmissions = [
  { round: 1, speaker: 'COMMAND', text: 'Operative, this is Command. You\'ve been deployed to Facility 935. The dead are rising. Hold your position at all costs.', color: '#4af' },
  { round: 2, speaker: 'COMMAND', text: 'We\'re detecting increased anomalous activity. The breach originated from the west wing laboratory. Do NOT investigate... yet.', color: '#4af' },
  { round: 3, speaker: 'DR. RICHTER', text: '*static* ...the serum... it wasn\'t supposed to... they were already dead when we started the trials...', color: '#f84' },
  { round: 5, speaker: 'COMMAND', text: 'Good work surviving this long. Intel suggests the horde is being controlled. Find the source. We\'re detecting energy signatures from three generators.', color: '#4af' },
  { round: 7, speaker: 'DR. RICHTER', text: '*crackle* The Element 115... it binds them. Three generators power the containment field. If you could overload them... but the sequence matters...', color: '#f84' },
  { round: 10, speaker: 'COMMAND', text: 'Operative, radiation levels are spiking. Whatever Richter was working on, it\'s accelerating. Find those generators. That\'s an order.', color: '#4af' },
  { round: 12, speaker: '???', text: '*distorted voice* ...you think you can stop this? We are already free. The 115 chose US. It will choose you too...', color: '#f44' },
  { round: 15, speaker: 'DR. RICHTER', text: 'The generators! Red, Blue, Yellow — activate them in the correct order. I encoded the sequence in the facility... look at the walls... the symbols...', color: '#f84' },
  { round: 18, speaker: 'COMMAND', text: 'Operative, your extraction window is closing. Complete the objective or we\'ll be forced to enact Protocol Omega. You don\'t want that.', color: '#4af' },
  { round: 20, speaker: '???', text: '*laughing* Protocol Omega... they\'ll burn everything. You, us, the truth. But Element 115 cannot be destroyed. WE cannot be destroyed.', color: '#f44' },
  { round: 25, speaker: 'DR. RICHTER', text: 'If you\'ve activated all three generators... go to the central chamber. The machine there... it can reverse the breach. But it needs a catalyst. YOUR life force. Are you prepared to sacrifice?', color: '#f84' },
];

let radioActive = false;
let radioTimer = 0;
let radioCharIdx = 0;
let radioCurrentMsg = null;
let radioBlipTimer = 0;

function triggerRadioTransmission(roundNum) {
  const msg = radioTransmissions.find(r => r.round === roundNum);
  if (!msg) return;
  radioCurrentMsg = msg;
  radioActive = true;
  radioCharIdx = 0;
  radioTimer = 0;
  radioBlipTimer = 0;
  
  // Show radio UI
  const el = document.getElementById('radioOverlay');
  el.style.display = 'block';
  el.style.opacity = '1';
  document.getElementById('radioSpeaker').textContent = msg.speaker;
  document.getElementById('radioSpeaker').style.color = msg.color;
  document.getElementById('radioText').textContent = '';
  
  // Static burst
  if (actx && masterGain) {
    try {
      const bufLen = actx.sampleRate * 0.15;
      const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
      const noise = actx.createBufferSource(); noise.buffer = buf;
      const g = actx.createGain(); g.gain.value = 0.06;
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 1;
      noise.connect(f); f.connect(g); g.connect(masterGain); noise.start();
    } catch(e) {}
  }
}

function updateRadioTransmission(dt) {
  if (!radioActive || !radioCurrentMsg) return;
  
  radioTimer += dt;
  const msg = radioCurrentMsg;
  
  // Typewriter effect
  const charsPerSec = 35;
  const targetChars = Math.floor(radioTimer * charsPerSec);
  if (targetChars > radioCharIdx && radioCharIdx < msg.text.length) {
    radioCharIdx = Math.min(targetChars, msg.text.length);
    document.getElementById('radioText').textContent = msg.text.substring(0, radioCharIdx);
    
    // Radio blip sound
    radioBlipTimer += dt;
    if (radioBlipTimer > 0.04) {
      radioBlipTimer = 0;
      if (actx && masterGain) {
        try {
          const o = actx.createOscillator(), g = actx.createGain();
          o.type = 'square';
          o.frequency.value = 600 + Math.random() * 200;
          g.gain.setValueAtTime(0.015, actx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.03);
          o.connect(g); g.connect(masterGain);
          o.start(); o.stop(actx.currentTime + 0.03);
        } catch(e) {}
      }
    }
  }
  
  // Auto-close after text finishes + 4 seconds
  if (radioCharIdx >= msg.text.length) {
    radioTimer += 0; // keep counting
    const sinceComplete = radioTimer - (msg.text.length / charsPerSec);
    if (sinceComplete > 4) {
      closeRadio();
    }
    // Fade out in last second
    if (sinceComplete > 3) {
      document.getElementById('radioOverlay').style.opacity = String(1 - (sinceComplete - 3));
    }
  }
}

function closeRadio() {
  radioActive = false;
  radioCurrentMsg = null;
  document.getElementById('radioOverlay').style.display = 'none';
}

// --- Easter Egg Quest ---
const easterEgg = {
  generators: [
    { id: 'red', tx: 3, tz: 3, color: '#ff2222', activated: false, doorReq: 'west', label: 'RED GENERATOR' },
    { id: 'blue', tx: 22, tz: 16, color: '#2244ff', activated: false, doorReq: 'east', label: 'BLUE GENERATOR' },
    { id: 'yellow', tx: 15, tz: 21, color: '#ffdd00', activated: false, doorReq: null, label: 'YELLOW GENERATOR' },
  ],
  correctOrder: ['red', 'yellow', 'blue'], // The secret sequence
  activatedOrder: [],
  allActivated: false,
  catalystReady: false,
  catalystUsed: false,
  questComplete: false,
  catalystTx: 12, catalystTz: 12, // central chamber
};

const generatorMeshes = [];

function buildGenerators() {
  // Clean old
  generatorMeshes.forEach(gm => { scene.remove(gm.body); scene.remove(gm.light); scene.remove(gm.ring); });
  generatorMeshes.length = 0;
  
  easterEgg.generators.forEach(gen => {
    const gx = gen.tx * TILE + TILE / 2;
    const gz = gen.tz * TILE + TILE / 2;
    const color = new THREE.Color(gen.color);
    
    // Generator body (cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.8, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(gx, 0.9, gz);
    body.castShadow = true;
    scene.add(body);
    
    // Energy ring (torus)
    const ringGeo = new THREE.TorusGeometry(0.7, 0.05, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(gx, 1.2, gz);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    
    // Light
    const light = new THREE.PointLight(color.getHex(), 0.5, 10);
    light.position.set(gx, 2, gz);
    scene.add(light);
    
    generatorMeshes.push({ body, ring, light, gen });
  });
}

function tryActivateGenerator() {
  if (easterEgg.allActivated) return false;
  
  const px = camera.position.x, pz = camera.position.z;
  for (const gen of easterEgg.generators) {
    if (gen.activated) continue;
    
    // Check door requirement
    if (gen.doorReq) {
      const door = doors.find(d => d.id === gen.doorReq);
      if (!door || !door.opened) continue;
    }
    
    const gx = gen.tx * TILE + TILE / 2;
    const gz = gen.tz * TILE + TILE / 2;
    const d = Math.hypot(gx - px, gz - pz);
    if (d > TILE * 2) continue;
    
    // Activate!
    gen.activated = true;
    easterEgg.activatedOrder.push(gen.id);
    
    // Check if correct order
    const idx = easterEgg.activatedOrder.length - 1;
    const isCorrect = easterEgg.activatedOrder[idx] === easterEgg.correctOrder[idx];
    
    if (isCorrect) {
      addFloatText(`⚡ ${gen.label} ACTIVATED ⚡`, gen.color, 3);
      triggerScreenShake(0.8, 6);
      beep(400, 'sine', 0.15, 0.12);
      setTimeout(() => beep(600, 'sine', 0.15, 0.12), 120);
      setTimeout(() => beep(800, 'sine', 0.2, 0.1), 240);
      points += 500;
    } else {
      // Wrong order — reset all generators
      addFloatText('⚠ WRONG SEQUENCE ⚠', '#f44', 3);
      addFloatText('Generators reset...', '#888', 2.5);
      triggerScreenShake(1.5, 4);
      beep(200, 'sawtooth', 0.3, 0.15);
      easterEgg.generators.forEach(g => g.activated = false);
      easterEgg.activatedOrder = [];
    }
    
    // Check if all activated correctly
    if (easterEgg.activatedOrder.length === 3 && 
        easterEgg.activatedOrder.every((id, i) => id === easterEgg.correctOrder[i])) {
      easterEgg.allActivated = true;
      easterEgg.catalystReady = true;
      addFloatText('🔓 ALL GENERATORS ACTIVE!', '#0f0', 4);
      addFloatText('Go to the Central Chamber...', '#fc0', 3.5);
      triggerScreenShake(2, 4);
      // Dramatic sound
      setTimeout(() => {
        beep(200, 'sine', 0.3, 0.15);
        setTimeout(() => beep(300, 'sine', 0.3, 0.15), 200);
        setTimeout(() => beep(400, 'sine', 0.3, 0.15), 400);
        setTimeout(() => beep(600, 'sine', 0.5, 0.12), 600);
      }, 500);
    }
    
    return true;
  }
  return false;
}

function tryCatalyst() {
  if (!easterEgg.catalystReady || easterEgg.catalystUsed) return false;
  
  const cx = easterEgg.catalystTx * TILE + TILE / 2;
  const cz = easterEgg.catalystTz * TILE + TILE / 2;
  const d = Math.hypot(cx - camera.position.x, cz - camera.position.z);
  if (d > TILE * 2) return false;
  
  // Easter egg complete!
  easterEgg.catalystUsed = true;
  easterEgg.questComplete = true;
  
  // Massive reward
  points += 10000;
  player.maxHp = 250;
  player.hp = 250;
  
  // Visual spectacle
  triggerScreenShake(3, 3);
  const flash = document.getElementById('roundFlash');
  flash.style.display = 'block';
  flash.style.opacity = '0.8';
  flash.style.background = 'rgba(100,200,255,0.5)';
  setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => { flash.style.display = 'none'; flash.style.background = 'rgba(255,255,255,0.3)'; }, 800); }, 500);
  
  // Epic sound
  beep(200, 'sine', 0.5, 0.15);
  setTimeout(() => beep(400, 'sine', 0.5, 0.15), 300);
  setTimeout(() => beep(600, 'sine', 0.5, 0.15), 600);
  setTimeout(() => beep(800, 'sine', 0.5, 0.15), 900);
  setTimeout(() => beep(1200, 'sine', 1.0, 0.12), 1200);
  
  addFloatText('🏆 EASTER EGG COMPLETE! 🏆', '#0ff', 5);
  addFloatText('+10,000 POINTS · 250 MAX HP', '#fc0', 4);
  addFloatText('The breach is sealed...', '#4af', 3.5);
  addFloatText('But the dead still walk.', '#f84', 3);
  
  // Save to persistent unlocks
  saveUnlock('easterEggComplete', true);
  saveUnlock('highestEERound', round);
  
  return true;
}

function updateGenerators(dt) {
  const t = performance.now() / 1000;
  generatorMeshes.forEach(gm => {
    const activated = gm.gen.activated;
    gm.ring.material.opacity = activated ? 0.6 + Math.sin(t * 3) * 0.2 : 0.15 + Math.sin(t * 1.5) * 0.1;
    gm.ring.rotation.z += dt * (activated ? 3 : 0.5);
    gm.light.intensity = activated ? 2 + Math.sin(t * 4) * 0.5 : 0.3 + Math.sin(t * 1.5) * 0.15;
  });
  
  // Catalyst location glow (when ready)
  // This is handled via existing scene — just show float text hint periodically
}

// --- Persistent Unlock System ---
const UNLOCK_KEY = 'undeadSiege3dUnlocks';

function getUnlocks() {
  try {
    const d = localStorage.getItem(UNLOCK_KEY);
    if (d) return JSON.parse(d);
  } catch(e) {}
  return {};
}

function saveUnlock(key, value) {
  try {
    const unlocks = getUnlocks();
    unlocks[key] = value;
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocks));
  } catch(e) {}
}

function getUnlock(key, defaultVal) {
  const unlocks = getUnlocks();
  return unlocks[key] !== undefined ? unlocks[key] : defaultVal;
}

// Track persistent stats
function updatePersistentStats() {
  const unlocks = getUnlocks();
  const prevHighRound = unlocks.highestRound || 0;
  const prevTotalKills = unlocks.totalKillsAllTime || 0;
  const prevGamesPlayed = unlocks.gamesPlayed || 0;
  
  if (round > prevHighRound) saveUnlock('highestRound', round);
  saveUnlock('totalKillsAllTime', prevTotalKills + totalKills);
  saveUnlock('gamesPlayed', prevGamesPlayed + 1);
  saveUnlock('lastPlayed', new Date().toISOString());
}

// --- Unlock Tiers (displayed on menu) ---
function getPlayerRank() {
  const unlocks = getUnlocks();
  const totalKills = unlocks.totalKillsAllTime || 0;
  const highRound = unlocks.highestRound || 0;
  const eeComplete = unlocks.easterEggComplete || false;
  
  if (eeComplete && highRound >= 30) return { rank: '☠️ PRESTIGE', color: '#f0f', desc: 'Easter Egg Master' };
  if (highRound >= 25) return { rank: '⭐ VETERAN', color: '#fc0', desc: `Round ${highRound} survivor` };
  if (highRound >= 15) return { rank: '🎖️ SERGEANT', color: '#4af', desc: `${totalKills} total kills` };
  if (highRound >= 8) return { rank: '🔫 CORPORAL', color: '#4e4', desc: 'Showing promise' };
  if (totalKills >= 50) return { rank: '🪖 PRIVATE', color: '#aaa', desc: 'Battle-tested' };
  return { rank: '🆕 RECRUIT', color: '#666', desc: 'Fresh meat' };
}

function showMenuRank() {
  const rank = getPlayerRank();
  const unlocks = getUnlocks();
  let html = `<div style="color:${rank.color};font-size:13px;letter-spacing:2px;margin-bottom:4px">${rank.rank}</div>`;
  html += `<div style="color:#aaa;font-size:10px">${rank.desc}</div>`;
  if (unlocks.highestRound) {
    html += `<div style="color:#999;font-size:9px;margin-top:4px">Best: R${unlocks.highestRound} · ${unlocks.totalKillsAllTime || 0} lifetime kills</div>`;
  }
  if (unlocks.easterEggComplete) {
    html += `<div style="color:#0ff;font-size:9px;margin-top:2px">🏆 Easter Egg Completed</div>`;
  }
  // Insert rank display before high scores
  const scoresEl = document.getElementById('menuScores');
  const rankDiv = document.getElementById('menuRank') || document.createElement('div');
  rankDiv.id = 'menuRank';
  rankDiv.innerHTML = html;
  rankDiv.style.cssText = 'text-align:center;margin-bottom:10px;letter-spacing:1px;line-height:1.6';
  if (!rankDiv.parentNode) scoresEl.parentNode.insertBefore(rankDiv, scoresEl);
}


buildGenerators();
updateLoadBar(80, 'Charging Ray Gun...');
showMenuRank();

// ===== ZOMBIES =====
const zombies = [];

// Zombie sprite system & meshes extracted to src/entities/zombies.js

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
  vec.project(camera);
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
  camera.position.x -= _prevShakeX;
  camera.position.y -= _prevShakeY;

  if (shakeIntensity > 0.001) {
    _prevShakeX = (Math.random() - 0.5) * shakeIntensity * 0.015;
    _prevShakeY = (Math.random() - 0.5) * shakeIntensity * 0.015;
    camera.position.x += _prevShakeX;
    camera.position.y += _prevShakeY;
    shakeIntensity *= Math.pow(0.05, dt); // exponential decay
  } else {
    shakeIntensity = 0;
    _prevShakeX = 0;
    _prevShakeY = 0;
  }
}

// --- Muzzle Flash Particles (3D sparks) ---
const muzzleSparks = [];
const sparkGeo = new THREE.SphereGeometry(0.02, 3, 3);

function spawnMuzzleSparks() {
  if (!camera) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone().add(dir.clone().multiplyScalar(1.2));
  // Offset slightly to gun position
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  origin.add(right.multiplyScalar(0.15));
  origin.y -= 0.1;
  
  const w = weapons[player.curWeapon];
  const sparkColor = w.isRayGun ? 0x00ff44 : 0xffaa22;
  const sparkCount = w.isRayGun ? 6 : (player.curWeapon === 2 ? 10 : 4); // more for shotgun
  
  for (let i = 0; i < sparkCount; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: sparkColor, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    
    const spread = player.curWeapon === 2 ? 3 : 1.5;
    muzzleSparks.push({
      mesh,
      vx: dir.x * 8 + (Math.random() - 0.5) * spread,
      vy: dir.y * 8 + Math.random() * 2 + (Math.random() - 0.5) * spread,
      vz: dir.z * 8 + (Math.random() - 0.5) * spread,
      life: 0.08 + Math.random() * 0.12,
    });
  }
}

function updateMuzzleSparks(dt) {
  for (let i = muzzleSparks.length - 1; i >= 0; i--) {
    const s = muzzleSparks[i];
    s.life -= dt;
    if (s.life <= 0) {
      scene.remove(s.mesh);
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
  const { group, mesh, planeMat, tex, frameCanvas, hpSprite, hpCanvas, hpTex, eyeLight, spriteH } = data;
  
  // Hide HP bar and dim eye light immediately
  if (hpSprite) hpSprite.visible = false;
  if (eyeLight) eyeLight.intensity = 0;
  
  dyingZombies.push({
    mesh: group,        // the Group (contains plane + lights)
    planeMat,           // for fading
    tex,                // for disposal
    hpTex,              // for disposal
    frameCanvas,        // for disposal
    timer: 0,
    duration: 0.6 + Math.random() * 0.3,
    startY: group.position.y,
    fallDir: (Math.random() - 0.5) * 0.5,
    isBoss: z.isBoss,
    wx: z.wx, wz: z.wz,
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
      scene.remove(dz.mesh);
      // Dispose all children properly
      dz.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      if (dz.hpTex) dz.hpTex.dispose();
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
      
      scene.add(splat);
      bloodDecals.push({ mesh: splat, life: 15 + Math.random() * 10 }); // 15-25 seconds
      
      // Limit decal count
      while (bloodDecals.length > MAX_BLOOD_DECALS) {
        const old = bloodDecals.shift();
        scene.remove(old.mesh);
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
      scene.remove(d.mesh);
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
  vignetteIntensity = Math.min(1, vignetteIntensity + amount * 0.015);
}

function updateDamageVignette(dt) {
  if (vignetteIntensity > 0.01) {
    const vig = document.getElementById('dmgOverlay');
    vig.style.boxShadow = `inset 0 0 ${60 + vignetteIntensity * 100}px ${vignetteIntensity * 40}px rgba(180, 0, 0, ${vignetteIntensity * 0.5})`;
    vig.style.display = 'block';
    vignetteIntensity *= Math.pow(0.1, dt);
  } else {
    vignetteIntensity = 0;
    const vig = document.getElementById('dmgOverlay');
    vig.style.boxShadow = '';
  }
}

// --- Low Health Heartbeat Overlay ---
let heartbeatPhase = 0;

function updateLowHealthEffect(dt) {
  if (player.hp > 0 && player.hp < player.maxHp * 0.25 && state === 'playing') {
    heartbeatPhase += dt * 3; // heartbeat speed
    const pulse = Math.abs(Math.sin(heartbeatPhase));
    const vig = document.getElementById('dmgOverlay');
    const baseAlpha = 0.15 + pulse * 0.15;
    vig.style.boxShadow = `inset 0 0 80px 30px rgba(180, 0, 0, ${baseAlpha})`;
    vig.style.display = 'block';
  } else {
    heartbeatPhase = 0;
  }
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
  const px = camera.position.x;
  const pz = camera.position.z;
  const dx = zombieX - px;
  const dz = zombieZ - pz;
  // World angle to the zombie (atan2 gives angle from +Z axis)
  const worldAngle = Math.atan2(dx, dz);
  // Relative angle = world angle minus camera yaw
  // controls._yaw is the camera's yaw (rotation around Y axis)
  const relAngle = worldAngle - controls._yaw;
  
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
  hitDirCtx.clearRect(0, 0, hitDirCanvas.width, hitDirCanvas.height);
  
  const cx = hitDirCanvas.width / 2;
  const cy = hitDirCanvas.height / 2;
  // Distance from center to edge where arcs are drawn
  const radiusX = hitDirCanvas.width * 0.38;
  const radiusY = hitDirCanvas.height * 0.38;
  const arcLen = 0.55; // radians, width of the arc
  
  for (let i = hitIndicators.length - 1; i >= 0; i--) {
    const hi = hitIndicators[i];
    hi.life -= dt * 1.2; // fade over ~0.8 seconds
    
    if (hi.life <= 0) {
      hitIndicators.splice(i, 1);
      continue;
    }
    
    // The angle points FROM center TOWARD the attacker
    // In screen space: 0 = top, PI/2 = right, PI = bottom, -PI/2 = left
    const screenAngle = -hi.angle; // negate because screen Y is inverted
    
    // Calculate position on an ellipse at the screen edge
    const edgeX = cx + Math.sin(screenAngle) * radiusX;
    const edgeY = cy - Math.cos(screenAngle) * radiusY;
    
    // Alpha based on remaining life (quick fade in, slow fade out)
    const fadeIn = Math.min(1, (1 - hi.life) * 8); // quick fade in
    const fadeOut = Math.min(1, hi.life * 2.5);     // slower fade out  
    const alpha = fadeIn * fadeOut * hi.intensity * 0.85;
    
    if (alpha < 0.01) continue;
    
    hitDirCtx.save();
    hitDirCtx.translate(edgeX, edgeY);
    hitDirCtx.rotate(screenAngle);
    
    // Draw a CoD-style crescent/arc shape
    // The arc points inward toward the attacker direction
    const arcRadius = Math.min(hitDirCanvas.width, hitDirCanvas.height) * 0.12;
    
    // Outer arc
    hitDirCtx.beginPath();
    hitDirCtx.arc(0, 0, arcRadius, -arcLen, arcLen);
    // Inner arc (smaller radius, reversed direction to close the shape)
    const innerRadius = arcRadius * 0.55;
    hitDirCtx.arc(0, 0, innerRadius, arcLen, -arcLen, true);
    hitDirCtx.closePath();
    
    // Red gradient fill
    const grad = hitDirCtx.createRadialGradient(0, 0, innerRadius, 0, 0, arcRadius * 1.3);
    grad.addColorStop(0, `rgba(220, 20, 0, ${alpha})`);
    grad.addColorStop(0.5, `rgba(180, 0, 0, ${alpha * 0.8})`);
    grad.addColorStop(1, `rgba(120, 0, 0, 0)`);
    hitDirCtx.fillStyle = grad;
    hitDirCtx.fill();
    
    // Brighter core for emphasis
    hitDirCtx.beginPath();
    hitDirCtx.arc(0, 0, arcRadius * 0.92, -arcLen * 0.7, arcLen * 0.7);
    hitDirCtx.arc(0, 0, innerRadius * 1.15, arcLen * 0.7, -arcLen * 0.7, true);
    hitDirCtx.closePath();
    hitDirCtx.fillStyle = `rgba(255, 40, 20, ${alpha * 0.6})`;
    hitDirCtx.fill();
    
    hitDirCtx.restore();
    
    // Decay intensity for stacked hits
    hi.intensity = Math.max(0.5, hi.intensity - dt * 0.3);
  }
}

function clearHitIndicators() {
  hitIndicators.length = 0;
  hitDirCtx.clearRect(0, 0, hitDirCanvas.width, hitDirCanvas.height);
}

// ===== PARTICLES =====
const particles = [];
const particleGeo = new THREE.SphereGeometry(0.05, 4, 4);

function spawnBloodParticles(x, y, z, count = 5) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*3,
      vy: Math.random()*3 + 1,
      vz: (Math.random()-0.5)*3,
      life: 0.5 + Math.random()*0.5,
    });
  }
}

function spawnEnergyParticles(x, y, z, count = 8) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(1.5);
    scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*5,
      vy: Math.random()*4 + 2,
      vz: (Math.random()-0.5)*5,
      life: 0.7 + Math.random()*0.5,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vy -= 9.8 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    p.mesh.material.opacity = p.life;
  }
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

// ===== GAME INIT =====
function initGame() {
  _deathShown = false; // reset death guard for new game
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
  
  // Reset per-weapon mag tracking
  for (const k in weaponMags) delete weaponMags[k];
  
  // Clear zombies
  zombies.forEach(z => removeZombieMesh(z));
  zombies.length = 0;
  
  // Clear particles
  particles.forEach(p => { scene.remove(p.mesh); p.mesh.material.dispose(); });
  particles.length = 0;
  floatTexts.length = 0;
  
  // Reset weapons to original stats (undo PaP)
  for (let i = 0; i < weapons.length; i++) {
    weapons[i].name = origWeaponStats[i].name;
    weapons[i].dmg = origWeaponStats[i].dmg;
    weapons[i].mag = origWeaponStats[i].mag;
    weapons[i].maxAmmo = origWeaponStats[i].maxAmmo;
  }
  packAPunch.upgraded = {};
  
  // Reset mystery box
  mysteryBox.isSpinning = false; mysteryBox.spinTimer = 0;
  mysteryBox.collectTimer = 0; mysteryBox.resultWeaponIdx = -1;
  
  // Clear power-ups
  powerUps.forEach(pu => { scene.remove(pu.mesh); if (pu.light) scene.remove(pu.light); if (pu.mesh.material) pu.mesh.material.dispose(); if (pu.mesh.geometry) pu.mesh.geometry.dispose(); });
  powerUps.length = 0;
  player._instaKill = false; player._instaKillTimer = 0;
  player._doublePoints = false; player._doublePointsTimer = 0;
  
  // Build mystery box & PaP
  buildMysteryBox();
  buildPackAPunch();
  
  // Reset easter egg
  easterEgg.generators.forEach(g => g.activated = false);
  easterEgg.activatedOrder = [];
  easterEgg.allActivated = false;
  easterEgg.catalystReady = false;
  easterEgg.catalystUsed = false;
  easterEgg.questComplete = false;
  buildGenerators();
  closeRadio();
  
  // Clear visual juice
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
  shakeIntensity = 0; _prevShakeX = 0; _prevShakeY = 0; vignetteIntensity = 0; clearHitIndicators();
  roundTransitionPhase = 'none';
  document.getElementById('roundFlash').style.display = 'none';
  
  // Reset map and doors
  map = [...mapData];
  doors.forEach(d => { d.opened = false; });
  doorsOpenedCount = 0;
  
  // Rebuild 3D map
  buildMap();
  buildPerkMachines();
  
  // Vibe Jam portals
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
  roundPowerUpsDropped = 0;
  maxAlive = Math.min(6 + round * 2 + doorsOpenedCount * 2, 30);
  spawnTimer = 0;
  state = 'roundIntro';
  roundIntroTimer = 3;
  sfxRound();
  showCenterMsg(`ROUND ${round}`, `${zToSpawn} zombies${round%5===0 ? ' · 💀 BOSS ROUND' : ''}`, '#c00', 3);
  // Radio transmission
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
  // Filter: must be at least 3 tiles away from player so they don't spawn in your face
  const minDist = TILE * 3;
  const viable = candidates.filter(c => c.d >= minDist);
  const pool = viable.length > 0 ? viable : candidates;
  // Weighted random: prefer medium distance (not always farthest corner)
  // Weight = 1/d so closer-viable spawns are slightly more likely → more natural spread
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
  let spd = (baseSpd + tier * 15) / 14; // convert to world units/sec
  let dmg = Math.floor((10 + round * 3) * (1 + tier * 0.3));
  
  let isBoss = false, isElite = false;
  if (round % 5 === 0 && zSpawned === zToSpawn - 1) {
    isBoss = true;
    // Boss HP scales aggressively: R5=12x, R10=17x, R15=22x, R20=27x, R25=32x
    const bossHpMult = 12 + Math.floor((round - 5) / 5) * 5;
    hp *= bossHpMult;
    spd *= 0.6; dmg *= 4;
  } else if (round >= 3 && Math.random() < 0.15) {
    isElite = true; hp = Math.floor(hp * 2.5); spd *= 1.15; dmg = Math.floor(dmg * 1.8);
  }
  
  // Speed variation: some fast runners, some slow shamblers, some limpers
  const speedRoll = Math.random();
  let speedMult, hasLimp;
  if (speedRoll < 0.12) {
    // Fast runner (12%) — noticeably quicker but not absurd
    speedMult = 1.05 + Math.random() * 0.15;
    hasLimp = false;
  } else if (speedRoll < 0.32) {
    // Slow shambler (20%)
    speedMult = 0.45 + Math.random() * 0.2;
    hasLimp = false;
  } else if (speedRoll < 0.55) {
    // Limper (20%)
    speedMult = 0.5 + Math.random() * 0.3;
    hasLimp = true;
  } else {
    // Normal variation (45%)
    speedMult = 0.75 + Math.random() * 0.5;
    hasLimp = false;
  }
  if (isBoss) { speedMult = 0.7; hasLimp = false; }
  if (isElite) { speedMult = 1.15 + Math.random() * 0.2; hasLimp = false; }
  spd *= speedMult;

  const z = {
    wx: pick.wx,
    wz: pick.wz,
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
  // Add small random offset but validate it's not inside a wall
  const offX = (Math.random()-0.5)*1.5;
  const offZ = (Math.random()-0.5)*1.5;
  if (mapAt(z.wx + offX, z.wz + offZ) === 0) { z.wx += offX; z.wz += offZ; }
  else if (mapAt(z.wx + offX, z.wz) === 0) { z.wx += offX; }
  else if (mapAt(z.wx, z.wz + offZ) === 0) { z.wz += offZ; }
  // else: stay at exact spawn point (guaranteed valid)
  zombies.push(z);
  zSpawned++;
  createZombieMesh(z);
}


// ===== INPUT =====
const gameKeys = ['w','a','s','d','r','e','q','1','2','3','4'];
let _quickSwapWeapon = 0; // for Q quick-swap
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

// Scroll wheel weapon switching
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

// Pointer lock pause (uses controls.isLocked which is set by our custom handler above)
document.addEventListener('pointerlockchange', () => {
  if (!controls.isLocked) {
    // Don't trigger pause during the start transition (pointer lock may briefly drop)
    // Also don't pause if state is 'menu' or 'dead' — those use the blocker overlay
    if ((state === 'playing' || state === 'roundIntro') && !paused && !_startingGame) {
      paused = true;
      showPause();
    }
  }
});
// Click on canvas: resume from pause, or re-lock pointer
renderer.domElement.addEventListener('click', () => {
  if ((state === 'playing' || state === 'roundIntro') && paused) {
    paused = false; hidePause();
    controls.lock();
  } else if ((state === 'playing' || state === 'roundIntro') && !controls.isLocked) {
    controls.lock();
  }
});
// Also allow clicking the pause overlay itself to resume
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
  
  // Build weapon switcher
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
  
  // Show mobile-friendly controls on menu
  const ctrlInfo = document.getElementById('controlsInfo');
  if (ctrlInfo) ctrlInfo.innerHTML = 'Joystick move · Swipe aim · Tap FIRE<br>Tap buttons to reload/buy/switch';
  
  // Joystick
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
  
  // Fire button
  document.getElementById('fireBtn').addEventListener('touchstart', e => { e.preventDefault(); mobileFiring = true; initAudio(); startBackgroundMusic(); });
  document.getElementById('fireBtn').addEventListener('touchend', e => { e.preventDefault(); mobileFiring = false; });
  
  // Reload button
  document.getElementById('reloadBtn').addEventListener('touchstart', e => { e.preventDefault(); doReload(); });
  
  // Buy button
  document.getElementById('buyBtn').addEventListener('touchstart', e => { e.preventDefault(); tryBuy(); });
  
  // Touch look (right side of screen — adjusted sensitivity for mobile)
  const touchSensitivity = 0.004; // slightly higher for responsive feel on mobile
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
  sfxShoot(); // routes to weapon-specific sound
  gunKick = 1;
  spawnMuzzleSparks();
  // Screen shake: heavier for shotgun/raygun
  const shakeAmt = player.curWeapon === 2 ? 0.6 : (w.isRayGun ? 0.4 : 0.2);
  triggerScreenShake(shakeAmt, 10);
  
  // Muzzle flash
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
      // Cylinder hitbox: check if ray passes within hitRadius of zombie's vertical axis
      const zScale = z.isBoss ? 1.6 : z.isElite ? 1.2 : 1;
      const zHeight = 2.2 * zScale;
      const hitRadius = z.isBoss ? 1.4 : z.isElite ? 1.0 : 0.8;

      // Vector from camera to zombie base in XZ
      const ox = camera.position.x - z.wx;
      const oz = camera.position.z - z.wz;

      const dxS = shootDir.x, dyS = shootDir.y, dzS = shootDir.z;
      const dxdz2 = dxS * dxS + dzS * dzS;
      if (dxdz2 < 0.0001) continue;

      // Find t where ray is closest to zombie's vertical axis in XZ
      const tClosest = -(ox * dxS + oz * dzS) / dxdz2;
      if (tClosest < 0.3) continue; // too close or behind

      // Horizontal distance squared at closest approach
      const hDistSq = (ox + tClosest * dxS) ** 2 + (oz + tClosest * dzS) ** 2;
      if (hDistSq > hitRadius * hitRadius) continue;

      // Y position of ray at closest approach — must be within zombie height
      const yAtClosest = camera.position.y + tClosest * dyS;
      if (yAtClosest < -0.3 || yAtClosest > zHeight + 0.3) continue;

      // Wall occlusion check
      let blocked = false;
      const step = TILE * 0.25;
      for (let t = step; t < tClosest; t += step) {
        const cx = camera.position.x + dxS * t;
        const cz = camera.position.z + dzS * t;
        if (mapAt(cx, cz) !== 0) { blocked = true; break; }
      }
      if (!blocked && tClosest < bestD) {
        bestD = tClosest;
        bestZ = z;
      }
    }
    
    if (bestZ) {
      bestZ.hp -= w.dmg;
      bestZ.flash = 1;
      sfxHit();
      points += player._doublePoints ? 20 : 10;
      // Insta-kill: any hit kills
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
          if (w.isRayGun) {
            // Green energy explosion
            spawnEnergyParticles(bestZ.wx, 1, bestZ.wz, 10);
          } else {
            spawnBloodParticles(bestZ.wx, 1, bestZ.wz, 8);
          }
          const c = bestZ.isBoss ? '#f44' : bestZ.isElite ? '#ff8' : '#fc0';
          addFloatText(bestZ.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, bestZ.isBoss ? 2.5 : 1);
          // Death animation: dissolve + collapse instead of instant remove
          startZombieDeathAnim(bestZ);
          // Blood splatter on nearby walls
          spawnBloodSplatter(bestZ.wx, 1.2, bestZ.wz);
          // Chance to drop power-up
          spawnPowerUp(bestZ.wx, bestZ.wz);
          // Screen shake on kills (bigger for boss)
          triggerScreenShake(bestZ.isBoss ? 1.5 : bestZ.isElite ? 0.5 : 0.15, 8);
          removeZombieMesh(bestZ);
          zombies.splice(idx, 1);
          if (bestZ.isBoss) {
            sfxBossKill();
            triggerScreenShake(2.5, 5); // massive boss death shake
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

// Track per-weapon magazine state
const weaponMags = {};

function switchWeapon(idx) {
  if (idx === player.curWeapon || !player.owned[idx]) return;
  if (state !== 'playing' && state !== 'roundIntro') return; // block switching when dead/paused
  // Save current weapon's mag count
  weaponMags[player.curWeapon] = player.mag;
  _quickSwapWeapon = player.curWeapon; // track for Q quick-swap
  player.curWeapon = idx;
  // Restore the target weapon's mag (or full if first time)
  player.mag = (weaponMags[idx] !== undefined) ? weaponMags[idx] : weapons[idx].mag;
  player.reloading = false;
  player.reloadTimer = 0;
  sfxWeaponSwitch();
}

// ===== BUYING =====
function tryBuy() {
  const px = camera.position.x, pz = camera.position.z;
  
  // Wall buys
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
        // Save current weapon's magazine before switching
        weaponMags[player.curWeapon] = player.mag;
        player.owned[wb.wi] = true;
        player.curWeapon = wb.wi;
        player.mag = weapons[wb.wi].mag;
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        player.reloading = false;
        player.reloadTimer = 0;
        sfxBuyWeapon(weapons[wb.wi].isRayGun);
        if (weapons[wb.wi].isRayGun) {
          addFloatText(`⚡ RAY GUN ⚡`, '#0f0', 2.5);
        } else {
          addFloatText(`${weapons[wb.wi].name}!`, '#6f6', 1.5);
        }
      } else if (player.owned[wb.wi] && points >= Math.floor(wb.cost/2)) {
        points -= Math.floor(wb.cost/2);
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        sfxBuyWeapon(false);
        addFloatText('Ammo!', '#6f6', 1);
      }
      return;
    }
  }
  
  // Perk machines
  for (const pm of perkMachines) {
    const perk = perks[pm.perkIdx];
    const bx = (pm.tx + 0.5) * TILE, bz = (pm.tz + 0.5) * TILE;
    const d = Math.hypot(bx - px, bz - pz);
    if (d < TILE * 2) {
      if (player.perksOwned[perk.id]) {
        addFloatText(`Already have ${perk.name}`, '#888');
      } else if (round < perk.minRound) {
        addFloatText(`${perk.name} unlocks round ${perk.minRound}`, '#888');
      } else if (points >= perk.cost) {
        points -= perk.cost;
        player.perksOwned[perk.id] = true;
        perk.apply();
        sfxBuyPerk();
        addFloatText(`${perk.name} ACTIVE!`, perk.color, 2.5);
      } else {
        addFloatText(`Need $${perk.cost} for ${perk.name}`, '#f88');
      }
      return;
    }
  }
  
  // Easter egg generators + catalyst
  if (tryActivateGenerator()) return;
  if (tryCatalyst()) return;
  
  // Mystery Box
  if (tryMysteryBox()) return;
  if (collectMysteryBoxWeapon()) return;
  
  // Pack-a-Punch
  if (tryPackAPunch()) return;
  
  // Doors
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
          // Remove door from map
          for (const [dtx, dtz] of door.tiles) {
            map[dtz * MAP_W + dtx] = 0;
          }
          // Remove door meshes from scene
          doorMeshes.filter(dm => door.tiles.some(([dx,dz]) => dm.x === dx && dm.z === dz))
            .forEach(dm => { scene.remove(dm.mesh); });
          
          sfxDoorOpen();
          zToSpawn += 4;
          maxAlive = Math.min(maxAlive + 3, 30);
          addFloatText(`${door.label} OPENED!`, '#4f4', 2.5);
          addFloatText('More zombies incoming!', '#f84', 2);
        } else {
          addFloatText(`Need $${door.cost} for ${door.label}`, '#f88');
        }
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
  
  // Weapon timers
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  gunKick = Math.max(0, gunKick - dt * 6);
  dmgFlash = Math.max(0, dmgFlash - dt * 4);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 20);
  playerLight.position.copy(camera.position);
  
  // Quick Revive HP regen
  if (player.hpRegen && player.hp < player.maxHp && player.hp > 0) {
    player.hpRegenTimer += dt;
    if (player.hpRegenTimer >= 2) { player.hp = Math.min(player.hp + 5, player.maxHp); player.hpRegenTimer = 0; }
  }
  
  // Reloading
  if (player.reloading) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) finishReload();
  }
  
  // Shooting
  const w = weapons[player.curWeapon];
  const isFiring = mouseDown || mobileFiring;
  if (isFiring && state === 'playing') {
    if (w.auto) { tryShoot(); }
    else { if (!player._lastFiring) tryShoot(); }
  }
  player._lastFiring = isFiring;
  
  // Key actions — weapon switching
  if (keyPressed('1') && player.owned[0]) { _quickSwapWeapon = player.curWeapon; switchWeapon(0); }
  if (keyPressed('2') && player.owned[1]) { _quickSwapWeapon = player.curWeapon; switchWeapon(1); }
  if (keyPressed('3') && player.owned[2]) { _quickSwapWeapon = player.curWeapon; switchWeapon(2); }
  if (keyPressed('4') && player.owned[3]) { _quickSwapWeapon = player.curWeapon; switchWeapon(3); }
  if (keyPressed('q') && player.owned[_quickSwapWeapon]) { const prev = player.curWeapon; switchWeapon(_quickSwapWeapon); _quickSwapWeapon = prev; }
  if (keyPressed('r')) doReload();
  if (keyPressed('e')) tryBuy();
  
  // Spawn zombies
  if (zSpawned < zToSpawn) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && zombies.length < maxAlive) {
      spawnZombie();
      spawnTimer = Math.max(0.5, 2.5 - round * 0.12);
    }
  }
  
  // Update zombies
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    z.flash = Math.max(0, z.flash - dt * 5);
    
    const dx = camera.position.x - z.wx;
    const dz = camera.position.z - z.wz;
    const d = Math.hypot(dx, dz);
    
    if (d > 1.5) {
      // Limp: oscillate speed, causing stutter-step movement
      let curSpd = z.spd;
      if (z._hasLimp) {
        z._limpPhase += dt * (3 + z._limpSeverity * 2);
        const limpFactor = 1 - z._limpSeverity * (0.5 + 0.5 * Math.sin(z._limpPhase));
        curSpd = z._baseSpd * Math.max(0.1, limpFactor);
      }
      let mx = (dx / d) * curSpd * dt;
      let mz = (dz / d) * curSpd * dt;
      
      // Separation
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
      
      // Stuck detection — conservative: only act on truly stuck zombies
      // Uses longer timers to avoid false positives from corner navigation
      if (!z.stuckCheck) z.stuckCheck = { x: z.wx, z: z.wz, timer: 0, totalStuck: 0 };
      z.stuckCheck.timer += dt;
      if (z.stuckCheck.timer >= 4) {
        const stuckDist = Math.hypot(z.wx - z.stuckCheck.x, z.wz - z.stuckCheck.z);
        // Only flag if zombie moved less than 0.3 tiles in 4 seconds (truly stuck)
        if (stuckDist < TILE * 0.3) {
          z.stuckCheck.totalStuck += z.stuckCheck.timer;
          
          // Safety net: if stuck for 12+ seconds total, silently kill
          if (z.stuckCheck.totalStuck >= 12) {
            z.hp = 0;
            removeZombieMesh(z);
            zombies.splice(i, 1);
            continue;
          }
          
          // Give the zombie a nudge toward the player rather than teleporting
          // This looks natural — zombie "breaks free" and continues toward you
          const nudgeStr = TILE * 1.5;
          const nudgeX = (dx / d) * nudgeStr;
          const nudgeZ = (dz / d) * nudgeStr;
          // Try nudging toward player
          if (mapAt(z.wx + nudgeX, z.wz + nudgeZ) === 0) {
            z.wx += nudgeX;
            z.wz += nudgeZ;
          } else if (mapAt(z.wx + nudgeX, z.wz) === 0) {
            z.wx += nudgeX;
          } else if (mapAt(z.wx, z.wz + nudgeZ) === 0) {
            z.wz += nudgeZ;
          } else {
            // Try perpendicular directions to get unstuck
            const perpX = (-dz / d) * nudgeStr;
            const perpZ = (dx / d) * nudgeStr;
            if (mapAt(z.wx + perpX, z.wz + perpZ) === 0) {
              z.wx += perpX; z.wz += perpZ;
            } else if (mapAt(z.wx - perpX, z.wz - perpZ) === 0) {
              z.wx -= perpX; z.wz -= perpZ;
            }
            // If everything fails, just wait for the safety net kill
          }
        } else {
          z.stuckCheck.totalStuck = 0; // reset if zombie moved
        }
        z.stuckCheck.x = z.wx;
        z.stuckCheck.z = z.wz;
        z.stuckCheck.timer = 0;
      }
    }
    
    // Attack — skip if player already dead
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
          break; // stop processing zombie attacks immediately
        }
      }
    }
    
    updateZombieMesh(z, dt);
  }
  
  // Particles
  updateParticles(dt);
  
  // Float texts
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].life -= dt;
    floatTexts[i].y -= 0.03 * dt;
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }
  
  // Ambient sounds (zombie groans, wind, distant screams)
  updateAmbientSounds(dt);
  
  // Mystery box + power-ups
  updateMysteryBox(dt);
  updatePowerUps(dt);
  
  // Story
  updateRadioTransmission(dt);
  updateGenerators(dt);
  
  // Round complete
  if (zSpawned >= zToSpawn && zombies.length === 0) {
    const bonus = round * 100;
    points += bonus;
    sfxRoundEnd();
    triggerRoundTransition();
    addFloatText(`+${bonus} ROUND BONUS`, '#fc0', 2);
    nextRound();
  }
  
  // Save prevKeys
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
  
  // Head bob
  if (!isMobile) {
    camera.position.y = 1.6 + Math.sin(player.bobPhase) * 0.06;
  }
}

// ===== HUD UPDATE =====
function updateHUD() {
  const w = weapons[player.curWeapon];
  document.querySelector('#ammoBox .wname').textContent = w.name;
  document.querySelector('#ammoBox .wname').style.color = w.color;
  const ammoEl = document.querySelector('#ammoBox .ammo');
  const reloadBarWrap = document.getElementById('reloadBarWrap');
  const reloadFill = document.getElementById('reloadFill');
  const reloadTimeEl = document.getElementById('reloadTime');
  if (player.reloading) {
    const remaining = Math.max(0, player.reloadTimer).toFixed(1);
    ammoEl.textContent = `${remaining}s`;
    ammoEl.className = 'ammo reloading';
    const pct = Math.max(0, Math.min(100, ((player.reloadTotal - player.reloadTimer) / player.reloadTotal) * 100));
    reloadBarWrap.style.display = 'block';
    reloadFill.style.width = pct + '%';
    reloadTimeEl.style.display = 'block';
    reloadTimeEl.textContent = `RELOADING`;
  } else {
    ammoEl.textContent = `${player.mag} / ${player.ammo[player.curWeapon] === 999 ? '∞' : player.ammo[player.curWeapon]}`;
    ammoEl.className = 'ammo';
    reloadBarWrap.style.display = 'none';
    reloadTimeEl.style.display = 'none';
  }
  
  document.querySelector('#pointsBox .val').textContent = points;
  document.querySelector('#roundBox .val').textContent = round;
  document.getElementById('killsLabel').textContent = `KILLS: ${totalKills}`;
  
  // HP bar (polished)
  const hpPct = (player.hp / player.maxHp) * 100;
  const hpFillEl = document.getElementById('hpFill');
  hpFillEl.style.width = `${hpPct}%`;
  if (hpPct < 25) { hpFillEl.style.background = 'linear-gradient(180deg,#f33 0%,#c00 50%,#800 100%)'; }
  else if (hpPct < 50) { hpFillEl.style.background = 'linear-gradient(180deg,#e62 0%,#b40 50%,#823 100%)'; }
  else { hpFillEl.style.background = 'linear-gradient(180deg,#e22 0%,#a00 50%,#811 100%)'; }
  document.getElementById('hpVal').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  
  // Boss bar
  const boss = zombies.find(z => z.isBoss);
  document.getElementById('bossBarWrap').style.display = boss ? 'block' : 'none';
  document.getElementById('bossLabel').style.display = boss ? 'block' : 'none';
  if (boss) {
    document.getElementById('bossFill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
  
  // Perks
  const perkEl = document.getElementById('perkIcons');
  let perkHTML = '';
  for (const p of perks) {
    if (player.perksOwned[p.id]) {
      perkHTML += `<div class="perk-icon" style="border-color:${p.color};color:${p.color}">${p.name.substring(0,3).toUpperCase()}</div>`;
    }
  }
  // Active power-ups — use wider pill-style icons so text doesn't clip
  if (player._instaKill && player._instaKillTimer > 0) {
    perkHTML += `<div class="perk-icon powerup-active" style="border-color:#f44;color:#f44">💀 ${Math.ceil(player._instaKillTimer)}s</div>`;
  }
  if (player._doublePoints && player._doublePointsTimer > 0) {
    perkHTML += `<div class="perk-icon powerup-active" style="border-color:#ff4;color:#ff4">💰 ${Math.ceil(player._doublePointsTimer)}s</div>`;
  }
  perkEl.innerHTML = perkHTML;
  
  // Buy prompt
  const buyEl = document.getElementById('buyPrompt');
  const buyBtnEl = document.getElementById('buyBtn');
  let buyText = '';
  const px = camera.position.x, pz = camera.position.z;
  const keyLabel = isMobile ? 'TAP' : '[E]';
  
  for (const wb of wallBuys) {
    const bx = (wb.tx+0.5)*TILE, bz = (wb.tz+0.5)*TILE;
    if (Math.hypot(bx-px, bz-pz) < TILE*2) {
      if (wb.minRound && round < wb.minRound) {
        buyText = `${weapons[wb.wi].name} - Unlocks Round ${wb.minRound}`;
      } else {
        buyText = player.owned[wb.wi] ?
          `${keyLabel} Ammo ${weapons[wb.wi].name} - $${Math.floor(wb.cost/2)}` :
          `${keyLabel} Buy ${weapons[wb.wi].name} - $${wb.cost}`;
      }
      break;
    }
  }
  if (!buyText) {
    for (const pm of perkMachines) {
      const perk = perks[pm.perkIdx];
      const bx = (pm.tx+0.5)*TILE, bz = (pm.tz+0.5)*TILE;
      if (Math.hypot(bx-px, bz-pz) < TILE*2) {
        if (player.perksOwned[perk.id]) buyText = `${perk.name} (OWNED)`;
        else if (round < perk.minRound) buyText = `${perk.name} - Unlocks Round ${perk.minRound}`;
        else buyText = `${keyLabel} ${perk.name} (${perk.desc}) - $${perk.cost}`;
        break;
      }
    }
  }
  if (!buyText) {
    for (const door of doors) {
      if (door.opened) continue;
      for (const [tx, tz] of door.tiles) {
        const bx = (tx+0.5)*TILE, bz = (tz+0.5)*TILE;
        if (Math.hypot(bx-px, bz-pz) < TILE*2.5) {
          buyText = `${keyLabel} Open ${door.label} - $${door.cost}`;
          break;
        }
      }
      if (buyText) break;
    }
  }
  // Mystery Box prompt
  if (!buyText) {
    const mbx = (mysteryBox.tx+0.5)*TILE, mbz = (mysteryBox.tz+0.5)*TILE;
    if (Math.hypot(mbx-px, mbz-pz) < TILE*2.5) {
      if (mysteryBox.collectTimer > 0 && mysteryBox.resultWeaponIdx >= 0) {
        buyText = `${keyLabel} Grab ${weapons[mysteryBox.resultWeaponIdx].name}`;
      } else if (mysteryBox.isSpinning) {
        buyText = '🎰 Spinning...';
      } else {
        buyText = `${keyLabel} Mystery Box - $${mysteryBox.cost}`;
      }
    }
  }
  // Generator prompts
  if (!buyText) {
    for (const gen of easterEgg.generators) {
      if (gen.activated) continue;
      if (gen.doorReq) {
        const door = doors.find(d => d.id === gen.doorReq);
        if (!door || !door.opened) continue;
      }
      const gx = (gen.tx+0.5)*TILE, gz = (gen.tz+0.5)*TILE;
      if (Math.hypot(gx-px, gz-pz) < TILE*2) {
        buyText = `${keyLabel} Activate ${gen.label}`;
        break;
      }
    }
  }
  // Catalyst prompt
  if (!buyText && easterEgg.catalystReady && !easterEgg.catalystUsed) {
    const cx = (easterEgg.catalystTx+0.5)*TILE, cz = (easterEgg.catalystTz+0.5)*TILE;
    if (Math.hypot(cx-px, cz-pz) < TILE*2) {
      buyText = `${keyLabel} ACTIVATE THE MACHINE`;
    }
  }
  // Pack-a-Punch prompt
  if (!buyText) {
    const ppx = (packAPunch.tx+0.5)*TILE, ppz = (packAPunch.tz+0.5)*TILE;
    if (Math.hypot(ppx-px, ppz-pz) < TILE*2.5) {
      const wi = player.curWeapon;
      if (packAPunch.upgraded[wi]) {
        buyText = `${weapons[wi].name} (UPGRADED)`;
      } else {
        buyText = `${keyLabel} Pack-a-Punch ${weapons[wi].name} - $${packAPunch.cost}`;
      }
    }
  }
  
  buyEl.style.display = buyText ? 'block' : 'none';
  buyEl.textContent = buyText;
  if (buyBtnEl) buyBtnEl.style.display = buyText && isMobile ? 'flex' : 'none';
  
  // Damage overlay
  const dmgEl = document.getElementById('dmgOverlay');
  if (dmgFlash > 0) dmgEl.classList.add('flash');
  else dmgEl.classList.remove('flash');
  
  // Power-up timer bar (centered below round indicator)
  const puBar = document.getElementById('powerupTimerBar');
  const puFill = document.getElementById('powerupTimerFill');
  const puLabel = document.getElementById('powerupTimerLabel');
  const hasInsta = player._instaKill && player._instaKillTimer > 0;
  const hasDbl = player._doublePoints && player._doublePointsTimer > 0;
  if (hasInsta || hasDbl) {
    puBar.style.display = 'block';
    puLabel.style.display = 'block';
    const PU_DUR = 15; // matches apply() duration
    if (hasInsta && hasDbl) {
      const iPct = (player._instaKillTimer / PU_DUR) * 50;
      const dPct = (player._doublePointsTimer / PU_DUR) * 50;
      puFill.style.width = (iPct + dPct) + '%';
      puFill.style.background = `linear-gradient(90deg, #f44 0%, #f44 ${iPct/(iPct+dPct)*100}%, #fc0 ${iPct/(iPct+dPct)*100}%, #fc0 100%)`;
      puLabel.style.color = '#f88';
      puLabel.textContent = `💀 ${Math.ceil(player._instaKillTimer)}s  💰 ${Math.ceil(player._doublePointsTimer)}s`;
    } else if (hasInsta) {
      puFill.style.width = (player._instaKillTimer / PU_DUR) * 100 + '%';
      puFill.style.background = '#f44';
      puLabel.style.color = '#f66';
      puLabel.textContent = `💀 INSTA-KILL ${Math.ceil(player._instaKillTimer)}s`;
    } else {
      puFill.style.width = (player._doublePointsTimer / PU_DUR) * 100 + '%';
      puFill.style.background = '#fc0';
      puLabel.style.color = '#fc0';
      puLabel.textContent = `💰 DOUBLE POINTS ${Math.ceil(player._doublePointsTimer)}s`;
    }
    // Pulse when less than 5 seconds remain
    const lowestTimer = Math.min(
      hasInsta ? player._instaKillTimer : 999,
      hasDbl ? player._doublePointsTimer : 999
    );
    const pulseAlpha = lowestTimer < 5 ? (0.5 + Math.sin(performance.now() / 150) * 0.5) : 1;
    puBar.style.opacity = pulseAlpha;
    puLabel.style.opacity = pulseAlpha;
  } else {
    puBar.style.display = 'none';
    puLabel.style.display = 'none';
  }
  
  // Mobile weapon switcher active state
  if (isMobile) {
    document.querySelectorAll('.wsBtn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      const owned = player.owned[idx];
      const active = idx === player.curWeapon;
      btn.className = `wsBtn${active ? ' active' : ''}${!owned ? ' locked' : ''}`;
      btn.textContent = weapons[idx].name;
    });
  }
}


// ===== MINIMAP =====
const mmCanvas = document.getElementById('minimapCanvas');
const mmCtx = mmCanvas.getContext('2d');

function drawMinimap() {
  const mmW = 140, mmH = 140;
  const tileS = mmW / MAP_W;
  mmCtx.clearRect(0, 0, mmW, mmH);
  mmCtx.fillStyle = 'rgba(0,0,0,0.6)';
  mmCtx.fillRect(0, 0, mmW, mmH);
  
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const cell = map[r * MAP_W + c];
      mmCtx.fillStyle = cell > 0 ? 'rgba(60,60,60,0.8)' : 'rgba(20,20,20,0.5)';
      mmCtx.fillRect(c * tileS, r * tileS, tileS, tileS);
    }
  }
  
  // Player
  const px = (camera.position.x / (MAP_W * TILE)) * mmW;
  const pz = (camera.position.z / (MAP_H * TILE)) * mmH;
  mmCtx.fillStyle = '#0f0';
  mmCtx.beginPath(); mmCtx.arc(px, pz, 2.5, 0, PI2); mmCtx.fill();
  
  // Direction
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mmCtx.strokeStyle = '#0f0';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath(); mmCtx.moveTo(px, pz);
  mmCtx.lineTo(px + dir.x * 8, pz + dir.z * 8); mmCtx.stroke();
  
  // Doors (blinking)
  for (const door of doors) {
    if (door.opened) continue;
    const blink = Math.sin(Date.now() / 300) > 0 ? 1 : 0.4;
    mmCtx.fillStyle = `rgba(255,80,30,${blink})`;
    for (const [tx, tz] of door.tiles) {
      mmCtx.fillRect((tx + 0.5) * tileS - 2, (tz + 0.5) * tileS - 2, 4, 4);
    }
  }
  
  // Perk machines
  for (const pm of perkMachines) {
    const perk = perks[pm.perkIdx];
    mmCtx.fillStyle = player.perksOwned[perk.id] ? 'rgba(100,100,100,0.5)' : perk.color;
    mmCtx.fillRect((pm.tx + 0.5) * tileS - 2, (pm.tz + 0.5) * tileS - 2, 4, 4);
  }
  
  // Easter egg generators
  for (const gen of easterEgg.generators) {
    const gx = (gen.tx + 0.5) * tileS;
    const gz = (gen.tz + 0.5) * tileS;
    mmCtx.fillStyle = gen.activated ? gen.color : 'rgba(100,100,100,0.5)';
    const blink = gen.activated ? 1 : (Math.sin(Date.now() / 400) > 0 ? 0.8 : 0.3);
    mmCtx.globalAlpha = blink;
    mmCtx.beginPath(); mmCtx.arc(gx, gz, 3, 0, PI2); mmCtx.fill();
    mmCtx.globalAlpha = 1;
  }
  
  // Mystery Box (blue diamond)
  const mbMmX = (mysteryBox.tx + 0.5) * tileS;
  const mbMmZ = (mysteryBox.tz + 0.5) * tileS;
  mmCtx.fillStyle = '#48f';
  mmCtx.beginPath(); mmCtx.arc(mbMmX, mbMmZ, 3, 0, PI2); mmCtx.fill();
  
  // Pack-a-Punch (purple diamond)
  const ppMmX = (packAPunch.tx + 0.5) * tileS;
  const ppMmZ = (packAPunch.tz + 0.5) * tileS;
  mmCtx.fillStyle = '#a0f';
  mmCtx.beginPath(); mmCtx.arc(ppMmX, ppMmZ, 3, 0, PI2); mmCtx.fill();
  
  // Power-up drops (flashing)
  for (const pu of powerUps) {
    const puX = (pu.wx / (MAP_W * TILE)) * mmW;
    const puZ = (pu.wz / (MAP_H * TILE)) * mmH;
    mmCtx.fillStyle = POWERUP_TYPES[pu.typeIdx].color;
    mmCtx.beginPath(); mmCtx.arc(puX, puZ, 2, 0, PI2); mmCtx.fill();
  }
  
  // Zombies
  for (const z of zombies) {
    const zx = (z.wx / (MAP_W * TILE)) * mmW;
    const zz = (z.wz / (MAP_H * TILE)) * mmH;
    mmCtx.fillStyle = z.isBoss ? '#ff0' : z.isElite ? '#f90' : '#f00';
    const zr = z.isBoss ? 3.5 : z.isElite ? 2.2 : 1.5;
    mmCtx.beginPath(); mmCtx.arc(zx, zz, zr, 0, PI2); mmCtx.fill();
  }
}

// ===== CENTER MESSAGE =====
let centerMsgTimer = 0;
function showCenterMsg(big, small, color, duration = 2) {
  const el = document.getElementById('centerMsg');
  el.style.display = 'block';
  el.style.opacity = '1';
  const bigEl = el.querySelector('.big');
  const smallEl = el.querySelector('.small');
  // Re-trigger animations by cloning
  bigEl.style.animation = 'none';
  smallEl.style.animation = 'none';
  void bigEl.offsetHeight; // reflow trigger
  bigEl.style.animation = '';
  smallEl.style.animation = '';
  bigEl.textContent = big;
  bigEl.style.color = color;
  smallEl.textContent = small;
  smallEl.style.color = '#888';
  centerMsgTimer = duration;
}

function updateCenterMsg(dt) {
  if (centerMsgTimer > 0) {
    centerMsgTimer -= dt;
    const el = document.getElementById('centerMsg');
    el.style.opacity = Math.min(1, centerMsgTimer);
    if (centerMsgTimer <= 0) el.style.display = 'none';
  }
}

// ===== PAUSE =====
function showPause() {
  document.getElementById('pauseOverlay').style.display = 'flex';
  let perkInfo = '';
  for (const p of perks) {
    if (player.perksOwned[p.id]) perkInfo += `${p.name} (${p.desc}) · `;
  }
  document.getElementById('pausePerks').textContent = perkInfo ? `PERKS: ${perkInfo.slice(0,-3)}` : '';
}
function hidePause() { document.getElementById('pauseOverlay').style.display = 'none'; }

// ===== DEATH SCREEN =====
let _deathShown = false;
function showDeath() {
  if (_deathShown) return; // prevent multiple calls from stacked timeouts
  _deathShown = true;
  updatePersistentStats();
  closeRadio();
  const board = saveScore(round, totalKills, points);
  
  // Death veil — slow fade to dark before showing death screen
  const veil = document.getElementById('deathVeil');
  veil.style.background = 'rgba(0,0,0,0.85)';
  
  setTimeout(() => {
    const blocker = document.getElementById('blocker');
    blocker.classList.remove('hidden');
    blocker.style.opacity = '0';
    
    let lbHTML = '';
    board.slice(0, 5).forEach((e, i) => {
      const isThis = e.round === round && e.kills === totalKills && e.points === points;
      lbHTML += `<div style="color:${isThis?'#fc0':'#aaa'};${isThis?'font-weight:bold':''}">
        ${i+1}. R${e.round} · ${e.kills} kills · ${e.points} pts${isThis?' ← YOU':''}
      </div>`;
    });
    
    // Enhanced death screen with background canvas
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
    
    // Show rank on death screen
    const rank = getPlayerRank();
    const rankEl = document.createElement('div');
    rankEl.style.cssText = 'margin-top:10px;text-align:center;position:relative;';
    rankEl.innerHTML = `<div style="color:${rank.color};font-size:13px;letter-spacing:2px">${rank.rank}</div><div style="color:#aaa;font-size:10px">${rank.desc}</div>`;
    blocker.appendChild(rankEl);
    
    document.getElementById('hud').classList.add('hidden');
    
    // Fade in death screen
    restartMenuBackground();
    requestAnimationFrame(() => {
      blocker.style.transition = 'opacity 0.8s ease-in';
      blocker.style.opacity = '1';
      veil.style.background = 'rgba(0,0,0,0)';
    });
  }, 1000);
}

// ===== GUN MODELS (weapon-specific 3D) =====
const gunGroup = new THREE.Group();
const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.85 });
const metalLightMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.35, metalness: 0.9 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4A3218, roughness: 0.85, metalness: 0.05 });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x2E1E0E, roughness: 0.9, metalness: 0.05 });
const rayGunMat = new THREE.MeshStandardMaterial({ color: 0x226633, roughness: 0.3, metalness: 0.7 });
const rayGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.8 });

const gunModels = [];

// --- M1911 Pistol ---
function buildM1911() {
  const g = new THREE.Group();
  // Slide (top)
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.28), metalMat);
  slide.position.set(0, 0.02, -0.04);
  g.add(slide);
  // Frame (lower)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.22), metalLightMat);
  frame.position.set(0, -0.01, -0.01);
  g.add(frame);
  // Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.12, 8), metalMat);
  barrel.rotation.x = PI / 2; barrel.position.set(0, 0.02, -0.22);
  g.add(barrel);
  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.1, 0.06), woodMat);
  grip.position.set(0, -0.065, 0.06); grip.rotation.x = 0.15;
  g.add(grip);
  // Grip panels (wood texture detail)
  const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.075, 0.045), woodDarkMat);
  panelL.position.set(-0.026, -0.06, 0.06);
  g.add(panelL);
  const panelR = panelL.clone(); panelR.position.x = 0.026;
  g.add(panelR);
  // Trigger guard
  const tg = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 8, PI), metalMat);
  tg.position.set(0, -0.035, 0.02); tg.rotation.x = PI;
  g.add(tg);
  // Hammer
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 0.01), metalMat);
  hammer.position.set(0, 0.05, 0.1);
  g.add(hammer);
  // Sights
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.006), metalMat);
  frontSight.position.set(0, 0.05, -0.16);
  g.add(frontSight);
  return g;
}

// --- MP40 Submachine Gun ---
function buildMP40() {
  const g = new THREE.Group();
  // Receiver body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.38), metalMat);
  body.position.set(0, 0, -0.05);
  g.add(body);
  // Barrel shroud (perforated look)
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.22, 8), metalLightMat);
  shroud.rotation.x = PI / 2; shroud.position.set(0, 0.005, -0.33);
  g.add(shroud);
  // Inner barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3, 8), metalMat);
  barrel.rotation.x = PI / 2; barrel.position.set(0, 0.005, -0.35);
  g.add(barrel);
  // Magazine (angled stick mag — iconic MP40)
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.025), metalMat);
  mag.position.set(0, -0.12, -0.04); mag.rotation.x = -0.08;
  g.add(mag);
  // Pistol grip (bakelite)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.09, 0.05), woodDarkMat);
  grip.position.set(0, -0.065, 0.1); grip.rotation.x = 0.25;
  g.add(grip);
  // Folding stock (wire frame)
  const stockBar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.25), metalLightMat);
  stockBar.position.set(0.02, -0.02, 0.25);
  g.add(stockBar);
  const stockBar2 = stockBar.clone(); stockBar2.position.x = -0.02;
  g.add(stockBar2);
  const stockEnd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.01), metalLightMat);
  stockEnd.position.set(0, -0.02, 0.375);
  g.add(stockEnd);
  // Cocking handle
  const cock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.015), metalMat);
  cock.position.set(0.04, 0.025, -0.08);
  g.add(cock);
  return g;
}

// --- Trench Gun (Winchester 1897 Pump Shotgun) ---
function buildTrenchGun() {
  const g = new THREE.Group();
  // Receiver
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.2), metalMat);
  recv.position.set(0, 0, 0);
  g.add(recv);
  // Long barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.45, 8), metalMat);
  barrel.rotation.x = PI / 2; barrel.position.set(0, 0.01, -0.32);
  g.add(barrel);
  // Magazine tube (under barrel)
  const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.35, 8), metalLightMat);
  magTube.rotation.x = PI / 2; magTube.position.set(0, -0.02, -0.27);
  g.add(magTube);
  // Pump/forend (wood)
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.12), woodMat);
  pump.position.set(0, -0.005, -0.18);
  g.add(pump);
  // Heat shield (top of barrel — iconic trench gun feature)
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.35), metalLightMat);
  shield.position.set(0, 0.03, -0.25);
  g.add(shield);
  // Ventilation holes in shield
  for (let i = 0; i < 5; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.015), new THREE.MeshStandardMaterial({color:0x111111,roughness:1}));
    hole.position.set(0, 0.031, -0.12 - i * 0.06);
    g.add(hole);
  }
  // Stock (wood)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.065, 0.22), woodMat);
  stock.position.set(0, -0.01, 0.2); stock.rotation.x = -0.05;
  g.add(stock);
  // Buttplate
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.01), metalMat);
  butt.position.set(0, -0.015, 0.31);
  g.add(butt);
  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 0.04), woodDarkMat);
  grip.position.set(0, -0.06, 0.06); grip.rotation.x = 0.3;
  g.add(grip);
  // Trigger guard
  const tg = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 8, PI), metalMat);
  tg.position.set(0, -0.04, 0.03); tg.rotation.x = PI;
  g.add(tg);
  // Bayonet lug (small nub)
  const lug = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.015), metalMat);
  lug.position.set(0, -0.03, -0.53);
  g.add(lug);
  return g;
}

// --- Ray Gun (retro sci-fi pistol) ---
function buildRayGun() {
  const g = new THREE.Group();
  // Main body (bulbous retro shape)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.25), rayGunMat);
  body.position.set(0, 0, -0.02);
  g.add(body);
  // Rounded top
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 8), rayGunMat);
  top.rotation.x = PI / 2; top.position.set(0, 0.035, -0.02);
  g.add(top);
  // Dish/emitter (wide cone at front)
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.1, 12), metalLightMat);
  dish.rotation.x = PI / 2; dish.position.set(0, 0.01, -0.2);
  g.add(dish);
  // Glowing emitter core
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), rayGlowMat);
  emitter.position.set(0, 0.01, -0.25);
  g.add(emitter);
  // Energy tubes (side details)
  const tubeL = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6), rayGlowMat);
  tubeL.rotation.x = PI / 2; tubeL.position.set(0.04, 0.01, -0.06);
  g.add(tubeL);
  const tubeR = tubeL.clone(); tubeR.position.x = -0.04;
  g.add(tubeR);
  // Power cell (bulge at back)
  const cell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshStandardMaterial({color: 0x115522, roughness: 0.3, metalness: 0.6}));
  cell.position.set(0, 0.01, 0.12);
  g.add(cell);
  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), new THREE.MeshStandardMaterial({color: 0x334433, roughness: 0.7, metalness: 0.3}));
  grip.position.set(0, -0.065, 0.06); grip.rotation.x = 0.2;
  g.add(grip);
  // Antenna/fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.12), rayGunMat);
  fin.position.set(0, 0.06, 0.02);
  g.add(fin);
  // Small glow light
  const glow = new THREE.PointLight(0x00ff44, 0.5, 3);
  glow.position.set(0, 0.01, -0.25);
  g.add(glow);
  g._rayGlow = glow;
  g._rayEmitter = emitter;
  return g;
}

// Build all gun models
gunModels.push(buildM1911());
gunModels.push(buildMP40());
gunModels.push(buildTrenchGun());
gunModels.push(buildRayGun());

// Add all to gunGroup, hide non-active
gunModels.forEach((m, i) => {
  m.visible = (i === 0);
  gunGroup.add(m);
});

// Muzzle flash mesh
const muzzleGeo = new THREE.SphereGeometry(0.06, 6, 6);
const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0 });
const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
muzzleMesh.position.set(0, 0.01, -0.42);
gunGroup.add(muzzleMesh);

camera.add(gunGroup);
gunGroup.position.set(0.25, -0.2, -0.5);
scene.add(camera);

let _prevWeapon = -1;
function updateGunModel(dt) {
  // Show correct gun model
  if (_prevWeapon !== player.curWeapon) {
    gunModels.forEach((m, i) => { m.visible = (i === player.curWeapon); });
    _prevWeapon = player.curWeapon;
  }

  // Bob
  const bobX = Math.sin(player.bobPhase) * 0.01;
  const bobY = Math.abs(Math.cos(player.bobPhase)) * 0.008;
  
  // Kick
  const kick = gunKick * 0.08;
  
  // Reload animation
  const reloadOff = player.reloading ? Math.sin(player.reloadTimer * 4) * 0.05 : 0;
  
  gunGroup.position.set(0.25 + bobX, -0.2 + bobY - kick + reloadOff, -0.5 + kick * 0.5);
  gunGroup.rotation.x = kick * 0.3;
  
  // Muzzle flash
  const w = weapons[player.curWeapon];
  if (gunKick > 0.5) {
    muzzleMat.color.set(w.isRayGun ? 0x00ff44 : 0xffcc44);
    muzzleMat.opacity = gunKick;
    muzzleMesh.scale.setScalar(1 + gunKick * 2);
  } else {
    muzzleMat.opacity = 0;
  }

  // Ray Gun glow pulse
  const rgModel = gunModels[3];
  if (rgModel._rayGlow) {
    const t = performance.now() / 1000;
    rgModel._rayGlow.intensity = 0.3 + Math.sin(t * 4) * 0.25;
    if (rgModel._rayEmitter) {
      rgModel._rayEmitter.material.opacity = 0.6 + Math.sin(t * 6) * 0.3;
    }
  }
}

// ===== FLOATING TEXT OVERLAY =====
function drawFloatTexts() {
  const container = document.getElementById('hud');
  container.querySelectorAll('.float-text').forEach(el => el.remove());
  
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const ft = floatTexts[i];
    // Float upward over lifetime
    const progress = 1 - (ft.life / ft.maxLife);
    const currentY = ft.y - progress * 0.08; // drift up 8% of screen
    const alpha = ft.life < 0.5 ? ft.life * 2 : 1; // fade out last 0.5s
    const scale = ft.life < 0.3 ? 0.8 + ft.life : 1; // shrink at end
    
    const div = document.createElement('div');
    div.className = 'float-text';
    div.style.cssText = `position:fixed;left:${ft.x*100}%;top:${currentY*100}%;transform:translate(-50%,-50%) scale(${scale});color:${ft.color};font-size:${ft.maxLife > 2 ? 18 : 14}px;font-weight:bold;letter-spacing:2px;opacity:${alpha};pointer-events:none;text-shadow:0 0 10px ${ft.color}, 0 2px 4px rgba(0,0,0,0.8);white-space:nowrap`;
    div.textContent = ft.text;
    container.appendChild(div);
  }
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
  // Enforce zero roll every frame — our custom controls handle yaw/pitch only
  // This is a safety net in case anything else touches camera.rotation
  controls._applyRotation();
  updateCenterMsg(dt);
  updateGunModel(dt);
  updateLights(dt);
  updateHitmarker(dt);
  updateScreenShake(dt);
  updateMuzzleSparks(dt);
  updateDyingZombies(dt);
  updateBloodDecals(dt);
  updateRoundTransition(dt);
  updateDamageVignette(dt);
  updateLowHealthEffect(dt);
  updateHitIndicators(dt);
  animateVibeJamPortals(dt);
  // Skip HUD updates once death screen is shown (prevents DOM thrashing)
  if (!_deathShown) {
    updateHUD();
    drawMinimap();
    drawFloatTexts();
  }
  
  // Perk machine glow pulse
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
let _startingGame = false; // guard against pause handler during start transition
window._startGame = function() {
  if (_startingGame) return; // prevent double-clicks
  _startingGame = true;
  paused = false;
  hidePause();
  
  // Hide the menu and overlays immediately — no fade-to-black transition
  // (the previous fade approach caused the dark overlay to get stuck when
  // initGame() errored or pointer lock raced with the pause handler)
  const trans = document.getElementById('gameTransition');
  trans.classList.remove('active'); // ensure clean state
  
  stopMenuBackground();
  // CRITICAL: clear inline opacity that finishLoading()/showDeath() set,
  // otherwise inline style overrides .hidden class's opacity:0
  const blocker = document.getElementById('blocker');
  blocker.style.opacity = '';
  blocker.style.transition = '';
  blocker.classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('deathVeil').style.background = 'rgba(0,0,0,0)';
  
  initAudio();
  startBackgroundMusic();
  
  try {
    initGame(); // sets state='roundIntro' via nextRound()
  } catch (e) {
    console.error('initGame error:', e);
  }
  
  // Request pointer lock synchronously — must be in direct user gesture handler.
  // Blocker is already hidden (opacity:0, pointer-events:none) so canvas receives lock.
  if (!isMobile) {
    controls.lock();
  }
  
  _startingGame = false;
};

document.getElementById('startBtn').addEventListener('click', window._startGame);

// Vibe Jam Portal — triggered from death screen button
window._vibeJamPortal = function() {
  _triggerExitPortal();
};

// Auto-start game if player arrived via portal (skip menu for seamless experience)
if (_arrivedViaPortal) {
  // Wait for loading to finish, then auto-start
  const _portalAutoStart = setInterval(() => {
    const btn = document.getElementById('startBtn');
    if (btn && btn.offsetParent !== null) {
      clearInterval(_portalAutoStart);
      // Small delay so the game is fully ready
      setTimeout(() => {
        if (typeof window._startGame === 'function') window._startGame();
      }, 300);
    }
  }, 200);
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start render loop
requestAnimationFrame(gameLoop);
updateLoadBar(95, 'Waking the undead...');

// Finish loading — show menu after brief delay for smooth transition
setTimeout(() => finishLoading(), 600);

// Footer badges are in static HTML — no dynamic embed needed

