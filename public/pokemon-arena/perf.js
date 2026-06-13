// perf.js — adaptive quality controller for the arena renderer.
// Watches an EMA of frame time and steps the render resolution / bloom
// strength through four quality tiers. Self-contained ES module: operates
// only on the objects passed in (no three.js import).

// Tier table: pixel-ratio scale (relative to maxPixelRatio) and bloom strength.
const TIERS = [
  { scale: 1.0,  bloom: 0.85 }, // T0 — full quality
  { scale: 0.85, bloom: 0.7  }, // T1
  { scale: 0.7,  bloom: 0.55 }, // T2
  { scale: 0.55, bloom: 0.35 }, // T3 — floor
];

const EMA_ALPHA = 0.1;       // smoothing for the frame-time average
const WARMUP = 2;            // seconds: ignore >40ms spikes while loading settles
const DOWN_MS = 22;          // EMA above this => candidate for stepping down
const UP_MS = 13;            // EMA below this => candidate for stepping up
const DOWN_HOLD = 3;         // seconds the EMA must stay bad before stepping down
const UP_HOLD = 10;          // seconds the EMA must stay good before stepping up
const COOLDOWN = 8;          // seconds after any tier change before the next

export function createAdaptiveQuality({ renderer, composer, bloomPass, maxPixelRatio }) {
  const maxPR = typeof maxPixelRatio === 'number' && maxPixelRatio > 0 ? maxPixelRatio : 1;

  let tier = 0;
  let emaMs = 16;        // start near a healthy 60fps frame
  let elapsed = 0;       // total time fed through update()
  let badTime = 0;       // continuous seconds with EMA > DOWN_MS
  let goodTime = 0;      // continuous seconds with EMA < UP_MS
  let cooldown = 0;      // seconds remaining before another tier change

  function targetRatio() {
    return maxPR * TIERS[tier].scale;
  }

  // Push current tier settings to renderer/composer/bloom. Guarded so a
  // missing object (e.g. bloom disabled) is a no-op rather than a crash.
  function apply() {
    const ratio = targetRatio();
    if (renderer && typeof renderer.setPixelRatio === 'function') {
      renderer.setPixelRatio(ratio);
    }
    // composer must be resized after a pixel-ratio change or it renders stale buffers
    if (composer && typeof composer.setSize === 'function') {
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (bloomPass) {
      bloomPass.strength = TIERS[tier].bloom;
    }
  }

  apply(); // establish T0 immediately

  function update(dt) {
    if (!(dt > 0)) return;
    elapsed += dt;
    if (cooldown > 0) cooldown -= dt;

    // During warmup, asset loads / shader compiles cause spikes that would
    // poison the EMA — skip samples over 40ms for the first WARMUP seconds.
    const ms = dt * 1000;
    if (!(elapsed < WARMUP && ms > 40)) {
      emaMs += (ms - emaMs) * EMA_ALPHA;
    }

    // Track how long the EMA has been continuously bad / good.
    badTime = emaMs > DOWN_MS ? badTime + dt : 0;
    goodTime = emaMs < UP_MS ? goodTime + dt : 0;

    if (cooldown <= 0) {
      if (badTime >= DOWN_HOLD && tier < TIERS.length - 1) {
        tier += 1;
        cooldown = COOLDOWN;
        badTime = 0;
        goodTime = 0;
        apply();
      } else if (goodTime >= UP_HOLD && tier > 0) {
        tier -= 1;
        cooldown = COOLDOWN;
        badTime = 0;
        goodTime = 0;
        apply();
      }
    }

    // External resize handlers may call renderer.setPixelRatio themselves;
    // cheaply re-assert our target so we don't fight them.
    if (renderer && typeof renderer.getPixelRatio === 'function' &&
        Math.abs(renderer.getPixelRatio() - targetRatio()) > 1e-3) {
      apply();
    }
  }

  return {
    update,
    get tier() { return tier; },
  };
}
