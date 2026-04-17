// Audio system — all sound effects, music, and ambient audio
// Extracted from main.js for modularity

// ===== AUDIO SYSTEM (Sound Design Overhaul) =====

// ── Dependency injection ──
let _camera, _player, _weapons;
export function setAudioDeps(camera, player, weapons) {
  _camera = camera; _player = player; _weapons = weapons;
}

let actx, masterGain, muted = false, bgMusicStarted = false;
const bgGains = [];
const bgNodes = [];
let ambientTimer = 0;
let zombieGroanTimer = 0;

function initAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.connect(actx.destination);
    masterGain.gain.value = muted ? 0 : 1;
  }
  if (actx.state === 'suspended') actx.resume();
}

function toggleMute() {
  muted = !muted;
  document.getElementById('muteBtn').textContent = muted ? '🔇' : '🔊';
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
}
document.getElementById('muteBtn').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });

function beep(freq, type, dur, vol) {
  if (!actx || !masterGain) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g); g.connect(masterGain);
    o.start(); o.stop(actx.currentTime + dur);
  } catch(e) {}
}

// ===== WEAPON-SPECIFIC SOUNDS =====
function sfxShootM1911() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Sharp crack
    const o1 = actx.createOscillator(), g1 = actx.createGain();
    o1.type = 'square'; o1.frequency.setValueAtTime(800, t);
    o1.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o1.connect(g1); g1.connect(masterGain); o1.start(t); o1.stop(t + 0.12);
    // Low punch
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'sawtooth'; o2.frequency.value = 80;
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o2.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t + 0.1);
    // Slide click
    const o3 = actx.createOscillator(), g3 = actx.createGain();
    o3.type = 'square'; o3.frequency.value = 2200;
    g3.gain.setValueAtTime(0.04, t + 0.05);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o3.connect(g3); g3.connect(masterGain); o3.start(t + 0.05); o3.stop(t + 0.08);
  } catch(e) {}
}

function sfxShootMP40() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Rapid rattle
    const o1 = actx.createOscillator(), g1 = actx.createGain();
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(600, t);
    o1.frequency.exponentialRampToValueAtTime(200, t + 0.06);
    g1.gain.setValueAtTime(0.12, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o1.connect(g1); g1.connect(masterGain); o1.start(t); o1.stop(t + 0.07);
    // Metallic clatter
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'square'; o2.frequency.value = 1500;
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 4;
    o2.connect(f); f.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t + 0.04);
    // Bass thump
    const o3 = actx.createOscillator(), g3 = actx.createGain();
    o3.type = 'sine'; o3.frequency.value = 60;
    g3.gain.setValueAtTime(0.1, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o3.connect(g3); g3.connect(masterGain); o3.start(t); o3.stop(t + 0.05);
  } catch(e) {}
}

function sfxShootTrenchGun() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Layer 1: Initial blast — long white noise burst with lowpass (the "boom")
    const bufLen = Math.floor(actx.sampleRate * 0.35);
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.exp(-i / (bufLen * 0.08)); // fast attack, medium decay
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = actx.createBufferSource();
    noise.buffer = buf;
    const gN = actx.createGain();
    gN.gain.setValueAtTime(0.35, t);
    gN.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    const fN = actx.createBiquadFilter(); fN.type = 'lowpass'; fN.frequency.value = 1200; fN.Q.value = 1;
    noise.connect(fN); fN.connect(gN); gN.connect(masterGain); noise.start(t);
    
    // Layer 2: Deep concussive sub-bass thump
    const o1 = actx.createOscillator(), g1 = actx.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(120, t);
    o1.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    g1.gain.setValueAtTime(0.3, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o1.connect(g1); g1.connect(masterGain); o1.start(t); o1.stop(t + 0.4);
    
    // Layer 3: Mid-crack (shotgun "snap" - gives it that pellet spread feel)
    const bufSnap = Math.floor(actx.sampleRate * 0.05);
    const snapBuf = actx.createBuffer(1, bufSnap, actx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < bufSnap; i++) {
      snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSnap * 0.3));
    }
    const snapSrc = actx.createBufferSource(); snapSrc.buffer = snapBuf;
    const gSnap = actx.createGain();
    gSnap.gain.setValueAtTime(0.2, t);
    gSnap.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    const fSnap = actx.createBiquadFilter(); fSnap.type = 'bandpass'; fSnap.frequency.value = 3000; fSnap.Q.value = 2;
    snapSrc.connect(fSnap); fSnap.connect(gSnap); gSnap.connect(masterGain); snapSrc.start(t);
    
    // Layer 4: Metallic pump-action rattle (delayed — the iconic "chk-chk")
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'square'; o2.frequency.value = 350;
    g2.gain.setValueAtTime(0, t);
    g2.gain.setValueAtTime(0.08, t + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const fPump = actx.createBiquadFilter(); fPump.type = 'bandpass'; fPump.frequency.value = 2500; fPump.Q.value = 5;
    o2.connect(fPump); fPump.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t + 0.4);
    
    // Layer 5: Room reverb tail (echo/decay)
    const bufRev = Math.floor(actx.sampleRate * 0.5);
    const revBuf = actx.createBuffer(1, bufRev, actx.sampleRate);
    const revData = revBuf.getChannelData(0);
    for (let i = 0; i < bufRev; i++) {
      revData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufRev * 0.15));
    }
    const revSrc = actx.createBufferSource(); revSrc.buffer = revBuf;
    const gRev = actx.createGain();
    gRev.gain.setValueAtTime(0.08, t + 0.05);
    gRev.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const fRev = actx.createBiquadFilter(); fRev.type = 'lowpass'; fRev.frequency.value = 600;
    revSrc.connect(fRev); fRev.connect(gRev); gRev.connect(masterGain); revSrc.start(t);
  } catch(e) {}
}

