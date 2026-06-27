"""Scenario testing: link edits with undo/redo, baseline-vs-scenario diff,
select-link analysis and screenline totals.

Edits are stored as a replayable log on top of an immutable *base* network, so
a scenario is fully described by its edit list and can be saved/reloaded.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np

from steam_core.classify import CLASS_CODE, class_name
from steam_core.network import Network
from steam_core.graph import build_csr, CSRGraph
from steam_core.settings import Settings
from steam_core.geometry import segments_cross
from steam_core.kernels import _dijkstra
from .assignment import AssignmentResult, assign
from .demand import Demand


# ---------------------------------------------------------------------------
# Edits
# ---------------------------------------------------------------------------

@dataclass
class Edit:
    """A single scenario edit."""

    kind: str                       # "upgrade" | "new_road"
    link_id: int = -1               # target link (upgrade)
    add_lanes: int = 0              # lanes to add (upgrade)
    node_a: int = -1                # endpoints (new_road, node indices)
    node_b: int = -1
    klass: str = "art"              # facility class (new_road)
    lanes: int = 2                  # lanes (new_road)


class NetworkEditor:
    """Holds a base network and a replayable list of edits."""

    def __init__(self, base: Network, settings: Settings):
        self.base = base
        self.settings = settings
        self.edits: list[Edit] = []
        self._redo: list[Edit] = []

    # ---- mutation API ----------------------------------------------------
    def upgrade_link(self, link_id: int, add_lanes: int = 1) -> None:
        self.edits.append(Edit(kind="upgrade", link_id=int(link_id),
                               add_lanes=int(add_lanes)))
        self._redo.clear()

    def add_road(self, node_a: int, node_b: int, klass: str = "art",
                 lanes: int = 2) -> None:
        self.edits.append(Edit(kind="new_road", node_a=int(node_a),
                               node_b=int(node_b), klass=klass, lanes=int(lanes)))
        self._redo.clear()

    def undo(self) -> bool:
        if not self.edits:
            return False
        self._redo.append(self.edits.pop())
        return True

    def redo(self) -> bool:
        if not self._redo:
            return False
        self.edits.append(self._redo.pop())
        return True

    def clear(self) -> None:
        self.edits.clear()
        self._redo.clear()

    # ---- materialisation -------------------------------------------------
    def build(self) -> Network:
        """Apply all edits to a copy of the base network."""
        net = _copy_network(self.base)
        new_links: list[dict] = []
        for e in self.edits:
            if e.kind == "upgrade":
                idx = np.where(net.link_id == e.link_id)[0]
                if len(idx):
                    net.lanes[idx[0]] = max(1, int(net.lanes[idx[0]]) + e.add_lanes)
            elif e.kind == "new_road":
                new_links.append(e.__dict__)
        if new_links:
            net = _append_links(net, new_links)
        net.recompute_costs(self.settings)
        return net


def _copy_network(net: Network) -> Network:
    return Network(
        link_id=net.link_id.copy(), node_a=net.node_a.copy(),
        node_b=net.node_b.copy(), klass=net.klass.copy(),
        ltype=net.ltype.copy(), lanes=net.lanes.copy(),
        length=net.length.copy(), oneway=net.oneway.copy(),
        node_xy=net.node_xy.copy(), node_raw=net.node_raw.copy(),
        geom_xy=net.geom_xy.copy(), geom_off=net.geom_off.copy(),
    )


def _append_links(net: Network, specs: list[dict]) -> Network:
    n_add = len(specs)
    n0 = net.n_links
    link_id = np.concatenate([net.link_id,
                              np.arange(n_add) + int(net.link_id.max()) + 1])
    node_a = np.concatenate([net.node_a, [s["node_a"] for s in specs]]).astype(np.int32)
    node_b = np.concatenate([net.node_b, [s["node_b"] for s in specs]]).astype(np.int32)
    klass = np.concatenate([net.klass, [CLASS_CODE[s["klass"]] for s in specs]]).astype(np.int8)
    ltype = np.concatenate([net.ltype, np.full(n_add, 20, dtype=np.int16)])
    lanes = np.concatenate([net.lanes, [s["lanes"] for s in specs]]).astype(np.int16)
    oneway = np.concatenate([net.oneway, np.zeros(n_add, dtype=bool)])

    # Geometry: straight line between the two node coordinates.
    geoms = []
    lengths = []
    for s in specs:
        a = net.node_xy[s["node_a"]]
        b = net.node_xy[s["node_b"]]
        geoms.append(np.array([a, b], dtype=np.float64))
        lengths.append(float(np.hypot(b[0] - a[0], b[1] - a[1])))
    length = np.concatenate([net.length, lengths])

    geom_off = net.geom_off.copy()
    extra_off = []
    cur = int(geom_off[-1])
    new_geom = [net.geom_xy]
    for g in geoms:
        new_geom.append(g)
        cur += len(g)
        extra_off.append(cur)
    geom_xy = np.vstack(new_geom)
    geom_off = np.concatenate([geom_off, extra_off]).astype(np.int64)

    return Network(
        link_id=link_id, node_a=node_a, node_b=node_b, klass=klass,
        ltype=ltype, lanes=lanes, length=length, oneway=oneway,
        node_xy=net.node_xy.copy(), node_raw=net.node_raw.copy(),
        geom_xy=geom_xy, geom_off=geom_off,
    )


# ---------------------------------------------------------------------------
# Scenario diff
# ---------------------------------------------------------------------------

@dataclass
class ScenarioDiff:
    base_kpis: object
    scen_kpis: object
    volume_delta: np.ndarray          # per (base) link; new links appended
    vht_delta: float
    vmt_delta: float
    overcap_delta: int
    cost_benefit: float               # annual delta_VHT * VOT * working_days


def run_scenario_diff(base_net: Network, scen_net: Network, graph_base: CSRGraph,
                      demand: Demand, settings: Settings, method: str,
                      progress=None) -> ScenarioDiff:
    """Assign baseline and scenario with identical settings/demand and diff."""
    from .analysis import network_kpis

    res_base = assign(base_net, graph_base, demand, settings, method, progress)
    graph_scen = build_csr(scen_net)
    res_scen = assign(scen_net, graph_scen, demand, settings, method, progress)

    kb = network_kpis(base_net, res_base)
    ks = network_kpis(scen_net, res_scen)

    n = base_net.n_links
    vdelta = res_scen.volume[:n] - res_base.volume[:n]
    vht_delta = ks.vht - kb.vht
    cost_benefit = -vht_delta * settings.value_of_time * settings.working_days
    return ScenarioDiff(
        base_kpis=kb, scen_kpis=ks, volume_delta=vdelta,
        vht_delta=vht_delta, vmt_delta=ks.vmt - kb.vmt,
        overcap_delta=ks.over_capacity - kb.over_capacity,
        cost_benefit=cost_benefit,
    )


# ---------------------------------------------------------------------------
# Select-link analysis
# ---------------------------------------------------------------------------

def select_link_bundle(net: Network, graph: CSRGraph, demand: Demand,
                       link_id: int) -> np.ndarray:
    """Flow bundle using ``link_id``: per-link volume from OD pairs whose
    shortest path traverses the selected link, at the current skim.

    Only meaningful for a fixed demand (uses its origin grouping).
    """
    if demand.kind != "fixed":
        raise ValueError("select-link requires a fixed demand")
    target = int(np.where(net.link_id == link_id)[0][0])

    n_nodes = graph.n_nodes
    dist = np.empty(n_nodes)
    pe = np.empty(n_nodes, dtype=np.int64)
    pn = np.empty(n_nodes, dtype=np.int64)
    heap_d = np.empty(graph.n_edges + 1)
    heap_n = np.empty(graph.n_edges + 1, dtype=np.int64)

    edges_of_link = np.where(graph.edge_link == target)[0]
    edge_set = set(int(e) for e in edges_of_link)

    bundle_edge = np.zeros(graph.n_edges, dtype=np.float64)
    for i, s in enumerate(demand.origins):
        _dijkstra(graph.indptr, graph.indices, graph.weight, int(s),
                  dist, pe, pn, heap_d, heap_n)
        lo, hi = demand.head[i], demand.head[i + 1]
        for k in range(lo, hi):
            d = int(demand.dest_node[k])
            t = demand.dest_trips[k]
            if t <= 0 or d == s or pe[d] < 0:
                continue
            # Walk path, collecting edges; only keep if it uses the target.
            path = []
            u = d
            uses = False
            while u != s:
                e = int(pe[u])
                if e < 0:
                    break
                path.append(e)
                if e in edge_set:
                    uses = True
                u = int(pn[u])
            if uses:
                for e in path:
                    bundle_edge[e] += t
    return graph.link_volume_from_edges(bundle_edge)


# ---------------------------------------------------------------------------
# Screenline
# ---------------------------------------------------------------------------

def screenline_total(net: Network, res: AssignmentResult,
                     p1, p2) -> dict:
    """Total volume on links crossing the screenline segment p1-p2."""
    p1 = np.asarray(p1, float)
    p2 = np.asarray(p2, float)
    crossing = []
    total = 0.0
    for i in range(net.n_links):
        poly = net.link_polyline(i)
        hit = False
        for s in range(len(poly) - 1):
            if segments_cross(p1, p2, poly[s], poly[s + 1]):
                hit = True
                break
        if hit:
            crossing.append(i)
            total += float(res.volume[i])
    return {"links": crossing, "count": len(crossing), "total_volume": total}


# ---------------------------------------------------------------------------
# Scenario persistence
# ---------------------------------------------------------------------------

@dataclass
class Scenario:
    name: str
    edits: list = field(default_factory=list)
    method: str = "Frank-Wolfe UE"
    demand_source: str = "fixed"
    notes: str = ""

    def to_json(self) -> str:
        d = asdict(self)
        d["edits"] = [asdict(e) if isinstance(e, Edit) else e for e in self.edits]
        return json.dumps(d, indent=2)

    @classmethod
    def from_json(cls, text: str) -> "Scenario":
        d = json.loads(text)
        edits = [Edit(**e) for e in d.get("edits", [])]
        return cls(name=d.get("name", "scenario"), edits=edits,
                   method=d.get("method", "Frank-Wolfe UE"),
                   demand_source=d.get("demand_source", "fixed"),
                   notes=d.get("notes", ""))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json())

    @classmethod
    def load(cls, path: str | Path) -> "Scenario":
        return cls.from_json(Path(path).read_text())


class ScenarioManager:
    """In-memory list of named scenarios with disk persistence."""

    def __init__(self, directory: str | Path | None = None):
        self.directory = Path(directory) if directory else None
        self.scenarios: dict[str, Scenario] = {}

    def add(self, scenario: Scenario) -> None:
        self.scenarios[scenario.name] = scenario
        if self.directory:
            self.directory.mkdir(parents=True, exist_ok=True)
            scenario.save(self.directory / f"{scenario.name}.json")

    def names(self) -> list[str]:
        return sorted(self.scenarios)

    def get(self, name: str) -> Scenario:
        return self.scenarios[name]

    def load_dir(self) -> None:
        if not self.directory or not self.directory.exists():
            return
        for p in self.directory.glob("*.json"):
            sc = Scenario.load(p)
            self.scenarios[sc.name] = sc
