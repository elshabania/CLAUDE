# Systems Designer review of the six sibling documents

Reviewer: Systems Designer (owner of `design/systems.md`). Date: 2026-09-24. Scope: creative_direction.md (CD), creatures.md (CR), world.md (WD), rendering_and_architecture.md (RA), qa_plan.md (QA), release_character_gate.md (RG), checked against systems.md (SY) and ANCHORS.md.
Method: I read the sections that feed battle math, progression, economy and data contracts. Numeric checks (XP accumulation over WD §2.9 trainers, income under the SY §12.4 payout rule) come from a throwaway script. They are **design estimates, not measurements or playtests**.
Severity: **blocker** = content JSON cannot be authored consistently, or a brief requirement fails. **major** = balance or feature breaks without a change. **minor** = wording, ids or test tweaks.

Totals: 4 blockers, 15 majors, 31 minors. Section 8 lists every change I will make to systems.md in revision 2, so the other owners know which side moves.

---

## 1. Cross-document blockers (the orchestrator must arbitrate. Systems data depends on them.)

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| X1 | The trial type order conflicts. CD §1.2/§4: verdant, stone, water, gale, fire, frost. WD §2.2: verdant, gale, stone, frost, fire, lumen. Field-action unlock order also differs: CD §6.2 has Heave@t1, Seep@t2, Gust@t3, Veil@t4, Rime@t5, Gleam@t6. WD §2.3 has Bloom@t1, Updraft@t2, Shift@t3, Freeze@t4, Dissolve@t5, Illuminate@t6, and Veil comes from the story. | Six challenges in order; mandatory field actions are softlock-proof | Leader teams, disc slots D01–D06, zone attunement and mandatory-gate proofs cannot be authored. | blocker | CD owns this call. WD then re-derives §2.2/§2.3/§3.2. Systems tables are type-agnostic except the D01–D06 disc mapping (§8.1), which follows whichever order wins. |
| X2 | Item ids are three-way inconsistent. Capture devices: SY `i_orb_1..4`, CD `i_chime_reed/brass/silver/crown`, WD `i_capture_t1..4`. Badges: SY `i_mark_*`, CD `i_keynote_*`, WD `i_crest_*`. Discs: SY `i_disc_01..18`, CD `i_etude_mXXX`, WD `D01..D30`. Heals: SY `i_salve_1..4`, WD `i_tonic_s/m/l/max`. | Stable ids with reference validation | `items.json` cannot validate against the WD pickups, shops or quests. | blocker | Adopt the CD ids for named things: `i_chime_*`, `i_keynote_1..6`, `i_etude_m###`. Consumables use the SY ids. SY revision 2 renames; WD replaces its provisional ids. The RG tier-B scan also flags `orb` and `revive` inside id strings, which this removes (see R2). |
| X3 | Rival count and pick rule. CD: 6 rival battles, and the rival takes the starter strong against the player's. WD: 5 plus a postgame one, and the rival takes Gift B's line (§5.2). For player c01 that gives the rival water, which is **weak** to electric. SY §14: 5 rivals, type-advantage pick. | Recurring rival; starter triad | The WD table inverts the intended matchup, and the story and trainer data disagree on the number of fights. | blocker | Use 6 rivals and the type-advantage pick (CD rule; it matches the SY matrix: water>fire>electric>water). WD §5.2: Gift B = rival's line, Gift A = the remaining line. For c01: rival c04, Gift A c07, Gift B c04. The rival post-game fight stays optional. Levels in §5 below. |
| X4 | The antagonist roster conflicts. CD: Admin Brann ×1–2, Admin Vey ×2, Magister Odile (two phases). WD: Admin Sabine, Admin Corwin, optional vault warden, Director Vell. SY §14: A1, A2, boss. | Antagonist questline; difficulty table | Trainer data and flags (`flag_admin_vey_1` vs `flag_cave_hideout_cleared`) cannot both exist. | blocker | CD owns names and beats. Systems accepts CD's count. The canonical battle table is in §5. WD re-slots its trainers onto those beats. |
| X5 | Starter names differ. CR renamed them Fizzkit/Wickwool/Rippleback; CD and WD still use Voltra/Emberhorn. The same name is used for different things: CR trait "Slipstream" (c08) and SY move m063 *Slipstream*. | Stable names; originality review | UI strings collide; the encyclopedia and dialogue will not match. | minor | CD confirms the final names. Until then, the SY working name for m063 becomes *Tailwind Dart* to avoid the collision. |

