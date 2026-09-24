import { it } from 'vitest';
import { simulateCampaign, runBattle, trainerSetup, salveBudget, c } from './balanceSim';
import { TRAINERS } from '../../src/data/registry';
import { computeStats } from '../../src/sim/stats';
it('dbg', () => {
  const st = process.env.ST ?? 'c01';
  const target = process.env.TGT!;
  const patch = JSON.parse(process.env.PATCH ?? '{}');
  for (const [id, p] of Object.entries<any>(patch.trainers ?? {})) {
    const t: any = TRAINERS[id];
    if (p.items) t.items = p.items;
    if (p.potential != null) t.potential = p.potential;
    if (p.levels) t.team.forEach((m: any, i: number) => (m.level = p.levels[i]));
  }
  for (const [f, list] of Object.entries<any>(patch.learn ?? {})) c.families.learnsets[f] = list;
  let done = false;
  simulateCampaign(st, 1, { onStory: (id, party, att) => {
    if (id !== target || done) return; done = true;
    for (const m of party) process.stdout.write(`P ${m.species}@${m.level} ${JSON.stringify(computeStats(c, m))} ${m.moves.map((x) => x.id + ':' + c.moves[x.id].name).join(',')}\n`);
    const t = TRAINERS[id];
    for (let k = 0; k < Number(process.env.N ?? 2); k++) {
      const out: string[] = [];
      const r = runBattle(trainerSetup(t, party, st, att), 1000 + k, { salves: salveBudget(id), trainer: t, starter: st, log: (ev: any[]) => {
        for (const e of ev) {
          if (e.t === 'turnStart') out.push(`-- T${e.turn}`);
          else if (e.t === 'moveUsed') out.push(`${e.side} ${e.name}: ${e.moveName}(${e.moveType})`);
          else if (e.t === 'damage') out.push(`   ${e.side} -${e.amount} ${e.hpAfter}/${e.maxHp} eff${e.eff}${e.crit ? ' crit' : ''} ${e.source}`);
          else if (['sendOut', 'faint', 'itemUsed', 'statusApplied', 'cantAct', 'heal', 'statChange'].includes(e.t)) out.push(`   ${e.t} ${e.side} ${e.name ?? e.species ?? ''} ${e.item ?? e.status ?? e.stat ?? ''} ${e.delta ?? e.amount ?? e.reason ?? ''}`);
        }
      } });
      process.stdout.write(`BATTLE ${k} ${r.outcome} ${r.turns}\n` + out.join('\n') + '\n');
    }
  } });
}, 600_000);
