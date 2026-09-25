# Master build prompt (verbatim copy of the commissioning brief, for agent reference)

Original browser-based 3D creature RPG. The orchestrator is the lead, game director, integration owner and deployment authority.

## 1. Product vision and non-negotiables

- Cohesive, stylized world with memorable creatures, expressive animation, responsive controls, readable combat, distinctive visual identity.
- Characters, creatures, trainers, NPCs and supporting cast must look and feel like characters from a polished creature-collecting RPG (in the broad genre sense of the Pokémon series): expressive, approachable, colorful, silhouette-driven, animation-forward. This is a high-level character-language requirement, NOT permission to copy Pokémon designs, names, terminology, silhouettes, interface conventions, music or any recognizable protected element.
- Target an 8–10 hour first-time main-story playthrough without artificial grinding. Provide a content and pacing budget; label playtime as an estimate until validated through playtesting.
- Final scope: 30 creatures across 10 three-stage evolution lines; 10 types; at least 80 mechanically meaningful moves; six major challenge venues; three towns; five routes; forest, cave, lake, volcano and snow-peak environments; rival, antagonist faction and champion storylines.
- "Gyms", "dex", "TMs", "capture orbs" are functional descriptions only. Develop original names, presentation, iconography and lore.
- All characters, creature designs, names, dialogue, UI artwork, compositions and creature cries must be original. No imitation of another franchise's recognizable silhouettes, signature features, terminology, interface, melodies or overall presentation.
- Originality reviews distinguish broad genre conventions from recognizable imitation. Shared generic traits alone do not establish copying; combinations that create a recognizable imitation require redesign. Keep reviews evidence-based; do not claim exhaustive worldwide originality or legal clearance.
- Third-party CC0 assets may support environments/props/materials/lighting only. Creatures, principal characters, UI identity and audio are custom. Verify each asset's actual license.
- Optimization priority: functional gameplay and save integrity > controls and readability > coherent art and character direction > stable performance > optional expensive effects.

## 2. Design pipeline (roles and documents)

A. Creative Director — design/creative_direction.md: title, region, tone, setting, visual themes, protagonist motivation, rival, antagonist faction, supporting cast, final showdown. Chapter-by-chapter story with objectives, prerequisite flags, dialogue beats, estimated playtime. Character language (proportions, faces, silhouettes, color grouping, emotional poses, animation principles) and how it stays original. ONE signature mechanic connecting world, exploration and combat, feasible, integrated in tutorial and progression. Original UI language, typography, iconography, audio style guide with zone themes and battle layers.

B. Creature Art Director — design/creatures.md: exactly 30 creatures in 10 three-stage lines. Starters: Voltra (Electric gliding lizard), Emberhorn (Fire ram calf with glowing horns), Rippleback (Water otter with shell-plated tail). Names are working names subject to conflict review. Per creature: stable ID, name, family & stage, type(s), body scale, habitat, personality, distinctive anatomy, 2–3 dominant colors, material treatment, facial features, idle/locomotion/attack/hit/capture/faint animations. Silhouette sheet or reproducible silhouette preview at 20 px and normal size. Evolution anatomy/behavior changes preserving family identity. Model and animation production method using tools actually available. Originality audit. All 30 need distinct finished 3D representations; recoloring one base mesh does not satisfy the roster.