---

## 2. creatures.md

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| C1 | BST vs SY §2.1 bands (st1 280–320, st2 395–435, st3 505–535). All stage 1 are inside (285–320). Stage 2 outside: c20 390. Stage 3 outside: c12 495, c21 490, c30 540. | Stat balance | A small deviation, and it is deliberate (early lines weaker, late lines stronger per CR §5). | minor | **Accept CR numbers.** SY revision 2 widens the bands to st2 385–435 and st3 485–545 and keeps the zod range check on the widened bands. |
| C2 | Evolution levels differ from SY §8.3. Starters agree (16/34). f04 18/33 vs 16/32; f05 20/36 agree; f06 26/40 vs 22/38; f07 14/31 vs 14/30; f08 22/37 vs 18/34; f09 28/42 vs 24/40; f10 30/44 level-only vs 26 + `i_evo_prism` or 44. | Evolution rules | Learnset evolution moves (★) sit at SY levels, so the tables disagree. | major | **Adopt CR levels for f04–f10.** SY drops `i_evo_prism` (fewer items and no softlock surface), moves ★ moves to the CR levels, and re-checks the §11 coverage guarantees. Constraint on CR: no further changes without re-running the XP model. |
| C3 | Growth curves differ. CR: f04 medium, f05 medium, f06 slow. SY: fast, slow, medium. | Level curve | Minor level offsets (≈1–2 levels by Lv 40). | minor | Accept CR growth. SY §2.1 follows. |
| C4 | Catch rates are per species (25–255) and not derived by stage as SY specifies. | Capture formula | Both work with the SY formula (0–255 scale). | minor | **Accept CR per-species values.** SY drops its derived catch-rate rule and validates 3 ≤ C ≤ 255, with starters fixed at 45. Worked example 7.5 is unaffected. |
| C5 | XP yield factors 0.20/0.35/0.48 vs SY 1/5, 1/3, 4/9. | XP economy | Yields are 5–8% higher. Combined with the WD team sizes (W3), this worsens over-levelling. | major | Keep the **SY factors**, since the XP formula is systems-owned. CR regenerates the XP column: floor(BST/5), floor(BST/3), floor(4·BST/9). Example: c03 = 233, not 252. |
| C6 | Secondary types (CR §0) were unknown when the SY learnsets were written. Stage-3 lines with **no move of their secondary type** in the learnset: c18 frost·lumen, c24 toxin·water (also c23 at stage 2), c27 shade·fire, c30 lumen·shade, c20/c21 gale·verdant. | "Each family can reach 4 useful moves incl. coverage" | Secondary STAB is wasted, and a player may wrongly read the secondary type as cosmetic. | major | SY revision 2 adds secondary-type moves at or after the stage that gains the type. f06: m096 at ★st3, m099 at 44. f07: m036 at 17, m038 at 27. f08: m015 at ★st2, m019 at 36. f09: m005 at ★st3, m007 at 45. f10: m088 at ★st3. Disc compatibility already includes the species' own types. |
| C7 | Notable 4× weaknesses from the new dual types: c06 fire·stone ← water; c20/c21 gale·verdant ← frost; c27 shade·fire ← gale. c03 electric·gale is immune to stone. | Balance | These are acceptable and add texture. The rival ace (c06 when the player picks electric) is 4× weak to water, so a Gift-A water player trivialises R5/R6. | minor | Keep. The rival's R5/R6 teams must include a verdant or electric answer to water (the data author checks SIM-01). |
| C8 | Trait model. CR proposes 1–2 traits per species with a per-individual roll, and 27 bespoke traits. SY has one trait per species from a canonical 26. | Passive traits; testability | 27 extra behaviours; the AI estimate needs per-instance traits; many depend on inputs the sim does not have (day/night, "gale weather", `ground_quake` tag, once-per-battle memory). | major | **One fixed trait per species for v1.** The mapping (CR name → canonical id) is below. I add two CR ideas to the canonical list as `tr_solid_plating` (super-effective damage taken ×4/5) and `tr_lodestone` (on entry, foe spe −1). **Rejected:** Sprint Start, Storm Sail, Kindle Core (as written), Shell Tail, Nodding Pollen, Borealis Ring, Updraft, Samara Spin, Rotor Hover (redundant: stone→gale is already 0), Warning Rings, Brine Ballast, Cutout, Puppeteer, Backlight, First Light (day-based), Eclipse Body. Reasons: needs a missing input, a hidden per-battle state, or duplicates. |
| C9 | CR status placeholders map to the SY ids: Numbed→`paralysis`, Chilled→`frostbite` (no "slow" component), Drowsy→`sleep`, Toxified→`poison`, Burn→`burn`. | Status ids | — | minor | Confirmed. CR replaces the placeholders. |
| C10 | CR §10 expects a move tag `ground_quake` and move-animation references to the `attack`/`attack_special` clips. | Animation refs | No tag exists in SY. | minor | No tags in v1. The SY `anim` id → clip mapping is in R3. |

