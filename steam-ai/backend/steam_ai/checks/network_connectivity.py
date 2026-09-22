"""Network connectivity: orphan nodes, dead links, one-way dead ends, islands."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    link_locations,
    make_finding,
    node_locations,
    refs_from_rows,
)


class NetworkConnectivity(Check):
    check_id = "network_connectivity"
    name = "Network connectivity"
    description = (
        "Finds nodes with no links, links with zero or near-zero capacity or free-flow speed, "
        "one-way dead ends (nodes that can be entered but not left) and parts of the network "
        "disconnected from the main component."
    )
    required_tables = {"links", "nodes"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        self.rows_examined = store.row_count("links") + store.row_count("nodes")
        out: list[Finding] = []
        out += self._orphans(store, severity_rules)
        out += self._dead_links(store, params, severity_rules)
        out += self._dead_ends(store, severity_rules)
        out += self._components(store, severity_rules)
        return out

    def _orphans(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = (
            "SELECT n.node_id, n.x, n.y, n.source_file, n.source_row FROM nodes n "
            "LEFT JOIN (SELECT a_node AS node_id FROM links UNION "
            "SELECT b_node FROM links) u USING (node_id) "
            "WHERE u.node_id IS NULL AND NOT COALESCE(n.is_centroid, FALSE) ORDER BY n.node_id"
        )
        df = store.query(sql)
        sev = evaluate_severity(rules, issue="orphan_node", count=len(df))
        if df.empty or sev is None:
            return []
        locs = node_locations(store, df["node_id"])
        out = []
        for _, r in df.iterrows():
            nid = int(r["node_id"])
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[nid],
                    executive_line=f"Node {nid} is not connected to any road link.",
                    likely_cause="Leftover node from network editing, or links deleted around it.",
                    suggested_action="Delete the node or connect it; orphan nodes are harmless "
                    "for assignment but signal an incomplete edit.",
                    values={"issue": "orphan_node", "node_id": nid},
                    thresholds={},
                    sources=refs_from_rows(df[df["node_id"] == nid], "nodes", "node_id"),
                    query=sql,
                    method="nodes anti-joined to link end nodes",
                )
            )
        return out

    def _dead_links(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        min_cap = float(params.get("min_capacity_vph", 1.0))
        min_ffs = float(params.get("min_ffs_kph", 5.0))
        sql = (
            "SELECT link_id, link_class, capacity_vph, ffs_kph, lanes, source_file, source_row "
            f"FROM links WHERE capacity_vph < {min_cap} OR ffs_kph < {min_ffs} ORDER BY link_id"
        )
        df = store.query(sql)
        if df.empty:
            return []
        locs = link_locations(store, df["link_id"])
        out = []
        for _, r in df.iterrows():
            lid = int(r["link_id"])
            issue = "zero_capacity" if r["capacity_vph"] < min_cap else "zero_speed"
            sev = evaluate_severity(rules, issue=issue, capacity_vph=r["capacity_vph"],
                                    ffs_kph=r["ffs_kph"])
            if sev is None:
                continue
            what = (
                f"a capacity of {fmt(r['capacity_vph'])} vehicles per hour"
                if issue == "zero_capacity"
                else f"a free-flow speed of {fmt(r['ffs_kph'])} km/h"
            )
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[lid],
                    executive_line=f"Link {lid} ({r['link_class']}) has {what}, so traffic "
                    "cannot realistically use it.",
                    likely_cause="Capacity or speed lookup missed this link class/area type, "
                    "or the link was meant to be closed.",
                    suggested_action="Fix the link attributes or remove the link from the "
                    "scenario network.",
                    values={"issue": issue, "capacity_vph": r["capacity_vph"],
                            "ffs_kph": r["ffs_kph"], "lanes": r["lanes"],
                            "link_class": r["link_class"]},
                    thresholds={"min_capacity_vph": min_cap, "min_ffs_kph": min_ffs},
                    sources=refs_from_rows(df[df["link_id"] == lid], "links",
                                           "capacity_vph" if issue == "zero_capacity"
                                           else "ffs_kph"),
                    query=sql,
                    method="attribute threshold on links",
                )
            )
        return out

    def _dead_ends(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = (
            "WITH e AS (SELECT a_node AS f, b_node AS t FROM links "
            "UNION ALL SELECT b_node, a_node FROM links WHERE NOT COALESCE(oneway, FALSE)) "
            "SELECT n.node_id, n.source_file, n.source_row, "
            "(SELECT COUNT(*) FROM e WHERE e.t = n.node_id) AS inbound "
            "FROM nodes n WHERE NOT COALESCE(n.is_centroid, FALSE) "
            "AND EXISTS (SELECT 1 FROM e WHERE e.t = n.node_id) "
            "AND NOT EXISTS (SELECT 1 FROM e WHERE e.f = n.node_id) ORDER BY n.node_id"
        )
        df = store.query(sql)
        sev = evaluate_severity(rules, issue="oneway_dead_end", count=len(df))
        if df.empty or sev is None:
            return []
        locs = node_locations(store, df["node_id"])
        out = []
        for _, r in df.iterrows():
            nid = int(r["node_id"])
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=locs[nid],
                    executive_line=f"Traffic can enter node {nid} on {fmt(r['inbound'])} "
                    "one-way link(s) but has no way out.",
                    likely_cause="One-way direction coded backwards on a link, or a missing "
                    "return link.",
                    suggested_action="Check the one-way flags on the links meeting at this node.",
                    values={"issue": "oneway_dead_end", "node_id": nid,
                            "inbound_links": int(r["inbound"])},
                    thresholds={},
                    sources=refs_from_rows(df[df["node_id"] == nid], "nodes", "node_id"),
                    query=sql,
                    method="directed edge set from links/oneway; node with inbound but no "
                    "outbound edges",
                )
            )
        return out

    def _components(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = "SELECT a_node, b_node FROM links WHERE a_node IS NOT NULL AND b_node IS NOT NULL"
        edges = store.query(sql)
        if edges.empty:
            return []
        labels = _weak_components(edges["a_node"].to_numpy(), edges["b_node"].to_numpy())
        if labels.empty:
            return []
        sizes = labels.groupby("component").size().sort_values(ascending=False)
        if len(sizes) <= 1:
            return []
        main = sizes.index[0]
        others = sizes.drop(main)
        sev = evaluate_severity(rules, issue="disconnected_component", count=len(others))
        if sev is None:
            return []
        out = []
        for comp, size in others.items():
            members = labels.loc[labels["component"] == comp, "node_id"].sort_values()
            rep = int(members.iloc[0])
            loc = node_locations(store, [rep])[rep]
            loc = Location(type=LocationType.NODE, id=loc.id, lon=loc.lon, lat=loc.lat,
                           label=f"Island of {int(size)} nodes (e.g. node {rep})")
            ex_links = store.query(
                "SELECT link_id, source_file, source_row FROM links "
                f"WHERE a_node IN ({','.join(str(int(m)) for m in members.head(50))}) "
                "ORDER BY link_id LIMIT 20"
            )
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev, location=loc,
                    executive_line=f"A group of {fmt(size)} nodes is cut off from the rest of "
                    f"the network (main network: {fmt(sizes.iloc[0])} nodes).",
                    likely_cause="A missing link between the island and the main network, or "
                    "a coding error in end-node ids.",
                    suggested_action="Add or fix the connecting link(s); trips to zones on the "
                    "island cannot be assigned.",
                    values={"issue": "disconnected_component", "component_size": int(size),
                            "main_component_size": int(sizes.iloc[0]),
                            "example_nodes": [int(m) for m in members.head(20)],
                            "example_links": [int(v) for v in ex_links["link_id"]]},
                    thresholds={},
                    sources=refs_from_rows(ex_links, "links", "link_id"),
                    query=sql,
                    discriminator=str(rep),
                    method="union-find over undirected link graph",
                )
            )
        return out


def _weak_components(a: np.ndarray, b: np.ndarray) -> pd.DataFrame:
    """Label weakly connected components with a vectorised union-find.

    Returns a frame (node_id, component). Uses numpy relabelling so 150K links
    take well under a second.
    """
    nodes, inv = np.unique(np.concatenate([a, b]), return_inverse=True)
    n = len(nodes)
    ia, ib = inv[: len(a)], inv[len(a):]
    # Iterative min-label propagation: converges in O(diameter) passes.
    labels = np.arange(n)
    while True:
        lo = np.minimum(labels[ia], labels[ib])
        new = labels.copy()
        np.minimum.at(new, ia, lo)
        np.minimum.at(new, ib, lo)
        # pointer jumping to flatten
        new = new[new]
        if np.array_equal(new, labels):
            break
        labels = new
    return pd.DataFrame({"node_id": nodes, "component": labels})
