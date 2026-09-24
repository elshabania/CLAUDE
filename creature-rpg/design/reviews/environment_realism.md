# Environment realism pass

Owner: environment/rendering art. Date: 2026-09-24.
Direction: **realistic world, stylised creatures.** Humans and creatures are out of scope (`src/creatures/**` untouched).

**Nothing here was measured on real hardware.** Screenshots come from headless Chromium using SwiftShader (software GL), so none of them say anything about speed. Every cost below is either a count (triangles, draw calls, texture sizes, bytes) or a CPU timing taken in Node or in the dev build.

## Before / after

All shots were taken at 1200×800 with `scripts/shot.mjs`-equivalent capture using the same URL parameters (`?tool=zone&id=<zone>&shots=1&quality=high`, plus the listed extras). They are in the session scratchpad at `…/scratchpad/env/`:

| Zone / params | Before | After |
|---|---|---|
| town_1 | `before_town_1.png` | `after_town_1.png` |
| route_1 | `before_route_1.png` | `after_route_1.png` |
| route_1 `clock=1130` (dusk) | `before_route_1_clock1130.png` | `after_route_1_clock1130.png` |
| route_1 `clock=60` (night) | `before_route_1_clock60.png` | `after_route_1_clock60.png` |
| forest | `before_forest.png` | `after_forest.png` |
| lake | `before_lake.png` | `after_lake.png` |
| volcano | `before_volcano.png` | `after_volcano.png` |
| snowpeak | `before_snowpeak.png` | `after_snowpeak.png` |
| cave | `before_cave.png` | `after_cave.png` |
| route_3 (fen) | `before_route_3.png` | `after_route_3.png` |
| town_1 `quality=mobile` | `before_town_1_qualitymobile.png` | `after_town_1_qualitymobile.png` |
| route_1 `quality=balanced` | — | `after_route_1_qualitybalanced.png` |

Extra views: `t9_route_1_pitch0.02.png` (sky and clouds), `t10_lake_x-60_z0.png` (water), `t13_volcano_x-42_z58.png` (lava), `t7_town_1_clock60.png` (lit windows at night).

What changed on screen:
- **Ground:** flat vertex colour became textured grass, packed dirt with gravel, leaf litter, ash, snow and sand/mud, all with normals. Paths look worn and have ragged edges. Cliffs are rock, triplanar at cliff scale.
- **Vegetation:** a lawn of dense grass blades now moves in the wind. Low-poly blobs became branching trees with bark and leaf-card canopies, and there are weeping willows, snow-laden conifers and real hedges.
- **Buildings:** boxes became half-timbered houses. They have plaster, timber frames and braces, clay-tile roof slabs with eaves and ridge, framed and glazed windows (lit at night), shutters, and stone plinths and chimneys.
- **Sky and lighting:** a physical sky with a sun disc and moving clouds. HDRI image-based light replaces the flat hemisphere fill, and dusk and night are graded.
- **Water:** Fresnel reflections of the environment, depth colour and a soft shore. Volcano basins are lava.

## What changed (code)

### 1. Image-based lighting and sky — `src/world/atmosphere/{environment.tsx,Atmosphere.tsx}`
- **HDRIs.** Five CC0 Poly Haven HDRIs come from `@pmndrs/assets` as lazy chunks (see CREDITS): park, forest, dawn, sunset and night.
- **Phase blending.** The day/night curve in `dayNight.ts` still drives everything. `phaseAt()` blends two HDRIs at a time (night → dawn → biome day → sunset → night). The biome day map is forest for forest and fen, park elsewhere.
- **Blend and PMREM.** A 512×256 blend shader, then PMREM, writes `scene.environment`. The blend shader:
  - rotates each HDRI so its brightest sky pixel sits at the game sun's azimuth
  - normalises each map's exposure
  - clamps the HDRI's own sun, since the key light carries direct sun
  - greys the map under overcast weather
  - replaces the HDRI's ground with the zone's ground colour, so bounce light matches the biome