Trait mapping (species → canonical id, v1): c01–c02 `tr_static_hide` (CR Sparkhide at 30%), c03 `tr_last_stand`. c04–c05 `tr_last_stand` (replaces Kindle Core), c06 `tr_solid_plating`. c07 `tr_sturdy_core` (replaces Shell Tail), c08 `tr_rain_glide`, c09 `tr_frost_hide`. c10 `tr_early_riser`, c11 `tr_toxic_skin`, c12 `tr_regrowth`. c13 `tr_sturdy_core`, c14 `tr_thorned`, c15 `tr_lodestone`. c16 `tr_frost_hide`, c17 `tr_snow_coat`, c18 `tr_resonant`. c19 `tr_keen_focus`, c20 `tr_small_strikes`, c21 `tr_keen_focus`. c22 `tr_shed_status`, c23 `tr_tide_sink`, c24 `tr_toxic_skin`. c25 `tr_fog_veil`, c26 `tr_menace`, c27 `tr_adaptive`. c28 `tr_regrowth`, c29 `tr_keen_focus` (CR Glint Bill), c30 `tr_thick_fur`. Starters: CR wanted a starter-specific trait 1. `tr_last_stand` on c03/c04/c05 is the only deviation from CR names; CR may swap within the canonical list.

---

## 3. creative_direction.md

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| D1 | Resonance: CD ×1.10 "power", after same-type bonus and before type effectiveness. SY: ×6/5 damage at step 2. | Signature mechanic in battle | Two values for one rule; the golden test vectors differ. | major | **Recommendation: ×1.10, implemented as `×11/10` on damage directly after the same-type-bonus step (SY step 5b), before type effectiveness.** Reasons: (a) the bonus applies to both sides, and in trial halls attunement = the leader's type, so ×1.2 gives every leader a 20% home advantage on top of the hard AI and larger WD teams. (b) Wild natives mostly share the zone type, so ×1.2 inflates early wild damage when the player has 1–2 creatures. (c) ×1.1 still changes KO thresholds noticeably, and the HUD pill makes it legible. (d) Players who lean in get `tr_resonant` = `×13/10`. SY §16 worked example changes: Arc Lash 50 → **48**, and the rival survives the burn tick at 1 HP. SY revision 2 recomputes all test vectors. |
| D2 | Silenced zones (route_3 until ch5, route_5 until ch11) and Odile phase A need "no attunement". | Resonance states | SY assumes every zone has `attunedType`. | minor | `attunedType: TypeId \| null`; null = no bonus, and the HUD shows "Silenced". RA `BattleSetup.zoneAttunement` becomes nullable. |
| D3 | Odile's two-phase fight: "one trainer battle with two scripted teams". The phase B trigger is her third faint, and it restores frost ×1.1 against her ace. | Antagonist climax; state machine | The SY turn loop has no mid-battle script hook. | major | Add `trainer.phases[]`, where each phase = `{team: TeamSlot[], attunement: TypeId\|null, trigger: {faintedCount: n}}`. The hook runs in SY faint resolution (step 8), **after** XP and **before** the AI replacement: emit `phaseChange{attunement}` (RA: new BattleEvent; presenter plays the cutscene). Player state carries over, with no heal. Odile = phase A: 3 creatures (Lv 42, 43, 44, attunement null); phase B: ace Lv 46 stage-3 f09, attunement frost. Hard AI. A loss re-arms the whole battle from phase A. |
| D4 | CD §4 "Rival 4 (tag-in)". | Singles only (ANCHORS) | If this means a double battle, it is out of scope. | major | Confirm that "tag-in" is narrative only (Cass arrives, then a 1v1). SY supports singles only. |
| D5 | CD Fosterage full: the Chime is greyed out and no capture is attempted. SY §7.4: throw allowed, then a mandatory release prompt. RA §1.5 and QA U-CAP-11 match CD. | Full-storage behaviour | Three documents against one. | minor | **SY adopts CD pre-block.** Release lives in the Fosterage ledger only. Gifts go to storage, or are held pending when both are full (WD §5.2, QA U-PTY-06). |
| D6 | CD Crown Chime is "near-certain". With SY ×3.0, a full-HP stage 3 (C 45) is ≈18%; at 1/3 HP ≈ 55%. | Four capture tiers | The flavour promises more than the math delivers. | minor | Keep ×3.0: a sold near-certain device would trivialise capture. CD changes the flavour to "the steadiest Chime". Alternative if CD insists: a non-sold ×255 key reward, one per save. |
| D7 | Weather bias "gale → wind" and "fire → heat". | Weather states | SY has no `wind`; `heat` = SY `sunlight`. | minor | Map heat→`sunlight`. Drop wind, or treat it as `clear` with a visual-only effect. |
| D8 | Story-battle loss rule. CD §4.3: only R1 continues on a loss; all others re-arm. WD §2.5: all rivals are non-blocking (the flag is set on a loss). | Anti-softlock; progression | Conflicting flag semantics. | minor | **CD rule** (R1 non-blocking; others re-arm). Rival fights are difficulty checkpoints and money/XP sources. Neither variant can softlock. |
| D9 | Chapter target levels (CD §4 table) vs SY §14. Trial_1 8–12 vs SY 12–14; trial_2 13–17 vs 17–20; others within ±2. | Difficulty curve | Minor drift. | minor | Canonical levels in §5 (the WD ace levels, which sit between the two). |
| D10 | CD capture-throw presentation vs SY §7.3 "3 shakes, 700 ms each". RG §4.2 flags a copied throw-and-wobble cadence as an imitation risk. | Originality | Recognisable cadence. | major | SY revision 2 reframes each passed check as a **chime ring**: the light band tightens one notch per ring, pitch rises, and there is no wobble. Timing stays 3 × 600 ms; the sim `shakes:0..3` field is unchanged (rename to `rings`). |

