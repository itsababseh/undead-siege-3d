// 3D Map Building
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floorTex, ceilTex, wallTextures } from './textures.js';
import { windowSpecs } from './windows.js';

const PI = Math.PI;

// Dependencies passed via init
let _scene, _TILE, _MAP_W, _MAP_H, _map, _doors;
export function setMapDeps(scene, TILE, MAP_W, MAP_H, mapRef, doorsRef) {
  _scene = scene; _TILE = TILE; _MAP_W = MAP_W; _MAP_H = MAP_H; _map = mapRef;
  if (doorsRef) _doors = doorsRef;
}

// Late-bind the doors array (main.js declares `doors` AFTER setMapDeps()
// runs because setMapDeps is wired with the rest of the early modules).
// When supplied, any tile listed in doors[*].tiles that has a non-zero
// cell value gets built as an INDIVIDUAL mesh and tracked in doorMeshes
// so openDoorLocal can remove it. Without this, the west door opens but
// the green barracks wall one tile behind it stays put as part of the
// merged wall, trapping zombies in a 1-tile pocket.
export function setMapDoors(doorsRef) {
  _doors = doorsRef || null;
}

export const wallMeshes = [];
export const doorMeshes = []; // track door meshes for removal

export function buildMap() {
  // Remove old walls AND release their GPU resources. Without disposing,
  // every restart of the game leaks the merged-wall geometries (large)
  // plus their materials. With per-color merges that's a meaningful
  // amount per restart.
  wallMeshes.forEach(m => {
    _scene.remove(m);
    if (m.geometry) try { m.geometry.dispose(); } catch (e) {}
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        try { mat.dispose(); } catch (e) {}
      }
    }
  });
  wallMeshes.length = 0;
  doorMeshes.length = 0;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(_MAP_W * _TILE, _MAP_H * _TILE);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -PI / 2;
  floor.position.set(_MAP_W * _TILE / 2, 0, _MAP_H * _TILE / 2);
  floor.receiveShadow = true;
  _scene.add(floor);
  wallMeshes.push(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(_MAP_W * _TILE, _MAP_H * _TILE);
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1, metalness: 0 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = PI / 2;
  ceil.position.set(_MAP_W * _TILE / 2, 3.2, _MAP_H * _TILE / 2);
  _scene.add(ceil);
  wallMeshes.push(ceil);

  // Walls
  const wallH = 3.2;

  // Window tiles — skip these so windows.js can build its own frame/planks
  // without hunting for a per-tile wall mesh to remove.
  const windowKeys = new Set(windowSpecs.map(s => `${s.tx},${s.tz}`));

  // Door-adjacent / door-extension tiles — any tile listed in any door's
  // .tiles[] gets built as an INDIVIDUAL mesh and added to doorMeshes,
  // even when the cell isn't a door cell (4/5). Lets a door definition
  // include the green barracks wall behind it (tile (8,7) and (8,8)) so
  // opening the west door also clears that wall instead of trapping
  // zombies in a 1-tile pocket.
  const doorTileKeys = new Set();
  if (_doors) {
    for (const d of _doors) {
      if (!d || !d.tiles) continue;
      for (const [tx, tz] of d.tiles) doorTileKeys.add(`${tx},${tz}`);
    }
  }

  // Group static (non-door) wall tiles by material index so we can merge
  // each color family into a single draw call. Doors stay as individual
  // meshes because gameplay code animates/removes them per-door.
  const groupedGeos = new Map(); // ci -> BufferGeometry[]

  for (let z = 0; z < _MAP_H; z++) {
    for (let x = 0; x < _MAP_W; x++) {
      const cell = _map[z * _MAP_W + x];
      if (cell === 0) continue;

      const isDoorTile = (cell === 4 || cell === 5) || doorTileKeys.has(`${x},${z}`);
      if (isDoorTile) {
        const ci = Math.min(cell - 1, wallTextures.length - 1);
        const mat = new THREE.MeshStandardMaterial({ map: wallTextures[ci], roughness: 0.85, metalness: 0.05 });
        const geo = new THREE.BoxGeometry(_TILE, wallH, _TILE);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x * _TILE + _TILE / 2, wallH / 2, z * _TILE + _TILE / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        _scene.add(mesh);
        wallMeshes.push(mesh);
        doorMeshes.push({ mesh, x, z, cell });
        continue;
      }

      if (windowKeys.has(`${x},${z}`)) continue;

      const ci = Math.min(cell - 1, wallTextures.length - 1);
      const geo = new THREE.BoxGeometry(_TILE, wallH, _TILE);
      geo.translate(x * _TILE + _TILE / 2, wallH / 2, z * _TILE + _TILE / 2);
      if (!groupedGeos.has(ci)) groupedGeos.set(ci, []);
      groupedGeos.get(ci).push(geo);
    }
  }

  for (const [ci, geos] of groupedGeos) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    const mat = new THREE.MeshStandardMaterial({ map: wallTextures[ci], roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    _scene.add(mesh);
    wallMeshes.push(mesh);
  }
}


