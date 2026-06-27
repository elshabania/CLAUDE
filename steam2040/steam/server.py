"""FastAPI backend: command API + binary results channel (spec section 1A).

Endpoints
---------
GET  /                       -> serves the front-end shell (frontend/index.html)
POST /command                -> dispatch one typed command, return JSON result
POST /copilot                -> plain-language -> commands -> dispatch chain
GET  /geometry               -> network geometry as JSON (sent once, cached client-side)
WS   /ws/results             -> binary Float32 result arrays + progress events

Heavy work runs in a thread pool so the UI never blocks (acceptance test 3).
"""
from __future__ import annotations

import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .state import AppState
from .commands import dispatch, CommandError, COMMAND_SCHEMA
from .copilot.interpreter import interpret
from .copilot.llm import interpret_llm
from .engine import metrics

import sys

# When frozen by PyInstaller, bundled data lives under sys._MEIPASS.
_BASE = getattr(sys, "_MEIPASS",
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND = os.path.join(_BASE, "frontend")


def create_app(state: AppState | None = None) -> FastAPI:
    app = FastAPI(title="STEAM 2040 Studio")
    state = state or AppState()
    app.state.model = state
    app.state.pool = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)
    app.state.subscribers: set[WebSocket] = set()
    app.state.llm_cfg = {"base_url": os.environ.get("STEAM_LLM_URL", ""),
                         "api_key": os.environ.get("STEAM_LLM_KEY", ""),
                         "model": os.environ.get("STEAM_LLM_MODEL", "gpt-4o-mini")}

    async def broadcast(msg: dict):
        dead = []
        for ws in app.state.subscribers:
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                dead.append(ws)
        for ws in dead:
            app.state.subscribers.discard(ws)

    def progress_cb(loop):
        def cb(ev):
            asyncio.run_coroutine_threadsafe(
                broadcast({"type": "progress", **ev}), loop)
        return cb

    async def run_command(command: str, params: dict) -> dict:
        loop = asyncio.get_running_loop()
        cb = progress_cb(loop)
        result = await loop.run_in_executor(
            app.state.pool, dispatch, state, command, params, cb)
        # if an assignment produced a result, stream the arrays
        if command == "run_assignment" and state.last_result is not None:
            await stream_result(loop)
        return result

    async def stream_result(loop):
        res = state.last_result
        payload = {
            "type": "result_meta",
            "n_links": int(res.volume.shape[0]),
            "kpis": metrics.kpis(res),
            "histogram": metrics.vc_histogram(res),
        }
        await broadcast(payload)
        # binary arrays: volume, v/c, los as Float32/Int8 buffers
        for ws in list(app.state.subscribers):
            try:
                await ws.send_bytes(_pack_arrays(res))
            except Exception:
                app.state.subscribers.discard(ws)

    @app.get("/")
    async def index():
        idx = os.path.join(FRONTEND, "index.html")
        if os.path.exists(idx):
            return FileResponse(idx)
        return JSONResponse({"status": "STEAM 2040 backend up; front end missing"})

    @app.get("/schema")
    async def schema():
        return {k: {p: t.__name__ for p, t in v.items()}
                for k, v in COMMAND_SCHEMA.items()}

    @app.get("/geometry")
    async def geometry():
        return JSONResponse(_geometry_json(state))

    @app.post("/command")
    async def command(req: dict):
        try:
            result = await run_command(req["command"], req.get("params", {}))
            return {"ok": True, "result": result}
        except (CommandError, KeyError, ValueError) as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=400)

    @app.post("/copilot")
    async def copilot(req: dict):
        text = req.get("text", "")
        cfg = app.state.llm_cfg
        cmds = None
        if cfg["base_url"] and cfg["api_key"]:
            cmds = interpret_llm(text, cfg["base_url"], cfg["api_key"], cfg["model"])
        if not cmds:
            cmds = interpret(text)            # offline default / fallback
        if not cmds:
            return {"ok": False, "error": "Could not interpret request",
                    "commands": []}
        results = []
        for c in cmds:
            try:
                r = await run_command(c["command"], c.get("params", {}))
                results.append({"command": c["command"], "params": c.get("params", {}),
                                "result": r})
            except (CommandError, KeyError, ValueError) as e:
                results.append({"command": c["command"], "error": str(e)})
                break
        return {"ok": True, "commands": cmds, "results": results,
                "narration": _narrate(results)}

    @app.websocket("/ws/results")
    async def ws_results(ws: WebSocket):
        await ws.accept()
        app.state.subscribers.add(ws)
        try:
            while True:
                await ws.receive_text()      # keep-alive / client pings
        except WebSocketDisconnect:
            app.state.subscribers.discard(ws)

    if os.path.isdir(FRONTEND):
        app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
    return app


def _pack_arrays(res) -> bytes:
    """Pack per-link results into one binary buffer:
    [int32 n][float32 volume*n][float32 vc*n][int8 los*n]."""
    n = res.volume.shape[0]
    vol = res.volume.astype("<f4")
    vc = res.vc.astype("<f4")
    los = metrics.los_band(res.vc).astype("<i1")
    header = np.array([n], dtype="<i4").tobytes()
    return header + vol.tobytes() + vc.tobytes() + los.tobytes()


def _geometry_json(state: AppState) -> dict:
    net = state.network
    if net is None:
        return {"links": [], "bounds": None}
    links = []
    for i in range(net.n_links):
        g = net.geometry[i]
        links.append({
            "id": int(net.object_id[i]),
            "class": net.class_name(net.klass[i]),
            "lanes": int(net.lanes[i]),
            "pts": g.reshape(-1).tolist(),
        })
    zones = []
    if state.zones is not None:
        z = state.zones
        for i in range(z.n_zones):
            if not z.routable[i]:
                continue
            zones.append({"id": int(z.z[i]), "x": float(z.centroid[i, 0]),
                          "y": float(z.centroid[i, 1]), "pop": float(z.pop[i]),
                          "jobs": float(z.worker[i])})
    return {"links": links, "zones": zones, "bounds": net.bounds()}


def _narrate(results) -> str:
    """Plain-language summary of a command chain for the copilot panel."""
    out = []
    for r in results:
        if "error" in r:
            out.append(f"⚠ {r['command']}: {r['error']}")
            continue
        res = r.get("result", {})
        c = r["command"]
        if c == "run_assignment" and "kpis" in res:
            k = res["kpis"]
            gap = k.get("final_gap")
            gtxt = f", gap {gap*100:.2f}%" if gap else ""
            out.append(f"Ran {k['method'].upper()} on {res.get('demand')}: "
                       f"VHT {k['vht']:.0f} veh·h, VMT {k['vmt']:.0f} veh·km, "
                       f"avg speed {k['avg_speed_kmh']:.1f} km/h, "
                       f"{k['over_capacity']} links over capacity{gtxt}.")
        elif c == "query":
            out.append(f"{res.get('metric')}: {res.get('value')}")
        elif c == "aggregate":
            s = res.get("stats", {})
            out.append(f"Aggregated {s.get('zones_before')} → {s.get('zones_after')} "
                       f"zones (target {s.get('target')}, max size {s.get('max_cluster_size')}).")
        elif c == "build_gravity_demand":
            out.append(f"Built gravity demand: {res.get('total_productions',0):.0f} "
                       f"productions across {res.get('od_pairs')} OD pairs.")
        else:
            out.append(f"{c}: ok")
    return " ".join(out)
