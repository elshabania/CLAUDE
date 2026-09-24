import type { Content } from './content';
import type { CreatureInstance, Stats } from './types';
import { computeStats, LEVEL_CAP, xpForLevel } from './stats';
import { Rng } from './rng';
import { TEMPERAMENTS } from './stats';

export interface LevelUpResult {
  inst: CreatureInstance;
  levels: number[];
  learned: string[];
  pendingLearn: string[];
  evolveTo: string | null;
}

/** Evolution target for the current species/level, if its level threshold is met. */
export function evolutionTarget(c: Content, inst: CreatureInstance): string | null {
  const sp = c.species[inst.species];
  const e = sp.evolvesTo;
  if (!e) return null;
  if (e.level != null && inst.level >= e.level) return e.species;
  return null;
}

/** Learnset moves exactly at `level` for this creature's family (excluding evolution-only entries). */
export function movesAtLevel(c: Content, speciesId: string, level: number): string[] {
  const fam = c.species[speciesId].family;
  return (c.families.learnsets[fam] ?? []).filter((e) => !e.evo && e.level === level).map((e) => e.move);
}

export function knows(inst: CreatureInstance, move: string): boolean {
  return inst.moves.some((m) => m.id === move);
}

export function learnMove(c: Content, inst: CreatureInstance, move: string, replaceSlot?: number): CreatureInstance {
  const charges = c.moves[move].charges ?? 99;
  const moves = inst.moves.slice();
  if (replaceSlot == null) {
    if (moves.length >= 4) throw new Error('move slots full');
    moves.push({ id: move, charges });
  } else {
    moves[replaceSlot] = { id: move, charges };
  }
  return { ...inst, moves };
}

/** Add XP one level at a time, recomputing stats; auto-learn into free slots, otherwise queue prompts. */
export function addXp(c: Content, inst0: CreatureInstance, amount: number): LevelUpResult {
  let inst = { ...inst0, moves: inst0.moves.slice() };
  const sp = () => c.species[inst.species];
  const res: LevelUpResult = { inst, levels: [], learned: [], pendingLearn: [], evolveTo: null };
  if (inst.level >= LEVEL_CAP) return res;
  inst.xp += amount;
  while (inst.level < LEVEL_CAP && inst.xp >= xpForLevel(sp().growth, inst.level + 1)) {
    const before = computeStats(c, inst);
    inst.level += 1;
    const after = computeStats(c, inst);
    if (inst.hp > 0) inst.hp = Math.max(1, inst.hp + (after.hp - before.hp));
    res.levels.push(inst.level);
    for (const m of movesAtLevel(c, inst.species, inst.level)) {
      if (knows(inst, m)) continue;
      if (inst.moves.length < 4) {
        inst = learnMove(c, inst, m);
        res.learned.push(m);
      } else res.pendingLearn.push(m);
    }
  }
  if (inst.level >= LEVEL_CAP) inst.xp = Math.min(inst.xp, xpForLevel(sp().growth, LEVEL_CAP));
  res.evolveTo = evolutionTarget(c, inst);
  if (res.evolveTo) inst.evolveReady = true;
  res.inst = inst;
  return res;
}

/** Evolve; returns new instance plus the evolution move (learned directly or pending). */
export function evolve(c: Content, inst: CreatureInstance, to: string): { inst: CreatureInstance; learned?: string; pending?: string } {
  const from = c.species[inst.species];
  const move = from.evolvesTo?.move;
  const before = computeStats(c, inst);
  let next: CreatureInstance = { ...inst, species: to, evolveReady: false, moves: inst.moves.slice() };
  const after = computeStats(c, next);
  if (next.hp > 0) next.hp = Math.max(1, next.hp + (after.hp - before.hp));
  if (move && !knows(next, move)) {
    if (next.moves.length < 4) return { inst: learnMove(c, next, move), learned: move };
    return { inst: next, pending: move };
  }
  return { inst: next };
}

/** Default moveset: last 4 distinct learnset moves at or below level (evo moves count at the stage's evolution level). */
export function defaultMoves(c: Content, speciesId: string, level: number): string[] {
  const sp = c.species[speciesId];
  const fam = c.families.learnsets[sp.family] ?? [];
  // evolution moves: stage 2 move known if stage>=2; stage 3 move known if stage 3
  const chain: string[] = [];
  let cur: string | undefined = speciesId;
  while (cur && c.species[cur].evolvesFrom) {
    const prev: string = c.species[cur].evolvesFrom!;
    const ev = c.species[prev].evolvesTo;
    if (ev?.move) chain.push(ev.move);
    cur = prev;
  }
  const list: { lvl: number; move: string }[] = [];
  for (const e of fam) if (!e.evo && e.level != null && e.level <= level) list.push({ lvl: e.level, move: e.move });
  // evolution moves placed at the family evolution level
  cur = speciesId;
  while (cur && c.species[cur].evolvesFrom) {
    const prev: string = c.species[cur].evolvesFrom!;
    const ev = c.species[prev].evolvesTo;
    if (ev?.move) list.push({ lvl: ev.level ?? 44, move: ev.move });
    cur = prev;
  }
  list.sort((a, b) => a.lvl - b.lvl);
  const out: string[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < 4; i--) if (!out.includes(list[i].move)) out.unshift(list[i].move);
  return out;
}

export function makeUid(rng: Rng): string {
  return 'k' + rng.nextU32().toString(36) + rng.nextU32().toString(36).slice(0, 4);
}

export interface CreateOpts {
  potential?: number | 'random';
  temperament?: string | 'random';
  moves?: string[];
  bond?: boolean;
}

export function createInstance(c: Content, rng: Rng, speciesId: string, level: number, opts: CreateOpts = {}): CreatureInstance {
  const sp = c.species[speciesId];
  if (!sp) throw new Error('unknown species ' + speciesId);
  const pot = {} as Stats;
  for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    pot[s] = opts.potential === 'random' || opts.potential == null ? rng.int(0, 15) : opts.potential;
  }
  const temperament = opts.temperament === 'random' || opts.temperament == null ? TEMPERAMENTS[rng.int(0, TEMPERAMENTS.length - 1)] : opts.temperament;
  const moves = (opts.moves ?? defaultMoves(c, speciesId, level)).map((id) => ({ id, charges: c.moves[id].charges ?? 99 }));
  const inst: CreatureInstance = {
    uid: makeUid(rng),
    species: speciesId,
    level,
    xp: xpForLevel(sp.growth, level),
    potential: pot,
    temperament,
    moves,
    hp: 1,
    status: null,
    bond: opts.bond,
  };
  inst.hp = computeStats(c, inst).hp;
  return inst;
}

export function healFull(c: Content, inst: CreatureInstance): CreatureInstance {
  return {
    ...inst,
    hp: computeStats(c, inst).hp,
    status: null,
    sleepCounter: undefined,
    moves: inst.moves.map((m) => ({ id: m.id, charges: c.moves[m.id].charges ?? 99 })),
  };
}
