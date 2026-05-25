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

/** Circumradius of the triangle through three points (Menger curvature). */
function circumradius(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  const a = Math.hypot(bx - cx, by - cy);
  const b = Math.hypot(ax - cx, ay - cy);
  const c = Math.hypot(ax - bx, ay - by);
  if (a < 1e-6 || b < 1e-6 || c < 1e-6) return Infinity;
  // Triangle area via cross product.
  const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  if (area2 < 1e-9) return Infinity; // collinear -> straight
  return (a * b * c) / (2 * area2);
}

/** Per-link curvature stats in the link's own coordinate units. */
function curvature(points: number[]): { min: number; mean: number } | null {
  if (points.length < 6) return null;
  const radii: number[] = [];
  for (let i = 2; i < points.length - 2; i += 2) {
    const r = circumradius(
      points[i - 2],
      points[i - 1],
      points[i],
      points[i + 1],
      points[i + 2],
      points[i + 3]
    );
    if (Number.isFinite(r)) radii.push(r);
  }
  if (radii.length === 0) return null;
  const min = Math.min(...radii);
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  return { min, mean };
}

function classifyFunctional(
  link: NetworkLink,
  medianWidth: number
): FunctionalClass {
  if (link.kind === "ring") return "collector";
  const w = link.width ?? medianWidth;
  const lanes = link.lanesPerDir ?? 1;
  if (lanes >= 3 || w > medianWidth * 1.8) return "arterial";
  if (lanes === 2 || w > medianWidth * 1.2) return "collector";
  if (w < medianWidth * 0.6) return "access";
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

export function computeNetworkDimensions(
  network: RoadNetwork,
  opts: DimensionAssumptions = {}
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
    const lengthM = toLen(link.length);
    const widthM = link.width != null ? toLen(link.width) : null;
    const lanesPerDir = link.lanesPerDir ?? 1;
    const totalLanes = lanesPerDir * 2;
    const curv = curvature(link.points);
    const minRUnits = curv?.min ?? null;
    const meanRUnits = curv?.mean ?? null;
    const minRm = minRUnits != null ? toLen(minRUnits) : null;
    const meanRm = meanRUnits != null ? toLen(meanRUnits) : null;
    const fclass = classifyFunctional(link, medianWidth);
    const ffs = CLASS_FFS[fclass];

    let los: SegmentLOSResult | undefined;
    if (volPerLane > 0) {
      const ffsForLos = estimateFreeFlowSpeed(ffs, widthM, fclass);
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
