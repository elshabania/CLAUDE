import { describe, expect, it } from 'vitest';
import { makeContent } from './fixtures';
import { computeStats } from '../../src/sim/stats';
import { createBattle, computeDamage, act, captureValue, shakeThreshold, effectiveness, resolveTurn } from '../../src/sim/battle/engine';
import { chooseAiAction, scoreMove } from '../../src/sim/battle/ai';
import type { CreatureInstance } from '../../src/sim/types';
import { TYPE_IDS } from '../../src/sim/types';
import typesJson from '../../src/data/content/types.json';

const c = makeContent();
const pot = (n: number) => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });
const player: CreatureInstance = { uid: 'p1', species: 'x_elec2', level: 18, xp: 5832, potential: pot(10), temperament: 'tm_spa_atk', moves: [{ id: 'm025', charges: 20 }], hp: 49, status: null };
const rival: CreatureInstance = { uid: 'r1', species: 'x_water2', level: 17, xp: 4913, potential: pot(12), temperament: 'tm_steady', moves: [{ id: 'm016', charges: 20 }, { id: 'm015', charges: 20 }], hp: 52, status: 'burn' };

describe('stats (systems §16 vectors)', () => {
  it('player stats', () => {
    expect(computeStats(c, player)).toEqual({ hp: 49, atk: 25, def: 24, spa: 38, spd: 26, spe: 41 });
  });
  it('rival stats', () => {
    expect(computeStats(c, rival)).toEqual({ hp: 52, atk: 34, def: 30, spa: 25, spd: 27, spe: 29 });
  });
});

describe('damage (systems §16 vectors)', () => {
  const s = createBattle(c, { kind: 'trainer', playerParty: [player], foeParty: [rival], ai: 'normal', ambientWeather: 'rain', attunedType: 'electric' }, 1);
  it('Arc Lash = 50 with random 85', () => {
    const r = computeDamage(c, s, act(s, 'player'), act(s, 'foe'), c.moves.m025, { crit: false, random: 85 });
    expect(r.dmg).toBe(50);
    expect(r.eff).toBe(8);
    expect(r.attuned).toBe(true);
  });
  it('Bubble Lance = 22 with random 88', () => {
    const r = computeDamage(c, s, act(s, 'foe'), act(s, 'player'), c.moves.m015, { crit: false, random: 88 });
    expect(r.dmg).toBe(22);
  });
  it('AI scores 34 / 48', () => {
    // AI assumes potential 8 steady for the player; the example uses exact stats, so check ordering only
    const a = scoreMove(c, s, act(s, 'foe'), act(s, 'player'), c.moves.m015);
    const b = scoreMove(c, s, act(s, 'foe'), act(s, 'player'), c.moves.m016);
    expect(a).toBe(48);
    expect(b).toBe(34);
  });
});

describe('type matrix', () => {
  it('counts match systems §1.5 totals', () => {
    const m = (typesJson as any).matrix;
    let se = 0, res = 0, imm = 0;
    for (const a of TYPE_IDS) for (const d of TYPE_IDS) {
      if (m[a][d] === 4) se++; else if (m[a][d] === 1) res++; else if (m[a][d] === 0) imm++;
    }
    expect([se, res, imm]).toEqual([28, 27, 2]);
  });
  it('starter triangle', () => {
    expect(effectiveness(c, 'water', ['fire'])).toBe(8);
    expect(effectiveness(c, 'fire', ['electric'])).toBe(8);
    expect(effectiveness(c, 'electric', ['water'])).toBe(8);
  });
  it('dual products limited to {0,1,2,4,8,16} quarters', () => {
    const vals = new Set<number>();
    for (const mt of TYPE_IDS) for (const a of TYPE_IDS) for (const b of TYPE_IDS) if (a !== b) vals.add(effectiveness(c, mt, [a, b]));
    for (const v of vals) expect([0, 1, 2, 4, 8, 16]).toContain(v);
  });
});

describe('capture (systems §7.5)', () => {
  const wild: CreatureInstance = { uid: 'w', species: 'x_water2', level: 18, xp: 0, potential: pot(0), temperament: 'tm_steady', moves: [{ id: 'm012', charges: 30 }], hp: 20, status: null };
  const mk = (st: CreatureInstance) => {
    const s = createBattle(c, { kind: 'wild', playerParty: [player], foeParty: [st], ai: 'easy', ambientWeather: 'clear', attunedType: null }, 3);
    act(s, 'foe').stats.hp = 55; // spec example uses maxHp 55
    return s;
  };
  it('a values for four tiers', () => {
    const s = mk(wild);
    expect(captureValue(c, s, 'i_chime_reed')).toBe(68);
    expect(captureValue(c, s, 'i_chime_brass')).toBe(102);
    expect(captureValue(c, s, 'i_chime_silver')).toBe(136);
    expect(captureValue(c, s, 'i_chime_crown')).toBe(204);
  });
  it('sleep doubles', () => {
    const s = mk({ ...wild, status: 'sleep' });
    expect(captureValue(c, s, 'i_chime_brass')).toBe(204);
  });
  it('threshold', () => {
    expect(shakeThreshold(102)).toBe(48287);
    for (let a = 1; a < 255; a++) expect(shakeThreshold(a)).toBeGreaterThanOrEqual(shakeThreshold(a - 1));
    expect(shakeThreshold(254)).toBeLessThan(65536);
  });
  it('monte carlo ≈ a/255', () => {
    for (const a of [10, 102, 200]) {
      const th = shakeThreshold(a);
      let ok = 0;
      let x = 12345;
      const N = 60000;
      for (let i = 0; i < N; i++) {
        let pass = true;
        for (let k = 0; k < 3; k++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; if ((x >>> 16) >= th) { pass = false; break; } }
        if (pass) ok++;
      }
      expect(Math.abs(ok / N - a / 255)).toBeLessThan(0.015);
    }
  });
});

describe('determinism & AI isolation', () => {
  const setup = { kind: 'wild' as const, playerParty: [player], foeParty: [{ ...rival, status: null }], ai: 'normal' as const, ambientWeather: 'clear' as const, attunedType: null };
  it('same seed + commands = same events', () => {
    const run = () => {
      let s = createBattle(c, setup, 99);
      const log: string[] = [];
      for (let i = 0; i < 8 && !s.outcome && !s.needPlayerReplace; i++) {
        const ai = chooseAiAction(c, s);
        s = { ...s, rngAI: ai.rngAI };
        const r = resolveTurn(c, s, { kind: 'move', slot: 0 }, ai.action);
        s = r.state;
        log.push(JSON.stringify(r.events));
      }
      return log.join('|');
    };
    expect(run()).toBe(run());
  });
  it('AI action independent of player choice (chosen before)', () => {
    const s = createBattle(c, setup, 7);
    const a1 = chooseAiAction(c, s).action;
    const a2 = chooseAiAction(c, s).action;
    expect(a1).toEqual(a2);
  });
  it('does not mutate input state', () => {
    const s = createBattle(c, setup, 5);
    const snap = JSON.stringify(s);
    resolveTurn(c, s, { kind: 'move', slot: 0 }, { kind: 'move', slot: 0 });
    expect(JSON.stringify(s)).toBe(snap);
  });
});
