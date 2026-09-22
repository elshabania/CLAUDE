"""Proposed measures for Critical and High findings.

Each measure states its estimation method honestly: ``sketch_elasticity`` when
a first-order arithmetic estimate is possible from the finding's own evidence
(e.g. one extra lane changes capacity by capacity/lanes), otherwise
``not_computable``. Nothing here runs the model.
"""

from __future__ import annotations

from typing import Any, Callable

from . import config
from .models import EffectMethod, Finding, Measure, Severity
from .store import RunStore

_ACTIONABLE = {Severity.CRITICAL, Severity.HIGH}


def _measure(
    finding: Finding,
    k: int,
    title: str,
    description: str,
    *,
    effect: str | None = None,
    values: dict[str, float] | None = None,
    method: EffectMethod = EffectMethod.NOT_COMPUTABLE,
    confidence: str = "low",
) -> Measure:
    return Measure(
        measure_id=f"{finding.finding_id}-m{k}",
        title=title,
        description=description,
        estimated_effect=effect,
        effect_values={k2: float(v) for k2, v in (values or {}).items() if v is not None},
        method=method,
        confidence=confidence,
    )


def _num(values: dict[str, Any], key: str) -> float | None:
    v = values.get(key)
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


# --- per-check proposers ------------------------------------------------------------


