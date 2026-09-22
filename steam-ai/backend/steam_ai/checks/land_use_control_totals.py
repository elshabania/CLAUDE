"""Land-use totals versus control totals, per variable and region."""

from __future__ import annotations

from typing import Any

from ..models import Finding
from ..store import RunStore
from .base import Check, evaluate_severity, fmt, make_finding, pct, refs_from_rows, run_location


class LandUseControlTotals(Check):
    check_id = "land_use_control_totals"
    name = "Land-use control totals"
    description = (
        "The zonal land-use inputs summed over all zones (region ALL) or over a region must "
        "match the published control totals within tolerance."
    )
    required_tables = {"land_use", "control_totals", "zones"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        tolerance = float(params.get("tolerance_share", 0.02))
        sql = """
            WITH by_region AS (
                SELECT l.variable, COALESCE(z.region, 'UNKNOWN') AS region,
                       SUM(l.value) AS modelled, COUNT(*) AS n_rows
                FROM land_use l LEFT JOIN zones z USING (zone_id)
                GROUP BY 1, 2
            ),
            all_regions AS (
                SELECT variable, 'ALL' AS region, SUM(value) AS modelled, COUNT(*) AS n_rows
                FROM land_use GROUP BY 1
            ),
            modelled AS (SELECT * FROM by_region UNION ALL SELECT * FROM all_regions)
            SELECT c.variable, c.region, c.value AS control, COALESCE(m.modelled, 0) AS modelled,
                   COALESCE(m.n_rows, 0) AS n_rows, c.source_file, c.source_row,
                   ABS(COALESCE(m.modelled, 0) - c.value) / NULLIF(ABS(c.value), 0)
                       AS abs_diff_share
            FROM control_totals c LEFT JOIN modelled m USING (variable, region)
            ORDER BY c.variable, c.region
        """
        df = store.query(sql)
        self.rows_examined = int(df["n_rows"].sum()) if not df.empty else 0
        out: list[Finding] = []
        for r in df.itertuples():
            share = None if r.abs_diff_share is None or r.abs_diff_share != r.abs_diff_share \
                else float(r.abs_diff_share)
            if share is None and float(r.control) == 0 and float(r.modelled) != 0:
                share = float("inf")
            sev = evaluate_severity(severity_rules, abs_diff_share=share,
                                    variable=r.variable, region=r.region)
            if sev is None:
                continue
            scale = (float(r.control) / float(r.modelled)) if float(r.modelled) else None
            direction = "above" if float(r.modelled) > float(r.control) else "below"
            where = "across all zones" if r.region == "ALL" else f"in region {r.region}"
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=run_location(store, f"{r.variable} / {r.region}"),
                    executive_line=(
                        f"Total {_var_label(r.variable)} {where} is {fmt(r.modelled)}, "
                        f"{pct(share, 1)} {direction} the control total of {fmt(r.control)}."
                    ),
                    likely_cause="Zonal land-use file not rescaled to the latest control "
                    "totals, or zones missing/duplicated in the land-use file.",
                    suggested_action=(
                        f"Scale {r.variable} {where} by {fmt(scale, 3)} to match the control "
                        "total, or confirm the control total is current."
                        if scale else "Populate the land-use variable for this region."
                    ),
                    values={"variable": r.variable, "region": r.region,
                            "modelled": float(r.modelled), "control": float(r.control),
                            "abs_diff_share": share, "scale_factor": scale,
                            "land_use_rows": int(r.n_rows)},
                    thresholds={"tolerance_share": tolerance,
                                "severity_bands": [rule["when"] for rule in severity_rules]},
                    sources=refs_from_rows(df[(df["variable"] == r.variable)
                                              & (df["region"] == r.region)],
                                           "control_totals", "value"),
                    query=sql, discriminator=f"{r.variable}|{r.region}",
                    method="SUM(land_use.value) per variable x region vs control_totals",
                )
            )
        return out


def _var_label(variable: str) -> str:
    labels = {"POP": "population", "EMP_TOTAL": "employment", "EMP_RETAIL": "retail employment",
              "STUDENTS": "students", "HOTEL_ROOMS": "hotel rooms"}
    return labels.get(str(variable), str(variable).replace("_", " ").lower())
