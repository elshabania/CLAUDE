"use client";

import type { DrawingSegment } from "@/lib/road-detect";
import type { DerivedCenterline } from "@/lib/centerline-derivation";
import { extractRoadSkeleton } from "@/lib/road-skeleton";
import { deriveCenterlinesFromCurbs } from "@/lib/centerline-derivation";

export interface MethodInput {
  curbs: DrawingSegment[];
  laneMarkings: DrawingSegment[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface NetworkMethod {
  id: string;
  name: string;
  description: string;
  /** When true the method is a parameter variant of a primary algorithm
   *  rather than a fundamentally different approach. UI groups by family. */
  family:
    | "skeleton"
    | "pair"
    | "lane-direct"
    | "lane-pair"
    | "ridge"
    | "erosion"
    | "guo-hall"
    | "hybrid";
  compute(input: MethodInput): DerivedCenterline[];
}

const skeletonMethod = (
  id: string,
  name: string,
  description: string,
  family: NetworkMethod["family"],
  opts: Parameters<typeof extractRoadSkeleton>[2] = {}
): NetworkMethod => ({
  id,
  name,
  description,
  family,
  compute: ({ curbs, bounds }) => extractRoadSkeleton(curbs, bounds, opts),
});

const pairMethod = (
  id: string,
  name: string,
  description: string,
  parallelCos: number,
  perpCos: number,
  maxRoadWidthFraction = 0.025,
  sampleStepFraction = 0.0025
): NetworkMethod => ({
  id,
  name,
  description,
  family: "pair",
  compute: ({ curbs, bounds }) => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const diag = Math.hypot(w, h) || 1;
    return deriveCenterlinesFromCurbs(curbs, {
      maxRoadWidth: diag * maxRoadWidthFraction,
      sampleStep: Math.max(diag * sampleStepFraction, 1),
      parallelCos,
      perpCos,
      minPoints: 3,
    });
  },
});

const laneAsCenterline: NetworkMethod = {
  id: "lane-as-centerline",
  name: "16. Lane markings as centerlines (direct)",
  description:
    "Treat every Road Lane_Main polyline literally as a network link. " +
    "Width set to the median curb-pair distance. No derivation - just " +
    "use the painted lines.",
  family: "lane-direct",
  compute: ({ laneMarkings, curbs, bounds }) => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const diag = Math.hypot(w, h) || 1;
    const widthGuess = diag * 0.005;
    const out: DerivedCenterline[] = [];
    for (const m of laneMarkings) {
      if (m.points.length < 4) continue;
      let length = 0;
      for (let i = 2; i < m.points.length; i += 2) {
        length += Math.hypot(
          m.points[i] - m.points[i - 2],
          m.points[i + 1] - m.points[i - 1]
        );
      }
      out.push({
        points: m.points.slice(),
        width: widthGuess,
        length,
        bodyPolygon: ribbonPolygon(m.points, widthGuess / 2),
      });
    }
    void curbs;
    return out;
  },
};

const lanePairMethod = (
  id: string,
  name: string,
  description: string,
  inputs: "lane-curb" | "lane-lane",
  parallelCos: number,
  perpCos: number,
  maxRoadWidthFraction: number
): NetworkMethod => ({
  id,
  name,
  description,
  family: "lane-pair",
  compute: ({ curbs, laneMarkings, bounds }) => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const diag = Math.hypot(w, h) || 1;
    const combined: DrawingSegment[] =
      inputs === "lane-curb"
        ? [...curbs, ...laneMarkings]
        : laneMarkings;
    return deriveCenterlinesFromCurbs(combined, {
      maxRoadWidth: diag * maxRoadWidthFraction,
      sampleStep: Math.max(diag * 0.0025, 1),
      parallelCos,
      perpCos,
      minPoints: 3,
    });
  },
});

const hybridUnion = (
  id: string,
  name: string,
  description: string,
  primary: NetworkMethod,
  secondary: NetworkMethod
): NetworkMethod => ({
  id,
  name,
  description,
  family: "hybrid",
  compute: (input) => {
    const a = primary.compute(input);
    const b = secondary.compute(input);
    return [...a, ...b];
  },
});

