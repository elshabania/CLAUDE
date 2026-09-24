import { describe, expect, it } from 'vitest';
import { startAudio, setZoneMusic, setBattleMusic, setBattleIntensity, endBattleMusic, playStinger } from '../../src/audio/engine';
import { sfx, cry } from '../../src/audio/sfxBus';
import { SONGS, battleSong, genMelody, resolveSong } from '../../src/audio/songs';
import { CONTENT } from '../../src/data/index';

describe('audio engine without an AudioContext (node)', () => {
  it('startAudio resolves and is idempotent', async () => {
    await expect(startAudio()).resolves.toBeUndefined();
    await expect(startAudio()).resolves.toBeUndefined();
    await Promise.all([startAudio(), startAudio(), startAudio()]);
  });

  it('every exported function no-ops without throwing', () => {
    expect(() => {
      setZoneMusic('town_1');
      setZoneMusic('forest@night');
      setZoneMusic('no_such_zone');
      setZoneMusic(null);
      for (const k of ['wild', 'trainer', 'rival', 'cantor', 'admin', 'stillmark', 'odile', 'odile_b', 'champion', 'weird']) setBattleMusic(k, 'fire');
      setBattleMusic('wild');
      setBattleIntensity(true);
      setBattleIntensity(false);
      endBattleMusic('victory');
      endBattleMusic('capture');
      endBattleMusic('none');
      for (const s of ['victory', 'capture', 'evolution', 'keynote', 'level_up', 'heal', 'item', 'unknown']) playStinger(s);
      sfx('ui_move');
      sfx('move', { type: 'fire', anim: 'beam' });
      cry('c01');
      cry('c01', { faint: true });
      cry('nope', { happy: true });
    }).not.toThrow();
  });
});

describe('song data', () => {
  it('every zone music id resolves to a known theme', () => {
    for (const id of ['town_1', 'town_2', 'route_1', 'route_2', 'route_3', 'forest', 'cave', 'volcano', 'hall', 'trial']) {
      expect(SONGS[resolveSong(id).key.split('@')[0]]).toBeDefined();
    }
  });
  it('melodies are deterministic and in range', () => {
    for (const def of [...Object.values(SONGS), battleSong('champion'), battleSong('cantor', 'frost')]) {
      const a = genMelody(def);
      expect(a).toEqual(genMelody(def));
      expect(a).toHaveLength(def.prog.length * 2);
      for (const bar of a) for (const n of bar) expect(n.step + n.dur).toBeLessThanOrEqual(16);
    }
  });
  it('species cry params exist for every species', () => {
    for (const sp of Object.values(CONTENT.species)) expect(sp.cry.contour.length).toBeGreaterThan(1);
  });
});
