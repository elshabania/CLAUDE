# Creature Art QA pass (Creature Art Director)

Date: 2026-09-24. Scope: all 30 species builders (`src/creatures/species/c01..c30.ts`), checked against `design/creatures.md` v2 rows, `release_character_gate.md` (proportion bands, readable faces, family resemblance, distinctness) and `ANCHORS.md`.

**Method.** I rendered the dev tools (`?tool=sheet`, `?tool=silhouettes`, `?tool=viewer&id=`) in headless Chromium using `scripts/shot.mjs`, which uses software GL. The shading therefore only approximates the real renderer. I drew the 8-state eye atlases and 4-state mouth atlases on a strip for every species by importing `face.ts` into the dev page. I made the fixes, re-rendered the full sheet and silhouettes, then ran `tsc --noEmit` (clean) and `vitest tests/unit/creatures.test.ts` (30/30 pass).

**Screenshots examined** (in the session scratchpad `art/`):
- Full sheet and side silhouettes: `sheet_before.png`, `sil_side_before.png`, `sheet_after.png`, `sil_side_after.png`
- Near-front close-ups (yaw 20): `front_a_before.png` … `front_e_before.png`, `front_fix1.png`, `front_fix2.png`
- Viewer shots: `view_c01_before.png`, `view_c03_before.png`, `view_c03_fix1.png`, `view_c06_before.png`, `view_c17_before.png`, `view_c18_before.png`, `view_c18_fix2.png`, `view_c20_before.png`, `view_c30_before.png`, `view_c30_fix1.png`, `view_c30_fix2.png`
- Face atlases: `atlas_1.png`, `atlas_2.png`, `atlas_after.png`

## Cross-cutting fixes
| Issue | Fix |
|---|---|
| The spec's resting emissive cap of ≤ 1.5 was not enforced. Eight builders had resting values of 1.6–2.5 (c02, c04, c05, c06, c15, c18, c27, c30). | Clamped every resting `emissive` above 1.5 to 1.5 in the species files. Transient flares still go through the anim `glowGain`. |
| c15, c17 and c18 used the withdrawn `slit` pupil (v2 whitelist). | Changed to `v-oval`. |
| On dark skins (c06, c15, c18, c30), the closed, happy, hurt and faint eye frames used the default near-black stroke, so they were invisible. Blinks and faint read as "eyes vanished". | Added a light per-species `outline` colour: c06 ember, c15 cyan, c18 aurora green, c30 corona gold. The strokes now read on every frame (`atlas_after.png`). |

I made no changes to `assemble.ts` or `face.ts`. The generic atlas worked, and the problem was only the per-species parameters.

