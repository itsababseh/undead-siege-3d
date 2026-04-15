// Vibe Jam 2026 Portal System
import * as THREE from 'three';

// Portal system depends on scene/camera/TILE — passed via init
let _scene, _camera, _TILE;

export function setPortalDeps(scene, camera, TILE) {
  _scene = scene; _camera = camera; _TILE = TILE;
}

const _vjPortalParams = new URLSearchParams(window.location.search);
export const _arrivedViaPortal = _vjPortalParams.get('portal') === 'true' || _vjPortalParams.get('portal') === '1';
const _portalReferer = _vjPortalParams.get('ref') || '';
let _exitPortalGroup = null;
let _startPortalGroup = null;
let _startPortalActiveAt = 0;
let _portalInited = false;

function _makePortalMesh(color, pos, label) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  // Glowing torus ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.35, 16, 64),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 })
  );
  group.add(ring);
  // Inner swirling disc
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  group.add(disc);
  // Particle ring
  const pCount = 300;
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
  group.add(new THREE.Points(geom, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.6 })));
  // Label above portal
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

// Portal door system
let _portalDoor = null;
let _doorOpen = false;
let _doorOpening = false;
let _neonSigns = [];

function _createPortalDoor() {
  const doorGroup = new THREE.Group();
  
  // Door position - slightly in front of the portal
  const doorPos = { x: 17 * _TILE + _TILE / 2, y: 1.6, z: 3 * _TILE + _TILE / 2 - 1 };
  doorGroup.position.set(doorPos.x, 0, doorPos.z);
  
  // Main door frame (like from Half-Life/Portal games)
  const frameGeo = new THREE.BoxGeometry(4, 3.2, 0.2);
  const frameMat = new THREE.MeshStandardMaterial({ 
    color: 0x2a2a2a, 
    metalness: 0.8, 
    roughness: 0.3,
    emissive: 0x001122
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.y = 1.6;
  doorGroup.add(frame);
  
  // Door panels (sliding style like in sci-fi games)
  const panelGeo = new THREE.BoxGeometry(1.8, 2.8, 0.15);
  const panelMat = new THREE.MeshStandardMaterial({ 
    color: 0x333366, 
    metalness: 0.7, 
    roughness: 0.2,
    emissive: 0x000033
  });
  
  const leftPanel = new THREE.Mesh(panelGeo, panelMat);
  leftPanel.position.set(-0.9, 1.6, 0.05);
  leftPanel.name = 'leftPanel';
  doorGroup.add(leftPanel);
  
  const rightPanel = new THREE.Mesh(panelGeo, panelMat);
  rightPanel.position.set(0.9, 1.6, 0.05);
  rightPanel.name = 'rightPanel';
  doorGroup.add(rightPanel);
  
  // Neon accent lights (Cyberpunk/Tron style)
  const neonGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.6);
  const neonMat = new THREE.MeshStandardMaterial({ 
    color: 0x00ffcc, 
    emissive: 0x00ffcc, 
    emissiveIntensity: 2
  });
  
  const leftNeon = new THREE.Mesh(neonGeo, neonMat);
  leftNeon.position.set(-1.8, 1.6, 0.1);
  doorGroup.add(leftNeon);
  
  const rightNeon = new THREE.Mesh(neonGeo, neonMat);
  rightNeon.position.set(1.8, 1.6, 0.1);
  doorGroup.add(rightNeon);
  
  // Neon strip lights around frame
  for (let i = 0; i < 8; i++) {
    const stripGeo = new THREE.BoxGeometry(0.5, 0.1, 0.05);
    const strip = new THREE.Mesh(stripGeo, neonMat);
    strip.position.set(-1.75 + i * 0.5, 3, 0.15);
    doorGroup.add(strip);
    _neonSigns.push(strip);
  }
  
  // Portal signage (inspired by Half-Life/Portal)
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 128;
  const ctx = signCanvas.getContext('2d');
  
  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 512, 128);
  
  // Aperture Science style logo/text
  ctx.fillStyle = '#00ffcc';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▲ VIBE JAM PORTAL ▲', 256, 40);
  ctx.font = '16px monospace';
  ctx.fillText('INTERDIMENSIONAL TRAVEL', 256, 65);
  ctx.fillText('[ PRESS E TO ENTER ]', 256, 85);
  ctx.font = '12px monospace';
  ctx.fillText('WARNING: SIDE EFFECTS MAY INCLUDE FUN', 256, 105);
  
  const signGeo = new THREE.PlaneGeometry(4, 1);
  const signMat = new THREE.MeshBasicMaterial({ 
    map: new THREE.CanvasTexture(signCanvas), 
    transparent: true 
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 3.8, 0.2);
  doorGroup.add(sign);
  
  // Warning lights (like in sci-fi games)
  const warningGeo = new THREE.SphereGeometry(0.1);
  const warningMat = new THREE.MeshStandardMaterial({ 
    color: 0xff4444, 
    emissive: 0xff0000, 
    emissiveIntensity: 1.5 
  });
  
  const leftWarning = new THREE.Mesh(warningGeo, warningMat);
  leftWarning.position.set(-2.2, 3.5, 0.2);
  doorGroup.add(leftWarning);
  
  const rightWarning = new THREE.Mesh(warningGeo, warningMat);
  rightWarning.position.set(2.2, 3.5, 0.2);
  doorGroup.add(rightWarning);
  
  _neonSigns.push(leftWarning, rightWarning);
  
  return doorGroup;
}

function _animateDoorOpening(door, dt) {
  if (!_doorOpening) return;
  
  const leftPanel = door.getObjectByName('leftPanel');
  const rightPanel = door.getObjectByName('rightPanel');
  
  if (leftPanel && rightPanel) {
    const speed = dt * 3; // Door opening speed
    leftPanel.position.x = Math.max(-2.5, leftPanel.position.x - speed);
    rightPanel.position.x = Math.min(2.5, rightPanel.position.x + speed);
    
    // Door fully opened
    if (leftPanel.position.x <= -2.4 && rightPanel.position.x >= 2.4) {
      _doorOpen = true;
      _doorOpening = false;
    }
  }
}

export function initVibeJamPortals() {
  if (_portalInited) return;
  _portalInited = true;
  
  // Create the portal door first
  _portalDoor = _createPortalDoor();
  _scene.add(_portalDoor);
  
  // Exit portal — positioned behind the door
  const exitPos = { x: 17 * _TILE + _TILE / 2, y: 1.6, z: 3 * _TILE + _TILE / 2 + 1.5 };
  const ep = _makePortalMesh(0x00ff44, exitPos, '');
  _exitPortalGroup = ep;
  _scene.add(ep.group); _scene.add(ep.light);
  
  // Start (return) portal — only if player arrived via another jam game
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
  
  // Animate neon signs
  _neonSigns.forEach(sign => {
    if (sign.material.emissiveIntensity !== undefined) {
      sign.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.5;
    }
  });
  
  // Animate door opening/closing
  if (_portalDoor) {
    _animateDoorOpening(_portalDoor, dt);
    
    // Check door interaction - closer range for door opening
    if (!_doorOpen && !_doorOpening && (state === 'playing' || state === 'roundIntro')) {
      const doorX = 17 * _TILE + _TILE / 2;
      const doorZ = 3 * _TILE + _TILE / 2 - 1;
      const dx = _camera.position.x - doorX;
      const dz = _camera.position.z - doorZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < 2.5) {
        _doorOpening = true;
      }
    }
  }
  
  if (_exitPortalGroup) {
    _exitPortalGroup.group.rotation.z += dt * 0.5;
    const pp = _exitPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i);
    _exitPortalGroup.particles.attributes.position.needsUpdate = true;
    _exitPortalGroup.light.intensity = 2 + Math.sin(t * 3) * 0.8;
    
    // Check portal entry - only when door is open
    if (_doorOpen && (state === 'playing' || state === 'roundIntro')) {
      const dx = _camera.position.x - _exitPortalGroup.group.position.x;
      const dz = _camera.position.z - _exitPortalGroup.group.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 3) _triggerExitPortal();
    }
  }
  
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
  _neonSigns.length = 0;
  _doorOpen = false;
  _doorOpening = false;
  _portalInited = false;
}

// Add function to handle incoming portal users (for players entering from other games)
export function handleIncomingPortalUser() {
  if (_portalInited && _portalDoor && !_doorOpen && !_doorOpening) {
    _doorOpening = true;
  }
}

