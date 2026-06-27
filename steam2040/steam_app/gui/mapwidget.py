"""Pan/zoom network map with colour modes, level-of-detail and hover/click.

Renders the network polylines with a :class:`QPainter`.  Colour modes: facility
class, volume (viridis, width by volume), v/c, LOS, scenario difference, and new
cluster (aggregation).  Zoom-based level-of-detail hides the dense local/junction
layers at city scale so the full network stays smooth.
"""

from __future__ import annotations

import numpy as np
from PySide6.QtCore import Qt, QPointF, Signal
from PySide6.QtGui import QPainter, QPen, QColor, QPainterPath
from PySide6.QtWidgets import QWidget

from steam_core.classify import class_name, CLASS_CODE
from .palette import (CLASS_COLORS, LOS_COLORS, viridis, diff_color,
                      cluster_color)

# Class draw order (major last so it paints on top) and LOD thresholds: a class
# is hidden when the on-screen metres-per-pixel exceeds its value.
_LOD_HIDE_ABOVE = {  # metres per pixel
    "local": 12.0, "junc": 12.0, "coll": 40.0, "rural": 40.0,
    "ramp": 1e9, "art": 1e9, "fwy": 1e9,
}
_DRAW_ORDER = ["local", "junc", "coll", "rural", "ramp", "art", "fwy"]


