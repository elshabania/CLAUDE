"""Settings editor dialog — capacities, speeds, BPR, demand, economics."""

from __future__ import annotations

from PySide6.QtWidgets import (QDialog, QFormLayout, QDoubleSpinBox, QSpinBox,
                               QDialogButtonBox, QTabWidget, QWidget, QComboBox,
                               QVBoxLayout)

from steam_core.classify import FACILITY_CLASSES


def _dspin(value, lo=0.0, hi=1e9, step=0.05, dec=3):
    s = QDoubleSpinBox()
    s.setRange(lo, hi)
    s.setDecimals(dec)
    s.setSingleStep(step)
    s.setValue(float(value))
    return s


def _ispin(value, lo=0, hi=10_000_000):
    s = QSpinBox()
    s.setRange(lo, hi)
    s.setValue(int(value))
    return s


class SettingsDialog(QDialog):
    def __init__(self, settings, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.s = settings
        self.resize(440, 480)
        tabs = QTabWidget()
        tabs.addTab(self._classes_tab(), "Classes")
        tabs.addTab(self._engine_tab(), "Engine")
        tabs.addTab(self._agg_tab(), "Aggregation")
        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.accepted.connect(self._apply)
        btns.rejected.connect(self.reject)
        lay = QVBoxLayout(self)
        lay.addWidget(tabs)
        lay.addWidget(btns)

    def _classes_tab(self):
        w = QWidget()
        form = QFormLayout(w)
        self.cap = {}
        self.spd = {}
        for c in FACILITY_CLASSES:
            cd = self.s.classes[c]
            self.cap[c] = _ispin(cd.cap_per_lane, 1, 10000)
            self.spd[c] = _dspin(cd.speed_kmh, 1, 200, 1, 1)
            form.addRow(f"{c} cap/lane (veh/h)", self.cap[c])
            form.addRow(f"{c} speed (km/h)", self.spd[c])
        return w

    def _engine_tab(self):
        w = QWidget()
        form = QFormLayout(w)
        self.bpr_alpha = _dspin(self.s.bpr_alpha, 0, 5, 0.01)
        self.bpr_beta = _dspin(self.s.bpr_beta, 1, 12, 0.1, 2)
        self.period = _dspin(self.s.period_factor, 0.001, 1.0, 0.005, 3)
        self.scale = _dspin(self.s.demand_scale, 0.001, 100, 0.05, 3)
        self.deter = _dspin(self.s.deterrence_beta, 0.001, 2, 0.01, 3)
        self.vot = _dspin(self.s.value_of_time, 0, 1000, 1, 1)
        self.wdays = _dspin(self.s.working_days, 1, 365, 1, 0)
        self.sample = _ispin(self.s.origin_sample, 0, 100000)
        self.fwiter = _ispin(self.s.fw_max_iter, 1, 200)
        self.fwgap = _dspin(self.s.fw_gap_target, 1e-6, 1, 1e-4, 6)
        for label, wid in [("BPR alpha", self.bpr_alpha), ("BPR beta", self.bpr_beta),
                           ("Period factor", self.period), ("Demand × scale", self.scale),
                           ("Deterrence beta (/min)", self.deter),
                           ("Value of time", self.vot), ("Working days", self.wdays),
                           ("Origin sample (0=all)", self.sample),
                           ("Frank-Wolfe max iter", self.fwiter),
                           ("FW gap target", self.fwgap)]:
            form.addRow(label, wid)
        return w

    def _agg_tab(self):
        w = QWidget()
        form = QFormLayout(w)
        self.barrier = QComboBox()
        self.barrier.addItems(["fwy", "art", "coll"])
        self.barrier.setCurrentText(self.s.barrier_threshold)
        self.span = _dspin(self.s.max_span_m, 100, 100000, 100, 0)
        self.target = _ispin(self.s.target_zone_count, 1, 100000)
        form.addRow("Barrier threshold", self.barrier)
        form.addRow("Max span (m)", self.span)
        form.addRow("Target zone count", self.target)
        return w

    def _apply(self):
        for c in FACILITY_CLASSES:
            self.s.classes[c].cap_per_lane = float(self.cap[c].value())
            self.s.classes[c].speed_kmh = float(self.spd[c].value())
        self.s.bpr_alpha = self.bpr_alpha.value()
        self.s.bpr_beta = self.bpr_beta.value()
        self.s.period_factor = self.period.value()
        self.s.demand_scale = self.scale.value()
        self.s.deterrence_beta = self.deter.value()
        self.s.value_of_time = self.vot.value()
        self.s.working_days = self.wdays.value()
        self.s.origin_sample = int(self.sample.value())
        self.s.fw_max_iter = int(self.fwiter.value())
        self.s.fw_gap_target = self.fwgap.value()
        self.s.barrier_threshold = self.barrier.currentText()
        self.s.max_span_m = self.span.value()
        self.s.target_zone_count = int(self.target.value())
        self.accept()
