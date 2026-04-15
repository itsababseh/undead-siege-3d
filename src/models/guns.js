// Gun models — weapon-specific 3D models for first-person view
// Extracted from main.js

import * as THREE from 'three';

const PI = Math.PI;

// ── Dependency injection ──
let _scene, _camera, _player, _weapons;
export function setGunDeps(scene, camera, player, weapons) {
  _scene = scene; _camera = camera; _player = player; _weapons = weapons;
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

// Attach gun group to camera (called after scene/camera are ready)
export function initGunModels() {
  _camera.add(gunGroup);
  gunGroup.position.set(0.25, -0.2, -0.5);
  _scene.add(_camera);
}

let _prevWeapon = -1;
function updateGunModel(dt, gunKick) {
  // Show correct gun model
  if (_prevWeapon !== _player.curWeapon) {
    gunModels.forEach((m, i) => { m.visible = (i === _player.curWeapon); });
    _prevWeapon = _player.curWeapon;
  }

  // Bob
  const bobX = Math.sin(_player.bobPhase) * 0.01;
  const bobY = Math.abs(Math.cos(_player.bobPhase)) * 0.008;
  
  // Kick
  const kick = gunKick * 0.08;
  
  // Reload animation
  const reloadOff = _player.reloading ? Math.sin(_player.reloadTimer * 4) * 0.05 : 0;
  
  gunGroup.position.set(0.25 + bobX, -0.2 + bobY - kick + reloadOff, -0.5 + kick * 0.5);
  gunGroup.rotation.x = kick * 0.3;
  
  // Muzzle flash
  const w = _weapons[_player.curWeapon];
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


export {
  gunGroup, gunModels, muzzleMesh,
  buildM1911, buildMP40, buildTrenchGun, buildRayGun,
  updateGunModel
};
