// Undead Siege — SpacetimeDB schema
//
// Authority model: HOST AUTHORITY.
// One connected client is elected "host" (first to arrive, or takeover if
// the current host times out). The host runs the existing local zombie AI
// and pushes position/spawn/despawn updates to the Zombie table at ~15 Hz.
// All other clients subscribe and render from the table.
//
// HP and damage are SERVER-authoritative (stored on the Zombie row, mutated
// by the damage reducer) so that non-host players shooting feels responsive
// and the host can't fake kills.
//
// GameState is a single-row table with gameId = 1n. We use a singleton
// rather than per-room tables because M1/M2 are one global lobby.

import { schema, table, t } from 'spacetimedb/server';

// Player: one row per connected client.
//
// Lifecycle flags:
//   `alive`      — currently "in the game" in any form. False only when
//                  the session-reset trigger fires. Client flips this on
//                  initGame(true) / teardown(false).
//   `downed`     — incapacitated, waiting for a teammate revive. In MP,
//                  HP hitting 0 enters this state instead of the SP
//                  game-over. If every alive player is also downed, the
//                  server resets the session.
//   `spectating` — joined while a match was already in progress. Player
//                  sits in spectator mode watching a teammate until the
//                  next advance_round() flips them into the live game.
export const Player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    wx: t.f32(),
    wz: t.f32(),
    ry: t.f32(),
    hp: t.i32(),
    points: t.i32(),
    online: t.bool(),
    alive: t.bool(),
    downed: t.bool(),
    spectating: t.bool(),
    lastSeen: t.timestamp(),
  }
);

// GameState: singleton row (gameId = 1n). Tracks host election, the
// shared round counter, and the lobby/playing status.
//
// `status` values: "lobby" (menu, nobody is actively simulating) or
// "playing" (a match is running). start_game flips to playing,
// resetSession flips back to lobby.
export const GameState = table(
  { name: 'game_state', public: true },
  {
    gameId: t.u64().primaryKey(),
    hostIdentity: t.identity().optional(),
    round: t.i32(),
    status: t.string(),
    hostLastSeen: t.timestamp(),
  }
);

// Zombie: one row per live zombie. Created by host, positions updated by
// host, HP mutated by any client via the damage reducer. Deleted when HP
// hits zero or host calls remove_zombie.
//
// `hostZid` is a host-picked ID (so the host can correlate its local
// simulation to server rows without round-tripping an auto-inc). Unique
// per host; if the host changes, the new host picks fresh IDs.
export const Zombie = table(
  { name: 'zombie', public: true },
  {
    hostZid: t.u64().primaryKey(),
    zombieType: t.i32(),   // 0=normal, 1=elite, 2=boss
    wx: t.f32(),
    wz: t.f32(),
    ry: t.f32(),
    hp: t.i32(),
    maxHp: t.i32(),
    flashLevel: t.f32(),
    spawnedAt: t.timestamp(),
  }
);

// Door: shared door state. Initialized once at module init with a fixed
// set of door IDs that match the client's door table. Opens are
// broadcast via open_door reducer.
export const Door = table(
  { name: 'door', public: true },
  {
    doorId: t.i32().primaryKey(),
    opened: t.bool(),
  }
);

// PowerUp: shared powerup drops. Host spawns, any client can consume.
export const PowerUp = table(
  { name: 'power_up', public: true },
  {
    puId: t.u64().primaryKey(),
    typeIdx: t.i32(),
    wx: t.f32(),
    wz: t.f32(),
    spawnedAt: t.timestamp(),
  }
);

// HighScore: persistent leaderboard row. Inserted when a player dies
// (or whenever the client reports a run end). NOT wiped by resetSession
// — unlike zombies/powerups this is meant to survive forever.
export const HighScore = table(
  { name: 'high_score', public: true },
  {
    scoreId: t.u64().primaryKey().autoInc(),
    name: t.string(),
    round: t.i32(),
    points: t.i32(),
    kills: t.i32(),
    createdAt: t.timestamp(),
  }
);

// ChatMessage: transient in-game chat. The server prunes old messages
// so the table stays bounded. Clients subscribe to the whole table and
// render the most recent N in a HUD window.
export const ChatMessage = table(
  { name: 'chat_message', public: true },
  {
    msgId: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    senderName: t.string(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  player: Player,
  gameState: GameState,
  zombie: Zombie,
  door: Door,
  powerUp: PowerUp,
  highScore: HighScore,
  chatMessage: ChatMessage,
});
export default spacetimedb;
