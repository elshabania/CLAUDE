import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame, saveManager } from '../state/game';
import { CONTENT, TRAITS } from '../data/index';
import { ZONES } from '../data/zones';
import { OBJECTIVES, MAP_POS } from '../data/objectives';
import { Menu, Panel, TypeChip, StatusChip, HpString, type MenuItem } from './components';
import { computeStats } from '../sim/stats';
import * as G from '../sim/game';
import { evalExpr } from '../sim/world';
import { SettingsPanel } from './Settings';
import { assemble } from '../creatures/assemble';
import { Animator } from '../creatures/anim';
import { SPECIES_VISUALS } from '../creatures/registry';
import { REGISTER_NAME } from '../world/actors/ZoneActors';
import { TYPE_META } from '../battle/text';
import { runtime } from '../state/runtime';
import type { CreatureInstance } from '../sim/types';
import { cry } from '../audio/sfxBus';

const TABS: [string, string][] = [['troupe', 'Troupe'], ['satchel', 'Satchel'], ['kinsong', 'Kinsong'], ['map', 'Map'], ['journal', 'Journal'], ['registers', 'Registers'], ['settings', 'Settings'], ['save', 'Save']];

function close() {
  runtime.frozen = false;
  useGame.setState({ mode: 'explore' });
}

function KinViewer({ species, h = 260 }: { species: string; h?: number }) {
  const model = useMemo(() => (SPECIES_VISUALS[species] ? assemble(SPECIES_VISUALS[species], { lod: 0, quality: 'balanced' }) : null), [species]);
  const anim = useMemo(() => (model ? new Animator(model) : null), [model]);
  useEffect(() => () => model?.dispose(), [model]);
  const Tick = () => {
    useFrame((_, dt) => anim?.update(Math.min(dt, 0.1)));
    return null;
  };
  if (!model) return <div className="muted">No model registered.</div>;
  const H = Math.max(model.bounds.height, model.bounds.length * 0.6);
  return (
    <div style={{ height: h, background: 'radial-gradient(circle at 50% 40%, #3a4a66, #1b2336)' }} onClick={() => { anim?.play('victory'); cry(species, { happy: true }); }} title="Drag to rotate · click for a happy cry">
      <Canvas camera={{ position: [H * 1.6, H * 0.9, H * 2.1], fov: 35 }} dpr={[1, 1.5]}>
        <hemisphereLight args={['#dbe8ff', '#4a3a2a', 1.1]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} />
        <primitive object={model.root} />
        <OrbitControls target={[0, model.bounds.height * 0.45, 0]} enablePan={false} minDistance={H * 1.2} maxDistance={H * 5} />
        <Tick />
      </Canvas>
    </div>
  );
}

