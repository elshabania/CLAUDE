# Known issues

Honest list of open problems as of the release-validation pass. "Not measured" means we had no way to measure it in the build environment, not that it's fine.

## Not measured

| Area | Status |
|---|---|
| Frame rate on the target mid-range laptop (60 FPS target) | **Not measured.** The build environment only has software GL (SwiftShader), which renders towns at roughly 1–8 FPS, so those numbers say nothing about real GPUs. |
| Frame rate on modern phones (30 FPS floor) | **Not measured.** No device available. |
| Audio quality and mix | **Not measured.** All music, SFX and cries render without errors in headless Chromium, but nobody has listened to them. |
| Real playtesting / playtime | **Not run.** Balance comes from a simulator (`tests/unit/balance.test.ts`, `design/reviews/balance_sim.md`). |
| Trademark search for species and place names (release gate R-14), including the new name **Smoulderam** | **Not run.** |
| Browser matrix (Safari, Firefox, mobile browsers) | **Not run.** Only headless Chromium was used. |

## Visual

- **Environment is realistic-leaning, not photoreal.** Grass reads slightly dark and uniform; dirt paths lack detail below ~1 m; tall rock-face walls can look like long slabs from some angles; water reflects only the sky (not trees/buildings); tree shadows don't sway with wind.
- **Humans:** curled fingers in the pointing pose look a little clumsy up close; some hairstyles (braid/ponytail crowns) read slightly helmet-like; necklines are slightly faceted in extreme close-ups; no cloth or hair simulation.
- **Creatures:** Smoulderam's smoke-mane tufts look faceted up close, and its far wing is partly hidden in the ¾ front view. c03 and c12 exceed the ~25k-triangle target (~28k) because of accessories. c25–c27 intentionally keep flat paper-cut-out bodies.
- Dark wall props look near-black at night.
- The all-30 creature sheet tool crashed the dev server once under software GL (tool only, not the game).

## Gameplay / balance (simulated)

- Thinnest simulated margins: fire starter vs Cantor 5 and vs the Champion (73%); water starter vs Cantor 1 and Cantor 6 (67%).
- Odile (antagonist, two phases) is easier than Cantor 6 just before her; changing her levels had no effect in the sim.
- For two of three starters the Champion is easier than Cantor 6. Needs a real playtest before changing.
- Odile phase-B XP bug (balance report F10) is still open in `src/battle`.
- Quest hand-ins in some ch3–5 dialogue still use `{"give": item, "n": -1}`; this works (it takes the item) but newer content uses the `take` action.
- Odile's reveal on Gloamstair needs two conversations (choice first, then her reply).

## Technical

- Main JS chunk is large (single ~2.5 MB+ chunk before gzip; total built assets ≈ 7.3 MB including the 0.87 MB baked human data and HDRIs). First load on slow connections will be noticeable.
- Software renderers auto-select the Mobile quality tier; Mobile skips HDRI lighting and post-processing.
- The Vercel preview is behind Vercel Authentication (team SSO); share links expire after 23 h. A separate Vercel project for the game couldn't be created (no permission), so the game is served from the existing Next.js project at `/play`.
- The scripted smoke play-through needs long timeouts under software GL (the town renders at ~1 FPS there).
