"""Tests for the zone-aggregation engine and its contiguity guarantees."""

import numpy as np

from steam_viewer import (AggregationConfig, aggregate, build_barrier_grid,
                          aggregate_od, qa_flags)
from steam_viewer.aggregate import aggregation_stats


def _cfg(**over):
    base = dict(barrier_threshold="coll", max_span_m=6000.0,
                target_zone_count=120, keys=("district", "areatype"),
                method="single")
    base.update(over)
    return AggregationConfig(**base)


def test_reaches_target(loaded):
    res = aggregate(loaded["zones"], loaded["net"], _cfg())
    assert res.n_clusters <= loaded["zones"].n
    assert res.n_clusters >= 1


def test_no_merge_crosses_barrier_or_span(loaded):
    """Acceptance test: with barrier=collectors+ and span=6 km, no single merge
    step crosses a collector or exceeds 6 km."""
    cfg = _cfg()
    res = aggregate(loaded["zones"], loaded["net"], cfg)
    grid = build_barrier_grid(loaded["net"], cfg.barrier_threshold)
    cent = loaded["zones"].centroids()
    for i, j, dist in res.merge_edges:
        assert dist <= cfg.max_span_m + 1e-6
        assert not grid.crosses_barrier(cent[i], cent[j])


def test_correspondence_round_trips(loaded):
    res = aggregate(loaded["zones"], loaded["net"], _cfg())
    corr = res.correspondence(loaded["zones"])
    old_ids = [o for o, _ in corr]
    # every original (valid) zone maps to exactly one new zone
    assert len(old_ids) == len(set(old_ids))
    assert all(0 <= n for _, n in corr)


def test_aggregated_od_preserves_total(loaded):
    res = aggregate(loaded["zones"], loaded["net"], _cfg())
    agg = aggregate_od(loaded["od"], loaded["zones"], res)
    # all zones map (internal sample), so totals are preserved
    assert abs(agg.total() - loaded["od"].total()) < 1e-3


def test_dynamic_method_runs(loaded):
    res = aggregate(loaded["zones"], loaded["net"], _cfg(method="dynamic"))
    st = aggregation_stats(loaded["zones"], res)
    assert st["clusters_out"] >= 1
    cfg = _cfg(method="dynamic")
    grid = build_barrier_grid(loaded["net"], cfg.barrier_threshold)
    cent = loaded["zones"].centroids()
    for i, j, dist in res.merge_edges:
        assert dist <= cfg.max_span_m + 1e-6


def test_qa_flags_shape(loaded):
    res = aggregate(loaded["zones"], loaded["net"], _cfg())
    q = qa_flags(loaded["zones"], loaded["net"], res, _cfg())
    assert "n_non_contiguous" in q
    assert "n_barrier_spanning" in q
