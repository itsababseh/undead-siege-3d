// Barricaded windows around the perimeter of the main arena. Zombies
// spawn outside, pound the planks off, then climb in. Players can
// replace planks for 10 points each — classic CoD Zombies mechanic.
//
// Six planks per window (PLANKS_PER_WINDOW). A window is "breached"
// when all planks are gone; any zombie at a breached window walks
// inside unobstructed.
//
// This module owns:
//   - window spec data (position, orientation)
//   - procedural wood-frame + plank meshes in the scene
//   - plank state (on/off) + visual state sync
//   - helpers to find the nearest window and adjust plank count
//
// Zombie AI + repair interaction live in main.js (they need access to
// shared player/zombie state). This module is presentation + data.

import * as THREE from 'three';

export const PLANKS_PER_WINDOW = 6;

// Scene + TILE dep — set once at init.
let _scene = null;
let _TILE = 4;
// wallMeshes ref — passed in so we can remove the wall mesh at window
// tiles after buildMap runs (otherwise the wall hides the window).
let _wallMeshes = null;

// ── Wood materials (shared across all planks) ────────────────────────────
// Base planks are warm brown; shattered pieces fly off with the same mat.
const _PLANK_MATS = null;
function _makePlankMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x8c5a2a,
    roughness: 0.85,
    metalness: 0.05,
    emissive: 0x110800,
    emissiveIntensity: 0.1,
  });
}
const _FRAME_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a1a10,
  roughness: 0.75,
  metalness: 0.2,
});
// Dark "outside beyond the window" backing — prevents rendering through
// to white skybox when a plank is removed.
const _BACKING_MAT = new THREE.MeshBasicMaterial({
  color: 0x0a0a14,
  side: THREE.DoubleSide,
});

// ── Window specs — position relative to map. dir indicates which wall
//    the window is cut into. Each window is aligned to the tile at
//    (tx, tz) on the map; the tile itself remains a wall (cell=1) but
//    we render our custom frame+planks ON TOP so visually it's a
//    window. Zombies use these tile coords to path toward the window.
// ───────────────────────────────────────────────────────────────────────
// Spread windows around the perimeter so the horde feels like it's
// pouring in from every direction, classic CoD Zombies vibe. Each tile
// listed below must currently be a perimeter wall in the mapData (cell
// value 1) AND have walkable floor (0) on the *outside* of the map for
// the spawn point — the perimeter is fenced by the world bounds, but
// we deliberately spawn just inside the wall on the breach path.
export const windowSpecs = [
  // North wall (row 0). Outside is above (negative Z side).
  { id: 'n-11', tx: 11, tz: 0, dir: 'N' },
  { id: 'n-14', tx: 14, tz: 0, dir: 'N' },
  { id: 'n-18', tx: 18, tz: 0, dir: 'N' },
  { id: 'n-21', tx: 21, tz: 0, dir: 'N' },
  // South wall (row 23). Outside is below.
  { id: 's-12', tx: 12, tz: 23, dir: 'S' },
  { id: 's-15', tx: 15, tz: 23, dir: 'S' },
  { id: 's-18', tx: 18, tz: 23, dir: 'S' },
  { id: 's-21', tx: 21, tz: 23, dir: 'S' },
  // East wall (col 23). Outside is to the right.
  { id: 'e-12', tx: 23, tz: 12, dir: 'E' },
  { id: 'e-14', tx: 23, tz: 14, dir: 'E' },
  { id: 'e-17', tx: 23, tz: 17, dir: 'E' },
  { id: 'e-21', tx: 23, tz: 21, dir: 'E' },
  // West wall (col 0). Outside is to the left. Only the lower half
  // of the west wall borders walkable floor — the upper half is the
  // sealed inner room (the bunker barracks), so windows there would
  // breach into a closed-off area. Stick to rows 11-22.
  { id: 'w-12', tx: 0, tz: 12, dir: 'W' },
  { id: 'w-16', tx: 0, tz: 16, dir: 'W' },
  { id: 'w-21', tx: 0, tz: 21, dir: 'W' },
];

// ── Runtime state — populated by buildWindows(). Each entry mirrors
//    a windowSpec but holds live plank flags + mesh refs + zombies
//    attached to it for their AI tick. ──────────────────────────────────
export const windows = [];

