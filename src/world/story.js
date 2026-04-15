// Story, Progression, Easter Egg, and Generator systems
import * as THREE from 'three';
import { beep, actx, masterGain } from '../audio/index.js';
import { doors } from '../core/state.js';

// Dependencies passed via init
// _gs is a shared game state object: { points, round, player, totalKills }
let _scene, _camera, _TILE, _gs, _addFloatText;
export function setStoryDeps(scene, camera, TILE, gameState, addFloatText) {
  _scene = scene; _camera = camera; _TILE = TILE;
  _gs = gameState; _addFloatText = addFloatText;
}


// --- Radio Transmissions (narrative between rounds) ---
const radioTransmissions = [
  { round: 1, speaker: 'COMMAND', text: 'Operative, this is Command. You\'ve been deployed to Facility 935. The dead are rising. Hold your position at all costs.', color: '#4af' },
  { round: 2, speaker: 'COMMAND', text: 'We\'re detecting increased anomalous activity. The breach originated from the west wing laboratory. Do NOT investigate... yet.', color: '#4af' },
  { round: 3, speaker: 'DR. RICHTER', text: '*static* ...the serum... it wasn\'t supposed to... they were already dead when we started the trials...', color: '#f84' },
  { round: 5, speaker: 'COMMAND', text: 'Good work surviving this long. Intel suggests the horde is being controlled. Find the source. We\'re detecting energy signatures from three generators.', color: '#4af' },
  { round: 7, speaker: 'DR. RICHTER', text: '*crackle* The Element 115... it binds them. Three generators power the containment field. If you could overload them... but the sequence matters...', color: '#f84' },
  { round: 10, speaker: 'COMMAND', text: 'Operative, radiation levels are spiking. Whatever Richter was working on, it\'s accelerating. Find those generators. That\'s an order.', color: '#4af' },
  { round: 12, speaker: '???', text: '*distorted voice* ...you think you can stop this? We are already free. The 115 chose US. It will choose you too...', color: '#f44' },
  { round: 15, speaker: 'DR. RICHTER', text: 'The generators! Red, Blue, Yellow — activate them in the correct order. I encoded the sequence in the facility... look at the walls... the symbols...', color: '#f84' },
  { round: 18, speaker: 'COMMAND', text: 'Operative, your extraction window is closing. Complete the objective or we\'ll be forced to enact Protocol Omega. You don\'t want that.', color: '#4af' },
  { round: 20, speaker: '???', text: '*laughing* Protocol Omega... they\'ll burn everything. You, us, the truth. But Element 115 cannot be destroyed. WE cannot be destroyed.', color: '#f44' },
  { round: 25, speaker: 'DR. RICHTER', text: 'If you\'ve activated all three generators... go to the central chamber. The machine there... it can reverse the breach. But it needs a catalyst. YOUR life force. Are you prepared to sacrifice?', color: '#f84' },
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

// --- Easter Egg Quest ---
export const easterEgg = {
  generators: [
    { id: 'red', tx: 3, tz: 3, color: '#ff2222', activated: false, doorReq: 'west', label: 'RED GENERATOR' },
    { id: 'blue', tx: 22, tz: 16, color: '#2244ff', activated: false, doorReq: 'east', label: 'BLUE GENERATOR' },
    { id: 'yellow', tx: 15, tz: 21, color: '#ffdd00', activated: false, doorReq: null, label: 'YELLOW GENERATOR' },
  ],
  correctOrder: ['red', 'yellow', 'blue'], // The secret sequence
  activatedOrder: [],
  allActivated: false,
  catalystReady: false,
  catalystUsed: false,
  questComplete: false,
  catalystTx: 12, catalystTz: 12, // central chamber
};

const generatorMeshes = [];

export function buildGenerators() {
  // Clean old
  generatorMeshes.forEach(gm => { _scene.remove(gm.body); _scene.remove(gm.light); _scene.remove(gm.ring); });
  generatorMeshes.length = 0;
  
  easterEgg.generators.forEach(gen => {
    const gx = gen.tx * _TILE + _TILE / 2;
    const gz = gen.tz * _TILE + _TILE / 2;
    const color = new THREE.Color(gen.color);
    
    // Generator body (cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.8, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(gx, 0.9, gz);
    body.castShadow = true;
    _scene.add(body);
    
    // Energy ring (torus)
    const ringGeo = new THREE.TorusGeometry(0.7, 0.05, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(gx, 1.2, gz);
    ring.rotation.x = Math.PI / 2;
    _scene.add(ring);
    
    // Light
    const light = new THREE.PointLight(color.getHex(), 0.5, 10);
    light.position.set(gx, 2, gz);
    _scene.add(light);
    
    generatorMeshes.push({ body, ring, light, gen });
  });
}

export function tryActivateGenerator() {
  if (easterEgg.allActivated) return false;
  
  const px = _camera.position.x, pz = _camera.position.z;
  for (const gen of easterEgg.generators) {
    if (gen.activated) continue;
    
    // Check door requirement
    if (gen.doorReq) {
      const door = doors.find(d => d.id === gen.doorReq);
      if (!door || !door.opened) continue;
    }
    
    const gx = gen.tx * _TILE + _TILE / 2;
    const gz = gen.tz * _TILE + _TILE / 2;
    const d = Math.hypot(gx - px, gz - pz);
    if (d > _TILE * 2) continue;
    
    // Activate!
    gen.activated = true;
    easterEgg.activatedOrder.push(gen.id);
    
    // Check if correct order
    const idx = easterEgg.activatedOrder.length - 1;
    const isCorrect = easterEgg.activatedOrder[idx] === easterEgg.correctOrder[idx];
    
    if (isCorrect) {
      _addFloatText(`⚡ ${gen.label} ACTIVATED ⚡`, gen.color, 3);
      triggerScreenShake(0.8, 6);
      beep(400, 'sine', 0.15, 0.12);
      setTimeout(() => beep(600, 'sine', 0.15, 0.12), 120);
      setTimeout(() => beep(800, 'sine', 0.2, 0.1), 240);
      _gs.points += 500;
    } else {
      // Wrong order — reset all generators
      _addFloatText('⚠ WRONG SEQUENCE ⚠', '#f44', 3);
      _addFloatText('Generators reset...', '#888', 2.5);
      triggerScreenShake(1.5, 4);
      beep(200, 'sawtooth', 0.3, 0.15);
      easterEgg.generators.forEach(g => g.activated = false);
      easterEgg.activatedOrder = [];
    }
    
    // Check if all activated correctly
    if (easterEgg.activatedOrder.length === 3 && 
        easterEgg.activatedOrder.every((id, i) => id === easterEgg.correctOrder[i])) {
      easterEgg.allActivated = true;
      easterEgg.catalystReady = true;
      _addFloatText('🔓 ALL GENERATORS ACTIVE!', '#0f0', 4);
      _addFloatText('Go to the Central Chamber...', '#fc0', 3.5);
      triggerScreenShake(2, 4);
      // Dramatic sound
      setTimeout(() => {
        beep(200, 'sine', 0.3, 0.15);
        setTimeout(() => beep(300, 'sine', 0.3, 0.15), 200);
        setTimeout(() => beep(400, 'sine', 0.3, 0.15), 400);
        setTimeout(() => beep(600, 'sine', 0.5, 0.12), 600);
      }, 500);
    }
    
    return true;
  }
  return false;
}

export function tryCatalyst() {
  if (!easterEgg.catalystReady || easterEgg.catalystUsed) return false;
  
  const cx = easterEgg.catalystTx * _TILE + _TILE / 2;
  const cz = easterEgg.catalystTz * _TILE + _TILE / 2;
  const d = Math.hypot(cx - _camera.position.x, cz - _camera.position.z);
  if (d > _TILE * 2) return false;
  
  // Easter egg complete!
  easterEgg.catalystUsed = true;
  easterEgg.questComplete = true;
  
  // Massive reward
  _gs.points += 10000;
  _gs.player.maxHp = 250;
  _gs.player.hp = 250;
  
  // Visual spectacle
  triggerScreenShake(3, 3);
  const flash = document.getElementById('roundFlash');
  flash.style.display = 'block';
  flash.style.opacity = '0.8';
  flash.style.background = 'rgba(100,200,255,0.5)';
  setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => { flash.style.display = 'none'; flash.style.background = 'rgba(255,255,255,0.3)'; }, 800); }, 500);
  
  // Epic sound
  beep(200, 'sine', 0.5, 0.15);
  setTimeout(() => beep(400, 'sine', 0.5, 0.15), 300);
  setTimeout(() => beep(600, 'sine', 0.5, 0.15), 600);
  setTimeout(() => beep(800, 'sine', 0.5, 0.15), 900);
  setTimeout(() => beep(1200, 'sine', 1.0, 0.12), 1200);
  
  _addFloatText('🏆 EASTER EGG COMPLETE! 🏆', '#0ff', 5);
  _addFloatText('+10,000 POINTS · 250 MAX HP', '#fc0', 4);
  _addFloatText('The breach is sealed...', '#4af', 3.5);
  _addFloatText('But the dead still walk.', '#f84', 3);
  
  // Save to persistent unlocks
  saveUnlock('easterEggComplete', true);
  saveUnlock('highestEERound', _gs.round);
  
  return true;
}

export function updateGenerators(dt) {
  const t = performance.now() / 1000;
  generatorMeshes.forEach(gm => {
    const activated = gm.gen.activated;
    gm.ring.material.opacity = activated ? 0.6 + Math.sin(t * 3) * 0.2 : 0.15 + Math.sin(t * 1.5) * 0.1;
    gm.ring.rotation.z += dt * (activated ? 3 : 0.5);
    gm.light.intensity = activated ? 2 + Math.sin(t * 4) * 0.5 : 0.3 + Math.sin(t * 1.5) * 0.15;
  });
  
  // Catalyst location glow (when ready)
  // This is handled via existing _scene — just show float text hint periodically
}

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



