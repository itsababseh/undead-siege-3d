// Host-authority sync glue between main.js and the netcode layer.
//
// Everything the game needs to:
//  - pick host-unique zombie IDs
//  - mirror the server Zombie table into main.js's local zombies[] array
//  - react to server door/gameState updates
//  - push the host's local zombie positions each tick
//
// Extracted from main.js to keep that file focused on game logic. main.js
// wires this up once on startup via createHostSync(ctx).register(), where
// ctx exposes the handful of main.js-owned variables and helpers the
// sync needs. Numeric game state (round, points, totalKills, state) is
// passed through get/set accessors because JS modules can't share
// primitive references across module boundaries.

import * as netcode from './connection.js';

// Random u64 for host-picked zombie IDs. BigInt because the server expects
// u64. Math.random() * 2^32 per half is ample entropy for a single host's
// lifetime — collisions would require spawning billions of zombies.
export function makeHostZid() {
  const hi = BigInt(Math.floor(Math.random() * 0x100000000));
  const lo = BigInt(Math.floor(Math.random() * 0x100000000));
  return (hi << 32n) | lo;
}

// Build a local zombie object from a server Zombie row. Used on non-host
// clients to mirror the server state into the game's own zombies[] array
// so the existing mesh/render/attack code keeps working unchanged.
function makeLocalZombieFromRow(row, PI2) {
  const isBoss = row.zombieType === 2;
  const isElite = row.zombieType === 1;
  return {
    hostZid: row.hostZid,
    // Start render position at the spawn location so the first frame
    // doesn't have a jump. The interpolator in main.js tracks _targetWx
    // toward wx.
    wx: row.wx, wz: row.wz,
    _targetWx: row.wx, _targetWz: row.wz,
    hp: row.hp, maxHp: row.maxHp,
    spd: 0, dmg: 10,
    atkTimer: 1, flash: row.flashLevel || 0,
    radius: isBoss ? 1.5 : 0.8,
    isBoss, isElite,
    _animOffset: Math.random() * PI2,
    _hasLimp: false,
    _limpPhase: 0,
    _limpSeverity: 0,
    _baseSpd: 0,
    stuckCheck: null,
    _remote: true, // marks this as server-driven — main.js interpolates
  };
}

/**
 * Create a host-sync object wired against main.js state.
 *
 * ctx shape:
 *   zombies:              live array (mutated in place)
 *   doors:                live array (mutated in place)
 *   player:               live player object
 *   PI2:                  math constant
 *   getRound / setRound
 *   getState / setState
 *   getRoundIntroTimer / setRoundIntroTimer
 *   getTotalKills / setTotalKills
 *   getPoints / setPoints
 *   createZombieMesh, removeZombieMesh,
 *   startZombieDeathAnim, spawnBloodSplatter,
 *   sfxKill, sfxBossKill, sfxRound,
 *   showHitmarker, showCenterMsg, addFloatText, triggerScreenShake,
 *   openDoorLocal
 */
