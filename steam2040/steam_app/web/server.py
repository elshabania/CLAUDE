"""FastAPI backend serving the STEAM 2040 engine to a browser front-end.

The heavy compute (network parsing, Numba assignment, aggregation) runs in this
local Python process; the browser only renders. Network geometry is shipped as
compact binary typed arrays and drawn on the GPU, which is why the web UI is far
faster than the software-painted desktop map for 150k links.

Everything runs on the user's own machine and works offline.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ..state import AppState, DEMAND_SOURCES
from ..capabilities import build_registry
from ..assistant import Assistant
from ..colors import style_bytes
from steam_assignment import METHODS
from steam_assignment.bpr import los_label
from steam_core.classify import class_name, FACILITY_CLASSES
from steam_core.kernels import warmup

STATIC_DIR = Path(__file__).parent / "static"
CACHE_DIR = Path(os.environ.get("STEAM_CACHE_DIR",
                                Path.home() / ".cache" / "steam2040"))


def _bin(arr: np.ndarray) -> Response:
    return Response(content=np.ascontiguousarray(arr).tobytes(),
                    media_type="application/octet-stream")


class AssignmentJob:
    """Tracks a single background assignment run."""

    def __init__(self):
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        self.running = False
        self.iter = 0
        self.max = 1
        self.gap = float("nan")
        self.error = None
        self.done = False
        self.method = None


def create_app(state: AppState | None = None) -> FastAPI:
    app = FastAPI(title="STEAM 2040 Studio")
    state = state or AppState()
    registry = build_registry()
    assistant = Assistant(state, registry)
    job = AssignmentJob()

    # ---- auto-load data on startup (only if none was supplied) ----------
    if state.network is None:
        _autoload(state)

    # ---- static frontend -------------------------------------------------
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index():
        idx = STATIC_DIR / "index.html"
        if idx.exists():
            return FileResponse(idx)
        return JSONResponse({"error": "frontend not built"}, status_code=404)

    @app.get("/favicon.ico")
    def favicon():
        return Response(status_code=204)

    # ---- status / loading ------------------------------------------------
    @app.get("/api/status")
    def status():
        return {
            "network": state.network.n_links if state.network else 0,
            "nodes": state.network.n_nodes if state.network else 0,
            "zones": state.zones.n if state.zones else 0,
            "od_pairs": int(state.od.n_pairs) if state.od is not None else 0,
            "has_result": state.result is not None,
            "has_aggregation": state.aggregation is not None,
            "assistant_backend": assistant.backend_name,
            "methods": METHODS,
            "demand_sources": DEMAND_SOURCES,
            "classes": FACILITY_CLASSES,
            "edits": len(state.editor.edits) if state.editor else 0,
        }

    @app.post("/api/load")
    def load(payload: dict = Body(...)):
        try:
            if payload.get("network"):
                state.load_network(payload["network"], cache_dir=CACHE_DIR)
            if payload.get("zones"):
                state.load_zones(payload["zones"])
            if payload.get("matrix"):
                state.load_matrix(payload["matrix"])
        except Exception as exc:
            raise HTTPException(400, str(exc))
        return status()

    # ---- network geometry (binary) --------------------------------------
    @app.get("/api/network/meta")
    def network_meta():
        if state.network is None:
            raise HTTPException(404, "no network loaded")
        net = state.network
        xmin, ymin, xmax, ymax = net.bounds()
        return {"n_links": net.n_links, "n_points": int(net.geom_off[-1]),
                "bounds": [xmin, ymin, xmax, ymax],
                "classes": {c: int((net.klass == i).sum())
                            for i, c in enumerate(FACILITY_CLASSES)}}

    @app.get("/api/network/offsets")
    def network_offsets():
        if state.network is None:
            raise HTTPException(404, "no network loaded")
        return _bin(state.network.geom_off.astype(np.int32))

    @app.get("/api/network/xy")
    def network_xy():
        if state.network is None:
            raise HTTPException(404, "no network loaded")
        # Recentre to local metres (float32 keeps precision near the network).
        net = state.network
        xmin, ymin, _, _ = net.bounds()
        xy = net.geom_xy.copy()
        xy[:, 0] -= xmin
        xy[:, 1] -= ymin
        return _bin(xy.astype(np.float32))

    @app.get("/api/network/klass")
    def network_klass():
        if state.network is None:
            raise HTTPException(404, "no network loaded")
        return _bin(state.network.klass.astype(np.uint8))

    # ---- per-link style (binary RGBA + width) ---------------------------
    @app.get("/api/style/{mode}")
    def style(mode: str):
        if state.network is None:
            raise HTTPException(404, "no network loaded")
        diff = getattr(state, "_last_diff", None)
        return _bin(np.frombuffer(
            style_bytes(state.network, state.result, mode, diff), dtype=np.uint8))

    # ---- assignment (background) ----------------------------------------
    @app.post("/api/assignment/run")
    def assignment_run(payload: dict = Body(...)):
        if state.network is None:
            raise HTTPException(400, "no network loaded")
        with job.lock:
            if job.running:
                raise HTTPException(409, "assignment already running")
            job.reset()
            job.running = True
            job.method = payload.get("method", METHODS[3])
        method = payload.get("method", METHODS[3])
        source = payload.get("demand_source",
                             DEMAND_SOURCES[0] if state.od is not None
                             else DEMAND_SOURCES[1])

        def progress(i, n, g):
            job.iter, job.max, job.gap = i, n, g

        def worker():
            try:
                warmup()
                state.run_assignment(method, source, progress=progress)
            except Exception as exc:
                job.error = str(exc)
            finally:
                job.running = False
                job.done = True

        threading.Thread(target=worker, daemon=True).start()
        return {"started": True, "method": method, "demand_source": source}

    @app.get("/api/assignment/state")
    def assignment_state():
        out = {"running": job.running, "iter": job.iter, "max": job.max,
               "gap": None if job.gap != job.gap else job.gap,
               "done": job.done, "error": job.error}
        if job.done and job.error is None and state.result is not None:
            k = state.kpis()
            out["kpis"] = k.as_rows()
            out["gap_history"] = state.result.gap_history
            out["method"] = state.result.method
            out["iterations"] = state.result.iterations
        return out

    @app.get("/api/top_links")
    def top_links(n: int = 20):
        if state.result is None:
            return {"rows": []}
        return {"rows": state.top_links(n)}

    @app.get("/api/link/{idx}")
    def link_detail(idx: int):
        net = state.network
        if net is None or idx < 0 or idx >= net.n_links:
            raise HTTPException(404, "bad link")
        d = {"link_id": int(net.link_id[idx]), "class": class_name(net.klass[idx]),
             "lanes": int(net.lanes[idx]), "length_m": round(float(net.length[idx]), 1)}
        if state.result is not None and idx < state.result.n_links:
            r = state.result
            d.update({"volume": round(float(r.volume[idx]), 1),
                      "capacity": round(float(r.capacity[idx]), 1),
                      "vc": round(float(r.vc[idx]), 3),
                      "los": los_label(r.los[idx]),
                      "speed_kmh": round(float(net.length[idx]
                                   / max(r.congested_time[idx], 1e-6) * 3.6), 1)})
        return d

    # ---- scenario --------------------------------------------------------
    @app.post("/api/scenario/upgrade")
    def scenario_upgrade(payload: dict = Body(...)):
        state.upgrade_link(int(payload["link_id"]), int(payload.get("add_lanes", 1)))
        return {"edits": len(state.editor.edits)}

    @app.post("/api/scenario/undo")
    def scenario_undo():
        state.undo()
        return {"edits": len(state.editor.edits)}

    @app.post("/api/scenario/run")
    def scenario_run(payload: dict = Body(...)):
        if not (state.editor and state.editor.edits):
            raise HTTPException(400, "no edits queued")
        method = payload.get("method", METHODS[3])
        source = payload.get("demand_source",
                             DEMAND_SOURCES[0] if state.od is not None
                             else DEMAND_SOURCES[1])
        warmup()
        diff = state.run_scenario(method, source)
        state._last_diff = diff.volume_delta
        return {"vht_delta": diff.vht_delta, "vmt_delta": diff.vmt_delta,
                "overcap_delta": diff.overcap_delta,
                "cost_benefit": diff.cost_benefit}

    # ---- aggregation -----------------------------------------------------
    @app.post("/api/aggregate")
    def aggregate(payload: dict = Body(...)):
        if state.zones is None or state.network is None:
            raise HTTPException(400, "load network and zones first")
        keys = tuple(payload.get("keys") or ("district",))
        warmup()
        res = state.aggregate_zones(
            target_zone_count=int(payload.get("target_zone_count", 1800)),
            barrier_threshold=payload.get("barrier_threshold", "coll"),
            max_span_m=float(payload.get("max_span_m", 6000)),
            method=payload.get("method", "single"), keys=keys)
        from steam_viewer.aggregate import aggregation_stats
        return aggregation_stats(state.zones, res)

    @app.get("/api/zones/xy")
    def zones_xy():
        if state.zones is None or state.network is None:
            raise HTTPException(404, "no zones")
        xmin, ymin, _, _ = state.network.bounds()
        c = state.zones.centroids().copy()
        c[:, 0] -= xmin
        c[:, 1] -= ymin
        return _bin(c.astype(np.float32))

    @app.get("/api/aggregation/labels")
    def aggregation_labels():
        if state.aggregation is None:
            raise HTTPException(404, "no aggregation")
        return _bin(state.aggregation.labels.astype(np.int32))

    @app.get("/api/aggregation/qa")
    def aggregation_qa():
        if state.aggregation is None:
            raise HTTPException(404, "no aggregation")
        return state.aggregation_qa()

    # ---- recommendations -------------------------------------------------
    @app.post("/api/recommend")
    def recommend(payload: dict = Body(...)):
        if state.result is None:
            raise HTTPException(400, "run an assignment first")
        method = payload.get("method", state.result.method)
        source = payload.get("demand_source",
                             DEMAND_SOURCES[0] if state.od is not None
                             else DEMAND_SOURCES[1])
        ev, programme = state.recommend(method, source,
                                        int(payload.get("n_eval", 6)))
        return {"recommendations": [
                    {"name": r.name, "vht_saved": r.measured_vht_saved,
                     "bcr": None if r.bcr == float("inf") else r.bcr,
                     "cost": r.cost} for r in ev],
                "programme": [r.name for r in programme]}

    # ---- assistant -------------------------------------------------------
    @app.post("/api/chat")
    def chat(payload: dict = Body(...)):
        text = (payload.get("message") or "").strip()
        if not text:
            raise HTTPException(400, "empty message")
        reply = assistant.chat(text)
        return {"text": reply.text, "backend": reply.backend,
                "actions": [{"capability": a.capability, "params": a.params,
                             "result": a.result} for a in reply.actions]}

    return app


def _autoload(state: AppState) -> None:
    """Load network/zones/matrix from STEAM_DATA_DIR or a bundled data dir."""
    candidates = []
    env = os.environ.get("STEAM_DATA_DIR")
    if env:
        candidates.append(Path(env))
    candidates.append(Path(__file__).resolve().parents[2] / "realdata")
    candidates.append(Path(__file__).resolve().parents[2] / "bundled_data")

    for base in candidates:
        if not base.exists():
            continue
        net = _find(base, (".shp",)) or _find(base, ("network_links.csv", "_links.csv"))
        zones = _find(base, ("landuse", "land_use"), suffix=".csv")
        matrix = (_find(base, ("matrix", "od_long", "long_od"), suffix=".csv")
                  or _find(base, ("_od.csv", "od.csv"), suffix=".csv"))
        if net:
            try:
                state.load_network(net, cache_dir=CACHE_DIR)
                if zones:
                    state.load_zones(zones)
                if matrix:
                    state.load_matrix(matrix)
            except Exception:
                pass
            return


def _find(base: Path, needles, suffix=None):
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        if suffix and not name.endswith(suffix):
            continue
        if any(nd in name for nd in needles):
            return str(p)
    return None


def serve(host="127.0.0.1", port=8732, open_browser=True, state=None):
    """Start the local server and (optionally) open the browser."""
    import uvicorn
    app = create_app(state)
    if open_browser:
        import threading
        import webbrowser
        threading.Timer(1.2, lambda: webbrowser.open(f"http://{host}:{port}")).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")
