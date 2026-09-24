# Rendering and Architecture

Owner: Rendering Engineer / technical architect.
Status: **Design v2** (2026-09-24). This version is revised to match `design/DECISIONS.md` (binding: D1–D28), the review round (`design/reviews/*.md`) and the code already in `src/`.

**Nothing here has been measured on real hardware.** Every performance number is a **target or budget**. The only numbers presented as facts are two kinds of count, and both are labelled where they appear:
- triangle and draw-call counts from constructing geometry in Node
- package sizes

Measured results will go in `design/reviews/perf_*.md` once real reference hardware has run the benchmark in section 7.

Changes from v1, summarized:
- Toolchain as installed (D24).
- The creature contract now describes the implemented declarative part-table assembler, with separate animated `Object3D`s and no skinning (D16 deviation).
- Faces use the 8-cell atlas at 256 / 256 / 128 px cells, with a UV-mirrored right eye (D14).
- Creature clip durations are authoritative (D15).
- A single-level cave with a ceiling shell (D17).
- A Rapier **trimesh** terrain collider (D25).
- 6 wild creatures per zone on every profile (D21).
- The single silhouette spec is GC-07 (D27).
- Static Vercel deployment (D28).
- The review-round fixes are listed in 0.3.

---

## 0. Toolchain, implementation status, change log

### 0.1 Pinned toolchain (D24; as installed in `package.json`)

| Package | Version | Notes (verified against the registry or package sources on 2026-09-24) |
|---|---|---|
| `three` / `@types/three` | 0.186.1 / 0.186.0 | `postprocessing@6.39.5` has the peer range `three >=0.168 <0.187`, so **three stays below 0.187** until that range widens. |
| `react`, `react-dom` | 19.2.0 | Inside `@react-three/fiber@9.8.0`'s peer range (`>=19 <19.4`). `@types/react` 19.3.0 is a harmless mismatch. |
| `@react-three/fiber` | 9.8.0 | Canvas `gl` (object or sync/async factory), `dpr: number \| [min,max]`, `frameloop`, `shadows`. |
| `@react-three/drei` | 10.7.8 | Used: `PerformanceMonitor`, `Detailed`, `Sky`, `View`, `OrbitControls` (tools only). **Never used: `useDetectGPU`**, because it fetches benchmark data from a CDN. |
| `@react-three/rapier` | 2.2.0 | Bundles `@dimforge/rapier3d-compat@0.19.2`. `Physics` props (`timeStep`, `paused`, `interpolate`, `updateLoop`), `useRapier`, `useBeforePhysicsStep`/`useAfterPhysicsStep`, `interactionGroups`. Known problem: `<HeightfieldCollider>` mis-scales (`scaleColliderArgs` multiplies `scale.x` three times) and has no flags slot. It is irrelevant now, because D25 uses a trimesh. |
| `@dimforge/rapier3d-compat` | 0.19.2 | `createCharacterController(offset)`, `enableAutostep`, `enableSnapToGround`, `setMaxSlopeClimbAngle`, `setMinSlopeSlideAngle`, `computeColliderMovement`, `computedMovement`, `computedGrounded`, `castShape`, `castRay`, `ColliderDesc.trimesh(vertices, indices, flags?)`. The WASM is inlined, so `rapier.mjs` is about **836 KB gzipped** (counted with gzip over the package file). |
| `@react-three/postprocessing` / `postprocessing` | 3.1.2 / 6.39.5 | `Bloom`, `SMAA`, `FXAA`, `Vignette`, `DepthOfField`, `ToneMapping`, `N8AO` (from `n8ao@2`). |
| `zustand` | 5.0.15 | |
| `tone` | 15.1.22 | Uses the `start()`, `getTransport()`, `getDestination()`, `getContext()` and `Offline` accessors, not the legacy singletons. |
| `zod` | 4.6.5 | |
| `vite` / `@vitejs/plugin-react` | 8.3.1 / 6.1.1 | |
| `vitest` | 5.0.1 | Node environment only. |
| `tsx` | 4.23.15 | Runs `scripts/*.ts` through esbuild. It is unaffected by TypeScript 7. |
| `typescript` | **7.0.2** | `tsc -p tsconfig.json` type-checks the current tree with exit 0. **TS 7 exposes no JavaScript compiler API**: `require('typescript')` exports only `version` and `versionMajorMinor`. Therefore no tool in this repo may depend on `ts.createSourceFile`. Gate and architecture scans use regex over source text and JSON (D24). |
| `@playwright/test` | 1.56.1 | Matches the preinstalled `/opt/pw-browsers/chromium-1194` (Chromium 141.0.7390.37). Version 1.57 expects revision 1200, which is not installed. |

### 0.2 Implementation status (what exists in `src/` today)

| Area | Files | Status |
|---|---|---|
| Pure battle sim | `src/sim/battle/{engine,ai,types}.ts`, `src/sim/{rng,stats,progression,types,content}.ts` | Implemented; unit-tested (`tests/unit/battle-math.test.ts`) |
| Persistence | `src/persistence/{saveManager,saveTypes,migrations,validate}.ts` | Implemented (schema v2, migration 1→2); unit-tested (`tests/unit/persistence.test.ts`) |
| Creature assembler | `src/creatures/{assemble,primitives,materials,face,anim,registry}.ts`, `species/c01.ts` | Implemented; 1 of 30 species so far |
| Dev tools | `src/tools/Tools.tsx` (`?tool=viewer\|sheet\|silhouettes`) | Implemented (the silhouette sheet needs rework, see 11.3) |
| Zone data types and terrain function | `src/world/zoneTypes.ts`, `src/world/terrain/heightfield.ts` | Implemented (height function and grid); meshes and collider not yet |
| Settings / quality table | `src/state/settingsStore.ts` | Implemented; `QUALITY` needs the D21 and 6.1 edits listed in 0.3 |
| Input | `src/ui/input/input.ts` | Implemented (keyboard, pointer lock and drag, touch joystick) |
| App shell | `src/main.tsx`, `src/app/App.tsx` | Stub (a "loading" screen) |
| Scene, zone rendering, camera, controller, presenter, audio, UI screens | — | Not yet implemented; specified below |

### 0.3 Code follow-ups required by this revision

These are listed here so the implementation converges on this document. The owner is the integration owner.

1. `settingsStore.QUALITY`:
   - remove `maxWild` (D21: the zone data value, 6)
   - set `mobile.antialias = true` (context MSAA on tile GPUs; see 6.1)
   - set `mobile.shadows = true` with `shadowSize 1024` for characters only, falling back to blob shadows
2. `ZoneSpec.maxWild`: the validator requires the value 6 (D21).
3. Terrain render mesh and trimesh collider must use the **same diagonal as `sampleGrid`**: triangles (i00, i10, i01) and (i10, i11, i01), split along the 10–01 anti-diagonal. The comment in `heightfield.ts` says "(0,0) to (1,1)", which does not match the code's `tx + tz <= 1` test. The code is the reference, so fix the comment.
4. `primitives.segs()` must become size-adaptive (4.6, D16). Counted today with `assemble(c01)` in Node: **14,158 triangles and 39 draw calls on High LOD0**, which is over D16's 12k.
5. `assemble.ts`:
   - add a `mergeStatic` pass (4.6)
   - add `userData.role` per the vocabulary in 4.1
   - add the `silhouette: true` tag, which keeps a part at LOD2
6. `anim.ts`: per-species clip durations and the contact fraction come from `SpeciesVisual.rig.durations` (D15). The current values (attack 1.0 × stageScale, contact 0.45) become fallbacks.
7. `tools/Tools.tsx` `Sheet`: replace one `<Canvas>` per cell with one context rendering into a tiled render target. Thirty or more WebGL contexts exceed Chromium's live-context limit (typically 16) and lose contexts. Implement GC-07 exactly (11.3).
8. `main.tsx`: honour `?tool=` only when `import.meta.env.DEV` or `VITE_QA=1` (D28).
9. `scripts/validate-data.ts` is referenced by `npm run validate-data` but does not exist yet.
10. `vite.config.ts` `test.include` should add `tests/data/**` and `tests/arch/**` when those suites land.

---

## 1. Module layout, data flow, state machines

### 1.1 Directory tree (existing files marked ✓)

```
creature-rpg/
  index.html ✓  vite.config.ts ✓ (base './')  tsconfig.json ✓  package.json ✓
  src/
    main.tsx ✓                     lazy-loads App or (dev/QA only) tools
    app/App.tsx ✓(stub)            one <Canvas> + <UiRoot/>; error boundary; appMachine
    app/appMachine.ts              app state machine (pure reducer, 1.4)
    app/bootstrap.ts               storage probe, settings load, quality detect, content registry
    sim/ ✓                         PURE: no three/react/tone/zustand/DOM/Date/Math.random
      rng.ts ✓                     sfc32, serializable RngState [4×u32], seedRng (splitmix32)
      content.ts ✓                 Content interface injected into every sim function
      stats.ts ✓ progression.ts ✓ types.ts ✓
      battle/engine.ts ✓           createBattle, openingEvents, resolveTurn, applyReplace, capture math
      battle/ai.ts ✓               chooseAiAction(c, s) via aiView() projection + separate rngAI stream
      battle/types.ts ✓            BattleState, BattleSetup, Action, BattleEvent union
      battle/battleMachine.ts      battle state machine (pure reducer, 1.5)
      world/encounters.ts, quests.ts, clock.ts
    data/
      content/*.json ✓(types, moves, items, families; more to come)
      schemas/*.ts, validate.ts, index.ts
    world/
      zoneTypes.ts ✓               ZoneSpec / TerrainSpec (data contract)
      terrain/heightfield.ts ✓     analytic height fn, grid, sampleGrid, slopeAt (pure, worker-safe)
      terrain/TerrainMesh.tsx, terrainCollider.ts, terrainMaterial.ts
      cave/caveShell.ts            ceiling shell + rim walls (D17)
      water/, vegetation/, props/ (kit builders), vista/
      actors/ TrainerController.tsx, FollowerCreature.tsx, WildCreature.tsx, wildAi.ts, navGrid.ts
      camera/ ThirdPersonCamera.tsx, BattleCameraDirector.ts
      lighting/ SunRig.tsx, dayNight.ts, fog.ts, mute.ts (Damper desaturation)
      weather/, post/PostStack.tsx, battle/BattleStage.tsx, battle/BattlePresenter.ts, battle/vfx/
      workers/zoneGen.worker.ts    grid + scatter + navgrid off the main thread
      resources.ts                 ResourceScope (dispose tracking)
    creatures/ ✓
      assemble.ts ✓                declarative part-table assembler → CreatureModel
      primitives.ts ✓              geometry helpers, lathe profiles, segs()
      materials.ts ✓               presets + shared rim chunk (injectRim, rimUniforms)
      face.ts ✓                    8-state eye atlas + 4-state mouth atlas, FaceRig
      anim.ts ✓                    tag-driven Animator (time-based)
      registry.ts ✓                import.meta.glob('./species/c*.ts') → SPECIES_VISUALS
      species/c01.ts ✓ … c30.ts    one bespoke SpeciesVisual per species
      characters/                  humanoid kit builder + named-character specs
      cache.ts, lod.ts
    ui/ input/input.ts ✓, screens/*, components/*, strings.en.json, perf/PerfOverlay.tsx
    ui/theme.css ✓
    audio/ AudioDirector.ts, MusicDirector.ts, sfx.ts, cries.ts, buses.ts, songs/*
    persistence/ ✓ saveManager.ts, saveTypes.ts, migrations.ts, validate.ts
    state/ settingsStore.ts ✓, appStore.ts, gameStore.ts, sessionStore.ts, battleStore.ts
    tools/Tools.tsx ✓              dev/QA-only viewer, sheet, silhouettes (11.3)
    bench/                         URL-flag bots and metric collector
  tests/ unit/ ✓, fixtures/saves/ ✓, data/, arch/, smoke/, tools/
  scripts/ shot.mjs ✓, extract-systems.py ✓, validate-data.ts, check-bundle.mjs, gate/
```

