# Human characters: rebuild review

**Scope.** Replace the primitive-assembled humans with properly modelled characters, meaning a real face and real anatomy, fitted clothing and skeletal animation. The user had called the old ones "very bad renders, no real face or shape". The approved art direction is a realistic world with stylised creatures. The quality bar is a polished modern 3D game character. Every design is original.

## 1. Approach

| Layer | How |
|---|---|
| **Body** | MakeHuman's CC0 base mesh (hm08, 13 380 body vertices, plus helpers for eyes, lashes, teeth, tongue, scalp and skirt). `scripts/build-humans.mjs` applies MakeHuman macro targets using MakeHuman's own weighting of gender, age, muscle, weight, height and proportions. It bakes one stylised neutral body and 12 linear **preset deltas**: teen, young and old in F and M, plus child, muscle, heavy, thin, tall and short. At runtime each look blends these presets (`look.ts`). Per-character seed variety adds small height and weight changes. The shared stylisation is a CC0 face-target mix: slightly larger eyes, a smaller nose and mouth, a youthful head, cheekbones and softly upturned mouth corners. A relaxed hand is baked into every shape through the full MakeHuman finger rig: the spread is closed and the thumb drawn in. |
| **Skeleton** | The 163-bone MakeHuman rig is collapsed onto a **34-bone game skeleton**: root, hips, spine, chest, neck, head; per side clavicle, upper arm, forearm, hand, 3 finger segments, 2 thumb segments, thigh, shin, foot, toes. Two eye bones are added at runtime. The bind pose uses identity rotations. The CC0 weights are summed per game bone and kept to the top 4 per vertex. |
| **Face** | 18 expression morphs are **baked from MakeHuman's CC0 face pose units** (BVH, skinned through the full face rig): blink (both, L, R), lid up, squint, brow down, inner and outer brow up, cheek up, jaw open, jaw wide, kiss, smile, frown, wide, upper lip up, lower lip down, nose wrinkle. They are applied on the CPU to a per-instance head sub-mesh, so only touched vertices are rewritten. Eyes are procedural spheres with iris fibres, a limbal ring, a pupil, a clearcoat and a painted catchlight, aimed by eye bones with saccades. Lashes use the MakeHuman lash cards with a procedural strand alpha. Brows, lips (masked by the orbicularis-oris weights), lid crease, soft AO, blush and freckles are shader-painted in face space. Skin is lit with a wrap-lighting subsurface term. Teeth and tongue come from the MakeHuman helpers and follow the jaw morph. |
| **Expressions** | `neutral, happy, smirk, surprised, determined, shout, sad, worried, hurt, faint` sit on a resting face (lips closed, eyes a touch open, faint smile). Blinking is automatic. The mouth talks while `model.talking` is true, which NPCs set during their dialogue. Battle actions flash the matching expression. |
| **Clothing** | Garment shells are derived from the body surface, so they have the same topology and weights and deform exactly with the body. Each shell is offset along the normal with per-zone ease and wrinkle noise. A **normal-only Laplacian drape** with a clearance floor bridges anatomy the way stretched fabric does, and shell normals are recomputed and softened. Hems, necklines, open jacket fronts and sleeve lengths come from a per-vertex signed cut field. The shader discards on the field, which gives clean straight hems. Hem bands, stitching and brass piping follow the same field. Outer layers hide fully covered inner-layer and body faces, so nothing pokes through. Coats and skirts use the MakeHuman skirt helper. Shoes are lofted from the real foot outline, with a midsole, outsole, toe spring, open collar, laces and a sole lift. Straps and sashes are ribbons laid over the torso. Cap, hats, goggles, earmuffs, glasses, monocle, satchel, badge and bell are rigid parts skinned to one bone. Fabric shading is one shared material with procedural weave and bump (faded with distance), mottling, quilting, stripes, a button placket, the tuning-fork emblem and darker insides. |
| **Hair** | A scalp shell follows a radial skull field. Tapered lens-section clumps grow from the scalp along per-style direction fields, with gravity, stiffness, curl, surface hugging and collision against the head, neck and shoulders. Styles: spiky messy (also works under a cap, with bangs under the brim and tufts at the rim), crop, curly, long, bob, bun, ponytail, braid, and bald with a fringe. The material is MeshPhysical with anisotropy along the strand tangent, root darkening and strand variation. |
| **Animation** | Procedural, with no mocap (`animator.ts`). Idle breathing, weight shift and look-around. Walk, jog and run blend by speed, with **IK foot placement**: the stance foot moves backward at body speed so feet do not slide. Swing arcs, pelvis twist and roll, counter-rotating chest, head stabilisation, forward lean with speed, lean into turns (from root yaw rate), arm swing and hand curl. Actions: `throw` (Chime wind-up and release, Chime prop in hand), `command` (point with a fist), `victory` (anticipation dip, jump, then a held fist-pump holding the brass Chime high), `happy`/`wave`, `hurt` (flinch), `lose` (slump to a kneel), `talk` (gesture). The old ActionName values still map: attack/special/status → command, capture → throw, hit/breakout → hurt, faint → lose. |
| **API** | `new HumanModel(look, { quality, lod })` exposes `root`, `bounds`, `setSpeed`, `play(action, {onContact,onDone})`, `update(dt)`, `setExpression`, `talking`, `reducedMotion`, `busy`, `ready` and `dispose`. `dispose` survives React StrictMode double effects: the model rebuilds if it is updated again. |

