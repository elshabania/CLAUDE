// PBR surface materials built on MeshStandardMaterial (so lights, shadows, fog and IBL stay standard)
// with the procedural texture arrays patched in via onBeforeCompile.
//  - 'terrain': splat blend (ground A/B, shore, path, plaza, cliff, snow) driven by per-vertex weights,
//    height-based transitions, world-space planar UVs + triplanar rock on steep slopes, macro variation
//    and a second, larger-scale sample of the ground to break up tiling.
//  - 'object': per-vertex layer id (aSurf.x) with object-space triplanar (aSurf.y = 0) or metre UVs
//    (aSurf.y = 1, cotangent frame from derivatives). Vertex colour tints the layer to its mean colour.
// SURF_CHEAP (Mobile) keeps one projection per fragment and drops the anti-tiling sample.
import * as THREE from 'three';
import { SURF_MEAN, SURF_TILE } from './recipes';
import type { SurfaceLib } from './bake';
import { windUniforms } from '../props/wind';

const MEANS = SURF_MEAN.map((h) => new THREE.Color(h)); // THREE.Color parses sRGB hex → linear

export function layerMean(layer: number): THREE.Color {
  return MEANS[layer];
}

/** Linear tint that maps a layer's mean colour onto `target` (partially, by `strength`). */
export function tintFor(layer: number, target: THREE.ColorRepresentation, strength = 0.75, out = new THREE.Color()): THREE.Color {
  const t = new THREE.Color(target);
  const m = MEANS[layer];
  out.setRGB(
    1 + (Math.min(3, t.r / Math.max(0.004, m.r)) - 1) * strength,
    1 + (Math.min(3, t.g / Math.max(0.004, m.g)) - 1) * strength,
    1 + (Math.min(3, t.b / Math.max(0.004, m.b)) - 1) * strength,
  );
  return out;
}

