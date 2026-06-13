// perf.js — quality detection + adaptive pixel-ratio governor.
// No imports: operates purely on the renderer/composer objects passed in.

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;

// Tier table (see contract):
// high:   pr=min(devicePixelRatio,2), shadow 2048, crowd 2200, grass 9000, bloom on.
// medium: pr<=1.5, shadow 1024, crowd 1200, grass 4500, bloom on.
// low:    pr<=1.25, shadow 1024, crowd 700, grass 2200, bloom on (cheap).
const TIERS = {
  high:   { shadowMapSize: 2048, crowdCount: 2200, grassCount: 9000, cloudCount: 26, bloom: true },
  medium: { shadowMapSize: 1024, crowdCount: 1200, grassCount: 4500, cloudCount: 16, bloom: true },
  low:    { shadowMapSize: 1024, crowdCount: 700,  grassCount: 2200, cloudCount: 9,  bloom: true },
};

export function detectQuality() {
  const nav = (typeof navigator !== 'undefined') ? navigator : {};
  const ua = nav.userAgent || '';
  const isMobile = (nav.maxTouchPoints > 1) || MOBILE_UA_RE.test(ua);

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const sw = (typeof window !== 'undefined' && window.screen) ? window.screen.width : 1920;
  const sh = (typeof window !== 'undefined' && window.screen) ? window.screen.height : 1080;
  const screenMax = Math.max(sw, sh);

  // deviceMemory hint (GB) if the browser exposes it.
  const mem = (typeof nav.deviceMemory === 'number') ? nav.deviceMemory : null;

  let tier;
  if (isMobile) {
    tier = 'low'; // mobile default
  } else {
    tier = 'high';
    if (screenMax < 1280) tier = 'medium';       // small desktop screens
    if (mem !== null && mem <= 4) tier = 'medium';
    if (mem !== null && mem <= 2) tier = 'low';
  }

  let pixelRatio;
  if (tier === 'high')        pixelRatio = Math.min(dpr, 2);
  else if (tier === 'medium') pixelRatio = Math.min(dpr, 1.5);
  else                        pixelRatio = Math.min(dpr, 1.25);

  const t = TIERS[tier];
  return {
    tier,
    isMobile,
    pixelRatio,
    shadowMapSize: t.shadowMapSize,
    crowdCount: t.crowdCount,
    grassCount: t.grassCount,
    cloudCount: t.cloudCount,
    bloom: t.bloom,
  };
}

export function createPerf({ renderer, composer, quality }) {
  const EMA_ALPHA = 0.05;
  const SLOW_THRESHOLD = 1 / 42;  // EMA above this → too slow
  const FAST_THRESHOLD = 1 / 58;  // EMA below this → headroom to step up
  const SLOW_SUSTAIN = 2;         // seconds slow before stepping down
  const FAST_SUSTAIN = 4;         // seconds fast before stepping up
  const COOLDOWN = 5;             // seconds between any two steps
  const STEP = 0.15;
  const SPIKE_DT = 0.25;          // ignore tab-switch spikes

  const maxRatio = quality.pixelRatio;
  const minRatio = 0.6 * quality.pixelRatio;

  let ema = 1 / 60;
  let currentRatio = maxRatio;
  let slowTime = 0;
  let fastTime = 0;
  let cooldown = 0;

  function applyRatio(r) {
    currentRatio = r;
    renderer.setPixelRatio(r);
    if (composer) {
      if (typeof composer.setPixelRatio === 'function') composer.setPixelRatio(r);
      if (typeof composer.setSize === 'function') {
        composer.setSize(window.innerWidth, window.innerHeight);
      }
    }
  }

  function update(dt) {
    if (!(dt > 0) || dt > SPIKE_DT) return; // ignore spikes / bad samples

    ema += EMA_ALPHA * (dt - ema);
    if (cooldown > 0) cooldown -= dt;

    if (ema > SLOW_THRESHOLD) {
      slowTime += dt;
      fastTime = 0;
    } else if (ema < FAST_THRESHOLD) {
      fastTime += dt;
      slowTime = 0;
    } else {
      slowTime = 0;
      fastTime = 0;
    }

    if (cooldown > 0) return;

    if (slowTime >= SLOW_SUSTAIN && currentRatio > minRatio + 1e-6) {
      applyRatio(Math.max(minRatio, currentRatio - STEP));
      slowTime = 0;
      fastTime = 0;
      cooldown = COOLDOWN;
    } else if (fastTime >= FAST_SUSTAIN && currentRatio < maxRatio - 1e-6) {
      applyRatio(Math.min(maxRatio, currentRatio + STEP));
      slowTime = 0;
      fastTime = 0;
      cooldown = COOLDOWN;
    }
  }

  return { update };
}
