// music.js — procedural Web Audio soundtrack for POKEMON ARENA 3D.
// Pure Web Audio (no three.js, no DOM, no external assets). Lookahead scheduler
// driven from update() each frame; all timing derived from ctx.currentTime.
//
// export function createMusic(ctx, out)
//   -> { setMode('none'|'title'|'battle'|'boss'), playVictory(), playDefeat(), update() }
//
// Architecture: each mode owns its own GainNode -> shared music bus -> out.
// setMode crossfades over ~1.2s and, once a mode is fully faded out, stops its
// scheduling and tears down any tail sources. A single shared noise buffer feeds
// all percussion/risers. Master music bus gain ~0.5 (≈ -12 dB headroom).

const LOOKAHEAD = 0.12;        // how often (s) we top up the schedule
const HORIZON = 0.3;           // how far ahead (s) we schedule notes
const CROSSFADE = 1.2;         // mode crossfade time (s)
const MASTER = 0.5;            // music bus gain

// ---- note helpers -------------------------------------------------------------
// Equal-temperament frequency from a MIDI note number.
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
// Named pitch class offsets relative to A (we mostly speak in MIDI numbers).
const N = {
  E2: 40, F2: 41, G2: 43, A2: 45, B2: 47, C3: 48, D3: 50, E3: 52, F3: 53, G3: 55,
  A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
  C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88,
};

