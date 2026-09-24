// Image-based lighting from real (CC0 Poly Haven, via @pmndrs/assets) HDRIs, driven by the day/night curve.
// Two HDRIs are active at a time (night → dawn → biome day → sunset → night); a tiny shader mixes them
// into a 512×256 equirect, rotates each so its sun sits at the game's sun azimuth, normalises exposure,
// greys it under overcast weather and swaps the HDRI's own ground for the zone's ground colour
// (biome-matched bounce light), then PMREM-filters it into scene.environment. The re-bake only runs
// when that signature changes (sun moved ≥ ~3°, phase blend moved ≥ 2 %, weather changed): a few
// times per in-game hour, ~1–3 ms each on a GPU. Intensity follows the curve every frame for free.
// The HDRIs are lazy chunks (≈150–400 KB each, 2–3 per zone); until they arrive the old hemisphere
// light carries the fill, so nothing blocks the first frame.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import type { ZoneSpec } from '../zoneTypes';
import { naturalize } from '../surfaces';

export type HdriName = 'park' | 'forest' | 'dawn' | 'sunset' | 'night';
const SOURCES: Record<HdriName, () => Promise<{ default: string }>> = {
  park: () => import('@pmndrs/assets/hdri/park.exr'),
  forest: () => import('@pmndrs/assets/hdri/forest.exr'),
  dawn: () => import('@pmndrs/assets/hdri/dawn.exr'),
  sunset: () => import('@pmndrs/assets/hdri/sunset.exr'),
  night: () => import('@pmndrs/assets/hdri/night.exr'),
};

interface Hdri {
  tex: THREE.DataTexture;
  /** u (0..1) of the brightest sky pixel, or null when there is no clear sun (night) */
  sunU: number | null;
  /** 1 / mean sky luminance (sun clamped) → every HDRI lands at the same exposure */
  norm: number;
}

// parsed HDRIs are plain CPU data + a DataTexture; they survive zone changes (each canvas re-uploads)
const cache = new Map<HdriName, Promise<Hdri>>();
export function loadHdri(name: HdriName): Promise<Hdri> {
  let p = cache.get(name);
  if (!p) {
    p = SOURCES[name]()
      .then((m) => new EXRLoader().setDataType(THREE.HalfFloatType).loadAsync(m.default))
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.wrapS = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return analyse(tex as THREE.DataTexture);
      });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

function analyse(tex: THREE.DataTexture): Hdri {
  const { width: w, height: h, data } = tex.image as { width: number; height: number; data: Uint16Array };
  const ch = data.length / (w * h);
  const f = THREE.DataUtils.fromHalfFloat;
  let best = -1, bx = 0, sum = 0, n = 0;
  for (let y = Math.floor(h / 2); y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * ch;
      const l = 0.2126 * f(data[i]) + 0.7152 * f(data[i + 1]) + 0.0722 * f(data[i + 2]);
      if (l > best) { best = l; bx = x; }
      sum += Math.min(l, 8);
      n++;
    }
  }
  const mean = sum / Math.max(1, n);
  return { tex, sunU: best > mean * 6 ? (bx + 0.5) / w : null, norm: 1 / Math.max(1e-4, mean) };
}

// minute-of-day → which HDRI; neighbours blend
const PHASES: { t: number; k: 'night' | 'dawn' | 'day' | 'sunset' }[] = [
  { t: 0, k: 'night' }, { t: 290, k: 'night' }, { t: 370, k: 'dawn' }, { t: 470, k: 'day' },
  { t: 1030, k: 'day' }, { t: 1115, k: 'sunset' }, { t: 1195, k: 'night' }, { t: 1440, k: 'night' },
];
export function phaseAt(minutes: number, day: HdriName): { a: HdriName; b: HdriName; w: number } {
  const m = ((minutes % 1440) + 1440) % 1440;
  let i = 0;
  while (i < PHASES.length - 2 && PHASES[i + 1].t <= m) i++;
  const A = PHASES[i], B = PHASES[i + 1];
  const x = Math.min(1, Math.max(0, (m - A.t) / (B.t - A.t)));
  const map = (k: string): HdriName => (k === 'day' ? day : (k as HdriName));
  return { a: map(A.k), b: map(B.k), w: x * x * (3 - 2 * x) };
}

