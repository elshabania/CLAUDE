// Lighting rig + sky + fog driven by the day/night curve and the zone's weather (rendering §5.1–5.7).
// Fixed light count (one key directional + one hemisphere), so nothing recompiles as time passes.
// Everything is updated in useFrame from getState() — no React re-renders per tick.
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { runtime } from '../../state/runtime';
import { useGame } from '../../state/game';
import { windUniforms } from '../props/kit';
import { rimUniforms } from '../../creatures/materials';
import { createSample, sampleDayNight } from './dayNight';
import { atmo, currentClock } from './state';
import type { WeatherId } from '../../sim/types';

const NIGHT_FOG = new THREE.Color('#33416C');
const NIGHT_SKY_TOP = new THREE.Color('#121A36');
const NIGHT_SKY_HORIZON = new THREE.Color('#3A4A7C');
const OVERCAST = new THREE.Color('#9AA4B0');
const FOG_GREY = new THREE.Color('#B4BCC4');
const SUN_WARM = new THREE.Color('#FFD9A0');

/** Sky shader is one material shared by every drei <Sky/>: patch it once (night blend, stars, horizon fog). */
const skyUniforms = {
  uNight: { value: 0 },
  uStars: { value: 0 },
  uTime: { value: 0 },
  uNightTop: { value: NIGHT_SKY_TOP.clone() },
  uNightHorizon: { value: NIGHT_SKY_HORIZON.clone() },
  uHorizon: { value: new THREE.Color() },
  uHorizonMix: { value: 0.7 },
  uOvercast: { value: 0 },
  uOvercastColor: { value: OVERCAST.clone() },
  uSkyTint: { value: new THREE.Color(1, 1, 1) },
};
function patchSky(mat: THREE.ShaderMaterial) {
  if (mat.userData.atmoPatched) return;
  mat.userData.atmoPatched = true;
  Object.assign(mat.uniforms, skyUniforms);
  mat.fragmentShader = mat.fragmentShader
    .replace(
      'void main() {',
      `uniform float uNight; uniform float uStars; uniform float uTime; uniform vec3 uNightTop; uniform vec3 uNightHorizon;
      uniform vec3 uHorizon; uniform float uHorizonMix; uniform float uOvercast; uniform vec3 uOvercastColor; uniform vec3 uSkyTint;
      void main() {`,
    )
    .replace(
      /#include <colorspace_fragment>|#include <encodings_fragment>/,
      (inc) => `{
        vec3 dir = normalize(vWorldPosition - cameraPosition);
        float h = clamp(dir.y, -0.2, 1.0);
        vec3 nightSky = mix(uNightHorizon, uNightTop, smoothstep(0.0, 0.65, h));
        if (uStars > 0.0) {
          vec3 sd = dir * 150.0;
          vec3 cell = floor(sd);
          float hs = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float star = step(0.992, hs) * smoothstep(0.42, 0.05, length(fract(sd) - 0.5)) * smoothstep(0.03, 0.25, h);
          nightSky += vec3(0.85, 0.9, 1.0) * star * (0.55 + 0.45 * sin(uTime * 1.7 + hs * 90.0)) * uStars;
        }
        gl_FragColor.rgb *= mix(uSkyTint, vec3(1.0), smoothstep(0.1, 0.7, h) * 0.5);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, nightSky, uNight);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uOvercastColor, uOvercast);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon, (1.0 - smoothstep(-0.02, 0.3, h)) * uHorizonMix);
      }
      ${inc}`,
    );
  mat.needsUpdate = true;
}

const WEATHERS: WeatherId[] = ['rain', 'snow', 'fog', 'sunlight'];
function weatherTarget(w: WeatherId, k: WeatherId) {
  return w === k ? 1 : 0;
}

export interface AtmosphereProps {
  zone: ZoneSpec;
  shadows: boolean;
  shadowSize: number;
}

