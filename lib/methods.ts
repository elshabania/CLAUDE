"use client";

import type { DrawingSegment } from "@/lib/road-detect";
import type { DerivedCenterline } from "@/lib/centerline-derivation";
import { extractRoadSkeleton } from "@/lib/road-skeleton";
import { deriveCenterlinesFromCurbs } from "@/lib/centerline-derivation";

export interface MethodInput {
  curbs: DrawingSegment[];
  laneMarkings: DrawingSegment[];
  /** Stop lines, give-way lines, drop-kerb markings, pedestrian crossings -
   *  anything that marks where a lane physically ends at a junction. Used
   *  by 16.9 to extend lane endpoints to the actual junction limit. */
  junctionMarkers: DrawingSegment[];
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

// =============================================================================
// 16.x — Progressive enhancements of method 16 (lane-as-centerline)
// =============================================================================
//
// Each entry in this section starts from the painted Road Lane_Main / Road
// Lane / Lane_Direction polylines and applies an additional pass on top of
// the previous variant. Switching between them in the dashboard shows the
// effect of each enhancement step.

/** Compute a polyline's arc length. */
function polylineLength(pts: number[]): number {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) {
    L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  }
  return L;
}

/**
 * 16.1 / 16.2 helper — drop centerlines that came from non-lane-separator
 * layers (parking marks, arrows, pedestrian crossings, etc.). 16. takes
 * everything classified as 'lane'; this filter keeps only lane separators.
 */
function isLaneSeparatorLayer(layer: string | undefined): boolean {
  if (!layer) return true; // no-layer paths default to keep
  const l = layer.toLowerCase();
  if (
    l.includes("pedestrian") ||
    l.includes("crosswalk") ||
    l.includes("zebra") ||
    l.includes("stop line") ||
    l.includes("giveway") ||
    l.includes("give way") ||
    l.includes("arrow") ||
    l.includes("drop kerb") ||
    l.includes("parking") ||
    l.includes("crossing") ||
    l.includes("no crossing") ||
    l.includes("yellow")
  ) {
    return false;
  }
  return true;
}

/**
 * 16.3 helper — stitch end-to-end collinear lane markings into single
 * polylines. CAD often draws long centerlines as dashes; this turns them
 * back into one continuous polyline per lane.
 */
