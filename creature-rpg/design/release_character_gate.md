# Release and Character Consistency Gate

Owner: Release and Character Consistency Agent (role G in `design/MASTER_PROMPT.md`)
Status: Draft v1, 2026-09-24. Binding once the orchestrator accepts it.
Binding inputs: `design/MASTER_PROMPT.md` and `design/ANCHORS.md`. Where this document relies on details still being written in parallel (the Creative Director's character language, the Creature Art Director's roster, the Rendering Engineer's registry API, and the QA Lead's phase gates), it states an **interface assumption**. Every assumption is repeated under Dependencies.

---

## 0. Scope and summary

This gate enforces the project's character direction from Phase 1 through public deployment. It covers the look, behaviour and naming of creatures, trainers, NPCs and supporting cast. It also covers every surface where they appear and every image that leaves the build (previews, screenshots, social or OG images).

It has three layers:

1. **Automated gate**: `npm run gate:character`. Deterministic checks (§3) run on every phase candidate build and in the deploy pipeline. Any hard failure exits non-zero.
2. **Manual review**: a screenshot capture list per phase and a scored rubric (§4). Reviewers can look at captured images, but the gate never produces or accepts generated images or external reference art.
3. **Decision record**: an entry appended to `design/reviews/character_consistency.md`, plus a machine-readable entry in `design/reviews/gate_status.json`. The deploy script verifies that JSON entry (§1.4, §3.6).

Constraints carried over from the anchors, which this gate also enforces:
- All creature and character models are procedural TypeScript builders. The build contains no downloaded meshes, textures or audio, no DCC exports and no AI-generated images.
- Each of the 30 species has its own builder with its own anatomy. A recolor or uniform rescale does not count as a species.
- Animation is procedural per-part clips: `idle`, `move`, `attack`, `hit`, `capture`, `faint`, `victory`.

---

## 1. Mandate and authority

### 1.1 What this agent decides
For each phase gate (Phases 1–7) and for each deployment, this agent issues exactly one decision:

| Decision | Meaning | Effect |
|---|---|---|
| `pass` | Every automated hard check passes. Every in-scope manual checklist item meets its threshold. There are no open findings of severity Major or higher. | The phase may close. Deployment is allowed. |
| `conditional_pass` | Every automated hard check passes. There are no Critical or Major findings. At most 5 open Minor findings remain, each with an owner and a fix-by phase. The limits in §1.3 apply. | The phase may close. Deployment is allowed. The conditions are carried forward and re-verified at the next gate. |
| `fail` | Any automated hard check fails, any Critical or Major finding is open, any manual threshold is missed, or evidence is missing for an in-scope item. | **Blocks the phase and blocks deployment** until the problem is corrected **and retested** with a new record on a new build commit. |

"Not run" is not a decision. If a required check could not run, the decision is `fail`, unless the check is explicitly `not_applicable` for that phase under §2.2.

### 1.2 Finding severities
| Severity | Definition | Examples |
|---|---|---|
| Critical | Recognizable imitation of another franchise, a denylisted term in the build, or an external or unverified asset in the build | A creature reads as a specific existing character. The UI text contains "Pokédex". A downloaded .glb is present. |
| Major | The character direction is broken for a visible character, or roster integrity is broken | A placeholder is reachable in-game. Two species share a structure signature (a recolor). A face is unreadable in battle. A clip is missing. |
| Minor | A cosmetic inconsistency that does not break readability or originality | A slight palette drift between the encyclopedia and battle lighting. The victory pose timing on one species is off. |
| Note | An observation with no action required | |

### 1.3 Limits on conditional passes
- A condition may carry forward at most **one** further gate. If it is still open at that gate, it becomes Major, which makes that gate a `fail`.
- For **Phase 7 and any public production deployment**, a condition may not touch a checklist item marked **[Release-critical]** in §2. Those items require `pass`.
- No condition may be waived by the implementing agent. Only a new gate record on a new build commit can close it.

### 1.4 Relationship to other gates
- The QA Lead's phase gate (`design/qa_plan.md`) and this gate are **both** required. A phase closes only when both pass or conditionally pass.
- The orchestrator is the deployment authority, but it may not deploy over a `fail` from this gate. It may commission a redesign, or it may dispute a finding in writing in the review file. A disputed finding stays blocking until a new record resolves it.
- Deploy tooling (`npm run deploy`) mechanically refuses to deploy unless `design/reviews/gate_status.json` contains a valid `pass` or `conditional_pass` entry for the target phase whose `buildCommit` is the deployed commit, or its direct ancestor with only review and report changes after it (§3.6).

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
- the reviewer
- a list of the checks that were **Not run** or **Not measured**

Evidence paths follow this convention:

```
reports/gate/character/<commit>/report.json          automated gate output
reports/gate/character/<commit>/report.md            human-readable rendering of report.json
reports/gate/character/<commit>/silhouettes_256.png  silhouette sheet, normal size
reports/gate/character/<commit>/silhouettes_20.png   silhouette sheet, 20 px thumbnails
reports/gate/character/<commit>/silhouette_pairs.csv pairwise difference matrix
reports/gate/character/<commit>/structure_hashes.json
reports/review/<phase>/<commit>/screens/*.png        manual-review captures (§4.1)
reports/review/<phase>/<commit>/rubric.csv           rubric scores (§4.3)
```

`reports/` is committed for gate commits only, or attached to the release. The review entry must point at files that actually exist.

---

## 2. Character consistency checklist

Legend for the "How checked" column:
- **A**: automated inside `gate:character`, with the check ID from §3.
- **S**: manual review of captured screenshots or clips.
- **A+S**: both are required.

The "From phase" column gives the first gate at which the item applies. Before that phase the item is `not_applicable`.

