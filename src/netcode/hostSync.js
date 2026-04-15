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
      // For remote (non-host) zombies, don't snap z.wx/z.wz to the
      // server value — store the target and let the main loop lerp
      // toward it each frame. Snapping causes the "jitters every
      // 50ms" look because the mesh sits still between syncs.
      // Host's own zombies have _remote=false (they came from
      // spawnZombie, not this callback) so they bypass this path.
      if (z._remote) {
        z._targetWx = row.wx;
        z._targetWz = row.wz;
      } else {
        z.wx = row.wx;
        z.wz = row.wz;
      }
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
      if (typeof row.round === 'number' && row.round > getRound()) {
        setRound(row.round);
        if (!netcode.isHost()) {
          setState('roundIntro');
          setRoundIntroTimer(3);
          sfxRound();
          showCenterMsg(`ROUND ${row.round}`, `${row.round % 5 === 0 ? '💀 BOSS ROUND' : ''}`, '#c00', 3);
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
