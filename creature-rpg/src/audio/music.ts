// Generative music: per-song step sequencer on Tone.Transport, crossfades, battle layers, stingers.
import * as Tone from 'tone';
import type { Core } from './core';
import { monotonic } from './core';
import { BASS, battleSong, chordIdx, genMelody, mtof, mulberry, resolveSong, scaleMidi, type LeadKind, type MelNote, type PadKind, type SongDef } from './songs';

type Node = { dispose(): unknown };
interface Inst {
  play(m: number | number[], dur: number, t: number, vel: number): void;
  nodes: Node[];
  filter?: Tone.Filter;
}

function inst(nodes: Node[], fn: (m: number | number[], dur: number, t: number, vel: number) => void, filter?: Tone.Filter): Inst {
  const mono = monotonic();
  return {
    nodes,
    filter,
    play: (m, d, t, v) => {
      try {
        fn(m, d, mono(t), v);
      } catch {
        /* a dropped note never breaks the loop */
      }
    },
  };
}
const one = (m: number | number[]) => (Array.isArray(m) ? m[0] : m);

function makeLead(kind: LeadKind, dest: Tone.InputNode, send: Tone.InputNode, echo: boolean, db = 0): Inst | null {
  const extra: Node[] = [];
  const route = (src: Tone.ToneAudioNode, wet: number) => {
    let out: Tone.ToneAudioNode = src;
    if (echo) {
      const fd = new Tone.FeedbackDelay({ delayTime: 0.4, feedback: 0.35, wet: 0.35 });
      src.connect(fd);
      out = fd;
      extra.push(fd);
    }
    out.connect(dest);
    if (wet > 0) {
      const g = new Tone.Gain(wet).connect(send);
      out.connect(g);
      extra.push(g);
    }
  };
  switch (kind) {
    case 'glass':
    case 'glass_dry': {
      const s = new Tone.FMSynth({
        harmonicity: 3.01, modulationIndex: 8, oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.6, sustain: 0.2, release: kind === 'glass' ? 0.9 : 0.15 },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 0.4 }, volume: -15 + db,
      });
      route(s, kind === 'glass' ? 0.4 : 0);
      return inst([s, ...extra], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    case 'reed':
    case 'reed_flutter': {
      const vib = new Tone.Vibrato(kind === 'reed' ? 5 : 9, kind === 'reed' ? 0.1 : 0.22);
      const s = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 2, rolloff: -24 },
        filterEnvelope: { baseFrequency: 900, octaves: 1, attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.3 },
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.7, release: 0.25 }, portamento: 0.02, volume: -20 + db,
      });
      s.connect(vib);
      route(vib, 0.2);
      return inst([s, vib, ...extra], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    case 'saw': {
      const s = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 4, rolloff: -24 },
        filterEnvelope: { baseFrequency: 260, octaves: 3.5, attack: 0.03, decay: 0.25, sustain: 0.3, release: 0.3 },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 }, volume: -20 + db,
      });
      route(s, 0.15);
      return inst([s, ...extra], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    case 'brass': {
      const s = new Tone.FMSynth({
        harmonicity: 1, modulationIndex: 3.5, oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.4 }, modulationEnvelope: { attack: 0.08, decay: 0.3, sustain: 0.5, release: 0.3 }, volume: -16 + db,
      });
      route(s, 0.3);
      return inst([s, ...extra], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    case 'pluck':
    case 'mute': {
      const s = new Tone.PluckSynth(kind === 'pluck' ? { attackNoise: 1, dampening: 3500, resonance: 0.9, volume: -6 + db } : { attackNoise: 0.5, dampening: 1400, resonance: 0.72, volume: -3 + db });
      route(s, kind === 'pluck' ? 0.25 : 0);
      return inst([s, ...extra], (m, d, t) => s.triggerAttackRelease(mtof(one(m)), d, t));
    }
    case 'bell': {
      const s = new Tone.FMSynth({
        harmonicity: 5.07, modulationIndex: 10, oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 }, modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 }, volume: -18 + db,
      });
      route(s, 0.4);
      return inst([s, ...extra], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    default:
      return null;
  }
}

