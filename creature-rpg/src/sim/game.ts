// Pure operations on committed game state (party, storage, inventory, economy, flags, encyclopedia).
// Every function returns a NEW payload (never mutates) so saves stay consistent and testable.
import type { Content } from './content';
import type { CreatureInstance } from './types';
import type { SavePayload } from '../persistence/saveTypes';
import { PARTY_CAP, STORAGE_CAP } from '../persistence/saveTypes';
import { computeStats } from './stats';
import { healFull, createInstance, evolve as evolveInst, learnMove } from './progression';
import { Rng } from './rng';

export const MONEY_CAP = 999_999;
export const STACK_CAP = 99;

export type Result<T = SavePayload> = { ok: true; s: T; msg?: string } | { ok: false; reason: string };

const clone = (s: SavePayload): SavePayload => structuredClone(s);

export function newGamePayload(c: Content, name: string, pronoun: 'they' | 'she' | 'he', look: SavePayload['player']['look'], seed: number): SavePayload {
  return {
    player: { name: name.trim().slice(0, 16) || 'Hollis', pronoun, look, money: 1000, playtimeSec: 0, starter: null },
    clockMinutes: 8 * 60,
    rngState: new Rng([seed >>> 0, 0x1234567, 0x89abcdef, 0x42]).state(),
    zone: { id: 'town_1', spawn: 'sp_town_1_home' },
    lastHearth: { zone: 'town_1', spawn: 'sp_town_1_home' },
    party: [],
    storage: [],
    instances: {},
    inventory: { i_salve_1: 3 },
    flags: { flag_game_started: true },
    quests: {},
    seen: [],
    caught: [],
    nodes: [],
    waystones: [],
    defeatedTrainers: [],
    pickups: [],
    stats: { battles: 0, captures: 0, steps: 0 },
  };
  void c;
}

export function partyOf(s: SavePayload): CreatureInstance[] {
  return s.party.map((u) => s.instances[u]);
}
export function storageOf(s: SavePayload): CreatureInstance[] {
  return s.storage.map((u) => s.instances[u]);
}

/** Place a newly obtained creature: party if room, else storage; fails if both full. */
export function addCreature(s0: SavePayload, inst: CreatureInstance): Result<SavePayload> & { where?: 'party' | 'storage' } {
  const s = clone(s0);
  if (s.instances[inst.uid]) return { ok: false, reason: 'duplicate uid' };
  let where: 'party' | 'storage';
  if (s.party.length < PARTY_CAP) {
    s.party.push(inst.uid);
    where = 'party';
  } else if (s.storage.length < STORAGE_CAP) {
    s.storage.push(inst.uid);
    where = 'storage';
  } else return { ok: false, reason: 'full' };
  s.instances[inst.uid] = inst;
  if (!s.seen.includes(inst.species)) s.seen.push(inst.species);
  if (!s.caught.includes(inst.species)) s.caught.push(inst.species);
  return { ok: true, s, where };
}

export function isFull(s: SavePayload): boolean {
  return s.party.length >= PARTY_CAP && s.storage.length >= STORAGE_CAP;
}

export function release(s0: SavePayload, uid: string): Result {
  const inst = s0.instances[uid];
  if (!inst) return { ok: false, reason: 'no such creature' };
  if (inst.bond) return { ok: false, reason: 'Your first partner cannot be released.' };
  const s = clone(s0);
  if (s.party.includes(uid)) {
    const alive = s.party.filter((u) => u !== uid && s.instances[u].hp > 0);
    if (alive.length === 0) return { ok: false, reason: 'You need at least one kin that can still battle in your troupe.' };
    s.party = s.party.filter((u) => u !== uid);
  } else s.storage = s.storage.filter((u) => u !== uid);
  delete s.instances[uid];
  return { ok: true, s };
}

export function deposit(s0: SavePayload, uid: string): Result {
  if (!s0.party.includes(uid)) return { ok: false, reason: 'not in troupe' };
  if (s0.party.length <= 1) return { ok: false, reason: 'Your troupe needs at least one kin.' };
  if (s0.storage.length >= STORAGE_CAP) return { ok: false, reason: 'The Fosterage is full.' };
  const s = clone(s0);
  s.party = s.party.filter((u) => u !== uid);
  if (!s.party.some((u) => s.instances[u].hp > 0)) return { ok: false, reason: 'Keep at least one kin that can still battle.' };
  s.storage.push(uid);
  return { ok: true, s };
}

export function withdraw(s0: SavePayload, uid: string): Result {
  if (!s0.storage.includes(uid)) return { ok: false, reason: 'not in storage' };
  if (s0.party.length >= PARTY_CAP) return { ok: false, reason: 'Your troupe is full (6).' };
  const s = clone(s0);
  s.storage = s.storage.filter((u) => u !== uid);
  s.party.push(uid);
  return { ok: true, s };
}

