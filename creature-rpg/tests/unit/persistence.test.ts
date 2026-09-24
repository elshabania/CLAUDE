import { describe, expect, it } from 'vitest';
import { SaveManager, KEYS, buildEnvelope, parseEnvelope, canonical, fnv1a, type KV } from '../../src/persistence/saveManager';
import type { SavePayload } from '../../src/persistence/saveTypes';
import v1 from '../fixtures/saves/v1.json';

class MemKV implements KV {
  m = new Map<string, string>();
  quotaAfter = Infinity;
  writes = 0;
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) {
    if (++this.writes > this.quotaAfter) { const e = new Error('full'); (e as any).name = 'QuotaExceededError'; throw e; }
    this.m.set(k, v);
  }
  removeItem(k: string) { this.m.delete(k); }
}

export function samplePayload(money = 1000): SavePayload {
  return {
    player: { name: 'Rowan', pronoun: 'they', look: { build: 0, skin: 1, hair: 2 }, money, playtimeSec: 60, starter: 'c01' },
    clockMinutes: 480, rngState: [1, 2, 3, 4], zone: { id: 'town_1', spawn: 'home' }, lastHearth: { zone: 'town_1', spawn: 'home' },
    party: ['a'], storage: [],
    instances: { a: { uid: 'a', species: 'c01', level: 5, xp: 125, potential: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, temperament: 'tm_steady', moves: [{ id: 'm021', charges: 30 }], hp: 20, status: null, bond: true } },
    inventory: { i_chime_reed: 5 }, flags: { flag_game_started: true }, quests: {}, seen: ['c01'], caught: ['c01'], nodes: [], waystones: [], defeatedTrainers: [], pickups: [], stats: { battles: 0, captures: 0, steps: 0 },
  };
}

describe('save manager', () => {
  it('round trip', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    expect(sm.commit(samplePayload()).ok).toBe(true);
    const l = sm.load();
    expect(l.source).toBe('main');
    expect(l.payload?.player.money).toBe(1000);
    expect(kv.getItem(KEYS.tmp)).toBeNull();
  });
  it('rotates backup and recovers from corrupt main', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    sm.commit(samplePayload(100));
    sm.commit(samplePayload(200));
    expect(JSON.parse(kv.getItem(KEYS.backup)!).payload.player.money).toBe(100);
    kv.setItem(KEYS.main, kv.getItem(KEYS.main)!.slice(0, 50)); // truncated
    const l = sm.load();
    expect(l.source).toBe('backup');
    expect(l.payload?.player.money).toBe(100);
    expect(l.notice).toMatch(/restored from backup/);
    expect(kv.getItem(KEYS.corrupt)).not.toBeNull();
  });
  it('checksum tamper is detected', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    sm.commit(samplePayload(100));
    sm.commit(samplePayload(300));
    const env = JSON.parse(kv.getItem(KEYS.main)!);
    env.payload.player.money = 999999;
    kv.setItem(KEYS.main, JSON.stringify(env));
    expect(sm.load().payload?.player.money).toBe(100);
  });
  it('interrupted write recovers tmp', () => {
    const kv = new MemKV();
    kv.setItem(KEYS.tmp, buildEnvelope(samplePayload(777), 'x'));
    const l = new SaveManager(kv).load();
    expect(l.source).toBe('tmp');
    expect(l.payload?.player.money).toBe(777);
  });
  it('quota failure keeps previous main intact', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    sm.commit(samplePayload(1));
    kv.quotaAfter = kv.writes; // next write fails
    const r = sm.commit(samplePayload(2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('quota');
    expect(sm.load().payload?.player.money).toBe(1);
  });
  it('no storage mode keeps memory envelope', () => {
    const sm = new SaveManager(null);
    const r = sm.commit(samplePayload(5));
    expect(r.ok).toBe(false);
    expect(sm.load().payload?.player.money).toBe(5);
    expect(sm.exportRaw()).toContain('crpg-save');
  });
  it('refuses newer schema and never overwrites', () => {
    const kv = new MemKV();
    const env = JSON.parse(buildEnvelope(samplePayload(), 'x'));
    env.schemaVersion = 99;
    kv.setItem(KEYS.main, JSON.stringify(env));
    const l = new SaveManager(kv).load();
    expect(l.newer).toBe(true);
    expect(JSON.parse(kv.getItem(KEYS.main)!).schemaVersion).toBe(99);
  });
  it('malformed JSON', () => {
    expect(parseEnvelope('{not json').ok).toBe(false);
    expect(parseEnvelope('null').ok).toBe(false);
  });
  it('migrates v1 fixture', () => {
    const r = parseEnvelope(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(1);
      expect(r.payload.lastHearth.zone).toBe('town_1');
      expect(r.payload.waystones).toEqual([]);
    }
  });
  it('import accepts bad checksum with warning, rejects invalid', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    const env = JSON.parse(buildEnvelope(samplePayload(42), 'x'));
    env.checksum = 'deadbeef';
    const r = sm.importRaw(JSON.stringify(env));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toBeTruthy();
    expect(sm.importRaw('{"format":"crpg-save","schemaVersion":2,"payload":{}}').ok).toBe(false);
  });
  it('duplicate party/storage rejected', () => {
    const p = samplePayload();
    p.storage = ['a'];
    const env = { format: 'crpg-save', schemaVersion: 2, gameVersion: 't', savedAt: 'x', checksum: fnv1a(canonical(p)), payload: p };
    expect(parseEnvelope(JSON.stringify(env)).ok).toBe(false);
  });
  it('new game keeps previous as backup', () => {
    const kv = new MemKV();
    const sm = new SaveManager(kv);
    sm.commit(samplePayload(9));
    sm.startNewGame();
    expect(kv.getItem(KEYS.main)).toBeNull();
    expect(JSON.parse(kv.getItem(KEYS.backup)!).payload.player.money).toBe(9);
  });
});