---

## 4. world.md

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| W1 | 74 non-postgame trainers vs the SY §12.5 assumption of ≈66. Income under the SY payout rule over the WD list ≈ 79,900 vs the SY plan ≈ 77,200. | Economy | Trainer income is consistent. | minor | Accept the WD counts. SY §12.5 is re-derived from the WD list. |
| W2 | Quest and pickup money is large. Main quests 41,300 + side quests 13,000 + coin pouches 5,800 ≈ **60,100**, i.e. +75% on top of trainer income. | Non-grindy economy | Money stops mattering by ch6: tier-4 Chimes and max heals are bought in bulk, and the SIM-04 budget becomes meaningless. | major | Main-quest money ÷4 (q_main_09 → 0; the game ends there) and side-quest money ÷2; replace the difference with items (Chimes, heals) where flavour allows. Coin pouches unchanged. |
| W3 | Team sizes are larger than SY assumed: leaders 3/3/4/4/5/6; late optional trainers have 4–5 creatures. XP model over the WD list (party member ≈60% share): trial_3 ≈26, trial_4 ≈32, trial_5 ≈41, **trial_6 ≈50** vs leader ace 45. Single-lead carry reaches ≈58 at trial_6. Mandatory-only: trial_1 ≈9, trial_2 ≈12 (too low, so wild battles are needed early). | Target curve without grinding; no trivialised late game | Late game over-levels by 5+ levels; early game relies on wild battles. | major | Two levers, both modelled. (1) WD: optional trainers from ch5 onward have ≤ 3 creatures. (2) SY: the trainer XP multiplier ×3/2 applies to **mandatory** battles only; optional trainers get ×1. Result (member ≈60%): t1 10, t2 14, t3 24, t4 29, t5 37, t6 44, boss 46, champion 49. Early shortfall: SY sets a wild budget of ≈4 wild battles per early zone in `progression.json` (QA SIM-03). |
| W4 | Wild evolved stages appear below the evolution level. forest c11 Lv 11–12 (evolves 18); route_2 c14 @16 (20) and c26 @16 (28); route_3/cave/lake c26 19–28 (28); route_3 c23 20–21 (22); route_4 c15 @35 (36); volcano c27 @40 (42). | Evolution consistency; encyclopedia logic | Early-power spikes (a stage-2 at Lv 11 in the forest before trial_1), and SY default movesets misalign with ★ moves. | major | Validator rule: wild stage-k level ≥ evoLevel(k−1→k) − 2. Fix forest c11 → drop, or Lv 16+ later zones; route_2 c14/c26 → remove at 16; c26 before Lv 26 → remove. Rare early-evolved spawns are allowed only with `earlyEvolved: true` and weight ≤ 3. |
| W5 | Late wild levels exceed the trial targets. snowpeak 42–48 with stage-3 at 45–48, and route_5 stage-3 at 44, all before trial_6 (ace 45). | Difficulty curve | Wild encounters are stronger than the leader. | major | Cap snowpeak at 40–45, stage-3 rares 45–46; route_5 stage-3 rares 42. Other zones are within ±2 of the SY bands (route_1 3–7, forest 6–12, route_2 11–16, route_3 15–21, cave 18–26, lake 24–31, route_4 28–35, volcano 33–40) and are accepted as the new SY bands. |
| W6 | Leader ace levels 12/18/25/32/39/45 and champion ace 50 (WD §10.6) vs SY 14/20/26/32/38/43. | Difficulty | Two sources of truth. | minor | **Adopt WD aces** as canonical (§5). |
| W7 | 30 disc slots (D01–D30) vs 18 SY discs. | Teaching discs | Unmapped slots. | minor | Mapping in §8.1. All reusable, id `i_etude_m###`. |
| W8 | Tier-4 Chime only at the league kiosk (WD §2.1) vs SY "after trial_5". Pedlars sell tier-1 everywhere. | Capture tiers; free replenishment | Compatible; pedlars strengthen the SY §15.3 anti-softlock. | minor | Accept WD placement. The SY attendant rule (5 free tier-1 when the player has 0 devices and < 200 money) stays as the last resort. |
| W9 | Field actions: WD Unresolved-2 = "lead with one-button swap". CD §6.3 R3 and SY §5.5 = any troupe member, fainted included. | Softlock-proof field actions | Mismatch in the gate validator (WD §10.3 checks only wild-table types). | minor | Use the CD/SY rule. WD removes the lead-swap mechanic. |
| W10 | Gift A is delivered at stage 1, Lv 22 (evolution threshold 16); Gift B at stage 1, Lv 30. | Evolution | Evolves at the next battle end. | minor | Compatible with SY §8.3: it shows "Ready to evolve" immediately and can evolve from the party menu. No change. |
| W11 | Safe-return point: WD = the zone's rest site; SY = the last healing point visited. | Wipe rule | Equivalent in practice. | minor | Define it as "last rest site activated", as saved by RA `whiteout`. |

