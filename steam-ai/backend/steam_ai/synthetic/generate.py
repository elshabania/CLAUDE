"""Deterministic synthetic miniature STEAM-like run generator.

``generate_run`` writes an export directory exactly as the modeller-run Cube
export script would (data_contract.md Section 8): one CSV per internal table
named per ``schema.EXPORT_TABLE_FILES``, a ``README_SYNTHETIC.txt``, a
``synthetic_defects.json`` manifest of planted defects, and finally the
``schema.EXPORT_SENTINEL`` JSON. Everything is labelled synthetic; none of the
numbers are observed or STEAM outputs.

Variants
--------
``base``
    The 2025-style base run.
``scenario``
    Same seed network with 2030-style growth: land use +15% in sectors S1 and
    S2, one extra lane on the central E-W FWY corridor, and one new BUS line
    (``BUS_NEW``). Demand and flows are regenerated from those inputs.
``scenario_unexplained``
    Like ``scenario`` plus every trip with an origin or destination in sector
    S4 scaled by 1.3 with no land-use or network change there.

Defects
-------
Pass any subset of :data:`ALL_DEFECTS` as ``defects``. Each is deterministic;
:func:`defect_manifest` returns the ids it touches and
:data:`steam_ai.synthetic.defects.DEFECT_DOCS` describes each one. Summary
(table: rows touched):

* ``orphan_nodes``            nodes: ids 9001-9003 with no links
* ``zero_capacity_link``      links: first two ART/SUB links, capacity_vph = 0
* ``zero_speed_link``         links: first two COL links, ffs_kph = 0
* ``oneway_dead_end``         links/nodes: link 90001 into node 9100, no exit
* ``connector_on_fwy``        links: CONN 90002/90003 centroid <-> FWY node
* ``broken_line_sequence``    transit_segments: BUS_1 seq 3 removed, renumbered
* ``headway_out_of_range``    transit_lines: BUS_2 AM 0.5 min, NT 240 min
* ``line_node_not_in_network`` transit_segments: BUS_3 via node 99999
* ``land_use_total_mismatch`` control_totals: POP = 1.12 x zone sum
* ``overcapacity_corridor``   link_flows: 10 E-W FWY links, AM vc 1.40-1.58
* ``low_volume_outlier``      link_flows: first ART/URB link, AM = 1% of peers
* ``negative_matrix_cells``   od: DEMAND/HBW/CAR/AM zone 1 -> 2..6 negative
* ``row_col_imbalance``       od: zone n_zones//3 CAR rows x4, columns x0.2
* ``high_intrazonal``         od: zone n_zones//2 intrazonal share 40%
* ``poor_convergence``        convergence: HWY_ASSIGN AM REL_GAP ends 0.02
* ``speed_above_ffs``         link_flows: 3 COL/URB links PM speed 1.15 x ffs
* ``speed_below_floor``       link_flows: 3 LOC links AM speed 2 km/h
* ``parameter_drift``         parameters: VOT_CAR, PT_FARE_BASE != approved
* ``missing_node_ref``        links: link 90004 -> node 99998 (absent)
* ``null_values``             links: last 4 ART links capacity_vph null
* ``unused_transit_line``     line_loads: BUS_UNUSED load ~0 through the CBD
* ``trip_length_shift``       od: HBW/CAR mean trip length x1.4 (scenario)
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from .. import schema
from ..config import period_codes, period_hours
from . import defects as _defects
from .assign import BPR_ALPHA, BPR_BETA, USER_CLASSES, assign
from .defects import ALL_DEFECTS, DEFECT_DOCS
from .demand import CAR_OCCUPANCY, Demand, build_demand, od_long, scale_sector_demand, skims_long
from .network import LAND_USE_VARIABLES, Network, build_network, land_use_long, land_use_wide
from .transit import Line, default_lines, line_loads, lines_tables

__all__ = ["ALL_DEFECTS", "DEFECT_DOCS", "VARIANTS", "defect_manifest", "generate_run"]

VARIANTS = ("base", "scenario", "scenario_unexplained")
STEAM_VERSION = "synthetic-0.1"
GROWTH_SECTORS = ("S1", "S2")
GROWTH_FACTOR = 1.15
UNEXPLAINED_SECTOR = "S4"
UNEXPLAINED_FACTOR = 1.3
DEMAND_SCALE = 0.7
README_NAME = "README_SYNTHETIC.txt"
DEFECTS_FILE = "synthetic_defects.json"
FLOAT_FORMAT = "%.8g"

BASE_PARAMETERS: list[tuple[str, str]] = [
    ("VOT_CAR", "38.5"),
    ("VOT_LGV", "52.0"),
    ("VOT_HGV", "70.0"),
    ("FUEL_COST", "0.42"),
    ("CAR_OCCUPANCY", str(CAR_OCCUPANCY)),
    ("PT_FARE_BASE", "2.5"),
    ("PT_FARE_PER_KM", "0.15"),
    ("BPR_ALPHA", str(BPR_ALPHA)),
    ("BPR_BETA", str(BPR_BETA)),
    ("ASSIGN_MAX_ITER", "20"),
    ("ASSIGN_REL_GAP_TARGET", "0.001"),
    ("DEMAND_LOOP_MAX_ITER", "5"),
    ("PCU_LGV", "1.5"),
    ("PCU_HGV", "2.5"),
    ("TOLL_RATE_FWY", "4.0"),
    ("PEAK_HOUR_FACTOR_AM", "0.40"),
]


def _check_variant(variant: str) -> None:
    if variant not in VARIANTS:
        raise ValueError(f"variant must be one of {VARIANTS}, got {variant!r}")


def _build_inputs(
    seed: int, n_zones: int, grid: int, variant: str, defects: set[str]
) -> tuple[Network, list[Line]]:
    """Network, land use and lines for a variant (cheap; no assignment)."""
    growth = variant in ("scenario", "scenario_unexplained")
    net = build_network(grid, n_zones, seed, fwy_extra_lane=growth)
    if growth:
        wide = land_use_wide(net.land_use).reindex(net.zones.zone_id.to_numpy())
        sectors = net.zones.set_index("zone_id").sector_id
        grow = sectors.reindex(wide.index).isin(GROWTH_SECTORS).to_numpy()
        for var in LAND_USE_VARIABLES:
            wide.loc[grow, var] = np.round(wide.loc[grow, var] * GROWTH_FACTOR)
        net.land_use, net.control_totals = land_use_long(wide.index.to_numpy(), wide)
    lines = default_lines(
        net, extra_bus=growth, unused_bus="unused_transit_line" in defects
    )
    return net, lines


def defect_manifest(
    defects: set[str] | None,
    *,
    n_zones: int = 60,
    grid: int = 14,
    seed: int = 1,
    variant: str = "base",
) -> dict[str, dict[str, object]]:
    """Expected planted locations per defect, for the same generator parameters.

    Only the network skeleton is built, so this is fast and safe to call in tests.
    """
    _check_variant(variant)
    chosen = _defects.validate(defects)
    net, lines = _build_inputs(seed, n_zones, grid, variant, chosen)
    return _defects.manifest(chosen, net, lines)


def _parameters_table() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "key": [k for k, _ in BASE_PARAMETERS],
            "value": [v for _, v in BASE_PARAMETERS],
            "approved_value": [v for _, v in BASE_PARAMETERS],
        }
    )


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _write_csv(out_dir: Path, name: str, df: pd.DataFrame) -> int:
    """Write one table CSV with schema column order and source_file/source_row filled."""
    sch = schema.TABLES[name]
    file_name = schema.EXPORT_TABLE_FILES[name]
    df = df.copy()
    df["source_file"] = file_name
    if "source_row" in sch.names:
        df["source_row"] = np.arange(1, len(df) + 1, dtype=np.int64)
    missing = [f.name for f in sch if f.name not in df.columns]
    if missing:
        raise RuntimeError(f"synthetic table {name} lacks columns {missing}")
    df = df[sch.names]
    df.to_csv(out_dir / file_name, index=False, float_format=FLOAT_FORMAT, lineterminator="\n")
    return len(df)


def generate_run(
    out_dir: Path,
    *,
    scenario: str = "BASE_2025",
    horizon_year: int = 2025,
    seed: int = 1,
    n_zones: int = 60,
    grid: int = 14,
    defects: set[str] | None = None,
    variant: str = "base",
) -> Path:
    """Generate a synthetic export directory and return its path.

    The sentinel JSON is written last, as the real export script does, so a
    watcher can rely on it. Generation is deterministic for the same arguments
    except for the ``exported_at`` timestamp in the sentinel.
    """
    _check_variant(variant)
    chosen = _defects.validate(defects)
    t_start = time.perf_counter()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    periods = period_codes()
    hours = period_hours()

    net, lines = _build_inputs(seed, n_zones, grid, variant, chosen)
    demand: Demand = build_demand(net, periods, scale=DEMAND_SCALE)
    if variant == "scenario_unexplained":
        scale_sector_demand(demand, net.zone_sectors(), UNEXPLAINED_SECTOR, UNEXPLAINED_FACTOR)
    if "trip_length_shift" in chosen:
        _defects.apply_demand_defects({"trip_length_shift"}, demand, net)

    car_demand = {p: demand.total("CAR", p) for p in periods}
    result = assign(
        net,
        car_demand,
        hours,
        seed,
        poor_convergence_periods={"AM"} if "poor_convergence" in chosen else None,
    )
    loads = line_loads(lines, net, demand, periods, hours)
    transit_lines, transit_segments = lines_tables(lines, periods)

    # Demand defects other than trip_length_shift are planted after assignment so
    # the loaded network stays physically sensible.
    _defects.apply_demand_defects(chosen - {"trip_length_shift"}, demand, net)

    tables: dict[str, pd.DataFrame] = {
        "links": net.links.copy(),
        "nodes": net.nodes.copy(),
        "zones": net.zones.copy(),
        "land_use": net.land_use.copy(),
        "control_totals": net.control_totals.copy(),
        "transit_lines": transit_lines,
        "transit_segments": transit_segments,
        "link_flows": result.link_flows,
        "line_loads": loads,
        "od": od_long(demand, schema.EXPORT_TABLE_FILES["od"]),
        "skims": skims_long(demand, periods, schema.EXPORT_TABLE_FILES["skims"]),
        "convergence": result.convergence,
        "parameters": _parameters_table(),
        "iteration_flows": result.iteration_flows,
        "_period_hours": hours,  # type: ignore[dict-item]
    }
    _defects.apply_table_defects(chosen, tables, net, lines)
    tables.pop("_period_hours")

    row_counts: dict[str, int] = {}
    for name in schema.TABLES:
        row_counts[name] = _write_csv(out_dir, name, tables[name])

    manifest = _defects.manifest(chosen, net, lines)
    (out_dir / DEFECTS_FILE).write_text(
        json.dumps(
            {
                "is_synthetic": True,
                "generator": STEAM_VERSION,
                "parameters": {
                    "scenario": scenario,
                    "horizon_year": horizon_year,
                    "seed": seed,
                    "n_zones": n_zones,
                    "grid": grid,
                    "variant": variant,
                },
                "defects": manifest,
            },
            indent=2,
            sort_keys=True,
        ),
        "utf-8",
    )
    (out_dir / README_NAME).write_text(_readme(scenario, horizon_year, variant, chosen), "utf-8")

    files = []
    for p in sorted(out_dir.iterdir()):
        if p.name == schema.EXPORT_SENTINEL or not p.is_file():
            continue
        files.append({"path": p.name, "size": p.stat().st_size, "sha256": _sha256(p)})
    sentinel = {
        "scenario_name": scenario,
        "horizon_year": horizon_year,
        "policy_set": "REF",
        "steam_version": STEAM_VERSION,
        "is_synthetic": True,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "generator": {
            "seed": seed,
            "n_zones": n_zones,
            "grid": grid,
            "variant": variant,
            "defects": sorted(chosen),
            "user_classes": USER_CLASSES,
            "generation_s": round(time.perf_counter() - t_start, 3),
        },
        "tables": row_counts,
        "files": files,
    }
    (out_dir / schema.EXPORT_SENTINEL).write_text(json.dumps(sentinel, indent=2), "utf-8")
    return out_dir


def _readme(scenario: str, horizon_year: int, variant: str, defects: set[str]) -> str:
    lines = [
        "SYNTHETIC DATA - NOT A STEAM OUTPUT",
        "",
        f"Scenario {scenario}, horizon {horizon_year}, variant {variant}.",
        "This export was generated by steam_ai.synthetic.generate for testing STEAM-AI.",
        "Every number is invented by a small gravity model and a toy assignment on a",
        "grid network placed around Abu Dhabi island; it does not describe real",
        "travel, land use or infrastructure.",
        "",
        "Planted defects: " + (", ".join(sorted(defects)) if defects else "none"),
        f"Details of planted defects: {DEFECTS_FILE}",
        "",
        "Units follow docs/data_contract.md 8.3: metres, seconds, km/h, vehicles per",
        "hour (capacity_vph is per link); flow volumes are per period (see",
        "config/periods.yaml for period hours).",
    ]
    return "\n".join(lines) + "\n"
