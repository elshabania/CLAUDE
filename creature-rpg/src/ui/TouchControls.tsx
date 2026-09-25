// Mobile controls: left virtual joystick, right-half camera drag, contextual buttons.
// Uses pointer events with per-pointer tracking so joystick, camera drag and buttons work simultaneously.
import { useEffect, useRef, useState } from 'react';
import { input } from './input/input';

export function isTouchDevice() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has('touch'));
}

export function TouchControls({ interactLabel, onInteract, onMenu, hidden }: { interactLabel?: string | null; onInteract?: () => void; onMenu?: () => void; hidden?: boolean }) {
  const [enabled] = useState(isTouchDevice);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef<[number, number]>([0, 0]);
  const camIds = useRef(new Map<number, [number, number]>());
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const R = 56;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-touch-btn]')) return;
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      if (e.pointerType === 'mouse') return;
      if (e.clientX < window.innerWidth * 0.45 && joyId.current == null) {
        joyId.current = e.pointerId;
        joyOrigin.current = [e.clientX, e.clientY];
        if (stickRef.current) {
          stickRef.current.style.left = `${e.clientX - R}px`;
          stickRef.current.style.top = `${e.clientY - R}px`;
          stickRef.current.style.opacity = '1';
        }
      } else {
        camIds.current.set(e.pointerId, [e.clientX, e.clientY]);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === joyId.current) {
        let dx = e.clientX - joyOrigin.current[0];
        let dy = e.clientY - joyOrigin.current[1];
        const l = Math.hypot(dx, dy);
        if (l > R) {
          dx = (dx / l) * R;
          dy = (dy / l) * R;
        }
        const dead = 0.12;
        const mag = Math.min(1, l / R);
        const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / Math.max(mag, 1e-6);
        input.joy = [(dx / R) * k, (-dy / R) * k];
        if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (camIds.current.has(e.pointerId)) {
        const [px, py] = camIds.current.get(e.pointerId)!;
        input.camDX += (e.clientX - px) * 1.3;
        input.camDY += (e.clientY - py) * 1.3;
        camIds.current.set(e.pointerId, [e.clientX, e.clientY]);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === joyId.current) {
        joyId.current = null;
        input.joy = [0, 0];
        if (knobRef.current) knobRef.current.style.transform = 'translate(0,0)';
        if (stickRef.current) stickRef.current.style.opacity = '0.45';
      }
      camIds.current.delete(e.pointerId);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up); // touch cancellation (system gesture, call, etc.)
    window.addEventListener('blur', () => {
      joyId.current = null;
      camIds.current.clear();
      input.joy = [0, 0];
    });
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled]);

  useEffect(() => {
    input.touchRun = run;
  }, [run]);

  if (!enabled || hidden) return null;
  const btn: React.CSSProperties = {
    position: 'fixed', width: 64, height: 64, borderRadius: 32, border: '2px solid var(--brass)', background: 'rgba(35,43,61,.82)', color: 'var(--text)',
    font: '600 13px var(--font-ui)', display: 'grid', placeItems: 'center', touchAction: 'none', zIndex: 30,
  };
  return (
    <>
      <div ref={stickRef} style={{ position: 'fixed', left: 'calc(28px + env(safe-area-inset-left))', bottom: 'calc(40px + env(safe-area-inset-bottom))', width: 112, height: 112, borderRadius: 56, border: '2px solid rgba(232,194,122,.6)', background: 'rgba(35,43,61,.35)', opacity: 0.45, pointerEvents: 'none', zIndex: 20 }}>
        <div ref={knobRef} style={{ position: 'absolute', left: 32, top: 32, width: 48, height: 48, borderRadius: 24, background: 'rgba(232,194,122,.85)' }} />
      </div>
      {interactLabel && (
        <button data-touch-btn aria-label={interactLabel} style={{ ...btn, right: 'calc(24px + env(safe-area-inset-right))', bottom: 'calc(120px + env(safe-area-inset-bottom))', width: 76, height: 76, borderRadius: 38, borderColor: 'var(--resonance)' }} onPointerDown={(e) => { e.preventDefault(); onInteract ? onInteract() : input.emit('interact'); }}>
          {interactLabel}
        </button>
      )}
      <button data-touch-btn aria-label="Run" aria-pressed={run} style={{ ...btn, right: 'calc(110px + env(safe-area-inset-right))', bottom: 'calc(40px + env(safe-area-inset-bottom))', background: run ? 'rgba(200,150,62,.9)' : btn.background }} onPointerDown={(e) => { e.preventDefault(); setRun((r) => !r); }}>
        Run
      </button>
      <button data-touch-btn aria-label="Menu" style={{ ...btn, right: 'calc(24px + env(safe-area-inset-right))', bottom: 'calc(40px + env(safe-area-inset-bottom))' }} onPointerDown={(e) => { e.preventDefault(); onMenu ? onMenu() : input.emit('menu'); }}>
        Menu
      </button>
    </>
  );
}