- **Re-bake cadence.** The environment is re-baked only when its signature changes: sun moves about 3°, phase moves 2 %, or the weather changes. `environmentIntensity` follows the curve every frame. Nights have a 0.32 floor so they stay readable.
- **PBR balance.** Key light is the curve value × 1.45. IBL is `ENV_K` 0.5 × the curve's sky luminance. The hemisphere light drops to 0.18× once the environment is live; it is the fallback while HDRIs load, and on Mobile.
- **Sky.** three's own `Sky`, not drei's (the drei version has no clouds): Preetham scattering, sun disc, procedural clouds with coverage by biome and weather. The existing night, star and horizon-fog patch now runs **before** tone mapping, so the horizon matches the scene fog. A twilight floor keeps dusk and dawn zeniths from going black.
- **Tone mapping.** ACES is unchanged at exposure 1.0.
- **Shadows.** three 0.186 removed `PCFSoftShadowMap`, so shadows are PCF with `radius` 2.5 and tighter bias. Contact shading comes from N8AO.
- **Window glow.** `surfaceGlow` drives lit windows from `atmo.glow`.

### 2. Terrain PBR splat — `src/world/surfaces/*`, `src/world/terrain/Terrain.tsx`
- **Texture library.** `bake.ts` renders 16 tileable layers on the GPU into two texture arrays (`WebGLArrayRenderTarget`): A holds sRGB albedo plus height, B holds normal.xy, roughness and AO. The layers are grass, dirt, rock, sand/mud, snow, ash, leaf litter, cobble, plaster, planks, roof tiles, canvas, dressed stone, bark, iron and ice. All noise is lattice-periodic, so every layer tiles seamlessly. Recipes are in `recipes.ts`.
- **Per-vertex weights.** `buildTerrainGeometry` now writes two weight attributes:
  - `aSplat`: ground B, path, cliff, snow
  - `aSplat2`: plaza/cobble, shore, wetness

  Path, plaza and shore edges are frayed with noise.
- **Terrain shader** (`material.ts`, a MeshStandardMaterial patch, so lights, shadows, fog and IBL stay standard):
  - height-aware blending between layers
  - world-space planar UVs; triplanar rock on slopes at cliff scale
  - a second ground sample at 0.29× scale plus macro noise to hide tiling
  - wet darkening near water
  - biome → layer mapping and palette tints in `surfaces/index.ts`. Tints pull the stylised palettes toward natural saturation (`naturalize`).
- **Mip safety.** All samples use `textureGrad`, so dynamic branches don't break mip selection.

### 3. Vegetation — `src/world/vegetation/{Grass.tsx,leafAtlas.ts}`, `src/world/props/{flora.ts,kit.ts,kitMaterials.ts}`
- **GPU grass.** Instanced three-blade tufts in a wrap-around square that follows the camera, so tufts stay fixed in the world and need no CPU updates.
  - A density, tone, height and dryness mask is baked from the terrain splat. It excludes paths, plazas, cliffs, shores, snow, water and building footprints.
  - On High and Balanced there is a dense near ring plus a sparse, wider-bladed far ring, cross-faded. Blades fade out with distance.
  - Wind is travelling gust bands plus per-blade flutter. Blades are back-lit when facing the sun, and receive shadows.
- **Trees and plants.** Procedural generators build broadleaf trees (tree, blossom, hollowtree), conifers (pine, snowpine), willow (a bell-shaped drape of strands), dead trees, bushes, grass clumps, flowers and reeds. They use:
  - tapered, parallel-transported bark tubes with metre UVs
  - alpha-tested cards from a canvas-drawn foliage atlas, stored with straight alpha so edges don't fringe
  - normals bent toward the crown centre for soft volume shading, fake crown AO in vertex colour, translucency, flutter, and alpha scaled with mip level so distant canopies don't thin out
