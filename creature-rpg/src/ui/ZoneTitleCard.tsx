// Zone title card: the zone's name drifts in for ~2.5 s on entry (remount via key per zone entry).
// Pure CSS animation; reduced motion swaps it for a plain opacity fade.
import { useEffect, useState } from 'react';
import { useSettings } from '../state/settingsStore';

const DURATION = 2600;

export function ZoneTitleCard({ name, ready = true, hidden = false }: { name: string; ready?: boolean; hidden?: boolean }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const [state, setState] = useState<'wait' | 'show' | 'done'>('wait');
  useEffect(() => {
    if (state !== 'wait' || !ready) return;
    setState('show');
  }, [ready, state]);
  useEffect(() => {
    if (state !== 'show') return;
    const id = setTimeout(() => setState('done'), DURATION);
    return () => clearTimeout(id);
  }, [state]);
  if (state !== 'show' || hidden) return null;
  return (
    <div className={'zone-card' + (reduced ? ' reduced' : '')} role="status" aria-live="polite" style={{ animationDuration: `${DURATION}ms` }}>
      <div className="zone-card-rule" aria-hidden>
        <span />✦<span />
      </div>
      <div className="zone-card-name">{name}</div>
    </div>
  );
}
