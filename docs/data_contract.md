# STEAM-AI Data Contract

Status: **DRAFT, no sample data inspected yet.**

This document is the single source of truth for what STEAM-AI reads and what it
produces. Nothing that reads a STEAM file may be written until the matching
section below is marked **Confirmed** with a real file path, row count and
column list from inspection.

The build prompt (Section 2) requires five inputs before code is written. As of
this draft none has been supplied, and the repository holds no STEAM run
directories, observed data or Word templates. Section 1 lists what is missing.
Section 2 records what the tender establishes as fact. Section 3 sets out the
inspection procedure that will fill Sections 4 to 7. Section 8 defines the
app's own internal tables, which are ours to design and do not depend on the
STEAM file layout.

Legend for every field table: **Confirmed** = seen in sample data.
**Expected** = standard Cube Voyager or STEAM convention, not yet seen.
**TBC** = unknown until inspection.

---

## 1. Inputs still required

| # | Item (build prompt Section 2) | Status | Needed for |
|---|---|---|---|
| 1 | DEPLOYMENT (target VM, OS, outbound internet) | Missing | Install package, LLM adapter, map tiles |
| 2 | LLM ACCESS (Ollama local / Anthropic API / both) | Missing | Chat, commentary, what-if |
| 3 | SAMPLE DATA PATH (two complete STEAM runs, one base, one scenario) | Missing | Every reader, every check, noise band |
| 4 | OBSERVED DATA (warehouse extracts and date range) | Missing | Forecasting, validation, conflation |
| 5 | REPORT TEMPLATES (MMR and MFR Word files) | Missing | Report generator, golden-file tests |

Until item 3 arrives, no STEAM reader is written. Until item 5 arrives, no
template mapping is written.

---

## 2. Facts established by the tender (ITC/T/PSA/1170/25, Scope of Services)

Page references are to the Scope of Services PDF.

### 2.1 Model platform and scale

| Fact | Source |
|---|---|
| STEAM is scripted in Cube (Bentley); uses Cube Base, Voyager, Analyst, Cluster and OpenPaths | p.14, p.17 |
| STEAM v3.2.2 is compatible with both CUBE and OpenPaths; migration to OpenPaths is done | p.11 |
| Highway network was converted to SQLite compatible with OpenPaths CUBE | p.31-32 |
| CubePy (Python interface in OpenPaths) is the sanctioned scripting route for Task 10 | p.40 |
| A full forecast-mode run takes 30 to 45 hours and produces about 250 GB per scenario | p.14 |
| Target runtime after Task 10 is 24 to 30 hours | p.40 |
| Each STEAM VM: 32 CPUs, 60 GB RAM, 3 TB storage; 80 VMs, remote access via ITC portal | p.14 |
| Model runs happen only on ITC workstations; development tasks only on ITC workstations | p.53 (3.1.7) |
| Over 3,400 transport analysis zones | p.10 |
| Five time periods across the day, plus 3 peak hours within AM and PM peaks | p.10 |
| Base year 2025; forecast years 2030, 2035, 2040, 2045, 2050 | p.31 (Task 8.2) |
| Multi-class highway assignment (car, LGV, HGV, taxi, company bus, school bus; motorcycles to be added in v4) | p.9, p.37-39 |
| PT modes: regional rail, metro, LRT, tram, BRT, ferry, local bus; park and ride; PT crowding module | p.9 |
| Explicit junction modelling of signals and roundabouts | p.9 |
| Land use datasets handed over as STEAM-format .dbf files | p.31 |
| Zone dataset delivered as GIS shapefile | p.32 (8.1) |
| Network held as Cube GIS geodatabase, with NRN linkage to be automated | p.31-32 |
| Reporting module runs automatically after each run: summary spreadsheets, Cube reports, runtime logs, geo-reporting | p.39 |
| Utilities exist for TOD, select link, highway-only and PT-only assignment, desire lines, PT line volumes | p.39 |
| Model policy and cost settings are locked outside developer mode | p.35 |

The build prompt states 150K links, 100K nodes, 3.7K zones and 2.2M non-zero
OD pairs for the 2040 network. The tender confirms the zone order of magnitude
only. Link, node and OD counts are **TBC** from sample data.

### 2.2 Observed data in the ITC data warehouse

SQL Server, continuously updated by an ETL server (p.13):

| Dataset | Content stated in tender | Date range |
|---|---|---|
| Cell (mobile) data | Population distribution, trips and highway speeds by time of day | TBC |
| Water and electricity | Consumption per residential plot | TBC |
| Population information | Not detailed | TBC |
| Bus AFC and AVM | Ridership, bus speeds, boardings, alightings, others | TBC |
| Taxi | Taxi movements within the Emirate | TBC |
| Traffic counts | Signal counters, mid-block counters, manual counts | TBC |
| Other | Accidents, population density (p.8) | TBC |

