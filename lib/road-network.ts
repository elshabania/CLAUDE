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

export type BuildingType =
  | "residential"
  | "commercial"
  | "retail"
  | "office"
  | "school"
  | "mosque"
  | "hospital"
  | "civic"
  | "industrial"
  | "parking"
  | "amenity"
  | "other";

export interface BuildingFootprint {
  id: string;
  points: number[];
  area: number;
  /** Concatenated text labels found inside the polygon, if any. */
  label?: string;
  /** Best-guess building category derived from `label`. */
  buildingType?: BuildingType;
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
  /** Disable degree-2 collinear chain merging (default: enabled). */
  skipStitching?: boolean;
  /** Bearing tolerance for collinear merge, in degrees. */
  stitchAngleToleranceDeg?: number;
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
  // Default 1.5% snap so the gap between dashed centerline segments closes
  // before graph construction. Drop it back via opts if a finer drawing
  // collapses real intersections.
  const tolerance = diag * (opts.snapTolerance ?? 0.015);
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

  // Stitch dashed centerlines: where exactly two links meet end-to-end at
  // the same node and their bearings are collinear (within tolerance), merge
  // them into one link and drop the in-between node. Iterate until stable.
  const linkMap = new Map(links.map((l) => [l.id, l]));
  if (!opts.skipStitching) {
    const angleTol = opts.stitchAngleToleranceDeg ?? 12;
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes.values()) {
        if (node.links.length !== 2) continue;
        const linkA = linkMap.get(node.links[0]);
        const linkB = linkMap.get(node.links[1]);
        if (!linkA || !linkB) continue;
        if (linkA === linkB) continue; // self-loop guard

        const inBearing = bearingApproachingNode(linkA, node.id);
        const outBearing = bearingLeavingNode(linkB, node.id);
        const turn = Math.abs(((outBearing - inBearing + 540) % 360) - 180);
        if (turn > angleTol) continue;

        const merged = mergeAtNode(linkA, linkB, node.id);
        if (!merged) continue;

        linkMap.delete(linkA.id);
        linkMap.delete(linkB.id);
        linkMap.set(merged.id, merged);

        const farA = linkA.fromNode === node.id ? linkA.toNode : linkA.fromNode;
        const farB = linkB.fromNode === node.id ? linkB.toNode : linkB.fromNode;

        const farANode = nodes.get(farA);
        if (farANode) {
          farANode.links = farANode.links
            .filter((id) => id !== linkA.id && id !== linkB.id)
            .concat(merged.id);
        }
        if (farA !== farB) {
          const farBNode = nodes.get(farB);
          if (farBNode) {
            farBNode.links = farBNode.links
              .filter((id) => id !== linkA.id && id !== linkB.id)
              .concat(merged.id);
          }
        }

        nodes.delete(node.id);
        changed = true;
        break; // restart with mutated maps
      }
    }
  }

  // Drop nodes that ended up with no links after stitching.
  for (const [id, node] of nodes) {
    if (node.links.length === 0) nodes.delete(id);
  }

  for (const node of nodes.values()) {
    node.isJunction = node.links.length >= 3;
  }

  const rawBuildings: BuildingFootprint[] = buildingSegs.map((s, i) => ({
    id: `b${i}`,
    points: s.points,
    area: polygonArea(s.points),
  }));
  const buildings = assignLabels(rawBuildings, drawing.texts ?? []);

  const nodeArr = Array.from(nodes.values());
  return {
    nodes: nodeArr,
    links: Array.from(linkMap.values()),
    junctions: nodeArr.filter((n) => n.isJunction),
    buildings,
    bounds: { minX, minY, maxX, maxY },
  };
}

function bearingFromTo(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Bearing of the link's last segment, pointing towards the node (i.e. the
 *  direction traffic faces just before reaching the node). */
