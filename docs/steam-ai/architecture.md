# STEAM-AI Brain: architecture

STEAM-AI Brain is the Task 15 AI layer built into the existing STEAM AI Brain
web app (`public/steam-2040-studio/`). It is a single static web page: the
server only serves files, and every calculation runs in the browser on the
real STEAM 2040 network, land use and OD that ship inside the page.

## Pieces

```
index.html (generated, ~28.5 MB)
├── container shell            build/container.html
│   ├── STEAM-AI shell         build/ai-shell.js + ai-shell.css   (workspaces, copilot tools, reports)
│   └── existing Copilot       intent matcher, optimiser, metro planner, evolution
├── iframe: Network Viewer     embedded source (zones, aggregation, 2025/2040 evolution)
└── iframe: Assignment engine  embedded source + build/ai-engine.js
                               (checks, tolerance, stress tests, surrogate, overlay)
```

The shell talks to each iframe through the existing postMessage bridge. The
rebuild adds one route to the bridge: any command named `ai.*` goes to the
STEAM-AI engine (`window.__AICMD`) inside the Assignment iframe, which shares
the engine's globals (links, graph, OD, volumes, camera).

## Data flow

1. **Boot.** The shell opens Overview, waits for the Assignment iframe,
   decodes the embedded OD (2,225,004 cells), and sends the embedded land-use
   CSV (lifted from the Viewer source) to the engine.
2. **Diagnose.** `ai.diagnose` runs the check library: 19 input checks
   straight away, 6 output checks once volumes exist (in-app assignment or an
   imported STEAM loaded network), 6 checks reported as Not run with the input
   they need, and SCN-01 on compare.
3. **Tolerance.** A patch in the engine's iteration loop records the change
   in every link flow between the last two iterations. Tolerance per link is
   `max(10 veh, 2 × that change)`, combined across two runs as
   `√(t₁² + t₂²)`. The difference map hides changes inside it by default.
4. **Stress tests** run the real assignment engine against a cached screening
   base with the same method and sampled origins.
5. **Surrogate** is fitted from three engine runs (demand × 0.85, 1.00,
   1.15), back-tested on the held-out 1.00 run, and drives the 2026 to 2050
   hotspot forecast.
6. **Outputs**: DOCX (a small in-browser OOXML writer), print-to-PDF, JSON and
   GeoJSON feeds (EPSG:32640), HSM handoff CSVs. Nothing is uploaded.

## Build

```bash
cd public/steam-2040-studio/build
python3 rebuild_ai.py      # idempotent; rewrites ../index.html
```

`rebuild_ai.py` lifts the prepared app blocks out of the current
`index.html`, applies marker-wrapped patches (re-running replaces them), and
splices `container.html`, `ai-shell.css`, `ai-shell.js` and
`preload-agg.json`. The older `build.py` still documents how the two original
apps were first embedded; it needs the original single-file apps, which are
not in the repository.

## Security and data egress

- No network requests at runtime unless the user turns on a hosted LLM.
- With the Anthropic adapter on, only aggregated tool results (JSON summaries
  of at most 12 kB per call) leave the device, never raw files. The API key
  stays in the browser's local storage.
- Ollama runs locally.
- Dispositions, briefs and the audit log live in local storage on the device.

## What a server deployment adds (not in this build)

The same engine and shell can sit behind a FastAPI service on the ITC VM for
multi-user sign-in, shared findings, a watch folder for new run folders, a
job queue for STEAM runs on ITC workstations, and the versioned REST API
listed in Data & Models, Integrations. That work depends on the open items in
`assumptions.md`.