function sfxRayGun() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;

    // Layer 1: Rising energy charge → sharp "PEW" discharge
    // Quick rising whine that snaps into a descending tone
    const pew = actx.createOscillator(), pewG = actx.createGain();
    pew.type = 'sine';
    pew.frequency.setValueAtTime(400, t);
    pew.frequency.exponentialRampToValueAtTime(3200, t + 0.03);  // fast rise
    pew.frequency.exponentialRampToValueAtTime(180, t + 0.3);    // long descend
    pewG.gain.setValueAtTime(0.22, t);
    pewG.gain.linearRampToValueAtTime(0.18, t + 0.03);
    pewG.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    pew.connect(pewG); pewG.connect(masterGain);
    pew.start(t); pew.stop(t + 0.35);

    // Layer 2: Electric crackle — filtered noise burst
    const crackLen = Math.floor(actx.sampleRate * 0.08);
    const crackBuf = actx.createBuffer(1, crackLen, actx.sampleRate);
    const cd = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.12));
    }
    const crack = actx.createBufferSource();
    crack.buffer = crackBuf;
    const crackBP = actx.createBiquadFilter();
    crackBP.type = 'bandpass'; crackBP.frequency.value = 4500; crackBP.Q.value = 2;
    const crackG = actx.createGain();
    crackG.gain.setValueAtTime(0.25, t);
    crackG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    crack.connect(crackBP); crackBP.connect(crackG); crackG.connect(masterGain);
    crack.start(t); crack.stop(t + 0.08);

    // Layer 3: Harmonic ring — the sci-fi "ray" resonance
    const ring = actx.createOscillator(), ringG = actx.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(1800, t + 0.02);
    ring.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    ringG.gain.setValueAtTime(0, t);
    ringG.gain.linearRampToValueAtTime(0.1, t + 0.025);
    ringG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    ring.connect(ringG); ringG.connect(masterGain);
    ring.start(t); ring.stop(t + 0.3);

    // Layer 4: Deep bass reverb thump — impact weight
    const bass = actx.createOscillator(), bassG = actx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(100, t + 0.01);
    bass.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    bassG.gain.setValueAtTime(0, t);
    bassG.gain.linearRampToValueAtTime(0.3, t + 0.02);
    bassG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    bass.connect(bassG); bassG.connect(masterGain);
    bass.start(t); bass.stop(t + 0.3);

    // Layer 5: High-freq sizzle tail — energy dissipation
    const sizzLen = Math.floor(actx.sampleRate * 0.2);
    const sizzBuf = actx.createBuffer(1, sizzLen, actx.sampleRate);
    const sd = sizzBuf.getChannelData(0);
    for (let i = 0; i < sizzLen; i++) {
      sd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sizzLen * 0.25));
    }
    const sizz = actx.createBufferSource();
    sizz.buffer = sizzBuf;
    const sizzHP = actx.createBiquadFilter();
    sizzHP.type = 'highpass'; sizzHP.frequency.value = 6000; sizzHP.Q.value = 0.5;
    const sizzG = actx.createGain();
    sizzG.gain.setValueAtTime(0.06, t + 0.03);
    sizzG.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    sizz.connect(sizzHP); sizzHP.connect(sizzG); sizzG.connect(masterGain);
    sizz.start(t + 0.03); sizz.stop(t + 0.25);
  } catch(e) {}
}

function sfxShoot() {
  // Route to weapon-specific sound
  const w = _weapons[_player.curWeapon];
  if (w.isRayGun) { sfxRayGun(); return; }
  switch(_player.curWeapon) {
    case 0: sfxShootM1911(); break;
    case 1: sfxShootMP40(); break;
    case 2: sfxShootTrenchGun(); break;
    default: sfxShootM1911(); break;
  }
}

// ===== WEAPON-SPECIFIC RELOAD SOUNDS =====
// ── Shared helpers for mechanical reload SFX ──
// Pre-allocated noise buffer for metallic transients (reused across calls)
let _reloadNoiseBuf = null;
function _getReloadNoise(dur) {
  const len = Math.floor(actx.sampleRate * dur);
  if (!_reloadNoiseBuf || _reloadNoiseBuf.length < len || _reloadNoiseBuf.sampleRate !== actx.sampleRate) {
    const bufLen = Math.floor(actx.sampleRate * 0.15); // max 150ms
    _reloadNoiseBuf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const d = _reloadNoiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  }
  return _reloadNoiseBuf;
}

// Metallic click/clack transient — the core of mechanical reload sounds
function _metalClick(startT, freq, bw, dur, vol) {
  const src = actx.createBufferSource();
  src.buffer = _getReloadNoise(dur);
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = bw;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, startT);
  g.gain.exponentialRampToValueAtTime(0.001, startT + dur);
  src.connect(bp); bp.connect(g); g.connect(masterGain);
  src.start(startT); src.stop(startT + dur);
}

// Low thud for mag drops, slide impacts
function _mechThud(startT, freq, dur, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, startT);
  o.frequency.exponentialRampToValueAtTime(freq * 0.4, startT + dur);
  g.gain.setValueAtTime(vol, startT);
  g.gain.exponentialRampToValueAtTime(0.001, startT + dur);
  o.connect(g); g.connect(masterGain); o.start(startT); o.stop(startT + dur);
}

