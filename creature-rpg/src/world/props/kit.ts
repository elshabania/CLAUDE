// Procedural environment kit (all original geometry; no external assets).
// Each kind is one merged BufferGeometry (instanced by ZoneProps). Geometry groups map to shared
// materials listed in `mats`: 'surface' (PBR texture-array bark/rock/wood), 'leaf' (alpha-tested foliage
// atlas with translucency), 'plain' (vertex-coloured blades/stems), 'crystal' (glossy, faintly emissive).
// Contract kept from v1: buildKind(kind, palette, lowPoly) → { geo, collider, cast, sway } per kind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { windUniforms } from './wind';
import { SURF } from '../surfaces/recipes';
import { LEAF } from '../vegetation/leafAtlas';
import { broadleaf, bush, conifer, deadtree, flowers, grassClump, kitAttrs, reeds, rockGeo, tube, willow, type FloraParts } from './flora';
import { naturalize } from '../surfaces';

export { windUniforms };

export type MatKey = 'surface' | 'leaf' | 'plain' | 'crystal';

export interface KindDef {
  geo: THREE.BufferGeometry;
  collider?: { r: number; h: number } | { box: [number, number, number] };
  cast: boolean;
  sway: boolean;
  /** material slot per geometry group (in group order) */
  mats: MatKey[];
}

function assemble(fp: FloraParts, extra: Partial<Record<MatKey, THREE.BufferGeometry[]>> = {}): { geo: THREE.BufferGeometry; mats: MatKey[] } {
  const buckets: [MatKey, THREE.BufferGeometry[]][] = [
    ['surface', [...fp.surf, ...(extra.surface ?? [])]],
    ['leaf', [...fp.leaf, ...(extra.leaf ?? [])]],
    ['plain', [...fp.plain, ...(extra.plain ?? [])]],
    ['crystal', extra.crystal ?? []],
  ];
  const merged: THREE.BufferGeometry[] = [];
  const mats: MatKey[] = [];
  for (const [k, list] of buckets) {
    if (!list.length) continue;
    merged.push(list.length === 1 ? list[0] : mergeGeometries(list, false)!);
    mats.push(k);
  }
  const geo = merged.length === 1 ? merged[0] : mergeGeometries(merged, true)!;
  if (merged.length === 1) {
    geo.clearGroups();
    geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, 0);
  }
  geo.computeBoundingSphere();
  return { geo, mats };
}

const none = (): FloraParts => ({ surf: [], leaf: [], plain: [] });
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));

