// Horror-grade stochastic flicker for the bunker point lights.
//
// Each light keeps independent flicker state. Two modes are used:
//   0 = normal drift — a slow sine + small high-freq jitter; the light
//       hovers around 0.93× of its base intensity, never darker than
//       ~0.85×, so rooms stay legible.
//   1 = brief struggle — a fast stutter between ~0.55 and ~1.0 that
//       runs for 0.1–0.35s and then relaxes back to drift.
//
// Full blackouts were removed on purpose: they looked cool in screenshots
// but made it impossible to track zombies during gameplay.
//
// Usage from main.js:
//   import { initFlicker, updateFlicker } from './effects/flicker.js';
//   initFlicker({ lights });
//   // each frame:
//   updateFlicker(dt);

let _lights = null;

export function initFlicker(ctx) {
  _lights = ctx.lights;
  for (let i = 0; i < _lights.length; i++) {
    const l = _lights[i];
    l._baseIntensity = l.intensity;
    l._flickMode    = 0;
    l._flickTimer   = Math.random() * 4;
    l._flickVal     = 1.0;
    l._stutterT     = 0;
    l._stutterSpeed = 18 + Math.random() * 22;
    l._phaseOffset  = Math.random() * 6.28;
  }
}

export function updateFlicker(dt) {
  if (!_lights) return;
  for (let i = 0; i < _lights.length; i++) {
    const l = _lights[i];
    l._flickTimer -= dt;

    if (l._flickTimer <= 0) {
      // Mostly normal drift, with occasional brief struggle.
      const roll = Math.random();
      if (roll < 0.9) {
        l._flickMode  = 0;
        l._flickTimer = 3 + Math.random() * 6;
      } else {
        l._flickMode  = 1;
        l._flickTimer = 0.1 + Math.random() * 0.25;
        l._stutterSpeed = 14 + Math.random() * 28;
        l._stutterT = 0;
      }
    }

    if (l._flickMode === 0) {
      // Smooth horror drift: slow sine + small high-freq noise jitter.
      const t = performance.now() / 1000;
      const slow = Math.sin(t * 1.1 + l._phaseOffset) * 0.06;
      const fast = Math.sin(t * 9.3 + l._phaseOffset * 2.1) * 0.03;
      l._flickVal = 0.93 + slow + fast;
    } else {
      // Struggling bulb — stays between ~0.55 and 1.0.
      l._stutterT += dt * l._stutterSpeed;
      l._flickVal = (Math.sin(l._stutterT * 6.2832) > 0)
        ? (0.75 + Math.random() * 0.25)
        : (0.55 + Math.random() * 0.15);
    }

    l.intensity = l._baseIntensity * Math.max(0, l._flickVal);
  }
}
