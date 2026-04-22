// Cinematic wall posters — Easter eggs placed around the map.
// Purely visual: PlaneGeometry + CanvasTexture + warm PointLight.
// Zero gameplay impact. Works in SP, Mobile, and MP.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Poster data — 9 posters, one per personal memory / homage
// face: 'N'|'S'|'E'|'W'  (direction the poster FACES, i.e. which way you
//        must be standing to read it)
// wx/wz: tile-grid coordinates (multiplied by TILE inside buildPosters)
// y: world-space height of poster centre (default 1.55)
// ---------------------------------------------------------------------------
const POSTERS = [
  // Coords are FLOOR tile indices (fx, fz) — the tile the player stands in.
  // `face` is the wall direction the poster hangs on (i.e. which direction
  // the player must look to read it). buildPosters() handles all positioning.
  //
  // 1 — Get Better Mom  (NW locked room, north wall, faces south)
  {
    fx: 3, fz: 2, face: 'S', y: 1.55,
    title: 'GET BETTER, MOM',
    quote: [
      '"Your strength, commitment to family,',
      'positivity and thoughtfulness is unmatched —',
      'and because of that, we\'ll beat the odds."',
    ],
    attr: '— John A.',
    drawIllustration: drawMom,
  },
  // 2 — Memorial poster  (NW locked room, west wall, faces east)
  {
    fx: 2, fz: 5, face: 'E', y: 1.55,
    title: 'REST IN PEACE',
    quote: [
      'Claire  🕊  2021',
      'Halimony  ·  Jaddah',
      '',
      '"Death is often reality-shattering,',
      'and there\'s no timeline for healing."',
    ],
    attr: null,
    drawIllustration: drawCandle,
  },
  // 3 — Luke & Mo wedding  (main arena north wall, faces south)
  {
    fx: 15, fz: 1, face: 'S', y: 1.55,
    title: 'CONGRATS LUKE & MO 💍',
    quote: [
      '"Finding your life partner is the',
      'biggest investment and choice',
      'in your life."',
    ],
    attr: '— John A.',
    drawIllustration: drawRings,
  },
  // 4 — AutoGPT / Toran  (main arena east wall, faces west)
  {
    fx: 22, fz: 12, face: 'W', y: 1.55,
    title: 'JOINED AUTOGPT · JUNE 2024',
    quote: [
      '"Democratizing AI and making it',
      'accessible was the vision.',
      'To bond over empathy is rare',
      'in a world where profit is the norm."',
    ],
    attr: '— John A.',
    drawIllustration: drawCircuitBrain,
  },
  // 5 — Elia & Chloe  (east room, east wall, faces west)
  {
    fx: 22, fz: 11, face: 'W', y: 1.55,
    title: 'ELIA & CHLOE 🌟',
    quote: [
      '"The younger generation is the future.',
      'Inspire those who aim to create',
      'a better world."',
    ],
    attr: '— Uncle John',
    drawIllustration: drawStars,
  },
  // 6 — Schools  (south wall, faces north)
  {
    fx: 6, fz: 22, face: 'N', y: 1.55,
    title: 'MY SCHOOLS 🏫',
    quote: [
      'Go Panthers  ·  Go Mustangs  ·  Go Bears',
      '',
      '"Each chapter has a different story,',
      'creating a non-linear life journey."',
    ],
    attr: null,
    drawIllustration: drawMascots,
  },
  // 7 — Sunday Ball  (south wall, faces north)
  {
    fx: 14, fz: 22, face: 'N', y: 1.55,
    title: 'SUNDAY BALL  EST. 2020 🏀',
    quote: [
      '"Covid made the world close off',
      'and go inward — but everyone',
      'needs community."',
    ],
    attr: '— John A.',
    drawIllustration: drawBasketball,
  },
  // 8 — Nacs anniversary  (west corridor, west wall, faces east)
  {
    fx: 1, fz: 15, face: 'E', y: 1.55,
    title: 'HAPPY ANNIVERSARY, NACS ❤',
    quote: [
      'April 21, 2022',
      '',
      '"When adversity pushes people away,',
      'love and patience can create',
      'a door in those inner walls."',
    ],
    attr: '— John A.',
    drawIllustration: drawCrackedHeart,
  },
  // 9 — Pat & Bentley  (east room, east wall, faces west)
  {
    fx: 22, fz: 14, face: 'W', y: 1.55,
    title: 'WE GOT BETTER TODAY, PAT 🤝',
    quote: [
      'Thanks Bentley for the gameplay help.',
      '1% Everyday.',
      '',
      '"You are a reflection of the closest',
      'people around you. Compete with',
      'your past self — everyone starts',
      'as a beginner. 10k hours to great.',
      'You can achieve anything you set',
      'your heart at."',
    ],
    attr: '— John A.',
    drawIllustration: drawHandshake,
  },
];

