# Character Consistency Gate: Decision Records

This log is append-only. Each entry records one gate decision by the Release and Character Consistency Agent, made under `design/release_character_gate.md`. A correction is a new entry that references the one it supersedes; existing entries are never edited.

Each entry here must have a matching object in `design/reviews/gate_status.json`. Deploy tooling checks that file (see gate doc §3.6).

Decision values:
- `pass`
- `conditional_pass`
- `fail`
- `pending`: used only for design-phase entries; it never authorizes a deployment.

Check status values:
- `pass`
- `fail`
- `warn`
- `not_run`
- `not_measured`
- `not_applicable` (a reason is required)

---

## Template (copy below the last entry)

```markdown
## <Phase N | Deploy <target>> — <decision> — <YYYY-MM-DD>  {#p<N>-<sha7>}

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Phase / target | Phase N (<name>) / deploy:<preview|production> |
| Build commit | <40-hex sha> |
| Gate commit | <sha of the commit adding this entry> |
| Reviewer(s) | release-character-agent; second reviewer: <name> |
| Orchestrator acknowledgement | <name / pending> |
| Supersedes | <entry anchor or "none"> |
| Automated report | qa/evidence/phase_<N>/char/report.json (sha256: <hex>; `commit` = build commit) — exit code <0|1> |
| Silhouette sheets | qa/evidence/phase_<N>/char/silhouettes_256.png, silhouettes_20.png, silhouettes_20_native.png, silhouette_pairs.csv |
| Manual captures | qa/evidence/phase_<N>/char/screens/ (<count> files) |
| Rubric | qa/evidence/phase_<N>/char/rubric.csv |
| QA gate (same commit) | <link to QA record> — <decision> |

### Scope
In-scope species/characters/surfaces per gate doc §2.1: <list>

### Automated checks
| Check | Status | Notes / evidence |
|---|---|---|
| GC-00 … GC-16, GC-18 (GC-17 for deploys) | pass/fail/warn/not_run/not_applicable | <path or reason> |

### Checklist items
| Item | Status | Evidence (scene files, report keys) |
|---|---|---|
| CC-01 … CC-17 | | |

### Rubric summary
| Subject | Appeal | Expr. | Read. | Orig. | Cohesion | Below threshold? |
|---|---|---|---|---|---|---|

Roster means: Appeal x.x / Expr. x.x / Read. x.x / Cohesion x.x

### Findings
| ID | Severity | Subject | Description (cite files; name any specific existing character or element involved) | Owner | Status |
|---|---|---|---|---|---|
| F-<N>-01 | Critical/Major/Minor/Note | | | | open/fixed@<sha>/disputed |

### Tier B terminology judgments
| Term | Location | Judgment (generic English / replace) | By |
|---|---|---|---|

### Conditions (conditional pass only; at most 5, Minor only, carried forward at most one gate)
| ID | Finding | Owner | Fix by phase |
|---|---|---|---|

### Not run / Not measured
- <check>: <reason>

### Decision
**<pass | conditional_pass | fail>** (conditional_pass is not allowed at Phase 7 or for production; gate doc v2 §1.1). Rationale: <one paragraph>. A fail blocks this phase and every deployment until the problem is corrected and retested on a new build commit.
```

---

## Phase 0 (design) — pending — 2026-09-24  {#p0-design}

| Field | Value |
|---|---|
| Date | 2026-09-24 |
| Phase / target | Phase 0 (design documents) / no deployment |
| Build commit | none. No game code exists yet. |
| Reviewer(s) | release-character-agent |
| Orchestrator acknowledgement | pending |
| Supersedes | none |
| Automated report | Not run. `npm run gate:character` is not implemented yet. |
| Manual captures | Not run. There is no build to capture. |

### Scope
The design documents being written in parallel:
- `creative_direction.md`
- `creatures.md`
- `systems.md`
- `world.md`
- `rendering_and_architecture.md`
- `qa_plan.md`
- `release_character_gate.md`

### Status
- The documents are in progress. No character designs, silhouettes, names or UI have been reviewed yet.
- Once `creative_direction.md` and `creatures.md` exist, the following reviews are due:
  - A document-level originality pre-review: names checked against the gate doc §3.4 denylist and the GC-13 similarity threshold, run manually.
  - The known-risk watchlist in gate doc §4.2: Rippleback, Voltra, Emberhorn, and the capture-device design.
  - Confirmation of the dependency items in gate doc §7.2.

### Findings
None yet.

### Not run / Not measured
- All automated checks (GC-00 through GC-17): Not run, because they are not implemented and there is no build.
- All manual rubric scoring: Not run, because there are no renders.

### Decision
**pending**. The documents are in progress. This entry authorizes no deployment.

---

## Phase 0 (design) review — fail — 2026-09-24  {#p0-design-review}

| Field | Value |
|---|---|
| Date | 2026-09-24 |
| Phase / target | Phase 0: design gate (documents only) / no deployment |
| Build commit | none. This reviews design documents; no game build exists. |
| Documents reviewed | the working-tree versions of `creative_direction.md`, `creatures.md`, `systems.md`, `world.md`, `rendering_and_architecture.md` and `qa_plan.md` in `design/`, read on 2026-09-24 |
| Reviewer(s) | release-character-agent. Second reviewer: **pending** (§4.3 of the gate doc requires one; the orchestrator or a non-author). |
| Orchestrator acknowledgement | pending |
| Supersedes | none. This entry follows `#p0-design`. |
| Automated report | Not run. `gate:character` does not exist yet. |
| Manual captures / rubric | Not run. There are no renders, so no Appeal, Expressiveness or Readability scores are given. |
| Name-similarity evidence | A one-off Jaro-Winkler run in the session scratchpad: all 30 final names, plus Voltra, Emberhorn and Coronaleen, were compared against about 400 creature names from Pokémon, Digimon, Palworld, Temtem, Coromon, Cassette Beasts and Monster Rancher, typed from general knowledge. **The reference list is partial and not exhaustive.** The script is not committed. GC-13 must repeat the check against the maintained denylist once it exists. |

