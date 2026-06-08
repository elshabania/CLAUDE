# Abu Dhabi Population Explorer

An interactive Next.js app for comparing **resident population** and
**population density** across Abu Dhabi's three regions — and seeing how they
change over time — using official open data.

## What it shows

- **Schematic region map** colour-coded by the selected metric (population,
  density, or share of the emirate), with click-to-select regions.
- **Year slider** across the snapshots that have an official regional
  breakdown: 2011, 2023 (Census) and 2024.
- **Trend chart** of the emirate total (2005 → 2024) plus per-region lines.
- **Comparison bars**, a **per-region detail panel** (population, density,
  share, growth and annualised CAGR) and a full **data table**.
- A **methodology + sources panel** that documents exactly where every figure
  comes from and which values are derived or approximate.

## Data

The three regions are the Capital Region (Abu Dhabi city), the Eastern Region
(Al Ain) and the Western Region (Al Dhafra / formerly Al Gharbia).

| Year | Type | Key source |
| --- | --- | --- |
| 2011 | Mid-year estimate | Statistics Centre – Abu Dhabi (SCAD) |
| 2023 | Census | Abu Dhabi Census 2023 (emirate total 3,789,860) |
| 2024 | Estimate | SCAD (emirate ≈ 4.14 million) |

The 2023 per-region split is back-derived from SCAD's reported 2024 per-region
growth rates so it reconciles with both the census total and the 2024 estimate.
2005 and 2008 emirate totals are approximate historical anchors. Region land
areas are approximate, so density is **indicative**. All of this is spelled out
in-app under "How these numbers were compiled."

> **On trips / mobility data:** Abu Dhabi does not currently publish open
> trip / origin-destination volumes by area as a time series, so this app
> focuses on population and density. The data layer (`lib/abudhabi-data.ts`) is
> structured so a `trips` metric can be added if such open data appears.

All data and sources live in `lib/abudhabi-data.ts`.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Also included

The earlier **Road CAD Viewer** (DXF/DWG upload + road-geometry detection)
remains available at [`/cad`](http://localhost:3000/cad).
