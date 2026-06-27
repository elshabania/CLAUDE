# STEAM 2040 — data formats (Part 1 of the build brief)

The model covers Abu Dhabi (STEAM v3.2.2, MMU4). Coordinates are projected
metres (UTM-style; see the `.prj`). Three inputs: network, zones, matrix.

## 1A. Network (links)

ESRI shapefile `v322_AD_20250606_v19` (~212,977 polyline links) or a CSV.
Required DBF fields:

| Field | Meaning |
|-------|---------|
| `OBJECTID` | unique link id |
| `A` / `B` | from / to node id (fallback `FNODE` / `TNODE`) |
| `LINK_2040` | 1 if the link exists in the 2040 network (filter on this) |
| `LTYPE_2040` | 2040 link-type code → facility class |
| `LANE_2040` | number of lanes in 2040 |
| `SHAPE_Leng` | link length (m) |

Optional: `LT40_OWAY`/`LN40_OWAY`/`LI40_OWAY` (one-way if non-zero), `RAIL`
(exclude), road-class labels, `BUSL_2040`, `IIZONES`/`PC`.

### Facility classification from `LTYPE_2040`

```
1-9    -> fwy     10-15 -> ramp    20-21 -> art    22-27 -> coll
28-29  -> local   30-39 -> rural   40-44 -> junc
```

Protected / non-road types (excluded from road assignment):
`{60,61,62,63,65,70,71,72,73,99,100}`.

### Default capacity (veh/h/lane) and free-flow speed (km/h)

| class | cap/lane | speed |
|-------|----------|-------|
| fwy | 2000 | 100 |
| ramp | 1500 | 60 |
| art | 900 | 60 |
| coll | 700 | 50 |
| rural | 600 | 80 |
| local | 500 | 30 |
| junc | 600 | 30 |

`capacity = max(1, LANE_2040) · cap/lane`,
`free_flow_time_s = SHAPE_Leng / (speed_kmh / 3.6)`.

## 1B. Zones (land use)

`STEAM_landuse_2040.csv`, one row per zone (~6000; first ~3692 internal),
29 columns. Key fields the engine uses: `Z` (1-based id), `DISTRICT`, `AREATYPE`,
`URBAN_RURA`, `METRO_ACCESS`, `REG`, `LU_CLASS`, `SHAPEAREA`, `POP_TOT`, `HH`,
`WORKER`, `STUDENT`, `LABOURER`, the GFA columns (`RES_/RETAIL_/OFFICE_/IND_/
SCHOOL_/MED_/OTHER_GFA`, `GFA_TOTAL`), `ACTIVITY`, `CENTROIDX`, `CENTROIDY`.

Each zone loads at its centroid via a connector to the nearest network node.

## 1C. Matrix (OD trips)

Export the CUBE `.MAT` to a long CSV: `origin_zone, destination_zone, trips`
(header optional, sparse zeros may be omitted). Zone ids match `Z`. The STEAM
matrix is a 24-hour total; multiply by a **period factor** before assignment
(AM peak hour ≈ 0.10). Intrazonal trips (O==D) don't load the network. For
multiple user classes, provide one CSV each and combine with PCE factors
(e.g. HGV = 2.5 PCE).
