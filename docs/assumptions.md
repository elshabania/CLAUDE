# STEAM-AI Assumptions and Open Questions

Status: draft, 2026-09-22. Open questions come first, as the build prompt
requires. Each carries the safest assumption I will work under until answered,
and what changes if the answer is different.

---

## Open questions (answer these first)

### Q1. Deployment target

Build prompt item 1 is blank. The tender says all model runs and development
tasks happen on ITC workstations reached through a remote portal, each with
32 CPUs, 60 GB RAM and 3 TB (Scope p.14, p.53). It does not say whether those
VMs have outbound internet, nor their OS.

**Assumption:** Windows Server VM, no outbound internet, STEAM-AI runs on one
of the ten VMs allocated to the consultant.
**If wrong:** Linux or Docker-first changes the installer; internet changes
nothing in the architecture but lets hosted LLM be an option.

### Q2. LLM access

Item 2 is blank.

**Assumption:** local Ollama only. The app is designed to be fully useful with
the LLM off, so this assumption cannot break anything.
**If wrong:** hosted Anthropic access is enabled behind the same adapter with
the data-egress rules in `architecture.md` Section 6.

### Q3. Sample data path

Item 3 is blank, and the repository holds no STEAM data. **No reader code will
be written until two complete run directories are available**, per the prompt's
own rule.

**Assumption:** none possible. Until data arrives, work proceeds only on the
synthetic miniature dataset, clearly labelled synthetic in every screen.
**If wrong:** nothing to unwind. The synthetic dataset stays for CI.

### Q4. Observed data

Item 4 is blank. The tender lists cell data, water and electricity, population,
bus AFC and AVM, taxi and traffic counts in the warehouse (p.13). It does not
list signal timings or incidents, which the build prompt assumes.

**Assumption:** counts, cell-derived speeds and bus AFC/AVM are available for
some date range; signal timings and incidents are not.
**If wrong:** more features become available to the forecasting models; the
conflation tool is unchanged.

### Q5. Report templates

Item 5 is blank. The tender names MMR and MFR (p.46) without expanding the
acronyms or describing them.

**Assumption:** MMR is a Model Methodology Report and MFR a Model Forecasting
Report, both Word documents with numbered tables and figures. No template
mapping is written until the files are supplied.
**If wrong:** only the mapping YAML changes.

### Q6. Repository layout

The build prompt says to run at the root of an empty repo. This repo already
contains a Next.js Road CAD Viewer and an Abu Dhabi Streets map app.

**Assumption:** STEAM-AI lives in this repo under `steam-ai/` with its own
backend and frontend folders, leaving the existing apps untouched. Shared docs
stay at `docs/` as the prompt names them.
**If wrong:** move the folder to a new repo; nothing else changes.

### Q7. Where do the approved parameters live?

Policy and cost settings are locked outside developer mode (p.35) but the
tender does not say in what form.

**Assumption:** a catalog key set plus lookup DBFs that the export script can
dump to CSV. The parameter register is then a CSV under version control.

### Q8. Run completion signal

A run takes 30 to 45 hours and writes about 250 GB (p.14). A watch folder that
fires when a folder appears would trigger 40 hours too early.

**Assumption:** the export script writes a `steam_ai_export_complete.json`
sentinel as its last step, and the watcher fires on that file. Confirm with the
STEAM team whether the existing Reporting module already writes an
end-of-run marker we can use instead.

### Q9. What does the existing validation application already do?

A high-level validation app linking inputs to the warehouse already exists and
"will be provided as a starting point" (p.11-12).

**Assumption:** it produces summary tables we can ingest as observed
references. We will not rebuild it.

### Q10. Where do the noise band base runs come from?

Estimating model noise needs at least two runs of the same scenario with
different seeds or iteration limits, or the final iterations of one run.

**Assumption:** final-iteration link flows are available from print files or a
saved iteration dump, and the noise band is estimated from iteration-to-iteration
GEH plus a base-vs-base rerun when ITC can provide one.

---

## Working assumptions (not blocking)

### Scale

Design targets from the build prompt: 150K links, 100K nodes, 3.7K zones,
2.2M non-zero OD pairs, five periods, six-plus user classes. Link flow table
per run is therefore in the order of 5 million rows; OD long form in the order
of 2.2M rows per matrix kind. DuckDB over Parquet handles this on a single VM.
Full matrices (3.7K squared, 13.7M cells) are never held densely in the app.

### Ingestion is selective

250 GB per scenario cannot be copied into the app. The export script writes
only the tables in `data_contract.md` Section 8, expected to be under 5 GB per
run. The manifest records hashes of the source files it read, not copies.

### Cube binaries

No native .net or .mat reader in Slices 1 to 3. The export step is a Voyager
or CubePy script the modeller runs once per scenario, or that the pipeline
calls if Cube is installed on the same VM. The reader sits behind an
interface so a native reader can replace it.

### Reporting conventions

Until ITC rounding conventions are supplied: flows to the nearest 10, percentages
to one decimal, times to the nearest minute, distances to one decimal km.
These live in `config/reporting.yaml`, not in code.

### Severity rules

Thresholds are initial values in `config/checks.yaml` and are expected to be
edited by ITC modellers. Defaults are conservative (fewer Criticals) so the
first session does not drown the user.

### Language

English UI. Layout uses logical CSS properties and no left-anchored
positioning so Arabic RTL can be added later without rework.

### Offline

No CDN at runtime. Fonts, map tiles (PMTiles), Python wheels and npm packages
are vendored in the install bundle.

### Security

No data leaves the VM. If a hosted LLM is ever enabled, only tool results
(aggregated tables, never raw files or geometry) are sent, and the audit log
records every payload.

---

## Things in the build prompt I would change

1. **Watch folder on folder appearance** is unsafe given 40-hour runs. Use a
   sentinel file (Q8).
2. **"Runs automatically when a new run folder appears"** should also require
   the export step to have completed, otherwise the checks read partial output.
3. **Reinforcement learning for scenario extension** has no training signal
   until the surrogate model exists and has a measured error. It is scheduled
   after Slice 4 and stays labelled experimental. Guided search (Bayesian
   optimisation over the surrogate) is the cheaper first step.
4. **Graph-based spatio-temporal model** is gated on beating the gradient
   boosted baseline on a held-out period. Expect it not to earn its place until
   there is more than one year of observed data.
5. **SHAP on 150K links per period** is too slow for interactive use. Compute
   drivers for the ranked hotspot list only (top N), and cache them.
