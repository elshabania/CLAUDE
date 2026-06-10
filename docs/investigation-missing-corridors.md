# Root-Cause Investigation — Missing Corridors in Road-Network Extraction

**Date:** 2026-05-29
**Status:** Investigation only — no code changes recommended without separate review.
**Scope:** Why the road-network extraction in `lib/road-skeleton.ts` + `lib/road-network.ts` loses many corridors on `public/ju_compressed_1.pdf`. Baseline: 251 links / 141 nodes / 91 junctions.

---

## Executive summary

**The primary root cause is H2: `buildRoadNetwork` silently drops every road-category segment that isn't a CLOSED polygon** (`lib/road-network.ts:308 — if (s.closed) curbSegs.push(s)`). On the sample plan **18,071 / 54,956 road segments are open polylines** (33% by count, 37% by length); of those, **6,883 sit outside any closed road polygon** carrying **~202k length units** of genuine corridor geometry — and on whole categories the loss is catastrophic (**bridge_ramp: 87% of length open**, of which 94% lies off the closed-asphalt mask, i.e. truly missed).

The clinching test ran the existing skeletonizer over the closed road segments **plus a crude auto-close of the open ones**, and recovered **+146 centerlines / +77% total skeleton length (12,960 → 23,117)** — proving the missing corridors are in the open polylines, not anywhere else.

Two contributing-but-secondary causes survive: a too-tight morphological-close radius (H5, modest +38% length at r=4, dangerous past r=4 due to parallel-corridor merge) and a sub-optimally-low raster resolution (H3, modest gain dominated by sub-tracing of already-captured corridors). Two named hypotheses (H4, H7) and two structural ones (H1, H6) are **refuted with quantitative evidence**.

| H | Hypothesis | Verdict | Why |
|---|------------|---------|-----|
| H1 | Mis-classified roads in "other" | **REFUTED** | "other" is small, dominated by hairline-stroked annotation colours (magenta `(208,0,208)`, dark green `(0,112,56)`, etc.). All road swatches match plenty. |
| **H2** | **Open road polylines dropped** | **PROMOTED — primary cause** | Auto-closing open road segments and re-running the real `extractRoadSkeleton` adds 146 centerlines / +77% length. 96.5% of bbox-orphan opens have <50% of vertices on closed asphalt. bridge_ramp is 87% open by length and that 87% is genuinely missing. |
| H3 | Raster resolution 1100 px too low | **WEAKENED** | At res=2200, ~80% of "new" centerlines are within 30u of a baseline line (sub-tracing); only 121 are truly new and all are short stubs (median 25u, none >100u). Real but small. |
| H4 | `minPolylinePx=18` too aggressive | **KILLED** | Extras admitted at min=8 are 57% floating + 37% leaves, only 6% routable through-links. Almost triples link count but adds only 51 nodes (ghost multi-edges in already-captured junctions). Threshold is resolution-coupled, so the apparent gain is just H3 under another name. |
| H5 | Close radius 2 px too small | **WEAKENED (safe only at r=4)** | r=4 legitimately bridges hatch gaps (+38% length). r=6 fuses distinct parallel corridors: components collapse 35→8, no new centerlines added, length-weighted mean link length grows +24% (classic merge signature). |
| H6 | Background drop applied in fill mode | **REFUTED** | Fill-mode branch (lib/road-skeleton.ts:154–160) is `keep.set(closed)` — the largest-component drop is inside the `else` branch only. Probe shows keep/mask = 1.473 in fill mode. |
| H7 | bbox padded by buildings | **REFUTED** | Buildings are entirely inside road extent (bbox-with-buildings == bbox-roads-only to 5 decimal places). curb-only bbox is 5.3% narrower in one axis and yields the same 222 centerlines. |

---

## Evidence detail (key numbers)

### H2 — open polylines (PRIMARY)
- 36,885 closed road polygons feed `curbSegs`; **18,071 open road segments are dropped silently**.
- Per-category open share by length: **bridge_ramp 87.2%**, bridge 79.4%, road_row 46.3%, apartment_access 46.8%, road_plot 36.6%.
- Of 6,883 bbox-orphan opens: only 3.5% have ≥50% of vertices on closed asphalt → 96.5% are NOT hatching inside captured roads.
- **Decisive test (C3):** crude `points = [...pts, pts[0], pts[1]]` auto-close + re-run `extractRoadSkeleton(fillMode=true)` →
  - baseline: **222 centerlines / total length 13,036**
  - augmented: **368 centerlines / total length 23,117** (**+66% lines, +77% length**)

### H3 — resolution
- Sweep at res ∈ {1100, 1600, 2200, 3000}:

  | resolution | centerlines | total length |
  |------------|------------:|-------------:|
  | 1100 baseline | 222 | 13,036 |
  | 1600 | 396 | 17,972 |
  | 2200 | 583 | 19,782 |
  | 3000 | 913 | 24,661 |