const BLEND_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tA; uniform sampler2D tB;
uniform float wB; uniform float offA; uniform float offB; uniform float nA; uniform float nB;
uniform vec3 uSkyTint; uniform vec3 uGround; uniform float uGroundMix; uniform float uDesat; uniform float uClamp;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(512.0, 256.0);
  vec3 a = min(texture2D(tA, vec2(fract(uv.x + offA), uv.y)).rgb * nA, vec3(uClamp));
  vec3 b = min(texture2D(tB, vec2(fract(uv.x + offB), uv.y)).rgb * nB, vec3(uClamp));
  vec3 c = mix(a, b, wB);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l) * vec3(0.96, 0.99, 1.04), uDesat);
  float sky = smoothstep(0.46, 0.54, uv.y);
  c *= mix(vec3(1.0), uSkyTint, sky);
  float gl = dot(uGround, vec3(0.2126, 0.7152, 0.0722));
  vec3 bounce = uGround / max(gl, 1e-3) * l * 0.85;
  c = mix(c, bounce, (1.0 - sky) * uGroundMix);
  gl_FragColor = vec4(c, 1.0);
}
`;

export interface EnvDrive {
  /** minutes */
  clock: number;
  /** direction to the sun (sky shader sun, may be below the horizon) */
  sunDir: THREE.Vector3;
  overcast: number;
  /** sky tint (multiplies the upper hemisphere) */
  skyTint: THREE.Color;
  /** scene.environmentIntensity */
  intensity: number;
}

/** Keeps scene.environment in sync with `drive` (mutated by the Atmosphere rig every frame). */
export function EnvironmentLighting({ zone, drive, interior }: { zone: ZoneSpec; drive: EnvDrive; interior: boolean }) {
  const { gl, scene } = useThree();
  const day: HdriName = zone.biome === 'forest' || zone.biome === 'fen' ? 'forest' : 'park';
  const [hdris, setHdris] = useState<Partial<Record<HdriName, Hdri>>>({});
  useEffect(() => {
    let alive = true;
    const names: HdriName[] = interior ? [day] : [day, 'dawn', 'sunset', 'night'];
    // the phase the zone opens in first, the rest right after
    const first = phaseAt(drive.clock, day);
    const order = [...new Set([first.a, first.b, ...names])].filter((n) => names.includes(n) || n === first.a || n === first.b);
    for (const n of order) {
      loadHdri(n)
        .then((h) => alive && setHdris((s) => ({ ...s, [n]: h })))
        .catch((e) => console.warn('hdri load failed', n, e));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, interior]);

  const res = useMemo(() => {
    const eq = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    eq.texture.mapping = THREE.EquirectangularReflectionMapping;
    eq.texture.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BLEND_FRAG,
      uniforms: {
        tA: { value: null }, tB: { value: null }, wB: { value: 0 }, offA: { value: 0 }, offB: { value: 0 }, nA: { value: 1 }, nB: { value: 1 },
        uSkyTint: { value: new THREE.Color(1, 1, 1) }, uGround: { value: naturalize(zone.palette.ground, 0.7, 0.9) }, uGroundMix: { value: interior ? 0.9 : 0.7 },
        uDesat: { value: 0 }, uClamp: { value: 12 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(geo, mat);
    quad.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pmrem = new THREE.PMREMGenerator(gl);
    return { eq, mat, geo, sc, cam, pmrem, env: null as THREE.WebGLRenderTarget | null };
  }, [gl, zone, interior]);

  useEffect(
    () => () => {
      if (res.env && scene.environment === res.env.texture) scene.environment = null;
      res.env?.dispose();
      res.eq.dispose();
      res.mat.dispose();
      res.geo.dispose();
      res.pmrem.dispose();
    },
    [res, scene],
  );

  const last = useRef({ sig: '', t: -1 });
  useFrame((state) => {
    scene.environmentIntensity = drive.intensity;
    const ph = interior ? { a: day, b: day, w: 0 } : phaseAt(drive.clock, day);
    const A = hdris[ph.a] ?? hdris[ph.b] ?? hdris[day];
    const B = hdris[ph.b] ?? A;
    if (!A || !B) return;
    // align each HDRI's sun with the game sun (equirectUv: u = atan(z, x) / 2π + 0.5)
    const sunU = Math.atan2(drive.sunDir.z, drive.sunDir.x) / (2 * Math.PI) + 0.5;
    const offA = A.sunU == null ? 0 : A.sunU - sunU;
    const offB = B.sunU == null ? 0 : B.sunU - sunU;
    const q = (v: number, s: number) => Math.round(v * s);
    const sig = [ph.a, ph.b, A === B ? 0 : q(ph.w, 50), q(offA, 110), q(offB, 110), q(drive.overcast, 25), drive.skyTint.getHexString()].join('|');
    const now = state.clock.elapsedTime;
    if (sig === last.current.sig || (res.env && now - last.current.t < 0.25)) return;
    last.current = { sig, t: now };
    const u = res.mat.uniforms;
    u.tA.value = A.tex;
    u.tB.value = B.tex;
    u.wB.value = A === B ? 0 : ph.w;
    u.offA.value = offA;
    u.offB.value = offB;
    u.nA.value = A.norm;
    u.nB.value = B.norm;
    u.uDesat.value = Math.min(0.85, drive.overcast * 0.9);
    u.uClamp.value = 14 - drive.overcast * 10;
    u.uSkyTint.value.copy(drive.skyTint);
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(res.eq);
    gl.render(res.sc, res.cam);
    gl.setRenderTarget(prev);
    res.env = res.pmrem.fromEquirectangular(res.eq.texture, res.env);
    scene.environment = res.env.texture;
  });
  return null;
}
