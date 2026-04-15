// Multiplayer revive system — "downed" state + hold-E-to-revive interaction.
//
// Owned by this module:
//   - the _downed flag for the local player (HP ≤ 0 in MP enters this
//     instead of the SP death screen)
//   - the per-frame tick that scans remote players for downed teammates,
//     shows the "Hold E to revive X" prompt, fills the progress bar, and
//     calls the revive reducer at 100%
//   - the DOWNED red overlay visibility + the reviveHud element
//
// main.js wires it up once at init via initReviveMp(ctx) and then calls
// tickDowned / tickRevive / onLocalHpZero from its update loop.

import * as netcode from './connection.js';

const REVIVE_TIME_SEC = 3.0;
const REVIVE_RANGE = 3.0;

let _ctx = null;
let _downed = false;
let _reviveProgress = 0;
let _reviveTargetHex = null;

export function initReviveMp(ctx) { _ctx = ctx; }

// DOM refs (looked up lazily because the elements live in index.html).
function getOverlay() { return document.getElementById('downedOverlay'); }
function getHud() { return document.getElementById('reviveHud'); }
function getBar() { return document.getElementById('reviveBar'); }
function getTargetName() { return document.getElementById('reviveTargetName'); }

export function isLocallyDowned() { return _downed; }

/**
 * Called from main.js when the local player's HP hits 0 during a zombie
 * attack. In SP returns false so the caller can run the regular game-over.
 * In MP enters the revivable downed state, fires the server reducer,
 * and returns true.
 */
export function onLocalHpZero() {
  if (!netcode.isConnected()) return false;
  _downed = true;
  _ctx.controls.unlock();
  _ctx.sfxPlayerDeath();
  try { netcode.callReportPlayerDowned(); } catch (e) {}
  return true;
}

/**
 * Per-frame. Call when _downed is true. Shows the overlay and polls
 * the server — if another player revived us, restore hp and clear state.
 */
export function tickDowned() {
  if (!_downed) return;
  const ov = getOverlay();
  if (ov && ov.style.display !== 'block') ov.style.display = 'block';
  const hud = getHud();
  if (hud && hud.style.display !== 'none') hud.style.display = 'none';

  if (netcode.isConnected() && !netcode.isLocalPlayerDowned()) {
    _downed = false;
    _ctx.setPlayerHp(50);
    if (ov) ov.style.display = 'none';
  }
}

/**
 * Per-frame. Call every frame when we're NOT downed. Scans remote players
 * for downed teammates within REVIVE_RANGE, shows the prompt, fills/decays
 * the progress bar based on whether E is held, and fires the reducer on
 * completion.
 */
export function tickRevive(dt) {
  if (!netcode.isConnected()) {
    _reviveProgress = 0;
    _reviveTargetHex = null;
    const hud = getHud();
    if (hud && hud.style.display !== 'none') hud.style.display = 'none';
    return;
  }

  const camera = _ctx.camera;
  let nearest = null, nearestHex = null, nearestD = Infinity;
  for (const [hex, rp] of netcode.getRemotePlayers()) {
    if (!rp.downed) continue;
    const dx = rp.wx - camera.position.x;
    const dz = rp.wz - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d < nearestD) { nearestD = d; nearest = rp; nearestHex = hex; }
  }

  const hud = getHud();
  if (!nearest || nearestD > REVIVE_RANGE) {
    _reviveProgress = 0;
    _reviveTargetHex = null;
    if (hud && hud.style.display !== 'none') hud.style.display = 'none';
    return;
  }

  if (_reviveTargetHex !== nearestHex) {
    _reviveTargetHex = nearestHex;
    _reviveProgress = 0;
  }

  if (hud) {
    hud.style.display = 'block';
    const nameEl = getTargetName();
    if (nameEl) nameEl.textContent = nearest.name || 'Survivor';
  }

  if (_ctx.keys['e']) {
    _reviveProgress = Math.min(1, _reviveProgress + dt / REVIVE_TIME_SEC);
  } else {
    _reviveProgress = Math.max(0, _reviveProgress - dt * 2);
  }
  const bar = getBar();
  if (bar) bar.style.width = `${Math.round(_reviveProgress * 100)}%`;

  if (_reviveProgress >= 1) {
    _reviveProgress = 0;
    try { netcode.callRevivePlayer(nearest.identity); }
    catch (e) { console.warn('[mp] revivePlayer failed', e); }
    if (hud) hud.style.display = 'none';
  }
}
