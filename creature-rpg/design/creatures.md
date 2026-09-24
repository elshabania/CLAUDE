# Creatures — Art Direction, Build Specs and Species Data

Owner: Creature Art Director · Status: design v1 (2026-09-24) · Binding inputs: `design/MASTER_PROMPT.md`, `design/ANCHORS.md`.

This document defines all 30 species (`c01`–`c30`, families `f01`–`f10`): their identity, appearance, faces, animation, procedural build specs, per-species numbers for the Systems Designer, the silhouette-preview procedure and the originality audit. Nothing here has been built, rendered or measured yet. Every "readable at 20 px" statement is a **design target** that the silhouette script (section 7) must verify. None of it has been verified yet.

---

## 0. Roster index

H = model height in metres in the neutral idle pose, measured from the lowest point of the model to its highest standard part (VFX excluded). For floaters, H excludes the hover gap. Length or span is given where it exceeds H. Silhouette category codes are defined in section 7.

| id | Name | Fam | Stg | Types | Body plan | H (m) | Len/span (m) | Sil. cat | Dominant colour pair |
|---|---|---|---|---|---|---|---|---|---|
| c01 | Fizzkit | f01 | 1 | electric | small quadruped lizard | 0.35 | 0.70 L | QS | teal / yellow |
| c02 | Crackleap | f01 | 2 | electric | upright biped sprinter | 0.90 | 1.30 L | BP | deep blue / yellow |
| c03 | Tempestrel | f01 | 3 | electric · gale | rib-sail kite glider | 1.60 | 2.80 span | WG | storm indigo / cyan |
| c04 | Wickwool | f02 | 1 | fire | small quadruped lamb | 0.45 | 0.55 L | QS | cream / brick red |
| c05 | Kilnhorn | f02 | 2 | fire | leaping quadruped ram | 1.00 | 1.20 L | QL | red-brown / charcoal |
| c06 | Magmouflon | f02 | 3 | fire · stone | heavy fore-massed quadruped | 1.70 | 2.30 L | QL | basalt black / magma orange |
| c07 | Rippleback | f03 | 1 | water | small quadruped otter | 0.40 | 0.80 L | QS | otter brown / sea teal |
| c08 | Tidesleek | f03 | 2 | water | elongated serpentine swimmer | 0.80 | 2.00 L | SR | slate blue / aqua |
| c09 | Floeguard | f03 | 3 | water · frost | upright armoured biped | 1.60 | 1.10 L | BP | ice white / slate |
| c10 | Dozebud | f04 | 1 | verdant | curled ball (pod-hugger) | 0.35 | 0.40 L | RB | moss green / tan |
| c11 | Nodbell | f04 | 2 | verdant · toxin | long-armed biped | 1.20 | 0.60 L | BP | moss green / foxglove purple |
| c12 | Belladrowse | f04 | 3 | verdant · toxin | canopy-backed knuckle-walker | 2.20 | 2.00 L | QL | dark green / deep purple |
| c13 | Rollith | f05 | 1 | stone | rolling armoured ball | 0.30 | 0.45 L | RB | warm grey / tan |
| c14 | Cairnback | f05 | 2 | stone | domed quadruped, club tail | 0.90 | 1.60 L | QL | stone grey / lichen ochre |
| c15 | Lodestodon | f05 | 3 | stone · electric | colossal dome, orbiting stones | 1.90 | 2.60 L | QL | iron grey / crystal cyan |
| c16 | Rimelet | f06 | 1 | frost | sidewinding hatchling serpent | 0.25 | 0.60 L | SR | frost white / ice cyan |
| c17 | Sleetribbon | f06 | 2 | frost | sail-finned serpent | 0.70 | 3.00 L | SR | periwinkle / white |
| c18 | Borealoop | f06 | 3 | frost · lumen | floating ring-serpent | 1.80 | 1.60 span | FL | polar navy / aurora green |
| c19 | Gustling | f07 | 1 | gale | round hopping fledgling | 0.30 | 0.35 L | RB | off-white / sky blue |
| c20 | Whirlseed | f07 | 2 | gale · verdant | samara-winged swift | 0.60 | 1.40 span | WG | blue / seed tan |
| c21 | Samaraptor | f07 | 3 | gale · verdant | rotor-winged hover raptor | 1.50 | 2.00 rotor | WG | deep green / gold |
| c22 | Ringdrip | f08 | 1 | toxin | six-armed land octopus | 0.30 | 0.50 L | RD | amber / electric blue |
| c23 | Brineloop | f08 | 2 | toxin · water | upright four-leg octopus | 0.90 | 0.70 L | RD | ochre orange / electric blue |
| c24 | Venomantle | f08 | 3 | toxin · water | cloaked tripod octopus | 1.80 | 1.60 span | RD | deep violet / blue |
| c25 | Snipling | f09 | 1 | shade | flat cut-out biped | 0.40 | 0.25 L | FT | ink black / violet |
| c26 | Marionyx | f09 | 2 | shade | suspended marionette | 1.10 | 0.50 L | FL | ink black / ghost cyan |
| c27 | Cinderscrim | f09 | 3 | shade · fire | folding-screen spectre | 2.00 | 1.10 span | FT | char black / ember orange |
| c28 | Dawnfry | f10 | 1 | lumen | round floating fry | 0.30 | 0.45 L | FL | peach / pink |
| c29 | Lumarlin | f10 | 2 | lumen | air-swimming marlin | 0.80 | 2.00 L | FL | pearl white / gold |
| c30 | Umbraleen | f10 | 3 | lumen · shade | floating baleen whale | 2.00 | 5.50 L | FL | indigo / corona gold |

Every type appears exactly once as a secondary type, except toxin, verdant and water, which each appear on two stages of the same family. The primary→secondary pairs form a derangement: f01 electric→gale, f02 fire→stone, f03 water→frost, f04 verdant→toxin, f05 stone→electric, f06 frost→lumen, f07 gale→verdant, f08 toxin→water, f09 shade→fire, f10 lumen→shade. No two families share a secondary, and no family repeats its primary. The secondary type arrives at different stages to vary the strategy: at stage 2 for f04, f07 and f08, and at stage 3 for all other families.

---

## 1. Name conflict review

Method: exact-phrase web searches, run 2026-09-24 through the session's web-search tool (one US-based engine), for each proposed name, several of them combined into OR queries. **Limitations:** combined OR queries can under-report hits. No trademark registers (USPTO, EUIPO, WIPO) were searched. Non-English markets were not checked. This is a screening pass, not a clearance, and **no legal clearance is claimed.** A human or legal check of trademark registers is still an open item (section 10).

### 1.1 Starter working names (supplied by the brief)

| Working name | Findings (evidence) | Decision |
|---|---|---|
| **Voltra** | Used as a character name in several fan works (Rainimator fanfic wiki, Istula shared-universe wiki, Storyshift), a "Voltra Online" community site, and a World of Warcraft player character. The "Volt-" prefix is crowded in the genre (e.g. Voltorb). | **Renamed.** The stage-1 species is now **Fizzkit**, and the family label is "Fizzkit line". |
| **Emberhorn** | An existing **creature named "Emberhorn" in the monster-collecting mobile game Neo Monsters** (Fandom wiki). Also a Rodeo Stampede animal, the Magic: The Gathering card "Emberhorn Minotaur", and a "G4K Emberhorn Deer Escape" web game. The direct genre collision is disqualifying. | **Renamed.** The stage-1 species is now **Wickwool**, and the family label is "Wickwool line". |
| **Rippleback** | Hits only as a Speedo swimsuit back style and a furniture collection name (Barkman, Amish Tables, Legacy Furniture), both descriptive product-line uses. No creature or game-character use found. | **Kept** as c07. Low risk, recorded for legal review. |

### 1.2 Rejected replacement candidates (evidence of the process)

| Candidate | Finding | Result |
|---|---|---|
| Zeplet | Near-identical to "Zaplet", a Lightning-type critter in *Clash of Critters* | rejected |
| Kindlamb | An existing fan-made ("Fakemon") **fire-type lamb starter** by artist BillSpooks | rejected |
| Zepharion | A named black dragon NPC in *World of Warcraft: Dragonflight* | rejected |
| Arcstrider | A *Destiny 2* Hunter subclass | rejected |
| Auroboros | *Auroboros: Coils of the Serpent*, a TTRPG setting (Warchief Gaming), plus a fashion house | rejected |
| Frostcoil | "Frostcoil Sea Serpent" in the *Tensura Reincarnated: Mysticism* (Roblox) wiki | rejected |

### 1.3 Final names: screening result

All 30 final names were searched. No creature-collecting-game or major-franchise creature match was found for: Fizzkit, Crackleap, Tempestrel, Wickwool, Kilnhorn, Magmouflon, Tidesleek, Floeguard, Dozebud, Nodbell, Belladrowse, Rollith, Cairnback, Lodestodon, Rimelet, Sleetribbon, Borealoop, Whirlseed, Samaraptor, Ringdrip, Brineloop, Venomantle, Marionyx, Cinderscrim, Dawnfry, Lumarlin.

Four names had minor, non-creature or niche hits that are accepted as low risk and recorded:

| Name | Hit | Assessment |
|---|---|---|
| Rippleback | Swimsuit style and furniture line | Descriptive product use, no creature use |
| Gustling | "The Gustling Isle", a raid location in *Riders of Icarus* | A place name, not a creature. Low risk |
| Snipling | A US racehorse name and a hatchery lobster's nickname | Not a franchise character. Low risk |
| Umbraleen | A deity name on a small fan wiki (*The Glory Frontier*) | Niche fan work. Low risk. Fallback name: **Coronaleen** |

Naming rules going forward: each name is a two-root English or Latin portmanteau of 12 characters or fewer. A name must not reuse the prefix plus suffix pattern of any known genre creature, and must not use "-mon", "-chu" or "-saur" endings.

---

## 2. Production method (the tools we actually have)

ANCHORS rules out any DCC tool, image generator or asset download. **Each species is a bespoke TypeScript builder function** that composes Three.js primitives into a named `Object3D` hierarchy. Faces are drawn on canvas textures, and animation is procedural. The specs below are the builders' input contract.

### 2.1 Coordinate and unit conventions (all build specs)
- Units are multiples of **H** (the species height from section 0). A builder multiplies every number by H in metres.
- Origin is on the ground under the body centre. **+Y is up, +Z is forward (the creature faces +Z), +X is the creature's left.** For floaters, the origin is the bottom of the model and `hoverGap` (in H) is applied by the animation layer.
- Offsets are `(x,y,z)` relative to the parent part's origin. Rotations are in degrees as `pitch/yaw/roll` (X/Y/Z, applied in XYZ order). A leading "±" or "×2 mir" means one part mirrored across X.
- Dimensions:
  - sphere: `r` or `(rx,ry,rz)`
  - capsule: `r, len` (the length of the cylindrical part, along local +Y unless noted)
  - cone: `r, h`
  - cylinder: `r, h`
  - box: `w×h×d` (bevel 0.1 of the smallest side unless noted)
  - torus: `R, r` (plus an arc if partial)
  - lathe: a profile id from 2.3, plus `h` (along the axis) and `rmax`
  - tube: a path description, plus `r` (start→end taper)
  - extrude: a shape id from 2.3, plus size and `depth`
  - chain: N sequential child segments, each parented to the previous one, used for tails, necks, serpents and arms
- Segment counts (High / Balanced / Mobile): sphere 24×16 / 16×12 / 12×8; capsule 12 radial / 10 / 8; lathe 24 / 16 / 12; tube 12 radial / 8 / 6. LOD reduces segments only. It never removes a part listed as a silhouette feature in section 7.

### 2.2 Colour slots and material presets
- **Slots:**
  - `P` primary
  - `S` secondary
  - `A` accent (often emissive)
  - `D` dark neutral (claws, hooves, mouth interior, pupils on geometry). Default `#221E1C` unless a species gives one.
  - `P+` / `P−`: P lightened or darkened by 30% in HSL L. These derived slots never count as dominant colours.
  - `E`: the canvas eye texture
  - `M`: the canvas mouth or face decal
- **Material presets.** All use MeshStandardMaterial unless noted. Params are roughness / metalness / clearcoat, where clearcoat means using MeshPhysicalMaterial only on High.
  - `FUR`: 0.85 / 0 / 0, plus a low-amplitude vertex-noise displacement of 0.01 H on spheres tagged "fluffy".
  - `SCALE`: 0.5 / 0 / 0.2
  - `SHELL`: 0.25 / 0 / 0.6
  - `STONE`: 0.9 / 0.05 / 0, with the vertex-colour AO darkened at part intersections
  - `METAL`: 0.35 / 0.7 / 0
  - `ICE`: 0.12 / 0 / 0.8, opacity 0.85–0.92, depthWrite off for fins only. **No `transmission`** on any profile, because it is too costly for Mobile.
  - `MEMBRANE`: 0.6 / 0, side Double, opacity 0.85–0.95
  - `PAPER`: 1.0 / 0 / 0, flat
  - `SKIN_WET`: 0.3 / 0 / 0.5
  - `GLOW`: MeshBasicMaterial with vertex colours, `toneMapped:false` so it feeds bloom
- **Emissive:** each species gives an idle intensity. Clips may drive it through the `emissiveGain` channel, clamped to 0–4.
- **Rim light:** one shared fresnel-rim shader chunk, injected with `onBeforeCompile`, with per-species `rimColor` and `rimStrength` (0–1) and power 2.5. It exists to keep dark creatures (f09, c06, c30) legible against dark zones. The Rendering Engineer owns the implementation, and this document owns the values.

### 2.3 Shared profile and shape library
Lathe profiles are `(radius, height)` point pairs, normalised to 0..1, and are revolved around Y. For creatures lying along Z, the lathe is rotated so its axis runs along Z. The builders scale each profile by `rmax` and `h`.

| id | Points (r,h) | Used by |
|---|---|---|
| L_egg | (0,0)(.6,.08)(.95,.35)(1,.55)(.85,.8)(.5,.97)(0,1) | torsos |
| L_pear | (0,0)(.7,.05)(1,.3)(.9,.55)(.6,.78)(.45,.92)(0,1) | torsos, heads |
| L_dome | (0,0)(1,0)(.98,.3)(.85,.62)(.55,.9)(0,1) | carapaces, caps, humps |
| L_teardrop | (0,0)(.5,.1)(.8,.35)(.6,.7)(.2,.95)(0,1) | serpent/fish heads |
| L_spindle | (0,0)(.55,.15)(1,.45)(.8,.75)(.3,.95)(0,1) | fish and glider bodies |
| L_bulb | (0,0)(.8,.05)(1,.35)(.9,.7)(.5,.95)(0,1) | cephalopod mantles |
| L_bell | (0,1)(.15,.95)(.35,.6)(.7,.2)(1,0) (open at bottom) | flower bells |
| L_crater | (.6,0)(1,0)(.9,.8)(.7,1)(.55,.6) (open top) | nostril cones, siphons |

Extrude shapes are 2D outlines in the XY plane, normalised to a unit bounding box and extruded along Z with bevel 0.15×depth:

| id | Outline description |
|---|---|
| X_sail | A quarter-ellipse fan: root edge along +Y, trailing edge with 4 shallow scallops, 4 rib lines (added as separate tubes) |
| X_delta | A triangle with a rounded tip and 5 trailing-edge scallops (kite sail) |
| X_sailfin | A dorsal arch: rises steeply at the front and tapers at the back, with 5 spine points on top |
| X_fin_crescent | A crescent whose inner radius is 0.6 of its outer radius, 150° arc |
| X_fan | A half-disc with 7 scalloped lobes around the arc, used for tail shields and fish tails |
| X_leaf | A pointed ellipse with length:width 3:1 and a midrib groove |
| X_samara | A seed wing: a round nut (0.25 of length) at the root, then a blade widening to 0.3 width, with a curved trailing edge and an asymmetric tip |
| X_hexplate | A regular hexagon with its top face slightly domed (bevel 0.3) |
| X_flake6 | A six-armed snowflake: each arm has 2 side barbs, inner hub 0.25 |
| X_flame_tuft | Three upward lobes with the middle one tallest (1.0 : 0.7 : 0.6) |
| X_strip | A long ribbon with a rounded end, width 0.08 of its length |
| X_corona | A 12-ray star, inner radius 0.6, alternating long and short rays |

Species-specific shapes (S25_*, S26_*, S27_*) are defined inline in their specs.

### 2.4 Faces (canvas textures)
- Each eye is a separate **sphere scaled flat (z×0.6)**, or a front-facing cap, carrying its own `CanvasTexture`. The size is 256² on High, 128² on Balanced and 64² on Mobile. The mipmaps must be generated so the pupil survives at distance.
- The eye generator takes these parameters: `shape` (round | almond | long-almond | droopy | none-sclera), `sclera` hex, `iris` hex (radial gradient to 70% L), `irisRatio`, `pupil` (round | v-oval | slit | h-bar | w-shape | none), `pupilRatio`, `highlights` (1–3, always upper-left toward the key light), `lidCoverage` 0–0.6, `lidAngle` in degrees (+ is inner corner up, which reads sad or worried; − reads angry or determined).
- **Expression frames** are generated per species, and clips switch between them: `open`, `half`, `closed`, `happy` (upward arcs), `hurt` (squeezed wedges), `faint` (closed downward arcs, not spirals or crosses).
- Mouths are either a painted `M` decal (a canvas on a curved patch of the head sphere) or a `jaw` mesh where the spec lists one. Brows are either painted onto the eye canvas or small geometry parts, and each spec states which.

### 2.5 Animation system and clip conventions
- Rigid part hierarchy with **no skinning**. Animated parts stay separate `Object3D`s. Static children that share a material are merged at build time.
- Clips are parameter curves on named parts (`pos`, `rot`, `scale`, `emissiveGain`, `eyeFrame`, `morph` where noted). They are authored as keyframed TypeScript data and evaluated per frame.
- **Rig templates** give shared, parameterised clip generators. Species override amplitudes and add bespoke tracks.

