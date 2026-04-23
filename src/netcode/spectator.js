// Spectator camera + overlay for mid-match joiners.
//
// When the server tells the client it's spectating (joined after a
// round started), the main update loop skips normal input / movement /
// shooting entirely and calls tickSpectator() instead. This module:
//
//   - shows the spectator overlay while spectating
//   - SMOOTHLY tracks a live (non-spectator, non-downed) teammate so
//     the camera doesn't snap-jitter every frame as the watched player
//     moves and turns
//   - lets the spectator cycle through teammates with A/D (desktop) or
//     a tap on either side of the screen (mobile)
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
let _switchHintEl = null;
let _wasSpectating = false;
// Index into the current eligible-target list. Stays sticky across
// frames so the camera doesn't jump targets on every roster change.
let _targetIdx = 0;
// A/D keypress edges so a single tap cycles ONCE (not every frame the
// key is held). Tracked in spectator-local state because main.js's
// keyPressed() machinery is gated behind the playing/!iAmDowned check
// that this module is bypassing.
let _prevA = false, _prevD = false;
// Mobile tap-to-switch debounce — one cycle per tap.
let _tapPendingDir = 0;
let _tapHandlerInstalled = false;

export function initSpectator(ctx) {
  _camera = ctx.camera;
  _controls = ctx.controls;
  _player = ctx.player;
  _netcode = ctx.netcode || netcodeNs;
  _TILE = ctx.TILE ?? 4;
  _overlayEl = document.getElementById('spectatorOverlay');
  _targetEl = document.getElementById('spectatorTarget');
  _switchHintEl = document.getElementById('spectatorSwitchHint');
  // Mobile: tap left half = previous teammate, right half = next. Only
  // installed once. Pointer events fire on top of the
  // pointer-events:none overlay because we attach to the document.
  if (!_tapHandlerInstalled && typeof window !== 'undefined') {
    document.addEventListener('touchstart', (e) => {
      if (!_overlayEl || _overlayEl.style.display === 'none') return;
      const t = e.changedTouches[0];
      if (!t) return;
      _tapPendingDir = (t.clientX < window.innerWidth / 2) ? -1 : 1;
    }, { passive: true });
    _tapHandlerInstalled = true;
  }
}

function _gatherEligibleTargets() {
  const list = [];
  for (const rp of _netcode.getRemotePlayers().values()) {
    if (rp.spectating) continue;
    if (rp.downed) continue;
    list.push(rp);
  }
  // Stable order so cycling feels consistent: by name then identity hex.
  list.sort((a, b) => {
    const an = (a.name || '').toLowerCase();
    const bn = (b.name || '').toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    const ai = (a.identity && a.identity.toString && a.identity.toString()) || '';
    const bi = (b.identity && b.identity.toString && b.identity.toString()) || '';
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  return list;
}

/**
 * @returns {boolean} true while the local player is spectating — caller
 *   should skip the rest of its update tick.
 */
export function tickSpectator(dt = 0.016, keys = {}) {
  if (!_netcode.isConnected()) {
    if (_overlayEl && _overlayEl.style.display !== 'none') {
      _overlayEl.style.display = 'none';
    }
    if (_switchHintEl) _switchHintEl.style.display = 'none';
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
      if (_switchHintEl) _switchHintEl.style.display = 'none';
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

  // Build the eligible target list and resolve cycle inputs.
  const list = _gatherEligibleTargets();
  if (list.length === 0) {
    if (_targetEl) _targetEl.textContent = 'No live teammates — waiting…';
    if (_switchHintEl) _switchHintEl.style.display = 'none';
    return true;
  }
  // Show the cycle hint once there's a choice to make.
  if (_switchHintEl) _switchHintEl.style.display = (list.length > 1) ? 'block' : 'none';

  // A/D edge-cycling (desktop). Wraps around the list.
  const aDown = !!keys['a'], dDown = !!keys['d'];
  let cycleDir = 0;
  if (aDown && !_prevA) cycleDir -= 1;
  if (dDown && !_prevD) cycleDir += 1;
  _prevA = aDown; _prevD = dDown;
  // Mobile tap dispatch
  if (_tapPendingDir !== 0) {
    cycleDir += _tapPendingDir;
    _tapPendingDir = 0;
  }
  if (cycleDir !== 0) {
    _targetIdx = ((_targetIdx + cycleDir) % list.length + list.length) % list.length;
  }
  if (_targetIdx >= list.length) _targetIdx = 0;
  const target = list[_targetIdx];

  // Smoothed camera follow — lerp position + yaw so the watched player's
  // motion is fluid instead of teleport-snapping every frame. Lerp
  // factor ~10 hz gives a half-second catch-up which reads as smooth.
  const k = Math.min(1, dt * 10);
  _camera.position.x += (target.wx - _camera.position.x) * k;
  _camera.position.z += (target.wz - _camera.position.z) * k;
  _camera.position.y = 1.6;
  // Yaw lerp must wrap shortest-arc to avoid spinning the long way
  // around when the target's facing crosses the ±π seam.
  const wantYaw = target.ry || 0;
  let cur = _controls._yaw;
  let delta = wantYaw - cur;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  _controls._yaw = cur + delta * k;
  _controls._applyRotation();

  if (_targetEl) {
    const name = target.name || 'Survivor';
    if (list.length > 1) {
      _targetEl.textContent = `Watching ${name} (${_targetIdx + 1}/${list.length})`;
    } else {
      _targetEl.textContent = `Watching ${name}`;
    }
  }
  return true;
}
