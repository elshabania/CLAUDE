// Battle controller: owns the pure BattleState, asks the AI (before the player's command is read),
// resolves turns, and converts engine events into a timed presentation queue for UI/3D.
import { create } from 'zustand';
import { CONTENT } from '../data/index';
import { TRAINERS } from '../data/registry';
import { createBattle, openingEvents, resolveTurn, applyReplace, act, playerPartyAfter, usableSlots, captureValue } from '../sim/battle/engine';
import { chooseAiAction } from '../sim/battle/ai';
import type { Action, BattleEvent, BattleState, SideId } from '../sim/battle/types';
import { buildBattleSetup, useGame, type BattleRequest } from '../state/game';
import { createInstance } from '../sim/progression';
import { resolveRivalSpecies } from '../sim/world';
import { Rng, hashString } from '../sim/rng';
import { computeStats } from '../sim/stats';
import type { MajorStatus, TypeId } from '../sim/types';
import { sfx } from '../audio/sfxBus';
import { STATUS_NAMES, effText } from './text';

export type Phase = 'intro' | 'command' | 'moves' | 'bag' | 'swap' | 'animating' | 'replace' | 'confirmCapture' | 'release' | 'end';

export interface Shown {
  species: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  status: MajorStatus | null;
  visible: boolean;
  index: number;
}

/** One presentation cue (consumed by BattleScene for 3D and by the UI for text/HP). */
export interface Cue {
  kind: 'text' | 'anim' | 'hp' | 'status' | 'sendOut' | 'recall' | 'faint' | 'vfx' | 'capture' | 'weather' | 'wait' | 'phase';
  side?: SideId;
  text?: string;
  anim?: 'attack' | 'special' | 'status' | 'hit' | 'victory' | 'faint' | 'capture' | 'breakout';
  vfx?: string;
  moveType?: string;
  hp?: number;
  status?: MajorStatus | null;
  species?: string;
  index?: number;
  rings?: number;
  success?: boolean;
  item?: string;
  dur: number;
  eff?: number;
  crit?: boolean;
}

interface BattleUIState {
  req: BattleRequest | null;
  state: BattleState | null;
  phase: Phase;
  queue: Cue[];
  current: Cue | null;
  cueT: number;
  message: string;
  shown: Record<SideId, Shown | null>;
  trainerName: string | null;
  phaseIndex: number;
  captureItem: string | null;
  seq: number; // increments on every cue so 3D can react
  begin: (req: BattleRequest) => void;
  command: (a: Action) => void;
  replace: (index: number | 'flee') => void;
  confirmCapture: (yes: boolean) => void;
  chooseRelease: (uid: string | 'new') => void;
  update: (dt: number) => void;
  setPhase: (p: Phase) => void;
  finish: () => void;
}

const SPEED = () => (useGame.getState().save ? 1 : 1);

function shownFrom(s: BattleState, side: SideId): Shown {
  const cb = act(s, side);
  const sp = CONTENT.species[cb.inst.species];
  return { species: cb.inst.species, name: cb.inst.nickname || sp.name, level: cb.inst.level, hp: cb.inst.hp, maxHp: cb.stats.hp, status: cb.inst.status, visible: true, index: side === 'player' ? s.player.active : s.foe.active };
}

