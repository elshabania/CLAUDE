"""Capability registry — the bridge between natural language and the app.

Every action the application can perform is registered here once, with a JSON
Schema for its parameters and a handler that operates on the shared
:class:`~steam_app.state.AppState`.  The GUI buttons and the AI assistant both
call into this same registry, so the bot can do anything a user can and the two
never drift apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from steam_assignment import METHODS
from .state import AppState, DEMAND_SOURCES


@dataclass
class Capability:
    name: str
    description: str
    parameters: dict                 # JSON Schema (object)
    handler: Callable[[AppState, dict], str]

    def to_tool(self) -> dict:
        """Anthropic tool definition."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }


class CapabilityRegistry:
    def __init__(self):
        self._caps: dict[str, Capability] = {}

    def register(self, cap: Capability) -> None:
        self._caps[cap.name] = cap

    def __contains__(self, name) -> bool:
        return name in self._caps

    def get(self, name: str) -> Capability:
        return self._caps[name]

    def names(self) -> list[str]:
        return list(self._caps)

    def tools(self) -> list[dict]:
        return [c.to_tool() for c in self._caps.values()]

    def invoke(self, state: AppState, name: str, params: dict) -> str:
        if name not in self._caps:
            return f"Error: no such capability {name!r}."
        try:
            return self._caps[name].handler(state, params or {})
        except Exception as exc:  # surface errors back to the bot/UI
            return f"Error in {name}: {exc}"


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


