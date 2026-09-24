// Dense GPU grass: instanced 3-blade tufts that live in a wrap-around square around the camera, so they
// stay fixed in the world while the player moves and never need CPU updates. Placement density, tint,
// height and dryness come from a mask baked once from the terrain splat (no grass on paths, plazas,
// cliffs, shores, snow, building footprints). Two patches: a dense near ring and a sparse, wider-bladed
// far ring whose inner hole cross-fades with the near ring. Wind = travelling gust bands + per-blade
// flutter; blades are back-lit (translucency) when looking toward the sun. Shaded by MeshStandardMaterial
// (shadows, IBL, fog stay standard). One draw call per patch; receive-only shadows.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import type { HeightGrid } from '../terrain/heightfield';
import { fbm } from '../terrain/heightfield';
import { getTerrainGeometry } from '../terrain/Terrain';
import { windUniforms } from '../props/wind';
import { naturalize } from '../surfaces';

interface BiomeGrass { density: number; height: number; dry: number }
function biomeGrass(zone: ZoneSpec): BiomeGrass {
  if (zone.indoor) return { density: 0, height: 1, dry: 0 };
  switch (zone.biome) {
    case 'meadow': return { density: 1, height: 1, dry: 0.25 };
    case 'town': return { density: 0.75, height: 0.7, dry: 0.15 };
    case 'forest': return { density: 0.6, height: 0.85, dry: 0.1 };
    case 'lake': return { density: 0.95, height: 1.05, dry: 0.15 };
    case 'ridge': return { density: 0.8, height: 0.8, dry: 0.45 };
    case 'cliff': return { density: 0.85, height: 0.85, dry: 0.3 };
    case 'fen': return { density: 0.85, height: 1.4, dry: 0.5 };
    case 'tundra': return { density: 0.4, height: 0.5, dry: 0.7 };
    default: return { density: 0, height: 1, dry: 0 };
  }
}

function buildMask(zone: ZoneSpec, grid: HeightGrid, bg: BiomeGrass) {
  const geo = getTerrainGeometry(zone, grid);
  const sp = geo.getAttribute('aSplat') as THREE.BufferAttribute;
  const sp2 = geo.getAttribute('aSplat2') as THREE.BufferAttribute;
  const { nx, nz, width, depth } = grid;
  const data = new Uint8Array(nx * nz * 4);
  const blockers = zone.props
    .map((p) => ({ at: p.at, r: (p.kind.startsWith('hall') || p.kind === 'spire' ? 10 : p.kind.startsWith('house') || p.kind === 'hearth' || p.kind === 'stilthouse' ? 6 : p.kind === 'windmill' ? 4 : p.kind === 'well' || p.kind === 'tent' || p.kind === 'stall' ? 2.5 : 0) * (p.s ?? 1) }))
    .filter((b) => b.r > 0);
  const water = zone.terrain.water ?? [];
  const seed = zone.terrain.seed;
  let any = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = -width / 2 + (ix * width) / (nx - 1);
      const z = -depth / 2 + (iz * depth) / (nz - 1);
      const path = sp.getY(i), cliff = sp.getZ(i), snow = sp.getW(i), plaza = sp2.getX(i), shore = sp2.getY(i);
      let d = bg.density * (1 - Math.min(1, path * 1.6)) * (1 - plaza) * (1 - cliff) * (1 - snow) * (1 - shore * 0.85);
      // clumps + clearings
      const clump = fbm(x / 9, z / 9, seed + 41, 3) * 0.5 + 0.5;
      d *= THREE.MathUtils.smoothstep(clump, 0.18, 0.55) * 0.75 + 0.25;
      for (const b of blockers) if (Math.hypot(x - b.at[0], z - b.at[1]) < b.r) d = 0;
      for (const w of water) if (Math.hypot((x - w.at[0]) / w.r, (z - w.at[1]) / (w.rz ?? w.r)) < 1.04) d = 0;
      const tone = fbm(x / 14, z / 14, seed + 43, 3) * 0.5 + 0.5;
      const tall = (0.55 + 0.6 * (fbm(x / 6, z / 6, seed + 45, 2) * 0.5 + 0.5)) * (1 - path * 0.6);
      const dry = Math.min(1, bg.dry * (0.4 + 1.2 * (fbm(x / 17, z / 17, seed + 47, 2) * 0.5 + 0.5)) + path * 0.3);
      data[i * 4] = Math.round(THREE.MathUtils.clamp(d, 0, 1) * 255);
      data[i * 4 + 1] = Math.round(tone * 255);
      data[i * 4 + 2] = Math.round(THREE.MathUtils.clamp(tall * bg.height * 0.5, 0, 1) * 255);
      data[i * 4 + 3] = Math.round(dry * 255);
      any += d;
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, any: any > 0 };
}

