"""Block assembly tests for the diagnostic report model, plus the golden structure test."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pytest
from fixtures_report import report_data_root, report_store  # noqa: F401

from steam_ai import config
from steam_ai.reports.model import (
    Callout,
    Figure,
    Heading,
    Paragraph,
    ReportDoc,
    Table,
    build_diagnostic_report,
    fmt,
    rank_findings,
)

GOLDEN = Path(__file__).parent / "golden" / "diagnostic_report_structure.json"


@pytest.fixture
def report(report_store) -> ReportDoc:  # noqa: F811
    return build_diagnostic_report(report_store)


def _tables_with_caption(doc: ReportDoc, caption: str) -> list[Table]:
    return [b for b in doc.blocks if isinstance(b, Table) and b.caption == caption]


def test_sections_present(report: ReportDoc) -> None:
    h1 = [b.text for b in report.blocks if isinstance(b, Heading) and b.level == 1]
    assert h1 == [
        "Executive summary",
        "What to fix first",
        "Findings by severity",
        "Convergence and noise",
        "Key performance indicators",
        "Maps and charts",
        "Check coverage",
        "Appendix",
    ]
    assert report.metadata.synthetic_banner is not None
    assert "DRAFT" in report.metadata.watermark
    assert isinstance(report.blocks[0], Callout) and report.blocks[0].severity == "draft"
    assert isinstance(report.blocks[1], Callout) and report.blocks[1].severity == "synthetic"


def test_top_five_present(report: ReportDoc, report_store) -> None:  # noqa: F811
    tables = _tables_with_caption(report, "Top five findings by severity")
    assert len(tables) == 1
    top = tables[0]
    assert len(top.rows) == 5
    ranked = rank_findings(report_store.findings())
    assert [r[3] for r in top.rows] == [f.executive_line for f in ranked[:5]]
    assert [r[1] for r in top.rows] == ["Critical", "Critical", "High", "High", "High"]
    assert top.source_ref and all(f.finding_id in top.source_ref for f in ranked[:5])


def test_every_numeric_paragraph_has_source_ref(report: ReportDoc) -> None:
    missing = [
        b.text
        for b in report.blocks
        if isinstance(b, Paragraph) and re.search(r"\d", b.text) and not b.source_ref
    ]
    assert missing == []
    numeric = [b for b in report.blocks if isinstance(b, Paragraph) and b.source_ref]
    assert len(numeric) > 10
    assert all(b.source_ref.startswith("[src: ") for b in numeric)


def test_health_and_counts(report: ReportDoc, report_store) -> None:  # noqa: F811
    health = report_store.health()
    texts = [b.text for b in report.blocks if isinstance(b, Paragraph)]
    assert any(f"{health.score:.1f} out of 100, grade {health.grade}" in t for t in texts)
    assert any(t.startswith("Definition: Health = 0.7 x Findings component") for t in texts)
    counts = _tables_with_caption(report, "Findings by severity")[0]
    assert [r[:2] for r in counts.rows] == [
        ["Critical", "2"],
        ["High", "3"],
        ["Medium", "4"],
        ["Info", "3"],
    ]


def test_fix_first_table(report: ReportDoc) -> None:
    action = _tables_with_caption(report, "Action list")[0]
    assert action.columns == ["Severity", "Location", "Finding", "Suggested action", "Best measure"]
    assert len(action.rows) == 5  # 2 Critical + 3 High
    # the highest-confidence measure is chosen and carries method and confidence
    assert action.rows[0][4].startswith("Recode capacity to 3 lanes (sketch elasticity, medium")
    assert "high confidence" in action.rows[1][4]


def test_findings_body_cap_respected(report_store) -> None:  # noqa: F811
    cfg = json.loads(json.dumps(config.reporting()))
    cfg["diagnostic_report"]["max_findings_in_body"] = 4
    doc = build_diagnostic_report(report_store, figures={}, reporting_cfg=cfg)
    h3 = [b for b in doc.blocks if isinstance(b, Heading) and b.level == 3]
    assert len(h3) == 4
    omitted = [
        b
        for b in doc.blocks
        if isinstance(b, Paragraph) and "8 lower-ranked findings are omitted" in b.text
    ]
    assert len(omitted) == 1 and omitted[0].source_ref
    # sections for uncapped severities still exist and say what happened
    assert "Medium findings (4)" in doc.headings()
    assert any(
        isinstance(b, Paragraph) and b.text.startswith("All 4 Medium findings are outside")
        for b in doc.blocks
    )
    assert not any(isinstance(b, Figure) for b in doc.blocks)


def test_check_coverage_and_kpis(report: ReportDoc) -> None:
    cov = _tables_with_caption(report, "Check coverage")[0]
    assert len(cov.rows) == 13
    statuses = {r[1] for r in cov.rows}
    assert statuses == {"ok", "skipped", "error"}
    kpis = _tables_with_caption(report, "KPIs with their published definitions")[0]
    assert len(kpis.rows) == 3
    values = {r[0]: r[1] for r in kpis.rows}
    assert values["Share of links with V/C above 1.0, AM"].endswith("%")
    assert values["Vehicle-km travelled, AM"].endswith(" veh-km")
    assert int(values["Vehicle-km travelled, AM"].split()[0].replace(",", "")) % 10 == 0


def test_method_notes_from_checks_yaml(report: ReportDoc) -> None:
    notes = _tables_with_caption(report, "Check thresholds and severity rules")[0]
    ids = [r[0] for r in notes.rows]
    assert ids == list(config.checks()["checks"].keys())
    lvo = next(r for r in notes.rows if r[0] == "link_volume_outliers")
    assert "vc_critical = 1.3" in lvo[2]
    assert "Critical when vc_ratio >= 1.30" in lvo[3]
    glossary = _tables_with_caption(report, "Glossary")[0]
    assert {r[0] for r in glossary.rows} >= {
        "V/C",
        "GEH",
        "Relative gap",
        "Noise band",
        "Centroid connector",
        "Screenline",
    }


def test_figures_included(report: ReportDoc) -> None:
    figs = [b for b in report.blocks if isinstance(b, Figure)]
    assert len(figs) == 4
    for f in figs:
        assert Path(f.path_png).exists() and Path(f.path_png).stat().st_size > 1000
        assert f.source_ref and f.source_ref.startswith("[src: ")


def test_fmt_rounding() -> None:
    assert fmt(25563.0, "flow") == "25,560"
    assert fmt(0.1234, "share") == "12.3%"
    assert fmt(12.34, "pct") == "12.3%"
    assert fmt(63.6, "speed_kph") == "64 km/h"
    assert fmt(1.4234, "ratio") == "1.42"
    assert fmt(0.005) == "0.005"
    assert fmt(None) == "n/a"
    assert fmt(True) == "yes"


def test_golden_structure(report: ReportDoc) -> None:
    structure = report.structure()
    if os.environ.get("STEAM_AI_UPDATE_GOLDEN") == "1":
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(json.dumps(structure, indent=2) + "\n", "utf-8")
    assert GOLDEN.exists(), "golden file missing; run with STEAM_AI_UPDATE_GOLDEN=1"
    expected = json.loads(GOLDEN.read_text("utf-8"))
    assert structure == expected


def test_long_evidence_values_are_compacted() -> None:
    """A list of many dicts must never become a table cell taller than a page."""
    from steam_ai.reports.model import compact, fmt_evidence

    pairs = [{"origin_sector": f"S{i}", "destination_sector": "S2", "delta_trips": 100.0 * i}
             for i in range(40)]
    text = fmt_evidence("explained_pairs", pairs)
    assert text.startswith("40 items:")
    assert "findings.json" in text
    assert len(text) <= 160
    assert compact({"a": 1, "b": 2, "c": 3, "d": 4}).endswith("(4 keys)")
    assert fmt_evidence("vc_ratio", 1.3456) == "1.35"
