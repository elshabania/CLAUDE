// Deterministic, pure battle simulation. Implements design/systems.md sections 3–8 and 15.
// Inputs are never mutated: every public function deep-clones the state it receives.
import type { Content } from '../content';
import { Rng, seedRng } from '../rng';
import { computeStats, stageMult } from '../stats';
import type { CreatureInstance, MajorStatus, MoveDef, MoveTypeId, StageStat, TypeId, WeatherId } from '../types';
import { addXp } from '../progression';
import type { Action, BattleEvent, BattleSetup, BattleSide, BattleState, Combatant, SideId } from './types';

export const FALLBACK_MOVE = 'm000';
const STAGES: StageStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];

function freshStages(): Record<StageStat, number> {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
}

function makeCombatant(c: Content, inst: CreatureInstance): Combatant {
  return {
    inst: structuredClone(inst),
    stats: computeStats(c, inst),
    stages: freshStages(),
    vol: {},
    bulwarkChain: 0,
    usedBulwarkLastTurn: false,
  };
}

export function createBattle(c: Content, setup: BattleSetup, seed: number): BattleState {
  const firstAlive = (team: CreatureInstance[]) => Math.max(0, team.findIndex((m) => m.hp > 0));
  const st: BattleState = {
    kind: setup.kind,
    player: { team: setup.playerParty.map((i) => makeCombatant(c, i)), active: firstAlive(setup.playerParty) },
    foe: { team: setup.foeParty.map((i) => makeCombatant(c, i)), active: firstAlive(setup.foeParty) },
    ai: setup.ai,
    aiItems: (setup.aiItems ?? []).slice(),
    aiSwitches: 0,
    aiSwitchedLastTurn: false,
    aiItemUsed: false,
    ambientWeather: setup.ambientWeather,
    weather: setup.ambientWeather,
    weatherTurns: null,
    attunedType: setup.attunedType,
    turn: 1,
    rng: seedRng(seed),
    rngAI: seedRng((seed ^ 0x9e3779b9) >>> 0),
    runAttempts: 0,
    revealedPlayerMoves: [],
    participants: {},
    outcome: null,
    needPlayerReplace: false,
    captured: null,
    capturedWith: null,
    pendingLearn: [],
    pendingEvolutions: [],
    trainerId: setup.trainerId,
    payout: setup.payout ?? 0,
    itemsUsed: {},
    seq: 0,
  };
  markParticipation(st);
  return st;
}

/** Events emitted when the battle opens (send-outs + entry traits). */
export function openingEvents(c: Content, s0: BattleState): { state: BattleState; events: BattleEvent[] } {
  const s = structuredClone(s0);
  const ctx = new Ctx(c, s);
  ctx.push({ t: 'sendOut', side: 'foe', index: s.foe.active, species: act(s, 'foe').inst.species, name: nm(c, act(s, 'foe')) });
  ctx.push({ t: 'sendOut', side: 'player', index: s.player.active, species: act(s, 'player').inst.species, name: nm(c, act(s, 'player')) });
  ctx.entryTraits(['player', 'foe']);
  ctx.finish();
  return { state: s, events: ctx.events };
}

// ---------- helpers ----------
export function side(s: BattleState, id: SideId): BattleSide {
  return id === 'player' ? s.player : s.foe;
}
export function act(s: BattleState, id: SideId): Combatant {
  const sd = side(s, id);
  return sd.team[sd.active];
}
export const other = (id: SideId): SideId => (id === 'player' ? 'foe' : 'player');
export function nm(c: Content, cb: Combatant): string {
  return cb.inst.nickname || c.species[cb.inst.species].name;
}
export function typesOf(c: Content, cb: Combatant): TypeId[] {
  return c.species[cb.inst.species].types;
}
export function traitOf(c: Content, cb: Combatant): string {
  return c.species[cb.inst.species].trait;
}
export function effectiveness(c: Content, moveType: MoveTypeId, defTypes: TypeId[]): number {
  // returns quarters: 4 = neutral
  if (moveType === 'none') return 4;
  const k1 = c.typeMatrix[moveType][defTypes[0]];
  const k2 = defTypes[1] ? c.typeMatrix[moveType][defTypes[1]] : 2;
  return k1 * k2;
}
function markParticipation(s: BattleState) {
  const f = act(s, 'foe');
  const p = act(s, 'player');
  if (!f || !p || p.inst.hp <= 0) return;
  const list = (s.participants[f.inst.uid] ??= []);
  if (!list.includes(p.inst.uid)) list.push(p.inst.uid);
}
export function aliveCount(sd: BattleSide): number {
  return sd.team.filter((m) => m.inst.hp > 0).length;
}

export function effSpe(c: Content, s: BattleState, cb: Combatant): number {
  let v = stageMult(cb.stats.spe, cb.stages.spe);
  const tr = traitOf(c, cb);
  if (cb.inst.status === 'paralysis' && tr !== 'tr_quick_feet') v = Math.floor(v / 2);
  if (tr === 'tr_rain_glide' && s.weather === 'rain') v *= 2;
  if (tr === 'tr_sun_bask' && s.weather === 'sunlight') v *= 2;
  if (tr === 'tr_quick_feet' && cb.inst.status) v = Math.floor((v * 3) / 2);
  return v;
}

function moveOf(c: Content, cb: Combatant, slot: number): MoveDef {
  if (slot < 0) return c.moves[FALLBACK_MOVE];
  return c.moves[cb.inst.moves[slot].id];
}

export function usableSlots(cb: Combatant): number[] {
  return cb.inst.moves.map((m, i) => (m.charges > 0 ? i : -1)).filter((i) => i >= 0);
}

// ---------- context carrying rng + event log ----------
class Ctx {
  events: BattleEvent[] = [];
  rng: Rng;
  constructor(public c: Content, public s: BattleState) {
    this.rng = new Rng(s.rng);
  }
  push(e: BattleEvent) {
    this.events.push(e);
    this.s.seq++;
  }
  finish() {
    this.s.rng = this.rng.state();
  }