// ── Construct procedural window meshes. Called on initGame. ──────────────
//
// Visual layout for a single window (dir=N shown, flipped appropriately
// for S / E / W):
//
//       [ wooden top frame ]
//       | P | P | P | P | P |    <- 5-6 horizontal planks crisscrossed
//       [ wooden side frames ]
//       | P | P | P | P | P |
//       [ wooden bottom frame ]
//
// The frame opening is TILE wide, 2.4 units tall, centered on the
// target tile's outer-facing edge.
export function buildWindows() {
  cleanupWindows();
  for (const spec of windowSpecs) {
    const w = { ...spec, planks: [], plankMeshes: [], attackers: [] };
    // Frame sits at the CENTER of the wall tile so it occupies the
    // space of the wall we're about to remove. Outward normal points
    // from tile center toward the outside of the bunker.
    const cx = spec.tx * _TILE + _TILE / 2;
    const cz = spec.tz * _TILE + _TILE / 2;
    let normalX = 0, normalZ = 0;
    switch (spec.dir) {
      case 'N': normalZ = -1; break;
      case 'S': normalZ =  1; break;
      case 'E': normalX =  1; break;
      case 'W': normalX = -1; break;
    }
    w.centerX = cx;
    w.centerZ = cz;
    w.normalX = normalX;
    w.normalZ = normalZ;
    // ── Remove the wall mesh at this tile so the window is visible
    // from inside the bunker. mapAt remains 1 (wall) for collision —
    // planks are the visual + functional barrier; once they're gone
    // the zombie window AI manually moves zombies through.
    if (_wallMeshes) {
      const expectX = cx, expectZ = cz;
      for (let i = _wallMeshes.length - 1; i >= 0; i--) {
        const m = _wallMeshes[i];
        if (!m || !m.position) continue;
        if (Math.abs(m.position.x - expectX) < 0.05 && Math.abs(m.position.z - expectZ) < 0.05) {
          _scene.remove(m);
          _wallMeshes.splice(i, 1);
          break;
        }
      }
    }
    // For N/S windows the frame spans along X; for E/W along Z
    const alongX = (spec.dir === 'N' || spec.dir === 'S');
    const frameWidth = _TILE * 0.92;     // slightly inside the tile bounds
    const frameHeight = 2.4;
    const frameThickness = 0.22;
    const frameY = 1.2;                  // vertical center of the window
    const plankZBias = normalZ * 0.05;   // nudge planks slightly outward
    const plankXBias = normalX * 0.05;
    // Dark "void" backing behind the planks. Sized larger than the
    // frame so it fully occludes the now-missing wall geometry.
    const backingGeo = new THREE.PlaneGeometry(frameWidth + 0.4, frameHeight + 0.4);
    const backing = new THREE.Mesh(backingGeo, _BACKING_MAT);
    backing.position.set(cx + normalX * 0.02, frameY, cz + normalZ * 0.02);
    if (!alongX) backing.rotation.y = Math.PI / 2;
    _scene.add(backing);
    w.backingMesh = backing;
    // Frame: 4 bars forming the window ring. Built as a Group so we
    // can rotate the whole assembly in one shot.
    const sideGeo = new THREE.BoxGeometry(frameThickness, frameHeight, frameThickness);
    const topGeo = new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameThickness, frameThickness);
    const frameGroup = new THREE.Group();
    const lSide = new THREE.Mesh(sideGeo, _FRAME_MAT);
    lSide.position.set(-frameWidth / 2, 0, 0);
    frameGroup.add(lSide);
    const rSide = new THREE.Mesh(sideGeo, _FRAME_MAT);
    rSide.position.set(frameWidth / 2, 0, 0);
    frameGroup.add(rSide);
    const top = new THREE.Mesh(topGeo, _FRAME_MAT);
    top.position.set(0, frameHeight / 2, 0);
    frameGroup.add(top);
    const bot = new THREE.Mesh(topGeo, _FRAME_MAT);
    bot.position.set(0, -frameHeight / 2, 0);
    frameGroup.add(bot);
    frameGroup.position.set(cx, frameY, cz);
    if (!alongX) frameGroup.rotation.y = Math.PI / 2;
    _scene.add(frameGroup);
    w.frameGroup = frameGroup;
    // Planks — horizontal bars across the opening. Each plank is its
    // own mesh so we can hide them individually as zombies break them.
    const plankGeo = new THREE.BoxGeometry(frameWidth * 0.95, 0.18, 0.08);
    for (let i = 0; i < PLANKS_PER_WINDOW; i++) {
      const mat = _makePlankMat();
      const plank = new THREE.Mesh(plankGeo, mat);
      const yOffset = (i - (PLANKS_PER_WINDOW - 1) / 2) * (frameHeight / (PLANKS_PER_WINDOW + 1)) * 0.95;
      const tilt = (i % 2 === 0 ? 1 : -1) * 0.15 + (Math.random() - 0.5) * 0.1;
      plank.position.set(cx + plankXBias, frameY + yOffset, cz + plankZBias);
      // Rotate the whole plank around Y for E/W windows so the long
      // axis lines up with the wall direction.
      if (!alongX) plank.rotation.y = Math.PI / 2;
      // Tilt around the wall-perpendicular axis for that nailed-on look
      if (alongX) plank.rotation.z = tilt;
      else plank.rotation.x = tilt;
      _scene.add(plank);
      w.planks.push(true);
      w.plankMeshes.push(plank);
    }
    windows.push(w);
  }
}

