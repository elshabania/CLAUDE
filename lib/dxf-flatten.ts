// Flatten a parsed DXF into a flat list of stroked + filled primitives in
// world coordinates, expanding INSERTs into their referenced blocks (with the
// insert's translation/rotation/scale applied) and tessellating arcs / circles
// / polyline bulges into polylines.
//
// Why this exists:
//   `dxf-parser` 1.1.2 hands us only the top-level entity list. Real CAD
//   files put the vast majority of geometry inside BLOCK definitions and
//   reference them via thousands of INSERTs — on the sample WSP masterplan
//   the visible drawing is 90,000+ entities nested inside 2,300+ blocks
//   pulled in by ~37,000 INSERT calls. Walking only `dxf.entities` shows
//   roughly a tenth of the drawing.
//
//   Also: in `dxf-parser` 1.1.2 a LINE's endpoints live in `.vertices`, NOT
//   in `.startPoint`/`.endPoint`. Code that checks the latter (as our earlier
//   layer-aware extractor did) silently drops every LINE.
//
// Output is two flat arrays — one of stroked polylines, one of filled
// quad/tri SOLIDs — each carrying the source layer and original entity
// handle. Downstream code categorises by layer name.

import type { Dxf, DxfEntity, DxfPoint } from "dxf-parser";

export interface FlatStroke {
  id: string;
  layer: string;
  closed: boolean;
  points: number[]; // flat [x0, y0, x1, y1, ...]
}

export interface FlatSolid {
  id: string;
  layer: string;
  points: number[]; // flat [x0, y0, x1, y1, x2, y2, (x3, y3)?]
}

/** A lane-direction marker (block-insert arrow) captured at world coords. */
export interface FlatMarker {
  layer: string;
  x: number;
  y: number;
  /** Unit world-direction the marker's local +X axis points (travel heading). */
  dx: number;
  dy: number;
}

export interface FlattenResult {
  strokes: FlatStroke[];
  solids: FlatSolid[];
  /** Block-insert markers on layers matched by `markerLayer` (lane arrows). */
  markers: FlatMarker[];
  /** Source entity types we encountered (for diagnostics). */
  typeCounts: Record<string, number>;
  /** How many INSERTs we expanded in total (top-level + nested). */
  insertsExpanded: number;
  /** Recursion guard hits (extreme depth or missing block). */
  expansionSkipped: number;
}

/** Default: WSP lane-arrow layers (ROAD_LANE0 / ROAD_LANE1). */
const DEFAULT_MARKER_LAYER = (layer: string): boolean =>
  /ROAD_LANE[01]/i.test(layer) || /(?:^|[_\-\s])LANE[_\-\s]?(?:ARROW|DIR|0|1)(?:[_\-\s]|$)/i.test(layer);

type Transform = (p: DxfPoint) => { x: number; y: number };

const IDENT: Transform = (p) => ({ x: p.x, y: p.y });

/**
 * Compose a block-insertion transform over an optional parent transform.
 * Order: translate-to-origin (subtract block base point) → scale → rotate →
 * translate-to-insertion-point → then parent transform. Z is dropped since
 * the rest of the pipeline is 2D.
 */
function makeInsertTransform(
  ins: DxfEntity & { name?: string; position: DxfPoint; xScale?: number; yScale?: number; rotation?: number },
  basePoint: DxfPoint,
  parent: Transform
): Transform {
  const sx = ins.xScale ?? 1;
  const sy = ins.yScale ?? 1;
  const rot = ((ins.rotation ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const tx = ins.position.x;
  const ty = ins.position.y;
  const bx = basePoint.x;
  const by = basePoint.y;
  return (p) => {
    const lx = (p.x - bx) * sx;
    const ly = (p.y - by) * sy;
    return parent({
      x: lx * cosR - ly * sinR + tx,
      y: lx * sinR + ly * cosR + ty,
    });
  };
}

/** Tessellate a polyline-segment bulge (arc shorthand) into intermediate points. */
function bulgePoints(
  a: DxfPoint,
  b: DxfPoint,
  bulge: number | undefined,
  T: Transform,
  out: number[]
): void {
  // Always end with the transformed b. When there's no bulge, that's all.
  if (!bulge || !Number.isFinite(bulge)) {
    const tb = T(b);
    out.push(tb.x, tb.y);
    return;
  }
  const theta = 4 * Math.atan(bulge);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) {
    const tb = T(b);
    out.push(tb.x, tb.y);
    return;
  }
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const h = r * Math.cos(theta / 2) * (bulge < 0 ? 1 : -1);
  const nx = -dy / chord;
  const ny = dx / chord;
  const cxc = mx + nx * h;
  const cyc = my + ny * h;
  const startAng = Math.atan2(a.y - cyc, a.x - cxc);
  // One sample per ~7.5° keeps small radii smooth without blowing point counts.
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 24)));
  for (let i = 1; i <= steps; i++) {
    const ang = startAng + (theta * i) / steps;
    const tp = T({ x: cxc + r * Math.cos(ang), y: cyc + r * Math.sin(ang), z: 0 });
    out.push(tp.x, tp.y);
  }
}