## Per-species table
| id | Name | Verdict | Fixes made | Remaining notes |
|---|---|---|---|---|
| c01 | Fizzkit | pass | none | Cute and readable, with big amber eyes and brows. The flank flaps sit almost edge-on, so the rib-flap motif is weak at 20 px. The motif is still carried by c02 and c03. The top of the torso picks up the warm rim at grazing angles in the ortho sheet, but it reads as teal in the viewer. |
| c02 | Crackleap | pass | emissive clamp | Good biped. The spark arc floats between the fork prongs; this is intentional per spec. |
| c03 | Tempestrel | **fixed** | Body rmax 0.13→0.165, bigger keel and neck, head ×1.18, eye r 0.07→0.08, lid 0.25→0.18 | It read as a thin dragonfly with an unreadable face, and now has stage-3 mass. The face is still small relative to the 2.8 m span. This is inherent to the kite plan. |
| c04 | Wickwool | pass | emissive clamp | Appealing lamb face. The legs are a little long and segmented. |
| c05 | Kilnhorn | **fixed** | Head ×1.1, eye r 0.048→0.056, lid 0.18→0.1, emissive clamp | The eyes were pin-pricks. The legs are still spindly, which matches the spec's goat proportions. |
| c06 | Magmouflon | **fixed** | Head ×1.22 (horn rings scale with it) and moved forward, eye r 0.044→0.052, lid 0.2→0.12, ember eye outline, emissive clamp | The head was buried in the plated hump. The face now reads, and the kiln rings are prominent. Stage 3 is clearly grand. |
| c07 | Rippleback | pass | none | Strong otter face. The grounded foreleg is one long straight capsule and looks stick-like; an elbow bend would be a nice-to-have. |
| c08 | Tidesleek | pass | none | Clean serpent, and the shingle scutes carry the motif. |
| c09 | Floeguard | pass | none | The v2 redesign is respected (no helmet; back carapace and fan shield). The fan shield reads as an ice rock from the front. |
| c10 | Dozebud | pass | none | Very appealing. |
| c11 | Lullstalk | pass | none | Long-armed sloth. The eye-mask motif is clear. The face is small but readable. |
| c12 | Belladrowse | **fixed** | Head ×1.3 and moved forward | The face was lost under the canopy. The mask, brows and sleepy half-moon eyes now read. |
| c13 | Rollith | pass | none | Readable ball with the hex motif. |
| c14 | Cairnback | pass | none | The head is small but the eyes read. Good family bridge. |
| c15 | Lodestodon | **fixed** | Head ×1.2 and moved forward out of the dome, eye r 0.056→0.064, pupil slit→v-oval, cyan eye outline, emissive clamp | The box head is still quite "robotic". A softer bevelled snout shield would suit the family's pale snout better (not done). |
| c16 | Rimelet | pass | none | Very cute. |
| c17 | Sleetribbon | **fixed** | Eye r 0.06→0.074, pupil slit→v-oval | Watch item: a periwinkle serpent with a white throat and head curls sits near a well-known franchise serpent. The sail-fin row and the crescent brow fins keep the silhouette distinct. If a reviewer flags it, drop the head curls first. |
| c18 | Borealoop | **fixed** | Head ×1.35, eye r 0.042→0.05, pupil slit→v-oval, aurora eye outline, emissive clamp | The head was tiny against the ring. The flake core reads as a flat white X at a distance. |
| c19 | Gustling | pass | none | Excellent. |
| c20 | Whirlseed | pass | none | The face is small but readable in the viewer. The samara motif is clear. |
| c21 | Samarch | pass | none | Rotor and raptor read clearly. |
| c22 | Ringdrip | pass | none | |
| c23 | Brineloop | pass | none | The brine mantle and ring spots are good. |
| c24 | Drapetide | pass | none | Regal. The legs are thin but it is a tripod, as intended. |
| c25 | Snipling | pass | none | The cut-out look is strong. |
| c26 | Marionyx | pass | none | |
| c27 | Emberfold | pass | emissive clamp (core 2.5→1.5) | The carved face leans toward a "jack-o'-lantern". It is acceptable and original. |
| c28 | Dawnfry | pass | none | The mouth ring reads slightly odd at close range. |
| c29 | Lumarlin | pass | none | It is close to a realistic marlin, and the eye is modest. The light-stripe and sail fin read. |
| c30 | Coronaleen | **fixed** | P `#231F3A`→`#2A2552` (still eclipse indigo; it rendered brown-olive under the gold rim), rim changed to lavender `#D9D0FF` at 0.3, eye r 0.058→0.088, ring pupil (per spec), gold outline, lid 0.35→0.22, eclipse and corona enlarged (corona w 0.7→0.9) and raised, emissive clamp | It now reads as indigo with a clear gold crown and a kind face. The palette and rim hex values deviate slightly from the creatures.md row, so the doc owner should sync them. |

## Family resemblance and stage-3 grandeur
Every family keeps its motif across the 3 stages:
- f01: sails and fork
- f02: glowing horns
- f03: shingles and white muzzle
- f04: mask and bells
- f05: hex dome
- f06: ice crest and flake
- f07: samara wings
- f08: blue rings and six arms
- f09: flat plates and lit holes
- f10: stripe and pale belly

After the fixes, every stage 3 is clearly larger and more elaborate than its stage 1. I found no clipping, inverted or missing parts, apart from the intentional floating pieces: the c02 spark arc and the orbiting lodestones on c15.
