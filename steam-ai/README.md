# STEAM-AI

AI layer for the Abu Dhabi ITC Strategic Transport Evaluation and Assessment
Model (STEAM v4). Tender ITC/T/PSA/1170/25, Task 15.

After every STEAM run it tells a modeller what is wrong, why it matters, what
to do about it and what is likely to happen next, and lets a non-technical
decision maker get the same answers in plain language.

**Status: Slice 1, built against synthetic data.** No real STEAM run has been
ingested yet. Every screen and report shows a SYNTHETIC DATA banner until a
real run is processed. See `../docs/assumptions.md` for the open questions.

## Layout

```
steam-ai/
  backend/     Python 3.11, FastAPI, DuckDB over Parquet   (steam_ai package)
  frontend/    React + TypeScript, MapLibre + deck.gl       (served by the backend)
  config/      YAML thresholds, severity rules, KPIs, health score, reporting
  data/        runs/<run_id>/ immutable datasets, watch/ folder, audit log (git-ignored)
../docs/       data_contract.md, assumptions.md, architecture.md, api.md
```

## Quick start (development)

```bash
cd steam-ai/backend
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/steam-ai synth ../data/watch/BASE_2025 --defects all
.venv/bin/steam-ai synth ../data/watch/SCEN_2030 --variant scenario --scenario SCEN_2030 --horizon-year 2030
.venv/bin/steam-ai process ../data/watch/BASE_2025
.venv/bin/steam-ai runs                      # note the base run id
.venv/bin/steam-ai process ../data/watch/SCEN_2030 --base-run-id <BASE_RUN_ID>
.venv/bin/steam-ai serve                     # http://127.0.0.1:8000  (API docs at /api/docs)
```

Build the web app once so the backend can serve it:

```bash
cd steam-ai/frontend && npm install && npm run build
```

## Watch folder

`steam-ai watch` processes any export directory dropped under `data/watch/`
as soon as its `steam_ai_export_complete.json` sentinel appears. The sentinel
is written last by the export script, so partial exports are never read.

## Tests

```bash
cd steam-ai/backend && .venv/bin/pytest
cd steam-ai/frontend && npm run typecheck && npm run build
```

## Security

No data leaves the machine. There is no LLM in Slice 1. When one is added it
sits behind a provider adapter and receives only aggregated tool results,
never raw files; see `../docs/architecture.md` Section 5.
