# Rendering Engineer Review of the Six Design Drafts

Reviewer: Rendering Engineer (author of `rendering_and_architecture.md`, "RA" below). Date: 2026-09-24.
Scope: `creative_direction.md` (CD), `creatures.md` (CR), `systems.md` (SY), `world.md` (WD), `qa_plan.md` (QA) and `release_character_gate.md` (GATE). The review is about feasibility, performance, rendering and tooling.

**Severity:** **Blocker** = cannot be built or passed as written; **Major** = significant rework, or performance/gate failures; **Minor** = an alignment fix.

**Evidence:** triangle counts come from constructing `three@0.186.1` geometries in Node with CR §2.1's segment counts (a geometry count, not a performance measurement). Texture sizes are arithmetic. No FPS or benchmark result exists; performance on every reference configuration is **Not measured**.

**Totals:** 2 Blocker · 16 Major · 23 Minor.

---

## 1. creatures.md

**CR-1 · Blocker · CR §2.1 segment table vs CR §2.6 budgets.**
- *Requirement:* stage budgets of 3,500 / 5,500 / 8,000 triangles on High, with sphere 24×16, capsule 12 radial, lathe 24 and tube 12 on High.
- *Consequence:* a 24×16 sphere is 720 triangles, a capsule 216, a tube 192 and a lathe 288.
  - c01's part table (10 spheres, 13 capsules, 5 cones, 10 tubes, 2 extrudes) comes to about **12,200 triangles on High**, 3.5× its 3,500 budget. On Mobile it is about 4,700 against 1,800.
  - c30 comes to about **13,800 on High** against 8,000. Its 14 lateral-spot spheres (r 0.025 H) account for about 10,000 of that.
  - Every builder written from these tables will fail the CR §9.7 budget test.
- *Resolution:* make segment counts size-adaptive through one `segsFor(kind, radiusInH, lod, quality)` table:
  - parts with r ≥ 0.2 H keep the CR table
  - 0.08–0.2 H get half the segments
  - < 0.08 H get a floor of a 8×6 sphere, a 6-radial capsule or tube, and 2 cap segments
  - parts < 0.03 H (spots, nubs, toe cones) get a 6×4 sphere or become vertex-colour decals on the parent
  
  Also delete fully enclosed geometry: c01's belly sphere is almost entirely inside the torso and should be vertex-coloured instead. The contract test enforces the budgets per LOD.

**CR-2 · Major · CR §2.5 "rigid hierarchy, animated parts stay separate Object3Ds".**
- *Consequence:* every animated part is its own draw call. c01 is about 30 draw calls (4 legs × 3 segments, 5 tail segments, 2 flaps, 2 seams, 2 prongs, 2 eyes, head, torso, mouth). The CR §2.6 limit is ≤ 10 and RA's is ≤ 14. A battle with 2 stage-3s plus a trainer would exceed the battle draw-call budget from characters alone.
- *Resolution:* the builder keeps the named `Object3D` hierarchy for authoring and gate hashing, then **bakes one `SkinnedMesh` per material class**: rigid binding (weight 1), one bone per animated part (≤ 64 bones), clips drive the bones, and transparent parts (ICE, MEMBRANE) stay separate meshes. Expected result: 4 to 7 draw calls per creature. It also removes c24's per-frame web rebuild (3-bone blended weights instead). RA §4 will adopt this.

**CR-3 · Major · c30 (5.5 m long, CR §0) with RA §2.7 battle staging and §2.5 follower.**
- *Consequence:*
  - RA's 12×6 m stage rectangle and "7 m + radii" spacing cannot hold a 5.5 m creature facing a 0.35 m one while the camera frames both.
  - In the overworld, a 5.5 m follower behind a 1.6 m trainer fills the third-person view.
- *Resolution (answers CR Q4):*
  - Battle display scale 0.75 for c30 (4.1 m). The camera director also pulls back; both are needed.
  - Stage size is computed from bounds: length = 12 m + both bounding diameters.
  - Overworld: c30 follows **aloft**, 3 m above and 5 m behind the trainer. This fits its eclipse lore and keeps the camera cone clear. Within 4 m of the camera it uses a dither fade.
  - c12's canopy and c15's orbit use their bounding sphere for spacing.

**CR-4 · Major · CR §2.4 "each eye ... carrying its own `CanvasTexture`".**
- *Consequence:* per-instance canvas textures mean a GPU upload per creature instance and per eye. With 8 wild creatures plus a party that is dozens of redundant uploads, and a hitch at spawn.
- *Resolution:* one shared face atlas per species and quality. Each instance selects its cell with a uniform or a UV offset on a `Texture.clone()`, which shares the source (see CD-1 for sizes).

