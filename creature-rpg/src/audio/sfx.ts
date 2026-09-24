// Synthesized sound effects from a small pool of persistent voices (keeps CPU and voice count low).
import * as Tone from 'tone';
import type { Core } from './core';
import { monotonic, pluckSynth } from './core';

type Opts = Record<string, unknown> | undefined;

interface Pool {
  blip: Tone.Synth;
  fm: Tone.FMSynth[];
  pluck: Tone.MonoSynth;
  noise: { s: Tone.NoiseSynth; f: Tone.Filter }[];
  memb: Tone.MembraneSynth;
  poly: Tone.PolySynth;
  swell: Tone.PolySynth;
  bowl: Tone.PolySynth;
}

const TYPE_ROOT: Record<string, number> = { fire: 62, water: 63, electric: 64, verdant: 64, stone: 60, frost: 71, gale: 62, toxin: 65, shade: 66, lumen: 69, none: 62 };
const TYPE_CHORD: Record<string, number[]> = {
  fire: [0, 4, 7, 10], water: [0, 4, 6, 11], electric: [0, 7, 14, 19], verdant: [0, 3, 7, 9], stone: [0, 7, 12, 17],
  frost: [0, 5, 7, 14], gale: [0, 2, 7, 9], toxin: [0, 3, 6, 10], shade: [0, 3, 7, 8], lumen: [0, 4, 7, 11], none: [0, 4, 7, 12],
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function createSfx(core: Core) {
  const out = new Tone.Volume(4).connect(core.sfxBus);
  const verb = new Tone.Gain(0.3).connect(core.sfxVerb);
  const wire = <T extends Tone.ToneAudioNode>(n: T, wet = false) => {
    n.connect(out);
    if (wet) n.connect(verb);
    return n;
  };
  const pool: Pool = {
    blip: wire(new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0.1, release: 0.06 }, volume: -10 })),
    fm: [0, 1].map(() => wire(new Tone.FMSynth({ harmonicity: 3.01, modulationIndex: 8, envelope: { attack: 0.003, decay: 0.4, sustain: 0.1, release: 0.4 }, modulationEnvelope: { attack: 0.003, decay: 0.3, sustain: 0.1, release: 0.3 }, volume: -12 }), true)),
    pluck: wire(pluckSynth({ decay: 0.5, volume: -10 }), true),
    noise: [0, 1].map(() => {
      const f = wire(new Tone.Filter({ type: 'bandpass', frequency: 1500, Q: 1 }));
      const s = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.003, decay: 0.2, sustain: 0.001, release: 0.05 }, volume: -10 }).connect(f);
      return { s, f };
    }),
    memb: wire(new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 3, envelope: { attack: 0.001, decay: 0.25, sustain: 0.001, release: 0.08 }, volume: -8 })),
    poly: wire(new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.8 } }), true),
    swell: wire(new Tone.PolySynth(Tone.AMSynth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.35, decay: 0.2, sustain: 0.7, release: 0.5 } }), true),
    bowl: wire(new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.003, decay: 2.2, sustain: 0.001, release: 1.6 } }), true),
  };
  pool.poly.maxPolyphony = 10;
  pool.poly.volume.value = -16;
  pool.swell.maxPolyphony = 4;
  pool.swell.volume.value = -18;
  pool.bowl.maxPolyphony = 16;
  pool.bowl.volume.value = -16;

  const monoBlip = monotonic();
  const monoFm = [monotonic(), monotonic()];
  const monoPluck = monotonic();
  const monoNoise = [monotonic(), monotonic()];
  const monoMemb = monotonic();
  let fmI = 0;
  let nI = 0;

  // ---- primitive helpers (t is an absolute context time) ----
  const blip = (f0: number, dur: number, t: number, vel = 0.3, f1?: number, type: 'triangle' | 'sine' | 'square' = 'triangle') => {
    const tt = monoBlip(t);
    pool.blip.oscillator.type = type;
    pool.blip.triggerAttack(f0, tt, vel);
    if (f1) pool.blip.frequency.exponentialRampToValueAtTime(f1, tt + dur);
    pool.blip.triggerRelease(tt + dur);
  };
  const fm = (f0: number, dur: number, t: number, vel = 0.4, f1?: number, modIndex = 8) => {
    const i = fmI++ % 2;
    const s = pool.fm[i];
    const tt = monoFm[i](t);
    s.modulationIndex.setValueAtTime(modIndex, tt);
    s.triggerAttack(f0, tt, vel);
    if (f1) s.frequency.exponentialRampToValueAtTime(f1, tt + dur);
    s.triggerRelease(tt + dur);
  };
  const pluck = (f: number, t: number, dur = 0.3) => pool.pluck.triggerAttackRelease(f, dur, monoPluck(t));
  const noise = (type: BiquadFilterType, f0: number, f1: number, dur: number, t: number, vel = 0.4, q = 1, color: 'white' | 'pink' | 'brown' = 'white') => {
    const i = nI++ % 2;
    const { s, f } = pool.noise[i];
    const tt = monoNoise[i](t);
    s.noise.type = color;
    f.type = type;
    f.Q.setValueAtTime(q, tt);
    f.frequency.cancelScheduledValues(tt);
    f.frequency.setValueAtTime(f0, tt);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), tt + dur);
    s.envelope.decay = Math.max(0.01, dur);
    s.triggerAttackRelease(dur, tt, vel);
  };
  const thud = (f: number, t: number, vel = 0.6, dur = 0.15) => pool.memb.triggerAttackRelease(f, dur, monoMemb(t), vel);
  const chord = (ms: number[], dur: number, t: number, vel = 0.4, stagger = 0) => {
    ms.forEach((m, i) => pool.poly.triggerAttackRelease(mtof(m), dur, t + i * stagger, vel));
  };
  const swell = (ms: number[], dur: number, t: number, vel = 0.4) => pool.swell.triggerAttackRelease(ms.map(mtof), dur, t, vel);
  const bowl = (f: number, t: number, vel = 0.6, ratios = [1, 2.76, 5.4, 8.93]) => pool.bowl.triggerAttackRelease(ratios.map((r) => f * r), 0.9, t, vel);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  // ---- move recipes: 10 type timbres × 3 shapes ----
  const shapeOf = (anim: string) =>
    /projectile|beam/.test(anim) ? 'projectile' : /melee|dash|charge|flurry/.test(anim) ? 'contact' : 'field';
  const move = (type: string, anim: string, t: number) => {
    if (anim === 'heal_glow') {
      [0, 4, 7, 12, 16].forEach((iv, i) => fm(mtof(76 + iv), 0.25, t + i * 0.07, 0.25));
      return;
    }
    if (anim === 'shield' || anim === 'aura_self') {
      swell((TYPE_CHORD[type] ?? TYPE_CHORD.none).slice(0, 3).map((x) => x + (TYPE_ROOT[type] ?? 62)), 0.7, t, 0.45);
      return;
    }
    const shape = shapeOf(anim);
    const dur = shape === 'contact' ? 0.22 : shape === 'projectile' ? (anim === 'beam' ? 0.7 : 0.45) : 0.8;
    const reps = anim === 'multi_hit_flurry' ? 3 : 1;
    for (let r = 0; r < reps; r++) {
      const tt = t + r * 0.14;
      switch (type) {
        case 'fire':
          noise('lowpass', 400, 3800, dur, tt, 0.5, 1.2, 'pink');
          if (shape !== 'projectile') thud(70, tt + dur * 0.6, 0.5);
          break;
        case 'water':
          for (let i = 0; i < 3; i++) blip(rnd(500, 900), 0.08, tt + i * dur * 0.25, 0.25, 280, 'sine');
          noise('bandpass', 1600, 500, dur, tt + 0.05, 0.35, 1.5);
          break;
        case 'electric':
          fm(180, dur * 0.7, tt, 0.35, 1400, 24);
          for (let i = 0; i < 3; i++) noise('highpass', 4000, 6000, 0.04, tt + i * dur * 0.2, 0.35);
          break;
        case 'verdant':
          [0, 3, 7, 10, 12].slice(0, shape === 'contact' ? 3 : 5).forEach((iv, i) => pluck(mtof(64 + iv), tt + i * 0.05, 0.3));
          noise('bandpass', 3500, 2000, dur, tt, 0.25, 2);
          break;
        case 'stone':
          thud(55, tt, 0.8, 0.3);
          noise('lowpass', 1400, 150, dur, tt, 0.5, 0.8, 'brown');
          if (shape === 'field') thud(45, tt + 0.25, 0.6, 0.3);
          break;
        case 'frost':
          [2637, 3136, 3520].forEach((f, i) => fm(f, 0.15, tt + i * 0.06, 0.25, undefined, 3));
          noise('highpass', 7000, 9000, dur, tt, 0.25);
          break;
        case 'gale':
          noise('bandpass', 300, 2600, dur, tt, 0.45, 3, 'pink');
          break;
        case 'toxin':
          for (let i = 0; i < 4; i++) blip(rnd(200, 420), 0.07, tt + i * dur * 0.2, 0.25, rnd(500, 700), 'sine');
          noise('lowpass', 600, 200, dur, tt, 0.25, 4, 'brown');
          break;
        case 'shade':
          swell([54, 57, 60], dur, tt, 0.45);
          noise('lowpass', 2000, 200, dur, tt, 0.3, 1, 'pink');
          break;
        case 'lumen':
          chord([81, 85, 88, 93], dur * 0.8, tt, 0.35, 0.05);
          fm(mtof(93), dur, tt + 0.1, 0.2, undefined, 2);
          break;
        default:
          noise('lowpass', 2500, 400, dur, tt, 0.45, 1, 'pink');
          if (shape === 'contact') thud(90, tt + 0.1, 0.5);
      }
    }
    if (anim === 'debuff_cloud') chord([55, 58, 61], 0.6, t + 0.2, 0.25, 0.08);
    if (anim === 'weather_call') noise('bandpass', 200, 1800, 1.2, t + 0.3, 0.3, 1, 'pink');
  };

  const hitSound = (kind: string, t: number) => {
    if (kind === 'muffled') {
      thud(85, t, 0.35);
      noise('lowpass', 700, 180, 0.12, t, 0.3, 0.7, 'brown');
      return;
    }
    thud(kind === 'resounding' ? 150 : 115, t, kind === 'resounding' ? 0.85 : 0.6);
    noise(kind === 'resounding' ? 'highpass' : 'lowpass', kind === 'resounding' ? 5000 : 3000, kind === 'resounding' ? 1200 : 450, 0.13, t, 0.5);
    if (kind === 'resounding') fm(1760, 0.18, t + 0.02, 0.35);
    if (kind === 'crit') bowl(1175, t + 0.02, 0.45, [1, 2.4, 3.9]);
  };

  const statusApply = (st: string, t: number) => {
    switch (st) {
      case 'burn': case 'scorch': noise('lowpass', 300, 3000, 0.4, t, 0.35, 1, 'pink'); break;
      case 'poison': case 'toxic': case 'blight': for (let i = 0; i < 3; i++) blip(300 + i * 60, 0.08, t + i * 0.09, 0.25, 520, 'sine'); break;
      case 'paralysis': case 'shock': case 'static': fm(220, 0.3, t, 0.3, 330, 20); break;
      case 'sleep': case 'drowsy': blip(660, 0.25, t, 0.2, 440, 'sine'); blip(523, 0.35, t + 0.3, 0.18, 330, 'sine'); break;
      case 'frostbite': case 'freeze': case 'frost': case 'chill': [2093, 2637].forEach((f, i) => fm(f, 0.2, t + i * 0.08, 0.25, undefined, 3)); break;
      case 'dizzy': case 'muddle': blip(500, 0.15, t, 0.2, 800, 'sine'); blip(800, 0.15, t + 0.15, 0.2, 450, 'sine'); break;
      default: chord([57, 60], 0.3, t, 0.3, 0.12);
    }
  };

  // ---- the id table ----
  const R: Record<string, (t: number, o: Opts) => void> = {
    // UI
    ui_move: (t) => blip(1320, 0.03, t, 0.18),
    ui_confirm: (t) => { fm(1568, 0.12, t, 0.3); fm(2093, 0.2, t + 0.05, 0.25); },
    ui_back: (t) => pluck(196, t, 0.25),
    ui_error: (t) => { thud(110, t, 0.45, 0.1); thud(100, t + 0.12, 0.45, 0.1); },
    ui_open_panel: (t) => blip(600, 0.08, t, 0.18, 900),
    ui_close_panel: (t) => blip(900, 0.08, t, 0.18, 600),
    ui_page_turn: (t) => noise('bandpass', 2000, 5000, 0.12, t, 0.2, 1.2),
    ui_tally_gain: (t) => { fm(2637, 0.08, t, 0.25, undefined, 4); fm(3136, 0.12, t + 0.06, 0.25, undefined, 4); },
    dialogue_blip: (t) => blip(rnd(640, 720), 0.025, t, 0.12, undefined, 'square'),
    // overworld
    step: (t, o) => {
      const surf = String(o?.surface ?? 'grass');
      const v = 0.1 + Math.random() * 0.05;
      if (surf === 'stone') { thud(rnd(170, 200), t, v * 2, 0.05); noise('highpass', 3000, 2500, 0.03, t, v); }
      else if (surf === 'wood') thud(rnd(240, 280), t, v * 2.5, 0.06);
      else if (surf === 'sand' || surf === 'ash') noise('bandpass', 1300, 900, 0.08, t, v * 1.5, 0.8, 'pink');
      else if (surf === 'snow') noise('lowpass', 1000, 400, 0.09, t, v * 1.8, 1, 'pink');
      else if (surf === 'water') { noise('bandpass', 1800, 600, 0.12, t, v * 1.6, 1.5); blip(rnd(400, 600), 0.05, t, v, 250, 'sine'); }
      else noise('bandpass', rnd(2200, 2800), 1400, 0.06, t, v * 1.4, 1.2);
    },
    jump: (t) => blip(300, 0.1, t, 0.18, 520),
    land: (t) => thud(90, t, 0.3, 0.08),
    door_open: (t) => { thud(140, t, 0.35, 0.1); noise('bandpass', 900, 400, 0.25, t + 0.05, 0.25, 1.5, 'pink'); },
    zone_transition_whoosh: (t) => noise('bandpass', 300, 3000, 0.6, t, 0.3, 1.2, 'pink'),
    ledger_open: (t) => { noise('bandpass', 2000, 5000, 0.12, t, 0.2, 1.2); pluck(392, t + 0.08, 0.3); },
    item_pickup: (t) => [1047, 1319, 1568].forEach((f, i) => fm(f, 0.1, t + i * 0.07, 0.3, undefined, 4)),
    chest_open: (t) => { thud(160, t, 0.4, 0.1); [1047, 1319, 1568, 2093].forEach((f, i) => fm(f, 0.1, t + 0.1 + i * 0.07, 0.28, undefined, 4)); },
    // resonance
    res_ready: (t) => swell([50, 57], 0.8, t, 0.2),
    res_trigger: (t, o) => {
      const type = String(o?.type ?? 'none');
      const root = TYPE_ROOT[type] ?? 62;
      chord((TYPE_CHORD[type] ?? TYPE_CHORD.none).map((x) => root + x), 1.2, t, 0.35, 0.06);
      bowl(mtof(root + 12), t, 0.35, [1, 2.0, 3.01]);
    },
    res_transform_grow: (t) => [0, 3, 7, 10, 12, 15].forEach((iv, i) => pluck(mtof(52 + iv), t + i * 0.08, 0.4)),
    res_transform_shift: (t) => { noise('lowpass', 2000, 120, 0.6, t, 0.4, 0.8, 'brown'); thud(50, t + 0.4, 0.6, 0.3); },
    res_transform_freeze: (t) => [3136, 3520, 2637, 3951].forEach((f, i) => fm(f, 0.2, t + i * 0.07, 0.22, undefined, 3)),
    res_transform_gust: (t) => { noise('bandpass', 300, 2500, 0.4, t, 0.35, 3, 'pink'); noise('bandpass', 2500, 400, 0.5, t + 0.4, 0.3, 3, 'pink'); },
    res_waystone_register: (t) => { chord([62, 69, 76, 78], 1.6, t, 0.35, 0.12); bowl(mtof(74), t + 0.5, 0.35, [1, 2.0, 3.01]); },
    // battle
    battle_start_wild: (t) => { noise('bandpass', 400, 4000, 0.35, t, 0.35, 1.5, 'pink'); thud(80, t + 0.3, 0.6); blip(400, 0.3, t, 0.2, 1200); },
    battle_start_trainer: (t) => { noise('bandpass', 400, 4000, 0.3, t, 0.3, 1.5, 'pink'); chord([62, 69, 74, 78], 0.35, t + 0.28, 0.5); thud(70, t + 0.28, 0.7); },
    send_out: (t) => { fm(400, 0.15, t, 0.3, 900, 5); noise('bandpass', 600, 3000, 0.2, t, 0.25, 1.2, 'pink'); },
    recall: (t) => { fm(900, 0.18, t, 0.25, 400, 5); noise('bandpass', 3000, 600, 0.2, t, 0.2, 1.2, 'pink'); },
    hit_normal: (t) => hitSound('normal', t),
    hit_resounding: (t) => hitSound('resounding', t),
    hit_muffled: (t) => hitSound('muffled', t),
    hit_crit: (t) => hitSound('crit', t),
    hit: (t, o) => {
      const eff = Number(o?.eff ?? 4);
      hitSound(o?.crit ? 'crit' : typeof o?.variant === 'string' ? (o.variant as string) : eff > 4 ? 'resounding' : eff < 4 ? 'muffled' : 'normal', t);
    },
    miss_whiff: (t) => noise('bandpass', 3000, 900, 0.2, t, 0.25, 2, 'pink'),
    stat_up: (t) => { blip(400, 0.35, t, 0.2, 1200, 'sine'); fm(1568, 0.15, t + 0.3, 0.2, undefined, 3); },
    stat_down: (t) => blip(1000, 0.35, t, 0.2, 300, 'sine'),
    status: (t, o) => statusApply(String(o?.status ?? ''), t),
    faint: (t) => { blip(600, 0.6, t, 0.25, 120, 'sine'); thud(60, t + 0.5, 0.5, 0.3); },
    xp_tick: (t) => blip(1760, 0.02, t, 0.08, undefined, 'sine'),
    retreat_success: (t) => { noise('bandpass', 800, 3000, 0.3, t, 0.3, 1.5, 'pink'); blip(400, 0.2, t, 0.18, 800); },
    retreat_fail: (t) => { thud(100, t, 0.5, 0.1); thud(95, t + 0.13, 0.5, 0.1); blip(300, 0.2, t + 0.1, 0.15, 200); },
    move: (t, o) => move(String(o?.type ?? 'none'), String(o?.anim ?? 'melee_lunge'), t),
    // capture (rings rise a 4th each; no shake sounds)
    chime_throw: (t) => { noise('bandpass', 600, 2400, 0.4, t, 0.22, 1.5, 'pink'); fm(1047, 0.12, t, 0.2, undefined, 4); },
    chime_ring: (t, o) => {
      const n = Math.max(1, Number(o?.n ?? 1));
      const f = 880 * Math.pow(4 / 3, n - 1);
      fm(f, 0.5, t, 0.4);
      bowl(f / 2, t, 0.2, [1, 2.0]);
    },
    chime_click: (t) => { blip(2400, 0.02, t, 0.2, undefined, 'square'); thud(600, t, 0.2, 0.03); },
    chime_bond: (t) => { chord([74, 78, 81, 86], 1.6, t, 0.4, 0.07); bowl(mtof(86), t + 0.1, 0.35, [1, 2.0, 3.01]); },
    chime_break: (t) => { fm(1175, 0.12, t, 0.4); thud(420, t + 0.12, 0.5, 0.05); noise('highpass', 3000, 2000, 0.06, t + 0.12, 0.4); },
    // story events
    stillbell_toll: (t) => bowl(98, t, 0.8, [1, 2.4, 2.9, 4.95]),
    stillbell_crack: (t) => { noise('highpass', 5000, 1500, 0.25, t, 0.6); thud(70, t, 0.7, 0.2); bowl(104, t + 0.02, 0.4, [1, 2.33, 3.1]); },
    coil_siphon_hum: (t) => fm(55, 1.2, t, 0.35, 45, 18),
    coil_shutdown: (t) => { fm(110, 0.8, t, 0.35, 30, 12); thud(45, t + 0.7, 0.5, 0.3); },
    stone_rehum: (t) => { bowl(147, t, 0.6, [1, 2.0, 3.01, 4.2]); swell([50, 57, 62, 66], 1.6, t + 0.2, 0.35); },
  };
  // aliases requested across the codebase / design docs
  const A: Record<string, string> = {
    menu_move: 'ui_move', menu_select: 'ui_confirm', ui_select: 'ui_confirm', menu_back: 'ui_back', ui_cancel: 'ui_back',
    dialog_blip: 'dialogue_blip', text_blip: 'dialogue_blip', blip: 'dialogue_blip', dialogue: 'dialogue_blip',
    footstep: 'step', door: 'door_open', warp: 'zone_transition_whoosh', zone_transition: 'zone_transition_whoosh', transition: 'zone_transition_whoosh',
    item: 'item_pickup', pickup: 'item_pickup', encounter: 'battle_start_wild', encounter_start: 'battle_start_wild', battle_start: 'battle_start_trainer',
    super: 'hit_resounding', weak: 'hit_muffled', crit: 'hit_crit', hit_super: 'hit_resounding', hit_weak: 'hit_muffled',
    chime_ring_1: 'chime_ring', chime_ring_2: 'chime_ring', chime_ring_3: 'chime_ring', ring: 'chime_ring', throw: 'chime_throw',
  };
  const STINGER_IDS = new Set(['level_up', 'heal_bowl', 'heal', 'keynote_get', 'keynote', 'crescendo_start', 'crescendo_finish', 'evolution', 'victory', 'capture', 'great_chord']);

  const last = new Map<string, number>();
  return {
    /** Returns true if handled, or the stinger id to delegate to the music engine. */
    play(id: string, opts: Opts, stinger: (id: string) => void) {
      if (STINGER_IDS.has(id)) return stinger(id);
      let key = A[id] ?? id;
      let o = opts;
      const ringN = id.match(/^chime_ring_(\d)$/);
      if (ringN) o = { ...opts, n: +ringN[1] };
      const typed = key.match(/^(res_trigger|status_apply|footstep|move)_(\w+)$/);
      if (typed && !R[key]) {
        key = typed[1] === 'status_apply' ? 'status' : typed[1] === 'footstep' ? 'step' : typed[1];
        o = { ...opts, type: typed[2], status: typed[2], surface: typed[2] };
      }
      const fn = R[key];
      const now = core.now();
      // light rate limit per id (footsteps / blips spam)
      const prev = last.get(key) ?? -1;
      const minGap = key === 'step' ? 0.09 : key === 'dialogue_blip' || key === 'xp_tick' ? 0.04 : 0.025;
      if (now - prev < minGap) return;
      last.set(key, now);
      const t = now + 0.01;
      if (fn) fn(t, o);
      else blip(880, 0.05, t, 0.12, undefined, 'sine'); // unknown id → soft default blip
    },
  };
}