// ---------------------------------------------------------------------------
// Illustration draw functions  (ctx = 2D canvas ctx, cx/cy = centre coords)
// ---------------------------------------------------------------------------

function drawMom(ctx, cx, cy) {
  // Soft glow halo
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 52);
  grad.addColorStop(0, 'rgba(200,140,60,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fill();
  // Hair
  ctx.fillStyle = '#0d0804';
  ctx.beginPath(); ctx.ellipse(cx, cy - 18, 34, 42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy - 62, 15, 14, 0, 0, Math.PI * 2); ctx.fill(); // bun
  // Face
  ctx.fillStyle = '#c07040';
  ctx.beginPath(); ctx.ellipse(cx, cy - 16, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#0d0804';
  ctx.beginPath(); ctx.ellipse(cx - 13, cy - 24, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 13, cy - 24, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 10, cy - 26, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 16, cy - 26, 2, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#7a3020'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy - 6, 10, 0.2, Math.PI - 0.2); ctx.stroke();
  // Flower in hair
  for (let a = 0; a < 6; a++) {
    const fx = cx + 28 + Math.cos(a * Math.PI / 3) * 6;
    const fy = cy - 54 + Math.sin(a * Math.PI / 3) * 6;
    ctx.fillStyle = '#c03060';
    ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ffe080'; ctx.beginPath(); ctx.arc(cx + 28, cy - 54, 4, 0, Math.PI * 2); ctx.fill();
  // Shoulders
  ctx.fillStyle = '#8b4020';
  ctx.beginPath(); ctx.ellipse(cx, cy + 28, 38, 22, 0, 0, Math.PI * 2); ctx.fill();
}

function drawCandle(ctx, cx, cy) {
  // Candle body
  ctx.fillStyle = '#c8c0a0';
  ctx.fillRect(cx - 10, cy - 20, 20, 48);
  // Wax drips
  ctx.fillStyle = '#e0d8b8';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy - 19, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 8, cy - 16, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Wick
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 32); ctx.stroke();
  // Flame
  const flameGrad = ctx.createRadialGradient(cx, cy - 42, 2, cx, cy - 38, 16);
  flameGrad.addColorStop(0, '#fff8a0');
  flameGrad.addColorStop(0.4, '#ff9020');
  flameGrad.addColorStop(1, 'rgba(200,40,0,0)');
  ctx.fillStyle = flameGrad;
  ctx.beginPath(); ctx.ellipse(cx, cy - 44, 9, 16, 0, 0, Math.PI * 2); ctx.fill();
  // Glow
  const glow = ctx.createRadialGradient(cx, cy - 38, 5, cx, cy - 38, 38);
  glow.addColorStop(0, 'rgba(255,180,60,0.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy - 38, 38, 0, Math.PI * 2); ctx.fill();
  // Base plate
  ctx.fillStyle = '#8b7040';
  ctx.beginPath(); ctx.ellipse(cx, cy + 28, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
}

function drawRings(ctx, cx, cy) {
  const r = 24;
  ctx.lineWidth = 8;
  // Left ring
  ctx.strokeStyle = '#d4a030';
  ctx.beginPath(); ctx.arc(cx - 16, cy, r, 0, Math.PI * 2); ctx.stroke();
  // Right ring (overlaps)
  ctx.strokeStyle = '#c0b0e0';
  ctx.beginPath(); ctx.arc(cx + 16, cy, r, 0, Math.PI * 2); ctx.stroke();
  // Redraw left front arc (overlap illusion)
  ctx.strokeStyle = '#d4a030';
  ctx.beginPath(); ctx.arc(cx - 16, cy, r, -0.8, 0.8); ctx.stroke();
  // Diamond on left ring
  ctx.fillStyle = '#a0e8ff';
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - r - 10);
  ctx.lineTo(cx - 10, cy - r - 4);
  ctx.lineTo(cx - 16, cy - r + 2);
  ctx.lineTo(cx - 22, cy - r - 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6080a0'; ctx.lineWidth = 1; ctx.stroke();
}

function drawCircuitBrain(ctx, cx, cy) {
  // Brain outline (two lobes)
  ctx.strokeStyle = '#40e0a0'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx - 14, cy - 10, 22, 28, -0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + 14, cy - 10, 22, 28, 0.2, 0, Math.PI * 2);
  ctx.stroke();
  // Circuit lines inside
  ctx.strokeStyle = '#20c080'; ctx.lineWidth = 1;
  const lines = [
    [[cx - 20, cy - 20], [cx - 8, cy - 20], [cx - 8, cy - 8], [cx + 4, cy - 8]],
    [[cx + 20, cy - 14], [cx + 8, cy - 14], [cx + 8, cy + 2], [cx - 4, cy + 2]],
    [[cx - 16, cy + 8], [cx, cy + 8], [cx, cy + 18], [cx + 12, cy + 18]],
  ];
  for (const pts of lines) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    // Node dot at end
    ctx.fillStyle = '#40e0a0';
    ctx.beginPath(); ctx.arc(pts[pts.length-1][0], pts[pts.length-1][1], 3, 0, Math.PI*2); ctx.fill();
  }
  // Central node
  ctx.fillStyle = '#80ffcc';
  ctx.beginPath(); ctx.arc(cx, cy - 4, 6, 0, Math.PI * 2); ctx.fill();
  // Glow
  const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, 44);
  glow.addColorStop(0, 'rgba(64,224,160,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI*2); ctx.fill();
}

function drawStars(ctx, cx, cy) {
  function star(x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      const sx = x + Math.cos(angle) * rad;
      const sy = y + Math.sin(angle) * rad;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath(); ctx.fill();
    // Glow
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2);
    g.addColorStop(0, col.replace(')', ',0.3)').replace('rgb', 'rgba'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI*2); ctx.fill();
  }
  star(cx - 22, cy - 5, 22, '#ffd040');
  star(cx + 22, cy + 5, 18, '#ff80c0');
  // Small sparkles
  ctx.fillStyle = '#ffffff';
  for (const [sx, sy] of [[cx-5, cy-28],[cx+38, cy-18],[cx-40, cy+20],[cx+10,cy+32]]) {
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI*2); ctx.fill();
  }
}

function drawMascots(ctx, cx, cy) {
  // Panther head (left)
  const px = cx - 52;
  ctx.fillStyle = '#1a1030';
  ctx.beginPath(); ctx.ellipse(px, cy, 20, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c040c0';
  ctx.beginPath(); ctx.arc(px - 12, cy - 18, 7, 0, Math.PI * 2); ctx.fill(); // ear
  ctx.beginPath(); ctx.arc(px + 12, cy - 18, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e060ff';
  ctx.beginPath(); ctx.arc(px - 8, cy - 8, 5, 0, Math.PI * 2); ctx.fill(); // eyes
  ctx.beginPath(); ctx.arc(px + 8, cy - 8, 5, 0, Math.PI * 2); ctx.fill();

  // Mustang (horse, centre)
  ctx.fillStyle = '#8b4a00';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 14, 18, 0, 0, Math.PI * 2); ctx.fill(); // body-ish
  ctx.beginPath(); ctx.ellipse(cx + 4, cy - 20, 11, 14, 0.3, 0, Math.PI * 2); ctx.fill(); // head
  // mane
  ctx.strokeStyle = '#c07820'; ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(cx - 2, cy - 26 + i * 4);
    ctx.quadraticCurveTo(cx - 14, cy - 24 + i * 4, cx - 12, cy - 18 + i * 4);
    ctx.stroke();
  }
  // Legs
  ctx.strokeStyle = '#8b4a00'; ctx.lineWidth = 4;
  for (const lx of [cx - 8, cx - 2, cx + 4, cx + 10]) {
    ctx.beginPath(); ctx.moveTo(lx, cy + 18); ctx.lineTo(lx, cy + 38); ctx.stroke();
  }

  // Bear (right)
  const bx = cx + 52;
  ctx.fillStyle = '#5a3010';
  ctx.beginPath(); ctx.ellipse(bx, cy, 20, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 14, cy - 18, 9, 0, Math.PI * 2); ctx.fill(); // ears
  ctx.beginPath(); ctx.arc(bx + 14, cy - 18, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b5020';
  ctx.beginPath(); ctx.arc(bx - 8, cy - 8, 5, 0, Math.PI * 2); ctx.fill(); // eyes
  ctx.beginPath(); ctx.arc(bx + 8, cy - 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b3818';
  ctx.beginPath(); ctx.ellipse(bx, cy + 6, 10, 7, 0, 0, Math.PI * 2); ctx.fill(); // snout
}

function drawBasketball(ctx, cx, cy) {
  const r = 30;
  // Ball
  const ballGrad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, r);
  ballGrad.addColorStop(0, '#ff8030');
  ballGrad.addColorStop(1, '#a03000');
  ctx.fillStyle = ballGrad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // Seam lines
  ctx.strokeStyle = '#1a0800'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); // outline
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); // horizontal
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); // vertical
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); // top curve
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); // bottom curve
  // Arc / hoop suggestion
  ctx.strokeStyle = '#c07030'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy + r + 22, 28, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  // Net lines
  ctx.strokeStyle = '#c07030'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 9, cy + r + 22);
    ctx.lineTo(cx + i * 9 + (i < 0 ? -3 : i > 0 ? 3 : 0), cy + r + 42);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cx - 18, cy + r + 34); ctx.lineTo(cx + 18, cy + r + 34); ctx.stroke();
}

