// 5-second SP opening cinematic.
//
// Camera dollies along a Catmull-Rom spline through the bunker from a
// near-ceiling vantage down to the normal FP spawn pose, with letterbox
// bars, a radio-chatter subtitle, distant zombie groans accelerating
// over the run, and one horde swell at the halfway point.
//
// Plays once per page load on a fresh SP start (gated by main.js —
// MP, portal resume, and FIGHT AGAIN after death all skip it).
//
// Any key / click / explicit SKIP button exits after a small 0.2s grace
// (stops accidental menu-click key-ups from insta-skipping).
//
// Wiring from main.js:
//   import { initIntro, startIntro, updateIntro, endIntro,
//            isIntroActive, getIntroTimer } from './ui/intro.js';
//   initIntro({ camera, controls, onEnd: () => nextRound(),
//               getGunGroup: () => gunGroup });
//   // in initGame when a fresh SP start is detected:
//   state = 'intro'; startIntro();
//   // in the game loop when state === 'intro':
//   updateIntro(dt);
//   // in key/click handlers:
//   if (isIntroActive() && getIntroTimer() > 0.2) endIntro();

import { sfxZombieIdle, playDistantHorde } from '../audio/index.js';

const INTRO_DURATION = 5.0;
// Spline keyframes. Stay BELOW the ceiling (world y=3.2) so we never
// render through the roof. Land at the SP spawn pose (50, 1.6, 50)
// looking along +Z into the main arena. Also exported so the preload
// shader-warm pass in main.js can render a hidden frame at each pose
// to pre-compile the material programs the intro will walk through.
export const INTRO_KEYFRAMES = [
  // t=0    : near ceiling, offset to one side, looking inward
  { t: 0.00, x: 40, y: 2.9, z: 38, yaw: 0.55, pitch: -0.22 },
  // t=0.25 : slide toward spawn, tilt up a bit
  { t: 0.25, x: 45, y: 2.5, z: 42, yaw: 0.35, pitch: -0.15 },
  // t=0.65 : mid-trek, almost player height
  { t: 0.65, x: 49, y: 1.9, z: 47, yaw: 0.12, pitch: -0.05 },
  // t=1    : lands on normal FP spawn pose
  { t: 1.00, x: 50, y: 1.6, z: 50, yaw: 0.0, pitch: 0.0 },
];

let _camera = null;
let _controls = null;
let _getGunGroup = () => null;
let _onEnd = () => {};

let _active = false;
let _timer = 0;
let _groanTimer = 0;
let _prevHudHidden = false;

let _subtitleEl = null;
let _letterboxEl = null;
let _skipHintEl = null;

export function initIntro(ctx) {
  _camera = ctx.camera;
  _controls = ctx.controls;
  _getGunGroup = ctx.getGunGroup || (() => null);
  _onEnd = ctx.onEnd || (() => {});
}

export function isIntroActive() { return _active; }
export function getIntroTimer() { return _timer; }

// Catmull-Rom spline interpolation across ALL keyframes so velocity is
// continuous through every waypoint (no stop/start between segments).
// A single global slow-in/slow-out ease wraps the whole dolly.
function _catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}
function _introLerp(tNorm) {
  const tEased = tNorm * tNorm * (3 - 2 * tNorm);
  const K = INTRO_KEYFRAMES;
  let i = 0;
  for (let j = 0; j < K.length - 1; j++) {
    if (tEased >= K[j].t && tEased <= K[j + 1].t) { i = j; break; }
    if (j === K.length - 2) i = j;
  }
  const a = K[i], b = K[i + 1];
  const localT = (tEased - a.t) / (b.t - a.t || 1);
  // Phantom endpoints so the curve doesn't overshoot at the ends.
  const p0 = K[i - 1] || a;
  const p3 = K[i + 2] || b;
  return {
    x:     _catmullRom(p0.x,     a.x,     b.x,     p3.x,     localT),
    y:     _catmullRom(p0.y,     a.y,     b.y,     p3.y,     localT),
    z:     _catmullRom(p0.z,     a.z,     b.z,     p3.z,     localT),
    yaw:   _catmullRom(p0.yaw,   a.yaw,   b.yaw,   p3.yaw,   localT),
    pitch: _catmullRom(p0.pitch, a.pitch, b.pitch, p3.pitch, localT),
  };
}

