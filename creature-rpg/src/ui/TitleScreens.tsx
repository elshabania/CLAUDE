import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame, saveManager } from '../state/game';
import { Menu, Panel, TypeChip } from './components';
import { assemble } from '../creatures/assemble';
import { Animator } from '../creatures/anim';
import { SPECIES_VISUALS } from '../creatures/registry';
import { humanVisual } from '../creatures/humans';
import { playerLook, SKINS, HAIRS } from '../data/looks';
import { CONTENT } from '../data/index';
import { startAudio } from '../audio/engine';
import { SettingsPanel } from './Settings';
import * as G from '../sim/game';
import { rivalStarter } from '../sim/world';
import { cry } from '../audio/sfxBus';

function Spin({ id, human, x = 0, scale = 1, happy }: { id?: string; human?: ReturnType<typeof playerLook>; x?: number; scale?: number; happy?: boolean }) {
  const model = useMemo(() => {
    if (human) return assemble(humanVisual(human), { lod: 0, quality: 'balanced' });
    return SPECIES_VISUALS[id!] ? assemble(SPECIES_VISUALS[id!], { lod: 0, quality: 'balanced' }) : null;
  }, [id, human]);
  const anim = useMemo(() => (model ? new Animator(model) : null), [model]);
  const g = useRef<THREE.Group>(null);
  useEffect(() => {
    if (happy && anim) anim.play('victory');
  }, [happy, anim]);
  useEffect(() => () => model?.dispose(), [model]);
  useFrame((_, dt) => {
    anim?.update(Math.min(dt, 0.1));
    if (g.current && !happy) g.current.rotation.y = Math.sin(performance.now() / 2500) * 0.5;
  });
  if (!model) return null;
  const s = scale / Math.max(0.5, model.bounds.height);
  return (
    <group ref={g} position={[x, 0, 0]} scale={s}>
      <primitive object={model.root} />
    </group>
  );
}

export function TitleScreen() {
  const [sub, setSub] = useState<'main' | 'settings' | 'confirm' | 'import'>('main');
  const hasSave = useMemo(() => saveManager.hasSave(), []);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const begin = () => {
    startAudio();
    if (hasSave) setSub('confirm');
    else useGame.setState({ mode: 'newgame' });
  };
  return (
    <div className="title-screen" onPointerDown={() => startAudio()}>
      <div style={{ position: 'absolute', inset: 0, zIndex: -1 }}>
        <Canvas camera={{ position: [0, 1.1, 4.2], fov: 38 }} dpr={[1, 1.5]}>
          <color attach="background" args={['#1b2336']} />
          <fog attach="fog" args={['#1b2336', 6, 14]} />
          <hemisphereLight args={['#dbe8ff', '#3a2e24', 1.0]} />
          <directionalLight position={[3, 5, 4]} intensity={2.2} />
          <Spin id="c04" x={-1.6} scale={0.8} />
          <Spin id="c01" x={0} scale={0.8} />
          <Spin id="c07" x={1.6} scale={0.8} />
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[6, 48]} />
            <meshStandardMaterial color="#2f3a52" />
          </mesh>
        </Canvas>
      </div>
      <div style={{ width: '100%' }}>
        <div className="title-logo">Wildchord</div>
        <div className="title-sub">SONGS OF CANTARRA</div>
        {sub === 'main' && (
          <div className="title-menu">
            <Menu
              ariaLabel="title menu"
              items={[
                ...(hasSave ? [{ key: 'cont', label: 'Continue', onSelect: () => { startAudio(); if (!useGame.getState().continueGame()) setMsg('No valid save could be loaded.'); } }] : []),
                { key: 'new', label: 'New game', onSelect: begin },
                { key: 'import', label: 'Import save file', onSelect: () => fileRef.current?.click() },
                { key: 'settings', label: 'Settings', onSelect: () => setSub('settings') },
              ]}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                const r = saveManager.importRaw(text);
                if (!r.ok) setMsg('Import failed: ' + r.error);
                else {
                  setMsg(`Imported ${r.payload.player.name}'s journey (${Math.floor(r.payload.player.playtimeSec / 60)} min, ${Object.keys(r.payload.inventory).filter((k) => k.startsWith('i_keynote')).length} Keynotes).${r.warning ? ' ' + r.warning : ''}`);
                  setTimeout(() => location.reload(), 1600);
                }
              }}
            />
            {msg && <p role="status" style={{ textAlign: 'center' }}>{msg}</p>}
            <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 20 }}>An original creature-collecting RPG · all models, music and sounds generated in code</p>
          </div>
        )}
        {sub === 'confirm' && (
          <Panel className="title-menu" title="Start a new journey?">
            <p>This will replace your save. The previous save is kept as a backup until your next save.</p>
            <Menu items={[{ key: 'yes', label: 'Start new game', onSelect: () => useGame.setState({ mode: 'newgame' }) }, { key: 'no', label: 'Cancel', onSelect: () => setSub('main') }]} onBack={() => setSub('main')} />
          </Panel>
        )}
        {sub === 'settings' && (
          <div style={{ width: 'min(560px, 92vw)', margin: '0 auto' }}>
            <SettingsPanel onClose={() => setSub('main')} />
          </div>
        )}
      </div>
    </div>
  );
}

