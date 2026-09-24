// Campaign balance simulator (QA plan §7, SIM-01/SIM-03 style). Pure node code: real content JSON,
// real battle engine + AI, no React/zustand. It is a mechanical simulation, NOT a playtest.
import { CONTENT } from '../../src/data/index';
import { TRAINERS, ENCOUNTERS, type TrainerDef } from '../../src/data/registry';
import { ZONES } from '../../src/data/zones';
import { createBattle, openingEvents, resolveTurn, applyReplace, act, aiReplacement, playerPartyAfter, effectiveness, typesOf, effSpe } from '../../src/sim/battle/engine';
import { chooseAiAction } from '../../src/sim/battle/ai';
import type { Action, BattleSetup, BattleState } from '../../src/sim/battle/types';
import { addXp, createInstance, evolve, evolutionTarget, healFull, learnMove, knows } from '../../src/sim/progression';
import { computeStats, xpForLevel } from '../../src/sim/stats';
import { Rng, seedRng, hashString } from '../../src/sim/rng';
import { resolveRivalSpecies, rollEncounter, leftoverStarter, rivalStarter } from '../../src/sim/world';
import type { Content } from '../../src/sim/content';
import { canLearnDisc } from '../../src/sim/game';
import type { CreatureInstance, TypeId } from '../../src/sim/types';

export const c: Content = CONTENT;
export const TURN_LIMIT = 200;

