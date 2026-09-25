// Shared helpers for the GPU point systems (weather, ambient motes, lamp halos).
// Positions are seeds in [0,1]³ that the vertex shader animates and wraps into a box around the camera,
// so the CPU never touches a particle after creation: one draw call, zero per-frame uploads.
import * as THREE from 'three';

export function seedGeometry(count: number, seed = 1): THREE.BufferGeometry {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(count * 3);
  const r = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rnd();
    pos[i * 3 + 1] = rnd();
    pos[i * 3 + 2] = rnd();
    r[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/** Pixels per world metre at distance 1 for the current drawing buffer (for gl_PointSize attenuation). */
export function pxScale(heightPx: number, dpr: number, fovDeg: number): number {
  return (heightPx * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
}

/** GLSL: wrap a world position into a box of size uBox centred on (camera + uBoxOffset). Sets `rel` and `wp`. */
export const WRAP_GLSL = /* glsl */ `
  vec3 centre = cameraPosition + uBoxOffset;
  vec3 rel = mod(p - centre, uBox) - uBox * 0.5;
  vec3 wp = centre + rel;
  vec3 edge = abs(rel) / (uBox * 0.5);
  float edgeFade = 1.0 - smoothstep(0.72, 1.0, max(edge.x, max(edge.y, edge.z)));
`;
