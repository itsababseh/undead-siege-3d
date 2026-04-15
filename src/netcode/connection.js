// Netcode wrapper — all the SpacetimeDB surface area the game touches.
// Tables subscribed: player, game_state, zombie, door, power_up.
//
// Authority model: HOST AUTHORITY. One client is elected host. The host
// runs the existing zombie AI locally and pushes state to the Zombie table
// at ~15 Hz. HP is server-authoritative (damage_zombie reducer).

import { DbConnection } from './module_bindings/index.ts';

// ── Config ────────────────────────────────────────────────────────────────
// Connect target priority:
//   1. ?stdb=... URL param (handy for dev: ?stdb=ws://127.0.0.1:3000)
//   2. localStorage.stdbUri (sticky override)
//   3. Maincloud (default — works out of the box once the site is online)
function resolveUri() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('stdb') ||
    localStorage.getItem('stdbUri') ||
    'wss://maincloud.spacetimedb.com'
  );
}
const MODULE_NAME = 'undead-siege';
const TOKEN_KEY = 'undead-siege.stdb.token';
const TRANSFORM_HZ = 20;
const ZOMBIE_SYNC_HZ = 20;
const HOST_HEARTBEAT_HZ = 0.5; // every 2s

// ── State ─────────────────────────────────────────────────────────────────
let _conn = null;
let _connecting = false;
let _localIdentity = null;
let _status = 'disconnected';
let _statusMessage = '';

// Timers
let _transformTimer = 0;
let _zombieSyncTimer = 0;
let _hostHeartbeatTimer = 0;
let _pendingTransform = null;

// Dead-reckoning state — skip reducer calls when nothing changed since
// the last send. Big CPU saving on the Maincloud side for idle players
// (standing at the buy menu = zero transform calls instead of 20/sec).
let _lastSentTransform = null; // { wx, wz, ry }
const _lastSyncedZombiePos = new Map(); // hostZidStr -> { wx, wz, flashLevel }
// Position delta that counts as "movement worth syncing" (world units).
const POS_EPS = 0.05;
const ROT_EPS = 0.02;
const FLASH_EPS = 0.1;

const _listeners = new Set();

// Subscribed table snapshots (kept in sync via onInsert/onUpdate/onDelete)
// Keyed by whatever natural key makes sense for the table.
const _remotePlayers = new Map(); // identityHex -> { identity, name, wx, wz, ry, hp }
const _zombies = new Map();       // hostZidStr  -> { hostZid, zombieType, wx, wz, ry, hp, maxHp, flashLevel }
const _doors = new Map();         // doorId      -> { doorId, opened }
const _powerUps = new Map();      // puIdStr     -> { puId, typeIdx, wx, wz }
let _gameState = null;            // singleton { gameId, hostIdentity, round, hostLastSeen }

// Host simulation pushes — set by main.js via setHostZombiesProvider()
let _hostZombiesProvider = null;

// Event callbacks — main.js registers these to react to table changes.
// Must be fire-and-forget; called from subscription delta events.
let _onZombieInsert = null;
let _onZombieUpdate = null;
let _onZombieDelete = null;
let _onDoorUpdate = null;
let _onPowerUpInsert = null;
let _onPowerUpDelete = null;
let _onGameStateUpdate = null;
export function setOnZombieInsert(fn) { _onZombieInsert = fn; }
export function setOnZombieUpdate(fn) { _onZombieUpdate = fn; }
export function setOnZombieDelete(fn) { _onZombieDelete = fn; }
export function setOnDoorUpdate(fn) { _onDoorUpdate = fn; }
export function setOnPowerUpInsert(fn) { _onPowerUpInsert = fn; }
export function setOnPowerUpDelete(fn) { _onPowerUpDelete = fn; }
export function setOnGameStateUpdate(fn) { _onGameStateUpdate = fn; }

// ── Helpers ───────────────────────────────────────────────────────────────
function notify() {
  for (const cb of _listeners) {
    try { cb({ status: _status, message: _statusMessage }); }
    catch (e) { console.error('[netcode] listener failed', e); }
  }
}

function setStatus(status, message = '') {
  _status = status;
  _statusMessage = message;
  notify();
}

function identityHex(identity) {
  return typeof identity?.toHexString === 'function'
    ? identity.toHexString()
    : String(identity);
}

function syncPlayerFromRow(row) {
  const hex = identityHex(row.identity);
  if (_localIdentity && hex === identityHex(_localIdentity)) return;
  _remotePlayers.set(hex, {
    identity: row.identity,
    name: row.name,
    wx: row.wx,
    wz: row.wz,
    ry: row.ry,
    hp: row.hp,
    alive: row.alive,
    downed: row.downed,
    lastUpdate: performance.now(),
  });
}

