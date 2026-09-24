# Release and Character Consistency Gate

Owner: Release and Character Consistency Agent (role G in `design/MASTER_PROMPT.md`)
Status: **v2, 2026-09-24.** Revised after design review round 1, applying finding F-0-23 in `design/reviews/character_consistency.md` and the orchestrator rulings in `design/DECISIONS.md`.

Binding inputs:
- `design/MASTER_PROMPT.md`
- `design/ANCHORS.md`
- `design/DECISIONS.md`. Where this document and DECISIONS disagree, DECISIONS wins.

Rulings applied in v2:
- **D6** Stillmark watch items
- **D7** renames
- **D8** status names and codes
- **D9** Chime rings
- **D10** item ids
- **D13** trait display names
- **D14** 8-state face atlas
- **D15** timing authority
- **D16** budgets and LOD
- **D27** GC-07 is the single silhouette spec
- **D28** Vercel preview deployment

Interface details still owned by other documents are stated as **interface assumptions** and listed under Dependencies (§7.2).

### Changes from v1
- **Conditional pass:** not accepted at Phase 7 or for any production deployment (§1.1, §1.3, §3.6). This aligns with QA gate 7.5.
- **Face states:** the face check (GC-04) uses the canonical 8-state atlas and cell sizes from D14.
- **Clip timing:** the clip check (GC-05) takes its durations from `creatures.md` (D15). The Creative Director's §5.5 caps now only produce warnings. `attack_special` is a required clip.
- **Proportions:** CC-05 and GC-08 measure head ratio per body-plan class, and stay warn-only until the Creative Director publishes the per-plan bands.
- **Far LOD:** new check GC-18 verifies that silhouette-feature parts survive at LOD2 (D16).
- **Silhouettes:** GC-07 is the single silhouette spec (D27). It allows a per-species side-view angle for planar designs and adds a native 20 px render. Its within-family threshold is equivalent to QA C-02.
- **One harness:** the gate runs on the Rendering Engineer's QA tool routes (`/?tool=…`, excluded from production unless `VITE_QA=1`, D28). The separate `/gate.html` entry is gone.
- **Evidence and manifest:** there is one evidence root, `qa/evidence/…/char/`, shared with QA §0.4. The asset manifest is `assets/manifest.json`, shared with QA D-40.
- **Denylist:**
  - adds project-rule terms from CD §9.1 and QA §9.3
  - adds franchise character names, ability names and move names, each matched only against its own kind of display name
  - adds the classic status abbreviations (D8)
  - adds Escape Rope, with Repel in Tier B (D10)
- **Watchlist:** updated for D6, D7 and D9.
- **Deployment:** target is Vercel preview (D28).

---

## 0. Scope and summary

This gate enforces the project's character direction from Phase 1 through public deployment. It covers the look, behaviour and naming of creatures (*kin*), Tuners, NPCs and supporting cast. It also covers every surface where they appear and every image that leaves the build (previews, screenshots, social or OG images).

It has three layers:

1. **Automated gate**: `npm run gate:character`. Deterministic checks (§3) run on every phase candidate build and before every deployment. Any hard failure exits non-zero.
2. **Manual review**: a screenshot capture list per phase and a scored rubric (§4). Reviewers look at captures of the running build. The gate never produces or accepts generated images or external reference art.
3. **Decision record**: an entry appended to `design/reviews/character_consistency.md`, plus a machine-readable entry in `design/reviews/gate_status.json`. The deploy script verifies that JSON entry (§1.4, §3.6).

Constraints carried over from the anchors, which this gate also enforces:
- All creature and character models are procedural TypeScript builders. The build contains no downloaded meshes, textures or audio, no DCC exports and no AI-generated images.
- Each of the 30 species has its own builder with its own anatomy. A recolor or uniform rescale does not count as a species.
- Animation is procedural per-part clips: `idle`, `move`, `attack`, `attack_special`, `hit`, `capture`, `faint` and `victory`. That is the anchors' seven plus `attack_special` from `creatures.md` §2.5.

---

## 1. Mandate and authority

### 1.1 What this agent decides
For each phase gate (Phases 1–7) and for each deployment, this agent issues exactly one decision:

| Decision | Meaning | Effect |
|---|---|---|
| `pass` | Every automated hard check passes. Every in-scope manual checklist item meets its threshold. There are no open findings of severity Major or higher. | The phase may close. Deployment is allowed. |
| `conditional_pass` | **Phases 1–6 and preview deployments only.** Every automated hard check passes. There are no Critical or Major findings. At most 5 open Minor findings remain, each with an owner and a fix-by phase. The limits in §1.3 apply. | The phase may close, and a preview deployment is allowed. The conditions are carried forward and re-verified at the next gate. |
| `fail` | Any automated hard check fails, any Critical or Major finding is open, any manual threshold is missed, or evidence is missing for an in-scope item. | **Blocks the phase and blocks deployment** until the problem is corrected **and retested** with a new record on a new build commit. |

- **Not available at Phase 7:** `conditional_pass` cannot be issued at Phase 7 or for a production deployment. Those require `pass` (QA gate 7.5).
- **"Not run" is not a decision.** If a required check could not run, the decision is `fail`, unless the check is explicitly `not_applicable` for that phase under §2.2.
- **Design-stage reviews (Phase 0):** these review documents rather than builds. They use the same decision values plus `pending` while documents are being revised. A Phase 0 decision never authorizes a deployment.

### 1.2 Finding severities
| Severity | Definition | Examples |
|---|---|---|
| Critical | A recognizable imitation of another franchise, a Tier A denylisted term in player-facing text, or an external or unverified asset in the build | A creature reads as a specific existing character. The UI text contains "Pokédex". A downloaded .glb is present. |
| Major | The character direction is broken for a visible character; roster integrity is broken; or a name fails GC-13 | A placeholder is reachable in-game. Two species share a structure signature (a recolor). A face is unreadable in battle. A clip is missing. A silhouette feature disappears at LOD2. |
| Minor | A cosmetic inconsistency that does not break readability or originality | A slight palette drift between the encyclopedia and battle lighting. The victory pose timing on one species is off. |
| Note | An observation with no action required | |

These map to QA §10.1 as follows: Critical is S1, Major is S2, Minor is S3 or S4. **QA's written-waiver clause for S2 findings does not apply to character-direction findings.** QA G-CHAR already says a failed character-direction check blocks the phase regardless of anything else in the gate.

### 1.3 Limits on conditional passes
- A condition may carry forward at most **one** further gate. If it is still open at that gate, it becomes Major, which makes that gate a `fail`.
- No conditions are accepted at Phase 7 or for a production deployment (§1.1).
- No condition may be waived by the implementing agent. Only a new gate record on a new build commit can close it.

### 1.4 Relationship to other gates and to deployment
- The QA Lead's phase gate (`design/qa_plan.md`) and this gate are **both** required. A phase closes only when both allow it.
- The orchestrator is the deployment authority, but it may not deploy over a `fail` from this gate. It may commission a redesign, or it may dispute a finding in writing in the review file. A disputed finding stays blocking until a new record resolves it.
- **Deployment target (D28):** a static build of `creature-rpg/dist`, deployed as a **Vercel preview** through the connected repository.
  - The preview script runs `npm run gate:verify -- --target preview` first, then the Vercel deploy. If `gate:verify` fails, nothing is uploaded.
  - A production promotion (if one is ever made) runs `gate:verify -- --target production`, which requires a Phase 7 `pass` (§3.6).
- **Preview URLs are treated as public.** CC-15 and R-12 apply to previews too, because a preview URL can be shared.

### 1.5 Decision recording
Every decision is recorded in two places in the same commit:
1. **Human record**: a new entry appended to `design/reviews/character_consistency.md`, using the template in that file. Entries are append-only. A correction is a new entry that references the one it supersedes.
2. **Machine record**: a new object appended to `design/reviews/gate_status.json` (schema in §3.6).