### 1.2 Dependency rules (enforced by `tests/arch/boundaries.test.ts`, a regex import scan, D24)

| Module | May import | Must not import |
|---|---|---|
| `sim/` | `sim/` | three, react, @react-three/*, tone, zustand, zod, `world/`, `ui/`, `audio/`, `persistence/`, `state/`; the globals `window`, `document`, `Date`, `Math.random`, `performance` |
| `data/` | zod, `data/`, types from `sim/types` | everything else |
| `persistence/` | zod, `sim/` types, `data/` types | three, react, tone |
| `creatures/` | three, `creatures/` | react, rapier, `sim/`, `state/` (tools and world wrap creatures in React) |
| `world/` | three, R3F, drei, rapier, postprocessing, `creatures/`, `state/`, `sim/` (pure calls), `data/` | `persistence/` (it saves only through `state/` actions) |
| `ui/` | react, `state/`, `data/`, `sim/` pure helpers | rapier, tone (sound only through the `audio/` facade) |
| `audio/` | tone, `state/` (subscribe), `data/` | three, react |
| `state/` | zustand, `sim/`, `data/`, `persistence/` | three, tone |

### 1.3 Data flow and the sim/presentation boundary

```
 data/content/*.json --zod + xref validate--> Content (frozen, injected)
                                                  |
      sim/* pure functions  <-- actions --  state/ stores  --subscribe-->  world/ (R3F), ui/ (DOM), audio/
      returns {state, events[]}  ------------->  |   commit(checkpoint) --> persistence/SaveManager
```

**Implemented battle API** (`src/sim/battle/engine.ts`, `ai.ts`):

```ts
createBattle(c: Content, setup: BattleSetup, seed: number): BattleState
openingEvents(c, s): { state; events }                       // send-outs + entry traits
chooseAiAction(c, s): { action: Action; rngAI: RngState }    // called BEFORE the player's command
resolveTurn(c, s, playerAction: Action, aiAction: Action): { state; events }
applyReplace(c, s, {kind:'switch', to} | {kind:'flee'}): { state; events }
captureValue / shakeThreshold / playerPartyAfter(s)
```

Properties of this API:
- `BattleState` carries `rng` and `rngAI` as two independent sfc32 streams. The AI stream is seeded with `seed ^ 0x9E3779B9`.
- The AI reads only `aiView()`. That view is a sanitized copy: the player's bench is hidden, and potentials and temperament are normalised. The AI is called before the player command exists, so it can never read the queued action (systems §6, §13).
- Rendering, audio and UI never draw from either stream.
- The engine does not mutate its input.
- **Golden logs**: `tests/fixtures/battles/*.json` holds `{seed, setup, actions[]} → events[]`. The logs must be reproduced exactly.

`BattleEvent` uses the discriminator `t`. The implemented union includes: `turnStart, sendOut, recall, moveUsed{anim}, moveMissed, moveFailed, blocked, noTarget, damage{hpBefore,hpAfter,eff,crit,attuned,source}, heal, statusApplied, statusCured, statusBlocked, cantAct, wokeUp, dizzyApplied, dizzyEnd, statChange, weatherStart, weatherEnd, traitTriggered, itemUsed, captureAttempt{shakes,success}, captureDeflected, fleeAttempt, faint, xpGain, levelUp, moveLearned, moveLearnPending, evolutionQueued, needReplace, weary, message, battleEnd`.

The presentation layer also expects these events. Systems v2 owns adding them:
- `phaseChange{attunedType}` for the two-phase Odile battle (D22)
- `dizzySelfHit`

Internal names stay unchanged. Display strings come from `strings.en.json`: statuses per D8, and "rings" instead of shakes per D9.

**BattlePresenter** (`world/battle/BattlePresenter.ts`) turns `events[]` into a **timeline** of cues. Each cue has a start, a duration and a track: `camera | anim | vfx | sfx | hpBar | text | face`.

Timing:
- Each `moveUsed.anim` (systems §9.1: 16 ids) maps to the attacker's species clip and a generic, type-tinted VFX envelope.
  - `melee_lunge`, `melee_sweep`, `charge_rush`, `dash_through`, `multi_hit_flurry` and `ground_wave` use the `attack` clip.
  - `projectile_*`, `beam`, `burst_area` and `rain_down` use the `special` clip.
  - `debuff_cloud`, `aura_self`, `shield`, `heal_glow` and `weather_call` use the `status` clip.
- **D15: species clip durations are authoritative.** The move `anim` owns root travel across the stage and the VFX envelope. The species clip animates in place.
- The presenter schedules the damage/HP cue at the clip's **contact event** (40–55% of the clip). It stretches the move VFX so its impact coincides with that contact, rather than bending the clip to systems' `impactMs`. `impactMs` is used only when a species has no clip for that slot.
- "Battle speed: Normal / Fast ×1.35" scales clips and cues together, so timing ratios are preserved.
- The presenter updates `battleStore.displayed` only through the pure reducer `applyEventToDisplayed(displayed, event)`.
- **Invariant:** after the last event of a turn, `displayed` equals the sim state for HP, status, active creature and faint flags. A property test checks this over 1,000 seeded battles.
- Skip or fast-forward applies the remaining events through the same reducer.
- The presenter never calls the sim.

### 1.4 App state machine (`app/appMachine.ts`, table-driven pure reducer)

An illegal transition throws in dev and is logged and ignored in production. A unit test enumerates every state × event pair.

| State | Entry actions | Events → next |
|---|---|---|
| `boot` | storage probe, settings, quality detect, content registry | `BOOT_OK` → `title`; `BOOT_FATAL` → `title` + error banner (playable without saves) |
| `title` | 3D backdrop; audio starts on first gesture | `NEW_GAME` (with a confirmation if a save exists) → `zoneLoading`; `CONTINUE` → `zoneLoading` |
| `zoneLoading` | fade 250 ms; dispose the old ResourceScope; worker generation; `compileAsync`; spawn at the entry spawn; **checkpoint save** | `ZONE_READY` → `exploration`; `ZONE_FAILED` → previous zone + toast |
| `exploration` | input context `explore`; wild AI on; clock runs | `TALK`/`SIGN`/`CUTSCENE`/`FIELD_ACTION` → `dialogue`; `WILD_CONTACT`/`TRAINER_SIGHT` → `battleTransition`; `OPEN_MENU` → `menu`; `EXIT_ZONE` → `zoneLoading`; `SCRIPTED_MOVE` (Gust updraft, ferry) → `scripted` |
| `scripted` | the KCC is disabled and the player follows an authored path; **saves blocked** | `SCRIPTED_DONE` → `exploration` (commit if the move changed state) |
| `dialogue` | wild AI frozen, clock paused | `DIALOGUE_END` → `exploration`; `DIALOGUE_BATTLE` → `battleTransition`; `DIALOGUE_SHOP`/`HEAL` → `menu` |
| `battleTransition` | encounter lock; freeze actors; choose a stage (2.7); wipe 0.8 s (0.3 s dissolve under reduced motion); build battle models; `createBattle` | `BATTLE_READY` → `battle` |
| `battle` | battle machine owns input | `BATTLE_EXIT{outcome}`: evolution queue not empty → `evolution`; `loss` → `whiteout` (except the Rival 1 story rule, D20); otherwise commit + save → `exploration` |
| `evolution` | Crescendo presentation in place | `EVOLUTION_DONE` (commit + save) → next queued evolution or `exploration` |
| `whiteout` | fade, heal, penalty, warp to the **last healing point visited** | `WARPED` → `zoneLoading` |
| `menu` | world paused; the encyclopedia `<View>` may render | `CLOSE_MENU` → `exploration`; `FAST_TRAVEL` → `zoneLoading`; `USE_EVOLUTION_ITEM` / `PARTY_EVOLVE` → `evolution` |

### 1.5 Battle state machine (`sim/battle/battleMachine.ts`)

| State | Meaning | Transitions |
|---|---|---|
| `intro` | `openingEvents` presentation | `INTRO_DONE` → `select` |
| `select` | `chooseAiAction` has already run on `AIView` + `rngAI`. The player now picks Moves / Satchel / Swap / Retreat (display names per CD; internal `move/item/switch/run`). | `COMMIT(action)` → `resolve` |
| `resolve` | synchronous `resolveTurn` | → `animate` |
| `animate` | presenter timeline | `TIMELINE_DONE`: `needReplace{player}` → `forcedSwitch`; `captureAttempt.success` → `capture`; `battleEnd` → `end`; otherwise → `select`. `PROMPT` (`moveLearnPending`) → `prompt` |
| `prompt` | move-replacement modal | `DECIDE` → back to `animate` |
| `forcedSwitch` | pick a non-fainted member; wild battles also offer Flee (`applyReplace`) | `COMMIT` → `animate` |
| `capture` | nickname (optional) → party if under 6 → storage if under 300 → **both full: mandatory release prompt** (D18). The pre-throw confirmation happens in `select` when `setup.storageFull`. | `CAPTURE_DONE` → `end` |
| `end` | XP, level-ups, learn prompts, rewards, evolution queue | `RESULTS_DONE` → `BATTLE_EXIT` |

### 1.6 Stores (zustand 5)

- `gameStore` holds **committed** state only. It is exactly `SavePayload` (`persistence/saveTypes.ts`). All mutations go through named actions (`commitBattleResult`, `commitCapture`, `commitEvolution`, `commitPurchase`, `enterZone`, `solveNode`, …), and each declares whether it is a checkpoint (10.4).
- `sessionStore` is volatile: wild roster, encounter lock, stage, loading progress.
- `battleStore` holds `BattleState`, the machine state, `displayed`, the timeline cursor and prompts.
- `settingsStore` ✓ is persisted under `crpg:settings` with a 300 ms debounce.
- `appStore` holds the machine state and the input-context stack.
- **Per-frame rule:** positions, camera, input axes and animation time never go through React state. `useFrame` reads `getState()`. The HUD samples position at 4 Hz.

---

## 2. Scene organization

### 2.1 One Canvas

```tsx
<Canvas gl={{ antialias: Q.antialias, powerPreference: 'high-performance', stencil: false, alpha: false }}
        dpr={[1, Q.dpr]} shadows={Q.shadows ? 'soft' : false}
        frameloop={visible ? 'always' : 'never'} camera={{ fov: 55, near: 0.1, far: Q.drawDistance }}>
  <SceneRouter/>  <PostStack/> (not mounted on Mobile)  {perf && <PerfProbe/>}
</Canvas>
```

The Canvas is mounted once and never remounted. `antialias` is a context-creation flag: a change between Mobile and the other profiles shows "applies after restart", while every other setting applies live. The encyclopedia viewer uses drei `<View>` inside the same context.

### 2.2 ZoneScene (driven by `ZoneSpec`)

```tsx
<ZoneScene zone={spec} key={spec.id}>
  <LightRig/> <SkyDome/> <ZoneFog/> <VistaLayer/>
  <Physics timeStep={1/60} interpolate updateLoop="independent" gravity={[0,0,0]} paused={mode!=='exploration'&&mode!=='scripted'}>
    <TerrainCollider/>         {/* trimesh from the render grid (D25) */}
    <PropColliders/>           {/* cuboid/cylinder; trimesh only for kit pieces with overhangs */}
    <CaveShellCollider/>       {/* cave only (D17) */}
    <ZoneSensors/>             {/* exits, triggers, resonance nodes, trainer sight */}
    <TrainerController/>
  </Physics>
  <TerrainMesh/> <Water/> <Vegetation/> <Props/> <Follower/> <WildCreatures/> <Npcs/> <Weather/>
  <ThirdPersonCamera/> | <BattleCameraDirector/>  <BattleStage/>
