// Creature cries synthesized from per-species CryParams (species.json `cry`), deterministic per species.
// Family contour + stage pitch/duration come from data; a species-id hash adds small, stable
// differences (formants, envelope, contour jitter) and the primary type adds a colour effect.
import * as Tone from 'tone';
import { CONTENT } from '../data/index';
import type { CryParams } from '../sim/types';
import type { Core } from './core';
import { hashStr, mulberry } from './songs';

type Node = { dispose(): unknown };
type FreqParam = { cancelScheduledValues(t: number): unknown; setValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown };

/** Contour values are semitone offsets (design doc); accept pitch multipliers too (all 0 < v ≤ 4, some fractional). */
export function contourSemis(contour: [number, number][]): [number, number][] {
  const vals = contour.map((c) => c[1]);
  const mult = vals.length > 0 && vals.every((v) => v > 0 && v <= 4) && vals.some((v) => !Number.isInteger(v));
  const pts = contour.map(([t, v]) => [Math.min(1, Math.max(0, t)), mult ? 12 * Math.log2(v) : v] as [number, number]).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return [[0, 0], [1, 0]];
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  return pts;
}

function interp(pts: [number, number][], t: number) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= t) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
}

export interface CryPlan {
  voice: CryParams['voice'];
  base: number;
  dur: number;
  pts: [number, number][];
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  f1: number;
  f2: number;
  vibHz: number;
  vibCents: number;
  noiseMix: number;
  harmonicity: number;
  modIndex: number;
  type: string;
}

/** Pure, deterministic cry plan for a species + variant (exported for tests). */
export function planCry(species: string, p: CryParams, type: string, opts?: { faint?: boolean; happy?: boolean }): CryPlan {
  const r = mulberry(hashStr('cry:' + species));
  let pts = contourSemis(p.contour);
  // stable per-species jitter of the inner breakpoints
  pts = pts.map(([t, v], i) => (i === 0 || i === pts.length - 1 ? [t, v] : [Math.min(0.98, Math.max(0.02, t + (r() - 0.5) * 0.08)), v + (r() - 0.5) * 1.4]));
  let base = Math.max(60, p.basePitchHz || 440);
  let dur = Math.max(0.12, (p.durationMs || 400) / 1000);
  let attack = 0.005 + r() * 0.05;
  const decay = 0.05 + r() * 0.25;
  const sustain = 0.35 + r() * 0.35;
  let release = 0.08 + r() * 0.25;
  if (opts?.faint) {
    base *= 0.7;
    dur *= 1.4;
    const lastV = pts[pts.length - 1][1];
    pts = [...pts.map(([t, v]) => [t * 0.75, v] as [number, number]), [1, lastV - 7]];
    release *= 1.6;
  } else if (opts?.happy) {
    const cut = 0.4;
    const head = pts.filter(([t]) => t < cut);
    pts = [...head, [cut, interp(pts, cut)] as [number, number]].map(([t, v]) => [t / cut, v]);
    base *= Math.pow(2, 3 / 12);
    dur = Math.max(0.14, dur * 0.45);
  }
  if (type === 'shade') {
    attack = dur * 0.6; // reverse-envelope swell
    release = 0.06;
  }
  const vib = p.vibrato ?? (r() < 0.3 ? 3 + r() * 3 : 0);
  return {
    voice: p.voice, base, dur, pts, attack: Math.min(attack, dur * 0.8), decay, sustain, release,
    f1: 250 + r() * 650, f2: 900 + r() * 1900, vibHz: vib, vibCents: vib ? 10 + r() * 30 : 0,
    noiseMix: Math.min(0.5, Math.max(0, p.noiseMix ?? 0)), harmonicity: p.harmonicity ?? 1 + Math.round(r() * 4) / 2,
    modIndex: p.modIndex ?? 2 + r() * 8, type,
  };
}

function fallbackParams(species: string): CryParams {
  const r = mulberry(hashStr(species));
  const voices: CryParams['voice'][] = ['fm', 'am', 'saw_formant', 'noise_formant'];
  return { voice: voices[Math.floor(r() * 4)], basePitchHz: 250 + r() * 500, contour: [[0, 0], [0.4, Math.round(r() * 12 - 4)], [1, Math.round(r() * 8 - 6)]], durationMs: 300 + r() * 400 };
}