def build_registry() -> CapabilityRegistry:
    reg = CapabilityRegistry()

    # ---- data ------------------------------------------------------------
    reg.register(Capability(
        "load_network",
        "Load the road network from a shapefile (.shp) or CSV path.",
        _obj({"path": {"type": "string", "description": "Path to .shp or .csv"}},
             ["path"]),
        lambda s, p: (s.load_network(p["path"]),
                      f"Loaded {s.network.n_links:,} road links and "
                      f"{s.network.n_nodes:,} nodes.")[1],
    ))
    reg.register(Capability(
        "load_zones",
        "Load the land-use / zone CSV (STEAM_landuse_2040.csv format).",
        _obj({"path": {"type": "string"}}, ["path"]),
        lambda s, p: (s.load_zones(p["path"]),
                      f"Loaded {s.zones.n:,} zones "
                      f"({int(s.zones.internal_mask().sum()):,} internal).")[1],
    ))
    reg.register(Capability(
        "load_matrix",
        "Load a long-format origin-destination CSV (origin,destination,trips).",
        _obj({"path": {"type": "string"},
              "hgv": {"type": "boolean", "description": "True for an HGV matrix"}},
             ["path"]),
        lambda s, p: (s.load_matrix(p["path"], bool(p.get("hgv", False))),
                      f"Loaded OD matrix: {s.od.n_pairs:,} pairs, "
                      f"{s.od.total():,.0f} total trips.")[1],
    ))

    # ---- settings --------------------------------------------------------
    reg.register(Capability(
        "set_setting",
        "Set a global setting. Common names: period_factor, demand_scale, "
        "bpr_alpha, bpr_beta, deterrence_beta, value_of_time, working_days, "
        "origin_sample, fw_max_iter, fw_gap_target, barrier_threshold, "
        "max_span_m, target_zone_count.",
        _obj({"name": {"type": "string"}, "value": {"type": "number"}},
             ["name", "value"]),
        lambda s, p: (s.set_setting(p["name"], p["value"]),
                      f"Set {p['name']} = {p['value']}.")[1],
    ))
    reg.register(Capability(
        "set_class_param",
        "Set a per-class capacity or free-flow speed. field is "
        "'cap_per_lane' or 'speed_kmh'; class is one of fwy/ramp/art/coll/"
        "local/rural/junc.",
        _obj({"klass": {"type": "string"}, "field": {"type": "string"},
              "value": {"type": "number"}}, ["klass", "field", "value"]),
        lambda s, p: (s.set_class_param(p["klass"], p["field"], p["value"]),
                      f"Set {p['klass']}.{p['field']} = {p['value']}.")[1],
    ))

    # ---- assignment ------------------------------------------------------
    reg.register(Capability(
        "run_assignment",
        f"Run a traffic assignment. method is one of {METHODS}. "
        f"demand_source is one of {DEMAND_SOURCES}.",
        _obj({"method": {"type": "string", "enum": METHODS},
              "demand_source": {"type": "string", "enum": DEMAND_SOURCES}},
             ["method"]),
        _run_assignment,
    ))
    reg.register(Capability(
        "network_kpis",
        "Report network KPIs from the latest assignment (VHT, VMT, speed, "
        "v/c, delay, over-capacity links).",
        _obj({}),
        _kpis,
    ))
    reg.register(Capability(
        "top_congested_links",
        "List the most congested links by delay from the latest assignment.",
        _obj({"n": {"type": "integer", "description": "How many (default 10)"}}),
        _top_links,
    ))
    reg.register(Capability(
        "connectivity_check",
        "Check network connectivity: components, isolated nodes, zones off the "
        "main network.",
        _obj({}),
        lambda s, p: _fmt_dict(s.connectivity()),
    ))
    reg.register(Capability(
        "export_links",
        "Export per-link assignment results to a CSV path.",
        _obj({"path": {"type": "string"}}, ["path"]),
        lambda s, p: (s.export_links(p["path"]), f"Exported links to {p['path']}.")[1],
    ))

    # ---- scenario --------------------------------------------------------
    reg.register(Capability(
        "upgrade_link",
        "Scenario edit: add lanes to a link (by its OBJECTID link id).",
        _obj({"link_id": {"type": "integer"},
              "add_lanes": {"type": "integer", "description": "default 1"}},
             ["link_id"]),
        lambda s, p: (s.upgrade_link(int(p["link_id"]), int(p.get("add_lanes", 1))),
                      f"Queued: +{int(p.get('add_lanes',1))} lane(s) on link "
                      f"{int(p['link_id'])}.")[1],
    ))
    reg.register(Capability(
        "run_scenario",
        "Run the queued scenario edits against a fresh baseline and report the "
        "before/after difference and cost-benefit.",
        _obj({"method": {"type": "string", "enum": METHODS},
              "demand_source": {"type": "string", "enum": DEMAND_SOURCES}}),
        _run_scenario,
    ))
    reg.register(Capability(
        "undo_edit", "Undo the last scenario edit.", _obj({}),
        lambda s, p: ("undone" if s.undo() else "nothing to undo"),
    ))

    # ---- recommendation --------------------------------------------------
    reg.register(Capability(
        "recommend",
        "Generate and evaluate network-improvement recommendations, ranked by "
        "VHT saved and benefit-cost ratio.",
        _obj({"method": {"type": "string", "enum": METHODS},
              "demand_source": {"type": "string", "enum": DEMAND_SOURCES},
              "n_eval": {"type": "integer", "description": "candidates to reassign"}}),
        _recommend,
    ))

    # ---- aggregation -----------------------------------------------------
    reg.register(Capability(
        "aggregate_zones",
        "Aggregate zones into a coarser zoning system with barrier and span "
        "rules. barrier_threshold: fwy|art|coll. max_span_m metres. "
        "target_zone_count: desired number of clusters. method: single|dynamic.",
        _obj({"target_zone_count": {"type": "integer"},
              "barrier_threshold": {"type": "string", "enum": ["fwy", "art", "coll"]},
              "max_span_m": {"type": "number"},
              "method": {"type": "string", "enum": ["single", "dynamic"]},
              "keys": {"type": "array", "items": {"type": "string"},
                       "description": "homogeneity keys, e.g. district, areatype"}}),
        _aggregate,
    ))
    reg.register(Capability(
        "aggregation_qa",
        "Run a QA audit of the latest aggregation (non-contiguous and "
        "barrier-spanning clusters).",
        _obj({}),
        lambda s, p: _fmt_dict(s.aggregation_qa()),
    ))
    reg.register(Capability(
        "export_correspondence",
        "Export the old_zone,new_zone correspondence CSV for the latest "
        "aggregation.",
        _obj({"path": {"type": "string"}}, ["path"]),
        lambda s, p: (s.export_correspondence(p["path"]),
                      f"Exported correspondence to {p['path']}.")[1],
    ))
    reg.register(Capability(
        "export_aggregated_od",
        "Collapse the loaded OD matrix to the new zoning and export it to CSV.",
        _obj({"path": {"type": "string"}}, ["path"]),
        lambda s, p: (s.export_aggregated_od(p["path"]),
                      f"Exported aggregated OD to {p['path']}.")[1],
    ))
    reg.register(Capability(
        "export_geojson",
        "Export the new cluster polygons (convex hulls) to GeoJSON.",
        _obj({"path": {"type": "string"}}, ["path"]),
        lambda s, p: (s.export_geojson(p["path"]),
                      f"Exported GeoJSON to {p['path']}.")[1],
    ))

    # ---- status ----------------------------------------------------------
    reg.register(Capability(
        "status",
        "Summarise the current application state: loaded data, settings, last "
        "assignment and aggregation.",
        _obj({}),
        _status,
    ))
    return reg


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def _run_assignment(s: AppState, p: dict) -> str:
    method = p.get("method", METHODS[3])
    source = p.get("demand_source", DEMAND_SOURCES[0]
                   if s.od is not None else DEMAND_SOURCES[1])
    res = s.run_assignment(method, source)
    k = s.kpis()
    gap = f", final gap {res.gap_history[-1]:.2e}" if res.gap_history else ""
    return (f"Ran {method} on '{source}' ({res.iterations} iters{gap}). "
            f"VHT {k.vht:,.0f} veh-h, VMT {k.vmt:,.0f} veh-km, "
            f"avg speed {k.avg_speed:.1f} km/h, {k.over_capacity:,} "
            f"over-capacity links.")


