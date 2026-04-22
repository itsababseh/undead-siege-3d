// Netcode wrapper — all the SpacetimeDB surface area the game touches.
// M4: multi-lobby rooms. Each player is in at most one Lobby row at a
// time (lobbyId=0 means "on the MP menu"). Zombies/powerups/chat are
// scoped to a lobby via a lobbyId foreign key.
//
// Authority model: HOST AUTHORITY, per lobby. One client in each lobby
// runs the zombie AI locally and pushes positions via sync_zombie_-
// positions at ~20 Hz. HP is server-authoritative.

import { DbConnection } from './module_bindings/index.ts';

// ── Config ────────────────────────────────────────────────────────────────
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
const HOST_HEARTBEAT_HZ = 0.5;

// ── State ─────────────────────────────────────────────────────────────────
let _conn = null;
let _connecting = false;
let _localIdentity = null;
let _status = 'disconnected';
let _statusMessage = '';

let _transformTimer = 0;
let _zombieSyncTimer = 0;
let _hostHeartbeatTimer = 0;
let _pendingTransform = null;

// Dead-reckoning — same as M3, unchanged.
let _lastSentTransform = null;
const _lastSyncedZombiePos = new Map();
const POS_EPS = 0.05;
const ROT_EPS = 0.02;
const FLASH_EPS = 0.1;

const _listeners = new Set();

// Subscribed snapshots. All keyed by their natural id. Client-side
// filtering for the per-lobby tables is done in the callback layer
// via `row.lobbyId !== myLobbyId()` checks.
const _players = new Map();       // identityHex -> player row (all players, not just remote)
const _lobbies = new Map();       // lobbyIdStr -> lobby row
const _zombies = new Map();       // hostZidStr -> zombie row
const _powerUps = new Map();      // puIdStr    -> powerup row
const _chatMessages = [];         // all messages across all lobbies, filtered at read time
const _highScores = [];           // global
// Per-player current weapon index. Server schema doesn't have a weapon
// column on the Player row, so we piggyback on the chat channel: players
// broadcast "_wpn:N" markers when they switch, filtered from chat UI.
const _playerWeapons = new Map(); // identityHex -> weapon idx (0..3)

// Host sync / callbacks.
let _hostZombiesProvider = null;

let _onZombieInsert = null;
let _onZombieUpdate = null;
let _onZombieDelete = null;
let _onDoorUpdate = null;        // kept as a name — fires when local lobby's openedDoors changes
let _onPowerUpInsert = null;
let _onPowerUpDelete = null;
let _onLobbyUpdate = null;       // fires for the LOCAL lobby only
let _onChatMessage = null;
let _onHighScoresChange = null;
let _onLocalPlayerUpdate = null;
let _onMyLobbyChange = null;     // fires when local player's lobbyId changes
let _onLobbyListChange = null;   // fires on any lobby insert/update/delete (for browse list)

export function setOnZombieInsert(fn) { _onZombieInsert = fn; }
export function setOnZombieUpdate(fn) { _onZombieUpdate = fn; }
export function setOnZombieDelete(fn) { _onZombieDelete = fn; }
export function setOnDoorUpdate(fn) { _onDoorUpdate = fn; }
export function setOnPowerUpInsert(fn) { _onPowerUpInsert = fn; }
export function setOnPowerUpDelete(fn) { _onPowerUpDelete = fn; }
export function setOnLobbyUpdate(fn) { _onLobbyUpdate = fn; }
export function setOnChatMessage(fn) { _onChatMessage = fn; }
export function setOnHighScoresChange(fn) { _onHighScoresChange = fn; }
export function setOnLocalPlayerUpdate(fn) { _onLocalPlayerUpdate = fn; }
export function setOnMyLobbyChange(fn) { _onMyLobbyChange = fn; }
export function setOnLobbyListChange(fn) { _onLobbyListChange = fn; }

