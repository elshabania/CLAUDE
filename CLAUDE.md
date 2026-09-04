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
- Desktop app: Next.js (static export) in an Electron shell. Auto-loads the
  bundled WSP masterplan DXF (`public/sample-masterplan.dxf.gz`).
- **CAD ingestion** (`lib/dxf-flatten.ts` + `lib/road-detect.ts`): full block
  expansion (INSERT transforms), arcs/solids/bulges, lane-direction arrow
  markers (block local +Y axis = travel heading), robust IQR bounds.
- **Carriageway strips** (`lib/lane-network.ts`): EDGE rails are chained and
  paired into carriageway strips (midline = centerline); numLanes from
  divider count + width; one-way/two-way from arrow consistency; medians
  rejected (no arrows/dividers + narrow).
- **Network graph** (`lib/network-graph.ts`): strips -> proper node/link
  model. Chains fragments into corridors across gaps (collinear, compatible
  direction), splits corridors only at genuine lane-count changes, T-splits
  perpendicular approaches, ray-extends dangling approaches into the junction
  box, consolidates junctions (far carriageway of a dual road gets its node),
  diameter-capped end clustering (one node per junction, no mega-nodes),
  stub/self-loop/dust cleanup, degree-2 merge. WSP plan: ~300 links averaging
  ~145 m / 44 km / ~105 lane-km / ~100 junctions, 83% in one component
  (remaining pieces are CAD extraction gaps).
- **TIS traffic engine** (`lib/assignment.ts`): deterministic MSA assignment
  (Dijkstra + BPR). Demand model: external zones = gate clusters (both
  carriageways of a dual road = one zone, entry + exit nodes); internal zones
  = junction/lane-change nodes weighted by frontage; development demand half
  inbound / half outbound over reachable pairs, fully routed. ~30-50 ms/run.
- **Mitigation advisor** (`lib/advisor.ts`) + **Mitigation Studio**
  (`/advisor`, `components/AdvisorMap.tsx`): screens +1 lane on failing links,
  greedy package build on a delay + failing-link objective, escalation,
  verification, drafted TIS report. Mobile-friendly (bottom sheet, pinch).
- **TIS UI** (app/page.tsx + CadViewer): demand slider, LOS-coloured links on
  the 2D plan, failing-link count, click-a-link inspector with **Add/Remove
  lane mitigation** -> instant re-solve + delta vs baseline (delay, failing).
- HCM junction math exists (`lib/hcm.ts`). Project save/load (.mhp).
- **Next:** calibrated trip generation (land-use based demand), junction
  control modelling (signal/roundabout delay via hcm.ts), scenario save/compare,
  engineer editing of network attributes (direction, lanes confirm).

## Hard product requirements (from the user)
- **Everything is shown in 2D** — the network, congestion results, and the
  mitigation measures must be presented on the 2D plan (over the PDF). The 3D
  view is deactivated and is not the medium for results.
- **Lane counts must vary along a corridor.** A single centerline with one lane
  value is insufficient; capture lane gains/drops, turn pockets and approach
  widenings (capacity = lanes, and mitigation = adding lanes where short). DONE:
  per-vertex width profile from the distance field; corridors split into
  constant-lane links at each lane change (a node per change).

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
