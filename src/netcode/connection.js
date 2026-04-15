// Netcode wrapper — thin layer on top of the generated SpacetimeDB bindings.
// Keeps the game code ignorant of the SDK: it calls connect/disconnect and
// reads the remotePlayers map, that's it.
//
// Milestone 1 scope: one global lobby, each client streams its own transform
// at ~20 Hz, renders every other player's last-known transform. No zombies,
// no wave sync. Everything authoritative is still local.

import { DbConnection } from './module_bindings/index.ts';

// ── Config ────────────────────────────────────────────────────────────────
// Override with ?stdb=ws://host:3000 on the URL, or localStorage.stdbUri,
// otherwise default to local dev. Database name is fixed for now.
function resolveUri() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('stdb') ||
    localStorage.getItem('stdbUri') ||
    'ws://127.0.0.1:3000'
  );
}
const MODULE_NAME = 'undead-siege';
const TOKEN_KEY = 'undead-siege.stdb.token';
const TRANSFORM_HZ = 20;

// ── State ─────────────────────────────────────────────────────────────────
let _conn = null;
let _connecting = false;
let _localIdentity = null;
let _status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
let _statusMessage = '';
let _transformTimer = 0;
let _pendingTransform = null; // { wx, wz, ry }
const _listeners = new Set();

// Map<identityHex, { identity, name, wx, wz, ry, hp, lastUpdate }>
const _remotePlayers = new Map();

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
  return typeof identity.toHexString === 'function'
    ? identity.toHexString()
    : String(identity);
}

function syncPlayerFromRow(row) {
  const hex = identityHex(row.identity);
  // Skip self — local player is rendered from the camera, not from the table
  if (_localIdentity && hex === identityHex(_localIdentity)) return;
  _remotePlayers.set(hex, {
    identity: row.identity,
    name: row.name,
    wx: row.wx,
    wz: row.wz,
    ry: row.ry,
    hp: row.hp,
    lastUpdate: performance.now(),
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/** Subscribe to status changes. Returns unsubscribe fn. */
export function onStatus(cb) {
  _listeners.add(cb);
  // Fire immediately with current state
  try { cb({ status: _status, message: _statusMessage }); }
  catch (e) { console.error('[netcode] listener failed', e); }
  return () => _listeners.delete(cb);
}

export function getStatus() { return _status; }
export function isConnected() { return _status === 'connected'; }
export function getRemotePlayers() { return _remotePlayers; }
export function getLocalIdentity() { return _localIdentity; }

/** Open the connection. Idempotent. */
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

        // Subscribe to the player table. For M1 we grab every row; once we
        // add rooms we'll filter by game_id.
        conn.subscriptionBuilder()
          .onApplied(() => {
            // Seed remotePlayers with the initial set
            _remotePlayers.clear();
            for (const row of conn.db.player.iter()) syncPlayerFromRow(row);
            setStatus('connected');
          })
          .onError((err) => {
            console.error('[netcode] subscription error', err);
            setStatus('error', String(err));
          })
          .subscribe(['SELECT * FROM player']);

        // Keep the map in sync with live deltas
        conn.db.player.onInsert((_ctx, row) => syncPlayerFromRow(row));
        conn.db.player.onUpdate((_ctx, _oldRow, row) => syncPlayerFromRow(row));
        conn.db.player.onDelete((_ctx, row) => {
          _remotePlayers.delete(identityHex(row.identity));
        });
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
  _connecting = false;
  setStatus('disconnected');
}

/** Called every frame by the game loop with the local player's transform. */
export function setLocalTransform(wx, wz, ry) {
  _pendingTransform = { wx, wz, ry };
}

/** Called every frame. Flushes pending transform at TRANSFORM_HZ. */
export function update(dt) {
  if (!isConnected() || !_conn) return;
  _transformTimer += dt;
  const interval = 1 / TRANSFORM_HZ;
  if (_transformTimer >= interval && _pendingTransform) {
    _transformTimer = 0;
    const { wx, wz, ry } = _pendingTransform;
    try {
      _conn.reducers.updatePlayerTransform({ wx, wz, ry });
    } catch (e) {
      // A thrown reducer on the server (e.g. "no player row") shouldn't kill
      // the game loop — log and move on.
      console.warn('[netcode] updatePlayerTransform failed', e);
    }
  }
}