// ---------------------------------------------------------------------------------------------
// Story oracle: systems.md §14.2 (# = row), recommended ace + model party avg, qa_plan §7.2 thresholds.
export interface StoryInfo { n: number; id: string; label: string; recAce: number; modelAvg: number; minWin: number; blocking: boolean; cantor: boolean }
const S = (n: number, id: string, label: string, recAce: number, modelAvg: number, minWin: number, blocking = true): StoryInfo => ({
  n, id, label, recAce, modelAvg, minWin, blocking, cantor: id.startsWith('t_cantor'),
});
// qa_plan §7.2 item 7: ≥60 trial leaders/Odile/champion; ≥80 rival & antagonist before trial_3; ≥70 other.
export const STORY: StoryInfo[] = [
  S(1, 't_rival_1', 'Rival 1', 5, 5, 80, false), // D20: loss continues the story (non-blocking)
  S(2, 't_cantor_1', 'Cantor 1 Wren', 12, 11, 60),
  S(3, 't_rival_2', 'Rival 2', 16, 14, 80),
  S(4, 't_cantor_2', 'Cantor 2 Dorran', 17, 14, 60),
  S(5, 't_admin_brann_1', 'Admin Brann', 20, 19, 80),
  S(6, 't_admin_vey_1', 'Admin Vey 1', 22, 23, 80),
  S(7, 't_rival_3', 'Rival 3', 23, 24, 80),
  S(8, 't_cantor_3', 'Cantor 3 Nerys', 25, 27, 60),
  S(9, 't_cantor_4', 'Cantor 4 Tamsin', 30, 29, 60),
  S(10, 't_admin_vey_2', 'Admin Vey 2', 33, 33, 70),
  S(11, 't_rival_4', 'Rival 4', 33, 34, 70),
  S(12, 't_cantor_5', 'Cantor 5 Bastian', 37, 37, 60),
  S(13, 't_rival_5', 'Rival 5', 40, 40, 70),
  S(14, 't_cantor_6', 'Cantor 6 Isaure', 45, 45, 60),
  S(15, 't_odile', 'Magister Odile', 46, 46, 60),
  S(16, 't_rival_6', 'Rival 6', 48, 47, 70),
  S(17, 't_champion', 'Champion Rhea', 50, 49, 60),
];
export const STORY_BY_ID = Object.fromEntries(STORY.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------------------------
// Critical path (creative_direction §4 / systems §14.4 chapters; world.md §2.9 trainer placement).
// wild = number of wild battles (systems §14.4 budget: 4 per chapter ch1–4, 2 after).
type Step =
  | { kind: 'wild'; table: string; zone: string; n: number; catchOne: boolean }
  | { kind: 'trainer'; id: string }
  | { kind: 'zoneTrainers'; zone: string } // all optional trainers of a zone
  | { kind: 'silence'; zone: string; on: boolean }
  | { kind: 'disc'; ids: string[] } // Etudes the player obtains here (trial rewards, systems §12.5 purchases)
  | { kind: 'gift'; which: 'leftover' | 'rival_line'; level: number; always: boolean }; // world.md §2.6 Triad gifts

export const PATH: Step[] = [
  { kind: 'trainer', id: 't_rival_1' },
  // ch1
  { kind: 'wild', table: 'route_1', zone: 'route_1', n: 4, catchOne: true },
  { kind: 'zoneTrainers', zone: 'route_1' },
  // ch2
  { kind: 'wild', table: 'forest', zone: 'forest', n: 4, catchOne: true },
  { kind: 'zoneTrainers', zone: 'forest' },
  { kind: 'trainer', id: 't_still_01' }, { kind: 'trainer', id: 't_still_02' },
  { kind: 'trainer', id: 't_hall1_01' }, { kind: 'trainer', id: 't_hall1_02' },
  { kind: 'trainer', id: 't_cantor_1' },
  { kind: 'disc', ids: ['i_disc_04'] }, // trial_1 reward
  // ch3 (town_2 shop: systems §12.5 buys i_disc_03)
  { kind: 'disc', ids: ['i_disc_03'] },
  { kind: 'wild', table: 'route_2', zone: 'route_2', n: 4, catchOne: true },
  { kind: 'zoneTrainers', zone: 'route_2' },
  { kind: 'trainer', id: 't_rival_2' },
  { kind: 'trainer', id: 't_hall2_01' }, { kind: 'trainer', id: 't_hall2_02' },
  { kind: 'trainer', id: 't_cantor_2' },
  { kind: 'disc', ids: ['i_disc_05'] }, // trial_2 reward
  // ch4
  { kind: 'wild', table: 'cave_upper', zone: 'cave', n: 2, catchOne: true },
  { kind: 'wild', table: 'cave_lower', zone: 'cave', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'cave' },
  { kind: 'trainer', id: 't_still_03' }, { kind: 'trainer', id: 't_still_04' },
  { kind: 'trainer', id: 't_admin_brann_1' },
  // ch5 (route_3 silenced until the Fen stone is restored after Vey 1)
  { kind: 'silence', zone: 'route_3', on: true },
  { kind: 'wild', table: 'route_3', zone: 'route_3', n: 2, catchOne: true },
  { kind: 'trainer', id: 't_still_05' },
  { kind: 'trainer', id: 't_admin_vey_1' },
  { kind: 'silence', zone: 'route_3', on: false },
  { kind: 'zoneTrainers', zone: 'route_3' },
  { kind: 'trainer', id: 't_rival_3' },
  // ch6 (systems §12.5 buys i_disc_06)
  { kind: 'disc', ids: ['i_disc_06'] },
  { kind: 'wild', table: 'lake', zone: 'lake', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'lake' },
  { kind: 'trainer', id: 't_hall3_01' }, { kind: 'trainer', id: 't_hall3_02' },
  { kind: 'trainer', id: 't_cantor_3' },
  { kind: 'disc', ids: ['i_disc_02'] }, // trial_3 reward
  // ch7
  { kind: 'trainer', id: 't_hall4_01' }, { kind: 'trainer', id: 't_hall4_02' },
  { kind: 'trainer', id: 't_cantor_4' },
  { kind: 'disc', ids: ['i_disc_07'] }, // trial_4 reward
  // ch8
  { kind: 'wild', table: 'route_4', zone: 'route_4', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'route_4' },
  { kind: 'trainer', id: 't_still_06' }, { kind: 'trainer', id: 't_still_07' },
  { kind: 'trainer', id: 't_admin_vey_2' },
  { kind: 'disc', ids: ['i_disc_09'] }, // Vey 2 drop
  // q_foster_leftover (world.md §2.6): the leftover starter joins at Lv 25. q_second_clutch requires it in the troupe.
  { kind: 'gift', which: 'leftover', level: 25, always: true },
  { kind: 'trainer', id: 't_rival_4' },
  // ch9 (systems §12.5 buys i_disc_08)
  { kind: 'disc', ids: ['i_disc_08'] },
  { kind: 'wild', table: 'volcano', zone: 'volcano', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'volcano' },
  { kind: 'trainer', id: 't_hall5_01' }, { kind: 'trainer', id: 't_hall5_02' },
  { kind: 'trainer', id: 't_cantor_5' },
  { kind: 'disc', ids: ['i_disc_16'] }, // trial_5 reward
  // q_second_clutch: the rival's line at Lv 30; taken only if it is not the weakest option
  { kind: 'gift', which: 'rival_line', level: 30, always: false },
  // ch10 (route_5 silenced until the Nullbell breaks at Odile)
  { kind: 'silence', zone: 'route_5', on: true },
  { kind: 'wild', table: 'route_5', zone: 'route_5', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'route_5' },
  { kind: 'trainer', id: 't_rival_5' },
  // ch11
  { kind: 'wild', table: 'snowpeak', zone: 'snowpeak', n: 2, catchOne: false },
  { kind: 'zoneTrainers', zone: 'snowpeak' },
  { kind: 'trainer', id: 't_hall6_01' }, { kind: 'trainer', id: 't_hall6_02' },
  { kind: 'trainer', id: 't_cantor_6' },
  { kind: 'disc', ids: ['i_disc_14'] }, // trial_6 reward
  { kind: 'trainer', id: 't_still_08' },
  { kind: 'trainer', id: 't_odile' },
  // ch12
  { kind: 'trainer', id: 't_rival_6' },
  { kind: 'trainer', id: 't_champion' },
];

// Player heal-item budget per story battle (systems §12.1 "first sold" + §12.5 typical purchases; small).
export function salveBudget(id: string): string[] {
  const n = STORY_BY_ID[id]?.n ?? 0;
  if (n <= 3) return ['i_salve_1', 'i_salve_1'];            // gift 3× Honey Salve; Clover sold after trial_1
  if (n <= 8) return ['i_salve_2', 'i_salve_2'];            // Clover Salve
  if (n <= 12) return ['i_salve_3', 'i_salve_3', 'i_salve_3']; // Ember-root Salve after trial_3
  return ['i_salve_4', 'i_salve_4', 'i_salve_3', 'i_salve_3']; // Hearth Balm after trial_5
}

// ---------------------------------------------------------------------------------------------
// Trainer teams: replicates src/state/game.ts buildBattleSetup (same rng seeding, potentials, temperament).
export function trainerTeam(t: TrainerDef, starter: string, phase = 0): CreatureInstance[] {
  const rng = phase === 0 ? new Rng([hashString(t.id), 7, 13, 21]) : new Rng([hashString(t.id + phase), 3, 5, 7]);
  const members = t.phases ? t.phases[phase].team : t.team;
  return members.map((m) => createInstance(c, rng, resolveRivalSpecies(m.species, starter), m.level, { potential: t.potential, temperament: 'tm_steady' }));
}

export function aceLevel(t: TrainerDef): number {
  const all = t.phases ? t.phases.flatMap((p) => p.team) : t.team;
  return Math.max(...all.map((m) => m.level));
}

// ---------------------------------------------------------------------------------------------
// Battle runner with a player policy = the real AI scoring from the player's side (hard: best score,
// matchup replacement, ≤2 voluntary switches) plus a small salve budget (heal at < 25% HP, ≤ 2 per kin).
export interface RunResult { outcome: 'win' | 'loss' | 'fled' | 'captured' | 'timeout'; turns: number; state: BattleState; salvesUsed: number }

function mirror(s: BattleState, pSwitches: number, pSwitchedLast: boolean, foeRevealed: string[], rngAI: BattleState['rngAI']): BattleState {
  return { ...s, player: s.foe, foe: s.player, ai: 'hard', aiItems: [], aiSwitches: pSwitches, aiSwitchedLastTurn: pSwitchedLast, aiItemUsed: true, revealedPlayerMoves: foeRevealed, rngAI };
}

export function runBattle(setup: BattleSetup, seed: number, opts: { salves?: string[]; trainer?: TrainerDef; starter?: string; log?: (events: unknown[]) => void; retreat?: boolean } = {}): RunResult {
  let s = createBattle(c, setup, seed);
  s = openingEvents(c, s).state;
  let pRng = seedRng((seed * 2654435761) >>> 0);
  let pSwitches = 0;
  let pSwitchedLast = false;
  const foeRevealed: string[] = [];
  const salves = (opts.salves ?? []).slice();
  const salvesPerKin: Record<number, number> = {};
  let salvesUsed = 0;
  let phase = 0;
  while (!s.outcome) {
    if (s.turn > TURN_LIMIT) return { outcome: 'timeout', turns: s.turn - 1, state: s, salvesUsed };
    if (act(s, 'player').inst.hp <= 0) {
      let to = aiReplacement(c, mirror(s, pSwitches, pSwitchedLast, foeRevealed, pRng));
      // a player finishing off a nearly beaten foe (≤ 25% HP) sends the fastest kin that outspeeds it, else the one
      // that best resists its revealed moves (the mirrored AI's matchup pick often sends a slow kin into a KO)
      const foe = act(s, 'foe');
      if (foe.inst.hp * 4 <= foe.stats.hp) {
        let best = -1;
        s.player.team.forEach((m, i) => {
          if (m.inst.hp <= 0 || effSpe(c, s, m) <= effSpe(c, s, foe)) return;
          if (best < 0 || effSpe(c, s, m) > effSpe(c, s, s.player.team[best])) best = i;
        });
        if (best < 0) {
          // nobody outspeeds it: send the kin that best resists what it has shown (it survives a hit, then finishes)
          const rev = foeRevealed.map((id) => c.moves[id]).filter((m) => m.category !== 'status').map((m) => m.type);
          const thr = rev.length ? rev : typesOf(c, foe);
          let bestT = Infinity;
          s.player.team.forEach((m, i) => {
            if (m.inst.hp <= 0) return;
            const t = Math.max(...thr.map((ty) => effectiveness(c, ty, typesOf(c, m))));
            if (t < bestT || (t === bestT && m.inst.hp > s.player.team[best].inst.hp)) { bestT = t; best = i; }
          });
        }
        if (best >= 0) to = best;
      }
      s = applyReplace(c, s, { kind: 'switch', to }).state;
      continue;
    }
    const ai = chooseAiAction(c, s);
    const pm = chooseAiAction(c, mirror(s, pSwitches, pSwitchedLast, foeRevealed, pRng));
    pRng = pm.rngAI;
    let pa: Action = pm.action;
    const me = act(s, 'player');
    const idx = s.player.active;
    if (salves.length && me.inst.hp * 4 < me.stats.hp && (salvesPerKin[idx] ?? 0) < 2) {
      pa = { kind: 'item', item: salves.pop()!, target: idx };
      salvesPerKin[idx] = (salvesPerKin[idx] ?? 0) + 1;
      salvesUsed++;
    }
    // Human-style retreat (the AI's own voluntary switch needs best score < 25, so it almost never fires): when the
    // foe threatens the active kin super-effectively (revealed moves, else its types) and a healthy bench kin
    // resists that threat (or is neutral to it and hits back super-effectively), switch. Same limits as the AI:
    // ≤ 2 voluntary switches per battle, never twice in a row.
    if ((opts.retreat ?? !!process.env.HUMAN_SWITCH) && pa.kind === 'move' && pSwitches < 2 && !pSwitchedLast && me.inst.hp * 4 > me.stats.hp) {
      const foe = act(s, 'foe');
      const revealed = foeRevealed.map((id) => c.moves[id]).filter((m) => m.category !== 'status').map((m) => m.type);
      const threatTypes = revealed.length ? revealed : typesOf(c, foe);
      const threat = (cb: typeof me) => Math.max(...threatTypes.map((t) => effectiveness(c, t, typesOf(c, cb))));
      const offense = (cb: typeof me) => Math.max(0, ...cb.inst.moves.filter((m) => c.moves[m.id].category !== 'status').map((m) => effectiveness(c, c.moves[m.id].type, typesOf(c, foe))));
      if (threat(me) >= 8) {
        let best = -1;
        let bestM = -Infinity;
        s.player.team.forEach((m, i) => {
          if (i === idx || m.inst.hp * 5 < m.stats.hp * 3) return;
          const th = threat(m);
          const of = offense(m);
          if (!(th <= 2 || (th <= 4 && of >= 8))) return;
          if (of - th > bestM) { bestM = of - th; best = i; }
        });
        if (best >= 0) pa = { kind: 'switch', to: best };
      }
    }
    if (pa.kind === 'switch') pSwitches++;
    pSwitchedLast = pa.kind === 'switch';
    const r = resolveTurn(c, { ...s, rngAI: ai.rngAI }, pa, ai.action);
    opts.log?.(r.events);
    for (const e of r.events) if (e.t === 'moveUsed' && e.side === 'foe' && e.move !== 'm000' && !foeRevealed.includes(e.move)) foeRevealed.push(e.move);
    s = r.state;
    // Odile-style phase change (replicates src/battle/battleStore.ts command())
    const t = opts.trainer;
    if (s.outcome === 'win' && t?.phases && phase < t.phases.length - 1) {
      phase++;
      const team = trainerTeam(t, opts.starter ?? 'c01', phase);
      s = structuredClone(s);
      s.outcome = null;
      s.foe = { team: team.map((inst) => ({ inst, stats: computeStats(c, inst), stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 }, vol: {}, bulwarkChain: 0, usedBulwarkLastTurn: false })), active: 0 };
      s.attunedType = t.phases[phase].attuned as TypeId | null;
      foeRevealed.length = 0;
    }
  }
  return { outcome: s.outcome!, turns: s.turn - 1, state: s, salvesUsed };
}

