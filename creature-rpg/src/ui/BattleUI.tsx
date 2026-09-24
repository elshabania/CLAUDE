import { useMemo } from 'react';
import { useBattle } from '../battle/battleStore';
import { useGame } from '../state/game';
import { CONTENT } from '../data/index';
import { Menu, Panel, TypeChip, StatusChip, HpString, type MenuItem } from './components';
import { act, effectiveness, usableSlots } from '../sim/battle/engine';
import { TYPE_META } from '../battle/text';
import { computeStats } from '../sim/stats';

function Plate({ side }: { side: 'player' | 'foe' }) {
  const shown = useBattle((s) => s.shown[side]);
  const caught = useGame((s) => s.save?.caught ?? []);
  if (!shown?.visible) return null;
  const sp = CONTENT.species[shown.species];
  return (
    <Panel className={'plate plate-' + side}>
      <div className="plate-row">
        <span className="plate-name">{shown.name}</span>
        <span className="plate-lv">Lv {shown.level}</span>
      </div>
      <div className="plate-row">
        {sp.types.map((t) => <TypeChip key={t} type={t} />)}
        <StatusChip status={shown.status} />
      </div>
      <HpString hp={shown.hp} max={shown.maxHp} showNumbers={side === 'player' || caught.includes(shown.species)} />
    </Panel>
  );
}