</ZoneScene>
```

There is one Rapier world per zone, which is created and destroyed with the zone key. It exists only for overworld movement: battles use no physics. The Rapier chunk is lazy-loaded (6.3).

Collision groups:

| Bit | Group | Filter |
|---|---|---|
| 0 | TERRAIN | PLAYER, CAMERA_PROBE |
| 1 | STATIC_PROP | PLAYER, CAMERA_PROBE |
| 2 | PLAYER | TERRAIN, STATIC_PROP, BLOCKER, SENSOR |
| 3 | BLOCKER | PLAYER |
| 4 | SENSOR | PLAYER |
| 5 | CAMERA_PROBE (query only) | TERRAIN, STATIC_PROP, cave ceiling |

Creatures and NPCs have no colliders. NPCs that must block get a BLOCKER cuboid.

### 2.3 Trainer character controller

- Body: `kinematicPosition` with `CapsuleCollider [0.45, 0.35]` (1.6 m tall).
- Controller: `createCharacterController(0.02)`, then:
  - `setUp(+Y)`
  - `setMaxSlopeClimbAngle(45°)`
  - `setMinSlopeSlideAngle(50°)`
  - `setSlideEnabled(true)`
  - `enableAutostep(0.35, 0.2, false)`
  - `enableSnapToGround(0.3)`
  - `setApplyImpulsesToDynamicBodies(false)`
- Per fixed step (`useBeforePhysicsStep`, 1/60 s):
  - Movement is the input vector rotated by camera yaw. Walk is 3.4 m/s and run 6.2 m/s, with acceleration 24 m/s² and deceleration 30 m/s².
  - Vertical velocity is -1 while grounded; otherwise it integrates at 22 m/s² down to -30.
  - `computeColliderMovement(collider, v·dt, EXCLUDE_SENSORS, groups)`, then `setNextKinematicTranslation`.
  - The visual yaw slerps at 14 rad/s.
- **No jump.** Vertical traversal is terrain, stairs, one-way drop ledges and scripted Resonance moves (Gust updraft).
- Safety nets:
  - Below `killY`, or ungrounded for more than 3 s: teleport to the last safe grounded point (2 s ring buffer, more than 1 m from edges).
  - Zone bounds are enforced by rim walls in the height function, plus BLOCKER cuboids at exit mouths when a gate is closed.

### 2.4 Third-person camera with collision

- Rig: yaw, pitch (clamped from -15° to 60°), distance 5.5 m (3 to 8), pivot at player + 1.45 m.
- Input sources: mouse (pointer lock or right-drag), gamepad right stick at 180°/s, or touch drag. Sensitivity ranges 0.25 to 2.0, with invert-Y available.
- Optional auto-recenter.
- Collision:
  - `world.castShape(pivot, identity, dir × desired, Ball(0.25), 0, 1, true, …, CAMERA_PROBE groups, playerCollider)`.
  - Allowed distance is `max(0.8, toi × desired − 0.1)`.
  - The camera snaps in immediately and eases out with `1 − exp(−6 dt)`.
  - If the pivot is embedded, distance becomes 0.8.
- Zone overrides (`ZoneSpec.camera`, optional): the cave and tunnels use max distance 3.5 m and FOV 60°.
- Pivot smoothing: `1 − exp(−12 dt)` horizontally and `1 − exp(−8 dt)` vertically. Vegetation and small props dither-fade instead of pushing the camera.

### 2.5 Follower creature

- Trail: player foot positions every 0.2 m, in a ring of 128.
- Target: arc length `followDistance = clamp(1.2 + 1.5·bounds.radius, 1.5, 4)` m behind the player.
- Motion: speed `min(3·dist, 1.15·playerSpeed)`. Height is interpolated from the trail's `groundY`. There is no collider and no physics query.
- The follower teleports with a puff when it is more than 12 m behind, on zone load, after a battle, or after a player teleport.
- A fainted lead is replaced by the first non-fainted member.
- Large floaters (for example c30) follow **aloft**: 3 m above and 5 m behind. Anything within 4 m of the camera dither-fades.

### 2.6 Wild creatures (D21: 6 per zone on every profile)

- **Cap:** `ZoneSpec.maxWild = 6` on all profiles, for fairness; the validator enforces it. Cost is controlled by animation LOD (4.7), not by count.
- **Nav grid:** 1 m cells, generated in the worker. A cell is walkable if all of these hold:
  - slope ≤ 32° (`slopeAt`)
  - at least 0.15 m above water (the inverse for aquatic species)
  - no prop footprint
  - outside exclusion radii: 25 m from arrival points; 12 m from trainers, healing points, waystones, exit triggers, trial doors and pending scripted events
  - inside a `wildRegions` circle
  
  Cells whose 4-neighbour height differs by more than 1.2 m are excluded as cliff edges.
- **Spawning:** at zone entry, ⌈0.6 × 6⌉ = 4 creatures appear. Refill ticks every 5 s after a 12 s slot delay, at a cell ≥ 30 m from the player and outside the frustum (otherwise the farthest cell ≥ 20 m). The sim's `encounters.roll` picks species and level from the zone stream seeded with `(saveSeed, zoneId, entryCounter)`. Placement uses a presentation RNG.
- **Despawn:** more than 80 m away for 20 s.
- **Behaviour** comes from the creatures v2 temperament: wander 4–10 m then idle 2–6 s; curious approach within 10 m; skittish flee; territorial 6 m patrol. Chasers move at ≤ 80% of player run speed.
- **Contact:** a per-frame distance check, `horizDist < 1.2 m` (or the species bound radius × 0.8 + 0.35 if larger) with `|dy| < 1.5`. It is valid only if all of these hold:
  - mode is `exploration`
  - the lock is free
  - `now ≥ immunityUntil`
  - the creature is not fleeing or despawning
- **Single-encounter lock:** the lock is set synchronously before dispatching `WILD_CONTACT`, so other contacts in the same frame see it. It clears when the return to `exploration` completes. After that the player has **4 s immunity** (world rule), and creatures within 8 m startle and move away for 3 s.
- **Test:** two creatures touching in one frame produce exactly one encounter (nearest wins; the tie is broken by seed).

### 2.7 Battle staging

- Zone data provides 2–4 hand-placed `battleStages` per zone. These are mandatory and checked by the validator.
- Use the nearest stage within 25 m. Otherwise search the nav grid within 20 m for a flat rectangle of length `max(12, 7 + r₁ + r₂ + 2)` m and width `max(6, 2·max r + 1)` m, with slope ≤ 8°, height variance ≤ 0.4 m, no props, and no water (unless both creatures are aquatic).
- The terrain is not modified. Feet go on `sampleGrid`. Floaters add `hoverGap` above the stage plane.
- Actors, the follower and NPCs within 30 m are hidden, and vegetation instances inside the rectangle are scaled to 0.

### 2.8 Zone lifecycle

- **ResourceScope** disposes every zone geometry, material, texture and render target on unmount.
- Creature models are cached by `species:lod:quality` with reference counts. Party models survive zone changes, and eviction happens after one further transition.
- Load pipeline:
  1. fade
  2. worker: grid, scatter, nav grid, stage candidates (transferable arrays)
  3. main thread: meshes, trimesh collider
  4. prebuild models for the encounter species
  5. `renderer.compileAsync(scene, camera)`
  6. hidden warm-up frame
  7. checkpoint save
  8. fade in
- The CPU arrays of the last 2 zones are cached.
- **Leak test:** 10 round trips return `renderer.info.memory.{geometries,textures}` to baseline ±5.

---

## 3. Terrain, cave, water, vegetation, props, vistas

### 3.1 Height function and grid (implemented: `world/terrain/heightfield.ts`)

`TerrainSpec` (`world/zoneTypes.ts`):

```
seed, size [W,D], base, amp, scale, rim, rimWidth,
hills[], flats[], paths[], water[], ceiling?
```

`makeHeightFn(spec, exits)` builds the height from these layers:
- `base + fbm(x/scale, z/scale, seed) × amp`
- plus Gaussian `hills`
- `paths` and `flats` blended toward a gentle base (flats may set an explicit `h`)
- `water` basins carved to `level − depth`, with a raised shore
- noise-modulated **rim walls** of height `rim` and width `rimWidth`, lowered smoothly at each exit radius

The noise is an in-house hash-based value noise with fbm, so it is identical in the worker, Node tests and the browser.

`buildGrid(spec, exits, cell)` samples row-major `heights[iz·nx + ix]`:

| Zone type | Cell | Grid for a 200 m zone |
|---|---|---|
| Default | 1 m | 201² samples, 80k triangles |
| Mountain zones (`volcano`, `snowpeak`, `route_4`, `route_5`, `town_2` terraces) | 0.75 m | 267², 142k triangles |

Validator checks on the generated grid:
- authored path polylines are ≥ 4 m wide
- grade ≤ 30%
- every spawn, exit and stage is on a walkable cell

Ledges, retaining walls, stairs (riser ≤ 0.3 m, tread ≥ 0.25 m) and terraces are **kit props** with cuboid colliders, not terrain.

### 3.2 Render mesh and collider share one triangulation (D25)

- The render mesh is split into 32×32-cell chunks with per-chunk bounds for frustum culling and 1 m skirts.
- The index order uses the **10–01 anti-diagonal** to match `sampleGrid` (0.3 item 3).
- **Collider:** `ColliderDesc.trimesh(vertices, indices)` is built from the **same** vertex and index arrays, one collider per chunk. That keeps building incremental and gives broad-phase locality.
- Invariant test: at 200 random points, `sampleGrid(x,z)` equals a downward `castRay` hit on the collider within ±1 cm, and equals the render mesh's triangle height exactly.
- Follower and wild-creature heights use `sampleGrid`, so actors sit exactly on the rendered and collided surface.

### 3.3 Cave (D17)

- The cave is a **single-level** heightfield zone (`indoor: true`, `biome: 'cave'`, `terrain.ceiling` set).
- High rim walls enclose it, and a **ceiling shell** closes it:
  - The shell is a second grid mesh at `ceiling − fbm·amp_c`, clamped at least 3.5 m above the floor, with its normals facing down.
  - It uses a trimesh collider in the CAMERA_PROBE group only. There is no jump, so the player never touches it.
- The lower galleries are a separate area of the same zone behind the Heave gate, not a second level.
- Lighting mode `interior` (5.2).
- Overhangs outside the cave (the snowpeak ice tunnel, root arches, pile-built pavilions) are kit meshes with trimesh colliders.

### 3.4 Terrain material

- `MeshStandardMaterial` with `onBeforeCompile`.
- A per-vertex 4-weight splat (grass, path, rock by slope, biome layer). Layers are procedural tileable canvas textures (512² on High, 256² otherwise) in a padded 2×2 atlas.
- A world-space macro-noise term on High and Balanced. Triplanar rock on High only; slope darkening elsewhere.
- The shared **mute chunk** (5.6) and the cloud-cookie chunk (route_4).
- Fallback: splat-weighted vertex colours with `MeshLambertMaterial`.

### 3.5 Water

- Water surfaces are generated from `water[]` basins in the terrain spec. A per-vertex baked `depth = level − sampleGrid` drives shore colour and foam, so no depth prepass is needed.
- The shader samples a tileable noise normal map (256², generated at boot) as two scrolling layers, with fresnel between the sky colour and a depth tint, sun specular and shoreline foam.
- By profile:
  - High: plus 2 small Gerstner waves (≤ 0.08 m; visual only)
  - Balanced: 2 layers and foam
  - Mobile: 1 layer and static foam
  - Fallback: unlit UV scroll
- **No planar reflection on any profile.** The lake gets **mirrored low-LOD duplicates of ≤ 3 hero landmarks** (lake island pavilion, Mere Hall, Chordstone). They are flipped below the plane and faded by depth: about 3 draw calls instead of a second scene pass.

### 3.6 Vegetation

- Scatter comes from `ZoneSpec.scatter[] {kind, density, minDist, avoidPaths}`, run in the worker as seeded Poisson-disc sampling.
- Each list is shuffled once, and each profile takes a **prefix** by density multiplier, so lowering quality removes plants without moving them.
- There is one `InstancedMesh` per kind per chunk, with `computeBoundingSphere()` after matrices are set.
- Wind is computed in the vertex shader: `sin(uTime·f + dot(instancePos.xz, k)) × strength × (y/h)²`. Strength follows weather.
- Near the camera and player, plants use a dither fade.
- Grass and tree distances depend on the profile (6.1).

### 3.7 Props: kit builders (review WD-5)

There are ≤ 12 parametric builders:
- `house`, `hall`, `tower`, `kiosk`, `bridge`, `dock`, `wall`, `stair`, `arch`, `windmill`, `camp`, `machine`

Each has params, palette and dressing. Landmarks (Chime Tower, Great Lantern Tree, Chordstones, Dampers, trial halls, league spire rings) are compositions of the kit plus a small number of bespoke parts.

Resonance nodes are one builder per register (10) with `idle`, `ready` and `solved` states.

Static props of one material are merged per chunk with `mergeGeometries`. Animated props (windmills, lamps, vents) stay separate.

### 3.8 Vista layer (review WD-4)

- `ZoneSpec.vistas?: {landmarkId, bearingDeg, distance, elevationDeg}[]`.
- Distant landmarks render as low-poly silhouettes on a skyline ring (radius 400 m). The ring is fog-exempt, drawn after the sky without depth writes, and independent of the camera far plane.
- It costs ≤ 3 draw calls on all profiles.
- It covers cross-zone sightlines: the Chime Tower, the Great Lantern Tree glow, windmills, the Kiln glow at night and the northern aurora.

---

## 4. Procedural creature pipeline (implemented: `src/creatures/*`)

### 4.1 Contract: `SpeciesVisual` → `assemble()` → `CreatureModel`

Species are **declarative part tables** (`species/cXX.ts`, `export const cXX: SpeciesVisual`), auto-registered by `registry.ts` through `import.meta.glob`.

```ts
SpeciesVisual { id, H, colors{P,S,A,D,…}, mat: Preset, rim?, rimStrength?, eye: EyeSpec, mouth?: MouthSpec,
                parts: PartDef[], rig: RigParams, hoverGap? }
PartDef { name, parent?, prim: Prim, at?, rot?, scale?, slot?, mat?, mirror?, anim?: string[],
          emissive?, glowColor?, opacity?, fluffy?, chain?: ChainSpec, lod?: 0|1, flat? }
Prim = sphere | capsule(r, len, r2?) | cone | cyl | box | torus | lathe(profile, h, rmax, axis) |
       extrude(shape, w, h, depth) | tube(pts, r0, r1) | eye(r, bulge) | mouth(r, w, bulge) | none
assemble(v, { lod: 0|1|2, quality: 'high'|'balanced'|'mobile' }): CreatureModel
CreatureModel { id, root, pivot, parts: Record<name, Object3D>, rest, tags: Map<name, string[]>,
                anchors, face: FaceRig, glowMats, glowBase, bounds{height, radius, headHeight, length},
                stats{triangles, drawCalls, materials}, visual, dispose() }
```

Conventions (all implemented):
- Dimensions are in multiples of H.
- The origin is on the ground, +Z is forward and +X is the creature's left.
- Rotations are in degrees, XYZ order.
- `mirror` creates `name_L` and `name_R`, negating X, yaw and roll. Parents resolve `_L`/`_R` automatically.
- `chain` creates `name0…name(n−1)` tapered capsules and a `nameTip` node. Each segment is tagged `chain:i:n`.
- `lod: 0|1` drops a part's geometry above that LOD but **keeps the node**, so clips and anchors still work.
- `fx:<id>` tags create anchors. Default anchors are `head`, `mouth`, `core` and `overhead`. The presenter derives `hitCenter` and `captureTarget` from `core`, and `feet` from `root`.
- `bounds.height` excludes `hoverGap`: the pivot is lifted after bounds are computed.

**Role vocabulary** (follow-up 0.3-5, adopted by GATE §3.2 and CR v2):
- Each part gets `userData.role`, derived from its name by a mapping table in `assemble.ts`: `body, head, jaw, neck, eye_l/eye_r` (from `eye_L/_R`), `brow_l/r, ear_*, horn_*, crest, tail_<n>, limb_<fl|fr|bl|br|l|r>, wing_*, fin_*, shell, segment_<n>, arm_<n>, panel_*, accessory_*`.
- Species keep readable part names. The gate reads roles.

Contract tests run in Node. `face.ts` falls back to a `DataTexture` with the identical UV layout when no canvas exists: that is the injectable texture path GATE §3.1 needs. The tests check:
- every registered species builds at 3 LODs × 3 qualities
- names resolve
- the required anchors exist
- bounds are finite, and `bounds.height` is within ±15% of H
- `stats` meet the 4.6 budgets
- `dispose()` releases geometries, cloned materials and face textures
- the same spec gives an identical vertex hash

### 4.2 Primitives (`primitives.ts`)

Helpers:
- ellipsoid, capsule (tapered via a lathe with hemispherical ends), cone, cylinder, box, torus
- `lathe` with Catmull-Rom-smoothed profiles: `L_egg, L_pear, L_dome, L_teardrop, L_spindle, L_bulb, L_bell, L_crater, L_cyl, L_horn, L_bowl`
- extrude shapes (`X_sail`, …), tubes, `vertexNoise`, `triCount`

`segs(kind, lod, quality)` today has three tiers: High-LOD0, Balanced/LOD1, and Mobile/LOD2. **D16 revision** (follow-up 0.3-4): segment counts also scale with the part's size relative to H:

| Part radius | Segments |
|---|---|
| r ≥ 0.2 H | full tier |
| 0.08 H ≤ r < 0.2 H | one tier lower |
| r < 0.08 H | the Mobile tier |
| r < 0.03 H (spots, nubs, toe cones) | sphere 6×4, cone 6 |

Enclosed parts (for example c01's belly inside the torso) use `P+` vertex colouring on the parent instead of separate geometry wherever the silhouette is unaffected.

### 4.3 Materials (`materials.ts`)

- Presets: `FUR, SCALE, SHELL, STONE, METAL, ICE, MEMBRANE, PAPER, SKIN_WET, GLOW, SKIN, CLOTH, HAIR, CRYSTAL, EYE`, each with roughness, metalness, clearcoat, sheen, opacity and side.
- `MeshPhysicalMaterial` is used only on **High** and only for presets with clearcoat or sheen. Other profiles use `MeshStandardMaterial`, with roughness lowered slightly for glossy presets.
- Transparent presets (`ICE`, `MEMBRANE`) have `depthWrite: false` and render after opaque objects.
- `makeMaterial` caches by option key, so creature instances of the same species share materials. Glow parts clone their material so each creature can animate its gain.
- **Rim light** (`injectRim`): a fresnel term with power 2.5 is added to `totalEmissiveRadiance`, scaled by `uRimColor · uRimStrength · (0.6 + uRimLocal)`.
  - `uRimStrength` is a **global** uniform (`rimUniforms`) set by the director: 0.25 by day, 0.45 at night, 0.5 in battle.
  - `uRimLocal` is the species `rimStrength`, so dark species (f09, c06, c30) keep extra rim.
  - `customProgramCacheKey = 'rim'` shares one program variant.
- Emissive: resting ≤ 1.5, and transient flares ≤ 3.0 for ≤ 250 ms around contact (CD/CR ruling). Mobile scales emissive by 0.8 because it has no bloom.
- On Mobile, colours are chosen to read unlit.

### 4.4 Faces (`face.ts`, D14)

- **Eye atlas:** 8 cells in a 4×2 grid (`open, half, closed, happy, hurt, faint, determined, surprised`).
- **Mouth atlas:** 4 cells in a 4×1 grid (`neutral, open, smile, grimace`).
- Both are canvas-painted once per **species × quality** and cached.
- The painter draws in this order: sclera, iris gradient, pupil class, lid shadow, lid pose per state, highlights (the key light at upper-left), outline. Cut-out (f09) states are drawn as masks.
- **Cell size:** 256 px on High and Balanced, 128 px on Mobile (D14). Anisotropy is 4 on High and 2 otherwise, with mipmaps and sRGB.
- **Per-instance state:** `FaceRig` clones the atlas texture for each eye and mouth material. `Texture.clone()` shares the `Source`, so the GPU uploads once per species. A state change is a UV `offset`, with no redraw.
- The right eye is the **same atlas UV-mirrored** (`mesh.scale.x = −1` on `_R`), so its highlight mirrors. D14 accepts this stylization.
- Blink: every 2.5–6 s, 120 ms (half, closed, half), only in `open` or `determined`.
- `flash(state, sec, base)` handles hurt, surprised and happy reactions. The mouth follows automatically: happy → smile, hurt → grimace, surprised/determined → open.
- **Texture memory per species** (arithmetic):

| Profile | Eye atlas | Mouth atlas | Total with mips |
|---|---|---|---|
| High / Balanced | 1024×512 RGBA = 2 MiB (≈ 2.7 MiB with mips) | 1024×256 ≈ 1.3 MiB | ≈ **4 MiB** |
| Mobile | 512×256 | 512×128 | ≈ **1 MiB** |

  The retained canvases add about 3 MiB (High) or 0.75 MiB (Mobile) of CPU memory per species.
- Mitigation: an **atlas LRU of 16 resident species**. That caps face textures at about 64 MiB (High/Balanced) or 16 MiB (Mobile). Eviction happens only for species with no live model.
- Readability rules. GC-09 measures them; enforcement lives here.
  1. Eye diameter ≥ 12% of head height (stages 1–2) and 12–15% for stage 3 (CD ruling). Species specs are fixed where needed (e.g. c30 eye r 0.045 H).
  2. Eyes exist at **every** LOD. At LOD2 the disc drops to 10 segments. Eyes are hidden only below 6 px projected head height.
  3. The eye material has an emissive floor of 0.35 through the atlas `emissiveMap` (0.9 for glowing-eye species), so night and shadow never black out the eyes.
  4. Battle framing (4.8).
  5. Eye materials disable fog in battle.

### 4.5 Animation runtime (`anim.ts`)

`Animator(model, stageScale)` is **time-based**, so timing is identical at any FPS or quality.

Each update does the following:
- Resets every part to its rest pose.
- Applies **tag-driven** procedural motion:
  - `br` breathing (scale-Y sine)
  - `look` head aim
  - `gait:<leg>` phase table (FL/BR vs FR/BL, plus radial phases A–F)
  - `wave` along `chain:i:n` segments
  - `flap`, `spin` (rotors), `sway`, `orbit` (satellites), `jaw`, `bob`, `glow` (the emissive gain on `glowMats`)
- Locomotion blends by `speed` and `moveBlend`.
- One **action** plays at a time: `attack | special | status | hit | capture | breakout | faint | victory | happy`.
  - Each action has a duration and a contact fraction, and fires `onContact` and `onDone`.
  - The action sets the face (determined, a hurt flash, surprised, faint, happy).
  - `faint` holds its end pose.
  - Style comes from `rig.attack` / `rig.special` (`lunge, spin, dive, slam, cast, whip, roll, rear, coil`).
- `rig.stepped` quantizes time to N fps (12 for the f09 cut-out family).
- Idle phase offsets are randomized per instance, so two creatures never breathe in sync.
- `extraScale` and `yawOffset` are overlays used for capture shrink and turning.
- **D15:** per-species durations and contact fraction (40–55%) come from `rig.durations` (follow-up 0.3-6). The current defaults (attack 1.0 × stageScale, special 1.05, hit 0.45, capture 0.8, faint 1.2 × stageScale, victory 1.4; contact 0.45/0.5/0.55) remain fallbacks.
- **Reduced motion** (implemented): amplitudes ×0.6, plus no camera shake, no squash and stretch, and spins ≤ 180° (CD/CR union). **Durations and event times are unchanged** (D15). VFX particle counts and shake are reduced by the presenter.
- Clips never translate the root across the stage in battle; the presenter supplies travel from the move `anim` (CR/SY division of labour).

### 4.6 LOD tiers and budgets (D16)

| Tier | Used for | Triangles (target) | Draw calls | Notes |
|---|---|---|---|---|
| LOD0 | battle, encyclopedia, evolution | ≤ 12,000 (stage-3 large ≤ 16,000) | **not capped: documented deviation (D16)** | all parts |
| LOD1 | follower; wild creatures ≤ 25 m | ≤ 5,000 | deviation | `lod: 0` accessories dropped |
| LOD2 | wild creatures 25 m to cull | ≤ 1,500 | deviation | `lod: 0\|1` accessories dropped. **Silhouette parts** (tag `silhouette`: c15 stones, c21 rotor, c26 crossbar, c18 plumes, …) are always kept |

**D16 deviation.** There is no skinning: animated parts stay separate `Object3D`s with their own meshes. Counted today (Node, `assemble(c01)`; geometry counts only):

| Profile / LOD | Triangles | Draw calls | Materials |
|---|---|---|---|
| High LOD0 | 14,158 | 39 | 14 |
| Balanced LOD0 | 7,714 | 39 | 14 |
| Mobile LOD0 | 3,852 | 39 | 14 |
| any LOD2 | 3,348 | 35 | 14 |

Mitigation, and what the numbers assume:
- **`mergeStatic`** (follow-up 0.3-5): untagged descendants of a tagged or animated node that share a preset are baked into that node's mesh with `mergeGeometries`, with colour moved to vertex colours on a shared preset material. Estimated for c01: about 21 draw calls.
- The size-adaptive `segs` brings c01 on High LOD0 under 12k.
- Draw calls per creature are **not** a gate criterion until measured on RC-L and RC-P1 (section 7). Skinning (one `SkinnedMesh` per material, rigid weights) stays the fallback plan if measurements miss the frame budget.
- Scene budgets in 6.2 already include the expected creature draw calls.

### 4.7 Animation LOD (D21 cost control)

| Distance or visibility | Update rate |
|---|---|
| ≤ 25 m (Mobile: at most 6 nearest) | every frame |
| 25–50 m | 15 Hz |
| > 50 m | 7.5 Hz |
| off-screen | 2 Hz (pose only) |

The face blink timer always runs. Contact and done callbacks fire on time regardless of update rate, because they are computed from accumulated time.

### 4.8 Battle camera framing

Shot distance comes from bounds: `d = subjectHeight / (2·tan(fov/2)·fraction)`.

| Shot | Framing |
|---|---|
| `intro_wide` | stage width = 80% of viewport width |
| `opponent_hero` | 45% |
| `face_closeup` (send-out, hurt, level-up) | **head height = 30% of viewport height**. This is the **GC-09 measurement shot**, where eyes are about 22–32 px at 720p. |
| `player_over_shoulder` | opponent head ≥ 8% |
| `attack_*` | 40% |
| `hit_*` | 35% |

- In the default `select` shot, eyes must be ≥ 6 px with the highlight visible.
- Size disparity greater than 3× biases the shot to the smaller creature's head.
- Large species: c30 uses a battle **display scale of 0.75**, and the camera also pulls back. c12 and c15 use their bounding sphere.
- Battle lighting: rim 0.5, plus the permanent fill light (5.2). The UI occupies at most the bottom 30% on desktop or the right 38% on landscape phones, and the frame centre is offset so faces are never under the UI.

### 4.9 Humans and NPCs

- One parametric humanoid builder (`characters/`) uses the same assembler and `SpeciesVisual` shape with `rig.type: 'HUMAN'`. It has kits for build, outfit, hair and accessory.
- Unnamed NPCs use ≤ 10 archetypes (allowed by GATE GC-02). About 15 named characters are bespoke.
- Budget: LOD0 ≤ 8k triangles; unnamed NPCs use LOD1 by default.
- Cass's scarf is a Verlet spring chain in presentation code, not Rapier.

---

## 5. Lighting, atmosphere, post, weather

### 5.1 Base rig (fixed light count, so no runtime shader recompiles)

- Every zone has exactly: one `DirectionalLight` (sun or moon), one `HemisphereLight` and one **battle fill** `DirectionalLight`. The fill has intensity 0 outside battle and 0.6 × the night boost in battle, and casts no shadow.
- `interior` zones (cave, trial halls, Stillhouse) have exactly **4 non-shadow `PointLight`s**, placed from zone data (crystal clusters, forges). Unused ones sit at intensity 0.
- **Lights are never added or removed at runtime**, because the light count is part of three's program key.
- c27's glow is emissive plus a rim tint, with no point light.
- Glowing things use emissive plus bloom.
- `outputColorSpace = SRGBColorSpace`.

### 5.2 Day/night cycle and lighting modes

- Clock: `gameStore.clockMinutes`, advanced only in `exploration`, at 1 real second = 1 game minute.
- **Encounter bands (sim):** day = 05:00–16:59, night = 17:00–04:59 (world ruling).
- **Lighting** uses a continuous keyframed curve (00:00, 05:00, 07:00, 12:00, 17:00, 19:00, 20:30, 24:00). Each key holds sun elevation, azimuth, colour and intensity; hemisphere colours and intensity; fog colour and density; exposure; sky parameters; and star opacity.
- Night floor: the moon key light is 0.35, hemisphere ≥ 0.45, exposure +0.3 and rim 0.45. Night eye-region luminance must be ≥ 60% of day (GC-09 capture).
- "Rest until" jumps the curve under a fade. PMREM is regenerated during the black.
- Modes (`ZoneSpec.lighting`):
  - `cycle` (default)
  - `fixed:<preset>`: route_5 is a permanent blue hour; the league is golden hour
  - `interior`: cave and halls, ignoring the cycle, using the 4 point lights plus crystal light baked into vertex colours

### 5.3 Tone mapping

ACES Filmic throughout:
- With the post stack: `gl.toneMapping = NoToneMapping`, and `<ToneMapping mode=ACES_FILMIC>` runs last in a `HalfFloatType` composer.
- Mobile: renderer ACES directly.

Exposure comes from the curve. UI is DOM and never tone-mapped.

### 5.4 Post stack

| Effect | High | Balanced | Mobile | Fallback |
|---|---|---|---|---|
| Composer | `multisampling 0`, HalfFloat | same | not mounted | on error or context loss: unmount; renderer ACES |
| Anti-aliasing | SMAA | FXAA | context MSAA (`antialias: true`) | — |
| Bloom | mipmap blur, threshold 1.0, intensity 0.6 | intensity 0.5, ½ resolution | off (emissive ×0.8, pre-brightened colours) | — |
| Vignette | 0.3 / 0.35 (battle 0.45) | same | off | — |
| DOF | battle only; target = focused head anchor | off | off | none |
| AO | N8AO, half resolution, `performance` quality | off | off | baked terrain cavity AO |
| Heat shimmer | volcano lava and vents only, screen-space distortion | off | off | none |

A `PerformanceMonitor` step-down order applies when the 5 s p95 exceeds 1.25 × budget:
1. DOF and AO
2. DPR −0.25 (floor 1.0)
3. one profile level (at most once per zone load, locked after 3 flip-flops)

A manual override disables step-down.

### 5.5 Fog and mood techniques

- Per-zone linear or exp2 fog with `palette.fog` and `fogDensity`, multiplied by night and weather.
- Height fog chunk on High and Balanced.
- Forest light shafts: ≤ 12 additive cards.
- Route_4 cloud shadows: a scrolling noise "cookie" in the terrain and prop lighting chunk (one texture sample).
- Aurora: one scrolling ribbon mesh (1–2 draw calls).
- Ambient **motes** (pollen, dandelion seeds, dust, embers, hail): one parameterised GPU system, one draw call per kind, counted against the particle cap.

### 5.6 Damper "mute" (world §8.1)

A shared material chunk (the same injection point as the rim) desaturates toward luminance:

```
mute = max(uGlobalMute, Σ_i uMuteAmt_i · (1 − smoothstep(r_i·0.8, r_i, dist(worldPos, c_i))))
```

- At most 2 spheres per zone.
- It applies to terrain, vegetation, props, water, sky and creatures.
- Defeating a Damper animates the radius outward over 0.8 s (the "colour wave").
- It works on Mobile, because it needs no post-processing.

### 5.7 Weather

The sim owns weather state (world rolls, systems battle weather). Rendering reads it.

| Weather | Technique | High | Balanced | Mobile | Fallback |
|---|---|---|---|---|---|
| Rain | GPU-only stretched quads in a 30×20×30 m camera box; position by `mod()` in the shader | 6,000 + 200 splashes | 3,000 | 1,200 | fullscreen streak overlay |
| Snow | same technique, with sway | 5,000 | 2,500 | 1,000 | overlay |
| Fog | fog density ×1.8 + drifting soft billboards | 24 | 16 | 8 | density only |
| Sunlight (battle only) | exposure +0.3, warmer key, motes | yes | yes | yes | — |

- A weather change mid-zone (band re-roll) crossfades particle density and fog over 10 s.
- **Battle-local weather:** move weather (5 turns, including `sunlight`) overrides the stage's visuals from the `weatherStart` event, crossfading 800 ms, and reverts on `weatherEnd`.

---

## 6. Quality profiles and budgets

### 6.1 Profiles (`settingsStore.QUALITY` plus the 0.3-1 edits)

> Environment realism pass (2026-09-24): `QUALITY` now also carries `surfaceRes`, `grass`, `post` (full/light/none), `cheapSurfaces` and `ibl`; software renderers are forced to Mobile. See `design/reviews/environment_realism.md` for the implemented values and per-tier costs.

| Setting | High | Balanced | Mobile |
|---|---|---|---|
| DPR cap | 2.0 | 1.5 | 1.25 |
| Context MSAA | off (SMAA in the composer) | off (FXAA) | **on** |
| Shadows | CSM 2 × 2048, 80 m | single 1024, 45 m | single 1024, 20 m, characters only; blob decal fallback |
| Draw distance (far, fog end) | 220 m | 160 m | 110 m (vista layer beyond) |
| Vegetation density | 1.0 | 0.65 | 0.35 |
| Vegetation / grass distance | 120 / 45 m | 90 / 30 m | 60 / 18 m |
| Creature draw distance | 90 m | 70 m | 50 m |
| **Wild creatures per zone** | **6** | **6** | **6** (D21) |
| Full-rate animated creatures | all ≤ 25 m | all ≤ 25 m | 6 nearest |
| Terrain texture / triplanar | 512² / yes | 256² / no | 256² / no |
| Water | waves + 2 normal layers + foam | 2 layers + foam | 1 layer, static foam |
| Particle multiplier (caps in 5.7) | 1.0 | 0.6 | 0.35 |
| Post | SMAA, Bloom, Vignette, DOF (battle), N8AO, shimmer | FXAA, Bloom ½, Vignette | none |
| PMREM env map | 256 | 128 | none |
| Creature materials | Physical where clearcoat or sheen | Standard | Standard |
| Face atlas cell | 256 px, aniso 4 | 256 px, aniso 2 | 128 px, aniso 2 |
| Height fog | yes | yes | no |

**Auto-detect** (`detectQuality()`, implemented simply):
- touch and a short side under 600 CSS px → Mobile
- ≥ 8 cores, ≥ 8 GB `deviceMemory` and no touch → High
- otherwise → Balanced

Planned additions:
- the `WEBGL_debug_renderer_info` renderer string as a hint
- software renderers (`SwiftShader|llvmpipe`) forced to Mobile, with a `softwareRenderer` flag shown in the overlay and in bench output
- runtime `PerformanceMonitor` (5.4)

Manual override: Settings → Graphics offers Auto, High, Balanced or Mobile, plus toggles for shadows, post and reduced effects, and a DPR slider.

### 6.2 Budgets (targets, not measured; per frame at the section 7 configurations)

| Budget | High | Balanced | Mobile |
|---|---|---|---|
| Draw calls, exploration (incl. ~6 wild at LOD1/2 + follower + NPCs) | ≤ 700 | ≤ 500 | ≤ 300 |
| Draw calls, battle (2 creatures at LOD0 + trainer + stage) | ≤ 400 | ≤ 300 | ≤ 200 |
| Visible triangles | ≤ 1.5 M | ≤ 800 k | ≤ 350 k |
| Texture memory (tracked by ResourceScope + atlas LRU) | ≤ 256 MiB | ≤ 192 MiB | ≤ 96 MiB |
| Animated characters in view | ≤ 16 | ≤ 14 | ≤ 12 (6 at full rate) |
| Particles (weather + VFX) | 8,000 | 4,000 | 1,600 |
| JS main thread per frame | ≤ 6 ms | ≤ 6 ms | ≤ 10 ms |
| Physics step | ≤ 1 ms | ≤ 1 ms | ≤ 2 ms |
| `resolveTurn` | ≤ 2 ms (off-frame) | same | same |
| Frame time | 16.7 ms | 16.7 ms | 33.3 ms |
| Zone load (fade to fade) | ≤ 1.5 s | ≤ 2.0 s | ≤ 3.0 s |
| Save commit | ≤ 20 ms | ≤ 20 ms | ≤ 40 ms |

The draw-call budgets are higher than v1 because of the D16 deviation. They are re-baselined after the first RC-L and RC-P1 measurements.

### 6.3 Download budgets (gzipped; `scripts/check-bundle.mjs`; CI fails when exceeded)

| Chunk | Contents | Budget |
|---|---|---|
| `entry` | React, zustand, UI shell, title, settings, persistence, content JSON | ≤ 300 KB |
| `render` | three, R3F, used drei, postprocessing, world core | ≤ 450 KB |
| `physics` | @react-three/rapier + rapier3d-compat (WASM inlined, about 836 KB alone) | ≤ 900 KB |
| `audio` | tone + directors | ≤ 150 KB |
| `creatures-fXX` × 10 | species part tables + family helpers | ≤ 25 KB each |
| `characters` | humanoid kit + named specs | ≤ 60 KB |
| `zone-<id>` | zone JSON + zone-specific props | ≤ 40 KB each |
| **Title interactive** (entry + render) | | **≤ 750 KB** |
| **Total** | | **≤ 2.6 MB** |

`physics` and `audio` are prefetched after the title and awaited on New Game or Continue. The build ships no binary assets: every texture and sound is generated at runtime.

### 6.4 Fallbacks for every expensive effect

| Effect | Fallback path |
|---|---|
| CSM | single shadow map → character-only shadows → blob shadows |
| N8AO | baked cavity AO |
| DOF | none (framing keeps focus) |
| Bloom | pre-brightened emissive |
| SMAA / FXAA | context MSAA |
| Composer | renderer ACES |
| Water | fewer layers → UV scroll |
| Triplanar | planar + slope darkening |
| Wind | static (Mobile decline, or reduced motion) |
| Grass | none |
| Weather particles | overlay |
| Height fog | standard fog |
| PMREM | hemisphere only |
| Physical materials | Standard + rim |
| Heat shimmer | none |
| Face atlas memory | LRU eviction |

- WebGL context loss: pause, show "Restoring graphics…", then rebuild the zone and repaint the atlases from the cached CPU data.
- No WebGL2: a clear "unsupported" message.

---

## 7. Reference configurations and benchmark (D26)

### 7.1 Reference configurations: all **Not measured**

| ID | Spec | Browser | Viewport / DPR | Profile | Pass criteria (targets) |
|---|---|---|---|---|---|
| **RC-L** mid-range laptop | Intel Core i5-1235U + Iris Xe (80 EU) **or** AMD Ryzen 5 7530U + Radeon Vega 7; 16 GB; Windows 11; on AC; Balanced power mode | Chrome stable (record the version) | maximized on 1920×1080, about 1920×953 CSS px, DPR 1.0 | Auto (expected Balanced); also forced High | Balanced: avg ≥ 58 FPS, p95 ≤ 20 ms, no frame > 100 ms after warm-up, zone load ≤ 2.0 s |
| **RC-P1** modern phone (Android) | Google Pixel 7 (Tensor G2, Mali-G710 MP7, 8 GB) | Chrome for Android | landscape 915×412 CSS px, DPR 2.625 capped to 1.25 | Auto (Mobile) | avg ≥ 30 FPS, p95 ≤ 40 ms, sustained over 10 min, zone load ≤ 3.0 s |
| **RC-P2** modern phone (iOS) | iPhone 13 (A15, 4 GB), iOS 18+ | Safari | landscape 844×390, DPR 3 capped to 1.25 | Auto (Mobile) | same as RC-P1 |
| CONTAINER-SW | Linux container, headless Chromium 141 (rev 1194), SwiftShader | headless | 1280×720, DPR 1 | forced Mobile | **functional only**: the harness completes and the JSON is valid. FPS is recorded as `representative: false` and never quoted. |

QA's RD-L, RD-P1 and RD-P2 map to RC-L, RC-P1 and RC-P2 (QA review). Which physical devices are available is an open item for the orchestrator.

### 7.2 Perf overlay (`?perf=1`, or `?debug=1` for QA, or F3)

A DOM panel updated at 2 Hz:
- FPS; p50, p95 and p99 over 600 frames
- draw calls and triangles, with `renderer.info.autoReset = false` and a manual reset per frame so composer passes are summed
- geometries and textures; the estimated texture MiB (ResourceScope + atlas LRU)
- JS heap (Chromium only)
- physics ms (from before- and after-step timestamps)
- React commits per second
- active and full-rate creatures, particles, profile, DPR, GPU string, `softwareRenderer`

### 7.3 Benchmark procedure

URL: `?bench=<BM-01…BM-08|traverse|battle|full>&profile=<auto|high|balanced|mobile>&seed=<n>&save=<fixture>`.
- `?quality=` is accepted as an alias.
- BM ids follow QA §8.1. `traverse` runs BM-02, `battle` runs BM-06, and `full` runs all of them.
- Flags work only in dev or in `VITE_QA=1` builds.

Procedure:
1. A fixture save sets a mid-game party of 6. The clock is fixed at 12:00 with clear weather; `full` adds 19:30 with rain.
2. A bot `InputSource` replays a spline path through the real controller, camera and AI.
3. Warm up for 10 s (shader compile reported separately), then sample 60 s per scene. Every rAF delta is recorded, and heap is sampled at 1 Hz.
4. The battle runs 10 scripted turns of the heaviest `anim`s, with per-turn resolve-to-idle latency.
5. Run 3 times and report the median.
6. Output goes to `window.__qa.bench` and a download:
   ```
   {config:{ua, gpu, dpr, viewport, profile, softwareRenderer, buildSha},
    scenes:[{id, loadMs, fpsAvg, p50, p95, p99, over33Pct, over100Count, drawCalls, tris}], heapMaxMiB}
   ```
7. Results are committed to `design/reviews/perf_<RC>_<date>.json` with a markdown summary. **Only these files support FPS claims.**

---

## 8. UI integration and input

### 8.1 DOM overlay

- `#game` is fixed and full-screen. The `<Canvas>` sits at z-index 0 and `<UiRoot>` at z-index 1, with `pointer-events: none` except on panels.
- There are no drei `<Html>` menus. World labels are DOM elements positioned via `Vector3.project`, written straight to `style.transform`.
- The trainer-spotted marker is CD's **chord-burst** DOM icon.
- Display strings (Moves / Satchel / Swap / Retreat, status names per D8) come from `strings.en.json`.
- Fonts are system stacks (CD §7.2), with no network request.

### 8.2 Input (`ui/input/input.ts` ✓: keyboard, pointer lock and drag, touch joystick)

- **Frame model:** each frame produces `InputFrame {move, look, zoom, run, interact, cancel, menu, confirm, nav*, fieldAction, source}`. Edges latch until consumed.
- **Context stack:** `explore | dialogue | menu | battle | textEntry`. `textEntry` suspends game keys.
- **Keyboard:** uses `KeyboardEvent.code` (WASD/arrows, Shift run, E/Space/Enter, Esc/Backspace, Tab/M, Q field action, 1–4 moves).
- **Mouse:**
  - Pointer lock is requested on canvas click in explore, with `{unadjustedMovement:true}` retried without the option if it fails.
  - Esc releases the lock without opening the menu.
  - Right-drag is the fallback. The wheel zooms.
- **Gamepad:** standard mapping, radial deadzone 0.18, response curve `x^1.5`.
- **Touch** (Pointer Events, with `Map<pointerId, Claim>` and `setPointerCapture`):
  - The left 45% of the screen is a dynamic joystick: radius 64 CSS px, **dead-zone 8 px (0.12)**, and run past 85% (setting).
  - The right 55% is camera drag, and a pinch zooms.
  - DOM buttons are ≥ 48×48 CSS px: Interact, Resonate, Menu, Run.
  - Joystick, camera drag and one button work simultaneously.
  - `touch-action: none`.
- **Focus and visibility:** on `blur`, `visibilitychange`, `pagehide`, `pointercancel` or `lostpointercapture`, all keys, claims and axes are cleared.
  - Hidden: `frameloop='never'`, physics paused, clock and timeline paused, audio suspended.
  - On return, dt is clamped to 0.1 s.
- **Resize and orientation:** R3F measures; DPR is re-evaluated. The viewport meta uses `viewport-fit=cover`, and padding uses `env(safe-area-inset-*)`.
  - Height is `100dvh`, with a minimum of 640×360 in landscape.
  - Portrait phones get a "rotate" banner plus a portrait layout (battle menu at the bottom, FOV 65°).
  - Battle framing is recomputed on resize.

### 8.3 Accessibility hooks

- text size (100/125/150%) and text speed
- reduced motion (4.5) and reduced effects
- battle speed
- camera sensitivity and invert
- keyboard-complete menus with a visible focus ring
- type, status, HP band and effectiveness shown as icon + text, never colour alone
- no information by audio alone
- flashes ≤ 3/s

---

## 9. Audio integration

- **Start and graph:**
  - Tone is lazy-loaded. `AudioDirector.init()` runs on the first `pointerdown` or `keydown` at the title and awaits `start()`. Requests made earlier are queued, and only the latest music request survives.
  - Graph: `Channel`s for music, SFX, ambience and UI → `Compressor(−18 dB, 3:1)` → `Limiter(−1 dB)` → destination (CD §8.1).
  - Volume maps a 0–100 slider to dB: `v ? 20·log10(v/100) : −∞`. Mute is a separate toggle. Context options: `latencyHint 'interactive'`, `lookAhead 0.05`.
- **Music director:** a single `request(trackId)`, driven by a subscription to `appStore.mode` and the zone.
  - Each request takes a token; at most 2 songs are alive (outgoing and incoming).
  - The fade is 0.8 s. A request for the current song is ignored, and A→B→A cancels B.
- **Battle layers:** base, melody (−6 dB for wild battles), intensity (HP ≤ 25%, exits above 35%), and variants for trial leader, Stillmark, Odile phases, champion and rival.
  - Layer changes are **quantized to the next bar with 400 ms crossfades** (CD §8.4).
  - Odile phase B is driven by the `phaseChange` event.
- **Voices:** total synth voices ≤ 24 (music ≤ 14, live SFX ≤ 8, cries ≤ 2). Pre-rendered `Tone.Offline` buffers played through pooled `Player`s do not count.
- **Pre-rendering:**
  - Frequent SFX (UI, footsteps × 6 surfaces, hits, Chime rings per D9) are pre-rendered at init.
  - Cries (per-species params, deterministic) are rendered for the party, the zone's encounter species and battle participants, in an LRU of 40.
  - The Great Chord ending stinger is pre-rendered at load (CD).
- **Sync:** SFX start from clip `onContact` via `player.start(Tone.now() + 0.01)`. Presentation drives audio.
- **Lifecycle:**
  - Hidden: `getTransport().pause()` and `rawContext.suspend()`. Visible: resume, then restart the transport at the paused position.
  - An iOS `interrupted` context resumes on the next gesture.
  - "Mute when unfocused" defaults to on.

---

## 10. Persistence (implemented: `src/persistence/*`)

### 10.1 Keys (`KEYS` in `saveManager.ts`)

| Key | Content |
|---|---|
| `crpg:save:main` | current envelope |
| `crpg:save:backup` | previous good envelope |
| `crpg:save:tmp` | in-flight write (normally absent) |
| `crpg:save:corrupt` | raw unreadable main, kept for export or a bug report |
| `crpg:settings` | settings (own debounced writer) |
| `crpg:probe` | boot availability probe |

There is one campaign slot plus the backup.

### 10.2 Envelope and payload (`saveTypes.ts`, `validate.ts`)

```
SaveEnvelope { format:'crpg-save', schemaVersion: 2, gameVersion, savedAt (ISO, informational), checksum, payload }
```

- The checksum is FNV-1a 32-bit over **canonical JSON** (sorted keys).
- `SavePayload` fields:
  - `player {name, pronoun, look, money, playtimeSec, starter}`
  - `clockMinutes`, `rngState`
  - `zone {id, spawn}`, `lastHearth {zone, spawn}`
  - `party[] (1..6)`, `storage[] (≤ 300)`, `instances{uid → CreatureInstance}`
  - `inventory`, `flags`, `quests`, `seen`, `caught`
  - `nodes` (solved resonance nodes), `waystones`, `defeatedTrainers`, `pickups`, `stats`
- `CreatureInstance` (zod) holds `uid, species, nickname?, level 1–60, xp, potential{6 stats}, temperament, moves[1..4]{id, charges}, hp, status|null, sleepCounter?, bond?, evolveReady?, caughtIn?, metZone?`.
- After parsing, cross-references are validated against `KnownIds` (species, moves, items, zones). Party and storage uids must exist, with no duplicates.

### 10.3 Migrations (`migrations.ts`)

- `migrations[n]` converts vN into v(N+1). Each is pure and runs on `structuredClone`. `migrate()` walks from the envelope version up to `SAVE_SCHEMA_VERSION`.
- Current chain: **v1 → v2** (`lastHeal` → `lastHearth`; adds `waystones` and `pickups`).
- Each bump requires a frozen fixture `tests/fixtures/saves/v{N}.json` ✓ and a test that migrates every older fixture.
- A save **newer** than supported is refused, never overwritten, and offered for export.

### 10.4 Atomic commit and recovery (`SaveManager`, KV adapter injectable for tests)

`commit(payload)` steps:
1. build the envelope `S`
2. `tmp ← S`, then verify by read-back and checksum
3. if `main` verifies, `backup ← main` (a corrupt main is never rotated)
4. `main ← S`, then verify
5. remove `tmp`

- Quota errors are recognized by name (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`) or legacy code 22/1014. They abort the commit with `{error:'quota'}`. `main` stays intact, `tmp` is removed, and a persistent "Export your save" banner appears. The next checkpoint retries.
- Load order: `main` → `tmp` (an interrupted write) → `backup`, each checksum + schema + migrate + xref. The notices are player-facing. A raw unreadable main goes to `crpg:save:corrupt`.
- A probe failure means **no-storage mode**: checkpoints go to an in-memory envelope, and export still works.
- **Multi-tab** (QA M-71): a `storage` event on `crpg:save:main` from another tab marks this tab stale. It shows "Your save changed in another tab. Reload?" and blocks commits.

### 10.5 Checkpoints (D19: reload mid-battle, capture or evolution returns to the pre-battle checkpoint)

| Moment | Saved? |
|---|---|
| Battle start | **No**. The battle runs on a copy. |
| Battle end (win, loss→whiteout, fled) | Yes: XP, levels, moves, HP/status, items, money, defeated trainers |
| Capture resolved (incl. the mandatory release, D18) | Yes, in the same commit as battle end, only after placement or release resolves |
| Evolution done or cancelled | Yes, per evolution |
| Purchase or sale | Yes, per confirmed transaction |
| Healing / Hearthrest / "Rest until" | Yes (sets `lastHearth`) |
| Zone transition | Yes, at the **target zone's entry spawn** (`zone.spawn`) |
| Quest step, story flag, Resonance node solved, pickup, gift | Yes (the same write as the flag) |
| Scripted moves (Gust updraft, ferry) | **Blocked** while running; saved at the destination if state changed |
| Party, storage or nickname changes, disc taught | Yes, on menu close |
| Settings | own key, debounced 300 ms |

Reload always resumes at the saved zone's entry spawn.

### 10.6 Export, import, new game (implemented)

- `exportRaw()` returns the current main (or the in-memory envelope) as JSON. The UI downloads it as `crpg-save-<date>.json`.
- Import:
  - size ≤ 2 MB → parse → a checksum mismatch is a **warning** if the schema is valid → migrate → xref
  - show a summary and ask for confirmation
  - commit through the atomic sequence, which rotates main to backup
- New game: after confirmation, `main` is rotated to `backup` and removed. The first checkpoint writes the new save.

---

## 11. Build, test, deploy

### 11.1 Scripts

| Script | Command | Status |
|---|---|---|
| `dev` | `vite` | ✓ |
| `build` | `tsc -p tsconfig.json && vite build` | ✓ (`base: './'`, target es2022) |
| `preview` | `vite preview` | ✓ |
| `typecheck` | `tsc -p tsconfig.json` (TS 7.0.2) | ✓ |
| `test` (alias `test:unit`) | `vitest run` (Node; `tests/unit/**`, later `tests/data`, `tests/arch`) | ✓ |
| `validate-data` (alias `test:data`) | `tsx scripts/validate-data.ts`: zod + xref + zone rules (maxWild = 6, ≥ 2 battle stages, path grade) | script to add |
| `smoke` (alias `test:e2e`) | `playwright test tests/smoke`: title with no console errors; new game → exploration; movement; zone change; forced encounter → one turn; save/reload; export/import; leak loop; bench harness completes | to add |
| `silhouettes` | `playwright test tests/tools/silhouettes.spec.ts` (GC-07 outputs) | to add |
| `gate:character` | `tsx scripts/gate/character/index.ts` (GATE §3; regex scans per D24) | to add |
| `bench` | container functional run (`representative: false`) | to add |
| `check:bundle` | `node scripts/check-bundle.mjs` (6.3) | to add |
| `ci` | typecheck → validate-data → test → build → check:bundle → smoke | to add |

Playwright: `@playwright/test@1.56.1` with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, `--use-angle=swiftshader`, 1 worker, `webServer: npm run preview`. Artifacts go to `reports/…` (GATE layout). QA links to them.

### 11.2 Dev and QA flags

`?tool=viewer|sheet|silhouettes`, `?perf`, `?debug`, `?bench`, `?seed`, `?save`, `?zone`, `?profile|quality` and `?storage=unavailable|quota` are honoured **only** when `import.meta.env.DEV` or `VITE_QA=1` (D28, follow-up 0.3-8). A production build ignores them, and QA test B-30 checks that.

### 11.3 Silhouette tool (D27: GATE GC-07 is the single spec)

- **One** WebGL context (`/?tool=silhouettes`; `/gate.html` in QA builds). Each species renders at `idle` t = 0 into a 256×256 `WebGLRenderTarget`:
  - no MSAA, DPR 1, tone mapping off
  - `MeshBasicMaterial` black on white, no dithering
  - fitted with 8% padding
- Views: side, with camera on +X or the species' `silhouetteSideYaw` ≤ 45° for planar designs (D27); and three-quarter (35° yaw, 10° pitch).
- Pixels are read back with `readPixels` and thresholded to 0/1 in-page. **Hashes are computed over the binary mask arrays, not the PNGs.** The 20 px mask is box-downsampled in JavaScript from the 256 px mask, then thresholded at 50%.
- D = 1 − IoU after centroid alignment. GATE's thresholds and fill limits apply.
- The Chromium revision (1194) is recorded in the report. A revision change requires recalibration.
- PNG sheets are evidence only.
- The **palette pass** renders unlit albedo (base and vertex colour; no rim, no emissive) for GC-10.
- The **face pass** renders the `face_closeup` shot on each profile for GC-09.

### 11.4 Deployment (D28)

- **Target:** a Vercel **preview** deployment of the static `creature-rpg/dist`. The repository is already connected to Vercel.
- Settings: framework "Vite"; build command `npm run build`; output directory `dist`; Node 22. `VITE_QA` is unset for production-like previews. A separate QA preview may set `VITE_QA=1`.
- `base: './'` keeps the build path-independent. There are no server routes (a single `index.html` with query flags), so no rewrites are needed.
- Cache headers: `/assets/*` (content-hashed) `public, max-age=31536000, immutable`; `index.html` `no-cache`.
- The Rapier compat build inlines its WASM, so no `.wasm` MIME configuration is needed.
- **Release gate:** deploy only after `ci` passes and `design/reviews/gate_status.json` shows the build commit as passed (GATE §3.6). Preview screenshots follow GATE GC-16.

---

## 12. Acceptance criteria

1. `npm run ci` passes on a clean checkout in the container.
2. The architecture boundary test passes: `src/sim` has no forbidden imports or globals.
3. At least 10 golden battle logs reproduce exactly, and the displayed-state property test (1,000 seeds) passes.
4. The app and battle machines pass exhaustive transition tests, including `scripted`, `PARTY_EVOLVE` and the D18 capture path.
5. Encounters: exactly one `WILD_CONTACT` for simultaneous contacts; 4 s immunity is respected; ≤ 6 wild per zone on every profile (D21).
6. Terrain: `sampleGrid` equals the trimesh ray height within ±1 cm at 200 points per zone, and equals the render triangle exactly (D25).
7. Controller: a 30° slope is climbable, 50° is not, 0.3 m stairs auto-step and a 0.5 m ledge blocks, all asserted after scripted input.
8. Camera: across a scripted wall run and the cave, the pivot→camera segment never ends a frame intersecting CAMERA_PROBE geometry.
9. Creatures: every species passes the 4.1 contract tests. **LOD0 ≤ 12k triangles (≤ 16k stage-3 large).** The draw-call count is reported per species (the D16 deviation, measured later).
10. Faces: every species has 8 eye states and 4 mouth states. GC-09 passes in `face_closeup` on all profiles.
11. `gate:character` produces the complete GC-00…GC-16 evidence set with no hard failure. Mask hashes are identical across two runs.
12. Persistence: crash-at-each-step tests, quota and no-storage modes, v1→v2 migration fixture, export/import round trip and multi-tab staleness (implemented tests: `tests/unit/persistence.test.ts`).
13. `check:bundle` is within 6.3.
14. Zone leak loop: geometries and textures return to baseline ±5.
15. The bench harness completes in the container with valid JSON flagged `representative: false`. **Any FPS claim requires RC-L, RC-P1 or RC-P2 results; currently Not measured.**
16. Hidden-tab smoke: frameloop stops, no stuck input on return, audio context suspended.
17. The deployed Vercel preview loads the title with no console errors, and it ignores dev flags when `VITE_QA` is unset.

## 13. Dependencies

- **DECISIONS.md** (binding): D1 zone, trial and attunement table (zone palettes and lighting presets); D14–D17, D21, D24–D28.
- **creatures.md v2:**
  - 30 `SpeciesVisual` tables using the role vocabulary
  - `rig.durations` and contact fractions (D15)
  - `silhouette` tags
  - `silhouetteSideYaw` for planar species
  - temperament and attack style
  - cry params
  - c30 size and eye-size fixes
- **systems.md v2:** the full `BattleEvent` union (incl. `phaseChange`, `dizzySelfHit`); the `anim` vocabulary; battle weather; D18 capture flow.
- **world.md v2:**
  - `ZoneSpec` content: terrain specs, 2–4 `battleStages`, `wildRegions`, `maxWild = 6`
  - `vistas`, `lighting` mode, camera overrides
  - cave ceiling (D17)
  - encounter tables with the day/night bands
- **creative_direction.md:** UI strings, chord-burst marker, fonts, music layer structure, emotion guidance.
- **qa_plan.md / release_character_gate.md:** consume the section 7 bench, the 11.3 silhouette, palette and face passes, and the smoke list.
- **Environment:** Chromium rev 1194 at `/opt/pw-browsers`; the Vercel project connection; physical RC devices (orchestrator).

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| D16: separate animated parts → 20–40 draw calls per creature | Balanced/Mobile frame budget | `mergeStatic`, animation LOD, LOD2 part drops; measure on RC-L and RC-P1 early; skinning bake is the prepared fallback |
| c01 already 14k triangles on High LOD0 | Budget miss across 30 species | size-adaptive `segs` (0.3-4) + the contract test |
| D14 256 px atlases ≈ 4 MiB per species | Texture memory on integrated GPUs | LRU of 16; Mobile 128 px; memory shown in the overlay |
| Rapier compat bundle about 836 KB gzipped | First load | lazy chunk after the title |
| postprocessing peer-caps three at < 0.187 | Blocks three upgrades | pin 0.186.1 |
| Trimesh collider build time on 142k-triangle mountain zones | Zone load | per-chunk colliders, built in the load fade; Not measured |
| Software GL in the container misleads | False confidence | `representative: false`; no FPS quotes |
| Multiple canvases in the tool sheet exhaust contexts | Gate evidence gaps | single-context tool (0.3-7) |
| TS 7 has no compiler API | Tools that expect it break | regex scans (D24); tsx/esbuild unaffected |
| Tone CPU on phones | Audio glitches | voice caps, offline pre-render |
| localStorage eviction (Safari) | Save loss | export reminders; IndexedDB mirror is an open question |
| WebGL context loss on mobile | Black screen | rebuild from CPU caches |

## 15. Unresolved questions

1. Physical availability of RC-L, RC-P1 and RC-P2 (orchestrator). Until then, everything is Not measured.
2. Should skinning (a one-`SkinnedMesh`-per-material bake) be adopted if the D16 deviation misses budget on RC-L or RC-P1? This is prepared, not scheduled.
3. An IndexedDB mirror of the save, to defend against localStorage eviction.
4. Full portrait gameplay on phones (currently landscape-first with a portrait fallback).
5. A Rapier non-compat build (separate `.wasm`, streamed compile) to cut first-load size. It needs verification with `@react-three/rapier@2.2.0`.
6. Should `battleStages` auto-search be removed entirely, now that world v2 hand-places 2–4 stages per zone?
