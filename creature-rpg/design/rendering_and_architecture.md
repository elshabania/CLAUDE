# Rendering and Architecture

Owner: Rendering Engineer / technical architect
Status: Design v1 (2026-09-24). Nothing in this document has been measured. Every performance number below is a **target or budget**. None is a result. Measured results go in `design/reviews/perf_*.md` once real reference hardware has run the benchmark in section 7.

Binding inputs: `design/MASTER_PROMPT.md` and `design/ANCHORS.md`. Other design documents were being written in parallel and did not exist when this was written. Places where this document depends on their decisions are listed under Dependencies (section 13).

---

## 0. Verified toolchain (pinned versions)

On 2026-09-24 I checked the versions below against the npm registry (`npm view`). I also read the type definitions from tarballs downloaded with `npm pack` into a scratch directory, which does not touch the project. `node_modules` does not exist in the project, and no packages were installed there.

| Package | Pin | Why this exact pin (verified fact) |
|---|---|---|
| `three` | `0.186.1` | Latest. `postprocessing@6.39.5` has the peer range `three >=0.168 <0.187`, so **three must stay below 0.187** until postprocessing widens that range. |
| `@types/three` | `0.186.0` | Matches three's minor version. |
| `react`, `react-dom` | `19.3.0` | `@react-three/fiber@9.8.0` has the peer range `react >=19 <19.4`. |
| `@react-three/fiber` | `9.8.0` | Canvas props confirmed: `gl` (object, or a sync/async factory), `dpr: number \| [min,max]`, `frameloop: 'always'\|'demand'\|'never'`, `shadows: boolean\|'basic'\|'percentage'\|'soft'\|'variance'\|Partial<WebGLShadowMap>`, `flat`, `linear`, `performance`. |
| `@react-three/drei` | `10.7.8` | Uses `PerformanceMonitor` (`onIncline/onDecline/onFallback/bounds/flipflops`), `Detailed`, `Bvh`, `Sky`, `Preload`, `StatsGl`. **We never use `useDetectGPU`.** It depends on `detect-gpu`, which fetches benchmark data from a CDN at runtime, and that is a network dependency we refuse. |
| `@react-three/rapier` | `2.2.0` | Bundles `@dimforge/rapier3d-compat@0.19.2`. `Physics` props confirmed: `timeStep: number\|'vary'`, `paused`, `interpolate`, `updatePriority`, `updateLoop: 'follow'\|'independent'`, `gravity`, `numSolverIterations`, `debug`. Hooks confirmed: `useRapier`, `useBeforePhysicsStep`, `useAfterPhysicsStep`, `interactionGroups`. `HeightfieldCollider` args: `[widthSubdivs, depthSubdivs, heights[], scale{x,y,z}]`. It has no flags slot, and its scale handling is buggy (see 3.1), so the terrain collider is created imperatively instead. |
| `@dimforge/rapier3d-compat` | via above (`0.19.2`) | Confirmed: `world.createCharacterController(offset)`, `KinematicCharacterController.enableAutostep(maxHeight, minWidth, includeDynamicBodies)`, `enableSnapToGround(distance)`, `setMaxSlopeClimbAngle(rad)`, `setMinSlopeSlideAngle(rad)`, `setSlideEnabled`, `setApplyImpulsesToDynamicBodies`, `setUp`, `computeColliderMovement(collider, delta, flags?, groups?, predicate?)`, `computedMovement()`, `computedGrounded()`. `world.castShape(pos, rot, vel, shape, targetDistance, maxToi, stopAtPenetration, flags?, groups?, excludeCollider?, excludeBody?, predicate?)` and `world.castRay(ray, maxToi, solid, ...)`. `ColliderDesc.heightfield(nrows, ncols, heights: Float32Array, scale, flags?)` with heights in **column-major** order. The compat build inlines its WASM: `rapier.mjs` is 2.24 MB raw, **~836 KB gzipped** (measured with `gzip -c \| wc -c` on the tarball file). That size is why Rapier is lazy-loaded (section 6.3). |
| `@react-three/postprocessing` | `3.1.2` | Peer `@react-three/fiber >=9.7.0`, `postprocessing ^6.36`. Effects confirmed: `Bloom`, `SMAA`, `FXAA`, `Vignette`, `DepthOfField` (`target`, `worldFocusDistance`, `worldFocusRange`, `bokehScale`), `ToneMapping`, `SSAO`, and `N8AO` (exported from `passes/N8AO`: `halfRes`, `quality`, `aoRadius`, `distanceFalloff`, `intensity`, `aoSamples`, `denoiseSamples`). `EffectComposer` props: `multisampling`, `resolutionScale`, `frameBufferType`, `enableNormalPass`. |
| `postprocessing` | `6.39.5` | Peer of the above. |
| `zustand` | `5.0.15` | `zustand/vanilla`, `zustand/react`, `zustand/middleware` (`subscribeWithSelector`), `zustand/shallow`. |
| `tone` | `15.1.22` | Confirmed: `start()`, `getTransport()`, `getDestination()`, `getContext()`, `Channel`, `CrossFade`, `Offline`/`OfflineContext`, and the `lookAhead` and `latencyHint` context options. We use the `get*()` accessors, not the legacy `Tone.Transport` singletons. |
| `zod` | `4.x` (latest `4.6.5`) | v4 API: `z.object`, `z.discriminatedUnion`, `safeParse`, `z.toJSONSchema`. |
| `vite` | `8.x` (latest `8.3.1`) | `@vitejs/plugin-react@6.1.1` requires `vite ^8`. |
| `vitest` | `5.0.1` | Peer `vite ^6.4 \|\| ^7 \|\| ^8`. |
| `@playwright/test` | **`1.56.1`** (not the latest, 1.63) | The container's preinstalled browsers are `/opt/pw-browsers/chromium-1194` and `chromium_headless_shell-1194`. Revision 1194 is Chromium 141.0.7390.37, which is what `playwright-core@1.56.1`'s `browsers.json` expects. 1.57 expects revision 1200, which is not installed and cannot be assumed downloadable. |
| `typescript` | `5.9.3` | The npm `latest` tag is now `7.0.2` (the native compiler). This project pins 5.9.3 for editor and plugin stability. Upgrading is listed under Unresolved questions. |

Three.js facts used below, verified in `three@0.186.1` source: `InstancedMesh.computeBoundingSphere/computeBoundingBox` account for instances. `BufferGeometryUtils.mergeGeometries` exists. `ACESFilmicToneMapping`, `AgXToneMapping` and `NeutralToneMapping` exist. `WebGLRenderer.compileAsync(scene, camera)` exists and uses `KHR_parallel_shader_compile`. `renderer.info.render.{calls,triangles}` and `info.memory.{geometries,textures}` exist. The `CSM` addon is at `three/addons/csm/CSM.js`. The `Sky` addon exists.

---

## 1. Module layout, data flow, state machines

### 1.1 Directory tree

```
creature-rpg/
  index.html                       viewport-fit=cover, <div id="root">, no external fonts or CDN
  vite.config.ts                   manualChunks (see 6.3), worker config
  vitest.config.ts                 environment: node only (no jsdom/happy-dom; UI logic tested via pure reducers)
  playwright.config.ts             chromium only, executablePath from /opt/pw-browsers if present
  src/
    main.tsx                       React root; mounts <App/>
    app/
      App.tsx                      one <Canvas> + <UiRoot/>; top-level error boundary
      appMachine.ts                app state machine (pure reducer, see 1.4)
      bootstrap.ts                 storage probe, quality detect, settings load, data load
    sim/                           PURE. No imports from three, react, tone, zustand, DOM, window, Date, Math.random
      rng.ts                       seeded PRNG (sfc32) with serializable state
      battle/
        engine.ts                  createBattle(), chooseAiAction(), resolveTurn(), applyDecision()
        events.ts                  BattleEvent union (1.3)
        damage.ts, status.ts, weather.ts, capture.ts, ai.ts, turnOrder.ts
        battleMachine.ts           battle state machine (pure reducer, see 1.5)
      progression/
        xp.ts, evolution.ts, learnset.ts, rewards.ts, economy.ts
      world/
        encounters.ts              encounter roll from tables (zone, time phase, weather) -> species+level
        quests.ts, flags.ts        quest/flag evaluation (pure)
        clock.ts                   game-clock phase from committed time value
      instances.ts                 creature instance factory (unique ids from seeded counter)
    data/
      content/*.json               creatures, moves, types, items, encounters, zones, quests, dialogue, trainers, progression
      schemas/*.ts                 zod schemas, one per file; exported inferred types
      validate.ts                  schema + cross-reference validation (ids exist, learnsets reference moves, ...)
      index.ts                     typed, frozen, validated content registry (Object.freeze deep in dev)
    world/                         overworld presentation (R3F)
      ZoneScene.tsx                driven by ZoneSpec; mounts terrain, water, vegetation, props, actors, sensors
      terrain/  heightfield.ts (pure, worker-safe), TerrainMesh.tsx, terrainMaterial.ts
      water/    WaterSurface.tsx, waterMaterial.ts, normalNoise.ts
      vegetation/ scatter.ts (pure, worker-safe), VegetationLayer.tsx, windChunk.glsl.ts
      props/    procedural prop builders (rocks, fences, houses, signposts, trial buildings, field-action objects)
      actors/   TrainerController.tsx, FollowerCreature.tsx, WildCreature.tsx, NpcActor.tsx, wildAi.ts, navGrid.ts
      camera/   ThirdPersonCamera.tsx, BattleCameraDirector.ts, shots.ts
      lighting/ SunRig.tsx, dayNight.ts, fog.ts
      weather/  RainField.tsx, SnowField.tsx, FogBanks.tsx
      post/     PostStack.tsx
      battle/   BattleStage.tsx, BattlePresenter.ts (timeline), vfx/*
      workers/  zoneGen.worker.ts (heightfield + scatter + navgrid)
      resources.ts                 ResourceScope (dispose tracking)
    creatures/
      contract.ts                  CreatureBuilder types (section 4.1)
      registry.ts                  speciesId -> builder (lazy import per family chunk)
      primitives/                  capsule, lathe profiles, tapered tube, ear/horn/fin/wing generators, merge helpers
      materials/                   material library (fur, scale, shell, skin, glow, eye), rim-light chunk
      face/                        face atlas painter (canvas), FaceRig
      anim/                        clip runtime, blend layers, standard clip library, clip events
      species/f01/c01.ts ... f10/c30.ts   30 bespoke builders + per-family motif helpers
      lod.ts, cache.ts             LOD tiers, ref-counted model cache
      trainers/                    trainer/NPC builders (same contract; humanoid part set)
    ui/                            React DOM overlays only; the encyclopedia viewer places a drei <View> tracking a DOM rect (8.1), its only R3F usage
      screens/ Title, Hud, Dialogue, BattleUi, PartyMenu, Bag, Storage, Encyclopedia, Map, Journal, Settings, Shop, Results, Evolution
      input/   InputManager.ts, keyboard.ts, pointer.ts, touch.ts, gamepad.ts, contexts.ts
      components/, theme/, i18n/strings.en.json
      perf/    PerfOverlay.tsx
    audio/
      AudioDirector.ts, MusicDirector.ts, sfx.ts, cries.ts (param synthesis), buses.ts, songs/*
    persistence/
      saveSchema.ts                zod envelope + payload schemas per version
      migrations.ts                v1->v2->... chain
      storage.ts                   localStorage adapter with probe, quota handling
      saveManager.ts               atomic write, load with recovery, export/import
      checksum.ts                  FNV-1a 32-bit over canonical JSON
    state/
      appStore.ts                  app machine state
      gameStore.ts                 COMMITTED game state (the only thing saved)
      sessionStore.ts              volatile exploration state (zone runtime, encounter lock, wild roster)
      battleStore.ts               sim BattleState + presenter "displayed" state
      settingsStore.ts             settings (saved under its own key)
      selectors.ts
    bench/                         scripted traversal/battle bots, metric collector (URL-flag gated)
    tools/                         silhouette/face capture scenes; URL-flag gated, lazy-imported chunk (never in the entry chunk)
  tests/
    unit/sim/**, unit/progression/**, unit/persistence/**, unit/creatures/** (builder contracts in node with three, no WebGL)
    data/validate.test.ts         runs data validator over content/
    arch/boundaries.test.ts       import-graph rule checks (1.2)
    fixtures/saves/v1.json ...    frozen historical saves for migration tests
    fixtures/battles/*.json       seeded battle scripts + expected event logs (golden)
    smoke/*.spec.ts               Playwright
    tools/silhouettes.spec.ts, tools/characterGate.spec.ts
  scripts/check-bundle.mjs         gzip size check against budgets
```

