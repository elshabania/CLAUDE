# Creatures — Art Direction, Build Specs and Species Data

Owner: Creature Art Director · Status: **design v3** (2026-09-24; v3 = DECISIONS D31 flagship redesigns of f01/f02 and the sculpted rendering upgrade) · Binding inputs: `design/MASTER_PROMPT.md`, `design/ANCHORS.md`, `design/DECISIONS.md` (wins over this file where they differ).

This document defines all 30 species (`c01`–`c30`, families `f01`–`f10`): their identity, appearance, faces, animation, procedural build specs, per-species numbers for the Systems Designer, the silhouette-preview procedure and the originality audit. Nothing here has been built, rendered or measured yet. Every "readable at 20 px" statement is a **design target** that the silhouette check (section 7) must verify. None of it has been verified yet.

### v2 change log (review round 1 → DECISIONS.md)
**For builder agents:** section-4 table formats and **part names are unchanged**. Any row that changed in v2 carries **"(v2)"** in its Part or Field cell. A row marked "(v2) REMOVED" must not be built. Rows without a marker are identical to v1.

| # | Change | Where | Source |
|---|---|---|---|
| 1 | Renames: c11 Nodbell → **Lullstalk**, c27 Cinderscrim → **Emberfold**, c30 Umbraleen → **Coronaleen** | everywhere | D7 |
| 2 | Floeguard (c09) redesign: no helmet, whiskers reduced to two short nubs, shell on back and tail-fan only | §4 c09 | D7 |
| 3 | Evolution levels adopted from systems | §5 | D11 |
| 4 | Base-stat band fixes (c12, c20, c21, c30). Catch rate, XP yield and growth are now systems-derived | §5 | D12 |
| 5 | One canonical trait per species | §5.1 | D13 |
| 6 | Palette contrast fixes (13 species) | §4 colour rows | CAD review §1.2 |
| 7 | Scale: c30 → 4.8 m long / H 1.75 m; c19 → H 0.40 m | §0, §4 | CAD review CD-2 |
| 8 | Head resizes (9 species) | §4 part rows | CAD review §7.2 |
| 9 | 8-state face frames; family eye classes; pupil whitelist; brow meshes; mouth atlas | §2.4, §4 face rows | D14, CAD review CD-3 to CD-6 |
| 10 | Clip timing, in-place attacks, capture reaction ≤ 250 ms, event names | §2.5 | D15, CAD review SY-6, QA-2, RA-11 |
| 11 | Material classes, emissive clamp, rim gain, anchors, role aliases, budgets | §2.2, §2.6, §2.7 | D16, CAD review RA-1 to RA-10 |
| 12 | New per-species runtime data: eye class, pupil, roaming temperament, attack style, rimGain, silhouette side yaw | §5.2 | CAD review §7.1 |
| 13 | Cry parameter table | §5.3 | CAD review CD-9 |
| 14 | Silhouette procedure: GC-07 is canonical, with per-species side-view angle | §7.1 | D27 |
| 15 | Habitats: world.md encounter tables are canonical; c28 is a day spawn, not dawn-only | §4 reading guide | CAD review WD-1, WD-4 |

### v3 change log (DECISIONS D31: flagship redesigns + creature rendering upgrade)
| # | Change | Where | Source |
|---|---|---|---|
| 1 | **Rendering upgrade for all 30 species**: sculpted signed-distance bodies with per-pair smooth blending, skinned to the part nodes; procedural surface classes; shell fur; real-geometry eyes with lids; conformed mouth decals | §2.8 | D31 |
| 2 | **f01 line redesign**: c01 becomes the mascot-level electric critter (dormouse × sugar glider); c02 glider-sprinter; c03 majestic storm glider | §0, §3, §4 f01, §7, §8 | D31 |
| 3 | **f02 line redesign**: ram-horned fire dragon line; c06 renamed Magmouflon → **Smoulderam** and retyped **fire · gale** | §0, §1.5, §3, §4 f02, §5, §7, §8 | D31 |
| 4 | f02 learnset: the stage-3 evolution move m048 Quake Stomp (stone) → **m069 Gale Cleaver** (gale, same power and accuracy); systems.md §8.3/§11 rows follow | systems.md | D31 |

Rows that changed in v3 carry **"(v3)"**. The v2 part tables for c01–c06 are withdrawn; the v3 tables in §4 match the builders.

---

## 0. Roster index

H = model height in metres in the neutral idle pose, measured from the lowest point of the model to its highest standard part (VFX excluded). For floaters, H excludes the hover gap. Length or span is given where it exceeds H. Silhouette category codes are defined in section 7.

| id | Name | Fam | Stg | Types | Body plan | H (m) | Len/span (m) | Sil. cat | Dominant colour pair |
|---|---|---|---|---|---|---|---|---|---|
| c01 | Fizzkit | f01 | 1 | electric | (v3) round gliding critter (dormouse × sugar glider) | 0.35 | 0.60 L | QS | silver-lilac / electric blue |
| c02 | Crackleap | f01 | 2 | electric | (v3) upright glider-sprinter biped | 0.90 | 1.20 L | BP | lilac / electric blue |
| c03 | Tempestrel | f01 | 3 | electric · gale | (v3) storm glider on wrist-to-ankle membranes | 1.60 | 2.60 span | WG | storm lilac / electric blue |
| c04 | Wickwool | f02 | 1 | fire | (v3) woolly hatchling drake | 0.45 | 0.75 L | QS | charcoal / ash cream |
| c05 | Kilnhorn | f02 | 2 | fire | (v3) bipedal young drake | 1.00 | 1.40 L | BP | obsidian charcoal / smoulder cream |
| c06 | Smoulderam | f02 | 3 | fire · gale | (v3) winged ram-horned fire dragon | 1.90 | 3.40 L · 4.00 span | QL | obsidian / ember orange |
| c07 | Rippleback | f03 | 1 | water | small quadruped otter | 0.40 | 0.80 L | QS | otter brown / sea teal |
| c08 | Tidesleek | f03 | 2 | water | elongated serpentine swimmer | 0.80 | 2.00 L | SR | slate blue / aqua |
| c09 | Floeguard | f03 | 3 | water · frost | upright armoured biped | 1.60 | 1.10 L | BP | ice white / slate |
| c10 | Dozebud | f04 | 1 | verdant | curled ball (pod-hugger) | 0.35 | 0.40 L | RB | moss green / tan |
| c11 | Lullstalk | f04 | 2 | verdant · toxin | long-armed biped | 1.20 | 0.60 L | BP | moss green / foxglove purple |
| c12 | Belladrowse | f04 | 3 | verdant · toxin | canopy-backed knuckle-walker | 2.20 | 2.00 L | QL | dark green / deep purple |
| c13 | Rollith | f05 | 1 | stone | rolling armoured ball | 0.30 | 0.45 L | RB | warm grey / tan |
| c14 | Cairnback | f05 | 2 | stone | domed quadruped, club tail | 0.90 | 1.60 L | QL | stone grey / lichen ochre |
| c15 | Lodestodon | f05 | 3 | stone · electric | colossal dome, orbiting stones | 1.90 | 2.60 L | QL | iron grey / crystal cyan |
| c16 | Rimelet | f06 | 1 | frost | sidewinding hatchling serpent | 0.25 | 0.60 L | SR | frost white / ice cyan |
| c17 | Sleetribbon | f06 | 2 | frost | sail-finned serpent | 0.70 | 3.00 L | SR | periwinkle / white |
| c18 | Borealoop | f06 | 3 | frost · lumen | floating ring-serpent | 1.80 | 1.60 span | FL | polar navy / aurora green |
| c19 | Gustling | f07 | 1 | gale | round hopping fledgling | **0.40** (v2) | 0.47 L | RB | off-white / sky blue |
| c20 | Whirlseed | f07 | 2 | gale · verdant | samara-winged swift | 0.60 | 1.40 span | WG | blue / seed tan |
| c21 | Samarch | f07 | 3 | gale · verdant | rotor-winged hover raptor | 1.50 | 2.00 rotor | WG | deep green / gold |
| c22 | Ringdrip | f08 | 1 | toxin | six-armed land octopus | 0.30 | 0.50 L | RD | amber / electric blue |
| c23 | Brineloop | f08 | 2 | toxin · water | upright four-leg octopus | 0.90 | 0.70 L | RD | ochre orange / electric blue |
| c24 | Drapetide | f08 | 3 | toxin · water | cloaked tripod octopus | 1.80 | 1.60 span | RD | deep violet / blue |
| c25 | Snipling | f09 | 1 | shade | flat cut-out biped | 0.40 | 0.25 L | FT | ink black / violet |
| c26 | Marionyx | f09 | 2 | shade | suspended marionette | 1.10 | 0.50 L | FL | ink black / ghost cyan |
| c27 | Emberfold | f09 | 3 | shade · fire | folding-screen spectre | 2.00 | 1.10 span | FT | char black / ember orange |
| c28 | Dawnfry | f10 | 1 | lumen | round floating fry | 0.30 | 0.45 L | FL | peach / pink |
| c29 | Lumarlin | f10 | 2 | lumen | air-swimming marlin | 0.80 | 2.00 L | FL | pearl white / periwinkle (v2) |
| c30 | Coronaleen | f10 | 3 | lumen · shade | floating baleen whale | **1.75** (v2) | **4.80 L** (v2) | FL | indigo / corona gold |

**(v3, D31)** c06 changed from fire · stone to **fire · gale** (it flies), so gale is now the secondary type of two families (f01 at c03, f02 at c06) and stone is no longer anyone's secondary; the derangement statement below describes v2 and is kept for history. Every type appears exactly once as a secondary type, except toxin, verdant and water, which each appear on two stages of the same family. The primary→secondary pairs form a derangement: f01 electric→gale, f02 fire→stone, f03 water→frost, f04 verdant→toxin, f05 stone→electric, f06 frost→lumen, f07 gale→verdant, f08 toxin→water, f09 shade→fire, f10 lumen→shade. No two families share a secondary, and no family repeats its primary. The secondary type arrives at different stages to vary the strategy: at stage 2 for f04, f07 and f08, and at stage 3 for all other families.

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

All 30 final names were searched. No creature-collecting-game or major-franchise creature match was found for: Fizzkit, Crackleap, Tempestrel, Wickwool, Kilnhorn, Magmouflon, Tidesleek, Floeguard, Dozebud, Nodbell, Belladrowse, Rollith, Cairnback, Lodestodon, Rimelet, Sleetribbon, Borealoop, Whirlseed, Samarch, Ringdrip, Brineloop, Drapetide, Marionyx, Cinderscrim, Dawnfry, Lumarlin.

Four names had minor, non-creature or niche hits that are accepted as low risk and recorded:

| Name | Hit | Assessment |
|---|---|---|
| Rippleback | Swimsuit style and furniture line | Descriptive product use, no creature use |
| Gustling | "The Gustling Isle", a raid location in *Riders of Icarus* | A place name, not a creature. Low risk |
| Snipling | A US racehorse name and a hatchery lobster's nickname | Not a franchise character. Low risk |
| Umbraleen | A deity name on a small fan wiki (*The Glory Frontier*) | Niche fan work. Low risk. Fallback name: **Coronaleen** |

Naming rules going forward: each name is a two-root English or Latin portmanteau of 12 characters or fewer. A name must not reuse the prefix plus suffix pattern of any known genre creature, and must not use "-mon", "-chu" or "-saur" endings.

### 1.4 v2 renames (DECISIONS D7)
Review round 1 produced originality and name-similarity findings, and the orchestrator ruled three renames:

| Species | v1 name | v2 name |
|---|---|---|
| c11 | Nodbell | **Lullstalk** |
| c27 | Cinderscrim | **Emberfold** |
| c30 | Umbraleen | **Coronaleen** |

The screening in 1.1–1.3 records v1 as searched. The name-similarity scan of the v2 names (release gate GC-13) is owned by the Release agent, and this document does not repeat it. Both 1.3 and the §11 risk row refer to v1 names.