### Scope and method
- The review compared the six documents against the gate doc's checklist (CC-01 to CC-17), the imitation tests in §4.2, and each other.
- Judgments come from the text specs and from general knowledge of the named franchises. No rendered model was seen.
- **Every originality statement below is a design-stage judgment. It is not a render review and not legal clearance.**
- Mentions of "Pokémon" and other franchises appear only in avoid-lists, originality audits and denylist specs, never as UI or content text. Those uses are compliant and are not findings.

### What is already good (evidence that the direction is being followed)
- **creatures.md:**
  - 30 bespoke builder specs, where every stage changes body plan, locomotion or limb count (not recolors).
  - Named part hierarchies.
  - A 20 px must-read feature for every species (§7.3).
  - A category × colour uniqueness table (§7.4).
  - An honest originality audit (§8).
  - Name screening with evidence (§1).
- **Audit-driven redesigns, all accepted:**
  - Magmouflon: the Camerupt-like back crater was removed.
  - Rimelet: the Snom-like feelers and prolegs were removed.
  - Brineloop: the Araquanid-like bubble helmet was replaced by its own brine-filled mantle.
  - Rippleback: never a shell on the belly or chest.
  - Floeguard: the shell is never used as a blade.
  - Emberhorn renamed: it is an existing creature in *Neo Monsters*, a direct genre collision, so renaming was correct.
  - Voltra renamed: fan-work uses and a crowded "Volt-" prefix.
- **creative_direction.md:**
  - The terminology is original and sound-themed throughout: kin, Tuner, Cantor, Keynote, Chime, Kinsong, Etude, Hearthrest, Crescendo, "go quiet".
  - The capture device (a hexagonal bell-lantern) avoids the split-sphere look.
  - The encyclopedia is a cloth songbook, not a handheld red device.
  - The HUD composition, the "resonance string" HP meter, the effectiveness phrasing ("Resounding!", "Muffled…", "No echo.") and the chord-burst spotted icon are all original.
  - §5.7 has an explicit imitation list.
  - There are non-colour cues for every piece of information (§7.5).
- **rendering_and_architecture.md:**
  - Eyes exist at every LOD.
  - There is an eye emissive floor.
  - Battle framing guarantees head size.
  - Faces are never fogged in battle.
  - The rim light is on in every profile.
- **qa_plan.md:** failed character checks block the phase (G-CHAR), and there is a denylist with DENY and REVIEW tiers.

### Findings

Severity follows gate doc §1.2. "Affected requirement" cites the gate checklist (CC-xx), the automated checks (GC-xx) or other documents. Proposed resolutions are recommendations; each owner decides the final design.

**Major**

