"""Demand matrix sanity: negatives, row/column imbalance, intrazonals, artefacts."""

from __future__ import annotations

from typing import Any

from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    make_finding,
    pct,
    refs_from_rows,
    table_ref,
    zone_locations,
)


class MatrixSanity(Check):
    check_id = "matrix_sanity"
    name = "Demand matrix sanity"
    description = (
        "DEMAND matrices must have no negative cells, balanced productions and attractions "
        "per zone, a plausible intrazonal share per purpose and mode, and no widespread "
        "fractional artefacts (tiny non-zero cells)."
    )
    required_tables = {"od"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        self.rows_examined = int(store.scalar(
            "SELECT COUNT(*) FROM od WHERE matrix_kind = 'DEMAND'") or 0)
        out: list[Finding] = []
        out += self._negatives(store, severity_rules)
        out += self._row_col(store, params, severity_rules)
        out += self._intrazonal(store, params, severity_rules)
        out += self._intrazonal_zones(store, params, severity_rules)
        out += self._fractional(store, params, severity_rules)
        return out

    def _negatives(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = """
            SELECT purpose, mode, period, COUNT(*) AS n_cells, SUM(trips) AS neg_trips,
                   MIN(trips) AS min_trips, ANY_VALUE(source_file) AS source_file,
                   (LIST(origin || '-' || destination ORDER BY trips))[1:20] AS examples
            FROM od WHERE matrix_kind = 'DEMAND' AND trips < 0
            GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
        """
        df = store.query(sql)
        out: list[Finding] = []
        for r in df.itertuples():
            sev = evaluate_severity(rules, issue="negative_cells", n_cells=int(r.n_cells))
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=_matrix_loc(r.purpose, r.mode, r.period),
                    executive_line=(
                        f"The {r.purpose} {r.mode} demand matrix for {r.period} has "
                        f"{fmt(r.n_cells)} negative cells (lowest {fmt(r.min_trips, 2)} trips)."
                    ),
                    likely_cause="Matrix subtraction (e.g. total minus a segment) or "
                    "furnessing with inconsistent targets.",
                    suggested_action="Clamp or rebalance the matrix before assignment.",
                    values={"issue": "negative_cells", "n_cells": int(r.n_cells),
                            "negative_trips": float(r.neg_trips),
                            "min_trips": float(r.min_trips),
                            "example_cells": list(r.examples)},
                    thresholds={"min_trips": 0},
                    sources=refs_from_rows(df[(df["purpose"] == r.purpose)
                                              & (df["mode"] == r.mode)
                                              & (df["period"] == r.period)], "od", "trips"),
                    query=sql, period=str(r.period), discriminator="negative_cells",
                    method="COUNT(*) WHERE trips < 0 per DEMAND matrix",
                )
            )
        return out

    def _row_col(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        ratio_max = float(params.get("row_col_ratio_max", 5.0))
        min_total = float(params.get("min_zone_total_for_ratio", 50))
        sql = f"""
            WITH rows_ AS (SELECT origin AS zone_id, SUM(trips) AS productions
                           FROM od WHERE matrix_kind = 'DEMAND' GROUP BY 1),
                 cols AS (SELECT destination AS zone_id, SUM(trips) AS attractions
                          FROM od WHERE matrix_kind = 'DEMAND' GROUP BY 1)
            SELECT zone_id, COALESCE(productions, 0) AS productions,
                   COALESCE(attractions, 0) AS attractions,
                   GREATEST(COALESCE(productions, 0), COALESCE(attractions, 0))
                     / NULLIF(LEAST(COALESCE(productions, 0), COALESCE(attractions, 0)), 0)
                     AS ratio
            FROM rows_ FULL OUTER JOIN cols USING (zone_id)
            WHERE GREATEST(COALESCE(productions, 0), COALESCE(attractions, 0)) >= {min_total}
              AND (LEAST(COALESCE(productions, 0), COALESCE(attractions, 0)) = 0
                   OR GREATEST(COALESCE(productions, 0), COALESCE(attractions, 0))
                      / LEAST(COALESCE(productions, 0), COALESCE(attractions, 0)) > {ratio_max})
            ORDER BY ratio DESC NULLS FIRST, zone_id
        """
        df = store.query(sql)
        if df.empty:
            return []
        locs = zone_locations(store, df["zone_id"])
        out: list[Finding] = []
        for r in df.itertuples():
            ratio = None if r.ratio is None or r.ratio != r.ratio else float(r.ratio)
            sev = evaluate_severity(rules, issue="row_col_imbalance", ratio=ratio)
            if sev is None:
                continue
            zid = int(r.zone_id)
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[zid],
                    executive_line=(
                        f"Zone {zid} produces {fmt(r.productions)} trips but attracts "
                        f"{fmt(r.attractions)} across all demand matrices, a ratio of "
                        f"{fmt(ratio, 1) if ratio is not None else 'infinity'} to one."
                    ),
                    likely_cause="Land-use for the zone drives one trip end only (e.g. "
                    "employment with no population), or a matrix column was zeroed.",
                    suggested_action="Check the zone's land-use inputs and the trip "
                    "distribution balancing for this zone.",
                    values={"issue": "row_col_imbalance", "productions": float(r.productions),
                            "attractions": float(r.attractions), "ratio": ratio},
                    thresholds={"row_col_ratio_max": ratio_max,
                                "min_zone_total_for_ratio": min_total},
                    sources=[table_ref(store, "od", "trips")],
                    query=sql, discriminator="row_col_imbalance",
                    method="row totals vs column totals of all DEMAND matrices per zone",
                )
            )
        return out

    def _intrazonal(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        share_max = float(params.get("intrazonal_share_max", 0.15))
        sql = """
            SELECT purpose, mode, SUM(trips) AS total,
                   SUM(CASE WHEN origin = destination THEN trips ELSE 0 END) AS intrazonal,
                   SUM(CASE WHEN origin = destination THEN trips ELSE 0 END)
                       / NULLIF(SUM(trips), 0) AS share
            FROM od WHERE matrix_kind = 'DEMAND'
            GROUP BY 1, 2 ORDER BY 1, 2
        """
        df = store.query(sql)
        out: list[Finding] = []
        for r in df.itertuples():
            share = None if r.share is None or r.share != r.share else float(r.share)
            if share is None or share <= share_max:
                continue
            sev = evaluate_severity(rules, issue="intrazonal_share", intrazonal_share=share)
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=_matrix_loc(r.purpose, r.mode, None),
                    executive_line=(
                        f"{pct(share, 1)} of {r.purpose} {r.mode} trips start and end in the "
                        f"same zone, above the {pct(share_max)} ceiling."
                    ),
                    likely_cause="Intrazonal impedance too low in distribution, or large "
                    "zones that should be split.",
                    suggested_action="Review the intrazonal time/cost assumption and zone "
                    "sizes for this purpose.",
                    values={"issue": "intrazonal_share", "intrazonal_share": share,
                            "intrazonal_trips": float(r.intrazonal),
                            "total_trips": float(r.total)},
                    thresholds={"intrazonal_share_max": share_max},
                    sources=[table_ref(store, "od", "trips")],
                    query=sql, discriminator="intrazonal_share",
                    method="intrazonal / total trips per purpose x mode (all periods)",
                )
            )
        return out

    def _intrazonal_zones(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        share_max = float(params.get("intrazonal_share_max", 0.15))
        min_total = float(params.get("min_zone_total_for_ratio", 50))
        sql = f"""
            SELECT origin AS zone_id, SUM(trips) AS total,
                   SUM(CASE WHEN origin = destination THEN trips ELSE 0 END) AS intrazonal,
                   SUM(CASE WHEN origin = destination THEN trips ELSE 0 END)
                       / NULLIF(SUM(trips), 0) AS share
            FROM od WHERE matrix_kind = 'DEMAND'
            GROUP BY 1 HAVING share > {share_max} AND SUM(trips) >= {min_total}
            ORDER BY share DESC, zone_id
        """
        df = store.query(sql)
        if df.empty:
            return []
        locs = zone_locations(store, df["zone_id"])
        out: list[Finding] = []
        for r in df.itertuples():
            share = float(r.share)
            sev = evaluate_severity(rules, issue="intrazonal_share", intrazonal_share=share)
            if sev is None:
                continue
            zid = int(r.zone_id)
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[zid],
                    executive_line=(
                        f"{pct(share, 1)} of trips starting in zone {zid} stay inside it, "
                        f"above the {pct(share_max)} ceiling."
                    ),
                    likely_cause="Intrazonal impedance far too low for this zone, or the zone "
                    "is very large and should be split.",
                    suggested_action="Check the zone's intrazonal time/distance and its size.",
                    values={"issue": "intrazonal_share", "intrazonal_share": share,
                            "intrazonal_trips": float(r.intrazonal),
                            "total_trips": float(r.total)},
                    thresholds={"intrazonal_share_max": share_max,
                                "min_zone_total_for_ratio": min_total},
                    sources=[table_ref(store, "od", "trips")],
                    query=sql, discriminator="intrazonal_share",
                    method="intrazonal / row total per origin zone (all DEMAND matrices)",
                )
            )
        return out

    def _fractional(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        cell_max = float(params.get("fractional_cell_max_trips", 0.01))
        share_min = float(params.get("fractional_share_min", 0.01))
        sql = f"""
            SELECT purpose, mode, period, COUNT(*) AS n_cells,
                   COUNT(*) FILTER (WHERE trips > 0 AND trips < {cell_max}) AS n_fractional,
                   COUNT(*) FILTER (WHERE trips > 0 AND trips < {cell_max}) * 1.0
                     / NULLIF(COUNT(*), 0) AS share
            FROM od WHERE matrix_kind = 'DEMAND'
            GROUP BY 1, 2, 3 HAVING share >= {share_min} ORDER BY share DESC
        """
        df = store.query(sql)
        out: list[Finding] = []
        for r in df.itertuples():
            share = float(r.share)
            sev = evaluate_severity(rules, issue="fractional_artefact", fractional_share=share)
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=_matrix_loc(r.purpose, r.mode, r.period),
                    executive_line=(
                        f"{pct(share, 1)} of the non-zero cells in the {r.purpose} {r.mode} "
                        f"{r.period} matrix hold less than {cell_max:g} of a trip."
                    ),
                    likely_cause="Gravity/logit distribution spreads tiny probabilities over "
                    "every zone pair; harmless but inflates matrix size and run time.",
                    suggested_action="Consider rounding or thresholding small cells before "
                    "assignment if run time matters.",
                    values={"issue": "fractional_artefact", "fractional_share": share,
                            "n_fractional": int(r.n_fractional), "n_cells": int(r.n_cells)},
                    thresholds={"fractional_cell_max_trips": cell_max,
                                "fractional_share_min": share_min},
                    sources=[table_ref(store, "od", "trips")],
                    query=sql, period=str(r.period), discriminator="fractional_artefact",
                    method="share of non-zero cells with 0 < trips < threshold",
                )
            )
        return out


def _matrix_loc(purpose: Any, mode: Any, period: Any) -> Location:
    mid = f"{purpose}/{mode}" + (f"/{period}" if period else "")
    return Location(type=LocationType.MATRIX, id=mid, label=f"Matrix {mid}")
