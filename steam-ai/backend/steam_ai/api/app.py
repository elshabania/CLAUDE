"""FastAPI application: versioned REST API (docs/api.md) plus static frontend."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import __version__, audit, config
from ..jobs import QUEUE
from ..models import Severity
from ..paths import FRONTEND_DIST
from ..store import RunNotFound, RunStore, list_runs

API_PREFIX = "/api/v1"

app = FastAPI(title="STEAM-AI API", version=__version__, docs_url="/api/docs",
              openapi_url="/api/openapi.json")


# --- helpers ------------------------------------------------------------------

def get_store(run_id: str) -> RunStore:
    try:
        return RunStore(run_id)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found") from exc


def _health_summary(store: RunStore) -> dict[str, Any] | None:
    h = store.health()
    return {"score": h.score, "grade": h.grade} if h else None


# --- runs ---------------------------------------------------------------------

@app.get(f"{API_PREFIX}/health")
def liveness() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get(f"{API_PREFIX}/runs")
def runs() -> list[dict[str, Any]]:
    out = []
    for m in list_runs():
        try:
            store = RunStore(m.run_id)
            health = _health_summary(store)
            store.close()
        except RunNotFound:
            health = None
        out.append({
            "run_id": m.run_id, "scenario_name": m.scenario_name,
            "horizon_year": m.horizon_year, "policy_set": m.policy_set,
            "base_run_id": m.base_run_id, "ingested_at": m.ingested_at.isoformat(),
            "status": m.status, "is_synthetic": m.is_synthetic, "health": health,
            "tables": m.tables, "periods": m.periods,
        })
    return out


@app.get(f"{API_PREFIX}/runs/{{run_id}}")
def run_detail(store: RunStore = Depends(get_store)) -> dict[str, Any]:
    m = store.manifest().model_dump(mode="json")
    m["health"] = _health_summary(store)
    return m


@app.get(f"{API_PREFIX}/runs/{{run_id}}/health")
def run_health(store: RunStore = Depends(get_store)) -> dict[str, Any]:
    h = store.health()
    if h is None:
        raise HTTPException(404, "health not computed yet for this run")
    return h.model_dump(mode="json")


@app.get(f"{API_PREFIX}/runs/{{run_id}}/findings")
def run_findings(
    store: RunStore = Depends(get_store),
    severity: Severity | None = None,
    check_id: str | None = None,
    location_type: str | None = None,
    significant_only: bool = False,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    items = store.findings()
    if severity:
        items = [f for f in items if f.severity == severity]
    if check_id:
        items = [f for f in items if f.check_id == check_id]
    if location_type:
        items = [f for f in items if f.location.type.value == location_type]
    if significant_only:
        items = [f for f in items if f.is_significant]
    items.sort(key=lambda f: (f.severity.rank, f.check_id, f.location.id))
    total = len(items)
    page = items[offset: offset + limit]
    return {"total": total, "items": [f.model_dump(mode="json") for f in page]}


@app.get(f"{API_PREFIX}/runs/{{run_id}}/findings/{{finding_id}}")
def finding_detail(finding_id: str, store: RunStore = Depends(get_store)) -> dict[str, Any]:
    for f in store.findings():
        if f.finding_id == finding_id:
            return f.model_dump(mode="json")
    raise HTTPException(404, "finding not found")


@app.get(f"{API_PREFIX}/runs/{{run_id}}/checks")
def run_checks(store: RunStore = Depends(get_store)) -> list[dict[str, Any]]:
    return store.check_results()


@app.get(f"{API_PREFIX}/runs/{{run_id}}/kpis")
def run_kpis(store: RunStore = Depends(get_store)) -> list[dict[str, Any]]:
    return [k.model_dump(mode="json") for k in store.kpis()]


@app.get(f"{API_PREFIX}/runs/{{run_id}}/changes")
def run_changes(store: RunStore = Depends(get_store)) -> dict[str, Any]:
    base = store.base_store()
    if base is None:
        return {"base_run_id": None}
    from ..changes import compute

    try:
        return compute(store, base)
    finally:
        base.close()


# --- network views --------------------------------------------------------------

_LINK_SQL = """
SELECT l.link_id, l.a_node, l.b_node, l.link_class, l.area_type, l.lanes,
       l.capacity_vph, l.ffs_kph, l.length_m, l.geometry_wkt,
       f.volume, f.vc_ratio, f.cong_speed_kph, f.delay_s
FROM links l
LEFT JOIN link_flows f
  ON f.link_id = l.link_id AND f.period = ? AND f.user_class = 'ALL'
