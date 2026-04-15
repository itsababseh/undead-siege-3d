// Undead Siege — SpacetimeDB reducers and lifecycle hooks (M4 multi-lobby)
//
// See schema.ts for the authority model. Every gameplay reducer is now
// scoped to the caller's current lobby (via player.lobbyId). Multiple
// lobbies can run in parallel without seeing each other.

import spacetimedb from './schema';
import { t, SenderError } from 'spacetimedb/server';

export default spacetimedb;

const HOST_TIMEOUT_MICROS = 10_000_000n; // 10 seconds
const MAX_PLAYERS_PER_LOBBY = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function identitiesEqual(a: any, b: any): boolean {
  return !!a && !!b && a.toHexString() === b.toHexString();
}

function findLobby(ctx: any, lobbyId: bigint) {
  if (!lobbyId || lobbyId === 0n) return undefined;
  return ctx.db.lobby.lobbyId.find(lobbyId);
}

function isLobbyHost(ctx: any, lobby: any): boolean {
  return !!lobby && !!lobby.hostIdentity && identitiesEqual(lobby.hostIdentity, ctx.sender);
}

// Count players currently in a given lobby. Used when host leaves and
// we need to pick a successor.
function playersInLobby(ctx: any, lobbyId: bigint): any[] {
  const out: any[] = [];
  for (const p of ctx.db.player.player_lobby_id.filter(lobbyId)) out.push(p);
  return out;
}

// True if any player in this lobby is still "up" — alive and not
// currently downed. Used to decide whether the lobby match should
// reset back to the waiting-room state.
function anyUpPlayersInLobby(ctx: any, lobbyId: bigint): boolean {
  for (const p of ctx.db.player.player_lobby_id.filter(lobbyId)) {
    if (p.alive && !p.downed) return true;
  }
  return false;
}

// Generate a 6-char A-Z0-9 invite code. Must be DETERMINISTIC —
// SpacetimeDB reducers can't call Math.random() or Date.now() (both
// abort the module with a fatal error). We derive the code from the
// transaction timestamp + the caller's identity + an attempt counter
// so retries produce different candidates if there's a rare collision
// with an existing lobby.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no O/0/I/1
function generateInviteCode(ctx: any): string {
  // Fold the caller's identity into a 32-bit hash so two players
  // creating a lobby at the same microsecond produce different codes.
  const idHex = ctx.sender.toHexString ? ctx.sender.toHexString() : String(ctx.sender);
  let idHash = 0;
  for (let i = 0; i < idHex.length; i++) {
    idHash = ((idHash * 31) + idHex.charCodeAt(i)) | 0;
  }
  idHash = idHash >>> 0; // force unsigned

  const microsLow = Number(ctx.timestamp.microsSinceUnixEpoch & 0xFFFFFFFFn);

  for (let attempt = 0; attempt < 16; attempt++) {
    let n = (microsLow ^ idHash ^ (attempt * 2654435761)) >>> 0;
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[n % CODE_ALPHABET.length];
      n = Math.floor(n / CODE_ALPHABET.length);
    }
    const existing = [...ctx.db.lobby.lobby_invite_code.filter(code)];
    if (existing.length === 0) return code;
  }
  // Really unlucky — fall back to a constant. Will still function
  // (join_by_code picks the first match), just less readable.
  return 'AAAAAA';
}

// Wipe all ephemeral state for one lobby and return it to 'lobby' status.
// Called when every player in the lobby is downed or disconnects.
function resetLobbyMatch(ctx: any, lobbyId: bigint) {
  for (const z of ctx.db.zombie.zombie_lobby_id.filter(lobbyId)) {
    ctx.db.zombie.hostZid.delete(z.hostZid);
  }
  for (const pu of ctx.db.powerUp.power_up_lobby_id.filter(lobbyId)) {
    ctx.db.powerUp.puId.delete(pu.puId);
  }
  const lobby = findLobby(ctx, lobbyId);
  if (lobby) {
    ctx.db.lobby.lobbyId.update({
      ...lobby,
      status: 'lobby',
      round: 1,
      openedDoors: [],
    });
  }
  // Clear spectator/downed flags for everyone in this lobby so the next
  // match starts fresh.
  for (const p of ctx.db.player.player_lobby_id.filter(lobbyId)) {
    if (p.spectating || p.downed || !p.alive) {
      ctx.db.player.identity.update({ ...p, spectating: false, downed: false, alive: true });
    }
  }
}