// ---------------------------------------------------------------------------------------------
// Player progression: move learning, evolution, catches.
function moveValue(inst: CreatureInstance, id: string): number {
  const mv = c.moves[id];
  const sp = c.species[inst.species];
  if (mv.category === 'status') return mv.effects.some((e) => e.kind === 'heal') ? 30 : 20;
  const hits = mv.effects.find((e) => e.kind === 'hits');
  const stats = computeStats(c, inst);
  const stat = mv.category === 'physical' ? stats.atk : stats.spa;
  const stab = sp.types.includes(mv.type as TypeId) ? 1.5 : 1;
  const recoil = mv.effects.some((e) => e.kind === 'recoil') ? 0.85 : 1;
  return ((mv.power ?? 0) * (hits && hits.kind === 'hits' ? hits.count : 1) * ((mv.accuracy ?? 100) / 100) * stab * recoil * stat) / Math.max(stats.atk, stats.spa);
}

/** A sensible player: learn into a free slot; otherwise replace a redundant move (a status move, or the weakest
 * of two damaging moves that share a type, or the old move of the new move's type) when the new one is better.
 * A player keeps type coverage: the only move of a damaging type is dropped only for a clearly stronger move. */
export function offerMove(inst: CreatureInstance, move: string): CreatureInstance {
  if (knows(inst, move)) return inst;
  if (inst.moves.length < 4) return learnMove(c, inst, move);
  const vals = inst.moves.map((m) => moveValue(inst, m.id));
  const newVal = moveValue(inst, move);
  const typeOf = (id: string) => (c.moves[id].category === 'status' ? null : c.moves[id].type);
  const count = (t: string) => inst.moves.filter((m) => typeOf(m.id) === t).length;
  const nt = typeOf(move);
  let worst = -1;
  for (let i = 0; i < 4; i++) {
    const t = typeOf(inst.moves[i].id);
    const redundant = t === null || count(t) >= 2 || (nt !== null && t === nt);
    if (redundant && (worst < 0 || vals[i] < vals[worst])) worst = i;
  }
  if (worst >= 0) return newVal > vals[worst] ? learnMove(c, inst, move, worst) : inst;
  // four different damaging types: drop the weakest only for a clearly stronger move
  worst = 0;
  for (let i = 1; i < 4; i++) if (vals[i] < vals[worst]) worst = i;
  if (newVal > vals[worst] * 1.5) return learnMove(c, inst, move, worst);
  return inst;
}

