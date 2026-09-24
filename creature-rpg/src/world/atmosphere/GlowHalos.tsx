// Soft additive halos on lamps / glowing props, brightening as night falls (one draw call per zone).
// On High the halo core is pushed above 1.0 so the bloom pass picks it up.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { atmo } from './state';
import { pxScale } from './points';

const vert = /* glsl */ `
  uniform float uSize; uniform float uPx; uniform float uTime;
  attribute vec3 color;
  varying vec3 vColor; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.5);
    float flick = 0.94 + 0.06 * sin(uTime * 3.1 + position.x * 1.7 + position.z);
    gl_PointSize = clamp(uSize * flick * uPx / dist, 2.0, 160.0);
    vColor = color;
    vA = 1.0 - smoothstep(45.0, 110.0, dist);
  }
`;
const frag = /* glsl */ `
  uniform float uOpacity; uniform float uBoost;
  varying vec3 vColor; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.2) * 0.55 + smoothstep(0.22, 0.0, d) * 0.6;
    a *= uOpacity * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * (1.0 + uBoost * smoothstep(0.3, 0.0, d)), a);
    #include <colorspace_fragment>
  }
`;

export function GlowHalos({ points, hdr }: { points: { pos: [number, number, number]; color: string }[]; hdr: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { size, viewport, camera } = useThree();
  const built = useMemo(() => {
    if (!points.length) return null;
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    const c = new THREE.Color();
    points.forEach((p, i) => {
      pos.set(p.pos, i * 3);
      c.set(p.color);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: 2.2 }, uPx: { value: 500 }, uTime: { value: 0 }, uOpacity: { value: 0 }, uBoost: { value: hdr ? 5.0 : 0.25 } },
    });
    return { geo, mat };
  }, [points, hdr]);
  useEffect(() => () => {
    built?.geo.dispose();
    built?.mat.dispose();
  }, [built]);
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p || !built) return;
    const op = atmo.glow;
    p.visible = op > 0.02;
    if (!p.visible) return;
    const u = built.mat.uniforms;
    u.uOpacity.value = op;
    u.uTime.value += Math.min(dt, 0.1);
    u.uPx.value = pxScale(size.height, viewport.dpr, (camera as THREE.PerspectiveCamera).fov ?? 55);
  });
  if (!built) return null;
  return <points ref={ref} geometry={built.geo} material={built.mat} renderOrder={3} />;
}