  // ---- HP changes ----
  damage(sd: SideId, amount: number, extra: Partial<Extract<BattleEvent, { t: 'damage' }>> = {}): number {
    const cb = act(this.s, sd);
    const before = cb.inst.hp;
    const amt = Math.min(before, Math.max(0, amount));
    cb.inst.hp = before - amt;
    this.push({ t: 'damage', side: sd, amount: amt, hpBefore: before, hpAfter: cb.inst.hp, maxHp: cb.stats.hp, eff: 4, crit: false, attuned: false, source: 'move', ...extra });
    return amt;
  }
  heal(sd: SideId, amount: number, source: string): number {
    const cb = act(this.s, sd);
    if (cb.inst.hp <= 0) return 0;
    const before = cb.inst.hp;
    cb.inst.hp = Math.min(cb.stats.hp, before + Math.max(0, amount));
    const amt = cb.inst.hp - before;
    if (amt > 0) this.push({ t: 'heal', side: sd, amount: amt, hpBefore: before, hpAfter: cb.inst.hp, maxHp: cb.stats.hp, source });
    return amt;
  }

  // ---- statuses ----
  canReceiveStatus(sd: SideId, status: MajorStatus): { ok: boolean; reason?: string } {
    const cb = act(this.s, sd);
    if (cb.inst.hp <= 0) return { ok: false, reason: 'fainted' };
    if (cb.inst.status) return { ok: false, reason: 'already' };
    const types = typesOf(this.c, cb);
    const tr = traitOf(this.c, cb);
    if (status === 'burn' && (types.includes('fire') || tr === 'tr_flame_sink')) return { ok: false, reason: 'immune' };
    if (status === 'poison' && (types.includes('toxin') || types.includes('stone'))) return { ok: false, reason: 'immune' };
    if (status === 'paralysis' && (types.includes('electric') || tr === 'tr_charge_sink')) return { ok: false, reason: 'immune' };
    if (status === 'frostbite' && (types.includes('frost') || this.s.weather === 'sunlight')) return { ok: false, reason: 'immune' };
    return { ok: true };
  }
  applyStatus(sd: SideId, status: MajorStatus) {
    const cb = act(this.s, sd);
    cb.inst.status = status;
    if (status === 'sleep') cb.inst.sleepCounter = this.rng.int(1, 3);
    this.push({ t: 'statusApplied', side: sd, status, name: nm(this.c, cb) });
  }
  changeStage(target: SideId, stat: StageStat, delta: number, byFoe: boolean): boolean {
    const cb = act(this.s, target);
    if (cb.inst.hp <= 0) return false;
    if (byFoe && delta < 0 && traitOf(this.c, cb) === 'tr_clear_mind') {
      this.push({ t: 'traitTriggered', side: target, trait: 'tr_clear_mind', name: nm(this.c, cb) });
      return false;
    }
    const before = cb.stages[stat];
    const after = Math.max(-6, Math.min(6, before + delta));
    cb.stages[stat] = after;
    this.push({ t: 'statChange', side: target, stat, delta: after - before, name: nm(this.c, cb), capped: after === before });
    return after !== before;
  }

  entryTraits(order: SideId[]) {
    for (const sd of order) {
      const cb = act(this.s, sd);
      if (cb.inst.hp <= 0) continue;
      if (traitOf(this.c, cb) === 'tr_menace') {
        this.push({ t: 'traitTriggered', side: sd, trait: 'tr_menace', name: nm(this.c, cb) });
        this.changeStage(other(sd), 'atk', -1, true);
      }
    }
  }

  switchTo(sd: SideId, to: number) {
    const sideObj = side(this.s, sd);
    const out = act(this.s, sd);
    this.push({ t: 'recall', side: sd, index: sideObj.active, name: nm(this.c, out) });
    out.stages = freshStages();
    out.vol = {};
    out.bulwarkChain = 0;
    sideObj.active = to;
    const inc = act(this.s, sd);
    inc.stages = freshStages();
    inc.vol = {};
    this.push({ t: 'sendOut', side: sd, index: to, species: inc.inst.species, name: nm(this.c, inc) });
    markParticipation(this.s);
    this.entryTraits([sd]);
  }

  switchInAfterFaint(sd: SideId, to: number) {
    const sideObj = side(this.s, sd);
    sideObj.active = to;
    const inc = act(this.s, sd);
    inc.stages = freshStages();
    inc.vol = {};
    inc.bulwarkChain = 0;
    this.push({ t: 'sendOut', side: sd, index: to, species: inc.inst.species, name: nm(this.c, inc) });
    markParticipation(this.s);
    this.entryTraits([sd]);
  }

  // ---- damage formula ----
  calcDamage(atkSide: SideId, move: MoveDef, opts: { crit: boolean; random: number; powerOverride?: number }): { dmg: number; eff: number; attuned: boolean } {
    const c = this.c;
    const s = this.s;
    const a = act(s, atkSide);
    const d = act(s, other(atkSide));
    return computeDamage(c, s, a, d, move, opts);
  }
}

