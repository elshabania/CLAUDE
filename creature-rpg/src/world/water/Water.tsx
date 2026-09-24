// Stylised water: subdivided plane per basin with per-vertex depth (baked from the heightfield) driving
// colour, transparency and shoreline foam, plus animated normal ripples in the fragment shader.
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { sampleGrid, type HeightGrid } from '../terrain/heightfield';

const uniforms = { uTime: { value: 0 } };

export function Water({ zone, grid, simple }: { zone: ZoneSpec; grid: HeightGrid; simple: boolean }) {
  const meshes = useMemo(() => {
    return (zone.terrain.water ?? []).map((w) => {
      const rz = w.rz ?? w.r;
      const seg = simple ? 32 : 64;
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
      const deep = new THREE.Color(zone.biome === 'volcano' ? '#8A2E0E' : zone.biome === 'fen' ? '#3E4A2A' : '#1F5F86');
      const shallow = new THREE.Color(zone.biome === 'volcano' ? '#F2A541' : zone.biome === 'fen' ? '#6E7A45' : '#5FB7C9');
      const lava = zone.biome === 'volcano';
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 0.12, metalness: 0.1, depthWrite: false, emissive: lava ? new THREE.Color('#E4572E') : new THREE.Color('#000000'), emissiveIntensity: lava ? 0.9 : 0 });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uniforms.uTime;
        sh.uniforms.uDeep = { value: deep };
        sh.uniforms.uShallow = { value: shallow };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec2 vWorldXZ;\nuniform float uTime;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvec4 wp = modelMatrix * vec4(position,1.0);\nvWorldXZ = wp.xz;\ntransformed.y += sin(wp.x*0.6+uTime*1.3)*0.04 + cos(wp.z*0.5+uTime*1.1)*0.04;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vDepth;\nvarying vec2 vWorldXZ;\nuniform float uTime;\nuniform vec3 uDeep;\nuniform vec3 uShallow;')
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            {
              vec2 p = vWorldXZ;
              float nx = sin(p.x*1.7 + uTime*1.9) * 0.5 + sin(p.x*3.1 - p.y*2.3 + uTime*2.7) * 0.25 + sin((p.x+p.y)*5.3 + uTime*3.3)*0.12;
              float nz = cos(p.y*1.9 - uTime*1.6) * 0.5 + cos(p.y*2.9 + p.x*2.1 - uTime*2.2) * 0.25 + cos((p.x-p.y)*4.7 - uTime*3.1)*0.12;
              vec3 pert = normalize(vec3(nx*0.18, 1.0, nz*0.18));
              normal = normalize((viewMatrix * vec4(pert, 0.0)).xyz);
            }`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            {
              float d = clamp(vDepth / 2.5, 0.0, 1.0);
              vec3 wc = mix(uShallow, uDeep, d);
              float foam = smoothstep(0.35, 0.0, vDepth) * (0.6 + 0.4*sin(vWorldXZ.x*3.0+vWorldXZ.y*2.0+uTime*2.0));
              diffuseColor.rgb = mix(wc, vec3(0.95,0.98,1.0), clamp(foam,0.0,1.0));
              diffuseColor.a = mix(0.55, 0.92, d) + foam*0.3;
              if (vDepth < -0.05) discard;
            }`,
          );
      };
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(w.at[0], w.level, w.at[1]);
      mesh.renderOrder = 2;
      return mesh;
    });
  }, [zone, grid, simple]);
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
