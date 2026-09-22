"""Filesystem layout. Everything lives under one data root, overridable by env."""

from __future__ import annotations

import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PACKAGE_DIR.parent
STEAM_AI_DIR = BACKEND_DIR.parent
CONFIG_DIR = Path(os.environ.get("STEAM_AI_CONFIG", STEAM_AI_DIR / "config"))
DATA_DIR = Path(os.environ.get("STEAM_AI_DATA", STEAM_AI_DIR / "data"))
FRONTEND_DIST = Path(os.environ.get("STEAM_AI_FRONTEND", STEAM_AI_DIR / "frontend" / "dist"))


def runs_dir() -> Path:
    return DATA_DIR / "runs"


def watch_dir() -> Path:
    return DATA_DIR / "watch"


def run_dir(run_id: str) -> Path:
    return runs_dir() / run_id


def audit_log_path() -> Path:
    return DATA_DIR / "audit" / "audit.jsonl"
