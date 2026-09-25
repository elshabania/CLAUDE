# Content formats (implementation contract, orchestrator-owned)

All runtime content is JSON under `src/data/`, validated with zod at startup and in `npm test`. Ids are stable; names are display text. Coordinates: zone-local metres, origin at zone centre, **+x east, +z south, −z north** (world.md convention: exits at (0,−90) are "north"). `yaw` is a **compass bearing in degrees** (world.md convention): 0 = facing north (−z), 90 = facing east (+x), 180 = facing south (+z), 270 = facing west (−x). Code converts with `rotationY = π − yaw·π/180` (`src/world/yaw.ts`).

## 1. Zones — `src/data/zones/<zone_id>.json`
Schema: `src/world/zoneTypes.ts` (`ZoneSpec`) and `src/data/zones.ts` (zod). Reference example: `src/data/zones/route_1.json`.
- `terrain`: procedural heightfield. `size` [W,D] metres (use world.md size + ~20 m margin for the rim), `base` height, `amp` noise amplitude (2–5 lowlands, 6–12 mountains), `scale` noise feature size (20–40), `rim` boundary wall height (10–20; interiors 8), `rimWidth` (8–16; interiors 4). `hills` gaussian bumps `{at,r,h}` (negative h = hollow). `flats` flattened clearings `{at,r,h?}` — put one under every building, NPC group, Chordstone, battle stage, trainer and node. `paths` flattened strips `{pts,w}` connecting exits, spawns and landmarks (w 4–7). `water` basins `{at,r,rz?,depth,level}` (level ≈ local ground; depth ≥ 0.8 blocks walking; lava in the volcano biome renders as lava).
- Exits must sit on the rim at the zone edge (e.g. z = ±(D/2 − 4)); the rim is automatically lowered around each exit. Every exit's `to/spawn` must exist in the target zone, and each target zone must have a matching return exit. Spawns ~8 m inside the exit, facing into the zone.
- `props[]` (`kind` from BUILDERS in `src/world/props/buildings.ts`: `house, house2, hearth, chordstone, lamp, sign, well, stall, bridge, hall_root, hall_stone, hall_mere, hall_vane, hall_forge, hall_rime, spire, windmill, tent, stilthouse, crate, wall`; or scatter kinds placed individually: `tree, blossom, pine, snowpine, hollowtree, willow, deadtree, bush, rock, boulder, crystal, basalt, icerock, mushroom, fence`). Optional: `yaw, s (scale), color, roof, w, d, h, label, showIf, hideIf` (flag expressions; use for gates/bridges/blockers that change with story).
- `scatter[]` `{kind, density per 1000 m², minDist}` from the kinds above plus `grass, flowers, reeds`. Typical: trees 0.5–1.5, bushes 1–2, grass 8–16, flowers 3–6, rocks 0.3–1.
- `npcs[]` `{id, at, yaw, look, name, dialogue, role?, shop?, showIf?, hideIf?}` — `look` ∈ keys of `src/data/looks.ts` LOOKS (cass, oriel, odile, brann, vey, stillhand, wren, dorran, nerys, tamsin, bastian, isaure, rhea, hearth, hearth2, hearth3, chandler, chandler2, steward, marra, villagerA–D, hiker, youth, angler, scholar, veteran, climber). `dialogue` = id in the zone's dialogue file.
- `trainers[]` `{id, at, yaw, sight, showIf?, hideIf?}` — ids must exist in `trainers.json` (generated from world.md §2.9 + systems §14.2). `sight` metres (0 = must talk).
- `nodes[]` Resonance nodes `{id, type, at, yaw, kind, mandatory?, reward?, opens?, blocker?}` — `blocker` `{at,w,d,yaw}` is a solid wall removed once the node is solved (for mandatory gates put it across the path); `opens` = exit id that stays closed until solved.
- `pickups[]` `{id, at, item, count?, money?, hidden?, showIf?}` (ids unique across the game: `pk_<zone>_<nn>`).
- `wildRegions[]`, `maxWild` (≤ 6), `encounters` (= zone id when it has a table), `battleStages[]` (2–4 flat, open spots `{at,yaw}`; also add them as `flats`), `waystone` [x,z] = the Chordstone position, `hearthSpawn` (spawn id used after a wipe when the zone has a Hearthrest).
- Interiors (`indoor: true`): trial halls `trial_1..6`, `stillhouse`, `league`. Flat terrain (`amp` 0–0.3), high rim (walls), size ~50×70, themed props; hall gimmick = blockers (props with `hideIf`) that disappear as hall Tuners are beaten (`flag_<trainer>_won` is set automatically on a win).

## 2. Dialogue — `src/data/dialogue/<zone_id>.json`
`Record<dialogueId, Dialogue>`; `Dialogue = { variants: Variant[] }`; the **first** variant whose `if` holds plays.
`Variant = { if?: expr, lines: Line[], actions?: Action[], choice?: { options: { label: string, actions: Action[] }[] } }`
`Line = { s?: speaker display name (default: NPC name), t: text }` — `{player}` expands to the player's name, `{starter}` to the starter's name, `{rival_starter}` / `{leftover}` likewise.
Expressions: flag ids combined with `!`, `&&`, `||`, parentheses; also `keynotes>=N`, `has:<item>`, `caught:<species>`.
Actions (executed in order after the lines): `{"set": flag}`, `{"unset": flag}`, `{"heal": true}`, `{"shop": shopId}`, `{"give": itemId, "n": 1}`, `{"money": n}`, `{"kin": speciesId, "lv": n}`, `{"battle": trainerId}`, `{"starter": true}`, `{"quest": questId, "step": n}`, `{"questDone": questId}`, `{"warp": zoneId, "spawn": spawnId}`, `{"fosterage": true}`, `{"recall": true}`, `{"steward": nodeId}`, `{"ledger": true}`, `{"healHint": true}`.
Use creative_direction.md v2 Appendix A lines (ids `dlg_*`) wherever they exist; write new lines in the same warm, lightly comic voice. Never use franchise terms (see release gate denylist): kin, Tuner, troupe, Fosterage, Keynote, Cadence Hall, Cantor, Chime, Kinsong, Etude, Hearthrest, Chandlery, tallies.

## 3. Generated content (orchestrator scripts — do not hand-edit)
- `src/data/content/encounters.json` from world.md §4.3 (`scripts/build-world-content.py`).
- `src/data/content/trainers.json` from world.md §2.9 + systems.md §14.2.
- `src/data/content/species.json` from creatures.md + systems.md (`scripts/build-species.py`).
- `moves.json`, `types.json`, `families.json` from systems.md (`scripts/extract-systems.py`).
