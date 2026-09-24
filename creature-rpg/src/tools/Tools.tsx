import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SPECIES_VISUALS } from '../creatures/registry';
import { assemble } from '../creatures/assemble';
import { Animator, type ActionName } from '../creatures/anim';

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
  const ids = Object.keys(SPECIES_VISUALS);
  const cols = Number(params.get('cols') ?? 6);
  const size = Number(params.get('cell') ?? 160);
  const rows = Math.ceil(ids.length / cols);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 2, background: silhouette ? '#fff' : '#223', width: cols * (size + 2), height: rows * (size + 2) }} id="sheet">
      {ids.map((id) => {
        const H = SPECIES_VISUALS[id].H;
        const d = Math.max(H, SPECIES_VISUALS[id].parts.length ? H : H) * 2.4;
        return (
          <div key={id} style={{ width: size, height: size, position: 'relative' }}>
            <Canvas frameloop="demand" camera={{ position: [d * 0.9, H * 0.6, d * 0.9], fov: 40 }} gl={{ preserveDrawingBuffer: true }} onCreated={(s) => s.camera.lookAt(0, H * 0.5, 0)}>
              <color attach="background" args={[silhouette ? '#ffffff' : '#9fb7c9']} />
              <hemisphereLight args={['#dbe8ff', '#5a4a3a', 1]} />
              <directionalLight position={[3, 5, 4]} intensity={2} />
              <FitCreature id={id} silhouette={silhouette} />
            </Canvas>
            {!silhouette && <span style={{ position: 'absolute', left: 2, top: 1, fontSize: 11, color: '#fff' }}>{id}</span>}
          </div>
        );
      })}
    </div>
  );
}

function FitCreature({ id, silhouette }: { id: string; silhouette: boolean }) {
  const model = useMemo(() => {
    const m = assemble(SPECIES_VISUALS[id], { lod: 0, quality: 'high' });
    if (silhouette) m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: '#000000' }); });
    new Animator(m).update(0.001);
    // fit: scale so the bounding sphere fills the view
    const box = new THREE.Box3().setFromObject(m.root);
    const size = box.getSize(new THREE.Vector3());
    const H = SPECIES_VISUALS[id].H;
    const s = (H * 1.3) / Math.max(size.x, size.y, size.z);
    m.root.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    m.root.position.set(-c.x * s, -box.min.y * s + (H * 0.5 - size.y * s * 0.5), -c.z * s);
    return m;
  }, [id, silhouette]);
  return <primitive object={model.root} />;
}

export default function Tools() {
  const tool = params.get('tool');
  if (tool === 'sheet') return <Sheet silhouette={false} />;
  if (tool === 'silhouettes') return <Sheet silhouette />;
  return <Viewer />;
}