/** Etudes are reusable (systems §8.5): offer every owned disc to every compatible kin; offerMove decides. */
export function teachDiscs(party: CreatureInstance[], discs: string[]): CreatureInstance[] {
  if (process.env.NO_DISCS) return party;
  return party.map((m) => {
    let inst = m;
    for (const d of discs) if (canLearnDisc(c, inst, d)) inst = offerMove(inst, (c.items[d].params as { move: string }).move);
    return inst;
  });
}

/** Post-battle: apply pending learn prompts, evolve anyone ready (player accepts), full heal (Hearthrest). */
export function afterBattle(s: BattleState): CreatureInstance[] {
  let party = playerPartyAfter(s);
  for (const pl of s.pendingLearn) party = party.map((m) => (m.uid === pl.uid ? offerMove(m, pl.move) : m));
  party = party.map((m) => {
    let inst = m;
    for (let guard = 0; guard < 3; guard++) {
      const to = evolutionTarget(c, inst);
      if (!to) break;
      const r = evolve(c, inst, to);
      inst = r.inst;
      if (r.pending) inst = offerMove(inst, r.pending);
    }
    return healFull(c, inst);
  });
  return orderParty(party);
}

/** Lead choice: the starter leads while it is within 2 levels of the strongest kin, otherwise the
 * highest-level kin leads (a player does not keep leading with a kin that keeps fainting). */
