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

  return { roar, cheer, superHit, weakHit, countdown, levelFanfare };
}
