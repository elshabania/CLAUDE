# BUILD PLAN

Owner: orchestrator. Dependencies, task ownership, phases and acceptance gates. Gates are defined in qa_plan.md v2 §2 and release_character_gate.md v2; this plan sequences the work. Status is tracked in STATUS.md.

## Workstreams and ownership
| Workstream | Owner | Files | Depends on |
|---|---|---|---|
| Sim (battle, progression, encounters, quests) | orchestrator | `src/sim/**` | systems.md v2 |
| Content data (species, moves, items, traits, families) | orchestrator (scripts) | `src/data/content/*.json`, `scripts/*.py` | creatures/systems v2 |
| Zone data (14 zones + interiors) | zone-author agents (one zone set each) | `src/data/zones/<zone>.json` | world.md v2, zoneTypes.ts |
| Trainers, quests, dialogue, shops, encounters | content agents | `src/data/content/{trainers,quests,dialogue,encounters,shops}.json` | world/systems/CD v2 |
| Species builders (30) | 5 builder agents | `src/creatures/species/cXX.ts` | creatures.md v2, BUILDER_BRIEF |
| Creature framework, humans | orchestrator | `src/creatures/*.ts` | rendering v2 |
| World rendering (terrain, props, water, sky, weather) | orchestrator | `src/world/**` | rendering v2 |
| UI (HUD, dialogue, battle UI, menus, Kinsong, map, journal, settings, title) | orchestrator + UI agent | `src/ui/**` | CD §7 |
| Audio (Tone.js music, cries, SFX) | audio agent | `src/audio/**` | CD §8 |
| Persistence | orchestrator | `src/persistence/**` | rendering §10 |
| Tests & gates | orchestrator + QA scripts | `tests/**`, `scripts/gate-*.mjs` | qa_plan v2 |
| Deploy | orchestrator | `vercel`/static build | D28 |

Shared contracts (types, stores, zone schema, event unions) are owned by the orchestrator; agents never edit files outside their assignment.

## Phase sequence and gates
1. **Movement & visual foundation** — terrain, lighting, trainer, collision, camera, desktop+touch movement, quality profiles, perf overlay, character presentation (face/rim/anim). Gate: traverse a representative zone without clipping/falling/losing control (scripted traversal + screenshots); trainer & a kin pass the character checklist items applicable at phase 1.
2. **First inhabited area** — Larkhollow + Thistledown Way data, NPCs, dialogue, interaction prompts, Hearthrest heal, Chandlery shop. Gate: complete a short objective using functional interactions; NPC/UI character review.
3. **Core slice** — starter selection, follower, roaming wild kin and contact encounters, full battle loop + presenter, capture, party/Fosterage, save/reload. Gate: new game → battle → capture → manage party → reload (Playwright smoke); starter presentation review.
4. **Early campaign** — XP/evolution UI, trainers, quests, economy, trial_1 and trial_2, complete save/load and recovery paths. Gate: both trials from a fresh save (campaign sim + scripted), checkpoint resume.
5. **Complete campaign** — all zones, 30 kin obtainable, 101 moves, rivals, Stillmark arc, champion. Gate: campaign sim completes every mandatory battle; obtainability validator; all character assets registered and reviewed.
6. **Atmosphere & polish** — day/night, weather tied to encounters, adaptive music, cries, VFX, camera transitions, accessibility. Gate: documented systems react to time/weather; audio/visual sync; accessibility settings work.
7. **Release validation** — mobile tuning, bundle budgets, cross-browser (Chromium only available here; others Not run), persistence recovery, balance review, full regression, originality review, deploy. Gate: all release checks recorded; release agent approval; no placeholders.

## Known constraints (recorded, not hidden)
- Only software-rendered headless Chromium is available: no FPS claims; reference devices Not measured.
- No human playtest is possible in this environment: playtime and fun remain estimates; automated campaign simulation is labelled as mechanical completability only.
- No external assets: every model/texture/sound is procedural and original.