/** Convert engine events into presentation cues (text, animation, HP, VFX) with durations in seconds. */
export function eventsToCues(events: BattleEvent[], s: BattleState): Cue[] {
  const cues: Cue[] = [];
  const own = (side: SideId, name: string) => (side === 'foe' ? (s.kind === 'wild' ? `The wild ${name}` : `The foe's ${name}`) : name);
  let lastMoveType = 'none';
  let lastAnim = 'melee_lunge';
  for (const e of events) {
    switch (e.t) {
      case 'turnStart':
        break;
      case 'sendOut':
        cues.push({ kind: 'sendOut', side: e.side, species: e.species, index: e.index, dur: 0.9, text: e.side === 'player' ? `Go on, ${e.name}!` : s.kind === 'wild' ? `A wild ${e.name} rustles out!` : `${e.name} steps onto the stage!` });
        break;
      case 'recall':
        cues.push({ kind: 'recall', side: e.side, text: e.side === 'player' ? `${e.name}, come back!` : `${e.name} is called back.`, dur: 0.7 });
        break;
      case 'moveUsed': {
        lastMoveType = e.moveType;
        lastAnim = e.anim;
        const mv = CONTENT.moves[e.move];
        const style = mv.category === 'status' ? 'status' : ['projectile_bolt', 'projectile_arc', 'beam', 'burst_area', 'rain_down', 'weather_call', 'debuff_cloud'].includes(e.anim) ? 'special' : 'attack';
        cues.push({ kind: 'text', text: `${own(e.side, e.name)} uses ${e.moveName}!`, dur: 0.55 });
        cues.push({ kind: 'anim', side: e.side, anim: style as Cue['anim'], vfx: e.anim, moveType: e.moveType, dur: mv.category === 'status' ? 0.9 : 0.75 });
        break;
      }
      case 'moveMissed':
        cues.push({ kind: 'text', text: `${own(e.side, e.name)}'s move goes wide!`, dur: 0.9 });
        break;
      case 'moveFailed':
        cues.push({ kind: 'text', text: `But nothing happens.`, dur: 0.8 });
        break;
      case 'blocked':
        cues.push({ kind: 'vfx', side: e.side, vfx: 'shield', dur: 0.4 }, { kind: 'text', text: `${own(e.side, e.name)} braced against it!`, dur: 0.8 });
        break;
      case 'noTarget':
        cues.push({ kind: 'text', text: `There's no one there!`, dur: 0.7 });
        break;
      case 'damage':
        if (e.source === 'move') {
          if (e.eff === 0) {
            cues.push({ kind: 'text', text: 'No echo.', dur: 0.8 });
            break;
          }
          cues.push({ kind: 'vfx', side: e.side, vfx: lastAnim, moveType: lastMoveType, dur: 0.05, eff: e.eff, crit: e.crit });
          cues.push({ kind: 'anim', side: e.side, anim: 'hit', dur: 0.05 });
          cues.push({ kind: 'hp', side: e.side, hp: e.hpAfter, dur: 0.55, eff: e.eff, crit: e.crit });
          const t = [e.crit ? 'A resonant strike!' : '', effText(e.eff)].filter(Boolean).join(' ');
          if (t) cues.push({ kind: 'text', text: t, dur: 0.8 });
        } else {
          const why = e.source === 'status' ? 'is hurt by its condition' : e.source === 'recoil' ? 'is jarred by the recoil' : e.source === 'weariness' ? 'is growing weary' : e.source === 'sap' ? 'has its strength sapped' : e.source === 'self' ? 'hurt itself in its muddle' : 'is hurt';
          cues.push({ kind: 'anim', side: e.side, anim: 'hit', dur: 0.05 }, { kind: 'hp', side: e.side, hp: e.hpAfter, dur: 0.45 }, { kind: 'text', text: `${own(e.side, s[e.side].team[s[e.side].active]?.inst.nickname || '')}`.trim() ? `It ${why}!` : `It ${why}!`, dur: 0.6 });
        }
        break;
      case 'heal':
        cues.push({ kind: 'vfx', side: e.side, vfx: 'heal_glow', moveType: 'lumen', dur: 0.3 }, { kind: 'hp', side: e.side, hp: e.hpAfter, dur: 0.5 });
        break;
      case 'statusApplied':
        cues.push({ kind: 'status', side: e.side, status: e.status, dur: 0.1 }, { kind: 'text', text: `${own(e.side, e.name)} is afflicted with ${STATUS_NAMES[e.status].name}!`, dur: 1.0 });
        sfxLater(cues, 'status');
        break;
      case 'statusCured':
        cues.push({ kind: 'status', side: e.side, status: null, dur: 0.1 }, { kind: 'text', text: `${own(e.side, e.name)} shook off ${e.status === 'dizzy' ? 'its muddle' : STATUS_NAMES[e.status as MajorStatus].name}.`, dur: 0.9 });
        break;
      case 'statusBlocked':
        cues.push({ kind: 'text', text: e.reason === 'already' ? `${own(e.side, e.name)} is already afflicted.` : `${own(e.side, e.name)} is unaffected.`, dur: 0.9 });
        break;
      case 'cantAct': {
        const txt = { sleep: 'is fast asleep (Drowse).', paralysis: 'is Jolted and can\'t move!', flinch: 'flinched!', dizzy: 'is too Muddled to act!' }[e.reason];
        cues.push({ kind: 'text', text: `${own(e.side, e.name)} ${txt}`, dur: 0.9 });
        break;
      }
      case 'wokeUp':
        cues.push({ kind: 'status', side: e.side, status: null, dur: 0.1 }, { kind: 'text', text: `${own(e.side, e.name)} woke up!`, dur: 0.8 });
        break;
      case 'dizzyApplied':
        cues.push({ kind: 'text', text: `${own(e.side, e.name)} is Muddled!`, dur: 0.8 });
        break;
      case 'dizzyEnd':
        cues.push({ kind: 'text', text: `${own(e.side, e.name)} snapped out of its muddle.`, dur: 0.8 });
        break;
      case 'statChange':
        if (e.capped) cues.push({ kind: 'text', text: `${own(e.side, e.name)}'s ${statName(e.stat)} won't go any ${e.delta >= 0 ? 'higher' : 'lower'}.`, dur: 0.8 });
        else cues.push({ kind: 'vfx', side: e.side, vfx: e.delta > 0 ? 'stat_up' : 'stat_down', dur: 0.2 }, { kind: 'text', text: `${own(e.side, e.name)}'s ${statName(e.stat)} ${e.delta > 0 ? (e.delta > 1 ? 'rose sharply' : 'rose') : e.delta < -1 ? 'fell sharply' : 'fell'}!`, dur: 0.85 });
        break;
      case 'weatherStart':
        cues.push({ kind: 'weather', text: WEATHER_TEXT[e.weather] ?? '', dur: 1.0 });
        break;
      case 'weatherEnd':
        cues.push({ kind: 'weather', text: `The ${e.weather === 'sunlight' ? 'sunlight' : e.weather} fades.`, dur: 0.8 });
        break;
      case 'traitTriggered':
        cues.push({ kind: 'text', text: `${own(e.side, e.name)}'s ${traitName(e.trait)}!`, dur: 0.8 });
        break;
      case 'itemUsed':
        cues.push({ kind: 'text', text: `${e.side === 'player' ? 'You use' : 'The foe uses'} a ${CONTENT.items[e.item]?.name ?? e.item} on ${e.targetName}.`, dur: 0.9 });
        break;
      case 'captureAttempt':
        cues.push({ kind: 'capture', rings: e.shakes, success: e.success, item: e.item, dur: 1.2 + e.shakes * 0.75 + 0.8, text: e.success ? `The chime holds its chord — ${e.name} joins you!` : e.shakes === 0 ? `${e.name} broke free at once!` : `So close — ${e.name} slipped the chime!` });
        break;
      case 'captureDeflected':
        cues.push({ kind: 'text', text: `The chime rings off harmlessly — you can't bond with another Tuner's kin!`, dur: 1.2 });
        break;
      case 'fleeAttempt':
        cues.push({ kind: 'text', text: e.success ? 'You retreat safely.' : `Couldn't get away!`, dur: 0.9 });
        break;
      case 'faint':
        cues.push({ kind: 'faint', side: e.side, dur: 1.2 }, { kind: 'text', text: `${own(e.side, e.name)} went quiet.`, dur: 0.9 });
        break;
      case 'xpGain':
        cues.push({ kind: 'text', text: `${e.name} gains ${e.amount} XP.`, dur: 0.7 });
        break;
      case 'levelUp':
        cues.push({ kind: 'text', text: `${e.name} reached level ${e.level}!`, dur: 0.9 });
        break;
      case 'moveLearned':
        cues.push({ kind: 'text', text: `${e.name} learned ${e.moveName}!`, dur: 0.9 });
        break;
      case 'moveLearnPending':
        cues.push({ kind: 'text', text: `${e.name} wants to learn ${e.moveName}…`, dur: 0.9 });
        break;
      case 'evolutionQueued':
        break;
      case 'needReplace':
        break;
      case 'weary':
        cues.push({ kind: 'text', text: 'Both sides are growing weary…', dur: 0.8 });
        break;
      case 'message':
        cues.push({ kind: 'text', text: e.text, dur: 0.9 });
        break;
      case 'battleEnd':
        break;
    }
  }
  return cues;
}

