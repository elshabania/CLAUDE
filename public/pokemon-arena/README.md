# Pokémon Arena 3D — You Are Charizard

A standalone, self-contained 3D dragon-flight battle game built with
[Three.js](https://threejs.org). **You fly as Charizard** in an
over-the-shoulder chase camera: bank into turns, dive and boost, breathe
fire where you aim, and fight waves of grounded and aerial wild creatures
over a Pokkén-style stadium while Ash cheers you on from the arena floor.

Served at `/pokemon-arena` on the deployed site, or serve the repo's
`public/` directory with any static file server and open `/pokemon-arena/`
(the script tag uses the absolute path `/pokemon-arena/game.js`).

## Gameplay

- **Survival waves** — defeat every wild creature to clear the wave; each wave
  spawns more and stronger enemies.
- **Three enemy species** with distinct AI: ROCKOR (tanky melee golem),
  VINEX (seed-shooting plant), AQUISH (fast water-gun skirmisher).
- **Four fire moves** commanded with keys 1–4, each with its own cooldown:
  | Key | Move | Effect |
  |-----|------|--------|
  | 1 | Ember | Three quick homing fireballs |
  | 2 | Flamethrower | Sustained particle cone with damage ticks |
  | 3 | Fire Spin | Flame vortex that traps and burns the target |
  | 4 | Flame Burst | Arcing AoE bomb with knockback and screen shake |
- **Progression** — XP, level-ups, and a Blaze evolution aura at level 5
  (bigger, darker, stronger Charmander).
- **Low-HP Blaze** — Charmander's tail flame flares up below 30% HP.

## Tech highlights

- Procedural terrain (flattened battle circle, rolling hills), trees, rocks,
  standing stones, drifting clouds, gradient sky dome with sun glare.
- Fully procedural character models — no external assets; Three.js is loaded
  from a CDN via an import map.
- Pooled additive-blended particle system (fire trails, explosions, vortices).
- Floating damage numbers and billboarded enemy HP bars.
- Procedural WebAudio sound effects (no audio files): fire whooshes, hits,
  explosions, level-up jingles. `M` to mute.
- Golden-hour lighting with PCF soft shadows and ACES filmic tone mapping.

## Controls

### Desktop

| Input | Action |
|-------|--------|
| Mouse | Steer your flight (click to lock pointer) |
| Shift | Boost |
| W / S | Faster cruise / brake |
| Arrow keys | Steering fallback without pointer lock |
| 1–4 | Fireball / Flamethrower / Fire Spin / Flame Burst |
| Tab | Switch target |
| M | Mute |

### Phone / tablet (touch)

| Input | Action |
|-------|--------|
| Left virtual joystick | Steer: left/right turn, up/down climb & dive |
| 🔥 button (hold) | Boost |
| Tap attack cards | Fire attacks |
| 🎯 button | Switch target |

Touch devices automatically get a lighter render profile (lower pixel
ratio, smaller shadow map, fewer grass blades/particles/crowd members).

## Stadium

The battle takes place in a Pokkén-style stadium: striped turf battlefield
with painted lines, a perimeter wall ringed with glowing ad-boards, tiered
stands filled with an instanced animated crowd, and floodlight towers.
Charmander's level-5 Blaze evolution now also unfurls Charizard-style wings.

---

Unofficial, non-commercial fan-made demo. Pokémon characters
© Nintendo / Game Freak / Creatures Inc.
