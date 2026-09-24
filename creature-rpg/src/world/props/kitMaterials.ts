// Shared materials for instanced kit props (one set per zone; disposed with it).
import * as THREE from 'three';
import type { SurfaceLib } from '../surfaces/bake';
import { makeSurfaceMaterial, WIND_VERT } from '../surfaces/material';
import { windUniforms } from './wind';
import { makeLeafAtlas } from '../vegetation/leafAtlas';
import type { MatKey } from './kit';

export type KitMaterials = Record<MatKey, THREE.Material> & { dispose(): void };

const WIND_HEAD = 'attribute float sway; uniform float uTime; uniform float uWind;';
// two-sided cards/blades keep their authored (outward, volume-like) normals on both faces
const KEEP_NORMAL = '#include <normal_fragment_begin>\n normal = normalize(vNormal);';

function windify(m: THREE.MeshStandardMaterial, key: string, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WIND_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERT}`);
    extra?.(sh);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function makeKitMaterials(lib: SurfaceLib, cheap: boolean): KitMaterials {
  const surface = makeSurfaceMaterial({ lib, kind: 'object', wind: true, cheap });
  const atlas = makeLeafAtlas();
  const leaf = windify(
    new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.72, metalness: 0 }),
    'kit-leaf',
    (sh) => {
      // leaf flutter on top of the branch sway
      sh.vertexShader = sh.vertexShader.replace(
        `#include <begin_vertex>\n${WIND_VERT}`,
        `#include <begin_vertex>\n${WIND_VERT}\n  transformed += vec3(sin(uTime * 5.3 + position.x * 3.1 + position.y * 2.3), sin(uTime * 4.1 + position.z * 2.7) * 0.6, cos(uTime * 4.7 + position.y * 3.3)) * 0.022 * sway * uWind;`,
      );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <alphatest_fragment>',
          // keep canopies full at distance: alpha coverage shrinks with mip level, so boost it by the LOD
          `{
            vec2 tsz = vec2(textureSize(map, 0));
            vec2 dx = dFdx(vMapUv * tsz), dy = dFdy(vMapUv * tsz);
            float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-6));
            diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.28;
          }
          #include <alphatest_fragment>`,
        )
        .replace('#include <normal_fragment_begin>', KEEP_NORMAL)
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
            // thin-leaf translucency: sun shining through when looking toward it
            float tl = pow(clamp(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0, 1.0), 4.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * (0.12 + tl * 0.55);
          #endif`,
        );
    },
  );
  const plain = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }), 'kit-plain', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', KEEP_NORMAL);
  });
  const crystal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.1, flatShading: true });
  crystal.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.35;');
  };
  crystal.customProgramCacheKey = () => 'kit-crystal';
  return {
    surface,
    leaf,
    plain,
    crystal,
    dispose() {
      surface.dispose();
      leaf.dispose();
      plain.dispose();
      crystal.dispose();
      atlas.dispose();
    },
  };
}
