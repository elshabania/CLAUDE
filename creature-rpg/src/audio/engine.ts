// Public audio API. Tone.js and the whole audio runtime are lazy-loaded on the first user gesture
// (startAudio). Before that — or where no AudioContext exists (node, old browsers) — every call is a
// safe no-op; the latest music request is remembered and applied once audio starts.
import type { AudioRuntime } from './boot';

let rt: AudioRuntime | null = null;
let starting: Promise<void> | null = null;
let failed = false;

// Requests made before start: only the latest music state survives.
const pending: { zone?: string | null; battle?: { kind: string; cantorType?: string } | null; intensity: boolean } = { intensity: false };

function ctor(): (new (opts?: AudioContextOptions) => AudioContext) | null {
  try {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

export async function startAudio(): Promise<void> {
  try {
    if (rt) {
      rt.resume();
      return;
    }
    if (failed) return;
    if (starting) return await starting;
    const C = ctor();
    if (!C) {
      failed = true;
      return;
    }
    // Create and resume the raw context synchronously inside the gesture (Safari/iOS requirement).
    let raw: AudioContext;
    try {
      raw = new C({ latencyHint: 'interactive' });
      void raw.resume?.().catch(() => {});
    } catch {
      failed = true;
      return;
    }
    starting = (async () => {
      try {
        const mod = await import('./boot');
        rt = mod.boot(raw);
        if (pending.battle) {
          rt.battle(pending.battle.kind, pending.battle.cantorType);
          if (pending.intensity) rt.intensity(true);
        } else if (pending.zone !== undefined) rt.zone(pending.zone);
      } catch {
        failed = true;
        rt = null;
        try {
          void raw.close().catch(() => {});
        } catch {
          /* ignore */
        }
      }
    })();
    await starting;
  } catch {
    /* never throws */
  }
}

export function setZoneMusic(id: string | null) {
  try {
    pending.zone = id;
    rt?.zone(id);
  } catch {
    /* ignore */
  }
}

export function setBattleMusic(kind: string, cantorType?: string) {
  try {
    pending.battle = { kind, cantorType };
    pending.intensity = false;
    rt?.battle(kind, cantorType);
  } catch {
    /* ignore */
  }
}

export function setBattleIntensity(high: boolean) {
  try {
    pending.intensity = high;
    rt?.intensity(high);
  } catch {
    /* ignore */
  }
}

export function endBattleMusic(stinger: 'victory' | 'capture' | 'none') {
  try {
    pending.battle = null;
    pending.intensity = false;
    rt?.endBattle(stinger);
  } catch {
    /* ignore */
  }
}

export function playStinger(id: string) {
  try {
    rt?.stinger(id);
  } catch {
    /* ignore */
  }
}
