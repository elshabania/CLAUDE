# STEAM 2040 Studio

An application for the **STEAM 2040 Abu Dhabi** transport model (STEAM v3.2.2,
MMU4). It merges the two applications from the build brief into a single tool
over one shared data model:

- **Assignment mode** (Prompt A) — traffic assignment with four methods
  (free-flow, incremental BPR, MSA, Frank-Wolfe user equilibrium), gravity or
  loaded-matrix demand, KPIs, scenario testing, and a recommendation engine.
- **Aggregation mode** (Prompt B) — view the network and aggregate the ~3,692
  zones into a coarser zoning system under strict **barrier** and **span**
  contiguity rules.

…plus an **in-app AI assistant** that can operate every capability of the
software through natural language.

It ships as a **local web app**: a Python backend (NumPy/SciPy + Numba-compiled
Dijkstra/tree-load kernels) does the heavy compute on your machine, and the map
renders in your **browser on the GPU** (a custom WebGL2 instanced-line renderer)
— which is why it stays smooth on the full **152,879-link** network where a
software-painted desktop map would crawl. Everything runs locally and offline; a
PyInstaller build packages it to a single executable that launches the server
and opens your browser. A legacy PySide6 desktop GUI is also included.

Validated against the real STEAM data: it loads **152,879 road links / 101,965
nodes / 6,000 zones (≈3,712 internal)** exactly as the brief specifies.

---

## Why one app instead of two

Both build prompts share the same network, zone and matrix inputs, the same
facility classification, the same CSR routing graph and the same map. Splitting
them into two executables would duplicate all of that and force the planner to
re-load data twice. Instead:

- **One shared core** (`steam_core`) — decoders, network model, CSR graph,
  Numba kernels, land-use loader, geometry/barrier grid, caching.
- **One controller** (`steam_app.state.AppState`) holds the single data model and
  exposes both engines' actions; the GUI is a thin view over it.
- **One window** with a *mode switch* (Assignment ⇄ Aggregation) over a shared
  pan/zoom map; load your data once and use either engine.
- **One capability registry** (`steam_app.capabilities`) that the toolbar buttons
  **and** the AI assistant both call — so the bot can do anything the UI can and
  the two never drift.

The two engines remain importable as standalone libraries
(`steam_assignment`, `steam_viewer`) if you only want one.

---

## The AI assistant (Copilot)

A chat panel turns natural language into capability calls — a real agent that
chains tools to reach an outcome, not canned replies. It has three
interchangeable backends over the *same* registry, picked automatically:

