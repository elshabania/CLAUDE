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
| Automated report | reports/gate/character/<sha>/report.json (sha256: <hex>) — exit code <0|1> |
| Silhouette sheets | reports/gate/character/<sha>/silhouettes_256.png, silhouettes_20.png, silhouette_pairs.csv |
| Manual captures | reports/review/phase<N>/<sha>/screens/ (<count> files) |
| Rubric | reports/review/phase<N>/<sha>/rubric.csv |
| QA gate (same commit) | <link to QA record> — <decision> |

### Scope
In-scope species/characters/surfaces per gate doc §2.1: <list>

### Automated checks
| Check | Status | Notes / evidence |
|---|---|---|
| GC-00 … GC-16 (GC-17 for deploys) | pass/fail/warn/not_run/not_applicable | <path or reason> |

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
**<pass | conditional_pass | fail>**. Rationale: <one paragraph>. A fail blocks this phase and every deployment until the problem is corrected and retested on a new build commit.
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
