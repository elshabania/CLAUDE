"""Typed command schema + dispatcher (spec section 5).

Every UI action and every copilot instruction becomes one of these commands.
``dispatch`` validates params, runs the engine, mutates :class:`AppState`, and
returns a JSON-serialisable result dict. A ``progress`` callback streams
iteration events (used by the WebSocket channel and the copilot narration).
"""
from __future__ import annotations

from typing import Callable, Optional

import numpy as np

from .state import AppState
from .config import Params
from .data.network import load_network
from .data.zones import load_zones
from .data.matrix import load_matrix
from .data import demo
from .engine.assignment import assign, Demand
from .engine import gravity, metrics, aggregation

# JSON schema for the command set; also handed to the optional LLM as tools.
COMMAND_SCHEMA = {
    "load_network": {"path": str},
    "load_zones": {"path": str},
    "load_matrix": {"path": str},
    "load_demo": {},
    "set_params": {"alpha": float, "beta": float, "vot": float, "days": int,
                   "period": str, "beta_grav": float, "growth": float,
                   "cap": dict, "speed": dict},
    "build_gravity_demand": {"r_pop": float, "r_wkr": float, "r_stu": float,
                             "a_ret": float, "a_off": float, "a_ind": float,
                             "a_sch": float, "beta": float, "furness": bool},
    "run_assignment": {"method": str, "demand": str, "period": str,
                       "sample": int, "growth": float},
    "colour_by": {"mode": str},
    "recommend": {"depth": str, "greedy": bool},
    "aggregate": {"target": int, "barrier": str, "max_span_m": float,
                  "keys": list},
    "export": {"what": str, "path": str},
    "query": {"metric": str},
    "goto_workspace": {"name": str},
    "fit_view": {},
    "zoom_to": {"link_id": int, "zone_id": int},
}

ProgressFn = Callable[[dict], None]


class CommandError(Exception):
    pass


def dispatch(state: AppState, command: str, params: dict,
             progress: Optional[ProgressFn] = None) -> dict:
    params = params or {}
    fn = _HANDLERS.get(command)
    if fn is None:
        raise CommandError(f"Unknown command: {command}")
    return fn(state, params, progress)


# --------------------------------------------------------------------------- #
#  handlers
# --------------------------------------------------------------------------- #
def _load_network(state, p, _):
    net = load_network(p["path"], state.params)
    state.set_network(net)
    return {"ok": True, "n_links": net.n_links, "n_nodes": state.graph.n_nodes}


def _load_zones(state, p, _):
    state.set_zones(load_zones(p["path"]))
    return {"ok": True, "n_zones": state.zones.n_zones,
            "n_routable": state.zones.n_routable}


def _load_matrix(state, p, _):
    state.set_matrix(load_matrix(p["path"]))
    return {"ok": True, "cells": int(state.matrix.trips.shape[0]),
            "total_trips": state.matrix.total}


def _load_demo(state, p, _):
    state.set_network(demo.demo_network(state.params))
    state.set_zones(demo.demo_zones())
    state.set_matrix(demo.demo_matrix())
    return {"ok": True, "demo": True, "n_links": state.network.n_links,
            "n_zones": state.zones.n_zones}


def _set_params(state, p, _):
    mapping = {"days": "working_days", "cap": "cap_per_lane", "speed": "speed_kmh"}
    norm = {mapping.get(k, k): v for k, v in p.items()}
    state.params.update(**norm)
    # capacity/speed edits change link attributes; rebuild derived fields
    if state.network is not None and ("cap_per_lane" in norm or "speed_kmh" in norm):
        from .data.network import _derive_capacity_and_time
        net = state.network
        net.capacity, net.free_flow_time_s = _derive_capacity_and_time(
            net.klass, net.lanes, net.length_m, state.params)
        state.graph = None
        state.set_network(net)
    return {"ok": True, "params": state.params.to_dict()}


def _demand_index(state, demand_kind: str):
    """Return (o_node, d_node, trips, label) for the requested demand source."""
    p = state.params
    if demand_kind == "od":
        if state.matrix is None:
            raise CommandError("No OD matrix loaded")
        oi, di, tr = state.matrix.to_index(state.zone_id_to_index)
        o = state.zones.node[oi]
        d = state.zones.node[di]
        valid = (o >= 0) & (d >= 0)
        scale = p.period_factor() * p.growth
        return o[valid], d[valid], tr[valid] * scale, "OD matrix"
    if demand_kind == "gravity":
        o, d, t, _ = gravity.build_gravity_demand(state.zones, state.graph, p)
        return o, d, t * (p.period_factor() * p.growth), "gravity"
    if demand_kind == "ones":
        o, d, t = gravity.all_ones_demand(state.zones)
        return o, d, t, "all-ones"
    raise CommandError(f"Unknown demand source: {demand_kind}")


