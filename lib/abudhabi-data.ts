// Abu Dhabi population data by region.
//
// Abu Dhabi Emirate is administratively divided into three regions
// (municipal regions): the Capital Region (Abu Dhabi city and surrounds),
// the Eastern Region (Al Ain) and the Western Region (Al Dhafra, formerly
// Al Gharbia).
//
// All figures here are compiled from public, official open sources — chiefly
// the Statistics Centre – Abu Dhabi (SCAD) and the Abu Dhabi Census 2023.
// See `SOURCES` and `METHOD_NOTES` below for exact provenance and the small
// number of derived values. There is, deliberately, NO fabricated precision:
// where a figure is derived or approximate it is flagged.

export type RegionCode = "AUH" | "AIN" | "DHA";

export interface Region {
  code: RegionCode;
  name: string;
  shortName: string;
  /** Approximate land area in km². Used for indicative population density. */
  areaKm2: number;
  /** Approximate centroid in the schematic map's 0..1000 / 0..640 viewBox. */
  label: { x: number; y: number };
  /** Schematic (not-to-scale) polygon for the map, in the same viewBox. */
  polygon: string;
}

export interface YearSnapshot {
  year: number;
  /** Population per region for this snapshot. */
  population: Record<RegionCode, number>;
  /** What kind of figure this is, for honest labelling in the UI. */
  kind: "census" | "estimate";
  /** Source key into SOURCES. */
  source: string;
}

export const REGIONS: Region[] = [
  {
    code: "AUH",
    name: "Abu Dhabi (Capital Region)",
    shortName: "Capital",
    areaKm2: 6429,
    label: { x: 520, y: 250 },
    polygon: "70,200 250,175 470,165 690,170 880,185 930,205 560,360",
  },
  {
    code: "AIN",
    name: "Al Ain (Eastern Region)",
    shortName: "Al Ain",
    areaKm2: 13100,
    label: { x: 800, y: 370 },
    polygon: "930,205 930,590 560,360",
  },
  {
    code: "DHA",
    name: "Al Dhafra (Western Region)",
    shortName: "Al Dhafra",
    areaKm2: 47811,
    label: { x: 320, y: 470 },
    polygon: "560,360 930,590 70,590 70,200",
  },
];

export const REGION_BY_CODE: Record<RegionCode, Region> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r]),
) as Record<RegionCode, Region>;

// ---------------------------------------------------------------------------
// Population by region, by snapshot year.
// ---------------------------------------------------------------------------
//
// 2011  – SCAD official mid-year estimate. Published shares 61.8% / 27.6% /
//         10.6% of a 2.12M emirate total.
// 2023  – Abu Dhabi Census 2023. Emirate total 3,789,860 is the official
//         census count. The per-region split shown here is derived so that
//         it reconciles exactly with BOTH the census total and SCAD's
//         officially reported 2024 per-region growth rates (Al Ain +4.4%,
//         Al Dhafra +6.2%). See METHOD_NOTES.
// 2024  – SCAD official estimate. Emirate ≈4.14M; per-region absolutes as
//         reported by SCAD.
export const SNAPSHOTS: YearSnapshot[] = [
  {
    year: 2011,
    kind: "estimate",
    source: "scad-2011",
    population: { AUH: 1_310_000, AIN: 580_000, DHA: 230_000 },
  },
  {
    year: 2023,
    kind: "census",
    source: "census-2023",
    population: { AUH: 2_537_825, AIN: 945_316, DHA: 306_719 },
  },
  {
    year: 2024,
    kind: "estimate",
    source: "scad-2024",
    population: { AUH: 2_820_000, AIN: 986_910, DHA: 325_735 },
  },
];

// Emirate-wide totals for additional historical context on the trend line.
// These years are not broken down by region in the open sources.
export interface EmirateTotal {
  year: number;
  total: number;
  kind: "census" | "estimate";
  source: string;
  approximate?: boolean;
}

export const EMIRATE_TOTALS: EmirateTotal[] = [
  { year: 2005, total: 1_400_000, kind: "census", source: "census-2005", approximate: true },
  { year: 2008, total: 1_570_000, kind: "estimate", source: "scad-2008", approximate: true },
  { year: 2011, total: 2_120_000, kind: "estimate", source: "scad-2011" },
  { year: 2023, total: 3_789_860, kind: "census", source: "census-2023" },
  { year: 2024, total: 4_132_645, kind: "estimate", source: "scad-2024" },
];

export interface Source {
  key: string;
  label: string;
  url: string;
}