Signal timings and incident feeds named in the build prompt are **not**
listed in the tender's warehouse inventory. Their availability is an open
question (see `assumptions.md`, Q4).

### 2.3 Reports

The tender names MMR and MFR as "standard STEAM modelling report formats"
(p.46) and does not expand the acronyms or describe their structure. Task 9.1
lists calibration indicators that a diagnostic report will almost certainly
need to mirror: screenline flows including bridge crossings, freight and
external volumes, journey times on primary routes, PT ridership, mode share,
trip length distributions (p.33).

### 2.4 Existing validation tooling

A "high-level validation application" already links model inputs to the data
warehouse and "will be provided as a starting point" (p.11-12, Figure 1.4).
STEAM-AI must not duplicate it blindly; its outputs are a candidate input.

---

## 3. Inspection procedure

Run once per sample run directory as soon as item 3 above is provided. The
first code written in this project is this inventory tool, and its output is
pasted into Sections 4 to 7.

For every file under the run directory, record:

1. Relative path, extension, size in bytes, SHA-256.
2. Format family: Cube script (.s), catalog (.cat), application (.app),
   network (.net), matrix (.mat), OMX (.omx), transit lines (.lin), DBF, CSV,
   print file (.prn), SQLite (.sqlite / .db), geodatabase, shapefile, XLSX,
   other.
3. For tabular files: row count, column names, inferred dtypes, null rate per
   column, min and max of every numeric column, distinct count of every
   candidate ID column.
4. For networks: link count, node count, A/B node ID ranges, centroid ID range,
   link attribute list, direction convention, capacity and speed fields,
   link class and area type fields, any period-specific columns.
5. For matrices: zone count, table names, sum, share of zero cells, share of
   intrazonal, negatives, non-integers.
6. For transit lines: line count, mode codes, headway fields per period, fare
   fields, node sequence validity against the network.
7. For print and log files: convergence statistics (relative gap, iteration
   count, GEH between iterations if printed), run start and end timestamps,
   error and warning lines.
8. Scenario folder layout: which files differ between base and scenario, which
   are byte-identical, which are absent in one.

Binary Cube formats (.net, .mat) are not read natively in Slice 1. The
inventory will note them and the modeller-run export script (Section 8.1)
will produce CSV, DBF or OMX equivalents.

---

## 4. STEAM run directory layout

**Status: TBC.** To be filled from inspection.

Expected top-level structure (Cube convention, not yet seen):

```
<RunRoot>/
  <Catalog>.cat              Expected: catalog with scenario keys
  Applications/*.app          Expected
  Scripts/*.s                 Expected
  Input/                      Expected: land use .dbf, networks, lines, parameters
  Scenarios/<ScenarioName>/   Expected: per-scenario inputs and outputs
  Output/ or Base/            TBC
  *.prn                       Expected: per-step print files
```

Fields to confirm: scenario naming pattern, how horizon year and policy set are
encoded, where the "run complete" marker is (needed by the watch folder).

---

## 5. STEAM input files

Each subsection stays TBC until inspected.

### 5.1 Highway network

| Field | Status | Notes |
|---|---|---|
| Link ID or (A, B) | Expected | Cube uses A/B node pairs |
| Distance | Expected | Units TBC (km or m) |
| Link class / functional class | Expected | Needed for outlier grouping |
| Area type | Expected | Needed for outlier grouping |
| Lanes, capacity per lane or per link | Expected | Units TBC (veh/h or pcu/h) |
| Free-flow speed | Expected | Units TBC |
| One-way flag or direction | Expected | |
| Toll / RUC point | Expected | p.38 |
| Junction type at B node | Expected | p.9 signals and roundabouts |
| Geometry | TBC | SQLite or geodatabase (p.31); needed for the map |
| Coordinate reference system | TBC | |

### 5.2 Nodes and centroids

| Field | Status |
|---|---|
| Node ID, X, Y | Expected |
| Centroid range (zone IDs) | Expected |
| Junction control attributes | TBC |

### 5.3 Zones and land use

| Field | Status | Notes |
|---|---|---|
| Zone ID, geometry | Expected | Shapefile (p.32) |
| Sector, district, emirate-region | TBC | Needed for sector-level noise band |
| Population, employment by category, students, hotels | Expected | .dbf (p.31) |
| Control totals | TBC | Where are they? Needed for the land use check |

### 5.4 Transit lines

| Field | Status |
|---|---|
| Line name, mode, operator | Expected |
| Node sequence with stop flags | Expected |
| Headway per period | Expected (5 periods) |
| Fare or fare system | TBC |
| Vehicle capacity (crowding) | TBC |

### 5.5 Parameter register