| ID | Affected requirement | Finding (location) | Consequence | Proposed resolution | Owner |
|---|---|---|---|---|---|
| F-0-01 | CC-13 no recognizable imitation; §4.2 three-feature rule | **The antagonist faction echoes Team Plasma (Pokémon Black/White)** at the level of its concept. There are four matches with one specific faction: (1) the stated goal is to free creatures from people and "return them to true wildness", (2) a polite public face that proselytizes in towns (pamphlets), (3) hooded uniforms with an emblem on the chest, and (4) taking creatures from their owners. The mechanism (silencing stones, the Null Bell) and the sincere founder are original. Locations: `creative_direction.md` §2.3 (the Stillmark). `world.md` §8.4 has a similar hooded "Hush". | Players familiar with the genre will likely read the faction as a Plasma analogue. That breaks the originality requirement for the story's central antagonist. | Change at least two of the four. (a) Re-found the ideology on something other than liberation: for example, Odile believes resonance endangers people and the land (the Cindral stampede) and wants the region *safe and quiet*, and kin freedom is not the pitch. (b) Drop the chest emblem, or the hoods: for example felt ear-muffs or veils instead of hoods, with the emblem on a bell-shaped badge at the belt. (c) Replace pamphleteering with a different public presence, such as volunteer "quiet wardens" at the stones. Keep the Null Bell, felt and muffling motifs, which are distinctive. | Creative Director |
| F-0-02 | CC-10 original names; GC-13 (≥ 0.88 fails) | **c30 Umbraleen** is 0.905 Jaro-Winkler to *Umbreon*. Both are dark or shade-typed and have glowing markings on a dark body. (`creatures.md` §0, §4 c30) | It fails GC-13 automatically, and the name echoes a famous species. | Adopt the fallback **Coronaleen**, which is already on file and scored 0.755 in this session's run. | Creature Art Director |
| F-0-03 | CC-10; GC-13 | **c27 Cinderscrim** is 0.883 Jaro-Winkler to *Cinderace*, a widely known fire starter's final stage. Cinderscrim is shade/fire. | It fails GC-13 automatically. "Cinder" is ordinary English, but the fire association plus the closeness to a starter make the collision noticeable. | Rename, for example to a screen or folding root with an ember root. Re-run the similarity check. | Creature Art Director |
| F-0-04 | CC-10; the naming rule in creatures.md §1.3 ("must not reuse the prefix+suffix pattern of any known genre creature") | **c11 Nodbell** (stage 2, verdant/toxin, bell flowers) repeats the naming pattern of *Weepinbell*: a verb + "-bell", stage 2, Grass/Poison, a bell-plant motif. Also, *Belladrowse* scores 0.842 against Bellossom and 0.829 against Bellsprout. That is below the fail threshold but in the same family context. JW does not catch the suffix pattern, so this was found manually. | The combination of type pair, stage, bell motif and "-bell" suffix reads as the Bellsprout line even though the anatomy (a sloth) is original. | Rename Nodbell without a "-bell" suffix. Keep Belladrowse, recording the judgment: the "bella-" root plus "drowse" and the sloth anatomy make it distinct once Nodbell changes. Keep the bell-flower motif; the anatomy is sufficiently different. | Creature Art Director |
| F-0-05 | CC-10; CC-11 (characters) | **"Juniper 'Jun' Aske"**, a researcher who keeps the player's encyclopedia-completion checklist (`creative_direction.md` §2.4). That is the name *and* the research role of Pokémon's Professor Juniper (Unova). It also matches the "Professor + tree name" pattern that CD §3 itself lists as avoided. | A direct name-and-role echo of a franchise character. | Rename to a non-tree name that is not a franchise professor. | Creative Director |
| F-0-06 | CC-11 original anatomy; §4.2 known-risk watchlist | **c09 Floeguard** is the final stage of an otter water-starter line and has a **helmet cap, whiskers and shell armour**. Those are Samurott's (the Oshawott line's) three signature features. Its anatomy differs (a biped with a tail-shield, no seamitar), and the audit's no-blade constraint is good. But helmet + whiskers + shell armour on an otter starter's final form meets the three-feature rule. (`creatures.md` c09) | The water starter line risks reading as an Oshawott-line derivative. This is the brief's highest-profile creature. | Remove the helmet cap (use a frost-crystal brow crest or a carapace collar), reduce the whiskers to painted dots, and keep the tail-shield as its hero feature. Re-audit c07, c08 and c09 together as a *line* at the Phase 2 and 3 cover tests. | Creature Art Director |
| F-0-07 | CC-09 coherent presentation; CC-10 and CC-12 terminology; roster integrity | **The documents disagree on the cast and names.** `world.md` uses its own working names throughout: region "the Chime Vale", towns Kettlebrook, Pinwheel Rise and Crossvale, faction "the Hush", Crests, Tending House, Trading Post, champion "Solenne", and leaders Pim, Aeri, Tamaru, Ilse, Oduya and Lio. It also uses a **different trial type order**: verdant, gale, stone, frost, fire, lumen. CD uses verdant, stone, water, gale, fire, frost. The starter names also differ: CD, world and QA use Voltra and Emberhorn, which `creatures.md` renamed to Fizzkit and Wickwool. CD dialogue examples still say "Voltra is crescendoing!" and "Emberhorn went quiet." `systems.md` uses functional names (`i_orb_*`, `i_mark_*`, "box", "healing center"), which is expected. The rival starter rule differs: CD and systems use a type-advantage pick; world uses the Gift B line. | The trial leaders, champion, faction members and NPCs cannot be built or reviewed, because the character registry has no single source of truth. The first gate with those characters would fail CC-09. | The orchestrator should run one integration pass. CD names are canonical (CD owns them). `creatures.md` species names are canonical. World maps its WN table onto CD names and reconciles trial order and leaders with CD §4. Systems keeps functional ids with CD display names. Add a single `content/strings` glossary as the only source of display terms. | Orchestrator (with CD, World) |
| F-0-08 | CC-01 and CC-06 expressiveness and faces; GC-04 | **The emotion and face-state sets conflict across three documents:** CD §5.2 has 7 frames (neutral, happy, determined, surprised, hurt, sleepy, quiet); `creatures.md` §2.4 has 6 (open, half, closed, happy, hurt, faint), missing determined and surprised; `rendering_and_architecture.md` §4.4 has 8 (open, blink, closed, happy, hurt, faint, determined, surprised). Eye cell sizes also conflict: CD 256/256/128, creatures 256/128/64, rendering minimum 128/128/64 (High/Balanced/Mobile). | Builders written against creatures.md would lack the "determined" and "surprised" states that CD requires for attack windup and encounter start, and GC-04 cannot be specified. | Adopt the **rendering set of 8 states**, mapping CD "sleepy" to `half` and "quiet" to `faint`. The f09 cut-out family provides equivalents. Set the Mobile cell minimum by measurement: GC-09 at Phase 3 decides whether 64 px keeps the eye highlight legible, with 128 px as the fallback. Record the result in all three documents. | Creature Art Director, Rendering Engineer, CD |
| F-0-09 | CC-08 consistent animation language | **Clip timing conflicts.** CD §5.5 caps attack totals at ≤ 550 / 650 / 800 ms (stages 1/2/3) and faint at 900 to 1,200 ms, and CD AC 8 makes this binding. `creatures.md` §2.5 specifies attacks of 0.9 to 1.3 s and faint of 1.0 to 1.6 s. Every species spec would violate the CD caps. | Either CD's acceptance criterion fails for all 30 species, or builders ignore CD and animation feel diverges between documents. | CD and the Creature Art Director agree on one table. Recommendation: keep the CD *phase* structure (anticipation, action, follow-through) but allow a total attack clip of up to 1.3 s where it includes approach and return movement (lunge or leap distance). CD's caps then apply to the strike segment only. The gate doc's GC-05 bounds will be aligned to the result. | CD, Creature Art Director |
| F-0-10 | CC-05 consistent proportions | **The proportion and scale bands do not fit the specs.** CD §5.1's head ratio (stage 1 0.42 to 0.50) is written for upright figures. My estimates from `creatures.md` spec radii (not measured) give Wickwool about 0.32, Rippleback about 0.36 and Rimelet about 0.8. CD's minimum stage-1 size is 0.25 × teen height, about 0.39 m. Fizzkit (0.35), Dozebud (0.35), Rollith, Gustling, Ringdrip, Dawnfry (0.30) and Rimelet (0.25) are smaller. | CD AC 8 ("every kin matches its band") and gate CC-05 cannot both pass as written. | CD redefines the bands per body plan: a head-length ratio for horizontal and serpentine plans and a head-height ratio for upright plans. Either lower the minimum size to about 0.25 m, or state that it applies to the follower display scale only. `creatures.md` adds a computed head ratio per species. GC-08 will use the reconciled metric. | CD, Creature Art Director |
| F-0-11 | CC-03 silhouettes at gameplay distance; CC-04 | **The far LOD removes silhouette features.** `rendering_and_architecture.md` §4.6 LOD2 (25 m to cull distance) keeps only "body, head, tail_0, legs merged". But `creatures.md` §2.1 says LOD never removes a listed silhouette feature, and CD §5.3 makes the hero feature mandatory on the outline. Horns, sails, canopies, rotors, rings and crests would disappear at mid-distance. | Wild creatures at 25 to 40 m lose the features that make them identifiable, which breaks the "visibly roaming wild creatures" readability promise. | LOD2 keeps each species' §7.3 must-read features, merged into one draw call but not removed. The budget of ≤ 1,200 tris should be re-checked with those features included. | Rendering Engineer |