"""


def _wkt_line_to_coords(wkt: str) -> list[list[float]]:
    body = wkt.strip()[len("LINESTRING"):].strip().strip("()")
    return [[float(x), float(y)] for x, y in (p.split() for p in body.split(","))]


@app.get(f"{API_PREFIX}/runs/{{run_id}}/links")
def run_links(store: RunStore = Depends(get_store), period: str = "AM",
              metric: str = "vc") -> JSONResponse:
    df = store.query(_LINK_SQL, [period])
    counts: dict[int, tuple[int, int]] = {}
    for f in store.findings():
        if f.location.type.value == "link":
            try:
                lid = int(f.location.id)
            except ValueError:
                continue
            n, worst = counts.get(lid, (0, 99))
            counts[lid] = (n + 1, min(worst, f.severity.rank))
    rank_to_sev = {0: "Critical", 1: "High", 2: "Medium", 3: "Info"}
    features = []
    for r in df.itertuples(index=False):
        n, worst = counts.get(int(r.link_id), (0, 99))
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": _wkt_line_to_coords(r.geometry_wkt)},
            "properties": {
                "link_id": int(r.link_id), "a_node": int(r.a_node), "b_node": int(r.b_node),
                "link_class": r.link_class, "area_type": r.area_type, "lanes": r.lanes,
                "capacity_vph": r.capacity_vph, "ffs_kph": r.ffs_kph, "length_m": r.length_m,
                "volume": None if r.volume != r.volume else r.volume,
                "vc_ratio": None if r.vc_ratio != r.vc_ratio else r.vc_ratio,
                "cong_speed_kph": None if r.cong_speed_kph != r.cong_speed_kph else r.cong_speed_kph,
                "delay_s": None if r.delay_s != r.delay_s else r.delay_s,
                "n_findings": n, "max_severity": rank_to_sev.get(worst),
            },
        })
    return JSONResponse({"type": "FeatureCollection", "period": period, "metric": metric,
                         "features": features})


@app.get(f"{API_PREFIX}/runs/{{run_id}}/links/{{link_id}}")
def link_profile(link_id: int, store: RunStore = Depends(get_store)) -> dict[str, Any]:
    attrs = store.query("SELECT * FROM links WHERE link_id = ?", [link_id])
    if attrs.empty:
        raise HTTPException(404, "link not found")
    flows = store.query(
        "SELECT period, user_class, volume, vc_ratio, cong_speed_kph, delay_s, cong_time_s, "
        "source_file, source_row FROM link_flows WHERE link_id = ? ORDER BY period, user_class",
        [link_id])
    findings = [f.model_dump(mode="json") for f in store.findings()
                if f.location.type.value == "link" and f.location.id == str(link_id)]
    band = None
    if store.noise_band() is not None:
        nb = store.query("SELECT * FROM noise_band WHERE level='link' AND location_id = ?",
                         [str(link_id)])
        band = json.loads(nb.to_json(orient="records"))
    return {"attributes": json.loads(attrs.to_json(orient="records"))[0],
            "flows": json.loads(flows.to_json(orient="records")),
            "findings": findings, "noise_band": band}


@app.get(f"{API_PREFIX}/runs/{{run_id}}/nodes/{{node_id}}")
def node_profile(node_id: int, store: RunStore = Depends(get_store)) -> dict[str, Any]:
    n = store.query("SELECT * FROM nodes WHERE node_id = ?", [node_id])
    if n.empty:
        raise HTTPException(404, "node not found")
    links = store.query("SELECT link_id, a_node, b_node, link_class FROM links "
                        "WHERE a_node = ? OR b_node = ?", [node_id, node_id])
    findings = [f.model_dump(mode="json") for f in store.findings()
                if f.location.type.value == "node" and f.location.id == str(node_id)]
    return {"attributes": json.loads(n.to_json(orient="records"))[0],
            "links": json.loads(links.to_json(orient="records")), "findings": findings}


@app.get(f"{API_PREFIX}/runs/{{run_id}}/zones")
def run_zones(store: RunStore = Depends(get_store)) -> dict[str, Any]:
    if not store.has("zones"):
        return {"type": "FeatureCollection", "features": []}
    lu = "SELECT zone_id, SUM(CASE WHEN variable='POP' THEN value END) AS pop, " \
         "SUM(CASE WHEN variable='EMP_TOTAL' THEN value END) AS emp FROM land_use GROUP BY zone_id"
    sql = f"SELECT z.*, u.pop, u.emp FROM zones z LEFT JOIN ({lu}) u USING (zone_id)" \
        if store.has("land_use") else "SELECT z.*, NULL AS pop, NULL AS emp FROM zones z"
    df = store.query(sql)
    feats = []
    for r in df.itertuples(index=False):
        body = r.geometry_wkt.strip()[len("POLYGON"):].strip().strip("()")
        ring = [[float(x), float(y)] for x, y in (p.split() for p in body.split(","))]
        feats.append({"type": "Feature",
                      "geometry": {"type": "Polygon", "coordinates": [ring]},
                      "properties": {"zone_id": int(r.zone_id), "sector_id": r.sector_id,
                                     "district": r.district, "region": r.region,
                                     "pop": r.pop, "emp": r.emp}})
    return {"type": "FeatureCollection", "features": feats}


@app.get(f"{API_PREFIX}/runs/{{run_id}}/zones/{{zone_id}}")
def zone_profile(zone_id: int, store: RunStore = Depends(get_store)) -> dict[str, Any]:
    z = store.query("SELECT * FROM zones WHERE zone_id = ?", [zone_id])
    if z.empty:
        raise HTTPException(404, "zone not found")
    lu = store.query("SELECT variable, value, source_file, source_row FROM land_use "
                     "WHERE zone_id = ?", [zone_id]) if store.has("land_use") else None
    pa_ = store.query(
        "SELECT purpose, mode, period, "
        "SUM(CASE WHEN origin = ? THEN trips ELSE 0 END) AS productions, "
        "SUM(CASE WHEN destination = ? THEN trips ELSE 0 END) AS attractions "
        "FROM od WHERE matrix_kind='DEMAND' AND (origin = ? OR destination = ?) "
        "GROUP BY 1,2,3 ORDER BY 1,2,3", [zone_id] * 4) if store.has("od") else None
    findings = [f.model_dump(mode="json") for f in store.findings()
                if f.location.type.value == "zone" and f.location.id == str(zone_id)]
    return {"attributes": json.loads(z.to_json(orient="records"))[0],
            "land_use": json.loads(lu.to_json(orient="records")) if lu is not None else [],
            "trips": json.loads(pa_.to_json(orient="records")) if pa_ is not None else [],
            "findings": findings}


@app.get(f"{API_PREFIX}/runs/{{run_id}}/lines/{{line_id}}")
def line_profile(line_id: str, store: RunStore = Depends(get_store)) -> dict[str, Any]:
    if not store.has("transit_lines"):
        raise HTTPException(404, "no transit lines in this run")
    head = store.query("SELECT * FROM transit_lines WHERE line_id = ? ORDER BY period", [line_id])
    if head.empty:
        raise HTTPException(404, "line not found")
    segs = store.query("SELECT * FROM transit_segments WHERE line_id = ? ORDER BY seq", [line_id])
    loads = store.query("SELECT * FROM line_loads WHERE line_id = ? ORDER BY period, seq",
                        [line_id]) if store.has("line_loads") else None
    findings = [f.model_dump(mode="json") for f in store.findings()
                if f.location.type.value == "line" and f.location.id == line_id]
    return {"headways": json.loads(head.to_json(orient="records")),
            "segments": json.loads(segs.to_json(orient="records")),
            "loads": json.loads(loads.to_json(orient="records")) if loads is not None else [],
            "findings": findings}


# --- reports ------------------------------------------------------------------

@app.get(f"{API_PREFIX}/runs/{{run_id}}/report.docx")
def report_docx(store: RunStore = Depends(get_store)) -> FileResponse:
    p = store.derived_path("report.docx")
    if not p.exists():
        raise HTTPException(404, "report not generated yet")
    return FileResponse(p, filename=f"steam-ai-diagnostic-{store.run_id}.docx")


@app.get(f"{API_PREFIX}/runs/{{run_id}}/report.pdf")
def report_pdf(store: RunStore = Depends(get_store)) -> FileResponse:
    p = store.derived_path("report.pdf")
    if not p.exists():
        raise HTTPException(404, "report not generated yet")
    return FileResponse(p, filename=f"steam-ai-diagnostic-{store.run_id}.pdf",
                        media_type="application/pdf")


# --- catalogue, config, jobs, audit -----------------------------------------------

@app.get(f"{API_PREFIX}/checks")
def checks_catalogue() -> list[dict[str, Any]]:
    from ..checks.registry import catalogue

    # The registry keys entries by "id"; expose "check_id" too so the payload
    # matches CheckResult/Finding naming used everywhere else in the API.
    return [{"check_id": c.get("id"), **c} for c in catalogue()]


@app.get(f"{API_PREFIX}/config/health")
def health_definition() -> dict[str, Any]:
    return config.health()


class IngestRequest(BaseModel):
    path: str
    base_run_id: str | None = None
    run_id: str | None = None


@app.post(f"{API_PREFIX}/runs/ingest")
def ingest(req: IngestRequest) -> dict[str, Any]:
    from ..pipeline import process_export_dir

    p = Path(req.path)
    if not p.exists():
        raise HTTPException(400, f"path does not exist: {p}")
    job = QUEUE.submit("ingest", lambda: process_export_dir(p, base_run_id=req.base_run_id,
                                                            run_id=req.run_id),
                       path=str(p), base_run_id=req.base_run_id)
    return {"job_id": job.job_id}


@app.post(f"{API_PREFIX}/runs/{{run_id}}/recheck")
def recheck(run_id: str) -> dict[str, Any]:
    from ..pipeline import run_checks as _run

    get_store(run_id).close()
    job = QUEUE.submit("recheck", lambda: _run(run_id), run_id=run_id)
    return {"job_id": job.job_id}


@app.get(f"{API_PREFIX}/jobs")
def jobs() -> list[dict[str, Any]]:
    return [j.to_dict() for j in QUEUE.all()]


@app.get(f"{API_PREFIX}/jobs/{{job_id}}")
def job(job_id: str) -> dict[str, Any]:
    j = QUEUE.get(job_id)
    if j is None:
        raise HTTPException(404, "job not found")
    return j.to_dict()


@app.get(f"{API_PREFIX}/audit")
def audit_tail(limit: int = Query(100, ge=1, le=2000)) -> list[dict[str, Any]]:
    return audit.tail(limit)


# --- frontend -----------------------------------------------------------------

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
