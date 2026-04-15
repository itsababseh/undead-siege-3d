// Undead Siege — SpacetimeDB reducers and lifecycle hooks
// Milestone 1: one global lobby; clients insert a Player row on connect,
// update their transform at ~20 Hz, and the row is removed on disconnect.

import spacetimedb, { Player } from './schema';
import { t, SenderError } from 'spacetimedb/server';

export default spacetimedb;

// ── Lifecycle ──────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    // Reconnect (rare — should have been cleaned up on disconnect, but be safe)
    ctx.db.player.identity.update({
      ...existing,
      online: true,
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
    online: true,
    lastSeen: ctx.timestamp,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row) return;
  // For M1 we fully remove the row. Later milestones may prefer to keep it
  // around (to preserve score) and just flip `online` to false.
  ctx.db.player.identity.delete(ctx.sender);
});

// ── Reducers ───────────────────────────────────────────────────────────────

// Called ~20 Hz from the client while the local player moves.
export const update_player_transform = spacetimedb.reducer(
  { wx: t.f32(), wz: t.f32(), ry: t.f32() },
  (ctx, { wx, wz, ry }) => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) {
      throw new SenderError('No player row for caller — did onConnect run?');
    }
    ctx.db.player.identity.update({
      ...row,
      wx,
      wz,
      ry,
      lastSeen: ctx.timestamp,
    });
  }
);

// Optional: set a display name. Not wired in M1 client yet.
export const set_player_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmed = name.trim().slice(0, 24);
    if (trimmed.length === 0) throw new SenderError('Name cannot be empty');

    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) throw new SenderError('No player row for caller');

    ctx.db.player.identity.update({ ...row, name: trimmed });
  }
);