export function createCries(core: Core) {
  const active: { nodes: Node[]; out: Tone.Volume; timer: ReturnType<typeof setTimeout> }[] = [];

  const kill = (c: (typeof active)[number]) => {
    clearTimeout(c.timer);
    try {
      c.out.volume.rampTo(-60, 0.04);
    } catch {
      /* ignore */
    }
    setTimeout(() => c.nodes.forEach((n) => { try { n.dispose(); } catch { /* ignore */ } }), 80);
  };

  function voice(plan: CryPlan, t: number, vel: number) {
    // cries ≤ 2 concurrent voices
    while (active.length >= 2) kill(active.shift()!);
    const nodes: Node[] = [];
    const out = new Tone.Volume(-4).connect(core.sfxBus);
    nodes.push(out);
    // type colour effect
    let fxIn: Tone.InputNode = out;
    const addFx = (n: Tone.ToneAudioNode) => {
      n.connect(out);
      nodes.push(n);
      fxIn = n;
    };
    switch (plan.type) {
      case 'fire': addFx(new Tone.Distortion({ distortion: 0.1, wet: 0.5 })); break;
      case 'water': addFx(new Tone.Chorus({ frequency: 3, delayTime: 2.5, depth: 0.4, wet: 0.5 }).start()); break;
      case 'electric': addFx(new Tone.Tremolo({ frequency: 38, depth: 0.35 }).start()); break;
      case 'frost': addFx(new Tone.FeedbackDelay({ delayTime: 0.045, feedback: 0.35, wet: 0.3 })); break;
      case 'gale': addFx(new Tone.Phaser({ frequency: 0.8, octaves: 3, baseFrequency: 600, wet: 0.5 })); break;
      case 'stone': addFx(new Tone.Filter({ type: 'lowshelf', frequency: 250, gain: 4 })); break;
      default: break;
    }
    const { base, dur, pts } = plan;
    const freqs: { p: FreqParam; mult: number }[] = [];
    const detunes: Tone.Signal<'cents'>[] = [];
    const env = new Tone.AmplitudeEnvelope({ attack: plan.attack, decay: plan.decay, sustain: plan.sustain, release: plan.release }).connect(fxIn);
    nodes.push(env);
    let synth: Tone.FMSynth | Tone.AMSynth | null = null;
    const oscs: (Tone.Oscillator | Tone.Noise)[] = [];

    if (plan.voice === 'fm' || plan.voice === 'am') {
      const envOpts = { attack: plan.attack, decay: plan.decay, sustain: plan.sustain, release: plan.release };
      synth = plan.voice === 'fm'
        ? new Tone.FMSynth({ harmonicity: plan.harmonicity, modulationIndex: plan.modIndex, envelope: envOpts, modulationEnvelope: { attack: plan.attack, decay: dur * 0.6, sustain: 0.4, release: plan.release }, volume: 0 })
        : new Tone.AMSynth({ harmonicity: plan.harmonicity, envelope: envOpts, modulationEnvelope: { attack: plan.attack, decay: dur * 0.5, sustain: 0.6, release: plan.release }, volume: 2 });
      synth.connect(fxIn);
      nodes.push(synth);
      freqs.push({ p: synth.frequency, mult: 1 });
      detunes.push(synth.detune);
    } else if (plan.voice === 'saw_formant') {
      const osc = new Tone.Oscillator({ type: 'sawtooth', frequency: base });
      const f1 = new Tone.Filter({ type: 'bandpass', frequency: plan.f1, Q: 5 }).connect(env);
      const f2 = new Tone.Filter({ type: 'bandpass', frequency: plan.f2, Q: 7 }).connect(env);
      const body = new Tone.Gain(0.12).connect(env);
      osc.fan(f1, f2, body);
      nodes.push(osc, f1, f2, body);
      oscs.push(osc);
      freqs.push({ p: osc.frequency, mult: 1 });
      detunes.push(osc.detune);
    } else {
      // noise_formant: pitched noise via resonant bandpasses tracking the contour, plus a quiet tonal core
      const n = new Tone.Noise('pink');
      const r2 = plan.f2 / 900; // 1..3.1
      const f1 = new Tone.Filter({ type: 'bandpass', frequency: base, Q: 12 }).connect(env);
      const f2 = new Tone.Filter({ type: 'bandpass', frequency: base * (1.6 + r2 * 0.4), Q: 9 }).connect(env);
      const ng = new Tone.Gain(2.2).fan(f1, f2);
      n.connect(ng);
      const core2 = new Tone.Oscillator({ type: 'triangle', frequency: base });
      const cg = new Tone.Gain(0.5 * (1 - plan.noiseMix)).connect(env);
      core2.connect(cg);
      nodes.push(n, f1, f2, ng, core2, cg);
      oscs.push(n, core2);
      freqs.push({ p: f1.frequency, mult: 1 }, { p: f2.frequency, mult: 1.6 + r2 * 0.4 }, { p: core2.frequency, mult: 1 });
      detunes.push(core2.detune);
    }
    // breath / grit for tonal voices
    if (plan.noiseMix > 0 && plan.voice !== 'noise_formant') {
      const n = new Tone.Noise('white');
      const bf = new Tone.Filter({ type: 'bandpass', frequency: base * 2, Q: 1.2 });
      const g = new Tone.Gain(plan.noiseMix * 0.6).connect(env);
      n.chain(bf, g);
      nodes.push(n, bf, g);
      oscs.push(n);
      freqs.push({ p: bf.frequency, mult: 2 });
    }
    // lumen: octave-up sine shimmer
    if (plan.type === 'lumen') {
      const o = new Tone.Oscillator({ type: 'sine', frequency: base * 2 });
      const g = new Tone.Gain(0.2).connect(env);
      o.connect(g);
      nodes.push(o, g);
      oscs.push(o);
      freqs.push({ p: o.frequency, mult: 2 });
    }
    // verdant: soft pluck transient
    if (plan.type === 'verdant') {
      const n = new Tone.Noise('white');
      const hp = new Tone.Filter({ type: 'highpass', frequency: 3000 });
      const e2 = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 }).connect(fxIn);
      n.chain(hp, e2);
      nodes.push(n, hp, e2);
      n.start(t).stop(t + 0.08);
      e2.triggerAttackRelease(0.03, t, 0.5);
    }
    // vibrato and toxin wobble on detune
    const lfos: Tone.LFO[] = [];
    if (plan.vibHz > 0) lfos.push(new Tone.LFO(plan.vibHz, -plan.vibCents, plan.vibCents));
    if (plan.type === 'toxin') lfos.push(new Tone.LFO(6, -40, 40));
    for (const l of lfos) {
      for (const d of detunes) l.connect(d);
      l.start(t).stop(t + dur + plan.release + 0.1);
      nodes.push(l);
    }

    // schedule
    const stopAt = t + dur + plan.release + 0.05;
    if (synth) {
      synth.triggerAttack(base * Math.pow(2, pts[0][1] / 12), t, vel);
      synth.triggerRelease(t + dur);
    }
    for (const o of oscs) o.start(t).stop(stopAt);
    env.triggerAttackRelease(dur, t, vel);
    for (const { p, mult } of freqs) {
      pts.forEach(([pt, semi], i) => {
        const v = Math.max(20, Math.min(12000, base * mult * Math.pow(2, semi / 12)));
        const at = t + pt * dur + (i === 0 ? 0 : 0.001 * i);
        if (i === 0) p.setValueAtTime(v, at);
        else p.exponentialRampToValueAtTime(v, at);
      });
    }
    const entry = {
      nodes, out,
      timer: setTimeout(() => {
        const i = active.indexOf(entry);
        if (i >= 0) active.splice(i, 1);
        nodes.forEach((n) => { try { n.dispose(); } catch { /* ignore */ } });
      }, (stopAt - core.now() + 0.6) * 1000),
    };
    active.push(entry);
  }

  return {
    play(species: string, opts?: { faint?: boolean; happy?: boolean }) {
      const sp = CONTENT.species[species];
      const params = sp?.cry ?? fallbackParams(species);
      const type = sp?.types?.[0] ?? 'none';
      const plan = planCry(species, params, type, opts);
      const t = core.now() + 0.02;
      voice(plan, t, opts?.faint ? 0.7 : 0.85);
      if (opts?.happy) {
        // bounce: a second, slightly higher chirp
        const t2 = t + plan.dur * 1.15;
        const plan2 = { ...plan, base: plan.base * Math.pow(2, 2 / 12), dur: plan.dur * 0.8 };
        setTimeout(() => {
          try {
            voice(plan2, Math.max(core.now() + 0.01, t2), 0.7);
          } catch {
            /* ignore */
          }
        }, Math.max(0, (t2 - core.now() - 0.05) * 1000));
      }
    },
  };
}
