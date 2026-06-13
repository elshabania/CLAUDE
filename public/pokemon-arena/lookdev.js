// lookdev.js — cinematic color-grade pass + scene atmosphere polish.
//
// Pipeline position: RenderPass -> UnrealBloomPass -> [GradePass] -> OutputPass.
// The pass therefore operates on LINEAR HDR color (tonemapping + sRGB encode
// happen later in OutputPass), so every operation below is done in linear space
// and intentionally kept gentle — the grade should season the frame, not cook it.

import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/**
 * GradeShader — cheap filmic grade (3 texture fetches total, mobile-safe):
 *   0. radial chromatic aberration — R/B fetched with a tiny outward/inward
 *      offset that scales with distance² from center (max ~2px in corners)
 *   1. animated exposure breathing (+-1.5%, slow sine) — living-camera feel
 *   2. anamorphic-biased vignette (elliptical, closes harder top/bottom)
 *   3. gentle S-curve filmic contrast in linear space (pivot at mid-gray)
 *   4. warm/teal split-tone (orange highlights, teal shadows, +-0.04 shifts)
 *   5. subtle saturation boost (~1.12) via luma mix
 *   6. luma-adaptive film grain (heavier in shadows, like real sensor noise)
 *   7. ~2% black lift toward a warm dark floor
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

    // Mid-gray pivot for the linear-space contrast S-curve.
    const float PIVOT = 0.18;

    // Cheap per-pixel hash noise in [0, 1). Classic fract-sin hash; good
    // enough for grain and costs almost nothing.
    float hash12( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453123 );
    }

    void main() {
      vec2 centered = vUv - 0.5;
      // Normalize so the corner sits at distance 1 (|(0.5,0.5)| = sqrt(0.5)).
      float dist = length( centered ) / 0.7071067811865476;

      // ---------------------------------------------------------------------
      // 0) Chromatic aberration — R and B fetched with a small radial offset
      //    growing with distance² from center: zero in the middle, ~2px at
      //    the extreme corners (0.00105 UV ~= 2px at 1080p). Three fetches
      //    total; unconditional so the fetch pattern stays coherent on tile
      //    based mobile GPUs.
      // ---------------------------------------------------------------------
      vec2 caShift = centered * ( dist * dist ) * 0.0015;
      vec4 src = texture2D( tDiffuse, vUv );
      float srcR = texture2D( tDiffuse, vUv + caShift ).r; // R pushed outward
      float srcB = texture2D( tDiffuse, vUv - caShift ).b; // B pulled inward
      vec3 color = vec3( srcR, src.g, srcB );

      // ---------------------------------------------------------------------
      // 1) Exposure breathing — +-1.5% slow sine drift, like an auto-exposure
      //    system gently hunting. Applied first so all grading sits on top.
      // ---------------------------------------------------------------------
      color *= 1.0 + 0.015 * sin( uTime * 0.35 );

      // ---------------------------------------------------------------------
      // 2) Vignette — elliptical with a soft horizontal bias (anamorphic
      //    feel): the y axis is weighted heavier so the vignette closes in
      //    more on top/bottom than left/right. Slightly stronger than before
      //    (max ~30% in the extreme corners), center still effectively flat.
      // ---------------------------------------------------------------------
      vec2 aniso = centered * vec2( 0.92, 1.18 );
      float vDist = length( aniso ) / 0.7071067811865476;
      float falloff = pow( smoothstep( 0.5, 1.05, vDist ), 1.5 );
      float vignette = 1.0 - 0.30 * falloff;
      color *= vignette;

      // ---------------------------------------------------------------------
      // 3) Filmic S-curve contrast — gentle power pivot around mid-gray in
      //    linear space: shadows dig slightly deeper, highlights bloom a hair
      //    brighter, mid-gray itself is untouched. Exponent kept tiny (1.08)
      //    so it reads as "contact" rather than crunch. HDR-safe (monotonic,
      //    no clamping of values above 1).
      // ---------------------------------------------------------------------
      color = PIVOT * pow( max( color, vec3( 0.0 ) ) / PIVOT, vec3( 1.08 ) );

      // ---------------------------------------------------------------------
      // 4) Warm/teal split-tone — classic blockbuster look. Highlights drift
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
      // 5) Saturation boost (~1.12) via luma mix: pushing away from the gray
      //    axis. mix(gray, color, 1.12) overshoots past the original color.
      // ---------------------------------------------------------------------
      float gray = dot( color, LUMA );
      color = max( mix( vec3( gray ), color, 1.12 ), vec3( 0.0 ) );

      // ---------------------------------------------------------------------
      // 6) Filmic grain — animated hash noise in linear space, luma-adaptive:
      //    shadows get ~0.022 amplitude, highlights fade to ~0.007, matching
      //    how photon/sensor noise is most visible in the toe of the curve.
      //    fract(uTime * ...) keeps the hash input small and precision-safe.
      // ---------------------------------------------------------------------
      float grain = hash12( vUv * 731.7 + fract( uTime * 0.9173 ) * 1024.0 );
      float grainAmp = mix( 0.022, 0.007, smoothstep( 0.0, 0.6, dot( color, LUMA ) ) );
      color += ( grain - 0.5 ) * 2.0 * grainAmp;
      color = max( color, vec3( 0.0 ) );

      // ---------------------------------------------------------------------
      // 7) Black lift — raise deep blacks ~2% toward a warm dark tone for a
      //    softer filmic floor. max() so we only ever lift, never darken.
      // ---------------------------------------------------------------------
      const vec3 FLOOR = vec3( 0.022, 0.016, 0.012 ); // warm near-black
      color = max( color, FLOOR * smoothstep( 0.1, 0.0, dot( color, LUMA ) ) );

      // --- master intensity: lerp from the untouched source -----------------
      // (also fades out the chromatic aberration, since src is the clean tap)
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
 *   plus a slight density tune — FogExp2 density x1.06, or for linear Fog
 *   the far plane is pulled in ~3% (a hair more aerial perspective).
 * - sun: directional light intensity x1.05, color nudged ~12% toward a
 *   golden-hour warm tone (#ffd9a8).
 * - hemi: hemisphere ground color nudged slightly warmer.
 *
 * @param {{ scene?: any, sun?: any, hemi?: any }} param0
 */
