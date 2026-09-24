// AI decision making (design/systems.md §13). The AI reads only an information-limited view and its own
// RNG stream; it is always called BEFORE the player's command is known, so it can never read it.
import type { Content } from '../content';
import { Rng } from '../rng';
import type { MoveDef } from '../types';
import { act, computeDamage, effectiveness, effSpe, matchup, typesOf, traitOf, usableSlots } from './engine';
import type { Action, BattleState, Combatant } from './types';

/** Builds a sanitized copy of the state for the AI: the player's active creature is normalised
 * (potential 8, steady temperament) and nothing about the player's bench or pending command is present. */
function aiView(c: Content, s: BattleState): BattleState {
  const v = structuredClone(s);
  const p = act(v, 'player');
  p.inst.potential = { hp: 8, atk: 8, def: 8, spa: 8, spd: 8, spe: 8 };
  p.inst.temperament = 'tm_steady';
  // estimated stats from normalised instance
  const sp = c.species[p.inst.species];
  const core = (b: number) => Math.floor(((2 * b + 8) * p.inst.level) / 100);
  p.stats = {
    hp: p.stats.hp, // max HP is visible on the HUD
    atk: core(sp.base.atk) + 5,
    def: core(sp.base.def) + 5,
    spa: core(sp.base.spa) + 5,
    spd: core(sp.base.spd) + 5,
    spe: core(sp.base.spe) + 5,
  };
  // hide bench
  v.player.team = [p];
  v.player.active = 0;
  return v;
}

export function scoreMove(c: Content, v: BattleState, user: Combatant, target: Combatant, mv: MoveDef): number {
  if (mv.category !== 'status' && mv.target === 'foe') {
    const eff = effectiveness(c, mv.type, typesOf(c, target));
    if (eff === 0) return 0;
    const est = computeDamage(c, v, user, target, mv, { crit: false, random: 92 }).dmg;
    const pct = Math.min(100, Math.floor((100 * est) / Math.max(1, target.inst.hp)));
    let sc = Math.floor((pct * (mv.accuracy ?? 100)) / 100);
    if (est >= target.inst.hp) {
      sc += 40;
      if (mv.priority > 0) sc += 20;
    }
    const recoil = mv.effects.find((e) => e.kind === 'recoil');
    if (recoil && recoil.kind === 'recoil') {
      const r = Math.floor((Math.min(est, target.inst.hp) * recoil.num) / recoil.den);
      sc -= Math.floor((50 * r) / Math.max(1, user.inst.hp));
    }
    return Math.max(0, sc);
  }
  const hpPct = (cb: Combatant) => (100 * cb.inst.hp) / cb.stats.hp;
  let best = 0;
  for (const e of mv.effects) {
    let sc = 0;
    switch (e.kind) {
      case 'status': {
        const types = typesOf(c, target);
        const immune =
          (e.status === 'burn' && types.includes('fire')) ||
          (e.status === 'poison' && (types.includes('toxin') || types.includes('stone'))) ||
          (e.status === 'paralysis' && types.includes('electric')) ||
          (e.status === 'frostbite' && types.includes('frost'));
        sc = !target.inst.status && !immune && hpPct(target) > 40 && effectiveness(c, mv.type, types) > 0 ? 45 : 0;
        break;
      }
      case 'dizzy':
        sc = target.vol.dizzy ? 0 : 35;
        break;
      case 'sap':
        sc = target.vol.sapped || typesOf(c, target).includes('verdant') ? 0 : 35;
        break;
      case 'stat':
        if (e.target === 'self') sc = user.stages[e.stat] < 2 && hpPct(user) >= 60 ? 35 : 5;
        else sc = target.stages[e.stat] > -2 ? 30 : 0;
        break;
      case 'heal':
        sc = hpPct(user) <= 40 ? 90 : hpPct(user) <= 60 ? 40 : 0;
        break;
      case 'weather': {
        const w = e.weather;
        const types = typesOf(c, user);
        const helps =
          (w === 'rain' && types.includes('water')) ||
          (w === 'sunlight' && types.includes('fire')) ||
          (w === 'snow' && types.includes('frost')) ||
          (w === 'fog' && types.includes('shade')) ||
          (w === 'rain' && traitOf(c, user) === 'tr_rain_glide') ||
          (w === 'sunlight' && traitOf(c, user) === 'tr_sun_bask');
        sc = v.weather !== w && helps ? 35 : 0;
        break;
      }
      case 'clearAll':
        sc = Object.values(target.stages).some((x) => x > 0) ? 30 : 0;
        break;
      case 'shield':
        sc = user.usedBulwarkLastTurn ? 0 : target.inst.status || target.vol.sapped || traitOf(c, user) === 'tr_regrowth' ? 25 : 10;
        break;
      case 'cleanse':
        sc = user.inst.status || Object.values(user.stages).some((x) => x <= -2) ? 50 : 0;
        break;
    }
    best = Math.max(best, sc);
  }
  return best;
}

