"""Sector-to-sector demand shifts versus the base that no input change explains."""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..models import Finding, Location, LocationType, Severity
from ..store import RunStore
from .base import Check, base_table_sql, evaluate_severity, fmt, make_finding, pct, table_ref


class UnexplainedDemandShift(Check):
    check_id = "unexplained_demand_shift"
    name = "Unexplained demand shift"
    description = (
        "Compares sector-to-sector DEMAND trips with the base run. A shift is 'explained' "
        "when the origin or destination sector has a land-use change above 1% or any "
        "network/transit input change; explained shifts are reported as Info only."
    )
    required_tables = {"od", "zones"}
    needs_base = True

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        assert base is not None
        from ..changes import sector_change_summary

        min_trips = float(params.get("min_sector_pair_trips", 100))
        lu_share = float(params.get("explain_land_use_share", 0.01))
        shift_share = float(params.get("sector_shift_share", 0.10))
        sql = f"""
            WITH r AS (
                SELECT zo.sector_id AS o_sec, zd.sector_id AS d_sec, SUM(o.trips) AS trips
                FROM od o JOIN zones zo ON zo.zone_id = o.origin
                          JOIN zones zd ON zd.zone_id = o.destination
                WHERE o.matrix_kind = 'DEMAND' GROUP BY 1, 2
            ),
            b AS (
                SELECT zo.sector_id AS o_sec, zd.sector_id AS d_sec, SUM(o.trips) AS trips
                FROM {base_table_sql(base, "od")} o
                JOIN {base_table_sql(base, "zones")} zo ON zo.zone_id = o.origin
                JOIN {base_table_sql(base, "zones")} zd ON zd.zone_id = o.destination
                WHERE o.matrix_kind = 'DEMAND' GROUP BY 1, 2
            )
            SELECT COALESCE(r.o_sec, b.o_sec) AS o_sec, COALESCE(r.d_sec, b.d_sec) AS d_sec,
                   COALESCE(r.trips, 0) AS run_trips, COALESCE(b.trips, 0) AS base_trips,
                   COALESCE(r.trips, 0) - COALESCE(b.trips, 0) AS delta,
                   ABS(COALESCE(r.trips, 0) - COALESCE(b.trips, 0)) / NULLIF(b.trips, 0)
                       AS shift_share
            FROM r FULL OUTER JOIN b USING (o_sec, d_sec)
            WHERE GREATEST(COALESCE(r.trips, 0), COALESCE(b.trips, 0)) >= {min_trips}
            ORDER BY shift_share DESC NULLS FIRST, o_sec, d_sec
        """
        df = store.query(sql)
        self.rows_examined = int(len(df))
        if df.empty:
            return []
        changes = sector_change_summary(store, base, land_use_share=lu_share)
        out: list[Finding] = []
        explained_rows: list[dict[str, Any]] = []
        for r in df.itertuples():
            share = None if r.shift_share is None or pd.isna(r.shift_share) \
                else float(r.shift_share)
            if share is None:
                share = float("inf") if float(r.run_trips) > 0 else 0.0
            if share <= shift_share:
                continue
            o, d = str(r.o_sec), str(r.d_sec)
            explanation = {s: changes[s] for s in (o, d) if s in changes}
            explained = bool(explanation)
            if explained:
                # Explained shifts are expected behaviour: collect them into one Info
                # summary instead of one finding per sector pair.
                explained_rows.append({
                    "origin_sector": o, "destination_sector": d,
                    "run_trips": float(r.run_trips), "base_trips": float(r.base_trips),
                    "delta_trips": float(r.delta), "shift_share": share,
                    "explained_by": sorted(explanation)})
                continue
            sev = evaluate_severity(severity_rules, shift_share=share, explained=False)
            if sev is None:
                continue
            direction = "more" if float(r.delta) > 0 else "fewer"
            line = (f"Trips from sector {o} to sector {d} are {pct(share, 0)} {direction} "
                    f"than in the base ({fmt(r.base_trips)} to {fmt(r.run_trips)})")
            line += ", with no change to land use, roads or transit in either sector."
            cause = ("Demand responded to a change elsewhere (network speeds, "
                     "parameters, or matrix processing) rather than to inputs in these "
                     "sectors.")
            action = ("Trace the change to skims or parameters; compare the base and "
                      "scenario matrices for these sectors before reporting.")
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=Location(type=LocationType.SECTOR, id=f"{o}->{d}",
                                      label=f"Sector {o} to sector {d}"),
                    executive_line=line, likely_cause=cause, suggested_action=action,
                    values={"origin_sector": o, "destination_sector": d,
                            "run_trips": float(r.run_trips), "base_trips": float(r.base_trips),
                            "delta_trips": float(r.delta), "shift_share": share,
                            "explained": False, "explanation": {}, "metric": "trips"},
                    thresholds={"sector_shift_share": shift_share,
                                "min_sector_pair_trips": min_trips,
                                "explain_land_use_share": lu_share},
                    sources=[table_ref(store, "od", "trips"), table_ref(base, "od", "trips")],
                    query=sql, discriminator="sector_pair",
                    method="sector-to-sector DEMAND trips run vs base (all purposes, modes "
                    "and periods); explanation from changes.sector_change_summary",
                )
            )
        if explained_rows:
            n = len(explained_rows)
            biggest = max(explained_rows, key=lambda x: abs(x["delta_trips"]))
            sectors = sorted({s for x in explained_rows for s in x["explained_by"]})
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=Severity.INFO,
                    location=Location(type=LocationType.RUN, id=store.run_id,
                                      label="Sector-to-sector demand"),
                    executive_line=(
                        f"{n} sector-to-sector demand shifts above {pct(shift_share, 0)} are "
                        f"consistent with input changes in sector {', '.join(sectors)}; the "
                        f"largest is {biggest['origin_sector']} to "
                        f"{biggest['destination_sector']} "
                        f"({fmt(biggest['base_trips'])} to {fmt(biggest['run_trips'])} trips)."
                    ),
                    likely_cause="Land use, network or transit inputs changed in the sectors "
                    "concerned, so the demand response is expected.",
                    suggested_action="No action needed if the input changes were intended; "
                    "the per-pair list is in the evidence.",
                    values={"n_explained_shifts": n, "explained_pairs": explained_rows,
                            "metric": "trips"},
                    thresholds={"sector_shift_share": shift_share,
                                "min_sector_pair_trips": min_trips,
                                "explain_land_use_share": lu_share},
                    sources=[table_ref(store, "od", "trips"), table_ref(base, "od", "trips")],
                    query=sql, discriminator="explained_summary",
                    method="sector-to-sector DEMAND trips run vs base; shifts explained by "
                    "changes.sector_change_summary are summarised here",
                )
            )
        return out