/** Pure damage computation shared by the engine and the AI estimator. */
export function computeDamage(
  c: Content,
  s: BattleState,
  a: Combatant,
  d: Combatant,
  move: MoveDef,
  opts: { crit: boolean; random: number },
): { dmg: number; eff: number; attuned: boolean } {
  const physical = move.category === 'physical';
  const aTr = traitOf(c, a);
  const dTr = traitOf(c, d);
  const aTypes = typesOf(c, a);
  const dTypes = typesOf(c, d);
  const aStat = physical ? 'atk' : 'spa';
  const dStat = physical ? 'def' : 'spd';
  let aStage = a.stages[aStat];
  let dStage = d.stages[dStat];
  if (opts.crit) {
    aStage = Math.max(aStage, 0);
    dStage = Math.min(dStage, 0);
  }
  const A = Math.max(1, stageMult(a.stats[aStat], aStage));
  let D = Math.max(1, stageMult(d.stats[dStat], dStage));
  if (physical && s.weather === 'snow' && dTypes.includes('frost')) D = Math.floor((D * 3) / 2);
  if (physical && s.weather === 'snow' && dTr === 'tr_snow_coat') D = Math.floor((D * 3) / 2);
  let P = move.power ?? 0;
  for (const e of move.effects) if (e.kind === 'powerIfTargetStatus' && d.inst.status === e.status) P *= e.mult;
  if (aTr === 'tr_small_strikes' && (move.power ?? 0) <= 60) P = Math.floor((P * 3) / 2);
  if (aTr === 'tr_reckless' && move.effects.some((e) => e.kind === 'recoil')) P = Math.floor((P * 6) / 5);
  const L = a.inst.level;
  let x = Math.floor(Math.floor(((Math.floor((2 * L) / 5) + 2) * P * A) / D) / 50) + 2;
  // 1 weather
  const w = s.weather;
  const t = move.type;
  if (w === 'rain') {
    if (t === 'water') x = Math.floor((x * 3) / 2);
    else if (t === 'fire') x = Math.floor(x / 2);
  } else if (w === 'sunlight') {
    if (t === 'fire') x = Math.floor((x * 3) / 2);
    else if (t === 'water') x = Math.floor(x / 2);
  } else if (w === 'snow') {
    if (t === 'frost') x = Math.floor((x * 3) / 2);
  } else if (w === 'fog') {
    if (t === 'shade') x = Math.floor((x * 3) / 2);
    else if (t === 'lumen') x = Math.floor(x / 2);
  }
  const attuned = t !== 'none' && s.attunedType != null && t === s.attunedType;
  // 3 crit
  if (opts.crit) x = Math.floor((x * 3) / 2);
  // 4 random
  x = Math.floor((x * opts.random) / 100);
  // 5 STAB
  if (t !== 'none' && aTypes.includes(t as TypeId)) x = aTr === 'tr_adaptive' ? x * 2 : Math.floor((x * 3) / 2);
  // 5b Resonance / attunement (DECISIONS D3): ×11/10, or ×6/5 with tr_resonant
  if (attuned) x = aTr === 'tr_resonant' ? Math.floor((x * 6) / 5) : Math.floor((x * 11) / 10);
  // 6 effectiveness (quarters)
  const eff = effectiveness(c, t, dTypes);
  x = Math.floor((x * eff) / 4);
  // 7 burn / frostbite
  if (physical && a.inst.status === 'burn') x = Math.floor(x / 2);
  if (!physical && a.inst.status === 'frostbite') x = Math.floor(x / 2);
  // 8 traits
  if (aTr === 'tr_last_stand' && a.inst.hp <= Math.floor(a.stats.hp / 3) && t === aTypes[0]) x = Math.floor((x * 3) / 2);
  if (a.vol.absorbedFlame && t === 'fire') x = Math.floor((x * 3) / 2);
  if (dTr === 'tr_thick_fur' && (t === 'fire' || t === 'frost')) x = Math.floor(x / 2);
  // 9 minimum
  if (eff === 0) return { dmg: 0, eff, attuned };
  if (x < 1) x = 1;
  return { dmg: x, eff, attuned };
}

// ---------- public turn resolution ----------
export function resolveTurn(c: Content, s0: BattleState, playerAction: Action, aiAction: Action): { state: BattleState; events: BattleEvent[] } {
  if (s0.outcome) throw new Error('battle already over');
  if (s0.needPlayerReplace) throw new Error('player must replace fainted creature first');
  const s = structuredClone(s0);
  const ctx = new Ctx(c, s);
  ctx.push({ t: 'turnStart', turn: s.turn });

  // Phase A: run
  if (playerAction.kind === 'run') {
    if (s.kind === 'trainer') {
      ctx.push({ t: 'message', text: "There's no retreating from a Tuner's challenge!" });
    } else {
      s.runAttempts += 1;
      const ps = effSpe(c, s, act(s, 'player'));
      const fs = effSpe(c, s, act(s, 'foe'));
      let ok = ps >= fs;
      if (!ok) {
        const chance = Math.max(30, Math.min(100, Math.floor((100 * ps) / Math.max(1, fs)) - 10 + 20 * (s.runAttempts - 1)));
        ok = ctx.rng.chance(chance);
      }
      ctx.push({ t: 'fleeAttempt', success: ok });
      if (ok) {
        s.outcome = 'fled';
        ctx.push({ t: 'battleEnd', outcome: 'fled' });
        ctx.finish();
        return { state: s, events: ctx.events };
      }
    }
  }

  // Phase B: switches (player, then AI)
  if (playerAction.kind === 'switch') ctx.switchTo('player', playerAction.to);
  if (aiAction.kind === 'switch') {
    ctx.switchTo('foe', aiAction.to);
    s.aiSwitches += 1;
    s.aiSwitchedLastTurn = true;
  } else s.aiSwitchedLastTurn = false;

  // Phase C: items / capture
  if (playerAction.kind === 'item') useItem(ctx, 'player', playerAction.item, playerAction.target, playerAction.moveSlot);
  if (playerAction.kind === 'capture') {
    const done = attemptCapture(ctx, playerAction.item);
    if (done) {
      ctx.finish();
      return { state: s, events: ctx.events };
    }
  }
  if (aiAction.kind === 'item') {
    useItem(ctx, 'foe', aiAction.item, aiAction.target);
    s.aiItemUsed = true;
    const idx = s.aiItems.indexOf(aiAction.item);
    if (idx >= 0) s.aiItems.splice(idx, 1);
  }

  // Ordering
  type Actor = { sd: SideId; slot: number; move: MoveDef; pri: number; spe: number };
  const actors: Actor[] = [];
  const add = (sd: SideId, a: Action) => {
    if (a.kind !== 'move') return;
    const cb = act(s, sd);
    if (cb.inst.hp <= 0) return;
    let slot = a.slot;
    if (usableSlots(cb).length === 0) slot = -1;
    const mv = moveOf(c, cb, slot);
    actors.push({ sd, slot, move: mv, pri: mv.priority, spe: effSpe(c, s, cb) });
  };
  add('player', playerAction);
  add('foe', aiAction);
  if (actors.length === 2) {
    const [x, y] = actors;
    let playerFirst: boolean;
    if (x.pri !== y.pri) playerFirst = (x.sd === 'player') === x.pri > y.pri;
    else if (x.spe !== y.spe) playerFirst = (x.sd === 'player') === x.spe > y.spe;
    else playerFirst = ctx.rng.int(0, 1) === 0;
    actors.sort((a) => ((a.sd === 'player') === playerFirst ? -1 : 1));
  }
  const acted: Record<SideId, boolean> = { player: false, foe: false };
  for (const ac of actors) {
    const cb = act(s, ac.sd);
    if (cb.inst.hp <= 0) continue;
    // A creature switched in this turn does not get to use the move chosen for the previous one
    executeMove(ctx, ac.sd, ac.slot, acted);
    acted[ac.sd] = true;
    if (bothSidesCheck(ctx)) break;
  }
  // Reset bulwark chain for sides that did something else
  for (const sd of ['player', 'foe'] as SideId[]) {
    const cb = act(s, sd);
    const a = sd === 'player' ? playerAction : aiAction;
    const usedBulwark = a.kind === 'move' && a.slot >= 0 && cb.inst.moves[a.slot]?.id === 'm045';
    if (!usedBulwark) cb.bulwarkChain = 0;
    cb.usedBulwarkLastTurn = usedBulwark;
  }

  endOfTurn(ctx);
  resolveFaints(ctx);
  ctx.finish();
  return { state: s, events: ctx.events };
}

