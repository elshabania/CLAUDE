import type { Dxf, DxfEntity, DxfPoint } from "dxf-parser";
import type { ExtractedPath } from "@/lib/pdf-extract";

export type RoadCategory =
  | "centerline"
  | "edge"
  | "lane"
  | "curb"
  | "shoulder"
  | "boundary"
  | "building"
  | "other";

export interface DrawingSegment {
  id: string;
  groupId: string;
  category: RoadCategory;
  /** Flat [x0, y0, x1, y1, ...] for compact transport. */
  points: number[];
  closed: boolean;
  length: number;
  /** Cleaned PDF OCG layer name when present. */
  layer?: string;
}

export interface DrawingGroup {
  id: string;
  label: string;
  category: RoadCategory;
  count: number;
  totalLength: number;
  /** PDF-only: original stroke color in 0..1 RGB. */
  color?: [number, number, number];
  /** PDF-only: average line width in PDF user units. */
  lineWidth?: number;
  /** When the group corresponds to a PDF OCG layer rather than a colour cluster. */
  layer?: string;
}

export interface DrawingTextItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  width: number;
  height: number;
}

export interface ParsedDrawing {
  source: "dxf" | "pdf";
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  segments: DrawingSegment[];
  groups: DrawingGroup[];
  entityCount: number;
  texts: DrawingTextItem[];
}

const LAYER_PATTERNS: { category: RoadCategory; patterns: RegExp[] }[] = [
  {
    category: "centerline",
    patterns: [/center.?line/i, /\bcl\b/i, /\bc[\/_-]?l\b/i, /centre.?line/i, /median/i],
  },
  {
    category: "edge",
    patterns: [/edge.?of.?pavement/i, /\beop\b/i, /pavement.?edge/i, /road.?edge/i, /\bedge\b/i],
  },
  { category: "lane", patterns: [/lane.?line/i, /\blane\b/i, /stripe/i, /marking/i] },
  { category: "curb", patterns: [/curb/i, /kerb/i, /\bgutter\b/i] },
  { category: "shoulder", patterns: [/shoulder/i, /\bverge\b/i] },
  { category: "boundary", patterns: [/boundary/i, /property/i, /\bplot\b/i] },
  { category: "building", patterns: [/building/i, /structure/i, /footprint/i] },
];

export function classifyLayer(layer: string): RoadCategory {
  for (const { category, patterns } of LAYER_PATTERNS) {
    if (patterns.some((p) => p.test(layer))) return category;
  }
  return "other";
}

function entityPoints(entity: DxfEntity): DxfPoint[] {
  if (entity.vertices && entity.vertices.length > 0) return entity.vertices;
  if (entity.startPoint && entity.endPoint) return [entity.startPoint, entity.endPoint];
  return [];
}

function flatPoints(points: DxfPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out.push(Math.round(p.x * 100) / 100);
    out.push(Math.round(p.y * 100) / 100);
  }
  return out;
}

