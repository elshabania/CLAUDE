# POKÉMON ARENA 3D — Module Contracts (source of truth)

Game lives in `public/pokemon-arena/`. Served at `/pokemon-arena` (no trailing slash) by a
Next.js rewrite; ALL asset/script URLs must therefore be ABSOLUTE (`/pokemon-arena/...`).

Pure browser ES modules. Import map (already in index.html):

```json
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }
```

HARD RULES for every module:
- `import * as THREE from 'three'` (and `three/addons/...` only where stated). NO other deps.
- Zero external assets: geometry is procedural, textures are `<canvas>`-generated
  (`new THREE.CanvasTexture(...)`), audio is Web Audio oscillators/noise buffers.
- No DOM access except where this doc explicitly grants ids. No `window.` globals.
- Must pass `node --check`. Top-level code = const/function defs only (no side effects;
  everything happens inside the exported factory/build functions).
- World units ≈ meters. Ground plane y=0 at arena. Characters face **+Z** in model space.
- Materials used for hit-flash must be `MeshStandardMaterial` and each must have
  `mat.userData.baseEmissive = mat.emissive.clone()` and
  `mat.userData.baseEmissiveIntensity = mat.emissiveIntensity` stored at creation.
- Keep each file self-contained; do not import other game modules unless stated.
- Be generous with visual detail/polish — this must look professionally made.

## Shared CHARACTER RIG contract

Every character factory returns a `THREE.Group` whose **origin is at the feet/ground**,
model facing +Z, and sets `group.userData` to:

```js
{
  name: 'CHARIZARD',            // display name (CAPS)
  element: 'fire',              // 'fire'|'grass'|'water'|'electric'|'rock'
  height: 2.6,                  // approx model height in units
  baseY: 0,                     // resting y offset the engine adds (0 for grounded)
  head: Object3D,               // head group (engine aims/looks with it)
  jaw: Object3D,                // hinged jaw; rotation.x in [0 .. 0.55] opens mouth
  mouthAnchor: Object3D,        // empty inside the mouth (breath/beam origin)
  mouthGlow: Mesh,              // small emissive sphere at mouth, .visible=false default
  tailGroup: Object3D,          // tail root (engine sways it)
  flame: Object3D,              // element-aura group (tail flame / spores / mist / sparks)
  flameLight: PointLight,       // inside flame, modest intensity (engine pulses it)
  wings: [],                    // [{group, sign}] sign:+1 left,-1 right. Wing rest pose set;
                                // engine flaps via group.rotation.z = sign*angle. [] if none.
  bodyMats: [],                 // MeshStandardMaterials for hit-flash (see HARD RULES)
  arms: [],                     // [{pivot}] shoulder pivots at shoulder pos; engine swings rotation.x
  legs: [],                     // [{pivot}] hip pivots at hip pos; engine swings rotation.x
}
```

Animation is driven by the ENGINE through this rig (walk swings, flaps, jaw, tail,
idle bob). Character modules deliver static posed geometry + the rig handles above.
Optional: `group.userData.animateExtra = (t, dt, state) => {}` for module-specific flair
(state: `{speed, flying, attacking}`); keep it cheap.

Shadows: cast on all main meshes (`castShadow = true`), no receiveShadow on character.
Triangle budget per character ≲ 25k. Use canvas textures for skin detail (scales,
leaf veins, shell plates, fur stripes) on at least the torso.

## File ownership & exports

### characters/charizard.js → `export function createCharizard(): THREE.Group`
Orange dragon, cream belly plates (canvas texture), teal inner wing membranes, two
horns, FIRE tail flame (layered transparent cones + sprite flicker), `wings` populated.
Height ~2.7. element 'fire'.

### characters/venusaur.js → `export function createVenusaur(): THREE.Group`
Teal/green quadruped-ish bulky body (engine still swings arms/legs pivots — give it 4
legs: 2 in `legs`, 2 in `arms`), giant pink flower + leaf skirt on back (the flower is
`flame` aura: drifting petal/spore particles + soft pink light). Canvas texture mottled
spots. Height ~2.3. element 'grass'. wings: [].

### characters/blastoise.js → `export function createBlastoise(): THREE.Group`
Blue bipedal turtle, brown canvas-textured shell (plate grid), two steel hydro cannons
on shell shoulders, `flame` = fine mist/bubble particles + cyan light at the cannons.
mouthAnchor near cannon tips is OK but jaw must still exist on head. Height ~2.5.
element 'water'. wings: [].

