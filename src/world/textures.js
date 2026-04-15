// Procedural texture generation
import * as THREE from 'three';
import { PI2, MAP_W, MAP_H } from '../core/state.js';

export function createTexture(width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export const wallTexGrey = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    const y = i * 22;
    ctx.fillStyle = '#666';
    ctx.fillRect(0, y, w, 2);
    if (i % 2 === 0) { ctx.fillRect(w/2 - 1, y, 2, 22); }
    else { ctx.fillRect(0, y, 2, 22); ctx.fillRect(w - 2, y, 2, 22); }
  }
  // Grime
  for(let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.15})`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*20+2, Math.random()*20+2);
  }
});

export const wallTexBrown = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#7A5030';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 16 + (j % 2) * 8;
      const y = j * 32;
      ctx.fillStyle = `rgb(${100+Math.random()*25},${65+Math.random()*20},${35+Math.random()*15})`;
      ctx.fillRect(x, y, 15, 30);
      ctx.strokeStyle = '#4A3218';
      ctx.strokeRect(x, y, 15, 30);
    }
  }
});

export const wallTexGreen = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#4A7A40';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${Math.random()>0.5?10:60},${55+Math.random()*45},${Math.random()*25},0.3)`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*15+3, Math.random()*15+3);
  }
  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for(let i = 0; i < 5; i++) {
    ctx.beginPath();
    let cx = Math.random()*w, cy = Math.random()*h;
    ctx.moveTo(cx, cy);
    for(let j = 0; j < 4; j++) { cx += Math.random()*30-15; cy += Math.random()*30; ctx.lineTo(cx,cy); }
    ctx.stroke();
  }
});

export const wallTexDoor = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#6B2A15';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7B3520';
  ctx.fillRect(8, 8, w-16, h-16);
  // Metal bands
  ctx.fillStyle = '#444';
  ctx.fillRect(0, 20, w, 6); ctx.fillRect(0, h-26, w, 6); ctx.fillRect(0, h/2-3, w, 6);
  // Rivets
  ctx.fillStyle = '#666';
  for(let y of [23, h/2, h-23]) {
    for(let x = 10; x < w; x += 20) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, PI2); ctx.fill();
    }
  }
});

export const floorTex = createTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#3a3a35';
  ctx.fillRect(0, 0, w, h);
  // Tile pattern
  const ts = 32;
  for(let x = 0; x < w; x += ts) {
    for(let y = 0; y < h; y += ts) {
      const v = 45 + Math.random()*15;
      ctx.fillStyle = `rgb(${v},${v},${v-3})`;
      ctx.fillRect(x+1, y+1, ts-2, ts-2);
    }
  }
  // Blood stains
  ctx.fillStyle = 'rgba(60,10,10,0.3)';
  for(let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*w, Math.random()*h, Math.random()*20+10, 0, PI2);
    ctx.fill();
  }
});
floorTex.repeat.set(MAP_W, MAP_H);

export const ceilTex = createTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#2a2a25';
  ctx.fillRect(0, 0, w, h);
  for(let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(${20+Math.random()*20},${18+Math.random()*18},${15+Math.random()*15},0.4)`;
    ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*30+5, Math.random()*30+5);
  }
});
ceilTex.repeat.set(MAP_W, MAP_H);

export const wallTextures = [wallTexGrey, wallTexBrown, wallTexGreen, wallTexDoor, wallTexDoor];