export function orderParty(party: CreatureInstance[]): CreatureInstance[] {
  const max = Math.max(...party.map((m) => m.level));
  const starter = party.findIndex((m) => m.bond);
  let lead = starter >= 0 && party[starter].level >= max - Number(process.env.LEAD_GAP ?? 2) ? starter : party.findIndex((m) => m.level === max);
  if (lead < 0) lead = 0;
  return [party[lead], ...party.filter((_, i) => i !== lead)];
}

// Greedy type-coverage catch choice (qa_plan §7.2 item 3): common species of the zone table, new family,
// maximising super-effective STAB hits on the next three story teams, minus their STAB threats.
export function chooseCatch(table: string, party: CreatureInstance[], starter: string, nextStory: string[]): { species: string; level: number } | null {
  const rows = ENCOUNTERS.tables[table];
  const fams = new Set(party.map((m) => c.species[m.species].family));
  const partyTypes = new Set(party.flatMap((m) => c.species[m.species].types));
  // the very next story battle counts double (a player catches for the upcoming Cantor first)
  const foes = nextStory.flatMap((id, k) => trainerTeam(TRAINERS[id], starter).concat(TRAINERS[id].phases ? trainerTeam(TRAINERS[id], starter, 1) : []).map((f) => ({ f, w: k === 0 ? 2 : 1 })));
  let best: { species: string; level: number; score: number } | null = null;
  for (const r of rows) {
    if (Math.max(r.day, r.night) < 15) continue;
    const sp = c.species[r.species];
    if (fams.has(sp.family)) continue;
    let score = 0;
    for (const { f, w } of foes) {
      const ft = c.species[f.species].types;
      const eff = (t: TypeId, def: TypeId[]) => def.reduce((a, d) => a * c.typeMatrix[t][d], 1) / Math.pow(2, def.length);
      if (sp.types.some((t) => eff(t, ft) > 1)) score += w;
      if (ft.some((t) => eff(t, sp.types) > 1)) score -= w; // and avoids kin the coming teams hit super-effectively
    }
    for (const t of sp.types) if (!partyTypes.has(t)) score += 1;
    score += Object.values(sp.base).reduce((a, b) => a + b, 0) / 1000;
    if (!best || score > best.score) best = { species: r.species, level: Math.floor((r.lo + r.hi) / 2), score };
  }
  return best;
}