export function Atmosphere({ zone, shadows, shadowSize }: AtmosphereProps) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  const weather = useGame((s) => s.weather);
  const cave = zone.biome === 'cave';
  const interior = !!zone.indoor || cave;
  const hasSky = !interior;

  const c = useMemo(
    () => ({
      palFog: new THREE.Color(zone.palette.fog),
      palSky: new THREE.Color(zone.palette.sky),
      fog: new THREE.Color(),
      bg: new THREE.Color(),
      tmp: new THREE.Color(),
      sample: createSample(),
      skySun: new THREE.Vector3(0, 1, 0),
    }),
    [zone],
  );

  // fog + background objects live for the zone (remounted per entry)
  useEffect(() => {
    const fog = new THREE.FogExp2(zone.palette.fog, zone.fogDensity);
    const bg = new THREE.Color(zone.palette.sky);
    scene.fog = fog;
    scene.background = bg;
    return () => {
      if (scene.fog === fog) scene.fog = null;
      if (scene.background === bg) scene.background = null;
      rimUniforms.uRimStrength.value = 0.3;
      windUniforms.uWind.value = 1;
    };
  }, [zone, scene]);

  // weather starts at full strength on zone entry; later changes crossfade in useFrame
  useLayoutEffect(() => {
    atmo.rain = weatherTarget(weather, 'rain');
    atmo.snow = weatherTarget(weather, 'snow');
    atmo.fog = weatherTarget(weather, 'fog');
    atmo.sunlight = weatherTarget(weather, 'sunlight');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  useLayoutEffect(() => {
    const m = sky.current;
    if (!m) return;
    patchSky(m.material as THREE.ShaderMaterial);
    // the sky material is shared by every <Sky/> and stays; only this instance's box geometry is freed
    return () => m.geometry.dispose();
  }, [hasSky]);

  useFrame((_, dt) => {
    const s = sun.current, hm = hemi.current;
    if (!s || !hm) return;
    const d = Math.min(dt, 0.1);
    // ---- weather crossfade (~10 s mid-zone, rendering §5.7) ----
    const w = useGame.getState().weather;
    const k = 1 - Math.exp(-d / 3);
    for (const id of WEATHERS) {
      const key = id as 'rain' | 'snow' | 'fog' | 'sunlight';
      atmo[key] += (weatherTarget(w, id) - atmo[key]) * k;
    }
    const { rain, snow, fog: fogW, sunlight } = atmo;
    const overcast = Math.min(1, rain * 0.75 + fogW * 0.55 + snow * 0.45);

    // ---- light values ----
    const smp = c.sample;
    let sunI: number, hemiI: number, night: number;
    if (interior) {
      night = 0;
      if (cave) {
        s.color.set('#FFD3A2');
        hm.color.set('#9AAAD2');
        hm.groundColor.set('#403430');
        sunI = 1.15;
        hemiI = 1.05;
      } else {
        s.color.set('#FFE2B8');
        hm.color.set('#FFF0DC');
        hm.groundColor.set('#5E4A3A');
        sunI = 1.9;
        hemiI = 1.15;
      }
      smp.sunDir.set(0.35, 0.85, 0.4).normalize();
      c.fog.copy(c.palFog);
      c.bg.copy(c.palSky);
    } else {
      sampleDayNight(currentClock(), smp);
      night = smp.night;
      s.color.copy(smp.sunColor).lerp(SUN_WARM, sunlight * 0.5);
      hm.color.copy(smp.hemiSky).lerp(OVERCAST, overcast * 0.35);
      hm.groundColor.copy(smp.hemiGround);
      sunI = smp.sunI * (1 - overcast * 0.5) * (1 + sunlight * 0.3);
      hemiI = smp.hemiI * (1 + overcast * 0.1) * (1 + sunlight * 0.08);
      // fog: palette × time tint → greyed by weather → moonlit blue at night
      c.fog.copy(c.palFog).multiply(smp.tint).lerp(FOG_GREY, overcast * 0.45).lerp(NIGHT_FOG, night * 0.88);
      c.bg.copy(c.palSky).multiply(smp.tint).lerp(OVERCAST, overcast * 0.5).lerp(NIGHT_SKY_HORIZON, night * 0.9);
    }
    s.intensity = sunI;
    hm.intensity = hemiI;
    atmo.night = night;
    atmo.glow = interior ? 0.55 : Math.min(1, night * 1.2 + overcast * 0.25);
    atmo.ambient.copy(hm.color).multiplyScalar(hemiI * 0.55).add(c.tmp.copy(s.color).multiplyScalar(sunI * 0.18));

    // key light + shadow camera follow the player
    const p = runtime.playerPos;
    s.position.set(p.x + smp.sunDir.x * 60, p.y + smp.sunDir.y * 60, p.z + smp.sunDir.z * 60);
    s.target.position.copy(p);
    s.target.updateMatrixWorld();

    // fog + background
    const f = scene.fog as THREE.FogExp2 | null;
    if (f && 'density' in f) {
      f.color.copy(c.fog);
      f.density = zone.fogDensity * (1 + fogW * 1.8 + rain * 0.45 + snow * 0.5) * (1 + night * 0.15);
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(c.bg);

    // sky shader
    if (hasSky) {
      c.skySun.copy(smp.skySun);
      const skyNight = THREE.MathUtils.smoothstep(night, 0.1, 0.85);
      skyUniforms.uNight.value = skyNight;
      skyUniforms.uStars.value = Math.max(0, night - 0.5) * 2 * (1 - overcast);
      skyUniforms.uTime.value += d;
      skyUniforms.uHorizon.value.copy(c.fog);
      // dawn/dusk: saturate the tint for the sky dome (tint² keeps noon white)
      skyUniforms.uSkyTint.value.copy(smp.tint).multiply(smp.tint);
      skyUniforms.uHorizonMix.value = 0.55 + overcast * 0.3;
      skyUniforms.uOvercast.value = overcast * 0.7 * (1 - skyNight * 0.6);
      skyUniforms.uOvercastColor.value.copy(OVERCAST).lerp(NIGHT_SKY_HORIZON, night);
    }

    // creature rim (0.3 day → 0.45 night; battle keeps its own 0.5) and wind (rain/snow gusts)
    if (!runtime.battleStage) rimUniforms.uRimStrength.value = 0.3 + 0.15 * night;
    windUniforms.uWind.value = 1 + rain * 0.9 + snow * 0.35 + fogW * -0.3;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#DDE9FF', '#6B5A40', 1.1]} />
      <directionalLight
        ref={sun}
        intensity={2.4}
        color="#FFF4E0"
        castShadow={shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      {hasSky && <Sky ref={sky as never} distance={4000} sunPosition={c.skySun} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />}
    </>
  );
}
