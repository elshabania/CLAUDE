"""Renderer-independent report model and the diagnostic report assembly.

A :class:`ReportDoc` is a title, metadata and an ordered list of blocks. The
DOCX and PDF renderers consume it without knowing where the content came
from. Every paragraph that states a number carries a ``source_ref`` so the
reader can trace it to a derived artefact, a table row or a config file.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .. import __version__, config
from ..models import KPI, Finding, Severity
from ..store import RunStore

# --- Blocks -------------------------------------------------------------------


@dataclass
class Heading:
    level: int
    text: str


@dataclass
class Paragraph:
    text: str
    source_ref: str | None = None


@dataclass
class BulletList:
    items: list[str]


@dataclass
class Table:
    columns: list[str]
    rows: list[list[str]]
    caption: str | None = None
    source_ref: str | None = None


@dataclass
class Figure:
    path_png: Path
    caption: str
    source_ref: str | None = None


@dataclass
class PageBreak:
    pass


@dataclass
class Callout:
    severity: str  # draft | synthetic | Critical | High | Medium | Info | note
    text: str


Block = Heading | Paragraph | BulletList | Table | Figure | PageBreak | Callout


@dataclass
class ReportMeta:
    run_id: str
    scenario: str
    horizon_year: int
    policy_set: str
    steam_version: str
    ingested_at: str
    generated_at: str
    steam_ai_version: str
    watermark: str
    synthetic_banner: str | None = None


@dataclass
class ReportDoc:
    title: str
    subtitle: str
    metadata: ReportMeta
    blocks: list[Block] = field(default_factory=list)

    def structure(self) -> list[str]:
        """Block types in order, with heading texts, for golden comparison."""
        out: list[str] = []
        for b in self.blocks:
            if isinstance(b, Heading):
                out.append(f"Heading:{b.level}:{b.text}")
            elif isinstance(b, Callout):
                out.append(f"Callout:{b.severity}")
            else:
                out.append(type(b).__name__)
        return out

    def headings(self) -> list[str]:
        return [b.text for b in self.blocks if isinstance(b, Heading)]


SEVERITY_ORDER = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.INFO]

GLOSSARY: list[tuple[str, str]] = [
    (
        "V/C",
        "Volume-to-capacity ratio: link volume per hour divided by link capacity per hour. "
        "Values above 1.0 mean demand exceeds capacity.",
    ),
    (
        "GEH",
        "A statistic comparing two flows, M and C: sqrt(2 (M - C)^2 / (M + C)). "
        "Values below 5 are usually treated as a good match.",
    ),
    (
        "Relative gap",
        "Assignment convergence measure: the excess cost of the current route "
        "choices over the cheapest possible routes, divided by total cost. "
        "Smaller is better.",
    ),
    (
        "Noise band",
        "The size of link flow change between the last assignment iterations. "
        "Differences inside the band are not treated as significant.",
    ),
    (
        "Centroid connector",
        "An artificial link that loads a zone's trips onto the network at a chosen node.",
    ),
    (
        "Screenline",
        "An imaginary line across the network on which modelled and observed "
        "crossings are compared.",
    ),
]


# --- Formatting ---------------------------------------------------------------


def _rounding() -> dict[str, Any]:
    return dict(config.reporting().get("rounding", {}))


def fmt(value: Any, kind: str = "number") -> str:
    """Format a value with the rounding conventions from config/reporting.yaml.

    kinds: flow (nearest N vehicles), pct (a percentage number), share (a
    fraction, shown as a percentage), time_min, dist_km, speed_kph, ratio,
    int, number (generic).
    """
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return ", ".join(fmt(v) for v in value)
    if not isinstance(value, (int, float)):
        return str(value)
    r = _rounding()
    x = float(value)
    if kind == "flow":
        step = int(r.get("flows", 10)) or 1
        return f"{int(round(x / step) * step):,}"
    if kind == "pct":
        return f"{x:.{int(r.get('percentages', 1))}f}%"
    if kind == "share":
        return f"{100.0 * x:.{int(r.get('percentages', 1))}f}%"
    if kind == "time_min":
        return f"{x:.{int(r.get('times_min', 0))}f} min"
    if kind == "dist_km":
        return f"{x:.{int(r.get('distances_km', 1))}f} km"
    if kind == "speed_kph":
        return f"{x:.{int(r.get('speeds_kph', 0))}f} km/h"
    if kind == "ratio":
        return f"{x:.2f}"
    if kind == "int":
        return f"{int(round(x)):,}"
    # generic
    if isinstance(value, int) or x.is_integer():
        return f"{int(x):,}"
    if abs(x) >= 100:
        return f"{x:,.0f}"
    if abs(x) >= 10:
        return f"{x:.1f}"
    s = f"{x:.4g}"
    return s


def fmt_kpi(kpi: KPI) -> str:
    unit = (kpi.unit or "").lower()
    if unit == "share":
        return fmt(kpi.value, "share")
    if unit in ("km/h", "kph"):
        return fmt(kpi.value, "speed_kph")
    if unit == "km":
        return fmt(kpi.value, "dist_km")
    if unit == "min":
        return fmt(kpi.value, "time_min")
    if unit in ("trips", "veh-km", "veh", "vehicles", "veh-h"):
        return f"{fmt(kpi.value, 'flow')} {kpi.unit}"
    return f"{fmt(kpi.value)} {kpi.unit}".strip()


_EVIDENCE_MAX_CHARS = 160
_EVIDENCE_MAX_ITEMS = 3


def compact(value: Any, max_items: int = _EVIDENCE_MAX_ITEMS,
            max_chars: int = _EVIDENCE_MAX_CHARS) -> str:
    """Short, page-safe text for a list or dict evidence value.

    Long per-item lists (for example every explained sector pair) live in
    findings.json; the table shows the count and the first few items so a cell
    can never grow taller than a page.
    """
    if isinstance(value, dict):
        items = [f"{k}={compact(v, max_items, max_chars)}" for k, v in value.items()]
        text = ", ".join(items[:max_items])
        if len(items) > max_items:
            text += f", ... ({len(items)} keys)"
    elif isinstance(value, (list, tuple)):
        items = [compact(v, max_items, max_chars) if isinstance(v, (dict, list, tuple))
                 else fmt(v) for v in value[:max_items]]
        preview = ", ".join(items)
        if len(value) > max_items:
            # Count and pointer first so truncation only ever eats the preview.
            head = f"{len(value)} items (full list in findings.json): "
            room = max(10, max_chars - len(head))
            if len(preview) > room:
                preview = preview[: room - 3] + "..."
            return head + preview
        text = preview
    else:
        text = fmt(value)
    if len(text) > max_chars:
        text = text[: max_chars - 3] + "..."
    return text


def fmt_evidence(key: str, value: Any) -> str:
    k = key.lower()
    if isinstance(value, (dict, list, tuple)):
        return compact(value)
    if isinstance(value, (bool, str)) or value is None:
        return fmt(value)
    if "vc" in k or k.endswith("ratio"):
        return fmt(value, "ratio")
    if "share" in k:
        return fmt(value, "share")
    if any(t in k for t in ("volume", "capacity", "trips", "flow")):
        return fmt(value, "flow")
    if "speed" in k:
        return fmt(value, "speed_kph")
    return fmt(value)


# --- Helpers ------------------------------------------------------------------


def _location_text(f: Finding) -> str:
    loc = f.location
    base = loc.label or f"{loc.type.value} {loc.id}"
    period = f.evidence.period
    if period and period not in base.split():
        return f"{base}, {period}"
    return base


def _sources_text(f: Finding) -> str:
    parts = []
    for s in f.evidence.sources:
        p = s.file
        if s.table:
            p += f" ({s.table})"
        if s.row is not None:
            p += f" row {s.row}"
        if s.column:
            p += f" col {s.column}"
        parts.append(p)
    return "; ".join(parts)


def _src(*parts: str) -> str:
    return "[src: " + "; ".join(p for p in parts if p) + "]"


def _finding_src(f: Finding) -> str:
    return _src(f"findings/{f.finding_id}", _sources_text(f))


def rank_findings(findings: Sequence[Finding]) -> list[Finding]:
    """Severity first, significant before insignificant, then id for determinism."""
    return sorted(findings, key=lambda f: (f.severity.rank, not f.is_significant, f.finding_id))


def _best_measure(f: Finding) -> str:
    if not f.measures:
        return "No measure proposed"
    conf_rank = {"high": 0, "medium": 1, "low": 2}
    m = sorted(f.measures, key=lambda m: (conf_rank.get(m.confidence, 3), m.measure_id))[0]
    text = f"{m.title} ({m.method.value.replace('_', ' ')}, {m.confidence} confidence)"
    if m.estimated_effect:
        text += f": {m.estimated_effect}"
    return text


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# --- Sections -----------------------------------------------------------------


def _cover(meta: ReportMeta) -> list[Block]:
    blocks: list[Block] = [Callout("draft", meta.watermark)]
    if meta.synthetic_banner:
        blocks.append(Callout("synthetic", meta.synthetic_banner))
    rows = [
        ["Run id", meta.run_id],
        ["Scenario", meta.scenario],
        ["Horizon year", str(meta.horizon_year)],
        ["Policy set", meta.policy_set],
        ["STEAM version", meta.steam_version],
        ["Ingested at", meta.ingested_at],
        ["Report generated at", meta.generated_at],
        ["STEAM-AI version", meta.steam_ai_version],
    ]
    blocks.append(
        Table(["Item", "Value"], rows, caption="Run details", source_ref=_src("manifest.json"))
    )
    blocks.append(
        Paragraph(
            "This report lists what STEAM-AI found when it checked the run, ranked by how "
            "much each issue matters. Every number carries a source reference in small grey "
            "text. The report is a draft for modeller review and is not a model result."
        )
    )
    blocks.append(PageBreak())
    return blocks


def _executive_summary(store: RunStore, ranked: list[Finding]) -> list[Block]:
    blocks: list[Block] = [Heading(1, "Executive summary")]
    health = store.health()
    if health is None:
        blocks.append(
            Paragraph(
                "No data available for this run: the health score has not been computed "
                "(derived/health.json is missing)."
            )
        )
    else:
        blocks.append(
            Paragraph(
                f"Run health score: {health.score:.1f} out of 100, grade {health.grade}.",
                source_ref=_src("health.json"),
            )
        )
        blocks.append(
            Paragraph(
                f"Definition: {health.definition.strip()}",
                source_ref=_src("config/health.yaml", "health.json"),
            )
        )
        if health.components:
            rows = [
                [c.name.capitalize(), f"{c.score:.1f}", fmt(c.weight, "ratio"), c.detail]
                for c in health.components
            ]
            blocks.append(
                Table(
                    ["Component", "Score", "Weight", "Detail"],
                    rows,
                    caption="Health score components",
                    source_ref=_src("health.json"),
                )
            )

    n_total = len(ranked)
    n_insig = sum(1 for f in ranked if not f.is_significant)
    counts = {s: sum(1 for f in ranked if f.severity == s) for s in SEVERITY_ORDER}
    if n_total == 0:
        blocks.append(
            Paragraph(
                "The checks produced no findings for this run.", source_ref=_src("findings.json")
            )
        )
    else:
        parts = ", ".join(f"{counts[s]} {s.value}" for s in SEVERITY_ORDER)
        text = f"The checks produced {n_total} findings: {parts}."
        if n_insig:
            text += (
                f" {n_insig} of these fall inside the noise band and are reported "
                f"for information only."
            )
        blocks.append(Paragraph(text, source_ref=_src("findings.json")))
        blocks.append(
            Table(
                ["Severity", "Findings", "Significant"],
                [
                    [
                        s.value,
                        str(counts[s]),
                        str(sum(1 for f in ranked if f.severity == s and f.is_significant)),
                    ]
                    for s in SEVERITY_ORDER
                ],
                caption="Findings by severity",
                source_ref=_src("findings.json"),
            )
        )

    blocks.append(Heading(2, "Top five findings"))
    top = ranked[:5]
    if not top:
        blocks.append(Paragraph("No data available for this run: there are no findings."))
    else:
        rows = [
            [str(i + 1), f.severity.value, _location_text(f), f.executive_line]
            for i, f in enumerate(top)
        ]
        blocks.append(
            Table(
                ["Rank", "Severity", "Location", "Finding"],
                rows,
                caption="Top five findings by severity",
                source_ref=_src(*[f"findings/{f.finding_id}" for f in top]),
            )
        )
    return blocks


def _fix_first(ranked: list[Finding], limit: int = 10) -> list[Block]:
    blocks: list[Block] = [Heading(1, "What to fix first")]
    action = [
        f for f in ranked if f.severity in (Severity.CRITICAL, Severity.HIGH) and f.is_significant
    ]
    if not action:
        blocks.append(
            Paragraph(
                "No Critical or High findings: nothing needs immediate action for this run.",
                source_ref=_src("findings.json"),
            )
        )
        return blocks
    shown = action[:limit]
    blocks.append(
        Paragraph(
            f"{len(action)} Critical or High findings need action. "
            f"Fix them in the order below; Critical items block use of the run.",
            source_ref=_src("findings.json"),
        )
    )
    rows = [
        [
            f.severity.value,
            _location_text(f),
            f.executive_line,
            f.suggested_action,
            _best_measure(f),
        ]
        for f in shown
    ]
    blocks.append(
        Table(
            ["Severity", "Location", "Finding", "Suggested action", "Best measure"],
            rows,
            caption="Action list",
            source_ref=_src(*[f"findings/{f.finding_id}" for f in shown]),
        )
    )
    if len(action) > limit:
        blocks.append(
            Paragraph(
                f"{len(action) - limit} further Critical or High findings are listed in the "
                f"findings section.",
                source_ref=_src("findings.json"),
            )
        )
    return blocks


def _finding_blocks(f: Finding) -> list[Block]:
    blocks: list[Block] = [Heading(3, f"{f.check_name}: {_location_text(f)}")]
    src = _finding_src(f)
    blocks.append(Callout(f.severity.value, f.executive_line))
    if not f.is_significant:
        blocks.append(
            Paragraph(
                "This finding is inside the noise band and is not significant.", source_ref=src
            )
        )
    blocks.append(Paragraph(f"Modeller view: {f.modeller_view}", source_ref=src))
    blocks.append(Paragraph(f"Likely cause: {f.likely_cause}", source_ref=src))
    blocks.append(Paragraph(f"Suggested action: {f.suggested_action}", source_ref=src))
    ev = f.evidence
    if ev.values or ev.thresholds:
        keys = list(ev.values.keys())
        for k in ev.thresholds:
            if k not in keys:
                keys.append(k)
        rows = []
        for k in keys:
            rows.append(
                [
                    k,
                    fmt_evidence(k, ev.values.get(k)) if k in ev.values else "",
                    fmt_evidence(k, ev.thresholds.get(k)) if k in ev.thresholds else "",
                ]
            )
        blocks.append(
            Table(["Metric", "Value", "Threshold"], rows, caption="Evidence", source_ref=src)
        )
    if ev.sources:
        blocks.append(Paragraph("Sources: " + _sources_text(f), source_ref=src))
    else:
        blocks.append(Paragraph("Sources: none recorded for this finding.", source_ref=src))
    if f.measures:
        rows = [
            [
                m.title,
                m.description,
                m.estimated_effect or "Not estimated",
                m.method.value.replace("_", " "),
                m.confidence,
            ]
            for m in f.measures
        ]
        blocks.append(
            Table(
                ["Measure", "Description", "Estimated effect", "Method", "Confidence"],
                rows,
                caption="Proposed measures",
                source_ref=src,
            )
        )
    return blocks


def _findings_by_severity(ranked: list[Finding], cap: int) -> list[Block]:
    blocks: list[Block] = [PageBreak(), Heading(1, "Findings by severity")]
    body = ranked[:cap]
    omitted = len(ranked) - len(body)
    if omitted > 0:
        blocks.append(
            Paragraph(
                f"This section shows the {len(body)} highest-ranked findings; {omitted} lower-ranked "
                f"findings are omitted from the body (limit {cap}, from config/reporting.yaml). "
                f"All findings are in derived/findings.json.",
                source_ref=_src("findings.json", "config/reporting.yaml"),
            )
        )
    for s in SEVERITY_ORDER:
        n_all = sum(1 for f in ranked if f.severity == s)
        blocks.append(Heading(2, f"{s.value} findings ({n_all})"))
        group = [f for f in body if f.severity == s]
        if n_all == 0:
            blocks.append(Paragraph(f"No {s.value} findings for this run."))
            continue
        if not group:
            blocks.append(
                Paragraph(
                    f"All {n_all} {s.value} findings are outside the body limit; "
                    f"see derived/findings.json.",
                    source_ref=_src("findings.json"),
                )
            )
            continue
        for f in group:
            blocks.extend(_finding_blocks(f))
    return blocks


def _convergence(
    store: RunStore, ranked: list[Finding], figures: Mapping[str, tuple[Path, str]]
) -> list[Block]:
    blocks: list[Block] = [PageBreak(), Heading(1, "Convergence and noise")]
    results = {r.get("check_id"): r for r in store.check_results()}
    res = results.get("convergence_and_noise")
    if res is None:
        blocks.append(
            Paragraph(
                "No data available for this run: the convergence_and_noise check did not run."
            )
        )
    else:
        status = str(res.get("status", "unknown"))
        msg = res.get("message") or "no message"
        blocks.append(
            Paragraph(
                f"Check status: {status}; findings: {int(res.get('n_findings', 0))}; "
                f"message: {msg}.",
                source_ref=_src("check_results.json"),
            )
        )

    conv_findings = [f for f in ranked if f.check_id == "convergence_and_noise"]
    if conv_findings:
        rows = [[f.severity.value, _location_text(f), f.executive_line] for f in conv_findings]
        blocks.append(
            Table(
                ["Severity", "Location", "Finding"],
                rows,
                caption="Convergence findings",
                source_ref=_src(*[f"findings/{f.finding_id}" for f in conv_findings]),
            )
        )
    else:
        blocks.append(
            Paragraph("The convergence check raised no findings.", source_ref=_src("findings.json"))
        )

    if store.has("convergence"):
        df = store.query(
            "SELECT stage, period, metric, MAX(iteration) AS iterations, "
            "arg_max(value, iteration) AS final_value "
            "FROM convergence GROUP BY stage, period, metric ORDER BY stage, period, metric"
        )
        params = (
            config.checks().get("checks", {}).get("convergence_and_noise", {}).get("params", {})
        )
        target = params.get("rel_gap_target")
        rows = []
        for r in df.itertuples():
            met = ""
            if r.metric == "REL_GAP" and target is not None:
                met = "yes" if float(r.final_value) <= float(target) else "no"
            rows.append(
                [
                    str(r.stage),
                    str(r.period),
                    str(r.metric),
                    str(int(r.iterations)),
                    fmt(float(r.final_value)),
                    met,
                ]
            )
        blocks.append(
            Table(
                ["Stage", "Period", "Metric", "Iterations", "Final value", "Target met"],
                rows,
                caption=(
                    f"Final convergence values (relative gap target {fmt(target)})"
                    if target is not None
                    else "Final convergence values"
                ),
                source_ref=_src("convergence table", "config/checks.yaml"),
            )
        )
    else:
        blocks.append(
            Paragraph(
                "No convergence table was exported with this run, so iteration history "
                "is not available."
            )
        )

    nb = store.noise_band()
    if nb is None:
        blocks.append(
            Paragraph(
                "No noise band has been computed for this run (derived/noise_band.parquet "
                "is missing), so significance tests use the default rule."
            )
        )
    else:
        blocks.append(
            Paragraph(
                f"The noise band table has {len(nb)} rows with columns "
                f"{', '.join(map(str, nb.columns))}.",
                source_ref=_src("noise_band.parquet"),
            )
        )

    fig = figures.get("convergence")
    if fig is not None:
        blocks.append(
            Figure(fig[0], "Relative gap by iteration and period (log scale)", source_ref=fig[1])
        )
    return blocks


def _kpis(store: RunStore) -> list[Block]:
    blocks: list[Block] = [Heading(1, "Key performance indicators")]
    kpis = store.kpis()
    if not kpis:
        blocks.append(
            Paragraph(
                "No data available for this run: no KPIs have been computed "
                "(derived/kpis.json is missing or empty)."
            )
        )
        return blocks
    rows = [[k.name, fmt_kpi(k), k.period or "all", k.definition] for k in kpis]
    blocks.append(
        Table(
            ["KPI", "Value", "Period", "Definition"],
            rows,
            caption="KPIs with their published definitions",
            source_ref=_src("kpis.json", "config/kpis.yaml"),
        )
    )
    return blocks


def _maps_and_charts(figures: Mapping[str, tuple[Path, str]]) -> list[Block]:
    blocks: list[Block] = [PageBreak(), Heading(1, "Maps and charts")]
    captions = {
        "network_map": "Network map: links coloured by AM V/C (user class ALL), "
        "Critical and High finding locations marked",
        "vc_hist": "Distribution of link V/C ratios, AM and PM (user class ALL)",
        "findings_by_check": "Findings by check and severity",
    }
    any_fig = False
    for key in ("network_map", "vc_hist", "findings_by_check"):
        fig = figures.get(key)
        if fig is None:
            continue
        any_fig = True
        blocks.append(Figure(fig[0], captions[key], source_ref=fig[1]))
    if not any_fig:
        blocks.append(
            Paragraph(
                "No data available for this run: the tables needed for the map and charts "
                "(links, link_flows) or the findings are missing, or charts are disabled in "
                "config/reporting.yaml."
            )
        )
    return blocks


def _check_coverage(store: RunStore) -> list[Block]:
    blocks: list[Block] = [Heading(1, "Check coverage")]
    results = store.check_results()
    if not results:
        blocks.append(
            Paragraph(
                "No data available for this run: no check results were recorded "
                "(derived/check_results.json is missing)."
            )
        )
        return blocks
    n_ok = sum(1 for r in results if r.get("status") == "ok")
    n_skip = sum(1 for r in results if r.get("status") == "skipped")
    n_err = sum(1 for r in results if r.get("status") == "error")
    blocks.append(
        Paragraph(
            f"{len(results)} checks were run: {n_ok} completed, {n_skip} skipped because a "
            f"required table was missing, {n_err} ended in error.",
            source_ref=_src("check_results.json"),
        )
    )
    rows = [
        [
            str(r.get("check_name") or r.get("check_id")),
            str(r.get("status")),
            str(int(r.get("n_findings", 0))),
            str(r.get("message") or ""),
            f"{float(r.get('duration_s', 0.0)):.2f}",
        ]
        for r in results
    ]
    blocks.append(
        Table(
            ["Check", "Status", "Findings", "Message", "Duration (s)"],
            rows,
            caption="Check coverage",
            source_ref=_src("check_results.json"),
        )
    )
    return blocks


def _appendix() -> list[Block]:
    blocks: list[Block] = [PageBreak(), Heading(1, "Appendix"), Heading(2, "Method notes")]
    cfg = config.checks()
    checks = cfg.get("checks", {})
    defaults = cfg.get("defaults", {})
    blocks.append(
        Paragraph(
            "Each check maps a computed score to a severity band. Bands are checked top-down "
            "and the first match wins. The thresholds below are read from config/checks.yaml "
            f"(defaults: {', '.join(f'{k}={v}' for k, v in defaults.items())}).",
            source_ref=_src("config/checks.yaml"),
        )
    )
    rows = []
    for cid, spec in checks.items():
        params = spec.get("params", {}) or {}
        ptext = (
            "; ".join(
                f"{k} = {fmt(v) if not isinstance(v, dict) else v}" for k, v in params.items()
            )
            or "none"
        )
        rules = "; ".join(f"{b['severity']} when {b['when']}" for b in spec.get("severity", []))
        rows.append([cid, "yes" if spec.get("enabled", True) else "no", ptext, rules or "none"])
    blocks.append(
        Table(
            ["Check", "Enabled", "Parameters", "Severity rules"],
            rows,
            caption="Check thresholds and severity rules",
            source_ref=_src("config/checks.yaml"),
        )
    )
    blocks.append(Heading(2, "Glossary"))
    blocks.append(
        Table(
            ["Term", "Meaning"],
            [[t, d] for t, d in GLOSSARY],
            caption="Glossary",
            source_ref=_src("STEAM-AI glossary"),
        )
    )
    return blocks


# --- Assembly -----------------------------------------------------------------


def build_diagnostic_report(
    store: RunStore,
    figures: Mapping[str, tuple[Path, str]] | None = None,
    reporting_cfg: Mapping[str, Any] | None = None,
) -> ReportDoc:
    """Assemble the diagnostic report for a run.

    ``figures`` maps figure keys (network_map, vc_hist, findings_by_check,
    convergence) to (png_path, source_ref); when None they are built with
    :mod:`steam_ai.reports.figures`. ``reporting_cfg`` overrides
    config/reporting.yaml (used by tests).
    """
    rcfg = dict(reporting_cfg) if reporting_cfg is not None else config.reporting()
    diag = rcfg.get("diagnostic_report", {})
    cap = int(diag.get("max_findings_in_body", 50))
    manifest = store.manifest()

    if figures is None:
        from . import figures as figmod

        figures = figmod.build_all(store, reporting_cfg=rcfg)

    meta = ReportMeta(
        run_id=manifest.run_id,
        scenario=manifest.scenario_name,
        horizon_year=manifest.horizon_year,
        policy_set=manifest.policy_set,
        steam_version=manifest.steam_version,
        ingested_at=manifest.ingested_at.isoformat(),
        generated_at=_now_iso(),
        steam_ai_version=__version__,
        watermark=str(rcfg.get("draft_watermark", "DRAFT")),
        synthetic_banner=str(rcfg.get("synthetic_banner", "SYNTHETIC DATA"))
        if manifest.is_synthetic
        else None,
    )
    ranked = rank_findings(store.findings())

    blocks: list[Block] = []
    blocks += _cover(meta)
    blocks += _executive_summary(store, ranked)
    blocks += _fix_first(ranked)
    blocks += _findings_by_severity(ranked, cap)
    blocks += _convergence(store, ranked, figures)
    blocks += _kpis(store)
    blocks += _maps_and_charts(figures)
    blocks += _check_coverage(store)
    blocks += _appendix()

    return ReportDoc(
        title=str(diag.get("title", "STEAM-AI Diagnostic Report")),
        subtitle=f"{manifest.scenario_name}, horizon {manifest.horizon_year}, run {manifest.run_id}",
        metadata=meta,
        blocks=blocks,
    )