Each human entry contains:
- the date
- the phase or deployment target
- the build commit (full SHA)
- the path and SHA-256 of the automated report
- the paths of the manual evidence (screenshot directory and rubric score sheet)
- the findings table
- the conditions
- the decision
- the reviewer(s)
- a list of the checks that were **Not run** or **Not measured**

**Evidence layout.** There is one root, shared with QA §0.4. The harness writes raw output to `artifacts/` (git-ignored). The gate copies what it needs into the evidence root, which is committed at gate commits:

```
qa/evidence/phase_<N>/char/report.json            automated gate output (includes "commit": <sha>)
qa/evidence/phase_<N>/char/report.md              human-readable rendering of report.json
qa/evidence/phase_<N>/char/silhouettes_256.png    silhouette sheet, normal size
qa/evidence/phase_<N>/char/silhouettes_20.png     silhouette sheet, 20 px (downsampled) + silhouettes_20_native.png
qa/evidence/phase_<N>/char/silhouette_pairs.csv   pairwise difference matrix
qa/evidence/phase_<N>/char/structure_hashes.json
qa/evidence/phase_<N>/char/denylist_report.json   shared with QA C-07
qa/evidence/phase_<N>/char/screens/*.png          manual-review captures (§4.1)
qa/evidence/phase_<N>/char/rubric.csv             rubric scores (§4.3)
qa/evidence/deploy_<target>/<sha7>/char/…         the same layout for deployment gates
```

A re-run of the same phase on a new commit overwrites these files. Earlier runs remain in git history, and each `report.json` records its commit. The review entry must point at files that actually exist in the gate commit.

---

## 2. Character consistency checklist

Legend for the "How checked" column:
- **A**: automated inside `gate:character`, with the check ID from §3.
- **S**: manual review of captured screenshots or clips.
- **A+S**: both are required.

The "From phase" column gives the first gate at which the item applies. Before that phase the item is `not_applicable`.

| # | Item | Pass criteria | How checked | From phase |
|---|---|---|---|---|
| CC-01 | **Expressive, appealing creature designs** [Release-critical] | Every in-scope species scores **Appeal ≥ 3** and **Expressiveness ≥ 3** on the §4.3 rubric. The roster mean is ≥ 3.5 on each. In battle, each species visibly shows at least `open`, `determined` and `hurt` (D14 states). | S (rubric) and A (GC-04) | 1 (c01), then all built species |
| CC-02 | **Appealing, readable Tuner and NPC designs** [Release-critical] | The protagonist, rival, Stillmark members, six Cantors, the Concordant and named NPCs each score Appeal ≥ 3 and Readability ≥ 3. Each role is identifiable by silhouette hook and costume color block alone, with the role name hidden (CD §5.3, §5.6). | S and A (GC-02) | 1 (protagonist), 2 (town_1 NPCs), 4 (Cantors 1–2, Stillhands), 5 (all) |
| CC-03 | **Silhouette readability at gameplay distance** | At the default exploration camera, rendered at 1280×720, a wild creature at 15 m (LOD1) and at 30 m (LOD2) shows head, body mass and its `creatures.md` §7.3 must-read features. The reviewer names the species from the capture without the nameplate for ≥ 90% of in-scope species. | S (S02) and A (GC-07, GC-18) | 2 |
| CC-04 | **Silhouette readability at thumbnail (20 px) scale** [Release-critical] | Every species meets the GC-07 thresholds. On visual review, no two species in **different families** are confusable. Family members share a motif but differ in outline. | A (GC-07) and S (sheet review) | 3 |
| CC-05 | **Consistent proportions** | Each species' head ratio falls in the CD band for its stage **and body-plan class** (§3.3 GC-08: upright plans use head height / total height, horizontal and serpentine plans use head length / body length). Humans follow CD §5.1 head counts. Deviations need a documented rationale in `creatures.md`. **Warn-only until the CD publishes per-plan bands** (Unresolved question 1). | A (GC-08) and S | 2 |
| CC-06 | **Facial readability** [Release-critical] | Eyes and mouth are readable at battle framing in the Mobile profile. The eye highlight is visible. The eye diameter is ≥ 12% of head height, and pupil-to-sclera luminance contrast is ≥ 4.5:1 (rendering §4.4). Faces survive every lighting preset (day, dusk, night, cave and each weather state), and night face luminance is ≥ 60% of day. | A (GC-04, GC-09) and S (S05, S15) | 1 |
| CC-07 | **Color grouping** | Each species uses its 2–3 dominant colors from `creatures.md` in a roughly 60/30/10 split (CD §5.4). Under neutral lighting, those colors cover ≥ 70% of opaque pixels, with undeclared colors ≤ 15%. Type identity is never conveyed by color alone: there is always a glyph and a 3-letter code (CD §7.5). | A (GC-10) and S | 2 |
| CC-08 | **Consistent animation language** | Every species has all 8 clips (GC-05). Durations and contact timing follow `creatures.md` (D15). Attacks keep an anticipation → action → follow-through structure; the CD §5.5 phase timings are guidance, checked as warnings. Hit reactions start ≤ 2 frames after the `contact` event. Family members share a motion motif. The f09 12 fps stepped motion is intentional. Reduced-motion mode applies the documented reductions. | A (GC-05) and S (S06 clip strips) | 1 |
| CC-09 | **Coherent presentation across surfaces** [Release-critical] | Each species and character is the same model, palette, face and scale class in exploration, battle, troupe menu, Fosterage, Kinsong 3D viewer, Crescendo scene, loading screens and deployment previews. No surface uses a 2D stand-in drawn differently from the 3D model. Portraits and icons are rendered from the builder. | A (GC-11) and S (the cross-surface capture set) | 3 |
| CC-10 | **Original names** [Release-critical] | No species, character, move, item, trait, status, location or system display name hits Tier A (GC-12). No name fails GC-13. Every GC-13 warn has a recorded judgment. | A and S | 1 |
| CC-11 | **Original anatomy and silhouettes** [Release-critical] | No design shares **3 or more distinctive (non-generic) features** with one specific existing franchise character (the three-feature rule, §4.2). On the cover test, no reviewer's first association is a specific existing character. | S | 1 |
| CC-12 | **Original iconography and terminology** [Release-critical] | Type glyphs, the Chime look (a hexagonal bell-lantern) and its **ring** presentation (D9), the Kinsong frame, status icons and codes (D8: SCH, BLT, JLT, DRW, RMB), the tally symbol ◇ and menu glyphs are procedurally drawn and original. UI copy passes GC-12 and GC-14. Every display term comes from the CD glossary (CD §3). | A (GC-12, GC-14, GC-15) and S | 2 |
| CC-13 | **No recognizable imitation of Pokémon or any other specific franchise** [Release-critical] | Originality scores ≥ 4 for every character and UI screen on the §4.3 rubric. There are zero Critical findings. The overall presentation passes the §4.2 "franchise swap test": it cannot be mistaken for another franchise. | S | 1 |
| CC-14 | **No placeholder characters in release builds** [Release-critical] | From Phase 5 on: zero registry entries with `placeholder: true`, zero fallback-builder usages, no debug materials. Before Phase 5: placeholders are allowed only if flagged and **unreachable** from encounters, trainer parties, rewards, previews and the Kinsong (GC-03). | A | 1 (reachability), 5 (zero) |
| CC-15 | **No violating deployment assets or previews** [Release-critical] | Every image shipped or published (OG or social image, README screenshots, favicon, loading-screen art, Vercel preview metadata) comes from the gated build commit, is listed in the screenshot manifest, contains no placeholder, and passes CC-09 to CC-13. The build contains no external or unmanifested binary assets. | A (GC-15, GC-16) and S | Every deployment, including previews |
| CC-16 | **Crescendo (evolution) identity** | Each stage 2 and 3 species keeps the family motif (`creatures.md` §3): at least one shared anatomical motif **and** one shared dominant color. Its anatomy changes (GC-06). A stage is never a uniform scale of the previous one. | A (GC-06) and S (S12) | 3 (built lines), 5 (all) |
| CC-17 | **Emotional pose and behaviour consistency** | The follower and battle idle show each species' documented personality: its idle cadence and a signature fidget within 10 s of idle. Tuners use the CD §5.5 human pose set in dialogue. | S | 2 |

