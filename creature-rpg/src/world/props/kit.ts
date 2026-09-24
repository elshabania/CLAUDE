// Procedural environment kit (all original geometry; no external assets).
// Each kind is one merged, vertex-coloured BufferGeometry so it can be instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function colorize(g: THREE.BufferGeometry, c: string | THREE.Color, vary = 0.06, seed = 1): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const base = new THREE.Color(c);
  const n = geo.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(geo.attributes.position as THREE.BufferAttribute, i);
    const r = Math.sin(p.x * 12.1 + p.y * 7.7 + p.z * 5.3 + seed) * 43758.5;
    const f = 1 + ((r - Math.floor(r)) * 2 - 1) * vary;
    cols[i * 3] = base.r * f;
    cols[i * 3 + 1] = base.g * f;
    cols[i * 3 + 2] = base.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  // store sway weight in uv.x (0 at ground → 1 at top) for the wind shader
  return geo;
}

function withSway(g: THREE.BufferGeometry, h: number, rigid = false): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const sway = new Float32Array(n);
  for (let i = 0; i < n; i++) sway[i] = rigid ? 0 : Math.max(0, g.attributes.position.getY(i) / h);
  g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'color', 'sway'].includes(k)) q.deleteAttribute(k);
    return q;
  });
  const m = mergeGeometries(clean, false)!;
  m.computeBoundingSphere();
  return m;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  g.applyMatrix4(m);
  return g;
};

export interface KindDef {
  geo: THREE.BufferGeometry;
  collider?: { r: number; h: number } | { box: [number, number, number] };
  cast: boolean;
  sway: boolean;
}

