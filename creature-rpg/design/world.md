# World Design — region, zones, progression, encounters, quests

Owner: World Designer. Status: v1 design spec (not implemented, not playtested). Binding inputs: `design/MASTER_PROMPT.md`, `design/ANCHORS.md`.

> **Naming flag.** `design/creative_direction.md` did not exist when this document was written. Every proper name here (region, towns, landmarks, NPC names, faction name, Resonance verb names, crest names) is a **working name (WN)** for layout and dialogue-gist purposes only. Stable ids (`town_1`, `npc_mentor`, `flag_*`, `t_*`, `q_*`, `i_*`) are the contract; names are swapped in content JSON when the Creative Director publishes. Creature names other than the three starter working names (Voltra `c01`, Emberhorn `c04`, Rippleback `c07`) are referenced by id only.

---

## 0. Conventions

| Topic | Decision |
|---|---|
| Zone-local frame | Origin at the zone's rectangular center, ground reference y = 0 at the lowest walkable point unless stated. **x = east, z = south, y = up** (so north = −z, matching three.js default forward). Units: meters. |
| Zone bounds | A zone W×D occupies x ∈ [−W/2, W/2], z ∈ [−D/2, D/2]. Playable area is enclosed by natural blockers (cliffs, dense trees, water, rock walls) 4–8 m inside the bound; exits are gaps in that border. |
| Facing / yaw | Yaw in degrees, clockwise seen from above: 0 = north (−z), 90 = east (+x), 180 = south (+z), 270 = west (−x). |
| Exit trigger | Axis-aligned box 10 m wide (along the edge) × 4 m deep × 6 m tall, centered on the listed exit coordinate, touching the zone border. Entering it (in exploration state only) starts the loading transition. |
| Arrival spawn | Every exit has a paired arrival point 8 m inside the zone, facing into the zone. Arrival point and a 25 m radius around it are kept free of roaming wild spawns and trainer sight-lines. |
| Interiors | Trial venues are separate interior scenes (`trial_1`..`trial_6`), 40×60 m, door in host zone. Healing houses and shops are **not** separate scenes: they are open-front kiosks/buildings in the town scene (one fewer loading transition; interaction by counter trigger). The champion venue is the extra zone `league` (documented below, allowed by ANCHORS). |
| Time of day | In-game clock: 1 real second = 1 in-game minute (24-minute real day). **Day** 06:00–17:59, **Night** 18:00–05:59. New game starts 08:00. At any healing point the player can "Rest until 06:00" or "Rest until 18:00" (instant, fade to black, heals party). No content requires waiting in real time. |
| Weather | Per wild zone, one of {clear, rain, fog, snow} as listed per zone. Rolled on zone load and on each day/night band change with the save's seeded RNG: `seed = hash(saveSeed, zoneId, dayIndex, band)`, so reloading does not re-roll. Resting also advances the band and therefore re-rolls. Towns/league have cosmetic weather only (no encounters). Cave is fixed "none". |
| Resonance | Working model: a field action is performed on a marked object if (a) the action category is unlocked (§2.3) and (b) the **lead** creature (party slot 1, not fainted) has the matching type in either type slot. If the lead does not match but another non-fainted party member does, the prompt offers a one-button "Let <name> lead" swap. Creative Director owns final names/visuals. |

### Working-name table (all WN, pending creative_direction.md)

| Id | WN | Id | WN |
|---|---|---|---|
| region | the Chime Vale | `route_4` | Ashen Switchback |
| `town_1` | Kettlebrook | `volcano` | Mount Kiln |
| `route_1` | Meadowline Path | `route_5` | Rimewind Pass |
| `forest` | Lanternmoss Wood | `snowpeak` | Aurora Crown |
| `route_2` | Pebblerun Trail | `league` | Chorus Spire |
| `town_2` | Pinwheel Rise | antagonist faction | the Hush |
| `route_3` | Hollowstep Road | Resonance device (key item) | Tuning Fork (`i_key_tuner`) |
| `cave` | Geode Hollows | trial reward | Crest (`i_crest_1`..`i_crest_6`) |
| `lake` | Glasswater Lake | fast-travel node | Waystone (`ws_*`) |
| `town_3` | Crossvale | healing building | Tending House |

---

## 1. Region map

### 1.1 ASCII map (north up; not to scale; `==` normal exit, `##` gated exit, `..` secret/optional link, `[T#]` trial venue, `[H]` healing, `[W]` waystone)

```
                                ( league )  Chorus Spire  [champion] [H][W]
                                    ##   G12: flag_faction_boss_defeated + 6 crests
                                ( snowpeak ) Aurora Crown  [T6] [H][W]
                                    ##   G11: Illuminate (ice tunnel, inside snowpeak)
                                    ||
                                ( route_5 ) Rimewind Pass
                                    ##   G10: Freeze (river, inside route_5)
                                    ##   G9 : Dissolve (rust-lock, town_3 north gate)
( volcano )==( route_4 )========( town_3 ) Crossvale [H][W] shop T3
 Mount Kiln   Ashen Switchback      ||
 [T5][H][W]   G8: Updraft gap       ##   G6: Freeze (outflow channel, lake north)
                                ( lake ) Glasswater  [T4 on island][H][W]
                                    ##   G5: Shift (boulder, town_2 north-east)
( cave )=====( route_3 )##======( town_2 ) Pinwheel Rise [T2][H][W] shop T2
 Geode        Hollowstep  G3: Updraft (Gust Gap, town_2 west)
 Hollows      Road                  ||
 [T3][H][W]                     ( route_2 ) Pebblerun Trail
   :..........(secret tunnel, Shift from cave side)....: (route_2 west wall)
                                    ##   G2: Bloom (sprout bridge, forest north ravine)
                                ( forest ) Lanternmoss Wood [T1][H][W]
                                    ||
                                ( route_1 ) Meadowline Path
                                    ##   G1: Tri-Gate (Spark OR Kindle OR Surge = starter)
                                ( town_1 ) Kettlebrook [H][W] shop T1   <- new game
                                    G0: flag_starter_chosen (north exit)
```

### 1.2 Routes vs areas

- **Routes (`route_1`..`route_5`)** are connective corridor zones (90–100 m wide × 180–200 m long or the transpose). They carry the bulk of trainers (4–5 each), tall-grass-style spawn regions, one mandatory Resonance obstacle or story fight, and 1–2 secrets. Biome flavor: `route_1` lowland meadow, `route_2` rocky uphill trail, `route_3` sandstone canyon, `route_4` ash-covered switchbacks, `route_5` alpine pass (snowline halfway).
- **Areas (`forest`, `cave`, `lake`, `volcano`, `snowpeak`)** are destination zones (180–200 m square). Each hosts exactly one trial venue, a rest site (healing + waystone + storage + pedlar), a chapter story climax, and 2–3 secrets. They are **not** routes: each is a separate zone with its own music theme, attuned type, and encounter table.
  - `forest` sits between `route_1` and `route_2` (mandatory pass-through).
  - `cave` is a western branch off `route_3` (mandatory: holds trial_3) with an optional secret tunnel back to `route_2`.
  - `lake` sits between `town_2` and `town_3` (mandatory pass-through; trial_4 on its island).
  - `volcano` is a western dead-end branch off `route_4` (mandatory: trial_5).
  - `snowpeak` sits between `route_5` and `league` (mandatory pass-through; trial_6).
- **Towns (`town_1`..`town_3`)** have no wild encounters and no trainers except scripted ones.

Zone count: 3 towns + 5 routes + 5 areas + `league` = **14 exterior zones**, plus **6 trial interiors** = 20 scenes.

### 1.3 Adjacency table (every connection is bidirectional; coordinates are zone-local)

| Edge | Zone A exit | A coords (x,z) | Arrival in A (x,z, yaw) | Zone B exit | B coords | Arrival in B (x,z, yaw) | Gate |
|---|---|---|---|---|---|---|---|
| E1 | `town_1` x_t1_n | (0, −60) | (0, −52, 180) | `route_1` x_r1_s | (0, 90) | (0, 82, 0) | G0 (town_1 side) |
| E2 | `route_1` x_r1_n | (0, −90) | (0, −82, 180) | `forest` x_fo_s | (0, 90) | (0, 82, 0) | G1 at route_1 (0, −25) |
| E3 | `forest` x_fo_n | (−20, −90) | (−20, −82, 180) | `route_2` x_r2_s | (0, 100) | (0, 92, 0) | G2 at forest (−20, −70) |
| E4 | `route_2` x_r2_n | (0, −100) | (0, −92, 180) | `town_2` x_t2_s | (0, 75) | (0, 67, 0) | — |
| E5 | `town_2` x_t2_w | (−75, 0) | (−67, 0, 90) | `route_3` x_r3_e | (100, 0) | (92, 0, 270) | G3 at town_2 (−63, 0) |
| E6 | `route_3` x_r3_w | (−100, 0) | (−92, 0, 90) | `cave` x_cv_e | (90, 0) | (82, 0, 270) | story: t_hush_g03 at route_3 (−80, 5) |
| E7 | `cave` x_cv_s | (60, 90) | (60, 82, 0) | `route_2` x_r2_w | (−50, 20) | (−42, 20, 90) | S-T: Shift cracked wall at cave (60, 78); opens both sides (`flag_tunnel_open`) — optional |
| E8 | `town_2` x_t2_n | (40, −75) | (40, −67, 180) | `lake` x_lk_s | (0, 100) | (0, 92, 0) | G5 at town_2 (40, −66) |
| E9 | `lake` x_lk_n | (0, −100) | (0, −92, 180) | `town_3` x_t3_s | (0, 80) | (0, 72, 0) | G6 at lake (0, −80) |
| E10 | `town_3` x_t3_w | (−80, 0) | (−72, 0, 90) | `route_4` x_r4_e | (100, 0) | (92, 0, 270) | — |
| E11 | `route_4` x_r4_w | (−100, 0) | (−92, 0, 90) | `volcano` x_vo_e | (100, 0) | (92, 0, 270) | G8 at route_4 (−62, 5) |
| E12 | `town_3` x_t3_n | (0, −80) | (0, −72, 180) | `route_5` x_r5_s | (0, 100) | (0, 92, 0) | G9 at town_3 (0, −70) |
| E13 | `route_5` x_r5_n | (0, −100) | (0, −92, 180) | `snowpeak` x_sp_s | (0, 100) | (0, 92, 0) | G10 at route_5 (0, 10) |
| E14 | `snowpeak` x_sp_n | (0, −100) | (0, −92, 180) | `league` x_lg_s | (0, 40) | (0, 32, 0) | G11 at snowpeak (0, −55); G12 at snowpeak (0, −94) |

Trial doors (host zone → interior; interior door at (0, 30), interior arrival (0, 24, yaw 0); leaving returns to the host arrival point):

| Venue | Host zone | Door (x,z) | Host arrival on exit (x,z,yaw) |
|---|---|---|---|
| `trial_1` Lantern Grove | `forest` | (40, −50) | (40, −44, 180) |
| `trial_2` Pinwheel Hall | `town_2` | (0, −55) | (0, −49, 180) |
| `trial_3` Geode Amphitheater | `cave` (deep level) | (−50, −55) | (−50, −49, 180) |
| `trial_4` Mirror Pavilion | `lake` (island) | (0, −20) | (0, −14, 180) |
| `trial_5` Caldera Forge | `volcano` (crater rim) | (0, −35) | (0, −29, 180) |
| `trial_6` Aurora Observatory | `snowpeak` | (−50, −15) | (−50, −9, 180) |

Intra-zone transport: `lake` ferry, south dock (0, 55) ↔ island dock (0, 12); available after `flag_lake_pump_stopped`; 6-second scripted crossing, both directions, unlimited uses.

### 1.4 Zone sheets

Safe-return = where the player is placed (party fully healed) after all party creatures faint in that zone; if the preferred point has not been activated, the fallback is used. Roaming max and spawn regions are summarized here; rules are in §4.2.