**Minor**

| ID | Affected requirement | Finding (location) | Consequence | Proposed resolution | Owner |
|---|---|---|---|---|---|
| F-0-12 | CC-10 | The default protagonist name **Rowan** is also Pokémon's Sinnoh professor, again a tree name. Different role, common given name. (CD §2.1, §9.4 Q7) | Low confusion risk, but the protagonist name appears constantly and in previews. | Pick a different default name. | CD |
| F-0-13 | CC-12 UI conventions | **Status abbreviations** SLP, BRN, PSN, PAR, FRZ (CD §7.3) are exactly the classic Pokémon status codes. FRZ also no longer matches systems' `frostbite`. | A recognizable UI convention. It is small alone, but it adds to the overall presentation. | Coin codes from the Wildchord terms and the systems ids, keeping letter+shape. | CD |
| F-0-14 | CC-13 | World §2.8: pedlars are "the same model/dialogue family ... (sibling pedlars, running gag)". That is the Nurse Joy / Officer Jenny identical-relatives gag from the Pokémon anime. | A recognizable franchise trope in the supporting cast. It also conflicts with CD, which names distinct Chandlers and a single traveling peddler, Wick. | Use CD's Wick and distinct Chandler archetypes. Drop the identical-siblings gag. | World Designer |
| F-0-15 | CC-12 terminology | Functional item ids echo franchise item names: `i_escape_rope` (world), `i_repel_1/2`, `i_revive_*` (systems). The "Box" wording appears in systems §7.4. The rendering §10.6 save-import summary shows **"badges"**. The save schema uses `whiteout`, `ivs`, `nature` and `originalTrainer`. | IDs are fine. The risk is that these words leak into display text: the import summary is player-facing. | Ids may stay. All display strings come from CD terms (Fosterage, Keynotes, Hearthrest). Change the import summary to "Keynotes". Add GC-12 coverage of the export/import summary text. | Rendering Engineer, Systems, CD |
| F-0-16 | CC-13 (presentation) | The passive traits in systems §10 replicate specific Pokémon abilities, with the same effect and numbers: `tr_last_stand` (Blaze/Torrent/Overgrow, ×1.5 at ≤ 1/3 HP on the starter lines), `tr_sturdy_core` (Sturdy), `tr_small_strikes` (Technician), `tr_reckless` (Reckless, same name), `tr_static_hide` (Static), `tr_menace` (Intimidate), `tr_charge_sink` (Volt Absorb), `tr_flame_sink` (Flash Fire). | Mechanics are genre conventions. But display names and descriptions that match (for example "Reckless") would be a recognizable set. | Keep the mechanics if Systems wants them. Give original, sound- or craft-themed display names, and avoid "Reckless" and "Sturdy". Consider changing some numbers (for example the last-stand threshold or multiplier) so the set is not a one-to-one copy. | Systems, CD |
| F-0-17 | CC-10 (warn band 0.80 to 0.88) | GC-13 warn-band names, with this review's recorded judgments: **Magmouflon**–Magmar 0.813 (keep: "magma" plus the distinct "mouflon"; no Magmar anatomy), **Rollith**–Growlithe 0.841 (keep: no semantic overlap), **Cairnback**–Carbink 0.865 (keep: "cairn" is English, different anatomy), **Rimelet**–Ribombee 0.824 (keep), **Samaraptor**–Samurott 0.809 (keep: a bird, no overlap), **Brineloop**–Brionne 0.831 (keep: "brine" is English, toxin/water octopus vs water sea lion; note that "Brine" is also a Pokémon *move* name, which is acceptable as a dictionary word), **Lumarlin**–Lucario 0.824 (keep), **Belladrowse** (see F-0-04). | These are judgments, not failures. | Record them in the GC-13 allow file with these reasons, and re-check against the maintained list. | Release agent |
| F-0-18 | CC-11 watchlist | **c07 Rippleback** vs Oshawott and Buizel. The audit's constraints (plates only on the tail, brown and teal, a pebble tool, a quadruped pup) make stage 1 acceptable on paper. The residual risk is at line level (see F-0-06). | Needs rendered confirmation. | A mandatory cover test at the Phase 2 gate (S04, S19) with the starter trio shown without names. | Release agent |
| F-0-19 | CC-11 | **c30** is an ancient floating whale that "sings". Combined with a music-themed game, this edges toward *Link's Awakening*'s Wind Fish. The audit's constraints (indigo, no wings) mitigate this. | Low risk once renamed (F-0-02). | Avoid dream or "awakening" story beats tied to c30. Keep the constraints. | CD, Creature Art Director |
| F-0-20 | CC-06 | The pupil types `slit` (c17, c18) and `w-shape` (c24) are not in CD §5.2's allowed pupil list. The eye-shape vocabulary also differs: CD uses E1 to E6, creatures uses round, almond and so on. | An inconsistent face language, and a CD rule cannot be checked. | CD adds slit and w-shape (they are real-animal traits) or creatures changes them. Map the creature eye shapes onto E1 to E6. | CD, Creature Art Director |
| F-0-21 | CC-12 phrasing | CD §3 encounter text "A wild {kin} rustles out!" keeps the "A wild …" opener. It does not match GC-14 ("appeared"), but it echoes the cadence. | Minor, cumulative presentation risk. | Keep a varied pool in which fewer than half the lines start with "A wild". | CD |
| F-0-22 | Gate tooling (CC-04, GC-07) | There are **four silhouette or character tools with different routes and thresholds**: creatures §7.1 `/dev/silhouettes` (flags IoU ≥ 0.85), rendering §11 `/?tool=silhouettes` and `gate:character`, QA C-02 `?charsheet=silhouette` (flags > 0.85, fails same-family pairs > 0.90 at 256 px), and the gate doc's GC-07 `/gate.html` (a D-difference threshold). | Duplicated work and contradictory verdicts on the same pair. | One harness, owned by the Rendering Engineer (the route and `npm run gate:character`). The QA C-* checks and the gate GC-* rules run on its output, and thresholds are reconciled once at the Phase 3 calibration. | Orchestrator, Rendering, QA, release agent |
| F-0-23 | Gate doc self-review | `release_character_gate.md` needs these alignments. It was not edited in this review, per the coordinator's instruction. (a) The GC-04 emotion list and minimum texture size must follow F-0-08; the current "≥ 256×256" conflicts with rendering's 128 px cells. (b) The CC-05 and GC-08 metric must follow F-0-10. (c) GC-05 duration bounds must follow F-0-09. (d) Phase 7: QA 7.5 does not accept conditional pass at P7, so adopt QA's stricter rule. (e) Add to Tier A: Hall of Fame (UI phrase), Safari Ball, Pokéflute, Game Freak, Nintendo, Creatures Inc. (from QA §9.3), and Escape Rope. Add Repel to Tier B. (f) Unify the evidence root (`reports/` vs QA `qa/evidence/` vs rendering `artifacts/`) and the asset manifest name (`assets.manifest.json` vs QA `assets/manifest.json`). | The gate would contradict its dependencies. | Revise the gate doc in the next round. | Release agent |

