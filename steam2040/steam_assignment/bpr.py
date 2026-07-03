"""BPR congestion function and level-of-service banding."""

from __future__ import annotations

import numpy as np

# Level-of-service v/c thresholds (upper bound of each band, F is the rest).
LOS_LABELS = ["A", "B", "C", "D", "E", "F"]
_LOS_VC = np.array([0.60, 0.70, 0.80, 0.90, 1.00])


def bpr_time(fftime: np.ndarray, vol: np.ndarray, cap: np.ndarray,
             alpha: float, beta: float) -> np.ndarray:
    """``t = t0 * (1 + alpha*(vol/cap)**beta)`` (vectorised, safe for cap=0)."""
    cap = np.maximum(cap, 1e-9)
    ratio = vol / cap
    return fftime * (1.0 + alpha * np.power(ratio, beta))


def los_band(vc: np.ndarray) -> np.ndarray:
    """Map v/c ratios to LOS band indices 0..5 (A..F)."""
    return np.digitize(vc, _LOS_VC).astype(np.int8)


def los_label(idx: int) -> str:
    return LOS_LABELS[int(np.clip(idx, 0, 5))]