export function swapParty(s0: SavePayload, i: number, j: number): Result {
  if (i < 0 || j < 0 || i >= s0.party.length || j >= s0.party.length) return { ok: false, reason: 'bad index' };
  const s = clone(s0);
  [s.party[i], s.party[j]] = [s.party[j], s.party[i]];
  return { ok: true, s };
}

export function healParty(c: Content, s0: SavePayload): SavePayload {
  const s = clone(s0);
  for (const u of s.party) s.instances[u] = healFull(c, s.instances[u]);
  return s;
}

export function count(s: SavePayload, item: string): number {
  return s.inventory[item] ?? 0;
}

export function giveItem(s0: SavePayload, item: string, n = 1): Result {
  const s = clone(s0);
  const cur = s.inventory[item] ?? 0;
  const cap = item.startsWith('i_disc') || item.startsWith('i_keynote') || item.startsWith('i_key') ? 1 : STACK_CAP;
  const next = Math.min(cap, cur + n);
  if (next === cur && n > 0) return { ok: false, reason: `You can't carry more.` };
  s.inventory[item] = next;
  return { ok: true, s };
}

export function takeItem(s0: SavePayload, item: string, n = 1): Result {
  const cur = s0.inventory[item] ?? 0;
  if (cur < n) return { ok: false, reason: 'not enough' };
  const s = clone(s0);
  if (cur - n <= 0) delete s.inventory[item];
  else s.inventory[item] = cur - n;
  return { ok: true, s };
}

export function addMoney(s0: SavePayload, amount: number): SavePayload {
  const s = clone(s0);
  s.player.money = Math.max(0, Math.min(MONEY_CAP, s.player.money + amount));
  return s;
}

export function buy(c: Content, s0: SavePayload, item: string, qty: number): Result {
  const def = c.items[item];
  if (!def || def.price == null) return { ok: false, reason: 'not for sale' };
  if (qty < 1) return { ok: false, reason: 'quantity' };
  const cost = def.price * qty;
  if (s0.player.money < cost) return { ok: false, reason: 'Not enough tallies.' };
  const g = giveItem(s0, item, qty);
  if (!g.ok) return g;
  if ((g.s.inventory[item] ?? 0) - (s0.inventory[item] ?? 0) !== qty) return { ok: false, reason: `You can't carry that many.` };
  return { ok: true, s: addMoney(g.s, -cost) };
}

export function sell(c: Content, s0: SavePayload, item: string, qty: number): Result {
  const def = c.items[item];
  if (!def || !def.sell || def.kind === 'key' || def.kind === 'disc') return { ok: false, reason: 'The Chandler can\'t buy that.' };
  const t = takeItem(s0, item, qty);
  if (!t.ok) return t;
  return { ok: true, s: addMoney(t.s, def.sell * qty) };
}

/** Out-of-battle item use on a troupe member. */
export function useItemOnKin(c: Content, s0: SavePayload, item: string, uid: string, moveSlot?: number): Result {
  const def = c.items[item];
  const inst0 = s0.instances[uid];
  if (!def || !inst0) return { ok: false, reason: 'invalid' };
  if ((s0.inventory[item] ?? 0) < 1) return { ok: false, reason: 'none left' };
  const max = computeStats(c, inst0).hp;
  let inst = structuredClone(inst0);
  const p = def.params as Record<string, any>;
  let msg = '';
  switch (def.kind) {
    case 'heal':
      if (inst.hp <= 0) return { ok: false, reason: 'It has gone quiet — use a reviving item.' };
      if (inst.hp >= max) return { ok: false, reason: 'Already at full HP.' };
      inst.hp = Math.min(max, inst.hp + (p.amount === 'full' ? max : p.amount));
      msg = `HP restored.`;
      break;
    case 'cure':
      if (!inst.status || !(p.cures as string[]).includes(inst.status)) return { ok: false, reason: 'It would have no effect.' };
      inst.status = null;
      inst.sleepCounter = undefined;
      msg = 'Condition cured.';
      break;
    case 'revive':
      if (inst.hp > 0) return { ok: false, reason: 'It hasn\'t gone quiet.' };
      inst.hp = p.full ? max : Math.floor(max / 2);
      msg = 'Back on its feet!';
      break;
    case 'charge':
      if (p.all) inst.moves = inst.moves.map((m) => ({ id: m.id, charges: c.moves[m.id].charges ?? 99 }));
      else {
        if (moveSlot == null || !inst.moves[moveSlot]) return { ok: false, reason: 'Choose a move.' };
        const m = inst.moves[moveSlot];
        const cap = c.moves[m.id].charges ?? 99;
        if (m.charges >= cap) return { ok: false, reason: 'Already full.' };
        m.charges = Math.min(cap, m.charges + (p.amount ?? 10));
      }
      msg = 'Charges restored.';
      break;
    case 'evo': {
      const sp = c.species[inst.species];
      if (sp.evolvesTo?.item !== item) return { ok: false, reason: 'It would have no effect.' };
      const r = evolveInst(c, inst, sp.evolvesTo.species);
      inst = r.inst;
      msg = 'crescendo';
      break;
    }
    default:
      return { ok: false, reason: 'Can\'t use that here.' };
  }
  const t = takeItem(s0, item, 1);
  if (!t.ok) return t;
  const s = t.s;
  s.instances[uid] = inst;
  return { ok: true, s, msg };
}