function drawCrackedHeart(ctx, cx, cy) {
  // Heart shape
  function heart(x, y, size, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.35);
    ctx.bezierCurveTo(x, y, x - size, y, x - size, y + size * 0.35);
    ctx.bezierCurveTo(x - size, y + size * 0.7, x, y + size * 1.1, x, y + size * 1.3);
    ctx.bezierCurveTo(x, y + size * 1.1, x + size, y + size * 0.7, x + size, y + size * 0.35);
    ctx.bezierCurveTo(x + size, y, x, y, x, y + size * 0.35);
    ctx.closePath(); ctx.fill();
  }
  heart(cx, cy - 24, 26, '#8b0020');
  heart(cx, cy - 24, 24, '#cc1030');
  // Crack down centre
  ctx.strokeStyle = '#1a0005'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 24);
  ctx.lineTo(cx + 4, cy - 10);
  ctx.lineTo(cx - 3, cy + 2);
  ctx.lineTo(cx + 2, cy + 10);
  ctx.stroke();
  // Door drawn in the crack gap
  ctx.strokeStyle = '#ffd080'; ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 7, cy - 6, 14, 20); // door frame
  ctx.beginPath(); ctx.arc(cx + 5, cy + 4, 2, 0, Math.PI * 2); ctx.stroke(); // handle
  // Light shining through door
  const doorGlow = ctx.createRadialGradient(cx, cy + 4, 0, cx, cy + 4, 22);
  doorGlow.addColorStop(0, 'rgba(255,220,100,0.28)');
  doorGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = doorGlow; ctx.beginPath(); ctx.arc(cx, cy + 4, 22, 0, Math.PI*2); ctx.fill();
}

