// Gun shooting: tryShoot (raycast + damage), doReload, finishReload,
// switchWeapon. Extracted from main.js to keep that file focused on
// game loop wiring.
//
// All the mutable state this module touches (player, weapons, zombies,
// the local point counter, camera/muzzle refs, FX, sfx, etc.) comes
// through the ctx passed to initShooting once at startup. Numeric
// mutables use getter/setter accessors because JS modules can't share
// primitive references across module boundaries.
//
// The SP-local damage/kill/splash path is preserved verbatim for
// offline play. In MP, damage is routed through the damage_zombie
// reducer — server is authoritative for HP and kill points.

import * as THREE from 'three';
import * as netcode from '../netcode/connection.js';

let _ctx = null;
export function initShooting(ctx) { _ctx = ctx; }
// ── Kill Streak tracker ────────────────────────────────────────────────────
let _streakCount = 0;
let _streakTimer = null;

export function resetKillStreak() {
  _streakCount = 0;
  if (_streakTimer) { clearTimeout(_streakTimer); _streakTimer = null; }
}

export function onKillFromMain(isBoss) { _onKill(isBoss); }

function _onKill(isBoss) {
  if (!_ctx) return;
  const { addFloatText, triggerScreenShake } = _ctx;
  _streakCount++;
  if (_streakTimer) clearTimeout(_streakTimer);
  _streakTimer = setTimeout(() => { _streakCount = 0; _streakTimer = null; }, 4000);

  if (isBoss) return; // boss already shows its own big text
  if (_streakCount === 2) {
    addFloatText('DOUBLE KILL!', '#fc0', 1.6);
  } else if (_streakCount === 3) {
    addFloatText('TRIPLE KILL!', '#f84', 2.0);
    triggerScreenShake(0.4, 10);
  } else if (_streakCount === 4) {
    addFloatText('MULTI KILL!', '#f44', 2.2);
    triggerScreenShake(0.6, 12);
  } else if (_streakCount >= 5) {
    addFloatText('RAMPAGE!!', '#f0f', 2.8);
    triggerScreenShake(1.0, 16);
  }
}
// ──────────────────────────────────────────────────────────────────────────

// ── Run Stats tracker ──────────────────────────────────────────────────────
// Tracks per-weapon kills and shots fired for the death-screen stats card.
// Weapon indices: 0=M1911 1=MP40 2=Trench Gun 3=Ray Gun 4=Knife (set externally)
const _weaponKills   = [0, 0, 0, 0, 0]; // 5 slots: 4 guns + knife
const _shotsFired    = [0, 0, 0, 0];     // 4 gun slots
let   _knifeKills    = 0;

export function resetRunStats() {
  for (let i = 0; i < _weaponKills.length; i++) _weaponKills[i] = 0;
  for (let i = 0; i < _shotsFired.length; i++) _shotsFired[i] = 0;
  _knifeKills = 0;
}

export function recordKnifeKill() {
  _knifeKills++;
  _weaponKills[4]++;
}

export function getRunStats() {
  const weapons = _ctx ? _ctx.weapons : null;
  const names = weapons
    ? weapons.map(w => w.name)
    : ['M1911', 'MP40', 'Trench Gun', 'Ray Gun'];
  names.push('Knife');

  // Best weapon by kills
  let bestIdx = 0;
  for (let i = 1; i < _weaponKills.length; i++) {
    if (_weaponKills[i] > _weaponKills[bestIdx]) bestIdx = i;
  }
  const bestWeapon = _weaponKills[bestIdx] > 0 ? names[bestIdx] : 'None';

  // Accuracy across all gun slots (knife has no shots fired)
  const totalShots = _shotsFired.reduce((a, b) => a + b, 0);
  const totalGunKills = _weaponKills.slice(0, 4).reduce((a, b) => a + b, 0);
  // One kill = avg ~3 shots for pistol, estimate accuracy as kills/shots
  // Cap at 100% to avoid weirdness with splash/instakill
  const accuracy = totalShots > 0
    ? Math.min(100, Math.round((totalGunKills / totalShots) * 100))
    : 0;

  return {
    weaponKills: [..._weaponKills],
    shotsFired: [..._shotsFired],
    knifeKills: _knifeKills,
    bestWeapon,
    accuracy,
    names,
  };
}
// ──────────────────────────────────────────────────────────────────────────