| Backend | When | How |
|---------|------|-----|
| **Ollama (offline LLM)** | a local [Ollama](https://ollama.com) is running | A genuine on-device agent: it runs a tool-calling loop against a local model (e.g. `qwen2.5`, `llama3.1`). Install Ollama, `ollama pull qwen2.5`, and the app uses it automatically — fully offline reasoning. Override the model with `STEAM_OLLAMA_MODEL`. |
| **Claude (cloud)** | `ANTHROPIC_API_KEY` set + `anthropic` SDK installed | Anthropic tool-use loop with `claude-opus-4-8`. |
| **Offline rules** | nothing else available | Deterministic keyword/intent parser — the always-on fallback. |

Examples it understands (any backend):

```
run frank-wolfe with the matrix
show the top 10 congested links
upgrade link 102345 by 2 lanes and run the scenario
recommend improvements
aggregate to 1800 zones with collectors as barriers and a 6 km span
export correspondence to corr.csv
```

Any state the assistant changes refreshes the map and tables automatically.

---

## Install & run

### Web app (recommended)

```bash
cd steam2040
pip install -r requirements.txt          # numpy, scipy, pyshp, numba, fastapi, uvicorn, PySide6

# Point it at a folder holding your network + land-use + OD files:
export STEAM_DATA_DIR=/path/to/your/data    # Windows: set STEAM_DATA_DIR=...
python steam_web.py                          # starts the server, opens your browser
```

It auto-discovers the network shapefile (`v322_AD_20250606_v19.shp`) or a
network CSV, `STEAM_landuse_2040.csv`, and the long-format OD CSV inside
`STEAM_DATA_DIR`. No data dir? It still starts — use the in-app controls.

Try it with synthetic data first:

```bash
python -m tools.make_sample_data sample_data
STEAM_DATA_DIR=$PWD/sample_data python steam_web.py
```

The parsed network is cached to `~/.cache/steam2040/*.npz`, so startup drops from
~30 s (first parse of 152k links) to ~3 s thereafter.

### Offline LLM Copilot

```bash
# Install Ollama (https://ollama.com), then:
ollama pull qwen2.5        # any tool-capable model works
python steam_web.py        # the Copilot now reasons with the local model, offline
```

### Legacy desktop GUI (PySide6)

```bash
python steam_studio.py     # the older Qt window; File → Open Network / Zones / Matrix
```

---

## Data formats

See `DATA_FORMATS.md` (a copy of Part 1 of the build brief) for the exact DBF
field names, the `LTYPE_2040` → facility-class bands, the protected link types,
the 29 land-use columns and the OD long-CSV format. In short:

- Network: filter to `LINK_2040 == 1`, drop rail and protected types, classify
  by `LTYPE_2040`, `capacity = max(1, LANE_2040) · cap/lane[class]`,
  `free_flow_time = SHAPE_Leng / (speed_kmh/3.6)`.
- Zones: 1-based `Z`, loaded at `CENTROIDX/Y` via the nearest network node.
- Matrix: 24-h totals → multiply by a **period factor** (AM peak ≈ 0.10).

---

## Engine notes

- **Frank-Wolfe** initialises with all-or-nothing on free-flow times, then each
  iteration recomputes BPR times, runs all-or-nothing for the auxiliary flow,
  takes the optimal step λ by bisection on the Beckmann directional derivative
  `D(λ)=Σ(y−x)·t(x+λ(y−x))`, and tracks the relative gap `(TSTT−SPTT)/SPTT`,
  stopping at `< 1e-4` or 20 iterations.
- **BPR**: `t = t0·(1 + α·(v/c)^β)`, defaults `α=0.15`, `β=4` (editable).
- **Gravity** demand is production-constrained and evaluated on the live
  congested skim: `weight_j = D_j · exp(−β·t_ij[min])`, normalised to `O_i`.
- The kernels are deterministic and serial, so two identical runs are
  bit-for-bit identical.
- **Aggregation** uses a KD-tree for candidate pairs, a spatial grid for
  barrier-crossing tests, and either single-linkage union-find or a dynamic
  nearest-neighbour heap that re-tests barrier/span against cluster centroids.

---

## Tests

```bash
QT_QPA_PLATFORM=offscreen pytest        # core, assignment, aggregation, app, GUI
```

The suite builds synthetic sample data and checks the acceptance criteria that
are scale-independent: facility classification, the CSR edge count, cache
round-trip, **Frank-Wolfe converging below 1%**, **bit-for-bit determinism**,
the **free-flow lane-upgrade invariant**, **no merge step crossing a barrier or
exceeding the span**, correspondence round-trip, and aggregated-OD total
preservation — plus the **web API** end-to-end and an offscreen GUI render test.
The WebGL front-end is validated separately by driving it in a headless browser.

---

## Packaging

```bash
pip install pyinstaller
pyinstaller packaging/steam_web.spec      # web app  → dist/STEAM2040Studio
pyinstaller packaging/steam_studio.spec   # desktop  → dist/STEAM2040Studio (Qt)
```

`--onefile`; the web spec bundles the browser front-end (`steam_app/web/static`).
Add your parsed-network cache to the `datas` list to ship a fully self-contained,
air-gapped executable. The CI workflow builds the web app for Windows/macOS/Linux
and publishes them to a downloadable Release.

---

## Layout

```
steam_core/         shared core: settings, classify, network, landuse, matrix,
                    graph (CSR), kernels (Numba), geometry, zonemap, cache
steam_assignment/   Prompt A: bpr, demand, assignment, analysis, scenario, recommend
steam_viewer/       Prompt B: aggregate (barriers, span, union-find/heap, exports)
steam_app/          merge layer: state (controller), capabilities, assistant,
                    colors (web styling)
steam_app/web/      FastAPI backend + WebGL2 browser front-end (static/)
steam_app/gui/      legacy PySide6 GUI: mapwidget, main window, docks, worker
tools/              make_sample_data
tests/              pytest suite (core, assignment, aggregation, app, web, gui)
packaging/          PyInstaller specs (web + desktop)
steam_web.py        launch the web app · steam_studio.py  launch the desktop GUI
```