/** Teach a move from a reusable disc (Etude). */
export function canLearnDisc(c: Content, inst: CreatureInstance, disc: string): boolean {
  const def = c.items[disc];
  if (!def || def.kind !== 'disc') return false;
  const move = (def.params as any).move as string;
  if ((def.params as any).universal) return true;
  const sp = c.species[inst.species];
  const mt = c.moves[move].type;
  return sp.types.includes(mt as any) || (c.families.discCoverage[sp.family] ?? []).includes(mt as any);
}

export function teachMove(c: Content, s0: SavePayload, uid: string, move: string, replaceSlot?: number): Result {
  const inst = s0.instances[uid];
  if (!inst) return { ok: false, reason: 'invalid' };
  if (inst.moves.some((m) => m.id === move)) return { ok: false, reason: 'It already knows that move.' };
  if (inst.moves.length >= 4 && replaceSlot == null) return { ok: false, reason: 'Choose a move to forget.' };
  const s = clone(s0);
  s.instances[uid] = learnMove(c, inst, move, inst.moves.length >= 4 ? replaceSlot : undefined);
  return { ok: true, s };
}

export function relearnable(c: Content, inst: CreatureInstance): string[] {
  const sp = c.species[inst.species];
  const fam = c.families.learnsets[sp.family] ?? [];
  const out = new Set<string>();
  for (const e of fam) if (!e.evo && e.level != null && e.level <= inst.level) out.add(e.move);
  // evolution moves of current and prior stages
  let cur: string | undefined = inst.species;
  while (cur && c.species[cur].evolvesFrom) {
    const prev: string = c.species[cur].evolvesFrom!;
    const mv = c.species[prev].evolvesTo?.move;
    if (mv) out.add(mv);
    cur = prev;
  }
  for (const m of inst.moves) out.delete(m.id);
  return [...out];
}

export function evolveInSave(c: Content, s0: SavePayload, uid: string, to: string): { s: SavePayload; pending?: string; learned?: string } {
  const s = clone(s0);
  const r = evolveInst(c, s.instances[uid], to);
  s.instances[uid] = r.inst;
  if (!s.seen.includes(to)) s.seen.push(to);
  if (!s.caught.includes(to)) s.caught.push(to);
  return { s, pending: r.pending, learned: r.learned };
}

/** Wipe rule (systems §15.1): return to last Hearthrest, heal, lose min(money/4, 100 + 150 × keynotes). */
export function applyWipe(c: Content, s0: SavePayload): { s: SavePayload; lost: number } {
  const keynotes = Object.keys(s0.inventory).filter((k) => k.startsWith('i_keynote')).length;
  const lost = Math.min(Math.floor(s0.player.money / 4), 100 + 150 * keynotes);
  let s = addMoney(s0, -lost);
  s = healParty(c, s);
  s.zone = { id: s.lastHearth.zone, spawn: s.lastHearth.spawn };
  return { s, lost };
}

/** Free Reed Chimes when completely out of chimes and broke (systems §15.3). */
export function charityChimes(s0: SavePayload): Result {
  const chimes = Object.keys(s0.inventory).filter((k) => k.startsWith('i_chime')).reduce((a, k) => a + (s0.inventory[k] ?? 0), 0);
  if (chimes > 0 || s0.player.money >= 200) return { ok: false, reason: 'not eligible' };
  return giveItem(s0, 'i_chime_reed', 5);
}

export function giveKin(c: Content, s0: SavePayload, species: string, level: number, opts: { bond?: boolean } = {}): Result<SavePayload> & { uid?: string } {
  const rng = new Rng(s0.rngState);
  const inst = createInstance(c, rng, species, level, { potential: 10, temperament: 'tm_steady', bond: opts.bond });
  const s1 = { ...s0, rngState: rng.state() };
  const r = addCreature(s1, inst);
  if (!r.ok) return r;
  return { ok: true, s: r.s, uid: inst.uid };
}