export function createMusic(ctx, out) {
  // ---- shared bus + master ----------------------------------------------------
  const bus = ctx.createGain();
  bus.gain.value = MASTER;
  // gentle bus saturation guard via a soft limiter-ish compressor
  let busTail = bus;
  if (ctx.createDynamicsCompressor) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    bus.connect(comp);
    comp.connect(out);
    busTail = comp;
  } else {
    bus.connect(out);
  }

  // ---- shared noise buffer ----------------------------------------------------
  const NOISE_LEN = Math.floor(ctx.sampleRate * 2);
  const noiseBuffer = ctx.createBuffer(1, NOISE_LEN, ctx.sampleRate);
  {
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < NOISE_LEN; i++) d[i] = Math.random() * 2 - 1;
  }
  function noiseSrc() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = noiseBuffer.duration;
    return s;
  }

  // ---- per-mode containers ----------------------------------------------------
  // Each mode: { gain, active, target, nextNoteTime, step, fx..., sources:Set }
  function makeMode() {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    return { gain: g, active: false, target: 0, nextTime: 0, step: 0, started: false, sources: new Set() };
  }
  const modes = {
    title: makeMode(),
    battle: makeMode(),
    boss: makeMode(),
  };

  // Track active "live" oscillator/source nodes per mode so we can hard-stop
  // them when a mode is deactivated (after its crossfade completes).
  function track(mode, node, stopAt) {
    mode.sources.add(node);
    node.onended = () => mode.sources.delete(node);
    if (stopAt != null) {
      try { node.stop(stopAt); } catch (e) { /* already scheduled */ }
    }
  }
  function killSources(mode) {
    const now = ctx.currentTime;
    mode.sources.forEach((n) => { try { n.stop(now); } catch (e) {} });
    mode.sources.clear();
  }

  // ============================================================================
  //  VOICE PRIMITIVES (shared low-level synth helpers, all -> a target node)
  // ============================================================================

  // Punchy kick: sine pitch-drop 150->45 + a short noise click transient.
  function kick(mode, dest, t, vel = 1) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.95 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.28);
    track(mode, o);
    // click transient
    const c = noiseSrc();
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass'; cf.frequency.value = 1200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.5 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    c.connect(cf); cf.connect(cg); cg.connect(dest);
    c.start(t); c.stop(t + 0.03);
    track(mode, c);
  }

  // Snare: band-passed noise burst (+ a soft body tone). ghost = quieter.
  function snare(mode, dest, t, vel = 1) {
    const c = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14 * (0.5 + vel * 0.5));
    c.connect(bp); bp.connect(hp); hp.connect(g); g.connect(dest);
    c.start(t); c.stop(t + 0.2);
    track(mode, c);
    // body
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.22 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og); og.connect(dest);
    o.start(t); o.stop(t + 0.12);
    track(mode, o);
  }

  // Hi-hat: short high-passed noise tick. open => longer.
  function hat(mode, dest, t, vel = 0.5, open = false) {
    const c = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    const dur = open ? 0.12 : 0.035;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.connect(hp); hp.connect(g); g.connect(dest);
    c.start(t); c.stop(t + dur + 0.02);
    track(mode, c);
  }

  // Tom: pitched sine with quick drop, beefier than kick body.
  function tom(mode, dest, t, freq, vel = 1) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.24);
    track(mode, o);
  }

  // Mono bass note: square -> lowpass with a little envelope movement.
  function bass(mode, dest, t, midi, dur, vel = 1, cutoff = 800) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(mtof(midi), t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff + 600, t);
    lp.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.12, dur));
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.006);
    g.gain.setValueAtTime(0.32 * vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
    track(mode, o);
  }

  // Detuned 3-osc saw "brass" stab chord. midis = array of MIDI notes.
  function sawStab(mode, dest, t, midis, dur, vel = 1) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    lp.Q.value = 1;
    lp.connect(g); g.connect(dest);
    const detunes = [-7, 0, 7];
    for (const note of midis) {
      for (const det of detunes) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(note);
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.02);
        track(mode, o);
      }
    }
  }

  // Single lead voice (triangle+saw blend) -> caller routes dest (may be delay send).
  function lead(mode, dest, t, midi, dur, vel = 1) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.01);
    g.gain.setValueAtTime(0.3 * vel, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle'; o1.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth'; o2.frequency.value = mtof(midi); o2.detune.value = 6;
    const o2g = ctx.createGain(); o2g.gain.value = 0.4;
    o1.connect(g); o2.connect(o2g); o2g.connect(g);
    o1.start(t); o1.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
    track(mode, o1); track(mode, o2);
  }

  // Soft arp/pluck voice for title.
  function pluck(mode, dest, t, midi, dur, vel = 1, type = 'triangle') {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
    track(mode, o);
  }

  // Tritone brass stab (boss) — two detuned saws a tritone apart, gnarly.
  function tritoneStab(mode, dest, t, rootMidi, dur, vel = 1) {
    sawStab(mode, dest, t, [rootMidi, rootMidi + 6, rootMidi + 12], dur, vel * 1.1);
  }

  // Noise riser: filtered noise sweeping up in cutoff + gain over `dur`.
  function riser(mode, dest, t, dur, vel = 1) {
    const c = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vel, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
    c.connect(bp); bp.connect(g); g.connect(dest);
    c.start(t); c.stop(t + dur + 0.1);
    track(mode, c);
  }

  // ============================================================================
  //  PER-MODE FX SENDS (built lazily, persistent for the mode's lifetime)
  // ============================================================================

  // Battle: dotted-eighth feedback delay for the lead.
  const battleSpb = 60 / 132;                 // seconds per beat @132bpm
  const battleStep = battleSpb / 2;           // eighth note
  function buildBattleFx() {
    const m = modes.battle;
    if (m.fx) return;
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = battleSpb * 0.75; // dotted eighth
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    delay.connect(fb); fb.connect(delay);
    delay.connect(tone); tone.connect(wet); wet.connect(m.gain);
    m.fx = { delay, leadSend: delay };
  }

  // ============================================================================
  //  TITLE — dreamy Am–F–C–G arps + airy detuned pad w/ slow filter LFO
  // ============================================================================
  const titleSpb = 60 / 96;                   // calm 96bpm
  const titleStep = titleSpb / 2;             // eighth
  // 4-chord loop, each chord one bar; arp pattern over chord tones.
  const TITLE_CHORDS = [
    [N.A3, N.C4, N.E4, N.A4],   // Am
    [N.F3, N.A3, N.C4, N.F4],   // F
    [N.C4, N.E4, N.G4, N.C5],   // C
    [N.G3, N.B3, N.D4, N.G4],   // G
  ];
  const TITLE_ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // index into chord per eighth (8/bar)
  function buildTitlePad() {
    const m = modes.title;
    if (m.pad) return;
    // airy detuned saw pad held continuously, slow filter LFO.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
    const padGain = ctx.createGain(); padGain.gain.value = 0.0;
    lp.connect(padGain); padGain.connect(m.gain);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 380;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lfo.start();
    const padOscs = [];
    // base pad = A minor pedal (A2, E3, A3) detuned pairs
    for (const base of [N.A2, N.E3, N.A3]) {
      for (const det of [-8, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(base); o.detune.value = det;
        o.connect(lp); o.start();
        padOscs.push(o);
        m.sources.add(o);
      }
    }
    m.sources.add(lfo);
    // fade pad in
    padGain.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
    m.pad = { lp, padGain, lfo, padOscs };
  }
  function teardownTitlePad() {
    const m = modes.title;
    if (!m.pad) return;
    const now = ctx.currentTime;
    try { m.pad.padGain.gain.setTargetAtTime(0, now, 0.3); } catch (e) {}
    m.pad.padOscs.forEach((o) => { try { o.stop(now + 0.5); } catch (e) {} m.sources.delete(o); });
    try { m.pad.lfo.stop(now + 0.5); } catch (e) {}
    m.sources.delete(m.pad.lfo);
    m.pad = null;
  }

  function scheduleTitle(t, step) {
    const m = modes.title;
    const bar = Math.floor(step / 8) % 4;
    const sub = step % 8;
    const chord = TITLE_CHORDS[bar];
    // arp pluck
    const note = chord[TITLE_ARP[sub]] + (sub >= 4 ? 12 : 0);
    pluck(m, m.gain, t, note, titleStep * 1.8, 0.9);
    // soft bass root each downbeat & half-bar
    if (sub === 0 || sub === 4) {
      bass(m, m.gain, t, chord[0] - 12, titleStep * 2.4, 0.6, 500);
    }
    // sparkle high every other bar on offbeat
    if ((bar % 2 === 1) && sub === 6) {
      pluck(m, m.gain, t, chord[2] + 24, titleStep * 1.2, 0.4, 'sine');
    }
  }

  // ============================================================================
  //  BATTLE — 132bpm, Am–F–G (I–VI–VII minor), 8-bar form
  // ============================================================================
  // Progression by bar over an 8-bar loop (4 chords, 2 bars each).
  const BATTLE_PROG = [
    { root: N.A2, chord: [N.A3, N.C4, N.E4] }, // Am
    { root: N.A2, chord: [N.A3, N.C4, N.E4] },
    { root: N.F2, chord: [N.F3, N.A3, N.C4] }, // F
    { root: N.F2, chord: [N.F3, N.A3, N.C4] },
    { root: N.G2, chord: [N.G3, N.B3, N.D4] }, // G
    { root: N.G2, chord: [N.G3, N.B3, N.D4] },
    { root: N.A2, chord: [N.A3, N.C4, N.E4] }, // Am
    { root: N.E2, chord: [N.E3, N.G3, N.B3] }, // E (turnaround tension)
  ];
  // Eighth-note bass pattern offsets within a bar (8 eighths), pedal+octave bounce.
  const BASS_OCT = [0, 0, 12, 0, 0, 12, 0, 7];
  // A real, catchy 8-bar lead melody (MIDI), one entry per eighth note = 64 steps.
  // 0 means rest. Built around A minor with F & G color tones; singable hook.
  const R = 0;
  const BATTLE_LEAD = [
    // bar 1 (Am)
    N.A4, R, N.C5, N.E5, R, N.D5, N.C5, N.A4,
    // bar 2 (Am)
    N.B4, R, N.C5, N.B4, N.A4, R, N.E4, R,
    // bar 3 (F)
    N.A4, R, N.C5, N.F5, R, N.E5, N.C5, N.A4,
    // bar 4 (F)
    N.G4, R, N.A4, N.G4, N.F4, R, N.C4, R,
    // bar 5 (G)
    N.B4, R, N.D5, N.G5, R, N.F5, N.D5, N.B4,
    // bar 6 (G)
    N.A4, R, N.B4, N.A4, N.G4, R, N.D4, R,
    // bar 7 (Am)
    N.C5, N.B4, N.A4, N.E5, R, N.C5, N.B4, N.A4,
    // bar 8 (E turnaround)
    N.B4, N.C5, N.B4, N.G4, N.E4, R, N.B3, R,
  ];

  let battlePhrase = 0; // counts 8-bar phrases to toggle lead drop-outs

  function scheduleBattle(t, step) {
    const m = modes.battle;
    buildBattleFx();
    const stepsPerBar = 8;
    const totalSteps = stepsPerBar * 8; // 64
    const pos = step % totalSteps;
    const bar = Math.floor(pos / stepsPerBar);
    const sub = pos % stepsPerBar;       // 0..7 eighth index
    const prog = BATTLE_PROG[bar];
    // phrase counter increments at loop boundary
    if (pos === 0) battlePhrase++;

    // --- KICK: strong 1 & "and" of 3 + extra push ---
    if (sub === 0 || sub === 4) kick(m, m.gain, t, sub === 0 ? 1 : 0.85);
    if (sub === 6 && bar % 2 === 1) kick(m, m.gain, t, 0.7); // syncopated push

    // --- SNARE: backbeat 2 & 4 + ghost notes ---
    if (sub === 2 || sub === 6) snare(m, m.gain, t, 1);
    if (sub === 3 || sub === 7) {
      if (Math.random() < 0.4) snare(m, m.gain, t, 0.28); // ghost
    }

    // --- HATS: 16ths during the 2nd half of each phrase (bars 4..7) ---
    if (bar >= 4) {
      hat(m, m.gain, t, sub % 2 === 0 ? 0.5 : 0.32, false);
      hat(m, m.gain, t + battleStep / 2, 0.32, sub === 7);
    } else {
      // light eighth hats first half
      if (sub % 2 === 1) hat(m, m.gain, t, 0.3, false);
    }

    // --- BASS: eighth-note line following progression ---
    bass(m, m.gain, t, prog.root + BASS_OCT[sub], battleStep * 0.95, 1, 700);

    // --- SAW STABS: brass-ish on accents (1 and the "and of 2") ---
    if (sub === 0) sawStab(m, m.gain, t, prog.chord, battleStep * 2.6, 1);
    if (sub === 3) sawStab(m, m.gain, t, prog.chord, battleStep * 1.4, 0.7);

    // --- LEAD MELODY through dotted feedback delay; drop every other phrase ---
    const dropLead = (battlePhrase % 2 === 0); // drop lead on even phrases
    if (!dropLead) {
      const ln = BATTLE_LEAD[pos];
      if (ln !== R) {
        // dry + delay send
        lead(m, m.gain, t, ln, battleStep * 1.4, 0.9);
        lead(m, m.fx.leadSend, t, ln, battleStep * 1.1, 0.5);
      }
    } else {
      // during lead-drop phrases, add an extra rhythmic stab to keep energy
      if (sub === 2 || sub === 5) sawStab(m, m.gain, t, prog.chord, battleStep * 1.0, 0.5);
    }
  }

  // ============================================================================
  //  BOSS — 140bpm E-phrygian, driving toms + double-kick, 16th ostinato bass
  // ============================================================================
  const bossSpb = 60 / 140;
  const bossStep = bossSpb / 4;                // 16th note
  // E phrygian: E F G A B C D. Ostinato bass over 16ths: E–F–E–G repeating.
  const BOSS_OSTINATO = [N.E2, N.F2, N.E2, N.G2];
  // Tritone stab roots cycle for menace (E and Bb=tritone framing handled in stab).
  const BOSS_STAB_ROOTS = [N.E3, N.F3, N.E3, N.C3];
  // Tom pattern accents (16th positions within a 16-step bar that fire toms).
  const BOSS_TOM_FREqs = [110, 92, 78];

  let bossBar = 0;
  function scheduleBoss(t, step) {
    const m = modes.boss;
    const stepsPerBar = 16; // 16th notes per 4/4 bar
    const pos = step % (stepsPerBar * 4); // 4-bar loop
    const bar = Math.floor(pos / stepsPerBar);
    const sub = pos % stepsPerBar;
    if (pos === 0) bossBar++;

    // --- DOUBLE-KICK FEEL: kicks on 16ths in a galloping pattern ---
    // gallop: hits on 0,2,3, 4,6,7, 8,10,11, 12,14,15 (driving)
    const k = sub % 4;
    if (k === 0 || k === 2 || k === 3) kick(m, m.gain, t, k === 0 ? 1 : 0.7);

    // --- DRIVING TOMS: fill accents, heavier toward bar ends ---
    if (sub === 1 || sub === 9) tom(m, m.gain, t, BOSS_TOM_FREqs[0], 0.7);
    if (sub === 5 || sub === 13) tom(m, m.gain, t, BOSS_TOM_FREqs[1], 0.6);
    if (bar === 3 && sub >= 12) tom(m, m.gain, t, BOSS_TOM_FREqs[(sub) % 3], 0.85); // end-of-phrase tom fill

    // --- SNARE on beats 2 & 4 (16th positions 4 & 12) ---
    if (sub === 4 || sub === 12) snare(m, m.gain, t, 0.95);

    // --- 16th OSTINATO BASS E–F–E–G ---
    bass(m, m.gain, t, BOSS_OSTINATO[sub % 4], bossStep * 0.9, 1, 600);

    // --- TRITONE BRASS STABS on the downbeat and beat 3 ---
    if (sub === 0) tritoneStab(m, m.gain, t, BOSS_STAB_ROOTS[bar], bossStep * 5, 0.9);
    if (sub === 8) tritoneStab(m, m.gain, t, BOSS_STAB_ROOTS[bar] + 1, bossStep * 3, 0.6);

    // --- NOISE RISER at phrase ends (last bar, last beat) ---
    if (bar === 3 && sub === 8) riser(m, m.gain, t, bossStep * 8, 0.9);
  }

  // ============================================================================
  //  ONE-SHOTS (victory / defeat) — own short-lived gain -> bus
  // ============================================================================
  let oneShotGain = null;

  function playVictory() {
    duckForOneShot();
    const g = ctx.createGain();
    g.gain.value = 1.0;
    g.connect(bus);
    const t0 = ctx.currentTime + 0.04;
    const beat = 0.32; // ~4s total fanfare
    // C–F–G–C triads (major fanfare)
    const triads = [
      { t: 0,        notes: [N.C4, N.E4, N.G4] },
      { t: beat,     notes: [N.F4, N.A4, N.C5] },
      { t: beat * 2, notes: [N.G4, N.B4, N.D5] },
      { t: beat * 3, notes: [N.C5, N.E5, N.G5] },
    ];
    for (const tr of triads) {
      for (const n of tr.notes) {
        fanfareVoice(g, t0 + tr.t, n, beat * 1.1, 0.5);
      }
      timpani(g, t0 + tr.t, tr.notes[0] - 24, 0.9);
    }
    // sustained final chord
    for (const n of [N.C5, N.E5, N.G5, N.C6]) fanfareVoice(g, t0 + beat * 4, n, 1.4, 0.55);
    timpani(g, t0 + beat * 4, N.C2, 1.0);
    // rising arp run over the top of the final chord
    const arp = [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5, N.C6, N.E6];
    for (let i = 0; i < arp.length; i++) {
      pluckFan(g, t0 + beat * 3 + i * 0.07, arp[i], 0.4, 0.4);
    }
    // overall envelope: snap in, ring out ~4s then cleanup
    const end = t0 + beat * 4 + 1.5;
    g.gain.setValueAtTime(1.0, t0);
    g.gain.setValueAtTime(1.0, end - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, end);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} restoreFromOneShot(); }, (end - ctx.currentTime + 0.2) * 1000);
  }

  function playDefeat() {
    duckForOneShot();
    const g = ctx.createGain();
    g.gain.value = 0.9;
    g.connect(bus);
    const t0 = ctx.currentTime + 0.04;
    const beat = 0.5; // ~3s sparse descending minor
    // Descending A minor: A – G – F – E (sparse, somber)
    const line = [
      { t: 0,        chord: [N.A4, N.C4, N.A3] },
      { t: beat,     chord: [N.G4, N.B3, N.G3] },
      { t: beat * 2, chord: [N.F4, N.A3, N.F3] },
      { t: beat * 3, chord: [N.E4, N.A3, N.E3] }, // resolve to Am-ish low
    ];
    for (const ev of line) {
      for (const n of ev.chord) defeatVoice(g, t0 + ev.t, n, beat * 1.3, 0.5);
    }
    // final low pedal A drone fading out
    defeatVoice(g, t0 + beat * 3, N.A2, 1.6, 0.5);
    const end = t0 + beat * 3 + 1.8;
    g.gain.setValueAtTime(0.9, end - 0.8);
    g.gain.linearRampToValueAtTime(0.0001, end);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} restoreFromOneShot(); }, (end - ctx.currentTime + 0.2) * 1000);
  }

  // bright brass-ish fanfare voice (saw+triangle through resonant lp)
  function fanfareVoice(dest, t, midi, dur, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.02);
    g.gain.setValueAtTime(0.18 * vel, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 1;
    lp.connect(g); g.connect(dest);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(midi); o2.detune.value = 5;
    o1.connect(lp); o2.connect(lp);
    o1.start(t); o1.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  }
  function pluckFan(dest, t, midi, dur, vel) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function timpani(dest, t, midi, vel) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(mtof(midi) * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.55);
    // noise body for the hit
    const c = noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.3 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    c.connect(lp); lp.connect(cg); cg.connect(dest);
    c.start(t); c.stop(t + 0.2);
  }
  function defeatVoice(dest, t, midi, dur, vel) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi - 12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  }

  // Duck the active mode while a one-shot plays, then restore.
  let preDuckTarget = null;
  function duckForOneShot() {
    const cur = currentMode && modes[currentMode];
    if (cur && cur.active) {
      preDuckTarget = cur.target;
      cur.target = cur.target * 0.18;
      cur.gain.gain.cancelScheduledValues(ctx.currentTime);
      cur.gain.gain.setTargetAtTime(cur.target, ctx.currentTime, 0.15);
    }
  }
  function restoreFromOneShot() {
    const cur = currentMode && modes[currentMode];
    if (cur && cur.active && preDuckTarget != null) {
      cur.target = preDuckTarget;
      cur.gain.gain.setTargetAtTime(cur.target, ctx.currentTime, 0.4);
    }
    preDuckTarget = null;
  }

  // ============================================================================
  //  MODE MANAGEMENT + SCHEDULER
  // ============================================================================
  let currentMode = 'none';

  function setMode(mode) {
    if (mode === currentMode) return;
    const prev = currentMode;
    currentMode = mode;
    const now = ctx.currentTime;

    // fade out all modes that are not the new one
    for (const key of Object.keys(modes)) {
      const m = modes[key];
      if (key === mode) {
        // activate & fade in
        m.active = true;
        m.target = 0.9;
        if (!m.started) {
          // align scheduler clock to "now" so we start cleanly
          m.nextTime = now + 0.06;
          m.step = 0;
          m.started = true;
        }
        m.gain.gain.cancelScheduledValues(now);
        m.gain.gain.setValueAtTime(m.gain.gain.value, now);
        m.gain.gain.linearRampToValueAtTime(m.target, now + CROSSFADE);
        if (key === 'title') buildTitlePad();
        if (key === 'battle') buildBattleFx();
      } else if (m.active) {
        // fade out, mark for teardown when silent
        m.target = 0;
        m.gain.gain.cancelScheduledValues(now);
        m.gain.gain.setValueAtTime(m.gain.gain.value, now);
        m.gain.gain.linearRampToValueAtTime(0.0001, now + CROSSFADE);
        m.fadeOutAt = now + CROSSFADE;
      }
    }
    // 'none' just fades everything (handled by loop above; nothing to activate)
    void prev;
  }

  function scheduleMode(m, key) {
    if (!m.active) return;
    const horizonEnd = ctx.currentTime + HORIZON;
    let step, stepLen;
    if (key === 'title') stepLen = titleStep;
    else if (key === 'battle') stepLen = battleStep;
    else stepLen = bossStep;
    while (m.nextTime < horizonEnd) {
      const t = m.nextTime;
      step = m.step;
      if (key === 'title') scheduleTitle(t, step);
      else if (key === 'battle') scheduleBattle(t, step);
      else if (key === 'boss') scheduleBoss(t, step);
      m.step++;
      m.nextTime += stepLen;
    }
  }

  let lastTopUp = 0;
  function update() {
    if (ctx.state === 'suspended') return; // nothing to do until resumed
    const now = ctx.currentTime;
    // throttle scheduling work to ~LOOKAHEAD cadence (cheap per-frame guard)
    if (now - lastTopUp >= LOOKAHEAD) {
      lastTopUp = now;
      for (const key of Object.keys(modes)) {
        const m = modes[key];
        if (m.active) scheduleMode(m, key);
        // teardown a faded-out mode once its crossfade completes
        if (!m.active) continue;
        if (m.target === 0 && m.fadeOutAt != null && now >= m.fadeOutAt) {
          m.active = false;
          m.started = false;
          m.fadeOutAt = null;
          killSources(m);
          if (key === 'title') teardownTitlePad();
        }
      }
    }
  }

  return { setMode, playVictory, playDefeat, update };
}
