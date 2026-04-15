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

export function initVibeJamPortals() {
  if (_portalInited) return;
  _portalInited = true;
  // Exit portal — in the top-right open area (tile col 17, row 3) — always accessible
  const exitPos = { x: 17 * _TILE + _TILE / 2, y: 1.6, z: 3 * _TILE + _TILE / 2 };
  const ep = _makePortalMesh(0x00ff44, exitPos, 'VIBE JAM PORTAL');
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
  if (_exitPortalGroup) {
    _exitPortalGroup.group.rotation.z += dt * 0.5;
    const pp = _exitPortalGroup.particles.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) pp[i + 1] += 0.03 * Math.sin(t + i);
    _exitPortalGroup.particles.attributes.position.needsUpdate = true;
    _exitPortalGroup.light.intensity = 2 + Math.sin(t * 3) * 0.8;
    // Check proximity
    if (state === 'playing' || state === 'roundIntro') {
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
  _portalInited = false;
}