/** tuft of 3 blades × 4 segments; position = (side −1..1, t 0..1, blade index) */
function tuftGeometry(segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < 3; b++) {
    const base = pos.length / 3;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      pos.push(-1, t, b, 1, t, b);
    }
    pos.push(0, 1, b);
    for (let s = 0; s < segments - 1; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const a = base + (segments - 1) * 2;
    idx.push(a, a + 1, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // real normals are computed in the vertex shader; the attribute only keeps three from forcing flat shading
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */ `
attribute vec2 aOff;
attribute vec4 aRnd;
uniform vec2 uCenter; uniform float uR; uniform float uInner; uniform float uWidth; uniform float uHeightK;
uniform sampler2D uHeight; uniform sampler2D uMask; uniform vec4 uGrid;
uniform float uTime; uniform float uWind;
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uDry;
varying float vTip; varying vec3 vGCol;
float gH(vec2 p) {
  vec2 f = vec2((p.x + uGrid.x * 0.5) / uGrid.x * (uGrid.z - 1.0), (p.y + uGrid.y * 0.5) / uGrid.y * (uGrid.w - 1.0));
  ivec2 i = ivec2(clamp(floor(f), vec2(0.0), uGrid.zw - 2.0)); vec2 t = clamp(f - vec2(i), 0.0, 1.0);
  float h00 = texelFetch(uHeight, i, 0).r, h10 = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return (t.x + t.y <= 1.0) ? h00 + (h10 - h00) * t.x + (h01 - h00) * t.y : h11 + (h01 - h11) * (1.0 - t.x) + (h10 - h11) * (1.0 - t.y);
}
`;

const VERT_BODY = /* glsl */ `
  vec2 gw = uCenter - uR + mod(aOff - (uCenter - uR), 2.0 * uR);
  float gd = length(gw - uCenter);
  vec2 muv = vec2(((gw.x + uGrid.x * 0.5) / uGrid.x * (uGrid.z - 1.0) + 0.5) / uGrid.z, ((gw.y + uGrid.y * 0.5) / uGrid.y * (uGrid.w - 1.0) + 0.5) / uGrid.w);
  vec4 mk = texture2D(uMask, muv);
  float fade = 1.0 - smoothstep(uR * 0.72, uR * 0.98, gd);
  if (uInner > 0.0) fade *= smoothstep(uInner * 0.7, uInner * 0.95, gd);
  float alive = step(aRnd.x, mk.r) * fade;
  float bi = position.z;
  float ang = aRnd.z * 6.2831 + bi * 2.09;
  vec2 fwd = vec2(cos(ang), sin(ang));
  vec2 sid = vec2(-fwd.y, fwd.x);
  vec2 bp = gw + vec2(cos(ang * 1.7 + 1.0), sin(ang * 1.3 + 2.0)) * 0.06 * bi;
  float H = (0.35 + 0.65 * fract(aRnd.y + bi * 0.37)) * (0.25 + mk.b * 1.0) * uHeightK * alive;
  float t = position.y;
  vTip = t;
  float wave = sin(dot(gw, vec2(0.19, 0.11)) - uTime * 1.4) * 0.5 + 0.5;
  wave = wave * wave;
  vec2 wdir = normalize(vec2(1.0, 0.35));
  float bend = (0.15 + 0.55 * wave) * uWind + 0.08 * sin(uTime * 3.3 + aRnd.w * 40.0 + bi);
  float lean = 0.2 + 0.35 * fract(aRnd.w * 7.0 + bi * 0.21);
  vec2 disp = (fwd * lean + wdir * bend) * t * t * H;
  float y = t * H * (1.0 - 0.3 * min(1.0, bend) * t);
  float w = uWidth * (1.0 - pow(t, 1.4)) * (0.8 + 0.4 * fract(aRnd.w * 13.0));
  vec2 xz = bp + sid * position.x * w + disp;
  float gh = gH(bp);
  vec3 bladeN = normalize(vec3(fwd.x, 0.0, fwd.y) + vec3(sid.x, 0.0, sid.y) * position.x * 0.5);
  objectNormal = normalize(mix(bladeN, vec3(0.0, 1.0, 0.0), 0.55));
  vec3 gpos = vec3(xz.x, gh + y - 0.04, xz.y);
  float hue = fract(aRnd.w * 3.7 + bi * 0.29);
  vGCol = mix(uColA, uColB, clamp(mk.g * 1.2 - 0.1 + (hue - 0.5) * 0.35, 0.0, 1.0)) * (0.82 + 0.3 * hue);
  vGCol = mix(vGCol, uDry, clamp(mk.a * (0.5 + t) * step(0.45, hue + mk.a * 0.4), 0.0, 1.0));
`;

export function Grass({ zone, grid, count, radius, cheap }: { zone: ZoneSpec; grid: HeightGrid; count: number; radius: number; cheap: boolean }) {
  const camera = useThree((s) => s.camera);
  const bg = useMemo(() => biomeGrass(zone), [zone]);
  const built = useMemo(() => {
    if (bg.density <= 0 || count <= 0) return null;
    const mask = buildMask(zone, grid, bg);
    if (!mask.any) {
      mask.tex.dispose();
      return null;
    }
    const hTex = new THREE.DataTexture(grid.heights, grid.nx, grid.nz, THREE.RedFormat, THREE.FloatType);
    hTex.magFilter = hTex.minFilter = THREE.NearestFilter;
    hTex.needsUpdate = true;
    // blade albedo: the zone palette pulled toward a natural chlorophyll green (blades are brighter and
    // more saturated than the soil-mixed ground texture underneath)
    const green = new THREE.Color('#4a6a22');
    const colA = naturalize(zone.palette.ground, 1.0, 0.7).lerp(green, 0.45);
    const colB = naturalize(zone.palette.ground2, 1.0, 0.72).lerp(green, 0.3);
    const dry = new THREE.Color('#a89a62');
    const tuftsTotal = Math.round(count / 3);
    const nearR = cheap ? radius : Math.max(8, radius * 0.36);
    const patches = cheap ? [{ R: radius, inner: 0, n: tuftsTotal, width: 0.03 }] : [
      { R: nearR, inner: 0, n: Math.round(tuftsTotal * 0.6), width: 0.02 },
      { R: radius, inner: nearR, n: Math.round(tuftsTotal * 0.4), width: 0.05 },
    ];
    const base = tuftGeometry(cheap ? 3 : 4);
    const meshes = patches.map((pt, pi) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.getAttribute('position'));
      g.setAttribute('normal', base.getAttribute('normal'));
      const off = new Float32Array(pt.n * 2);
      const rnd = new Float32Array(pt.n * 4);
      let s = (zone.terrain.seed * 7919 + pi * 104729) >>> 0;
      const r = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
      for (let i = 0; i < pt.n; i++) {
        off[i * 2] = r() * pt.R * 2;
        off[i * 2 + 1] = r() * pt.R * 2;
        rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
      }
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
      g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
      g.instanceCount = pt.n;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const uniforms = {
        uCenter: { value: new THREE.Vector2() },
        uR: { value: pt.R },
        uInner: { value: pt.inner },
        uWidth: { value: pt.width },
        uHeightK: { value: 1 },
        uHeight: { value: hTex },
        uMask: { value: mask.tex },
        uGrid: { value: new THREE.Vector4(grid.width, grid.depth, grid.nx, grid.nz) },
        uTime: windUniforms.uTime,
        uWind: windUniforms.uWind,
        uColA: { value: colA },
        uColB: { value: colB },
        uDry: { value: dry },
      };
      const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
          .replace('#include <beginnormal_vertex>', `vec3 objectNormal;\n{\n${VERT_BODY}\n  vGPos = gpos;\n}`)
          .replace('#include <begin_vertex>', 'vec3 transformed = vGPos;');
        sh.vertexShader = sh.vertexShader.replace('void main() {', 'vec3 vGPos;\nvoid main() {');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vTip; varying vec3 vGCol;')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vGCol * mix(0.28, 1.0, smoothstep(0.0, 0.85, vTip));')
          .replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            #if NUM_DIR_LIGHTS > 0
              float bl = pow(clamp(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0, 1.0), 3.0);
              reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * bl * 0.45 * vTip;
            #endif`,
          );
      };
      m.customProgramCacheKey = () => 'gpu-grass';
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.receiveShadow = !cheap;
      mesh.castShadow = false;
      mesh.userData.uniforms = uniforms;
      return mesh;
    });
    base.dispose();
    return { meshes, mask: mask.tex, hTex };
  }, [zone, grid, bg, count, radius, cheap]);

  useEffect(
    () => () => {
      if (!built) return;
      for (const m of built.meshes) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      built.mask.dispose();
      built.hTex.dispose();
    },
    [built],
  );

  const fwd = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!built) return;
    camera.getWorldDirection(fwd);
    const l = Math.hypot(fwd.x, fwd.z) || 1;
    for (const m of built.meshes) {
      const u = m.userData.uniforms;
      const lead = Math.min(radius * 0.45, 10);
      u.uCenter.value.set(camera.position.x + (fwd.x / l) * lead, camera.position.z + (fwd.z / l) * lead);
    }
  });

  if (!built) return null;
  return (
    <group>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