**CR-5 · Major · Stage-1 heights vs CD §5.1 scale floor and GATE CC-03.**
- *Consequence:*
  - CD requires the smallest stage-1 to be ≥ 0.25 × teen height, about 0.39 m for a 1.55 m teen. c13, c16, c19, c22 and c28 are 0.25–0.30 m, and c01/c10 are 0.35 m.
  - CC-03 asks for species identification at 15 m. A 0.30 m creature at 15 m with FOV 55° at 720p is about **14 px tall**, below CD's own 20 px silhouette rule.
- *Resolution:* raise stage-1 H to a 0.40 m floor. Set CC-03's stage-1 distance to 10 m (about 32 px at 0.40 m). Keep 15 m for stages 2 and 3.

**CR-6 · Minor · c27 "High-only point light" (CR §10).**
- *Consequence:* adding or removing a light changes three.js's program cache key, so every lit material recompiles at battle start and the frame hitches. RA's battle fill light has the same flaw, which I am correcting in RA.
- *Resolution:* no scene light is ever added or removed at runtime. c27's glow is emissive plus a per-battle rim tint. RA's battle fill light becomes permanently present (intensity 0 outside battle).

**CR-7 · Minor · c26 strings as `LineSegments`.**
- *Consequence:* WebGL ignores `linewidth`, so strings are 1 device pixel at any DPR. They are near-invisible on High DPR and absent from silhouettes.
- *Resolution:* use 4-sided skinned tubes (r ≥ 0.006 H).

**CR-8 · Minor · Emissive and bloom ranges.**
- *Consequence:* CR clamps `emissiveGain` to 0–4 (the c30 corona is 2.0), while CD §5.4 caps emissive at 1.5 before bloom. RA's bloom threshold is 1.0.
- *Resolution:* adopt CD's 1.5 cap, with 2.0 allowed only for `GLOW`-class accents.

**CR-9 · Minor · Clip set.** CR has 8 clips (`attack_special`). QA C-03 and GATE GC-05/§3.2 list 7. *Resolution:* add `attack_special` to QA and GATE, or declare it optional with a fallback.

## 2. creative_direction.md

