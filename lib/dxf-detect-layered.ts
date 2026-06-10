// Layer-aware DXF detection: turn a parsed DXF directly into a
// ParsedDrawing whose segments carry MEANING (not just `category: "other"`).
//
// Why this exists:
//   The original detectFromDxf reads layer names as group ids but defaults
//   every entity to `category: "other"`, which threw away the entire
//   advantage of having a DXF over a PDF (PDF has no layer names; DXF does).
//   This module wires layer names through to the road category and to a
//   `role` hint (centerline / edge / polygon / junction / ignore) so the
//   network builder can skip the skeletonizer for layers that already ARE
//   centerlines and only fall back to fill/skeleton for layers that are
//   polygons or edges.

import type { Dxf, DxfEntity, DxfPoint } from "dxf-parser";
import {
  type DrawingGroup,
  type DrawingSegment,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import {
  classifyLayers,
  type BuildRulesArgs,
  type LayerMatch,
  type LayerRole,
} from "@/lib/dxf-layer-rules";

const SUPPORTED_ENTITY_TYPES = new Set([
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "INSERT", // block reference — represents a junction when on a junction layer
]);

function entityPoints(e: DxfEntity): DxfPoint[] {
  if (e.type === "LINE" && e.startPoint && e.endPoint) {
    return [e.startPoint, e.endPoint];
  }
  if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && Array.isArray(e.vertices)) {
    return (e.vertices as DxfPoint[]).filter(
      (p) => typeof p?.x === "number" && typeof p?.y === "number"
    );
  }
  if (e.type === "INSERT" && e.position) {
    // A single-point "polyline" so the network builder can still see it; the
    // role=junction hint tells it this is a node, not a link.
    return [e.position as DxfPoint];
  }
  return [];
}

function flatPoints(pts: DxfPoint[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

function flatLength(flat: number[]): number {
  let total = 0;
  for (let i = 2; i < flat.length; i += 2) {
    const dx = flat[i] - flat[i - 2];
    const dy = flat[i + 1] - flat[i - 1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

/**
 * Extra metadata the network builder can use to skip work for layers whose
 * geometry is already a centerline. Carried alongside the standard ParsedDrawing
 * via a parallel map keyed by segment id (kept outside DrawingSegment to avoid
 * a breaking type change for the PDF path).
 */
export interface DxfSegmentMeta {
  /** Layer name this segment came from. */
  layer: string;
  /** Match outcome (null = unmatched, stays "other" so user can re-tag). */
  match: LayerMatch | null;
  /** Convenience: the layer role, or "ignore" when unmatched. */
  role: LayerRole;
  /** Layer-derived lane count (if name encoded one). */
  lanesPerDirHint?: number;
}

export interface LayeredDxfResult {
  drawing: ParsedDrawing;
  /** Per-segment metadata keyed by segment.id. */
  meta: Map<string, DxfSegmentMeta>;
  /** Per-layer classification summary for a UI table. */
  layers: Array<{ layer: string; match: LayerMatch | null; segmentCount: number }>;
  /** Diagnostic counts so the caller can show "237 centerlines, 84 edges…". */
  counts: Record<LayerRole | "unmatched", number>;
}

/**
 * Layer-aware DXF detector. Returns a ParsedDrawing with real road
 * categories (not "other") plus per-segment role metadata so the network
 * builder can use centerline polylines DIRECTLY and skip skeletonization.
 *
 * Pure function — does not mutate `dxf`. Patterns can be extended via `args`.
 */
export function detectFromDxfLayered(dxf: Dxf, args: BuildRulesArgs = {}): LayeredDxfResult {
  // 1. Gather every distinct layer name used by an entity.
  const layerNames = new Set<string>();
  for (const e of dxf.entities) {
    if (!SUPPORTED_ENTITY_TYPES.has(e.type)) continue;
    layerNames.add(e.layer ?? "0");
  }
  // 2. Run the rules once per layer (not per entity).
  const { byLayer, summary } = classifyLayers(layerNames, args);

  // 3. Walk entities and build segments.
  const segments: DrawingSegment[] = [];
  const meta = new Map<string, DxfSegmentMeta>();
  const groupMap = new Map<string, DrawingGroup>();
  const counts: Record<LayerRole | "unmatched", number> = {
    centerline: 0,
    edge: 0,
    polygon: 0,
    junction: 0,
    ignore: 0,
    unmatched: 0,
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const segCountByLayer = new Map<string, number>();

  dxf.entities.forEach((entity, idx) => {
    if (!SUPPORTED_ENTITY_TYPES.has(entity.type)) return;
    const pts = entityPoints(entity);
    if (pts.length === 0) return;

    const layer = entity.layer ?? "0";
    const match = byLayer.get(layer) ?? null;

    // Skip ignore-layers (annotation / dimensions / hatch / etc.).
    if (match?.role === "ignore") {
      counts.ignore += 1;
      return;
    }
    // INSERT (block reference) only useful when on a junction layer.
    if (entity.type === "INSERT" && match?.role !== "junction") return;

    // For polylines, need at least 2 points; INSERT junction nodes are a single
    // point and we still emit them so the graph builder can pick them up.
    if (entity.type !== "INSERT" && pts.length < 2) return;

    const flat = flatPoints(pts);
    const length = entity.type === "INSERT" ? 0 : flatLength(flat);

    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const category: RoadCategory = match?.category ?? "other";
    const closed = Boolean(
      (entity as { shape?: boolean }).shape ||
        (entity as { closed?: boolean }).closed
    );

    const id = entity.handle ?? `e${idx}`;
    segments.push({
      id,
      groupId: layer,
      category,
      points: flat,
      closed,
      length,
    });
    meta.set(id, {
      layer,
      match,
      role: match?.role ?? "ignore",
      lanesPerDirHint: match?.lanesPerDirHint,
    });

    // Tally by role for diagnostics.
    if (match) counts[match.role] += 1;
    else counts.unmatched += 1;

    segCountByLayer.set(layer, (segCountByLayer.get(layer) ?? 0) + 1);

    // Group by layer (one row per layer in the legend UI).
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

  const drawing: ParsedDrawing = {
    source: "dxf",
    bounds: { minX, minY, maxX, maxY },
    segments,
    groups: Array.from(groupMap.values()).sort((a, b) => b.count - a.count),
    entityCount: dxf.entities.length,
    texts: [],
  };

  const layers = summary.map(({ layer, match }) => ({
    layer,
    match,
    segmentCount: segCountByLayer.get(layer) ?? 0,
  }));

  return { drawing, meta, layers, counts };
}
