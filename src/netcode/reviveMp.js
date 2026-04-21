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

// In-an-actual-match check. The death screen auto-connects so it can
// submit high scores; bare connection without a lobby must NOT count
// as MP for the revive system, otherwise SP runs after a death+retry
// would fall into the MP downed flow and softlock.
function _inActiveMatch() {
  if (!netcode.isConnected()) return false;
  try {
    const id = netcode.getMyLobbyId();
    return id && id !== 0n;
  } catch (e) { return false; }
}

const REVIVE_TIME_SEC = 3.0;
const REVIVE_RANGE = 3.0;

let _ctx = null;
let _downed = false;
// True once we've seen the server echo back our downed=true state.
// Used to gate the "server says we're up again, so we must have been
// revived" check in tickDowned — without it, there's a 30-100ms race
// between firing reportPlayerDowned() and the subscription delta
// arriving where tickDowned would see the stale (downed=false) local
// cache and auto-undown us.
let _downedAckedByServer = false;
// 2-second post-revive grace window. Just-revived players can't take
// zombie damage until this elapses — stops the "instant re-down"
// situation where you stand up with 50 hp and the same zombie that
// downed you bites you again on the next frame.
const REVIVE_GRACE_SEC = 2.0;
let _reviveGraceUntil = 0;
let _reviveProgress = 0;
let _reviveTargetHex = null;

export function initReviveMp(ctx) { _ctx = ctx; }

// DOM refs (looked up lazily because the elements live in index.html).
function getOverlay() { return document.getElementById('downedOverlay'); }
function getHud() { return document.getElementById('reviveHud'); }
function getBar() { return document.getElementById('reviveBar'); }
function getTargetName() { return document.getElementById('reviveTargetName'); }

export function isLocallyDowned() { return _downed; }

// Reset the downed state. Called by main.js when a match ends (squad
// wipe) or when a new game starts. Without this, _downed can persist
// from the last match and briefly flash the downed overlay on the
// first frame of a new match before tickDowned's server sync kicks in.
export function resetDownedState() {
  _downed = false;
  _downedAckedByServer = false;
  _reviveGraceUntil = 0;
  _reviveProgress = 0;
  _reviveTargetHex = null;
  const ov = getOverlay();
  if (ov) ov.style.display = 'none';
  const hud = getHud();
  if (hud) hud.style.display = 'none';
}

/**
 * True while the local player is in their post-revive grace window.
 * Zombie damage should be ignored while this is true.
 */
export function hasReviveGrace() {
  return performance.now() < _reviveGraceUntil;
}

/**
 * Called from main.js when the local player's HP hits 0 during a zombie
 * attack. In SP returns false so the caller can run the regular game-over.
 * In MP enters the revivable downed state, fires the server reducer,
 * and returns true.
 */
export function onLocalHpZero() {
  // Active match required — bare connection (e.g. high-score auto-
  // connect from the death screen) doesn't count. Without this guard
  // a SP run after a death+retry would enter the MP downed state on
  // the next death and softlock waiting for a teammate.
  if (!_inActiveMatch()) return false;
  _downed = true;
  _downedAckedByServer = false;
  _ctx.sfxPlayerDeath();
  // Hide any lingering UI that shouldn't stack on the downed overlay
  // (e.g. the MP 'click to refocus' hint when the player was away
  // from the screen at the moment of down).
  try { window.__onMpDownedStart && window.__onMpDownedStart(); } catch (e) {}
  // Deliberately DO NOT unlock the pointer here. Unlocking fires
  // pointerlockchange → showPause() which would stack the pause
  // overlay on top of the downed overlay. Keep the pointer locked;
  // the downed overlay covers the screen so the crosshair isn't a
  // problem, and it means clicking anywhere won't trigger the
  // pause-resume click handler while we're waiting for a revive.
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

  if (!_inActiveMatch()) return;

  const srvDowned = netcode.isLocalPlayerDowned();
  if (srvDowned) {
    // Server has echoed our downed=true state. From now on, a
    // subsequent !srvDowned is a real revive and safe to act on.
    _downedAckedByServer = true;
    return;
  }
  // srvDowned is false. Only treat that as "revived" if we've already
  // seen the server confirm our downed state. Without the ack guard,
  // the 30-100ms round-trip between reportPlayerDowned() and the
  // echo would auto-undown us on the very next frame.
  if (_downedAckedByServer) {
    _downed = false;
    _downedAckedByServer = false;
    _ctx.setPlayerHp(50);
    // Restore the weapon the player was holding when they went down.
    // main.js installs the hook; safe to no-op if not present.
    try { window.__onMpRevived && window.__onMpRevived(); } catch (e) {}
    // Start the post-revive invulnerability window so the same zombie
    // that downed us can't instant-bite us back to zero.
    _reviveGraceUntil = performance.now() + REVIVE_GRACE_SEC * 1000;
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
  if (!_inActiveMatch()) {
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

  // Quick Revive perk multiplies the fill rate (default 1x, perk = 4x
  // which means ~0.75s total instead of 3s).
  const speedMult = _ctx.getReviveSpeedMult ? _ctx.getReviveSpeedMult() : 1;
  if (_ctx.keys['q']) {
    _reviveProgress = Math.min(1, _reviveProgress + (dt * speedMult) / REVIVE_TIME_SEC);
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
