// Environmental props — barrels, crates, debris, gore decals, floor rubble
// S2.4: Production-quality environmental detail
import * as THREE from 'three';
import { createTexture } from './textures.js';

let _scene, _TILE, _MAP_W, _MAP_H, _map;
const propMeshes = [];   // all prop meshes for cleanup

export function setPropDeps(scene, TILE, MAP_W, MAP_H, mapRef) {
  _scene = scene; _TILE = TILE; _MAP_W = MAP_W; _MAP_H = MAP_H; _map = mapRef;
}

// ── Procedural textures ──

const barrelTex = createTexture(64, 64, (ctx, w, h) => {
  // Rusty metal barrel
  ctx.fillStyle = '#4a4a42';
  ctx.fillRect(0, 0, w, h);
  // Horizontal bands
  ctx.fillStyle = '#3a3830';
  ctx.fillRect(0, 4, w, 6);
  ctx.fillRect(0, h - 10, w, 6);
  ctx.fillRect(0, h / 2 - 3, w, 6);
  // Rust patches
  for (let i = 0; i < 12; i++) {
    const rx = Math.random() * w, ry = Math.random() * h;
    const rs = 3 + Math.random() * 8;
    ctx.fillStyle = `rgba(${100 + Math.random() * 40}, ${40 + Math.random() * 20}, ${10 + Math.random() * 15}, ${0.3 + Math.random() * 0.4})`;
    ctx.fillRect(rx, ry, rs, rs);
  }
  // Dents/scratches
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }
});

const crateTex = createTexture(64, 64, (ctx, w, h) => {
  // Wooden ammo crate
  ctx.fillStyle = '#6B4423';
  ctx.fillRect(0, 0, w, h);
  // Wood planks
  const plankH = 16;
  for (let y = 0; y < h; y += plankH) {
    const v = 80 + Math.random() * 30;
    ctx.fillStyle = `rgb(${v + 20}, ${v - 5}, ${v - 25})`;
    ctx.fillRect(1, y + 1, w - 2, plankH - 2);
    ctx.strokeStyle = '#3a2210';
    ctx.strokeRect(1, y + 1, w - 2, plankH - 2);
  }
  // Cross bracing
  ctx.strokeStyle = '#4a3015';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(4, 4); ctx.lineTo(w - 4, h - 4);
  ctx.moveTo(w - 4, 4); ctx.lineTo(4, h - 4);
  ctx.stroke();
  // Nails
  ctx.fillStyle = '#888';
  for (const [nx, ny] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8], [w / 2, h / 2]]) {
    ctx.beginPath(); ctx.arc(nx, ny, 2, 0, Math.PI * 2); ctx.fill();
  }
});

const sandbagTex = createTexture(64, 32, (ctx, w, h) => {
  // Burlap sandbag
  ctx.fillStyle = '#8B7D5B';
  ctx.fillRect(0, 0, w, h);
  // Weave pattern
  for (let x = 0; x < w; x += 4) {
    for (let y = 0; y < h; y += 4) {
      if ((x + y) % 8 < 4) {
        ctx.fillStyle = `rgba(${100 + Math.random() * 20}, ${90 + Math.random() * 20}, ${60 + Math.random() * 20}, 0.3)`;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
  // Stitch line
  ctx.strokeStyle = '#5a4a30';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
  ctx.setLineDash([]);
});

const goreDecalTex = createTexture(128, 128, (ctx, w, h) => {
  // Gore wall texture overlay — smears, handprints, spatter
  ctx.clearRect(0, 0, w, h);
  // Blood smear (drag mark)
  const grad = ctx.createLinearGradient(w * 0.3, 0, w * 0.5, h);
  grad.addColorStop(0, 'rgba(120, 5, 5, 0.7)');
  grad.addColorStop(0.4, 'rgba(80, 2, 2, 0.5)');
  grad.addColorStop(1, 'rgba(40, 0, 0, 0.1)');
  ctx.fillStyle = grad;
  ctx.fillRect(w * 0.2, h * 0.05, w * 0.35, h * 0.9);
  // Handprint (simplified)
  ctx.fillStyle = 'rgba(100, 5, 5, 0.6)';
  const hx = w * 0.6, hy = h * 0.25;
  ctx.beginPath(); ctx.ellipse(hx, hy, 12, 16, -0.2, 0, Math.PI * 2); ctx.fill();
  // Fingers
  for (let f = 0; f < 4; f++) {
    ctx.beginPath();
    ctx.ellipse(hx - 10 + f * 7, hy - 18, 3, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Thumb
  ctx.beginPath(); ctx.ellipse(hx + 16, hy - 4, 3, 7, 0.5, 0, Math.PI * 2); ctx.fill();
  // Random splatter dots
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 50}, 0, 0, ${0.2 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Drip streaks
  for (let d = 0; d < 5; d++) {
    const dx = Math.random() * w;
    const dy = Math.random() * h * 0.3;
    ctx.fillStyle = `rgba(${80 + Math.random() * 40}, 0, 0, 0.4)`;
    ctx.fillRect(dx, dy, 1.5 + Math.random() * 2, 15 + Math.random() * 30);
  }
});

// ── Shared geometries (reused across all props) ──
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.5, 1.2, 8);
const crateGeo = new THREE.BoxGeometry(1.0, 0.8, 1.0);
const crateSmallGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
const sandbagGeo = new THREE.BoxGeometry(0.9, 0.35, 0.5);
const rubbleGeo = new THREE.DodecahedronGeometry(0.15, 0);
const rubbleGeoLg = new THREE.DodecahedronGeometry(0.25, 0);
const goreDecalGeo = new THREE.PlaneGeometry(2.2, 2.8);
const floorGoreGeo = new THREE.PlaneGeometry(1.5, 1.5);

// ── Shared materials ──
const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.75, metalness: 0.4 });
const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9, metalness: 0.05 });
const sandbagMat = new THREE.MeshStandardMaterial({ map: sandbagTex, roughness: 1, metalness: 0 });
const rubbleMats = [
  new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x4a4a42, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x3d3d38, roughness: 0.95 }),
];