export function chooseAiAction(c: Content, s: BattleState): { action: Action; rngAI: BattleState['rngAI'] } {
  const rng = new Rng(s.rngAI);
  const v = aiView(c, s);
  const user = act(v, 'foe');
  const target = act(v, 'player');
  const slots = usableSlots(user);
  if (slots.length === 0) return { action: { kind: 'move', slot: -1 }, rngAI: rng.state() };
  const scores = slots.map((i) => ({ i, sc: scoreMove(c, v, user, target, c.moves[user.inst.moves[i].id]) }));
  let action: Action;
  if (s.ai === 'easy') {
    const pos = scores.filter((x) => x.sc > 0);
    const pool = pos.length ? pos : scores;
    action = { kind: 'move', slot: pool[rng.int(0, pool.length - 1)].i };
  } else {
    if (s.ai === 'hard') {
      // priority boost if likely to be KO'd before acting
      const pSpe = effSpe(c, v, target);
      const mySpe = effSpe(c, v, user);
      const threatened =
        pSpe > mySpe &&
        s.revealedPlayerMoves.some((id) => {
          const mv = c.moves[id];
          return mv.category !== 'status' && computeDamage(c, v, target, user, mv, { crit: false, random: 92 }).dmg >= user.inst.hp;
        });
      if (threatened) for (const x of scores) if (c.moves[user.inst.moves[x.i].id].priority > 0) x.sc += 30;
    }
    const max = Math.max(...scores.map((x) => x.sc));
    let pick: number;
    if (s.ai === 'normal' && rng.chance(25)) {
      const pool = scores.filter((x) => x.sc >= Math.floor((max * 60) / 100));
      pick = pool[rng.int(0, pool.length - 1)].i;
    } else {
      const top = scores.filter((x) => x.sc === max);
      pick = top[rng.int(0, top.length - 1)].i;
    }
    action = { kind: 'move', slot: pick };

    // items
    const hpPct = (100 * user.inst.hp) / user.stats.hp;
    const heal = s.aiItems.find((i) => i.startsWith('i_salve'));
    if (s.ai === 'normal' && heal && !s.aiItemUsed && hpPct <= 20 && rng.chance(50)) {
      action = { kind: 'item', item: heal, target: s.foe.active };
    }
    if (s.ai === 'hard') {
      const koAvailable = scores.some((x) => x.sc >= 100);
      if (heal && hpPct <= 25 && !koAvailable) action = { kind: 'item', item: heal, target: s.foe.active };
      else {
        const aliveFoes = s.foe.team.filter((m) => m.inst.hp > 0).length;
        const cure = s.aiItems.find((i) => i === 'i_cure_all');
        if (cure && aliveFoes === 1 && user.inst.status && ['sleep', 'paralysis', 'frostbite'].includes(user.inst.status))
          action = { kind: 'item', item: cure, target: s.foe.active };
      }
      // voluntary switch
      if (action.kind === 'move' && max < 25 && hpPct > 25 && s.aiSwitches < 2 && !s.aiSwitchedLastTurn) {
        const cur = matchup(c, s, act(s, 'foe'));
        let bestI = -1;
        let bestM = cur + 3;
        s.foe.team.forEach((m, i) => {
          if (i === s.foe.active || m.inst.hp <= 0) return;
          const mm = matchup(c, s, m);
          if (mm > bestM) {
            bestM = mm;
            bestI = i;
          }
        });
        if (bestI >= 0) action = { kind: 'switch', to: bestI };
      }
    }
  }
  return { action, rngAI: rng.state() };
}
