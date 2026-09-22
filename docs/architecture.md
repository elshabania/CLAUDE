# STEAM-AI Architecture and Phased Plan

Draft, 2026-09-22. Two pages. Grounded in the Scope of Services for
ITC/T/PSA/1170/25 Task 15 and the build prompt. Nothing here has been run
against real STEAM data yet (see `assumptions.md` Q3).

---

## 1. Shape of the system

```
STEAM run (Cube / OpenPaths, ITC VM)
   |  export script (Voyager or CubePy) -> CSV / DBF / OMX + sentinel
   v
steam-ai/backend  (Python 3.11, FastAPI)
   ingest/      watch folder + CLI -> immutable Parquet dataset + manifest
   readers/     RunReader interface; ExportedRunReader first, native later
   store/       DuckDB over Parquet; one directory per run_id
   checks/      rules + statistical checks; one module per check; YAML thresholds
   compare/     scenario diff, input diff, noise band
   solutions/   measure proposals + effect estimate (elasticity -> surrogate -> STEAM rerun)
   forecast/    feature store, baselines, GBT, model cards, back-tests
   surrogate/   trained on the run library; what-if evaluation
   reports/     DOCX + PDF diagnostic report; MMR/MFR via docxtpl mappings
   chat/        LLM provider adapter + typed tools; never free-text numbers
   api/         versioned REST, OpenAPI, token auth, roles
   jobs/        simple queue for long tasks (ingest, back-test, rerun requests)
   audit/       append-only log of runs, findings, forecasts, reports, chat answers

steam-ai/frontend  (React + TypeScript, Vite)
   MapLibre + deck.gl; one chart library; self-hosted PMTiles
   screens: Home, Map, Findings, Compare, Forecast, AI vs STEAM, Hotspots,
            Reports, Chat, Validation, Settings, Model cards

steam-ai/config    YAML with JSON-schema validation
   checks.yaml, severity.yaml, kpis.yaml, reports/*.yaml, reporting.yaml, llm.yaml

steam-ai/synthetic  miniature STEAM-like dataset generator for CI
steam-ai/deploy     one-command installer (Windows), Docker option, offline wheelhouse + npm cache
```

## 2. Data flow for one run

1. Modeller (or the pipeline, if Cube is local) runs the export script at the
   end of a STEAM run. It writes the tables in `data_contract.md` Section 8 and
   a sentinel JSON with source file hashes.
2. The watcher sees the sentinel, assigns a `run_id`, copies exports into
   `data/runs/<run_id>/` as Parquet, writes `manifest.json`, marks the run
   immutable.
3. The check runner loads `checks.yaml`, executes every enabled check with
   DuckDB queries against that run (and its base run, if declared), and writes
   `findings` records with evidence pointing at source file and row.
4. The solutions step proposes measures for Critical and High findings and
   estimates effects with the fastest credible method, stating the method.
5. The report generator renders the diagnostic report (DOCX then PDF).
6. The health score and top-five list are computed and cached for Home.
7. Every step appends to the audit log.

## 3. Key design decisions

**Export before read.** Cube binaries are not parsed in the app until a native
reader has earned its place. The `RunReader` interface keeps that swap local.

**Long-form tables only.** OD and skim data are stored as non-zero cells in long
form, partitioned by run, kind and period. No dense 3.7K squared arrays in
memory outside the matrix checks, which stream by origin block.

**Checks are data, not code paths.** Each check is a small Python class with
`run(store, run, base_run, params) -> list[Finding]`. Thresholds, severity
mapping and enablement live in YAML. Unit tests run each check on the synthetic
dataset with a known planted defect.

**Noise band is first-class.** Estimated per link, sector and line from
final-iteration stability and, where available, base-vs-base reruns. Stored in
`noise_band` and applied by every comparison view, the report and the chat
tools, so "not significant" is consistent everywhere.