def _link_volume(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    vc = _num(v, "vc_ratio")
    cap = _num(v, "capacity_vph")
    lanes = _num(v, "lanes")
    out: list[Measure] = []
    if vc is not None and vc >= 0.95 and cap and lanes and lanes > 0:
        per_lane = cap / lanes
        vc_after = vc * lanes / (lanes + 1)
        out.append(_measure(
            f, 1, "Add one lane",
            f"Add a lane to this link, raising capacity from {cap:,.0f} to "
            f"{cap + per_lane:,.0f} veh/h (one lane = {per_lane:,.0f} veh/h).",
            effect=f"V/C falls from {vc:.2f} to about {vc_after:.2f} if demand is unchanged",
            values={"capacity_before_vph": cap, "capacity_after_vph": cap + per_lane,
                    "vc_before": vc, "vc_after": vc_after},
            method=EffectMethod.SKETCH_ELASTICITY, confidence="medium",
        ))
        out.append(_measure(
            f, 2, "Verify capacity coding",
            "Check that lanes and capacity per lane match the link's real cross-section; "
            "an under-coded capacity produces the same symptom as real congestion.",
            confidence="medium",
        ))
    elif v.get("issue") == "volume_too_low":
        out.append(_measure(
            f, 1, "Trace access to the link",
            "Build a path to this link in the assignment network; a one-way flag, missing "
            "turn or disconnected end usually explains near-zero volume.",
        ))
    else:
        out.append(_measure(
            f, 1, "Review link attributes against neighbours",
            "Compare class, speed and capacity with adjacent links of the same class; "
            "correct any outlier attribute and re-assign.",
        ))
    out.append(_measure(
        f, len(out) + 1, "Check for missing parallel routes",
        "Confirm that parallel roads in the corridor are coded and open in this scenario; "
        "a closed or missing alternative concentrates demand here.",
    ))
    return out


def _speeds(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    issue = v.get("issue")
    out = []
    if issue == "speed_above_ffs":
        out.append(_measure(
            f, 1, "Reconcile free-flow speed",
            f"Congested speed {v.get('cong_speed_kph')} km/h exceeds the coded free-flow "
            f"speed {v.get('ffs_kph')} km/h. Correct ffs_kph or the speed used in the "
            "volume-delay function so they agree.",
            confidence="medium",
        ))
    else:
        out.append(_measure(
            f, 1, "Review volume-delay parameters",
            "Check the BPR/conical parameters for this link class; extreme delay or "
            "near-zero speed usually means the curve explodes above V/C 1.2.",
        ))
        out.append(_measure(
            f, 2, "Resolve capacity on this link first",
            "If a V/C finding exists for the same link, fixing it removes this symptom.",
        ))
    return out


def _connectors(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    if v.get("issue") != "connector_on_high_class":
        return [_measure(
            f, 1, "Reconnect the zone closer to the network",
            "Split the zone or add local streets so the connector is shorter than the limit.",
        )]
    link_id = int(f.location.id)
    hours = config.period_hours()
    try:
        flows = store.query(
            "SELECT period, volume FROM link_flows WHERE link_id = ? AND user_class = 'ALL'",
            [link_id],
        )
    except Exception:  # noqa: BLE001 - proposals must never fail the pipeline
        flows = None
    values: dict[str, float] = {}
    effect = None
    method = EffectMethod.NOT_COMPUTABLE
    conf = "low"
    if flows is not None and not flows.empty:
        total = float(flows["volume"].sum())
        peak = flows.loc[flows["volume"].idxmax()]
        peak_hourly = float(peak["volume"]) / float(hours.get(str(peak["period"]), 1.0))
        values = {"connector_volume_all_periods": total,
                  "peak_period_hourly_vph": peak_hourly}
        effect = (f"removes about {total:,.0f} vehicles per day ({peak_hourly:,.0f} veh/h in "
                  f"{peak['period']}) from the {v.get('high_class', 'high-class')} link "
                  f"{v.get('high_class_link')}")
        method = EffectMethod.SKETCH_ELASTICITY
        conf = "medium"
    return [
        _measure(
            f, 1, "Relocate the connector to a local street",
            f"Move connector {link_id} from node {v.get('street_node')} to the nearest "
            "collector or local street node so zone traffic enters via ramps/junctions.",
            effect=effect, values=values, method=method, confidence=conf,
        ),
        _measure(
            f, 2, "Split the zone",
            "If the zone straddles the freeway, split it so each part connects to its own "
            "side of the network.",
        ),
    ]


def _transit_integrity(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    if v.get("issue") != "headway_out_of_range":
        return [_measure(
            f, 1, "Repair the itinerary",
            "Re-route the line through existing nodes and links so consecutive segments "
            "share a node; re-run transit assignment.",
        )]
    mode = str(v.get("mode", ""))
    cfg = (config.checks().get("checks", {}).get("transit_line_integrity", {})
           .get("params", {}))
    lo, hi = cfg.get("headway_min_range", [2, 120])
    mode_max = float((cfg.get("modes_headway_max") or {}).get(mode, hi))
    headway = _num(v, "headway_min")
    cap = _num(v, "vehicle_capacity") or 0.0
    target = mode_max if headway is None or headway > mode_max else float(lo)
    route_km = _route_km(store, f.location.id)
    values: dict[str, float] = {"headway_before_min": headway or 0.0,
                                "headway_after_min": target}
    effect = None
    method = EffectMethod.NOT_COMPUTABLE
    if headway and headway > 0 and cap and route_km:
        seat_km_before = 60.0 / headway * cap * route_km
        seat_km_after = 60.0 / target * cap * route_km
        values.update({"seat_km_per_hour_before": seat_km_before,
                       "seat_km_per_hour_after": seat_km_after, "route_km": route_km})
        effect = (f"seat-km per hour changes from {seat_km_before:,.0f} to "
                  f"{seat_km_after:,.0f}")
        method = EffectMethod.SKETCH_ELASTICITY
    return [
        _measure(
            f, 1, f"Set headway to {target:g} minutes",
            f"Replace the {headway} minute headway with the {mode} limit of {target:g} "
            "minutes (or the intended service frequency).",
            effect=effect, values=values, method=method,
            confidence="medium" if effect else "low",
        ),
        _measure(
            f, 2, "Check the headway unit",
            "A value like this often means seconds or vehicles per hour were exported "
            "instead of minutes.",
        ),
    ]


def _unused_transit(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    headway = _num(v, "headway_min")
    route_km = _route_km(store, f.location.id)
    period = f.evidence.period
    hours = config.period_hours().get(period or "", 1.0)
    values: dict[str, float] = {}
    effect = None
    method = EffectMethod.NOT_COMPUTABLE
    if headway and headway > 0 and route_km:
        veh_km_saved = 0.5 * (60.0 / headway) * route_km * hours
        values = {"headway_before_min": headway, "headway_after_min": headway * 2,
                  "vehicle_km_saved_per_period": veh_km_saved, "route_km": route_km}
        effect = (f"saves about {veh_km_saved:,.0f} vehicle-km in {period} "
                  "(half the current vehicle trips)")
        method = EffectMethod.SKETCH_ELASTICITY
    return [
        _measure(
            f, 1, "Check access to the line",
            "Verify stop flags, walk-access links and the itinerary before changing service: "
            "an unreachable line looks identical to an unwanted one.",
        ),
        _measure(
            f, 2, "Halve the frequency",
            "If the service is genuinely unused, double the headway to release vehicles.",
            effect=effect, values=values, method=method, confidence="low",
        ),
    ]


def _land_use(store: RunStore, f: Finding) -> list[Measure]:
    v = f.evidence.values
    scale = _num(v, "scale_factor")
    modelled, control = _num(v, "modelled"), _num(v, "control")
    if scale is None:
        return [_measure(f, 1, "Populate the land-use variable",
                         "No zonal values exist for this variable and region.")]
    return [
        _measure(
            f, 1, f"Scale {v.get('variable')} by {scale:.3f}",
            f"Multiply {v.get('variable')} in region {v.get('region')} by {scale:.3f} so the "
            f"zonal total ({modelled:,.0f}) matches the control total ({control:,.0f}).",
            effect=f"total becomes {control:,.0f}; trip ends move roughly in proportion",
            values={"scale_factor": scale, "modelled": modelled or 0.0,
                    "control": control or 0.0,
                    "delta": (control or 0.0) - (modelled or 0.0)},
            method=EffectMethod.SKETCH_ELASTICITY, confidence="high",
        ),
        _measure(
            f, 2, "Confirm the control total",
            "Check that the control total is the approved figure for this horizon year.",
        ),
    ]


def _convergence(store: RunStore, f: Finding) -> list[Measure]:
    return [
        _measure(f, 1, "Increase the iteration limit",
                 "Raise the maximum iterations and tighten the gap criterion for this period; "
                 "re-run before interpreting link-level differences."),
        _measure(f, 2, "Fix capacity findings first",
                 "Links with V/C far above 1 slow or prevent convergence."),
    ]


def _generic(title: str, description: str) -> Callable[[RunStore, Finding], list[Measure]]:
    def proposer(store: RunStore, f: Finding) -> list[Measure]:
        return [_measure(f, 1, title, description)]

    return proposer


_PROPOSERS: dict[str, Callable[[RunStore, Finding], list[Measure]]] = {
    "link_volume_outliers": _link_volume,
    "unrealistic_speeds_times": _speeds,
    "centroid_connectors": _connectors,
    "transit_line_integrity": _transit_integrity,
    "unused_transit_services": _unused_transit,
    "land_use_control_totals": _land_use,
    "convergence_and_noise": _convergence,
    "null_and_id_integrity": _generic(
        "Fix the source data and re-export",
        "Fill the missing values or restore the referenced records, then re-export the run."),
    "network_connectivity": _generic(
        "Repair the network coding",
        "Fix the attribute or add the missing link/one-way direction and re-assign."),
    "matrix_sanity": _generic(
        "Rebalance the matrix",
        "Clamp negatives, rebalance productions and attractions, and re-run distribution."),
    "parameter_drift": _generic(
        "Restore the approved value",
        "Reset the parameter to its approved value or get the new value approved."),
    "unexplained_demand_shift": _generic(
        "Trace the shift to its cause",
        "Compare skims and parameters with the base for these sectors before reporting."),
    "trip_length_distribution": _generic(
        "Compare skims with the base",
        "Check DIST/TIME skims and distribution parameters against the base run."),
}


def propose(store: RunStore, findings: list[Finding]) -> list[Finding]:
    """Attach 1-3 measures to each Critical/High finding and return the same list."""
    for f in findings:
        if f.severity not in _ACTIONABLE or f.measures:
            continue
        proposer = _PROPOSERS.get(f.check_id)
        if proposer is None:
            continue
        try:
            f.measures = proposer(store, f)[:3]
        except Exception:  # noqa: BLE001 - a failed proposal must not lose the finding
            f.measures = [_measure(
                f, 1, "Investigate", "A measure could not be computed for this finding.")]
    return findings


def _route_km(store: RunStore, line_id: str) -> float | None:
    """Route length in km from segments joined to links (either direction)."""
    if not (store.has("transit_segments") and store.has("links")):
        return None
    try:
        val = store.scalar(
            """
            WITH e AS (SELECT a_node AS f, b_node AS t, length_m FROM links
                       UNION ALL SELECT b_node, a_node, length_m FROM links)
            SELECT SUM(e.length_m) / 1000.0 FROM transit_segments s
            JOIN e ON e.f = s.from_node AND e.t = s.to_node WHERE s.line_id = ?
            """,
            [line_id],
        )
    except Exception:  # noqa: BLE001
        return None
    return None if val is None else float(val)
