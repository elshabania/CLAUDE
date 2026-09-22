"""Internal table schemas (data_contract.md Section 8).

Every reader produces these tables; every check, view and report reads only
these. Column order and dtypes are authoritative here. Source-column mapping
from STEAM files lives in the reader, never in consumers.

Period codes are placeholders until confirmed from real STEAM output
(data_contract.md Section 8.3). They are loaded from config/periods.yaml.
"""

from __future__ import annotations

import pyarrow as pa

# --- Tables -----------------------------------------------------------------

RUNS = pa.schema(
    [
        ("run_id", pa.string()),
        ("scenario_name", pa.string()),
        ("horizon_year", pa.int32()),
        ("policy_set", pa.string()),
        ("base_run_id", pa.string()),  # nullable
        ("ingested_at", pa.string()),  # ISO 8601
        ("source_root", pa.string()),
        ("steam_version", pa.string()),
        ("is_synthetic", pa.bool_()),
        ("status", pa.string()),  # ingested | checked | reported | failed
    ]
)

LINKS = pa.schema(
    [
        ("link_id", pa.int64()),
        ("a_node", pa.int64()),
        ("b_node", pa.int64()),
        ("length_m", pa.float64()),
        ("link_class", pa.string()),  # e.g. FWY, ART, COL, LOC, CONN
        ("area_type", pa.string()),  # e.g. CBD, URB, SUB, RUR
        ("lanes", pa.int32()),
        ("capacity_vph", pa.float64()),
        ("ffs_kph", pa.float64()),
        ("oneway", pa.bool_()),
        ("toll_point", pa.bool_()),
        ("junction_type", pa.string()),  # NONE | SIGNAL | ROUNDABOUT | PRIORITY
        ("sector_id", pa.string()),
        ("geometry_wkt", pa.string()),  # LINESTRING in WGS84
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

NODES = pa.schema(
    [
        ("node_id", pa.int64()),
        ("x", pa.float64()),  # lon
        ("y", pa.float64()),  # lat
        ("is_centroid", pa.bool_()),
        ("junction_control", pa.string()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

ZONES = pa.schema(
    [
        ("zone_id", pa.int64()),
        ("sector_id", pa.string()),
        ("district", pa.string()),
        ("region", pa.string()),
        ("geometry_wkt", pa.string()),  # POLYGON in WGS84
        ("centroid_x", pa.float64()),
        ("centroid_y", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

LAND_USE = pa.schema(
    [
        ("zone_id", pa.int64()),
        ("variable", pa.string()),  # POP, EMP_TOTAL, EMP_RETAIL, STUDENTS, HOTEL_ROOMS ...
        ("value", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

CONTROL_TOTALS = pa.schema(
    [
        ("variable", pa.string()),
        ("region", pa.string()),  # ALL or a region code
        ("value", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

TRANSIT_LINES = pa.schema(
    [
        ("line_id", pa.string()),
        ("mode", pa.string()),  # BUS, BRT, LRT, METRO, RAIL, TRAM, FERRY
        ("operator", pa.string()),
        ("period", pa.string()),
        ("headway_min", pa.float64()),
        ("fare_ref", pa.string()),
        ("vehicle_capacity", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

TRANSIT_SEGMENTS = pa.schema(
    [
        ("line_id", pa.string()),
        ("seq", pa.int32()),
        ("from_node", pa.int64()),
        ("to_node", pa.int64()),
        ("is_stop", pa.bool_()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

LINK_FLOWS = pa.schema(
    [
        ("link_id", pa.int64()),
        ("period", pa.string()),
        ("user_class", pa.string()),  # CAR, LGV, HGV, TAXI, CBUS, SBUS, MC, ALL
        ("volume", pa.float64()),
        ("vc_ratio", pa.float64()),
        ("cong_time_s", pa.float64()),
        ("cong_speed_kph", pa.float64()),
        ("delay_s", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

LINE_LOADS = pa.schema(
    [
        ("line_id", pa.string()),
        ("seq", pa.int32()),
        ("period", pa.string()),
        ("load", pa.float64()),
        ("boardings", pa.float64()),
        ("alightings", pa.float64()),
        ("crowding_factor", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

OD = pa.schema(
    [
        ("matrix_kind", pa.string()),  # DEMAND | OBSERVED
        ("purpose", pa.string()),  # HBW, HBE, HBO, NHB, FREIGHT, EXT
        ("mode", pa.string()),  # CAR, PT, TAXI, ...
        ("period", pa.string()),
        ("origin", pa.int64()),
        ("destination", pa.int64()),
        ("trips", pa.float64()),
        ("source_file", pa.string()),
    ]
)

SKIMS = pa.schema(
    [
        ("skim_kind", pa.string()),  # TIME | DIST | COST
        ("mode", pa.string()),
        ("period", pa.string()),
        ("origin", pa.int64()),
        ("destination", pa.int64()),
        ("value", pa.float64()),
        ("source_file", pa.string()),
    ]
)

CONVERGENCE = pa.schema(
    [
        ("stage", pa.string()),  # HWY_ASSIGN | PT_ASSIGN | DEMAND_LOOP
        ("period", pa.string()),
        ("iteration", pa.int32()),
        ("metric", pa.string()),  # REL_GAP | GEH_PREV_ITER | MAX_FLOW_CHANGE
        ("value", pa.float64()),
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

PARAMETERS = pa.schema(
    [
        ("key", pa.string()),
        ("value", pa.string()),
        ("approved_value", pa.string()),  # nullable
        ("source_file", pa.string()),
        ("source_row", pa.int64()),
    ]
)

# Iteration-level flows used for the noise band (last N iterations).
ITERATION_FLOWS = pa.schema(
    [
        ("link_id", pa.int64()),
        ("period", pa.string()),
        ("iteration", pa.int32()),
        ("volume", pa.float64()),
        ("source_file", pa.string()),
    ]
)

TABLES: dict[str, pa.Schema] = {
    "links": LINKS,
    "nodes": NODES,
    "zones": ZONES,
    "land_use": LAND_USE,
    "control_totals": CONTROL_TOTALS,
    "transit_lines": TRANSIT_LINES,
    "transit_segments": TRANSIT_SEGMENTS,
    "link_flows": LINK_FLOWS,
    "line_loads": LINE_LOADS,
    "od": OD,
    "skims": SKIMS,
    "convergence": CONVERGENCE,
    "parameters": PARAMETERS,
    "iteration_flows": ITERATION_FLOWS,
}

# Tables that a run may legitimately lack (checks needing them are skipped and
# say so in their result).
OPTIONAL_TABLES = {"control_totals", "line_loads", "skims", "iteration_flows", "parameters"}

# --- Export contract ----------------------------------------------------------
# The modeller-run export script writes one CSV per table, named <table>.csv,
# plus this sentinel as its last action. The ingester fires on the sentinel.
EXPORT_SENTINEL = "steam_ai_export_complete.json"
EXPORT_TABLE_FILES = {name: f"{name}.csv" for name in TABLES}