export function attunedFor(zone: string, silenced: Set<string>): TypeId | null {
  if (silenced.has(zone)) return null;
  return (ZONES[zone]?.attuned ?? null) as TypeId | null;
}

export function trainerSetup(t: TrainerDef, party: CreatureInstance[], starter: string, attuned: TypeId | null): BattleSetup {
  return {
    kind: 'trainer',
    playerParty: party,
    foeParty: trainerTeam(t, starter),
    ai: t.ai,
    aiItems: t.items,
    ambientWeather: 'clear',
    attunedType: t.phases ? (t.phases[0].attuned as TypeId | null) : attuned,
    trainerId: t.id,
    mandatory: t.mandatory,
    payout: t.payout,
  };
}

// ---------------------------------------------------------------------------------------------
export interface WinStats { winPct: number; avgTurns: number; avgSalves: number; timeouts: number; errors: string[]; firstWin: RunResult | null; last: RunResult | null }

/** SIM-01 core: the same party against a story trainer over `seeds` seeds. `patch` lets what-if runs edit the trainer. */
export function storyWinRate(t0: TrainerDef, party: CreatureInstance[], starter: string, attuned: TypeId | null, seeds: number, patch?: (t: TrainerDef) => TrainerDef, salt = ''): WinStats {
  const t = patch ? patch(structuredClone(t0)) : t0;
  const out: WinStats = { winPct: 0, avgTurns: 0, avgSalves: 0, timeouts: 0, errors: [], firstWin: null, last: null };
  let wins = 0;
  for (let k = 0; k < seeds; k++) {
    try {
      const r = runBattle(trainerSetup(t, party, starter, attuned), hashString(`${starter}${salt}:${t.id}:${k}`), { salves: salveBudget(t.id), trainer: t, starter });
      out.last = r;
      if (r.outcome === 'win') { wins++; out.firstWin ??= r; }
      if (r.outcome === 'timeout') out.timeouts++;
      out.avgTurns += r.turns / seeds;
      out.avgSalves += r.salvesUsed / seeds;
    } catch (e) {
      out.errors.push(`${t.id} seed ${k}: ${(e as Error).message}`);
    }
  }
  out.winPct = (100 * wins) / seeds;
  return out;
}

/** The same troupe `d` levels higher (XP added through the real addXp, then evolutions/moves as the player would). */
export function levelShift(party: CreatureInstance[], d: number): CreatureInstance[] {
  return party.map((m) => {
    const need = xpForLevel(c.species[m.species].growth, Math.min(60, m.level + d)) - m.xp;
    const r = addXp(c, m, Math.max(0, need));
    let inst = r.inst;
    for (const mv of r.pendingLearn) inst = offerMove(inst, mv);
    for (let g = 0; g < 3; g++) {
      const to = evolutionTarget(c, inst);
      if (!to) break;
      const e = evolve(c, inst, to);
      inst = e.inst;
      if (e.pending) inst = offerMove(inst, e.pending);
    }
    return healFull(c, inst);
  });
}

export interface StoryRow {
  info: StoryInfo;
  starterLv: number;
  leadLv: number;
  partyAvg: number;
  partySize: number;
  aceLv: number;
  winPct: number;
  avgTurns: number;
  avgSalves: number;
  timeouts: number;
  winPctNoAttune?: number;
  winPctPlus3?: number;
  /** per-path win % (simulateCampaignPaths) */
  pathWin?: number[];
  party: string;
}

export interface CampaignResult { starter: string; rows: StoryRow[]; errors: string[]; progressionLosses: string[]; wildBattles: number; trainerBattles: number }

export interface CampaignHooks {
  trace?: (msg: string) => void;
  /** called before each story battle with the party the sim is about to use (for what-if experiments) */
  onStory?: (id: string, party: CreatureInstance[], attuned: TypeId | null) => void;
}

