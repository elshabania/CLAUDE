"""Trip length distribution per purpose x mode versus the base run (or a reference)."""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import Check, SkipCheck, evaluate_severity, fmt, make_finding, pct, table_ref


class TripLengthDistribution(Check):
    check_id = "trip_length_distribution"
    name = "Trip length distribution"
    description = (
        "Trip-weighted mean distance (DIST skim) per purpose and mode compared with the base "
        "run, or with reference means from config when there is no base. The binned "
        "distribution is stored in the evidence for charting."
    )
    required_tables = {"od", "skims"}
    needs_base = True

    def base_optional_with(self, params: dict[str, Any]) -> bool:
        return bool(params.get("reference_mean_km"))

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        bins = [float(b) for b in params.get("distance_bins_km", [0, 2, 5, 10, 20, 40, 80, 200])]
        unit_factor = 0.001 if str(params.get("skim_dist_units", "km")).lower() == "m" else 1.0
        max_share = float(params.get("max_mean_diff_share", 0.15))
        max_share_high = float(params.get("max_mean_diff_share_high", 0.30))
        reference: dict[str, Any] = params.get("reference_mean_km") or {}
        if base is None and not reference:
            raise SkipCheck("no base run and no reference_mean_km configured")

        mean_sql, bin_sql = _sqls(bins, unit_factor)
        run_mean = store.query(mean_sql)
        run_bins = store.query(bin_sql)
        self.rows_examined = int(run_mean["n_cells"].sum()) if not run_mean.empty else 0
        if run_mean.empty:
            self.message = "no DEMAND cells matched a DIST skim (mode/period/zone mismatch)"
            return []
        if base is not None:
            base_mean = base.query(mean_sql)
            base_bins = base.query(bin_sql)
            comp = run_mean.merge(base_mean, on=["purpose", "mode"], how="left",
                                  suffixes=("", "_base"))
            comparison = f"base run {base.run_id}"
        else:
            comp = run_mean.copy()
            comp["mean_km_base"] = [
                _ref_lookup(reference, p, m)
                for p, m in zip(comp["purpose"], comp["mode"], strict=True)
            ]
            comp["trips_base"] = None
            base_bins = pd.DataFrame(columns=run_bins.columns)
            comparison = "configured reference means"

        out: list[Finding] = []
        for r in comp.itertuples():
            base_val = None if r.mean_km_base is None or pd.isna(r.mean_km_base) \
                else float(r.mean_km_base)
            if base_val is None or base_val == 0:
                continue
            diff_share = abs(float(r.mean_km) - base_val) / base_val
            sev = evaluate_severity(severity_rules, mean_diff_share=diff_share,
                                    purpose=r.purpose, mode=r.mode)
            if sev is None:
                continue
            rb = run_bins[(run_bins["purpose"] == r.purpose) & (run_bins["mode"] == r.mode)]
            bb = base_bins[(base_bins["purpose"] == r.purpose) & (base_bins["mode"] == r.mode)]
            direction = "longer" if float(r.mean_km) > base_val else "shorter"
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=Location(type=LocationType.MATRIX, id=f"{r.purpose}/{r.mode}",
                                      label=f"Trip lengths {r.purpose} {r.mode}"),
                    executive_line=(
                        f"{r.purpose} {r.mode} trips average {fmt(r.mean_km, 1)} km, "
                        f"{pct(diff_share, 1)} {direction} than the {fmt(base_val, 1)} km "
                        f"in the {comparison}."
                    ),
                    likely_cause="Changed distribution parameters, skims (network speeds or "
                    "costs) or zone system rather than a genuine land-use effect.",
                    suggested_action="Compare the DIST/TIME skims and the distribution "
                    "parameters with the base before accepting the result.",
                    values={"mean_km": float(r.mean_km), "mean_km_base": base_val,
                            "mean_diff_share": diff_share, "trips": float(r.trips),
                            "trips_base": None if r.trips_base is None or pd.isna(r.trips_base)
                            else float(r.trips_base),
                            "bins_km": bins,
                            "run_share": _shares(rb, len(bins)),
                            "base_share": _shares(bb, len(bins)),
                            "comparison": comparison},
                    thresholds={"max_mean_diff_share": max_share,
                                "max_mean_diff_share_high": max_share_high},
                    sources=[table_ref(store, "od", "trips"),
                             table_ref(store, "skims", "value")],
                    query=mean_sql, discriminator="mean_diff",
                    method="trip-weighted mean of DIST skim over DEMAND cells per purpose x mode",
                )
            )
        return out


def _sqls(bins: list[float], unit_factor: float) -> tuple[str, str]:
    join = """
        FROM od o JOIN skims s
          ON s.skim_kind = 'DIST' AND s.mode = o.mode AND s.period = o.period
         AND s.origin = o.origin AND s.destination = o.destination
    """
    where = "WHERE o.matrix_kind = 'DEMAND' AND o.trips > 0"
    mean_sql = f"""
        SELECT o.purpose, o.mode, COUNT(*) AS n_cells, SUM(o.trips) AS trips,
               SUM(o.trips * s.value * {unit_factor}) / NULLIF(SUM(o.trips), 0) AS mean_km
        {join}
        {where}
        GROUP BY 1, 2 ORDER BY 1, 2
    """
    edges = list(bins) + [1e12]
    values = ", ".join(f"({i}, {lo}, {hi})" for i, (lo, hi) in
                       enumerate(zip(edges, edges[1:], strict=False)))
    bin_sql = f"""
        WITH b(bin_idx, lo, hi) AS (VALUES {values})
        SELECT o.purpose, o.mode, b.bin_idx, SUM(o.trips) AS trips
        {join}
        JOIN b ON s.value * {unit_factor} >= b.lo AND s.value * {unit_factor} < b.hi
        {where}
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
    """
    return mean_sql, bin_sql


def _shares(df: pd.DataFrame, n_bins: int) -> list[float]:
    out = [0.0] * n_bins
    if df is None or df.empty:
        return out
    total = float(df["trips"].sum())
    if total <= 0:
        return out
    for r in df.itertuples():
        idx = int(r.bin_idx)
        if 0 <= idx < n_bins:
            out[idx] = float(r.trips) / total
    return out


def _ref_lookup(reference: dict[str, Any], purpose: str, mode: str) -> float | None:
    for key in (f"{purpose}/{mode}", f"{purpose}|{mode}", purpose):
        if key in reference:
            try:
                return float(reference[key])
            except (TypeError, ValueError):
                return None
    return None