function drawHandshake(ctx, cx, cy) {
  ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  // Left arm
  ctx.beginPath(); ctx.moveTo(cx - 40, cy + 20); ctx.lineTo(cx - 5, cy); ctx.stroke();
  // Right arm
  ctx.beginPath(); ctx.moveTo(cx + 40, cy + 20); ctx.lineTo(cx + 5, cy); ctx.stroke();
  // Clasped hands (simplified fists)
  ctx.fillStyle = '#c07040';
  ctx.beginPath(); ctx.ellipse(cx - 12, cy + 2, 16, 12, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 12, cy + 2, 16, 12, 0.3, 0, Math.PI * 2); ctx.fill();
  // Fingers suggestion
  ctx.strokeStyle = '#8b4820'; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(cx - 10 + i * 5, cy - 6); ctx.lineTo(cx - 10 + i * 5, cy - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 10 + i * 5, cy - 6); ctx.lineTo(cx + 10 + i * 5, cy - 14); ctx.stroke();
  }
  // "1%" text
  ctx.fillStyle = '#d4a030'; ctx.font = 'bold 18px DejaVu Serif, serif';
  ctx.textAlign = 'center';
  ctx.fillText('1%', cx, cy + 46);
}

// ---------------------------------------------------------------------------
// Canvas texture builder
// ---------------------------------------------------------------------------
function makePosterTexture(poster) {
  const W = 512, H = poster.quote.length > 6 ? 400 : 320;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient — dark charcoal-brown
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#22140a');
  bgGrad.addColorStop(1, '#160c04');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Blood-red vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(80,0,0,0.55)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

  // Grain
  const imageData = ctx.getImageData(0, 0, W, H);
  const d = imageData.data;
  for (let i = 0; i < 2000; i++) {
    const idx = (Math.floor(Math.random() * H) * W + Math.floor(Math.random() * W)) * 4;
    const delta = (Math.random() - 0.4) * 24;
    d[idx] = Math.max(0, Math.min(255, d[idx] + delta));
    d[idx+1] = Math.max(0, Math.min(255, d[idx+1] + delta));
    d[idx+2] = Math.max(0, Math.min(255, d[idx+2] + delta));
  }
  ctx.putImageData(imageData, 0, 0);

  // Borders
  const brd = '#7a5418';
  ctx.strokeStyle = brd; ctx.lineWidth = 2.5;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.strokeStyle = '#3d2808'; ctx.lineWidth = 1;
  ctx.strokeRect(15, 15, W - 30, H - 30);

  // Corner ornaments
  ctx.font = '13px serif'; ctx.fillStyle = brd; ctx.textAlign = 'center';
  for (const [ox, oy] of [[24, 26], [W - 24, 26], [24, H - 18], [W - 24, H - 18]]) {
    ctx.fillText('✦', ox, oy);
  }

  // Title
  ctx.font = 'bold 22px DejaVu Serif, serif';
  ctx.fillStyle = '#d4a030';
  ctx.textAlign = 'center';
  ctx.fillText(poster.title, W / 2, 40);

  // Divider rule
  ctx.strokeStyle = '#3d2808'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 50); ctx.lineTo(W - 40, 50); ctx.stroke();

  // Illustration
  const illH = 110;
  const illCY = 50 + illH / 2 + 8;
  poster.drawIllustration(ctx, W / 2, illCY);

  // Divider rule below illustration
  ctx.strokeStyle = '#3d2808'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 50 + illH + 12); ctx.lineTo(W - 40, 50 + illH + 12); ctx.stroke();

  // Quote lines
  ctx.font = 'italic 17px DejaVu Serif, serif';
  ctx.fillStyle = '#c8a878';
  ctx.textAlign = 'center';
  let qy = 50 + illH + 30;
  for (const line of poster.quote) {
    if (line === '') { qy += 10; continue; }
    ctx.fillText(line, W / 2, qy);
    qy += 24;
  }

  // Attribution
  if (poster.attr) {
    ctx.font = '13px DejaVu Sans, sans-serif';
    ctx.fillStyle = '#7a5820';
    ctx.textAlign = 'right';
    ctx.fillText(poster.attr, W - 22, H - 22);
  }

  // Watermark
  ctx.font = '10px DejaVu Sans, sans-serif';
  ctx.fillStyle = '#3d2808';
  ctx.textAlign = 'center';
  ctx.fillText('✦  UNDEAD SIEGE  ✦', W / 2, H - 10);

  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Face → rotation (Y axis) and wall-normal direction.
