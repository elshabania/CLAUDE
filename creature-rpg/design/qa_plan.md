# QA Plan — creature-rpg

Owner: QA Lead. Status: design, **v2** (revised after review round 1). Binding inputs: `design/MASTER_PROMPT.md`, `design/ANCHORS.md`, **`design/DECISIONS.md` (D1–D28; wins over every other doc)**.
v1 was written before the sibling docs existed. v2 gives every test that `design/reviews/qa_lead.md` marked **blocked (no oracle)** a concrete expected value from DECISIONS.md (see **§0.6 Oracle table**). Where a value is still owned by a sibling doc and not fixed by a decision, the test names the source section (**[sys]** = systems.md, **[world]** = world.md v2, **[cd]** = creative_direction.md, **[rnd]** = rendering_and_architecture.md, **[rcg]** = release_character_gate.md). §1.8 records which tests are already **implemented** in the repo. "Implemented" means the test file exists. It does not mean the test passed; only the orchestrator reports results.

**Evidence rule (from master prompt section 7):** nothing in this plan reports a result. Every check in a gate report is marked **Pass**, **Fail**, **Not run** or **Not measured**, and a Pass has an evidence artifact attached. Performance numbers from the container's headless Chromium, which renders in software, are always labeled **"Non-representative (container, software rendering)"** and never count as proof of a performance target.

---

## 0. Conventions

### 0.1 Test ID scheme

| Prefix | Meaning | Runner | Location (proposed) |
|---|---|---|---|
| `U-<AREA>-nn` | Unit test (pure logic) | vitest (node env) | `src/**/__tests__/*.test.ts`, `tests/unit/` |
| `D-nn` | Data validation of content JSON | vitest + zod schemas | `tests/data/` |
| `B-nn` | Browser smoke test | Playwright + preinstalled Chromium | `tests/e2e/` |
| `SIM-nn` | Headless campaign simulation | vitest (node, long-running project) | `tests/sim/` |
| `C-nn` | Automated character-direction and originality checks | vitest + Playwright render page | `tests/character/` |
| `A11Y-nn` | Accessibility checks (automated part) | Playwright + `@axe-core/playwright` | `tests/e2e/a11y/` |
| `BM-nn` | Benchmark scene | Playwright (container) + manual on reference devices | `tests/bench/` |
| `M-nn` | Manual test / playtest checklist item | Human | `qa/checklists/` |
| `V-nn` | Visual / character review | Human, with generated sheets | `design/reviews/` |

Unit areas: `RNG`, `DMG` (damage), `ORD` (event order), `STS` (status), `WTH` (weather), `RES` (Resonance), `CAP` (capture), `XP`, `EVO`, `MOV` (learning), `INV` (inventory), `PTY` (party/storage), `QST` (quest/flags), `SAV` (save), `ENC` (encounter trigger), `SM` (state machines), `AI`.

### 0.2 Commands (proposed `package.json` scripts)

| Script | Runs | Must pass at |
|---|---|---|
| `npm run test:unit` | all `U-*` | every commit to main, from P1 |
| `npm run test:data` | all `D-*` | every commit, from P2 |
| `npm run test:char` | `C-*` (the node part plus the render part) | phase gates, from P2 |
| `npm run test:e2e` | `B-*`, `A11Y-*` | phase gates, from P1 |
| `npm run test:sim` | `SIM-*` (slow; seeded; about 200 runs per battle) | phase gates, from P4 |
| `npm run bench` | `BM-*` in the container (labeled non-representative) | phase gates, informational |
| `npm run qa:gate -- --phase N` | runs the set above for phase N and writes `qa/evidence/phase_N/summary.md` | each gate |

### 0.3 Debug and test hooks required from engineering

The browser tests depend on these URL flags. They are read only when `import.meta.env.DEV` is true, or when the build was made with `VITE_QA=1`. A release build without that flag must ignore them; `B-30` checks this.

Flag names follow [rnd] §7.2, §7.3 and §11 where they overlap. In particular, `?profile=` is used rather than a QA-specific `?quality=`, `?bench=traverse|battle|full`, `?perf=1` and `?tool=silhouettes|faces`. `?quality=` below is kept as an alias of `?profile=`. Per D28, dev tools are excluded from production unless the build has `VITE_QA=1`.

| Flag | Effect |
|---|---|
| `?seed=<uint32>` | Seeds the gameplay RNG (battle, encounters, AI) for the session |
| `?debug=1` | Exposes the read-only `window.__qa` object (below) and a small FPS/draw-call overlay |
| `?save=<fixtureId>` | Loads a canned save fixture from `tests/fixtures/saves/` into slot 0 before boot |
| `?zone=<zoneId>&spawn=<spawnId>` | Starts in a zone at a spawn point (requires `debug=1`) |
| `?fastText=1` | Instant dialogue text; skips transition delays that are longer than 1 frame, while keeping the state-machine order |
| `?forceEncounter=<speciesId>:<level>` | The next contact with a wild creature uses this species and level |
| `?profile=auto\|high\|balanced\|mobile` (alias `?quality=`) | Forces a quality profile ([rnd] §6.1) |
| `?bench=traverse\|battle\|full&profile=&seed=&save=` | [rnd] §7.3 benchmark harness; writes `window.__BENCH_RESULT__` |
| `?perf=1` | [rnd] §7.2 perf overlay |
| `?tool=silhouettes\|faces` / `/gate.html` | Character-gate render pages ([rnd] §11, [rcg] §3.1; D27: GC-07 is the single silhouette spec) |
| `?storage=unavailable\|quota` | Replaces `localStorage` with a shim that throws `SecurityError` or `QuotaExceededError` |

`window.__qa` is read-only. It provides `state()` (the current state-machine path, e.g. `exploration`, `battle.turnResolution`), `store()` (a deep-frozen snapshot of the committed game state), `rngState()`, `events` (a ring buffer of the last 200 domain events), and `ready` (a promise that resolves when the scene is idle). It exposes no setters. Tests drive the game only through real keyboard, mouse and touch input.

### 0.4 Evidence layout

`qa/evidence/phase_N/`, which holds:
- `summary.md`: the gate checklist with a Pass, Fail, Not run or Not measured status per item.
- `vitest.json`, `playwright-report/`, `sim-report.json`, `char/` (silhouette sheets, the completeness report, the denylist scan report) and `bench/`, whose files carry the label in their filename and header.
- Screenshots named `<testId>_<step>.png`.

Character review evidence goes in `design/reviews/character_consistency.md`, which the Release and Character Consistency Agent owns. `summary.md` links to the character-gate artifacts under `reports/gate/character/<commit>/` ([rcg] §1.5) and to the `artifacts/` output from [rnd] §11 rather than copying them.

### 0.5 Phase key
P1 Movement and visual foundation · P2 First inhabited area · P3 Core gameplay slice · P4 Early campaign (trial_1, trial_2) · P5 Complete campaign · P6 Atmosphere and polish · P7 Release validation.

"Blocking from Pn" means that from phase n onward, every later gate also requires a Pass.

### 0.6 Oracle table (binding, from `design/DECISIONS.md`)
Every test below that asserts one of these values cites the decision id. If a sibling doc disagrees with this table, the test follows this table (DECISIONS.md wins), and the disagreement is filed as a doc bug (S3), not as a test failure.

| Dec. | Oracle (expected value used by tests) | Tests that consume it |
|---|---|---|
| **D1** | Zone order: `town_1 → route_1 → forest → route_2 → town_2 → cave → route_3 → lake → town_3 → route_4 → volcano → route_5 → snowpeak → league`. Trials in required order: `trial_1` forest **verdant**, `trial_2` town_2 **stone**, `trial_3` lake **water**, `trial_4` town_3 **gale**, `trial_5` volcano **fire**, `trial_6` snowpeak **frost**. `champion` in `league` (the Concordant, Rhea Rookwell). Attuned types: route_1 lumen, forest verdant, route_2 stone, cave electric, route_3 toxin, lake water, route_4 gale, volcano fire, route_5 shade, snowpeak frost. Towns and league are neutral; trial halls use their Cantor's type. The story has 12 chapters ([cd] §4); the ≈ 9 h 20 m critical path is an **estimate**. | D-30, D-31, D-33, D-47, SIM-01, U-DMG-12, M-01…M-30 |
| **D2** | 10 registers: Rootcall/verdant, Spark/electric, Kindle/fire, Swell/water, Heave/stone, Seep/toxin, Gust/gale, Veil/shade, Rime/frost, Gleam/lumen. Unlocks: the tutorial gives Rootcall + Spark + Kindle + Swell; Keynote 1 → Heave, 2 → Seep, 3 → Gust, 4 → Veil, 5 → Rime, 6 → Gleam. The performer is **any troupe member of the matching type, fainted or not**. There are **exactly 4 mandatory gates**: forest Rootgate (Rootcall), cave lower galleries (Heave), route_4 ascent (Gust), snowpeak falls (Rime). Each has a Resonance Steward within 15 m. Starter types are never mandatory. | U-RES-01…05, D-35, SIM-02, M-08, M-11 |
| **D3** | Attunement bonus **×11/10**, applied as a new step **after STAB and before type effectiveness**, for both sides. It is ×6/5 with `tr_resonant`. It applies to damaging moves only; status moves are unaffected. Golden vector (systems §16 setup): **Arc Lash = 48** (random 85; route attuned electric; rain). Bubble Lance = 22 and the AI scores 34/48 are unchanged, because neither move is attuned. | U-DMG-01, U-DMG-12, DS-11, battle-math.test.ts |
| **D4** | **6 rival battles** `t_rival_1..6`, in chapters 1, 3, 5, 8, 10 and 12. The rival takes the starter **strong against** the player's (Water > Fire > Electric > Water). Player Fizzkit(c01) → rival Wickwool(c04); player Wickwool(c04) → rival Rippleback(c07); player Rippleback(c07) → rival Fizzkit(c01). | U-QST-07, D-37, SIM-01 |
| **D5** | Leftover starter: `flag_leftover_rescued` (ch8, Stillhouse), then `q_foster_leftover`, which gives stage 1 at **Lv 25**. Rival's line: `q_second_clutch` after `flag_trial_5_cleared`, which gives stage 1 at **Lv 30**. Release fallback: Oriel's fosterage offers a replacement young. No waits and no multiplayer. | D-25, U-QST-08, M-26 |
| **D7** | Display names: c01 **Fizzkit**, c04 **Wickwool**, c07 Rippleback, c11 **Lullstalk**, c27 **Emberfold**, c30 **Coronaleen**. The aide is **Marra Aske**; the default protagonist is **Arden**. Retired names (Voltra, Emberhorn, Umbraleen, Cinderscrim, Nodbell, Juniper/Jun, Rowan) must not appear in shipped player-facing strings. Floeguard (c09): no helmet, two short whisker nubs, shell on the back and tail-fan only. | D-20, C-07, C-08, C-09, V-07 |
| **D8** | Status display names and codes: burn → Scorch (SCH), poison → Blight (BLT), paralysis → Jolt (JLT), sleep → Drowse (DRW), frostbite → Rimebite (RMB), dizzy → Muddled. Internal ids are unchanged. | A11Y-05, C-07, B-09 |
| **D9** | Capture presentation: the Chime **rings** 0–3 times (a light-and-tone pulse per passed check). Success is a sustained chord plus a bonding light band. The probability model is unchanged ([sys] §7): `ringsShown = passedChecks`. | U-CAP-08, U-SM-05, B-12, V-04 |
| **D10** | Item ids = `src/data/content/items.json`. Capture devices: `i_chime_reed/brass/silver/crown` (tiers 1–4). Heals `i_salve_1..4`, cures `i_cure_*`, revives `i_revive_1..2`, charges `i_charge_1..2`, discs `i_disc_01..18` (displayed as *Etudes*), Keynotes `i_keynote_1..6`, `i_evo_prism`. Repel and escape are `i_hush_1..2` and `i_thread` per D10 text. **Note: items.json currently still has `i_repel_1..2` and `i_escape`** (see §12.4 Q-A). Story flags and quest ids: [cd] §4.2 is canonical. | D-02, D-03, D-10, D-14, all save fixtures |
| **D11** | Evolution levels (stage 1→2 / 2→3): f01–f03 16/34, f04 16/32, f05 20/36, f06 22/38, f07 14/30, f08 18/34, f09 24/40, f10 26/(`i_evo_prism` or 44). | U-EVO-08, D-21, D-48, SIM-01 party builder |
| **D12** | catchRate, xpYield and growth are **derived** ([sys] §2.1), never hand-entered. BST bands with the fixes: c20 395, c12 505, c21 505, c30 535. | D-49, U-XP-02, U-CAP-01 |
| **D13** | One fixed canonical trait per species, from the [sys] §10 list. | D-50 |
| **D14** | Face atlas: 8 cells `open, half, closed, happy, hurt, faint, determined, surprised`. Cell size 256 px High, 256 px Balanced, 128 px Mobile. The right eye is a UV mirror. | C-04 |
| **D15** | Clip durations come from creatures.md (attack 0.4–1.3 s). The contact/impact event falls at 40–55% of the attack clip. The [cd] §5.5 caps are guidance, not gates. | C-03 |
| **D16** | LOD0 ≤ 12k triangles (large stage 3 ≤ 16k). Silhouette-feature parts are never dropped at LOD2. The per-creature draw-call count is a documented deviation, **measured, not gated**. | C-10, BM-07 |
| **D18** | Full storage (party 6 + storage 300): the throw is allowed after the confirmation "Storage is full. If caught you must release a creature. Throw anyway?"; choosing No returns to the Bag with no turn spent. After a success there is a **mandatory release prompt** ("Release the new creature" or "Choose one to release"), with double confirmation. The `bond` starter cannot be released. The save commits only after the prompt resolves. | U-CAP-11, U-PTY-05, U-PTY-06, M-62 |
| **D19** | A reload during battle, capture or evolution returns to the **pre-battle committed checkpoint**. Battle state is never saved, and saving is disabled in those states. | U-SAV-19, B-18, M-63…M-65 |
| **D20** | Losing **Rival 1** continues the story with the party healed (`flag_rival_1_done` set). Every other story battle uses the wipe rule ([sys] §15.1): warp to the last healing point visited, a money penalty of `min(floor(money/4), 100 + 150 × keynotesOwned)`, and the event is re-armed with no flag set. | U-PTY-10, SIM-05, M-60, M-61 |
| **D21** | **6 roaming wild creatures per zone on every profile.** In the cave (single-level zone per D17), the total is 6. | U-ENC-06, B-06 |
| **D22** | Odile is one trainer with `phases`. Phase A has attunement Silenced (no bonus). After her third kin faints, phase B restores frost ×11/10 and sends her ace. | U-SM-09, DS-13, SIM-01 |
| **D23** | No wild stage-2/3 creature appears below its evolution level. The trainer XP bonus applies only to mandatory battles. | D-48, SIM-03 |
| **D26** | Reference devices RC-L, RC-P1 and RC-P2 ([rnd] §7.1) stay **Not measured** until they are run on physical hardware. Container FPS is never used as a claim. | BM-*, R7.1, R7.2 |
| **D27** | [rcg] GC-07 is the single silhouette spec. A per-species side-view angle is allowed for planar designs. | C-02 |

### 0.7 Values resolved from sibling docs (not overridden by DECISIONS)
- **Stack cap:** still not specified anywhere, so the U-INV-04 oracle is **pending [sys]**. The test is written with a named constant `STACK_CAP` and defaults to 99. Key items are held at quantity 1.
- **Money cap** 999,999, never negative ([sys] §12.4). **Sell price** `floor(price/2)`. **Discs** are reusable and unsellable ([sys] §8.5).
- **Evolution cancel** exists; a cancelled evolution shows "Ready to evolve" in the party menu ([sys] §8.3).
- **Post-battle encounter immunity** is 4 s, and creatures within 8 m startle away for 3 s ([world] §4.2).
- **Double faint:** the player wins ([sys] §6 step 8.2). **Speed tie:** `rng.int(0,1)`, rolled once per turn at ordering time ([sys] §3.4). **Weariness** from turn 50 ends any battle by turn 65 ([sys] §15.8).
- **Import:** at most 2 MB. A checksum mismatch is a warning if the schema is valid. A newer schema is refused and never overwritten ([rnd] §10.6, §10.3).
- **Time:** 1 real second = 1 game minute. Resting sets the time to 06:00 or 18:00 ([world] §0). No content requires real-time waiting.

---

## 1. Requirements-to-test matrix

Types: **U** unit/vitest · **D** data-validation · **B** browser smoke/Playwright · **S** campaign sim · **C** automated character or originality check · **M** manual · **V** visual review.

### 1.1 Master prompt section 1 — Product vision and non-negotiables