const PAD_FILTER: Record<PadKind, number> = { warm: 2400, light: 4000, chorus: 3000, organ: 3000, murky: 900, shimmer: 6000, bright: 6000, airy: 300, dark: 1400, aurora: 1600, cold: 3200, full: 5000, noise: 600, none: 0 };

function makePad(kind: PadKind, dest: Tone.InputNode, send: Tone.InputNode, battle: boolean): Inst | null {
  if (kind === 'none') return null;
  if (kind === 'noise') {
    const n = new Tone.Noise('pink');
    const f = new Tone.Filter({ type: 'bandpass', frequency: 600, Q: 0.8 });
    const lfo = new Tone.LFO(0.05, 300, 1400).connect(f.frequency);
    const v = new Tone.Volume(-30).connect(dest);
    n.chain(f, v);
    n.start();
    lfo.start();
    return inst([n, f, lfo, v], () => {});
  }
  const poly = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: kind === 'organ' ? 2 : 1.5, oscillator: { type: kind === 'organ' ? 'sine' : 'triangle' }, modulation: { type: 'sine' },
    envelope: { attack: kind === 'organ' ? 0.2 : 0.8, decay: 0.5, sustain: 0.8, release: 2 },
    modulationEnvelope: { attack: 0.5, decay: 0.3, sustain: 1, release: 1.5 },
  });
  poly.maxPolyphony = 6;
  poly.volume.value = kind === 'full' ? -19 : -22;
  const nodes: Node[] = [poly];
  let head: Tone.ToneAudioNode = poly;
  if (kind === 'chorus' || kind === 'shimmer' || kind === 'warm' || kind === 'full') {
    const ch = new Tone.Chorus(1.5, 3.5, 0.5).start();
    poly.connect(ch);
    head = ch;
    nodes.push(ch);
  }
  const filter = new Tone.Filter({ type: kind === 'airy' ? 'highpass' : 'lowpass', frequency: battle ? 1200 : PAD_FILTER[kind], Q: 0.5 });
  head.connect(filter);
  filter.connect(dest);
  nodes.push(filter);
  if (kind === 'aurora') {
    const lfo = new Tone.LFO(0.06, 700, 2600).connect(filter.frequency).start();
    nodes.push(lfo);
  }
  if (kind === 'shimmer' || kind === 'aurora' || kind === 'airy' || kind === 'chorus' || kind === 'warm') {
    const g = new Tone.Gain(0.35).connect(send);
    filter.connect(g);
    nodes.push(g);
  }
  return inst(nodes, (m, d, t, v) => poly.triggerAttackRelease((Array.isArray(m) ? m : [m]).map(mtof), d, t, v), filter);
}

interface Kit {
  kick?: Inst; tom?: Inst; snare?: Inst; hat?: Inst; metal?: Inst; bell?: Inst; click?: Inst; swell?: Inst;
}

