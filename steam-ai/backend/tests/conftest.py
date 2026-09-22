"""Shared fixtures. The data root is redirected to a temporary directory BEFORE any
steam_ai module is imported, because ``steam_ai.paths`` reads STEAM_AI_DATA at import.

Fixtures other test modules can rely on:

* ``data_dir``                       session-wide data root (Path)
* ``synthetic_export(defects=..., variant=..., seed=..., **kw)`` -> export dir (cached)
* ``ingested_run(defects=..., variant=..., base_run_id=..., **kw)`` -> RunStore (cached)
"""

from __future__ import annotations

import hashlib
import importlib
import os
import shutil
import tempfile
from collections.abc import Callable, Iterable
from pathlib import Path

import pytest

# Always a fresh temporary root: never the developer's real STEAM_AI_DATA, which the
# session fixture would otherwise delete at exit.
_TEST_DATA_ROOT = tempfile.mkdtemp(prefix="steam_ai_test_data_")
os.environ["STEAM_AI_DATA"] = _TEST_DATA_ROOT

import steam_ai.paths  # noqa: E402
import steam_ai.store  # noqa: E402
import steam_ai.audit  # noqa: E402

importlib.reload(steam_ai.paths)
importlib.reload(steam_ai.store)
importlib.reload(steam_ai.audit)

from steam_ai.ingest import ingest_export_dir  # noqa: E402
from steam_ai.store import RunStore  # noqa: E402
from steam_ai.synthetic import generate_run  # noqa: E402


@pytest.fixture(scope="session")
def data_dir() -> Iterable[Path]:
    root = Path(_TEST_DATA_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    assert steam_ai.paths.DATA_DIR == root
    yield root
    shutil.rmtree(root, ignore_errors=True)


def _key(defects: Iterable[str] | None, variant: str, seed: int, extra: dict) -> str:
    parts = [variant, str(seed), ",".join(sorted(defects or ()))]
    parts += [f"{k}={v}" for k, v in sorted(extra.items())]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:10]


@pytest.fixture(scope="session")
def synthetic_export(tmp_path_factory: pytest.TempPathFactory) -> Callable[..., Path]:
    """Factory: ``synthetic_export(defects={...}, variant="base", seed=1, **generate_kw)``."""
    cache: dict[str, Path] = {}
    base = tmp_path_factory.mktemp("exports")

    def _make(
        defects: Iterable[str] | None = None,
        *,
        variant: str = "base",
        seed: int = 1,
        **kw: object,
    ) -> Path:
        key = _key(defects, variant, seed, kw)
        if key not in cache:
            out = base / f"export_{variant}_{key}"
            generate_run(out, seed=seed, variant=variant, defects=set(defects or ()), **kw)  # type: ignore[arg-type]
            cache[key] = out
        return cache[key]

    return _make


@pytest.fixture(scope="session")
def ingested_run(data_dir: Path, synthetic_export: Callable[..., Path]) -> Callable[..., RunStore]:
    """Factory: ``ingested_run(defects={...}, variant="base", base_run_id=None, **generate_kw)``."""
    cache: dict[str, RunStore] = {}

    def _make(
        defects: Iterable[str] | None = None,
        *,
        variant: str = "base",
        seed: int = 1,
        base_run_id: str | None = None,
        **kw: object,
    ) -> RunStore:
        key = _key(defects, variant, seed, {**kw, "base": base_run_id or ""})
        if key not in cache:
            export = synthetic_export(defects, variant=variant, seed=seed, **kw)
            run_id = f"SYN_{variant}_{key}"
            manifest = ingest_export_dir(export, run_id=run_id, base_run_id=base_run_id)
            cache[key] = RunStore(manifest.run_id)
        return cache[key]

    return _make