function bothSidesCheck(_ctx: Ctx): boolean {
  return false;
}

function executeMove(ctx: Ctx, sd: SideId, slot: number, acted: Record<SideId, boolean>) {
  const { c, s, rng } = ctx;
  const user = act(s, sd);
  const foeSd = other(sd);
  const name = nm(c, user);
  // action checks
  if (user.vol.flinch) {
    ctx.push({ t: 'cantAct', side: sd, name, reason: 'flinch' });
    return;
  }
  if (user.inst.status === 'sleep') {
    const cnt = user.inst.sleepCounter ?? 0;
    if (cnt <= 0) {
      user.inst.status = null;
      user.inst.sleepCounter = undefined;
      ctx.push({ t: 'wokeUp', side: sd, name });
    } else {
      user.inst.sleepCounter = Math.max(0, cnt - (traitOf(c, user) === 'tr_early_riser' ? 2 : 1));
      ctx.push({ t: 'cantAct', side: sd, name, reason: 'sleep' });
      return;
    }
  }
  if (user.inst.status === 'paralysis' && rng.chance(25)) {
    ctx.push({ t: 'cantAct', side: sd, name, reason: 'paralysis' });
    return;
  }
  if (user.vol.dizzy) {
    user.vol.dizzy -= 1;
    if (user.vol.dizzy <= 0) {
      user.vol.dizzy = undefined;
      ctx.push({ t: 'dizzyEnd', side: sd, name });
    } else if (rng.chance(33)) {
      ctx.push({ t: 'cantAct', side: sd, name, reason: 'dizzy' });
      const L = user.inst.level;
      const A = stageMult(user.stats.atk, user.stages.atk);
      const D = stageMult(user.stats.def, user.stages.def);
      let x = Math.floor(Math.floor(((Math.floor((2 * L) / 5) + 2) * 40 * A) / Math.max(1, D)) / 50) + 2;
      x = Math.max(1, Math.floor((x * rng.int(85, 100)) / 100));
      ctx.damage(sd, x, { source: 'self' });
      return;
    }
  }
  // move choice
  if (slot >= 0 && user.inst.moves[slot]?.charges <= 0) slot = -1;
  if (usableSlots(user).length === 0) slot = -1;
  const move = slot < 0 ? c.moves[FALLBACK_MOVE] : c.moves[user.inst.moves[slot].id];
  if (slot >= 0) user.inst.moves[slot].charges -= 1;
  if (sd === 'player' && !s.revealedPlayerMoves.includes(move.id)) s.revealedPlayerMoves.push(move.id);
  ctx.push({ t: 'moveUsed', side: sd, move: move.id, name, moveName: move.name, moveType: move.type, anim: move.anim });

  // self / field targeted moves
  if (move.target === 'self' || move.target === 'field') {
    applyNonDamaging(ctx, sd, move);
    return;
  }
  const target = act(s, foeSd);
  if (target.inst.hp <= 0) {
    ctx.push({ t: 'noTarget', side: sd });
    return;
  }
  // shield
  if (target.vol.shielded) {
    ctx.push({ t: 'blocked', side: foeSd, name: nm(c, target) });
    return;
  }
  // absorbing traits
  const tTr = traitOf(c, target);
  const absorb =
    (tTr === 'tr_charge_sink' && move.type === 'electric') ||
    (tTr === 'tr_tide_sink' && move.type === 'water') ||
    (tTr === 'tr_flame_sink' && move.type === 'fire');
  if (absorb) {
    ctx.push({ t: 'traitTriggered', side: foeSd, trait: tTr, name: nm(c, target) });
    if (tTr === 'tr_flame_sink') target.vol.absorbedFlame = true;
    else if (move.category !== 'status') ctx.heal(foeSd, Math.floor(target.stats.hp / 4), 'trait');
    return;
  }
  // accuracy
  let acc = move.accuracy;
  let neverMiss = acc == null;
  for (const e of move.effects) {
    if (e.kind === 'neverMissIn' && e.weather === s.weather) neverMiss = true;
    if (e.kind === 'accIn' && e.weather === s.weather) acc = e.accuracy;
  }
  if (!neverMiss && acc != null) {
    const sStage = Math.max(-6, Math.min(6, user.stages.acc - target.stages.eva));
    let hit = sStage >= 0 ? Math.floor((acc * (3 + sStage)) / 3) : Math.floor((acc * 3) / (3 - sStage));
    if (s.weather === 'fog' && move.type !== 'shade') hit = Math.floor((hit * 9) / 10);
    if (s.weather === 'fog' && tTr === 'tr_fog_veil') hit = Math.floor((hit * 4) / 5);
    if (hit < 100 && rng.int(1, 100) > hit) {
      ctx.push({ t: 'moveMissed', side: sd, name });
      return;
    }
  }
  if (move.category === 'status') {
    applyStatusMove(ctx, sd, move);
    return;
  }
  // damaging
  const hits = move.effects.find((e) => e.kind === 'hits');
  const nHits = hits && hits.kind === 'hits' ? hits.count : 1;
  let critStage = 0;
  for (const e of move.effects) if (e.kind === 'critStage') critStage += e.delta;
  if (traitOf(c, user) === 'tr_keen_focus') critStage += 1;
  let total = 0;
  let lastEff = 4;
  for (let h = 0; h < nHits; h++) {
    if (target.inst.hp <= 0) break;
    let crit = false;
    if (critStage >= 3) crit = true;
    else crit = rng.int(1, critStage === 0 ? 24 : critStage === 1 ? 8 : 2) === 1;
    const random = rng.int(85, 100);
    const r = computeDamage(c, s, user, target, move, { crit, random });
    lastEff = r.eff;
    if (r.eff === 0) {
      ctx.push({ t: 'damage', side: foeSd, amount: 0, hpBefore: target.inst.hp, hpAfter: target.inst.hp, maxHp: target.stats.hp, eff: 0, crit: false, attuned: r.attuned, source: 'move' });
      return;
    }
    let dmg = r.dmg;
    if (tTr === 'tr_sturdy_core' && target.inst.hp === target.stats.hp && dmg >= target.inst.hp) {
      dmg = target.inst.hp - 1;
      ctx.push({ t: 'traitTriggered', side: foeSd, trait: 'tr_sturdy_core', name: nm(c, target) });
    }
    total += ctx.damage(foeSd, dmg, { eff: r.eff, crit, attuned: r.attuned, source: 'move' });
    // contact traits
    if (move.category === 'physical' && user.inst.hp > 0) contactTraits(ctx, sd, foeSd);
  }
  // secondary effects (only if damage > 0 and target alive where relevant)
  for (const e of move.effects) {
    if (e.kind === 'status') {
      if (target.inst.hp > 0 && total > 0 && rng.chance(e.chance) && ctx.canReceiveStatus(foeSd, e.status).ok) ctx.applyStatus(foeSd, e.status);
    } else if (e.kind === 'stat') {
      if (rng.chance(e.chance)) {
        if (e.target === 'foe' && target.inst.hp > 0) ctx.changeStage(foeSd, e.stat, e.delta, true);
        if (e.target === 'self' && user.inst.hp > 0) ctx.changeStage(sd, e.stat, e.delta, false);
      }
    } else if (e.kind === 'flinch') {
      if (rng.chance(e.chance) && target.inst.hp > 0 && !acted[foeSd]) target.vol.flinch = true;
    } else if (e.kind === 'dizzy') {
      if (rng.chance(e.chance) && target.inst.hp > 0 && !target.vol.dizzy) {
        target.vol.dizzy = rng.int(2, 4);
        ctx.push({ t: 'dizzyApplied', side: foeSd, name: nm(c, target) });
      }
    }
  }
  // recoil / drain
  for (const e of move.effects) {
    if (e.kind === 'recoil' && total > 0 && user.inst.hp > 0) ctx.damage(sd, Math.max(1, Math.floor((total * e.num) / e.den)), { source: 'recoil' });
    if (e.kind === 'recoilMaxHp' && user.inst.hp > 0) ctx.damage(sd, Math.max(1, Math.floor((user.stats.hp * e.num) / e.den)), { source: 'recoil' });
    if (e.kind === 'drain' && total > 0) ctx.heal(sd, Math.max(1, Math.floor((total * e.num) / e.den)), 'drain');
  }
  void lastEff;
}

