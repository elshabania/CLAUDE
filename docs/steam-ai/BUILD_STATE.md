# STEAM-AI Brain: build state

Readiness label: **Demonstration on real inputs.** The app runs on the real
STEAM 2040 network, land use and OD embedded in the Brain. Output checks,
stress tests and forecasts use the in-app assignment engine, not STEAM runs.

## Verified (headless Chromium 1440×900 and 390×844, 2026-09-22)

| Step | Result |
|---|---|
| Boot → input checks | 19 input checks on 152,879 links, 3,692 zones, 6,000 land-use rows, 2,225,004 OD cells in about 9 s. No page errors. |
| Reference assignment (Frank-Wolfe, 500 origins) → output checks | About 110 s end to end. Relative gap after 20 iterations: 9.4 %, flagged High by OUT-05. |
| Surrogate fit (3 engine runs, 250 origins) | About 3 minutes. Held-out back-test on 70,219 links: MAE 91.7 veh vs 133.1 for naive scaling; GEH < 5 on 82.6 % of links. |
| Forecast 2035 | Hotspots ranked with onset year, risk category and flags; map recoloured by forecast V/C. |
| Stress test, demand +10 % | Runs through the engine against the cached screening base; Compare shows busier / quieter / inside-tolerance counts. |
| Copilot | "top issues", "links over capacity on freeways", "hotspots in 2045", "what if we close this corridor?" (spec shown, then run on confirmation), "draft the forecast commentary". Each answer shows its tool-call chips; chips open the table behind them. |
| DOCX exports | Diagnostic report (74 tables, map figure), decision brief (map images), MMR and MFR drafts all open in python-docx with the expected headings, tables and images. |
| Light theme, Director / Modeller, phone bottom sheet | Rendered and reviewed from screenshots. |

## What the checks say about the embedded data

- 22 zones have no network attachment (NET-07, Critical): 90,733 daily trip
  ends are dropped from the in-app assignment.
- The embedded network splits into 2,754 components; 992 zones sit off the
  main one (NET-06). The export leaves out LTYPE 60-100, which probably
  joins these pieces in STEAM, so this may be an export artefact. It still
  cuts those zones off in the in-app engine.
- 107 zones attach to freeway nodes (NET-09); one zone has a negative
  land-use value (LU-02); population and trip totals match the 2040 controls.
- After an assignment, some corridors show V/C well above 3. The app labels
  these implausible: they point to connectivity, coding or sampling problems
  in the engine run, not to real bottlenecks.

## Known limits

- The in-app engine routes every link both ways and cannot enforce one-way
  links. Direction is not in the embedded data.
- Sampled origins concentrate loading next to the sampled zones, so local and
  collector roads are left out of the corridor and hotspot checks on sampled
  runs.
- Screening runs (stress tests, surrogate) report travel time with BPR
  bounded at V/C 3, the Brain's existing capacity-restrained comparison
  protocol; routing keeps the full curve. The user's own runs are unbounded.
- Numerical tolerance needs an equilibrium method (Frank-Wolfe or MSA); it is
  shown as Not assessed otherwise.
- PT, junction delay, observed counts and the warehouse are Not run until
  their inputs arrive.
- Everything is per device: dispositions, briefs and the audit log live in
  local storage.
- LibreOffice in the build sandbox could not open any file, so the DOCX
  output was checked with python-docx rather than rendered to PDF.

## Schemes: programme prioritisation (TFP MVP)

Built from `AI_Tool.pptx`; see `schemes.md`. Verified end to end in headless Chromium (1440×900 and 390×844), 2026-10-04:

| Step | Result |
|---|---|
| Demonstration set | 13 schemes from the congested corridors of the screening base: 5 widenings, 2 relief roads, 2 ramp metering / ITS, a road-user charge, light rail (12 km, 114 zones in catchment), BRT (11.7 km, 162 zones) and parking management (26 zones). About 1 minute (the screening base run). Final pass: light rail saves 12,262 vehicle-hours but reaches BCR 0.64 at AED 3.6 bn (P3); BRT and parking reach Priority 1. |
| Scheme runs | About 60 s each (Frank-Wolfe, 250 sampled origins). Once per profile, two null-test runs size the noise band; the engine is deterministic, so the band is its 0.1% floor (±974 vehicle-hours per period). |
| Priority bands | Only schemes with BCR ≥ 1 and an effect outside the noise band reach P1/P2. In the demonstration, the road-user charge (+11,322 vehicle-hours: diversion onto longer routes, route choice only) and the effects inside the noise band go to P3, with the reason shown. |
| Package and variations | Final pass: Priority 1 = 9 schemes, AED 1,323 m, inside the 2025–2030 envelope. Run together they save 17,314 vehicle-hours per period, an interaction factor of 0.56 (the schemes overlap); congested road length falls by 49 km. Variations (P1 + P2, demand ±10%) are each measured against a base at the same demand. |
| Quick estimator | Add or drop a scheme, ±1 lane, demand ±20%. Confirm-by-assignment errors in three test passes: 1.0%, 3.8% and 21.7% of the engine's package effect. The 21.7% case combined a demand change with the convergence error described below; the in-app track record shows every confirmation. |
| Exports | Programme report DOCX (map, programme table, KPIs by scheme, method, estimator track record) opens in python-docx. CSV, STEAM batch specs (JSON) and KPI import template. |

Limits specific to Schemes:

- Variations against different base runs carry convergence error, because runs stop at 20 Frank-Wolfe iterations with a relative gap of about 9%. In the final pass, the package effect was −25.8k at demand −10% and −28.8k at +10%, against −17.3k at base. The app says so beside the variation table.
- Sampling error from sampled origins is not in the noise band. At 100 origins, widenings showed spurious VHT increases, so the profile note calls 100 origins drafting only.
- Transit and parking responses are placeholder shifts of car trips; no mode-choice model or elasticity is loaded. Skims are not produced by the browser engine and come only through the STEAM KPI import.
- The SPD25 parameters and weights are a placeholder set; the economics are travel time only.
- The DOCX writer now emits `w:tblGrid` on every table. The diagnostic, brief, MMR and MFR reports benefit too.

## Next

1. Import two real STEAM loaded networks (base and scenario) and re-run the
   output checks and Compare on STEAM outputs.
2. Agree control totals, thresholds and severity rules with ITC; move them to
   a configuration file.
3. Server profile on the ITC VM: sign-in, shared findings, watch folder, job
   queue, REST API.
4. Warehouse extract → conflation → baseline forecasting models with
   time-ordered back-tests.
