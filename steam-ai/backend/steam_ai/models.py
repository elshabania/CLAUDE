"""Pydantic models shared by checks, solutions, reports, API and frontend."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Severity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    INFO = "Info"

    @property
    def rank(self) -> int:
        return {"Critical": 0, "High": 1, "Medium": 2, "Info": 3}[self.value]


class LocationType(str, Enum):
    LINK = "link"
    NODE = "node"
    ZONE = "zone"
    LINE = "line"
    SECTOR = "sector"
    SCREENLINE = "screenline"
    MATRIX = "matrix"
    RUN = "run"


class Location(BaseModel):
    type: LocationType
    id: str
    label: str | None = None
    lon: float | None = None
    lat: float | None = None


class SourceRef(BaseModel):
    """Where the evidence came from: file and row, so every number is traceable."""

    file: str
    row: int | None = None
    table: str | None = None
    column: str | None = None


class Evidence(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    sources: list[SourceRef] = Field(default_factory=list)
    period: str | None = None
    query: str | None = None  # the DuckDB SQL that produced the values, for the modeller view


class EffectMethod(str, Enum):
    SKETCH_ELASTICITY = "sketch_elasticity"
    SURROGATE = "surrogate"
    STEAM_RERUN = "steam_rerun"
    NOT_COMPUTABLE = "not_computable"


class Measure(BaseModel):
    """A proposed action for a Critical or High finding."""

    measure_id: str
    title: str
    description: str
    estimated_effect: str | None = None
    effect_values: dict[str, float] = Field(default_factory=dict)
    method: EffectMethod = EffectMethod.NOT_COMPUTABLE
    confidence: str = "low"  # low | medium | high


class Finding(BaseModel):
    finding_id: str
    run_id: str
    check_id: str
    check_name: str
    severity: Severity
    location: Location
    executive_line: str  # one sentence, no jargon
    modeller_view: str  # evidence, method, files
    evidence: Evidence
    likely_cause: str
    suggested_action: str
    measures: list[Measure] = Field(default_factory=list)
    is_significant: bool = True  # False when inside the noise band
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CheckStatus(str, Enum):
    OK = "ok"
    SKIPPED = "skipped"  # required table missing
    ERROR = "error"


class CheckResult(BaseModel):
    check_id: str
    check_name: str
    status: CheckStatus
    findings: list[Finding] = Field(default_factory=list)
    message: str | None = None
    duration_s: float = 0.0
    rows_examined: int = 0


class HealthComponent(BaseModel):
    name: str
    score: float  # 0..100
    weight: float
    detail: str


class HealthScore(BaseModel):
    run_id: str
    score: float  # 0..100
    grade: str  # A..E
    components: list[HealthComponent]
    counts: dict[str, int]  # severity -> count
    definition: str  # human-readable formula, published in the UI


class KPI(BaseModel):
    kpi_id: str
    name: str
    value: float
    unit: str
    period: str | None = None
    definition: str
    sources: list[SourceRef] = Field(default_factory=list)


class RunManifest(BaseModel):
    run_id: str
    scenario_name: str
    horizon_year: int
    policy_set: str = "REF"
    base_run_id: str | None = None
    ingested_at: datetime
    source_root: str
    steam_version: str = "unknown"
    is_synthetic: bool = False
    status: str = "ingested"
    files: list[dict[str, Any]] = Field(default_factory=list)  # path, size, sha256, table
    tables: dict[str, int] = Field(default_factory=dict)  # table -> row count
    periods: list[str] = Field(default_factory=list)
    # Where the data came from, in one line, and anything a reader must know
    # about it (for example "inputs only: no STEAM assignment outputs").
    provenance: str | None = None
    notes: list[str] = Field(default_factory=list)
