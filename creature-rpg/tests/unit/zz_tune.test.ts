import { it } from 'vitest';
import { simulateCampaignPaths, formatTable, c } from './balanceSim';
import { TRAINERS } from '../../src/data/registry';
it('tune', () => {
  const st = process.env.ST ?? 'c01';
  const seeds = Number(process.env.SEEDS ?? 14);
  const paths = Number(process.env.PATHS ?? 3);
  const patch = JSON.parse(process.env.PATCH ?? '{}');
  for (const [id, p] of Object.entries<any>(patch.trainers ?? {})) {
    const t: any = TRAINERS[id];
    if (p.items) t.items = p.items;
    if (p.potential != null) t.potential = p.potential;
    if (p.levels) t.team.forEach((m: any, i: number) => (m.level = p.levels[i]));
    if (p.species) t.team.forEach((m: any, i: number) => (m.species = p.species[i] ?? m.species));
    if (p.phaseA) t.phases[0].team.forEach((m: any, i: number) => (m.level = p.phaseA[i]));
    if (p.phaseB) t.phases[1].team.forEach((m: any, i: number) => (m.level = p.phaseB[i]));
  }
  for (const [f, list] of Object.entries<any>(patch.learn ?? {})) c.families.learnsets[f] = list;
  const t0 = Date.now();
  const r = simulateCampaignPaths(st, seeds, paths);
  const lines = [st + '\n' + formatTable(r), 'errors ' + r.errors.length + ' losses ' + r.progressionLosses.join(','), 'time ' + (Date.now() - t0) / 1000];
  for (const x of r.rows) lines.push(`${x.info.id} ${x.party}`);
  process.stdout.write(lines.join('\n') + '\n');
}, 600_000);
