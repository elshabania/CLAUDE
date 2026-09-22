# STEAM-AI Brain: requirements tracker

Status key: **Built** (works in this build on the embedded STEAM 2040 data),
**Partial** (works, with a stated limit), **Blocked** (needs an open item from
`assumptions.md`), **Planned**. Readiness label for the whole build:
**Demonstration on real inputs**. It is not an integrated pilot or accepted
production system.

| ID | Source | Outcome | Status | Where / evidence |
|---|---|---|---|---|
| REQ-01 | 15.1 | Automatic scanning of inputs and outputs | Partial | Checks run on boot and after every assignment or import (`ai-engine.js` `diagnose`). No watch folder in a static build. |
| REQ-02 | 15.1 | High/low link flow anomalies | Built | OUT-01 corridors, OUT-02 discontinuities, OUT-03 unused major links. |
| REQ-03 | 15.1 | Unexplained demand shifts | Partial | SCN-01 on compare: significant changes > 5 km from any changed input, with the proximity caveat. No select-link yet. |
| REQ-04 | 15.1 | Underused PT despite demand | Blocked | PT-02 Not run: needs PT assignment outputs. |
| REQ-05 | 15.1 | Model noise | Built | Per-link tolerance from the last two equilibrium iterations; OUT-05 relative gap; compare screens inside-tolerance changes. |
| REQ-06 | 15.1 | Unrealistic times, lengths, overcapacity | Built | OUT-04 speeds, OUT-06 trip length, OUT-01 corridors, NET-03 length. |
| REQ-07 | 15.1 | Diagnostic reports and actions | Built | Diagnostic report DOCX + print/PDF with map, evidence, trace, action list, coverage. |
| REQ-08 | 15.1 | MMR/MFR drafts | Partial | DOCX drafts on a demonstration structure; ITC templates not supplied. |
| REQ-09 | 15.1 | Measures and outcome estimates | Partial | Screening estimate (fixed-volume BPR) + engine test for capacity; closure, charging and growth through the engine; PT, junction and policy measures listed as not estimable without approved inputs. |
| REQ-10 | 15.2 | Warehouse time-series forecasting | Blocked | Warehouse not connected. |
| REQ-11 | 15.2 | Links, intersections, PT, stops | Partial | Road links and junction-class links. PT blocked. |
| REQ-12 | 15.2 | AI vs STEAM | Partial | Surrogate vs full engine at the 2040 horizon with disagreement reasons; STEAM loaded networks can be imported for the same view once supplied. |
| REQ-13 | 15.2 | Emerging congestion 2-5 years and beyond | Built | Year slider 2026-2050, onset year, earlier-than-STEAM and beyond-horizon flags, scenario range, driver decomposition. |
| REQ-14 | 15.2 | Stress tests | Built | Growth, spike, closure, +lane, road-user charge through the engine. |
| REQ-15 | 15.3 | Interface for technical and non-technical users | Built | Director / Modeller reading levels, seven workspaces, phone bottom sheet. Usability test with ITC users not done. |
| REQ-16 | 15.3 | Hotspot maps and time evolution | Built | Forecast map recoloured by year; pulsing markers; fly-to. |
| REQ-17 | 15.3 | Severity index and scenario comparison | Built | CSI by link, district, class, emirate; Compare workspace. |
| REQ-18 | 15.3 | Explore by location, element, scenario | Built | Map pick → link inspector; zone detail via Copilot; existing Viewer tools. |
| REQ-19 | 15.3 | LLM chat and commentary | Built | Typed tools with visible call chips and tables; deterministic planner; Anthropic/Ollama adapters; draft commentary. |
| REQ-20 | 15.3 | Prompt-based what-if | Built | Copilot builds a scenario spec, shows it, runs it on confirmation; queue-STEAM states the missing connector. |
| REQ-21 | 15.3 | API for ITC applications | Partial | Versioned JSON/GeoJSON feeds; REST API planned for the server profile. |
| REQ-22 | 15.4 | Deployment and testing | Partial | Static deploy + PWA; headless browser test of the full workflow. No ITC VM test yet. |
| REQ-23 | 15.4 | Validation of forecasts and solutions | Partial | Surrogate held-out back-test against the engine and naive baseline; no observed-data validation (blocked). |
| REQ-24 | 15.5 | Guide, training, AI explainer | Partial | In-app tour, glossary, model cards, metric registry; written guides not yet produced. |
| REQ-25 | 15 | Final v4 integration, reports, presentation | Planned | After STEAM v4 master. |
| INT-01 | pp.12,39,42 | HSM, reporting, visualisation compatibility | Partial | HSM handoff pack (draft, no gate demand); feeds for Birdseye/FUSION/Llumen unverified. |
| INT-02 | p.53 | Execution boundary and document QA | Built | No model launch from the browser; documents carry document control and a QA signature block, never invented signatures. |