class MapView(QWidget):
    link_hovered = Signal(int)        # link index, -1 if none
    link_clicked = Signal(int)        # link index
    point_clicked = Signal(float, float)  # world x, y

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(400, 300)
        self.setMouseTracking(True)
        self.net = None
        self.result = None
        self.mode = "class"          # class|volume|vc|los|difference|cluster
        self.diff = None             # per-link volume delta
        self.labels = None           # cluster labels per zone (aggregation)
        self.aggregation = None
        self.zones = None
        self.overlay_pts = []        # extra markers [(x,y,QColor)]
        self.screenline = None       # ((x1,y1),(x2,y2))

        self._scale = 1.0
        self._cx = 0.0
        self._cy = 0.0
        self._panning = False
        self._last = None
        self._hover = -1
        self._dark = True

    # ---- public API ------------------------------------------------------
    def set_network(self, net):
        self.net = net
        self.reset_view()
        self.update()

    def set_result(self, result):
        self.result = result
        self.update()

    def set_mode(self, mode: str):
        self.mode = mode
        self.update()

    def set_aggregation(self, zones, aggregation):
        self.zones = zones
        self.aggregation = aggregation
        self.update()

    def set_diff(self, diff):
        self.diff = diff
        self.update()

    def reset_view(self):
        if self.net is None:
            return
        xmin, ymin, xmax, ymax = self.net.bounds()
        self._cx = (xmin + xmax) / 2
        self._cy = (ymin + ymax) / 2
        w = max(xmax - xmin, 1.0)
        h = max(ymax - ymin, 1.0)
        sw = max(self.width(), 1)
        sh = max(self.height(), 1)
        self._scale = min(sw / w, sh / h) * 0.92

    # ---- coordinate transforms ------------------------------------------
    def _to_screen(self, x, y):
        sx = (x - self._cx) * self._scale + self.width() / 2
        sy = -(y - self._cy) * self._scale + self.height() / 2
        return sx, sy

    def _to_world(self, sx, sy):
        x = (sx - self.width() / 2) / self._scale + self._cx
        y = -(sy - self.height() / 2) / self._scale + self._cy
        return x, y

    def mpp(self) -> float:
        return 1.0 / self._scale if self._scale else 1e9

    # ---- painting --------------------------------------------------------
    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing, True)
        p.fillRect(self.rect(), QColor(25, 28, 34) if self._dark else QColor(245, 245, 245))
        if self.net is None:
            p.setPen(QColor(150, 150, 150))
            p.drawText(self.rect(), Qt.AlignCenter, "Load a network to begin")
            return

        if self.mode == "cluster" and self.aggregation is not None:
            self._draw_clusters(p)
        self._draw_links(p)
        self._draw_overlays(p)
        self._draw_legend(p)

    def _draw_links(self, p: QPainter):
        net = self.net
        mpp = self.mpp()
        res = self.result
        vmax = float(res.volume.max()) if res is not None and len(res.volume) else 1.0
        vmax = max(vmax, 1.0)
        diffscale = float(np.abs(self.diff).max()) if self.diff is not None and len(self.diff) else 1.0

        order = {name: i for i, name in enumerate(_DRAW_ORDER)}
        idx = np.argsort([order.get(class_name(c), 0) for c in net.klass])

        # Viewport bounds in world coords (+margin) for culling.
        wx0, wy1 = self._to_world(0, 0)
        wx1, wy0 = self._to_world(self.width(), self.height())
        for i in idx:
            i = int(i)
            cname = class_name(net.klass[i])
            if mpp > _LOD_HIDE_ABOVE.get(cname, 1e9):
                continue
            g = net.link_polyline(i)
            if len(g) < 2:
                continue
            # Cull links wholly outside the viewport.
            if (g[:, 0].max() < wx0 or g[:, 0].min() > wx1 or
                    g[:, 1].max() < wy0 or g[:, 1].min() > wy1):
                continue
            color, width = self._style(i, cname, res, vmax, diffscale)
            pen = QPen(color)
            pen.setWidthF(width)
            pen.setCosmetic(True)
            p.setPen(pen)
            path = QPainterPath()
            sx, sy = self._to_screen(g[0, 0], g[0, 1])
            path.moveTo(sx, sy)
            for k in range(1, len(g)):
                sx, sy = self._to_screen(g[k, 0], g[k, 1])
                path.lineTo(sx, sy)
            p.drawPath(path)

        if self._hover >= 0:
            self._draw_link_highlight(p, self._hover)

    def _style(self, i, cname, res, vmax, diffscale):
        if self.mode == "volume" and res is not None:
            t = res.volume[i] / vmax
            return viridis(t), 0.8 + 4.5 * t
        if self.mode == "vc" and res is not None:
            return viridis(min(res.vc[i], 1.5) / 1.5), 1.2 + 2.0 * min(res.vc[i], 1.5)
        if self.mode == "los" and res is not None:
            return LOS_COLORS[int(res.los[i])], 1.4
        if self.mode == "difference" and self.diff is not None:
            return diff_color(float(self.diff[i]), diffscale), 1.0 + 3.0 * abs(self.diff[i]) / diffscale
        # class default
        w = 2.4 if cname in ("fwy", "art") else (1.6 if cname == "ramp" else 1.0)
        return CLASS_COLORS.get(cname, QColor(150, 150, 150)), w

    def _draw_link_highlight(self, p, i):
        g = self.net.link_polyline(i)
        pen = QPen(QColor(255, 255, 0))
        pen.setWidthF(3.0)
        pen.setCosmetic(True)
        p.setPen(pen)
        path = QPainterPath()
        sx, sy = self._to_screen(g[0, 0], g[0, 1])
        path.moveTo(sx, sy)
        for k in range(1, len(g)):
            sx, sy = self._to_screen(g[k, 0], g[k, 1])
            path.lineTo(sx, sy)
        p.drawPath(path)

    def _draw_clusters(self, p: QPainter):
        if self.zones is None:
            return
        cent = self.zones.centroids()
        labels = self.aggregation.labels
        for cid, (cx, cy) in self.aggregation.cluster_centroid.items():
            sx, sy = self._to_screen(cx, cy)
            p.setPen(QPen(QColor(255, 255, 255, 180), 0))
            p.setBrush(cluster_color(int(cid)))
            p.drawEllipse(QPointF(sx, sy), 3, 3)

    def _draw_overlays(self, p: QPainter):
        for x, y, color in self.overlay_pts:
            sx, sy = self._to_screen(x, y)
            p.setPen(QPen(color, 0))
            p.setBrush(color)
            p.drawEllipse(QPointF(sx, sy), 4, 4)
        if self.screenline:
            (x1, y1), (x2, y2) = self.screenline
            s1 = self._to_screen(x1, y1)
            s2 = self._to_screen(x2, y2)
            pen = QPen(QColor(255, 90, 90))
            pen.setWidthF(2.0)
            pen.setStyle(Qt.DashLine)
            p.setPen(pen)
            p.drawLine(QPointF(*s1), QPointF(*s2))

    def _draw_legend(self, p: QPainter):
        p.setPen(QColor(220, 220, 220))
        txt = {"class": "Facility class", "volume": "Volume (viridis)",
               "vc": "v/c ratio", "los": "Level of service A–F",
               "difference": "Scenario Δ (green=less, red=more)",
               "cluster": "Zone clusters"}.get(self.mode, self.mode)
        p.drawText(10, self.height() - 12, f"Mode: {txt}   |   {self.mpp():.0f} m/px")

    # ---- interaction -----------------------------------------------------
    def wheelEvent(self, e):
        if self.net is None:
            return
        factor = 1.0015 ** e.angleDelta().y()
        wx, wy = self._to_world(e.position().x(), e.position().y())
        self._scale *= factor
        # Keep cursor world point fixed.
        nx, ny = self._to_world(e.position().x(), e.position().y())
        self._cx += wx - nx
        self._cy += wy - ny
        self.update()

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._panning = True
            self._last = e.position()
        elif e.button() == Qt.RightButton and self.net is not None:
            wx, wy = self._to_world(e.position().x(), e.position().y())
            self.point_clicked.emit(wx, wy)
            i = self._pick(e.position().x(), e.position().y())
            if i >= 0:
                self.link_clicked.emit(i)

    def mouseReleaseEvent(self, e):
        self._panning = False

    def mouseMoveEvent(self, e):
        if self._panning and self._last is not None:
            d = e.position() - self._last
            self._cx -= d.x() / self._scale
            self._cy += d.y() / self._scale
            self._last = e.position()
            self.update()
            return
        if self.net is not None:
            i = self._pick(e.position().x(), e.position().y())
            if i != self._hover:
                self._hover = i
                self.link_hovered.emit(i)
                self.update()

    def _pick(self, sx, sy, tol=6.0) -> int:
        """Nearest link within tolerance pixels of (sx, sy)."""
        wx, wy = self._to_world(sx, sy)
        net = self.net
        r = tol / self._scale
        best, bestd = -1, r ** 2
        # Cheap bbox pre-filter so this stays fast on a large network.
        for i in range(net.n_links):
            a, b = net.geom_off[i], net.geom_off[i + 1]
            seg = net.geom_xy[a:b]
            if (seg[:, 0].max() < wx - r or seg[:, 0].min() > wx + r or
                    seg[:, 1].max() < wy - r or seg[:, 1].min() > wy + r):
                continue
            g = seg
            for k in range(len(g) - 1):
                d2 = _seg_dist2(wx, wy, g[k], g[k + 1])
                if d2 < bestd:
                    bestd = d2
                    best = i
        return best


def _seg_dist2(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2
