import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SPECIES_VISUALS as KIN } from '../creatures/registry';
const SPECIES_VISUALS = KIN;
import { assemble } from '../creatures/assemble';
import { Animator, type ActionName } from '../creatures/anim';
import { ZoneTool } from './ZoneTool';
import { HumanTool } from './HumanTool';

const params = new URLSearchParams(location.search);

function Creature({ id, action, speed, silhouette, x = 0 }: { id: string; action?: ActionName | null; speed: number; silhouette?: boolean; x?: number }) {
  const model = useMemo(() => {
    const m = assemble(SPECIES_VISUALS[id], { lod: 0, quality: 'high' });
    if (silhouette) m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: '#000000' }); });
    return m;
  }, [id, silhouette]);
  const anim = useMemo(() => new Animator(model), [model]);
  const last = useRef<string | null>(null);
  useFrame((_, dt) => {
    if (action && last.current !== action) { anim.play(action); }
    last.current = action ?? null;
    anim.setSpeed(speed);
    anim.update(silhouette ? 0 : dt);
  });
  return <primitive object={model.root} position={[x, 0, 0]} />;
}

function Viewer() {
  const ids = Object.keys(SPECIES_VISUALS);
  const [id, setId] = useState(params.get('id') ?? ids[0]);
  const [action, setAction] = useState<ActionName | null>(null);
  const [speed, setSpeed] = useState(0);
  const H = SPECIES_VISUALS[id]?.H ?? 1;
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ position: [H * 2.2, H * 1.2, H * 2.6], fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#9fb7c9']} />
        <hemisphereLight args={['#dbe8ff', '#5a4a3a', 0.8]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[H * 4, 48]} /><meshStandardMaterial color="#7d9a64" /></mesh>
        <Creature id={id} action={action} speed={speed} />
        <OrbitControls target={[0, H * 0.5, 0]} />
      </Canvas>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: '60vw' }}>
        {ids.map((i) => <button key={i} onClick={() => setId(i)} style={{ fontWeight: i === id ? 700 : 400 }}>{i}</button>)}
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
        {(['attack', 'special', 'hit', 'capture', 'faint', 'victory'] as ActionName[]).map((a) => <button key={a} onClick={() => { setAction(null); setTimeout(() => setAction(a), 20); }}>{a}</button>)}
        <button onClick={() => setSpeed(speed ? 0 : 2.5)}>{speed ? 'idle' : 'move'}</button>
      </div>
    </div>
  );
}

function Sheet({ silhouette }: { silhouette: boolean }) {
  const ids = (params.get('ids')?.split(',') ?? Object.keys(SPECIES_VISUALS)).filter((i) => SPECIES_VISUALS[i]);
  const cols = Number(params.get('cols') ?? 6);
  const size = Number(params.get('cell') ?? 160);
  const rows = Math.ceil(ids.length / cols);
  const yaw = Number(params.get('yaw') ?? 35);
  return (
    <div style={{ position: 'fixed', left: 0, top: 0, width: cols * size, height: rows * size, background: silhouette ? '#fff' : '#9fb7c9' }} id="sheet">
      <Canvas orthographic frameloop="demand" gl={{ preserveDrawingBuffer: true, antialias: !silhouette }} camera={{ position: [0, 0, 1000], zoom: 1, near: 1, far: 4000 }} style={{ width: cols * size, height: rows * size }}>
        <color attach="background" args={[silhouette ? '#ffffff' : '#9fb7c9']} />
        <hemisphereLight args={['#dbe8ff', '#5a4a3a', 1]} />
        <directionalLight position={[3, 5, 8]} intensity={2} />
        {ids.map((id, i) => (
          <FitCreature key={id} id={id} silhouette={silhouette} cx={((i % cols) + 0.5) * size - (cols * size) / 2} cy={(rows * size) / 2 - (Math.floor(i / cols) + 0.5) * size} size={size} yaw={yaw} />
        ))}
      </Canvas>
      {!silhouette && ids.map((id, i) => <span key={id} style={{ position: 'absolute', left: (i % cols) * size + 3, top: Math.floor(i / cols) * size + 2, fontSize: 11, color: '#fff', textShadow: '0 1px 2px #000' }}>{id}</span>)}
    </div>
  );
}

function FitCreature({ id, silhouette, cx, cy, size, yaw }: { id: string; silhouette: boolean; cx: number; cy: number; size: number; yaw: number }) {
  const model = useMemo(() => {
    const m = assemble(SPECIES_VISUALS[id], { lod: 0, quality: 'high' });
    if (silhouette) m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: '#000000' }); });
    new Animator(m).update(0.001);
    m.root.rotation.y = (yaw * Math.PI) / 180;
    m.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.root);
    const sz = box.getSize(new THREE.Vector3());
    const s = (size * 0.86) / Math.max(sz.x, sz.y);
    const c = box.getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    g.add(m.root);
    g.scale.setScalar(s);
    g.position.set(cx - c.x * s, cy - c.y * s, 0);
    return g;
  }, [id, silhouette, cx, cy, size, yaw]);
  return <primitive object={model} />;
}

export default function Tools() {
  const tool = params.get('tool');
  if (tool === 'zone') return <ZoneTool />;
  if (tool === 'humans') return <HumanTool />;
  if (tool === 'sheet') return <Sheet silhouette={false} />;
  if (tool === 'silhouettes') return <Sheet silhouette />;
  return <Viewer />;
}