// Delete a lobby and all its ephemeral state. Called when the last
// player leaves.
function deleteLobby(ctx: any, lobbyId: bigint) {
  for (const z of ctx.db.zombie.zombie_lobby_id.filter(lobbyId)) {
    ctx.db.zombie.hostZid.delete(z.hostZid);
  }
  for (const pu of ctx.db.powerUp.power_up_lobby_id.filter(lobbyId)) {
    ctx.db.powerUp.puId.delete(pu.puId);
  }
  for (const m of ctx.db.chatMessage.chat_message_lobby_id.filter(lobbyId)) {
    ctx.db.chatMessage.msgId.delete(m.msgId);
  }
  ctx.db.lobby.lobbyId.delete(lobbyId);
}

// Remove a player from their current lobby, handling host transfer and
// empty-lobby cleanup. Extracted so onDisconnect and leave_lobby share
// the same logic.
function leaveLobbyInternal(ctx: any, identity: any) {
  const player = ctx.db.player.identity.find(identity);
  if (!player || !player.lobbyId || player.lobbyId === 0n) return;

  const oldLobbyId = player.lobbyId;
  const lobby = findLobby(ctx, oldLobbyId);

  // Clear the player's lobbyId first so the next queries exclude them
  ctx.db.player.identity.update({
    ...player,
    lobbyId: 0n,
    spectating: false,
    downed: false,
    alive: true,
  });

  if (!lobby) return;

  const remaining = playersInLobby(ctx, oldLobbyId);
  if (remaining.length === 0) {
    // Nobody left — delete the lobby entirely
    deleteLobby(ctx, oldLobbyId);
    return;
  }

  // Update the cached count
  ctx.db.lobby.lobbyId.update({ ...lobby, playerCount: remaining.length });

  // If the leaver was host, transfer to the first remaining player.
  // (claim_host's heartbeat would eventually do this anyway, but doing it
  // eagerly avoids a 2-second gap where the lobby has no host.)
  if (identitiesEqual(lobby.hostIdentity, identity)) {
    const successor = remaining[0];
    ctx.db.lobby.lobbyId.update({
      ...lobby,
      hostIdentity: successor.identity,
      hostName: successor.name,
      hostLastSeen: ctx.timestamp,
      playerCount: remaining.length,
    });
  }

  // If that leave dropped the match to nobody-is-up, reset the lobby.
  if (lobby.status === 'playing' && !anyUpPlayersInLobby(ctx, oldLobbyId)) {
    resetLobbyMatch(ctx, oldLobbyId);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
// No singleton to pre-create. Lobbies are born dynamically via create_lobby
// and fill_squad.
export const init = spacetimedb.init((_ctx) => {
  // nothing to seed
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    // Reconnect: drop them back to the MP menu (lobbyId=0) with a
    // clean slate. If they had a lobby before, that lobby has either
    // been cleaned up via the previous onDisconnect or host-migrated.
    ctx.db.player.identity.update({
      ...existing,
      online: true,
      alive: true,
      downed: false,
      spectating: false,
      lobbyId: 0n,
      lastSeen: ctx.timestamp,
    });
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    name: 'Survivor',
    lobbyId: 0n,
    wx: 0,
    wz: 0,
    ry: 0,
    hp: 100,
    points: 500,
    online: true,
    alive: true,
    downed: false,
    spectating: false,
    lastSeen: ctx.timestamp,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  leaveLobbyInternal(ctx, ctx.sender);
  const row = ctx.db.player.identity.find(ctx.sender);
  if (row) ctx.db.player.identity.delete(ctx.sender);
});

// ── Player transform + name ────────────────────────────────────────────────

export const update_player_transform = spacetimedb.reducer(
  { wx: t.f32(), wz: t.f32(), ry: t.f32() },
  (ctx, { wx, wz, ry }) => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) throw new SenderError('no player row');
    ctx.db.player.identity.update({ ...row, wx, wz, ry, lastSeen: ctx.timestamp });
  }
);

