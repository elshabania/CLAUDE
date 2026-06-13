// lookdev.js — cinematic look development: renderer config, IBL, golden-hour sun,
// gradient sky + warm fog, and a post stack (bloom + custom cinematic color grade).
// Owns ONLY this file. three@0.160.0 via importmap ('three' + 'three/addons/').
//
// export: initLookdev({ renderer, scene, camera, width, height, quality })
//   -> { composer, bloomPass, gradePass, sun, sunTarget, setSize(w,h), update(dt,t,playerPos) }

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// Cinematic color-grade shader.
// Runs after bloom, before OutputPass (so it grades linear-ish HDR-mapped color;
// OutputPass then handles final transform / sRGB). Implements, in this order:
//   1. animated exposure "breathing" (slow sinusoid, driven from update()).
//   2. edge chromatic aberration (RGB split scaling with distance from center).
//   3. filmic S-curve contrast (smooth toe + shoulder around mid grey).
//   4. warm-highlight / teal-shadow split tone (golden-hour mood).
//   5. punchy saturation lift (vibrant Pokémon look — not muddy).
//   6. smooth radial vignette.
//   7. luma-adaptive animated film grain (less grain in highlights).
// ---------------------------------------------------------------------------
const CinematicGradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uVignette:   { value: 0.34 },   // vignette strength (0 = none)
    uGrain:      { value: 0.055 },  // grain amplitude
    uAberration: { value: 0.0024 }, // chromatic aberration at the frame edge
    uExposure:   { value: 1.0 },    // breathing multiplier (set each frame by update)
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uExposure;

    varying vec2 vUv;

    // Rec.709 luma.
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    // Cheap hash for grain (screen-space, animated by uTime).
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // Filmic-ish S-curve: smooth toe & shoulder around mid grey, contrast lift.
    vec3 filmicContrast(vec3 c) {
      // smoothstep gives a gentle S; mix back toward original to keep it tasteful.
      vec3 s = smoothstep(0.0, 1.0, c);
      vec3 contrasted = mix(c, s, 0.55);
      // pivoted contrast around ~0.18 mid-grey for a touch more punch.
      const float pivot = 0.20;
      return clamp((contrasted - pivot) * 1.12 + pivot, 0.0, 4.0);
    }

    void main() {
      vec2 uv = vUv;

      // Distance from center (0 at center → ~1 at corners) drives aberration & vignette.
      vec2 toCenter = uv - 0.5;
      float dist = length(toCenter) * 1.41421356; // normalize so corner ≈ 1.0
      float edge = dist * dist;                    // bias the effect toward the edges

      // --- Chromatic aberration: split R/B outward along the radial direction. ---
      vec2 dir = toCenter * uAberration * edge;
      float r = texture2D(tDiffuse, uv + dir).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir).b;
      vec3 col = vec3(r, g, b);

      // --- Exposure breathing (slow sinusoid supplied via uExposure). ---
      col *= uExposure;

      // --- Filmic S-curve contrast. ---
      col = filmicContrast(col);

      // --- Split tone: warm highlights, teal-ish cool shadows (golden hour). ---
      float l = luma(col);
      // shadow/highlight masks.
      float shadowMask    = 1.0 - smoothstep(0.0, 0.45, l);
      float highlightMask = smoothstep(0.5, 1.0, l);
      vec3 warm = vec3(1.06, 0.99, 0.86); // golden highlight tint
      vec3 cool = vec3(0.90, 1.0, 1.06);  // teal/cyan shadow tint
      col *= mix(vec3(1.0), warm, highlightMask * 0.55);
      col *= mix(vec3(1.0), cool, shadowMask * 0.42);

      // --- Vibrant saturation lift (punchy, not muddy). ---
      float l2 = luma(col);
      col = mix(vec3(l2), col, 1.22);
      col = max(col, 0.0);

      // --- Smooth radial vignette. ---
      float vig = smoothstep(1.15, 0.25, dist);    // 1 at center → 0 at corners
      vig = mix(1.0, vig, uVignette);
      col *= vig;

      // --- Luma-adaptive animated film grain (less in highlights). ---
      float g1 = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 137.13);
      float g2 = hash(uv * vec2(1031.0, 619.0) - fract(uTime * 1.7) * 71.7);
      float grain = (g1 + g2) * 0.5 - 0.5;          // ~[-0.5, 0.5]
      float lumaNow = luma(col);
      float grainAmt = uGrain * (1.0 - smoothstep(0.55, 1.0, lumaNow)); // fade in highlights
      col += grain * grainAmt;

      gl_FragColor = vec4(clamp(col, 0.0, 4.0), 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// Gradient sky as a CanvasTexture (warm horizon → deep blue zenith).
// Used as scene.background equirect-ish via an EquirectangularReflectionMapping
// so it wraps nicely behind the dome of geometry.
// ---------------------------------------------------------------------------
function makeSkyTexture() {
  const w = 16, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Vertical gradient: top = zenith (deep blue), bottom = horizon (warm gold).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#0b2150'); // deep blue zenith
  grad.addColorStop(0.30, '#234a86'); // upper sky
  grad.addColorStop(0.58, '#5b86b8'); // mid sky
  grad.addColorStop(0.80, '#cdb189'); // pale gold near horizon
  grad.addColorStop(0.93, '#f4c98c'); // warm horizon glow
  grad.addColorStop(1.00, '#ffd9a0'); // sun-warmed horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // A soft warm glow band low on the horizon for extra golden-hour mood.
  const glow = ctx.createLinearGradient(0, h * 0.78, 0, h);
  glow.addColorStop(0, 'rgba(255, 180, 120, 0.0)');
  glow.addColorStop(1, 'rgba(255, 200, 140, 0.28)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
export function initLookdev({ renderer, scene, camera, width, height, quality }) {
  const q = quality || {};
  const shadowMapSize = q.shadowMapSize || 2048;
  const useBloom = q.bloom !== false;
  const pixelRatio = q.pixelRatio || (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  // ---- Renderer configuration (three 0.160 conventions) ------------------
  // useLegacyLights=false => physically-based light units (replaces old
  // physicallyCorrectLights). Guarded assignment in case the prop is frozen.
  try { renderer.useLegacyLights = false; } catch (e) { /* noop */ }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(pixelRatio);

  // ---- Image-based lighting: PMREM from RoomEnvironment --------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  // Keep IBL subtle so the warm directional sun stays the dominant key.
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = 0.35;
  }
  // Free the transient PMREM machinery (the generated RT texture stays alive).
  pmrem.dispose();

  // ---- Gradient sky + warm fog --------------------------------------------
  const skyTex = makeSkyTexture();
  scene.background = skyTex;
  // Warm golden-hour fog; far ~420 per contract, tinted toward the horizon gold.
  scene.fog = new THREE.Fog(0xdcc4a2, 80, 420);

  // ---- Golden-hour sun (directional key light) -----------------------------
  const sun = new THREE.DirectionalLight(0xffd9a0, 3.1);
  // Elevation ~28°, coming from a warm low angle. Direction set via position
  // relative to the (player-following) target; magnitude ~100 keeps it offscreen.
  const SUN_DIST = 120;
  const elevation = THREE.MathUtils.degToRad(28);
  const azimuth = THREE.MathUtils.degToRad(-46);
  // Offset of the light from its target (re-applied each frame in update).
  const sunOffset = new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth)
  ).multiplyScalar(SUN_DIST);

  sun.position.copy(sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);

  // Shadow camera covers ~90 units around the player (±45).
  const SHADOW_HALF = 45;
  const scam = sun.shadow.camera;
  scam.left = -SHADOW_HALF;
  scam.right = SHADOW_HALF;
  scam.top = SHADOW_HALF;
  scam.bottom = -SHADOW_HALF;
  scam.near = 0.5;
  scam.far = SUN_DIST + SHADOW_HALF * 2 + 40;
  scam.updateProjectionMatrix();

  // Bias tuning to kill acne while avoiding peter-panning on character feet.
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3.5; // soft PCF penumbra

  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;
  scene.add(sun);

  // A gentle warm ambient/hemisphere fill so shadows aren't crushed black —
  // sky tint warm, ground bounce earthy. Kept low; IBL does most of the fill.
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x6b5a44, 0.55);
  scene.add(hemi);

  // Texel size of the shadow map (world units per texel) — used to quantize
  // the shadow camera origin so it only ever moves in whole-texel steps,
  // which eliminates the crawling/shimmer of soft shadows as the player walks.
  const texelWorld = (SHADOW_HALF * 2) / shadowMapSize;

  // ---- Post-processing composer -------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // UnrealBloom: strength 0.85, radius 0.55, threshold 0.8 (per contract).
  let bloomPass = null;
  if (useBloom) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.85, // strength
      0.55, // radius
      0.8   // threshold
    );
    composer.addPass(bloomPass);
  }

  // Custom cinematic grade.
  const gradePass = new ShaderPass(CinematicGradeShader);
  composer.addPass(gradePass);

  // Final output transform (tone-map handling / sRGB) — keep last.
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // ---- Resize --------------------------------------------------------------
  function setSize(w, h) {
    composer.setSize(w, h);
    if (bloomPass && bloomPass.setSize) bloomPass.setSize(w, h);
  }

  // ---- Per-frame update ----------------------------------------------------
  // dt: seconds since last frame. t: absolute seconds. playerPos: THREE.Vector3.
  const _tmpTarget = new THREE.Vector3();
  function update(dt, t, playerPos) {
    // Slow sinusoidal exposure breathing: ~7s period, ~0.04 amplitude around 1.
    const breathe = 1.0 + Math.sin(t * (Math.PI * 2 / 7.0)) * 0.04;
    gradePass.uniforms.uExposure.value = breathe;
    gradePass.uniforms.uTime.value = t;

    if (playerPos) {
      // Quantize the shadow-camera center to whole shadow-map texels so the
      // shadow map samples land on a stable grid → no shimmer while walking.
      const qx = Math.round(playerPos.x / texelWorld) * texelWorld;
      const qz = Math.round(playerPos.z / texelWorld) * texelWorld;
      _tmpTarget.set(qx, 0, qz);

      sunTarget.position.copy(_tmpTarget);
      sun.position.copy(_tmpTarget).add(sunOffset);
      // DirectionalLight needs its target's world matrix current for shadows.
      sunTarget.updateMatrixWorld();
    }
  }

  return { composer, bloomPass, gradePass, sun, sunTarget, setSize, update };
}
