import { describe, expect, it } from 'vitest';
import { CONTENT as c } from '../../src/data/index';
import * as G from '../../src/sim/game';
import { evalExpr, rivalStarter, leftoverStarter, resolveRivalSpecies, rollEncounter, encounterProbabilities, timePhase } from '../../src/sim/world';
import { Rng } from '../../src/sim/rng';
import { createInstance } from '../../src/sim/progression';
import enc from '../../src/data/content/encounters.json';

const base = () => G.newGamePayload(c, 'Hollis', 'they', { build: 0, skin: 0, hair: 0 }, 42);

describe('party & storage', () => {
  it('fills party then storage, then refuses when both full', () => {
    let s = base();
    const rng = new Rng([1, 2, 3, 4]);
    for (let i = 0; i < 6; i++) { const r = G.addCreature(s, createInstance(c, rng, 'c10', 5)); expect(r.ok).toBe(true); if (r.ok) { s = r.s; expect(r.where).toBe('party'); } }
    const r7 = G.addCreature(s, createInstance(c, rng, 'c13', 5));
    expect(r7.ok && r7.where).toBe('storage');
    if (r7.ok) s = r7.s;
    // fake-full storage
    s = { ...s, storage: Array.from({ length: 300 }, (_, i) => s.storage[0] + i) };
    for (const u of s.storage) s.instances[u] = { ...s.instances[s.storage[0]] ?? s.instances[s.party[0]], uid: u };
    expect(G.isFull(s)).toBe(true);
    expect(G.addCreature(s, createInstance(c, rng, 'c19', 5)).ok).toBe(false);
  });
  it('starter (bond) cannot be released; last able kin protected', () => {
    let s = base();
    const g = G.giveKin(c, s, 'c01', 5, { bond: true });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    s = g.s;
    expect(G.release(s, g.uid!).ok).toBe(false);
    expect(G.deposit(s, g.uid!).ok).toBe(false);
  });
  it('capture adds to encyclopedia', () => {
    const g = G.giveKin(c, base(), 'c19', 4);
    expect(g.ok && g.s.caught.includes('c19') && g.s.seen.includes('c19')).toBe(true);
  });
});

describe('inventory & economy', () => {
  it('buy with/without money; sell; stack cap; discs unsellable', () => {
    let s = base();
    const r = G.buy(c, s, 'i_chime_reed', 3);
    expect(r.ok).toBe(true);
    if (r.ok) { s = r.s; expect(s.player.money).toBe(400); expect(s.inventory.i_chime_reed).toBe(3); }
    expect(G.buy(c, s, 'i_salve_4', 1).ok).toBe(false);
    const sell = G.sell(c, s, 'i_chime_reed', 1);
    expect(sell.ok && sell.s.player.money).toBe(500);
    s = { ...s, player: { ...s.player, money: 999999 } };
    s = { ...s, inventory: { ...s.inventory, i_salve_1: 99 } };
    expect(G.buy(c, s, 'i_salve_1', 1).ok).toBe(false);
    s = { ...s, inventory: { ...s.inventory, i_disc_03: 1 } };
    expect(G.sell(c, s, 'i_disc_03', 1).ok).toBe(false);
  });
  it('wipe penalty = min(money/4, 100 + 150*keynotes) and returns to last Hearthrest', () => {
    let s = base();
    s = { ...s, player: { ...s.player, money: 4000 }, inventory: { i_keynote_1: 1, i_keynote_2: 1 }, lastHearth: { zone: 'town_2', spawn: 'sp_town_2_hearth' }, zone: { id: 'cave', spawn: 'x' } };
    const w = G.applyWipe(c, s);
    expect(w.lost).toBe(400);
    expect(w.s.zone.id).toBe('town_2');
    const poor = G.applyWipe(c, { ...s, player: { ...s.player, money: 100 } });
    expect(poor.lost).toBe(25);
  });
  it('charity chimes only when out of chimes and under 200 tallies', () => {
    const s = { ...base(), player: { ...base().player, money: 150 } };
    const r = G.charityChimes(s);
    expect(r.ok && r.s.inventory.i_chime_reed).toBe(5);
    expect(G.charityChimes({ ...s, inventory: { i_chime_reed: 1 } }).ok).toBe(false);
  });
});

describe('world rules', () => {
  it('flag expressions', () => {
    const s = { ...base(), flags: { a: true, b: false, n: 2 }, inventory: { i_keynote_1: 1, i_keynote_2: 1, i_x: 1 }, caught: ['c10'] };
    expect(evalExpr('a && !b', s)).toBe(true);
    expect(evalExpr('b || (a && n)', s)).toBe(true);
    expect(evalExpr('keynotes>=2 && has:i_x && caught:c10', s)).toBe(true);
    expect(evalExpr('keynotes>=3', s)).toBe(false);
    expect(evalExpr(undefined, s)).toBe(true);
  });
  it('rival starter triangle and leftover', () => {
    expect(rivalStarter('c01')).toBe('c04');
    expect(rivalStarter('c04')).toBe('c07');
    expect(rivalStarter('c07')).toBe('c01');
    expect(leftoverStarter('c01')).toBe('c07');
    expect(resolveRivalSpecies('RS3', 'c07')).toBe('c03');
  });
  it('encounter probabilities normalised; roll respects table', () => {
    for (const [t, rows] of Object.entries((enc as any).tables)) {
      for (const night of [false, true]) for (const w of ['clear', 'rain', 'fog', 'snow', 'sunlight'] as const) {
        const p = encounterProbabilities(c, rows as any, night, w);
        expect(Math.abs(p.reduce((a, x) => a + x.p, 0) - 1)).toBeLessThan(1e-9);
      }
      const rng = new Rng([9, 8, 7, 6]);
      const r = rollEncounter(c, enc as any, t, false, 'clear', rng)!;
      const row = (rows as any[]).find((x) => x.species === r.species);
      expect(r.level).toBeGreaterThanOrEqual(row.lo);
      expect(r.level).toBeLessThanOrEqual(row.hi);
    }
  });
  it('time phase', () => {
    expect(timePhase(8 * 60)).toBe('day');
    expect(timePhase(23 * 60)).toBe('night');
    expect(timePhase(6 * 60)).toBe('dawn');
  });
});