export function createHostSync(ctx) {
  const {
    zombies, doors, player, PI2,
    getRound, setRound,
    setState,
    setRoundIntroTimer,
    getTotalKills, setTotalKills,
    getPoints, setPoints,
    createZombieMesh, removeZombieMesh,
    startZombieDeathAnim, spawnBloodSplatter,
    sfxKill, sfxBossKill, sfxRound,
    showHitmarker, showCenterMsg, addFloatText, triggerScreenShake,
    openDoorLocal,
  } = ctx;

  // Award points + death VFX when the server deletes a zombie row.
  function killLocalZombieByHostZid(hostZid) {
    const idx = zombies.findIndex(z => z.hostZid === hostZid);
    if (idx < 0) return;
    const z = zombies[idx];
    setTotalKills(getTotalKills() + 1);
    const basePts = z.isBoss ? 500 : z.isElite ? 120 : 60;
    const pts = player._doublePoints ? basePts * 2 : basePts;
    setPoints(getPoints() + pts);
    sfxKill();
    showHitmarker(true);
    const c = z.isBoss ? '#f44' : z.isElite ? '#ff8' : '#fc0';
    addFloatText(z.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, z.isBoss ? 2.5 : 1);
    startZombieDeathAnim(z);
    spawnBloodSplatter(z.wx, 1.2, z.wz);
    triggerScreenShake(z.isBoss ? 1.5 : z.isElite ? 0.5 : 0.15, 8);
    removeZombieMesh(z);
    zombies.splice(idx, 1);
    if (z.isBoss) {
      sfxBossKill();
      triggerScreenShake(2.5, 5);
    }
  }

  // Register all subscription callbacks. Safe to call once per session.
  function register() {
    netcode.setOnZombieInsert((row) => {
      if (zombies.some(z => z.hostZid === row.hostZid)) return;
      const z = makeLocalZombieFromRow(row, PI2);
      zombies.push(z);
      createZombieMesh(z);
    });

    netcode.setOnZombieUpdate((row) => {
      const z = zombies.find(zz => zz.hostZid === row.hostZid);
      if (!z) {
        const nz = makeLocalZombieFromRow(row, PI2);
        zombies.push(nz);
        createZombieMesh(nz);
        return;
      }
      // Position handling depends on who owns this zombie:
      //
      //   - _remote === true  → server-driven (non-host case). Store the
      //                         new server position as _targetWx/_targetWz
      //                         and let the main loop lerp z.wx/z.wz
      //                         toward it smoothly.
      //
      //   - _remote === false → host's own locally-simulated zombie.
      //                         DO NOT snap z.wx/z.wz to the echoed row.
      //                         The row we just received is our own sync
      //                         coming back after a network round trip,
      //                         so it's stale relative to our live AI
      //                         state. Writing it here would fight the
      //                         AI every frame and cause visible jitter
      //                         on the host's screen. Host is authoritative
      //                         for its own zombies — the server table is
      //                         write-through only.
      if (z._remote) {
        z._targetWx = row.wx;
        z._targetWz = row.wz;
      }
      // HP/flash still come from the server for both cases — non-hosts can
      // damage any zombie via damage_zombie, and the host needs to see
      // those HP drops so its local AI and HP bar reflect them. Deletion
      // (HP ≤ 0) is handled separately in onZombieDelete.
      z.hp = row.hp;
      z.maxHp = row.maxHp;
      z.flash = Math.max(z.flash, row.flashLevel || 0);
    });

    netcode.setOnZombieDelete((row) => {
      killLocalZombieByHostZid(row.hostZid);
    });

    netcode.setOnDoorUpdate((row) => {
      // row.doorId is the numeric index into the local doors array (see
      // tryBuyDoor — we normalize string ids to indices on the wire).
      const d = doors[row.doorId];
      if (d && row.opened && !d.opened) {
        openDoorLocal(d);
      }
    });

    netcode.setOnGameStateUpdate((row) => {
      if (!row) return;
      if (typeof row.round !== 'number') return;
      const prev = getRound();
      if (row.round === prev) return;

      setRound(row.round);

      if (row.round > prev) {
        // Normal advance — host already did this locally; non-host
        // needs the round-intro UI + SFX fired.
        if (!netcode.isHost()) {
          setState('roundIntro');
          setRoundIntroTimer(3);
          sfxRound();
          showCenterMsg(`ROUND ${row.round}`, `${row.round % 5 === 0 ? '💀 BOSS ROUND' : ''}`, '#c00', 3);
        }
      } else {
        // Server rolled round backward → session reset (last player
        // left, or all players died). The zombie deletes come in via
        // onZombieDelete; here we just acknowledge the fresh round so
        // any new arrivals start from 1.
        if (!netcode.isHost()) {
          setState('roundIntro');
          setRoundIntroTimer(3);
        }
      }
    });

    // Host streams its live zombie positions each tick.
    netcode.setHostZombiesProvider(() => {
      const out = [];
      for (const z of zombies) {
        if (!z.hostZid) continue;
        out.push({
          hostZid: z.hostZid,
          wx: z.wx,
          wz: z.wz,
          ry: 0,
          flashLevel: z.flash,
        });
      }
      return out;
    });
  }

  return { register, killLocalZombieByHostZid };
}
