# STEAM 2040 Studio — single-file build

A complete, offline transport-planning workstation that runs from **one
self-contained `.html` file**: no server, no install, no network. Double-click
it and the whole STEAM 2040 model — network, land-use, OD matrix — loads from a
blob baked into the page, renders 150k+ links on the GPU, and runs traffic
assignment, zone aggregation and exports entirely in the browser.

## What's here

| File | Role |
|------|------|
| `engine.js`   | The transport engine ported to pure JS: CSR graph, binary-heap Dijkstra + tree-load, free-flow / incremental / MSA / Frank–Wolfe assignment, gravity demand, barrier+span zone aggregation, BCR recommender. Runs single-threaded; assignment is progressive and interruptible. |
| `glmap.js`    | WebGL2 renderer — instanced link ribbons (per-link colour/width from a data texture) and instanced zone dots. Handles the full network on the GPU. |
| `app.js`      | UI controller, the copilot planner (chained natural-language commands + optional local-LLM connect), and the exporters (CSV, GeoJSON, zipped ESRI shapefile, PNG) written byte-for-byte in the browser. |
| `template.html` | The dark "control-room" shell (left rail, status pill, control panel, legend, copilot bar) and all the styling. |

## Building the HTML

The generator lives in [`../tools/build_html.py`](../tools/build_html.py). It
loads the real STEAM files with the project's own loaders, packs everything into
a compact gzip+base64 blob, and inlines the three JS modules + the blob into one
`.html`.

```bash
# real data (defaults to ../realdata/, writes ../dist/STEAM2040Studio.html)
python tools/build_html.py

# point at your own folder / output
python tools/build_html.py --data /path/to/steam_files --out my_studio.html

# synthetic demo — safe to share, contains no confidential data
python tools/build_html.py --sample
```

### Confidentiality

The generator and these sources are public. **The baked-in data is not.** Build
locally and keep the resulting `STEAM2040Studio.html` private — `realdata/` and
`dist/` are git-ignored so neither the source data nor the data-baked HTML are
ever committed. The `--sample` build uses a synthetic grid network and is the
only variant intended for publishing.

## Using it

- **Works on phone, tablet and desktop.** On narrow screens the left rail
  becomes a bottom workspace bar, the control panel slides up as a bottom sheet
  (tap the ≡ button), and the copilot floats above the on-screen keyboard. The
  map supports pinch-to-zoom, one-finger pan with momentum, double-tap zoom and
  long-press to inspect a link.
- **Left rail** switches workspace (Network · Aggregation · Assignment) and has a
  light/dark toggle and help. Keyboard: `1/2/3` workspaces, `/` focus copilot,
  `Esc` clear highlights, `?` help.
- **Network** — colour links by class / volume / v·c / LOS / lanes / length (with
  a gradient legend, value ticks and a distribution histogram), or colour zones by
  any land-use attribute (dots sized by magnitude). Hover a link for a detail card;
  the map uses zoom level-of-detail and direction arrows on major roads.
- **Assignment** — Frank–Wolfe (conjugate) / MSA / incremental / free-flow, with
  matrix or gravity demand. Runs **live and interruptible** (map + KPIs update each
  iteration; **Stop** to halt). The KPI panel reports VMT, VHT, delay, a robust
  network speed (with raw + p15/p50/p85), avg/peak v·c, lane-km over capacity and
  % VMT in LOS E/F. `sample N` is the speed/accuracy dial.
- **Analysis** — select-link (which OD flows use a link), in-browser scenario
  edits (`add 2 lanes to link 1234`, `close link 1234`) with before/after volume
  **diff** colouring, **isochrone** from a zone, **corridor** between two zones,
  and screenline counts. Shift+right-click a link = select-link; Alt+right-click =
  isochrone.
- **Aggregation** — single-linkage merge to a target zone count; no cluster
  crosses the chosen barrier class or exceeds the max span.
- **Copilot** (bottom bar) — tolerant natural language (handles typos & synonyms),
  chains steps with "then"/"and"/commas, answers questions (`summarise`,
  `explain v/c`, `stats of population`, `list districts`), and supports
  `snapshot`/`compare`. Connect a local model with `connect ollama llama3.1` to get
  a **tool-calling agent** that drives the app; the offline planner is always the
  fallback. Type `help` for the full list.
- **Exports** — `export link results csv`, `export correspondence`,
  `export geojson`, `export shapefile`, `export the map`.
- **Robustness** — a friendly error overlay instead of a blank page, a WebGL2
  fallback message, graceful handling of networks without zones/OD, and a built-in
  self-test (`?selftest` in the URL) that checks decode → render → assign →
  aggregate → export.

## Note on the 2040 forecast

The do-nothing 2040 demand genuinely oversaturates the network — thousands of
links sit above capacity at equilibrium, with hard bottlenecks (the island
crossings) far over v/c 1. That congestion is the real finding the assignment is
meant to surface; the KPI panel and the v/c / LOS maps report it as-is rather
than smoothing it away.