**Notes (no action required)**
- "Tuner" is also a card class in *Yu-Gi-Oh!*, but it is a generic word. Keep it.
- The rival taking the type-advantaged starter is a genre convention (CD §2.2, systems §14.1). It is acceptable on its own.
- Starter base-stat totals of 310/405/525 (`creatures.md` §9 AC8), the capture-formula shape (systems §7.2) and the status numbers mirror Pokémon's hidden mechanics. They are not player-visible character direction and are recorded only so that no UI surfaces them as a recognizable set.
- Wickwool's concept (a fire lamb starter) overlaps a fan work, "Kindlamb". The concept comes from the brief, and the design differs. No action.
- Fizzkit vs Emolga: they share "electric" and "flank gliding membranes", but not a rodent body or palette. The audit constraints hold. Check again at the render cover test.
- The title "Wildchord" and region "Cantarra" have no trademark or store check (CD §9.4). That is a release item, not a character finding (see `release_agent.md`).

### Not run / Not measured
- Every automated gate check (GC-00 to GC-17): Not run, because no build exists.
- Every render-based check (silhouettes, faces, palettes, cover tests, rubric scores): Not run, because there are no renders.
- The second reviewer: pending.
- Name similarity: run only against a partial reference list from general knowledge. It is not a register or web search.

### Conditions
None. A conditional pass is not available while Major findings are open (gate doc §1.1).

### Decision
**fail** (design gate).

Rationale: eleven Major findings are open.
- **Originality (F-0-01 to F-0-06):** one faction concept, three creature names, one character name and one creature design echo specific Pokémon elements.
- **Cross-document contradictions (F-0-07 to F-0-11):** the character registry, face states, animation timing, proportion bands and far-LOD silhouettes contradict each other, so the character gate could not pass Phase 1 or 2 as written.

Every fix is a document edit. None needs a redesign of the overall direction, which is strong: the originality audit, terminology, capture device, HUD and faces are well handled.

What this blocks:
- It blocks closing the Phase 1 character gate and any deployment.
- It does **not** block non-character foundation work: movement, terrain, battle sim, persistence and CI.
- Builders for the protagonist and c01 should wait for F-0-07 to F-0-10 to be resolved.

Retest: a re-review of the revised documents, recorded as a new entry that references this one. The originality items F-0-02 to F-0-06 need the renamed or redesigned specs. F-0-01 needs the revised §2.3.

---

## Phase 0 (design) re-review — pending doc revisions — 2026-09-24  {#p0-design-rereview}

