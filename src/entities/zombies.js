// Zombie sprite system and mesh management
// Canvas-drawn billboard sprites (DOOM-style) with walk animation
// Extracted from main.js for modularity

import * as THREE from 'three';
import { PI2 } from '../core/state.js';

// ── Dependency injection ──
let _scene, _camera;
export function setZombieDeps(scene, camera) {
  _scene = scene; _camera = camera;
  initEyeLightPool();
  initBossFx();
}

// ===== SHARED BOSS FX (light + ground shadow) =====
// Same rationale as the eye-light pool: creating a new PointLight the
// first time a boss spawns mid-match forces Three.js to recompile every
// material in the scene to accommodate the new light count. That
// produces a massive frame hitch exactly when the boss appears.
//
// Bosses are one-at-a-time by design (they spawn as the last zombie of
// every 5th round) so a single shared light + a single shared ground
// shadow mesh is enough. Both are created once at setZombieDeps time,
// parked off-screen with intensity 0 / invisible. updateZombieMesh
// positions them under the current boss; removeZombieMesh hides them.
let _bossLight = null;
let _bossShadow = null;
function initBossFx() {
  if (_bossLight || !_scene) return;
  _bossLight = new THREE.PointLight(0xff4400, 0, 6);
  _bossLight.position.set(0, -1000, 0);
  _scene.add(_bossLight);

  const shadowGeo = new THREE.PlaneGeometry(2.5, 2.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide,
  });
  _bossShadow = new THREE.Mesh(shadowGeo, shadowMat);
  _bossShadow.position.set(0, -1000, 0);
  _bossShadow.visible = false;
  _scene.add(_bossShadow);
}

// ===== SHARED EYE LIGHT POOL =====
// A fixed pool of point lights shared between all zombies.
// Adding/removing lights in Three.js bumps the shader cache key and forces
// a synchronous recompile of every affected material — a textbook cause of
// random massive frame spikes. Keeping a constant count avoids this entirely.
const EYE_LIGHT_POOL_SIZE = 8;
const eyeLightPool = [];
let eyeLightPoolInited = false;

function initEyeLightPool() {
  if (eyeLightPoolInited || !_scene) return;
  for (let i = 0; i < EYE_LIGHT_POOL_SIZE; i++) {
    const light = new THREE.PointLight(0xff1e0a, 0, 4);
    light.position.set(0, -1000, 0); // parked off-screen until assigned
    _scene.add(light);
    eyeLightPool.push(light);
  }
  eyeLightPoolInited = true;
}

// Call once per frame from the main loop with the live zombies array.
// Assigns the N nearest zombies to the pool lights; the rest get no glow.
function updateZombieEyeLightPool(zombies) {
  if (!eyeLightPoolInited || !_camera) return;
  const cx = _camera.position.x, cz = _camera.position.z;

  // Score visible zombies by squared distance to camera
  const scored = [];
  for (const z of zombies) {
    if (!z || z.hp <= 0) continue;
    const data = zombieMeshes.get(z);
    if (!data) continue;
    const dx = z.wx - cx, dz = z.wz - cz;
    scored.push({ z, data, d2: dx * dx + dz * dz });
  }
  scored.sort((a, b) => a.d2 - b.d2);

  const flickerBase = performance.now() / 200;
  const n = Math.min(EYE_LIGHT_POOL_SIZE, scored.length);
  for (let i = 0; i < n; i++) {
    const { z, data } = scored[i];
    const light = eyeLightPool[i];
    const g = data.group;
    light.position.set(g.position.x, g.position.y + (data.spriteH || 2.2) * 0.75, g.position.z);
    if (light.color.getHex() !== (z._eyeColor | 0)) light.color.setHex(z._eyeColor);
    // keep the original flicker feel, but only if the zombie isn't mid-death
    light.intensity = z._dying ? 0 : (0.4 + Math.sin(flickerBase + (z._spriteVariant || 0) * 3) * 0.25);
  }
  for (let i = n; i < EYE_LIGHT_POOL_SIZE; i++) {
    eyeLightPool[i].intensity = 0;
  }
}

// ===== ZOMBIE SPRITE SYSTEM =====
// Billboard sprites with canvas-drawn zombie art (DOOM-style)
// Each zombie type has unique hand-drawn appearance with walk animation frames

const ZOMBIE_SPRITE_SIZE = 512;
const ZOMBIE_VARIANTS = 5;
const ZOMBIE_FRAMES = 4;
const zombieSpriteSheets = { normal: [], elite: [], boss: [] };

function initZombieSprites() {
  for (let v = 0; v < ZOMBIE_VARIANTS; v++) {
    zombieSpriteSheets.normal.push(createZombieSpriteSheet(v, 'normal'));
    zombieSpriteSheets.elite.push(createZombieSpriteSheet(v, 'elite'));
  }
  zombieSpriteSheets.boss.push(createZombieSpriteSheet(0, 'boss'));
  zombieSpriteSheets.boss.push(createZombieSpriteSheet(2, 'boss'));
}

function createZombieSpriteSheet(variant, type) {
  const canvas = document.createElement('canvas');
  canvas.width = ZOMBIE_SPRITE_SIZE * ZOMBIE_FRAMES;
  canvas.height = ZOMBIE_SPRITE_SIZE;
  const ctx = canvas.getContext('2d');
  for (let frame = 0; frame < ZOMBIE_FRAMES; frame++) {
    ctx.save();
    ctx.translate(frame * ZOMBIE_SPRITE_SIZE, 0);
    drawZombieFrame(ctx, ZOMBIE_SPRITE_SIZE, variant, type, frame);
    ctx.restore();
  }
  return canvas;
}

