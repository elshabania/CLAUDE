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

  return {
    source: "pdf",
    bounds: { minX, minY, maxX, maxY },
    segments,
    groups: Array.from(groupMap.values()).sort((a, b) => b.count - a.count),
    entityCount: paths.length,
    texts,
  };
}

const PDF_LAYER_PATTERNS: { category: RoadCategory; patterns: RegExp[] }[] = [
  // Lane-related layers: lane bodies, lane direction, lane markings, parking
  // marks, give-way / stop / no-crossing lines, arrows, cycle tracks, ped
  // crossings. Anything that is "stuff drawn on top of the road body".
  {
    category: "lane",
    patterns: [
      /\blane\b/i,
      /\bcycle.?track\b/i,
      /\bcrossing\b/i,
      /\bgiveway\b/i,
      /\bgive\s*way\b/i,
      /\bstop\s*line\b/i,
      /\bno.?crossing\b/i,
      /\bdrop.?kerb.?marking\b/i,
      /\barrow\b/i,
      /\broad.?mark\b/i,
      /\bparking\b/i,
      /\bcrosswalk\b/i,
      /\bzebra\b/i,
    ],
  },
  // Solid kerb / road-edge layers.
  {
    category: "edge",
    patterns: [
      /\bkerb\b/i,
      /\bcurb\b/i,
      /\broad.?edge\b/i,
      /\bedge.?of.?pavement\b/i,
      /\beop\b/i,
      /\broad.?flush\b/i,
      /\bdrop.?kerb\b/i,
    ],
  },
  // Right-of-way / road centerline / median.
  {
    category: "centerline",
    patterns: [
      /\brow\b/i,
      /\bcenter.?line\b/i,
      /\bcentre.?line\b/i,
      /\bmedian\b/i,
      /\b\/cl\/\b/i,
    ],
  },
  // Boundary layers (legal, planning, master plan extents).
  {
    category: "boundary",
    patterns: [
      /\bboundary\b/i,
      /\bplot\b/i,
      /\baffection\b/i,
      /\bcluster\s*boundary\b/i,
      /\baffected\b/i,
    ],
  },
  // Building footprints - detected by land-use layer naming. The villa,
  // townhouse and mixed-use patterns are placed first and use loose
  // matching (any layer containing the word) so they always win over
  // accidental partial matches in other rules.
  {
    category: "building",
    patterns: [
      /villa/i,
      /townhouse/i,
      /town[\s_-]*hous/i,
      /town[\s_-]*home/i,
      /\bth\b/i,
      /resi[_\s\-]?(?:villa|town|h\b|dential)?/i,
      /residential/i,
      /apart/i,
      /\bhotel\b/i,
      /boutique/i,
      /hospital/i,
      /\bschool\b/i,
      /\bmosque\b/i,
      /masjid/i,
      /religi/i,
      /\bbldg\b/i,
      /\bbuilding\b/i,
      /\boffice\b/i,
      /\bretail\b/i,
      /mixed[\s_-]?use/i,
      /commercial/i,
      /anchor\s*assets?/i,
      /grandstand/i,
      /\bstable\b/i,
      /equine/i,
      /equest/i,
      /\bmall\b/i,
      /clinic/i,
      /museum/i,
      /gallery/i,
      /police/i,
      /fire.?station/i,
      /library/i,
      /community/i,
      /cultural/i,
      /vertiport/i,
      /\bjarc\b/i,
      /facility\s*management/i,
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