export function applyAtmosphere( { scene, sun, hemi } = {} ) {
  // Richer fog color — blend the existing color 35% toward a warm haze.
  if ( scene && scene.fog && scene.fog.color && typeof scene.fog.color.lerp === "function" ) {
    scene.fog.color.lerp( scene.fog.color.clone().setHex( 0xb8cce0 ), 0.35 );

    // Slight density tune, kept conservative. FogExp2 exposes .density;
    // linear Fog exposes .near/.far — pull far in ~3% for a touch more haze.
    if ( typeof scene.fog.density === "number" ) {
      scene.fog.density *= 1.06;
    } else if ( typeof scene.fog.far === "number" && typeof scene.fog.near === "number" ) {
      scene.fog.far *= 0.97;
    }
  }

  // Slightly hotter sun for golden-hour punch.
  if ( sun && typeof sun.intensity === "number" ) {
    sun.intensity *= 1.05;
  }

  // Gently warm the sun color toward late-afternoon gold.
  if ( sun && sun.color && typeof sun.color.lerp === "function" ) {
    sun.color.lerp( sun.color.clone().setHex( 0xffd9a8 ), 0.12 );
  }

  // Warm up the hemisphere bounce from the ground.
  if ( hemi && hemi.groundColor && typeof hemi.groundColor.multiply === "function" ) {
    // Gentle warm multiplier: more red, a touch less blue.
    hemi.groundColor.multiply( hemi.groundColor.clone().setRGB( 1.06, 1.0, 0.94 ) );
  }
}