function sfxReload() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    const w = _weapons[_player.curWeapon];
    if (w.isRayGun) {
      // ── Ray Gun: energy cell swap ──
      // 1) Cell disengage hum
      const o1 = actx.createOscillator(), g1 = actx.createGain();
      o1.type = 'sawtooth'; o1.frequency.setValueAtTime(180, t);
      o1.frequency.exponentialRampToValueAtTime(90, t + 0.25);
      g1.gain.setValueAtTime(0.06, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o1.connect(g1); g1.connect(masterGain); o1.start(t); o1.stop(t + 0.28);
      // 2) Cell click out
      _metalClick(t + 0.15, 2200, 6, 0.025, 0.07);
      // 3) New cell slide in
      _mechThud(t + 0.55, 140, 0.06, 0.05);
      _metalClick(t + 0.58, 1600, 4, 0.03, 0.06);
      // 4) Latch click
      _metalClick(t + 0.75, 3000, 8, 0.02, 0.08);
      // 5) Charge whine (rising sine + harmonic)
      const o2 = actx.createOscillator(), g2 = actx.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(280, t + 0.9);
      o2.frequency.exponentialRampToValueAtTime(1400, t + 1.8);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.05, t + 1.0);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      o2.connect(g2); g2.connect(masterGain); o2.start(t + 0.9); o2.stop(t + 1.9);
      // Harmonic overtone
      const o3 = actx.createOscillator(), g3 = actx.createGain();
      o3.type = 'sine';
      o3.frequency.setValueAtTime(560, t + 1.0);
      o3.frequency.exponentialRampToValueAtTime(2800, t + 1.8);
      g3.gain.setValueAtTime(0, t); g3.gain.linearRampToValueAtTime(0.02, t + 1.1);
      g3.gain.exponentialRampToValueAtTime(0.001, t + 1.85);
      o3.connect(g3); g3.connect(masterGain); o3.start(t + 1.0); o3.stop(t + 1.85);

    } else if (_player.curWeapon === 2) {
      // ── Trench Gun: pump-action reload ──
      // 1) Pump back (metallic scrape + thud)
      _metalClick(t, 800, 2, 0.06, 0.09);
      _mechThud(t + 0.02, 200, 0.05, 0.06);
      // 2) Pump forward (higher pitch snap)
      _metalClick(t + 0.12, 1100, 3, 0.05, 0.09);
      _mechThud(t + 0.14, 250, 0.04, 0.05);
      // 3) Shell loading clicks (staggered, varied pitch)
      const shellBase = 0.35;
      for (let s = 0; s < 4; s++) {
        const st = t + shellBase + s * 0.18;
        _metalClick(st, 1400 + Math.random() * 400, 5, 0.02, 0.06);
        _mechThud(st + 0.01, 160 + Math.random() * 60, 0.03, 0.03);
      }
      // 4) Final pump-lock
      _metalClick(t + 1.15, 1000, 3, 0.05, 0.08);
      _metalClick(t + 1.22, 1500, 5, 0.03, 0.07);
      _mechThud(t + 1.24, 180, 0.04, 0.05);

    } else if (_player.curWeapon === 1) {
      // ── MP40: magazine swap + bolt ──
      // 1) Mag release click
      _metalClick(t, 1800, 6, 0.02, 0.07);
      // 2) Mag slide out + drop thud
      _metalClick(t + 0.08, 600, 2, 0.06, 0.05);
      _mechThud(t + 0.15, 120, 0.08, 0.06);
      // 3) New mag slide in (scrape)
      _metalClick(t + 0.45, 700, 2, 0.07, 0.06);
      // 4) Mag seat click
      _metalClick(t + 0.62, 2200, 7, 0.02, 0.08);
      _mechThud(t + 0.63, 160, 0.04, 0.04);
      // 5) Bolt pull back
      _metalClick(t + 0.85, 900, 3, 0.05, 0.07);
      _mechThud(t + 0.87, 200, 0.04, 0.05);
      // 6) Bolt release forward
      _metalClick(t + 1.0, 1200, 4, 0.04, 0.08);
      _mechThud(t + 1.02, 250, 0.03, 0.06);

    } else {
      // ── M1911: mag drop, insert, slide rack ──
      // 1) Mag release button
      _metalClick(t, 2000, 6, 0.015, 0.06);
      // 2) Mag slide out + drop
      _metalClick(t + 0.06, 500, 2, 0.05, 0.05);
      _mechThud(t + 0.12, 100, 0.09, 0.06);
      // 3) New mag insert (slide + click)
      _metalClick(t + 0.4, 650, 2, 0.06, 0.05);
      _metalClick(t + 0.52, 2400, 8, 0.015, 0.08);
      _mechThud(t + 0.53, 180, 0.03, 0.04);
      // 4) Slide pull back
      _metalClick(t + 0.72, 1000, 3, 0.05, 0.07);
      _mechThud(t + 0.74, 220, 0.04, 0.05);
      // 5) Slide release (snappy forward)
      _metalClick(t + 0.85, 1400, 5, 0.03, 0.09);
      _mechThud(t + 0.86, 280, 0.03, 0.06);
    }
  } catch(e) {}
}

function sfxHit() { beep(300,'sine',0.06,0.1); }
function sfxKill() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Meaty crunch
    const o1 = actx.createOscillator(), g1 = actx.createGain();
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(180, t);
    o1.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o1.connect(g1); g1.connect(masterGain); o1.start(t); o1.stop(t + 0.2);
    // Body thud
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'sine'; o2.frequency.value = 40;
    g2.gain.setValueAtTime(0.12, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o2.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t + 0.2);
  } catch(e) {}
}

