// Hold-TAB scoreboard overlay — CoD-Zombies style roster showing every
// player's round / kills / points / downs / status.
//
// Works in both SP (single row: the local player) and MP (local player
// + every other player in the lobby, pulled from the SpacetimeDB Player
// subscription via getLobbyPlayers).
//
// What's visible per player:
//   - Name
//   - Round (from the shared gameState — same for everyone in a lobby)
//   - Kills: LOCAL player only. The Player table doesn't sync per-player
//     kills yet, so remote rows show "—". (Upgrading the schema to track
//     kills + downs per player is a follow-up that requires a server
//     republish.)
//   - Points: directly from the server for every player in MP; from the
//     local gameState in SP.
//   - Downs: LOCAL player only, tracked below by incrementLocalDowns()
//     each time the local HP hits zero. Remote downs shown as "—".
//   - Status: ALIVE / DOWN / SPEC — from the Player table flags.
//
// Wiring from main.js:
//   import { initScoreboard, incrementLocalDowns, resetLocalDowns }
//     from './ui/scoreboard.js';
//   initScoreboard({
//     getLocalPlayerName, getLocalStats: () => ({ points, round, kills: totalKills }),
//     netcode,
//   });
//   // when the local player goes down in MP: incrementLocalDowns();
//   // when a new match starts: resetLocalDowns();

let _ctx = null;
let _overlayEl = null;
let _bodyEl = null;
let _visible = false;
let _localDowns = 0;
let _renderTimer = null;

export function initScoreboard(ctx) {
  _ctx = ctx;
  _buildDom();
  _wireInput();
}

export function incrementLocalDowns() { _localDowns++; }
export function resetLocalDowns() { _localDowns = 0; }
export function getLocalDowns() { return _localDowns; }

function _buildDom() {
  if (_overlayEl) return;
  _overlayEl = document.createElement('div');
  _overlayEl.id = 'scoreboardOverlay';
  _overlayEl.style.cssText = `
    position:fixed;inset:0;display:none;align-items:center;justify-content:center;
    z-index:140;pointer-events:none;background:rgba(0,0,0,0.55);
    font-family:'Courier New',monospace;color:#ddd;`;

  const card = document.createElement('div');
  card.style.cssText = `
    min-width:560px;max-width:90vw;background:rgba(8,8,12,0.92);
    border:1px solid rgba(200,0,0,0.4);border-radius:4px;
    box-shadow:0 0 40px rgba(200,0,0,0.25),inset 0 0 40px rgba(0,0,0,0.6);
    padding:18px 22px;`;

  const title = document.createElement('div');
  title.style.cssText = `
    color:#c00;letter-spacing:6px;font-size:18px;font-weight:bold;
    text-align:center;text-shadow:0 0 12px rgba(200,0,0,0.6);
    margin-bottom:6px;`;
  title.textContent = 'SURVIVORS';

  const hint = document.createElement('div');
  hint.style.cssText = `
    color:#666;font-size:10px;letter-spacing:2px;text-align:center;
    margin-bottom:14px;`;
  hint.textContent = 'HOLD TAB';

  _bodyEl = document.createElement('div');
  _bodyEl.style.cssText = 'font-size:13px;';

  card.appendChild(title);
  card.appendChild(hint);
  card.appendChild(_bodyEl);
  _overlayEl.appendChild(card);
  document.body.appendChild(_overlayEl);
}

function _wireInput() {
  // Tab is normally the browser's focus-cycle key. preventDefault while
  // in-game so it only drives the scoreboard. We guard against firing
  // while a text input has focus (chat box, name field) so the player
  // can still use Tab inside those.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (_isTextInputFocused()) return;
    e.preventDefault();
    // `keydown` fires repeatedly when the key is held. Only trigger
    // the show transition on the first event.
    if (_visible) return;
    _show();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Tab') return;
    if (!_visible) return;
    _hide();
  });
  // Safety: if the window loses focus while Tab is held (alt-tab, click-
  // out) the keyup never fires and the overlay gets stuck. Force-hide on
  // blur so the scoreboard doesn't persist across focus loss.
  window.addEventListener('blur', () => { if (_visible) _hide(); });
}

function _isTextInputFocused() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (a.isContentEditable) return true;
  return false;
}

