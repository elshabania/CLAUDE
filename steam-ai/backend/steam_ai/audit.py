"""Append-only audit trail. One JSON object per line."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .paths import audit_log_path


def record(event: str, **fields: Any) -> None:
    path = audit_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **fields}
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, default=str) + "\n")


def tail(limit: int = 100) -> list[dict[str, Any]]:
    path = audit_log_path()
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()[-limit:]
    return [json.loads(line) for line in lines if line.strip()]