function sfxHurt() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Pain grunt: filtered noise burst
    const bufLen = actx.sampleRate * 0.2;
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
    }
    const noise = actx.createBufferSource();
    noise.buffer = buf;
    const gN = actx.createGain();
    gN.gain.setValueAtTime(0.1, t);
    gN.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const fN = actx.createBiquadFilter(); fN.type = 'bandpass'; fN.frequency.value = 600; fN.Q.value = 2;
    noise.connect(fN); fN.connect(gN); gN.connect(masterGain); noise.start(t);
    // Low grunt tone
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.18);
  } catch(e) {}
}

function sfxEmpty() { beep(800,'square',0.02,0.06); beep(600,'square',0.02,0.04); }

// ===== ROUND JINGLES (CoD Zombies style) =====
function sfxRound() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Rising tension notes
    const notes = [220, 262, 330, 440];
    notes.forEach((freq, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.15);
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.25);
      o.connect(g); g.connect(masterGain);
      o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.25);
    });
    // Final dramatic hit
    setTimeout(() => {
      beep(165, 'sawtooth', 0.4, 0.1);
      beep(110, 'sine', 0.5, 0.08);
    }, 700);
  } catch(e) {}
}

function sfxRoundEnd() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Descending "round complete" jingle
    const notes = [660, 550, 440, 550, 660, 880];
    notes.forEach((freq, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.07, t + i * 0.12 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.2);
      o.connect(g); g.connect(masterGain);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.2);
    });
    // Reverb-like tail
    setTimeout(() => {
      beep(440, 'triangle', 0.6, 0.04);
      beep(330, 'sine', 0.8, 0.03);
    }, 800);
  } catch(e) {}
}

// ===== ZOMBIE GROANING (procedural) =====
function sfxZombieGrunt() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    const baseFreq = 60 + Math.random() * 40;
    const dur = 0.4 + Math.random() * 0.5;
    // Guttural growl
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(baseFreq + 20, t);
    o.frequency.linearRampToValueAtTime(baseFreq - 10, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(baseFreq + 10 * Math.random(), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.03, t + 0.05);
    g.gain.setValueAtTime(0.04, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 350 + Math.random() * 200; f.Q.value = 3 + Math.random() * 4;
    o.connect(f); f.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + dur);
    // Vocal formant layer
    if (Math.random() < 0.5) {
      const o2 = actx.createOscillator(), g2 = actx.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(180 + Math.random() * 80, t);
      o2.frequency.linearRampToValueAtTime(120 + Math.random() * 60, t + dur * 0.8);
      g2.gain.setValueAtTime(0.02, t + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
      const f2 = actx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 300 + Math.random() * 200; f2.Q.value = 5;
      o2.connect(f2); f2.connect(g2); g2.connect(masterGain);
      o2.start(t); o2.stop(t + dur);
    }
  } catch(e) {}
}

function sfxZombieAttack() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Aggressive snarl
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(100 + Math.random()*50, t);
    o.frequency.exponentialRampToValueAtTime(60 + Math.random()*30, t + 0.4);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 6;
    o.connect(f); f.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.5);
    // Bite snap
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'square';
    o2.frequency.setValueAtTime(300 + Math.random()*200, t);
    o2.frequency.exponentialRampToValueAtTime(150, t + 0.15);
    g2.gain.setValueAtTime(0.06, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const f2 = actx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 400; f2.Q.value = 3;
    o2.connect(f2); f2.connect(g2); g2.connect(masterGain); o2.start(t); o2.stop(t + 0.2);
    // Wet impact
    const bufLen = actx.sampleRate * 0.08;
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
    const noise = actx.createBufferSource(); noise.buffer = buf;
    const gN = actx.createGain();
    gN.gain.setValueAtTime(0.08, t + 0.1);
    gN.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const fN = actx.createBiquadFilter(); fN.type = 'lowpass'; fN.frequency.value = 600;
    noise.connect(fN); fN.connect(gN); gN.connect(masterGain); noise.start(t + 0.1);
  } catch(e) {}
}

// ===== AMBIENT HORROR SOUNDS =====
function playAmbientWind() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    const dur = 2 + Math.random() * 3;
    // Wind howl using filtered noise
    const bufLen = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.sin((i / bufLen) * Math.PI); // fade in and out
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = actx.createBufferSource(); noise.buffer = buf;
    const gN = actx.createGain();
    gN.gain.value = 0.015 + Math.random() * 0.01;
    const f = actx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(200 + Math.random() * 300, t);
    f.frequency.linearRampToValueAtTime(100 + Math.random() * 200, t + dur);
    f.Q.value = 1.5 + Math.random() * 2;
    noise.connect(f); f.connect(gN); gN.connect(masterGain); noise.start(t);
  } catch(e) {}
}

function playDistantScream() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Distant echoing scream
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    const baseF = 600 + Math.random() * 400;
    o.frequency.setValueAtTime(baseF, t);
    o.frequency.linearRampToValueAtTime(baseF * 1.3, t + 0.2);
    o.frequency.linearRampToValueAtTime(baseF * 0.6, t + 0.8);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.1);
    g.gain.setValueAtTime(0.02, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    const f = actx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 2;
    // Add reverb-like delay
    const delay = actx.createDelay(1);
    delay.delayTime.value = 0.3;
    const fbGain = actx.createGain(); fbGain.gain.value = 0.3;
    const dryGain = actx.createGain(); dryGain.gain.value = 1;
    const wetGain = actx.createGain(); wetGain.gain.value = 0.4;
    o.connect(f); f.connect(g);
    g.connect(dryGain); dryGain.connect(masterGain);
    g.connect(delay); delay.connect(fbGain); fbGain.connect(delay);
    delay.connect(wetGain); wetGain.connect(masterGain);
    o.start(t); o.stop(t + 1.2);
  } catch(e) {}
}