export const set_player_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) throw new SenderError('empty name');
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) throw new SenderError('no player row');
    ctx.db.player.identity.update({ ...row, name: trimmed });
  }
);

// ── Lobby lifecycle: create / join / fill squad / leave / public toggle ───

export const create_lobby = spacetimedb.reducer(
  { isPublic: t.bool() },
  (ctx, { isPublic }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) throw new SenderError('no player row');
    if (player.lobbyId && player.lobbyId !== 0n) {
      throw new SenderError('already in a lobby');
    }

    const code = generateInviteCode(ctx);
    const inserted = ctx.db.lobby.insert({
      lobbyId: 0n, // auto-inc
      inviteCode: code,
      hostIdentity: ctx.sender,
      hostName: player.name,
      status: 'lobby',
      round: 1,
      isPublic,
      openedDoors: [],
      playerCount: 1,
      createdAt: ctx.timestamp,
      hostLastSeen: ctx.timestamp,
    });

    ctx.db.player.identity.update({ ...player, lobbyId: inserted.lobbyId });
  }
);

export const join_lobby_by_code = spacetimedb.reducer(
  { inviteCode: t.string() },
  (ctx, { inviteCode }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) throw new SenderError('no player row');
    if (player.lobbyId && player.lobbyId !== 0n) {
      throw new SenderError('already in a lobby');
    }

    const code = inviteCode.trim().toUpperCase();
    const matches = [...ctx.db.lobby.lobby_invite_code.filter(code)];
    if (matches.length === 0) {
      throw new SenderError('lobby not found');
    }
    const lobby = matches[0];
    if (lobby.playerCount >= MAX_PLAYERS_PER_LOBBY) {
      throw new SenderError('lobby is full');
    }

    // Mid-match joins land as spectators; advance_round flips them in.
    const spectating = lobby.status === 'playing';
    ctx.db.player.identity.update({
      ...player,
      lobbyId: lobby.lobbyId,
      spectating,
      downed: false,
      alive: true,
    });
    ctx.db.lobby.lobbyId.update({
      ...lobby,
      playerCount: lobby.playerCount + 1,
    });
  }
);

// Fill Squad — the "find me a game" button for solo players. Looks for
// any PUBLIC lobby in 'lobby' status below the cap; picks the fullest
// one so we don't fragment into a bunch of 1-player lobbies. If none
// exist, creates a new public lobby and the caller becomes host.
export const fill_squad = spacetimedb.reducer((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('no player row');
  if (player.lobbyId && player.lobbyId !== 0n) {
    throw new SenderError('already in a lobby');
  }

  let best: any = null;
  for (const lobby of ctx.db.lobby.lobby_is_public.filter(true)) {
    if (lobby.status !== 'lobby') continue;
    if (lobby.playerCount >= MAX_PLAYERS_PER_LOBBY) continue;
    if (!best || lobby.playerCount > best.playerCount) best = lobby;
  }

  if (best) {
    ctx.db.player.identity.update({
      ...player,
      lobbyId: best.lobbyId,
      spectating: false,
      downed: false,
      alive: true,
    });
    ctx.db.lobby.lobbyId.update({
      ...best,
      playerCount: best.playerCount + 1,
    });
    return;
  }

  // No suitable lobby — create a new public one
  const code = generateInviteCode(ctx);
  const inserted = ctx.db.lobby.insert({
    lobbyId: 0n,
    inviteCode: code,
    hostIdentity: ctx.sender,
    hostName: player.name,
    status: 'lobby',
    round: 1,
    isPublic: true,
    openedDoors: [],
    playerCount: 1,
    createdAt: ctx.timestamp,
    hostLastSeen: ctx.timestamp,
  });
  ctx.db.player.identity.update({ ...player, lobbyId: inserted.lobbyId });
});