export function cleanupWindows() {
  for (const w of windows) {
    if (w.frameGroup) _scene.remove(w.frameGroup);
    if (w.backingMesh) _scene.remove(w.backingMesh);
    for (const m of w.plankMeshes) _scene.remove(m);
  }
  windows.length = 0;
}

export function resetAllPlanks() {
  for (const w of windows) {
    for (let i = 0; i < PLANKS_PER_WINDOW; i++) {
      w.planks[i] = true;
      if (w.plankMeshes[i]) w.plankMeshes[i].visible = true;
    }
    w.attackers.length = 0;
  }
}

// Set a plank on/off. Returns true if state actually changed.
export function setPlank(windowRef, idx, on) {
  if (!windowRef) return false;
  if (idx < 0 || idx >= PLANKS_PER_WINDOW) return false;
  if (windowRef.planks[idx] === on) return false;
  windowRef.planks[idx] = on;
  const mesh = windowRef.plankMeshes[idx];
  if (mesh) mesh.visible = on;
  return true;
}

// Count currently-intact planks on a window
export function intactPlanks(windowRef) {
  if (!windowRef) return 0;
  let n = 0;
  for (let i = 0; i < PLANKS_PER_WINDOW; i++) if (windowRef.planks[i]) n++;
  return n;
}

// True if a zombie at (wx, wz) should be considered "at the window"
export function isAtWindow(w, wx, wz, threshold) {
  if (!w) return false;
  const dx = wx - w.centerX;
  const dz = wz - w.centerZ;
  return Math.hypot(dx, dz) < (threshold || 1.6);
}

// Break the lowest intact plank (animation hook for the zombie that's
// currently beating the planks off). Returns the plank index removed,
// or -1 if all are already gone.
export function breakNextPlank(windowRef) {
  if (!windowRef) return -1;
  for (let i = 0; i < PLANKS_PER_WINDOW; i++) {
    if (windowRef.planks[i]) {
      setPlank(windowRef, i, false);
      return i;
    }
  }
  return -1;
}

// Replace the highest-broken plank (from the top down so it looks
// progressive). Returns the idx restored, or -1 if already full.
export function repairNextPlank(windowRef) {
  if (!windowRef) return -1;
  for (let i = PLANKS_PER_WINDOW - 1; i >= 0; i--) {
    if (!windowRef.planks[i]) {
      setPlank(windowRef, i, true);
      return i;
    }
  }
  return -1;
}

// Find the nearest window to a point. Used by repair interaction +
// zombie spawning.
export function nearestWindow(wx, wz) {
  let best = null;
  let bestD = Infinity;
  for (const w of windows) {
    const dx = wx - w.centerX;
    const dz = wz - w.centerZ;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best ? { window: best, distance: bestD } : null;
}

// Pick a window for a new zombie to attack. Prefers least-busy
// windows so the horde spreads out instead of dogpiling one.
export function pickSpawnWindow() {
  if (windows.length === 0) return null;
  // Sort by attacker count ascending, then randomize ties
  const sorted = windows.slice().sort((a, b) => a.attackers.length - b.attackers.length);
  const minAttackers = sorted[0].attackers.length;
  const tied = sorted.filter(w => w.attackers.length === minAttackers);
  return tied[Math.floor(Math.random() * tied.length)];
}

// Compute the outside-spawn position for a zombie targeting this window
// (one tile away from the window, along the outward normal).
export function outsideSpawnPosition(windowRef) {
  if (!windowRef) return null;
  return {
    x: windowRef.centerX + windowRef.normalX * _TILE * 1.2,
    z: windowRef.centerZ + windowRef.normalZ * _TILE * 1.2,
  };
}

export function setWindowDeps(scene, TILE, wallMeshesRef) {
  _scene = scene;
  _TILE = TILE;
  _wallMeshes = wallMeshesRef || null;
}
