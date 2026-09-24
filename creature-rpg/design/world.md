# World Design — Cantarra: region, zones, progression, encounters, quests

Owner: World Designer. **Version 2** (2026-09-24). This is a design spec: nothing here has been implemented or playtested. Playtimes are estimates.

**Binding inputs:**
- `design/DECISIONS.md` wins over every other document.
- `design/ANCHORS.md`.
- `design/creative_direction.md` (CD) for names, story, flags, and the Resonance registers.
- `design/systems.md` **v2** (SY) for evolution levels and the 17 story battles (§14.2).
- `design/creatures.md` (CR) for species names and types. The D7 and D29 renames apply: c11 Lullstalk, c21 Samarch, c24 Drapetide, c27 Emberfold, c30 Coronaleen; protagonist Hollis; Cantor Dorran Shale.
- `src/data/content/items.json` for item ids (D10), with systems v2 §12.1 renames: `i_hush_1/2`, `i_thread`.
- `src/world/zoneTypes.ts` for the zone data shape.

**What changed from v1** (review `design/reviews/world_designer.md`):
- **Story and structure:** CD story, zone and trial order and CD attuned types (D1). The graph is rewired: `town_2 → cave → route_3 → lake`.
- **Resonance:** exactly 4 mandatory Resonance gates, each with a Steward. Any troupe member of the type can act, fainted or not. CD register names are used (D2).
- **Rivals and starters:** 6 rival battles (D4). Unchosen starters come through `q_foster_leftover` / `q_second_clutch` (D5).
- **Antagonists:** the Stillmark is a survey guild with no theft (D6).
- **Names and ids:** renames (D7, D29), items.json ids (D10), CD §4.2 flags.
- **Levels:** evolution levels from SY (D11). No wild stage-2/3 below its evolution level (D23), enforced by the generator.
- **Cave:** single-level (D17).
- **Wild creatures:** at most 6 roaming per zone (D21). Wild spawn and respawn timing follows the rendering document §2.6.
- **Additions:** hand-placed `battleStages` for every zone, and 14 Waystones.

> **Id note.** This document uses the D10 / systems v2 ids `i_hush_1..2` and `i_thread`. The current `items.json` still has the old ids (`i_repel_1..2`, `i_escape`), and systems §12.1 requires the rename.

---

## 0. Conventions

| Topic | Decision |
|---|---|
| Zone-local frame | Origin at the zone center, y = 0 at the lowest walkable point. **x = east, z = south, y = up**, so north = −z. Units are meters. A zone W×D spans x ∈ [−W/2, W/2], z ∈ [−D/2, D/2]. |
| Yaw | Degrees clockwise from above: 0 = north (−z), 90 = east, 180 = south, 270 = west. |
| Exits | `ExitSpec{id, at, r, to, spawn, gate?}`. Trigger radius r = 5 m, centered on the listed coordinate at the zone rim. |
| Spawns | Every exit has a paired arrival spawn `sp_<zone>_<dir>` 8 m inside the zone, facing inward. Reload and zone entry use spawn ids (rendering §10.5). No wild anchors, trainer sight cones, or Resonance nodes within 25 m of a spawn. |
| Resonance nodes | `rn_<zone>_<nn>`. A node is performable if (a) its register is unlocked and (b) **any troupe member**, fainted or not, has the matching type in either type slot (D2; systems §5.5; CD R3). Solved nodes persist in the save. The exception is Swell stepping-stones, which reset after 60 s and are never on a mandatory path (CD §6.3). |
| Time bands (encounters) | **Day = 05:00–16:59** (rendering phases morning + day). **Night = 17:00–04:59** (evening + night). The clock runs 1 real s = 1 game min (rendering §5.2). New game starts at 08:00. At every Hearthrest the player can rest until 06:00 or 18:00 (instant; heals). No encounter is exclusive to dawn. |
| Weather | Weather ids come from systems §5.1: clear, rain, snow, fog, sunlight. Weather is rolled per zone on zone load and on each band change, seeded by `hash(saveSeed, zoneId, dayIndex, band)`. Resting advances the band and so re-rolls. The cave, towns, league and hall interiors use fixed `clear`. The battle's ambient weather equals the zone weather. |
| Hearthrest safe-return | A party wipe returns the player to the **last Hearthrest used** (systems §15.1). Before any Hearthrest has been used, the player returns to the Larkhollow home. |
| Zone data | Each zone's data maps 1:1 to `ZoneSpec`: `spawns, exits, props, npcs, trainers, nodes, pickups, wildRegions{at,r}, maxWild, encounters, battleStages{at,yaw}, hearthSpawn, waystone`. |

---

## 1. Region map

### 1.1 ASCII map (north up; not to scale)

Legend:
- `==` open exit
- `#F` exit gated by a story flag
- `#R` exit gated by a mandatory Resonance node
- `..` optional or secret link
- `[Tn]` Cadence Hall (trial venue)
- `[H]` Hearthrest
- `[W]` Waystone (every zone has one)

```
                                  (league) Concord Spire [H][W]  champion
                                     #F  flag_nullbell_broken + 6 Keynotes (resonance lift)
                                 (snowpeak) Hoarcrown [T6 frost][H][W]
                                     #R  Rime frozen falls (inside snowpeak, rn_snowpeak_01)
                                     #F  flag_odile_revealed
                                  (route_5) Gloamstair
                                     #F  flag_trial_5_cleared
 (volcano)====#F====(route_4)====#F====(town_3) Galewick [T4 gale][H][W]
 Mount Cindral  flag_rival_4_done   Highscar Rise   flag_trial_4_cleared     #F  flag_trial_3_cleared (causeway)
 [T5 fire][H][W]  #R Gust ascent (rn_route_4_01)          (lake) Sillowmere [T3 water][H][W]
                                                              :  .. rockfall shortcut (Heave, lake side only)
 (route_3) Sallowfen =====#F flag_rival_3_done=========== (lake W)
    #F  flag_cave_miners_saved      :
 (cave) The Undertone ====#F flag_trial_2_cleared==== (town_2) Knellstone [T2 stone][H][W]
    #R Heave lower galleries (rn_cave_01)                  ||
    :.. tunnel (Heave, cave side) ......................(route_2) Brackenridge Pass
                                                             #F  flag_trial_1_cleared
                                                          (forest) Murmurwood [T1 verdant][W]
                                                             #R  Rootgate (rn_forest_01, just inside S entry)
                                                          (route_1) Thistledown Way
                                                             #F  flag_starter_chosen
                                                          (town_1) Larkhollow [H][W]  <- new game
```

### 1.2 Routes vs areas

- **Routes (`route_1`..`route_5`)** are corridor zones: Thistledown Way (meadow), Brackenridge Pass (heather ridge), Sallowfen (reed fen on boardwalks), Highscar Rise (switchback cliffs with the Stillhouse), and Gloamstair (twilight tundra stair).
- **Areas (`forest`, `cave`, `lake`, `volcano`, `snowpeak`)** are separate destination zones, each with its own theme, attunement, and chapter climax.
  - Every area except the cave hosts a Cadence Hall.
  - The cave hosts the ch4 Brann confrontation instead.
- **Towns** have no wild encounters. `town_2` hosts trial_2 and `town_3` hosts trial_4.
- **Extra zone:** `league` (Concord Spire), reached by the resonance lift from the Hoarcrown summit.

Scene count: 14 exterior zones, plus 6 Cadence Hall interiors `trial_1..trial_6`, plus 1 extra interior `stillhouse` (the Stillmark base, entered from `route_4`; systems §14.2 stages Vey 2 there with null attunement), for **21 scenes**.

### 1.3 Adjacency table (all bidirectional unless marked)

| Edge | Zone A exit @ (x,z) | A arrival spawn (x,z,yaw) | Zone B exit @ (x,z) | B arrival spawn (x,z,yaw) | Gate (checked on A→B unless noted) |
|---|---|---|---|---|---|
| E1 | town_1 `x_town_1_n` (0,−60) | `sp_town_1_n` (0,−52,180) | route_1 `x_route_1_s` (0,90) | `sp_route_1_s` (0,82,0) | `flag_starter_chosen` |
| E2 | route_1 `x_route_1_n` (0,−90) | `sp_route_1_n` (0,−82,180) | forest `x_forest_s` (0,90) | `sp_forest_s` (0,82,0) | none. Rootgate node rn_forest_01 at forest (0,70) |
| E3 | forest `x_forest_n` (−20,−90) | `sp_forest_n` (−20,−82,180) | route_2 `x_route_2_s` (0,100) | `sp_route_2_s` (0,92,0) | `flag_trial_1_cleared` (Rootloft wardens lower the canopy bridge at (−20,−70)) |
| E4 | route_2 `x_route_2_n` (0,−100) | `sp_route_2_n` (0,−92,180) | town_2 `x_town_2_s` (0,75) | `sp_town_2_s` (0,67,0) | none |
| E5 | town_2 `x_town_2_w` (−75,0) | `sp_town_2_w` (−67,0,90) | cave `x_cave_e` (90,0) | `sp_cave_e` (82,0,270) | `flag_trial_2_cleared` (quarry lift gate) |
| E6 | cave `x_cave_nw` (−60,−90) | `sp_cave_nw` (−60,−82,180) | route_3 `x_route_3_w` (−100,0) | `sp_route_3_w` (−92,0,90) | `flag_cave_miners_saved` |
| E7 | route_3 `x_route_3_e` (100,0) | `sp_route_3_e` (92,0,270) | lake `x_lake_w` (−100,0) | `sp_lake_w` (−92,0,90) | `flag_rival_3_done` |
| E8 | lake `x_lake_n` (0,−100) | `sp_lake_n` (0,−92,180) | town_3 `x_town_3_s` (0,80) | `sp_town_3_s` (0,72,0) | `flag_trial_3_cleared` (causeway raised at lake (0,−80)) |
| E9 | town_3 `x_town_3_w` (−80,0) | `sp_town_3_w` (−72,0,90) | route_4 `x_route_4_e` (100,0) | `sp_route_4_e` (92,0,270) | `flag_trial_4_cleared` |
| E10 | route_4 `x_route_4_w` (−100,0) | `sp_route_4_w` (−92,0,90) | volcano `x_volcano_e` (100,0) | `sp_volcano_e` (92,0,270) | `flag_rival_4_done`. Gust ascent rn_route_4_01 lies before it. |
| E11 | town_3 `x_town_3_n` (0,−80) | `sp_town_3_n` (0,−72,180) | route_5 `x_route_5_s` (0,100) | `sp_route_5_s` (0,92,0) | `flag_trial_5_cleared` |
| E12 | route_5 `x_route_5_n` (0,−100) | `sp_route_5_n` (0,−92,180) | snowpeak `x_snowpeak_s` (0,100) | `sp_snowpeak_s` (0,92,0) | `flag_odile_revealed` |
| E13 | snowpeak `x_snowpeak_n` (0,−100) | `sp_snowpeak_n` (0,−92,180) | league `x_league_s` (0,40) | `sp_league_s` (0,32,0) | `flag_nullbell_broken` ∧ `i_keynote_1..6` → sets `flag_spire_open` |
| E14 (optional) | cave `x_cave_s` (60,90) | `sp_cave_s` (60,82,0) | route_2 `x_route_2_w` (−50,20) | `sp_route_2_w` (−42,20,90) | Opened by Heave node rn_cave_03 at cave (60,78). Only the cave side can open it; once opened it works both ways. |
| E15 (optional) | lake `x_lake_s` (0,100) | `sp_lake_s` (0,92,0) | town_2 `x_town_2_n` (40,−75) | `sp_town_2_n` (40,−67,180) | Opened by Heave node rn_lake_02 at lake (0,90). Only the lake side can open it, so town_2 cannot skip the cave or the fen. |

**Cadence Hall doors.** Each hall interior is 40×60 with its door at (0,30) and arrival spawn `sp_trial_N_door` at (0,24,0). Leaving a hall returns the player to the host arrival spawn.

| Venue | Host zone | Door (x,z) | Host arrival spawn (x,z,yaw) |
|---|---|---|---|
| `trial_1` Rootloft Hall | forest (canopy hall in the Great Hollow Tree) | (40,−50) | `sp_forest_hall` (40,−44,180) |
| `trial_2` Knell Hall | town_2 crest | (0,−55) | `sp_town_2_hall` (0,−49,180) |
| `trial_3` Mere Hall | lake, on piles; platform centered (0,−10), r 14 | (0,4) | `sp_lake_hall` (0,10,0) |
| `trial_4` Vane Hall | town_3 cliff edge | (−20,−55) | `sp_town_3_hall` (−20,−49,180) |
| `trial_5` Forge Hall | volcano crater rim, y 55 | (0,−35) | `sp_volcano_hall` (0,−29,180) |
| `trial_6` Rime Hall | snowpeak upper terrace, y 60 | (−50,−15) | `sp_snowpeak_hall` (−50,−9,180) |

### 1.4 Zone sheets

Terrain maps to `TerrainSpec`. Wild regions are circles `{at, r}`. `maxWild` = 6 everywhere (D21). Battle stages are `{at, yaw}`; each is a flat 12×6 m pad, and the auto-search (rendering §2.7) is only the fallback.

#### `town_1` — Larkhollow
- **Size/shape:** 120×120, terraced luthiers' village. **Height:** 0–6 m. **Attuned:** neutral. **Biome:** town.
- **Terrain:** orchard terraces; brook along x = +35 with footbridges at (35,−10) and (35,30).
- **Landmarks:**
  - Larkhollow Chordstone on the green, moss-capped (−10,−5). This is also `ws_town_1`.
  - Oriel's workshop and fosterage pen (−25,−20).
  - Player home (20,22).
  - Hearthrest with Chandlery (−22,22).
  - Wind-chime arbor (0,20).