function KinDetail({ inst, onChanged }: { inst: CreatureInstance; onChanged?: () => void }) {
  const sp = CONTENT.species[inst.species];
  const st = computeStats(CONTENT, inst);
  const save = useGame((s) => s.save)!;
  const [teach, setTeach] = useState<string | null>(null);
  const discs = Object.keys(save.inventory).filter((k) => k.startsWith('i_disc') && save.inventory[k] > 0);
  const nextEvo = sp.evolvesTo;
  return (
    <div>
      <div className="row"><h2 style={{ margin: 0 }}>{inst.nickname || sp.name}</h2><span className="plate-lv">Lv {inst.level}</span>{sp.types.map((t) => <TypeChip key={t} type={t} />)}<StatusChip status={inst.status} /></div>
      <HpString hp={inst.hp} max={st.hp} showNumbers />
      <div className="stat-grid" style={{ margin: '8px 0' }}>
        {(['atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => (
          <FragmentStat key={k} label={{ atk: 'Attack', def: 'Defense', spa: 'Resonance', spd: 'Resolve', spe: 'Speed' }[k]} v={st[k]} />
        ))}
      </div>
      <div className="muted">Trait: <b style={{ color: 'var(--text)' }}>{TRAITS[sp.trait]?.name}</b> — {TRAITS[sp.trait]?.desc}</div>
      <div className="muted">Temperament: {inst.temperament.replace('tm_', '').replace('_', ' +/−')}</div>
      {nextEvo?.level && <div className="muted">Crescendo at Lv {nextEvo.level}{nextEvo.item ? ` (or with a ${CONTENT.items[nextEvo.item].name})` : ''}.</div>}
      <h2>Moves</h2>
      {inst.moves.map((m, i) => {
        const mv = CONTENT.moves[m.id];
        return (
          <div key={i} className="row" style={{ margin: '3px 0' }}>
            <TypeChip type={mv.type} /> <b style={{ flex: 1 }}>{mv.name}</b>
            <span className="muted" style={{ fontSize: '.85rem' }}>{mv.category} · pw {mv.power ?? '—'} · acc {mv.accuracy ?? '—'} · {m.charges}/{mv.charges}</span>
            {teach && <button className="tab" onClick={() => { useGame.getState().mutate((s) => { const r = G.teachMove(CONTENT, s, inst.uid, teach, i); return r.ok ? r.s : s; }, 'teach'); setTeach(null); onChanged?.(); }}>Replace</button>}
          </div>
        );
      })}
      {inst.evolveReady && sp.evolvesTo && (
        <button className="tab on" style={{ marginTop: 8 }} onClick={() => { useGame.setState({ pendingEvolutions: [{ uid: inst.uid, to: sp.evolvesTo!.species }], mode: 'evolution' }); }}>Ready to crescendo! ▶</button>
      )}
      {discs.length > 0 && (
        <>
          <h2>Etudes</h2>
          <div className="row">
            {discs.map((d) => {
              const can = G.canLearnDisc(CONTENT, inst, d);
              const mv = (CONTENT.items[d].params as any).move as string;
              const knows = inst.moves.some((m) => m.id === mv);
              return (
                <button key={d} className="tab" disabled={!can || knows} title={CONTENT.items[d].desc} onClick={() => {
                  if (inst.moves.length < 4) { useGame.getState().mutate((s) => { const r = G.teachMove(CONTENT, s, inst.uid, mv); return r.ok ? r.s : s; }, 'teach'); onChanged?.(); }
                  else setTeach(mv);
                }}>{CONTENT.moves[mv].name}{knows ? ' ✓' : !can ? ' ✕' : ''}</button>
              );
            })}
          </div>
          {teach && <p className="muted">Choose a move above to replace with {CONTENT.moves[teach].name}, or <button className="tab" onClick={() => setTeach(null)}>cancel</button></p>}
        </>
      )}
    </div>
  );
}
function FragmentStat({ label, v }: { label: string; v: number }) {
  return (<><span>{label}</span><div className="bar"><div style={{ width: `${Math.min(100, v / 2)}%` }} /></div><span>{v}</span></>);
}

function TroupeTab() {
  const save = useGame((s) => s.save)!;
  const [sel, setSel] = useState(0);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const party = G.partyOf(save);
  const inst = party[Math.min(sel, party.length - 1)];
  return (
    <div className="cols">
      <div className="scroll">
        <Menu
          items={party.map((p, i) => ({
            key: p.uid,
            label: <span className="kin-card"><b>{p.nickname || CONTENT.species[p.species].name}</b> Lv {p.level} <span className="muted">{p.hp}/{computeStats(CONTENT, p).hp}</span>{p.evolveReady ? ' ★' : ''}{swapFrom === i ? ' ⇅' : ''}</span>,
            onSelect: () => {
              if (swapFrom != null && swapFrom !== i) {
                useGame.getState().mutate((s) => { const r = G.swapParty(s, swapFrom, i); return r.ok ? r.s : s; }, 'reorder');
                setSwapFrom(null);
              }
              setSel(i);
            },
          }))}
          onBack={close}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="tab" onClick={() => setSwapFrom(swapFrom == null ? sel : null)}>{swapFrom == null ? 'Reorder…' : 'Cancel reorder'}</button>
        </div>
        {inst && <KinViewer species={inst.species} h={200} />}
      </div>
      <div className="scroll">{inst && <KinDetail inst={inst} />}</div>
    </div>
  );
}

