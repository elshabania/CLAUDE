"""The four assignment methods on a Dijkstra tree-load core.

* free-flow (all-or-nothing)
* incremental BPR (0.4/0.3/0.2/0.1)
* MSA (method of successive averages, step 1/k)
* Frank-Wolfe user equilibrium with an optimal bisection line search and the
  relative-gap stopping rule ``(TSTT - SPTT)/SPTT``.

Everything is deterministic: the same inputs always yield bit-for-bit identical
flows (no randomness in the core; any origin sampling is seeded upstream).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from steam_core.graph import CSRGraph
from steam_core.network import Network
from steam_core.settings import Settings
from .bpr import bpr_time, los_band
from .demand import Demand

METHODS = ["Free-flow (AON)", "Incremental BPR", "MSA", "Frank-Wolfe UE"]

# Increment fractions for the incremental method.
_INCREMENTS = (0.4, 0.3, 0.2, 0.1)


@dataclass
class AssignmentResult:
    method: str
    volume: np.ndarray            # per-link assigned volume (veh/h)
    congested_time: np.ndarray    # per-link congested time (s)
    free_time: np.ndarray         # per-link free-flow time (s)
    capacity: np.ndarray
    vc: np.ndarray                # volume / capacity
    los: np.ndarray               # LOS band 0..5
    gap_history: list = field(default_factory=list)
    demand_total: float = 0.0
    iterations: int = 0

    @property
    def n_links(self) -> int:
        return len(self.volume)


ProgressCb = Callable[[int, int, float], None]


def assign(net: Network, graph: CSRGraph, demand: Demand, settings: Settings,
           method: str, progress: ProgressCb | None = None,
           cancel: Callable[[], bool] | None = None) -> AssignmentResult:
    """Run ``method`` and return an :class:`AssignmentResult`.

    ``progress(iter, max_iter, gap)`` is called each iteration; ``cancel()`` is
    polled so a background run can be stopped.
    """
    fft = net.fftime.astype(np.float64)
    cap = net.capacity.astype(np.float64)
    alpha, beta = settings.bpr_alpha, settings.bpr_beta

    def cong(vol):
        return bpr_time(fft, vol, cap, alpha, beta)

    def stopped():
        return cancel is not None and cancel()

    gap_history: list[float] = []
    iters = 0

    if method == METHODS[0]:                       # free-flow AON
        vol, _, total = demand.assign(graph, fft)
        iters = 1

    elif method == METHODS[1]:                     # incremental BPR
        vol = np.zeros(net.n_links)
        total = 0.0
        for k, frac in enumerate(_INCREMENTS):
            if stopped():
                break
            t = cong(vol)
            aux, _, total = demand.assign(graph, t)
            vol = vol + frac * aux
            iters += 1
            if progress:
                progress(iters, len(_INCREMENTS), float("nan"))

    elif method == METHODS[2]:                      # MSA
        vol, _, total = demand.assign(graph, fft)
        for k in range(1, settings.msa_iter + 1):
            if stopped():
                break
            t = cong(vol)
            aux, sptt, total = demand.assign(graph, t)
            step = 1.0 / (k + 1)
            vol = (1.0 - step) * vol + step * aux
            tstt = float(np.sum(vol * cong(vol)))
            gap = (tstt - sptt) / sptt if sptt > 0 else 0.0
            gap_history.append(abs(gap))
            iters += 1
            if progress:
                progress(iters, settings.msa_iter, abs(gap))

    elif method == METHODS[3]:                      # Frank-Wolfe UE
        vol, _, total = demand.assign(graph, fft)
        for k in range(settings.fw_max_iter):
            if stopped():
                break
            t = cong(vol)
            aux, sptt, total = demand.assign(graph, t)
            tstt = float(np.sum(vol * t))
            gap = (tstt - sptt) / sptt if sptt > 0 else 0.0
            gap_history.append(abs(gap))
            iters += 1
            if progress:
                progress(iters, settings.fw_max_iter, abs(gap))
            if abs(gap) < settings.fw_gap_target:
                break
            lam = _line_search(vol, aux, fft, cap, alpha, beta)
            vol = vol + lam * (aux - vol)
    else:
        raise ValueError(f"unknown method {method!r}")

    ctime = cong(vol)
    vc = vol / np.maximum(cap, 1e-9)
    return AssignmentResult(
        method=method, volume=vol, congested_time=ctime, free_time=fft,
        capacity=cap, vc=vc, los=los_band(vc), gap_history=gap_history,
        demand_total=float(total), iterations=iters,
    )


def _line_search(x, y, fft, cap, alpha, beta, tol=1e-6, max_iter=40) -> float:
    """Optimal Frank-Wolfe step via bisection on the Beckmann derivative.

    ``D(lambda) = sum (y-x) * t(x + lambda(y-x))``.  Root in [0,1] is the
    minimiser of the Beckmann objective along the descent direction.
    """
    d = y - x

    def deriv(lam):
        flow = x + lam * d
        return float(np.sum(d * bpr_time(fft, flow, cap, alpha, beta)))

    lo, hi = 0.0, 1.0
    dlo, dhi = deriv(lo), deriv(hi)
    if dlo >= 0:           # already at/above optimum at lambda=0
        return 0.0
    if dhi <= 0:           # full step is best
        return 1.0
    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        dm = deriv(mid)
        if abs(dm) < tol or (hi - lo) < tol:
            return mid
        if dm > 0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)