export const leave_lobby = spacetimedb.reducer((ctx) => {
  leaveLobbyInternal(ctx, ctx.sender);
});

export const set_lobby_public = spacetimedb.reducer(
  { isPublic: t.bool() },
  (ctx, { isPublic }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby) throw new SenderError('lobby not found');
    if (!isLobbyHost(ctx, lobby)) throw new SenderError('only host may change visibility');
    ctx.db.lobby.lobbyId.update({ ...lobby, isPublic });
  }
);

// ── Host election + heartbeat (per lobby) ─────────────────────────────────

export const claim_host = spacetimedb.reducer((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || !player.lobbyId) return;
  const lobby = findLobby(ctx, player.lobbyId);
  if (!lobby) return;
  const ageMicros =
    ctx.timestamp.microsSinceUnixEpoch - lobby.hostLastSeen.microsSinceUnixEpoch;
  const slotOpen = !lobby.hostIdentity || ageMicros > HOST_TIMEOUT_MICROS;
  if (slotOpen || isLobbyHost(ctx, lobby)) {
    ctx.db.lobby.lobbyId.update({
      ...lobby,
      hostIdentity: ctx.sender,
      hostName: player.name,
      hostLastSeen: ctx.timestamp,
    });
  }
});

export const host_heartbeat = spacetimedb.reducer((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || !player.lobbyId) return;
  const lobby = findLobby(ctx, player.lobbyId);
  if (!lobby || !isLobbyHost(ctx, lobby)) return;
  ctx.db.lobby.lobbyId.update({ ...lobby, hostLastSeen: ctx.timestamp });
});

// ── Match lifecycle (per lobby) ───────────────────────────────────────────

export const start_game = spacetimedb.reducer((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
  const lobby = findLobby(ctx, player.lobbyId);
  if (!lobby) throw new SenderError('lobby not found');
  if (!isLobbyHost(ctx, lobby)) throw new SenderError('only host may start');
  if (lobby.status === 'playing') return;

  ctx.db.lobby.lobbyId.update({
    ...lobby,
    status: 'playing',
    round: 1,
    openedDoors: [],
  });
  for (const p of ctx.db.player.player_lobby_id.filter(lobby.lobbyId)) {
    ctx.db.player.identity.update({
      ...p,
      spectating: false,
      alive: true,
      downed: false,
    });
  }
});

export const advance_round = spacetimedb.reducer((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
  const lobby = findLobby(ctx, player.lobbyId);
  if (!lobby || !isLobbyHost(ctx, lobby)) {
    throw new SenderError('only host may advance round');
  }
  ctx.db.lobby.lobbyId.update({ ...lobby, round: lobby.round + 1 });
  // Mid-round spectators drop into the new round
  for (const p of ctx.db.player.player_lobby_id.filter(lobby.lobbyId)) {
    if (p.spectating) {
      ctx.db.player.identity.update({ ...p, spectating: false });
    }
  }
});

export const set_round = spacetimedb.reducer(
  { round: t.i32() },
  (ctx, { round }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby || !isLobbyHost(ctx, lobby)) {
      throw new SenderError('only host may set round');
    }
    ctx.db.lobby.lobbyId.update({ ...lobby, round });
  }
);

// ── Alive / downed / revive (session-reset scoped to lobby) ───────────────

export const report_player_alive = spacetimedb.reducer(
  { alive: t.bool() },
  (ctx, { alive }) => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) return;
    ctx.db.player.identity.update({
      ...row,
      alive,
      downed: alive ? false : row.downed,
      hp: alive ? 100 : row.hp,
    });
    if (!alive && row.lobbyId && !anyUpPlayersInLobby(ctx, row.lobbyId)) {
      resetLobbyMatch(ctx, row.lobbyId);
    }
  }
);