function lumpy(r: number, detail: number, amp: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed) * Math.sin(v.z * 3.7 + seed * 2);
    v.multiplyScalar(1 + k * amp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildKind(kind: string, palette: { accent: string; ground: string; ground2: string }, lowPoly: boolean): KindDef {
  const d = lowPoly ? 0 : 1;
  switch (kind) {
    case 'tree': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.16, 0.26, 3, 7), 0, 1.5, 0), '#6B4A33');
      const c1 = colorize(T(lumpy(1.5, d, 0.18, 1), 0, 3.6, 0, 0, 0, 0, [1, 0.85, 1]), '#4F7F3A', 0.12, 2);
      const c2 = colorize(T(lumpy(1.1, d, 0.18, 2), 0.7, 4.3, 0.3), '#5E9444', 0.12, 3);
      const c3 = colorize(T(lumpy(1.0, d, 0.18, 3), -0.6, 4.1, -0.4), '#477536', 0.12, 4);
      return { geo: withSway(merge([trunk, c1, c2, c3]), 5.5), collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'blossom': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 7), 0, 1.2, 0, 0, 0, 0.08), '#6B4A33');
      const c1 = colorize(T(lumpy(1.3, d, 0.2, 5), 0, 3.0, 0, 0, 0, 0, [1.1, 0.8, 1.1]), '#E9A6B8', 0.1, 5);
      const c2 = colorize(T(lumpy(0.9, d, 0.2, 6), 0.8, 3.4, 0.2), '#F2C4CF', 0.1, 6);
      return { geo: withSway(merge([trunk, c1, c2]), 4.5), collider: { r: 0.28, h: 3 }, cast: true, sway: true };
    }
    case 'pine': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.12, 0.22, 2, 6), 0, 1, 0), '#5A3E2B');
      const parts = [trunk];
      for (let i = 0; i < 4; i++) parts.push(colorize(T(new THREE.ConeGeometry(1.5 - i * 0.3, 1.6, 8), 0, 1.8 + i * 0.95, 0), i % 2 ? '#2F5E45' : '#28523C', 0.08, i));
      return { geo: withSway(merge(parts), 6), collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'snowpine': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.12, 0.22, 2, 6), 0, 1, 0), '#5A3E2B');
      const parts = [trunk];
      for (let i = 0; i < 4; i++) {
        parts.push(colorize(T(new THREE.ConeGeometry(1.5 - i * 0.3, 1.6, 8), 0, 1.8 + i * 0.95, 0), '#2F5048', 0.08, i));
        parts.push(colorize(T(new THREE.ConeGeometry(1.2 - i * 0.26, 0.5, 8), 0, 2.35 + i * 0.95, 0), '#F1F6F9', 0.03, i + 9));
      }
      return { geo: withSway(merge(parts), 6), collider: { r: 0.3, h: 3 }, cast: true, sway: true };
    }
    case 'hollowtree': {
      // Murmurwood giant: wide flared trunk with root arches and a layered canopy
      const trunk = colorize(T(new THREE.CylinderGeometry(0.9, 1.6, 9, 10), 0, 4.5, 0), '#5B4636', 0.08);
      const roots = [0, 1, 2, 3, 4].map((i) => colorize(T(new THREE.CapsuleGeometry(0.35, 2.2, 3, 6), Math.cos(i * 1.26) * 1.6, 0.4, Math.sin(i * 1.26) * 1.6, 0, -i * 1.26, Math.PI / 2.6), '#4E3B2D'));
      const canopy = [0, 1, 2, 3].map((i) => colorize(T(lumpy(3.2 - i * 0.3, d, 0.2, i + 11), Math.cos(i * 1.6) * 1.8, 9.5 + i * 0.7, Math.sin(i * 1.6) * 1.8, 0, 0, 0, [1, 0.6, 1]), i % 2 ? '#2F5E3A' : '#3E7045', 0.1, i));
      const knots = [0, 1, 2].map((i) => colorize(T(new THREE.SphereGeometry(0.22, 8, 6), Math.cos(i * 2.1) * 1.05, 3 + i * 1.8, Math.sin(i * 2.1) * 1.05), '#C9B458', 0.02));
      return { geo: withSway(merge([trunk, ...roots, ...canopy, ...knots]), 12), collider: { r: 1.3, h: 8 }, cast: true, sway: true };
    }
    case 'willow': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.2, 0.35, 2.6, 7), 0, 1.3, 0, 0, 0, 0.1), '#5E5238');
      const crown = colorize(T(lumpy(1.8, d, 0.15, 21), 0, 3.2, 0, 0, 0, 0, [1.2, 0.6, 1.2]), '#8E9A4E', 0.1);
      const fronds = [0, 1, 2, 3, 4, 5, 6].map((i) => colorize(T(new THREE.CylinderGeometry(0.45, 0.2, 2.2, 5), Math.cos(i * 0.9) * 1.6, 2.1, Math.sin(i * 0.9) * 1.6), '#9FAE58', 0.1, i));
      return { geo: withSway(merge([trunk, crown, ...fronds]), 4.5), collider: { r: 0.35, h: 3 }, cast: true, sway: true };
    }
    case 'deadtree': {
      const trunk = colorize(T(new THREE.CylinderGeometry(0.1, 0.25, 3.2, 6), 0, 1.6, 0), '#2F2723');
      const b1 = colorize(T(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 5), 0.5, 2.6, 0, 0, 0, -0.8), '#2F2723');
      const b2 = colorize(T(new THREE.CylinderGeometry(0.05, 0.09, 1.2, 5), -0.4, 2.2, 0.2, 0.3, 0, 0.9), '#2F2723');
      return { geo: withSway(merge([trunk, b1, b2]), 4, true), collider: { r: 0.25, h: 3 }, cast: true, sway: false };
    }
    case 'bush': {
      const b = colorize(T(lumpy(0.8, d, 0.2, 31), 0, 0.5, 0, 0, 0, 0, [1.2, 0.8, 1]), '#5D8C3E', 0.12);
      const f = colorize(T(lumpy(0.2, 0, 0.1, 32), 0.4, 0.95, 0.3), palette.accent, 0.05);
      return { geo: withSway(merge([b, f]), 1.2), cast: true, sway: true };
    }
    case 'grass': {
      const blades: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const g = new THREE.ConeGeometry(0.06, 0.55 + (i % 3) * 0.12, 3);
        blades.push(colorize(T(g, Math.cos(i * 1.3) * 0.12, 0.3, Math.sin(i * 1.3) * 0.12, Math.cos(i) * 0.25, 0, Math.sin(i) * 0.25), i % 2 ? palette.ground2 : '#6E9B45', 0.1, i));
      }
      return { geo: withSway(merge(blades), 0.7), cast: false, sway: true };
    }
    case 'flowers': {
      const parts: THREE.BufferGeometry[] = [];
      const cols = ['#F2E3A0', '#E9A6B8', '#FFFFFF', palette.accent];
      for (let i = 0; i < 4; i++) {
        parts.push(colorize(T(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 3), Math.cos(i * 1.6) * 0.18, 0.17, Math.sin(i * 1.6) * 0.18), '#5E8A3A'));
        parts.push(colorize(T(new THREE.SphereGeometry(0.07, 6, 4), Math.cos(i * 1.6) * 0.18, 0.37, Math.sin(i * 1.6) * 0.18), cols[i], 0.05, i));
      }
      return { geo: withSway(merge(parts), 0.45), cast: false, sway: true };
    }
    case 'reeds': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        parts.push(colorize(T(new THREE.CylinderGeometry(0.018, 0.03, 1.3, 4), Math.cos(i * 1.1) * 0.2, 0.65, Math.sin(i * 1.1) * 0.2, 0, 0, Math.cos(i) * 0.12), '#A89F5C', 0.1, i));
        if (i % 2 === 0) parts.push(colorize(T(new THREE.CapsuleGeometry(0.04, 0.18, 2, 5), Math.cos(i * 1.1) * 0.2, 1.3, Math.sin(i * 1.1) * 0.2), '#6B4A33'));
      }
      return { geo: withSway(merge(parts), 1.4), cast: false, sway: true };
    }
    case 'rock': {
      return { geo: withSway(colorize(T(lumpy(0.9, d + 1, 0.22, 41), 0, 0.35, 0, 0, 0, 0, [1.2, 0.75, 1]), '#8A8578', 0.1), 1, true), collider: { r: 0.9, h: 1.2 }, cast: true, sway: false };
    }
    case 'boulder': {
      return { geo: withSway(colorize(T(lumpy(1.8, d + 1, 0.2, 42), 0, 0.9, 0, 0, 0, 0, [1.1, 0.8, 1]), '#7B7669', 0.1), 1, true), collider: { r: 1.8, h: 2.4 }, cast: true, sway: false };
    }
    case 'crystal': {
      const parts = [0, 1, 2, 3].map((i) => colorize(T(new THREE.ConeGeometry(0.25 - i * 0.03, 1.4 - i * 0.2, 6), Math.cos(i * 1.7) * 0.25, 0.6, Math.sin(i * 1.7) * 0.25, Math.cos(i) * 0.3, 0, Math.sin(i) * 0.3), palette.accent, 0.05, i));
      return { geo: withSway(merge(parts), 1, true), collider: { r: 0.5, h: 1.4 }, cast: false, sway: false };
    }
    case 'basalt': {
      const parts = [0, 1, 2, 3, 4].map((i) => colorize(T(new THREE.CylinderGeometry(0.45, 0.5, 1 + (i % 3) * 0.8, 6), Math.cos(i * 1.3) * 0.7, 0.5 + (i % 3) * 0.4, Math.sin(i * 1.3) * 0.7), '#3A322E', 0.08, i));
      return { geo: withSway(merge(parts), 1, true), collider: { r: 1.1, h: 2 }, cast: true, sway: false };
    }
    case 'icerock': {
      return { geo: withSway(colorize(T(lumpy(1.0, d + 1, 0.25, 51), 0, 0.4, 0, 0, 0, 0, [1, 0.8, 1]), '#CFE7F0', 0.08), 1, true), collider: { r: 1, h: 1.2 }, cast: true, sway: false };
    }
    case 'mushroom': {
      const stem = colorize(T(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), 0, 0.25, 0), '#EDE3CC');
      const cap = colorize(T(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.48, 0), palette.accent, 0.05);
      return { geo: withSway(merge([stem, cap]), 1, true), cast: false, sway: false };
    }
    case 'fence': {
      const posts = [-1, 0, 1].map((i) => colorize(T(new THREE.BoxGeometry(0.1, 0.9, 0.1), i, 0.45, 0), '#8C6A44'));
      const rails = [0.35, 0.7].map((y) => colorize(T(new THREE.BoxGeometry(2.1, 0.07, 0.05), 0, y, 0), '#9C7A54'));
      return { geo: withSway(merge([...posts, ...rails]), 1, true), collider: { box: [2.1, 1, 0.2] }, cast: true, sway: false };
    }
    default:
      return { geo: withSway(colorize(new THREE.BoxGeometry(1, 1, 1), '#ff00ff'), 1, true), cast: true, sway: false };
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
