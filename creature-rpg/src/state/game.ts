// Central game store: app mode machine, committed save, dialogue runtime, battle hand-off, zone travel.
// Only `save` is persisted; everything else is session state. Commits happen at checkpoints (rendering §10.5).
import { create } from 'zustand';
import { CONTENT } from '../data/index';
import { DIALOGUE, TRAINERS, ENCOUNTERS, type Action, type Dialogue, type Variant } from '../data/registry';
import { ZONES } from '../data/zones';
import type { SavePayload } from '../persistence/saveTypes';
import { SaveManager, type KV } from '../persistence/saveManager';
import * as G from '../sim/game';
import { evalExpr, isNight, rivalStarter, leftoverStarter, resolveRivalSpecies, rollEncounter, rollWeather } from '../sim/world';
import { Rng, hashString } from '../sim/rng';
import { createInstance } from '../sim/progression';
import type { CreatureInstance, WeatherId, TypeId } from '../sim/types';
import type { BattleSetup } from '../sim/battle/types';
import { runtime } from './runtime';

export type Mode = 'title' | 'newgame' | 'explore' | 'dialogue' | 'battle' | 'transition' | 'menu' | 'shop' | 'starter' | 'evolution' | 'ending' | 'learn';

export interface DialogueRun {
  id: string;
  speaker: string;
  lines: { s: string; t: string }[];
  index: number;
  variant: Variant;
  npcId?: string;
  look?: string;
  onDone?: () => void;
  choiceOpen: boolean;
}

export interface BattleRequest {
  kind: 'wild' | 'trainer';
  trainerId?: string;
  wild?: CreatureInstance;
  wildKey?: string;
  stage: { x: number; y: number; z: number; yaw: number };
  weather: WeatherId;
  attuned: TypeId | null;
  phase?: number;
}

export interface Toast { id: number; text: string; kind?: 'info' | 'warn' | 'good' }

let toastId = 1;

function storage(): KV | null {
  try {
    const kv = window.localStorage;
    return SaveManager.probe(kv) ? kv : null;
  } catch {
    return null;
  }
}

export const saveManager = new SaveManager(typeof window !== 'undefined' ? storage() : null, {
  species: new Set(Object.keys(CONTENT.species)),
  moves: new Set(Object.keys(CONTENT.moves)),
  items: new Set(Object.keys(CONTENT.items)),
  zones: new Set(Object.keys(ZONES)),
});

interface GameState {
  mode: Mode;
  prevMode: Mode;
  save: SavePayload | null;
  zoneId: string;
  spawnId: string;
  zoneEpoch: number;              // bump to force zone remount
  weather: WeatherId;
  dialogue: DialogueRun | null;
  battle: BattleRequest | null;
  shop: string | null;
  menuTab: string;
  toasts: Toast[];
  banner: string | null;          // persistent warning (save failures)
  saveNotice: string | null;
  pendingEvolutions: { uid: string; to: string }[];
  pendingLearn: { uid: string; move: string }[];
  defeatedWild: Set<string>;
  interactHint: string | null;
  fade: number;                   // 0..1 overlay opacity for transitions
  // actions
  toast: (text: string, kind?: Toast['kind']) => void;
  setMode: (m: Mode) => void;
  commit: (reason: string) => void;
  mutate: (fn: (s: SavePayload) => SavePayload, reason?: string) => void;
  startNewGame: (name: string, pronoun: 'they' | 'she' | 'he', look: SavePayload['player']['look']) => void;
  continueGame: () => boolean;
  warp: (zone: string, spawn: string) => void;
  talk: (dialogueId: string, opts?: { speaker?: string; npcId?: string; look?: string; onDone?: () => void }) => void;
  advance: () => void;
  choose: (i: number) => void;
  runActions: (actions: Action[] | undefined, done?: () => void) => void;
  startBattle: (req: BattleRequest) => void;
  finishBattle: (r: BattleResult) => void;
  tick: (dtSec: number) => void;
}

