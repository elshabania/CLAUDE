# Orchestrator anchors (binding for all design agents)

These decisions are fixed by the orchestrator so that seven documents written in parallel agree. Agents may propose changes in their "Unresolved questions" section but must design against these anchors.

## Environment facts (from workspace inspection, 2026-09-24)
- Linux container, Node 22, npm registry reachable. Headless Chromium available for automated screenshots/smoke tests (software rendering — FPS measured here is NOT representative of any real device).
- polyhaven.com and kenney.nl are blocked by egress policy -> no third-party asset downloads. All models, textures, audio are generated procedurally in code (Three.js geometry, canvas textures, Tone.js synthesis).
- No DCC tool (Blender etc.), no image-generation model. Creature/character "models" are bespoke procedural builders in TypeScript: each species has its own builder function composing lathe/capsule/sphere/cone/tube/extruded-shape geometry into a hierarchy of named parts (body, head, jaw, ears, horns, tail segments, limbs, wings, fins), with canvas-drawn eye/face textures and per-part materials. Animation is procedural (per-part transforms driven by clips: idle, move, attack, hit, capture, faint, victory) authored as parameter curves. Evolution stages in a family share a family "motif" but are separate builders with different anatomy — never a recolor or uniform scale of one mesh.
- Single developer-orchestrator plus subagents; realistic content production must fit that.

## Tech stack (fixed)
Vite + React 19 + TypeScript, three, @react-three/fiber 9, @react-three/drei 10, @react-three/rapier 2, @react-three/postprocessing 3, zustand 5, tone 15, zod for content validation, vitest for unit tests, Playwright (preinstalled Chromium) for browser smoke tests.

## Fixed IDs and structure
- Types (exactly 10, ids): `fire`, `water`, `electric`, `verdant` (plant), `stone`, `frost`, `gale` (wind/air), `toxin`, `shade` (dark/shadow), `lumen` (light/spirit).
- Creature ids: `c01`..`c30`. Families `f01`..`f10`, stage 1/2/3 in order: f01 = c01-c03, f02 = c04-c06, ... f10 = c28-c30.
  - f01 = Electric starter line (Voltra), f02 = Fire starter line (Emberhorn), f03 = Water starter line (Rippleback).
  - f04 verdant, f05 stone, f06 frost, f07 gale, f08 toxin, f09 shade, f10 lumen (primary type of the family; stage 2/3 may add a second type).
- Zone ids: towns `town_1`, `town_2`, `town_3`; routes `route_1`..`route_5`; areas `forest`, `cave`, `lake`, `volcano`, `snowpeak`; plus optional interiors/`league` venue if the World Designer needs one for the champion (must be documented).
- Challenge venue ids: `trial_1`..`trial_6` (six major challenges, in required order). Champion: `champion`.
- Move ids: `m001`...; item ids `i_...`; trainer ids `t_...`; quest ids `q_...`; story flag ids `flag_...`.
- Level cap design range: player's party roughly Lv 5 at start, ~Lv 50 at champion.
- Party max 6; storage is unlimited-in-practice but must have a defined large cap (e.g. 300) with explicit full-storage behaviour.

## Scope realism decisions
- Overworld is a set of discrete zones (each a bounded outdoor/indoor scene, ~120–200 m across) connected by edge exits/doors with loading transitions — not a seamless streamed open world.
- Terrain per zone is a procedural heightfield defined by data (noise params + hand-placed features) with Rapier heightfield/trimesh colliders.
- Battles are staged in the current zone at a flattened nearby "battle stage" point chosen from data-defined safe spots or computed.
- Three-stage creature battle UI: 1v1 singles only (no doubles).
- Audio: Tone.js synth music (per-zone theme + battle layers), synthesized cries parameterized per species, synthesized SFX.

## Signature mechanic (orchestrator's seed, Creative Director owns final definition)
Working concept "Resonance": the region's landmarks respond to creature types. In exploration, the lead creature's type lets the player perform field actions on marked objects (e.g. electric powers dormant gates, fire clears thornwood, water raises stepping-stone currents, stone shifts boulders, frost freezes water to cross, gale lifts across gaps with updrafts...). In battle, each zone has an attuned type that grants a modest bonus to matching moves and influences weather. Field actions gate optional secrets and some progression, and each trial awards the ability for a new field action category. The Creative Director must refine this into something concrete, original and feasible, and confirm it avoids softlocks (every mandatory field action must be performable by at least one creature obtainable before the gate).

## Document rules
- Write only your own document. Read other documents only if they already exist (they are being written in parallel).
- Concrete, implementation-ready, with tables where appropriate. Include: Acceptance criteria, Dependencies, Risks, Unresolved questions sections.
- Never claim tests, benchmarks or playtimes were measured.
