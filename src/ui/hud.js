// ===== HUD UPDATE =====
// Extracted from main.js — Phase 4 modularization

let _camera, _TILE, _weapons, _player, _isMobile,
    _getPoints, _getRound, _getTotalKills, _getZombies,
    _perks, _perkMachines, _doors, _wallBuys,
    _mysteryBox, _packAPunch, _easterEgg, _powerUps, _POWERUP_TYPES;

// Weapon switch animation state
let _lastWeaponIdx = -1;
let _switchAnimTimer = 0;

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
  
  // — Weapon switch animation —
  const wnameCur = document.getElementById('wnameCur');
  const wnameOld = document.getElementById('wnameOld');
  if (_lastWeaponIdx !== _player.curWeapon) {
    // Animate: slide old name out, new name in
    if (_lastWeaponIdx >= 0) {
      wnameOld.textContent = wnameCur.textContent;
      wnameOld.style.color = wnameCur.style.color;
      wnameOld.className = 'wname wname-old slide-out';
      wnameCur.className = 'wname slide-in';
      wnameCur.textContent = w.name;
      wnameCur.style.color = w.color;
      // Force reflow then activate slide-in
      void wnameCur.offsetHeight;
      wnameCur.className = 'wname slide-in-active';
      _switchAnimTimer = 0.3;
    } else {
      wnameCur.textContent = w.name;
      wnameCur.style.color = w.color;
    }
    _lastWeaponIdx = _player.curWeapon;
  }

  // — CoD-style ammo counter —
  const ammoMag = document.getElementById('ammoMag');
  const ammoReserve = document.getElementById('ammoReserve');
  const ammoWrap = document.querySelector('.ammo-wrap');
  const reloadWidget = document.getElementById('reloadWidget');
  const reloadFill = document.getElementById('reloadFill');
  const reloadTimeEl = document.getElementById('reloadTime');
  if (_player.reloading) {
    ammoWrap.style.display = 'none';
    reloadWidget.style.display = 'block';
    const pct = Math.max(0, Math.min(100, ((_player.reloadTotal - _player.reloadTimer) / _player.reloadTotal) * 100));
    reloadFill.style.width = pct + '%';
    if (reloadTimeEl) reloadTimeEl.textContent = Math.max(0, _player.reloadTimer).toFixed(1) + 's';
  } else {
    ammoWrap.style.display = 'flex';
    reloadWidget.style.display = 'none';
    ammoMag.textContent = _player.mag;
    const reserve = _player.ammo[_player.curWeapon];
    ammoReserve.textContent = reserve === 999 ? '\u221E' : reserve;
    // Low ammo warning: glow when magazine is at or below 25% capacity
    const magCap = w.mag;
    const isLow = _player.mag <= Math.ceil(magCap * 0.25) && _player.mag > 0;
    const isEmpty = _player.mag === 0;
    ammoMag.classList.toggle('low-ammo', isLow || isEmpty);
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
  
  // Perks + power-ups — unified stylized pill buttons with time-drain fill
  const perkEl = document.getElementById('perkIcons');
  const PERK_DURATION = 90;
  const PU_DURATION = 15;
  const PERK_ICONS = { juggernog: '🛡️', speedcola: '⚡', doubletap: '🔥', quickrevive: '💉', health: '❤️' };
  const makeIcon = (color, icon, label, secs, total, extra) => {
    const pct = Math.max(0, Math.min(100, (secs / total) * 100));
    const low = secs <= 5 ? ' low-time' : '';
    const extraHtml = extra ? `<span class="pi-time">${extra}</span>` : '';
    return `<div class="perk-icon${low}" style="color:${color};border-color:${color}"><div class="pi-drain" style="width:${pct}%"></div><div class="pi-content"><span class="pi-icon">${icon}</span><span class="pi-label">${label}</span>${extraHtml}<span class="pi-time">${Math.ceil(secs)}s</span></div></div>`;
  };
  let perkHTML = '';
  for (const p of _perks) {
    if (_player.perksOwned[p.id] > 0) {
      const icon = PERK_ICONS[p.id] || '✦';
      const label = p.name.substring(0, 3).toUpperCase();
      // Juggernog: show remaining shield hits instead of only the timer
      const extra = p.id === 'juggernog' && _player.shieldHits > 0
        ? `×${_player.shieldHits}`
        : '';
      perkHTML += makeIcon(p.color, icon, label, _player.perksOwned[p.id], PERK_DURATION, extra);
    }
  }
  if (_player._instaKill && _player._instaKillTimer > 0) {
    perkHTML += makeIcon('#ff4444', '💀', 'KILL', _player._instaKillTimer, PU_DURATION);
  }
  if (_player._doublePoints && _player._doublePointsTimer > 0) {
    perkHTML += makeIcon('#ffcc44', '💰', '2X', _player._doublePointsTimer, PU_DURATION);
  }
  // Only touch the DOM when the generated HTML actually changes — avoids
  // a full perk-icons reflow on every frame of the game loop.
  if (perkEl._lastHTML !== perkHTML) {
    perkEl.innerHTML = perkHTML;
    perkEl._lastHTML = perkHTML;
  }
  
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
        if (_player.perksOwned[perk.id] > 0) buyText = `${perk.name} (${Math.ceil(_player.perksOwned[perk.id])}s left)`;
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

// ===== ROUND BANNER =====
let _roundBannerTimer = 0;

export function showRoundBanner(roundNum, subText) {
  const banner = document.getElementById('roundBanner');
  const numEl = document.getElementById('rbNumber');
  const subEl = document.getElementById('rbSub');
  numEl.textContent = roundNum;
  subEl.textContent = subText || '';
  // Reset animation by removing and re-adding class
  banner.classList.remove('active');
  void banner.offsetHeight;
  banner.classList.add('active');
  _roundBannerTimer = 3.5; // matches CSS animation duration
}

export function updateRoundBanner(dt) {
  if (_roundBannerTimer > 0) {
    _roundBannerTimer -= dt;
    if (_roundBannerTimer <= 0) {
      document.getElementById('roundBanner').classList.remove('active');
    }
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
    if (_player.perksOwned[p.id] > 0) perkInfo += `${p.name} (${Math.ceil(_player.perksOwned[p.id])}s) · `;
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
