# Review — Creature Art Director

Reviewer: Creature Art Director (owner of `design/creatures.md`, "CR"). Date: 2026-09-24.
Scope: `creative_direction.md` (CD), `systems.md` (SY), `world.md` (WD), `rendering_and_architecture.md` (RA), `qa_plan.md` (QA), `release_character_gate.md` (RG), read against CR v1. I also read the existing `reviews/creative_director.md` and `reviews/world_designer.md` so as not to contradict decisions already taken. Only this file was written.

Severity: **blocker** means implementation or a gate cannot proceed as written. **major** means the docs contradict each other, or a check will produce wrong results. **minor** means local wording or data needs fixing. The palette numbers in §1.2 are CIELAB values I computed from the CR hex values with a script (sRGB→Lab, D65). No renders, tests or benchmarks were run.

## 0. Decisions in one place (what CR v2 will adopt)
- **Stats:** SY bands and derived fields win (catch rate, XP yield, growth, evolution levels). Four BSTs are adjusted in §2.1.
- **Traits:** one canonical `tr_*` per species (§2.2). CR's invented trait names are withdrawn.
- **Faces:**
  - RA's 8-cell atlas is canonical, as already agreed in CD review row 17.
  - Per-family CD eye classes (§1.1).
  - CD pupil whitelist: slit and W-shaped pupils are removed.
  - Brows and mouths are meshes or atlases, never painted decals.
- **Timing:** CR clip ranges are kept, as CD review row 21 decided, with `contact` ≤ 0.6 s. Capture reaction ≤ 250 ms feeds the shared absorb (§5, R-QA-2).
- **Palettes:** 13 species fail CD §5.4 value or saturation rules. The fixed hex values are in §1.2.
- **Scale:** c30 shortened to 4.8 m, c19 raised to H 0.40 m (CD §5.1 scale continuity).
- **Habitats:** WD encounter placement is canonical, apart from two exceptions requested in §3.
- **Silhouette tooling:** RG GC-07 is the single procedure. CR §7.1 becomes supplementary. **Blocker for RG:** the flat and gliding species fail the side-view minimum fill (R-RG-1).

---

## 1. creative_direction.md

