import type { Dxf, DxfEntity, DxfPoint } from "dxf-parser";

export type RoadCategory = "centerline" | "edge" | "lane" | "curb" | "shoulder" | "other";

export interface RoadSegment {
  id: string;
  layer: string;
  category: RoadCategory;
  points: DxfPoint[];
  closed: boolean;
  length: number;
}

export interface ParsedDrawing {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  segments: RoadSegment[];
  layers: { name: string; category: RoadCategory; count: number }[];
  entityCount: number;
}

const LAYER_PATTERNS: { category: RoadCategory; patterns: RegExp[] }[] = [
  {
    category: "centerline",
    patterns: [/center.?line/i, /\bcl\b/i, /\bc[\/_-]?l\b/i, /centre.?line/i],
  },
  {
    category: "edge",
    patterns: [/edge.?of.?pavement/i, /\beop\b/i, /pavement.?edge/i, /road.?edge/i, /\bedge\b/i],
  },
  {
    category: "lane",
    patterns: [/lane.?line/i, /\blane\b/i, /stripe/i, /marking/i],
  },
  {
    category: "curb",
    patterns: [/curb/i, /kerb/i, /\bgutter\b/i],
  },
  {
    category: "shoulder",
    patterns: [/shoulder/i, /\bverge\b/i],
  },
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

function polylineLength(points: DxfPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

export function detectRoads(dxf: Dxf): ParsedDrawing {
  const segments: RoadSegment[] = [];
  const layerCounts = new Map<string, { category: RoadCategory; count: number }>();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const supported = new Set(["LINE", "LWPOLYLINE", "POLYLINE"]);

  dxf.entities.forEach((entity, idx) => {
    if (!supported.has(entity.type)) return;
    const points = entityPoints(entity);
    if (points.length < 2) return;

    const layer = entity.layer ?? "0";
    const category = classifyLayer(layer);

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    segments.push({
      id: entity.handle ?? `e${idx}`,
      layer,
      category,
      points,
      closed: Boolean((entity as { shape?: boolean }).shape),
      length: polylineLength(points),
    });

    const existing = layerCounts.get(layer);
    if (existing) {
      existing.count += 1;
    } else {
      layerCounts.set(layer, { category, count: 1 });
    }
  });

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    bounds: { minX, minY, maxX, maxY },
    segments,
    layers: Array.from(layerCounts.entries()).map(([name, v]) => ({
      name,
      category: v.category,
      count: v.count,
    })),
    entityCount: dxf.entities.length,
  };
}