function SatchelTab() {
  const save = useGame((s) => s.save)!;
  const [item, setItem] = useState<string | null>(null);
  const [slotFor, setSlotFor] = useState<string | null>(null);
  const pockets: [string, (k: string) => boolean][] = [['Restoratives', (k) => ['heal', 'cure', 'revive', 'charge', 'evo'].includes(k)], ['Chimes', (k) => k === 'orb'], ['Etudes', (k) => k === 'disc'], ['Field', (k) => ['repel', 'escape'].includes(k)], ['Key items', (k) => k === 'key']];
  const g = useGame.getState();
  const use = (id: string, uid?: string, slot?: number) => {
    const it = CONTENT.items[id];
    if (it.kind === 'repel') {
      g.mutate((s) => { const t = G.takeItem(s, id); if (!t.ok) return s; return { ...t.s, flags: { ...t.s.flags, hush_until: runtime.metersWalked + ((it.params as any).meters ?? 200) } }; }, 'repel');
      g.toast('Wild kin will keep their distance for a while.', 'good');
      return;
    }
    if (it.kind === 'escape') {
      const z = ZONES[g.zoneId];
      if (!z || ['town', 'spire'].includes(z.biome)) { g.toast("You're already somewhere safe.", 'warn'); return; }
      g.mutate((s) => { const t = G.takeItem(s, id); return t.ok ? t.s : s; }, 'thread');
      close();
      g.warp(save.lastHearth.zone, save.lastHearth.spawn);
      return;
    }
    if (!uid) return;
    const r = G.useItemOnKin(CONTENT, useGame.getState().save!, id, uid, slot);
    if (!r.ok) { g.toast(r.reason, 'warn'); return; }
    useGame.setState({ save: r.s });
    g.commit('use item');
    g.toast(r.msg === 'crescendo' ? 'A dazzling crescendo!' : r.msg ?? 'Used.', 'good');
    setSlotFor(null);
  };
  return (
    <div className="cols">
      <div className="scroll">
        {pockets.map(([name, f]) => {
          const list = Object.entries(save.inventory).filter(([id, n]) => n > 0 && CONTENT.items[id] && f(CONTENT.items[id].kind));
          if (!list.length) return null;
          return (
            <div key={name}>
              <h2>{name}</h2>
              <Menu autoFocus={false} items={list.map(([id, n]) => ({ key: id, label: `${CONTENT.items[id].name}${CONTENT.items[id].kind === 'key' || CONTENT.items[id].kind === 'disc' ? '' : ' ×' + n}`, onSelect: () => setItem(id) }))} onBack={close} />
            </div>
          );
        })}
        {!Object.keys(save.inventory).length && <p className="muted">Your satchel is empty.</p>}
      </div>
      <div className="scroll">
        {item && (
          <Panel title={CONTENT.items[item].name}>
            <p>{CONTENT.items[item].desc}</p>
            {['heal', 'cure', 'revive', 'charge', 'evo'].includes(CONTENT.items[item].kind) && (
              <Menu items={G.partyOf(save).map((p) => ({ key: p.uid, label: `Use on ${p.nickname || CONTENT.species[p.species].name} (${p.hp}/${computeStats(CONTENT, p).hp})`, onSelect: () => (CONTENT.items[item].kind === 'charge' && !(CONTENT.items[item].params as any).all ? setSlotFor(p.uid) : use(item, p.uid)) }))} onBack={() => setItem(null)} />
            )}
            {slotFor && (
              <Menu items={save.instances[slotFor].moves.map((m, i) => ({ key: m.id, label: `${CONTENT.moves[m.id].name} ${m.charges}/${CONTENT.moves[m.id].charges}`, onSelect: () => use(item, slotFor, i) }))} />
            )}
            {['repel', 'escape'].includes(CONTENT.items[item].kind) && <Menu items={[{ key: 'use', label: 'Use', onSelect: () => use(item) }]} />}
          </Panel>
        )}
      </div>
    </div>
  );
}

