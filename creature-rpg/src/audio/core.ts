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
  const makeup = new Tone.Volume(6).connect(limiter);
  const comp = new Tone.Compressor(-18, 3).connect(makeup);
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
      for (const n of [limiter, makeup, comp, master, musicBus, musicIn, sfxBus, musicVerb, sfxVerb]) n.dispose();
    },
  };
}

/**
 * Worklet-free pluck (Tone's PluckSynth needs an AudioWorklet, which is not reliable everywhere):
 * a sawtooth through a fast-closing lowpass envelope.
 */
export function pluckSynth(opts: { decay?: number; bright?: number; base?: number; volume?: number } = {}) {
  const decay = opts.decay ?? 0.6;
  return new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', Q: 1.5, rolloff: -24 },
    filterEnvelope: { baseFrequency: opts.base ?? 520, octaves: opts.bright ?? 2.8, attack: 0.001, decay: decay * 0.35, sustain: 0.04, release: 0.2 },
    envelope: { attack: 0.002, decay, sustain: 0.001, release: decay * 0.4 },
    volume: opts.volume ?? -10,
  });
}

// Note: envelopes use sustain 0.001 rather than 0 throughout the audio code. With sustain exactly 0,
// Tone schedules an oscillator stop at attack+decay, and a retrigger inside that window is often cut
// off (verified in headless Chromium: repeated plucks/kicks went silent).

/** Keeps trigger times strictly increasing per instrument (Tone sources reject equal start times). */
export function monotonic() {
  let last = 0;
  return (t: number) => {
    const v = Math.max(t, last + 0.003);
    last = v;
    return v;
  };
}
