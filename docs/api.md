# STEAM-AI REST API (v1)

Base path: `/api/v1`. All responses JSON unless stated. Every number in a
response is derived from the internal tables in `data_contract.md` Section 8
and can be traced through `sources` or `query` fields.

Auth and roles arrive in Slice 5. Until then every endpoint is open on
localhost only.

| Method | Path | Returns |
|---|---|---|
| GET | `/runs` | `RunSummary[]`: run_id, scenario_name, horizon_year, base_run_id, ingested_at, status, is_synthetic, health (score, grade) or null |
| GET | `/runs/{run_id}` | `RunManifest` plus `health` |
| GET | `/runs/{run_id}/health` | `HealthScore` (score, grade, components, counts, definition) |
| GET | `/runs/{run_id}/findings?severity=&check_id=&location_type=&significant_only=&limit=&offset=` | `{ total, items: Finding[] }` ordered by severity then check |
| GET | `/runs/{run_id}/findings/{finding_id}` | `Finding` |
| GET | `/runs/{run_id}/checks` | `CheckResult[]` without findings (status, message, counts, duration) |
| GET | `/runs/{run_id}/changes` | What changed vs base run: `{ base_run_id, inputs: InputDiff[], findings: { new, resolved, unchanged }, kpis: KpiDelta[] }` or `{ base_run_id: null }` |
| GET | `/runs/{run_id}/kpis` | `KPI[]` |
| GET | `/runs/{run_id}/links?period=AM&metric=vc` | GeoJSON FeatureCollection; properties: link_id, a_node, b_node, link_class, area_type, lanes, capacity_vph, ffs_kph, volume, vc_ratio, cong_speed_kph, delay_s, n_findings, max_severity |
| GET | `/runs/{run_id}/links/{link_id}` | Link profile: attributes, flows by period and user class, findings on this link, sources |
| GET | `/runs/{run_id}/nodes/{node_id}` | Node profile |
| GET | `/runs/{run_id}/zones?` | GeoJSON polygons with land use totals |
| GET | `/runs/{run_id}/zones/{zone_id}` | Zone profile: land use, productions, attractions, findings |
| GET | `/runs/{run_id}/lines/{line_id}` | Line profile: headways, segments, loads, findings |
| GET | `/runs/{run_id}/report.docx` | Diagnostic report (DOCX) |
| GET | `/runs/{run_id}/report.pdf` | Diagnostic report (PDF) |
| GET | `/checks` | Check catalogue from `config/checks.yaml` |
| GET | `/config/health` | Health definition text |
| POST | `/runs/ingest` `{ "path": "...", "base_run_id": null }` | Starts ingest + checks + report; returns `{ job_id, run_id }` |
| GET | `/jobs/{job_id}` | Job status |
| GET | `/audit?limit=` | Recent audit entries |
| GET | `/health` | Liveness |

The frontend is served from `/` (static build). OpenAPI docs at `/api/docs`.