- BUT at res=2200, distance-to-nearest-baseline-centerline: p50=11.9u, 79.5% within 30u → most "new" are sub-tracings.
- Truly-new (median dist ≥30u): only 121 of 583, all <100u long.
- At res=3000, short-line (<20u) count jumps from 0 → 398 → noise floor crossed.

### H5 — close radius
- Sweep at r ∈ {2, 4, 6, 8} on the production raster:

  | radius | centerlines | total length | components ≥200 px (K) | top component size |
  |--------|------------:|-------------:|-----------------------:|-------------------:|
  | 2 (prod) | 222 | 12,959 | 35 | 12,589 |
  | 4 | 287 | 17,887 (+38%) | 13 (−63%) | 57,736 |
  | 6 | 280 | 18,814 (+45%) | 8 (−77%) | 95,007 |
  | 8 | 242 | 17,261 (+33%) | 7 (−80%) | 118,694 |

- r=4 → r=6 adds ZERO centerlines, loses 5 components, and length-weighted mean link length grows +24% → classic adjacent-corridor merge.

### H4 — `minPolylinePx`
- Sweep at min ∈ {18, 12, 8, 4}; new admitted lines at min=8 vs baseline (n=426):
  - geometry: p25=20u, median 24u, p75=29u, all clustered just under the physical equivalent of the threshold.
  - graph nature: 26 through-links (6%), 158 dead-end stubs (37%), **242 floating fragments (57%)**.
- The threshold is in pixels → physical length scales with resolution → at res=2200 with min=18 we already get 589/19,857 (comparable to res=1100, min=8 but with clean geometry).

---

## Recommended fix (in priority order — separate PRs)

1. **Address H2 — STOP DROPPING OPEN ROAD SEGMENTS** (single highest-impact change; recovers most missing corridors).
   - At `lib/road-network.ts:308`, replace `if (s.closed) curbSegs.push(s)` with logic that admits open road-category polylines too.
   - For each open road polyline, generate a closed footprint to feed `extractRoadSkeleton` fill mode. The proven hack — append `points[0]` to close — already yields +77% length on this plan. A cleaner fix is to **buffer the polyline by half a lane width** (e.g. min lane-width estimate or the polyline's recorded stroke width) and use the resulting offset polygon as the footprint. The buffer width matters less than just including the geometry: even the crude auto-close almost doubles skeleton length.
   - Verify on the sample plan: expect bridge_ramp (currently 12% covered) to jump to near-full coverage, plus road_row and road_plot corridors that are currently absent.

2. **Address H5 modestly — raise close-radius floor from 2 to 3** (safe, +38% length, no merge risk on this PDF).
   - At `lib/road-skeleton.ts:158`, change `Math.max(2, Math.round(scale * 1.5))` → `Math.max(3, Math.round(scale * 1.5))`.
   - Hard cap at `r=4` for this PDF aspect (`scale ≈ 0.49`) — do NOT raise to 6. Add an explicit safety check: if largest-component growth from r→r+1 exceeds ~4×, treat as evidence of adjacent-corridor merge and stop.
   - This is independent of H2 and stacks with it.

3. **Address H3 only if needed after H2+H5** — bumping resolution to 2200 buys ~121 truly-new short corridors at 3.5× runtime cost. If H2's recovery is sufficient, defer; if specific narrow plot-access lanes are still missing after H2+H5, raise resolution to 1600 (modest cost) and revisit.

**Do NOT** lower `minPolylinePx` from 18 (H4). It is dominated by floating-fragment noise; if resolution is raised in step 3, derive the threshold in physical units (e.g. `minPolylinePx = round(0.013 * resolution)` ≈ 18 px @ res=1100, ≈ 28 px @ res=2200) so the equivalent physical length stays fixed.

---

## Next steps for the reviewer

- Apply fix #1 alone, re-run `scripts/network-real.mts`, eyeball `scripts/.network-out/network-over-pdf.png` to confirm bridge ramps and missing road_plot corridors reappear.
- Then apply fix #2, re-run, confirm no parallel corridors have fused (check the perimeter ring's median strip).
- Defer fix #3 unless residual gaps remain.

---

## Provenance

- Investigation harness used: `scripts/network-real.mts` (already in repo) for baselines.
- Probe scripts (deleted by the agents after use): `scripts/.tmp-h12-probe.mts`, `scripts/.tmp-h347-probe.mts`, `scripts/.tmp-h56-probe.mts`, `scripts/.tmp-refuter-h{2,3,4,5}.mts`.
- All probes ran the REAL library code via esbuild bundling + headless `@napi-rs/canvas` + `OffscreenCanvas`/`document` shims, so the numbers above reflect the production code paths in `lib/road-skeleton.ts` and `lib/road-network.ts` — not reimplementations.
- No library code was modified during the investigation.