- **Exits:** `x_town_1_n` (0,−60).
- **Spawns:** `sp_town_1_home` (20,18,0) for new game and pre-Hearthrest wipes; `sp_town_1_n` (0,−52,180); `sp_town_1_hearth` (−22,16,0); `sp_town_1_ws` (−10,1,0).
- **Battle stages:** (5,−30,90) for rival 1; (−10,40,90).
- **Wild:** none.

#### `route_1` — Thistledown Way
- **Size/shape:** 90×180, N–S meadow lane. **Height:** 0–12 m. **Attuned:** lumen. **Weather:** clear 80 / rain 20.
- **Terrain:** hedgerows; a stream enters at (−45,−30) and bends to (−10,−50).
- **Landmarks:**
  - White chalk Chordstone with a sunburst carving (15,−10). This is `ws_route_1`.
  - Stile (−10,70), where the capture tutorial's static Dozebud sits.
  - Kite Hill (25,30), y 12.
  - Stream islet (−30,−45).
  - Old Chord Shrine ruin (35,−60), a post-game Gleam node.
- **Exits:** `x_route_1_s` (0,90); `x_route_1_n` (0,−90).
- **Spawns:** `sp_route_1_s` (0,82,0); `sp_route_1_n` (0,−82,180); `sp_route_1_ws` (15,−6,0).
- **Wild regions:** {(−25,55),r18}, {(25,15),r20}, {(−20,−30),r18}, {(20,−70),r15}.
- **Battle stages:** (0,50,90), (−5,−15,90), (10,−60,90).
- **Static encounter:** `st_route_1_dozebud`, a c10 Dozebud Lv 4 at (−10,70), guaranteed. It re-appears on zone entry until `flag_capture_tutorial` is set (CD ch1).

#### `forest` — Murmurwood
- **Size/shape:** 180×180. **Height:** 0–18 m. **Attuned:** verdant. **Weather:** clear 60 / rain 20 / fog 20.
- **Terrain:**
  - Giant hollow trees and root arches.
  - The **Rootgate** is a wall of interlaced roots spanning x −90..90 at z = 70. Its single opening at (0,70) is sealed by a seed-knot.
  - An E–W ravine runs at z = −70 (15 m wide), crossed by the Rootloft canopy bridge at (−20,−70).
- **Landmarks:**
  - Rootgate seed-knot `rn_forest_01` (0,70), **mandatory Rootcall**. Resonance Steward at (8,76).
  - Great Hollow Tree (30,−35) with Rootloft Hall door (40,−50).
  - Murmurwood Chordstone (−50,40), `ws_forest`.
  - Humming hollow where the Stillmark crew works with their coil-rig (25,−25).
  - Thornwood thicket (−70,−45).
  - Dormant brass lantern-lode (60,55).
- **Exits:** `x_forest_s` (0,90); `x_forest_n` (−20,−90).
- **Spawns:** `sp_forest_s` (0,82,0); `sp_forest_n` (−20,−82,180); `sp_forest_hall` (40,−44,180); `sp_forest_ws` (−50,46,0).
- **Wild regions** (all north of the Rootgate): {(−55,45),r20}, {(50,40),r22}, {(−55,−15),r22}, {(0,−85),r10}.
- **Battle stages:** (0,40,90), (−30,0,90), (30,−15,90), (−20,−82,90).
- **Hearthrest:** none. Safe-return is the last Hearthrest used.