export function getChatMessages() {
  // Filter to only messages in the local player's current lobby.
  const myId = getMyLobbyId();
  if (!myId) return [];
  return _chatMessages.filter(m => m.lobbyId === myId);
}
export function getHighScores() { return _highScores; }
export function getAllLobbies() { return _lobbies; }
export function getPublicLobbies() {
  const out = [];
  for (const lobby of _lobbies.values()) {
    if (lobby.isPublic && lobby.playerCount < 5 && lobby.status === 'lobby') {
      out.push(lobby);
    }
  }
  out.sort((a, b) => b.playerCount - a.playerCount);
  return out;
}

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

function rowToPlayer(row) {
  const hex = identityHex(row.identity);
  return {
    identity: row.identity,
    name: row.name,
    lobbyId: row.lobbyId,
    wx: row.wx,
    wz: row.wz,
    ry: row.ry,
    hp: row.hp,
    points: row.points,
    // Per-match scoreboard counters. Default to 0 for defensiveness
    // against old rows that predate the schema change — but post
    // republish both fields should always be present.
    kills: row.kills ?? 0,
    downs: row.downs ?? 0,
    online: row.online,
    alive: row.alive,
    downed: row.downed,
    spectating: row.spectating,
    curWeapon: _playerWeapons.get(hex) ?? 0,
    lastUpdate: performance.now(),
  };
}