function drawZombieFrame(ctx, size, variant, type, frame) {
  const W = size, H = size, cx = W / 2;
  const walkPhase = (frame / ZOMBIE_FRAMES) * Math.PI * 2;
  const legSwing = Math.sin(walkPhase) * 16;
  const armSwing = Math.sin(walkPhase + 0.5) * 12;
  const bodyBob = Math.abs(Math.sin(walkPhase)) * 3;
  const headBob = Math.sin(walkPhase * 0.5) * 2.5;
  const shoulderTilt = Math.sin(walkPhase) * 2.5;
  const breathe = Math.sin(walkPhase * 1.5) * 1.5; // subtle torso expand

  // ---- REFINED COLOR PALETTES with gradient-ready tones ----
  let skin, skinDark, skinLight, skinMid, cloth, clothDark, clothLight, pants, pantsDark, blood, bloodDark, eyeGlow, shirtColor, shirtLight, boneColor;
  if (type === 'boss') {
    skin='#5A2828'; skinDark='#381515'; skinLight='#6A3535'; skinMid='#4A2020';
    cloth='#281212'; clothDark='#180808'; clothLight='#3A1E1E'; pants='#221414'; pantsDark='#160C0C';
    blood='#AA0000'; bloodDark='#660000'; eyeGlow='#FFFF00'; shirtColor='#241010'; shirtLight='#341818';
    boneColor='#D8CCA0';
  } else if (type === 'elite') {
    skin='#555838'; skinDark='#3A3C20'; skinLight='#656840'; skinMid='#4A4C30';
    cloth='#302E18'; clothDark='#222010'; clothLight='#3E3C22'; pants='#282618'; pantsDark='#1C1A10';
    blood='#883010'; bloodDark='#551808'; eyeGlow='#FF6600'; shirtColor='#2A2814'; shirtLight='#3A3620';
    boneColor='#C8BC90';
  } else {
    skin='#4A5040'; skinDark='#303828'; skinLight='#5A6050'; skinMid='#404838';
    cloth='#2E2E24'; clothDark='#1E1E16'; clothLight='#3A3A2E'; pants='#242420'; pantsDark='#181814';
    blood='#6A1818'; bloodDark='#3A0808'; eyeGlow='#FF2010'; shirtColor='#282820'; shirtLight='#343428';
    boneColor='#C0B488';
  }

  // Helper: create vertical gradient
  function vGrad(y1, y2, c1, c2) {
    const g = ctx.createLinearGradient(0, y1, 0, y2);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  }
  // Helper: radial glow
  function rGlow(x, y, r, c1, c2) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  }

  // 5 unique character quirks
  const quirks = [
    { headTilt:-4,  shoulderDrop:'L', hasJaw:true,  clothTear:'chest',    missingArm:false, hunchAmount:8,  hasHair:false, hasBelt:true,  hasSuspenders:false, shirtType:'tee' },
    { headTilt:6,   shoulderDrop:'R', hasJaw:false, clothTear:'belly',    missingArm:false, hunchAmount:4,  hasHair:true,  hasBelt:false, hasSuspenders:true,  shirtType:'button' },
    { headTilt:-3,  shoulderDrop:'L', hasJaw:true,  clothTear:'shoulder', missingArm:true,  hunchAmount:14, hasHair:false, hasBelt:true,  hasSuspenders:false, shirtType:'tank' },
    { headTilt:7,   shoulderDrop:'R', hasJaw:true,  clothTear:'none',     missingArm:false, hunchAmount:6,  hasHair:true,  hasBelt:false, hasSuspenders:false, shirtType:'jacket' },
    { headTilt:-8,  shoulderDrop:'L', hasJaw:false, clothTear:'chest',    missingArm:false, hunchAmount:16, hasHair:false, hasBelt:true,  hasSuspenders:false, shirtType:'tee' },
  ];
  const q = quirks[variant % quirks.length];
  const baseY = type === 'boss' ? H * 0.02 : H * 0.08;
  const sc = (type === 'boss' ? 1.3 : type === 'elite' ? 1.1 : 1.0) * (size / 256);

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  // Clip to canvas bounds to prevent half-face rendering
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // ======== SHADOW ON GROUND ========
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, H - baseY + 2, 32 * sc, 6 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ======== LEGS (gradient shaded, with muscle definition) ========
  const hipY = H - baseY - 98 * sc + bodyBob;
  const legLen = 82 * sc;
  const legW = 17 * sc;
  const kneePos = legLen * 0.47;
  const calfNarrow = legW * 0.82;

  function drawLeg(offsetX, swing, isLeft) {
    ctx.save();
    ctx.translate(cx + offsetX * sc, hipY);
    ctx.rotate(swing * Math.PI / 180);

    // Thigh — gradient shaded pants
    const thighGrad = vGrad(0, kneePos, pants, pantsDark);
    ctx.fillStyle = thighGrad;
    ctx.beginPath();
    ctx.moveTo(-legW/2 - 2, -2); ctx.lineTo(legW/2 + 2, -2);
    ctx.lineTo(legW/2 - 1, kneePos); ctx.lineTo(-legW/2 + 1, kneePos);
    ctx.closePath(); ctx.fill();

    // Inner thigh shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(isLeft ? legW/4 : -legW/2, 4, legW/4, kneePos - 8);

    // Knee — rounded bulge
    ctx.fillStyle = pantsDark;
    ctx.beginPath();
    ctx.ellipse(0, kneePos, legW/2 + 1, 5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // Knee highlight
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.ellipse(0, kneePos - 1, legW/3, 3 * sc, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Shin — slightly narrower, gradient
    const shinGrad = vGrad(kneePos, legLen - 8*sc, pantsDark, pants);
    ctx.fillStyle = shinGrad;
    ctx.beginPath();
    ctx.moveTo(-legW/2 + 1, kneePos); ctx.lineTo(legW/2 - 1, kneePos);
    ctx.lineTo(calfNarrow/2, legLen - 10*sc); ctx.lineTo(-calfNarrow/2, legLen - 10*sc);
    ctx.closePath(); ctx.fill();

    // Calf muscle bulge (subtle highlight)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.ellipse(isLeft ? -2 : 2, kneePos + legLen * 0.18, legW * 0.3, legLen * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Torn pants exposing skin on some variants
    if ((isLeft && (variant === 1 || variant === 3)) || (!isLeft && variant >= 2)) {
      const tearY = isLeft ? kneePos + 8*sc : legLen * 0.3;
      const tearH = isLeft ? 14 * sc : 18 * sc;
      // Exposed skin with gradient
      const skinGrad = vGrad(tearY, tearY + tearH, skinLight, skin);
      ctx.fillStyle = skinGrad;
      ctx.fillRect(-legW/2 + 3, tearY, legW - 6, tearH);
      // Wound inside tear
      ctx.fillStyle = blood;
      ctx.beginPath();
      ctx.ellipse(0, tearY + tearH/2, 4*sc, tearH * 0.3, 0.2, 0, Math.PI*2);
      ctx.fill();
      // Blood drip
      ctx.fillStyle = bloodDark;
      ctx.fillRect(-1, tearY + tearH - 2, 2.5, 8 * sc);
    }

    // Ankle wrap (thin)
    ctx.fillStyle = pantsDark;
    ctx.fillRect(-calfNarrow/2 - 1, legLen - 11*sc, calfNarrow + 2, 3*sc);

    // Boot — more detailed with sole and laces
    const bootW = legW + 6;
    const bootH = 12 * sc;
    const bootGrad = vGrad(legLen - 9*sc, legLen + 2*sc, '#1E1E18', '#0C0C08');
    ctx.fillStyle = bootGrad;
    // Boot shape (slightly rounded toe)
    ctx.beginPath();
    ctx.moveTo(-bootW/2, legLen - 9*sc);
    ctx.lineTo(bootW/2, legLen - 9*sc);
    ctx.lineTo(bootW/2 + 2, legLen + 1*sc);
    ctx.lineTo(-bootW/2 - 1, legLen + 2*sc);
    ctx.closePath(); ctx.fill();
    // Sole
    ctx.fillStyle = '#080804';
    ctx.fillRect(-bootW/2 - 1, legLen, bootW + 3, 3 * sc);
    // Boot highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(-bootW/4, legLen - 8*sc, bootW/3, 4*sc);

    ctx.restore();
  }

  drawLeg(-15, legSwing, true);
  drawLeg(15, -legSwing, false);

  // ======== TORSO (anatomically correct with muscle/rib shading) ========
  const torsoTop = H - baseY - 200 * sc + bodyBob;
  const torsoH = 108 * sc;
  const torsoW = 60 * sc;
  const hunchOff = q.hunchAmount * sc * 0.3;

  // Main torso shape — tapered with slight hunch offset
  const torsoGrad = vGrad(torsoTop, torsoTop + torsoH, shirtLight, shirtColor);
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(cx - torsoW * 0.44, torsoTop + torsoH); // bottom left
  ctx.lineTo(cx + torsoW * 0.44, torsoTop + torsoH); // bottom right
  ctx.quadraticCurveTo(cx + torsoW * 0.62, torsoTop + torsoH * 0.3, cx + torsoW * 0.55, torsoTop + 6); // right side taper
  ctx.lineTo(cx + torsoW * 0.28, torsoTop); // right shoulder inner
  ctx.lineTo(cx - torsoW * 0.28, torsoTop + hunchOff); // left shoulder inner (hunch)
  ctx.quadraticCurveTo(cx - torsoW * 0.62, torsoTop + torsoH * 0.3 + hunchOff, cx - torsoW * 0.44, torsoTop + torsoH);
  ctx.closePath();
  ctx.fill();

  // Side shadow (body contour)
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(cx + torsoW * 0.35, torsoTop + 10);
  ctx.quadraticCurveTo(cx + torsoW * 0.58, torsoTop + torsoH * 0.5, cx + torsoW * 0.4, torsoTop + torsoH);
  ctx.lineTo(cx + torsoW * 0.44, torsoTop + torsoH);
  ctx.quadraticCurveTo(cx + torsoW * 0.62, torsoTop + torsoH * 0.3, cx + torsoW * 0.55, torsoTop + 6);
  ctx.closePath(); ctx.fill();

  // Shirt wrinkles — more organic curved lines
  ctx.strokeStyle = clothDark;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.4;
  for (let w = 0; w < 4; w++) {
    const wy = torsoTop + 20*sc + w * 18*sc;
    const waver = (w % 2 === 0 ? 1 : -1) * 6 * sc;
    ctx.beginPath();
    ctx.moveTo(cx - torsoW*0.32 + breathe, wy + hunchOff * (1 - w/4));
    ctx.bezierCurveTo(cx - torsoW*0.1, wy + waver, cx + torsoW*0.15, wy - waver*0.5, cx + torsoW*0.32, wy + 2*sc);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Shirt button line (for button-up variant)
  if (q.shirtType === 'button') {
    ctx.fillStyle = clothLight;
    ctx.fillRect(cx - 1.5, torsoTop + 12*sc, 3, torsoH - 20*sc);
    for (let b = 0; b < 5; b++) {
      ctx.fillStyle = clothLight;
      ctx.beginPath();
      ctx.arc(cx, torsoTop + 18*sc + b * 16*sc, 2*sc, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Tank top straps
  if (q.shirtType === 'tank') {
    ctx.fillStyle = skin;
    ctx.fillRect(cx - torsoW*0.55, torsoTop, torsoW*0.18, 18*sc);
    ctx.fillRect(cx + torsoW*0.37, torsoTop, torsoW*0.18, 18*sc);
  }

  // Jacket lapels
  if (q.shirtType === 'jacket') {
    ctx.fillStyle = clothLight;
    ctx.beginPath();
    ctx.moveTo(cx - 2, torsoTop + 4);
    ctx.lineTo(cx - torsoW*0.35, torsoTop + 25*sc);
    ctx.lineTo(cx - torsoW*0.3, torsoTop + torsoH * 0.5);
    ctx.lineTo(cx - 3, torsoTop + torsoH * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2, torsoTop + 4);
    ctx.lineTo(cx + torsoW*0.35, torsoTop + 25*sc);
    ctx.lineTo(cx + torsoW*0.3, torsoTop + torsoH * 0.5);
    ctx.lineTo(cx + 3, torsoTop + torsoH * 0.4);
    ctx.closePath(); ctx.fill();
  }

  // Suspenders
  if (q.hasSuspenders) {
    ctx.strokeStyle = '#3A3020';
    ctx.lineWidth = 4 * sc;
    ctx.beginPath(); ctx.moveTo(cx - 12*sc, torsoTop + torsoH); ctx.lineTo(cx - 14*sc, torsoTop + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 12*sc, torsoTop + torsoH); ctx.lineTo(cx + 14*sc, torsoTop + 5); ctx.stroke();
  }

  // Shoulder bulk with gradient
  const sDropL = q.shoulderDrop === 'L' ? shoulderTilt + 5 : shoulderTilt;
  const sDropR = q.shoulderDrop === 'R' ? shoulderTilt + 5 : shoulderTilt;
  const shoulderGrad = vGrad(torsoTop + sDropL - 2, torsoTop + sDropL + 18*sc, shirtLight, shirtColor);
  ctx.fillStyle = shoulderGrad;
  // Left shoulder (rounded)
  ctx.beginPath();
  ctx.ellipse(cx - torsoW * 0.48, torsoTop + sDropL + 8*sc, 18*sc, 10*sc, -0.15, 0, Math.PI*2);
  ctx.fill();
  // Right shoulder (rounded)
  ctx.beginPath();
  ctx.ellipse(cx + torsoW * 0.48, torsoTop + sDropR + 8*sc, 18*sc, 10*sc, 0.15, 0, Math.PI*2);
  ctx.fill();
  // Shoulder highlight
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(cx - torsoW * 0.48, torsoTop + sDropL + 5*sc, 12*sc, 5*sc, 0, Math.PI, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + torsoW * 0.48, torsoTop + sDropR + 5*sc, 12*sc, 5*sc, 0, Math.PI, Math.PI*2);
  ctx.fill();

  // Collar / neckline with gradient
  const collarGrad = rGlow(cx, torsoTop + 4, 14*sc, skinLight, skin);
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.ellipse(cx, torsoTop + 4 + hunchOff*0.5, 13*sc, 9*sc, 0, 0, Math.PI);
  ctx.fill();
  // Collar shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(cx, torsoTop + 6 + hunchOff*0.5, 11*sc, 4*sc, 0, 0, Math.PI);
  ctx.fill();

  // Belt
  if (q.hasBelt) {
    const beltGrad = vGrad(torsoTop + torsoH - 9*sc, torsoTop + torsoH, '#302820', '#1A1610');
    ctx.fillStyle = beltGrad;
    ctx.fillRect(cx - torsoW*0.46, torsoTop + torsoH - 9*sc, torsoW*0.92, 9*sc);
    // Belt buckle with shine
    ctx.fillStyle = '#666650';
    ctx.fillRect(cx - 5*sc, torsoTop + torsoH - 8*sc, 10*sc, 7*sc);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - 3*sc, torsoTop + torsoH - 7*sc, 4*sc, 3*sc);
  }

  // ---- CLOTH TEARS & WOUNDS (more detailed) ----
  if (q.clothTear === 'chest') {
    // Torn shirt exposing chest wound
    const tearGrad = rGlow(cx + 5*sc, torsoTop + 30*sc, 16*sc, skinLight, skinDark);
    ctx.fillStyle = tearGrad;
    ctx.beginPath();
    ctx.ellipse(cx + 5*sc, torsoTop + 28*sc, 12*sc, 16*sc, 0.2, 0, Math.PI*2);
    ctx.fill();
    // Deep wound with muscle
    ctx.fillStyle = bloodDark;
    ctx.beginPath();
    ctx.ellipse(cx + 5*sc, torsoTop + 30*sc, 7*sc, 9*sc, 0.1, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = blood;
    ctx.beginPath();
    ctx.ellipse(cx + 5*sc, torsoTop + 31*sc, 4*sc, 5*sc, 0, 0, Math.PI*2);
    ctx.fill();
    // Ragged tear edges
    ctx.strokeStyle = shirtColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.7;
    for (let t = 0; t < 6; t++) {
      const ang = t * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(cx + 5*sc + Math.cos(ang)*10*sc, torsoTop + 28*sc + Math.sin(ang)*14*sc);
      ctx.lineTo(cx + 5*sc + Math.cos(ang)*14*sc, torsoTop + 28*sc + Math.sin(ang)*18*sc);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (q.clothTear === 'belly') {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx - 3*sc, torsoTop + 58*sc, 14*sc, 12*sc, 0, 0, Math.PI*2);
    ctx.fill();
    // Intestine hint
    ctx.fillStyle = '#5A2020';
    ctx.beginPath();
    ctx.ellipse(cx - 3*sc, torsoTop + 60*sc, 8*sc, 6*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#4A1515';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8*sc, torsoTop + 60*sc);
    ctx.bezierCurveTo(cx - 2*sc, torsoTop + 55*sc, cx + 2*sc, torsoTop + 65*sc, cx + 6*sc, torsoTop + 59*sc);
    ctx.stroke();
    // Blood drip
    ctx.fillStyle = blood;
    ctx.fillRect(cx - 2, torsoTop + 68*sc, 3, 14*sc);
  } else if (q.clothTear === 'shoulder') {
    const tearGrad = vGrad(torsoTop, torsoTop + 22*sc, skinLight, skin);
    ctx.fillStyle = tearGrad;
    ctx.fillRect(cx - torsoW*0.56, torsoTop + 2, 18*sc, 22*sc);
    ctx.fillStyle = blood;
    ctx.beginPath();
    ctx.ellipse(cx - torsoW*0.48, torsoTop + 12, 6*sc, 4*sc, 0.2, 0, Math.PI*2);
    ctx.fill();
    // Bone peeking through
    ctx.fillStyle = boneColor;
    ctx.fillRect(cx - torsoW*0.5, torsoTop + 8, 4*sc, 8*sc);
  }

  // Ribs visible on some variants (more defined)
  if (variant === 4 || variant === 2) {
    ctx.globalAlpha = 0.4;
    for (let r = 0; r < 5; r++) {
      const ribY = torsoTop + 18*sc + r * 7*sc;
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - 14*sc, ribY);
      ctx.bezierCurveTo(cx - 6*sc, ribY - 2*sc, cx + 6*sc, ribY - 2*sc, cx + 14*sc, ribY + 1*sc);
      ctx.stroke();
      // Rib shadow
      ctx.strokeStyle = skinDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 13*sc, ribY + 2);
      ctx.bezierCurveTo(cx - 5*sc, ribY, cx + 5*sc, ribY, cx + 13*sc, ribY + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Blood splatter — randomized drips and splatters
  ctx.fillStyle = blood;
  for (let i = 0; i < 3 + variant; i++) {
    const bx = cx + Math.sin(i * 7.3 + variant * 2.1) * torsoW * 0.38;
    const by = torsoTop + 12 + Math.cos(i * 5.1 + variant * 1.7) * torsoH * 0.35;
    const br = (2.5 + Math.sin(i * 3.7) * 2.5) * sc;
    ctx.beginPath();
    ctx.ellipse(bx, by, br, br * 0.6, i * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Blood drip from splatter
    if (i % 2 === 0) {
      ctx.fillStyle = bloodDark;
      ctx.fillRect(bx - 0.8, by + br*0.5, 1.8, (5 + i * 3) * sc);
      ctx.fillStyle = blood;
    }
  }

  // ======== ARMS (with muscle definition, gradient shading, detailed hands) ========
  const armW = 15 * sc;
  const armLen = 75 * sc;
  const shoulderY = torsoTop + 10;

  function drawArm(side, isStump) {
    const signX = side === 'L' ? -1 : 1;
    const sDrop = side === 'L' ? sDropL : sDropR;
    const swingAmt = side === 'L' ? armSwing : -armSwing * 0.7;
    const baseAngle = side === 'L' ? -25 : 25;

    ctx.save();
    ctx.translate(cx + signX * torsoW * 0.58, shoulderY + sDrop);
    ctx.rotate((baseAngle + swingAmt) * Math.PI / 180);

    if (isStump) {
      // Torn stump
      ctx.fillStyle = shirtColor;
      ctx.fillRect(-armW/2, 0, armW, armLen * 0.25);
      const stumpGrad = vGrad(armLen * 0.2, armLen * 0.38, skin, bloodDark);
      ctx.fillStyle = stumpGrad;
      ctx.fillRect(-armW/2 + 1, armLen * 0.22, armW - 2, armLen * 0.14);
      // Bone sticking out
      ctx.fillStyle = boneColor;
      ctx.fillRect(-2, armLen * 0.28, 4, 10*sc);
      ctx.fillStyle = blood;
      ctx.beginPath();
      ctx.ellipse(0, armLen * 0.34, armW/2 + 2, 5*sc, 0, 0, Math.PI*2);
      ctx.fill();
      // Blood drips
      ctx.fillStyle = bloodDark;
      ctx.fillRect(-2, armLen * 0.34, 2.5, 20*sc);
      ctx.fillRect(3, armLen * 0.36, 2, 26*sc);
      ctx.restore();
      return;
    }

    // Upper arm (shirt sleeve) with gradient
    const sleeveGrad = vGrad(0, armLen * 0.44, shirtLight, shirtColor);
    ctx.fillStyle = sleeveGrad;
    ctx.beginPath();
    ctx.moveTo(-armW/2 - 1, -2);
    ctx.lineTo(armW/2 + 1, -2);
    ctx.lineTo(armW/2, armLen * 0.43);
    ctx.lineTo(-armW/2, armLen * 0.43);
    ctx.closePath(); ctx.fill();

    // Sleeve wrinkle
    ctx.strokeStyle = clothDark;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(-armW/2 + 2, armLen * 0.15);
    ctx.quadraticCurveTo(0, armLen * 0.18, armW/2 - 2, armLen * 0.14);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Sleeve rolled edge
    ctx.fillStyle = clothDark;
    ctx.beginPath();
    ctx.ellipse(0, armLen * 0.42, armW/2 + 1.5, 3*sc, 0, 0, Math.PI*2);
    ctx.fill();

    // Forearm (exposed skin with muscle definition)
    const forearmGrad = vGrad(armLen * 0.42, armLen * 0.88, skinLight, skinDark);
    ctx.fillStyle = forearmGrad;
    ctx.beginPath();
    ctx.moveTo(-armW/2 + 1, armLen * 0.42);
    ctx.lineTo(armW/2 - 1, armLen * 0.42);
    ctx.quadraticCurveTo(armW/2 + 1, armLen * 0.6, armW/2 - 2, armLen * 0.88);
    ctx.lineTo(-armW/2 + 2, armLen * 0.88);
    ctx.quadraticCurveTo(-armW/2 - 1, armLen * 0.6, -armW/2 + 1, armLen * 0.42);
    ctx.closePath(); ctx.fill();

    // Forearm muscle highlight
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.ellipse(side === 'L' ? -2 : 2, armLen * 0.55, armW * 0.25, armLen * 0.1, 0, 0, Math.PI*2);
    ctx.fill();

    // Veins (2-3 per arm)
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-2, armLen*0.48); ctx.bezierCurveTo(-3, armLen*0.6, -1, armLen*0.72, -2, armLen*0.83);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, armLen*0.5); ctx.bezierCurveTo(2, armLen*0.65, 4, armLen*0.75, 3, armLen*0.82);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Wound on forearm for some variants
    if ((side === 'R' && (variant === 0 || variant === 4)) || (side === 'L' && variant === 3)) {
      ctx.fillStyle = bloodDark;
      ctx.beginPath();
      ctx.ellipse(0, armLen * 0.62, 5.5*sc, 8*sc, 0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = blood;
      ctx.beginPath();
      ctx.ellipse(0, armLen * 0.62, 3.5*sc, 5.5*sc, 0.3, 0, Math.PI*2);
      ctx.fill();
      // Exposed tendon/muscle fiber
      ctx.strokeStyle = '#6A2020';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-2, armLen * 0.57); ctx.lineTo(-1, armLen * 0.67); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, armLen * 0.58); ctx.lineTo(1, armLen * 0.66); ctx.stroke();
    }

    // Wrist
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(0, armLen * 0.88, armW/2 - 1, 3*sc, 0, 0, Math.PI*2);
    ctx.fill();

    // Hand — detailed palm + curled fingers
    const handGrad = rGlow(0, armLen * 0.92, 10*sc, skinMid, skinDark);
    ctx.fillStyle = handGrad;
    ctx.beginPath();
    ctx.ellipse(0, armLen * 0.92, 9*sc, 7.5*sc, 0, 0, Math.PI*2);
    ctx.fill();

    // Individual fingers (5) with knuckle detail
    for (let f = -2; f <= 2; f++) {
      ctx.save();
      ctx.translate(f * 3.5 * sc, armLen * 0.95);
      ctx.rotate(f * 0.12 + (side === 'L' ? 0.2 : -0.2));
      // Finger base (slightly tapered)
      const fingerGrad = vGrad(0, 11*sc, skinMid, skinDark);
      ctx.fillStyle = fingerGrad;
      ctx.beginPath();
      ctx.moveTo(-1.5, 0); ctx.lineTo(1.5, 0);
      ctx.lineTo(1.2, 11*sc); ctx.lineTo(-1.2, 11*sc);
      ctx.closePath(); ctx.fill();
      // Knuckle
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 3*sc, 1.8, 1.5, 0, 0, Math.PI*2);
      ctx.fill();
      // Fingernail (dirty/broken)
      ctx.fillStyle = '#555540';
      ctx.beginPath();
      ctx.ellipse(0, 10.5*sc, 1.5, 2*sc, 0, 0, Math.PI*2);
      ctx.fill();
      // Dirt under nail
      ctx.fillStyle = '#2A2A1A';
      ctx.fillRect(-1, 11.5*sc, 2, 1.2*sc);
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw arms
  if (q.missingArm) {
    drawArm('L', true);
  } else {
    drawArm('L', false);
  }
  drawArm('R', false);

  // ======== NECK (thicker, with tendons and wounds) ========
  const neckH = 16 * sc;
  const neckW = 17 * sc;
  const neckY = torsoTop - neckH + 6 + hunchOff * 0.5;
  const neckGrad = vGrad(neckY, neckY + neckH + 3, skinLight, skin);
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(cx - neckW/2, neckY + neckH + 3);
  ctx.lineTo(cx + neckW/2, neckY + neckH + 3);
  ctx.lineTo(cx + neckW/2 - 2, neckY);
  ctx.lineTo(cx - neckW/2 + 2, neckY);
  ctx.closePath(); ctx.fill();

  // Neck tendons (sternocleidomastoid)
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - 5*sc, neckY + 1); ctx.bezierCurveTo(cx - 6*sc, neckY + neckH*0.5, cx - 7*sc, neckY + neckH, cx - 8*sc, neckY + neckH + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5*sc, neckY + 1); ctx.bezierCurveTo(cx + 6*sc, neckY + neckH*0.5, cx + 7*sc, neckY + neckH, cx + 8*sc, neckY + neckH + 4); ctx.stroke();
  // Adam's apple hint
  ctx.beginPath(); ctx.moveTo(cx, neckY + neckH*0.35); ctx.lineTo(cx + 1.5, neckY + neckH*0.5); ctx.lineTo(cx, neckY + neckH*0.65); ctx.stroke();
  ctx.globalAlpha = 1;

  // Neck wound (variant-specific)
  if (variant === 2 || variant === 4) {
    ctx.fillStyle = bloodDark;
    ctx.beginPath();
    ctx.ellipse(cx + 6*sc, neckY + 5*sc, 6*sc, 5*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = blood;
    ctx.beginPath();
    ctx.ellipse(cx + 6*sc, neckY + 5*sc, 3.5*sc, 3*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
    // Blood streak down
    ctx.fillStyle = bloodDark;
    ctx.fillRect(cx + 5*sc, neckY + 8*sc, 2.5, 12*sc);
  }

  // ======== HEAD (detailed human skull shape with facial features) ========
  const headSize = 30 * sc;
  const headX = cx + q.headTilt * sc * 0.25;
  const headY = neckY - headSize * 0.8 + headBob;

  ctx.save();
  ctx.translate(headX, headY + headSize);
  ctx.rotate(q.headTilt * Math.PI / 180 * 0.35);
  ctx.translate(-headX, -(headY + headSize));

  // Ears — more detailed with inner ear
  for (const earSide of [-1, 1]) {
    ctx.fillStyle = skinDark;
    const earX = headX + earSide * headSize * 0.92;
    ctx.beginPath();
    ctx.ellipse(earX, headY + headSize * 0.5, 6*sc, 9*sc, earSide * -0.1, 0, Math.PI*2);
    ctx.fill();
    // Inner ear
    ctx.fillStyle = skinMid;
    ctx.beginPath();
    ctx.ellipse(earX + earSide * 0.5, headY + headSize * 0.48, 3.5*sc, 6*sc, earSide * -0.1, 0, Math.PI*2);
    ctx.fill();
    // Ear shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(earX + earSide * 1, headY + headSize * 0.55, 2.5*sc, 4*sc, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // Head shape — realistic oval skull
  const headGrad = rGlow(headX, headY + headSize * 0.35, headSize * 1.1, skinLight, skinDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(headX, headY + headSize * 0.42, headSize * 0.84, headSize * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();

  // Jawline (more defined, angular)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(headX - headSize * 0.72, headY + headSize * 0.55);
  ctx.quadraticCurveTo(headX - headSize * 0.55, headY + headSize * 1.08, headX, headY + headSize * 1.12);
  ctx.quadraticCurveTo(headX + headSize * 0.55, headY + headSize * 1.08, headX + headSize * 0.72, headY + headSize * 0.55);
  ctx.fill();
  // Chin cleft
  ctx.fillStyle = skinDark;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(headX, headY + headSize * 1.05, 3*sc, 2.5*sc, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Jaw shadow under cheekbone
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.moveTo(headX - headSize * 0.7, headY + headSize * 0.58);
  ctx.quadraticCurveTo(headX - headSize * 0.4, headY + headSize * 0.72, headX, headY + headSize * 0.68);
  ctx.quadraticCurveTo(headX + headSize * 0.4, headY + headSize * 0.72, headX + headSize * 0.7, headY + headSize * 0.58);
  ctx.lineTo(headX + headSize * 0.6, headY + headSize * 0.5);
  ctx.lineTo(headX - headSize * 0.6, headY + headSize * 0.5);
  ctx.closePath(); ctx.fill();

  // Cheekbone highlights
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(headX - headSize * 0.4, headY + headSize * 0.48, 8*sc, 5*sc, -0.2, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headX + headSize * 0.4, headY + headSize * 0.48, 8*sc, 5*sc, 0.2, 0, Math.PI*2);
  ctx.fill();

  // Hair / scalp
  if (q.hasHair) {
    // Messy, thinning hair
    const hairGrad = vGrad(headY - 2*sc, headY + headSize * 0.35, '#1E1E14', '#141410');
    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.ellipse(headX, headY + headSize * 0.13, headSize * 0.78, headSize * 0.44, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Individual messy strands
    ctx.strokeStyle = '#1A1A10';
    ctx.lineWidth = 2.2;
    for (let h = 0; h < 10; h++) {
      const hx = headX - headSize * 0.6 + h * headSize * 0.13;
      const curl = (h % 3 === 0 ? -1 : 1) * (6 + h * 1.5) * sc;
      ctx.beginPath();
      ctx.moveTo(hx, headY + headSize * 0.08);
      ctx.bezierCurveTo(hx + curl*0.5, headY - 4*sc - h*sc, hx + curl, headY - 2*sc, hx + curl*0.7, headY + headSize * 0.05);
      ctx.stroke();
    }
    // Receding hairline / patchy spots
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(headX + headSize * 0.25, headY + headSize * 0.08, 6*sc, 5*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
  } else {
    // Bald / decayed scalp with texture
    const scalpGrad = rGlow(headX, headY + headSize * 0.15, headSize * 0.7, skinDark, '#1E1E14');
    ctx.fillStyle = scalpGrad;
    ctx.beginPath();
    ctx.ellipse(headX, headY + headSize * 0.18, headSize * 0.72, headSize * 0.4, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Scalp veins
    ctx.strokeStyle = skinMid;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.35;
    for (let v = 0; v < 4; v++) {
      const vx = headX - headSize * 0.3 + v * headSize * 0.2;
      ctx.beginPath();
      ctx.moveTo(vx, headY + headSize * 0.05);
      ctx.bezierCurveTo(vx + 3*sc, headY + headSize * 0.15, vx - 2*sc, headY + headSize * 0.25, vx + 1*sc, headY + headSize * 0.32);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Brow ridge (heavy, Neanderthal-like)
  const browGrad = vGrad(headY + headSize * 0.28, headY + headSize * 0.38, skinDark, skin);
  ctx.fillStyle = browGrad;
  ctx.beginPath();
  ctx.ellipse(headX, headY + headSize * 0.33, headSize * 0.68, 5.5 * sc, 0, 0, Math.PI);
  ctx.fill();
  // Brow wrinkles
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.3;
  for (let bw = 0; bw < 3; bw++) {
    ctx.beginPath();
    ctx.moveTo(headX - headSize*0.5, headY + headSize * 0.28 + bw * 2.5*sc);
    ctx.quadraticCurveTo(headX, headY + headSize * 0.26 + bw * 2.5*sc, headX + headSize*0.5, headY + headSize * 0.28 + bw * 2.5*sc);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- EYES (deep sockets with detailed glow) ----
  const eyeY = headY + headSize * 0.44;
  const eyeSpacing = headSize * 0.33;

  for (const eSide of [-1, 1]) {
    const ex = headX + eSide * eyeSpacing;
    // Deep socket shadow (layered for depth)
    ctx.fillStyle = '#060604';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 9*sc, 6.5*sc, eSide * -0.1, 0, Math.PI*2);
    ctx.fill();
    // Socket inner ring
    ctx.fillStyle = '#0E0E08';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 7*sc, 5*sc, eSide * -0.1, 0, Math.PI*2);
    ctx.fill();
    // Under-eye dark circle
    ctx.fillStyle = 'rgba(20,10,10,0.4)';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 4.5*sc, 8*sc, 3.5*sc, eSide * 0.05, 0, Math.PI);
    ctx.fill();

    // Glowing iris with gradient
    const irisGrad = rGlow(ex, eyeY, 5*sc, eyeGlow, type === 'boss' ? '#AA8800' : type === 'elite' ? '#AA4400' : '#AA1010');
    ctx.fillStyle = irisGrad;
    ctx.shadowColor = eyeGlow;
    ctx.shadowBlur = 14 * sc;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 4*sc, 3.5*sc, 0, 0, Math.PI*2);
    ctx.fill();
    // Pupil (slit for boss, round for others)
    ctx.fillStyle = '#000';
    ctx.shadowBlur = 0;
    if (type === 'boss') {
      ctx.fillRect(ex - 0.8, eyeY - 3*sc, 1.6, 6*sc);
    } else {
      ctx.beginPath();
      ctx.arc(ex, eyeY, 1.5*sc, 0, Math.PI*2);
      ctx.fill();
    }
    // Eye highlight (specular)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(ex - 1.5*sc, eyeY - 1.5*sc, 1.2*sc, 0.8*sc, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ---- NOSE (realistic bridge with cartilage) ----
  ctx.fillStyle = skinDark;
  // Nose bridge
  ctx.beginPath();
  ctx.moveTo(headX - 2.5*sc, headY + headSize * 0.38);
  ctx.lineTo(headX - 1*sc, headY + headSize * 0.52);
  ctx.lineTo(headX - 5.5*sc, headY + headSize * 0.64);
  ctx.lineTo(headX + 5.5*sc, headY + headSize * 0.64);
  ctx.lineTo(headX + 1*sc, headY + headSize * 0.52);
  ctx.lineTo(headX + 2.5*sc, headY + headSize * 0.38);
  ctx.closePath();
  ctx.fill();
  // Nose shadow (one side darker)
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(headX + 1*sc, headY + headSize * 0.42);
  ctx.lineTo(headX + 5*sc, headY + headSize * 0.63);
  ctx.lineTo(headX + 2*sc, headY + headSize * 0.63);
  ctx.lineTo(headX + 1*sc, headY + headSize * 0.48);
  ctx.closePath(); ctx.fill();
  // Nostrils (deeper, more realistic)
  ctx.fillStyle = '#080804';
  ctx.beginPath();
  ctx.ellipse(headX - 3.5*sc, headY + headSize * 0.65, 3*sc, 2.2*sc, 0.1, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headX + 3.5*sc, headY + headSize * 0.65, 3*sc, 2.2*sc, -0.1, 0, Math.PI*2);
  ctx.fill();
  // Nose tip highlight
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(headX, headY + headSize * 0.6, 3*sc, 2*sc, 0, Math.PI, Math.PI*2);
  ctx.fill();
  // Missing nose cartilage (variant 4)
  if (variant === 4) {
    ctx.fillStyle = '#0A0806';
    ctx.beginPath();
    ctx.moveTo(headX - 3*sc, headY + headSize * 0.48);
    ctx.lineTo(headX + 1*sc, headY + headSize * 0.45);
    ctx.lineTo(headX + 2*sc, headY + headSize * 0.58);
    ctx.lineTo(headX - 2*sc, headY + headSize * 0.58);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = boneColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(headX - 1, headY + headSize * 0.48, 2, 8*sc);
    ctx.globalAlpha = 1;
  }

  // ---- MOUTH (detailed with gums, teeth, tongue) ----
  if (q.hasJaw) {
    // Open screaming mouth
    const mouthGrad = rGlow(headX, headY + headSize * 0.84, 12*sc, '#200808', '#0A0202');
    ctx.fillStyle = mouthGrad;
    ctx.beginPath();
    ctx.ellipse(headX, headY + headSize * 0.84, 12*sc, 8*sc, 0, 0, Math.PI*2);
    ctx.fill();

    // Gums (upper)
    ctx.fillStyle = '#5A2828';
    ctx.beginPath();
    ctx.ellipse(headX, headY + headSize * 0.79, 10*sc, 3.5*sc, 0, Math.PI, Math.PI*2);
    ctx.fill();
    // Gums (lower)
    ctx.beginPath();
    ctx.ellipse(headX, headY + headSize * 0.89, 9*sc, 3*sc, 0, 0, Math.PI);
    ctx.fill();

    // Tongue
    ctx.fillStyle = '#6A3535';
    ctx.beginPath();
    ctx.ellipse(headX + 1*sc, headY + headSize * 0.86, 5*sc, 3.5*sc, 0.1, 0, Math.PI);
    ctx.fill();

    // Upper teeth (jagged, some missing, with roots)
    ctx.fillStyle = '#D8D0A0';
    for (let t = -3; t <= 3; t++) {
      if (variant === 1 && (t === -2 || t === 1)) continue;
      if (variant === 3 && t === 0) continue;
      const tw = 3 * sc;
      const th = (3 + Math.abs(Math.sin(t * 2.3)) * 4) * sc;
      // Tooth gradient (yellowed)
      const toothGrad = vGrad(headY + headSize * 0.78, headY + headSize * 0.78 + th, '#D8D0A0', '#A89868');
      ctx.fillStyle = toothGrad;
      ctx.fillRect(headX + t * tw - tw/2, headY + headSize * 0.78, tw - 0.5, th);
      // Tooth crack on some
      if ((t + variant) % 3 === 0) {
        ctx.strokeStyle = '#888060';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(headX + t * tw, headY + headSize * 0.79);
        ctx.lineTo(headX + t * tw + 0.5, headY + headSize * 0.78 + th);
        ctx.stroke();
      }
    }
    // Lower teeth
    for (let t = -2; t <= 2; t++) {
      if (Math.sin(t * 3.7 + variant) > 0.3) continue;
      const tw = 3 * sc;
      const th = (2.5 + Math.abs(Math.sin(t * 1.9)) * 3) * sc;
      ctx.fillStyle = '#C8C098';
      ctx.fillRect(headX + t * tw - tw/2, headY + headSize * 0.89 - th, tw - 0.5, th);
    }

    // Blood drool (multiple strands)
    ctx.fillStyle = blood;
    ctx.fillRect(headX + 4*sc, headY + headSize * 0.89, 2.5, 10*sc);
    ctx.fillRect(headX - 3*sc, headY + headSize * 0.9, 1.8, 7*sc);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(headX + 5*sc, headY + headSize * 0.91, 4.5*sc, 3*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // Closed lipless mouth with exposed cheek
    ctx.strokeStyle = '#1E0808';
    ctx.lineWidth = 2.5 * sc;
    ctx.beginPath();
    ctx.moveTo(headX - 10*sc, headY + headSize * 0.8);
    ctx.bezierCurveTo(headX - 4*sc, headY + headSize * 0.87, headX + 4*sc, headY + headSize * 0.85, headX + 10*sc, headY + headSize * 0.78);
    ctx.stroke();
    // Cheek wound showing teeth and gums
    ctx.fillStyle = '#1A0808';
    ctx.beginPath();
    ctx.ellipse(headX + 12*sc, headY + headSize * 0.75, 7*sc, 6*sc, 0.1, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#5A2828';
    ctx.beginPath();
    ctx.ellipse(headX + 12*sc, headY + headSize * 0.75, 5*sc, 4*sc, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#D8D0A0';
    for (let t = 0; t < 3; t++) {
      ctx.fillRect(headX + 10*sc + t * 3*sc, headY + headSize * 0.73, 2.5*sc, 4*sc);
    }
  }

  // Face wound / deep scar
  if (variant === 0 || variant === 3) {
    // Multi-layer wound
    ctx.strokeStyle = bloodDark;
    ctx.lineWidth = 4 * sc;
    ctx.beginPath();
    ctx.moveTo(headX - headSize*0.42, headY + headSize*0.22);
    ctx.bezierCurveTo(headX - headSize*0.2, headY + headSize*0.45, headX - headSize*0.15, headY + headSize*0.55, headX - headSize*0.12, headY + headSize*0.72);
    ctx.stroke();
    // Inner wound (lighter)
    ctx.strokeStyle = blood;
    ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    ctx.moveTo(headX - headSize*0.4, headY + headSize*0.24);
    ctx.bezierCurveTo(headX - headSize*0.18, headY + headSize*0.46, headX - headSize*0.13, headY + headSize*0.56, headX - headSize*0.1, headY + headSize*0.7);
    ctx.stroke();
  }

  // Exposed skull patch (variant 4)
  if (variant === 4) {
    const skullGrad = rGlow(headX + headSize*0.3, headY + headSize*0.25, 10*sc, '#D8CCA0', '#A09060');
    ctx.fillStyle = skullGrad;
    ctx.beginPath();
    ctx.ellipse(headX + headSize*0.3, headY + headSize*0.25, 9*sc, 8*sc, 0.3, 0, Math.PI*2);
    ctx.fill();
    // Skull suture line
    ctx.strokeStyle = '#908858';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headX + headSize*0.24, headY + headSize*0.18);
    ctx.bezierCurveTo(headX + headSize*0.3, headY + headSize*0.22, headX + headSize*0.32, headY + headSize*0.28, headX + headSize*0.35, headY + headSize*0.32);
    ctx.stroke();
    // Ragged skin edge around skull
    ctx.strokeStyle = skin;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(headX + headSize*0.3, headY + headSize*0.25, 10*sc, 9*sc, 0.3, 0, Math.PI*2);
    ctx.stroke();
  }

  // Nasolabial folds (wrinkles from nose to mouth corners)
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(headX - 5*sc, headY + headSize * 0.62);
  ctx.quadraticCurveTo(headX - 8*sc, headY + headSize * 0.72, headX - 9*sc, headY + headSize * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headX + 5*sc, headY + headSize * 0.62);
  ctx.quadraticCurveTo(headX + 8*sc, headY + headSize * 0.72, headX + 9*sc, headY + headSize * 0.8);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore(); // head rotation

  // ======== BOSS EXTRAS (chains, spikes, massive wounds) ========
  if (type === 'boss') {
    // Chain across torso
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    for (let c = 0; c < 12; c++) {
      const chainX = cx - torsoW*0.45 + c * torsoW * 0.08;
      const chainY = torsoTop + 18 + Math.sin(c * 1.2) * 5;
      ctx.beginPath();
      ctx.ellipse(chainX, chainY, 4*sc, 6*sc, 0, 0, Math.PI*2);
      ctx.stroke();
    }
    // Chain highlight
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    for (let c = 0; c < 12; c += 2) {
      const chainX = cx - torsoW*0.45 + c * torsoW * 0.08;
      const chainY = torsoTop + 16 + Math.sin(c * 1.2) * 5;
      ctx.beginPath();
      ctx.arc(chainX, chainY, 2.5*sc, Math.PI, Math.PI*1.5);
      ctx.stroke();
    }

    // Shoulder spikes/bone protrusions
    for (const spikeSide of [-1, 1]) {
      ctx.fillStyle = '#555';
      const spikeX = cx + spikeSide * torsoW * 0.55;
      ctx.beginPath();
      ctx.moveTo(spikeX, torsoTop + 2);
      ctx.lineTo(spikeX + spikeSide * 6*sc, torsoTop - 16*sc);
      ctx.lineTo(spikeX + spikeSide * 2*sc, torsoTop + 8);
      ctx.closePath(); ctx.fill();
      // Spike highlight
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.moveTo(spikeX + spikeSide * 1, torsoTop + 3);
      ctx.lineTo(spikeX + spikeSide * 5*sc, torsoTop - 14*sc);
      ctx.lineTo(spikeX + spikeSide * 3*sc, torsoTop + 2);
      ctx.closePath(); ctx.fill();
    }

    // Massive chest wound
    ctx.fillStyle = '#3A0000';
    ctx.beginPath();
    ctx.ellipse(cx - 8*sc, torsoTop + 45*sc, 10*sc, 14*sc, 0.2, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = blood;
    ctx.beginPath();
    ctx.ellipse(cx - 8*sc, torsoTop + 47*sc, 7*sc, 10*sc, 0.2, 0, Math.PI*2);
    ctx.fill();
    // Exposed ribs in wound
    ctx.strokeStyle = boneColor;
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      ctx.moveTo(cx - 15*sc, torsoTop + 40*sc + r * 6*sc);
      ctx.lineTo(cx - 1*sc, torsoTop + 42*sc + r * 6*sc);
      ctx.stroke();
    }
  }

  // ======== ELITE GLOW AURA (enhanced) ========
  if (type === 'elite') {
    ctx.shadowColor = eyeGlow;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = eyeGlow;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.45, torsoW * 0.75, H * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Inner glow
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.45, torsoW * 0.6, H * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
  }

  // ======== AMBIENT OCCLUSION (subtle overall darkening at edges) ========
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  // Darken bottom
  const aoGrad = vGrad(H * 0.7, H, 'rgba(0,0,0,0)', 'rgba(0,0,0,1)');
  ctx.fillStyle = aoGrad;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// Pre-generate all sprites at startup
initZombieSprites();

// ===== ZOMBIE MESHES (Billboard Sprites) =====
const zombieMeshes = new Map();

const SPAWN_RISE_DUR = 1.4; // seconds to fully emerge from ground
const SPAWN_RISE_DEPTH = 2.4; // how far below ground they start

function createZombieMesh(z) {
  const group = new THREE.Group();
  const scale = z.isBoss ? 1.6 : z.isElite ? 1.2 : 1;
  const type = z.isBoss ? 'boss' : z.isElite ? 'elite' : 'normal';
  const sheets = zombieSpriteSheets[type];
  z._spriteVariant = Math.floor(Math.random() * sheets.length);
  z._spriteFrame = 0;
  z._frameTimer = 0;
  const spdRatio = z._baseSpd ? (z.spd / z._baseSpd) : 1;
  z._frameSpeed = z._hasLimp ? (0.22 + Math.random() * 0.12) : (0.08 + (1 - Math.min(spdRatio, 1.5) / 1.5) * 0.12 + Math.random() * 0.04);

  // Spawn rising state — zombie emerges from the ground
  z._spawnDur = Math.min(SPAWN_RISE_DUR * (0.85 + Math.random() * 0.3), SPAWN_RISE_DUR); // capped at audio duration
  // For remote zombies, fast-forward the timer by network latency so they
  // don't appear underground for longer than the round-trip time
  const elapsedSec = z._remoteSpawnMs
    ? Math.min((Date.now() - z._remoteSpawnMs) / 1000, z._spawnDur)
    : 0;
  z._spawnTimer = elapsedSec;
  z._spawnRising = elapsedSec < z._spawnDur;

  const spriteSheet = sheets[z._spriteVariant];

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = ZOMBIE_SPRITE_SIZE;
  frameCanvas.height = ZOMBIE_SPRITE_SIZE;
  const fCtx = frameCanvas.getContext('2d');
  fCtx.drawImage(spriteSheet, 0, 0, ZOMBIE_SPRITE_SIZE, ZOMBIE_SPRITE_SIZE, 0, 0, ZOMBIE_SPRITE_SIZE, ZOMBIE_SPRITE_SIZE);

  const tex = new THREE.CanvasTexture(frameCanvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const spriteH = 2.2 * scale;

  // Use PlaneGeometry instead of Sprite for precise ground positioning
  const planeGeo = new THREE.PlaneGeometry(spriteH, spriteH);
  // Shift geometry up so bottom edge is at y=0 (feet on ground)
  planeGeo.translate(0, spriteH / 2, 0);

  const planeMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(planeGeo, planeMat);
  group.add(mesh);

  // Eye glow colour — actual light is drawn from a shared pool (see updateZombieEyeLightPool)
  // to keep the scene's point-light count CONSTANT and avoid Three.js shader recompiles
  // (which caused random massive frame spikes when zombie count changed).
  z._eyeColor = z.isBoss ? 0xffff00 : z.isElite ? 0xff6600 : 0xff1e0a;

  // HP bar (polished, wider canvas for detail)
  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = 256; hpCanvas.height = 24;
  const hpTex = new THREE.CanvasTexture(hpCanvas);
  hpTex.minFilter = THREE.LinearFilter;
  const hpMaterial = new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthTest: false });
  const hpSprite = new THREE.Sprite(hpMaterial);
  hpSprite.scale.set(1.8*scale, 0.18*scale, 1);
  hpSprite.position.y = spriteH + 0.22;
  hpSprite.renderOrder = 999;
  hpSprite.visible = false;
  group.add(hpSprite);

  // === BOSS VISUAL DISTINCTION (S4.2) ===
  // Light + shadow come from the shared pool in initBossFx() — don't
  // allocate per-boss. Allocating a new PointLight here at spawn time
  // would bump Three.js's light count and force a full shader recompile
  // across every material in the scene, which is what caused the
  // visible frame hitch when a boss appeared.
  if (z.isBoss) {
    planeMat.color.set(0xff8888); // red tint on sprite
    if (_bossLight) _bossLight.intensity = 0.8;
    if (_bossShadow) _bossShadow.visible = true;
  }

  _scene.add(group);

  zombieMeshes.set(z, {
    group, mesh, planeMat, tex, frameCanvas,
    hpSprite, hpCanvas, hpTex, spriteSheet, spriteH,
  });
  return group;
}

function updateZombieMesh(z, dt) {
  const data = zombieMeshes.get(z);
  if (!data) return;
  const { group, mesh, planeMat, tex, frameCanvas,
    hpSprite, hpCanvas, hpTex, spriteSheet, spriteH } = data;

  // === SPAWN RISING ANIMATION ===
  let yOff = 0;
  if (z._spawnRising) {
    z._spawnTimer += dt;
    // Safety cap: if rise animation hangs >5s (3x max normal duration),
    // force-clear so the zombie can't be stuck underground indefinitely.
    if (z._spawnTimer > 5) {
      z._spawnRising = false;
      yOff = 0;
    } else {
      const progress = Math.min(z._spawnTimer / z._spawnDur, 1);
      // Ease-out cubic for natural "pulling free from earth" feel
      const ease = 1 - Math.pow(1 - progress, 3);
      yOff = -SPAWN_RISE_DEPTH * (1 - ease);
      // Slight wobble as they struggle to emerge
      const wobble = Math.sin(z._spawnTimer * 12) * 0.03 * (1 - progress);
      mesh.rotation.z = wobble;
      if (progress >= 1) {
        z._spawnRising = false;
        yOff = 0;
      }
    }
  } else if (z._hasLimp) {
    yOff = Math.abs(Math.sin(z._limpPhase)) * 0.08 * z._limpSeverity;
    mesh.rotation.z = Math.sin(z._limpPhase) * 0.04 * z._limpSeverity;
  } else {
    mesh.rotation.z = 0;
  }

  // Smooth position interpolation to reduce glitchiness
  if (!z._renderX) { z._renderX = z.wx; z._renderZ = z.wz; }
  const lerpFactor = Math.min(1, dt * 15);
  z._renderX += (z.wx - z._renderX) * lerpFactor;
  z._renderZ += (z.wz - z._renderZ) * lerpFactor;
  // Climb-through vault offset — set by the window AI when a zombie
  // is mid-breach so the model arcs over the sill instead of popping
  // to the inside-bunker position.
  const climbY = z._climbYOff || 0;
  group.position.set(z._renderX, yOff + climbY, z._renderZ);

  // Billboard: smooth Y-axis rotation to face camera
  const dx = _camera.position.x - group.position.x;
  const dz = _camera.position.z - group.position.z;
  const targetRotY = Math.atan2(dx, dz);
  if (!z._renderRotY) z._renderRotY = targetRotY;
  // Shortest angle lerp
  let rotDiff = targetRotY - z._renderRotY;
  while (rotDiff > Math.PI) rotDiff -= PI2;
  while (rotDiff < -Math.PI) rotDiff += PI2;
  z._renderRotY += rotDiff * Math.min(1, dt * 12);
  mesh.rotation.y = z._renderRotY;

  // Animate walk cycle using real dt
  z._frameTimer += dt;
  if (z._frameTimer >= z._frameSpeed) {
    z._frameTimer -= z._frameSpeed;
    z._spriteFrame = (z._spriteFrame + 1) % ZOMBIE_FRAMES;
    const fCtx = frameCanvas.getContext('2d');
    fCtx.clearRect(0, 0, ZOMBIE_SPRITE_SIZE, ZOMBIE_SPRITE_SIZE);
    fCtx.drawImage(spriteSheet,
      z._spriteFrame * ZOMBIE_SPRITE_SIZE, 0, ZOMBIE_SPRITE_SIZE, ZOMBIE_SPRITE_SIZE,
      0, 0, ZOMBIE_SPRITE_SIZE, ZOMBIE_SPRITE_SIZE);
    tex.needsUpdate = true;
  }

  // Hit flash — boss keeps red tint when not flashing (S4.2)
  if (z.flash > 0) {
    planeMat.color.setRGB(1, 0.3, 0.3);
  } else if (z.isBoss) {
    // Phase 3 enraged: intensify red tint
    const phase = z._bossPhase || 1;
    if (phase >= 3) {
      planeMat.color.setRGB(1, 0.4, 0.4);
    } else {
      planeMat.color.setRGB(1, 0.53, 0.53); // 0xff8888
    }
  } else {
    planeMat.color.setRGB(1, 1, 1);
  }

  // Eye light flicker is now driven by the shared pool in updateZombieEyeLightPool

  // === BOSS LIGHT FLICKER (S4.2) — Phase 3 rapid flicker ===
  // Light + shadow are shared (see initBossFx). Position them under
  // this boss each frame and drive flicker based on phase. Only one
  // boss at a time by design (last zombie of every 5th round), so the
  // single pair works.
  if (z.isBoss && _bossLight && _bossShadow) {
    _bossLight.position.set(z.wx, spriteH * 0.5, z.wz);
    _bossShadow.position.set(z.wx, 0.05, z.wz);
    const phase = z._bossPhase || 1;
    if (phase >= 3) {
      _bossLight.intensity = 0.6 + Math.random() * 1.2;
      _bossLight.color.setHex(Math.random() > 0.3 ? 0xff4400 : 0xff2200);
    } else if (phase >= 2) {
      _bossLight.intensity = 0.8 + Math.sin(performance.now() * 0.005) * 0.3;
    } else {
      _bossLight.intensity = 0.8;
    }
  }

  // HP bar (polished with rounded edges, glow, gradient layers)
  if (z.hp < z.maxHp) {
    hpSprite.visible = true;
    const ctx = hpCanvas.getContext('2d');
    const W = 256, H = 24;
    const pad = 3, rad = 4;
    const barH = H - pad * 2;
    const barW = W - pad * 2;
    ctx.clearRect(0, 0, W, H);

    // Outer shadow / glow
    ctx.save();
    ctx.shadowColor = z.isBoss ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.roundRect(pad, pad, barW, barH, rad);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fill();
    ctx.restore();

    // Inner track (subtle inset)
    const trackGrad = ctx.createLinearGradient(0, pad, 0, pad + barH);
    trackGrad.addColorStop(0, 'rgba(20,0,0,0.9)');
    trackGrad.addColorStop(1, 'rgba(40,5,5,0.7)');
    ctx.beginPath();
    ctx.roundRect(pad, pad, barW, barH, rad);
    ctx.fillStyle = trackGrad;
    ctx.fill();

    // Health fill
    const ratio = Math.max(0, z.hp / z.maxHp);
    const fillW = Math.max(rad * 2, barW * ratio);

    // Color selection
    let c1, c2, c3;
    if (z.isBoss) { c1 = '#ff1a1a'; c2 = '#cc0000'; c3 = '#880000'; }
    else if (z.isElite) { c1 = '#ff8800'; c2 = '#cc5500'; c3 = '#883300'; }
    else if (ratio > 0.5) { c1 = '#dd2020'; c2 = '#aa0808'; c3 = '#771010'; }
    else if (ratio > 0.25) { c1 = '#dd5500'; c2 = '#bb3300'; c3 = '#882200'; }
    else { c1 = '#ff2222'; c2 = '#cc0000'; c3 = '#880000'; }

    // Main fill gradient (vertical for depth)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad, fillW, barH, [rad, ratio > 0.95 ? rad : 1, ratio > 0.95 ? rad : 1, rad]);
    ctx.clip();
    const fillGrad = ctx.createLinearGradient(0, pad, 0, pad + barH);
    fillGrad.addColorStop(0, c1);
    fillGrad.addColorStop(0.45, c2);
    fillGrad.addColorStop(1, c3);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(pad, pad, fillW, barH);

    // Top highlight (glass effect)
    const hlGrad = ctx.createLinearGradient(0, pad, 0, pad + barH * 0.5);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.28)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.fillRect(pad, pad, fillW, barH * 0.5);

    // Subtle edge light on right side of fill
    if (ratio < 0.98 && ratio > 0.02) {
      const edgeGrad = ctx.createLinearGradient(pad + fillW - 4, 0, pad + fillW, 0);
      edgeGrad.addColorStop(0, 'rgba(255,255,255,0)');
      edgeGrad.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(pad + fillW - 4, pad + 1, 4, barH - 2);
    }
    ctx.restore();

    // Thin border
    ctx.beginPath();
    ctx.roundRect(pad + 0.5, pad + 0.5, barW - 1, barH - 1, rad);
    ctx.strokeStyle = z.isBoss ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks (every 25%)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const tx = pad + barW * (i / 4);
      ctx.beginPath();
      ctx.moveTo(tx, pad + 2);
      ctx.lineTo(tx, pad + barH - 2);
      ctx.stroke();
    }

    hpTex.needsUpdate = true;
  } else {
    hpSprite.visible = false;
  }
}

function removeZombieMesh(z) {
  const data = zombieMeshes.get(z);
  if (data) {
    _scene.remove(data.group);
    // Dispose geometry, materials, textures to prevent memory leaks
    data.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    if (data.hpTex) data.hpTex.dispose();
    if (data.tex) data.tex.dispose();
    zombieMeshes.delete(z);
  }
  // Boss just died: park the shared FX off-screen. The actual Three.js
  // objects stay in the scene so there's no light-count churn on the
  // next boss spawn.
  if (z && z.isBoss) {
    if (_bossLight) {
      _bossLight.intensity = 0;
      _bossLight.position.set(0, -1000, 0);
    }
    if (_bossShadow) {
      _bossShadow.visible = false;
      _bossShadow.position.set(0, -1000, 0);
    }
  }
}



// Export sprite system
export {
  ZOMBIE_SPRITE_SIZE, ZOMBIE_FRAMES, ZOMBIE_VARIANTS,
  zombieSpriteSheets, initZombieSprites, createZombieSpriteSheet, drawZombieFrame,
  zombieMeshes, createZombieMesh, removeZombieMesh, updateZombieMesh,
  updateZombieEyeLightPool
};