export const report_player_downed = spacetimedb.reducer((ctx) => {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row) return;
  ctx.db.player.identity.update({ ...row, downed: true, hp: 0 });
  if (row.lobbyId && !anyUpPlayersInLobby(ctx, row.lobbyId)) {
    resetLobbyMatch(ctx, row.lobbyId);
  }
});

const MAX_REVIVE_DIST = 5.0;
export const revive_player = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const reviver = ctx.db.player.identity.find(ctx.sender);
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!reviver || !target) return;
    if (!target.downed) return;
    if (reviver.downed || !reviver.alive) return;
    // Both must be in the same lobby
    if (reviver.lobbyId !== target.lobbyId || reviver.lobbyId === 0n) return;
    const dx = reviver.wx - target.wx;
    const dz = reviver.wz - target.wz;
    if (dx * dx + dz * dz > MAX_REVIVE_DIST * MAX_REVIVE_DIST) {
      throw new SenderError('too far from target to revive');
    }
    ctx.db.player.identity.update({ ...target, downed: false, hp: 50 });
  }
);

// ── Leaderboard (global, unchanged) ───────────────────────────────────────

const MAX_LEADERBOARD_ROWS = 100;
export const submit_high_score = spacetimedb.reducer(
  { name: t.string(), round: t.i32(), points: t.i32(), kills: t.i32() },
  (ctx, { name, round, points, kills }) => {
    if (round <= 0) return;
    const trimmed = name.trim().slice(0, 24) || 'Anonymous';
    ctx.db.highScore.insert({
      scoreId: 0n,
      name: trimmed,
      round,
      points,
      kills,
      createdAt: ctx.timestamp,
    });

    const all = [...ctx.db.highScore.iter()];
    if (all.length <= MAX_LEADERBOARD_ROWS) return;
    all.sort((a, b) => {
      if (a.round !== b.round) return b.round - a.round;
      if (a.points !== b.points) return b.points - a.points;
      return Number(a.scoreId - b.scoreId);
    });
    for (let i = MAX_LEADERBOARD_ROWS; i < all.length; i++) {
      ctx.db.highScore.scoreId.delete(all[i].scoreId);
    }
  }
);

// ── Chat (per lobby) ──────────────────────────────────────────────────────

const MAX_CHAT_LEN = 200;
const MAX_CHAT_ROWS_PER_LOBBY = 100;
export const send_chat = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    const trimmed = text.trim().slice(0, MAX_CHAT_LEN);
    if (!trimmed) return;
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) return; // not in a lobby, drop message
    const senderName = player.name || 'Unknown';
    ctx.db.chatMessage.insert({
      msgId: 0n,
      lobbyId: player.lobbyId,
      sender: ctx.sender,
      senderName,
      text: trimmed,
      createdAt: ctx.timestamp,
    });

    // Prune old messages in THIS lobby only
    const all = [...ctx.db.chatMessage.chat_message_lobby_id.filter(player.lobbyId)];
    if (all.length <= MAX_CHAT_ROWS_PER_LOBBY) return;
    all.sort((a, b) => Number(a.msgId - b.msgId));
    const toDrop = all.length - MAX_CHAT_ROWS_PER_LOBBY;
    for (let i = 0; i < toDrop; i++) {
      ctx.db.chatMessage.msgId.delete(all[i].msgId);
    }
  }
);

// ── Zombies (host-authoritative, per lobby) ───────────────────────────────

export const spawn_zombie = spacetimedb.reducer(
  {
    hostZid: t.u64(),
    zombieType: t.i32(),
    wx: t.f32(),
    wz: t.f32(),
    ry: t.f32(),
    hp: t.i32(),
    maxHp: t.i32(),
  },
  (ctx, args) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby || !isLobbyHost(ctx, lobby)) {
      throw new SenderError('only host may spawn');
    }

    const existing = ctx.db.zombie.hostZid.find(args.hostZid);
    if (existing) return;

    ctx.db.zombie.insert({
      hostZid: args.hostZid,
      lobbyId: player.lobbyId,
      zombieType: args.zombieType,
      wx: args.wx,
      wz: args.wz,
      ry: args.ry,
      hp: args.hp,
      maxHp: args.maxHp,
      flashLevel: 0,
      spawnedAt: ctx.timestamp,
    });
  }
);

