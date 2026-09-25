# Status

**Wildchord: Songs of Cantarra** is feature-complete through all seven planned phases. Every item below is marked with the evidence it rests on. "Not measured" and "Not run" mean exactly that. See `KNOWN_ISSUES.md` for open problems.

## Phase summary

| Phase | Scope | State | Evidence |
|---|---|---|---|
| 0 Design | Multi-agent design docs, reviews, bible, decisions (D1–D31), manifest, build plan | Done | `design/` including `reviews/`, `DECISIONS.md`, `GAME_BIBLE.md` |
| 1 Movement & visuals | Terrain, controller (Rapier), third-person camera, follower, props, touch controls | Done | Scripted traversal (`scripts/move-test.mjs`), screenshots |
| 2 First inhabited area | Larkhollow and Thistledown Way, NPCs, dialogue, Hearthrest, Chandlery | Done | Smoke play-through, `world-content.test.ts` |
| 3 Core gameplay slice | Battle engine and UI, capture, party/storage, XP, Crescendo, menus, saves | Done | `battle-math`, `game`, `persistence` suites; smoke play-through (starter → rival battle → save/continue) |
| 4–5 Campaign | 21 zones, 71 trainers (37 mandatory), 6 Cadence Halls, rival ×6, admins, Odile, Champion, quests, 273 dialogues / 735 lines | Done | `campaign-graph.test.ts` (every zone reachable, 6 Keynotes, 21 story flags in order, every mandatory trainer beatable); `world-content.test.ts` |
| 6 Atmosphere & polish | Realistic environment (HDRI lighting, PBR terrain, grass, trees, water, AO/bloom), day/night, weather, particles, adaptive music/SFX/cries, rebuilt humans (MakeHuman CC0), upgraded creatures | Done | Before/after screenshots under `design/reviews/environment_realism.md`, `human_characters.md`, `creature_art_qa.md` |
| 7 Release validation | Tests, balance simulation, smoke run, docs, deploy | Done, with gaps listed below | This file |

## Content

- 30 species in 10 three-stage lines across 10 types. Flagships: **Fizzkit** (electric mascot) and **Smoulderam** (fire/gale dragon), per D31.
- 101 moves, 52 items, 4 Chime tiers, 18 Etudes, 6 Keynotes.
- 21 zones: 3 towns, 5 routes, forest, cave, lake, volcano, snow peak, 6 Cadence Hall interiors, the Stillhouse and the League spire.
- The player and 31 NPC looks are built on the CC0 MakeHuman body, with original clothing, hair and animation.

## Test evidence (last run on this branch)

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` (10 suites, 98 tests: battle maths against spec vectors, persistence and migration, content validation, world cross-references, campaign reachability, balance sim, creatures, audio no-op, day/night) | Pass |
| Balance simulation: 48 required starter × story-battle pairs | All meet their targets (simulation, not playtest). Tables in `design/reviews/balance_sim.md` §7 |
| Scripted smoke play-through (`scripts/play-smoke.mjs`, QA build, headless Chromium with SwiftShader) | **11/11 pass** (see "Smoke run" below) |
| Frame rate on real hardware | **Not measured** |
| Audio listening test | **Not run** |
| Human playtest | **Not run** |

## Smoke run

Final run on 2026-09-25: QA production build (`VITE_QA=1 vite build`), served with `vite preview`, driven by `scripts/play-smoke.mjs` in headless Chromium with SwiftShader software GL. **11/11 checks passed**:

1. New game reaches the intro dialogue.
2. The intro closes into exploration.
3. The player walks.
4. The starter screen opens.
5. The starter joins the party.
6. The rival battle starts.
7. The battle ends and returns to exploration.
8. The rival flags are set (`flag_rival_1_done`).
9. The menu opens.
10. Continue is offered after a reload.
11. Continue loads the game.

An earlier run failed checks 7–9 only because the battle hadn't finished within the script's fixed turn budget. Software GL renders the stage at about 1 FPS, and battle cue timers advance per frame. The script now waits up to 20 minutes, after which the same flow passes. This is a flow check, not a performance measurement.

## Deploy

The game is built into the root Next.js app's `public/play` during `prebuild` and served at `/play` on the Vercel project `claude`. Every push to the PR branch produces a preview. Previews are protected by Vercel Authentication.