function playDrip() {
  // Slow dripping water — horror ambience during quiet moments
  if (!actx || !masterGain) return;
  try {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const delay = i * (0.18 + Math.random() * 0.25);
      const t = actx.currentTime + delay;
      // Plonk: short sine blip with fast decay
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      const pitch = 900 + Math.random() * 600; // each drip slightly different
      o.frequency.setValueAtTime(pitch * 1.4, t);
      o.frequency.exponentialRampToValueAtTime(pitch, t + 0.04);
      g.gain.setValueAtTime(0.022, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      const filt = actx.createBiquadFilter();
      filt.type = 'peaking'; filt.frequency.value = pitch; filt.gain.value = 8; filt.Q.value = 6;
      o.connect(filt); filt.connect(g); g.connect(masterGain);
      o.start(t); o.stop(t + 0.2);
      // Tiny splash tail
      const splashLen = Math.floor(actx.sampleRate * 0.06);
      const splashBuf = actx.createBuffer(1, splashLen, actx.sampleRate);
      const sd = splashBuf.getChannelData(0);
      for (let j = 0; j < splashLen; j++) sd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (splashLen * 0.12));
      const splash = actx.createBufferSource(); splash.buffer = splashBuf;
      const splashHP = actx.createBiquadFilter(); splashHP.type = 'highpass'; splashHP.frequency.value = 2000;
      const splashG = actx.createGain(); splashG.gain.setValueAtTime(0.012, t + 0.03);
      splashG.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      splash.connect(splashHP); splashHP.connect(splashG); splashG.connect(masterGain); splash.start(t + 0.03);
    }
  } catch(e) {}
}

function playDistantHorde() {
  // A crowd of distant zombies moaning — layered detuned oscillators
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    const layers = 4 + Math.floor(Math.random() * 3); // 4–6 voices
    for (let i = 0; i < layers; i++) {
      const baseF = 55 + Math.random() * 50;
      const dur = 1.2 + Math.random() * 1.5;
      const startOff = Math.random() * 0.4;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(baseF + Math.random() * 15, t + startOff);
      o.frequency.linearRampToValueAtTime(baseF - 8 + Math.random() * 20, t + startOff + dur * 0.6);
      o.frequency.linearRampToValueAtTime(baseF + Math.random() * 10, t + startOff + dur);
      g.gain.setValueAtTime(0, t + startOff);
      g.gain.linearRampToValueAtTime(0.008 + Math.random() * 0.006, t + startOff + 0.15);
      g.gain.setValueAtTime(0.007, t + startOff + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, t + startOff + dur);
      const filt = actx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 280 + Math.random() * 180; filt.Q.value = 2 + Math.random() * 3;
      // Heavy lowpass + gentle reverb via delay
      const delay = actx.createDelay(0.5);
      delay.delayTime.value = 0.22 + Math.random() * 0.15;
      const fbG = actx.createGain(); fbG.gain.value = 0.25;
      const wetG = actx.createGain(); wetG.gain.value = 0.35;
      o.connect(filt); filt.connect(g); g.connect(masterGain);
      g.connect(delay); delay.connect(fbG); fbG.connect(delay);
      delay.connect(wetG); wetG.connect(masterGain);
      o.start(t + startOff); o.stop(t + startOff + dur + 0.3);
      // Disconnect delay sub-graph after tail fully decays (~2.5s after osc stops)
      const cleanMs = (startOff + dur + 0.3 + 3.5) * 1000;
      setTimeout(() => { try { filt.disconnect(); delay.disconnect(); fbG.disconnect(); wetG.disconnect(); } catch(_){} }, cleanMs);
    }
  } catch(e) {}
}

function playMetalCreak() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    const f0 = 300 + Math.random() * 400;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 0.3);
    o.frequency.linearRampToValueAtTime(f0 * 1.1, t + 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.015, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    const f = actx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 300; f.Q.value = 8;
    o.connect(f); f.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + 0.8);
  } catch(e) {}
}

function updateAmbientSounds(dt, zombies, state, paused) {
  if (!actx || !masterGain || state === 'menu' || state === 'dead' || paused) return;

  const isBetweenRounds = state === 'roundIntro';

  // Random ambient events — drips more frequent between rounds
  ambientTimer -= dt;
  if (ambientTimer <= 0) {
    const roll = Math.random();
    if (isBetweenRounds) {
      // Between rounds: eerie quiet — drips, creaks, distant horde
      if (roll < 0.40) playDrip();
      else if (roll < 0.65) playMetalCreak();
      else if (roll < 0.85) playDistantHorde();
      else playAmbientWind();
      ambientTimer = 2.5 + Math.random() * 5; // slightly more frequent in silence
    } else {
      // During combat: wind, distant horde, metal creaks (no drips — too quiet)
      if (roll < 0.35) playAmbientWind();
      else if (roll < 0.60) playDistantHorde();
      else if (roll < 0.75) playMetalCreak();
      // else: silence — adds unpredictability
      ambientTimer = 4 + Math.random() * 8;
    }
  }

  // Zombie groans (proximity-based — nearby zombies groan more)
  zombieGroanTimer -= dt;
  if (zombieGroanTimer <= 0 && zombies && zombies.length > 0) {
    let closestDist = Infinity;
    for (const z of zombies) {
      const d = Math.hypot(z.wx - _camera.position.x, z.wz - _camera.position.z);
      if (d < closestDist) closestDist = d;
    }
    if (closestDist < 20) sfxZombieGrunt();
    const distFactor = Math.min(closestDist / 15, 1);
    zombieGroanTimer = 1.5 + distFactor * 5 + Math.random() * 3;
  }
}