| Req | Requirement | Test ids | Type | Blocking from | Evidence required |
|---|---|---|---|---|---|
| R1.1 | Cohesive stylized world, memorable creatures, expressive animation, readable combat, distinctive identity | V-01…V-08, M-40 | V, M | P2 (for the area in scope), P7 (full) | Signed review entries in `design/reviews/character_consistency.md`; screenshots |
| R1.2 | Characters feel like a polished creature-collecting RPG: expressive, approachable, colorful, silhouette-driven, animation-forward | C-01…C-06, V-01…V-06 | C, V | P2 | Silhouette sheets at 20 px and 256 px, completeness report, review sign-off |
| R1.3 | No copying of another franchise's designs, names, terminology, silhouettes, UI conventions or music | C-07, C-08, V-07, V-08 | C, V | P2 (names), P3 (UI), P5 (all) | Denylist scan report with 0 DENY hits; originality review notes |
| R1.4 | 8–10 h first playthrough without artificial grinding; playtime labeled as an estimate | SIM-03 (XP sufficiency), M-50 (timed playtest) | S, M | P5 (SIM), P7 (M) | Sim XP report; stopwatch log from human playtests, labeled "estimate, n=<testers>". No playtime claim without M-50 logs |
| R1.5 | 30 creatures, 10 three-stage lines | D-20, D-21, C-01 | D, C | P5 (full roster); P3 for the lines in scope | `test:data` output |
| R1.6 | 10 types | D-22, U-DMG-06 | D, U | P3 | vitest output |
| R1.7 | ≥80 mechanically meaningful moves | D-23, D-24 | D | P5 (P3: ≥20) | `test:data` output, with a per-move list of effect/unique-role tags |
| R1.8 | Six challenge venues, three towns, five routes, forest, cave, lake, volcano and snow peak | D-30, D-31, B-20 | D, B | P5 | Zone list diff against the anchor ids; a screenshot of each zone |
| R1.9 | Rival, antagonist faction and champion storylines | D-33, SIM-01, M-01…M-30 | D, S, M | P5 | Quest graph report; sim report; manual route log |
| R1.10 | Original functional terms (no "Gym", "dex", "TM", "ball") | C-07 | C | P3 | Denylist report |
| R1.11 | Original characters, dialogue, UI art, cries | C-07, V-07, V-08, M-43 | C, V, M | P3 | Review notes |
| R1.12 | CC0 assets only for environment use, license verified (currently: none, all procedural) | D-40 (asset manifest) | D | P1 | `assets/manifest.json` exists; every non-code asset has a verified license, or the manifest is empty |
| R1.13 | Priority order: save integrity > controls > art > perf > effects | Gate policy (section 10) | — | P1 | Severity mapping in section 10 |

### 1.2 Section 3 — Technical architecture

| Req | Requirement | Test ids | Type | Blocking from | Evidence |
|---|---|---|---|---|---|
| R3.1 | Fixed stack (Vite, React 19, TS, R3F 9, drei 10, Rapier 2, postprocessing 3, zustand 5, tone 15, zod) | D-41 (dependency pin check against the lockfile) | D | P1 | Script output |
| R3.2 | Validated JSON content with stable ids and reference validation | D-01…D-12 | D | P2 | `test:data` |
| R3.3 | Deterministic, pure battle sim with seeded RNG, separated from render, audio, UI and persistence | U-RNG-01…05, U-DMG-*, U-ORD-08, **`tests/unit/battle-math.test.ts` (implemented: spec vectors, determinism, no-mutation, AI isolation)**, D-42 (import-boundary lint: `src/sim/**` must not import three, react, tone, zustand or DOM) | U, D | P3 | vitest; boundary lint report |
| R3.4 | Explicit state machines (exploration, dialogue, battle transitions, turn resolution, capture, evolution, results) | U-SM-01…06, B-12 | U, B | P3 (P2: exploration and dialogue) | Transition-table tests; `__qa.state()` trace |
| R3.5 | Rapier used for the overworld only | D-43 (no `@react-three/rapier` import under the battle or sim paths) | D | P3 | Lint output |
| R3.6 | Species definitions immutable; instances have unique ids | U-PTY-08, U-EVO-04, D-44 (species objects deep-frozen at load) | U, D | P3 | vitest |
| R3.7 | Versioned localStorage save with migration | U-SAV-01…06; **`tests/unit/persistence.test.ts` (implemented: round trip, v1 fixture migration, newer schema refused)** | U | P3 (v1); P4+ (each schema bump adds a migration test) | vitest |
| R3.8 | Backup slot | U-SAV-07, U-SAV-08; **persistence.test.ts (implemented: backup rotation, tmp recovery after interrupted write)** | U | P3 | vitest |
| R3.9 | Malformed-save handling | U-SAV-09…12, B-14; **persistence.test.ts (implemented: truncated main → backup, checksum tamper, malformed JSON, duplicate party/storage ids)** | U, B | P3 | vitest; screenshot of the recovery dialog |
| R3.10 | Quota handling | U-SAV-13, U-SAV-14, B-15; **persistence.test.ts (implemented: quota keeps previous main; no-storage mode keeps in-memory envelope and export)** | U, B | P3 | vitest; screenshot |
| R3.11 | Export/import | U-SAV-15…18, B-16; **persistence.test.ts (implemented: import with bad checksum warns, invalid payload rejected)** | U, B | P3 | vitest; downloaded file compared by hash |
| R3.12 | New-game confirmation when a save exists | B-17, U-SAV-22; **persistence.test.ts (implemented: new game rotates previous main to backup)** | B | P3 | Playwright trace |
| R3.13 | Save only committed state | U-SAV-19…22, B-18, M-60…M-66 | U, B, M | P3 | vitest; manual log |

### 1.3 Section 4 — Art direction

| Req | Requirement | Test ids | Type | Blocking from | Evidence |
|---|---|---|---|---|---|
| R4.1 | Stylized realism, expressive faces, readable silhouettes | C-02, C-03, C-05, V-01, V-02 | C, V | P2 | Sheets and review |
| R4.2 | High / Balanced / Mobile profiles | B-40, U-SM-07 (profile config completeness) | B, U | P1 | Screenshots per profile; config test |
| R4.3 | PBR, ACES, HDR-ish lighting, soft shadows | V-10 | V | P1 | Screenshot set from BM-01 |
| R4.4 | Terrain variation, instanced vegetation with wind, animated-normal water | V-11, BM-02, BM-03 | V, BM | P2 (terrain, vegetation), P5 (water in lake) | Screenshots or short captures |
| R4.5 | Restrained bloom, fog, day/night | V-12, B-41 | V, B | P6 | Screenshots at 4 times of day |
| R4.6 | Rain, snow and fog tied to encounter rules | U-WTH-08, D-13, B-42 | U, D, B | P6 (visuals), P5 (rules) | Test output; screenshots |
| R4.7 | Fallback for every expensive effect | D-45 (each effect in the quality config has a `mobile` value of off or cheap) | D | P6 | Config test |
| R4.8 | Approximations documented honestly | M-44 (doc review of `rendering_and_architecture.md` against the build) | M | P7 | Review note |
| R4.9 | All environment assets procedural (egress blocked) | D-40 | D | P1 | Manifest check: no binary asset without a license entry |

### 1.4 Section 5 — Player experience

| Req | Requirement | Test ids | Type | Blocking from | Evidence |
|---|---|---|---|---|---|
| R5.1 | Third-person trainer, camera collision, slopes and steps | B-03, B-04, M-02 | B, M | P1 | Playwright trace; `__qa` position log; manual note |
| R5.2 | Lead creature follows | B-05, V-03 | B, V | P2 | Screenshot sequence |
| R5.3 | Visible roaming wild creatures start encounters on contact; no repeated or stacked triggers | U-ENC-01…06 (D21 cap 6), B-06 | U, B | P2 (visible), P3 (encounter) | vitest; event log shows exactly 1 `encounterStart` |
| R5.4 | WASD + mouse | B-02, B-03 | B | P1 | Trace |
| R5.5 | Mobile joystick, camera drag, contextual buttons | B-25, B-26 | B | P2 | Mobile-viewport trace and screenshots |
| R5.6 | Battle staged in the current environment | B-08, V-13 | B, V | P3 | Screenshot showing zone terrain behind the battle |
| R5.7 | Fight / Bag / Switch / Run | B-09, U-SM-03 | B, U | P3 | Trace |
| R5.8 | Speed/priority, accuracy, crits, types, traits, statuses, weather, forced switches, fainting | U-DMG-* (**battle-math.test.ts implemented: stat vectors, damage vectors, type-matrix counts, starter triangle, dual-type products**), U-ORD-*, U-STS-*, U-WTH-*, U-SM-04 | U | P3 (P5 for all traits and weather) | vitest |
| R5.9 | Four capture tiers | U-CAP-01…12, D-14; **battle-math.test.ts (implemented: a = 68/102/136/204, sleep doubling, threshold monotonic, Monte-Carlo ≈ a/255)** | U, D | P3 (≥1 tier), P4 (4 tiers) | vitest |
| R5.10 | Party of six, storage | U-PTY-01…10, B-19 | U, B | P3 (party), P4 (storage) | vitest; trace |
| R5.11 | Encyclopedia with interactive 3D viewer | B-21, C-04 | B, C | P4 | Screenshot, rotate/zoom trace |
| R5.12 | XP, evolution, learnsets, move replacement, teaching discs | U-XP-*, U-EVO-*, U-MOV-*, B-22 | U, B | P3 (XP, learn), P4 (evo, discs) | vitest; trace |
| R5.13 | Trainers, six challenges, recurring rival (6 battles, D4), antagonist line (two-phase Odile, D22), champion | D-33, D-37, U-QST-07, U-SM-09, SIM-01, M-01…M-30 | D, S, M | P4 (trials 1–2), P5 (all) | Sim report; manual log |
| R5.14 | Healing centers, shops, items, fast travel | U-INV-*, B-23, B-24, D-34 | U, B, D | P4 | vitest; trace |
| R5.15 | Quest tracking, completion state | U-QST-*, D-32, B-27 | U, D, B | P4 | vitest; journal screenshot |
| R5.16 | Title, continue, settings, HUD, dialogue, battle UI, menus, inventory, party, storage, map, journal | B-01, B-11 | B | P3 (P4 for the full menu set) | Trace; screenshot of each menu |
| R5.17 | Accessibility: readable text, keyboard menus, reduced motion, camera sensitivity, information not conveyed by color alone | A11Y-01…08, M-45 | B, M | P3 (keyboard, text), P6 (all) | axe report; screenshots in grayscale mode |
| R5.18 | Original adaptive Tone.js music, synthesized cries, move sounds, ambience, footsteps | D-46 (every species has cry params; every move has an sfx ref), M-46 | D, M | P5 (data), P6 (audio pass) | Test output; listening review note |
| R5.19 | Audio starts only after a user gesture | B-28 | B | P3 | `Tone.context.state` before and after the gesture |
| R5.20 | Master, music and SFX volumes, and mute | B-29, U-SM-08 | B, U | P6 | Settings persist across reload |

### 1.5 Section 6 — Phases

| Req | Requirement | Test ids | Type | Blocking from | Evidence |
|---|---|---|---|---|---|
| R6.1 | Each phase is gated by QA plus the character-direction gate | Section 2 gates, C-*, V-* | all | P1 | `qa/evidence/phase_N/summary.md` plus `design/reviews/character_consistency.md` verdict |
| R6.2 | A failed character-direction check blocks the phase | Gate rule G-CHAR (section 2) | — | P1 | Gate summary |

### 1.6 Section 7 — Evidence

| Req | Requirement | Test ids | Type | Blocking from | Evidence |
|---|---|---|---|---|---|
| R7.1 | 60 FPS on the designated mid-range laptop | BM-01…BM-08 on reference device RC-L | M (measured) | P6 (measured), P7 (pass) | Bench JSON from the real device, with device spec, browser version and date |
| R7.2 | 30 FPS floor on modern phones | BM-01…BM-08 on RC-P1 and RC-P2 | M (measured) | P6, P7 | Same |
| R7.3 | Never invent results; mark "Not measured" or "Not run" | Gate template (section 2.0) | — | P1 | Every gate summary line has a status and an evidence link |

### 1.7 Anchor-derived requirements

| Req | Requirement | Test ids | Blocking from |
|---|---|---|---|
| RA.1 | Every species has its own procedural builder; stages are never a recolor or uniform scale | C-01, C-06 | P2 (species in scope) |
| RA.2 | 7 procedural clips per species (+ optional `attack_special`; D15 durations) | C-03 | P2 |
| RA.3 | Every mandatory field action can be performed by a creature obtainable before its gate (4 gates + Stewards, D2) | D-35, SIM-02, U-RES-04 | P4 |
| RA.4 | Storage has a defined cap with explicit full-storage behaviour (300; D18 throw-confirm + mandatory release) | U-CAP-11, U-PTY-05…07, M-62 | P4 |
| RA.5 | Both unchosen starters are obtainable in-game (D5) | D-25, U-QST-08 | P5 |
| RA.6 | No multiplayer, external service or real-time wait blocks completion | D-36 | P5 |
| RA.7 | 1v1 singles only | U-SM-03 | P3 |

### 1.8 Implementation status of tests (as of v2)
Status values: **implemented** (the file exists in the repo; results are reported by the orchestrator, not here), **specified** (in this plan, no file yet), **blocked** (no oracle). After v2, **no test is blocked**: every former blocker has an oracle in §0.6.

| File | Plan ids covered | Status | QA notes (coverage gaps / required follow-ups) |
|---|---|---|---|
| `tests/unit/battle-math.test.ts` (fixtures: `tests/unit/fixtures.ts`, fixture species `x_elec2`, `x_water2` = systems §16 placeholder bases) | U-DMG-01 (stat vectors 49/25/24/38/26/41 and 52/34/30/25/27/29; Arc Lash; Bubble Lance 22; AI scores 48/34), U-DMG-04/05/06 (matrix totals 28/27/2, starter triangle, dual-type product set), U-CAP-01/02/08 (a = 68/102/136/204, sleep → 204, `shakeThreshold(102)` = 48287, monotonic, Monte-Carlo within ±1.5%), U-RNG-04 (same seed + commands → same events), U-ORD-08 (partial), no-mutation of input state | **implemented** | (1) **The Arc Lash assertion expects 50, which is the pre-D3 value.** Under D3 (×11/10 after STAB) the oracle is **48**, and `src/sim/battle/engine.ts` still applies ×6/5 at step 2. The engine and this expectation must change together. Until then, a green result on this test is evidence for the superseded rule, not for D3. (2) The AI-isolation case calls `chooseAiAction` twice on the same state. It does not yet vary the player's choice across all 4 moves as U-ORD-08 and [sys] §19.7 require. (3) The Monte-Carlo tolerance (±1.5%) is looser than the ±1% in [sys] §19.4, and it uses a local LCG instead of the production RNG. Tightening both is recommended. (4) Crit table, stat stages, status timing, weather, priority brackets and the Weariness turn cap are not yet covered (U-DMG-07/10/11, U-STS-*, U-WTH-*, U-ORD-01…07 remain **specified**). |
| `tests/unit/persistence.test.ts` (fixture `tests/fixtures/saves/v1.json`) | U-SAV-01 (round trip), U-SAV-02 (v1 → current migration), U-SAV-05 (newer schema refused, not overwritten), U-SAV-07 (backup rotation), U-SAV-08 (tmp recovery), U-SAV-09 (truncated main → backup + corrupt copy kept), U-SAV-11 (malformed/`null`), U-SAV-12-like (duplicate party/storage ids rejected), checksum tamper, U-SAV-13 (quota keeps main), U-SAV-14 (no-storage mode + export), U-SAV-15/16 (import: bad checksum warns, invalid rejected), U-SAV-22 (new game → backup) | **implemented** | (1) Specified but not yet covered: U-SAV-03/04 (migration purity/composition across more than one version), U-SAV-10 (both slots bad), U-SAV-12 (unknown species/move ids), U-SAV-17/18, U-SAV-19/20 (checkpoint policy, D19), U-SAV-21 (RNG/position restore). (2) Quota is simulated by name only. Add code 22 and 1014 variants. (3) The sample payload uses the retired default name "Rowan" (D7). This is harmless in test data, but C-07 must exclude `tests/**` from the retired-name scan. |
| All other ids in this plan | — | **specified** | — |

---

## 2. Phase acceptance gates