function tessellateArc(
  center: DxfPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  T: Transform
): number[] {
  let a0 = startAngle;
  let a1 = endAngle;
  if (a1 < a0) a1 += Math.PI * 2;
  const steps = Math.max(6, Math.ceil((a1 - a0) / (Math.PI / 24)));
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const p = T({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a), z: 0 });
    pts.push(p.x, p.y);
  }
  return pts;
}

const MAX_INSERT_DEPTH = 8;

interface EmitContext {
  blocks: Record<string, { entities?: DxfEntity[]; position?: DxfPoint }>;
  strokes: FlatStroke[];
  solids: FlatSolid[];
  markers: FlatMarker[];
  markerLayer: (layer: string) => boolean;
  typeCounts: Record<string, number>;
  insertsExpanded: { n: number };
  expansionSkipped: { n: number };
  idGen: { n: number };
}

function nextId(ctx: EmitContext, entity: DxfEntity): string {
  return entity.handle ?? `e${ctx.idGen.n++}`;
}

function emitEntity(
  ctx: EmitContext,
  entity: DxfEntity,
  T: Transform,
  inheritedLayer: string | undefined,
  depth: number
): void {
  ctx.typeCounts[entity.type] = (ctx.typeCounts[entity.type] ?? 0) + 1;

  // A block-internal entity on layer "0" inherits the INSERT's layer; otherwise
  // the entity's own layer wins. This matches AutoCAD behaviour.
  const ownLayer = entity.layer && entity.layer !== "0" ? entity.layer : undefined;
  const layer = ownLayer ?? inheritedLayer ?? entity.layer ?? "0";

  if (entity.type === "INSERT") {
    const ins = entity as DxfEntity & { name?: string; position?: DxfPoint };
    if (!ins.name || !ins.position) return;
    if (depth >= MAX_INSERT_DEPTH) {
      ctx.expansionSkipped.n++;
      return;
    }
    const blk = ctx.blocks[ins.name];
    if (!blk || !Array.isArray(blk.entities)) {
      ctx.expansionSkipped.n++;
      return;
    }
    const basePoint = blk.position ?? { x: 0, y: 0, z: 0 };
    const childT = makeInsertTransform(
      ins as DxfEntity & { position: DxfPoint },
      basePoint,
      T
    );
    // Lane-direction arrow? Record its world position + heading. `childT` maps
    // block-definition coords to world, so the block origin and its local +X
    // axis give the world insertion point and travel heading (including all
    // parent + this insert's rotation/scale).
    if (ctx.markerLayer(layer)) {
      const o = childT(basePoint);
      const ax = childT({ x: basePoint.x + 1, y: basePoint.y, z: 0 });
      let dx = ax.x - o.x;
      let dy = ax.y - o.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      ctx.markers.push({ layer, x: o.x, y: o.y, dx, dy });
    }
    ctx.insertsExpanded.n++;
    for (const child of blk.entities) {
      emitEntity(ctx, child, childT, layer, depth + 1);
    }
    return;
  }

  if (entity.type === "LINE") {
    // dxf-parser 1.1.2 stores LINE endpoints in .vertices (NOT startPoint/endPoint).
    const verts = entity.vertices as DxfPoint[] | undefined;
    let a: DxfPoint | undefined;
    let b: DxfPoint | undefined;
    if (Array.isArray(verts) && verts.length >= 2) {
      a = verts[0];
      b = verts[1];
    } else {
      const start = (entity as unknown as { startPoint?: DxfPoint }).startPoint;
      const end = (entity as unknown as { endPoint?: DxfPoint }).endPoint;
      if (start && end) {
        a = start;
        b = end;
      }
    }
    if (!a || !b) return;
    const ta = T(a);
    const tb = T(b);
    ctx.strokes.push({
      id: nextId(ctx, entity),
      layer,
      closed: false,
      points: [ta.x, ta.y, tb.x, tb.y],
    });
    return;
  }

  if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
    const verts = entity.vertices as Array<DxfPoint & { bulge?: number }> | undefined;
    if (!Array.isArray(verts) || verts.length < 2) return;
    const t0 = T(verts[0]);
    const out: number[] = [t0.x, t0.y];
    for (let i = 0; i < verts.length - 1; i++) {
      bulgePoints(verts[i], verts[i + 1], verts[i].bulge, T, out);
    }
    const closed = Boolean(
      (entity as { shape?: boolean }).shape || (entity as { closed?: boolean }).closed
    );
    if (closed) {
      bulgePoints(verts[verts.length - 1], verts[0], verts[verts.length - 1].bulge, T, out);
    }
    ctx.strokes.push({ id: nextId(ctx, entity), layer, closed, points: out });
    return;
  }

  if (entity.type === "ARC") {
    const e = entity as DxfEntity & { center?: DxfPoint; radius?: number; startAngle?: number; endAngle?: number };
    if (!e.center || !Number.isFinite(e.radius)) return;
    const pts = tessellateArc(
      e.center,
      e.radius as number,
      e.startAngle ?? 0,
      e.endAngle ?? Math.PI * 2,
      T
    );
    if (pts.length >= 4) {
      ctx.strokes.push({ id: nextId(ctx, entity), layer, closed: false, points: pts });
    }
    return;
  }

  if (entity.type === "CIRCLE") {
    const e = entity as DxfEntity & { center?: DxfPoint; radius?: number };
    if (!e.center || !Number.isFinite(e.radius)) return;
    const pts = tessellateArc(e.center, e.radius as number, 0, Math.PI * 2, T);
    if (pts.length >= 4) {
      ctx.strokes.push({ id: nextId(ctx, entity), layer, closed: true, points: pts });
    }
    return;
  }

  if (entity.type === "SOLID" || entity.type === "3DFACE") {
    const e = entity as DxfEntity & { points?: DxfPoint[] };
    if (!Array.isArray(e.points) || e.points.length < 3) return;
    // DXF SOLID vertex order is 1,2,4,3 — re-order to a proper quad (1,2,4,3 → 0,1,3,2).
    const src = e.points;
    const ordered = src.length >= 4 ? [src[0], src[1], src[3], src[2]] : src;
    const flat: number[] = [];
    for (const p of ordered) {
      const tp = T(p);
      flat.push(tp.x, tp.y);
    }
    ctx.solids.push({ id: nextId(ctx, entity), layer, points: flat });
    return;
  }
}

