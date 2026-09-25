// Lazy-loaded audio runtime: builds the Tone graph, music, sfx and cry players, the director,
// and registers the players with the sfx facade. Imported only by engine.ts after a user gesture.
import { createCore } from './core';
import { Music } from './music';
import { createSfx } from './sfx';
import { createCries } from './cries';
import { startDirector } from './director';
import { registerSfxPlayer } from './sfxBus';

export interface AudioRuntime {
  zone(id: string | null): void;
  battle(kind: string, cantorType?: string): void;
  intensity(high: boolean): void;
  endBattle(stinger: 'victory' | 'capture' | 'none'): void;
  stinger(id: string): void;
  resume(): void;
}

export function boot(raw: AudioContext): AudioRuntime {
  const core = createCore(raw);
  const music = new Music(core);
  const sfx = createSfx(core);
  const cries = createCries(core);
  const safe = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => {
    try {
      fn(...a);
    } catch {
      /* audio must never break gameplay */
    }
  };
  const rt: AudioRuntime = {
    zone: safe((id: string | null) => music.zone(id)),
    battle: safe((k: string, c?: string) => music.battle(k, c)),
    intensity: safe((h: boolean) => music.intensity(h)),
    endBattle: safe((s: 'victory' | 'capture' | 'none') => music.endBattle(s)),
    stinger: safe((id: string) => music.stinger(id)),
    resume: safe(() => {
      if (raw.state !== 'running') void raw.resume().catch(() => {});
    }),
  };
  registerSfxPlayer(
    (id, opts) => {
      try {
        sfx.play(id, opts, rt.stinger);
      } catch {
        /* ignore */
      }
    },
    (species, opts) => {
      try {
        cries.play(species, opts);
      } catch {
        /* ignore */
      }
    },
  );
  startDirector(rt);
  return rt;
}
