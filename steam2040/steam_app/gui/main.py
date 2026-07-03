"""STEAM 2040 Studio — the merged main window.

One window, two modes over a shared map and shared data: **Assignment**
(Prompt A) and **Aggregation** (Prompt B).  A docked AI assistant can drive
everything.
"""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                               QComboBox, QPushButton, QLabel, QProgressBar,
                               QFileDialog, QDockWidget, QTableWidget,
                               QTableWidgetItem, QFormLayout, QSpinBox,
                               QDoubleSpinBox, QGroupBox, QStackedWidget,
                               QMessageBox, QStatusBar, QCheckBox)

from steam_core.classify import class_name
from steam_assignment import METHODS
from ..state import AppState, DEMAND_SOURCES
from ..capabilities import build_registry
from .mapwidget import MapView
from .worker import AssignmentWorker
from .chatdock import ChatDock
from .settings_dialog import SettingsDialog

COLOR_MODES = [("Facility class", "class"), ("Volume", "volume"),
               ("v/c ratio", "vc"), ("LOS", "los"),
               ("Scenario difference", "difference"), ("Zone clusters", "cluster")]
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "steam2040"


class MainWindow(QMainWindow):
    def __init__(self, state: AppState | None = None):
        super().__init__()
        self.setWindowTitle("STEAM 2040 Studio")
        self.resize(1280, 820)
        self.state = state or AppState()
        self.registry = build_registry()
        self._worker = None
        self._selected_link = None

        self.map = MapView()
        self.setCentralWidget(self.map)
        self.map.link_hovered.connect(self._on_hover)
        self.map.link_clicked.connect(self._on_link_click)

        self._build_toolbar()
        self._build_control_dock()
        self._build_results_dock()
        self._build_chat_dock()
        self.setStatusBar(QStatusBar())

    # ---- toolbar ---------------------------------------------------------
    def _build_toolbar(self):
        tb = self.addToolBar("Main")
        tb.setMovable(False)
        for label, slot in [("Open Network", self._open_network),
                            ("Open Zones", self._open_zones),
                            ("Open Matrix", self._open_matrix),
                            ("Settings…", self._open_settings)]:
            act = QAction(label, self)
            act.triggered.connect(slot)
            tb.addAction(act)
        tb.addSeparator()
        tb.addWidget(QLabel("  Mode: "))
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["Assignment", "Aggregation"])
        self.mode_combo.currentIndexChanged.connect(self._mode_changed)
        tb.addWidget(self.mode_combo)
        tb.addWidget(QLabel("  Colour: "))
        self.color_combo = QComboBox()
        for label, _ in COLOR_MODES:
            self.color_combo.addItem(label)
        self.color_combo.currentIndexChanged.connect(self._color_changed)
        tb.addWidget(self.color_combo)
        reset = QAction("Reset View", self)
        reset.triggered.connect(lambda: (self.map.reset_view(), self.map.update()))
        tb.addAction(reset)

    # ---- control dock (mode-dependent) -----------------------------------
    def _build_control_dock(self):
        self.control_dock = QDockWidget("Controls", self)
        self.control_stack = QStackedWidget()
        self.control_stack.addWidget(self._assignment_panel())
        self.control_stack.addWidget(self._aggregation_panel())
        self.control_dock.setWidget(self.control_stack)
        self.addDockWidget(Qt.LeftDockWidgetArea, self.control_dock)

    def _assignment_panel(self):
        w = QWidget()
        lay = QVBoxLayout(w)
        box = QGroupBox("Assignment")
        form = QFormLayout(box)
        self.method_combo = QComboBox()
        self.method_combo.addItems(METHODS)
        self.method_combo.setCurrentText(METHODS[3])
        self.demand_combo = QComboBox()
        self.demand_combo.addItems(DEMAND_SOURCES)
        form.addRow("Method", self.method_combo)
        form.addRow("Demand", self.demand_combo)
        self.run_btn = QPushButton("Run assignment")
        self.run_btn.clicked.connect(self._run_assignment)
        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.clicked.connect(self._cancel_assignment)
        self.cancel_btn.setEnabled(False)
        self.progress = QProgressBar()
        self.gap_label = QLabel("gap: –")
        form.addRow(self.run_btn)
        form.addRow(self.cancel_btn)
        form.addRow(self.progress)
        form.addRow(self.gap_label)
        lay.addWidget(box)

        scen = QGroupBox("Scenario")
        sform = QFormLayout(scen)
        self.sel_label = QLabel("Selected link: none (right-click a link)")
        self.add_lanes = QSpinBox()
        self.add_lanes.setRange(1, 6)
        self.upgrade_btn = QPushButton("Upgrade selected link")
        self.upgrade_btn.clicked.connect(self._upgrade_selected)
        self.scenario_btn = QPushButton("Run scenario vs baseline")
        self.scenario_btn.clicked.connect(self._run_scenario)
        self.undo_btn = QPushButton("Undo edit")
        self.undo_btn.clicked.connect(self._undo)
        sform.addRow(self.sel_label)
        sform.addRow("Add lanes", self.add_lanes)
        sform.addRow(self.upgrade_btn)
        sform.addRow(self.scenario_btn)
        sform.addRow(self.undo_btn)
        lay.addWidget(scen)

        tools = QGroupBox("Analysis")
        tform = QVBoxLayout(tools)
        for label, slot in [("Recommendations", self._recommend),
                            ("Connectivity check", self._connectivity),
                            ("Export links CSV…", self._export_links)]:
            b = QPushButton(label)
            b.clicked.connect(slot)
            tform.addWidget(b)
        lay.addWidget(tools)
        lay.addStretch(1)
        return w

    def _aggregation_panel(self):
        w = QWidget()
        lay = QVBoxLayout(w)
        box = QGroupBox("Zone aggregation")
        form = QFormLayout(box)
        self.agg_target = QSpinBox()
        self.agg_target.setRange(1, 100000)
        self.agg_target.setValue(self.state.settings.target_zone_count)
        self.agg_barrier = QComboBox()
        self.agg_barrier.addItems(["fwy", "art", "coll"])
        self.agg_barrier.setCurrentText("coll")
        self.agg_span = QDoubleSpinBox()
        self.agg_span.setRange(100, 100000)
        self.agg_span.setDecimals(0)
        self.agg_span.setValue(self.state.settings.max_span_m)
        self.agg_method = QComboBox()
        self.agg_method.addItems(["single", "dynamic"])
        form.addRow("Target zones", self.agg_target)
        form.addRow("Barrier ≥", self.agg_barrier)
        form.addRow("Max span (m)", self.agg_span)
        form.addRow("Method", self.agg_method)
        self.key_checks = {}
        for key in ("district", "areatype", "urban_rura", "metro_access", "lu_class"):
            cb = QCheckBox(key)
            if key == "district":
                cb.setChecked(True)
            self.key_checks[key] = cb
            form.addRow(cb)
        self.agg_btn = QPushButton("Aggregate")
        self.agg_btn.clicked.connect(self._aggregate)
        form.addRow(self.agg_btn)
        self.agg_stats = QLabel("–")
        self.agg_stats.setWordWrap(True)
        form.addRow(self.agg_stats)
        lay.addWidget(box)

        out = QGroupBox("Outputs")
        oform = QVBoxLayout(out)
        for label, slot in [("QA audit", self._agg_qa),
                            ("Export correspondence…", self._export_corr),
                            ("Export aggregated OD…", self._export_agg_od),
                            ("Export GeoJSON…", self._export_geojson)]:
            b = QPushButton(label)
            b.clicked.connect(slot)
            oform.addWidget(b)
        lay.addWidget(out)
        lay.addStretch(1)
        return w

    # ---- results dock ----------------------------------------------------
    def _build_results_dock(self):
        dock = QDockWidget("Results", self)
        body = QWidget()
        lay = QVBoxLayout(body)
        lay.addWidget(QLabel("Network KPIs"))
        self.kpi_table = QTableWidget(0, 2)
        self.kpi_table.setHorizontalHeaderLabels(["Metric", "Value"])
        self.kpi_table.horizontalHeader().setStretchLastSection(True)
        lay.addWidget(self.kpi_table)
        lay.addWidget(QLabel("Top congested links"))
        self.links_table = QTableWidget(0, 6)
        self.links_table.setHorizontalHeaderLabels(
            ["Link", "Class", "Vol", "Cap", "v/c", "LOS"])
        lay.addWidget(self.links_table)
        dock.setWidget(body)
        self.addDockWidget(Qt.RightDockWidgetArea, dock)

    def _build_chat_dock(self):
        self.chat = ChatDock(self.state, self.registry, self)
        self.chat.state_changed.connect(self._refresh_all)
        self.addDockWidget(Qt.RightDockWidgetArea, self.chat)

    # ---- data loading slots ---------------------------------------------
    def _open_network(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Open network", "", "Network (*.shp *.csv)")
        if path:
            try:
                self.statusBar().showMessage("Loading network…")
                self.state.load_network(path, cache_dir=CACHE_DIR,
                                        progress=self.statusBar().showMessage)
                self.map.set_network(self.state.network)
                self.statusBar().showMessage(
                    f"Network: {self.state.network.n_links:,} links, "
                    f"{self.state.network.n_nodes:,} nodes", 5000)
            except Exception as exc:
                QMessageBox.critical(self, "Load error", str(exc))

    def _open_zones(self):
        path, _ = QFileDialog.getOpenFileName(self, "Open zones", "", "CSV (*.csv)")
        if path:
            try:
                self.state.load_zones(path)
                self.statusBar().showMessage(f"Zones: {self.state.zones.n:,}", 4000)
            except Exception as exc:
                QMessageBox.critical(self, "Load error", str(exc))

    def _open_matrix(self):
        path, _ = QFileDialog.getOpenFileName(self, "Open OD matrix", "", "CSV (*.csv)")
        if path:
            try:
                self.state.load_matrix(path)
                self.statusBar().showMessage(
                    f"OD: {self.state.od.n_pairs:,} pairs", 4000)
            except Exception as exc:
                QMessageBox.critical(self, "Load error", str(exc))

    def _open_settings(self):
        dlg = SettingsDialog(self.state.settings, self)
        if dlg.exec():
            if self.state.network is not None:
                self.state.network.recompute_costs(self.state.settings)

    # ---- mode / colour ---------------------------------------------------
    def _mode_changed(self, idx):
        self.control_stack.setCurrentIndex(idx)
        if idx == 1:
            self.color_combo.setCurrentIndex(len(COLOR_MODES) - 1)  # cluster

    def _color_changed(self, idx):
        self.map.set_mode(COLOR_MODES[idx][1])

    # ---- assignment ------------------------------------------------------
    def _run_assignment(self):
        if self.state.network is None:
            QMessageBox.information(self, "No network", "Load a network first.")
            return
        if self._worker is not None:
            return
        self.run_btn.setEnabled(False)
        self.cancel_btn.setEnabled(True)
        self.state.warmup()
        self._worker = AssignmentWorker(self.state, self.method_combo.currentText(),
                                        self.demand_combo.currentText())
        self._worker.progress.connect(self._on_progress)
        self._worker.finished_ok.connect(self._on_assignment_done)
        self._worker.failed.connect(self._on_assignment_failed)
        self._worker.start()

    def _cancel_assignment(self):
        if self._worker:
            self._worker.cancel()

    def _on_progress(self, i, n, gap):
        self.progress.setMaximum(max(n, 1))
        self.progress.setValue(i)
        if gap == gap:  # not NaN
            self.gap_label.setText(f"gap: {gap:.2e}")

    def _on_assignment_done(self, result):
        self._worker = None
        self.run_btn.setEnabled(True)
        self.cancel_btn.setEnabled(False)
        self.map.set_result(result)
        if self.color_combo.currentIndex() == 0:
            self.color_combo.setCurrentIndex(1)  # switch to volume
        self._refresh_kpis()
        self.statusBar().showMessage(
            f"{result.method}: {result.iterations} iterations", 5000)

    def _on_assignment_failed(self, msg):
        self._worker = None
        self.run_btn.setEnabled(True)
        self.cancel_btn.setEnabled(False)
        QMessageBox.critical(self, "Assignment failed", msg)

    # ---- scenario --------------------------------------------------------
    def _on_link_click(self, i):
        self._selected_link = i
        net = self.state.network
        self.sel_label.setText(
            f"Selected link {int(net.link_id[i])} ({class_name(net.klass[i])}, "
            f"{int(net.lanes[i])} ln)")

    def _upgrade_selected(self):
        if self._selected_link is None:
            QMessageBox.information(self, "No link", "Right-click a link to select it.")
            return
        lid = int(self.state.network.link_id[self._selected_link])
        self.state.upgrade_link(lid, self.add_lanes.value())
        self.statusBar().showMessage(
            f"Queued +{self.add_lanes.value()} lanes on link {lid}", 4000)

    def _run_scenario(self):
        if not (self.state.editor and self.state.editor.edits):
            QMessageBox.information(self, "No edits", "Queue an edit first.")
            return
        try:
            diff = self.state.run_scenario(self.method_combo.currentText(),
                                           self.demand_combo.currentText())
        except Exception as exc:
            QMessageBox.critical(self, "Scenario failed", str(exc))
            return
        self.map.set_diff(diff.volume_delta)
        self.color_combo.setCurrentIndex(4)  # difference
        QMessageBox.information(
            self, "Scenario result",
            f"ΔVHT {diff.vht_delta:+,.0f} veh-h\n"
            f"ΔVMT {diff.vmt_delta:+,.0f} veh-km\n"
            f"Δover-capacity {diff.overcap_delta:+d} links\n"
            f"Annual cost-benefit {diff.cost_benefit:+,.0f}")

    def _undo(self):
        if self.state.undo():
            self.statusBar().showMessage("Edit undone", 3000)

    def _recommend(self):
        if self.state.result is None:
            QMessageBox.information(self, "Run first", "Run an assignment first.")
            return
        try:
            ev, programme = self.state.recommend(self.method_combo.currentText(),
                                                 self.demand_combo.currentText(),
                                                 n_eval=6)
        except Exception as exc:
            QMessageBox.critical(self, "Recommend failed", str(exc))
            return
        lines = [f"{r.name}\n   VHT saved {r.measured_vht_saved:,.1f}, BCR {r.bcr:.3g}"
                 for r in ev[:6]]
        QMessageBox.information(self, "Recommendations", "\n".join(lines)
                                + f"\n\nProgramme: {len(programme)} projects")

    def _connectivity(self):
        if self.state.network is None:
            return
        info = self.state.connectivity()
        QMessageBox.information(self, "Connectivity",
                                "\n".join(f"{k}: {v}" for k, v in info.items()))

    def _export_links(self):
        if self.state.result is None:
            return
        path, _ = QFileDialog.getSaveFileName(self, "Export links", "links.csv", "CSV (*.csv)")
        if path:
            self.state.export_links(path)
            self.statusBar().showMessage(f"Exported {path}", 4000)

    # ---- aggregation -----------------------------------------------------
    def _aggregate(self):
        if self.state.zones is None or self.state.network is None:
            QMessageBox.information(self, "Load data", "Load network and zones first.")
            return
        keys = tuple(k for k, cb in self.key_checks.items() if cb.isChecked())
        try:
            res = self.state.aggregate_zones(
                target_zone_count=self.agg_target.value(),
                barrier_threshold=self.agg_barrier.currentText(),
                max_span_m=self.agg_span.value(),
                method=self.agg_method.currentText(),
                keys=keys or ("district",))
        except Exception as exc:
            QMessageBox.critical(self, "Aggregation failed", str(exc))
            return
        from steam_viewer.aggregate import aggregation_stats
        st = aggregation_stats(self.state.zones, res)
        self.agg_stats.setText(
            f"{st['zones_in']:,} → {st['clusters_out']:,} clusters; "
            f"{st['merge_steps']:,} merges; mean {st['mean_cluster_size']:.2f}, "
            f"max {st['max_cluster_size']}")
        self.map.set_aggregation(self.state.zones, res)
        self.color_combo.setCurrentIndex(len(COLOR_MODES) - 1)

    def _agg_qa(self):
        if self.state.aggregation is None:
            return
        q = self.state.aggregation_qa()
        QMessageBox.information(self, "QA audit",
                                "\n".join(f"{k}: {v}" for k, v in q.items()
                                          if k.startswith("n_")))

    def _export_corr(self):
        if self.state.aggregation is None:
            return
        path, _ = QFileDialog.getSaveFileName(self, "Correspondence", "correspondence.csv", "CSV (*.csv)")
        if path:
            self.state.export_correspondence(path)
            self.statusBar().showMessage(f"Exported {path}", 4000)

    def _export_agg_od(self):
        if self.state.aggregation is None or self.state.od is None:
            QMessageBox.information(self, "Need data", "Aggregate and load an OD matrix first.")
            return
        path, _ = QFileDialog.getSaveFileName(self, "Aggregated OD", "agg_od.csv", "CSV (*.csv)")
        if path:
            self.state.export_aggregated_od(path)
            self.statusBar().showMessage(f"Exported {path}", 4000)

    def _export_geojson(self):
        if self.state.aggregation is None:
            return
        path, _ = QFileDialog.getSaveFileName(self, "GeoJSON", "clusters.geojson", "GeoJSON (*.geojson)")
        if path:
            self.state.export_geojson(path)
            self.statusBar().showMessage(f"Exported {path}", 4000)

    # ---- hover / refresh -------------------------------------------------
    def _on_hover(self, i):
        if i < 0 or self.state.network is None:
            return
        net = self.state.network
        msg = (f"Link {int(net.link_id[i])} | {class_name(net.klass[i])} | "
               f"{int(net.lanes[i])} ln | {net.length[i]:.0f} m")
        if self.state.result is not None and i < self.state.result.n_links:
            r = self.state.result
            from steam_assignment.bpr import los_label
            msg += (f" | vol {r.volume[i]:.0f} | cap {r.capacity[i]:.0f} | "
                    f"v/c {r.vc[i]:.2f} | LOS {los_label(r.los[i])} | "
                    f"{net.length[i] / max(r.congested_time[i],1e-6)*3.6:.0f} km/h")
        self.statusBar().showMessage(msg)

    def _refresh_kpis(self):
        if self.state.result is None:
            return
        kpis = self.state.kpis()
        rows = kpis.as_rows()
        self.kpi_table.setRowCount(len(rows))
        for r, (k, v) in enumerate(rows):
            self.kpi_table.setItem(r, 0, QTableWidgetItem(k))
            self.kpi_table.setItem(r, 1, QTableWidgetItem(v))
        links = self.state.top_links(15)
        self.links_table.setRowCount(len(links))
        for r, d in enumerate(links):
            vals = [str(d["link_id"]), d["class"], f"{d['volume']:.0f}",
                    f"{d['capacity']:.0f}", f"{d['vc']:.2f}", d["los"]]
            for c, v in enumerate(vals):
                self.links_table.setItem(r, c, QTableWidgetItem(v))

    def _refresh_all(self):
        if self.state.network is not None:
            self.map.set_network(self.state.network) if self.map.net is None else None
        if self.state.result is not None:
            self.map.set_result(self.state.result)
            self._refresh_kpis()
        if self.state.aggregation is not None:
            self.map.set_aggregation(self.state.zones, self.state.aggregation)
        self.map.update()


def run(argv=None):
    """Launch the GUI."""
    import sys
    from PySide6.QtWidgets import QApplication
    app = QApplication(argv or sys.argv)
    win = MainWindow()
    win.show()
    return app.exec()
