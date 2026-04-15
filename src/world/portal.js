// Vibe Jam 2026 Portal System
// Redesigned: hazard "caution tape" door that opens automatically (free entry)
// to reveal the interdimensional Vibe Jam portal beyond. Uses modern principles
// — procedural textures, emissive/bloom-friendly materials, eased animation,
// particle sparks, and a floor decal to telegraph the entry zone.
import * as THREE from 'three';

// ---- Dependency injection from main ----------------------------------------
let _scene, _camera, _TILE;
export function setPortalDeps(scene, camera, TILE) {
  _scene = scene; _camera = camera; _TILE = TILE;
}

// ---- URL portal handshake --------------------------------------------------
const _vjPortalParams = new URLSearchParams(window.location.search);
export const _arrivedViaPortal = _vjPortalParams.get('portal') === 'true' || _vjPortalParams.get('portal') === '1';
const _portalReferer = _vjPortalParams.get('ref') || '';

// ---- Module state ----------------------------------------------------------
let _exitPortalGroup = null;
let _startPortalGroup = null;
let _startPortalActiveAt = 0;
let _portalInited = false;

// Door state
let _portalDoor = null;
let _leftPanel = null, _rightPanel = null;
let _doorT = 0;               // 0..1 eased open progress
let _doorTarget = 0;          // where we're going (0 closed, 1 open)
let _animatedMaterials = [];  // {mat, base, amp, speed}
let _hazardLights = [];       // pulsing warning lamps
let _tapeMaterials = [];      // animated caution-tape materials (uv scroll)
let _sparks = null;           // particle system for door sparks
let _floorDecalMat = null;    // pulsing floor warning decal
let _doorKeyHighlight = null; // subtle scan line across the door

// ===========================================================================
// Helpers
// ===========================================================================

// Procedural diagonal caution-tape texture (yellow + black 45° stripes)
function _makeCautionTapeTexture({ stripes = 8, text = '', worn = true } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');

  // Base amber
  g.fillStyle = '#ffcc00';
  g.fillRect(0, 0, c.width, c.height);

  // Diagonal black stripes
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(-Math.PI / 4);
  const stripeW = 90;
  const span = Math.hypot(c.width, c.height);
  for (let x = -span; x < span; x += stripeW * 2) {
    g.fillStyle = '#111111';
    g.fillRect(x, -span, stripeW, span * 2);
  }
  g.restore();

  // Optional text overlay along the middle
  if (text) {
    g.save();
    g.fillStyle = '#ffe44d';
    g.font = 'bold 64px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 4;
    g.strokeStyle = '#000';
    const repeats = 3;
    for (let i = 0; i < repeats; i++) {
      const x = (c.width / repeats) * (i + 0.5);
      g.strokeText(text, x, c.height / 2);
      g.fillText(text, x, c.height / 2);
    }
    g.restore();
  }

  // Subtle wear / grunge
  if (worn) {
    g.globalAlpha = 0.12;
    for (let i = 0; i < 400; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      const r = Math.random() * 2 + 0.5;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, r, r);
    }
    g.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sharp hazard diamond sign (black triangle + exclamation on yellow)
function _makeHazardSignTexture(label = 'CAUTION') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  // transparent bg
  g.clearRect(0, 0, c.width, c.height);

  // Yellow diamond
  g.save();
  g.translate(c.width / 2, 220);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#ffcc00';
  g.strokeStyle = '#000';
  g.lineWidth = 14;
  g.fillRect(-170, -170, 340, 340);
  g.strokeRect(-170, -170, 340, 340);
  g.restore();

  // Exclamation
  g.fillStyle = '#111';
  g.font = 'bold 260px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', c.width / 2, 230);

  // Caption
  g.fillStyle = '#ffcc00';
  g.strokeStyle = '#000';
  g.lineWidth = 8;
  g.font = 'bold 72px Impact, "Arial Black", sans-serif';
  g.strokeText(label, c.width / 2, 450);
  g.fillText(label, c.width / 2, 450);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Welcoming sub-sign: "FREE ENTRY — STEP THROUGH"
