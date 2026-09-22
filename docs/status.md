# STEAM-AI Status: Slice 1 review

Date: 2026-09-22. Written after running the tests, processing two synthetic
runs end to end, and reviewing the result as a sceptical senior modeller and
as a first-time user, as the build prompt requires after each slice.

Sections below "What works" were first written against synthetic data. The
section that follows records what changed once real STEAM v3.2.2 inputs were
brought in. Synthetic runs still carry a SYNTHETIC DATA marker everywhere.

## Real STEAM v3.2.2 inputs (added 2026-09-22)

The raw GDB and shapefiles were not recoverable, but derived copies of the
STEAM v3.2.2 inputs from earlier work in this repository were
(`steam-ai/reference/steam_v322/`):

- the highway network for 2025 and 2040 in one file (158,063 links; 136,509
  exist in 2025 and 152,879 in 2040), with A/B nodes, lanes, STEAM LTYPE and
  full link geometry in UTM 40N;
- the 2040 zone system (3,712 zones with coordinates, 108 districts), land
  use (population, employment, students) and the 24-hour demand matrix
  (2,225,004 non-zero cells, 12.73 M trips).

`steam-ai import-steam` turns these into two export directories
(`STEAM_V322_2025`, `STEAM_V322_2040`, base = 2025) that go through the normal
ingest, checks, health, KPIs and report. **These are inputs only: there are no
assignment results, skims, transit or convergence**, so volume, V/C and
speed checks are skipped and the app says so. Link class, capacity and
free-flow speed are derived from LTYPE and lanes with placeholder per-lane
values (`importers/steam_v322.py`); one-way status is not recorded in the
source, so it is left unknown unless both directions are coded.

What the checks found on the real network:

- **2025: health 57 (D).** Six local links coded with 0 lanes, hence zero
  capacity (Critical); 14 links with an LTYPE outside the known ranges, so no
  capacity or speed (Medium); 2,416 fragments cut off from the main network,
  of which 73 touch it at the same point under a different node number.
- **2040: health 84 (B).** The zero-lane links are fixed; 2,753 fragments,
  94 of them node-number mismatches; the demand matrix is imbalanced in 45%
  of zones, which reads as a production-attraction matrix and is reported
  once as Info.

Changes made so the app copes with a real network: large populations of one
issue are grouped (the ten worst listed, one summary finding carries the
count), the health score counts distinct problem types rather than
occurrences, a fragment's distance to the main network is measured and
fragments on top of a main-network node are reported as node-number
mismatches with the two node ids, the connectivity check was batched (41 s to
2 s), the map loads links as a compact binary (4 MB gzipped for 153K links)
and colours by link class when a run has no flows, and the report map falls
back to link class. The hosted demo at `/steam-ai/` now shows these two real
runs alongside the synthetic pair, from a static snapshot of the API
(`steam-ai/scripts/publish_demo.sh`).

## What works

- **Drop a run, get answers.** An export directory dropped under `data/watch/`
  is picked up when its sentinel appears, ingested into an immutable Parquet
  dataset with file hashes, checked, scored, and turned into a DOCX and a PDF
  diagnostic report with no manual step. Two synthetic runs process in about
  five seconds each.
- **Thirteen checks**, each with unit tests on hand-made fixtures and a
  precision test against planted defects in the synthetic generator. Every
  planted defect (zero-capacity links, orphan nodes, connectors on freeways,
  broken and implausible transit lines, land-use total mismatch, over-capacity
  corridor, low-volume link, high intrazonal share, poor convergence, speeds
  below floor, parameter drift, unused service, lengthened trips) is found at
  its planted location.
- **Every finding is traceable**: file, row, table and column, plus the SQL
  that produced the numbers, and the threshold from `config/checks.yaml`.
  Thresholds and severity bands are YAML that a modeller can edit.
- **Two reading levels** on every finding: an executive line and a modeller
  view with evidence, method and sources.