export function simulateCampaign(starter: string, seeds: number, hooks: CampaignHooks = {}, path = 0): CampaignResult {
  const salt = path ? `#${path}` : ''; // path 0 keeps the original seeding
  const trace = hooks.trace;
  const rng = new Rng(seedRng(hashString('balance:' + starter + salt)));
  let party: CreatureInstance[] = [createInstance(c, rng, starter, 5, { potential: 10, temperament: 'tm_steady', bond: true })];
  const silenced = new Set<string>();
  const rows: StoryRow[] = [];
  const errors: string[] = [];
  const progressionLosses: string[] = [];
  let wildBattles = 0;
  let trainerBattles = 0;
  const storyIdx = (i: number) => PATH.slice(i + 1).filter((st) => st.kind === 'trainer' && STORY_BY_ID[st.id]).map((st) => (st as { id: string }).id).slice(0, 3);

  let step = 0;
  const discs: string[] = [];
  // Route / hall trainers: the player spends one salve of the current shop tier per battle (systems §12.5 buys ≈3 per chapter).
  const routeSalves = () => (process.env.NO_ROUTE_SALVE ? [] : salveBudget(storyIdx(step - 1)[0] ?? 't_champion').slice(0, 1));
  const fightTrainer = (id: string) => {
    const t = TRAINERS[id];
    if (!t) { errors.push(`missing trainer ${id}`); return; }
    const attuned = attunedFor(t.zone, silenced);
    const info = STORY_BY_ID[id];
    trainerBattles++;
    if (info) {
      // SIM-01: many seeds at the current (simulated) party
      hooks.onStory?.(id, party, attuned);
      const main = storyWinRate(t, party, starter, attuned, seeds, undefined, salt);
      errors.push(...main.errors);
      const row: StoryRow = {
        info,
        starterLv: party.find((m) => m.bond)!.level,
        leadLv: Math.max(...party.map((m) => m.level)),
        partyAvg: party.reduce((a, m) => a + m.level, 0) / party.length,
        partySize: party.length,
        aceLv: aceLevel(t),
        winPct: main.winPct,
        avgTurns: main.avgTurns,
        avgSalves: main.avgSalves,
        timeouts: main.timeouts,
        party: party.map((m) => `${m.species}@${m.level}`).join(' '),
      };
      // D3 evidence: Cantor win rate without the attunement bonus
      if (info.cantor) row.winPctNoAttune = storyWinRate(t, party, starter, null, seeds, undefined, salt).winPct;
      // balance signal (qa_plan §7.2 item 8): below target → win rate with the whole party +3 levels
      if (row.winPct < info.minWin) row.winPctPlus3 = storyWinRate(t, levelShift(party, 3), starter, attuned, seeds, undefined, salt).winPct;
      rows.push(row);
      const used = main.firstWin ?? main.last;
      if (!main.firstWin) progressionLosses.push(id);
      if (used) party = teachDiscs(afterBattle(used.state), discs);
      return;
    }
    // non-story trainer: a player retries until they win (≤ 10 attempts); XP from the winning run
    for (let k = 0; k < 10; k++) {
      const r = runBattle(trainerSetup(t, party, starter, attuned), hashString(`${starter}${salt}:${id}:p${k}`), { salves: routeSalves(), trainer: t, starter, retreat: !process.env.NO_RETREAT });
      if (r.outcome === 'win' || k === 9) {
        if (r.outcome !== 'win') progressionLosses.push(id);
        party = afterBattle(r.state);
        trace?.(`trainer ${id} -> ${r.outcome} (attempt ${k + 1}) in ${r.turns}; party ${party.map((m) => `${m.species}@${m.level}/${m.xp}`).join(' ')}`);
        return;
      }
    }
  };

  PATH.forEach((st, i) => {
    step = i;
    if (st.kind === 'gift') {
      if (process.env.NO_GIFTS) return;
      const sp = st.which === 'leftover' ? leftoverStarter(starter) : rivalStarter(starter);
      let gift = createInstance(c, rng, sp, st.level, { potential: 10, temperament: 'tm_steady' }); // as G.giveKin
      for (let g = 0; g < 3; g++) {
        const to = evolutionTarget(c, gift);
        if (!to) break;
        const e = evolve(c, gift, to);
        gift = e.inst;
        if (e.pending) gift = offerMove(gift, e.pending);
      }
      let weakest = -1;
      party.forEach((m, k) => { if (!m.bond && (weakest < 0 || m.level < party[weakest].level)) weakest = k; });
      if (party.length < 6) party = [...party, gift];
      else if (weakest >= 0 && (st.always || gift.level >= party[weakest].level)) party = party.map((m, k) => (k === weakest ? gift : m));
      party = teachDiscs(orderParty(party), discs);
      return;
    }
    if (st.kind === 'disc') { discs.push(...st.ids); party = teachDiscs(party, discs); return; }
    if (st.kind === 'silence') { if (st.on) silenced.add(st.zone); else silenced.delete(st.zone); return; }
    if (st.kind === 'trainer') return fightTrainer(st.id);
    if (st.kind === 'zoneTrainers') {
      for (const t of Object.values(TRAINERS)) if (t.zone === st.zone && !t.mandatory) fightTrainer(t.id);
      return;
    }
    // wild battles: day, clear weather; defeat the foe (easy AI); optionally catch one kin
    const wrng = new Rng(seedRng(hashString(`${starter}${salt}:wild:${st.table}`)));
    for (let k = 0; k < st.n; k++) {
      const enc = rollEncounter(c, ENCOUNTERS, st.table, false, 'clear', wrng)!;
      const foe = createInstance(c, wrng, enc.species, enc.level, { potential: 'random', temperament: 'random' });
      const setup: BattleSetup = { kind: 'wild', playerParty: party, foeParty: [foe], ai: 'easy', ambientWeather: 'clear', attunedType: attunedFor(st.zone, silenced) };
      const r = runBattle(setup, wrng.nextU32(), { retreat: !process.env.NO_RETREAT });
      wildBattles++;
      party = afterBattle(r.state);
      trace?.(`wild ${st.table} ${foe.species}@${foe.level} -> ${r.outcome} in ${r.turns}; party ${party.map((m) => `${m.species}@${m.level}/${m.xp}`).join(' ')}`);
    }
    if (st.catchOne && party.length < 6) {
      let pick = chooseCatch(st.table, party, starter, storyIdx(i));
      const ov = (process.env.CATCH_OV ?? '').split(',').find((x) => x.startsWith(st.table + '='));
      if (ov) { const r = ENCOUNTERS.tables[st.table].find((x) => x.species === ov.split('=')[1])!; pick = { species: r.species, level: Math.floor((r.lo + r.hi) / 2) }; }
      if (pick) party.push(createInstance(c, wrng, pick.species, pick.level, { potential: 'random', temperament: 'random' }));
    }
  });
  return { starter, rows, errors, progressionLosses, wildBattles, trainerBattles };
}

