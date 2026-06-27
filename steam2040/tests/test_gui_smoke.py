"""Offscreen GUI smoke test — instantiates the window and renders the map.

Skipped automatically if PySide6 / a Qt platform plugin is unavailable.
"""

import os

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PySide6")


@pytest.fixture(scope="module")
def qapp():
    from PySide6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication([])
    yield app


def test_window_renders(qapp, sample):
    from PySide6.QtGui import QPixmap
    from steam_app import AppState
    from steam_app.gui import MainWindow

    s = AppState()
    s.settings.demand_scale = 0.1
    win = MainWindow(s)
    win.show()
    s.load_network(sample["network"])
    win.map.set_network(s.network)
    s.load_zones(sample["zones"])
    s.load_matrix(sample["od"])
    res = s.run_assignment("MSA", "Loaded OD matrix")
    win.map.set_result(res)
    win._refresh_kpis()
    assert win.kpi_table.rowCount() == 7
    assert win.links_table.rowCount() > 0

    win.map.resize(640, 480)
    for mode in ("class", "volume", "vc", "los"):
        win.map.set_mode(mode)
        pm = QPixmap(640, 480)
        win.map.render(pm)          # exercises paintEvent
        assert not pm.isNull()

    # aggregation path
    s.aggregate_zones(target_zone_count=80)
    win.map.set_aggregation(s.zones, s.aggregation)
    win.map.set_mode("cluster")
    pm = QPixmap(640, 480)
    win.map.render(pm)
    assert not pm.isNull()


def test_assistant_through_chatdock(qapp, sample):
    from steam_app import AppState
    from steam_app.gui import MainWindow

    s = AppState()
    s.settings.demand_scale = 0.1
    win = MainWindow(s)
    s.load_network(sample["network"])
    s.load_zones(sample["zones"])
    s.load_matrix(sample["od"])
    reply = win.chat.assistant.chat("run msa then show kpis")
    caps = [a.capability for a in reply.actions]
    assert "run_assignment" in caps