### 1.2 Dependency rules, enforced by `tests/arch/boundaries.test.ts`

The test parses import statements with a regex over `src/**`. Any violation fails CI.

| Module | May import | Must NOT import |
|---|---|---|
| `sim/` | `sim/`, type-only from `data/schemas` | three, react, @react-three/*, tone, zustand, `world/`, `ui/`, `audio/`, `persistence/`, `state/`. It also must not reference the globals `window`, `document`, `Date`, `Math.random` or `performance` (checked by regex). |
| `data/` | zod, `data/` | everything else |
| `persistence/` | `data/schemas`, `sim/` types, zod | three, react, tone |
| `creatures/` | three, `creatures/`, `data/` types | react, rapier, `sim/`, `state/` |
| `world/` | three, R3F, drei, rapier, postprocessing, `creatures/`, `state/`, `sim/` (read-only calls), `data/` | `persistence/` (it saves through `state/` actions only) |
| `ui/` | react, `state/`, `data/`, `sim/` pure helpers (e.g. damage preview text) | rapier, tone (it plays sounds through `audio/` facade functions only) |
| `audio/` | tone, `state/` (subscribe), `data/` | three, react |
| `state/` | zustand, `sim/`, `data/`, `persistence/` | three, tone |

### 1.3 Data flow and the sim/presentation boundary

```
 data/content/*.json --zod+xref validate--> ContentRegistry (frozen)
                                               |
         +-------------------------------------+-------------------------+
         v                                                               v
   sim/* pure functions  <-- decisions --  state/ stores  --subscribe-->  world/ (R3F), ui/ (DOM), audio/
         |                                   ^     |
         | returns {nextState, events[]}     |     +-- commit() --> persistence/saveManager (checkpoints only)
         +-----------------------------------+
```

The battle sim API lives in `sim/battle/engine.ts`. It is pure and synchronous, and it is fully deterministic given the content registry, the setup and the RNG state.

```ts
createBattle(setup: BattleSetup, seed: number): BattleState      // setup: player party snapshot, opponent (wild|trainer), zone attunement, weather, difficulty
chooseAiAction(state: BattleState): Action                        // reads only the opponent side's view; never the pending player action
resolveTurn(state: BattleState, player: Action, ai: Action): { state: BattleState; events: BattleEvent[] }
applyDecision(state: BattleState, d: Decision): { state; events } // forced switch, move-replace prompt, nickname etc.
```

`BattleState` holds `rngState` (four uint32 values), so replaying from a snapshot is exact. The engine never mutates its input. It uses structural copying, and the test suite deep-freezes inputs.

`BattleEvent` is a discriminated union. Every event has a `seq` number and a `side`:
`turnStart, actionOrder, switchOut, switchIn, moveUsed, moveMissed, moveFailed, damage{target, amount, hpBefore, hpAfter, effectiveness, crit, attuned}, heal, statusApplied, statusCured, statusTick, statChange, weatherStart, weatherTick, weatherEnd, traitTriggered, itemUsed, captureAttempt{deviceTier, shakes:0..3, success}, fleeAttempt{success}, faint, forcedSwitchRequired{side}, xpGain, levelUp{newStats}, moveLearnPrompt{moveId}, moveLearned, evolutionQueued{from,to}, rewardGranted, message{key, params}, battleEnd{outcome: 'win'|'loss'|'fled'|'captured'}`.

The **BattlePresenter** (`world/battle/BattlePresenter.ts`) consumes `events[]` and builds a **timeline** of cues. Each cue has a start time, a duration and a track: `camera`, `anim`, `vfx`, `sfx`, `hpBar`, `text`, `face`. A mapping table in the presenter covers each event type. For example, `moveUsed` becomes: a camera shot on the attacker (0.35 s), then the attacker's `attack` clip. The clip's `impact` event at normalized time `t_i` triggers the move's VFX and SFX. The following `damage` event is scheduled at that impact time.

Timing rules:
- Cue durations are in seconds of presentation time. The "text speed" and "battle animations: full/reduced/off" settings scale them. Reduced motion replaces camera cuts that move with cross-dissolves and holds.
- The presenter drives `battleStore.displayed`, which holds HP bars, status icons and the visible creature. It does this with `applyEventToDisplayed(displayed, event)`, a **pure** reducer.
- Invariant: applying all events of a turn to the previous displayed state gives exactly the sim's post-turn values for HP, status, active creature and faint flags. A property test runs this over 1,000 seeded random battles.
- Skipping or fast-forwarding a timeline applies the remaining events instantly through the same reducer, so presentation can never drift from the sim.
- The presenter never calls sim functions. Only the battle machine (1.5) does.

Exploration uses the same boundary. The sim decides encounter species and level (`sim/world/encounters.ts`, seeded by `gameStore.rngState`). Rendering decides only where and how a wild creature moves around.

### 1.4 App state machine

The app machine is a hand-written, table-driven reducer: `appTransition(state, event) -> state`. An illegal transition throws in dev. In production it logs and is ignored. The unit test enumerates every state and event pair against the table. Three states beyond the brief's list are **additions**: `boot`, `zoneLoading` and `whiteout`.

| State | Entry actions | Events -> next state |
|---|---|---|
| `boot` | storage probe, settings load, quality detect, content validation (dev: throws; prod: pre-validated at build) | `BOOT_OK` -> `title`; `BOOT_FATAL` -> `title` with an error banner (the game can still be played without saves) |
| `title` | title scene, music after first gesture | `NEW_GAME` (confirm if a save exists) -> `zoneLoading`; `CONTINUE` -> `zoneLoading`; `OPEN_SETTINGS` stays in `title` (a UI sub-view) |
| `zoneLoading` | fade out (250 ms), dispose the old zone scope, generate the new zone (worker), `compileAsync`, spawn the player at the entry spawn, **checkpoint save** (10.4) | `ZONE_READY` -> `exploration`; `ZONE_FAILED` -> `exploration` in the previous zone, with an error toast |
| `exploration` | input context `explore`; wild AI active; the game clock runs | `TALK` / `SIGN` / `TRIGGER_CUTSCENE` -> `dialogue`; `WILD_CONTACT` or `TRAINER_SIGHT` -> `battleTransition`; `OPEN_MENU` -> `menu`; `EXIT_ZONE` -> `zoneLoading`; `FIELD_ACTION` -> `dialogue` (a scripted sequence); `EVOLUTION_READY` (from item use) -> `evolution` |
| `dialogue` | input context `dialogue`; wild AI frozen; the clock is paused | `DIALOGUE_END` -> `exploration`; `DIALOGUE_BATTLE` -> `battleTransition`; `DIALOGUE_SHOP` / `DIALOGUE_HEAL` -> `menu` (shop/heal sub-view) |
| `battleTransition` | lock encounters; freeze all actors; pick the battle stage (2.7); screen wipe (0.8 s, or a 0.3 s dissolve with reduced motion); build battle models; `createBattle` | `BATTLE_READY` -> `battle` |
| `battle` | battle machine (1.5) owns input | `BATTLE_EXIT{outcome}`: if the evolution queue is not empty -> `evolution`; if outcome is `loss` -> `whiteout`; otherwise -> `exploration` (after the **checkpoint save**) |
| `evolution` | full-screen evolution presentation in the current zone; can be cancelled for battle-triggered evolutions if the Systems Designer allows | `EVOLUTION_DONE` (commit + **save**): if the queue has more -> `evolution`; otherwise -> `exploration` |
| `whiteout` | fade to black, heal the party, apply the defeat penalty (Systems), warp to the last healing point | `WARPED` -> `zoneLoading` |
| `menu` | input context `menu`; the world is paused (`frameloop` stays `always` for the menu 3D viewer, and the sim clock is paused) | `CLOSE_MENU` -> `exploration`; `FAST_TRAVEL` -> `zoneLoading`; `USE_EVOLUTION_ITEM` -> `evolution` |

The machine is the only path that changes `appStore.mode`. Components render according to that mode and never set it directly.

### 1.5 Battle state machine

`sim/battle/battleMachine.ts` is also a pure reducer, and it wraps the engine. `intro` and `prompt` are additions to the brief's list.

| State | Meaning | Transitions |
|---|---|---|
| `intro` | send-out presentation | `INTRO_DONE` -> `select` |
| `select` | player picks Fight / Bag / Switch / Run (a submenu for moves, targets or items). **The AI action is computed after the player commits, from `chooseAiAction(state)`. That function only sees public state and the AI's own side, and it receives no player action.** | `COMMIT(action)` -> `resolve` |
| `resolve` | synchronous `resolveTurn` produces events (0 frames) | always -> `animate` |
| `animate` | presenter plays the timeline | `TIMELINE_DONE`: if an event `forcedSwitchRequired{player}` is pending -> `forcedSwitch`; if `captureAttempt.success` -> `capture`; if `battleEnd` -> `end`; otherwise -> `select`. `PROMPT` (move-learn / level-up choice) -> `prompt` |
| `prompt` | modal decision mid-timeline (e.g. replace a move) | `DECIDE(d)` -> `applyDecision` -> back to `animate` (resume the timeline) |
| `forcedSwitch` | the player's active creature fainted; they must choose a non-fainted party member. Run is disabled here. If no member is left, the sim already emitted `battleEnd{loss}`. | `COMMIT(switch)` -> `resolve` (the switch-in resolves with no opposing action) |
| `capture` | post-capture flow: nickname (optional), then party (if under 6) or storage placement (full storage: see Systems/World; the capture device is not consumed if storage is full, and capture is not offered) | `CAPTURE_DONE` -> `end` |
| `end` | results: XP distribution, level-ups, learn prompts, rewards, evolution queue | `RESULTS_DONE` -> emit `BATTLE_EXIT{outcome}` to the app machine |

Test obligation: golden event logs. `tests/fixtures/battles/*.json` holds seed, setup, action script and expected `events[]`. The sim must reproduce each log byte for byte after `JSON.stringify`.

### 1.6 Stores (zustand 5)

- `gameStore` is the **committed** state and the only thing serialized. It holds: player profile, party (instance ids), instances by id, storage, inventory, money, flags, quest states, encyclopedia seen/caught sets, the current zone plus entry-spawn id, the game clock value, `rngState`, playtime seconds and settings version. Every mutation goes through named actions (`commitBattleResult`, `commitCapture`, `commitEvolution`, `commitPurchase`, `enterZone`, ...). Each action states whether it is a checkpoint (10.4).
- `sessionStore` is volatile and never saved. It holds the wild roster (spawned ids, positions), the encounter lock, the current battle-stage choice, loading progress and the transient field-action state.
- `battleStore` holds the sim `BattleState`, the machine state, `displayed`, the timeline cursor and pending prompts. It is discarded when the battle ends.
- `settingsStore` is persisted under its own key (10.1), and a write happens immediately on change (debounced by 300 ms).
- `appStore` holds the machine state plus the input context stack.

Per-frame rule: **nothing that changes every frame goes through React state.** Player position, camera, input axes and animation time live in mutable refs or plain objects owned by R3F components. Code reads them in `useFrame` via `store.getState()`. The HUD reads position at 4 Hz for the minimap through a throttled transient subscription (`subscribeWithSelector`).

---

## 2. Scene organization

### 2.1 Canvas

There is exactly one `<Canvas>` for the whole app. It is mounted once and never remounted, because remounting loses the WebGL context and all compiled programs.

```
<Canvas
  gl={{ antialias: profile === 'mobile', powerPreference: 'high-performance', stencil: false, depth: true, alpha: false }}
  dpr={[1, profile.dprCap]}
  shadows={profile.shadows ? 'soft' : false}
  frameloop={appVisible ? 'always' : 'never'}
  camera={{ fov: 55, near: 0.1, far: profile.drawDistance }}
  flat={false}>
  <SceneRouter/>   // title backdrop | ZoneScene (+ battle staging) | evolution stage
  <PostStack/>     // section 5.4; not mounted on Mobile
  {perf && <PerfProbe/>}
</Canvas>
```

`antialias` is a context-creation flag. It is chosen at boot from the detected profile. Switching between Mobile and the other profiles in Settings shows "applies after restart" for AA only. Every other setting applies live.

### 2.2 ZoneScene (data-driven)

```
<ZoneScene zone={ZoneSpec} key={zone.id}>              // key forces full unmount on zone change
  <SunRig/> <SkyDome/> <ZoneFog/>
  <Physics timeStep={1/60} interpolate updateLoop="independent" gravity={[0,0,0]}>  // gravity 0: no dynamic bodies need it; the KCC applies its own gravity
    <TerrainCollider/>                                 // heightfield, created imperatively (3.1)
    <StaticPropColliders/>                             // cuboid/cylinder/convex per prop (no trimesh except buildings)
    <ZoneSensors/>                                     // exits, triggers, field-action targets, water volumes
    <TrainerController/>                               // kinematic-position body + KCC
  </Physics>
  <TerrainMesh/> <WaterSurface/> <Vegetation/> <PropsVisual/>
  <FollowerCreature/> <WildCreatures/> <Npcs/>
  <Weather/>
  <ThirdPersonCamera/> or <BattleCameraDirector/>
  <BattleStage/>  (mounted in battleTransition/battle only)
</ZoneScene>
```

There is one Rapier world per zone. `<Physics>` sits under the zone key, so it is created with the zone and destroyed with it. Rapier WASM is initialized once (the first `<Physics>` mount awaits `init()` from the lazy chunk). During `battle`, `<Physics paused>` is set. Physics is overworld-only, per the brief. Battles use no physics.

**Collision groups.** 16-bit membership and filter masks, built with `interactionGroups(membership, filter)`:

| Bit | Group | Collides with (filter) |
|---|---|---|
| 0 | TERRAIN | PLAYER, CAMERA_PROBE |
| 1 | STATIC_PROP | PLAYER, CAMERA_PROBE |
| 2 | PLAYER | TERRAIN, STATIC_PROP, BLOCKER, SENSOR |
| 3 | BLOCKER (invisible walls, zone bounds, field-action gates) | PLAYER |
| 4 | SENSOR (exits, triggers, water volume, trainer sight cones) | PLAYER |
| 5 | CAMERA_PROBE (query only) | TERRAIN, STATIC_PROP |

Creatures (follower, wild, NPCs) have **no colliders**. They are positioned kinematically from sampling functions (2.5, 2.6), so they can never block or push the player. NPCs that must block (for example a guard) get a BLOCKER cuboid.

### 2.3 Trainer character controller

- Body: `RigidBody type="kinematicPosition"` with `CapsuleCollider args={[0.45, 0.35]}` (half-height 0.45 m plus radius 0.35 m, total height 1.6 m).
- Controller setup at mount: `controller = world.createCharacterController(0.02)`. Then:
  - `setUp({x:0,y:1,z:0})`
  - `setMaxSlopeClimbAngle(45°)`
  - `setMinSlopeSlideAngle(50°)`
  - `setSlideEnabled(true)`
  - `enableAutostep(0.35, 0.2, false)`. Steps up to 35 cm. Stairs in data must have riser ≤ 0.3 m and tread ≥ 0.25 m.
  - `enableSnapToGround(0.3)`. Keeps the player stuck to terrain on descents.
  - `setApplyImpulsesToDynamicBodies(false)`
- Step (runs in `useBeforePhysicsStep`, fixed 1/60 s):
  1. Read `InputFrame.move` (a vec2 of length ≤ 1). Rotate it by the camera yaw to get the desired horizontal velocity. Walk speed is 3.4 m/s and run speed is 6.2 m/s. Acceleration is 24 m/s² and deceleration 30 m/s².
  2. Vertical velocity: `vy = grounded ? -1.0 : max(vy - 22*dt, -30)`. The small constant -1 while grounded helps snap-to-ground.
  3. `controller.computeColliderMovement(collider, v*dt, QueryFilterFlags.EXCLUDE_SENSORS, playerFilterGroups)`.
  4. `body.setNextKinematicTranslation(pos + controller.computedMovement())`. `grounded = controller.computedGrounded()`.
  5. Facing: the visual root slerps toward the move direction at 14 rad/s. It does not rotate the capsule.
- No jump in the baseline. Vertical traversal comes from terrain, stairs, ledges (one-way drop-down volumes defined in data) and field actions (Creative Director). This removes a whole class of out-of-bounds bugs.
- Safety nets:
  - If `y < zone.killY` (default terrain min minus 10 m), teleport to the last grounded position more than 1 m from any cliff edge (kept in a 2 s ring buffer). The same applies if the player stays ungrounded for more than 3 s.
  - The zone boundary is a ring of BLOCKER cuboids generated from the zone bounds polygon.
- Visual: the trainer model (a `creatures/trainers` builder) is a child with a locomotion blend (idle/walk/run by speed) and footstep events feeding `audio/sfx`. The surface type comes from the terrain material weights at the feet.

### 2.4 Third-person camera with collision

- Rig state: `yaw`, `pitch` (clamped from -15° to +60°), `distance` (default 5.5 m, range 3 to 8 m via wheel or pinch), pivot = player position + (0, 1.45, 0) smoothed.
- Input: mouse delta in pointer lock, right-drag without it, gamepad right stick at 180°/s, or touch drag on the right screen half. The multiplier comes from `settings.cameraSensitivity` (0.25 to 2.0), and invert-Y is an option.
- Auto-recenter (optional setting, default on for gamepad and touch): after 1.5 s without camera input while moving, yaw eases toward the movement heading at 60°/s.
- Collision, every frame:
  - `world.castShape(pivot, identityRot, dirToDesired * desiredDistance, new Ball(0.25), 0, 1.0, true, undefined, CAMERA_PROBE_GROUPS, playerCollider)`.
  - If there is a hit, `allowedDistance = max(0.8, hit.time_of_impact * desiredDistance - 0.1)`.
  - When `allowedDistance < current`, snap in immediately so the view never goes through a wall. When it grows, ease out with `current += (target-current) * (1 - exp(-6 dt))`.
  - If the pivot itself is inside geometry (a `castRay` up from the player finds a hit within 0.3 m), use a first-person-ish distance of 0.8.
- Smoothing: pivot follow uses `1 - exp(-12 dt)` horizontally and `1 - exp(-8 dt)` vertically, which damps stair jitter. Yaw and pitch are not smoothed, so they stay responsive.
- Occluders: vegetation and small props are not in CAMERA_PROBE. When they come between the camera and the player, they fade with a dithered alpha (a uniform per instance batch) instead of pulling the camera in.

### 2.5 Follower creature (lead party member)

- Trail: the player's foot position is pushed into a ring buffer (capacity 128) every 0.2 m of horizontal travel. Each entry is `{pos, groundY, t}`.
- Target: the point at arc length `followDistance` behind the newest breadcrumb. `followDistance = 1.2 + follower.bounds.radius * 1.5` (clamped from 1.5 to 4 m).
- Motion: move along the polyline toward the target at `min(dist*3, playerSpeed*1.15)`. Y is lerped from breadcrumb `groundY`, because the path the player walked is known to be walkable. Facing follows the tangent. The locomotion clip is picked by speed.
- No collider, no physics query. When the player stands still, the follower idles, turns toward the player at a distance under 1.2 m, and plays occasional idle flourish clips.
- Teleport and poof (VFX puff, no sound spam) happen if it falls more than 12 m behind, if a zone loads, if a battle ends, or if the player teleports.
- Hidden when the lead creature is fainted: the first non-fainted party member follows instead. If none are left, there is no follower.
- Big creatures (bounds height over 2.5 m) use the same logic with a larger `followDistance`. They go semi-transparent while inside the camera's near cone (the same dither fade as occluders).

### 2.6 Wild creature roaming AI

- **Nav grid**, generated in the zone worker: 1 m cells over the zone bounds. A cell is walkable if all of the following hold:
  - terrain slope ≤ 32°
  - height above the water level ≥ 0.15 m (aquatic species use the inverse mask, water-only)
  - no prop footprint
  - not within 6 m of an exit sensor or an NPC
  - inside at least one `wildRegion` polygon from zone data
  
  Cliff avoidance: a cell is also excluded if any 4-neighbour has a height difference over 1.2 m.
- **Spawning**: the sim's `encounters.roll(zone, timePhase, weather, rng)` picks species and level. The presentation picks a walkable cell ≥ 20 m from the player and outside the camera frustum, using a presentation-only RNG, not the sim RNG. Max active wild creatures come from the profile (section 6). A respawn happens 15 to 30 s after one despawns.
- **Behaviour**, per species temperament from `creatures.md`: `wander | curious | skittish | territorial`.
  - Wander: pick a random walkable cell 4 to 10 m away within the region, walk there (straight line checked with a grid DDA; retry up to 3 times), then idle 2 to 6 s.
  - Curious: approach the player within 10 m at walk speed.
  - Skittish: flee to a cell more than 12 m away when the player is within 6 m and running.
  - Territorial: patrol a 6 m radius around its spawn.
  - Movement Y comes from `heightAt(x, z)` (bilinear on the same heightfield array as physics).
- **Contact trigger**: a distance test each frame in `useFrame`, not a physics event: `horizontalDist(player, wild) < 0.35 + wild.bounds.radius*0.8` and `|dy| < 1.5`. It fires only if **all** of these hold:
  - `appStore.mode === 'exploration'`
  - `sessionStore.encounterLock === false`
  - `now >= sessionStore.encounterCooldownUntil`
  - the wild's `state !== 'fleeing' | 'despawning'`
  - the player has moved ≥ 3 m since the last battle ended (the "grace distance")
- **Single-encounter lock**: on the first valid contact, the code synchronously sets `encounterLock = true` in the same tick, before dispatching `WILD_CONTACT{wildId}`. All wild AI freezes, and the remaining contact checks in that frame see the lock. The lock clears only when `battle -> exploration` completes. At that point `encounterCooldownUntil = now + 3 s`, and the grace distance counter resets.
- The engaged wild creature is removed after a defeat or capture. After Run, it plays a flee clip and despawns.
- Test: a unit test simulates two wild creatures overlapping the player in the same frame and asserts exactly one `WILD_CONTACT`.
- Trainers use the same lock. Their sight cones (sensor cylinders) raise `TRAINER_SIGHT`, which runs an approach animation and dialogue before `battleTransition`.

### 2.7 Battle staging in the current zone

- Zone data may list `battleStages: [{pos, yaw, radius}]`. If none is within 25 m of the player, the code computes a stage by searching walkable nav cells within 20 m. The first candidate wins if it passes all of these:
  - a flat 12 m x 6 m rectangle (slope ≤ 8°, height variance ≤ 0.4 m)
  - no props inside
  - not water (unless both creatures are aquatic)
- The terrain is **not** modified. Creature feet are placed with `heightAt`.
- If no candidate is found, a hand-placed fallback stage per zone is used. It is required by data validation: every zone must have at least one `battleStages` entry.
- Layout: the player creature at stage -X and the opponent at +X, 7 m apart plus the sum of both radii. The trainer stands behind the player creature. Vegetation instances within the stage rectangle are hidden (per-instance scale 0 via the instance matrix) for the battle's duration. Wild AI, the follower and NPCs within 30 m are hidden.
- The battle camera director uses shot templates relative to the stage frame (4.7).

### 2.8 Zone lifecycle, resources, streaming

The overworld uses discrete zones, per the anchors. There is no seamless streaming. **ResourceScope** registers every geometry, material, texture and render target created for a zone. On zone unmount it calls `dispose()` on all of them.

Creature models live in a **ref-counted cache** keyed by `speciesId:lod`. Party members' models survive zone changes. The cache evicts at refcount 0 after one further zone transition (a 1-zone LRU grace period).

Load pipeline for `zoneLoading` (all targets are in 6.2):
1. Fade out.
2. Post the `ZoneSpec` to `zoneGen.worker`. It returns transferable `Float32Array`s: heights, normals, splat weights, vegetation instance matrices per chunk, the nav grid bitset and the stage candidates.
3. Build meshes on the main thread (buffer-attribute wrapping only).
4. Build or fetch creature models for encounter-table species at LOD1 and LOD2.
5. `await renderer.compileAsync(scene, camera)` to precompile shaders, avoiding first-frame hitches.
6. Warm up one frame hidden.
7. Checkpoint save.
8. Fade in.

A CPU-side cache keeps the generated arrays of the last 2 zones (≈ 3 MB each), so backtracking skips worker generation.

Leak check: the smoke test runs 10 round trips between two zones. It asserts that `renderer.info.memory.geometries` and `.textures` return to within ±5 of the baseline after the first round trip.

---

## 3. Terrain, water, vegetation, props

### 3.1 Heightfield generation (data -> arrays)

`world/terrain/heightfield.ts` is pure and worker-safe. The same code runs in vitest.

- The grid is `N = 128` subdivisions, so 129 x 129 samples over a zone of `size.x x size.z` metres (for example 160 m, giving 1.25 m spacing). It is **fixed for all quality profiles**, so collision is identical on every device. Zones up to 200 m use N = 160.
- Height:
  ```
  h(x,z) = base + fbm(x,z; seed, octaves 5, lacunarity 2, gain 0.5, frequency f) * amplitude
  ```
  Then `features` are applied in data order. Each feature is a signed-distance shape with a smoothstep falloff:
  - `plateau{polygon, height, falloff}`
  - `crater{center, radius, depth, rimHeight}`
  - `ridge{polyline, height, width}`
  - `path{polyline, width, flattenTo: 'follow'|number, sink}`. Paths are flattened, lowered 5 cm, and painted.
  - `flatten{polygon|circle, height}`. Used for towns, trial buildings and battle stages.
  - `river{polyline, width, depth}`
  - `cliff{polyline, height, sharpness}`
- Noise is a seeded simplex, implemented in-house (about 80 lines). Hash-based, so identical in the worker and in tests.
- Outputs:
  - `heights: Float32Array` in **Rapier column-major order**. A unit test asserts that `heightAt(x,z)` (bilinear on the array) matches `world.castRay` down onto the collider within ±2 cm at 200 random points. This guards against row/column or axis-flip mistakes.
  - Normals (central differences).
  - `splat: Uint8Array` of 4 weights per vertex: grass, dirt/path, rock (slope > 35° or cliff), and a biome-specific fourth layer (sand, snow, ash, moss).
- Render mesh: one `BufferGeometry` per 32 x 32-cell chunk (16 chunks at N = 128, 2,048 tris each, 32,768 total). Chunks get individual bounds for frustum culling. Skirts of 1 m hide cracks from fog-far chunks. There is no geometric LOD, because 33k tris per zone is inside budget on every profile.
- Collider: created **imperatively** in `TerrainCollider` from `useRapier()`:
  ```
  world.createCollider(rapier.ColliderDesc.heightfield(N, N, heights, {x: size.x, y: 1, z: size.z}, rapier.HeightFieldFlags.FIX_INTERNAL_EDGES))
  ```
  It is centred at the zone origin and removed on unmount. `FIX_INTERNAL_EDGES = 1` is confirmed in `rapier3d-compat@0.19.2`, and it stops capsules from catching on triangle seams.

  We deliberately do **not** use `<HeightfieldCollider>`. Reading `@react-three/rapier@2.2.0`'s `scaleColliderArgs` shows two problems:
  - For heightfields it multiplies `scale.x` by the parent's x, y **and** z scale (an upstream bug) and mutates the passed scale object.
  - Its 4-tuple args have no slot for `HeightFieldFlags`.
  
  Rule: no zone collider may sit under a scaled parent.

### 3.2 Terrain material

- `MeshStandardMaterial` extended with `onBeforeCompile`:
  - The splat weights are a vertex attribute.
  - Per-layer albedo is a procedural tileable canvas texture: 512² on High, 256² on Balanced and Mobile, generated once per biome at boot and cached. Layers are packed in a 2 x 2 atlas with padding to avoid mip bleeding.
  - Roughness per layer is a constant.
  - A macro-variation noise term (world-space, low frequency) breaks tiling on High and Balanced.
  - Rock uses triplanar sampling on High only. Balanced and Mobile use planar Y sampling plus a slope-darkening term.
- Fallback when compile fails or a context-lost restore is still pending: plain vertex colours (splat-weighted average colours) with `MeshLambertMaterial`.

### 3.3 Water

- One or more water planes per zone come from data (`water.level`, `water.regions` polygons, `water.tint`, `water.flowDir`). Each plane is a triangulated polygon subdivided to 2 m (High) or 4 m (others).
- A bake per vertex stores `depth = water.level - heightAt(x,z)` as an attribute, used for shore colour and foam. There is **no depth pre-pass**.
- Shader (`waterMaterial.ts`, `MeshStandardMaterial.onBeforeCompile`):
  - Two scrolling normal maps sampled from one 256² tileable noise normal texture (generated at boot on a canvas from the same simplex noise), each at a different scale, speed and direction.
  - Fresnel mixes the sky colour (the uniform from the day/night rig) with the deep and shallow tint by depth.
  - Specular comes from the sun.
  - Shoreline foam is `smoothstep` on depth plus animated noise.
- Modes by quality:
  - **High**: the above plus small Gerstner vertex waves (2 waves, amplitude ≤ 0.08 m, visual only; the physics water level stays constant) and foam.
  - **Balanced**: two normal layers and foam, with no vertex waves.
  - **Mobile**: one normal layer, no foam animation (static shore tint), and half-res normal texture.
  - **Fallback** (shader compile error or `lowPower` flag): an unlit transparent colour with UV scroll.
- No planar reflections or `Reflector` on any profile. They would double scene draw calls. This is documented as an approximation.

### 3.4 Instanced vegetation with wind

- Scatter runs in the worker. Poisson-disc sampling per vegetation layer (`{kind, density per 100 m², mask: splat layer + slope range + height range, scaleRange, colorJitter}`) uses a seeded RNG, then rejects points inside paths, flatten areas and props. The profile's density multiplier is applied by taking a deterministic prefix of the sampled list: the list is shuffled once, and each profile takes the first `k`. Lowering quality removes plants but never moves them.
- Rendering: one `InstancedMesh` per (vegetation kind x terrain chunk), with `computeBoundingSphere()` after the matrices are set, so frustum culling works per chunk. Chunks beyond `vegetationDistance` are hidden entirely. Grass-type kinds use a shorter distance (`grassDistance`).
- Meshes are procedural: grass tufts (crossed quads with alpha-tested canvas blades; alpha-to-coverage when MSAA is available), bushes (low-poly icospheres with vertex jitter), trees (trunk as a tapered cylinder plus 2 to 4 canopy blobs), reeds, crystals, snow pines.
- Wind is done in the vertex shader via `onBeforeCompile`:
  ```
  sway = sin(uTime*uFreq + dot(instancePos.xz, vec2(0.13,0.17))) * uStrength * heightWeight
  ```
  `heightWeight = position.y / meshHeight` squared, and the offset is applied along `uWindDir`. The CPU uploads nothing per instance per frame. `uStrength` is driven by weather (calm 0.3, rain 0.7, storm 1.0).
- The fade near the camera or player (dither) is a per-kind uniform: the player's world position plus radius.

### 3.5 LOD and culling

- Frustum culling uses three's per-object culling on chunk meshes, instanced chunks, props and creatures.
- The camera `far` plane is `drawDistance` from the profile, and fog is set to reach full density at `0.95 * drawDistance`, so the cut-off is invisible.
- Props use `drei <Detailed distances={[0, d1, d2]}>` with 2 procedural LODs (full, simplified) and a cull. Props smaller than 0.5 m are culled at `min(40 m, drawDistance)`.
- Creatures use the tiers in 4.6.
- `drei <Bvh>` wraps the scene only if raycast-based UI picking is used (for example clicking NPCs). By default interaction is proximity-based, with no raycasts.

### 3.6 Procedural props

Props are pure builders in `world/props/`:

`(params, quality) -> { group, colliderDescs[] }`

Types: rock (deformed icosahedron, 3 seeds), cliff chunk, fence, lamp, signpost, bench, crate, house (box plus roof prism, window decals on a canvas atlas), healing centre, shop, trial building (unique silhouette per trial, specified by the World Designer), bridge, stairs, field-action targets (dormant gate, thornwood, boulder, ice patch, updraft vent...).

Merging: all static props of one material in a chunk are merged into one geometry at zone load with `mergeGeometries`, keeping one draw call per material per chunk. Animated props (lamps glowing, updraft) are separate.

---

## 4. Procedural creature pipeline

### 4.1 Builder contract (`src/creatures/contract.ts`)

```ts
export type Quality = 'high' | 'balanced' | 'mobile';
export type CreatureLod = 0 | 1 | 2;                      // 0 battle/viewer, 1 near overworld, 2 far overworld
export type PartName = string;                            // conventions below
export type AnchorName = 'mouth' | 'eyeL' | 'eyeR' | 'core' | 'head' | 'tailTip'
  | 'hornTip' | 'hitCenter' | 'overhead' | 'captureTarget' | 'feet' | string;
export type FaceState = 'open' | 'blink' | 'closed' | 'happy' | 'hurt' | 'faint' | 'determined' | 'surprised';

export interface CreatureBuildOptions { lod: CreatureLod; quality: Quality; seed?: number }
export interface CreatureModel {
  root: THREE.Group;                         // origin at ground contact centre; +Z forward; 1 unit = 1 m
  parts: Record<PartName, THREE.Object3D>;   // animated pivots; every clip-referenced part must exist at every LOD (may be an empty Object3D at LOD2)
  anchors: Record<AnchorName, THREE.Object3D>; // children of parts, so they follow animation
  face: FaceRig;                             // setState(state, blendSeconds), blink scheduling, look-at offset
  bounds: { box: THREE.Box3; radius: number; height: number; headHeight: number; headRadius: number };
  materials: CreatureMaterialSet;            // for hit-flash, dissolve (capture/faint), rim strength, night boost
  stats: { triangles: number; drawCalls: number; materialCount: number };
  dispose(): void;
}
export type CreatureBuilder = (spec: CreatureVisualSpec, opts: CreatureBuildOptions) => CreatureModel;
```

`CreatureVisualSpec` comes from `creatures.json` (Creature Art Director owns the values): `palette[2..3]`, `materialTreatment`, `bodyScale`, `eyeStyle`, `mouthStyle`, `glowParts`, `motifParams`, and `cry` parameters (for audio).

Part naming (clips depend on it): `root, body, chest, hips, neck, head, jaw, ear_L/R, horn_L/R, crest, tail_0..n, leg_FL/FR/BL/BR (thigh/shin/foot sub-parts optional), arm_L/R, wing_L/R, fin_*, shell`. Species may add parts. The unit test checks that every clip used by the species only references existing parts.

Contract tests (node, no WebGL; three core runs in node):
- all 30 builders exist
- they build without throwing at all 3 LODs x 3 qualities
- the anchors listed above exist
- `bounds` are finite and match `bodyScale` within ±15%
- triangle and draw-call budgets are respected (4.6)
- `dispose()` releases everything (checked by counting `dispose` calls)
- building is deterministic: the same spec and seed give an identical vertex hash

### 4.2 Shared primitive helpers (`creatures/primitives`)

- `capsule(r, len, radialSegs, capSegs)`, `ellipsoid(rx, ry, rz, segs)`
- `latheProfile(points2D, segs)`, for bodies, heads and horns from profile curves
- `taperedTube(curve, radii[], segs)`, for tails, necks and tentacles
- `cone`, `hornSpiral(turns, taper)`
- `extrudedShape(shape2D, depth, bevel)`, for ears, fins, wing membranes and leaves
- `paddedDisc` (eye bulge)
- `mirrorX(part)`, `attach(parent, child, localTransform)`
- `vertexNoise(geometry, amp, freq, seed)`, for organic irregularity
- `paintVertexColors(geometry, fn(pos, normal) -> color)`, for patterns: belly gradient, stripes, spots, tips
- `mergeRigid(parts[])`, which merges geometries that share a parent pivot and material class (fewer draw calls)
- Segment counts are driven by `lod` and `quality` through one table (`segsFor(kind, lod, quality)`), so every builder scales consistently.

### 4.3 Material library (`creatures/materials`)

Each creature uses at most 4 material classes plus eyes and mouth. Colour variation comes from **vertex colours**, not extra materials.

| Class | High | Balanced | Mobile | Notes |
|---|---|---|---|---|
| `fur` | `MeshPhysicalMaterial` roughness 0.85, `sheen 0.6`, `sheenRoughness 0.5`, `sheenColor = palette light` | `MeshStandardMaterial` roughness 0.85, sheen dropped, emissive rim compensates | same as Balanced | fuzzy read comes from sheen plus rim |
| `scale` | Standard roughness 0.45, metalness 0; vertex-colour noise (per-vertex hue/value jitter in a cellular pattern baked by `paintVertexColors`) | same | same | "normal-less": no normal maps; the pattern is in vertex colour |
| `shell` / `plate` | Physical `clearcoat 0.8`, `clearcoatRoughness 0.2`, roughness 0.5 | Standard roughness 0.3 plus higher `envMapIntensity` | Standard roughness 0.35 | glossy highlight approximates clearcoat |
| `skin` / `smooth` | Standard roughness 0.6 | same | same | |
| `glow` | Standard with `emissive` intensity 1.5 to 3.0 (above the bloom threshold) | same | emissive 1.2, no bloom; the colour is pre-brightened | glowing horns, tails, cores |
| `eye` | `MeshStandardMaterial` with `map = faceAtlas`, `emissiveMap = faceAtlas`, `emissiveIntensity 0.35`, roughness 0.2 | same | same | eyes never go dark (4.4) |

A shared rim-light chunk is injected into all creature materials with `onBeforeCompile`:
```
emissive += uRimColor * pow(1.0 - saturate(dot(normal, viewDir)), 3.0) * uRimStrength
```
`uRimStrength` is 0.25 in daytime exploration, 0.45 at night, and 0.5 in battle. Rim is on for every profile, because it costs almost nothing. It is the main tool keeping silhouettes separated from the background.

The environment map is one small PMREM generated from the procedural sky at zone load and at day-phase changes, at most every 30 game-minutes: 256 px on High, 128 px on Balanced, none on Mobile (hemisphere light only).

### 4.4 Faces: atlas textures and emotion states

- Each species has a **face atlas** drawn on a canvas at build time, then cached per species and quality. It is laid out as 4 x 2 cells: `open, blink(half), closed, happy, hurt, faint, determined, surprised`. Each cell holds one eye (mirrored for the other eye via UV flip). Mouths use a separate 4 x 1 atlas: `neutral, open, smile, grimace`.
- Minimum cell size is **128 px on High and Balanced, 64 px on Mobile**, never lower. Mipmaps are on. Anisotropy is 4 on High and 2 on Balanced. The atlas is drawn with a 4 px padded border so mips don't bleed between states.
- Eye geometry: a `paddedDisc` bulged 5% outward on the head surface, with UVs mapped to one cell.
  - State change sets `texture.offset` on a per-instance **texture clone**. `Texture.clone()` shares the underlying `Source`, so the GPU upload is shared.
  - Blinks are scheduled at random intervals of 2.5 to 6 s, 120 ms long (open, half, closed, half, open), suppressed in `faint`.
  - Look-at: the pupil region is offset up to ±0.08 UV toward a target (camera in battle intro, player in the overworld, opponent during attacks).
- Emotion mapping (the presenter drives it from events): `damage` sets `hurt` for 0.6 s. `faint` sets `faint`, held. `moveUsed` sets `determined` during the attack clip. Level-up, capture-release and evolution-done set `happy`. `statusApplied(sleep)` sets `closed`.
- Readability rules (the Creature Art Director owns the art, and this doc owns the enforcement):
  1. Eye diameter ≥ 12% of head height, and pupil-to-sclera luminance contrast ≥ 4.5:1, checked on the atlas by the `gate:character` script.
  2. Eyes exist at **every** LOD, including LOD2, where they are single quads. Eyes are culled only when the projected head height is under 6 px.
  3. The eye material has an emissive floor of 0.35, so night and shadow never black out the eyes.
  4. The battle framing rule (4.7) guarantees projected head size.
  5. Faces are never affected by fog in battle, because `fog: false` is set on eye materials in battle.

### 4.5 Animation system

- A clip is a pure function:
  ```ts
  type Clip = {
    id: string; duration: number; loop: boolean;
    events?: { name: 'impact'|'footL'|'footR'|'cry'|'release'; t: number }[];   // t normalized 0..1
    sample(t: number, p: ClipParams, out: PoseWriter): void;                   // writes local deltas per part
  }
  ```
  `PoseWriter` accumulates `{part, rotEuler delta, pos delta, scale multiplier}` relative to the rest pose captured at build.
- `ClipParams` holds species tuning from data: stride length, bounce, tail sway amplitude, wing-beat frequency, attack style (`lunge | slam | spin | cast | breath`), and a speed multiplier.
- Standard library in `creatures/anim/library/`:
  - `idle` (breathing via chest scale 1 to 1.02, tail sway, ear flicks)
  - `walk`, `run`, `hover`, `swim`
  - `attackPhysical`, `attackSpecial`, `attackStatus`
  - `hit`, `faint`, `capture` (shrink and dissolve toward `captureTarget`), `release`, `victory`
  - `evolveGlow`, `lookAround`
  
  Species builders may register overrides, such as a custom signature idle.
- Blending: `AnimationStack` with three layers:
  - **Base**: locomotion or idle, crossfaded over 0.2 s by speed.
  - **Action**: one-shot clips like attack, hit or victory, with a 0.12 s crossfade in and out and a weight curve.
  - **Additive**: breathing, blink-linked head micro-motion, look-at.
  
  Final transform = rest × base (blended) × action (weighted) × additive. Quaternion slerp is used for rotations.
- Timing is preserved across quality levels. Clips are evaluated on wall-clock presentation time, not frame count. Events fire when the clip's normalized time crosses `t`; if a frame skips over several events, all of them fire in order. LOD2 evaluates only parts that exist at LOD2, with identical event times, and the presenter's timeline is independent of FPS. On low FPS, frames drop but gameplay timing does not stretch.
- Reduced motion: camera shake is off, flash VFX use reduced intensity, and idle amplitudes are ×0.6. Clip durations are unchanged, because gameplay relies on them.

### 4.6 LOD tiers for creatures

| Tier | Used for | Tris budget (per creature) | Draw calls | Face | Parts |
|---|---|---|---|---|---|
| LOD0 | battle, encyclopedia viewer, evolution | ≤ 12,000 (stage-3 large: ≤ 16,000) | ≤ 14 | full atlas, 2 eyes + mouth | all |
| LOD1 | follower, wild within 25 m, trainers' creatures in cutscenes | ≤ 4,000 | ≤ 8 | full atlas | all animated parts; small accessories merged |
| LOD2 | wild 25 m to cull distance | ≤ 1,200 | ≤ 4 | eyes as quads, no mouth | body, head, tail_0, legs merged into body (locomotion via root bob and sway) |

Switching thresholds use screen-space head height with hysteresis: switch to LOD2 below 28 px and back to LOD1 above 34 px. Cull when under 6 px or beyond `creatureDrawDistance`.

### 4.7 Battle camera framing rules (faces readable)

Shot templates are defined in stage space. Each shot computes camera distance from the subject's `bounds`:
```
distance = subjectHeight / (2 * tan(fov/2) * targetScreenFraction)
```

| Shot | Subject | Target screen fraction |
|---|---|---|
| `intro_wide` | both | stage width fills 80% of viewport width |
| `opponent_hero` | opponent | full creature height = 45% of viewport height |
| `player_over_shoulder` | player creature back plus opponent | opponent **head height ≥ 8%** of viewport height |
| `attack_*` | attacker | 40% |
| `hit_*` | target | 35%, with a 4 px (High) or 2 px (other) camera shake unless reduced motion |
| `capture` | device | — |
| `faint` | subject | — |

Size disparity: when one creature is more than 3× the other's height, the default select-phase shot biases to the smaller creature's head, keeping it at ≥ 8%. The large creature may crop above the head.

Lighting in battle: rim strength goes to 0.5. A battle fill light (`DirectionalLight`, no shadows, intensity 0.6 × the night-boost factor) is placed behind the camera, 30° up. Exposure is clamped so the subject's face luminance never drops below the floor from 5.2.

Command-menu UI occupies at most the bottom 30% of the screen on desktop and the right 38% in landscape phone layout. The camera director offsets the frame centre so faces are never under the UI.

---

## 5. Lighting, atmosphere, post

### 5.1 Base rig

- `DirectionalLight` (sun/moon) plus `HemisphereLight` (sky colour, ground colour), with per-zone biome palettes in zone data.
- No other real-time lights, apart from one optional battle fill light. Glowing objects use emissive materials plus bloom.
- The sun's shadow camera follows the player and is snapped to shadow texels to prevent shimmer.
- `renderer.outputColorSpace = SRGBColorSpace`. Physically-correct light units are the three default.

### 5.2 Day/night cycle

- The game clock (`gameStore.clockMinutes`, 0 to 1439) advances only in `exploration`. The default is 1 real second = 1 game minute, so a full day is 24 real minutes. Rate and phase boundaries are Systems/World decisions. Phases: `morning 05:00–09:59`, `day 10:00–16:59`, `evening 17:00–19:59`, `night 20:00–04:59`. `sim/world/clock.ts` exposes `phase(clockMinutes)` for encounter tables.
- Curves are keyframed at 00:00, 05:00, 07:00, 12:00, 17:00, 19:00, 20:30 and 24:00, with smooth interpolation between keys. Each key holds: sun elevation and azimuth, sun colour, sun intensity, hemisphere sky and ground colours plus intensity, fog colour and density multiplier, exposure, sky shader params (`drei <Sky>` Rayleigh/turbidity) and star opacity.
- Night floor for readability: at night the key light becomes the moon (cool, 0.35 intensity), hemisphere intensity ≥ 0.45, and exposure +0.3. The creature rim goes to 0.45. Rule: the face luminance of a creature's eye region, measured by the character-gate capture at night, must be ≥ 60% of its daytime value.
- Interiors, caves and the league (`zone.lighting: 'interior'`) ignore the cycle and use a fixed rig.
- A phase change is a smooth 10 s lerp. The PMREM env map is regenerated at phase change only, in High and Balanced.

### 5.3 Tone mapping and colour

- ACES Filmic. With the post stack (High, Balanced), `gl.toneMapping = NoToneMapping`, and `<ToneMapping mode={ACES_FILMIC}/>` is the last effect. The composer runs a `HalfFloatType` framebuffer, so bloom sees HDR values.
- Without the post stack (Mobile), `gl.toneMapping = ACESFilmicToneMapping` directly.
- `toneMappingExposure` comes from the day/night curve. The UI never goes through tone mapping, because it is DOM.
- Colour-blind safety: creature type colours are always paired with icon and text in the UI (section 8). Nothing here relies on hue alone.

### 5.4 Post stack (`<PostStack/>`)

| Effect | High | Balanced | Mobile | Fallback / notes |
|---|---|---|---|---|
| Composer | `EffectComposer multisampling={0} frameBufferType={HalfFloatType}` | same | **not mounted** | If a composer error or context loss occurs, unmount the post stack and use renderer tone mapping. |
| Anti-aliasing | `SMAA` | `FXAA` | context MSAA (`antialias: true`) at DPR ≤ 1.5 | |
| Bloom | `mipmapBlur`, `luminanceThreshold 1.0`, `intensity 0.6`, `radius 0.7` | same, intensity 0.5, `resolutionScale 0.5` | off; glow materials pre-brightened | Restrained: only emissive > 1 blooms. |
| Vignette | offset 0.3, darkness 0.35 (battle 0.45) | same | off | |
| DOF | battle only, `target` = focused creature head anchor, `worldFocusRange` = creature radius × 2, `bokehScale 2` | off | off | Never in exploration. Off when "reduced effects" is on. |
| AO | `N8AO halfRes quality="performance" aoRadius 1.2 distanceFalloff 1 intensity 1.5` | off | off | Terrain vertex-colour AO bake (cavity from heightfield curvature) is the fallback on all profiles. |
| ToneMapping | ACES | ACES | renderer ACES | |

Runtime guard: if the frame time p95 over a 5 s window stays above 1.25× the budget, `drei <PerformanceMonitor>` first turns off DOF and AO, then lowers the DPR by one step (0.25, floor 1.0), then drops one profile (at most once per zone load; `flipflops={3}` then `onFallback` locks the lower profile for the session). The user's manual override disables automatic stepping-down (6.4).

### 5.5 Fog

Per zone: `fog: {color, near, far}` (linear) or `{color, density}` (exp2). The night and weather multipliers come from the day/night and weather rigs. `far` is tied to `drawDistance` (3.5). Height fog for lake mornings and snow peak: a custom chunk adds `exp(-max(worldY - fogBase, 0) * falloff)` on High and Balanced. Mobile uses standard fog only.

### 5.6 Weather particles

Weather state comes from the sim and zone data (Systems/World), because it affects encounters and battle. Rendering only reads it.

| Weather | Technique | High | Balanced | Mobile | Fallback |
|---|---|---|---|---|---|
| Rain | GPU-only instanced stretched quads in a 30×20×30 m box around the camera. Position is `mod(seedPos + wind*t + gravity*t, box)` in the vertex shader, so there are no CPU updates. | 6,000 drops + splash rings (200) | 3,000, no splashes | 1,200 | screen-space streak overlay (a single fullscreen quad) |
| Snow | same technique, slow fall + sway | 5,000 | 2,500 | 1,000 | overlay |
| Fog banks | 16 to 24 large soft billboards drifting at 1 m/s plus fog density ×1.8 | 24 | 16 | 8 | fog density only |
| Storm | rain + a lightning flash (hemisphere intensity spike 120 ms; muted when reduced motion) | yes | yes | yes | — |

All particle materials use `depthWrite: false` and `transparent: true`, drawn after opaque objects. Each weather type is one draw call, plus one for splashes. Battle VFX particles draw from a separate pool with a cap per profile (section 6).

---

## 6. Quality profiles and budgets

### 6.1 Profiles

| Setting | High | Balanced | Mobile |
|---|---|---|---|
| DPR cap (`dpr=[1,cap]`) | 2.0 | 1.5 | 1.5 (1.25 if auto-downgraded) |
| Context MSAA | off | off | on |
| Shadow technique | CSM 2 cascades × 2048², PCF soft, 80 m | single 2048², 45 m, PCF soft | single 1024², 25 m, PCF; only trainer + creatures + large props cast |
| Shadow fallback | — | — | blob shadow decal (projected circle) under trainer/creatures when shadows are off |
| Draw distance (camera far, fog end) | 220 m | 160 m | 110 m |
| Vegetation density multiplier | 1.0 | 0.6 | 0.3 |
| Vegetation distance / grass distance | 120 / 45 m | 90 / 30 m | 60 / 18 m |
| Creature draw distance | 90 m | 70 m | 50 m |
| Max active wild creatures | 8 | 6 | 4 |
| Terrain texture res / triplanar | 512² / yes | 256² / no | 256² / no |
| Water mode | waves + 2 normals + foam | 2 normals + foam | 1 normal, static foam |
| Weather particle cap | 6,000 | 3,000 | 1,200 |
| VFX particle cap (battle) | 2,000 | 1,000 | 400 |
| Post: SMAA / FXAA / Bloom / Vignette / DOF / N8AO | SMAA, Bloom, Vignette, DOF (battle), N8AO | FXAA, Bloom (½ res), Vignette | none (renderer ACES) |
| Env map (PMREM) | 256 | 128 | none |
| Creature materials | Physical (sheen, clearcoat) | Standard | Standard |
| Face atlas cell | 128 px, aniso 4 | 128 px, aniso 2 | 64 px, aniso 1 |
| Height fog | yes | yes | no |

**Auto-detect** (`app/bootstrap.ts`, no network):
1. Read `navigator.userAgentData?.mobile` or the UA mobile regex, `matchMedia('(pointer: coarse)')`, `navigator.hardwareConcurrency`, `navigator.deviceMemory` (Chromium only), `screen` size × `devicePixelRatio`.
2. Read `gl.getParameter(UNMASKED_RENDERER_WEBGL)` via `WEBGL_debug_renderer_info` if available. It may be absent or sanitized, so treat it as a hint only.
3. Rules:
   - Mobile if coarse pointer and small screen (`min(screen.w,screen.h) < 820` CSS px), or the renderer matches `/Mali|Adreno|PowerVR|Apple GPU/` on a touch device.
   - High if not mobile and `hardwareConcurrency ≥ 8` and the renderer matches a discrete-GPU pattern (`/NVIDIA|GeForce|RTX|Radeon RX|Radeon Pro|Apple M\d (Pro|Max|Ultra)/`).
   - Balanced otherwise.
   - Software renderers (`/SwiftShader|llvmpipe|Software/`) force Mobile and set a `softwareRenderer` flag, shown in the perf overlay and in bench output.
4. Runtime adaptation via `PerformanceMonitor`, as in 5.4.

**Manual override**: Settings → Graphics has Auto / High / Balanced / Mobile, plus individual toggles: shadows, post effects, vegetation density slider, DPR cap slider, reduced effects. Manual choice disables automatic downgrading. The override is persisted in settings.

### 6.2 Budgets

These are targets. None has been measured. Values are per rendered frame at the reference configs in section 7.

| Budget | High | Balanced | Mobile |
|---|---|---|---|
| Draw calls (exploration) | ≤ 350 | ≤ 250 | ≤ 150 |
| Draw calls (battle) | ≤ 250 | ≤ 180 | ≤ 110 |
| Visible triangles | ≤ 1.5 M | ≤ 800 k | ≤ 350 k |
| Texture memory (estimated from created textures, tracked by ResourceScope) | ≤ 256 MB | ≤ 160 MB | ≤ 96 MB |
| Active animated creatures (incl. follower) | 10 | 8 | 6 |
| Particles (weather + VFX) | 8,000 | 4,000 | 1,600 |
| JS main thread per frame (game logic + React + three CPU side, excluding GPU) | ≤ 6 ms | ≤ 6 ms | ≤ 10 ms |
| Physics step (Rapier, 1/60) | ≤ 1.0 ms | ≤ 1.0 ms | ≤ 2.0 ms |
| Sim `resolveTurn` | ≤ 2 ms per turn (off-frame; happens in `resolve` state) | same | same |
| Frame time target | 16.7 ms (60 FPS) | 16.7 ms | 33.3 ms (30 FPS floor) |
| Zone load (fade-out to fade-in) | ≤ 1.5 s | ≤ 2.0 s | ≤ 3.0 s |
| Save write (atomic sequence) | ≤ 20 ms | ≤ 20 ms | ≤ 40 ms |

### 6.3 Download budgets (gzipped, measured on `dist/` by `scripts/check-bundle.mjs`; fails CI when exceeded)

| Chunk | Contents | Budget (gz) |
|---|---|---|
| `entry` | React, zustand, UI shell, title screen, settings, persistence, content registry (JSON) | ≤ 300 KB |
| `render` | three, R3F, used drei modules, postprocessing, world core | ≤ 450 KB |
| `physics` | @react-three/rapier + rapier3d-compat (WASM inlined) | ≤ 900 KB (compat is ~836 KB alone) |
| `audio` | tone + audio director | ≤ 150 KB |
| `creatures-fXX` ×10 | builders per family | ≤ 25 KB each |
| **Title interactive** (entry + render) | | **≤ 750 KB** |
| **Total** | | **≤ 2.0 MB** |

`render` loads in parallel with `entry` via `modulepreload`, because the title has a 3D backdrop. `physics` and `audio` are prefetched right after the title is interactive and awaited on `NEW_GAME` or `CONTINUE`. The title screen needs neither.

There are no binary asset downloads at all: textures are canvas-generated and audio is synthesized. Mobile first-load target: title interactive in ≤ 5 s on a 10 Mbps connection. That is a target and has not been measured.

### 6.4 Fallback for every expensive effect

| Effect | Trigger for fallback | Fallback |
|---|---|---|
| CSM shadows | Balanced, or `PerformanceMonitor` decline | single shadow map → Mobile shadow → blob shadows |
| N8AO | not High, or decline | baked terrain cavity AO |
| DOF | not High, decline, or reduced effects | none (camera framing keeps focus) |
| Bloom | Mobile or decline | pre-brightened emissive colours |
| SMAA/FXAA | Mobile | context MSAA |
| Post composer | Mobile, error, context loss | renderer ACES |
| Water waves/foam | profile | fewer layers → flat UV-scroll |
| Triplanar rock | not High | planar + slope darkening |
| Vegetation wind | Mobile + decline, or reduced motion (off, not reduced) | static instances |
| Grass | Mobile decline | no grass layer; ground texture only |
| Weather particles | cap reached or decline | fullscreen overlay |
| Height fog | Mobile | standard fog |
| PMREM env map | Mobile | hemisphere only |
| Physical materials | not High | Standard + rim |
| WebGL context loss | `webglcontextlost` | pause, show "Restoring graphics…", on restore re-create the zone (ResourceScope rebuild from cached CPU arrays) |
| WebGL2 unavailable | boot | show an unsupported message with specifics. WebGL1 is not supported, since three r163+ removed WebGL1. |

---

## 7. Reference configurations and benchmark procedure

### 7.1 Reference configurations

Every performance claim must name one of these configs and link to a result file. All are currently **Not measured**.

| ID | Device class | Exact spec | Browser | Viewport / DPR | Profile | Pass criteria (targets) | Status |
|---|---|---|---|---|---|---|---|
| **RC-L** "mid-range laptop" | Integrated-GPU laptop, 2022–2023 | Intel Core i5-1235U with Intel Iris Xe (80 EU), **or** AMD Ryzen 5 7530U with Radeon Vega 7 iGPU; 16 GB RAM; Windows 11; on AC power, "Balanced" power mode | Chrome stable (record version) | Maximized window on a 1920×1080 display: viewport ≈ 1920×953 CSS px, DPR 1.0 | Auto (expected Balanced) and forced High | Balanced: avg ≥ 58 FPS, p95 frame time ≤ 20 ms, no frame > 100 ms after warm-up, zone load ≤ 2.0 s | **Not measured** |
| **RC-P1** "modern phone (Android)" | 2022 upper-mid/flagship | Google Pixel 7 (Tensor G2, Mali-G710 MP7, 8 GB) | Chrome stable for Android | Landscape, viewport 915×412 CSS px (address bar hidden via fullscreen), device DPR 2.625, capped at 1.5 by the profile | Auto (expected Mobile) | avg ≥ 30 FPS, p95 ≤ 40 ms, sustained over a 10-minute run (thermal), zone load ≤ 3.0 s | **Not measured** |
| **RC-P2** "modern phone (iOS)" | 2021 flagship | iPhone 13 (A15, 4 GB), iOS 18 or newer | Safari | Landscape, 844×390 CSS px, device DPR 3, capped at 1.5 | Auto (Mobile) | same as RC-P1 | **Not measured** |
| CONTAINER-SW | Build container | Linux, headless Chromium 141 (Playwright rev 1194), SwiftShader/software GL | headless | 1280×720, DPR 1 | forced Mobile | **Functional only**: benchmark completes, metrics file valid, no errors. FPS numbers are recorded but flagged `representative: false` and must never be quoted. | Runnable here |

The container is not representative of any real device. Its numbers prove the harness works and nothing else.

### 7.2 In-game perf overlay

Toggle with `F3` or `?perf=1`. It is a DOM panel updated at 2 Hz. Fields:
- FPS (1 s average)
- frame time p50/p95/p99 over the last 600 frames
- draw calls and triangles. Set `renderer.info.autoReset = false` and reset manually at frame start, so composer passes are summed.
- `info.memory.geometries/textures`, the estimated texture MB (ResourceScope)
- JS heap (`performance.memory.usedJSHeapSize` in Chromium; "n/a" elsewhere)
- physics step ms (timestamp in `useBeforePhysicsStep` → `useAfterPhysicsStep`)
- React commit count per second
- active creatures, particles, the current profile, DPR, the GPU renderer string, and the `softwareRenderer` flag

### 7.3 Benchmark procedure (URL-flag driven)

URL: `/?bench=<traverse|battle|full>&profile=<auto|high|balanced|mobile>&seed=<n>&save=<fixture id>`

1. **Setup.** Loads a fixture save from `src/bench/fixtures` (party of 6 mid-game creatures), forces `seed`, and fixes the clock at 12:00 with clear weather. `bench=full` also runs 19:30 with rain. Input comes from a bot `InputSource` that replays a spline path defined per benchmark zone (`route_2`, `forest`, `town_2`, chosen for their vegetation, water and NPC density). The bot uses the same `InputFrame` path as human input, so the real controller, camera and AI all run.
2. **Warm-up.** 10 s in the first zone, discarded. This covers shader compile, JIT and GC settling. Then 3 zone transitions are made, and their load times are recorded separately.
3. **Traverse sampling.** 60 s per zone. Every frame records `performance.now()` deltas from `requestAnimationFrame`, draw calls, triangles and physics ms. Heap is sampled every 1 s.
4. **Battle.** A scripted wild battle (fixed seed): intro, 5 turns with attack/status/switch, one capture attempt, and results. The whole battle is sampled, and resolve-to-idle latency is recorded per turn.
5. **Output.** `window.__BENCH_RESULT__` contains `{config: {ua, gpu, dpr, viewport, profile, softwareRenderer, buildHash}, zones: [{id, loadMs, fpsAvg, p50, p95, p99, over33msPct, over100msCount, drawCallsAvg/max, trisAvg/max}], battle: {...}, heapMaxMB}`. A "Download results" button saves the JSON. Playwright reads the global in the container.
6. **Reporting.** Results are committed to `design/reviews/perf_<RC-id>_<date>.json` together with a markdown summary. A claim of "60 FPS on RC-L" is valid only with such a file from real hardware.

---

## 8. UI integration and input

### 8.1 DOM overlay

- The layout is `<div id="game">` with `position: fixed; inset: 0`, containing the `<Canvas>` (z 0) and `<UiRoot>` (z 1, `pointer-events: none` at the root). Interactive panels set `pointer-events: auto`.
- UI never lives inside the Canvas (no drei `<Html>` for menus), because DOM text stays crisp at any DPR and is accessible. World-anchored labels (NPC "!" marker, damage popups) are DOM elements positioned from `Vector3.project` at most every frame, written directly to `style.transform`, not React state.
- The encyclopedia 3D viewer renders into the same Canvas via drei `<View>` tracking a DOM rect (one WebGL context). While the viewer is open, the zone scene is paused and hidden (`visible = false`), so the cost is one creature at LOD0.
- Fonts come from bundled system stacks, or one self-hosted WOFF2 if the Creative Director specifies it. No Google Fonts request at runtime.

### 8.2 Input system (`ui/input`)

`InputManager` is a singleton that produces an `InputFrame` each render frame:

```ts
{ move: Vec2; look: Vec2; zoom: number; run: boolean; interact: Edge; cancel: Edge; menu: Edge;
  confirm: Edge; navUp/Down/Left/Right: Edge; fieldAction: Edge; source: 'kbm'|'gamepad'|'touch' }
```

`Edge` values latch until consumed.

**Context stack** (`explore | dialogue | menu | battle | textEntry`): only the top context receives actions. `textEntry` (nickname input) suspends all game keys so typing works.

**Keyboard**: uses `KeyboardEvent.code`, so it is layout-independent.
- WASD or arrows: move and navigate
- Shift: run (a toggle-run setting is available)
- E / Space / Enter: interact and confirm
- Esc / Backspace: cancel and back
- Tab / M: menu
- Q: field action
- 1–4: move shortcuts in battle

`preventDefault` is applied only for handled keys, and never in `textEntry`.

**Mouse**:
- Clicking the canvas in `explore` calls `requestPointerLock({ unadjustedMovement: true })`. If that option is unsupported, the call is retried without it.
- `pointerlockchange` sets `locked`. Esc releases the lock (browser behaviour) and does **not** open the menu on the same keypress.
- Without lock, or if lock is denied, right-button drag rotates the camera.
- Wheel zooms.
- Menus are fully clickable.

**Gamepad** (optional): `navigator.getGamepads()` is polled in `useFrame`. Uses the standard mapping, a radial deadzone of 0.18 and response curve `x^1.5`.
- A: confirm
- B: cancel
- Y: menu
- X: field action
- LB/RB: menu tabs
- Right stick: camera
- The `gamepadconnected` event switches UI glyphs.

**Touch** (Pointer Events, multi-touch). Each `pointerId` is **claimed** by one consumer on `pointerdown` and released on `pointerup`, `pointercancel` or `lostpointercapture`. `setPointerCapture` is used on the claiming element.
- Left 45% of the screen (outside buttons): a dynamic virtual joystick. The origin is the touch-down point, the radius is 64 CSS px, the output is normalized, and past 85% of the radius it becomes "run" (setting).
- Right 55% (outside buttons): camera drag with delta × sensitivity. Two-finger pinch on the right side zooms.
- Contextual buttons are DOM elements with `pointer-events: auto` that claim their pointer: Interact (appears only near an interactable), Field action, Menu, Run toggle. They are at least 48×48 CSS px, placed in the thumb zones inside safe areas.
- The joystick, camera drag and one button can all be active simultaneously. The manager tracks a `Map<pointerId, Claim>`.
- The container has `touch-action: none`. `user-select: none` is applied except on text entry. The context menu is blocked on the canvas.

**Visibility and focus loss** (`visibilitychange`, `blur`, `pagehide`, `pointercancel`, `lostpointercapture`):
- Clear all held keys, pointer claims and stick values. This prevents runaway movement.
- Latch-reset all edges.
- If the page is hidden: set the Canvas `frameloop="never"`, pause the physics world, pause the game clock and presenter timeline, and suspend audio (9.3).
- On return, resume with the `dt` clamp of 0.1 s max per frame, so the first frame doesn't teleport.
- If a battle timeline was mid-play, it resumes where it left off.

**Resize, orientation and safe areas**:
- R3F measures the container. `dpr` is re-evaluated on `resize`, and on `matchMedia('(resolution: …)')` change for monitor moves.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. UI padding uses `env(safe-area-inset-*)`.
- `100dvh` is used for the container height, avoiding mobile URL-bar jumps.
- Minimum supported viewport is 640×360 CSS px in landscape.
- On phones in portrait (coarse pointer and `height > width`), exploration and battle show a non-blocking "Rotate for best experience" banner and use a portrait-adapted layout: the battle menu goes to the bottom and the camera FOV widens to 65°. Menus work in both orientations. Whether portrait gameplay is fully supported is listed under Unresolved questions.
- An `orientationchange` or resize during battle re-runs the framing computation for the current shot.

### 8.3 Accessibility hooks this architecture provides

- Settings-driven text size (3 steps) and text speed
- Reduced motion (camera cuts, shake, flashes, wind)
- Reduced effects (post)
- Camera sensitivity and invert
- Keyboard-complete menus with visible focus rings and roving tabindex
- Type information is always icon + text, never colour alone
- No information conveyed by audio alone: cries and SFX are paired with text or visuals
- Flash VFX limited to at most 3 flashes/s (WCAG 2.3.1)

---

## 9. Audio integration

### 9.1 Start and graph

- Tone.js is lazy-loaded (the `audio` chunk). `AudioDirector.init()` is called from the title screen's first `pointerdown` or `keydown` ("Press any key / tap to begin"). It awaits `Tone.start()`, then builds the graph. Before that, all audio calls are no-ops, and the requests are queued so the latest music request plays once started.
- Graph: `Channel(music)`, `Channel(sfx)`, `Channel(ambience)` and `Channel(ui)`, all connected to `getDestination()`.
  - The `master` volume is set on `getDestination().volume`.
  - Slider 0–100 maps to dB as `v === 0 ? -Infinity (mute) : 20*log10(v/100)`.
  - A separate mute toggle keeps slider values. It sets `getDestination().mute`.
  - A limiter (`Tone.Limiter(-1)`) sits before the destination.
- Context: `latencyHint: 'interactive'`, `lookAhead: 0.05`.

### 9.2 Music director

- One `MusicDirector.request(trackId, {transition})` API, called by a zustand subscription on `appStore.mode` plus the zone id. Components never call Tone directly.
- **No overlapping**:
  - Each request increments a `token`. Only the newest token's track may start.
  - At most **2** songs exist at any time, the outgoing one and the incoming one. The outgoing song fades over 0.8 s and is then stopped and disposed.
  - A request for the already-playing track is ignored.
  - Rapid A→B→A requests during a fade cancel B before it starts.
- A song is a set of `Part`/`Sequence` stems on the shared transport (`getTransport()`), with BPM from the song. Zone themes loop.
- Battle songs have 3 **layers** (base, percussion, intensity), each on its own `Channel`.
  - The intensity layer's gain comes from battle state (the player's active creature below 30% HP, or a trainer's last creature) with a 1.0 s ramp, via `CrossFade` or gain automation.
  - Exploration to battle: a transition stinger (one-shot) plays, then the battle base starts at the next bar.
  - Battle to victory: the victory jingle plays, then the zone theme returns with a 1.5 s fade-in.
- Voice budget: music ≤ 16 simultaneous synth voices (PolySynth `maxPolyphony` set explicitly), SFX ≤ 12, cries ≤ 2 (a new cry interrupts the oldest).

### 9.3 SFX and cries

- SFX are synthesized with parameter presets. Frequent SFX (UI ticks, footsteps per surface, hit variants, capture shake/click) are **pre-rendered once with `Tone.Offline`** into `ToneAudioBuffer`s at audio init or zone load, then played through pooled `Player`s. This costs little CPU at runtime and gives accurate timing.
- Creature cries are parameterized per species from data (oscillator mix, formant filters, pitch contour, duration 0.4 to 1.2 s). They are rendered offline for the party, the current zone's encounter species and battle participants. There is an LRU cache of 40 buffers.
- Timing sync with visuals: battle SFX are triggered from animation clip events with a direct `player.start(Tone.now() + 0.01)`. Presentation drives audio, not the reverse, and no `Tone.Draw` callbacks are used.
- Spatialization: footsteps and cries in exploration use a simple pan and distance attenuation computed by us (no HRTF panners), with a 30 m cutoff.

### 9.4 Settings and lifecycle

- Settings: master, music, SFX, ambience volumes; mute; "mute when unfocused" (default on). They are persisted in settings and applied live.
- Hidden tab: on `visibilitychange` to hidden, `getTransport().pause()` and `getContext().rawContext.suspend()`. When visible again, `resume()` then `start()` the transport. If the context was `interrupted` (iOS), resume on the next user gesture.
- Stale time is not caught up: the transport restarts at the paused position.

---

## 10. Persistence architecture

### 10.1 Keys (localStorage)

| Key | Content |
|---|---|
| `crpg:save:main` | current save envelope |
| `crpg:save:backup` | previous good save (rotated on each successful main write) |
| `crpg:save:tmp` | in-flight write (normally absent) |
| `crpg:settings` | settings envelope (own version) |
| `crpg:probe` | written and removed at boot to test availability |

There is one campaign slot plus a backup, per the brief. Extra slots are an unresolved question.

### 10.2 Save envelope and schema

```ts
SaveEnvelope = {
  format: 'crpg-save',
  schemaVersion: number,        // integer, starts at 1
  gameVersion: string,          // build hash/semver
  savedAt: string,              // ISO; informational only, never used for logic
  checksum: string,             // FNV-1a 32 hex over canonical JSON of payload (sorted keys)
  payload: SavePayloadVn
}
```

`SavePayloadV1` is `gameStore`'s committed state, validated by a zod schema:
- `player {name, appearance, money, playtimeSec}`
- `clockMinutes`
- `rngState [4 × uint32]`
- `zone {id, entrySpawnId}`
- `party: instanceId[] (1..6)`
- `instances: Record<instanceId, CreatureInstance>`
- `storage: instanceId[] (≤ 300)`
- `inventory: Record<itemId, count>`
- `flags: Record<flagId, boolean|number>`
- `quests: Record<questId, {state, step}>`
- `encyclopedia {seen: speciesId[], caught: speciesId[]}`
- `fieldActionsUnlocked`
- `worldState` (moved boulders, opened gates, defeated trainers)
- `stats`

`CreatureInstance` = `{id, speciesId, nickname?, level, xp, nature?/personality?, ivs?, moves: [{moveId, charges}], hp, status, heldItem?, originalTrainer, caughtAt: {zoneId, level}}`. The Systems Designer owns the exact stat fields, and the schema will follow systems.md.

References are validated after parse: every `speciesId`, `moveId`, `itemId`, `zoneId` and `flagId` must exist in the content registry, and party and storage ids must exist in `instances` with no duplicates. Unknown ids from removed content are handled by migrations, never silently dropped.

Size target: ≤ 200 KB serialized (300 stored creatures at ≈ 350 B each ≈ 105 KB). No compression is needed.

### 10.3 Migration chain

- `migrations: Record<number, (p: unknown) => unknown>`, where `migrations[n]` converts vN into v(N+1). Migrations are pure and never throw on valid input. The loader runs `for v = env.schemaVersion; v < CURRENT; v++`, then applies the current zod schema.
- Every schema version bump requires:
  1. a new migration
  2. a frozen fixture `tests/fixtures/saves/v{N}.json` created from a real save of that version
  3. a test that migrates every older fixture to current and validates it
- If a save is **newer than supported** (a downgrade), the loader refuses to load it, **never overwrites** it, and offers export.

### 10.4 Atomic write order

`saveManager.commit(reason)` runs synchronously on the main thread, which is fine because localStorage is synchronous and small:
1. `payload = selectCommitted(gameStore)`. Serialize canonical JSON and compute the checksum to build the envelope string `S`.
2. `setItem('crpg:save:tmp', S)`.
3. **Verify**: `getItem('tmp') === S`, `JSON.parse` succeeds, and the checksum matches.
4. If `main` exists and passes checksum verification, `setItem('crpg:save:backup', main)`. A corrupt `main` is **not** rotated into backup, so the good backup is kept.
5. `setItem('crpg:save:main', S)`, then verify as in step 3.
6. `removeItem('crpg:save:tmp')`.

Load and recovery order: `main` (checksum + schema + migrate + xref), then `tmp` (valid means a crash happened between steps 2 and 6, and tmp is newer), then `backup`. If a fallback was used, the player sees "Your last save could not be read; restored from backup (saved <time>)", and the corrupt raw string is kept under `crpg:save:corrupt` for export or bug reports. If all fail, the title shows "No valid save" with export-raw and new-game options.

**Quota and unavailable storage**:
- Every `setItem` is wrapped. `QuotaExceededError` (by `name`, or legacy `code` 22 or 1014) aborts the sequence at that step. `main` is untouched unless step 5 itself failed, and in that case step 5's failure leaves the old main intact, because `setItem` is atomic per key. The code then removes `tmp`, and shows a persistent banner: "Saving failed: storage full. Export your save." with an Export button.
- The game continues and retries at the next checkpoint.
- A boot probe failure (storage disabled, private-mode restrictions, `SecurityError`) enters **no-storage mode**: a banner is shown, checkpoints keep an in-memory envelope, and export/import still work.

### 10.5 Checkpoints (what is committed when)

| Moment | Committed | Saved? |
|---|---|---|
| Battle start | nothing. The battle works on a snapshot copy in `battleStore`. | **No** |
| Battle end (win, loss→whiteout, fled) | XP, levels, learned moves, HP/status, items used, money, defeated trainer flags | Yes, after results, before returning to exploration |
| Capture resolved | new instance placed in party or storage, device consumed, encyclopedia updated | Yes (part of battle-end commit; a single save) |
| Evolution done or cancelled | species change, moves learned | Yes, per evolution |
| Purchase or sale | money, inventory | Yes, per transaction confirm |
| Healing | party HP/status, the last healing point | Yes |
| Zone transition | `zone.id` + `entrySpawnId` of the **target** zone (never a mid-zone position) | Yes, in `zoneLoading` |
| Quest step, story flag, field-action world change, item pickup, gift creature | the respective state | Yes (dialogue end / action end) |
| Party reorder, storage moves, nickname, move-teaching disc | respective state | Yes, on menu close (batched) |
| Settings | settings only | own key, debounced |

Reloading always resumes at the saved zone's entry spawn. An in-progress battle is lost on reload, and the player returns to the pre-battle state at the last checkpoint. QA covers this in its interrupted-transition cases. Play time is committed at every checkpoint.

### 10.6 Export, import, new game

- **Export**: the current `main` envelope (or the in-memory one in no-storage mode) is downloaded as `crpg-save-<date>.json` via a `Blob` and an `<a download>`.
- **Import**: file input → size ≤ 2 MB → parse → checksum verify (a mismatch is a warning; the user may proceed if schema validation passes) → migrate → validate → show a summary (name, playtime, badges, party) → confirm → current `main` goes to `backup` → write through the atomic sequence.
- **New game**: if `main` exists, a confirmation dialog appears ("This will replace your save. The previous save will be kept as a backup until your next save."). On confirm, main is rotated to backup immediately, and the first checkpoint writes the new main.

---

## 11. Build, test and CI scripts

`package.json` scripts:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | dev server |
| `build` | `vite build` | production build to `dist/` |
| `preview` | `vite preview --port 4173 --strictPort` | serve the build (used by smoke) |
| `typecheck` | `tsc --noEmit -p tsconfig.json` | strict TS (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `test` | `vitest run` | unit, data and architecture tests (node environment; no WebGL) |
| `test:watch` | `vitest` | |
| `validate-data` | `vitest run tests/data` | zod + cross-reference validation of all content. Also run inside `build` via a Vite plugin hook (`buildStart`) so an invalid content build fails. |
| `smoke` | `playwright test tests/smoke` | Boots `preview`, runs in headless Chromium (software GL). Checks: title renders with no console errors; new game reaches exploration; movement input changes position; a zone transition works; a scripted wild encounter reaches `battle`, and one turn resolves; save/reload restores the zone; export/import round-trips; zone round-trip leak check; `?bench=traverse&profile=mobile` completes and produces a valid `__BENCH_RESULT__` (numbers not asserted). |
| `silhouettes` | `playwright test tests/tools/silhouettes.spec.ts` | Loads `/?tool=silhouettes`. Renders each of the 30 species (and trainers) as flat black on white at 256 px and 20 px, front, side and 3/4 views. Writes `artifacts/silhouettes/<id>_{20,256}_{view}.png` and `contact_sheet.png`, plus `silhouettes.json` with pairwise IoU at 20 px (flags pairs with IoU > 0.85 for human review). |
| `gate:character` | `npm run silhouettes && playwright test tests/tools/characterGate.spec.ts` | Loads `/?tool=faces`. For each species × emotion state × {day, night} × {High, Mobile} at the `opponent_hero` and `player_over_shoulder` framings, writes PNGs plus `character_gate.json`. It **fails** if: a builder is missing or throws; anchors are missing; LOD budgets are exceeded; the projected head height in `player_over_shoulder` is under 8% of the viewport; the eye atlas contrast is < 4.5:1; or the night face luminance is < 60% of day. Visual judgment stays with the Release & Character Consistency reviewer. The script produces evidence and does not issue a pass. |
| `bench` | `playwright test tests/bench --project=chromium` | Container harness run only (functional). Real-device runs are manual with the URL flags (7.3). |
| `check:bundle` | `node scripts/check-bundle.mjs` | gzip-size check of `dist/assets/*` against 6.3 |
| `ci` | `npm run typecheck && npm run validate-data && npm test && npm run build && npm run check:bundle && npm run smoke` | the full gate. `gate:character` runs at phase gates. |

Playwright config: `use.launchOptions.executablePath` is resolved from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (a rev 1194 match with `@playwright/test@1.56.1`), `--use-gl=swiftshader` (or `--use-angle=swiftshader`), `workers: 1`, and `webServer: npm run preview`. Screenshots and JSON go to `artifacts/`, which is git-ignored except for curated evidence copied into `design/reviews/`.

---

## 12. Acceptance criteria

The architecture phase passes when every item below is demonstrated with evidence, not asserted.

1. `npm run ci` passes on a clean checkout in the container.
2. `tests/arch/boundaries.test.ts` passes. `src/sim` has no forbidden imports or globals.
3. Battle golden logs: at least 10 seeded fixtures reproduce identical `events[]`. The property test (1,000 seeds) confirms the displayed-state reducer equals the sim state after every turn.
4. App and battle machines: an exhaustive transition-table test passes, and an illegal transition throws in dev.
5. Encounter lock: the unit test shows exactly one `WILD_CONTACT` when 2 wild creatures touch the player in the same frame. The smoke test shows no second battle starts within 3 s or 3 m after returning.
6. Heightfield: collider-versus-render height agreement within ±2 cm at 200 random points, for every zone.
7. Character controller: a smoke scene with a 30° slope (climbable), a 50° slope (not climbable), 0.3 m stairs (auto-stepped) and a 0.5 m ledge (blocked) behaves as specified. Positions are asserted after scripted input.
8. Camera: in a scripted run beside a wall, the camera never ends a frame with the pivot-to-camera segment intersecting TERRAIN or STATIC_PROP (asserted with `castRay` per frame).
9. All 30 creature builders pass the contract tests (4.1), including LOD budgets and deterministic output.
10. `gate:character` produces a complete evidence set with no hard failures.
11. Persistence: tests cover a crash at each of the 6 write steps (simulated by throwing adapters), recovery picks the correct slot, quota errors keep `main` intact, no-storage mode works, every migration fixture loads, and export/import round-trips to an identical canonical payload.
12. `check:bundle` is within the 6.3 budgets.
13. Zone-leak smoke: geometries and textures return to baseline ±5 after 10 round trips.
14. The benchmark harness completes in the container and produces a schema-valid JSON flagged `representative: false`. Real-device results for RC-L, RC-P1 and RC-P2 are **required before any FPS claim** and are currently Not measured.
15. Hidden tab: the smoke test toggles `visibilitychange` (via CDP `Emulation.setFocusEmulationEnabled` / page visibility override), and it asserts that the frameloop stops, no input is stuck on return, and the audio context is suspended (queried via `window.__audioState`).

## 13. Dependencies

- **creative_direction.md**: UI language and fonts; whether jumping or ledge-hops exist; field-action set and visuals (props and VFX); zone themes and battle layer structure (9.2); portrait support stance.
- **creatures.md**: 30 `CreatureVisualSpec`s (palette, material treatment, anatomy, temperament, attack style, cry params). Face and eye proportions must meet the 4.4 readability rules, or the rules get renegotiated.
- **systems.md**: exact battle rules feeding `sim/`, the full `BattleEvent` set (new effects may add events), weather types, capture shake count, `CreatureInstance` fields, clock rate and phase boundaries, defeat penalty.
- **world.md**: `ZoneSpec` content (size, heightfield features, water, vegetation layers, props, exits, spawns, battle stages, wild regions, lighting mode, fog), encounter tables, benchmark zones (`route_2`, `forest`, `town_2` assumed).
- **qa_plan.md**: adopts the benchmark procedure, reference configs, smoke list and persistence crash tests.
- **release_character_gate.md**: consumes `silhouettes` and `gate:character` artifacts.
- Environment: npm registry access for installs; `/opt/pw-browsers` Chromium rev 1194; real RC hardware held by the orchestrator or testers.

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Procedural creatures look primitive or "blobby", failing the character-direction bar | High (a gate failure blocks release) | Invest in the primitive library (lathe profiles, tapered tubes, extruded fins), vertex-colour patterning, strong faces, rim light. Build the three starter lines first and pass them through `gate:character` in Phase 1 before scaling to 30. |
| Rapier compat bundle (~836 KB gz) inflates load | Medium | Lazy chunk after title. Consider the non-compat `@dimforge/rapier3d` with a separate `.wasm` file (1.57 MB raw, streamed-compile) if `@react-three/rapier` allows it. That is an unresolved question. |
| postprocessing peer-caps three at < 0.187 | Medium (blocks three upgrades) | Pin three 0.186.1. Upgrade only when postprocessing releases a widened range. |
| Heightfield row/column orientation mismatch | Medium | Automated agreement test (acceptance #6). |
| Mobile GPUs (Mali) are slow on `MeshPhysicalMaterial` and alpha-tested grass | Medium | Mobile uses Standard materials, low grass density and MSAA without post. The adaptive monitor steps down further. |
| Integrated GPUs miss 60 FPS on Balanced with vegetation + shadows | Medium | Budgets are tunable per profile, and the adaptive DPR step is available. RC-L benchmark early (Phase 1) on real hardware. |
| Software GL in the container gives misleading perf or visuals | Medium | All container numbers are flagged `representative: false`. Visual evidence is labelled "software render". |
| Tone.js CPU cost on phones (many synth voices) | Medium | Voice caps; offline pre-render of SFX and cries; music stems simple (≤ 16 voices). |
| localStorage 5 MB quota shared with nothing else, but Safari may evict after 7 days without interaction | Medium | Export reminder in settings after every trial victory (optional toggle). Unresolved: add an IndexedDB mirror? |
| React re-render storms from per-frame state | Medium | The per-frame rule (1.6), React profiler checks in the perf overlay (commits/s). |
| WebGL context loss on mobile when backgrounded | Medium | Context-loss handler rebuilds from cached CPU arrays (6.4). |
| TypeScript 7 is the npm `latest`, and tooling drift may follow | Low | Pinned 5.9.3. |
| `WEBGL_debug_renderer_info` unavailable or sanitized | Low | Profile detection treats it as a hint; adaptive monitor plus manual override. |

## 15. Unresolved questions

1. **Jumping.** No jump is assumed (2.3). The Creative Director should confirm, or specify a hop mechanic, which would need a KCC vertical-velocity design and level-design safety.
2. **Portrait gameplay on phones.** Landscape-first with a portrait fallback layout is assumed. Is full portrait support a requirement?
3. **Clock rate.** Is 24 real minutes per game day acceptable to Systems/World for time-based encounters and fairness? An alternative is a real device clock, which the anchors discourage because it creates real-time waits.
4. **Save slots.** One slot plus backup is assumed. Are multiple campaign slots wanted?
5. **IndexedDB mirror** of the save to defend against localStorage eviction: worth the added complexity?
6. **Rapier non-compat build** (separate `.wasm`, smaller transfer, streaming compile). It needs verification that `@react-three/rapier@2.2.0` can be configured to use it. Default is the compat build until verified.
7. **TypeScript upgrade** to 6.x or 7.x: when tooling (Vite plugin, vitest type-check, editors) is confirmed compatible.
8. **Battle-stage terrain edits.** Staging currently uses existing flat spots without terrain deformation. Should the World Designer mandate hand-placed stages in every zone instead of the automatic search, for art control?
9. **Evolution cancel.** Whether cancelling an evolution is allowed (Systems/Creative) affects the evolution state and save checkpoint.
10. **Encyclopedia viewer and zone.** Rendering via drei `<View>` in the single canvas while hiding the zone is assumed. Confirm the UI design doesn't need the world visible behind the viewer.