### characters/voltaron.js → `export function createVoltaron(): THREE.Group`
ORIGINAL electric design: sleek black/yellow storm-panther with lightning-bolt crest,
charged shoulder coils, crackling spark aura (`flame` = jittering bolt segments redrawn
via animateExtra + yellow light), glowing cyan eyes. Height ~2.4. element 'electric'.
wings: [] (it dashes; flight via engine levitation is fine).

### characters/ash.js → `export function createAsh(): THREE.Group`
Small human trainer (cap, jacket) used as a corner-podium coach prop, waving.
Same rig shape (arms/legs pivots; wings [], flame = empty Group + dim light ok,
jaw can be a tiny hidden hinge). Height ~1.7. element 'fire' (unused).
Also `export function createReferee(): THREE.Group` — recolored variant (zebra shirt, flag).

### characters/enemies.js
```js
export const ENEMY_SPECIES = [ /* exactly 4, in this order */
 { id:'golem',  name:'TERRADON', element:'rock',     flying:false, hp:95,  speed:5.2,
   meleeRange:3.4, dmgMelee:13, dmgRanged:8, projectileColor:0xcc8844, projectileSpeed:20 },
 { id:'plant',  name:'VINEMAUL', element:'grass',    flying:false, hp:85,  speed:6.0,
   meleeRange:3.2, dmgMelee:11, dmgRanged:9, projectileColor:0x66dd44, projectileSpeed:24 },
 { id:'water',  name:'AQUARITH', element:'water',    flying:false, hp:80,  speed:6.6,
   meleeRange:3.0, dmgMelee:10, dmgRanged:10, projectileColor:0x44aaff, projectileSpeed:28 },
 { id:'storm',  name:'GALVATALON', element:'electric', flying:true, hp:75, speed:7.5,
   meleeRange:3.4, dmgMelee:12, dmgRanged:11, projectileColor:0xffee55, projectileSpeed:32 },
];
export function createEnemy(speciesId): THREE.Group  // full rig contract above
```
- golem: rock boulder-golem, mossy cracked-stone canvas texture, glowing magma seams
  (emissive in cracks), heavy fists. height ~3.0.
- plant: thorned plant beast, maw with fang rows, vine whips as tailGroup, leaf mane.
- water: finned aquatic creature, glossy body (high clearcoat-ish via envMapIntensity),
  water-drip particles as flame.
- storm: storm BIRD (flying:true): hawk silhouette, `wings` populated (it must flap),
  crackling feather tips, hovers — engine keeps it at y≈2.5–4.
Each enemy: `userData.species = speciesEntry` in addition to rig fields.
AI/state machine lives in the ENGINE — enemies.js is geometry+stats only.

