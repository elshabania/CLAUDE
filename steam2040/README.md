# STEAM 2040 Studio

A native desktop application for the **STEAM 2040 Abu Dhabi** transport model
(STEAM v3.2.2, MMU4). It merges the two applications from the build brief into a
single tool over one shared data model:

- **Assignment mode** (Prompt A) — traffic assignment with four methods
  (free-flow, incremental BPR, MSA, Frank-Wolfe user equilibrium), gravity or
  loaded-matrix demand, KPIs, scenario testing, and a recommendation engine.
- **Aggregation mode** (Prompt B) — view the network and aggregate the ~3,692
  zones into a coarser zoning system under strict **barrier** and **span**
  contiguity rules.

…plus an **in-app AI assistant** that can operate every capability of the
software through natural language.

Built with Python 3.11 + PySide6 (Qt) + NumPy/SciPy, with the Dijkstra /
tree-load hot loops compiled by Numba (pure-Python fallback if Numba is absent).
It runs as a standalone, offline desktop app and packages to a single executable
with PyInstaller.

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

## The AI assistant

A docked chat panel turns natural language into capability calls. It has two
interchangeable backends over the *same* registry:

| Backend | When | How |
|---------|------|-----|
| **Claude** | `ANTHROPIC_API_KEY` set and the `anthropic` SDK installed | Anthropic tool-use loop with `claude-opus-4-8`; the model chooses which capabilities to call and we execute them against the live app, feeding results back until it answers. |
| **Offline** | air-gapped / no key | Deterministic keyword + intent parser over the same capabilities — works with no network, as the brief requires. |

Examples it understands (either backend):

```
run frank-wolfe with the matrix
show the top 10 congested links
upgrade link 102345 by 2 lanes and run the scenario
recommend improvements
aggregate to 1800 zones with collectors as barriers and a 6 km span
export correspondence to corr.csv
```

The assistant runs on a background thread so the UI stays responsive, and any
state it changes refreshes the map and tables automatically.

---

## Install & run

```bash
cd steam2040
pip install -r requirements.txt          # numpy, scipy, pyshp, PySide6, numba
pip install anthropic                     # optional — Claude assistant backend

python steam_studio.py                    # launch the GUI
```

Generate small synthetic data to try it without the real files:

```bash
python -m tools.make_sample_data sample_data
# then File → Open Network / Zones / Matrix on the sample_* files
```

With the real data, attach:
- the network shapefile `v322_AD_20250606_v19.shp` (or a CSV equivalent),
- `STEAM_landuse_2040.csv`,
- a long-format OD CSV exported from CUBE (`origin,destination,trips`).

The parsed network is cached to `~/.cache/steam2040/*.npz`, so the second launch
is near-instant.

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
preservation — plus an offscreen GUI render test.

---

## Packaging

```bash
pip install pyinstaller
pyinstaller packaging/steam_studio.spec   # → dist/STEAM2040Studio
```

`--onefile --windowed`; add your parsed-network cache / land-use CSV to the
`datas` list in the spec to ship a self-contained, air-gapped executable.

---

## Layout

```
steam_core/        shared core: settings, classify, network, landuse, matrix,
                   graph (CSR), kernels (Numba), geometry, zonemap, cache
steam_assignment/  Prompt A: bpr, demand, assignment, analysis, scenario, recommend
steam_viewer/      Prompt B: aggregate (barriers, span, union-find/heap, exports)
steam_app/         merge layer: state (controller), capabilities, assistant
steam_app/gui/     PySide6 GUI: mapwidget, main window, docks, settings, worker
tools/             make_sample_data
tests/             pytest suite
packaging/         PyInstaller spec
```