| # | Item | Pass criteria | How checked | From phase |
|---|---|---|---|---|
| CC-01 | **Expressive, appealing creature designs** [Release-critical] | Every in-scope species scores **Appeal ≥ 3** and **Expressiveness ≥ 3** on the §4.3 rubric. The roster mean is ≥ 3.5 on each. Each species shows at least 3 visibly distinct emotion states in battle (neutral, attack or determined, hurt). | S (rubric) and A (GC-04 checks that the emotion textures exist) | 1 (c01), then all built species |
| CC-02 | **Appealing, readable trainer and NPC designs** [Release-critical] | The protagonist, rival, antagonist faction members, six trial leaders, champion and named NPCs each score Appeal ≥ 3 and Readability ≥ 3. Each role is identifiable by silhouette and costume color block alone, with the role name hidden. | S, plus A (GC-02 checks registry completeness for characters) | 1 (protagonist), 2 (town NPCs), 4 (trial leaders), 5 (all) |
| CC-03 | **Silhouette readability at gameplay distance** | At the default exploration camera distance, rendered at 1280×720, a wild creature standing 15 m from the camera shows head, body mass and at least one signature feature (horn, tail, fin, wing, crest). The reviewer can name the species from the capture alone, without the nameplate, for at least 90% of in-scope species. | S (distance captures §4.1) and A (GC-07 at 256 px) | 2 |
| CC-04 | **Silhouette readability at thumbnail (20 px) scale** [Release-critical] | On the 20 px silhouette sheet, every species meets the GC-07 thresholds. On visual review, no two species in **different families** are confusable. Family members may share a motif but must differ in outline. | A (GC-07) and S (sheet review) | 3 |
| CC-05 | **Consistent proportions** | Each species follows the Creative Director's proportion bands for its stage and body-scale class. The proposed bands are stage 1 head:body 1:1.2–1:2, stage 2 1:1.8–1:3, stage 3 1:2.5–1:4; the final values belong to the CD. Human characters follow the CD's head-height ratios. Deviations need a documented rationale in `design/creatures.md`. | A (GC-08 measures head and body bounding boxes from named parts) and S | 2 |
| CC-06 | **Facial readability** [Release-critical] | Eyes and mouth are readable at battle camera distance in the Mobile quality profile. Each eye's highlight is visible, and the eye area covers ≥ 2.5% of the face-on bounding box at 256 px. Face textures are never mip-blurred below legibility, which the rendering LOD rules in GC-09 ensure. Faces survive every lighting preset: day, dusk, night, cave and each weather state. | A (GC-04, GC-09) and S (lighting captures) | 1 |
| CC-07 | **Color grouping** | Each species uses its 2–3 dominant colors from `design/creatures.md`. Measured over the rendered front and side views under neutral lighting, those colors cover ≥ 70% of opaque pixels, with accents ≤ 15%. Type identity is never conveyed by color alone: there is always an icon or text as well. | A (GC-10 palette sampling) and S | 2 |
| CC-08 | **Consistent animation language** | Every species has all 7 clips (GC-05). Clip timing follows the CD's shared rules, for example an anticipation-action-recovery structure for attacks, and hit reactions that start ≤ 2 frames after impact. Family members share a family motion motif: a rhythm or signature gesture. Reduced-motion mode swaps to the documented reduced variants. | A (GC-05 checks presence, duration bounds and part references) and S (clip playback captures) | 1 |
| CC-09 | **Coherent presentation across surfaces** [Release-critical] | Each species and character is the same model, palette, face and scale class in exploration, battle, party menu, storage, encyclopedia 3D viewer, evolution scene, loading screens and deployment previews. No surface uses a 2D stand-in drawn differently from the 3D model. Portraits and icons are rendered from the model by the portrait generator. | A (GC-11 confirms each surface uses the same builder ID) and S (cross-surface capture set) | 3 |
| CC-10 | **Original names** [Release-critical] | No species, character, move, item, location or system name appears on the denylist (GC-12). No species name has Jaro-Winkler similarity ≥ 0.88 to a denylisted creature name (GC-13). Any name flagged by GC-13 at 0.80–0.88 gets a recorded manual judgment. | A and S | 1 |
| CC-11 | **Original anatomy and silhouettes** [Release-critical] | No design shares **3 or more distinctive (non-generic) features** with one specific existing franchise character (the three-feature rule, §4.2). On the "cover test", no reviewer's first association is a specific existing character. | S | 1 |
| CC-12 | **Original iconography and terminology** [Release-critical] | Type icons, the capture-device look, the encyclopedia frame, status icons, the currency symbol and menu glyphs are procedurally drawn and original. The capture device is not a two-tone split sphere with a centre button. UI copy passes GC-12 and GC-14 (phrase patterns). System names such as trials, encyclopedia and teaching discs use the CD's original terms. | A (GC-12, GC-14, GC-15) and S | 2 |
| CC-13 | **No recognizable imitation of Pokémon or any other specific franchise** [Release-critical] | Originality scores ≥ 4 for every character and UI screen on the §4.3 rubric. There are zero Critical findings. The overall presentation passes the §4.2 "franchise swap test": it cannot be mistaken for another franchise. | S | 1 |
| CC-14 | **No placeholder characters in release builds** [Release-critical] | From Phase 5 on: zero registry entries with `placeholder: true`, zero fallback-builder usages, no debug materials. Before Phase 5: placeholders are allowed only if flagged and **unreachable** from encounters, trainers, rewards, previews and the encyclopedia (GC-03). | A | 1 (reachability), 5 (zero) |
| CC-15 | **No violating deployment assets or previews** [Release-critical] | Every image shipped or published (OG or social image, README or store screenshots, favicon, loading-screen art) comes from the gated build commit, is listed in the screenshot manifest, contains no placeholder, and passes CC-09 through CC-13. The build contains no external or unmanifested binary assets. | A (GC-15, GC-16) and S | Every deployment |
| CC-16 | **Evolution identity** | Each stage 2 and 3 species keeps the family motif: at least one shared anatomical motif **and** one shared color, as documented. Each stage also changes anatomy, meaning its part topology differs (GC-06). A stage is never a uniform scale of the previous one. | A (GC-06) and S (the evolution-scene capture) | 3 (built lines), 5 (all) |
| CC-17 | **Emotional pose and behaviour consistency** | The follower creature and battle idle show each species' documented personality: its idle cadence and a signature fidget within 10 s of idle. Trainers use the CD's emotional pose set in dialogue. | S | 2 |

### 2.1 Phase scope (minimum character content reviewed at each gate)
| Phase | Minimum in-scope characters | Surfaces reviewed |
|---|---|---|
| 1 Movement & visual foundation | Protagonist, c01 (lead or follower), silhouette tooling operational | Exploration |
| 2 First inhabited area | + the three stage-1 starters (c01, c04, c07), every species in the first zone's encounter table, town_1 NPCs, rival (design) | Exploration, dialogue |
| 3 Core gameplay slice | + every species reachable in the slice, the capture device, a species with evolution | Exploration, battle, capture, party, encyclopedia viewer, evolution |
| 4 Early campaign | + trial_1 and trial_2 leaders, antagonist grunt, all species reachable before trial_2 | + trials, loading screens |
| 5 Complete campaign | **All 30 species, all named characters, zero placeholders** | All surfaces |
| 6 Atmosphere & polish | All, under every lighting and weather state and every quality profile | All, plus quality and reduced-motion variants |
| 7 Release validation | All, re-verified on the release candidate commit | All, plus deployment previews |

