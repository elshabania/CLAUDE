# STEAM 2040 Studio

A native, offline traffic-modelling studio that merges network viewing, zone
aggregation and traffic assignment into one application, driven both by a UI and
by an **AI copilot** that turns plain language into typed commands.

This is the **thin end-to-end vertical slice**: every architectural layer is
wired and runnable today, with the headline algorithms (Frank-Wolfe UE, gravity,
aggregation) implemented for real. Depth in the deferred features (recommendation
engine, scenarios, study-area mode) is stubbed behind the same command schema so
it can be filled in without rearchitecting.

## Architecture (spec section 1)

```
 ┌─ AI copilot ──────────────┐   plain language
 │ offline grammar (default) │ ─────────────────┐
 │ optional OpenAI tool-calls│                  ▼
 └───────────────────────────┘        ┌──────────────────┐
 ┌─ Front end (pywebview) ───┐  REST   │  Command dispatch │  ← UI buttons emit
 │ Canvas2D map · 3 workspaces│ ◀────▶ │  (typed schema)   │     the same commands
 │ themes · charts · copilot │  WS bin │                  │
 └───────────────────────────┘ ◀────── └────────┬─────────┘
                                                 ▼
                                   ┌──────────────────────────┐
                                   │  Native engine (NumPy/    │
                                   │  SciPy/Numba)             │
                                   │  CSR graph · Dijkstra ·   │
                                   │  AON/BPR/MSA/Frank-Wolfe ·│
                                   │  gravity · aggregation    │
                                   └──────────────────────────┘
```

* **Backend** — `steam/` Python package. FastAPI + uvicorn on `127.0.0.1`,
  REST `/command` dispatcher and a binary `/ws/results` channel that streams
  per-link `Float32` volume/v-c and `Int8` LOS buffers. Heavy work runs on a
  thread pool so the UI never blocks. Dijkstra + tree-load kernels JIT-compile
  with Numba when present; identical pure-NumPy fallback otherwise.
* **Front end** — `frontend/` static HTML/Canvas. Holds geometry (sent once),
  paints result arrays. Dark / light / high-contrast themes, viridis & LOS &
  diff palettes with a colour-blind-safe toggle, minimap, legend, convergence
  sparkline, KPI strip, bottom copilot bar.
* **Copilot** — `steam/copilot/`. Deterministic offline interpreter (grammar +
  synonyms) is the air-gapped default; an optional OpenAI-compatible LLM hook
  uses function-calling with the command schema and still validates every
  command before dispatch.

## Run (development)

```bash
cd steam2040
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # or the core subset: numpy scipy fastapi uvicorn websockets
python main.py --load-demo               # opens the desktop window
# headless backend only (for tests / curl):
python main.py --headless --load-demo --port 8770
```

Then ask the copilot (bottom bar) things like:

* `load the demo network`
* `run an AM peak equilibrium assignment on the loaded matrix`
* `build demand from land use with 2.5 trips per resident then run free-flow`
* `aggregate to 1500 zones, don't cross collectors, max 6 km`
* `aggregate to 1500 zones avoiding collectors then run an AM peak Frank-Wolfe assignment and show the top 10 congested corridors`
* `what's the network VHT now?`

## Real data

The engine is coded strictly to the documented STEAM schemas (build prompt
section 2). The three real inputs plug straight in — no synthetic data is
fabricated:

| Input | Loader | Command |
|-------|--------|---------|
| Network shapefile `v322_AD_20250606_v19.shp` (or CSV) | `steam/data/network.py` | `load_network {path}` |
| `STEAM_landuse_2040.csv` | `steam/data/zones.py` | `load_zones {path}` |
| Long-format OD CSV (`origin_zone,destination_zone,trips`) | `steam/data/matrix.py` | `load_matrix {path}` |

`.shp` reading uses pure-python `pyshp`; the CSV path needs no extra deps. Until
real files are attached, an embedded toy grid (`steam/data/demo.py`) boots the
slice for development — it is **not** a STEAM dataset, just a smoke fixture.

## Packaging (spec section 6)

```bash
pyinstaller packaging/steam2040.spec      # one --onefile --windowed executable
```

`.github/workflows/build-steam2040.yml` runs the test suite then builds Windows
/ macOS / Linux executables in the cloud and uploads them as artifacts, so no
local Python is needed to produce the Windows `.exe`.

## Tests

```bash
python -m pytest tests/ -q
```

Covers CSR construction, all four assignment methods, Frank-Wolfe determinism
and monotone gap, period-factor scaling, gravity demand, aggregation
constraints, and every section-5 copilot phrase.

## Status vs. the full spec

**Implemented:** data loaders to spec · CSR graph · Numba-optional Dijkstra +
tree load · AON / incremental BPR / MSA / Frank-Wolfe (bisection step, relative
gap) · land-use gravity (production-constrained, optional Furness) · zone
aggregation (KD-tree pairs, barrier-crossing + span + homogeneity constraints,
union-find, QA flags) · KPIs / LOS / top-corridors / histogram / CSV export ·
command dispatcher + schema · binary WebSocket streaming · offline copilot +
optional LLM hook · three-workspace Canvas front end with themes/palettes ·
PyInstaller spec · CI build.

**Deferred (stubbed behind the schema):** recommendation engine (analytic
pre-screen + reassignment ranking), scenario editing/diff & select-link &
screenline, study-area lasso mode, multi-class PCE combination, parsed-network
on-disk cache, Furness UI. These are scoped so the next session extends rather
than rebuilds.
