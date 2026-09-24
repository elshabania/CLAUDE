// Creature/character material presets (creatures.md §2.2) with a shared shader layer (DECISIONS D31):
// fresnel rim light, procedural per-class surface detail (fur strands, scales, feathers, skin pores, stone, shell
// growth rings, ice facets, membrane veins) applied as derivative bump + cavity darkening, wrap/subsurface lighting,
// fresnel translucency for ice/crystal, masked emissive (molten fissures) and shell-fur layers.
import * as THREE from 'three';
import type { Quality } from './primitives';

export type Preset = 'FUR' | 'SCALE' | 'SHELL' | 'STONE' | 'METAL' | 'ICE' | 'MEMBRANE' | 'PAPER' | 'SKIN_WET' | 'GLOW' | 'SKIN' | 'CLOTH' | 'HAIR' | 'CRYSTAL' | 'EYE' | 'FEATHER';

/** Global rim uniforms: the battle/exploration director tweaks strength (0.25 day, 0.45 night, 0.5 battle). */
export const rimUniforms = { uRimStrength: { value: 0.3 } };

interface PresetDef {
  rough: number;
  metal: number;
  clearcoat?: number;
  opacity?: number;
  side?: THREE.Side;
  sheen?: boolean;
  /** surface detail class used by the shader (0 = none) */
  cls: number;
  /** bump amplitude (× H) */
  bump: number;
  /** detail frequency (× 1/H) */
  freq: number;
  /** wrap lighting amount and subsurface tint */
  wrap: number;
  sss?: [number, number, number];
}

const PRESET: Record<Preset, PresetDef> = {
  FUR: { rough: 0.85, metal: 0, sheen: true, cls: 1, bump: 0.0045, freq: 60, wrap: 0.55, sss: [1, 0.62, 0.5] },
  HAIR: { rough: 0.7, metal: 0, sheen: true, cls: 1, bump: 0.003, freq: 70, wrap: 0.45, sss: [1, 0.62, 0.5] },
  SCALE: { rough: 0.5, metal: 0, clearcoat: 0.2, cls: 2, bump: 0.004, freq: 26, wrap: 0.3, sss: [1, 0.7, 0.6] },
  FEATHER: { rough: 0.75, metal: 0, sheen: true, cls: 3, bump: 0.004, freq: 20, wrap: 0.45, sss: [1, 0.75, 0.65] },
  SKIN: { rough: 0.62, metal: 0, cls: 4, bump: 0.0015, freq: 55, wrap: 0.5, sss: [1, 0.5, 0.42] },
  SKIN_WET: { rough: 0.3, metal: 0, clearcoat: 0.5, cls: 4, bump: 0.001, freq: 45, wrap: 0.45, sss: [1, 0.55, 0.5] },
  STONE: { rough: 0.9, metal: 0.05, cls: 5, bump: 0.006, freq: 14, wrap: 0.1 },
  SHELL: { rough: 0.28, metal: 0, clearcoat: 0.6, cls: 6, bump: 0.002, freq: 30, wrap: 0.2, sss: [1, 0.85, 0.7] },
  METAL: { rough: 0.35, metal: 0.7, cls: 0, bump: 0, freq: 1, wrap: 0 },
  ICE: { rough: 0.12, metal: 0, clearcoat: 0.8, opacity: 0.88, cls: 7, bump: 0.003, freq: 10, wrap: 0.6, sss: [0.7, 0.9, 1] },
  CRYSTAL: { rough: 0.15, metal: 0.1, clearcoat: 0.8, opacity: 0.9, cls: 7, bump: 0.003, freq: 8, wrap: 0.6, sss: [0.8, 0.9, 1] },
  MEMBRANE: { rough: 0.6, metal: 0, opacity: 0.92, side: THREE.DoubleSide, cls: 8, bump: 0.0012, freq: 12, wrap: 0.8, sss: [1, 0.6, 0.45] },
  PAPER: { rough: 1, metal: 0, side: THREE.DoubleSide, cls: 0, bump: 0, freq: 1, wrap: 0.2 },
  GLOW: { rough: 0.4, metal: 0, cls: 0, bump: 0, freq: 1, wrap: 0.3 },
  CLOTH: { rough: 0.9, metal: 0, side: THREE.DoubleSide, cls: 0, bump: 0, freq: 1, wrap: 0.3 },
  EYE: { rough: 0.25, metal: 0, cls: 0, bump: 0, freq: 1, wrap: 0 },
};

export function presetDef(p: Preset): PresetDef {
  return PRESET[p];
}

