"""Editable, persisted settings shared by both applications.

Defaults match the tables in Part 1 of the build spec.  Settings serialise to a
JSON file in the user config directory so they survive between sessions.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path

from .classify import FACILITY_CLASSES


@dataclass
class ClassDefaults:
    """Per-class capacity (veh/h/lane) and free-flow speed (km/h)."""

    cap_per_lane: float
    speed_kmh: float


# Defaults straight from the spec table.
DEFAULT_CLASS_DEFAULTS: dict[str, ClassDefaults] = {
    "fwy": ClassDefaults(2000, 100),
    "ramp": ClassDefaults(1500, 60),
    "art": ClassDefaults(900, 60),
    "coll": ClassDefaults(700, 50),
    "rural": ClassDefaults(600, 80),
    "local": ClassDefaults(500, 30),
    "junc": ClassDefaults(600, 30),
}


def _default_classes() -> dict[str, ClassDefaults]:
    return {k: ClassDefaults(v.cap_per_lane, v.speed_kmh)
            for k, v in DEFAULT_CLASS_DEFAULTS.items()}


@dataclass
class Settings:
    """All editable parameters for both apps."""

    # Speed-flow / BPR.
    classes: dict[str, ClassDefaults] = field(default_factory=_default_classes)
    bpr_alpha: float = 0.15
    bpr_beta: float = 4.0

    # Demand.
    period_factor: float = 0.10          # AM peak-hour share of the 24h matrix.
    demand_scale: float = 1.0            # the "x scale" growth factor.
    deterrence_beta: float = 0.10        # minutes^-1 in f(c)=exp(-beta*c).
    # Gravity production rates (per person / worker / student).
    rate_pop: float = 1.2
    rate_wkr: float = 0.9
    rate_stu: float = 0.7
    # Gravity attraction rates (per 100 m^2 of GFA, by use).
    attr_retail: float = 3.0
    attr_office: float = 1.5
    attr_industrial: float = 0.6
    attr_school: float = 2.0
    hgv_pce: float = 2.5

    # Economics for cost-benefit.
    value_of_time: float = 35.0          # currency per vehicle-hour.
    working_days: float = 250.0
    unit_cost_lane_m: float = 1500.0     # capital cost per lane-metre built.

    # Engine controls.
    origin_sample: int = 0               # 0 => all origins; else sample size.
    fw_max_iter: int = 20
    fw_gap_target: float = 1e-4
    msa_iter: int = 10
    random_seed: int = 12345

    # Aggregation (Prompt B).
    barrier_threshold: str = "coll"      # fwy | art | coll
    max_span_m: float = 6000.0
    target_zone_count: int = 1800
    max_cluster_size: int = 0            # 0 => no cap.

    def cap_per_lane(self, klass: str) -> float:
        return self.classes[klass].cap_per_lane

    def speed_kmh(self, klass: str) -> float:
        return self.classes[klass].speed_kmh

    # ---- persistence -----------------------------------------------------
    def to_dict(self) -> dict:
        d = asdict(self)
        d["classes"] = {k: asdict(v) for k, v in self.classes.items()}
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Settings":
        d = dict(d)
        classes = d.pop("classes", None)
        obj = cls()
        for k, v in d.items():
            if hasattr(obj, k):
                setattr(obj, k, v)
        if classes:
            obj.classes = {
                k: ClassDefaults(**v) if isinstance(v, dict) else v
                for k, v in classes.items()
                if k in FACILITY_CLASSES
            }
            # Backfill any class missing from the file.
            for k, v in _default_classes().items():
                obj.classes.setdefault(k, v)
        return obj

    @staticmethod
    def config_path(app: str = "steam2040") -> Path:
        base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
        return Path(base) / app / "settings.json"

    def save(self, path: Path | None = None) -> Path:
        path = Path(path) if path else self.config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2))
        return path

    @classmethod
    def load(cls, path: Path | None = None) -> "Settings":
        path = Path(path) if path else cls.config_path()
        if not path.exists():
            return cls()
        try:
            return cls.from_dict(json.loads(path.read_text()))
        except (json.JSONDecodeError, OSError, TypeError):
            return cls()