function _makeFreeEntrySignTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');

  // Dark industrial plate
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#0b0b0f');
  grd.addColorStop(1, '#1a1a22');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);

  // Neon border
  g.strokeStyle = '#00ffcc';
  g.lineWidth = 6;
  g.shadowColor = '#00ffcc';
  g.shadowBlur = 24;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);

  // Main text
  g.shadowBlur = 16;
  g.fillStyle = '#00ffcc';
  g.font = 'bold 78px "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FREE ENTRY', c.width / 2, 95);

  g.shadowBlur = 8;
  g.fillStyle = '#e8fff8';
  g.font = 'bold 44px "Courier New", monospace';
  g.fillText('» STEP THROUGH «', c.width / 2, 180);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Circular floor decal with rotating hazard ring
function _makeFloorDecalTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const cx = c.width / 2, cy = c.height / 2;

  // Outer ring — striped
  const outer = 230, inner = 180;
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, outer, (i / segs) * Math.PI * 2, ((i + 1) / segs) * Math.PI * 2);
    g.closePath();
    g.fillStyle = i % 2 === 0 ? '#ffcc00' : '#111';
    g.fill();
  }
  // Cut inner hole
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(cx, cy, inner, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';

  // Inner chevrons arrow pointing up
  g.fillStyle = '#00ffcc';
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    const y = cy + 40 - i * 40;
    g.beginPath();
    g.moveTo(cx - 70, y + 20);
    g.lineTo(cx, y - 20);
    g.lineTo(cx + 70, y + 20);
    g.lineTo(cx + 50, y + 20);
    g.lineTo(cx, y);
    g.lineTo(cx - 50, y + 20);
    g.closePath();
    g.fill();
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cubic ease-out for door motion — feels snappy and responsive
function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ===========================================================================
// Portal ring (unchanged visual language, slightly polished)
// ===========================================================================
function _makePortalMesh(color, pos, label) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);

  // Glowing torus ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.35, 16, 64),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.8,
      transparent: true, opacity: 0.9, metalness: 0.2, roughness: 0.3
    })
  );
  group.add(ring);

  // Inner swirling disc
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  group.add(disc);

  // Particle swirl
  const pCount = 360;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount * 3);
  const pColors = new Float32Array(pCount * 3);
  const pr = ((color >> 16) & 0xff) / 255, pg = ((color >> 8) & 0xff) / 255, pb = (color & 0xff) / 255;
  for (let i = 0; i < pCount * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + (Math.random() - 0.5) * 0.8;
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius;
    positions[i + 2] = (Math.random() - 0.5) * 0.6;
    const jitter = 0.8 + Math.random() * 0.2;
    pColors[i] = pr * jitter; pColors[i + 1] = pg * jitter; pColors[i + 2] = pb * jitter;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  group.add(new THREE.Points(geom, new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
  })));

  // Optional label above portal
  if (label) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center';
    ctx.fillText(label, 256, 42);
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.8),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide })
    );
    labelMesh.position.y = 3.5;
    group.add(labelMesh);
  }

  const light = new THREE.PointLight(color, 2, 12);
  light.position.copy(group.position);
  return { group, light, particles: geom };
}

