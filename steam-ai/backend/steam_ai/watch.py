"""Watch folder: fire when an export sentinel appears in a subdirectory.

A run takes 30-45 hours, so the watcher never fires on a folder appearing; it
fires only on ``schema.EXPORT_SENTINEL`` (assumptions.md Q8) in an export
directory that has no ``.steam_ai_processed`` marker yet. After ``on_ready``
returns the marker is written so the directory is processed exactly once; if
``on_ready`` raises, the marker records the error and the directory is not
retried until the marker is deleted.

watchdog is used when importable to wake the loop promptly; the loop also polls
every ``poll_s`` seconds, which is the fallback when watchdog is unavailable.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from . import schema

PROCESSED_MARKER = ".steam_ai_processed"
log = logging.getLogger(__name__)


def is_processed(export_dir: Path) -> bool:
    return (Path(export_dir) / PROCESSED_MARKER).exists()


def mark_processed(export_dir: Path, status: str, error: str | None = None) -> None:
    payload = {"status": status, "processed_at": datetime.now(timezone.utc).isoformat()}
    if error:
        payload["error"] = error
    (Path(export_dir) / PROCESSED_MARKER).write_text(json.dumps(payload, indent=2), "utf-8")


def find_ready(root: Path) -> list[Path]:
    """Export directories under ``root`` (any depth) with a sentinel and no marker."""
    root = Path(root)
    if not root.is_dir():
        return []
    ready = []
    for sentinel in sorted(root.rglob(schema.EXPORT_SENTINEL)):
        if sentinel.is_file() and not is_processed(sentinel.parent):
            ready.append(sentinel.parent)
    return ready


def process_ready(root: Path, on_ready: Callable[[Path], None]) -> list[Path]:
    """Call ``on_ready`` for every ready export dir, marking each one; returns those processed."""
    done = []
    for export_dir in find_ready(root):
        try:
            on_ready(export_dir)
        except Exception as exc:  # keep watching; record the failure on the directory
            log.exception("on_ready failed for %s", export_dir)
            mark_processed(export_dir, "failed", f"{type(exc).__name__}: {exc}")
        else:
            mark_processed(export_dir, "processed")
        done.append(export_dir)
    return done


def _start_watchdog(root: Path, wake: threading.Event) -> object | None:
    """Start a watchdog observer that sets ``wake`` on sentinel events; None if unavailable."""
    try:
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer
    except ImportError:
        return None

    class Handler(FileSystemEventHandler):
        def on_any_event(self, event: object) -> None:
            src = str(getattr(event, "src_path", "") or "")
            dest = str(getattr(event, "dest_path", "") or "")
            if src.endswith(schema.EXPORT_SENTINEL) or dest.endswith(schema.EXPORT_SENTINEL):
                wake.set()

    try:
        observer = Observer()
        observer.schedule(Handler(), str(root), recursive=True)
        observer.start()
    except Exception:  # inotify limits, unsupported filesystem, ...
        log.warning("watchdog observer unavailable; polling only", exc_info=True)
        return None
    return observer


def watch(
    dir: Path,
    on_ready: Callable[[Path], None],
    poll_s: float = 5.0,
    once: bool = False,
    stop_event: threading.Event | None = None,
) -> list[Path]:
    """Watch ``dir`` for completed exports and call ``on_ready(export_dir)`` for each.

    ``once=True`` scans a single time and returns. Otherwise the loop runs until
    ``stop_event`` is set (or KeyboardInterrupt). Returns the directories processed.
    """
    root = Path(dir)
    root.mkdir(parents=True, exist_ok=True)
    processed: list[Path] = []
    if once:
        return process_ready(root, on_ready)

    wake = threading.Event()
    observer = _start_watchdog(root, wake)
    log.info("watching %s (watchdog=%s, poll=%.1fs)", root, observer is not None, poll_s)
    try:
        while True:
            processed.extend(process_ready(root, on_ready))
            if stop_event is not None and stop_event.is_set():
                break
            wake.wait(timeout=poll_s)
            wake.clear()
            if wake.is_set() is False and stop_event is not None and stop_event.is_set():
                break
            time.sleep(0.05)  # let a sentinel writer finish closing the file
    except KeyboardInterrupt:
        pass
    finally:
        if observer is not None:
            observer.stop()  # type: ignore[attr-defined]
            observer.join(timeout=2)  # type: ignore[attr-defined]
    return processed
