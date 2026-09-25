// Shaders for the human cast: skin (wrap-lit subsurface approximation + shader-painted brows/lips/liner),
// eyes (procedural iris/pupil/sclera + catchlight), fabric/leather (procedural weave, folds, hems, piping,
// seams; one material for every cloth part of every character), anisotropic hair and brass.
import * as THREE from 'three';

export type HumanQuality = 'high' | 'balanced' | 'mobile';

const SSS_CHUNK = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'vec3 irradiance = dotNL * directLight.color;',
  `vec3 irradiance = dotNL * directLight.color;
  #ifdef SKIN_SSS
  {
    float ndl = dot( geometryNormal, directLight.direction );
    float wrapd = saturate( ( ndl + 0.5 ) / 1.5 );
    vec3 sssW = max( vec3( 0.0 ), vec3( wrapd ) * vec3( 1.0, 0.72, 0.62 ) - vec3( dotNL ) );
    reflectedLight.directDiffuse += sssW * directLight.color * BRDF_Lambert( material.diffuseColor ) * 0.85;
  }
  #endif`,
);

const NOISE = /* glsl */ `
float hh31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hh31(i), hh31(i+vec3(1,0,0)), f.x), mix(hh31(i+vec3(0,1,0)), hh31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hh31(i+vec3(0,0,1)), hh31(i+vec3(1,0,1)), f.x), mix(hh31(i+vec3(0,1,1)), hh31(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;

export interface SkinParams {
  skin: string;
  brow: string;
  lip?: string;
  lipAmt?: number;
  browThick?: number;
  browArch?: number;
  /** face landmarks in face units (see build script): mouth corner x, lip line y, upper/lower lip heights */
  mouth: [number, number, number, number];
  age?: number;
  freckles?: number;
  blush?: number;
}

export function skinMaterial(p: SkinParams, face: boolean, q: HumanQuality): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.58, metalness: 0 });
  const skin = new THREE.Color(p.skin);
  const hsl = { h: 0, s: 0, l: 0 };
  skin.getHSL(hsl);
  const lip = p.lip ? new THREE.Color(p.lip) : new THREE.Color().setHSL(0.995, Math.min(0.42, hsl.s + 0.1), Math.max(0.2, hsl.l * 0.8));
  const u = {
    uBrow: { value: new THREE.Color(p.brow) },
    uLip: { value: lip },
    uBrowP: { value: new THREE.Vector4(p.browThick ?? 1, p.browArch ?? 1, p.freckles ?? 0, p.blush ?? 1) },
    uMouth: { value: new THREE.Vector4(...p.mouth) },
    uAge: { value: p.lipAmt ?? 0.8 },
  };
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.defines = { ...(sh.defines ?? {}), SKIN_SSS: '' };
    if (face) sh.defines.FACE_PAINT = '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFace;\nvarying vec4 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', SSS_CHUNK)
      .replace('#include <common>', `#include <common>