- **Rocks.** Rock, boulder and icerock are welded icospheres displaced by 3-D noise and cut by fracture planes. They carry moss or snow on top (from the palette) and use triplanar rock or ice.
- **Contract.** `buildKind(kind, palette, lowPoly)` keeps the same kinds, colliders and cast/sway flags. `KindDef` gains `mats` (a material slot per geometry group), so an `InstancedMesh` draws bark and leaves in two groups.

### 4. Buildings — `src/world/props/buildings.ts`
- **Surfaces.** Every part has a PBR layer tinted by the authored colours. Flat faces get per-face planar UVs; round parts use their own UVs converted to metres. Timber and stone parts have chamfered edges.
- **Houses.** Plaster walls, timber frame with plates and braces, tile roof slabs with eaves and fascia, ridge cap, gables with a king post. Windows are framed, with glazing bars, sill and shutters. The door has a frame, planks and a handle; there is a stone step and a chimney.
- **Halls and spire.** A stone rotunda with buttresses, tall glazed windows and tiled cone roofs (iron roofs for the forge style), a bell tower, and a portal with a double door.
- **Walls** (optional `ctx`: indoor and biome):
  - hedges when the colour is green
  - dressed masonry indoors
  - noise-displaced rock faces for tall outdoor walls (forest gate, snowpeak rim)
  - planks or timber for wood colours
  - dry-stone rubble with capstones otherwise
- **Contract.** `BUILDERS[kind](params, ctx?)` returns the same `BuiltProp`, with optional `mats`.

### 5. Water and lava — `src/world/water/Water.tsx`
- **Water.** PBR at roughness 0.05, so the sky is reflected from the environment map. Alpha follows Fresnel, colour follows depth by exponential absorption, the normal is six analytic wave trains plus noise, and foam is a faint animated shore band. Fen water is murkier.
- **Lava** (volcano basins). Domain-warped cooling crust plates over emissive seams (HDR, so they bloom), with pulsing heat.

### 6. Post — `src/world/atmosphere/PostFX.tsx`
- **High ("full"):** N8AO (medium quality, full resolution, 1.6 m radius) → SMAA → Bloom (threshold 1.8) → ACES → saturation +0.06 / contrast +0.06 → vignette.
- **Balanced ("light"):** N8AO (performance quality, half resolution) → SMAA → Bloom → ACES.
- **Mobile:** none. The post chunk is never downloaded.

### Quality table (`settingsStore.QUALITY`, new fields)

| | High | Balanced | Mobile |
|---|---|---|---|
| `surfaceRes` (texture-array layer size) | 512 | 512 | 256 |
| `grass.count` / `grass.radius` | 84k blades / 34 m | 36k / 26 m | 9k / 16 m, one ring |
| `post` | full | light | none |
| `cheapSurfaces` (one projection, no anti-tiling sample) | no | no | yes |
| `ibl` (HDRI + PMREM) | yes | yes | **no** (hemisphere fill, no HDRI download) |

`detectQuality()` now forces **Mobile on software renderers** (SwiftShader, llvmpipe), as rendering §6.1 already planned.

## Per-tier cost notes (counts and CPU timings, not GPU measurements)

- **Texture arrays.** 16 layers × 2 arrays × RGBA8 with mips: about 22 MiB at 512² (High and Balanced), about 5.6 MiB at 256² (Mobile). The bake is 32 full-screen passes, submitted in about 30 ms on SwiftShader. They are baked once per canvas (one per zone) and disposed with it by `SurfaceScope`.
- **Foliage atlas.** 1024×512 RGBA, drawn once per session in about 40 ms. The texture is created per zone and disposed with the kit materials.
- **HDRIs.** 147–311 KB gzipped each, lazy-loaded (2–4 per zone, none on Mobile). Parsed data is cached across zones. The PMREM is 256² cube-UV and is disposed with the zone.
- **Grass.** High: 28k tufts × 27 vertices ≈ 0.76 M vertices and 2 draw calls, receive-only shadows. Balanced: about 0.33 M vertices. Mobile: 3k tufts × 21 vertices ≈ 63k vertices, 1 draw, no shadows.
- **Triangles per instanced kind (High / Mobile):**

  | Kind | High | Mobile | Groups (draw calls) |
  |---|---|---|---|
  | tree | 725 | 311 | 2 |
  | pine, snowpine | 863 | 125 | 2 |
  | hollowtree | 1,454 | 780 | 3 |
  | willow | 332 | 189 | 2 |
  | rocks | 320 | 180 | 1 |
  | reeds | 560 | 232 | 1 |
  | bush | 62 | 28 | 1 |
  | flowers | 42 | 16 | 1 |

  Kinds with bark plus leaves cost two draw calls per kind instead of one.
