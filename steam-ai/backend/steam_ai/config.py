"""Load and validate YAML configuration against JSON schemas."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

import jsonschema
import yaml

from .paths import CONFIG_DIR


def _load(name: str, schema: str | None = None) -> dict[str, Any]:
    path = CONFIG_DIR / f"{name}.yaml"
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if schema:
        schema_path = CONFIG_DIR / "schemas" / f"{schema}.schema.json"
        with schema_path.open("r", encoding="utf-8") as fh:
            jsonschema.validate(data, json.load(fh))
    return data


@cache
def periods() -> list[dict[str, Any]]:
    return _load("periods")["periods"]


def period_codes() -> list[str]:
    return [p["code"] for p in periods()]


def period_hours() -> dict[str, float]:
    return {p["code"]: float(p["hours"]) for p in periods()}


@cache
def checks() -> dict[str, Any]:
    return _load("checks", schema="checks")


@cache
def health() -> dict[str, Any]:
    return _load("health", schema="health")


@cache
def kpis() -> list[dict[str, Any]]:
    return _load("kpis", schema="kpis")["kpis"]


@cache
def reporting() -> dict[str, Any]:
    return _load("reporting")


def reload() -> None:
    for fn in (periods, checks, health, kpis, reporting):
        fn.cache_clear()


def config_path(name: str) -> Path:
    return CONFIG_DIR / f"{name}.yaml"