function _show() {
  _visible = true;
  _overlayEl.style.display = 'flex';
  _render();
  // Keep points / status live while held — refresh every 250ms. Cheap
  // since it's just a DOM update with no canvas work.
  _renderTimer = setInterval(_render, 250);
}

function _hide() {
  _visible = false;
  _overlayEl.style.display = 'none';
  if (_renderTimer) { clearInterval(_renderTimer); _renderTimer = null; }
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function _render() {
  if (!_ctx || !_bodyEl) return;
  const { getLocalPlayerName, getLocalStats, netcode } = _ctx;
  const local = getLocalStats();
  const rows = [];

  const inMp = netcode && netcode.isConnected && netcode.isConnected() &&
               netcode.getMyLobbyId && netcode.getMyLobbyId() &&
               netcode.getMyLobbyId() !== 0n;

  if (inMp && netcode.getLobbyPlayers) {
    const localIdentityHex = _myIdentityHex(netcode);
    const players = netcode.getLobbyPlayers();
    for (const p of players) {
      const hex = _rowIdentityHex(p);
      const isLocal = hex && localIdentityHex && hex === localIdentityHex;
      // kills + downs now live on the server's Player row (schema
      // updated to add them). For the local row we still prefer the
      // client-tracked counters because they update instantly on
      // each kill/down, while the server echo has a tiny delay —
      // the scoreboard looks snappier that way.
      rows.push({
        isLocal,
        name: p.name || 'Survivor',
        points: p.points | 0,
        kills: isLocal ? (local.kills | 0) : (p.kills | 0),
        downs: isLocal ? _localDowns : (p.downs | 0),
        status: _statusFor(p),
      });
    }
    // Sort: local first, then by points desc
    rows.sort((a, b) => (b.isLocal - a.isLocal) || (b.points - a.points));
  } else {
    // Single player — just the local player.
    rows.push({
      isLocal: true,
      name: getLocalPlayerName ? getLocalPlayerName() : 'Survivor',
      points: local.points | 0,
      kills: local.kills | 0,
      downs: _localDowns,
      status: 'ALIVE',
    });
  }

  // Header
  let html = `
    <div style="display:grid;grid-template-columns:28px 1fr 70px 70px 80px 70px 80px;
                gap:10px;padding:6px 10px;color:#666;font-size:10px;letter-spacing:2px;
                border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:4px">
      <div>#</div><div>NAME</div><div style="text-align:right">ROUND</div>
      <div style="text-align:right">KILLS</div><div style="text-align:right">POINTS</div>
      <div style="text-align:right">DOWNS</div><div style="text-align:right">STATUS</div>
    </div>`;

  rows.forEach((r, i) => {
    const color = r.isLocal ? '#fc0' : (r.status === 'DOWN' ? '#f55' : '#aaa');
    const bg = r.isLocal ? 'rgba(255,204,0,0.08)' : 'transparent';
    const k = r.kills === null ? '—' : r.kills;
    const d = r.downs === null ? '—' : r.downs;
    html += `
      <div style="display:grid;grid-template-columns:28px 1fr 70px 70px 80px 70px 80px;
                  gap:10px;padding:7px 10px;color:${color};background:${bg};
                  border-radius:3px;align-items:center">
        <div style="color:#555">${i + 1}</div>
        <div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escapeHtml(r.name)}</div>
        <div style="text-align:right;color:#aaa">${local.round | 0}</div>
        <div style="text-align:right">${k}</div>
        <div style="text-align:right;color:#fc0">${r.points}</div>
        <div style="text-align:right">${d}</div>
        <div style="text-align:right;font-size:10px;letter-spacing:1px">${r.status}</div>
      </div>`;
  });

  _bodyEl.innerHTML = html;
}

function _statusFor(p) {
  if (p.spectating) return 'SPEC';
  if (p.downed) return 'DOWN';
  if (p.alive === false) return 'DEAD';
  return 'ALIVE';
}

function _myIdentityHex(netcode) {
  try {
    if (!netcode.getLocalIdentity) return null;
    const id = netcode.getLocalIdentity();
    if (!id) return null;
    if (typeof id.toHexString === 'function') return id.toHexString();
    return String(id);
  } catch (e) { return null; }
}

function _rowIdentityHex(row) {
  if (!row || !row.identity) return null;
  if (typeof row.identity.toHexString === 'function') return row.identity.toHexString();
  return String(row.identity);
}