const COMMON_FRAG = /* glsl */ `
uniform highp sampler2DArray uSurfA;
uniform highp sampler2DArray uSurfB;
uniform float uSurfTile[16];
struct SS { vec3 c; float h; vec3 p; float r; float a; };
SS ssZero() { SS s; s.c = vec3(0.0); s.h = 0.0; s.p = vec3(0.0); s.r = 0.0; s.a = 0.0; return s; }
// planar sample: p in metres, T/B = world/object directions of +u/+v
void ssAdd(inout SS s, vec2 p, vec2 dx, vec2 dy, float L, vec3 T, vec3 B, float w) {
  float t = 1.0 / uSurfTile[int(L)];
  vec3 uvl = vec3(p * t, L);
  vec4 a = textureGrad(uSurfA, uvl, dx * t, dy * t);
  vec4 b = textureGrad(uSurfB, uvl, dx * t, dy * t);
  vec2 tn = b.xy * 2.0 - 1.0;
  s.c += w * a.rgb; s.h += w * a.a; s.p += w * (T * tn.x + B * tn.y); s.r += w * b.z; s.a += w * b.w;
}
SS ssTri(vec3 p, vec3 dpx, vec3 dpy, vec3 N, float L) {
  SS s = ssZero();
  vec3 w = abs(N); w = w * w; w = w * w; w /= dot(w, vec3(1.0));
#ifdef SURF_CHEAP
  if (w.x >= w.y && w.x >= w.z) ssAdd(s, p.zy, dpx.zy, dpy.zy, L, vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), 1.0);
  else if (w.y >= w.z) ssAdd(s, p.xz, dpx.xz, dpy.xz, L, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), 1.0);
  else ssAdd(s, p.xy, dpx.xy, dpy.xy, L, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0);
#else
  w = max(w - 0.03, 0.0); w /= dot(w, vec3(1.0));
  if (w.x > 0.0) ssAdd(s, p.zy, dpx.zy, dpy.zy, L, vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), w.x);
  if (w.y > 0.0) ssAdd(s, p.xz, dpx.xz, dpy.xz, L, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), w.y);
  if (w.z > 0.0) ssAdd(s, p.xy, dpx.xy, dpy.xy, L, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), w.z);
#endif
  return s;
}
SS ssMix(SS a, SS b, float t) { SS s; s.c = mix(a.c, b.c, t); s.h = mix(a.h, b.h, t); s.p = mix(a.p, b.p, t); s.r = mix(a.r, b.r, t); s.a = mix(a.a, b.a, t); return s; }
// height-aware blend: b replaces a where its height pokes through as t rises
SS ssHB(SS a, SS b, float t, float depth) {
  float a1 = a.h + (1.0 - t), a2 = b.h + t;
  float m = max(a1, a2) - depth;
  float b1 = max(a1 - m, 0.0), b2 = max(a2 - m, 0.0);
  return ssMix(a, b, b2 / max(b1 + b2, 1e-4));
}
float sfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sfNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfHash(i), sfHash(i + vec2(1.0, 0.0)), f.x), mix(sfHash(i + vec2(0.0, 1.0)), sfHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

export interface SurfaceMaterialOptions {
  lib: SurfaceLib;
  kind: 'terrain' | 'object';
  cheap?: boolean;
  /** wind sway via the `sway` attribute (see props/wind.ts) */
  wind?: boolean;
  side?: THREE.Side;
  roughness?: number;
  metalness?: number;
  /** terrain: layer ids + linear tints */
  terrain?: TerrainLayers;
  /** extra fragment hook appended after the surface sample (e.g. window glow) */
  emissiveHook?: string;
  extraUniforms?: Record<string, THREE.IUniform>;
}

export interface TerrainLayers {
  groundA: number; groundB: number; path: number; cliff: number; snow: number; plaza: number; shore: number;
  tints: { groundA: THREE.Color; groundB: THREE.Color; path: THREE.Color; cliff: THREE.Color; snow: THREE.Color; plaza: THREE.Color; shore: THREE.Color };
}

export const WIND_VERT = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 wIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 wIp = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
  #endif
  float wPh = wIp.x * 0.37 + wIp.z * 0.23;
  float wW = sway * sway * uWind;
  float gust = 0.65 + 0.35 * sin(uTime * 0.31 + wIp.x * 0.05);
  transformed.x += (sin(uTime * 1.7 + wPh) * 0.12 + sin(uTime * 4.3 + wPh * 3.1 + position.y) * 0.025) * wW * gust;
  transformed.z += (cos(uTime * 1.3 + wPh * 1.3) * 0.08 + cos(uTime * 3.7 + wPh * 2.3 + position.x) * 0.02) * wW * gust;
`;

/** Emissive strength of glow-mode surfaces (lit windows); driven by the atmosphere (night / interiors). */
export const surfaceGlow = { value: 0 };

