# Wildchord: Songs of Cantarra

An original, single-player 3D creature-collecting RPG that runs in the browser. You play a new **Tuner** in the region of Cantarra, where the Chordstones that keep the land in tune are going quiet. You befriend **kin** (30 species in 10 three-stage lines across 10 types), earn six **Keynotes** from the **Cadence Halls**, keep pace with your rival Cass, and uncover why the Stillmark survey guild is fitting the stones with Stillbells.

All models, textures, music and sound are generated in code. There are no downloaded assets. Names, creatures, UI and music are original. See `design/release_character_gate.md` for the originality gate and its denylist.

## Play

- **Deployed build:** the game is built into the root Next.js app at **`/play/`** (see "Deploy" below).
- **Locally:**
  ```bash
  cd creature-rpg
  npm ci
  npm run dev          # http://localhost:5173
  ```

### Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / run | WASD or arrow keys / hold Shift | Left-side virtual joystick / Run button |
| Camera | Drag or move the mouse, wheel to zoom | Drag on the right half |
| Interact / confirm | E, Space, Enter | Contextual button |
| Menu (Tuning Ledger) | Tab | Menu button |
| Map / journal | M / J | From the menu |
| Back | Esc / Backspace | ✕ buttons |

Every menu is fully keyboard-navigable. The settings include text speed, reduced motion, camera sensitivity, invert-Y, quality profile (High / Balanced / Mobile), HP numbers, and master/music/SFX volume with mute. Status and type information never relies on colour alone: each chip also carries a code and a glyph.

## What's in it

- **Campaign:** 21 zones (Larkhollow → Concord Spire): 3 towns, 5 routes, a forest, a cave, a lake, a volcano, a snow peak, 6 Cadence Hall interiors, the Stillhouse and the League spire. It has 6 Cantors, 6 rival battles, the Stillmark admins, Odile's two-phase battle and the champion.
- **Battles:** a deterministic, seeded, pure battle simulation (`src/sim/battle`). It covers speed and priority, accuracy, crits, the 10×10 type chart with dual types, same-type bonus, zone attunement, traits, 5 statuses plus confusion, weather, forced switches and fainting. Battles are staged in place in the 3D zone, with a camera director and VFX. The AI picks its action from a limited view before it sees the player's command.
- **Collecting:** four Chime tiers with a three-ring capture sequence, a party of 6, the Fosterage (storage), the Kinsong (encyclopedia with a 3D viewer), XP, Crescendo (evolution), learnsets, move replacement and recall, and teaching Etudes.
- **World:** roaming wild kin that start encounters on contact, trainers with sight lines, Resonance nodes (type-gated puzzles with a Steward fallback, so no softlocks), Hearthrests, Chandleries, Waystone fast travel, quests and the journal.
- **Saves:** versioned localStorage saves with migrations, an atomic write-verify-backup commit, recovery from corruption, and JSON export/import.

## Project layout

```
creature-rpg/
  design/          design pipeline docs (bible, decisions, systems, world, creatures, QA plan, reviews)
  src/sim/         pure game logic: battle engine, AI, progression, save ops, world rules (no DOM)
  src/data/        validated JSON content (species, moves, items, trainers, encounters, zones, dialogue)
  src/creatures/   procedural creature + human model DSL, face atlas, procedural animator, 30 species
  src/world/       terrain, water, props, player controller, camera, follower, zone actors
  src/battle/      battle store (cue queue) and 3D battle scene
  src/ui/          HUD, dialogue, menus, battle UI, shop, title/new game/starter, settings
  src/audio/       Tone.js adaptive music, SFX and creature cries
  src/persistence/ save manager, schema, migrations
  scripts/         content generators and QA scripts (screenshots, smoke play-through)
  tests/unit/      vitest suites
```

## Tests and QA

```bash
npm run typecheck
npm test                                  # all unit suites (vitest)
node scripts/play-smoke.mjs <url> <dir>   # scripted opening play-through in headless Chromium
```

The unit suites cover battle math against the spec's test vectors, persistence (migration, corruption recovery, quota), content validation, cross-references between zones, dialogue and trainers, and a **campaign reachability proof**. That proof plays the story as a flag fixpoint and requires every zone, all 6 Keynotes, every story flag in order and every mandatory trainer. A **balance simulator** runs real battles for all three starters. Evidence and honest limits are in `STATUS.md` and `KNOWN_ISSUES.md`. Screenshots come from headless Chromium with software GL. They verify content and flow, **not** performance.

## Deploy

The repository root is a Next.js app deployed on Vercel. Its `prebuild` script installs and builds `creature-rpg/` into `public/play/`, and `next.config.mjs` rewrites `/play` to the game's `index.html`. The game uses a relative base (`./`), so it also works from any static host: `npm run build` → `dist/`.

## Credits

See `CREDITS.md`.
