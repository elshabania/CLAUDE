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

## Next

1. Import two real STEAM loaded networks (base and scenario) and re-run the
   output checks and Compare on STEAM outputs.
2. Agree control totals, thresholds and severity rules with ITC; move them to
   a configuration file.
3. Server profile on the ITC VM: sign-in, shared findings, watch folder, job
   queue, REST API.
4. Warehouse extract → conflation → baseline forecasting models with
   time-ordered back-tests.