/** Skeleton clipped to the kerb network only (drop the lane markings). */
const skeletonRidgeFiltered: NetworkMethod = {
  id: "skeleton-ridge-zs",
  name: "20. Skeleton + ridge filter (combined)",
  description:
    "Run the standard Zhang-Suen skeleton, then drop polylines whose " +
    "average distance-field value is below 30% of median - removes " +
    "spurs that hug a single kerb instead of running between two.",
  family: "hybrid",
  compute: ({ curbs, bounds }) => {
    const cl = extractRoadSkeleton(curbs, bounds, { resolution: 1100 });
    if (cl.length === 0) return cl;
    const widths = cl.map((c) => c.width).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)];
    const cutoff = median * 0.3;
    return cl.filter((c) => c.width >= cutoff);
  },
};

export const METHODS: NetworkMethod[] = [
  skeletonMethod(
    "skeleton-zs-1100",
    "1. Skeleton · Zhang-Suen · 1100 px",
    "Default image-based medial axis. Rasterize kerbs at 1100 px, " +
      "Zhang-Suen thinning, trace skeleton, sweep body polygons.",
    "skeleton",
    { resolution: 1100, thinner: "zhang-suen" }
  ),
  skeletonMethod(
    "skeleton-zs-600",
    "2. Skeleton · Zhang-Suen · 600 px",
    "Lower-resolution skeleton (600 px). Faster; may merge close-by " +
      "corridors that the higher-res run keeps separate.",
    "skeleton",
    { resolution: 600, thinner: "zhang-suen" }
  ),
  skeletonMethod(
    "skeleton-zs-1600",
    "3. Skeleton · Zhang-Suen · 1600 px",
    "Higher-resolution skeleton (1600 px). Slower; better at narrow " +
      "corridors and sharp curves.",
    "skeleton",
    { resolution: 1600, thinner: "zhang-suen" }
  ),
  skeletonMethod(
    "skeleton-zs-strong-stroke",
    "4. Skeleton · Zhang-Suen · 4 px stroke",
    "Same as default but kerbs are drawn 4 px wide instead of 2 px - " +
      "bridges 1-2 pixel gaps in the kerb data so the asphalt mask is " +
      "more reliably enclosed.",
    "skeleton",
    { resolution: 1100, kerbStrokePx: 4, thinner: "zhang-suen" }
  ),
  skeletonMethod(
    "skeleton-zs-relaxed-component",
    "5. Skeleton · Zhang-Suen · loose components",
    "Same as default but the minimum-component-pixel threshold is 200 " +
      "instead of 800 - keeps small enclosed regions like roundabout " +
      "centres.",
    "skeleton",
    { resolution: 1100, minComponentPixels: 200, thinner: "zhang-suen" }
  ),
  skeletonMethod(
    "skeleton-gh-1100",
    "6. Skeleton · Guo-Hall · 1100 px",
    "Guo-Hall thinning instead of Zhang-Suen. Slightly different " +
      "deletion mask; tends to produce cleaner skeletons near " +
      "junctions.",
    "guo-hall",
    { resolution: 1100, thinner: "guo-hall" }
  ),
  skeletonMethod(
    "skeleton-gh-1600",
    "7. Skeleton · Guo-Hall · 1600 px",
    "Higher-resolution Guo-Hall.",
    "guo-hall",
    { resolution: 1600, thinner: "guo-hall" }
  ),
  skeletonMethod(
    "skeleton-dr-1100",
    "8. Distance ridge · 1100 px",
    "Skeleton from local-maxima of the distance field. O(N) one-pass; " +
      "produces a slightly thicker skeleton than Zhang-Suen and is " +
      "robust to noisy kerbs.",
    "ridge",
    { resolution: 1100, thinner: "distance-ridge" }
  ),
  skeletonMethod(
    "skeleton-dr-1600",
    "9. Distance ridge · 1600 px",
    "Higher-resolution distance ridge.",
    "ridge",
    { resolution: 1600, thinner: "distance-ridge" }
  ),
  skeletonMethod(
    "skeleton-erosion",
    "10. Iterative morphological erosion",
    "Peel one pixel layer at a time off the asphalt mask until " +
      "components are 1-2 px wide. Robust but can collapse very " +
      "narrow corridors.",
    "erosion",
    { resolution: 1100, thinner: "erosion" }
  ),
  pairMethod(
    "pair-tight",
    "11. Pair-matcher · tight (cos > 0.95)",
    "Curb-pair derivation with a strict parallelism threshold (0.95 " +
      "cos = within 18°) and tight perpendicularity (0.2). Misses " +
      "curves; clean output where it works.",
    0.95,
    0.2
  ),
  pairMethod(
    "pair-medium",
    "12. Pair-matcher · medium (cos > 0.85)",
    "Default pair-matcher: 0.85 cos parallel, 0.4 perpendicular. " +
      "Balanced.",
    0.85,
    0.4
  ),
  pairMethod(
    "pair-loose",
    "13. Pair-matcher · loose (cos > 0.7)",
    "Wider tolerance (0.7 cos = within 45°, 0.6 perpendicular). " +
      "Handles curves; produces noisier output and ghost pairs at " +
      "junctions.",
    0.7,
    0.6
  ),
  pairMethod(
    "pair-loose-wide",
    "14. Pair-matcher · loose + wide road",
    "Loose tolerances and 4% bounds-diagonal road-width cap. Catches " +
      "wide roads and divided arterials.",
    0.7,
    0.6,
    0.04
  ),
  pairMethod(
    "pair-narrow",
    "15. Pair-matcher · narrow road only",
    "Strict parallelism but only 1.2% bounds-diagonal road-width cap " +
      "- captures residential streets only.",
    0.92,
    0.3,
    0.012
  ),
  laneAsCenterline,
  lanePairMethod(
    "lane-curb-pair",
    "17. Pair · lane markings + kerbs combined",
    "Feed BOTH kerbs and lane markings into the pair-matcher. Each " +
      "lane between adjacent boundaries (kerb-or-marking) gets its " +
      "own centerline; total link count = total lane count.",
    "lane-curb",
    0.85,
    0.4,
    0.012
  ),
  lanePairMethod(
    "lane-lane-pair",
    "18. Pair · lane markings only",
    "Pair lane markings against each other (ignore kerbs). Identifies " +
      "lane corridors purely from the painted stripes.",
    "lane-lane",
    0.88,
    0.35,
    0.012
  ),
  skeletonRidgeFiltered,
  hybridUnion(
    "hybrid-skeleton-pair",
    "19. Skeleton + pair-matcher union",
    "Take the union of the default skeleton output and the medium " +
      "pair-matcher output. Maximum coverage, more spurs.",
    skeletonMethod(
      "_hybrid-skeleton",
      "",
      "",
      "skeleton",
      { resolution: 1100, thinner: "zhang-suen" }
    ),
    pairMethod("_hybrid-pair", "", "", 0.85, 0.4)
  ),
];

export function getMethod(id: string): NetworkMethod {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}

/** Build a thin closed polygon ribbon around a polyline at half-width hw. */
function ribbonPolygon(pts: number[], hw: number): number[] {
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    let tx: number;
    let ty: number;
    if (i === 0) {
      tx = pts[2] - pts[0];
      ty = pts[3] - pts[1];
    } else if (i === pts.length - 2) {
      tx = pts[i] - pts[i - 2];
      ty = pts[i + 1] - pts[i - 1];
    } else {
      tx = pts[i + 2] - pts[i - 2];
      ty = pts[i + 3] - pts[i - 1];
    }
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    const nx = -ty;
    const ny = tx;
    left.push(pts[i] + nx * hw, pts[i + 1] + ny * hw);
    right.push(pts[i] - nx * hw, pts[i + 1] - ny * hw);
  }
  const poly: number[] = [];
  for (let i = 0; i < left.length; i += 2) poly.push(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  return poly;
}