function _buildDom() {
  if (_subtitleEl) return;
  // Subtitle line in lower third — large, glowing, hard to miss
  _subtitleEl = document.createElement('div');
  _subtitleEl.id = 'introSubtitle';
  _subtitleEl.style.cssText = `
    position:fixed;left:50%;bottom:25%;transform:translateX(-50%);
    z-index:120;pointer-events:none;font-family:'Courier New',monospace;
    color:#cfe9ff;letter-spacing:4px;font-size:clamp(16px,2.5vw,26px);
    text-align:center;text-shadow:0 0 14px rgba(68,170,255,0.85),0 0 28px rgba(0,0,0,0.95);
    opacity:0;transition:opacity 0.45s ease-in-out;max-width:90vw;font-weight:bold`;
  document.body.appendChild(_subtitleEl);
  // Cinematic letterbox bars — top and bottom, fade in fast, fade out at end
  _letterboxEl = document.createElement('div');
  _letterboxEl.id = 'introLetterbox';
  _letterboxEl.style.cssText = `
    position:fixed;inset:0;pointer-events:none;z-index:118;opacity:0;
    transition:opacity 0.4s ease-in-out;
    background:linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 10%,
      rgba(0,0,0,0) 90%, rgba(0,0,0,1) 90%, rgba(0,0,0,1) 100%)`;
  document.body.appendChild(_letterboxEl);
  // Clickable SKIP button. Any key also skips, but the explicit button
  // is the obvious escape hatch for players who don't realise the mouse
  // can't turn during the intro and want out.
  _skipHintEl = document.createElement('button');
  _skipHintEl.id = 'introSkipHint';
  _skipHintEl.style.cssText = `
    position:fixed;right:20px;bottom:20px;z-index:122;
    font:bold 12px 'Courier New',monospace;color:rgba(255,255,255,0.85);
    background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.35);
    padding:8px 16px;letter-spacing:2px;cursor:pointer;
    opacity:0;transition:opacity 0.4s ease-in, background 0.15s, border-color 0.15s`;
  _skipHintEl.textContent = 'SKIP INTRO  [ANY KEY]';
  _skipHintEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_active) endIntro();
  });
  _skipHintEl.addEventListener('mouseenter', () => {
    _skipHintEl.style.background = 'rgba(200,0,0,0.7)';
    _skipHintEl.style.borderColor = 'rgba(255,255,255,0.85)';
  });
  _skipHintEl.addEventListener('mouseleave', () => {
    _skipHintEl.style.background = 'rgba(0,0,0,0.55)';
    _skipHintEl.style.borderColor = 'rgba(255,255,255,0.35)';
  });
  document.body.appendChild(_skipHintEl);
}

export function startIntro() {
  console.log('[intro] cinematic starting');
  _active = true;
  _timer = 0;
  _groanTimer = 0;
  _buildDom();
  // Hide HUD during intro
  const hud = document.getElementById('hud');
  _prevHudHidden = hud.classList.contains('hidden');
  hud.classList.add('hidden');
  // Letterbox bars + skip hint visible immediately
  if (_letterboxEl) _letterboxEl.style.opacity = '1';
  if (_skipHintEl) _skipHintEl.style.opacity = '1';
  // Position camera at first keyframe immediately
  const kf0 = INTRO_KEYFRAMES[0];
  _camera.position.set(kf0.x, kf0.y, kf0.z);
  _controls._yaw = kf0.yaw;
  _controls._pitch = kf0.pitch;
  _controls._applyRotation();
  // Hide gun during intro (restored on end)
  const gun = _getGunGroup();
  if (gun) gun.visible = false;
}

export function endIntro() {
  if (!_active) return;
  console.log('[intro] cinematic ending');
  _active = false;
  // Clear subtitle + letterbox + skip hint
  if (_subtitleEl) _subtitleEl.style.opacity = '0';
  if (_letterboxEl) _letterboxEl.style.opacity = '0';
  if (_skipHintEl) _skipHintEl.style.opacity = '0';
  // Restore HUD visibility
  if (!_prevHudHidden) document.getElementById('hud').classList.remove('hidden');
  // Restore gun visibility (updateGunModel will re-toggle individual models)
  const gun = _getGunGroup();
  if (gun) gun.visible = true;
  // Snap camera to final pose — the onEnd callback (nextRound) will
  // hand off to the playing state
  const kfEnd = INTRO_KEYFRAMES[INTRO_KEYFRAMES.length - 1];
  _camera.position.set(kfEnd.x, kfEnd.y, kfEnd.z);
  _controls._yaw = kfEnd.yaw;
  _controls._pitch = kfEnd.pitch;
  _controls._applyRotation();
  try { _onEnd(); } catch (e) { console.error('[intro] onEnd threw', e); }
}

export function updateIntro(dt) {
  if (!_active) return;
  _timer += dt;
  const tNorm = Math.min(1, _timer / INTRO_DURATION);
  const pose = _introLerp(tNorm);
  _camera.position.set(pose.x, pose.y, pose.z);
  _controls._yaw = pose.yaw;
  _controls._pitch = pose.pitch;
  _controls._applyRotation();
  // Subtitle timeline
  if (_subtitleEl) {
    if (_timer < 1.0) {
      _subtitleEl.textContent = '[ RADIO ] ...static...';
      _subtitleEl.style.opacity = '0.6';
    } else if (_timer < 3.0) {
      _subtitleEl.textContent = '[ COMMAND ] We have a situation.';
      _subtitleEl.style.opacity = '1';
    } else if (_timer < 4.5) {
      _subtitleEl.textContent = 'Survivor, you are our last hope.';
      _subtitleEl.style.opacity = '1';
    } else {
      _subtitleEl.style.opacity = '0';
    }
  }
  // Distant zombie idle sounds, accelerating over the run. sfxZombieIdle
  // is positional — seed with a random offset each fire so it sounds
  // like a zombie ~15 units away from the camera rather than a
  // stationary loop.
  _groanTimer -= dt;
  if (_groanTimer <= 0) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 15;
    const zx = _camera.position.x + Math.cos(angle) * dist;
    const zz = _camera.position.z + Math.sin(angle) * dist;
    try { sfxZombieIdle(zx, zz, _camera.position.x, _camera.position.z); } catch (e) {}
    _groanTimer = 1.0 - _timer * 0.08;
    if (_groanTimer < 0.35) _groanTimer = 0.35;
  }
  // One distant horde swell halfway through for atmosphere
  if (_timer > 2.0 && _timer - dt <= 2.0) {
    try { playDistantHorde && playDistantHorde(); } catch (e) {}
  }
  if (_timer >= INTRO_DURATION) endIntro();
}