function contactTraits(ctx: Ctx, attacker: SideId, defender: SideId) {
  const { c, s, rng } = ctx;
  const d = act(s, defender);
  const tr = traitOf(c, d);
  const map: Record<string, MajorStatus> = { tr_static_hide: 'paralysis', tr_ember_hide: 'burn', tr_toxic_skin: 'poison', tr_frost_hide: 'frostbite' };
  if (map[tr]) {
    if (rng.chance(30) && ctx.canReceiveStatus(attacker, map[tr]).ok) {
      ctx.push({ t: 'traitTriggered', side: defender, trait: tr, name: nm(c, d) });
      ctx.applyStatus(attacker, map[tr]);
    }
  } else if (tr === 'tr_thorned') {
    const a = act(s, attacker);
    ctx.push({ t: 'traitTriggered', side: defender, trait: tr, name: nm(c, d) });
    ctx.damage(attacker, Math.max(1, Math.floor(a.stats.hp / 8)), { source: 'trait' });
  }
}

function applyStatusMove(ctx: Ctx, sd: SideId, move: MoveDef) {
  const { c, s, rng } = ctx;
  const foeSd = other(sd);
  const target = act(s, foeSd);
  const user = act(s, sd);
  const eff = effectiveness(c, move.type, typesOf(c, target));
  let any = false;
  for (const e of move.effects) {
    if (e.kind === 'status') {
      if (eff === 0) {
        ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'no effect' });
        return;
      }
      const chk = ctx.canReceiveStatus(foeSd, e.status);
      if (!chk.ok) {
        ctx.push({ t: 'statusBlocked', side: foeSd, name: nm(c, target), reason: chk.reason ?? '' });
        continue;
      }
      ctx.applyStatus(foeSd, e.status);
      any = true;
    } else if (e.kind === 'stat') {
      const tgt = e.target === 'foe' ? foeSd : sd;
      if (ctx.changeStage(tgt, e.stat, e.delta, e.target === 'foe')) any = true;
    } else if (e.kind === 'dizzy') {
      if (target.vol.dizzy) ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'already dizzy' });
      else {
        target.vol.dizzy = rng.int(2, 4);
        ctx.push({ t: 'dizzyApplied', side: foeSd, name: nm(c, target) });
        any = true;
      }
    } else if (e.kind === 'sap') {
      if (target.vol.sapped || typesOf(c, target).includes('verdant')) ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'sap failed' });
      else {
        target.vol.sapped = true;
        ctx.push({ t: 'message', text: `${nm(c, target)} is tangled in sapping tendrils!` });
        any = true;
      }
    }
  }
  void any;
}

