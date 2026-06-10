import type { RoadNetwork, NetworkLink } from "@/lib/road-network";
import {
  segmentLOS,
  estimateFreeFlowSpeed,
  type LOS,
  type SegmentLOSResult,
} from "@/lib/hcm";

/**
 * Highway-network dimension estimation.
 *
 * The masterplan PDF carries no scale stamp, so all lengths/widths come out
 * in PDF user units. The caller supplies `unitsPerMetre` (derived from a
 * known dimension or a scale bar) to convert to metres; until then we report
 * raw units and clearly label them.
 */

export type FunctionalClass =
  | "arterial"
  | "collector"
  | "local"
  | "access"
  | "ramp"
  | "unknown";

export interface LinkDimensions {
  linkId: string;
  /** Centerline length (metres if unitsPerMetre supplied, else PDF units). */
  length: number;
  /** Carriageway width (same unit as length). */
  width: number | null;
  lanesPerDir: number;
  totalLanes: number;
  /** Sharpest horizontal curve radius along the link (same unit as length).
   *  null when the link is essentially straight (radius beyond a cap). */
  minCurveRadius: number | null;
  /** Mean curve radius across all interior vertices. */
  meanCurveRadius: number | null;
  bearing: number;
  functionalClass: FunctionalClass;
  /** Estimated free-flow speed in km/h. */
  ffsKmh: number;
  los?: SegmentLOSResult;
  kind?: "road" | "ring";
}

export interface NetworkDimensions {
  units: "m" | "pdf-units";
  links: LinkDimensions[];
  totals: {
    linkCount: number;
    nodeCount: number;
    junctionCount: number;
    roundaboutCount: number;
    signalCount: number;
    priorityCount: number;
    totalLength: number;
    totalLaneLength: number;
    meanWidth: number | null;
    minCurveRadius: number | null;
    byClass: Record<FunctionalClass, { count: number; length: number }>;
  };
}

export interface DimensionAssumptions {
  /** PDF user units per metre. 1 = report raw units. */
  unitsPerMetre?: number;
  /** Peak-hour demand volume per lane (veh/h/lane) for segment LOS. */
  peakHourVolumePerLane?: number;
  /** Cap above which a curve is treated as "straight" (in metres). */
  straightRadiusCapM?: number;
}

/**
 * Circumradius of the triangle through three points (Menger curvature:
 * R = abc / 4K, where K is the triangle area). Returns Infinity for a
 * degenerate triple (a near-zero step or a near-collinear bend), which the
 * caller treats as "locally straight". The collinear test is made on the
 * SINE of the bend angle (area2 / (a*c)), a scale-free quantity, instead of
 * a raw cross-product magnitude that would change meaning with PDF scale.
 */
function circumradius(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  const a = Math.hypot(bx - cx, by - cy); // |B->C|
  const b = Math.hypot(ax - cx, ay - cy); // |A->C|
  const c = Math.hypot(ax - bx, ay - by); // |A->B|
  // Guard zero-length steps: duplicate/coincident vertices carry no bend.
  if (a < 1e-9 || b < 1e-9 || c < 1e-9) return Infinity;
  // Twice the triangle area via the cross product of the two leg vectors.
  const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  // Scale-free near-collinear guard: area2/(a*c) == 2*sin(bend); below ~0.5deg
  // (sin ~ 0.0087) the triple is straight to within digitiser noise, so the
  // implied radius is meaningless (and explodes). Treat as straight.
  if (area2 / (a * c) < 8.7e-3) return Infinity;
  return (a * b * c) / (2 * area2);
}

/** 3-point sliding median of a series (endpoints left as-is). Removes
 *  isolated single-sample outliers while preserving runs of >=2 — exactly
 *  the property we need to tell a genuine curve (which spans several
 *  consecutive vertices) from a one-vertex digitiser spike. */