function stitchCollinear(
  centerlines: DerivedCenterline[],
  endpointTol: number,
  angleTolDeg: number
): DerivedCenterline[] {
  if (centerlines.length < 2) return centerlines;
  const cells = new Map<string, number[]>();
  const cellSize = Math.max(endpointTol * 2, 1);
  const dropped = new Set<number>();
  const cl = centerlines.map((c) => ({
    points: c.points.slice(),
    width: c.width,
    length: c.length,
    bodyPolygon: c.bodyPolygon.slice(),
  }));

  const key = (x: number, y: number) =>
    `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;
  const addEnd = (i: number, end: 0 | 1) => {
    const pts = cl[i].points;
    const x = end === 0 ? pts[0] : pts[pts.length - 2];
    const y = end === 0 ? pts[1] : pts[pts.length - 1];
    const k = key(x, y);
    const arr = cells.get(k) ?? [];
    arr.push(i * 2 + end);
    cells.set(k, arr);
  };
  for (let i = 0; i < cl.length; i++) {
    addEnd(i, 0);
    addEnd(i, 1);
  }

  const bearing = (x0: number, y0: number, x1: number, y1: number) =>
    ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360;
  const angDiff = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);

  const queue = Array.from({ length: cl.length }, (_, i) => i);
  let safety = cl.length * 4;
  while (queue.length > 0 && safety-- > 0) {
    const i = queue.pop()!;
    if (dropped.has(i)) continue;
    const a = cl[i];
    if (a.points.length < 4) continue;

    const tx = a.points[a.points.length - 2];
    const ty = a.points[a.points.length - 1];
    const tBearing = bearing(
      a.points[a.points.length - 4],
      a.points[a.points.length - 3],
      tx,
      ty
    );
    const cx = Math.floor(tx / cellSize);
    const cy = Math.floor(ty / cellSize);
    let best: { j: number; reverse: boolean; d: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const refs = cells.get(`${cx + dx}_${cy + dy}`);
        if (!refs) continue;
        for (const ref of refs) {
          const j = (ref / 2) | 0;
          const end = (ref & 1) as 0 | 1;
          if (j === i || dropped.has(j)) continue;
          const b = cl[j];
          if (b.points.length < 4) continue;
          const bx = end === 0 ? b.points[0] : b.points[b.points.length - 2];
          const by = end === 0 ? b.points[1] : b.points[b.points.length - 1];
          const d = Math.hypot(bx - tx, by - ty);
          if (d > endpointTol) continue;
          const bBearing =
            end === 0
              ? bearing(b.points[0], b.points[1], b.points[2], b.points[3])
              : bearing(
                  b.points[b.points.length - 2],
                  b.points[b.points.length - 1],
                  b.points[b.points.length - 4],
                  b.points[b.points.length - 3]
                );
          if (angDiff(tBearing, bBearing) > angleTolDeg) continue;
          if (!best || d < best.d) best = { j, reverse: end === 1, d };
        }
      }
    }
    if (!best) continue;
    const b = cl[best.j];
    const bPts = best.reverse ? reverseFlat(b.points) : b.points;
    a.points.length -= 2;
    for (let k = 0; k < bPts.length; k++) a.points.push(bPts[k]);
    a.length = a.length + b.length + best.d;
    dropped.add(best.j);
    queue.push(i);
  }

  const out: DerivedCenterline[] = [];
  for (let i = 0; i < cl.length; i++) {
    if (dropped.has(i)) continue;
    out.push({
      points: cl[i].points,
      width: cl[i].width,
      length: cl[i].length,
      bodyPolygon: cl[i].bodyPolygon,
    });
  }
  return out;
}

function reverseFlat(points: number[]): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = points[points.length - 2 - i];
    out[i + 1] = points[points.length - 1 - i];
  }
  return out;
}

/**
 * 16.4 helper — Chaikin smoothing. Each iteration replaces every interior
 * point with two new points 25% / 75% along its incident edges. Reduces
 * the zig-zag jitter that dashed-marking stitching can leave behind.
 */
function chaikinSmooth(pts: number[], iterations: number): number[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 6) break;
    const next: number[] = [];
    next.push(cur[0], cur[1]);
    for (let i = 0; i < cur.length - 2; i += 2) {
      const ax = cur[i];
      const ay = cur[i + 1];
      const bx = cur[i + 2];
      const by = cur[i + 3];
      next.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25);
      next.push(ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    next.push(cur[cur.length - 2], cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/**
 * 16.5 helper — rasterize the kerb network into a distance field, then
 * for each centerline point look up the distance value to derive a true
 * pavement width per point.
 */
interface KerbField {
  W: number;
  H: number;
  scale: number;
  minX: number;
  maxY: number;
  dist: Int32Array;
}
function buildKerbDistanceField(
  curbs: DrawingSegment[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  resolution = 800
): KerbField | null {
  if (typeof document === "undefined") return null;
  if (curbs.length === 0) return null;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (w <= 0 || h <= 0) return null;
  const aspect = w / h;
  const W = aspect >= 1 ? resolution : Math.max(64, Math.round(resolution * aspect));
  const H = aspect >= 1 ? Math.max(64, Math.round(resolution / aspect)) : resolution;
  const scale = W / w;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const c of curbs) {
    if (c.points.length < 4) continue;
    ctx.beginPath();
    ctx.moveTo((c.points[0] - bounds.minX) * scale, (bounds.maxY - c.points[1]) * scale);
    for (let i = 2; i < c.points.length; i += 2) {
      ctx.lineTo(
        (c.points[i] - bounds.minX) * scale,
        (bounds.maxY - c.points[i + 1]) * scale
      );
    }
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, W, H);
  const N = W * H;
  const INF = W + H + 1;
  const dist = new Int32Array(N);
  for (let i = 0; i < N; i++) dist[i] = img.data[i * 4] > 128 ? INF : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
      if (y > 0) d = Math.min(d, dist[idx - W] + 1);
      dist[idx] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const idx = y * W + x;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (x < W - 1) d = Math.min(d, dist[idx + 1] + 1);
      if (y < H - 1) d = Math.min(d, dist[idx + W] + 1);
      dist[idx] = d;
    }
  }
  return { W, H, scale, minX: bounds.minX, maxY: bounds.maxY, dist };
}

function widthAtPoint(field: KerbField, x: number, y: number): number {
  const px = Math.round((x - field.minX) * field.scale);
  const py = Math.round((field.maxY - y) * field.scale);
  if (px < 0 || px >= field.W || py < 0 || py >= field.H) return 0;
  const distPx = field.dist[py * field.W + px];
  if (distPx <= 0 || distPx > 1e6) return 0;
  return (distPx * 2) / field.scale;
}

/**
 * 16.6 helper — snap the endpoints of each centerline to a junction node
 * pulled from the kerb-skeleton extractor. Stops dashed markings from
 * dangling just shy of the intersection.
 */
function snapEndpointsToJunctions(
  centerlines: DerivedCenterline[],
  junctions: { x: number; y: number }[],
  tolerance: number
): DerivedCenterline[] {
  if (junctions.length === 0) return centerlines;
  return centerlines.map((c) => {
    const pts = c.points.slice();
    const head = { x: pts[0], y: pts[1] };
    const tail = { x: pts[pts.length - 2], y: pts[pts.length - 1] };
    let bestHead: { x: number; y: number; d: number } | null = null;
    let bestTail: { x: number; y: number; d: number } | null = null;
    for (const j of junctions) {
      const dh = Math.hypot(j.x - head.x, j.y - head.y);
      const dt = Math.hypot(j.x - tail.x, j.y - tail.y);
      if (dh < tolerance && (!bestHead || dh < bestHead.d))
        bestHead = { x: j.x, y: j.y, d: dh };
      if (dt < tolerance && (!bestTail || dt < bestTail.d))
        bestTail = { x: j.x, y: j.y, d: dt };
    }
    if (bestHead) {
      pts[0] = bestHead.x;
      pts[1] = bestHead.y;
    }
    if (bestTail) {
      pts[pts.length - 2] = bestTail.x;
      pts[pts.length - 1] = bestTail.y;
    }
    return {
      points: pts,
      width: c.width,
      length: polylineLength(pts),
      bodyPolygon: c.bodyPolygon,
    };
  });
}

/** Build a body polygon by sweeping perpendicular at each centerline
 *  point by half the local pavement width (sourced from the kerb field
 *  if available, falling back to the centerline's average width). */
function sweepBody(
  pts: number[],
  perPointHalfWidths: number[]
): number[] {
  if (pts.length < 4) return [];
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
    const hw = perPointHalfWidths[i / 2] ?? 0;
    left.push(pts[i] + nx * hw, pts[i + 1] + ny * hw);
    right.push(pts[i] - nx * hw, pts[i + 1] - ny * hw);
  }
  const poly: number[] = [];
  for (let i = 0; i < left.length; i += 2) poly.push(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  return poly;
}

// Reusable seed for 16.x — same as method 16's compute but exposed so the
// variants can layer passes on top of it.
function laneSeed(input: MethodInput): DerivedCenterline[] {
  return laneAsCenterline.compute(input);
}

/**
 * 16.9 helper — ray vs segment intersection.
 *
 * Returns the positive ray parameter t at which the ray (P, D) hits the
 * segment AB, or null if the ray misses, runs anti-parallel, or hits
 * outside the segment. D is assumed unit-length so t is a true distance.
 */
function rayIntersectSegment(
  px: number,
  py: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number | null {
  const sx = bx - ax;
  const sy = by - ay;
  const det = sx * dy - dx * sy;
  if (Math.abs(det) < 1e-9) return null;
  const ex = ax - px;
  const ey = ay - py;
  const t = (-sy * ex + sx * ey) / det;
  const u = (dx * ey - dy * ex) / det;
  if (t <= 0 || u < 0 || u > 1) return null;
  return t;
}

function nearestMarkerHit(
  px: number,
  py: number,
  dx: number,
  dy: number,
  markers: DrawingSegment[],
  maxDist: number
): number | null {
  let best: number | null = null;
  for (const m of markers) {
    const p = m.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const t = rayIntersectSegment(
        px,
        py,
        dx,
        dy,
        p[i],
        p[i + 1],
        p[i + 2],
        p[i + 3]
      );
      if (t === null || t > maxDist) continue;
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

/**
 * 16.9 helper — extend each centerline's head and tail along its outgoing
 * tangent until it hits a junction-marker segment (stop line, give-way,
 * drop-kerb, pedestrian crossing). Lane stripes typically end ~1-3 m short
 * of the actual stop line, leaving vehicles stranded at the junction; this
 * pass closes the gap.
 */
function extendLanesToMarkers(
  centerlines: DerivedCenterline[],
  markers: DrawingSegment[],
  maxExtension: number
): DerivedCenterline[] {
  if (markers.length === 0) return centerlines;
  return centerlines.map((c) => {
    if (c.points.length < 4) return c;
    const pts = c.points.slice();
    let changed = false;

    const hx = pts[0];
    const hy = pts[1];
    let hdx = hx - pts[2];
    let hdy = hy - pts[3];
    let m = Math.hypot(hdx, hdy) || 1;
    hdx /= m;
    hdy /= m;
    const headHit = nearestMarkerHit(hx, hy, hdx, hdy, markers, maxExtension);
    if (headHit !== null) {
      pts[0] = hx + hdx * headHit;
      pts[1] = hy + hdy * headHit;
      changed = true;
    }

    const N = pts.length;
    const tx = pts[N - 2];
    const ty = pts[N - 1];
    let tdx = tx - pts[N - 4];
    let tdy = ty - pts[N - 3];
    m = Math.hypot(tdx, tdy) || 1;
    tdx /= m;
    tdy /= m;
    const tailHit = nearestMarkerHit(tx, ty, tdx, tdy, markers, maxExtension);
    if (tailHit !== null) {
      pts[N - 2] = tx + tdx * tailHit;
      pts[N - 1] = ty + tdy * tailHit;
      changed = true;
    }

    if (!changed) return c;
    return {
      points: pts,
      width: c.width,
      length: polylineLength(pts),
      bodyPolygon: c.bodyPolygon,
    };
  });
}

const method_16_1: NetworkMethod = {
  id: "lane-16-1-filter-short",
  name: "16.1 Filter short markings",
  description:
    "Method 16 + drop polylines shorter than 0.5% of bounds diagonal. " +
    "Removes direction arrows, parking marks, single-dash spurs.",
  family: "lane-direct",
  compute: (input) => {
    const seed = laneSeed(input);
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const minLength = Math.hypot(w, h) * 0.005;
    return seed.filter((c) => c.length >= minLength);
  },
};

const method_16_2: NetworkMethod = {
  id: "lane-16-2-layer-filter",
  name: "16.2 + Filter to true lane separators",
  description:
    "16.1 + drop centerlines whose source layer is a pedestrian crossing, " +
    "stop line, give-way, parking mark, drop-kerb, or arrow.",
  family: "lane-direct",
  compute: (input) => {
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const minLength = Math.hypot(w, h) * 0.005;
    const lanes = input.laneMarkings.filter((s) =>
      isLaneSeparatorLayer(s.layer)
    );
    const filtered = laneAsCenterline
      .compute({ ...input, laneMarkings: lanes })
      .filter((c) => c.length >= minLength);
    return filtered;
  },
};

const method_16_3: NetworkMethod = {
  id: "lane-16-3-stitch",
  name: "16.3 + Stitch end-to-end collinear",
  description:
    "16.2 + stitch dashed lane stripes into continuous polylines using " +
    "endpoint proximity (~0.4% diag) and bearing match (within 12°).",
  family: "lane-direct",
  compute: (input) => {
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const diag = Math.hypot(w, h);
    const seeded = method_16_2.compute(input);
    return stitchCollinear(seeded, diag * 0.004, 12);
  },
};

const method_16_4: NetworkMethod = {
  id: "lane-16-4-smooth",
  name: "16.4 + Chaikin smooth",
  description:
    "16.3 + 1 round of Chaikin smoothing. Damps the zig-zag that " +
    "stitched dash chains can leave at the join points.",
  family: "lane-direct",
  compute: (input) => {
    const stitched = method_16_3.compute(input);
    return stitched.map((c) => {
      const pts = chaikinSmooth(c.points, 1);
      return {
        points: pts,
        width: c.width,
        length: polylineLength(pts),
        bodyPolygon: c.bodyPolygon,
      };
    });
  },
};

const method_16_5: NetworkMethod = {
  id: "lane-16-5-width-from-kerbs",
  name: "16.5 + Width from kerb distance field",
  description:
    "16.4 + rasterize Road Edge_MP_00 and look up the distance-field " +
    "value at each centerline point - per-point width = 2 * distance " +
    "to nearest kerb (true pavement width).",
  family: "lane-direct",
  compute: (input) => {
    const stitched = method_16_4.compute(input);
    const field = buildKerbDistanceField(input.curbs, input.bounds, 800);
    if (!field) return stitched;
    return stitched.map((c) => {
      let total = 0;
      let n = 0;
      for (let i = 0; i < c.points.length; i += 2) {
        const w = widthAtPoint(field, c.points[i], c.points[i + 1]);
        if (w > 0) {
          total += w;
          n++;
        }
      }
      const avg = n > 0 ? total / n : c.width;
      return {
        points: c.points,
        width: avg,
        length: c.length,
        bodyPolygon: c.bodyPolygon,
      };
    });
  },
};

const method_16_6: NetworkMethod = {
  id: "lane-16-6-snap-junctions",
  name: "16.6 + Snap endpoints to kerb-skeleton junctions",
  description:
    "16.5 + run the kerb-skeleton extractor to find junction nodes, then " +
    "snap each lane-marking endpoint within 1.5% diag of a junction to " +
    "that junction (closes gaps at intersections).",
  family: "lane-direct",
  compute: (input) => {
    const enhanced = method_16_5.compute(input);
    const sk = extractRoadSkeleton(input.curbs, input.bounds, {
      resolution: 1100,
    });
    if (sk.length === 0) return enhanced;
    // Approximate junctions = endpoints + branch points of the skeleton's
    // polylines that appear in 2+ different polylines (they meet there).
    const counts = new Map<string, number>();
    const cellSize = (() => {
      const w = input.bounds.maxX - input.bounds.minX;
      const h = input.bounds.maxY - input.bounds.minY;
      return Math.hypot(w, h) * 0.004;
    })();
    const key = (x: number, y: number) =>
      `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;
    const point = new Map<string, { x: number; y: number }>();
    for (const s of sk) {
      const head = { x: s.points[0], y: s.points[1] };
      const tail = {
        x: s.points[s.points.length - 2],
        y: s.points[s.points.length - 1],
      };
      for (const p of [head, tail]) {
        const k = key(p.x, p.y);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        if (!point.has(k)) point.set(k, p);
      }
    }
    const junctions: { x: number; y: number }[] = [];
    for (const [k, n] of counts) {
      if (n >= 3) {
        const p = point.get(k);
        if (p) junctions.push(p);
      }
    }
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const tolerance = Math.hypot(w, h) * 0.015;
    return snapEndpointsToJunctions(enhanced, junctions, tolerance);
  },
};

