// Mitigation Advisor — automated development of TIS mitigation measures.
//
// This is the expert loop a traffic engineer runs by hand, automated:
//   1. Assign baseline demand; find failing links (LOS E/F).
//   2. Screen candidate mitigations: +1 lane on each failing link, one at a
//      time, re-solving each time (fast MSA) and measuring the network-wide
//      delay change against the baseline.
//   3. Build a package greedily: adopt candidates in descending order of
//      benefit, keeping each only if it still improves the network on top of
//      the measures already adopted (interactions matter: fixing one link can
//      move the bottleneck elsewhere).
//   4. Verify the final package with a full-quality run and draft the TIS
//      mitigation report section.
//
// Deterministic end to end - same network + demand always yields the same
// plan, so results are defensible and reproducible in a study appendix.

import type { LaneNetwork } from "@/lib/lane-network";
import { runAssignment, losVc, type AssignmentResult } from "@/lib/assignment";

/** MSA iterations for candidate screening runs (speed over polish). */
const SCREEN_ITERS = 6;
/** MSA iterations for baseline + final verification runs. */
const FULL_ITERS = 12;
/** Cap on failing links screened as candidates (worst V/C first). */
const MAX_CANDIDATES = 30;
/** Cap on measures adopted into the package. */
const MAX_ADOPTIONS = 12;
/** Minimum network delay improvement (veh·h/h) for a candidate to be adopted. */
const MIN_GAIN = 0.05;
/**
 * Weight (veh·h/h equivalent) per failing link in the adoption objective.
 * Pure delay-greedy adopts measures that cut delay while PUSHING marginal
 * links over the LOS E threshold (widening redistributes flow); pricing each
 * failing link into the objective makes the package resolve failures, not
 * just shave delay.
 */
const FAIL_WEIGHT = 0.1;

/** Package objective: lower is better. */
const objective = (r: AssignmentResult) =>
  r.totals.delay + FAIL_WEIGHT * r.totals.failingLinks;

export interface MitigationMeasure {
  linkId: string;
  linkIdx: number;
  lengthM: number;
  fromLanes: number;
  toLanes: number;
  /** V/C and LOS on this link before any mitigation. */
  vcBefore: number;
  losBefore: string;
  /** V/C and LOS on this link under the final package. */
  vcAfter: number;
  losAfter: string;
  /** Network delay change measured when this measure was adopted (veh·h/h, negative = better). */
  delayGain: number;
}

export interface ResidualIssue {
  linkId: string;
  linkIdx: number;
  lengthM: number;
  lanes: number;
  vc: number;
  los: string;
}

export interface MitigationPlan {
  demand: number;
  baseline: AssignmentResult;
  final: AssignmentResult;
  /** Adopted measures, in adoption order. */
  measures: MitigationMeasure[];
  /** Links still at LOS E/F after the package. */
  residual: ResidualIssue[];
  /** laneOverrides that reproduce the package (feed to runAssignment / the UI). */
  overrides: Record<string, number>;
  /** Number of single-measure screening runs performed. */
  screenedCount: number;
  /** Drafted TIS report section (markdown). */
  reportMarkdown: string;
}

export type AdvisorProgress = (message: string, fraction: number) => void;