//
// face = the direction the poster FACES (i.e. the direction the player
// must look to read it). So if the wall is to the NORTH of the floor
// tile, the poster hangs on that wall and faces SOUTH.
//
// FACE_ROT makes the PlaneGeometry normal point in the +face direction.
// Three.js PlaneGeometry default normal is +Z (south).
//   face='S' (normal +Z): rotY=0
//   face='N' (normal -Z): rotY=PI
//   face='E' (normal +X): rotY=-PI/2
//   face='W' (normal -X): rotY= PI/2
// ---------------------------------------------------------------------------
const FACE_ROT = { N: Math.PI, S: 0, E: -Math.PI / 2, W: Math.PI / 2 };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const _posterObjs = [];

export function buildPosters(scene, TILE) {
  // Clean up from a previous call (e.g. game restart)
  for (const obj of _posterObjs) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  }
  _posterObjs.length = 0;

  const EPS = 0.06;       // distance poster sits off the wall surface
  const LIGHT_OFF = 0.9;  // distance light sits in front of poster

  for (const p of POSTERS) {
    const tex = makePosterTexture(p);
    const posterH = p.quote.length > 6 ? 1.0 : 0.8;
    const geo = new THREE.PlaneGeometry(1.4, posterH);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.85,
      metalness: 0.05,
      transparent: false,
      // DoubleSide so the poster is visible even if the player clips
      // through the wall in multiplayer rollback / spectator cases.
      side: THREE.DoubleSide,
      // Emissive so it still pops in dark corners where PointLights
      // haven't reached yet (mobile forward renderer light budget).
      emissive: 0x1a0f05,
      emissiveIntensity: 0.35,
      emissiveMap: tex,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Floor-tile centre in world coords
    const cx = (p.fx + 0.5) * TILE;
    const cz = (p.fz + 0.5) * TILE;
    // Half-tile step toward the wall (the wall face lines up with the
    // floor-tile boundary, so step HALF a tile from the tile centre).
    const HALF = TILE / 2;

    let px = cx, pz = cz;
    let lx = cx, lz = cz;
    switch (p.face) {
      case 'S': // wall to NORTH → poster on wall's south face, facing +Z
        px = cx;              pz = cz - HALF + EPS;
        lx = cx;              lz = cz - HALF + LIGHT_OFF;
        break;
      case 'N': // wall to SOUTH → poster on wall's north face, facing -Z
        px = cx;              pz = cz + HALF - EPS;
        lx = cx;              lz = cz + HALF - LIGHT_OFF;
        break;
      case 'E': // wall to WEST → poster on wall's east face, facing +X
        px = cx - HALF + EPS; pz = cz;
        lx = cx - HALF + LIGHT_OFF; lz = cz;
        break;
      case 'W': // wall to EAST → poster on wall's west face, facing -X
        px = cx + HALF - EPS; pz = cz;
        lx = cx + HALF - LIGHT_OFF; lz = cz;
        break;
    }
    mesh.position.set(px, p.y, pz);
    mesh.rotation.y = FACE_ROT[p.face];
    mesh.renderOrder = 1; // draw after walls to dodge z-fighting
    mesh.userData.isPoster = true;
    scene.add(mesh);
    _posterObjs.push(mesh);

    // Warm spotlight in front of poster
    const light = new THREE.PointLight(0xffe8a0, 1.4, 4.5, 1.8);
    light.position.set(lx, p.y + 0.15, lz);
    scene.add(light);
    _posterObjs.push(light);
  }
}
