# World Designer review of the six sibling design documents

Reviewer: World Designer (owner of `design/world.md`). Date: 2026-09-24. Scope: `creative_direction.md` (CD), `creatures.md` (CR), `systems.md` (SY), `rendering_and_architecture.md` (RA), `qa_plan.md` (QA), `release_character_gate.md` (RG). Only this file was written; no other document was edited.

Severity: **blocker** = the documents cannot all be implemented as written, or the critical path or a validator is undefined. **major** = rework or a failing check if left unresolved. **minor** = a local fix or a clarification.

## 0. Verdict summary

1. **World.md can adopt the Creative Director's story order.** The zone sizes, sheet format, spawn/roaming model, softlock method, quest/item structure and encounter generator all carry over. What changes is the graph wiring between `town_2` / `cave` / `route_3` / `lake`, the trial placements, the Resonance unlock schedule, the mandatory gate set, attuned types, level bands, and where the two starters come from (§1). I recommend adopting CD's order and publishing world.md v2 as the result of this review.
2. **The three-way conflict is in ids and numbers, not in design intent.** Item ids differ in CD, SY and world.md, and so do trial/boss level curves, evolution levels (CR vs SY) and the field-action rule. This review proposes one canonical source for each (§3).
3. **My "only starters are fire/water/electric" concern is partly resolved by CR.** It is answered for water; fire and electric remain only as late stage-3 wild species. None of these three types is on a mandatory gate under CD's rules, so the gap no longer blocks anything (§2).

---

## 1. Adopting CD's story order: feasibility and exact changes

CD order: `town_1 → route_1 → forest[T1 verdant] → route_2 → town_2[T2 stone] → cave → route_3 → lake[T3 water] → town_3[T4 gale] → route_4 → volcano[T5 fire] → route_5 → snowpeak[T6 frost] → league`.
World.md v1 order: `… town_2[T2 gale] → route_3 → cave[T3 stone] → (back to town_2) → lake[T4 frost] → town_3 → route_4 → volcano[T5 fire] → route_5 → snowpeak[T6 lumen] → league`.

**Feasibility: yes.** CD's order is a linear chain. World.md v1 already uses the same 14 zones, the same league placement, the same volcano position (a branch off route_4) and the same route_4 Updraft gate. The v2 deltas below touch data only; no zone needs a new size or a new biome.

### 1.1 Graph (adjacency table, world.md §1.3)

