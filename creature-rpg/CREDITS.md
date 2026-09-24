# Credits

**Wildchord: Songs of Cantarra** is an original game. Its world, characters, creatures, names, dialogue, UI, music and sound were designed and written for this project.

## Assets

No third-party art, audio, fonts-as-assets or models are bundled. Everything visible and audible is generated at runtime:

- **Creatures and people:** a procedural part-table DSL (`src/creatures/`) with canvas-drawn face atlases.
- **Terrain, water, vegetation, buildings:** procedural geometry and shaders (`src/world/`).
- **Music, SFX, cries:** synthesized with Tone.js (`src/audio/`).

The CC0 asset sites considered in design (Poly Haven, Kenney) were unreachable from the build environment, so nothing from them is used.

## Open-source software

| Package | License |
|---|---|
| React, React DOM | MIT |
| three.js | MIT |
| @react-three/fiber, @react-three/drei, @react-three/rapier, @react-three/postprocessing | MIT |
| Rapier (@dimforge/rapier3d-compat) | Apache-2.0 |
| postprocessing | Zlib |
| Tone.js | MIT |
| Zustand | MIT |
| Zod | MIT |
| Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| Playwright (QA only) | Apache-2.0 |

## Fonts

UI text uses the platform's system font stacks, defined in `src/ui/theme.css`. No font files are shipped.

## Genre acknowledgement

The game belongs to the creature-collecting RPG genre. It deliberately avoids any existing franchise's names, terms, creature designs, silhouettes, UI layouts and music. The originality checks are in `design/release_character_gate.md` and `design/reviews/`.