export interface BattleResult {
  outcome: 'win' | 'loss' | 'fled' | 'captured';
  party: CreatureInstance[];
  captured?: CreatureInstance | null;
  itemsUsed: Record<string, number>;
  pendingEvolutions: { uid: string; to: string }[];
  pendingLearn: { uid: string; move: string }[];
  releaseUid?: string; // chosen when storage was full
}

function fillText(t: string, s: SavePayload | null): string {
  if (!s) return t;
  const starter = s.player.starter ?? 'c01';
  const nm = (id: string) => CONTENT.species[id]?.name ?? id;
  return t
    .replace(/\{player\}/g, s.player.name)
    .replace(/\{starter\}/g, nm(starter))
    .replace(/\{rival_starter\}/g, nm(rivalStarter(starter)))
    .replace(/\{leftover\}/g, nm(leftoverStarter(starter)));
}

export const useGame = create<GameState>((set, get) => ({
  mode: 'title',
  prevMode: 'title',
  save: null,
  zoneId: 'town_1',
  spawnId: 'sp_town_1_home',
  zoneEpoch: 0,
  weather: 'clear',
  dialogue: null,
  battle: null,
  shop: null,
  menuTab: 'troupe',
  toasts: [],
  banner: null,
  saveNotice: null,
  pendingEvolutions: [],
  pendingLearn: [],
  defeatedWild: new Set(),
  interactHint: null,
  fade: 0,

  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((st) => ({ toasts: [...st.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 3600);
  },

  setMode: (m) => set((st) => ({ prevMode: st.mode, mode: m })),

  commit: (reason) => {
    const s = get().save;
    if (!s) return;
    const payload: SavePayload = { ...s, zone: { id: get().zoneId, spawn: get().spawnId } };
    const r = saveManager.commit(payload);
    if (!r.ok) set({ banner: r.message });
    else if (get().banner) set({ banner: null });
    void reason;
  },

  mutate: (fn, reason) => {
    const s = get().save;
    if (!s) return;
    set({ save: fn(s) });
    if (reason) get().commit(reason);
  },

  startNewGame: (name, pronoun, look) => {
    saveManager.startNewGame();
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const s = G.newGamePayload(CONTENT, name, pronoun, look, seed);
    set({ save: s, zoneId: s.zone.id, spawnId: s.zone.spawn, zoneEpoch: get().zoneEpoch + 1, mode: 'explore', defeatedWild: new Set() });
    get().commit('new game');
    setTimeout(() => get().talk('dlg_intro_wake', { speaker: '' }), 600);
  },

  continueGame: () => {
    const l = saveManager.load();
    if (!l.payload) {
      if (l.notice) get().toast(l.notice, 'warn');
      return false;
    }
    const z = ZONES[l.payload.zone.id] ? l.payload.zone : { id: 'town_1', spawn: 'sp_town_1_home' };
    set({ save: l.payload, zoneId: z.id, spawnId: z.spawn, zoneEpoch: get().zoneEpoch + 1, mode: 'explore', saveNotice: l.notice ?? null, defeatedWild: new Set() });
    if (l.notice) get().toast(l.notice, 'warn');
    return true;
  },

  warp: (zone, spawn) => {
    if (!ZONES[zone]) {
      get().toast(`That way isn't open yet.`, 'warn');
      return;
    }
    set({ mode: 'transition', fade: 1 });
    setTimeout(() => {
      const s = get().save;
      const zs = ZONES[zone];
      const rng = new Rng([hashString(zone), s ? Math.floor(s.clockMinutes / 120) : 0, 3, 4]);
      const weather = rollWeather(zs.weather as Partial<Record<WeatherId, number>>, rng);
      set({ zoneId: zone, spawnId: spawn, zoneEpoch: get().zoneEpoch + 1, weather, defeatedWild: new Set() });
      // register Hearthrest spawn when entering a town/hearth zone
      if (s && zs.hearthSpawn) set({ save: { ...s, lastHearth: { zone, spawn: zs.hearthSpawn } } });
      get().commit('zone transition');
      setTimeout(() => set({ mode: 'explore', fade: 0 }), 450);
    }, 380);
  },

  talk: (dialogueId, opts = {}) => {
    const d: Dialogue | undefined = DIALOGUE[dialogueId];
    const s = get().save;
    if (!d || !s) {
      if (!d) console.warn('missing dialogue', dialogueId);
      opts.onDone?.();
      return;
    }
    const variant = d.variants.find((v) => evalExpr(v.if, s));
    if (!variant) {
      opts.onDone?.();
      return;
    }
    const lines = variant.lines.map((l) => ({ s: l.s ?? opts.speaker ?? '', t: fillText(l.t, s) }));
    if (!lines.length) {
      get().runActions(variant.actions, opts.onDone);
      return;
    }
    runtime.frozen = true;
    set({ mode: 'dialogue', dialogue: { id: dialogueId, speaker: opts.speaker ?? '', lines, index: 0, variant, npcId: opts.npcId, look: opts.look, onDone: opts.onDone, choiceOpen: false } });
  },

  advance: () => {
    const d = get().dialogue;
    if (!d) return;
    if (d.choiceOpen) return;
    if (d.index < d.lines.length - 1) {
      set({ dialogue: { ...d, index: d.index + 1 } });
      return;
    }
    if (d.variant.choice) {
      set({ dialogue: { ...d, choiceOpen: true } });
      return;
    }
    set({ dialogue: null, mode: 'explore' });
    runtime.frozen = false;
    get().runActions(d.variant.actions, d.onDone);
  },

  choose: (i) => {
    const d = get().dialogue;
    if (!d?.variant.choice) return;
    const opt = d.variant.choice.options[i];
    set({ dialogue: null, mode: 'explore' });
    runtime.frozen = false;
    get().runActions([...(opt?.actions ?? []), ...(d.variant.actions ?? [])], d.onDone);
  },

  runActions: (actions, done) => {
    const list = [...(actions ?? [])];
    const step = () => {
      const a = list.shift();
      if (!a) {
        done?.();
        return;
      }
      const st = get();
      const s = st.save!;
      const c = CONTENT;
      if ('set' in a) {
        st.mutate((x) => ({ ...x, flags: { ...x.flags, [a.set as string]: true } }), 'flag');
        return step();
      }
      if ('unset' in a) {
        st.mutate((x) => {
          const f = { ...x.flags };
          delete f[a.unset as string];
          return { ...x, flags: f };
        }, 'flag');
        return step();
      }
      if ('heal' in a) {
        st.mutate((x) => G.healParty(c, x), 'heal');
        const z = ZONES[st.zoneId];
        if (z?.hearthSpawn) st.mutate((x) => ({ ...x, lastHearth: { zone: st.zoneId, spawn: z.hearthSpawn! } }), 'hearth');
        const charity = G.charityChimes(get().save!);
        if (charity.ok) {
          st.mutate(() => charity.s, 'charity');
          st.toast('The Hearthkeeper presses 5 Reed Chimes into your hands. "Everyone deserves a fair start."', 'good');
        }
        st.toast('Your troupe is rested and in tune again.', 'good');
        return step();
      }
      if ('shop' in a) {
        set({ shop: a.shop as string, mode: 'shop' });
        runtime.frozen = true;
        const unsub = useGame.subscribe((ns) => {
          if (ns.mode !== 'shop') {
            unsub();
            step();
          }
        });
        return;
      }
      if ('give' in a && ((a.n as number) ?? 1) < 0) {
        const r = G.takeItem(s, a.give as string, -(a.n as number));
        if (r.ok) st.mutate(() => r.s, 'take');
        return step();
      }
      if ('give' in a) {
        const r = G.giveItem(s, a.give as string, (a.n as number) ?? 1);
        if (r.ok) {
          st.mutate(() => r.s, 'give');
          st.toast(`Received ${c.items[a.give as string]?.name ?? a.give}${(a.n as number) > 1 ? ' ×' + a.n : ''}.`, 'good');
        }
        return step();
      }
      if ('take' in a) {
        const r = G.takeItem(s, a.take as string, (a.n as number) ?? 1);
        if (r.ok) {
          st.mutate(() => r.s, 'take');
          st.toast(`Handed over ${c.items[a.take as string]?.name ?? a.take}${((a.n as number) ?? 1) > 1 ? ' ×' + a.n : ''}.`, 'info');
        }
        return step();
      }
      if ('money' in a) {
        st.mutate((x) => G.addMoney(x, a.money as number), 'money');
        st.toast(`Received ◇ ${a.money}.`, 'good');
        return step();
      }
      if ('kin' in a) {
        let sp = a.kin as string;
        if (sp === 'leftover') sp = leftoverStarter(s.player.starter ?? 'c01');
        if (sp === 'rival_line') sp = rivalStarter(s.player.starter ?? 'c01');
        const r = G.giveKin(c, s, sp, (a.lv as number) ?? 5);
        if (r.ok) {
          st.mutate(() => r.s, 'gift kin');
          st.toast(`${c.species[sp].name} joined your ${r.s.party.includes(r.uid!) ? 'troupe' : 'Fosterage'}!`, 'good');
        } else st.toast('Your troupe and Fosterage are full.', 'warn');
        return step();
      }
      if ('starter' in a) {
        set({ mode: 'starter' });
        runtime.frozen = true;
        const unsub = useGame.subscribe((ns) => {
          if (ns.mode !== 'starter') {
            unsub();
            step();
          }
        });
        return;
      }
      if ('battle' in a) {
        const tid = a.battle as string;
        const t = TRAINERS[tid];
        if (!t) return step();
        const zone = ZONES[st.zoneId];
        const stagePt = nearestStage(zone, runtime.playerPos.x, runtime.playerPos.z);
        st.startBattle({ kind: 'trainer', trainerId: tid, stage: stagePt, weather: st.weather, attuned: attunedFor(st.zoneId, get().save!) });
        const unsub = useGame.subscribe((ns) => {
          if (ns.mode !== 'battle' && ns.mode !== 'transition' && ns.mode !== 'evolution' && ns.mode !== 'learn') {
            unsub();
            // continue script only if the player won
            if (get().save?.defeatedTrainers.includes(tid)) step();
            else done?.();
          }
        });
        return;
      }
      if ('quest' in a) {
        st.mutate((x) => ({ ...x, quests: { ...x.quests, [a.quest as string]: { state: 'active', step: (a.step as number) ?? 0 } } }), 'quest');
        return step();
      }
      if ('questDone' in a) {
        st.mutate((x) => ({ ...x, quests: { ...x.quests, [a.questDone as string]: { state: 'done', step: 99 } } }), 'quest');
        return step();
      }
      if ('warp' in a) {
        st.warp(a.warp as string, a.spawn as string);
        return step();
      }
      if ('fosterage' in a || 'ledger' in a) {
        set({ mode: 'menu', menuTab: 'fosterage' });
        runtime.frozen = true;
        const unsub = useGame.subscribe((ns) => {
          if (ns.mode !== 'menu') {
            unsub();
            step();
          }
        });
        return;
      }
      if ('recall' in a) {
        set({ mode: 'menu', menuTab: 'recall' });
        runtime.frozen = true;
        const unsub = useGame.subscribe((ns) => {
          if (ns.mode !== 'menu') {
            unsub();
            step();
          }
        });
        return;
      }
      if ('steward' in a) {
        const node = a.steward as string;
        const setsFlag = Object.values(ZONES).flatMap((z) => z.nodes).find((n) => n.id === node)?.sets;
        st.mutate((x) => ({ ...x, nodes: x.nodes.includes(node) ? x.nodes : [...x.nodes, node], flags: setsFlag ? { ...x.flags, [setsFlag]: true } : x.flags }), 'node');
        st.toast('The Steward’s kin resonates with the stone — the way opens!', 'good');
        return step();
      }

      if ('ending' in a) {
        set({ mode: 'ending' });
        runtime.frozen = true;
        return;
      }
      return step();
    };
    step();
  },

  startBattle: (req) => {
    if (get().mode === 'battle') return;
    const s = get().save;
    if (!s || !s.party.some((u) => s.instances[u].hp > 0)) return;
    runtime.encounterLock = true;
    runtime.frozen = true;
    runtime.battleStage = req.stage;
    set({ mode: 'transition', fade: 0.9 });
    setTimeout(() => set({ battle: req, mode: 'battle', fade: 0 }), 420);
  },

  finishBattle: (r) => {
    const st = get();
    const req = st.battle!;
    let s = st.save!;
    // write back party state
    const instances = { ...s.instances };
    for (const inst of r.party) instances[inst.uid] = inst;
    s = { ...s, instances, stats: { ...s.stats, battles: s.stats.battles + 1 } };
    // consumed items
    for (const [id, n] of Object.entries(r.itemsUsed)) {
      const t = G.takeItem(s, id, n);
      if (t.ok) s = t.s;
    }
    if (req.kind === 'wild' && req.wild) {
      if (!s.seen.includes(req.wild.species)) s = { ...s, seen: [...s.seen, req.wild.species] };
    }
    let msg: string | null = null;
    if (r.outcome === 'captured' && r.captured) {
      let place = G.addCreature(s, { ...r.captured, metZone: st.zoneId });
      if (!place.ok && r.releaseUid) {
        const rel = G.release(s, r.releaseUid);
        if (rel.ok) place = G.addCreature(rel.s, { ...r.captured, metZone: st.zoneId });
      }
      if (place.ok) {
        s = { ...place.s, stats: { ...place.s.stats, captures: place.s.stats.captures + 1 } };
        msg = place.where === 'storage' ? `${CONTENT.species[r.captured.species].name} was sent to the Fosterage.` : null;
      }
    }
    if (req.kind === 'trainer' && req.trainerId) {
      const t = TRAINERS[req.trainerId];
      if (r.outcome === 'win') {
        s = G.addMoney({ ...s, defeatedTrainers: [...s.defeatedTrainers, req.trainerId], flags: { ...s.flags, [`flag_${req.trainerId}_won`]: true } }, t.payout);
        msg = `You earned ◇ ${t.payout}.`;
        const story = storyOnWin(req.trainerId);
        s = { ...s, flags: { ...s.flags, ...Object.fromEntries(story.flags.map((f) => [f, true])) } };
        for (const it of story.items) { const gi = G.giveItem(s, it, 1); if (gi.ok) s = gi.s; }
        if (story.items.some((i) => i.startsWith('i_keynote'))) msg = `${CONTENT.items[story.items[0]].name} received! ` + msg;
      }
    }
    if (req.kind === 'wild' && req.wildKey && (r.outcome === 'win' || r.outcome === 'captured')) st.defeatedWild.add(req.wildKey);
    let wiped = false;
    if (r.outcome === 'loss') {
      const rival1 = req.trainerId === 't_rival_1';
      if (rival1) {
        s = G.healParty(CONTENT, { ...s, defeatedTrainers: [...s.defeatedTrainers, 't_rival_1'], flags: { ...s.flags, flag_t_rival_1_won: true, flag_rival_1_done: true } });
        msg = 'Cass whoops. "First one doesn\'t count!" Your troupe is patched up.';
      } else {
        const w = G.applyWipe(CONTENT, s);
        s = w.s;
        wiped = true;
        msg = `Your troupe went quiet… You hurry back to the Hearthrest${w.lost ? ` and drop ◇ ${w.lost} on the way` : ''}.`;
      }
    }
    runtime.distSinceBattle = 0;
    runtime.encounterCooldownUntil = performance.now() + 3000;
    set({ save: s, battle: null, pendingEvolutions: r.pendingEvolutions, pendingLearn: r.pendingLearn, mode: 'transition', fade: 1 });
    runtime.battleStage = null;
    setTimeout(() => {
      if (wiped) {
        set({ zoneId: s.zone.id, spawnId: s.zone.spawn, zoneEpoch: get().zoneEpoch + 1 });
      }
      get().commit('battle end');
      set({ mode: 'explore', fade: 0 });
      runtime.encounterLock = false;
      runtime.frozen = false;
      if (msg) get().toast(msg, r.outcome === 'loss' ? 'warn' : 'good');
      if (get().pendingEvolutions.length || get().pendingLearn.length) set({ mode: 'evolution' });
    }, 450);
  },

  tick: (dt) => {
    const s = get().save;
    if (!s || get().mode !== 'explore') return;
    s.clockMinutes += dt; // 1 real second = 1 game minute (mutated in place: not a checkpoint)
    s.player.playtimeSec += dt;
  },
}));

export function attunedFor(zoneId: string, s: SavePayload): TypeId | null {
  const z = ZONES[zoneId];
  if (!z) return null;
  if (zoneId === 'route_3' && !s.flags.flag_fen_stone_restored) return null;
  if (zoneId === 'route_5' && !s.flags.flag_nullbell_broken) return null;
  return z.attuned;
}

export function nearestStage(zone: { battleStages: { at: [number, number]; yaw: number }[] } | undefined, x: number, z: number) {
  const st = zone?.battleStages ?? [{ at: [x, z] as [number, number], yaw: 90 }];
  let best = st[0];
  let bd = Infinity;
  for (const b of st) {
    const d = Math.hypot(b.at[0] - x, b.at[1] - z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  // prefer the player's own spot if it is flat-ish and near (keeps the battle "where you are")
  if (bd > 25) best = { at: [x, z], yaw: 90 };
  return { x: best.at[0], y: 0, z: best.at[1], yaw: best.yaw };
}

/** Build a battle setup from a request (party snapshot, foe team, AI level, weather, attunement). */
export function buildBattleSetup(req: BattleRequest, s: SavePayload): BattleSetup {
  const party = G.partyOf(s);
  if (req.kind === 'wild' && req.wild) {
    return { kind: 'wild', playerParty: party, foeParty: [req.wild], ai: 'easy', ambientWeather: req.weather, attunedType: req.attuned, storageFull: G.isFull(s) };
  }
  const t = TRAINERS[req.trainerId!];
  const rng = new Rng([hashString(t.id), 7, 13, 21]);
  const team = (t.phases ? t.phases[0].team : t.team).map((m) => {
    const sp = resolveRivalSpecies(m.species, s.player.starter);
    return createInstance(CONTENT, rng, sp, m.level, { potential: t.potential, temperament: 'tm_steady' });
  });
  return { kind: 'trainer', playerParty: party, foeParty: team, ai: t.ai, aiItems: t.items, ambientWeather: req.weather, attunedType: t.phases ? (t.phases[0].attuned as TypeId | null) : req.attuned, trainerId: t.id, payout: t.payout };
}

export function wildFor(zoneId: string, s: SavePayload, table: string, key: string): CreatureInstance | null {
  const rng = new Rng([hashString(key), hashString(zoneId), Math.floor(s.clockMinutes), s.stats.battles]);
  const r = rollEncounter(CONTENT, ENCOUNTERS, table, isNight(s.clockMinutes), useGame.getState().weather, rng);
  if (!r) return null;
  return createInstance(CONTENT, rng, r.species, r.level, { potential: 'random', temperament: 'random' });
}

/** Story flags and items granted automatically when a key trainer is beaten (world.md §2.5). */
export function storyOnWin(tid: string): { flags: string[]; items: string[] } {
  let m = tid.match(/^t_rival_(\d)$/);
  if (m) return { flags: [`flag_rival_${m[1]}_done`], items: [] };
  m = tid.match(/^t_cantor_(\d)$/);
  if (m) return { flags: [`flag_trial_${m[1]}_cleared`, ...(m[1] === '4' ? ['flag_odile_named'] : [])], items: [`i_keynote_${m[1]}`] };
  const T: Record<string, { flags: string[]; items: string[] }> = {
    t_admin_brann_1: { flags: ['flag_admin_brann_1', 'flag_cave_miners_saved'], items: [] },
    t_admin_vey_1: { flags: ['flag_admin_vey_1'], items: [] },
    t_admin_vey_2: { flags: ['flag_admin_vey_2', 'flag_leftover_rescued'], items: ['i_disc_09'] },
    t_odile: { flags: ['flag_odile_defeated', 'flag_nullbell_broken'], items: [] },
    t_champion: { flags: ['flag_champion_defeated', 'flag_game_cleared'], items: [] },
  };
  return T[tid] ?? { flags: [], items: [] };
}
