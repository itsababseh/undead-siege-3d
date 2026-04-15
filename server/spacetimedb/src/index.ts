// Undead Siege — SpacetimeDB reducers and lifecycle hooks (M2).
//
// See schema.ts for the authority model. In short: host runs AI locally,
// pushes zombie positions via sync_zombie_positions, HP is server-side.

import spacetimedb from './schema';
import { t, SenderError } from 'spacetimedb/server';

export default spacetimedb;

const GAME_ID = 1n;
const HOST_TIMEOUT_MICROS = 10_000_000n; // 10 seconds

// ── Init ───────────────────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  // Create the singleton game state
  ctx.db.gameState.insert({
    gameId: GAME_ID,
    hostIdentity: undefined,
    round: 1,
    hostLastSeen: ctx.timestamp,
  });

  // Pre-populate door rows. Door IDs match the client's src/core/state.js
  // door list; if you add/remove doors there, update this list too.
  // Using a simple numeric range rather than importing the client config
  // (which the module can't do). 16 is a safe upper bound for now.
  for (let i = 0; i < 16; i++) {
    ctx.db.door.insert({ doorId: i, opened: false });
  }
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    // Rejoin from a fresh tab: clear downed state so they aren't stuck
    // in a "waiting for revive" screen the moment they reconnect.
    ctx.db.player.identity.update({
      ...existing,
      online: true,
      alive: true,
      downed: false,
      lastSeen: ctx.timestamp,
    });
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    name: 'Survivor',
    wx: 0,
    wz: 0,
    ry: 0,
    hp: 100,
    points: 500,
    online: true,
    alive: true,
    downed: false,
    lastSeen: ctx.timestamp,
  });
});

// Wipe all ephemeral session state and reset round progression.
// Called when the last player disconnects OR all players are dead.
// Doors stay as-is — leaving them open is usually what you want when
// someone joins mid-session, and restoring map collision on client
// would need a "close door" path which we don't have yet.
function resetSession(ctx: any) {
  for (const z of ctx.db.zombie.iter()) {
    ctx.db.zombie.hostZid.delete(z.hostZid);
  }
  for (const p of ctx.db.powerUp.iter()) {
    ctx.db.powerUp.puId.delete(p.puId);
  }
  const gs = ctx.db.gameState.gameId.find(GAME_ID);
  if (gs) {
    ctx.db.gameState.gameId.update({
      ...gs,
      hostIdentity: undefined,
      round: 1,
    });
  }
}

// True if there's at least one player row in table (used after the
// current row has already been deleted).
function anyPlayersLeft(ctx: any): boolean {
  for (const _p of ctx.db.player.iter()) return true;
  return false;
}

// True if any player is still "up" — alive and not currently downed.
// Used to decide whether the session should reset. A fully-downed
// squad counts as wiped: nobody's left to revive them.
function anyUpPlayers(ctx: any): boolean {
  for (const p of ctx.db.player.iter()) if (p.alive && !p.downed) return true;
  return false;
}

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (row) ctx.db.player.identity.delete(ctx.sender);

  // If the host left, clear the host slot so another client can claim.
  const gs = ctx.db.gameState.gameId.find(GAME_ID);
  if (gs && gs.hostIdentity && gs.hostIdentity.toHexString() === ctx.sender.toHexString()) {
    ctx.db.gameState.gameId.update({ ...gs, hostIdentity: undefined });
    // Also wipe any zombies/powerups — they were the old host's responsibility.
    for (const z of ctx.db.zombie.iter()) {
      ctx.db.zombie.hostZid.delete(z.hostZid);
    }
    for (const p of ctx.db.powerUp.iter()) {
      ctx.db.powerUp.puId.delete(p.puId);
    }
  }

  // If that was the last connected player, tear the session down so
  // whoever arrives next gets a fresh run from round 1.
  if (!anyPlayersLeft(ctx)) {
    resetSession(ctx);
  }
});

// ── Host election ──────────────────────────────────────────────────────────

function isHost(ctx: any, gs: any): boolean {
  return !!gs.hostIdentity && gs.hostIdentity.toHexString() === ctx.sender.toHexString();
}

// Claim host if the slot is empty or the current host has timed out.
// Idempotent — if the caller is already host, it just refreshes lastSeen.
export const claim_host = spacetimedb.reducer((ctx) => {
  const gs = ctx.db.gameState.gameId.find(GAME_ID);
  if (!gs) throw new SenderError('game state missing');

  const ageMicros = ctx.timestamp.microsSinceUnixEpoch - gs.hostLastSeen.microsSinceUnixEpoch;
  const slotOpen = !gs.hostIdentity || ageMicros > HOST_TIMEOUT_MICROS;

  if (slotOpen || isHost(ctx, gs)) {
    ctx.db.gameState.gameId.update({
      ...gs,
      hostIdentity: ctx.sender,
      hostLastSeen: ctx.timestamp,
    });
  }
});

// Called by the host every ~2 seconds to keep its lease alive.
export const host_heartbeat = spacetimedb.reducer((ctx) => {
  const gs = ctx.db.gameState.gameId.find(GAME_ID);
  if (!gs || !isHost(ctx, gs)) return;
  ctx.db.gameState.gameId.update({ ...gs, hostLastSeen: ctx.timestamp });
});

// ── Player transform (unchanged from M1) ───────────────────────────────────

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