// ===== BACKGROUND MUSIC =====
function startBackgroundMusic() {
  if (!actx || !masterGain || bgMusicStarted) return;
  bgMusicStarted = true;
  // Deep bass drone
  const o1 = actx.createOscillator(), g1 = actx.createGain();
  o1.type = 'sawtooth'; o1.frequency.value = 42; g1.gain.value = 0.012;
  o1.connect(g1); g1.connect(masterGain); o1.start(); bgGains.push(g1); bgNodes.push(o1);
  // Creepy wobble
  const o2 = actx.createOscillator(), g2 = actx.createGain();
  o2.type = 'sine'; o2.frequency.value = 380; g2.gain.value = 0.005;
  const lfo = actx.createOscillator(), lfoG = actx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 0.3; lfoG.gain.value = 25;
  lfo.connect(lfoG); lfoG.connect(o2.frequency); lfo.start();
  o2.connect(g2); g2.connect(masterGain); o2.start(); bgGains.push(g2); bgNodes.push(o2, lfo);
  // Wind noise
  const o3 = actx.createOscillator(), g3 = actx.createGain();
  o3.type = 'sawtooth'; o3.frequency.value = 95; g3.gain.value = 0.006;
  const filt = actx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 200; filt.Q.value = 3;
  o3.connect(filt); filt.connect(g3); g3.connect(masterGain); o3.start(); bgGains.push(g3); bgNodes.push(o3);
  // Eerie pad
  const o4 = actx.createOscillator(), g4 = actx.createGain();
  o4.type = 'triangle'; o4.frequency.value = 165; g4.gain.value = 0.005;
  const lfo2 = actx.createOscillator(), lfo2G = actx.createGain();
  lfo2.type = 'sine'; lfo2.frequency.value = 0.08; lfo2G.gain.value = 0.012;
  lfo2.connect(lfo2G); lfo2G.connect(g4.gain); lfo2.start();
  o4.connect(g4); g4.connect(masterGain); o4.start(); bgGains.push(g4); bgNodes.push(o4, lfo2);
}

// ===== PURCHASE SOUNDS =====
function sfxBuyWeapon(isRayGun) {
  if (!actx || !masterGain) return;
  if (isRayGun) {
    beep(800,'sine',0.15,0.15); setTimeout(()=>beep(1200,'sine',0.15,0.15),100);
    setTimeout(()=>beep(1600,'sine',0.2,0.12),200);
  } else {
    beep(600,'sine',0.08,0.12); setTimeout(()=>beep(900,'sine',0.08,0.12),100);
  }
}

function sfxBuyPerk() {
  if (!actx || !masterGain) return;
  // Bottle cap pop + fizz + jingle
  const t = actx.currentTime;
  try {
    // Pop
    beep(1200, 'square', 0.02, 0.1);
    // Fizz (noise burst)
    const bufLen = actx.sampleRate * 0.3;
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.4));
    const noise = actx.createBufferSource(); noise.buffer = buf;
    const gN = actx.createGain(); gN.gain.value = 0.03;
    const fN = actx.createBiquadFilter(); fN.type = 'highpass'; fN.frequency.value = 3000;
    noise.connect(fN); fN.connect(gN); gN.connect(masterGain); noise.start(t + 0.05);
  } catch(e) {}
  // Jingle
  setTimeout(() => beep(400,'sine',0.1,0.08), 150);
  setTimeout(() => beep(500,'sine',0.1,0.08), 230);
  setTimeout(() => beep(600,'sine',0.1,0.08), 310);
  setTimeout(() => beep(800,'sine',0.15,0.1), 390);
}

function sfxDoorOpen() {
  if (!actx || !masterGain) return;
  // Heavy metal grind + bang
  try {
    const t = actx.currentTime;
    // Metal scraping
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(80, t + 0.6);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 250; f.Q.value = 4;
    o.connect(f); f.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.7);
    // Heavy thud
    setTimeout(() => beep(50, 'sine', 0.3, 0.15), 500);
    setTimeout(() => beep(35, 'sine', 0.4, 0.1), 550);
  } catch(e) {}
}

function sfxBossKill() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Dramatic boss death: explosion + victory sting
    // Explosion
    const bufLen = actx.sampleRate * 0.5;
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    const noise = actx.createBufferSource(); noise.buffer = buf;
    const gN = actx.createGain(); gN.gain.value = 0.15;
    const fN = actx.createBiquadFilter(); fN.type = 'lowpass'; fN.frequency.value = 400;
    noise.connect(fN); fN.connect(gN); gN.connect(masterGain); noise.start(t);
    // Bass boom
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.6);
    // Victory sting (delayed)
    setTimeout(() => {
      beep(440, 'triangle', 0.15, 0.08);
      setTimeout(() => beep(554, 'triangle', 0.15, 0.08), 120);
      setTimeout(() => beep(660, 'triangle', 0.2, 0.1), 240);
      setTimeout(() => beep(880, 'sine', 0.4, 0.08), 360);
    }, 400);
  } catch(e) {}
}

function sfxPlayerDeath() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Heartbeat slowing
    for (let i = 0; i < 3; i++) {
      const delay = i * (0.5 + i * 0.15);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = 50 - i * 5;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.12 - i * 0.03, t + delay + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
      o.connect(g); g.connect(masterGain); o.start(t + delay); o.stop(t + delay + 0.3);
    }
    // Flatline tone (delayed)
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'sine'; o2.frequency.value = 880;
    g2.gain.setValueAtTime(0, t + 1.5);
    g2.gain.linearRampToValueAtTime(0.06, t + 1.7);
    g2.gain.setValueAtTime(0.06, t + 3);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    o2.connect(g2); g2.connect(masterGain); o2.start(t + 1.5); o2.stop(t + 3.5);
  } catch(e) {}
}

