import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from './zoneTypes';
import { buildGrid, type HeightGrid } from './terrain/heightfield';
import { Terrain } from './terrain/Terrain';
import { Water } from './water/Water';
import { ZoneProps } from './props/ZoneProps';
import { windUniforms } from './props/kit';
import { runtime } from '../state/runtime';
import { useGame } from '../state/game';
import { QUALITY, useSettings } from '../state/settingsStore';
import { input } from '../ui/input/input';
import { rimUniforms } from '../creatures/materials';
import { safeRemoveBody } from './physicsSafe';
import { Atmosphere } from './atmosphere/Atmosphere';
import { Precipitation } from './atmosphere/Precipitation';
import { AmbientMotes } from './atmosphere/AmbientMotes';
import { PostBoundary } from './atmosphere/PostBoundary';
import { SurfaceScope } from './surfaces';
import { Grass } from './vegetation/Grass';

// post stack is lazy (High: full, Balanced: light, Mobile: none — never downloads postprocessing)
const PostFX = lazy(() => import('./atmosphere/PostFX'));

export function useZoneGrid(zone: ZoneSpec): HeightGrid {
  return useMemo(() => {
    const g = buildGrid(zone.terrain, zone.exits.map((e) => ({ at: e.at, r: e.r + 2 })), zone.terrain.size[0] > 180 ? 1.25 : 1);
    return g;
  }, [zone]);
}

/** Invisible cylinders keeping the trainer out of deep water. */
function WaterBlockers({ zone }: { zone: ZoneSpec }) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const w of zone.terrain.water ?? []) {
      if (w.depth < 0.8) continue;
      const rz = w.rz ?? w.r;
      const n = Math.max(1, Math.round(Math.max(w.r, rz) / Math.min(w.r, rz)));
      // approximate ellipses with a row of circles along the long axis
      const long = w.r >= rz ? 'x' : 'z';
      const short = Math.min(w.r, rz) * 0.86;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const off = t * (Math.max(w.r, rz) - short) * 0.95;
        const x = w.at[0] + (long === 'x' ? off : 0);
        const z = w.at[1] + (long === 'z' ? off : 0);
        world.createCollider(rapier.ColliderDesc.cylinder(6, short).setTranslation(x, w.level, z), body);
      }
    }
    return () => safeRemoveBody(world, body);
  }, [zone, world, rapier]);
  return null;
}

function FrameDriver() {
  const { gl } = useThree();
  const samples = useRef<number[]>([]);
  useFrame((_, dt) => {
    windUniforms.uTime.value += dt;
    const ms = dt * 1000;
    const arr = samples.current;
    arr.push(ms);
    if (arr.length > 240) arr.shift();
    if (arr.length % 20 === 0) {
      const sorted = [...arr].sort((a, b) => a - b);
      runtime.perf.frameMs = sorted[Math.floor(sorted.length / 2)];
      runtime.perf.p95 = sorted[Math.floor(sorted.length * 0.95)];
      runtime.perf.fps = 1000 / runtime.perf.frameMs;
      runtime.perf.drawCalls = gl.info.render.calls;
      runtime.perf.triangles = gl.info.render.triangles;
      runtime.perf.geometries = gl.info.memory.geometries;
      runtime.perf.textures = gl.info.memory.textures;
    }
  });
  return null;
}

export function WorldCanvas({ zone, children, onCreated }: { zone: ZoneSpec; children?: ReactNode; onCreated?: () => void }) {
  const quality = useSettings((s) => s.quality);
  const q = QUALITY[quality];
  const post = q.post !== 'none';
  const weather = useGame((s) => s.weather);
  const precip = useMemo(() => ({ rain: (zone.weather.rain ?? 0) > 0 || weather === 'rain', snow: (zone.weather.snow ?? 0) > 0 || weather === 'snow' }), [zone, weather]);
  const grid = useZoneGrid(zone);
  runtime.grid = grid;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) input.attach(ref.current);
  }, []);
  useEffect(() => {
    rimUniforms.uRimStrength.value = 0.3;
  }, []);
  return (
    <div ref={ref} style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows={q.shadows ? 'soft' : false}
        dpr={[1, Math.min(q.dpr, typeof window !== 'undefined' ? window.devicePixelRatio : 1)]}
        gl={{ antialias: q.antialias && !post, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('shots') }}
        camera={{ fov: 55, near: 0.1, far: q.drawDistance + 60 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          onCreated?.();
        }}
      >
        <FrameDriver />
        <SurfaceScope />
        <Atmosphere zone={zone} shadows={q.shadows} shadowSize={q.shadowSize} ibl={q.ibl} />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
            <Terrain zone={zone} grid={grid} />
            <WaterBlockers zone={zone} />
            <ZoneProps zone={zone} grid={grid} density={q.vegetation} lowPoly={quality === 'mobile'} shadows={q.shadows} hdr={post} />
            {children}
          </Physics>
          <Grass zone={zone} grid={grid} count={q.grass.count} radius={q.grass.radius} cheap={q.cheapSurfaces} />
          <Water zone={zone} grid={grid} simple={q.water === 'simple'} />
          {(precip.rain || precip.snow) && <Precipitation quality={quality} particles={q.particles} kinds={precip} />}
          <AmbientMotes zone={zone} particles={q.particles} />
        </Suspense>
        {post && (
          <PostBoundary>
            <Suspense fallback={null}>
              <PostFX mode={q.post === 'full' ? 'full' : 'light'} />
            </Suspense>
          </PostBoundary>
        )}
      </Canvas>
    </div>
  );
}
