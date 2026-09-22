"""End-to-end: every check finds its planted defect on the synthetic run.

Skips cleanly when the synthetic generator or the shared ``ingested_run``
fixture is not available.
"""

from __future__ import annotations

import json

import pytest

try:
    from steam_ai.synthetic import ALL_DEFECTS, defect_manifest
except ImportError:  # pragma: no cover - generator not present yet
    pytest.skip("synthetic generator not available", allow_module_level=True)

from steam_ai import changes, health, kpis, noise, solutions
from steam_ai.checks.registry import run_all
from steam_ai.models import CheckStatus, Finding

_CACHE: dict[str, object] = {}


@pytest.fixture(scope="module")
def runs(request: pytest.FixtureRequest) -> dict:
    """Base (clean) and all-defects runs with their check results, computed once."""
    try:
        ingested_run = request.getfixturevalue("ingested_run")
    except pytest.FixtureLookupError:
        pytest.skip("ingested_run fixture not available")
    if "runs" not in _CACHE:
        base = ingested_run(set())
        defective = ingested_run(ALL_DEFECTS, base_run_id=base.run_id)
        results = run_all(defective, base)
        _CACHE["runs"] = {
            "base": base,
            "run": defective,
            "results": {r.check_id: r for r in results},
            "manifest": defect_manifest(set(ALL_DEFECTS)),
        }
    return _CACHE["runs"]  # type: ignore[return-value]


def _findings(runs: dict, check_id: str) -> list[Finding]:
    r = runs["results"][check_id]
    assert r.status is CheckStatus.OK, (check_id, r.status, r.message)
    return r.findings


def _ids(fs: list[Finding], issue: str | None = None, period: str | None = None) -> set[str]:
    out = set()
    for f in fs:
        if issue is not None and f.evidence.values.get("issue") != issue:
            continue
        if period is not None and f.evidence.period != period:
            continue
        out.add(f.location.id)
    return out


def _str_ids(values) -> set[str]:
    return {str(v) for v in values}


def test_all_checks_ran(runs: dict) -> None:
    assert all(r.status is CheckStatus.OK for r in runs["results"].values()), {
        k: (r.status.value, r.message) for k, r in runs["results"].items()
        if r.status is not CheckStatus.OK}
    for f in (f for r in runs["results"].values() for f in r.findings):
        assert f.evidence.sources, f.finding_id
        assert f.evidence.query, f.finding_id
        assert f.executive_line.endswith(".") and f.modeller_view


def test_null_and_id_integrity(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "null_and_id_integrity")
    nulls = [f for f in fs if f.evidence.values["issue"] == "null_values"]
    assert len(nulls) == 1 and nulls[0].evidence.values["column"] == "capacity_vph"
    assert set(nulls[0].evidence.values["example_ids"]) == set(m["null_values"]["link_ids"])
    refs = [f for f in fs if f.evidence.values["issue"] == "missing_node_refs"]
    assert len(refs) == 1 and refs[0].severity.value == "Critical"
    assert refs[0].evidence.values["example_ids"] == m["missing_node_ref"]["link_ids"]
    assert len(fs) == 2  # precision: nothing else


def test_network_connectivity(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "network_connectivity")
    assert _ids(fs, "orphan_node") == _str_ids(m["orphan_nodes"]["node_ids"])
    assert _ids(fs, "zero_capacity") == _str_ids(m["zero_capacity_link"]["link_ids"])
    assert _ids(fs, "zero_speed") == _str_ids(m["zero_speed_link"]["link_ids"])
    assert _ids(fs, "oneway_dead_end") == _str_ids(m["oneway_dead_end"]["node_ids"])
    assert _ids(fs, "disconnected_component") == set()
    assert len(fs) == 3 + 2 + 2 + 1


def test_centroid_connectors(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "centroid_connectors")
    expected = _str_ids(m["connector_on_fwy"]["link_ids"])
    assert _ids(fs, "connector_on_high_class") == expected
    assert _ids(fs) == expected  # precision: only the planted connectors
    assert all(f.severity.value == "High" for f in fs
               if f.evidence.values["issue"] == "connector_on_high_class")


def test_transit_line_integrity(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "transit_line_integrity")
    assert _ids(fs, "broken_sequence") == set(m["broken_line_sequence"]["line_ids"])
    assert _ids(fs, "node_not_in_network") == set(m["line_node_not_in_network"]["line_ids"])
    headway = [f for f in fs if f.evidence.values["issue"] == "headway_out_of_range"]
    assert {(f.location.id, f.evidence.period) for f in headway} == {
        (m["headway_out_of_range"]["line_ids"][0], p) for p in m["headway_out_of_range"]["periods"]}
    assert len(fs) == 4


def test_land_use_control_totals(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "land_use_control_totals")
    assert len(fs) == 1
    v = fs[0].evidence.values
    assert v["variable"] == "POP" and v["region"] == "ALL"
    assert v["abs_diff_share"] == pytest.approx(1 - 1 / m["land_use_total_mismatch"]["factor"],
                                                rel=0.01)
    assert fs[0].severity.value == "Critical"


def test_link_volume_outliers(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "link_volume_outliers")
    corridor = _str_ids(m["overcapacity_corridor"]["link_ids"])
    critical_am = {f.location.id for f in fs
                   if f.severity.value == "Critical" and f.evidence.period == "AM"}
    assert critical_am == corridor
    assert _ids(fs, "over_capacity", "AM") >= corridor
    low = _str_ids(m["low_volume_outlier"]["link_ids"])
    assert _ids(fs, "volume_too_low", "AM") == low
    for f in fs:
        assert f.location.lon is not None and f.location.lat is not None