---

## 5. Canonical story-battle table (proposed; replaces SY §14.1 once X1–X4 are settled)

Team sizes follow WD, levels follow the WD leader aces, and names are CD-owned. AI: Normal for R1–R2, Hard for everything else. Potentials: rival 12, leaders and admins 12, Odile 13, champion 15.

| Battle | Size | Levels | Recommended player ace | Notes |
|---|---|---|---|---|
| R1 | 1 | 5 | 5 | non-blocking on a loss |
| trial_1 | 3 | 10, 11, 12 | 12 | |
| R2 | 3 | 14, 15, 16 | 16 | +f07 per CD |
| trial_2 | 3 | 16, 17, 18 | 18 | |
| Admin 1 (CD Brann) | 3 | 21, 22, 23 | 22 | cave |
| R3 | 3 | 22, 23, 24 | 23 | +f05 |
| Admin 2 (CD Vey 1) | 3 | 23, 24, 24 | 24 | |
| trial_3 | 4 | 22, 23, 24, 25 | 25 | |
| trial_4 | 4 | 29, 30, 31, 32 | 31 | |
| Admin 3 (CD Vey 2) | 4 | 32, 33, 33, 34 | 33 | |
| R4 | 4 | 31, 32, 33, 34 | 33 | singles (D4) |
| trial_5 | 5 | 35, 36, 37, 38, 39 | 38 | |
| R5 | 5 | 39, 40, 40, 41, 42 | 41 | starter at stage 3 |
| trial_6 | 6 | 40, 41, 42, 43, 44, 45 | 44 | |
| Odile | 3 + 1 | A: 42, 43, 44 · B: 46 | 45 | two phases (D3) |
| R6 | 6 | 45, 46, 46, 47, 47, 48 | 47 | |
| champion | 6 | 46, 47, 48, 48, 49, 50 | 48 | |