| Rig | Species | Shared generator provides |
|---|---|---|
| RIG_QUAD | c01 c04 c05 c06 c07 c12 c14 c15 | gait phase per leg (walk/trot/bound/pronk), breathing, head look-at |
| RIG_BIPED | c02 c09 c11 | two-leg gait, arm swing, torso lean |
| RIG_CHAIN | c08 c16 c17 c18 | travelling sine wave along the segment chain, plus coil and uncoil |
| RIG_WING | c03 c19 c20 c21 | flap cycle, glide hold, banking |
| RIG_FLOAT | c28 c29 c30 (and c18 hover) | bob, drift, tail-beat along a chain |
| RIG_RADIAL | c22 c23 c24 | arm-chain curl waves, tripod or radial stepping |
| RIG_BALL | c10 c13 | roll-to-speed coupling, curl and uncurl |
| RIG_FLAT | c25 c26 c27 | layered-plate parallax, hinge folds, **12 fps stepped interpolation** (the shade family's signature feel) |

- **Durations:**
  - `idle` loops, 2.4–4.0 s
  - `move` loops, 0.5–1.4 s
  - `attack` 0.9–1.3 s, with event markers `windup`, `contact` (the damage/VFX sync point, usually 40–55% of the clip), `recover`
  - `hit` 0.35–0.5 s
  - `capture` 0.6–1.2 s of species reaction, then the shared dematerialise effect (0.5 s, owned by the capture system). The same clip played at 2× speed with an added shake is the break-out reaction.
  - `faint` 1.0–1.6 s, ending in a hold pose
  - `victory` 1.2–1.8 s
- **Reduced motion** (accessibility setting): translational amplitudes ×0.5, spins capped at 180°, no camera shake from creature events. Contact markers keep their timing.
- Each species should have two attack variants: `attack` (physical or contact) and `attack_special` (ranged or emission). Where only one is described, `attack_special` is the same motion with contact replaced by a VFX spawn at the listed emitter part.

### 2.6 Budgets (targets, proposed to the Rendering Engineer)

| Stage | Triangles High / Mobile | Draw calls after merging | Animated nodes |
|---|---|---|---|
| 1 | ≤ 3,500 / 1,800 | ≤ 10 | ≤ 24 |
| 2 | ≤ 5,500 / 2,800 | ≤ 14 | ≤ 36 |
| 3 | ≤ 8,000 / 4,000 | ≤ 18 | ≤ 48 |

These are targets and none have been measured. The only per-frame CPU-rebuilt geometry is c24's three web panels (36 vertices) and c26's strings (drawn as `LineSegments`).

---

## 3. Family overviews (motif, evolution arc)

A **motif** is the element that appears on all three stages and must stay visible at 20 px on at least two of them.

| Fam | Line | Motif (kept across stages) | Anatomy arc | Behaviour arc |
|---|---|---|---|---|
| f01 | Fizzkit → Crackleap → Tempestrel | Rib-strut side sails with a yellow **zig-seam** along the trailing edge, and a **two-prong fork** tail tip | quadruped with folded flank flaps → biped with wrist-to-hip sails → kite glider with one delta sail per side and slender tucked limbs | jittery skitter-hopper → show-off sprinter → aloof storm-rider that hovers |
| f02 | Wickwool → Kilnhorn → Magmouflon | **Glowing horn cores** whose emissive ridges light from the tip, plus charcoal hooves that spark | calf with cream fleece clusters and horn nubs → lean cliff-leaping ram with a smouldering charcoal mane and spiral horns → fore-massed giant with basalt plates, magma seams and horns closed into kiln rings | bouncy pronker → rearing charger → immovable stomping guardian |
| f03 | Rippleback → Tidesleek → Floeguard | **Shingled shell plates** (overlapping scallops) and a white muzzle with whisker pads | otter pup with a plated tail → 8-segment serpentine swimmer with dorsal scutes and a rudder → upright biped with a carapace breastplate and a fan-shell tail used as a shield | playful tool-user (pebble) → sly speed-swimmer → stoic shield-bearer |
| f04 | Dozebud → Nodbell → Belladrowse | **Moss mantle, hanging bell-flowers, dark eye-mask** stripes on sleepy half-lidded eyes | ball curled around a seed pod → lanky biped with arms to its ankles → quadruped knuckle-walker carrying a canopy tree hung with bells | clingy sleeper → languid ambusher that "nods off" → serene sentinel sheltering others |
| f05 | Rollith → Cairnback → Lodestodon | **Hex-plate dome carapace** and a pale snout shield | rolling ball → low glyptodont-like quadruped with a stacked-stone club tail → colossus with geode crystal ridges and orbiting lodestones in place of the club | startled roller → grumpy tail-swinger → solemn magnetic controller |
| f06 | Rimelet → Sleetribbon → Borealoop | **Translucent ice crest fins** and a **six-armed flake** tail or core | sidewinding hatchling → long limbless serpent with a sail-fin row → floating closed ring-coil with aurora plumes, a flake core and small forelimbs | shy cold-clinger → vain graceful hunter → dreamlike night guide |
| f07 | Gustling → Whirlseed → Samaraptor | **Samara (maple-seed) wings** with a nut at the root, twin tail streamers, cheek swirl marks | round fledgling with stub seed-wings → slender swift with long blade wings → upright raptor whose wings became a two-blade rotor over its back | bubbly hopper → prankish autorotating diver → proud hovering hunter |
| f08 | Ringdrip → Brineloop → Venomantle | **Glowing blue ring spots** that flash when threatened, and **six arms** (never eight) | radial crawler → upright on 4 leg-arms with 2 lasso arms and a translucent brine-filled mantle → tall tripod with 3 raised arms joined by a cloak web | nervous flasher → cocky trickster → regal intimidator |
| f09 | Snipling → Marionyx → Cinderscrim | **Flat layered cut-out plates**, punched eye-holes lit from behind, **12 fps stepped motion** | hopping paper cut-out → floating marionette hung from its own crossbar crown → three-panel folding screen backlit by an ember core | mischievous mimic → theatrical show-off → dramatic avenger that projects shadow illusions |
| f10 | Dawnfry → Lumarlin → Umbraleen | **Lateral light-stripe** (emissive band or spots), crescent dorsal fin, pale belly | round fry → marlin with a light-bill and sail fin → vast baleen whale with an eclipse corona crown | cheerful light-chaser → disciplined duellist → ancient eclipse-bringer |

Evolution rule check: every stage change alters body plan, locomotion type or limb count as well as scale and palette (see the section 0 body-plan column). No stage is a recolour or uniform rescale of a sibling builder, and each builder is separate code.

## 4. Species records and build specs

Reading guide:
- **Habitat** gives the lore home first, then the *suggested* encounter zones for the World Designer, who owns the final encounter tables.
- Starters (c01, c04, c07) are never wild at stage 1. How players obtain the two unchosen starters is defined in `world.md`.
- Build-spec numbers are multiples of H (section 2.1). "Anim" names the clip channels that drive a part: `br` breathing, `gait` locomotion, `look` head aim, `wave` chain wave, `flap`, `blink` eye frames, `glow` emissiveGain, `jaw`, `fx` VFX emitter anchor. `—` means the part is static and gets merged.

### f01 — Fizzkit line (electric)

#### c01 · Fizzkit
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 1 · electric |
| Body plan · rig | small splay-legged quadruped lizard · RIG_QUAD |
| H / length | 0.35 m / 0.70 m (incl. tail) |
| Habitat | Lore: sun-warmed cliff faces and canopy edges of `route_2` and `forest`. Starter, not wild. |
| Personality | Jittery and curious. Freezes, then darts. Flicks its tongue to "taste" static in the air. |
| Distinctive anatomy | Oversized head (a third of body length) with 3 small backward crown nubs. Flat body with **folded rib-flaps** along each flank showing 4 rib ridges and a yellow seam. Tail ending in **two straight prongs** (a fork, never a zig-zag bolt). |
| Dominant colours | P `#2E8FA3` teal · A `#FFD23F` electric yellow · P+ `#E8F4E4` belly |
| Materials | Body `SCALE` (r 0.55). Flaps `MEMBRANE` opacity 0.95. Seams and fork tips emissive A, idle 0.6, pulsing 0.4–0.8 at 1 Hz. Rim `#FFF3B0` 0.35. |
| Face | Large **round** eyes set high, turned 35° outward. Sclera `#F7F7EE`, iris amber `#F2A900` (irisRatio 0.7), **v-oval** pupil 0.45, 2 highlights, lidCoverage 0.1. Brows: none; a small geometric lid ridge sits above each eye. Mouth: painted wide smile line on the snout (M). |

| Clip | Motion |
|---|---|
| idle | Torso breathes (scale Y 1±0.03, 0.8 Hz). Every ~3 s the head snaps 20° left then right. The fork prongs twitch alternately. Every 4–6 s the flaps flutter 5° at 6 Hz for 0.3 s with a seam glow spike to 1.5. |
| move (skitter-trot + hop-glide) | Diagonal-pair trot at 4 Hz with a lateral S-wave through the torso and tail (±8°). Every 4th cycle it makes a hop-glide: the flaps open to 60°, the body is airborne 0.25 s at 0.4 H height, then lands in a crouch. |
| attack | Crouch (0.15 s). Leap 1.2 H forward with the flaps snapping open. The tail whips overhead (pitch +160°) so the fork strikes the target. `contact` at 45% fires a spark burst at `fx_fork`. Hop back. |
| hit | Body flattens (scale Y 0.8), slides back 0.3 H, flaps clamp shut, eyeFrame `hurt`. |
| capture | Rears on its hind legs with the flaps flared wide in a startle display, freezes 0.3 s, eyes `open`→`closed`. |
| faint | Rolls onto its side (roll 90° over 0.6 s). The flaps drop open on the ground, the tail uncurls limp, the seam glow fades to 0 over 1 s, eyeFrame `faint`. |
| victory | Two quick in-place hops with the flaps open and a fork spark. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | sphere (0.30,0.20,0.42) | root @ (0,0.30,0) | P | br, gait |
| belly | sphere (0.26,0.14,0.36) | torso @ (0,−0.06,0) | P+ | — |
| head | sphere (0.26,0.24,0.28) | torso @ (0,0.18,0.42) | P | look |
| snout | sphere (0.18,0.12,0.16) | head @ (0,−0.06,0.22) | P | — |
| mouth | M decal, smile | snout front | M | eyeFrame-linked |
| eye ×2 mir | sphere r0.10, z×0.6 | head @ (±0.15,0.07,0.16) · yaw ±35 | E | blink |
| crown nub ×3 | cone r0.03 h0.07 | head @ (0/±0.07,0.22,−0.10) · pitch −40 | A | — |
| flank flap ×2 mir | extrude X_sail 0.45 span × 0.30 chord, depth 0.02 | torso @ (±0.26,0.04,0) · roll ±70 folded (0 = open) | P | flap |
| rib ridge ×4 per flap | tube straight r0.008 | flap, radiating from root | P− | — |
| seam ×2 | tube along flap trailing edge r0.012 | flap | A | glow |
| front leg ×2 mir | capsule r0.05 len0.14 → capsule r0.04 len0.12 → foot sphere (0.06,0.03,0.08) | torso @ (±0.22,−0.08,0.28) · roll ±35 splay | P | gait |
| hind leg ×2 mir | same as front leg | torso @ (±0.22,−0.08,−0.28) | P | gait |
| tail | chain 5 × capsule r0.08→0.03 len0.12, along −Z | torso @ (0,0,−0.42) | P | wave |
| fork prong ×2 | cone r0.03 h0.12 | tail5 @ (±0.03,0,−0.06) · yaw ±25 | A | glow, fx_fork |

#### c02 · Crackleap
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 2 · electric (evolves from c01 at Lv 16) |
| Body plan · rig | upright digitigrade biped with a counterbalance tail · RIG_BIPED |
| H / length | 0.90 m / 1.30 m |
| Habitat | Lore: open ridgelines of `route_2` and `route_4`, racing along them. Not wild in the main game. |
| Personality | Show-off sprinter: restless, competitive, poses after every win. |
| Distinctive anatomy | Torso leaning 30° forward. Long hind legs with 3 splayed toes. **Sails spanning from the forearm to the hip** that fold along the arm. **3 swept-back head spines** (no neck frill). Longer tail whose **fork prongs are wider apart**, with a spark arc between them. |
| Dominant colours | P `#23607E` deep teal-blue · A `#F5C518` yellow · P+ `#D9EEF2` belly |
| Materials | Body `SCALE` r 0.5. Sails `MEMBRANE` opacity 0.9. Seams emissive A 0.8. Rim `#FFE680` 0.4. |
| Face | **Almond** eyes angled forward. Iris `#FFB000`, round pupil 0.35, 1 highlight, lidAngle −10 (confident). Brows: geometric capsule ridges. Mouth: `jaw` mesh with a slight open grin and 2 painted fang ticks. |

| Clip | Motion |
|---|---|
| idle | Bounces on its toes (root Y ±0.02 H, 1.5 Hz). Arms half-folded with the sails rippling. The head scans side to side, the tail sways ±10°, and the fork arc flickers every 2 s. |
| move (bipedal sprint) | Torso pitched 45°. Legs cycle at 3 Hz with long strides. Arms swept back, sails half-open as air-brakes. Above run speed it makes 0.4 s glide-hops with its arms spread. |
| attack | Sprints 2 H to the target, spins 360° (yaw) with its arms spread so the sail edges flare (glow 2.0), and slams the tail fork down (`contact` 50%). Hops back. |
| attack_special | Plants its feet, crosses its arms, then flings them open. A bolt is emitted from `fx_fork` over its head. |
| hit | Jerks upright, folds its arms over its face, stumbles back 2 steps. |
| capture | Spreads its arms fully as if shielding. The seams flash. |
| faint | Knees buckle and it falls forward onto its chest, arms spread flat with the sails. The tail flops and the glow fades. |
| victory | Skids to a stop, arms up, sails open, tail fork sparks. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pelvis | sphere (0.16,0.14,0.16) | root @ (0,0.45,0) | P | gait |
| torso | lathe L_egg h0.42 rmax0.16 | pelvis @ (0,0.12,0.04) · pitch 30 fwd | P | br |
| belly plate | sphere (0.12,0.18,0.08) | torso front @ (0,0.18,0.12) | P+ | — |
| neck | capsule r0.06 len0.12 | torso @ (0,0.40,0.06) · pitch −20 | P | look |
| head | sphere (0.14,0.12,0.18) | neck @ (0,0.10,0.04) | P | look |
| jaw | half-sphere (0.10,0.04,0.12) | head @ (0,−0.06,0.07) | P | jaw |
| eye ×2 | sphere r0.045, x×1.3 | head @ (±0.08,0.03,0.10) | E | blink |
| brow ×2 | capsule r0.015 len0.06 | head @ (±0.08,0.07,0.10) · roll ±15 | P− | — |
| head spine ×3 | cone r0.025 h0.14/0.18/0.14 | head @ (±0.05/0,0.10,−0.08) · pitch −60 | P, tip A | — |
| upper arm ×2 | capsule r0.035 len0.16 | torso @ (±0.13,0.30,0.06) | P | gait |
| forearm ×2 | capsule r0.03 len0.16 | upper arm end | P | gait |
| hand ×2 | sphere r0.035 + 3 cone fingers r0.01 h0.05 | forearm end | P | — |
| sail ×2 | extrude X_sail 0.40 span × 0.35 chord, depth 0.015; root edge along the forearm, trailing corner at the hip | upper arm; **scaleX = lerp(0.35,1,armSpread)** | P, seam A | flap, glow |
| thigh ×2 | capsule r0.06 len0.20 | pelvis @ (±0.10,−0.02,0) | P | gait |
| shin ×2 | capsule r0.04 len0.22 (knee reversed) | thigh end | P | gait |
| metatarsal ×2 | capsule r0.03 len0.12 | shin end | P | gait |
| toe ×3 per foot | cone r0.015 h0.08, splayed ±25° | metatarsal end | D | — |
| tail | chain 7 × capsule r0.06→0.02 len0.10 | pelvis @ (0,0,−0.14) · pitch 10 up | P | wave |
| fork prong ×2 | cone r0.025 h0.16 · yaw ±30 | tail7 | A | glow, fx_fork |

#### c03 · Tempestrel
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 3 · electric / gale (from c02 at Lv 34) |
| Body plan · rig | kite glider: long horizontal body, 4 slender tucked limbs, one delta sail per side made of elongated ribs · RIG_WING |
| H / span / length | 1.60 m / 2.80 m / 2.40 m (incl. streamer) · hoverGap 0.35 H |
| Habitat | Lore: storm fronts over `snowpeak` and `route_5`. Not wild in the main game. |
| Personality | Aloof and patient. Rides storms, and fiercely protects younger members of its line. |
| Distinctive anatomy | Sails grow from the **ribs along the flanks, not from the shoulders** (a Draco-lizard analogue), with 6 visible ribs per side. A single crescent crest blade on the head, and 2 cheek electrode nodes. A long tail with **two ribbon streamers** and the widened fork. |
| Dominant colours | P `#1E3A5F` storm indigo · S `#5FD4E8` cyan membrane · A `#FFE66D` seams |
| Materials | Body `SCALE` r 0.45, clearcoat 0.3. Sails `MEMBRANE` opacity 0.85 with emissive S 0.15. Seams emissive A 1.2. Rim `#9FF3FF` 0.5. |
| Face | **Long-almond** eyes. Iris `#5FD4E8`, round pupil 0.3, 2 highlights, lidCoverage 0.25 (calm, regal). Brows: heavy geometric ridge. Mouth: closed upturned line (M) plus a `jaw` for roars. |

| Clip | Motion |
|---|---|
| idle | Hovers, bobbing 0.05 H at 0.4 Hz. A travelling wave runs along the sail panels (±8°, rib by rib), and the streamers S-wave slowly. A spark jumps between the fork prongs every 3 s. |
| move (glide) | Sails fully spread. It banks into turns (roll ≤25°). A slow "rib-beat" every 1.5 s dips the sails 15° and raises them again. It stays 0.35 H above the ground. |
| attack | Rises 0.5 H, folds its sails back into a dart and dives at the target. At `contact` (50%) the sails snap open, releasing a ring of lightning at `fx_body`. Pulls up. |
| attack_special | Holds position with its sails raised. Lightning arcs travel along all ribs into the fork, and a bolt fires from `fx_fork`. |
| hit | The sail on the struck side crumples (panel pitch −20°, body roll 30° toward the hit). It drops 0.2 H, then recovers. |
| capture | Wraps its sails forward around its body like a cloak. The crest flashes. |
| faint | Sails go limp and it drifts down like a falling leaf (roll ±20° rocking over 1.2 s). It lands flat with the tail coiled. |
| victory | A barrel roll, then sails fully spread with all seams flashing. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body | lathe L_spindle along Z, h1.20 rmax0.13 | root @ (0,0.55,0) | P | br |
| keel | sphere (0.10,0.08,0.22) | body @ (0,−0.08,0.10) | P+ | — |
| neck | capsule r0.06 len0.20 · pitch −15 | body front @ (0,0.02,0.58) | P | look |
| head | lathe L_teardrop along Z, h0.32 rmax0.09 | neck end | P | look |
| jaw | half-lathe h0.20 rmax0.06 | head @ (0,−0.04,0.06) | P | jaw |
| eye ×2 | sphere r0.035, x×1.6 | head @ (±0.06,0.03,0.12) | E | blink |
| crest blade | extrude X_fin_crescent 0.22×0.12, depth 0.015 | head @ (0,0.08,−0.06) | S, edge A | glow |
| cheek node ×2 | sphere r0.025 | head @ (±0.07,−0.02,0.02) | A | glow |
| rib ×6 per side | tube straight r0.012, len 0.60–0.85, fanning −10°…−80° from forward | body flank @ (±0.10,0.02, +0.30…−0.30) | P− | flap |
| sail panel ×3 per side | extrude X_delta (the panel between rib pairs), span 0.85, depth 0.01 | parented to the leading rib of its pair | S | flap, glow |
| seam ×2 | tube along the outer trailing edge r0.01 | outer panels | A | glow |
| limb ×4 | capsule r0.025 len0.18 → capsule r0.02 len0.16 → 3 toe cones | body @ (±0.08,−0.06,±0.35) · pitch 70 back (tucked) | P | gait (landing only) |
| tail | chain 10 × capsule r0.05→0.015, total 1.0 | body rear @ (0,0,−0.60) | P | wave |
| streamer ×2 | extrude X_strip 0.30×0.04, depth 0.005 | tail8 @ (±0.02,0,0) | S | wave |
| fork prong ×2 | cone r0.02 h0.14 · yaw ±35 | tail10 | A | glow, fx_fork |

### f02 — Wickwool line (fire)

#### c04 · Wickwool
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 1 · fire |
| Body plan · rig | small quadruped lamb (ram calf) · RIG_QUAD |
| H / length | 0.45 m / 0.55 m |
| Habitat | Lore: warm pastures on the lower slopes of `volcano`. Starter, not wild. |
| Personality | Earnest and braver than its size. Head-butts new things to "test" them. |
| Distinctive anatomy | Lumpy **cream fleece of 7 clusters** over brick-red skin (face and legs bare). Knobbly knees. **Horn nubs making a single ¾ curl, with wick-like glowing tips** (a small flame sprite each). Flame-shaped tail tuft. Charcoal hooves that throw sparks when stamped. |
| Dominant colours | S `#F2E3C6` cream · P `#B5462E` brick red · A `#FF8A1F` ember |
| Materials | Fleece `FUR` r 0.95 with the fluffy tag. Skin `FUR` r 0.7. Horns `SHELL` r 0.4, colour `#D8B892`, with a vertex-colour gradient to emissive A at the tip (1.2). Hooves D. Rim `#FFD9A0` 0.3. |
| Face | Big **round** eyes. Iris `#4A2A1A`, round pupil 0.55, 2 highlights, lidAngle +8 (earnest). Brows: short painted strokes. Mouth: small painted oval that opens for cries (M frame swap). Floppy ears. |

| Clip | Motion |
|---|---|
| idle | Tail tuft flicks, ears flop with lag, wick flames flicker (scale noise). Every ~4 s it stamps a front hoof, spawning a spark at `fx_hoof`. |
| move (pronk + trot) | Alternates 2 trot cycles with 1 **pronk**: all four legs stiff, body bouncing 0.15 H, fleece clusters jiggling with a 0.05 s lag. |
| attack | Backs up 2 steps, lowers its head and charges 1.5 H. Head-butts at `contact` (45%): horn glow 3.0 and fleece puffs out (scale 1.1). |
| attack_special | Plants its feet and shakes its head. The wick flames grow 3× and flick an ember forward from `fx_horns`. |
| hit | Fleece compresses (scale 0.9) and springs back. It stumbles sideways with its ears pinned. |
| capture | Plants its hooves stubbornly and shakes its head (yaw ±30° ×3). |
| faint | Front legs fold, then the rear. It lies curled, and the wick flames shrink to embers (glow 0.2). |
| victory | Pronks twice, then gives a proud bleat (jaw frame open). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | sphere (0.28,0.22,0.34) | root @ (0,0.50,0) | P | br, gait |
| fleece cluster ×7 | sphere r0.12–0.16 (fluffy) around the top, sides and rump | torso | S | br (lagged) |
| neck | capsule r0.08 len0.12 · pitch −35 | torso @ (0,0.12,0.28) | P | look |
| head | sphere (0.17,0.16,0.19) | neck end @ (0,0.08,0.04) | P | look |
| muzzle | sphere (0.10,0.08,0.10) | head @ (0,−0.06,0.15) | P+ | — |
| forelock | sphere r0.08 (fluffy) | head @ (0,0.14,0) | S | — |
| ear ×2 | capsule r0.04 len0.14, z×0.4 · roll ±60 droop | head @ (±0.15,0.06,−0.02) | P | lag |
| horn nub ×2 | tube along a ¾-turn curl, path radius 0.06, r0.035→0.02 | head @ (±0.08,0.13,0.02) | `#D8B892`→A | glow |
| wick flame ×2 | billboard sprite r0.05 | horn tip | A | fx_horns |
| eye ×2 | sphere r0.05, z×0.6 | head @ (±0.09,0.03,0.14) | E | blink |
| leg ×4 | capsule r0.035 len0.18 → knee sphere r0.045 → capsule r0.03 len0.15 → hoof cylinder r0.035 h0.05 | torso @ (±0.14,−0.18,±0.18) | P, hoof D | gait, fx_hoof |
| tail tuft | extrude X_flame_tuft 0.10, depth 0.04 | torso @ (0,0.08,−0.34) | S, tip A | lag |

#### c05 · Kilnhorn
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 2 · fire (from c04 at Lv 16) |
| Body plan · rig | lean long-legged leaping quadruped · RIG_QUAD (bound gait) |
| H / length | 1.00 m / 1.20 m |
| Habitat | Lore: basalt ledges of `volcano` and `route_4`. Not wild in the main game. |
| Personality | Proud and stubborn. Challenges rivals but is fiercely loyal. |
| Distinctive anatomy | The fleece is gone except for a **smoky charcoal mane collar** around its neck and shoulders, flecked with embers. Mountain-goat proportions. **Horns in one full spiral each**, with 8 glowing ridge rings. Chin tuft. Short flat tail. |
| Dominant colours | P `#8E2F22` red-brown · S `#3B2B26` charcoal · A `#FFA431` ember |
| Materials | Coat `FUR` r 0.8. Mane `FUR` r 1.0 with emissive fleck vertex colours. Horns `SHELL` r 0.35 with emissive ridge stripes (A 1.5). Rim `#FFB070` 0.35. |
| Face | Narrower **almond** eyes. Iris `#FF9A2E`, **h-bar** (goat) pupil, 1 highlight, lidAngle −12. Brows: geometric wedges. Mouth: `jaw` mesh. Ears held horizontal. |

| Clip | Motion |
|---|---|
| idle | Paws the ground with a front hoof, leaving a glowing scuff decal that fades in 2 s. Snorts smoke puffs from `fx_nostrils` every 3 s. Horn ridges pulse front to back at 0.5 Hz. |
| move (bound) | Springy bound gait with a long suspension phase (0.25 s airborne). Hooves flash (glow 1.5) on each landing. |
| attack | Rears to pitch −40° on its hind legs. The horns ignite (glow 3.0) and it crashes down into a lunging head-butt (`contact` 55%), spawning a spark burst. |
| attack_special | Rears and snorts twin flame jets from `fx_nostrils` while swinging its head in an arc. |
| hit | Head jerks aside, the mane scatters sparks, and it skids back on its hooves. |
| capture | Rears and bleats (jaw open). The horns flare. |
| faint | Staggers, then collapses sideways. The horn glow dims ring by ring from tip to base over 1.2 s. |
| victory | Leaps onto an invisible ledge (up 0.4 H), holds a proud pose, and snorts smoke. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | lathe L_pear along Z, h0.60 rmax0.17 (chest end forward) | root @ (0,0.58,0) | P | br, gait |
| mane cluster ×5 | sphere r0.10–0.14 (fluffy) | torso front-top | S | br |
| neck | capsule r0.08 len0.22 · pitch −40 | torso @ (0,0.08,0.28) | P | look |
| head | sphere (0.10,0.11,0.16) | neck end | P | look |
| muzzle | capsule r0.06 len0.08 along Z | head @ (0,−0.04,0.12) | P+ | — |
| jaw | half-capsule r0.05 len0.07 | muzzle bottom | P+ | jaw |
| chin tuft | cone r0.03 h0.08, pointing down | jaw | S | — |
| horn ×2 | tube along a logarithmic spiral of 1.1 turns, outer radius 0.14, r0.05→0.015, curling back-down-forward; 8 emissive ridge bands (vertex colour) | head @ (±0.07,0.08,−0.02) | `#C9A27A`, bands A | glow |
| ear ×2 | capsule r0.025 len0.08, flattened, horizontal | head @ (±0.10,0.05,−0.04) | P | lag |
| eye ×2 | sphere r0.03 | head @ (±0.07,0.03,0.08) | E | blink |
| leg ×4 | capsule r0.05 len0.20 → capsule r0.03 len0.22 → capsule r0.022 len0.08 → hoof cylinder r0.03 h0.04 | torso @ (±0.10,−0.12,±0.22) | P, hoof D | gait, glow |
| tail | capsule r0.03 len0.07, flattened | torso rear | S | lag |

#### c06 · Magmouflon
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 3 · fire / stone (from c05 at Lv 34) |
| Body plan · rig | fore-massed heavy quadruped (bison-like taper) · RIG_QUAD (heavy walk) |
| H / length | 1.70 m / 2.30 m |
| Habitat | Lore: `volcano` caldera rim. Not wild in the main game. |
| Personality | A calm, immovable hearth-guardian. Slow to anger and unstoppable once roused. |
| Distinctive anatomy | Huge shoulders and forequarters with small hindquarters. **Overlapping basalt hex-plates** on the shoulders and back, with **magma glowing through the gaps**. **Horns closed into near-complete kiln rings** (1.6 turns) around each side of the head, which vent heat shimmer. A dark beard. Short, thick, pillar-like legs. **No volcanic crater or hump vent** (see the originality audit). |
| Dominant colours | P− `#2B2A2E` basalt black · A `#FF5A1F` magma orange · S `#6E2A1C` rust fur |
| Materials | Plates `STONE` r 0.9 with a noise normal. An emissive underlayer (A 1.6, pulsing at 0.3 Hz) shows through the plate gaps. Fur `FUR` r 0.9. Horns `SHELL` r 0.5 with emissive inner faces. Rim `#FF7A40` 0.3. |
| Face | Small deep-set eyes. **No visible sclera** (sclera `#1A1414`), iris `#FFB347` emissive 0.6, h-bar pupil, 1 highlight. Brows: basalt brow-plates (geometry). Mouth: broad muzzle with a `jaw`. Nostrils emit smoke. |

| Clip | Motion |
|---|---|
| idle | Slow deep breathing (shoulder mass rises 0.02 H). Smoke curls from the nostrils and the horn rings every 3 s. The magma underlayer pulses. The head turns slowly at 0.2 Hz. |
| move (heavy walk) | Walks at 0.8 Hz with a lateral sway (roll ±4°). Each forefoot plant spawns a dust ring. The plates shiver as each foot lands. |
| attack | Rears 20° and slams both forelegs down (shockwave `fx_ground` at `contact` 40%), then shoves forward with its horn rings (second hit tick at 70%). |
| attack_special | Lowers its head. The horn rings glow white-hot (glow 3.5) and release a heat wave cone from `fx_horns`. |
| hit | Barely moves: head recoils 10°, the plates flash brighter, a grunt. |
| capture | Braces its legs wide and roars (jaw). The capture reaction lasts 1.0 s instead of 0.6 s. |
| faint | Kneels front first, then slumps. The magma dims to dark red, then black, over 1.5 s, and the smoke stops. |
| victory | Stamps twice (dust rings) and exhales a long smoke plume. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| forequarters | sphere (0.34,0.32,0.34) | root @ (0,0.62,0.12) | S | br, gait |
| hindquarters | sphere (0.24,0.24,0.26) | root @ (0,0.50,−0.30) | S | gait |
| barrel | capsule r0.24 len0.30 along Z | root @ (0,0.55,−0.08) | S | — |
| shoulder mass | lathe L_dome h0.18 rmax0.26 (no crater) | forequarters top @ (0,0.26,−0.04) | S | br |
| magma underlayer | sphere (0.33,0.30,0.50), 0.02 inside the plates | root @ (0,0.64,−0.05) | A (emissive) | glow |
| basalt plate ×12 | extrude X_hexplate r0.09–0.12, depth 0.03, random yaw, gaps 0.01–0.02 | on the shoulder mass and back | P− | br |
| neck | capsule r0.16 len0.12 · pitch 30 down-forward | forequarters @ (0,0.02,0.28) | S | look |
| head | sphere (0.14,0.15,0.18) | neck end → world ≈ (0,0.66,0.52) | S | look |
| brow plate ×2 | box 0.10×0.03×0.06 | head @ (±0.06,0.09,0.10) | P− | — |
| muzzle | sphere (0.10,0.09,0.10) | head @ (0,−0.06,0.14) | S | — |
| jaw | half-sphere (0.09,0.04,0.09) | muzzle bottom | S | jaw |
| beard | cone r0.07 h0.14, pointing down | jaw | P− | lag |
| horn ring ×2 | tube along a 1.6-turn spiral, outer radius 0.13, r0.06→0.02, forming a ring about the ear axis | head @ (±0.12,0.06,−0.02) | `#3A302C`, inner A | glow, fx_horns |
| eye ×2 | sphere r0.025 | head @ (±0.08,0.04,0.12) | E | blink |
| front leg ×2 | capsule r0.08 len0.26 → capsule r0.065 len0.20 → hoof cylinder r0.07 h0.05 | forequarters @ (±0.20,−0.20,0.05) | S, hoof D | gait, fx_ground |
| hind leg ×2 | capsule r0.07 len0.22 → capsule r0.055 len0.18 → hoof | hindquarters @ (±0.15,−0.14,0) | S, hoof D | gait |
| tail | capsule r0.03 len0.08 | hindquarters rear | S | lag |

### f03 — Rippleback line (water)

#### c07 · Rippleback
| Field | Value |
|---|---|
| Family / stage / types | f03 · stage 1 · water |
| Body plan · rig | small quadruped otter · RIG_QUAD (lope) + a float variant on water |
| H / length | 0.40 m / 0.80 m |
| Habitat | Lore: reed shallows of `lake` and the river mouths of `route_3`. Starter, not wild. |
| Personality | Playful, sociable and a tool-user. Always carries a favourite pebble. |
| Distinctive anatomy | Brown otter pup whose **tail is covered in 5 overlapping shingle-plates** ending in a rounded paddle plate. White whisker-pad muzzle. Small round ears. Webbed hind feet. A pebble prop. **Nothing shell-like on the belly or chest**, ever. |
| Dominant colours | P `#5B4636` otter brown · S `#3FA7B5` sea teal · P+ `#F1E6D2` muzzle/chest |
| Materials | Fur `FUR` r 0.85, dropping to r 0.5 while its "wet" flag is set (water zones or after water moves). Tail plates `SHELL` r 0.25 with a vertex hue-shift toward `#6FD0C8` at the edges. Rim `#BFF6FF` 0.3. |
| Face | Glossy **round** eyes: sclera hidden (none-sclera), iris `#1B1B1B`, pupil 0.8, 2 highlights. Brows: small raised painted arcs. Mouth: wide painted smile with whisker dots (M). Round nose `D`. |

| Clip | Motion |
|---|---|
| idle | Sits up on its haunches, tosses the pebble up 0.3 H and catches it (the pebble prop animates). The tail plates ripple in sequence (pitch ±6°, 0.08 s stagger). |
| move (lope) | Hump-and-stretch bounding lope at 2.5 Hz, with the back arching ±12°. The tail drags, then lifts. On water it floats on its back and paddles with its tail (the zone flag switches the clip). |
| attack | Drops onto its belly and spins 360° (yaw 0.4 s), swinging the plated tail like a club (`contact` 50%). A splash ring spawns at `fx_tail`. |
| attack_special | Sits up, puffs its cheeks and spits a water jet from `fx_mouth`. |
| hit | Curls up protecting its face with its forepaws, with the tail wrapped around. |
| capture | Rolls onto its back and clutches the pebble to its chest. |
| faint | Flops on its back with paws up. The pebble rolls away 0.5 H. |
| victory | Juggles the pebble twice and claps its forepaws. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | capsule r0.20 len0.35 along Z | root @ (0,0.35,0) | P | br, gait |
| chest | sphere (0.17,0.16,0.26) | torso @ (0,−0.05,0.12) | P+ | — |
| head | sphere (0.20,0.18,0.18) | torso @ (0,0.12,0.32) | P | look |
| muzzle | sphere (0.12,0.08,0.10) | head @ (0,−0.05,0.14) | P+ | — |
| nose | sphere r0.035 | muzzle @ (0,0.03,0.09) | D | — |
| whisker ×6 | tube r0.004 len0.14 (culled on Mobile) | muzzle sides | D | — |
| ear ×2 | sphere (0.045,0.045,0.02) | head @ (±0.14,0.12,−0.02) | P | — |
| eye ×2 | sphere r0.045 | head @ (±0.08,0.05,0.15) | E | blink |
| foreleg ×2 | capsule r0.045 len0.16 → paw sphere r0.05 | torso @ (±0.12,−0.14,0.18) | P | gait |
| haunch ×2 | sphere r0.10 | torso @ (±0.12,−0.06,−0.16) | P | gait |
| hind foot ×2 | capsule r0.045 len0.10 → extrude webbed fan 0.10×0.08 | haunch | P, web P− | gait |
| tail base | capsule r0.10 len0.12 along −Z | torso rear | P | wave |
| tail plate ×5 | lathe L_dome squashed (h0.06, rmax 0.11→0.07), shingled | chain on the tail base, spacing 0.07 | S | wave (ripple) |
| tail paddle | extrude rounded leaf 0.18×0.12, depth 0.03 | plate5 | S | wave, fx_tail |
| pebble | sphere r0.04, colour `#9A9A9A` | right paw (idle) / chest (capture) | — | prop |

#### c08 · Tidesleek
| Field | Value |
|---|---|
| Family / stage / types | f03 · stage 2 · water (from c07 at Lv 16) |
| Body plan · rig | elongated low serpentine swimmer with 4 short flipper-legs · RIG_CHAIN |
| H / length | 0.80 m (head raised) / 2.00 m |
| Habitat | Lore: currents of `lake` and `route_3`. Not wild in the main game. |
| Personality | Sly, fast and a show-off. Hoards shiny things. |
| Distinctive anatomy | 8-segment undulating body. **A periscope pose** that raises the front third upright. **A dorsal row of 10 hex scutes** from shoulder to tail (the motif). **A vertical shell rudder** at the tail tip. Ears reduced to slits. Long whiskers and eyebrow tufts. |
| Dominant colours | P `#2F5E7A` wet slate blue · S `#8FD3D1` aqua scutes · P+ `#E6EEF0` belly (vertex gradient) |
| Materials | Fur `SKIN_WET` r 0.4, clearcoat 0.5. Scutes `SHELL` r 0.2, clearcoat 0.8. Rim `#D8FFFF` 0.45. |
| Face | **Almond** eyes. Iris `#3FB8B0`, round pupil 0.4, 1 highlight plus a wet rim highlight, lidAngle −6 (sly). Brows: 2 thin cone tufts (geometry). Mouth: long painted half-smile (M) plus a `jaw`. |

| Clip | Motion |
|---|---|
| idle | Periscope: segments 1–3 raised into an S-curve with the head turning. The rest lies in a loose coil, and the rudder flicks every 2 s. |
| move (undulation) | A travelling sine through 8 segments (amplitude 0.12 H, 1.2 Hz, wavelength ≈ body length). The legs paddle close to the body. |
| attack | S-compresses (0.2 s), then strikes forward to full 2.5 H extension (`contact` 45%) and follows up with a rudder whip arc. A water-jet trail spawns at `fx_head`. |
| attack_special | Rears into periscope and fires a pressurised stream from `fx_mouth` while its body anchors in a coil. |
| hit | The body kinks at the struck segment (±30°) and recoils into a loose coil. |
| capture | Coils into a tight spiral with its head tucked in the centre. |
| faint | Uncoils flat and straight, head down, with the rudder tipped over. |
| victory | Whips a full circle chasing its own rudder, then snaps into periscope. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| segment ×8 | chain of spheres, (0.16,0.14,0.22) → (0.08,0.07,0.14), spacing 0.26 along −Z; belly vertex gradient to P+ | root @ (0,0.16,0.9) | P | wave |
| neck ×2 | chain capsule r0.08 len0.15 | seg1 front | P | look, wave |
| head | sphere (0.12,0.09,0.17) | neck2 | P | look |
| muzzle | sphere (0.08,0.05,0.07) | head @ (0,−0.03,0.13) | P+ | — |
| jaw | half-sphere (0.07,0.02,0.07) | muzzle bottom | P+ | jaw |
| eye ×2 | sphere r0.035, x×1.3 | head @ (±0.07,0.03,0.08) | E | blink |
| brow tuft ×2 | cone r0.015 h0.06 · pitch −60 | head @ (±0.06,0.07,0.07) | P− | — |
| whisker ×6 | tube r0.004 len0.20 | muzzle sides | D | — |
| ear slit ×2 | sphere r0.02 | head sides | P− | — |
| leg ×4 | capsule r0.035 len0.08 → extrude flipper 0.10×0.06 | seg2 and seg6 sides | P | gait (paddle) |
| scute ×10 | extrude X_hexplate r0.05→0.03, depth 0.02, pitched as a ridge | seg1–seg8 tops | S | wave |
| rudder | extrude X_fin_crescent, vertical, 0.30×0.22, depth 0.03 | seg8 rear | S | wave, fx_tail |

#### c09 · Floeguard
| Field | Value |
|---|---|
| Family / stage / types | f03 · stage 3 · water / frost (from c08 at Lv 34) |
| Body plan · rig | stout upright biped with a carapace and a shield-tail · RIG_BIPED |
| H / length | 1.60 m / 1.10 m (incl. tail shield) |
| Habitat | Lore: floe edges below `snowpeak` where it meets `lake`. Not wild in the main game. |
| Personality | Stoic, protective and patient. Moves last and stands its ground. |
| Distinctive anatomy | The shingle plates have fused into a **chest-and-back carapace** with frost crystals on the shoulders. **The tail is a broad scalloped fan-shell used as a shield**: rested on the ground in idle, swung forward to block. A shell "helmet" cap with a brow ridge. Thick webbed forepaws. **It never holds a shell in its hand as a blade** (see audit). |
| Dominant colours | S `#CFE9F5` ice-white carapace · P `#3E4E63` slate fur · A `#1FA6C9` cyan seams |
| Materials | Fur `FUR` r 0.75. Carapace `SHELL` r 0.2, clearcoat 1.0. Frost crystals `ICE` opacity 0.88, emissive A 0.3. Seams emissive A 0.4. Rim `#E8FBFF` 0.5. |
| Face | **Droopy** calm eyes, lidCoverage 0.3. Iris `#1F5FA6`, round pupil 0.35, 1 highlight. Brows: helmet ridge (geometry). Mouth: firm closed line (M) plus a `jaw`. Frost-tinted whiskers. |

| Clip | Motion |
|---|---|
| idle | Tail-shield rests on the ground beside it like a grounded shield. Breath mist from `fx_nostrils` every 2.5 s. Slow blinks. Slight weight shift (hip roll ±3°). |
| move (upright waddle) | Upright walk at 1.2 Hz with a roll of ±6° per step. The tail-shield is lifted off the ground behind it. |
| attack | Twists its torso 180° (yaw) to swing the tail-shield in a horizontal sweep (`contact` 50%). Ice shards spawn at `fx_shield`. |
| attack_special | Raises the shield overhead with both arms (the tail curls up and over) and slams it into the ground. A water ring and frost crust spread from `fx_ground`. |
| hit | Swings the tail-shield in front of its body (blocking pose) and slides back 0.1 H. |
| capture | Crouches behind its tail-shield, fully covered. |
| faint | The shield drops flat and it sits down heavily, slumping back. |
| victory | Plants the shield, crosses its arms and exhales a frost plume. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pelvis | sphere (0.22,0.20,0.20) | root @ (0,0.40,0) | P | gait |
| torso | lathe L_egg h0.50 rmax0.24 | pelvis @ (0,0.10,0) | P | br |
| carapace front | half-lathe L_dome rmax0.25 h0.12, facing +Z | torso @ (0,0.25,0.14) | S | br |
| carapace back | half-lathe L_dome rmax0.27 h0.14, facing −Z | torso @ (0,0.25,−0.14) | S | br |
| seam band | torus R0.25 r0.012 at the carapace junction | torso | A | glow |
| pauldron ×2 | half-sphere (0.12,0.08,0.12) | torso @ (±0.22,0.42,0) | S | gait |
| frost crystal ×6 | cone r0.02–0.035 h0.06–0.10 | pauldrons | S (ICE) | glow |
| head | sphere (0.16,0.15,0.16) | torso @ (0,0.52,0.03) | P | look |
| helmet cap | lathe L_dome rmax0.15 h0.08 + brow box 0.20×0.03×0.04 | head top | S | — |
| muzzle | sphere (0.09,0.07,0.08) | head @ (0,−0.05,0.12) | P+ | — |
| jaw | half-sphere (0.08,0.03,0.07) | muzzle bottom | P+ | jaw |
| nose | sphere r0.03 | muzzle front | D | — |
| whisker ×6 | tube r0.004 len0.16 | muzzle | A (tint) | — |
| eye ×2 | sphere r0.035 | head @ (±0.07,0.03,0.12) | E | blink |
| arm ×2 | capsule r0.07 len0.22 → capsule r0.065 len0.20 → paw sphere (0.08,0.05,0.08) + web extrude 0.10×0.06 | torso @ (±0.26,0.36,0) | P | gait |
| leg ×2 | thigh sphere r0.13 → capsule r0.07 len0.14 → webbed foot extrude 0.18×0.12 | pelvis @ (±0.12,−0.08,0) | P | gait |
| tail stem | chain 3 × capsule r0.08→0.06 len0.10 | pelvis rear @ (0,−0.05,−0.18) | P | wave |
| tail shield | extrude X_fan radius 0.42, depth 0.04, with 7 rib tubes r0.01 | tail3 | S, ribs A | wave, fx_shield |

### f04 — Dozebud line (verdant)

#### c10 · Dozebud
| Field | Value |
|---|---|
| Family / stage / types | f04 · stage 1 · verdant |
| Body plan · rig | curled ball hugging a seed pod · RIG_BALL |
| H / length | 0.35 m / 0.40 m |
| Habitat | Lore: mossy understorey of `forest`. Suggested: `forest`, `route_2` (common, day). |
| Personality | Sleepy, gentle and clingy. Never lets go of its pod. |
| Distinctive anatomy | A moss-covered baby sloth wrapped around a **seed pod as large as its body**, gripping it with long hooked claws. A **dark eye-mask** on its tan face. A single closed **bell-bud sprout** on its head (the motif). |
| Dominant colours | P `#7FA650` moss green · S `#C9B48A` tan face · D `#8A5A3B` pod brown |
| Materials | Moss `FUR` r 1.0 with the fluffy tag and a bumpy noise normal. Face `FUR` r 0.9. Pod `SHELL` r 0.6 with seam tubes. Claws `#3A3028` r 0.4. Rim `#E8FFC0` 0.25. |
| Face | **Droopy** eyes, lidCoverage 0.5. Iris `#5A3A22`, round pupil 0.5, 1 small highlight. Brows: none; the eye-mask patches are painted on the face decal and slope downward. Mouth: gentle painted smile (M), with a yawn frame. |

| Clip | Motion |
|---|---|
| idle | Slow breathing (moss scale 1±0.04, 0.3 Hz). Eyes drift to `closed`, then snap back to `half`. The bud nods on its stem. |
| move (roll-rock) | Rocks back and forth twice, then rolls forward half a turn as one ball (pod and body together, pitch coupled to distance / r), then pauses. |
| attack | Slowly unwraps one arm (0.6 s windup), then a fast claw hook (`contact` 70%). Re-hugs the pod. |
| attack_special | Squeezes the pod. The pod seam splits and a seed volley spits out from `fx_pod`. |
| hit | Rolls back a quarter turn with the pod. The bud snaps shut. |
| capture | A big yawn (M frame), then it curls tighter. |
| faint | Rolls onto its back. The pod rolls off to the side 0.3 H, and its arms stay reaching toward the pod. |
| victory | Hugs the pod and wiggles contentedly (roll ±10°). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pod | sphere (0.28,0.30,0.28) + 3 seam arcs (tube r0.01) | root @ (0,0.30,0.05) | D | roll, fx_pod |
| body | sphere (0.34,0.32,0.30) | root @ (0,0.34,−0.08) | P | br, roll |
| moss tuft ×6 | sphere r0.06–0.10 (fluffy) | body back and top | P | br |
| face disc | sphere (0.18,0.16,0.08) + mask decal | body @ (0,0.18,0.20) | S | — |
| nose | sphere r0.025 | face @ (0,−0.02,0.07) | D | — |
| eye ×2 | sphere r0.04, z×0.6 | face @ (±0.07,0.02,0.06) | E | blink |
| arm ×2 | capsule r0.05 len0.25, bent to wrap over the pod (two segments, 0.12 + 0.13) | body @ (±0.24,0.10,0.10) | P | attack |
| claw ×3 per arm | tube hook r0.012→0.004 len0.08 | arm end | D | — |
| leg ×2 | capsule r0.05 len0.12 + 2 hook claws | body @ (±0.14,−0.24,0.08) | P | — |
| bud stem | tube r0.01 len0.12, slight curve | body @ (0,0.32,0.05) | P− | lag |
| bud | lathe L_teardrop rmax0.035 h0.07 | stem tip | `#B05FC4` | lag |

#### c11 · Nodbell
| Field | Value |
|---|---|
| Family / stage / types | f04 · stage 2 · verdant / toxin (from c10 at Lv 18) |
| Body plan · rig | lanky biped with arms reaching its ankles (knuckle-crutch walker) · RIG_BIPED |
| H / length | 1.20 m / 0.60 m |
| Habitat | Lore: hanging-vine groves in `forest`. Suggested: `forest` (uncommon, dusk and night). |
| Personality | Languid and deceptively strategic. Waits, sways, then strikes mid-"nod". |
| Distinctive anatomy | **Very long arms** (reaching its ankles) ending in 3 hooked claws. Short legs. A **mossy hooded mantle** over its shoulders and head. **Three hanging clusters of foxglove-like bells** (from both shoulders and its crown) with speckled throats. The pod is gone. |
| Dominant colours | P `#4E7D3A` moss green · A `#B05FC4` foxglove purple · S `#9C8466` fur |
| Materials | Moss `FUR` r 1.0. Fur `FUR` r 0.9. Bells `MEMBRANE` r 0.5, emissive A 0.1, throat spots `#F1E7A0` via texture. Rim `#D9A6FF` 0.25. |
| Face | Long face with dark eye stripes (painted). **Droopy** eyes, lidCoverage 0.45. Iris `#8C6A2F`, round pupil 0.4, 1 highlight. Brows: none (the stripes read as brows). Mouth: small painted mouth with an "o" drowsy frame. |

| Clip | Motion |
|---|---|
| idle | The head droops forward slowly over 1.5 s (a nod), then jerks upright. The bells swing as pendulums with phase lag. The arms hang and swing. |
| move (crutch walk) | Knuckle-crutch gait: both arms plant forward, then the legs swing through. Torso pitch 25°, 0.9 Hz. The bells swing out of phase. |
| attack | Raises both arms overhead (0.6 s windup), then a sudden double-claw hook down (`contact` 60%). The bells release a pollen burst from `fx_bells`. |
| attack_special | Shakes its shoulders so all bells ring, releasing a drifting spore cloud (a toxin or drowsiness move) from `fx_bells`. |
| hit | Sways like a punching bag (torso pitch back 25°, then a damped spring return). The bells jangle. |
| capture | Wraps its long arms around itself and pulls the hood over its face. |
| faint | Tips over backward slowly like a falling tree (1.2 s), arms flopping out to the sides. |
| victory | Nods off standing up, then wakes with a start (a comedic beat). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pelvis | sphere (0.14,0.12,0.12) | root @ (0,0.30,0) | S | gait |
| torso | lathe L_pear h0.38 rmax0.16 · pitch 20 fwd | pelvis @ (0,0.08,0) | S | br |
| mantle | lathe L_dome shell rmax0.20 h0.12 + 5 moss lumps (sphere r0.05–0.07) | torso top | P | br |
| hood | half-lathe L_dome rmax0.14 h0.10 | mantle, behind the head | P | capture |
| head | sphere (0.12,0.14,0.12) | torso @ (0,0.40,0.08) | S | look (nod) |
| face mask | sphere (0.10,0.11,0.05) + stripe decal | head front | S+ | — |
| nose | sphere r0.02 | face | D | — |
| eye ×2 | sphere r0.028 | face @ (±0.04,0.02,0.04) | E | blink |
| upper arm ×2 | capsule r0.035 len0.34 | torso @ (±0.17,0.30,0) | S | gait |
| forearm ×2 | capsule r0.03 len0.32 | upper arm end | S | gait |
| hand ×2 | sphere r0.04 + 3 hook tubes r0.012 len0.10 | forearm end | S, claws D | gait |
| leg ×2 | capsule r0.045 len0.13 → capsule r0.04 len0.12 → foot sphere + 2 claws | pelvis @ (±0.08,−0.06,0) | S | gait |
| bell cluster ×3 | stem tube r0.008 len0.12 + 3 × lathe L_bell (rmax0.04, h0.07, opening down) | mantle L, mantle R, head top | P stem, A bells | pendulum, fx_bells |

#### c12 · Belladrowse
| Field | Value |
|---|---|
| Family / stage / types | f04 · stage 3 · verdant / toxin (from c11 at Lv 33) |
| Body plan · rig | massive quadruped knuckle-walker with a canopy tree on its back · RIG_QUAD |
| H / length | 2.20 m (to canopy top) / 2.00 m |
| Habitat | Lore: the oldest glades of `forest`. Suggested: `forest` deep glade (rare, any time). |
| Personality | Serene and slow. A patient guardian that lets small creatures shelter in its canopy. |
| Distinctive anatomy | Bulky body with long forelimbs whose claws curl so it walks on its knuckles. **A trunk rising from its back into a 4-lobed canopy**, from which **vines and 12 dark bells hang like a curtain**. Low, forward-set head with moss brows and a moss beard. **No shell and no rock spikes** (see audit). |
| Dominant colours | P `#2F5B2E` dark canopy green · A `#8E3FB0` deep purple bells · S `#6F5A48` fur |
| Materials | Canopy `FUR` r 0.95 with noise-displaced lobes. Bark `#5A4632` `STONE` r 0.95. Bells `MEMBRANE` emissive A 0.2 with gold `#E9D34A` speckles. Rim `#C9FF9E` 0.2. |
| Face | Broad mask. **Droopy** eyes, lidCoverage 0.55. Iris `#C28A2E`, round pupil 0.4, 1 highlight. Brows: moss tuft spheres. Mouth: wide gentle painted line (M) plus a `jaw` for yawns and roars. |

| Clip | Motion |
|---|---|
| idle | The canopy lobes sway phase-offset (±3°). The bells swing as pendulums. Slow breathing. The head nods off every 8 s. |
| move (knuckle-walk) | Ponderous quadruped walk at 0.6 Hz. The canopy counter-sways (roll ∓4°). The bells swing heavily. |
| attack | Rears on its hind legs (pitch −35°) and shakes its canopy, releasing a dense pollen cloud from `fx_canopy`. Slams both fore-fists down (`contact` 60%). |
| attack_special | Stays planted. The bells ring in sequence and a sleep or toxin pollen wave spreads from the canopy. |
| hit | The canopy shudders (lobe scale jitter ±5% for 0.3 s) and leaf particles fall. |
| capture | Lowers its body flat. The canopy tilts forward over it like an umbrella. |
| faint | Lies down heavily. The canopy droops (lobes lower 0.1 H) and the bells fall still. |
| victory | Rises on its hind legs, stretches its arms up and the canopy blooms (bell glow 1.0). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | sphere (0.26,0.20,0.34) | root @ (0,0.42,0) | S | br, gait |
| shoulders | sphere (0.24,0.20,0.20) | torso @ (0,0.04,0.24) | S | gait |
| moss back | 6 spheres r0.08–0.12 (fluffy) | torso top | P | — |
| head | sphere (0.13,0.12,0.13) | shoulders @ (0,−0.06,0.22) | S | look |
| face mask | sphere (0.11,0.10,0.05) | head front | S+ | — |
| brow tuft ×2 | sphere r0.03 | face top | P | — |
| beard | 3 spheres r0.035 | face bottom | P | lag |
| jaw | half-sphere (0.07,0.03,0.06) | face bottom | S | jaw |
| eye ×2 | sphere r0.022 | face @ (±0.04,0.02,0.04) | E | blink |
| foreleg ×2 | capsule r0.07 len0.24 → capsule r0.06 len0.22 → fist sphere r0.07 + 3 curled hook tubes | shoulders @ (±0.22,−0.08,0.04) | S, claws D | gait |
| hind leg ×2 | capsule r0.08 len0.16 → capsule r0.06 len0.12 → foot sphere | torso @ (±0.18,−0.12,−0.20) | S | gait |
| trunk | tube along an S-curve, r0.06→0.04, len0.30 | torso @ (0,0.18,−0.10) | `#5A4632` | sway |
| canopy lobe ×4 | sphere r0.16–0.22, noise displacement 0.02 | trunk top, clustered around (0,0.95,−0.05) world | P | sway |
| vine ×8 | tube r0.008 len0.15–0.35, hanging | lobe undersides | P− | pendulum |
| bell ×12 | lathe L_bell rmax0.035 h0.06 | vine tips | A | pendulum, fx_canopy |
| tail nub | sphere r0.04 | torso rear | S | — |

### f05 — Rollith line (stone)

#### c13 · Rollith
| Field | Value |
|---|---|
| Family / stage / types | f05 · stage 1 · stone |
| Body plan · rig | armoured ball with retractable head and legs · RIG_BALL |
| H / length | 0.30 m / 0.45 m |
| Habitat | Lore: scree and tunnels. Suggested: `cave` (common), `route_3` gravel banks. |
| Personality | Timid. Rolls away when startled, but curious once calm. |
| Distinctive anatomy | A near-spherical **hex-plate dome** covering three quarters of its body. A pointed snout with a **pale snout-shield**. A **banded tail that wraps around like a belt** to seal the ball. Stubby legs. |
| Dominant colours | P `#9A8F80` warm grey · S `#E0C7A8` tan · P− `#5E564D` plate lines |
| Materials | Shell `STONE` r 0.85 with the hex pattern as vertex-colour P− grooves plus 6 raised plates. Skin `FUR` r 0.7. Rim `#FFF1D6` 0.2. |
| Face | Small beady eyes (none-sclera), iris `#111`, 1 highlight. Brows: none. Mouth: tiny painted line at the snout tip. |

| Clip | Motion |
|---|---|
| idle | The head peeks out (z +0.2), sniffs (snout bob 3×), retracts briefly, then peeks again. |
| move (roll) | Legs and head retract (scale → 0 and translate, 0.15 s) and the tail belt closes. It rolls with pitch = distance / r, then unrolls when it stops. |
| attack | Curls, spins up in place for 0.3 s (dust), launches at the target, bounces off (`contact` 50%) and unrolls. |
| attack_special | Stamps, and pebbles fly up from `fx_ground` in a spray. |
| hit | Curls instantly and bounces back 0.3 H. |
| capture | Curls into a tight ball. |
| faint | Half-unrolled, lying on its side with its legs out stiff. |
| victory | Unrolls and does a small hop, snout up. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| shell | lathe L_dome as a near-sphere, rmax0.42 h0.80 (covers the top ¾) | root @ (0,0.45,0) · pitch −10 | P | br, roll |
| crown plate ×6 | extrude X_hexplate r0.08, depth 0.03 | shell top | P | — |
| belly | sphere (0.34,0.20,0.36) | shell @ (0,−0.18,0) | S | — |
| head | sphere (0.12,0.10,0.15) | shell @ (0,−0.05,0.36) | S | retract (z −0.2) |
| snout | cone r0.06 h0.12, forward | head front | S | — |
| snout shield | sphere cap r0.04 | snout tip | S+ | — |
| eye ×2 | sphere r0.025 | head @ (±0.06,0.03,0.08) | E | blink |
| leg ×4 | capsule r0.05 len0.12 | shell @ (±0.20,−0.30,±0.16) | S | gait, retract |
| tail band ×4 | torus R0.05 r0.02, chained | shell rear @ (0,−0.15,−0.38) | P | wrap |
| tail tip | cone r0.03 h0.06 | band4 | P | wrap |

#### c14 · Cairnback
| Field | Value |
|---|---|
| Family / stage / types | f05 · stage 2 · stone (from c13 at Lv 20) |
| Body plan · rig | low domed quadruped with a stacked-stone club tail · RIG_QUAD |
| H / length | 0.90 m / 1.60 m |
| Habitat | Lore: cave galleries. Suggested: `cave` (uncommon), `route_3` cliffs (rare). |
| Personality | Grumpy, territorial and dependable. It cannot roll any more and resents it. |
| Distinctive anatomy | A **high elongated hex-plate dome** with **ochre lichen patches**. An armoured head cap. Short massive legs with nails. **A tail of 5 ring bands ending in a club of 4 stacked flat stones (a cairn) with short spikes.** |
| Dominant colours | P `#7A7468` stone grey · S `#C4B454` lichen ochre · D `#4A4038` skin |
| Materials | Dome `STONE` r 0.9 with lichen as vertex-colour S blotches. Skin `FUR` r 0.8. The club stones alternate P and S. Rim `#FFF4C2` 0.2. |
| Face | Small, half-lidded suspicious eyes (lidCoverage 0.35, lidAngle −8). Iris `#B89A3A`, round pupil 0.4, 1 highlight. Brows: the head cap. Mouth: blunt muzzle with a `jaw`. |

| Clip | Motion |
|---|---|
| idle | The club sways side to side (yaw ±15°, 0.3 Hz). The dome rises with each breath, and the head swings side to side, sniffing. |
| move (waddle) | Short legs at 1 Hz. The dome rocks (roll ±5°) and the tail drags with lag. |
| attack | Plants its front feet, pivots its body 90° (yaw) and swings the club horizontally through 150° (`contact` 55%). A dust burst spawns at `fx_club`. |
| attack_special | Slams the club vertically into the ground. Rock spikes erupt from `fx_ground` toward the target. |
| hit | Retracts its head under the dome lip (z −0.1). The dome tilts 5°. |
| capture | Withdraws its head and legs (legs scale Y 0.5) and curls its tail around its body. |
| faint | Tips slightly onto its side. The head lies out on the ground and the tail goes limp. |
| victory | Thumps the club twice on the ground and snorts. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| dome | lathe L_dome rmax0.52 h0.55, z×1.4 | root @ (0,0.28,0) | P (+S lichen) | br |
| dome rim | torus R0.50 r0.04, z×1.4 | dome base | P− | — |
| crown plate ×8 | extrude X_hexplate r0.08, depth 0.03 | dome top | P/S | — |
| under-body | sphere (0.40,0.18,0.62) | root @ (0,0.26,0) | D | gait |
| head | sphere (0.14,0.12,0.16) | under-body @ (0,0.02,0.60) | D | look, retract |
| head cap | lathe L_dome rmax0.15 h0.07 | head top | P | — |
| muzzle | sphere (0.08,0.07,0.08) | head front | D+ | — |
| jaw | half-sphere (0.07,0.03,0.07) | muzzle | D | jaw |
| eye ×2 | sphere r0.025 | head @ (±0.07,0.02,0.10) | E | blink |
| leg ×4 | capsule r0.09 len0.16 → foot cylinder r0.10 h0.05 + 3 nail cones r0.02 h0.04 | under-body @ (±0.30,−0.10,±0.38) | D | gait |
| tail ring ×5 | torus R0.09→0.06 r0.03, chained, spacing 0.09 | under-body rear @ (0,0.02,−0.62) | P | wave |
| club stone ×4 | spheres, flattened: (0.16,0.08,0.14) → (0.10,0.06,0.09), stacked with offsets | ring5 | P/S alternating | wave, fx_club |
| club spike ×4 | cone r0.03 h0.07 | club stones 2–3, radial | P− | — |

#### c15 · Lodestodon
| Field | Value |
|---|---|
| Family / stage / types | f05 · stage 3 · stone / electric (from c14 at Lv 36) |
| Body plan · rig | colossal dome quadruped with orbiting magnetic satellites · RIG_QUAD |
| H / length | 1.90 m / 2.60 m (orbit radius adds 0.5 m) |
| Habitat | Lore: magnetite seams where `cave` meets `volcano`. Suggested: deepest `cave` chamber (rare), `volcano` interior (rare). |
| Personality | Solemn and deliberate. It hums audibly, and compass needles swing near it. |
| Distinctive anatomy | The dome has fractured into **3 raised geode ridges crusted with glowing cyan hex-crystals**. **The club tail is gone**: a stub remains, and **a large lodestone boulder hovers behind it**, joined by crackling arcs. **6 faceless, irregular magnetite stones orbit** the body. A heavy box head with 2 crystal-tipped horn plates. Pillar legs. |
| Dominant colours | P `#3F4550` iron grey · A `#6FE3FF` crystal cyan · D `#2A2A30` lodestone black |
| Materials | Dome `STONE` r 0.85, metal 0.15. Crystals `ICE` preset, opacity 0.9, emissive A 1.0 (2.5 on attack). Lodestones `METAL` r 0.5, metal 0.6, flat shading. Rim `#9FF7FF` 0.35. |
| Face | Small eyes with no visible sclera: iris cyan emissive 0.8 with a short vertical-bar pupil, 1 highlight. Brows: a brow plate. Mouth: heavy box `jaw`. |

| Clip | Motion |
|---|---|
| idle | The lodestones orbit at 0.1 rev/s, each bobbing ±0.05 H with a phase offset. The crystals pulse at 0.5 Hz. Arcs flicker between the crystals and the boulder. |
| move (pillar walk) | Heavy walk at 0.7 Hz. The orbit radius shrinks to 0.8× while moving and the boulder trails with lag. |
| attack | The boulder swings in an arc over its back and slams forward (`contact` 55%), then returns. |
| attack_special | Raises its head and the crystals flare. The orbiting stones align in a line in front of it and launch one after another at 0.08 s intervals from `fx_orbit` (they re-form in orbit after 0.6 s). |
| hit | The orbit wobbles (radius jitter ±15%) and the crystals flicker off for 0.1 s. |
| capture | The stones collapse inward and clamp onto the dome. The boulder docks at its stub. |
| faint | The stones and boulder drop under gravity (bounce once). The crystals dim and the body settles belly-down. |
| victory | The stones spin up to 0.5 rev/s in a tilted ring while the crystals blaze. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| dome | lathe L_dome rmax0.50 h0.48, z×1.3 | root @ (0,0.32,0) | P | br |
| geode ridge ×3 | extrude jagged ridge (len 0.50, h 0.10), depth 0.08 | dome top, 3 parallel ridges along Z | P− | — |
| crystal cluster ×5 | 3–4 hex prisms (cylinder, 6 sides, r0.02–0.04, h0.08–0.16, cone tip) | ridges | A | glow |
| under-body | sphere (0.44,0.20,0.56) | root @ (0,0.30,0) | P− | gait |
| head | box 0.26×0.20×0.26 | under-body @ (0,0.04,0.66) | P | look |
| brow plate | box 0.26×0.04×0.08 | head top front | P− | — |
| horn plate ×2 | extrude wedge 0.14×0.06, depth 0.05, forward + crystal tip | head @ (±0.10,0.06,0.12) | P, tip A | glow |
| jaw | box 0.20×0.06×0.20 | head bottom | P | jaw |
| eye ×2 | sphere r0.022 (emissive eye texture) | head @ (±0.09,0.03,0.13) | E | blink, glow |
| leg ×4 | lathe pillar rmax0.10 h0.26 → foot cylinder r0.12 h0.05 | under-body @ (±0.32,−0.14,±0.40) | P− | gait |
| tail stub | cone r0.08 h0.12 | under-body rear | P− | — |
| lodestone ×6 | icosahedron (detail 1, flat shading) r0.05–0.08, orbit radius 0.75, y 0.40–0.70 | root (orbit pivot) | D | orbit, fx_orbit |
| boulder | icosahedron r0.16 | root @ (0,0.45,−1.00) | D | orbit/lag |
| arcs | line VFX, 3 jagged polylines re-randomised at 12 Hz | crystals ↔ boulder | A | glow |

### f06 — Rimelet line (frost)

#### c16 · Rimelet
| Field | Value |
|---|---|
| Family / stage / types | f06 · stage 1 · frost |
| Body plan · rig | legless sidewinding hatchling serpent · RIG_CHAIN |
| H / length | 0.25 m / 0.60 m |
| Habitat | Lore: under snow crusts. Suggested: `snowpeak` (common), `route_5` high section (snow weather). |
| Personality | Shy and cold-loving. Clings to cold rock and hides under snow. |
| Distinctive anatomy | Big head (40% of its length). **A single tall translucent ice crest on its head**, like a small sail, plus 4 small crests along its back. **A six-armed flake-shaped tail tip.** Frost freckles under its eyes. **No legs and no feelers** (see audit). |
| Dominant colours | P `#EAF6FF` frost white · S `#8FD8E8` ice cyan · A `#B7A9F2` lavender underside (minor) |
| Materials | Body `ICE`-lite (r 0.25, opacity 0.95, emissive S 0.1). Crests `ICE` r 0.1, opacity 0.85. Rim `#FFFFFF` 0.6 (strong, so it reads on snow). |
| Face | Big **round** eyes (60% of the head front). Iris `#6FB6E8`, round pupil 0.6, 3 highlights. Brows: none. Mouth: small open painted smile (M). Three frost-freckle dots per cheek. |

| Clip | Motion |
|---|---|
| idle | The head bobs. The segments pulse in sequence (scale 1±0.04, a wave running tail-ward). The crest glints (glow 0.2→0.6). |
| move (sidewinding) | Sidewinding: a sine wave with a vertical lift component, so only 2 contact points touch the ground at a time. The body travels diagonally at 1.4 Hz and leaves J-shaped snow marks (optional decal). |
| attack | Rears its front half vertically (0.3 s) and snaps down in a head-butt (`contact` 50%). A frost puff spawns at `fx_head`. |
| attack_special | Coils and puffs its cheeks, blowing a sparkle of frost from `fx_mouth`. |
| hit | The body contracts into a C shape. |
| capture | Curls into a ring, tail tip to head (a foreshadowing of Borealoop). |
| faint | Lies straight, segments flattened (scale Y 0.8), crests tilted over. |
| victory | Springs up into a coil and bounces twice. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| head | sphere (0.42,0.40,0.38) | root @ (0,0.50,0.40) | P | look |
| head crest | extrude X_fin_crescent 0.30×0.20, depth 0.04, vertical | head top @ (0,0.30,−0.08) | S | glow |
| eye ×2 | sphere r0.16, z×0.6 | head @ (±0.18,0.06,0.28) | E | blink |
| mouth | M decal | head front-bottom | M | — |
| segment ×5 | chain of spheres r0.36 → 0.22 (ry×0.9), spacing 0.36, along −Z | head rear | P (belly vertex A) | wave |
| back crest ×4 | extrude X_fin_crescent 0.20→0.12, depth 0.03 | seg1–seg4 tops | S | wave |
| tail flake | extrude X_flake6 r0.18, depth 0.04, vertical | seg5 rear | S | wave, glow |

#### c17 · Sleetribbon
| Field | Value |
|---|---|
| Family / stage / types | f06 · stage 2 · frost (from c16 at Lv 26) |
| Body plan · rig | long limbless serpent with a sail-fin row and neck ribbons · RIG_CHAIN |
| H / length | 0.70 m (head raised) / 3.00 m |
| Habitat | Lore: wind-scoured snowfields. Suggested: `snowpeak` (uncommon; more common in snow weather). |
| Personality | Graceful, vain and territorial about untouched snow. |
| Distinctive anatomy | 12-segment serpent. **5 separate translucent dorsal sail-fins** in a row. **Two long ribbon fins trailing from the base of the neck** (not the head). A wedge head with a brow crest. **A flake-shaped tail fin.** Hex-flake scale pattern. No orbs and no horn. |
| Dominant colours | P `#8C8FE0` periwinkle-lavender · S `#E6F6FF` frost white · P+ `#D6F0FF` belly |
| Materials | Scales `SCALE` r 0.35, clearcoat 0.4, with a hex-flake normal pattern. Fins `ICE` opacity 0.75, emissive `#CFEFFF` 0.2. Rim `#FFFFFF` 0.5. |
| Face | Narrow **long-almond** eyes. Iris `#A8E6FF`, **slit** pupil, 1 highlight, lidAngle −5. Brows: the crest (geometry). Mouth: long thin painted line plus a `jaw`. |

| Clip | Motion |
|---|---|
| idle | S-coil with the head raised to 0.9 H. The head sways in a figure-eight. The dorsal fins ripple (sequential pitch ±8°) and the ribbons float. |
| move (lateral slither) | Lateral undulation through 12 segments (amplitude 0.25 H, 1 Hz). The head stays level and the ribbons stream behind. |
| attack | Coils, raises, then strikes with its jaw open (`contact` 45%). |
| attack_special | Flares its fins and sweeps its head side to side, emitting a frost-breath cone from `fx_mouth`. |
| hit | Recoils into a tight S with its fins folded flat. |
| capture | Coils into a spiral heap with its head hidden in the centre. |
| faint | The head drops to the ground, the body straightens and the fins collapse flat. |
| victory | Rises tall and fans out all fins and ribbons (a vanity pose). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| head | lathe L_teardrop along Z, h0.50 rmax0.16 | neck3 | P | look |
| jaw | half-lathe h0.30 rmax0.10 | head bottom | P+ | jaw |
| eye ×2 | sphere r0.05, x×1.5 | head @ (±0.10,0.05,0.18) | E | blink |
| brow crest | extrude X_fin_crescent 0.12×0.08 | head top | S | — |
| neck ×3 | chain capsule r0.12 len0.18 | seg1 front, pitched up to raise the head | P | look, wave |
| neck ribbon ×2 | extrude X_strip 0.55×0.10, curved, depth 0.01 | neck1 sides | S | wave (flutter) |
| segment ×12 | chain of spheres r0.16 → 0.05, spacing 0.30, along −Z | root @ (0,0.16,1.2) | P (belly P+) | wave |
| dorsal sail ×5 | extrude X_sailfin h0.25–0.35, len0.50, depth 0.01 | seg2, 4, 6, 8, 10 | S | wave (ripple) |
| tail flake | extrude X_flake6 r0.18, depth 0.02, vertical | seg12 | S | wave |

#### c18 · Borealoop
| Field | Value |
|---|---|
| Family / stage / types | f06 · stage 3 · frost / lumen (from c17 at Lv 40) |
| Body plan · rig | floating ring-coil serpent with small forelimbs · RIG_CHAIN + RIG_FLOAT |
| H / span | 1.80 m / 1.60 m · hoverGap 0.3 H |
| Habitat | Lore: the summit sky on clear nights. Suggested: `snowpeak` summit (rare, night, clear weather). |
| Personality | Distant and dreamlike. Appears to lost travellers and guides them down. |
| Distinctive anatomy | Its body forms a **near-closed vertical ring** (the tail tucks behind the head with a gap, **not a tail-biting ouroboros**). **Ten aurora ribbon-plumes** stream from the ring's outer edge. **A glowing six-armed flake core floats at the ring's centre.** It has grown **two small clawed forelimbs** near the head, which hold the ring's rim. Navy body flecked with emissive star dots. |
| Dominant colours | P `#1B2A4A` polar navy · A `#47E6A8`→`#B266FF` aurora gradient (green dominant) · S `#E8F7FF` crests and core |
| Materials | Body `SCALE` r 0.35 with emissive star-fleck vertex colours. Plumes `GLOW` opacity 0.7 with a vertex gradient. Core `GLOW` S 2.0. Rim `#9FFFD9` 0.5. |
| Face | Long head. Eyes with no sclera: iris gradient green→violet, emissive 0.5, thin slit pupil, 2 highlights. Brows: crest fins. Mouth: closed painted smile line (M). |

| Clip | Motion |
|---|---|
| idle | The ring sways (roll ±8°) and bobs 0.05 H. The plumes stream on a wind noise. The core spins (yaw 20°/s). |
| move (air-roll) | Tilts the ring forward 30° and rolls through the air like a slow wheel (pitch rotation), with the plumes trailing. |
| attack | The ring spins fast as a wheel (pitch 2 rev/s for 0.4 s), then rolls into the target (`contact` 55%). |
| attack_special | Holds the ring still, facing the target. The core flares (glow 4) and fires an aurora beam from `fx_core`. |
| hit | The ring kinks (the chain around the struck point bends 20°), the plumes scatter and the core dims for 0.1 s. |
| capture | The ring tightens (radius ×0.6) around the core and collapses into its light. |
| faint | The ring opens into a drooping arc and sinks to the ground. The plumes fade to grey. |
| victory | The ring expands ×1.1 and the plumes flare through the full gradient. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| ring pivot | empty | root @ (0,0.55,0) | — | bob, roll |
| loop segment ×16 | spheres r0.09 → 0.05 placed on a circle of radius 0.34 in the YZ-plane (a vertical ring facing ±X); the tail end tucks behind the head with a gap of 0.05 | ring pivot | P | wave, ring |
| head | lathe L_teardrop along the tangent, h0.28 rmax0.09 | segment 1 (top front) | P | look |
| eye ×2 | sphere r0.03, x×1.5 | head sides | E | blink |
| crest fin ×2 | extrude X_fin_crescent 0.12×0.08 | head top | S | — |
| forelimb ×2 | capsule r0.02 len0.10 → 3 claw cones r0.008 h0.03 | segment 2 sides, gripping segment 3 | P | — |
| plume ×10 | extrude X_strip 0.50–0.90 × 0.08, depth 0.005, attached at the outer ring edge | segments 3–14 | A gradient | wave (wind) |
| core | 2 × extrude X_flake6 r0.18 depth 0.05, crossed at 90°, + sphere r0.07 | ring pivot centre | S (GLOW) | spin, glow, fx_core |

### f07 — Gustling line (gale)

#### c19 · Gustling
| Field | Value |
|---|---|
| Family / stage / types | f07 · stage 1 · gale |
| Body plan · rig | round hopping fledgling with stub seed-wings · RIG_WING (hop mode) |
| H / length | 0.30 m / 0.35 m |
| Habitat | Lore: breezy meadows. Suggested: `route_1` (common), `route_2` (common), grassy edges of `town_1`'s route exits (day). |
| Personality | Bubbly, loud and fearless far beyond its ability. |
| Distinctive anatomy | A near-spherical fluffy body with a sky-blue back cap. **Two stub wings shaped like samaras** (a round nut at the root and a thin blade). **Twin tail streamers.** Big feet. Cheek swirl marks. A tiny wide gape beak. |
| Dominant colours | P `#F4F1E8` off-white · S `#7FB3D5` sky blue · A `#E07A5F` cheek swirl (minor) |
| Materials | Down `FUR` r 1.0 with the fluffy tag (noise displacement 0.02). Wings `MEMBRANE` r 0.6, opacity 1. Beak `#F2B05E` r 0.5. Rim `#FFFFFF` 0.35. |
| Face | Big **round** eyes. Iris `#2B1D14`, pupil 0.7, 2 highlights. Brows: painted blue feather tufts, lidAngle +5. Mouth: split beak (upper and lower cones) whose lower half opens wide for cries. |

| Clip | Motion |
|---|---|
| idle | Hops in place every 1.5 s. Fluffs up (scale 1.1 pulse). The wing stubs flick and the streamers flutter. |
| move (hop + gust drift) | Two-footed hops (0.2 H high, 0.35 s each). Every 5th hop a "gust" lifts it into a 0.6 s drift with the wings buzzing at 12 Hz. |
| attack | Flutter-dash: the wings buzz and it rams beak-first (`contact` 45%), then bounces back with a tumble. |
| attack_special | Buzzes its wings hard in place, sending a small gust ring from `fx_body`. |
| hit | Fluffs out (scale 1.2, then 1.0), feather particles burst and it tumbles one roll. |
| capture | Flaps frantically and squawks (beak open). |
| faint | Flops onto its back, feet up, streamers limp. |
| victory | Hops three times and chirps. The cheek swirls glow faintly. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body | sphere (0.42,0.40,0.42) (fluffy) | root @ (0,0.52,0) | P | br, hop |
| back cap | half-sphere (0.36,0.20,0.38) | body @ (0,0.12,−0.06) | S | — |
| cheek swirl ×2 | M decal | body front sides | A | — |
| eye ×2 | sphere r0.10, z×0.6 | body @ (±0.16,0.12,0.32) | E | blink |
| beak upper | cone r0.06 h0.08, half | body @ (0,0.02,0.42) | `#F2B05E` | — |
| beak lower | cone r0.05 h0.06, half | body @ (0,−0.01,0.41) | `#F2B05E` | jaw |
| wing ×2 | extrude X_samara span 0.32 chord 0.10, depth 0.02 | body @ (±0.38,0.05,−0.02) · roll ±20 | S | flap |
| streamer ×2 | extrude X_strip 0.35×0.05, depth 0.005 | body rear @ (±0.04,0.00,−0.40) | S | wave |
| leg ×2 | capsule r0.025 len0.12 → 3 toe cones r0.012 h0.06 | body @ (±0.12,−0.38,0.02) | `#F2B05E` | hop |

#### c20 · Whirlseed
| Field | Value |
|---|---|
| Family / stage / types | f07 · stage 2 · gale / verdant (from c19 at Lv 14) |
| Body plan · rig | slender swift with blade seed-wings · RIG_WING |
| H / span | 0.60 m (hovering pose) / 1.40 m · hoverGap 0.5 H |
| Habitat | Lore: cliff updrafts. Suggested: `route_3`, `route_5` (uncommon, day), `forest` canopy gaps (rare). |
| Personality | Restless, playful and a prankster. Never lands for long. |
| Distinctive anatomy | Streamlined spindle body. **Each wing is one long samara blade** with visible veins and a **green nut at the wrist**. Long twin streamers. A small leaf crest. **It autorotates like a falling maple seed** (its signature behaviour). No visible legs in flight. |
| Dominant colours | P `#6BA7C9` blue · S `#C7A05A` seed tan · A `#3D6B45` leaf green |
| Materials | Feathers `FUR` r 0.7. Blades `MEMBRANE` r 0.55, opacity 0.95, with P− veins. Rim `#FFF2C8` 0.35. |
| Face | Sharp **almond** eyes. Iris `#E0B040`, round pupil 0.35, 1 highlight, lidAngle −10. Brows: painted A swept marks. Mouth: short wide beak with `jaw`. |

| Clip | Motion |
|---|---|
| idle | Hovers with blurred wingbeats (8 Hz, ±50°) and fluttering streamers. Every ~5 s it stops flapping and autorotates (yaw 1 rev/s, dropping 0.1 H), then resumes. |
| move (swoop flight) | 3 fast flaps, then a 0.5 s glide. Banks into turns (roll 35°). |
| attack | Climbs 0.6 H, locks its wings in the samara pose and spins down onto the target (yaw 4 rev/s) in a drill-spin (`contact` 55%). Leaf particles at `fx_body`. |
| attack_special | Hovers and flings a spiral of seed-blades from `fx_wings` in one sweep. |
| hit | Tumbles backward (a pitch −90° flip) and recovers. |
| capture | Wraps its wings forward around its body and autorotates. |
| faint | Spirals down like a seed, slowing its autorotation, and lands on its side. |
| victory | A loop-the-loop, then a hover with its wings spread. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | lathe L_spindle along Z, h0.60 rmax0.12 | root @ (0,0.45,0) | P | br |
| belly | vertex gradient to P+ | torso | — | — |
| head | sphere (0.12,0.11,0.12) | torso front @ (0,0.04,0.30) | P | look |
| beak | cone r0.04 h0.06 + jaw half-cone | head front | `#3A342A` | jaw |
| eye ×2 | sphere r0.035, x×1.3 | head @ (±0.07,0.03,0.07) | E | blink |
| leaf crest | extrude X_leaf 0.12×0.04, depth 0.01 | head top · pitch −40 | A | lag |
| wrist nut ×2 | sphere (0.05,0.04,0.07) | torso @ (±0.10,0.04,0.08) | A | flap |
| wing blade ×2 | extrude X_samara span 0.65 chord 0.18, depth 0.015 + 4 vein tubes r0.004 | wrist nut | S, veins P− | flap, fx_wings |
| streamer ×2 | extrude X_strip 0.40×0.05, depth 0.005 | torso rear @ (±0.03,0,−0.30) | P | wave |

#### c21 · Samaraptor
| Field | Value |
|---|---|
| Family / stage / types | f07 · stage 3 · gale / verdant (from c20 at Lv 31) |
| Body plan · rig | upright stilt-legged raptor hovering under a two-blade rotor · RIG_WING (rotor mode) |
| H / rotor diameter | 1.50 m / 2.00 m · hoverGap 0.2 H |
| Habitat | Lore: high passes where it hunts. Suggested: `route_5` (rare, day), `snowpeak` lower slopes (rare). |
| Personality | A proud hunter and protector of Gustling flocks. |
| Distinctive anatomy | **Its wings have become two opposed samara blades on a spinning shoulder hub above its back** (a living rotor). Upright torso with a cream chest ruff. **Long stilt legs with hooked talons.** Hooked beak. A crown of 3 leaf blades. A 5-leaf tail fan. |
| Dominant colours | P `#2F6A55` deep green · S `#D9B45A` samara gold · P+ `#EFE6CF` chest |
| Materials | Feathers `FUR` r 0.7. Rotor `MEMBRANE` r 0.5, opacity 0.95, with veins. Beak and talons `#3A3A2E` r 0.3. Rim `#FFE9A0` 0.35. |
| Face | Fierce **almond** eyes. Iris `#F2C14E`, round pupil 0.3, 1 highlight, lidAngle −15. Brows: heavy geometric ridge. Mouth: hooked beak with a `jaw`. |

| Clip | Motion |
|---|---|
| idle | Hovers 0.2 H up with the rotor spinning (yaw 1.5 rev/s) and its legs dangling. The head moves in sharp stabilised jerks (hold, snap 0.08 s, hold). |
| move (rotor flight) | The rotor tilts 20° forward, the body follows with lag and the rotor speeds up to 2.5 rev/s. |
| attack | The body pitches forward, the talons thrust out and it dive-grabs (`contact` 50%). The rotor keeps turning. |
| attack_special | The rotor spins up to 4 rev/s, forming a vortex (`fx_rotor` spiral particles), and it flings the vortex forward. |
| hit | The rotor wobbles (precession ±12°) and the body dips 0.15 H. |
| capture | The rotor stops and the blades fold down around its body like a cloak. |
| faint | The rotor slows to a stop. It lands, its knees fold and the blades droop. |
| victory | The rotor spins fast and it rises 0.5 H with talons spread and a screech (jaw). |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso | lathe L_egg h0.50 rmax0.20 · pitch −10 | root @ (0,0.55,0) | P | br |
| chest ruff ×3 | sphere r0.08–0.10 (fluffy) | torso front | P+ | br |
| neck | capsule r0.07 len0.12 | torso top | P | look |
| head | sphere (0.12,0.12,0.14) | neck end | P | look (stabilised) |
| beak | tube hooked, r0.04→0.005 len0.14 + jaw half | head front | `#3A3A2E` | jaw |
| brow ridge ×2 | capsule r0.015 len0.06 | head | P− | — |
| eye ×2 | sphere r0.035 | head @ (±0.07,0.03,0.08) | E | blink |
| leaf crown ×3 | extrude X_leaf 0.14×0.045 | head top, fanned ±25° | P | lag |
| rotor hub | cylinder r0.07 h0.06 | torso @ (0,0.42,−0.05) | S | spin |
| rotor blade ×2 | extrude X_samara span 0.85 chord 0.22, depth 0.02, opposed at 180° | hub | S | spin, fx_rotor |
| tail fan ×5 | extrude X_leaf 0.30×0.08, radial | torso rear, fanned ±40° | P | lag |
| leg ×2 | capsule r0.035 len0.30 → capsule r0.025 len0.30 → 4 hooked talon tubes | torso @ (±0.08,−0.22,0) | S-, talons D | dangle, gait |

### f08 — Ringdrip line (toxin)

#### c22 · Ringdrip
| Field | Value |
|---|---|
| Family / stage / types | f08 · stage 1 · toxin |
| Body plan · rig | six-armed land octopus (radial crawler) · RIG_RADIAL |
| H / length | 0.30 m / 0.50 m (arm spread) |
| Habitat | Lore: tide pools and marsh margins. Suggested: `lake` shore (common), `route_3` marsh (common, rain boosts). |
| Personality | Nervous: it flashes its rings when scared. A curious poker. |
| Distinctive anatomy | An amber bulbous mantle tilted back. **6 arms** (not 8). **Emissive blue rings** on its mantle and arms. Eyes on top ridges with bulgy lid caps. A side siphon. Toxic droplets form at its arm tips. |
| Dominant colours | P `#E8C547` amber · A `#2E6BFF` electric blue rings · P+ `#F6E8B5` underside |
| Materials | Skin `SKIN_WET` r 0.3, clearcoat 0.5. Rings emissive A: idle 0.5, threatened 2.5. Rim `#FFF6C0` 0.35. |
| Face | Eyes with **h-bar** pupils. Iris `#D9A21E`, 1 highlight. Brows: bulgy lid caps (geometry; expression comes from rotating the caps). Mouth: hidden (beak underneath). |

| Clip | Motion |
|---|---|
| idle | The arms curl and uncurl in a wave sequence. The mantle breathes (scale 1±0.05) and the rings pulse slowly (0.5→0.8). |
| move (radial crawl) | Arms step in alternating triplets and the mantle bobs. When fleeing it scoots backwards with a siphon jet. |
| attack | Spreads its arms wide, the rings flash (glow 2.5), then it lunges and slaps with two arms (`contact` 50%). Drip particles. |
| attack_special | Squirts a toxic droplet arc from `fx_siphon`. |
| hit | All arms curl inward, the mantle deflates (0.85) and the rings blink. |
| capture | Squirts an ink puff (dark particles), hides in the cloud and shrinks. |
| faint | The mantle flops forward, the arms splay flat and the rings fade. |
| victory | Rings chase-light around its arms. It waves two arms. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| head base | sphere (0.30,0.22,0.28) | root @ (0,0.30,0) | P (underside P+) | br |
| mantle | lathe L_bulb h0.55 rmax0.28 · pitch −25 | head base @ (0,0.18,−0.08) | P | br |
| eye ×2 | sphere r0.09 | head base @ (±0.16,0.14,0.14) | E | blink |
| lid cap ×2 | half-sphere r0.10 | over the eyes | P | expression |
| siphon | lathe L_crater rmax0.04 h0.10 | head base side @ (0.26,0,−0.05) | P− | fx_siphon |
| arm ×6 | chain 4 × capsule r0.07→0.02, total len 0.55, radial at 60° spacing | head base rim | P | curl, gait |
| ring ×10 | instanced flat torus R0.035 r0.008 | mantle and arm segments | A | glow |

#### c23 · Brineloop
| Field | Value |
|---|---|
| Family / stage / types | f08 · stage 2 · toxin / water (from c22 at Lv 22) |
| Body plan · rig | upright octopus on 4 leg-arms with 2 lasso arms · RIG_RADIAL (tetrapod) |
| H / length | 0.90 m / 0.70 m |
| Habitat | Lore: brackish lake inlets. Suggested: `lake` (uncommon), `route_3` marsh (rare, rain). |
| Personality | A cocky trickster that juggles water droplets. |
| Distinctive anatomy | **Stands upright on 4 thick leg-arms.** **2 long upper arms** that it twirls into lasso loops. **Its mantle is swollen, translucent and visibly full of sloshing brine**, like a water balloon, with an internal water-surface disc. The eyes sit on the body below the mantle. A curling snorkel siphon. The rings have grown into large loops. **No external bubble helmet** (see audit). |
| Dominant colours | P `#D98F2B` ochre orange · A `#2E6BFF` blue rings · S `#9FE3F0` brine |
| Materials | Skin `SKIN_WET` r 0.3, clearcoat 0.6. Mantle shell `ICE`-like, opacity 0.45, r 0.05, fresnel rim `#CFFFFF` 0.7. Inner brine disc S at opacity 0.6. Rim `#FFD7A0` 0.3. |
| Face | Larger eyes with h-bar pupils. Iris `#D9A21E`, 2 highlights. Brows: tilted lid caps (a wry look). Mouth: hidden. |

| Clip | Motion |
|---|---|
| idle | The brine disc sloshes (tilt ±10° with lag to body motion). The lasso arms twirl loops. The rings run a chase-light cycle. |
| move (four-leg waddle) | A waddle-shuffle on 4 leg-arms (diagonal pairs, 1.4 Hz). The mantle wobbles (non-uniform scale jiggle ±4%). |
| attack | Whips both lasso arms into a loop, throws it around the target (the arm chain extends ×1.8) and squeezes (`contact` 55%). |
| attack_special | Squirts a brine jet from `fx_snorkel`. |
| hit | The mantle wobbles hard, the body squashes (Y 0.85) and the brine splashes inside. |
| capture | Pulls all arms up around the mantle and curls into a sphere. |
| faint | The mantle deflates (scale Y 0.5) with a splash particle, and the body slumps limp. |
| victory | Juggles 3 water droplets (fx spheres) with its lasso arms. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body base | sphere (0.20,0.16,0.20) | root @ (0,0.40,0) | P | br, gait |
| eye ×2 | sphere r0.06 | body base @ (±0.10,0.08,0.14) | E | blink |
| lid cap ×2 | half-sphere r0.065 | over the eyes | P | expression |
| mantle | lathe L_bulb h0.45 rmax0.24, translucent | body base @ (0,0.14,−0.04) · pitch −10 | S | jiggle |
| brine disc | cylinder r0.20 h0.005 inside the mantle, at 50% height | mantle | S | slosh |
| inner organ | sphere r0.06 (a visible silhouette through the mantle) | mantle centre | P− | — |
| snorkel | tube curved up and forward, r0.025, len0.30 | mantle top | P | fx_snorkel |
| leg-arm ×4 | chain 4 × capsule r0.07→0.03, total 0.42, splayed at ±35°/±145° | body base underside | P | gait |
| lasso arm ×2 | chain 6 × capsule r0.05→0.015, total 0.55 | body base @ (±0.18,0.05,0.06) | P | twirl |
| ring ×16 | instanced flat torus R0.045 r0.01 | arm segments | A | glow (chase) |

#### c24 · Venomantle
| Field | Value |
|---|---|
| Family / stage / types | f08 · stage 3 · toxin / water (from c23 at Lv 37) |
| Body plan · rig | tall tripod octopus with a 3-arm cloak web · RIG_RADIAL (tripod) |
| H / span | 1.80 m / 1.60 m (web fully open) |
| Habitat | Lore: the dark centre of `lake`. Suggested: `lake` deep water edge (rare, night). |
| Personality | Regal and menacing but honourable. Its intimidation display ends many fights before they start. |
| Distinctive anatomy | Stands on **3 support arms as a tripod**. **3 raised display arms are joined by a dark web** that it spreads like a cloak and reveals **bold blue-and-gold ring patterns** on the inside. A tall hooded mantle. Cuttlefish-like **W-shaped pupils**. |
| Dominant colours | P `#5A2A6E` deep violet · A `#3FA0FF` ring blue (+ `#F0C040` gold secondary accent) · D `#2A1830` web |
| Materials | Skin `SKIN_WET` r 0.35, clearcoat 0.4. Web `MEMBRANE` opacity 0.95, r 0.6, with the ring pattern texture (emissive A 1.0; 3.0 during display). Rim `#C79BFF` 0.35. |
| Face | Hooded eyes (lidCoverage 0.4) with **w-shape** pupils. Iris `#F0C040`, 1 highlight. Brows: lid caps. Mouth: hidden. |

| Clip | Motion |
|---|---|
| idle | Tripod stance. The web half-opens and sways like cloth (the 3 display arms wave slowly). The rings ripple outward in waves. |
| move (tripod glide) | A rotating tripod step (one arm at a time, 0.9 Hz) with the web trailing like a cape. |
| attack | Throws the web fully open (display arms spread 120°) in a full ring-display flash (glow 3.0), then closes the arms around the target point (`contact` 60%). |
| attack_special | Spits a toxin stream from `fx_siphon` while the web stays open. |
| hit | The web snaps closed around its body and it sways back. |
| capture | Wraps the web fully around itself (a cocoon). |
| faint | The tripod collapses and the web spreads flat on the ground like a fallen cloak. |
| victory | A full display: web open and all rings pulsing in sync. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| head | sphere (0.24,0.20,0.24) | root @ (0,1.00,0) | P | br, look |
| mantle hood | lathe L_bulb h0.50 rmax0.20 · pitch −20 | head @ (0,0.22,−0.06) | P | br |
| eye ×2 | sphere r0.05 | head @ (±0.12,0.04,0.17) | E | blink |
| lid cap ×2 | half-sphere r0.055 | over the eyes | P | expression |
| siphon | lathe L_crater rmax0.05 h0.10 | head front-bottom | P− | fx_siphon |
| support arm ×3 | chain 5 × capsule r0.08→0.03, total 1.00, reaching the ground at 120° spacing | head underside | P | gait |
| display arm ×3 | chain 6 × capsule r0.07→0.02, total 0.90, raised | head rim, rotated 60° from the support arms | P | wave, display |
| web panel ×3 | triangle-fan membrane, 12 vertices each, **rebuilt per frame from the display-arm segment positions** | root | D (+ ring texture A) | display |
| ring ×18 | instanced flat torus R0.05 r0.012 | display arms | A / gold | glow |

### f09 — Snipling line (shade)

Family note: every f09 clip is evaluated at **12 fps stepped interpolation** (hold each pose for 1/12 s) while the rest of the scene runs smoothly. This gives the line its cut-out puppet-theatre feel. **All plates are layered in depth (≥ 0.15 H total), and the battle-facing yaw is clamped to within ±50° of the camera**, so no plate is ever seen edge-on for longer than a hit reaction.

#### c25 · Snipling
| Field | Value |
|---|---|
| Family / stage / types | f09 · stage 1 · shade |
| Body plan · rig | flat, layered cut-out biped on rod legs · RIG_FLAT |
| H / depth | 0.40 m / 0.25 m (3 layers) |
| Habitat | Lore: where lamplight throws long shadows. Suggested: `route_4` (night), `cave` mouth (any time). |
| Personality | Mischievous. Mimics the poses of whoever faces it. |
| Distinctive anatomy | Ink-black plates with violet bevel edges. A round head plate with **one tall pointed ear-flap and one folded down** (asymmetric). A trapezoid torso. **Thin rod legs ending in discs.** Rod arms with paper-flap hands. A **zig-zag cut strip tail**. **Eyes are punched holes with warm light behind them.** |
| Dominant colours | P `#1E1B24` ink black · S `#5B4F7A` violet edges · A `#FFE9A8` eyehole light |
| Materials | Plates `PAPER` r 1.0. Bevel material group S. Eyehole light plane `GLOW` A 1.5. Rim S 0.5 (essential on dark backgrounds). |
| Face | **The eyes are cut-outs**, not an eye texture: one round and one crescent. The alpha-cut face texture swaps between frames: neutral, happy (two upward crescents), angry (slanted slits), hurt (small slits), faint (dark, light off). A mouth slit appears only when attacking. |

| Clip | Motion |
|---|---|
| idle | The layers sway independently (parallax wobble ±0.02 H). The head tilts on a hinge in 3 stepped positions. It sometimes copies the opponent's head tilt. |
| move (stiff hop-walk) | Stiff-legged hop-walk. The body pivots on alternating rod legs (yaw ±15°), stepped at 12 fps. |
| attack | Folds in half at the waist hinge, then snaps open like scissors (`contact` 50%) with a shadow slash trail at `fx_body`. |
| attack_special | Its shadow detaches (a black decal) and lunges along the ground at the target. |
| hit | The plates flip edge-on (yaw 90° in 2 steps), then flip back. |
| capture | Folds up like paper (scale X halves 3 times in steps). |
| faint | Tips over flat onto the ground like a dropped cut-out. The eyehole light goes out. |
| victory | Mimics a victory pose: arms up, ear flap flicks. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| torso plate | extrude S25_torso (trapezoid: w 0.50 bottom, 0.35 top, h 0.45, rounded corners), depth 0.04, bevel 0.01 | root @ (0,0.35,0) | P, edge S | br, fold |
| waist hinge | empty | torso @ (0,−0.05,0) | — | fold |
| head front plate | extrude circle r0.26 with alpha-cut eyeholes, depth 0.04 | torso @ (0,0.42,0.05) | P, edge S | look |
| eyehole light | plane 0.30×0.12 | head front @ (0,0.02,−0.025) | A (GLOW) | glow, frame |
| head back plate | extrude S25_ears (circle r0.24 + tall pointed flap 0.40 on the left + folded flap 0.15 on the right), depth 0.04 | head front @ (0,0,−0.08) | P, edge S | ear flick |
| leg rod ×2 | tube r0.02 len0.30 + disc cylinder r0.05 h0.01 | torso @ (±0.12,−0.22,0) | P | gait |
| arm rod ×2 | tube r0.015 len0.22 + hand extrude flap 0.08 | torso @ (±0.22,0.12,0.02) | P | gait |
| tail strip | extrude zig-zag (4 teeth) len0.25 h0.06, depth 0.03 | torso back layer @ (0,−0.10,−0.08) | P, edge S | wag |

#### c26 · Marionyx
| Field | Value |
|---|---|
| Family / stage / types | f09 · stage 2 · shade (from c25 at Lv 28) |
| Body plan · rig | jointed marionette suspended from its own floating crossbar crown · RIG_FLAT + pendulum |
| H / depth | 1.10 m (including the crossbar) / 0.50 m · feet 0.1 H above the ground |
| Habitat | Lore: abandoned stages and ruins. Suggested: `route_4` (night, uncommon), `volcano` ruins (night, uncommon). |
| Personality | Theatrical and sardonic. Performs even when no one is watching. |
| Distinctive anatomy | **A floating cross-shaped crossbar above its head (the "crown") from which 5 faintly glowing cyan strings hold its body.** Thick layered plates. **Visible pin joints** at the shoulders, elbows, hips and knees. An angular mask head with 2 tall horn cut-outs and **a hinged clacking jaw plate**. Cloak-like layered torso. Its feet dangle. |
| Dominant colours | P `#2A2433` ink violet-black · A `#9EE7F2` ghost-cyan strings and eyeholes · S `#6A5C88` edges |
| Materials | Plates `PAPER` r 0.9 with slight sheen. Pins `METAL` `#9EA3B0`. Strings `LineBasic` A, opacity 0.8. Rim `#9EE7F2` 0.5. |
| Face | Mask with slanted almond eyehole cut-outs lit A. Frames as for c25. The mouth is the hinged jaw plate, which clacks on cries. |

| Clip | Motion |
|---|---|
| idle | Dangles and swings as a pendulum from the crossbar (±4°). The limbs swing loosely with lag. The crossbar tilts ±5°. The jaw clacks every 3 s. |
| move (air-walk) | The crossbar glides forward and the body follows with lag. The legs "walk" in the air with exaggerated high knees (stepped). |
| attack | The crossbar yanks up (the body jerks up 0.2 H), then it plunges into a kick with its limbs snapping rigid (`contact` 55%). The strings flash. |
| attack_special | The crossbar spins. The strings lash out as a whip at the target (the lines extend to `fx_target`). |
| hit | The body spins on its strings (yaw 360° unwinding) with its limbs flailing. |
| capture | The strings retract, pulling the body up into the crossbar, where it folds. |
| faint | The strings go slack and fade out. The body collapses into a pile of plates and the crossbar clatters down. |
| victory | Takes a bow: the crossbar dips, the body bends at the waist and one arm sweeps out. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| crossbar | box 0.50×0.04×0.04 + box 0.04×0.04×0.35 crossed, with sphere pin ends r0.025 | root @ (0,0.97,0) | P, pins metal | tilt, glide |
| string ×5 | LineSegments from the crossbar to the head, both hands and both knees (rebuilt per frame) | crossbar | A | — |
| body pivot | empty (pendulum pivot) | crossbar @ (0,−0.06,0) | — | pendulum |
| head plate | extrude S26_mask (w 0.24, h 0.28, 2 horn cut-outs h 0.12), depth 0.05 | body pivot @ (0,−0.25,0) | P, edge S | look |
| eyehole light | plane 0.18×0.06 | head plate back | A (GLOW) | frame |
| jaw plate | extrude 0.16×0.06, depth 0.04, hinged at the back | head plate bottom | P | jaw |
| torso plate ×2 | extrude S26_cloak (w 0.34 flaring to 0.40, h 0.36), depth 0.05, layered z ±0.05 | head @ (0,−0.28,0) | P, edge S | lag |
| pin ×8 | sphere r0.025 | shoulders, elbows, hips, knees | `#9EA3B0` | — |
| upper arm / forearm ×2 | extrude slat 0.04×0.16, depth 0.04 (each) | shoulder pins | P | swing |
| hand ×2 | extrude 3-finger flat 0.08 | forearm end | P | swing |
| thigh / shin ×2 | extrude slat 0.05×0.18, depth 0.04 | hip pins | P | swing, gait |
| foot ×2 | extrude pointed 0.10×0.04 | shin end | P | swing |

#### c27 · Cinderscrim
| Field | Value |
|---|---|
| Family / stage / types | f09 · stage 3 · shade / fire (from c26 at Lv 42) |
| Body plan · rig | a hovering three-panel folding screen backlit by an ember core · RIG_FLAT |
| H / span | 2.00 m / 1.10 m (panels at 30°) · hoverGap 0.05 H |
| Habitat | Lore: burned theatres on the slopes of `volcano`. Suggested: `volcano` (night, rare). |
| Personality | Dramatic and vengeful toward intruders, and devoted to whoever it considers its audience. |
| Distinctive anatomy | **Three tall hinged panels** in a shallow W. The centre panel's **cut-out pattern forms its face** (two large slanted eyeholes and a jagged mouth), backlit by an **internal ember core**. The top edges end in **flame-shaped crenellations**. Two slat arms with flat blade hands emerge from behind the side panels. A smoky hem instead of legs. Bronze frames and hinges. |
| Dominant colours | P `#231A1A` char black · A `#FF7A2E` ember orange · S `#8A5A2B` bronze |
| Materials | Panels `PAPER` r 0.9 (lacquered char). Frames `METAL` r 0.35, metal 0.7. Core `GLOW` A 2.5 with flicker, plus a point light (High only). Smoke particles. Rim `#FF9A5A` 0.4. |
| Face | The centre-panel cut-out set is swapped per frame: neutral, grin, hurt, closed. Light from the ember core shows through. |

| Clip | Motion |
|---|---|
| idle | The panels slowly flex on their hinges (±10°). Embers drift up and the core flickers. Hover bob 0.03 H. |
| move (glide) | Folds its panels narrower (to 60°) and glides with a trail of hem smoke. |
| attack | The slat arms slash in an X (`contact` 50%), leaving ember trails. |
| attack_special | The panels snap fully open (flat, 180° spread) and the core flares (glow 4). It projects its cut-out pattern as a moving silhouette beam (`fx_core`). On High, it casts a light cookie of the pattern. |
| hit | The panels fold shut in front of the core and it rocks back. |
| capture | Folds all its panels flat into a single stack. |
| faint | The panels topple outward, the core fades to embers and smoke rises. |
| victory | A full-open flourish. The face swaps to its grin frame and the core pulses. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| core | sphere r0.12 | root @ (0,0.48,−0.05) | A (GLOW) | glow, fx_core |
| centre panel | extrude S27_centre (w 0.36, h 0.80, flame-crenellated top, alpha-cut face), depth 0.03 | root @ (0,0.45,0.08) | P, frame S | frame |
| side panel ×2 | extrude S27_side (w 0.30, h 0.72, crenellated, alpha-cut pattern), depth 0.03 | hinged at the centre panel edges · yaw ±30 | P, frame S | fold |
| panel frame | box edge strips 0.02 thick along the panel outlines | each panel | S | — |
| hinge ×4 | cylinder r0.02 h0.08 | panel joints | S | — |
| flame crest ×2 | extrude X_flame_tuft 0.14, depth 0.02 | centre panel top corners | A tips | glow |
| hem ×3 | cone r0.12 h0.25, pointing down | panel bottoms | P− | smoke emitter |
| arm ×2 | tube r0.02 len0.40 → blade extrude 0.24×0.05 | behind the side panels @ (±0.28,0.55,−0.05) | P, edge S | slash |

### f10 — Dawnfry line (lumen)

#### c28 · Dawnfry
| Field | Value |
|---|---|
| Family / stage / types | f10 · stage 1 · lumen |
| Body plan · rig | round floating fry ("swims" in air) · RIG_FLOAT |
| H / length | 0.30 m / 0.45 m · hoverGap 0.8 H |
| Habitat | Lore: mist over dawn water. Suggested: `lake` (dawn only, uncommon), `route_5` (dawn, uncommon). |
| Personality | Cheerful. Drawn to lanterns and to trainers' lights. |
| Distinctive anatomy | A chubby round body with a **large fan tail with glowing edges**, a **small crescent dorsal fin**, tiny pectoral fins, and a **lateral light-stripe** along its side. Big eyes and a round "o" mouth. |
| Dominant colours | P `#FFD6A0` peach · S `#F59AB5` pink fins · A `#FFF4C2` glow |
| Materials | Body `SKIN_WET` r 0.35, clearcoat 0.4. Fins `MEMBRANE` opacity 0.8 with emissive A edges (1.2). Stripe emissive A 1.0. Rim `#FFFFFF` 0.45. |
| Face | Huge **round** eyes. Iris `#9B7AD6`, pupil 0.6, 3 highlights. Brows: none. Mouth: a torus ring that opens and closes (scale). |

| Clip | Motion |
|---|---|
| idle | Bobs 0.06 H at 0.7 Hz. The tail fan sweeps side to side, the mouth opens and closes, and the pectorals flutter. |
| move (air-swim) | Swims with tail sweeps (yaw oscillation ±20°, 2 Hz) and a slight body roll. |
| attack | Darts forward (`contact` 45%) and bounces off. |
| attack_special | Spins (roll 360°), releasing a ring of light flakes from `fx_body`. |
| hit | Flips backward (pitch 180°) and rights itself. |
| capture | Glows brightly (3.0) and folds its fins. |
| faint | Floats down belly-up (roll 180°). The glow fades and it rests on the ground. |
| victory | A figure-eight swim with a sparkle trail. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body | sphere (0.36,0.34,0.40), belly vertex P+, stripe vertex A | root @ (0,0.50,0) | P | br, bob |
| peduncle | capsule r0.10 len0.12 along −Z | body rear | P | wave |
| tail fan | extrude X_fan r0.40, depth 0.02, vertical | peduncle end | S, edge A | wave |
| dorsal crescent | extrude X_fin_crescent 0.18×0.10 | body top | S | lag |
| pectoral ×2 | extrude X_leaf 0.12×0.05 | body @ (±0.32,−0.06,0.06) | S | flutter |
| eye ×2 | sphere r0.13, z×0.6 | body @ (±0.20,0.08,0.28) | E | blink |
| mouth ring | torus R0.05 r0.015 | body front @ (0,−0.08,0.39) | P− | open/close |

#### c29 · Lumarlin
| Field | Value |
|---|---|
| Family / stage / types | f10 · stage 2 · lumen (from c28 at Lv 30) |
| Body plan · rig | streamlined air-swimming marlin with a light-bill · RIG_FLOAT (chain) |
| H / length | 0.80 m (sail raised) / 2.00 m · hoverGap 0.4 H |
| Habitat | Lore: high cold air over the passes. Suggested: `route_5` (uncommon, day), `snowpeak` (rare). |
| Personality | Competitive, disciplined and an honourable duellist. |
| Distinctive anatomy | A pearl spindle body with a periwinkle back. **A long glowing gold bill.** **A tall crescent sail-fin that folds flat at speed.** A sickle tail. Long pectoral fins. **The lateral light-stripe is now bright.** |
| Dominant colours | P `#F2F0FF` pearl white · A `#FFD86B` gold · S `#8BA6E8` periwinkle back |
| Materials | Body `SHELL` r 0.25, clearcoat 0.8 (pearl), with a vertex gradient to S on its back. Bill emissive A 1.5. Fins `MEMBRANE` opacity 0.9. Rim `#FFF3C4` 0.5. |
| Face | Sleek **almond** eyes. Iris `#FFD86B`, round pupil 0.35, 1 highlight, lidAngle −8. Brows: a painted S stripe. Mouth: a thin line under the base of the bill (M). |

| Clip | Motion |
|---|---|
| idle | Slow hover with a gentle S-bend through 4 body segments. The sail is half-raised and rippling. The bill glow pulses. |
| move (fast air-swim) | Strong tail beats at 1.5 Hz. The sail folds flat above cruising speed. |
| attack | Rears back (pitch −30°), erects its sail fully, then lunges bill-first 2 H (`contact` 50%) with a light-streak trail. Returns. |
| attack_special | Points its bill and fires a gold light lance from `fx_bill`. |
| hit | The body kinks sideways and the sail flares defensively. |
| capture | Curls nose-to-tail (a C shape) and the bill dims. |
| faint | Sinks slowly to the ground. The sail folds and it lies on its side with the bill glow out. |
| victory | A salute: the bill is raised vertically and the sail fully erect. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body seg ×4 | lathe L_spindle split into 4 chained pieces, total len 1.90 along Z, rmax 0.20 | root @ (0,0.40,0.95) (front) | P (back S) | wave |
| bill | cone r0.03 h0.60, forward | seg1 front | A | glow, fx_bill |
| eye ×2 | sphere r0.04, x×1.3 | seg1 @ (±0.12,0.05,0.10) | E | blink |
| dorsal sail | extrude X_sailfin h0.45 len0.70, depth 0.01, hinged at its base | seg2 top | S | fold, ripple |
| pectoral ×2 | extrude sickle 0.35×0.08 | seg1 @ (±0.16,−0.08,−0.10) | S | lag |
| pelvic fin ×2 | cone r0.02 h0.10 | seg2 bottom | S | — |
| tail | extrude X_fin_crescent (sickle) span 0.55, vertical | seg4 end | S | wave |
| stripe | vertex emissive band A along the flanks | segments | A | glow |

#### c30 · Umbraleen
| Field | Value |
|---|---|
| Family / stage / types | f10 · stage 3 · lumen / shade (from c29 at Lv 44) |
| Body plan · rig | vast floating baleen whale with an eclipse corona crown · RIG_FLOAT (chain) |
| H / length | 2.00 m / 5.50 m · hoverGap 0.25 H · **battle framing: see Risks** |
| Habitat | Lore: the sky over `snowpeak`, seen during eclipses. Suggested: `snowpeak` summit (night, clear, rare; World Designer may prefer a scripted encounter). |
| Personality | Ancient, gentle and solemn. Locals say eclipses happen when it passes overhead. |
| Distinctive anatomy | Indigo-black body with emissive star flecks. **A dark eclipse disc on its forehead ringed by a 12-ray gold-white corona** that rotates slowly. Long knobbly-edged pectoral flippers with glowing edges. Pale lavender belly grooves that glow gold when it sings. **The lateral stripe is now a row of 7 glowing spots.** A tiny crescent dorsal fin. Horizontal flukes. **No wings** (see audit). |
| Dominant colours | P `#231F3A` eclipse indigo · A `#FFE8A3` corona gold-white · S `#C9C3E6` belly lavender |
| Materials | Skin `SCALE` r 0.4, clearcoat 0.3, with emissive star-fleck vertex colours. Corona `GLOW` A 2.0. Belly grooves as vertex stripes S with an emissive gold channel (0 idle, 1.5 singing). Rim `#FFE8A3` 0.4. |
| Face | Small eyes set low near the corner of the mouth. Iris `#FFE8A3`, round pupil 0.4, 1 highlight, kind heavy lids (lidCoverage 0.35). Brows: none. Mouth: long curved jawline with a `jaw` (opens 15°) showing a baleen comb texture. |

| Clip | Motion |
|---|---|
| idle | Slow vertical undulation (tail-beat 0.25 Hz). The pectorals sweep slowly, the corona rotates at 10°/s and the belly glows pulse softly. |
| move (fluke swim) | Slow vertical fluke strokes (0.4 Hz). It banks with its pectorals. |
| attack | A breach-like arc: rises 0.4 H and belly-flops forward (`contact` 60%) with a dust and light shockwave. |
| attack_special | Opens its mouth and inhales. Light particles are pulled in and the local battle light dims 30% (Balanced and High only). Then it exhales a beam from `fx_corona`. |
| hit | The body shudders (a high-frequency ±1° roll for 0.3 s) and the corona flickers. |
| capture | Curls head toward tail and the corona collapses inward. The reaction lasts 1.2 s. |
| faint | Sinks slowly to the ground and lands on its belly with dust. The corona thins to a ring, then goes out. The pectorals droop. |
| victory | Sings: the belly grooves glow gold and the corona flares. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body seg ×5 | lathe L_spindle split into 5 chained pieces, total len 2.75 along Z, rmax 0.42; head seg x×1.1 y×0.85 | root @ (0,0.45,1.30) | P (belly S) | wave |
| lower jaw | half-lathe len0.70 rmax0.30 | seg1 bottom | P, inner baleen texture | jaw |
| eye ×2 | sphere r0.035 | seg1 @ (±0.36,−0.10,0.05) | E | blink |
| eclipse disc | cylinder r0.18 h0.02 | seg1 top @ (0,0.36,0.15) · pitch −20 | D `#0B0A12` | — |
| corona | extrude X_corona inner 0.20 outer 0.34, depth 0.02 | behind the eclipse disc | A (GLOW) | spin, glow, fx_corona |
| pectoral ×2 | extrude humpback flipper (len 0.90, w 0.20, 6 knobs on the leading edge), depth 0.04 | seg2 @ (±0.40,−0.15,0.10) | P, edge A | sweep |
| dorsal crescent | extrude X_fin_crescent 0.12×0.06 | seg4 top | P | — |
| flukes | extrude X_fin_crescent span 0.90, horizontal, depth 0.04 | seg5 end | P | wave |
| lateral spot ×7 per side | sphere r0.025 | seg2–seg4 flanks | A | glow |

---

## 5. Base stats and progression numbers (for the Systems Designer)

The Systems Designer owns every formula. This section supplies per-species inputs only.
- **Catch rate uses a 0–255 scale.** 255 is easiest, and the value feeds the Systems capture formula.
- **Base XP yield rule used here:** round(BST × 0.20) for stage 1, × 0.35 for stage 2 and × 0.48 for stage 3.
- **Growth curve** is fast, medium or slow. Systems defines the XP-per-level tables.
- All evolution happens by level. Stage 1 evolves to stage 2 at the level in the "Evo 1→2" column, and stage 2 to stage 3 at the "Evo 2→3" column.

Design targets met:
- Starters: every line totals **310 / 405 / 525**, with a different stat spread per line.
- Wild lines: totals range from **285 to 540**.
- Early lines are weaker: f07 and f04 fall between 285 and 495.
- Late lines are stronger: f06, f09 and f10 run from 310 to 540.

| id | Name | HP | Atk | Def | SpA | SpD | Spe | BST | XP | Catch (0–255) | Evo 1→2 | Evo 2→3 | Growth |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01 | Fizzkit | 40 | 45 | 38 | 62 | 45 | 80 | 310 | 62 | 45 | 16 | — | medium |
| c02 | Crackleap | 55 | 58 | 50 | 82 | 58 | 102 | 405 | 142 | 45 | — | 34 | medium |
| c03 | Tempestrel | 70 | 72 | 62 | 110 | 76 | 135 | 525 | 252 | 45 | — | — | medium |
| c04 | Wickwool | 55 | 65 | 58 | 45 | 45 | 42 | 310 | 62 | 45 | 16 | — | medium |
| c05 | Kilnhorn | 72 | 88 | 72 | 58 | 60 | 55 | 405 | 142 | 45 | — | 34 | medium |
| c06 | Magmouflon | 95 | 118 | 100 | 70 | 80 | 62 | 525 | 252 | 45 | — | — | medium |
| c07 | Rippleback | 52 | 50 | 55 | 55 | 58 | 40 | 310 | 62 | 45 | 16 | — | medium |
| c08 | Tidesleek | 65 | 70 | 62 | 72 | 66 | 70 | 405 | 142 | 45 | — | 34 | medium |
| c09 | Floeguard | 90 | 85 | 112 | 88 | 95 | 55 | 525 | 252 | 45 | — | — | medium |
| c10 | Dozebud | 60 | 40 | 50 | 45 | 60 | 35 | 290 | 58 | 235 | 18 | — | medium |
| c11 | Nodbell | 80 | 60 | 65 | 65 | 85 | 40 | 395 | 138 | 110 | — | 33 | medium |
| c12 | Belladrowse | 110 | 90 | 85 | 75 | 100 | 35 | 495 | 238 | 55 | — | — | medium |
| c13 | Rollith | 45 | 55 | 85 | 30 | 45 | 40 | 300 | 60 | 190 | 20 | — | medium |
| c14 | Cairnback | 65 | 85 | 115 | 40 | 60 | 45 | 410 | 144 | 100 | — | 36 | medium |
| c15 | Lodestodon | 85 | 95 | 135 | 80 | 75 | 35 | 505 | 242 | 45 | — | — | medium |
| c16 | Rimelet | 45 | 40 | 55 | 65 | 60 | 45 | 310 | 62 | 150 | 26 | — | slow |
| c17 | Sleetribbon | 60 | 70 | 60 | 85 | 65 | 80 | 420 | 147 | 90 | — | 40 | slow |
| c18 | Borealoop | 80 | 60 | 80 | 115 | 110 | 75 | 520 | 250 | 40 | — | — | slow |
| c19 | Gustling | 40 | 50 | 35 | 40 | 35 | 85 | 285 | 57 | 255 | 14 | — | fast |
| c20 | Whirlseed | 55 | 75 | 45 | 55 | 45 | 115 | 390 | 137 | 120 | — | 31 | fast |
| c21 | Samaraptor | 75 | 100 | 65 | 75 | 70 | 105 | 490 | 235 | 60 | — | — | fast |
| c22 | Ringdrip | 48 | 45 | 45 | 60 | 55 | 47 | 300 | 60 | 190 | 22 | — | medium |
| c23 | Brineloop | 65 | 55 | 70 | 80 | 75 | 60 | 405 | 142 | 100 | — | 37 | medium |
| c24 | Venomantle | 85 | 70 | 80 | 105 | 95 | 70 | 505 | 242 | 45 | — | — | medium |
| c25 | Snipling | 40 | 60 | 40 | 60 | 45 | 70 | 315 | 63 | 140 | 28 | — | slow |
| c26 | Marionyx | 55 | 85 | 55 | 80 | 60 | 90 | 425 | 149 | 80 | — | 42 | slow |
| c27 | Cinderscrim | 70 | 95 | 65 | 120 | 80 | 100 | 530 | 254 | 35 | — | — | slow |
| c28 | Dawnfry | 60 | 35 | 50 | 65 | 65 | 45 | 320 | 64 | 120 | 30 | — | slow |
| c29 | Lumarlin | 65 | 90 | 55 | 75 | 60 | 85 | 430 | 151 | 75 | — | 44 | slow |
| c30 | Umbraleen | 130 | 80 | 90 | 110 | 90 | 40 | 540 | 259 | 25 | — | — | slow |

Stat identity by line:
- f01 is a fast special attacker.
- f02 is a physical bruiser that gets bulkier.
- f03 is balanced, gets fast at stage 2, then becomes a slow wall at stage 3. This mirrors its anatomy (a sleek swimmer that becomes a shield-bearer).
- f04 is a slow special-defence tank.
- f05 is a physical wall that gains special attack through its electric typing.
- f06 is a special attacker.
- f07 is a fast, frail physical line.
- f08 is special and bulky.
- f09 is a fast mixed attacker.
- f10 goes from support fry to physical lancer to an HP-heavy special whale.

Evolution levels are spaced to fit the ANCHORS level range (party around Lv 5 at start and around Lv 50 at the champion). The latest evolution is Lv 44 (c29→c30).

### 5.1 Passive trait ideas
Status names are placeholders. The Systems Designer maps them to real statuses:
- `Numbed` is the paralysis class.
- `Chilled` is the frostbite and slow class.
- `Drowsy` is the sleep class.
- `Toxified` is the poison class.
- `Burn` is the fire damage-over-time class.

Proposal: each wild individual rolls one trait from its species list. Starters always get trait 1.

| id | Trait 1 — effect | Trait 2 — effect |
|---|---|---|
| c01 | **Sparkhide**: contact attackers have a 20% chance to become Numbed | — |
| c02 | Sparkhide | **Sprint Start**: Speed ×1.2 on its first turn after entering battle |
| c03 | Sparkhide | **Storm Sail**: electric moves ×1.2 in gale weather or gale-attuned zones |
| c04 | **Kindle Core**: the first time its HP falls below 50% in a battle, it heals 1/8 max HP and its fire moves deal ×1.2 for 3 turns | — |
| c05 | Kindle Core | **Headstrong**: opponents cannot lower its Attack |
| c06 | Kindle Core | **Kiln Plating**: super-effective damage taken ×0.8 |
| c07 | **Shell Tail**: the first physical hit it takes each battle deals ×0.5 | — |
| c08 | Shell Tail | **Slipstream**: Speed ×1.5 in rain or water-attuned zones |
| c09 | Shell Tail | **Floe Bulwark**: contact attackers have a 30% chance to become Chilled |
| c10 | **Deep Doze**: sleep lasts 1 fewer turn, and it heals 1/16 max HP per sleeping turn | — |
| c11 | Deep Doze | **Nodding Pollen**: contact attackers have a 20% chance to become Drowsy |
| c12 | Nodding Pollen | **Canopy Shelter**: heals 1/16 max HP at the end of each turn, or 1/8 if it used no damaging move that turn |
| c13 | **Curl Guard**: damage taken ×0.75 while it is at full HP | — |
| c14 | Curl Guard | **Club Rebound**: a contact attacker has a 30% chance to lose 1/8 of its max HP |
| c15 | Club Rebound | **Lodestone Field**: when it enters battle, the opponent's Speed drops 1 stage |
| c16 | **Hoarfrost Hide**: contact attackers have a 20% chance to become Chilled | — |
| c17 | Hoarfrost Hide | **Rime Glide**: Speed ×1.5 in snow weather |
| c18 | Rime Glide | **Borealis Ring**: once per battle on entry, special damage to its side ×0.67 for 3 turns |
| c19 | **Updraft**: gale moves ×1.2 while it is at full HP | — |
| c20 | Updraft | **Samara Spin**: after it uses a gale move, 30% chance of +1 Speed stage |
| c21 | Samara Spin | **Rotor Hover**: immune to moves tagged `ground_quake` |
| c22 | **Warning Rings**: the first time its HP falls below 50%, the opponent's accuracy drops 1 stage | — |
| c23 | Warning Rings | **Brine Ballast**: immune to Burn, and heals 1/16 max HP per turn in rain |
| c24 | Warning Rings | **Venom Mantle**: contact attackers have a 30% chance to become Toxified |
| c25 | **Cutout**: the first damaging move aimed at it each battle has accuracy ×0.8 | — |
| c26 | Cutout | **Puppeteer**: when the opponent raises a stat, 30% chance it raises the same stat by 1 |
| c27 | Puppeteer | **Backlight**: shade moves ×1.2 at night and fire moves ×1.2 by day |
| c28 | **First Light**: heals 1/16 max HP per turn at dawn or by day | — |
| c29 | First Light | **Glint Bill**: contact moves get +1 critical-hit stage |
| c30 | First Light | **Eclipse Body**: the first super-effective hit it takes each battle deals ×1 instead |

---

## 6. Evolution presentation notes
- The evolution sequence is owned by the Systems and UI state machines. The art contract is:
  1. The stage-N model plays `victory`.
  2. It is lit by a white silhouette pass for 1.2 s.
  3. It crossfades through a shared light-mote effect.
  4. The stage-N+1 model plays `victory`.
- The two models are separate builders; nothing morphs between them.
- The family motif is always the first part to glow in step 2, so players read the continuity: sail seams, horn ridges, tail plates, bells, crown plates, crest fins, samara blades, rings, eyeholes, light-stripe.

---

## 7. Silhouette sheet (reproducible preview procedure)

### 7.1 Procedure (to be implemented as `tools/silhouettes` — not yet built, not yet run)
1. A dev-only route, `/dev/silhouettes?ids=c01,…&pose=idle0|attackContact&view=battle|side`, mounts each species builder alone. It uses the **production builder code**; no special-cased meshes are allowed.
2. **Silhouette mode:**
   - Override every material with `MeshBasicMaterial({color:#000})`.
   - Disable particles, sprites, lines, bloom and shadows.
   - White background, tone mapping off.
   - Freeze the clip at the requested pose: `idle` at t=0, or the `attack` `contact` marker.
3. **Cameras:**
   - (a) **Battle view:** perspective, FOV 35°, azimuth 30° off the creature's +Z facing, elevation 10°. Framed on the model's bounding sphere so the sphere's diameter fills 85% of the frame height.
   - (b) **Side view:** orthographic, azimuth 90°, same framing rule.
4. **Sizes:**
   - A 256×256 render.
   - A 20×20 render made **natively** (renderer size 20, DPR 1, antialias off), which is the worst case.
   - A 20×20 render box-downsampled from the 256 render, as a secondary check.
5. Playwright (the preinstalled Chromium) drives the route and saves PNGs to `artifacts/silhouettes/{view}/{size}/{id}_{pose}.png`. It composes a contact sheet: 10 columns (families) × 3 rows (stages) per size and view.
6. **Colour pass:** a second render uses unlit flat slot colours (`MeshBasicMaterial` with P/S/A) at 20 px and 256 px. The script k-means clusters the non-background pixels (k=3) and reports the top-2 clusters against the declared dominant pair (CIEDE2000 ΔE).
7. **Metrics JSON** (`artifacts/silhouettes/metrics.json`):
   - Per species: fill ratio, bbox aspect, and the centroid of the 20 px mask.
   - Per pair: IoU of the 20 px masks after aligning bbox centres and scaling both to equal height, plus the 256 px Hu-moment distance.
   - **Flag** any pair with 20 px IoU ≥ 0.85 (proposed threshold; to be calibrated after the first run).
8. The script exits non-zero if any species fails to render, any flagged pair is not listed in an allow-list with a written justification, or any colour check misses by ΔE > 15.

### 7.2 Categories
| Code | Category | Definition |
|---|---|---|
| QS | small quadruped | 4 legs on the ground, H < 0.6 m |
| QL | large quadruped | 4 legs on the ground, H ≥ 0.6 m |
| BP | biped | upright on 2 legs |
| SR | serpentine/elongated ground | length ≥ 2.4 H, low, on the ground |
| WG | winged flyer | lift from wings, sails or a rotor |
| RB | round/ball | overall mask roughly circular (aspect 0.8–1.25, fill > 0.6) |
| RD | radial | a central body with ≥ 5 radiating arms |
| FT | flat cut-out | built from planar plates, grounded or near-grounded |
| FL | floater | airborne with no wing lift |

### 7.3 Per-species silhouette lines and 20 px must-read features
| id | Cat | Silhouette (one line) | Must remain readable at 20 px |
|---|---|---|---|
| c01 | QS | Big-headed flat lizard, low and long with a forked tail | oversized head blob; tail longer than its body; fork notch at the tip |
| c02 | BP | Forward-leaning runner with sails bridging arms to hips | 30° lean; triangular sail wedge under each arm; long tail counterweight |
| c03 | WG | Wide delta kite with a long streamer tail | span ≈ 1.75 H horizontal wedge; head spike forward; tail line |
| c04 | QS | Lumpy cloud-body lamb on thin legs with tiny curls | bumpy top outline; 4 stick legs; head bump with horn nubs |
| c05 | QL | Leggy ram mid-leap with big spiral horns | spiral horn circles; long legs; mane collar bulge |
| c06 | QL | Massive shoulders tapering to small hips, head ringed by horn loops | front-heavy wedge; horn rings (holes read at 256, a bump at 20); short legs |
| c07 | QS | Sitting otter with a thick plated tail curling out | upright seated pose; tail as thick as its body; round head |
| c08 | SR | Long low S-body with a raised periscope head and a tail rudder | long horizontal S; vertical head stalk; rudder notch |
| c09 | BP | Stout upright figure with a big fan shield beside it | fan semicircle at its side; rounded shoulders; helmet cap |
| c10 | RB | A ball wrapped around a smaller ball, with a sprout | double-circle outline; claw arcs; bud dot on top |
| c11 | BP | Stooped figure with arms to the ground and hanging bells | arms longer than its legs; 3 dangling blobs; hood hump |
| c12 | QL | A walking tree: body below, lobed canopy above, a curtain of bells | canopy mass wider than the body; dangling fringe; low head |
| c13 | RB | A near-perfect armoured ball with a snout nub | circle with a small forward point; crown bumps |
| c14 | QL | A low dome on stubby legs with a knobbed club tail | dome arc; club knob at the tail end; low head |
| c15 | QL | A huge crystal-ridged dome ringed by floating stones | spiky ridge crown; 6 detached dots around it; a floating boulder behind |
| c16 | SR | Big-headed short serpent with one tall head crest | head ≥ 40% of its length; single fin spike; flake tail |
| c17 | SR | Very long serpent with a saw-row of sails and a raised head | 5 separated sail bumps; long line; ribbons behind the head |
| c18 | FL | A floating ring with streaming ribbons and a bright centre | ring hole (at 256); circular outline with trailing plumes |
| c19 | RB | A fluffy sphere on two legs with twin tail streamers | circle; 2 streamer lines; stub wing tips |
| c20 | WG | Thin body with two long blade wings, like a flying seed | crescent-scythe wing pair; twin streamers |
| c21 | WG | Stilt-legged bird with a two-blade rotor over its back | horizontal blade bar above its head; long legs; hooked beak |
| c22 | RD | Tilted bulb with six splayed short arms | bulb plus a radial arm fringe |
| c23 | RD | Upright bulb-headed stander on 4 arm-legs with 2 raised loops | 4-leg splay; 2 lasso loops; big translucent top (reads as a mass) |
| c24 | RD | Tall hooded tripod with a spread cloak-web | tripod legs; web triangle spread; hood peak |
| c25 | FT | Tiny cut-out figure with one tall ear and rod legs | asymmetric ear spike; thin legs; flat outline |
| c26 | FL | A dangling puppet below a floating cross | the crossbar line above the head with a gap; horned mask; dangling feet |
| c27 | FT | A tall three-panel screen with a flame-crenellated top | W-folded panel wall; crenellated top edge; hem points |
| c28 | FL | A round floating fish with a big fan tail | circle plus fan; hovering gap |
| c29 | FL | A long fish with a spear bill and a tall sail | bill spike ≥ 0.3 of its length; sail triangle; sickle tail |
| c30 | FL | An enormous whale with a rayed crown on its head | long whale mass; corona spikes on its forehead; long flippers |

### 7.4 Category × dominant-colour uniqueness check
No two species share a (category, dominant colour pair):

| Cat | Species — dominant pair |
|---|---|
| QS | c01 teal/yellow · c04 cream/brick red · c07 brown/sea teal |
| QL | c05 red-brown/charcoal · c06 basalt black/magma orange · c12 dark green/deep purple · c14 stone grey/ochre · c15 iron grey/crystal cyan |
| BP | c02 deep blue/yellow · c09 ice white/slate · c11 moss green/foxglove purple |
| SR | c08 slate blue/aqua · c16 frost white/ice cyan · c17 periwinkle/white |
| WG | c03 indigo/cyan · c20 blue/seed tan · c21 deep green/gold |
| RB | c10 moss green/tan · c13 warm grey/tan · c19 off-white/sky blue |
| RD | c22 amber/blue · c23 ochre orange/blue · c24 deep violet/blue |
| FT | c25 ink black/violet · c27 char black/ember orange |
| FL | c18 navy/aurora green · c26 ink black/ghost cyan · c28 peach/pink · c29 pearl white/gold · c30 indigo/corona gold |

Known near-pairs to watch in the first real run:
- **c22 vs c23** (same category, blue rings, yellow vs orange body): they differ by posture. c22 is low and radial, while c23 stands upright on 4 legs.
- **c14 vs c15** (both domes): c15's orbiting stones and crystal ridge crown are its separators.
- **c08 vs c17** (blue serpents): c17's sail row and its 3.0 m length against c08's head stalk and rudder.
- **c30 vs c26** (dark floaters): these differ in scale and outline.

If the IoU flag fires on any of these, the fix is anatomy. A palette change alone does not count as a fix.

---

## 8. Originality audit

Scope and method:
- The comparison is against well-known creature franchises: primarily Pokémon, and also Digimon, Palworld, Monster Hunter, Temtem and *The Legend of Zelda*. Fan works surfaced by the name search are also included.
- The comparison draws on the author's general knowledge of those franchises. It is not an exhaustive search.
- Shared generic traits (e.g. "fire sheep", "ice serpent") are genre conventions. The test is whether a **combination** would read as a specific existing creature.
- **No legal clearance is claimed.**
- Items marked ⚠ carry a design constraint that the character gate must check on rendered models.

| id | Closest known creature(s) | Why this is not a recognisable imitation / what was changed |
|---|---|---|
| c01 | Helioptile (Pokémon, electric lizard with a neck frill); Emolga (electric flying squirrel with patagia); Pikachu (electric mascot with a bolt-shaped tail) | No neck frill: the sails are rib flaps, based on the real *Draco* gliding lizard. The body is teal, not yellow. The tail tip is a two-prong fork, and **must never be drawn as a zig-zag bolt**. A reptile, not a rodent. |
| c02 | Heliolisk (bipedal electric frilled lizard); Grovyle (bipedal lizard with forearm leaf blades) | No frill (constraint: ≤ 3 swept head spines, never a fan). The sails are membranes running from the forearm **to the hip**, not blades on the forearm. Blue and yellow palette with a forked tail. ⚠ Keep the spines thin and never leaf-shaped. |
| c03 | Zekrom (black electric dragon with a tail generator); Rayquaza (sky serpent); generic wyverns | Lift comes from rib-sails along the flanks, with no shoulder wings, horns or dragon head. It has 4 slender tucked limbs and ribbon streamers. Indigo and cyan. It reads as "giant gliding lizard", not "dragon". |
| c04 | Mareep and Wooloo (sheep); Palworld's Lamball (round sheep); fan-made "Kindlamb" (fire lamb starter) | "Fire ram calf" is the brief's own concept, and it overlaps with a fan work (which is why that name was rejected). Distinctions: fleece in 7 discrete clusters over brick-red skin, wick-like flame horn tips, stick legs with knobbly knees, and a flame-tuft tail. No round ball body and no electric wool. |
| c05 | Gogoat and Skiddo (goats); Tauros (bull); Bouffalant (bull with an afro) | Charcoal smouldering mane collar, spiral horns with emissive ridge rings, goat h-bar pupils, and a cliff-leaping gait. Nothing resembles a bull's afro or a mount's leaf mane. |
| c06 | ⚠ **Camerupt** (fire/ground quadruped with volcanic humps); Torkoal; Tauros | **Changed during this pass:** the original "vent crater on the hump" was removed because it echoed Camerupt's signature. Heat now vents through the **horn kiln-rings**, and magma shows only as seams between basalt hex-plates. Ram skull, bison taper, with no crater anywhere on its back. |
| c07 | ⚠ **Oshawott** (sea-otter starter with a scalchop shell on its belly); Buizel (sea weasel with a flotation collar) | The shell plates are **only on the tail**, as shingles. The body is brown with a teal shell, and it carries a pebble tool. Constraints: never a shell on the chest or belly, never a detachable shell. |
| c08 | Floatzel/Buizel; Dewgong; Milotic | An 8-segment serpentine otter with a dorsal hex-scute row and a vertical shell rudder, in a periscope pose. It has no twin tails, no flotation collar and no head fins. |
| c09 | ⚠ **Dewott/Samurott** (bipedal/quadruped otter line with shell blades); Empoleon (armoured penguin) | The shell becomes a carapace **and a tail-shield**. It is **never held as a blade or sword**, and there is no horned helm or seamitar. Frost crystals, a slate and ice palette, a defensive-guardian behaviour. Constraint: the arms never grip shell parts. |
| c10 | Slakoth (sloth); Snorlax (sleeper) | A moss-backed sloth hugging a seed pod as big as itself, with a bell-bud sprout. The pod-hugging silhouette is its signature. |
| c11 | Vigoroth; Ludicolo; Bellsprout (bell plant) | A long-armed crutch-walking sloth-biped with a moss hood and foxglove bell clusters. No bell-shaped head, no sombrero pad. |
| c12 | ⚠ **Torterra** (tortoise carrying a tree); Tropius; Slaking | Carrying a tree is a shared idea. Distinctions: a **mammal knuckle-walker with no shell and no rock spikes**, a 4-lobe canopy, and a **curtain of hanging bells and vines**. Its mask face and droopy eyes continue the family. Constraint: never add shell plates or rock horns. |
| c13 | Sandshrew (rolls into a ball); Roggenrola; armadillo creatures generally | A glyptodont-style hex dome with a tail band that seals the ball as a belt, and a pale snout shield. Grey and tan, no spines, no claws on show. |
| c14 | Bastiodon (shield-faced dinosaur); Torkoal; Monster Hunter armoured beasts | A glyptodont body with a **stacked-cairn tail club**. The face is small beneath a cap, not a shield-face, and the dome carries ochre lichen. |
| c15 | ⚠ **Probopass** (rock with orbiting magnetic "mini-noses"); Magnezone; Carbink | Orbiting satellites are a shared idea. Distinctions: its satellites are **faceless, irregular magnetite stones plus one large boulder**, on a quadruped dome with geode crystal ridges. Constraint: satellites never get faces or noses, and the body never gets a moustache or a large nose. |
| c16 | ⚠ **Snom** (small white ice larva with big eyes) | **Changed during this pass:** the prolegs and head feelers were removed, because the first draft read as an icy caterpillar. It is now a legless sidewinding serpent hatchling with a single tall head crest and a flake tail. The white-and-cyan, big-eyed baby look is generic. |
| c17 | ⚠ Dragonair (blue serpent with head wings and orbs); Milotic; Gyarados | Periwinkle, with **5 separated translucent dorsal sails** and ribbons from the **base of the neck** (not wing-like head fins). No orbs and no forehead horn. Constraints: never place orbs on it or fins on its cheeks. |
| c18 | Rayquaza; Suicune (aurora ribbons); the ouroboros symbol (public domain) | A near-closed floating ring that **does not bite its tail**, with a flake core at its centre and small forelimbs. Aurora ribbons are generic. No green dragon features. |
| c19 | Swablu (cotton-wing bird); Rowlet (round owl); Palworld's Chikipi | A round swiftlet with **samara-shaped** stub wings, twin streamers and cheek swirls. No cloud wings, no owl face or bowtie leaves. |
| c20 | Taillow/Swellow (swallows with long tails); Hoppip/Jumpluff (spinning seed-fluff) | Each wing is a **single maple-seed blade** with a nut at the wrist, and it autorotates as a behaviour. No red face, no cotton puffs. |
| c21 | Decidueye (grass owl archer); Braviary; Talonflame | A **two-blade rotor on its back** in place of wings. None found in the listed franchises. Stilt legs and a leaf crown. No owl hood, no arrows. |
| c22 | Octillery; Tentacool; Grapploct; the real blue-ringed octopus | Six arms (deliberately not eight), an amber body with emissive blue rings, and a land-walking radial crawl. No cannon mouth, no boxing gloves. |
| c23 | ⚠ **Araquanid/Dewpider** (spider with a water-bubble helmet) | **Changed during this pass:** the first draft's external water-bubble helmet was replaced by a **swollen translucent mantle full of brine** (its own body), because a bubble helmet is a known Araquanid signature. The body plan is an octopus standing on 4 legs with 2 lasso arms. |
| c24 | Malamar (inverted squid); Tentacruel; Dhelmise | A tripod stance with a 3-arm cloak web and a ring-pattern display. Cuttlefish W-pupils (a real animal trait). No inverted body, no crest orbs. |
| c25 | Banette (puppet ghost); Marshadow; *Paper Mario*-style flat characters; shadow-puppet theatre (a cultural art form) | The layered pop-up plate construction, punched-hole lit eyes, rod legs and 12 fps stepped motion draw on shadow-puppet tradition rather than any franchise character. No zipper mouth. ⚠ The overall "paper" presentation must stay layered and 3D, not a flat paper world. |
| c26 | Banette; marionette horror tropes generally | A **floating crossbar crown** that belongs to its own body, a clacking jaw plate and pin joints. Theatrical rather than horror. No zipper, no voodoo-doll cues. |
| c27 | Chandelure and Litwick (ghost/fire lamps); Japanese folklore *byōbu-nozoki* (the folding-screen yōkai) | **No lamps or candles.** A folding screen with a cut-out face lit by an ember core. Folklore is public-domain inspiration, and the design does not copy any franchise rendition of it. |
| c28 | Luvdisc; Chinchou; Wishiwashi | A floating air-fry with a fan tail, a crescent dorsal and a light-stripe. Peach and pink palette, with no heart shape and no antenna lures. |
| c29 | Barraskewda (barracuda); Seaking and Goldeen (horned fish) | A **marlin** with a glowing bill (not a forehead horn), a folding sail and air-swimming. Pearl and gold palette. |
| c30 | ⚠ Wailord (blue ball whale); **the Wind Fish** (*Link's Awakening*, flying whale); Lunala/Necrozma (eclipse theme) | A dark indigo **wingless** whale with a **rayed eclipse corona on its forehead**, knobbly glowing flippers and belly grooves that glow gold. Eclipse imagery is astronomical and generic. Constraints: never add wings, never make it white or blue, never add bat-wing or crescent-moon silhouettes. |

---

## 9. Acceptance criteria
1. **Roster:**
   - `creatures.json` (zod-validated) contains exactly 30 species, `c01`–`c30`, with the family, stage, types, H, habitat hints, stats, catch rate, XP, evolution levels, growth curves and traits listed here.
   - It passes reference validation for type ids, zone ids and trait ids.
2. **Builders:**
   - There are 30 separate builder functions, one per species.
   - Every part named in section 4 exists by name. Up to 25% extra detail parts are allowed.
   - A unit test asserts that no two builders produce the same (part-name set, primitive-type multiset) signature.
   - No builder calls another species' builder. Shared primitives, profiles and rig templates are allowed.
3. **Evolution:** for each family, the stage-to-stage part-name sets differ by ≥ 30% (Jaccard distance), and the section 3 motif parts exist on all three stages.
4. **Clips:** every species has `idle`, `move`, `attack`, `attack_special`, `hit`, `capture`, `faint` and `victory`. Every attack has `windup`, `contact` and `recover` markers. Reduced-motion mode meets the caps in 2.5 (checked by unit test on the clip data).
5. **Faces:** every species has the six expression frames (or the cut-out equivalents for f09) generated at all three texture sizes. On a screenshot at battle distance under the Mobile profile, each species' pupils or eyeholes are visible. This is a reviewer check with the screenshot filed as evidence. Not run yet.
6. **Silhouettes:** the section 7.1 script runs in CI and produces sheets and `metrics.json`. No unallow-listed pair reaches 20 px IoU ≥ 0.85, and the colour pass matches the declared pairs within ΔE 15. Separately, a human identification test on the shuffled 20 px sheet should reach ≥ 27/30 correct matches. Not run yet.
7. **Budgets:** a script counts triangles, draw calls and animated nodes per species per profile and meets section 2.6. Frame rate is not part of this criterion.
8. **Stats:** a unit test confirms that each BST equals the sum of its six stats, and that the starter totals are exactly 310/405/525.
9. **Originality:** the character-consistency gate reviews the rendered models against every ⚠ constraint in section 8 and records its result in `design/reviews/character_consistency.md`.
10. **Names:** before the release phase, a trademark-register check covers all 30 names (at minimum the starters and any name used in marketing). Not done yet.

## 10. Dependencies
- **systems.md:** the formulas for catch (0–255), XP yield and growth curves; the status classes that the trait placeholders map to (Numbed, Chilled, Drowsy, Toxified, Burn); weather and attunement ids; the move tag `ground_quake`; the rule for trait assignment. Also move animation refs, which should reference the `attack`/`attack_special` clips and the `fx_*` anchors defined here.
- **world.md:**
  - final encounter tables and time-of-day bands (dawn and night are used here)
  - how the two unchosen starters are obtained
  - whether c30 is a scripted encounter
  - confirmation that every species is obtainable
- **rendering_and_architecture.md:**
  - the rim-light shader chunk and emissive and bloom handling
  - particle system for the `fx_*` anchors
  - per-species battle framing radius, with a display-scale cap for c30 and c12
  - LOD rules
  - `LineSegments` for strings and arcs
  - the High-only point light (c27)
- **creative_direction.md:** character language (eye style consistent with human characters), Resonance field actions by type, cry and voice direction (synthesised cries are parameterised per species by audio).
- **qa_plan.md / release_character_gate.md:** consume the section 9 criteria, the silhouette artifacts and the ⚠ list.

## 11. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Production volume: 30 builders × 8 clips = 240 clips | Schedule | Rig templates (2.5) generate the base motion. Species override only their signature tracks. Build in encounter order (starters and early lines first). |
| f09 flat creatures read as broken or thin from oblique angles | Readability | Plate layering ≥ 0.15 H, a battle yaw clamp of ±50°, strong rim light, and the silhouette check from both views. The fallback is to thicken plates to 0.08 H. |
| The 12 fps stepped animation on f09 could be mistaken for a performance bug | Perception | Limit it to f09. Document it in the encyclopedia. QA notes it as intended. |
| Oversized species (c30 at 5.5 m, c12 canopy, c15 orbit) break battle framing | Layout | Builders export a bounding sphere. The battle camera frames each species per its bounding sphere. c30 may use a battle display scale of 0.75 (a display clamp, not a separate mesh). |
| Transparency sorting artefacts (ice fins, membranes, c23 mantle) | Visual | depthWrite off on thin fins, explicit renderOrder, no transmission. |
| Emissive-heavy designs lose their accents when bloom is off (Mobile) | Readability | Emissive colours are chosen to read unlit. A key must also stand out when rendered unlit. |
| c24 per-frame web rebuild and c26 per-frame strings cost CPU | Perf | 36 vertices and 5 line segments respectively. Update only while the model is visible. |
| Remaining originality risk on the ⚠ items | Legal/brand | Constraints are written as rules. The gate re-checks rendered models. Redesign anatomy if a reviewer can name the source creature from the render. |
| Names may collide in registers that were not searched | Legal | A register check before release. A fallback name is on file for the lowest-confidence case (Umbraleen → Coronaleen). |
| Stat numbers have not been playtested | Balance | Systems may adjust any stat by ±10% as long as starter totals stay within ±5 of target. Record changes here. |
| Floaters and rotors clip into uneven battle-stage terrain | Visual | hoverGap is measured from the flattened stage plane. The faint clip lands on the stage plane. |

## 12. Unresolved questions
1. Should stage-1 wild species be allowed dual types? This document keeps all stage-1s mono-type as the brief implies.
2. Trait assignment: does each individual roll one trait, or does each species have fixed traits? This is Systems' call. The proposal is in 5.1.
3. Is c30 (Umbraleen) a normal rare wild encounter, or a scripted one tied to the story? This is for the World Designer and Creative Director.
4. Should the battle display scale for c30 be capped (0.75) or should the camera pull back? This is for the Rendering Engineer.
5. Should any evolution use a non-level trigger (e.g. a Resonance landmark)? All are level-based here. The Creative Director may tie one line (f06 or f10 suggested) to a landmark, provided it cannot softlock.
6. The status mapping for the placeholder names in 5.1 is still to be settled.
7. Variants (alternate colourings, sexes) are out of scope for v1. The recommendation is none, to protect the silhouette and colour uniqueness table.
8. Legal trademark screening of the final names (section 1 is a web screen only).
9. Voice and cry descriptors per species: should this document supply them, or will the audio section own them fully?
