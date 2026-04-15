// Undead Siege — SpacetimeDB schema (M4: multi-lobby rooms)
//
// Authority model: HOST AUTHORITY, now PER LOBBY.
// Multiple independent lobbies can exist at once. Each Lobby row has its
// own host, round, status, zombies, powerups, chat, and opened-doors set.
// The 5-player cap is enforced by the join_lobby / fill_squad reducers.
//
// Data ownership:
//   - HighScore and Player (identity + name + points) are GLOBAL
//   - Everything else (zombies/powerups/chat/opened doors) is per-lobby
//     via a `lobbyId` foreign key
//
// HP and damage are still server-authoritative (damage_zombie reducer)
// so non-host shooting feels responsive.

import { schema, table, t } from 'spacetimedb/server';

// Player: one row per connected client.
//
// Identity + name + points are global (you keep your name and high-score
// history across lobbies). `lobbyId` tells us which lobby the player is
// currently in — 0 means "on the multiplayer menu, not in any lobby".
//
// Lifecycle flags (scoped to the current lobby's match):
//   `alive`      — currently in the game in any form
//   `downed`     — incapacitated, waiting for a teammate revive
//   `spectating` — joined mid-match, watching a teammate until next
//                  advance_round flips them in
export const Player = table(
  {
    name: 'player',
    public: true,
    indexes: [
      { accessor: 'player_lobby_id', algorithm: 'btree', columns: ['lobbyId'] },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    lobbyId: t.u64(),
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

// Lobby: one row per active game room. Replaces the M3 `GameState`
// singleton. Holds everything that used to live on GameState PLUS:
//   - `inviteCode`: 6-char A-Z0-9 identifier for JOIN BY CODE flow
//   - `isPublic`:   whether FILL SQUAD matchmaking considers this lobby
//   - `openedDoors`: array of door indices opened so far (replaces the
//                    old Door table entirely)
//   - `playerCount`: cached count of players with this lobbyId, kept in
//                    sync by join/leave/onDisconnect
//   - `hostName`:    cached host name so the public browse list doesn't
//                    need an extra player lookup per row
//
// Lobbies are created dynamically by create_lobby / fill_squad and are
// deleted when the last player leaves them.
export const Lobby = table(
  {
    name: 'lobby',
    public: true,
    indexes: [
      { accessor: 'lobby_invite_code', algorithm: 'btree', columns: ['inviteCode'] },
      { accessor: 'lobby_is_public', algorithm: 'btree', columns: ['isPublic'] },
    ],
  },
  {
    lobbyId: t.u64().primaryKey().autoInc(),
    inviteCode: t.string(),
    hostIdentity: t.identity().optional(),
    hostName: t.string(),
    status: t.string(),             // 'lobby' | 'playing'
    round: t.i32(),
    isPublic: t.bool(),
    openedDoors: t.array(t.i32()),
    playerCount: t.i32(),
    createdAt: t.timestamp(),
    hostLastSeen: t.timestamp(),
  }
);

// Zombie: one row per live zombie in a specific lobby. Created by the
// host of that lobby, HP mutated server-side via damage_zombie.
export const Zombie = table(
  {
    name: 'zombie',
    public: true,
    indexes: [
      { accessor: 'zombie_lobby_id', algorithm: 'btree', columns: ['lobbyId'] },
    ],
  },
  {
    hostZid: t.u64().primaryKey(),
    lobbyId: t.u64(),
    zombieType: t.i32(),
    wx: t.f32(),
    wz: t.f32(),
    ry: t.f32(),
    hp: t.i32(),
    maxHp: t.i32(),
    flashLevel: t.f32(),
    spawnedAt: t.timestamp(),
  }
);

// PowerUp: shared powerup drops in a specific lobby.
export const PowerUp = table(
  {
    name: 'power_up',
    public: true,
    indexes: [
      { accessor: 'power_up_lobby_id', algorithm: 'btree', columns: ['lobbyId'] },
    ],
  },
  {
    puId: t.u64().primaryKey(),
    lobbyId: t.u64(),
    typeIdx: t.i32(),
    wx: t.f32(),
    wz: t.f32(),
    spawnedAt: t.timestamp(),
  }
);

// HighScore: persistent global leaderboard. Survives lobby deletion —
// not scoped to any specific match.
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

// ChatMessage: per-lobby chat. M3 chat was global; M4 scopes messages
// to lobbyId so two lobbies don't see each other's chatter.
export const ChatMessage = table(
  {
    name: 'chat_message',
    public: true,
    indexes: [
      { accessor: 'chat_message_lobby_id', algorithm: 'btree', columns: ['lobbyId'] },
    ],
  },
  {
    msgId: t.u64().primaryKey().autoInc(),
    lobbyId: t.u64(),
    sender: t.identity(),
    senderName: t.string(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  player: Player,
  lobby: Lobby,
  zombie: Zombie,
  powerUp: PowerUp,
  highScore: HighScore,
  chatMessage: ChatMessage,
});
export default spacetimedb;