const method_16_7: NetworkMethod = {
  id: "lane-16-7-body-from-kerbs",
  name: "16.7 + Body polygons from kerb distance",
  description:
    "16.6 + rebuild each centerline's body polygon by sweeping " +
    "perpendicular by the distance-field value at each point - so the " +
    "rendered asphalt hugs the actual kerbs even when the centerline " +
    "wanders off the medial axis.",
  family: "lane-direct",
  compute: (input) => {
    const enhanced = method_16_6.compute(input);
    const field = buildKerbDistanceField(input.curbs, input.bounds, 800);
    if (!field) return enhanced;
    return enhanced.map((c) => {
      const halfWidths: number[] = [];
      for (let i = 0; i < c.points.length; i += 2) {
        const w = widthAtPoint(field, c.points[i], c.points[i + 1]);
        halfWidths.push((w > 0 ? w : c.width) / 2);
      }
      return {
        points: c.points,
        width: c.width,
        length: c.length,
        bodyPolygon: sweepBody(c.points, halfWidths),
      };
    });
  },
};

const method_16_8: NetworkMethod = {
  id: "lane-16-8-best-of-all",
  name: "16.8 Best-of-all combined",
  description:
    "Pipeline: filter short -> filter to lane separators -> stitch " +
    "collinear -> Chaikin smooth (2 rounds) -> width and body from kerb " +
    "distance -> snap endpoints to skeleton junctions. The whole stack.",
  family: "lane-direct",
  compute: (input) => {
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const diag = Math.hypot(w, h);
    const minLength = diag * 0.005;
    let cl = laneAsCenterline
      .compute({
        ...input,
        laneMarkings: input.laneMarkings.filter((s) =>
          isLaneSeparatorLayer(s.layer)
        ),
      })
      .filter((c) => c.length >= minLength);
    cl = stitchCollinear(cl, diag * 0.004, 12);
    cl = cl.map((c) => {
      const pts = chaikinSmooth(c.points, 2);
      return {
        points: pts,
        width: c.width,
        length: polylineLength(pts),
        bodyPolygon: c.bodyPolygon,
      };
    });
    const field = buildKerbDistanceField(input.curbs, input.bounds, 900);
    if (field) {
      cl = cl.map((c) => {
        const halfWidths: number[] = [];
        let total = 0;
        let n = 0;
        for (let i = 0; i < c.points.length; i += 2) {
          const w = widthAtPoint(field, c.points[i], c.points[i + 1]);
          halfWidths.push((w > 0 ? w : c.width) / 2);
          if (w > 0) {
            total += w;
            n++;
          }
        }
        const avg = n > 0 ? total / n : c.width;
        return {
          points: c.points,
          width: avg,
          length: c.length,
          bodyPolygon: sweepBody(c.points, halfWidths),
        };
      });
    }
    const sk = extractRoadSkeleton(input.curbs, input.bounds, {
      resolution: 1100,
    });
    if (sk.length > 0) {
      const counts = new Map<string, number>();
      const cellSize = diag * 0.004;
      const key = (x: number, y: number) =>
        `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;
      const point = new Map<string, { x: number; y: number }>();
      for (const s of sk) {
        for (const p of [
          { x: s.points[0], y: s.points[1] },
          {
            x: s.points[s.points.length - 2],
            y: s.points[s.points.length - 1],
          },
        ]) {
          const k = key(p.x, p.y);
          counts.set(k, (counts.get(k) ?? 0) + 1);
          if (!point.has(k)) point.set(k, p);
        }
      }
      const junctions: { x: number; y: number }[] = [];
      for (const [k, n] of counts) {
        if (n >= 3) {
          const p = point.get(k);
          if (p) junctions.push(p);
        }
      }
      cl = snapEndpointsToJunctions(cl, junctions, diag * 0.015);
    }
    return cl;
  },
};

const method_16_9: NetworkMethod = {
  id: "lane-16-9-extend-to-markers",
  name: "16.9 + Extend lanes to junction markers",
  description:
    "16.8 + ray-cast each lane endpoint along its outgoing bearing to " +
    "the nearest stop-line / give-way / drop-kerb / pedestrian-crossing " +
    "segment within 5% of bounds diagonal, and extend the lane to meet " +
    "it. Closes the dangling-end gap so vehicles can traverse the " +
    "junction instead of stopping short of it.",
  family: "lane-direct",
  compute: (input) => {
    const w = input.bounds.maxX - input.bounds.minX;
    const h = input.bounds.maxY - input.bounds.minY;
    const maxExt = Math.hypot(w, h) * 0.05;
    return extendLanesToMarkers(
      method_16_8.compute(input),
      input.junctionMarkers,
      maxExt
    );
  },
};

METHODS.push(
  method_16_1,
  method_16_2,
  method_16_3,
  method_16_4,
  method_16_5,
  method_16_6,
  method_16_7,
  method_16_8,
  method_16_9
);
