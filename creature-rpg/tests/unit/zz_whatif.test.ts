import { it } from 'vitest';
import { simulateCampaign, storyWinRate, levelShift } from './balanceSim';
import { TRAINERS } from '../../src/data/registry';
function applyT(t: any, p: any) {
  if (p.items) t.items = p.items;
  if (p.potential != null) t.potential = p.potential;
  if (p.levels) t.team.forEach((m: any, i: number) => (m.level = p.levels[i] ?? m.level));
  if (p.phaseA) t.phases[0].team.forEach((m: any, i: number) => (m.level = p.phaseA[i]));
  if (p.phaseB) t.phases[1].team.forEach((m: any, i: number) => (m.level = p.phaseB[i]));
  if (p.delta) { t.team.forEach((m: any) => (m.level += p.delta)); if (t.phases) t.phases.forEach((ph: any) => ph.team.forEach((m: any) => (m.level += p.delta))); }
  return t;
}
it('whatif', () => {
  const targets = process.env.TGT!.split(',');
  const variants = JSON.parse(process.env.VAR ?? '[{"name":"base"}]');
  const st = process.env.ST ?? 'c01';
  const seeds = Number(process.env.SEEDS ?? 6);
  const paths = Number(process.env.PATHS ?? 8);
  const acc: Record<string, number[][]> = {};
  for (let p = 0; p < paths; p++) {
    simulateCampaign(st, seeds, { onStory: (id, party, att) => {
      if (!targets.includes(id)) return;
      acc[id] ??= variants.map(() => []);
      variants.forEach((v: any, j: number) => {
        const pp = v.shift ? levelShift(party, v.shift) : party;
        acc[id][j].push(storyWinRate(TRAINERS[id], pp, st, att, seeds, (t: any) => applyT(t, v), p ? `#${p}` : '').winPct);
      });
    } }, p);
  }
  const out: string[] = [];
  for (const id of targets) if (acc[id]) out.push(`${st} ${id}\t` + variants.map((v: any, j: number) => `${v.name}: ${(acc[id][j].reduce((a, b) => a + b, 0) / acc[id][j].length).toFixed(0)}`).join('\t'));
  process.stdout.write(out.join('\n') + '\n');
}, 600_000);