// ── Prop placement data (map-tile coords) ──
// Placed in open floor cells (cell=0), away from doors/spawn center
const propPlacements = [
  // Main hall (center area) — scattered cover
  { type: 'barrel', tx: 12, tz: 6, rot: 0.3 },
  { type: 'barrel', tx: 16, tz: 3, rot: 1.1 },
  { type: 'crate', tx: 14, tz: 8, rot: 0.5 },
  { type: 'crateSmall', tx: 14.4, tz: 8.5, rot: 1.8, stack: true },
  { type: 'sandbag', tx: 11, tz: 5, rot: 0.2 },
  { type: 'sandbag', tx: 11.5, tz: 5.4, rot: 0.1, stack: true },

  // South open area
  { type: 'barrel', tx: 5, tz: 14, rot: 0.8 },
  { type: 'barrel', tx: 6, tz: 20, rot: 2.2, tipped: true },
  { type: 'crate', tx: 8, tz: 16, rot: -0.3 },
  { type: 'crate', tx: 3, tz: 21, rot: 0.9 },
  { type: 'crateSmall', tx: 3.4, tz: 21.5, rot: 2.1, stack: true },
  { type: 'sandbag', tx: 10, tz: 20, rot: 1.5 },
  { type: 'sandbag', tx: 10.5, tz: 20, rot: 1.4, stack: true },
  { type: 'sandbag', tx: 10.2, tz: 20.5, rot: 1.6 },

  // Near east door corridor
  { type: 'barrel', tx: 17, tz: 12, rot: 0 },
  { type: 'crate', tx: 15, tz: 15, rot: 0.7 },

  // West wing (inside gated area)
  { type: 'barrel', tx: 3, tz: 4, rot: 1.5 },
  { type: 'crate', tx: 6, tz: 7, rot: 0.2 },
  { type: 'barrel', tx: 7, tz: 3, rot: 0.9, tipped: true },

  // East chamber
  { type: 'crate', tx: 21, tz: 12, rot: 0.4 },
  { type: 'barrel', tx: 22, tz: 16, rot: 1.8 },

  // Near spawn points — sandbag fortifications
  { type: 'sandbag', tx: 14, tz: 2, rot: 0 },
  { type: 'sandbag', tx: 14.5, tz: 2, rot: 0.1 },
  { type: 'sandbag', tx: 14.2, tz: 2.4, rot: 0, stack: true },

  // South-east corner area
  { type: 'barrel', tx: 16, tz: 21, rot: 0.5 },
  { type: 'crate', tx: 13, tz: 22, rot: 1.2 },
];

// Gore decal positions — on walls near zombie spawn points
const goreDecalPlacements = [
  // Walls near spawn-heavy areas
  { tx: 10, tz: 1, face: 'south' },   // north wall, main hall
  { tx: 17, tz: 1, face: 'south' },   // north wall, east side
  { tx: 0, tz: 11, face: 'east' },    // west wall, south area
  { tx: 0, tz: 19, face: 'east' },    // west wall, south area
  { tx: 23, tz: 3, face: 'west' },    // east wall, north
  { tx: 23, tz: 21, face: 'west' },   // east wall, south
  { tx: 9, tz: 7, face: 'west' },     // near west door
  { tx: 9, tz: 8, face: 'west' },     // near west door
  { tx: 19, tz: 14, face: 'west' },   // near east chamber
  // Interior walls
  { tx: 12, tz: 4, face: 'south' },
  { tx: 15, tz: 7, face: 'south' },
  { tx: 3, tz: 19, face: 'north' },
  { tx: 11, tz: 19, face: 'north' },
];

