# STEAM-AI Brain: open items and assumptions

Open items first. Each has the assumption the build works under and what
changes when it is answered.

## Open items

| Item | Status | Assumption in use | If answered differently |
|---|---|---|---|
| Deployment (ITC VM OS, CPU, RAM, GPU, internet) | Not confirmed | Static web app served by any HTTPS server; runs fully in the browser, offline after first load (service worker). | A server profile adds sign-in, shared state, watch folder and job queue. No change to the checks or models. |
| LLM access | Not approved | Off by default. Deterministic planner answers common questions through the same typed tools. | Anthropic or Ollama adapter is already built; switch it on in Data & Models, Copilot LLM. |
| Sample STEAM runs (base + scenario with loaded networks, skims, print files) | Not supplied | Output checks run on the in-app assignment of the STEAM 2040 OD, labelled Engine output. | Import a loaded-network CSV (A, B, volume) in Overview or Data & Models; output checks re-run on it, labelled STEAM output. |
| ITC Data Warehouse | No access | Count validation (OUT-08), speed validation and operational forecasting are Not run. | Add a read-only extract; build conflation and the baseline models (seasonal naive, gradient boosted). |
| MMR and MFR templates | Not supplied | Demonstration structure, every paragraph marked DRAFT with a visible source reference. | Map the same content model onto the ITC template. |
| Birdseye, FUSION, Llumen, HSM interfaces | Not documented | Versioned JSON/GeoJSON feeds and an HSM handoff pack; no endpoint URLs assumed. | Wire the feeds to the agreed endpoints. |
| DUNE | Unknown | Not designed against. | Record its role once a copy arrives. |
| PT line files and PT assignment | Not in this build | PT-01, PT-02, PT-03 Not run. | Add a LIN reader and boardings import. |

## Assumptions

- Network, land use and OD are the STEAM 2040 files embedded in the Brain:
  152,879 links, 101,965 nodes, 3,692 zones, 2,225,004 OD cells, 12.64M trips
  routed (12.73M in the matrix), population 5.93M.
- Capacity and free-flow speed are the working defaults (freeway 2000/100,
  ramp 1500/60, arterial 900/60, collector 700/50, rural 600/80, local 500/30,
  junction 600/30) until calibrated STEAM v4 values arrive. PAR-01 flags any
  change from these.
- Control totals used by LU-03 and OD-01: population 5.93M, trips 12.73M.
- AM peak = 24-hour matrix ÷ 10, the Assignment app's period factor.
- The in-app engine routes every link in both directions. Two-way roads are
  coded as opposing directional links (41,107 pairs), so pair capacity and
  two-way volume stay consistent, but one-way restrictions are not enforced.
  This is an engine limitation, not a STEAM coding error.
- The embedded network leaves out LTYPE 60-63, 65, 70-73, 99 and 100. Where
  those links join pieces of the network in STEAM, NET-06 reports an export
  artefact that still affects the in-app assignment.
- Forecast demand path: `(1 + r)^(year − 2040)` around the STEAM 2040 OD, with
  r = 2.0 %/yr ± 1 pp by default. This is a placeholder until the approved
  land-use pipeline is loaded, and it is stated on every forecast screen.
- Before 2040 the 2040 network is assumed in place, because the 2030 and 2035
  STEAM runs are not loaded.
- Risk categories (High, Medium, Low) come from the growth range, not from a
  calibrated probability model.
- Sampled-origin runs scale demand so totals are preserved; paired runs use
  the same origins so their difference is comparable.
