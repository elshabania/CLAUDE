// Water: subdivided plane per basin with per-vertex depth (baked from the heightfield).
// PBR (MeshStandardMaterial, roughness ~0.05) so the sky comes from the image-based environment and the
// sun glint from the key light; opacity follows Fresnel (grazing angles reflect, looking down you see
// into the water), colour follows depth (Beer-Lambert style absorption), six directional wave trains
// give the normal, and an animated noise band draws foam along the shore.
// Volcano basins are lava instead: opaque cooling crust plates over emissive (HDR → bloom) molten flow.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { sampleGrid, type HeightGrid } from '../terrain/heightfield';

const uniforms = { uTime: { value: 0 } };

const NOISE = /* glsl */ `
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float wFbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * wNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

function waterMaterial(kind: 'water' | 'fen', simple: boolean) {
  const deep = new THREE.Color(kind === 'fen' ? '#1c2414' : '#0b2c38');
  const shallow = new THREE.Color(kind === 'fen' ? '#4a5230' : '#3d7f82');
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: kind === 'fen' ? 0.12 : 0.05, metalness: 0, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uDeep = { value: deep };
    sh.uniforms.uShallow = { value: shallow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec2 vWorldXZ;\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvec4 wp = modelMatrix * vec4(position,1.0);\nvWorldXZ = wp.xz;\ntransformed.y += (sin(wp.x*0.55+uTime*1.2)*0.03 + cos(wp.z*0.47+uTime*1.05)*0.03) * clamp(depth, 0.0, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vDepth;\nvarying vec2 vWorldXZ;\nuniform float uTime;\nuniform vec3 uDeep;\nuniform vec3 uShallow;\n${NOISE}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 p = vWorldXZ; float t = uTime;
          vec2 g = vec2(0.0);
          // directional wave trains (k, dir, speed, amp): analytic slope sum
          ${[[0.9, 0.2, 1.1, 0.05], [1.6, 1.3, 1.5, 0.03], [2.7, -0.6, 2.1, 0.018], [4.3, 2.4, 2.6, 0.011], [7.1, 0.9, 3.3, 0.006], [11.3, -1.9, 4.1, 0.004]]
            .slice(0, simple ? 3 : 6)
            .map(([k, a, s, amp]) => `{ vec2 d = vec2(cos(${a.toFixed(2)}), sin(${a.toFixed(2)})); float ph = dot(d, p) * ${k.toFixed(2)} - t * ${s.toFixed(2)}; g += d * cos(ph) * ${(k * amp).toFixed(4)}; }`)
            .join('\n')}
          ${simple ? '' : 'g += (vec2(wNoise(p * 3.1 + t * 0.4), wNoise(p * 3.1 - t * 0.37 + 9.0)) - 0.5) * 0.12;'}
          g *= clamp(vDepth * 2.0, 0.25, 1.0) * 0.45;
          vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wD = clamp(vDepth / 2.2, 0.0, 1.0);
        vec3 wc = mix(uShallow, uDeep, 1.0 - exp(-vDepth * 1.3));
        float foamN = ${simple ? '0.5' : 'wFbm(vWorldXZ * 1.7 + vec2(uTime * 0.12, -uTime * 0.09))'};
        float band = sin(vDepth * 26.0 - uTime * 1.6 + foamN * 6.0) * 0.5 + 0.5;
        float foam = smoothstep(0.18, 0.0, vDepth) * smoothstep(0.45, 0.8, foamN * 0.7 + band * 0.4) * 0.45;
        foam = max(foam, smoothstep(0.035, 0.0, vDepth) * 0.35);
        diffuseColor.rgb = mix(wc, vec3(0.92, 0.95, 0.96), clamp(foam, 0.0, 1.0));
        float wA = mix(0.3, 0.88, wD) + foam * 0.5;
        if (vDepth < -0.02) discard;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.6, clamp(foam, 0.0, 1.0));')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          diffuseColor.a = clamp(max(wA, 0.02 + 0.98 * fres), 0.0, 1.0) * smoothstep(-0.02, 0.05, vDepth);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `water:${kind}:${simple ? 1 : 0}`;
  return mat;
}

function lavaMaterial(simple: boolean) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvWorldXZ = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vDepth;\nvarying vec2 vWorldXZ;\nuniform float uTime;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 lp = vWorldXZ * 0.35;
        vec2 flow = vec2(uTime * 0.05, uTime * 0.03);
        vec2 warp = vec2(wFbm(lp + flow), wFbm(lp - flow + 5.2));
        float heat = wFbm(lp * 1.6 + warp * 1.4 - flow * 2.0);
        // crust plates: cool where the field is high, molten seams between
        float crust = smoothstep(0.42, 0.62, heat);
        float seam = 1.0 - crust;
        vec3 crustCol = mix(vec3(0.05, 0.035, 0.03), vec3(0.16, 0.1, 0.08), wNoise(lp * 7.0));
        diffuseColor.rgb = mix(vec3(0.6, 0.2, 0.05), crustCol, crust);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + heat * 9.0);
        vec3 hot = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.3), smoothstep(0.3, 0.05, heat));
        vec3 lavaGlow = hot * seam * seam * 4.0 * pulse * smoothstep(-0.05, 0.3, vDepth);
        if (vDepth < -0.02) discard;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = lavaGlow;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.35, 0.92, crust);');
  };
  mat.customProgramCacheKey = () => `lava:${simple ? 1 : 0}`;
  return mat;
}

export function Water({ zone, grid, simple }: { zone: ZoneSpec; grid: HeightGrid; simple: boolean }) {
  const meshes = useMemo(() => {
    const lava = zone.biome === 'volcano';
    const mat = lava ? lavaMaterial(simple) : waterMaterial(zone.biome === 'fen' ? 'fen' : 'water', simple);
    return (zone.terrain.water ?? []).map((w) => {
      const rz = w.rz ?? w.r;
      const seg = simple ? 32 : 72;
      const g = new THREE.PlaneGeometry(w.r * 2.8, rz * 2.8, seg, seg);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const depth = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + w.at[0];
        const z = pos.getZ(i) + w.at[1];
        depth[i] = w.level - sampleGrid(grid, x, z);
      }
      g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(w.at[0], w.level, w.at[1]);
      mesh.renderOrder = 2;
      mesh.receiveShadow = !lava;
      return mesh;
    });
  }, [zone, grid, simple]);
  useEffect(
    () => () => {
      const mats = new Set<THREE.Material>();
      for (const m of meshes) {
        m.geometry.dispose();
        mats.add(m.material as THREE.Material);
      }
      for (const m of mats) m.dispose();
    },
    [meshes],
  );
  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