function KinsongTab() {
  const save = useGame((s) => s.save)!;
  const ids = Object.keys(CONTENT.species).sort();
  const [sel, setSel] = useState(ids.find((i) => save.caught.includes(i)) ?? ids[0]);
  const sp = CONTENT.species[sel];
  const caught = save.caught.includes(sel);
  const seen = save.seen.includes(sel);
  return (
    <div className="cols">
      <div className="scroll">
        <p className="muted">Heard {save.seen.length}/30 · Sung {save.caught.length}/30</p>
        <Menu autoFocus={false} items={ids.map((i) => ({ key: i, label: `${i.slice(1)} ${save.seen.includes(i) ? CONTENT.species[i].name : '—'} ${save.caught.includes(i) ? '♪' : ''}`, onSelect: () => setSel(i) }))} onBack={close} />
      </div>
      <div className="scroll">
        {seen ? (
          <>
            <div className="row"><h2 style={{ margin: 0 }}>{sp.name}</h2>{sp.types.map((t) => <TypeChip key={t} type={t} />)}<span className="muted">{caught ? 'Sung ♪' : 'Heard'}</span></div>
            {caught ? <KinViewer species={sel} h={300} /> : <div style={{ height: 120 }} className="muted">Bond with one to see it up close.</div>}
            <p>{sp.blurb}</p>
            <p className="muted">Height {sp.heightM} m{sp.evolvesTo ? ` · Crescendo → ${save.seen.includes(sp.evolvesTo.species) ? CONTENT.species[sp.evolvesTo.species].name : '???'}` : ''}</p>
            {caught && <p className="muted">Trait: {TRAITS[sp.trait]?.name} — {TRAITS[sp.trait]?.desc}</p>}
          </>
        ) : (
          <p className="muted">Verse {sel.slice(1)} is still silent. Explore to hear it.</p>
        )}
      </div>
    </div>
  );
}

