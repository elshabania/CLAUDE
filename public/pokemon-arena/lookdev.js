// lookdev.js — cinematic color-grade pass + scene atmosphere polish.
//
// Pipeline position: RenderPass -> UnrealBloomPass -> [GradePass] -> OutputPass.
// The pass therefore operates on LINEAR HDR color (tonemapping + sRGB encode
// happen later in OutputPass), so every operation below is done in linear space
// and intentionally kept gentle — the grade should season the frame, not cook it.

import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/**
 * GradeShader — single-fetch filmic grade:
 *   1. gentle power-falloff vignette (center ~60% untouched, max ~25% in corners)
 *   2. warm/teal split-tone (orange highlights, teal shadows, +-0.04 shifts)
 *   3. subtle saturation boost (~1.12) via luma mix
 *   4. animated hash-noise film grain (~0.015 amplitude, linear space)
 *   5. ~2% black lift toward a warm dark floor
 */
const GradeShader = {
  name: "CinematicGradeShader",

  uniforms: {
    tDiffuse: { value: null }, // composited HDR frame from previous pass
    uTime: { value: 0.0 },     // elapsed seconds, advanced by the game loop
    uIntensity: { value: 1.0 } // 0 = bypass, 1 = full grade
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;

    varying vec2 vUv;

    // Rec.709 luma weights — fine for a perceptual-ish luma in linear space.
    const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

    // Cheap per-pixel hash noise in [0, 1). Classic fract-sin hash; good
    // enough for grain and costs almost nothing.
    float hash12( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453123 );
    }

    void main() {
      // --- single texture fetch -------------------------------------------
      vec4 src = texture2D( tDiffuse, vUv );
      vec3 color = src.rgb;

      // ---------------------------------------------------------------------
      // 1) Vignette — smooth radial darkening with a power falloff so the
      //    central ~60% of the frame is effectively untouched and the extreme
      //    corners lose at most ~25% brightness.
      // ---------------------------------------------------------------------
      vec2 centered = vUv - 0.5;
      // Normalize so the corner sits at distance 1 (|(0.5,0.5)| = sqrt(0.5)).
      float dist = length( centered ) / 0.7071067811865476;
      // smoothstep keeps the center flat; pow steepens falloff toward corners.
      float falloff = pow( smoothstep( 0.55, 1.0, dist ), 1.5 );
      float vignette = 1.0 - 0.25 * falloff;
      color *= vignette;

      // ---------------------------------------------------------------------
      // 2) Warm/teal split-tone — classic blockbuster look. Highlights drift
      //    toward orange, shadows toward teal. Masks are built from luma and
      //    kept soft so midtones stay neutral. Shifts are tiny (+-0.04).
      // ---------------------------------------------------------------------
      float luma = dot( color, LUMA );
      // Soft masks; luma is HDR here so clamp the highlight mask input.
      float hiMask = smoothstep( 0.5, 1.5, luma );           // highlights
      float loMask = 1.0 - smoothstep( 0.0, 0.35, luma );    // shadows
      const vec3 WARM = vec3(  0.04,  0.012, -0.025 );       // toward orange
      const vec3 TEAL = vec3( -0.025, 0.012,  0.035 );       // toward teal
      color += WARM * hiMask + TEAL * loMask;
      color = max( color, vec3( 0.0 ) ); // never go negative in linear space

      // ---------------------------------------------------------------------
      // 3) Saturation boost (~1.12) via luma mix: pushing away from the gray
      //    axis. mix(gray, color, 1.12) overshoots past the original color.
      // ---------------------------------------------------------------------
      float gray = dot( color, LUMA );
      color = max( mix( vec3( gray ), color, 1.12 ), vec3( 0.0 ) );

      // ---------------------------------------------------------------------
      // 4) Filmic grain — animated hash noise, +-0.015 amplitude, applied in
      //    linear space before tonemapping so it behaves like sensor noise.
      //    fract(uTime * ...) keeps the hash input small and precision-safe.
      // ---------------------------------------------------------------------
      float grain = hash12( vUv * 731.7 + fract( uTime * 0.9173 ) * 1024.0 );
      color += ( grain - 0.5 ) * 2.0 * 0.015;
      color = max( color, vec3( 0.0 ) );

      // ---------------------------------------------------------------------
      // 5) Black lift — raise deep blacks ~2% toward a warm dark tone for a
      //    softer filmic floor. max() so we only ever lift, never darken.
      // ---------------------------------------------------------------------
      const vec3 FLOOR = vec3( 0.022, 0.016, 0.012 ); // warm near-black
      color = max( color, FLOOR * smoothstep( 0.1, 0.0, dot( color, LUMA ) ) );

      // --- master intensity: lerp from the untouched source -----------------
      color = mix( src.rgb, color, clamp( uIntensity, 0.0, 1.0 ) );

      gl_FragColor = vec4( color, src.a );
    }
  `
};

/**
 * Creates the cinematic grade ShaderPass.
 * Insert between UnrealBloomPass and OutputPass.
 *
 * Per frame: pass.uniforms.uTime.value = elapsedSeconds;
 * Strength:  pass.uniforms.uIntensity.value = 0..1 (default 1).
 *
 * @returns {ShaderPass}
 */
export function createGradePass() {
  return new ShaderPass( GradeShader );
}

/**
 * One-time conservative scene polish for the golden-hour stadium look.
 * Defensive: every object is optional and checked before touching.
 *
 * - scene.fog: tint the existing Fog color toward a warm haze (#b8cce0),
 *   leaving near/far untouched.
 * - sun: directional light intensity x1.05.
 * - hemi: hemisphere ground color nudged slightly warmer.
 *
 * @param {{ scene?: any, sun?: any, hemi?: any }} param0
 */
export function applyAtmosphere( { scene, sun, hemi } = {} ) {
  // Richer fog color — blend the existing color 35% toward a warm haze.
  if ( scene && scene.fog && scene.fog.color && typeof scene.fog.color.lerp === "function" ) {
    scene.fog.color.lerp( scene.fog.color.clone().setHex( 0xb8cce0 ), 0.35 );
  }

  // Slightly hotter sun for golden-hour punch.
  if ( sun && typeof sun.intensity === "number" ) {
    sun.intensity *= 1.05;
  }

  // Warm up the hemisphere bounce from the ground.
  if ( hemi && hemi.groundColor && typeof hemi.groundColor.multiply === "function" ) {
    // Gentle warm multiplier: more red, a touch less blue.
    hemi.groundColor.multiply( hemi.groundColor.clone().setRGB( 1.06, 1.0, 0.94 ) );
  }
}
