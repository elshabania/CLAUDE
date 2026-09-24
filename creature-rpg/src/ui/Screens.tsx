// Chandlery (shop), Crescendo (evolution) + move-learn, and ending screens.
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame } from '../state/game';
import { runtime } from '../state/runtime';
import { SHOPS } from '../data/registry';
import { CONTENT } from '../data/index';
import { evalExpr } from '../sim/world';
import * as G from '../sim/game';
import { Menu, Panel, TypeChip } from './components';
import { assemble } from '../creatures/assemble';
import { Animator } from '../creatures/anim';
import { SPECIES_VISUALS } from '../creatures/registry';
import { cry, sfx } from '../audio/sfxBus';
import { playStinger } from '../audio/engine';
import { useSettings } from '../state/settingsStore';

function closeTo(mode: 'explore' = 'explore') {
  runtime.frozen = false;
  useGame.setState({ mode, shop: null });
}

export function ShopScreen() {
  const shopId = useGame((s) => s.shop);
  const save = useGame((s) => s.save)!;
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [sel, setSel] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const shop = shopId ? SHOPS[shopId] : null;
  if (!shop) return null;
  const buyList = shop.items.filter((i) => evalExpr(i.if, save) && CONTENT.items[i.id]?.price != null).map((i) => i.id);
  const sellList = Object.entries(save.inventory).filter(([id, n]) => n > 0 && CONTENT.items[id]?.sell && CONTENT.items[id].kind !== 'key' && CONTENT.items[id].kind !== 'disc').map(([id]) => id);
  const list = tab === 'buy' ? buyList : sellList;
  const def = sel ? CONTENT.items[sel] : null;
  const unit = def ? (tab === 'buy' ? def.price! : def.sell!) : 0;
  const maxQty = def ? (tab === 'buy' ? Math.max(1, Math.min(99, Math.floor(save.player.money / Math.max(1, unit)))) : save.inventory[sel!] ?? 0) : 1;
  const confirm = () => {
    if (!sel) return;
    const r = tab === 'buy' ? G.buy(CONTENT, save, sel, qty) : G.sell(CONTENT, save, sel, qty);
    if (!r.ok) {
      setMsg(r.reason);
      sfx('menu_back');
      return;
    }
    useGame.getState().mutate(() => r.s, tab);
    sfx('purchase');
    setMsg(tab === 'buy' ? `Bought ${def!.name} ×${qty}.` : `Sold ${def!.name} ×${qty} for ◇ ${unit * qty}.`);
    setQty(1);
    if (tab === 'sell' && (r.s.inventory[sel] ?? 0) <= 0) setSel(null);
  };
  return (
    <div className="screen" role="dialog" aria-label={shop.name}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{shop.name}</h1>
        <span className="hud-meta">◇ {save.player.money.toLocaleString()}</span>
      </div>
      <div className="tabs" role="tablist">
        {(['buy', 'sell'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={'tab' + (tab === t ? ' on' : '')} onClick={() => { setTab(t); setSel(null); setQty(1); setMsg(null); }}>{t === 'buy' ? 'Buy' : 'Sell'}</button>
        ))}
        <button className="tab" onClick={() => closeTo()}>✕ Leave</button>
      </div>
      <div className="cols" style={{ flex: 1, minHeight: 0 }}>
        <div className="scroll">
          {list.length === 0 && <p className="muted">{tab === 'buy' ? 'Nothing on the shelves right now.' : 'Nothing the Chandler wants to buy.'}</p>}
          <Menu
            key={tab}
            items={list.map((id) => ({
              key: id,
              label: (
                <span className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span>{CONTENT.items[id].name}</span>
                  <span className="muted">◇ {tab === 'buy' ? CONTENT.items[id].price : CONTENT.items[id].sell} · own {save.inventory[id] ?? 0}</span>
                </span>
              ),
              onSelect: () => { setSel(id); setQty(1); setMsg(null); },
            }))}
            onBack={() => closeTo()}
          />
        </div>
        <div className="scroll">
          {def ? (
            <Panel title={def.name}>
              <p>{def.desc}</p>
              {def.kind === 'disc' && <p className="muted">Teaches {CONTENT.moves[(def.params as { move: string }).move]?.name} <TypeChip type={CONTENT.moves[(def.params as { move: string }).move]?.type ?? 'none'} /></p>}
              <div className="row" style={{ margin: '10px 0' }}>
                <button className="tab" aria-label="less" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span aria-label="quantity" style={{ minWidth: 40, textAlign: 'center' }}>×{qty}</span>
                <button className="tab" aria-label="more" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
                <span className="muted">= ◇ {unit * qty}</span>
              </div>
              <Menu autoFocus={false} items={[{ key: 'ok', label: tab === 'buy' ? 'Buy' : 'Sell', onSelect: confirm, disabled: tab === 'buy' && unit * qty > save.player.money }]} />
            </Panel>
          ) : (
            <p className="muted">"Chimes, salves, a little of everything. Take your time." — the Chandler</p>
          )}
          {msg && <p role="status">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

function EvoModel({ species, glow }: { species: string; glow: number }) {
  const model = useMemo(() => (SPECIES_VISUALS[species] ? assemble(SPECIES_VISUALS[species], { lod: 0, quality: 'balanced' }) : null), [species]);
  const anim = useMemo(() => (model ? new Animator(model) : null), [model]);
  const g = useRef<THREE.Group>(null);
  useEffect(() => () => model?.dispose(), [model]);
  useEffect(() => {
    anim?.play('happy');
  }, [anim]);
  useFrame((_, dt) => {
    anim?.update(Math.min(dt, 0.1));
    if (g.current) g.current.rotation.y += dt * 0.4;
  });
  if (!model) return null;
  const s = 1.4 / Math.max(0.5, model.bounds.height);
  return (
    <group ref={g} scale={s * (1 + glow * 0.05)}>
      <primitive object={model.root} />
      {glow > 0 && (
        <mesh position={[0, model.bounds.height / 2, 0]}>
          <sphereGeometry args={[model.bounds.height * 0.7, 24, 16]} />
          <meshBasicMaterial color="#fff6d8" transparent opacity={glow * 0.85} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Crescendo (evolution) sequence, then any pending move-learn prompts. */
export function EvolutionScreen() {
  const evo = useGame((s) => s.pendingEvolutions);
  const learn = useGame((s) => s.pendingLearn);
  const save = useGame((s) => s.save)!;
  const [stage, setStage] = useState<'ask' | 'glow' | 'done'>('ask');
  const [glow, setGlow] = useState(0);
  const reduced = useSettings((s) => s.reducedMotion);
  const cur = evo[0];
  const inst = cur ? save.instances[cur.uid] : null;
  useEffect(() => {
    setStage('ask');
    setGlow(0);
  }, [cur?.uid, cur?.to]);
  useEffect(() => {
    if (stage !== 'glow' || !cur) return;
    let t = 0;
    const total = reduced ? 600 : 2600;
    const id = setInterval(() => {
      t += 50;
      setGlow(Math.min(1, t / (total * 0.7)));
      if (t >= total) {
        clearInterval(id);
        const r = G.evolveInSave(CONTENT, useGame.getState().save!, cur.uid, cur.to);
        const extra = r.pending ? [{ uid: cur.uid, move: r.pending }] : [];
        useGame.setState({ save: r.s, pendingLearn: [...useGame.getState().pendingLearn, ...extra] });
        useGame.getState().commit('evolution');
        playStinger('evolution');
        cry(cur.to, { happy: true });
        setStage('done');
        setGlow(0);
      }
    }, 50);
    return () => clearInterval(id);
  }, [stage, cur, reduced]);

  const next = () => {
    useGame.setState({ pendingEvolutions: useGame.getState().pendingEvolutions.slice(1) });
  };

  const finishAll = () => {
    runtime.frozen = false;
    useGame.setState({ mode: 'explore' });
  };

  if (cur && inst) {
    const from = CONTENT.species[inst.species].name;
    const to = CONTENT.species[cur.to].name;
    const nick = inst.nickname || from;
    return (
      <div className="screen" role="dialog" aria-label="Crescendo">
        <h1>Crescendo</h1>
        <div style={{ flex: 1, minHeight: 220 }}>
          <Canvas camera={{ position: [0, 0.9, 3.6], fov: 36 }} dpr={[1, 1.5]}>
            <color attach="background" args={['#141a2a']} />
            <hemisphereLight args={['#fff4e0', '#3a2e44', 1.1]} />
            <directionalLight position={[2, 4, 3]} intensity={2.2} />
            <EvoModel key={stage === 'done' ? cur.to : inst.species} species={stage === 'done' ? cur.to : inst.species} glow={glow} />
          </Canvas>
        </div>
        <Panel>
          {stage === 'ask' && (
            <>
              <p>{nick} is humming a new note… it's ready to Crescendo into {to}!</p>
              <Menu items={[{ key: 'go', label: `Let it sing (become ${to})`, onSelect: () => setStage('glow') }, { key: 'no', label: 'Not yet (hold the note)', onSelect: next }]} onBack={next} />
            </>
          )}
          {stage === 'glow' && <p aria-live="polite">{nick} is glowing…</p>}
          {stage === 'done' && (
            <>
              <p aria-live="polite">{nick} became {to}!</p>
              <Menu items={[{ key: 'ok', label: 'Wonderful!', onSelect: next }]} />
            </>
          )}
        </Panel>
      </div>
    );
  }
  if (learn.length) return <LearnPrompt key={learn[0].uid + learn[0].move} onDone={() => { const rest = useGame.getState().pendingLearn.slice(1); useGame.setState({ pendingLearn: rest }); }} />;
  // nothing left
  setTimeout(finishAll, 0);
  return null;
}

function LearnPrompt({ onDone }: { onDone: () => void }) {
  const p = useGame((s) => s.pendingLearn[0]);
  const save = useGame((s) => s.save)!;
  const [forget, setForget] = useState(false);
  const inst = save.instances[p.uid];
  if (!inst) {
    onDone();
    return null;
  }
  const mv = CONTENT.moves[p.move];
  const nm = inst.nickname || CONTENT.species[inst.species].name;
  const teach = (slot?: number) => {
    const r = G.teachMove(CONTENT, useGame.getState().save!, inst.uid, p.move, slot);
    if (r.ok) {
      useGame.getState().mutate(() => r.s, 'learn');
      useGame.getState().toast(`${nm} learned ${mv.name}!`, 'good');
      sfx('level_up');
    }
    onDone();
  };
  return (
    <div className="screen" role="dialog" aria-label="Learn move">
      <h1>A new note</h1>
      <Panel>
        <p>{nm} wants to learn <b>{mv.name}</b> <TypeChip type={mv.type} /> ({mv.category}, power {mv.power ?? '—'}, accuracy {mv.accuracy ?? '—'}).</p>
        {inst.moves.length < 4 ? (
          <Menu items={[{ key: 'ok', label: `Learn ${mv.name}`, onSelect: () => teach() }]} />
        ) : !forget ? (
          <>
            <p>But {nm} already knows four moves.</p>
            <Menu items={[{ key: 'f', label: 'Forget a move', onSelect: () => setForget(true) }, { key: 'n', label: `Don't learn ${mv.name}`, onSelect: onDone }]} onBack={onDone} />
          </>
        ) : (
          <Menu
            items={[
              ...inst.moves.map((m, i) => ({ key: m.id, label: <span><TypeChip type={CONTENT.moves[m.id].type} /> {CONTENT.moves[m.id].name}</span>, onSelect: () => teach(i) })),
              { key: 'x', label: `Keep all (skip ${mv.name})`, onSelect: onDone },
            ]}
            onBack={() => setForget(false)}
          />
        )}
        <p className="muted" style={{ fontSize: 12 }}>Forgotten moves can be recalled for free at any Hearthrest.</p>
      </Panel>
    </div>
  );
}

export function EndingScreen() {
  const save = useGame((s) => s.save)!;
  const caught = save.caught.length;
  const mins = Math.floor(save.player.playtimeSec / 60);
  return (
    <div className="screen" role="dialog" aria-label="The Great Chord" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.4rem' }}>The Great Chord</h1>
      <p style={{ maxWidth: 560 }}>Every Chordstone in Cantarra rings at once. Somewhere in Larkhollow, Oriel laughs out loud; in Hoarcrown, a Stillbell cracks and stays cracked. {save.player.name} and the troupe listen until the last echo fades.</p>
      <p className="muted">Kinsong: {caught}/30 sung · Playtime {Math.floor(mins / 60)}h {mins % 60}m</p>
      <p className="muted" style={{ fontSize: 13, maxWidth: 520 }}>Wildchord: Songs of Cantarra — an original game. Design, code, models, music and sound generated procedurally. Thank you for playing.</p>
      <Menu items={[{ key: 'c', label: 'Keep exploring', onSelect: () => closeTo() }]} />
    </div>
  );
}
