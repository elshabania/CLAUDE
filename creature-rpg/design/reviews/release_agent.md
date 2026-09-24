# Release Agent Critique of the Design Drafts (release and deployment view)

Reviewer: Release and Character Consistency Agent · Date: 2026-09-24 · Scope: the six drafts in `design/`, read as they stood on this date.

Character and originality findings are recorded separately in `design/reviews/character_consistency.md#p0-design-review` (design gate: **fail**, 11 Major). This file covers only what stands between these documents and a shippable, gated deployment.

Nothing here was run or measured. It is a review of the documents only.

## Blocking for any deployment (fix before Phase 1 closes)

1. **No one owns deployment.** No document names a hosting target, a `deploy` script, a `predeploy` hook, or where preview and production URLs live. Only the gate doc (§3.6/§3.7) assumes `npm run deploy`.
   - Needed: the orchestrator picks the target. `rendering_and_architecture.md` §11 then adds `deploy` and `predeploy: npm run gate:verify` to its script table.
2. **Four competing character and silhouette harnesses** exist. They are listed in F-0-22 and have different routes, output folders and thresholds.
   - Needed: one harness, owned by rendering (`npm run gate:character`), plus one evidence root.
   - Current evidence roots: `artifacts/` (rendering; git-ignored), `qa/evidence/` (QA) and `reports/` (gate).
   - Proposal: `qa/evidence/phase_N/` for QA and `qa/evidence/phase_N/char/` for the character gate. Only curated copies go into `design/reviews/`.
3. **The sourcemap policy is undefined.** QA 7.6 says "per rendering doc", but the rendering doc never defines it.
   - Needed: a decision on whether production ships sourcemaps (recommendation: no) and whether they are uploaded anywhere.
4. **Dev-only routes and QA flags in deployed builds.** Several routes exist: `/?tool=silhouettes`, `/?tool=faces`, `?charsheet=*`, `/dev/silhouettes` and the gate's `/gate.html`. Each must be absent from production `dist/`, not just inert.
   - QA B-30 checks the flags. Nothing checks that the routes are absent.
   - QA Unresolved question 10 (whether QA flags ship in preview builds) needs an answer before the first preview deployment.
5. **Title and region names have no trademark or store check** (CD §9.4 Q1). There are also two competing sets: "Wildchord / Cantarra" (CD) and "the Chime Vale" (world).
   - A public deployment needs the orchestrator's name check done and recorded.
   - Creature names also need the register check from `creatures.md` AC10 before any marketing use.

## Should fix before the first preview deployment

6. **The asset manifest has two names.** QA D-40 uses `assets/manifest.json`; the gate uses `assets.manifest.json`. Agree on one.
   - Rendering says there are zero binary assets. CD §7.2 allows an optional vendored SIL-OFL font, which would be the only non-code asset. It needs a manifest entry plus its license in `CREDITS.md`.
7. **No document owns `CREDITS.md` or license collection.** Rendering pins exact dependency versions (§0) but has no license-inventory script.
   - Needed: add a `licenses` script (for example `license-checker --production`) to CI output, with its output committed at each gate.
8. **Reference-device ids differ.** Rendering uses RC-L, RC-P1 and RC-P2; QA uses RD-L, RD-P1 and RD-P2.
   - Release notes may cite only measured configurations. Mismatched ids invite mislabeled claims, so pick one scheme.
   - Both documents correctly mark every device as **Not measured** and label container FPS as non-representative. Keep that.
9. **Different rules for P7 conditional pass.** QA 7.5 rejects a conditional pass at Phase 7; the gate doc §1.3 allows one for items that are not release-critical. The stricter QA rule should win, and the gate doc will be aligned.
10. **Display terminology leaks.** The save-import summary shows "badges" (rendering §10.6). Systems' UI strings use "box", "creature" and "healing center". World uses its own working names.
    - Every player-facing string must come from one CD-owned glossary. Otherwise the denylist scan (GC-12, QA C-07) will fail late, at Phase 3 or later, when fixes are expensive.

## Worth noting (no action now)

- **Bundle budgets** (rendering §6.3: ≤ 2.0 MB total, CI-enforced) are concrete and measurable in the container. They are good release evidence, as the only performance figure that can honestly be marked "measured" without a device.
- **Save integrity** (rendering §10: atomic write, backup slot, migration chain, import checksum) and the QA saves fixtures cover release checklist item R-10 well.
- **Playtime** is consistently labeled an estimate in CD, world and systems. Any release notes must keep that label until the QA M-50 timed runs exist.
- **The campaign simulation** (QA §7) is an automated completion proxy. Release notes must not present it as a human playthrough.
