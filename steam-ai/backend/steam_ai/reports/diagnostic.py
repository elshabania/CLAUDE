"""Build the diagnostic report (DOCX and PDF) for a run and record it in the audit log."""

from __future__ import annotations

import time
from pathlib import Path

from .. import audit
from ..store import RunStore
from . import figures
from .docx_renderer import render_docx
from .model import build_diagnostic_report
from .pdf_renderer import render_pdf


def build(store: RunStore, out_dir: Path | None = None) -> dict[str, Path]:
    """Render report.docx and report.pdf into ``out_dir`` (default: the run's derived/).

    Returns ``{"docx": path, "pdf": path}`` and appends a ``report_generated``
    audit entry.
    """
    started = time.perf_counter()
    target = Path(out_dir) if out_dir is not None else store.derived_path("")
    target.mkdir(parents=True, exist_ok=True)

    figs = figures.build_all(store)
    report = build_diagnostic_report(store, figures=figs)
    docx_path = render_docx(report, target / "report.docx")
    pdf_path = render_pdf(report, target / "report.pdf")

    audit.record(
        "report_generated",
        run_id=store.run_id,
        report="diagnostic",
        docx=str(docx_path),
        pdf=str(pdf_path),
        n_blocks=len(report.blocks),
        n_findings=len(store.findings()),
        figures=sorted(figs.keys()),
        duration_s=round(time.perf_counter() - started, 3),
        synthetic=store.manifest().is_synthetic,
    )
    return {"docx": docx_path, "pdf": pdf_path}
