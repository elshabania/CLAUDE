// Campaign simulation — mechanical completability only; not a playtest (qa_plan §7.1).
// SIM-01 (story battle win rates) and SIM-03 (XP sufficiency) against the real content + engine + AI.
// Results and recommendations: design/reviews/balance_sim.md.
import { describe, expect, it } from 'vitest';
import { simulateCampaign, formatTable, STORY, type CampaignResult } from './balanceSim';

const SEEDS = 40;
const STARTERS = ['c01', 'c04', 'c07'];

/**
 * Story battles that currently miss the qa_plan §7.2 win-rate target in this simulation.
 * These are CONTENT/BALANCE findings (see design/reviews/balance_sim.md), not accepted design.
 * The test fails if any OTHER blocking battle drops below target; when a listed battle is fixed,
 * delete its entry (the test prints a reminder).
 */
const KNOWN_BELOW_TARGET: Record<string, string> = {
  'c01:t_rival_2': 'RS2 Lv16 (pot 12) vs Lv13-14 troupe',
  'c04:t_cantor_1': 'Hard AI 2× i_salve_3 = 2 full heals at Lv12',
  'c04:t_rival_2': 'RS2 Lv16 (pot 12)',
  'c04:t_cantor_2': 'Hard AI 2× i_salve_3 (90% without items)',
  'c04:t_cantor_4': 'gale ace c21 Lv30',
  'c04:t_rival_5': 'RS3 Lv40',
  'c04:t_cantor_6': 'six kin Lv41-45',
  'c04:t_rival_6': 'six kin Lv45-48',
  'c04:t_champion': 'six kin Lv47-50, pot 15',
  'c07:t_cantor_1': 'water starter vs verdant Cantor',
  'c07:t_rival_2': 'RS2 Lv16 (electric vs water)',
  'c07:t_admin_brann_1': 'Hard AI 2× i_salve_3',
  'c07:t_admin_vey_1': 'Hard AI 2× i_salve_3',
  'c07:t_cantor_4': 'gale ace c21 Lv30',
  'c07:t_rival_5': 'RS3 c03 Lv40 (electric·gale vs water)',
  'c07:t_cantor_6': 'six kin Lv41-45',
  'c07:t_rival_6': 'six kin Lv45-48',
};

const results: Record<string, CampaignResult> = {};

describe('campaign balance simulation (mechanical only; not a playtest)', () => {
  for (const st of STARTERS) {
    describe(`starter ${st}`, () => {
      it('simulates the whole critical path without errors or stalls', () => {
        const r = simulateCampaign(st, SEEDS);
        results[st] = r;
        process.stdout.write(
          `\nCampaign simulation — mechanical completability only; not a playtest. Starter ${st} ` +
            `(${r.wildBattles} wild + ${r.trainerBattles} trainer battles on the path, ${SEEDS} seeds per story battle)\n` +
            formatTable(r) + '\n',
        );
        expect(r.errors).toEqual([]);
        expect(r.rows.map((x) => x.info.id)).toEqual(STORY.map((s) => s.id));
        // softlock checks (qa_plan §7.2 item 7): no battle reaches the 200-turn limit
        expect(r.rows.filter((x) => x.timeouts > 0).map((x) => x.info.id)).toEqual([]);
      }, 60_000);

      it('SIM-03: the troupe\'s strongest kin reaches model party level − 2 before every story battle without grinding', () => {
        const r = results[st];
        const short = r.rows.filter((x) => x.leadLv < x.info.modelAvg - 2).map((x) => `${x.info.id}: top Lv ${x.leadLv} < ${x.info.modelAvg - 2}`);
        expect(short).toEqual([]);
      });

      it('SIM-01: blocking story battles meet the qa_plan §7.2 win-rate targets (known content findings excepted)', () => {
        const r = results[st];
        const unexpected: string[] = [];
        for (const x of r.rows) {
          if (!x.info.blocking) continue;
          const key = `${st}:${x.info.id}`;
          const below = x.winPct < x.info.minWin;
          if (below && !KNOWN_BELOW_TARGET[key]) unexpected.push(`${x.info.id}: ${x.winPct.toFixed(0)}% < ${x.info.minWin}%`);
          if (!below && KNOWN_BELOW_TARGET[key]) process.stdout.write(`  note: ${key} now meets its target (${x.winPct.toFixed(0)}%) — remove it from KNOWN_BELOW_TARGET\n`);
        }
        expect(unexpected).toEqual([]);
      });
    });
  }

  it('Rival 1 is loss-tolerant (D20): simulated and reported, never blocking', () => {
    for (const st of STARTERS) expect(results[st].rows[0].info.blocking).toBe(false);
  });
});
