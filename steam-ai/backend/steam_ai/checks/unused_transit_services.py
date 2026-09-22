"""Transit lines carrying almost nobody despite demand near their stops."""

from __future__ import annotations

from typing import Any

from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    make_finding,
    pct,
    period_label,
    refs_from_rows,
    sql_str_list,
    table_ref,
)


class UnusedTransitServices(Check):
    check_id = "unused_transit_services"
    name = "Unused transit services"
    description = (
        "Lines whose mean load factor (mean segment load / vehicle capacity) is very low "
        "while PT demand originating within the catchment of their stops is substantial: "
        "the service exists but the model does not use it."
    )
    required_tables = {"line_loads", "transit_lines", "transit_segments", "nodes", "zones", "od"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        min_lf = float(params.get("min_load_factor", 0.05))
        min_demand = float(params.get("min_catchment_demand", 500))
        km = float(params.get("catchment_km", 1.0))
        pt_modes = [str(m) for m in params.get("pt_modes", ["PT"])]
        sql = f"""
            WITH k AS (SELECT COS(RADIANS(AVG(y))) AS coslat FROM nodes WHERE y IS NOT NULL),
            cap AS (
                SELECT line_id, MAX(vehicle_capacity) AS capacity, ANY_VALUE(mode) AS mode
                FROM transit_lines GROUP BY 1
            ),
            hw AS (SELECT line_id, period, MAX(headway_min) AS headway_min
                   FROM transit_lines GROUP BY 1, 2),
            lf AS (
                SELECT line_id, period, AVG(load) AS mean_load, MAX(load) AS max_load,
                       COUNT(*) AS n_segments, ANY_VALUE(source_file) AS source_file,
                       MIN(source_row) AS source_row
                FROM line_loads GROUP BY 1, 2
            ),
            stop_nodes AS (
                SELECT line_id, from_node AS node_id FROM transit_segments
                WHERE COALESCE(is_stop, TRUE)
                UNION SELECT line_id, to_node FROM transit_segments WHERE COALESCE(is_stop, TRUE)
            ),
            stops AS (
                SELECT DISTINCT s.line_id, n.x, n.y
                FROM stop_nodes s JOIN nodes n USING (node_id)
                WHERE n.x IS NOT NULL AND n.y IS NOT NULL
            ),
            near AS (
                SELECT DISTINCT st.line_id, z.zone_id
                FROM stops st CROSS JOIN k JOIN zones z
                  ON ABS(z.centroid_y - st.y) * 110.57 <= {km}
                 AND ABS(z.centroid_x - st.x) * 111.32 * k.coslat <= {km}
                 AND POWER((z.centroid_x - st.x) * 111.32 * k.coslat, 2)
                     + POWER((z.centroid_y - st.y) * 110.57, 2) <= {km * km}
            ),
            prod AS (
                SELECT origin AS zone_id, period, SUM(trips) AS trips
                FROM od WHERE matrix_kind = 'DEMAND' AND mode IN ({sql_str_list(pt_modes)})
                GROUP BY 1, 2
            ),
            catch AS (
                SELECT nz.line_id, p.period, SUM(p.trips) AS catchment_demand,
                       COUNT(DISTINCT nz.zone_id) AS n_zones
                FROM near nz JOIN prod p USING (zone_id) GROUP BY 1, 2
            )
            SELECT lf.line_id, lf.period, cap.mode, cap.capacity, hw.headway_min,
                   lf.mean_load, lf.max_load, lf.n_segments,
                   lf.mean_load / NULLIF(cap.capacity, 0) AS load_factor,
                   COALESCE(c.catchment_demand, 0) AS catchment_demand,
                   COALESCE(c.n_zones, 0) AS n_catchment_zones,
                   lf.source_file, lf.source_row
            FROM lf JOIN cap USING (line_id)
            LEFT JOIN hw USING (line_id, period)
            LEFT JOIN catch c USING (line_id, period)
            WHERE lf.mean_load / NULLIF(cap.capacity, 0) < {min_lf}
              AND COALESCE(c.catchment_demand, 0) > {min_demand}
            ORDER BY load_factor, lf.line_id, lf.period
        """
        df = store.query(sql)
        self.rows_examined = store.row_count("line_loads")
        if df.empty:
            return []
        locs = _line_locations(store, df["line_id"].unique())
        out: list[Finding] = []
        for r in df.itertuples():
            lf = float(r.load_factor)
            sev = evaluate_severity(severity_rules, load_factor=lf,
                                    catchment_demand=float(r.catchment_demand))
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=locs.get(str(r.line_id), Location(type=LocationType.LINE,
                                                               id=str(r.line_id))),
                    executive_line=(
                        f"Line {r.line_id} ({r.mode}) runs {pct(lf, 1)} full on average in "
                        f"{period_label(str(r.period))}, although {fmt(r.catchment_demand)} "
                        f"public transport trips start within {km:g} km of its stops."
                    ),
                    likely_cause="The line is not reachable in the transit network (missing "
                    "walk access, wrong stop flags, or a broken itinerary), or a parallel "
                    "service takes all the demand.",
                    suggested_action="Check stop access links and the line's itinerary; if "
                    "the service is genuinely unused, reduce its frequency.",
                    values={"load_factor": lf, "mean_load": float(r.mean_load),
                            "max_load": float(r.max_load), "vehicle_capacity": r.capacity,
                            "headway_min": r.headway_min, "n_segments": int(r.n_segments),
                            "catchment_demand": float(r.catchment_demand),
                            "n_catchment_zones": int(r.n_catchment_zones), "mode": r.mode},
                    thresholds={"min_load_factor": min_lf, "min_catchment_demand": min_demand,
                                "catchment_km": km},
                    sources=refs_from_rows(df[(df["line_id"] == r.line_id)
                                              & (df["period"] == r.period)],
                                           "line_loads", "load")
                    + [table_ref(store, "od", "trips")],
                    query=sql, period=str(r.period),
                    method="mean(load)/vehicle_capacity per line x period; PT productions "
                    "of zones with centroid within catchment_km of any stop",
                )
            )
        return out


def _line_locations(store: RunStore, line_ids: Any) -> dict[str, Location]:
    ids = [str(x) for x in line_ids]
    if not ids:
        return {}
    df = store.query(f"""
        SELECT s.line_id, n.x, n.y
        FROM transit_segments s JOIN nodes n ON n.node_id = s.from_node
        WHERE s.line_id IN ({sql_str_list(ids)})
        QUALIFY ROW_NUMBER() OVER (PARTITION BY s.line_id ORDER BY s.seq) = 1
    """)
    out = {}
    for r in df.itertuples():
        out[str(r.line_id)] = Location(type=LocationType.LINE, id=str(r.line_id),
                                       label=f"Line {r.line_id}",
                                       lon=None if r.x != r.x else float(r.x),
                                       lat=None if r.y != r.y else float(r.y))
    return out