| Field | Value |
|---|---|
| Date | 2026-09-24 |
| Phase / target | Phase 0: design gate, re-review / no deployment |
| Build commit | none (design documents only) |
| Inputs | `design/DECISIONS.md` (orchestrator rulings D1–D28); gate doc revised to **v2** (`release_character_gate.md`), applying F-0-23. The revised `creative_direction.md`, `creatures.md`, `world.md` and `systems.md` **have not landed yet**; other agents are revising them now. |
| Reviewer(s) | release-character-agent; second reviewer still pending |
| Supersedes | none. This follows `#p0-design-review`, whose `fail` stands until this entry is decided. |
| Automated report | Not run (no build). |

### Name-similarity run (method and limits)
- **Metric set:** the gate v2 GC-13 metric set: Jaro-Winkler (JW), Levenshtein distance ≤ 2, and a shared substring of ≥ 5 characters, all computed on lowercase names.
- **Species reference list:** **845 creature names**, mostly Pokémon across all generations, plus the Digimon, Palworld, Temtem, Coromon, Cassette Beasts and Monster Rancher names from the gate v2 denylist. The list was typed from general knowledge. **It is partial and not exhaustive.**
- **Character reference list:** about 190 names of Pokémon professors, rivals, gym leaders, Elite Four members, champions, villains and protagonists, plus a few anime and Digimon characters. Also partial.
- **Scripts:** these ran as one-off scripts in the session scratchpad, which is not in the repo. GC-13 must re-run against QA's maintained `franchise_names.txt` once it exists.
- **The first run was too small.** The first-pass run (`#p0-design-review`) used about 400 names. The larger list surfaced **new hits that the first run missed** (Venomantle–Venonat, Samaraptor–Staraptor). Results from any partial list are a floor, not a clearance.
- **Thresholds (gate v2 GC-13):**
  - JW ≥ 0.88 fails.
  - JW 0.80–0.88, Levenshtein ≤ 2, or a shared substring ≥ 5 is a warn that needs a judgment.
  - For names of 6 characters or fewer, only an exact match or Levenshtein ≤ 1 decides a fail.

### Results: the 30 final species names (post-D7)
| id | Name | Closest (JW) | 2nd (JW) | Lev ≤ 2 | Substr ≥ 5 | Status | Judgment |
|---|---|---|---|---|---|---|---|
| c01 | Fizzkit | Nickit 0.746 | Finizen 0.705 | — | — | clear | — |
| c02 | Crackleap | Cacnea 0.817 | Crabrawler 0.771 | — | — | warn | Keep: no semantic or anatomy overlap (Cacnea is a cactus) |
| c03 | Tempestrel | Tentacruel 0.720 | Tepig 0.707 | — | — | clear | — |
| c04 | Wickwool | Carkol 0.722 | Wimpod 0.700 | — | — | clear | — |
| c05 | Kilnhorn | Kilowattrel 0.785 | Kingler 0.770 | — | — | clear | — |
| c06 | Magmouflon | Magmar 0.813 | Magmortar 0.811 | — | "magmo" (Magmortar) | warn | Keep, with a recorded note: "magma" is a dictionary root and "mouflon" is distinct. There is no Magmar or Magmortar anatomy (no humanoid form, no arm cannons). **Three weak signals together** (JW, substring, fire type) mean the orchestrator may still choose to rename. |
| c07 | Rippleback | Riolu 0.707 | Rillaboom 0.695 | — | — | clear | Name is clear. The design stays on the watchlist (gate §4.2). |
| c08 | Tidesleek | Indeedee 0.727 | Treecko 0.705 | — | — | clear | — |
| c09 | Floeguard | Floette 0.803 | Florges 0.783 | — | — | warn | Keep: a flower fairy vs an armoured otter |
| c10 | Dozebud | Drowzee 0.743 | Doduo 0.741 | — | — | clear | — |
| c11 | **Lullstalk** (new) | Lurantis 0.728 | Lugia 0.716 | — | — | **clear** | The D7 rename resolves F-0-04. It has no "-bell" suffix. |
| c12 | Belladrowse | Bellossom 0.842 | Bellsprout 0.829 | — | — | warn | Keep (judgment carried from F-0-17). It is acceptable now that c11 no longer uses "-bell". |
| c13 | Rollith | Growlithe 0.841 | Rowlet 0.797 | — | — | warn | Keep: no overlap |
| c14 | Cairnback | Carbink 0.865 | Cacnea 0.763 | — | — | warn | Keep: "cairn" is English; different anatomy |
| c15 | Lodestodon | Loudred 0.790 | Obstagoon 0.756 | — | — | clear | — |
| c16 | Rimelet | Ribombee 0.824 | Primeape 0.780 | — | — | warn | Keep: no overlap |
| c17 | Sleetribbon | Steelix 0.771 | Sylveon 0.751 | — | — | clear | — |
| c18 | Borealoop | Boldore 0.784 | Breloom 0.757 | — | — | clear | — |
| c19 | Gustling | Gulpin 0.856 | Slaking 0.780 | — | — | warn | Keep: no overlap |
| c20 | Whirlseed | Whismur 0.783 | Wailord 0.721 | — | — | clear | — |
| c21 | **Samaraptor** | **Staraptor 0.869** | Samurott 0.809 | **Staraptor (2)** | **"raptor" (Staraptor)** | **warn → rename recommended** | This is a naming-formula echo (gate §4.2): Staraptor is star + "-raptor", Samaraptor is samara + "-raptor". Both are raptor birds and flying types. It trips all three metrics. **Recommend rename (Major under §4.2).** |
| c22 | Ringdrip | Kingdra 0.780 | Regidrago 0.694 | — | "ingdr" (Kingdra) | warn | Keep: coincidental letters |
| c23 | Brineloop | **Breloom 0.873** | Brionne 0.831 | — | — | warn | Keep: Breloom is a mushroom; Brionne is a sea lion (judgment carried from F-0-17). "Brine" is English. |
| c24 | **Venomantle** | **Venonat 0.911** | Veemon 0.769 | — | "manti" (Fomantis), "antle" (Stantler) | **FAIL (new)** | JW ≥ 0.88. Venonat and its evolution Venomoth are Bug/Poison; Venomantle is toxin/water. It shares the "Veno-" poison root and the poison typing. **Rename required.** Previously missed because the smaller list lacked Venonat. |
| c25 | Snipling | Dipplin 0.780 | Snivy 0.761 | — | — | clear | — |
| c26 | Marionyx | Marill 0.833 | Aron 0.833 | — | — | warn | Keep: no overlap. Note: "Mario" is a substring; Nintendo trademark sensitivity is low but recorded. |
| c27 | **Emberfold** (new) | Emboar 0.811 | Electrode 0.733 | — | — | warn | Keep: a pig starter vs a folding-screen spectre. "Ember" is English (and a Pokémon move name, which is acceptable as a dictionary word inside a compound). The D7 rename resolves F-0-03. |
| c28 | Dawnfry | Dragonair 0.705 | Dartrix 0.695 | — | — | clear | — |
| c29 | **Lumarlin** | Lumineon 0.825 | Lucario 0.824 | — | — | **warn → rename suggested** | Lumineon is a luminous neon fish (Water); Lumarlin is a luminous marlin (lumen). The "Lum-" prefix and a glowing-fish concept are shared, though the anatomy differs (a billed marlin vs a flat butterfly fish). Minor. Suggest a rename; the orchestrator decides. |
| c30 | **Coronaleen** (new) | Corsola 0.834 | Cottonee 0.827 | — | — | warn | Keep: coral and cotton vs a whale. The D7 rename resolves F-0-02. |

