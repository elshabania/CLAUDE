"""Colour ramps and class colours for the map."""

from __future__ import annotations

from PySide6.QtGui import QColor

# Approximate viridis control points (t = 0 .. 1).
_VIRIDIS = [
    (0.0, (68, 1, 84)),
    (0.25, (59, 82, 139)),
    (0.5, (33, 145, 140)),
    (0.75, (94, 201, 98)),
    (1.0, (253, 231, 37)),
]

# Colour-blind-safe class palette.
CLASS_COLORS = {
    "fwy": QColor(202, 0, 32),
    "ramp": QColor(244, 165, 130),
    "art": QColor(5, 113, 176),
    "coll": QColor(146, 197, 222),
    "local": QColor(150, 150, 150),
    "rural": QColor(123, 50, 148),
    "junc": QColor(230, 171, 2),
    "none": QColor(120, 120, 120),
}

# LOS A..F.
LOS_COLORS = [
    QColor(26, 150, 65), QColor(166, 217, 106), QColor(255, 255, 191),
    QColor(253, 174, 97), QColor(215, 25, 28), QColor(140, 0, 0),
]


def viridis(t: float) -> QColor:
    t = max(0.0, min(1.0, t))
    for i in range(len(_VIRIDIS) - 1):
        t0, c0 = _VIRIDIS[i]
        t1, c1 = _VIRIDIS[i + 1]
        if t <= t1:
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            r = int(c0[0] + (c1[0] - c0[0]) * f)
            g = int(c0[1] + (c1[1] - c0[1]) * f)
            b = int(c0[2] + (c1[2] - c0[2]) * f)
            return QColor(r, g, b)
    return QColor(*_VIRIDIS[-1][1])


def diff_color(delta: float, scale: float) -> QColor:
    """Green for a decrease, red for an increase."""
    if scale <= 0:
        return QColor(160, 160, 160)
    t = max(-1.0, min(1.0, delta / scale))
    if t >= 0:
        return QColor(int(60 + 195 * t), int(60 * (1 - t)), int(60 * (1 - t)))
    return QColor(int(60 * (1 + t)), int(60 - 195 * t), int(60 * (1 + t)))


def cluster_color(cid: int) -> QColor:
    """Stable pseudo-random colour per cluster id."""
    h = (cid * 2654435761) & 0xFFFFFF
    return QColor((h >> 16) & 255, (h >> 8) & 255 | 40, h & 255 | 40)