**Two reading levels are stored, not generated on the fly.** Each finding and
each KPI carries an `executive_line` and a `modeller_view`. The LLM may rewrite
the executive line for tone, but never changes a number.

**LLM as a router over tools.** The chat layer exposes typed tools
(`query_links`, `compare_scenarios`, `get_findings`, `run_forecast`,
`explain_finding`, `draft_section`, `build_scenario_spec`). Answers cite the
tool calls; the UI opens the underlying table. With the LLM off, the same
tools drive a form-based query builder.

**Forecasting earns complexity.** Seasonal naive, then gradient boosted trees
on engineered features, both back-tested on a held-out period. A graph model is
added only if it wins on that period, and the comparison is shown in the app.

**Surrogate model** is trained on the library of ingested runs (inputs to
outputs at sector and corridor level). Its error on held-out runs is shown next
to every what-if answer, with a button to queue a full STEAM run.

**Config over code, offline by default, audit everything.** No CDN calls,
vendored tiles and fonts, wheelhouse and npm cache in the installer. No data
leaves the machine unless hosted LLM is switched on, and then only tool
results, logged in full.

## 4. Scale strategy

DuckDB reads Parquet with predicate pushdown, so link-level queries for one
period touch about 1M rows. Map layers are served as pre-tiled vector tiles per
run and period (built at ingest), so the browser never holds 150K links as
GeoJSON. Deck.gl renders attribute deltas from a compact binary buffer keyed by
link_id. Performance tests use a synthetic full-scale network (150K links, 3.7K
zones) generated in CI.

## 5. Security and roles

Token auth on the API. Roles: viewer (management), modeller (run, compare,
report), admin (config, users, LLM settings). All configuration edits and LLM
settings changes are audited. Raw files and geometry never reach the LLM
provider; only tool results, capped in size.

## 6. Phased plan

Each slice ends in something ITC can open. Exit criteria are testable.

| Slice | Scope | Exit criteria |
|---|---|---|
| 0 | Inventory tool; `data_contract.md` confirmed from two real runs; export script; synthetic dataset | Every "TBC" in the contract resolved or listed as unavailable; export runs on the ITC VM |
| 1 | Ingestion, ten highest-value checks, findings table, map with volume and V/C layers, diagnostic DOCX/PDF | Drop a run, get a health score, ranked findings with evidence and a report, no manual steps |
| 2 | Scenario comparison with noise band, full check library, solution proposals with sketch estimates, MMR and MFR drafts | Two scenarios compared on the map with insignificant differences suppressed; drafts open cleanly in the ITC templates |
| 3 | Conflation tool and QA view, forecasting baselines, AI vs STEAM view, hotspot ranking with drivers, model cards, back-test page | Forecasts show intervals and a documented back-test, and beat naive or say they do not |
| 4 | Chat with tool grounding, what-if from prompt, surrogate model, queued STEAM rerun | Every number in a chat answer traces to a tool call and a table |
| 5 | Versioned API with auth, installer and Docker, labelling tool, precision and recall per check, validation pages, generated guides, guided tour, glossary, executive presentation outline | One-command offline install; documented API; a new modeller finds the most serious issue in under a minute |

Ten checks for Slice 1, chosen for value per effort: null and ID mismatch scan;
zone and centroid consistency; network connectivity (orphans, one-way errors,
zero capacity or speed); connectors on high-class links; broken transit node
sequences and implausible headways; land use versus control totals; V/C and
class-relative volume outliers; convergence and noise band; matrix sanity
(totals, intrazonal share, negatives); trip length distribution by purpose and
mode against base references.

After each slice: run tests, run the app on sample data, review as a sceptical
senior modeller and as a first-time user, fix, then summarise what works, what
does not, and what was assumed.

## 7. Current position

Slices 0 and 1 are built and reviewed on synthetic data (see `status.md`).
The client confirmed no sample data was available and asked to proceed. The
first real run needs the export script (data_contract.md 8.1) and a confirmed
data contract; everything downstream reads internal tables only.