### 2.1 Phase scope (minimum character content reviewed at each gate)
| Phase | Minimum in-scope characters | Surfaces reviewed |
|---|---|---|
| 1 Movement & visual foundation | Protagonist (default name per D7), c01 Fizzkit (follower), the harness operational | Exploration |
| 2 First inhabited area | + the three stage-1 starters (c01 Fizzkit, c04 Wickwool, c07 Rippleback), every species in the route_1 and forest encounter tables, town_1 NPCs (Oriel, Hearthkeeper Maud, Chandlers), Cass | Exploration, dialogue |
| 3 Core gameplay slice | + every species reachable in the slice, the Chime (all 4 tiers), one species with a Crescendo | Exploration, battle, capture, troupe, Fosterage, Kinsong viewer, Crescendo |
| 4 Early campaign | + Cantors Wren Mossgrave and trial_2's Cantor, Stillhands, Warden Brann, all species reachable before trial_2 | + Cadence Halls, loading screens |
| 5 Complete campaign | **All 30 species, all named characters, zero placeholders** | All surfaces |
| 6 Atmosphere & polish | All, under every lighting and weather state and every quality profile | All, plus quality and reduced-motion variants |
| 7 Release validation | All, re-verified on the release candidate commit | All, plus deployment previews |

### 2.2 `not_applicable` rule
An item or check may be `not_applicable` only for the phase reason given in the "From phase" column or §2.1. The report must state that reason. Anything else that did not execute is `not_run`, and a `not_run` required item means `fail`.

---

## 3. Automated gate: `npm run gate:character`

### 3.1 Execution model
**One harness.** The Rendering Engineer owns the render harness and its QA-only routes:
- `/?tool=silhouettes`
- `/?tool=faces`
- `/?tool=surface&surface=<id>&species=<id>`

These routes are compiled in only for dev builds or builds made with `VITE_QA=1` (D28, QA §0.3). They are the same routes QA's `test:char` uses; this gate defines the rules applied to their output.

`npm run gate:character -- --phase N` (entry `scripts/gate/character/index.ts`, run with `tsx`) runs in two stages:
1. **Node stage** (no WebGL; three core runs in node). It covers registries, data, structure hashing, clips, face atlases, text scans and file scans. It relies on builders being pure and taking the injectable texture factory from the builder contract (rendering §4.1).
2. **Browser stage.** Playwright 1.56.1 with the preinstalled Chromium (software GL) loads the tool routes to render silhouettes, palettes, face measurements, LOD checks and surface checks. Software rendering is acceptable because these are image-content checks, not performance checks.

Output and exit rules:
- Output goes to `qa/evidence/phase_<N>/char/report.json` plus the §1.5 artifacts.
- Each check result is `{id, status: pass|fail|warn|not_run|not_applicable, severity, details, evidence[]}`.
- Exit code: `1` if any check is `fail`, or if any required check is `not_run`. Otherwise `0`. A `warn` never blocks, but it is listed in the review entry.
- The script records results. It does not issue the gate decision; the decision stays with the reviewer (§1).

Flags:
- `--phase N` selects the §2.1 scope and phase-dependent strictness.
- `--release` equals Phase 7 strictness.
- `--update-baseline` is forbidden in CI and only rewrites `qa/evidence/baseline/char_thresholds.json`, and only with a review entry (§6.6).

Determinism: fixed seeds, fixed cameras and a fixed pose (`idle` at t=0). The same commit must produce byte-identical `structure_hashes.json` and pixel-identical silhouette sheets. GC-00 checks this.

### 3.2 Interface assumptions (builder contract per rendering §4.1; values per creatures.md)
```ts
// rendering §4.1 contract (summarized): CreatureBuilder(spec, {lod, quality, seed}) -> CreatureModel
//   CreatureModel.parts: Record<PartName, Object3D>, .anchors (eyeL, eyeR, head, ...), .face: FaceRig,
//   .bounds {box, radius, height, headHeight, headRadius}, .stats {triangles, drawCalls, materialCount}
export type FaceState = 'open'|'half'|'closed'|'happy'|'hurt'|'faint'|'determined'|'surprised'; // D14, canonical
export type ClipName  = 'idle'|'move'|'attack'|'attack_special'|'hit'|'capture'|'faint'|'victory';
// Registry (src/creatures/registry.ts): speciesBuilders: Record<'c01'..'c30', {build, meta}>
//   meta: { familyId, stage, bodyPlan, placeholder?: boolean, silhouetteFeatures: PartName[],
//           silhouetteSideYaw?: number /* planar designs, D27 */, palette: {dominant: string[], accent?: string[]},
//           clipDurations: Record<ClipName, number>, contactT: number }
// Characters (src/creatures/trainers/…): characterBuilders: Record<modelId, {build, meta}> — same contract, humanoid part set.
```
Part names follow the rendering §4.1 conventions: `root, body, chest, hips, neck, head, jaw, ear_L/R, horn_L/R, crest, tail_0..n, leg_*, arm_L/R, wing_L/R, fin_*, shell`, plus species parts. `meta.silhouetteFeatures` lists the parts behind the `creatures.md` §7.3 must-read features. This is a **new field requested from the Creature Art Director and Rendering Engineer**; it drives GC-18.

