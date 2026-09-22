"""Assignment convergence, iteration-to-iteration stability, and the noise band.

The noise band is the range of each link's volume over the last N assignment
iterations (and the same for sector totals). It is written to
``derived/noise_band.parquet`` so every comparison view can say whether a
difference between two runs is larger than what the assignment itself wobbles by.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from .. import config
from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import Check, evaluate_severity, fmt, make_finding, pct, period_label, refs_from_rows


class ConvergenceAndNoise(Check):
    check_id = "convergence_and_noise"
    name = "Convergence and noise band"
    description = (
        "Final relative gap per assignment period versus target; share of links whose flow "
        "is stable (GEH below 1) between the last two iterations; and the per-link and "
        "per-sector noise band from the last N iterations."
    )
    required_tables = {"convergence"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        out: list[Finding] = []
        self.rows_examined = store.row_count("convergence")
        out += self._rel_gap(store, params, severity_rules)
        if store.has("iteration_flows") and store.row_count("iteration_flows") > 0:
            self.rows_examined += store.row_count("iteration_flows")
            out += self._stability(store, params, severity_rules)
            n_band = self._noise_band(store, params)
            self.message = f"noise band written for {n_band} link/sector-period rows"
        else:
            self.message = (
                "iteration_flows table absent: GEH stability and noise band not computed"
            )
        return out

    def _rel_gap(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        target = float(params.get("rel_gap_target", 0.001))
        high = float(params.get("rel_gap_high", 0.01))
        sql = """
            SELECT stage, period, iteration, value AS rel_gap, source_file, source_row
            FROM convergence c
            WHERE metric = 'REL_GAP' AND iteration = (
                SELECT MAX(iteration) FROM convergence x
                WHERE x.metric = 'REL_GAP' AND x.stage = c.stage
                  AND COALESCE(x.period, '') = COALESCE(c.period, ''))
            ORDER BY stage, period
        """
        df = store.query(sql)
        out: list[Finding] = []
        for r in df.itertuples():
            gap = None if r.rel_gap != r.rel_gap else float(r.rel_gap)
            sev = evaluate_severity(rules, rel_gap=gap, stage=r.stage)
            if sev is None:
                continue
            period = None if pd.isna(r.period) else str(r.period)
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=Location(type=LocationType.RUN, id=store.run_id,
                                      label=f"{r.stage} {period or ''}".strip()),
                    executive_line=(
                        f"The {_stage_label(r.stage)} for {period_label(period)} stopped at a "
                        f"relative gap of {pct(gap, 2)} after {fmt(r.iteration)} iterations, "
                        f"above the {pct(target, 2)} target."
                    ),
                    likely_cause="Too few iterations, or a network coding problem (very high "
                    "V/C, unrealistic capacities) that prevents equilibrium.",
                    suggested_action="Increase the iteration limit or tighten the gap "
                    "criterion, and resolve any capacity findings first.",
                    values={"stage": r.stage, "rel_gap": gap, "iterations": int(r.iteration)},
                    thresholds={"rel_gap_target": target, "rel_gap_high": high},
                    sources=refs_from_rows(df[(df["stage"] == r.stage)
                                              & (df["period"].fillna("")
                                                 == (period or ""))],
                                           "convergence", "value"),
                    query=sql, period=period, discriminator=str(r.stage),
                    method="REL_GAP at the last iteration per stage x period",
                )
            )
        return out

    def _stability(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        geh_stable = float(params.get("geh_stable", 1.0))
        share_target = float(params.get("geh_stable_share_target", 0.95))
        hours = config.period_hours()
        hours_values = ", ".join(f"('{p}', {h})" for p, h in hours.items()) or "('', 1.0)"
        sql = f"""
            WITH ph(period, hours) AS (VALUES {hours_values}),
            last2 AS (
                SELECT period, iteration,
                       ROW_NUMBER() OVER (PARTITION BY period ORDER BY iteration DESC) AS rn
                FROM (SELECT DISTINCT period, iteration FROM iteration_flows)
            ),
            pairs AS (
                SELECT a.link_id, a.period, a.volume AS v_last, b.volume AS v_prev
                FROM iteration_flows a
                JOIN last2 la ON la.period = a.period AND la.iteration = a.iteration AND la.rn = 1
                JOIN last2 lb ON lb.period = a.period AND lb.rn = 2
                JOIN iteration_flows b ON b.link_id = a.link_id AND b.period = a.period
                                      AND b.iteration = lb.iteration
            ),
            geh AS (
                SELECT p.link_id, p.period,
                       SQRT(2 * POWER(p.v_last / ph.hours - p.v_prev / ph.hours, 2)
                            / NULLIF(p.v_last / ph.hours + p.v_prev / ph.hours, 0)) AS geh
                FROM pairs p LEFT JOIN (SELECT * FROM ph) ph ON ph.period = p.period
            )
            SELECT period, COUNT(*) AS n_links,
                   AVG(CASE WHEN COALESCE(geh, 0) < {geh_stable} THEN 1.0 ELSE 0.0 END)
                       AS stable_share,
                   MAX(geh) AS max_geh
            FROM geh GROUP BY period ORDER BY period
        """
        df = store.query(sql)
        out: list[Finding] = []
        for r in df.itertuples():
            share = float(r.stable_share)
            sev = evaluate_severity(rules, stable_share=share)
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=Location(type=LocationType.RUN, id=store.run_id,
                                      label=f"Flow stability {r.period}"),
                    executive_line=(
                        f"Only {pct(share, 1)} of links had stable flows between the last two "
                        f"iterations in {period_label(str(r.period))} "
                        f"(target {pct(share_target)})."
                    ),
                    likely_cause="Assignment stopped before flows settled; results on "
                    "individual links are still moving between iterations.",
                    suggested_action="Run more iterations; treat link-level differences "
                    "smaller than the noise band as not significant.",
                    values={"stable_share": share, "n_links": int(r.n_links),
                            "max_geh": float(r.max_geh) if r.max_geh == r.max_geh else None},
                    thresholds={"geh_stable": geh_stable,
                                "geh_stable_share_target": share_target},
                    sources=[_iter_ref(store)],
                    query=sql, period=str(r.period), discriminator="stability",
                    method="GEH between last two iterations on hourly flows",
                )
            )
        return out

    def _noise_band(self, store: RunStore, params: dict[str, Any]) -> int:
        n_iter = int(params.get("noise_band_iterations", 3))
        method = f"range_last_{n_iter}_iterations"
        sql = f"""
            WITH lastn AS (
                SELECT period, iteration
                FROM (SELECT DISTINCT period, iteration FROM iteration_flows)
                QUALIFY ROW_NUMBER() OVER (PARTITION BY period ORDER BY iteration DESC) <= {n_iter}
            ),
            f AS (
                SELECT i.link_id, i.period, i.iteration, i.volume
                FROM iteration_flows i JOIN lastn USING (period, iteration)
            ),
            link_band AS (
                SELECT 'link' AS level, CAST(link_id AS VARCHAR) AS location_id, period,
                       MAX(volume) - MIN(volume) AS band
                FROM f GROUP BY link_id, period
            ),
            sector_iter AS (
                SELECT l.sector_id, f.period, f.iteration, SUM(f.volume) AS volume
                FROM f JOIN links l USING (link_id)
                WHERE l.sector_id IS NOT NULL
                GROUP BY 1, 2, 3
            ),
            sector_band AS (
                SELECT 'sector' AS level, sector_id AS location_id, period,
                       MAX(volume) - MIN(volume) AS band
                FROM sector_iter GROUP BY sector_id, period
            )
            SELECT level, location_id, period, 'volume' AS metric,
                   -band AS band_low, band AS band_high, '{method}' AS method
            FROM (SELECT * FROM link_band UNION ALL SELECT * FROM sector_band)
            ORDER BY level, period, location_id
        """
        band = store.query(sql)
        store.write_noise_band(band)
        return int(len(band))


def _iter_ref(store: RunStore):
    from .base import table_ref

    return table_ref(store, "iteration_flows", "volume")


def _stage_label(stage: Any) -> str:
    labels = {"HWY_ASSIGN": "highway assignment", "PT_ASSIGN": "transit assignment",
              "DEMAND_LOOP": "demand loop"}
    return labels.get(str(stage), str(stage).replace("_", " ").lower())
