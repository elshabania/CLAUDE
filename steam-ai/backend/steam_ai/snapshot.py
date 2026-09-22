"""Static snapshot of the API for hosting the web app without a server.

Writes every GET the web app makes, for every ingested run, to a directory
of JSON (and gzipped ``links.bin``) files. The frontend's static mode
(``VITE_STATIC_DATA``) answers API calls from these files, so a demo can be
served from any static host with the same numbers the API would return.
Nothing is recomputed here: each file is the API's own response.
"""

from __future__ import annotations

import gzip
import json
import shutil
from pathlib import Path
from typing import Any

from .api import linkbin
from .store import RunStore

FLOW_COLS = ["period", "user_class", "volume", "vc_ratio", "cong_speed_kph", "delay_s",
             "cong_time_s", "source_file", "source_row"]


def _link_flows(store: RunStore) -> dict[str, Any]:
    """All link flows, compact: {link_id: [[period, class, ..., file_idx, row], ...]}.

    The web app builds a link's profile from links.bin (attributes), this file
    (flows) and the findings list, which is what the API's link profile holds.
    """
    df = store.query(f"SELECT link_id, {', '.join(FLOW_COLS)} FROM link_flows "
                     "ORDER BY link_id, period, user_class")
    files = sorted(df["source_file"].dropna().astype(str).unique().tolist())
    fidx = {f: i for i, f in enumerate(files)}
    rows: dict[str, list[list[Any]]] = {}
    for r in df.itertuples(index=False):
        def num(v: Any, nd: int) -> Any:
            return None if v is None or v != v else round(float(v), nd)
        rows.setdefault(str(r.link_id), []).append([
            r.period, r.user_class, num(r.volume, 1), num(r.vc_ratio, 3),
            num(r.cong_speed_kph, 1), num(r.delay_s, 1), num(r.cong_time_s, 1),
            fidx.get(str(r.source_file)), None if r.source_row != r.source_row else int(r.source_row),
        ])
    return {"columns": FLOW_COLS, "files": files, "links": rows}


def _client() -> Any:
    from fastapi.testclient import TestClient

    from .api.app import API_PREFIX, app

    client = TestClient(app)

    def get(path: str, **params: Any) -> Any:
        r = client.get(f"{API_PREFIX}{path}", params=params)
        r.raise_for_status()
        return r.json()

    return get


def _write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), default=str), "utf-8")


def write_snapshot(out: Path, run_ids: list[str] | None = None) -> dict[str, Any]:
    get = _client()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    runs = [r for r in get("/runs") if not run_ids or r["run_id"] in run_ids]
    _write(out / "runs.json", runs)
    _write(out / "checks.json", get("/checks"))
    _write(out / "config" / "health.json", get("/config/health"))
    summary: dict[str, Any] = {}
    for r in runs:
        rid = r["run_id"]
        d = out / "runs" / rid
        _write(out / "runs" / f"{rid}.json", get(f"/runs/{rid}"))
        for name in ("health", "checks", "kpis", "changes"):
            try:
                _write(d / f"{name}.json", get(f"/runs/{rid}/{name}"))
            except Exception:  # noqa: BLE001 - e.g. health not computed: the app shows the gap
                continue
        _write(d / "findings.json", get(f"/runs/{rid}/findings", limit=5000))
        store = RunStore(rid)
        try:
            periods = r.get("periods") or []
            files = []
            if store.has("link_flows") and periods:
                for p in periods:
                    (d / f"links_{p}.bin.gz").write_bytes(
                        gzip.compress(linkbin.encode(store, p), 6))
                    files.append(f"links_{p}.bin.gz")
            else:
                (d / "links.bin.gz").write_bytes(gzip.compress(linkbin.encode(store, None), 6))
                files.append("links.bin.gz")
            n_links = store.row_count("links")
            if store.has("link_flows"):
                _write(d / "link_flows.json", _link_flows(store))
                files.append("link_flows.json")
            for rep in ("report.docx", "report.pdf"):
                src = store.derived_path(rep)
                if src.exists():
                    shutil.copyfile(src, d / rep)
                    files.append(rep)
        finally:
            store.close()
        summary[rid] = {"links": n_links, "files": files}
    _write(out / "snapshot.json", {"runs": summary, "note": __doc__.strip().splitlines()[0]})
    return summary