**CD-1 · Major · CD §5.2 eye atlas: "256×256 per eye on High and Balanced, 128 on Mobile, 7 frames in one row".**
- *Consequence, texture memory:*
  - One row of 7 × 256² cells in RGBA8 is 1.84 MB, or 2.45 MB with mips.
  - The fixed upper-left highlight (CD §5.2) means the right eye **cannot be UV-mirrored**. RA §4.4 assumed mirroring, which was my error. So each species needs L and R frames: **4.9 MB per species, 147 MB for all 30**.
  - `CanvasTexture` keeps its canvas alive, adding about 1.8 MB of CPU memory per atlas.
  - About 12–15 species are resident at once (party of 6, the zone's encounter table, battle opponents), which is **59–74 MB**, or 37–46% of RA's Balanced texture budget of 160 MB. That profile is the integrated-GPU 60 FPS target.
  - On-screen eye size is ≤ about 32 px even in a head close-up at 720p, so 256 px cells are oversampled at least 8×.
- *Consequence, frame-set mismatch:* four different sets are specified.
  - CD: 7 emotions, plus a "3-frame closure" blink.
  - CR: 6 frames.
  - GATE §3.2: 7 including `blink`.
  - RA: 8.
- *Resolution:*
  - Canonical set of 9 cells: `neutral, blink_half, blink_closed, happy, determined, surprised, hurt, sleepy, quiet`. L and R variants go in one atlas, 18 cells in a 6×3 grid.
  - Cell size is 128 px on High and Balanced (768×384, 1.57 MB with mips, about 24 MB for 15 species) and 64 px on Mobile.
  - A 256 px atlas is generated on demand only for the species open in the encyclopedia viewer.
  - After upload, the canvas is released and the atlas is regenerated from the painter on context loss.

**CD-2 · Major · CD §1.2 lighting moods beyond RA's sun+hemisphere rig.**

Cave "point-lit", forest "dappled light shafts", lake "reflections", route_4 "moving cloud shadows", volcano "heat shimmer (High only)", route_5 "blue hour permanently" and snowpeak aurora.
- *Consequence:* each of these either has no specification or implies an expensive technique (planar reflection, god rays, per-light shaders).
- *Resolution*, one fixed technique each (RA will add them):
  - Cave: `lighting: interior` with **exactly 4** non-shadow point lights at crystal clusters (a constant count, so no recompiles), plus emissive and crystal light baked into vertex colours.
  - Forest: ≤ 12 additive light-shaft cards. Route_4: a scrolling noise "cloud cookie" in terrain and prop lighting (one texture sample).
  - Lake: fresnel sky plus **mirrored low-LOD duplicates of ≤ 3 hero landmarks** under the water; no `Reflector` on any profile.
  - Volcano: High-only screen-space heat distortion over lava/vents; off elsewhere. Route_5: a fixed lighting preset outside the day/night cycle. Aurora: one scrolling ribbon mesh (1–2 draw calls).

**CD-3 · Minor · Ambient particles (pollen, dandelion seeds, dust motes, embers, hail flurries, blizzard bursts).** *Resolution:* one parameterised GPU "motes" system with one draw call per kind, counted against the particle cap. Hail is a snow variant.

**CD-4 · Minor · Brows and mouth "separate meshes"; mouth shapes "swapped per emotion".** *Resolution:* feasible after CR-2. Brows are bones. Mouth shapes are bones scaled to 0 or morph targets, which avoids extra draw calls.

**CD-5 · Minor · Cass's scarf as a "4-segment physics tube".** Rapier is overworld-only and paused in battles and cutscenes. *Resolution:* a Verlet spring chain in presentation code, with no Rapier bodies.

**CD-6 · Minor · Audio voice budget of about 24 (CD §8.1) vs RA §9.2 (16 music + 12 SFX + 2 cries).** *Resolution:* total synth voices ≤ 24 (music ≤ 14, live SFX synths ≤ 8, cries ≤ 2). Pre-rendered `Tone.Offline` buffers played by `Player`s do not count. Layer changes are bar-quantized with 400 ms crossfades (CD §8.4 supersedes RA).

## 3. world.md

**WD-1 · Blocker · The cave (two levels, a spiral ramp, ceilings), the snowpeak 25 m ice tunnel, root hollows and pile-built pavilions.**
- *Consequence:* RA §3 builds every zone from a single heightfield, which cannot represent ceilings, overhangs, tunnels or stacked levels. As specified, the cave, and so trial_3, cannot be built. This is a gap in my document.
- *Resolution:* a **cave kit**. Each level gets its own heightfield floor and collider. Walls and ceiling are a noise-displaced shell mesh extruded from WD-authored 2D cave-plan polygons (per level); walls get trimesh colliders, ceilings are visual and camera-probe only (there is no jump). Ramp and tunnels are kit meshes with trimesh colliders. Cave and tunnel volumes override the camera to ≤ 3.5 m distance and FOV 60°.

**WD-2 · Major · Mountain zones (volcano 70 m, snowpeak 90 m, route_4 40 m, route_5 50 m, town_2 terraces and stairs).**
- *Consequence:* at RA's 160 samples over 200 m (1.25 m cells), 3–4 m switchback ledges and terraces alias into stair-steps. The character controller slides or sticks at the jagged edges, and slopes over 45° are unclimbable.
- *Resolution:*
  - Use 256 samples (0.78 m cells) for these five zones. Terrain is about 131k triangles, culled in 16 chunks, which fits the High and Balanced budgets. On Mobile the draw-distance cull leaves about half visible.
  - Ledges, retaining walls and stairs are kit props with cuboid colliders.
  - WD authors paths as polylines with width ≥ 4 m and grade ≤ 30°. The data validator checks the grade on the generated heightfield.

**WD-3 · Major · Roaming max (up to 8; cave 5+5) and town crowds (BM-01: 8 NPCs, WD §8.2 ≥ 6 ambient creature vignettes, plus the follower).**
- *Consequence:*
  - RA made the wild-creature cap depend on the quality profile (8/6/4), which changes encounter density between devices. That is a fairness bug in RA.
  - Towns reach about 15 animated characters, against RA's active-creature budget of 10/8/6.
- *Resolution:*
  - The count is data-driven and the same on every profile.
  - Cost is controlled by **animation LOD**: full-rate updates within 25 m (at most 6 full-rate on Mobile), 15 Hz beyond that, 7.5 Hz beyond 50 m, plus mesh LOD2.
  - RA's budget becomes "animated characters in view ≤ 16 / 14 / 12".

**WD-4 · Major · Landmark sightlines (WD §8.5): Lantern Tree from route_1, windmills from route_2, Kiln glow from town_3, aurora from northern zones.**
- *Consequence:* these are in **other zones**, or more than 110 m away. RA's Mobile far plane is 110 m and Balanced is 160 m, so nothing beyond them renders.
- *Resolution:* a **vista layer** of low-poly landmark silhouettes on a skyline ring: fog-exempt, drawn after the sky with no depth writes, independent of the far plane, ≤ 3 draw calls on all profiles. WD adds `vistas: [{landmarkId, bearingDeg, distance, elevationDeg}]` per zone.

**WD-5 · Major · Number of distinct props and characters.**
- *Consequence:* by my count of WD §1.4 and CD §1.2, the world needs ≥ 70 bespoke builders: town building sets, 5 rest camps, about 20 named landmarks, 5 Damper variants, 10 resonance-node types × 2 states, 6 themed trial interiors with pressure plates, rotating bridges and wind fans, plus waystones and Chordstones. There are also about **110 human instances** (34 NPC rows plus 75 trainer rows in WD §2.8–2.9). Neither the schedule nor the bundle has a line item for this.
- *Resolution:*
  - A kit of ≤ 12 parametric building builders: house, hall, tower, kiosk, bridge, dock, wall, stair, arch, windmill, camp and machine. Town and zone identity comes from palette, material and dressing.
  - Landmarks are compositions of the kit plus a few bespoke pieces.
  - One parametric humanoid builder with outfit, hair and accessory kits, ≤ 10 archetypes for unnamed NPCs (allowed by GATE GC-02), and about 15 bespoke named characters.
  - RA adds per-zone code chunks of ≤ 40 KB gzipped and a `characters` chunk of ≤ 60 KB.

**WD-6 · Major · CD and WD disagree on zone data.**
- *Consequence:* the two documents give different attuned types (e.g. route_1 lumen vs electric, cave electric vs stone, snowpeak frost vs lumen), different trial hosts (CD trial_3 lake / trial_4 town_3 vs WD trial_3 cave / trial_4 lake) and different names. Zone palettes, fog, lighting presets and trial interior art all come from these fields, so zone data cannot be authored until they agree.
- *Resolution:* the orchestrator reconciles them before any Phase 2 zone data is authored. The zod `ZoneSpec` gets a single `attunedType` field and a single trial-host table.

**WD-7 · Minor · Mute shader (WD §8.1), including the region-wide 0.2 desaturation.** *Resolution:* feasible at negligible cost. A shared material chunk (the same injection point as the rim light) takes ≤ 2 world-space mute spheres plus a global amount, and applies to terrain, vegetation, water, sky and creatures. It works on Mobile because it does not need post-processing. The colour wave is an animated radius.

**WD-8 · Minor · Clock and weather.**
- WD defines 2 bands (Day 06:00–17:59, Night). RA used 4 phases. RA adopts WD's bands for the sim, and lighting stays a continuous curve.
- CR's c28 trait "at dawn" has no band; Systems or CR should fix it.
- Weather re-rolls mid-zone at a band change need a 10 s particle and fog crossfade.
- "Rest until" jumps the lighting under the fade, with PMREM regeneration during the black.

**WD-9 · Minor · Encounter immunity.** WD gives 4 s after battle; RA gives 3 s plus 3 m. *Resolution:* adopt WD's 4 s. Keep the 3 m walk-away as a secondary guard. The contact radius is WD's default 1.2 m or the species bound.

## 4. systems.md

**SY-1 · Major · Attack timing has three authorities.**
- *Consequence:* the three sources conflict.
  - SY §9.1 `anim` gives duration and `impactMs` (e.g. `melee_lunge` 700/350, `charge_rush` 1100/650).
  - CR §2.5 gives attack clips of 0.9–1.3 s with contact at 40–55%.
  - CD §5.5 caps attacks at ≤ 550 / 650 / 800 ms.
  
  No single clip can satisfy all three, so V-04 and GC-05 reviews will disagree.
- *Resolution:* the presenter owns absolute time.
  - SY `impactMs` is the sync point for damage, HP and VFX.
  - The creature clip is **time-warped piecewise**: windup→contact maps to [0, impactMs], and contact→end maps to the remainder, clamped by CD's caps.
  - CR authors clip *shape and phase proportions*, not absolute durations.

**SY-2 · Minor · Reduced motion.** SY halves durations, CR keeps marker timing and RA kept durations unchanged. *Resolution:* adopt SY's ×0.5 for presentation only. Sim results are unaffected.

**SY-3 · Minor · Battle weather that the overworld doesn't have.** Move weather lasts 5 turns and includes `sunlight`. *Resolution:* the battle stage gets a local weather override: particles, fog and a `sunlight` preset (exposure +0.3, warmer key light) that crossfades at the `weather_call` impact (800 ms) and reverts on expiry.

**SY-4 · Minor · AI command timing.** SY computes the AI command *first* from `AIView`, while RA's battle machine computed it after the player commits. Both hide the player's choice. *Resolution:* RA adopts SY's order.

## 5. qa_plan.md

**QA-1 · Major · The silhouette procedure is defined three different ways.**

| Source | Camera | Framing | How 20 px is made | Alignment | Metric |
|---|---|---|---|---|---|
| CR §7.1 | perspective, FOV 35° | 85% sphere | native 20 px render | bbox + equal-height | IoU ≥ 0.85 flag |
| QA C-02 | orthographic | 90% fit | downsample, 50% threshold | — | IoU > 0.85 flag, 0.90 fail |
| GATE GC-07 | side + 3/4 | 8% padding | box-downsample | centroid | D thresholds |

- *Consequence:* the three give different numbers for the same model, which will cause disputes at every gate.
- *Resolution:* one implementation, `tools/silhouettes`, owned by me, with **GATE GC-07 normative**. It reports both IoU and D. CR §7.1 and QA C-02 reference it instead of restating it.

**QA-2 · Minor · Script and flag names.** QA uses `test:unit/data/char/e2e/sim`, `?quality=`, `?bench=BM-xx`, `?debug=1` and `window.__qa`. RA uses `test/smoke/silhouettes`, `?profile=`, `?bench=traverse` and `__BENCH_RESULT__`. *Resolution:* QA's names become canonical. RA keeps its scripts as aliases, maps its traverse and battle runs to BM-02 and BM-06, and puts bench output under `__qa.bench`.

**QA-3 · Minor · Reference devices "Undefined" (QA §8.3).**
- RA §7.1 defines them: RC-L is an i5-1235U with Iris Xe or a Ryzen 5 7530U with Vega 7, Chrome, 1920×1080 at DPR 1. RC-P1 is a Pixel 7 on Chrome. RC-P2 is an iPhone 13 on Safari.
- QA's RD-P1 is iOS, which is swapped relative to RA.
- *Resolution:* keep QA's ids, fill them with RA's device specs, and have the orchestrator confirm which physical devices exist. Until then everything is Not measured.

**QA-4 · Minor · BM-03 "reflections per profile" and BM-04 "heat effects".** No profile has planar reflections (CD-2). Heat shimmer is High-only. *Resolution:* reword both scenes.

**QA-5 · Minor · C-04 looks for the face canvas on the `head` material.** The eyes are separate `eye_l`/`eye_r` parts. *Resolution:* check the eye-role parts.

## 6. release_character_gate.md

**GATE-1 · Major · "Byte-identical" and "pixel-identical" silhouette sheets from headless software GL (§3.1, GC-00, AC-2).**
- *Consequence:* SwiftShader output is repeatable for a fixed Chromium binary and flags, but not across Chromium revisions, or if antialiasing, DPR, dithering or tone mapping change. PNG encoder bytes are not a stable hash target either.
- *Resolution:*
  - Render masks into a `WebGLRenderTarget` with no MSAA, DPR 1, `antialias: false`, tone mapping off and `MeshBasicMaterial` black with no dither.
  - Read them with `readPixels`, threshold to 0/1 in-page, and **hash the binary mask arrays**, not the PNGs.
  - The 20 px mask is box-downsampled in JavaScript from the 256 px mask, not rendered a second time.
  - PNGs are evidence only.
  - Pin Chromium revision 1194 (`@playwright/test` 1.56.1, as installed) and record the revision in `report.json`. A revision change forces recalibration.

**GATE-2 · Major · GC-09 "eye region ≥ 12 px at 1280×720, battle camera face-on".**
- *Consequence:* with CD stage-3 proportions (head 0.18–0.28 H, eye 10–15% of head height), the eye is 1.8–4.2% of H. Framed full-body at 45% of the viewport (324 px), that is **5.8–13.6 px**, so most stage-3s fail by construction.
- *Resolution:*
  - Measure in a defined `face_closeup` shot, with the head at 30% of viewport height (used at send-out and hurt), where eyes are 22–32 px.
  - In the default `select` shot, require ≥ 6 px with the highlight visible.
  - RA lowers its "eye ≥ 12% of head" rule to CD's 10% floor.

**GATE-3 · Major · GC-10 palette measured on a lit render ("neutral lighting, ACES off").**
- *Consequence:* Lambert and PBR shading, the rim light, emissive parts, CR's vertex-colour noise and AO darkening all push pixels past ΔE 12. This produces false failures, and GC-10 becomes a hard fail at Phase 5.
- *Resolution:* the palette pass renders an **unlit albedo** image (per-part base colour and vertex colour, no rim, no emissive), as in CR §7.1 step 6. Use one k-means `k` (CR 3 vs GATE 6: pick 6). Lit captures are for manual review only.

**GATE-4 · Minor · GC-06 shape signature uses per-part vertex-count buckets.** Vertex counts vary with quality and LOD, and with the CR-2 bake. *Resolution:* hash the pre-bake part list at LOD0 on High, exposed as builder metadata.

**GATE-5 · Minor · §3.2 interface vs RA §4.1.** They differ: `build(ctx): Group` vs `CreatureModel`; roles `eye_l` and `limb_fl` vs `eyeL` and `leg_FL`; clips as data curves vs sampling functions. *Resolution:* RA adopts GATE's role vocabulary (`userData.role`), `ClipDef` data curves (rig templates generate curves, so GC-05 can check targets statically) and an **injectable texture factory**, so the Node stage builds without a canvas. `CreatureModel` wraps the Group.

**GATE-6 · Minor · GC-04 "renders to a canvas of at least 256×256".** *Resolution:* acceptable as a painter check. State explicitly that runtime atlases are 128/64 px cells (CD-1).

**GATE-7 · Minor · GC-12 string-literal scan needs a TypeScript/TSX parser.**
- *Consequence:* the installed **TypeScript 7.0.2 exposes no JS compiler API**. `require('typescript')` exports only `version` and `versionMajorMinor`, so a scanner written against `ts.createSourceFile` will not run.
- *Resolution:* use `@babel/parser` or `oxc-parser`, declared as a devDependency. `tsx` (esbuild) is unaffected.
- On the orchestrator's installs: this is the only real TS 7 impact I found. `tsc -p tsconfig.json` type-checks the current tree with exit 0. React 19.2.0 satisfies `@react-three/fiber@9.8.0`'s peer range (`>=19 <19.4`). `@types/react@19.3.0` against react 19.2.0 is harmless. RA §0's 5.9.3/19.3.0 pins will be updated to match what is installed.

**GATE-8 · Minor · GC-11 portrait generator.** *Resolution:* feasible. Render into a 256² target in the single WebGL context and read back into an `ImageBitmap` cache (LRU 40, about 10 MB), generated when a menu opens. Cost per portrait is Not measured.

---

## 7. Changes I will make to rendering_and_architecture.md

These are my own fixes, and I will apply them after the orchestrator decides the cross-document items.
1. Size-adaptive segments. Bake to rigid `SkinnedMesh` per material class. Revise the LOD tables (CR-1, CR-2).
2. Face atlas: 9 states with L/R cells, 128/64 px cells, 256 on demand, canvas released after upload. This fixes my mirrored-highlight error (CD-1).
3. Terrain: cave kit and trimesh overhangs, 256 samples for mountain zones, vista layer, zone camera overrides (WD-1, WD-2, WD-4).
4. Wild-creature count is profile-independent, with animation-rate LOD and a revised animated-character budget (WD-3).
5. No runtime light add or remove. The battle fill light and cave lights are permanently present (CR-6, CD-2). Lighting techniques as listed in CD-2.
6. Presenter time-warping to SY `impactMs` and CD caps. Reduced motion ×0.5. Battle-local weather (SY-1 to SY-3).
7. Adopt QA flag and script names, GATE role vocabulary, `ClipDef` data curves, texture factory and mask-hash procedure (QA-2, GATE-1, GATE-5).
8. Clock bands from WD. 4 s encounter immunity (WD-8, WD-9).
9. Record the installed TS 7.0.2 and React 19.2.0. Replace any TS-compiler-API use with a Babel or oxc parser (GATE-7).

## 8. Open items for the orchestrator

1. Reconcile the CD and WD zone attunements, trial hosts and names (WD-6). This blocks zone data.
2. Set one timing authority for attacks (SY-1).
3. Choose the canonical face frame set and sizes (CD-1).
4. Choose between the stage-1 height floor and the CC-03 distance change (CR-5).
5. Name the physical reference devices (QA-3). Until measured, all FPS targets remain **Not measured**.
