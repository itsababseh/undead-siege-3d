// Loading screen animation and progress management
// Extracted from main.js

import { initMenuBackground, showMenuScoresEnhanced } from './menu.js';

// ===== LOADING SCREEN ANIMATION =====
function initLoadScreen() {
  const canvas = document.getElementById('loadCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;
  
  // Floating particles for atmosphere
  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.5 - 0.1,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
      color: Math.random() > 0.7 ? '200,0,0' : '255,255,255'
    });
  }
  
  function drawLoadParticles() {
    ctx.clearRect(0, 0, w, h);
    // Subtle radial gradient background
    const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*0.6);
    grd.addColorStop(0, 'rgba(30,0,0,0.15)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
      ctx.fill();
    }
    if (!document.getElementById('loadScreen').classList.contains('done')) {
      requestAnimationFrame(drawLoadParticles);
    }
  }
  drawLoadParticles();
  
  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });
}

// Loading progress simulation — ticks as Three.js assets load
const loadProgress = { value: 0, target: 0 };
const loadTips = [
  'Preparing the bunker...', 'Loading weapons cache...', 'Waking the undead...',
  'Fortifying defenses...', 'Tuning radio frequencies...', 'Charging Ray Gun...'
];
function updateLoadBar(pct, tip) {
  loadProgress.target = pct;
  const fill = document.getElementById('loadBarFill');
  const tipEl = document.getElementById('loadTip');
  if (fill) fill.style.width = pct + '%';
  if (tip && tipEl) tipEl.textContent = tip;
}
function finishLoading() {
  updateLoadBar(100, 'Ready for combat');
  setTimeout(() => {
    const ls = document.getElementById('loadScreen');
    if (ls) {
      ls.classList.add('done');
      setTimeout(() => { ls.style.display = 'none'; }, 700);
    }
    // Show menu
    const blocker = document.getElementById('blocker');
    blocker.classList.remove('hidden');
    blocker.style.opacity = '0';
    requestAnimationFrame(() => {
      blocker.style.transition = 'opacity 0.8s ease-in';
      blocker.style.opacity = '1';
    });
    initMenuBackground();
    showMenuScoresEnhanced();
  }, 400);
}


export { loadTips, loadProgress, initLoadScreen, updateLoadBar, finishLoading };
