// Tone.js context + bus graph. Loaded lazily by engine.ts after the first user gesture.
//   songs → musicIn(duck) ─┐
//   stingers ──────────────┴→ musicBus ─┐
//   sfx / cries ────────────→ sfxBus ───┴→ master → Compressor(-18 dB, 3:1) → Limiter(-1 dB) → out
import * as Tone from 'tone';
import { useSettings, type Settings } from '../state/settingsStore';

export interface Core {
  raw: AudioContext;
  musicIn: Tone.Volume; // songs go here (ducked under stingers)
  musicBus: Tone.Volume; // music volume setting
  sfxBus: Tone.Volume; // effects + cries volume setting
  master: Tone.Volume;
  musicVerb: Tone.Reverb;
  sfxVerb: Tone.Reverb;
  now(): number;
  dispose(): void;
}

const toDb = (v: number) => (v <= 0.0001 ? -80 : Math.max(-80, 20 * Math.log10(Math.min(1, v))));

export function createCore(raw: AudioContext): Core {
  Tone.setContext(raw);
  const ctx = Tone.getContext();
  try {
    ctx.lookAhead = 0.05;
  } catch {
    /* read-only on some builds */
  }
  const limiter = new Tone.Limiter(-1).toDestination();
  const comp = new Tone.Compressor(-18, 3).connect(limiter);
  const master = new Tone.Volume(0).connect(comp);
  const musicBus = new Tone.Volume(0).connect(master);
  const musicIn = new Tone.Volume(0).connect(musicBus);
  const sfxBus = new Tone.Volume(0).connect(master);
  const musicVerb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 }).connect(musicBus);
  const sfxVerb = new Tone.Reverb({ decay: 1.8, preDelay: 0.01, wet: 1 }).connect(sfxBus);

  const apply = (s: Settings) => {
    try {
      const m = s.muted ? 0 : s.master;
      master.mute = m <= 0.0001;
      master.volume.rampTo(toDb(m), 0.05);
      musicBus.volume.rampTo(toDb(s.music), 0.05);
      sfxBus.volume.rampTo(toDb(s.sfx), 0.05);
    } catch {
      /* ignore */
    }
  };
  apply(useSettings.getState());
  const unsub = useSettings.subscribe((s, p) => {
    if (s.master !== p.master || s.music !== p.music || s.sfx !== p.sfx || s.muted !== p.muted) apply(s);
  });

  // Lifecycle: suspend on hidden tab, resume (and restart the transport where it paused) on return.
  const onVis = () => {
    try {
      const tr = Tone.getTransport();
      if (document.hidden) {
        tr.pause();
        void raw.suspend().catch(() => {});
      } else {
        void raw.resume().then(() => {
          if (tr.state !== 'started') tr.start();
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  };
  document.addEventListener('visibilitychange', onVis);
  // iOS "interrupted" / suspended context resumes on the next gesture.
  const onGesture = () => {
    if (raw.state !== 'running' && !document.hidden) void raw.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture);

  const tr = Tone.getTransport();
  tr.bpm.value = 96;
  tr.start('+0.05');

  return {
    raw, musicIn, musicBus, sfxBus, master, musicVerb, sfxVerb,
    now: () => Tone.now(),
    dispose: () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      for (const n of [limiter, comp, master, musicBus, musicIn, sfxBus, musicVerb, sfxVerb]) n.dispose();
    },
  };
}

/** Keeps trigger times strictly increasing per instrument (Tone sources reject equal start times). */
export function monotonic() {
  let last = 0;
  return (t: number) => {
    const v = Math.max(t, last + 0.003);
    last = v;
    return v;
  };
}
