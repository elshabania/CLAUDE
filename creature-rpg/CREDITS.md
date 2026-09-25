# Credits

**Wildchord: Songs of Cantarra** is an original game. Its world, characters, creatures, names, dialogue, UI, music and sound were designed and written for this project.

## Assets

Almost everything visible and audible is generated at runtime:

- **Creatures:** a procedural part-table DSL (`src/creatures/`) with canvas-drawn face atlases.
- **Terrain, water, vegetation, buildings:** procedural geometry and shaders (`src/world/`).
- **Music, SFX, cries:** synthesized with Tone.js (`src/audio/`).

The CC0 asset sites considered in design (Poly Haven, Kenney) were unreachable from the build environment, so nothing from them is used.

### Human characters: MakeHuman assets (CC0 1.0)

The human body base, skeleton weights, shape targets and face pose units come from the **MakeHuman** project
(https://github.com/makehumancommunity/makehuman, branch `master`, directory `makehuman/data/`). Section C of the
repository's `LICENSE.md` releases these assets under **CC0 1.0 Universal**: "The base mesh and proxies, Targets and
modifiers, Textures, Clothes (any MHCLO-based asset), Poses and expressions". Copyright holders at the time of the CC0
release: Data Collection AB, Joel Palmius, Jonas Hauquier (original 2014 work by Manuel Bastioni). No MakeHuman program
code (AGPL) is used or shipped.

`scripts/build-humans.mjs` downloads the files below (cached in `.cache/mh/`, not committed) and bakes them into
`src/creatures/human/assets/humans.bin.gz`. That file is a derivative of the CC0 data, and it is the only file shipped:

| MakeHuman file(s) | Used for |
|---|---|
| `3dobjs/base.obj` (base mesh hm08: body, eye, eyelash, teeth, tongue, scalp and skirt helpers) | body topology, UVs, helper geometry |
| `rigs/default.mhskel`, `rigs/default_weights.mhw` | joint positions and skin weights, collapsed onto the 37-bone game skeleton |
| `poseunits/face-poseunits.bvh`, `poseunits/face-poseunits.json` | face expression morphs (blink, brows, smile, jaw, lip units), baked through the full MakeHuman face rig |
| `targets/macrodetails/*.target` (universal, ethnic mix, `height/`, `proportions/`): 89 files | body presets for age, sex, muscle, weight and height |
| `targets/breast/nipple-size-decr`, `nipple-point-decr`, `breast-point-decr` | modest clothed silhouette |
| `targets/eyes/{l,r}-eye-scale-incr`, `{l,r}-eye-height2-incr`, `targets/nose/nose-scale-{horiz,vert,depth}-decr`, `nose-point-width-decr`, `targets/mouth/mouth-scale-horiz-decr`, `mouth-{upper,lower}lip-volume-decr`, `mouth-trans-backward`, `mouth-lowerlip-height-decr`, `mouth-angles-up`, `targets/head/head-age-decr`, `targets/chin/chin-{width,height}-decr`, `chin-prominent-incr`, `targets/cheek/{l,r}-cheek-bones-incr`, `targets/neck/neck-scale-horiz-decr` | the shared stylised face |

The generated build prints the exact file list to `.cache/mh/used-files.json`. Everything else on the humans is
procedural and original to this project: clothing, hair, cap, shoes, props, all shaders (skin, eyes, lashes, fabric,
hair, brass) and all animation. No Mixamo or other mocap data is used.

## Open-source software

| Package | License |
|---|---|
| React, React DOM | MIT |
| three.js | MIT |
| @react-three/fiber, @react-three/drei, @react-three/rapier, @react-three/postprocessing | MIT |
| Rapier (@dimforge/rapier3d-compat) | Apache-2.0 |
| postprocessing | Zlib |
| n8ao (via @react-three/postprocessing) | ISC |
| @pmndrs/assets (HDRIs only) | CC0-1.0 |
| Tone.js | MIT |
| Zustand | MIT |
| Zod | MIT |
| Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| Playwright (QA only) | Apache-2.0 |
| meshoptimizer (build-time mesh simplification via three.js `examples/jsm/libs`) | MIT |

## Fonts

UI text uses the platform's system font stacks, defined in `src/ui/theme.css`. No font files are shipped.

## Genre acknowledgement

The game belongs to the creature-collecting RPG genre. It deliberately avoids any existing franchise's names, terms, creature designs, silhouettes, UI layouts and music. The originality checks are in `design/release_character_gate.md` and `design/reviews/`.