def test_convergence_and_noise(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "convergence_and_noise")
    gap = [f for f in fs if "rel_gap" in f.evidence.values]
    assert [(f.evidence.period, f.severity.value) for f in gap] == [("AM", "Critical")]
    assert gap[0].evidence.values["rel_gap"] == pytest.approx(
        m["poor_convergence"]["final_rel_gap"])
    band = runs["run"].noise_band()
    assert band is not None and len(band) > 0
    assert set(band["level"]) == {"link", "sector"}


def test_matrix_sanity(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "matrix_sanity")
    neg = [f for f in fs if f.evidence.values["issue"] == "negative_cells"]
    mx = m["negative_matrix_cells"]["matrix"]
    assert [f.location.id for f in neg] == [f"{mx['purpose']}/{mx['mode']}/{mx['period']}"]
    assert neg[0].evidence.values["n_cells"] == len(m["negative_matrix_cells"]["cells"])
    assert _ids(fs, "row_col_imbalance") == _str_ids(m["row_col_imbalance"]["zone_ids"])
    intra = [f for f in fs if f.evidence.values["issue"] == "intrazonal_share"
             and f.location.type.value == "zone"]
    assert {f.location.id for f in intra} == _str_ids(m["high_intrazonal"]["zone_ids"])
    assert intra[0].evidence.values["intrazonal_share"] == pytest.approx(
        m["high_intrazonal"]["share"], abs=0.02)


def test_trip_length_distribution(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "trip_length_distribution")
    assert [f.location.id for f in fs] == ["HBW/CAR"]
    v = fs[0].evidence.values
    assert fs[0].severity.value == "High"
    assert v["mean_diff_share"] == pytest.approx(m["trip_length_shift"]["factor"] - 1, abs=0.1)
    assert len(v["run_share"]) == len(v["bins_km"]) and sum(v["run_share"]) == pytest.approx(1)


def test_unrealistic_speeds_times(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "unrealistic_speeds_times")
    assert _ids(fs, "speed_above_ffs", "PM") == _str_ids(m["speed_above_ffs"]["link_ids"])
    assert _ids(fs, "speed_below_floor", "AM") == _str_ids(m["speed_below_floor"]["link_ids"])
    assert len(fs) == 6


def test_parameter_drift(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "parameter_drift")
    assert sorted(f.evidence.values["key"] for f in fs) == m["parameter_drift"]["keys"]
    assert all(f.severity.value == "High" for f in fs)


def test_unused_transit_services(runs: dict) -> None:
    m, fs = runs["manifest"], _findings(runs, "unused_transit_services")
    unused = m["unused_transit_line"]["line_ids"][0]
    assert unused in _ids(fs)
    highs = {f.location.id for f in fs if f.severity.value == "High"}
    assert highs == {unused}


def test_unexplained_demand_shift_flags_only_the_unexplained_sector(
    runs: dict, request: pytest.FixtureRequest
) -> None:
    ingested_run = request.getfixturevalue("ingested_run")
    base = runs["base"]
    unexplained = ingested_run(set(), variant="scenario_unexplained", base_run_id=base.run_id)
    res = run_all(unexplained, base, only=["unexplained_demand_shift"])[0]
    assert res.status is CheckStatus.OK
    flagged = [f for f in res.findings if f.severity.value in {"High", "Medium"}]
    explained = [f for f in res.findings if f.severity.value == "Info"]
    assert flagged and explained
    for f in flagged:
        assert f.evidence.values["explained"] is False
        assert "S4" in {f.evidence.values["origin_sector"], f.evidence.values["destination_sector"]}
    assert len(explained) == 1  # explained shifts are summarised in one Info finding
    assert explained[0].evidence.values["explained_pairs"]
    # the explained pairs involve the growth sectors S1/S2 or the new bus line
    scen = ingested_run(set(), variant="scenario", base_run_id=base.run_id)
    res2 = run_all(scen, base, only=["unexplained_demand_shift"])[0]
    assert all(f.severity.value == "Info" for f in res2.findings)


def test_pipeline_pieces_on_synthetic(runs: dict) -> None:
    run, base = runs["run"], runs["base"]
    findings = [f for r in runs["results"].values() for f in r.findings]
    findings = noise.apply_noise_band(solutions.propose(run, findings), run)
    for f in findings:
        if f.severity.value in {"Critical", "High"}:
            assert 1 <= len(f.measures) <= 3, f.check_id
    run.write_findings(findings)
    h = health.compute(run, list(runs["results"].values()))
    assert h.score < 60 and h.grade in {"D", "E"}
    assert h.counts["Critical"] >= 10
    ks = kpis.compute(run)
    assert {k.kpi_id for k in ks} >= {"total_vkt_am", "total_trips_am", "mean_trip_length_km"}
    run.write_kpis(ks)
    base.write_kpis(kpis.compute(base))
    base.write_findings([])
    summary = changes.compute(run, base)
    json.dumps(summary)
    assert summary["findings"]["n_new"] == len(findings)
    assert summary["links"]["n_added"] >= 3  # planted defect links
    assert summary["parameters"] and {p["key"] for p in summary["parameters"]} == {
        "VOT_CAR", "PT_FARE_BASE"}
    assert len(summary["kpis"]) == len(ks)
