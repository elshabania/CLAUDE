"""Background worker threads so heavy work never blocks the UI."""

from __future__ import annotations

from PySide6.QtCore import QThread, Signal


class AssignmentWorker(QThread):
    progress = Signal(int, int, float)   # iter, max, gap
    finished_ok = Signal(object)         # AssignmentResult
    failed = Signal(str)

    def __init__(self, state, method, source):
        super().__init__()
        self.state = state
        self.method = method
        self.source = source
        self._cancel = False

    def cancel(self):
        self._cancel = True

    def run(self):
        try:
            res = self.state.run_assignment(
                self.method, self.source,
                progress=lambda i, n, g: self.progress.emit(i, n, g),
                cancel=lambda: self._cancel)
            self.finished_ok.emit(res)
        except Exception as exc:  # pragma: no cover - surfaced in UI
            self.failed.emit(str(exc))


class TaskWorker(QThread):
    """Run an arbitrary callable off the UI thread."""

    finished_ok = Signal(object)
    failed = Signal(str)

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

    def run(self):
        try:
            self.finished_ok.emit(self._fn(*self._args, **self._kwargs))
        except Exception as exc:  # pragma: no cover
            self.failed.emit(str(exc))