function applyNonDamaging(ctx: Ctx, sd: SideId, move: MoveDef) {
  const { c, s, rng } = ctx;
  const user = act(s, sd);
  for (const e of move.effects) {
    if (e.kind === 'stat') ctx.changeStage(sd, e.stat, e.delta, false);
    else if (e.kind === 'heal') {
      if (user.inst.hp >= user.stats.hp) {
        ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'already full' });
        continue;
      }
      const f = e.weather[s.weather] ?? [e.num, e.den];
      ctx.heal(sd, Math.floor((user.stats.hp * f[0]) / f[1]), 'move');
    } else if (e.kind === 'weather') {
      if (s.weather === e.weather) {
        ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'weather active' });
        continue;
      }
      s.weather = e.weather;
      s.weatherTurns = 5;
      ctx.push({ t: 'weatherStart', weather: e.weather, byMove: true });
    } else if (e.kind === 'clearAll') {
      s.weather = 'clear';
      s.weatherTurns = 5;
      ctx.push({ t: 'weatherStart', weather: 'clear', byMove: true });
      for (const x of ['player', 'foe'] as SideId[]) act(s, x).stages = freshStages();
      ctx.push({ t: 'message', text: 'A clearing wind resets everything!' });
    } else if (e.kind === 'shield') {
      const n = user.bulwarkChain;
      let ok = true;
      if (n > 0) ok = rng.int(1, Math.pow(3, n)) === 1;
      if (ok) {
        user.vol.shielded = true;
        user.bulwarkChain = n + 1;
        ctx.push({ t: 'message', text: `${nm(c, user)} braces behind a bulwark!` });
      } else {
        user.bulwarkChain = 0;
        ctx.push({ t: 'moveFailed', side: sd, name: nm(c, user), reason: 'bulwark failed' });
      }
    } else if (e.kind === 'cleanse') {
      if (user.inst.status) {
        ctx.push({ t: 'statusCured', side: sd, status: user.inst.status, name: nm(c, user) });
        user.inst.status = null;
        user.inst.sleepCounter = undefined;
      }
      user.vol.dizzy = undefined;
      user.vol.sapped = undefined;
      for (const k of STAGES) if (user.stages[k] < 0) user.stages[k] = 0;
    }
  }
}

function endOfTurn(ctx: Ctx) {
  const { c, s, rng } = ctx;
  // order: faster first
  const p = act(s, 'player');
  const f = act(s, 'foe');
  const ps = effSpe(c, s, p);
  const fs = effSpe(c, s, f);
  const order: SideId[] = ps > fs ? ['player', 'foe'] : fs > ps ? ['foe', 'player'] : rng.int(0, 1) === 0 ? ['player', 'foe'] : ['foe', 'player'];
  // 1 weather
  if (s.weatherTurns != null) {
    s.weatherTurns -= 1;
    if (s.weatherTurns <= 0) {
      const ended = s.weather;
      s.weather = s.ambientWeather;
      s.weatherTurns = null;
      ctx.push({ t: 'weatherEnd', weather: ended, revertTo: s.ambientWeather });
    }
  }
  // 3 status damage
  for (const sd of order) {
    const cb = act(s, sd);
    if (cb.inst.hp <= 0) continue;
    const st = cb.inst.status;
    if (st === 'burn' || st === 'frostbite') ctx.damage(sd, Math.max(1, Math.floor(cb.stats.hp / 16)), { source: 'status' });
    else if (st === 'poison') ctx.damage(sd, Math.max(1, Math.floor(cb.stats.hp / 8)), { source: 'status' });
  }
  // 4 sapped
  for (const sd of order) {
    const cb = act(s, sd);
    if (cb.inst.hp <= 0 || !cb.vol.sapped) continue;
    const amt = ctx.damage(sd, Math.max(1, Math.floor(cb.stats.hp / 8)), { source: 'sap' });
    if (act(s, other(sd)).inst.hp > 0) ctx.heal(other(sd), amt, 'sap');
  }
  // 5 traits
  for (const sd of order) {
    const cb = act(s, sd);
    if (cb.inst.hp <= 0) continue;
    const tr = traitOf(c, cb);
    if (tr === 'tr_regrowth' && cb.inst.hp < cb.stats.hp) {
      ctx.push({ t: 'traitTriggered', side: sd, trait: tr, name: nm(c, cb) });
      ctx.heal(sd, Math.max(1, Math.floor(cb.stats.hp / 16)), 'trait');
    }
    if (tr === 'tr_shed_status' && cb.inst.status && rng.chance(30)) {
      ctx.push({ t: 'traitTriggered', side: sd, trait: tr, name: nm(c, cb) });
      ctx.push({ t: 'statusCured', side: sd, status: cb.inst.status, name: nm(c, cb) });
      cb.inst.status = null;
      cb.inst.sleepCounter = undefined;
    }
  }
  // 6 weariness
  if (s.turn >= 50) {
    ctx.push({ t: 'weary' });
    for (const sd of order) {
      const cb = act(s, sd);
      if (cb.inst.hp <= 0) continue;
      ctx.damage(sd, Math.max(1, Math.floor((cb.stats.hp * (s.turn - 49)) / 16)), { source: 'weariness' });
    }
  }
  // 7 clear flinch/shield
  for (const sd of ['player', 'foe'] as SideId[]) {
    const cb = act(s, sd);
    cb.vol.flinch = undefined;
    cb.vol.shielded = undefined;
  }
  s.turn += 1;
}

