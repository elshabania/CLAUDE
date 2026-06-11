# Cosmos — a living galaxy in the browser

A real-time, GPU-driven **spiral galaxy**: up to ~300,000 stars rendered as
custom-shader points with differential rotation, a blazing core, drifting
nebulae, a starfield backdrop, and bloom. Built from scratch with
[Three.js](https://threejs.org/) — no assets, no build step. This is the kind
of pure particle/shader spectacle that browsers do best.

Open `/cosmos` on the deployed site, or `public/cosmos/index.html` locally via
any static server.

## Interact

- **Drag** to orbit the galaxy
- **Scroll / pinch** to zoom
- **Click / tap** to ignite a supernova burst on the galactic disk
- **Panel** (top-right): star count, swirl speed, number of arms, hue, and a
  **Randomize** button to reshape the whole galaxy

## How it works

- Every star's final position is computed **in the vertex shader** each frame
  from per-star attributes (radius, branch angle, jitter). Inner stars orbit
  faster than outer ones, producing realistic spiral shear over time — all on
  the GPU, so hundreds of thousands of stars stay smooth.
- Color is a CPU-baked gradient from a hot core tint to a cool rim tint (hue
  is adjustable), with a sprinkle of bright white-giant stars.
- A soft additive fragment shader gives each point a glowing falloff; an
  `UnrealBloomPass` makes the whole field bloom like real starlight.
- Nebula clouds are large tinted additive sprites; the backdrop is a few
  thousand points scattered on a sphere; the core is layered glow sprites.
- Star count auto-scales down on phones to keep the frame rate high.

## Files

- `index.html` — canvas, UI, startup diagnostics, Three.js import map
- `styles.css` — overlay UI and responsive layout
- `galaxy.js` — engine: galaxy shader, generation, nebulae, supernovae, loop