export const SOURCES: Source[] = [
  {
    key: "census-2023",
    label: "Abu Dhabi Census 2023 — Statistics Centre Abu Dhabi (SCAD)",
    url: "https://census.scad.gov.ae/home/population?lang=en",
  },
  {
    key: "scad-2024",
    label: "SCAD: Abu Dhabi population in 2024 grows 7.5% to reach 4.14m",
    url: "https://statad.gov.ae/w/abu-dhabi-population-in-2024-grows-7-5-to-reach-4-14m",
  },
  {
    key: "scad-2011",
    label: "SCAD Statistical Yearbook — mid-year population estimate 2011",
    url: "https://scad.gov.ae/w/population",
  },
  {
    key: "census-2005",
    label: "Abu Dhabi Census 2005 (emirate total, approximate)",
    url: "https://scad.gov.ae/w/population",
  },
  {
    key: "scad-2008",
    label: "SCAD — end-2008 emirate population (approximate)",
    url: "https://scad.gov.ae/w/population",
  },
  {
    key: "area",
    label: "Region land areas (Emirate of Abu Dhabi, Wikipedia / SCAD) — approximate",
    url: "https://en.wikipedia.org/wiki/Emirate_of_Abu_Dhabi",
  },
];

export const METHOD_NOTES: string[] = [
  "Abu Dhabi Emirate is split into three official regions: Capital (Abu Dhabi city), Eastern (Al Ain) and Western (Al Dhafra).",
  "2024 figures are SCAD's official per-region estimates (emirate ≈ 4.14 million).",
  "The 2023 emirate total (3,789,860) is the official Census 2023 count. The per-region 2023 split is derived by back-applying SCAD's reported 2024 growth rates (Al Ain +4.4%, Al Dhafra +6.2%) so it reconciles with both the census total and the 2024 estimate.",
  "2011 is SCAD's official mid-year estimate (Al Dhafra was then named Al Gharbia).",
  "2005 and 2008 emirate totals are approximate historical anchors shown only on the trend line; open sources do not break these years down by region.",
  "Region land areas are approximate (Al Dhafra ≈ 71% of the emirate's 67,340 km²); population density is therefore indicative, useful for comparison rather than as a precise figure.",
  "Trip / origin-destination / mobility data: Abu Dhabi does not currently publish open trip volumes by area as a time series, so this app focuses on resident population and population density. The structure supports adding a 'trips' metric later if open data becomes available.",
];

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export type Metric = "population" | "density" | "share";

export const METRIC_LABELS: Record<Metric, string> = {
  population: "Population",
  density: "Density (people / km²)",
  share: "Share of emirate (%)",
};

export function snapshotFor(year: number): YearSnapshot {
  return SNAPSHOTS.find((s) => s.year === year) ?? SNAPSHOTS[SNAPSHOTS.length - 1];
}

export function emirateTotal(snap: YearSnapshot): number {
  return REGIONS.reduce((sum, r) => sum + snap.population[r.code], 0);
}

export function metricValue(snap: YearSnapshot, code: RegionCode, metric: Metric): number {
  const pop = snap.population[code];
  switch (metric) {
    case "population":
      return pop;
    case "density":
      return pop / REGION_BY_CODE[code].areaKm2;
    case "share":
      return (pop / emirateTotal(snap)) * 100;
  }
}

/** Percentage change for a region between the given snapshot and the prior one. */
export function growthVsPrevious(year: number, code: RegionCode): number | null {
  const idx = SNAPSHOTS.findIndex((s) => s.year === year);
  if (idx <= 0) return null;
  const prev = SNAPSHOTS[idx - 1].population[code];
  const cur = SNAPSHOTS[idx].population[code];
  if (!prev) return null;
  return (cur / prev - 1) * 100;
}

/** Compound annual growth rate (%) for a region between two snapshots. */
export function cagrVsPrevious(year: number, code: RegionCode): number | null {
  const idx = SNAPSHOTS.findIndex((s) => s.year === year);
  if (idx <= 0) return null;
  const prevSnap = SNAPSHOTS[idx - 1];
  const years = year - prevSnap.year;
  if (years <= 0) return null;
  const ratio = SNAPSHOTS[idx].population[code] / prevSnap.population[code];
  return (Math.pow(ratio, 1 / years) - 1) * 100;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

// Simple two-stop color ramp per region value (normalised 0..1).
export function rampColor(t: number): string {
  // light teal -> deep indigo
  const stops = [
    [56, 189, 248], // #38bdf8
    [129, 140, 248], // #818cf8
    [99, 30, 168], // #631ea8
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const seg = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const [a, b] = [stops[i], stops[i + 1]];
  const mix = a.map((c, k) => Math.round(c + (b[k] - c) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
