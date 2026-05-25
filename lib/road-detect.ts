import type { Dxf, DxfEntity, DxfPoint } from "dxf-parser";
import type { ExtractedPath } from "@/lib/pdf-extract";
import { LEGEND_SWATCHES, type LegendSwatch } from "@/lib/legend-swatches";

export type RoadCategory =
  | "road_row"
  | "road_plot"
  | "taxi_layby"
  | "shuttle_layby"
  | "emergency_access"
  | "apartment_access"
  | "plot_access"
  | "bridge"
  | "bridge_ramp"
  | "tunnel"
  | "tunnel_ramp"
  | "raised_crossing"
  | "building"
  | "context"
  | "greenery"
  | "water"
  | "plot_fill"
  | "other";

/** Categories that represent driveable road surface (used by the network builder). */
export const ROAD_CATEGORIES: ReadonlySet<RoadCategory> = new Set([
  "road_row",
  "road_plot",
  "taxi_layby",
  "shuttle_layby",
  "emergency_access",
  "apartment_access",
  "plot_access",
  "bridge",
  "bridge_ramp",
  "tunnel",
  "tunnel_ramp",
]);

/** Human-readable labels for the UI. Keep in sync with the printed legend. */
export const CATEGORY_LABELS: Record<RoadCategory, string> = {
  road_row: "Proposed Road (within ROW)",
  road_plot: "Proposed Road (within Plot)",
  taxi_layby: "Taxi / Drop-off Layby",
  shuttle_layby: "Shuttle Bus Layby",
  emergency_access: "Emergency Vehicle Access",
  apartment_access: "Apartment Access",
  plot_access: "Plot Access",
  bridge: "Bridge",
  bridge_ramp: "Bridge Ramp",
  tunnel: "Tunnel",
  tunnel_ramp: "Tunnel Ramp",
  raised_crossing: "Raised Pedestrian Crossing",
  building: "Building",
  context: "Context",
  greenery: "Park / Greenery",
  water: "Water",
  plot_fill: "Plot Interior",
  other: "Other",
};

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