| # | CD § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| CD-1 | §5.1 vs CR §4 | Several head ratios fall outside the final bands (CD review row 20: 0.33–0.50 / 0.25–0.38 / 0.18–0.29; the long-axis rule applies to SR/FL/FT) | CD 9.1.8, RG CC-05 / GC-08 | GC-08 warnings, and a stage read that is off-model | minor | **Accept the bands.** The fixes are in §7.2. I ask CD to extend the long-axis rule to **RB and RD** classes as well (c10, c13, c19, c22–c24), because a fused head/body makes height ratios meaningless there. Until then, CR v2 documents these as deviations (RG CC-05 allows that). |
| CD-2 | §5.1 scale continuity | c30 is 5.5 m long, over the 3.2× teen limit (~4.8–5.0 m at a 1.5–1.55 m teen; CD gives no absolute height). c19 extent is 0.35 m, under the 0.25× floor (≈0.39 m) | CD §5.1; RA 2.7 stage fit | Battle stage overflow; follower too small to read | minor | c30 → length **4.8 m**, H **1.75 m**. c19 → H **0.40 m**. CD should state the teen height in metres and say that the rule measures the **longest bbox extent** (otherwise c13, c16, c22 and c28 at H 0.25–0.30 m also fail). |
| CD-3 | §5.2 eye classes | CR varies eye shape within a family (c01 round → c02 almond → c03 long-almond). CD requires one class per family, unique within a mass group | CD §5.1 family continuity | Family read weakens across stages | major | **Accept.** The per-family class table is in §1.1. Maturity is shown by `lidCoverage` and brow angle, not by a class change. |
| CD-4 | §5.2 pupils | CR uses **slit** (c17, c18) and **W** (c24) pupils, which are not on CD's whitelist. The h-bar is allowed for ungulates only, but CR also uses it on the cephalopods c22–c23 | CD §5.2 | Off-guide faces | minor | c17/c18 → vertical ellipse 1:2.2. c24 → h-bar. **Ask CD** to allow h-bar for cephalopods (f08), since it is true of the real animal. c30 takes the lumen/shade **ring** pupil. |
| CD-5 | §5.2 sclera / ΔL* ≥ 40 | CR has sclera-less eyes (c06, c07, c13, c15, c18) | CD §5.2 layer 1, §5.4 eye contrast | Eye/face contrast check may fail | minor | c07 and c13 gain a thin off-white sclera ring (E1). **Ask CD** to allow an exception for c06, c15 and c18, whose emissive iris on a dark face meets ΔL* ≥ 40 by construction. RA's 4.5:1 atlas check still applies. |
| CD-6 | §5.2 brows and mouth | CD: brows and mouths are meshes. CR uses painted brows and `M` decal mouths on ~20 species. RA 4.4 uses a mouth **atlas** (4 cells) | CD §5.2, RA 4.4 | Three approaches, and a builder contract mismatch | major | CR v2: every headed species gets brow meshes (a capsule ridge that rotates per emotion). Mouths = `jaw` mesh where CR lists one, otherwise RA's 4-cell mouth atlas on a paddedDisc. **CD must accept the atlas mouth** (a mesh mouth-set per species is ~30× extra modelling). f09 keeps cut-out slits. |
| CD-7 | §5.4 colour | 11 species fail ΔL* ≥ 25 between their two most-used colours. c22 and c23 have two colours with chroma > 60 | CD §5.4, RG CC-07/GC-10 | Muddy value read at 20 px, and a saturated clash | major | Fixed hex values in §1.2 (computed). |
| CD-8 | §5.4 emissive ≤ 1.5 "before bloom" vs RA `glow` 1.5–3.0 vs CR attack flares 2.5–4.0 | Three emissive caps | CD §5.4, RA 4.3 | Bloom blow-out, or gate disputes | minor | Rest emissive ≤ 1.5 (CD). Transient flares ≤ 3.0 for ≤ 250 ms around `contact` only (fits RA's glow class). CR clamps its 3.5–4.0 values to 3.0. |
| CD-9 | §8.6 cry params | CD says the cry records are "authored in creatures.md"; CR v1 has none | CD §8.6, RA 4.1 `cry` field | Audio has no data | **major (CR gap)** | Proposed params are in §7.3 (every stage-to-stage drop is at least 5 semitones, checked). They go into CR v2. |
| CD-10 | §5.7 item 3 | "Sleeping giant blocker" is on the imitation list. c12 Belladrowse is a large sleepy creature | CD §5.7 | Snorlax-like use if world scripts it as a path blocker | minor | c12 must never be used as a sleeping obstacle or scripted blocker (a WD/CD rule). It is evolution-only in WD, which is fine. |
| CD-11 | §4.1 gift levels (Lv 25 / Lv 30 stage 1) | A stage-1 starter handed over above evolution level Lv 16 evolves at the first battle end | SY 8.3 | An awkward instant Crescendo | minor | Gift as **stage 2** at the stated level, or at Lv 15 stage 1. CD/WD choose. |
| CD-12 | §2.2, §3, §5.7 | Old names Voltra/Emberhorn remain | CR §1 | Stale text | minor | Already accepted in CD review row 16. No further action. |

### 1.1 Per-family eye classes (my assignment under CD §5.2)
Mass group = the CD mass class of stage 1. Classes are unique within each group.

| Family | Mass group | Class | Pupil |
|---|---|---|---|
| f01 | long-low | E2 Almond | vertical ellipse |
| f02 | pear | E5 Keystone | h-bar |
| f03 | long-low | E1 Round | round |
| f04 | ball | E4 Half-moon | round |
| f05 | ball | E5 Keystone | round (c15 vertical ellipse) |
| f06 | long-low | E3 Teardrop | vertical ellipse |
| f07 | ball | E1 Round | round |
| f08 | pear | E2 Almond | h-bar (pending CD-4) |
| f09 | upright | E3 Teardrop (cut-out holes) | none (lit hole) |
| f10 | ball | E3 Teardrop | round; c30 ring |

### 1.2 Palette fixes (CIELAB L*/C* computed)
The pair shown is the two most-used colours. "→" gives the replacement hex, with the resulting ΔL*.

| id | Problem | Fix | New ΔL* |
|---|---|---|---|
| c05 | coat `#8E2F22` L34 vs mane `#3B2B26` L19, ΔL* 15 | coat → `#B5502F` (L47) | 28 |
| c10 | moss L64 vs face L74, ΔL* 10 | moss → `#6E9444`, face → `#E3D2AC` | 28 |
| c11 | moss L48 vs bells L53, ΔL* 6 | moss → `#3A6128`, bells → `#C98BDB` | 29 |
| c12 | canopy L35 vs bells L42, ΔL* 7 | canopy → `#22421F`, bells → `#B36BD1` (the only C>60) | 32 |
| c13 | grey L60 vs tan L82, ΔL* 22 | shell → `#7F7466` | 32 |
| c14 | ΔL* 24 | shell → `#6C665B` | 29 |
| c16 | white L96 vs cyan L82, ΔL* 14 | crest → `#5FB8D0` | 26 |
| c19 | ΔL* 24.6 | back → `#6AA3CC` | 30 |
| c20 | blue L66 vs tan L68, ΔL* 2 | body → `#3F7FA6`, blades → `#E2C585` | 30 |
| c22 | two saturated colours (C65 + C86) | body → `#E3C77A` (C42) | 31 |
| c23 | ΔL* 16, and two saturated colours | body → `#D6A865` (C42), rings → `#2458D6` | 30 |
| c28 | ΔL* 14 | fins → `#E0708F` | 27 |
| c29 | declared pair pearl/gold ΔL* 8 | re-declare the dominant pair as pearl/periwinkle (ΔL* 27); gold becomes an accent | 27 |

The CR §7.4 uniqueness table still holds after these changes (c29 moves to FL white/periwinkle).

---

## 2. systems.md

| # | SY § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| SY-1 | §2.1 bands | CR BSTs outside the SY bands: c20 390 (st2 < 395); c12 495 and c21 490 (st3 < 505); c30 540 (st3 > 535) | Brief B/C stats; SY zod range | Validation fails | major | **Accept the SY bands.** New stats in §2.1. |
| SY-2 | §2.1 derived fields | SY derives catchRate (190/90/45; 45 for starters), xpYield (floor BST/5, /3, ×4/9) and growth. CR hand-entered all three | SY §2.1 "must not be hand-entered" | Duplicate truth | minor | **Accept.** CR v2 marks them "derived by SY", drops its per-species catch rates, and shows SY values for reference. Growth: accept f04 fast, f05 slow and f06 medium (CR had medium/medium/slow). |
| SY-3 | §8.3 evolution levels | Mismatches with CR (table §2.1) | SY §8.3 learnset ★ moves | Learnset evolution moves are keyed to SY levels | major | **Accept all SY levels**, including f10's `i_evo_prism` or Lv 44. |
| SY-4 | §10 traits | CR proposed 2 traits per species with non-canonical effects. SY: exactly one trait per species, from 26 ids | SY §10 | Traits not implementable | major | **Accept.** Mapping for all 30 is in §2.2 (20 distinct ids used, none `tr_adaptive`). |
| SY-5 | §5.1 weather | CR traits and flavour mention "gale/wind weather". SY has clear, rain, snow, fog, sunlight | SY §5 | Dangling reference | minor | Resolved by SY-4. CR lore text drops "wind weather". |
| SY-6 | §9.1 `anim` vocabulary | SY move anims (e.g. `melee_lunge`, 700 ms, impact 350) move the user across the stage. CR attack clips also translate the root (e.g. "leaps 1.2 H", "sprints 2 H") | RA 4.5 layering | Double translation, and desynced impact | major | **Division of labour:** the move `anim` owns root travel and the VFX envelope. The species `attack`/`attack_special` clips animate in place (anticipation → strike → settle), with `contact` aligned to `impactMs` by the presenter. CR v2 rewrites travel phrases as "(travel supplied by move anim)". |
| SY-7 | §2.1 stat range 20–140 | All CR stats are within range, including after the §2.1 fixes | — | — | — | No action. |
| SY-8 | §1.2 matrix vs CR anatomy | Gale is immune to stone (0×), so c21's proposed "Rotor Hover" is redundant. Stone/electric c15 is 2× weak to water and verdant, not 4× | — | — | — | No action. The theme fits the matrix. |

### 2.1 Stats and evolution: CR v1 → v2 (accepting SY)

| id | Change | New BST |
|---|---|---|
| c20 | hp 55 → 60 | 395 |
| c12 | atk 90 → 95, spe 35 → 40 | 505 |
| c21 | hp 75 → 80, def 65 → 70, spd 70 → 75 | 505 |
| c30 | hp 130 → 125 | 535 |

Evolution levels, CR v1 → SY (all SY values adopted):

| Family | CR v1 | SY |
|---|---|---|
| f04 | 18 / 33 | 16 / 32 |
| f06 | 26 / 40 | 22 / 38 |
| f07 | 14 / 31 | 14 / 30 |
| f08 | 22 / 37 | 18 / 34 |
| f09 | 28 / 42 | 24 / 40 |
| f10 | 30 / 44 | 26 / (prism or 44) |

f01–f03 (16/34) and f05 (20/36) already match. The effect is small: stage-2 availability shifts 2–6 levels earlier, which suits WD's re-banded tables (WD review row 4).

### 2.2 Species → canonical trait (one each)

| id | Trait | Rationale |
|---|---|---|
| c01 | `tr_last_stand` | SY starter default |
| c02 | `tr_last_stand` | SY starter default |
| c03 | `tr_static_hide` | SY default. Matches CR "Sparkhide" |
| c04 | `tr_last_stand` | SY starter default |
| c05 | `tr_last_stand` | SY starter default |
| c06 | `tr_reckless` | SY default. Charging ram |
| c07 | `tr_last_stand` | SY starter default |
| c08 | `tr_last_stand` | SY starter default |
| c09 | `tr_frost_hide` | **Deviation** from SY's `tr_rain_glide`: a slow shield-bearer (spe 55) gains little from speed. Frost-on-contact matches its design |
| c10 | `tr_early_riser` | "Deep Doze" |
| c11 | `tr_toxic_skin` | Pollen bells poison attackers on contact |
| c12 | `tr_regrowth` | "Canopy Shelter". SY f04 default |
| c13 | `tr_sturdy_core` | "Curl Guard". SY f05 default |
| c14 | `tr_thorned` | "Club Rebound" |
| c15 | `tr_charge_sink` | Lodestone absorbs electric moves |
| c16 | `tr_frost_hide` | "Hoarfrost Hide" |
| c17 | `tr_snow_coat` | SY f06 default |
| c18 | `tr_clear_mind` | Serene guide |
| c19 | `tr_small_strikes` | Weak early moves hit harder |
| c20 | `tr_keen_focus` | SY f07 default |
| c21 | `tr_keen_focus` | Raptor precision |
| c22 | `tr_toxic_skin` | SY f08 default |
| c23 | `tr_tide_sink` | Brine-filled mantle |
| c24 | `tr_menace` | Ring intimidation display |
| c25 | `tr_fog_veil` | "Cutout". SY f09 default |
| c26 | `tr_quick_feet` | Puppet shrugs off status |
| c27 | `tr_flame_sink` | Ember core absorbs fire |
| c28 | `tr_regrowth` | "First Light" |
| c29 | `tr_keen_focus` | "Glint Bill" (exact match: crit +1) |
| c30 | `tr_resonant` | SY f10 default |

---

## 3. world.md

| # | WD § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| WD-1 | §4.3, §5.1 vs CR habitats | WD places most lines more widely and earlier than CR's lore habitats did (e.g. c16 in cave and lake; c25 and c28 from route_1; c22 in 7 zones) | Brief D | CR text disagrees with the data | minor | **Accept WD as canonical.** CR v2 rewrites each "suggested" habitat from WD §5.1 and keeps lore as flavour. |
| WD-2 | §4.3 volcano c24 | c24 Venomantle (toxin·**water**, a lake-dweller whose design is built on its water web) appears only at the volcano | CR §4 c24 identity; CD zone theming | Thematic contradiction: a water octopus in lava | minor | Move c24 to `lake` (night, weight 5) and cave deep. The WD review already lists c23/c24 for the lake. The volcano keeps c27 (shade·fire) and c15. |
| WD-3 | §4.3 below-evolution-level stage-2 spawns (c11, c14, c26, c15) | Stage N appears below the stage N−1 evolution level | SY §8.3 | Implausible encounters | major | Already accepted by WD (its review row 4). I endorse the validator rule. |
| WD-4 | CR c28 "dawn only" | WD has day/night bands only (WD review row 9) | — | — | minor | **Accept.** c28 is a day spawn. CR drops "dawn". |
| WD-5 | risk table: add water/fire secondaries to c17/c11 and c23/c14 | This would break CR's derangement: each type is a secondary for exactly one family | CR §0 strategic spread | Duplicate type pairs, and a weaker roster | minor | **Decline.** Water is covered by c23/c24 (lake/fen) and fire by c27 (volcano), as the WD review concluded. |
| WD-6 | §5.2 names in tables (Voltra, Emberhorn) | Stale names | — | — | minor | Key rows by id (WD review row 25). |

---

## 4. rendering_and_architecture.md (builder contract)

| # | RA § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| RA-1 | 4.1 anchors | The contract test requires **all** anchors, including `hornTip` and `tailTip`. Many species have no horn (c07, c10, c22…) and some no tail (c22–c28) | RA 4.1 contract tests | 20+ builders fail the contract | **blocker** | Required anchors: `mouth, eyeL, eyeR, head, core, hitCenter, overhead, captureTarget, feet`. Optional: `hornTip`, `tailTip`. Species-specific `fx_*` anchors are allowed (CR's `fx_fork`, `fx_core`, …). For headless plans, `head` = the face-bearing part (c23 body base, c27 centre panel, c28–c30 front segment). |
| RA-2 | 4.3 material classes | RA has fur/scale/shell/skin/glow/eye. CR also needs **membrane** (double-sided, translucent: wings, sails, fins, webs), **ice** (translucent, depthWrite off), **paper** (flat matte, f09), **stone** and **metal** | CR §2.2; RA "≤ 4 classes" | Translucent sails and fins can't be built, and sorting artefacts | major | Add `membrane` and `ice` (both transparent, `renderOrder` after opaque) and `paper`. Map `stone` → `skin` with roughness 0.9 and vertex AO, and `metal` → `shell` with metalness 0.6. Each creature still uses ≤ 4 classes; CR's parts already fit that. |
| RA-3 | 4.1 part names vs RG 3.2 closed vocabulary vs CR part names | Three naming schemes (`leg_FL` vs `limb_fl`; `eyeL` vs `eye_l`; CR's `torso`, `segment ×8`, `flank flap`, `panel`, `rotor`, `plume`, `lodestone`) | RA clip references; RG GC-06/08 | Clips and gate checks can't find parts | major | One vocabulary in `contract.ts`, owned by RA and adopted by RG: `body, head, jaw, neck, eye_l/r, brow_l/r, ear_*, horn_*, crest, tail_<n>, limb_<fl/fr/bl/br/l/r>, wing_*, fin_*, shell, segment_<n>` (serpent, fish or ring chains), `arm_<n>` (tentacles, lasso arms), `panel_*` (f09), `accessory_*` (props, satellites, plumes). CR v2 renames its parts accordingly. |
| RA-4 | 4.6 LOD budgets | RA LOD0 ≤ 12k/16k tris, ≤ 14 draw calls. CR proposed 3.5k/5.5k/8k tris and ≤ 10/14/18 calls | RA 6.2 | Stage-3 CR builds would exceed 14 calls | minor | **Adopt RA**: ≤ 14 draw calls at every stage, using `mergeRigid`. CR's lower triangle targets remain as authoring guidance. |
| RA-5 | 4.6 LOD2 "body, head, tail_0, legs merged" | Silhouette features that are separate parts (c15 orbiting stones, c21 rotor, c26 crossbar, c18 plumes) would vanish at LOD2 | CR §7.3 must-read features; RG CC-03 | Species unreadable at 25+ m | major | LOD2 keeps any part tagged `silhouette:true` (merged into ≤ 4 calls, animation reduced to root motion plus one orbit or spin). CR v2 tags these parts. |
| RA-6 | 4.4 atlas | 8 cells: `open, blink, closed, happy, hurt, faint, determined, surprised` | CD review row 17 | — | — | **Accept as canonical.** CR v2 adds `determined` (lidAngle −15) and `surprised` (open 115%, pupil −20%) per species. f09 builds the 8 cells as cut-out masks. |
| RA-7 | 4.4 rule 1 (eye ≥ 12% of head height) | c30 eye (r 0.035 H) vs its head segment (~0.7 H) ≈ 10% | RA 4.4 / CD review row 19 | GC fails | minor | c30 eye → r 0.045 H, and `headHeight` = height of the front segment. |
| RA-8 | 4.1 `bounds` ±15% of `bodyScale` | CR H excludes `hoverGap`; RA's root is at ground contact | Contract test | False failures for floaters | minor | `bodyScale` = CR H (the model's own height). `hoverGap` is a separate spec field and is excluded from `bounds` at rest. |
| RA-9 | 2.7 stage rectangle 12 × 6 m | Big creatures (c30 at 4.8 m after CD-2, c12 canopy, c15 orbit radius ≈ 1.4 m) overhang the stage | RA 2.7 | Clipping into props or terrain | minor | Stage length = max(12, 7 + r₁ + r₂ + 2) m, and width = max(6, 2 × max radius + 1) m. |
| RA-10 | 4.3 rim `uRimStrength` is global | CR set rim strength per species (0.2–0.6) to keep dark species legible | CR §2.2; RA 5.2 night floor | f09, c06 and c30 disappear at night | minor | `uRimStrength` = global phase value × species `rimGain` (CR value ÷ 0.35, clamped 0.6–1.7). `rimColor` stays per species. |
| RA-11 | 4.5 clip events `impact`/`cry`/`release`; library `attackPhysical/Special/Status` | CR uses `contact/windup/recover` and has no status-move clip | RA 4.5 | Event names mismatch | minor | Rename `contact` → `impact`. Keep `windup`/`recover` as optional events. CR v2 adds a per-species `attackStatus` pose (default: the RA library clip with species amplitude). |
| RA-12 | 4.5 reduced motion (durations unchanged, idle ×0.6) vs CD (no squash, ×0.5) vs CR (×0.5, spins ≤ 180°) | Three rules | Brief accessibility | Inconsistent behaviour | minor | Use CD review row 22 (the union), plus RA's rule that durations and event times are unchanged. |
| RA-13 | 2.6 roaming temperament; 4.5 `ClipParams.attackStyle` | Both come from CR, and CR v1 gives neither | RA 2.6, 4.5 | Missing data | **major (CR gap)** | Supplied in §7.1. |

---

## 5. qa_plan.md

| # | QA § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| QA-1 | C-02 vs RG GC-07 vs RA `silhouettes` vs CR §7.1 | Four silhouette procedures (ortho vs perspective; 90% fit vs 8% padding; area-average vs box downsample; front/side/¾ views) | Brief B silhouette sheet | Metrics that cannot be compared | major | **RG GC-07 is canonical** (it blocks). QA C-02 and RA's tool implement exactly GC-07. CR §7.1 is demoted to an optional extra (native 20 px render and colour pass) reported as info. |
| QA-2 | C-03 clip list, 7 clips | CR v1 defines 8 (`attack_special`). The capture clip must fit SY §7.3 step 2 (400 ms) and CD's 450 ms absorb | Brief B animations | A redundant clip, and timing clashes | minor | Required: the 7 clips. `attack_special` and `attackStatus` are optional overrides. Capture = species reaction ≤ 250 ms plus the shared absorb (SY 400 ms total). CR v2 drops the 1.0/1.2 s captures for c06/c30. |
| QA-3 | fixtures `fx_save_each_starter_{voltra,…}` | Stale names | — | — | minor | Key by id (see WD review row 25). |
| QA-4 | C-06 "≥ 2 named parts differ" | Compatible with CR (each stage adds or removes ≥ 4 parts) | — | — | — | No action. |

---

## 6. release_character_gate.md

| # | RG § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| RG-1 | GC-07 fill 15–75% **in both views**; side view = camera on +X | Flat and planar designs are edge-on in +X side view: f09 plates (c25, c27), c03 and c20 wing planes, c18 ring plane. Their 20 px fill will fall well under 15% | Brief B designs; CC-04 | Deliberate original designs fail an automated gate | **blocker** | Choose one: (a) apply the minimum fill to the **better** view only; (b) allow a per-species `silhouetteSideYaw` (≤ 45°, recorded in the CR spec) for the "side" view; or (c) exempt planar parts (tagged in the builder) from the side-view minimum. I propose (b). It is honest, because the battle camera never shows these species edge-on (CR yaw clamp ±50°). |
| RG-2 | GC-05 duration bounds: attack 0.5–1.8, capture 0.6–2.0 | Capture must be ≤ 0.45 s (SY §7.3, CD §5.5). Stage-1 attacks under the CD guidance can be < 0.5 s | CC-08 | False fails | major | Capture bounds 0.25–1.0 s (reaction plus shared absorb). Attack bounds 0.4–1.8 s. |
| RG-3 | 3.2 `Emotion` set | Differs from RA's 8 cells | CD review row 17 | — | minor | Already resolved: `neutral` → `open`, `fainted` → `faint`. |
| RG-4 | GC-06 rule 3 (role-multiset Jaccard ≤ 0.85 across all pairs) | With a closed vocabulary, anatomically different quadrupeds (e.g. c04 vs c07, c05 vs c14) may share nearly identical role multisets | Anti-recolor intent | False positives against distinct designs | minor | Compute the Jaccard over `(role, geometryKind, childCount)` tuples, or raise to 0.90 cross-family. Calibrate at the Phase 3 baseline, as GC-07 already does. |
| RG-5 | CC-08 "hit reaction starts ≤ 2 frames after impact" vs f09 12 fps stepping | Stepped animation can delay the first reaction pose by up to 83 ms | CC-08 | Fail on f09 | minor | CR rule: stepped clips snap to their first key **on** the triggering event (the phase resets at the event), so the reaction starts on the impact frame. |
| RG-6 | GC-10 undeclared colours ≤ 15% | CR minor-part colours (horn bone `#D8B892`, bark `#5A4632`, beaks, pins) are not in `palette` | GC-10 | Warnings or fails | minor | CR v2 lists them under `palette.accent`. |
| RG-7 | CC-05 bands | RG's proposed ratios differ from CD's | CD review row 20 | — | minor | Use the CD final bands (see CD-1). |

---

## 7. Data I owe (goes into CR v2)

### 7.1 Roaming temperament (RA 2.6) and attack style (RA 4.5)
| id | temp. | style | id | temp. | style | id | temp. | style |
|---|---|---|---|---|---|---|---|---|
| c01 | skittish | lunge | c11 | wander | slam | c21 | territorial | lunge |
| c02 | curious | spin | c12 | wander | slam | c22 | skittish | lunge |
| c03 | territorial | lunge | c13 | skittish | spin | c23 | curious | cast |
| c04 | curious | lunge | c14 | territorial | slam | c24 | territorial | cast |
| c05 | territorial | slam | c15 | territorial | cast | c25 | curious | lunge |
| c06 | wander | slam | c16 | skittish | lunge | c26 | curious | slam |
| c07 | curious | spin | c17 | territorial | breath | c27 | territorial | cast |
| c08 | curious | lunge | c18 | wander | spin | c28 | curious | spin |
| c09 | territorial | spin | c19 | curious | lunge | c29 | territorial | lunge |
| c10 | wander | lunge | c20 | skittish | spin | c30 | wander | breath |

### 7.2 Head-ratio fixes (CD final bands; H units; stage-2/3 fixes resize the `head` role)
- **Stage 1:**
  - c04 head ry 0.16 → 0.17 (ratio 0.34).
  - c13 head (0.12,0.10,0.15) → (0.18,0.17,0.20) (0.34).
- **Stage 2:**
  - c02 ry 0.12 → 0.13 (0.26).
  - c05 ry 0.11 → 0.13 (0.26).
  - c14 ry 0.12 → 0.13 (0.26).
  - c20 ry 0.11 → 0.13 (0.26).
- **Stage 3:**
  - c06 ry 0.15 → 0.14 (0.28).
  - c09 ry 0.15 → 0.14 (0.28).
  - c24 head (0.24,0.20,0.24) → (0.20,0.14,0.20) (0.28).
- **Documented deviations** (the long-axis rule is requested in CD-1): c10, c19 (RB), c22–c24 (RD), c08, c16, c17 (SR), c18, c26, c28–c30 (FL), c25, c27 (FT).

### 7.3 Cry parameters (CD §8.6)
Each family keeps one voice and contour, with timing ×1.15 per stage. Every stage-to-stage pitch drop is at least 5 semitones (a ratio of 1.335 or more; checked).

| Fam | voice | contour (t, st) | basePitchHz st1/2/3 | durationMs st1/2/3 | extras |
|---|---|---|---|---|---|
| f01 | fm | (0,0)(.4,+7)(.7,+3)(1,+10) | 820 / 520 / 300 | 320 / 480 / 700 | harm 3, modIdx 8, vib 0 |
| f02 | saw_formant | (0,0)(.2,+5)(.6,+2)(1,−4) | 680 / 420 / 200 | 380 / 560 / 900 | F1 700 / F2 1200, noise 0.2 |
| f03 | am | (0,+2)(.3,−3)(.6,+4)(1,0) | 760 / 460 / 240 | 300 / 480 / 760 | vib 5 Hz, 0.2 |
| f04 | saw_formant | (0,+4)(.5,−2)(1,−9) | 560 / 340 / 140 | 600 / 850 / 1200 | F1 400 / F2 900, slow attack 60 ms |
| f05 | noise_formant | (0,0)(.3,−2)(1,−6) | 600 / 360 / 150 | 280 / 450 / 800 | noise 0.45 |
| f06 | fm | (0,+9)(.5,+12)(1,+4) | 900 / 560 / 330 | 400 / 600 / 900 | harm 4, vib 6 Hz, 0.3 |
| f07 | fm | (0,0)(.25,+12)(.5,+5)(1,+9) | 880 / 540 / 320 | 280 / 420 / 650 | harm 1, modIdx 2 |
| f08 | am | (0,0)(.3,+4)(.6,−4)(1,+2) | 640 / 400 / 200 | 350 / 520 / 800 | vib 4 Hz, 0.35 |
| f09 | noise_formant | (0,−3)(.4,+6)(.8,−6)(1,0) | 580 / 380 / 180 | 320 / 500 / 760 | noise 0.3, F2 2400 |
| f10 | fm | (0,0)(.3,+5)(.6,+7)(1,+12) | 700 / 440 / 160 | 450 / 750 / 1200 | harm 2, modIdx 3, sustain 0.6 |

For secondary types, the `typeColor` fx adds that of the second type from stage 2 or 3, at half mix.

## 8. CR v2 change list (my own document, next revision)

| # | Change | Source rows |
|---|---|---|
| 1 | Stats, derived fields, evolution levels and traits | §2.1, §2.2 |
| 2 | Palettes | §1.2 |
| 3 | Eye classes and pupils | §1.1 |
| 4 | Head resizes | §7.2 |
| 5 | c30 and c19 scale | CD-2 |
| 6 | Brow meshes and the atlas-mouth rule | CD-6 |
| 7 | 8-cell face frames | RA-6 |
| 8 | Part vocabulary and `silhouette:true` tags | RA-3, RA-5 |
| 9 | Anchors | RA-1 |
| 10 | Material classes | RA-2 |
| 11 | In-place attack clips with `impact` ≤ 0.6 s | SY-6 |
| 12 | Capture ≤ 250 ms reaction | QA-2 |
| 13 | Temperament, attack style and cries | §7.1, §7.3 |
| 14 | Habitats from WD | WD-1, WD-4 |
| 15 | Silhouette procedure pointer to GC-07, plus `silhouetteSideYaw` values | RG-1 |
| 16 | Emissive clamp | CD-8 |

## 9. Unresolved (need the named owner)
1. **RG-1 (blocker):** RG chooses option (a), (b) or (c) for planar species in GC-07.
2. **RA-1 (blocker):** RA reduces the required anchor set.
3. **CD-4, CD-5:** CD allows h-bar pupils for cephalopods and emissive sclera-less eyes for c06, c15 and c18. If refused, CR converts them.
4. **CD-6:** CD accepts atlas mouths for species without a jaw.
5. **CD-2:** CD gives the teen height in metres and says whether the scale rule measures height or longest extent.
6. **WD-2:** WD moves c24 out of the volcano.