export function tryShoot() {
  const {
    player, weapons, zombies, camera, muzzleLight, TILE,
    mapAt, sfxShoot, sfxEmpty, sfxHit, sfxKill, sfxBossKill,
    setGunKick,
    spawnMuzzleSparks, spawnBloodParticles, spawnEnergyParticles, spawnDirtParticles,
    spawnDmgNumber, spawnBloodSplatter, spawnPowerUp,
    showHitmarker, addFloatText,
    startZombieDeathAnim, removeZombieMesh,
    triggerScreenShake,
    spawnTracer,
    getPoints, setPoints,
    getTotalKills, setTotalKills,
  } = _ctx;

  if (player.reloading || player.fireTimer > 0) return;
  const w = weapons[player.curWeapon];
  if (player.mag <= 0) { sfxEmpty(); doReload(); return; }

  player.mag--;
  // Track shot fired for accuracy stats
  if (player.curWeapon >= 0 && player.curWeapon < 4) _shotsFired[player.curWeapon]++;
  player.fireTimer = w.rate * player.fireRateMult;
  sfxShoot();
  setGunKick(1);
  spawnMuzzleSparks();
  const shakeAmt = player.curWeapon === 2 ? 0.6 : (w.isRayGun ? 0.4 : 0.2);
  triggerScreenShake(shakeAmt, 10);

  muzzleLight.intensity = 3;
  muzzleLight.color.set(w.isRayGun ? 0x00ff44 : 0xffcc44);
  muzzleLight.position.copy(camera.position);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  muzzleLight.position.add(dir.multiplyScalar(1));

  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const spreadX = (Math.random() - 0.5) * w.spread * 2;
    const spreadY = (Math.random() - 0.5) * w.spread * 2;

    const shootDir = new THREE.Vector3();
    camera.getWorldDirection(shootDir);
    shootDir.x += spreadX; shootDir.y += spreadY;
    shootDir.normalize();

    let bestZ = null, bestD = Infinity;
    for (const z of zombies) {
      if (z._spawnRising) continue; // invulnerable while emerging from ground
      const zScale = z.isBoss ? 1.6 : z.isElite ? 1.2 : 1;
      const zHeight = 2.2 * zScale;
      const hitRadius = z.isBoss ? 1.4 : z.isElite ? 1.0 : 0.8;
      const ox = camera.position.x - z.wx;
      const oz = camera.position.z - z.wz;
      const dxS = shootDir.x, dyS = shootDir.y, dzS = shootDir.z;
      const dxdz2 = dxS * dxS + dzS * dzS;
      if (dxdz2 < 0.0001) continue;
      const tClosest = -(ox * dxS + oz * dzS) / dxdz2;
      if (tClosest < 0.3) continue;
      const hDistSq = (ox + tClosest * dxS) ** 2 + (oz + tClosest * dzS) ** 2;
      if (hDistSq > hitRadius * hitRadius) continue;
      const yAtClosest = camera.position.y + tClosest * dyS;
      if (yAtClosest < -0.3 || yAtClosest > zHeight + 0.3) continue;
      let blocked = false;
      const step = TILE * 0.25;
      for (let t = step; t < tClosest; t += step) {
        const cx = camera.position.x + dxS * t;
        const cz = camera.position.z + dzS * t;
        if (mapAt(cx, cz) !== 0) { blocked = true; break; }
      }
      if (!blocked && tClosest < bestD) { bestD = tClosest; bestZ = z; }
    }

    // Tracer round (S3.1) — fire from muzzle toward hit or max range
    if (spawnTracer) {
      const muzzleOrigin = camera.position.clone().add(shootDir.clone().multiplyScalar(1.0));
      const tracerEnd = bestZ
        ? new THREE.Vector3(bestZ.wx, 1.2, bestZ.wz)
        : camera.position.clone().add(shootDir.clone().multiplyScalar(50));
      spawnTracer(muzzleOrigin, tracerEnd, player.curWeapon);
    }

    if (bestZ) {
      // CRITICAL: "MP" must mean "in an actual lobby", not just
      // "connected to the server". The death screen + MULTIPLAYER
      // button auto-connect to populate the high-score leaderboard,
      // so a SP player who ever clicked either has an open netcode
      // socket. If we route damage to callDamageZombie() in that
      // state the reducer call lands on the server but operates on
      // no row (SP zombies don't have server-side rows), and the
      // local SP code path under `else` never runs — so the zombie's
      // HP never decrements and they appear invincible. Mirrors the
      // isInActiveMatch() check in main.js.
      const mpActive = (() => {
        if (!netcode.isConnected()) return false;
        try {
          const id = netcode.getMyLobbyId();
          return id && id !== 0n;
        } catch (e) { return false; }
      })();

      sfxHit();
      bestZ.flash = 1;
      setPoints(getPoints() + (player._doublePoints ? 20 : 10));
      if (w.isRayGun) spawnEnergyParticles(bestZ.wx, 1.2, bestZ.wz, 6);
      else spawnBloodParticles(bestZ.wx, 1.2, bestZ.wz, 3);
      showHitmarker(false);
      spawnDmgNumber(bestZ.wx, 1.8 + Math.random() * 0.4, bestZ.wz, w.dmg, false);

      if (mpActive) {
        // MP: route damage through the reducer. Subscription callbacks
        // will reflect HP drop / row delete back to us and every other
        // client, including the death VFX in killLocalZombieByHostZid.
        const dmg = player._instaKill ? 999999 : w.dmg;
        try { netcode.callDamageZombie(bestZ.hostZid, dmg); }
        catch (e) { console.warn('[mp] damageZombie failed', e); }
        // Ray Gun splash in MP — same radius/falloff math as SP, but
        // every per-zombie damage tick goes through the server reducer
        // so HP / death stay authoritative. Local VFX (particles +
        // damage numbers) still fire on the shooter's client; remote
        // clients see the HP drop via subscription. Skipped in MP-SP
        // pre-fix would have been a long-standing 'splash doesn't
        // work for the squad' bug.
        if (w.splashRadius) {
          const splashDmg = Math.floor(w.dmg * 0.5);
          const sx = bestZ.wx, sz = bestZ.wz;
          for (const sz2 of zombies) {
            if (sz2 === bestZ || sz2._spawnRising) continue;
            if (!sz2.hostZid) continue;
            const sd = Math.hypot(sz2.wx - sx, sz2.wz - sz);
            if (sd > w.splashRadius) continue;
            const falloff = 1 - (sd / w.splashRadius);
            const dmgAmt = player._instaKill ? 999999 : Math.floor(splashDmg * falloff);
            if (dmgAmt <= 0) continue;
            sz2.flash = 0.5;
            spawnEnergyParticles(sz2.wx, 1, sz2.wz, 3);
            spawnDmgNumber(sz2.wx, 1.6 + Math.random() * 0.3, sz2.wz, dmgAmt, false);
            try { netcode.callDamageZombie(sz2.hostZid, dmgAmt); }
            catch (e) { console.warn('[mp] splash damageZombie failed', e); }
          }
        }
      } else {
        bestZ.hp -= w.dmg;
        if (player._instaKill && bestZ.hp > 0) bestZ.hp = 0;

        if (bestZ.hp <= 0) {
          const idx = zombies.indexOf(bestZ);
          if (idx >= 0) {
            setTotalKills(getTotalKills() + 1);
            // Track per-weapon kill for stats card
            if (player.curWeapon >= 0 && player.curWeapon < 4) _weaponKills[player.curWeapon]++;
            const basePts = bestZ.isBoss ? 500 : bestZ.isElite ? 120 : 60;
            const pts = player._doublePoints ? basePts * 2 : basePts;
            setPoints(getPoints() + pts);
            sfxKill();
            _onKill(bestZ.isBoss);
            showHitmarker(true);
            spawnDmgNumber(bestZ.wx, 2.2, bestZ.wz, w.dmg, true);
            // S4.2: Boss death — double blood particles
            if (w.isRayGun) spawnEnergyParticles(bestZ.wx, 1, bestZ.wz, bestZ.isBoss ? 30 : 15);
            else spawnBloodParticles(bestZ.wx, 1, bestZ.wz, bestZ.isBoss ? 16 : 8);
            const c = bestZ.isBoss ? '#f44' : bestZ.isElite ? '#ff8' : '#fc0';
            addFloatText(bestZ.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, bestZ.isBoss ? 2.5 : 1);
            startZombieDeathAnim(bestZ);
            spawnBloodSplatter(bestZ.wx, 1.2, bestZ.wz);
            spawnPowerUp(bestZ.wx, bestZ.wz);
            triggerScreenShake(bestZ.isBoss ? 1.5 : bestZ.isElite ? 0.5 : 0.15, 8);
            // Detach from window attacker list if this zombie was
            // pounding planks when it died.
            if (bestZ._targetWindow && bestZ._targetWindow.attackers) {
              const ai = bestZ._targetWindow.attackers.indexOf(bestZ);
              if (ai >= 0) bestZ._targetWindow.attackers.splice(ai, 1);
            }
            removeZombieMesh(bestZ);
            zombies.splice(idx, 1);
            if (bestZ.isBoss) {
              sfxBossKill();
              // S4.2: Longer, more intense screen shake on boss death
              triggerScreenShake(4, 4);
              spawnDirtParticles(bestZ.wx, bestZ.wz, 16);
            }
          }
        }

        // Ray Gun splash damage (SP path) — hurts nearby zombies.
        // The MP path above runs an equivalent loop that routes each
        // splash hit through netcode.callDamageZombie() instead of
        // touching local HP, so squads also see splash kills.
        if (w.splashRadius) {
          const splashDmg = Math.floor(w.dmg * 0.5);
          const sx = bestZ.wx, sz = bestZ.wz;
          for (let si = zombies.length - 1; si >= 0; si--) {
            const sz2 = zombies[si];
            if (sz2 === bestZ || sz2._spawnRising) continue;
            const sd = Math.hypot(sz2.wx - sx, sz2.wz - sz);
            if (sd > w.splashRadius) continue;
            const falloff = 1 - (sd / w.splashRadius);
            const dmgAmt = Math.floor(splashDmg * falloff);
            if (dmgAmt <= 0) continue;
            sz2.hp -= dmgAmt;
            sz2.flash = 0.5;
            spawnEnergyParticles(sz2.wx, 1, sz2.wz, 3);
            spawnDmgNumber(sz2.wx, 1.6 + Math.random() * 0.3, sz2.wz, dmgAmt, false);
            if (player._instaKill && sz2.hp > 0) sz2.hp = 0;
            if (sz2.hp <= 0) {
              setTotalKills(getTotalKills() + 1);
              if (player.curWeapon >= 0 && player.curWeapon < 4) _weaponKills[player.curWeapon]++;
              const sPts = player._doublePoints ? 120 : 60;
              setPoints(getPoints() + sPts);
              sfxKill();
              _onKill(false);
              addFloatText(`+${sPts}`, '#0f0', 1);
              startZombieDeathAnim(sz2);
              spawnPowerUp(sz2.wx, sz2.wz);
              if (sz2._targetWindow && sz2._targetWindow.attackers) {
                const ai = sz2._targetWindow.attackers.indexOf(sz2);
                if (ai >= 0) sz2._targetWindow.attackers.splice(ai, 1);
              }
              removeZombieMesh(sz2);
              zombies.splice(si, 1);
            }
          }
        }
      }
    }
  }

  if (player.mag <= 0) doReload();
}

