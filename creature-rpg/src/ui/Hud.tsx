import { useEffect, useState } from 'react';
import { useGame, fillText } from '../state/game';
import { ZONES } from '../data/zones';
import { CONTENT } from '../data/index';
import { computeStats } from '../sim/stats';
import { timePhase } from '../sim/world';
import { input } from './input/input';
import { isTouchDevice } from './TouchControls';
import { Menu } from './components';
import { useSettings } from '../state/settingsStore';

export function Hud() {
  const zoneId = useGame((s) => s.zoneId);
  const save = useGame((s) => s.save);
  const hint = useGame((s) => s.interactHint);
  const mode = useGame((s) => s.mode);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!save || mode === 'battle' || mode === 'title') return null;
  const z = ZONES[zoneId];
  const mins = Math.floor(save.clockMinutes % 1440);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  const phase = timePhase(save.clockMinutes);
  const touch = isTouchDevice();
  return (
    <div className="hud" data-ui>
      <div className="hud-top">
        <div className="hud-zone">{z?.name ?? zoneId}</div>
        <div className="hud-meta" aria-label="time">{phase === 'night' ? '☾' : phase === 'day' ? '☀' : '◐'} {hh}:{mm}</div>
        <div className="hud-meta" aria-label="tallies">◇ {save.player.money.toLocaleString()}</div>
      </div>
      {hint && mode === 'explore' && (
        <div className="hud-prompt" role="button" onClick={() => input.emit('interact')}>
          {!touch && <kbd>E</kbd>}
          {hint}
        </div>
      )}
      {mode === 'explore' && (
        <div className="party-strip" aria-label="troupe">
          {save.party.map((u) => {
            const i = save.instances[u];
            const max = computeStats(CONTENT, i).hp;
            const f = i.hp / max;
            return (
              <div key={u} className={'party-dot' + (i.hp <= 0 ? ' out' : f < 0.25 ? ' low' : '')} title={`${CONTENT.species[i.species].name} HP ${i.hp}/${max}`}>
                {CONTENT.species[i.species].name.slice(0, 5)}
                <br />
                {i.hp}/{max}
              </div>
            );
          })}
        </div>
      )}
      {!touch && mode === 'explore' && <div className="hud-meta" style={{ position: 'absolute', right: 10, bottom: 10, opacity: 0.7 }}>WASD move · Shift run · drag/mouse look · E interact · Tab menu · M map · J journal</div>}
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const banner = useGame((s) => s.banner);
  return (
    <div className="hud" style={{ zIndex: 35 }}>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind ?? '')}>{t.text}</div>
        ))}
      </div>
      {banner && (
        <div className="banner" role="alert">
          {banner} <button onClick={() => useGame.setState({ mode: 'menu', menuTab: 'save' })} style={{ marginLeft: 8, background: 'none', border: '1px solid #fff', padding: '2px 8px', cursor: 'pointer' }}>Export</button>
        </div>
      )}
    </div>
  );
}

export function DialogueBox() {
  const d = useGame((s) => s.dialogue);
  const advance = useGame((s) => s.advance);
  const choose = useGame((s) => s.choose);
  const [shown, setShown] = useState(0);
  const line = d?.lines[d.index];
  useEffect(() => {
    if (!line) return;
    setShown(0);
    const { textSpeed } = useSettings.getState();
    if (textSpeed === 'instant') {
      setShown(line.t.length);
      return;
    }
    const per = textSpeed === 'slow' ? 40 : 18;
    const id = setInterval(() => setShown((n) => (n >= line.t.length ? (clearInterval(id), n) : n + 1)), per);
    return () => clearInterval(id);
  }, [line]);
  useEffect(() => {
    const off = input.on((a) => {
      const g = useGame.getState();
      if (g.mode !== 'dialogue' || !g.dialogue || g.dialogue.choiceOpen) return;
      if (a === 'confirm' || a === 'interact') {
        const cur = g.dialogue.lines[g.dialogue.index];
        if (shownRef.n < cur.t.length) {
          setShown(cur.t.length);
          return;
        }
        advance();
      }
    });
    return () => {
      off();
    };
  }, [advance]);
  shownRef.n = shown;
  if (!d || !line) return null;
  const done = shown >= line.t.length;
  return (
    <div
      className="dialogue"
      data-ui
      role="dialog"
      aria-live="polite"
      onClick={() => {
        if (d.choiceOpen) return;
        if (!done) setShown(line.t.length);
        else advance();
      }}
    >
      {line.s && <div className="speaker">{line.s}</div>}
      <div className="text">{line.t.slice(0, shown)}</div>
      {!d.choiceOpen && done && <div className="more" aria-hidden>▼</div>}
      {d.choiceOpen && d.variant.choice && (
        <div className="choices" onClick={(e) => e.stopPropagation()}>
          <Menu items={d.variant.choice.options.map((o, i) => ({ key: String(i), label: fillText(o.label, useGame.getState().save), onSelect: () => choose(i) }))} />
        </div>
      )}
    </div>
  );
}
const shownRef = { n: 0 };