// Pre-allocated shuffle noise buffer — created once on first use, reused every call
let _shuffleBuf = null;
function _getShuffleBuf() {
  if (_shuffleBuf && _shuffleBuf.sampleRate === actx.sampleRate) return _shuffleBuf;
  const bufLen = Math.floor(actx.sampleRate * 0.12);
  _shuffleBuf = actx.createBuffer(1, bufLen, actx.sampleRate);
  const d = _shuffleBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.4));
  return _shuffleBuf;
}

function sfxZombieShuffle(distFrac) {
  // Dragging foot shuffle — quieter at distance (distFrac 0=close, 1=far)
  if (!actx || !masterGain) return;
  try {
    const vol = (1 - distFrac * 0.85) * 0.045; // 0.045 close → 0.00675 at distFrac=1
    if (vol < 0.012) return; // effective cutoff at ~distFrac > 0.86 (~d > 15.5 units)
    const t = actx.currentTime;
    // Drag scrape — low bandpass noise (reused pre-allocated buffer)
    const src = actx.createBufferSource(); src.buffer = _getShuffleBuf();
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180 + Math.random() * 120; f.Q.value = 1.5;
    const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(masterGain); src.start(t);
    // Optional light thud on every other step
    if (Math.random() < 0.5) {
      const o = actx.createOscillator(), og = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.06);
      og.gain.setValueAtTime(vol * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(og); og.connect(masterGain); o.start(t); o.stop(t + 0.07);
    }
  } catch(e) {}
}

function sfxFootstep() {
  // Concrete footstep — low thud + scuff
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;
    // Layer 1: Impact thud — short sine punch
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90 + Math.random() * 20, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.07);
    g.gain.setValueAtTime(0.08 + Math.random() * 0.02, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.1);
    // Layer 2: Scuff — brief bandpass noise burst
    const bufLen = Math.floor(actx.sampleRate * 0.055);
    const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400 + Math.random() * 200; f.Q.value = 2;
    const gN = actx.createGain(); gN.gain.setValueAtTime(0.035, t + 0.01); gN.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f); f.connect(gN); gN.connect(masterGain); src.start(t + 0.01);
  } catch(e) {}
}

function sfxWeaponSwitch() {
  if (!actx || !masterGain) return;
  beep(500, 'square', 0.02, 0.05);
  setTimeout(() => beep(700, 'square', 0.02, 0.05), 60);
}

function sfxKnife() {
  if (!actx || !masterGain) return;
  const t = actx.currentTime;

  // Layer 1: Sharp blade "shink" — fast filtered noise with aggressive attack
  const bladeLen = Math.floor(actx.sampleRate * 0.06);
  const bladeBuf = actx.createBuffer(1, bladeLen, actx.sampleRate);
  const bd = bladeBuf.getChannelData(0);
  for (let i = 0; i < bladeLen; i++) {
    const env = Math.exp(-i / (bladeLen * 0.15)); // very fast exponential decay
    bd[i] = (Math.random() * 2 - 1) * env;
  }
  const blade = actx.createBufferSource();
  blade.buffer = bladeBuf;
  const bladeHP = actx.createBiquadFilter();
  bladeHP.type = 'highpass'; bladeHP.frequency.value = 4000; bladeHP.Q.value = 1;
  const bladePeak = actx.createBiquadFilter();
  bladePeak.type = 'peaking'; bladePeak.frequency.value = 7000; bladePeak.gain.value = 12; bladePeak.Q.value = 3;
  const bladeG = actx.createGain();
  bladeG.gain.setValueAtTime(0.5, t);
  bladeG.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  blade.connect(bladeHP); bladeHP.connect(bladePeak); bladePeak.connect(bladeG); bladeG.connect(masterGain);
  blade.start(t); blade.stop(t + 0.06);

  // Layer 2: Metallic scrape — fast downward sweep square wave
  const scrape = actx.createOscillator();
  scrape.type = 'square';
  scrape.frequency.setValueAtTime(3500, t);
  scrape.frequency.exponentialRampToValueAtTime(800, t + 0.04);
  const scrapeFilter = actx.createBiquadFilter();
  scrapeFilter.type = 'bandpass'; scrapeFilter.frequency.value = 2500; scrapeFilter.Q.value = 2;
  const scrapeG = actx.createGain();
  scrapeG.gain.setValueAtTime(0.08, t);
  scrapeG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  scrape.connect(scrapeFilter); scrapeFilter.connect(scrapeG); scrapeG.connect(masterGain);
  scrape.start(t); scrape.stop(t + 0.05);

  // Layer 3: Quick whoosh — shaped noise for air movement
  const whooshLen = Math.floor(actx.sampleRate * 0.1);
  const whooshBuf = actx.createBuffer(1, whooshLen, actx.sampleRate);
  const wd = whooshBuf.getChannelData(0);
  for (let i = 0; i < whooshLen; i++) {
    const p = i / whooshLen;
    const env = Math.sin(p * Math.PI) * (1 - p * 0.5); // bell shape, biased early
    wd[i] = (Math.random() * 2 - 1) * env;
  }
  const whoosh = actx.createBufferSource();
  whoosh.buffer = whooshBuf;
  const whooshBP = actx.createBiquadFilter();
  whooshBP.type = 'bandpass'; whooshBP.frequency.setValueAtTime(1500, t);
  whooshBP.frequency.linearRampToValueAtTime(3000, t + 0.04);
  whooshBP.frequency.linearRampToValueAtTime(800, t + 0.1);
  whooshBP.Q.value = 0.8;
  const whooshG = actx.createGain();
  whooshG.gain.setValueAtTime(0.2, t);
  whooshG.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  whoosh.connect(whooshBP); whooshBP.connect(whooshG); whooshG.connect(masterGain);
  whoosh.start(t); whoosh.stop(t + 0.1);

  // Layer 4: Sub impact punch — tight sine thump on hit
  const punch = actx.createOscillator();
  punch.type = 'sine';
  punch.frequency.setValueAtTime(120, t + 0.01);
  punch.frequency.exponentialRampToValueAtTime(35, t + 0.08);
  const punchG = actx.createGain();
  punchG.gain.setValueAtTime(0, t);
  punchG.gain.linearRampToValueAtTime(0.3, t + 0.015);
  punchG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  punch.connect(punchG); punchG.connect(masterGain);
  punch.start(t); punch.stop(t + 0.08);
}