### 2.2 `not_applicable` rule
An item or check may be `not_applicable` only for the phase reason given in the "From phase" column or §2.1. The report must state that reason. Anything else that did not execute is `not_run`, and a `not_run` required item means `fail`.

---

## 3. Automated gate: `npm run gate:character`

### 3.1 Execution model
- Entry point: `scripts/gate/character/index.ts`, run with `tsx`. It has two stages:
  - **Node stage**: registry, data, structure hashing, clips, text scans, file scans. This stage needs no WebGL. It relies on builders being pure functions that take an injectable texture factory (see Dependencies).
  - **Browser stage**: silhouettes, palettes, face-area measurements and surface checks. Playwright with the preinstalled headless Chromium, software WebGL, loads `/gate.html`, a dev-only entry that renders species in isolation with a fixed camera, flat unlit silhouette material and neutral lighting. Software rendering is acceptable here because these are image-content checks, not performance checks.
- Output: `reports/gate/character/<commit>/report.json` plus the artifacts in §1.5. Each check result is `{id, status: pass|fail|warn|not_run|not_applicable, severity, details, evidence[]}`.
- Exit code: `1` if any check is `fail`, or if any required check is `not_run`. Otherwise `0`. A `warn` never blocks, but it must be listed in the review entry.
- Flags:
  - `--phase N` selects the §2.1 scope and phase-dependent strictness.
  - `--release` equals Phase 7 strictness.
  - `--update-baseline` is forbidden in CI and only rewrites the calibration file under `reports/gate/baseline/`.
- Determinism: fixed seeds, a fixed camera, and a fixed pose (`idle` at t=0). The same commit must produce byte-identical `structure_hashes.json` and pixel-identical silhouette sheets. GC-00 checks this by running the render twice on 3 species.

### 3.2 Interface assumptions (to be confirmed by the Rendering Engineer and Creature Art Director)
```ts
// src/creatures/registry.ts
export type ClipName = 'idle'|'move'|'attack'|'hit'|'capture'|'faint'|'victory';
export type Emotion  = 'neutral'|'happy'|'determined'|'hurt'|'fainted'|'surprised'|'blink'; // final set owned by CD
export interface SpeciesEntry {
  id: `c${string}`;                  // c01..c30
  familyId: `f${string}`; stage: 1|2|3;
  build(ctx: BuildContext): THREE.Group;   // pure; named parts via part.userData.role
  clips: Record<ClipName, ClipDef>;        // parameter curves over part roles
  face: { emotions: Record<Emotion, FaceTextureDef> };
  palette: { dominant: string[]; accent?: string[] };  // hex, from creatures.md
  placeholder?: boolean;
}
export const speciesRegistry: Record<string, SpeciesEntry>;
// src/characters/registry.ts — same shape for trainers/NPCs (id `ch_...`), clips per CD.
```
Part roles use a closed vocabulary: `body`, `head`, `jaw`, `eye_l`, `eye_r`, `ear_*`, `horn_*`, `tail_<n>`, `limb_<fl|fr|bl|br|…>`, `wing_*`, `fin_*`, `crest`, `shell`, `accessory_*`.