**Summary for species:**
- **New fail:** c24 Venomantle (JW 0.911 to Venonat).
- **New rename recommended:** c21 Samaraptor (Staraptor naming formula).
- **Rename suggested:** c29 Lumarlin (Lumineon).
- **Warns with keep judgments:** 13 names: Crackleap, Magmouflon, Floeguard, Belladrowse, Rollith, Cairnback, Rimelet, Gustling, Ringdrip, Brineloop, Marionyx, Emberfold and Coronaleen.
- **The three D7 renames** (Lullstalk, Emberfold, Coronaleen) introduce no failures.

### Results: character and other display names (post-D7)
| Name | Closest franchise name (JW) | Lev | Status | Judgment |
|---|---|---|---|---|
| **Arden** (new default protagonist name, D7) | **Arven** 0.893 (a major character in Pokémon Scarlet/Violet) | **1** | **FAIL (new)** | One letter from a current franchise lead. Under the short-name rule, Levenshtein 1 is decisive. **Rename required.** Candidates checked in the same run with no warn or fail: **Hollis** (0.733), **Emrys** (0.783), **Corwin** (0.746), **Fenwick** (0.657), **Hewitt** (0.679), **Holt** (0.778). |
| **Marra** Aske (D7) | Marshal 0.853 | 3 | warn (a short name, so JW is not decisive) | Keep. Aske vs Wake (0.833) is noise. |
| Dorran **Flint** (trial_2 stone Cantor) | **Flint**, exact: Pokémon Elite Four (Sinnoh), and Brock's father, a former Rock-type gym leader in the anime | 0 | **FAIL (new, kind-scoped exact match)** | Name plus role is close to a stone gym-leader relative, and the surname matches exactly. **Rename the surname.** Candidate checked: **Shale** (0.790 to Shauna; clear). |
| Cass Rookwell | Cress 0.805 | 2 | warn | Keep |
| Odile Graven | Graven vs Arven 0.878 | 2 | warn | Keep: a surname, no role overlap |
| Oriel Vantasse | Oriel vs Gordie 0.822 | — | warn (noise) | Keep |
| Brann Coldcourt | Brann vs Brendan 0.832 | — | warn (noise) | Keep |
| Vey Lanternlow | Lanternlow vs Lance 0.813 | — | warn (noise) | Keep |
| Tamsin Galloway | Tamsin vs Tai 0.867 | — | warn (noise) | Keep |
| Isaure Frostmere | Isaure vs Surge 0.822; Frostmere vs Rose 0.815 | — | warn (noise) | Keep |
| Garrow (Chandler) | Gary 0.825 | 2 | warn | Keep |
| Rhea Rookwell, Wren Mossgrave, Nerys Tidewell, Bastian Coalridge, Maud, Tobin, Ysolde, Pip, Nell, Wick | all < 0.80 | — | clear | — |
| Trait names (D13): *Headlong*, *Keystone Core* | "Headlong Rush" (a Pokémon move); "Key Stone" (the Pokémon Mega Evolution item) | — | Tier B warn | Keep, provisionally: both are English words used for an unrelated concept. Re-check in the full trait list once systems v2 lands. |
| Status names (D8): Scorch (SCH), Blight (BLT), Jolt (JLT), Drowse (DRW), Rimebite (RMB), Muddled | no exact franchise status names; the codes differ from SLP/BRN/PSN/PAR/FRZ | — | clear | The D8 rename resolves F-0-13. |
| Item ids (D10): `i_hush_1..2`, `i_thread`, `i_chime_*` | — | — | clear (ids) | Display names come from the CD glossary. Check them once they land. |

