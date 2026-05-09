import type {
  ParsedDrawing,
  RoadCategory,
  DrawingSegment,
} from "@/lib/road-detect";

export interface NetworkNode {
  id: string;
  x: number;
  y: number;
  /** Connected link ids. */
  links: string[];
  /** True if this node is a junction (degree >= 3 OR an external boundary endpoint). */
  isJunction: boolean;
}

export interface NetworkLink {
  id: string;
  fromNode: string;
  toNode: string;
  /** Polyline points (flat) [x0, y0, x1, y1, ...] in PDF user units, y-up. */
  points: number[];
  length: number;
  /** Bearing in degrees, 0 = north, 90 = east, measured from fromNode to toNode. */
  bearing: number;
}

export interface BuildingFootprint {
  id: string;
  points: number[];
  area: number;
}

export interface RoadNetwork {
  nodes: NetworkNode[];
  links: NetworkLink[];
  junctions: NetworkNode[];
  buildings: BuildingFootprint[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface BuildNetworkOptions {
  /** Endpoint snap tolerance as a fraction of the bounds diagonal. */
  snapTolerance?: number;
  /** Categories to treat as road centerlines. */
  roadCategories?: RoadCategory[];
  /** Categories to treat as building footprints. */
  buildingCategories?: RoadCategory[];
}

const DEFAULT_ROAD: RoadCategory[] = ["centerline"];
const DEFAULT_BUILDING: RoadCategory[] = ["building"];

function polygonArea(points: number[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(a) / 2;
}

/**
 * Convert the parsed drawing into a node–link road graph plus building
 * footprints. Endpoints within `snapTolerance · diag` of each other are
 * collapsed into a shared node, so a junction where 3+ centerline
 * polylines meet shows up as a single node with degree 3+.
 */
export function buildRoadNetwork(
  drawing: ParsedDrawing,
  groupCategoryOverrides: Record<string, RoadCategory>,
  opts: BuildNetworkOptions = {}
): RoadNetwork {
  const roadSet = new Set(opts.roadCategories ?? DEFAULT_ROAD);
  const buildingSet = new Set(opts.buildingCategories ?? DEFAULT_BUILDING);
  const segCat = (s: DrawingSegment): RoadCategory =>
    groupCategoryOverrides[s.groupId] ?? s.category;

  const roadSegs: DrawingSegment[] = [];
  const buildingSegs: DrawingSegment[] = [];
  for (const s of drawing.segments) {
    const cat = segCat(s);
    if (roadSet.has(cat)) roadSegs.push(s);
    else if (buildingSet.has(cat) && s.closed) buildingSegs.push(s);
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (s: DrawingSegment) => {
    for (let i = 0; i < s.points.length; i += 2) {
      const x = s.points[i];
      const y = s.points[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };
  roadSegs.forEach(visit);
  buildingSegs.forEach(visit);
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const tolerance = diag * (opts.snapTolerance ?? 0.005);
  const cell = Math.max(tolerance, 1e-6);

  // Spatial hash on a grid with cell = tolerance. We search the 3x3 cell
  // neighbourhood for a near match before creating a new node.
  const grid = new Map<string, { id: string; x: number; y: number }[]>();
  const nodes: Map<string, NetworkNode> = new Map();

  const cellKey = (x: number, y: number) =>
    `${Math.round(x / cell)}_${Math.round(y / cell)}`;

  function findOrCreate(x: number, y: number): string {
    const cx = Math.round(x / cell);
    const cy = Math.round(y / cell);
    let best: { id: string; d: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}_${cy + dy}`);
        if (!bucket) continue;
        for (const n of bucket) {
          const d = Math.hypot(n.x - x, n.y - y);
          if (d < tolerance && (!best || d < best.d)) best = { id: n.id, d };
        }
      }
    }
    if (best) return best.id;
    const id = `n${nodes.size}`;
    nodes.set(id, { id, x, y, links: [], isJunction: false });
    const k = cellKey(x, y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push({ id, x, y });
    return id;
  }

  const links: NetworkLink[] = [];
  for (const seg of roadSegs) {
    if (seg.points.length < 4) continue;
    const x0 = seg.points[0];
    const y0 = seg.points[1];
    const xn = seg.points[seg.points.length - 2];
    const yn = seg.points[seg.points.length - 1];
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
    const fromId = findOrCreate(x0, y0);
    const toId = findOrCreate(xn, yn);
    if (fromId === toId) continue;

    const dx = xn - x0;
    const dy = yn - y0;
    // Bearing in compass degrees: 0 north (positive y), 90 east (positive x).
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

    const id = `l${links.length}`;
    links.push({
      id,
      fromNode: fromId,
      toNode: toId,
      points: seg.points,
      length: seg.length,
      bearing,
    });
  }

  for (const link of links) {
    nodes.get(link.fromNode)?.links.push(link.id);
    nodes.get(link.toNode)?.links.push(link.id);
  }
  for (const node of nodes.values()) {
    node.isJunction = node.links.length >= 3;
  }

  const buildings: BuildingFootprint[] = buildingSegs.map((s, i) => ({
    id: `b${i}`,
    points: s.points,
    area: polygonArea(s.points),
  }));

  const nodeArr = Array.from(nodes.values());
  return {
    nodes: nodeArr,
    links,
    junctions: nodeArr.filter((n) => n.isJunction),
    buildings,
    bounds: { minX, minY, maxX, maxY },
  };
}

/**
 * Pick the four cardinal approaches (NB / EB / SB / WB) for a junction by
 * grouping its incident links by bearing into the nearest cardinal bin.
 * Each link is mapped to the cardinal direction *from which* traffic arrives
 * at the junction (so a link departing the junction at bearing 0° / north
 * carries northbound (NB) outflow and southbound (SB) inflow).
 */
export type Cardinal = "NB" | "EB" | "SB" | "WB";

export interface JunctionApproachLink {
  cardinal: Cardinal;
  linkId: string;
  /** Bearing of the link as it leaves this node, 0..360. */
  outBearing: number;
}

export function classifyJunctionApproaches(
  junction: NetworkNode,
  network: RoadNetwork
): JunctionApproachLink[] {
  const result: JunctionApproachLink[] = [];
  for (const linkId of junction.links) {
    const link = network.links.find((l) => l.id === linkId);
    if (!link) continue;
    let outBearing = link.bearing;
    if (link.toNode === junction.id) outBearing = (outBearing + 180) % 360;
    // Cardinal closest to outBearing.
    const cardinal: Cardinal =
      outBearing >= 315 || outBearing < 45
        ? "NB"
        : outBearing < 135
        ? "EB"
        : outBearing < 225
        ? "SB"
        : "WB";
    result.push({ cardinal, linkId, outBearing });
  }
  return result;
}