### 3.3 Check list
| ID | Check | Pass criterion | Blocking from |
|---|---|---|---|
| GC-00 | **Determinism self-test** | Two builds and two renders of the same 3 species produce identical hashes and pixels. | 1 |
| GC-01 | **Species registry completeness** | Exactly 30 entries, IDs `c01`..`c30`. The family and stage match the anchors. The names match `creatures.md` §0 after D7: c11 **Lullstalk**, c27 **Emberfold**, c30 **Coronaleen**. Every ID in the creature content file has a registry entry and vice versa. No two entries share a `build` function reference or source hash. | In-scope IDs from 1; all 30 from 5 |
| GC-02 | **Character registry completeness** | Every Tuner and NPC `modelId` in trainer and dialogue data has a builder, or a documented archetype builder for unnamed NPCs. Named characters are unique. There is exactly one protagonist entry. | 2 |
| GC-03 | **Placeholder detection and reachability** | Placeholder markers are: `placeholder: true`; builder names matching `/placeholder|fallback|debug|temp|stub/i`; display names matching `/^(todo|tbd|test|temp|placeholder|xxx|missing)/i` or containing `lorem ipsum`; debug materials (fully saturated `#ff00ff` or `#00ff00` as a base color); `MeshNormalMaterial`. **Phases 1–4:** every marked entry must be unreachable from encounters, trainer parties, gift or quest rewards (`q_foster_leftover`, `q_second_clutch`), Crescendo targets of non-placeholder species, previews, and the title or loading screens. **Phase 5+ and `--release`:** zero marked entries. | 1 (reachability), 5 (zero) |
| GC-04 | **Face atlas and states (D14)** | Every in-scope species has all **8** states in its atlas: `open, half, closed, happy, hurt, faint, determined, surprised`. f09's alpha-cut face sets must supply an equivalent for each state. Minimum cell size: **256 px on High and Balanced, 128 px on Mobile**. Each state differs from `open` by ≥ 3% of eye-region pixels; `half` also differs from `closed` by ≥ 3%. The eye diameter is ≥ 12% of head height, and pupil-to-sclera luminance contrast is ≥ 4.5:1 (rendering §4.4). The right eye is a UV mirror of the left; this is an accepted stylization (D14) and not a finding. Humans: the CD §5.2 7 emotions map onto the same 8 states. | 1 |
| GC-05 | **Clips present and valid (D15)** | Species need all 8 clips; characters need the CD §5.5 human set. Every track targets an existing part at every LOD, and there are no NaN or Infinity keys. **Durations come from the species' `clipDurations`, which must fall in the `creatures.md` §2.5 ranges:** idle 2.4–4.0 s (loops; the pose at t=0 equals t=end within 1e-3), move 0.5–1.4 s (loops), attack and attack_special **0.4–1.3 s**, hit 0.35–0.5 s, capture reaction 0.6–1.2 s, faint 1.0–1.6 s (ends in a hold pose with every part at y ≥ stage plane), victory 1.2–1.8 s. Each rendered clip matches its declared duration within ±2%. Attacks have `windup`, `contact` and `recover` markers, with **`contact` at 40–55%** of the clip. The CD §5.5 phase timings (anticipation, action, follow-through per stage) are compared and reported as **warn**, never fail. Reduced-motion data meets the `creatures.md` §2.5 caps. | 1 |
| GC-06 | **Distinct part-structure signature (anti-recolor)** | Build each species at LOD0, t=0, and compute two signatures. (a) A topology signature: the sorted multiset of `(partName-class, geometryKind, parentClass, childCount)`. (b) A shape signature: per-part bounding-box extents over the model height, quantized to 0.05, plus a log2 vertex-count bucket. **Materials, colors and uniform scale are excluded.** Rules: (1) all 30 combined hashes are unique; (2) topology hashes are unique within each family; (3) the stage-to-stage part-name Jaccard distance is ≥ 0.30 (`creatures.md` AC3; QA C-06 requires ≥ 2 changed parts); (4) any cross-family pair with role-multiset Jaccard similarity > 0.85 needs a recorded exemption, with at most 3 in total. | 3 (built species), 5 (all) |
| GC-07 | **Silhouettes: the single spec (D27)** | See §3.5. **Pass:** every cross-family pair has D₂₅₆ ≥ 0.15 and D₂₀ ≥ 0.10. Every same-family pair has D₂₅₆ ≥ 0.10 (IoU ≤ 0.90, equivalent to QA C-02's fail line) and D₂₀ ≥ 0.06. The 20 px fill of each species is 15–75%. The native 20 px render has no species with fill < 10% (warn). Thresholds are **provisional** until the Phase 3 calibration freezes them. | 3 |
| GC-08 | **Proportion measurement** | Uses `bounds.headHeight` and the `head` subtree. Upright plans (BP, and FL where upright) report head height / total height. Horizontal plans (QS, QL, SR, WG, RD, RB, FT, other FL) report head length along +Z / body length. Also reports stage-1 height against the CD minimum-size rule. The result is compared with the CD per-plan bands once published. **Warn only** until then; fails only if the `head` part is missing. | 2 (warn); 5 (fail on a missing head) |
| GC-09 | **Face legibility across quality and framing** | For High, Balanced and Mobile, at the `opponent_hero` and `player_over_shoulder` framings (rendering §4.7), day and night: projected head height is ≥ 8% of viewport height in `player_over_shoulder`; eye region is ≥ 12 px tall; highlight-to-iris luminance delta is ≥ 0.25; night face luminance is ≥ 60% of day. Eyes exist at every LOD. | 3 (Balanced), 6 (all profiles) |
| GC-10 | **Palette adherence** | Unlit flat slot colors plus a neutral-lit render (ACES off). k-means (k = 6) on opaque pixels, mapped to the declared palette with CIEDE2000 ΔE ≤ 12 (`creatures.md` §7.1 uses ΔE ≤ 15 on its unlit pass; the gate uses ΔE ≤ 15 unlit and ≤ 12 lit). Dominant colors cover ≥ 70% and undeclared colors ≤ 15%, excluding eyes and mouth. Cross-family dominant palettes matching within ΔE ≤ 8 on every color are reported as warn. | 2 (warn), 5 (fail) |
| GC-11 | **Cross-surface identity** | Open each in-scope surface through `/?tool=surface`. Assert that the rendered group came from the same registry `build` with the same palette hash. Portraits and icons come from the builder-rendered portrait cache. Fail on any static creature or character image not in that cache. | 3 |
| GC-12 | **Terminology denylist scan** | Scan string values in all content JSON (`src/data/content/**`), UI string tables, TS/TSX string literals and JSX text (regex over literals, per D24), `index.html`, `public/**` text, `README.md`, `CREDITS.md`, the save export/import summary strings, and the deployment metadata (OG and Vercel project title and description). Normalize first: NFKD, strip diacritics, lowercase, collapse `[\s\-_.'’]`. **Tier A** hits in player-facing text fail. **Tier B** hits warn and need a recorded judgment. Kind-scoped lists (§3.4) match only their kind of display name. Internal ids (`i_revive_1`, `tr_reckless`, `burn`) are not player-facing and are reported as info only. Code comments and `design/**` are info only. | 1 |
| GC-13 | **Name similarity scan** | Every species, character, move, item, trait, status and location **display name** is compared with the franchise reference lists (§3.4) using three metrics, as in QA C-08. (1) Jaro-Winkler: ≥ 0.88 **fails**; 0.80–0.88 warns. (2) Levenshtein distance ≤ 2: warns. (3) A shared substring of ≥ 5 characters: warns. An exact match to a list entry, after removing spaces, **fails**. Names of 6 characters or fewer are noisy under JW, so for them only exact match and Levenshtein ≤ 1 are decisive; a JW ≥ 0.88 hit becomes a warn. Every warn needs a recorded judgment. | 1 |
| GC-14 | **Phrase-pattern scan** | Regular expressions over UI and dialogue strings. Any match fails. Patterns: `/a wild .{1,30} appeared/`, `/it'?s super effective/`, `/it'?s not very effective/`, `/gotta catch/`, `/i choose you/`, `/wants to (fight|battle)!?$/`, `/would like to battle/`, `/(blacked|whited) out/`, `/what\? .{1,30} is evolving/`, `/\bfainted\b/` (the CD term is "went quiet"), `/\bteam [a-z]+\b/` in faction names. Also, if more than half of the encounter-text pool starts with "A wild", that is a warn (CD §3 pool rule). | 2 |
| GC-15 | **External or unmanifested asset scan** | List files in `src/`, `public/` and `dist/` with extensions `.png .jpg .jpeg .webp .gif .avif .svg .glb .gltf .fbx .obj .ktx2 .hdr .exr .mp3 .ogg .wav .flac .m4a .ttf .otf .woff .woff2`. Each must be in **`assets/manifest.json`** (shared with QA D-40), with `{path, origin: "generated"|"font-license"|"cc0", generator|licenseRef, sha256}`. Creatures and characters must be `generated`. A vendored OFL font (CD §7.2) needs a `font-license` entry plus its license in `CREDITS.md`. `cc0` entries are environment-only and must have a verified license reference. | 1 |
| GC-16 | **Preview and screenshot provenance** | Every image in `release/screenshots/`, `public/og*`, the `index.html` meta tags, the README and the Vercel preview metadata is listed in `release/screenshots/manifest.json` with `{file, scene, buildCommit, capturedBy: "scripts/capture-previews.ts", sha256}`. In deploy mode, `buildCommit` equals the deployed build commit. No manifest scene shows a GC-03-marked species. | Every deployment |
| GC-17 | **Gate record verification** (deploy mode; `scripts/gate/verify-gate-status.ts`) | See §3.6. | Every deployment |
| GC-18 | **LOD silhouette retention (D16)** | For every species at LOD1 and LOD2, on every profile: each part in `meta.silhouetteFeatures` still exists, possibly merged into a single draw call. Its projected bounding box at LOD2 keeps ≥ 70% of its LOD0 extent. The eyes exist, as quads at LOD2 (rendering §4.4). Triangle counts are reported against D16 (LOD0 ≤ 12k; stage-3 large ≤ 16k) as info; budgets are enforced by the rendering contract tests, not here. Draw calls above the v1 targets are a documented deviation (D16) and not a finding. | 2 |

### 3.4 Terminology denylist (v2)
The denylist is stored at `qa/denylist/terms.json`, shared with QA §9.3. QA owns the file format. This gate owns the tier assignments below. Its structure is `{tierA, tierB, projectRule, kindScoped: {character, ability, move, status}, creatureNames, allow}`.

Matching rules:
- Tier A multi-word and coined terms match as a **substring after normalization**.
- Short entries (5 characters or fewer) match only as a **whole word**.
- The `allow` list handles unavoidable false positives. Each exception names one file and one string and gives a written reason. It is reviewed at every gate.
- The full creature-name reference list is QA's `qa/denylist/franchise_names.txt`. The names listed below are its minimum content.
- The lists are **representative, not exhaustive**, and every report says so.

**Tier A: hard fail in player-facing text**

*Project rule (CD §9.1 AC1, stricter than genre usage):*
gym, badge, dex (whole word), trainer card, elite four, super effective, fainted, team rocket, PC Box, Hall of Fame (UI phrase). Also the status codes SLP, BRN, PSN, PAR and FRZ (whole word; D8 replaces them with SCH, BLT, JLT, DRW, RMB).

*Pokémon franchise, systems and places:*
Pokémon, Pokemon, Poké (prefix token), Poke Ball, Pokéball, Poké Ball, Great Ball, Ultra Ball, Master Ball, Premier Ball, Safari Ball, Pokédex, Pokedex, PokéCenter, Pokémon Center, Poké Mart, PokéMart, PokéNav, Pokégear, Pokétch, Poké Flute, Pokeflute, Rotom Phone, Pokérus, Pokéblock, Poffin, Poké Puff, Gym Leader, Gym Badge, Pokémon League, Pokémon Trainer, Pokémon Professor, Technical Machine, Hidden Machine, Technical Record, TM and HM (whole word), Mega Evolution, Mega Stone, Z-Move, Z-Crystal, Dynamax, Gigantamax, Max Raid, Terastal, Terastallize, Tera Type, Tera Raid, Team Aqua, Team Magma, Team Galactic, Team Plasma, Team Flare, Team Skull, Team Yell, Team Star, Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar, Paldea, Hisui, Pallet Town, Viridian, Pewter, Cerulean, Professor Oak, Ash Ketchum, Nurse Joy, Officer Jenny, Rare Candy, Exp. Share, Everstone, Max Revive, Full Restore, PP Up, Escape Rope. Also the company and brand names Game Freak, Nintendo, Creatures Inc. and The Pokémon Company.

*Other franchises:*
- Digimon: Digimon, Digital Monster, Digivolve, Digivolution, Digivice, DigiDestined, Digi-Egg, Digital World.
- Yo-kai Watch: Yo-kai, Yokai Watch, Yo-kai Medal.
- Temtem: Temtem, Tempedia, TemCard.
- Palworld: Palworld, Pal Sphere, Paldeck, Pal Box.
- Others: Coromon, Nexomon, Nexolink, Cassette Beasts, Monster Rancher, Monstie, Kinship Stone, Dragon Quest Monsters, Ooblets, Monster Sanctuary.

*Creature names (`creatureNames`; minimum set):*
Pikachu, Raichu, Pichu, Bulbasaur, Ivysaur, Venusaur, Charmander, Charmeleon, Charizard, Squirtle, Wartortle, Blastoise, Eevee and all its evolutions, Mewtwo, Mew, Jigglypuff, Snorlax, Gengar, Lucario, Riolu, Meowth, Psyduck, Magikarp, Gyarados, Dragonite, Dratini, Lapras, the legendary birds, Lugia, Ho-Oh, Rayquaza, Groudon, Kyogre, every starter line from all generations (for example Oshawott, Dewott, Samurott, Popplio, Brionne, Cinderace, Emboar), Venonat, Venomoth, Staraptor, Umbreon, Lumineon, Camerupt, Magmar, Magmortar, Bellsprout, Weepinbell, Victreebel. From other franchises: Agumon, Greymon, Gabumon, Patamon, Veemon, Guilmon, Renamon, Jibanyan, Komasan, Lamball, Cattiva, Chikipi, Foxparks, Smazee, Crystle, Toruga, Candevil, Bansheep, Mocchi, Suezo. Plus QA's full `franchise_names.txt`.

*Kind-scoped lists, matched only against that kind of display name as a whole-name exact match:*
- **character:** Oak, Elm, Birch, Rowan, Juniper, Sycamore, Kukui, Magnolia, Sada, Turo, Laventon, Willow, Ash, Misty, Brock, Gary, Blue, Red, Leon, Cynthia, Lance, Steven, Hop, Arven, Nemona, Penny, Ghetsis, Giovanni, Flint, Blaine, Roark, Byron, Joy, Jenny.
- **ability**, for trait display names: Sturdy, Reckless, Technician, Intimidate, Static, Blaze, Torrent, Overgrow, Swarm, Levitate, Flash Fire, Volt Absorb, Water Absorb, Clear Body, Super Luck, Regenerator, Guts, Pressure. D13 already renames `tr_reckless` to *Headlong* and `tr_sturdy_core` to *Keystone Core*.
- **move:** Thunderbolt, Thunder Shock, Flamethrower, Ember, Hydro Pump, Water Gun, Surf, Solar Beam, Vine Whip, Razor Leaf, Hyper Beam, Earthquake, Psychic, Ice Beam, Blizzard, Tackle, Quick Attack, Shadow Ball, Dragon Claw, Rock Slide, Protect, Brine, Avalanche.
- **status:** Burn, Poison, Paralysis, Paralyze, Sleep, Freeze, Frostbite, Confusion. These are warned rather than failed when used as generic words in descriptions, but they may not be the status display names (D8).

**Tier B: warn and record a judgment**
league, champion (the anchor id is allowed; the display term is *the Concordant*), trainer (ids allowed; the display term is *Tuner*), center or centre, mart, potion, revive, repel, ether, elixir, evolve or evolution (the display term is *Crescendo*), PP, power points, wild encounter, professor, orb (id only; the display term is *Chime*), ball (as a capture device), shake (in capture text; D9 uses rings), legendary, mythical, shiny, nature, ability, egg move, hidden ability, type chart, STAB, Key Stone or Keystone (Pokémon's Mega Evolution item; see §4.2 watchlist for the D13 name *Keystone Core*), Headlong (a Pokémon move is called "Headlong Rush").

A Tier B hit in player-facing text needs the CD's confirmation that the word is intended as generic English and is not that franchise's system name. Unresolved Tier B hits at Phase 7 are Major.

### 3.5 GC-07 silhouette specification (the single spec, D27)
1. **Route and pose.** Use `/?tool=silhouettes` with the production builder code (no special-case meshes). The pose is `idle` at t=0. Every material is `MeshBasicMaterial` black. Particles, sprites, lines, bloom and shadows are off. The background is white, and tone mapping is off.
2. **Views:**
   - **Battle 3/4:** perspective, FOV 35°, azimuth 30° off the creature's +Z facing, elevation 10°.
   - **Side:** orthographic, azimuth 90°. **Planar designs** may declare `meta.silhouetteSideYaw` (≤ 50°, matching the f09 battle yaw clamp in `creatures.md` §11). The declared angle replaces 90° for that species, and the report lists every species using it.
3. **Framing:** the bounding sphere's diameter fills 85% of the frame height.
4. **Sizes:**
   - `silhouettes_256.png`: 256×256 cells.
   - `silhouettes_20.png`: 20×20 cells, box-downsampled from 256 and thresholded at 50%. This version is **decisive**.
   - `silhouettes_20_native.png`: rendered natively at 20 px, DPR 1, antialias off. This is `creatures.md`'s worst case and is **warn-only**.
5. **Metric:** for every pair and view, D = 1 − IoU after aligning mask centroids and scaling both to equal height. The pair's score is its better (higher-D) view, but both views must meet the minimum fill. The report also gives fill, bbox aspect, centroid and the 256 px Hu-moment distance.
6. **Layout:** 10 rows (families) × 6 cells (3 stages × 2 views), with a 4 px gutter. Labels go in a separate strip. A **confusion strip** shows the 10 lowest-D pairs.
7. **Colour pass:** the GC-10 unlit render reuses the same cameras.
8. **Calibration:** at the Phase 3 gate, thresholds are frozen into `qa/evidence/baseline/char_thresholds.json`, with a review entry that explains any change from the provisional values in §3.3.

### 3.6 Gate record file: `design/reviews/gate_status.json`
```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "target": "phase",
      "phase": 3,
      "decision": "conditional_pass",
      "buildCommit": "<40-hex sha>",
      "date": "2026-10-15",
      "reviewer": "release-character-agent",
      "secondReviewer": "orchestrator",
      "orchestratorAck": "orchestrator",
      "automatedReport": { "path": "qa/evidence/phase_3/char/report.json", "sha256": "<hex>" },
      "manualReview": { "rubric": "qa/evidence/phase_3/char/rubric.csv", "screens": "qa/evidence/phase_3/char/screens/" },
      "reviewEntryAnchor": "design/reviews/character_consistency.md#p3-<sha7>",
      "conditions": [ { "id": "C-3-01", "finding": "F-3-04", "severity": "minor", "owner": "creature-art", "fixBy": 4 } ],
      "notRun": [ "Firefox browser check" ],
      "supersedes": null,
      "entryHash": "<sha256 of canonical JSON of this object without entryHash>"
    }
  ]
}
```
`target` is one of `"phase"`, `"preview"` or `"production"`.

Deploy-time verification (GC-17, `npm run gate:verify -- --target preview|production`). The deploy is refused unless **all** of the following hold:
1. The latest non-superseded entry for the target has an allowed decision:
   - **preview:** the latest phase entry, or a `preview` entry, is `pass` or `conditional_pass`.
   - **production:** a `phase: 7` or `production` entry is **`pass`**. `conditional_pass` is rejected.
2. The working tree is clean. `buildCommit` is either HEAD itself, or an ancestor of HEAD such that `git diff --name-only <buildCommit> HEAD` touches only `design/reviews/**`, `qa/evidence/**` and `release/screenshots/**`. The gate record sits on top of the build it certifies, and no code or data change may follow it.
3. The `entryHash` recomputes correctly: SHA-256 of the canonical JSON (sorted keys, no whitespace) of the entry without `entryHash`.
4. The automated report exists, its SHA-256 matches, its `status` is `pass`, and its `commit` equals `buildCommit`.
5. No condition has a `fixBy` earlier than the target phase.
6. The QA gate summary for the same commit (`qa/evidence/phase_N/summary.md`) exists and is not `fail`.

**Honesty note on "signed":** `entryHash` gives integrity (tamper evidence against accidental edits), not cryptographic authentication. No signing infrastructure exists here. If commit signing is enabled, rule 3 is extended with `git verify-commit` (Unresolved question 2).

### 3.7 npm scripts (requested from the integration owner; rendering §11 table)
```
"gate:character":         "tsx scripts/gate/character/index.ts",
"gate:character:release": "tsx scripts/gate/character/index.ts --release",
"gate:verify":            "tsx scripts/gate/verify-gate-status.ts",
"capture:review":         "tsx scripts/capture-review.ts --phase",
"capture:previews":       "tsx scripts/capture-previews.ts",
"licenses":               "license-checker --production --json --out qa/evidence/licenses.json",
"deploy:preview":         "npm run gate:verify -- --target preview && vercel deploy --prebuilt"
```
The exact Vercel invocation belongs to the orchestrator, who owns D28. The invariant is that `gate:verify` runs first and a non-zero exit stops the deploy.

---

## 4. Manual review protocol

### 4.1 Screenshot capture set
All captures come from `scripts/capture-review.ts` (Playwright, deterministic seed, fixed time of day unless stated otherwise). They are saved to `qa/evidence/phase_<N>/char/screens/` as `<scene>__<subject>__<profile>.png` at 1280×720, with phone captures at 390×844. Captures are never edited. If a scene has to be captured manually, it is marked `manual-capture` in `rubric.csv`.

| Scene ID | Content | Phases |
|---|---|---|
| S01 exploration_follow | Protagonist and lead kin, default camera, day | 1+ |
| S02 exploration_distance | Each in-scope wild species at 15 m (LOD1) and 30 m (LOD2), nameplate hidden | 2+ |
| S03 human_turnaround | Front, 3/4, side and back of the protagonist; from Phase 2 also Cass and the named NPCs | 1+ |
| S04 creature_turnaround | Each in-scope species: front, 3/4, side, back, face close-up | 1+ |
| S05 face_states | Each species across all 8 D14 states, face close-up, on High and Mobile | 1+ |
| S06 clip_strips | Each species: 6 frames per clip (8 clips) plus a 2 s WebM per clip | 1+ |
| S07 dialogue | Protagonist with an NPC, showing emotional poses and name tab | 2+ |
| S08 battle_intro / battle_menu / battle_hit / battle_faint | Staged battle in the current zone, 1v1, HUD visible | 3+ |
| S09 capture | Chime throw, 1–3 rings (D9), success chord and break-out, for each of the 4 Chime tiers | 3+ |
| S10 troupe_fosterage | Troupe of 6 and the Fosterage grid (icons and portraits) | 3+ |
| S11 kinsong | Verse list, verse detail and 3D viewer rotation (4 angles) for every in-scope species | 3+ |
| S12 crescendo | Before, mid and after for each built line | 3+ |
| S13 cantors_stillmark | Each Cantor in hall and at battle intro; Stillhands, Brann, Vey, Odile when in scope | 4+ |
| S14 loading_title | Title screen, continue screen, every loading-screen variant | 4+ |
| S15 lighting_matrix | 3 representative species × {day, dusk, night, cave, rain, snow, fog} | 6+ |
| S16 quality_matrix | S04 and S08 at High, Balanced and Mobile; reduced motion on | 6+ |
| S17 phone_layout | Battle, menu and Kinsong at 390×844 | 3+ |
| S18 deployment_previews | Every image in the screenshot manifest, the OG image, the favicon and the Vercel preview card | Every deployment |
| S19 silhouette_sheets | GC-07 outputs at 256 px, 20 px and native 20 px | 3+ |
| S20 roster_lineup | All in-scope species side by side at relative scale, neutral light | 2+ |

### 4.2 Genre fit vs recognizable imitation
The target is a game that **looks and feels like a polished creature-collecting RPG in the broad genre sense**: expressive, approachable, colorful, silhouette-driven and animation-forward. It must not become a **recognizable imitation** of any specific franchise.

**Broad genre conventions (allowed on their own, and in combination):**
- Large expressive eyes, rounded appealing juveniles, and a bigger head on early stages.
- Elemental anatomy motifs.
- Stages that grow larger and more elaborate.
- A starter trio of different elements, with a rival who takes the type-advantaged starter.
- A turn-based 1v1 menu.
- A collection encyclopedia, healing hubs, sequential challenge venues, a rival, a villain faction and a champion.

**Imitation signals (each one triggers review; any combination that is recognizable means redesign):**
- A design reproduces a specific character's **signature combination**.
- The capture device is a two-tone split sphere with a centre button, or the throw and wobble cadence and effects are copied. Chimes ring instead of shaking (D9).
- The UI reproduces a specific franchise layout, HP-bar styling, move grid, encyclopedia device, text box or battle phrasing.
- Status codes copy a franchise's abbreviations (D8).
- Names use a franchise's naming formula on near-identical concepts: the same suffix or prefix, the same type pairing and the same motif. Examples found so far: "-bell" on a bell plant, "-raptor" on a raptor bird.
- A trait set copies a franchise's abilities with the same names and numbers (D13).
- A faction copies a known villain team's goal, public face, uniform and methods (D6).
- A character's name plus role matches a franchise character's name plus role, for example a researcher named after a franchise professor.

**Tests the reviewer applies:**
1. **Three-feature rule.** List the design's distinctive (non-generic) features. If 3 or more match one specific existing character or group, the design must be redesigned (Critical). Two matches is Major if they are that character's signature features, otherwise a Note.
2. **Cover test.** Show the silhouette (S19) and the colored turnaround (S04) without name or context. If the reviewer's first association is a specific existing character, that is a finding, and the three-feature rule decides its severity.
3. **Franchise swap test** (for the whole presentation). Take the S08, S09, S10, S11 and S14 screenshots and remove the logo. Could a player mistake them for an official or fan product of a specific franchise? If yes, the finding is Critical.
4. **Known-risk watchlist**, checked at every gate where the subject is in scope:

| Subject | Must not become |
|---|---|
| **c07 Rippleback → c08 Tidesleek → c09 Floeguard** (otter water-starter line) | A shell on the chest or belly; a detachable shell or shell blade; a blue-and-cream otter with a scallop accessory. Floeguard (D7): **no helmet**, whiskers limited to two short nubs, shell only on the back and the tail fan. The three stages are reviewed together as a line. |
| **c01 Fizzkit line** (electric gliding lizard; formerly Voltra) | A yellow body with red cheeks; a zig-zag bolt tail; a neck frill or fan; rodent cues; a dragon-wing read. |
| **c04 Wickwool line** (fire ram calf; formerly Emberhorn) | A flame-tipped tail on a bipedal orange body; a round ball-sheep body; electric-wool cues. Magmouflon: no back crater or hump vent. |
| **c11 Lullstalk / c12 Belladrowse** (verdant/toxin bell line) | A bell-shaped head; pitcher-plant anatomy; any "-bell" suffix returning to a name. |
| **c16 Rimelet** | Prolegs or feelers (Snom). |
| **c15 Lodestodon** | Faces or noses on its satellites; a moustache or large nose. |
| **c23 Brineloop** | An external bubble helmet (Araquanid). |
| **c30 Coronaleen** (formerly Umbraleen) | Wings; a white or blue body; bat-wing or crescent-moon silhouettes; a dream or "awakening" story role (Wind Fish). |
| **The Stillmark** (D6) | A "free the creatures" goal; hoods; a chest emblem; pamphlets or sermons; stealing people's kin. The mark appears on lantern glass only. Also avoid an energy-corporation framing (Macro Cosmos, Team Galactic). |
| **Chime, Kinsong, Hearthrest** | A split-sphere Chime; a shake cadence; a red handheld encyclopedia; a pink-and-white clinic with an identical nurse in every town. |
| **Cast** | Shopkeepers or Hearthkeepers who are identical relatives (the Nurse Joy gag). Any named character whose name plus role matches a franchise character. |

Reviews are evidence-based. A finding cites the screenshot path and names the specific existing character or element involved. Shared generic traits alone do not establish copying. The reviews do **not** claim exhaustive originality or legal clearance.

### 4.3 Rubric
Score 1–5 per subject: each species and each named character, and each UI screen for Originality, Readability and Cohesion. Record scores in `rubric.csv` with the columns `subject, scene_refs, appeal, expressiveness, readability, originality, cohesion, notes, reviewer`.

| Score | Appeal | Expressiveness | Readability | Originality | Cohesion (with the roster and world) |
|---|---|---|---|---|---|
| 5 | Instantly likeable, memorable | Emotion clear in every state and clip, with personality in the idle | Identifiable at 20 px and 30 m | No resemblance noted beyond generic genre traits; a distinctive motif of its own | Unmistakably part of this world |
| 4 | Appealing, minor awkwardness | Emotions clear; one state weak | Identifiable at 20 px or 30 m, the other with effort | Only generic traits shared | Fits, with minor drift |
| 3 | Acceptable, generic | Emotions readable but stiff | Identifiable at gameplay distance only | One notable resemblance (2 non-signature features) to a specific character | Fits, but noticeably different treatment |
| 2 | Unappealing or off-putting in some way | Face or pose hard to read | Confusable with another species | Recognizable resemblance (signature features) | Clashes with the world or roster |
| 1 | Broken or unfinished look | No readable emotion | Unreadable blob or speck | Direct imitation | Looks like it belongs to another game |

**Thresholds:**
- Per subject: Appeal ≥ 3, Expressiveness ≥ 3 (creatures and named characters), Readability ≥ 3, **Originality ≥ 4**, Cohesion ≥ 3.
- Roster means from Phase 5 on: Appeal, Expressiveness, Readability and Cohesion each ≥ 3.5.
- Starters (c01, c04, c07), every stage-3 species, the protagonist, Cass and Rhea: Appeal ≥ 4.
- Originality 3 is Major. Originality 1–2 is Critical. Any other score below threshold is Major.

**Reviewer process:**
- At least two passes. The first is this agent reviewing the capture set. The second is the orchestrator, or any reviewer who is not the author of the design.
- If the two disagree by 2 or more on any axis, both write down their reasoning and the lower score stands until the design is revised.
- Every score cites at least one scene file.

---

## 5. Release checklist (deployment)

This applies to every deployment, including Vercel previews (D28). Items marked **(prod)** are additionally required for Phase 7 or any production deployment. Each item records one of `pass`, `fail`, `not_run` or `not_measured`, plus its evidence path. Release-level evidence goes under `qa/evidence/deploy_<target>/<sha7>/`.

| # | Item | Pass criteria / evidence |
|---|---|---|
| R-01 | Clean build from scratch | `git clean -xfd && npm ci && npm run build` succeeds on the gated commit in a fresh container. The build log is kept together with the Node and npm versions and the lockfile hash. |
| R-02 | Tests | `npm test` (vitest) passes, with pass, fail and skip counts recorded. No test is skipped unless its skip reason is listed. |
| R-03 | Data validation | `npm run validate-data` exits 0. There are no dangling IDs. Encounter probabilities are normalized. All 30 species are obtainable (the world obtainability matrix, D5). |
| R-04 | No placeholders; no dev tools | GC-03 passes in release mode. There are no `TODO`, `TBD` or `lorem` strings in UI. The `?tool=` harness and QA flags are **absent from production `dist/`** (their modules do not appear in any chunk) unless the build is an explicitly labelled `VITE_QA=1` QA preview. `window.__qa` is absent (QA B-30). |
| R-05 | Character checklist | CC-01 to CC-17 each pass, or are `not_applicable` with a reason. `gate:character --release` exits 0. |
| R-06 | Originality | GC-12, GC-13 and GC-14 pass. The §4.3 thresholds are met. There are no open Critical or Major originality findings. Every Tier B hit and GC-13 warn has a recorded judgment. |
| R-07 | Licensing (`CREDITS.md`) | `npm run licenses` output is committed. `CREDITS.md` lists every runtime dependency and its license, any vendored font with its license text, and states that the build contains no third-party art, models or audio (GC-15), or lists each with a verified license. There are no incompatible licenses (no GPL in the client bundle without the orchestrator's approval). |
| R-08 | Accessibility | Keyboard-only run-through of the title, new game, one battle, the menus, save and load. Reduced motion is honoured (GC-05 data plus a manual check). Text at 150% has no clipping in S17 layouts. Type, status (D8 codes plus shapes), HP band and effectiveness each have a non-color cue (CD §7.5). Body-text contrast is ≥ 4.5:1 in an axe-core Playwright run. Anything not performed is `not_run`. |
| R-09 | Performance | FPS, frame time, draw calls and triangles are reported **only for measured configurations** (rendering §7.1 reference configurations, D26), each naming its device, browser, profile and scene. Container numbers are labelled non-representative and never quoted. The laptop and phone targets are **Not measured** until run on hardware. The bundle size (`check:bundle`, rendering §6.3) is always measured. |
| R-10 | Persistence | Automated tests cover: save/load round-trip, migration from every prior schema version, backup-slot recovery, malformed JSON, quota exceeded, export/import round-trip (whose summary uses CD terms, for example "Keynotes"), the new-game confirmation, and reload mid-battle returning to the pre-battle checkpoint (D19). |
| R-11 | Browser checks | The Playwright Chromium smoke test (rendering §11 `smoke`) passes. Firefox, WebKit/Safari and real mobile browsers are recorded as `pass` with notes, or as **Not run**. They are never assumed. |
| R-12 | Previews and screenshots match the build | GC-16 passes. Preview images are regenerated by `npm run capture:previews` on the gated commit and reviewed in S18 against CC-09 to CC-15. This applies to previews too (§1.4). |
| R-13 | Full-story completion **(prod)** | The QA route M-01 to M-30 is complete on the gated commit, and SIM results are linked but labelled automated, not a playthrough. Playtime is labelled an estimate unless measured with playtesters (QA M-50). |
| R-14 | Names cleared **(prod)** | The title, region and the 30 species names have had the trademark and store check (CD §9.4 Q1, `creatures.md` AC10) done by the orchestrator and recorded. Until then, R-14 is `not_run`, which blocks production but not previews. |
| R-15 | Sourcemaps | Production `dist/` ships no `.map` files unless the orchestrator records a different policy. Previews follow the same rule. |
| R-16 | Gate decision | The review entry is appended. The `gate_status.json` entry exists for the target. `npm run gate:verify` passes. **Production requires `pass`.** The QA gate for the same commit is not `fail`. |

A deployment with any R item at `fail` is blocked. `not_run` or `not_measured` is allowed **only** for R-09 device targets, R-11 non-Chromium browsers and (for previews only) R-13 and R-14. Each such item must appear in the review entry and in any public notes that make performance, compatibility or naming statements.

---

## 6. Honesty rules

1. A check is marked `pass` only when it points to evidence produced **on the build commit under review**: a report file, log or capture. Results from earlier commits do not carry over.
2. If a check could not execute, it is `not_run`. If a metric could not be measured on the required configuration, it is `not_measured`. Both are written as such in the report, the review entry and any public claims. They are never omitted and never rounded up to `pass`.
3. A required `not_run` item means the gate fails (§2.2). The only exceptions are listed in §5.
4. Numbers are never interpolated, estimated or copied from another build. Performance figures always name the device, browser, profile and scene.
5. Screenshots and previews are captured from the running build by script, or manually with the capture recorded. They are never edited, composited from other builds, mocked up or produced by image generation.
6. Provisional thresholds are labelled as provisional until the calibration commit freezes them. Changing a threshold needs a review entry that explains the change. Thresholds are never loosened to let a failing build pass without the orchestrator's written approval in the review file.
7. Originality and name-similarity judgments state what was compared (which list, which metric) and how. They never claim exhaustive originality or legal clearance.
8. Rubric scores are the reviewer's judgment and are recorded as such. They are not described as user testing.

---

## 7. Acceptance criteria, dependencies, risks, unresolved questions

### 7.1 Acceptance criteria (for this gate being implemented)
- **AC-1:** `npm run gate:character -- --phase N` exists and implements GC-00 to GC-16 and GC-18. On a deliberately broken fixture set (`scripts/gate/character/__fixtures__`, run by `npm test`), it fails when:
  - (a) a species is removed
  - (b) a species is duplicated as a recolor
  - (c) a stage is a uniform 1.3× scale of the previous stage
  - (d) a clip is missing, or `contact` falls outside 40–55%
  - (e) a face state is identical to `open`, or the atlas has only 6 states
  - (f) "Pokédex", "fainted" or "PSN" is added to UI data
  - (g) a `.glb` is added to `public/`
  - (h) a `placeholder: true` species is added to an encounter table
  - (i) a silhouette-feature part is dropped at LOD2
  - (j) a species display name is set to "Venomantle" (retired, fails GC-13) (a regression fixture for the Phase 0 finding)
- **AC-2:** Silhouette sheets are deterministic: two runs produce identical hashes.
- **AC-3:** `gate:verify` refuses in each of these cases, each covered by a test: no matching entry; a `fail` entry; a `conditional_pass` with target production; code changes after `buildCommit`; a report hash mismatch.
- **AC-4:** `design/reviews/character_consistency.md` has one entry per gate, following the template, with evidence paths that resolve.
- **AC-5:** The capture script produces the §4.1 scene set for the requested phase, and lists any scene it could not capture as `not_run`.

### 7.2 Dependencies
| From | What this gate needs |
|---|---|
| Orchestrator (`DECISIONS.md`) | Binding rulings (D6–D16, D27, D28). Adding the npm scripts and the Vercel preview wiring. Acknowledging each gate entry. Names the second reviewer. The trademark and store name check (R-14). The sourcemap policy (R-15). |
| Creative Director (`creative_direction.md`) | **Per-body-plan proportion bands** (CC-05, GC-08). The human pose and clip set. The display-term glossary (GC-12). D8 status names in UI. Battle phrasing and an encounter pool that passes GC-14. D6 Stillmark text. D7 names (Marra Aske, Hollis or its replacement, see the Phase 0 re-review). |
| Creature Art Director (`creatures.md`) | D7 names and designs (Lullstalk, Emberfold, Coronaleen, Floeguard without helmet). `meta.silhouetteFeatures` and optional `silhouetteSideYaw` per species. `clipDurations` and `contactT` per species. An 8-state face spec (D14). A rename for any name that fails GC-13 (see the re-review). |
| Rendering Engineer (`rendering_and_architecture.md`) | The builder contract (§3.2) with the injectable texture factory. The `?tool=` routes (silhouettes, faces, surface), excluded from production (D28). D14 atlas cell sizes. D16 LOD rules with silhouette-feature retention. The builder-rendered portrait cache. The rendering §11 script table updated to call this gate. |
| Systems / World | Data file locations for the scans and reachability checks: `src/data/content/**`. D10 item ids. D13 trait display names. |
| QA Lead (`qa_plan.md`) | Shared `qa/denylist/terms.json` and `franchise_names.txt`. The shared evidence root. `assets/manifest.json` (D-40). B-30. The M-route (R-13). Agreeing that GC-07 replaces the C-02 thresholds (D27). |

### 7.3 Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Procedural builders produce generic "capsule creatures" that pass the automated checks but lack appeal | High: the core promise | Manual rubric thresholds and Appeal ≥ 4 for key characters. Review S04 to S06 from Phase 1 on c01. |
| Silhouette thresholds are poorly calibrated | Medium | Provisional until the Phase 3 calibration. Separate within-family thresholds. The confusion strip always gets manual review. |
| Structure-hash gaming: tiny added parts make a recolor "unique" | Medium | Jaccard rules, silhouette D thresholds and manual review. Hashes alone are never sufficient. |
| Name-similarity noise: JW over-flags short names and under-flags suffix patterns | Medium | Three metrics, a short-name rule, a manual pattern review (§4.2) and recorded judgments |
| Denylist false positives on common English words | Low to Medium | Tier A/B split, kind-scoped lists, whole-word matching for short entries and a reasoned allow list |
| The denylist is incomplete | Medium | QA's full name list, similarity metrics and the manual three-feature review. Reports say "not exhaustive". |
| Headless software WebGL differs from GPU rendering | Low for masks; Medium for palette and face | Unlit masks and tolerant thresholds. Phase 6 needs hardware captures, or those items are `not_run`. |
| One developer plus AI reviewers means the review is not independent | Medium | Two-pass review with the lower score standing, cited evidence and limited originality claims (§6) |
| Preview URLs leak before names are cleared | Medium | Previews carry no store or marketing metadata. R-14 blocks production. Preview metadata still passes GC-12, GC-13 and GC-16. |

### 7.4 Unresolved questions
1. **Proportion bands per body plan** (Phase 0 finding F-0-10): the CD has not yet published them. CC-05 and GC-08 stay warn-only until it does.
2. **Commit signing** (GPG or SSH) is not known to be available. Until it is, `gate_status.json` integrity relies on `entryHash` plus git history.
3. **Unnamed NPCs:** may they share archetype builders with variation? The proposal is yes, with a minimum of 6 archetypes. D6 and the Nurse Joy watch item apply: variants must not read as identical relatives.
4. **Kinsong portraits:** live renders, or a build-time generated cache? This affects GC-11 and GC-15.
5. **Second reviewer:** who serves when the orchestrator authored a design?
6. **QA `VITE_QA=1` previews:** may a QA-labelled preview be deployed at all, and if so, with no public link? QA Unresolved question 10.