function medianFilter3(arr: number[]): number[] {
  if (arr.length <= 2) return arr.slice();
  const out = arr.slice();
  for (let i = 1; i < arr.length - 1; i++) {
    const a = arr[i - 1];
    const b = arr[i];
    const c = arr[i + 1];
    // Median of three without sorting.
    out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
  return out;
}

/** Per-link curvature stats in the link's own coordinate units. Degenerate
 *  and straight triples (zero-length steps, near-collinear bends) are already
 *  excluded by `circumradius` (it returns Infinity). The remaining finite
 *  per-vertex radii are passed through a 3-point median filter before the
 *  min/mean are taken: a real horizontal curve persists over several
 *  consecutive vertices and survives the filter, whereas a lone noisy vertex
 *  (a digitiser spike that injects a spuriously sharp — i.e. anomalously
 *  small — radius, or a near-collinear point that injects a huge one) is an
 *  isolated sample and is suppressed. This makes the reported "sharpest curve"
 *  reflect supported geometry rather than one outlier, per the brief. */
function curvature(points: number[]): { min: number; mean: number } | null {
  if (points.length < 6) return null;
  const radii: number[] = [];
  // Slide a 3-vertex window one vertex (2 coords) at a time; the middle
  // vertex is the bend whose local radius we measure.
  for (let i = 2; i < points.length - 2; i += 2) {
    const r = circumradius(
      points[i - 2],
      points[i - 1],
      points[i],
      points[i + 1],
      points[i + 2],
      points[i + 3]
    );
    if (Number.isFinite(r) && r > 0) radii.push(r);
  }
  if (radii.length === 0) return null;
  // Robust min/mean over the median-filtered series (degenerate spikes removed).
  const filt = medianFilter3(radii);
  let min = Infinity;
  let sum = 0;
  for (const r of filt) {
    if (r < min) min = r;
    sum += r;
  }
  const mean = sum / filt.length; // filt.length === radii.length >= 1, guarded above
  if (!Number.isFinite(min) || !Number.isFinite(mean)) return null;
  return { min, mean };
}

function classifyFunctional(
  link: NetworkLink,
  medianWidth: number
): FunctionalClass {
  if (link.kind === "ring") return "collector";
  const w = link.width ?? medianWidth;
  const lanes = link.lanesPerDir ?? 1;
  // Width thresholds are taken RELATIVE to the network median so the same
  // logic works at any PDF scale. Ordered widest-first; the narrow "access"
  // test is checked before "local" so a sub-median lane (>=4 lanes wide is
  // not required) drops to access regardless of an inferred 2-lane count.
  // Falls back gracefully when no widths exist (medianWidth === 0 -> w/median
  // ratios are guarded by absolute lane counts only).
  if (lanes >= 3 || (medianWidth > 0 && w > medianWidth * 1.8)) return "arterial";
  if (medianWidth > 0 && w < medianWidth * 0.6) return "access";
  if (lanes === 2 || (medianWidth > 0 && w > medianWidth * 1.2)) return "collector";
  return "local";
}

/** Base FFS (km/h) per functional class - HCM-style starting estimate that
 *  the user can override once a posted speed is known. */
const CLASS_FFS: Record<FunctionalClass, number> = {
  arterial: 60,
  collector: 50,
  local: 40,
  access: 30,
  ramp: 40,
  unknown: 50,
};

/** Realistic standard lane width band (metres). AASHTO Green Book design lane
 *  is 3.6 m (12 ft); urban lanes commonly narrow to ~3.0 m (10 ft). */
const STD_LANE_M = 3.6;
const MIN_LANE_M = 3.0;

/**
 * Lane-width FFS adjustment (km/h) applied on top of the class base speed.
 * HCM Ch.18/Exhibit 18-8 lowers free-flow speed as lane width drops below the
 * 12 ft (3.6 m) base; AASHTO design speed likewise falls on narrow lanes. We
 * use the per-lane width (total carriageway / total lanes) rather than a flat
 * "two lanes across" assumption, and clamp the result to a realistic band so a
 * mis-measured polygon cannot drive FFS to an absurd value.
 *
 * Returns the adjusted FFS; never NaN/Infinity (all divisions guarded).
 */
function adjustFfsForWidth(
  baseKmh: number,
  widthM: number | null,
  totalLanes: number,
  fclass: FunctionalClass
): number {
  let ffs = baseKmh;
  if (widthM != null && widthM > 0 && totalLanes > 0) {
    const perLane = widthM / totalLanes;
    // HCM-style reductions (graduated); positive bonus capped for generous lanes.
    if (perLane < 2.7) ffs -= 10;
    else if (perLane < 3.0) ffs -= 6;
    else if (perLane < 3.3) ffs -= 3;
    else if (perLane > 3.9) ffs += 3; // wide lanes raise comfortable speed slightly
  }
  // Bound to a realistic per-class window so estimates stay defensible even
  // when width/lane inference is noisy (lower floor 20 km/h matches hcm).
  const ceil = fclass === "arterial" ? 80 : fclass === "collector" ? 65 : 55;
  return Math.max(20, Math.min(ceil, ffs));
}

/** Manual corrections an engineer applies to a detected link. Values are in
 *  the displayed unit (metres when a scale is set) and km/h for speed. */
export interface LinkOverride {
  lanesPerDir?: number;
  width?: number;
  ffsKmh?: number;
}

export function computeNetworkDimensions(
  network: RoadNetwork,
  opts: DimensionAssumptions = {},
  overrides: Record<string, LinkOverride> = {}
): NetworkDimensions {
  const upm = opts.unitsPerMetre && opts.unitsPerMetre > 0 ? opts.unitsPerMetre : 1;
  const toLen = (u: number) => u / upm; // PDF units -> metres (or units if upm=1)
  const units: NetworkDimensions["units"] = upm === 1 ? "pdf-units" : "m";
  const straightCap = opts.straightRadiusCapM ?? 1000;
  const volPerLane = opts.peakHourVolumePerLane ?? 0;

  // Median width for relative functional classification.
  const widths = network.links
    .map((l) => l.width)
    .filter((w): w is number => typeof w === "number" && w > 0)
    .sort((a, b) => a - b);
  const medianWidth = widths.length ? widths[Math.floor(widths.length / 2)] : 0;

  const links: LinkDimensions[] = [];
  const byClass: Record<FunctionalClass, { count: number; length: number }> = {
    arterial: { count: 0, length: 0 },
    collector: { count: 0, length: 0 },
    local: { count: 0, length: 0 },
    access: { count: 0, length: 0 },
    ramp: { count: 0, length: 0 },
    unknown: { count: 0, length: 0 },
  };

  let totalLength = 0;
  let totalLaneLength = 0;
  let minCurveOverall = Infinity;
  let widthSum = 0;
  let widthN = 0;

  for (const link of network.links) {
    const ov = overrides[link.id] ?? {};
    const lengthM = toLen(link.length);
    const widthM =
      ov.width != null ? ov.width : link.width != null ? toLen(link.width) : null;
    // Lanes per direction: prefer an explicit override, then the upstream
    // width-derived count; only if both are absent do we infer from the
    // carriageway width here. `widthM` is the TOTAL (two-way) carriageway, so
    // total lanes = round(width / standard lane); lanes-per-direction is half
    // that, ROUNDED (not floored) so an odd total — e.g. a 3-lane,
    // ~11 m carriageway — reports 2/dir rather than collapsing to 1/dir and
    // discarding a whole lane of capacity. Standard lane STD_LANE_M (3.6 m,
    // AASHTO Green Book design lane); per-direction clamped 1..4 so a
    // mis-measured polygon can't produce a runaway count. Falls back to 1 when
    // no width is known (a single undivided carriageway is assumed).
    let lanesPerDir: number;
    if (ov.lanesPerDir != null) {
      lanesPerDir = ov.lanesPerDir;
    } else if (link.lanesPerDir != null) {
      lanesPerDir = link.lanesPerDir;
    } else if (widthM != null && widthM > 0) {
      const total = Math.max(1, Math.round(widthM / STD_LANE_M));
      lanesPerDir = Math.max(1, Math.min(4, Math.round(total / 2)));
    } else {
      lanesPerDir = 1;
    }
    const totalLanes = lanesPerDir * 2;
    const curv = curvature(link.points);
    const minRUnits = curv?.min ?? null;
    const meanRUnits = curv?.mean ?? null;
    const minRm = minRUnits != null ? toLen(minRUnits) : null;
    const meanRm = meanRUnits != null ? toLen(meanRUnits) : null;
    const fclass = classifyFunctional(link, medianWidth);
    // Reported FFS: an explicit override wins; otherwise start from the class
    // base and apply the bounded lane-width adjustment so the displayed speed
    // is consistent with the value fed to segment LOS below.
    const ffs =
      ov.ffsKmh ?? adjustFfsForWidth(CLASS_FFS[fclass], widthM, totalLanes, fclass);

    let los: SegmentLOSResult | undefined;
    if (volPerLane > 0) {
      const ffsForLos = ov.ffsKmh ?? estimateFreeFlowSpeed(ffs, widthM, fclass);
      // Demand on this link = per-lane volume x lanes (both directions share
      // the carriageway; segment LOS is per direction).
      los = segmentLOS({
        lengthM: lengthM,
        ffsKmh: ffsForLos,
        demandVeh: volPerLane * lanesPerDir,
        lanes: lanesPerDir,
      });
    }

    links.push({
      linkId: link.id,
      length: lengthM,
      width: widthM,
      lanesPerDir,
      totalLanes,
      minCurveRadius: minRm != null && minRm < straightCap ? minRm : null,
      meanCurveRadius: meanRm,
      bearing: link.bearing,
      functionalClass: fclass,
      ffsKmh: ffs,
      los,
      kind: link.kind,
    });

    totalLength += lengthM;
    totalLaneLength += lengthM * totalLanes;
    if (minRm != null && minRm < minCurveOverall) minCurveOverall = minRm;
    if (widthM != null) {
      widthSum += widthM;
      widthN += 1;
    }
    byClass[fclass].count += 1;
    byClass[fclass].length += lengthM;
  }

  let roundabout = 0,
    signal = 0,
    priority = 0;
  for (const j of network.junctions) {
    if (j.kind === "roundabout") roundabout += 1;
    else if (j.kind === "signal") signal += 1;
    else priority += 1;
  }

  return {
    units,
    links,
    totals: {
      linkCount: network.links.length,
      nodeCount: network.nodes.length,
      junctionCount: network.junctions.length,
      roundaboutCount: roundabout,
      signalCount: signal,
      priorityCount: priority,
      totalLength,
      totalLaneLength,
      meanWidth: widthN > 0 ? widthSum / widthN : null,
      minCurveRadius: Number.isFinite(minCurveOverall) ? minCurveOverall : null,
      byClass,
    },
  };
}

export type { LOS };