- **Triangles per building:** house 8.3k, house2 13.5k, hearth 8.5k, hall/spire 8.3k (2 groups), bridge 3.7k, crate 1.3k, lamp 0.3k, rock-face wall 1.3k, hedge 156 tris of core plus leaf cards.
- **Scene totals.** Mobile town_1, from the perf overlay: 79 draw calls, about 215k triangles, inside the 300 draw-call / 350k-triangle budget. High was not captured; the composer resets the overlay counters.
- **CPU generation per zone (dev build, SwiftShader box).** town_1 cold: about 450 ms total (bake submit 30 ms, atlas 37 ms, kit 30 ms, 45 buildings about 350 ms). Built props and kinds are memoised, so repeated identical props and later zone visits cost about 25 ms. A `RoundedBoxGeometry.clone()` trap (it re-runs its constructor) was found and fixed; houses dropped from about 170 ms to about 35 ms each.
- **Bundle.** The `PostFX` chunk (N8AO) is now also loaded on Balanced (162 KB gzipped).

## Validation

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run`: 11 files, 99 tests, all passing.
- **QA build** (`VITE_QA=1 vite build`) plus `play-smoke`:
  - The stock script still times out on its 30 s screenshot under SwiftShader, which `human_characters.md` had already recorded.
  - In the game flow, software GL runs at about 150–220 ms per frame with multi-second shader-compile hitches.
  - A scratch copy with 300 s screenshot timeouts and 3× waits passed **all 11 checks**: new game, intro, walk, starter, party, battle start and end, rival flag, menu, continue offered, continue loads. Software GL auto-selected Mobile.
- **Mobile** renders correctly (`after_town_1_qualitymobile.png`).

## Remaining gaps

- **Wind in shadows.** Shadow maps don't sway with the wind; depth materials don't get the wind patch. Leaf shadows are alpha-tested, but static.
- **Terrain paths** are per-vertex splat (1–1.25 m grid). Edges are frayed but can't show wheel ruts or footpath detail finer than a metre. A splat texture or decals would fix that.
- **Rock-face walls** still read as long slabs from some angles. They need end caps and a variety of boulders along the base.
- **Large-scale variation.** Distant rim cliffs pick up some fog wash-out, and there is no distant-vista layer.
- **Water** has no screen-space refraction or reflection, and trees and buildings are not reflected (it reflects the environment map only). Only the shoreline foam is flow-aware.
- **Caves** keep the zone's blue-violet palette mood. The interior IBL uses a tinted forest HDRI at low intensity, and a dedicated cave probe would be better.
- **Detail normals** don't go past texture scale. There are no micro-detail normal layers, and no parallax or POM on cobbles and tiles.
- **Texture variety.** One tree variant per kind, so instances vary only by yaw and scale. Two or three seeds per kind would cut repetition, at the cost of more draw calls.
- **Colour grading** is a fixed saturation and contrast step. A LUT per biome or time of day would be better.
- **Not yet done:** real-GPU timing (RC-L/RC-P1 benches) of the grass and N8AO costs.
- **Other owners' issues seen during QA:**
  - a transient creature-material shader error (`crPerturb` uses `dFdx` in a vertex shader) seen during another agent's in-progress edits
  - the smoke script's 30 s timeouts