function awardXp(ctx: Ctx, fainted: Combatant) {
  const { c, s } = ctx;
  const sp = c.species[fainted.inst.species];
  const Lf = fainted.inst.level;
  const Y = sp.xpYield;
  const tn = s.kind === 'trainer' ? 3 : 1;
  const td = s.kind === 'trainer' ? 2 : 1;
  const parts = s.participants[fainted.inst.uid] ?? [];
  for (const cb of s.player.team) {
    if (cb.inst.hp <= 0) continue;
    const Lp = cb.inst.level;
    let sn = 2 * Lf + 10;
    let sdn = Lf + Lp + 10;
    if (sn * 2 < sdn) { sn = 1; sdn = 2; }
    else if (sn * 2 > sdn * 3) { sn = 3; sdn = 2; }
    let xp = Math.max(1, Math.floor((Math.floor((Y * Lf) / 7) * tn * sn) / (td * sdn)));
    if (!parts.includes(cb.inst.uid)) xp = Math.floor(xp / 2);
    if (xp <= 0 || cb.inst.level >= 60) continue;
    ctx.push({ t: 'xpGain', uid: cb.inst.uid, name: nm(c, cb), amount: xp });
    const oldLevel = cb.inst.level;
    const oldMax = cb.stats.hp;
    const res = addXp(c, cb.inst, xp);
    cb.inst = res.inst;
    cb.stats = computeStats(c, cb.inst);
    void oldMax;
    for (const l of res.levels) ctx.push({ t: 'levelUp', uid: cb.inst.uid, name: nm(c, cb), level: l });
    for (const m of res.learned) ctx.push({ t: 'moveLearned', uid: cb.inst.uid, name: nm(c, cb), move: m, moveName: c.moves[m].name });
    for (const m of res.pendingLearn) {
      s.pendingLearn.push({ uid: cb.inst.uid, move: m });
      ctx.push({ t: 'moveLearnPending', uid: cb.inst.uid, name: nm(c, cb), move: m, moveName: c.moves[m].name });
    }
    if (res.evolveTo && cb.inst.level > oldLevel && !s.pendingEvolutions.some((e) => e.uid === cb.inst.uid)) {
      s.pendingEvolutions.push({ uid: cb.inst.uid, to: res.evolveTo });
      ctx.push({ t: 'evolutionQueued', uid: cb.inst.uid, to: res.evolveTo });
    }
  }
}

/** Faint handling after a turn: XP, AI replacement, player replacement prompt, battle end. */
function resolveFaints(ctx: Ctx) {
  const { c, s } = ctx;
  for (const sd of ['foe', 'player'] as SideId[]) {
    const cb = act(s, sd);
    if (cb.inst.hp <= 0 && !cb.faintAnnounced) {
      cb.faintAnnounced = true;
      ctx.push({ t: 'faint', side: sd, index: side(s, sd).active, name: nm(c, cb) });
      if (sd === 'foe') awardXp(ctx, cb);
    }
  }
  const pAlive = aliveCount(s.player);
  const fAlive = aliveCount(s.foe);
  if (fAlive === 0) {
    s.outcome = 'win';
    ctx.push({ t: 'battleEnd', outcome: 'win' });
    return;
  }
  if (pAlive === 0) {
    s.outcome = 'loss';
    ctx.push({ t: 'battleEnd', outcome: 'loss' });
    return;
  }
  if (act(s, 'foe').inst.hp <= 0) {
    const next = aiReplacement(c, s);
    ctx.switchInAfterFaint('foe', next);
  }
  if (act(s, 'player').inst.hp <= 0) {
    s.needPlayerReplace = true;
    ctx.push({ t: 'needReplace', side: 'player' });
  }
}