// Message prefix used to piggyback weapon updates on the chat stream.
// See _playerWeapons comment above for why.
const WEAPON_MSG_PREFIX = '_wpn:';
function _isWeaponMsg(text) { return typeof text === 'string' && text.startsWith(WEAPON_MSG_PREFIX); }
function _parseWeaponMsg(row) {
  if (!_isWeaponMsg(row.text)) return null;
  const n = parseInt(row.text.slice(WEAPON_MSG_PREFIX.length), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return { hex: identityHex(row.sender), weapon: n };
}

function syncPlayerFromRow(row) {
  _players.set(identityHex(row.identity), rowToPlayer(row));
}

function syncZombieFromRow(row) {
  _zombies.set(row.hostZid.toString(), {
    hostZid: row.hostZid,
    lobbyId: row.lobbyId,
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

function syncPowerUpFromRow(row) {
  _powerUps.set(row.puId.toString(), {
    puId: row.puId,
    lobbyId: row.lobbyId,
    typeIdx: row.typeIdx,
    wx: row.wx,
    wz: row.wz,
  });
}

function syncLobbyFromRow(row) {
  _lobbies.set(row.lobbyId.toString(), {
    lobbyId: row.lobbyId,
    inviteCode: row.inviteCode,
    hostIdentity: row.hostIdentity,
    hostName: row.hostName,
    status: row.status,
    round: row.round,
    isPublic: row.isPublic,
    openedDoors: row.openedDoors,
    playerCount: row.playerCount,
    createdAt: row.createdAt,
    hostLastSeen: row.hostLastSeen,
  });
}

function rowToChat(row) {
  return {
    msgId: row.msgId,
    lobbyId: row.lobbyId,
    sender: row.sender,
    senderName: row.senderName,
    text: row.text,
    createdAt: row.createdAt,
  };
}

function rowToHighScore(row) {
  return {
    scoreId: row.scoreId,
    name: row.name,
    round: row.round,
    points: row.points,
    kills: row.kills,
    createdAt: row.createdAt,
  };
}

function rebucketHighScores() {
  _highScores.sort((a, b) => {
    if (a.round !== b.round) return b.round - a.round;
    if (a.points !== b.points) return b.points - a.points;
    return Number(a.scoreId - b.scoreId);
  });
}

// ── Local lobby / player queries ──────────────────────────────────────────

function getLocalPlayer() {
  if (!_localIdentity) return null;
  return _players.get(identityHex(_localIdentity)) || null;
}

export function getMyLobbyId() {
  const p = getLocalPlayer();
  if (!p || !p.lobbyId || p.lobbyId === 0n) return 0n;
  return p.lobbyId;
}

export function getMyLobby() {
  const id = getMyLobbyId();
  if (!id || id === 0n) return null;
  return _lobbies.get(id.toString()) || null;
}

// Remote players = everybody except us, in the same lobby.
const _remotePlayersProxy = new Map();
function rebuildRemotePlayers() {
  _remotePlayersProxy.clear();
  const myLobby = getMyLobbyId();
  if (!myLobby || myLobby === 0n) return;
  const myHex = _localIdentity ? identityHex(_localIdentity) : null;
  for (const [hex, p] of _players) {
    if (hex === myHex) continue;
    if (p.lobbyId !== myLobby) continue;
    _remotePlayersProxy.set(hex, p);
  }
}
// All players in our lobby INCLUDING the local player. Used when we
// need a complete roster (e.g. naming the squad on a high-score submit).
export function getLobbyPlayers() {
  const out = [];
  const myLobby = getMyLobbyId();
  if (!myLobby || myLobby === 0n) return out;
  for (const p of _players.values()) {
    if (p.lobbyId === myLobby) out.push(p);
  }
  return out;
}

export function getRemotePlayers() {
  rebuildRemotePlayers();
  return _remotePlayersProxy;
}

export function getZombies() {
  // Used by hostSync catch-up on status transitions. Return only zombies
  // in our current lobby.
  const myLobby = getMyLobbyId();
  if (!myLobby) return new Map();
  const out = new Map();
  for (const [k, z] of _zombies) {
    if (z.lobbyId === myLobby) out.set(k, z);
  }
  return out;
}

// ── Status / host / game-state accessors ─────────────────────────────────

export function isHost() {
  const lobby = getMyLobby();
  if (!lobby || !lobby.hostIdentity || !_localIdentity) return false;
  return identityHex(lobby.hostIdentity) === identityHex(_localIdentity);
}

export function getGameStatus() {
  const lobby = getMyLobby();
  return lobby?.status || 'lobby';
}

export function getLocalIdentity() { return _localIdentity; }

// ── Public API — connection, host sync, status listener ──────────────────

export function onStatus(cb) {
  _listeners.add(cb);
  try { cb({ status: _status, message: _statusMessage }); }
  catch (e) { console.error('[netcode] listener failed', e); }
  return () => _listeners.delete(cb);
}

export function getStatus() { return _status; }
export function isConnected() { return _status === 'connected'; }

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
            _players.clear();
            _lobbies.clear();
            _zombies.clear();
            _powerUps.clear();
            _chatMessages.length = 0;
            _highScores.length = 0;
            for (const row of conn.db.player.iter()) syncPlayerFromRow(row);
            for (const row of conn.db.lobby.iter()) syncLobbyFromRow(row);
            for (const row of conn.db.zombie.iter()) syncZombieFromRow(row);
            for (const row of conn.db.powerUp.iter()) syncPowerUpFromRow(row);
            _playerWeapons.clear();
            for (const row of conn.db.chatMessage.iter()) {
              const wm = _parseWeaponMsg(row);
              if (wm) { _playerWeapons.set(wm.hex, wm.weapon); continue; }
              _chatMessages.push(rowToChat(row));
            }
            _chatMessages.sort((a, b) => Number(a.msgId - b.msgId));
            for (const row of conn.db.highScore.iter()) _highScores.push(rowToHighScore(row));
            rebucketHighScores();
            setStatus('connected');
          })
          .onError((err) => {
            console.error('[netcode] subscription error', err);
            setStatus('error', String(err));
          })
          .subscribe([
            'SELECT * FROM player',
            'SELECT * FROM lobby',
            'SELECT * FROM zombie',
            'SELECT * FROM power_up',
            'SELECT * FROM chat_message',
            'SELECT * FROM high_score',
          ]);

        // Player deltas. The local player row change drives lobby
        // transitions via _onLocalPlayerUpdate + _onMyLobbyChange.
        conn.db.player.onInsert((_c, row) => {
          const prev = _players.get(identityHex(row.identity));
          syncPlayerFromRow(row);
          if (_localIdentity && identityHex(row.identity) === identityHex(_localIdentity)) {
            if (_onLocalPlayerUpdate) { try { _onLocalPlayerUpdate(row); } catch (e) {} }
            if ((prev?.lobbyId || 0n) !== (row.lobbyId || 0n) && _onMyLobbyChange) {
              try { _onMyLobbyChange(row.lobbyId); } catch (e) {}
            }
          }
        });
        conn.db.player.onUpdate((_c, oldRow, row) => {
          syncPlayerFromRow(row);
          if (_localIdentity && identityHex(row.identity) === identityHex(_localIdentity)) {
            if (_onLocalPlayerUpdate) { try { _onLocalPlayerUpdate(row); } catch (e) {} }
            const prevLobby = oldRow?.lobbyId || 0n;
            if (prevLobby !== (row.lobbyId || 0n) && _onMyLobbyChange) {
              try { _onMyLobbyChange(row.lobbyId); } catch (e) {}
            }
          }
        });
        conn.db.player.onDelete((_c, row) => {
          _players.delete(identityHex(row.identity));
        });

        // Lobby deltas. Trigger onLobbyUpdate for our own lobby and
        // onLobbyListChange for the public browse list UI.
        conn.db.lobby.onInsert((_c, row) => {
          syncLobbyFromRow(row);
          if (_onLobbyListChange) { try { _onLobbyListChange(); } catch (e) {} }
          const my = getMyLobbyId();
          if (my && my === row.lobbyId && _onLobbyUpdate) {
            try { _onLobbyUpdate(row); } catch (e) {}
          }
        });
        conn.db.lobby.onUpdate((_c, _o, row) => {
          syncLobbyFromRow(row);
          if (_onLobbyListChange) { try { _onLobbyListChange(); } catch (e) {} }
          const my = getMyLobbyId();
          if (my && my === row.lobbyId && _onLobbyUpdate) {
            try { _onLobbyUpdate(row); } catch (e) {}
          }
        });
        conn.db.lobby.onDelete((_c, row) => {
          _lobbies.delete(row.lobbyId.toString());
          if (_onLobbyListChange) { try { _onLobbyListChange(); } catch (e) {} }
        });

        // Zombie deltas. Filter by our current lobby in the callbacks
        // so main.js / hostSync only see zombies from the lobby we're
        // in. Rows from other lobbies still update the local _zombies
        // map (for correctness) but the game code ignores them.
        conn.db.zombie.onInsert((_c, row) => {
          syncZombieFromRow(row);
          if (row.lobbyId !== getMyLobbyId()) return;
          if (_onZombieInsert) { try { _onZombieInsert(row); } catch (e) { console.warn('[netcode] onZombieInsert cb', e); } }
        });
        conn.db.zombie.onUpdate((_c, _o, row) => {
          syncZombieFromRow(row);
          if (row.lobbyId !== getMyLobbyId()) return;
          if (_onZombieUpdate) { try { _onZombieUpdate(row); } catch (e) { console.warn('[netcode] onZombieUpdate cb', e); } }
        });
        conn.db.zombie.onDelete((_c, row) => {
          _zombies.delete(row.hostZid.toString());
          if (row.lobbyId !== getMyLobbyId()) return;
          if (_onZombieDelete) { try { _onZombieDelete(row); } catch (e) { console.warn('[netcode] onZombieDelete cb', e); } }
        });

        // PowerUp deltas — same filter pattern.
        conn.db.powerUp.onInsert((_c, row) => {
          syncPowerUpFromRow(row);
          if (row.lobbyId !== getMyLobbyId()) return;
          if (_onPowerUpInsert) { try { _onPowerUpInsert(row); } catch (e) { console.warn('[netcode] onPowerUpInsert cb', e); } }
        });
        conn.db.powerUp.onUpdate((_c, _o, row) => syncPowerUpFromRow(row));
        conn.db.powerUp.onDelete((_c, row) => {
          _powerUps.delete(row.puId.toString());
          if (row.lobbyId !== getMyLobbyId()) return;
          if (_onPowerUpDelete) { try { _onPowerUpDelete(row); } catch (e) { console.warn('[netcode] onPowerUpDelete cb', e); } }
        });

        // Chat deltas. Filter by our current lobby. Weapon-marker msgs
        // are absorbed into _playerWeapons and skipped from chat UI.
        conn.db.chatMessage.onInsert((_c, row) => {
          const wm = _parseWeaponMsg(row);
          if (wm) { _playerWeapons.set(wm.hex, wm.weapon); return; }
          const msg = rowToChat(row);
          _chatMessages.push(msg);
          if (_chatMessages.length > 240) _chatMessages.splice(0, _chatMessages.length - 240);
          if (msg.lobbyId !== getMyLobbyId()) return;
          if (_onChatMessage) { try { _onChatMessage(msg); } catch (e) {} }
        });
        conn.db.chatMessage.onDelete((_c, row) => {
          const key = row.msgId;
          for (let i = _chatMessages.length - 1; i >= 0; i--) {
            if (_chatMessages[i].msgId === key) { _chatMessages.splice(i, 1); break; }
          }
        });

        // HighScore is global — no lobby filter.
        conn.db.highScore.onInsert((_c, row) => {
          _highScores.push(rowToHighScore(row));
          rebucketHighScores();
          if (_onHighScoresChange) { try { _onHighScoresChange(); } catch (e) {} }
        });
        conn.db.highScore.onDelete((_c, row) => {
          const key = row.scoreId;
          for (let i = _highScores.length - 1; i >= 0; i--) {
            if (_highScores[i].scoreId === key) { _highScores.splice(i, 1); break; }
          }
          if (_onHighScoresChange) { try { _onHighScoresChange(); } catch (e) {} }
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
        _players.clear();
        _lobbies.clear();
        _zombies.clear();
        _powerUps.clear();
        _chatMessages.length = 0;
        _highScores.length = 0;
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
  _players.clear();
  _lobbies.clear();
  _zombies.clear();
  _powerUps.clear();
  _chatMessages.length = 0;
  _highScores.length = 0;
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

  // 1. Local transform push (dead-reckoned)
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

  // 2. Host heartbeat / reclaim — only when we're in a lobby
  _hostHeartbeatTimer += dt;
  if (_hostHeartbeatTimer >= 1 / HOST_HEARTBEAT_HZ) {
    _hostHeartbeatTimer = 0;
    if (getMyLobbyId() && getMyLobbyId() !== 0n) {
      try {
        if (isHost()) _conn.reducers.hostHeartbeat();
        else _conn.reducers.claimHost();
      } catch (e) { console.warn('[netcode] host heartbeat/claim failed', e); }
    }
  }

  // 3. Zombie sync — host only, filtered to moved-only
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
          for (const key of _lastSyncedZombiePos.keys()) {
            if (!seen.has(key)) _lastSyncedZombiePos.delete(key);
          }
          if (filtered.length > 0) {
            _conn.reducers.syncZombiePositions({ updates: filtered });
          }
        } else if (_lastSyncedZombiePos.size > 0) {
          _lastSyncedZombiePos.clear();
        }
      } catch (e) { console.warn('[netcode] syncZombiePositions failed', e); }
    }
  }
}