function flatLength(flat: number[]): number {
  let total = 0;
  for (let i = 2; i < flat.length; i += 2) {
    const dx = flat[i] - flat[i - 2];
    const dy = flat[i + 1] - flat[i - 1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

export function detectFromDxf(dxf: Dxf): ParsedDrawing {
  const segments: DrawingSegment[] = [];
  const groupMap = new Map<string, DrawingGroup>();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const supported = new Set(["LINE", "LWPOLYLINE", "POLYLINE"]);

  dxf.entities.forEach((entity, idx) => {
    if (!supported.has(entity.type)) return;
    const points = entityPoints(entity);
    if (points.length < 2) return;

    const layer = entity.layer ?? "0";
    const category = classifyLayer(layer);
    const flat = flatPoints(points);
    const length = flatLength(flat);

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    segments.push({
      id: entity.handle ?? `e${idx}`,
      groupId: layer,
      category,
      points: flat,
      closed: Boolean((entity as { shape?: boolean }).shape),
      length,
    });

    const existing = groupMap.get(layer);
    if (existing) {
      existing.count += 1;
      existing.totalLength += length;
    } else {
      groupMap.set(layer, {
        id: layer,
        label: layer,
        category,
        count: 1,
        totalLength: length,
      });
    }
  });

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    source: "dxf",
    bounds: { minX, minY, maxX, maxY },
    segments,
    groups: Array.from(groupMap.values()).sort((a, b) => b.count - a.count),
    entityCount: dxf.entities.length,
    texts: [],
  };
}

/**
 * Convert PDF-extracted paths into a ParsedDrawing by clustering paths on
 * stroke colour. A CAD-exported PDF tends to use a small fixed palette per
 * layer, so identical colours act as a reasonable proxy for original layers.
 */
export interface PdfDetectOptions {
  /** Drop subpaths whose total length is below this (in PDF user units). */
  minSegmentLength?: number;
  /** Drop fully-white paths (typically background fills). */
  dropWhite?: boolean;
  /** Drop filled paths whose bounding box area is below this (in user units²). */
  minFilledArea?: number;
}

export function detectFromPdf(
  paths: ExtractedPath[],
  texts: DrawingTextItem[] = [],
  opts: PdfDetectOptions = {}
): ParsedDrawing {
  const minSegmentLength = opts.minSegmentLength ?? 5;
  const dropWhite = opts.dropWhite ?? true;
  const minFilledArea = opts.minFilledArea ?? 25;

  const segments: DrawingSegment[] = [];
  const groupMap = new Map<string, DrawingGroup>();

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  let pi = 0;
  for (const path of paths) {
    pi += 1;
    if (!path.isStroked && !path.isFilled) continue;
    const color = path.strokeColor ?? path.fillColor ?? [0, 0, 0];

    // Quantise to reduce near-duplicate clusters and clamp to 255.
    const r = Math.min(255, Math.round((color[0] * 255) / 8) * 8);
    const g = Math.min(255, Math.round((color[1] * 255) / 8) * 8);
    const b = Math.min(255, Math.round((color[2] * 255) / 8) * 8);
    if (dropWhite && r >= 248 && g >= 248 && b >= 248) continue;

    // Prefer grouping by OCG layer name when the PDF carries it; fall back
    // to colour cluster otherwise. Layer-based classification overrides the
    // colour heuristic since CAD layer names are far more semantic.
    const layer = path.layer ?? null;
    const filledSuffix = path.isFilled && !path.isStroked ? "_f" : "";
    const groupId = layer
      ? `layer_${layer}${filledSuffix}`
      : `rgb_${r}_${g}_${b}${filledSuffix}`;
    const category = layer
      ? classifyByLayer(layer, path.isFilled) ??
        classifyByColor(r, g, b, path.lineWidth, path.isFilled)
      : classifyByColor(r, g, b, path.lineWidth, path.isFilled);

    path.subpaths.forEach((sub, si) => {
      if (sub.length < 2) return;
      const flat = flatPoints(sub);
      if (flat.length < 4) return;
      const length = flatLength(flat);

      let bxMin = Infinity,
        byMin = Infinity,
        bxMax = -Infinity,
        byMax = -Infinity;
      for (let k = 0; k < flat.length; k += 2) {
        const x = flat[k];
        const y = flat[k + 1];
        if (x < bxMin) bxMin = x;
        if (y < byMin) byMin = y;
        if (x > bxMax) bxMax = x;
        if (y > byMax) byMax = y;
      }
      if (path.isFilled && !path.isStroked) {
        // Filled paths are the main source of text-glyph noise; apply both
        // the area and length cutoffs to drop sub-character glyphs.
        const area = (bxMax - bxMin) * (byMax - byMin);
        if (area < minFilledArea) return;
        if (length < minSegmentLength) return;
      }
      // Stroked paths (lane stripes, kerbs, give-way lines) often come in
      // dashes that are well under the length cutoff at A1-page scales.
      // Apply only a token cutoff (collapse degenerate near-zero strokes).
      if (length < 0.5) return;

      if (bxMin < minX) minX = bxMin;
      if (byMin < minY) minY = byMin;
      if (bxMax > maxX) maxX = bxMax;
      if (byMax > maxY) maxY = byMax;

      segments.push({
        id: `p${pi}_${si}`,
        groupId,
        category,
        points: flat,
        closed:
          flat.length >= 4 &&
          flat[0] === flat[flat.length - 2] &&
          flat[1] === flat[flat.length - 1],
        length,
        layer: layer ?? undefined,
      });

      const existing = groupMap.get(groupId);
      if (existing) {
        existing.count += 1;
        existing.totalLength += length;
      } else {
        groupMap.set(groupId, {
          id: groupId,
          label: layer
            ? `${layer}${filledSuffix ? " (filled)" : ""}`
            : `RGB(${r}, ${g}, ${b})${filledSuffix ? " filled" : ""}`,
          category,
          count: 1,
          totalLength: length,
          color: [r / 255, g / 255, b / 255],
          lineWidth: path.lineWidth,
          layer: layer ?? undefined,
        });
      }
    });
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  // Lane markings vs kerbs heuristic: only run for segments that came in
  // without a layer tag (i.e. PDFs without OCG metadata). When layers are
  // present they're more reliable than length-based guessing.
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const laneCutoff = diag * 0.012;
  const edgeGroupRecount = new Map<string, { edge: number; lane: number }>();
  for (const seg of segments) {
    if (seg.category !== "edge") continue;
    if (seg.layer) continue; // trust the layer
    if (seg.length < laneCutoff) seg.category = "lane";
    const r = edgeGroupRecount.get(seg.groupId) ?? { edge: 0, lane: 0 };
    if (seg.category === "lane") r.lane += 1;
    else r.edge += 1;
    edgeGroupRecount.set(seg.groupId, r);
  }
  for (const g of groupMap.values()) {
    if (g.category !== "edge") continue;
    if (g.layer) continue;
    const r = edgeGroupRecount.get(g.id);
    if (!r) continue;
    if (r.lane > 0 && r.lane / (r.lane + r.edge) > 0.9) {
      g.category = "lane";
    }
  }

  // Stitch FIRST, cap AFTER. The user's main layers (Road Lane_Main = 44k
  // stripes, Survey_EXI_LANE = 51k) are heavily fragmented in the source
  // PDF; the stitcher is what collapses them back into a small number of
  // continuous polylines. Capping before stitching would lose 97% of the
  // layer's stripes before they could be merged. The stitcher itself
  // mutates point arrays in place so memory cost stays bounded even at
  // 50k+ segments per group.
  const stitched0 = stitchSegmentsByGroup(segments, diag);

  // Per-category caps applied AFTER stitching. After 44k stripes have
  // collapsed to ~hundreds of polylines, even a tight cap leaves plenty
  // of visual coverage.
  const POST_STITCH_CAP: Record<RoadCategory, number> = {
    edge: 6000,
    curb: 6000,
    lane: 4000,
    centerline: 2000,
    boundary: 2000,
    shoulder: 1500,
    building: 6000,
    other: 3000,
  };
  const byCat = new Map<RoadCategory, DrawingSegment[]>();
  for (const s of stitched0) {
    const arr = byCat.get(s.category) ?? [];
    arr.push(s);
    byCat.set(s.category, arr);
  }
  const stitched: DrawingSegment[] = [];
  for (const [cat, arr] of byCat) {
    const cap = POST_STITCH_CAP[cat] ?? 3000;
    if (arr.length <= cap) {
      stitched.push(...arr);
      continue;
    }
    arr.sort((a, b) => b.length - a.length);
    stitched.push(...arr.slice(0, cap));
  }
  // Recompute group counts / total length to reflect the merged segments.
  for (const g of groupMap.values()) {
    g.count = 0;
    g.totalLength = 0;
  }
  for (const s of stitched) {
    const g = groupMap.get(s.groupId);
    if (g) {
      g.count += 1;
      g.totalLength += s.length;
    }
  }

  return {
    source: "pdf",
    bounds: { minX, minY, maxX, maxY },
    segments: stitched,
    groups: Array.from(groupMap.values()).sort((a, b) => b.count - a.count),
    entityCount: paths.length,
    texts,
  };
}

/**
 * Stitch end-to-end collinear polylines inside each group. Two segments are
 * considered joinable when their endpoints are within `endpointTol` of each
 * other AND the bearing of the first ending segment matches (within
 * `angleTolDeg`) the bearing of the second segment leaving the join point.
 *
 * Designed to handle dense lane layers (Survey_EXI_LANE has 51k stripes,
 * Road Lane_Main 44k). Keeps cost ~linear in successful merges by:
 *   - Spatial-hashing segment endpoints so neighbour lookup is O(k) per
 *     merge (k ~ small, depends on local density).
 *   - Queue-based outer loop: only re-enqueue indices that were just
 *     extended (their tail moved, so they might chain to a new neighbour).
 *     We never iterate all N indices every round.
 *   - Incremental grid maintenance: removeEnd / addEnd keep the spatial
 *     hash in sync as merges happen so subsequent lookups stay correct.
 *   - Per-polyline point cap so a degenerate chain can't grow without
 *     bound and tank render performance later.
 */
const MAX_MERGED_POINTS = 6000;

function stitchSegmentsByGroup(
  segments: DrawingSegment[],
  diag: number
): DrawingSegment[] {
  if (segments.length === 0) return segments;
  const endpointTol = Math.max(diag * 0.0008, 0.5);
  const angleTolDeg = 12;
  const cell = Math.max(endpointTol * 2, 1);

  const byGroup = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const arr = byGroup.get(segments[i].groupId) ?? [];
    arr.push(i);
    byGroup.set(segments[i].groupId, arr);
  }

  const dropped = new Set<number>();
  const segCopy: { points: number[]; length: number }[] = segments.map((s) => ({
    points: s.points.slice(),
    length: s.length,
  }));

  const bearingFromTo = (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): number => ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360;
  const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

  for (const [, indices] of byGroup) {
    if (indices.length < 2) continue;

    type EndRef = { idx: number; end: 0 | 1 };
    const grid = new Map<string, EndRef[]>();
    const cellKey = (x: number, y: number) =>
      `${Math.floor(x / cell)}_${Math.floor(y / cell)}`;
    const addEnd = (i: number, end: 0 | 1) => {
      const pts = segCopy[i].points;
      const x = end === 0 ? pts[0] : pts[pts.length - 2];
      const y = end === 0 ? pts[1] : pts[pts.length - 1];
      const k = cellKey(x, y);
      const arr = grid.get(k) ?? [];
      arr.push({ idx: i, end });
      grid.set(k, arr);
    };
    const removeEnd = (i: number, end: 0 | 1, prevX: number, prevY: number) => {
      const k = cellKey(prevX, prevY);
      const arr = grid.get(k);
      if (!arr) return;
      const j = arr.findIndex((r) => r.idx === i && r.end === end);
      if (j >= 0) arr.splice(j, 1);
    };
    for (const i of indices) {
      addEnd(i, 0);
      addEnd(i, 1);
    }

    // Queue-based: start with all indices; only re-enqueue an index that was
    // just modified (its tail moved, so it might chain to a new neighbour).
    const queue: number[] = indices.slice();
    const safetyCap = indices.length * 4;
    let mergesDone = 0;

    while (queue.length > 0 && mergesDone < safetyCap) {
      const i = queue.pop()!;
      if (dropped.has(i)) continue;
      const a = segCopy[i];
      if (a.points.length < 4) continue;
      if (a.points.length > MAX_MERGED_POINTS) continue;

      const tx = a.points[a.points.length - 2];
      const ty = a.points[a.points.length - 1];
      const taBearing = bearingFromTo(
        a.points[a.points.length - 4],
        a.points[a.points.length - 3],
        tx,
        ty
      );
      const cx = Math.floor(tx / cell);
      const cy = Math.floor(ty / cell);
      let best: { j: number; reverse: boolean; d: number } | null = null;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const refs = grid.get(`${cx + dx}_${cy + dy}`);
          if (!refs) continue;
          for (const ref of refs) {
            if (ref.idx === i || dropped.has(ref.idx)) continue;
            const b = segCopy[ref.idx];
            if (b.points.length < 4) continue;
            const bx = ref.end === 0 ? b.points[0] : b.points[b.points.length - 2];
            const by = ref.end === 0 ? b.points[1] : b.points[b.points.length - 1];
            const d = Math.hypot(bx - tx, by - ty);
            if (d > endpointTol) continue;
            const bBearing =
              ref.end === 0
                ? bearingFromTo(b.points[0], b.points[1], b.points[2], b.points[3])
                : bearingFromTo(
                    b.points[b.points.length - 2],
                    b.points[b.points.length - 1],
                    b.points[b.points.length - 4],
                    b.points[b.points.length - 3]
                  );
            if (angleDiff(taBearing, bBearing) > angleTolDeg) continue;
            if (!best || d < best.d) best = { j: ref.idx, reverse: ref.end === 1, d };
          }
        }
      }
      if (!best) continue;
      const b = segCopy[best.j];
      // Build the merged point array WITHOUT calling slice + concat (those
      // allocate fresh arrays per merge - on a 44k-stripe layer that's a
      // GC nightmare). Mutate a.points in place: drop its last point
      // (which is the duplicated join), then append b's points.
      const bPts = best.reverse ? reverseFlat(b.points) : b.points;
      const projectedLen = a.points.length - 2 + bPts.length;
      if (projectedLen < 4 || projectedLen > MAX_MERGED_POINTS) continue;

      // Update grid: remove a's old tail, b's used end and free end.
      removeEnd(i, 1, tx, ty);
      const bUsedEnd: 0 | 1 = best.reverse ? 1 : 0;
      const bFreeEnd: 0 | 1 = best.reverse ? 0 : 1;
      const bUsedX = bUsedEnd === 0 ? b.points[0] : b.points[b.points.length - 2];
      const bUsedY = bUsedEnd === 0 ? b.points[1] : b.points[b.points.length - 1];
      const bFreeX = bFreeEnd === 0 ? b.points[0] : b.points[b.points.length - 2];
      const bFreeY = bFreeEnd === 0 ? b.points[1] : b.points[b.points.length - 1];
      removeEnd(best.j, bUsedEnd, bUsedX, bUsedY);
      removeEnd(best.j, bFreeEnd, bFreeX, bFreeY);

      // In-place merge: shrink a.points to drop the duplicated join point,
      // then push b's points one element at a time (avoids the spread-args
      // call-stack limit on long arrays).
      a.points.length -= 2;
      for (let k = 0; k < bPts.length; k++) a.points.push(bPts[k]);
      a.length = a.length + b.length + best.d;
      dropped.add(best.j);
      // Re-add a's NEW tail to the grid so it can chain again.
      const newTx = a.points[a.points.length - 2];
      const newTy = a.points[a.points.length - 1];
      const k = cellKey(newTx, newTy);
      const arr = grid.get(k) ?? [];
      arr.push({ idx: i, end: 1 });
      grid.set(k, arr);

      mergesDone += 1;
      queue.push(i);
    }
  }

  const out: DrawingSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (dropped.has(i)) continue;
    const orig = segments[i];
    const upd = segCopy[i];
    out.push({
      ...orig,
      points: upd.points,
      length: upd.length,
      closed:
        upd.points.length >= 4 &&
        upd.points[0] === upd.points[upd.points.length - 2] &&
        upd.points[1] === upd.points[upd.points.length - 1],
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

const PDF_LAYER_PATTERNS: { category: RoadCategory; patterns: RegExp[] }[] = [
  // Lane markings: anything painted on top of the asphalt body.
  // Substring-style; underscores are regex word characters so \b doesn't
  // help inside "Road Lane_Main".
  {
    category: "lane",
    patterns: [
      /road\s*lane/i,
      /lane[_\s-]?(?:main|direction|mark|line)/i,
      /lane[_\s-]?direction/i,
      /road\s*mark/i,
      /road\s*pedestrian/i,
      /road\s*crossing/i,
      /road\s*give\s*way/i,
      /giveway/i,
      /road\s*no\s*crossing/i,
      /cycle[\s_-]*track/i,
      /(?:^|[^a-z])lane(?:[^a-z]|$)/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?lane/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?arrow/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?marking/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?ped/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?yellow/i,
      /yellow\s*line/i,
      /drop\s*kerb\s*mark/i,
      /(?:^|[^a-z])arrow(?:[^a-z]|$)/i,
      /stop\s*line/i,
      /zebra/i,
      /crosswalk/i,
      /(?:^|[^a-z])parking(?:[^a-z]|$)/i,
      /shuttle\s*bus/i,
      /taxi\s*lay/i,
    ],
  },
  // Curbs / kerbs / road edges - the boundary of the drivable asphalt.
  {
    category: "edge",
    patterns: [
      /road\s*edge/i,
      /edge[_\s-]*kerb/i,
      /(?<!drop[_\s-]*)kerb(?![_\s-]*mark)/i,
      /(?:^|[^a-z])curb(?:[^a-z]|$)/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?kerb/i,
      /survey[_\s.-]+(?:exi[_\s.-]+)?bridge/i,
      /road\s*flush/i,
      /road\s*shoulder/i,
      /road\s*barrier/i,
      /road\s*raised\s*access/i,
      /(?<!marking[_\s-]*)drop\s*kerb(?!\s*mark)/i,
      /(?:^|[^a-z])eop(?:[^a-z]|$)/i,
      /edge.?of.?pavement/i,
    ],
  },
  // Boundary layers - legal/planning extents AND right-of-way (ROW).
  // ROW used to be tagged 'centerline' but the source PDF has no
  // centerlines drawn; ROW is a corridor boundary, so it belongs here.
  {
    category: "boundary",
    patterns: [
      /(affection|cluster|development|plot|drone|rta)\s*boundary/i,
      /(?:^|[^a-z])row(?:[^a-z]|$)/i,
      /road\s*proposed\s*row/i,
      /\bboundary\b/i,
      /\baffection\b/i,
      /(?:^|[^a-z])plot(?:[^a-z]|$)/i,
      /(?:^|[^a-z])fence(?:[^a-z]|$)/i,
    ],
  },
  // Building footprints - intentionally NARROW pattern set: only villa /
  // townhouse / townhome / mixed-use layer names classify as building.
  // Everything else (hospital, hotel, school, mosque, anchor assets, etc.)
  // falls through to 'other'. The user explicitly wants to keep building
  // classification conservative for downstream visualisation.
  {
    category: "building",
    patterns: [
      /villa/i,
      /townhouse/i,
      /town[\s_-]*hous/i,
      /town[\s_-]*home/i,
      /mixed[\s_-]?use/i,
    ],
  },
];

/**
 * PDF OCG layer-name classifier. Returns null when no rule matches so the
 * caller can fall back to colour-based heuristics.
 */
function classifyByLayer(layer: string, _isFilled: boolean): RoadCategory | null {
  for (const { category, patterns } of PDF_LAYER_PATTERNS) {
    if (patterns.some((p) => p.test(layer))) return category;
  }
  return null;
}

/**
 * Heuristic colour classifier for AutoCAD-exported PDFs. The palette below is
 * a starting guess; users can re-label clusters in the UI.
 */
function classifyByColor(
  r: number,
  g: number,
  b: number,
  _lineWidth: number,
  isFilled: boolean
): RoadCategory {
  const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;

  // Bright magenta/purple historically meant the road-edge layer in this
  // CMP plan family. With layer names available it's classified by name;
  // colour fallback keeps it as edge so unnamed magenta polylines still
  // belong to the curb cluster (the user-facing 'centerline' label is
  // gone - the source PDF has no centerlines drawn).
  if (r > 150 && b > 120 && g < 100) return "edge";
  if (!isGray && g > 160 && r < 120 && b < 120) return "boundary";
  if (!isGray && b > 180 && r < 150) return "other";
  if (isFilled && r < 80 && g < 80 && b < 80) return "building";
  if (isGray && r < 200 && r > 60) return "edge";
  return "other";
}