### 2.0 Gate rules (apply to every phase)
- **G-ALL-1:** `test:unit`, `test:data`, `test:char` and the phase's `test:e2e` subset are green on a clean `npm ci` checkout. Evidence: `summary.md` with commit SHA.
- **G-ALL-2:** No open S1. No open S2, unless the orchestrator has filed a written waiver in `summary.md` (waivers are not allowed from P5 on).
- **G-CHAR:** The character-direction checks for the phase (C-* and V-*) pass, and the Release and Character Consistency gate verdict for the phase is Pass or Conditional pass. **Any failed character-direction check blocks the phase, regardless of the rest of the gate.**
- **G-ORIG:** The denylist scan (C-07) has 0 DENY hits. Every REVIEW hit is dispositioned in `design/reviews/character_consistency.md`.
- **G-EVID:** Every item is marked Pass, Fail, Not run or Not measured, with a link to its evidence. Container perf numbers carry the non-representative label.
- **G-REG:** Every S1 and S2 fixed since the last gate has a regression test that fails on the pre-fix commit (section 10.3).

### 2.1 Phase 1 — Movement and visual foundation
| # | Check | Pass criterion |
|---|---|---|
| 1.1 | Project boots | `npm run build` succeeds; `B-01a` reaches a rendered frame with no console errors (an allowlist for known WebGL software-renderer warnings is permitted) |
| 1.2 | Movement | B-02, B-03: WASD moves the trainer; the position delta is in the camera-relative direction within ±15° |
| 1.3 | Slopes and steps | B-04: the trainer climbs a 0.3 m step and walks up a 30° test slope; it cannot walk up a slope steeper than the documented max; it never falls through terrain in a 60 s random-walk (seeded) |
| 1.4 | Camera collision | B-04b: with a wall between the camera and the player, the camera distance shrinks and the player stays visible (a raycast from the camera to the player hits no collider) |
| 1.5 | Quality profiles | B-40: all three profiles boot; renderer settings match the config (DPR, shadows on or off) |
| 1.6 | Pure-sim boundary lint in place | D-42 and D-43 exist and pass (on an empty or stub sim) |
| 1.7 | Test harness | Debug flags from section 0.3 (`seed`, `debug`, `zone`, `quality`, `bench`) work; `window.__qa` is absent in a non-QA release build (B-30) |
| 1.8 | Visual foundation | V-10: the reviewer confirms ACES tone mapping, soft shadows and terrain variation in BM-01 screenshots |
| 1.9 | Trainer character | C-01/C-03 for the protagonist builder (has a builder, not a placeholder, face texture, clips) and V-01 for the trainer at gameplay distance |
| 1.10 | Asset manifest | D-40 passes (no third-party asset without a verified license) |
| 1.11 | Bench baseline | BM-01 run in the container, labeled non-representative. Reference-device runs: Not measured (acceptable in P1) |

### 2.2 Phase 2 — First inhabited area
| # | Check | Pass criterion |
|---|---|---|
| 2.1 | Content schemas | D-01…D-12 pass for all content present (zones, NPCs, dialogue, creatures in scope) |
| 2.2 | NPC dialogue | B-10: talk to 3 NPCs with keyboard only; the dialogue state machine enters and exits cleanly (`exploration → dialogue → exploration`); movement input is ignored during dialogue |
| 2.3 | Lead creature follows | B-05: after the trainer moves 20 m, the lead creature ends within its documented follow distance and does not clip into colliders (spot check with screenshots) |
| 2.4 | Roaming wild creatures | B-06a: roaming creatures are visible in `route_1`, with a count between 1 and **6** (D21) on every profile; they wander inside their spawn volume |
| 2.5 | Mobile controls | B-25 and B-26 pass at 390×844 with touch emulation |
| 2.6 | Zone transition | B-20a: `town_1 ↔ route_1` exits load the target zone at the correct spawn; B-31 (reload mid-transition) recovers |
| 2.7 | Character completeness | C-01…C-06 pass for every species and NPC builder placed in P2 zones |
| 2.8 | Silhouette sheet | C-02 is generated; V-02 is reviewed and signed for the species present |
| 2.9 | Names | C-07 has 0 DENY hits across data and UI strings; C-08 name list reviewed |
| 2.10 | Hidden tab | B-32: `visibilitychange` to hidden pauses the simulation clock, and it resumes with no position jump greater than 1 frame of movement |

### 2.3 Phase 3 — Core gameplay slice
| # | Check | Pass criterion |
|---|---|---|
| 3.1 | Battle math | U-DMG, U-ORD, U-STS, U-RNG all green; golden cases from the systems.md worked examples reproduce exactly |
| 3.2 | Capture | U-CAP-01…12 green for the tiers implemented |
| 3.3 | Core loop smoke | **B-12 (golden path)** passes 3 consecutive runs with seeds 1, 2, 3 |
| 3.4 | Save v1 | U-SAV-01, 07…22 green; B-14…B-18 pass |
| 3.5 | State machines | U-SM-01…06 green: no undefined transitions; every state has an exit |
| 3.6 | Encounter trigger | U-ENC-01…05 green; B-06 shows exactly 1 `encounterStart` per contact and a post-battle grace period |
| 3.7 | Menus | B-11 for the menus present (party, bag, settings as a minimum) |
| 3.8 | Accessibility baseline | A11Y-01 (keyboard menus), A11Y-02 (text size), A11Y-05 (type labels as text or icon, not color only) |
| 3.9 | Audio gesture | B-28 passes |
| 3.10 | Battle character presentation | V-04: battle animations for the species in scope (attack, hit, faint, capture) reviewed; C-03 clips present |
| 3.11 | UI originality | V-08: battle UI layout and capture-device iconography reviewed as not a recognizable imitation |

### 2.4 Phase 4 — Early campaign (trial_1, trial_2)
| # | Check | Pass criterion |
|---|---|---|
| 4.1 | Quest graph (partial) | D-32 and D-33 pass for all quests up to `trial_2` completion |
| 4.2 | Campaign sim (partial) | SIM-01 passes for every mandatory battle up to and including `trial_2` (criteria in section 7) |
| 4.3 | Field-action gates | D-35 and SIM-02 pass for gates up to the post-trial_2 area |
| 4.4 | Progression systems | U-XP, U-EVO, U-MOV, U-INV, U-PTY all green; 4 capture tiers in U-CAP |
| 4.5 | Shops, heal, fast travel | B-23 (buy and sell), B-24 (heal), B-24b (fast travel to a visited town) |
| 4.6 | Storage | B-19: capture with a full party goes to storage; the storage UI can withdraw and deposit |
| 4.7 | Encyclopedia | B-21: the 3D viewer rotates and zooms with mouse, keyboard and touch |
| 4.8 | Save fixtures | `fx_save_pre_trial_1` and `fx_save_post_trial_2` load and play (B-13) |
| 4.9 | Manual route | M-01…M-12 (new game through trial_2 = Knell Hall, stone, D1) executed by a human, including the Rival 1 loss branch (D20), and the log is attached |
| 4.11 | Oracle-dependent data checks | D-02 (D10 ids), D-31/D-33/D-47 (D1), D-35 (D2, gates up to the cave Heave gate), D-37 (rivals 1–2), D-48/D-49/D-50 green for in-scope content |
| 4.10 | Evolution presentation | V-05: every evolution sequence in scope reviewed; C-06 (stages not a recolor) passes |

### 2.5 Phase 5 — Complete campaign
| # | Check | Pass criterion |
|---|---|---|
| 5.1 | Full data suite | D-01…D-46 all green (30 creatures, 10 types, ≥80 moves, all zones) |
| 5.2 | Full campaign sim | SIM-01, SIM-02 and SIM-03 pass through `champion` |
| 5.3 | Obtainability | D-25 (every creature obtainable, including both unchosen starters), D-36 (no real-time or external blocker) |
| 5.4 | Save migration | U-SAV-02…06 cover every schema version v1…vN; `fx_save_old_version` migrates |
| 5.5 | Full character set | C-01…C-06 for all 30 species, all trainers and all named NPCs; V-01…V-08 signed |
| 5.6 | Manual route | M-01…M-30 (new game to champion) executed once by a human, and the log is attached; playtime recorded as **estimate** |
| 5.7 | Edge cases | M-60…M-72 executed |
| 5.8 | No open S2 | Waivers are not permitted from this phase on |

### 2.6 Phase 6 — Atmosphere and polish
| # | Check | Pass criterion |
|---|---|---|
| 6.1 | Weather and day/night | U-WTH-* green; B-41 and B-42 screenshots; D-13 weather-encounter rules consistent |
| 6.2 | Effect fallbacks | D-45 green; B-40 on the Mobile profile shows expensive effects off or cheap |
| 6.3 | Accessibility full | A11Y-01…08 green; M-45 (reduced-motion and colorblind walkthrough) done |
| 6.4 | Audio | B-29 (volumes and mute persist); M-46 listening review (every zone theme, battle layers, cries distinct) |
| 6.5 | Performance measured | BM-01…BM-08 run on at least RC-L and one of RC-P1/RC-P2. Results recorded; below-target results are filed as bugs (S3, or S2 if under the 30 FPS floor on the phone) |
| 6.6 | Character consistency under quality settings | V-06: faces and silhouettes stay readable on the Mobile profile and at max LOD distance (C-02 re-run at the Mobile profile) |

### 2.7 Phase 7 — Release validation
| # | Check | Pass criterion |
|---|---|---|
| 7.1 | Everything from P1–P6 re-run on the release candidate SHA | All green |
| 7.2 | Full manual route | M-01…M-30 by at least 2 testers who did not build the content; timed (M-50) |
| 7.3 | Performance claims | Only claims measured on RC-L, RC-P1 and RC-P2 appear in release notes, with config, date and build |
| 7.4 | No placeholders | C-05 reports 0 `placeholder: true` for any builder, texture, icon, cry or dialogue string (`TODO`, `lorem`, `placeholder`, `xxx` scan across data and UI) |
| 7.5 | Release character gate | `release_character_gate.md` verdict Pass (Conditional pass is not accepted at P7) |
| 7.6 | Release build hygiene | B-30: QA flags inert; no `window.__qa`; sourcemap policy per rendering doc |
| 7.7 | Bug bar | 0 open S1 or S2; S3 triaged with an owner or deferral |

---

## 3. Unit test specifications (vitest)

Unit tests import only `src/sim/**`, `src/state/**` (pure reducers) and `src/save/**`. They use fixture content from `tests/fixtures/content/` (a small, stable test roster: see section 6.3) unless a test is marked "real content". Golden numeric values marked **[sys]** come from `systems.md` worked examples and are copied verbatim into `tests/fixtures/golden/*.json` with a source-section reference.

### 3.1 RNG (`U-RNG`)
| ID | Spec |
|---|---|
| U-RNG-01 | `createRng(seed)`: the same seed produces an identical sequence of 10,000 values; different seeds (1 vs 2) differ within the first 3 values |
| U-RNG-02 | `next()` ∈ [0, 1) across 1e6 draws; `int(a, b)` is inclusive and hits both ends for small ranges (a=0, b=3 over 1e4 draws) |
| U-RNG-03 | State serialization: `restore(serialize(rng))` continues the identical sequence (needed for save and battle replay) |
| U-RNG-04 | The sim draws from RNG only through the injected instance: running the same battle twice with the same seed gives an identical event log (deep equality) |
| U-RNG-05 | Coarse uniformity: a chi-square over 10 bins on 1e5 draws, with p > 0.001 (guards against a broken implementation, not a crypto test) |