Policy and cost settings are locked outside developer mode (p.35). Where the
approved values live (catalog keys, lookup DBF, spreadsheet) is **TBC**. The
parameter-drift check needs a machine-readable "approved" set.

---

## 6. STEAM output files

### 6.1 Assigned link flows

| Field | Status | Notes |
|---|---|---|
| A, B, period | Expected | |
| Volume by user class | Expected | |
| Total volume, V/C, congested time, congested speed | Expected | |
| Delay at junction | TBC | |
| Iteration count and relative gap per period | TBC | Print files or log |
| Select-link results | TBC | Utility exists (p.39) |

### 6.2 Demand matrices

| Item | Status |
|---|---|
| Matrix files by purpose, mode, period | Expected |
| Zone dimension | Expected (>3,400) |
| Skims: time, distance, cost by mode and period | Expected |

### 6.3 Transit assignment

| Field | Status |
|---|---|
| Line loads by segment and period | Expected |
| Boardings, alightings by stop | Expected |
| Crowding factor | TBC |

### 6.4 Run logs and convergence

| Field | Status |
|---|---|
| Demand-supply loop convergence metric and iteration count | TBC |
| Per-period assignment relative gap | TBC |
| Wall-clock per step | Expected in runtime logs (p.39) |

### 6.5 STEAM reporting module outputs

Summary spreadsheets and geo-reporting already exist (p.39). Their content is
**TBC** and may cover part of the KPI layer directly.

---

## 7. Observed data extracts

Status: **TBC** until item 4 is supplied. For each dataset record source
table, grain (link, detector, stop, route, zone), time resolution, date range,
coverage, ID system, and the join path to the STEAM network.

---

## 8. STEAM-AI internal tables (ours to define)

These are the app's normalised Parquet tables. The **source** column of each
mapping is filled during inspection. The app's checks, map and reports read
only these tables, never STEAM files directly.

### 8.1 Reader interface

```
RunReader
  .manifest()      -> RunManifest
  .links()         -> links
  .nodes()         -> nodes
  .zones()         -> zones
  .land_use()      -> land_use
  .lines()         -> transit_lines, transit_segments
  .link_flows()    -> link_flows
  .line_loads()    -> line_loads
  .matrices(kind)  -> od (long form, non-zero cells only)
  .skims(kind)     -> skims (long form)
  .convergence()   -> convergence
  .parameters()    -> parameters
```

Slice 1 implements `ExportedRunReader` over CSV, DBF and OMX written by a
modeller-run Voyager or CubePy export script. A native reader can replace it
later behind the same interface.

### 8.2 Tables

**runs**: run_id, scenario_name, horizon_year, policy_set, base_run_id,
ingested_at, source_root, steam_version, file_manifest (path, size, sha256),
status.

**links**: run_id, link_id, a_node, b_node, length_m, link_class, area_type,
lanes, capacity_vph, ffs_kph, oneway, toll_point, junction_type, sector_id,
geometry (WKB).

**nodes**: run_id, node_id, x, y, is_centroid, junction_control.

**zones**: run_id, zone_id, sector_id, district, region, geometry (WKB).

**land_use**: run_id, zone_id, variable, value, control_total.

**transit_lines**: run_id, line_id, mode, operator, headway_p1..p5, fare_ref,
vehicle_capacity.

**transit_segments**: run_id, line_id, seq, from_node, to_node, is_stop.

**link_flows**: run_id, link_id, period, user_class, volume, vc_ratio,
cong_time_s, cong_speed_kph, delay_s.

**line_loads**: run_id, line_id, seq, period, load, boardings, alightings,
crowding_factor.

**od**: run_id, matrix_kind, purpose, mode, period, origin, destination, trips
(non-zero only).

**skims**: run_id, skim_kind, mode, period, origin, destination, value.

**convergence**: run_id, stage, period, iteration, metric, value.

**parameters**: run_id, key, value, approved_value, source_file, source_row.

**findings**: finding_id, run_id, check_id, severity, location_type,
location_id, evidence (JSON: values, thresholds, source_file, source_row),
likely_cause, suggested_action, estimated_effect, effect_method,
effect_confidence, created_at.

**noise_band**: base_run_id, scenario_run_id, level (link | sector | line),
location_id, metric, band_low, band_high, method.

**observed_***: one table per warehouse dataset, plus **conflation**
(observed_source, observed_id, link_id, direction, match_quality, reviewed_by,
reviewed_at).

### 8.3 Units and conventions

Fixed for internal tables regardless of source: metres, seconds, km/h,
vehicles per hour, WGS84 geometry stored as WKB with the source CRS recorded in
`runs`. Period codes are the five STEAM periods, codes **TBC**.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-09-22 | Initial draft from tender only. No sample data. |
