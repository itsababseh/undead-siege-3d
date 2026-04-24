// Single-player death screen — "YOU DIED" card with stats, local
// leaderboard, global SpacetimeDB leaderboard, run-stats card, and
// action buttons (FIGHT AGAIN / MULTIPLAYER / VIBE JAM PORTAL /
// SHARE). Submits the run to the global high-score table.
//
// Wiring from main.js:
//   import { initDeathScreen, showDeath, isDeathShown, resetDeathShown }
//       from './ui/deathScreen.js';
//   initDeathScreen({ gameState, getLocalPlayerName });
//   // when HP hits zero in SP:
//   showDeath();
//   // each frame before drawing HUD: if (isDeathShown()) skip HUD draw.
//   // at initGame() time: resetDeathShown().

import * as netcode from '../netcode/connection.js';
import { resetKillStreak, resetRunStats, getRunStats } from '../gameplay/shooting.js';
import { restartMenuBackground, saveScore } from './menu.js';
import { closeRadio, updatePersistentStats, getPlayerRank } from '../world/story.js';

let _gameState = null;
let _getLocalPlayerName = () => 'Survivor';
let _shown = false;

export function initDeathScreen(ctx) {
  _gameState = ctx.gameState;
  _getLocalPlayerName = ctx.getLocalPlayerName || (() => 'Survivor');
}

export function isDeathShown() { return _shown; }
export function resetDeathShown() {
  _shown = false;
  // Restore body touch-action so gameplay doesn't get unwanted
  // browser scroll/zoom gestures. See note in showDeath().
  try { document.body.style.touchAction = ''; } catch (e) {}
}

// Emergency-fallback HTML for the death screen — used when the
// fancy stats/leaderboard render path throws. Guarantees the player
// always has a visible FIGHT AGAIN button, even on mobile when an
// upstream call (saveScore, updatePersistentStats, closeRadio,
// initMenuBackground) misbehaves under flaky touch / network state.
function _renderFallbackDeathScreen(round, totalKills, points) {
  const blocker = document.getElementById('blocker');
  if (!blocker) return;
  blocker.classList.remove('hidden');
  blocker.style.opacity = '1';
  blocker.innerHTML =
    '<h1 style="color:#c00;text-shadow:0 0 60px #c00">YOU DIED</h1>' +
    '<div class="sub">SURVIVED ' + round + ' ROUND' + (round!==1?'S':'') + '</div>' +
    '<div style="color:#aaa;margin:14px 0;font:13px monospace">' +
    'Round ' + round + ' &middot; ' + totalKills + ' kills &middot; ' + points + ' pts</div>' +
    '<button onclick="window._startGame()" style="background:none;border:2px solid #c00;color:#c00;padding:14px 50px;font:bold 16px monospace;cursor:pointer;letter-spacing:3px;margin-top:8px">FIGHT AGAIN</button>' +
    '<br><button onclick="window._deathMultiplayer && window._deathMultiplayer()" style="background:none;border:2px solid #4af;color:#4af;padding:10px 32px;font:bold 13px monospace;cursor:pointer;letter-spacing:2px;margin-top:10px">⚔️ MULTIPLAYER</button>';
}