### Status of Phase 0 findings after DECISIONS.md
| Finding | Ruling | Status |
|---|---|---|
| F-0-01 Stillmark ≈ Team Plasma | D6 (goal, public face, look and methods all changed) | **Accepted in principle.** Closes once CD §2.3 and world v2 text land. Watch item added: avoid an energy-corporation framing (Macro Cosmos, Team Galactic). |
| F-0-02 Umbraleen | D7 → Coronaleen | Resolved (clear; warn only vs Corsola) |
| F-0-03 Cinderscrim | D7 → Emberfold | Resolved (warn only vs Emboar; judged keep) |
| F-0-04 Nodbell | D7 → Lullstalk | Resolved (clear) |
| F-0-05 Juniper | D7 → Marra Aske | Resolved (warn only; judged keep) |
| F-0-06 Floeguard | D7: no helmet, whisker nubs, shell only on back and tail | Accepted. Closes when the `creatures.md` c09 spec lands, and is re-checked at the Phase 2 and 3 cover test of the whole line. |
| F-0-07 cross-document cast and terms | D1, D2, D4, D5, D10 | Pending world v2, systems v2 and the CD glossary |
| F-0-08 face states | D14 | Resolved in gate v2 (GC-04). Pending the `creatures.md` and CD text. |
| F-0-09 timing | D15 | Resolved in gate v2 (GC-05) |
| F-0-10 proportion bands | **no ruling** | **Open.** Gate v2 CC-05 and GC-08 are warn-only until the CD publishes per-plan bands. |
| F-0-11 LOD2 features | D16 | Resolved in gate v2 (GC-18). Pending the rendering text. |
| F-0-12 Rowan | D7 → Arden | **Superseded by the new failure F-0R-01** (Arden–Arven) |
| F-0-13 status codes | D8 | Resolved |
| F-0-14 identical sibling pedlars | no explicit ruling | Open. Pending world v2 (D1 adopts the CD cast, including the peddler Wick). |
| F-0-15 item and terminology leaks | D10 (ids) | Partly resolved. The rendering §10.6 import summary still says "badges": open, and covered by gate v2 GC-12. |
| F-0-16 trait clones | D13 | Resolved for names. The numbers are unchanged; that is accepted as mechanics. |
| F-0-17 warn-band judgments | — | Carried forward, now extended by the tables above |
| F-0-18 Rippleback render check | — | Phase 2 cover test (unchanged) |
| F-0-19 c30 Wind Fish | D7 rename | Watch item kept (gate §4.2) |
| F-0-20 pupil types | no ruling | Open (CD or Creature Art Director) |
| F-0-21 "A wild…" pool | no ruling | Open. GC-14 now warns if more than half the pool starts with "A wild". |
| F-0-22 four harnesses | D27 | Resolved in gate v2 (§3.1, §3.5) |
| F-0-23 gate self-alignment | — | Done: gate v2 |

### New findings in this re-review
| ID | Severity | Affected requirement | Finding | Consequence | Proposed resolution | Owner |
|---|---|---|---|---|---|---|
| F-0R-01 | Major | CC-10; GC-13 | The D7 default protagonist name **Arden** is Levenshtein 1 from **Arven** (Pokémon Scarlet/Violet), JW 0.893 | GC-13 fails, and the name is shown constantly and in previews | Pick a new default. Checked clear: Hollis, Emrys, Corwin, Fenwick, Hewitt, Holt. | Orchestrator / CD |
| F-0R-02 | Major | CC-10; GC-13 | c24 **Venomantle** is JW 0.911 to **Venonat** (Bug/Poison), with a shared poison root and typing | GC-13 fails | Rename, then re-run the check | Creature Art Director |
| F-0R-03 | Major | CC-10; §4.2 naming formula | c21 **Samaraptor** is JW 0.869, Levenshtein 2 and shares the "raptor" substring with **Staraptor**. Both are raptor birds and flying types, and the name uses the same X + "raptor" formula. | A recognizable naming echo of a well-known species | Rename without the "-raptor" suffix | Creature Art Director |
| F-0R-04 | Major | CC-10; kind-scoped character list | The trial_2 stone Cantor's surname **Flint** exactly matches a Pokémon Elite Four member and the anime's Rock-type gym-leader father of Brock | A name plus stone-leader role echo | Rename the surname (for example **Shale**, checked clear) | CD |
| F-0R-05 | Minor | CC-10 | c29 **Lumarlin** is JW 0.825 to **Lumineon**, with a shared "Lum-" prefix and glowing-fish concept | A weak but thematic echo | Rename suggested; the orchestrator decides | Creature Art Director |
| F-0R-06 | Note | CC-10 | c06 Magmouflon has three weak signals (JW 0.813 Magmar, substring "magmo" with Magmortar, fire type) | Judged keep | The orchestrator may rename at no design cost | Orchestrator |
| F-0R-07 | Note | Method | The expanded reference list found two hits that the first run missed | Partial lists under-report | GC-13 must use QA's maintained list, and each gate records the list version | QA, release agent |

### Not run / Not measured
- Every automated gate check: Not run (no build).
- Every render-based check and rubric score: Not run (no renders).
- Review of the revised creative_direction, creatures, world and systems text: **Not run yet, because those revisions have not landed.**
- Name similarity: run against partial reference lists from general knowledge. This is not a trademark-register or web search.
- Second reviewer: pending.

### Decision
**pending** until the revised documents land.

To move to `pass` or `conditional_pass`, all of the following are needed:
1. The revised creative_direction, creatures, world and systems text reflects D1–D16, and I have re-read it.
2. F-0R-01 to F-0R-04 are resolved by renames, and the new names re-checked.
3. F-0-10 has a ruling or a CD per-plan band table. Until then CC-05 stays warn-only, and it may be carried forward as a Minor condition.
4. The open Minor items F-0-14, F-0-15 (import summary), F-0-20 and F-0-21 are either fixed or carried forward as conditions.

The earlier `fail` (`#p0-design-review`) remains the recorded design-gate decision until this entry is closed.