/**
 * Walk every entity in a parsed DXF, expanding INSERTs and tessellating
 * arcs/circles/bulges, and return the flattened world-space primitives.
 */
export function flattenDxf(
  dxf: Dxf,
  opts: { markerLayer?: (layer: string) => boolean } = {}
): FlattenResult {
  // `dxf-parser`'s `Dxf.blocks` is typed as `Record<string, unknown>`; in
  // practice each block is `{ entities?: DxfEntity[]; position?: DxfPoint }`.
  const blocks = (dxf.blocks ?? {}) as Record<
    string,
    { entities?: DxfEntity[]; position?: DxfPoint }
  >;
  const ctx: EmitContext = {
    blocks,
    strokes: [],
    solids: [],
    markers: [],
    markerLayer: opts.markerLayer ?? DEFAULT_MARKER_LAYER,
    typeCounts: {},
    insertsExpanded: { n: 0 },
    expansionSkipped: { n: 0 },
    idGen: { n: 0 },
  };
  for (const e of dxf.entities) emitEntity(ctx, e, IDENT, undefined, 0);
  return {
    strokes: ctx.strokes,
    solids: ctx.solids,
    markers: ctx.markers,
    typeCounts: ctx.typeCounts,
    insertsExpanded: ctx.insertsExpanded.n,
    expansionSkipped: ctx.expansionSkipped.n,
  };
}