// ── Reducer helpers ───────────────────────────────────────────────────────

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

export function callSubmitHighScore({ name, round, points, kills }) {
  if (!_conn) return;
  try { _conn.reducers.submitHighScore({ name, round, points, kills }); }
  catch (e) { console.warn('[netcode] submitHighScore failed', e); }
}

export function callSendChat(text) {
  if (!_conn) return;
  // Don't let users type the weapon-marker prefix
  if (_isWeaponMsg(text)) return;
  try { _conn.reducers.sendChat({ text }); }
  catch (e) { console.warn('[netcode] sendChat failed', e); }
}

// Broadcast our current weapon idx via a hidden chat marker so remote
// clients can render the correct gun model on our soldier.
// Rate-limited to 1 broadcast per 500ms — without this, quick-swap
// spam (mashing Q) writes a row per swap to the chat table, polluting
// the DB. We coalesce rapid changes and broadcast the final weapon
// after the throttle window.
const WEAPON_MARKER_MIN_INTERVAL_MS = 500;
let _lastSentWeapon = -1;
let _lastSentWeaponAt = 0;
let _pendingWeaponTimer = null;
export function broadcastLocalWeapon(idx) {
  if (!_conn || !isConnected()) return;
  if (idx === _lastSentWeapon) return;
  const now = performance.now();
  const sinceLast = now - _lastSentWeaponAt;
  const doSend = () => {
    if (idx === _lastSentWeapon) return; // may have changed again after debounce
    _lastSentWeapon = idx;
    _lastSentWeaponAt = performance.now();
    try { _conn.reducers.sendChat({ text: WEAPON_MSG_PREFIX + idx }); }
    catch (e) { console.warn('[netcode] broadcastLocalWeapon failed', e); }
  };
  // Clear any pending debounce — we always want to broadcast the LAST
  // weapon the player settled on, so replace in-flight timers.
  if (_pendingWeaponTimer) { clearTimeout(_pendingWeaponTimer); _pendingWeaponTimer = null; }
  if (sinceLast >= WEAPON_MARKER_MIN_INTERVAL_MS) {
    doSend();
  } else {
    const wait = WEAPON_MARKER_MIN_INTERVAL_MS - sinceLast;
    _pendingWeaponTimer = setTimeout(() => { _pendingWeaponTimer = null; doSend(); }, wait);
  }
}

