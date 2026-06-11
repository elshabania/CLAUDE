# Ember Strike — 3D Action Brawler

A real-time **3D action brawler** in the browser. You control **Ember**, a
fire-powered hero — a genuine **rigged, animated 3D character model** loaded at
runtime — and fight a **Rival Unit** in a cinematic arena. Run, sprint, combo
with punches, blast fireballs, breathe flame, and jump. Built with
[Three.js](https://threejs.org/); no build step, no bundler.

Open `/pokemon-arcade` on the deployed site, or `public/pokemon-arcade/index.html`
locally via any static server.

> **Why "Ember", not Charmander?** A hyper-realistic, fully-animated game
> character needs an artist-made, rigged-and-skinned 3D model — not primitives
> generated in code. This uses a real rigged model (with proper Idle / Walk /
> Run / Punch / Jump / Death animations) so it *moves and fights like a real
> game character*. The official Pokémon designs are copyrighted, so the hero is
> an original fire-themed character rather than Charmander.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| `Shift` | Sprint |
| `Space` | Jump / dodge (brief invulnerability) |
| `J` | **Punch** — melee |
| `K` | **Fire Blast** — ranged fireball |
| `L` | **Flamethrower** — continuous beam (drains the flame meter) |

On touch devices a virtual joystick and action buttons appear automatically.

## How it's built

- **Real character** — a rigged, skinned, animated glTF model is downloaded at
  runtime (Three.js' `RobotExpressive`, CC0) and driven by an `AnimationMixer`
  with a small state machine (locomotion blending between Idle/Walk/Run, plus
  one-shot Punch/Jump/Death actions with snappy commit timing). The same model
  is cloned via `SkeletonUtils` and re-tinted for the hero and the rival.
- **Cinematic rendering** — an `EffectComposer` pipeline with `UnrealBloomPass`
  makes every flame, ember and blast glow; ACES filmic tone mapping; image-based
  lighting from a `RoomEnvironment` baked through a `PMREMGenerator` for real
  PBR reflections.
- **Effects** — an additive `THREE.Points` particle pool for fire, embers,
  sparks and smoke, with a fire aura on the hero during fire moves.
- **Atmosphere** — soft-shadowed directional sun, a bloom-flared sun disc,
  drifting embers, soft contact (blob) shadows, procedurally textured ground,
  a gradient sky dome and fog.
- **Game feel** — third-person camera that frames both fighters, hit-shake,
  i-frames on jump/dodge, a flame-meter resource, and an enemy AI that closes
  in, telegraphs, and punches.

## Files

- `index.html` — markup, HUD, title/result screens, startup diagnostics
- `styles.css` — HUD, overlays and responsive/touch layout
- `game.js` — engine: scene, model loading, animation state machine, particles,
  combat, AI, input, game loop