varying vec4 vFace;
uniform vec3 uBrow; uniform vec3 uLip; uniform vec4 uBrowP; uniform vec4 uMouth; uniform float uAge;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef FACE_PAINT
{
  vec2 f = vFace.xy; float ax = abs(f.x);
  // brows: tapered arc on the brow ridge (landmarks: inner ~(0.5,0.78), peak ~(1.15,0.86), tail ~(1.75,0.45))
  float bt = clamp((ax - 0.42) / 1.33, 0.0, 1.0);
  float by = 0.78 + 0.13 * uBrowP.y * sin(bt * 2.4) - 0.36 * bt * bt;
  float bw = mix(0.15, 0.045, bt * bt) * uBrowP.x;
  float inBx = smoothstep(0.36, 0.48, ax) * (1.0 - smoothstep(1.68, 1.8, ax));
  // hair direction: up-and-out at the head of the brow, flattening outward along the tail
  float ang = mix(1.1, 0.15, smoothstep(0.0, 0.45, bt));
  vec2 hd = vec2(cos(ang), sin(ang));
  vec2 hp = vec2(dot(vec2(ax, f.y), vec2(-hd.y, hd.x)), dot(vec2(ax, f.y), hd));
  float strokes = 0.62 + 0.38 * smoothstep(0.25, 0.85, 0.6 * vnoise(vec3(hp.x * 170.0, hp.y * 9.0, 1.0)) + 0.4 * vnoise(vec3(hp.x * 90.0 + 7.0, hp.y * 23.0, 4.0)));
  float edgeN = (vnoise(vec3(f.x * 40.0, f.y * 40.0, 5.0)) - 0.5) * 0.03;
  float core = 1.0 - smoothstep(bw * 0.35, bw + edgeN, abs(f.y - by));
  float brow = inBx * core * strokes * mix(0.75, 1.0, smoothstep(0.0, 0.3, bt));
  diffuseColor.rgb = mix(diffuseColor.rgb, uBrow, clamp(brow, 0.0, 1.0) * 0.9);
  // upper-lid crease shading + subtle lower-lid warmth
  float eyeD = length((vec2(ax, f.y) - vec2(1.0, 0.12)) * vec2(0.8, 1.3));
  diffuseColor.rgb *= 1.0 - 0.09 * smoothstep(0.75, 0.45, eyeD) * step(0.1, f.y);
  // soft occlusion: inner eye corners, under the brow ridge, nostrils, mouth corners
  float ao = 0.0;
  ao += (1.0 - smoothstep(0.0, 0.35, length(vec2(ax, f.y) - vec2(0.42, -0.02)))) * 0.25;
  ao += (1.0 - smoothstep(0.0, 0.25, length((vec2(ax, f.y) - vec2(0.28, -1.72)) * vec2(1.0, 1.6)))) * 0.3;
  ao += (1.0 - smoothstep(0.0, 0.22, length(vec2(ax, f.y) - vec2(uMouth.x * 1.02, uMouth.y)))) * 0.25;
  diffuseColor.rgb *= 1.0 - ao * 0.5;
  // blush + warm nose tip
  float cheek = 1.0 - smoothstep(0.1, 0.9, length((vec2(ax, f.y) - vec2(1.35, -1.25)) * vec2(1.0, 1.25)));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.03, 0.85, 0.83), cheek * 0.35 * uBrowP.w);
  float nose = 1.0 - smoothstep(0.0, 0.4, length(vec2(f.x, f.y + 1.3)));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.88, 0.86), nose * 0.25);
  // freckles
  vec2 fc = f * 16.0; vec2 fi = floor(fc);
  float fh = hh31(vec3(fi, 3.0));
  float fr = step(0.8, fh) * (1.0 - smoothstep(0.12, 0.28, length(fract(fc) - 0.5 - (vec2(hh31(vec3(fi, 7.0)), hh31(vec3(fi, 9.0))) - 0.5) * 0.4)))
    * (1.0 - smoothstep(0.3, 1.1, length((vec2(ax, f.y) - vec2(0.8, -1.1)) * vec2(0.7, 1.4))));
  diffuseColor.rgb *= 1.0 - fr * 0.2 * uBrowP.z;
  // lips: vermilion from the orbicularis-oris weights, shaped by the mouth landmarks
  float lx = ax / uMouth.x;
  float dy = f.y - uMouth.y;
  float upH = uMouth.z * (1.0 - lx * lx * 0.85) * (0.86 + 0.14 * smoothstep(0.05, 0.3, lx));
  float loH = uMouth.w * (1.0 - pow(min(lx, 1.0), 2.4));
  float shape = (dy > 0.0 ? 1.0 - smoothstep(upH * 0.82, upH, dy) : 1.0 - smoothstep(loH * 0.8, loH, -dy)) * (1.0 - smoothstep(0.95, 1.05, lx));
  float lipM = shape * smoothstep(0.25, 0.55, vFace.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, uLip, lipM * uAge);
  // mouth cavity (geometry behind the lips)
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.07, 0.07), smoothstep(0.05, 0.6, vFace.w));
}
#endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef FACE_PAINT
  { vec2 f = vFace.xy; float lx = clamp(abs(f.x) / uMouth.x, 0.0, 1.2); float dy = f.y - uMouth.y;
    float lipR = (dy > 0.0 ? step(dy, uMouth.z) : step(-dy, uMouth.w)) * step(lx, 1.0) * smoothstep(0.25, 0.55, vFace.z);
    roughnessFactor = mix(roughnessFactor, 0.36, lipR); roughnessFactor = mix(roughnessFactor, 0.5, 1.0 - smoothstep(0.0, 0.6, length(vec2(f.x, f.y + 1.35)))); }