---

## 6. rendering_and_architecture.md

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| R1 | RA §1.5 computes `chooseAiAction(state)` from the full `BattleState` after the player commits, with one `rngState`. SY §13.1 uses an `AIView` projection (no unrevealed player moves, bench identities or potentials) and a separate `rngAI` stream. | AI must not read the queued action; fair AI | RA already excludes the queued action (OK). But the full state leaks hidden information, and sharing one stream couples the AI's rolls to how many draws the player's previous action consumed. | major | Add `rngAIState` to `BattleState`, and give `chooseAiAction` the signature `(view: AIView, rngAI)`, where `toAIView(state)` is a pure projection. QA U-AI-02 extends to "AI output identical for all player choices and all unrevealed player moves". |
| R2 | `CreatureInstance` has `nature?/personality?, ivs?, heldItem?`. | Instance schema | Wrong fields, and RG denylists "nature". | minor | Use `temperament: TemperamentId`, `potential: {hp,atk,def,spa,spd,spe}` (0–15), `bond?: boolean`, and no held item in v1. |
| R3 | The presenter plays the `attack` clip plus move VFX. SY has 16 `anim` ids; RA has clips `attackPhysical/attackSpecial/attackStatus`. | Move animation refs | No mapping defined. | minor | Mapping: melee_lunge, melee_sweep, charge_rush, dash_through, multi_hit_flurry, ground_wave → `attackPhysical`. projectile_bolt, projectile_arc, beam, burst_area, rain_down → `attackSpecial`. debuff_cloud, aura_self, shield, heal_glow, weather_call → `attackStatus`. The VFX timeline uses the SY impactMs (clip `impact` event takes precedence if present). |
| R4 | Reduced motion: RA keeps clip durations, while SY §9.1 halves the durations of all animation effects. | Accessibility | Contradiction. | minor | Clips unchanged (RA). Only VFX particle durations and camera shake are reduced (SY wording fix). The sim is timing-independent, so either is safe. |
| R5 | BattleEvent set is missing `phaseChange` (D3), `weariness` (SY §15.8), `shieldBlocked`, `dizzySelfHit`, `ringCount` rename (D10). | Event completeness | Presenter gaps. | minor | Add these events. SY revision 2 lists the full event union. |
| R6 | `BattleSetup` includes "difficulty" and "zone attunement". | Setup contract | Attunement must be nullable (D2); difficulty belongs to trainer data, not the zone. | minor | `BattleSetup = {party, opponent: {kind:'wild'} \| {kind:'trainer', trainerId}, attunedType: TypeId\|null, ambientWeather}`. The AI tier is read from the trainer record. |

---

## 7. qa_plan.md and release_character_gate.md