- **Solutions** for Critical and High findings with sketch estimates where
  computable (extra lane, land-use scale factor, headway changes, connector
  relocation), each labelled with method and confidence, or explicitly "not
  computable".
- **Noise band** per link, sector and period from the last assignment
  iterations, stored with the run and exposed on link profiles.
- **Scenario comparison**: input differences (land use, links, transit,
  parameters), findings that appeared or were resolved, KPI deltas, an
  unexplained-demand-shift check, and a trip-length-distribution check
  against the base run.
- **Health score** with a published formula, shown wherever the score is.
- **Web app**: Home, Findings, Map (MapLibre plus deck.gl binary path layer
  with period and metric selectors, findings overlay, link profile), Checks
  and Reports. No CDN calls at runtime. Zero browser console errors against
  the real backend.
- **REST API** with OpenAPI docs, a job queue for ingestion, and an
  append-only audit log.
- **Tests**: 236 backend tests pass; the frontend typechecks, lints and
  builds.

## What does not work yet, or is not proven

- **Nothing is proven on real STEAM *output*.** Real inputs are in (above);
  assignment results, skims and transit are not. The export contract is defined
  and implemented by the synthetic generator, but the Cube or CubePy export
  script that writes it from a real run does not exist yet. That is the first
  task once sample data arrives.
- **Scale is tested on inputs only.** The real 153K-link network ingests,
  checks (about 4 s) and renders on a phone; flows at that scale are untested.
- **Noise band is computed but not yet applied to suppress comparison
  findings**: `is_significant` is always true on the current synthetic runs
  because no comparison finding sits inside the band. The mechanism exists;
  its effect needs a real base-versus-base rerun to calibrate.
- **Statistical outlier check** is sensitive to group composition. A minimum
  V/C gate was added, but the peer-group definition (class by area type) and
  the thresholds need review against a real network.
- **Health score** deliberately punishes hard: a run with several planted
  Critical defects scores E. The penalties are YAML and will need tuning with
  ITC once real runs show the typical finding mix.
- **Reports** use built-in fonts and are not yet in an ITC template. The MMR
  and MFR drafts (Slice 2) wait on the templates.
- **No authentication yet** on the API (Slice 5).
- **No LLM, forecasting, surrogate or chat** (Slices 3 and 4).
- **Windows install script** is written but has only been run on Linux.

## Assumptions made in this slice

- Period codes AM, MD, PM, EV, NT with 3, 6, 3, 4 and 8 hours; placeholders
  until confirmed from real output (`config/periods.yaml`).
- Link classes FWY, EXP, ART, COL, LOC, CONN; area types CBD, URB, SUB, RUR.
- Capacity is per link per hour; period volumes are divided by capacity times
  period hours to get V/C where the export does not provide it.
- Skim distances are metres and times seconds, per the data contract.
- Rounding conventions in `config/reporting.yaml` are placeholders.
- STEAM-AI lives under `steam-ai/` in this repository (assumptions.md Q6).

## Outstanding items, in priority order

1. Sample data: two real run directories with assignment results, then the
   export script and a confirmed `docs/data_contract.md`. Confirm the LTYPE to
   class mapping and per-lane capacities used for the v3.2.2 import.
2. MMR and MFR templates.
3. Observed data extracts and date range.
4. Deployment target confirmation (OS, outbound access) and a run of
   `deploy/install.ps1` on a Windows VM.
5. Full-scale performance test on a 150K-link synthetic network.

## How to reproduce this review

```bash
cd steam-ai/backend
.venv/bin/pytest
.venv/bin/steam-ai synth ../data/watch/BASE_2025 --defects all
.venv/bin/steam-ai synth ../data/watch/SCEN_2030 --variant scenario --scenario SCEN_2030 --horizon-year 2030
.venv/bin/steam-ai process ../data/watch/BASE_2025
.venv/bin/steam-ai process ../data/watch/SCEN_2030 --base-run-id <BASE_RUN_ID>
.venv/bin/steam-ai serve
```