function makeKit(d: SongDef, dest: Tone.InputNode, send: Tone.InputNode): Kit {
  const p = d.perc;
  const k: Kit = {};
  const needKick = !!p.k || d.battle;
  if (needKick) {
    const kind = p.kick ?? 'soft';
    const s = new Tone.MembraneSynth({
      pitchDecay: kind === 'taiko' ? 0.08 : kind === 'log' ? 0.02 : 0.04, octaves: kind === 'log' ? 1.5 : kind === 'taiko' ? 2.5 : 3.5,
      envelope: { attack: 0.001, decay: kind === 'taiko' ? 0.7 : kind === 'sub' ? 0.5 : 0.3, sustain: 0, release: 0.1 }, volume: kind === 'log' ? -10 : -7,
    }).connect(dest);
    const f = kind === 'taiko' ? 52 : kind === 'sub' ? 41 : kind === 'log' ? 110 : 55;
    k.kick = inst([s], (_m, dd, t, v) => s.triggerAttackRelease(f, dd, t, v));
  }
  if (p.t) {
    const s = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 2, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }, volume: -12 }).connect(dest);
    k.tom = inst([s], (m, dd, t, v) => s.triggerAttackRelease(one(m), dd, t, v));
  }
  if (p.s || d.battle) {
    const f = new Tone.Filter({ type: 'bandpass', frequency: 2200, Q: 0.8 }).connect(dest);
    const s = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.13, sustain: 0, release: 0.05 }, volume: d.battle ? -14 : -18 }).connect(f);
    k.snare = inst([s, f], (_m, dd, t, v) => s.triggerAttackRelease(dd, t, v));
  }
  if (p.h || d.battle) {
    const f = new Tone.Filter({ type: 'highpass', frequency: 7000 }).connect(dest);
    const s = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 }, volume: -26 }).connect(f);
    k.hat = inst([s, f], (_m, dd, t, v) => s.triggerAttackRelease(dd, t, v));
  }
  if (p.m) {
    const s = new Tone.MetalSynth({ harmonicity: 5.1, resonance: 3000, modulationIndex: 20, octaves: 1.2, envelope: { attack: 0.001, decay: 0.08, release: 0.05 }, volume: -32 }).connect(dest);
    k.metal = inst([s], (m, dd, t, v) => s.triggerAttackRelease(one(m), dd, t, v));
  }
  if (p.bellEvery || d.hallBell) {
    const b = makeLead('bell', dest, send, false, -3);
    if (b) k.bell = b;
  }
  if (p.c || p.rand) {
    const echo = p.rand === 'drip' ? new Tone.FeedbackDelay({ delayTime: 0.33, feedback: 0.4, wet: 0.4 }).connect(dest) : null;
    const s = new Tone.Synth({ oscillator: { type: p.rand === 'frog' ? 'triangle' : 'sine' }, envelope: { attack: 0.001, decay: p.rand === 'drip' ? 0.09 : 0.035, sustain: 0, release: 0.03 }, volume: p.rand === 'drip' ? -20 : -24 });
    s.connect(echo ?? dest);
    k.click = inst(echo ? [s, echo] : [s], (m, dd, t, v) => s.triggerAttackRelease(one(m), dd, t, v));
  }
  if (p.swell) {
    const f = new Tone.Filter({ type: 'bandpass', frequency: 3200, Q: 0.6 }).connect(dest);
    const s = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.9, decay: 0.3, sustain: 0.5, release: 1.2 }, volume: -32 }).connect(f);
    k.swell = inst([s, f], (_m, dd, t, v) => s.triggerAttackRelease(dd, t, v));
  }
  return k;
}

const hit = (pat: string | undefined, s: number) => {
  const c = pat?.[s];
  return c === 'x' ? 0.9 : c === 'o' ? 0.45 : 0;
};

class Song {
  readonly key: string;
  readonly def: SongDef;
  private bus = new Tone.Gain(1);
  private sendBus: Tone.Gain;
  private filter: Tone.Filter;
  private out = new Tone.Volume(-60);
  private loop: Tone.Loop;
  private lead: Inst | null;
  private lead2: Inst | null = null;
  private arp: Inst | null = null;
  private pad: Inst | null;
  private bass: Inst | null = null;
  private bassFilter: Tone.Filter | null = null;
  private kit: Kit;
  private extra: Node[] = [];
  private mel: MelNote[][];
  private mel2: MelNote[][] | null = null;
  private step = 0;
  private rng: () => number;
  private intensity = false;
  private wantIntensity = false;
  private disposed = false;
  private bars: number;