### 3.3 Check list
| ID | Check | Pass criterion | Blocking from |
|---|---|---|---|
| GC-00 | **Determinism self-test** | Two renders or hashes of the same 3 species are identical | 1 |
| GC-01 | **Species registry completeness** | Exactly 30 entries, IDs `c01`..`c30`. The family and stage for each match the anchors (f01 = c01–c03 … f10 = c28–c30). Every ID in `data/creatures.json` has a registry entry and vice versa. Each `build` is a distinct function: no two entries share the same function reference or the same `build.toString()` hash. | Presence of entries for in-scope IDs from 1. All 30 from 5 |
| GC-02 | **Character registry completeness** | Every trainer and NPC ID referenced by `data/trainers.json` and `data/dialogue.json` has a character builder, or a documented shared NPC archetype builder for unnamed NPCs (named characters must be unique). There is exactly one protagonist entry. | 2 |
| GC-03 | **Placeholder detection and reachability** | Placeholder markers are: `placeholder: true`; use of `buildPlaceholder` or any builder whose name matches `/placeholder|fallback|debug|temp|stub/i`; names matching `/^(todo|tbd|test|temp|placeholder|xxx|missing)/i` or containing `lorem ipsum`; debug materials (`#ff00ff`, `#00ff00` at full saturation used as a base color); `MeshNormalMaterial`. **Phases 1–4**: every marked entry must be unreachable. That means it is not referenced by encounters, trainer parties, gift or reward tables, evolution targets of non-placeholder species, previews, or the title or loading screens. **Phase 5+ and `--release`**: zero marked entries. | 1 (reachability), 5 (zero) |
| GC-04 | **Face textures and emotion states** | Every in-scope species and named character defines every required emotion (§3.2). Each `FaceTextureDef` renders without error to a canvas of at least 256×256. Each rendered emotion differs from `neutral` by ≥ 3% of pixels. This stops copy-pasted, identical emotion states. | 1 |
| GC-05 | **Animation clips present and valid** | All 7 clips exist for each species, and characters have the CD-defined set. Every curve targets a part role that exists in that species' built hierarchy. There are no NaN or Infinity keys. Duration bounds (seconds): idle 1.5–6 (looping; first and last pose equal within 1e-3), move 0.4–1.5 (looping), attack 0.5–1.8, hit 0.2–0.6, capture 0.6–2.0, faint 0.8–2.5 (ends in a rest pose with no part below ground, y ≥ 0), victory 0.8–3.0. Every clip has a reduced-motion variant or is declared motion-safe. | 1 |
| GC-06 | **Distinct part-structure signature (anti-recolor)** | For each species, build at t=0 and compute (a) a **topology signature**: the sorted multiset of `(role, geometryKind, parentRole, childCount)` tuples, and (b) a **shape signature**: for each part, its bounding-box extents normalized by the whole model's bounding-box height and quantized to 0.05, together with its vertex count bucket (log2). **Materials, colors and uniform scale are excluded.** Hash each with SHA-256. Rules: (1) all 30 combined hashes are unique. (2) All topology hashes are unique within each family: stages must differ in anatomy, not just proportion. (3) For any pair of species, the Jaccard similarity of their role multisets must be ≤ 0.85, or the pair must have an approved exemption recorded in the review file. At most 3 exemptions, only for stage 2/3 of the same family, and never cross-family. | 3 (built species), 5 (all) |
| GC-07 | **Silhouette sheets and pairwise difference** | Render each species as an unlit black mask in two canonical views: side (camera on +X) and three-quarter (35° yaw, 10° pitch). Pose is `idle` at t=0, and the model is scaled to fit a square frame with 8% padding. Generate `silhouettes_256.png` (256×256 cells) and `silhouettes_20.png` (20×20 cells, box-downsampled from 256, then thresholded at 50%). For every species pair and view, compute the difference D = 1 − IoU after centroid alignment. **Thresholds (provisional; calibrate once at the Phase 3 gate, then freeze in `reports/gate/baseline/thresholds.json`):** D₂₅₆ ≥ 0.15 and D₂₀ ≥ 0.10 for every cross-family pair, and D₂₅₆ ≥ 0.10 and D₂₀ ≥ 0.06 within a family. At 20 px, each silhouette covers between 15% and 75% of the cell. This rejects both specks and blobs. The view with the higher D counts for the pair, but both views must pass the minimum fill. Output `silhouette_pairs.csv`, listing the 10 closest pairs in the report. | 3 |
| GC-08 | **Proportion measurement** | Compute the head and body bounding boxes from the `head` and `body` role subtrees, and report the head:body height ratio and the eye-to-head width ratio. Warn when a value falls outside the CD band for its stage (§2 CC-05). Fail only when the head or body role is missing. | 2 (warn), 5 (fail on missing roles) |
| GC-09 | **Face legibility across quality and LOD** | For each quality profile (High, Balanced, Mobile) and the battle camera preset, render each species face-on at 1280×720. The eye region, measured from `eye_l`/`eye_r` screen-space bounds, is ≥ 12 px tall. Face texture sampling uses anisotropy or mip bias as specified by the rendering doc, so the rendered eye highlight stays distinct: its luminance delta to the surrounding iris is ≥ 0.25. No quality profile may drop face textures or eye parts. | 3 (Balanced), 6 (all profiles) |
| GC-10 | **Palette adherence** | Render with neutral lighting and ACES off. Cluster opaque pixels with k-means (k = 6) and map the clusters to the declared palette in CIEDE2000 (ΔE ≤ 12). The dominant colors must cover ≥ 70%, and undeclared colors must be ≤ 15%, excluding the eyes and mouth region. Also report any two **cross-family** species whose dominant palette sets match within ΔE ≤ 8 on all colors (this is a warning; the manual reviewer decides). | 2 (warn), 5 (fail) |
| GC-11 | **Cross-surface identity** | Instrumented dev build: open each surface in scope (§2.1) through test routes (`/gate.html?surface=battle&species=c07`, …). Assert that the rendered species or character group came from the same registry `build` with the same palette hash. Portrait and icon images must be produced by the portrait generator from the builder. Fail if any surface loads a static image for a creature or character that is not in the generated portrait cache. | 3 |
| GC-12 | **Terminology denylist scan** | Scan all strings in `data/**/*.json`, `src/**/*.{ts,tsx}` string literals and JSX text, `index.html`, `public/**` text files (manifest, meta), `README.md`, `CREDITS.md`, and the deployment metadata (OG title and description). Before matching, normalize: Unicode NFKD, strip diacritics, lowercase, collapse `[\s\-_.'’]`. **Tier A** matches fail. **Tier B** matches warn and require a recorded manual judgment. See §3.4. Code comments and `design/**` are excluded from failure but reported as info. The scanner's own denylist file is excluded. | 1 |
| GC-13 | **Name similarity scan** | For every species, character, move, item and location display name, compute the Jaro-Winkler similarity to each Tier A creature and character name (normalized as in GC-12). A score ≥ 0.88 fails. A score of 0.80–0.88 warns and needs a manual judgment. Also fail on any exact match to a Tier A name after removing spaces. | 1 |
| GC-14 | **Phrase-pattern scan** | Regular expressions over UI and dialogue strings for franchise-signature phrasing: `/a wild .{1,30} appeared/`, `/it'?s super effective/`, `/it'?s not very effective/`, `/gotta catch/`, `/(^|\W)go!? .{1,20}!.*i choose you/`, `/i choose you/`, `/wants to fight!?$/`, `/blacked out/`, `/whited out/`, `/what\? .{1,30} is evolving/`. Any match fails. The CD supplies the original battle phrasing. | 2 |
| GC-15 | **External/unmanifested asset scan** | List all files in `src/`, `public/` and `dist/` with extensions `.png .jpg .jpeg .webp .gif .avif .svg .glb .gltf .fbx .obj .ktx2 .hdr .exr .mp3 .ogg .wav .flac .m4a .ttf .otf .woff .woff2`. Each one must appear in `assets.manifest.json` with `{path, origin: "generated"|"font-license"|"cc0", generator|licenseRef, sha256}`. Creatures and characters must be `generated`. Fonts need a license entry in `CREDITS.md`. Any `cc0` entry must be environment-only and carry a verified license reference. Per the anchors there should be none, because downloads are blocked. `dist/` must also contain no source maps that embed third-party art. | 1 |
| GC-16 | **Preview/screenshot provenance** | Every image in `release/screenshots/` and `public/og*`, and every image referenced by `index.html` meta tags or README, must be listed in `release/screenshots/manifest.json` with `{file, scene, buildCommit, capturedBy: "scripts/capture-previews.ts", sha256}`. Its `buildCommit` must equal the commit under test when `--release` or deploy mode is used. No manifest scene may show a placeholder species (checked against GC-03). | Every deploy |
| GC-17 | **Gate record verification** (deploy mode only; run by `npm run deploy` via `scripts/gate/verify-gate-status.ts`) | See §3.6. | Every deploy |

### 3.4 Terminology denylist (initial version)
Stored at `scripts/gate/character/denylist.json` as `{tierA: string[], tierB: string[], creatureNames: string[], allow: {term: string, context: string, reason: string}[]}`. Matching:
- Tier A is matched as a **substring after normalization** for multi-word and coined terms (for example `pokedex`), and as a **whole word** for short names (at most 5 characters) to avoid false positives.
- The `allow` list handles unavoidable false positives. Each exception is specific to one file and one string and has a written reason, for example a species description that uses the common English word "whisper". The allow list is reviewed at every gate.

The list is deliberately representative, not exhaustive. Name similarity (GC-13) and manual review (§4) cover the rest.

**Tier A: hard fail (franchise names and distinctive coined terms)**