function syncZombieFromRow(row) {
  _zombies.set(row.hostZid.toString(), {
    hostZid: row.hostZid,
    zombieType: row.zombieType,
    wx: row.wx,
    wz: row.wz,
    ry: row.ry,
    hp: row.hp,
    maxHp: row.maxHp,
    flashLevel: row.flashLevel,
    lastUpdate: performance.now(),
  });
}

function syncDoorFromRow(row) {
  _doors.set(row.doorId, { doorId: row.doorId, opened: row.opened });
}

function syncPowerUpFromRow(row) {
  _powerUps.set(row.puId.toString(), {
    puId: row.puId,
    typeIdx: row.typeIdx,
    wx: row.wx,
    wz: row.wz,
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/** Subscribe to status changes. Returns unsubscribe fn. */
export function onStatus(cb) {
  _listeners.add(cb);
  try { cb({ status: _status, message: _statusMessage }); }
  catch (e) { console.error('[netcode] listener failed', e); }
  return () => _listeners.delete(cb);
}

export function getStatus() { return _status; }
export function isConnected() { return _status === 'connected'; }
export function getRemotePlayers() { return _remotePlayers; }
export function getZombies() { return _zombies; }
export function getDoors() { return _doors; }
export function getPowerUps() { return _powerUps; }
export function getGameState() { return _gameState; }
export function getLocalIdentity() { return _localIdentity; }

export function isHost() {
  if (!_gameState || !_gameState.hostIdentity || !_localIdentity) return false;
  return identityHex(_gameState.hostIdentity) === identityHex(_localIdentity);
}

/** Main.js supplies a function returning the host's authoritative zombie list. */
export function setHostZombiesProvider(fn) { _hostZombiesProvider = fn; }

export function connect() {
  if (_conn || _connecting) return;
  _connecting = true;
  setStatus('connecting');

  const uri = resolveUri();
  const savedToken = localStorage.getItem(TOKEN_KEY) || undefined;

  try {
    _conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(MODULE_NAME)
      .withToken(savedToken)
      .onConnect((conn, identity, token) => {
        _localIdentity = identity;
        if (token) localStorage.setItem(TOKEN_KEY, token);
        console.log('[netcode] connected as', identityHex(identity));

        conn.subscriptionBuilder()
          .onApplied(() => {
            _remotePlayers.clear();
            _zombies.clear();
            _doors.clear();
            _powerUps.clear();
            _gameState = null;
            for (const row of conn.db.player.iter()) syncPlayerFromRow(row);
            for (const row of conn.db.zombie.iter()) syncZombieFromRow(row);
            for (const row of conn.db.door.iter()) syncDoorFromRow(row);
            for (const row of conn.db.powerUp.iter()) syncPowerUpFromRow(row);
            for (const row of conn.db.gameState.iter()) { _gameState = row; break; }
            setStatus('connected');
            // Try to claim host on connection. Idempotent — if someone else
            // has it, this is a no-op.
            try { conn.reducers.claimHost(); }
            catch (e) { console.warn('[netcode] claimHost failed', e); }
          })
          .onError((err) => {
            console.error('[netcode] subscription error', err);
            setStatus('error', String(err));
          })
          .subscribe([
            'SELECT * FROM player',
            'SELECT * FROM zombie',
            'SELECT * FROM door',
            'SELECT * FROM power_up',
            'SELECT * FROM game_state',
          ]);

        conn.db.player.onInsert((_c, row) => syncPlayerFromRow(row));
        conn.db.player.onUpdate((_c, _o, row) => syncPlayerFromRow(row));
        conn.db.player.onDelete((_c, row) => {
          _remotePlayers.delete(identityHex(row.identity));
        });

        conn.db.zombie.onInsert((_c, row) => {
          syncZombieFromRow(row);
          if (_onZombieInsert) { try { _onZombieInsert(row); } catch (e) { console.warn('[netcode] onZombieInsert cb', e); } }
        });
        conn.db.zombie.onUpdate((_c, _o, row) => {
          syncZombieFromRow(row);
          if (_onZombieUpdate) { try { _onZombieUpdate(row); } catch (e) { console.warn('[netcode] onZombieUpdate cb', e); } }
        });
        conn.db.zombie.onDelete((_c, row) => {
          _zombies.delete(row.hostZid.toString());
          if (_onZombieDelete) { try { _onZombieDelete(row); } catch (e) { console.warn('[netcode] onZombieDelete cb', e); } }
        });

        conn.db.door.onInsert((_c, row) => {
          syncDoorFromRow(row);
          if (_onDoorUpdate) { try { _onDoorUpdate(row); } catch (e) { console.warn('[netcode] onDoorUpdate cb', e); } }
        });
        conn.db.door.onUpdate((_c, _o, row) => {
          syncDoorFromRow(row);
          if (_onDoorUpdate) { try { _onDoorUpdate(row); } catch (e) { console.warn('[netcode] onDoorUpdate cb', e); } }
        });
        conn.db.door.onDelete((_c, row) => _doors.delete(row.doorId));

        conn.db.powerUp.onInsert((_c, row) => {
          syncPowerUpFromRow(row);
          if (_onPowerUpInsert) { try { _onPowerUpInsert(row); } catch (e) { console.warn('[netcode] onPowerUpInsert cb', e); } }
        });
        conn.db.powerUp.onUpdate((_c, _o, row) => syncPowerUpFromRow(row));
        conn.db.powerUp.onDelete((_c, row) => {
          _powerUps.delete(row.puId.toString());
          if (_onPowerUpDelete) { try { _onPowerUpDelete(row); } catch (e) { console.warn('[netcode] onPowerUpDelete cb', e); } }
        });

        conn.db.gameState.onInsert((_c, row) => { _gameState = row; if (_onGameStateUpdate) { try { _onGameStateUpdate(row); } catch (e) {} } });
        conn.db.gameState.onUpdate((_c, _o, row) => { _gameState = row; if (_onGameStateUpdate) { try { _onGameStateUpdate(row); } catch (e) {} } });
      })
      .onConnectError((_ctx, err) => {
        console.error('[netcode] connect error', err);
        _connecting = false;
        setStatus('error', String(err && err.message || err));
      })
      .onDisconnect(() => {
        console.log('[netcode] disconnected');
        _conn = null;
        _localIdentity = null;
        _remotePlayers.clear();
        _zombies.clear();
        _doors.clear();
        _powerUps.clear();
        _gameState = null;
        _connecting = false;
        setStatus('disconnected');
      })
      .build();
  } catch (err) {
    console.error('[netcode] failed to build connection', err);
    _conn = null;
    _connecting = false;
    setStatus('error', String(err && err.message || err));
  }
}

export function disconnect() {
  if (!_conn) return;
  try { _conn.disconnect(); } catch (e) { console.warn('[netcode] disconnect threw', e); }
  _conn = null;
  _localIdentity = null;
  _remotePlayers.clear();
  _zombies.clear();
  _doors.clear();
  _powerUps.clear();
  _gameState = null;
  _connecting = false;
  _lastSentTransform = null;
  _lastSyncedZombiePos.clear();
  setStatus('disconnected');
}

// ── Per-frame call from main.js ───────────────────────────────────────────

export function setLocalTransform(wx, wz, ry) {
  _pendingTransform = { wx, wz, ry };
}

export function update(dt) {
  if (!isConnected() || !_conn) return;

  // 1. Local transform push (~20 Hz) — but skip the call entirely if the
  // player is standing still (within POS_EPS / ROT_EPS of the last sent).
  // Players who are at the buy menu, aiming, reloading, or in the round
  // transition go from 20 reducer calls/sec to 0.
  _transformTimer += dt;
  if (_transformTimer >= 1 / TRANSFORM_HZ && _pendingTransform) {
    _transformTimer = 0;
    const { wx, wz, ry } = _pendingTransform;
    const moved = _lastSentTransform === null
      || Math.abs(wx - _lastSentTransform.wx) > POS_EPS
      || Math.abs(wz - _lastSentTransform.wz) > POS_EPS
      || Math.abs(ry - _lastSentTransform.ry) > ROT_EPS;
    if (moved) {
      try { _conn.reducers.updatePlayerTransform({ wx, wz, ry }); }
      catch (e) { console.warn('[netcode] updatePlayerTransform failed', e); }
      _lastSentTransform = { wx, wz, ry };
    }
  }

  // 2. Host heartbeat + opportunistic re-claim (every 2s)
  _hostHeartbeatTimer += dt;
  if (_hostHeartbeatTimer >= 1 / HOST_HEARTBEAT_HZ) {
    _hostHeartbeatTimer = 0;
    try {
      if (isHost()) _conn.reducers.hostHeartbeat();
      else _conn.reducers.claimHost(); // take over if current host timed out
    } catch (e) { console.warn('[netcode] host heartbeat/claim failed', e); }
  }

  // 3. Zombie sync (host only). Only send zombies that actually moved
  // (or whose flash level meaningfully changed) since the last sync.
  // Skip the reducer call entirely if no zombie moved. During round
  // transitions / between waves this drops sync_zombie_positions to 0
  // calls/sec from the 20/sec idle baseline.
  _zombieSyncTimer += dt;
  if (_zombieSyncTimer >= 1 / ZOMBIE_SYNC_HZ) {
    _zombieSyncTimer = 0;
    if (isHost() && _hostZombiesProvider) {
      try {
        const raw = _hostZombiesProvider();
        if (raw && raw.length > 0) {
          const filtered = [];
          const seen = new Set();
          for (const u of raw) {
            const key = u.hostZid.toString();
            seen.add(key);
            const prev = _lastSyncedZombiePos.get(key);
            if (
              !prev ||
              Math.abs(u.wx - prev.wx) > POS_EPS ||
              Math.abs(u.wz - prev.wz) > POS_EPS ||
              Math.abs((u.flashLevel || 0) - (prev.flashLevel || 0)) > FLASH_EPS
            ) {
              filtered.push(u);
              _lastSyncedZombiePos.set(key, {
                wx: u.wx, wz: u.wz, flashLevel: u.flashLevel || 0,
              });
            }
          }
          // Evict rows we no longer have (zombie died / despawned).
          for (const key of _lastSyncedZombiePos.keys()) {
            if (!seen.has(key)) _lastSyncedZombiePos.delete(key);
          }
          if (filtered.length > 0) {
            _conn.reducers.syncZombiePositions({ updates: filtered });
          }
        } else if (_lastSyncedZombiePos.size > 0) {
          // No zombies at all — clear our dead-reckoning cache so a
          // fresh wave starts clean.
          _lastSyncedZombiePos.clear();
        }
      } catch (e) { console.warn('[netcode] syncZombiePositions failed', e); }
    }
  }
}

// ── Reducer helpers (called from main.js directly) ───────────────────────

export function callSpawnZombie(args) {
  if (!_conn) return;
  try { _conn.reducers.spawnZombie(args); }
  catch (e) { console.warn('[netcode] spawnZombie failed', e); }
}

export function callDamageZombie(hostZid, damage) {
  if (!_conn) return;
  try { _conn.reducers.damageZombie({ hostZid, damage }); }
  catch (e) { console.warn('[netcode] damageZombie failed', e); }
}

export function callRemoveZombie(hostZid) {
  if (!_conn) return;
  try { _conn.reducers.removeZombie({ hostZid }); }
  catch (e) { console.warn('[netcode] removeZombie failed', e); }
}

export function callAdvanceRound() {
  if (!_conn) return;
  try { _conn.reducers.advanceRound(); }
  catch (e) { console.warn('[netcode] advanceRound failed', e); }
}

export function callSetRound(round) {
  if (!_conn) return;
  try { _conn.reducers.setRound({ round }); }
  catch (e) { console.warn('[netcode] setRound failed', e); }
}

export function callOpenDoor(doorId) {
  if (!_conn) return;
  try { _conn.reducers.openDoor({ doorId }); }
  catch (e) { console.warn('[netcode] openDoor failed', e); }
}

export function callSpawnPowerUp(args) {
  if (!_conn) return;
  try { _conn.reducers.spawnPowerup(args); }
  catch (e) { console.warn('[netcode] spawnPowerup failed', e); }
}

export function callConsumePowerUp(puId) {
  if (!_conn) return;
  try { _conn.reducers.consumePowerup({ puId }); }
  catch (e) { console.warn('[netcode] consumePowerup failed', e); }
}

export function callReportPlayerAlive(alive) {
  if (!_conn) return;
  try { _conn.reducers.reportPlayerAlive({ alive }); }
  catch (e) { console.warn('[netcode] reportPlayerAlive failed', e); }
}

export function callReportPlayerDowned() {
  if (!_conn) return;
  try { _conn.reducers.reportPlayerDowned(); }
  catch (e) { console.warn('[netcode] reportPlayerDowned failed', e); }
}

export function callRevivePlayer(targetIdentity) {
  if (!_conn) return;
  try { _conn.reducers.revivePlayer({ targetIdentity }); }
  catch (e) { console.warn('[netcode] revivePlayer failed', e); }
}

/**
 * Returns true if the local player row says we're downed.
 * Queried each frame by main.js to decide whether to show the
 * DOWNED overlay and block input.
 */
export function isLocalPlayerDowned() {
  if (!_conn || !_localIdentity) return false;
  try {
    const row = _conn.db.player.identity.find(_localIdentity);
    return row ? !!row.downed : false;
  } catch (e) { return false; }
}
