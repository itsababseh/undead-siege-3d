// 3D Map Building
import * as THREE from 'three';
import { floorTex, ceilTex, wallTextures } from './textures.js';

const PI = Math.PI;

// Dependencies passed via init
let _scene, _TILE, _MAP_W, _MAP_H, _map;
export function setMapDeps(scene, TILE, MAP_W, MAP_H, mapRef) {
  _scene = scene; _TILE = TILE; _MAP_W = MAP_W; _MAP_H = MAP_H; _map = mapRef;
}

export const wallMeshes = [];
export const doorMeshes = []; // track door meshes for removal

export function buildMap() {
  // Remove old walls
  wallMeshes.forEach(m => _scene.remove(m));
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
  for (let z = 0; z < _MAP_H; z++) {
    for (let x = 0; x < _MAP_W; x++) {
      const cell = _map[z * _MAP_W + x];
      if (cell === 0) continue;
      const ci = Math.min(cell - 1, wallTextures.length - 1);
      const mat = new THREE.MeshStandardMaterial({ map: wallTextures[ci], roughness: 0.85, metalness: 0.05 });
      const geo = new THREE.BoxGeometry(_TILE, wallH, _TILE);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * _TILE + _TILE / 2, wallH / 2, z * _TILE + _TILE / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      _scene.add(mesh);
      wallMeshes.push(mesh);
      if (cell === 4 || cell === 5) {
        doorMeshes.push({ mesh, x, z, cell });
      }
    }
  }
}


