// Spectator camera + overlay for mid-match joiners.
//
// When the server tells the client it's spectating (joined after a
// round started), the main update loop skips normal input / movement /
// shooting entirely and calls tickSpectator() instead. This module:
//
//   - shows the spectator overlay while spectating
//   - snaps the camera every frame to a live (non-spectator, non-downed)
//     teammate so the viewer sees the action
//   - handles the spectating → live transition when a new round
//     starts: resets hp + ammo state and drops the player into the
//     map at an offset tile so they don't stack on the host
//
// Wiring from main.js:
//   import { initSpectator, tickSpectator } from './netcode/spectator.js';
//   initSpectator({ camera, controls, player, netcode, TILE });
//   // each update loop tick, inside the MP branch:
//   if (tickSpectator()) return;  // caller should skip normal update

import * as netcodeNs from './connection.js';

let _camera = null;
let _controls = null;
let _player = null;
let _netcode = null;
let _TILE = 4;
let _overlayEl = null;
let _targetEl = null;
let _wasSpectating = false;

export function initSpectator(ctx) {
  _camera = ctx.camera;
  _controls = ctx.controls;
  _player = ctx.player;
  _netcode = ctx.netcode || netcodeNs;
  _TILE = ctx.TILE ?? 4;
  _overlayEl = document.getElementById('spectatorOverlay');
  _targetEl = document.getElementById('spectatorTarget');
}

/**
 * @returns {boolean} true while the local player is spectating — caller
 *   should skip the rest of its update tick.
 */
export function tickSpectator() {
  if (!_netcode.isConnected()) {
    if (_overlayEl && _overlayEl.style.display !== 'none') {
      _overlayEl.style.display = 'none';
    }
    _wasSpectating = false;
    return false;
  }
  const spec = _netcode.isLocalPlayerSpectating();
  if (!spec) {
    if (_wasSpectating) {
      // Transition spectating → live: drop us into the match at a
      // spawn point with a fresh HP/ammo setup (but KEEP points/round).
      _wasSpectating = false;
      if (_overlayEl) _overlayEl.style.display = 'none';
      _player.hp = _player.maxHp;
      _player.reloading = false;
      _player.reloadTimer = 0;
      // Offset a couple of tiles from centre in one of N/S/E/W so the
      // spawning player doesn't stack on top of the host.
      const offsets = [{x:0,z:-2},{x:2,z:0},{x:0,z:2},{x:-2,z:0}];
      const o = offsets[Math.floor(Math.random() * offsets.length)];
      _camera.position.set((12 + o.x) * _TILE, 1.6, (12 + o.z) * _TILE);
      _controls._yaw = Math.random() * Math.PI * 2;
      _controls._pitch = 0;
      _controls._applyRotation();
    }
    return false;
  }
  _wasSpectating = true;
  if (_overlayEl && _overlayEl.style.display !== 'block') {
    _overlayEl.style.display = 'block';
  }
  // Snap camera to the first live teammate so the spectator sees
  // what someone's doing (and the overlay labels who they're watching).
  let target = null;
  let targetName = '';
  for (const rp of _netcode.getRemotePlayers().values()) {
    if (rp.spectating) continue;
    if (rp.downed) continue;
    target = rp;
    targetName = rp.name || 'Survivor';
    break;
  }
  if (target) {
    _camera.position.set(target.wx, 1.6, target.wz);
    // ry is updated via the subscription so this approximately tracks
    // the watched player's facing direction.
    _controls._yaw = target.ry || 0;
    _controls._applyRotation();
    if (_targetEl) _targetEl.textContent = `Watching ${targetName}`;
  } else if (_targetEl) {
    _targetEl.textContent = 'No live teammates — waiting…';
  }
  return true;
}