// ===========================================================================
// Caution-tape portal DOORWAY
// ===========================================================================
function _createPortalDoor() {
  const doorGroup = new THREE.Group();

  // Position: in front of the portal, centered in the tile
  const doorPos = { x: 17 * _TILE + _TILE / 2, z: 3 * _TILE + _TILE / 2 - 1 };
  doorGroup.position.set(doorPos.x, 0, doorPos.z);

  // ---- Heavy industrial frame ---------------------------------------------
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a20, metalness: 0.85, roughness: 0.35,
    emissive: 0x0a0a0a
  });

  // Top lintel
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.35, 0.55), frameMat);
  lintel.position.set(0, 3.25, 0);
  doorGroup.add(lintel);

  // Side posts
  const post = new THREE.BoxGeometry(0.35, 3.2, 0.55);
  const leftPost = new THREE.Mesh(post, frameMat);
  leftPost.position.set(-2.15, 1.6, 0);
  doorGroup.add(leftPost);
  const rightPost = new THREE.Mesh(post, frameMat);
  rightPost.position.set(2.15, 1.6, 0);
  doorGroup.add(rightPost);

  // Threshold bar at the bottom (tripping hazard strip)
  const thresholdMat = new THREE.MeshStandardMaterial({
    map: _makeCautionTapeTexture({ text: '' }),
    metalness: 0.1, roughness: 0.8,
    emissive: 0x221a00, emissiveIntensity: 0.35
  });
  thresholdMat.map.repeat.set(3, 1);
  _tapeMaterials.push(thresholdMat);
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.18, 0.35), thresholdMat);
  threshold.position.set(0, 0.09, 0);
  doorGroup.add(threshold);

  // ---- Caution-tape door panels (sliding) ---------------------------------
  const tapeTex = _makeCautionTapeTexture({ text: 'CAUTION' });
  tapeTex.repeat.set(1.2, 1);
  _tapeMaterials.push({ _scroll: true, tex: tapeTex });

  const panelMat = new THREE.MeshStandardMaterial({
    map: tapeTex,
    metalness: 0.15, roughness: 0.6,
    emissive: 0x332200, emissiveIntensity: 0.55,
    side: THREE.DoubleSide
  });

  const panelGeo = new THREE.BoxGeometry(1.95, 2.9, 0.12);
  _leftPanel = new THREE.Mesh(panelGeo, panelMat);
  _leftPanel.position.set(-1.0, 1.6, 0.06);
  _leftPanel.userData.closedX = -1.0;
  _leftPanel.userData.openX = -3.4;
  doorGroup.add(_leftPanel);

  _rightPanel = new THREE.Mesh(panelGeo, panelMat.clone());
  _rightPanel.material.map = tapeTex;
  _rightPanel.position.set(1.0, 1.6, 0.06);
  _rightPanel.userData.closedX = 1.0;
  _rightPanel.userData.openX = 3.4;
  doorGroup.add(_rightPanel);

  // Subtle beveled edges on the inner seam of each panel (emissive accent)
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 2.2
  });
  const seamGeo = new THREE.BoxGeometry(0.04, 2.8, 0.14);
  const leftSeam = new THREE.Mesh(seamGeo, seamMat);
  leftSeam.position.set(1.0, 0, 0.02);
  _leftPanel.add(leftSeam);
  const rightSeam = new THREE.Mesh(seamGeo, seamMat);
  rightSeam.position.set(-1.0, 0, 0.02);
  _rightPanel.add(rightSeam);
  _animatedMaterials.push({ mat: seamMat, base: 2.2, amp: 1.2, speed: 4.0 });

  // ---- Horizontal caution tapes stretched across the opening --------------
  // These strips visually reinforce "caution" and scroll subtly when closed.
  const stripTex = _makeCautionTapeTexture();
  stripTex.repeat.set(3, 1);
  const stripMat = new THREE.MeshStandardMaterial({
    map: stripTex, transparent: true, side: THREE.DoubleSide,
    emissive: 0x332200, emissiveIntensity: 0.7,
    metalness: 0.0, roughness: 0.9
  });
  _tapeMaterials.push({ _scroll: true, tex: stripTex });

  const stripHeights = [0.6, 1.6, 2.6];
  stripHeights.forEach((y, i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.22), stripMat.clone());
    s.material.map = stripTex;
    s.position.set(0, y, 0.14 + (i % 2) * 0.02);
    s.rotation.z = (i === 1 ? 0 : (i === 0 ? 0.03 : -0.03));
    s.userData.isTapeStrip = true;
    s.userData.origY = y;
    doorGroup.add(s);
  });

  // ---- Hazard signage above the door --------------------------------------
  const hazardMat = new THREE.MeshBasicMaterial({
    map: _makeHazardSignTexture('CAUTION'),
    transparent: true, side: THREE.DoubleSide
  });
  const hazardSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), hazardMat);
  hazardSign.position.set(-1.55, 3.85, 0.3);
  doorGroup.add(hazardSign);

  const hazardSign2 = hazardSign.clone();
  hazardSign2.material = hazardMat; // share
  hazardSign2.position.x = 1.55;
  doorGroup.add(hazardSign2);

  // ---- "FREE ENTRY — STEP THROUGH" plate between the hazard signs ---------
  const freeSignMat = new THREE.MeshBasicMaterial({
    map: _makeFreeEntrySignTexture(), transparent: true, side: THREE.DoubleSide
  });
  const freeSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), freeSignMat);
  freeSign.position.set(0, 3.85, 0.3);
  doorGroup.add(freeSign);

  // ---- Pulsing hazard dome lamps on each corner of the frame --------------
  const lampGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const makeLamp = (x, y, color = 0xffaa00) => {
    const m = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 2.0,
      roughness: 0.3, metalness: 0.4
    });
    const lamp = new THREE.Mesh(lampGeo, m);
    lamp.position.set(x, y, 0.3);
    doorGroup.add(lamp);
    const light = new THREE.PointLight(color, 0.8, 5);
    light.position.copy(lamp.position);
    doorGroup.add(light);
    _hazardLights.push({ mat: m, light });
    _animatedMaterials.push({ mat: m, base: 2.0, amp: 1.5, speed: 3.2 });
    return lamp;
  };
  makeLamp(-2.4, 3.35);
  makeLamp( 2.4, 3.35);
  makeLamp(-2.4, 0.35);
  makeLamp( 2.4, 0.35);

  // ---- Top status bar (cyan LED strip) ------------------------------------
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 2.5
  });
  const led = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.06, 0.06), ledMat);
  led.position.set(0, 3.12, 0.32);
  doorGroup.add(led);
  _animatedMaterials.push({ mat: ledMat, base: 2.5, amp: 1.0, speed: 2.5 });

  // ---- Floor decal telegraphing the entry zone ----------------------------
  _floorDecalMat = new THREE.MeshBasicMaterial({
    map: _makeFloorDecalTexture(), transparent: true, depthWrite: false,
    opacity: 0.9, side: THREE.DoubleSide
  });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), _floorDecalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(0, 0.02, -1.6); // in front of the door, toward the player
  doorGroup.add(decal);
  decal.userData.isFloorDecal = true;

  // ---- Subtle "scan line" highlight that sweeps across the panels ---------
  _doorKeyHighlight = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 0.08),
    new THREE.MeshBasicMaterial({
      color: 0x00ffcc, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  _doorKeyHighlight.position.set(0, 1.6, 0.18);
  doorGroup.add(_doorKeyHighlight);

  // ---- Sparks particle system near the panel seams ------------------------
  const SPARK_COUNT = 60;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(SPARK_COUNT * 3);
  const sv = new Float32Array(SPARK_COUNT * 3); // velocities
  for (let i = 0; i < SPARK_COUNT; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 0.2;
    sp[i * 3 + 1] = 0.3 + Math.random() * 2.8;
    sp[i * 3 + 2] = 0.2;
    sv[i * 3] = (Math.random() - 0.5) * 0.4;
    sv[i * 3 + 1] = Math.random() * 0.8 + 0.2;
    sv[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.userData.vel = sv;
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffdd66, size: 0.06, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  _sparks = new THREE.Points(sg, sparkMat);
  doorGroup.add(_sparks);

  return doorGroup;
}

// ===========================================================================
// Public API
// ===========================================================================
export function initVibeJamPortals() {
  if (_portalInited) return;
  _portalInited = true;

  // Caution-tape door goes first
  _portalDoor = _createPortalDoor();
  _scene.add(_portalDoor);

  // Exit portal sits behind the door
  const exitPos = { x: 17 * _TILE + _TILE / 2, y: 1.6, z: 3 * _TILE + _TILE / 2 + 1.5 };
  const ep = _makePortalMesh(0x00ff44, exitPos, 'VIBE JAM 2026');
  _exitPortalGroup = ep;
  _scene.add(ep.group); _scene.add(ep.light);

  // Return portal — only if player arrived via another jam game
  if (_arrivedViaPortal && _portalReferer) {
    const startPos = { x: 12 * _TILE, y: 1.6, z: 13 * _TILE };
    const sp = _makePortalMesh(0xff4444, startPos, 'RETURN PORTAL');
    _startPortalGroup = sp;
    _scene.add(sp.group); _scene.add(sp.light);
    _startPortalActiveAt = Date.now() + 5000;
  }
}

export function animateVibeJamPortals(dt, state) {
  if (!_portalInited) return;
  const t = Date.now() * 0.001;

  // --- Caution tape UV scroll + material pulse ----------------------------
  for (let i = 0; i < _tapeMaterials.length; i++) {
    const entry = _tapeMaterials[i];
    if (entry && entry._scroll && entry.tex) {
      entry.tex.offset.x -= dt * 0.12;
    }
  }
  for (let i = 0; i < _animatedMaterials.length; i++) {
    const a = _animatedMaterials[i];
    a.mat.emissiveIntensity = a.base + Math.sin(t * a.speed + i) * a.amp;
  }

  // --- Door proximity: AUTO OPEN (free entry) -----------------------------
  if (_portalDoor && (state === 'playing' || state === 'roundIntro')) {
    const doorX = 17 * _TILE + _TILE / 2;
    const doorZ = 3 * _TILE + _TILE / 2 - 1;
    const dx = _camera.position.x - doorX;
    const dz = _camera.position.z - doorZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Open when approaching, stay open while near; gently close when far.
    _doorTarget = distance < 6 ? 1 : (distance > 9 ? 0 : _doorTarget);
  }

  // Ease progress toward target
  if (_portalDoor && _leftPanel && _rightPanel) {
    const rate = 2.2; // seconds to go 0->1
    _doorT += Math.sign(_doorTarget - _doorT) * Math.min(Math.abs(_doorTarget - _doorT), dt * rate);
    const eased = _easeOutCubic(Math.max(0, Math.min(1, _doorT)));
    _leftPanel.position.x  = THREE.MathUtils.lerp(_leftPanel.userData.closedX,  _leftPanel.userData.openX,  eased);
    _rightPanel.position.x = THREE.MathUtils.lerp(_rightPanel.userData.closedX, _rightPanel.userData.openX, eased);

    // Subtle shake during fast motion (feels more kinetic)
    const vel = Math.abs(_doorTarget - _doorT);
    const shake = vel > 0.02 ? (Math.sin(t * 60) * 0.01) : 0;
    _leftPanel.position.y = 1.6 + shake;
    _rightPanel.position.y = 1.6 - shake;

    // Sweep highlight: from bottom to top when opening
    if (_doorKeyHighlight) {
      const sweepT = (t * 0.6) % 1;
      _doorKeyHighlight.position.y = 0.3 + sweepT * 2.8;
      _doorKeyHighlight.material.opacity = (1 - eased) * 0.6;
    }

    // Floor decal pulse — brighter when door is closed/opening
    if (_floorDecalMat) {
      const base = 0.55;
      const pulse = 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2));
      _floorDecalMat.opacity = base + pulse * (1 - eased * 0.6);
    }

    // Sparks — emit more while opening, fade when fully open or closed
    if (_sparks) {
      const active = vel > 0.015 ? 1 : 0;
      _sparks.material.opacity = THREE.MathUtils.lerp(_sparks.material.opacity, 0.7 * active, Math.min(1, dt * 8));
      const pos = _sparks.geometry.attributes.position.array;
      const vel2 = _sparks.geometry.userData.vel;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i]     += vel2[i]     * dt;
        pos[i + 1] += vel2[i + 1] * dt;
        pos[i + 2] += vel2[i + 2] * dt;
        if (pos[i + 1] > 3.2 || Math.abs(pos[i]) > 2.2) {
          pos[i] = (Math.random() - 0.5) * 0.2;
          pos[i + 1] = 0.3;
          pos[i + 2] = 0.2;
        }
      }
      _sparks.geometry.attributes.position.needsUpdate = true;
    }

    // Hazard lamps — flicker slightly faster when door is actively moving
    for (let i = 0; i < _hazardLights.length; i++) {
      const h = _hazardLights[i];
      const base = vel > 0.01 ? 2.8 : 1.6;
      const amp = vel > 0.01 ? 1.8 : 0.8;
      h.mat.emissiveIntensity = base + Math.sin(t * 6 + i * 1.3) * amp;
      h.light.intensity = 0.6 + 0.4 * Math.sin(t * 6 + i * 1.3);
    }
  }

  // --- Exit portal ---------------------------------------------------------
  if (_exitPortalGroup) {
    _exitPortalGroup.group.rotation.z += dt * 0.5;
    const pp = _exitPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i);
    _exitPortalGroup.particles.attributes.position.needsUpdate = true;
    _exitPortalGroup.light.intensity = 2 + Math.sin(t * 3) * 0.8;

    // Trigger when the door is sufficiently open (>= 70%)
    if (_doorT > 0.7 && (state === 'playing' || state === 'roundIntro')) {
      const dx = _camera.position.x - _exitPortalGroup.group.position.x;
      const dz = _camera.position.z - _exitPortalGroup.group.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 3) _triggerExitPortal();
    }
  }

  // --- Return portal -------------------------------------------------------
  if (_startPortalGroup) {
    _startPortalGroup.group.rotation.z -= dt * 0.5;
    const pp = _startPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i * 0.7);
    _startPortalGroup.particles.attributes.position.needsUpdate = true;
    _startPortalGroup.light.intensity = 2 + Math.sin(t * 2.5) * 0.8;
    if (Date.now() >= _startPortalActiveAt && (state === 'playing' || state === 'roundIntro')) {
      const dx = _camera.position.x - _startPortalGroup.group.position.x;
      const dz = _camera.position.z - _startPortalGroup.group.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 3) _triggerReturnPortal();
    }
  }
}

