// sfx.js — procedural sound effects for Pokemon Arena (Web Audio API only).

export function createSfx(ctx, masterGain) {
  let noiseBuffer = null;

  // Lazily create one shared 1-second white-noise buffer.
  function getNoiseBuffer() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  // Gain envelope helper: attack to peak, then exponential-ish decay to end.
  function envelope(gainNode, t0, peak, attack, duration) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + duration);
  }

  function makeBus(peakCeiling) {
    const bus = ctx.createGain();
    bus.gain.value = peakCeiling;
    bus.connect(masterGain);
    return bus;
  }

  function makeNoiseSource(loop = false) {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = loop;
    return src;
  }

  function softClipCurve(amount = 2.5, samples = 256) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.tanh(amount * x);
    }
    return curve;
  }

  function roar() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.9;
    const bus = makeBus(1);

    // Lowpass sweep + soft distortion shared by the oscillator stack.
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(3);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 2;
    lowpass.frequency.setValueAtTime(1200, t0);
    lowpass.frequency.exponentialRampToValueAtTime(180, t0 + dur);

    const oscGain = ctx.createGain();
    envelope(oscGain, t0, 0.3, 0.06, dur);
    oscGain.connect(shaper);
    shaper.connect(lowpass);
    lowpass.connect(bus);

    const sources = [];
    for (const [freq, detune] of [[60, 0], [75, -12], [92, 9], [110, -7]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur);
      osc.connect(oscGain);
      sources.push(osc);
    }

    // Breathy bandpass noise layer.
    const noise = makeNoiseSource();
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = 1.2;
    bandpass.frequency.setValueAtTime(900, t0);
    bandpass.frequency.exponentialRampToValueAtTime(300, t0 + dur);
    const noiseGain = ctx.createGain();
    envelope(noiseGain, t0, 0.12, 0.1, dur);
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(bus);
    sources.push(noise);

    for (const src of sources) {
      src.start(t0);
      src.stop(t0 + dur);
    }
  }

  function cheer() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 2;
    const bus = makeBus(1);

    // Crowd body: looped noise through two bandpass filters.
    const crowdGain = ctx.createGain();
    crowdGain.gain.setValueAtTime(0.0001, t0);
    crowdGain.gain.linearRampToValueAtTime(0.25, t0 + 0.6);
    crowdGain.gain.setValueAtTime(0.25, t0 + 1.2);
    crowdGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    crowdGain.connect(bus);

    const noise = makeNoiseSource(true);
    for (const freq of [400, 1200]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 0.8;
      noise.connect(bp);
      bp.connect(crowdGain);
    }

    // Slow random LFO wobbling the crowd gain.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.5 + Math.random() * 2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(crowdGain.gain);

    const sources = [noise, lfo];

    // Whistle chirps: short high-passed noise bursts at random offsets.
    const chirpCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < chirpCount; i++) {
      const tc = t0 + 0.2 + Math.random() * (dur - 0.5);
      const chirp = makeNoiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500 + Math.random() * 2000;
      hp.Q.value = 6;
      const g = ctx.createGain();
      envelope(g, tc, 0.08, 0.01, 0.09);
      chirp.connect(hp);
      hp.connect(g);
      g.connect(bus);
      chirp.start(tc);
      chirp.stop(tc + 0.1);
      sources.push(chirp);
    }

    noise.start(t0);
    noise.stop(t0 + dur);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }

  function superHit() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.5;
    const bus = makeBus(1);

    // Sub-thump.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t0);
    sub.frequency.exponentialRampToValueAtTime(35, t0 + dur);
    const subGain = ctx.createGain();
    envelope(subGain, t0, 0.32, 0.005, dur);
    sub.connect(subGain);
    subGain.connect(bus);

    // Bright noise crack.
    const crack = makeNoiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const crackGain = ctx.createGain();
    envelope(crackGain, t0, 0.2, 0.003, 0.12);
    crack.connect(hp);
    hp.connect(crackGain);
    crackGain.connect(bus);

    // Upward zing.
    const zing = ctx.createOscillator();
    zing.type = 'sine';
    zing.frequency.setValueAtTime(300, t0);
    zing.frequency.exponentialRampToValueAtTime(1200, t0 + 0.25);
    const zingGain = ctx.createGain();
    envelope(zingGain, t0, 0.1, 0.01, 0.3);
    zing.connect(zingGain);
    zingGain.connect(bus);

    sub.start(t0);
    sub.stop(t0 + dur);
    crack.start(t0);
    crack.stop(t0 + 0.15);
    zing.start(t0);
    zing.stop(t0 + 0.3);
  }

  function weakHit() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.2;
    const bus = makeBus(1);

    const thud = makeNoiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const thudGain = ctx.createGain();
    envelope(thudGain, t0, 0.15, 0.005, dur);
    thud.connect(lp);
    lp.connect(thudGain);
    thudGain.connect(bus);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 100;
    const oscGain = ctx.createGain();
    envelope(oscGain, t0, 0.15, 0.005, dur);
    osc.connect(oscGain);
    oscGain.connect(bus);

    thud.start(t0);
    thud.stop(t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function countdown(n) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.12;
    const bus = makeBus(1);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = n === 0 ? 880 : 440;
    const g = ctx.createGain();
    envelope(g, t0, 0.18, 0.005, dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function levelFanfare() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const bus = makeBus(1);
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const step = 0.14;

    notes.forEach((freq, i) => {
      const tn = t0 + i * step;
      const noteDur = i === notes.length - 1 ? 0.28 : 0.16;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      envelope(g, tn, 0.22, 0.01, noteDur);
      osc.connect(g);
      g.connect(bus);
      osc.start(tn);
      osc.stop(tn + noteDur);
    });
  }

  // --- Catch-'em loop SFX -------------------------------------------------

  function ballThrow() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.25;
    const bus = makeBus(1);

    // Filtered noise sweeping up = quick whoosh.
    const noise = makeNoiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(400, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    noise.connect(bp);
    bp.connect(g);
    g.connect(bus);

    noise.start(t0);
    noise.stop(t0 + dur);
  }

  function ballBounce() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.18;
    const bus = makeBus(1);

    // Hollow "tok": short sine pluck.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(140, t0 + dur);
    const oscGain = ctx.createGain();
    envelope(oscGain, t0, 0.28, 0.002, dur);
    osc.connect(oscGain);
    oscGain.connect(bus);

    // Click transient on landing.
    const click = makeNoiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const clickGain = ctx.createGain();
    envelope(clickGain, t0, 0.15, 0.001, 0.03);
    click.connect(hp);
    hp.connect(clickGain);
    clickGain.connect(bus);

    osc.start(t0);
    osc.stop(t0 + dur);
    click.start(t0);
    click.stop(t0 + 0.04);
  }

  function ballWobble() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.15;
    const bus = makeBus(1);

    // Mechanical click.
    const click = makeNoiseSource();
    const bpClick = ctx.createBiquadFilter();
    bpClick.type = 'bandpass';
    bpClick.frequency.value = 1800;
    bpClick.Q.value = 4;
    const clickGain = ctx.createGain();
    envelope(clickGain, t0, 0.2, 0.001, 0.04);
    click.connect(bpClick);
    bpClick.connect(clickGain);
    clickGain.connect(bus);

    // Creak: short rising filtered noise after the click.
    const tc = t0 + 0.05;
    const creak = makeNoiseSource();
    const bpCreak = ctx.createBiquadFilter();
    bpCreak.type = 'bandpass';
    bpCreak.Q.value = 6;
    bpCreak.frequency.setValueAtTime(600, tc);
    bpCreak.frequency.exponentialRampToValueAtTime(1100, tc + 0.1);
    const creakGain = ctx.createGain();
    envelope(creakGain, tc, 0.12, 0.01, 0.1);
    creak.connect(bpCreak);
    bpCreak.connect(creakGain);
    creakGain.connect(bus);

    click.start(t0);
    click.stop(t0 + 0.05);
    creak.start(tc);
    creak.stop(tc + 0.1);
  }

  function catchSuccess() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const bus = makeBus(1);

    // Iconic 3-blip "ding-ding-ding!".
    const blipFreq = 1318.51; // E6
    for (let i = 0; i < 3; i++) {
      const tn = t0 + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = blipFreq;
      const g = ctx.createGain();
      envelope(g, tn, 0.16, 0.005, 0.1);
      osc.connect(g);
      g.connect(bus);
      osc.start(tn);
      osc.stop(tn + 0.1);
    }

    // Happy 4-note jingle after the blips.
    const jingleStart = t0 + 0.55;
    const notes = [659.25, 783.99, 987.77, 1318.51]; // E5 G5 B5 E6
    const step = 0.18;
    notes.forEach((freq, i) => {
      const tn = jingleStart + i * step;
      const noteDur = i === notes.length - 1 ? 0.3 : 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      envelope(g, tn, 0.24, 0.008, noteDur);
      osc.connect(g);
      g.connect(bus);
      osc.start(tn);
      osc.stop(tn + noteDur);
    });
  }

  function catchFail() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const bus = makeBus(1);

    // Descending two-tone "aww".
    const tones = [[440, 0], [330, 0.22]]; // A4 -> E4
    tones.forEach(([freq, off]) => {
      const tn = t0 + off;
      const noteDur = 0.26;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, tn);
      osc.frequency.linearRampToValueAtTime(freq * 0.94, tn + noteDur);
      const g = ctx.createGain();
      envelope(g, tn, 0.18, 0.01, noteDur);
      osc.connect(g);
      g.connect(bus);
      osc.start(tn);
      osc.stop(tn + noteDur);
    });

    // Soft noise burst = the ball pops open / break-out.
    const tb = t0 + 0.42;
    const burst = makeNoiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.7;
    const burstGain = ctx.createGain();
    envelope(burstGain, tb, 0.14, 0.005, 0.1);
    burst.connect(bp);
    bp.connect(burstGain);
    burstGain.connect(bus);
    burst.start(tb);
    burst.stop(tb + 0.1);
  }

  function encounter() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.6;
    const bus = makeBus(1);

    // Tense rising stinger: two detuned saws sweeping up.
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(660, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur);
    }

    // Tremolo shimmer on top via a fast LFO-driven gain.
    const top = ctx.createOscillator();
    top.type = 'triangle';
    top.frequency.setValueAtTime(880, t0);
    top.frequency.exponentialRampToValueAtTime(1320, t0 + dur);
    const topGain = ctx.createGain();
    topGain.gain.setValueAtTime(0.0001, t0);
    topGain.gain.linearRampToValueAtTime(0.08, t0 + dur);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(topGain.gain);
    top.connect(topGain);
    topGain.connect(bus);
    top.start(t0);
    top.stop(t0 + dur);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }

  function wildCry(typeStr) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.3;
    const bus = makeBus(1);

    // Per-type voice: waveform, base pitch and warble depth/speed.
    const voices = {
      fire:     { type: 'sawtooth', base: 520, warbleHz: 22, warbleCents: 60 },
      water:    { type: 'sine',     base: 440, warbleHz: 9,  warbleCents: 90 },
      grass:    { type: 'triangle', base: 480, warbleHz: 14, warbleCents: 50 },
      electric: { type: 'square',   base: 720, warbleHz: 30, warbleCents: 40 },
      rock:     { type: 'square',   base: 300, warbleHz: 7,  warbleCents: 70 },
    };
    const v = voices[typeStr] || { type: 'triangle', base: 600, warbleHz: 16, warbleCents: 55 };

    const osc = ctx.createOscillator();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.base, t0);
    osc.frequency.exponentialRampToValueAtTime(v.base * 1.4, t0 + dur);

    // Warble: LFO modulating detune.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = v.warbleHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = v.warbleCents;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);

    const g = ctx.createGain();
    envelope(g, t0, 0.22, 0.01, dur);
    osc.connect(g);
    g.connect(bus);

    osc.start(t0);
    osc.stop(t0 + dur);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }

  return {
    roar, cheer, superHit, weakHit, countdown, levelFanfare,
    ballThrow, ballBounce, ballWobble, catchSuccess, catchFail, encounter, wildCry,
  };
}
