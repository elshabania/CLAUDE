"""The unified application controller.

``AppState`` holds the single shared data model for both halves of the merged
app — the road network and routing graph (assignment) and the zones, barriers
and clustering (aggregation) — plus the settings, the loaded OD matrix and the
latest results.  It is deliberately framework-agnostic (no Qt imports) so it
can be unit-tested headlessly and reused by the CLI, the GUI and the AI
assistant alike.

Views register observers via :meth:`subscribe`; every mutating method emits a
typed event so the GUI can refresh exactly what changed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from steam_core import (Settings, Network, load_network, Zones, load_zones,
                        ODMatrix, load_od_long, CSRGraph, build_csr,
                        save_network_cache, load_network_cache)
from steam_core.zonemap import build_zone_node_map
from steam_core.kernels import warmup

from steam_assignment import (AssignmentResult, assign, METHODS,
                              Demand, build_fixed_demand, build_gravity_demand)
from steam_assignment.demand import build_allones_demand
from steam_assignment.analysis import (network_kpis, kpis_by_class, top_congested,
                                       vc_histogram, los_distribution,
                                       connectivity_check, export_links_csv)
from steam_assignment.scenario import (NetworkEditor, run_scenario_diff,
                                       select_link_bundle, screenline_total,
                                       ScenarioManager, Scenario)
from steam_assignment.recommend import (generate_candidates, evaluate_candidates,
                                        greedy_programme)

from steam_viewer import (AggregationConfig, AggregationResult, aggregate,
                          aggregate_od, write_correspondence, write_geojson,
                          qa_flags)
from steam_viewer.aggregate import aggregation_stats

DEMAND_SOURCES = ["Loaded OD matrix", "Land-use gravity", "All-ones test"]


@dataclass
class AppState:
    settings: Settings = field(default_factory=Settings)
    network: Network | None = None             # base (unedited) network
    graph: CSRGraph | None = None              # CSR for the base network
    zones: Zones | None = None
    zone_node: np.ndarray | None = None
    od: ODMatrix | None = None
    od_hgv: ODMatrix | None = None

    editor: NetworkEditor | None = None        # scenario edits over the base net
    result: AssignmentResult | None = None     # latest assignment
    aggregation: AggregationResult | None = None
    scenarios: ScenarioManager = field(default_factory=ScenarioManager)

    network_source: str | None = None
    _observers: list[Callable[[str, dict], None]] = field(default_factory=list)

    # ---- observer plumbing ----------------------------------------------
    def subscribe(self, fn: Callable[[str, dict], None]) -> None:
        self._observers.append(fn)

    def emit(self, event: str, **data) -> None:
        for fn in list(self._observers):
            fn(event, data)

    # ---- data loading ----------------------------------------------------
    def load_network(self, path: str | Path, cache_dir: str | Path | None = None,
                     progress: Callable[[str], None] | None = None) -> Network:
        path = Path(path)
        net = None
        cache_path = None
        if cache_dir:
            cache_path = Path(cache_dir) / (path.stem + ".npz")
            net = load_network_cache(cache_path, source=path)
        if net is None:
            if progress:
                progress("Parsing network…")
            net = load_network(path, self.settings)
            if cache_path is not None:
                save_network_cache(net, cache_path, source=path)
        net.recompute_costs(self.settings)
        self.network = net
        self.network_source = str(path)
        self.editor = NetworkEditor(net, self.settings)
        self.graph = build_csr(net)
        self.result = None
        if self.zones is not None:
            self.zone_node = build_zone_node_map(self.zones, net)
        self.emit("network_loaded", n_links=net.n_links, n_nodes=net.n_nodes)
        return net

    def load_zones(self, path: str | Path) -> Zones:
        self.zones = load_zones(path)
        if self.network is not None:
            self.zone_node = build_zone_node_map(self.zones, self.network)
        self.emit("zones_loaded", n=self.zones.n)
        return self.zones

    def load_matrix(self, path: str | Path, hgv: bool = False) -> ODMatrix:
        od = load_od_long(path)
        if hgv:
            self.od_hgv = od
        else:
            self.od = od
        self.emit("matrix_loaded", pairs=od.n_pairs, total=od.total(), hgv=hgv)
        return od

    # ---- derived helpers -------------------------------------------------
    def current_network(self) -> Network:
        """The network including any scenario edits."""
        if self.editor and self.editor.edits:
            return self.editor.build()
        return self.network

    def warmup(self) -> None:
        warmup()

    def build_demand(self, source: str) -> Demand:
        if self.zone_node is None:
            raise RuntimeError("Load zones and a network first.")
        if source == DEMAND_SOURCES[0]:
            if self.od is None:
                raise RuntimeError("No OD matrix loaded.")
            return build_fixed_demand(self.od, self.zones, self.zone_node,
                                      self.settings, self.od_hgv)
        if source == DEMAND_SOURCES[1]:
            return build_gravity_demand(self.zones, self.zone_node, self.settings)
        return build_allones_demand(self.zones, self.zone_node)

    # ---- assignment ------------------------------------------------------
    def run_assignment(self, method: str, source: str, progress=None,
                       cancel=None) -> AssignmentResult:
        if method not in METHODS:
            raise ValueError(f"Unknown method {method!r}. Options: {METHODS}")
        net = self.current_network()
        net.recompute_costs(self.settings)
        graph = build_csr(net)
        demand = self.build_demand(source)
        result = assign(net, graph, demand, self.settings, method,
                        progress=progress, cancel=cancel)
        self.result = result
        self.emit("assignment_done", method=method, source=source)
        return result

    def kpis(self):
        if self.result is None:
            raise RuntimeError("No assignment to summarise.")
        return network_kpis(self.current_network(), self.result)

    def kpis_by_class(self):
        return kpis_by_class(self.current_network(), self.result)

    def top_links(self, n: int = 25):
        return top_congested(self.current_network(), self.result, n)

    def connectivity(self):
        net = self.current_network()
        return connectivity_check(net, build_csr(net), self.zone_node)

    def export_links(self, path: str | Path) -> None:
        export_links_csv(path, self.current_network(), self.result)
        self.emit("exported", kind="links", path=str(path))

    # ---- scenario --------------------------------------------------------
    def upgrade_link(self, link_id: int, add_lanes: int = 1) -> None:
        self.editor.upgrade_link(link_id, add_lanes)
        self.emit("edit", kind="upgrade", link_id=link_id, add_lanes=add_lanes)

    def add_road(self, node_a: int, node_b: int, klass: str = "art",
                 lanes: int = 2) -> None:
        self.editor.add_road(node_a, node_b, klass, lanes)
        self.emit("edit", kind="new_road", node_a=node_a, node_b=node_b)

    def undo(self) -> bool:
        ok = self.editor.undo()
        self.emit("edit", kind="undo")
        return ok

    def run_scenario(self, method: str, source: str, progress=None):
        demand = self.build_demand(source)
        scen_net = self.editor.build()
        diff = run_scenario_diff(self.network, scen_net, self.graph, demand,
                                 self.settings, method, progress)
        self.emit("scenario_done")
        return diff

    def nearest_node(self, x: float, y: float) -> int:
        d = np.hypot(self.network.node_xy[:, 0] - x,
                     self.network.node_xy[:, 1] - y)
        return int(np.argmin(d))

    # ---- recommendation --------------------------------------------------
    def recommend(self, method: str, source: str, n_eval: int = 8, progress=None):
        if self.result is None:
            self.run_assignment(method, source, progress)
        demand = self.build_demand(source)
        cands = generate_candidates(self.network, self.result, self.settings)
        ev = evaluate_candidates(self.network, self.graph, demand, self.settings,
                                 method, cands, n_eval=n_eval, progress=progress)
        programme = greedy_programme(ev)
        self.emit("recommend_done", n=len(ev))
        return ev, programme

    # ---- aggregation -----------------------------------------------------
    def aggregate_zones(self, config: AggregationConfig | None = None,
                        **overrides) -> AggregationResult:
        if self.zones is None or self.network is None:
            raise RuntimeError("Load zones and a network first.")
        if config is None:
            config = AggregationConfig.from_settings(self.settings, **overrides)
        res = aggregate(self.zones, self.network, config)
        self.aggregation = res
        self._agg_config = config
        self.emit("aggregation_done", **aggregation_stats(self.zones, res))
        return res

    def aggregation_qa(self):
        return qa_flags(self.zones, self.network, self.aggregation,
                        getattr(self, "_agg_config", AggregationConfig()))

    def export_correspondence(self, path: str | Path) -> None:
        write_correspondence(path, self.zones, self.aggregation)
        self.emit("exported", kind="correspondence", path=str(path))

    def export_aggregated_od(self, path: str | Path) -> ODMatrix:
        if self.od is None:
            raise RuntimeError("No OD matrix loaded.")
        agg = aggregate_od(self.od, self.zones, self.aggregation)
        import csv
        with open(path, "w", newline="") as fh:
            wr = csv.writer(fh)
            wr.writerow(["origin_zone", "destination_zone", "trips"])
            for o, d, t in zip(agg.origin, agg.dest, agg.trips):
                wr.writerow([int(o), int(d), round(float(t), 4)])
        self.emit("exported", kind="aggregated_od", path=str(path))
        return agg

    def export_geojson(self, path: str | Path) -> None:
        write_geojson(path, self.zones, self.aggregation)
        self.emit("exported", kind="geojson", path=str(path))

    # ---- settings --------------------------------------------------------
    def set_setting(self, name: str, value) -> None:
        if not hasattr(self.settings, name):
            raise AttributeError(f"Unknown setting {name!r}")
        cur = getattr(self.settings, name)
        setattr(self.settings, name, type(cur)(value) if cur is not None else value)
        if self.network is not None:
            self.network.recompute_costs(self.settings)
        self.emit("setting_changed", name=name, value=value)

    def set_class_param(self, klass: str, field_name: str, value: float) -> None:
        cd = self.settings.classes[klass]
        setattr(cd, field_name, float(value))
        if self.network is not None:
            self.network.recompute_costs(self.settings)
        self.emit("setting_changed", name=f"{klass}.{field_name}", value=value)