/** AI replacement after faint: normal = next slot; hard = best matchup. */
export function aiReplacement(c: Content, s: BattleState): number {
  const alive = s.foe.team.map((m, i) => (m.inst.hp > 0 ? i : -1)).filter((i) => i >= 0);
  if (s.ai !== 'hard') return alive.find((i) => i > s.foe.active) ?? alive[0];
  let best = alive[0];
  let bestScore = -Infinity;
  for (const i of alive) {
    const sc = matchup(c, s, s.foe.team[i]);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return best;
}

export function matchup(c: Content, s: BattleState, cb: Combatant): number {
  const p = act(s, 'player');
  const pTypes = typesOf(c, p);
  let off = 0;
  for (const m of cb.inst.moves) {
    const mv = c.moves[m.id];
    if (mv.category === 'status') continue;
    off = Math.max(off, effectiveness(c, mv.type, pTypes));
  }
  const revealed = s.revealedPlayerMoves.map((id) => c.moves[id]).filter((m) => m.category !== 'status');
  const threatTypes: MoveTypeId[] = revealed.length ? revealed.map((m) => m.type) : pTypes;
  let def = 0;
  for (const t of threatTypes) def = Math.max(def, effectiveness(c, t, typesOf(c, cb)));
  return off - def;
}

/** Player replaces a fainted active creature (or flees from a wild battle). */
export function applyReplace(c: Content, s0: BattleState, choice: { kind: 'switch'; to: number } | { kind: 'flee' }): { state: BattleState; events: BattleEvent[] } {
  const s = structuredClone(s0);
  const ctx = new Ctx(c, s);
  s.needPlayerReplace = false;
  if (choice.kind === 'flee') {
    if (s.kind !== 'wild') throw new Error('cannot flee trainer battle');
    ctx.push({ t: 'fleeAttempt', success: true });
    s.outcome = 'fled';
    ctx.push({ t: 'battleEnd', outcome: 'fled' });
  } else {
    if (s.player.team[choice.to].inst.hp <= 0) throw new Error('cannot send out a fainted creature');
    ctx.switchInAfterFaint('player', choice.to);
  }
  ctx.finish();
  return { state: s, events: ctx.events };
}

// ---------- items ----------
function useItem(ctx: Ctx, sd: SideId, itemId: string, target: number, moveSlot?: number) {
  const { c, s } = ctx;
  const item = c.items[itemId];
  const team = side(s, sd).team;
  const cb = team[target];
  if (!item || !cb) return;
  if (sd === 'player') s.itemsUsed[itemId] = (s.itemsUsed[itemId] ?? 0) + 1;
  ctx.push({ t: 'itemUsed', side: sd, item: itemId, target, targetName: nm(c, cb) });
  const isActive = side(s, sd).active === target;
  const p = item.params as Record<string, any>;
  const healAt = (amount: number) => {
    const before = cb.inst.hp;
    cb.inst.hp = Math.min(cb.stats.hp, cb.inst.hp + amount);
    if (isActive) ctx.push({ t: 'heal', side: sd, amount: cb.inst.hp - before, hpBefore: before, hpAfter: cb.inst.hp, maxHp: cb.stats.hp, source: 'item' });
    else ctx.push({ t: 'message', text: `${nm(c, cb)} recovered ${cb.inst.hp - before} HP.` });
  };
  switch (item.kind) {
    case 'heal':
      if (cb.inst.hp > 0) healAt(p.amount === 'full' ? cb.stats.hp : p.amount);
      break;
    case 'cure': {
      const cures: string[] = p.cures;
      if (cb.inst.status && cures.includes(cb.inst.status)) {
        ctx.push({ t: 'statusCured', side: sd, status: cb.inst.status, name: nm(c, cb) });
        cb.inst.status = null;
        cb.inst.sleepCounter = undefined;
      }
      if (cures.includes('dizzy') && isActive && cb.vol.dizzy) {
        cb.vol.dizzy = undefined;
        ctx.push({ t: 'statusCured', side: sd, status: 'dizzy', name: nm(c, cb) });
      }
      break;
    }
    case 'revive':
      if (cb.inst.hp <= 0) {
        cb.inst.hp = p.full ? cb.stats.hp : Math.floor(cb.stats.hp / 2);
        cb.inst.status = null;
        cb.faintAnnounced = false;
        ctx.push({ t: 'message', text: `${nm(c, cb)} is back on its feet!` });
      }
      break;
    case 'charge':
      if (p.all) cb.inst.moves.forEach((m) => (m.charges = c.moves[m.id].charges ?? 99));
      else if (moveSlot != null && cb.inst.moves[moveSlot]) {
        const m = cb.inst.moves[moveSlot];
        m.charges = Math.min(c.moves[m.id].charges ?? 99, m.charges + (p.amount ?? 10));
      }
      ctx.push({ t: 'message', text: `${nm(c, cb)}'s moves feel refreshed.` });
      break;
  }
}

// ---------- capture ----------
export function captureValue(c: Content, s: BattleState, itemId: string): number {
  const target = act(s, 'foe');
  const M = target.stats.hp;
  const H = target.inst.hp;
  const C = c.species[target.inst.species].catchRate;
  const O10 = ((c.items[itemId].params as any).mult10 as number) ?? 10;
  const st = target.inst.status;
  const S10 = st === 'sleep' ? 20 : st ? 15 : 10;
  const L = target.inst.level;
  const B20 = 20 + Math.max(0, 15 - L);
  return Math.floor(((3 * M - 2 * H) * C * O10 * S10 * B20) / (3 * M * 10 * 10 * 20));
}

export function shakeThreshold(a: number): number {
  return Math.floor(65536 * Math.cbrt(a / 255));
}

function attemptCapture(ctx: Ctx, itemId: string): boolean {
  const { c, s, rng } = ctx;
  if (s.kind === 'trainer') {
    ctx.push({ t: 'captureDeflected', item: itemId });
    return false;
  }
  s.itemsUsed[itemId] = (s.itemsUsed[itemId] ?? 0) + 1;
  const target = act(s, 'foe');
  const a = captureValue(c, s, itemId);
  let shakes = 0;
  let success = false;
  if (a >= 255) {
    shakes = 3;
    success = true;
  } else {
    const th = shakeThreshold(a);
    success = true;
    for (let k = 1; k <= 3; k++) {
      if (rng.int(0, 65535) >= th) {
        success = false;
        break;
      }
      shakes = k;
    }
  }
  ctx.push({ t: 'captureAttempt', item: itemId, shakes, success, species: target.inst.species, name: nm(c, target) });
  if (success) {
    // XP as if defeated
    awardXp(ctx, target);
    const caught = structuredClone(target.inst);
    caught.caughtIn = itemId;
    s.captured = caught;
    s.capturedWith = itemId;
    s.outcome = 'captured';
    ctx.push({ t: 'battleEnd', outcome: 'captured' });
    return true;
  }
  return false;
}

/** Party snapshot after battle (HP/status/charges/levels carried back to the overworld). */
export function playerPartyAfter(s: BattleState): CreatureInstance[] {
  return s.player.team.map((cb) => {
    const i = structuredClone(cb.inst);
    return i;
  });
}

export const WEATHER_IDS: WeatherId[] = ['clear', 'rain', 'snow', 'fog', 'sunlight'];
