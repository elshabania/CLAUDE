"""Network KPIs and per-link display attributes derived from an AssignResult."""
from __future__ import annotations

import numpy as np

from .assignment import AssignResult

# LOS thresholds on v/c (A..F). F is anything >= the last bound.
LOS_BOUNDS = [0.6, 0.7, 0.8, 0.9, 1.0]
LOS_LABELS = ["A", "B", "C", "D", "E", "F"]


def los_band(vc: np.ndarray) -> np.ndarray:
    """Map v/c to LOS index 0..5 (A..F)."""
    band = np.zeros_like(vc, dtype=np.int8)
    for bound in LOS_BOUNDS:
        band += (vc >= bound).astype(np.int8)
    return band


def kpis(res: AssignResult) -> dict:
    """Vehicle-hours/-km of travel, speeds, delay, over-capacity count."""
    vol = res.volume
    length_km = res.length_m / 1000.0
    hours = res.cost / 3600.0
    ff_hours = res.free_flow_time / 3600.0
    vht = float(np.dot(vol, hours))
    vmt = float(np.dot(vol, length_km))
    ff_vht = float(np.dot(vol, ff_hours))
    delay = vht - ff_vht
    avg_speed = (vmt / vht) if vht > 0 else 0.0
    vc = res.vc
    over = int((vc > 1.0).sum())
    return {
        "vht": vht,
        "vmt": vmt,
        "delay_veh_h": delay,
        "avg_speed_kmh": avg_speed,
        "avg_vc": float(vc.mean()) if vc.size else 0.0,
        "over_capacity": over,
        "iterations": res.iterations,
        "final_gap": res.gap_history[-1] if res.gap_history else None,
        "method": res.method,
    }


def top_congested(res: AssignResult, object_id: np.ndarray, n=10) -> list:
    """Top-n links by congested delay (vol * (congested - free-flow) time)."""
    delay = res.volume * (res.cost - res.free_flow_time)
    idx = np.argsort(delay)[::-1][:n]
    out = []
    for i in idx:
        out.append({
            "link_id": int(object_id[i]),
            "index": int(i),
            "volume": float(res.volume[i]),
            "vc": float(res.vc[i]),
            "delay_veh_h": float(delay[i] / 3600.0),
        })
    return out


def vc_histogram(res: AssignResult, bins=None) -> dict:
    bins = bins or [0, 0.5, 0.7, 0.8, 0.9, 1.0, 1.2, 5.0]
    counts, edges = np.histogram(res.vc, bins=bins)
    return {"counts": counts.tolist(), "edges": list(edges)}