*Pokémon: franchise, systems and places*
Pokémon, Pokemon, Poké, Poke Ball, Pokéball, Poké Ball, Great Ball, Ultra Ball, Master Ball, Premier Ball, Pokédex, Pokedex, PokéCenter, Pokémon Center, Poké Mart, PokéMart, PokéNav, Pokégear, Pokétch, Rotom Phone, Pokérus, Pokéblock, Poffin, PokéPuff, Poké Puff, Gym Leader, Gym Badge, Elite Four, Pokémon League, Pokémon Trainer, Pokémon Professor, Technical Machine, Hidden Machine, Technical Record, Mega Evolution, Mega Stone, Z-Move, Z-Crystal, Dynamax, Gigantamax, Max Raid, Terastal, Terastallize, Tera Type, Tera Raid, Team Rocket, Team Aqua, Team Magma, Team Galactic, Team Plasma, Team Flare, Team Skull, Team Yell, Team Star, Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar, Paldea, Hisui, Pallet Town, Viridian, Pewter, Cerulean, Professor Oak, Ash Ketchum, Nurse Joy, Officer Jenny, Rare Candy, Exp. Share, Everstone, Max Revive, Full Restore, PP Up, HM01.

*Pokémon: well-known creature names*
Pikachu, Raichu, Pichu, Bulbasaur, Ivysaur, Venusaur, Charmander, Charmeleon, Charizard, Squirtle, Wartortle, Blastoise, Eevee, Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon, Sylveon, Mewtwo, Mew, Jigglypuff, Snorlax, Gengar, Haunter, Gastly, Lucario, Riolu, Meowth, Psyduck, Magikarp, Gyarados, Dragonite, Dratini, Onix, Geodude, Machamp, Ditto, Lapras, Articuno, Zapdos, Moltres, Lugia, Ho-Oh, Celebi, Togepi, Togekiss, Chikorita, Cyndaquil, Typhlosion, Totodile, Treecko, Torchic, Blaziken, Mudkip, Swampert, Gardevoir, Ralts, Rayquaza, Groudon, Kyogre, Turtwig, Chimchar, Piplup, Garchomp, Snivy, Tepig, Oshawott, Samurott, Zorua, Zoroark, Chespin, Fennekin, Froakie, Greninja, Rowlet, Litten, Incineroar, Popplio, Mimikyu, Grookey, Scorbunny, Cinderace, Sobble, Wooloo, Corviknight, Sprigatito, Fuecoco, Quaxly, Koraidon, Miraidon, Shinx, Luxray, Growlithe, Arcanine, Vulpix, Ninetales, Ponyta, Rapidash, Absol, Tyranitar, Larvitar, Bidoof, Wooper, Slowpoke, Cubone, Marill, Azumarill, Chansey, Blissey, Rotom.

*Digimon*
Digimon, Digital Monster, Digivolve, Digivolution, Digivice, DigiDestined, Digi-Egg, DigiEgg, Digital World, Agumon, Greymon, WarGreymon, Gabumon, Garurumon, MetalGarurumon, Patamon, Angemon, Gatomon, Tentomon, Palmon, Gomamon, Biyomon, Veemon, Guilmon, Renamon, Terriermon, Omnimon, Imperialdramon.

*Yo-kai Watch*
Yo-kai, Yokai Watch, Yo-kai Medal, Yo-kai Pad, Jibanyan, Komasan, Usapyon, Robonyan, Blazion, Shogunyan.

*Temtem*
Temtem, Tempedia, TemCard, Tamer (as "Temtem Tamer"), Smazee, Crystle, Platypet, Tateru, Mimit, Saipat, Oree, Airan Islands.

*Palworld*
Palworld, Pal Sphere, Paldeck, Pal Box, Lamball, Cattiva, Chikipi, Foxparks, Depresso, Pengullet, Anubis (as a creature name: whole-word, data only), Lifmunk, Jetragon.

*Coromon / Nexomon / Cassette Beasts / Monster Rancher / Monster Hunter Stories / Dragon Quest Monsters / Ooblets / Monster Sanctuary / Shin Megami Tensei*
Coromon, Spinner (as a capture device term: whole-word, UI only), Toruga, Cubzero, Nidrobe, Nexomon, Nexolink, Cassette Beasts, Candevil, Bansheep, Traffikrab, Monster Rancher, Mocchi, Suezo, Monstie, Kinship Stone, Rider (as "Monster Rider"), Dragon Quest Monsters, Slime Knight, King Slime, Ooblets, Oobnet, Monster Sanctuary, Spectral Familiar, Jack Frost, Pyro Jack, Mothman (as a creature name), Cait Sith (as a species name: whole-word, data only).

**Tier B: warn and record a manual judgment (generic words with a strong franchise meaning in this genre)**
gym, badge, dex, TM, HM, league, champion (allowed as the fixed anchor ID `champion`; the display name is the CD's choice), trainer (allowed in code and IDs; the display term is the CD's choice), center or centre (as in a healing "center"), mart, potion, revive, ether, elixir, evolve or evolution (allowed as a generic term; check the phrasing against GC-14), PP, "power points", "wild encounter", "professor", "rival" (generic; allowed), "orb" (the functional term from the brief; display name from the CD), "ball" (as a capture device), "legendary", "mythical", "shiny" (as a color-variant system term), "nature" (as a stat-modifier term), "ability" (as the passive-trait term), "egg move", "hidden ability", "type chart", "STAB".

A Tier B hit in **player-facing** text needs the CD's confirmation that the term is intended generic English and is not used as that franchise's system name. Unresolved Tier B hits at Phase 7 are Major.