function bearingApproachingNode(link: NetworkLink, nodeId: string): number {
  const pts = link.points;
  if (link.toNode === nodeId) {
    const i = pts.length;
    return bearingFromTo(pts[i - 4], pts[i - 3], pts[i - 2], pts[i - 1]);
  }
  // node is fromNode, so reverse the first segment's direction.
  return bearingFromTo(pts[2], pts[3], pts[0], pts[1]);
}

/** Bearing of the link's first segment, pointing away from the node. */
function bearingLeavingNode(link: NetworkLink, nodeId: string): number {
  const pts = link.points;
  if (link.fromNode === nodeId) {
    return bearingFromTo(pts[0], pts[1], pts[2], pts[3]);
  }
  // node is toNode, so head outward from the last point back along the link.
  const i = pts.length;
  return bearingFromTo(pts[i - 2], pts[i - 1], pts[i - 4], pts[i - 3]);
}

let mergedLinkCounter = 0;

/**
 * Concatenate two links that meet end-to-end at `nodeId` into one. Direction
 * of the merged polyline goes from the far end of A to the far end of B.
 */
function mergeAtNode(
  a: NetworkLink,
  b: NetworkLink,
  nodeId: string
): NetworkLink | null {
  const aPts = a.toNode === nodeId ? a.points : reverseFlat(a.points);
  const bPts = b.fromNode === nodeId ? b.points : reverseFlat(b.points);
  // aPts ends at node, bPts starts at node. Skip the duplicated mid point.
  const merged = aPts.slice(0, aPts.length - 2).concat(bPts);
  if (merged.length < 4) return null;
  const fromNode = a.toNode === nodeId ? a.fromNode : a.toNode;
  const toNode = b.fromNode === nodeId ? b.toNode : b.fromNode;
  const length = a.length + b.length;
  const bearing = bearingFromTo(
    merged[0],
    merged[1],
    merged[merged.length - 2],
    merged[merged.length - 1]
  );
  return {
    id: `m${mergedLinkCounter++}`,
    fromNode,
    toNode,
    points: merged,
    length,
    bearing,
  };
}

function reverseFlat(points: number[]): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = points[points.length - 2 - i];
    out[i + 1] = points[points.length - 1 - i];
  }
  return out;
}

/** Even-odd point-in-polygon test on a flat point array. */
function pointInPolygon(x: number, y: number, points: number[]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = points[i],
      yi = points[i + 1];
    const xj = points[j],
      yj = points[j + 1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const BUILDING_TYPE_PATTERNS: { type: BuildingType; patterns: RegExp[] }[] = [
  {
    type: "residential",
    patterns: [
      /residen/i,
      /\bapart/i,
      /\bvilla/i,
      /housing/i,
      /\bdwell/i,
      /town\s*hous/i,
      /\bcondo/i,
      /\bflat/i,
      /\bserviced\s*apt\b/i,
    ],
  },
  {
    type: "retail",
    patterns: [/retail/i, /\bshop/i, /store/i, /\bmall\b/i, /super.?market/i, /boutique/i],
  },
  {
    type: "commercial",
    patterns: [/commerc/i, /\bmixed[-\s]?use\b/i, /tower\b/i],
  },
  {
    type: "office",
    patterns: [/office/i, /admin/i, /headquarters/i, /\bhq\b/i, /business\s*centre/i],
  },
  {
    type: "school",
    patterns: [/school/i, /\bnursery/i, /\bkinder/i, /\bcollege/i, /\bunivers/i, /educat/i, /academy/i],
  },
  {
    type: "mosque",
    patterns: [/mosque/i, /masjid/i, /\bprayer\s*(hall|room)/i, /jami[a-z]*/i, /jamee/i],
  },
  {
    type: "hospital",
    patterns: [/hospital/i, /\bclinic\b/i, /\bmedical\b/i, /health.?cent/i, /\bpharma/i],
  },
  {
    type: "civic",
    patterns: [
      /civic/i,
      /community/i,
      /municip/i,
      /\bgov(?:ernment)?\b/i,
      /police/i,
      /fire\s*stat/i,
      /library/i,
      /museum/i,
      /gallery/i,
      /cultural/i,
      /heritage/i,
    ],
  },
  {
    type: "industrial",
    patterns: [/industrial/i, /warehouse/i, /factory/i, /workshop/i, /utility/i, /substation/i],
  },
  {
    type: "parking",
    patterns: [/park(?:ing)?\s*(?:lot|garage|building|structure)?/i, /\bcar.?park\b/i, /\bgarage\b/i],
  },
  {
    type: "amenity",
    patterns: [
      /amenity|amenities/i,
      /\bclub\b/i,
      /\bgym\b/i,
      /\bspa\b/i,
      /restaurant|cafe|café|brasserie|bistro/i,
      /\bhotel\b/i,
      /\blounge\b/i,
      /grandstand/i,
      /stadium/i,
      /arena/i,
      /pavilion/i,
      /equine|equestrian|stable|paddock/i,
      /\bpool\b/i,
      /\bcouture\b/i,
      /\blifestyle\b/i,
    ],
  },
];

function classifyBuildingLabel(label: string): BuildingType {
  // Per-glyph PDFs render the label with whitespace between letters; match
  // against both the original and a de-spaced version.
  const compact = label.replace(/\s+/g, "");
  for (const { type, patterns } of BUILDING_TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(label) || p.test(compact))) return type;
  }
  return "other";
}