const GLSL_COMMON = /* glsl */ `
uniform float uRimStrength;
uniform vec3 uRimColor;
uniform float uRimLocal;
uniform float uDetail;
uniform float uBumpAmp;
uniform float uWrap;
uniform vec3 uSss;
uniform float uFuzz;
uniform float uShellH;
uniform float uStrand;
varying vec3 vBindPos;
#ifdef CR_ATTRS
varying float vFur;
varying float vGlow;
#endif
`;

const GLSL_FUNCS = /* glsl */ `
float crHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float crNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crHash(i), crHash(i + vec3(1,0,0)), f.x), mix(crHash(i + vec3(0,1,0)), crHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(crHash(i + vec3(0,0,1)), crHash(i + vec3(1,0,1)), f.x), mix(crHash(i + vec3(0,1,1)), crHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec2 crVoronoi(vec3 x) {
  vec3 p = floor(x); vec3 f = fract(x); float d1 = 8.0, d2 = 8.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 b = vec3(float(i), float(j), float(k));
    vec3 r = b - f + vec3(crHash(p + b), crHash(p + b + 17.13), crHash(p + b + 31.71)) * 0.85;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec2(d1, d2 - d1);
}
vec3 crPerturb(vec3 pos, vec3 N, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-12) return N;
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - g);
}
`;

/** height (0..1) + cavity (0..1) for a detail class at bind-space point p */
const GLSL_DETAIL = /* glsl */ `
vec2 crDetail(vec3 p) {
  float h = 0.0; float cav = 0.0;
#if CR_CLASS == 1
  vec3 q = p * vec3(1.0, 0.24, 1.0);
  h = crNoise(q) * 0.55 + crNoise(q * 2.3 + 3.1) * 0.3 + crNoise(p * 0.35) * 0.15;
  cav = (1.0 - h) * 0.35;
#elif CR_CLASS == 2
  vec2 v = crVoronoi(p);
  h = smoothstep(0.0, 0.3, v.y) * (1.0 - v.x * 0.45);
  cav = 1.0 - smoothstep(0.0, 0.1, v.y);
#elif CR_CLASS == 3
  vec2 v = crVoronoi(p * vec3(1.0, 0.8, 1.7));
  h = smoothstep(0.0, 0.45, v.y) * (1.0 - v.x * 0.3) + crNoise(p * vec3(8.0, 1.0, 1.0)) * 0.12;
  cav = (1.0 - smoothstep(0.0, 0.08, v.y)) * 0.8;
#elif CR_CLASS == 4
  h = crNoise(p) * 0.6 + crNoise(p * 3.1) * 0.4;
  cav = (1.0 - h) * 0.12;
#elif CR_CLASS == 5
  vec2 v = crVoronoi(p);
  h = crNoise(p * 2.0) * 0.5 + crNoise(p * 5.0) * 0.2 + smoothstep(0.0, 0.2, v.y) * 0.3;
  cav = (1.0 - smoothstep(0.0, 0.06, v.y)) * 0.6 + (1.0 - h) * 0.2;
#elif CR_CLASS == 6
  float r = length(p.xz) + p.y * 0.35;
  h = 0.5 + 0.5 * sin(r * 6.2831) ;
  h = h * 0.7 + crNoise(p * 3.0) * 0.3;
  cav = (1.0 - h) * 0.15;
#elif CR_CLASS == 7
  vec2 v = crVoronoi(p);
  h = v.x * 0.6 + crNoise(p * 4.0) * 0.1;
  cav = 0.0;
#elif CR_CLASS == 8
  vec2 v = crVoronoi(p * vec3(1.0, 1.0, 1.0));
  h = smoothstep(0.0, 0.08, v.y);
  cav = (1.0 - smoothstep(0.0, 0.05, v.y)) * 0.5;
#endif
  return vec2(h, cav);
}
`;

export interface ShaderOpts {
  rim: THREE.Color;
  rimStrength: number;
  preset: Preset;
  quality: Quality;
  /** 1/H: detail frequency base (0 disables detail) */
  detail: number;
  H: number;
  attrs?: boolean;      // geometry carries aFur/aGlow (sculpted body)
  glowMask?: boolean;   // emissive only in fissures (aGlow × crack pattern)
  shell?: { h: number; len: number; strand: number };
  fresnelAlpha?: boolean;
  noDetail?: boolean;
}