### 3.5 Silhouette sheet layout
One PNG per size. Rows are the 10 families; columns are stage 1, 2, 3, each shown in both views, so each row has 6 cells. There is a 4 px gutter and species IDs as a text strip under each row, rendered separately so that labels never touch the masks. A **cross-family confusion strip** lists the 10 lowest-D pairs side by side for quick manual review.

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
      "orchestratorAck": "orchestrator",
      "automatedReport": { "path": "reports/gate/character/<sha>/report.json", "sha256": "<hex>" },
      "manualReview": { "rubric": "reports/review/phase3/<sha>/rubric.csv", "screens": "reports/review/phase3/<sha>/screens/" },
      "reviewEntryAnchor": "design/reviews/character_consistency.md#p3-<sha7>",
      "conditions": [ { "id": "C-3-01", "finding": "F-3-04", "severity": "minor", "owner": "creature-art", "fixBy": 4 } ],
      "notRun": [ "Firefox browser check" ],
      "supersedes": null,
      "entryHash": "<sha256 of canonical JSON of this object without entryHash>"
    }
  ]
}
```
Deploy-time verification (GC-17, `scripts/gate/verify-gate-status.ts`). The deploy is refused unless **all** of the following hold:
1. The latest non-superseded entry for the target (`phase` N, or `deploy`) has decision `pass` or `conditional_pass`.
2. The working tree is clean. `buildCommit` is either HEAD itself, or an ancestor of HEAD such that `git diff --name-only <buildCommit> HEAD` touches only `design/reviews/**`, `reports/**` and `release/screenshots/**`. The gate record is committed on top of the build it certifies, and no code or data change may follow it.
3. The `entryHash` recomputes correctly: SHA-256 of the canonical JSON (sorted keys, no whitespace) of the entry without `entryHash`.
4. The automated report file exists and its SHA-256 matches, its own `status` is `pass`, and its `commit` field equals `buildCommit`.
5. For production or public deployment: `target: "deploy"` or `phase: 7`, and `conditions` contains no release-critical item (§1.3).
6. No condition has a `fixBy` earlier than the target phase.

**Honesty note on "signed"**: `entryHash` gives integrity (tamper evidence against accidental edits), not cryptographic authentication. No signing key infrastructure exists in this environment. If the orchestrator enables GPG or SSH commit signing, rule 3 is extended to `git verify-commit` on the gate commit (see Unresolved questions).

### 3.7 npm scripts (to be added by the integration owner)
```
"gate:character": "tsx scripts/gate/character/index.ts",
"gate:character:release": "tsx scripts/gate/character/index.ts --release",
"gate:verify": "tsx scripts/gate/verify-gate-status.ts",
"capture:review": "tsx scripts/capture-review.ts --phase",
"capture:previews": "tsx scripts/capture-previews.ts",
"predeploy": "npm run gate:verify"
```

---

## 4. Manual review protocol

### 4.1 Screenshot capture set
All captures come from `scripts/capture-review.ts` (Playwright, deterministic seed, fixed time of day unless the capture specifies otherwise). They are saved to `reports/review/<phase>/<commit>/screens/` as `<scene>__<subject>__<profile>.png` at 1280×720, and phone captures at 390×844. Captures are never hand-edited. If a scene cannot be captured automatically, a human captures it manually and records it as `manual-capture` in `rubric.csv`.

| Scene ID | Content | Phases |
|---|---|---|
| S01 exploration_follow | Protagonist and lead creature, default camera, day | 1+ |
| S02 exploration_distance | Each in-scope wild species at 15 m and 30 m, nameplate hidden | 2+ |
| S03 protagonist_turnaround | Front, 3/4, side and back of the protagonist; also the rival and named NPCs from Phase 2 | 1+ |
| S04 creature_turnaround | Each in-scope species: front, 3/4, side, back, face close-up | 1+ |
| S05 emotion_sheet | Each species across all emotion states, face close-up | 1+ |
| S06 clip_strips | Each species: 6 frames per clip (idle, move, attack, hit, capture, faint, victory) at even intervals, plus a 2 s WebM per clip | 1+ |
| S07 dialogue | Protagonist with an NPC in dialogue, showing emotional poses and portrait | 2+ |
| S08 battle_intro / battle_menu / battle_hit / battle_faint | Staged battle in the current zone, 1v1 | 3+ |
| S09 capture | Capture device throw, capture success and failure, for each of the 4 device tiers | 3+ |
| S10 party_storage | Party of 6 and storage grid (icons and portraits) | 3+ |
| S11 encyclopedia | Entry list, entry detail and 3D viewer rotation (4 angles) for every in-scope species | 3+ |
| S12 evolution | Before, mid and after for each built line | 3+ |
| S13 trial_leaders | Each trial leader in venue and in battle intro | 4+ |
| S14 loading_title | Title screen, continue screen, every loading-screen variant | 4+ |
| S15 lighting_matrix | 3 representative species × {day, dusk, night, cave, rain, snow, fog} | 6+ |
| S16 quality_matrix | S04 and S08 at High, Balanced and Mobile; reduced-motion on | 6+ |
| S17 phone_layout | Battle, menu and encyclopedia at 390×844 | 3+ |
| S18 deployment_previews | Every image in the release screenshot manifest, plus OG image and favicon | Every deploy |
| S19 silhouette_sheets | GC-07 outputs at 256 and 20 px | 3+ |
| S20 roster_lineup | All in-scope species side by side at relative scale, neutral light | 2+ |

### 4.2 Genre fit vs recognizable imitation
The target is a game that **looks and feels like a polished creature-collecting RPG in the broad genre sense**. Its creatures are expressive, approachable, colorful, silhouette-driven and animation-forward. It must not become a **recognizable imitation** of any specific franchise.

**Broad genre conventions (allowed on their own, and in combination)**:
- Large expressive eyes, rounded, appealing forms, and a bigger head on early stages.
- Elemental anatomy motifs: flames on horns, fins, crystalline growths, leaf ears.
- Stages that grow larger and more elaborate.
- A starter trio of different elements.
- A turn-based 1v1 menu with attack and item choices.
- Collection encyclopedia, healing hubs, sequential challenge venues, a rival and a villain team.

**Imitation signals (each one triggers review; any combination that is recognizable means redesign)**:
- A design reproduces a specific character's **signature combination**. Example: a yellow electric rodent with red cheek circles and a lightning-bolt tail. Example: an orange bipedal fire lizard with a flame-tipped tail.
- The capture device is a two-tone split sphere with a central button, or the throw and wobble sequence copies that franchise's cadence and effects.
- The UI reproduces a specific franchise layout: HP bars with the same shape and placement and the same name and level boxes, the same four-color move grid, the same encyclopedia device frame, or the same text-box style and battle phrasing (GC-14).
- Names use a franchise's recognizable naming formula applied to near-identical concepts, or score near-duplicates on GC-13.
- Type identity uses another franchise's exact type color assignments together with its icon shapes.
- A trainer or character matches a specific protagonist's costume signature, such as a cap plus a vest plus a fingerless-glove combination in the same colors.

**Tests the reviewer applies**:
1. **Three-feature rule**: list the distinctive, non-generic features of the design. If 3 or more match one specific existing character, the design must be redesigned (Critical). Two matches is Major if they are that character's *signature* features, otherwise a Note.
2. **Cover test**: show the silhouette (S19) and the colored turnaround (S04) without name or context. If the reviewer's first association is a specific existing character, that is a finding, and the three-feature rule decides its severity.
3. **Franchise swap test** (for the whole presentation): take the S08, S10, S11 and S14 screenshots and remove the logo. Could a player familiar with a specific franchise mistake them for an official or fan product of that franchise? If yes, the finding is Critical.
4. **Known-risk watchlist**, checked at every gate:
   - **Rippleback** (water otter): a shell element on the chest or belly, or a blue-and-cream otter palette with a scallop-shell accessory, would read as a specific existing water-otter starter. Its shell plating must stay on the tail and use a distinct palette and anatomy.
   - **Voltra** (electric gliding lizard): avoid a yellow body with red cheeks, a lightning-bolt tail silhouette, and orange-and-yellow electric rodent cues.
   - **Emberhorn** (fire ram calf): avoid a flame-tipped tail on a bipedal orange body. Horn glow is fine.
   - **Capture device, encyclopedia device, healing hub building**: highest imitation risk among system iconography.

Reviews are evidence-based. A finding cites the screenshot path and names the specific existing character or element involved. Shared generic traits alone do not establish copying. The reviews do **not** claim exhaustive worldwide originality or legal clearance.

### 4.3 Rubric
Score 1–5 per subject: each species, each named character, and each UI screen for Originality and Readability. Record scores in `rubric.csv` with the columns `subject, scene_refs, appeal, expressiveness, readability, originality, cohesion, notes, reviewer`.

| Score | Appeal | Expressiveness | Readability | Originality | Cohesion (with the roster and world) |
|---|---|---|---|---|---|
| 5 | Instantly likeable, memorable | Emotion clear in every state and clip, with personality in the idle | Identifiable at 20 px and 30 m | No resemblance noted beyond generic genre traits; a distinctive motif of its own | Unmistakably part of this world |
| 4 | Appealing, minor awkwardness | Emotions clear; one state weak | Identifiable at 20 px or 30 m, the other with effort | Only generic traits shared; nothing reminiscent of a specific character | Fits, with minor drift |
| 3 | Acceptable, generic | Emotions readable but stiff | Identifiable at gameplay distance only | One notable resemblance (2 non-signature features) to a specific character | Fits, but noticeably different treatment |
| 2 | Unappealing or off-putting in some way | Face or pose hard to read | Confusable with another species | Recognizable resemblance to a specific character (signature features) | Clashes with the world or roster |
| 1 | Broken or unfinished look | No readable emotion | Unreadable blob or speck | Direct imitation | Looks like it belongs to another game |

**Thresholds**:
- Per subject: Appeal ≥ 3, Expressiveness ≥ 3 (creatures and named characters), Readability ≥ 3, **Originality ≥ 4**, Cohesion ≥ 3.
- Roster means from Phase 5 on: Appeal ≥ 3.5, Expressiveness ≥ 3.5, Readability ≥ 3.5, Cohesion ≥ 3.5.
- Starters (c01, c04, c07), all stage-3 species, the protagonist, the rival and the champion: Appeal ≥ 4.
- Originality 3 is Major, which blocks the gate until a redesign is made. Originality 1–2 is Critical.
- Any other single score below threshold is Major.

**Reviewer process**:
- At least two passes. The first is this agent reviewing the capture set. The second is the orchestrator, or any reviewer who is not the author of the design. If the two disagree by 2 or more on any axis, both write down their reasoning and the lower score stands until the design is revised.
- Reviewers look at the captures, and at the WebM clips for expressiveness. Every score must cite at least one scene file.

---

## 5. Release checklist (deployment)

Applies to every deployment. The items marked **(prod)** are additionally required for Phase 7 or any public production deployment. Each item records one of `pass`, `fail`, `not_run` or `not_measured`, plus its evidence path.

| # | Item | Pass criteria / evidence |
|---|---|---|
| R-01 | Clean build from scratch | `git clean -xfd && npm ci && npm run build` succeeds on the gated commit in a fresh container. Keep the log at `reports/release/<sha>/build.log`, along with the Node and npm versions and the lockfile hash. |
| R-02 | Unit and simulation tests | `npm test` (vitest) passes. The count of passed, failed and skipped tests is recorded. No test may be skipped unless its skip reason is listed. |
| R-03 | Data validation | `npm run validate:data` (zod schemas plus reference validation) exits 0. There are no dangling IDs across creatures, moves, types, items, encounters, zones, quests, dialogue, trainers and progression. Encounter probabilities are normalized. All 30 species are obtainable (the World doc's obtainability check). |
| R-04 | No placeholders | GC-03 passes in release mode. This includes UI strings (`TODO`, `TBD`, `lorem`) and dev-only routes, which must be excluded from `dist/`: `/gate.html` must not be present in production output. |
| R-05 | Character checklist | CC-01 through CC-17 each pass, or are `not_applicable` with a reason. `gate:character --release` exits 0. |
| R-06 | Originality | GC-12, GC-13 and GC-14 pass. The §4 rubric thresholds are met. There are no open Critical or Major originality findings. Every Tier B hit has a recorded judgment. |
| R-07 | Licensing (`CREDITS.md`) | `CREDITS.md` lists every runtime dependency with its license, generated by `npx license-checker --production --summary` or equivalent and committed. It lists any font with its license text. It states that the build contains no third-party art, models or audio (GC-15), or lists each one with a verified license. It lists no incompatible licenses (no GPL in the bundled client unless the orchestrator approves). |
| R-08 | Accessibility | Keyboard-only run-through of the title, new game, one battle, the menus, save and load. The reduced-motion setting is honoured: GC-05 variants plus a manual check. Text scales to 150% without clipping in S17 layouts. Type and status information is never conveyed by color alone, so every icon has a shape and label. Camera sensitivity setting works. Contrast for body text ≥ 4.5:1, measured by an axe-core Playwright run. Results are recorded, and any check not performed is marked `not_run`. |
| R-09 | Performance | FPS, frame time, draw calls, triangles and load payload are reported **only for measured configurations**, and each figure names its device, browser, quality profile and scene. Headless Chromium software-rendering numbers are labelled "CI software renderer: not representative". The 60 FPS mid-range laptop and 30 FPS phone targets are marked **Not measured** unless measured on those devices. The payload size (`dist/` gzip total) is always measured. |
| R-10 | Persistence | Automated tests cover save/load round-trip, version migration from every prior schema version, backup-slot recovery from a corrupted primary, malformed JSON handling, quota-exceeded handling, export/import round-trip, the new-game overwrite confirmation, and a reload during a battle transition (only committed state is restored). |
| R-11 | Browser checks | Playwright Chromium smoke test (boot, new game, move, battle, capture, save, reload, continue) passes. Firefox, Safari/WebKit and real mobile browsers are recorded as `pass` with notes, or as **Not run**. They are never assumed. |
| R-12 | Preview/screenshots match build **(prod)** | GC-16 passes. All preview images were regenerated by `npm run capture:previews` on the gated commit and reviewed in S18 against CC-09 through CC-15. |
| R-13 | Full-story completion **(prod)** | The QA Lead's new-game-to-champion route is complete on the gated commit, and the evidence is linked. The playtime is labelled an estimate unless it was measured with real playtesters. |
| R-14 | Gate decision | The review entry is appended. The `gate_status.json` entry is written for `target: "deploy"` (or Phase 7). `npm run gate:verify` passes. The QA gate for the same commit is `pass` or `conditional_pass`. |

A deployment with any R item at `fail` is blocked. `not_run` or `not_measured` is allowed **only** for R-09 device targets and R-11 non-Chromium browsers. It must appear in the review entry and in any public release notes that make performance or compatibility statements.

---

## 6. Honesty rules

1. A check is marked `pass` only when it points to evidence produced **on the build commit under review**: a report file, log or capture. Results from earlier commits do not carry over.
2. If a check could not execute, it is `not_run`. If a metric could not be measured on the required configuration, it is `not_measured`. Both are written as such in the report, in the review entry, and in any public claims. They are never silently omitted and never rounded up to `pass`.
3. A required `not_run` item means the gate fails (§2.2). The only exceptions are the R-09 and R-11 items listed in §5.
4. Numbers are never interpolated, estimated or copied from a similar build. Performance figures always name the device, browser, profile and scene.
5. Screenshots and previews are captured from the running build by script, or manually with the capture recorded. They are never edited, composited from other builds, mocked up or produced by image generation.
6. Automated thresholds that are "provisional" are labelled that way in the report until the calibration commit freezes them. Changing a threshold needs a review entry that explains the change. Thresholds are never loosened to make a failing build pass without the orchestrator's written approval in the review file.
7. Originality judgments state what was compared and how. They never claim exhaustive originality or legal clearance.
8. Rubric scores are the reviewer's judgment and are recorded as such. They are not described as user testing.

---

## 7. Acceptance criteria, dependencies, risks, unresolved questions

### 7.1 Acceptance criteria (for this gate being implemented)
- AC-1: `npm run gate:character --phase N` exists and implements GC-00 through GC-16. On a deliberately broken fixture branch it fails when:
  - (a) a species is removed
  - (b) a species is duplicated as a recolor, meaning a palette change only (GC-06)
  - (c) a stage is a uniform 1.3× scale of the previous stage (GC-06)
  - (d) a clip is missing
  - (e) an emotion texture is identical to neutral
  - (f) the string "Pokédex" is added to UI data
  - (g) a `.glb` is added to `public/`
  - (h) a `placeholder: true` species is added to an encounter table

  The fixture suite lives in `scripts/gate/character/__fixtures__` and is run by `npm test`.
- AC-2: Silhouette sheets at 20 and 256 px are produced deterministically: two runs give identical hashes.
- AC-3: `npm run deploy` refuses when `gate_status.json` has no matching valid entry, when the entry is `fail`, when HEAD contains code changes after `buildCommit`, or when the report hash mismatches. Each of these is verified by a test.
- AC-4: `design/reviews/character_consistency.md` holds one entry per gate, following the template, with evidence paths that resolve.
- AC-5: The review capture script produces the §4.1 scene set for the requested phase and lists any scene it could not capture as `not_run`.

### 7.2 Dependencies
| From | What this gate needs |
|---|---|
| Creative Director (`creative_direction.md`) | Proportion bands, the emotion set, animation timing rules, UI terminology (original names for trials, encyclopedia, capture device, teaching discs), battle phrasing, capture-device and icon design language, and the trainer costume signatures |
| Creature Art Director (`creatures.md`) | Final names, palettes (hex), part-role vocabulary per species, family motifs, silhouette notes, and a per-species originality audit to cross-check against §4.2 |
| Rendering Engineer (`rendering_and_architecture.md`) | The registry API (§3.2); pure builders with an injectable texture factory, so they can run in Node; the `gate.html` dev entry excluded from production; quality profiles; face texture LOD rules; the portrait generator |
| Systems / World designers | Data file locations and schemas for the string scans and reachability (encounters, trainers, rewards, evolution) |
| QA Lead (`qa_plan.md`) | Phase gate alignment, the full-story route (R-13), persistence and browser tests (R-10, R-11), bug severity mapping to §1.2 |
| Orchestrator | Adding the npm scripts; wiring `predeploy`; acknowledging every gate entry; deciding on commit signing |

### 7.3 Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Procedural builders produce generic "capsule creatures" that pass the automated checks but lack appeal | High: the core promise | Manual rubric thresholds and Appeal ≥ 4 for key characters. Review S04, S05 and S06 from Phase 1 on c01, so the style is proven early. |
| Silhouette thresholds are poorly calibrated: they reject valid family resemblance or accept near-duplicates | Medium | Thresholds are provisional until the Phase 3 calibration. Within-family thresholds are separate. The closest-pairs strip always gets manual review. |
| Structure-hash gaming: tiny added parts make recolors "unique" | Medium | Role-multiset Jaccard ≤ 0.85, plus the silhouette D thresholds, plus manual review. Hashes alone are never sufficient. |
| Denylist false positives on common English words | Low to Medium | Tier A/B split, whole-word matching for short names, and a context-specific allow list with reasons |
| Denylist is incomplete | Medium | Similarity scan, phrase patterns and a manual three-feature review. The list is described as representative, not exhaustive. |
| Headless software WebGL renders differ from GPU rendering | Low for masks, Medium for palette and face | Masks are unlit binary. Palette and face checks use tolerant thresholds. Phase 6 needs manual captures on real hardware, or those items are marked `not_run`. |
| Single developer plus AI reviewers means the review is not independent | Medium | Two-pass review, the lower score stands, evidence citations required, and the originality claims are limited as stated in §6 |
| The gate slows iteration | Low | The Node stage runs in seconds. The browser stage runs per phase gate and in CI nightly, not on every commit. |

### 7.4 Unresolved questions
1. The final emotion-state set and the proportion bands belong to the CD. §3.2 and CC-05 use proposals until the CD confirms them.
2. Commit signing (GPG or SSH) is not known to be available. Until it is, `gate_status.json` integrity relies on `entryHash` plus git history. Should the orchestrator enable signed gate commits?
3. Are intermediate phase deployments public or private previews? This proposal applies the same gate to both. Private previews could relax CC-15 and R-12, subject to the orchestrator's decision.
4. Unnamed NPCs: may they share archetype builders with variation (proposed yes, with a minimum of 6 archetypes), or must every NPC be unique?
5. Encyclopedia portraits: are they rendered live or pre-generated at build time into `assets.manifest.json` as `generated`? This affects GC-11 and GC-15.
6. Who serves as the second reviewer when the orchestrator authored a design?
7. Should Tier B terms such as "champion" and "trainer" be replaced in player-facing text by original terms (CD decision), or kept as generic English?
