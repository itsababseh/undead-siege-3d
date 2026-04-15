// Wall-buy / perk / door purchase interactions.
//
// main.js calls tryBuy() when E is pressed; this module walks through
// wall buys, perk machines, then delegates to the story/mysterybox/pap
// trys, and finally tryBuyDoor. All the mutable main.js state it needs
// (points/round/etc.) comes through the ctx passed to initBuying.
//
// openDoorLocal is exposed separately because the netcode host-sync
// layer also calls it when it sees a door open on a remote client.

import * as netcode from '../netcode/connection.js';

let _ctx = null;
export function initBuying(ctx) { _ctx = ctx; }

export function tryBuy() {
  const {
    camera, TILE, wallBuys, perkMachines, perks, weapons, player,
    weaponMags, PERK_DURATION, addFloatText,
    sfxBuyWeapon, sfxBuyPerk,
    getPoints, setPoints, getRound,
    tryActivateGenerator, tryCatalyst, tryMysteryBox,
    collectMysteryBoxWeapon, tryPackAPunch,
  } = _ctx;

  const px = camera.position.x, pz = camera.position.z;

  for (const wb of wallBuys) {
    const bx = (wb.tx + 0.5) * TILE, bz = (wb.tz + 0.5) * TILE;
    const d = Math.hypot(bx - px, bz - pz);
    if (d < TILE * 2) {
      if (wb.minRound && getRound() < wb.minRound) {
        addFloatText(`${weapons[wb.wi].name} unlocks Round ${wb.minRound}`, '#888');
        return;
      }
      if (!player.owned[wb.wi] && getPoints() >= wb.cost) {
        setPoints(getPoints() - wb.cost);
        weaponMags[player.curWeapon] = player.mag;
        player.owned[wb.wi] = true;
        player.curWeapon = wb.wi;
        player.mag = weapons[wb.wi].mag;
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        player.reloading = false;
        player.reloadTimer = 0;
        sfxBuyWeapon(weapons[wb.wi].isRayGun);
        if (weapons[wb.wi].isRayGun) { addFloatText(`⚡ RAY GUN ⚡`, '#0f0', 2.5); }
        else { addFloatText(`${weapons[wb.wi].name}!`, '#6f6', 1.5); }
      } else if (player.owned[wb.wi] && getPoints() >= Math.floor(wb.cost / 2)) {
        setPoints(getPoints() - Math.floor(wb.cost / 2));
        player.ammo[wb.wi] = weapons[wb.wi].maxAmmo;
        sfxBuyWeapon(false);
        addFloatText('Ammo!', '#6f6', 1);
      }
      return;
    }
  }

  for (const pm of perkMachines) {
    const perk = perks[pm.perkIdx];
    const bx = (pm.tx + 0.5) * TILE, bz = (pm.tz + 0.5) * TILE;
    const d = Math.hypot(bx - px, bz - pz);
    if (d < TILE * 2) {
      if (player.perksOwned[perk.id] > 0) {
        addFloatText(
          `Already have ${perk.name} (${Math.ceil(player.perksOwned[perk.id])}s left)`,
          '#888'
        );
      } else if (getRound() < perk.minRound) {
        addFloatText(`${perk.name} unlocks round ${perk.minRound}`, '#888');
      } else if (getPoints() >= perk.cost) {
        setPoints(getPoints() - perk.cost);
        player.perksOwned[perk.id] = PERK_DURATION;
        perk.apply();
        sfxBuyPerk();
        addFloatText(`${perk.name} ACTIVE! (${PERK_DURATION}s)`, perk.color, 2.5);
      } else {
        addFloatText(`Need $${perk.cost} for ${perk.name}`, '#f88');
      }
      return;
    }
  }

  if (tryActivateGenerator()) return;
  if (tryCatalyst()) return;
  if (tryMysteryBox()) return;
  if (collectMysteryBoxWeapon()) return;
  if (tryPackAPunch()) return;
  tryBuyDoor();
}

export function tryBuyDoor() {
  const { camera, TILE, doors, addFloatText, sfxDoorOpen, getPoints, setPoints } = _ctx;
  const px = camera.position.x, pz = camera.position.z;
  for (const door of doors) {
    if (door.opened) continue;
    for (const [tx, tz] of door.tiles) {
      const bx = (tx + 0.5) * TILE, bz = (tz + 0.5) * TILE;
      const d = Math.hypot(bx - px, bz - pz);
      if (d < TILE * 2.5) {
        if (getPoints() >= door.cost) {
          setPoints(getPoints() - door.cost);
          sfxDoorOpen();
          if (netcode.isConnected()) {
            // Server expects numeric doorId (i32). Use the array index
            // as the canonical id — door.id is a string label.
            const numericId = doors.indexOf(door);
            try { netcode.callOpenDoor(numericId); }
            catch (e) { console.warn('[mp] openDoor failed', e); openDoorLocal(door); }
            // Apply visuals immediately for the buyer; the onDoorUpdate
            // callback for others is idempotent.
            openDoorLocal(door);
          } else {
            openDoorLocal(door);
          }
        } else {
          addFloatText(`Need $${door.cost} for ${door.label}`, '#f88');
        }
        return;
      }
    }
  }
}

/**
 * Shared "door opens" visual + map side-effects. Called in SP directly,
 * and from the netcode subscription callback in MP so non-buyers also
 * see the door open and their zombie spawn quotas go up.
 */
export function openDoorLocal(door) {
  if (door.opened) return;
  const {
    map, MAP_W, doorMeshes, scene, addFloatText,
    getZToSpawn, setZToSpawn, getMaxAlive, setMaxAlive,
    getDoorsOpenedCount, setDoorsOpenedCount,
  } = _ctx;
  door.opened = true;
  setDoorsOpenedCount(getDoorsOpenedCount() + 1);
  for (const [dtx, dtz] of door.tiles) { map[dtz * MAP_W + dtx] = 0; }
  doorMeshes.filter(dm => door.tiles.some(([dx, dz]) => dm.x === dx && dm.z === dz))
    .forEach(dm => { scene.remove(dm.mesh); });
  setZToSpawn(getZToSpawn() + 4);
  setMaxAlive(Math.min(getMaxAlive() + 3, 30));
  addFloatText(`${door.label} OPENED!`, '#4f4', 2.5);
  addFloatText('More zombies incoming!', '#f84', 2);
}