export function makeSurfaceMaterial(o: SurfaceMaterialOptions): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    vertexColors: o.kind === 'object',
    side: o.side ?? THREE.FrontSide,
  });
  const tiles = { value: SURF_TILE.slice() };
  const uniforms: Record<string, THREE.IUniform> = {
    uSurfA: { value: o.lib.albedo },
    uSurfB: { value: o.lib.normal },
    uSurfTile: tiles,
    ...(o.extraUniforms ?? {}),
  };
  if (o.kind === 'terrain' && o.terrain) {
    const t = o.terrain;
    uniforms.uLayA = { value: new THREE.Vector4(t.groundA, t.groundB, t.path, t.cliff) };
    uniforms.uLayB = { value: new THREE.Vector4(t.snow, t.plaza, t.shore, 0) };
    for (const [k, v] of Object.entries(t.tints)) uniforms['uT_' + k] = { value: v };
  } else {
    uniforms.uSurfMean = { value: MEANS.map((c) => new THREE.Vector3(c.r, c.g, c.b)) };
    uniforms.uSurfGlow = surfaceGlow;
  }
  if (o.wind) {
    uniforms.uTime = windUniforms.uTime;
    uniforms.uWind = windUniforms.uWind;
  }
  m.userData.surfUniforms = uniforms;
  m.defines = { ...(m.defines ?? {}), ...(o.cheap ? { SURF_CHEAP: '' } : {}), ...(o.kind === 'terrain' ? { SURF_TERRAIN: '' } : { SURF_OBJECT: '' }) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    let vs = sh.vertexShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vSP; varying vec3 vSN;
      #ifdef SURF_TERRAIN
        attribute vec4 aSplat; attribute vec4 aSplat2; varying vec4 vSplat; varying vec4 vSplat2;
      #else
        attribute vec2 aSurf; attribute vec2 aUv; flat varying vec2 vSurf; varying vec2 vSUv; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
      #endif
      ${o.wind ? 'attribute float sway; uniform float uTime; uniform float uWind;' : ''}`,
    );
    vs = vs.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vSP = transformed; vSN = objectNormal;
      #ifdef SURF_TERRAIN
        vSplat = aSplat; vSplat2 = aSplat2;
      #else
        vSurf = aSurf; vSUv = aUv;
        mat3 sm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          sm = sm * mat3(instanceMatrix);
        #endif
        vM0 = normalize(sm[0]); vM1 = normalize(sm[1]); vM2 = normalize(sm[2]);
      #endif
      ${o.wind ? WIND_VERT : ''}`,
    );
    sh.vertexShader = vs;

    let fs = sh.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      `#include <common>
      ${COMMON_FRAG}
      varying vec3 vSP; varying vec3 vSN;
      #ifdef SURF_TERRAIN
        varying vec4 vSplat; varying vec4 vSplat2;
        uniform vec4 uLayA; uniform vec4 uLayB;
        uniform vec3 uT_groundA; uniform vec3 uT_groundB; uniform vec3 uT_path; uniform vec3 uT_cliff; uniform vec3 uT_snow; uniform vec3 uT_plaza; uniform vec3 uT_shore;
      #else
        flat varying vec2 vSurf; varying vec2 vSUv; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
        uniform vec3 uSurfMean[16];
        uniform float uSurfGlow;
      #endif
      ${Object.keys(o.extraUniforms ?? {}).map((k) => `uniform ${uniformType(o.extraUniforms![k].value)} ${k};`).join('\n')}`,
    );
    const terrainMain = /* glsl */ `
      vec3 sNo = normalize(vSN);
      vec3 wp = vSP;
      vec3 dpx = dFdx(wp), dpy = dFdy(wp);
      vec2 dx = dpx.xz, dy = dpy.xz;
      float mac = sfNoise(wp.xz * 0.021) * 0.6 + sfNoise(wp.xz * 0.083 + 13.1) * 0.4;
      vec3 TX = vec3(1.0, 0.0, 0.0), TZ = vec3(0.0, 0.0, 1.0);
      SS g = ssZero(); ssAdd(g, wp.xz, dx, dy, uLayA.x, TX, TZ, 1.0);
      #ifndef SURF_CHEAP
        SS g2 = ssZero(); ssAdd(g2, wp.xz * 0.29 + vec2(0.37, 0.71), dx * 0.29, dy * 0.29, uLayA.x, TX, TZ, 1.0);
        g = ssMix(g, g2, 0.25 + 0.4 * mac);
      #endif
      g.c *= uT_groundA;
      SS cur = g;
      if (vSplat.x > 0.003) {
        SS b = ssZero(); ssAdd(b, wp.zx * 0.93 + vec2(0.5), dx.yx * 0.93, dy.yx * 0.93, uLayA.y, TZ, TX, 1.0);
        b.c *= uT_groundB;
        cur = ssHB(cur, b, clamp(vSplat.x + (mac - 0.5) * 0.35, 0.0, 1.0), 0.2);
      }
      if (vSplat2.y > 0.003) { SS b = ssZero(); ssAdd(b, wp.xz, dx, dy, uLayB.z, TX, TZ, 1.0); b.c *= uT_shore; cur = ssHB(cur, b, vSplat2.y, 0.15); }
      if (vSplat.y > 0.003) { SS b = ssZero(); ssAdd(b, wp.xz, dx, dy, uLayA.z, TX, TZ, 1.0); b.c *= uT_path; cur = ssHB(cur, b, clamp(vSplat.y * (0.85 + 0.3 * mac), 0.0, 1.0), 0.18); }
      if (vSplat2.x > 0.003) { SS b = ssZero(); ssAdd(b, wp.xz, dx, dy, uLayB.y, TX, TZ, 1.0); b.c *= uT_plaza; cur = ssHB(cur, b, vSplat2.x, 0.12); }
      if (vSplat.z > 0.003) { SS b = ssTri(wp * 0.42, dpx * 0.42, dpy * 0.42, sNo, uLayA.w); b.c *= uT_cliff; cur = ssHB(cur, b, vSplat.z, 0.25); }
      if (vSplat.w > 0.003) { SS b = ssZero(); ssAdd(b, wp.xz, dx, dy, uLayB.x, TX, TZ, 1.0); b.c *= uT_snow; cur = ssHB(cur, b, vSplat.w, 0.3); }
      cur.c *= 0.84 + 0.32 * mac;
      float wet = vSplat2.z;
      cur.c *= 1.0 - 0.4 * wet; cur.r = mix(cur.r, 0.25, wet * 0.8);
      diffuseColor.rgb *= min(cur.c, vec3(0.9)) * mix(1.0, cur.a, 0.35);
      vec3 sPert = cur.p; float sRough = cur.r; float sAO = cur.a;
    `;
    const objectMain = /* glsl */ `
      float sL = floor(vSurf.x + 0.5);
      vec3 sNo = normalize(vSN) * (gl_FrontFacing ? 1.0 : -1.0);
      vec3 dpx = dFdx(vSP), dpy = dFdy(vSP);
      vec2 du1 = dFdx(vSUv), du2 = dFdy(vSUv);
      SS cur;
      if (vSurf.y > 0.5) {
        vec3 dp2perp = cross(dpy, sNo), dp1perp = cross(sNo, dpx);
        vec3 T = dp2perp * du1.x + dp1perp * du2.x; vec3 B = dp2perp * du1.y + dp1perp * du2.y;
        float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12)); T *= im; B *= im;
        cur = ssZero(); ssAdd(cur, vSUv, du1, du2, sL, T, B, 1.0);
      } else {
        cur = ssTri(vSP, dpx, dpy, sNo, sL);
      }
      diffuseColor.rgb *= cur.c / uSurfMean[int(sL)] * mix(1.0, cur.a, 0.4);
      vec3 sPert = cur.p; float sRough = cur.r; float sAO = cur.a;
      #ifdef USE_COLOR
        if (vSurf.y > 1.5) totalEmissiveRadiance += vColor.rgb * uSurfGlow * (0.6 + 0.4 * cur.a);
      #endif
    `;
    fs = fs.replace('#include <map_fragment>', `#include <map_fragment>\n${o.kind === 'terrain' ? terrainMain : objectMain}`);
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.92));\n${o.emissiveHook ?? ''}`);
    fs = fs.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * sRough, 0.04, 1.0);');
    fs = fs.replace(
      '#include <normal_fragment_maps>',
      `{
        vec3 nO = normalize(sNo + sPert);
        #ifdef SURF_TERRAIN
          vec3 nW = nO;
        #else
          vec3 nW = normalize(vM0 * nO.x + vM1 * nO.y + vM2 * nO.z);
        #endif
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`,
    );
    fs = fs.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= sAO; reflectedLight.indirectSpecular *= mix(1.0, sAO, 0.8);');
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `surf:${o.kind}:${o.cheap ? 1 : 0}:${o.wind ? 1 : 0}:${o.emissiveHook ? o.emissiveHook.length : 0}`;
  return m;
}

function uniformType(v: unknown): string {
  if (typeof v === 'number') return 'float';
  if (v instanceof THREE.Color || v instanceof THREE.Vector3) return 'vec3';
  if (v instanceof THREE.Vector2) return 'vec2';
  if (v instanceof THREE.Vector4) return 'vec4';
  return 'float';
}
