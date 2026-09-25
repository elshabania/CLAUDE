// Shared UI primitives: fork-notch panels, keyboard-navigable menus, type chips, HP "resonance string".
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TYPE_META, STATUS_NAMES } from '../battle/text';
import type { MajorStatus } from '../sim/types';
import { sfx } from '../audio/sfxBus';
import { useSettings } from '../state/settingsStore';

export function Panel({ children, style, className, title }: { children: ReactNode; style?: CSSProperties; className?: string; title?: string }) {
  return (
    <div className={'panel ' + (className ?? '')} style={style} data-ui>
      {title && <div className="panel-title">{title}</div>}
      {children}
    </div>
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
  onSelect: () => void;
}

/** Vertical/grid menu with arrow-key + Enter/Space navigation, Escape = onBack. Focus ring always visible. */
export function Menu({ items, onBack, columns = 1, autoFocus = true, initial = 0, style, ariaLabel }: { items: MenuItem[]; onBack?: () => void; columns?: number; autoFocus?: boolean; initial?: number; style?: CSSProperties; ariaLabel?: string }) {
  const [idx, setIdx] = useState(Math.min(initial, Math.max(0, items.length - 1)));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus) refs.current[idx]?.focus({ preventScroll: true });
  }, [idx, autoFocus]);
  useEffect(() => {
    if (idx >= items.length) setIdx(Math.max(0, items.length - 1));
  }, [items.length, idx]);
  const move = (d: number) => {
    let n = idx;
    for (let i = 0; i < items.length; i++) {
      n = (n + d + items.length) % items.length;
      if (!items[n].disabled) break;
    }
    setIdx(n);
    sfx('ui_move');
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); e.stopPropagation(); move(columns); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); e.stopPropagation(); move(-columns); }
    else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && columns > 1) { e.preventDefault(); e.stopPropagation(); move(1); }
    else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && columns > 1) { e.preventDefault(); e.stopPropagation(); move(-1); }
    else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); if (onBack) { sfx('ui_back'); onBack(); } }
  };
  return (
    <div role="menu" aria-label={ariaLabel} className="menu" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6, ...style }} onKeyDown={onKey} data-ui>
      {items.map((it, i) => (
        <button
          key={it.key}
          ref={(el) => { refs.current[i] = el; }}
          role="menuitem"
          className={'menu-item' + (i === idx ? ' sel' : '')}
          aria-disabled={it.disabled}
          disabled={it.disabled}
          title={it.hint}
          onMouseEnter={() => !it.disabled && setIdx(i)}
          onFocus={() => setIdx(i)}
          onClick={() => {
            if (it.disabled) return;
            sfx('ui_confirm');
            it.onSelect();
          }}
        >
          <span className="caret" aria-hidden>{i === idx ? '▶' : ''}</span>
          <span className="menu-label">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TypeChip({ type }: { type: string }) {
  const m = TYPE_META[type] ?? TYPE_META.none;
  const dark = ['shade', 'water', 'fire', 'toxin', 'verdant', 'stone'].includes(type);
  return (
    <span className="chip" style={{ background: m.color, color: dark ? '#F7F3EA' : '#1E2433' }} aria-label={m.name + ' type'}>
      <span aria-hidden className="glyph">{m.glyph}</span> {m.code}
    </span>
  );
}

export function StatusChip({ status }: { status: MajorStatus | null }) {
  if (!status) return null;
  const m = STATUS_NAMES[status];
  return (
    <span className="chip status" style={{ background: m.color, color: '#1E2433' }} aria-label={m.name}>
      <span aria-hidden>{m.shape}</span> {m.code}
    </span>
  );
}

/** HP meter as a vibrating "resonance string": pattern changes with HP band so it reads without colour. */
export function HpString({ hp, max, showNumbers }: { hp: number; max: number; showNumbers: boolean }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const [disp, setDisp] = useState(hp);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setDisp((d) => {
        const diff = hp - d;
        if (Math.abs(diff) < 0.5) return hp;
        raf = requestAnimationFrame(step);
        return d + diff * 0.18;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hp]);
  const f = Math.max(0, Math.min(1, disp / Math.max(1, max)));
  const band = f > 0.5 ? 'high' : f >= 0.2 ? 'mid' : 'low';
  const color = band === 'high' ? 'var(--resonance)' : band === 'mid' ? 'var(--brass)' : 'var(--alert)';
  const dash = band === 'high' ? 'none' : band === 'mid' ? '6 3' : '2 3';
  return (
    <div className="hp" aria-label={`HP ${Math.round(hp)} of ${max}`}>
      <svg width="100%" height="14" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden>
        <line x1="2" y1="7" x2="198" y2="7" stroke="rgba(255,255,255,.15)" strokeWidth="4" />
        <line x1="2" y1="7" x2={2 + 196 * f} y2="7" stroke={color} strokeWidth="5" strokeDasharray={dash} className={reduced ? '' : 'wobble'} strokeLinecap="round" />
      </svg>
      <span className="hp-num">{band === 'low' && <span aria-hidden>⚠ </span>}{showNumbers ? `HP ${Math.round(disp)}/${max}` : `${Math.round(f * 100)}%`}</span>
    </div>
  );
}