#### `town_1` — Kettlebrook (WN)
- **Size/shape:** 120×120, bowl-shaped meadow village. **Height:** 0–6 m. **Attuned:** none.
- **Terrain:** brook runs N–S along x = +35 with footbridges at (35, −10) and (35, 30); cobbled plaza; hedge-and-fence border; Chime Tower on a knoll in the NW.
- **Landmarks:** Great Kettle Fountain (0, 0) — a giant copper kettle pouring into a basin; Resonance Atelier (mentor's workshop) door (−25, −20); player home (20, 22); Tending House counter (−22, 22); Trading Post shop counter (0, 30); Chime Tower (−40, −40), 14 m, visible from route_1.
- **Exits:** x_t1_n (0, −60) → route_1.
- **Spawn points:** new game (20, 18, yaw 0) outside home door; from route_1 (0, −52, 180); fast travel `ws_town_1` at (0, 6), arrival (0, 10, 0).
- **Safe-return:** Tending House, arrival (−22, 16, 0).
- **Wild:** none.

#### `route_1` — Meadowline Path (WN)
- **Size/shape:** 90×180, N–S corridor. **Height:** 0–12 m rolling. **Attuned:** electric (static-charged dandelion meadow).
- **Terrain:** gentle hills; stream enters west edge at (−45, −30), winds to (−10, −50), exits under a hedge at (−45, −60); hedge wall spans x −45..45 at z = −25 with the **Tri-Gate** arch at (0, −25).
- **Landmarks:** Tri-Gate (0, −25) — stone arch with three sockets (copper conduit / bramble knot / dry channel); Kite Hill (25, 30), top y = 12, with an Updraft vent (optional, q_side_kite_contest); signpost oak (−15, 60); stream islet (−30, −45).
- **Exits:** x_r1_s (0, 90) → town_1; x_r1_n (0, −90) → forest.
- **Spawn points:** from town_1 (0, 82, 0); from forest (0, −82, 180).
- **Safe-return:** town_1 Tending House.
- **Weather:** clear 80 / rain 20. **Roaming max:** 6. **Spawn regions:** R1a x[−40,−10] z[40,80]; R1b x[10,40] z[−5,40]; R1c x[−40,40] z[−85,−35] (north of Tri-Gate). 14 anchors total.

#### `forest` — Lanternmoss Wood (WN)
- **Size/shape:** 180×180, dense canopy with clearings. **Height:** 0–18 m. **Attuned:** verdant.
- **Terrain:** root-knuckled paths, moss mounds, glowing moss lanterns hung in branches; an E–W ravine at z = −70 (15 m wide, 8 m deep, banks at z −62 / −78) that fully separates the northern exit.
- **Landmarks:** Great Lantern Tree (30, −35), 40 m tall, trunk radius 6 m; trial_1 door in its root hollow (40, −50); Sprout Bridge site (−20, −70) (G2); moth clearing (0, 10); Forest Camp (−50, 40) with `ws_forest`, ranger healer, storage terminal, pedlar; thorn thicket (−70, −45) (Kindle secret); dormant lantern conduit (60, 55) (Spark secret); Hush Damper machine at (25, −25) during chapter 2.
- **Exits:** x_fo_s (0, 90) → route_1; x_fo_n (−20, −90) → route_2.
- **Spawn points:** from route_1 (0, 82, 0); from route_2 (−20, −82, 180); `ws_forest` arrival (−50, 46, 0).
- **Safe-return:** Forest Camp (−50, 46) if activated, else town_1.
- **Weather:** clear 60 / rain 20 / fog 20. **Roaming max:** 8. **Spawn regions:** F1 x[−80,−20] z[50,85]; F2 x[20,80] z[10,70]; F3 x[−85,−30] z[−55,20]; F4 x[−60,60] z[−88,−80] (north strip, after G2). 18 anchors.

#### `route_2` — Pebblerun Trail (WN)
- **Size/shape:** 100×200, N–S uphill. **Height:** 0 (south) → 25 (north). **Attuned:** gale.
- **Terrain:** boulder fields, a creek gorge crossing at z = 20 with a rope bridge (0, 20); ledged cliffs on the east side; cracked stone wall on the west edge (−50, 20) (secret tunnel, sealed from this side).
- **Landmarks:** rope bridge (0, 20); Bloom vine cliff (30, −50) (secret ledge, 8 m up); Updraft vent (−30, −20) (kite contest, optional); stone town-gate arch (0, −80).
- **Exits:** x_r2_s (0, 100) → forest; x_r2_n (0, −100) → town_2; x_r2_w (−50, 20) → cave (after `flag_tunnel_open`).
- **Spawn points:** from forest (0, 92, 0); from town_2 (0, −92, 180); from cave (−42, 20, 90).
- **Safe-return:** town_2 Tending House if `flag_town2_arrived`, else Forest Camp.
- **Weather:** clear 75 / rain 25. **Roaming max:** 7. **Spawn regions:** R2a x[−45,−5] z[50,95]; R2b x[5,45] z[−30,15]; R2c x[−45,45] z[−65,−35]. 15 anchors.

#### `town_2` — Pinwheel Rise (WN)
- **Size/shape:** 150×150 terraced hill town. **Height:** 0 (south gate) → 30 (north crest). **Attuned:** none (trial_2 interior overrides to gale).
- **Terrain:** four terraces linked by stairs and ramps (max slope 30°); seven working windmills turned by gale creatures on harnesses (ambient, non-interactive except the lift).
- **Landmarks:** Pinwheel Hall (trial_2) door (0, −55) on the crest; Tending House counter (20, 20); shop counter (32, 8); `ws_town_2` (0, 12); tea house (archivist) (−30, 15); Windmill Lift (45, −30) (Spark secret); **Gust Gap** on the west edge — a 14 m chasm x −70..−56 at z 0 with Updraft vents at (−63, 0) east side and (−71, 0) west side (G3); lake path boulder (40, −66) (G5).
- **Exits:** x_t2_s (0, 75) → route_2; x_t2_w (−75, 0) → route_3; x_t2_n (40, −75) → lake.
- **Spawn points:** from route_2 (0, 67, 0); from route_3 (−67, 0, 90); from lake (40, −67, 180); `ws_town_2` arrival (0, 16, 0).
- **Safe-return:** Tending House (20, 26, 0).

#### `route_3` — Hollowstep Road (WN)
- **Size/shape:** 200×100, E–W canyon. **Height:** 0–15 m. **Attuned:** shade.
- **Terrain:** sandstone canyon floor, four sinkholes (three fenced; one at (30, 30) curtained by a shade-veil — Veil secret), a flat-topped mesa (−10, −35) top y = 15 (Updraft vent at its foot (−10, −22)), dead-tree grove (−40, 20).
- **Landmarks:** mesa; dead-tree grove (night storyteller); cave mouth (−95, 0) framed by crystal outcrops.
- **Exits:** x_r3_e (100, 0) → town_2; x_r3_w (−100, 0) → cave.
- **Spawn points:** from town_2 (92, 0, 270); from cave (−92, 0, 90).
- **Safe-return:** town_2 Tending House.
- **Weather:** clear 60 / rain 15 / fog 25. **Roaming max:** 7. **Spawn regions:** R3a x[50,90] z[−40,40]; R3b x[−30,30] z[−10,45]; R3c x[−80,−40] z[−45,−5]. 15 anchors.

#### `cave` — Geode Hollows (WN)
- **Size/shape:** 180×180 indoor cavern, two levels. **Height:** upper level y 0–10 (east half and north-west gallery); deep level y −30 to −10 (south-west), connected by a spiral ramp centered (0, 0). **Attuned:** stone.
- **Terrain:** crystal clusters as light sources (emissive, colored by nearest vein), rope walkways, underground stream; deep level has a cold chamber (−70, 20) with frost-rimed walls.
- **Landmarks:** Cave Camp (70, 10) upper — miner healer, `ws_cave`, storage, pedlar; Hush hideout (x 15..45, z −65..−40, deep) — barricade blocks the deep passage west until `flag_cave_hideout_cleared`; Geode Amphitheater (trial_3) door (−50, −55) deep; shadow curtain (−80, −20) deep (Veil secret); cracked wall (60, 78) upper (Shift, opens tunnel to route_2).
- **Exits:** x_cv_e (90, 0) → route_3; x_cv_s (60, 90) → route_2 (after `flag_tunnel_open`).
- **Spawn points:** from route_3 (82, 0, 270); from route_2 (60, 82, 0); `ws_cave` arrival (70, 16, 0).
- **Safe-return:** Cave Camp if activated, else town_2.
- **Weather:** none; time-invariant encounters. **Roaming max:** 5 upper + 5 deep. **Spawn regions:** CU1 x[20,80] z[−40,60]; CU2 x[−70,−10] z[40,80]; CD1 x[−85,−20] z[−10,40]; CD2 x[−85,−10] z[−85,−65] (after hideout). 16 anchors.

#### `lake` — Glasswater Lake (WN)
- **Size/shape:** 200×200 basin. **Height:** shore 0.5–12 m, water surface y = 0. **Attuned:** water (trial_4 interior overrides to frost).
- **Terrain:** circular lake centered (0, −10), radius 60; reed beds and pebble beaches; island centered (0, −10), radius 18; outflow channel runs north from the lake edge to the north exit, 10 m wide, crossing point (0, −80) (G6).
- **Landmarks:** ferry dock (0, 55) ↔ island dock (0, 12); Mirror Pavilion (trial_4) door (0, −20) on island; Lake Lodge (60, 70) — healer, `ws_lake`, storage, pedlar; Hush pump station (−75, 10) west shore; NE islet (45, −45) reachable by Surge stepping stones from (65, −45) (secret); three shore shrines (−60, −50), (60, −20), (−40, 60) (Illuminate, side quest).
- **Exits:** x_lk_s (0, 100) → town_2; x_lk_n (0, −100) → town_3.
- **Spawn points:** from town_2 (0, 92, 0); from town_3 (0, −92, 180); `ws_lake` arrival (60, 76, 0).
- **Safe-return:** Lake Lodge if activated, else town_2.
- **Weather:** clear 55 / rain 25 / fog 20. **Roaming max:** 8 (shore only; none on water or island). **Spawn regions:** L1 x[−90,−55] z[−60,60]; L2 x[55,90] z[−60,40]; L3 x[−50,50] z[62,90]; L4 x[−40,40] z[−95,−85] (north of G6). 18 anchors.

#### `town_3` — Crossvale (WN)
- **Size/shape:** 160×160 plateau market town. **Height:** 0–20 m. **Attuned:** none.
- **Terrain:** market square with awnings, ring road, stair streets up to a lookout tower; north gate is an iron portcullis fused shut by Hush rust-lock (G9).
- **Landmarks:** Grand Market shop (35, 5); Tending House (25, 25); `ws_town_3` (0, 10); Museum of Resonance (−35, −20) with basement shadow curtain (−35, −28) (Veil secret); lookout tower (50, −50); festival stage (−10, 30) (chapter 6 event); rust-locked north gate (0, −70).
- **Exits:** x_t3_s (0, 80) → lake; x_t3_w (−80, 0) → route_4; x_t3_n (0, −80) → route_5.
- **Spawn points:** from lake (0, 72, 0); from route_4 (−72, 0, 90); from route_5 (0, −72, 180); `ws_town_3` arrival (0, 14, 0).
- **Safe-return:** Tending House (25, 31, 0).

#### `route_4` — Ashen Switchback (WN)
- **Size/shape:** 200×100, E–W climbing road. **Height:** 0 (east) → 40 (west). **Attuned:** toxin (sulfur drifts).
- **Terrain:** three switchbacks, grey-violet ash drifts, sulfur crust patches, steam vents (cosmetic); **Scorch Gap** chasm x −70..−55 at z 5 with Updraft vents at (−62, 5) east and (−70, 5) west (G8).
- **Landmarks:** hot-spring bench (60, 30) (ambient NPCs); sulfur crust (40, −30) (Dissolve secret); Scorch Gap.
- **Exits:** x_r4_e (100, 0) → town_3; x_r4_w (−100, 0) → volcano.
- **Spawn points:** from town_3 (92, 0, 270); from volcano (−92, 0, 90).
- **Safe-return:** town_3 Tending House.
- **Weather:** clear 75 / rain 25. **Roaming max:** 7. **Spawn regions:** R4a x[40,90] z[−40,40]; R4b x[−40,30] z[−40,40]; R4c x[−95,−75] z[−40,40]. 15 anchors.

#### `volcano` — Mount Kiln (WN)
- **Size/shape:** 200×200, cone. **Height:** 0 (east base) → 70 (crater rim, ring radius 30 around (0, −30)). **Attuned:** fire.
- **Terrain:** basalt terraces, cooled lava rivers with glowing seams (railed; no damage hazards), obsidian outcrops, sulfur vents.
- **Landmarks:** Base Camp (80, 20) — healer, `ws_volcano`, storage, pedlar; Hush Foundry entrance (−30, 50), vault door rust-locked (−40, 60) (Dissolve, side quest); Caldera Forge (trial_5) door (0, −35) at y 55; geyser field (−70, −60) (Freeze secret); obsidian curtain (60, −60) (Veil secret).
- **Exits:** x_vo_e (100, 0) → route_4.
- **Spawn points:** from route_4 (92, 0, 270); `ws_volcano` arrival (80, 26, 0).
- **Safe-return:** Base Camp if activated, else town_3.
- **Weather:** clear 70 / fog 30 (volcanic haze). **Roaming max:** 8. **Spawn regions:** V1 x[30,90] z[−60,60]; V2 x[−90,−40] z[−40,30]; V3 x[−40,40] z[60,90]. 16 anchors.

#### `route_5` — Rimewind Pass (WN)
- **Size/shape:** 100×200, N–S alpine pass. **Height:** 0 → 50; snowline at z = 0 (north half snow-covered). **Attuned:** frost.
- **Terrain:** pine scree in the south, wind-carved snow in the north; a fast glacial river crosses east–west at z = 10 (12 m wide), crossing point (0, 10) (G10); avalanche boulder at (−35, −40) (Shift secret).
- **Landmarks:** river crossing; prayer-flag cairns every 30 m along the path (ambient); rival camp (0, −85).
- **Exits:** x_r5_s (0, 100) → town_3; x_r5_n (0, −100) → snowpeak.
- **Spawn points:** from town_3 (0, 92, 0); from snowpeak (0, −92, 180).
- **Safe-return:** Snowpeak Refuge if activated, else town_3.
- **Weather:** clear 40 / snow 40 / fog 20. **Roaming max:** 7. **Spawn regions:** R5a x[−45,45] z[30,90]; R5b x[−45,45] z[−30,−5]; R5c x[−45,45] z[−75,−40]. 15 anchors.

#### `snowpeak` — Aurora Crown (WN)
- **Size/shape:** 200×200 mountain. **Height:** 0 (south) → 90 (summit plateau, north). **Attuned:** lumen (aurora).
- **Terrain:** switchback ledges, ice falls, aurora ribbons overhead at night; dark ice tunnel (0, −55), 25 m long, opening onto the summit plateau (0, −80), y 90.
- **Landmarks:** Snowpeak Refuge (40, 60) — healer, `ws_snowpeak`, storage, pedlar; Aurora Observatory (trial_6) door (−50, −15), y 60; ice tunnel mouth (0, −55) with dormant light crystals (G11); dark ice tunnel runs z −55 → −78; Hush Great Damper on the summit plateau (0, −90); Summit Gate to league (0, −94) (G12); ice wall (70, 40) (Kindle secret).
- **Exits:** x_sp_s (0, 100) → route_5; x_sp_n (0, −100) → league.
- **Spawn points:** from route_5 (0, 92, 0); from league (0, −92, 180); `ws_snowpeak` arrival (40, 66, 0).
- **Safe-return:** Snowpeak Refuge if activated, else town_3.
- **Weather:** clear 35 / snow 45 / fog 20. **Roaming max:** 8 (none on the summit plateau z < −60). **Spawn regions:** S1 x[−80,80] z[60,90]; S2 x[−90,−20] z[0,50]; S3 x[20,90] z[−40,20]. 16 anchors.

#### `league` — Chorus Spire (WN; extra zone documented per ANCHORS)
- **Size/shape:** 80×80 open-air amphitheater of stacked, singing stone rings above the clouds. **Height:** 0–12 m. **Attuned:** none (neutral for fairness).
- **Landmarks:** gate hall (0, 30) — healer, `ws_league`, storage, tier-4 kiosk; antechamber stage (0, 10) (rival final); champion stage (0, −20).
- **Exits:** x_lg_s (0, 40) → snowpeak.
- **Spawn points:** from snowpeak (0, 32, 0); `ws_league` arrival (0, 26, 0).
- **Safe-return:** gate hall (0, 26).
- **Wild:** none.

#### Trial interiors `trial_1`..`trial_6` (shared layout 40×60)
- Door (0, 30), arrival (0, 24, 0); junior trainer spots (−8, 10), (8, 0), (0, −8); leader stage (0, −20); battle stage centered (0, −14).
- Each interior has a short, **type-free** traversal puzzle (pressure plates, rotating bridges, wind-fan timing) so no trial requires a specific creature type. Juniors are optional (the path routes around their sight lines).
- Interior attuned type = trial type (§2.2).

---

## 2. Places

### 2.1 Healing, storage, shops

| Location | Zone | Position | Heal | Storage terminal | Shop / pedlar | Waystone |
|---|---|---|---|---|---|---|
| Tending House | `town_1` | (−22, 22) | yes | yes | Trading Post (0, 30), base tier 1 | `ws_town_1` (0, 6) |
| Forest Camp | `forest` | (−50, 40) | yes | yes | pedlar (tier P) | `ws_forest` (−50, 42) |
| Tending House | `town_2` | (20, 20) | yes | yes | shop (32, 8), base tier 2 | `ws_town_2` (0, 12) |
| Cave Camp | `cave` | (70, 10) | yes | yes | pedlar (tier P) | `ws_cave` (70, 12) |
| Lake Lodge | `lake` | (60, 70) | yes | yes | pedlar (tier P) | `ws_lake` (60, 72) |
| Tending House | `town_3` | (25, 25) | yes | yes | Grand Market (35, 5), base tier 3 | `ws_town_3` (0, 10) |
| Base Camp | `volcano` | (80, 20) | yes | yes | pedlar (tier P) | `ws_volcano` (80, 22) |
| Snowpeak Refuge | `snowpeak` | (40, 60) | yes | yes | pedlar (tier P) | `ws_snowpeak` (40, 62) |
| Gate hall | `league` | (0, 30) | yes | yes | kiosk (tier 4) | `ws_league` (0, 22) |

**Shop tiers** (item ids provisional; Systems Designer owns prices/effects and may rename):

| Tier | Adds these items |
|---|---|
| P (pedlar) | `i_capture_t1`, `i_tonic_s`, `i_cure_basic` |
| 1 | P + `i_escape_rope` (exits area/route to last healing point) |
| 2 | 1 + `i_capture_t2`, `i_tonic_m`, `i_revive`, `i_cure_all`, discs D21, D22 (town_2 only) |
| 3 | 2 + `i_capture_t3`, `i_tonic_l`, `i_charge_restore`, discs D23, D24 (town_3 only) |
| 4 | 3 + `i_capture_t4`, `i_tonic_max`, `i_revive_full` |

Effective tier of a town shop = max(base tier, crest tier) where crest tier = 1 (0–1 crests), 2 (2–3 crests), 3 (4–6 crests). Discs stay tied to their town. Tier 4 is sold only at the league kiosk. Pedlars never upgrade (guaranteed cheap capture devices everywhere).

### 2.2 Trial venues and champion (required order)

| Venue | Host | Type (interior attuned) | Leader (WN) | Opens when | Leader team | Reward |
|---|---|---|---|---|---|---|
| `trial_1` Lantern Grove | `forest` | verdant | Lantern-warden Pim | `flag_forest_damper_removed` | 3, Lv 10–12 (ace Lv 12) | `i_crest_1`, D01, unlocks **Bloom**, enables fast travel |
| `trial_2` Pinwheel Hall | `town_2` | gale | Miller Aeri | `flag_trial_1_cleared` | 3, Lv 16–18 | `i_crest_2`, D02, **Updraft** |
| `trial_3` Geode Amphitheater | `cave` | stone | Sculptor Tamaru | `flag_trial_2_cleared` ∧ `flag_cave_hideout_cleared` | 4, Lv 22–25 | `i_crest_3`, D03, **Shift** |
| `trial_4` Mirror Pavilion | `lake` island | frost | Skater Ilse | `flag_trial_3_cleared` ∧ `flag_lake_pump_stopped` (ferry) | 4, Lv 29–32 | `i_crest_4`, D04, **Freeze** |
| `trial_5` Caldera Forge | `volcano` | fire | Smith Oduya | `flag_trial_4_cleared` ∧ `flag_foundry_raided` | 5, Lv 35–39 | `i_crest_5`, D05, **Dissolve** |
| `trial_6` Aurora Observatory | `snowpeak` | lumen | Astronomer Lio | `flag_trial_5_cleared` | 6, Lv 40–45 | `i_crest_6`, D06, **Illuminate** |
| `champion` Chorus Spire | `league` | neutral | Champion Solenne | 6 crests ∧ `flag_faction_boss_defeated` | 6, Lv 46–50 | `flag_champion_defeated`, credits, postgame |

Order is enforced twice: geographically (each next trial sits behind a gate that needs the previous crest's action) and by the door check. A locked trial door shows a closed-shutter animation and a sign reading which crest is required.

### 2.3 Resonance field-action categories and unlock schedule (WN verbs)

| Category | Type | Marked object | Effect | Unlocked by | Persistence |
|---|---|---|---|---|---|
| Spark | electric | copper conduit socket | powers gate/lift/lantern | `flag_starter_chosen` (Tuning Fork given in ev_01) | per-object flag |
| Kindle | fire | bramble knot / ice wall | burns/melts away | same | per-object flag |
| Surge | water | dry channel / stepping-stone basin | raises water, lifts stepping stones | same | per-object flag |
| Bloom | verdant | glowing sprout | grows vine bridge / ladder | `flag_trial_1_cleared` | per-object flag |
| Updraft | gale | spiral vent | lifts and glides player (+ lead) across a gap, max 16 m | `flag_trial_2_cleared` | none needed (vents on both sides) |
| Shift | stone | fractured boulder / cracked wall | rolls boulder 6 m or collapses wall | `flag_trial_3_cleared` | per-object flag |
| Freeze | frost | rippling water marker | freezes a 4 m-wide ice path | `flag_trial_4_cleared` | per-object flag (never thaws) |
| Veil | shade | shadow curtain | lets the party pass through | `flag_veil_unlocked` (story, cave, chapter 4) | none needed (repeatable) |
| Dissolve | toxin | Hush rust-lock | corrodes the lock | `flag_trial_5_cleared` | per-object flag |
| Illuminate | lumen | dormant light crystal | lights crystals, reveals hidden items within 10 m for 60 s | `flag_trial_6_cleared` | per-object flag for crystals |

### 2.4 Fast travel (Waystones)

- 9 waystones: `ws_town_1`, `ws_forest`, `ws_town_2`, `ws_cave`, `ws_lake`, `ws_town_3`, `ws_volcano`, `ws_snowpeak`, `ws_league` (positions in §2.1; arrival = 4 m in front of the stone, listed in zone sheets).
- **Activation (unlock on visit):** town waystones activate automatically on first entering the town; area waystones activate when the player interacts within 3 m (tutorial prompt the first time). Activation is saved immediately as `ws_<id>` in the save's `waystones[]` list and also sets that rest site as the zone's safe-return.
- **Feature enable:** travel between waystones is enabled when `flag_trial_1_cleared` (Crest 1 "tunes" the stones — told in trial_1 dialogue). Before that, stones still activate and heal-return works.
- **Use:** from the Map menu in exploration state, in any exterior zone. Disabled inside trial interiors, during dialogue/battle/cutscene, and during the ferry crossing. Free, no cost. Transition = standard zone-load fade.

### 2.5 Safe-return (party wipe) rules
1. Player is moved to the zone's safe-return point (zone sheets) with party healed; money penalty per Systems.
2. Story state is not advanced: a lost mandatory Hush/leader battle resets that trainer; the player may retry. Rival battles are **non-blocking**: win or lose, the rival flag is set and dialogue branches (a loss still triggers the wipe/return).
3. Wipes never move the player across a gate they have not opened.

### 2.6 Story events (chapter, trigger, flags). Chapter plot beats are WN pending the Creative Director.

| Id | Ch | Zone @ (x,z) | Trigger / requires | Sets | Gist |
|---|---|---|---|---|---|
| ev_01 | 1 | town_1 Atelier | new game | `flag_starter_chosen` | Mentor presents three starters on tuning pedestals; each reacts to the player (starter picks back). Mentor gives Tuning Fork (`i_key_tuner`), 5 `i_capture_t1`, 3 `i_tonic_s`. |
| ev_02 | 1 | town_1 (5, −35) | leaving Atelier | `flag_rival_1_done` | Rival bursts in, chooses the starter "next to yours" (see §5.2), battles 1v1 Lv 5. |
| ev_03 | 1 | route_1 (0, −20) | reaching Tri-Gate | `flag_resonance_tutorial_done` | Mentor's voice via Tuning Fork: explains Resonance; the socket matching your starter glows; field action opens the gate. |
| ev_04 | 2 | forest (25, −25) | entering z < 0 in forest | `flag_forest_damper_removed` after beating t_hush_g01, t_hush_g02 | The Hush's grey Damper is draining color and sound from the Great Lantern Tree; lanterns go dark around it. Defeat two members; tree lights back up in a color wave. |
| ev_05 | 2 | trial_1 | clear trial | `flag_trial_1_cleared`, `flag_fasttravel_enabled` | Pim awards Crest 1, teaches Bloom, "tunes" waystones. |
| ev_06 | 3 | route_2 (0, −70) | approach town arch | `flag_rival_2_done` | Rival 2 (3 creatures). Rival brags about Crest 1 time. |
| ev_07 | 3 | town_2 (0, 60) | enter town | `flag_town2_arrived` | Windmill festival banners; archivist introduces encyclopedia survey. |
| ev_08 | 3 | trial_2 | clear | `flag_trial_2_cleared` | Updraft taught at Gust Gap by Aeri personally. |
| ev_09 | 4 | route_3 (−80, 5) | reaching cave mouth | `flag_route3_blockade_cleared` | Hush member blocks the cave "survey site"; battle. |
| ev_10 | 4 | cave deep (30, −55) | reaching barricade | `flag_cave_hideout_cleared` after t_hush_g04, t_hush_g05, t_hush_admin_1 | Hideout: Dampers muting a geode chorus. After Admin 1, a freed shade creature's "echo" teaches the Tuning Fork **Veil** → `flag_veil_unlocked`. |
| ev_11 | 4 | trial_3 | clear | `flag_trial_3_cleared` | Shift taught. Tamaru tells you the boulder in town_2 hides the lake path. |
| ev_12 | 5 | town_2 Tending House (20, 26) | enter town_2 with `flag_trial_3_cleared` | `flag_gift_a_received` | **Mentor arrives with starter gift A** (§5.2). Auto-trigger; cannot be missed because G5 is in town_2. |
| ev_13 | 5 | lake (−75, 10) | approach pump | `flag_lake_pump_stopped` after t_hush_g06 | Hush pump is draining the lake's "voice"; ferryman refuses to sail until stopped. |
| ev_14 | 5 | lake dock (0, 58) | after ev_13 | `flag_rival_3_done` | Rival 3 at the dock, then rides the ferry with you (dialogue only). |
| ev_15 | 5 | trial_4 | clear | `flag_trial_4_cleared` | Freeze taught; Ilse freezes the outflow channel's first stretch as a demo. |
| ev_16 | 6 | town_3 (−10, 30) | enter town_3 | `flag_town3_arrived` | Lantern festival; Hush rust-lock seals north gate overnight (cutscene); news of the Foundry on Mount Kiln. |
| ev_17 | 6 | volcano (−30, 50) | Foundry entrance | `flag_foundry_raided` after t_hush_g08, t_hush_admin_2 | Admin 2 flees toward the summit; a vault door (rust-locked) is left behind (sets up q_side_foundry_rescue). |
| ev_18 | 6 | trial_5 | clear | `flag_trial_5_cleared` | Dissolve taught. Oduya: "that lock on Crossvale's gate is our lock — undone the same way." |
| ev_19 | 7 | route_5 (0, −85) | approach | `flag_rival_4_done` | Rival 4 (5 creatures); rival joins the effort against the Hush. |
| ev_20 | 7 | trial_6 | clear | `flag_trial_6_cleared` | Illuminate taught; aurora brightens. |
| ev_21 | 8 | snowpeak (0, −84) | cross ice tunnel | `flag_faction_boss_defeated` | Great Damper is muting the whole region; Director Vell battle (6). Damper shatters; color and sound pulse outward (region-wide visual event: all zones get +1 festival prop set). |
| ev_22 | 8 | league (0, 10) | enter antechamber | `flag_rival_final_done` | Final rival battle (6). |
| ev_23 | 8 | league (0, −20) | talk to champion | `flag_champion_defeated` | Champion battle (6), credits, postgame (`flag_postgame`). |

### 2.7 Secrets (all optional)

| Id | Zone @ (x,z) | Requires | Reward |
|---|---|---|---|
| sec_01 | route_1 islet (−30, −45) | Surge at (−24, −42) | D07 |
| sec_02 | forest thicket (−70, −45) | Kindle | `i_capture_t2` ×3, `i_tonic_m` |
| sec_03 | forest conduit (60, 55) | Spark | lantern path to D09 at (70, 70) |
| sec_04 | route_2 cliff (30, −50) | Bloom | ledge with D10 |
| sec_05 | cave cracked wall (60, 78) | Shift | tunnel to route_2 (`flag_tunnel_open`) |
| sec_06 | cave curtain (−80, −20) | Veil | chamber: D13, `i_capture_t3` ×2 |
| sec_07 | town_2 Windmill Lift (45, −30) | Spark | rooftop: `i_capture_t3`, panoramic view |
| sec_08 | route_3 mesa top (−10, −35) | Updraft at (−10, −22) | `i_charge_restore` ×2 |
| sec_09 | route_3 sinkhole (30, 30) | Veil | D12 |
| sec_10 | lake NE islet (45, −45) | Surge at (65, −45) | D14 |
| sec_11 | town_3 museum basement (−35, −28) | Veil | D15, mural lore |
| sec_12 | route_4 sulfur crust (40, −30) | Dissolve | D16 |
| sec_13 | volcano geyser field (−70, −60) | Freeze | hidden ledge: `i_capture_t4` |
| sec_14 | volcano obsidian curtain (60, −60) | Veil | D18 |
| sec_15 | route_5 avalanche cave (−35, −40) | Shift | D19 |
| sec_16 | snowpeak ice wall (70, 40) | Kindle | D20, `i_capture_t4` |

Every secret is reachable once its action is unlocked; starter-type secrets (Spark/Kindle/Surge) become universally available because both unchosen starters are guaranteed by chapter 6 (§5.2).

### 2.8 NPCs (non-battling unless noted; positions zone-local)

| Id | Zone | Pos (x,z) | Role | Dialogue gist |
|---|---|---|---|---|
| npc_mentor | town_1 → town_2 (ch5) | (−25, −24) Atelier; (18, 26) town_2 | mentor, starter giver, gift A | Warm, tinkering instrument-maker; "creatures hum back when you listen." Gives Tuning Fork. |
| npc_guardian | town_1 | (20, 25) | player's aunt, tea stall | Sends you off with snacks; later comments on each crest. |
| npc_rival | varies | see trainers | rival | Loud, competitive, secretly anxious about not "hearing" creatures; grows into ally. |
| npc_t1_healer | town_1 | (−22, 22) | Tending House | Heals, offers rest-until-dawn/dusk. |
| npc_t1_shop | town_1 | (0, 30) | Trading Post | Sells tier list. |
| npc_t1_gate | town_1 | (0, −52) | blocks north exit before `flag_starter_chosen` | "Nobody walks the meadow without a partner." |
| npc_grandpa_kettle | town_1 | (30, −10) | q_side_lost_kettle giver | Lost his whistling kettle in the stream. |
| npc_chime_kid | town_1 | (4, 4) | tutorial hints | Explains waystones "listen" to crests. |
| npc_signpainter | route_1 | (10, 60) | hints | Painting the Tri-Gate; explains three sockets. |
| npc_kite_girl | route_1 | (25, 36) | q_side_kite_contest | Lost three kites on gusts across the region. |
| npc_ranger_moss | forest | (−50, 40) | camp healer | Ranger with a moss-covered hat; recommends catching a verdant partner before the ravine. |
| npc_lantern_apprentice | forest | (0, 12) | q_side_lantern_moths | Needs lanterns relit for moth migration. |
| npc_pedlar_forest | forest | (−46, 38) | pedlar | Same model/dialogue family as other pedlars (sibling pedlars, running gag). |
| npc_miller | town_2 | (−45, −10) | q_side_windmill_repair | Mills stalled after the Hush's static. |
| npc_archivist | town_2 → town_3 (after `flag_trial_4_cleared`) | (−30, 15); (−35, −14) museum | q_side_survey | Encyclopedia researcher; enthusiastic, speaks in footnotes. |
| npc_t2_healer | town_2 | (20, 20) | healer | — |
| npc_t2_shop | town_2 | (32, 8) | shop | — |
| npc_windkids | town_2 | (−10, 40), (−14, 42) | ambient | Race pinwheels; point at Gust Gap. |
| npc_storyteller | route_3 | (−40, 20) night only (day: sleeping, still interactable) | q_side_shade_tales | Tells ghost stories about "curtains of dusk". |
| npc_geologist | cave | (72, 14) | q_side_geode_survey | Measuring the geode chorus. |
| npc_miner_healer | cave | (70, 10) | camp healer | — |
| npc_ferryman | lake | (0, 55) | ferry | Refuses before pump is stopped; afterwards "Island? Hop on." |
| npc_lodge_keeper | lake | (60, 70) | healer, q_side_lake_lights | Keeper of the shore shrines. |
| npc_courier | town_3 | (30, 0) | q_side_market_courier | Overbooked courier. |
| npc_t3_healer | town_3 | (25, 25) | healer | — |
| npc_t3_shop | town_3 | (35, 5) | shop | — |
| npc_museum_curator | town_3 | (−35, −20) | lore | Region history of Resonance; murals of past champions. |
| npc_festival_host | town_3 | (−10, 30) | ev_16 | MC of lantern festival. |
| npc_springbathers | route_4 | (60, 30), (63, 31) | ambient | Gossip about Foundry lights at night. |
| npc_basecamp_keeper | volcano | (80, 20) | healer, courier receiver | — |
| npc_captive_keeper | volcano vault | (−44, 66) | q_side_foundry_rescue | Former Hush technician, remorseful, hands over the captive. |
| npc_refuge_elder | snowpeak | (40, 60) | healer | Reads aurora "sheet music". |
| npc_league_steward | league | (0, 30) | healer/kiosk | Explains no-leave rule absence ("you may step out any time"). |
| npc_champion | league | (0, −22) | champion (battles as t_champion) | Calm, theatrical conductor. |

Pedlars: `npc_pedlar_forest`, `npc_pedlar_cave` (68, 8), `npc_pedlar_lake` (62, 68), `npc_pedlar_volcano` (78, 18), `npc_pedlar_snowpeak` (38, 58).

### 2.9 Trainers

Team families refer to family ids; Systems Designer defines exact species/levels/moves/AI tier within these bounds. Sight range default 8 m (cone 60°); "M" = mandatory (blocks path or story), "O" = optional. Positions in host zone frame (trial staff in interior frame).

| Id | Zone | Pos (x,z) | Class (WN) | Size | Lv | Families | M/O |
|---|---|---|---|---|---|---|---|
| t_rival_1 | town_1 | (5, −35) | Rival | 1 | 5 | rival starter | M (non-blocking) |
| t_r1_01 | route_1 | (−10, 40) | Kite-flyer | 1 | 4 | f07 | O |
| t_r1_02 | route_1 | (15, 0) | Picnicker | 2 | 4–5 | f04, f05 | O |
| t_r1_03 | route_1 | (−20, −55) | Beetle-hat kid | 2 | 5–6 | f04, f08 | O |
| t_fo_01 | forest | (−30, 60) | Moss hiker | 2 | 7–8 | f04, f05 | O |
| t_fo_02 | forest | (10, 20) | Moth catcher | 2 | 8–9 | f10, f04 | O |
| t_fo_03 | forest | (40, 10) | Twin scouts | 2 | 8–9 | f07, f08 | O |
| t_fo_04 | forest | (−60, −10) | Night-watcher | 3 | 8–10 | f09, f08, f09 | O |
| t_hush_g01 | forest | (20, −15) | Hush member | 2 | 9–10 | f08, f09 | M |
| t_hush_g02 | forest | (35, −20) | Hush member | 2 | 10–11 | f09, f08 | M |
| t_trial1_j1 | trial_1 | (−8, 10) | Grove junior | 2 | 10–11 | f04 | O |
| t_trial1_j2 | trial_1 | (8, 0) | Grove junior | 2 | 10–11 | f04, f07 | O |
| t_trial1_leader | trial_1 | (0, −20) | Lantern-warden Pim | 3 | 10–12 | f04, f07, f04 (ace stage 2) | M |
| t_r2_01 | route_2 | (10, 70) | Climber | 2 | 12–13 | f05, f07 | O |
| t_r2_02 | route_2 | (−25, 40) | Rockhound | 3 | 12–13 | f05, f05, f08 | O |
| t_r2_03 | route_2 | (20, 0) | Bridge painter | 2 | 13–14 | f07, f10 | O |
| t_r2_04 | route_2 | (−10, −35) | Dusk jogger | 3 | 13–14 | f09, f08, f04 | O |
| t_rival_2 | route_2 | (0, −70) | Rival | 3 | 14–16 | starter + f07 + f05 | M (non-blocking) |
| t_trial2_j1 | trial_2 | (−8, 10) | Sailcloth junior | 2 | 15–16 | f07 | O |
| t_trial2_j2 | trial_2 | (8, 0) | Sailcloth junior | 3 | 15–16 | f07, f10 | O |
| t_trial2_j3 | trial_2 | (0, −8) | Sailcloth junior | 2 | 16–17 | f07, f05 | O |
| t_trial2_leader | trial_2 | (0, −20) | Miller Aeri | 3 | 16–18 | f07, f10, f07 (ace stage 2) | M |
| t_r3_01 | route_3 | (70, 10) | Canyon guide | 3 | 17–18 | f05, f09 | O |
| t_r3_02 | route_3 | (40, −20) | Glider twins | 2 | 18–19 | f07, f07 | O |
| t_r3_03 | route_3 | (0, 25) | Sinkhole diver | 3 | 18–19 | f08, f08, f09 | O |
| t_r3_04 | route_3 | (−35, −10) | Stargazer | 3 | 19–20 | f09, f10, f05 | O |
| t_hush_g03 | route_3 | (−80, 5) | Hush member | 3 | 19–20 | f08, f09, f05 | M |
| t_cv_01 | cave | (60, −20) | Crystal miner | 3 | 20–21 | f05 | O |
| t_cv_02 | cave | (10, 30) | Spelunker | 3 | 20–22 | f09, f06 | O |
| t_cv_03 | cave | (−30, 50) | Echo singer | 3 | 21–22 | f05, f08, f10 | O |
| t_hush_g04 | cave | (40, −45) | Hush member | 3 | 21–22 | f08, f09 | M |
| t_hush_g05 | cave | (20, −55) | Hush member | 3 | 22–23 | f09, f05 | M |
| t_hush_admin_1 | cave | (30, −62) | Admin Sabine | 3 | 22–24 | f08, f09, f08 (ace stage 2) | M |
| t_trial3_j1 | trial_3 | (−8, 10) | Chisel junior | 3 | 22–23 | f05 | O |
| t_trial3_j2 | trial_3 | (8, 0) | Chisel junior | 3 | 22–23 | f05, f09 | O |
| t_trial3_leader | trial_3 | (0, −20) | Sculptor Tamaru | 4 | 22–25 | f05 ×3, f09 (ace f05 stage 2) | M |
| t_lk_01 | lake | (40, 80) | Reed painter | 3 | 25–26 | f04, f10 | O |
| t_lk_02 | lake | (−60, 50) | Swimmer | 3 | 25–27 | f06, f07 | O |
| t_lk_03 | lake | (−70, −20) | Birdwatcher | 3 | 26–27 | f07, f10, f04 | O |
| t_lk_04 | lake | (70, −10) | Angler | 4 | 26–28 | f06, f08, f04, f06 | O |
| t_hush_g06 | lake | (−75, 10) | Hush pump tech | 3 | 27–28 | f08, f09, f05 | M |
| t_rival_3 | lake | (0, 60) | Rival | 4 | 27–29 | starter + f07 + f05 + gift-A-counter | M (non-blocking) |
| t_trial4_j1 | trial_4 | (−8, 10) | Skater junior | 3 | 28–29 | f06 | O |
| t_trial4_j2 | trial_4 | (8, 0) | Skater junior | 3 | 28–30 | f06, f07 | O |
| t_trial4_leader | trial_4 | (0, −20) | Skater Ilse | 4 | 29–32 | f06, f06, f07, f06 (ace stage 2) | M |
| t_r4_01 | route_4 | (70, −5) | Ash sweeper | 3 | 30–31 | f08, f05 | O |
| t_r4_02 | route_4 | (35, 20) | Spring attendant | 4 | 30–32 | f04, f08, f06, f10 | O |
| t_r4_03 | route_4 | (0, −15) | Road surveyor | 3 | 31–32 | f05, f07 | O |
| t_r4_04 | route_4 | (−30, 10) | Glassblower | 4 | 32–33 | f10, f05, f08, f09 | O |
| t_hush_g07 | route_4 | (−85, 0) | Hush lookout | 3 | 32–33 | f08, f09, f07 | M |
| t_vo_01 | volcano | (60, 30) | Volcanologist | 4 | 33–34 | f05, f08 | O |
| t_vo_02 | volcano | (20, −10) | Obsidian carver | 4 | 34–35 | f05, f09 | O |
| t_vo_03 | volcano | (−60, −20) | Firewalker | 4 | 34–36 | f08, f05, f07, f09 | O |
| t_hush_g08 | volcano | (−20, 45) | Hush foreman | 4 | 34–35 | f08, f05, f09 | M |
| t_hush_admin_2 | volcano | (−30, 55) | Admin Corwin | 4 | 35–37 | f09, f08, f05, f09 (ace stage 3) | M |
| t_hush_warden | volcano vault | (−40, 64) | Vault warden | 4 | 38–39 | f08, f09, f05, f06 | O (q_side_foundry_rescue) |
| t_trial5_j1 | trial_5 | (−8, 10) | Forge junior | 4 | 35–36 | f05, f08 | O |
| t_trial5_j2 | trial_5 | (8, 0) | Forge junior | 4 | 35–37 | f08, f05 | O |
| t_trial5_leader | trial_5 | (0, −20) | Smith Oduya | 5 | 35–39 | f05, f08, f02 (stage 2), f08, f02 (ace stage 3) | M |
| t_r5_01 | route_5 | (15, 70) | Pilgrim | 4 | 38–39 | f10, f06 | O |
| t_r5_02 | route_5 | (−20, 30) | Mountaineer | 4 | 38–40 | f05, f07, f06 | O |
| t_r5_03 | route_5 | (20, −20) | Ski patrol | 4 | 39–40 | f06, f07 | O |
| t_r5_04 | route_5 | (−10, −60) | Wind monk | 5 | 39–41 | f07, f10, f09 | O |
| t_rival_4 | route_5 | (0, −85) | Rival | 5 | 40–42 | starter (stage 3) + 4 | M (non-blocking) |
| t_sp_01 | snowpeak | (30, 70) | Aurora chaser | 4 | 41–42 | f10, f06 | O |
| t_sp_02 | snowpeak | (−40, 40) | Yeti-suit hiker | 5 | 41–43 | f06, f05, f07 | O |
| t_sp_03 | snowpeak | (60, 0) | Ice sculptor | 5 | 42–43 | f06, f09, f10 | O |
| t_trial6_j1 | trial_6 | (−8, 10) | Observatory junior | 4 | 42–43 | f10 | O |
| t_trial6_j2 | trial_6 | (8, 0) | Observatory junior | 5 | 42–44 | f10, f06 | O |
| t_trial6_leader | trial_6 | (0, −20) | Astronomer Lio | 6 | 40–45 | f10 ×3, f06, f07, f10 ace stage 3 | M |
| t_hush_g09 | snowpeak | (−8, −80) | Hush sentry | 4 | 43–44 | f08, f09, f06 | M |
| t_hush_boss | snowpeak | (0, −84) | Director Vell | 6 | 43–47 | f09 (ace stage 3), f08, f09, f08, f05, f07 | M |
| t_rival_final | league | (0, 10) | Rival | 6 | 46–48 | starter stage 3 + 5 | M (non-blocking) |
| t_champion | league | (0, −20) | Champion Solenne | 6 | 46–50 | f04, f07, f06, f08, f05 (all stage 3), ace f09 stage 3 Lv 50 | M |
| t_rival_post | town_1 | (5, −35) | Rival (postgame) | 6 | 55 | mixed | O |

Totals: 75 trainers — 26 story-mandatory (of which the 5 rival battles `t_rival_1..4` and `t_rival_final` are non-blocking) and 49 optional.

---

## 3. Gates, unlock conditions, softlock proof

### 3.1 Gate list

| Gate | Where | Mandatory? | Requirement | Type needed | Earliest point action is unlocked |
|---|---|---|---|---|---|
| G0 | town_1 north exit | yes | `flag_starter_chosen` | — | ev_01 |
| G1 | route_1 Tri-Gate (0, −25) | yes | Spark **or** Kindle **or** Surge | electric / fire / water (= starter) | ev_03 |
| G2 | forest Sprout Bridge (−20, −70) | yes | Bloom; `flag_trial_1_cleared` | verdant | ev_05 |
| G3 | town_2 Gust Gap (−63, 0) | yes | Updraft | gale | ev_08 |
| G4 | route_3 cave mouth (−80, 5) | yes | defeat t_hush_g03 | — | ev_09 |
| G4b | cave hideout barricade | yes | `flag_cave_hideout_cleared` | — | ev_10 |
| G5 | town_2 boulder (40, −66) | yes | Shift | stone | ev_11 |
| G5b | lake ferry | yes | `flag_lake_pump_stopped` | — | ev_13 |
| G6 | lake outflow (0, −80) | yes | Freeze | frost | ev_15 |
| G7 | trial_5 door | yes | `flag_foundry_raided` | — | ev_17 |
| G8 | route_4 Scorch Gap (−62, 5) | yes | Updraft | gale | ev_08 |
| G9 | town_3 rust-lock (0, −70) | yes | Dissolve | toxin | ev_18 |
| G10 | route_5 river (0, 10) | yes | Freeze | frost | ev_15 |
| G11 | snowpeak ice tunnel (0, −55) | yes | Illuminate | lumen | ev_20 |
| G12 | snowpeak Summit Gate (0, −94) | yes | 6 crests ∧ `flag_faction_boss_defeated` | — | ev_21 |
| S-T | cave cracked wall (60, 78) | no | Shift | stone | ev_11 |
| trial doors | §2.2 | yes | previous crest (+ chapter flag) | — | — |

### 3.2 No-softlock proof (mandatory field actions)

For each mandatory type-gated gate: the type is obtainable **in zones reachable before that gate without crossing it**, in **clear day** (default conditions, no time/weather dependence), with at least one other time/weather also available.

| Gate | Type | Obtainable before gate (zone: table, weight) | Earliest source | Notes |
|---|---|---|---|---|
| G1 | electric/fire/water | the chosen starter `c01`/`c04`/`c07` (ev_01) | ev_01 | Release/deposit of the starter is blocked until `flag_resonance_tutorial_done` (the player also has no other creature before route_1 grass). |
| G2 | verdant | `c10` route_1 day 35 / night 25; forest day 30 / night 15; `c11` forest 5/5 | route_1 | Ranger at Forest Camp hints at the need before the ravine. |
| G3 | gale | `c19` route_1 day 40 / night 20; forest 20/5; route_2 day 25; `c20` route_2 day 5 | route_1 | |
| G5 | stone | `c13` route_1 day 15; forest day 5; route_2 35/25; route_3 20/15; cave upper 30; `c14` route_2, route_3, cave | route_1 | |
| G6 | frost | `c16` cave upper 15, cave deep 20 (time-invariant); lake day 20 / night 20 (south shore, before G6); `c17` cave deep, lake | cave | Lake south shore reachable after G5 without crossing G6. |
| G8 | gale | as G3 (all zones remain reachable via waystones) | route_1 | |
| G9 | toxin | `c22` route_1 night 20; forest 25/25; route_2 15/30; route_3 20/20; cave upper 15; route_4 10/10; volcano 10/7; `c23` route_3, cave deep, lake, route_4, volcano | route_1 (night), forest (day) | |
| G10 | frost | as G6 | cave | |
| G11 | lumen | `c28` route_1 day 10; forest 15/15; route_2 night 15; route_3 night 15; lake 15/20; route_4 5/20; route_5 7/10; snowpeak 7/10 (south of tunnel); `c29` lake, route_4, route_5, snowpeak | route_1 (day) | |

Additional guarantees:
1. **Unlock precedes use:** each gate's category unlock event occurs in a zone reachable before the gate (G2 via trial_1 in forest south of the ravine; G3 trial_2 in town_2 east of the Gust Gap; G5 trial_3 in cave; G6 trial_4 on the lake island, south of the outflow; G9 trial_5 in volcano, reachable via town_3 west without G9; G11 trial_6 in snowpeak south of the tunnel).
2. **Catchable ≠ caught:** capture devices never run out: pedlars at every rest site sell `i_capture_t1`; if the player has 0 capture devices and less money than one `i_capture_t1`, the mentor's "care package" (5 × `i_capture_t1`, delivered by the nearest healer on next heal, repeatable, `flag`-less) triggers. Systems Designer owns the money floor; this is the world-side fallback.
3. **Fainted lead:** healing points exist on the near side of every gate (see safe-return list); storage terminals at every healing point let the player swap in a stored creature of the needed type.
4. **Release protection:** besides the G1 rule, no protection is needed: every gated type is a wild family with respawning spawns in ≥ 3 zones reachable by fast travel.
5. **Permanent openings:** every opened gate persists as a flag (Bloom bridge, boulder, ice path, rust-lock, lit crystals); Updraft gaps have vents on both sides; so the player can always walk back to any healing point, shop, or earlier zone. No one-way drop exists in mandatory paths; the only one-sided object (cave cracked wall) is optional and becomes two-way when opened.
6. **Battles:** no mandatory battle is unwinnable-by-construction: all wild zones respawn indefinitely (grinding is possible though not intended), rival battles are non-blocking, and lost Hush/leader battles reset to retry.
7. **Trial interiors** contain only type-free puzzles.
8. **Ferry** is a scripted two-way transport, always available after `flag_lake_pump_stopped`.
9. **Reachability of the whole graph** (validator requirement, §9): with the flag set produced by the main quest sequence, a BFS from `town_1` over edges whose gates are satisfied reaches all 14 exterior zones and all 6 trial doors.

---

## 4. Encounters

### 4.1 Rules for the tables
- Runtime uses **weights**. Day and night each have a base weight table (sums to 100). Weather multiplies base weights by type, then renormalizes:
  - rain: verdant ×1.5, toxin ×1.5, gale ×0.5, lumen ×0.75
  - fog: shade ×2.0, lumen ×1.5, gale ×0.5
  - snow: frost ×2.0, verdant ×0.25, toxin ×0.5
  - clear: ×1 for all
- Probabilities below are the resolved values `weight / Σweight`, rounded to 3 decimals by largest-remainder so each column prints exactly 1.000. Values were computed by a script from the weights (not hand-typed); the content validator must recompute them from weights and compare within ±0.001.
- Level is uniform integer in [lo, hi]. `—` = not present in that condition.
- Attuned type does not change encounter weights (it affects battle only; Systems Designer defines the bonus).
- Weather availability per zone is listed in the zone sheets; columns only exist for applicable weathers.

### 4.2 Roaming wild creatures and respawn

| Zone | Max roaming | Anchors | Contact radius (default) |
|---|---|---|---|
| route_1 | 6 | 14 | 1.2 m (species override from creatures.md body scale) |
| forest | 8 | 18 | 〃 |
| route_2 | 7 | 15 | 〃 |
| route_3 | 7 | 15 | 〃 |
| cave | 5 upper + 5 deep | 16 | 〃 |
| lake | 8 | 18 | 〃 |
| route_4 | 7 | 15 | 〃 |
| volcano | 8 | 16 | 〃 |
| route_5 | 7 | 15 | 〃 |
| snowpeak | 8 | 16 | 〃 |

Rules:
1. **Zone entry:** immediately populate `ceil(max × 0.6)` creatures at anchors ≥ 25 m from the arrival point. Each creature's species and level are rolled from the current time/weather table with the zone RNG stream.
2. **Refill:** a spawn tick runs every 5 s (game-time while in exploration state only). If count < max and the slot's respawn delay (12 s) has elapsed, spawn at a random anchor ≥ 30 m from the player and outside the camera frustum; if none qualifies, use the farthest anchor ≥ 20 m; if none, skip the tick.
3. **Contact:** player capsule overlapping a creature's contact sphere starts an encounter if the global encounter lock is free; the lock is taken synchronously so overlapping creatures cannot stack encounters. Only the touched creature enters battle.
4. **After battle** (win, capture, flee, or player wipe): the battled creature is removed (starting its slot's 12 s respawn delay); player gets 4 s of encounter immunity; creatures within 8 m play a startle animation and move away for 3 s.
5. **Despawn:** creatures > 80 m from the player for 20 s despawn quietly (slot delay applies). On day/night or weather change, existing creatures stay; new spawns use the new table.
6. **Exclusion zones:** no anchor within 25 m of arrival points, 12 m of trainers, healing points, waystones, exit triggers, trial doors, or scripted-event areas while their event is pending.
7. **Behavior:** species behavior (curious approach / shy flee / territorial chase) comes from creatures.md; any chasing creature moves at ≤ 80 % of player run speed so encounters are always avoidable.
8. **Determinism:** zone RNG stream = seeded from (saveSeed, zoneId, entryCounter); not persisted mid-zone (roaming creatures are not saved; only committed state is saved).

### 4.3 Encounter tables

#### route_1

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|
| c10 | verdant (1) | 3–6 | 35 | 25 | 0.350 | 0.553 | 0.250 | 0.333 |
| c13 | stone (1) | 4–6 | 15 | — | 0.150 | 0.158 | — | — |
| c19 | gale (1) | 3–6 | 40 | 20 | 0.400 | 0.210 | 0.200 | 0.089 |
| c22 | toxin (1) | 4–6 | — | 20 | — | — | 0.200 | 0.267 |
| c25 | shade (1) | 4–7 | — | 35 | — | — | 0.350 | 0.311 |
| c28 | lumen (1) | 5–7 | 10 | — | 0.100 | 0.079 | — | — |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### forest

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|
| c10 | verdant (1) | 6–10 | 30 | 15 | 0.300 | 0.387 | 0.308 | 0.150 | 0.194 | 0.107 |
| c11 | verdant (2) | 11–12 | 5 | 5 | 0.050 | 0.064 | 0.051 | 0.050 | 0.064 | 0.036 |
| c13 | stone (1) | 7–9 | 5 | — | 0.050 | 0.043 | 0.051 | — | — | — |
| c19 | gale (1) | 7–9 | 20 | 5 | 0.200 | 0.086 | 0.103 | 0.050 | 0.021 | 0.018 |
| c22 | toxin (1) | 6–9 | 25 | 25 | 0.250 | 0.323 | 0.256 | 0.250 | 0.323 | 0.178 |
| c25 | shade (1) | 7–10 | — | 35 | — | — | — | 0.350 | 0.301 | 0.500 |
| c28 | lumen (1) | 7–10 | 15 | 15 | 0.150 | 0.097 | 0.231 | 0.150 | 0.097 | 0.161 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_2

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|
| c10 | verdant (1) | 12–14 | 15 | — | 0.150 | 0.225 | — | — |
| c13 | stone (1) | 11–14 | 35 | 25 | 0.350 | 0.350 | 0.250 | 0.225 |
| c14 | stone (2) | 16 | 5 | — | 0.050 | 0.050 | — | — |
| c19 | gale (1) | 11–14 | 25 | — | 0.250 | 0.125 | — | — |
| c20 | gale (2) | 16 | 5 | — | 0.050 | 0.025 | — | — |
| c22 | toxin (1) | 12–14 | 15 | 30 | 0.150 | 0.225 | 0.300 | 0.404 |
| c25 | shade (1) | 12–15 | — | 25 | — | — | 0.250 | 0.225 |
| c26 | shade (2) | 16 | — | 5 | — | — | 0.050 | 0.045 |
| c28 | lumen (1) | 12–15 | — | 15 | — | — | 0.150 | 0.101 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_3

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|
| c13 | stone (1) | 15–18 | 20 | 15 | 0.200 | 0.205 | 0.200 | 0.150 | 0.135 | 0.102 |
| c14 | stone (2) | 19–21 | 10 | — | 0.100 | 0.103 | 0.100 | — | — | — |
| c19 | gale (1) | 15–18 | 20 | — | 0.200 | 0.102 | 0.100 | — | — | — |
| c20 | gale (2) | 19–21 | 10 | — | 0.100 | 0.051 | 0.050 | — | — | — |
| c22 | toxin (1) | 15–18 | 20 | 20 | 0.200 | 0.308 | 0.200 | 0.200 | 0.269 | 0.135 |
| c23 | toxin (2) | 20–21 | 5 | 10 | 0.050 | 0.077 | 0.050 | 0.100 | 0.135 | 0.068 |
| c25 | shade (1) | 15–18 | 15 | 30 | 0.150 | 0.154 | 0.300 | 0.300 | 0.270 | 0.407 |
| c26 | shade (2) | 19–21 | — | 10 | — | — | — | 0.100 | 0.090 | 0.136 |
| c28 | lumen (1) | 15–18 | — | 15 | — | — | — | 0.150 | 0.101 | 0.152 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### lake

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Day fog | Night clear | Night rain | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|
| c11 | verdant (2) | 24–28 | 20 | 10 | 0.200 | 0.293 | 0.195 | 0.100 | 0.145 | 0.070 |
| c14 | stone (2) | 25–28 | 10 | — | 0.100 | 0.097 | 0.098 | — | — | — |
| c16 | frost (1) | 24–27 | 20 | 20 | 0.200 | 0.195 | 0.195 | 0.200 | 0.193 | 0.140 |
| c17 | frost (2) | 30–31 | 5 | 5 | 0.050 | 0.049 | 0.049 | 0.050 | 0.048 | 0.035 |
| c20 | gale (2) | 25–28 | 15 | — | 0.150 | 0.073 | 0.073 | — | — | — |
| c23 | toxin (2) | 25–28 | 10 | 10 | 0.100 | 0.146 | 0.098 | 0.100 | 0.144 | 0.070 |
| c25 | shade (1) | 24–27 | — | 10 | — | — | — | 0.100 | 0.096 | 0.140 |
| c26 | shade (2) | 25–28 | — | 20 | — | — | — | 0.200 | 0.193 | 0.281 |
| c28 | lumen (1) | 24–27 | 15 | 20 | 0.150 | 0.110 | 0.219 | 0.200 | 0.145 | 0.211 |
| c29 | lumen (2) | 30–31 | 5 | 5 | 0.050 | 0.037 | 0.073 | 0.050 | 0.036 | 0.053 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_4

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day rain | Night clear | Night rain |
|---|---|---|---|---|---|---|---|---|
| c11 | verdant (2) | 29–31 | 10 | — | 0.100 | 0.132 | — | — |
| c14 | stone (2) | 28–32 | 20 | 15 | 0.200 | 0.176 | 0.150 | 0.138 |
| c15 | stone (3) | 35 | 5 | — | 0.050 | 0.044 | — | — |
| c20 | gale (2) | 29–33 | 20 | 5 | 0.200 | 0.088 | 0.050 | 0.023 |
| c22 | toxin (1) | 28–30 | 10 | 10 | 0.100 | 0.132 | 0.100 | 0.138 |
| c23 | toxin (2) | 28–32 | 30 | 25 | 0.300 | 0.395 | 0.250 | 0.345 |
| c26 | shade (2) | 29–33 | — | 20 | — | — | 0.200 | 0.184 |
| c28 | lumen (1) | 28–31 | 5 | 20 | 0.050 | 0.033 | 0.200 | 0.138 |
| c29 | lumen (2) | 33–34 | — | 5 | — | — | 0.050 | 0.034 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### volcano

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day fog | Night clear | Night fog |
|---|---|---|---|---|---|---|---|---|
| c14 | stone (2) | 33–37 | 25 | 20 | 0.250 | 0.246 | 0.200 | 0.162 |
| c15 | stone (3) | 39–40 | 5 | 5 | 0.050 | 0.049 | 0.050 | 0.041 |
| c20 | gale (2) | 34–37 | 17 | 10 | 0.170 | 0.084 | 0.100 | 0.041 |
| c22 | toxin (1) | 33–35 | 10 | 7 | 0.100 | 0.098 | 0.070 | 0.057 |
| c23 | toxin (2) | 33–37 | 30 | 25 | 0.300 | 0.296 | 0.250 | 0.203 |
| c24 | toxin (3) | 40 | 3 | 5 | 0.030 | 0.030 | 0.050 | 0.041 |
| c26 | shade (2) | 34–37 | 10 | 25 | 0.100 | 0.197 | 0.250 | 0.406 |
| c27 | shade (3) | 40 | — | 3 | — | — | 0.030 | 0.049 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** |

#### route_5

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day snow | Day fog | Night clear | Night snow | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|
| c14 | stone (2) | 38–42 | 15 | — | 0.150 | 0.107 | 0.151 | — | — | — |
| c16 | frost (1) | 38–40 | 10 | 10 | 0.100 | 0.143 | 0.100 | 0.100 | 0.148 | 0.074 |
| c17 | frost (2) | 38–42 | 30 | 25 | 0.300 | 0.429 | 0.302 | 0.250 | 0.371 | 0.185 |
| c20 | gale (2) | 38–42 | 20 | 10 | 0.200 | 0.143 | 0.100 | 0.100 | 0.074 | 0.037 |
| c21 | gale (3) | 44 | 3 | — | 0.030 | 0.021 | 0.015 | — | — | — |
| c26 | shade (2) | 39–42 | — | 20 | — | — | — | 0.200 | 0.148 | 0.297 |
| c27 | shade (3) | 44 | — | 5 | — | — | — | 0.050 | 0.037 | 0.074 |
| c28 | lumen (1) | 38–40 | 7 | 10 | 0.070 | 0.050 | 0.106 | 0.100 | 0.074 | 0.111 |
| c29 | lumen (2) | 38–42 | 15 | 20 | 0.150 | 0.107 | 0.226 | 0.200 | 0.148 | 0.222 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### snowpeak

| Creature | Type (stage) | Lv | Day wt | Night wt | Day clear | Day snow | Day fog | Night clear | Night snow | Night fog |
|---|---|---|---|---|---|---|---|---|---|---|
| c15 | stone (3) | 44–46 | 5 | — | 0.050 | 0.037 | 0.047 | — | — | — |
| c17 | frost (2) | 42–46 | 30 | 25 | 0.300 | 0.445 | 0.286 | 0.250 | 0.385 | 0.175 |
| c18 | frost (3) | 48 | 5 | 5 | 0.050 | 0.074 | 0.048 | 0.050 | 0.077 | 0.035 |
| c20 | gale (2) | 42–45 | 15 | — | 0.150 | 0.111 | 0.071 | — | — | — |
| c21 | gale (3) | 45–48 | 10 | 5 | 0.100 | 0.074 | 0.048 | 0.050 | 0.038 | 0.018 |
| c26 | shade (2) | 42–45 | — | 15 | — | — | — | 0.150 | 0.115 | 0.211 |
| c27 | shade (3) | 46–48 | — | 10 | — | — | — | 0.100 | 0.077 | 0.140 |
| c28 | lumen (1) | 42–44 | 7 | 10 | 0.070 | 0.052 | 0.100 | 0.100 | 0.077 | 0.105 |
| c29 | lumen (2) | 42–46 | 25 | 25 | 0.250 | 0.185 | 0.357 | 0.250 | 0.192 | 0.263 |
| c30 | lumen (3) | 48 | 3 | 5 | 0.030 | 0.022 | 0.043 | 0.050 | 0.039 | 0.053 |
| **Sum** | | | 100 | 100 | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** | **1.000** |

#### cave (upper level, y 0..10) — time- and weather-invariant

| Creature | Type (stage) | Lv | Weight | Probability |
|---|---|---|---|---|
| c13 | stone (1) | 18–21 | 30 | 0.300 |
| c14 | stone (2) | 20–22 | 15 | 0.150 |
| c16 | frost (1) | 18–21 | 15 | 0.150 |
| c22 | toxin (1) | 18–21 | 15 | 0.150 |
| c25 | shade (1) | 18–21 | 25 | 0.250 |
| **Sum** | | | 100 | **1.000** |

#### cave (deep level, y -30..-10) — time- and weather-invariant

| Creature | Type (stage) | Lv | Weight | Probability |
|---|---|---|---|---|
| c14 | stone (2) | 22–25 | 30 | 0.300 |
| c16 | frost (1) | 22–24 | 20 | 0.200 |
| c17 | frost (2) | 26 | 5 | 0.050 |
| c23 | toxin (2) | 24–26 | 10 | 0.100 |
| c25 | shade (1) | 22–24 | 15 | 0.150 |
| c26 | shade (2) | 22–25 | 20 | 0.200 |
| **Sum** | | | 100 | **1.000** |

---

## 5. Obtainability

### 5.1 Matrix (all 30)

| Id | Family / stage | Primary type | How obtained | Earliest |
|---|---|---|---|---|
| c01 | f01 / 1 | electric | starter choice; else gift A or B (§5.2) | ch1 / ch5 / ch6 |
| c02 | f01 / 2 | electric | evolve c01 | — |
| c03 | f01 / 3 | electric | evolve c02 | — |
| c04 | f02 / 1 | fire | starter choice; else gift A or B | ch1 / ch5 / ch6 |
| c05 | f02 / 2 | fire | evolve c04 | — |
| c06 | f02 / 3 | fire | evolve c05 | — |
| c07 | f03 / 1 | water | starter choice; else gift A or B | ch1 / ch5 / ch6 |
| c08 | f03 / 2 | water | evolve c07 | — |
| c09 | f03 / 3 | water | evolve c08 | — |
| c10 | f04 / 1 | verdant | wild: route_1, forest, route_2 | route_1 |
| c11 | f04 / 2 | verdant | wild: forest (rare), lake, route_4; evolve c10 | forest |
| c12 | f04 / 3 | verdant | **evolution only** (c11) | — |
| c13 | f05 / 1 | stone | wild: route_1, forest, route_2, route_3, cave upper | route_1 |
| c14 | f05 / 2 | stone | wild: route_2 (rare), route_3, cave, lake, route_4, volcano, route_5; evolve c13 | route_2 |
| c15 | f05 / 3 | stone | wild rare: route_4, volcano, snowpeak; evolve c14 | route_4 |
| c16 | f06 / 1 | frost | wild: cave (both levels), lake, route_5 | cave |
| c17 | f06 / 2 | frost | wild: cave deep (rare), lake, route_5, snowpeak; evolve c16 | cave |
| c18 | f06 / 3 | frost | wild rare: snowpeak; evolve c17 | snowpeak |
| c19 | f07 / 1 | gale | wild: route_1, forest, route_2, route_3 | route_1 |
| c20 | f07 / 2 | gale | wild: route_2 (rare) … snowpeak (7 zones); evolve c19 | route_2 |
| c21 | f07 / 3 | gale | wild rare: route_5, snowpeak; evolve c20 | route_5 |
| c22 | f08 / 1 | toxin | wild: route_1 (night), forest, route_2, route_3, cave upper, route_4, volcano | route_1 |
| c23 | f08 / 2 | toxin | wild: route_3, cave deep, lake, route_4, volcano; evolve c22 | route_3 |
| c24 | f08 / 3 | toxin | wild rare: volcano; evolve c23 | volcano |
| c25 | f09 / 1 | shade | wild: route_1 (night), forest (night), route_2 (night), route_3, cave, lake (night) | route_1 |
| c26 | f09 / 2 | shade | wild: route_2 (night, rare), route_3, cave deep, lake, route_4, volcano, route_5, snowpeak; evolve c25 | route_2 |
| c27 | f09 / 3 | shade | wild rare: volcano (night), route_5 (night), snowpeak (night); evolve c26 | volcano |
| c28 | f10 / 1 | lumen | wild: route_1 (day), forest, route_2 (night), route_3 (night), lake, route_4, route_5, snowpeak | route_1 |
| c29 | f10 / 2 | lumen | wild: lake (rare), route_4 (night), route_5, snowpeak; evolve c28 | lake |
| c30 | f10 / 3 | lumen | wild rare: snowpeak; evolve c29 | snowpeak |

Checks: every stage-1 of every wild line (c10, c13, c16, c19, c22, c25, c28) is catchable; c12 is evolution-only (allowed). Stage-1s of the shade line appear only at night in routes 1–2 but also time-invariantly in the cave, so no line requires night play. All 30 are completable in one save: 21 wild-line species via capture/evolution + 3 starter lines × 3 via choice + two deterministic gifts + evolution.

### 5.2 The two unchosen starters (deterministic, single-player, no waits)

Cyclic order: **electric (c01) → fire (c04) → water (c07) → electric**. Gift A = the next line after the chosen one; Gift B = the remaining one. The rival picks Gift B's line (rival's creature is therefore the species the player later rescues; Creative Director may reverse to "type-advantage" pick if the Systems type chart supports it).

| Player chose | Gift A (ch5) | Gift B (ch6) | Rival's starter |
|---|---|---|---|
| c01 Voltra | c04 | c07 | c07 |
| c04 Emberhorn | c07 | c01 | c01 |
| c07 Rippleback | c01 | c04 | c04 |

- **Gift A — ev_12, main story (unmissable):** on first entering `town_2` with `flag_trial_3_cleared`, the mentor waits at the Tending House (18, 26): "This one kept humming your crest melody." Delivers stage-1 Gift A at **Lv 22**, holding nothing, with its standard learnset for Lv 22. Sets `flag_gift_a_received`. The path to G5 (the lake) is in town_2, so the event fires before the player can progress. If party is full, the creature goes to storage with an on-screen notice (storage cap 300 per ANCHORS; if storage is also full the event waits and repeats on each town_2 entry, with the mentor asking the player to make room — Systems/UI own the full-storage message).
- **Gift B — q_side_foundry_rescue (optional but always available, journal auto-adds):** after `flag_trial_5_cleared`, the Foundry vault rust-lock (−40, 60) can be Dissolved (toxin, which the player necessarily has for G9). Inside, defeat `t_hush_warden` (4 creatures, Lv 38–39), then `npc_captive_keeper` releases the captive stage-1 Gift B at **Lv 30**. Sets `flag_gift_b_received`. Reminders: the mentor calls via Tuning Fork on entering town_3 after `flag_trial_5_cleared` if not done, and again at the league gate hall.
- Both gifts are delivered at stage 1 so the encyclopedia registers stage 1 and later stages via evolution. If Systems' stage-1→2 level threshold is below the gift level, the creature evolves at its first level-up (evolution check on level-up).

---

## 6. Quests

Main quests (`q_main_*`) auto-start; journal shows current step and target zone/marker. Rewards in coins are provisional (Systems owns the economy).

| Id | Ch | Prerequisite | Steps (completion flag per step) | Rewards |
|---|---|---|---|---|
| q_main_01 First Resonance | 1 | new game | choose starter (`flag_starter_chosen`) → rival 1 (`flag_rival_1_done`) → open Tri-Gate (`flag_resonance_tutorial_done`) | starter, Tuning Fork, 5 `i_capture_t1`, 3 `i_tonic_s` |
| q_main_02 The Dimmed Tree | 2 | q_main_01 | reach Great Lantern Tree → defeat 2 Hush (`flag_forest_damper_removed`) → clear trial_1 (`flag_trial_1_cleared`) → cross Sprout Bridge | Crest 1, D01, Bloom, fast travel, 800 |
| q_main_03 Windward | 3 | q_main_02 | route_2 rival (`flag_rival_2_done`) → reach town_2 (`flag_town2_arrived`) → clear trial_2 | Crest 2, D02, Updraft, 1500 |
| q_main_04 Hollow Voices | 4 | q_main_03 | cross Gust Gap → defeat cave-mouth Hush (`flag_route3_blockade_cleared`) → clear hideout (`flag_cave_hideout_cleared`, `flag_veil_unlocked`) → clear trial_3 | Crest 3, D03, Shift, Veil, 2500 |
| q_main_05 Glasswater | 5 | q_main_04 | receive Gift A (`flag_gift_a_received`) → move boulder → stop pump (`flag_lake_pump_stopped`) → rival 3 → clear trial_4 → freeze outflow | Gift A, Crest 4, D04, Freeze, 3500 |
| q_main_06 Kiln | 6 | q_main_05 | reach town_3 (`flag_town3_arrived`) → cross Scorch Gap → raid Foundry (`flag_foundry_raided`) → clear trial_5 | Crest 5, D05, Dissolve, 4500 |
| q_main_07 Rimewind | 7 | q_main_06 | dissolve north gate → freeze river → rival 4 → reach snowpeak → clear trial_6 | Crest 6, D06, Illuminate, 5500 |
| q_main_08 The Great Damper | 8 | q_main_07 | light ice tunnel (`flag_ice_tunnel_lit`) → defeat Hush sentry → defeat Director Vell (`flag_faction_boss_defeated`) | 8000, `i_capture_t4` ×1 |
| q_main_09 Chorus Spire | 8 | q_main_08 | enter league → defeat rival (`flag_rival_final_done`) → defeat champion (`flag_champion_defeated`) | 15000, credits, `flag_postgame` |

Side quests:

| Id | Giver @ zone | Prerequisite | Steps | Rewards |
|---|---|---|---|---|
| q_side_lost_kettle | npc_grandpa_kettle, town_1 | `flag_starter_chosen` | find `i_old_kettle` (sparkle, visible) in route_1 stream bed (−38, −20) → return | 500, `i_tonic_s` ×3 |
| q_side_lantern_moths | npc_lantern_apprentice, forest | `flag_forest_damper_removed` | relight 4 moss lanterns at (−40, 70), (50, 30), (−75, 0), (15, −10); each accepts Spark **or** Kindle **or** Illuminate **or** a `i_glowcap` (4 glowcaps lie visibly in forest at (−30, 30), (65, 45), (−65, −30), (5, 60)) → return | D25, `i_capture_t2` ×3 |
| q_side_windmill_repair | npc_miller, town_2 | `flag_town2_arrived` | restart 3 windmills: Spark each, **or** bring `i_gear` ×3 (route_2 at (40, 70), (−40, 0), (25, −40)) → return | D26, 1500 |
| q_side_kite_contest | npc_kite_girl, route_1 | `flag_trial_2_cleared` | Updraft at route_1 Kite Hill (25, 30), route_2 vent (−30, −20), route_3 mesa (−10, −22) to retrieve 3 kites → return | 1500, `i_tonic_m` ×3 |
| q_side_survey | npc_archivist, town_2 (later town_3) | `flag_town2_arrived` | stage 1: register 10 species; stage 2: 20; stage 3: all 30 | S1: D27; S2: `i_capture_t3` ×5 + 3000; S3: Archivist's Sash (cosmetic outfit) + `i_capture_t4` ×2 |
| q_side_shade_tales | npc_storyteller, route_3 | `flag_veil_unlocked` | pass 3 shadow curtains (route_3 sinkhole, cave curtain, town_3 museum basement) and read each "tale page" → return | D28, 2000 |
| q_side_geode_survey | npc_geologist, cave | `flag_route3_blockade_cleared` | find 4 hidden geode samples: cave (75, −40) upper, (−20, 70) upper, (−75, 40) deep, (10, −75) deep (after hideout) → return | `i_capture_t3` ×3, 2000 |
| q_side_market_courier | npc_courier, town_3 | `flag_town3_arrived` | deliver parcel to npc_basecamp_keeper (volcano) → bring reply back | `i_capture_t3` ×5, 2500 |
| q_side_foundry_rescue | auto (journal), volcano | `flag_trial_5_cleared` | Dissolve vault lock (−40, 60) → defeat t_hush_warden → talk to npc_captive_keeper | Gift B (§5.2), `i_capture_t3` ×2 |
| q_side_lake_lights | npc_lodge_keeper, lake | `flag_trial_6_cleared` | Illuminate 3 shore shrines (−60, −50), (60, −20), (−40, 60) → return | D29, `i_tonic_max` ×3 |
| q_side_rival_rematch | npc_rival, town_1 | `flag_postgame` | defeat t_rival_post (6, Lv 55) | D30, `i_capture_t4` ×1 |

Totals: 9 main + 11 side quests. No quest step requires real-time waiting, trading, or another player.

---

## 7. Items

### 7.1 Overworld pickups (V = visible prop, H = hidden: shimmer visible within 3 m, or revealed by Illuminate within 10 m)

| Zone | V/H | Pos (x,z) | Item × qty |
|---|---|---|---|
| town_1 | V | (28, 30) | `i_tonic_s` ×2 |
| town_1 | H | (3, −2) fountain rim | `i_capture_t1` ×1 |
| route_1 | V | (20, 50) | `i_capture_t1` ×3 |
| route_1 | V | (−30, 10) | `i_tonic_s` ×1 |
| route_1 | H | (−15, 60) | `i_coin_pouch_s` (200) |
| forest | V | (−20, 50) | `i_tonic_s` ×2 |
| forest | V | (50, 20) | `i_cure_basic` ×2 |
| forest | V | (−60, −20) | `i_capture_t1` ×3 |
| forest | V | (5, 15) | D08 |
| forest | H | (70, −10) | `i_revive` ×1 |
| route_2 | V | (−30, 60) | `i_tonic_m` ×1 |
| route_2 | V | (35, −10) | `i_capture_t2` ×2 |
| route_2 | H | (0, −20) | `i_revive` ×1 |
| town_2 | V | (−50, 30) | `i_cure_all` ×1 |
| town_2 | H | (−30, −40) | `i_coin_pouch_m` (800) |
| route_3 | V | (60, −20) | `i_tonic_m` ×2 |
| route_3 | V | (−20, 30) | `i_capture_t2` ×3 |
| route_3 | V | (−40, 20) | D11 |
| route_3 | H | (10, −30) | `i_revive` ×1 |
| cave | V | (50, 40) | `i_tonic_m` ×1 |
| cave | V | (−10, 50) | `i_capture_t2` ×2 |
| cave | V | (−60, −10) | `i_cure_all` ×1 |
| lake | V | (−50, 60) | `i_tonic_l` ×1 |
| lake | V | (70, 30) | `i_revive` ×1 |
| lake | V | (−80, −60) | `i_capture_t3` ×2 |
| lake | H | (30, 90) | `i_coin_pouch_m` (800) |
| town_3 | H | (50, −50) lookout top | `i_revive` ×1 |
| route_4 | V | (70, 30) | `i_tonic_l` ×1 |
| route_4 | V | (0, 20) | `i_capture_t3` ×2 |
| route_4 | V | (−40, −30) | `i_charge_restore` ×1 |
| route_4 | H | (20, −40) | `i_revive` ×1 |
| volcano | V | (50, −10) | `i_tonic_l` ×2 |
| volcano | V | (−50, 20) | `i_cure_all` ×2 |
| volcano | V | (20, 70) | D17 |
| volcano | H | (−80, 0) | `i_coin_pouch_l` (2000) |
| route_5 | V | (30, 60) | `i_tonic_l` ×1 |
| route_5 | V | (−30, −10) | `i_revive` ×2 |
| route_5 | H | (40, −70) | `i_charge_restore` ×2 |
| snowpeak | V | (−60, 50) | `i_tonic_max` ×1 |
| snowpeak | V | (60, −10) | `i_revive_full` ×1 |
| snowpeak | H | (−20, 70) | `i_coin_pouch_l` (2000) |

Quest-item pickups (`i_old_kettle`, `i_glowcap` ×4, `i_gear` ×3, geode samples ×4) are listed in §6. Secret rewards are in §2.7. Pickups are one-time (saved as `pickup_<zone>_<index>` in the save's collected set).

### 7.2 Teaching discs (30 slots; Systems Designer maps each slot to a move id `m###` and decides reusability)

| Disc | Source | Suggested type / band |
|---|---|---|
| D01–D06 | trial_1..trial_6 leader rewards | verdant / gale / stone / frost / fire / lumen, matching trial, mid-power |
| D07 | sec_01 route_1 islet | water, early |
| D08 | forest visible (5, 15) | lumen, early |
| D09 | sec_03 forest conduit | electric, early |
| D10 | sec_04 route_2 ledge | stone, early-mid |
| D11 | route_3 visible (−40, 20) | shade, mid |
| D12 | sec_09 route_3 sinkhole | shade, mid |
| D13 | sec_06 cave curtain | toxin, mid |
| D14 | sec_10 lake islet | water, mid |
| D15 | sec_11 museum basement | lumen, mid |
| D16 | sec_12 route_4 crust | toxin, mid-late |
| D17 | volcano visible (20, 70) | fire, mid-late |
| D18 | sec_14 obsidian curtain | shade, late |
| D19 | sec_15 route_5 avalanche cave | frost, late |
| D20 | sec_16 snowpeak ice wall | gale, late |
| D21, D22 | town_2 shop | neutral-utility (e.g. protect-like, stat-up) |
| D23, D24 | town_3 shop | electric / verdant coverage |
| D25–D30 | side quest rewards (§6) | D25 fire, D26 electric, D27 verdant, D28 shade, D29 lumen, D30 frost (late, strong) |

Type coverage: every one of the 10 types has ≥ 2 disc slots.

---

## 8. Environmental storytelling and character-forward presentation

The world's visual argument: **Resonance is color and sound**; the Hush's Dampers **mute** both. Every story beat is shown, not just told, through saturation and sound.

1. **Muting as a visible state.** Any area under a Hush Damper renders at reduced saturation (shader parameter `muteAmount` 0–0.7 in a radius, e.g. 25 m around the forest Damper) and its ambience layer is low-passed. Defeating the Damper plays a radial "color wave" (0.8 s) and the zone theme's melody layer returns. Rendering Engineer owns the implementation; the World data provides radius and center per Damper (forest (25, −25) r 25; cave hideout (30, −55) r 30; lake pump (−75, 10) r 35; volcano Foundry (−30, 50) r 30; Great Damper (0, −90) r 60 plus region-wide 0.2 mute on all zones until ev_21).
2. **Creatures at work and play (towns).** Kettlebrook: small verdant creatures tending herb planters, a lumen creature asleep in the Chime Tower. Pinwheel Rise: gale creatures on harnesses turning windmills; kids racing them with pinwheels. Crossvale: market stalls with stone creatures hauling carts, a toxin creature cleaning the gutters (a sympathetic take on the type). Each town has ≥ 6 ambient creature vignettes with clear silhouettes and one exaggerated emotional pose each (sleep, cheer, sulk, show-off, startled, proud).
3. **The rival's trail.** Chalk doodles of the rival's starter appear on walls one zone ahead of each rival battle (route_1 Tri-Gate, route_2 arch, lake dock, route_5 cairns) — cheerful, boastful, then (after rival 3) a doodle of both starters side by side.
4. **Faction evidence.** Grey Hush equipment crates with a stylized closed-mouth glyph, abandoned headphones (they wear sound-cancelling hoods), dead lanterns and dim crystals near their sites; after defeat, locals decorate the same spots.
5. **Landmark sightlines.** Chime Tower visible from route_1; Great Lantern Tree glow visible from route_1's north end; Pinwheel Rise windmills visible from route_2; Mount Kiln's glow visible from town_3 at night; Aurora over snowpeak visible from every northern zone at night. Each is a far-LOD silhouette (Rendering budget).
6. **Murals and champions.** Museum murals in town_3 depict past champions with their partners in dynamic poses — a lore hook for Resonance and a showcase for the character language.
7. **Trial personalities.** Each trial interior is staged as its leader's workshop: lantern garden, sail loft, sculpture hall, ice rink, forge, star dome; leaders have signature entrance animations (Creative Director) and their creatures idle in-character around the stage.
8. **Weather mood.** Rain in forest makes lanterns flicker brighter; fog on route_3 reveals the storyteller's ghost-shadow puppets; snow on snowpeak makes the aurora hum (music layer).

---

## 9. Pacing estimate (unmeasured; for planning only)

| Chapter | Zones | Main-path estimate |
|---|---|---|
| 1 | town_1, route_1 | 0:35 |
| 2 | forest, trial_1 | 0:60 |
| 3 | route_2, town_2, trial_2 | 0:60 |
| 4 | route_3, cave, trial_3 | 1:20 |
| 5 | lake, trial_4 | 1:00 |
| 6 | town_3, route_4, volcano, trial_5 | 1:20 |
| 7 | route_5, snowpeak, trial_6 | 1:10 |
| 8 | summit, league | 0:35 |
| **Total** | | **≈ 8:00 main path** (+ ≈ 2–3 h optional side content) |

These are design estimates, **not playtested**.

---

## 10. Acceptance criteria

1. Content JSON contains exactly the 14 exterior zones and 6 trial interiors listed, with sizes, exits, arrival points, waystones and safe-return points matching §1.3–§1.4 (validator compares ids and coordinates).
2. Graph validator: every exit has a reciprocal exit; BFS from `town_1`, applying main-quest flags in order, reaches every zone and trial door; with no flags set, only `town_1` is reachable.
3. Softlock validator: for each mandatory gate in §3.1 with a type requirement, the required type appears (as primary or secondary) in a wild table of a zone reachable before that gate, in the day-clear column with weight > 0; plus starter rule for G1.
4. Every encounter table's weights sum to 100 per time band; recomputed weather probabilities match §4.3 within ±0.001 and each printed column sums to 1.000.
5. Obtainability validator: each of c01–c30 has ≥ 1 source (wild table, evolution from an obtainable species, or gift event); gift A and B mapping produces exactly the two unchosen starters for each of the 3 choices.
6. Every `t_*` referenced in §2.9 exists with team size and level range within the stated bounds; trial leader ace levels are 12/18/25/32/39/45 and champion ace 50.
7. Every quest's prerequisites reference existing flags; no quest step requires real-time waits or multiplayer.
8. All 30 disc slots have exactly one source; all pickups have unique ids and coordinates inside zone bounds and outside exclusion zones.
9. Roaming limits in §4.2 enforced at runtime (QA: count never exceeds max; no stacked encounters in a 60 s scripted overlap test).
10. Playtime is reported as "estimate — not measured" until QA playtests.

## 11. Dependencies

- **Creative Director (`creative_direction.md`):** final names for everything WN; final Resonance verb names/visuals; chapter dialogue; rival/antagonist identities; whether rival picks Gift B's line or the type-advantaged line; zone music themes.
- **Creature Art Director (`creatures.md`):** secondary types of stage 2/3 creatures (may broaden gate eligibility, never narrow it); habitat consistency with §4.3; body scale → contact radius; roaming behavior class per species.
- **Systems Designer (`systems.md`):** item ids/prices/effects (`i_*` here are provisional), capture tiers, money floor/penalty, evolution levels (gift levels 22/30 assume stage-1→2 around Lv 16–20), attuned-type battle bonus, weather battle effects, exact trainer teams/AI tiers, disc → move mapping, storage cap behavior.
- **Rendering Engineer:** feasibility of 200×200 zones with the listed terrain heights, far-LOD landmarks, mute shader, ferry and Updraft glide animations; roaming counts within active-creature budgets (max 10 in cave, 8 elsewhere).
- **QA Lead:** graph, softlock, encounter-sum and obtainability validators (§10).

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Only starter families are primary fire/water/electric; lake has no wild water-primary species, volcano no wild fire-primary | Thematic dissonance; fire trial leader must use the f02 starter line | Ask creatures.md to give a secondary water type to c17/c11 and secondary fire to c23/c14 stage 2/3; trial_5 leader uses f02 (allowed: NPCs may own starter lines). |
| 20 scenes is a large content load for one developer | Schedule | Shared trial interior layout; shared rest-site prefab; route zones reuse spawn/anchor generators; towns use one kit. |
| Updraft/ferry scripted movement edge cases (interrupts, reload mid-glide) | Stuck states | Scripted movements are atomic: saves are blocked during them; on reload the player spawns at the departure side. |
| Night-only flavor (shade in early routes) could frustrate | Minor | Cave provides time-invariant shade; rest-until-dusk at any healer. |
| Gift levels vs evolution thresholds | Gift may evolve immediately | Documented; Systems may adjust gift level. |
| Level curve relies on optional trainers | Under-leveled at trials | Systems tunes XP; wild levels ramp with trial targets. |
| Stage-3 rare wild spawns (c15, c18, c21, c24, c27, c30) at weights 3–5 | Could trivialize late trials if caught early | They appear only in zones after the trial where they'd matter most; weights ≤ 5. |

## 13. Unresolved questions

1. Final names for all WN entries (blocked on creative_direction.md).
2. Should field actions accept **any** party member of the type (friendlier) instead of the lead with one-button swap (current design)? World design works either way.
3. Should the rival choose Gift B's line (current) or the line with type advantage over the player's?
4. Do wild stage-3 rares (weights 3–5) fit the Systems difficulty curve, or should they be evolution-only like c12?
5. Is `league` acceptable as an extra zone id, or should the champion venue be a `snowpeak` sub-area?
6. Should the Tri-Gate (G1) also accept verdant (Bloom) to stay passable if a future change allows releasing the starter? Currently prevented by the release block.
7. Money currency name and exact penalty on wipe (Systems/Creative).
