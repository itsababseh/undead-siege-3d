// Menu background animation, leaderboard, and enhanced scores display
// Extracted from main.js

import { getPlayerRank } from '../world/story.js';

// ===== MENU BACKGROUND ANIMATION =====
let menuBgActive = false;
function initMenuBackground() {
  const canvas = document.getElementById('menuBgCanvas');
  if (!canvas || menuBgActive) return;
  menuBgActive = true;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;
  
  // Smoky particles + red embers
  const mParticles = [];
  for (let i = 0; i < 40; i++) {
    mParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.4 - 0.05,
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.2 + 0.05,
      isEmber: Math.random() > 0.75
    });
  }
  
  function drawMenuBg() {
    if (!menuBgActive) return;
    ctx.clearRect(0, 0, w, h);
    
    // Dark vignette
    const grd = ctx.createRadialGradient(w/2, h*0.4, w*0.15, w/2, h*0.4, w*0.7);
    grd.addColorStop(0, 'rgba(20,0,0,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    
    const t = performance.now() / 1000;
    for (const p of mParticles) {
      p.x += p.vx + Math.sin(t + p.y * 0.01) * 0.1;
      p.y += p.vy;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      if (p.isEmber) {
        const flicker = 0.5 + Math.sin(t * 3 + p.x) * 0.3;
        ctx.fillStyle = `rgba(200,${Math.floor(40 + flicker * 30)},0,${p.alpha + flicker * 0.15})`;
        // Glow
        ctx.shadowColor = 'rgba(200,50,0,0.4)';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    
    requestAnimationFrame(drawMenuBg);
  }
  drawMenuBg();
  
  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });
}

function stopMenuBackground() { menuBgActive = false; }
function restartMenuBackground() { menuBgActive = false; initMenuBackground(); }


// ===== ENHANCED MENU SCORES & STATS =====
function showMenuScoresEnhanced() {
  // Rank display
  try {
    const rank = getPlayerRank();
    const rankEl = document.getElementById('menuRank');
    if (rankEl) {
      rankEl.innerHTML = `<div class="rank-title" style="color:${rank.color}">${rank.rank}</div><div class="rank-desc">${rank.desc}</div>`;
    }
  } catch(e) {} // getPlayerRank may not exist yet on first load
  
  // Stats
  try {
    const stats = JSON.parse(localStorage.getItem('undeadSiege3dStats') || '{}');
    const statsEl = document.getElementById('menuStats');
    if (statsEl && stats.totalKills) {
      statsEl.innerHTML = `
        <div class="stat"><div class="val">${stats.totalKills || 0}</div><div class="lbl">TOTAL KILLS</div></div>
        <div class="stat"><div class="val">${stats.gamesPlayed || 0}</div><div class="lbl">GAMES</div></div>
        <div class="stat"><div class="val">${stats.bestRound || 0}</div><div class="lbl">BEST ROUND</div></div>
      `;
    }
  } catch(e) {}
  
  // High scores
  showMenuScores();
}

// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    const [tl, tr, br, bl] = r.map(v => Math.min(v || 0, w/2, h/2));
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}


// ===== LEADERBOARD =====
function getLeaderboard() {
  try { const d = localStorage.getItem('undeadSiege3dScores'); if (d) return JSON.parse(d); } catch(e) {}
  return [];
}
function saveScore(rd, kills, pts) {
  const board = getLeaderboard();
  board.push({ round: rd, kills, points: pts, date: new Date().toLocaleDateString() });
  board.sort((a,b) => b.round - a.round || b.kills - a.kills || b.points - a.points);
  const top = board.slice(0, 10);
  try { localStorage.setItem('undeadSiege3dScores', JSON.stringify(top)); } catch(e) {}
  return top;
}
function showMenuScores() {
  const board = getLeaderboard();
  const el = document.getElementById('menuScores');
  if (!el) return;
  if (!board.length) { el.textContent = '🏆 No high scores yet'; return; }
  let html = '🏆 HIGH SCORES<br>';
  board.slice(0,5).forEach((e,i) => { html += `${i+1}. R${e.round} · ${e.kills} kills · ${e.points} pts<br>`; });
  el.innerHTML = html;
}
showMenuScores();


export {
  initMenuBackground, stopMenuBackground, restartMenuBackground,
  showMenuScoresEnhanced,
  getLeaderboard, saveScore, showMenuScores
};
