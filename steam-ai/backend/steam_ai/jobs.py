"""Minimal in-process job queue for long tasks (ingest, report). One worker
thread; jobs are recorded in memory and in the audit log. Good enough for a
single VM; swap for a persistent queue later without changing callers."""

from __future__ import annotations

import queue
import threading
import traceback
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from . import audit


class Job:
    def __init__(self, kind: str, fn: Callable[[], Any], meta: dict[str, Any]):
        self.job_id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.fn = fn
        self.meta = meta
        self.status = "queued"
        self.result: Any = None
        self.error: str | None = None
        self.created_at = datetime.now(timezone.utc)
        self.finished_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.status,
            "meta": self.meta,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }


class JobQueue:
    def __init__(self) -> None:
        self._q: queue.Queue[Job] = queue.Queue()
        self._jobs: dict[str, Job] = {}
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._loop, daemon=True, name="steam-ai-jobs")
            self._thread.start()

    def submit(self, kind: str, fn: Callable[[], Any], **meta: Any) -> Job:
        job = Job(kind, fn, meta)
        with self._lock:
            self._jobs[job.job_id] = job
        self._q.put(job)
        audit.record("job_queued", job_id=job.job_id, kind=kind, **meta)
        self.start()
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def all(self) -> list[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def _loop(self) -> None:
        while True:
            job = self._q.get()
            job.status = "running"
            try:
                job.result = job.fn()
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 - job errors are reported, not raised
                job.status = "failed"
                job.error = f"{exc}\n{traceback.format_exc()}"
            job.finished_at = datetime.now(timezone.utc)
            audit.record("job_finished", job_id=job.job_id, status=job.status,
                         error=(job.error or "")[:500])
            self._q.task_done()


QUEUE = JobQueue()