### 3.2 Damage (`U-DMG`)
The inputs are a fixture attacker, defender and move with a fixed roll injected through `rollOverride` in test mode.
| ID | Spec |
|---|---|
| U-DMG-01 | Golden cases (fixture species, [sys] §16 setup with the **D3** rule): stats 49/25/24/38/26/41 and 52/34/30/25/27/29; **Arc Lash = 48** (base 18 → weather 18 → random 85 → 15 → STAB 22 → attunement ×11/10 → 24 → type ×2 → 48); Bubble Lance = 22; AI scores m015 = 48, m016 = 34; XP to a participant = 473, non-participant = 236; payout 680. **Implemented** in battle-math.test.ts, with the Arc Lash expectation still at the superseded 50 (§1.8) |
| U-DMG-02 | Monotonicity: with other inputs fixed, damage is non-decreasing in power, attack and level, and non-increasing in defense |
| U-DMG-03 | STAB: a move whose type matches either of the attacker's types applies the STAB multiplier **[sys]** exactly once (a dual-type attacker matching both does not double-apply); a non-matching move gets ×1 |
| U-DMG-04 | Single-type effectiveness: for all 100 (attack type × defend type) pairs, the multiplier equals the matrix entry in `types.json` |
| U-DMG-05 | Dual type: the multiplier is the product of the two entries; the result set ⊆ {0, 0.25, 0.5, 1, 2, 4} (or the set implied by the systems.md value set); immunity (0) yields 0 damage and a "no effect" event, not the minimum-1 damage |
| U-DMG-06 | The matrix is total and 10×10, uses only allowed values, and has the designed Electric/Fire/Water relations **[sys]** as explicit named assertions |
| U-DMG-07 | Crit: with a forced crit, the multiplier **[sys]** is applied; crit chance per crit stage matches the table **[sys]**; the stage is clamped at the max; any crit interaction with stat stages (e.g. ignoring the attacker's negative stages) follows **[sys]** |
| U-DMG-08 | Random roll bounds: over 10,000 seeded draws, roll ∈ [rollMin, rollMax] **[sys]** (placeholder assumption 0.85–1.00); both bounds are reachable via `rollOverride`; damage at rollMin ≤ damage at rollMax |
| U-DMG-09 | Minimum damage: a non-immune damaging hit deals ≥ 1; damage never exceeds the defender's current HP in the applied HP change (overkill is recorded separately, if at all) |
| U-DMG-10 | Stat stages: stages are clamped to [−6, +6] (or **[sys]**); multiplier(0) = 1; the multiplier is strictly increasing across stages; the table matches **[sys]**; applying +1 at +6 emits a "won't go higher" event and no change |
| U-DMG-11 | Accuracy: a move with accuracy 100 and no evasion or accuracy stages never misses across 10,000 seeds; accuracy-stage math **[sys]**; "never-miss" moves ignore stages |
| U-DMG-12 | Attunement (**D3**): ×11/10 applied after STAB and before type effectiveness, floored; ×6/5 with `tr_resonant`; damaging moves of the attuned type only (both sides, wild and trainer); never for typeless `m000` or the dizzy self-hit; no bonus in a zone or phase whose attunement is Silenced (D22). Step-order test: swapping the order of attunement and STAB changes at least one fixture result, which proves the order is enforced. Zone types come from D1 (D-47) |
| U-DMG-13 | Status-category moves deal 0 damage and never trigger a crit |
| U-DMG-14 | No NaN or Infinity: property test over 5,000 random valid (seeded) inputs; all outputs are finite integers ≥ 0 |

### 3.3 Event order (`U-ORD`)
| ID | Spec |
|---|---|
| U-ORD-01 | Bracket order ([sys] §3.4): A Run (wild only) → B Switches (player, then AI) → C Items and Chime throws → moves by priority (+3 Bulwark m045; +1 m013/m023/m053/m063/m083; 0 all others including m000). Higher priority always goes first, regardless of speed |
| U-ORD-02 | Same priority: higher effective speed first; effective speed includes stages and paralysis or other modifiers **[sys]** |
| U-ORD-03 | Speed tie: resolved by the seeded RNG. With seed S, the result is identical across 100 repeated runs. Across seeds 1…10,000 each side goes first 50% ± 2% |
| U-ORD-04 | Speed is evaluated at ordering time: a mid-turn speed change does **not** reorder the current turn; the tie roll happens once per turn before any move ([sys] §3.4) |
| U-ORD-05 | A creature that faints before its action does not act; its queued move is dropped with no charge (PP) spent |
| U-ORD-06 | End-of-turn order ([sys] §6.7): 1 weather counter/revert → 2 (reserved; no weather damage) → 3 burn/poison/frostbite → 4 sapped → 5 `tr_regrowth`, `tr_shed_status` → 6 Weariness (turn ≥ 50) → 7 clear flinch/shield, turn+1 → 8 faint checks; within a step, the faster creature first |
| U-ORD-07 | Double faint in the same turn: if both sides are out, **the player wins** ([sys] §6 step 8.2). Also: the AI picks its replacement before the player; the player's forced replacement cannot be cancelled; in wild battles "Flee" is offered and always succeeds |
| U-ORD-08 | The AI decision function receives no input containing the player's queued action (its signature takes `aiView`, which the test verifies has no `playerAction` field), and the AI choice is identical whatever the player's queued choice |

### 3.4 Status timing (`U-STS`)
| ID | Spec |
|---|---|
| U-STS-00 | Display (**D8**): the UI text and 3-letter codes are Scorch SCH, Blight BLT, Jolt JLT, Drowse DRW, Rimebite RMB, and Muddled for dizzy; internal ids are `burn/poison/paralysis/sleep/frostbite/dizzy`. A string-table test maps each id to its display name and code, and no other code is used |
| U-STS-01 | At most one major status at a time; applying a second fails with an event; volatile statuses stack per **[sys]** |
| U-STS-02 | Residual damage (burn, poison, etc.) happens at the end-of-turn phase, with amount **[sys]** and minimum 1, and can cause fainting, which triggers the forced-switch flow |
| U-STS-03 | Sleep: `counter = rng.int(1,3)` on apply (1 and 3 both reachable over 10,000 seeds); on each action attempt, counter 0 → wakes and acts this turn, otherwise it decrements (by 2 with `tr_early_riser`) and the action is lost; the counter persists across switching ([sys] §4.1) |
| U-STS-04 | Paralysis lock rate is 25% ± 1.5% over 10,000 seeds; the dizzy self-hit rate is 33% ± 1.5%; the dizzy counter is `rng.int(2,4)` ([sys] §4.1–4.2) |
| U-STS-05 | Type immunities to statuses **[sys]** (e.g. fire immune to burn) hold |
| U-STS-06 | Status persists after battle and in saves (for persistent statuses); volatile statuses clear on switch-out and at battle end |
| U-STS-07 | Healing items and healing centers clear the correct statuses |
| U-STS-08 | Status applied by a move that missed never applies |

### 3.5 Weather (`U-WTH`)
| ID | Spec |
|---|---|
| U-WTH-01 | Zone default weather at battle start = the overworld weather mapping **[sys]/[world]** |
| U-WTH-02 | Weather set by a move lasts N turns **[sys]**; the counter decrements at the end of turn; an end event fires exactly once |
| U-WTH-03 | Weather-modified move power (e.g. water boosted in rain) matches **[sys]** |
| U-WTH-04 | **No weather deals chip damage** ([sys] §5.3): over a 20-turn rain/snow/fog/sunlight battle, no `damage` event has source = weather |
| U-WTH-05 | A new weather replaces the old one and resets the counter; setting the same weather again follows **[sys]** (fail or refresh) |
| U-WTH-06 | Weather-dependent accuracy or traits **[sys]** |
| U-WTH-07 | Battle weather does not leak into the overworld after battle (the overworld keeps its own weather state) |
| U-WTH-08 | Encounter tables with weather conditions select the correct table entries; if the chosen weather has no matching entries, it falls back to the base table (never an empty table) |

### 3.6 Resonance / signature mechanic (`U-RES`)
| ID | Spec |
|---|---|
| U-RES-01 | Field action availability (**D2**) is a pure function of (troupe, unlocked registers). The performer is the first troupe member of the matching type in either type slot, **fainted or not**. It is not required to be the lead, and HP, charges and status never block it |
| U-RES-02 | Unlock schedule (**D2**): at new game only Rootcall, Spark, Kindle and Swell are available after `flag_resonance_tutorial`; `i_keynote_1..6` unlock Heave, Seep, Gust, Veil, Rime and Gleam in that order. A locked register is refused even if the troupe has the type, with the prompt "This register is still silent…" |
| U-RES-03 | Using a field action commits its node `rn_<zone>_<nn>` in the same save write as its flag (it is idempotent and permanent). The only exception is Swell stepping-stones, which reset after 60 s and are never on a mandatory path |
| U-RES-04 | Steward fallback (**D2**, [cd] R1): at each of the 4 mandatory nodes, a troupe with no kin of the type gets the "Ask the Steward for help" prompt. The Steward performs the action and sets the same flag. A Steward exists within 15 m of each mandatory node (data check D-35) |
| U-RES-05 | Attunement Silenced state (D22, [cd] §6.4): while `attunementActive = false`, no attunement bonus is applied and the HUD shows "Attunement: Silenced" |

### 3.7 Capture (`U-CAP`)
The formula comes from systems.md; the tests assert boundaries and invariants.
| ID | Spec |
|---|---|
| U-CAP-01 | Golden worked capture examples **[sys]** reproduce exactly |
| U-CAP-02 | Output bound: p ∈ [0, 1] for every combination in a grid of (HP 1…max in 10 steps × all statuses × all 4 tiers × catch-rate min, mid and max); never NaN |
| U-CAP-03 | Full HP, no status, lowest tier, hardest species: p = pMinFloor **[sys]** and > 0 (catchable wild creatures are never impossible) |
| U-CAP-04 | 1 HP, best status, highest non-guaranteed tier, easiest species: p ≤ 1, and it equals 1 if **[sys]** says it saturates |
| U-CAP-05 | Monotonicity: p is non-increasing in current HP, non-decreasing in tier order (tier1 ≤ tier2 ≤ tier3 ≤ tier4), and a status multiplier > 1 for statuses marked as capture aids |
| U-CAP-06 | Guaranteed tier (if it exists): p = 1 for all inputs |
| U-CAP-07 | Trainer-owned creatures: the capture action is rejected before a device is consumed; the inventory is unchanged |
| U-CAP-08 | Empirical: for p ∈ {0.05, 0.5, 0.95}, the success rate over 100,000 seeded trials is within ±0.5% of p; the ring count (**D9**: rings shown = passed checks, 0–3) is consistent with the outcome: a success shows 3 rings plus the chord; a failure after k passed checks shows k rings. `a ≥ 255` draws no RNG and shows 3 rings |
| U-CAP-09 | Success: a new instance with a unique id, OT/metadata, level, moves copied from the wild instance, and the encyclopedia marked "caught"; it goes to the party if size < 6, else to storage |
| U-CAP-10 | Failure: the device is consumed, the turn passes to the enemy, and the wild creature's state is unchanged apart from any **[sys]** effects |
| U-CAP-11 | Party 6 and storage 300 (**D18**): selecting a Chime opens the confirm "Storage is full. If caught you must release a creature. Throw anyway?". **No** returns to the Bag with no Chime consumed and no turn spent. **Yes** throws normally. On a success, the **mandatory release prompt** ("Release the new creature" / "Choose one to release", double confirmation) cannot be dismissed. The `bond` starter is not selectable, nor is any choice that would leave 0 non-fainted party members. After it resolves, party + storage ≤ 306 and exactly one creature is released. The save commit happens only after resolution; a reload before it returns to the pre-battle checkpoint (D19) |
| U-CAP-12 | Capture is atomic: after a simulated crash at each step of the capture commit (injected throw), the committed state has either (device consumed, creature added, battle ended) or none of these |

### 3.8 XP and levels (`U-XP`)
| ID | Spec |
|---|---|
| U-XP-01 | The XP-to-level curve **[sys]** is strictly increasing from level 1 to the cap; the table matches the formula |
| U-XP-02 | XP yield for a defeated creature matches **[sys]** (trainer vs wild multiplier, level ratio if any) |
| U-XP-03 | Distribution: participants only (plus a share item if designed); fainted creatures get 0; the rounding rule is documented; the total awarded matches the formula ±1 per recipient |
| U-XP-04 | Multi-level-up from a single award: every intermediate level triggers its learnset check in order, and the stats are recomputed once per level |
| U-XP-05 | Level cap: XP beyond the cap is discarded (or stored per **[sys]**); the level never exceeds the cap |
| U-XP-06 | On level-up, current HP rises by the max-HP delta (or per **[sys]**); a fainted creature stays fainted |
| U-XP-07 | Stats formula **[sys]** golden values at levels 5, 25 and 50 for the 3 starters |

### 3.9 Evolution (`U-EVO`)
| ID | Spec |
|---|---|
| U-EVO-01 | A level threshold reached during battle queues the evolution until after the results screen (not mid-battle) |
| U-EVO-02 | Non-level triggers (item, field action, flag) **[sys]** fire only when the condition holds |
| U-EVO-03 | Cancel is allowed ([sys] §8.3): the creature shows "Ready to evolve" and can evolve from the party menu at any time outside battle, with no further level-up needed |
| U-EVO-04 | Evolution preserves instance id, nickname, XP, known moves, status and held item; the species id changes to the next stage; the stats are recomputed; the HP ratio or damage-taken rule **[sys]** is applied |
| U-EVO-05 | A stage-3 creature never evolves; the evolution chain in data equals the family order (c01→c02→c03, …) |
| U-EVO-06 | Evolution-learn moves (learned on evolution) follow the U-MOV flow |
| U-EVO-07 | The encyclopedia marks the new species as caught |
| U-EVO-08 | Level thresholds (**D11**), table-driven over all 10 families: a stage-1 creature at level threshold−1 does not evolve; at the threshold it queues. f01–f03 16/34, f04 16/32, f05 20/36, f06 22/38, f07 14/30, f08 18/34, f09 24/40, f10 26/44. `i_evo_prism` on a stage-2 f10 creature evolves it at any level outside battle and is consumed |
| U-EVO-09 | A gift received above its threshold (D5 Lv 25 / Lv 30 stage 1) is "Ready to evolve" immediately (party menu), and the encyclopedia registers stage 1 first |

### 3.10 Move learning and replacement (`U-MOV`)
| ID | Spec |
|---|---|
| U-MOV-01 | With fewer than 4 known moves, a learnset move is auto-learned with full charges |
| U-MOV-02 | With 4 known moves, a prompt state: replacing slot k removes the old move and inserts the new one with full charges; declining leaves the moves unchanged; the decision is logged |
| U-MOV-03 | A move already known is never duplicated (learn is skipped silently or with a message) |
| U-MOV-04 | Multiple learnable moves at the same level are prompted sequentially, in learnset order |
| U-MOV-05 | Teaching disc: an incompatible species is rejected with no disc consumption; a compatible one follows U-MOV-01/02; the disc is consumed or reusable per **[sys]** |
| U-MOV-06 | A creature always has ≥ 1 move; the last move cannot be removed |
| U-MOV-07 | Charges (PP) reach 0 → the move is unusable; the fallback action when all charges are 0 is **[sys]** (the battle can never softlock) |

### 3.11 Inventory transactions (`U-INV`)
| ID | Spec |
|---|---|
| U-INV-01 | Buy: money −= price × qty; item += qty; one atomic state update |
| U-INV-02 | Insufficient funds: rejected; money and inventory are unchanged; an error event |
| U-INV-03 | Exact funds: allowed; money ends at 0 |
| U-INV-04 | Stack cap **[sys]** (placeholder 99): a purchase that would exceed the cap is rejected (or clamped per **[sys]**, and never charges for items not received) |
| U-INV-05 | Sell: money += sellPrice × qty (sellPrice per **[sys]**); qty ≤ held; key items and discs flagged unsellable are rejected |
| U-INV-06 | Money cap **[sys]**: sales past the cap are clamped or rejected with no item loss beyond what was paid for |
| U-INV-07 | Invalid qty (0, negative, non-integer, NaN, > cap) is rejected |
| U-INV-08 | Using a consumable decrements by 1; the stack is removed at 0; use on an invalid target (full-HP potion) is rejected with no consumption |
| U-INV-09 | Purchase atomicity under an injected throw mid-commit: never "money deducted without the item" or "item without payment" |
| U-INV-10 | Shop stock is gated by flags **[world]**: an item not yet unlocked is not purchasable |

### 3.12 Party and storage (`U-PTY`)
| ID | Spec |
|---|---|
| U-PTY-01 | The party holds 1 to 6; adding a 7th goes to storage (capture, gift or trade reward) |
| U-PTY-02 | Cannot deposit the last creature, or the last non-fainted creature, if **[sys]** requires one conscious creature |
| U-PTY-03 | Withdraw with a full party: rejected, or swap if the UI provides a swap |
| U-PTY-04 | Reorder: the lead is always index 0; changing the lead updates the follower and field actions |
| U-PTY-05 | Storage cap 300 (**D18**): at 299 with a full party, a capture goes to storage with a message naming the box; at 300 with a full party, the D18 flow in U-CAP-11 applies |
| U-PTY-06 | Gift or reward creature when party and storage are both full: the reward is held pending (flag not consumed) and deliverable later; it is **never lost** (required by the anti-softlock rule for the unchosen-starter route) |
| U-PTY-07 | Release requires double confirmation; releasing the last party creature or the last non-fainted party creature is rejected; the `bond` starter can never be released ([sys] §7.4); releasing frees the slot. If the leftover or rival-line young has been released, Oriel's fosterage offers a replacement young (D5) |
| U-PTY-08 | Instance ids are unique across party and storage after 1,000 random operations (property test) |
| U-PTY-09 | Healing restores HP, charges and status for the party only (storage-heal policy per **[sys]**) |
| U-PTY-10 | Party wipe (**D20**): warp to the **last healing point visited** (town_1 home before any), with the party fully healed (HP, status, charges). Penalty = `min(floor(money/4), 100 + 150 × keynotesOwned)`. Flags, captures and XP from before and during the battle are kept, and consumed items stay consumed. The winning trainer is not marked defeated and the event is re-armed. **Exception: a loss to Rival 1** sets `flag_rival_1_done`, heals the party and continues the story, with no warp or penalty |

### 3.13 Quest and flag dependencies (`U-QST`)
| ID | Spec |
|---|---|
| U-QST-01 | Quest state machine: locked → available → active → complete; no other transitions; complete is terminal |
| U-QST-02 | A quest becomes available exactly when all prerequisite flags are set (a truth-table test over the prereqs) |
| U-QST-03 | Setting a flag is idempotent; flags are never unset, except for those listed as `transient` |
| U-QST-04 | Reachability (real content): BFS from the new-game flag set, applying each quest's `sets` on completion, reaches `flag_champion_defeated`. Each mandatory quest is reached. A list of unreachable quests is printed. Also run as D-32 |
| U-QST-05 | Journal always has ≥ 1 active main-story objective from new game until the champion is defeated (evaluated at every step of the U-QST-04 walk) |
| U-QST-06 | Trial order (**D1**): the walk sets `flag_trial_1_cleared … flag_trial_6_cleared` strictly in order: verdant (forest), stone (town_2), water (lake), gale (town_3), fire (volcano), frost (snowpeak). `trial_n` cannot start before `trial_(n-1)` is complete. The champion requires `flag_nullbell_broken` and all six trial flags |
| U-QST-07 | Rival (**D4**): exactly 6 rival battles `t_rival_1..6`, reached in chapters 1, 3, 5, 8, 10 and 12. The rival starter is chosen by `argmax typeMult(S → player)`: c01 → c04, c04 → c07, c07 → c01. This is checked for all 3 player choices and must agree with `types.json` |
| U-QST-08 | Unchosen starters (**D5**): for each of the 3 starter choices, the walk reaches `flag_leftover_rescued` (ch8), then `q_foster_leftover` gives the leftover line at stage 1 Lv 25. `q_second_clutch` opens at `flag_trial_5_cleared` ∧ `flag_leftover_obtained` and gives the rival's line at stage 1 Lv 30. The two species obtained are exactly the two the player did not choose |

### 3.14 Save (`U-SAV`)
The storage adapter is injected (`MemoryStorage`, `ThrowingStorage(kind)`).
| ID | Spec |
|---|---|
| U-SAV-01 | `serialize(state)` → JSON with `{schemaVersion, savedAt, checksum?, data}`; `deserialize(serialize(s))` deep-equals `s` for the fixtures |
| U-SAV-02 | Migration chain: for each fixture `fx_save_v{k}`, `migrate(v_k → v_N)` produces a state that passes the current zod schema, keeping party, money, flags and position |
| U-SAV-03 | Each migration step `m_k` is pure and deterministic (same input, same output; input not mutated) |
| U-SAV-04 | Migrations compose: `migrate(v1→vN)` equals the sequential application of every step |
| U-SAV-05 | Future version (schemaVersion > N): not loaded; not overwritten; the user sees "save from newer version" |
| U-SAV-06 | Unknown or missing optional fields get defaults; missing required fields go to the malformed path (U-SAV-09) |
| U-SAV-07 | Backup slot: on each successful save, the previous primary is copied to backup **before** the primary is written |
| U-SAV-08 | A save that throws mid-write leaves a primary or a backup that is loadable (simulate a throw after the backup write) |
| U-SAV-09 | Malformed primary (invalid JSON, truncated, schema failure, checksum mismatch): load falls back to backup and notifies the user; the malformed blob is preserved under `…_corrupt_<ts>` (not deleted) |
| U-SAV-10 | Primary and backup both malformed: the game offers New Game or Import; nothing is auto-overwritten until the user confirms |
| U-SAV-11 | An empty string, `null` or a non-object JSON (`42`, `[]`) is handled as malformed |
| U-SAV-12 | A save that parses but has invalid references (unknown species or move id) is quarantined and not loaded; a clear error is shown |
| U-SAV-13 | `QuotaExceededError` (by name, by code 22 and by Firefox's `NS_ERROR_DOM_QUOTA_REACHED`) on write: the error is surfaced to the UI; the previous primary and backup are intact; the game continues; the user is offered Export |
| U-SAV-14 | Storage unavailable (access throws `SecurityError`, or `localStorage` is undefined): the game is playable, with a persistent "saving unavailable — export to keep progress" notice; export works |
| U-SAV-15 | Export → string → Import round trip deep-equals the committed state (all fixtures) |
| U-SAV-16 | Import rejects: non-JSON, wrong schema, future version, size > 2 MB ([rnd] §10.6); a checksum mismatch alone is a **warning** if the schema validates; the current state is unchanged on reject (**implemented** in persistence.test.ts for the checksum and invalid-payload cases) |
| U-SAV-17 | Import of an older version runs the migrations |
| U-SAV-18 | Import over an existing save requires confirmation (a state-machine test) |
| U-SAV-19 | Only committed state is saved: calling save while the state machine is in `battle.*`, `capture.*`, `evolution.*`, `transition.*` or `shop.transaction` is **disabled** (**D19**). A reload in any of these states resumes from the pre-battle committed checkpoint: the wild creature or trainer is still there, and no Chime, item or XP from the interrupted battle is applied. Checkpoints are listed in [rnd] §10.5 |
| U-SAV-20 | Autosave points **[arch]** (e.g. after a battle result is committed, on zone entry, after a purchase) each write exactly once |
| U-SAV-21 | The saved RNG state and position restore exactly: the next encounter roll after a load equals the roll from an uninterrupted session with the same seed (determinism across save/load) |
| U-SAV-22 | New Game with an existing save: the old save goes to backup only after confirmation; cancelling leaves the storage untouched |

### 3.15 Encounter trigger (`U-ENC`) and state machines (`U-SM`)
| ID | Spec |
|---|---|
| U-ENC-01 | One contact produces exactly one `encounterStart`, even if the contact persists for many frames |
| U-ENC-02 | Two wild creatures touching the player on the same frame produce exactly one encounter (the nearest wins, with the seeded tie-break); the other creature is despawned or pushed back per **[world]** |
| U-ENC-03 | After a battle (win, capture, flee or wipe): 4 s of encounter immunity; creatures within 8 m startle away for 3 s ([world] §4.2) |
| U-ENC-04 | Contact during dialogue, transition or a menu is ignored |
| U-ENC-05 | Encounter table selection: weights normalized; seeded selection over 1e5 trials matches the weights within ±1% absolute |
| U-ENC-06 | Roaming cap (**D21**): the live roaming count is ≤ 6 in every zone and on every profile (High, Balanced, Mobile), including the cave. Checked over a 10-minute simulated spawn-tick run per zone |
| U-SM-01 | Every state machine has a transition table; the test asserts every (state, event) pair is either handled or explicitly ignored (no silent undefined) |
| U-SM-02 | Every non-terminal state is reachable from the initial state and can reach an exit state (graph check) |
| U-SM-03 | Battle menu: Fight/Bag/Switch/Run; Run is disabled in trainer battles; Switch is disabled when no other conscious creature exists; singles only (one active creature per side) |
| U-SM-04 | Forced switch after a faint cannot be cancelled while a conscious creature remains; with no conscious creature remaining, it goes to the defeat flow |
| U-SM-05 | Capture sub-machine: select Chime → (full storage: confirm, D18) → throw → rings 0–3 (D9) → result → (success: nickname? → placement or mandatory release prompt) → return, with no path back to a menu that allows a double throw |
| U-SM-06 | Evolution sub-machine: start → anim → (cancel?) → learn moves → done; interrupting it (unmount) resumes or rolls back to the pre-evolution committed state |
| U-SM-07 | Quality profile config: each of High/Balanced/Mobile defines every key; no key is missing or undefined |
| U-SM-08 | Settings reducer: volume values are clamped to [0, 1]; mute is independent of the volume values; settings are persisted separately from the game save |
| U-SM-09 | Two-phase trainer (**D22**): Odile's battle starts in phase A with attunement Silenced. When her third kin faints, a `phaseChange` event restores frost ×11/10 and sends her ace. The event log is deterministic under a fixed seed (DS-13). A reload during the battle returns to the pre-battle checkpoint in phase A |

### 3.16 AI (`U-AI`)
| ID | Spec |
|---|---|
| U-AI-01 | The three difficulties produce valid actions only (legal move with charges > 0, legal switch) over 10,000 random states |
| U-AI-02 | No reading the player's queued action (same as U-ORD-08) |
| U-AI-03 | Difficulty ordering: in the fixture scenario DS-05, the hard AI picks a super-effective move ≥ the frequency of normal, which is ≥ easy (statistical over seeds) |

---

## 4. Data validation tests (`D-*`, vitest + zod, real content)

| ID | Check | Failure output |
|---|---|---|
| D-01 | Every content file parses and passes its zod schema (creatures, moves, types, items, encounters, zones, quests, dialogue, trainers, progression) | File, path and zod issue |
| D-02 | Ids are unique within each collection; id formats match the anchors (`c01`–`c30`, `f01`–`f10`, `m\d{3}`, `i_`, `t_`, `q_`, `flag_`, `trial_1`–`trial_6`, `champion`, zone ids). Item ids must equal the set in `src/data/content/items.json` (**D10**): `i_chime_reed/brass/silver/crown`, `i_salve_1..4`, `i_cure_*`, `i_revive_1..2`, `i_charge_1..2`, `i_disc_01..18`, `i_keynote_1..6`, `i_evo_prism`, key items. Retired v1 prefixes are an error anywhere in content: `i_orb_`, `i_capture_t`, `i_tonic_`, `i_crest_`, `i_mark_`, `D01`-style disc slots, `t_hush_`. Story flag and quest ids are the [cd] §4.2 list | Duplicate list / foreign-scheme ids |
| D-03 | Reference integrity: every foreign key resolves (learnset → move, evolution → creature, encounter → creature/zone, trainer party → creature and moves, quest prereqs/sets → flags, dialogue → NPC/flags/items, shop → item, reward → item or creature, zone exits → zone and spawn) | Dangling reference list |
| D-04 | Every flag that is required somewhere is set somewhere; every flag that is set is used or tagged `cosmetic` | Orphan lists |
| D-05 | Encounter weights: per table, all weights > 0 and they sum to 1 ± 1e-9 (or are normalized at load; the test asserts the normalized sum); level ranges satisfy min ≤ max, within [1, cap] | Table id and sum |
| D-06 | Every zone with wild creatures has a base table (no condition) so that no weather or time combination yields an empty table | Zone id |
| D-07 | Learnsets: every move id is valid; the levels are ascending and within [1, cap]; each creature has ≥ 1 move learnable at or below its lowest encounter level (no moveless instances) | Creature and level |
| D-08 | Every creature at every encounter or trainer level has ≥ 1 damaging move available (so the campaign cannot softlock on a moveless or status-only creature) | Creature and level |
| D-09 | Trainer parties: species, levels and moves are valid; each move is in the species' learnset or disc list (or flagged `special`) | Trainer id |
| D-10 | Items: prices ≥ 0; sellPrice ≤ buyPrice; the 4 capture tiers exist with ascending strength | Item id |
| D-11 | Dialogue: every node is reachable from its entry; every choice leads somewhere; no text is longer than the UI line budget **[creative]** | Node id |
| D-12 | All user-visible strings are in the string table (no hardcoded UI text outside it, lint-assisted) | File and line |
| D-13 | Weather and time encounter modifiers reference only valid weather and time ids; every zone's weather set is consistent with the rendering weather support | Zone id |
| D-14 | Capture devices (**D10**): exactly 4, `i_chime_reed` < `i_chime_brass` < `i_chime_silver` < `i_chime_crown`, with O10 = 10/15/20/30 and prices 200/600/1200/2500 ([sys] §7.1) | — |
| D-20 | Exactly 30 creatures `c01`…`c30`; exactly 10 families; each family has stages 1, 2 and 3 with ids per the anchor mapping (f01 = c01–c03, …). Display names (**D7**): c01 Fizzkit, c04 Wickwool, c07 Rippleback, c11 Lullstalk, c27 Emberfold, c30 Coronaleen, others per creatures.md §0 | Diff |
| D-21 | Evolution chains are consistent: stage 1 → 2 → 3 within a family; each non-final stage has exactly one evolution to the next stage of the same family; stage 3 has none; no cycles; the evolution level (if level-based) of stage 1 is lower than that of stage 2; each chain member's primary type equals the family type per the anchor (f01 electric … f10 lumen). Evolution levels equal **D11** exactly (see U-EVO-08) | Chain |
| D-22 | Exactly 10 types with the anchor ids; the matrix is 10×10 and complete | Diff |
| D-23 | Moves ≥ 80, with ids `m001`… contiguous or documented gaps | Count |
| D-24 | "Mechanically meaningful": every move has a unique (type, category, power, accuracy, priority, effect set) tuple, or an explicit `distinctFrom` note; every type has ≥ 5 moves; each move is learnable by ≥ 1 creature or disc (no dead moves) | List |
| D-25 | Every creature is obtainable: for each species, ≥ 1 of (wild encounter in a reachable zone; evolution from an obtainable species at a level ≤ cap; documented reward, gift or trade whose prereq flags are reachable). This explicitly includes the two unchosen starters for **each** of the 3 starter choices (3 runs of the check), and they must be obtained via exactly the **D5** route: leftover line via `q_foster_leftover` (Lv 25), rival line via `q_second_clutch` (Lv 30). Starter lines are never wild at stage 1 | Species and starter choice |
| D-30 | The zone set equals the anchor set (3 towns, 5 routes, forest, cave, lake, volcano, snowpeak), plus `league`; the critical-path zone order is **D1** `town_1 → route_1 → forest → route_2 → town_2 → cave → route_3 → lake → town_3 → route_4 → volcano → route_5 → snowpeak → league` (first-entry order along the main-quest walk); every zone is reachable from `town_1` via exits (graph BFS) with its gates satisfiable | Unreachable zones |
| D-31 | Exactly 6 trial venues and 1 `champion`, with host zone and hall type (**D1**): `trial_1` forest verdant, `trial_2` town_2 stone, `trial_3` lake water, `trial_4` town_3 gale, `trial_5` volcano fire, `trial_6` snowpeak frost, `champion` league (Rhea). Each Cantor's team centers on the hall type | Diff |
| D-32 | The quest graph is acyclic (topological sort succeeds); each mandatory quest is reachable (U-QST-04 on real content) | Cycle path or unreachable list |
| D-33 | Trials are reachable in order: the walk sets `flag_trial_n_cleared` in order 1…6 (D1), then `flag_nullbell_broken`, `flag_spire_open`, `flag_rival_6_done`, `flag_champion_defeated` ([cd] §4.2); no trial is completable before its predecessor | Order violation |
| D-34 | Every town has healing; shop and fast-travel points per [world] v2; every healing point is a valid wipe destination (D20: last healing point visited; town_1 home before any) | Zone id |
| D-35 | Field-action gates (**D2**): exactly **4** mandatory gates: forest Rootgate (Rootcall/verdant, unlocked by `flag_resonance_tutorial`), cave lower galleries (Heave/stone, `i_keynote_1`), route_4 ascent (Gust/gale, `i_keynote_3`), snowpeak falls (Rime/frost, `i_keynote_5`). For each: (a) the register is unlocked strictly before the gate in the walk; (b) a kin of that type is obtainable in zones reachable before the gate, **for every starter choice** (for Rootcall, the scripted route_1 f04 capture-tutorial encounter counts); (c) a Resonance Steward NPC exists within 15 m ([cd] R1, R7). No mandatory gate requires electric, fire or water. Any other node referencing a register must be flagged optional | Gate, register and missing prerequisite |
| D-36 | No mandatory quest, evolution or obtainability path requires network, multiplayer, a real-time clock or a real-date condition; time-of-day content is reachable through an in-game time advance (e.g. resting) | Offending entry |
| D-40 | Asset manifest: every file in `public/` and `src/assets/` that is not code is listed with origin (`procedural`, or a third party with a verified license, source URL and date checked); third-party entries only in environment categories | File |
| D-41 | Dependency pin check: package.json majors equal the fixed stack | Package |
| D-42 | Boundary lint: `src/sim/**` imports none of `three`, `@react-three/*`, `react`, `tone`, `zustand`, `window`, `document` or `localStorage` | Import |
| D-43 | `@react-three/rapier` is imported only under the overworld paths | Import |
| D-44 | Species definitions are deep-frozen after load (mutation throws in a test) | — |
| D-45 | Each expensive effect key in the quality config has a Mobile value that is off or reduced, and a documented fallback | Key |
| D-46 | Every species has cry synthesis params; every move has an animation ref and an sfx ref; every zone has a music theme id | Missing refs |
| D-37 | Trainers (**D4**, [sys] §14 v2): exactly 6 `t_rival_*` story battles (`t_rival_1..6`) placed in chapters 1, 3, 5, 8, 10 and 12; each rival team contains the rival's starter line at the stage its level implies (D11). Trial leaders, admins, Odile (with `phases`, D22) and the champion have team sizes and levels equal to [sys] §14.1 v2 | Trainer id |
| D-47 | Zone attunement (**D1**): `zones.json.attunedType` equals route_1 lumen, forest verdant, route_2 stone, cave electric, route_3 toxin, lake water, route_4 gale, volcano fire, route_5 shade, snowpeak frost; towns and league `null`; trial interiors equal their hall type. The ten outdoor zones cover all 10 types exactly once | Zone id |
| D-48 | Wild level floor (**D23**): no encounter-table entry offers a stage-2 or stage-3 species with a minimum level below the level at which it evolves into that stage (D11) | Table and species |
| D-49 | Derived fields (**D12**): catchRate, xpYield and growth recompute from [sys] §2.1 (catch 190/90/45, starters 45; Y = floor(BST/5), floor(BST/3), floor(4·BST/9); growth per family). BST bands: stage 1 280–320, stage 2 395–435, stage 3 505–535; starters exactly 310/405/525 | Species |
| D-50 | Traits (**D13**): each species has exactly one trait id from the canonical [sys] §10 list; no stage-1 species has `tr_adaptive` | Species |

---

## 5. Browser smoke tests (`B-*`, Playwright, preinstalled Chromium)

The configuration is headless Chromium with `--use-gl=swiftshader` (or `angle-swiftshader`), a desktop viewport of 1280×720 and a mobile project of 390×844 with `hasTouch` and `isMobile`. Every test uses `?seed=` and `?fastText=1`, and waits on `window.__qa.ready` and on `__qa.state()` values rather than sleeping. Each test attaches a trace and screenshots on failure. Console errors fail the test (except an allowlist for software-GL warnings).

| ID | Flow | Assertions |
|---|---|---|
| B-01 | Title screen loads | The Title shows New Game and Settings (Continue hidden with no save); keyboard focus is on the first item |
| **B-12** | **Golden path**, `?seed=1&debug=1&fastText=1&forceEncounter=<route_1 species>:3`: title → New Game (confirm) → intro → starter pick (keyboard: arrow, then Enter; the displayed names are Fizzkit / Wickwool / Rippleback, D7) → Rival 1 battle (win or lose, the story continues, D20) → walk to `route_1` with WASD → touch a roaming creature (or the scripted f04 capture-tutorial kin) → battle → use Moves until the enemy is at low HP (seeded, deterministic) → Satchel → `i_chime_reed` → the Chime rings 3 times and the success chord plays (D9) (the seed is chosen so it does; the test asserts it) → results → open the save menu and save → `page.reload()` → Title shows Continue → Continue | After the reload: `__qa.store()` party includes the captured species with the same instance id; the position is within 1 m of the save point; the money and inventory match the values before the reload; the encyclopedia shows the species as caught; the state is `exploration` |
| B-02 | Keyboard movement | Pressing W for 1 s moves the player forward > 1 m; releasing it stops the player within 0.3 s |
| B-03 | Mouse camera | Pointer lock or drag rotates the camera yaw; W then follows the new forward vector |
| B-04 | Slopes, steps, camera collision | A scripted path over the QA test course (`?zone=qa_course`) reaches the end marker within 30 s; camera occlusion check as in gate 1.4 |
| B-05 | Follower | The follower is within the documented distance after a scripted path |
| B-06 | Encounter trigger and cap | Stand in contact for 3 s: the event log shows exactly 1 `encounterStart`. After the battle, stay within contact range for 4 s: no new encounter ([world] §4.2). On each profile (`?profile=high\|balanced\|mobile`), the roaming count in `__qa` stays ≤ 6 over 120 s in `route_1` and the cave (**D21**) |
| B-08 | Battle staging | The battle stage position is in the current zone; the screenshot is attached for V-13 |
| B-09 | Battle menu | The commands are labelled **Moves / Satchel / Swap / Retreat** ([cd] §7.4) and are all operable by keyboard. Retreat in a wild battle returns to exploration (seeded success); Retreat is disabled with a message in trainer battles. Status chips show D8 codes (SCH/BLT/JLT/DRW/RMB) with shapes, and the attunement pill reads "×1.1" (D3) |
| B-10 | NPC dialogue | Interact key → dialogue → advance with Enter or Space → exit; movement is blocked during dialogue |
| B-11 | Menus open and close by keyboard | For each of party, bag, storage, map, journal, encyclopedia and settings: open via its hotkey or pause menu, confirm `__qa.state()` changes, press Esc, and confirm the state returns to `exploration` with focus back on the game. Arrow keys move focus within each menu; Tab never escapes into an invisible element |
| B-13 | Fixture load | For each save fixture: `?save=<fx>` → Continue → the expected zone and state |
| B-14 | Malformed save | `?save=fx_save_malformed_json` → a recovery dialog; with a valid backup, "restored from backup" is shown; a screenshot is taken |
| B-15 | Quota | `?storage=quota` → save → an error toast or dialog appears; the game continues; the Export option is visible |
| B-16 | Export and import | Export downloads a file (Playwright download) → New Game (confirm) → Import that file → the state deep-equals the exported state |
| B-17 | New-game confirmation | With a save present, New Game shows a confirmation; Cancel keeps the save byte-identical |
| B-18 | Reload mid-battle | Start a battle, take 2 turns, reload → Continue → the state equals the last committed **pre-battle** checkpoint (**D19**; there is no battle resume), the wild creature is gone from the roster (the roaming state is not saved) but can be met again, and nothing is duplicated (no item double-spend, no duplicate creature) |
| B-19 | Party full → storage | `?save=fx_save_full_party` → capture → a "sent to storage" message; the storage UI lists it |
| B-33 | Full storage (**D18**) | `?save=fx_save_full_storage&forceEncounter=…`. (a) Select a Chime → confirm dialog → **No** → back in the Satchel; the Chime count is unchanged and the turn is not spent. (b) **Yes** → seeded success → the release prompt can't be closed with Esc → "Choose one to release" → the starter is greyed out (bond) → pick a stored creature → double confirm → party + storage = 306 and the new creature is present. (c) Repeat (b) but reload before resolving: Continue shows the pre-battle state (D19) |
| B-34 | Rival 1 loss (**D20**) | `?seed=` chosen so Rival 1 wins → the story continues in town_1 with the party healed, `flag_rival_1_done` set, and no money penalty. Then, with a save before Rival 2, force a loss: the player warps to the last healing point, the penalty formula applies, and Rival 2 is re-armed |
| B-20 | Zone traversal | Walk every exit pair in the zone graph (via `?zone=` and a scripted walk to each exit trigger): arriving at the correct spawn, with no fall-through (y above the terrain) |
| B-21 | Encyclopedia viewer | Open the entry; drag rotates the model (camera azimuth changes); wheel or pinch zooms within the clamps; keyboard arrows rotate |
| B-22 | Move replacement UI | A fixture with a creature 1 XP short of a new move and 4 moves known → win a battle → the replace prompt → choose slot 2 → the move list is updated |
| B-23 | Shop | Buy with enough funds, buy with insufficient funds (disabled or error), sell |
| B-24 | Heal and fast travel | The healing center restores the party; fast travel lists only visited towns and teleports there |
| B-25 | Mobile joystick | On the mobile project: a touchstart on the joystick zone → touchmove 60 px up → hold 1 s → the player moved forward; touchend → stops. Driven with CDP `Input.dispatchTouchEvent` for multi-touch |
| B-26 | Mobile camera drag and contextual buttons | A second touch drags on the right half → the camera yaw changes while the joystick is held; a contextual Interact button appears near an NPC and opens dialogue; tap targets are ≥ 44×44 CSS px |
| B-27 | Journal | The active objective text is present at every fixture save |
| B-28 | Audio gesture | Before any input, `Tone.context.state !== 'running'`; after the first click or key, it is `'running'`; no autoplay console warnings are treated as errors |
| B-29 | Volume and mute persistence | Set music to 0.3 and mute → reload → the values persist |
| B-30 | Release hygiene | A build without `VITE_QA`: `window.__qa` is undefined; `?save=`, `?zone=` and `?forceEncounter=` have no effect |
| B-31 | Interrupted transition | Trigger a zone exit → reload during the fade (at 50% of the transition, using `__qa.state()==='transition.loading'`) → Continue → the player is in either the source or the destination zone at a valid spawn, never at an out-of-bounds position; the save is not corrupted |
| B-32 | Hidden tab pauses | Hold W; dispatch `visibilitychange` with `document.visibilityState` overridden to `hidden` (or use CDP `Page.setWebLifecycleState` frozen or a new tab) → wait 2 s → visible again. Movement did not continue while hidden; no encounter triggered while hidden; the audio context is suspended or muted while hidden; the battle timer (if any) is paused |
| B-40 | Quality profiles | `?profile=` for each profile: renderer info (shadow map enabled, pixel ratio) matches the config |
| B-41 | Day/night | Advancing the in-game time (debug) changes the light and sky; screenshots at 4 times |
| B-42 | Weather visuals match rules | `?zone=` a snow-capable zone with forced weather → the snow particles are visible; the encounter table in use (via `__qa`) is the snow variant |
| A11Y-01 | Keyboard only | All menus and battle are operable with no mouse (B-11, B-09 without the mouse) |
| A11Y-02 | Text size | Computed font size ≥ 16 px for body UI text and ≥ 14 px minimum anywhere at 1280×720; the text scale setting (if any) applies |
| A11Y-03 | Contrast | axe-core `color-contrast` passes on the title, menus, battle UI and dialogue |
| A11Y-04 | Reduced motion | `prefers-reduced-motion: reduce` or the setting → camera shake and screen flashes are disabled (their config flags are read via `__qa`); battle transitions use a crossfade |
| A11Y-05 | Not color alone | Types (glyph + 3-letter code), status (D8 code + shape), HP bands (solid/dashed/dotted line, [cd] §7.4) and quest markers each have a text or icon distinction; a grayscale screenshot comparison is attached for manual review |
| A11Y-06 | Camera sensitivity | The slider changes the yaw per pixel of drag proportionally (measured on 2 settings) |
| A11Y-07 | Focus visible | Every focused interactive element has a visible focus indicator (axe `focus-visible` + a screenshot) |
| A11Y-08 | Flash safety | No full-screen flash above 3 Hz in move effects: an effect config lint and a manual check in reduced and normal motion |

---

## 6. Fixtures

### 6.1 Seeded RNG fixture
- `tests/fixtures/rng.ts` provides `fixedRng(values: number[])`, which returns the values in sequence and throws when they are exhausted, so the test fails loudly if the sim draws more than expected. It also provides `seededRng(seed)` (the production implementation) and `recordingRng(seed)`, which logs every draw with a call-site label to debug determinism diffs.
- Seeds used in the suites: `1`, `2`, `3` (smoke), `0xC0FFEE` (sim baseline), and `1…10000` for statistical tests.

### 6.2 Canned save files (`tests/fixtures/saves/`)
Every fixture is generated by a script (`npm run fixtures:gen`) from a scripted sim of real gameplay actions, not hand-edited. Exceptions are the malformed and old-version fixtures, which are hand-authored. Fixtures are regenerated on each schema bump, and the old files are **kept** as migration inputs.

| Fixture | Contents | Used by |
|---|---|---|
| `fx_save_fresh` | Right after the starter pick (Fizzkit line, c01), in `town_1`, with starting money and items | B-12, B-13 |
| `fx_save_pre_trial_1` | At the Rootloft Hall (`trial_1`, forest, verdant) entrance; party of 3 at the [sys] §14.2 expected level; Rootcall + triad registers; all flags before trial_1 | B-13, SIM spot checks, M-10 |
| `fx_save_post_trial_2` | Just after `trial_2` (town_2, stone); `i_keynote_1..2`, so Heave and Seep are unlocked; standing before the cave Heave gate (D1/D2) | P4 gate, B-13 |
| `fx_save_pre_champion` | Trials 1–6 complete, `flag_nullbell_broken`, `flag_rival_6_done` not set; party of 6 at about Lv 46–48 | P5 gate, M-30 |
| `fx_save_full_party` | Party of 6, storage has 10 | B-19 |
| `fx_save_full_storage` | Party of 6 (slot 1 = `bond` starter); storage at the cap (300); a wild encounter forced nearby | U-CAP-11, U-PTY-05, B-33, M-62 |
| `fx_save_pre_stillhouse` | ch8, route_4 after the Gust gate; `flag_rival_4_done` not set; for the D5 leftover-rescue path | U-QST-08, M-20 |
| `fx_save_pre_odile` | ch11 snowpeak summit, before the two-phase battle (D22) | U-SM-09, DS-13 |
| `fx_save_pre_rival_2` | ch3 before `t_rival_2`; used for the D20 re-arm case | B-34 |
| `fx_save_one_move_learn` | Creature 1 XP short of a new move, with 4 moves known | B-22 |
| `fx_save_pre_evolution` | Creature 1 XP short of evolving | M-64 |
| `fx_save_malformed_json` | Truncated JSON primary, valid backup | B-14, U-SAV-09 |
| `fx_save_malformed_both` | Both slots invalid | U-SAV-10 |
| `fx_save_bad_refs` | Valid JSON with unknown species `c99` | U-SAV-12 |
| `fx_save_v1` … `fx_save_v{N-1}` | One file per historic schema version. **`tests/fixtures/saves/v1.json` exists** (used by the implemented persistence.test.ts; the current schema is v2) | U-SAV-02…04 |
| `fx_save_future` | `schemaVersion: 999` | U-SAV-05 |
| `fx_save_each_starter_{c01,c04,c07}` | Fresh saves per starter (ids, not names, so a future rename can't break them) | D-25/D-35 cross-check, SIM-01 |

### 6.3 Deterministic battle scenarios (`tests/fixtures/battles/`)
Each scenario is a JSON file containing: both sides' instances, weather, zone attunement, seed, a scripted player action list, AI difficulty, and the **expected event-log snapshot** (vitest snapshot; any change needs review).

| ID | Scenario | Purpose |
|---|---|---|
| DS-01 | Starter vs starter, neutral effectiveness, seed 1 | Baseline damage and order |
| DS-02 | Super-effective dual-type ×4 hit, crit forced | Multiplier stacking |
| DS-03 | Immunity (×0) + status move | No damage and no status on immune |
| DS-04 | Priority move vs faster opponent | U-ORD-01 |
| DS-05 | Speed tie at seeds 1 and 2 (opposite outcomes) | Seeded tie |
| DS-06 | Burn residual KO on both sides in the same turn (no weather chip damage exists, [sys] §5.3) | End-of-turn order; double faint → player wins |
| DS-07 | Forced switch chain (3 faints) | Switch flow |
| DS-08 | Capture at p ≈ 0.5, seeds giving success and failure | Capture flow |
| DS-09 | All moves at 0 charges | Fallback action, no softlock |
| DS-10 | Stat stage +6 and −6 clamps | Stage bounds |
| DS-11 | The [sys] §16 turn (rain, route attuned electric) under **D3** | Arc Lash 48, Bubble Lance 22, end-of-turn burn KO, XP 473, payout 680 |
| DS-12 | Level-up mid battle ×2 levels + move-learn prompt queued after the battle | XP flow |
| DS-13 | Odile two-phase battle (**D22**) | Phase A has no attunement bonus on frost moves; the `phaseChange` event occurs after her 3rd faint; phase B frost moves get ×11/10 |
| DS-14 | Weariness stall (heal + Bulwark loop) | Battle ends by turn 65 ([sys] §15.8) |

A fixture content pack (`tests/fixtures/content/`) contains 6 test species across 4 types and 12 moves, with round-number stats. It lets the unit tests stay stable while real content changes balance.

---

## 7. Automated full-story completion: campaign simulation (`SIM-*`)

### 7.1 What it is and what it is not
- **It is** a headless node test that uses the real content JSON and the real pure battle sim (no rendering, no UI, no Rapier, no audio). It shows that the campaign is **mechanically completable**: the flags are reachable, the gates are satisfiable, and each mandatory battle is winnable by a plausible party at the expected level with a simple, non-optimal policy.
- **It is not** a playtest. It does not validate fun, pacing, playtime, control feel, camera, UI clarity, readability, navigation difficulty, or whether a human understands where to go. The sim does no pathfinding in 3D space and does not detect physical softlocks (being stuck in geometry); B-20 and the manual route cover those. **The sim output must never be quoted as playtime or as a difficulty verdict from players.** Reports carry the header "Campaign simulation — mechanical completability only; not a playtest".

### 7.2 Algorithm
1. **Inputs:** the content JSON; the systems.md expected-level curve per mandatory battle (`progression.json: expectedPartyLevel[battleId]`, taken from the [sys] §14.1 "recommended player ace" and §14.2 party averages as revised for D1/D4/D23); the starter choice (run 3 times, once per starter); the seed base.
   - **Mandatory battle list (oracle):** the [cd] §4 12-chapter critical path in D1 order. It includes `t_rival_1..6` (**D4**; R1 is counted but its loss is non-blocking per D20), the admins Brann 1 and 2 and Vey 1 and 2, the grunts on the critical path, the Cantors of trial_1…trial_6 (verdant, stone, water, gale, fire, frost), Odile as a two-phase trainer (**D22**; phase A has no attunement, phase B frost ×11/10), and the Concordant.
   - **Battle math:** attunement ×11/10 after STAB (**D3**), with the zone types from D1. Trial halls use the Cantor type, so the leader's STAB moves also get the bonus. The report must show leader win rates both with and without the bonus to evidence the D3 rationale.
   - **Obtainable species** follow D-25 with the **D5** gifts (leftover Lv 25 from ch8; rival line Lv 30 after trial_5) and **D11** evolution levels.
2. **Walk:** topologically order the quest graph (D-32). Maintain `flags`, `reachableZones`, `unlockedFieldActions`, `inventory budget` and `availableSpecies` (species obtainable so far, per D-25 rules restricted to reachable zones and flags).
3. **Party builder (a "reasonable party", deterministic):** at each mandatory battle, pick 6 (or fewer, if fewer are available) species from `availableSpecies`: always the starter line, then a greedy type-coverage choice that maximizes the count of the opponent party's types hit super-effectively, preferring species from encounter tables of the most recent zones. Levels = `expectedPartyLevel − 2` (a deliberate handicap; configurable). Each creature evolves if its evolution level ≤ its assigned level and the evolution method is available. Moves = the last 4 damaging-or-status moves learned by that level; the teaching discs are those obtainable before this point. Items = healing items purchasable so far, capped at a budget of `money earned so far × 0.3` (no hoarding assumption).
4. **Player policy (fixed, simple):** pick the move with the highest expected damage (power × accuracy × effectiveness × STAB); switch only when the active creature is fainted; switch in the party member with the best type matchup; use the best healing item when the active creature has HP < 25% and an item remains, at most 2 per creature per battle. No foresight, no status strategy.
5. **Opponent:** the real trainer data at the configured difficulty (Normal) plus the real AI.
6. **Run:** 200 seeds per battle, per starter choice.
7. **Pass criteria per mandatory battle (blocking):** win rate ≥ **60%** for trial leaders, Odile and the champion (consistent with [sys] §14.2: "wins in 1–2 attempts at recommended ace"); ≥ **80%** for rival and antagonist story battles before trial_3; ≥ **70%** for other mandatory battles. *Softlock checks:* 0 battles hit the turn limit (200 turns) or throw; 0 seeds with an illegal or no-action state.
8. **Balance signals (non-blocking, reported):** win rate at `expected + 3` levels (too easy if 100% at `expected − 5`); mean turns per battle; the item consumption per battle.

### 7.3 SIM ids
| ID | Check | Blocking from |
|---|---|---|
| SIM-01 | Every mandatory battle meets the section 7.2 criteria, for all 3 starter choices | P4 (to trial_2), P5 (to champion) |
| SIM-02 | At each of the **4 mandatory gates (D2)**, the simulated troupe, including fainted members, contains the required type **without** Steward help, for ≥ 1 party-builder configuration per starter choice. Steward help is then verified as the fallback for an empty troupe (U-RES-04) | P4, P5 |
| SIM-03 | XP sufficiency without grinding: the XP from all mandatory battles plus an estimated wild-encounter count per zone **[world/sys budget]** (e.g. N wild battles per route at the table's mean level) brings the starter to ≥ `expectedPartyLevel − 2` at each trial. A shortfall is a **balance bug (S2)**: grinding would be required. The report lists the wild-battle count assumed, labeled as a budget assumption | P5 |
| SIM-04 | Economy: money earned along the walk (trainer rewards plus a conservative sell estimate) covers the healing items and capture devices the budget assumes; the running balance is never negative | P5 |
| SIM-05 | Loss recovery (**D20**): for each mandatory battle, force a loss. For Rival 1 → `flag_rival_1_done` is set and the walk continues. For every other battle → the state per U-PTY-10 (last healing point, penalty formula, event re-armed, no flag set) still allows a retry with nothing lost | P4 |

---

## 8. Benchmark scenes and procedure

Budgets and profile definitions come from `design/rendering_and_architecture.md` (not yet written). This section defines the **scenes and the method**.

### 8.1 Scenes (`?bench=<id>&quality=<profile>`)
| ID | Scene | Stresses |
|---|---|---|
| BM-01 | `town_1` midday, 8 NPCs, the follower, the camera orbit path | Baseline lighting, shadows, character count |
| BM-02 | `forest` densest vegetation cell, wind on, 6 roaming creatures | Instancing, vegetation wind, overdraw |
| BM-03 | `lake` shoreline, water animated normals, reflections per profile | Water shader |
| BM-04 | `volcano` with lava particles, heat effects | Particles, emissive and bloom |
| BM-05 | `snowpeak` heavy snow weather + fog + night | Weather particles, fog, day/night |
| BM-06 | Battle in `forest`: two stage-3 creatures, 10 scripted turns of the heaviest move effects | Battle VFX, character animation |
| BM-07 | Encyclopedia viewer rotating all 30 species in sequence | Per-species builder cost, face textures |
| BM-08 | Zone transition loop `town_1 → route_1 → forest → route_1` ×5 | Load time, memory growth (leaks) |

### 8.2 Procedure
1. Use a production build (`npm run build && npm run preview`) with `VITE_QA=1` (for `?bench`), and close all other apps and tabs.
2. Warm up for 10 s (shader compilation excluded from the stats but reported as "first-frame time" and "time to interactive").
3. Measure for 60 s on a scripted, deterministic camera path. Record every frame's `requestAnimationFrame` delta. The overlay is off during the measurement.
4. Report: mean FPS, p50, p95 and p99 frame time, 1% low FPS, count of frames > 50 ms, `renderer.info` (draw calls and triangles sampled every 1 s: max and mean), textures and geometries count, `performance.memory` where available, load time per zone (BM-08: memory after cycles 1 and 5, to detect leaks), and the chosen DPR.
5. Run 3 times; report the median run.
6. The output is `bench/<BM>_<profile>_<deviceId>_<date>.json` + `.md`, with device model, CPU, GPU, RAM, OS, browser and version, display resolution, DPR, power state (plugged in), and build SHA.

### 8.3 Reference devices
| Id | Class | Status |
|---|---|---|
| RC-L | Mid-range laptop per [rnd] §7.1 (i5-1235U + Iris Xe or Ryzen 5 7530U + Vega 7, 16 GB, Chrome, 1920×1080, DPR 1). Pass (targets): Balanced avg ≥ 58 FPS, p95 ≤ 20 ms, no frame > 100 ms after warm-up, zone load ≤ 2.0 s | **Not measured** (D26; physical access pending) |
| RC-P1 | Pixel 7, Chrome Android, landscape, DPR capped at 1.5, Mobile profile. Pass: avg ≥ 30 FPS, p95 ≤ 40 ms sustained over 10 min, zone load ≤ 3.0 s | **Not measured** (D26) |
| RC-P2 | iPhone 13, Safari (iOS 18+), landscape, DPR capped at 1.5, Mobile profile. Same pass criteria as RC-P1 | **Not measured** (D26) |
| CTR (= [rnd] CONTAINER-SW) | This container, headless Chromium, SwiftShader | Available. **All results labeled "Non-representative (container, software rendering)"**; used only for regression trends (draw calls, triangles and load payload are hardware-independent and may be compared against budgets; FPS may not) |

A performance claim is allowed in docs or release notes only as "X FPS p50 on RC-L, BM-02, Balanced, build <sha>, <date>". Until the reference devices are measured, the status is **Not measured**.

---

## 9. Character-direction tests

A failed check in this section **blocks the phase** (G-CHAR). The checks apply to every character-class asset present in the phase build: creatures, the protagonist, the rival, antagonist members, trial leaders, the champion, and named or generic NPCs.

### 9.1 Automated checks (`C-*`)
| ID | Check | Pass criterion |
|---|---|---|
| C-01 | **Builder registry completeness**: import `speciesBuilders` and `characterBuilders` | Every creature id in `creatures.json` (all of `c01`–`c30` from P5) has a registered builder; every trainer or NPC `modelId` in data has a registered builder; no two ids map to the same function reference |
| C-02 | **Silhouette sheet generation**. Per **D27**, the gate of record is [rcg] **GC-07** (side + three-quarter views, 256 px and 20 px, D = 1 − IoU thresholds, 20 px fill 15–75%, frozen at the Phase 3 calibration); planar designs may use a per-species side angle. The QA metrics below are supplementary. Original QA spec (`/gate.html` / `?tool=silhouettes`): each builder is rendered in its idle pose frame 0, in 3/4 front and side view, with an unlit flat black material on a white background, an orthographic camera, and the model fitted to 90% of the frame. Output: `sheet_256.png` (each tile 256×256) and `sheet_20.png` (each tile downsampled to 20×20 with area averaging, then thresholded at 50%) | The files are generated. Automated metrics: tile coverage between 8% and 75% (at 256 px); **pairwise IoU at 20 px** for all pairs: any pair with IoU > 0.85 is flagged for V-02 review (a flag is not an automatic fail). Within a family, stage pairs with IoU > 0.90 at 256 px **fail** (evolution must change anatomy) |
| C-03 | **Animation clip completeness** | Every species has all 7 clips (`idle`, `move`, `attack`, `hit`, `capture`, `faint`, `victory`), plus `attack_special` where creatures.md lists one. Durations lie within the creatures.md per-species ranges (**D15**: attack 0.4–1.3 s), and the attack contact/impact event falls at 40–55% of the clip. The [cd] §5.5 caps are reported as a warning only; each clip animates ≥ 2 named parts; `idle` loops seamlessly (the pose at t=0 equals the pose at t=end within 1e-3); trainers and NPCs have the clip set defined for them in creative_direction.md |
| C-04 | **Face atlas complete (D14)** | Each species' face atlas has exactly the 8 cells `open, half, closed, happy, hurt, faint, determined, surprised`. Each cell is ≥ 256 px on High and Balanced and ≥ 128 px on Mobile, and each non-`open` cell differs from `open` by ≥ 3% of pixels ([rcg] GC-04). The right eye is a UV mirror, which is accepted. The eye region is non-empty (≥ 2% non-background pixels), sampled via `?tool=faces` |
| C-05 | **No placeholder flag** | Builder metadata `placeholder !== true`; there is no fallback builder (for example `defaultCreature` or `capsulePlaceholder`) in the production registry; a string scan finds no `placeholder`, `TODO`, `tmp` or `lorem` in character data |
| C-06 | **Not a recolor or uniform scale** | For each pair of species (and specifically within each family), compare geometry signatures: the set of part names plus the per-part vertex count plus the bounding box aspect ratios normalized by uniform scale. Identical signatures after normalizing uniform scale and ignoring materials = **fail**. Stage 2 and 3 must differ from the previous stage in ≥ 2 named parts (added, removed or reshaped) |
| C-07 | **Name and term originality scan** | See section 9.3. 0 DENY hits |
| C-08 | **Creature name similarity report** | Aligned to [rcg] GC-13: Jaro-Winkler (prefix weight 0.1, max prefix 4, normalized) of every species, character, move, item and location name vs the Tier-A names. **≥ 0.88 fails; 0.80–0.88 needs a recorded judgment**; an exact match fails; Levenshtein ≤ 2 is also reported. Expected state after **D7**: Coronaleen, Emberfold and Lullstalk replace the three failing or flagged names. The review-round measurement (qa_lead.md M-01) left four warn-band names that need recorded judgments: Rollith (0.841 vs Growlithe), Marionyx (0.833 vs Marill), Lumarlin (0.824 vs Lucario), Samaraptor (0.809 vs Samurott). No result has been recorded for the renamed set; it is **Not run** until the script executes on content |
| C-09 | **Retired-name scan (D7)** | Player-facing strings (content JSON, UI string table, `index.html`, meta) contain none of: Voltra, Emberhorn, Umbraleen, Cinderscrim, Nodbell, Juniper, "Jun Aske", Rowan (as the default name). `tests/**` and `design/**` are excluded (report only) |
| C-10 | **LOD budget and silhouette parts (D16)** | Contract test: LOD0 ≤ 12k triangles (large stage 3 ≤ 16k); every part tagged as a silhouette feature in creatures.md §7.3 exists at LOD2. The draw-call count per creature is **recorded, not gated** (D16) |

### 9.2 Human review checklist (`V-*`)
The reviewer records the verdict per item in `design/reviews/character_consistency.md` as Pass, Conditional or Fail, with a screenshot link.

| ID | Inspect | Checklist |
|---|---|---|
| V-01 | Creatures and trainers at gameplay distance (third-person default camera, 8–15 m) | Identifiable by silhouette and dominant colors; face (eyes) readable at the Balanced profile; proportions consistent with the character language (head-to-body ratio within the documented range) |
| V-02 | Silhouette sheets at 20 px and 256 px | Each species recognizable at 20 px; no two species confusable; families read as related but distinct per stage; flagged C-02 pairs dispositioned |
| V-03 | NPCs and supporting cast in towns | Same style family as the protagonist; no generic grey capsule or unfinished NPC; emotional poses present in key dialogue |
| V-04 | Battle animations: every clip per species, plus move VFX | Anticipation and follow-through readable; hit reactions clearly show who was hit; faint is not graphic; capture sequence readable; timing unchanged across quality profiles (V-06) |
| V-05 | Evolution sequences | Evolution keeps the family motif; the anatomy change is visible; not a recolor |
| V-06 | Quality and distance robustness | Faces and silhouettes readable on the Mobile profile, at max LOD distance, and at night or in fog lighting |
| V-07 | Originality of anatomy, iconography and terminology | No recognizable imitation of a specific existing franchise character, a signature feature combination, capture-device iconography, or UI layout conventions; each concern is noted with the specific resemblance and a decision (keep or redesign), per the evidence-based standard of master prompt section 1 |
| V-08 | UI portraits, encyclopedia entries, loading screens, preview screenshots, title | Presentation is coherent across exploration, battle, menus and encyclopedia; portraits match the 3D model (same colors and features); preview screenshots and deployment assets contain only original, finished characters |

### 9.3 Name-originality denylist
File: [rcg] `scripts/gate/character/denylist.json` is the single denylist (GC-12, GC-13, GC-14); QA does not keep a second copy. The QA additions below are merged into it. Player-facing scope follows [cd] §9.1: **"dex", "gym", "badge", "fainted" and "super effective" are hard-fail in player-facing text**, while code identifiers are excluded. Status display names follow **D8** (Scorch/Blight/Jolt/Drowse/Rimebite/Muddled); the franchise abbreviations PSN, PAR, SLP, BRN and FRZ in player-facing text are **DENY**. Original QA file: `qa/denylist/terms.json`, with two tiers. The scan covers all `data/**/*.json` string values, the UI string table, `index.html`, the `manifest` and meta tags, and string literals in `src/**/*.{ts,tsx}` (AST-based, comments excluded). Matching is case-insensitive, with diacritics folded (é→e) and whole-word or token-boundary rules as marked.

**DENY (a hit fails the gate):**
- *Franchise and brand names:* Pokémon/Pokemon, Poké/Poke (as a prefix token), Pokédex/Pokedex, Poké Ball/Pokeball, Digimon, Digivolve, Yo-kai, Temtem, Palworld, Pal Sphere, Monster Rancher, Coromon, Nexomon, Cassette Beasts, Monster Sanctuary, Dragon Quest Monsters, Game Freak, Nintendo, Creatures Inc.
- *Signature item and system terms:* Master Ball, Ultra Ball, Great Ball, Safari Ball, Rare Candy, Pokeflute, Poké Flute, HM (whole word), TM (whole word), Technical Machine, Hidden Machine, Elite Four, Gym Leader, Gym (whole word, in UI and data), Dex (whole word), Pokémon Center, Poké Mart, PokéMart, Pokégear, PC Box (the phrase), Hall of Fame (in UI, as a phrase), Gotta catch.
- *Well-known character and place names:* Pikachu, Charmander, Charizard, Squirtle, Bulbasaur, Eevee, Mewtwo, Mew (whole word), Jigglypuff, Lucario, Greninja, Snorlax, Gengar, Agumon, Gabumon, Ash Ketchum, Professor Oak, Team Rocket, Nurse Joy, Officer Jenny, Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar, Paldea. The full franchise species-name list is maintained in `qa/denylist/franchise_names.txt`, compiled by the QA Lead from public knowledge. It is **not exhaustive**, and the report says so.

**REVIEW (a hit must be dispositioned; it is generic genre language that becomes a problem in imitative combinations):**
- "Wild … appeared" and "used … !" message templates, Trainer (generic in code; the player-facing term is "Tuner"), League, Champion (the anchor uses the `champion` id: allowed, but the in-game title presentation is reviewed), Potion, Revive, Evolve/Evolution (generic, allowed), Shiny, Legendary, Starter, "Box", "Center".
- Any name flagged by C-08 in the 0.80–0.88 Jaro-Winkler band. The starters are now Fizzkit, Wickwool and Rippleback (D7); the retired names are covered by C-09.

The report is `char/denylist_report.json`, with term, tier, file, JSON path or line, and snippet. The scan is not legal clearance, and the report header says so.

---

## 10. Bug severity, evidence, regression policy

### 10.1 Severity definitions (mapped to the master-prompt priority order)
| Sev | Definition | Examples | Gate impact |
|---|---|---|---|
| **S1 — Critical** | Save corruption or loss; a progression softlock with no in-game recovery; a crash or white screen on a main path; a game that cannot start; a deployment containing non-original or unlicensed character or UI assets; a recognizable imitation found in a shipped character | A malformed save overwrites the backup; a mandatory gate with no obtainable field-action creature; stuck in geometry with no escape on the golden path; a capture duplicates a creature | Blocks every gate. Fix before any further feature work in the area |
| **S2 — Major** | A core system wrong or unusable without a workaround; a character-direction check failure; mandatory balance requiring grinding (SIM-03); controls unusable on one supported input; an accessibility blocker (a menu not keyboard-operable); a measured performance result under the 30 FPS floor on a reference phone | Wrong type multiplier; mobile joystick drift making the game unplayable; a placeholder creature in build; a stacked encounter trigger | Blocks the gate (waiver allowed only before P5, in writing) |
| **S3 — Moderate** | A feature is wrong but has a workaround or limited impact; a visual defect that does not hurt readability; a perf miss on RC-L under 60 FPS but above 45 FPS | A minor text overflow; the follower clips through a fence; a wrong shop sort | Tracked; triaged at each gate; ≤ 15 open S3 at P7 with owners |
| **S4 — Minor** | Cosmetic polish, typos, and suggestions | A particle pops for 1 frame | Not gate-affecting |

Escalation rule: any issue affecting save integrity is at least S2, even when its reproduction rate is low.

### 10.2 Evidence required in a bug report
The title uses the form `[Sev][Area] summary`. The report includes the build SHA; the environment (container Chromium or a named reference device, and the profile); the **seed** and fixture (`?seed=&save=`); numbered reproduction steps; expected vs actual; and reproduction frequency (x/y attempts). It attaches the `__qa.events` dump (or the event log for sim bugs), a screenshot or video, the console log, and, for save bugs, the raw `localStorage` blobs (primary, backup, corrupt copy). A report of a performance bug must name the reference device or state "Non-representative (container)". A bug report without reproduction steps or evidence is marked `needs-info` and is not counted as fixed or verified.

### 10.3 Regression policy
1. Every S1 and S2 fix lands with an automated regression test (unit, data, sim or Playwright) that fails on the parent commit and passes on the fix. When automation is impossible (feel or visual), the fix adds a manual checklist item with an id.
2. `test:unit` and `test:data` run on every commit to main; a red main blocks merges.
3. At each phase gate, the whole suite (all phases so far) is re-run, not only the new phase's tests.
4. Deterministic-snapshot changes (DS-* event logs, golden values) require a reviewer note naming the systems.md change that justifies them.
5. A flaky test (fails ≥ 1 in 20 runs on the same SHA) is quarantined within 1 day, with an S3 bug. A quarantined test does not count as a Pass at a gate; it counts as **Not run**.
6. Verified-fixed means reproduced on the old build and not reproduced on the new build using the same seed and fixture.

---

## 11. New-game-to-champion manual route and edge cases

### 11.1 Manual route checklist (`M-01`…`M-30`)
The tester records, per step, Pass or Fail, the elapsed real time (for M-50), the party levels, the money, and notes. The route is the **D1** 12-chapter critical path ([cd] §4). The chapter and the flags each step must set are the oracle. Run the whole route 3 times across testers, once per starter (c01 Fizzkit, c04 Wickwool, c07 Rippleback).

| ID | Ch / zone | Step | Verify (oracle) |
|---|---|---|---|
| M-01 | — | Title → New Game → settings reachable | Audio starts only after the first input; settings persist; the default name is **Arden** (D7) |
| M-02 | 1 town_1 | Intro and movement in Larkhollow | Slopes and steps; camera collision in narrow streets; keyboard and touch glyphs shown correctly |
| M-03 | 1 town_1 | Starter choice | Fizzkit, Wickwool and Rippleback have distinct model, cry and idle; confirm-before-commit; `flag_starter_chosen` |
| M-04 | 1 town_1 | **Rival 1** | The rival takes the starter strong against yours (**D4**). **Losing continues the story with the party healed (D20)**; test both win and loss across runs; `flag_rival_1_done` |
| M-05 | 1 town_1 | Resonance tutorial on a triad node | The starter resonates (Spark, Kindle or Swell); `flag_resonance_tutorial`; Rootcall and the triad registers show "Tuned" in the Ledger (D2) |
| M-06 | 1 route_1 | Capture tutorial (guaranteed f04 stage 1), roaming creatures, first wild battle | Contact → exactly one battle; the Reed Chime **rings** (D9); `flag_capture_tutorial`; ≤ 6 roaming (D21); attunement pill "Lumen ×1.1" in route_1 battles (D1/D3) |
| M-07 | 1–2 | Hearthrest and Chandlery; Tuning Ledger journal and map | Heal; buy and sell; cannot overspend; an objective is always shown |
| M-08 | 2 forest | **Rootgate (mandatory Rootcall)** | Performed by any verdant troupe member, even a fainted one (D2). With no verdant kin, the Steward prompt appears and works; `flag_forest_rootgate_open` |
| M-09 | 2 forest | Stillmark first sighting (2 grunts) | Stillmark per **D6** (survey-guild engineers, coil-rigs, no hoods); `flag_stillmark_first_seen` |
| M-10 | 2 forest | **trial_1** Rootloft Hall, Cantor Wren (verdant) | Hall gimmick; Cantor battle; `i_keynote_1` → **Heave** unlocked; `flag_trial_1_cleared`; waystone fast travel |
| M-11 | 3 route_2 | **Rival 2**; optional Heave boulder | Rival team grows (+gale); a loss → wipe rule and re-armed (D20); `flag_rival_2_done` |
| M-12 | 3 town_2 | **trial_2** Knell Hall, Cantor Dorran (stone) | `i_keynote_2` → **Seep**; `flag_trial_2_cleared` |
| M-13 | 4 cave | **Heave gate (mandatory)** into the lower galleries (single-level cave, D17); Warden Brann 1 | Steward fallback present; `flag_cave_heave_gate`, `flag_admin_brann_1`, `flag_cave_miners_saved`; attunement electric in the cave |
| M-14 | 5 route_3 | Warden Vey 1; restore the fen stone; **Rival 3** | `flag_admin_vey_1`, `flag_fen_stone_restored`, `flag_rival_3_done`; route_3 shows "Silenced" before restoration and toxin ×1.1 after it |
| M-15 | 6 lake | **trial_3** Mere Hall, Cantor Nerys (water) | `i_keynote_3` → **Gust**; `flag_trial_3_cleared` |
| M-16 | 7 town_3 | **trial_4** Vane Hall, Cantor Tamsin (gale); meet **Marra Aske** (D7) | `i_keynote_4` → **Veil**; `flag_trial_4_cleared`, `flag_odile_named` |
| M-17 | 8 route_4 | **Gust ascent (mandatory)** | Steward fallback; `flag_route4_updraft` |
| M-18 | 8 route_4 | Stillhouse; Warden Vey 2 | `flag_stillhouse_found`, `flag_admin_vey_2` |
| M-19 | 8 route_4 | **Leftover starter rescued (D5)** | `flag_leftover_rescued`; `q_foster_leftover` opens; Oriel gives it at stage 1 **Lv 25** ("Not yet" leaves it claimable) |
| M-20 | 8 route_4 | **Rival 4** | `flag_rival_4_done` |
| M-21 | 9 volcano | **trial_5** Forge Hall, Cantor Bastian (fire) | Vent: Swell **or** talk to the steward; `i_keynote_5` → **Rime**; `flag_trial_5_cleared` |
| M-22 | 9→1 | `q_second_clutch` | Opens at `flag_trial_5_cleared` ∧ `flag_leftover_obtained`; the rival's line at stage 1 **Lv 30** (D5); `flag_triad_complete`; the encyclopedia page flourish |
| M-23 | 10 route_5 | **Rival 5**; Odile revealed | `flag_rival_5_done`, `flag_odile_revealed`; route_5 attunement Silenced until ch11 |
| M-24 | 11 snowpeak | **Rime falls (mandatory)** | Steward fallback; `flag_snowpeak_ascended` |
| M-25 | 11 snowpeak | **trial_6** Rime Hall, Cantor Isaure (frost) | Lever alternative for Kindle; `i_keynote_6` → **Gleam**; `flag_trial_6_cleared` |
| M-26 | 11 snowpeak | Brann steps aside; **Odile two-phase battle (D22)** | Phase A "Attunement: Silenced"; after her 3rd faint, the cutscene plays and phase B restores frost ×1.1 and sends her ace; `flag_odile_defeated`, `flag_nullbell_broken`. A loss follows the wipe rule |
| M-27 | 12 league | Place six Keynotes; **Rival 6** | `flag_spire_open`, `flag_rival_6_done` (6 rival battles in total, D4) |
| M-28 | 12 league | **The Concordant (Rhea)** → Great Chord ending → credits | `flag_champion_defeated`, `flag_game_cleared`; Continue after the credits loads a valid post-game state |
| M-29 | throughout | Evolutions of the starter at Lv 16 and 34 (D11); a cancel then "Ready to evolve" from the party menu; Etude use and move replacement | Sequence; moves learned; encyclopedia |
| M-30 | throughout | Fast travel; status chips (D8 names and codes); encyclopedia completion reachable for all 30 | Only registered waystones are listed; SCH/BLT/JLT/DRW/RMB shown with shapes |
| M-40 | throughout | Throughout: character and presentation consistency | Note anything off-model (feeds V-*) |
| M-43 | throughout | Throughout: originality notes | Any recognizable-imitation concern is logged |
| M-44 | throughout | Rendering doc vs build: approximations honestly described | Note mismatches |
| M-45 | throughout | Reduced motion + grayscale (OS colorblind filter) walkthrough of the battle and menus | All information is distinguishable |
| M-46 | throughout | Audio listening pass | Distinct zone themes, battle layers, per-species cries, footsteps per surface; volume sliders work |
| M-50 | throughout | Timed playtest | Wall-clock time per chapter, logged by the tester; reported as "estimate from n testers", never as a validated figure until n ≥ 3 first-time players |

### 11.2 Edge cases (`M-60`…`M-72`, each with an automated counterpart where one exists)
| ID | Edge case | Procedure | Expected | Automated counterpart |
|---|---|---|---|---|
| M-60 | Party wipe (wild) | Lose a wild battle with the whole party | **D20**: warp to the last healing point visited; party healed; penalty `min(floor(money/4), 100 + 150 × keynotes)`; no flags lost | U-PTY-10, SIM-05 |
| M-61 | Story-battle loss (trial, admin, rival 2–6, Odile, champion) | Lose each kind once | **D20**: the wipe rule applies and the event is re-armed; retry possible; no flag set on the loss. Rival 1 is the exception (M-04) | SIM-05 |
| M-62 | Full storage | `fx_save_full_storage` → try a capture; receive a gift | **D18**: the confirmation appears; No = no Chime spent; Yes + success = mandatory release prompt (bond starter protected); a gift is held pending and collectable after freeing a slot | U-CAP-11, U-PTY-05/06 |
| M-63 | Reload during battle | Reload at a random point mid-turn | **D19**: pre-battle committed checkpoint (no resume); nothing duplicated; roaming creatures are re-rolled (not saved) | B-18 |
| M-64 | Reload during evolution | Reload during the animation | **D19**: pre-battle checkpoint, so the evolution is re-queued after the battle is replayed. For a party-menu or prism evolution, the pre-evolution state holds and the creature still shows "Ready to evolve". Never a half-evolved species or a lost creature | U-SM-06 |
| M-65 | Reload during capture rings (D9) | Reload between rings | Pre-battle checkpoint (**D19**): no Chime consumed and no creature added | U-CAP-12 |
| M-66 | Reload during purchase | Reload right after confirming a purchase | Money and items are consistent | U-INV-09 |
| M-67 | Reload during a zone transition | Reload mid-fade | Valid zone and spawn | B-31 |
| M-68 | Hidden tab in exploration, in battle and during a transition | Switch tabs for 30 s in each state | Paused; no encounters; no time-of-day jump beyond the policy; the audio suspends and resumes | B-32 |
| M-69 | Storage unavailable | Private mode (Safari private, Firefox with storage disabled) | Playable; a clear notice; export works | U-SAV-14 |
| M-70 | Quota exceeded | Fill `localStorage` to near the quota with dummy keys, then save | Error surfaced; old save intact; export offered | U-SAV-13, B-15 |
| M-71 | Two tabs open on the same save | Save in tab A, then save in tab B | QA proposal (Q-D): the stale tab detects the change via the `storage` event, warns, and blocks writes; no corruption | Pending Q-D |
| M-72 | Window resize or orientation change mid-battle on mobile | Rotate the device | The UI re-lays out; no lost input state | B-26 variant |

---

## 12. Acceptance criteria, dependencies, risks, unresolved questions

### 12.1 Acceptance criteria for this QA plan
- Every requirement in master prompt sections 1, 3, 4, 5, 6 and 7, plus the anchor-derived requirements, has ≥ 1 test id, a type, a blocking phase and the evidence required (section 1). **Met in this document.**
- Every phase P1–P7 has a gate checklist with objective pass criteria (section 2).
- The suites described are implementable with the fixed stack (vitest, zod, Playwright with the preinstalled Chromium, `@axe-core/playwright` from npm) and without network assets.
- The campaign simulation is clearly separated from human playtesting (section 7.1).
- The performance claim rules forbid container-derived FPS claims (section 8).
- A failed character-direction check blocks the phase (G-CHAR, section 9).
- (v2) Every test that `design/reviews/qa_lead.md` marked blocked has an oracle in §0.6 tied to a DECISIONS.md entry, and no test id is left without an expected value except U-INV-04 (stack cap, pending [sys]; placeholder 99).
- (v2) Implemented tests are listed in §1.8 with status "implemented" only. Results are reported by the orchestrator.
- Implementation acceptance: at each gate, `qa/evidence/phase_N/summary.md` exists with every item's status and evidence link. This plan is considered implemented for a phase when the tests listed for that phase exist in the repo and run under `npm run qa:gate -- --phase N`.

### 12.2 Dependencies
| On | Needed for |
|---|---|
| `DECISIONS.md` | D1–D28 oracles (§0.6); binding over every other doc |
| `systems.md` (v2 per D3/D11/D12/D18/D20/D23) | All **[sys]** golden values: damage formula, roll range, STAB, crit table, stage table, status durations, weather rules, capture formula and tiers, XP curve, stack and money caps, sell ratio, party-wipe penalty, expected party level per mandatory battle, AI difficulty definitions |
| `world.md` v2 (re-laid to D1/D2/D17/D21) | Zone graph and coordinates, Steward and node placement, encounter tables, grace period, wild-battle budget per zone (SIM-03) |
| `creative_direction.md` | Resonance final rules (U-RES, D-35), dialogue line budget, trainer and NPC clip sets, proportion ranges for V-01, story order for M-13…M-29 |
| `creatures.md` | Per-species part lists (C-06 thresholds), clip specs, names for C-08 |
| `rendering_and_architecture.md` | Budgets, quality profile keys (D-45, B-40), autosave points and committed-state policy (U-SAV-19/20), battle-resume-after-reload policy, the `window.__qa` and debug flag implementation, the QA render pages (`?tool=`, `/gate.html`) |
| `release_character_gate.md` | Gate verdict format; how the C-* and V-* results feed the Pass, Conditional or Fail verdict |
| Engineering | The debug hooks in section 0.3; the injectable storage adapter; `rollOverride` in the sim; deterministic `fastText` |
| Orchestrator | Physical access to RC-L, RC-P1 and RC-P2 (designated in [rnd] §7.1; D26); reporting test results for implemented files |

### 12.3 Risks
| Risk | Impact | Mitigation |
|---|---|---|
| WebGL in container Chromium (SwiftShader) is slow or flaky, which makes the B-* tests time out | False red gates | Waits keyed on state, not time; a 90 s timeout per smoke test; the low-res quality profile is forced in e2e (`?profile=mobile`) except in B-40; 2 retries allowed for e2e only, with the retries reported |
| No reference devices are available | Performance targets cannot be claimed | The status stays "Not measured"; the release notes state it; P7 gate 7.3 prevents false claims |
| Determinism breaks through `Math.random` or `Date.now` leaking into the sim | Unreproducible bugs; flaky snapshots | D-42 lint also bans `Math.random` and `Date.now` in `src/sim/**`; U-RNG-04 |
| The campaign sim is too optimistic (a simple party or policy is still stronger than a novice) or too pessimistic | Wrong balance conclusions | The handicapped levels (−2) and the naive policy; the sim is labeled as non-playtest; human route playtests (M-50) are required at P5 and P7 |
| Silhouette IoU is a crude proxy for readability | Missed or false flags | A flag is for review only (except for intra-family near-duplicates); human V-02 is required |
| The denylist is incomplete | An imitation is missed | Two tiers plus human V-07 review; the report is explicitly non-exhaustive; not legal clearance |
| Save-schema churn during P3–P5 | Migration debt | A migration test for every version bump; fixtures are kept forever |
| A single developer means QA automation competes with feature time | Gates slip | Priority order: save and softlock tests first (S1 classes), then battle math, then smoke, then visual |
| Hidden-tab simulation in headless Chromium does not fire the real lifecycle | B-32 false pass | Use a combination of the CDP lifecycle state and a manual M-68 check on real browsers |

### 12.4 Unresolved questions
**Resolved since v1** (source in brackets):
- Reference devices: RC-L, RC-P1 and RC-P2 are designated ([rnd] §7.1). They remain **Not measured** until physical runs (D26).
- Save during battle: never; a reload returns to the pre-battle checkpoint (D19).
- Full storage: throw after confirmation, then a mandatory release prompt (D18). The v1 QA default (pre-block) is withdrawn.
- Sim thresholds: consistent with [sys] §14.2 (kept).
- Evolution cancel: exists, with "Ready to evolve" in the party menu ([sys] §8.3).
- UI terms: Concord Spire, the Concordant, Keynote, Tuner, Chime, Etude ([cd] §3). "Badge", "gym", "dex", "fainted" and "super effective" are hard-fail in player-facing text.
- Debug flags: `VITE_QA=1` only (D28), and the flag names follow [rnd].
- Blocked oracles: every former blocker has one (§0.6).

**Still open:**
- **Q-A (new, D10 vs content):** D10 says the repel and escape items are `i_hush_1..2` and `i_thread`, but `src/data/content/items.json` (which D10 also names as the source of truth) contains `i_repel_1..2` and `i_escape`, plus `i_key_ledger`. D-02 needs one answer. QA asks the orchestrator which spelling is canonical. Until then D-02 uses the items.json ids, so as not to fail on content that D10 declares canonical.
- **Q-B (new, D3 vs implementation):** `src/sim/battle/engine.ts` still applies ×6/5 at step 2, and `tests/unit/battle-math.test.ts` asserts Arc Lash = 50. The D3 oracle is 48. QA asks that the engine and the assertion be updated together (§1.8). A green run of the current file is not evidence for D3.
- **Q-C:** Item stack cap (U-INV-04): pending [sys]; placeholder 99.
- **Q-D:** Multi-tab policy (M-71): lock, warn, or last-write-wins? QA proposes a `storage`-event listener; a stale tab shows "Save changed elsewhere, reload" and blocks writes.
- **Q-E:** Wild-battle budget per zone for SIM-03: pending [sys]/[world] v2; placeholder 6 per route or area, labelled as an assumption.
- **Q-F:** Trainer and NPC clip ids: [cd] §5.5 lists human equivalents but gives no ids, which C-03 and GC-05 need.
