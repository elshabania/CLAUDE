// ?tool=humans — human cast lineup, close-up face turntable and pose/expression checks.
// params: view=lineup|face|body  ids=a,b,c (look ids; "player:B.S.H" for the player creator combo)
//         yaw=deg  expr=happy|…  action=victory|throw|…  at=seconds to simulate then freeze  speed=m/s
//         cols=n  talk=1  lod=0|1|2  bg=#hex
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { HumanModel } from '../creatures/human/HumanModel';
import type { HumanAction, Expression } from '../creatures/human/animator';
import { LOOKS, playerLook } from '../data/looks';
import type { HumanLook } from '../creatures/humans';

const params = new URLSearchParams(location.search);
(globalThis as any).__humanTiming = true;

function lookFor(id: string): HumanLook {
  if (id.startsWith('player')) {
    const [b, s, h] = (id.split(':')[1] ?? '0.0.0').split('.').map(Number);
    return playerLook(b || 0, s || 0, h || 0);
  }
  return LOOKS[id] ?? LOOKS.villagerA;
}

function Person({ id, x, yaw, primary }: { id: string; x: number; yaw: number; primary?: boolean }) {
  const { camera, invalidate } = useThree();
  const model = useMemo(() => new HumanModel(lookFor(id), { quality: 'high', lod: Number(params.get('lod') ?? 0) as 0 | 1 | 2 }), [id]);
  const at = params.get('at');
  const freezeAt = at ? Number(at) : null;
  useEffect(() => {
    model.root.position.x = x;
    model.root.rotation.y = (yaw * Math.PI) / 180;
    const e = params.get('expr') as Expression | null;
    if (e) model.setExpression(e);
    const a = params.get('action') as HumanAction | null;
    if (a) model.play(a);
    model.setSpeed(Number(params.get('speed') ?? 0));
    model.talking = params.get('talk') === '1';
    let alive = true;
    model.ready.then(() => {
      if (!alive) return;
      if (freezeAt != null) for (let t = 0; t < freezeAt; t += 1 / 60) model.update(1 / 60);
      const view = params.get('view');
      if (primary && (view === 'face' || view === 'bust' || view === 'hand' || view === 'hips')) {
        model.update(0.001);
        model.root.updateMatrixWorld(true);
        const h = new THREE.Vector3();
        model.root.getObjectByName(view === 'face' ? 'eye.L' : view === 'hand' ? 'hand.R' : view === 'hips' ? 'hips' : 'head')!.getWorldPosition(h);
        const eye = view === 'hand' || view === 'hips' ? h.clone() : h.clone().add(new THREE.Vector3(-h.x + model.root.position.x, view === 'face' ? -0.03 : -0.1, 0));
        const c = camera as THREE.PerspectiveCamera;
        const dist = view === 'face' ? 0.62 : view === 'hand' ? 0.45 : view === 'hips' ? 0.9 : 1.5;
        const ca = Number(params.get('cam') ?? 0) * Math.PI / 180;
        c.position.set(eye.x + Math.sin(ca) * dist, eye.y + 0.02, eye.z + Math.cos(ca) * dist);
        c.lookAt(eye);
        c.updateProjectionMatrix();
      }
      invalidate();
      setTimeout(invalidate, 300);
    });
    return () => { alive = false; model.dispose(); };
  }, [model, x, yaw, freezeAt]);
  useFrame((_, dt) => { if (freezeAt == null) model.update(Math.min(dt, 0.05)); });
  return <primitive object={model.root} />;
}

function Cam({ view, n }: { view: string; n: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    if (view === 'face') { c.position.set(0, 1.56, 0.62); c.fov = 22; c.lookAt(0, 1.535, 0); }
    else if (view === 'bust') { c.position.set(0, 1.4, 1.5); c.fov = 26; c.lookAt(0, 1.32, 0); }
    else if (view === 'row') { c.position.set(0, 1.42, n * 0.62 + 0.5); c.fov = 30; c.lookAt(0, 1.3, 0); }
    else if (view === 'body') { c.position.set(0, 1.0, 4.2); c.fov = 28; c.lookAt(0, 0.86, 0); }
    else { const w = Math.max(3, n * 0.85); c.position.set(0, 1.1, w * 1.55 + 1); c.fov = 30; c.lookAt(0, 0.85, 0); }
    c.updateProjectionMatrix();
  }, [camera, view, n]);
  return null;
}

export function HumanTool() {
  const view = params.get('view') ?? 'lineup';
  const ids = (params.get('ids') ?? ['player:0.0.3', ...Object.keys(LOOKS)].join(',')).split(',');
  const yaw = Number(params.get('yaw') ?? 0);
  const spacing = 0.85;
  const bg = params.get('bg') ?? '#8fa6b8';
  const orbit = params.get('orbit') === '1';
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows frameloop={params.get('at') ? 'demand' : 'always'} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={1} camera={{ position: [0, 1.2, 4], fov: 30 }}>
        <color attach="background" args={[bg]} />
        <Cam view={view} n={ids.length} />
        <hemisphereLight args={['#dfe9f5', '#6b5a48', 0.9]} />
        <directionalLight position={[2.5, 4, 3.5]} intensity={2.6} color="#fff4e6" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={3} shadow-camera-bottom={-1} shadow-bias={-0.0004} />
        <directionalLight position={[-3, 2.5, -3]} intensity={1.3} color="#bcd4ff" />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[30, 48]} />
          <meshStandardMaterial color="#7f8f70" roughness={0.95} />
        </mesh>
        {ids.map((id, i) => (
          <Person key={id + i} id={id} x={(i - (ids.length - 1) / 2) * spacing} yaw={yaw} primary={i === 0} />
        ))}
        {orbit && <OrbitControls target={[0, view === 'face' ? 1.53 : 0.9, 0]} />}
      </Canvas>
    </div>
  );
}
