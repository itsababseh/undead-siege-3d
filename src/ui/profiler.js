// Dev-mode profiler overlay. Gated behind URL ?profile=1 or
// localStorage `undead.profile`=1 so it adds zero overhead for normal users:
// when disabled, every exported function is a no-op on the first instruction.
//
// Usage:
//   profBegin('name'); ...work...; profEnd();
// Nested/non-overlapping calls are fine (stack-based). Within a single frame,
// repeated begin/end pairs for the same name accumulate. At the end of each
// frame, profEndFrame() commits accumulators into a 60-frame ring buffer and
// (throttled) redraws the overlay.
//
// Toggle visibility at runtime with `~` (backtick). Flag remains on for the
// session; refresh without the flag to fully disable.

const WINDOW_SIZE = 60;

// Enable ONLY via the ?profile=1 URL flag. Previously a localStorage
// toggle was also honoured, but that meant once a dev set it during
// testing it persisted forever in their browser — including after
// release builds shipped — with no visible cue. Explicit URL flag is
// the one source of truth: add ?profile=1 to turn on, remove to turn
// off. Never sticky.
const ENABLED = (() => {
  try {
    const url = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    if (url.get('profile') === '1') return true;
  } catch (e) {}
  return false;
})();

const FRAME_KEY = '__frame';
const sections = new Map(); // name -> { samples: number[], idx: number }
const frameAccum = new Map(); // name -> ms accumulated this frame
const stack = []; // [name, startT]
let frameStartT = 0;
let overlay = null;
let visible = true;
let lastRender = 0;

function pushSample(name, ms) {
  let s = sections.get(name);
  if (!s) { s = { samples: [], idx: 0 }; sections.set(name, s); }
  if (s.samples.length < WINDOW_SIZE) s.samples.push(ms);
  else { s.samples[s.idx] = ms; s.idx = (s.idx + 1) % WINDOW_SIZE; }
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function isProfileEnabled() { return ENABLED; }

export function profBeginFrame() {
  if (!ENABLED) return;
  frameStartT = performance.now();
  frameAccum.clear();
  stack.length = 0;
}

export function profBegin(name) {
  if (!ENABLED) return;
  stack.push([name, performance.now()]);
}

export function profEnd() {
  if (!ENABLED) return;
  const entry = stack.pop();
  if (!entry) return;
  const [name, t0] = entry;
  frameAccum.set(name, (frameAccum.get(name) || 0) + (performance.now() - t0));
}

// Any frame longer than this triggers a detailed console warning with
// per-section breakdown. 25ms ≈ missed 40fps. Good threshold for
// catching spikes without spamming on normal 16.7ms frames.
const SPIKE_THRESHOLD_MS = 25;
let spikeLog = []; // rolling [{ t, totalMs, sections }]
export function getRecentSpikes() { return spikeLog; }

export function profEndFrame() {
  if (!ENABLED) return;
  const totalMs = performance.now() - frameStartT;
  pushSample(FRAME_KEY, totalMs);
  for (const [name, ms] of frameAccum) pushSample(name, ms);

  // Spike catcher: if this frame blew past the threshold, dump a
  // per-section breakdown to the console so it's obvious WHICH
  // subsystem took the hit. Surface the top 5 sections sorted by ms.
  if (totalMs > SPIKE_THRESHOLD_MS) {
    const rows = [];
    for (const [name, ms] of frameAccum) rows.push({ name, ms });
    rows.sort((a, b) => b.ms - a.ms);
    const top = rows.slice(0, 5);
    const unaccounted = totalMs - rows.reduce((s, r) => s + r.ms, 0);
    console.warn(
      `[spike] ${totalMs.toFixed(1)}ms frame — top: ` +
      top.map(r => `${r.name}=${r.ms.toFixed(1)}ms`).join('  ') +
      `  (unaccounted=${unaccounted.toFixed(1)}ms)`
    );
    spikeLog.push({ t: performance.now(), totalMs, sections: top });
    if (spikeLog.length > 50) spikeLog.shift();
  }

  const now = performance.now();
  if (visible && now - lastRender > 200) {
    renderOverlay();
    lastRender = now;
  }
}

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'profiler-overlay';
  overlay.style.cssText =
    'position:fixed;top:10px;right:10px;z-index:99999;' +
    'background:rgba(0,0,0,0.78);color:#0f0;' +
    "font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;" +
    'padding:8px 12px;border:1px solid #333;min-width:260px;' +
    'pointer-events:none;white-space:pre;letter-spacing:0';
  document.body.appendChild(overlay);
  return overlay;
}

function renderOverlay() {
  if (!visible) { if (overlay) overlay.style.display = 'none'; return; }
  const el = ensureOverlay();
  el.style.display = 'block';
  const frameSamples = (sections.get(FRAME_KEY) || { samples: [] }).samples;
  const frameAvg = avg(frameSamples);
  const fps = frameAvg > 0 ? 1000 / frameAvg : 0;
  const rows = [];
  for (const [name, s] of sections) {
    if (name === FRAME_KEY) continue;
    rows.push([name, avg(s.samples)]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  const pad = (str, n) => {
    str = String(str);
    return str.length >= n ? str : str + ' '.repeat(n - str.length);
  };
  const lpad = (str, n) => {
    str = String(str);
    return str.length >= n ? str : ' '.repeat(n - str.length) + str;
  };
  let lines = [];
  lines.push('== PROFILER (~ to toggle) ==');
  lines.push(`FPS ${fps.toFixed(1).padStart(5)}    frame ${frameAvg.toFixed(2).padStart(5)} ms`);
  lines.push('----------------------------------');
  for (const [name, ms] of rows) {
    const pct = frameAvg > 0 ? (ms / frameAvg) * 100 : 0;
    lines.push(`${pad(name, 20)} ${lpad(ms.toFixed(2), 6)} ms ${lpad(pct.toFixed(0), 3)}%`);
  }
  el.textContent = lines.join('\n');
}

if (ENABLED && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      visible = !visible;
      renderOverlay();
    }
  });
  // Eagerly create the overlay so it shows even before the first frame commits.
  try { ensureOverlay(); } catch (e) {}
}
