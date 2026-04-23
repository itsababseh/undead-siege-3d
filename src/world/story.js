// Story, Progression, Easter Egg, and Generator systems
import * as THREE from 'three';
import { beep, actx, masterGain } from '../audio/index.js';
import { triggerScreenShake } from '../effects/index.js';

// Dependencies passed via init
// _gs is a shared game state object: { points, round, player, totalKills }
let _scene, _camera, _TILE, _gs, _addFloatText, _doors;
export function setStoryDeps(scene, camera, TILE, gameState, addFloatText) {
  _scene = scene; _camera = camera; _TILE = TILE;
  _gs = gameState; _addFloatText = addFloatText;
}
export function setStoryDoors(doors) {
  _doors = doors;
}


// --- Radio Transmissions (narrative between rounds) ---
// Generator/catalyst-related transmissions removed alongside the easter
// egg quest itself (those mechanics no longer exist in-game). Replaced
// with atmosphere/threat-escalation flavor so the radio still rewards
// pushing into late rounds.
const radioTransmissions = [
  { round: 1, speaker: 'COMMAND', text: 'Operative, this is Command. You\'ve been deployed to Facility 935. The dead are rising. Hold your position at all costs.', color: '#4af' },
  { round: 2, speaker: 'COMMAND', text: 'We\'re detecting increased anomalous activity. The breach originated from the west wing laboratory. Do NOT investigate... yet.', color: '#4af' },
  { round: 3, speaker: 'DR. RICHTER', text: '*static* ...the serum... it wasn\'t supposed to... they were already dead when we started the trials...', color: '#f84' },
  { round: 5, speaker: 'COMMAND', text: 'Good work surviving this long. The horde\'s growing — fall back to a chokepoint. The boards on the windows won\'t hold forever.', color: '#4af' },
  { round: 7, speaker: 'DR. RICHTER', text: '*crackle* The Element 115... it binds them. They feel pain. They remember you. Be ready — they learn.', color: '#f84' },
  { round: 10, speaker: 'COMMAND', text: 'Radiation levels are spiking. Whatever Richter was working on, it\'s accelerating. Hold the line, Operative.', color: '#4af' },
  { round: 12, speaker: '???', text: '*distorted voice* ...you think you can stop this? We are already free. The 115 chose US. It will choose you too...', color: '#f44' },
  { round: 15, speaker: 'DR. RICHTER', text: 'The breach is widening. They\'re coming through the walls now. Patch every board you can — that\'s your only edge.', color: '#f84' },
  { round: 18, speaker: 'COMMAND', text: 'Your extraction window is closing. Complete the objective or we\'ll be forced to enact Protocol Omega. You don\'t want that.', color: '#4af' },
  { round: 20, speaker: '???', text: '*laughing* Protocol Omega... they\'ll burn everything. You, us, the truth. But Element 115 cannot be destroyed. WE cannot be destroyed.', color: '#f44' },
  { round: 25, speaker: 'DR. RICHTER', text: 'If you\'ve made it this far... maybe there\'s hope. Keep killing. Keep moving. The dead don\'t get to win today.', color: '#f84' },
];

let radioActive = false;
let radioTimer = 0;
let radioCharIdx = 0;
let radioCurrentMsg = null;
let radioBlipTimer = 0;

export function triggerRadioTransmission(roundNum) {
  const msg = radioTransmissions.find(r => r.round === roundNum);
  if (!msg) return;
  radioCurrentMsg = msg;
  radioActive = true;
  radioCharIdx = 0;
  radioTimer = 0;
  radioBlipTimer = 0;
  
  // Show radio UI
  const el = document.getElementById('radioOverlay');
  el.style.display = 'block';
  el.style.opacity = '1';
  document.getElementById('radioSpeaker').textContent = msg.speaker;
  document.getElementById('radioSpeaker').style.color = msg.color;
  document.getElementById('radioText').textContent = '';
  
  // Static burst
  if (actx && masterGain) {
    try {
      const bufLen = actx.sampleRate * 0.15;
      const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
      const noise = actx.createBufferSource(); noise.buffer = buf;
      const g = actx.createGain(); g.gain.value = 0.06;
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 1;
      noise.connect(f); f.connect(g); g.connect(masterGain); noise.start();
    } catch(e) {}
  }
}

export function updateRadioTransmission(dt) {
  if (!radioActive || !radioCurrentMsg) return;
  
  radioTimer += dt;
  const msg = radioCurrentMsg;
  
  // Typewriter effect
  const charsPerSec = 35;
  const targetChars = Math.floor(radioTimer * charsPerSec);
  if (targetChars > radioCharIdx && radioCharIdx < msg.text.length) {
    radioCharIdx = Math.min(targetChars, msg.text.length);
    document.getElementById('radioText').textContent = msg.text.substring(0, radioCharIdx);
    
    // Radio blip sound
    radioBlipTimer += dt;
    if (radioBlipTimer > 0.04) {
      radioBlipTimer = 0;
      if (actx && masterGain) {
        try {
          const o = actx.createOscillator(), g = actx.createGain();
          o.type = 'square';
          o.frequency.value = 600 + Math.random() * 200;
          g.gain.setValueAtTime(0.015, actx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.03);
          o.connect(g); g.connect(masterGain);
          o.start(); o.stop(actx.currentTime + 0.03);
        } catch(e) {}
      }
    }
  }
  
  // Auto-close after text finishes + 4 seconds
  if (radioCharIdx >= msg.text.length) {
    radioTimer += 0; // keep counting
    const sinceComplete = radioTimer - (msg.text.length / charsPerSec);
    if (sinceComplete > 4) {
      closeRadio();
    }
    // Fade out in last second
    if (sinceComplete > 3) {
      document.getElementById('radioOverlay').style.opacity = String(1 - (sinceComplete - 3));
    }
  }
}

