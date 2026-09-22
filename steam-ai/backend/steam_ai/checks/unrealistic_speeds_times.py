"""Congested speeds above free-flow, below a floor, or delays beyond a maximum."""

from __future__ import annotations

from typing import Any

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


class UnrealisticSpeedsTimes(Check):
    check_id = "unrealistic_speeds_times"
    name = "Unrealistic speeds and times"
    description = (
        "Congested speed must not exceed free-flow speed (beyond a small tolerance) nor fall "
        "below a floor, and link delay must stay within a plausible maximum."
    )
    required_tables = {"link_flows", "links"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        floor = float(params.get("min_cong_speed_kph", 5.0))
        ratio = float(params.get("max_speed_over_ffs_ratio", 1.05))
        max_delay = float(params.get("max_delay_s", 900))
        periods = [str(p) for p in params.get("periods", ["AM", "PM"])]
        user_class = str(params.get("user_class", "ALL"))
        sql = f"""
            SELECT f.link_id, f.period, f.volume, f.cong_speed_kph, f.delay_s, f.cong_time_s,
                   l.ffs_kph, l.link_class, l.length_m, f.source_file, f.source_row,
                   f.cong_speed_kph / NULLIF(l.ffs_kph, 0) AS speed_ratio
            FROM link_flows f JOIN links l USING (link_id)
            WHERE f.user_class = '{user_class}' AND f.period IN ({sql_str_list(periods)})
              AND ((f.cong_speed_kph IS NOT NULL AND l.ffs_kph > 0
                    AND f.cong_speed_kph > {ratio} * l.ffs_kph)
                   OR (f.cong_speed_kph IS NOT NULL AND f.cong_speed_kph < {floor})
                   OR (f.delay_s IS NOT NULL AND f.delay_s > {max_delay}))
            ORDER BY f.link_id, f.period
        """
        df = store.query(sql)
        self.rows_examined = int(store.scalar(
            f"SELECT COUNT(*) FROM link_flows WHERE user_class = '{user_class}' "
            f"AND period IN ({sql_str_list(periods)})"
        ) or 0)
        if df.empty:
            return []
        locs = link_locations(store, df["link_id"].unique())
        thresholds = {"min_cong_speed_kph": floor, "max_speed_over_ffs_ratio": ratio,
                      "max_delay_s": max_delay}
        out: list[Finding] = []
        for r in df.itertuples():
            speed = None if r.cong_speed_kph != r.cong_speed_kph else float(r.cong_speed_kph)
            delay = None if r.delay_s != r.delay_s else float(r.delay_s)
            ffs = None if r.ffs_kph != r.ffs_kph else float(r.ffs_kph)
            issues: list[str] = []
            if speed is not None and speed < floor:
                issues.append("speed_below_floor")
            if speed is not None and ffs and speed > ratio * ffs:
                issues.append("speed_above_ffs")
            if delay is not None and delay > max_delay:
                issues.append("delay_outlier")
            if not issues:
                continue
            issue = issues[0]
            sev = evaluate_severity(severity_rules, issue=issue, cong_speed_kph=speed,
                                    ffs_kph=ffs, delay_s=delay, speed_ratio=r.speed_ratio)
            if sev is None:
                continue
            lid = int(r.link_id)
            when = period_label(r.period)
            if issue == "speed_below_floor":
                line = (f"Traffic on link {lid} ({r.link_class}) crawls at "
                        f"{fmt(speed, 1)} km/h in {when}.")
                cause = ("Severe over-capacity or a volume-delay function that collapses at "
                         "high V/C; sometimes a zero-length or zero-speed coding.")
                action = ("Check V/C on this link, the volume-delay parameters for its class, "
                          "and the free-flow speed coding.")
            elif issue == "speed_above_ffs":
                line = (f"Link {lid} ({r.link_class}) shows a congested speed of "
                        f"{fmt(speed)} km/h in {when}, above its free-flow speed of "
                        f"{fmt(ffs)} km/h.")
                cause = ("Free-flow speed coded lower than the speed used in assignment, or "
                         "congested time computed from a different length.")
                action = "Reconcile ffs_kph and the assignment speed/length for this link."
            else:
                line = (f"Vehicles on link {lid} ({r.link_class}) are delayed by "
                        f"{fmt(delay / 60.0, 1)} minutes in {when}.")
                cause = ("Junction delay or volume-delay function producing extreme values, "
                         "usually alongside V/C well above 1.")
                action = "Review junction coding and capacity on this link."
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[lid],
                    executive_line=line, likely_cause=cause, suggested_action=action,
                    values={"issue": issue, "issues": issues, "cong_speed_kph": speed,
                            "ffs_kph": ffs, "delay_s": delay, "volume": r.volume,
                            "speed_ratio": None if r.speed_ratio != r.speed_ratio
                            else float(r.speed_ratio), "link_class": r.link_class},
                    thresholds=thresholds,
                    sources=refs_from_rows(df[(df["link_id"] == lid)
                                              & (df["period"] == r.period)],
                                           "link_flows", "cong_speed_kph"
                                           if issue != "delay_outlier" else "delay_s"),
                    query=sql, period=str(r.period),
                    method="link_flows joined to links; thresholds on speed ratio, floor, delay",
                )
            )
        return out