export function showDeath() {
  try { resetKillStreak(); } catch(e) {}
  if (_shown) return;
  _shown = true;
  // Re-enable touch scrolling on the body for the death screen. The
  // `body { touch-action: none }` rule is there for gameplay (stops
  // the browser from pinch-zooming / swiping away mid-round) but it
  // also prevents the user from scrolling the death-screen blocker
  // on mobile — which on anything shorter than ~720px viewport
  // clips FIGHT AGAIN out of reach ("stuck on the you-died screen"
  // bug). Restored to 'none' in resetDeathShown() so gameplay isn't
  // affected on FIGHT AGAIN / MAIN MENU.
  try { document.body.style.touchAction = 'pan-y'; } catch (e) {}
  // Snapshot the round stats up-front so the emergency fallback below
  // can render even if updatePersistentStats / closeRadio / saveScore
  // throws (commonly seen on mobile under flaky network state).
  let round = 0, totalKills = 0, points = 0;
  try {
    round = _gameState.round;
    totalKills = _gameState.totalKills;
    points = _gameState.points;
  } catch (e) {}
  // Watchdog — if the fancy render path below silently fails (a thrown
  // exception inside the inner setTimeout could leave the blocker at
  // opacity:0 forever, which the player perceives as "frozen, no
  // death screen"), force the emergency fallback at +1.5s so the
  // player can always reach FIGHT AGAIN.
  const _watchdog = setTimeout(() => {
    const blocker = document.getElementById('blocker');
    if (!blocker || blocker.classList.contains('hidden') || blocker.style.opacity === '0' || blocker.style.opacity === '') {
      console.warn('[deathScreen] watchdog firing — fancy render did not complete; using fallback');
      try { _renderFallbackDeathScreen(round, totalKills, points); } catch (e) { console.error('[deathScreen] fallback also failed', e); }
    }
  }, 1500);
  try { updatePersistentStats(); } catch (e) { console.warn('[deathScreen] updatePersistentStats failed', e); }
  try { closeRadio(); } catch (e) { console.warn('[deathScreen] closeRadio failed', e); }
  // Snapshot run stats for the stats card; reset for next run.
  let _runStats = null;
  try { _runStats = getRunStats(); resetRunStats(); } catch(e) {}
  let board = [];
  try { board = saveScore(round, totalKills, points); }
  catch (e) { console.warn('[deathScreen] saveScore failed', e); }
  // Submit to the global SpacetimeDB leaderboard. Both SP and MP death
  // paths reach here (MP session-reset path submits separately in
  // hostSync to handle the all-died case with the full squad roster).
  // If we're not yet connected, kick off a connect; the submit retries
  // below handle the race.
  if (round > 0) {
    const submitScore = () => {
      try {
        netcode.callSubmitHighScore({
          name: _getLocalPlayerName(),
          round, points, kills: totalKills,
        });
        console.log('[score] submitted', { round, points, kills: totalKills });
      } catch (e) {
        console.warn('[score] submit failed', e);
      }
    };
    if (netcode.isConnected()) {
      submitScore();
    } else {
      if (netcode.getStatus() !== 'connecting') {
        try { netcode.connect(); } catch (e) {}
      }
      // Retry once after 2s in case the connection lands quickly.
      setTimeout(() => { if (netcode.isConnected()) submitScore(); }, 2000);
    }
  }

  try {
    const veil = document.getElementById('deathVeil');
    if (veil) veil.style.background = 'rgba(0,0,0,0.85)';
  } catch (e) {}

  // Inner setTimeout body wrapped in try/catch — any thrown exception
  // here (DOM access on a missing node, innerHTML interpolation on a
  // weird score, etc.) used to leave the blocker at opacity:0 forever
  // and look like a frozen game on mobile. Now any throw lets the
  // 1.5s watchdog above render the fallback.
  setTimeout(() => { try {
    const blocker = document.getElementById('blocker');
    if (!blocker) return;
    blocker.classList.remove('hidden');
    blocker.style.opacity = '0';

    // Hide HUD elements during death screen
    document.getElementById('pointsBox').style.display = 'none';
    document.getElementById('ammoBox').style.display = 'none';
    document.getElementById('roundBox').style.display = 'none';
    document.getElementById('hpBarWrap').style.display = 'none';
    document.getElementById('killsLabel').style.display = 'none';
    document.getElementById('minimap').style.display = 'none';
    document.getElementById('weaponSwitcher').style.display = 'none';
    document.getElementById('perkIcons').style.display = 'none';

    let lbHTML = '';
    board.slice(0, 5).forEach((e, i) => {
      const isThis = e.round === round && e.kills === totalKills && e.points === points;
      lbHTML += `<div style="color:${isThis?'#fc0':'#aaa'};${isThis?'font-weight:bold':''}">
        ${i+1}. R${e.round} · ${e.kills} kills · ${e.points} pts${isThis?' ← YOU':''}
      </div>`;
    });

    // Global leaderboard from SpacetimeDB (top 5).
    let globalLbHTML = '';
    if (netcode.isConnected()) {
      const globals = netcode.getHighScores().slice(0, 5);
      if (globals.length === 0) {
        globalLbHTML = '<div style="color:#555;text-align:center">No global scores yet — yours is being submitted!</div>';
      } else {
        const myName = _getLocalPlayerName();
        globalLbHTML = globals.map((s, i) => {
          const mine = s.name === myName && s.round === round && s.points === points && s.kills === totalKills;
          const isSquad = typeof s.name === 'string' && s.name.includes(', ');
          const color = mine ? '#fc0' : (isSquad ? '#8fcfff' : '#aaf');
          const prefix = isSquad ? '👥 ' : '';
          const name = String(s.name || 'Anon').slice(0, 50);
          return `<div style="color:${color};${mine?'font-weight:bold':''};white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${name.replace(/"/g,'&quot;')}">
            ${i+1}. ${prefix}${name} · R${s.round} · ${s.points} pts${mine?' ← YOU':''}
          </div>`;
        }).join('');
      }
    } else {
      globalLbHTML = '<div style="color:#555;text-align:center">Connecting to global leaderboard…</div>';
    }

    // Run-stats card (built before innerHTML to avoid nested-backtick issues).
    let _statsCardHTML = '';
    if (_runStats) {
      const _wNames = _runStats.names || [];
      const _wKills = _runStats.weaponKills || [];
      let _weaponPills = '';
      for (let _wi = 0; _wi < Math.min(_wNames.length, 4); _wi++) {
        if (_wKills[_wi] > 0) {
          _weaponPills += '<div style="color:#aaa;font-size:9px;letter-spacing:1px;background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:3px">'
            + _wNames[_wi] + ': <span style="color:#fc0">' + _wKills[_wi] + '&times;</span></div>';
        }
      }
      if (_runStats.knifeKills > 0) {
        _weaponPills += '<div style="color:#aaa;font-size:9px;letter-spacing:1px;background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:3px">'
          + 'Knife: <span style="color:#fc0">' + _runStats.knifeKills + '&times;</span></div>';
      }
      _statsCardHTML = '<div style="margin:8px auto 0;max-width:380px;width:100%;font:11px monospace;background:rgba(0,0,0,0.4);border:1px solid rgba(255,200,0,0.15);border-radius:4px;padding:10px 16px;position:relative">'
        + '<div style="color:#fa0;letter-spacing:2px;font-size:10px;margin-bottom:8px;text-align:center">&#x1F4CA; THIS RUN</div>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:8px">'
        + '<div style="text-align:center"><div style="color:#4e4;font-size:16px;font-weight:bold">' + _runStats.bestWeapon + '</div><div style="font-size:8px;color:#888;letter-spacing:1px;margin-top:2px">BEST WEAPON</div></div>'
        + '<div style="text-align:center"><div style="color:#4af;font-size:16px;font-weight:bold">' + _runStats.accuracy + '%</div><div style="font-size:8px;color:#888;letter-spacing:1px;margin-top:2px">ACCURACY</div></div>'
        + '<div style="text-align:center"><div style="color:#fc0;font-size:16px;font-weight:bold">' + _runStats.knifeKills + '</div><div style="font-size:8px;color:#888;letter-spacing:1px;margin-top:2px">KNIFE KILLS</div></div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">' + _weaponPills + '</div>'
        + '</div>';
    }

    blocker.innerHTML = `
      <div class="menu-bg"><canvas id="menuBgCanvas"></canvas></div>
      <h1 style="color:#c00;text-shadow:0 0 60px #c00,0 0 120px rgba(200,0,0,0.3);position:relative">YOU DIED</h1>
      <div class="sub" style="position:relative">SURVIVED ${round} ROUND${round!==1?'S':''}</div>
      <div class="menu-divider"></div>
      <div style="color:#888;font-size:14px;margin:10px 0;line-height:2;text-align:center;position:relative">
        <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap">
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${round}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">ROUND</div></div>
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${totalKills}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">KILLS</div></div>
          <div style="text-align:center"><div style="color:#fc0;font-size:22px;font-weight:bold">${points}</div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">POINTS</div></div>
        </div>
      </div>
      <div class="menu-divider"></div>
      ${_statsCardHTML}
      <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:10px;position:relative">
        <div style="min-width:180px">
          <div style="margin:8px 0;font-size:11px;letter-spacing:2px;color:#666">📂 YOUR BEST</div>
          <div style="font-size:12px;line-height:1.8">${lbHTML}</div>
        </div>
        <div style="min-width:220px">
          <div style="margin:8px 0;font-size:11px;letter-spacing:2px;color:#4af">🌐 GLOBAL TOP 5</div>
          <div style="font-size:12px;line-height:1.8">${globalLbHTML}</div>
        </div>
      </div>
      <button onclick="window._startGame()" style="margin-top:16px;background:none;border:2px solid #c00;color:#c00;padding:12px 40px;font:bold 16px 'Courier New';cursor:pointer;letter-spacing:3px;position:relative;overflow:hidden;transition:all 0.3s">FIGHT AGAIN</button>
      <br>
      <button onclick="window._deathMultiplayer()" style="margin-top:10px;background:none;border:2px solid #4af;color:#4af;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;position:relative;overflow:hidden;transition:all 0.3s">⚔️ MULTIPLAYER</button>
      <br>
      <button onclick="window._vibeJamPortal()" style="margin-top:10px;background:none;border:2px solid #0f4;color:#0f4;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;position:relative;overflow:hidden;transition:all 0.3s">🌀 VIBE JAM PORTAL</button>
      <div style="margin-top:8px;padding:6px 12px;border:1px solid #fc0;background:rgba(255,204,0,0.08);border-radius:4px;display:inline-block"><span style="color:#fc0;font-size:10px;letter-spacing:1px;text-shadow:0 0 6px rgba(255,204,0,0.4)">⚠️ CAUTION: Transports you to a random Vibe Jam 2026 game!</span></div>
      <br>
      <button onclick="window._shareTwitter(${round},${totalKills},${points})" style="margin-top:10px;background:none;border:2px solid #1da1f2;color:#1da1f2;padding:10px 32px;font:bold 13px 'Courier New';cursor:pointer;letter-spacing:2px;position:relative;overflow:hidden;transition:all 0.3s">🐦 SHARE ON X/TWITTER</button>
    `;

    const rank = getPlayerRank();
    const rankEl = document.createElement('div');
    rankEl.style.cssText = 'margin-top:10px;text-align:center;position:relative;';
    rankEl.innerHTML = `<div style="color:${rank.color};font-size:13px;letter-spacing:2px">${rank.rank}</div><div style="color:#aaa;font-size:10px">${rank.desc}</div>`;
    blocker.appendChild(rankEl);

    try { document.getElementById('hud').classList.add('hidden'); } catch (e) {}
    try { restartMenuBackground(); } catch (e) { console.warn('[deathScreen] restartMenuBackground failed', e); }
    requestAnimationFrame(() => {
      try {
        blocker.style.transition = 'opacity 0.8s ease-in';
        blocker.style.opacity = '1';
        const _veil = document.getElementById('deathVeil');
        if (_veil) _veil.style.background = 'rgba(0,0,0,0)';
      } catch (e) {}
    });
    // Fancy path completed — cancel the watchdog.
    try { clearTimeout(_watchdog); } catch (e) {}
  } catch (innerErr) {
    console.error('[deathScreen] inner render threw — watchdog will fall back', innerErr);
  } }, 300);
}
