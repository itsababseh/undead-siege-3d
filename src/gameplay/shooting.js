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

export function tryShoot() {
  const {
    player, weapons, zombies, camera, muzzleLight, TILE,
    mapAt, sfxShoot, sfxEmpty, sfxHit, sfxKill, sfxBossKill,
    setGunKick,
    spawnMuzzleSparks, spawnBloodParticles, spawnEnergyParticles,
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
      const mpActive = netcode.isConnected();

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
      } else {
        bestZ.hp -= w.dmg;
        if (player._instaKill && bestZ.hp > 0) bestZ.hp = 0;

        if (bestZ.hp <= 0) {
          const idx = zombies.indexOf(bestZ);
          if (idx >= 0) {
            setTotalKills(getTotalKills() + 1);
            const basePts = bestZ.isBoss ? 500 : bestZ.isElite ? 120 : 60;
            const pts = player._doublePoints ? basePts * 2 : basePts;
            setPoints(getPoints() + pts);
            sfxKill();
            showHitmarker(true);
            spawnDmgNumber(bestZ.wx, 2.2, bestZ.wz, w.dmg, true);
            if (w.isRayGun) spawnEnergyParticles(bestZ.wx, 1, bestZ.wz, 15);
            else spawnBloodParticles(bestZ.wx, 1, bestZ.wz, 8);
            const c = bestZ.isBoss ? '#f44' : bestZ.isElite ? '#ff8' : '#fc0';
            addFloatText(bestZ.isBoss ? `BOSS KILLED! +${pts}` : `+${pts}`, c, bestZ.isBoss ? 2.5 : 1);
            startZombieDeathAnim(bestZ);
            spawnBloodSplatter(bestZ.wx, 1.2, bestZ.wz);
            spawnPowerUp(bestZ.wx, bestZ.wz);
            triggerScreenShake(bestZ.isBoss ? 1.5 : bestZ.isElite ? 0.5 : 0.15, 8);
            removeZombieMesh(bestZ);
            zombies.splice(idx, 1);
            if (bestZ.isBoss) {
              sfxBossKill();
              triggerScreenShake(2.5, 5);
            }
          }
        }

        // Ray Gun splash damage — hurts nearby zombies. SP only.
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
              const sPts = player._doublePoints ? 120 : 60;
              setPoints(getPoints() + sPts);
              sfxKill();
              addFloatText(`+${sPts}`, '#0f0', 1);
              startZombieDeathAnim(sz2);
              spawnPowerUp(sz2.wx, sz2.wz);
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
