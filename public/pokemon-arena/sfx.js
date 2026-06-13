// public/pokemon-arena/sfx.js
// POKÉMON ARENA — Sound FX bank (pure Web Audio, no three.js, no DOM).
// export function createSfx(ctx, out) -> method object (see contract).
//
// Design: one shared noise buffer, one master sfx bus (Gain ~0.8) ->
// DynamicsCompressor -> out. Every method is layered (2-3 components) with
// slight per-call random pitch/time variation and per-element timbre. All
// methods are guarded so calling them before ctx.resume()/while suspended
// never throws.

const ELEMENTS = ['fire', 'water', 'grass', 'electric', 'rock'];

// Per-element tonal centers / character. Used by roar/hit/burst/beam/etc.
const ELEM = {
  fire:     { base: 220, type: 'sawtooth', hue: 1.0,  sub: 70  },
  water:    { base: 180, type: 'sine',     hue: 0.55, sub: 60  },
  grass:    { base: 300, type: 'triangle', hue: 0.8,  sub: 90  },
  electric: { base: 340, type: 'square',   hue: 1.2,  sub: 80  },
  rock:     { base: 130, type: 'sawtooth', hue: 0.45, sub: 45  },
};

function rnd(a, b) { return a + Math.random() * (b - a); }

export function createSfx(ctx, out) {
  // ---- master bus -------------------------------------------------------
  let bus, comp;
  try {
    bus = ctx.createGain();
    bus.gain.value = 0.8;
    comp = ctx.createDynamicsCompressor();
    // gentle glue compressor
    try {
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
    } catch (e) { /* some props read-only in odd impls */ }
    bus.connect(comp);
    comp.connect(out || ctx.destination);
  } catch (e) {
    // If even bus creation failed, return a no-op API so callers never crash.
    return noopApi();
  }

  // ---- shared noise buffer (one, reused everywhere) ---------------------
  let noiseBuf = null;
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    try {
      const len = Math.floor(ctx.sampleRate * 2.0); // 2s of noise, loopable
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = buf;
    } catch (e) { noiseBuf = null; }
    return noiseBuf;
  }

  // ---- tiny helpers -----------------------------------------------------
  function now() { return ctx.currentTime; }

  function osc(type, freq, t0) {
    const o = ctx.createOscillator();
    o.type = type;
    try { o.frequency.setValueAtTime(freq, t0); } catch (e) { o.frequency.value = freq; }
    return o;
  }

  function gain(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }

  function noiseSrc(loop) {
    const b = getNoise();
    if (!b) return null;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.loop = !!loop;
    return s;
  }

  // ADSR-ish gain envelope; returns the gain node already connected to dest.
  function env(t0, peak, atk, dec, sus, rel, dur, dest) {
    const g = ctx.createGain();
    const tg = g.gain;
    try {
      tg.setValueAtTime(0.0001, t0);
      tg.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
      tg.exponentialRampToValueAtTime(Math.max(0.0002, peak * sus), t0 + atk + dec);
      tg.setValueAtTime(Math.max(0.0002, peak * sus), t0 + Math.max(atk + dec, dur));
      tg.exponentialRampToValueAtTime(0.0001, t0 + Math.max(atk + dec, dur) + rel);
    } catch (e) {
      tg.value = peak;
    }
    g.connect(dest);
    return g;
  }

  // Quick percussive blip helper. Returns nothing; fire-and-forget.
  function blip(type, f0, f1, t0, dur, peak, dest) {
    try {
      const o = osc(type, f0, t0);
      try { o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur); } catch (e) {}
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || bus);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { /* swallow */ }
  }

  function pickElem(element) {
    return ELEM[element] || ELEM.fire;
  }

  // Per-element noise coloring: returns {src, node} where node is the final
  // node to connect to a gain. src must be started/stopped by caller.
  function elemNoise(element, t0, dur) {
    const s = noiseSrc(false);
    if (!s) return null;
    const e = element;
    let node = s;
    try {
      if (e === 'water') {
        // bubbly: lowpass + a wobbling resonance
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(rnd(500, 800), t0);
        lp.Q.value = 6;
        const lfo = osc('sine', rnd(6, 11), t0);
        const lfg = gain(rnd(120, 260));
        lfo.connect(lfg); lfg.connect(lp.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
        s.connect(lp); node = lp;
      } else if (e === 'fire') {
        // crackly: bandpass-ish hiss high
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = rnd(900, 1500);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(1800, 3200);
        bp.Q.value = 0.8;
        s.connect(hp); hp.connect(bp); node = bp;
      } else if (e === 'grass') {
        // woody: narrow bandpass, midrange
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(700, 1100);
        bp.Q.value = 3.5;
        s.connect(bp); node = bp;
      } else if (e === 'electric') {
        // zappy: highpass crunch
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = rnd(1200, 2200);
        hp.Q.value = 1.2;
        s.connect(hp); node = hp;
      } else { // rock
        // dusty rumble: lowpass low
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = rnd(300, 600);
        s.connect(lp); node = lp;
      }
    } catch (err) { node = s; }
    return { src: s, node };
  }

  // ======================================================================
  // METHODS
  // ======================================================================

  function roar(element) {
    try {
      const e = pickElem(element);
      const t0 = now() + 0.001;
      const dur = rnd(0.55, 0.8);
      const det = rnd(0.94, 1.06);

      // L1: growling low body (two detuned saws sweeping down)
      const o1 = osc(e.type, e.base * det, t0);
      const o2 = osc(e.type, e.base * det * 0.5, t0);
      try {
        o1.frequency.exponentialRampToValueAtTime(e.base * det * 0.55, t0 + dur);
        o2.frequency.exponentialRampToValueAtTime(e.base * det * 0.28, t0 + dur);
      } catch (er) {}
      const g1 = env(t0, 0.5, 0.05, 0.18, 0.6, 0.22, dur, bus);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(rnd(1400, 2000), t0);
      try { lp.frequency.exponentialRampToValueAtTime(rnd(500, 800), t0 + dur); } catch (er) {}
      o1.connect(lp); o2.connect(lp); lp.connect(g1);
      o1.start(t0); o2.start(t0); o1.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);

      // L2: sub thump for weight
      blip('sine', e.sub * 1.6, e.sub * 0.7, t0, dur * 0.7, 0.45, bus);

      // L3: element textured noise overlay
      const n = elemNoise(element, t0, dur);
      if (n) {
        const ng = env(t0, 0.25, 0.03, 0.2, 0.5, 0.2, dur, bus);
        n.node.connect(ng);
        n.src.start(t0); n.src.stop(t0 + dur + 0.1);
      }
    } catch (e) { /* guard */ }
  }

  function cheer(intensity01) {
    try {
      const I = Math.max(0, Math.min(1, intensity01 == null ? 0.6 : intensity01));
      const t0 = now() + 0.001;
      const dur = rnd(1.1, 1.6);

      // crowd = filtered noise swell (bandpass) panning brightness w/ intensity
      const n = noiseSrc(true);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700 + I * 1400;
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.06 + I * 0.22, t0 + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        n.connect(bp); bp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // whistle chirps scaling with intensity
      const chirps = 2 + Math.round(I * 5);
      for (let i = 0; i < chirps; i++) {
        const ct = t0 + rnd(0.05, dur * 0.8);
        blip('sine', rnd(1600, 2400), rnd(2600, 3600), ct, rnd(0.08, 0.16), 0.05 + I * 0.07, bus);
      }
      // clap-ish noise bursts
      const claps = 3 + Math.round(I * 6);
      for (let i = 0; i < claps; i++) {
        const cn = noiseSrc(false);
        if (!cn) break;
        const ct = t0 + rnd(0.02, dur * 0.9);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = rnd(1500, 3000);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ct);
        g.gain.exponentialRampToValueAtTime(0.04 + I * 0.05, ct + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.05);
        cn.connect(hp); hp.connect(g); g.connect(bus);
        cn.start(ct); cn.stop(ct + 0.08);
      }
    } catch (e) { /* guard */ }
  }

  function hit(element, power01) {
    try {
      const P = Math.max(0, Math.min(1, power01 == null ? 0.5 : power01));
      const e = pickElem(element);
      const t0 = now() + 0.001;
      const dur = 0.18 + P * 0.22;

      // L1: punchy body (pitch-dropped sine/tri)
      blip('sine', (e.sub + 60) * (1 + P), e.sub * 0.6, t0, dur, 0.5 + P * 0.4, bus);
      // L2: impact noise transient, element-colored
      const n = elemNoise(element, t0, dur);
      if (n) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.3 + P * 0.4, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.8);
        n.node.connect(g); g.connect(bus);
        n.src.start(t0); n.src.stop(t0 + dur + 0.05);
      }
      // L3: bright crack for clarity, scaled by power
      blip(e.type, e.base * (2 + P * 1.5), e.base * 0.9, t0, 0.08 + P * 0.06, 0.18 + P * 0.22, bus);
    } catch (e) { /* guard */ }
  }

  function swing() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(0.16, 0.24);
      // whoosh: bandpass noise sweeping up then fading
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(rnd(400, 600), t0);
        try { bp.frequency.exponentialRampToValueAtTime(rnd(1800, 2600), t0 + dur); } catch (e) {}
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.28, t0 + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.connect(bp); bp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // subtle air tone
      blip('sine', rnd(300, 420), rnd(140, 200), t0, dur, 0.08, bus);
    } catch (e) { /* guard */ }
  }

  function dodge() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(0.14, 0.2);
      // quick airy down-whoosh
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(rnd(1800, 2400), t0);
        try { bp.frequency.exponentialRampToValueAtTime(rnd(500, 700), t0 + dur); } catch (e) {}
        bp.Q.value = 2.0;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.connect(bp); bp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // pitch blip cue (i-frame feedback)
      blip('triangle', rnd(620, 760), rnd(320, 400), t0, dur, 0.12, bus);
    } catch (e) { /* guard */ }
  }

  function burst(element) {
    try {
      const e = pickElem(element);
      const t0 = now() + 0.001;
      const dur = rnd(0.5, 0.7);
      // L1: explosive sub boom
      blip('sine', e.sub * 2.2, e.sub * 0.5, t0, dur, 0.6, bus);
      // L2: element noise blast
      const n = elemNoise(element, t0, dur);
      if (n) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.node.connect(g); g.connect(bus);
        n.src.start(t0); n.src.stop(t0 + dur + 0.05);
      }
      // L3: tonal flash sweep colored by element
      const o = osc(e.type, e.base * 2.2, t0);
      try { o.frequency.exponentialRampToValueAtTime(e.base * 0.8, t0 + dur * 0.7); } catch (er) {}
      const g2 = env(t0, 0.3, 0.01, 0.25, 0.3, 0.2, dur * 0.6, bus);
      o.connect(g2);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* guard */ }
  }

  function beamStart(element) {
    // Returns a stop() that releases over ~0.15s. Always returns a function.
    try {
      const e = pickElem(element);
      const t0 = now() + 0.001;
      const det = rnd(0.97, 1.03);

      const masterG = ctx.createGain();
      masterG.gain.setValueAtTime(0.0001, t0);
      masterG.gain.exponentialRampToValueAtTime(0.32, t0 + 0.08);
      masterG.connect(bus);

      // L1: sustained drone (two detuned element-type oscillators)
      const o1 = osc(e.type, e.base * det, t0);
      const o2 = osc(e.type, e.base * det * 1.005, t0);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = e.base * 6;
      o1.connect(lp); o2.connect(lp); lp.connect(masterG);
      o1.start(t0); o2.start(t0);

      // L2: roaring element noise bed (looping)
      let nsrc = noiseSrc(true);
      let lfo = null, lfg = null;
      if (nsrc) {
        const bp = ctx.createBiquadFilter();
        bp.type = (element === 'rock') ? 'lowpass' : 'bandpass';
        bp.frequency.value = (element === 'rock') ? 500 : (element === 'electric' ? 2400 : 1400);
        bp.Q.value = 0.8;
        const ng = gain(0.5);
        // shimmer LFO on cutoff for life
        lfo = osc('sine', rnd(5, 9), t0);
        lfg = gain(bp.frequency.value * 0.3);
        lfo.connect(lfg); lfg.connect(bp.frequency);
        lfo.start(t0);
        nsrc.connect(bp); bp.connect(ng); ng.connect(masterG);
        nsrc.start(t0);
      }

      // L3: jitter cue for electric / crackle, low-rate retrigger blips
      let jitterTimer = null;
      if (element === 'electric' || element === 'fire') {
        const fire = () => {
          const jt = now();
          blip(element === 'electric' ? 'square' : 'sawtooth',
               rnd(800, 2000), rnd(400, 900), jt, 0.04, 0.12, masterG);
        };
        try { jitterTimer = setInterval(fire, 70); } catch (er) { jitterTimer = null; }
      }

      let stopped = false;
      function stop() {
        if (stopped) return;
        stopped = true;
        try {
          const ts = now();
          masterG.gain.cancelScheduledValues(ts);
          masterG.gain.setValueAtTime(Math.max(0.0002, masterG.gain.value || 0.32), ts);
          masterG.gain.exponentialRampToValueAtTime(0.0001, ts + 0.15);
          const end = ts + 0.18;
          try { o1.stop(end); o2.stop(end); } catch (er) {}
          if (nsrc) { try { nsrc.stop(end); } catch (er) {} }
          if (lfo) { try { lfo.stop(end); } catch (er) {} }
          if (jitterTimer != null) { try { clearInterval(jitterTimer); } catch (er) {} }
        } catch (er) { /* guard */ }
      }
      return stop;
    } catch (e) {
      return function () {};
    }
  }

  function spin() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(0.45, 0.6);
      // rising rotational whoosh with amplitude tremolo (the "spin")
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(rnd(500, 700), t0);
        try { bp.frequency.exponentialRampToValueAtTime(rnd(1600, 2200), t0 + dur * 0.7); } catch (e) {}
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.26, t0 + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        // tremolo
        const trem = osc('sine', rnd(14, 22), t0);
        const trg = gain(0.12);
        trem.connect(trg); trg.connect(g.gain);
        trem.start(t0); trem.stop(t0 + dur + 0.05);
        n.connect(bp); bp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // impact at the end (slam)
      blip('sine', 160, 60, t0 + dur * 0.85, 0.2, 0.45, bus);
    } catch (e) { /* guard */ }
  }

  function bite() {
    try {
      const t0 = now() + 0.001;
      // two-snap chomp
      const snap = (tt) => {
        const n = noiseSrc(false);
        if (n) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = rnd(1200, 2200); bp.Q.value = 2;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.3, tt + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
          n.connect(bp); bp.connect(g); g.connect(bus);
          n.start(tt); n.stop(tt + 0.07);
        }
        blip('square', rnd(380, 520), rnd(120, 180), tt, 0.06, 0.2, bus);
      };
      snap(t0);
      snap(t0 + rnd(0.05, 0.08));
    } catch (e) { /* guard */ }
  }

  function wingFlap() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(0.18, 0.28);
      // low-passed noise gust with quick amplitude pump
      const n = noiseSrc(false);
      if (n) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(rnd(300, 500), t0);
        try { lp.frequency.linearRampToValueAtTime(rnd(700, 1000), t0 + dur * 0.5); } catch (e) {}
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.22, t0 + dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.connect(lp); lp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // soft low thump
      blip('sine', rnd(120, 170), rnd(70, 90), t0, dur * 0.6, 0.16, bus);
    } catch (e) { /* guard */ }
  }

  function step() {
    try {
      const t0 = now() + 0.001;
      // dull thud + tiny gravel noise
      blip('sine', rnd(110, 150), rnd(50, 70), t0, 0.1, 0.3, bus);
      const n = noiseSrc(false);
      if (n) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = rnd(500, 900);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
        n.connect(lp); lp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + 0.1);
      }
    } catch (e) { /* guard */ }
  }

  function levelUp() {
    try {
      const t0 = now() + 0.001;
      // ascending major arpeggio + shimmer
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((f, i) => {
        const tt = t0 + i * 0.09;
        blip('triangle', f * rnd(0.998, 1.002), f, tt, 0.22, 0.26, bus);
        blip('sine', f * 2, f * 2, tt, 0.14, 0.1, bus); // octave sparkle
      });
      // rising noise shimmer
      const n = noiseSrc(false);
      if (n) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(800, t0);
        try { hp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.5); } catch (e) {}
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.08, t0 + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        n.connect(hp); hp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + 0.65);
      }
    } catch (e) { /* guard */ }
  }

  function megaSurge() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(1.0, 1.3);
      // L1: huge rising power sweep
      const o = osc('sawtooth', 80, t0);
      try { o.frequency.exponentialRampToValueAtTime(rnd(600, 900), t0 + dur * 0.8); } catch (e) {}
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t0);
      try { lp.frequency.exponentialRampToValueAtTime(5000, t0 + dur * 0.8); } catch (e) {}
      const g = env(t0, 0.4, 0.1, 0.3, 0.7, 0.3, dur * 0.8, bus);
      o.connect(lp); lp.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.05);
      // L2: noise riser
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(400, t0);
        try { bp.frequency.exponentialRampToValueAtTime(6000, t0 + dur * 0.85); } catch (e) {}
        bp.Q.value = 0.8;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.linearRampToValueAtTime(0.22, t0 + dur * 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.connect(bp); bp.connect(ng); ng.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
      // L3: triumphant chord stab at the apex
      const ct = t0 + dur * 0.8;
      [261.63, 329.63, 392.0, 523.25].forEach((f) => blip('sawtooth', f, f, ct, 0.4, 0.16, bus));
      blip('sine', 60, 40, ct, 0.5, 0.5, bus); // sub slam
    } catch (e) { /* guard */ }
  }

  function select() {
    try {
      const t0 = now() + 0.001;
      blip('triangle', rnd(620, 680), rnd(880, 940), t0, 0.1, 0.24, bus);
      blip('sine', rnd(1240, 1320), rnd(1240, 1320), t0 + 0.02, 0.08, 0.1, bus);
    } catch (e) { /* guard */ }
  }

  function uiMove() {
    try {
      const t0 = now() + 0.001;
      blip('square', rnd(440, 500), rnd(560, 620), t0, 0.06, 0.14, bus);
    } catch (e) { /* guard */ }
  }

  function counter() {
    try {
      const t0 = now() + 0.001;
      // sharp metallic "ting" + sub punch (a satisfying parry)
      blip('square', 1400, 2200, t0, 0.12, 0.2, bus);
      blip('triangle', 700, 1100, t0, 0.16, 0.18, bus);
      blip('sine', 140, 60, t0, 0.18, 0.4, bus);
      // bright noise sparkle
      const n = noiseSrc(false);
      if (n) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 3000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
        n.connect(hp); hp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + 0.12);
      }
    } catch (e) { /* guard */ }
  }

  function fireworks() {
    try {
      const t0 = now() + 0.001;
      const bursts = 3 + Math.floor(rnd(0, 3));
      for (let i = 0; i < bursts; i++) {
        const bt = t0 + i * rnd(0.18, 0.32);
        // launch whistle
        blip('sine', rnd(800, 1100), rnd(1600, 2200), bt - 0.18, 0.18, 0.08, bus);
        // boom
        blip('sine', rnd(120, 180), rnd(50, 70), bt, rnd(0.3, 0.5), 0.5, bus);
        // crackle shower
        const n = noiseSrc(false);
        if (n) {
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass'; hp.frequency.value = rnd(2500, 4000);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, bt);
          g.gain.exponentialRampToValueAtTime(0.25, bt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, bt + rnd(0.3, 0.5));
          // sputter tremolo
          const trem = osc('square', rnd(18, 30), bt);
          const trg = gain(0.1);
          trem.connect(trg); trg.connect(g.gain);
          trem.start(bt); trem.stop(bt + 0.55);
          n.connect(hp); hp.connect(g); g.connect(bus);
          n.start(bt); n.stop(bt + 0.6);
        }
      }
    } catch (e) { /* guard */ }
  }

  function announcer() {
    try {
      const t0 = now() + 0.001;
      // attention "ding-dong" chime pair (PA system feel)
      blip('sine', 880, 880, t0, 0.35, 0.3, bus);
      blip('sine', 1320, 1320, t0, 0.35, 0.18, bus); // harmonic
      blip('sine', 659.25, 659.25, t0 + 0.4, 0.45, 0.3, bus);
      blip('sine', 988, 988, t0 + 0.4, 0.45, 0.16, bus);
    } catch (e) { /* guard */ }
  }

  function hurt() {
    try {
      const t0 = now() + 0.001;
      const dur = rnd(0.22, 0.32);
      // pained down-grunt
      const o = osc('sawtooth', rnd(260, 320), t0);
      try { o.frequency.exponentialRampToValueAtTime(rnd(110, 150), t0 + dur); } catch (e) {}
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1200;
      const g = env(t0, 0.34, 0.01, 0.12, 0.5, 0.16, dur, bus);
      o.connect(lp); lp.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.05);
      // breathy noise
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = rnd(700, 1100); bp.Q.value = 1;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.exponentialRampToValueAtTime(0.14, t0 + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        n.connect(bp); bp.connect(ng); ng.connect(bus);
        n.start(t0); n.stop(t0 + dur + 0.05);
      }
    } catch (e) { /* guard */ }
  }

  // ---- persistent wind (lazy, single looping node) ----------------------
  let windSrc = null, windLP = null, windGain = null, windInit = false;
  function ensureWind() {
    if (windInit) return windInit;
    try {
      const s = noiseSrc(true);
      if (!s) return false;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      lp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.0; // silent until setWind raises it
      s.connect(lp); lp.connect(g); g.connect(bus);
      // slow flutter LFO on cutoff for a living wind
      try {
        const lfo = osc('sine', 0.18, now());
        const lfg = gain(120);
        lfo.connect(lfg); lfg.connect(lp.frequency);
        lfo.start(now());
      } catch (e) {}
      s.start(now());
      windSrc = s; windLP = lp; windGain = g; windInit = true;
    } catch (e) { windInit = false; }
    return windInit;
  }

  function setWind(level01) {
    try {
      if (!ensureWind()) return;
      const L = Math.max(0, Math.min(1, level01 == null ? 0 : level01));
      const t = now();
      const tg = windGain.gain;
      tg.cancelScheduledValues(t);
      tg.setValueAtTime(Math.max(0.0001, tg.value), t);
      tg.linearRampToValueAtTime(L * 0.35, t + 0.6); // 0 -> 0.35
      const fc = windLP.frequency;
      fc.cancelScheduledValues(t);
      fc.setValueAtTime(Math.max(20, fc.value), t);
      fc.linearRampToValueAtTime(300 + L * 2100, t + 0.6); // 300 -> 2400 Hz
    } catch (e) { /* guard */ }
  }

  // ---- catch ball mechanics --------------------------------------------
  function catchBall() {
    try {
      const t0 = now() + 0.001;
      // 1) throw whoosh
      const n = noiseSrc(false);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(rnd(500, 700), t0);
        try { bp.frequency.exponentialRampToValueAtTime(rnd(1800, 2400), t0 + 0.22); } catch (e) {}
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.24, t0 + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
        n.connect(bp); bp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + 0.3);
      }
      // 2) click as ball hits / opens (metallic tick)
      const clickT = t0 + 0.28;
      blip('square', 2200, 1400, clickT, 0.05, 0.2, bus);
      blip('triangle', 900, 600, clickT, 0.06, 0.14, bus);
      // 3) three wobble ticks (the suspense)
      for (let i = 0; i < 3; i++) {
        const wt = clickT + 0.45 + i * 0.5 + rnd(-0.03, 0.03);
        blip('sine', rnd(420, 480), rnd(300, 340), wt, 0.09, 0.18, bus);
        blip('triangle', rnd(840, 920), rnd(620, 680), wt, 0.06, 0.07, bus);
      }
      // 4) sparkle tail (hint of success; full confirm is catchSuccess)
      const sparkleT = clickT + 0.45 + 3 * 0.5 + 0.2;
      [1568, 2093, 2637].forEach((f, i) => {
        blip('sine', f, f, sparkleT + i * 0.05, 0.18, 0.1, bus);
      });
    } catch (e) { /* guard */ }
  }

  function catchSuccess() {
    try {
      const t0 = now() + 0.001;
      // bright confirmation jingle (the classic "got it!" lift)
      const notes = [659.25, 880, 1108.73, 1318.51]; // E5 A5 C#6 E6
      notes.forEach((f, i) => {
        const tt = t0 + i * 0.08;
        blip('triangle', f, f, tt, 0.2, 0.26, bus);
        blip('sine', f * 2, f * 2, tt, 0.12, 0.09, bus);
      });
      // warm pad swell underneath
      const ct = t0 + 0.05;
      [329.63, 415.30, 493.88].forEach((f) => blip('sine', f, f, ct, 0.5, 0.12, bus));
      // shimmer
      const n = noiseSrc(false);
      if (n) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(2000, t0);
        try { hp.frequency.exponentialRampToValueAtTime(7000, t0 + 0.4); } catch (e) {}
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.08, t0 + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        n.connect(hp); hp.connect(g); g.connect(bus);
        n.start(t0); n.stop(t0 + 0.55);
      }
    } catch (e) { /* guard */ }
  }

  return {
    roar, cheer, hit, swing, dodge, burst, beamStart, spin, bite, wingFlap,
    step, levelUp, megaSurge, select, uiMove, counter, fireworks, announcer,
    hurt, setWind, catchBall, catchSuccess,
  };
}

// Fallback no-op API if even the audio bus could not be constructed; keeps
// the engine running silently rather than throwing.
function noopApi() {
  const fn = function () {};
  const beam = function () { return function () {}; };
  return {
    roar: fn, cheer: fn, hit: fn, swing: fn, dodge: fn, burst: fn,
    beamStart: beam, spin: fn, bite: fn, wingFlap: fn, step: fn,
    levelUp: fn, megaSurge: fn, select: fn, uiMove: fn, counter: fn,
    fireworks: fn, announcer: fn, hurt: fn, setWind: fn,
    catchBall: fn, catchSuccess: fn,
  };
}
