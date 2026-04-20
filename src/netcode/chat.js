// In-game chat UI. Subscribes to the chat window element, renders the
// last N messages from netcode.getChatMessages(), and handles the T-to-
// type / Enter-to-send / Esc-to-cancel flow. All server state lives in
// connection.js — this file is pure UI.
//
// The HUD has two modes:
//   - passive: shows the last 6 messages for 8 seconds after the newest,
//     then fades. Good for awareness without blocking the screen.
//   - input:   a text input overlay at the bottom of the screen. Press
//     T (or Enter) to open, type, Enter to send, Esc to cancel.

import * as netcode from './connection.js';

const MAX_VISIBLE = 6;
const FADE_AFTER_MS = 8000;
const MAX_LEN = 200;

let _windowEl = null;
let _inputEl = null;
let _inputBoxEl = null;
let _hintEl = null;
let _inputActive = false;
let _lastRenderedCount = -1;
let _lastNewMsgTime = 0;

/** Call once on startup with the host page. Creates the HUD DOM. */
let _getState = null;
export function initChat(getState) {
  _getState = typeof getState === 'function' ? getState : null;
  _initChat();
}
function _initChat() {
  if (_windowEl) return; // idempotent

  const style = document.createElement('style');
  style.textContent = `
    #chatWindow{position:fixed;left:12px;bottom:180px;max-width:380px;
      font:12px monospace;color:#fff;z-index:45;pointer-events:none;
      text-shadow:0 1px 2px #000,0 0 4px #000;transition:opacity 0.4s;
      opacity:0;display:flex;flex-direction:column;gap:2px}
    #chatWindow.visible{opacity:1}
    #chatWindow .chat-line{padding:2px 6px;background:rgba(0,0,0,0.35);
      border-left:2px solid #4af;border-radius:2px;word-break:break-word}
    #chatWindow .chat-line .chat-name{color:#8cf;margin-right:6px;font-weight:bold}
    #chatInputBox{position:fixed;left:12px;bottom:120px;z-index:46;
      display:none;align-items:center;gap:8px;background:rgba(0,0,0,0.8);
      border:1px solid #4af;border-radius:4px;padding:6px 10px;
      font:14px monospace;color:#fff}
    #chatInputBox.active{display:flex}
    #chatInputBox input{background:transparent;border:none;color:#fff;
      font:inherit;outline:none;width:380px;caret-color:#4af}
    #chatInputBox .label{color:#4af;font-weight:bold}
    #chatHint{position:fixed;left:12px;bottom:100px;z-index:44;
      font:11px monospace;color:#888;text-shadow:0 1px 2px #000;
      background:rgba(0,0,0,0.4);padding:3px 8px;border-radius:2px;
      pointer-events:none;display:none}
    #chatHint.visible{display:block}
  `;
  document.head.appendChild(style);

  _windowEl = document.createElement('div');
  _windowEl.id = 'chatWindow';
  document.body.appendChild(_windowEl);

  _inputBoxEl = document.createElement('div');
  _inputBoxEl.id = 'chatInputBox';
  _inputBoxEl.innerHTML = '<span class="label">SAY:</span>';
  _inputEl = document.createElement('input');
  _inputEl.type = 'text';
  _inputEl.maxLength = MAX_LEN;
  _inputBoxEl.appendChild(_inputEl);
  document.body.appendChild(_inputBoxEl);

  _hintEl = document.createElement('div');
  _hintEl.id = 'chatHint';
  _hintEl.textContent = 'Press T to chat';
  document.body.appendChild(_hintEl);

  // Input box handlers. We catch keydown on the document so T opens the
  // box from anywhere in-game, but ignore it when an input is already
  // focused (so buy menus / name inputs don't clash).
  document.addEventListener('keydown', (e) => {
    if (!_isInMatch()) return;
    if (_inputActive) {
      if (e.key === 'Enter') {
        const text = _inputEl.value;
        if (text && text.trim()) {
          netcode.callSendChat(text.trim().slice(0, MAX_LEN));
        }
        closeInput();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Escape') {
        closeInput();
        e.preventDefault();
        e.stopPropagation();
      }
      // Let other keys fall through to the input element.
      return;
    }
    // Open on T when not typing elsewhere — but ONLY during active
    // gameplay. Without this check, pressing T in the lobby screen
    // opens chat and the input focus then blocks keyboard gameplay
    // once the match starts.
    if ((e.key === 't' || e.key === 'T') && document.activeElement?.tagName !== 'INPUT') {
      const state = _getState ? _getState() : null;
      if (state !== 'playing' && state !== 'roundIntro') return;
      openInput();
      e.preventDefault();
    }
  }, true);

  // Reveal the passive HUD briefly whenever a new message lands.
  netcode.setOnChatMessage(() => {
    _lastNewMsgTime = performance.now();
    renderWindow();
  });
}

function openInput() {
  _inputActive = true;
  _inputBoxEl.classList.add('active');
  _inputEl.value = '';
  _inputEl.focus();
  // Force the passive window visible while typing.
  _lastNewMsgTime = performance.now();
}

function closeInput() {
  _inputActive = false;
  _inputBoxEl.classList.remove('active');
  _inputEl.value = '';
  _inputEl.blur();
}

export function isChatInputActive() { return _inputActive; }

// Force the chat input to close. Called by main.js when leaving
// gameplay (match end, death, going back to lobby) so a stale open
// input doesn't persist across state transitions.
export function closeChatInput() {
  if (_inputActive) closeInput();
}

function renderWindow() {
  if (!_windowEl) return;
  const msgs = netcode.getChatMessages();
  if (msgs.length === _lastRenderedCount && !_inputActive) return;
  _lastRenderedCount = msgs.length;
  const slice = msgs.slice(-MAX_VISIBLE);
  _windowEl.innerHTML = slice
    .map(m => `<div class="chat-line"><span class="chat-name">${escapeHtml(m.senderName)}:</span>${escapeHtml(m.text)}</div>`)
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Call each frame. Fades the window out after a delay. */
// Match-presence test mirroring main.js's isInActiveMatch(). Connected
// alone isn't enough — the death screen auto-connects to submit scores,
// and we don't want a chat HUD or T-to-chat in solo runs.
function _isInMatch() {
  if (!netcode.isConnected()) return false;
  try {
    const id = netcode.getMyLobbyId();
    return id && id !== 0n;
  } catch (e) { return false; }
}

export function tickChat() {
  if (!_windowEl) return;
  const inMatch = _isInMatch();
  const state = _getState ? _getState() : null;
  const inGameplay = state === 'playing' || state === 'roundIntro';
  // Only advertise "Press T to chat" during actual gameplay so the
  // hint doesn't appear in the lobby / menu / death screens.
  _hintEl.classList.toggle('visible', inMatch && inGameplay && !_inputActive);
  if (!inMatch || !inGameplay) {
    _windowEl.classList.remove('visible');
    // Safety: if the state left gameplay while input was open, close it
    if (_inputActive) closeInput();
    return;
  }
  renderWindow();
  const age = performance.now() - _lastNewMsgTime;
  const shouldShow = _inputActive || age < FADE_AFTER_MS;
  _windowEl.classList.toggle('visible', shouldShow);
}