/** Yield to the event loop so the UI can paint between solver runs. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

export async function developMitigationPlan(
  net: LaneNetwork,
  demand: number,
  onProgress?: AdvisorProgress
): Promise<MitigationPlan> {
  const report = (m: string, f: number) => onProgress?.(m, Math.min(1, f));

  // ---- 1. Baselines ----
  report("Running baseline assignment…", 0.02);
  await tick();
  const baseline = runAssignment(net, { totalDemand: demand, iterations: FULL_ITERS });
  // Screening runs use fewer MSA iterations; deltas must be measured against a
  // baseline solved at the SAME iteration count or the iteration difference
  // itself shows up as a fake "benefit".
  const baselineScreen = runAssignment(net, { totalDemand: demand, iterations: SCREEN_ITERS });
  await tick();

  const failing = baseline.perLink
    .map((r, li) => ({ li, vc: r.vc, los: r.los }))
    .filter(x => x.los === "E" || x.los === "F")
    .sort((a, b) => b.vc - a.vc)
    .slice(0, MAX_CANDIDATES);

  if (failing.length === 0) {
    report("No failing links — network copes with this demand.", 1);
    return {
      demand,
      baseline,
      final: baseline,
      measures: [],
      residual: [],
      overrides: {},
      screenedCount: 0,
      reportMarkdown: buildReport(net, demand, baseline, baseline, [], [], 0),
    };
  }

  // ---- 2. Screen candidates: +1 lane on each failing link, in isolation ----
  interface Candidate { li: number; gain: number }
  const candidates: Candidate[] = [];
  for (let i = 0; i < failing.length; i++) {
    const { li } = failing[i];
    const link = net.links[li];
    report(
      `Screening candidate ${i + 1}/${failing.length}: add a lane on ${link.id}…`,
      0.05 + 0.55 * (i / failing.length)
    );
    await tick();
    const res = runAssignment(net, {
      totalDemand: demand,
      iterations: SCREEN_ITERS,
      laneOverrides: { [link.id]: link.numLanes + 1 },
    });
    // Negative gain = better (delay + failing-link penalty reduced).
    candidates.push({ li, gain: objective(res) - objective(baselineScreen) });
  }
  candidates.sort((a, b) => a.gain - b.gain);

  // ---- 3. Greedy package build ----
  // Adopt in benefit order, but re-test each on TOP of the measures already
  // adopted: mitigations interact (fixing one bottleneck can starve or feed
  // another), so a candidate only stays if it still helps the package.
  const overrides: Record<string, number> = {};
  const measures: MitigationMeasure[] = [];
  let cumulative = baselineScreen;
  for (let i = 0; i < candidates.length && measures.length < MAX_ADOPTIONS; i++) {
    const cand = candidates[i];
    if (cand.gain > -MIN_GAIN) break; // ranked list — nothing helpful left
    const link = net.links[cand.li];
    report(
      `Building package: testing ${link.id} on top of ${measures.length} adopted measure(s)…`,
      0.6 + 0.3 * (i / candidates.length)
    );
    await tick();
    const trial = runAssignment(net, {
      totalDemand: demand,
      iterations: SCREEN_ITERS,
      laneOverrides: { ...overrides, [link.id]: link.numLanes + 1 },
    });
    const gain = objective(trial) - objective(cumulative);
    if (gain <= -MIN_GAIN) {
      overrides[link.id] = link.numLanes + 1;
      cumulative = trial;
      measures.push({
        linkId: link.id,
        linkIdx: cand.li,
        lengthM: link.length,
        fromLanes: link.numLanes,
        toLanes: link.numLanes + 1,
        vcBefore: baseline.perLink[cand.li].vc,
        losBefore: baseline.perLink[cand.li].los,
        vcAfter: 0, // filled from the final run below
        losAfter: "A",
        delayGain: gain,
      });
      if (cumulative.totals.failingLinks === 0) break;
    }
  }

  // ---- 3b. Escalation: a second lane where one wasn't enough ----
  // A link at V/C 1.5 drops to ~1.0 with one extra lane — still failing. Offer
  // adopted measures a further lane (up to 2 rounds) while it keeps improving
  // the package objective.
  for (let round = 0; round < 2 && cumulative.totals.failingLinks > 0; round++) {
    let improved = false;
    for (const m of measures) {
      if (measures.length === 0) break;
      const cur = cumulative.perLink[m.linkIdx];
      if (cur.los !== "E" && cur.los !== "F") continue;
      report(`Escalating ${m.linkId} to ${m.toLanes + 1} lanes…`, 0.9);
      await tick();
      const trial = runAssignment(net, {
        totalDemand: demand,
        iterations: SCREEN_ITERS,
        laneOverrides: { ...overrides, [m.linkId]: m.toLanes + 1 },
      });
      const gain = objective(trial) - objective(cumulative);
      if (gain <= -MIN_GAIN) {
        m.toLanes += 1;
        m.delayGain += gain;
        overrides[m.linkId] = m.toLanes;
        cumulative = trial;
        improved = true;
        if (cumulative.totals.failingLinks === 0) break;
      }
    }
    if (!improved) break;
  }

  // ---- 4. Final verification at full quality ----
  report("Verifying final package…", 0.93);
  await tick();
  const final = measures.length
    ? runAssignment(net, { totalDemand: demand, iterations: FULL_ITERS, laneOverrides: overrides })
    : baseline;
  for (const m of measures) {
    m.vcAfter = final.perLink[m.linkIdx].vc;
    m.losAfter = final.perLink[m.linkIdx].los;
  }
  const residual: ResidualIssue[] = final.perLink
    .map((r, li) => ({ li, r }))
    .filter(x => x.r.los === "E" || x.r.los === "F")
    .sort((a, b) => b.r.vc - a.r.vc)
    .map(x => ({
      linkId: net.links[x.li].id,
      linkIdx: x.li,
      lengthM: net.links[x.li].length,
      lanes: x.r.lanesUsed,
      vc: x.r.vc,
      los: x.r.los,
    }));

  const reportMarkdown = buildReport(net, demand, baseline, final, measures, residual, failing.length);
  report("Done.", 1);
  return {
    demand,
    baseline,
    final,
    measures,
    residual,
    overrides,
    screenedCount: failing.length,
    reportMarkdown,
  };
}

// ---------------------------------------------------------------------------

const f0 = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (a: number, b: number) => (b > 0 ? `${(((b - a) / b) * 100).toFixed(0)}%` : "—");

function buildReport(
  net: LaneNetwork,
  demand: number,
  baseline: AssignmentResult,
  final: AssignmentResult,
  measures: MitigationMeasure[],
  residual: ResidualIssue[],
  screened: number
): string {
  const L: string[] = [];
  const b = baseline.totals, fi = final.totals;

  L.push(`## Mitigation Measures — Traffic Impact Assessment`);
  L.push(``);
  L.push(`### 1. Method`);
  L.push(
    `The masterplan road network (${net.stats.linkCount} links, ` +
    `${f1(net.stats.centerlineKm)} km of carriageway, ${net.stats.junctionCount} junctions) ` +
    `was assigned a development traffic demand of ${f0(demand)} veh/h using a deterministic ` +
    `user-equilibrium assignment (MSA with BPR volume-delay, capacity ${900} veh/h/lane). ` +
    `Link performance is graded on volume/capacity ratio (LOS E at V/C > 0.85, LOS F at V/C > 1.0). ` +
    `Candidate mitigations (one additional lane per failing link) were screened individually and ` +
    `assembled into a package greedily, retaining only measures that improve network performance ` +
    `in combination.`
  );
  L.push(``);

  L.push(`### 2. Baseline (do-nothing) conditions`);
  L.push(`| Indicator | Value |`);
  L.push(`|---|---|`);
  L.push(`| Demand routed | ${f0(b.routedDemand)} veh/h |`);
  L.push(`| Vehicle-km travelled | ${f0(b.vkt)} veh·km/h |`);
  L.push(`| Total network delay | ${f1(b.delay)} veh·h/h |`);
  L.push(`| Links at LOS E/F | ${b.failingLinks} |`);
  L.push(``);
  if (b.failingLinks > 0) {
    L.push(
      `${b.failingLinks} link(s) operate at or beyond capacity under baseline demand; ` +
      `the ${Math.min(screened, MAX_CANDIDATES)} worst were carried forward for mitigation testing.`
    );
  } else {
    L.push(`No link exceeds LOS D under the assessed demand; no mitigation is required.`);
  }
  L.push(``);

  if (measures.length > 0) {
    L.push(`### 3. Recommended mitigation package`);
    L.push(
      `${measures.length} carriageway widening measure(s) are recommended, listed in order of ` +
      `adoption (each measure was verified to improve the network in combination with those above it):`
    );
    L.push(``);
    L.push(`| # | Link | Length (m) | Lanes | V/C before | LOS before | V/C after | LOS after |`);
    L.push(`|---|---|---|---|---|---|---|---|`);
    measures.forEach((m, i) => {
      L.push(
        `| M${i + 1} | ${m.linkId} | ${f0(m.lengthM)} | ${m.fromLanes} → ${m.toLanes} ` +
        `| ${f2(m.vcBefore)} | ${m.losBefore} | ${f2(m.vcAfter)} | ${m.losAfter} |`
      );
    });
    L.push(``);

    L.push(`### 4. With-mitigation performance`);
    L.push(`| Indicator | Baseline | With mitigation | Change |`);
    L.push(`|---|---|---|---|`);
    L.push(`| Total network delay (veh·h/h) | ${f1(b.delay)} | ${f1(fi.delay)} | −${pct(fi.delay, b.delay)} |`);
    L.push(`| Links at LOS E/F | ${b.failingLinks} | ${fi.failingLinks} | ${fi.failingLinks - b.failingLinks} |`);
    L.push(`| Vehicle-hours travelled (veh·h/h) | ${f1(b.vht)} | ${f1(fi.vht)} | −${pct(fi.vht, b.vht)} |`);
    L.push(``);
  }

  if (residual.length > 0) {
    L.push(`### ${measures.length > 0 ? 5 : 3}. Residual issues`);
    L.push(
      `${residual.length} link(s) remain at LOS E/F after the widening package. Mid-block widening ` +
      `alone does not resolve these locations; junction-level interventions (signalisation, ` +
      `turn-lane provision, or grade separation) or demand management should be considered:`
    );
    L.push(``);
    L.push(`| Link | Length (m) | Lanes | V/C | LOS |`);
    L.push(`|---|---|---|---|---|`);
    for (const r of residual.slice(0, 15)) {
      L.push(`| ${r.linkId} | ${f0(r.lengthM)} | ${r.lanes} | ${f2(r.vc)} | ${r.los} |`);
    }
    L.push(``);
  }

  L.push(`### ${(measures.length > 0 ? 5 : 3) + (residual.length > 0 ? 1 : 0)}. Conclusion`);
  if (measures.length === 0 && baseline.totals.failingLinks === 0) {
    L.push(
      `The proposed network accommodates the assessed demand of ${f0(demand)} veh/h ` +
      `without exceeding LOS D on any link. No mitigation measures are required.`
    );
  } else if (measures.length > 0) {
    L.push(
      `With the recommended ${measures.length}-measure widening package, total network delay ` +
      `reduces from ${f1(b.delay)} to ${f1(fi.delay)} veh·h/h (a ${pct(fi.delay, b.delay)} reduction) ` +
      `and the number of failing links reduces from ${b.failingLinks} to ${fi.failingLinks}. ` +
      (fi.failingLinks === 0
        ? `All links operate at LOS D or better with mitigation in place.`
        : `The residual locations listed above require junction-level treatment beyond mid-block widening.`)
    );
  } else {
    L.push(
      `No single-lane widening measure produced a material network benefit; the failing locations ` +
      `require junction-level or corridor-level intervention rather than mid-block widening.`
    );
  }
  L.push(``);
  L.push(`*Generated automatically by the Masterplan Highway Analyzer mitigation advisor. ` +
    `Deterministic run — reproducible for the same network and demand.*`);

  return L.join("\n");
}

// Re-export for the advisor page.
export { losVc };
