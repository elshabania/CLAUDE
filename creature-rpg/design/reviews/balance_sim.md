# Campaign simulation — mechanical completability only; not a playtest

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

## 4. Recommended changes (not applied. Systems Designer / World Designer to decide, then re-run this sim)

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
- SIM-01 win-rate targets, except for an explicit `KNOWN_BELOW_TARGET` list of the 17 content findings above. Any *new* shortfall fails the test. A listed battle that starts passing prints a reminder to remove it.

The test prints the three tables on every run.

## 6. Limits of this simulation
- There is one simulated progression path per starter, with fixed catches. A different catch changes early results a lot (compare c01 and c04 at Cantor 1).
- The scripted policy does not pre-switch into resistances, use status cures, stack Etudes/discs (it never teaches discs) or grind. Humans may do far better, or worse.
- Gifts (the leftover Lv 25 and rival line Lv 30) are not used. They would help F6.
- Wild battles use day/clear tables. Trainer battles use clear weather.
- None of these numbers are playtime or player-difficulty claims. Human route playtests (qa_plan M-50) remain required.