## 2. Performance

- Asset: `src/creatures/human/assets/humans.bin.gz`, **0.87 MB** (int16 quantised with delta and byte-plane shuffling, then gzip; decoded with `DecompressionStream`). There are no textures: all shading is procedural.
- Draw calls per character: body, head, face details (lashes, teeth, tongue), eyes, **one cloth mesh** for every garment and cloth accessory, **one brass mesh**, hair, and any hand props. That is about 7 to 9 calls.
- **Sharing:** body shapes, garment, hair, eye and body geometry and materials are cached per look, lod and quality, and reference-counted. A repeated trainer look (for example several Stillhands) costs about 5 ms and no new GPU buffers. Only the morphing head and face-detail geometry is copied per instance, and only at LOD 0.
- **Build spreading:** uncached looks are built one per tick, nearest LOD first, so a zone of 13 NPCs never stalls a single frame. A cold build takes about 110 to 130 ms in headless software GL.
- **LOD:** NPCs switch between LOD 0 (within 12 m: face morphs, blink, talk) and LOD 1 (beyond 16 m: a body simplified to 30 % with meshoptimizer, garments derived from that simplified surface, half the hair clumps, no morphs). Beyond 30 m the animation ticks at 10 Hz. LOD 2 (a 10 % body) exists for far or mobile use. On the mobile tier NPCs always use LOD ≥ 1, eyes drop clearcoat and hair drops anisotropy.

## 3. Call sites

- `PlayerController.tsx`: the player model (LOD 0).
- `ZoneActors.tsx` `Person`: NPCs and trainers, with distance LOD, facing and talking.
- `BattleScene.tsx`: trainers on stage throw the Chime on send-out and capture, gesture a command on moves, and play victory or lose at the battle end.
- `TitleScreens.tsx`: the new-game preview is centred and waves. It adds the new **Spiky** hair option, which is the default, and existing saves keep their index.
- `ZoneTool.tsx`: `&look=B.S.H`.
- `?tool=humans`: lineups, a face close-up turntable (`view=face&cam=deg`), bust, hand and body views, and `expr=`, `action=`, `speed=`, `at=` (freeze time), `lod=`, `talk=1`.

## 4. Licenses

All imported data is MakeHuman CC0 1.0. The full file list and attribution are in `CREDITS.md`. Raw downloads are cached in `.cache/mh/`, which is git-ignored. Only the baked binary is committed. Rebuild with `npm run build-humans`, or add `--offline` to use the cache only. No Mixamo, Poly Haven, Kenney or other non-CC0 data is used.

## 5. Screenshots (scratchpad `humans/`)

| File | What |
|---|---|
| `t16_face.png`, `t16_face34.png`, `t15_face*.png` | player face, front and 3/4 |
| `t36_expr_{neutral,happy,surprised,shout,sad}.png` | player expressions (skin tone 2) |
| `t30_face_{cass,oriel,odile}.png`, `t31_face_*.png` | NPC faces |
| `t27_player_b0.png`, `t27_player_b1.png` | player creator: both builds × 3 skin tones × 4 hair styles |
| `t21_pbust.png`, `t29_tallbust.png`, `t29_back.png`, `t09_player.png` | player outfit: bust, back, full body |
| `t18_walk_{1.4,3.4,6.2}.png` | walk, jog and run poses |
| `t20_victory.png`, `t19_throw.png`, `t19_command.png`, `t19_lose.png`, `t23_fist.png`, `t23_hand.png` | actions and hands |
| `t24_group1..6.png`, `t26_group.png`, `t25_group.png` | the full NPC cast (31 looks) |
| `t32_lod1.png`, `t32_lod2.png` | LODs |
| `town1_walk.png`, `t17_town4.png` | in game, town_1 |
| `battle_intro.png`, `battle_sendout.png` | in game, rival battle with the trainer on stage |
| `t35_newgame.png` | new-game preview |

## 6. Remaining gaps / next steps

- **Headless QA speed.** In this environment's software GL, town_1 renders at about 1 fps. The stock `play-smoke.mjs` times out on its 30 s screenshot and its 350 ms key cadence, so the flow does not advance. The battle and town shots above were driven through the same store hooks (`__game.startNewGame`, `talk`, `runActions`) with long waits. On real GPUs this is not an issue, but the smoke script needs longer timeouts and hook-based dialogue advancing to be reliable headless.
- **Hands:** the four fingers are merged per segment, so the command gesture is a fist rather than a pointing index finger. A per-finger index bone would add 3 bones.
- **Close-up hem jaggies:** necklines and jacket fronts show slight triangle-level waviness at face-cam distance. Fine at gameplay distance.
- **Hair under the cap:** the crop, tail and curl styles are mostly hidden by the default cap from the front. They differ at the sides and back.
- **Cloth simulation:** coats and skirts are skinned rather than simulated, so they stretch slightly with wide strides. There is no secondary motion on hair or scarf tails yet.
- **Talking** for trainers outside NPC dialogue, and the player's own lines, is not wired: `dialogue.npcId` only covers NPCs.
- `src/creatures/materials.ts` (creature shader, not part of this work) logs a vertex-shader `dFdx` compile error on the title screen in software GL. This needs follow-up by the creature owner.