def _kpis(s: AppState, p: dict) -> str:
    k = s.kpis()
    return "; ".join(f"{label}: {val}" for label, val in k.as_rows())


def _top_links(s: AppState, p: dict) -> str:
    n = int(p.get("n", 10))
    rows = s.top_links(n)
    out = [f"Top {len(rows)} congested links:"]
    for r in rows:
        out.append(f"  link {r['link_id']} ({r['class']}, {r['lanes']} ln): "
                   f"vol {r['volume']:.0f}/cap {r['capacity']:.0f} "
                   f"v/c {r['vc']:.2f} LOS {r['los']} delay {r['delay_vehh']:.1f} veh-h")
    return "\n".join(out)


def _run_scenario(s: AppState, p: dict) -> str:
    method = p.get("method", METHODS[3])
    source = p.get("demand_source", DEMAND_SOURCES[0]
                   if s.od is not None else DEMAND_SOURCES[1])
    if not (s.editor and s.editor.edits):
        return "No scenario edits queued. Use upgrade_link or add_road first."
    diff = s.run_scenario(method, source)
    return (f"Scenario vs baseline: ΔVHT {diff.vht_delta:+,.0f} veh-h, "
            f"ΔVMT {diff.vmt_delta:+,.0f} veh-km, Δover-capacity "
            f"{diff.overcap_delta:+d} links. Annual cost-benefit "
            f"{diff.cost_benefit:+,.0f}.")


def _recommend(s: AppState, p: dict) -> str:
    method = p.get("method", METHODS[3])
    source = p.get("demand_source", DEMAND_SOURCES[0]
                   if s.od is not None else DEMAND_SOURCES[1])
    ev, programme = s.recommend(method, source, int(p.get("n_eval", 8)))
    out = ["Top recommendations (measured VHT saved, BCR):"]
    for r in ev[:5]:
        out.append(f"  {r.name}: {r.measured_vht_saved:,.1f} veh-h, "
                   f"BCR {r.bcr:.3g}")
    out.append(f"Suggested programme: {len(programme)} non-overlapping projects.")
    return "\n".join(out)


def _aggregate(s: AppState, p: dict) -> str:
    overrides = {}
    for k in ("target_zone_count", "barrier_threshold", "max_span_m", "method"):
        if k in p and p[k] is not None:
            overrides[k] = p[k]
    if "keys" in p and p["keys"]:
        overrides["keys"] = tuple(p["keys"])
    if "target_zone_count" in overrides:
        overrides["target_zone_count"] = int(overrides["target_zone_count"])
    res = s.aggregate_zones(**overrides)
    st = aggregation_stats(s.zones, res)
    return (f"Aggregated {st['zones_in']:,} zones into {st['clusters_out']:,} "
            f"clusters ({st['merge_steps']:,} merges; mean size "
            f"{st['mean_cluster_size']:.2f}, max {st['max_cluster_size']}).")


def _status(s: AppState, p: dict) -> str:
    parts = []
    parts.append(f"Network: {s.network.n_links:,} links" if s.network else "Network: none")
    parts.append(f"Zones: {s.zones.n:,}" if s.zones else "Zones: none")
    parts.append(f"OD: {s.od.n_pairs:,} pairs" if s.od is not None else "OD: none")
    if s.editor and s.editor.edits:
        parts.append(f"Queued edits: {len(s.editor.edits)}")
    if s.result:
        parts.append(f"Last assignment: {s.result.method}")
    if s.aggregation:
        parts.append(f"Last aggregation: {s.aggregation.n_clusters} clusters")
    parts.append(f"period_factor={s.settings.period_factor}, "
                 f"demand_scale={s.settings.demand_scale}, "
                 f"bpr_alpha={s.settings.bpr_alpha}, bpr_beta={s.settings.bpr_beta}")
    return " | ".join(parts)


def _fmt_dict(d: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in d.items())


# Need aggregation_stats here.
from steam_viewer.aggregate import aggregation_stats  # noqa: E402
