// music.js — procedural battle music for Pokemon Arena.
// Self-contained Web Audio sequencer: no DOM, no assets, no three.js.
// Pattern-data-driven, tracker style: 16 steps per bar, 8-bar loop (two 4-bar phrases).

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

const SEMITONE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteHz(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  const midi = SEMITONE[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Pattern data (the score). 1/0 rows are 16th-note steps; "." = rest.
// Bass rows are 8th notes (8 per bar). One chord per bar, 4-bar progression.
// Lead phrases are 16 steps (one bar), phrase B answers every other 4 bars.
// ---------------------------------------------------------------------------

const _ = null;

const BATTLE = {
  bpm: 132,
  //       1 . . . 2 . . . 3 . . . 4 . . .
  kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  hat:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
  stab:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],   // offbeat 8ths
  // Am — F (A in bass) — C — G : roots A A C G with passing notes
  bass: [
    ['A1','A1','A2','A1', 'A1','G1','A1','C2'],
    ['A1','A1','A2','F1', 'F1','E1','F1','A1'],
    ['C2','C2','C3','C2', 'B1','C2','E2','G1'],
    ['G1','G1','G2','G1', 'F1','G1','B1','D2'],
  ],
  chords: [
    ['A2','C3','E3'],   // Am
    ['A2','C3','F3'],   // F
    ['G2','C3','E3'],   // C
    ['G2','B2','D3'],   // G
  ],
  chordCutoff: 1500,
  // A-minor pentatonic call...
  leadA: ['A4', _ ,'C5','A4',  _ ,'E4','G4', _ , 'A4', _ ,'C5','D5', 'E5', _ , _ ,'D5'],
  // ...and answer (every other 4 bars)
  leadB: ['C5', _ ,'A4','G4',  _ ,'E4', _ ,'G4', 'A4', _ ,'G4','E4', 'D4', _ ,'C4', _ ],
  leadDurSteps: 1.7,
  leadGain: 0.05,
};

const BOSS = {
  bpm: 140,
  //       1 . . . 2 . . . 3 . . . 4 . . .
  kick:   [1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,1],   // double-kick gallop
  snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  hat:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  stab:   [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,1],
  // E phrygian: E — F — E — G roots
  bass: [
    ['E1','E1','E2','E1', 'E1','E1','G1','E1'],
    ['F1','F1','F2','F1', 'F1','E1','F1','G1'],
    ['E1','E1','E2','E1', 'E1','E1','G1','A1'],
    ['G1','G1','G2','F1', 'F1','F1','E1','D1'],
  ],
  chords: [
    ['E2','B2','E3'],   // E5 (power chord)
    ['F2','C3','F3'],   // F5 — the phrygian shadow
    ['E2','B2','G3'],   // Em add-3 high
    ['G2','D3','G3'],   // G5
  ],
  chordCutoff: 900,
  // sparse, menacing long tones
  leadA: ['E4', _ , _ , _ ,  _ , _ , _ , _ , 'F4', _ , _ , _ ,  _ , _ , _ , _ ],
  leadB: ['G4', _ , _ , _ ,  _ , _ , _ , _ , 'F4', _ , _ , _ , 'E4', _ , _ , _ ],
  leadDurSteps: 7,
  leadGain: 0.045,
};

// Victory fanfare: [note, startSec, durSec] — Picardy lift into A major, ~3s.
const FANFARE = [
  ['E5', 0.00, 0.16], ['E5', 0.20, 0.16], ['E5', 0.40, 0.16], ['E5', 0.60, 0.50],
  ['C#5', 1.20, 0.40], ['D5', 1.60, 0.40], ['E5', 2.00, 0.75], ['A5', 2.45, 0.55],
];
const FANFARE_PAD = ['A2', 'C#4', 'E4', 'A4'];
const FANFARE_LEN = 3.1;

const STEPS_PER_BAR = 16;
const LOOP_BARS = 8;                       // two 4-bar phrases
const TOTAL_STEPS = STEPS_PER_BAR * LOOP_BARS;
const LOOKAHEAD = 0.3;                     // schedule-ahead window (s)
const BUS_LEVEL = 0.5;

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export function createMusicSystem(ctx, masterGain) {
  const musicBus = ctx.createGain();
  musicBus.gain.value = BUS_LEVEL;
  musicBus.connect(masterGain);

  // Lead echo: 0.23s delay, 0.25 feedback.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.23;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.25;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.35;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(musicBus);

  // Shared white-noise buffer for snare/hat.
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  let mode = 'battle';
  let prevMode = 'battle';
  let step = 0;
  let nextNoteTime = ctx.currentTime;
  let victoryUntil = 0;

  const stepSec = () => 60 / (mode === 'boss' ? BOSS.bpm : BATTLE.bpm) / 4;

  // ---- voice builders (every source gets an envelope and a stop()) --------

  function env(t, peak, dur, attack = 0.004) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function kick(t, peak = 0.12) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.11);
    const g = env(t, peak, 0.22, 0.002);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.25);
  }

  function noiseHit(t, filterType, freq, q, peak, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = env(t, peak, dur, 0.002);
    src.connect(f).connect(g).connect(musicBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.03);
  }

  const snare = (t) => noiseHit(t, 'bandpass', 1800, 0.9, 0.07, 0.13);
  const hat = (t, accent) => noiseHit(t, 'highpass', 7500, 0.7, accent ? 0.022 : 0.014, 0.04);

  function bassNote(hz, t, dur) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz;
    const g = env(t, 0.09, dur, 0.006);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Detuned two-saw pair per chord tone, through a shared lowpass.
  function chordStab(notes, t, cutoff, dur = 0.22, peak = 0.04) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 1.2;
    const g = env(t, peak / notes.length, dur, 0.005);
    lp.connect(g).connect(musicBus);
    for (const n of notes) {
      const hz = noteHz(n);
      for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz;
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  // 25%-duty pulse from two squares: sq(t) - sq(t - T/4), no DC.
  function leadNote(hz, t, dur, peak, withEcho = true) {
    const g = env(t, peak, dur, 0.005);
    const a = ctx.createOscillator();
    a.type = 'square';
    a.frequency.value = hz;
    const ga = ctx.createGain();
    ga.gain.value = 0.5;
    a.connect(ga).connect(g);
    const b = ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = hz;
    const shift = ctx.createDelay(0.05);
    shift.delayTime.value = 0.25 / hz;
    const gb = ctx.createGain();
    gb.gain.value = -0.5;
    b.connect(shift).connect(gb).connect(g);
    g.connect(musicBus);
    if (withEcho) g.connect(delay);
    a.start(t); b.start(t);
    a.stop(t + dur + 0.05); b.stop(t + dur + 0.05);
  }

  // ---- sequencer -----------------------------------------------------------

  function scheduleStep(stepIdx, t) {
    const P = mode === 'boss' ? BOSS : BATTLE;
    const bar = (stepIdx / STEPS_PER_BAR) | 0;
    const s = stepIdx % STEPS_PER_BAR;
    const sec = stepSec();

    if (P.kick[s]) kick(t);
    if (P.snare[s]) snare(t);
    if (P.hat[s]) hat(t, s % 4 === 2);

    if (s % 2 === 0) {
      const bn = P.bass[bar % 4][s / 2];
      if (bn) bassNote(noteHz(bn), t, sec * 1.8);
    }

    if (P.stab[s]) chordStab(P.chords[bar % 4], t, P.chordCutoff);

    const phrase = ((bar / 4) | 0) % 2 ? P.leadB : P.leadA;
    const ln = phrase[s];
    if (ln) leadNote(noteHz(ln), t, sec * P.leadDurSteps, P.leadGain);
  }

  function scheduleFanfare(t0) {
    kick(t0, 0.1);
    snare(t0 + 0.02);
    chordStab(FANFARE_PAD, t0, 2200, FANFARE_LEN, 0.05);
    for (const [n, at, dur] of FANFARE) {
      leadNote(noteHz(n), t0 + at, dur, 0.06);
    }
  }

  // ---- public API ----------------------------------------------------------

  function setMode(m) {
    if (m === mode) return;
    const now = ctx.currentTime;
    if (m === 'victory') prevMode = mode === 'off' ? 'battle' : mode;
    mode = m;

    if (m === 'off') {
      musicBus.gain.setTargetAtTime(0, now, 0.2);            // ~0.6s fade out
      return;
    }
    // crossfade: quick dip, then swell back over ~0.6s total
    musicBus.gain.setTargetAtTime(0.0001, now, 0.08);
    musicBus.gain.setTargetAtTime(BUS_LEVEL, now + 0.25, 0.12);

    if (m === 'victory') {
      scheduleFanfare(now + 0.2);
      victoryUntil = now + 0.2 + FANFARE_LEN + 0.15;
    } else {
      step = 0;
      nextNoteTime = now + 0.3;
    }
  }

  function update() {
    const now = ctx.currentTime;

    if (mode === 'victory') {
      if (now >= victoryUntil) setMode(prevMode);
      return;
    }
    if (mode === 'off') {
      nextNoteTime = now;
      return;
    }

    // Tab was suspended: don't cram the missed notes, just resync.
    if (now - nextNoteTime > 0.25) nextNoteTime = now;

    while (nextNoteTime < now + LOOKAHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += stepSec();
      step = (step + 1) % TOTAL_STEPS;
    }
  }

  return { setMode, update };
}