function sfxLater(_c: Cue[], _id: string) {}

const WEATHER_TEXT: Record<string, string> = { rain: 'Rain begins to fall.', sunlight: 'The sunlight turns harsh.', snow: 'Snow starts to swirl.', fog: 'A thick fog rolls in.', clear: 'A clearing wind sweeps the field!' };
function statName(s: string) {
  return { atk: 'Attack', def: 'Defense', spa: 'Resonance', spd: 'Resolve', spe: 'Speed', acc: 'accuracy', eva: 'evasion' }[s] ?? s;
}
import traitsJson from '../data/content/traits.json';
const TRAIT_NAMES = Object.fromEntries((traitsJson as { id: string; name: string }[]).map((t) => [t.id, t.name]));
function traitName(id: string) {
  return TRAIT_NAMES[id] ?? id;
}

export const useBattle = create<BattleUIState>((set, get) => ({
  req: null,
  state: null,
  phase: 'intro',
  queue: [],
  current: null,
  cueT: 0,
  message: '',
  shown: { player: null, foe: null },
  trainerName: null,
  phaseIndex: 0,
  captureItem: null,
  seq: 0,

  begin: (req) => {
    const save = useGame.getState().save!;
    const setup = buildBattleSetup(req, save);
    const seed = hashString(`${req.trainerId ?? req.wildKey ?? 'w'}:${save.stats.battles}:${Math.floor(save.clockMinutes)}`);
    let st = createBattle(CONTENT, setup, seed);
    const op = openingEvents(CONTENT, st);
    st = op.state;
    const t = req.trainerId ? TRAINERS[req.trainerId] : null;
    const intro: Cue[] = [];
    if (t) intro.push({ kind: 'text', text: `${t.title} ${t.name} wants to test your troupe!`, dur: 1.2 });
    if (t?.lines?.intro) intro.push({ kind: 'text', text: `"${t.lines.intro}"`, dur: 1.4 });
    const cues = [...intro, ...eventsToCues(op.events, st)];
    set({
      req,
      state: st,
      phase: 'intro',
      queue: cues,
      current: null,
      cueT: 0,
      message: '',
      shown: { player: { ...shownFrom(st, 'player'), visible: false }, foe: { ...shownFrom(st, 'foe'), visible: false } },
      trainerName: t ? `${t.title} ${t.name}` : null,
      phaseIndex: 0,
      captureItem: null,
      seq: 0,
    });
    sfx(req.kind === 'wild' ? 'battle_start_wild' : 'battle_start_trainer');
  },

  command: (a) => {
    const st = get().state;
    if (!st || st.outcome) return;
    // Capture with full storage requires confirmation first (systems §7.4)
    if (a.kind === 'capture' && st.kind === 'wild' && useGame.getState().save && (() => { const s = useGame.getState().save!; return s.party.length >= 6 && s.storage.length >= 300; })() && get().phase !== 'confirmCapture') {
      set({ phase: 'confirmCapture', captureItem: a.item });
      return;
    }
    // AI decides FIRST from its limited view and its own RNG; the player's command is not an input.
    const ai = chooseAiAction(CONTENT, st);
    const s1 = { ...st, rngAI: ai.rngAI };
    const r = resolveTurn(CONTENT, s1, a, ai.action);
    let next = r.state;
    let cues = eventsToCues(r.events, next);
    // Odile-style phase change: trainer with phases whose current team is exhausted
    const tid = get().req?.trainerId;
    const t = tid ? TRAINERS[tid] : null;
    if (next.outcome === 'win' && t?.phases && get().phaseIndex < t.phases.length - 1) {
      const pi = get().phaseIndex + 1;
      const ph = t.phases[pi];
      const save = useGame.getState().save!;
      const rng = new Rng([hashString(t.id + pi), 3, 5, 7]);
      const team = ph.team.map((m) => createInstance(CONTENT, rng, resolveRivalSpecies(m.species, save.player.starter), m.level, { potential: t.potential, temperament: 'tm_steady' }));
      next = structuredClone(next);
      next.outcome = null;
      next.foe = { team: team.map((inst) => ({ inst, stats: computeStats(CONTENT, inst), stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 }, vol: {}, bulwarkChain: 0, usedBulwarkLastTurn: false })), active: 0 };
      next.attunedType = ph.attuned as TypeId | null;
      cues = cues.filter((c) => !(c.kind === 'text' && c.text?.includes('battleEnd')));
      cues.push({ kind: 'phase', text: 'The stones answer! The Stillbell\'s hush breaks — the ring sings again.', dur: 2.0 }, { kind: 'text', text: `Attunement restored: ${ph.attuned ?? 'none'} ×1.1`, dur: 1.2 }, { kind: 'sendOut', side: 'foe', species: team[0].species, index: 0, dur: 1.0, text: `Odile sends out ${CONTENT.species[team[0].species].name}!` });
      set({ phaseIndex: pi });
    }
    set({ state: next, queue: [...get().queue, ...cues], phase: 'animating', captureItem: null });
  },

  confirmCapture: (yes) => {
    const item = get().captureItem;
    if (!yes || !item) {
      set({ phase: 'bag', captureItem: null });
      return;
    }
    set({ phase: 'animating' });
    // flag so command() skips the confirmation this time
    const st = get().state!;
    const ai = chooseAiAction(CONTENT, st);
    const r = resolveTurn(CONTENT, { ...st, rngAI: ai.rngAI }, { kind: 'capture', item }, ai.action);
    set({ state: r.state, queue: [...get().queue, ...eventsToCues(r.events, r.state)], captureItem: null });
  },

  chooseRelease: (uid) => {
    // After a successful capture with full storage: release a creature (or the new one)
    const st = get().state!;
    if (uid === 'new') {
      set({ state: { ...st, captured: null } });
    } else set({ releaseUid: uid } as any);
    set({ phase: 'end' });
    get().finish();
  },

  replace: (index) => {
    const st = get().state;
    if (!st) return;
    const r = applyReplace(CONTENT, st, index === 'flee' ? { kind: 'flee' } : { kind: 'switch', to: index });
    set({ state: r.state, queue: [...get().queue, ...eventsToCues(r.events, r.state)], phase: 'animating' });
  },

  setPhase: (p) => set({ phase: p }),

  update: (dt) => {
    const g = get();
    if (!g.state) return;
    if (g.current) {
      const t = g.cueT + dt * SPEED();
      if (t < g.current.dur) {
        set({ cueT: t });
        return;
      }
      set({ current: null, cueT: 0 });
    }
    const q = g.queue;
    if (q.length) {
      const [c, ...rest] = q;
      const shown = { ...g.shown };
      if (c.kind === 'hp' && c.side && shown[c.side]) shown[c.side] = { ...shown[c.side]!, hp: c.hp! };
      if (c.kind === 'status' && c.side && shown[c.side]) shown[c.side] = { ...shown[c.side]!, status: c.status ?? null };
      if (c.kind === 'sendOut' && c.side) {
        const s = g.state;
        const cb = s[c.side].team[c.index ?? s[c.side].active];
        shown[c.side] = { species: cb.inst.species, name: cb.inst.nickname || CONTENT.species[cb.inst.species].name, level: cb.inst.level, hp: cb.inst.hp, maxHp: cb.stats.hp, status: cb.inst.status, visible: true, index: c.index ?? 0 };
        sfx('send_out');
      }
      if (c.kind === 'recall' && c.side && shown[c.side]) shown[c.side] = { ...shown[c.side]!, visible: false };
      if (c.kind === 'hp') sfx(c.crit ? 'hit_crit' : (c.eff ?? 4) > 4 ? 'hit_resounding' : (c.eff ?? 4) < 4 ? 'hit_muffled' : 'hit_normal');
      if (c.kind === 'faint') sfx('faint');
      if (c.kind === 'text' && c.text?.includes('reached level')) sfx('level_up');
      set({ queue: rest, current: c, cueT: 0, shown, message: c.text ?? g.message, seq: g.seq + 1 });
      return;
    }
    // queue drained: decide next phase
    if (g.phase === 'animating' || g.phase === 'intro') {
      const s = g.state;
      // sync level/max hp display to truth after XP etc.
      const shown = { player: s.player.team[s.player.active] ? { ...shownFrom(s, 'player'), visible: g.shown.player?.visible ?? true } : g.shown.player, foe: s.foe.team[s.foe.active] ? { ...shownFrom(s, 'foe'), visible: g.shown.foe?.visible ?? true } : g.shown.foe };
      if (s.outcome) {
        if (s.outcome === 'captured' && s.captured) {
          const save = useGame.getState().save!;
          if (save.party.length >= 6 && save.storage.length >= 300) {
            set({ phase: 'release', shown });
            return;
          }
        }
        set({ phase: 'end', shown });
        setTimeout(() => get().finish(), s.outcome === 'win' ? 900 : 400);
        return;
      }
      if (s.needPlayerReplace) {
        set({ phase: 'replace', shown, message: 'Choose a kin to send out.' });
        return;
      }
      const cb = act(s, 'player');
      set({ phase: 'command', shown, message: `What will ${cb.inst.nickname || CONTENT.species[cb.inst.species].name} do?` });
      if (usableSlots(cb).length === 0) set({ message: `${CONTENT.species[cb.inst.species].name} has no charges left — it will Scramble!` });
    }
  },

  finish: () => {
    const g = get();
    const s = g.state!;
    if (g.phase !== 'end' && g.phase !== 'release') return;
    const party = playerPartyAfter(s);
    useGame.getState().finishBattle({
      outcome: s.outcome ?? 'fled',
      party,
      captured: s.captured,
      itemsUsed: s.itemsUsed,
      pendingEvolutions: s.pendingEvolutions,
      pendingLearn: s.pendingLearn,
      releaseUid: (g as any).releaseUid,
    });
    set({ state: null, req: null, queue: [], current: null, phase: 'intro' });
  },
}));

export { captureValue };