export function doReload() {
  const { player, weapons, sfxReload } = _ctx;
  if (player.reloading) return;
  const w = weapons[player.curWeapon];
  if (player.mag >= w.mag) return;
  if (player.ammo[player.curWeapon] <= 0 && player.ammo[player.curWeapon] !== 999) return;
  player.reloading = true;
  player.reloadTotal = w.reload * player.reloadMult;
  player.reloadTimer = player.reloadTotal;
  sfxReload();
}

export function finishReload() {
  const { player, weapons } = _ctx;
  const w = weapons[player.curWeapon];
  const need = w.mag - player.mag;
  if (player.ammo[player.curWeapon] === 999) { player.mag = w.mag; }
  else {
    const take = Math.min(need, player.ammo[player.curWeapon]);
    player.mag += take;
    player.ammo[player.curWeapon] -= take;
  }
  player.reloading = false;
}

export function switchWeapon(idx) {
  const { player, weapons, weaponMags, getState, setQuickSwapWeapon, sfxWeaponSwitch } = _ctx;
  if (idx === player.curWeapon || !player.owned[idx]) return;
  const state = getState();
  if (state !== 'playing' && state !== 'roundIntro') return;
  weaponMags[player.curWeapon] = player.mag;
  setQuickSwapWeapon(player.curWeapon);
  player.curWeapon = idx;
  player.mag = (weaponMags[idx] !== undefined) ? weaponMags[idx] : weapons[idx].mag;
  player.reloading = false;
  player.reloadTimer = 0;
  sfxWeaponSwitch();
}
