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

- **Left rail** switches workspace: Network · Zone aggregation · Assignment.
- **Network** — colour links by class / volume / v/c / LOS / lanes / length, or
  colour zones by any land-use attribute. Right-click a link to inspect it.
- **Assignment** — pick a method (Frank–Wolfe UE, MSA, incremental, free-flow)
  and demand (matrix or gravity), then **Run**. It updates the map and KPIs live
  after each iteration; click **Stop** to halt early. The sampled-origins count
  is the speed/accuracy dial (`sample 800` in the copilot).
- **Aggregation** — single-linkage merge to a target zone count; no cluster
  crosses the chosen barrier class or exceeds the max span.
- **Copilot** (bottom bar) — natural language, chain steps with "then"/"and":
  `colour zones by population then run an AM peak assignment then show the worst
  congestion`. Connect a local model with `connect ollama llama3.1` for free-form
  Q&A; the offline planner always remains as fallback. Type `help` for the list.
- **Exports** — `export link results csv`, `export correspondence`,
  `export geojson`, `export shapefile`, `export the map`.

## Note on the 2040 forecast

The do-nothing 2040 demand genuinely oversaturates the network — thousands of
links sit above capacity at equilibrium, with hard bottlenecks (the island
crossings) far over v/c 1. That congestion is the real finding the assignment is
meant to surface; the KPI panel and the v/c / LOS maps report it as-is rather
than smoothing it away.
