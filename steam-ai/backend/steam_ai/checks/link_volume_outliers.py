"""Link volume outliers: over capacity, statistical outliers, implausibly low."""

from __future__ import annotations

from typing import Any

from .. import config
from ..models import Finding
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    link_locations,
    make_finding,
    period_label,
    refs_from_rows,
    sql_str_list,
)

# Consistency constant so that MAD estimates the standard deviation for normal data.
_MAD_K = 1.4826


class LinkVolumeOutliers(Check):
    check_id = "link_volume_outliers"
    name = "Link volume outliers"
    description = (
        "Flags links whose assigned volume exceeds capacity (V/C), is a robust-z outlier "
        "relative to links of the same class, area type and period, or is implausibly low "
        "compared with its peers. Connectors are excluded."
    )
    required_tables = {"link_flows", "links"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        user_class = str(params.get("user_class", "ALL"))
        periods = [str(p) for p in params.get("periods", ["AM", "PM"])]
        z_thr = float(params.get("zscore_threshold", 3.0))
        min_n = int(params.get("min_group_size", 20))
        low_share = float(params.get("low_volume_share_of_group_median", 0.02))
        vc_medium = float(params.get("vc_medium", 0.95))
        exclude = [str(c) for c in params.get("exclude_link_classes", ["CONN"])]
        hours = config.period_hours()
        hours_values = ", ".join(
            f"('{p}', {float(hours.get(p, 1.0))})" for p in periods
        ) or "('', 1.0)"

        sql = f"""
            WITH ph(period, hours) AS (VALUES {hours_values}),
            f AS (
                SELECT f.link_id, f.period, f.volume,
                       COALESCE(f.vc_ratio,
                                f.volume / NULLIF(l.capacity_vph * ph.hours, 0)) AS vc_ratio,
                       l.link_class, l.area_type, l.capacity_vph, l.lanes,
                       f.source_file, f.source_row
                FROM link_flows f
                JOIN links l USING (link_id)
                JOIN ph ON ph.period = f.period
                WHERE f.user_class = '{user_class}' AND f.volume IS NOT NULL
                  AND l.link_class NOT IN ({sql_str_list(exclude)})
            ),
            g AS (
                SELECT link_class, area_type, period, COUNT(*) AS n,
                       MEDIAN(LN(volume + 1)) AS med_log, MEDIAN(volume) AS med_vol
                FROM f GROUP BY 1, 2, 3
            ),
            d AS (
                SELECT f.*, g.n, g.med_log, g.med_vol, LN(f.volume + 1) - g.med_log AS dev
                FROM f JOIN g USING (link_class, area_type, period)
            ),
            m AS (
                SELECT link_class, area_type, period, MEDIAN(ABS(dev)) AS mad
                FROM d GROUP BY 1, 2, 3
            ),
            scored AS (
                SELECT d.*, m.mad,
                       CASE WHEN d.n >= {min_n} AND m.mad > 0
                            THEN d.dev / ({_MAD_K} * m.mad) END AS zscore,
                       (d.n >= {min_n} AND d.capacity_vph > 0 AND d.med_vol > 0
                        AND d.volume < {low_share} * d.med_vol) AS too_low
                FROM d JOIN m USING (link_class, area_type, period)
            )
            SELECT * FROM scored
            WHERE vc_ratio >= {vc_medium} OR ABS(zscore) >= {z_thr} OR too_low
            ORDER BY vc_ratio DESC NULLS LAST, ABS(zscore) DESC NULLS LAST
        """
        df = store.query(sql)
        self.rows_examined = int(store.scalar(
            f"SELECT COUNT(*) FROM link_flows WHERE user_class = '{user_class}' "
            f"AND period IN ({sql_str_list(periods)})"
        ) or 0)
        if df.empty:
            return []
        locs = link_locations(store, df["link_id"].unique())
        thresholds = {
            "vc_critical": params.get("vc_critical"), "vc_high": params.get("vc_high"),
            "vc_medium": vc_medium, "zscore_threshold": z_thr, "min_group_size": min_n,
            "low_volume_share_of_group_median": low_share,
        }
        out: list[Finding] = []
        for r in df.itertuples():
            vc = None if r.vc_ratio != r.vc_ratio else float(r.vc_ratio)
            z = None if r.zscore is None or r.zscore != r.zscore else float(r.zscore)
            sev = evaluate_severity(
                severity_rules, vc_ratio=vc, zscore=z,
                abs_zscore=abs(z) if z is not None else None, too_low=bool(r.too_low),
                volume=float(r.volume),
            )
            if sev is None:
                continue
            lid = int(r.link_id)
            when = period_label(r.period)
            if vc is not None and vc >= vc_medium:
                issue = "over_capacity"
                line = (f"Link {lid} ({r.link_class}) carries {fmt(r.volume)} vehicles in "
                        f"{when}, {fmt(vc, 2)} times its capacity.")
                cause = ("Demand concentrated on this link because parallel routes are missing "
                         "or slow, or the capacity/lanes are under-coded.")
                action = ("Check lanes and capacity coding on this link and its competitors; "
                          "compare with counts if available.")
            elif bool(r.too_low):
                issue = "volume_too_low"
                line = (f"Link {lid} ({r.link_class}) carries only {fmt(r.volume)} vehicles in "
                        f"{when}, against a typical {fmt(r.med_vol)} for similar links.")
                cause = ("Link is effectively unreachable (one-way coding, missing turn, "
                         "or a disconnected end), or a parallel link carries its traffic.")
                action = "Trace the path to this link and check one-way and turn coding."
            else:
                issue = "statistical_outlier"
                hi_lo = "far above" if (z or 0) > 0 else "far below"
                line = (f"Link {lid} ({r.link_class}, {r.area_type}) carries {fmt(r.volume)} "
                        f"vehicles in {when}, {hi_lo} similar links "
                        f"(typical {fmt(r.med_vol)}).")
                cause = ("Attribute mis-coding (class, speed or capacity) making the link "
                         "unusually attractive or unattractive.")
                action = "Review link attributes against neighbouring links of the same class."
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[lid],
                    executive_line=line, likely_cause=cause, suggested_action=action,
                    values={"issue": issue, "volume": float(r.volume), "vc_ratio": vc,
                            "zscore": z, "group_median_volume": float(r.med_vol),
                            "group_size": int(r.n), "link_class": r.link_class,
                            "area_type": r.area_type, "capacity_vph": r.capacity_vph,
                            "lanes": None if r.lanes is None or r.lanes != r.lanes
                            else int(r.lanes), "too_low": bool(r.too_low)},
                    thresholds=thresholds,
                    sources=refs_from_rows(df[(df["link_id"] == lid)
                                              & (df["period"] == r.period)],
                                           "link_flows", "volume"),
                    query=sql, period=str(r.period),
                    method="V/C from link_flows; robust z = (ln(v+1) - median) / (1.4826 MAD) "
                    "within link_class x area_type x period",
                )
            )
        return out