/**
 * Several independent progressions per starter (different catches' potentials, wild rolls and story seeds), each
 * with `seeds` seeds per story battle; rows are averaged. One path alone is one player's run and swings a lot
 * (a single catch changes the next three battles); the mean over paths is the balance signal.
 */
export function simulateCampaignPaths(starter: string, seeds: number, paths: number, hooks: CampaignHooks = {}): CampaignResult {
  const runs = Array.from({ length: paths }, (_, p) => simulateCampaign(starter, seeds, hooks, p));
  const mean = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const rows: StoryRow[] = runs[0].rows.map((r0, i) => {
    const rs = runs.map((r) => r.rows[i]).filter((r) => r && r.info.id === r0.info.id);
    return {
      ...r0,
      starterLv: mean(rs.map((r) => r.starterLv))!,
      leadLv: Math.min(...rs.map((r) => r.leadLv)), // SIM-03 uses the weakest path
      partyAvg: mean(rs.map((r) => r.partyAvg))!,
      winPct: mean(rs.map((r) => r.winPct))!,
      avgTurns: mean(rs.map((r) => r.avgTurns))!,
      avgSalves: mean(rs.map((r) => r.avgSalves))!,
      timeouts: rs.reduce((a, r) => a + r.timeouts, 0),
      winPctNoAttune: mean(rs.map((r) => r.winPctNoAttune)),
      winPctPlus3: mean(rs.map((r) => r.winPctPlus3)),
      pathWin: rs.map((r) => r.winPct),
      party: rs.map((r) => r.party).join(' | '),
    };
  });
  return {
    starter,
    rows,
    errors: runs.flatMap((r) => r.errors),
    progressionLosses: runs.flatMap((r, p) => r.progressionLosses.map((x) => `${x}#${p}`)),
    wildBattles: runs[0].wildBattles,
    trainerBattles: runs[0].trainerBattles,
  };
}

export function formatTable(r: CampaignResult): string {
  const head = '| # | Battle | Party avg Lv | Model avg | Top (min over paths) / starter Lv | Foe ace Lv | Win % | Per-path win % | Target | Win % no attune | Win % at +3 Lv | Avg turns | Salves used |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const f = (v?: number) => (v == null ? '—' : v.toFixed(0));
  const lines = r.rows.map((x) =>
    `| ${x.info.n} | ${x.info.label} | ${x.partyAvg.toFixed(1)} | ${x.info.modelAvg} | ${x.leadLv} / ${x.starterLv.toFixed(0)} | ${x.aceLv} | ${f(x.winPct)}${x.winPct < x.info.minWin ? ' ✗' : ''} | ${(x.pathWin ?? [x.winPct]).map(f).join(' / ')} | ≥${x.info.minWin}${x.info.blocking ? '' : '*'} | ${f(x.winPctNoAttune)} | ${f(x.winPctPlus3)} | ${x.avgTurns.toFixed(1)} | ${x.avgSalves.toFixed(1)} |`,
  );
  return [head, sep, ...lines].join('\n');
}
