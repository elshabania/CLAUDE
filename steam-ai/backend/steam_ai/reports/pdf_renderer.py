"""Render a :class:`ReportDoc` to PDF with reportlab platypus.

Uses the built-in Helvetica family (no font files needed offline). Long
table cells are wrapped in Paragraphs so tables never overflow the page.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak as RLPageBreak,
    Paragraph as RLParagraph,
    SimpleDocTemplate,
    Spacer,
    Table as RLTable,
    TableStyle,
)

from .model import (
    BulletList,
    Callout,
    Figure,
    Heading,
    PageBreak,
    Paragraph,
    ReportDoc,
    Table,
)

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"
INK = colors.HexColor("#222222")
GREY = colors.HexColor("#808080")
RED = colors.HexColor("#C00000")
NAVY = colors.HexColor("#1F3A5F")
HEADER_FILL = colors.HexColor("#D9E2F3")
CALLOUT_FILL = {
    "draft": colors.HexColor("#FDE9E9"),
    "synthetic": colors.HexColor("#FFF4CC"),
    "Critical": colors.HexColor("#F8D7D7"),
    "High": colors.HexColor("#FCE4D6"),
    "Medium": colors.HexColor("#FFF2CC"),
    "Info": colors.HexColor("#EDEDED"),
    "note": colors.HexColor("#EDEDED"),
}
CALLOUT_LABEL = {"draft": "DRAFT", "synthetic": "SYNTHETIC DATA"}
MARGIN = 2.0 * cm
PAGE_W, PAGE_H = A4
FRAME_W = PAGE_W - 2 * MARGIN
FIG_W = 16 * cm


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    s: dict[str, ParagraphStyle] = {}
    s["body"] = ParagraphStyle("body", parent=base["Normal"], fontName=FONT, fontSize=10,
                               leading=13.5, textColor=INK, spaceAfter=6)
    s["body_tight"] = ParagraphStyle("body_tight", parent=s["body"], spaceAfter=0)
    s["src"] = ParagraphStyle("src", parent=s["body"], fontSize=7, leading=9, textColor=GREY,
                              spaceAfter=6)
    s["title"] = ParagraphStyle("title", parent=s["body"], fontName=FONT_BOLD, fontSize=24,
                                leading=29, spaceAfter=6, spaceBefore=18)
    s["subtitle"] = ParagraphStyle("subtitle", parent=s["body"], fontSize=13, leading=17,
                                   spaceAfter=10)
    s["meta"] = ParagraphStyle("meta", parent=s["body"], fontSize=9, leading=12, textColor=GREY,
                               spaceAfter=12)
    s["h1"] = ParagraphStyle("h1", parent=s["body"], fontName=FONT_BOLD, fontSize=16,
                             leading=20, textColor=NAVY, spaceBefore=14, spaceAfter=8)
    s["h2"] = ParagraphStyle("h2", parent=s["body"], fontName=FONT_BOLD, fontSize=13,
                             leading=16, textColor=NAVY, spaceBefore=10, spaceAfter=6)
    s["h3"] = ParagraphStyle("h3", parent=s["body"], fontName=FONT_BOLD, fontSize=11,
                             leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=4)
    s["cell"] = ParagraphStyle("cell", parent=s["body"], fontSize=8, leading=10, spaceAfter=0)
    s["cell_head"] = ParagraphStyle("cell_head", parent=s["cell"], fontName=FONT_BOLD)
    s["caption"] = ParagraphStyle("caption", parent=s["body"], fontName=FONT_BOLD, fontSize=9,
                                  leading=12, spaceAfter=2)
    s["fig_caption"] = ParagraphStyle("fig_caption", parent=s["body"], fontName=FONT_ITALIC,
                                      fontSize=9, leading=12, alignment=TA_CENTER, spaceAfter=2)
    s["callout"] = ParagraphStyle("callout", parent=s["body"], spaceAfter=0, leading=13.5)
    return s


def _esc(text: object) -> str:
    return escape(str(text)).replace("\n", "<br/>")


def _col_widths(block: Table) -> list[float]:
    """Weight columns by the length of their content, with floor and ceiling."""
    n = len(block.columns)
    if n == 0:
        return []
    weights = []
    for i, col in enumerate(block.columns):
        lens = [len(str(col))] + [len(str(r[i])) for r in block.rows if i < len(r)]
        typical = sorted(lens)[int(0.8 * (len(lens) - 1))] if lens else 8
        weights.append(min(max(typical, 6), 60))
    total = float(sum(weights))
    widths = [FRAME_W * w / total for w in weights]
    min_w = 1.6 * cm
    deficit = sum(max(0.0, min_w - w) for w in widths)
    if deficit > 0:
        widths = [max(w, min_w) for w in widths]
        spare = [w - min_w for w in widths]
        spare_total = sum(spare) or 1.0
        widths = [w - deficit * sp / spare_total for w, sp in zip(widths, spare)]
    return widths


def _table(block: Table, s: dict[str, ParagraphStyle]) -> list:
    flow: list = []
    if block.caption:
        flow.append(RLParagraph(_esc(block.caption), s["caption"]))
    data = [[RLParagraph(_esc(c), s["cell_head"]) for c in block.columns]]
    n = len(block.columns)
    for row in block.rows:
        cells = list(row) + [""] * (n - len(row))
        data.append([RLParagraph(_esc(c), s["cell"]) for c in cells[:n]])
    tbl = RLTable(data, colWidths=_col_widths(block), repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BFBFBF")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    flow.append(tbl)
    if block.source_ref:
        flow.append(Spacer(1, 2))
        flow.append(RLParagraph(_esc(block.source_ref), s["src"]))
    else:
        flow.append(Spacer(1, 8))
    return flow


def _figure(block: Figure, s: dict[str, ParagraphStyle]) -> list:
    path = Path(block.path_png)
    if not path.exists():
        return [RLParagraph(_esc(f"Figure not available: {path.name}"), s["meta"])]
    iw, ih = ImageReader(str(path)).getSize()
    width = min(FIG_W, FRAME_W)
    height = width * ih / iw
    max_h = PAGE_H - 2 * MARGIN - 3 * cm
    if height > max_h:
        height = max_h
        width = height * iw / ih
    items: list = [Image(str(path), width=width, height=height),
                   RLParagraph(_esc(block.caption), s["fig_caption"])]
    if block.source_ref:
        items.append(RLParagraph(_esc(block.source_ref), s["src"]))
    else:
        items.append(Spacer(1, 8))
    return [KeepTogether(items)]


def _callout(block: Callout, s: dict[str, ParagraphStyle]) -> list:
    label = CALLOUT_LABEL.get(block.severity, block.severity)
    colour = "#C00000" if block.severity in ("draft", "Critical") else "#222222"
    text = f'<font color="{colour}"><b>{_esc(label)}:</b></font> {_esc(block.text)}'
    inner = RLTable([[RLParagraph(text, s["callout"])]], colWidths=[FRAME_W])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CALLOUT_FILL.get(block.severity, CALLOUT_FILL["note"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [inner, Spacer(1, 8)]


def _page_decorator(report: ReportDoc):
    meta = report.metadata
    footer_text = (f"{report.title} | run {meta.run_id} | generated {meta.generated_at} "
                   f"by STEAM-AI {meta.steam_ai_version}")

    def on_page(canvas, doc) -> None:
        canvas.saveState()
        # header watermark text
        canvas.setFont(FONT_ITALIC, 8)
        canvas.setFillColor(GREY)
        canvas.drawCentredString(PAGE_W / 2, PAGE_H - MARGIN + 0.8 * cm, meta.watermark)
        # faint diagonal DRAFT
        canvas.setFont(FONT_BOLD, 90)
        canvas.setFillColor(colors.Color(0.6, 0.6, 0.6, alpha=0.08))
        canvas.translate(PAGE_W / 2, PAGE_H / 2)
        canvas.rotate(45)
        canvas.drawCentredString(0, 0, "DRAFT")
        canvas.restoreState()
        canvas.saveState()
        canvas.setFont(FONT, 8)
        canvas.setFillColor(GREY)
        canvas.drawString(MARGIN, MARGIN - 0.9 * cm, footer_text)
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 0.9 * cm, f"Page {doc.page}")
        canvas.restoreState()

    return on_page


def render_pdf(report: ReportDoc, out_path: Path) -> Path:
    s = _styles()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN, title=report.title,
        author=f"STEAM-AI {report.metadata.steam_ai_version}", subject=report.subtitle,
    )
    meta = report.metadata
    story: list = [
        RLParagraph(_esc(report.title), s["title"]),
        RLParagraph(_esc(report.subtitle), s["subtitle"]),
        RLParagraph(_esc(f"Generated {meta.generated_at} by STEAM-AI {meta.steam_ai_version}. "
                         f"Ingested {meta.ingested_at}."), s["meta"]),
    ]
    for block in report.blocks:
        if isinstance(block, Heading):
            level = min(max(block.level, 1), 3)
            story.append(RLParagraph(_esc(block.text), s[f"h{level}"]))
        elif isinstance(block, Paragraph):
            style = s["body_tight"] if block.source_ref else s["body"]
            story.append(RLParagraph(_esc(block.text), style))
            if block.source_ref:
                story.append(RLParagraph(_esc(block.source_ref), s["src"]))
        elif isinstance(block, BulletList):
            story.append(ListFlowable(
                [ListItem(RLParagraph(_esc(i), s["body_tight"]), leftIndent=12)
                 for i in block.items],
                bulletType="bullet", start="-", bulletFontName=FONT, bulletFontSize=9))
            story.append(Spacer(1, 6))
        elif isinstance(block, Table):
            story.extend(_table(block, s))
        elif isinstance(block, Figure):
            story.extend(_figure(block, s))
        elif isinstance(block, PageBreak):
            story.append(RLPageBreak())
        elif isinstance(block, Callout):
            story.extend(_callout(block, s))
        else:  # pragma: no cover - defensive
            raise TypeError(f"unknown block type {type(block).__name__}")

    decorator = _page_decorator(report)
    doc.build(story, onFirstPage=decorator, onLaterPages=decorator)
    return out_path