| # | Finding | Affected requirement | Consequence | Sev | Proposed resolution |
|---|---|---|---|---|---|
| Q1 | U-XP-03 "participants only (plus share item)". SY: non-participants get 50% built in. | XP distribution | The test will fail against the spec. | minor | Update U-XP-03 to 100% for participants, floor(50%) for non-fainted non-participants, 0 for fainted. |
| Q2 | U-DMG-11 "accuracy 100 never misses" ignores fog (×9/10 for non-shade moves). | Accuracy test | False failure in fog. | minor | Add "in clear weather", plus a fog case: an accuracy-100 non-shade move hits 90%. |
| Q3 | SIM §7.2 step 5 runs opponents at **Normal**. SY uses Hard for leaders, admins, R3+ and the champion. | Campaign completability | The SIM would validate an easier game than the one shipped. | major | Use the trainer record's AI tier. Keep Normal as an extra non-blocking signal only. |
| Q4 | SIM needs `progression.json: expectedPartyLevel[battleId]` and a wild-battle budget. | SIM-01/03 | Missing input. | minor | SY revision 2 publishes `progression.json` from §5 (recommended ace − 3 = party average) plus 4 wild battles per zone for ch1–ch3 and 2 per zone after. |
| Q5 | U-EVO-04 mentions held items; U-WTH-04 expects weather residual damage. | Tests vs spec | Not applicable in v1. | minor | Mark these "N/A v1" (SY: no held items, no weather chip damage). |
| Q6 | SIM turn limit 200 vs SY Weariness (every battle ends by turn 65). | Softlock check | Compatible. | minor | Lower the SIM limit to 70 so it detects Weariness regressions. |
| G1 | RG tier-B terms appear in SY ids and working text: `orb`, `revive`, and "STAB" in rule text. | Terminology scan | Warnings on data strings. | minor | X2 renames handle the ids. "STAB" never appears in UI strings or event keys (use `sameTypeBonus`). |
| G2 | RG §4.2: the capture-device throw/wobble cadence is an imitation risk. | Originality | See D10. | major | Chime-ring presentation (D10). |

---

## 8. Changes systems.md revision 2 will make (commitments)

1. Resonance ×11/10 after the same-type bonus; `tr_resonant` ×13/10; nullable attunement; recompute §16 and all §19 vectors (D1, D2).
2. Evolution levels = CR for f04–f10; remove `i_evo_prism`; learnset ★ moves moved; add secondary-type moves (C2, C6).
3. Widen BST bands; accept CR catch rates and growth; keep SY XP-yield factors (C1, C3, C4, C5).
4. One trait per species. Canonical list 26 → 28 (+`tr_solid_plating`, `tr_lodestone`); species mapping as in §2 (C8).
5. Pre-block capture when both party and storage are full; gifts are held pending (D5).
6. Trainer phases and the `phaseChange` hook; Odile spec (D3).
7. Six rivals, the §5 canonical table, and `progression.json` (X3, W6, Q4).
8. Mandatory-only ×3/2 trainer XP; economy tables re-derived from WD counts with reduced quest money (W1–W3).
9. Ids: `i_chime_*`, `i_keynote_*`, `i_etude_m###`; 30 disc slots per the §8.1 mapping (X2, W7).
10. `AIView`, `rngAIState`, instance field names, event union, anim→clip map (R1–R6).
11. m063 renamed *Tailwind Dart*; capture "rings" presentation (X5, D10).

### 8.1 Disc slot mapping (WD slot → move; reusable)
D01 m036 · D02 m065 · D03 m044 · D04 m055 · D05 m005 · D06 m096 (D01–D06 follow the WD trial types and will be re-keyed if X1 changes the order) · D07 m015 · D08 m093 · D09 m024 · D10 m046 · D11 m086 · D12 m084 · D13 m075 · D14 m019 · D15 m094 · D16 m078 · D17 m007 · D18 m088 · D19 m058 · D20 m069 · D21 m045 (universal) · D22 m095 · D23 m028 · D24 m038 · D25 m004 · D26 m027 · D27 m039 · D28 m089 · D29 m099 · D30 m060.

## 9. Unresolved (needs the orchestrator)
1. X1: trial type order and field-action unlock order (CD vs WD).
2. X4: antagonist names and beats; whether Brann's second encounter is a battle.
3. D6: Crown Chime flavour vs math. I recommend a flavour change.
4. W2: whether quest money cuts are acceptable to WD/CD narrative rewards.