export function NewGameScreen() {
  const [name, setName] = useState('Hollis');
  const [pronoun, setPronoun] = useState<'they' | 'she' | 'he'>('they');
  const [build, setBuild] = useState(0);
  const [skin, setSkin] = useState(0);
  const [hair, setHair] = useState(0);
  const look = useMemo(() => playerLook(build, skin, hair), [build, skin, hair]);
  return (
    <div className="screen">
      <h1>A new Tuner</h1>
      <div className="cols">
        <Panel>
          <label htmlFor="nm">Name</label>
          <div className="row" style={{ margin: '6px 0 12px' }}>
            <input id="nm" type="text" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <div>Pronouns</div>
          <div className="row" style={{ margin: '6px 0 12px' }}>
            {(['they', 'she', 'he'] as const).map((p) => (
              <button key={p} className={'tab' + (pronoun === p ? ' on' : '')} aria-pressed={pronoun === p} onClick={() => setPronoun(p)}>{p}</button>
            ))}
          </div>
          <div>Build</div>
          <div className="row" style={{ margin: '6px 0 12px' }}>
            {['Compact', 'Tall'].map((b, i) => <button key={b} className={'tab' + (build === i ? ' on' : '')} aria-pressed={build === i} onClick={() => setBuild(i)}>{b}</button>)}
          </div>
          <div>Skin tone</div>
          <div className="row" style={{ margin: '6px 0 12px' }}>
            {SKINS.map((c, i) => <button key={c} aria-label={`skin tone ${i + 1}`} aria-pressed={skin === i} className={'tab' + (skin === i ? ' on' : '')} onClick={() => setSkin(i)}><span style={{ display: 'inline-block', width: 22, height: 22, background: c, borderRadius: 11 }} /></button>)}
          </div>
          <div>Hair</div>
          <div className="row" style={{ margin: '6px 0 12px' }}>
            {HAIRS.map((h, i) => <button key={i} aria-pressed={hair === i} className={'tab' + (hair === i ? ' on' : '')} onClick={() => setHair(i)}>{['Crop', 'Tail', 'Curls'][i]}</button>)}
          </div>
          <Menu autoFocus={false} items={[{ key: 'go', label: 'Begin in Larkhollow ▶', onSelect: () => useGame.getState().startNewGame(name, pronoun, { build, skin, hair }) }, { key: 'back', label: 'Back', onSelect: () => useGame.setState({ mode: 'title' }) }]} />
        </Panel>
        <div style={{ minHeight: 280 }}>
          <Canvas camera={{ position: [0, 1.0, 3.2], fov: 35 }} dpr={[1, 1.5]}>
            <hemisphereLight args={['#dbe8ff', '#5a4a3a', 1.1]} />
            <directionalLight position={[2, 4, 3]} intensity={2} />
            <group position={[0, -0.05, 0]}>
              <Spin key={look.id} human={look} scale={1.6} />
            </group>
          </Canvas>
        </div>
      </div>
    </div>
  );
}

export function StarterScreen() {
  const [pick, setPick] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const opts = ['c01', 'c04', 'c07'];
  const choose = (id: string) => {
    const g = useGame.getState();
    const r = G.giveKin(CONTENT, g.save!, id, 5, { bond: true });
    if (!r.ok) return;
    let s = r.s;
    s = { ...s, player: { ...s.player, starter: id }, flags: { ...s.flags, flag_starter_chosen: true }, inventory: { ...s.inventory, i_chime_reed: (s.inventory.i_chime_reed ?? 0) + 5, i_salve_1: (s.inventory.i_salve_1 ?? 0) + 3 } };
    const rival = rivalStarter(id);
    s = { ...s, seen: [...new Set([...s.seen, ...opts])] };
    useGame.setState({ save: s, mode: 'explore' });
    g.commit('starter');
    g.toast(`${CONTENT.species[id].name} joined your troupe! Cass eyes ${CONTENT.species[rival].name}…`, 'good');
  };
  return (
    <div className="screen">
      <h1>Choose your partner</h1>
      <p className="muted">"Don't pick the strongest. Pick the one that looks back at you." — Oriel</p>
      <div style={{ flex: 1, minHeight: 240 }}>
        <Canvas camera={{ position: [0, 0.9, 4.4], fov: 36 }} dpr={[1, 1.5]}>
          <hemisphereLight args={['#fff4e0', '#5a4a3a', 1.1]} />
          <directionalLight position={[2, 4, 3]} intensity={2.2} />
          {opts.map((id, i) => (
            <Spin key={id} id={id} x={(i - 1) * 1.7} scale={0.9} happy={pick === id} />
          ))}
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[4, 40]} />
            <meshStandardMaterial color="#6b8f4e" />
          </mesh>
        </Canvas>
      </div>
      {!confirm ? (
        <Menu
          columns={3}
          items={opts.map((id) => {
            const sp = CONTENT.species[id];
            return {
              key: id,
              label: (
                <span>
                  <b>{sp.name}</b> <TypeChip type={sp.types[0]} />
                  <br />
                  <span className="muted" style={{ fontSize: '.85rem' }}>{sp.blurb}</span>
                </span>
              ),
              onSelect: () => {
                setPick(id);
                cry(id, { happy: true });
                setConfirm(true);
              },
            };
          })}
        />
      ) : (
        <Panel title={`Take ${CONTENT.species[pick!].name}?`}>
          <Menu items={[{ key: 'y', label: `Yes — ${CONTENT.species[pick!].name} it is!`, onSelect: () => choose(pick!) }, { key: 'n', label: 'Let me look again', onSelect: () => { setConfirm(false); setPick(null); } }]} onBack={() => setConfirm(false)} />
        </Panel>
      )}
    </div>
  );
}
