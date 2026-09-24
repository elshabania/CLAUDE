# Campaign simulation — mechanical completability only; not a playtest

> **Update (D30):** sections 1–6 record the original run. The tuning pass, its evidence and the current tables are in **section 7**.

Owner: Systems Designer / QA. Date: 2026-09-24. Source: `tests/unit/balance.test.ts` + `tests/unit/balanceSim.ts` (run with `npx vitest run tests/unit/balance.test.ts`; about 25 s).

**This is a headless simulation, not a playtest.** The real content JSON, the real battle engine (`src/sim/battle/engine.ts`) and the real AI (`src/sim/battle/ai.ts`) run with a scripted player. The numbers show whether a *plausible scripted troupe* can win each story battle. They are not a measure of difficulty for human players, pacing or fun (qa_plan §7.1). A human who switches smartly, over-levels or buys more items will do better. A human who does not understand type matchups will do worse.

## 1. Method

| Aspect | What the sim does |
|---|---|
| Path | The 12-chapter critical path in story order: every wild budget, every optional route trainer in each zone, all hall tuners and grunts, and the 17 story battles in systems §14.2 order. Rival 1 comes first, then route_1, forest (grunts, halls, Cantor 1), and so on to Rival 6 and the champion. |
| Wild battles | systems §14.4 budget: 4 per chapter in ch1–4 and 2 per chapter after, for 28 in total. Rolled with the real `rollEncounter` (day, clear weather) at real table levels. Random potentials and temperaments. |
| Catches | 5 catches at most (troupe ≤ 6): route_1, forest, route_2, cave upper and route_3. Each is a greedy type-coverage pick among common species (weight ≥ 15) in the zone table (qa_plan §7.2 item 3), scored against the next three story teams. Caught at the table's mean level. No gifts (leftover Lv 25, rival line Lv 30) and no swaps: a conservative assumption. |
| XP / levels | Awarded by the engine's own `awardXp`: participants 100%, the bench 50%, fainted 0. `addXp` levels each kin up. The player evolves at once. On a new move, the player learns it into a free slot or replaces its weakest move by a damage-value heuristic. The troupe gets a full heal after every battle (Hearthrests are free). |
| Lead | The starter leads while it is within 2 levels of the strongest kin. Otherwise the highest-level kin leads. |
| Trainer teams | Built exactly like `buildBattleSetup` (same RNG seeding, potentials and `tm_steady`). RS placeholders are resolved per starter. Odile's phase B is swapped in exactly like `battleStore.command()`. |
| Attunement | Zone `attuned` from the zone JSON. route_3 is silenced until Vey 1 and route_5 until Odile. Trial halls use the Cantor's type. |
| Player policy | The game's own AI scoring from the player's side (`chooseAiAction` on a mirrored state, Hard level: best score, matchup replacement, ≤ 2 voluntary switches). It knows only the foe moves that have been revealed. Salves: when the active kin is below 25% HP, it uses a salve, at most 2 per kin. Budget: 2× i_salve_1 (story battles #1–3), 2× i_salve_2 (#4–8), 3× i_salve_3 (#9–12), 2× i_salve_4 + 2× i_salve_3 (#13–17). |
| Story battles | 40 seeds each, at the troupe's organically simulated level (**not** forced to the model level). Cantors are also run with attunement off (D3 evidence). Any battle below target is re-run with the whole troupe +3 levels (qa_plan §7.2 item 8 signal). For progression, the sim uses the first winning seed's post-battle XP state. If no seed wins, it uses the XP from the last loss (the wipe rule keeps XP). |
| Targets | qa_plan §7.2: ≥ 60% for Cantors, Odile and the champion. ≥ 80% for rival and antagonist battles before trial_3 (R2, Brann, Vey 1, R3). ≥ 70% for the others (Vey 2, R4, R5, R6). R1 is non-blocking (D20). |

## 2. Results (40 seeds per battle; ✗ = below target; * = non-blocking)

"Top / starter" = highest-level kin and the starter line's level. "+3" is shown only for battles below target.

### Starter c01 (electric); rival line f02
| # | Battle | Party avg Lv | Model avg | Top / starter Lv | Foe ace Lv | Win % | Target | No-attune % | +3 Lv % | Avg turns | Salves |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 5 | 0 ✗ | ≥80* | — | 23 | 2.2 | 0.1 |
| 2 | Cantor 1 Wren | 11.3 | 11 | 12 / 10 | 12 | 63 | ≥60 | 65 | — | 20.5 | 1.7 |
| 3 | Rival 2 | 14.5 | 14 | 17 / 14 | 16 | 20 ✗ | ≥80 | — | 100 | 10.8 | 0.7 |
| 4 | Cantor 2 Dorran | 16.0 | 14 | 19 / 15 | 17 | 90 | ≥60 | 90 | — | 8.3 | 0.5 |
| 5 | Admin Brann | 19.4 | 19 | 22 / 20 | 20 | 100 | ≥80 | — | — | 7.6 | 1.1 |
| 6 | Admin Vey 1 | 20.5 | 23 | 24 / 20 | 22 | 100 | ≥80 | — | — | 8.6 | 0.6 |
| 7 | Rival 3 | 23.0 | 24 | 27 / 23 | 23 | 100 | ≥80 | — | — | 9.7 | 0.8 |
| 8 | Cantor 3 Nerys | 26.8 | 27 | 33 / 26 | 25 | 100 | ≥60 | 100 | — | 4.4 | 0.0 |
| 9 | Cantor 4 Tamsin | 28.5 | 29 | 35 / 28 | 30 | 95 | ≥60 | 88 | — | 15.8 | 1.1 |
| 10 | Admin Vey 2 | 32.5 | 33 | 40 / 32 | 33 | 100 | ≥70 | — | — | 4.5 | 0.0 |
| 11 | Rival 4 | 33.2 | 34 | 41 / 32 | 33 | 100 | ≥70 | — | — | 11.3 | 0.5 |
| 12 | Cantor 5 Bastian | 36.8 | 37 | 45 / 36 | 37 | 100 | ≥60 | 100 | — | 7.8 | 0.2 |
| 13 | Rival 5 | 39.5 | 40 | 48 / 38 | 40 | 100 | ≥70 | — | — | 13.0 | 1.1 |
| 14 | Cantor 6 Isaure | 43.7 | 45 | 53 / 42 | 45 | 78 | ≥60 | 83 | — | 13.3 | 1.2 |
| 15 | Magister Odile | 45.3 | 46 | 54 / 44 | 46 | 100 | ≥60 | — | — | 5.3 | 0.4 |
| 16 | Rival 6 | 45.7 | 47 | 54 / 44 | 48 | 100 | ≥70 | — | — | 16.3 | 1.1 |
| 17 | Champion Rhea | 47.0 | 49 | 56 / 46 | 50 | 100 | ≥60 | — | — | 21.3 | 1.5 |

### Starter c04 (fire); rival line f03
| # | Battle | Party avg Lv | Model avg | Top / starter Lv | Foe ace Lv | Win % | Target | No-attune % | +3 Lv % | Avg turns | Salves |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 5 | 0 ✗ | ≥80* | — | 20 | 2.4 | 0.2 |
| 2 | Cantor 1 Wren | 11.3 | 11 | 12 / 11 | 12 | 25 ✗ | ≥60 | 25 | 90 | 21.1 | 1.8 |
| 3 | Rival 2 | 13.8 | 14 | 15 / 13 | 16 | 15 ✗ | ≥80 | — | 100 | 9.1 | 1.4 |
| 4 | Cantor 2 Dorran | 15.3 | 14 | 17 / 13 | 17 | 3 ✗ | ≥60 | 3 | 100 | 25.3 | 2.0 |
| 5 | Admin Brann | 19.4 | 19 | 23 / 17 | 20 | 100 | ≥80 | — | — | 17.9 | 0.7 |
| 6 | Admin Vey 1 | 20.8 | 23 | 25 / 18 | 22 | 100 | ≥80 | — | — | 9.1 | 0.1 |
| 7 | Rival 3 | 23.3 | 24 | 28 / 21 | 23 | 100 | ≥80 | — | — | 6.8 | 0.0 |
| 8 | Cantor 3 Nerys | 26.8 | 27 | 32 / 25 | 25 | 100 | ≥60 | 98 | — | 9.8 | 0.4 |
| 9 | Cantor 4 Tamsin | 28.5 | 29 | 35 / 27 | 30 | 43 ✗ | ≥60 | 23 | 85 | 11.6 | 1.1 |
| 10 | Admin Vey 2 | 32.0 | 33 | 38 / 30 | 33 | 100 | ≥70 | — | — | 9.7 | 0.5 |
| 11 | Rival 4 | 32.8 | 34 | 39 / 31 | 33 | 98 | ≥70 | — | — | 22.0 | 1.8 |
| 12 | Cantor 5 Bastian | 36.2 | 37 | 44 / 34 | 37 | 98 | ≥60 | 100 | — | 12.3 | 0.9 |
| 13 | Rival 5 | 38.5 | 40 | 46 / 36 | 40 | 68 ✗ | ≥70 | — | 98 | 16.0 | 2.1 |
| 14 | Cantor 6 Isaure | 41.3 | 45 | 49 / 38 | 45 | 30 ✗ | ≥60 | 15 | 63 | 15.7 | 1.9 |
| 15 | Magister Odile | 43.0 | 46 | 51 / 40 | 46 | 100 | ≥60 | — | — | 14.0 | 1.5 |
| 16 | Rival 6 | 43.7 | 47 | 51 / 41 | 48 | 13 ✗ | ≥70 | — | 60 | 18.6 | 2.4 |
| 17 | Champion Rhea | 44.3 | 49 | 53 / 41 | 50 | 3 ✗ | ≥60 | — | 53 | 19.0 | 2.3 |

### Starter c07 (water); rival line f01
| # | Battle | Party avg Lv | Model avg | Top / starter Lv | Foe ace Lv | Win % | Target | No-attune % | +3 Lv % | Avg turns | Salves |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 5 | 0 ✗ | ≥80* | — | 90 | 2.4 | 0.3 |
| 2 | Cantor 1 Wren | 11.0 | 11 | 12 / 10 | 12 | 0 ✗ | ≥60 | 0 | 0 | 17.8 | 1.6 |
| 3 | Rival 2 | 13.8 | 14 | 14 / 13 | 16 | 0 ✗ | ≥80 | — | 98 | 11.0 | 1.3 |
| 4 | Cantor 2 Dorran | 14.3 | 14 | 15 / 14 | 17 | 88 | ≥60 | 95 | — | 14.5 | 1.3 |
| 5 | Admin Brann | 18.0 | 19 | 20 / 17 | 20 | 25 ✗ | ≥80 | — | 100 | 12.9 | 1.3 |
| 6 | Admin Vey 1 | 19.8 | 23 | 21 / 19 | 22 | 45 ✗ | ≥80 | — | 100 | 30.7 | 1.7 |
| 7 | Rival 3 | 21.7 | 24 | 23 / 20 | 23 | 85 | ≥80 | — | — | 11.6 | 0.7 |
| 8 | Cantor 3 Nerys | 25.5 | 27 | 28 / 24 | 25 | 98 | ≥60 | 100 | — | 8.4 | 0.7 |
| 9 | Cantor 4 Tamsin | 27.5 | 29 | 31 / 26 | 30 | 43 ✗ | ≥60 | 15 | 98 | 17.8 | 1.6 |
| 10 | Admin Vey 2 | 31.5 | 33 | 37 / 30 | 33 | 100 | ≥70 | — | — | 4.0 | 0.0 |
| 11 | Rival 4 | 32.2 | 34 | 38 / 31 | 33 | 100 | ≥70 | — | — | 10.6 | 0.5 |
| 12 | Cantor 5 Bastian | 36.2 | 37 | 42 / 35 | 37 | 100 | ≥60 | 100 | — | 10.0 | 0.9 |
| 13 | Rival 5 | 39.2 | 40 | 46 / 38 | 40 | 0 ✗ | ≥70 | — | 48 | 13.2 | 1.1 |
| 14 | Cantor 6 Isaure | 42.3 | 45 | 51 / 41 | 45 | 45 ✗ | ≥60 | 48 | 85 | 16.9 | 2.2 |
| 15 | Magister Odile | 44.3 | 46 | 53 / 43 | 46 | 100 | ≥60 | — | — | 5.8 | 0.5 |
| 16 | Rival 6 | 45.0 | 47 | 54 / 43 | 48 | 13 ✗ | ≥70 | — | 20 | 18.2 | 1.3 |
| 17 | Champion Rhea | 45.8 | 49 | 54 / 44 | 50 | 75 | ≥60 | — | — | 20.4 | 2.0 |

**Summary.** The engine never errored or stalled: 0 timeouts, and battles average 4–31 turns. XP sufficiency (SIM-03) passes: before every story battle, the strongest kin is at or above model avg − 2, usually +3 to +8. SIM-01 fails for **17 of 48 blocking battle-starter pairs**, plus R1 for all three starters.

## 3. Findings (numbers from the tables and from what-if runs on the same simulated troupes)

| # | Finding | Evidence | Sev |
|---|---|---|---|
| F1 | **Rival 1 is a guaranteed loss.** At equal level, RS1 hits for ×2 STAB, the starter hits back at ×½, and potential is 12 vs 10. A Lv 5 starter loses in 2–3 turns. | 0% for all 3 starters. RS1 Lv 4: 0 / 13 / 33%. RS1 Lv 3: 5 / 50 / 65%. Potential 6: 0%. | major (non-blocking, D20) |
| F2 | **Early Hard-AI heal items are full heals.** Cantor 1, Cantor 2, Brann, Vey 1 and R3 each hold 2× `i_salve_3` (150 HP). At Lv 12–22 a foe's max HP is about 35–70, so every salve is a full heal: +2 kin' worth of HP. `i_salve_3` is not sold until after trial_3 (§12.1). | Cantor 2 (c04): 3% → **90%** with no items (33% with 2× `i_salve_1`). Cantor 1: c01 63 → 88 with `i_salve_1`, c04 25 → 25. Brann (c07): 25 → **100%** with no items, 85% with `i_salve_1`. Vey 1 (c07): 45 → 85 with no items. | major |
| F3 | **Rival 2 is about 2–3 levels too strong for a "≥ 80%" battle.** Ace RS2 Lv 16 has potential 12, type advantage and a 2-level lead over a troupe averaging Lv 14. | 20 / 15 / 0%. At +3 levels: 100 / 100 / 98%. Whole team −2: 90 / 48 / 38%. Whole team −2 with potential 6: 83 / 88 / 40%. | major |
| F4 | **The water starter's opening is too hard.** c07 vs Cantor 1 (verdant) is 0%, even at +3 levels (95% at +5). By Lv 10, c07 knows only water moves, and the available catches (c22, c10) do not fix it. | c07: 0% (no attune 0%). The other starters reach 63% and 25%. | major |
| F5 | **Cantor 4 (gale, ace c21 Lv 30, stage 3 at threshold) is hard for f02/f03.** Removing attunement makes it *harder* (the player's own gale/verdant catches lose the ×1.1). | c04 43% (no attune 23%), c07 43% (15%). At +3: 85 / 98%. The ace at −2 only gives 60 / 68%. | minor–major |
| F6 | **Late game (Cantor 6, R5, R6, champion) fails for f02/f03.** The troupe average falls 3–5 levels below the §14.4 model after ch9, for two reasons: the bench earns 50% XP, the slow-curve kin (f09, f10) lag, and ch10–12 have only 2 wild battles and few trainers. | Party avg at the champion: 47.0 / 44.3 / 45.8 vs model 49. c04 R6 13%, champion 3% (+3: 60 / 53%). c07 R5 0% (RS3 c03 electric·gale vs water; +3: 48%), R6 13%. | major |
| F7 | **The difficulty ramp inverts at Odile.** Odile is won 100% (5–14 turns) right after Cantor 6 (30–78%). Her phase A kin (c24 42, c29 43, c26 44) sit below the troupe's top level. | See the tables. | minor |
| F8 | **D3 attunement evidence (qa_plan §7.2):** the bonus is small and applies to both sides. Cantor win rates with vs without the bonus differ by 0–5 points, except Cantor 4, where the *player* benefits (+20–28 points). | "No-attune %" column. | info |
| F9 | **Engine deviates from §8.1 XP (engine bug, not content).** `awardXp` applies T = 3/2 to *every* trainer battle (`tn = s.kind === 'trainer' ? 3 : 1`). §8.1 limits ×3/2 to `mandatory: true` trainers, so the 33 optional route trainers overpay by 50%. The simulated levels above are therefore slightly **optimistic**: with the fix, F3–F6 get worse. | `src/sim/battle/engine.ts` `awardXp`. | major (code) |
| F10 | **Odile phase B participation gap (code).** `battleStore.command()` swaps in c27 without marking participation, so the active player kin gets only 50% XP for the ace (non-participant). | `src/battle/battleStore.ts` phase change; replicated in the sim. | minor (code) |

## 4. Recommended changes (original proposals. **Applied or superseded by the D30 tuning pass: see section 7**)

No data edits were made. The trainers.json story teams match systems §14.2 exactly, and encounters.json matches world.md §4.3, so there was no *contradiction* to fix. These are rebalance proposals:

1. **R1 (F1):** RS1 **Lv 3** (from 5), or give R1 a fixed weaker moveset (only m002/m012/m021 physical 40, no STAB special). If R1 is meant to be a scripted loss, say so in systems §14.2 and drop its "recommended ace 5".
2. **Early trainer heal items (F2):** tier trainer salves to the shop tier of the chapter. Cantor 1 and Cantor 2: 1–2× `i_salve_1`. Brann, Vey 1 and R3: 2× `i_salve_2`. Cantor 3 and later: `i_salve_3`. Cantor 5 and later: `i_salve_4` (as for Odile). Add a line to systems §13.3: "item tier ≤ the tier sold in that chapter".
3. **Rival 2 (F3):** team **c20 Lv 12, RS2 Lv 14** (−2 across). If the D4 identity allows it, also use potential 6 for R1–R2 (they are Normal-AI "route-tier" battles). The −2 plus potential 6 variant gives 83 / 88 / 40%. The water starter still needs F4.
4. **Water opening (F4):** add an early non-water answer for the f03 line. Options: add m062 Wing Clip or m071 Barb Prick at Lv 7 in the f03 learnset. Or raise c19 Gustling (gale, ×2 vs verdant) route_1/forest weights so the greedy player gets it. Or drop Wren's c11 to Lv 11 (the ace is 4 below its threshold).
5. **Late game (F6):** raise the ch10–12 wild budget in §14.4 from 2 to 4 per chapter, or add one mandatory tuner pair on route_5. Alternatively, lower R5/R6/champion non-ace kin by 1–2 levels. Re-check after the F9 fix.
6. **Cantor 4 (F5):** lower c21 Lv 30 → **29** and c20 Lv 29 → 28, or accept it as the mid-game spike and document it.
7. **Odile (F7):** raise the phase A kin to 44 / 45 / 45 so the ramp continues from Cantor 6.
8. **Code (F9, F10):** pass `mandatory` into `BattleSetup` and gate T = 3/2 on it. Call participation marking after the phase-B send-out.

## 5. How the test enforces this
`tests/unit/balance.test.ts` runs the three campaigns (40 seeds per story battle). It asserts:
- No engine errors and no turn-limit stalls.
- All 17 story battles are reached.
- SIM-03 (strongest kin ≥ model avg − 2).
- SIM-01 win-rate targets, except for an explicit `KNOWN_BELOW_TARGET` list. That list originally held the 17 content findings above and has been **empty since the D30 tuning pass** (section 7). Any shortfall fails the test.
- Since D30, the test runs 8 independent progressions per starter with 6 seeds per story battle. The tables show the mean and the per-path spread (section 7.5).

The test prints the three tables on every run.

## 6. Limits of this simulation
- There is one simulated progression path per starter, with fixed catches. A different catch changes early results a lot (compare c01 and c04 at Cantor 1).
- The scripted policy does not pre-switch into resistances, use status cures, stack Etudes/discs (it never teaches discs) or grind. Humans may do far better, or worse.
- Gifts (the leftover Lv 25 and rival line Lv 30) are not used. They would help F6.
- Wild battles use day/clear tables. Trainer battles use clear weather.
- None of these numbers are playtime or player-difficulty claims. Human route playtests (qa_plan M-50) remain required.


---

## 7. Tuning pass (Systems Designer, 2026-09-24; D30)

**This is still a mechanical simulation and not a playtest.** The numbers show whether a scripted troupe can complete the campaign. They say nothing about fun, pacing or how hard it feels to a human. Human route playtests (qa_plan M-50) are still required.

**Outcome.** All **48 blocking starter × story-battle pairs** meet the qa_plan §7.2 targets. `KNOWN_BELOW_TARGET` in `tests/unit/balance.test.ts` is **empty**. SIM-03 passes for the weakest of the 8 progressions. The balance test takes about 21 s (the full suite about 22 s).

### 7.1 Stages (count of blocking pairs below target)
| Stage | c01 | c04 | c07 | Total | Note |
|---|---|---|---|---|---|
| Original (sections 2–3) | 1 | 8 | 8 | 17 | The optional trainers paid ×3/2 XP (F9), so the levels were optimistic |
| + F9 XP fix only (1 path, 40 seeds) | 6 | 8 | 8 | 22 | SIM-03 also failed: c01 top Lv 46 < 47 before the champion. The troupe average fell to 41–45 before the champion |
| + content and policy changes below (8 paths × 6 seeds) | 0 | 0 | 0 | **0** | Final tables in 7.5 |

### 7.2 Changes, in lever order (before → after)
**Lever 1: engine XP (F9).** `src/sim/battle/engine.ts` `awardXp`: T = 3/2 only when the battle's `mandatory` flag is set. Before, T applied to every trainer battle. `BattleSetup.mandatory` and `BattleState.mandatory` are new optional fields in `src/sim/battle/types.ts`, and `src/state/game.ts` `buildBattleSetup` passes `t.mandatory`. The `battle-math` vectors did not need changes, because none of them assert trainer XP. F10 (Odile phase-B participation) lives in `src/battle/battleStore.ts`, which was out of scope for this pass. It is still open.

**Lever 2: trainer data.** Levels are edited in the world.md §2.9 table (the generator's input) and mirrored in systems §14.2 and world.md §2.2. Items and R1's potential go in the new `STORY_TUNING` table in `scripts/build-world-content.py`. Regenerating the files was verified: `encounters.json` is byte-identical, and `trainers.json` equals the tested data. Payouts follow the §12.4 rule.

| Trainer | Levels before → after | Items before → after | Other | Why (evidence) |
|---|---|---|---|---|
| R1 `t_rival_1` | RS1 5 → **3** | 1× salve_1 → **none** | potential 12 → **6** | F1. Before: 0/0/0%. RS1 Lv 3 + pot 6 + no item: c01 33, c04 50–70, c07 98 (what-if). Final: 25 / 81 / 98 (non-blocking; "loss-tolerant but winnable") |
| Cantor 1 Wren | 10/11/12 (unchanged) | 2× salve_3 → **none** | — | F2. c11 must stay at Lv ≥ 12 (§14.1 legality: at most 4 below Lv 16), so it keeps Drowse Pollen. At 10/11/12, with 8 paths: none 78/85/67, 1× salve_1 65/83/42 |
| R2 | 14/16 → **12/14** | 1× salve_1 | — | F3. At the original levels: 98/81/77; at −1: 96/79/85 (c04 on the ≥ 80 line) |
| Cantor 2 Dorran | unchanged | 2× salve_3 → **1× salve_1** | — | F2 (shop tier) |
| Brann 1 | unchanged | 2× salve_3 → **1× salve_2** | — | F2. The −1 level variant was not needed (98–100% at the original levels) |
| Vey 1 | unchanged | 2× salve_3 → **1× salve_2** | — | F2 |
| R3 | unchanged | 2× salve_3 → **2× salve_2** | — | F2 (salve_3 is not sold before trial_3) |
| Cantor 3 Nerys | 23/23/24/25 → **22/22/23/24** | 2× salve_3 → **1× salve_2** | — | 4-path what-ifs: at the original levels with 2× salve_2, c01/c04/c07 won 100/71/56; at −1 with 1× salve_2, 100/92/71 |
| Cantor 4 Tamsin | 27/28/29/30 → **25/26/27/28** | 2× salve_3 | — | F5. At the original levels: 60/90/67; at −1: 71/94/85 |
| R5 | 38/38/38/39/40 → **35/35/35/36/37** | 2× salve_3 | — | F6. c07 at −2: 44%; at −3: 77–88%. RS3 c03 (electric·gale) is the water troupe's worst matchup |
| Cantor 6 Isaure | 41–45 → **37/38/39/39/40/41** | 2× salve_3 | — | F6. 0–31% originally; at −3: 75/65/69; at −4: 85/71/67 |
| Odile | **unchanged** (A 42/43/44, B 46) | unchanged | — | F7. Tested A 44/45/45 and A 46/47/47 + B 48: 96–100% in every case. Odile's difficulty does not depend on her levels (see 7.4) |
| R6 | 45/46/46/46/47/48 → **43×5, RS3 44** | 2× salve_3 → **none** | — | F6. c07's result depends on RS3's level: RS3 46 → 14–29%, RS3 44 → 67–81%. Heals removed: +8 points for c07 |
| Champion Rhea | 47/47/48/48/49/50 → **45/45/46/46/47/50** | unchanged (2× salve_4 + cure_all) | — | F6. 8-path what-ifs for c04: 56% at the original levels, 63% at −1, 73% at −2, 74% at −3. The final run gives 63% at −2, because the XP from the Odile fight differs from the what-if run. The −3 variant was rejected as too soft for the final battle. c30 stays 50: at Lv 48–49 its moveset swaps m100 for m099 and becomes harder, not easier |

**Lever 3: starter viability (F4).** In the f03 water learnset (systems §11, regenerated via `scripts/extract-systems.py`), m052 Hoarbreath (frost, ×2 vs verdant) moves from Lv 13 to **6**, m015 Bubble Lance from 10 to **8**, and m013 Rushing Current from 7 to **13**. Before, the water line knew only water moves at Cantor 1: 0% there, and 0% even at +3 levels. With the change and the policy fixes, it reaches 67% (8 paths). A catch matters more than a move: with c19 Gustling (gale ×2 vs Lullstalk's toxin half) in the troupe, c07 won 83%; with c10 or c13, 0–3%. The catch heuristic change in 7.3 fixes the catch.

**Lever 4: late XP / wild budget: not changed.** Doubling the ch5–12 wild budget from 2 to 4 per chapter raised the troupe average by only about 1 level and fixed no late battle. Late XP comes almost entirely from trainers. The measured curve is now written into systems §14.4, and the late story teams were tuned to it.

### 7.3 Simulated-player policy (tests/unit/balanceSim.ts), each change with its measured effect
The original policy's problems were these. It never learned an Etude, although systems §12.5 budgets their purchase. It dropped coverage moves: Belladrowse ended with 4 verdant moves, Tempestrel with 3 electric ones. Its greedy catch picked the water starter's own counter (c10). The AI's voluntary switch fires only when the best score is below 25, so it never retreated from a losing matchup. And it sent slow kin one by one into a foe at 9 HP.

The ablations were run on the content just before the last two edits (champion kin 44/44/45/45/46, Odile phase A 44/45/45).

| Change | Realism basis | Effect (ablation on the final content: pairs below target if removed) |
|---|---|---|
| Coverage-aware move replacement: drop a redundant move (a status move, a duplicate type, or the old move of the same type); drop a sole-type move only for a ×1.5 better one | Players keep type coverage | Not ablated separately. It fixed the mono-type movesets |
| Etudes: trial rewards (i_disc_04/05/02/07/16/14), the Vey 2 drop (i_disc_09) and the §12.5 purchases (i_disc_03 in ch3, i_disc_06 in ch6, i_disc_08 in ch9); each reusable disc is offered to every compatible kin (§8.5) | §12.5 budgets these purchases; discs are reusable | Without them: 3 pairs fail (c01 Cantor 2 54, c04 Cantor 4 40, c07 Brann 65) |
| Triad gifts (world.md §2.6): the leftover starter at Lv 25 after Vey 2 always replaces the weakest non-starter kin; the rival line at Lv 30 after trial_5 replaces it if it is at least as strong | Quest rewards; q_second_clutch needs the leftover in the troupe | Without them: c07 R6 falls to 46%. A rule that protected the leftover from the second swap was tried and was worse (c07 R6 48%) |
| One salve of the current shop tier in each route, hall or grunt battle | §12.5 buys about 3 salves per chapter | Without it: no failures, but margins shrink (c04 Cantor 4 90 → 75, champion 81 → 71; c07 R5 88 → 77) |
| Retreat in routine battles: switch out of a super-effective threat into a kin that resists it, at most 2 switches | Players protect their kin in wild and route fights | Without it: c07 Cantor 1 falls to 56%, because the water starter faints as lead in the forest and gets 0 XP. **Tried in story battles too and rejected:** no net gain there, with swings of ±50 points per battle |
| Finisher: after a faint with the foe at ≤ 25% HP, send the fastest kin that outspeeds it, else the kin that best resists its revealed moves | The mirrored AI's matchup pick fed three slow kin in a row into a 9-HP Drapetide | c04 champion 44 → 65–75 |
| Catch choice: the next story battle counts double, and kin that the coming teams hit super-effectively score −1 (was −0.5) | Players catch for the upcoming Cantor | c07 now catches c19 instead of c10 |
| 8 progressions × 6 seeds (was 1 × 40) | One run is one player; a single catch changed the next three battles by 50+ points | The table now shows the per-path spread; SIM-03 uses the weakest path |

Other policies were tried and not adopted. (a) A starter-lead gap of 5 instead of 2 made no difference. (b) Leading routine battles with the lowest-level kin lowered the troupe average. (c) The first, looser story-battle switch rule had mixed results.

### 7.4 Remaining findings (not blocking; for design review)
- **F7 still holds, and it is structural.** Odile is won 96–100%, right after Cantor 6 (67–85%). She has 4 kin against a 6-kin troupe, and her level changes had no measurable effect. Consider a 5th phase-A kin or a stronger phase B. Do not simply raise her levels.
- **Thin margins:** c04 champion 63%, c07 Cantor 1 and Cantor 6 67%, c04 Cantor 6 71%, c01 Cantor 2 75%, c07 R6 81% (≥ 70). The per-path spread is wide: one c07 Cantor 6 path wins 17%.
- **The late troupe average runs below the model** (43–44 before the champion, against 49). The top kin tracks the model because the lead kin carries the troupe. The model column in systems §14.2 was kept, and §14.4 now states the measured curve.
- **Payouts** drop by 1,140 in total because they scale with the ace level (§12.4). This is noted under systems §12.5, and every chapter still ends positive.
- **F10** (Odile phase-B participation, `src/battle/battleStore.ts`) is still open. It was out of scope for this pass.
- **Difficulty curve against intent:** R1 is loss-tolerant but winnable (25–98%). The Cantors are challenging (67–100%; Cantor 6 is the hardest). The champion is the hardest *final* fight for the fire starter (63%), but for c01 and c07 it is easier than Cantor 6. A human playtest should decide whether the champion needs a stronger team, for example restoring 47/47/48/48/49.

### 7.5 Final tables (8 progressions × 6 seeds per story battle; ✗ = below target; * = non-blocking)
"Top" is the strongest kin's level on the weakest path. "Starter" is the mean level of the starter line. "Win % at +3 Lv" is the mean over the paths that were below target on their own.

#### Starter c01 (electric); rival line f02
| # | Battle | Party avg Lv | Model avg | Top (min over paths) / starter Lv | Foe ace Lv | Win % | Per-path win % | Target | Win % no attune | Win % at +3 Lv | Avg turns | Salves used |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 3 | 25 ✗ | 17 / 0 / 17 / 17 / 33 / 33 / 50 / 33 | ≥80* | — | 100 | 4.1 | 1.0 |
| 2 | Cantor 1 Wren | 11.3 | 11 | 12 / 12 | 12 | 81 | 83 / 83 / 100 / 67 / 100 / 67 / 67 / 83 | ≥60 | 81 | — | 17.7 | 1.6 |
| 3 | Rival 2 | 13.9 | 14 | 15 / 14 | 14 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 8.1 | 0.7 |
| 4 | Cantor 2 Dorran | 15.4 | 14 | 17 / 16 | 17 | 75 | 50 / 67 / 100 / 100 / 100 / 50 / 50 / 83 | ≥60 | 85 | 100 | 11.7 | 1.0 |
| 5 | Admin Brann | 18.5 | 19 | 20 / 19 | 20 | 98 | 100 / 83 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 7.2 | 0.9 |
| 6 | Admin Vey 1 | 20.0 | 23 | 21 / 21 | 22 | 98 | 100 / 100 / 100 / 100 / 100 / 100 / 83 / 100 | ≥80 | — | — | 11.4 | 1.2 |
| 7 | Rival 3 | 21.7 | 24 | 23 / 22 | 23 | 98 | 100 / 100 / 100 / 83 / 100 / 100 / 100 / 100 | ≥80 | — | — | 10.8 | 1.1 |
| 8 | Cantor 3 Nerys | 25.0 | 27 | 27 / 26 | 24 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 100 | — | 7.3 | 0.3 |
| 9 | Cantor 4 Tamsin | 26.8 | 29 | 29 / 28 | 28 | 94 | 100 / 100 / 100 / 100 / 100 / 50 / 100 / 100 | ≥60 | 85 | 100 | 11.7 | 0.8 |
| 10 | Admin Vey 2 | 30.3 | 33 | 33 / 32 | 33 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 5.4 | 0.2 |
| 11 | Rival 4 | 30.5 | 34 | 35 / 32 | 33 | 96 | 100 / 100 / 67 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | 100 | 7.8 | 0.4 |
| 12 | Cantor 5 Bastian | 34.1 | 37 | 38 / 36 | 37 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 98 | — | 8.8 | 0.6 |
| 13 | Rival 5 | 36.4 | 40 | 41 / 38 | 37 | 96 | 100 / 83 / 100 / 83 / 100 / 100 / 100 / 100 | ≥70 | — | — | 9.4 | 0.4 |
| 14 | Cantor 6 Isaure | 40.3 | 45 | 46 / 41 | 41 | 85 | 100 / 67 / 100 / 67 / 100 / 67 / 100 / 83 | ≥60 | 85 | — | 10.3 | 0.8 |
| 15 | Magister Odile | 42.0 | 46 | 48 / 43 | 46 | 98 | 83 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | — | — | 6.4 | 0.8 |
| 16 | Rival 6 | 42.7 | 47 | 49 / 44 | 44 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 9.6 | 0.2 |
| 17 | Champion Rhea | 43.8 | 49 | 50 / 45 | 50 | 96 | 100 / 83 / 100 / 100 / 100 / 100 / 100 / 83 | ≥60 | — | — | 18.3 | 2.0 |

#### Starter c04 (fire); rival line f03
| # | Battle | Party avg Lv | Model avg | Top (min over paths) / starter Lv | Foe ace Lv | Win % | Per-path win % | Target | Win % no attune | Win % at +3 Lv | Avg turns | Salves used |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 3 | 81 | 67 / 83 / 83 / 83 / 83 / 83 / 83 / 83 | ≥80* | — | 100 | 5.5 | 0.9 |
| 2 | Cantor 1 Wren | 11.3 | 11 | 11 / 12 | 12 | 88 | 100 / 50 / 83 / 100 / 100 / 83 / 83 / 100 | ≥60 | 88 | 100 | 15.9 | 1.3 |
| 3 | Rival 2 | 14.0 | 14 | 14 / 14 | 14 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 7.0 | 0.8 |
| 4 | Cantor 2 Dorran | 15.6 | 14 | 16 / 16 | 17 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 100 | — | 7.7 | 0.6 |
| 5 | Admin Brann | 18.8 | 19 | 20 / 18 | 20 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 8.8 | 0.6 |
| 6 | Admin Vey 1 | 20.4 | 23 | 22 / 20 | 22 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 10.6 | 1.3 |
| 7 | Rival 3 | 22.0 | 24 | 24 / 22 | 23 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 12.0 | 1.1 |
| 8 | Cantor 3 Nerys | 25.2 | 27 | 27 / 25 | 24 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 98 | — | 12.3 | 0.8 |
| 9 | Cantor 4 Tamsin | 27.0 | 29 | 30 / 26 | 28 | 90 | 100 / 100 / 83 / 33 / 100 / 100 / 100 / 100 | ≥60 | 98 | 100 | 11.3 | 0.8 |
| 10 | Admin Vey 2 | 30.6 | 33 | 34 / 30 | 33 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 5.4 | 0.1 |
| 11 | Rival 4 | 31.0 | 34 | 35 / 31 | 33 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 8.3 | 0.4 |
| 12 | Cantor 5 Bastian | 34.4 | 37 | 40 / 33 | 37 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 100 | — | 9.2 | 0.7 |
| 13 | Rival 5 | 36.8 | 40 | 44 / 35 | 37 | 94 | 100 / 67 / 100 / 100 / 100 / 100 / 100 / 83 | ≥70 | — | 100 | 11.3 | 0.7 |
| 14 | Cantor 6 Isaure | 39.8 | 45 | 48 / 36 | 41 | 71 | 67 / 50 / 17 / 100 / 67 / 100 / 67 / 100 | ≥60 | 77 | 92 | 12.4 | 1.4 |
| 15 | Magister Odile | 41.6 | 46 | 50 / 38 | 46 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | — | — | 7.0 | 0.9 |
| 16 | Rival 6 | 42.4 | 47 | 50 / 39 | 44 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 12.0 | 1.0 |
| 17 | Champion Rhea | 43.6 | 49 | 51 / 40 | 50 | 63 | 50 / 33 / 50 / 100 / 17 / 100 / 50 / 100 | ≥60 | — | 93 | 18.7 | 1.7 |

#### Starter c07 (water); rival line f01
| # | Battle | Party avg Lv | Model avg | Top (min over paths) / starter Lv | Foe ace Lv | Win % | Per-path win % | Target | Win % no attune | Win % at +3 Lv | Avg turns | Salves used |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rival 1 | 5.0 | 5 | 5 / 5 | 3 | 98 | 100 / 83 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80* | — | — | 2.1 | 0.0 |
| 2 | Cantor 1 Wren | 11.3 | 11 | 12 / 12 | 12 | 67 | 67 / 83 / 67 / 83 / 50 / 83 / 33 / 67 | ≥60 | 67 | 100 | 14.1 | 1.4 |
| 3 | Rival 2 | 13.8 | 14 | 14 / 14 | 14 | 96 | 100 / 100 / 67 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | 100 | 7.9 | 1.0 |
| 4 | Cantor 2 Dorran | 15.2 | 14 | 16 / 16 | 17 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 100 | — | 7.0 | 0.4 |
| 5 | Admin Brann | 18.5 | 19 | 20 / 20 | 20 | 98 | 100 / 100 / 100 / 100 / 83 / 100 / 100 / 100 | ≥80 | — | — | 11.9 | 1.6 |
| 6 | Admin Vey 1 | 19.9 | 23 | 22 / 21 | 22 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥80 | — | — | 14.6 | 1.7 |
| 7 | Rival 3 | 21.6 | 24 | 24 / 23 | 23 | 94 | 100 / 100 / 67 / 100 / 100 / 83 / 100 / 100 | ≥80 | — | 100 | 16.1 | 1.5 |
| 8 | Cantor 3 Nerys | 24.5 | 27 | 27 / 26 | 24 | 79 | 83 / 83 / 67 / 100 / 83 / 67 / 50 / 100 | ≥60 | 88 | 100 | 27.7 | 1.4 |
| 9 | Cantor 4 Tamsin | 26.3 | 29 | 30 / 28 | 28 | 94 | 83 / 83 / 83 / 100 / 100 / 100 / 100 / 100 | ≥60 | 94 | — | 12.5 | 0.9 |
| 10 | Admin Vey 2 | 30.0 | 33 | 35 / 31 | 33 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 4.1 | 0.0 |
| 11 | Rival 4 | 30.8 | 34 | 37 / 31 | 33 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥70 | — | — | 10.1 | 0.5 |
| 12 | Cantor 5 Bastian | 34.3 | 37 | 41 / 35 | 37 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | 100 | — | 9.1 | 0.6 |
| 13 | Rival 5 | 37.0 | 40 | 44 / 37 | 37 | 88 | 83 / 67 / 83 / 83 / 100 / 100 / 100 / 83 | ≥70 | — | 100 | 12.4 | 1.5 |
| 14 | Cantor 6 Isaure | 40.8 | 45 | 47 / 41 | 41 | 67 | 100 / 17 / 17 / 100 / 100 / 67 / 50 / 83 | ≥60 | 67 | 89 | 11.3 | 0.7 |
| 15 | Magister Odile | 42.4 | 46 | 49 / 42 | 46 | 100 | 100 / 100 / 100 / 100 / 100 / 100 / 100 / 100 | ≥60 | — | — | 6.1 | 0.6 |
| 16 | Rival 6 | 43.2 | 47 | 49 / 43 | 44 | 81 | 100 / 83 / 67 / 33 / 83 / 100 / 100 / 83 | ≥70 | — | 92 | 17.0 | 1.7 |
| 17 | Champion Rhea | 44.2 | 49 | 49 / 44 | 50 | 94 | 83 / 100 / 100 / 67 / 100 / 100 / 100 / 100 | ≥60 | — | — | 20.2 | 2.7 |