export function buildKind(kind: string, palette: { accent: string; ground: string; ground2: string }, lowPoly: boolean): KindDef {
  const d = lowPoly ? 2 : 3;
  const moss = naturalize(palette.ground, 0.7, 0.75).getStyle();
  switch (kind) {
    case 'tree': {
      const a = assemble(broadleaf({ seed: 101, trunkH: 2.7, trunkR: 0.2, crown: [2.1, 1.65, 2.1], branches: 5, clusters: lowPoly ? 14 : 30, clusterSize: 1.35, cell: LEAF.broad, bark: '#8a7c6c', leaf: '#e4ead6', lowPoly }));
      return { ...a, collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'blossom': {
      const a = assemble(broadleaf({ seed: 202, trunkH: 1.9, trunkR: 0.16, crown: [1.9, 1.25, 1.9], branches: 5, clusters: lowPoly ? 12 : 26, clusterSize: 1.2, cell: LEAF.blossom, bark: '#7a6860', leaf: '#ffffff', lean: 0.3, lowPoly }));
      return { ...a, collider: { r: 0.28, h: 3 }, cast: true, sway: true };
    }
    case 'pine': {
      const a = assemble(conifer(404, 7.6, 1.9, false, lowPoly));
      return { ...a, collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'snowpine': {
      const a = assemble(conifer(505, 7.2, 1.8, true, lowPoly));
      return { ...a, collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'hollowtree': {
      // Murmurwood giant: wide flared trunk with root arches, layered canopy and glowing knots
      const fp = broadleaf({ seed: 303, trunkH: 8.5, trunkR: 1.15, crown: [5.4, 2.8, 5.4], branches: 7, clusters: lowPoly ? 22 : 54, clusterSize: 3.1, cell: LEAF.broad, bark: '#8a7a68', leaf: '#cfdcc4', flare: 0.9, lowPoly });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.3;
        const pts = [new THREE.Vector3(Math.cos(a) * 0.7, 1.6, Math.sin(a) * 0.7), new THREE.Vector3(Math.cos(a) * 1.8, 0.9, Math.sin(a) * 1.8), new THREE.Vector3(Math.cos(a) * 2.6, -0.1, Math.sin(a) * 2.6)];
        fp.surf.push(tube(pts, [0.55, 0.4, 0.22], lowPoly ? 5 : 7, '#7a6a58', 12));
      }
      const knots = [0, 1, 2].map((i) => kitAttrs(at(new THREE.SphereGeometry(0.22, 8, 6), Math.cos(i * 2.1) * 1.05, 3 + i * 1.8, Math.sin(i * 2.1) * 1.05), { color: '#C9B458', rigid: true }));
      const a = assemble(fp, { crystal: knots });
      return { ...a, collider: { r: 1.3, h: 8 }, cast: true, sway: true };
    }
    case 'willow': {
      const a = assemble(willow(606, lowPoly));
      return { ...a, collider: { r: 0.35, h: 3 }, cast: true, sway: true };
    }
    case 'deadtree': {
      const a = assemble(deadtree(707, lowPoly));
      return { ...a, collider: { r: 0.25, h: 3 }, cast: true, sway: false };
    }
    case 'bush': {
      const a = assemble(bush(808, palette.accent, lowPoly));
      return { ...a, cast: true, sway: true };
    }
    case 'grass': {
      const a = assemble(grassClump(909, naturalize('#6E9B45', 0.85, 0.85).getStyle(), naturalize(palette.ground2, 0.85, 0.85).getStyle(), lowPoly));
      return { ...a, cast: false, sway: true };
    }
    case 'flowers': {
      const a = assemble(flowers(1010, palette.accent, lowPoly));
      return { ...a, cast: false, sway: true };
    }
    case 'reeds': {
      const a = assemble(reeds(1111, lowPoly));
      return { ...a, cast: false, sway: true };
    }
    case 'rock': {
      const a = assemble(none(), { surface: [rockGeo(41, 0.9, [1.2, 0.72, 1], d, 3, '#8f8a80', moss, 0.35)] });
      return { ...a, collider: { r: 0.9, h: 1.2 }, cast: true, sway: false };
    }
    case 'boulder': {
      const a = assemble(none(), { surface: [rockGeo(42, 1.8, [1.1, 0.8, 1], d, 4, '#8a857a', moss, 0.4)] });
      return { ...a, collider: { r: 1.8, h: 2.4 }, cast: true, sway: false };
    }
    case 'icerock': {
      const a = assemble(none(), { surface: [rockGeo(51, 1.0, [1, 0.85, 1], d, 4, '#c8e2ec', '#f4f8fb', 0.6, SURF.ice)] });
      return { ...a, collider: { r: 1, h: 1.2 }, cast: true, sway: false };
    }
    case 'crystal': {
      const parts = [0, 1, 2, 3].map((i) => kitAttrs(at(new THREE.ConeGeometry(0.25 - i * 0.03, 1.4 - i * 0.2, 6), Math.cos(i * 1.7) * 0.25, 0.6, Math.sin(i * 1.7) * 0.25, Math.cos(i) * 0.3, 0, Math.sin(i) * 0.3), { color: palette.accent, rigid: true, vary: 0.05, seed: i }));
      const base = rockGeo(61, 0.45, [1.2, 0.5, 1], 2, 2, '#5a5a66', null, 0);
      const a = assemble(none(), { crystal: parts, surface: [base] });
      return { ...a, collider: { r: 0.5, h: 1.4 }, cast: false, sway: false };
    }
    case 'basalt': {
      const cols = [0, 1, 2, 3, 4].map((i) => {
        const h = 1 + (i % 3) * 0.8;
        const g = new THREE.CylinderGeometry(0.45, 0.5, h, 6, 1);
        return kitAttrs(at(g, Math.cos(i * 1.3) * 0.7, h / 2, Math.sin(i * 1.3) * 0.7, 0, i * 0.4, 0), { color: '#4a423e', surf: SURF.rock, uvMode: 0, rigid: true, vary: 0.08, seed: i });
      });
      const a = assemble(none(), { surface: cols });
      return { ...a, collider: { r: 1.1, h: 2 }, cast: true, sway: false };
    }
    case 'mushroom': {
      const stem = kitAttrs(new THREE.LatheGeometry([new THREE.Vector2(0.09, 0), new THREE.Vector2(0.07, 0.25), new THREE.Vector2(0.075, 0.48)], 8), { color: '#ede3cc', rigid: true });
      const capPts = [new THREE.Vector2(0.02, 0.44), new THREE.Vector2(0.26, 0.42), new THREE.Vector2(0.32, 0.46), new THREE.Vector2(0.28, 0.58), new THREE.Vector2(0.16, 0.68), new THREE.Vector2(0.0, 0.71)];
      const cap = kitAttrs(new THREE.LatheGeometry(capPts, 12), { color: palette.accent, rigid: true, vary: 0.05 });
      const a = assemble(none(), { plain: [stem, cap] });
      return { ...a, cast: false, sway: false };
    }
    case 'fence': {
      const wood = (g: THREE.BufferGeometry, c: string) => kitAttrs(g, { color: c, surf: SURF.wood, uvMode: 0, rigid: true, vary: 0.05 });
      const posts = [-1, 0, 1].map((i) => wood(at(new THREE.BoxGeometry(0.12, 0.95, 0.12), i, 0.47, 0, 0, i * 0.3, (i - 0.3) * 0.03), '#8a6c4c'));
      const rails = [0.35, 0.72].map((y, k) => wood(at(new THREE.BoxGeometry(2.1, 0.08, 0.05), 0, y, 0.07, 0, 0, (k - 0.5) * 0.03), '#9a7a58'));
      const a = assemble(none(), { surface: [...posts, ...rails] });
      return { ...a, collider: { box: [2.1, 1, 0.2] }, cast: true, sway: false };
    }
    default: {
      const a = assemble(none(), { plain: [kitAttrs(new THREE.BoxGeometry(1, 1, 1), { color: '#ff00ff', rigid: true })] });
      return { ...a, cast: true, sway: false };
    }
  }
}

/** Adds wind sway to a standard material via vertex displacement weighted by the `sway` attribute. */
export function windMaterial(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.37 + ip.z * 0.23;
        float w = sway * sway * uWind;
        transformed.x += sin(uTime * 1.7 + ph) * 0.12 * w;
        transformed.z += cos(uTime * 1.3 + ph * 1.3) * 0.08 * w;`,
      );
  };
  m.customProgramCacheKey = () => 'wind';
  return m;
}