function MapTab({ travel }: { travel?: boolean }) {
  const save = useGame((s) => s.save)!;
  const zoneId = useGame((s) => s.zoneId);
  const links = new Set<string>();
  for (const z of Object.values(ZONES)) for (const e of z.exits) links.add([z.id, e.to].sort().join('|'));
  const canTravel = travel || false;
  return (
    <div className="cols">
      <div style={{ position: 'relative', background: '#2a3448', minHeight: 320, border: '1.5px solid var(--brass)' }} aria-label="region map">
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {[...links].map((l) => {
            const [a, b] = l.split('|');
            if (!MAP_POS[a] || !MAP_POS[b]) return null;
            return <line key={l} x1={MAP_POS[a][0]} y1={MAP_POS[a][1]} x2={MAP_POS[b][0]} y2={MAP_POS[b][1]} stroke="#8a7a5a" strokeWidth={0.6} strokeDasharray="1.5 1" />;
          })}
          {Object.entries(MAP_POS).map(([id, [x, y]]) => {
            const z = ZONES[id];
            const known = save.waystones.includes('ws_' + id) || id === zoneId || id.startsWith('trial');
            return (
              <g key={id}>
                <circle cx={x} cy={y} r={id === zoneId ? 2.6 : 1.8} fill={id === zoneId ? '#2FA39A' : save.waystones.includes('ws_' + id) ? '#C8963E' : '#556'} stroke="#F3EAD7" strokeWidth={0.3} />
                {!id.startsWith('trial') && <text x={x + 2.5} y={y + 1} fontSize={2.6} fill={known ? '#F3EAD7' : '#8a95a8'}>{z?.name ?? id}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="scroll">
        <h2>{canTravel ? 'Travel by Waystone' : 'Waystones'}</h2>
        <p className="muted">{canTravel ? 'Choose a registered Chordstone.' : 'Resonate with any Chordstone to travel between registered ones.'}</p>
        <Menu
          items={save.waystones.map((w) => {
            const zid = w.replace('ws_', '');
            const z = ZONES[zid];
            return { key: w, label: z?.name ?? zid, disabled: !canTravel || zid === zoneId || !z, onSelect: () => { close(); const sp = z!.spawns.find((s) => s.id === `sp_${zid}_ws`) ?? z!.spawns[0]; useGame.getState().warp(zid, sp.id); } };
          })}
          onBack={close}
        />
      </div>
    </div>
  );
}

function JournalTab() {
  const save = useGame((s) => s.save)!;
  const next = OBJECTIVES.find((o) => !save.flags[o.flag]);
  const keynotes = Object.keys(save.inventory).filter((k) => k.startsWith('i_keynote'));
  const quests = Object.entries(save.quests);
  return (
    <div className="cols">
      <div className="scroll">
        <h2>Current song</h2>
        {next ? (
          <Panel>
            <div className="muted">Chapter {next.ch} · {next.title}</div>
            <p style={{ fontSize: '1.1rem' }}>{next.hint}</p>
            {next.zone && <div className="muted">Where: {ZONES[next.zone]?.name ?? next.zone}</div>}
          </Panel>
        ) : (
          <Panel><p>The Great Chord has sounded. Cantarra hums again. (Journey complete!)</p></Panel>
        )}
        <h2>Keynotes {keynotes.length}/6</h2>
        <div className="row">{[1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="chip" style={{ background: save.inventory['i_keynote_' + i] ? 'var(--brass)' : '#445', color: '#1E2433' }}>{save.inventory['i_keynote_' + i] ? '♦' : '◇'} {i}</span>)}</div>
      </div>
      <div className="scroll">
        <h2>Side verses</h2>
        {quests.length ? quests.map(([q, v]) => <div key={q} className="row"><span style={{ flex: 1 }}>{q.replace(/^q_(side_)?/, '').replace(/_/g, ' ')}</span><span className="muted">{v.state === 'done' ? 'complete ✓' : 'in progress'}</span></div>) : <p className="muted">No side verses yet — talk to people around Cantarra.</p>}
        <h2>Tuning Ledger</h2>
        <p className="muted">{save.player.name} · playtime {Math.floor(save.player.playtimeSec / 3600)}h {Math.floor((save.player.playtimeSec % 3600) / 60)}m · battles {save.stats.battles} · bonds {save.stats.captures}</p>
      </div>
    </div>
  );
}

function RegistersTab() {
  const save = useGame((s) => s.save)!;
  const unlock: Record<string, string> = { verdant: 'flag_resonance_tutorial', electric: 'flag_resonance_tutorial', fire: 'flag_resonance_tutorial', water: 'flag_resonance_tutorial', stone: 'i_keynote_1', toxin: 'i_keynote_2', gale: 'i_keynote_3', shade: 'i_keynote_4', frost: 'i_keynote_5', lumen: 'i_keynote_6' };
  return (
    <div className="scroll">
      <p className="muted">A troupe member of the matching type (even one that has gone quiet) can resonate with a glyph-carved node.</p>
      {Object.entries(REGISTER_NAME).map(([t, n]) => {
        const k = unlock[t];
        const on = k.startsWith('i_') ? (save.inventory[k] ?? 0) > 0 : !!save.flags[k];
        const has = save.party.some((u) => CONTENT.species[save.instances[u].species].types.includes(t as any));
        return (
          <div key={t} className="row" style={{ margin: '4px 0' }}>
            <TypeChip type={t} /> <b style={{ width: 90 }}>{n}</b>
            <span className={on ? '' : 'muted'}>{on ? 'Tuned' : 'Silent'}</span>
            <span className="muted">· {has ? 'a troupe member can sing it' : `needs a ${TYPE_META[t].name} kin`}</span>
          </div>
        );
      })}
    </div>
  );
}

function SaveTab() {
  const g = useGame.getState();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="scroll" style={{ maxWidth: 560 }}>
      <p className="muted">The game saves automatically at safe moments (entering a zone, after battles, purchases, healing and story events). {saveManager.available ? '' : 'Storage is unavailable in this browser — export your save to keep it.'}</p>
      <Menu
        items={[
          { key: 'save', label: 'Save now', onSelect: () => { g.commit('manual'); setMsg(useGame.getState().banner ?? 'Saved.'); } },
          { key: 'export', label: 'Export save file', onSelect: () => {
            g.commit('export');
            const raw = saveManager.exportRaw();
            if (!raw) { setMsg('Nothing to export yet.'); return; }
            const blob = new Blob([raw], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `wildchord-save-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            setMsg('Exported.');
          } },
          { key: 'title', label: 'Return to title (progress is saved)', onSelect: () => { g.commit('title'); location.reload(); } },
        ]}
        onBack={close}
      />
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

function FosterageTab() {
  const save = useGame((s) => s.save)!;
  const g = useGame.getState();
  const [confirm, setConfirm] = useState<string | null>(null);
  const act = (fn: (s: typeof save) => G.Result) => {
    const r = fn(useGame.getState().save!);
    if (!r.ok) g.toast(r.reason, 'warn');
    else { useGame.setState({ save: r.s }); g.commit('fosterage'); }
  };
  return (
    <div className="cols">
      <div className="scroll">
        <h2>Troupe ({save.party.length}/6)</h2>
        <Menu items={G.partyOf(save).map((p) => ({ key: p.uid, label: `${p.nickname || CONTENT.species[p.species].name} Lv ${p.level} → Deposit`, onSelect: () => act((s) => G.deposit(s, p.uid)) }))} onBack={close} />
      </div>
      <div className="scroll">
        <h2>Fosterage ({save.storage.length}/300)</h2>
        {!save.storage.length && <p className="muted">The Fosterage pens are empty.</p>}
        <Menu autoFocus={false} items={G.storageOf(save).map((p) => ({ key: p.uid, label: `${p.nickname || CONTENT.species[p.species].name} Lv ${p.level} → Withdraw`, onSelect: () => act((s) => G.withdraw(s, p.uid)) }))} />
        {save.storage.length > 0 && (
          <>
            <h2>Release</h2>
            <p className="muted">Released kin return to the wild. This cannot be undone.</p>
            <Menu autoFocus={false} items={G.storageOf(save).filter((p) => !p.bond).map((p) => ({ key: 'r' + p.uid, label: confirm === p.uid ? `Really release ${CONTENT.species[p.species].name}? Select again to confirm` : `Release ${p.nickname || CONTENT.species[p.species].name}`, onSelect: () => { if (confirm === p.uid) { act((s) => G.release(s, p.uid)); setConfirm(null); } else setConfirm(p.uid); } }))} />
          </>
        )}
      </div>
    </div>
  );
}

function RecallTab() {
  const save = useGame((s) => s.save)!;
  const [sel, setSel] = useState<string | null>(null);
  const [move, setMove] = useState<string | null>(null);
  const inst = sel ? save.instances[sel] : null;
  return (
    <div className="cols">
      <div className="scroll">
        <p className="muted">The Hearthkeeper can help a kin remember moves it once knew — free of charge.</p>
        <Menu items={G.partyOf(save).map((p) => ({ key: p.uid, label: `${CONTENT.species[p.species].name} (${G.relearnable(CONTENT, p).length} moves)`, onSelect: () => { setSel(p.uid); setMove(null); } }))} onBack={close} />
      </div>
      <div className="scroll">
        {inst && !move && <Menu items={G.relearnable(CONTENT, inst).map((m) => ({ key: m, label: <span><TypeChip type={CONTENT.moves[m].type} /> {CONTENT.moves[m].name}</span>, onSelect: () => { if (inst.moves.length < 4) { useGame.getState().mutate((s) => { const r = G.teachMove(CONTENT, s, inst.uid, m); return r.ok ? r.s : s; }, 'recall'); } else setMove(m); } }))} />}
        {inst && move && (
          <>
            <p>Forget which move to learn {CONTENT.moves[move].name}?</p>
            <Menu items={[...inst.moves.map((m, i) => ({ key: m.id, label: CONTENT.moves[m.id].name, onSelect: () => { useGame.getState().mutate((s) => { const r = G.teachMove(CONTENT, s, inst.uid, move, i); return r.ok ? r.s : s; }, 'recall'); setMove(null); } })), { key: 'x', label: 'Cancel', onSelect: () => setMove(null) }]} />
          </>
        )}
      </div>
    </div>
  );
}

export function GameMenu() {
  const tab = useGame((s) => s.menuTab);
  const setTab = (t: string) => useGame.setState({ menuTab: t });
  const special = tab === 'fosterage' || tab === 'recall' || tab === 'travel';
  return (
    <div className="screen" role="dialog" aria-label="menu" onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); close(); } }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{special ? { fosterage: 'The Fosterage', recall: 'Recall', travel: 'Waystones' }[tab] : 'Tuning Ledger'}</h1>
        <button className="tab" onClick={close} aria-label="close menu">✕ Close</button>
      </div>
      {!special && (
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={'tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'troupe' && <TroupeTab />}
        {tab === 'satchel' && <SatchelTab />}
        {tab === 'kinsong' && <KinsongTab />}
        {tab === 'map' && <MapTab />}
        {tab === 'travel' && <MapTab travel />}
        {tab === 'journal' && <JournalTab />}
        {tab === 'registers' && <RegistersTab />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'save' && <SaveTab />}
        {tab === 'fosterage' && <FosterageTab />}
        {tab === 'recall' && <RecallTab />}
      </div>
    </div>
  );
}
void THREE; void useRef; void evalExpr;
export type { MenuItem };
