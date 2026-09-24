import { it } from 'vitest';
import { simulateCampaign, storyWinRate, levelShift, c } from './balanceSim';
import { TRAINERS } from '../../src/data/registry';
function applyPatch(patch: any) {
  for (const [id, p] of Object.entries<any>(patch.trainers ?? {})) {
    const t: any = TRAINERS[id];
    if (p.items) t.items = p.items;
    if (p.potential != null) t.potential = p.potential;
    if (p.levels) t.team.forEach((m: any, i: number) => (m.level = p.levels[i]));
    if (p.phaseA) t.phases[0].team.forEach((m: any, i: number) => (m.level = p.phaseA[i]));
  }
  for (const [f, list] of Object.entries<any>(patch.learn ?? {})) c.families.learnsets[f] = list;
}
it('whatif', () => {
  applyPatch(JSON.parse(process.env.PATCH ?? '{}'));
  const targets = process.env.TGT!.split(',');
  const variants = JSON.parse(process.env.VAR ?? '[{"name":"base"}]');
  const out: string[] = [];
  const st = process.env.ST ?? 'c01';
  const seeds = Number(process.env.SEEDS ?? 40);
  simulateCampaign(st, 1, { onStory: (id, party, att) => {
    if (!targets.includes(id)) return;
    const row = [`${st} ${id} party ${party.map((m) => m.species + '@' + m.level).join(' ')}`];
    for (const v of variants) {
      if (v.nosw) process.env.NO_HUMAN_SWITCH = '1'; else delete process.env.NO_HUMAN_SWITCH;
      const pp = v.shift ? levelShift(party, v.shift) : party;
      const r = storyWinRate(TRAINERS[id], pp, st, att, seeds, (t: any) => {
        if (v.items) t.items = v.items;
        if (v.potential != null) t.potential = v.potential;
        if (v.levels) t.team.forEach((m: any, i: number) => (m.level = v.levels[i]));
        if (v.phaseA) t.phases[0].team.forEach((m: any, i: number) => (m.level = v.phaseA[i]));
        if (v.delta) { t.team.forEach((m: any) => (m.level += v.delta)); if (t.phases) t.phases.forEach((ph: any) => ph.team.forEach((m: any) => (m.level += v.delta))); }
        if (v.species) t.team.forEach((m: any, i: number) => (m.species = v.species[i] ?? m.species));
        return t;
      });
      delete process.env.NO_HUMAN_SWITCH;
      row.push(`  ${v.name}: ${r.winPct.toFixed(0)}%`);
    }
    out.push(row.join('\n'));
  } });
  process.stdout.write(out.join('\n') + '\n');
}, 600_000);
