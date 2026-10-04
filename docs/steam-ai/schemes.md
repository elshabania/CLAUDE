# Schemes: programme prioritisation (TFP MVP)

This is the MVP built from the `AI_Tool.pptx` slides. Slide 1 sketches a
programme dashboard: a map of numbered schemes, a five-KPI panel, and a project
table with total cost, cash flow for 2025–2030, a prioritisation score and
priority bands. Slide 2 sets out the method. The Brain implements it as a new
**Schemes** workspace (rail group *Prioritise*). It runs on the same STEAM 2040
network, OD and assignment engine as the other workspaces.

## Method (slide 2 → app)

| Slide step | In the app |
|---|---|
| Code the schemes in the scenario editor (roadway, mass transit, policies) | **Schemes** tab. Six scheme types (below). There are four ways to add schemes: code one on the map; capture the Assignment *Scenario* editor's lane upgrades and drawn roads; import a CSV or JSON; or generate a demonstration set from the congested corridors of the screening base run. The demonstration set uses only zones and road ends that carry flow in the base run, because the 992 zones off the main network (NET-06) cannot respond to any scheme. |
| Run the model for each scheme independently (30–40 runs) and collect the SPD25 prioritisation parameters, skims and KPIs (benefits compared to the base case) | **Run pending schemes** runs each scheme on its own against the common screening base, giving ΔVHT, ΔVKT, Δ average speed, Δ links over capacity and Δ congested km. SPD25 parameters are set per scheme. The full STEAM runs belong on the TFP workstation. **Method & settings** exports one scenario spec per scheme (JSON), and the KPIs come back through a CSV import, labelled *STEAM run*. |
| Run the model (full run) for the most likely scenarios and several variations | **Estimator → Run the package** runs every Priority 1 scheme together. **Run 3 variations** adds P1 + P2, P1 at demand −10%, and P1 at demand +10%. Each variation is measured against a base run at the same demand, so it shows the package effect rather than the demand change. The interaction factor is the package effect divided by the sum of the individual scheme effects. It is used only when it falls between 0.2 and 2; otherwise schemes are added or dropped at face value, and the app says so. |
| Develop a quick estimation engine for minor adjustments to the most likely scheme, through assignment or matrix adjustments based on the full model run | **Estimator → Quick estimate.** It covers three adjustments. Adding or dropping a scheme uses that scheme's own run × the interaction factor. A demand change is a matrix adjustment: package and base volumes both go through the fitted per-link growth response v·f^e (proportional scaling if no surrogate is fitted), and the change in the package effect is added. A ±1 lane change on a widening scheme uses fixed volumes on the BPR curve. **Confirm by assignment** runs the adjusted package and records estimate vs engine in a track record. |
| Strong machine (AED 400,000) allocated to TFP | Shown as the home of the STEAM batch. The browser engine screens; it does not replace those runs. |

## Scheme types

