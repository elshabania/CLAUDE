# Charmander Arena — 3D Pokémon-style Arcade Battle

A self-contained, real-time 3D battle game. You play as **Ash**, commanding
your **Charmander** against a wild challenger. Built with
[Three.js](https://threejs.org/) (loaded from a CDN) — no build step, no bundler.

Open `/pokemon-arcade` on the deployed site, or `public/pokemon-arcade/index.html`
locally via any static server.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move Charmander |
| `Shift` | Sprint |
| `Space` | Dodge roll (brief invulnerability) |
| `J` | **Scratch** — melee combo |
| `K` | **Ember** — lobbed fireball |
| `L` | **Flamethrower** — continuous beam (drains the flame meter) |

On touch devices a virtual joystick and action buttons appear automatically.

## Battle design

- **Flame meter** — Flamethrower is your heaviest hit but burns the orange
  meter under your HP bar. Stop firing to let Charmander's tail recharge; the
  tail flame visibly dims as the meter drops.
- **Dodge i-frames** — rolling through a Water Gun or Tackle avoids all damage.
- **Enemy AI** — the wild Squirtle keeps mid-range, strafes, telegraphs its
  attacks with a crouch/charge, then fires Water Gun volleys or lunges with
  Tackle. Read the wind-up and punish the recovery.
- First fighter to drop the other's HP to zero wins.

## How it's built

Everything is procedural — no external model or texture assets:

- **Characters** (`game.js`) are assembled from primitive geometry (spheres,
  capsules, cones) grouped into rigs, then animated by rotating the rig parts
  (walk cycles, attack poses, KO falls).
- **Cinematic rendering** — an `EffectComposer` pipeline with `UnrealBloomPass`
  makes every flame, ember and energy attack glow; ACES filmic tone mapping
  ties it together.
- **PBR materials** — creatures use `MeshPhysicalMaterial` with clearcoat and
  sheen, lit by an image-based environment (`RoomEnvironment` baked through a
  `PMREMGenerator`) so surfaces pick up real reflections and ambient bounce.
- **Effects** use a single additive `THREE.Points` particle pool for fire,
  embers, water, sparks and smoke, plus glow sprites and a real point light
  for Charmander's tail flame.
- **Lighting & atmosphere** — a warm directional "sun" with soft shadow maps,
  a hemisphere fill, a cool rim light, a bloom-flared sun disc, drifting
  ambient embers, soft contact (blob) shadows under each fighter, procedurally
  textured ground with bump detail, a gradient sky dome and exponential fog.
- **Camera** dynamically frames both fighters and adds hit-shake on impact.

## Files

- `index.html` — markup, HUD, title/result screens, import map for Three.js
- `styles.css` — HUD, overlays and responsive/touch layout
- `game.js` — engine: scene, models, particles, combat, AI, input, game loop
