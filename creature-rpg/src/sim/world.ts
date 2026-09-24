// Pure world rules: day/night phase, ambient weather roll, encounter tables, flag expressions.
import type { Rng } from './rng';
import type { SavePayload } from '../persistence/saveTypes';
import type { WeatherId } from './types';
import type { Content } from './content';

/** 1 real second = 1 in-game minute while exploring (a full day ≈ 24 real minutes). */
export function timePhase(clockMinutes: number): 'dawn' | 'day' | 'dusk' | 'night' {
  const m = ((clockMinutes % 1440) + 1440) % 1440;
  if (m >= 5 * 60 && m < 7 * 60) return 'dawn';
  if (m >= 7 * 60 && m < 18 * 60) return 'day';
  if (m >= 18 * 60 && m < 20 * 60) return 'dusk';
  return 'night';
}
export function isNight(clockMinutes: number): boolean {
  const p = timePhase(clockMinutes);
  return p === 'night' || p === 'dusk';
}

export interface EncounterRow { species: string; lo: number; hi: number; day: number; night: number }
export interface EncounterData { tables: Record<string, EncounterRow[]>; weatherMult: Record<string, Record<string, number>> }

/** Normalised probabilities for a table at a given time/weather (weights × primary-type weather multiplier). */
export function encounterProbabilities(c: Content, rows: EncounterRow[], night: boolean, weather: WeatherId): { species: string; p: number; lo: number; hi: number }[] {
  return normalise(c, rows, night, weather, undefined);
}

function normalise(c: Content, rows: EncounterRow[], night: boolean, weather: WeatherId, mult?: Record<string, Record<string, number>>) {
  const wm = mult?.[weather] ?? DEFAULT_MULT[weather] ?? {};
  const ws = rows.map((r) => {
    const base = night ? r.night : r.day;
    const t = c.species[r.species].types[0];
    return base * (wm[t] ?? 1);
  });
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  return rows.map((r, i) => ({ species: r.species, p: ws[i] / sum, lo: r.lo, hi: r.hi })).filter((x) => x.p > 0);
}

const DEFAULT_MULT: Record<string, Record<string, number>> = {
  rain: { verdant: 1.5, toxin: 1.5, gale: 0.5, lumen: 0.75 },
  fog: { shade: 2.0, lumen: 1.5, gale: 0.5 },
  snow: { frost: 2.0, verdant: 0.25, toxin: 0.5 },
  sunlight: { stone: 1.25, gale: 1.25, shade: 0.5, frost: 0.5 },
};

export function rollEncounter(c: Content, data: EncounterData, table: string, night: boolean, weather: WeatherId, rng: Rng): { species: string; level: number } | null {
  const rows = data.tables[table];
  if (!rows?.length) return null;
  const probs = normalise(c, rows, night, weather, data.weatherMult);
  const r = rng.int(0, 999_999) / 1_000_000;
  let acc = 0;
  for (const x of probs) {
    acc += x.p;
    if (r < acc) return { species: x.species, level: rng.int(x.lo, x.hi) };
  }
  const last = probs[probs.length - 1];
  return { species: last.species, level: rng.int(last.lo, last.hi) };
}

export function rollWeather(weights: Partial<Record<WeatherId, number>>, rng: Rng): WeatherId {
  const entries = Object.entries(weights).filter(([, w]) => (w ?? 0) > 0) as [WeatherId, number][];
  if (!entries.length) return 'clear';
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng.int(1, sum);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

// ---------- flag expressions ----------
// Grammar: expr := term ('||' term)* ; term := factor ('&&' factor)* ; factor := '!' factor | '(' expr ')' | atom
// atoms: flag ids, keynotes>=N, has:<item>, caught:<species>, true, false
export function evalExpr(expr: string | undefined, s: SavePayload): boolean {
  if (!expr) return true;
  const toks = expr.match(/\(|\)|!|&&|\|\||[^\s()!&|]+/g) ?? [];
  let i = 0;
  const atom = (t: string): boolean => {
    if (t === 'true') return true;
    if (t === 'false') return false;
    const kn = t.match(/^keynotes(>=|<|==)(\d+)$/);
    if (kn) {
      const n = Object.keys(s.inventory).filter((k) => k.startsWith('i_keynote') && (s.inventory[k] ?? 0) > 0).length;
      const v = +kn[2];
      return kn[1] === '>=' ? n >= v : kn[1] === '<' ? n < v : n === v;
    }
    const cn = t.match(/^caught(>=|<|==)(\d+)$/);
    if (cn) {
      const n = s.caught.length, v = +cn[2];
      return cn[1] === '>=' ? n >= v : cn[1] === '<' ? n < v : n === v;
    }
    const cnt = t.match(/^count:(\w+)(>=|<|==)(\d+)$/);
    if (cnt) {
      const n = s.inventory[cnt[1]] ?? 0, v = +cnt[3];
      return cnt[2] === '>=' ? n >= v : cnt[2] === '<' ? n < v : n === v;
    }
    if (t.startsWith('has:')) return (s.inventory[t.slice(4)] ?? 0) > 0;
    if (t.startsWith('caught:')) return s.caught.includes(t.slice(7));
    if (t.startsWith('won:')) return s.defeatedTrainers.includes(t.slice(4));
    if (t.startsWith('node:')) return s.nodes.includes(t.slice(5));
    const f = s.flags[t];
    return f === true || (typeof f === 'number' && f > 0);
  };
  const factor = (): boolean => {
    const t = toks[i++];
    if (t === '!') return !factor();
    if (t === '(') {
      const v = orExpr();
      i++; // ')'
      return v;
    }
    return atom(t);
  };
  const andExpr = (): boolean => {
    let v = factor();
    while (toks[i] === '&&') {
      i++;
      const r = factor();
      v = v && r;
    }
    return v;
  };
  const orExpr = (): boolean => {
    let v = andExpr();
    while (toks[i] === '||') {
      i++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  };
  return orExpr();
}

/** The starter that beats `player` (Water > Fire > Electric > Water). */
export function rivalStarter(player: string): string {
  return player === 'c01' ? 'c04' : player === 'c04' ? 'c07' : 'c01';
}
export function leftoverStarter(player: string): string {
  const r = rivalStarter(player);
  return ['c01', 'c04', 'c07'].find((x) => x !== player && x !== r)!;
}
/** Resolve RSn placeholders to the rival line's stage-n species. */
export function resolveRivalSpecies(id: string, playerStarter: string | null): string {
  if (!id.startsWith('RS')) return id;
  const base = rivalStarter(playerStarter ?? 'c01');
  const n = +id.slice(2);
  return 'c' + String(+base.slice(1) + n - 1).padStart(2, '0');
}

/** Which story key unlocks each Resonance register (flag id or Keynote item id). */
export const REGISTER_UNLOCK: Record<string, string | null> = {
  verdant: 'flag_resonance_tutorial', electric: 'flag_resonance_tutorial', fire: 'flag_resonance_tutorial', water: 'flag_resonance_tutorial',
  stone: 'i_keynote_1', toxin: 'i_keynote_2', gale: 'i_keynote_3', shade: 'i_keynote_4', frost: 'i_keynote_5', lumen: 'i_keynote_6',
};
