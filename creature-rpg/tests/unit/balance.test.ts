// Campaign simulation — mechanical completability only; not a playtest (qa_plan §7.1).
// SIM-01 (story battle win rates) and SIM-03 (XP sufficiency) against the real content + engine + AI.
// Results and recommendations: design/reviews/balance_sim.md.
import { describe, expect, it } from 'vitest';
import { simulateCampaignPaths, formatTable, STORY, type CampaignResult } from './balanceSim';

// 8 independent progressions per starter × 6 seeds per story battle = 48 battles per row. One progression is one
// player's run and swings a lot (a single catch changes the next three battles); the mean over paths is the signal.
const PATHS = 8;
const SEEDS = 6;
const STARTERS = ['c01', 'c04', 'c07'];

/**
 * Story battles allowed to miss the qa_plan §7.2 win-rate target in this simulation, with the reason.
 * Empty since the D30 balance tuning pass (design/reviews/balance_sim.md "Tuning pass"). The test fails if any
 * blocking battle drops below target; if an entry is ever added and later passes, the test prints a reminder.
 */
const KNOWN_BELOW_TARGET: Record<string, string> = {};

const results: Record<string, CampaignResult> = {};

describe('campaign balance simulation (mechanical only; not a playtest)', () => {
  for (const st of STARTERS) {
    describe(`starter ${st}`, () => {
      it('simulates the whole critical path without errors or stalls', () => {
        const r = simulateCampaignPaths(st, SEEDS, PATHS);
        results[st] = r;
        process.stdout.write(
          `\nCampaign simulation — mechanical completability only; not a playtest. Starter ${st} ` +
            `(${r.wildBattles} wild + ${r.trainerBattles} trainer battles on the path; ${PATHS} progressions × ${SEEDS} seeds per story battle)\n` +
            formatTable(r) + '\n',
        );
        expect(r.errors).toEqual([]);
        expect(r.rows.map((x) => x.info.id)).toEqual(STORY.map((s) => s.id));
        // softlock checks (qa_plan §7.2 item 7): no battle reaches the 200-turn limit
        expect(r.rows.filter((x) => x.timeouts > 0).map((x) => x.info.id)).toEqual([]);
      }, 60_000);

      it('SIM-03: the troupe\'s strongest kin reaches model party level − 2 before every story battle without grinding (weakest progression)', () => {
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
