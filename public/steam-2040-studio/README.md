# STEAM 2040 Studio

A single, self-contained web app that **combines two STEAM 2040 strategic
transport-model tools** — the *Network Viewer* and the *Traffic Assignment*
app — into one workspace, and adds a **fully integrated Copilot** that can
drive both apps and explain the modelling. Everything runs offline; there are
no external requests and no API keys.

Served at `/steam-2040-studio/` on the deployed site (`index.html`).

## What's inside

- 🗺️ **Network Viewer** — explore the 2040 network (152,879 road links + public
  transport, walk and Park-and-Ride layers) and aggregate the 3,692-zone TAZ
  system with methods M1–M5, distance-change and intrazonal-demand controls,
  guardrails, OD desire lines and zone shading.
- 🚦 **Assignment** — route an OD matrix onto the network (free-flow → BPR →
  Frank-Wolfe / MSA user equilibrium), build demand from land use, test road
  upgrades and new roads, rank congested corridors, find solutions, and run
  analysis / export.
- ✦ **STEAM Copilot** — a natural-language assistant docked beside the apps.

## The Copilot

The copilot is wired into **both** apps and switches between them
automatically. It can:

- **Drive the Assignment app** — run free-flow / BPR / Frank-Wolfe / MSA,
  colour by volume · V/C · LOS · Δ, rank corridors, find solutions, run
  scenarios, analysis and export. If no OD matrix is loaded it transparently
  falls back to the built-in all-ones engine test and says so.
- **Drive the Network Viewer** — zoom to Metro / Al Ain / full network, set
  aggregation methods, colour zones, toggle OD desire lines, lasso a study
  area, compute OD Δ stats.
- **Read live results** — ask *"what are the current KPIs?"* and it reports
  VHT, VMT, average speed and over-capacity links straight from the active app.
- **Explain the modelling** — BPR, user equilibrium, the relative gap, V/C,
  LOS, the gravity / demand model, TAZ aggregation, screenlines, select-link
  and more.

Type plain English (e.g. *"run a Frank-Wolfe assignment"*, *"colour zones by
district"*, *"zoom to the Metro area"*, *"explain V/C"*) or tap a suggestion
chip.

## One workspace, not two apps

The two tools share a single shell:

- A **left icon rail** replaces tabs, with **one tab per function** — **View**
  (Network, Zones) and **Model** (Assign, Demand, Display, Solve, Scenario,
  Analysis, Settings), plus the Copilot at the bottom.
- The app opens **map-first**: a clean, clearly-rendered network with no panel
  clutter. Clicking a tab switches to the owning tool and shows **only that one
  function's panel** — every other section is hidden, so there are no stacked
  headers. Clicking the active tab again returns to the clean map.
- **Shared network visualization**: the Assignment draws its base network and
  centroids *identically* to the Network Viewer — same per-class colours, alpha
  and zoom-scaled widths (`min(max(b, wm·sc), mx)`) and the same gold centroid
  dots. The Viewer-only layers it doesn't embed (connectors, walk, PnR and
  public transport) are transferred from the Viewer at runtime and drawn with
  the same palette, so the two read as one network. Assigned links render
  volume / V-C / LOS on top.
- **Zoom continuity**: switching between the Network Viewer and the Assignment
  keeps the same map centre and zoom (both use the same world coordinates), so
  the network stays put.
- A mode chip in the top bar shows which tool's map you're looking at.

## How it's built

Each original app runs **untouched inside its own iframe**, loaded from
embedded source via a `Blob` URL — so there are no global-scope collisions and
both apps behave exactly as they did standalone. A small **bridge** script is
injected into each app; the container, rail and Copilot talk to it over
`postMessage` to click controls, set inputs, read state, and toggle panel
visibility. The build also brightens the faint base-network colour and converts
literal `\uXXXX` escapes (a quirk of the originals) to real glyphs. The whole
thing is one `index.html` with no build step at runtime.

### Aggregate → assign handoff

The two tools are connected end-to-end. Aggregate the 3,692-zone system in the
Viewer (any method), then tell the Copilot **"assign on the aggregated zones"**:

1. The Copilot reads the Viewer's current aggregation (`ACT.rid`) as an
   `origZone → representativeZone` map.
2. It re-aggregates the Assignment's embedded OD matrix onto those merged zones
   — summing trips to the representative centroids and dropping trips that are
   now intrazonal — and rebuilds the demand in place (`buildODfromArrays`).
3. It re-runs the assignment, so volumes/V-C/KPIs reflect the coarser zone
   system. "Reset to full zones" restores the original 3,692-zone demand.

Both apps key their OD on the same real zone ids (`CIDS`), so the handoff is
robust without merging the engines. The embedded OD itself is decompressed with
the browser-native `DecompressionStream` (the base apps shipped no gzip
decoder), so the Assignment runs on real demand — 2.2M OD pairs / 12.6M trips.

## Run

No build step — it's a static page:

```bash
cd public/steam-2040-studio
python3 -m http.server 8080
# open http://localhost:8080/
```

Or, within the Next.js app, open `/steam-2040-studio/` on the dev server.

## Notes

- The file is large (~19 MB) because both original apps embed the full 2040
  network geometry and matrices.
- The base apps ship an embedded OD matrix that needs a gzip decompressor they
  don't bundle, so the "loaded OD" source can be empty; the Copilot detects
  this and runs the all-ones engine test instead (illustrative magnitudes).
  Load an `O,D,trips` CSV in the Assignment app for decision-grade numbers.