/**
 * For each text item, find the smallest building polygon whose interior
 * contains the text's centre point. Concatenated lines become the label;
 * the label is run through a regex classifier to pick a building type.
 */
function assignLabels(
  buildings: BuildingFootprint[],
  texts: {
    text: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    fontSize?: number;
  }[]
): BuildingFootprint[] {
  if (texts.length === 0) return buildings;

  // Pre-compute AABB and area for each building.
  const aabbs: {
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    area: number;
  }[] = [];
  const byId = new Map<string, BuildingFootprint>();
  for (const b of buildings) {
    byId.set(b.id, b);
    let mnx = Infinity,
      mny = Infinity,
      mxx = -Infinity,
      mxy = -Infinity;
    for (let i = 0; i < b.points.length; i += 2) {
      const x = b.points[i],
        y = b.points[i + 1];
      if (x < mnx) mnx = x;
      if (y < mny) mny = y;
      if (x > mxx) mxx = x;
      if (y > mxy) mxy = y;
    }
    aabbs.push({ id: b.id, minX: mnx, minY: mny, maxX: mxx, maxY: mxy, area: b.area });
  }
  // Smallest first - so when multiple polygons contain a label we pick the
  // tightest one (e.g. inner room vs outer block).
  aabbs.sort((a, b) => a.area - b.area);

  const labelMap = new Map<string, string[]>();

  for (const t of texts) {
    // pdfjs anchors text at the baseline-left. Use the centre of the text
    // bounding box so a label printed centred on a building registers
    // even when the polygon doesn't quite contain the anchor.
    const w = t.width ?? 0;
    const h = t.height ?? t.fontSize ?? 0;
    const cx = t.x + w / 2;
    const cy = t.y + h / 2;
    for (const a of aabbs) {
      if (cx < a.minX || cx > a.maxX || cy < a.minY || cy > a.maxY) continue;
      const b = byId.get(a.id);
      if (!b) continue;
      if (!pointInPolygon(cx, cy, b.points)) continue;
      const arr = labelMap.get(a.id) ?? [];
      arr.push(t.text);
      labelMap.set(a.id, arr);
      break;
    }
  }

  return buildings.map((b) => {
    const lines = labelMap.get(b.id);
    if (!lines || lines.length === 0) return b;
    const label = lines.join(" ").replace(/\s+/g, " ").trim();
    return {
      ...b,
      label,
      buildingType: classifyBuildingLabel(label),
    };
  });
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