// Client reports its own alive state.
//   - alive=true:  starting a fresh game (from menu or after session reset)
//   - alive=false: teardown (leaving the game / back to menu)
// The "HP hit 0" case is handled by report_player_downed below — in MP
// we enter a revivable downed state instead of instantly dying.
export const report_player_alive = spacetimedb.reducer(
  { alive: t.bool() },
  (ctx, { alive }) => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) return;
    ctx.db.player.identity.update({
      ...row,
      alive,
      // Starting a fresh game clears any leftover downed state from
      // a previous run.
      downed: alive ? false : row.downed,
      hp: alive ? 100 : row.hp,
    });
    if (!alive && !anyUpPlayers(ctx)) {
      resetSession(ctx);
    }
  }
);

// Client reports its local HP hit 0 in MP — enter the revivable downed
// state. If this leaves nobody standing, reset the session.
export const report_player_downed = spacetimedb.reducer((ctx) => {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row) return;
  ctx.db.player.identity.update({ ...row, downed: true, hp: 0 });
  if (!anyUpPlayers(ctx)) {
    resetSession(ctx);
  }
});

// Any player revives another. Caller is the reviver, targetIdentity is
// the one being revived. Server sanity-checks physical proximity so a
// client can't remote-revive a teammate on the other side of the map.
// MAX_REVIVE_DIST is generous (5 world units ≈ a bit more than a tile
// of padding) to tolerate normal network-position drift.
const MAX_REVIVE_DIST = 5.0;
export const revive_player = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const reviver = ctx.db.player.identity.find(ctx.sender);
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!reviver || !target) return;
    if (!target.downed) return;
    if (reviver.downed || !reviver.alive) return;
    const dx = reviver.wx - target.wx;
    const dz = reviver.wz - target.wz;
    if (dx * dx + dz * dz > MAX_REVIVE_DIST * MAX_REVIVE_DIST) {
      throw new SenderError('too far from target to revive');
    }
    ctx.db.player.identity.update({
      ...target,
      downed: false,
      hp: 50, // partial HP on revive (matches CoD Zombies)
    });
  }
);

// ── Zombies (host-authoritative positions, server-authoritative HP) ───────

// Host creates a new zombie row. hostZid must be unique (host picks).
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
    const gs = ctx.db.gameState.gameId.find(GAME_ID);
    if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may spawn');

    const existing = ctx.db.zombie.hostZid.find(args.hostZid);
    if (existing) return; // idempotent

    ctx.db.zombie.insert({
      hostZid: args.hostZid,
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

// Bulk position update. Host pushes the current positions of all its live
// zombies every tick. We only update rows that still exist (deleted-by-damage
// zombies are skipped so the host doesn't revive them).
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
    const gs = ctx.db.gameState.gameId.find(GAME_ID);
    if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may sync');

    for (const u of updates) {
      const existing = ctx.db.zombie.hostZid.find(u.hostZid);
      if (!existing) continue;
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

// Any client can damage any zombie. Server reduces HP and deletes the row
// when HP <= 0, awarding points to the shooter.
export const damage_zombie = spacetimedb.reducer(
  { hostZid: t.u64(), damage: t.i32() },
  (ctx, { hostZid, damage }) => {
    const z = ctx.db.zombie.hostZid.find(hostZid);
    if (!z) return; // already dead / despawned
    const newHp = z.hp - damage;
    if (newHp <= 0) {
      ctx.db.zombie.hostZid.delete(hostZid);
      // Award 100 points per kill (matches single-player rough default)
      const shooter = ctx.db.player.identity.find(ctx.sender);
      if (shooter) {
        ctx.db.player.identity.update({ ...shooter, points: shooter.points + 100 });
      }
    } else {
      ctx.db.zombie.hostZid.update({ ...z, hp: newHp, flashLevel: 1.0 });
    }
  }
);

// Host despawns a zombie without damage (e.g. stuck timeout). No points.
export const remove_zombie = spacetimedb.reducer(
  { hostZid: t.u64() },
  (ctx, { hostZid }) => {
    const gs = ctx.db.gameState.gameId.find(GAME_ID);
    if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may remove');
    ctx.db.zombie.hostZid.delete(hostZid);
  }
);

// ── Round progression ──────────────────────────────────────────────────────

export const advance_round = spacetimedb.reducer((ctx) => {
  const gs = ctx.db.gameState.gameId.find(GAME_ID);
  if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may advance round');
  ctx.db.gameState.gameId.update({ ...gs, round: gs.round + 1 });
});

export const set_round = spacetimedb.reducer(
  { round: t.i32() },
  (ctx, { round }) => {
    const gs = ctx.db.gameState.gameId.find(GAME_ID);
    if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may set round');
    ctx.db.gameState.gameId.update({ ...gs, round });
  }
);

// ── Doors (any client may open) ────────────────────────────────────────────

export const open_door = spacetimedb.reducer(
  { doorId: t.i32() },
  (ctx, { doorId }) => {
    const d = ctx.db.door.doorId.find(doorId);
    if (!d) {
      // Auto-create if the client knows about a door the module didn't
      // pre-populate. Rare, but avoids a sync headache when the door list
      // grows.
      ctx.db.door.insert({ doorId, opened: true });
      return;
    }
    if (!d.opened) {
      ctx.db.door.doorId.update({ ...d, opened: true });
    }
  }
);

// ── PowerUps (host spawns, any client consumes) ───────────────────────────

export const spawn_powerup = spacetimedb.reducer(
  { puId: t.u64(), typeIdx: t.i32(), wx: t.f32(), wz: t.f32() },
  (ctx, args) => {
    const gs = ctx.db.gameState.gameId.find(GAME_ID);
    if (!gs || !isHost(ctx, gs)) throw new SenderError('only host may spawn powerup');
    ctx.db.powerUp.insert({
      puId: args.puId,
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
    ctx.db.powerUp.puId.delete(puId);
  }
);
