"""Vectorised colour mapping for the web map (no Qt dependency).

Produces per-link RGBA + width bytes for a colour mode, computed with NumPy over
all 150k links at once so the style endpoint stays fast.
"""

from __future__ import annotations

import numpy as np

from steam_core.classify import FACILITY_CLASSES

# 7-entry viridis control points -> a 256-entry lookup table.
_VIRIDIS_CTRL = np.array([
    [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
], dtype=np.float64)


def _viridis_lut(n=256):
    xs = np.linspace(0, 1, len(_VIRIDIS_CTRL))
    grid = np.linspace(0, 1, n)
    lut = np.empty((n, 3), dtype=np.uint8)
    for c in range(3):
        lut[:, c] = np.interp(grid, xs, _VIRIDIS_CTRL[:, c]).astype(np.uint8)
    return lut


VIRIDIS = _viridis_lut()

# class code -> RGB (colour-blind-safe), index by class code 0..6.
_CLASS_RGB = {
    "fwy": (202, 0, 32), "ramp": (244, 165, 130), "art": (5, 113, 176),
    "coll": (146, 197, 222), "local": (150, 150, 150), "rural": (123, 50, 148),
    "junc": (230, 171, 2),
}
CLASS_LUT = np.array([_CLASS_RGB[c] for c in FACILITY_CLASSES], dtype=np.uint8)
CLASS_WIDTH = np.array(
    [{"fwy": 3.0, "ramp": 2.0, "art": 2.6, "coll": 1.6, "local": 1.0,
      "rural": 1.4, "junc": 1.0}[c] for c in FACILITY_CLASSES], dtype=np.float64)

LOS_LUT = np.array([
    [26, 150, 65], [166, 217, 106], [255, 255, 191],
    [253, 174, 97], [215, 25, 28], [140, 0, 0],
], dtype=np.uint8)


def _pack(rgb: np.ndarray, width: np.ndarray) -> bytes:
    """Pack (n,3) uint8 RGB + (n,) width(px, 0..~8) into 5 bytes/link RGBA+W."""
    n = len(rgb)
    out = np.empty((n, 5), dtype=np.uint8)
    out[:, :3] = rgb
    out[:, 3] = 255
    out[:, 4] = np.clip(width * 28.0, 1, 255).astype(np.uint8)  # width*28 -> 0..255
    return out.tobytes()


def style_bytes(net, result, mode: str, diff=None) -> bytes:
    """Per-link RGBA + width bytes for a colour ``mode``."""
    n = net.n_links
    klass = np.clip(net.klass, 0, len(FACILITY_CLASSES) - 1)

    if mode == "class" or result is None:
        return _pack(CLASS_LUT[klass], CLASS_WIDTH[klass])

    if mode == "volume":
        vmax = max(float(result.volume.max()), 1.0)
        t = np.clip(result.volume / vmax, 0, 1)
        idx = (t * 255).astype(np.int32)
        return _pack(VIRIDIS[idx], 0.8 + 5.0 * t)

    if mode == "vc":
        t = np.clip(result.vc, 0, 1.5) / 1.5
        idx = (t * 255).astype(np.int32)
        return _pack(VIRIDIS[idx], 1.0 + 4.0 * t)

    if mode == "los":
        return _pack(LOS_LUT[np.clip(result.los, 0, 5)], np.full(n, 1.6))

    if mode == "difference" and diff is not None:
        scale = max(float(np.abs(diff).max()), 1.0)
        t = np.clip(diff / scale, -1, 1)
        rgb = np.empty((n, 3), dtype=np.uint8)
        pos = t >= 0
        rgb[pos] = np.column_stack([
            (60 + 195 * t[pos]).astype(np.uint8),
            (60 * (1 - t[pos])).astype(np.uint8),
            (60 * (1 - t[pos])).astype(np.uint8)])
        neg = ~pos
        rgb[neg] = np.column_stack([
            (60 * (1 + t[neg])).astype(np.uint8),
            (60 - 195 * t[neg]).astype(np.uint8),
            (60 * (1 + t[neg])).astype(np.uint8)])
        return _pack(rgb, 1.0 + 4.0 * np.abs(t))

    return _pack(CLASS_LUT[klass], CLASS_WIDTH[klass])
