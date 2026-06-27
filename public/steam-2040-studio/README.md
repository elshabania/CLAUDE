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

## How it's built

Each original app runs **untouched inside its own iframe**, loaded from
embedded source via a `Blob` URL — so there are no global-scope collisions and
both apps behave exactly as they did standalone. A small **bridge** script is
injected into each app; the container and Copilot talk to it over
`postMessage` to click controls, set inputs and read state. The whole thing is
one `index.html` with no build step.

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
