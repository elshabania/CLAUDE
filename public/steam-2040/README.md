# STEAM 2040 Studio

A browser-native strategic transport-modelling workstation for the STEAM v3.2.2
Abu Dhabi 2040 network. It runs entirely client-side: the whole model — road
network, zone land-use and the origin-destination matrix — is shipped as
compact gzipped typed-array blobs and decoded in the browser. There is no
server compute and no external map tiles.

Served at **`/steam-2040`** on the deployed site (and openable directly as
`public/steam-2040/index.html` from any static host).

## What it does

- **Map** — a canvas renderer in the model's own projection (WGS 1984 UTM
  Zone 40N), with pan/zoom, level-of-detail thinning of the 152,879-link
  network, and viridis / colour-blind-safe ramps.
- **Three workspaces** (left rail): Network, Zone aggregation, Assignment.
- **Assignment engine** — a real static user-equilibrium assignment on typed
  arrays: CSR graph, binary-heap Dijkstra, tree-load, and four methods
  (Frank-Wolfe equilibrium, BPR incremental, MSA, free-flow all-or-nothing)
  with an origin-sample dial. Reports VHT, VKT, average/peak v/c, LOS-F share
  and the relative gap.
- **Demand** — the baked OD matrix, a production-constrained gravity model
  built from land-use, or an all-ones test matrix.
- **Zone aggregation** — grows contiguous clusters from the base zones under a
  barrier rule (don't cross collectors/arterials/freeways) and a maximum-span
  ceiling.
- **Improvement recommender** — screens congested links by the vehicle-hours a
  two-lane widening would save versus a class-based lane-km cost, ranks by BCR,
  and can apply a recommendation (widen + full re-assignment) for the true
  before/after effect.
- **Exporters** — link-results CSV, correspondence CSV, GeoJSON, and a genuine
  zipped ESRI shapefile (`.shp/.shx/.dbf/.prj/.cpg`) built byte-for-byte in the
  browser.
- **Copilot** — an offline natural-language planner that drives all of the
  above. It chains clauses on "then", resolves references, runs multi-step
  recipes, and auto-runs prerequisites. An LLM can optionally be attached for
  phrasing (`connect ollama …`, `connect claude …`, `connect ai …`); the
  offline planner stays as the fallback.

Type `help` in the copilot bar for the command list, or try:
`colour zones by population` → `run an AM peak assignment` →
`show the worst congestion` → `recommend improvements` →
`aggregate to 1500 zones` → `export the new zones as shapefile`.

## Data

The studio reads gzipped binaries from `data/`, produced from the three STEAM
input CSVs (network links, 2040 land-use, long-format OD matrix) by
`preprocess.py`:

```bash
python3 preprocess.py <dir-with-STEAM-csvs> data
```

The raw `LTYPE_2040` codes are folded into the seven facility classes
(freeway/ramp/arterial/collector/rural/local/junction); the routing graph is
undirected (the source links table carries no one-way flag). The land-use file
holds 6,000 zones; the OD matrix covers the 3,685 routable zones.

## Notes & limitations

- The assignment is single-threaded JavaScript and defaults to an origin
  sample. Rankings and congestion patterns are stable across sample sizes;
  absolute volumes scale with the sample — raise it for final figures.
- Aggregated-zone polygons are convex hulls of cluster centroids (the model
  carries centroids, not original boundaries). The correspondence CSV is the
  exact, complete old→new mapping if you need to dissolve true boundaries in
  GIS.
- The gravity option is production-constrained on a Euclidean distance decay —
  a quick land-use sensitivity tool, not the calibrated matrix.