const ZombiePosUpdate = t.object('ZombiePosUpdate', {
  hostZid: t.u64(),
  wx: t.f32(),
  wz: t.f32(),
  ry: t.f32(),
  flashLevel: t.f32(),
});

export const sync_zombie_positions = spacetimedb.reducer(
  { updates: t.array(ZombiePosUpdate) },
  (ctx, { updates }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby || !isLobbyHost(ctx, lobby)) {
      throw new SenderError('only host may sync');
    }

    for (const u of updates) {
      const existing = ctx.db.zombie.hostZid.find(u.hostZid);
      if (!existing) continue;
      // Only update zombies that belong to the caller's lobby
      if (existing.lobbyId !== player.lobbyId) continue;
      ctx.db.zombie.hostZid.update({
        ...existing,
        wx: u.wx,
        wz: u.wz,
        ry: u.ry,
        flashLevel: u.flashLevel,
      });
    }
  }
);

export const damage_zombie = spacetimedb.reducer(
  { hostZid: t.u64(), damage: t.i32() },
  (ctx, { hostZid, damage }) => {
    const z = ctx.db.zombie.hostZid.find(hostZid);
    if (!z) return;
    const shooter = ctx.db.player.identity.find(ctx.sender);
    // Only allow damage from players in the same lobby as the zombie
    if (!shooter || shooter.lobbyId !== z.lobbyId) return;
    const newHp = z.hp - damage;
    if (newHp <= 0) {
      ctx.db.zombie.hostZid.delete(hostZid);
      ctx.db.player.identity.update({ ...shooter, points: shooter.points + 100 });
    } else {
      ctx.db.zombie.hostZid.update({ ...z, hp: newHp, flashLevel: 1.0 });
    }
  }
);

export const remove_zombie = spacetimedb.reducer(
  { hostZid: t.u64() },
  (ctx, { hostZid }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby || !isLobbyHost(ctx, lobby)) {
      throw new SenderError('only host may remove');
    }
    const z = ctx.db.zombie.hostZid.find(hostZid);
    if (!z) return;
    if (z.lobbyId !== player.lobbyId) return;
    ctx.db.zombie.hostZid.delete(hostZid);
  }
);

// ── Doors (per lobby, stored as an array on the Lobby row) ────────────────

export const open_door = spacetimedb.reducer(
  { doorId: t.i32() },
  (ctx, { doorId }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) return;
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby) return;
    if (lobby.openedDoors.includes(doorId)) return; // already open
    ctx.db.lobby.lobbyId.update({
      ...lobby,
      openedDoors: [...lobby.openedDoors, doorId],
    });
  }
);

// ── PowerUps (host spawns, any client in the same lobby consumes) ────────

export const spawn_powerup = spacetimedb.reducer(
  { puId: t.u64(), typeIdx: t.i32(), wx: t.f32(), wz: t.f32() },
  (ctx, args) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !player.lobbyId) throw new SenderError('not in a lobby');
    const lobby = findLobby(ctx, player.lobbyId);
    if (!lobby || !isLobbyHost(ctx, lobby)) {
      throw new SenderError('only host may spawn powerup');
    }
    ctx.db.powerUp.insert({
      puId: args.puId,
      lobbyId: player.lobbyId,
      typeIdx: args.typeIdx,
      wx: args.wx,
      wz: args.wz,
      spawnedAt: ctx.timestamp,
    });
  }
);

export const consume_powerup = spacetimedb.reducer(
  { puId: t.u64() },
  (ctx, { puId }) => {
    const p = ctx.db.powerUp.puId.find(puId);
    if (!p) return;
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || player.lobbyId !== p.lobbyId) return;
    ctx.db.powerUp.puId.delete(puId);
  }
);