/**
 * Master-plan PDFs classify roads by *fill colour* matched to the legend.
 * We compare each path's colour to the legend swatches under CIE-Lab
 * distance and pick the closest match within tolerance. Falls back to
 * "other" when no swatch is close enough.
 *
 * The runtime can pass an override list (e.g. from the LegendPanel
 * re-pick UI) that takes precedence over the compiled-in swatches.
 */

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  // sRGB D65 -> XYZ
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function classifyByLegendSwatch(
  r: number,
  g: number,
  b: number,
  swatches: readonly LegendSwatch[] = LEGEND_SWATCHES
): RoadCategory {
  const lab = rgbToLab(r, g, b);
  let best: { cat: RoadCategory; d: number } | null = null;
  for (const sw of swatches) {
    const candidates: [number, number, number][] = [sw.rgb];
    if (sw.aliases) candidates.push(...sw.aliases);
    for (const c of candidates) {
      const d = deltaE(lab, rgbToLab(c[0], c[1], c[2]));
      if (d > sw.tolerance) continue;
      if (!best || d < best.d) best = { cat: sw.category, d };
    }
  }
  return best?.cat ?? "other";
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
    // DXF entities don't carry fill colour we can match against the legend;
    // they're only used by the auxiliary upload path. Default to "other"
    // so the user can re-classify per-group in the UI.
    const category: RoadCategory = "other";
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
 * Convert PDF-extracted paths into a ParsedDrawing. Each path is matched
 * to a legend swatch by fill colour (or stroke colour if unfilled); the
 * matched category becomes the segment's category. Paths with the same
 * matched colour share a group so the UI can list one row per legend
 * class.
 */
export interface PdfDetectOptions {
  /** Drop subpaths whose total length is below this (in PDF user units). */
  minSegmentLength?: number;
  /** Drop fully-white paths (typically background fills). */
  dropWhite?: boolean;
  /** Drop filled paths whose bounding box area is below this (in user units²). */
  minFilledArea?: number;
  /** Per-category swatch overrides keyed by category. */
  swatchOverrides?: Partial<Record<RoadCategory, [number, number, number]>>;
}

export function detectFromPdf(
  paths: ExtractedPath[],
  texts: DrawingTextItem[] = [],
  opts: PdfDetectOptions = {}
): ParsedDrawing {
  const minSegmentLength = opts.minSegmentLength ?? 5;
  const dropWhite = opts.dropWhite ?? true;
  const minFilledArea = opts.minFilledArea ?? 25;

  // Apply runtime swatch overrides on top of the compiled-in legend.
  const swatches: LegendSwatch[] = LEGEND_SWATCHES.map((sw) => {
    const override = opts.swatchOverrides?.[sw.category];
    return override ? { ...sw, rgb: override } : sw;
  });

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
    // Master-plan PDFs classify by FILL colour. Fall back to stroke for
    // line-only paths (kerbs, tick marks).
    const color = path.isFilled
      ? path.fillColor ?? path.strokeColor ?? [0, 0, 0]
      : path.strokeColor ?? path.fillColor ?? [0, 0, 0];

    // Quantise to reduce near-duplicate clusters and clamp to 255.
    const r = Math.min(255, Math.round((color[0] * 255) / 8) * 8);
    const g = Math.min(255, Math.round((color[1] * 255) / 8) * 8);
    const b = Math.min(255, Math.round((color[2] * 255) / 8) * 8);
    if (dropWhite && r >= 248 && g >= 248 && b >= 248) continue;

    const filledSuffix = path.isFilled && !path.isStroked ? "_f" : "";
    const category = classifyByLegendSwatch(r, g, b, swatches);
    // Group by category so the Legend panel lists one row per legend class.
    // Paths that didn't match any swatch go into per-colour "other" groups
    // so the user can still see and re-pick them.
    const groupId =
      category === "other"
        ? `other_rgb_${r}_${g}_${b}${filledSuffix}`
        : `cat_${category}`;

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
      });

      const existing = groupMap.get(groupId);
      if (existing) {
        existing.count += 1;
        existing.totalLength += length;
      } else {
        groupMap.set(groupId, {
          id: groupId,
          label:
            category === "other"
              ? `RGB(${r}, ${g}, ${b})${filledSuffix ? " filled" : ""}`
              : CATEGORY_LABELS[category],
          category,
          count: 1,
          totalLength: length,
          color: [r / 255, g / 255, b / 255],
          lineWidth: path.lineWidth,
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

  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;

  // Master-plan PDFs render every coloured region as a swarm of tiny SOLID
  // hatch tiles (closed polygons). Those must NOT be stitched - the stitcher
  // is for chaining open lane-stripe polylines end-to-end, and running it on
  // closed tiles fuses unrelated tiles into garbage blobs. Likewise they must
  // NOT be capped, or roads render with big holes. So: pass closed fill tiles
  // through untouched, and only stitch the open stroked polylines.
  const closedFills: DrawingSegment[] = [];
  const openStrokes: DrawingSegment[] = [];
  for (const s of segments) {
    if (s.closed) closedFills.push(s);
    else openStrokes.push(s);
  }
  const stitchedOpen = stitchSegmentsByGroup(openStrokes, diag);

  // Per-category cap applies only to the open stroked polylines (which can be
  // genuinely huge in lane-striped CAD PDFs). Fill tiles are uncapped so the
  // coloured regions stay complete; a high global guard prevents pathological
  // memory on a degenerate file.
  const OPEN_CAP: Record<RoadCategory, number> = {
    road_row: 6000,
    road_plot: 6000,
    taxi_layby: 2000,
    shuttle_layby: 2000,
    emergency_access: 4000,
    apartment_access: 4000,
    plot_access: 4000,
    bridge: 2000,
    bridge_ramp: 2000,
    tunnel: 2000,
    tunnel_ramp: 2000,
    raised_crossing: 8000,
    building: 8000,
    context: 8000,
    greenery: 8000,
    water: 4000,
    plot_fill: 8000,
    other: 4000,
  };
  const openByCat = new Map<RoadCategory, DrawingSegment[]>();
  for (const s of stitchedOpen) {
    const arr = openByCat.get(s.category) ?? [];
    arr.push(s);
    openByCat.set(s.category, arr);
  }
  const cappedOpen: DrawingSegment[] = [];
  for (const [cat, arr] of openByCat) {
    const cap = OPEN_CAP[cat] ?? 3000;
    if (arr.length <= cap) {
      cappedOpen.push(...arr);
    } else {
      arr.sort((a, b) => b.length - a.length);
      cappedOpen.push(...arr.slice(0, cap));
    }
  }

  // Fill tiles uncapped, but guard against a pathological file (>250k tiles).
  const FILL_GUARD = 250000;
  const fillsKept =
    closedFills.length <= FILL_GUARD
      ? closedFills
      : closedFills
          .slice()
          .sort((a, b) => b.length - a.length)
          .slice(0, FILL_GUARD);

  const stitched: DrawingSegment[] = [...fillsKept, ...cappedOpen];
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