function sfxKnifeMiss() {
  if (!actx || !masterGain) return;
  const t = actx.currentTime;

  // Layer 1: Fast air whoosh — sweeping bandpass noise
  const whooshLen = Math.floor(actx.sampleRate * 0.14);
  const whooshBuf = actx.createBuffer(1, whooshLen, actx.sampleRate);
  const wd = whooshBuf.getChannelData(0);
  for (let i = 0; i < whooshLen; i++) {
    const p = i / whooshLen;
    const env = Math.sin(p * Math.PI) * Math.exp(-p * 2);
    wd[i] = (Math.random() * 2 - 1) * env;
  }
  const whoosh = actx.createBufferSource();
  whoosh.buffer = whooshBuf;
  const whooshBP = actx.createBiquadFilter();
  whooshBP.type = 'bandpass';
  whooshBP.frequency.setValueAtTime(1000, t);
  whooshBP.frequency.linearRampToValueAtTime(4000, t + 0.05);
  whooshBP.frequency.linearRampToValueAtTime(600, t + 0.14);
  whooshBP.Q.value = 1.2;
  const whooshG = actx.createGain();
  whooshG.gain.setValueAtTime(0.18, t);
  whooshG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  whoosh.connect(whooshBP); whooshBP.connect(whooshG); whooshG.connect(masterGain);
  whoosh.start(t); whoosh.stop(t + 0.14);

  // Layer 2: Subtle blade whistle — high sine sweep
  const whistle = actx.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.setValueAtTime(2800, t);
  whistle.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
  const whistleG = actx.createGain();
  whistleG.gain.setValueAtTime(0.04, t);
  whistleG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  whistle.connect(whistleG); whistleG.connect(masterGain);
  whistle.start(t); whistle.stop(t + 0.08);
}


// ===== ZOMBIE SPAWN SOUND (rising from ground) =====
function sfxZombieSpawn() {
  if (!actx || !masterGain) return;
  try {
    const t = actx.currentTime;

    // Layer 1: Deep earth rumble — sub bass rising
    const rumbleOsc = actx.createOscillator();
    const rumbleGain = actx.createGain();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(25, t);
    rumbleOsc.frequency.linearRampToValueAtTime(60, t + 1.0);
    rumbleGain.gain.setValueAtTime(0, t);
    rumbleGain.gain.linearRampToValueAtTime(0.08, t + 0.3);
    rumbleGain.gain.setValueAtTime(0.06, t + 0.8);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(t); rumbleOsc.stop(t + 1.4);

    // Layer 2: Dirt crumble — filtered noise burst
    const bufLen = actx.sampleRate * 1.2;
    const noiseBuf = actx.createBuffer(1, bufLen, actx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.5;
    const noiseSrc = actx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseFilter = actx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(200, t);
    noiseFilter.frequency.linearRampToValueAtTime(800, t + 0.6);
    noiseFilter.Q.value = 1.5;
    const noiseGain = actx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.06, t + 0.15);
    noiseGain.gain.setValueAtTime(0.04, t + 0.7);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t); noiseSrc.stop(t + 1.2);

    // Layer 3: Rising moan — zombie's first groan as it emerges
    const moanOsc = actx.createOscillator();
    const moanGain = actx.createGain();
    const moanFilter = actx.createBiquadFilter();
    moanOsc.type = 'sawtooth';
    moanOsc.frequency.setValueAtTime(50 + Math.random() * 20, t + 0.4);
    moanOsc.frequency.linearRampToValueAtTime(90 + Math.random() * 40, t + 1.2);
    moanFilter.type = 'lowpass';
    moanFilter.frequency.setValueAtTime(200, t + 0.4);
    moanFilter.frequency.linearRampToValueAtTime(500, t + 1.0);
    moanFilter.Q.value = 4;
    moanGain.gain.setValueAtTime(0, t + 0.4);
    moanGain.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.02, t + 0.7);
    moanGain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    moanOsc.connect(moanFilter);
    moanFilter.connect(moanGain);
    moanGain.connect(masterGain);
    moanOsc.start(t + 0.4); moanOsc.stop(t + 1.3);
  } catch(e) { console.warn('sfxZombieSpawn:', e); }
}

// Export all audio functions and state
export {
  actx, masterGain, muted,
  initAudio, toggleMute,
  beep, sfxShoot, sfxReload, sfxHit, sfxKill, sfxHurt, sfxEmpty,
  sfxShootM1911, sfxShootMP40, sfxShootTrenchGun, sfxRayGun,
  sfxRound, sfxRoundEnd, sfxBuyWeapon, sfxBuyPerk, sfxDoorOpen,
  sfxZombieShuffle, sfxFootstep, sfxWeaponSwitch, sfxZombieAttack, sfxZombieGrunt, sfxBossKill,
  sfxPlayerDeath, sfxKnife, sfxKnifeMiss,
  sfxZombieSpawn,
  startBackgroundMusic, updateAmbientSounds,
  playAmbientWind, playDistantScream, playDistantHorde, playMetalCreak, playDrip
};