export function _triggerExitPortal() {
  const params = new URLSearchParams();
  params.set('portal', 'true');
  params.set('ref', window.location.hostname);
  params.set('username', 'Survivor');
  params.set('color', 'red');
  window.location.href = 'https://vibej.am/portal/2026?' + params.toString();
}

export function _triggerReturnPortal() {
  let url = _portalReferer;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const params = new URLSearchParams(window.location.search);
  params.delete('ref');
  const s = params.toString();
  window.location.href = url + (s ? '?' + s : '');
}

export function cleanupVibeJamPortals() {
  if (_exitPortalGroup) { _scene.remove(_exitPortalGroup.group); _scene.remove(_exitPortalGroup.light); _exitPortalGroup = null; }
  if (_startPortalGroup) { _scene.remove(_startPortalGroup.group); _scene.remove(_startPortalGroup.light); _startPortalGroup = null; }
  if (_portalDoor) { _scene.remove(_portalDoor); _portalDoor = null; }
  _animatedMaterials.length = 0;
  _hazardLights.length = 0;
  _tapeMaterials.length = 0;
  _leftPanel = null; _rightPanel = null;
  _sparks = null; _floorDecalMat = null; _doorKeyHighlight = null;
  _doorT = 0; _doorTarget = 0;
  _portalInited = false;
}

// Incoming portal users — pre-open the door so they can walk straight through.
export function handleIncomingPortalUser() {
  if (_portalInited && _portalDoor) {
    _doorTarget = 1;
  }
}
