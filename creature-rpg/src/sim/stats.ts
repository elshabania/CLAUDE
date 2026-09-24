import type { Content } from './content';
import type { CreatureInstance, Growth, StatId, Stats } from './types';
import { STAT_IDS } from './types';

export const TEMPERAMENT_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
export const TEMPERAMENTS: string[] = ['tm_steady'];
for (const up of TEMPERAMENT_STATS) for (const down of TEMPERAMENT_STATS) if (up !== down) TEMPERAMENTS.push(`tm_${up}_${down}`);

export function temperamentFactor(temperament: string, stat: StatId): number {
  if (stat === 'hp' || temperament === 'tm_steady') return 10;
  const [, up, down] = temperament.split('_');
  if (up === stat) return 11;
  if (down === stat) return 9;
  return 10;
}

export function core(base: number, potential: number, level: number): number {
  return Math.floor(((2 * base + potential) * level) / 100);
}

export function computeStats(c: Content, inst: Pick<CreatureInstance, 'species' | 'level' | 'potential' | 'temperament'>): Stats {
  const sp = c.species[inst.species];
  const out = {} as Stats;
  for (const s of STAT_IDS) {
    const k = core(sp.base[s], inst.potential[s], inst.level);
    out[s] = s === 'hp' ? k + inst.level + 10 : Math.floor(((k + 5) * temperamentFactor(inst.temperament, s)) / 10);
  }
  return out;
}

export function xpForLevel(growth: Growth, level: number): number {
  if (level <= 1) return 0;
  const l3 = level * level * level;
  if (growth === 'fast') return Math.floor((4 * l3) / 5);
  if (growth === 'slow') return Math.floor((5 * l3) / 4);
  return l3;
}

export const LEVEL_CAP = 60;

export function levelForXp(growth: Growth, xp: number): number {
  let l = 1;
  while (l < LEVEL_CAP && xpForLevel(growth, l + 1) <= xp) l++;
  return l;
}

export function stageMult(value: number, stage: number): number {
  if (stage >= 0) return Math.floor((value * (2 + stage)) / 2);
  return Math.floor((value * 2) / (2 - stage));
}