#### `route_2` — Brackenridge Pass
- **Size/shape:** 100×200. **Height:** 0 → 25 m (rising north). **Attuned:** stone. **Weather:** clear 75 / rain 25 (CD's hail flurry is cosmetic only).
- **Terrain:** heather ridges, dry-stone walls, and a creek gorge at z = 20 crossed by a rope bridge (0,20).
- **Landmarks:**
  - Ridge cairn Chordstone (−20,−50), `ws_route_2`.
  - Optional Heave boulder shortcut `rn_route_2_01` at (25,40), CD's Heave tutorial.
  - Kite-ridge Gust vent `rn_route_2_02` (30,−50).
  - Cracked west wall (−50,20), the tunnel to the cave, sealed from this side.
  - Town arch (0,−80).
- **Exits:** `x_route_2_s` (0,100); `x_route_2_n` (0,−100); `x_route_2_w` (−50,20), which needs `rn_cave_03` solved.
- **Spawns:** `sp_route_2_s` (0,92,0); `sp_route_2_n` (0,−92,180); `sp_route_2_w` (−42,20,90); `sp_route_2_ws` (−20,−46,0).
- **Wild regions:** {(−25,70),r20}, {(25,−5),r20}, {(0,−55),r18}.
- **Battle stages:** (0,60,90), (−10,−20,90), (0,−65,90) for rival 2.
- **Peddler:** Wick's cart at (35,65).

#### `town_2` — Knellstone
- **Size/shape:** 150×150 quarry town carved into a cliff. **Height:** 0 (south) → 30 (crest). **Attuned:** neutral; the Knell Hall interior is stone.
- **Terrain:** terraced streets, quarry cranes, bell towers.
- **Landmarks:**
  - Knell Hall door (0,−55).
  - Hearthrest with Chandlery (20,20).
  - Knellstone Chordstone in the bell yard (0,12), `ws_town_2`.
  - Tea house (Marra Aske) (−30,15).
  - Quarry crane lift, Spark node `rn_town_2_01` (45,−30).
  - Quarry lift gate to the cave (−70,0), gated by `flag_trial_2_cleared`.
  - Rockfall face to the lake (40,−70). It cannot be opened from this side.
- **Exits:** `x_town_2_s` (0,75); `x_town_2_w` (−75,0); `x_town_2_n` (40,−75), which needs `rn_lake_02` solved.
- **Spawns:** `sp_town_2_s` (0,67,0); `sp_town_2_w` (−67,0,90); `sp_town_2_n` (40,−67,180); `sp_town_2_hall` (0,−49,180); `sp_town_2_hearth` (20,26,0); `sp_town_2_ws` (0,16,0).
- **Battle stages:** (−40,30,90), (0,−40,90).

#### `cave` — The Undertone
- **Size/shape:** 180×180. A single-level heightfield (D17) with rim walls and a ceiling shell at y 14. **Height:** 0–10 m. **Attuned:** electric. **Lighting:** interior. **Weather:** none.
- **Terrain:**
  - Mine galleries open into crystal caverns.
  - A rock wall along x = 0 (z −90..90) splits the zone into two areas:
    - **Upper galleries** (east, x > 0), entered from town_2.
    - **Lower galleries** (west, x < 0), entered through one 8 m passage at (0,−10). A cracked boulder, `rn_cave_01`, blocks the passage: **mandatory Heave**. Resonance Steward at (6,−4).
- **Landmarks:**
  - Undertone Chordstone (70,10), `ws_cave`, next to the miners' camp.
  - Brass lift, Spark node `rn_cave_02` (40,0). It is a shortcut to the upper ledge (45,10).
  - Stillmark siphon coil on the lower-gallery Chordstone (−50,−55).
  - Miners' strays pen (−65,−40).
  - Seep grate `rn_cave_04` (−70,20).
  - Cracked south wall `rn_cave_03` (60,78).
- **Exits:** `x_cave_e` (90,0); `x_cave_nw` (−60,−90), gated by `flag_cave_miners_saved`; `x_cave_s` (60,90), optional.
- **Spawns:** `sp_cave_e` (82,0,270); `sp_cave_nw` (−60,−82,180); `sp_cave_s` (60,82,0); `sp_cave_ws` (70,16,0).
- **Wild regions:**
  - Upper: {(50,−40),r20}, {(40,50),r20}.
  - Lower: {(−45,20),r20}, {(−40,−70),r15}. These activate after `flag_cave_heave_gate`.
- **Roaming split:** 3 upper + 3 lower (6 total).
- **Battle stages:** (60,−20,90), (30,35,90), (−30,20,90), (−45,−50,90) for Brann.

#### `route_3` — Sallowfen
- **Size/shape:** 200×100, E–W reed fen on boardwalks. **Height:** 0–6 m, water level 0.3 m. **Attuned:** toxin. **Weather:** clear 45 / rain 30 / fog 25.
- **Terrain:** boardwalks 3 m wide; violet bubbling pools (visual only); sallow willows.
- **Landmarks:**
  - Half-sunk Chordstone (−20,0), `ws_route_3`. It is silenced until `flag_fen_stone_restored`.
  - Seep fen caches `rn_route_3_01` (40,30).
  - Veil curtain sinkhole `rn_route_3_02` (−60,30).
  - Storyteller's willow (−40,20).
  - Boardwalk end, where rival 3 waits (90,0).
- **Exits:** `x_route_3_w` (−100,0); `x_route_3_e` (100,0).
- **Spawns:** `sp_route_3_w` (−92,0,90); `sp_route_3_e` (92,0,270); `sp_route_3_ws` (−20,6,0).
- **Wild regions:** {(60,−25),r20}, {(0,30),r18}, {(−60,−25),r18}.
- **Battle stages:** (−30,−10,90) for Vey 1; (80,0,90) for rival 3; (30,−10,90).

#### `lake` — Sillowmere
- **Size/shape:** 200×200 basin. **Height:** shore 0.5–12 m; water surface y 0. **Attuned:** water; the Mere Hall interior is also water. **Weather:** clear 55 / rain 30 / fog 15.
- **Terrain:**
  - Circular lake centered (0,−10), r 60, with reed-isles.
  - Pile boardwalk from the stilt-hamlet (0,50) to the Mere Hall platform (0,−10), r 14.
  - Outflow channel north (x −5..5) with the causeway at (0,−80), raised on `flag_trial_3_cleared`.
- **Landmarks:**
  - Stilt-hamlet Hearthrest (60,70).
  - Mere Hall door (0,4).
  - Lake Chordstone on a reed-isle, reached by boardwalk (−60,60). This is `ws_lake`.
  - Swell current-stones `rn_lake_01` from (65,−45) to a reed-isle (45,−45).
  - Rockfall shortcut, Heave node `rn_lake_02` (0,90).
  - Three shore beacons for the Gleam side quest: (−60,−50), (60,−20), (−40,60).
- **Exits:** `x_lake_w` (−100,0); `x_lake_n` (0,−100); `x_lake_s` (0,100), optional.
- **Spawns:** `sp_lake_w` (−92,0,90); `sp_lake_n` (0,−92,180); `sp_lake_s` (0,92,0); `sp_lake_hall` (0,10,0); `sp_lake_hearth` (60,76,0); `sp_lake_ws` (−60,66,0).
- **Wild regions** (shore only): {(−80,−20),r18}, {(75,10),r18}, {(−30,80),r15}, {(0,−92),r8}.
- **Battle stages:** (−75,30,90), (70,40,90), (30,85,90).

#### `town_3` — Galewick
- **Size/shape:** 160×160 windmill city on sea-cliffs. **Height:** 0–20 m. **Attuned:** neutral; the Vane Hall interior is gale.
- **Terrain:** rope bridges, sail-roofed market, cliff edge along the north-west.
- **Landmarks:**
  - Vane Hall door (−20,−55).
  - Hearthrest with Chandlery (25,25).
  - Sail-market Chordstone (0,10), `ws_town_3`.
  - Marra's Kinsong study, where she moves after `flag_trial_3_cleared` (−35,−20).
  - Lighthouse, Spark node `rn_town_3_01` (60,−60).
  - Sail-loft cellar, Veil node `rn_town_3_02` (−35,−28).
  - Courier office (30,0).
- **Exits:** `x_town_3_s` (0,80); `x_town_3_w` (−80,0); `x_town_3_n` (0,−80).
- **Spawns:** `sp_town_3_s` (0,72,0); `sp_town_3_w` (−72,0,90); `sp_town_3_n` (0,−72,180); `sp_town_3_hall` (−20,−49,180); `sp_town_3_hearth` (25,31,0); `sp_town_3_ws` (0,14,0).
- **Battle stages:** (−10,30,90), (40,−30,90).

#### `route_4` — Highscar Rise
- **Size/shape:** 200×100, E–W switchback cliffs. **Height:** lower slope y 0–12 (x > 20); upper tier y 26–40 (x < 10). **Attuned:** gale. **Weather:** clear 80 / rain 20.
- **Terrain:** a 14 m cliff face along x = 15 separates the lower slope from the upper tier. The only way up is the **Gust updraft vent** `rn_route_4_01` at (20,5), which lands at (5,5): **mandatory Gust**. Resonance Steward at (26,10). A second vent at (8,5) takes the player back down.
- **Landmarks:**
  - Ribbon-marker Chordstone on the lower slope (60,30), `ws_route_4`.
  - **Stillhouse door** in a cliff notch on the upper tier (−55,−25). It leads to the interior `stillhouse`.
  - Stillhouse back door (−75,−42). It opens only from inside, via Seep node `rn_stillhouse_01`, as an optional shortcut.
  - Secret Gust vent `rn_route_4_02` (70,−35).
- **Exits:** `x_route_4_e` (100,0); `x_route_4_w` (−100,0); door `x_route_4_stillhouse` (−55,−25) → `sp_stillhouse_door`; back door `x_route_4_back` (−75,−42) → `sp_stillhouse_back`, after rn_stillhouse_01.
- **Spawns:** `sp_route_4_e` (92,0,270); `sp_route_4_w` (−92,0,90); `sp_route_4_ws` (60,36,0); `sp_route_4_stillhouse` (−55,−19,180); `sp_route_4_back` (−75,−36,180).
- **Wild regions:**
  - Lower slope, gale-rich, before the vent: {(70,−20),r20}, {(50,30),r15}.
  - Upper tier: {(−20,20),r18}.
- **Battle stages:** (60,0,90), (−10,15,90), (−85,−5,90) for rival 4.
- **Peddler:** Wick's cart at (80,15).

#### `volcano` — Mount Cindral
- **Size/shape:** 200×200 cone. **Height:** 0 (east base) → 70 (crater rim; ring r 30 around (0,−30)). **Attuned:** fire. **Weather:** clear 45 / sunlight 30 / fog 25.
- **Terrain:** basalt terraces, ash drifts, and lava channels (railed; no damage).
- **Landmarks:**
  - Base Hearthrest (80,20).
  - Ash Flats memorial plaque (−40,60), a lore beat.
  - Basalt Chordstone (60,−10), `ws_volcano`.
  - Forge Hall door (0,−35). It is sealed by an overheated vent at (−6,−30). Either:
    - cool it with Swell node `rn_volcano_01`, **or**
    - talk to the hall steward npc at (6,−30).

    Both open the door, so this is not a type gate.
  - Kindle thornwood `rn_volcano_02` (−70,−60).
  - Seep grate `rn_volcano_03` (60,−60).
- **Exits:** `x_volcano_e` (100,0).
- **Spawns:** `sp_volcano_e` (92,0,270); `sp_volcano_hall` (0,−29,180); `sp_volcano_hearth` (80,26,0); `sp_volcano_ws` (60,−4,0).
- **Wild regions:** {(60,40),r22}, {(−60,0),r22}, {(0,75),r15}.
- **Battle stages:** (50,20,90), (−40,−10,90), (10,60,90).

#### `route_5` — Gloamstair
- **Size/shape:** 100×200, N–S stone stairway across twilight tundra. **Height:** 0 → 50. **Attuned:** shade, but silenced (no bonus) until `flag_nullbell_broken`. **Weather:** clear 40 / snow 40 / fog 20. Lighting is fixed at blue hour; the encounter bands still follow the clock.
- **Landmarks:**
  - Frozen standing-stone Chordstone (0,40), `ws_route_5`. It is silenced, but fast travel still works (CD R6).
  - Heave boulder cave `rn_route_5_01` (−35,−40).
  - Veil curtain `rn_route_5_02` (30,20).
  - Stair top, where Odile appears (0,−88).
  - **Dawn Prism pickup** (−30,−60).
- **Exits:** `x_route_5_s` (0,100); `x_route_5_n` (0,−100).
- **Spawns:** `sp_route_5_s` (0,92,0); `sp_route_5_n` (0,−92,180); `sp_route_5_ws` (0,46,0).
- **Wild regions:** {(0,70),r22}, {(−20,−5),r20}, {(20,−50),r18}.
- **Battle stages:** (0,60,90), (0,−65,90) for rival 5; (20,−20,90).

#### `snowpeak` — Hoarcrown
- **Size/shape:** 200×200. **Height:** 0 (south) → 90 (summit, north). **Attuned:** frost; suppressed during Odile's phase A only (D22). **Weather:** clear 35 / snow 45 / fog 20.
- **Terrain:**
  - A glacier foot (z > 40).
  - **Frozen falls** at (0,40): a 20 m waterfall. **Mandatory Rime** node `rn_snowpeak_01` freezes it into stairs up to the upper terraces. Resonance Steward at (8,46).
  - Upper terraces (z −60..40).
  - Summit ring (z < −70).
- **Landmarks:**
  - Snowpeak lodge Hearthrest (40,60), below the falls.
  - Rime-crusted Chordstone ring on the summit (0,−84). The Null Bell, the Stillmark's master Stillbell, hangs there.
  - Rime Hall door (−50,−15).
  - Summit path (0,−60). Brann blocks it until `flag_trial_6_cleared`.
  - Lodge-side Chordstone (30,70), `ws_snowpeak`.
  - Kindle ice plug `rn_snowpeak_02` (70,40).
  - Gleam beacon `rn_snowpeak_03` (−70,−70).
  - Resonance lift platform to the league (0,−94).
- **Exits:** `x_snowpeak_s` (0,100); `x_snowpeak_n` (0,−100).
- **Spawns:** `sp_snowpeak_s` (0,92,0); `sp_snowpeak_n` (0,−92,180); `sp_snowpeak_hall` (−50,−9,180); `sp_snowpeak_hearth` (40,66,0); `sp_snowpeak_ws` (30,76,0).
- **Wild regions:**
  - Glacier foot, frost-rich, before the falls: {(−40,70),r22}.
  - Upper terraces: {(50,−10),r20}, {(−60,20),r18}.
  - None on the summit ring.
- **Battle stages:** (−30,60,90), (40,0,90), (0,−80,90) for Odile.

#### `league` — Concord Spire
- **Size/shape:** 80×80 open-air tuned-stone spire. **Height:** 0–12 m. **Attuned:** neutral. **Lighting:** fixed golden hour.
- **Landmarks:**
  - Lift landing (0,30) with a Hearthrest and a kiosk (an addition; see §11 Q3).
  - Six Keynote sockets at the door (0,20).
  - Landing stage for rival 6 (0,10).
  - Concordant's stage (0,−20).
  - `ws_league` (−10,30).
- **Exits:** `x_league_s` (0,40).
- **Spawns:** `sp_league_s` (0,32,0); `sp_league_hearth` (0,26,0).
- **Battle stages:** (0,4,90), (0,−14,90).
- **Wild:** none.

#### `stillhouse` — the Stillhouse (interior; extra scene)
- **Size/shape:** 60×40 interior. x ±30, z ±20. **Attuned:** none (null; systems §14.2). **Lighting:** interior. Music: the Stillhouse theme (CD §8.3).
- **Landmarks:**
  - West wing workshop (−18,5).
  - East wing coil store (18,5).
  - Vey's survey office (0,−8).
  - Strays pen (0,−15), where the leftover starter is found.
  - Back-door Seep grate `rn_stillhouse_01` (−25,−15).
- **Exits:** door (0,20) → `sp_route_4_stillhouse`; back door (−28,−15) → `sp_route_4_back` (after the Seep).
- **Spawns:** `sp_stillhouse_door` (0,14,0); `sp_stillhouse_back` (−22,−15,90).
- **Battle stages:** (−18,−2,90), (18,−2,90), (0,0,90) for Vey 2.
- **Wild:** none.

#### Cadence Hall interiors `trial_1`..`trial_6` (40×60)
- **Layout:** door (0,30); hall Tuner posts (−8,10) and (8,0); Cantor stage (0,−20).
- **Battle stages:** (0,4,90) for hall Tuners; (0,−14,90) for the Cantor.
- **Gimmicks** follow CD §4, with world rules:
  - Hall 1 vine bridges have a **lever alternative** at every regrow point, so Rootcall is never required inside the hall.
  - Hall 3 drains one water level per defeated hall Tuner, so both hall Tuners are mandatory there.
  - Hall 6 rime panels have a lever for players without Kindle.
  - Halls 2, 4 and 5 are type-free.

---

## 2. Places

### 2.1 Hearthrests, Chandleries, peddler

| Hearthrest | Zone @ (x,z) | Keeper | Chandlery | Storage (Fosterage ledger) | Recall |
|---|---|---|---|---|---|
| Larkhollow | town_1 (−22,22) | Maud | Pip, tier A | yes | yes |
| Knellstone | town_2 (20,20) | Tobin | Garrow, tier B | yes | yes |
| Sillowmere stilt-hamlet | lake (60,70) | generic keeper | generic, tier B | yes | yes |
| Galewick | town_3 (25,25) | Ysolde | Nell, tier C | yes | yes |
| Cindral base | volcano (80,20) | generic keeper | generic, tier C | yes | yes |
| Hoarcrown lodge | snowpeak (40,60) | generic keeper | generic, tier C | yes | yes |
| Concord landing | league (0,30) | generic keeper | kiosk, tier D | yes | yes |

**Chandlery inventories.** Ids come from `items.json`. Each item is sold from the unlock point given in systems §7.1/§12.1. A shop shows an item only when both its tier and the item's unlock are met.

| Tier | Items |
|---|---|
| A | `i_chime_reed`, `i_salve_1`, `i_cure_burn`, `i_cure_poison`, `i_cure_para`, `i_cure_sleep`, `i_cure_frost`, `i_thread`. After trial_1 it adds `i_chime_brass`, `i_salve_2`, `i_hush_1`, and discs `i_disc_03` and `i_disc_11` (Larkhollow only). |
| B | A, plus `i_cure_all`, `i_revive_1`, `i_charge_1` (after trial_2); `i_chime_silver`, `i_salve_3`, `i_hush_2` (after trial_3). Knellstone also sells discs `i_disc_01`, `i_disc_06`, `i_disc_08`, `i_disc_12`. |
| C | B, plus `i_chime_crown`, `i_salve_4` (after trial_5). Galewick also sells `i_evo_prism` (3000). Systems v2 sells no discs here. |
| D | C, everything unlocked. |

**Wick's cart** (traveling peddler). It appears at route_2 (35,65) and route_4 (80,15). The stock rotates **by Keynote count**, with no clock involved: 0–1 Keynotes `i_hush_1` ×3; 2 `i_cure_all`; 3 `i_charge_1`; 4 `i_revive_1`; 5 `i_salve_4`; 6 `i_chime_crown`. Each item costs the list price minus 10%.

### 2.2 Cadence Halls and champion (order is enforced by the graph and by the door checks)

The hall Tuner count includes the mandatory hall Tuners. Cantor teams are exactly systems v2 §14.2 (the ace is listed last).

| Venue | Cantor (`t_cantor_N`) | Type | Door opens when | Hall Tuners | Cantor team (levels) | Reward |
|---|---|---|---|---|---|---|
| trial_1 Rootloft | Wren Mossgrave | verdant | `flag_stillmark_first_seen` | 2 | 3: c10 10, c13 11, c11 12 | `i_keynote_1` → **Heave**; `i_disc_04` |
| trial_2 Knell | Dorran Shale | stone | `flag_rival_2_done` | 2 | 3: c13 15, c22 16, c14 17 | `i_keynote_2` → **Seep**; `i_disc_05` |
| trial_3 Mere | Nerys Tidewell | water | `flag_rival_3_done` | 2 (mandatory) | 4: c23 23, c17 23, c23 24, c08 25 | `i_keynote_3` → **Gust**; `i_disc_02` |
| trial_4 Vane | Tamsin Galloway | gale | `flag_trial_3_cleared` | 2 | 4: c20 27, c14 28, c20 29, c21 30 | `i_keynote_4` → **Veil**; `i_disc_07` |
| trial_5 Forge | Bastian Coalridge | fire | `flag_rival_4_done` + vent cooled | 2 | 5: c05 34, c14 35, c05 35, c15 36, c06 37 | `i_keynote_5` → **Rime**; `i_disc_16` |
| trial_6 Rime | Isaure Frostmere | frost | `flag_trial_5_cleared` | 2 | 6: c17 41, c15 42, c09 43, c18 43, c24 44, c18 45 | `i_keynote_6` → **Gleam**; `i_disc_14` |
| champion | the Concordant, Rhea Rookwell | mixed, lumen ace | `flag_spire_open` ∧ `flag_rival_6_done` | — | 6: c12 47, c24 47, c21 48, c15 48, c18 49, c30 50 | `flag_champion_defeated` → `flag_game_cleared` |

### 2.3 Resonance registers (D2, CD §6.2)

| Register | Type | Node kind | Unlocked by | Mandatory node (flag set) |
|---|---|---|---|---|
| Rootcall | verdant | vine | tutorial (`flag_resonance_tutorial`) | **rn_forest_01 Rootgate** (`flag_forest_rootgate_open`) |
| Spark | electric | lode | tutorial | — |
| Kindle | fire | thorn | tutorial | — |
| Swell | water | current | tutorial | — (the volcano vent has a talk alternative) |
| Heave | stone | boulder | `i_keynote_1` | **rn_cave_01 lower galleries** (`flag_cave_heave_gate`) |
| Seep | toxin | grate | `i_keynote_2` | — |
| Gust | gale | vent | `i_keynote_3` | **rn_route_4_01 Highscar ascent** (`flag_route4_updraft`) |
| Veil | shade | veil | `i_keynote_4` | — |
| Rime | frost | falls | `i_keynote_5` | **rn_snowpeak_01 frozen falls** (`flag_snowpeak_ascended`) |
| Gleam | lumen | beacon | `i_keynote_6` | — |

**Resonance Stewards** (`npc_steward_1..4`, teal sash). Each stands 6–10 m from a mandatory node. A Steward appears after the player's first failed prompt at that node ("Needs a {Type} kin"). The Steward then performs the register with a loaned kin, which sets the same flag.

### 2.4 Waystones (14 Chordstones; CD §3/§6.6)

| Waystone | Zone | Position | Arrival spawn |
|---|---|---|---|
| ws_town_1 | town_1 | (−10,−5) | (−10,1,0) |
| ws_route_1 | route_1 | (15,−10) | (15,−6,0) |
| ws_forest | forest | (−50,40) | (−50,46,0) |
| ws_route_2 | route_2 | (−20,−50) | (−20,−46,0) |
| ws_town_2 | town_2 | (0,12) | (0,16,0) |
| ws_cave | cave | (70,10) | (70,16,0) |
| ws_route_3 | route_3 | (−20,0) | (−20,6,0) |
| ws_lake | lake | (−60,60) | (−60,66,0) |
| ws_town_3 | town_3 | (0,10) | (0,14,0) |
| ws_route_4 | route_4 | (60,30) | (60,36,0) |
| ws_volcano | volcano | (60,−10) | (60,−4,0) |
| ws_route_5 | route_5 | (0,40) | (0,46,0) |
| ws_snowpeak | snowpeak | (30,70) | (30,76,0) |
| ws_league | league | (−10,30) | (−10,34,0) |

**Rules.**
- **Registration:** resonate with the stone within 3 m. Any kin can do it; no type is needed (R6). Registering sets `flag_ws_<zone>`.
- **Fast travel:** enabled once 2 stones are registered. `ws_town_1` counts as registered from ch1, and CD ch1 registers `ws_route_1`.
- **Where it works:** from the Tuning Ledger map in any exterior zone, in exploration state only. It does not work in halls, dialogue, battle, cutscenes, or on the Gust or Rime transition. It is free.
- **Silenced stones:** Larkhollow (ch1–ch11), Sallowfen (until ch5) and Gloamstair (until ch11) still work for fast travel. Only attunement is suppressed.

### 2.5 Story events

Chapters and beats are CD §4, and flags are CD §4.2. World-side placements follow. Loss rules are per D20: rival 1 continues the story on a loss; every other story battle follows the wipe rule and re-arms.

| Id | Ch | Zone @ (x,z) | Trigger | Sets | Gist and world notes |
|---|---|---|---|---|---|
| ev_01 | 1 | town_1 | name confirmed | `flag_game_started` | Dawn: the Larkhollow stone goes silent mid-note. The **leftover starter bolts** from the fosterage pen in panic (D6); the player learns this in ch2. |
| ev_02 | 1 | town_1 workshop (−25,−20) | talk to Oriel | `flag_starter_chosen` | Starter choice. Oriel gives the Tuning Ledger (`i_key_ledger`), 5 `i_chime_reed`, and 3 `i_salve_1`. |
| ev_03 | 1 | town_1 (5,−35) | leave the workshop | `flag_rival_1_done` | Cass takes the starter that is strong against the player's (D4), then battles (1 kin, Lv 5). |
| ev_04 | 1 | town_1 green (−10,−5) | talk to Oriel | `flag_resonance_tutorial` | Triad secret node (§2.7 sec_01), then the Rootcall explanation. |
| ev_05 | 1 | route_1 stile (−10,70) | capture the static Dozebud | `flag_capture_tutorial`, `flag_ws_route_1` | Guaranteed verdant kin. The route_1 Waystone registers in the same beat. |
| ev_06 | 2 | forest (0,70) | Rootgate | `flag_forest_rootgate_open` | Mandatory Rootcall. |
| ev_07 | 2 | forest (25,−25) | approach the humming hollow | `flag_stillmark_first_seen` | Two survey-guild engineers (t_still_01/02) are fitting a coil-rig to a humming tree. They battle "to finish the job". |
| ev_08 | 2 | trial_1 | beat Wren | `flag_trial_1_cleared` | Keynote 1 (Heave). |
| ev_09 | 3 | route_2 (0,−65) | reach the cairn | `flag_rival_2_done` | Rival 2. |
| ev_10 | 3 | trial_2 | beat Dorran | `flag_trial_2_cleared` | Keynote 2 (Seep). The quarry lift gate to the Undertone opens. |
| ev_11 | 4 | cave (0,−10) | Heave node | `flag_cave_heave_gate` | Mandatory Heave. |
| ev_12 | 4 | cave (−50,−55) | reach the coil | `flag_admin_brann_1` → `flag_cave_miners_saved` | Brann's crew siphons the stone. The miners' kin strayed when it fell silent and are penned "for safekeeping" (−65,−40). After the battle the player releases the pen. |
| ev_13 | 5 | route_3 (−20,0) | reach the half-sunk stone | `flag_admin_vey_1` → `flag_fen_stone_restored` | Vey battle; then any kin resonates the stone. |
| ev_14 | 5 | route_3 (90,0) | boardwalk end | `flag_rival_3_done` | Rival 3. Unlocks the lake exit. |
| ev_15 | 6 | trial_3 | beat Nerys | `flag_trial_3_cleared` | Keynote 3 (Gust). The causeway rises and Marra moves to Galewick. |
| ev_16 | 7 | trial_4 | beat Tamsin | `flag_trial_4_cleared`, `flag_odile_named` | Keynote 4 (Veil). Oriel's letter arrives at the Galewick Hearthrest. |
| ev_17 | 8 | route_4 (20,5) | vent | `flag_route4_updraft` | Mandatory Gust. |
| ev_18 | 8 | route_4 Stillhouse door (−55,−25) | reach the door | `flag_stillhouse_found` | Cass joins. Inside the interior: west wing t_still_06, east wing t_still_07. |
| ev_19 | 8 | stillhouse (0,−8) | Vey's office | `flag_admin_vey_2` → `flag_leftover_rescued` | After Vey 2, the strays pen (0,−15) opens. The leftover starter comes to the player's starter (CD ch8). Vey drops `i_disc_09`. |
| ev_20 | 8 | route_4 (−85,−5) | compound exit | `flag_rival_4_done` | Rival 4 ("to see if we're even"). Unlocks the volcano exit. |
| ev_21 | 9 | trial_5 | beat Bastian | `flag_trial_5_cleared` | Keynote 5 (Rime). Opens the Galewick north gate. |
| ev_22 | 10 | route_5 (0,−65) | approach | `flag_rival_5_done` | Rival 5. |
| ev_23 | 10 | route_5 (0,−88) | stair top | `flag_odile_revealed` | Odile talks and does not battle. She explains the Stillbells: "a stone that only sounds when we say" (D6). |
| ev_24 | 11 | snowpeak (0,40) | falls | `flag_snowpeak_ascended` | Mandatory Rime. |
| ev_25 | 11 | trial_6 | beat Isaure | `flag_trial_6_cleared` | Keynote 6 (Gleam). |
| ev_26 | 11 | snowpeak (0,−60) | summit path | `flag_admin_brann_2` | Brann steps aside. |
| ev_27 | 11 | snowpeak (0,−80) | summit ring | `flag_odile_defeated` → `flag_nullbell_broken` | Two-phase battle (D22). The player's lead kin resonates the Null Bell and it cracks. Every stone hums again: the region-wide color and sound pulse. |
| ev_28 | 12 | league (0,10) | landing | `flag_spire_open`, `flag_rival_6_done` | Rival 6. |
| ev_29 | 12 | league (0,−20) | Concordant | `flag_champion_defeated`, `flag_game_cleared` | The Great Chord and the credits. |

### 2.6 Unchosen starters (D4, D5; CD §4.1)

| Player's starter | Cass takes (strong vs player) | Leftover (found at the Stillhouse, ch8) | Obtained via q_second_clutch |
|---|---|---|---|
| c01 Fizzkit (electric) | c04 Wickwool (fire) | c07 Rippleback | c04 Wickwool |
| c04 Wickwool (fire) | c07 Rippleback (water) | c01 Fizzkit | c07 Rippleback |
| c07 Rippleback (water) | c01 Fizzkit (electric) | c04 Wickwool | c01 Fizzkit |

**`q_foster_leftover`**
- Opens at `flag_leftover_rescued` (ch8, Stillhouse strays pen (0,−15)).
- Step 1: return to Oriel in Larkhollow (fast travel).
- Step 2: choose **[Foster it]** to receive stage 1 at **Lv 25**, which sets `flag_leftover_obtained`. **[Not yet]** leaves it in the fosterage pen (−25,−20), claimable any time.
- It arrives above its evolution level (16), so it evolves at its first battle end unless cancelled (systems §8.3).

**`q_second_clutch`**
- Opens at `flag_trial_5_cleared` ∧ `flag_leftover_obtained`.
- Oriel reports a wild young of Cass's line near the fosterage.
- Bring the player's own starter line **and** the leftover line in the troupe to the Larkhollow Chordstone (−10,−5) and resonate. The Triad Chord cutscene plays.
- Result: stage 1 at **Lv 30**, which sets `flag_triad_complete`.

**Fallbacks.**
- Release fallback: Oriel's fosterage offers a replacement young of either line after one conversation (D5). The player's starter is `bond`-protected in any case (systems §7.4).
- Full party and storage: the creature is held pending and delivered later (QA U-PTY-06).

### 2.7 Secrets (optional Resonance nodes)

Register-unlock timing is given in §2.3. Starter-type secrets need the matching kin; the leftover (ch8) and the second clutch (after trial_5) make all three triad registers available to every player.

| Id | Node | Register | Zone @ (x,z) | Reward |
|---|---|---|---|---|
| sec_01 | rn_town_1_01/02/03 (cluster) | Spark / Kindle / Swell | town_1 green (−8,−2), (−6,−6), (−12,−6) | First solved: `i_chime_reed` ×2 (CD tutorial). Each other node: `i_salve_1` |
| sec_02 | rn_route_1_01 | Swell | route_1 (−24,−42) → islet (−30,−45) | `i_salve_2` ×2 |
| sec_03 | rn_forest_02 | Kindle | forest thicket (−70,−45) | `i_chime_brass` ×2, `i_salve_2` |
| sec_04 | rn_forest_03 | Spark | forest lantern-lode (60,55) | `i_chime_brass` ×3 |
| sec_05 | rn_route_2_01 | Heave | route_2 (25,40) | shortcut + `i_salve_2` |
| sec_06 | rn_route_2_02 | Gust | route_2 kite ridge (30,−50) | `i_charge_1` |
| sec_07 | rn_town_2_01 | Spark | town_2 crane (45,−30) | `i_chime_silver` |
| sec_08 | rn_cave_02 | Spark | cave brass lift (40,0) | `i_chime_silver` ×2 on the upper ledge (45,10) |
| sec_09 | rn_cave_03 | Heave | cave (60,78) | tunnel to route_2 |
| sec_10 | rn_cave_04 | Seep | cave (−70,20) | `i_revive_1` |
| sec_10b | rn_cave_06 | Heave | cave lower galleries boulder (−70,−75) | `i_disc_13` (systems §12.2) |
| sec_11 | rn_route_3_01 | Seep | route_3 (40,30) | `i_cure_all` ×2 |
| sec_12 | rn_route_3_02 | Veil | route_3 (−60,30) | `i_salve_3` + tale page 1 |
| sec_13 | rn_lake_01 | Swell | lake (65,−45) → reed-isle (45,−45) | `i_chime_silver` ×2 |
| sec_14 | rn_lake_02 | Heave | lake (0,90) | shortcut to town_2 |
| sec_15 | rn_town_3_01 | Spark | town_3 lighthouse (60,−60) | `i_charge_2` |
| sec_16 | rn_town_3_02 | Veil | town_3 cellar (−35,−28) | `i_disc_17` (systems §12.2 Veil secret) + tale page 3 |
| sec_17 | rn_route_4_02 | Gust | route_4 (70,−35) | `i_charge_2` |
| sec_18 | rn_stillhouse_01 | Seep | stillhouse (−25,−15) | back door to route_4 (−75,−42) |
| sec_19 | rn_volcano_02 | Kindle | volcano (−70,−60) | `i_revive_2` |
| sec_20 | rn_volcano_03 | Seep | volcano (60,−60) | `i_salve_4` |
| sec_21 | rn_route_5_01 | Heave | route_5 (−35,−40) | `i_charge_2` |
| sec_22 | rn_route_5_02 | Veil | route_5 (30,20) | `i_salve_4` |
| sec_23 | rn_snowpeak_02 | Kindle | snowpeak ice plug (70,40) | `i_chime_crown` |
| sec_24 | rn_snowpeak_03 | Gleam | snowpeak (−70,−70) | `i_disc_10` (systems §12.2 Gleam secret) |
| sec_25 | rn_route_1_02 | Gleam | route_1 Old Chord Shrine (35,−60), after `flag_game_cleared` | cosmetic Ledger clasp + `i_chime_crown` ×2 |

(Tale page 2 is in the cave; see q_side_veil_tales.)

### 2.8 NPCs (non-trainer, or trainer-backed where marked)

| Id | Zone | Pos (x,z) | Role | Gist |
|---|---|---|---|---|
| npc_oriel | town_1 | (−25,−24) | mentor (Chordwright) | Gives the starter, Ledger and tutorial. Runs q_foster_leftover and q_second_clutch. Blunt and warm. |
| npc_cass | varies | per rival table | rival (`t_rival_1..6`) | Loud and funny. Joins at the Stillhouse. |
| npc_hk_maud / npc_ch_pip | town_1 | (−22,22) / (−18,22) | Hearthkeeper / Chandler | Heal line (CD §2.4). Rest-until options. |
| npc_hk_tobin / npc_ch_garrow | town_2 | (20,20) / (24,20) | Hearthkeeper / Chandler | — |
| npc_hk_ysolde / npc_ch_nell | town_3 | (25,25) / (29,25) | Hearthkeeper / Chandler | Nell gossips about the survey guild. |
| npc_hk_lake / npc_hk_volcano / npc_hk_snowpeak / npc_hk_league | lake (60,70) / volcano (80,20) / snowpeak (40,60) / league (0,30) | — | generic keepers | — |
| npc_wick | route_2 (35,65); route_4 (80,15) | — | traveling peddler | Stock rotates by Keynote count. |
| npc_steward_1..4 | forest (8,76); cave (6,−4); route_4 (26,10); snowpeak (8,46) | — | Resonance Stewards | "Need a hand with that stone?" |
| npc_marra | town_2 (−30,15) → town_3 (−35,−20) | — | Kinsong researcher (D7 rename) | q_side_kinsong_survey. |
| npc_villager_chime | town_1 | (30,−10) | q_side_fallen_chime | His wind-chime fell at dawn and rolled into the stream. |
| npc_hollow_warden | forest | (0,12) | q_side_hollow_hum | Hollow trees stopped humming near the rig. |
| npc_bellwright | town_2 | (−45,−10) | q_side_offkey_bells | The quarry bells are off-key. |
| npc_foreman | cave | (72,14) | q_side_miners_samples; miners' camp | — |
| npc_storyteller | route_3 | (−40,20) | q_side_veil_tales | Tells of "curtains of dusk". |
| npc_boardwalker | lake | (0,50) | hint | Explains the Mere Hall piles. |
| npc_courier | town_3 | (30,0) | q_side_market_courier | — |
| npc_kitewright | town_3 | (−50,40) | q_side_kite_contest | — |
| npc_beaconkeeper | lake | (58,68) | q_side_gleam_beacons | — |
| npc_forge_steward | volcano | (6,−30) | vent alternative | "Hall's too hot. I'll vent it for you." |
| npc_brann | cave (−50,−55); snowpeak (0,−60) | — | admin (`t_admin_brann_1`) | Ch11: steps aside. |
| npc_vey | route_3 (−25,5); route_4 (−55,−38) | — | admin (`t_admin_vey_1`, `t_admin_vey_2`) | Stage whispers. |
| npc_odile | route_5 (0,−88); snowpeak (0,−84) | — | founder (`t_odile`) | A control-for-safety motive (D6). |
| npc_rhea | league | (0,−22) | the Concordant (`t_champion`) | — |
| npc_miners ×3 | cave | (74,6), (66,18), (78,14) | ambient | Worried about their strayed kin. |
| npc_hamlet ×4 | lake | around (55,65) | ambient | Stilt-hamlet life. |

**Character-builder archetypes** (release gate GC-02).
- **Named unique builders (21):** Hollis (the protagonist), Oriel, Cass, Rhea, Odile, Brann, Vey, the 6 Cantors, Marra, Wick, Maud, Tobin, Ysolde, Pip, Garrow, Nell.
- **Shared archetypes (8):** hearthkeeper, chandler, steward, stillmark_engineer, villager_adult, villager_child, miner, hall_tuner.
- **Trainer-class archetypes (12):** hiker, kite_flyer, scout, bell_ringer, fen_wader, angler, sail_hand, cliff_runner, forge_hand, pilgrim, ski_patrol, aurora_chaser.

### 2.9 Trainers

**The 17 story battles** (`t_rival_1..6`, `t_cantor_1..6`, `t_admin_brann_1`, `t_admin_vey_1`, `t_admin_vey_2`, `t_odile`, `t_champion`) use **exactly the teams and levels of systems v2 §14.2**. RS = the rival's starter line (§2.6); stage 2 from rival 2 onward, stage 3 from rival 5 onward.

Other trainers follow the systems §14.1 legality rules and the §14.4 route-trainer bands. Optional trainers have ≤ 3 kin from ch5 onward (D23). Sight range is 8 m (0 = must talk). M = mandatory (story or path), O = optional.

| Id | Zone | Pos (x,z) | Archetype | Size | Lv | Families | M/O |
|---|---|---|---|---|---|---|---|
| t_rival_1 | town_1 | (5,−35) | Cass | 1 | 5 | rival starter | M (loss continues) |
| t_r1_01 | route_1 | (−10,40) | kite_flyer | 1 | 4 | f07 | O |
| t_r1_02 | route_1 | (15,0) | villager_child | 2 | 5–6 | f04, f05 | O |
| t_r1_03 | route_1 | (−20,−40) | scout | 2 | 6–7 | f10, f08 | O |
| t_fo_01 | forest | (−30,55) | hiker | 2 | 8–9 | f04, f05 | O |
| t_fo_02 | forest | (40,10) | scout | 2 | 9–10 | f07, f08 | O |
| t_fo_03 | forest | (−60,−10) | hiker | 2 | 10–11 | f09, f10 | O |
| t_still_01 | forest | (20,−15) | stillmark_engineer | 2 | 10–11 | f08, f05 | M |
| t_still_02 | forest | (32,−22) | stillmark_engineer | 2 | 10–11 | f09, f08 | M |
| t_hall1_01 | trial_1 | (−8,10) | hall_tuner | 2 | 10–11 | f04 | M |
| t_hall1_02 | trial_1 | (8,0) | hall_tuner | 2 | 11–12 | f04, f07 | M |
| t_cantor_1 | trial_1 | (0,−20) | Wren | 3 | 10, 11, 12 | c10, c13, c11 ace | M |
| t_r2_01 | route_2 | (10,70) | hiker | 2 | 12–13 | f05, f07 | O |
| t_r2_02 | route_2 | (−25,40) | bell_ringer | 2 | 13–14 | f05, f08 | O |
| t_r2_03 | route_2 | (20,0) | kite_flyer | 3 | 13–14 | f07, f07, f10 | O |
| t_r2_04 | route_2 | (−10,−35) | scout | 2 | 14–15 | f09, f04 | O |
| t_rival_2 | route_2 | (0,−70) | Cass | 2 | 14, 16 | c20, RS2 ace | M |
| t_hall2_01 | trial_2 | (−8,10) | hall_tuner | 2 | 13–14 | f05 | M |
| t_hall2_02 | trial_2 | (8,0) | hall_tuner | 2 | 14–15 | f05, f07 | M |
| t_cantor_2 | trial_2 | (0,−20) | Dorran Shale | 3 | 15, 16, 17 | c13, c22, c14 ace | M |
| t_cv_01 | cave | (60,−20) | miner | 2 | 17–18 | f05, f08 | O |
| t_cv_02 | cave | (30,40) | miner | 3 | 17–19 | f05, f09, f08 | O |
| t_cv_03 | cave | (−40,50) | scout | 2 | 19–20 | f09, f08 | O |
| t_still_03 | cave | (−20,−30) | stillmark_engineer | 2 | 19–20 | f05, f08 | M |
| t_still_04 | cave | (−40,−45) | stillmark_engineer | 2 | 19–20 | f09, f05 | M |
| t_admin_brann_1 | cave | (−50,−58) | Brann | 3 | 18, 19, 20 | c22, c25, c23 ace | M |
| t_r3_01 | route_3 | (70,10) | fen_wader | 3 | 20–21 | f08, f08, f04 | O |
| t_r3_02 | route_3 | (30,−25) | angler | 2 | 21–22 | f08, f07 | O |
| t_r3_03 | route_3 | (−10,25) | fen_wader | 3 | 21–22 | f04, f09, f08 | O |
| t_r3_04 | route_3 | (−70,−15) | scout | 2 | 22–23 | f05, f10 | O |
| t_still_05 | route_3 | (−35,−8) | stillmark_engineer | 2 | 21–22 | f08, f09 | M |
| t_admin_vey_1 | route_3 | (−25,5) | Vey | 3 | 21, 21, 22 | c25, c28, c23 ace | M |
| t_rival_3 | route_3 | (90,0) | Cass | 3 | 21, 22, 23 | c20, c14, RS2 ace | M |
| t_lk_01 | lake | (40,80) | angler | 3 | 23–24 | f08, f04, f10 | O |
| t_lk_02 | lake | (−60,40) | sail_hand | 2 | 23–25 | f07, f08 | O |
| t_lk_03 | lake | (−70,−30) | angler | 3 | 24–25 | f08, f09, f04 | O |
| t_lk_04 | lake | (70,−10) | sail_hand | 3 | 24–25 | f07, f10, f05 | O |
| t_hall3_01 | trial_3 | (−8,10) | hall_tuner | 2 | 22–23 | f08 (c23) | M |
| t_hall3_02 | trial_3 | (8,0) | hall_tuner | 3 | 23–24 | f08, f03 | M |
| t_cantor_3 | trial_3 | (0,−20) | Nerys | 4 | 23, 23, 24, 25 | c23, c17, c23, c08 ace | M |
| t_hall4_01 | trial_4 | (−8,10) | hall_tuner | 3 | 26–27 | f07 | M |
| t_hall4_02 | trial_4 | (8,0) | hall_tuner | 3 | 27–28 | f07, f10 | M |
| t_cantor_4 | trial_4 | (0,−20) | Tamsin | 4 | 27, 28, 29, 30 | c20, c14, c20, c21 ace | M |
| t_r4_01 | route_4 | (70,−5) | cliff_runner | 3 | 29–30 | f07, f05 | O |
| t_r4_02 | route_4 | (40,20) | kite_flyer | 3 | 30–31 | f07, f10 | O |
| t_r4_03 | route_4 | (−10,−25) | cliff_runner | 3 | 31–32 | f05, f09 | O |
| t_still_06 | stillhouse | (−18,5) | stillmark_engineer | 3 | 30–31 | f08, f05, f09 | M |
| t_still_07 | stillhouse | (18,5) | stillmark_engineer | 3 | 31 | f09, f08, f06 | M |
| t_admin_vey_2 | stillhouse | (0,−8) | Vey | 4 | 31, 31, 32, 33 | c26, c23, c29, c26 ace | M |
| t_rival_4 | route_4 | (−85,−5) | Cass | 4 | 31, 31, 32, 33 | c21, c14, c26, RS2 ace | M |
| t_vo_01 | volcano | (60,30) | forge_hand | 3 | 33–34 | f05, f08 | O |
| t_vo_02 | volcano | (20,−10) | forge_hand | 3 | 34–35 | f05, f09 | O |
| t_vo_03 | volcano | (−60,−20) | hiker | 3 | 35–36 | f07, f08, f05 | O |
| t_hall5_01 | trial_5 | (−8,10) | hall_tuner | 3 | 33–34 | f02, f05 | M |
| t_hall5_02 | trial_5 | (8,0) | hall_tuner | 3 | 34–35 | f08, f02 | M |
| t_cantor_5 | trial_5 | (0,−20) | Bastian | 5 | 34, 35, 35, 36, 37 | c05, c14, c05, c15, c06 ace | M |
| t_r5_01 | route_5 | (15,70) | pilgrim | 3 | 37–38 | f10, f06 | O |
| t_r5_02 | route_5 | (−20,30) | ski_patrol | 3 | 38–39 | f06, f07 | O |
| t_r5_03 | route_5 | (20,−20) | pilgrim | 3 | 39–40 | f09, f10, f05 | O |
| t_rival_5 | route_5 | (0,−70) | Cass | 5 | 38, 38, 38, 39, 40 | c21, c15, c18, c26, RS3 ace | M |
| t_sp_01 | snowpeak | (−30,75) | ski_patrol | 3 | 40–41 | f06, f07 | O |
| t_sp_02 | snowpeak | (−40,10) | aurora_chaser | 3 | 41–42 | f10, f06 | O |
| t_sp_03 | snowpeak | (60,0) | aurora_chaser | 3 | 42–43 | f06, f09, f10 | O |
| t_hall6_01 | trial_6 | (−8,10) | hall_tuner | 3 | 40–41 | f06 | M |
| t_hall6_02 | trial_6 | (8,0) | hall_tuner | 3 | 41–42 | f06, f10 | M |
| t_cantor_6 | trial_6 | (0,−20) | Isaure | 6 | 41, 42, 43, 43, 44, 45 | c17, c15, c09, c18, c24, c18 ace | M |
| t_still_08 | snowpeak | (−10,−50) | stillmark_engineer | 3 | 42–43 | f08, f09, f06 | M |
| t_odile | snowpeak | (0,−84) | Odile | 4 (phase A 3 + phase B 1; systems §14.3) | A: 42, 43, 44. B: 46 | A: c24, c29, c26; B: ace c27 Emberfold | M |
| t_rival_6 | league | (0,10) | Cass | 6 | 45, 46, 46, 46, 47, 48 | c21, c15, c18, c27, c12, RS3 ace | M |
| t_champion | league | (0,−20) | Rhea | 6 | 47, 47, 48, 48, 49, 50 | c12, c24, c21, c15, c18, ace c30 Coronaleen | M |
| t_rival_post | town_1 | (5,−35) | Cass | 6 | 55 | mixed | O (post-game) |

**Totals:**
- 71 trainers.
- 37 mandatory: 6 rivals, 6 Cantors, 12 hall Tuners, 8 Stillmark engineers, 3 admin battles, Odile, and the champion.
- 34 optional: 33 route trainers plus the post-game rematch.

**Chapter trainer count for the systems economy re-run (D23).** Optional ones are in brackets:
- ch1: 1 [3]
- ch2: 5 [3]
- ch3: 4 [4]
- ch4: 3 [3]
- ch5: 3 [4]
- ch6: 3 [4]
- ch7: 3 [0]
- ch8: 4 [3]
- ch9: 3 [3]
- ch10: 1 [3]
- ch11: 5 [3]
- ch12: 2 [0]

---

## 3. Gates and no-softlock proof

### 3.1 Gate list

| Gate | Where | Kind | Requirement | Satisfied at |
|---|---|---|---|---|
| E1 | town_1 N | flag | `flag_starter_chosen` | ev_02 |
| **R1** | forest (0,70) | **mandatory Rootcall** | verdant kin + `flag_resonance_tutorial` | ev_04/ev_06 |
| E3 | forest N | flag | `flag_trial_1_cleared` | ev_08 |
| trial_1 door | forest | flag | `flag_stillmark_first_seen` | ev_07 |
| trial_2 door | town_2 | flag | `flag_rival_2_done` | ev_09 |
| E5 | town_2 W | flag | `flag_trial_2_cleared` | ev_10 |
| **R2** | cave (0,−10) | **mandatory Heave** | stone kin + `i_keynote_1` | ev_11 |
| E6 | cave NW | flag | `flag_cave_miners_saved` | ev_12 |
| E7 | route_3 E | flag | `flag_rival_3_done` | ev_14 |
| trial_3 door | lake | flag | `flag_rival_3_done` | ev_14 |
| E8 | lake N causeway | flag | `flag_trial_3_cleared` | ev_15 |
| E9 | town_3 W | flag | `flag_trial_4_cleared` | ev_16 |
| **R3** | route_4 (20,5) | **mandatory Gust** | gale kin + `i_keynote_3` | ev_17 |
| E10 | route_4 W | flag | `flag_rival_4_done` | ev_20 |
| trial_5 door | volcano | flag + vent | `flag_rival_4_done`; vent cooled by Swell **or** the steward talk | ev_20 |
| E11 | town_3 N | flag | `flag_trial_5_cleared` | ev_21 |
| E12 | route_5 N | flag | `flag_odile_revealed` | ev_23 |
| **R4** | snowpeak (0,40) | **mandatory Rime** | frost kin + `i_keynote_5` | ev_24 |
| summit path | snowpeak (0,−60) | flag | `flag_trial_6_cleared` | ev_25 |
| E13 | snowpeak N lift | flag + items | `flag_nullbell_broken` ∧ 6 Keynotes | ev_27 |

### 3.2 Proof for the four mandatory nodes (CD R1–R7)

| Node | Register unlocked before the node | Type obtainable before the node (day-clear weight > 0, zones reachable without crossing it) | Steward |
|---|---|---|---|
| R1 Rootgate | tutorial (ev_04, town_1) | **Static c10 Dozebud Lv 4 (guaranteed, route_1 stile).** Also c10 route_1: day 35 / night 20. | npc_steward_1 (8,76) |
| R2 Heave | Keynote 1 (forest) | c13 Rollith: route_1 day 15; forest day 10; route_2 day 30 / night 25; cave upper 40 (time-invariant, before the node) | npc_steward_2 (6,−4) |
| R3 Gust | Keynote 3 (lake) | c19 Gustling: route_1 day 35 / night 10; forest day 20 / night 5; route_2 day 25; route_4 lower slope day 10. c20 Whirlseed: route_2, route_3, lake, route_4 lower day 30 / night 15 | npc_steward_3 (26,10) |
| R4 Rime | Keynote 5 (volcano) | c16 Rimelet / c17 Sleetribbon: route_5 day 20/25, night 15/20; snowpeak glacier foot, below the falls | npc_steward_4 (8,46) |

**Additional guarantees:**
1. Any troupe member counts, fainted or not (R3; D2). HP never blocks a node.
2. Stewards cover even a troupe with none of the needed type (R1).
3. Mandatory transformations are permanent and committed together with their flag (R4).
4. No mandatory node sits on a return path (R5):
   - Everything south of R1 is reachable without it.
   - Gust has a return vent at (8,5).
   - The cave Heave passage stays open.
   - The Rime stairs stay frozen.
5. Waystones never need a type (R6).
6. Starter types are on no mandatory node (D2). The volcano vent has a talk alternative. Hall gimmicks have lever alternatives.
7. Capture devices never run out (systems §15.3): 0 devices and less than 200 money means the Hearthkeeper gives 5 `i_chime_reed`.
8. No mandatory purchase exists, and no level gate exists (systems §15.12–13).
9. Validator (QA D-35 / CD R7) must hold: for every mandatory node, the type appears in the union of encounter tables of zones reachable before the node, **or** a Steward exists. Here both hold.

---

## 4. Encounters

### 4.1 Table rules
- **Weights:** runtime uses weights. Each wild zone has a Day and a Night base table, each summing to 100. The day-clear column is the "base table" for QA D-06.
- **Weather multipliers** use the **primary** type (the family type) and are renormalized:
  - rain: verdant ×1.5, toxin ×1.5, gale ×0.5, lumen ×0.75
  - fog: shade ×2.0, lumen ×1.5, gale ×0.5
  - snow: frost ×2.0, verdant ×0.25, toxin ×0.5
  - sunlight: stone ×1.25, gale ×1.25, shade ×0.5, frost ×0.5
  - clear: ×1
- **Probabilities** = weight / Σweight. They are rounded to 3 decimals by largest remainder, so each column prints exactly 1.000. A script generated them from the weights. Validators recompute them within ±0.001.
- **Level:** uniform integer in [lo, hi].
- **Evolution-level rule (D23), enforced by the generator:** no stage-2 appears below its family's 1→2 level, and no stage-3 below its 2→3 level (D11).
  - f04 16/32; f05 20/36; f06 22/38; f07 14/30; f08 18/34; f09 24/40; f10 26/44.
- **Attunement** has no effect on encounter weights.

### 4.2 Roaming (D21; rendering §2.6)
- **Cap:** `maxWild = 6` in every wild zone on every quality profile. The cave splits it 3 upper + 3 lower, and the lower 3 activate after `flag_cave_heave_gate`.
- **On zone entry:** 4 creatures spawn immediately at wild-region cells ≥ 25 m from the arrival spawn.
- **Refill, contact, lock, grace:** spawn distance ≥ 20 m and outside the frustum; respawn 15–30 s after a despawn; single-encounter lock; 3 s cooldown plus 3 m grace. All of these are exactly rendering §2.6.
- **Two contacts in one frame:** the nearest wins. The other creature plays a startle and flees 12 m (QA U-ENC-02).
- **Species and level** come from `sim/world/encounters.ts` with the gameplay RNG. Position uses the presentation RNG.
- **Static encounter:** `st_route_1_dozebud` does not count against the cap.

### 4.3 Encounter tables

#### route_1

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|---|
| c10 | Dozebud | verdant (1) | 3–6 | 35 | 20 | 0.350 | 0.545 | 0.200 | 0.273 |
| c13 | Rollith | stone (1) | 4–6 | 15 | — | 0.150 | 0.156 | — | — |
| c19 | Gustling | gale (1) | 3–6 | 35 | 10 | 0.350 | 0.182 | 0.100 | 0.045 |
| c22 | Ringdrip | toxin (1) | 4–6 | — | 20 | — | — | 0.200 | 0.273 |
| c25 | Snipling | shade (1) | 4–7 | — | 30 | — | — | 0.300 | 0.273 |
| c28 | Dawnfry | lumen (1) | 4–7 | 15 | 20 | 0.150 | 0.117 | 0.200 | 0.136 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### forest

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c10 | Dozebud | verdant (1) | 7–11 | 35 | 20 | 0.350 | 0.461 | 0.359 | 0.200 | 0.258 | 0.143 |
| c13 | Rollith | stone (1) | 7–10 | 10 | — | 0.100 | 0.088 | 0.102 | — | — | — |
| c19 | Gustling | gale (1) | 7–10 | 20 | 5 | 0.200 | 0.088 | 0.103 | 0.050 | 0.021 | 0.018 |
| c22 | Ringdrip | toxin (1) | 7–10 | 20 | 25 | 0.200 | 0.264 | 0.205 | 0.250 | 0.323 | 0.178 |
| c25 | Snipling | shade (1) | 8–11 | — | 35 | — | — | — | 0.350 | 0.301 | 0.500 |
| c28 | Dawnfry | lumen (1) | 8–11 | 15 | 15 | 0.150 | 0.099 | 0.231 | 0.150 | 0.097 | 0.161 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_2

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|---|
| c10 | Dozebud | verdant (1) | 12–15 | 15 | — | 0.150 | 0.225 | — | — |
| c11 | Lullstalk | verdant·toxin (2) | 16 | 5 | 5 | 0.050 | 0.075 | 0.050 | 0.067 |
| c13 | Rollith | stone (1) | 11–15 | 30 | 25 | 0.300 | 0.300 | 0.250 | 0.225 |
| c19 | Gustling | gale (1) | 11–13 | 25 | — | 0.250 | 0.125 | — | — |
| c20 | Whirlseed | gale·verdant (2) | 14–16 | 10 | — | 0.100 | 0.050 | — | — |
| c22 | Ringdrip | toxin (1) | 12–15 | 15 | 25 | 0.150 | 0.225 | 0.250 | 0.337 |
| c25 | Snipling | shade (1) | 12–15 | — | 30 | — | — | 0.300 | 0.270 |
| c28 | Dawnfry | lumen (1) | 12–15 | — | 15 | — | — | 0.150 | 0.101 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_3

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c11 | Lullstalk | verdant·toxin (2) | 19–23 | 15 | 10 | 0.150 | 0.186 | 0.158 | 0.100 | 0.124 | 0.073 |
| c13 | Rollith | stone (1) | 19–20 | 10 | — | 0.100 | 0.083 | 0.105 | — | — | — |
| c14 | Cairnback | stone (2) | 20–23 | 10 | 5 | 0.100 | 0.082 | 0.105 | 0.050 | 0.041 | 0.036 |
| c20 | Whirlseed | gale·verdant (2) | 19–23 | 15 | — | 0.150 | 0.062 | 0.079 | — | — | — |
| c22 | Ringdrip | toxin (1) | 19–21 | 25 | 20 | 0.250 | 0.309 | 0.263 | 0.200 | 0.248 | 0.146 |
| c23 | Brineloop | toxin·water (2) | 19–23 | 20 | 20 | 0.200 | 0.247 | 0.211 | 0.200 | 0.247 | 0.145 |
| c25 | Snipling | shade (1) | 19–23 | — | 30 | — | — | — | 0.300 | 0.247 | 0.436 |
| c28 | Dawnfry | lumen (1) | 20–23 | 5 | 15 | 0.050 | 0.031 | 0.079 | 0.150 | 0.093 | 0.164 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### lake

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c11 | Lullstalk | verdant·toxin (2) | 22–26 | 20 | 10 | 0.200 | 0.261 | 0.195 | 0.100 | 0.133 | 0.069 |
| c14 | Cairnback | stone (2) | 22–26 | 10 | — | 0.100 | 0.087 | 0.098 | — | — | — |
| c20 | Whirlseed | gale·verdant (2) | 22–26 | 15 | — | 0.150 | 0.065 | 0.073 | — | — | — |
| c22 | Ringdrip | toxin (1) | 22–23 | 10 | 5 | 0.100 | 0.130 | 0.098 | 0.050 | 0.067 | 0.035 |
| c23 | Brineloop | toxin·water (2) | 22–26 | 25 | 25 | 0.250 | 0.326 | 0.244 | 0.250 | 0.334 | 0.172 |
| c25 | Snipling | shade (1) | 22–24 | — | 15 | — | — | — | 0.150 | 0.133 | 0.207 |
| c26 | Marionyx | shade (2) | 24–27 | — | 15 | — | — | — | 0.150 | 0.133 | 0.207 |
| c28 | Dawnfry | lumen (1) | 22–25 | 15 | 20 | 0.150 | 0.098 | 0.219 | 0.200 | 0.133 | 0.207 |
| c29 | Lumarlin | lumen (2) | 26–27 | 5 | 10 | 0.050 | 0.033 | 0.073 | 0.100 | 0.067 | 0.103 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_4

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|---|
| c11 | Lullstalk | verdant·toxin (2) | 28–31 | 10 | — | 0.100 | 0.164 | — | — |
| c14 | Cairnback | stone (2) | 28–32 | 20 | 10 | 0.200 | 0.219 | 0.100 | 0.103 |
| c19 | Gustling | gale (1) | 28–29 | 10 | — | 0.100 | 0.055 | — | — |
| c20 | Whirlseed | gale·verdant (2) | 28–29 | 30 | 15 | 0.300 | 0.164 | 0.150 | 0.077 |
| c21 | Samarch | gale·verdant (3) | 30–32 | 5 | — | 0.050 | 0.028 | — | — |
| c23 | Brineloop | toxin·water (2) | 28–32 | 20 | 20 | 0.200 | 0.329 | 0.200 | 0.308 |
| c25 | Snipling | shade (1) | 28–29 | — | 10 | — | — | 0.100 | 0.103 |
| c26 | Marionyx | shade (2) | 28–32 | — | 25 | — | — | 0.250 | 0.256 |
| c28 | Dawnfry | lumen (1) | 28–30 | — | 5 | — | — | 0.050 | 0.038 |
| c29 | Lumarlin | lumen (2) | 28–32 | 5 | 15 | 0.050 | 0.041 | 0.150 | 0.115 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### volcano

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day sunlight | Day fog | Night clear | Night sunlight | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c14 | Cairnback | stone (2) | 32–35 | 30 | 20 | 0.300 | 0.323 | 0.353 | 0.200 | 0.274 | 0.154 |
| c15 | Lodestodon | stone·electric (3) | 36–37 | 5 | 5 | 0.050 | 0.054 | 0.059 | 0.050 | 0.068 | 0.039 |
| c20 | Whirlseed | gale·verdant (2) | 32–33 | 15 | — | 0.150 | 0.161 | 0.088 | — | — | — |
| c21 | Samarch | gale·verdant (3) | 32–36 | 15 | 10 | 0.150 | 0.161 | 0.088 | 0.100 | 0.137 | 0.038 |
| c23 | Brineloop | toxin·water (2) | 32–34 | 30 | 20 | 0.300 | 0.258 | 0.353 | 0.200 | 0.219 | 0.154 |
| c24 | Drapetide | toxin·water (3) | 34–37 | 5 | 10 | 0.050 | 0.043 | 0.059 | 0.100 | 0.110 | 0.077 |
| c26 | Marionyx | shade (2) | 32–37 | — | 35 | — | — | — | 0.350 | 0.192 | 0.538 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_5

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day snow | Day fog | Night clear | Night snow | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c14 | Cairnback | stone (2) | 37–39 | 10 | — | 0.100 | 0.069 | 0.098 | — | — | — |
| c15 | Lodestodon | stone·electric (3) | 37–41 | 10 | — | 0.100 | 0.069 | 0.097 | — | — | — |
| c16 | Rimelet | frost (1) | 37–39 | 20 | 15 | 0.200 | 0.276 | 0.195 | 0.150 | 0.222 | 0.102 |
| c17 | Sleetribbon | frost (2) | 37–41 | 25 | 20 | 0.250 | 0.345 | 0.244 | 0.200 | 0.297 | 0.136 |
| c21 | Samarch | gale·verdant (3) | 37–41 | 15 | 5 | 0.150 | 0.103 | 0.073 | 0.050 | 0.037 | 0.017 |
| c25 | Snipling | shade (1) | 37–38 | — | 10 | — | — | — | 0.100 | 0.074 | 0.135 |
| c26 | Marionyx | shade (2) | 37–39 | — | 25 | — | — | — | 0.250 | 0.185 | 0.339 |
| c27 | Emberfold | shade·fire (3) | 40–41 | — | 5 | — | — | — | 0.050 | 0.037 | 0.068 |
| c29 | Lumarlin | lumen (2) | 37–41 | 20 | 20 | 0.200 | 0.138 | 0.293 | 0.200 | 0.148 | 0.203 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### snowpeak

| Id | Species | Type (stage) | Lv | Day wt | Night wt | Day clear | Day snow | Day fog | Night clear | Night snow | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c15 | Lodestodon | stone·electric (3) | 40–44 | 10 | — | 0.100 | 0.067 | 0.095 | — | — | — |
| c16 | Rimelet | frost (1) | 40–41 | 15 | 10 | 0.150 | 0.200 | 0.143 | 0.100 | 0.138 | 0.070 |
| c17 | Sleetribbon | frost (2) | 40–44 | 30 | 25 | 0.300 | 0.400 | 0.286 | 0.250 | 0.345 | 0.175 |
| c18 | Borealoop | frost·lumen (3) | 40–44 | 5 | 10 | 0.050 | 0.067 | 0.048 | 0.100 | 0.138 | 0.070 |
| c21 | Samarch | gale·verdant (3) | 40–44 | 15 | — | 0.150 | 0.100 | 0.071 | — | — | — |
| c26 | Marionyx | shade (2) | 40–41 | — | 15 | — | — | — | 0.150 | 0.103 | 0.210 |
| c27 | Emberfold | shade·fire (3) | 40–44 | — | 15 | — | — | — | 0.150 | 0.103 | 0.211 |
| c29 | Lumarlin | lumen (2) | 40–44 | 20 | 20 | 0.200 | 0.133 | 0.286 | 0.200 | 0.138 | 0.211 |
| c30 | Coronaleen | lumen·shade (3) | 44 | 5 | 5 | 0.050 | 0.033 | 0.071 | 0.050 | 0.035 | 0.053 |
| **Sum** | | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### cave — upper galleries (east, before the Heave gate) — time- and weather-invariant

| Id | Species | Type (stage) | Lv | Weight | Probability |
|---|---|---|---|---|---|
| c13 | Rollith | stone (1) | 16–19 | 40 | 0.400 |
| c22 | Ringdrip | toxin (1) | 16–17 | 20 | 0.200 |
| c23 | Brineloop | toxin·water (2) | 18–19 | 15 | 0.150 |
| c25 | Snipling | shade (1) | 16–19 | 25 | 0.250 |
| **Sum** | | | | 100 | **1.000** |

#### cave — lower galleries (west, behind the Heave gate) — time- and weather-invariant

| Id | Species | Type (stage) | Lv | Weight | Probability |
|---|---|---|---|---|---|
| c13 | Rollith | stone (1) | 19 | 25 | 0.250 |
| c14 | Cairnback | stone (2) | 20–21 | 25 | 0.250 |
| c22 | Ringdrip | toxin (1) | 19 | 10 | 0.100 |
| c23 | Brineloop | toxin·water (2) | 19–21 | 15 | 0.150 |
| c25 | Snipling | shade (1) | 19–21 | 25 | 0.250 |
| **Sum** | | | | 100 | **1.000** |

---

## 5. Obtainability (all 30; QA D-25 runs per starter choice)

| Id | Species | Family / stage | Types | How obtained | Earliest |
|---|---|---|---|---|---|
| c01 | Fizzkit | f01 / 1 | electric | Starter; else leftover (ch8, Lv 25) or second clutch (after trial_5, Lv 30) per §2.6 | ch1 / ch8 / ch9+ |
| c02 | Crackleap | f01 / 2 | electric | evolve c01 at 16 | — |
| c03 | Tempestrel | f01 / 3 | electric·gale | evolve c02 at 34 | — |
| c04 | Wickwool | f02 / 1 | fire | Starter / leftover / second clutch | ch1 / ch8 / ch9+ |
| c05 | Kilnhorn | f02 / 2 | fire | evolve 16 | — |
| c06 | Magmouflon | f02 / 3 | fire·stone | evolve 34 | — |
| c07 | Rippleback | f03 / 1 | water | Starter / leftover / second clutch | ch1 / ch8 / ch9+ |
| c08 | Tidesleek | f03 / 2 | water | evolve 16 | — |
| c09 | Floeguard | f03 / 3 | water·frost | evolve 34 | — |
| c10 | Dozebud | f04 / 1 | verdant | static (route_1); wild route_1, forest, route_2 | ch1 |
| c11 | Lullstalk | f04 / 2 | verdant·toxin | wild route_2 (Lv 16), route_3, lake, route_4; evolve 16 | ch3 |
| c12 | Belladrowse | f04 / 3 | verdant·toxin | **evolution only** (32) | — |
| c13 | Rollith | f05 / 1 | stone | wild route_1, forest, route_2, route_3, cave | ch1 |
| c14 | Cairnback | f05 / 2 | stone | wild cave lower, route_3, lake, route_4, volcano, route_5; evolve 20 | ch4 |
| c15 | Lodestodon | f05 / 3 | stone·electric | wild volcano (36–37), route_5, snowpeak; evolve 36 | ch9 |
| c16 | Rimelet | f06 / 1 | frost | wild route_5, snowpeak | ch10 |
| c17 | Sleetribbon | f06 / 2 | frost | wild route_5, snowpeak; evolve 22 | ch10 |
| c18 | Borealoop | f06 / 3 | frost·lumen | wild snowpeak; evolve 38 | ch11 |
| c19 | Gustling | f07 / 1 | gale | wild route_1, forest, route_2, route_4 | ch1 |
| c20 | Whirlseed | f07 / 2 | gale·verdant | wild route_2 (14–16), route_3, lake, route_4, volcano; evolve 14 | ch3 |
| c21 | Samarch | f07 / 3 | gale·verdant | wild route_4 (30–32), volcano, route_5, snowpeak; evolve 30 | ch8 |
| c22 | Ringdrip | f08 / 1 | toxin | wild route_1 (night), forest, route_2, cave, route_3, lake | ch1 |
| c23 | Brineloop | f08 / 2 | toxin·water | wild cave, route_3, lake, route_4, volcano; evolve 18 | ch4 |
| c24 | Drapetide | f08 / 3 | toxin·water | wild volcano (34–37); evolve 34 | ch9 |
| c25 | Snipling | f09 / 1 | shade | wild route_1 (night), forest (night), route_2 (night), cave (any time), route_3, lake, route_4, route_5 | ch1 |
| c26 | Marionyx | f09 / 2 | shade | wild lake (night, 24–27), route_4, volcano, route_5, snowpeak; evolve 24 | ch6 |
| c27 | Emberfold | f09 / 3 | shade·fire | wild route_5 (night, 40–41), snowpeak (night); evolve 40 | ch10 |
| c28 | Dawnfry | f10 / 1 | lumen | wild route_1, forest, route_2 (night), route_3, lake, route_4 | ch1 |
| c29 | Lumarlin | f10 / 2 | lumen | wild lake (26–27), route_4, route_5, snowpeak; evolve 26 | ch6 |
| c30 | Coronaleen | f10 / 3 | lumen·shade | wild snowpeak (Lv 44, weight 5); evolve 44, or `i_evo_prism` on c29 at any level | ch10 (prism) |

**Coverage.** Every wild line's stage 1 (c10, c13, c16, c19, c22, c25, c28) is catchable. c12 is evolution-only. c25 is time-invariant in the cave, so no line needs night play.

**Water, fire and electric outside the starters** (creatures.md secondaries):
- water: c23 (from Lv 18, cave) and c24
- fire: c27 (Lv 40+)
- electric: c15 (Lv 36+)

**Dawn Prism (`i_evo_prism`) sources:**
- a guaranteed visible pickup on route_5 (−30,−60) (ch10, at about Lv 38, which is before 44);
- the Galewick Chandlery (3000);
- q_side_kinsong_survey stage 2 does not give one.

---

## 6. Quests

Main quests use CD ids `q_main_ch01..ch12`, and each completes on its chapter's last flag. Money is **post-D23 scaling**: main rewards ×¼ and side rewards ×½ of the v1 values. Systems v2 may retune them.

| Id | Prereq | Steps (flags, CD §4) | Reward |
|---|---|---|---|
| q_main_ch01 | new game | starter → rival 1 → tutorial → capture tutorial → route_1 Waystone | starter, Ledger, 5 `i_chime_reed`, 3 `i_salve_1` |
| q_main_ch02 | `flag_capture_tutorial` | Rootgate → Stillmark sighting → trial_1 | `i_keynote_1`, `i_disc_04`, 200 |
| q_main_ch03 | `flag_trial_1_cleared` | rival 2 → trial_2 | `i_keynote_2`, `i_disc_05`, 375 |
| q_main_ch04 | `flag_trial_2_cleared` | Heave gate → Brann → miners saved | 500, `i_chime_brass` ×3 |
| q_main_ch05 | `flag_cave_miners_saved` | Vey 1 → fen stone restored → rival 3 | 500 |
| q_main_ch06 | `flag_rival_3_done` | trial_3 | `i_keynote_3`, `i_disc_02`, 625 |
| q_main_ch07 | `flag_trial_3_cleared` | trial_4 → Odile named | `i_keynote_4`, `i_disc_07`, 875 |
| q_main_ch08 | `flag_trial_4_cleared` | Gust ascent → Stillhouse → Vey 2 → leftover rescued → rival 4 | `i_disc_09`, 1000 |
| q_main_ch09 | `flag_rival_4_done` | vent → trial_5 | `i_keynote_5`, `i_disc_16`, 1125 |
| q_main_ch10 | `flag_trial_5_cleared` | rival 5 → Odile revealed | 750 |
| q_main_ch11 | `flag_odile_revealed` | Rime falls → trial_6 → Brann → Odile → Null Bell | `i_keynote_6`, `i_disc_14`, 2000, `i_chime_crown` |
| q_main_ch12 | `flag_nullbell_broken` ∧ all trials | Spire open → rival 6 → Concordant | 0 (systems §12.4: the final quest pays nothing), credits |

| Id | Giver @ zone | Prereq | Steps | Reward |
|---|---|---|---|---|
| q_foster_leftover | Oriel, town_1 | `flag_leftover_rescued` | §2.6 | leftover starter Lv 25, `flag_leftover_obtained` |
| q_second_clutch | Oriel, town_1 | `flag_trial_5_cleared` ∧ `flag_leftover_obtained` | §2.6 | rival-line starter Lv 30, `flag_triad_complete` |
| q_side_fallen_chime | npc_villager_chime, town_1 | `flag_starter_chosen` | find `i_q_windchime` in the route_1 stream bed (−38,−20) → return | 250, `i_salve_1` ×3 |
| q_side_hollow_hum | npc_hollow_warden, forest | `flag_stillmark_first_seen` | re-wake 4 hollow trees at (−40,60), (50,30), (−75,0), (15,−10). Each accepts Rootcall, Spark, Kindle **or** an `i_q_glowcap` (4 lie visible at (−30,30), (65,45), (−65,−30), (5,55)) → return | `i_chime_brass` ×3, `i_salve_2` ×2 |
| q_side_offkey_bells | npc_bellwright, town_2 | `flag_rival_2_done` | retune 3 bells: Spark at each (−10,−30), (30,−20), (−45,−35), **or** bring 3 `i_q_clapper` from route_2 (40,70), (−40,0), (25,−40) → return | 750, `i_cure_all` ×2 |
| q_side_miners_samples | npc_foreman, cave | `flag_trial_2_cleared` | find 4 hidden crystal samples: cave (75,−40), (20,70) upper; (−75,40), (−20,−75) lower → return | `i_chime_silver` ×3, 1000 |
| q_side_kinsong_survey | npc_marra | `flag_rival_2_done` | stage 1: 10 species sung; stage 2: 20; stage 3: 30 | S1 `i_chime_brass` ×5; S2 **`i_disc_18`** + `i_chime_silver` ×3 + 1500; S3 Kinsong gold edging (cosmetic) + `i_chime_crown` ×2 |
| q_side_veil_tales | npc_storyteller, route_3 | `i_keynote_4` | pass 3 Veil curtains (route_3 (−60,30); cave (−80,−20) `rn_cave_05`; town_3 cellar (−35,−28)); read the tale pages → return | 1000, `i_revive_2` |
| q_side_kite_contest | npc_kitewright, town_3 | `i_keynote_3` | Gust at route_2 (30,−50), route_4 (70,−35), town_3 cliff vent (−60,−60) `rn_town_3_03` to retrieve 3 kites → return | **`i_disc_15`** (systems §12.2, ch7 town_3 side quest), 750 |
| q_side_market_courier | npc_courier, town_3 | `flag_trial_3_cleared` | deliver a parcel to npc_hk_volcano (after `flag_rival_4_done`) → return the reply | `i_chime_silver` ×5, 1250 |
| q_side_gleam_beacons | npc_beaconkeeper, lake | `i_keynote_6` | Gleam 3 shore beacons (−60,−50), (60,−20), (−40,60) (`rn_lake_03..05`) → return | `i_salve_4` ×3, 750 |
| q_side_rival_rematch | npc_cass, town_1 | `flag_game_cleared` | defeat t_rival_post | `i_chime_crown`, 1500 |

This adds cave node `rn_cave_05` (Veil, (−80,−20)) and town_3 node `rn_town_3_03` (Gust vent, (−60,−60)) to §2.7. Neither has an item reward beyond its quest. Nothing here requires real-time waits, trading, or another player.

---

## 7. Items

### 7.1 Pickups (V = visible; H = hidden, shown as a shimmer within 3 m)

Ids are `pk_<zone>_<nn>`, one-time, and saved in the collected set.

| Zone | V/H | Pos (x,z) | Item × qty |
|---|---|---|---|
| town_1 | V | (28,30) | `i_salve_1` ×2 |
| town_1 | H | (3,−2) | `i_chime_reed` ×1 |
| route_1 | V | (20,50) | `i_chime_reed` ×3 |
| route_1 | V | (−30,10) | `i_cure_poison` ×1 |
| route_1 | H | (−15,60) | coin pouch 200 |
| forest | V | (−20,50) | `i_salve_1` ×2 |
| forest | V | (50,20) | `i_cure_sleep` ×2 |
| forest | V | (−60,−20) | `i_chime_reed` ×3 |
| forest | H | (70,−10) | `i_thread` ×1 |
| route_2 | V | (−30,60) | `i_salve_2` ×1 |
| route_2 | V | (35,−10) | `i_chime_brass` ×2 |
| route_2 | H | (0,−20) | `i_revive_1` ×1 |
| town_2 | V | (−50,30) | `i_cure_all` ×1 |
| town_2 | H | (−30,−40) | coin pouch 800 |
| cave | V | (50,40) | `i_salve_2` ×2 |
| cave | V | (−10,50) | `i_chime_brass` ×2 |
| cave | V | (−60,−10) | `i_cure_all` ×1 |
| route_3 | V | (60,−20) | `i_salve_2` ×2 |
| route_3 | V | (−20,30) | `i_cure_poison` ×3 |
| route_3 | H | (10,−30) | `i_revive_1` ×1 |
| lake | V | (−50,40) | `i_salve_3` ×1 |
| lake | V | (70,30) | `i_revive_1` ×1 |
| lake | V | (−80,−60) | `i_chime_silver` ×2 |
| lake | H | (30,90) | coin pouch 800 |
| town_3 | H | (50,−50) | `i_revive_1` ×1 |
| route_4 | V | (70,30) | `i_salve_3` ×1 |
| route_4 | V | (0,20) | `i_chime_silver` ×2 |
| route_4 | V | (−40,−10) | `i_charge_1` ×1 |
| route_4 | H | (20,−40) | `i_revive_1` ×1 |
| volcano | V | (50,−10) | `i_salve_3` ×2 |
| volcano | V | (−50,20) | `i_cure_burn` ×3 |
| volcano | H | (−80,0) | coin pouch 2000 |
| route_5 | V | (30,60) | `i_salve_3` ×1 |
| route_5 | **V** | **(−30,−60)** | **`i_evo_prism` ×1 (guaranteed; systems §12.1)** |
| route_5 | H | (40,−70) | `i_charge_2` ×1 |
| snowpeak | V | (−60,50) | `i_salve_4` ×1 |
| snowpeak | V | (60,−10) | `i_revive_2` ×1 |
| snowpeak | H | (−20,70) | coin pouch 2000 |

Coin pouches are money pickups; systems §12.4 counts them unchanged, which needs `money?: number` on `PickupSpec`. Quest items (`i_q_windchime`, `i_q_glowcap` ×4, `i_q_clapper` ×3, crystal samples ×4) are new key-kind ids for `items.json` (§11 Q2).

### 7.2 Etudes / teaching discs (`i_disc_01..18`, systems v2 §12.2; each has exactly one source)

| Disc | Move | Source |
|---|---|---|
| i_disc_01 | Heat Ribbon | Knellstone Chandlery (2000) |
| i_disc_02 | Deluge Beam | trial_3 reward (Nerys, water) |
| i_disc_03 | Arc Lash | Larkhollow Chandlery after trial_1 (1500) |
| i_disc_04 | Draining Bloom | trial_1 reward (Wren, verdant) |
| i_disc_05 | Rock Tumble | trial_2 reward (Dorran Shale, stone) |
| i_disc_06 | Sleet Spray | Knellstone Chandlery (2000) |
| i_disc_07 | Razor Draft | trial_4 reward (Tamsin, gale) |
| i_disc_08 | Sludge Lob | Knellstone Chandlery (2000) |
| i_disc_09 | Umbral Pulse | Vey 2 defeat reward (ev_19, Stillhouse) |
| i_disc_10 | Prism Ray | snowpeak Gleam secret sec_24 |
| i_disc_11 | Bulwark (universal) | Larkhollow Chandlery (1500) |
| i_disc_12 | Buzz Field | Knellstone Chandlery (1500) |
| i_disc_13 | Quake Stomp | cave lower-gallery Heave secret sec_10b |
| i_disc_14 | Rime Beam | trial_6 reward (Isaure, frost); not sold |
| i_disc_15 | Stormcoil Bolt | q_side_kite_contest (ch7, Galewick) |
| i_disc_16 | Kiln Blast | trial_5 reward (Bastian, fire); not sold |
| i_disc_17 | Night Rake | Galewick cellar Veil secret sec_16 (after trial_4) |
| i_disc_18 | Radiant Mend | q_side_kinsong_survey stage 2 (Marra Aske) |

---

## 8. Environmental storytelling (character-forward, colorful)

1. **Silenced stones.** A Chordstone under a Stillmark coil-rig renders its surroundings at reduced saturation, with low-passed ambience.
   - Data per site: center and radius. Sites: forest (25,−25) r 25; cave (−50,−55) r 30; route_3 (−20,0) r 30; the `stillhouse` interior (whole scene); summit (0,−84) r 60. There is also a 0.2 region-wide mute until `flag_nullbell_broken`.
   - Restoring a stone plays a radial color wave (0.8 s), and the zone melody returns.
2. **The survey guild (D6).** Stillmark sites look like tidy engineering jobs rather than lairs: tripods, clipboards on posts, coil-rigs, brass ear-muff helmets on hooks, coil lanterns with the guild mark etched on the glass, neatly stacked felt baffles, and "Stone under service" signboards. Engineers are polite, busy, and slightly condescending, and they explain their measurements.
   - The strays pens (cave (−65,−40), Stillhouse (0,−15)) show the cost of the plan: frightened kin who ran when their stones went quiet, fed and fenced "for safekeeping".
   - Nothing is stolen from people.
3. **Kin at work and play.** Each town has at least 6 ambient kin vignettes with clear silhouettes and one exaggerated emotional pose each:
   - Larkhollow: Dozebud napping in orchard crates; Gustling carrying chime-strings.
   - Knellstone: Rollith rolling quarry spoil; Cairnback hauling a cart.
   - Galewick: Whirlseed turning sail-mills; Dawnfry lighting the market at dusk.
4. **Cass's trail.** Chalk doodles of Cass's starter appear one zone ahead of each rival battle, at the route_1 Chordstone, the route_2 cairn, the route_3 boardwalk, and the Stillhouse gate. After rival 4, the doodles show both starters side by side.
5. **Landmark sightlines.** Each is a far-LOD silhouette:
   - the Great Hollow Tree, from route_1's north end;
   - the Knell towers, from route_2;
   - the Mere Hall piles, from route_3's east end;
   - Galewick's sails, from the lake;
   - Cindral's glow, from Galewick at night;
   - the Hoarcrown aurora, from every northern zone.
6. **Weather mood.**
   - Rain makes Murmurwood's lantern fungus glow brighter.
   - Fog in Sallowfen brings out the frogsong layer and the storyteller's shadow puppets.
   - Snow on Hoarcrown hums in the aurora music layer.

---

## 9. Pacing (estimates, not measured; CD §4 chapter budget)

| Ch | Zones | Estimate |
|---|---|---|
| 1 | town_1, route_1 | 40 m |
| 2 | route_1, forest, trial_1 | 50 m |
| 3 | route_2, town_2, trial_2 | 55 m |
| 4 | cave | 40 m |
| 5 | route_3 | 40 m |
| 6 | lake, trial_3 | 50 m |
| 7 | town_3, trial_4 | 45 m |
| 8 | route_4 (Stillhouse) | 55 m |
| 9 | volcano, trial_5 | 50 m |
| 10 | route_5 | 35 m |
| 11 | snowpeak, trial_6 | 60 m |
| 12 | league | 40 m |
| **Total** | | **≈ 9 h 20 m critical path** (estimate); optional content adds ≈ 1.5–3 h |

---

## 10. Acceptance criteria

1. **Zone content.** Zone JSON (`ZoneSpec`) exists for the 14 exterior zones, the 6 hall interiors and `stillhouse`. Sizes, exits, spawn ids and coordinates, waystones, Hearthrests, and at least one `battleStages` entry per zone must match §1.3–§1.4 and §2.4.
2. **Graph.** Every exit has a reciprocal exit. The one-sided shortcuts E14/E15 are declared. A BFS from `town_1`, applying CD §4.2 flags in chapter order, reaches every zone and hall door. With no flags set, only town_1 is reachable.
3. **Mandatory gates.**
   - Exactly 4 nodes are marked `mandatory: true`: rn_forest_01, rn_cave_01, rn_route_4_01, rn_snowpeak_01.
   - Each has a Steward within 15 m.
   - Each type is in a reachable encounter table before its node (QA D-35 / CD R7), for all 3 starter choices.
   - No starter type is on a mandatory node.
4. **Encounter tables.** Each time band sums to 100 per zone. Recomputed probabilities match §4.3 within ±0.001. No stage-2/3 appears below its evolution level (D23). maxWild = 6 in every zone.
5. **Obtainability.** D-25 passes for each starter choice. Leftover and rival-line mapping follows §2.6.
6. **Items.** Every referenced item id exists in `items.json` (plus the listed quest-item additions). `i_disc_01..18` each have exactly one source. `i_evo_prism` has a guaranteed pickup.
7. **Trainers.** Trainer ids, counts and levels match §2.9. The 17 story battles match systems v2 §14.2 exactly: Cantor aces 12/17/25/30/37/45, Odile 46, champion 50, 6 rival battles.
8. **Quests.** Every quest prerequisite references an existing flag. No real-time wait or multiplayer dependency exists (QA D-36). The Swell 60 s reset and Wick's rotation are clock-free for completion.
9. **Playtime.** Playtime is labeled "estimate" until playtested.

## 11. Dependencies, risks, unresolved questions

**Dependencies:**
- CD: dialogue for all world NPCs; the hall gimmick lever alternatives (§1.4); the league Hearthrest addition.
- Systems v2: trainer counts per chapter (§2.9 totals) for the economy re-run; team species within the listed families; money scaling.
- Creatures: final species names (D7 applied here); body scale → contact radius.
- Rendering: `battleStages`, wild regions, the ceiling-shell cave (D17), cliff and vent transitions; the saturation mute shader as optional polish (fallback: no mute).
- QA: D-05/D-06/D-25/D-30..D-36 against this data.

**Risks:**

| Risk | Mitigation |
|---|---|
| Linear chain reduces loops | Optional tunnel (E14) and lake shortcut (E15) |
| Frost is available only from ch10, just before the Rime gate | Stewards; guaranteed weights in route_5 day and night |
| Gift starters arrive above their evolution level and evolve immediately | The player can cancel or defer (systems §8.3); this is flavorful ("it grew up in the pen") |
| 71 trainers vs the systems economy | Chapter counts supplied; systems v2 re-runs |
| Evolution-rule tightness leaves few stage-2s early | Accepted; stage-2 variety arrives from ch3 |

**Unresolved questions:**
1. `items.json` must still apply the systems §12.1 rename (`i_repel_1/2` → `i_hush_1/2`, `i_escape` → `i_thread`); this document already uses the new ids.
2. Quest key items (`i_q_windchime`, `i_q_glowcap`, `i_q_clapper`, crystal samples) need adding to `items.json`, and `PickupSpec` needs a `money` field for coin pouches.
3. Is the league landing Hearthrest acceptable to CD? It is not in the CD §2.4 list.
4. Route_5's fixed blue-hour lighting vs clock-based encounter bands: is this acceptable to CD?