export function callSetPlayerName(name) {
  if (!_conn) return;
  try { _conn.reducers.setPlayerName({ name }); }
  catch (e) { console.warn('[netcode] setPlayerName failed', e); }
}

// ── Lobby lifecycle reducers (M4) ────────────────────────────────────────

export function callCreateLobby(isPublic) {
  if (!_conn) return;
  try { _conn.reducers.createLobby({ isPublic: !!isPublic }); }
  catch (e) { console.warn('[netcode] createLobby failed', e); }
}

export function callJoinLobbyByCode(inviteCode) {
  if (!_conn) return;
  try { _conn.reducers.joinLobbyByCode({ inviteCode: String(inviteCode || '').toUpperCase() }); }
  catch (e) { console.warn('[netcode] joinLobbyByCode failed', e); }
}

export function callFillSquad() {
  if (!_conn) return;
  try { _conn.reducers.fillSquad(); }
  catch (e) { console.warn('[netcode] fillSquad failed', e); }
}

export function callLeaveLobby() {
  if (!_conn) return;
  try { _conn.reducers.leaveLobby(); }
  catch (e) { console.warn('[netcode] leaveLobby failed', e); }
}

export function callSetLobbyPublic(isPublic) {
  if (!_conn) return;
  try { _conn.reducers.setLobbyPublic({ isPublic: !!isPublic }); }
  catch (e) { console.warn('[netcode] setLobbyPublic failed', e); }
}

export function callStartGame() {
  if (!_conn) return;
  try { _conn.reducers.startGame(); }
  catch (e) { console.warn('[netcode] startGame failed', e); }
}

// ── Local player status queries ──────────────────────────────────────────

export function isLocalPlayerDowned() {
  const p = getLocalPlayer();
  return p ? !!p.downed : false;
}

export function isLocalPlayerSpectating() {
  const p = getLocalPlayer();
  return p ? !!p.spectating : false;
}
