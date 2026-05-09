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

    const groupId = `rgb_${r}_${g}_${b}${path.isFilled && !path.isStroked ? "_f" : ""}`;
    const category = classifyByColor(r, g, b, path.lineWidth, path.isFilled);

    path.subpaths.forEach((sub, si) => {
      if (sub.length < 2) return;
      const flat = flatPoints(sub);
      if (flat.length < 4) return;
      const length = flatLength(flat);
      if (length < minSegmentLength) return;

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
        const area = (bxMax - bxMin) * (byMax - byMin);
        if (area < minFilledArea) return;
      }

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
          label: `RGB(${r}, ${g}, ${b})${path.isFilled && !path.isStroked ? " filled" : ""}`,
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

  // Lane markings vs kerbs share the same grey colour in CAD-exported PDFs
  // and aren't distinguishable by colour alone. AutoCAD draws dashed stripes
  // as many short individual polylines (no PDF setDash), so we can split
  // segments classified as 'edge' into 'lane' (short) and 'edge' (long) by
  // length, using a threshold tied to the drawing extents.
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const laneCutoff = diag * 0.012; // ~1.2% of bounds diagonal
  const edgeGroupRecount = new Map<
    string,
    { edge: number; lane: number; edgeLen: number; laneLen: number }
  >();
  for (const seg of segments) {
    if (seg.category !== "edge") continue;
    if (seg.length < laneCutoff) {
      seg.category = "lane";
    }
    const r = edgeGroupRecount.get(seg.groupId) ?? {
      edge: 0,
      lane: 0,
      edgeLen: 0,
      laneLen: 0,
    };
    if (seg.category === "lane") {
      r.lane += 1;
      r.laneLen += seg.length;
    } else {
      r.edge += 1;
      r.edgeLen += seg.length;
    }
    edgeGroupRecount.set(seg.groupId, r);
  }
  // If a colour group ended up overwhelmingly 'lane' (90%+ short segments),
  // promote the whole group to 'lane'. Otherwise leave it mixed.
  for (const g of groupMap.values()) {
    if (g.category !== "edge") continue;
    const r = edgeGroupRecount.get(g.id);
    if (!r) continue;
    if (r.lane > 0 && r.lane / (r.lane + r.edge) > 0.9) {
      g.category = "lane";
    }
  }

  return {
    source: "pdf",
    bounds: { minX, minY, maxX, maxY },
    segments,
    groups: Array.from(groupMap.values()).sort((a, b) => b.count - a.count),
    entityCount: paths.length,
    texts,
  };
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

  // Bright magenta/purple → centerline / median markings.
  if (r > 150 && b > 120 && g < 100) return "centerline";
  // Strong green (g dominant over r and b) → boundary / property line.
  // The earlier rule fired on neutral grays because gray has g > 160 too.
  if (!isGray && g > 160 && r < 120 && b < 120) return "boundary";
  // Cyan / blue strokes → utility lines, ignore for road geometry.
  if (!isGray && b > 180 && r < 150) return "other";
  // Dark grey filled regions → buildings or asphalt fills.
  if (isFilled && r < 80 && g < 80 && b < 80) return "building";
  // Mid grey strokes → kerbs / road edges.
  if (isGray && r < 200 && r > 60) return "edge";
  return "other";
}
