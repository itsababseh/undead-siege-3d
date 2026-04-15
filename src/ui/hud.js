// ===== HUD UPDATE =====
// Extracted from main.js — Phase 4 modularization

let _camera, _TILE, _weapons, _player, _isMobile,
    _getPoints, _getRound, _getTotalKills, _getZombies,
    _perks, _perkMachines, _doors, _wallBuys,
    _mysteryBox, _packAPunch, _easterEgg, _powerUps, _POWERUP_TYPES;

export function setHudDeps(deps) {
  _camera = deps.camera;
  _TILE = deps.TILE;
  _weapons = deps.weapons;
  _player = deps.player;
  _isMobile = deps.isMobile;
  _getPoints = deps.getPoints;
  _getRound = deps.getRound;
  _getTotalKills = deps.getTotalKills;
  _getZombies = deps.getZombies;
  _perks = deps.perks;
  _perkMachines = deps.perkMachines;
  _doors = deps.doors;
  _wallBuys = deps.wallBuys;
  _mysteryBox = deps.mysteryBox;
  _packAPunch = deps.packAPunch;
  _easterEgg = deps.easterEgg;
  _powerUps = deps.powerUps;
  _POWERUP_TYPES = deps.POWERUP_TYPES;
}

export function updateHUD(dmgFlash, switchWeaponFn) {
  const points = _getPoints();
  const round = _getRound();
  const totalKills = _getTotalKills();
  const zombies = _getZombies();
  const w = _weapons[_player.curWeapon];
  
  document.querySelector('#ammoBox .wname').textContent = w.name;
  document.querySelector('#ammoBox .wname').style.color = w.color;
  const ammoEl = document.querySelector('#ammoBox .ammo');
  const reloadBarWrap = document.getElementById('reloadBarWrap');
  const reloadFill = document.getElementById('reloadFill');
  const reloadTimeEl = document.getElementById('reloadTime');
  if (_player.reloading) {
    const remaining = Math.max(0, _player.reloadTimer).toFixed(1);
    ammoEl.textContent = `${remaining}s`;
    ammoEl.className = 'ammo reloading';
    const pct = Math.max(0, Math.min(100, ((_player.reloadTotal - _player.reloadTimer) / _player.reloadTotal) * 100));
    reloadBarWrap.style.display = 'block';
    reloadFill.style.width = pct + '%';
    reloadTimeEl.style.display = 'block';
    reloadTimeEl.textContent = `RELOADING`;
  } else {
    ammoEl.textContent = `${_player.mag} / ${_player.ammo[_player.curWeapon] === 999 ? '∞' : _player.ammo[_player.curWeapon]}`;
    ammoEl.className = 'ammo';
    reloadBarWrap.style.display = 'none';
    reloadTimeEl.style.display = 'none';
  }
  
  document.querySelector('#pointsBox .val').textContent = points;
  document.querySelector('#roundBox .val').textContent = round;
  document.getElementById('killsLabel').textContent = `KILLS: ${totalKills}`;
  
  // HP bar
  const hpPct = (_player.hp / _player.maxHp) * 100;
  const hpFillEl = document.getElementById('hpFill');
  hpFillEl.style.width = `${hpPct}%`;
  if (hpPct < 25) { hpFillEl.style.background = 'linear-gradient(180deg,#f33 0%,#c00 50%,#800 100%)'; }
  else if (hpPct < 50) { hpFillEl.style.background = 'linear-gradient(180deg,#e62 0%,#b40 50%,#823 100%)'; }
  else { hpFillEl.style.background = 'linear-gradient(180deg,#e22 0%,#a00 50%,#811 100%)'; }
  document.getElementById('hpVal').textContent = `${Math.ceil(_player.hp)} / ${_player.maxHp}`;
  
  // Boss bar
  const boss = zombies.find(z => z.isBoss);
  document.getElementById('bossBarWrap').style.display = boss ? 'block' : 'none';
  document.getElementById('bossLabel').style.display = boss ? 'block' : 'none';
  if (boss) {
    document.getElementById('bossFill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
  
  // Perks
  const perkEl = document.getElementById('perkIcons');
  let perkHTML = '';
  for (const p of _perks) {
    if (_player.perksOwned[p.id]) {
      perkHTML += `<div class="perk-icon" style="border-color:${p.color};color:${p.color}">${p.name.substring(0,3).toUpperCase()}</div>`;
    }
  }
  if (_player._instaKill && _player._instaKillTimer > 0) {
    perkHTML += `<div class="perk-icon powerup-active" style="border-color:#f44;color:#f44">💀 ${Math.ceil(_player._instaKillTimer)}s</div>`;
  }
  if (_player._doublePoints && _player._doublePointsTimer > 0) {
    perkHTML += `<div class="perk-icon powerup-active" style="border-color:#ff4;color:#ff4">💰 ${Math.ceil(_player._doublePointsTimer)}s</div>`;
  }
  perkEl.innerHTML = perkHTML;
  
  // Buy prompt
  const buyEl = document.getElementById('buyPrompt');
  const buyBtnEl = document.getElementById('buyBtn');
  let buyText = '';
  const px = _camera.position.x, pz = _camera.position.z;
  const keyLabel = _isMobile ? 'TAP' : '[E]';
  
  for (const wb of _wallBuys) {
    const bx = (wb.tx+0.5)*_TILE, bz = (wb.tz+0.5)*_TILE;
    if (Math.hypot(bx-px, bz-pz) < _TILE*2) {
      if (wb.minRound && round < wb.minRound) {
        buyText = `${_weapons[wb.wi].name} - Unlocks Round ${wb.minRound}`;
      } else {
        buyText = _player.owned[wb.wi] ?
          `${keyLabel} Ammo ${_weapons[wb.wi].name} - $${Math.floor(wb.cost/2)}` :
          `${keyLabel} Buy ${_weapons[wb.wi].name} - $${wb.cost}`;
      }
      break;
    }
  }
  if (!buyText) {
    for (const pm of _perkMachines) {
      const perk = _perks[pm.perkIdx];
      const bx = (pm.tx+0.5)*_TILE, bz = (pm.tz+0.5)*_TILE;
      if (Math.hypot(bx-px, bz-pz) < _TILE*2) {
        if (_player.perksOwned[perk.id]) buyText = `${perk.name} (OWNED)`;
        else if (round < perk.minRound) buyText = `${perk.name} - Unlocks Round ${perk.minRound}`;
        else buyText = `${keyLabel} ${perk.name} (${perk.desc}) - $${perk.cost}`;
        break;
      }
    }
  }
  if (!buyText) {
    for (const door of _doors) {
      if (door.opened) continue;
      for (const [tx, tz] of door.tiles) {
        const bx = (tx+0.5)*_TILE, bz = (tz+0.5)*_TILE;
        if (Math.hypot(bx-px, bz-pz) < _TILE*2.5) {
          buyText = `${keyLabel} Open ${door.label} - $${door.cost}`;
          break;
        }
      }
      if (buyText) break;
    }
  }
  // Mystery Box prompt
  if (!buyText) {
    const mbx = (_mysteryBox.tx+0.5)*_TILE, mbz = (_mysteryBox.tz+0.5)*_TILE;
    if (Math.hypot(mbx-px, mbz-pz) < _TILE*2.5) {
      if (_mysteryBox.collectTimer > 0 && _mysteryBox.resultWeaponIdx >= 0) {
        buyText = `${keyLabel} Grab ${_weapons[_mysteryBox.resultWeaponIdx].name}`;
      } else if (_mysteryBox.isSpinning) {
        buyText = '🎰 Spinning...';
      } else {
        buyText = `${keyLabel} Mystery Box - $${_mysteryBox.cost}`;
      }
    }
  }
  // Generator prompts
  if (!buyText) {
    for (const gen of _easterEgg.generators) {
      if (gen.activated) continue;
      if (gen.doorReq) {
        const door = _doors.find(d => d.id === gen.doorReq);
        if (!door || !door.opened) continue;
      }
      const gx = (gen.tx+0.5)*_TILE, gz = (gen.tz+0.5)*_TILE;
      if (Math.hypot(gx-px, gz-pz) < _TILE*2) {
        buyText = `${keyLabel} Activate ${gen.label}`;
        break;
      }
    }
  }
  // Catalyst prompt
  if (!buyText && _easterEgg.catalystReady && !_easterEgg.catalystUsed) {
    const cx = (_easterEgg.catalystTx+0.5)*_TILE, cz = (_easterEgg.catalystTz+0.5)*_TILE;
    if (Math.hypot(cx-px, cz-pz) < _TILE*2) {
      buyText = `${keyLabel} ACTIVATE THE MACHINE`;
    }
  }
  // Pack-a-Punch prompt
  if (!buyText) {
    const ppx = (_packAPunch.tx+0.5)*_TILE, ppz = (_packAPunch.tz+0.5)*_TILE;
    if (Math.hypot(ppx-px, ppz-pz) < _TILE*2.5) {
      const wi = _player.curWeapon;
      if (_packAPunch.upgraded[wi]) {
        buyText = `${_weapons[wi].name} (UPGRADED)`;
      } else {
        buyText = `${keyLabel} Pack-a-Punch ${_weapons[wi].name} - $${_packAPunch.cost}`;
      }
    }
  }
  
  buyEl.style.display = buyText ? 'block' : 'none';
  buyEl.textContent = buyText;
  if (buyBtnEl) buyBtnEl.style.display = buyText && _isMobile ? 'flex' : 'none';
  
  // Damage overlay
  const dmgEl = document.getElementById('dmgOverlay');
  if (dmgFlash > 0) dmgEl.classList.add('flash');
  else dmgEl.classList.remove('flash');
  
  // Power-up timer bar
  const puBar = document.getElementById('powerupTimerBar');
  const puFill = document.getElementById('powerupTimerFill');
  const puLabel = document.getElementById('powerupTimerLabel');
  const hasInsta = _player._instaKill && _player._instaKillTimer > 0;
  const hasDbl = _player._doublePoints && _player._doublePointsTimer > 0;
  if (hasInsta || hasDbl) {
    puBar.style.display = 'block';
    puLabel.style.display = 'block';
    const PU_DUR = 15;
    if (hasInsta && hasDbl) {
      const iPct = (_player._instaKillTimer / PU_DUR) * 50;
      const dPct = (_player._doublePointsTimer / PU_DUR) * 50;
      puFill.style.width = (iPct + dPct) + '%';
      puFill.style.background = `linear-gradient(90deg, #f44 0%, #f44 ${iPct/(iPct+dPct)*100}%, #fc0 ${iPct/(iPct+dPct)*100}%, #fc0 100%)`;
      puLabel.style.color = '#f88';
      puLabel.textContent = `💀 ${Math.ceil(_player._instaKillTimer)}s  💰 ${Math.ceil(_player._doublePointsTimer)}s`;
    } else if (hasInsta) {
      puFill.style.width = (_player._instaKillTimer / PU_DUR) * 100 + '%';
      puFill.style.background = '#f44';
      puLabel.style.color = '#f66';
      puLabel.textContent = `💀 INSTA-KILL ${Math.ceil(_player._instaKillTimer)}s`;
    } else {
      puFill.style.width = (_player._doublePointsTimer / PU_DUR) * 100 + '%';
      puFill.style.background = '#fc0';
      puLabel.style.color = '#fc0';
      puLabel.textContent = `💰 DOUBLE POINTS ${Math.ceil(_player._doublePointsTimer)}s`;
    }
    const lowestTimer = Math.min(
      hasInsta ? _player._instaKillTimer : 999,
      hasDbl ? _player._doublePointsTimer : 999
    );
    const pulseAlpha = lowestTimer < 5 ? (0.5 + Math.sin(performance.now() / 150) * 0.5) : 1;
    puBar.style.opacity = pulseAlpha;
    puLabel.style.opacity = pulseAlpha;
  } else {
    puBar.style.display = 'none';
    puLabel.style.display = 'none';
  }
  
  // Mobile weapon switcher active state
  if (_isMobile) {
    document.querySelectorAll('.wsBtn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      const owned = _player.owned[idx];
      const active = idx === _player.curWeapon;
      btn.className = `wsBtn${active ? ' active' : ''}${!owned ? ' locked' : ''}`;
      btn.textContent = _weapons[idx].name;
    });
  }
}

// ===== CENTER MESSAGE =====
let centerMsgTimer = 0;

export function showCenterMsg(big, small, color, duration = 2) {
  const el = document.getElementById('centerMsg');
  el.style.display = 'block';
  el.style.opacity = '1';
  const bigEl = el.querySelector('.big');
  const smallEl = el.querySelector('.small');
  bigEl.style.animation = 'none';
  smallEl.style.animation = 'none';
  void bigEl.offsetHeight;
  bigEl.style.animation = '';
  smallEl.style.animation = '';
  bigEl.textContent = big;
  bigEl.style.color = color;
  smallEl.textContent = small;
  smallEl.style.color = '#888';
  centerMsgTimer = duration;
}

export function updateCenterMsg(dt) {
  if (centerMsgTimer > 0) {
    centerMsgTimer -= dt;
    const el = document.getElementById('centerMsg');
    el.style.opacity = Math.min(1, centerMsgTimer);
    if (centerMsgTimer <= 0) el.style.display = 'none';
  }
}

// ===== PAUSE =====
export function showPause() {
  document.getElementById('pauseOverlay').style.display = 'flex';
  let perkInfo = '';
  for (const p of _perks) {
    if (_player.perksOwned[p.id]) perkInfo += `${p.name} (${p.desc}) · `;
  }
  document.getElementById('pausePerks').textContent = perkInfo ? `PERKS: ${perkInfo.slice(0,-3)}` : '';
}

export function hidePause() { 
  document.getElementById('pauseOverlay').style.display = 'none'; 
}

// ===== FLOATING TEXT OVERLAY =====
export function drawFloatTexts(floatTexts) {
  const container = document.getElementById('hud');
  container.querySelectorAll('.float-text').forEach(el => el.remove());
  
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const ft = floatTexts[i];
    const progress = 1 - (ft.life / ft.maxLife);
    const currentY = ft.y - progress * 0.08;
    const alpha = ft.life < 0.5 ? ft.life * 2 : 1;
    const scale = ft.life < 0.3 ? 0.8 + ft.life : 1;
    
    const div = document.createElement('div');
    div.className = 'float-text';
    div.style.cssText = `position:fixed;left:${ft.x*100}%;top:${currentY*100}%;transform:translate(-50%,-50%) scale(${scale});color:${ft.color};font-size:${ft.maxLife > 2 ? 18 : 14}px;font-weight:bold;letter-spacing:2px;opacity:${alpha};pointer-events:none;text-shadow:0 0 10px ${ft.color}, 0 2px 4px rgba(0,0,0,0.8);white-space:nowrap`;
    div.textContent = ft.text;
    container.appendChild(div);
  }
}