// Floor gore pools — placed in open areas near spawn
const floorGorePlacements = [
  { tx: 11, tz: 8 },
  { tx: 16, tz: 5 },
  { tx: 5, tz: 18 },
  { tx: 8, tz: 21 },
  { tx: 13, tz: 15 },
  { tx: 18, tz: 7 },
  { tx: 3, tz: 12 },
  { tx: 9, tz: 14 },
  { tx: 15, tz: 20 },
  { tx: 21, tz: 13 },
];

// ── Floor rubble cluster positions ──
const rubbleClusters = [
  { tx: 11, tz: 3, count: 6 },
  { tx: 17, tz: 8, count: 5 },
  { tx: 4, tz: 16, count: 7 },
  { tx: 9, tz: 21, count: 5 },
  { tx: 14, tz: 13, count: 4 },
  { tx: 7, tz: 11, count: 6 },
  { tx: 16, tz: 18, count: 5 },
  { tx: 2, tz: 22, count: 4 },
  { tx: 20, tz: 2, count: 5 },
  { tx: 13, tz: 6, count: 3 },
  { tx: 18, tz: 15, count: 4 },
  { tx: 6, tz: 5, count: 3 },
];

// ── Build functions ──

function addProp(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  _scene.add(mesh);
  propMeshes.push(mesh);
}

function worldX(tx) { return tx * _TILE + _TILE / 2; }
function worldZ(tz) { return tz * _TILE + _TILE / 2; }

function buildBarrel(p) {
  const m = new THREE.Mesh(barrelGeo, barrelMat);
  const wx = worldX(p.tx) + (Math.random() - 0.5) * 0.6;
  const wz = worldZ(p.tz) + (Math.random() - 0.5) * 0.6;
  if (p.tipped) {
    m.position.set(wx, 0.5, wz);
    m.rotation.set(Math.PI / 2 + 0.1, p.rot, 0);
  } else {
    m.position.set(wx, 0.6, wz);
    m.rotation.y = p.rot;
  }
  addProp(m);
}

function buildCrate(p, small) {
  const geo = small ? crateSmallGeo : crateGeo;
  const m = new THREE.Mesh(geo, crateMat);
  const wx = worldX(p.tx) + (Math.random() - 0.5) * 0.3;
  const wz = worldZ(p.tz) + (Math.random() - 0.5) * 0.3;
  const baseY = small ? 0.25 : 0.4;
  const stackY = p.stack ? (small ? 0.75 : 1.2) : baseY;
  m.position.set(wx, stackY, wz);
  m.rotation.y = p.rot;
  if (p.stack) m.rotation.z = (Math.random() - 0.5) * 0.15; // slight tilt
  addProp(m);
}

function buildSandbag(p) {
  const m = new THREE.Mesh(sandbagGeo, sandbagMat);
  const wx = worldX(p.tx) + (Math.random() - 0.5) * 0.2;
  const wz = worldZ(p.tz) + (Math.random() - 0.5) * 0.2;
  const baseY = 0.175;
  const stackY = p.stack ? 0.525 : baseY;
  m.position.set(wx, stackY, wz);
  m.rotation.y = p.rot;
  // Sandbags sag slightly
  m.scale.y = 0.85 + Math.random() * 0.2;
  m.scale.x = 0.95 + Math.random() * 0.1;
  addProp(m);
}

