"""Recommendation engine — find network improvements.

Pipeline (Part 2 "find solutions"):

1. Rank links by congested delay and group them into corridors by shared node
   and facility class (union-find).
2. Generate a wide candidate set per corridor: +1/+2/+3 lanes, widen the single
   binding bottleneck link, and a parallel relief road along the corridor span.
3. Pre-screen every candidate cheaply with an analytical BPR benefit estimate.
4. Reassign only the most promising and rank by measured VHT saved and BCR.
5. A greedy programme builder stacks non-overlapping corridors.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from steam_core.classify import class_name, CLASS_CODE
from steam_core.network import Network
from steam_core.graph import CSRGraph
from steam_core.settings import Settings
from .assignment import AssignmentResult
from .bpr import bpr_time
from .scenario import Edit, NetworkEditor, run_scenario_diff
from .demand import Demand


@dataclass
class Recommendation:
    name: str
    corridor_links: list           # base link ids
    edits: list                    # list[Edit]
    analytic_benefit_vehh: float   # pre-screen estimate
    cost: float                    # capital cost
    measured_vht_saved: float = 0.0
    bcr: float = 0.0               # benefit-cost ratio (annualised)


def _build_corridors(net: Network, res: AssignmentResult, top_n: int,
                     min_delay: float) -> list[list[int]]:
    """Top congested links grouped into corridors (shared node + same class)."""
    delay = res.volume * (res.congested_time - res.free_time)
    order = np.argsort(delay)[::-1]
    selected = [int(i) for i in order[:top_n] if delay[i] > min_delay]
    if not selected:
        return []

    parent = {i: i for i in selected}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find(a)] = find(b)

    # node -> selected links touching it (per class).
    node_links: dict[tuple[int, int], list[int]] = {}
    for i in selected:
        for nd in (int(net.node_a[i]), int(net.node_b[i])):
            node_links.setdefault((nd, int(net.klass[i])), []).append(i)
    for links in node_links.values():
        for j in range(1, len(links)):
            union(links[0], links[j])

    groups: dict[int, list[int]] = {}
    for i in selected:
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def _corridor_endpoints(net: Network, links: list[int]) -> tuple[int, int]:
    """Two corridor nodes furthest apart (for a parallel relief road)."""
    nodes = set()
    for i in links:
        nodes.add(int(net.node_a[i]))
        nodes.add(int(net.node_b[i]))
    nodes = list(nodes)
    pts = net.node_xy[nodes]
    best = (nodes[0], nodes[0], -1.0)
    for a in range(len(nodes)):
        d = np.hypot(pts[:, 0] - pts[a, 0], pts[:, 1] - pts[a, 1])
        b = int(np.argmax(d))
        if d[b] > best[2]:
            best = (nodes[a], nodes[b], float(d[b]))
    return best[0], best[1]


def _analytic_benefit(net: Network, res: AssignmentResult, settings: Settings,
                      link_idx: list[int], new_lanes: dict[int, int]) -> float:
    """BPR benefit estimate (veh-h) of changing lane counts, vol held fixed."""
    fft = net.free_time if hasattr(net, "free_time") else res.free_time
    alpha, beta = settings.bpr_alpha, settings.bpr_beta
    total = 0.0
    for i in link_idx:
        vol = res.volume[i]
        if vol <= 0:
            continue
        cap_old = res.capacity[i]
        lanes_old = max(1, int(net.lanes[i]))
        cap_new = cap_old * new_lanes.get(i, lanes_old) / lanes_old
        t_old = bpr_time(res.free_time[i], vol, cap_old, alpha, beta)
        t_new = bpr_time(res.free_time[i], vol, cap_new, alpha, beta)
        total += vol * (t_old - t_new)
    return float(total) / 3600.0


def _cost_of_edits(net: Network, settings: Settings, edits: list[Edit]) -> float:
    cost = 0.0
    for e in edits:
        if e.kind == "upgrade":
            idx = np.where(net.link_id == e.link_id)[0]
            if len(idx):
                cost += e.add_lanes * float(net.length[idx[0]]) * settings.unit_cost_lane_m
        elif e.kind == "new_road":
            a = net.node_xy[e.node_a]
            b = net.node_xy[e.node_b]
            length = float(np.hypot(b[0] - a[0], b[1] - a[1]))
            cost += e.lanes * length * settings.unit_cost_lane_m
    return cost


def generate_candidates(net: Network, res: AssignmentResult, settings: Settings,
                        top_n: int = 200, max_corridors: int = 12,
                        min_delay_vehh: float = 1.0) -> list[Recommendation]:
    """Build and analytically pre-screen the candidate set (no reassignment)."""
    corridors = _build_corridors(net, res, top_n, min_delay_vehh * 3600.0)
    # Order corridors by total delay, keep the worst few.
    delay = res.volume * (res.congested_time - res.free_time)
    corridors.sort(key=lambda ls: -sum(delay[i] for i in ls))
    corridors = corridors[:max_corridors]

    recs: list[Recommendation] = []
    for ci, links in enumerate(corridors):
        link_ids = [int(net.link_id[i]) for i in links]
        klass = class_name(int(net.klass[links[0]]))

        # +1 / +2 / +3 lanes across the corridor.
        for add in (1, 2, 3):
            new_lanes = {i: int(net.lanes[i]) + add for i in links}
            ben = _analytic_benefit(net, res, settings, links, new_lanes)
            edits = [Edit(kind="upgrade", link_id=lid, add_lanes=add)
                     for lid in link_ids]
            cost = _cost_of_edits(net, settings, edits)
            recs.append(Recommendation(
                name=f"C{ci+1} {klass}: +{add} lane(s) ({len(links)} links)",
                corridor_links=link_ids, edits=edits,
                analytic_benefit_vehh=ben, cost=cost))

        # Widen the single binding bottleneck (+2 lanes).
        bott = max(links, key=lambda i: res.vc[i])
        nb = {bott: int(net.lanes[bott]) + 2}
        ben = _analytic_benefit(net, res, settings, [bott], nb)
        edits = [Edit(kind="upgrade", link_id=int(net.link_id[bott]), add_lanes=2)]
        recs.append(Recommendation(
            name=f"C{ci+1} {klass}: widen bottleneck link {int(net.link_id[bott])}",
            corridor_links=[int(net.link_id[bott])], edits=edits,
            analytic_benefit_vehh=ben,
            cost=_cost_of_edits(net, settings, edits)))

        # Parallel relief road along the corridor span.
        a, b = _corridor_endpoints(net, links)
        if a != b:
            med_lanes = int(np.median([net.lanes[i] for i in links]))
            edits = [Edit(kind="new_road", node_a=a, node_b=b, klass=klass,
                          lanes=max(1, med_lanes))]
            # Relief benefit is hard to estimate analytically; use a fraction of
            # the corridor delay as a heuristic pre-screen score.
            ben = float(sum(delay[i] for i in links)) / 3600.0 * 0.35
            recs.append(Recommendation(
                name=f"C{ci+1} {klass}: parallel relief road",
                corridor_links=link_ids, edits=edits,
                analytic_benefit_vehh=ben,
                cost=_cost_of_edits(net, settings, edits)))

    recs.sort(key=lambda r: -r.analytic_benefit_vehh)
    return recs


def evaluate_candidates(base_net: Network, graph: CSRGraph, demand: Demand,
                        settings: Settings, method: str,
                        candidates: list[Recommendation],
                        n_eval: int = 8, progress=None) -> list[Recommendation]:
    """Reassign the most promising candidates and rank by measured VHT + BCR."""
    evaluated: list[Recommendation] = []
    for rank, rec in enumerate(candidates[:n_eval]):
        editor = NetworkEditor(base_net, settings)
        editor.edits = list(rec.edits)
        scen_net = editor.build()
        diff = run_scenario_diff(base_net, scen_net, graph, demand, settings,
                                 method)
        rec.measured_vht_saved = -diff.vht_delta
        annual_benefit = rec.measured_vht_saved * settings.value_of_time * settings.working_days
        rec.bcr = annual_benefit / rec.cost if rec.cost > 0 else float("inf")
        evaluated.append(rec)
        if progress:
            progress(rank + 1, min(n_eval, len(candidates)), 0.0)
    evaluated.sort(key=lambda r: -r.measured_vht_saved)
    return evaluated


def greedy_programme(evaluated: list[Recommendation],
                     max_projects: int = 5) -> list[Recommendation]:
    """Pick non-overlapping corridors greedily by measured VHT saved."""
    chosen: list[Recommendation] = []
    used: set[int] = set()
    for rec in sorted(evaluated, key=lambda r: -r.measured_vht_saved):
        if len(chosen) >= max_projects:
            break
        links = set(rec.corridor_links)
        if links & used:
            continue
        chosen.append(rec)
        used |= links
    return chosen
