# Masterplan Highway Analyzer — Project Purpose & Direction

## North-star purpose (logged 2026-05)
**This application automates the development of mitigation measures as part of a
Traffic Impact Study (TIS).**

Given a masterplan drawing (PDF) of future development, the tool should help a
transport engineer answer: *will the road network cope with the traffic the
development generates, where will it fail, and which road interventions
(mitigation measures) fix it?* Producing those mitigation measures — and showing
they work — is the entire point. Everything else (extraction, rendering) is a
means to that end, not the goal.

## Target workflow (TIS mitigation pipeline)
1. **Network model** — an editable, routable graph (nodes + links) of the
   masterplan's roads, drawn over the PDF as a reference underlay. Each link
   carries lanes, capacity, free-flow speed, length; each node a control type.
   Seed attributes from geometry, let the engineer confirm/edit per corridor.
2. **Demand** — trip generation from land use (plots/GFA/dwellings × trip
   rates), distribution (gravity) → an O-D matrix. (Input UX TBD.)
3. **Assignment** — user-equilibrium assignment with BPR volume-delay →
   volume on every link.
4. **Performance** — V/C, LOS, junction delay (HCM) → congestion hotspots.
5. **Mitigation (the deliverable)** — propose/test interventions: add a lane,
   change junction control, add a roundabout/link, etc.; re-run; show the
   congestion resolved and quantify the improvement (A/B scenarios).

## Current state (what's real)
- Desktop app: Next.js (static export) in an Electron shell. Views: **Layers**,
  **Highway** (junction/3D analysis views deactivated for now).
- **Network extraction now produces a clean routable graph** (skeletonise the
  morphologically-closed road footprint): ~213 links / 137 nodes / 80 junctions
  on the sample plan, vs ~55k disconnected fragments before. Runs in a Web
  Worker; hot pixel kernels are compiled C++ → WebAssembly (`native/geo.cpp`).
- HCM capacity/delay/LOS math exists (`lib/hcm.ts`); per-link attribute editing
  exists. Project save/load (.mhp). PDF parsed client-side (pdf.js).
- **Not yet built:** demand model, assignment engine, mitigation/scenario tools.
  This is the gap to the north-star and the priority.

## Honest constraints
- Auto-extraction of lanes/land-use from the PDF is approximate — design for
  *engineer confirmation*, not perfect automation.
- Cannot build/run a native-GUI app or the GUI itself in the dev sandbox;
  verify via `tsc`, `next build`, and headless render harnesses
  (`scripts/network-real.mts`, `scripts/compare-pdf-layer.mjs`) that run the
  REAL pipeline over the sample PDF and emit images for inspection.

## Verification harnesses (run the real code headlessly)
- `scripts/network-real.mts` — extracts the network and overlays it on the PDF.
- `scripts/network-beforeafter.mts` — before/after of the extraction.
- `scripts/compare-pdf-layer.mjs` — PDF vs rendered layer, coverage metrics.
  Build with esbuild (`--tsconfig=tsconfig.json --external:@napi-rs/canvas`),
  run with node; output PNGs are gitignored under `scripts/.*-out/`.