function buildGoreDecal(p) {
  const goreMat = new THREE.MeshBasicMaterial({
    map: goreDecalTex, transparent: true, opacity: 0.55 + Math.random() * 0.25,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(goreDecalGeo, goreMat);
  const wx = p.tx * _TILE + _TILE / 2;
  const wz = p.tz * _TILE + _TILE / 2;
  const wallH = 3.2;
  const yPos = 0.4 + Math.random() * (wallH - 1.5);

  switch (p.face) {
    case 'north':
      m.position.set(wx, yPos, wz * 1 - 0.02); // -Z face
      m.rotation.y = 0;
      break;
    case 'south':
      m.position.set(wx, yPos, (p.tz + 1) * _TILE + 0.02);
      m.rotation.y = Math.PI;
      break;
    case 'east':
      m.position.set((p.tx + 1) * _TILE + 0.02, yPos, wz);
      m.rotation.y = -Math.PI / 2;
      break;
    case 'west':
      m.position.set(p.tx * _TILE - 0.02, yPos, wz);
      m.rotation.y = Math.PI / 2;
      break;
  }
  // Random flip & rotation for variety
  m.scale.x *= Math.random() > 0.5 ? 1 : -1;
  m.rotateZ((Math.random() - 0.5) * 0.3);

  _scene.add(m);
  propMeshes.push(m);
}

function buildFloorGore(p) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Dark blood pool
  const cx = 64, cy = 64;
  for (let i = 0; i < 4 + Math.random() * 4; i++) {
    const rx = cx + (Math.random() - 0.5) * 40;
    const ry = cy + (Math.random() - 0.5) * 40;
    const r = 15 + Math.random() * 30;
    const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, r);
    grad.addColorStop(0, `rgba(${50 + Math.random() * 30}, 0, 0, ${0.5 + Math.random() * 0.3})`);
    grad.addColorStop(1, 'rgba(30, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.fill();
  }
  // Some spatter dots around edge
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 30}, 0, 0, ${0.3 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.6 + Math.random() * 0.2,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(floorGoreGeo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(
    worldX(p.tx) + (Math.random() - 0.5) * 1.5,
    0.02,
    worldZ(p.tz) + (Math.random() - 0.5) * 1.5
  );
  m.rotateZ(Math.random() * Math.PI * 2);
  const s = 0.8 + Math.random() * 0.6;
  m.scale.set(s, s, 1);
  _scene.add(m);
  propMeshes.push(m);
}

function buildRubbleCluster(c) {
  const cx = worldX(c.tx);
  const cz = worldZ(c.tz);
  for (let i = 0; i < c.count; i++) {
    const large = Math.random() > 0.6;
    const geo = large ? rubbleGeoLg : rubbleGeo;
    const mat = rubbleMats[Math.floor(Math.random() * rubbleMats.length)];
    const m = new THREE.Mesh(geo, mat);
    m.position.set(
      cx + (Math.random() - 0.5) * _TILE * 0.8,
      large ? 0.12 : 0.07,
      cz + (Math.random() - 0.5) * _TILE * 0.8
    );
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.scale.setScalar(0.6 + Math.random() * 0.8);
    m.receiveShadow = true;
    _scene.add(m);
    propMeshes.push(m);
  }
}

// ── Public API ──

export function buildProps() {
  // Clean up previous
  for (const m of propMeshes) {
    _scene.remove(m);
    if (m.geometry && !isSharedGeo(m.geometry)) m.geometry.dispose();
    if (m.material) {
      if (m.material.map && !isSharedTex(m.material.map)) m.material.map.dispose();
      if (!isSharedMat(m.material)) m.material.dispose();
    }
  }
  propMeshes.length = 0;

  // Place prop objects
  for (const p of propPlacements) {
    // Verify tile is open (cell=0)
    const cell = _map[Math.floor(p.tz) * _MAP_W + Math.floor(p.tx)];
    if (cell !== 0) continue;
    switch (p.type) {
      case 'barrel':     buildBarrel(p); break;
      case 'crate':      buildCrate(p, false); break;
      case 'crateSmall': buildCrate(p, true); break;
      case 'sandbag':    buildSandbag(p); break;
    }
  }

  // Place wall gore decals
  for (const g of goreDecalPlacements) {
    buildGoreDecal(g);
  }

  // Place floor blood pools
  for (const fg of floorGorePlacements) {
    const cell = _map[Math.floor(fg.tz) * _MAP_W + Math.floor(fg.tx)];
    if (cell !== 0) continue;
    buildFloorGore(fg);
  }

  // Place rubble clusters
  for (const rc of rubbleClusters) {
    const cell = _map[Math.floor(rc.tz) * _MAP_W + Math.floor(rc.tx)];
    if (cell !== 0) continue;
    buildRubbleCluster(rc);
  }
}

// Helpers to avoid disposing shared resources
const _sharedGeos = new Set([barrelGeo, crateGeo, crateSmallGeo, sandbagGeo, rubbleGeo, rubbleGeoLg, goreDecalGeo, floorGoreGeo]);
const _sharedMats = new Set([barrelMat, crateMat, sandbagMat, ...rubbleMats]);
const _sharedTexs = new Set([barrelTex, crateTex, sandbagTex, goreDecalTex]);

function isSharedGeo(g) { return _sharedGeos.has(g); }
function isSharedMat(m) { return _sharedMats.has(m); }
function isSharedTex(t) { return _sharedTexs.has(t); }