  constructor(key: string, def: SongDef, core: Core) {
    this.key = key;
    this.def = def;
    this.rng = mulberry(def.seed + 3);
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: def.songFilter ?? 18000, Q: 0.4 });
    this.bus.chain(this.filter, this.out, core.musicIn);
    this.sendBus = new Tone.Gain(0).connect(core.musicVerb);
    const dest = this.bus;
    const send = this.sendBus;
    this.mel = genMelody(def);
    this.bars = this.mel.length;
    this.lead = makeLead(def.lead, dest, send, !!def.delay, def.leadDb ?? 0);
    if (def.lead2) this.lead2 = makeLead(def.lead2, dest, send, !!def.delay, (def.leadDb ?? 0) - (def.lead2Role === 'unison' ? 5 : 1));
    if (def.phaseB) this.mel2 = genMelody({ ...def, motif: 'chord', seed: def.seed + 1 });
    if (def.arp || def.counter) this.arp = makeLead('pluck', dest, send, false, -6);
    this.pad = makePad(def.pad, dest, send, !!def.battle);
    if (def.bass !== 'none') {
      const wave = def.bassWave ?? 'triangle';
      this.bassFilter = new Tone.Filter({ type: 'lowpass', frequency: def.battle ? 1000 : 2400, Q: 1 }).connect(dest);
      const s = new Tone.MonoSynth({
        oscillator: { type: wave }, filter: { type: 'lowpass', Q: 1 },
        filterEnvelope: { baseFrequency: 160, octaves: 2.6, attack: 0.005, decay: 0.2, sustain: 0.35, release: 0.3 },
        envelope: { attack: 0.008, decay: 0.25, sustain: 0.6, release: 0.2 }, portamento: 0.03, volume: wave === 'triangle' ? -9 : -19,
      }).connect(this.bassFilter);
      this.bass = inst([s, this.bassFilter], (m, d, t, v) => s.triggerAttackRelease(mtof(one(m)), d, t, v));
    }
    this.kit = makeKit(def, dest, send);
    const root = scaleMidi(def, 0, 2);
    if (def.drone) {
      const osc = new Tone.FatOscillator({ type: 'sawtooth', count: 3, spread: 20, frequency: mtof(root) });
      const f = new Tone.Filter({ type: 'lowpass', frequency: 400 });
      const v = new Tone.Volume(-28).connect(dest);
      osc.chain(f, v);
      osc.start();
      this.extra.push(osc, f, v);
    }
    if (def.wind) {
      const n = new Tone.Noise('pink');
      const f = new Tone.Filter({ type: 'bandpass', frequency: 700, Q: 0.7 });
      const lfo = new Tone.LFO(0.07, 300, 1500).connect(f.frequency).start();
      const v = new Tone.Volume(-34).connect(dest);
      n.chain(f, v);
      n.start();
      this.extra.push(n, f, lfo, v);
    }
    this.loop = new Tone.Loop((time) => this.tick(time), '16n').start(0);
  }

  fadeIn(sec: number) {
    this.out.volume.rampTo(0, Math.max(0.05, sec));
    this.sendBus.gain.rampTo(1, Math.max(0.05, sec));
  }

  fadeOut(sec: number, onDone?: () => void) {
    this.out.volume.rampTo(-60, Math.max(0.05, sec));
    this.sendBus.gain.rampTo(0, Math.max(0.05, sec));
    setTimeout(() => {
      this.dispose();
      onDone?.();
    }, sec * 1000 + 150);
  }

  setIntensity(on: boolean) {
    this.wantIntensity = on;
  }

  openPhaseB() {
    this.filter.frequency.rampTo(18000, 2);
  }

  private tick(time: number) {
    if (this.disposed) return;
    try {
      this.tickInner(time);
    } catch {
      /* never break the transport */
    }
    this.step++;
  }

  private tickInner(time: number) {
    const d = this.def;
    const s = this.step % 16;
    const bar = Math.floor(this.step / 16) % this.bars;
    const sd = Tone.Time('16n').toSeconds();
    const deg = d.prog[bar % d.prog.length];
    const nextDeg = d.prog[(bar + 1) % d.prog.length];
    const ci = chordIdx(deg);
    if (s === 0) {
      if (this.wantIntensity !== this.intensity && d.battle) {
        this.intensity = this.wantIntensity;
        const f = this.intensity ? 4000 : 1200;
        this.pad?.filter?.frequency.rampTo(f, 0.4);
        this.bassFilter?.frequency.rampTo(this.intensity ? 4000 : 1000, 0.4);
      }
      if (this.pad) {
        const notes = ci.map((x) => {
          let m = scaleMidi(d, x, 3);
          while (m < 52) m += 12;
          while (m >= 70) m -= 12;
          return m;
        });
        if (this.intensity) notes.push(scaleMidi(d, deg, 4) + 8);
        this.pad.play(notes, sd * 15.5, time, 0.5);
      }
      const k = this.kit;
      if (k.bell && ((d.perc.bellEvery && bar % d.perc.bellEvery === 0) || (d.hallBell && bar % 8 === 0))) k.bell.play(scaleMidi(d, 0, 6), 1.5, time, 0.55);
      if (k.swell && d.perc.swell && bar % d.perc.swell === 0) k.swell.play(0, sd * 14, time, 0.6);
    }
    // melody
    const lead2Answers = d.lead2Role === 'answer' && !d.phaseB;
    for (const n of this.mel[bar]) {
      if (n.step !== s) continue;
      const m = scaleMidi(d, n.idx, d.leadOct);
      const dur = n.dur * sd * 0.92;
      if (lead2Answers && this.lead2 && bar % 2 === 1) this.lead2.play(m, dur, time, n.vel);
      else this.lead?.play(m, dur, time, n.vel);
      if (d.lead2Role === 'unison' && this.lead2) this.lead2.play(m - (d.lead2 === 'reed' ? 12 : 0), dur, time, n.vel * 0.8);
    }
    if (this.mel2 && this.lead2) for (const n of this.mel2[bar]) if (n.step === s) this.lead2.play(scaleMidi(d, n.idx, 5), n.dur * sd * 0.9, time, n.vel * 0.8);
    // arpeggio / counter-melody
    if (this.arp) {
      const rate = d.arp === 'pluck16' ? 1 : 2;
      if (d.counter ? s % 4 === 2 : s % rate === 0) {
        const pat = [0, 1, 2, 3, 2, 1, 0, 1];
        const i = pat[(s / rate) % pat.length | 0];
        const idx = i === 3 ? deg + 7 : ci[i];
        this.arp.play(scaleMidi(d, idx, d.counter ? 5 : 4), sd * 2, time, 0.5);
      }
    }
    // bass
    if (this.bass) {
      for (const [st, tone, du] of BASS[d.bass]) {
        if (st !== s) continue;
        let idx = 0;
        if (tone === 't') idx = 0;
        else if (tone === 'a') idx = nextDeg - 1;
        else if (tone[0] === 'c') idx = tone[1] === '3' ? deg + 7 : ci[+tone[1]];
        else if (tone[0] === 's') idx = deg + +tone.slice(1);
        this.bass.play(scaleMidi(d, idx, d.bassOct ?? 2), du * sd * 0.9, time, 0.8);
      }
      if (this.intensity && s % 4 === 2) this.bass.play(scaleMidi(d, deg + 7, d.bassOct ?? 2), sd * 0.9, time, 0.6);
    }
    // percussion
    const k = this.kit;
    const p = d.perc;
    const kv = hit(p.k, s) || (d.battle && !p.k ? hit('x.......x.......', s) : 0) || (this.intensity && s === 10 ? 0.7 : 0);
    if (kv && k.kick) k.kick.play(0, 0.2, time, kv);
    const sv = hit(p.s, s);
    if (sv && k.snare) k.snare.play(0, 0.1, time, sv);
    const hv = hit(p.h, s) || (this.intensity ? (s % 2 ? 0.35 : 0.6) : 0);
    if (hv && k.hat) k.hat.play(0, 0.03, time, hv);
    const tv = hit(p.t, s);
    if (tv && k.tom) k.tom.play(mtof(scaleMidi(d, 0, 2) + 7), 0.2, time, tv);
    const mv = hit(p.m, s);
    if (mv && k.metal) k.metal.play(mtof(scaleMidi(d, 4, 5)), 0.05, time, mv);
    const cv = hit(p.c, s);
    if (cv && k.click) k.click.play(s % 8 === 0 ? 2400 : 1900, 0.02, time, cv * 0.6);
    if (k.click && p.rand === 'drip' && this.rng() < 0.06) k.click.play(mtof(scaleMidi(d, Math.floor(this.rng() * 7), 6)), 0.05, time, 0.4);
    if (k.click && p.rand === 'frog' && this.rng() < 0.08) {
      k.click.play(170 + this.rng() * 40, 0.03, time, 0.5);
      k.click.play(210 + this.rng() * 40, 0.03, time + 0.05, 0.4);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.loop.dispose();
    } catch {
      /* ignore */
    }
    const all: Node[] = [...this.extra];
    for (const i of [this.lead, this.lead2, this.arp, this.pad, this.bass, ...Object.values(this.kit)]) if (i) all.push(...i.nodes);
    all.push(this.bus, this.filter, this.out, this.sendBus);
    for (const n of all) {
      try {
        n.dispose();
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------- Stingers ----------

interface StingerKit {
  glass: Tone.FMSynth;
  poly: Tone.PolySynth;
  pad: Tone.PolySynth;
  padFilter: Tone.Filter;
  pluck: Tone.PluckSynth;
  bowl: Tone.PolySynth;
}

const D = 62; // D4

export class Music {
  private core: Core;
  private alive: Song[] = [];
  private current: Song | null = null;
  private zoneWanted: string | null = null;
  private zoneDef: SongDef | undefined;
  private battleActive = false;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;
  private duckTimer: ReturnType<typeof setTimeout> | undefined;
  private sk: StingerKit | null = null;
  private stingerMono = monotonic();

  constructor(core: Core) {
    this.core = core;
  }

  private play(key: string, def: SongDef, fade: number) {
    if (this.current?.key === key) return;
    const prev = this.current;
    // A→B→A: revive A if it is still fading out
    const revive = this.alive.find((s) => s.key === key && s !== prev);
    // keep at most two songs alive
    for (const s of this.alive) if (s !== prev && s !== revive) s.dispose();
    this.alive = this.alive.filter((s) => s === prev || s === revive);
    if (prev) prev.fadeOut(fade, () => (this.alive = this.alive.filter((s) => s !== prev)));
    const tr = Tone.getTransport();
    tr.bpm.rampTo(def.bpm, Math.max(0.1, fade * 0.8));
    tr.swing = def.swing ?? 0;
    tr.swingSubdivision = '16n';
    if (revive) {
      this.current = revive;
      revive.fadeIn(fade);
      return;
    }
    const song = new Song(key, def, this.core);
    this.alive.push(song);
    this.current = song;
    song.fadeIn(fade);
  }

  private stop(fade: number) {
    const prev = this.current;
    this.current = null;
    if (prev) prev.fadeOut(fade, () => (this.alive = this.alive.filter((s) => s !== prev)));
  }

  zone(id: string | null) {
    this.zoneWanted = id;
    if (this.battleActive || this.resumeTimer) return;
    this.applyZone(1.5);
  }

  private applyZone(fade: number) {
    const id = this.zoneWanted;
    if (!id) return this.stop(fade);
    const { key, def } = resolveSong(id);
    this.zoneDef = def;
    this.play('zone:' + key, def, fade);
  }

  battle(kind: string, cantorType?: string) {
    clearTimeout(this.resumeTimer);
    this.resumeTimer = undefined;
    if (kind === 'odile_b' && this.current?.key === 'battle:odile') {
      this.current.openPhaseB();
    }
    this.battleActive = true;
    this.play('battle:' + kind + (cantorType ? ':' + cantorType : ''), battleSong(kind, cantorType, this.zoneDef), 0.4);
  }

  intensity(high: boolean) {
    if (this.battleActive) this.current?.setIntensity(high);
  }

  endBattle(stinger: 'victory' | 'capture' | 'none') {
    if (!this.battleActive) return;
    this.battleActive = false;
    this.stop(stinger === 'none' ? 0.8 : 0.4);
    const wait = stinger === 'none' ? 600 : this.stinger(stinger) * 1000;
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = undefined;
      if (!this.battleActive) this.applyZone(1.5);
    }, wait);
  }

  private kit(): StingerKit {
    if (this.sk) return this.sk;
    const dest = this.core.musicBus;
    const verb = this.core.musicVerb;
    const glass = new Tone.FMSynth({
      harmonicity: 3.01, modulationIndex: 8, envelope: { attack: 0.005, decay: 0.6, sustain: 0.25, release: 1.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.6 }, volume: -12,
    });
    const poly = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.4, release: 1.4 } });
    poly.maxPolyphony = 8;
    poly.volume.value = -18;
    const pad = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.5, oscillator: { type: 'triangle' }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 2 } });
    pad.maxPolyphony = 6;
    pad.volume.value = -18;
    const padFilter = new Tone.Filter({ type: 'lowpass', frequency: 4000 });
    pad.connect(padFilter);
    const pluck = new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.92, volume: -4 });
    const bowl = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 2.8, sustain: 0, release: 2 } });
    bowl.maxPolyphony = 16;
    bowl.volume.value = -16;
    const sendG = new Tone.Gain(0.35).connect(verb);
    for (const n of [glass, poly, padFilter, pluck, bowl]) {
      n.connect(dest);
      n.connect(sendG);
    }
    this.sk = { glass, poly, pad, padFilter, pluck, bowl };
    return this.sk;
  }

  /** Plays a stinger; returns its duration in seconds. Ducks zone/battle music meanwhile. */
  stinger(id: string): number {
    const k = this.kit();
    const t0 = this.core.now() + 0.05;
    const mono = this.stingerMono;
    const f = mtof;
    const g = (m: number, d: number, t: number, v = 0.8) => k.glass.triggerAttackRelease(f(m), d, mono(t0 + t), v);
    const pl = (m: number, t: number, d = 0.4) => k.pluck.triggerAttackRelease(f(m), d, t0 + t);
    const ch = (ms: number[], d: number, t: number, v = 0.6) => k.poly.triggerAttackRelease(ms.map(f), d, t0 + t, v);
    const pad = (ms: number[], d: number, t: number, v = 0.6) => k.pad.triggerAttackRelease(ms.map(f), d, t0 + t, v);
    // bowl / bell: inharmonic partials of a struck bowl
    const bowl = (m: number, t: number, v = 0.7, ratios = [1, 2.76, 5.4, 8.93]) => {
      const base = f(m);
      k.bowl.triggerAttackRelease(ratios.map((r) => base * r), 1.2, t0 + t, v);
    };
    let dur = 1.5;
    const id0 = id.replace(/^stinger_/, '');
    const pluckMono = monotonic();
    const P = (m: number, t: number, d = 0.4) => pl(m, pluckMono(t0 + t) - t0, d);
    try {
      switch (id0) {
        case 'victory': {
          // Chord motif resolved to major, bell hit.
          const s = 0.16;
          [0, 7, 5, 11].forEach((iv, i) => g(D + 12 + iv, s * (i === 2 ? 1.5 : 1), [0, s, 2 * s, 3.5 * s][i]));
          g(D + 24, 1.6, 4 * s + 0.08, 0.9);
          ch([D, D + 4, D + 7, D + 12], 2, 4 * s + 0.08, 0.7);
          ch([D - 12], 2.2, 4 * s + 0.08, 0.6);
          bowl(D + 24, 4 * s + 0.08, 0.5);
          dur = 3;
          break;
        }
        case 'capture': {
          bowl(D + 19, 0, 0.6);
          [0, 4, 7, 12, 16, 19, 24].forEach((iv, i) => P(D + 12 + iv, 0.25 + i * 0.09));
          ch([D + 12, D + 16, D + 19], 1.1, 0.9, 0.5);
          dur = 2;
          break;
        }
        case 'evolution':
        case 'crescendo':
        case 'crescendo_start': {
          // 6 s rising filtered pad, pluck arpeggio accelerating 4 → 16 notes/bar, ending on a bell.
          k.padFilter.frequency.cancelScheduledValues(t0);
          k.padFilter.frequency.setValueAtTime(300, t0);
          k.padFilter.frequency.exponentialRampToValueAtTime(5000, t0 + 5.6);
          pad([D - 12, D - 5, D, D + 4], 3, 0, 0.5);
          pad([D - 10, D - 3, D + 2, D + 7], 3, 3, 0.55);
          const arp = [0, 4, 7, 12, 7, 4];
          let t = 0;
          let n = 0;
          while (t < 5.6) {
            const rate = 4 + (12 * t) / 5.6; // notes per 2 s "bar"
            P(D + 12 + arp[n % arp.length] + (t > 3 ? 2 : 0), t, 0.3);
            t += 2 / rate;
            n++;
          }
          bowl(D + 24, 5.9, 0.8);
          ch([D, D + 7, D + 12, D + 16], 2.5, 5.9, 0.6);
          dur = 7.5;
          break;
        }
        case 'crescendo_finish':
          bowl(D + 24, 0, 0.8);
          ch([D, D + 7, D + 12, D + 16], 2.5, 0, 0.6);
          dur = 2.5;
          break;
        case 'keynote':
        case 'keynote_get':
        case 'keynote_1':
        case 'keynote_2':
        case 'keynote_3':
        case 'keynote_4':
        case 'keynote_5':
        case 'keynote_6': {
          // Chord motif at a stately pace, then the Keynote's own note on top.
          const n = +(id0.match(/_(\d)$/)?.[1] ?? 3);
          const s = 0.3;
          [0, 7, 5, 11].forEach((iv, i) => g(D + 12 + iv, s * (i === 2 ? 1.5 : 1) * 0.95, [0, s, 2 * s, 3.5 * s][i]));
          g(D + 24, 2.2, 4 * s, 0.9);
          pad([D - 12, D - 5, D + 4, D + 9], 2.8, 4 * s, 0.6);
          const own = [0, 2, 4, 7, 9, 14][(n - 1 + 6) % 6];
          bowl(D + 24 + own, 4 * s + 0.6, 0.6, [1, 2.0, 3.01]);
          dur = 4;
          break;
        }
        case 'level_up': {
          const s = 0.075;
          [0, 7, 5, 11, 12].forEach((iv, i) => g(D + 19 + iv, s * 1.4, i * s, 0.7));
          ch([D + 7, D + 11, D + 14, D + 19], 0.7, 5 * s, 0.5);
          dur = 1.2;
          break;
        }
        case 'heal':
        case 'heal_bowl':
        case 'hearthrest': {
          // sounding bowl + pad swell + one ascending 5th
          const G = 55;
          bowl(G, 0, 0.8, [1, 2.32, 4.25, 6.63]);
          pad([G, G + 4, G + 7, G + 12], 1.8, 0.1, 0.55);
          P(G + 12, 0.9, 0.8);
          P(G + 19, 1.3, 1.2);
          dur = 2.5;
          break;
        }
        case 'item':
        case 'item_get':
          [0, 4, 7].forEach((iv, i) => P(60 + 12 + iv, i * 0.1, 0.3));
          g(84, 0.6, 0.32, 0.6);
          ch([60, 64, 67], 0.9, 0.32, 0.4);
          dur = 1.5;
          break;
        case 'great_chord':
        case 'ending': {
          // Each Keynote enters as one note of a D add9 voicing; the motif resolves to major on top.
          const notes = [D - 24, D - 17, D - 12, D - 10, D - 8, D - 5];
          notes.forEach((m, i) => {
            pad([m + 12], 9.5 - i * 0.8, i * 0.8, 0.5);
            bowl(m + 24, i * 0.8, 0.35, [1, 2.0, 3.01]);
          });
          const s = 0.35;
          [0, 7, 5, 11].forEach((iv, i) => g(D + 12 + iv, s * (i === 2 ? 1.5 : 1), 5 + [0, s, 2 * s, 3.5 * s][i], 0.8));
          g(D + 24, 3, 5 + 4 * s, 0.9);
          ch([D, D + 4, D + 7, D + 14], 4, 5 + 4 * s, 0.6);
          dur = 10;
          break;
        }
        default:
          g(D + 19, 0.6, 0, 0.5);
          dur = 0.8;
      }
    } catch {
      /* ignore */
    }
    // duck music under the stinger
    try {
      clearTimeout(this.duckTimer);
      this.core.musicIn.volume.rampTo(-14, 0.12);
      this.duckTimer = setTimeout(() => this.core.musicIn.volume.rampTo(0, 0.8), dur * 1000);
    } catch {
      /* ignore */
    }
    return dur;
  }
}