C. Systems Designer — design/systems.md: complete 10×10 type matrix incl. Electric/Fire/Water with dual-type rules; stats, damage, accuracy, crits, same-type bonus, priority, speed ties, status timing, weather, catch probability, XP, evolution, rewards, prices, difficulty. ≥80 moves with stable IDs, type, category, power, accuracy, charges, priority, targeting, effects, animation refs. Passive traits, status effects, learnsets, items, four capture-device tiers, move-teaching discs. Worked battle and capture examples, balance assumptions, AI at three difficulties (no reading the player's queued action), progression curves across six challenges, anti-softlock recovery, non-grindy economy.

D. World Designer — design/world.md: connected region map with three towns, five routes, forest, cave, lake, volcano, snow peak (clarify which biomes are routes vs separate areas). Place six challenge venues, story events, healing, shops, secrets, fast travel. Traversal connections, gates/unlocks, spawn and safe-return points, landmarks, NPCs, quests, rewards. Encounter tables by zone/time/weather with normalized probabilities and level ranges. Every creature obtainable in a single-player save (capture, evolution or documented reward) including an in-game route to the two unchosen starters. No multiplayer/external service/real-time wait blocks completion.

E. Rendering Engineer — design/rendering_and_architecture.md: architecture and asset pipeline; scene organization, terrain, collision, streaming, animation, lighting, particles, cameras, UI/audio integration, quality settings. Budgets (draw calls, triangles, texture memory, simulation, active creatures, particles, loading payloads, DPR). Reference configurations before performance claims. Desktop/mobile profiles and fallback for every expensive effect. Technical requirements for preserving faces, silhouettes, animation timing across quality settings/distances/lighting.

F. QA Lead — design/qa_plan.md: requirements-to-test matrix, phase gates (battle math, capture, progression, quest deps, save migration/recovery, softlocks, controls, accessibility, performance, character consistency, originality, full-story completion). Fixtures, benchmark scenes, bug severity, evidence. New-game-to-champion route; edge cases (party wipes, full storage, interrupted transitions, reloads, hidden tabs). Character-direction tests; a failed character-direction check blocks the phase.

G. Release and Character Consistency Agent — design/release_character_gate.md: cross-project enforcement of character direction; checklist (expressive readable designs; silhouettes at gameplay distance and thumbnail; consistent proportions/faces/colors/animation; coherent presentation across exploration/battle/menus/encyclopedia/loading/previews; original names/anatomy/iconography/terminology; no recognizable imitation; no placeholder characters in release; no violating deployment assets). Pass / conditional pass / fail per phase; fail blocks deployment. Evidence in design/reviews/character_consistency.md.

Every design document: concrete decisions, implementation-ready specs, acceptance criteria, dependencies, risks, unresolved questions. No vague aspirational lists.

## 3. Technical architecture (fixed)

Vite, React, TypeScript, React Three Fiber, drei, Rapier, React Three Postprocessing, Zustand, Tone.js. Validated JSON content (creatures, moves, types, items, encounters, zones, quests, dialogue, trainers, progression) with stable IDs and reference validation. Deterministic pure battle simulation with seeded RNG, separated from rendering/audio/UI/persistence. Explicit state machines (exploration, dialogue, battle transitions, turn resolution, capture, evolution, results). Rapier for overworld only. Species definitions immutable vs individual instances with unique IDs. Versioned localStorage saves with migration, backup slot, malformed/quota handling, export/import, new-game confirmation; save only committed state.

## 4. Art direction

Stylized realism; expressive faces; readable silhouettes. High / Balanced / Mobile quality profiles. PBR, HDR-ish lighting, ACES, soft shadows, terrain variation, instanced vegetation with wind, water with animated normals, restrained bloom, fog, day/night, rain/snow/fog tied to encounter rules. Document approximations honestly.

Network note (orchestrator's inspection): polyhaven.com and kenney.nl are blocked by the environment's egress policy, so third-party CC0 downloads are not available. All environment assets must be original procedural substitutes created in code. npm registry is reachable.

## 5. Player experience

Third-person trainer, camera collision, slopes/steps, following lead creature, visibly roaming wild creatures that start encounters by contact (no repeated/stacked triggers). WASD + mouse; mobile joystick + camera drag + contextual buttons. Battle staged in the current environment. Fight/Bag/Switch/Run; speed/priority, accuracy, crits, types, traits, statuses, weather, forced switches, fainting. Four capture tiers, party of six, storage, encyclopedia with interactive 3D viewer, XP, evolution, learnsets, move replacement, teaching discs. Trainers, six challenges, recurring rival, antagonist quest line, champion, healing centers, shops, items, fast travel, quest tracking, completion state. Title, continue, settings, HUD, dialogue, battle UI, menus, inventory, party, storage, map, journal. Accessibility: readable text, keyboard menus, reduced motion, camera sensitivity, info not by color alone. Original adaptive music (Tone.js synthesis), synthesized cries, move sounds, ambience, footsteps; audio after user gesture; master/music/sfx volumes and mute.

## 6. Phases

1 Movement & visual foundation; 2 First inhabited area; 3 Core gameplay slice; 4 Early campaign (first two challenges); 5 Complete campaign; 6 Atmosphere & polish; 7 Release validation. Each phase gated by QA + character-direction gate.

## 7. Evidence

60 FPS target on designated mid-range laptop, 30 FPS floor on modern phones — only claim what is measured on defined configs. Never invent test results, screenshots, benchmarks or playtime. Mark unavailable checks "Not measured"/"Not run".
