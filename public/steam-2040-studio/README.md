# STEAM-AI Brain (STEAM 2040 Studio)

> **STEAM-AI (Task 15) is now built in.** The Brain opens on a run
> **Overview** and adds **Diagnose**, **Compare**, **Stress tests**,
> **Forecast**, **Briefings** and **Data & Models** workspaces over the same
> map, with a Director / Modeller reading level, provenance on every value and
> a Copilot that answers through typed tools. See
> [STEAM-AI below](#steam-ai-task-15) and `docs/steam-ai/` at the repo root.


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

## Recommendation engine (benefit–cost prioritization)

The Assignment's **Recommend & solve** ranks congested corridors by delay,
generates upgrade options (add lanes, widen the bottleneck, parallel relief
road), and reassigns each to measure the real VHT saved. It prioritises by
**benefit–cost ratio**:

- a **Budget** cap (lane-km) and a **Rank by** objective (benefit/cost or VHT
  saved) in the Recommend section;
- individual solutions are ranked by **BCR** (ΔVHT per lane-km);
- **build program** assembles the best set of projects that fits the budget by
  **marginal BCR** — the most congestion relief per lane-km, not just the
  biggest absolute saving — and reports per-step and total cost + BCR.

When the network is coloured by **Volume / V-C / LOS** after a run, the base
class colours, centroids and the connector/walk/PnR/PT layers are dimmed away
so the assignment results read clearly; they return for the base network view.

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


## STEAM-AI (Task 15)

Everything runs in the browser on the STEAM 2040 network, land use and OD
embedded in this page. Nothing is uploaded.

| Workspace | What it does |
|---|---|
| **Overview** | Run readiness score (formula shown), severity counts, top five issues, what changed since the last review, KPIs, active studies. The last summary is cached for offline reading. |
| **Diagnose** | 32-check library (network, land use, matrix, parameters, outputs, convergence, PT, junctions, scenario response). Every finding has a rule, a source file, a record, a likely cause, an action, an expected effect, a method and a confidence. Tap one to fly the map there. Accept / reject / assign dispositions. |
| **Compare** | Base vs scenario with a per-link numerical tolerance from the last two equilibrium iterations; changes inside it are hidden by default. Busier / quieter / inside-tolerance counts, KPI table, districts, SCN-01 unexplained shifts. |
| **Stress tests** | Demand growth, spike, closure, +1 lane and road-user charging, run through the assignment engine against a cached screening base (Frank-Wolfe, 250 sampled origins, reported travel time bounded at V/C 3). |
| **Forecast** | Growth-response surrogate fitted from three engine runs and back-tested on a held-out run (beats or does not beat naive scaling, stated). Year slider 2026 to 2050, ranked hotspots with onset year, risk category from the growth range, "earlier than STEAM" and "beyond horizon" flags, driver decomposition, AI vs engine, congestion severity index by district and class, model card. |
| **Briefings** | Pin findings, hotspots, links and stress tests as story blocks (map view, one sentence, evidence, action). Export DOCX, print/PDF, story JSON; issue an immutable snapshot. Diagnostic report, MMR and MFR drafts (DOCX). |
| **Data & Models** | Inventory and loaded-network import, metric registry, model cards, open items and assumptions, integrations and feeds (JSON / GeoJSON, EPSG:32640), audit log, glossary and tour, Copilot LLM settings (off / Anthropic / Ollama). |

Provenance labels: **Checked on file**, **Engine output** (in-app assignment
of the STEAM 2040 OD, not a STEAM run), **STEAM output (imported)**,
**Surrogate estimate**, **Screening estimate**, **Illustrative**.

The app is installable (web manifest + service worker) and works offline
after the first load.

### Rebuild

```bash
cd build && python3 rebuild_ai.py
```

Source files: `build/container.html` (shell), `build/ai-shell.js` +
`build/ai-shell.css` (workspaces, copilot tools, reports) and
`build/ai-engine.js` (checks, tolerance, stress tests, surrogate, map
overlay, injected into the Assignment engine).
