// ===== MINIMAP =====
// Extracted from main.js — Phase 4 modularization
import * as THREE from 'three';

const PI2 = Math.PI * 2;
let _camera, _TILE, _MAP_W, _MAP_H, _map, _player,
    _doors, _perkMachines, _perks, _mysteryBox, _packAPunch,
    _easterEgg, _getZombies, _powerUps, _POWERUP_TYPES;

export function setMinimapDeps(deps) {
  _camera = deps.camera;
  _TILE = deps.TILE;
  _MAP_W = deps.MAP_W;
  _MAP_H = deps.MAP_H;
  _map = deps.map;
  _player = deps.player;
  _doors = deps.doors;
  _perkMachines = deps.perkMachines;
  _perks = deps.perks;
  _mysteryBox = deps.mysteryBox;
  _packAPunch = deps.packAPunch;
  _easterEgg = deps.easterEgg;
  _getZombies = deps.getZombies;
  _powerUps = deps.powerUps;
  _POWERUP_TYPES = deps.POWERUP_TYPES;
}

export function drawMinimap() {
  const mmCanvas = document.getElementById('minimapCanvas');
  const mmCtx = mmCanvas.getContext('2d');
  const mmW = 140, mmH = 140;
  const tileS = mmW / _MAP_W;
  mmCtx.clearRect(0, 0, mmW, mmH);
  mmCtx.fillStyle = 'rgba(0,0,0,0.6)';
  mmCtx.fillRect(0, 0, mmW, mmH);
  
  for (let r = 0; r < _MAP_H; r++) {
    for (let c = 0; c < _MAP_W; c++) {
      const cell = _map[r * _MAP_W + c];
      mmCtx.fillStyle = cell > 0 ? 'rgba(60,60,60,0.8)' : 'rgba(20,20,20,0.5)';
      mmCtx.fillRect(c * tileS, r * tileS, tileS, tileS);
    }
  }
  
  // Player
  const px = (_camera.position.x / (_MAP_W * _TILE)) * mmW;
  const pz = (_camera.position.z / (_MAP_H * _TILE)) * mmH;
  mmCtx.fillStyle = '#0f0';
  mmCtx.beginPath(); mmCtx.arc(px, pz, 2.5, 0, PI2); mmCtx.fill();
  
  // Direction
  const dir = new THREE.Vector3();
  _camera.getWorldDirection(dir);
  mmCtx.strokeStyle = '#0f0';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath(); mmCtx.moveTo(px, pz);
  mmCtx.lineTo(px + dir.x * 8, pz + dir.z * 8); mmCtx.stroke();
  
  // Doors (blinking)
  for (const door of _doors) {
    if (door.opened) continue;
    const blink = Math.sin(Date.now() / 300) > 0 ? 1 : 0.4;
    mmCtx.fillStyle = `rgba(255,80,30,${blink})`;
    for (const [tx, tz] of door.tiles) {
      mmCtx.fillRect((tx + 0.5) * tileS - 2, (tz + 0.5) * tileS - 2, 4, 4);
    }
  }
  
  // Perk machines
  for (const pm of _perkMachines) {
    const perk = _perks[pm.perkIdx];
    mmCtx.fillStyle = _player.perksOwned[perk.id] ? 'rgba(100,100,100,0.5)' : perk.color;
    mmCtx.fillRect((pm.tx + 0.5) * tileS - 2, (pm.tz + 0.5) * tileS - 2, 4, 4);
  }
  
  // Easter egg generators
  for (const gen of _easterEgg.generators) {
    const gx = (gen.tx + 0.5) * tileS;
    const gz = (gen.tz + 0.5) * tileS;
    mmCtx.fillStyle = gen.activated ? gen.color : 'rgba(100,100,100,0.5)';
    const blink = gen.activated ? 1 : (Math.sin(Date.now() / 400) > 0 ? 0.8 : 0.3);
    mmCtx.globalAlpha = blink;
    mmCtx.beginPath(); mmCtx.arc(gx, gz, 3, 0, PI2); mmCtx.fill();
    mmCtx.globalAlpha = 1;
  }
  
  // Mystery Box (blue)
  const mbMmX = (_mysteryBox.tx + 0.5) * tileS;
  const mbMmZ = (_mysteryBox.tz + 0.5) * tileS;
  mmCtx.fillStyle = '#48f';
  mmCtx.beginPath(); mmCtx.arc(mbMmX, mbMmZ, 3, 0, PI2); mmCtx.fill();
  
  // Pack-a-Punch (purple)
  const ppMmX = (_packAPunch.tx + 0.5) * tileS;
  const ppMmZ = (_packAPunch.tz + 0.5) * tileS;
  mmCtx.fillStyle = '#a0f';
  mmCtx.beginPath(); mmCtx.arc(ppMmX, ppMmZ, 3, 0, PI2); mmCtx.fill();
  
  // Power-up drops (flashing)
  for (const pu of _powerUps) {
    const puX = (pu.wx / (_MAP_W * _TILE)) * mmW;
    const puZ = (pu.wz / (_MAP_H * _TILE)) * mmH;
    mmCtx.fillStyle = _POWERUP_TYPES[pu.typeIdx].color;
    mmCtx.beginPath(); mmCtx.arc(puX, puZ, 2, 0, PI2); mmCtx.fill();
  }
  
  // Zombies
  const zombies = _getZombies();
  for (const z of zombies) {
    const zx = (z.wx / (_MAP_W * _TILE)) * mmW;
    const zz = (z.wz / (_MAP_H * _TILE)) * mmH;
    mmCtx.fillStyle = z.isBoss ? '#ff0' : z.isElite ? '#f90' : '#f00';
    const zr = z.isBoss ? 3.5 : z.isElite ? 2.2 : 1.5;
    mmCtx.beginPath(); mmCtx.arc(zx, zz, zr, 0, PI2); mmCtx.fill();
  }
}
