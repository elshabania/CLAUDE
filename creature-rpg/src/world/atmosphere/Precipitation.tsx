// Rain streaks / snow flakes: one Points draw call in a camera-following box (rendering §5.7).
// Counts scale with the quality particle multiplier; Mobile gets a light version. Density crossfades
// through the draw range when weather changes mid-zone.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { atmo } from './state';
import { seedGeometry, pxScale, WRAP_GLSL } from './points';
import type { QualityProfile } from '../../state/settingsStore';
import { useSettings } from '../../state/settingsStore';

const BASE = { rain: 6000, snow: 4500 };
const MOBILE_CAP = { rain: 900, snow: 700 };
const RAIN_COL = new THREE.Color('#D2DEEC');
const SNOW_COL = new THREE.Color('#FFFFFF');

const vert = /* glsl */ `
  uniform float uTime; uniform vec3 uBox; uniform vec3 uBoxOffset; uniform float uSpeed; uniform float uSize; uniform float uPx; uniform float uSnow;
  attribute float aRand;
  varying float vA;
  void main() {
    vec3 p = position * uBox * 3.0;
    float sp = uSpeed * (0.75 + 0.5 * aRand);
    p.y -= uTime * sp;
    if (uSnow > 0.5) {
      p.x += sin(uTime * 0.7 + aRand * 40.0) * 0.9 + uTime * 0.35;
      p.z += cos(uTime * 0.55 + aRand * 23.0) * 0.9;
    } else {
      p.x += uTime * sp * 0.12;
    }
    ${WRAP_GLSL}
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.3);
    gl_PointSize = clamp(uSize * (0.7 + 0.6 * aRand) * uPx / dist, 1.0, uSnow > 0.5 ? 24.0 : 56.0);
    vA = edgeFade * smoothstep(0.5, 2.0, dist);
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uSnow;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uSnow > 0.5) {
      a = smoothstep(0.5, 0.12, length(c));
    } else {
      float x = abs(c.x - c.y * 0.12);
      a = smoothstep(0.07, 0.0, x) * smoothstep(0.5, 0.05, abs(c.y));
    }
    a *= vA * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export function Precipitation({ quality, particles, kinds }: { quality: QualityProfile; particles: number; kinds: { rain: boolean; snow: boolean } }) {
  const ref = useRef<THREE.Points>(null);
  const { size, viewport, camera } = useThree();
  const reduced = useSettings((s) => s.reducedMotion);
  const max = useMemo(() => {
    const n = (k: 'rain' | 'snow') => (kinds[k] ? (quality === 'mobile' ? MOBILE_CAP[k] : Math.round(BASE[k] * particles)) : 0);
    return Math.max(n('rain'), n('snow'));
  }, [quality, particles, kinds]);
  const counts = useMemo(
    () => ({ rain: quality === 'mobile' ? MOBILE_CAP.rain : Math.round(BASE.rain * particles), snow: quality === 'mobile' ? MOBILE_CAP.snow : Math.round(BASE.snow * particles) }),
    [quality, particles],
  );
  const { geo, mat } = useMemo(() => {
    const geo = seedGeometry(max, 97);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3(30, 20, 30) },
        uBoxOffset: { value: new THREE.Vector3(0, 3, 0) },
        uSpeed: { value: 14 },
        uSize: { value: 0.9 },
        uPx: { value: 500 },
        uSnow: { value: 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0.5 },
      },
    });
    return { geo, mat };
  }, [max]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const snow = atmo.snow > atmo.rain;
    const amt = snow ? atmo.snow : atmo.rain;
    const n = Math.floor((snow ? counts.snow : counts.rain) * Math.min(1, amt * 1.1));
    pts.visible = n > 8;
    if (!pts.visible) return;
    geo.setDrawRange(0, Math.min(n, max));
    const u = mat.uniforms;
    u.uTime.value += Math.min(dt, 0.1) * (reduced ? 0.6 : 1);
    u.uSnow.value = snow ? 1 : 0;
    u.uSpeed.value = snow ? 1.6 : 15;
    u.uSize.value = snow ? 0.09 : 0.95;
    u.uBox.value.set(snow ? 26 : 30, snow ? 16 : 20, snow ? 26 : 30);
    u.uOpacity.value = snow ? 0.9 : 0.42 + atmo.night * 0.1;
    u.uPx.value = pxScale(size.height, viewport.dpr, (camera as THREE.PerspectiveCamera).fov ?? 55);
    // tint by the scene's ambient light so rain never glows white at night
    const amb = Math.min(1.25, Math.max(0.35, (atmo.ambient.r + atmo.ambient.g + atmo.ambient.b) / 3 + 0.25));
    u.uColor.value.copy(snow ? SNOW_COL : RAIN_COL).multiplyScalar(amb);
  });

  if (!max) return null;
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