/** Installs the creature shader layer on a standard/physical material. Safe to call again after `clone()`. */
export function applyCreatureShader(mat: THREE.MeshStandardMaterial, o: ShaderOpts) {
  const p = PRESET[o.preset] ?? PRESET.SKIN;
  const detailOn = !o.noDetail && o.detail > 0 && p.cls > 0 && o.quality !== 'mobile' && !o.shell;
  const cls = detailOn ? p.cls : 0;
  const wrap = o.quality === 'mobile' ? 0 : p.wrap;
  const uniforms = {
    uRimStrength: rimUniforms.uRimStrength,
    uRimColor: { value: o.rim },
    uRimLocal: { value: o.rimStrength },
    uDetail: { value: o.detail * p.freq },
    uBumpAmp: { value: p.bump * o.H * (o.quality === 'high' ? 1 : 0.8) },
    uWrap: { value: wrap },
    uSss: { value: new THREE.Color(...(p.sss ?? [1, 1, 1])) },
    uFuzz: { value: (o.preset === 'FUR' || o.preset === 'HAIR' || o.preset === 'FEATHER') ? 1 : 0 },
    uShellH: { value: o.shell?.h ?? 0 },
    uStrand: { value: o.shell ? o.shell.strand : 1 },
  };
  const defs: string[] = [];
  if (cls) defs.push(`#define CR_CLASS ${cls}`);
  if (wrap > 0) defs.push('#define CR_WRAP');
  if (o.attrs) defs.push('#define CR_ATTRS');
  if (o.glowMask) defs.push('#define CR_GLOWMASK');
  if (o.shell) defs.push('#define CR_SHELL');
  if (o.fresnelAlpha) defs.push('#define CR_FRESNEL_ALPHA');
  const key = 'cr:' + defs.join('|');
  (mat.userData as { cr?: unknown }).cr = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const head = defs.join('\n') + '\n' + GLSL_COMMON;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + head + (o.attrs ? '\nattribute float aFur;\nattribute float aGlow;' : ''))
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBindPos = position;
        #ifdef CR_ATTRS
        vFur = aFur; vGlow = aGlow;
        #endif
        #ifdef CR_SHELL
        #ifdef CR_ATTRS
        transformed += normal * uShellH * uStrand * 1.0 * max(0.35, aFur);
        #else
        transformed += normal * uShellH * uStrand;
        #endif
        #endif`,
      );
    let fs = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + head + GLSL_FUNCS + (cls ? GLSL_DETAIL : ''));
    fs = fs.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float crH = 0.0; float crCav = 0.0; float crFade = 1.0;
      #ifdef CR_CLASS
      {
        vec3 dp = vBindPos * uDetail;
        crFade = 1.0 - smoothstep(0.35, 1.2, length(fwidth(dp)));
        vec2 dd = crDetail(dp);
        crH = dd.x; crCav = dd.y * crFade;
        diffuseColor.rgb *= 1.0 - crCav * 0.28;
      }
      #endif
      #ifdef CR_SHELL
      {
        vec3 sp = vBindPos * uDetail;
        float s = crHash(floor(sp)) * 0.75 + crHash(floor(sp * 1.73 + 0.5)) * 0.25;
        if (s < uShellH * 0.92 + 0.08) discard;
        diffuseColor.rgb *= mix(0.78, 1.1, uShellH);
      }
      #endif`,
    );
    fs = fs.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + crCav * 0.25, 0.04, 1.0);`,
    );
    fs = fs.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      #ifdef CR_CLASS
      normal = crPerturb(-vViewPosition, normal, crH * uBumpAmp * crFade);
      #endif`,
    );
    fs = fs.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef CR_GLOWMASK
      {
        vec2 vv = crVoronoi(vBindPos * uDetail * 0.33);
        float crack = 1.0 - smoothstep(0.0, 0.085, vv.y);
        float core = 1.0 - smoothstep(0.0, 0.03, vv.y);
        totalEmissiveRadiance *= (crack * 0.7 + core * 0.8) * smoothstep(0.08, 0.55, vGlow);
      }
      #endif
      {
        vec3 vd = normalize(vViewPosition);
        float fr = pow(1.0 - clamp(dot(normalize(normal), vd), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += uRimColor * fr * uRimStrength * (0.6 + uRimLocal);
        totalEmissiveRadiance += diffuseColor.rgb * fr * 0.12 * uFuzz;
      }`,
    );
    fs = fs.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      #if defined(CR_WRAP) && NUM_DIR_LIGHTS > 0
      {
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
          vec3 L = directionalLights[i].direction;
          float ndl = dot(normal, L);
          float wt = max(0.0, (ndl + uWrap) / (1.0 + uWrap)) - max(0.0, ndl);
          reflectedLight.directDiffuse += material.diffuseColor * RECIPROCAL_PI * directionalLights[i].color * uSss * wt * 0.9;
        }
      }
      #endif`,
    );
    fs = fs.replace(
      '#include <opaque_fragment>',
      `#ifdef CR_FRESNEL_ALPHA
      {
        float frA = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 1.5);
        diffuseColor.a *= mix(0.55, 1.0, frA);
      }
      #endif
      #include <opaque_fragment>`,
    );
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

/** Back-compat helper (rim only). */
export function injectRim(mat: THREE.Material, rimColor: THREE.Color, rimStrength: number) {
  applyCreatureShader(mat as THREE.MeshStandardMaterial, { rim: rimColor, rimStrength, preset: 'GLOW', quality: 'balanced', detail: 0, H: 1 });
}

export interface MatOpts {
  color: string;
  preset: Preset;
  quality: Quality;
  emissive?: string;
  emissiveIntensity?: number;
  rim?: string;
  rimStrength?: number;
  vertexColors?: boolean;
  opacity?: number;
  map?: THREE.Texture;
  flatShading?: boolean;
  /** creature height in metres (detail scale); 0/undefined disables procedural detail */
  H?: number;
  /** sculpted-body extras */
  attrs?: boolean;
  glowMask?: boolean;
  shell?: { h: number; len: number; strand: number };
}

const cache = new Map<string, THREE.Material>();

export function makeMaterial(o: MatOpts): THREE.MeshStandardMaterial {
  const key = JSON.stringify({ ...o, map: o.map?.uuid });
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const p = PRESET[o.preset];
  const physical = o.quality === 'high' && (p.clearcoat || p.sheen) && !o.shell;
  const params: THREE.MeshPhysicalMaterialParameters = {
    color: new THREE.Color(o.color),
    roughness: p.rough,
    metalness: p.metal,
    side: p.side ?? THREE.FrontSide,
    vertexColors: !!o.vertexColors,
    flatShading: !!o.flatShading,
  };
  const opacity = o.opacity ?? p.opacity;
  if (opacity != null && opacity < 1) {
    params.transparent = true;
    params.opacity = opacity;
    params.depthWrite = o.preset !== 'MEMBRANE' && o.preset !== 'ICE' ? true : false;
  }
  if (o.map) params.map = o.map;
  let mat: THREE.MeshStandardMaterial;
  if (physical) {
    const pm = new THREE.MeshPhysicalMaterial(params);
    if (p.clearcoat) {
      pm.clearcoat = p.clearcoat;
      pm.clearcoatRoughness = 0.25;
    }
    if (p.sheen) {
      pm.sheen = 0.6;
      pm.sheenRoughness = 0.5;
      pm.sheenColor = o.vertexColors ? new THREE.Color(0.55, 0.55, 0.55) : new THREE.Color(o.color).offsetHSL(0, 0, 0.2);
    }
    mat = pm;
  } else {
    mat = new THREE.MeshStandardMaterial(params);
    if (o.quality !== 'mobile' && (p.clearcoat ?? 0) > 0.3) mat.roughness = Math.max(0.2, p.rough * 0.9);
  }
  if (o.emissive) {
    mat.emissive = new THREE.Color(o.emissive);
    mat.emissiveIntensity = (o.emissiveIntensity ?? 1) * (o.quality === 'mobile' ? 0.8 : 1);
    if (o.preset === 'GLOW') mat.toneMapped = true;
  }
  applyCreatureShader(mat, {
    rim: new THREE.Color(o.rim ?? '#ffffff'),
    rimStrength: o.rimStrength ?? 0.3,
    preset: o.preset,
    quality: o.quality,
    detail: o.H ? 1 / o.H : 0,
    H: o.H ?? 1,
    attrs: o.attrs,
    glowMask: o.glowMask,
    shell: o.shell,
    fresnelAlpha: (o.preset === 'ICE' || o.preset === 'CRYSTAL') && o.quality !== 'mobile',
  });
  cache.set(key, mat);
  return mat;
}

/** Re-install the shader layer on a cloned material (onBeforeCompile is not copied by clone()). */
export function cloneCreatureMaterial(src: THREE.MeshStandardMaterial, o: MatOpts): THREE.MeshStandardMaterial {
  const m = src.clone();
  applyCreatureShader(m, {
    rim: new THREE.Color(o.rim ?? '#ffffff'),
    rimStrength: o.rimStrength ?? 0.3,
    preset: o.preset,
    quality: o.quality,
    detail: o.H ? 1 / o.H : 0,
    H: o.H ?? 1,
    attrs: o.attrs,
    glowMask: o.glowMask,
    shell: o.shell,
    fresnelAlpha: (o.preset === 'ICE' || o.preset === 'CRYSTAL') && o.quality !== 'mobile',
  });
  return m;
}

export function shade(hex: string, dl: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + dl)));
  return '#' + c.getHexString();
}