#endif`);
  };
  m.customProgramCacheKey = () => 'human-skin-' + (face ? 'f' : 'b') + q;
  return m;
}

/** Eyeball: +z forward in eye-bone space. */
export function eyeMaterial(iris: string, q: HumanQuality): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: q === 'mobile' ? 0 : 1, clearcoatRoughness: 0.04 });
  const u = { uIris: { value: new THREE.Color(iris) }, uIrisR: { value: 0.64 }, uPupil: { value: 0.40 } };
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEye;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEye = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vEye; uniform vec3 uIris; uniform float uIrisR; uniform float uPupil;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 e = normalize(vEye);
  float r = length(e.xy) * step(0.0, e.z) + step(e.z, 0.0) * 2.0;
  float ir = uIrisR;
  float a = atan(e.y, e.x);
  vec3 sclera = mix(vec3(0.96, 0.94, 0.92), vec3(0.86, 0.74, 0.72), smoothstep(0.6, 1.0, r) * 0.6);
  float fib = vnoise(vec3(a * 9.0, r * 18.0, 0.0)) * 0.5 + vnoise(vec3(a * 23.0, r * 6.0, 3.0)) * 0.5;
  float rr = r / ir;
  vec3 irisC = uIris * (0.55 + 0.75 * fib) * mix(1.25, 0.7, rr);
  irisC = mix(irisC, uIris * 1.6 + 0.08, smoothstep(0.55, 0.3, rr) * 0.35);
  irisC = mix(irisC, vec3(0.03), smoothstep(0.82, 1.0, rr) * 0.75); // limbal ring
  vec3 col = mix(irisC, sclera, smoothstep(0.97, 1.03, rr));
  col = mix(vec3(0.015), col, smoothstep(uPupil - 0.04, uPupil + 0.02, rr));
  // upper-lid shadow on the eyeball
  col *= mix(1.0, 0.6, smoothstep(0.1, 0.8, e.y));
  diffuseColor.rgb = col;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 vn = normalize(vNormal);
  float cl = dot(vn, normalize(vec3(-0.32, 0.42, 1.0)));
  totalEmissiveRadiance += vec3(1.0) * smoothstep(0.9925, 0.9965, cl) * 1.4;
  float cl2 = dot(vn, normalize(vec3(0.3, -0.25, 1.0)));
  totalEmissiveRadiance += vec3(0.8) * smoothstep(0.9975, 0.999, cl2) * 0.6;
}`);
  };
  m.customProgramCacheKey = () => 'human-eye' + q;
  return m;
}

// ---------------------------------------------------------------- cloth
// attributes: color (base), aCol2 (piping/secondary), aCloth = (kind, cut, pattern, w), aRest (bind-pose position)
// kind: 0 cotton, 1 canvas/denim, 2 leather, 3 knit/wool, 4 rubber sole, 5 cap twill
// pattern: 1 stripes, 2 placket+buttons, 3 tuning-fork emblem (w = emblem centre y), 4 piping on cut edges
const clothShared: Partial<Record<HumanQuality, THREE.MeshStandardMaterial>> = {};
export function clothMaterial(q: HumanQuality): THREE.MeshStandardMaterial {
  if (clothShared[q]) return clothShared[q]!;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCol2; attribute vec4 aCloth; attribute vec3 aRest;\nvarying vec3 vCol2; varying vec4 vCloth; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCol2 = aCol2; vCloth = aCloth; vRest = aRest;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCol2; varying vec4 vCloth; varying vec3 vRest;
${NOISE}
float clothH(float kind, vec3 r, float fade) {
  // height field in metres: fine weave (faded with distance) + soft wrinkles
  float h = 0.0;
  if (kind < 0.5) h = 0.00012 * sin(r.x * 2200.0) * sin(r.y * 2200.0);
  else if (kind < 1.5) h = 0.0002 * sin((r.x + r.y + r.z) * 1500.0);
  else if (kind < 2.5) h = 0.00015 * vnoise(r * 700.0);
  else if (kind < 3.5) h = 0.00035 * abs(sin(r.x * 900.0 + sin(r.y * 700.0) * 0.8));
  else if (kind > 4.5) h = 0.00015 * sin((r.x - r.y) * 1800.0);
  h *= fade;
  if (kind < 4.0) h += 0.0022 * (vnoise(r * vec3(18.0, 42.0, 18.0)) - 0.5) + 0.0009 * (vnoise(r * 90.0) - 0.5);
  return h;
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vCloth.y > 0.0) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float kind = floor(vCloth.x + 0.5);
float pat = floor(vCloth.z + 0.5);
float edge = -vCloth.y;
float fw = length(fwidth(vRest));
float fineFade = 1.0 - smoothstep(0.00015, 0.0006, fw);
{
  float mottle = vnoise(vRest * 45.0) - 0.5;
  float grain = kind > 1.5 && kind < 2.5 ? vnoise(vRest * 400.0) - 0.5 : 0.0;
  diffuseColor.rgb *= 1.0 + 0.08 * mottle + 0.12 * grain * fineFade;
  if (kind > 0.5 && kind < 1.5) diffuseColor.rgb *= 1.0 + 0.05 * fineFade * sin((vRest.x + vRest.y + vRest.z) * 1500.0);
  if (pat > 0.5 && pat < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, smoothstep(0.45, 0.55, abs(fract(vRest.y * 28.0) - 0.5) * 2.0));
  if (pat > 1.5 && pat < 2.5) {
    float pk = 1.0 - smoothstep(0.008, 0.011, abs(vRest.x));
    float front = step(0.0, vRest.z);
    diffuseColor.rgb *= 1.0 - 0.1 * pk * front;
    float by = fract(vRest.y * 25.0);
    float btn = 1.0 - smoothstep(0.0035, 0.0048, length(vec2(vRest.x, (by - 0.5) / 25.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, btn * front * vCloth.w);
  }
  if (pat > 2.5 && pat < 3.5) {
    vec2 e = vec2(vRest.x, vRest.y - vCloth.w) * 100.0;
    float front = step(0.035, vRest.z);
    float stem = step(abs(e.x), 0.2) * step(-1.2, e.y) * step(e.y, -0.15);
    float tine = step(abs(abs(e.x) - 0.42), 0.15) * step(-0.3, e.y) * step(e.y, 1.0);
    float bridge = step(abs(e.y + 0.25), 0.15) * step(abs(e.x), 0.57);
    float ring = smoothstep(1.25, 1.35, length(e)) * (1.0 - smoothstep(1.5, 1.6, length(e)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, front * clamp(max(max(stem, tine), max(bridge, ring)), 0.0, 1.0));
  }
  if (pat > 4.5) {
    vec2 qd = vec2(vRest.x + vRest.y, vRest.x - vRest.y) * 13.0;
    vec2 fq = abs(fract(qd) - 0.5);
    float dq = 0.5 - max(fq.x, fq.y);
    diffuseColor.rgb *= 1.0 - 0.12 * (1.0 - smoothstep(0.01, 0.045, dq)) + 0.04 * smoothstep(0.1, 0.4, dq);
  }
  float band = 1.0 - smoothstep(0.011, 0.015, edge);
  if (pat > 3.5) diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, band);
  else diffuseColor.rgb *= 1.0 - 0.07 * band;
  float st = (1.0 - smoothstep(0.0009, 0.0016, abs(edge - 0.02))) * step(0.45, fract((vRest.x + vRest.y + vRest.z) * 260.0)) * fineFade;
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(0.9, 0.85, 0.72), 0.5), st * step(kind, 3.5));
  if (!gl_FrontFacing) diffuseColor.rgb *= 0.68;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = kind > 1.5 && kind < 2.5 ? 0.48 + 0.2 * vnoise(vRest * 300.0) : (kind > 3.5 && kind < 4.5 ? 0.65 : (kind > 2.5 && kind < 3.5 ? 0.95 : 0.84));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float h = clothH(kind, vRest, fineFade);
  h -= 0.0004 * (1.0 - smoothstep(0.0, 0.003, abs(edge - 0.02))) * step(kind, 3.5);
  if (floor(vCloth.z + 0.5) > 4.5) { vec2 fq2 = abs(fract(vec2(vRest.x + vRest.y, vRest.x - vRest.y) * 13.0) - 0.5); h += 0.003 * smoothstep(0.0, 0.25, 0.5 - max(fq2.x, fq2.y)); }
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dHx = dFdx(h), dHy = dFdy(h);
  vec3 R1 = cross(dpdy, normal), R2 = cross(normal, dpdx);
  float fDet = dot(dpdx, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHx * R1 + dHy * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}`);
  };
  m.customProgramCacheKey = () => 'human-cloth-' + q;
  clothShared[q] = m;
  return m;
}

const hairCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function hairMaterial(color: string, q: HumanQuality): THREE.MeshStandardMaterial {
  const k = color + q;
  if (hairCache.has(k)) return hairCache.get(k)!;
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, metalness: 0, side: THREE.DoubleSide, vertexColors: true, anisotropy: q === 'mobile' ? 0 : 0.6, specularIntensity: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHairUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHairUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHairUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float s = vHairUv.x; float t = vHairUv.y;
    float strand = 0.93 + 0.07 * sin(s * 37.0 + t * 5.0) * sin(s * 91.0 + 1.3);
    diffuseColor.rgb *= strand * mix(1.0, 1.1, smoothstep(0.6, 1.0, t)); }`);
  };
  m.customProgramCacheKey = () => 'human-hair' + q;
  hairCache.set(k, m);
  return m;
}

let metal: THREE.MeshStandardMaterial | null = null;
export function metalMaterial(): THREE.MeshStandardMaterial {
  if (!metal) metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMapIntensity: 1 });
  return metal;
}

let lash: THREE.MeshStandardMaterial | null = null;
export function lashMaterial(): THREE.MeshStandardMaterial {
  if (!lash) {
    lash = new THREE.MeshStandardMaterial({ color: '#120d0b', roughness: 0.7, side: THREE.DoubleSide });
    lash.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aLash; varying vec3 vLash;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLash = aLash;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLash;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  {
    float lower = step(0.5, vLash.z);
    float across = vLash.y;
    float n = mix(34.0, 22.0, lower);
    float s = vLash.x * n + sin(vLash.x * 23.0) * 0.6;
    float id = floor(s);
    float rnd = fract(sin(id * 78.233 + vLash.z * 11.0) * 43758.5453);
    // solid lash line at the root, tapering strands beyond
    float rootBand = mix(0.3, 0.12, lower);
    float w = mix(0.46, 0.08, clamp((across - rootBand) / (1.0 - rootBand), 0.0, 1.0));
    float strand = abs(fract(s) - 0.5);
    float len = mix(0.92, 0.35, lower) * (0.7 + 0.3 * rnd);
    // outer-corner flick: longer lashes toward the outer end
    len *= mix(0.85, 1.1, smoothstep(-0.2, 0.6, -vLash.x));
    if (across > rootBand && (strand > w || across > len)) discard;
    if (lower > 0.5 && across > 0.3) discard;
  }`);
    };
    lash.customProgramCacheKey = () => 'human-lash';
  }
  return lash;
}
let teeth: THREE.MeshStandardMaterial | null = null;
export function teethMaterial(): THREE.MeshStandardMaterial {
  if (!teeth) teeth = new THREE.MeshStandardMaterial({ color: '#e9e3d6', roughness: 0.35 });
  return teeth;
}
let tongue: THREE.MeshStandardMaterial | null = null;
export function tongueMaterial(): THREE.MeshStandardMaterial {
  if (!tongue) tongue = new THREE.MeshStandardMaterial({ color: '#a8544e', roughness: 0.45 });
  return tongue;
}
