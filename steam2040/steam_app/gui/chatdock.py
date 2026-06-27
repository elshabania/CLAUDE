"""Docked AI assistant chat panel.

Sends the user's message to the :class:`~steam_app.assistant.Assistant` on a
background thread (the Claude backend makes network calls), then asks the main
window to refresh because the assistant may have changed application state.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (QDockWidget, QWidget, QVBoxLayout, QHBoxLayout,
                               QTextEdit, QLineEdit, QPushButton, QLabel)

from .worker import TaskWorker
from ..assistant import Assistant


class ChatDock(QDockWidget):
    state_changed = Signal()      # assistant performed actions; refresh views

    def __init__(self, state, registry, parent=None):
        super().__init__("AI Assistant", parent)
        self.state = state
        self.assistant = Assistant(state, registry)
        self._worker = None

        body = QWidget()
        lay = QVBoxLayout(body)
        self.banner = QLabel(f"Backend: {self.assistant.backend_name} "
                             f"({'Claude' if self.assistant.backend_name == 'claude' else 'offline rules'})")
        self.banner.setStyleSheet("color:#9ad;")
        self.log = QTextEdit(readOnly=True)
        self.log.setMinimumWidth(280)
        row = QHBoxLayout()
        self.input = QLineEdit()
        self.input.setPlaceholderText("e.g. run frank-wolfe, then show top 10 links")
        self.send = QPushButton("Send")
        row.addWidget(self.input)
        row.addWidget(self.send)
        lay.addWidget(self.banner)
        lay.addWidget(self.log, 1)
        lay.addLayout(row)
        self.setWidget(body)

        self.send.clicked.connect(self._submit)
        self.input.returnPressed.connect(self._submit)
        self._hello()

    def _hello(self):
        self.log.append("<b>Assistant ready.</b> Ask me to load data, run "
                        "assignments, test scenarios, recommend improvements, or "
                        "aggregate zones.<br>")

    def _submit(self):
        text = self.input.text().strip()
        if not text or self._worker is not None:
            return
        self.input.clear()
        self.log.append(f'<b style="color:#7c7;">You:</b> {text}')
        self.send.setEnabled(False)
        self._worker = TaskWorker(self.assistant.chat, text)
        self._worker.finished_ok.connect(self._on_reply)
        self._worker.failed.connect(self._on_error)
        self._worker.start()

    def _on_reply(self, reply):
        for a in reply.actions:
            self.log.append(f'<span style="color:#88a;">▸ {a.capability}'
                            f'({_fmt(a.params)})</span>')
        if reply.text:
            self.log.append(f'<b style="color:#9ad;">Assistant:</b> '
                            f'{reply.text.replace(chr(10), "<br>")}<br>')
        self._finish()
        if reply.actions:
            self.state_changed.emit()

    def _on_error(self, msg):
        self.log.append(f'<span style="color:#e88;">Assistant error: {msg}</span><br>')
        self._finish()

    def _finish(self):
        self.send.setEnabled(True)
        self._worker = None


def _fmt(params: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in params.items())