def _build_gravity_demand(state, p, _):
    _require_zones(state)
    state.params.update(**{k: v for k, v in p.items()
                           if k in ("r_pop", "r_wkr", "r_stu", "a_ret", "a_off",
                                    "a_ind", "a_sch")})
    if "beta" in p:
        state.params.beta_grav = p["beta"]
    o, d, t, total = gravity.build_gravity_demand(
        state.zones, state.graph, state.params, furness=p.get("furness", False))
    state._gravity_cache = (o, d, t)
    return {"ok": True, "total_productions": total, "od_pairs": int(len(t))}


def _run_assignment(state, p, progress):
    _require_network(state)
    method = p.get("method", "fw")
    if "period" in p:
        state.params.period = p["period"]
    if "growth" in p:
        state.params.growth = p["growth"]
    sample = int(p.get("sample", state.params.origin_sample))
    o, d, t, label = _demand_index(state, p.get("demand", "od"))
    if len(t) == 0:
        raise CommandError("Demand is empty after mapping to nodes")
    dem = Demand.from_index(o, d, t, state.graph.n_nodes, sample=sample, scale=1.0)
    res = assign(method, state.network, state.graph, dem, state.params, progress)
    state.last_result = res
    k = metrics.kpis(res)
    return {"ok": True, "kpis": k, "demand": label, "total_trips": dem.total,
            "gap_history": res.gap_history, "iterations": res.iterations}


def _colour_by(state, p, _):
    return {"ok": True, "mode": p.get("mode", "volume")}


def _aggregate(state, p, _):
    _require_zones(state)
    res = aggregation.aggregate(
        state.zones, state.network,
        target=int(p.get("target", 1800)),
        barrier=p.get("barrier", "coll"),
        max_span_m=float(p.get("max_span_m", 6000.0)),
        keys=p.get("keys"),
    )
    state.aggregation = res
    return {"ok": True, "stats": res.stats, "n_clusters": res.n_clusters,
            "qa_flags": res.qa_flags}


def _query(state, p, _):
    metric = p.get("metric", "vht")
    if metric == "zone_count":
        n = state.zones.n_routable if state.zones else 0
        return {"ok": True, "metric": metric, "value": n}
    if state.last_result is None and metric in (
            "vht", "vmt", "avg_speed", "over_capacity", "gap"):
        raise CommandError("Run an assignment first")
    if metric == "top_links":
        return {"ok": True, "metric": metric,
                "value": metrics.top_congested(
                    state.last_result, state.network.object_id, 10)}
    k = metrics.kpis(state.last_result) if state.last_result else {}
    key = {"vht": "vht", "vmt": "vmt", "avg_speed": "avg_speed_kmh",
           "over_capacity": "over_capacity", "gap": "final_gap"}.get(metric)
    return {"ok": True, "metric": metric, "value": k.get(key)}


def _export(state, p, _):
    what = p.get("what")
    path = p.get("path", f"{what}.csv")
    if what == "link_csv" and state.last_result is not None:
        _export_links(state, path)
    elif what == "correspondence" and state.aggregation is not None:
        _export_correspondence(state, path)
    else:
        raise CommandError(f"Nothing to export for '{what}'")
    return {"ok": True, "path": path}


def _export_links(state, path):
    res, net = state.last_result, state.network
    vc = res.vc
    los = metrics.los_band(vc)
    with open(path, "w") as fh:
        fh.write("link_id,class,lanes,volume,capacity,vc,los,congested_time_s\n")
        for i in range(net.n_links):
            fh.write(f"{int(net.object_id[i])},{net.class_name(net.klass[i])},"
                     f"{int(net.lanes[i])},{res.volume[i]:.2f},{res.capacity[i]:.0f},"
                     f"{vc[i]:.3f},{metrics.LOS_LABELS[los[i]]},{res.cost[i]:.1f}\n")


def _export_correspondence(state, path):
    agg = state.aggregation
    with open(path, "w") as fh:
        fh.write("old_zone,new_zone\n")
        for zid, cid in sorted(agg.cluster_of_zone.items()):
            fh.write(f"{zid},{cid}\n")


def _goto(state, p, _):
    return {"ok": True, "workspace": p.get("name", "network")}


def _fit_view(state, p, _):
    if state.network is None:
        return {"ok": True}
    return {"ok": True, "bounds": state.network.bounds()}


def _zoom_to(state, p, _):
    return {"ok": True, **p}


def _recommend(state, p, _):
    # Placeholder for the recommendation engine (deferred beyond the slice).
    return {"ok": True, "note": "recommendation engine not yet wired in slice",
            "depth": p.get("depth", "quick")}


def _require_network(state):
    if not state.ready:
        raise CommandError("No network loaded")


def _require_zones(state):
    _require_network(state)
    if state.zones is None:
        raise CommandError("No zones loaded")


_HANDLERS = {
    "load_network": _load_network,
    "load_zones": _load_zones,
    "load_matrix": _load_matrix,
    "load_demo": _load_demo,
    "set_params": _set_params,
    "build_gravity_demand": _build_gravity_demand,
    "run_assignment": _run_assignment,
    "colour_by": _colour_by,
    "aggregate": _aggregate,
    "query": _query,
    "export": _export,
    "recommend": _recommend,
    "goto_workspace": _goto,
    "fit_view": _fit_view,
    "zoom_to": _zoom_to,
}
