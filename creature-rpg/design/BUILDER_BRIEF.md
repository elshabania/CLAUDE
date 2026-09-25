# Species builder brief (implementation)

You implement bespoke procedural 3D species for *Wildchord* from the build-spec tables in `design/creatures.md` §4. Working dir: `/home/user/CLAUDE/creature-rpg`.

## What to produce
One file per species: `src/creatures/species/cXX.ts` exporting `export const cXX: SpeciesVisual = {...}`. The registry auto-discovers it (`src/creatures/registry.ts`). **Edit only your own species files.** Do not edit `assemble.ts`, `anim.ts`, `face.ts`, `materials.ts`, `primitives.ts`, the registry or other agents' species. If you truly need a new primitive/feature, implement it as a helper inside your own species file (e.g. build a custom `[number,number][]` lathe profile inline) or report the need back.

Reference implementation: `src/creatures/species/c01.ts` (read it first), and the DSL in `src/creatures/assemble.ts` (`SpeciesVisual`, `PartDef`, `Prim`, `RigParams`).

## DSL cheat-sheet
- All dimensions and offsets are **multiples of H** (species height in metres, creatures.md §0 "H"). Rotations in degrees `[pitch(X), yaw(Y), roll(Z)]`, XYZ order. Creature faces **+Z**; **+X is the creature's left**; origin on the ground under the body.
- `mirror: true` makes `name_L` (x as given) and `name_R` (x negated, yaw/roll negated). Children of a mirrored parent that are also `mirror: true` attach to the same side automatically. Tags `gait:FL/BL/L` become `FR/BR/R` on the `_R` copy automatically — so write the LEFT side only.
- Primitives: `sphere r|[rx,ry,rz]` (centered) · `capsule r,len,(r2)` (base at origin, extends **+Y**) · `cone r,h` (base at origin, tip +Y) · `cyl r,h,(r2 top)` (+Y) · `box w,h,d` (centered) · `torus R,r,(arc°)` (in XY plane) · `lathe profile,h,rmax,axis` (profile ids in primitives.ts PROFILES or inline `[r,h][]` pairs; axis 'y' default, 'z' lays it along +Z, '-z') · `extrude shape,w,h,depth` (shape ids in primitives.ts SHAPES: X_sail, X_delta, X_sailfin, X_fin_crescent, X_fan, X_leaf, X_samara, X_hexplate, X_flake6, X_flame_tuft, X_strip, X_corona, X_ear, X_wing, X_heart_leaf, X_disc, X_rect, X_tri; outline is in the XY plane, extruded along Z) · `tube pts[[x,y,z]...],r0,r1` · `eye r` (bulged disc facing +Z, painted from the species `eye` spec) · `mouth r,(w)` (painted decal disc facing +Z) · `none` (empty pivot).
- To point a +Y primitive somewhere else, rotate it: pitch 90 → +Y points to +Z (forward); pitch −90 → +Y points to −Z (back); pitch 180 → points down; roll −90 → +Y points to +X (left)…
- `chain: {n, r0, r1, len, bend}` builds `name0..name{n-1}` tapered capsule segments (each along its local +Y, parented to the previous), plus a `nameTip` empty at the end. Orient the whole chain with `rot` (e.g. tail backwards: `rot: [-100,0,0]`); `bend` is a per-segment rest rotation (curl). Attach things to the tip with `parent: 'tailTip'`.
- Slots: `P`, `S`, `A`, `D` (dark), `W` (white-ish), with `+`/`−` suffix for lighter/darker; or a literal hex `'#rrggbb'`. `colors` map on the species defines P/S/A/D/W.
- Materials: species default `mat` plus per-part `mat` from presets `FUR, SCALE, SHELL, STONE, METAL, ICE, MEMBRANE, PAPER, SKIN_WET, GLOW, SKIN, CLOTH, HAIR, CRYSTAL`. `emissive: <intensity>` makes a part glow in its slot colour (0.4–2.0 typical; clip gain modulates it). `opacity`, `fluffy` (vertex-noise amplitude ×H, e.g. 0.01), `flat` (flat shading, good for paper/stone facets).
- `lod: 0` marks tiny accessories dropped at far LOD — **never** on silhouette features (horns, sails, crests, rotors, fork tails, rings…).
- Anim tags: `br` breathing (torso), `look` head look-around, `gait:FL|FR|BL|BR|L|R|A..F` leg swing phase, `wave` on chains (travelling wave; set `rig.waveAxis` yaw/pitch/roll), `flap` (wings/flaps, auto side sign), `jaw` (opens on attack), `spin` (rotors, `rig.spinHz`), `sway`, `orbit`, `fx:<anchor>` (named VFX anchor e.g. `fx:fork`, `fx:mouth`, `fx:core`, `fx:horn`).
- `rig`: `type` QUAD|BIPED|CHAIN|WING|FLOAT|RADIAL|BALL|FLAT, `attack` style lunge|spin|dive|slam|cast|whip|roll|rear|coil (and `special`), `gaitHz`, `stride`°, `bounce`, `breath`, `breathHz`, `waveAmp`°, `waveHz`, `flapAmp`°, `flapHz`, `stepped` (fps — **12 for the f09 shade family**), `faint` side|forward|sink|collapse, `hop`, `lean`°, `spinHz`. `hoverGap` (×H) lifts floaters.
- Face: `eye: {shape round|almond|long-almond|droopy|teardrop|halfmoon|keystone|hole, iris, irisRatio, pupil round|v-oval|h-bar|ring|none, pupilRatio, highlights 1–3, lid 0–0.6, lidAngle°, sclera?, glow?}`, `mouth: {style smile|beak|fang|line|o|none}`. The painter renders 8 expression states automatically. Eye discs must sit **on** the head surface (place the disc centre slightly inside the head radius so the bulge shows; face them outward with yaw ±25–40° for side-set eyes).

## Quality bar (character direction — this is gated)
- Appealing, expressive, readable: big clear eyes on stage 1, strong silhouette, the family **motif** and the species' **hero feature** clearly visible (creatures.md §3 and §7.3 must-read features).
- Every stage is anatomically distinct (different body plan) — never a rescale/recolour of a sibling.
- Match the spec's colours (use the v2 hex if creatures.md has been updated with "(v2)" rows), proportions and part list. You may simplify tiny parts or add small fixes so it looks good, but keep every silhouette feature.
- Budget: ≤ ~120 parts per species; use chains for tails/necks/arms.

## Verify visually (required)
A Vite dev server runs at http://localhost:5173 (start it if not: `npx vite --port 5173 --strictPort &`). Screenshot with:
`node scripts/shot.mjs "http://localhost:5173/?tool=viewer&id=cXX" /tmp/claude-0/cXX.png 900 700 2500`
then Read the PNG and iterate until it looks right (front-3/4 view). Also try an action: add `&` … the viewer has buttons; for a quick action check you can temporarily screenshot after clicking with the 6th arg selector, e.g. `"button:has-text('attack')"`. Check `npx tsc -p tsconfig.json` passes. Look at the whole roster sheet at `?tool=sheet` if useful.

## Report back
For each species: file path, part count, any spec deviations and why, and a one-line description of how it reads on screen. Do not claim anything you didn't check.
