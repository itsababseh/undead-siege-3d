// Post-processing pipeline — bloom, film grain, vignette, color grading, FXAA
// S5.1: Subtle horror-themed post-processing for production visual polish

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ── Custom combined shader: film grain + vignette + color grading ──
// Single pass for performance — avoids extra framebuffer copies.
const FilmHorrorShader = {
  name: 'FilmHorrorShader',
  uniforms: {
    tDiffuse:       { value: null },
    time:           { value: 0.0 },
    grainIntensity: { value: 0.10 },
    vignetteOffset: { value: 0.92 },
    vignetteDarkness: { value: 1.15 },
    saturation:     { value: 0.85 },
    // Teal/blue shadow tint — subtle horror color grading
    tintColor:      { value: new THREE.Vector3(0.85, 0.95, 1.08) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainIntensity;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    uniform float saturation;
    uniform vec3  tintColor;
    varying vec2  vUv;

    // Fast pseudo-random hash (screen-space + time)
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // ── Color grading: desaturation ──
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);

      // ── Color grading: teal/blue shadow tint ──
      // Apply tint more strongly in dark regions, leave highlights alone
      float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
      color *= mix(vec3(1.0), tintColor, shadowMask * 0.35);

      // ── Vignette ──
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float dist = length(center);
      float vig = smoothstep(vignetteOffset, vignetteOffset - 0.45, dist);
      color *= mix(1.0 - vignetteDarkness * 0.15, 1.0, vig);

      // ── Film grain ──
      float grain = rand(vUv * vec2(1024.0, 768.0) + vec2(time * 100.0, time * 57.3));
      grain = (grain - 0.5) * grainIntensity;
      // Luminance-aware: less grain in bright areas, more in shadows
      float grainMask = 1.0 - luma * 0.6;
      color += grain * grainMask;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};

// ── FXAA shader (inline — avoids an extra CDN fetch for FXAAShader.js) ──
// Lightweight FXAA 3.11 implementation suitable for the composer pipeline.
const FXAAShader = {
  name: 'FXAAShader',
  uniforms: {
    tDiffuse:   { value: null },
    resolution: { value: new THREE.Vector2(1.0 / 1024, 1.0 / 768) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      vec2 rcp = resolution;

      vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * rcp).rgb;
      vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * rcp).rgb;
      vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * rcp).rgb;
      vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * rcp).rgb;
      vec3 rgbM  = texture2D(tDiffuse, vUv).rgb;

      vec3 lumaCoeff = vec3(0.299, 0.587, 0.114);
      float lumaNW = dot(rgbNW, lumaCoeff);
      float lumaNE = dot(rgbNE, lumaCoeff);
      float lumaSW = dot(rgbSW, lumaCoeff);
      float lumaSE = dot(rgbSE, lumaCoeff);
      float lumaM  = dot(rgbM,  lumaCoeff);

      float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

      vec2 dir;
      dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
      dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

      float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 1.0 / 128.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = min(vec2(8.0), max(vec2(-8.0), dir * rcpDirMin)) * rcp;

      vec3 rgbA = 0.5 * (
        texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
        texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb
      );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tDiffuse, vUv + dir * -0.5).rgb +
        texture2D(tDiffuse, vUv + dir *  0.5).rgb
      );

      float lumaB = dot(rgbB, lumaCoeff);
      vec3 finalColor = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

// ── Module state ──
let composer = null;
let filmPass = null;
let fxaaPass = null;
let bloomPass = null;
let _enabled = true;
let _renderer = null;
let _scene = null;
let _camera = null;

/**
 * Initialize the post-processing pipeline.
 * Call once after renderer, scene, and camera are created.
 */
export function initPostProcessing(renderer, scene, camera) {
  _renderer = renderer;
  _scene = scene;
  _camera = camera;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = renderer.getPixelRatio();

  // Create composer — uses renderer's existing render target format
  composer = new EffectComposer(renderer);

  // Pass 1: Render the scene normally
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Pass 2: Unreal Bloom — subtle glow on bright elements (muzzle flash, lights)
  const resolution = new THREE.Vector2(w, h);
  bloomPass = new UnrealBloomPass(resolution, 0.4, 0.4, 0.85);
  // strength=0.4, radius=0.4, threshold=0.85 — very subtle, only bright things glow
  composer.addPass(bloomPass);

  // Pass 3: Combined film grain + vignette + color grading (single pass)
  filmPass = new ShaderPass(FilmHorrorShader);
  composer.addPass(filmPass);

  // Pass 4: FXAA — antialiasing (EffectComposer disables renderer's built-in AA)
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms.resolution.value.set(
    1.0 / (w * pixelRatio),
    1.0 / (h * pixelRatio)
  );
  fxaaPass.renderToScreen = true;
  composer.addPass(fxaaPass);
}

/**
 * Render one frame through the post-processing pipeline.
 * Falls back to normal renderer.render() when disabled.
 */
export function renderPostProcessing() {
  if (!_enabled || !composer) {
    _renderer.render(_scene, _camera);
    return;
  }

  // Update time uniform for grain animation
  filmPass.uniforms.time.value = performance.now() * 0.001;

  composer.render();
}

/**
 * Handle window resize — must update composer + FXAA resolution.
 */
export function resizePostProcessing(w, h) {
  if (!composer) return;

  const pixelRatio = _renderer.getPixelRatio();
  composer.setSize(w, h);

  if (fxaaPass) {
    fxaaPass.uniforms.resolution.value.set(
      1.0 / (w * pixelRatio),
      1.0 / (h * pixelRatio)
    );
  }

  if (bloomPass) {
    bloomPass.resolution.set(w, h);
  }
}

/**
 * Toggle post-processing on/off.
 */
export function setPostProcessingEnabled(on) {
  _enabled = !!on;
}

/**
 * Check if post-processing is currently active.
 */
export function isPostProcessingEnabled() {
  return _enabled;
}
