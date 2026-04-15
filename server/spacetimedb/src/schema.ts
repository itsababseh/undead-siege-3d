// Undead Siege — SpacetimeDB schema
// Milestone 1: just players. Zombies, waves, etc. come in later milestones.

import { schema, table, t } from 'spacetimedb/server';

// One row per connected player. Identity is the primary key (1 row per client).
// wx / wz / ry are world x, world z, and Y-axis rotation (yaw) in radians.
// hp is included so later milestones can sync damage; for M1 the server just
// stores whatever the client reports.
export const Player = table(
  {
    name: 'player',
    public: true,
  },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    wx: t.f32(),
    wz: t.f32(),
    ry: t.f32(),
    hp: t.i32(),
    online: t.bool(),
    lastSeen: t.timestamp(),
  }
);

const spacetimedb = schema({ player: Player });
export default spacetimedb;