| Type | Group | Engine coding | Illustrative unit cost |
|---|---|---|---|
| Road widening | Roadway | +n lanes on the chosen links (the engine's lane upgrade) | AED 15 m per lane-km |
| New road | Roadway | A drawn link with connector stubs, as in the Scenario editor | AED 40 m per lane-km |
| Signals & ITS | Roadway | Capacity × (1 + gain%) on the links | AED 2.5 m per km, min 10 |
| Mass transit (LRT / BRT) | Mass transit | Car trips removed: *both ends* % for trips between station catchments, *one end* % otherwise | LRT AED 300 m per km, BRT AED 50 m per km |
| Road-user charge | Policy | Charge as time at the value of time, spread by length over the links (route choice only) | AED 120 m + 1 m per km |
| Parking / demand management | Policy | Trips to zones within the radius reduced by % | AED 25 m |

Transit and parking responses are **placeholders**: no approved mode-choice
response or elasticity is loaded. The app marks both, and the STEAM batch
replaces them.

## Scoring and priority

- **Score (0–100)** = Σ weight × component ÷ Σ weights, with these components:
  - **BCR:** min(BCR / 3, 1).
  - **Congestion relief:** the scheme's rank on vehicle-hours saved.
  - **Four SPD25 parameters:** strategic alignment, safety, deliverability and sustainability, scored 1–5 and mapped to 0–1.
- **Default weights:** 35 / 20 / 15 / 10 / 10 / 10. The weights and the SPD25 set are placeholders until the SPD25 criteria are supplied.
- **Economics:**
  - Benefit per year = vehicle-hours saved per period × annualisation (600) × VOT.
  - Appraisal runs 25 years at 7%, discounted to 2025, with benefits starting the year after completion.
  - Only travel time counts: no safety, emissions, reliability or charge revenue.
- **Cash flow:** total cost spread over the duration from the start year, using an even, front-loaded or S-curve profile. Spend after 2030 shows as *Later*.
- **Noise band:** once per engine profile, the engine runs two negligible changes (+0.5% capacity on one ordinary arterial link each). The band is twice the larger vehicle-hours change they produce, and at least 0.1% of base VHT. On the embedded data the null changes produce no measurable difference (the engine is deterministic), so the band is the 0.1% floor, about ±970 vehicle-hours per period at 250 origins. Sampling error from sampled origins is not in the band: 100 origins is for drafting only.
- **Priority bands:** only schemes with BCR ≥ 1 and a vehicle-hours change outside the noise band can be P1 or P2. Other assessed schemes go to P3, with the reason shown. Eligible schemes are taken in descending score order.
  - **P1:** while the 2025–2030 spend stays inside the budget envelope in every year.
  - **P2:** inside the envelope plus a reserve (50%).
  - **P3:** the rest.
  - Schemes without KPIs show a provisional score (SPD25 only) and are *Not assessed*.

## Board

Opening **Schemes** turns the workspace panel into a bottom board, so the map
stays visible above it:

- **Map:** numbered scheme markers, coloured by priority. The selected scheme's links or alignment are highlighted; transit lines are dashed with their stations.
- **KPI panel (KPI 1–5):**
  1. Vehicle-hours saved per period.
  2. Δ average network speed.
  3. Δ congested road length.
  4. Travel-time benefit per year.
  5. BCR.
- **What the KPIs cover:** the Priority 1 programme by default, or the selected scheme. Programme KPIs come from the package engine run when it matches Priority 1, or from the sum of scheme runs otherwise. The provenance label says which.
- **Project table:**
  - Columns: #, project, total cost, cash flow for 2025–2030 plus Later, score (hover for the components) and priority.
  - Footer rows: Priority 1 spend against the envelope for each year, and a usage bar.
- **Exports:**
  - Programme report (DOCX, with the map), CSV.
  - STEAM batch specs (JSON) and a KPI import template (CSV).

## Files

- `public/steam-2040-studio/build/ai-schemes.js`: the workspace, scoring, estimator and exports. It is spliced into `ai-shell.js` at `/*__SCHEMES__*/`.
- `public/steam-2040-studio/build/ai-engine.js`, which adds:
  - `compileSchemes`, `schemeRun`, `seedSchemes`, `estimate`, `schemeShow` and `scnEdits`;
  - draw mode and numbered markers on the overlay;
  - `engineRun`, which now takes a scenario (lanes and new roads) and a per-OD demand factor.
- `public/steam-2040-studio/build/rebuild_ai.py` adds the `odf` patch, a per-OD demand factor hook in the engine's loading loop.

## CSV formats

**Schemes import.** Columns: `type,name,start,duration,profile,cost_aed_m,links,points,lanes,lanesnew,lt,cappct,aed,mode,catch,spacing,both,one,radius,redpct,strat,safety,deliv,sust`.

- `links` is a space- or `;`-separated list of link indices.
- `points` is `x y;x y;…` in EPSG:32640.

**STEAM KPI import.** Columns: `scheme_id` or `scheme_no`, `d_vht`, and
optionally `d_vkt`, `d_speed_kmh`, `d_over_capacity_links` and
`d_congested_km`. **Method & settings** downloads a template with every scheme
listed.