### lookdev.js
```js
export function initLookdev({ renderer, scene, camera, width, height, quality })
  -> { composer, bloomPass, gradePass,
       sun, sunTarget,                     // DirectionalLight + its .target (both added to scene)
       setSize(w, h),
       update(dt, t, playerPos) }          // sun follows player; drives grade uniforms
```
- renderer: ACESFilmicToneMapping, exposure ~1.05, PCFSoftShadowMap, physically correct lights.
- IBL: PMREMGenerator + RoomEnvironment (`three/addons/environments/RoomEnvironment.js`),
  `scene.environment = pmrem`, subtle (scene.environmentIntensity ≈ 0.35 if supported,
  else keep materials' envMapIntensity moderate).
- Golden-hour sun: warm 0xffd9a0 directional, elevation ~28°, shadow camera ~90 units wide,
  shadowMapSize from `quality.shadowMapSize`. `update` re-centers sun+target on playerPos
  (quantized to avoid shimmer).
- Sky: big gradient dome or scene.background gradient texture + warm fog
  (`scene.fog = new THREE.Fog(...)`, far ~420).
- Composer: RenderPass → UnrealBloomPass(strength 0.85, radius 0.55, threshold 0.8)
  → grade ShaderPass → OutputPass. Grade shader uniforms:
  `uTime, uVignette, uGrain, uAberration, uExposure` implementing: vignette,
  warm-highlight/teal-shadow split tone, filmic S-curve, edge chromatic aberration,
  luma-adaptive grain, slow exposure breathing (engine never touches these; `update` does).
- `quality` = { tier, isMobile, pixelRatio, shadowMapSize, bloom } (see perf.js).
  If quality.bloom === false, skip bloomPass.

### environment.js
```js
export function buildEnvironment({ scene, quality })
  -> { update(dt, t, playerPos),
       arenaRadius,                 // playable flat radius (≈ 40)
       getGroundHeight(x, z) }      // terrain height; 0 inside arena
```
Pokkén-style stadium at origin: striped two-tone turf disc (canvas texture rings/stripes
+ painted center emblem), low glowing ad-band wall at arenaRadius (animated emissive
canvas texture scrolling sponsor-ish glyphs — invented brands only), crowd bowl beyond:
**InstancedMesh crowd, `quality.crowdCount` (2200 high tier)** with per-instance color
variety and a wave/bounce in `update`, 4 animated jumbotrons (canvas textures that
repaint a few times/sec: "EMBER CROWN GRAND PRIX", round ticker), banners/flags (vertex-
waved), floodlight pylons with visible cone glow, torch braziers with particle fire,
a blimp slowly orbiting with a searchlight beam.
Outside: 560×560 terrain (heightfield ridges rising to a mountain ring at the edge,
flat ≤ arena+10), detail canvas texture (grass/dirt mottling), instanced wind-swaying
grass blades using a custom shader/onBeforeCompile (`quality.grassCount`), tree forests
(instanced low-poly pines + broadleaf), 2–3 lakes (animated normal-ish shimmering
planes), flyable volumetric-look cloud banks (clusters of soft sprite puffs y 60–140).
`getGroundHeight` must match the visual terrain (sample same height function).

### ambience.js
```js
export function initAmbience({ scene, quality })
  -> { update(dt, t, playerPos, camera) }
```
God-ray shafts slanting into the stadium (additive transparent planes, camera-faded),
firefly particle field that activates outside arena, 2 bird flocks (instanced, looping
flight paths, banking), falling leaves near forests, butterflies (flapping two-quad
instances) near grass, heat-shimmer plane above arena torches (refraction-ish wobble via
transparent normal-distorted material — cheap shader). Respect quality.tier (halve
counts on 'low').

### music.js
```js
export function createMusic(ctx, out)   // AudioContext, destination GainNode
  -> { setMode(mode),                   // 'none'|'title'|'battle'|'boss'
       playVictory(), playDefeat(),     // one-shot fanfares (auto-duck current mode)
       update() }                       // call every frame; does lookahead scheduling
```
Procedural scheduler (lookahead ~0.12s, schedule horizon ~0.3s). Battle theme 132bpm:
punchy kick (sine drop), noise snare, eighth-note bass line (square+lp), brass-ish saw
stabs on a I–VI–VII minor progression, delayed lead melody (feedback delay node).
Boss theme 140bpm phrygian: driving toms, tritone stabs, ostinato bass. Title: calm
arps. Crossfade modes over ~1.2s with per-mode gain nodes. Victory fanfare: major
triad fanfare + arp run. Keep total output ≈ -12dB headroom (master gain ~0.5).

### sfx.js
```js
export function createSfx(ctx, out) -> {
  roar(element), cheer(intensity01), hit(element, power01), swing(), dodge(),
  burst(element), beamStart(element) /* returns stopFn */, spin(), bite(),
  wingFlap(), step(), levelUp(), megaSurge(), select(), uiMove(), counter(),
  fireworks(), announcer(), hurt(), setWind(level01) /* continuous wind loop */ }
```
All synthesized: filtered noise bursts, pitch-swept oscillators, per-element timbre
(fire=crackly noise, water=bubbly LP noise, grass=woody chirps, electric=zappy square
jitter, rock=low thud). setWind drives a looping filtered-noise node's gain+cutoff.

### story.js  (pure data + functions; NO three.js, NO DOM)
```js
export const FAN_DISCLAIMER = '…Pokémon © Nintendo / Game Freak / Creatures…';
export function getRoundIntro(round, species, isBoss)
  -> { announcer, speaker, lines: [..2-3 short strings] }   // species = ENEMY_SPECIES entry
export function getMilestone(round) -> null | { announcer, speaker, lines }  // 4/8/12/16
export function getKOLine(species) -> string
export function getVictory(playerName) -> { announcer, lines }   // grand-prix win (round 16 cleared)
export function getDefeat(round) -> { announcer, lines }         // epilogue
export function getTaunt(species) -> string                      // mid-fight bark
```
Tone: hype sports announcer ("LADIES AND GENTLEFOLK…") + per-species personality
(golem stoic, plant feral, water smug, storm regal). Story arc: the **Ember Crown
Grand Prix** — 16 rounds, milestone beats at 4 (qualifiers), 8 (semifinal &
rival storm-bird foreshadow), 12 (eve of the final), 16 (the Ember Crown).

### cinematics.js
```js
export function createCinematics({ camera, letterboxTop, letterboxBottom })
  -> { playChallengerIntro(enemyGroup, playerGroup, onDone),  // 1.8s
       skip(), isActive(), update(dt) }
```
Letterbox bars slide in (DOM style.height), camera does a low orbit sweep across the
challenger's face then a fast pull to behind-player framing both, then bars out and
onDone(). While isActive() the engine yields camera control. Always restorable: store
and reapply nothing — engine reframes after onDone.

### perf.js
```js
export function detectQuality()           // UA/touch + screen → initial tiers
  -> { tier:'high'|'medium'|'low', isMobile, pixelRatio, shadowMapSize,
       crowdCount, grassCount, cloudCount, bloom:true|false }
export function createPerf({ renderer, composer, quality })
  -> { update(dt) }   // EMA frame time; steps pixelRatio down/up between
                      // quality.pixelRatio and 0.6× of it; never thrashes (5s hysteresis)
```
high: pr=min(devicePixelRatio,2), shadow 2048, crowd 2200, grass 9000, bloom on.
medium: pr≤1.5, shadow 1024, crowd 1200, grass 4500, bloom on.
low(mobile default): pr≤1.25, shadow 1024, crowd 700, grass 2200, bloom on (cheap),
extra-low fallback handled by createPerf stepping pixelRatio.

### game.js — THE ENGINE (entry module)
Imports all of the above (characters from `/pokemon-arena/characters/…` relative paths
`./characters/charizard.js` etc.), owns: title screen flow, input (KBM + touch),
player controller (ground walk/run + full flight model), 6-move combat, dodge i-frames,
enemy AI state machine, type chart & statuses, progression/XP/mega, rounds/story/HUD
wiring, camera (3rd person + flight over-shoulder), audio bootstrap, main loop, resize.
All DOM ids listed in index.html § below belong to game.js (plus the two letterbox ids
passed into cinematics).

## index.html — canonical DOM ids

`#app` (canvas mount), `#title-screen, #title-sub, #char-cards` (cards have
`data-char="charizard|venusaur|blastoise|voltaron"`, class `char-card`), `#char-desc,
#btn-start, #boot-status, #title-disclaimer`;
HUD: `#hud, #player-name, #player-level, #player-hp-fill, #xp-fill, #mega-wrap,
#mega-fill, #enemy-panel, #enemy-name, #enemy-sub, #enemy-hp-fill, #round-value,
#score-value, #moves-bar` (slots `#move-slot-1`…`#move-slot-6`, each containing
`.move-key .move-name .move-cd`), `#combo-counter, #callout, #center-msg,
#status-row` (player status icons), `#enemy-status-row`,
`#announcer-banner, #announcer-text, #dialogue, #dialogue-name, #dialogue-text,
#dialogue-next, #damage-layer, #flash-overlay, #hurt-vignette,
#letterbox-top, #letterbox-bottom, #end-screen, #end-title, #end-lines, #btn-restart,
#touch-ui, #joystick-zone, #joystick-knob, #btn-fly, #btn-boost, #btn-dodge,
#btn-target, #mobile-moves` (buttons `.mmove[data-move="1..6"]`), `#rotate-hint`.

## Engine gameplay constants (for reference)

Type chart (atk→def 1.5x): fire→grass, grass→water, water→fire & rock, electric→water
& storm/flying, rock→fire & flying. 0.65x reverses. Moves: 1 STRIKE 3-chain 16/16/26
(finisher knockdown + 90ms hit-stop); 2 BITE 20 (×1.75 counter vs windup/recovery);
3 BREATH stream ~9/tick ×6, applies element status; 4 BURST projectile 24 AoE r6;
5 SPIN SLAM 22 360° r4.5; 6 HYPER BEAM 55, 70-unit line, 12s cd. Dodge Q/E 0.3s
i-frames. Statuses: burn/paralyze/soak/leech. Enemy HP ×(1+0.22·(round−1)); every 4th
round is a 2.2×-HP, 1.45×-scale boss. Round heal 20%, level-up heal 50%, Mega at Lv5+
(meter → F key, 10s, +50% dmg). Win the Grand Prix at round 16; endless after.
