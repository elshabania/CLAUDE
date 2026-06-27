"""Editable model defaults for STEAM 2040 Studio.

Every value here is overridable at runtime via the ``set_params`` command
(see :mod:`steam.commands`). The defaults reproduce section 2/3 of the build
spec exactly.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Dict

# --- LTYPE_2040 -> facility class -------------------------------------------
# 1-9 fwy | 10-15 ramp | 20-21 art | 22-27 coll | 28-29 local | 30-39 rural |
# 40-44 junc.  Codes in EXCLUDED_LTYPES are protected / non-road and dropped.
FACILITY_CLASSES = ("fwy", "ramp", "art", "coll", "rural", "local", "junc")

EXCLUDED_LTYPES = frozenset({60, 61, 62, 63, 65, 70, 71, 72, 73, 99, 100})


def ltype_to_class(ltype: int) -> str | None:
    """Map an LTYPE_2040 code to a facility class, or None if excluded."""
    if ltype in EXCLUDED_LTYPES:
        return None
    if 1 <= ltype <= 9:
        return "fwy"
    if 10 <= ltype <= 15:
        return "ramp"
    if 20 <= ltype <= 21:
        return "art"
    if 22 <= ltype <= 27:
        return "coll"
    if 28 <= ltype <= 29:
        return "local"
    if 30 <= ltype <= 39:
        return "rural"
    if 40 <= ltype <= 44:
        return "junc"
    return None  # unknown / out of range -> treat as non-road


# Barrier severity ordering used by aggregation: a "coll" barrier set also
# includes everything more major than it.
BARRIER_RANK = {"fwy": 3, "art": 2, "coll": 1}


@dataclass
class Params:
    """All tunable model parameters. Serialisable to/from JSON for persistence."""

    # capacity per lane (veh/h) and free-flow speed (km/h) per facility class
    cap_per_lane: Dict[str, float] = field(default_factory=lambda: {
        "fwy": 2000, "ramp": 1500, "art": 900, "coll": 700,
        "rural": 600, "local": 500, "junc": 600,
    })
    speed_kmh: Dict[str, float] = field(default_factory=lambda: {
        "fwy": 100, "ramp": 60, "art": 60, "coll": 50,
        "rural": 80, "local": 30, "junc": 30,
    })

    # BPR volume-delay function: t = ff * (1 + alpha * (v/cap)^beta)
    alpha: float = 0.15
    beta: float = 4.0

    # demand / scenario economics
    vot: float = 30.0           # value of time, currency per hour
    working_days: int = 250
    growth: float = 1.0
    pce_hgv: float = 2.5        # passenger-car-equivalent for heavy goods

    # period factors: 24h matrix -> hourly demand
    period_factors: Dict[str, float] = field(default_factory=lambda: {
        "am_peak": 0.10, "off_peak": 0.083, "daily": 1.0,
    })
    period: str = "am_peak"

    # gravity model
    beta_grav: float = 0.08     # deterrence on minutes
    r_pop: float = 0.5
    r_wkr: float = 0.4
    r_stu: float = 0.3
    a_ret: float = 1.0
    a_off: float = 1.0
    a_ind: float = 0.5
    a_sch: float = 0.8

    # solver / sampling
    fw_max_iter: int = 20
    fw_gap_tol: float = 1e-4
    origin_sample: int = 0      # 0 = all origins; >0 = sample that many

    def period_factor(self) -> float:
        return self.period_factors.get(self.period, 1.0)

    def to_dict(self) -> dict:
        return asdict(self)

    def update(self, **kw) -> "Params":
        """Shallow-merge incoming overrides (dict fields merge key-wise)."""
        for k, v in kw.items():
            if not hasattr(self, k):
                continue
            cur = getattr(self, k)
            if isinstance(cur, dict) and isinstance(v, dict):
                cur.update(v)
            else:
                setattr(self, k, v)
        return self
