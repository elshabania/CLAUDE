// Ambient biome particles (rendering §5.5): fireflies at night in meadow/forest/fen, embers in volcanic
// zones, drifting dust motes in caves and halls, diamond-dust sparkle in snow/tundra.
// One Points draw call per zone (hidden entirely when its opacity is ~0, e.g. fireflies by day).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { atmo } from './state';
import { seedGeometry, pxScale, WRAP_GLSL } from './points';
import { useSettings } from '../../state/settingsStore';

type Kind = 'fireflies' | 'embers' | 'motes' | 'sparkle';

const SPEC: Record<Kind, { id: number; count: number; size: number; color: string; box: [number, number, number]; offY: number; additive: boolean }> = {
  fireflies: { id: 0, count: 150, size: 0.26, color: '#E6F57A', box: [40, 5, 40], offY: -2.2, additive: true },
  embers: { id: 1, count: 170, size: 0.13, color: '#FF8C3A', box: [44, 18, 44], offY: 2, additive: true },
  motes: { id: 2, count: 140, size: 0.075, color: '#D6E2FF', box: [30, 9, 30], offY: -0.5, additive: true },
  sparkle: { id: 3, count: 180, size: 0.09, color: '#F4FBFF', box: [30, 10, 30], offY: 0, additive: true },
};

export function motesKind(zone: ZoneSpec): Kind | null {
  const b = zone.biome;
  if (b === 'volcano') return 'embers';
  if (b === 'snow' || b === 'tundra') return 'sparkle';
  if (b === 'cave' || zone.indoor) return 'motes';
  if (b === 'meadow' || b === 'forest' || b === 'fen') return 'fireflies';
  return null;
}

const vert = /* glsl */ `
  uniform float uTime; uniform vec3 uBox; uniform vec3 uBoxOffset; uniform float uSize; uniform float uPx; uniform float uKind;
  attribute float aRand;
  varying float vA;
  void main() {
    vec3 p = position * uBox;
    float t = uTime;
    float r = aRand;
    float bright = 1.0;
    if (uKind < 0.5) {            // fireflies: lazy wander + slow pulse
      p += vec3(sin(t * 0.45 + r * 20.0) * 1.8, sin(t * 0.8 + r * 13.0) * 0.7, cos(t * 0.38 + r * 17.0) * 1.8);
      float pulse = 0.5 + 0.5 * sin(t * (1.2 + r) + r * 50.0);
      bright = 0.2 + 0.8 * pulse * pulse;
    } else if (uKind < 1.5) {     // embers: rise and flicker
      p.y += t * (0.6 + r * 1.1);
      p.x += sin(t * 1.3 + r * 30.0) * 0.6;
      p.z += t * 0.25;
      bright = 0.55 + 0.45 * sin(t * 9.0 + r * 70.0);
    } else if (uKind < 2.5) {     // dust motes: very slow drift
      p += vec3(sin(t * 0.13 + r * 9.0) * 1.2 + t * 0.05, sin(t * 0.2 + r * 5.0) * 0.5, cos(t * 0.11 + r * 7.0) * 1.2);
      bright = 0.6 + 0.4 * sin(t * 0.7 + r * 30.0);
    } else {                      // diamond dust: gentle fall, sharp twinkle
      p.y -= t * 0.25 * (0.5 + r);
      p.x += sin(t * 0.3 + r * 11.0) * 0.8;
      float tw = max(0.0, sin(t * (1.5 + r * 2.0) + r * 100.0));
      bright = 0.15 + pow(tw, 10.0) * 1.6;
    }
    ${WRAP_GLSL}
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.3);
    gl_PointSize = clamp(uSize * 4.0 * uPx / dist, 1.5, 40.0);
    vA = edgeFade * bright * smoothstep(0.3, 1.5, dist);
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // bright core (¼ of the sprite) + soft halo; sprite is 4× the particle size
    float a = smoothstep(0.5, 0.0, d) * 0.45 + smoothstep(0.14, 0.05, d);
    a *= vA * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export function AmbientMotes({ zone, particles }: { zone: ZoneSpec; particles: number }) {
  const kind = motesKind(zone);
  const ref = useRef<THREE.Points>(null);
  const { size, viewport, camera } = useThree();
  const reduced = useSettings((s) => s.reducedMotion);
  const built = useMemo(() => {
    if (!kind) return null;
    const sp = SPEC[kind];
    const n = Math.max(24, Math.round(sp.count * particles));
    const geo = seedGeometry(n, 31 + sp.id);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3(...sp.box) },
        uBoxOffset: { value: new THREE.Vector3(0, sp.offY, 0) },
        uSize: { value: sp.size },
        uPx: { value: 500 },
        uKind: { value: sp.id },
        uColor: { value: new THREE.Color(sp.color) },
        uOpacity: { value: 1 },
      },
    });
    return { geo, mat, sp };
  }, [kind, particles]);
  useEffect(() => () => {
    built?.geo.dispose();
    built?.mat.dispose();
  }, [built]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts || !built) return;
    const overcast = Math.min(1, atmo.rain * 0.8 + atmo.fog * 0.4 + atmo.snow * 0.4);
    let op = 1;
    if (kind === 'fireflies') op = THREE.MathUtils.smoothstep(atmo.night, 0.35, 0.9) * (1 - atmo.rain * 0.85);
    else if (kind === 'sparkle') op = (1 - atmo.night * 0.55) * (1 - overcast * 0.5);
    else if (kind === 'motes') op = 0.7;
    pts.visible = op > 0.02;
    if (!pts.visible) return;
    const u = built.mat.uniforms;
    u.uOpacity.value = op * (kind === 'fireflies' ? 1.4 : 1);
    u.uTime.value += Math.min(dt, 0.1) * (reduced ? 0.5 : 1);
    u.uPx.value = pxScale(size.height, viewport.dpr, (camera as THREE.PerspectiveCamera).fov ?? 55);
  });

  if (!built) return null;
  return <points ref={ref} geometry={built.geo} material={built.mat} frustumCulled={false} renderOrder={4} />;
}
