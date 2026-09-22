"""Noise band: is a run-to-run difference bigger than the assignment's own wobble?

The band for a link (or sector) and period is written by the
``convergence_and_noise`` check as the range of volumes over the last N
assignment iterations (``derived/noise_band.parquet`` with columns level,
location_id, period, metric, band_low, band_high, method). A delta inside
``[band_low, band_high]`` is *not significant*: it could have come from
stopping the assignment one iteration earlier.

Two entry points:

* :func:`apply_noise_band` post-processes findings: any link- or sector-level
  finding that carries a ``delta_volume`` (a comparison against the base) and
  whose delta lies inside the band gets ``is_significant = False``.
* :func:`significant_delta` answers the same question for comparison views.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .models import Finding, LocationType
from .store import RunStore

_LEVELS = {LocationType.LINK: "link", LocationType.SECTOR: "sector", LocationType.LINE: "line"}


def _band_index(df: pd.DataFrame | None) -> dict[tuple[str, str, str, str], tuple[float, float]]:
    """(level, location_id, period, metric) -> (band_low, band_high)."""
    idx: dict[tuple[str, str, str, str], tuple[float, float]] = {}
    if df is None or df.empty:
        return idx
    for r in df.itertuples():
        period = "" if r.period is None or (isinstance(r.period, float) and math.isnan(r.period)) \
            else str(r.period)
        key = (str(r.level), str(r.location_id), period, str(r.metric))
        low, high = float(r.band_low), float(r.band_high)
        # A location may appear once per period; the "" key keeps the widest band.
        idx[key] = (low, high)
        any_key = (str(r.level), str(r.location_id), "", str(r.metric))
        if period and any_key not in df_keys(idx, any_key):
            prev = idx.get(any_key)
            idx[any_key] = (min(low, prev[0]) if prev else low,
                            max(high, prev[1]) if prev else high)
    return idx


def df_keys(idx: dict[Any, Any], key: Any) -> set[Any]:
    """Helper kept trivial for readability: membership test on the index."""
    return set() if key not in idx else {key}


def _lookup(
    idx: dict[tuple[str, str, str, str], tuple[float, float]],
    level: str, location_id: str, period: str | None, metric: str,
) -> tuple[float, float] | None:
    if period:
        band = idx.get((level, str(location_id), str(period), metric))
        if band is not None:
            return band
    return idx.get((level, str(location_id), "", metric))


def _delta_of(finding: Finding) -> tuple[float, str] | None:
    """Delta and metric carried by a comparison finding, if any."""
    values = finding.evidence.values or {}
    if "delta_volume" in values and values["delta_volume"] is not None:
        return float(values["delta_volume"]), "volume"
    if "delta" in values and values["delta"] is not None and values.get("metric") == "volume":
        return float(values["delta"]), "volume"
    return None


def apply_noise_band(findings: list[Finding], store: RunStore) -> list[Finding]:
    """Mark link/sector comparison findings inside the noise band as not significant.

    Findings without a delta (absolute checks such as V/C) are left untouched.
    When the run has no noise band, everything stays significant.
    """
    idx = _band_index(store.noise_band())
    if not idx:
        return findings
    for f in findings:
        level = _LEVELS.get(f.location.type)
        if level is None:
            continue
        delta = _delta_of(f)
        if delta is None:
            continue
        value, metric = delta
        band = _lookup(idx, level, f.location.id, f.evidence.period, metric)
        if band is None:
            continue
        low, high = band
        f.is_significant = not (low <= value <= high)
        f.evidence.thresholds.setdefault("noise_band", {"low": low, "high": high})
    return findings


def significant_delta(
    store: RunStore,
    base: RunStore | None,
    level: str,
    location_id: str,
    period: str | None,
    delta: float,
    metric: str = "volume",
) -> bool:
    """True when ``delta`` (run minus base) lies outside the noise band.

    The band is taken from ``store`` (the scenario run) and, if it has none for
    that location, from ``base``. With no band available at all the delta is
    treated as significant, so the absence of a band never hides a change.
    """
    for s in (store, base):
        if s is None:
            continue
        band = _lookup(_band_index(s.noise_band()), level, location_id, period, metric)
        if band is not None:
            low, high = band
            return not (low <= float(delta) <= high)
    return True