### 1.5 v3 rename (DECISIONS D31)
| Species | v2 name | v3 name | Screening (author's knowledge, not a legal search) |
|---|---|---|---|
| c06 | Magmouflon | **Smoulderam** (smoulder + ram) | Two-root English portmanteau, 10 characters. No known creature, game or brand match. Rejected on the way: *Fumaroar* (the "-roar" ending on a maned fire creature repeats Pyroar's naming formula), *Cindrake* (shares "Cinder" with Cinderace), *Charwyrm* ("Char-" fire-lizard formula), *Blazeram* ("Blaz-" prefix), *Vulcaram* (near Volcarona). Nearest franchise name by the GC-13 metrics is Smoochum (shared "Smo" only, JW < 0.8). The trademark/store check (release gate R-14) still applies. |

Fizzkit, Crackleap, Tempestrel, Wickwool and Kilnhorn keep their names: they still fit the v3 designs (a "kit" is a young small mammal, and the fire line still has wick horns and kiln-hot horns).

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
- **Emissive (v2):** each species gives an idle intensity. **Resting emissive is clamped to ≤ 1.5.** Transient flares through the `emissiveGain` channel are allowed up to **3.0**, for ≤ 250 ms around `impact` only. Wherever section 4 says glow 3.5 or 4, read 3.0. Resting values above 1.5 in section 4 read as 1.5; this covers the c06 underlayer at 1.6, the c18 core at 2.0, the c27 core at 2.5 and the c30 corona at 2.0. Bloom and colour pre-brightening keep them reading as glowing.
- **Rim light (v2):** rendering's shared rim chunk applies. The per-species value in section 4 ("Rim `#hex` s") gives `rimColor` and a gain: `rimGain = s ÷ 0.35`, clamped to 0.6–1.7 and multiplied by rendering's global phase strength (0.25 exploration day / 0.45 night / 0.5 battle). §5.2 lists every rimGain. The purpose is unchanged: to keep dark creatures (f09, c06, c30) legible.
- **Material-class mapping (v2)** onto rendering §4.3. Each creature uses ≤ 4 classes plus the eye and mouth materials. Rendering is asked to add `membrane`, `ice` and `paper`.

| CR preset | Rendering class |
|---|---|
| FUR | `fur` |
| SCALE | `scale` |
| SHELL | `shell` |
| STONE | `skin`, roughness 0.9, with vertex AO |
| METAL | `shell`, metalness 0.6 |
| ICE | `ice` (new) |
| MEMBRANE | `membrane` (new) |
| PAPER | `paper` (new) |
| SKIN_WET | `shell`, Balanced settings |
| GLOW | `glow` |

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
- **(v2) Eye parts and atlas.**
  - The `eye` parts in section 4 keep their names and positions. Rendering's `paddedDisc` (5% bulge) may replace the flattened sphere.
  - Each species has one **8-cell face atlas** (DECISIONS D14), in the order `open, half, closed, happy, hurt, faint, determined, surprised`.
  - Cell size is 256 px on High, 256 px on Balanced and 128 px on Mobile. Mipmaps are on.
  - The right eye is a UV-mirrored copy of the left.
- **(v2) Eye class per family.** Each family uses one Creative Direction eye class, and this **overrides the shape word in each species' Face row**. Iris colour, pupil ratio, highlights and lid values in the Face rows still apply.
- **(v2) Pupil whitelist:** round, vertical ellipse (`v-oval`, 1:2.2), `h-bar`, and `ring`. The `slit` and `w-shape` pupils are withdrawn. The f08 h-bar is pending Creative Direction approval; the fallback is `v-oval`.
- **(v2) Sclera:** every eye has an off-white sclera (`#F7F3EA`) at least as a thin ring. The only exceptions are c06, c15 and c18, whose eyes are emissive iris-only, pending Creative Direction approval; the fallback is a thin sclera ring.
- **Eye generator parameters:**
  - `class` (E1–E5)
  - `sclera` hex
  - `iris` hex (radial gradient to 70% L)
  - `irisRatio`
  - `pupil`, from the whitelist
  - `pupilRatio`
  - `highlights`: 1–3 at 10–11 o'clock, plus a secondary at 4–5 o'clock
  - `lidCoverage` 0–0.6
  - `lidAngle` in degrees: + is inner corner up (sad or worried), − is angry or determined
- **Frame recipes:**

| Frame | Recipe |
|---|---|
| `open` | the base eye |
| `half` | lid at 50%; also used as the sleepy/status idle |
| `closed` | lid fully down |
| `happy` | lower lid up 30%, upward arcs |
| `hurt` | squeezed converging wedges, highlights −50% |
| `faint` | closed downward arcs, never spirals or crosses |
| `determined` | upper lid down 20%, lidAngle −15 |
| `surprised` | open 115%, pupil −20% |

- **(v2) Brows:** every species with a `head` part gets **brow meshes**: capsules, r 0.012–0.02 H and 0.6–0.9 × eye width, floating above each eye and rotating per frame (+8 happy, −15 determined, +20 surprised, +12 hurt). Where a Face row says "brows: painted" or "none", add them as parts named `brow ×2` (v2). Existing geometric brow parts (e.g. c02, c21) already satisfy this rule.
- **(v2) Mouths:** a species with a `jaw` part keeps it. Any other species uses rendering's 4-cell **mouth atlas** (`neutral, open, smile, grimace`) on a small paddedDisc at the old `M` decal position. The `mouth` rows in section 4 keep their names, and the slot `M` now means "mouth atlas". f09 keeps its cut-out mouth slits.

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

- **Durations (v2, D15: this document is the timing authority):**
  - `idle` loops, 2.4–4.0 s
  - `move` loops, 0.5–1.4 s
  - `attack` **0.4–1.3 s**, with events `windup` (optional), **`impact`** (renamed from `contact`; at 40–55% of the clip) and `recover` (optional). Wherever section 4 says "`contact` N%", read `impact` N%.
  - `hit` 0.35–0.5 s
  - `capture` (v2): a species reaction pose of **≤ 250 ms**, followed by the shared absorb owned by the capture system. The total fits systems §7.3. Section 4's capture descriptions give the *pose* to hit in that window. Their longer durations, including "1.0 s" for c06 and "1.2 s" for c30, are withdrawn. Break-out is the same pose played at 2× with a shake.
  - `faint` 1.0–1.6 s, ending in a hold pose
  - `victory` 1.2–1.8 s
- **(v2) Attacks play in place.** The move's `anim` (systems §9.1) owns root travel toward the target and the VFX envelope. The presenter aligns the clip's `impact` with the move's `impactMs`. Travel phrases in section 4 ("leaps 1.2 H", "sprints 2 H", "dives") describe the intended look and help pick the move anim. Species clips must not translate the root beyond ±0.3 H.
- **(v2) Required clips:** the 7 required clips are `idle, move, attack, hit, capture, faint, victory`. `attack_special` and `attackStatus` are optional overrides. When absent, `attack_special` is `attack` with the impact replaced by a VFX spawn at the listed `fx_*` part, and `attackStatus` is rendering's library clip with species amplitude.
- **Reduced motion (v2):**
  - No squash or stretch.
  - Translational amplitudes ×0.5.
  - Spins capped at 180°.
  - No camera shake.
  - Emissive pulses held at their mean value.
  - Durations and event times are unchanged.
- **(v2) Squash and stretch caps:** 15% at stage 1 (20% for `hit` only), 10% at stage 2 and 6% at stage 3. The c19 hit puff and the c23 hit squash in section 4 are clamped to these caps.
- **(v2) f09 stepping:** stepped (12 fps) clips reset their step phase on the triggering event, so the first reaction pose shows on the impact frame.

### 2.6 Budgets (v2: DECISIONS D16 governs)
- **Hard limits (D16):** LOD0 ≤ 12,000 triangles (stage-3 large ≤ 16,000). Draw calls may exceed rendering's v1 target where parts must stay separate for animation. This is a documented deviation, to be measured on reference hardware.
- **Authoring targets** (guidance only):

| Stage | Triangles High / Mobile | Draw calls after merging | Animated nodes |
|---|---|---|---|
| 1 | ≤ 3,500 / 1,800 | ≤ 10 | ≤ 24 |
| 2 | ≤ 5,500 / 2,800 | ≤ 14 | ≤ 36 |
| 3 | ≤ 8,000 / 4,000 | ≤ 18 | ≤ 48 |

- **LOD2:** keep every part tagged `silhouette:true`, merged, with animation reduced to root motion plus at most one orbit or spin. The tagged parts are:
  - c01 fork prongs
  - c03 sail panels
  - c06 horn rings
  - c12 canopy lobes
  - c15 lodestones and boulder
  - c18 plumes and core
  - c21 rotor blades
  - c24 web panels
  - c26 crossbar
  - c27 side panels
  - c29 bill and dorsal sail
  - c30 corona
- None of these budgets has been measured. The only per-frame CPU-rebuilt geometry is c24's three web panels (36 vertices) and c26's strings (drawn as `LineSegments`).

### 2.7 (v2) Contract mapping: anchors and part roles
Section-4 part names are **kept as written**. Builders expose them under the rendering/gate role vocabulary through an alias table, so no part is renamed:

| CR part name(s) | Role |
|---|---|
| torso, body, dome, shell (c13), under-body, forequarters, head base (f08) | `body` |
| head | `head` |
| jaw, lower jaw | `jaw` |
| neck ×n | `neck` |
| eye ×2 | `eye_l`, `eye_r` |
| brow ×2 | `brow_l`, `brow_r` |
| ear ×2 | `ear_*` |
| horn / horn nub / horn ring / horn plate | `horn_*` |
| crest, crest blade, head crest, crown nub, head spine, leaf crown | `crest` |
| tail, tail segments, tail rings | `tail_<n>` |
| leg / foreleg / hind leg / thigh… | `limb_fl/fr/bl/br` (bipeds `limb_l/r`) |
| arm / upper arm / forearm | `limb_arm_l/r` |
| sail, flank flap, wing, wing blade, rotor blade | `wing_*` |
| fin, dorsal, rudder, plume, streamer, pectoral, flukes, tail fan, tail shield | `fin_*` |
| carapace, tail plate, scute, basalt plate | `shell` |
| segment / loop segment / body seg | `segment_<n>` |
| f08 arms | `arm_<n>` |
| f09 plates | `panel_*` |
| anything else | `accessory_*` |

**Anchors.** Required: `mouth, eyeL, eyeR, head, core, hitCenter, overhead, captureTarget, feet`. Optional: `hornTip`, `tailTip`. The `fx_*` parts in section 4 are extra anchors. Species without a separate head use their face-bearing part as `head`:
- c23: body base
- c25: head front plate
- c27: centre panel
- c28: body
- c29 and c30: body seg 1

---

### 2.8 (v3) Sculpted bodies, surfaces and eyes (DECISIONS D31)
The builder contract (part tables ×H, part names, anim tags, anchors) is unchanged; what changed is how parts become pixels.
- **Sculpted bodies** (`src/creatures/sdf.ts`, `assemble.ts`). Every organic part (sphere, capsule, cone ≤ 2.2:1, cylinder, lathe, chain segment) of a material group (FUR, SCALE, FEATHER, SKIN, SKIN_WET, STONE, SHELL) becomes one signed-distance field. Each part is smooth-min blended **with its parent part only** (fillet radius 0.55 × the thinner part, or the part's `blend` value ×H), so necks, limbs and tails grow out of the body while unrelated neighbours (two legs, fleece tufts) keep a crisp crease. The field is meshed with surface nets on a narrow band of bricks, vertices are projected onto the iso-surface and normals come from the field gradient. Colours, cavity AO, fur length and glow masks are baked per vertex from per-part distances. Fluffy parts get a noise displacement.
- **Skinning.** The sculpted mesh is a `SkinnedMesh` whose bones are the part nodes themselves, with up to 4 smooth weights per vertex derived from the part distances. The procedural animator is unchanged: breathing, gait, look, wave and jaw now bend continuous skin.
- **Accessories** stay crisp separate meshes: horns and tubes, extrudes (sails, wings, fins, membranes), toruses, emissive parts, translucent parts, sharp cones, `D`-slot claws/hooves/nostrils, `lod`-tagged details, boxes (unless `blend` is set) and parts thinner than 1.25 grid cells at that LOD. New part fields: `blend` (false = accessory, number = fillet ×H), `blendWith`, `fissure` (molten glow weight), `fur` (shell length multiplier) and `mirrorGeom` (true mirroring of asymmetric shapes on the _R side).
- **Budgets and caching.** Grid resolution by quality (high 66, balanced 54, mobile 36 cells on the characteristic extent) × LOD (1, 0.62, 0.4). A cheap coarse pass predicts the triangle count and backs the cell size off to the cap (sculpted body ≤ 12.5k high / 8.5k balanced / 4.2k mobile triangles at LOD0; LOD1 × 0.42, LOD2 × 0.18). Meshes are cached per species/LOD/quality; `prewarmCreatures()` meshes species during idle time.
- **Surfaces** (`materials.ts`). Per-class procedural detail as derivative bump + cavity darkening in bind space (it sticks to the skin while animating): fur strands, scales (cells), feathers (elongated cells), skin pores, stone, shell growth rings, ice facets and membrane veins; wrap lighting with a warm subsurface tint; fresnel translucency for ICE/CRYSTAL; the existing rim light. `fissure` parts get an emissive crack network (scales/stone) or ember glints (fur). Shell fur (5 layers of tapered strands on a coarser shell mesh) on High LOD0 only, restricted to parts with fur ≥ 0.55 (fluffy parts). Mobile drops detail and wrap lighting.
- **Eyes** (`eyes.ts`). Real eyeballs set into the sculpted head (ray-marched onto the surface), with a painted sclera, gradient iris with fibres and limbal ring, pupil per the whitelist, painted catch-lights and a clearcoat cornea on High; skin-coloured upper and lower **eyelid shells** with a lash line. The 8 D14 states are lid poses (upper/lower coverage, inner-corner tilt, iris scale): `half`, `closed` and `faint` close the lids, `happy` pushes the lower lid up into a smile, `hurt` squeezes with the inner corners raised, `determined` lowers and angles the upper lid, `surprised` opens fully and shrinks the iris. Lids ease between poses, so blinks are smooth. The f09 cut-out species (`hole` eyes) keep the canvas atlas. Mouths remain 4-state atlas decals, now conformed to the sculpted surface; jaws still open on attacks.

## 3. Family overviews (motif, evolution arc)

A **motif** is the element that appears on all three stages and must stay visible at 20 px on at least two of them.

| Fam | Line | Motif (kept across stages) | Anatomy arc | Behaviour arc |
|---|---|---|---|---|
| f01 (v3) | Fizzkit → Crackleap → Tempestrel | **Oversized satin ears whose rims crackle with static**, glowing blue **capacitor freckles** on the cheeks, furry **wrist-to-ankle gliding membranes** and a **coiled spring tail ending in a glowing bulb** | round fluffy glider critter → upright glider-sprinter on long digitigrade legs → majestic storm glider riding wide membranes | curious bouncer → show-off sprinter → aloof storm-rider that hovers |
| f02 (v3) | Wickwool → Kilnhorn → **Smoulderam** (formerly Magmouflon) | **Ram horns with burning wick tips**, an **ash-cream fleece mane** with ember glints, charcoal/obsidian scales and a **basalt tail knob that grows into a club** | woolly hatchling drake with horn nubs and stubby wings → bipedal young drake with full-curl ridged horns and a smouldering ruff → majestic winged dragon with great spiral horns, molten throat fissures and a basalt tail club | bouncy head-butter → proud rearing brawler → calm, immovable hearth-guardian that takes to the sky |
| f03 | Rippleback → Tidesleek → Floeguard | **Shingled shell plates** (overlapping scallops) and a white muzzle with whisker pads | otter pup with a plated tail → 8-segment serpentine swimmer with dorsal scutes and a rudder → upright biped with a back carapace (v2: no chest shell or helmet) and a fan-shell tail used as a shield | playful tool-user (pebble) → sly speed-swimmer → stoic shield-bearer |
| f04 | Dozebud → Lullstalk → Belladrowse | **Moss mantle, hanging bell-flowers, dark eye-mask** stripes on sleepy half-lidded eyes | ball curled around a seed pod → lanky biped with arms to its ankles → quadruped knuckle-walker carrying a canopy tree hung with bells | clingy sleeper → languid ambusher that "nods off" → serene sentinel sheltering others |
| f05 | Rollith → Cairnback → Lodestodon | **Hex-plate dome carapace** and a pale snout shield | rolling ball → low glyptodont-like quadruped with a stacked-stone club tail → colossus with geode crystal ridges and orbiting lodestones in place of the club | startled roller → grumpy tail-swinger → solemn magnetic controller |
| f06 | Rimelet → Sleetribbon → Borealoop | **Translucent ice crest fins** and a **six-armed flake** tail or core | sidewinding hatchling → long limbless serpent with a sail-fin row → floating closed ring-coil with aurora plumes, a flake core and small forelimbs | shy cold-clinger → vain graceful hunter → dreamlike night guide |
| f07 | Gustling → Whirlseed → Samarch | **Samara (maple-seed) wings** with a nut at the root, twin tail streamers, cheek swirl marks | round fledgling with stub seed-wings → slender swift with long blade wings → upright raptor whose wings became a two-blade rotor over its back | bubbly hopper → prankish autorotating diver → proud hovering hunter |
| f08 | Ringdrip → Brineloop → Drapetide | **Glowing blue ring spots** that flash when threatened, and **six arms** (never eight) | radial crawler → upright on 4 leg-arms with 2 lasso arms and a translucent brine-filled mantle → tall tripod with 3 raised arms joined by a cloak web | nervous flasher → cocky trickster → regal intimidator |
| f09 | Snipling → Marionyx → Emberfold | **Flat layered cut-out plates**, punched eye-holes lit from behind, **12 fps stepped motion** | hopping paper cut-out → floating marionette hung from its own crossbar crown → three-panel folding screen backlit by an ember core | mischievous mimic → theatrical show-off → dramatic avenger that projects shadow illusions |
| f10 | Dawnfry → Lumarlin → Coronaleen | **Lateral light-stripe** (emissive band or spots), crescent dorsal fin, pale belly | round fry → marlin with a light-bill and sail fin → vast baleen whale with an eclipse corona crown | cheerful light-chaser → disciplined duellist → ancient eclipse-bringer |

Evolution rule check: every stage change alters body plan, locomotion type or limb count as well as scale and palette (see the section 0 body-plan column). No stage is a recolour or uniform rescale of a sibling builder, and each builder is separate code.

## 4. Species records and build specs

Reading guide:
- **Habitat** gives the lore home first, then the *suggested* encounter zones for the World Designer, who owns the final encounter tables.
- Starters (c01, c04, c07) are never wild at stage 1. How players obtain the two unchosen starters is defined in `world.md` and DECISIONS D5.
- **(v2)** The **encounter tables in `world.md` are canonical** for zones, levels and time bands. The "Suggested" zones below are superseded, and the lore text is flavour only. There are two bands, day and night; there are no dawn-only spawns. One zone request is still open with the World Designer: moving c24 from the volcano to the lake at night.
- **(v2)** Clip text reads under the §2.5 v2 rules: attacks play in place, `impact` replaces `contact`, capture is a ≤ 250 ms pose, and emissive values are clamped.
- Build-spec numbers are multiples of H (section 2.1). "Anim" names the clip channels that drive a part: `br` breathing, `gait` locomotion, `look` head aim, `wave` chain wave, `flap`, `blink` eye frames, `glow` emissiveGain, `jaw`, `fx` VFX emitter anchor. `—` means the part is static and gets merged.

### f01 — Fizzkit line (electric) — v3 flagship redesign (DECISIONS D31)

**(v3)** The whole line was redesigned so that c01 can carry the game's mascot role. The v2 rows (teal rib-sail lizard, fork tail) are withdrawn. Builders: `src/creatures/species/c01.ts`–`c03.ts` with helpers in `species/_kit.ts`. All dimensions are ×H as before; bodies are sculpted (§2.8 v3), so primitive overlaps now read as one skin.

#### c01 · Fizzkit
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 1 · electric |
| Body plan · rig | (v3) small round gliding critter, a dormouse × sugar-glider hybrid · RIG_QUAD (hopping) |
| H / length | 0.35 m (ear tips) / 0.60 m (incl. coiled tail) |
| Habitat | Lore: sun-warmed canopy edges of `route_2` and `forest`, gliding between branches at dusk. Starter, not wild. |
| Personality | Curious, cuddly and a little mischievous. Puffs up its fur when happy, and its ear rims crackle when it is excited. |
| Distinctive anatomy | (v3) Round fleecy body with a head as big as the body. **Oversized round satin ears** (pink-lilac satin inside) whose **rims crackle with static** (electric-blue glow). **Capacitor freckles**: three glowing blue dots in a triangle on each cheek (dots, never solid circles). Soft furry **gliding membranes** from wrist to ankle, folded along the flanks. A **springy coiled tail** ending in a little **glowing glass bulb** with a silver cap. Cream bib, muzzle and paws. |
| Dominant colours (v3) | P `#C8BCDB` silver-lilac · A `#3CB6FF` electric blue · W `#F6EFE4` warm cream |
| Materials | (v3) Sculpted `FUR` body with shell fur on the fluffy parts (tuft, bib, haunches); satin ear lining `SKIN`; ear rims, freckles and tail bulb `GLOW` A (1.3–1.5); nose `SKIN_WET` D. Rim `#BDE6FF` 0.4. |
| Face | (v3) Real-geometry eyes (§2.4 v3): big **round** eyes, sclera `#FBF8F2`, iris sapphire `#2E5BD6` (irisRatio 0.78), round pupil 0.5, 3 highlights, lids resting just over the iris top, lidAngle +6 (friendly). Tiny plum nose and a smile mouth on the cream muzzle. |

| Clip | Motion |
|---|---|
| idle | Breathing (0.9 Hz), ears sway with lag, the ear rims and freckles flicker, the tail coil bobs like a spring. |
| move (bounce) | Bouncy hop-trot at 3.2 Hz; the membranes flutter. |
| attack | Crouch, spring forward (lunge) with the ears flat; `impact` at 45% crackles from the tail bulb (`fx_tail`). |
| attack_special | Plants its paws, puffs its fur, the ear rims and freckles spike, and a spark is released from the bulb. |
| hit | Squashes, ears pin back, eyes `hurt`. |
| capture (v2) | ≤ 250 ms startle: ears up, eyes `surprised`. |
| faint | Rolls onto its side, ears flop, glow fades, eyes `faint`. |
| victory | Two happy hops, eyes `happy`, rims crackle. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body | sphere (0.27,0.24,0.30), fluffy | root @ (0,0.31,−0.02) | P | br |
| chest / belly | sphere (0.19,0.18,0.15) / (0.20,0.13,0.22) | body | W | — |
| head | sphere (0.30,0.27,0.27), blend 0.07 | body @ (0,0.28,0.17) | P | look |
| tuft / cheek ×2 / muzzle | sphere 0.075 / (0.12,0.10,0.10) / (0.10,0.075,0.085) | head | P+ / W / W | — |
| eye ×2 | 3D eye r0.105 | head @ (±0.125,0.03,0.20) · yaw ±24 | E | blink, lids |
| freckle ×3 per cheek | flattened sphere r0.027 on the cheek surface | cheek | A glow 1.5 | glow |
| ear ×2 (+ satin lining + rim) | sphere (0.15,0.20,0.045); rim = torus arc 200° | head @ (±0.18,0.20,−0.07) · (−8,∓18,∓26) | P, lining `#EBCFE3`, rim A | sway, glow |
| leg / paw ×4 | capsule r0.06 / sphere (0.065,0.045,0.08); hind haunch sphere (0.11,0.13,0.14) | body | P, paws W | gait |
| patagium ×2 | extrude `X_patagium` 0.30 × 0.15, depth 0.014 | body flank @ (±0.245,−0.03,0.13) | P− | flap |
| tail | chain 9 × r0.05→0.03, total 0.80, bend (−36,0,16) = coil | body @ (0,0.02,−0.27) · pitch −55 | P | wave |
| bulb + cap | sphere r0.072 + cylinder r0.036 | tailTip | A glow 1.4 / `#ECE8F4` | glow, fx_tail |

#### c02 · Crackleap
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 2 · electric (evolves from c01 at Lv 16) |
| Body plan · rig | (v3) upright, forward-leaning glider-sprinter on long digitigrade legs · RIG_BIPED |
| H / length | 0.90 m / 1.20 m (incl. tail) |
| Habitat | Lore: open ridgelines of `route_2` and `route_4`, sprinting and gliding off the crests. Not wild in the main game. |
| Personality | Show-off sprinter: restless, competitive, poses after every win. |
| Distinctive anatomy | (v3) Long swept-back **satin ears** with crackling rims; cream neck ruff and bib; **freckles** on the cheeks and two on each forearm; furry **membranes from the arms to the hips**; long digitigrade legs; a longer **coiled tail** with the glowing bulb. |
| Dominant colours (v3) | P `#B4A6CE` lilac · A `#34A8FF` electric blue · W `#F2E8D8` cream |
| Materials | (v3) Sculpted `FUR`; membranes `FUR` S `#8E80B8`; rims, freckles, bulb `GLOW` A. Rim `#B8E4FF` 0.4. |
| Face | (v3) 3D **almond** eyes, iris `#2E5BD6`, round pupil 0.44, 2 highlights, lid 0.1, lidAngle −2. Smile mouth on a cream muzzle. |

| Clip | Motion |
|---|---|
| idle | Bounces on its toes; ears sway; rims flicker. |
| move | Long-stride sprint with arm swing; membranes flutter. |
| attack | Spin attack (in place, v2 rule) with arms spread; `impact` 50%. |
| attack_special | Crosses its arms, flings them open; a bolt leaves the tail bulb. |
| hit / capture / faint / victory | Stumbles back / ≤ 250 ms startle / falls forward / arms up, rims flash. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pelvis / torso | sphere (0.12,0.11,0.12) / (0.13,0.19,0.12) | root @ (0,0.40,−0.02) / pelvis @ (0,0.16,0.02) · pitch 16 | P | br |
| bib / ruff | sphere (0.10,0.14,0.07) / (0.15,0.075,0.13) fluffy | torso | W | — |
| head | sphere (0.15,0.135,0.145), blend 0.04 | torso @ (0,0.27,0.05) | P | look |
| eye ×2 | 3D eye r0.052 | head @ (±0.068,0.02,0.115) | E | lids |
| ear ×2 | sphere (0.072,0.17,0.022) + lining + rim arc 230° | head @ (±0.078,0.12,−0.05) · (−38,∓12,∓18) | P / A | sway |
| arms | capsule r0.032 → r0.028, hand sphere | torso @ (±0.12,0.10,0.05) | P, hands W | armswing |
| patagium ×2 | extrude `X_patagium` 0.26 × 0.14 | torso side | S | flap |
| legs | thigh sphere → shin capsule (pitch 215) → metatarsal (−50) → foot | pelvis | P, feet W | gait, knee |
| tail + bulb | chain 11 × r0.042→0.024, total 0.85, coil bend (−30,0,12); bulb r0.058 | pelvis @ (0,0.02,−0.10) | P / A | wave, glow |

#### c03 · Tempestrel
| Field | Value |
|---|---|
| Family / stage / types | f01 · stage 3 · electric / gale (from c02 at Lv 34) |
| Body plan · rig | (v3) majestic storm glider: colugo-like body riding wide membranes stretched from wrists to ankles · RIG_WING, hoverGap 0.3 H |
| H / span / length | 1.60 m / 2.60 m / 2.40 m (incl. tail) |
| Habitat | Lore: storm fronts over `snowpeak` and `route_5`. Not wild in the main game. |
| Personality | Aloof and patient. Rides storms, and fiercely protects younger members of its line. |
| Distinctive anatomy | (v3) A cream **storm-cloud mane**; long swept **satin ears** with crackling rims; a line of glowing **freckles** along each cheek; storm-lilac **membranes** with glowing blue edge seams and veins, held by long slender limbs; a long tail ending in a **crackling orb**. |
| Dominant colours (v3) | P `#7B70AF` storm lilac · A `#3BB8FF` electric blue · S `#3A3470` storm indigo membrane |
| Materials | (v3) Sculpted `FUR`; membranes `MEMBRANE` S with emissive A 0.07; seams, veins, freckles, rims and orb `GLOW` A. Rim `#A6E6FF` 0.45. |
| Face | (v3) 3D **long-almond** eyes, iris `#2F6BE0`, round pupil 0.38, lid 0.2 (calm, regal), lidAngle −4. Closed line mouth. |

| Clip | Motion |
|---|---|
| idle | Hovers, bobbing; membranes breathe slowly (flap 10° at 0.5 Hz); the tail S-waves; the orb flickers. |
| attack | Rises, dives (`dive` style) and releases a ring of lightning at `impact` 50%. |
| attack_special | Holds position with membranes raised; arcs run along the veins into the orb. |
| hit / capture / faint / victory | Rolls toward the hit / wraps its membranes forward / sinks and settles / a slow loop with all seams flashing. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body / chest / belly | sphere (0.17,0.14,0.34) / (0.12,0.10,0.14) / (0.11,0.07,0.24) | root @ (0,0.42,0) | P / W | br |
| mane ×4 | fluffy spheres up to (0.21,0.15,0.15) | body front-top | W | — |
| neck / head | capsule r0.08 / sphere (0.105,0.095,0.12) ×1.3 | body @ (0,0.06,0.30) · pitch 55 | P | look |
| eye ×2 | 3D eye r0.038 | head | E | lids |
| ear ×2 | sphere (0.048,0.19,0.014) + rim arc 250° | head · (−62,∓8,∓14) | P / A | sway |
| glide ×2 | extrude `X_glide` 0.70 × 0.85, horizontal, dihedral 16° | body side | S, seam A | flap |
| limbs | capsule chains along the membrane leading/trailing edges | inside the flap node | P, hands/feet W | flap |
| tail + orb | chain 12 × r0.05→0.02, total 1.0; orb r0.07 + 2 spark cones | body @ (0,0,−0.32) | P / A | wave, glow |

### f02 — Wickwool line (fire) — v3 flagship redesign (DECISIONS D31)

**(v3)** The line becomes a **ram-horned fire dragon** line and keeps its ram-horn + wick-flame motif. The v2 lamb/ram/basalt-bison rows are withdrawn. c06 is renamed **Smoulderam** (smoulder + ram) and becomes **fire / gale**. Builders: `c04.ts`–`c06.ts` with `species/_kit.ts` (`wickHorn`, `hornSpiral`, `dragonWing`).

#### c04 · Wickwool
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 1 · fire |
| Body plan · rig | (v3) woolly hatchling drake · RIG_QUAD (hopping) |
| H / length | 0.45 m / 0.75 m |
| Habitat | Lore: warm pastures on the lower slopes of `volcano`, napping in the fleece of the herd. Starter, not wild. |
| Personality | Earnest and braver than its size. Head-butts new things to "test" them, and its wick flames flare when it is proud. |
| Distinctive anatomy | (v3) Chubby charcoal hatchling with a big head, a **fleecy ash-cream ember mane** over the neck, shoulders and crown (embers glint between the curls), **¾-curl horn nubs whose tips burn like candle wicks**, big amber eyes, **stubby ember-lit wings**, cream claws, and a short tail ending in a little **basalt knob** with glowing cracks. No tail flame. |
| Dominant colours (v3) | P `#3A3035` charcoal · S `#EADFCD` ash cream · A `#FF6A1A` ember |
| Materials | (v3) Sculpted `SCALE` body, belly plates W `#6A5049`; fleece `FUR` with ember-glint glow mask; horns `SHELL` `#D9C7A8` → glowing tip; wick flames `GLOW`; tail knob sculpted `STONE` with molten cracks. Rim `#FFC890` 0.35. |
| Face | (v3) Big **round** 3D eyes, iris amber `#F2A516`, round pupil 0.5, 3 highlights, lidAngle +8 (earnest). Smile mouth on a rounded snout; two nostrils (`fx_nostrils`). |

| Clip | Motion |
|---|---|
| idle | Breathing; wick flames sway; wings flutter now and then. |
| move | Bouncy hop-trot; wings flutter at 2.2 Hz. |
| attack | Lowers its head and head-butts (lunge); `impact` 45%; horn tips flare (glow gain). |
| attack_special | Plants its feet, shakes its head; the wick flames grow and flick an ember from `fx_horns`. |
| hit / capture / faint / victory | Fleece squashes / ≤ 250 ms startle / curls on its side, flames shrink / hops, eyes `happy`. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body / belly | sphere (0.25,0.21,0.30) / (0.19,0.15,0.24) | root @ (0,0.38,−0.02) | P / W | br |
| neck / head / snout | capsule r0.10 / sphere (0.21,0.19,0.20) / sphere (0.12,0.085,0.11) | body @ (0,0.10,0.22) | P | look |
| eye ×2 | 3D eye r0.085 | head @ (±0.105,0.035,0.14) | E | lids |
| horn ×2 + wick flame | tube ¾ curl r0.04→0.028, tip glowing, flame sphere + cone | head @ (±0.085,0.13,−0.01) | `#D9C7A8` → A | glow, fx_horns |
| fleece mane ×5 | fluffy `FUR` spheres (0.20,0.14,0.17) … (0.13,0.09,0.12) | body front-top, head crown | S, glint glow 0.3–0.45 | — |
| wing ×2 | `dragonWing` 0.40 × 0.30 (bone arm, 4 fingers, membrane `#4A2218` + glowing veins) | body @ (±0.13,0.15,−0.02) | P / A | flap |
| legs ×4 | capsule r0.07 / r0.06 → paw sphere + 3 cream claws | body | P | gait |
| tail + knob | chain 5 × r0.08→0.045, total 0.36; knob sphere (0.06,0.055,0.065) sculpted `STONE` | body @ (0,0.03,−0.27) | P / `#3C3538` | wave |

#### c05 · Kilnhorn
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 2 · fire (from c04 at Lv 16) |
| Body plan · rig | (v3) bipedal young drake, upright and forward-leaning · RIG_BIPED |
| H / length | 1.00 m / 1.40 m (incl. tail) |
| Habitat | Lore: basalt ledges of `volcano` and `route_4`. Not wild in the main game. |
| Personality | Proud and stubborn. Challenges rivals but is fiercely loyal. |
| Distinctive anatomy | (v3) Charcoal scales with warm ash belly plates and glowing seams on the chest and jaw; **horns that curl a full turn**, ridged, with **burning wick tips**; a **smouldering fleece ruff** over the shoulders (ember glints); small ember-lit wings; strong digitigrade legs; a thick tail starting to grow its **basalt club**. |
| Dominant colours (v3) | P `#33292E` obsidian charcoal · S `#CDBFAE` smoulder cream · A `#FF6A1A` ember |
| Materials | (v3) Sculpted `SCALE` with a molten-fissure glow mask (belly 0.25, jaw 0.6); ruff `FUR` with ember glints; horns `SHELL` with ridges; club sculpted `STONE`. Rim `#FFB070` 0.35. |
| Face | (v3) 3D **almond** eyes, iris `#FFB02E`, round pupil 0.38, lid 0.14, lidAngle −8 (confident). Snout and hinged `jaw`; fang mouth. |

| Clip | Motion |
|---|---|
| idle | Breathing; ruff embers glint; wings twitch; tail sways. |
| move | Striding run with arm swing. |
| attack | Rears (`rear` style) and crashes into a horn butt; `impact` 55%. |
| attack_special | Rears and snorts flame from `fx_nostrils`, sweeping its head. |
| hit / capture / faint / victory | Head jerks aside / ≤ 250 ms roar / collapses sideways, horn glow dims / leaps and holds a proud pose. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| pelvis / torso / belly | sphere (0.15,0.14,0.14) / (0.17,0.23,0.15) / (0.12,0.20,0.08) | root @ (0,0.42,−0.04) | P / W | br |
| ruff ×4 | fluffy `FUR` spheres | torso shoulders | S, glints 0.6–0.7 | — |
| head / snout / jaw | sphere (0.12,0.11,0.13) / capsule r0.07 / capsule r0.05 | neck | P / W | look, jaw |
| eye ×2 | 3D eye r0.045 | head | E | lids |
| horn ×2 | spiral 1.05 turns r0.036→0.017, 9 ridges, wick tip | head @ (±0.07,0.085,−0.04) | `#D6C3A2` → A | glow, fx_horns |
| wing ×2 | `dragonWing` 0.50 × 0.36 | torso back | P / A | flap |
| arms / legs | capsules; digitigrade legs (shin pitch 215, metatarsal −50) | torso / pelvis | P | armswing, gait, knee |
| tail + club | chain 7 × r0.085→0.035, total 0.72; club sphere + 2 knobs, `STONE` | pelvis | P / `#3A3236` | wave |

#### c06 · Smoulderam
| Field | Value |
|---|---|
| Family / stage / types | f02 · stage 3 · **fire / gale** (v3; from c05 at Lv 34) |
| Body plan · rig | (v3) majestic winged fire dragon, four-legged with a raised chest and a long neck · RIG_QUAD (heavy walk), wings flap |
| H / length / span | 1.90 m / 3.40 m (incl. tail) / ≈ 4.0 m wingspan |
| Habitat | Lore: the `volcano` caldera rim, riding the updrafts above it. Not wild in the main game. |
| Personality | A calm, immovable hearth-guardian. Slow to anger; when roused it takes to the sky on smoke-hot updrafts. |
| Distinctive anatomy | (v3) Obsidian-charcoal scales; **great spiral ram horns** (1.1 turns, ridged) with **burning wick tips**; a **smoke-and-ember fleece mane** over the neck, shoulders and the back of the head; **molten fissures** glowing along the throat, chest plates and jaw; **wide wings** with ember-lit membranes and glowing veins; powerful legs with cream claws; dorsal spines; a long tail ending in a **basalt club** with glowing cracks (**no tail flame**). |
| Dominant colours (v3) | P `#2B2428` obsidian · A `#FF6A1A` ember · S `#C4B9AB` ash cream |
| Materials | (v3) Sculpted `SCALE` with a molten-fissure glow mask (throat and jaw 1.0, belly 0.45; `fissureGlow` 1.6); mane `FUR` with ember glints; horns `SHELL` `#D5C3A3` with ridges; wings `MEMBRANE` `#2E1410` with emissive A 0.14 and `GLOW` veins; club sculpted `STONE` `#35302F` with cracks. Rim `#FF9A5A` 0.35. |
| Face | (v3) 3D **almond** eyes with a dark sclera `#3A2620` and a glowing gold iris `#FFB23E` (glow `#FF9A3A`), v-oval pupil 0.42, lid 0.22, lidAngle −12 (stern). Sculpted brow ridges; long snout with a hinged glowing `jaw`; smoking nostrils (`fx_nostrils`). No mouth decal. |

| Clip | Motion |
|---|---|
| idle | Slow deep breathing; wings half-spread and breathing (flap 12° at 0.45 Hz); fissures pulse; the head turns slowly. |
| move | Heavy walk at 0.9 Hz. |
| attack | Rears (`rear`) and slams down, then drives forward with the horns; `impact` 40%. |
| attack_special | Lowers its head; the fissures and wick flames flare (glow gain) and a heat-and-wind blast leaves `fx_mouth`. |
| hit | Barely moves: head recoils, fissures flash. |
| capture (v2) | ≤ 250 ms: wings flare, roar (jaw). |
| faint | Kneels, slumps onto its side; the fissures dim to black. |
| victory | Rears, wings spread wide, horns flare. |

| Part (v3) | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| chest / barrel / hips | sphere (0.21,0.25,0.25) / (0.19,0.19,0.30) / (0.16,0.17,0.18) | root @ (0,0.64,0.28) / (0,0.60,−0.05) / (0,0.59,−0.38) | P | br |
| throat plate / belly plate | sphere (0.14,0.18,0.12) / (0.14,0.12,0.33) | chest / barrel | W, fissure 1.0 / 0.45 | glow |
| neck + throat | chain 4 × r0.115→0.085, total 0.44, bend −7; throat capsule r0.075 | chest @ (0,0.12,0.14) · pitch 28 | P / W fissure 1.0 | — |
| head / snout / jaw | sphere (0.10,0.095,0.13) / capsule r0.07 len0.14 / capsule r0.055 len0.13 | neckTip | P / P / W fissure 1.0 | look, jaw |
| brow ×2 | capsule r0.03, blend 0.018 (sculpted) | head | P | — |
| eye ×2 | 3D eye r0.036 | head @ (±0.066,0.03,0.095) · yaw ±34 | E | lids |
| horn ×2 | spiral 1.12 turns, radius 0.13→0.06, tube r0.056→0.018, 13 ridges, wick flame | head @ (±0.075,0.07,−0.05) | `#D5C3A3` → A | glow, fx_horns |
| mane ×9 | fluffy `FUR` spheres along the neck, shoulders and head | chest / neck / head / barrel | S / S− glints 0.4–0.55 | — |
| wing ×2 | `dragonWing` 1.05 × 0.70 (arm, thumb claw, 4 fingers, membrane, 4 glowing veins) | chest @ (±0.15,0.19,−0.04) · (0,±26,±40) | P / `#2E1410` / A | flap |
| legs ×4 | shoulder / thigh spheres; forearm capsule r0.075 len0.28; shin r0.075 len0.17 → metatarsal → foot; 3 cream claws each | chest / hips | P / `#E4D6BE` | gait |
| dorsal spines | cones on the back and tail (LOD ≤ 1 on the tail) | barrel / hips / tail | `#1B1518` | — |
| tail | chain 10 × r0.10→0.045, total 1.15, bend −3 | hips @ (0,0.02,−0.15) · pitch −100 | P | wave |
| club | sphere (0.13,0.17,0.11) + 3 knobs, sculpted `STONE`, fissure 0.85 | tailTip | `#35302F` | — |

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
| Face (v2) | Glossy **round** eyes (E1) with a thin off-white sclera ring, iris `#1B1B1B`, pupil 0.8, 2 highlights. Brows: small raised painted arcs. Mouth: wide painted smile with whisker dots (M). Round nose `D`. |

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
| Distinctive anatomy (v2) | The shingle plates have fused into a **back carapace only** (no chest shell and no shoulder shells), with a ridge of frost crystals along its spine. The chest is bare pale fur. **No helmet**: the head is a bare otter head with brow meshes. The whiskers are reduced to **two short nubs**. **The tail is a broad scalloped fan-shell used as a shield**: rested on the ground in idle, swung forward to block. Thick webbed forepaws. **It never holds a shell in its hand as a blade** (see audit). |
| Dominant colours | S `#CFE9F5` ice-white carapace · P `#3E4E63` slate fur · A `#1FA6C9` cyan seams |
| Materials | Fur `FUR` r 0.75. Carapace `SHELL` r 0.2, clearcoat 1.0. Frost crystals `ICE` opacity 0.88, emissive A 0.3. Seams emissive A 0.4. Rim `#E8FBFF` 0.5. |
| Face (v2) | Family class E1 (round) with a calm lidCoverage of 0.3. Iris `#1F5FA6`, round pupil 0.35, 1 highlight. Brows: `brow ×2` meshes (there is no helmet ridge). Mouth: `jaw` plus the mouth atlas. Two short frost-tinted whisker nubs. |

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
| carapace front (v2) REMOVED | — (the shell is on the back and tail-fan only) | — | — | — |
| chest (v2) | sphere (0.20,0.24,0.10) | torso @ (0,0.22,0.14) | P+ | br |
| carapace back | half-lathe L_dome rmax0.27 h0.14, facing −Z | torso @ (0,0.25,−0.14) | S | br |
| seam band (v2) | torus R0.25 r0.012, **arc 180°**, along the back-carapace rim only | torso | A | glow |
| pauldron ×2 (v2) REMOVED | — (no shoulder shell) | — | — | — |
| frost crystal ×6 (v2) | cone r0.02–0.035 h0.06–0.10, in a row along the spine | carapace back, top ridge | S (ICE) | glow |
| head (v2) | sphere (0.16,**0.14**,0.16) | torso @ (0,0.52,0.03) | P | look |
| helmet cap (v2) REMOVED | — (no helmet) | — | — | — |
| brow ×2 (v2) | capsule r0.015 len0.06 | head @ (±0.07,0.08,0.12) | P− | expression |
| muzzle | sphere (0.09,0.07,0.08) | head @ (0,−0.05,0.12) | P+ | — |
| jaw | half-sphere (0.08,0.03,0.07) | muzzle bottom | P+ | jaw |
| nose | sphere r0.03 | muzzle front | D | — |
| whisker ×6 (v2) REMOVED → whisker nub ×2 (v2) | cone r0.012 h0.04, pointing outward | muzzle sides @ (±0.07,0,0.04) | A (tint) | — |
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
| Dominant colours (v2) | P `#6E9444` moss green · S `#E3D2AC` tan face · D `#8A5A3B` pod brown |
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

#### c11 · Lullstalk
| Field | Value |
|---|---|
| Family / stage / types | f04 · stage 2 · verdant / toxin (from c10 at Lv 16, v2) |
| Body plan · rig | lanky biped with arms reaching its ankles (knuckle-crutch walker) · RIG_BIPED |
| H / length | 1.20 m / 0.60 m |
| Habitat | Lore: hanging-vine groves in `forest`. Suggested: `forest` (uncommon, dusk and night). |
| Personality | Languid and deceptively strategic. Waits, sways, then strikes mid-"nod". |
| Distinctive anatomy | **Very long arms** (reaching its ankles) ending in 3 hooked claws. Short legs. A **mossy hooded mantle** over its shoulders and head. **Three hanging clusters of foxglove-like bells** (from both shoulders and its crown) with speckled throats. The pod is gone. |
| Dominant colours (v2) | P `#3A6128` moss green · A `#C98BDB` foxglove purple · S `#9C8466` fur |
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
| Family / stage / types | f04 · stage 3 · verdant / toxin (from c11 at Lv 32, v2) |
| Body plan · rig | massive quadruped knuckle-walker with a canopy tree on its back · RIG_QUAD |
| H / length | 2.20 m (to canopy top) / 2.00 m |
| Habitat | Lore: the oldest glades of `forest`. Suggested: `forest` deep glade (rare, any time). |
| Personality | Serene and slow. A patient guardian that lets small creatures shelter in its canopy. |
| Distinctive anatomy | Bulky body with long forelimbs whose claws curl so it walks on its knuckles. **A trunk rising from its back into a 4-lobed canopy**, from which **vines and 12 dark bells hang like a curtain**. Low, forward-set head with moss brows and a moss beard. **No shell and no rock spikes** (see audit). |
| Dominant colours (v2) | P `#22421F` dark canopy green · A `#B36BD1` deep purple bells · S `#6F5A48` fur |
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
| Dominant colours (v2) | P `#7F7466` warm grey · S `#E0C7A8` tan · P− `#5E564D` plate lines |
| Materials | Shell `STONE` r 0.85 with the hex pattern as vertex-colour P− grooves plus 6 raised plates. Skin `FUR` r 0.7. Rim `#FFF1D6` 0.2. |
| Face (v2) | Small beady eyes (E5) with a thin off-white sclera ring, iris `#111`, 1 highlight. Brows: none. Mouth: tiny painted line at the snout tip. |

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
| head (v2) | sphere **(0.18,0.17,0.20)** | shell @ (0,−0.05,0.36) | S | retract (z −0.2) |
| snout | cone r0.06 h0.12, forward | head front | S | — |
| snout shield | sphere cap r0.04 | snout tip | S+ | — |
| eye ×2 (v2) | sphere r0.03 | head @ (±0.09,0.05,0.14) | E | blink |
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
| Dominant colours (v2) | P `#6C665B` stone grey · S `#C4B454` lichen ochre · D `#4A4038` skin |
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
| head (v2) | sphere (0.14,**0.13**,0.16) | under-body @ (0,0.02,0.60) | D | look, retract |
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
| Dominant colours (v2) | P `#EAF6FF` frost white · S `#5FB8D0` ice cyan · A `#B7A9F2` lavender underside (minor) |
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
| Family / stage / types | f06 · stage 2 · frost (from c16 at Lv 22, v2) |
| Body plan · rig | long limbless serpent with a sail-fin row and neck ribbons · RIG_CHAIN |
| H / length | 0.70 m (head raised) / 3.00 m |
| Habitat | Lore: wind-scoured snowfields. Suggested: `snowpeak` (uncommon; more common in snow weather). |
| Personality | Graceful, vain and territorial about untouched snow. |
| Distinctive anatomy | 12-segment serpent. **5 separate translucent dorsal sail-fins** in a row. **Two long ribbon fins trailing from the base of the neck** (not the head). A wedge head with a brow crest. **A flake-shaped tail fin.** Hex-flake scale pattern. No orbs and no horn. |
| Dominant colours | P `#8C8FE0` periwinkle-lavender · S `#E6F6FF` frost white · P+ `#D6F0FF` belly |
| Materials | Scales `SCALE` r 0.35, clearcoat 0.4, with a hex-flake normal pattern. Fins `ICE` opacity 0.75, emissive `#CFEFFF` 0.2. Rim `#FFFFFF` 0.5. |
| Face (v2) | Narrow eyes (family class E3, lengthened). Iris `#A8E6FF`, **vertical-ellipse** pupil (1:2.2), 1 highlight, lidAngle −5. Brows: the crest (geometry). Mouth: long thin painted line plus a `jaw`. |

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
| Family / stage / types | f06 · stage 3 · frost / lumen (from c17 at Lv 38, v2) |
| Body plan · rig | floating ring-coil serpent with small forelimbs · RIG_CHAIN + RIG_FLOAT |
| H / span | 1.80 m / 1.60 m · hoverGap 0.3 H |
| Habitat | Lore: the summit sky on clear nights. Suggested: `snowpeak` summit (rare, night, clear weather). |
| Personality | Distant and dreamlike. Appears to lost travellers and guides them down. |
| Distinctive anatomy | Its body forms a **near-closed vertical ring** (the tail tucks behind the head with a gap, **not a tail-biting ouroboros**). **Ten aurora ribbon-plumes** stream from the ring's outer edge. **A glowing six-armed flake core floats at the ring's centre.** It has grown **two small clawed forelimbs** near the head, which hold the ring's rim. Navy body flecked with emissive star dots. |
| Dominant colours | P `#1B2A4A` polar navy · A `#47E6A8`→`#B266FF` aurora gradient (green dominant) · S `#E8F7FF` crests and core |
| Materials | Body `SCALE` r 0.35 with emissive star-fleck vertex colours. Plumes `GLOW` opacity 0.7 with a vertex gradient. Core `GLOW` S 2.0. Rim `#9FFFD9` 0.5. |
| Face (v2) | Long head. Eyes with no sclera (an exception pending Creative Direction; the fallback is a thin sclera ring): iris gradient green→violet, emissive 0.5, **vertical-ellipse** pupil, 2 highlights. Brows: crest fins. Mouth: closed painted smile line (M). |

| Clip | Motion |
|---|---|
| idle | The ring sways (roll ±8°) and bobs 0.05 H. The plumes stream on a wind noise. The core spins (yaw 20°/s). |
| move (air-roll) | Tilts the ring forward 30° and rolls through the air like a slow wheel (pitch rotation), with the plumes trailing. |
| attack | The ring spins fast as a wheel (pitch 2 rev/s for 0.4 s), then rolls into the target (`contact` 55%). |
| attack_special | Holds the ring still, facing the target. The core flares (glow 3.0, v2 clamp) and fires an aurora beam from `fx_core`. |
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
| H / length (v2) | **0.40 m** / 0.47 m (the whole model scales with H; part dimensions are unchanged) |
| Habitat | Lore: breezy meadows. Suggested: `route_1` (common), `route_2` (common), grassy edges of `town_1`'s route exits (day). |
| Personality | Bubbly, loud and fearless far beyond its ability. |
| Distinctive anatomy | A near-spherical fluffy body with a sky-blue back cap. **Two stub wings shaped like samaras** (a round nut at the root and a thin blade). **Twin tail streamers.** Big feet. Cheek swirl marks. A tiny wide gape beak. |
| Dominant colours (v2) | P `#F4F1E8` off-white · S `#6AA3CC` sky blue · A `#E07A5F` cheek swirl (minor) |
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
| Dominant colours (v2) | P `#3F7FA6` blue · S `#E2C585` seed tan · A `#3D6B45` leaf green |
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
| head (v2) | sphere (0.12,**0.13**,0.12) | torso front @ (0,0.04,0.30) | P | look |
| beak | cone r0.04 h0.06 + jaw half-cone | head front | `#3A342A` | jaw |
| eye ×2 | sphere r0.035, x×1.3 | head @ (±0.07,0.03,0.07) | E | blink |
| leaf crest | extrude X_leaf 0.12×0.04, depth 0.01 | head top · pitch −40 | A | lag |
| wrist nut ×2 | sphere (0.05,0.04,0.07) | torso @ (±0.10,0.04,0.08) | A | flap |
| wing blade ×2 | extrude X_samara span 0.65 chord 0.18, depth 0.015 + 4 vein tubes r0.004 | wrist nut | S, veins P− | flap, fx_wings |
| streamer ×2 | extrude X_strip 0.40×0.05, depth 0.005 | torso rear @ (±0.03,0,−0.30) | P | wave |

#### c21 · Samarch
| Field | Value |
|---|---|
| Family / stage / types | f07 · stage 3 · gale / verdant (from c20 at Lv 30, v2) |
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
| Dominant colours (v2) | P `#E3C77A` amber · A `#2E6BFF` electric blue rings · P+ `#F6E8B5` underside |
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
| Family / stage / types | f08 · stage 2 · toxin / water (from c22 at Lv 18, v2) |
| Body plan · rig | upright octopus on 4 leg-arms with 2 lasso arms · RIG_RADIAL (tetrapod) |
| H / length | 0.90 m / 0.70 m |
| Habitat | Lore: brackish lake inlets. Suggested: `lake` (uncommon), `route_3` marsh (rare, rain). |
| Personality | A cocky trickster that juggles water droplets. |
| Distinctive anatomy | **Stands upright on 4 thick leg-arms.** **2 long upper arms** that it twirls into lasso loops. **Its mantle is swollen, translucent and visibly full of sloshing brine**, like a water balloon, with an internal water-surface disc. The eyes sit on the body below the mantle. A curling snorkel siphon. The rings have grown into large loops. **No external bubble helmet** (see audit). |
| Dominant colours (v2) | P `#D6A865` ochre · A `#2458D6` blue rings · S `#9FE3F0` brine |
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

#### c24 · Drapetide
| Field | Value |
|---|---|
| Family / stage / types | f08 · stage 3 · toxin / water (from c23 at Lv 34, v2) |
| Body plan · rig | tall tripod octopus with a 3-arm cloak web · RIG_RADIAL (tripod) |
| H / span | 1.80 m / 1.60 m (web fully open) |
| Habitat | Lore: the dark centre of `lake`. Suggested: `lake` deep water edge (rare, night). |
| Personality | Regal and menacing but honourable. Its intimidation display ends many fights before they start. |
| Distinctive anatomy | Stands on **3 support arms as a tripod**. **3 raised display arms are joined by a dark web** that it spreads like a cloak and reveals **bold blue-and-gold ring patterns** on the inside. A tall hooded mantle. Cuttlefish-like **W-shaped pupils**. |
| Dominant colours | P `#5A2A6E` deep violet · A `#3FA0FF` ring blue (+ `#F0C040` gold secondary accent) · D `#2A1830` web |
| Materials | Skin `SKIN_WET` r 0.35, clearcoat 0.4. Web `MEMBRANE` opacity 0.95, r 0.6, with the ring pattern texture (emissive A 1.0; 3.0 during display). Rim `#C79BFF` 0.35. |
| Face (v2) | Hooded eyes (lidCoverage 0.4) with **h-bar** pupils (v2). Iris `#F0C040`, 1 highlight. Brows: lid caps. Mouth: hidden. |

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
| head (v2) | sphere **(0.20,0.14,0.20)** | root @ (0,1.00,0) | P | br, look |
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
| Family / stage / types | f09 · stage 2 · shade (from c25 at Lv 24, v2) |
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

#### c27 · Emberfold
| Field | Value |
|---|---|
| Family / stage / types | f09 · stage 3 · shade / fire (from c26 at Lv 40, v2) |
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
| attack_special | The panels snap fully open (flat, 180° spread) and the core flares (glow 3.0, v2 clamp). It projects its cut-out pattern as a moving silhouette beam (`fx_core`). On High, it casts a light cookie of the pattern. |
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
| Habitat (v2) | Lore: mist over morning water. Encounters per world.md (day band). |
| Personality | Cheerful. Drawn to lanterns and to trainers' lights. |
| Distinctive anatomy | A chubby round body with a **large fan tail with glowing edges**, a **small crescent dorsal fin**, tiny pectoral fins, and a **lateral light-stripe** along its side. Big eyes and a round "o" mouth. |
| Dominant colours (v2) | P `#FFD6A0` peach · S `#E0708F` pink fins · A `#FFF4C2` glow |
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
| Family / stage / types | f10 · stage 2 · lumen (from c28 at Lv 26, v2) |
| Body plan · rig | streamlined air-swimming marlin with a light-bill · RIG_FLOAT (chain) |
| H / length | 0.80 m (sail raised) / 2.00 m · hoverGap 0.4 H |
| Habitat | Lore: high cold air over the passes. Suggested: `route_5` (uncommon, day), `snowpeak` (rare). |
| Personality | Competitive, disciplined and an honourable duellist. |
| Distinctive anatomy | A pearl spindle body with a periwinkle back. **A long glowing gold bill.** **A tall crescent sail-fin that folds flat at speed.** A sickle tail. Long pectoral fins. **The lateral light-stripe is now bright.** |
| Dominant colours (v2) | P `#F2F0FF` pearl white · S `#8BA6E8` periwinkle back (**dominant pair: pearl/periwinkle**) · A `#FFD86B` gold accent |
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

#### c30 · Coronaleen
| Field | Value |
|---|---|
| Family / stage / types | f10 · stage 3 · lumen / shade (from c29 with the Dawn Prism or at Lv 44, v2) |
| Body plan · rig | vast floating baleen whale with an eclipse corona crown · RIG_FLOAT (chain) |
| H / length (v2) | **1.75 m / 4.80 m** (the whole model scales with H; part dimensions are unchanged) · hoverGap 0.25 H · battle framing: see Risks |
| Habitat | Lore: the sky over `snowpeak`, seen during eclipses. Suggested: `snowpeak` summit (night, clear, rare; World Designer may prefer a scripted encounter). |
| Personality | Ancient, gentle and solemn. Locals say eclipses happen when it passes overhead. |
| Distinctive anatomy | Indigo-black body with emissive star flecks. **A dark eclipse disc on its forehead ringed by a 12-ray gold-white corona** that rotates slowly. Long knobbly-edged pectoral flippers with glowing edges. Pale lavender belly grooves that glow gold when it sings. **The lateral stripe is now a row of 7 glowing spots.** A tiny crescent dorsal fin. Horizontal flukes. **No wings** (see audit). |
| Dominant colours | P `#231F3A` eclipse indigo · A `#FFE8A3` corona gold-white · S `#C9C3E6` belly lavender |
| Materials | Skin `SCALE` r 0.4, clearcoat 0.3, with emissive star-fleck vertex colours. Corona `GLOW` A 2.0. Belly grooves as vertex stripes S with an emissive gold channel (0 idle, 1.5 singing). Rim `#FFE8A3` 0.4. |
| Face (v2) | Small eyes (E3, r 0.045 H) set low near the corner of the mouth. Iris `#FFE8A3`, **ring** pupil 0.4, 1 highlight, kind heavy lids (lidCoverage 0.35). Brows: none. Mouth: long curved jawline with a `jaw` (opens 15°) showing a baleen comb texture. |

| Clip | Motion |
|---|---|
| idle | Slow vertical undulation (tail-beat 0.25 Hz). The pectorals sweep slowly, the corona rotates at 10°/s and the belly glows pulse softly. |
| move (fluke swim) | Slow vertical fluke strokes (0.4 Hz). It banks with its pectorals. |
| attack | A breach-like arc: rises 0.4 H and belly-flops forward (`contact` 60%) with a dust and light shockwave. |
| attack_special | Opens its mouth and inhales. Light particles are pulled in and the local battle light dims 30% (Balanced and High only). Then it exhales a beam from `fx_corona`. |
| hit | The body shudders (a high-frequency ±1° roll for 0.3 s) and the corona flickers. |
| capture (v2) | Curls head toward tail and the corona collapses inward, as a ≤ 250 ms pose. |
| faint | Sinks slowly to the ground and lands on its belly with dust. The corona thins to a ring, then goes out. The pectorals droop. |
| victory | Sings: the belly grooves glow gold and the corona flares. |

| Part | Primitive & dims (×H) | Parent @ offset · rot | Slot | Anim |
|---|---|---|---|---|
| body seg ×5 | lathe L_spindle split into 5 chained pieces, total len 2.75 along Z, rmax 0.42; head seg x×1.1 y×0.85 | root @ (0,0.45,1.30) | P (belly S) | wave |
| lower jaw | half-lathe len0.70 rmax0.30 | seg1 bottom | P, inner baleen texture | jaw |
| eye ×2 (v2) | sphere **r0.045** | seg1 @ (±0.36,−0.10,0.05) | E | blink |
| eclipse disc | cylinder r0.18 h0.02 | seg1 top @ (0,0.36,0.15) · pitch −20 | D `#0B0A12` | — |
| corona | extrude X_corona inner 0.20 outer 0.34, depth 0.02 | behind the eclipse disc | A (GLOW) | spin, glow, fx_corona |
| pectoral ×2 | extrude humpback flipper (len 0.90, w 0.20, 6 knobs on the leading edge), depth 0.04 | seg2 @ (±0.40,−0.15,0.10) | P, edge A | sweep |
| dorsal crescent | extrude X_fin_crescent 0.12×0.06 | seg4 top | P | — |
| flukes | extrude X_fin_crescent span 0.90, horizontal, depth 0.04 | seg5 end | P | wave |
| lateral spot ×7 per side | sphere r0.025 | seg2–seg4 flanks | A | glow |

---

## 5. Base stats and progression numbers (v2)

- **This section supplies:** base stats (the six stats), traits and runtime presentation data.
- **Systems-derived fields** (DECISIONS D12, systems §2.1; shown for reference, never hand-entered):
  - catch rate on the 0–255 scale: stage 1 = 190, stage 2 = 90, stage 3 = 45, starter families = 45
  - XP yield: floor(BST/5) at stage 1, floor(BST/3) at stage 2, floor(BST×4/9) at stage 3
  - growth curve, set per family
- **Evolution levels** follow D11 (systems §8.3). f10 stage 2→3 happens with the Dawn Prism (`i_evo_prism`) or at Lv 44.
- **Stat totals:**
  - Starters: every line totals **310 / 405 / 525**, with a different stat spread per line.
  - Every species is inside the systems bands: stage 1 280–320, stage 2 395–435, stage 3 505–535.
  - Totals range from 285 to 535.
  - Late lines (f06, f09, f10) are the strongest.
- **(v2) Changes:** four species were adjusted to fit the bands:

| id | Change | New BST |
|---|---|---|
| c12 | atk 90 → 95, spe 35 → 40 | 505 |
| c20 | hp 55 → 60 | 395 |
| c21 | hp 75 → 80, def 65 → 70, spd 70 → 75 | 505 |
| c30 | hp 130 → 125 | 535 |

| id | Name | HP | Atk | Def | SpA | SpD | Spe | BST | XP (derived) | Catch (derived) | Evo 1→2 | Evo 2→3 | Growth (derived) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01 | Fizzkit | 40 | 45 | 38 | 62 | 45 | 80 | 310 | 62 | 45 | 16 | — | medium |
| c02 | Crackleap | 55 | 58 | 50 | 82 | 58 | 102 | 405 | 135 | 45 | — | 34 | medium |
| c03 | Tempestrel | 70 | 72 | 62 | 110 | 76 | 135 | 525 | 233 | 45 | — | — | medium |
| c04 | Wickwool | 55 | 65 | 58 | 45 | 45 | 42 | 310 | 62 | 45 | 16 | — | medium |
| c05 | Kilnhorn | 72 | 88 | 72 | 58 | 60 | 55 | 405 | 135 | 45 | — | 34 | medium |
| c06 | Smoulderam (v3) | 95 | 118 | 100 | 70 | 80 | 62 | 525 | 233 | 45 | — | — | medium |
| c07 | Rippleback | 52 | 50 | 55 | 55 | 58 | 40 | 310 | 62 | 45 | 16 | — | medium |
| c08 | Tidesleek | 65 | 70 | 62 | 72 | 66 | 70 | 405 | 135 | 45 | — | 34 | medium |
| c09 | Floeguard | 90 | 85 | 112 | 88 | 95 | 55 | 525 | 233 | 45 | — | — | medium |
| c10 | Dozebud | 60 | 40 | 50 | 45 | 60 | 35 | 290 | 58 | 190 | 16 | — | fast |
| c11 | Lullstalk | 80 | 60 | 65 | 65 | 85 | 40 | 395 | 131 | 90 | — | 32 | fast |
| c12 | Belladrowse (v2) | 110 | **95** | 85 | 75 | 100 | **40** | 505 | 224 | 45 | — | — | fast |
| c13 | Rollith | 45 | 55 | 85 | 30 | 45 | 40 | 300 | 60 | 190 | 20 | — | slow |
| c14 | Cairnback | 65 | 85 | 115 | 40 | 60 | 45 | 410 | 136 | 90 | — | 36 | slow |
| c15 | Lodestodon | 85 | 95 | 135 | 80 | 75 | 35 | 505 | 224 | 45 | — | — | slow |
| c16 | Rimelet | 45 | 40 | 55 | 65 | 60 | 45 | 310 | 62 | 190 | 22 | — | medium |
| c17 | Sleetribbon | 60 | 70 | 60 | 85 | 65 | 80 | 420 | 140 | 90 | — | 38 | medium |
| c18 | Borealoop | 80 | 60 | 80 | 115 | 110 | 75 | 520 | 231 | 45 | — | — | medium |
| c19 | Gustling | 40 | 50 | 35 | 40 | 35 | 85 | 285 | 57 | 190 | 14 | — | fast |
| c20 | Whirlseed (v2) | **60** | 75 | 45 | 55 | 45 | 115 | 395 | 131 | 90 | — | 30 | fast |
| c21 | Samarch (v2) | **80** | 100 | **70** | 75 | **75** | 105 | 505 | 224 | 45 | — | — | fast |
| c22 | Ringdrip | 48 | 45 | 45 | 60 | 55 | 47 | 300 | 60 | 190 | 18 | — | medium |
| c23 | Brineloop | 65 | 55 | 70 | 80 | 75 | 60 | 405 | 135 | 90 | — | 34 | medium |
| c24 | Drapetide | 85 | 70 | 80 | 105 | 95 | 70 | 505 | 224 | 45 | — | — | medium |
| c25 | Snipling | 40 | 60 | 40 | 60 | 45 | 70 | 315 | 63 | 190 | 24 | — | slow |
| c26 | Marionyx | 55 | 85 | 55 | 80 | 60 | 90 | 425 | 141 | 90 | — | 40 | slow |
| c27 | Emberfold | 70 | 95 | 65 | 120 | 80 | 100 | 530 | 235 | 45 | — | — | slow |
| c28 | Dawnfry | 60 | 35 | 50 | 65 | 65 | 45 | 320 | 64 | 190 | 26 | — | slow |
| c29 | Lumarlin | 65 | 90 | 55 | 75 | 60 | 85 | 430 | 143 | 90 | — | prism or 44 | slow |
| c30 | Coronaleen (v2) | **125** | 80 | 90 | 110 | 90 | 40 | 535 | 237 | 45 | — | — | slow |

Stat identity by line (unchanged from v1):
- f01 is a fast special attacker.
- f02 is a physical bruiser that gets bulkier.
- f03 is balanced, gets fast at stage 2, then becomes a slow wall.
- f04 is a slow special-defence tank.
- f05 is a physical wall that gains special attack through its electric typing.
- f06 is a special attacker.
- f07 is a fast, frail physical line.
- f08 is special and bulky.
- f09 is a fast mixed attacker.
- f10 goes from support fry to physical lancer to an HP-heavy special whale.

### 5.1 Traits (v2: one canonical trait per species, DECISIONS D13)
The v1 trait ideas (two per species, with invented effects) are withdrawn. Every species has exactly one trait id from systems §10. Display names come from the Creative Director; D13 fixes two of them: `tr_reckless` displays as *Headlong* and `tr_sturdy_core` as *Keystone Core*.

| id | Trait | Rationale |
|---|---|---|
| c01 | `tr_last_stand` | starter line |
| c02 | `tr_last_stand` | starter line |
| c03 | `tr_static_hide` | charged skin |
| c04 | `tr_last_stand` | starter line |
| c05 | `tr_last_stand` | starter line |
| c06 | `tr_reckless` | charging ram-horned dragon (v3) |
| c07 | `tr_last_stand` | starter line |
| c08 | `tr_last_stand` | starter line |
| c09 | `tr_frost_hide` | frost-rimed carapace; a slow shield-bearer gains little from speed traits |
| c10 | `tr_early_riser` | the sleeper wakes fast |
| c11 | `tr_toxic_skin` | pollen bells |
| c12 | `tr_regrowth` | canopy shelter |
| c13 | `tr_sturdy_core` | curl guard |
| c14 | `tr_thorned` | club rebound |
| c15 | `tr_charge_sink` | lodestone absorbs electric moves |
| c16 | `tr_frost_hide` | hoarfrost hide |
| c17 | `tr_snow_coat` | snowfield hunter |
| c18 | `tr_clear_mind` | serene guide |
| c19 | `tr_small_strikes` | small, fierce pecks |
| c20 | `tr_keen_focus` | precise dives |
| c21 | `tr_keen_focus` | raptor precision |
| c22 | `tr_toxic_skin` | toxic rings |
| c23 | `tr_tide_sink` | brine-filled mantle |
| c24 | `tr_menace` | ring intimidation display |
| c25 | `tr_fog_veil` | cut-out elusiveness |
| c26 | `tr_quick_feet` | the puppet shrugs off status |
| c27 | `tr_flame_sink` | ember core absorbs fire |
| c28 | `tr_regrowth` | light-fed healing |
| c29 | `tr_keen_focus` | glint bill (crit +1) |
| c30 | `tr_resonant` | eclipse resonance |

Twenty distinct ids are used. No stage-1 species has `tr_adaptive`, which is the systems balance gate.

### 5.2 (v2) Runtime presentation data (`CreatureVisualSpec` fields)
- **Eye class** follows the family (§2.4): f01 E2 · f02 E5 · f03 E1 · f04 E4 · f05 E5 · f06 E3 · f07 E1 · f08 E2 · f09 E3 (cut-out) · f10 E3.
- **Temperament** is the roaming behaviour (rendering §2.6). **Attack style** is `ClipParams.attackStyle` (rendering §4.5).
- **rimGain** multiplies rendering's global rim strength (§2.2).
- **sideYaw** is the angle for the GC-07 "side" silhouette view (D27). 0 means a true +X side view. A non-zero angle is used only for planar designs, which the battle yaw clamp never shows edge-on.

| id | pupil | temperament | attack style | rimGain | sideYaw |
|---|---|---|---|---|---|
| c01 | round | curious | lunge | 1.0 | 0 |
| c02 | round | curious | spin | 1.14 | 0 |
| c03 | round | territorial | dive | 1.43 | 35 |
| c04 | round | curious | lunge | 0.86 | 0 |
| c05 | round | territorial | rear | 1.0 | 0 |
| c06 | v-oval | wander | rear | 0.86 | 0 |
| c07 | round | curious | spin | 0.86 | 0 |
| c08 | round | curious | lunge | 1.29 | 0 |
| c09 | round | territorial | spin | 1.43 | 0 |
| c10 | round | wander | lunge | 0.71 | 0 |
| c11 | round | wander | slam | 0.71 | 0 |
| c12 | round | wander | slam | 0.6 | 0 |
| c13 | round | skittish | spin | 0.6 | 0 |
| c14 | round | territorial | slam | 0.6 | 0 |
| c15 | v-oval | territorial | cast | 1.0 | 0 |
| c16 | round | skittish | lunge | 1.7 | 0 |
| c17 | v-oval | territorial | breath | 1.43 | 0 |
| c18 | v-oval | wander | spin | 1.43 | 40 |
| c19 | round | curious | lunge | 1.0 | 0 |
| c20 | round | skittish | spin | 1.0 | 30 |
| c21 | round | territorial | lunge | 1.0 | 0 |
| c22 | h-bar | skittish | lunge | 1.0 | 0 |
| c23 | h-bar | curious | cast | 0.86 | 0 |
| c24 | h-bar | territorial | cast | 1.0 | 0 |
| c25 | cut-out | curious | lunge | 1.43 | 45 |
| c26 | cut-out | curious | slam | 1.43 | 30 |
| c27 | cut-out | territorial | cast | 1.14 | 45 |
| c28 | round | curious | spin | 1.29 | 0 |
| c29 | round | territorial | lunge | 1.43 | 0 |
| c30 | ring | wander | breath | 1.14 | 0 |

### 5.3 (v2) Cry parameters (creative_direction §8.6)
- Each family has one voice and one pitch contour. Contour breakpoints are (t 0–1, semitone offset), and timing stretches ×1.15 per stage.
- Every stage-to-stage pitch drop is **at least 5 semitones** (a ratio of 1.335 or more). This was checked for every pair.
- The type fx follows CD §8.6 for the primary type. The secondary type's fx is added at 50% mix from the stage that gains it.
- Faint and happy variants are derived as CD §8.6 describes.
- ADSR is the default (attack 15 ms, decay 120 ms, sustain 0.4, release 200 ms) unless the table says otherwise.

| Family | voice | contour | basePitchHz st1 / st2 / st3 | durationMs st1 / st2 / st3 | Other params |
|---|---|---|---|---|---|
| f01 | fm | (0,0)(.4,+7)(.7,+3)(1,+10) | 820 / 520 / 300 | 320 / 480 / 700 | harmonicity 3, modIndex 8 |
| f02 | saw_formant | (0,0)(.2,+5)(.6,+2)(1,−4) | 680 / 420 / 200 | 380 / 560 / 900 | F1 700, F2 1200, noiseMix 0.2 |
| f03 | am | (0,+2)(.3,−3)(.6,+4)(1,0) | 760 / 460 / 240 | 300 / 480 / 760 | vibrato 5 Hz / 0.2 |
| f04 | saw_formant | (0,+4)(.5,−2)(1,−9) | 560 / 340 / 140 | 600 / 850 / 1200 | F1 400, F2 900, attack 60 ms |
| f05 | noise_formant | (0,0)(.3,−2)(1,−6) | 600 / 360 / 150 | 280 / 450 / 800 | noiseMix 0.45, F1 350, F2 1000 |
| f06 | fm | (0,+9)(.5,+12)(1,+4) | 900 / 560 / 330 | 400 / 600 / 900 | harmonicity 4, vibrato 6 Hz / 0.3 |
| f07 | fm | (0,0)(.25,+12)(.5,+5)(1,+9) | 880 / 540 / 320 | 280 / 420 / 650 | harmonicity 1, modIndex 2 |
| f08 | am | (0,0)(.3,+4)(.6,−4)(1,+2) | 640 / 400 / 200 | 350 / 520 / 800 | vibrato 4 Hz / 0.35 |
| f09 | noise_formant | (0,−3)(.4,+6)(.8,−6)(1,0) | 580 / 380 / 180 | 320 / 500 / 760 | noiseMix 0.3, F1 500, F2 2400 |
| f10 | fm | (0,0)(.3,+5)(.6,+7)(1,+12) | 700 / 440 / 160 | 450 / 750 / 1200 | harmonicity 2, modIndex 3, sustain 0.6 |

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

**(v2) Canonical procedure (D27).** Release gate **GC-07** is the single silhouette specification: side and ¾ views, unlit black masks, 256 px and 20 px, box-downsampled and thresholded, with the gate's thresholds and fill limits. For planar designs, the "side" view uses the per-species `sideYaw` in §5.2 (c03 35°, c18 40°, c20 30°, c25 45°, c26 30°, c27 45°); every other species uses 0°. The steps below are kept only as an **optional supplementary report** (a native 20 px render and a colour pass). They are informational and never replace GC-07 results.
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
| c01 | QS | (v3) Round fluffy ball with two huge round ears and a coiled tail | two big ear discs on a round head; round body; tail coil with a bulb dot |
| c02 | BP | (v3) Forward-leaning long-legged runner with tall swept ears | two tall ear blades; digitigrade legs; coiled tail with a bulb |
| c03 | WG | (v3) Wide rounded glide-sheet with a maned head and a long orb tail | span ≈ 1.6 H membrane; long swept ears; tail line ending in an orb |
| c04 | QS | (v3) Chubby big-headed drake with a fleece collar and stubby wings | big round head with horn curls; bumpy fleece collar; wing nubs; short knob tail |
| c05 | BP | (v3) Upright young drake with full-curl horns and small wings | spiral horn circles; ruff bulge; wing points; thick tail with a knob |
| c06 | QL | (v3) Tall winged dragon with spiral ram horns and a clubbed tail | raised bat wings; horn spirals beside a long-necked head; long tail ending in a club |
| c07 | QS | Sitting otter with a thick plated tail curling out | upright seated pose; tail as thick as its body; round head |
| c08 | SR | Long low S-body with a raised periscope head and a tail rudder | long horizontal S; vertical head stalk; rudder notch |
| c09 | BP | Stout upright figure with a big fan shield beside it (v2) | fan semicircle at its side; domed back carapace with a crystal ridge; bare round otter head |
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
| QS | c01 silver-lilac/electric blue (v3) · c04 charcoal/ash cream (v3) · c07 brown/sea teal |
| QL | c06 obsidian/ember orange (v3) · c12 dark green/deep purple · c14 stone grey/ochre · c15 iron grey/crystal cyan |
| BP | c02 lilac/electric blue (v3) · c05 obsidian charcoal/smoulder cream (v3) · c09 ice white/slate · c11 moss green/foxglove purple |
| SR | c08 slate blue/aqua · c16 frost white/ice cyan · c17 periwinkle/white |
| WG | c03 storm lilac/electric blue (v3) · c20 blue/seed tan · c21 deep green/gold |
| RB | c10 moss green/tan · c13 warm grey/tan · c19 off-white/sky blue |
| RD | c22 amber/blue · c23 ochre orange/blue · c24 deep violet/blue |
| FT | c25 ink black/violet · c27 char black/ember orange |
| FL | c18 navy/aurora green · c26 ink black/ghost cyan · c28 peach/pink · c29 pearl white/periwinkle (v2) · c30 indigo/corona gold |

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
| c01 (v3) | ⚠ **Pikachu** (yellow electric mouse mascot: red cheek circles, zig-zag tail, black-tipped ears); **Pachirisu** (white/blue electric squirrel with blue cheek pouches and a bushy tail); **Minun/Plusle** (cream electric rabbits with blue/red cheek circles and pointed ears); **Emolga** (flying squirrel); **Dedenne** (antenna whiskers, cheek pouches) | Silver-lilac fleece, never yellow or white-with-stripe. Cheeks carry **three small freckle dots**, never a solid circle, never red. **Round satin dormouse ears** with a glowing rim (never pointed, never black-tipped). A **coiled spring tail with a glass bulb** (never a zig-zag or bolt, never bushy). Wrist-to-ankle membranes are a real sugar-glider trait. Three-feature check: vs Pikachu 0 signature features; vs Pachirisu 1 (blue cheek glow, as dots not pouches); vs Minun 1 (blue cheek accent). No reviewer should name a franchise character first. |
| c02 (v3) | Pawmo/Pawmot (electric mice with fighting stance); Emolga; Raichu | Upright glider-sprinter with long swept satin ears, lilac fleece, membranes to the hips and the coiled bulb tail. No yellow, no orange, no lightning-bolt tail, no cheek circles. |
| c03 (v3) | Emolga; Zekrom (black electric dragon); Lugia/Rayquaza (sky guardians) | A furry colugo-like glider with a cream storm mane, satin ears and an orb tail. No wings or feathers, no dragon head, no generator tail. Storm lilac, not black or white. |
| c04 (v3) | ⚠ **Charmander** (orange lizard with a tail flame); Litten/Fuecoco; Mareep/Wooloo; Palworld Lamball | Charcoal, not orange; **no tail flame** (a basalt knob); flames only on the **horn wicks**; the fleece is a collar/crown on a drake, not a round sheep body. |
| c05 (v3) | ⚠ **Charmeleon** (bipedal red fire lizard with a tail flame and a head horn); Salandit/Salazzle; Tauros | Charcoal body; ram horns curling a full turn with wick tips (no single back-swept head horn); smouldering fleece ruff; club-knob tail with no flame. |
| c06 (v3) | ⚠ **Charizard** (orange winged fire dragon, cream belly, teal wing lining, tail flame, two straight horns); **Reshiram** (white fluffy fire dragon); Monster Hunter **Teostra** (maned fire elder dragon, backswept horns); Palworld **Blazamut** (dark magma beast with fissures); WoW **Deathwing** (black dragon with molten seams) | Signature Charizard features absent: body **obsidian charcoal** (not orange), belly **dark ash plates with molten fissures** (not cream), wing membranes **ember-lit dark red-brown** (not teal/blue-green), **no tail flame** (basalt club), **great spiral ram horns with wick flames** (not straight horns). Vs Reshiram: charcoal not white, fleece is an ash mane over scales, no turbine tail. Vs Teostra: ram spirals not back-swept horns, charcoal not tan, wings with fingered membranes. Vs Blazamut/Deathwing: shares only the generic "dark scales + lava cracks" idea (2 non-signature features at most); the fleece mane, ram horns with wicks and club tail are its own. |
| c07 | ⚠ **Oshawott** (sea-otter starter with a scalchop shell on its belly); Buizel (sea weasel with a flotation collar) | The shell plates are **only on the tail**, as shingles. The body is brown with a teal shell, and it carries a pebble tool. Constraints: never a shell on the chest or belly, never a detachable shell. |
| c08 | Floatzel/Buizel; Dewgong; Milotic | An 8-segment serpentine otter with a dorsal hex-scute row and a vertical shell rudder, in a periscope pose. It has no twin tails, no flotation collar and no head fins. |
| c09 | ⚠ **Dewott/Samurott** (bipedal/quadruped otter line with shell blades); Empoleon (armoured penguin) | The shell becomes a carapace **and a tail-shield**. It is **never held as a blade or sword**, and there is no horned helm or seamitar. Frost crystals, a slate and ice palette, a defensive-guardian behaviour. Constraint: the arms never grip shell parts. **(v2, finding F-0-06):** no helmet or head cap of any kind, whiskers reduced to two short nubs, and shell only on the back carapace and tail-fan (no chest or shoulder shell). |
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
4. **Clips (v2):** every species has the 7 required clips (`idle`, `move`, `attack`, `hit`, `capture`, `faint`, `victory`). `attack_special` and `attackStatus` are optional. Every attack has an `impact` event at 40–55% of its duration. Capture reaction poses are ≤ 250 ms. Reduced-motion mode meets the §2.5 v2 rules (checked by unit test on the clip data). Clip durations meet release gate GC-05, with the bounds amended per D15.
5. **Faces (v2):** every species has the 8-cell atlas (`open, half, closed, happy, hurt, faint, determined, surprised`; cut-out equivalents for f09) at 256/256/128 px, plus brow meshes and a jaw or mouth atlas. On a screenshot at battle distance under the Mobile profile, each species' pupils or eyeholes are visible. This is a reviewer check with the screenshot filed as evidence. Not run yet.
6. **Silhouettes (v2):** release gate GC-07 passes with the §5.2 `sideYaw` values. A human identification test on the shuffled 20 px sheet should reach ≥ 27/30 correct matches. Not run yet.
7. **Budgets:** a script counts triangles, draw calls and animated nodes per species per profile and meets section 2.6. Frame rate is not part of this criterion.
8. **Stats:** a unit test confirms that each BST equals the sum of its six stats, and that the starter totals are exactly 310/405/525.
9. **Originality:** the character-consistency gate reviews the rendered models against every ⚠ constraint in section 8 and records its result in `design/reviews/character_consistency.md`.
10. **Names:** before the release phase, a trademark-register check covers all 30 names (at minimum the starters and any name used in marketing). Not done yet.

## 10. Dependencies
- **systems.md:** the formulas for catch (0–255), XP yield and growth curves; the status classes that the trait placeholders map to (Numbed, Chilled, Drowsy, Toxified, Burn); weather and attunement ids; the move tag `ground_quake`; the rule for trait assignment. Also move animation refs, which should reference the `attack`/`attack_special` clips and the `fx_*` anchors defined here.
- **world.md:**
  - final encounter tables and time-of-day bands (day and night; v2 has no dawn-only spawns)
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
| Oversized species (c30 at 4.8 m (v2), c12 canopy, c15 orbit) break battle framing | Layout | Builders export a bounding sphere. The battle camera frames each species per its bounding sphere. c30 may use a battle display scale of 0.75 (a display clamp, not a separate mesh). |
| Transparency sorting artefacts (ice fins, membranes, c23 mantle) | Visual | depthWrite off on thin fins, explicit renderOrder, no transmission. |
| Emissive-heavy designs lose their accents when bloom is off (Mobile) | Readability | Emissive colours are chosen to read unlit. A key must also stand out when rendered unlit. |
| c24 per-frame web rebuild and c26 per-frame strings cost CPU | Perf | 36 vertices and 5 line segments respectively. Update only while the model is visible. |
| Remaining originality risk on the ⚠ items | Legal/brand | Constraints are written as rules. The gate re-checks rendered models. Redesign anatomy if a reviewer can name the source creature from the render. |
| Names may collide in registers that were not searched | Legal | A register check before release. A fallback name is on file for the lowest-confidence case (Umbraleen → Coronaleen). |
| Stat numbers have not been playtested | Balance | Systems may adjust any stat by ±10% as long as starter totals stay within ±5 of target. Record changes here. |
| Floaters and rotors clip into uneven battle-stage terrain | Visual | hoverGap is measured from the flattened stage plane. The faint clip lands on the stage plane. |

## 12. Unresolved questions
1. Should stage-1 wild species be allowed dual types? This document keeps all stage-1s mono-type as the brief implies.
2. ~~Trait assignment~~: resolved by D13 (one fixed trait per species, §5.1).
3. Is c30 (Coronaleen) a normal rare wild encounter, or a scripted one tied to the story? This is for the World Designer and Creative Director.
4. Should the battle display scale for c30 be capped (0.75) or should the camera pull back? This is for the Rendering Engineer.
5. Should any evolution use a non-level trigger (e.g. a Resonance landmark)? All are level-based here. The Creative Director may tie one line (f06 or f10 suggested) to a landmark, provided it cannot softlock.
6. ~~Status mapping~~: resolved. v2 traits use canonical systems statuses, and the display names are in D8.
7. Variants (alternate colourings, sexes) are out of scope for v1. The recommendation is none, to protect the silhouette and colour uniqueness table.
8. Legal trademark screening of the final names (section 1 is a web screen only).
9. ~~Cry descriptors~~: resolved. This document supplies them (§5.3).
10. (v2) Pending Creative Direction approval: h-bar pupils for f08; emissive sclera-less eyes for c06, c15 and c18; atlas mouths for species without a jaw. Pending the World Designer: moving c24 from the volcano to the lake at night.
11. (v2) The name-similarity scan of Lullstalk, Emberfold and Coronaleen belongs to the Release agent (GC-13).