| Edge | v1 | v2 (CD order) |
|---|---|---|
| E5 | town_2 W (−75,0) ↔ route_3 E (100,0), Gust Gap gate G3 | town_2 W (−75,0) ↔ **cave E (90,0)**. No field-action gate. Story: `flag_trial_2_cleared` (miners' barrier NPC). |
| E6 | route_3 W ↔ cave E | **cave N (−40,−90) ↔ route_3 W (−100,0)**. The cave exit lies beyond CD's mandatory **Heave** node in the lower galleries. |
| new | — | **route_3 E (100,0) ↔ lake S (0,100)**. route_3 becomes CD's fen (Sallowfen). |
| E8 | town_2 N ↔ lake S, Shift boulder G5 | **Removed as a mandatory link.** Kept as an optional post-trial_3 shortcut from lake SE (60,95) to town_2 N (40,−75), opened from the lake side with Heave (same idea as v1's one-sided cave tunnel). |
| E9 | lake N ↔ town_3 S, Freeze gate G6 | Same edge, **no field action**. CD ch7 says "ferry or causeway": the causeway (0,−80) opens on `flag_trial_3_cleared` (the Cantor lowers it). |
| E12 | town_3 N ↔ route_5, Dissolve rust-lock G9 | Same edge. The gate becomes the story flag `flag_trial_5_cleared` (CD ch10 prereq). The rust-lock turns into an optional Seep node beside it. |
| E14 | snowpeak N ↔ league, Illuminate tunnel G11 + boss flag G12 | Same edge. G11 is replaced by CD's mandatory **Rime frozen falls** at (0,−55). G12 = `flag_nullbell_broken` ∧ 6 Keynotes (CD ch12). League access is CD's "resonance lift". |
| E7 | cave S ↔ route_2 W (optional tunnel) | Unchanged (optional). |

### 1.2 Trials, unlocks, mandatory gates

| | v1 | v2 (CD) |
|---|---|---|
| trial_1 | forest, verdant, Bloom | forest (Rootloft, door at (40,−50)), verdant. Keynote 1 → **Heave** |
| trial_2 | town_2, gale → Updraft | town_2 (Knell Hall at (0,−55)), **stone**. K2 → **Seep** |
| trial_3 | cave, stone → Shift | **lake** (Mere Hall on piles; reuses the v1 island/ferry at (0,−20)), **water**. K3 → **Gust** |
| trial_4 | lake island, frost → Freeze | **town_3** (Vane Hall, new door at (−20,−55)), **gale**. K4 → **Veil** |
| trial_5 | volcano, fire → Dissolve | volcano, fire (unchanged). K5 → **Rime** |
| trial_6 | snowpeak, lumen → Illuminate | snowpeak, **frost** (Rime Hall at (−50,−15)). K6 → **Gleam** |
| Tutorial | Spark/Kindle/Surge | **Rootcall** + triad (Spark/Kindle/Swell) |
| Mandatory type gates | 9 (starter Tri-Gate, verdant, gale ×2, stone, frost ×2, toxin, lumen) | **4**: Rootgate at forest S entry (0,80), verdant; cave lower-gallery Heave (30,−20), stone; route_4 Gust (−62,5), gale (= v1 G8); snowpeak Rime falls (0,−55), frost. Each has a Resonance Steward NPC within 15 m (CD R1). |
| Removed | — | v1 G1 (starter Tri-Gate; violates CD R2 "starter types never mandatory"). It becomes the town_1 triad secret node. G3, G5, G6, G9 and G11 become optional secrets or story flags. |

The v1 forest ravine Sprout Bridge (−20,−70) stays a Rootcall node. Rootcall is unlocked at the tutorial, so the bridge is no longer post-trial. The v1 softlock table (§3.2) is re-derived for the 4 gates (§1.4).

### 1.3 Attuned types, weather, levels (world.md §1.4 / §4)

- **Attuned types (adopt CD §1.2):** route_1 lumen, forest verdant, route_2 stone, cave electric, route_3 toxin, lake water, route_4 gale, volcano fire, route_5 shade, snowpeak frost. Towns and league are neutral.
  - v1 differed in 8 of the 10.
  - Trial interiors use the Cantor's type.
- **Weather sets:** add `sunlight` to volcano (clear 45 / sunlight 30 / fog 25), per CD's heat bias and SY §5.1. The other sets are unchanged.
- **Re-banded wild levels.** These follow CD chapter targets and SY §14.2. Rows marked "same" keep v1 bands.

| Zone | v1 Lv | v2 Lv | Notes |
|---|---|---|---|
| route_1 | 3–7 | same | Plus the **static** c10 Lv 4 by the stile (CD ch1 guaranteed capture) |
| forest | 6–12 | same | |
| route_2 | 11–16 | same | |
| cave | 18–26 | **16–21** | Drop c17 and the deep-level stage-2s above evolution level; add c15 only post-game |
| route_3 | 15–21 | **19–24** | Fen: add c22/c23 (common, rain boost, per CR habitat) and c10/c11; c25 at night |
| lake | 24–31 | **22–27** | c23/c24 lake (CR habitat), c28/c29; frost optional |
| route_4 | 28–35 | 28–34 | c19/c20 on the lower slope *before* the vent |
| volcano | 33–40 | 33–38 | |
| route_5 | 38–44 | 38–43 | Keeps c16/c17: the frost source before snowpeak Rime |
| snowpeak | 42–48 | 42–47 | |

### 1.4 v2 no-softlock re-check for CD's 4 mandatory gates

Each row shows where the needed type is available before the gate, taken from v1 tables that stay after re-banding.

| Gate | Type | Available before the gate (day-clear weight > 0) | Extra guarantees |
|---|---|---|---|
| forest Rootgate | verdant | Static c10 (route_1); c10 route_1 35/25 | Steward |
| cave Heave | stone | c13 route_1 15, forest 5, route_2 35/25; cave upper 30 (before the node) | Steward |
| route_4 Gust | gale | c19 route_1/2/3, forest; c20 lake 15 | Steward |
| snowpeak Rime | frost | c16/c17 route_5 30/10 (day) and 25/10 (night); snowpeak foot | Steward |

- All four registers unlock before their gate: Rootcall at the tutorial, then K1 < cave, K3 < route_4, K5 < snowpeak.
- A Steward sits within 15 m of each gate.
- Fainted kin can resonate (CD R3 = SY 15.4).

### 1.5 Story, starters, NPC and trainer relocation

- **Starter route: replace v1 §5.2 with CD §4.1.**
  - The rival pick follows SY's triad (fire > electric, water > fire, electric > water).
  - **Leftover starter** (the line the player's starter beats): rescued at the route_4 Stillhouse in ch8. Oriel gives it at **Lv 25** in town_1 (`q_foster_leftover`).
  - **Rival's line:** comes through `q_second_clutch` after trial_5 at **Lv 30**.
  - This drops the v1 gifts: Gift A from the mentor (Lv 22, town_2) and Gift B from the volcano vault (Lv 30).
  - The v1 Foundry vault moves to the route_4 Stillhouse. v1's Hush "Damper" beats map onto CD's Chordstone silencing.
- **Rival battles (6, CD §2.2):** R1 town_1 (5,−35), R2 route_2 (0,−70), R3 route_3 boardwalk end (90,0), R4 route_4 Stillhouse (−40,−20), R5 route_5 (0,−85), R6 league (0,10).
- **Admins and boss:**
  - Brann: cave hideout (30,−62) in ch4; summit path (0,−75) in ch11, no battle.
  - Vey: route_3 fen stone (−30,10); Stillhouse.
  - Odile (two-phase): summit (0,−84) after trial_6.
- **Waystones: 14** (one Chordstone per zone, CD §3/§6.6) instead of 9. Rest sites (heal only) remain at the lake stilt-hamlet, volcano base and snowpeak lodge. The v1 forest and cave camps are proposed to CD as extra Hearthrests; if CD declines, safe-return for those zones falls back to the previous town (SY 15.1).
- **Names:** swap every v1 working name for CD names (Larkhollow, Murmurwood, …, the Stillmark, Oriel, Cass). The region is **Cantarra**.
- **Effort estimate (not measured):** about 40 % of world.md tables change values. No section needs to be redesigned.

---

## 2. creatures.md secondary types vs my "only starters are fire/water/electric" concern

| Type | Wild carriers (CR §0) | Earliest wild level | Status |
|---|---|---|---|
| water | c23 Brineloop (toxin·water), c24 | c23 from its evolution level (CR 22 / SY 18) | **Resolved.** The lake/fen have a water-typed wild species. |
| fire | c27 Cinderscrim (shade·fire), stage 3 only | CR 42 / SY 40 | **Partly resolved.** No fire wild before the late game; the volcano's attuned fire has only a rare night c27. |
| electric | c15 Lodestodon (stone·electric), stage 3 only | 36 | **Partly resolved.** CD's cave is electric-attuned but hosts no electric wild at its levels (16–21). |

**Consequence.** No softlock follows: CD R2 keeps starter types off mandatory gates, and SY's rule is that any party member counts. The gap is thematic and affects secrets only: Spark and Kindle secrets need the starters or the later gifts. **Severity: minor.**

**Resolution.**
- Accept as is.
- The fire Cantor's team uses f02 (c05/c06), c06 (fire·stone) and c27; NPCs may own starter lines.
- Optionally CD could swap the cave's attunement to stone and route_2's to electric. That is **not required**, and it would break CD's "each type once" rule, so I recommend keeping CD's table.

---

## 3. Critiques (document § → issue)

| # | Doc § | Issue | Affected requirement | Consequence | Sev. | Proposed resolution |
|---|---|---|---|---|---|---|
| 1 | CD §1.2/§4 vs world.md v1 | Different critical path, trial types and order, mandatory set and unlocks | Brief D; QA D-30/D-33/D-35; SY §14 chapters | No single walk exists; QA validators cannot be written | **blocker** | Adopt CD order. World.md v2 applies §1 of this review. |
| 2 | CD §3, SY §7.1/§12, world.md §2.1/§7 | Item id triplicate: `i_chime_*` / `i_orb_*` / `i_capture_t*`; `i_keynote_*` / `i_mark_*` / `i_crest_*`; `i_etude_mXXX` / `i_disc_01..18` / D01–D30; salves / tonics | ANCHORS stable ids; QA D-03 reference integrity | Dangling references; the build fails validation | **blocker** | **SY ids are canonical** (functional). CD names are display strings only. CD drops its id column; world.md migrates. |
| 3 | SY §8.3 vs CR §5 | Evolution levels differ (f04 16/32 vs 18/33, f06 22/38 vs 26/40, f08 18/34 vs 22/37, f09 24/40 vs 28/42, f10 26/44 vs 30/44) | Brief C; encounter level ranges | Wild stage-2/3 levels and gift levels can't be validated | **major** | Orchestrator picks **SY** (its curves are tuned to §14). CR updates its table. |
| 4 | world.md v1 §4.3 (self) | Wild stage-N spawns below the stage N−1 evolution level: c11 forest 11–12, c14 route_2 16, c26 route_2 16 / route_3 19–21, c15 route_4 35 | Brief D level ranges; plausibility | Contradicts the evolution rules | **major** | v2 adds a validator rule: wild stage ≥ 2 level ≥ the evolution level of the previous stage (per SY). Re-band with the script. |
| 5 | SY §14.1 vs CD §4 vs orchestrator targets | Trial ace levels are 14/20/26/32/38/43 (SY) vs 12/18/25/32/39/45 (orchestrator) vs CD bands. Faction boss sits **before** trial_6 at Lv 42 in SY but after trial_6 in CD. SY has 5 rival battles, CD has 6. SY puts R3 before trial_4; CD before trial_3. | Brief C difficulty curve; D story placement | Trainer data can't satisfy all three | **major** | Use SY's numbers for trials. Move the boss after trial_6 at Lv 44–47 and add R6 (CD). SY re-tunes §14.1 rows R3–R6 and the boss. World places them per §1.5. |
| 6 | SY §5.5, CD §6.3 vs world.md v1 §0 | Field action: v1 required the lead creature plus a swap; SY/CD allow any party member, fainted or not | Softlock-proofing | Rule mismatch in code | minor | Adopt SY/CD. World.md v2 drops the lead rule. |
| 7 | SY §5.4 vs CD §6.4 | Attunement ×6/5 (SY) vs ×1.10 (CD) | Brief C/A signature mechanic | The HUD pill and the damage math disagree | major | Orchestrator picks one. I suggest ×1.10 (CD), since both sides get it and it's a "modest" bonus; SY updates its test vectors. |
| 8 | CD §6.4 "gale → wind" | `wind` isn't a SY weather id; RA has `storm`, which SY lacks | QA D-13 weather-id consistency | D-13 fails | minor | Weather ids = SY set {clear, rain, snow, fog, sunlight}. Drop `wind`. RA maps `storm` → rain visual only, or drops it. |
| 9 | RA §5.2 vs world.md v1 §0, CR habitats | 4 clock phases (RA) vs day/night (world) vs "dawn only" (CR c28) | Brief D time tables; QA U-WTH-08 | Mismatched encounter keys | minor | Encounter bands stay 2: **day = morning + day (05:00–16:59), night = evening + night**. Reject dawn-only spawns. Rest-until at Hearthrests. RA keeps 4 phases for lighting only. |
| 10 | RA §6.1/§6.2 vs world.md v1 §4.2 | Max active wild is 8/6/4 by profile; world v1 had cave 10 and several zones at 8 | Brief E budgets | Over budget on Balanced/Mobile | major | Runtime cap = min(zone max, profile max). Cave total 6. Zones keep a declared max ≤ 8. |
| 11 | RA §2.6 vs world.md v1 §4.2 | Spawn distance ≥20 m and respawn 15–30 s (RA) vs ≥30 m and 12 s (world) | QA U-ENC/B-06 | Two sources of truth | minor | RA owns the numbers. World v2 defers to RA §2.6 and keeps only the per-zone max, the anchors and the exclusion zones. |
| 12 | RA §2.7 | Every zone needs ≥1 hand-placed `battleStages`; world v1 provides none | Brief 5 battle staging; RA validation | Data validation fails | major | World v2 adds 2–4 stages per zone (one per wild region plus mandatory trainer spots). Answer to RA Q8: hand-placed stages are mandatory and auto-search is the fallback. |
| 13 | RA §10.5 vs QA B-12 | Reload resumes at the zone entry spawn (RA), but B-12 expects "within 1 m of the save point" | QA evidence | B-12 fails by design | minor | QA changes B-12 to "at the saved zone's entry spawn". World v2 gives every arrival point a stable id `sp_<zone>_<exit>`. |
| 14 | RA §3.1 heightfield | Single-valued heightfield: world v1's cave upper/deep levels and the snowpeak tunnel/overhangs need props | Brief E terrain | Geometry can't be represented | minor | World v2 states that the cave levels don't overlap in plan view (already true in v1). Overhangs and tunnels are building-class trimesh props (RA "buildings" exception). |
| 15 | SY §12.2 | 18 discs with suggested sources; world v1 has 30 slots | Brief C ≥ discs; D placements | Id mismatch | minor | World v2 places `i_disc_01..18` using SY's suggested sources, re-mapped to CD's trial order (e.g. "trial_3 reward" → lake). v1's extra 12 slots become consumable rewards. |
| 16 | SY §12.1 `i_evo_prism` | A guaranteed pickup is required and isn't placed | Obtainability of c30 before Lv 44 | c30 needs Lv 44 without it | minor | World v2: prism = `q_side_survey` stage-2 reward (town_3), plus a hidden pickup in the snowpeak lodge loft (35,55). |
| 17 | SY §12.5 | The economy assumes ~5–10 trainers per chapter; world v1 has 75 (e.g. 11 before trial_1 vs 5 + rival) | Brief C non-grindy economy; XP curve | Over-levelling and extra income | major | World v2 marks ~40 % of route trainers optional-hidden or cuts to ~55. SY re-runs its §12.5 sim with world's final per-chapter counts (SY Q6). |
| 18 | SY §15.1 vs world v1 §2.5 | Wipe returns to the "last healing center visited" (SY) vs per-zone safe-return (world) | Brief D safe-return | Two rules | minor | Adopt SY's rule. World lists the healing points and guarantees one per chapter zone cluster. |
| 19 | CD §6.2 Swell "resets after 60 s" | A real-time timer (secret only) | Brief D "no real-time wait blocks completion" | None for completion; also affects the q_side_kite/secret design | minor | Allowed because it's never mandatory. QA D-36 whitelists it. |
| 20 | CD §2.4 Wick "sells a rotating item" | Rotation rule unspecified | Brief D, D-36 no real-time dependency | Could imply a real-clock rotation | minor | Rotate on the Keynote count (deterministic). World v2 tables it. |
| 21 | CD ch1 | Guaranteed f04 capture encounter must be world data | CD §6.2 guarantee | Missing data | minor | World v2 adds a static c10 Lv 4 at route_1 stile (−10,70), respawning until caught (`flag_capture_tutorial`). |
| 22 | CD §1.2 vs CR habitats | CR suggests frost at snowpeak/route_5, lumen at lake/route_5, toxin at lake/fen, shade at route_4/cave mouth; v1 spread them early | Brief B/D habitat coherence | Lore mismatch | minor | The v2 re-band (§1.3) follows CR habitats where no mandatory gate needs earlier access. |
| 23 | CR Q3 | Is c30 scripted? | Obtainability | Open | minor | Keep c30 a rare night snowpeak wild (weight 5) plus evolution. No scripted encounter. |
| 24 | QA D-33 | Uses `flag_trial_n_complete`; CD/world use `flag_trial_n_cleared` | QA D-32/D-33 | Flag mismatch | minor | QA uses `_cleared` (CD §4.2 master list). |
| 25 | QA §6.2 fixtures | `fx_save_each_starter_{voltra,emberhorn}`, but CR renamed them (Fizzkit/Wickwool) | Stable ids | Stale names | minor | Key fixtures by species id (`c01/c04/c07`). |
| 26 | QA D-06 | Requires an unconditioned base table | Brief D tables | World uses day/night bases plus weather multipliers | minor | Define "base" = the day-clear table. D-06 checks that every (band, weather) resolves to non-empty. |
| 27 | RG GC-02 | Every trainer/NPC needs a builder or documented archetype; named characters unique | Brief G; production load | ~75 trainers + ~35 NPCs unmapped | major | World v2 adds an archetype column: ~16 trainer-class archetypes and ~6 NPC archetypes. Named uniques ≈ 22 (protagonist, Cass, Oriel, Rhea, Odile, Brann, Vey, 6 Cantors, Jun, Wick, 3 Hearthkeepers, 3 Chandlers). |
| 28 | RG §3.4 Tier B | "league", "champion", "revive" are ids only | Brief 1 terminology | Tier B hits if shown to players | minor | Ids stay. The display uses CD terms (Concord Spire, Concordant). World display text is CD-only. |
| 29 | CD §4 total 9 h 20 m vs SY 8.6 h vs world 8 h | Three estimates | Brief 1 (8–10 h) | Pacing ambiguity | minor | All are unmeasured estimates. Use CD's chapter table as the budget; world v2 re-sums per zone. |
| 30 | CD §6.6 R1 Stewards | Stewards lend a kin, so capture is never needed at gates | Signature mechanic integrity | Weakens "collection matters" | minor | Keep them (they are CD's softlock rule), but a Steward appears only after one failed prompt. World places them 10–15 m from the node. |

---

## 4. Dependencies created by this review

- **Orchestrator:** rule on #2 (ids), #3 (evolution levels), #5 (level curve and boss placement), #7 (attunement multiplier).
- **CD:** confirm the extra Hearthrests (forest and cave camps), the causeway to town_3, and the Stillhouse location on route_4 (−40,−20).
- **SY:** re-tune §14.1 for 6 rival battles and a post-trial_6 boss; re-run §12.5 with world v2 trainer counts.
- **RA/QA:** accept #10, #11, #13 and #26.

## 5. Risks

- **Ruling order:** if world.md v2 lands before the id ruling (#2), data files churn twice. Mitigation: v2 uses SY ids now.
- **CD's linear chain has less backtracking and fewer loops than v1.** This risks a corridor feel. Mitigation: keep the optional cave↔route_2 tunnel and the lake↔town_2 shortcut.

## 6. Unresolved questions

1. Does the orchestrator accept SY ids as canonical and CD terms as display-only?
2. Is ×1.10 or ×1.2 the attunement multiplier?
3. Are forest and cave camp Hearthrests acceptable to CD (they shorten the walk to safe-return)?