export function closeRadio() {
  radioActive = false;
  radioCurrentMsg = null;
  document.getElementById('radioOverlay').style.display = 'none';
}

// --- Easter Egg Quest (REMOVED) ---
//
// The original three-generator + catalyst quest was removed because the
// in-world generators were blocking other interactions (notably the BLUE
// generator at (22,16) sat on top of the e-14 window's repair prompt,
// making the barricade un-repairable). The quest was also unfindable
// without out-of-band knowledge of the activation sequence.
//
// `easterEgg` stays exported as an empty stub so HUD / minimap loops
// over `easterEgg.generators` and the initGame state-reset block
// continue to no-op cleanly without scattering null checks everywhere.
// `buildGenerators` / `tryActivateGenerator` / `tryCatalyst` /
// `updateGenerators` are kept as empty exports so the import bindings
// in main.js + buying.js stay valid without further surgery.
export const easterEgg = {
  generators: [],
  correctOrder: [],
  activatedOrder: [],
  allActivated: false,
  catalystReady: false,
  catalystUsed: false,
  questComplete: false,
  catalystTx: -1, catalystTz: -1,
};

export function buildGenerators() { /* no-op — easter egg removed */ }
export function tryActivateGenerator() { return false; }
export function tryCatalyst() { return false; }
export function updateGenerators(_dt) { /* no-op — easter egg removed */ }

// --- Persistent Unlock System ---
const UNLOCK_KEY = 'undeadSiege3dUnlocks';

function getUnlocks() {
  try {
    const d = localStorage.getItem(UNLOCK_KEY);
    if (d) return JSON.parse(d);
  } catch(e) {}
  return {};
}

function saveUnlock(key, value) {
  try {
    const unlocks = getUnlocks();
    unlocks[key] = value;
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocks));
  } catch(e) {}
}

function getUnlock(key, defaultVal) {
  const unlocks = getUnlocks();
  return unlocks[key] !== undefined ? unlocks[key] : defaultVal;
}

// Track persistent stats
export function updatePersistentStats() {
  const unlocks = getUnlocks();
  const prevHighRound = unlocks.highestRound || 0;
  const prevTotalKills = unlocks.totalKillsAllTime || 0;
  const prevGamesPlayed = unlocks.gamesPlayed || 0;
  
  if (_gs.round > prevHighRound) saveUnlock('highestRound', _gs.round);
  saveUnlock('totalKillsAllTime', prevTotalKills + _gs.totalKills);
  saveUnlock('gamesPlayed', prevGamesPlayed + 1);
  saveUnlock('lastPlayed', new Date().toISOString());
}

// --- Unlock Tiers (displayed on menu) ---
export function getPlayerRank() {
  const unlocks = getUnlocks();
  const totalKills = unlocks.totalKillsAllTime || 0;
  const highRound = unlocks.highestRound || 0;
  const eeComplete = unlocks.easterEggComplete || false;
  
  if (eeComplete && highRound >= 30) return { rank: '☠️ PRESTIGE', color: '#f0f', desc: 'Easter Egg Master' };
  if (highRound >= 25) return { rank: '⭐ VETERAN', color: '#fc0', desc: `Round ${highRound} survivor` };
  if (highRound >= 15) return { rank: '🎖️ SERGEANT', color: '#4af', desc: `${totalKills} total kills` };
  if (highRound >= 8) return { rank: '🔫 CORPORAL', color: '#4e4', desc: 'Showing promise' };
  if (totalKills >= 50) return { rank: '🪖 PRIVATE', color: '#aaa', desc: 'Battle-tested' };
  return { rank: '🆕 RECRUIT', color: '#666', desc: 'Fresh meat' };
}

function showMenuRank() {
  const rank = getPlayerRank();
  const unlocks = getUnlocks();
  let html = `<div style="color:${rank.color};font-size:13px;letter-spacing:2px;margin-bottom:4px">${rank.rank}</div>`;
  html += `<div style="color:#aaa;font-size:10px">${rank.desc}</div>`;
  if (unlocks.highestRound) {
    html += `<div style="color:#999;font-size:9px;margin-top:4px">Best: R${unlocks.highestRound} · ${unlocks.totalKillsAllTime || 0} lifetime kills</div>`;
  }
  if (unlocks.easterEggComplete) {
    html += `<div style="color:#0ff;font-size:9px;margin-top:2px">🏆 Easter Egg Completed</div>`;
  }
  // Insert rank display before high scores
  const scoresEl = document.getElementById('menuScores');
  const rankDiv = document.getElementById('menuRank') || document.createElement('div');
  rankDiv.id = 'menuRank';
  rankDiv.innerHTML = html;
  rankDiv.style.cssText = 'text-align:center;margin-bottom:10px;letter-spacing:1px;line-height:1.6';
  if (!rankDiv.parentNode) scoresEl.parentNode.insertBefore(rankDiv, scoresEl);
}