export function BattleUI() {
  const b = useBattle();
  const save = useGame((s) => s.save);
  const st = b.state;
  const phase = b.phase;
  const items = useMemo(() => {
    if (!st || !save) return [] as MenuItem[];
    const active = act(st, 'player');
    const foe = act(st, 'foe');
    if (phase === 'command') {
      return [
        { key: 'moves', label: 'Moves', onSelect: () => b.setPhase('moves') },
        { key: 'bag', label: 'Satchel', onSelect: () => b.setPhase('bag') },
        { key: 'swap', label: 'Swap', disabled: st.player.team.filter((c) => c.inst.hp > 0).length < 2, onSelect: () => b.setPhase('swap') },
        { key: 'run', label: st.kind === 'wild' ? 'Retreat' : 'Retreat (not possible)', disabled: st.kind !== 'wild', hint: st.kind !== 'wild' ? "You can't retreat from a Tuner's challenge." : undefined, onSelect: () => b.command({ kind: 'run' }) },
      ];
    }
    if (phase === 'moves') {
      const usable = usableSlots(active);
      const list: MenuItem[] = active.inst.moves.map((m, i) => {
        const mv = CONTENT.moves[m.id];
        const eff = mv.category === 'status' ? 4 : effectiveness(CONTENT, mv.type, CONTENT.species[foe.inst.species].types);
        const known = save.caught.includes(foe.inst.species) || save.seen.includes(foe.inst.species);
        const mark = !known || mv.category === 'status' ? '' : eff === 0 ? ' ∅' : eff > 4 ? ' ▲' : eff < 4 ? ' ▼' : '';
        const max = mv.charges ?? 0;
        return {
          key: m.id + i,
          disabled: m.charges <= 0,
          hint: `${mv.category} · power ${mv.power ?? '—'} · accuracy ${mv.accuracy ?? '—'}`,
          label: (
            <span className="move-card">
              <TypeChip type={mv.type} />
              <span className="move-name">{mv.name}{mark && <span className="eff-mark" aria-label={eff > 4 ? 'strong' : eff === 0 ? 'no effect' : 'weak'}>{mark}</span>}</span>
              <span className="move-meta">{mv.category === 'physical' ? '✊' : mv.category === 'special' ? '✧' : '◌'} {m.charges}/{max}</span>
            </span>
          ),
          onSelect: () => b.command({ kind: 'move', slot: i }),
        };
      });
      if (usable.length === 0) list.push({ key: 'scramble', label: 'Scramble', onSelect: () => b.command({ kind: 'move', slot: -1 }) });
      return list;
    }
    if (phase === 'bag') {
      const inv = Object.entries(save.inventory).filter(([id, n]) => n > 0 && CONTENT.items[id] && ['heal', 'cure', 'revive', 'charge', 'orb'].includes(CONTENT.items[id].kind));
      if (!inv.length) return [{ key: 'none', label: 'Nothing usable in battle.', disabled: true, onSelect: () => {} }];
      return inv.map(([id, n]) => {
        const it = CONTENT.items[id];
        const orb = it.kind === 'orb';
        return {
          key: id,
          label: `${it.name} ×${n - (st.itemsUsed[id] ?? 0)}`,
          hint: it.desc,
          disabled: n - (st.itemsUsed[id] ?? 0) <= 0 || (orb && st.kind !== 'wild'),
          onSelect: () => {
            if (orb) b.command({ kind: 'capture', item: id });
            else useBattle.setState({ phase: 'swap', captureItem: 'use:' + id });
          },
        };
      });
    }
    if (phase === 'swap' || phase === 'replace') {
      const using = b.captureItem?.startsWith('use:') ? b.captureItem.slice(4) : null;
      const list: MenuItem[] = st.player.team.map((cb, i) => {
        const sp = CONTENT.species[cb.inst.species];
        const isActive = i === st.player.active;
        const it = using ? CONTENT.items[using] : null;
        const usable = using ? (it!.kind === 'revive' ? cb.inst.hp <= 0 : cb.inst.hp > 0) : !isActive && cb.inst.hp > 0;
        return {
          key: cb.inst.uid,
          disabled: !usable,
          label: (
            <span className="swap-row">
              <b>{cb.inst.nickname || sp.name}</b> Lv {cb.inst.level} · HP {cb.inst.hp}/{cb.stats.hp} {cb.inst.status ? '· ' + cb.inst.status : ''} {isActive ? '(in battle)' : ''}
            </span>
          ),
          onSelect: () => {
            if (using) {
              useBattle.setState({ captureItem: null });
              b.command({ kind: 'item', item: using, target: i });
            } else if (phase === 'replace') b.replace(i);
            else b.command({ kind: 'switch', to: i });
          },
        };
      });
      if (phase === 'replace' && st.kind === 'wild') list.push({ key: 'flee', label: 'Flee the battle', onSelect: () => b.replace('flee') });
      return list;
    }
    if (phase === 'confirmCapture') {
      return [
        { key: 'yes', label: 'Throw anyway (you must release one if it bonds)', onSelect: () => b.confirmCapture(true) },
        { key: 'no', label: 'Not now', onSelect: () => b.confirmCapture(false) },
      ];
    }
    if (phase === 'release') {
      const cap = st.captured;
      const list: MenuItem[] = [{ key: 'new', label: `Release the new ${cap ? CONTENT.species[cap.species].name : 'kin'}`, onSelect: () => b.chooseRelease('new') }];
      for (const u of save.storage.slice(0, 40)) {
        const inst = save.instances[u];
        if (inst.bond) continue;
        list.push({ key: u, label: `Release ${inst.nickname || CONTENT.species[inst.species].name} (Lv ${inst.level}) from the Fosterage`, onSelect: () => b.chooseRelease(u) });
      }
      return list;
    }
    return [] as MenuItem[];
  }, [st, save, phase, b.captureItem]);

  if (!st) return null;
  const back = phase === 'moves' || phase === 'bag' || (phase === 'swap') ? () => { useBattle.setState({ captureItem: null }); b.setPhase('command'); } : undefined;
  const att = st.attunedType;
  const cols = phase === 'moves' ? 2 : 1;
  const active = st.player.team[st.player.active];
  return (
    <div className="battle-ui" data-ui>
      <div className="attune-pill" aria-live="polite">
        {att ? <><span aria-hidden>{TYPE_META[att].glyph}</span> Attuned: {TYPE_META[att].name} ×1.1</> : b.req?.attuned === null ? 'Attunement: Silenced' : 'No attunement'}
        {st.weather !== 'clear' && <span className="weather-pill"> · {st.weather}{st.weatherTurns != null ? ` (${st.weatherTurns})` : ''}</span>}
      </div>
      {b.trainerName && <div className="trainer-tag">{b.trainerName}</div>}
      <Plate side="foe" />
      <Plate side="player" />
      <Panel className="battle-msg"><div aria-live="polite">{b.message}</div></Panel>
      {items.length > 0 && !['animating', 'intro', 'end'].includes(phase) && (
        <Panel className={'battle-cmd ' + (phase === 'moves' ? 'wide' : '')} title={phase === 'command' ? undefined : phase === 'replace' ? 'Send out' : phase === 'bag' ? 'Satchel' : phase === 'moves' ? 'Moves' : phase === 'release' ? 'The Fosterage is full' : phase === 'confirmCapture' ? 'The Fosterage is full' : 'Swap'}>
          <Menu key={phase} items={items} columns={cols} onBack={back} ariaLabel="battle commands" />
          {back && <button className="back-btn" onClick={back}>◀ Back</button>}
        </Panel>
      )}
      {phase === 'command' && active && (
        <div className="xp-bar" aria-label="experience">
          {(() => {
            const sp = CONTENT.species[active.inst.species];
            const g = sp.growth;
            const L = active.inst.level;
            const need = (lv: number) => (g === 'fast' ? Math.floor((4 * lv ** 3) / 5) : g === 'slow' ? Math.floor((5 * lv ** 3) / 4) : lv ** 3);
            const f = L >= 60 ? 1 : (active.inst.xp - need(L)) / Math.max(1, need(L + 1) - need(L));
            return <div style={{ width: `${Math.max(0, Math.min(1, f)) * 100}%` }} />;
          })()}
        </div>
      )}
      {void computeStats}
    </div>
  );
}
