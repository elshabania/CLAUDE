import {
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
  type DrawingSegment,
} from "@/lib/road-detect";
import { extractRoadSkeleton } from "@/lib/road-skeleton";

export interface NetworkNode {
  id: string;
  x: number;
  y: number;
  /** Connected link ids. */
  links: string[];
  /** True if this node is a junction (degree >= 3 OR an external boundary endpoint). */
  isJunction: boolean;
  /** Polygon (closed flat point array) of the junction's footprint when it
   *  was derived from a closed curb region (e.g. roundabout). */
  region?: number[];
  /** Junction kind (only set when isJunction === true). 'roundabout' is
   *  inferred from a roughly circular closed curb polygon; otherwise
   *  'signal' for any other junction region; 'priority' for plain
   *  intersection nodes that didn't get a region polygon. */
  kind?: "roundabout" | "signal" | "priority";
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
  /** Pavement width in source units, when available (derived from paired curbs). */
  width?: number;
  /** Closed polygon of the asphalt area for this link (between the two
   *  paired curbs that produced its centerline). Set when the link comes
   *  from the curb-pair derivation, omitted otherwise. */
  bodyPolygon?: number[];
  /** Number of travel lanes PER DIRECTION on this link. Computed from
   *  `width` against the network's median link width so a typical 2-lane
   *  road = 1 lane per dir, double-width = 2 per dir, etc. */
  lanesPerDir?: number;
  /** Link role. "road" (default) is a normal two-way road; "ring" is one
   *  arc of a roundabout, traversable only in the +1 (fromNode -> toNode)
   *  direction. The movement table excludes any handoff that would put a
   *  vehicle on a ring link going dir=-1. */
  kind?: "road" | "ring";
}

/**
 * One legal turn at a junction. Vehicles arriving at `junctionNodeId` on
 * `(fromLinkId, fromDirAtArrival)` may continue onto
 * `(toLinkId, toDirAtDeparture)` starting at arc length `toS` on that
 * link. Built once during network construction; the simulator looks it up
 * on every link-end handoff instead of picking a random adjacent link.
 */
export interface Movement {
  junctionNodeId: string;
  fromLinkId: string;
  /** +1 if the vehicle was travelling fromNode -> toNode on the inbound
   *  link, -1 otherwise. Tells the simulator which arrival direction this
   *  movement applies to. */
  fromDirAtArrival: 1 | -1;
  toLinkId: string;
  /** +1 if the vehicle should depart fromNode -> toNode on the outbound
   *  link, -1 otherwise. */
  toDirAtDeparture: 1 | -1;
  /** Arc-length s on the outbound link at which the vehicle starts. */
  toS: number;
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
  /** Best-guess building category derived from `label` or its OCG layer. */
  buildingType?: BuildingType;
  /** Number of source plot polygons rolled into this footprint (>=1). */
  plotCount?: number;
}

export interface RoadNetwork {
  nodes: NetworkNode[];
  links: NetworkLink[];
  junctions: NetworkNode[];
  buildings: BuildingFootprint[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Explicit per-junction successor table. The simulator picks one of
   *  these on every link-end handoff instead of guessing from adjacency. */
  movements: Movement[];
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
  /**
   * Derive centerlines from paired curb segments instead of using
   * pre-classified centerlines. Default: true when the drawing has more
   * curb (`edge`) segments than centerline ones.
   */
  deriveCenterlines?: boolean;
  /** Maximum road width as fraction of bounds diagonal (for derivation). */
  maxRoadWidthFraction?: number;
}

const DEFAULT_ROAD: RoadCategory[] = Array.from(ROAD_CATEGORIES);
const DEFAULT_BUILDING: RoadCategory[] = ["building"];

function polygonArea(points: number[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(a) / 2;
}

function polygonPerimeter(points: number[]): number {
  let p = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    p += Math.hypot(points[j] - points[i], points[j + 1] - points[i + 1]);
  }
  return p;
}

/** Mean vertex of a flat point array, or null when empty/degenerate. */
function flatCentroid(points: number[]): { x: number; y: number } | null {
  if (points.length < 2) return null;
  let sx = 0,
    sy = 0,
    n = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sx += x;
    sy += y;
    n += 1;
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

/**
 * Circularity of a closed flat point array on 0..1, where 1 is a perfect
 * circle. Uses the isoperimetric ratio 4πA / P², which is scale-invariant and
 * peaks at 1 for a circle, falling off for elongated or jagged outlines. A
 * roundabout's central-island / ring polygon should score high (~0.7+); a
 * rectangular plaza or a squashed loop scores low. Returns 0 when the polygon
 * is too small or degenerate to judge.
 */
function circularity(points: number[]): number {
  const perim = polygonPerimeter(points);
  if (!Number.isFinite(perim) || perim <= 1e-9) return 0;
  const area = polygonArea(points);
  if (!Number.isFinite(area) || area <= 0) return 0;
  const ratio = (4 * Math.PI * area) / (perim * perim);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

/** Max radial distance of any vertex from the centroid of a flat polyline. */
function maxRadiusFromCentroid(points: number[]): number {
  const c = flatCentroid(points);
  if (!c) return 0;
  let r = 0;
  for (let i = 0; i < points.length; i += 2) {
    const d = Math.hypot(points[i] - c.x, points[i + 1] - c.y);
    if (d > r) r = d;
  }
  return r;
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

  const preClassifiedRoads: DrawingSegment[] = [];
  const curbSegs: DrawingSegment[] = [];
  const buildingSegs: DrawingSegment[] = [];
  // For master-plan PDFs the road categories ARE the filled asphalt
  // polygons; their closed boundary IS the kerb for the skeleton
  // extractor. We feed every road-class polygon's outline into curbSegs
  // so the medial axis can be traced per corridor.
  for (const s of drawing.segments) {
    const cat = segCat(s);
    if (roadSet.has(cat)) {
      preClassifiedRoads.push(s);
      if (s.closed) curbSegs.push(s);
    }
    if (buildingSet.has(cat) && s.closed) buildingSegs.push(s);
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
  preClassifiedRoads.forEach(visit);
  curbSegs.forEach(visit);
  buildingSegs.forEach(visit);
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;

  // Decide whether to derive centerlines from paired curbs or use the
  // pre-classified centerline segments. Auto-mode picks derivation when the
  // PDF has substantially more curbs than centerlines.
  // Derive a clean routable centerline graph from the road FOOTPRINT whenever
  // we have closed road polygons. (The old heuristic - more curbs than
  // centerlines - never fired for masterplans where roads ARE filled polygons,
  // so the builder fell back to treating every polygon as a link: tens of
  // thousands of fragments, not a routable network.)
  const shouldDerive = opts.deriveCenterlines ?? curbSegs.length >= 20;

  type RoadSeg = {
    points: number[];
    length: number;
    width?: number;
    bodyPolygon?: number[];
  };
  let roadSegs: RoadSeg[];
  if (shouldDerive && curbSegs.length > 0) {
    // Topology comes from one source: the medial axis of the asphalt
    // enclosed by the kerbs. Rasterise -> flood-fill -> distance-transform
    // -> Zhang-Suen thinning -> skeleton trace. Roundabouts fall out as
    // self-loop links automatically because the medial axis circles a
    // central island once and closes on itself.
    let derived: {
      points: number[];
      length: number;
      width: number;
      bodyPolygon: number[];
    }[] = [];
    // Fill mode: skeletonise the morphologically-closed road FOOTPRINT, so the
    // graph covers every corridor (full coverage) with clean topology. Runs on
    // the main thread (HTMLCanvas) and in the Web Worker (OffscreenCanvas).
    derived = extractRoadSkeleton(curbSegs, { minX, minY, maxX, maxY }, {
      fillMode: true,
    });
    roadSegs = derived.map((d) => ({
      points: d.points,
      length: d.length,
      width: d.width,
      bodyPolygon: d.bodyPolygon,
    }));
  } else {
    roadSegs = preClassifiedRoads.map((s) => ({
      points: s.points,
      length: s.length,
    }));
  }

  // Default 2.5% snap so derived centerline endpoints meeting at the same
  // junction collapse into one node, even when the centerlines stop a short
  // distance before the junction (which is typical when curb pairing breaks
  // down inside the junction region).
  const tolerance = diag * (opts.snapTolerance ?? 0.025);
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
    // Note: closed-loop links (fromId === toId) are KEPT — those are
    // roundabout rings produced by the skeleton extractor circling a
    // central island.

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
      width: seg.width,
      bodyPolygon: seg.bodyPolygon,
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
    // Worklist stitch: process each degree-2 node once. A merge deletes the
    // in-between node and rewires the two far nodes; only those far nodes can
    // become newly mergeable (e.g. along a dashed chain), so we re-enqueue
    // them. This reaches the same fixed point as a naive restart-on-each-merge
    // loop but in ~O(nodes + merges) instead of O(nodes x merges). A hard cap
    // guarantees termination on any pathological input.
    const queue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (id: string) => {
      const n = nodes.get(id);
      if (n && n.links.length === 2 && !queued.has(id)) {
        queued.add(id);
        queue.push(id);
      }
    };
    for (const node of nodes.values()) enqueue(node.id);

    let guard = 0;
    const maxOps = links.length * 4 + nodes.size * 4 + 16;
    while (queue.length > 0) {
      if (++guard > maxOps) break; // safety: never spin forever
      const nodeId = queue.pop()!;
      queued.delete(nodeId);
      const node = nodes.get(nodeId);
      if (!node || node.links.length !== 2) continue;

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
      // Far nodes may now be collinear degree-2 joints; revisit them.
      enqueue(farA);
      if (farA !== farB) enqueue(farB);
    }
  }

  // Drop nodes that ended up with no links after stitching.
  for (const [id, node] of nodes) {
    if (node.links.length === 0) nodes.delete(id);
  }

  // Iteratively prune tiny dangling fragments (degree-1 nodes whose link is
  // shorter than 0.4% of bounds diagonal). These are typically curb-pairing
  // artefacts at the entrance to a junction and add visual noise. Iterate
  // because removing a fragment can leave the next link as degree-1 too.
  const minFragmentLen = diag * 0.004;
  let prunedAny = true;
  let safety = 5;
  while (prunedAny && safety-- > 0) {
    prunedAny = false;
    for (const node of Array.from(nodes.values())) {
      if (node.links.length !== 1) continue;
      if (node.region) continue; // never prune junction-region nodes
      const linkId = node.links[0];
      const link = linkMap.get(linkId);
      if (!link) {
        nodes.delete(node.id);
        continue;
      }
      if (link.length >= minFragmentLen) continue;
      // Detach link from both ends, drop both link and the dangling node.
      const otherId = link.fromNode === node.id ? link.toNode : link.fromNode;
      const other = nodes.get(otherId);
      if (other) {
        other.links = other.links.filter((id) => id !== linkId);
      }
      linkMap.delete(linkId);
      nodes.delete(node.id);
      if (other && other.links.length === 0 && !other.region) {
        nodes.delete(other.id);
      }
      prunedAny = true;
    }
  }

  // Coalesce near-coincident nodes that the per-endpoint snap missed. The
  // original snap runs per endpoint, so a single real junction whose incoming
  // centerlines stop at slightly different points can yield two distinct nodes
  // a hair apart — splitting a true 4-way into two adjacent 3-ways (or a 3-way
  // into a pair of degree-2 stubs). We make a second, bounded pass that merges
  // any two surviving nodes closer than a small fraction of the snap tolerance.
  // We DON'T reuse the full snap tolerance here (that would over-merge genuine
  // closely-spaced junctions); we use a much tighter radius so only true
  // duplicates collapse. Bounded: one grid build + each unordered close pair
  // examined at most once, with a hard merge cap.
  const coalesceRadius = Math.min(tolerance * 0.5, diag * 0.01);
  if (coalesceRadius > 0 && nodes.size > 1) {
    const mcell = Math.max(coalesceRadius, 1e-6);
    const mkey = (x: number, y: number) =>
      `${Math.round(x / mcell)}_${Math.round(y / mcell)}`;
    // Union-find over node ids so a cluster of >2 duplicates collapses to one.
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      let r = id;
      while (parent.get(r) !== r) r = parent.get(r)!;
      // Path-compress (bounded by tree height; safe, no recursion).
      let cur = id;
      while (parent.get(cur) !== r) {
        const nxt = parent.get(cur)!;
        parent.set(cur, r);
        cur = nxt;
      }
      return r;
    };
    for (const id of nodes.keys()) parent.set(id, id);

    const mgrid = new Map<string, NetworkNode[]>();
    for (const n of nodes.values()) {
      const k = mkey(n.x, n.y);
      const arr = mgrid.get(k);
      if (arr) arr.push(n);
      else mgrid.set(k, [n]);
    }

    let mergeGuard = 0;
    const maxMerges = nodes.size + 16;
    outer: for (const n of nodes.values()) {
      const cx = Math.round(n.x / mcell);
      const cy = Math.round(n.y / mcell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = mgrid.get(`${cx + dx}_${cy + dy}`);
          if (!bucket) continue;
          for (const m of bucket) {
            if (m.id === n.id) continue;
            // Examine each unordered pair once (only when n sorts before m).
            if (n.id >= m.id) continue;
            const d = Math.hypot(m.x - n.x, m.y - n.y);
            if (!Number.isFinite(d) || d >= coalesceRadius) continue;
            if (find(n.id) === find(m.id)) continue;
            parent.set(find(m.id), find(n.id));
            if (++mergeGuard > maxMerges) break outer;
          }
        }
      }
    }

    if (mergeGuard > 0) {
      // Rewire links and merge link lists onto each cluster's representative.
      for (const link of linkMap.values()) {
        link.fromNode = find(link.fromNode);
        link.toNode = find(link.toNode);
      }
      for (const [id, node] of Array.from(nodes)) {
        const root = find(id);
        if (root === id) continue;
        const rep = nodes.get(root);
        if (rep) {
          rep.links.push(...node.links);
          if (!rep.region && node.region) rep.region = node.region;
        }
        nodes.delete(id);
      }
      // De-duplicate each representative's link list (a link whose two ends
      // collapsed into the same node would otherwise appear twice).
      for (const node of nodes.values()) {
        node.links = Array.from(new Set(node.links));
      }
    }
  }

  for (const node of nodes.values()) {
    if (node.region) continue;
    node.isJunction = node.links.length >= 3;
    if (node.isJunction && !node.kind) node.kind = "priority";
  }

  // Tag every closed-loop link (fromNode === toNode) as a roundabout ring,
  // and mark its endpoint node as kind: "roundabout". This follows directly
  // from the geometry of the medial axis of a roundabout's asphalt: the
  // skeleton walks once around the central island and closes back on itself,
  // producing a single self-loop link.
  for (const link of linkMap.values()) {
    if (
      link.fromNode === link.toNode &&
      Number.isFinite(link.length) &&
      link.length > diag * 0.005
    ) {
      link.kind = "ring";
      const node = nodes.get(link.fromNode);
      if (node) {
        node.kind = "roundabout";
        // The self-loop polyline IS the ring; expose it as the node region so
        // the 3D viewer can size the central island from it (matching the
        // existing region-driven roundabout rendering).
        if (!node.region) node.region = link.points.slice();
      }
    }
  }

  // Robust roundabout detection for the (common) case where the skeleton does
  // NOT close into one self-loop link. Curb-pairing usually breaks at the
  // entry/exit throats, so a roundabout often surfaces as a small *cycle* of
  // 2..4 arcs forming a near-circular ring rather than a single self-loop.
  // We find such cycles with a depth-bounded search, validate that the
  // assembled loop is closed, circular and small relative to the drawing, then
  // model it like the self-loop case: orient every arc consistently around the
  // ring, tag the arcs kind:"ring" (so the movement table enforces one-way
  // circulation, preventing illegal wrong-way travel round the island), and
  // mark ONE representative ring node kind:"roundabout" with the loop polygon
  // as its region. Marking a single node keeps the roundabout COUNT correct
  // (one ring == one roundabout) and matches the self-loop model. Everything
  // here is bounded: per-start DFS depth <= MAX_RING_LINKS, a global operation
  // cap, and each link is committed to at most one ring.
  if (linkMap.size > 1) {
    const MAX_RING_LINKS = 4; // a roundabout's medial axis rarely splits >4 ways
    const MIN_RING_LEN = diag * 0.005; // ignore micro-loops (digitiser noise)
    const MAX_RING_RADIUS = diag * 0.08; // a roundabout is a small local feature
    const MIN_CIRCULARITY = 0.6; // reject square blocks / squashed loops
    const ringLinkIds = new Set<string>();
    const otherEnd = (l: NetworkLink, nodeId: string): string =>
      l.fromNode === nodeId ? l.toNode : l.fromNode;

    // Adjacency: node id -> incident link ids (snapshot of the final node set
    // so it reflects all prior stitching/coalescing).
    const incident = new Map<string, string[]>();
    for (const n of nodes.values()) incident.set(n.id, n.links.slice());

    let ringGuard = 0;
    const maxRingOps = linkMap.size * 8 + 64;
    // Assemble the flat polygon of a closed chain of link ids by walking from
    // startNode, orienting each arc head-to-tail. Returns null if the chain
    // doesn't actually close or a link is missing.
    const loopPolygon = (chain: string[], startNode: string): number[] | null => {
      const poly: number[] = [];
      let cur = startNode;
      for (const lid of chain) {
        const l = linkMap.get(lid);
        if (!l) return null;
        if (l.fromNode !== cur && l.toNode !== cur) return null;
        const pts = l.fromNode === cur ? l.points : reverseFlat(l.points);
        // Skip the duplicated joint vertex shared with the previous arc.
        const startIdx = poly.length === 0 ? 0 : 2;
        for (let i = startIdx; i < pts.length; i++) poly.push(pts[i]);
        cur = otherEnd(l, cur);
      }
      return cur === startNode ? poly : null;
    };

    for (const startLink of Array.from(linkMap.values())) {
      if (ringGuard > maxRingOps) break;
      if (startLink.kind === "ring" || ringLinkIds.has(startLink.id)) continue;
      if (startLink.fromNode === startLink.toNode) continue; // self-loops handled above
      const startNode = startLink.fromNode;

      // Depth-bounded DFS for a cycle that returns to startNode using distinct,
      // not-yet-committed links. Iterative stack carries the chain per frame.
      type Frame = { node: string; chain: string[]; used: Set<string> };
      const stack: Frame[] = [
        {
          node: startLink.toNode,
          chain: [startLink.id],
          used: new Set([startLink.id]),
        },
      ];
      let foundChain: string[] | null = null;
      while (stack.length > 0 && ringGuard <= maxRingOps) {
        ringGuard++;
        const fr = stack.pop()!;
        if (fr.node === startNode && fr.chain.length >= 2) {
          foundChain = fr.chain;
          break;
        }
        if (fr.chain.length >= MAX_RING_LINKS) continue;
        for (const nlid of incident.get(fr.node) ?? []) {
          if (fr.used.has(nlid) || ringLinkIds.has(nlid)) continue;
          const nl = linkMap.get(nlid);
          if (!nl || nl.kind === "ring") continue;
          if (nl.fromNode === nl.toNode) continue;
          const nxt = otherEnd(nl, fr.node);
          const used = new Set(fr.used);
          used.add(nlid);
          stack.push({ node: nxt, chain: [...fr.chain, nlid], used });
        }
      }
      if (!foundChain) continue;

      const poly = loopPolygon(foundChain, startNode);
      if (!poly || poly.length < 6) continue;
      const radius = maxRadiusFromCentroid(poly);
      const totalLen = foundChain.reduce(
        (s, id) => s + (linkMap.get(id)?.length ?? 0),
        0
      );
      if (
        !Number.isFinite(radius) ||
        radius <= 0 ||
        radius > MAX_RING_RADIUS ||
        !Number.isFinite(totalLen) ||
        totalLen < MIN_RING_LEN ||
        circularity(poly) < MIN_CIRCULARITY
      ) {
        continue;
      }

      // Accept the ring. Orient each arc to follow the walk direction used to
      // build the (consistently-wound) polygon, so the +1-only ring movement
      // logic can carry a vehicle the whole way around.
      let cur = startNode;
      for (const lid of foundChain) {
        const l = linkMap.get(lid);
        if (!l) break;
        if (l.fromNode !== cur) {
          // Reverse so fromNode === cur (the +1 traversal == the walk dir).
          l.points = reverseFlat(l.points);
          const f = l.fromNode;
          l.fromNode = l.toNode;
          l.toNode = f;
          l.bearing = bearingFromTo(
            l.points[0],
            l.points[1],
            l.points[l.points.length - 2],
            l.points[l.points.length - 1]
          );
        }
        l.kind = "ring";
        ringLinkIds.add(lid);
        cur = l.toNode;
      }
      // Representative roundabout node: the ring node with the highest degree
      // (most likely an entry/exit junction) so it is already a junction and
      // shows up in network.junctions exactly once.
      let rep: NetworkNode | null = null;
      const ringNodeIds = new Set<string>();
      for (const lid of foundChain) {
        const l = linkMap.get(lid);
        if (l) {
          ringNodeIds.add(l.fromNode);
          ringNodeIds.add(l.toNode);
        }
      }
      for (const nid of ringNodeIds) {
        const n = nodes.get(nid);
        if (!n) continue;
        if (!rep || n.links.length > rep.links.length) rep = n;
      }
      if (rep) {
        rep.kind = "roundabout";
        rep.isJunction = true; // a roundabout is a junction even if degree 2
        if (!rep.region) rep.region = poly;
      }
    }
  }

  const rawBuildings: BuildingWithLayer[] = buildingSegs.map((s, i) => ({
    id: `b${i}`,
    points: s.points,
    area: polygonArea(s.points),
    layer: s.layer ?? undefined,
  }));
  const labelled = assignLabels(rawBuildings, drawing.texts ?? []);
  // Merge clusters of small same-type residential plots into one polygon
  // (typical CAD villa/townhouse layouts draw every plot individually; a
  // simulation network only needs the cluster as a single TAZ).
  const buildings = mergeBuildingClusters(labelled);

  const nodeArr = Array.from(nodes.values());
  const linkArr = Array.from(linkMap.values());

  // Tag each link with its lanesPerDir, derived from its width vs the
  // network's median link width. Master-plan PDFs carry no scale stamp, so
  // an absolute metre-based lane width (as highway-dims.ts uses once a scale
  // is set) can't be applied here in raw PDF units; instead we anchor to the
  // median carriageway, which we assume carries 1 lane per direction. This is
  // scale-free, so it works at any PDF scale.
  //
  // Only finite, strictly-positive widths feed the median: a degenerate
  // skeleton polygon can emit width 0 or NaN, which would otherwise corrupt
  // both the median and (via NaN propagating through Math.min/Math.max) the
  // per-link lane count.
  const widths: number[] = [];
  for (const l of linkArr) {
    if (l.width != null && Number.isFinite(l.width) && l.width > 0) {
      widths.push(l.width);
    }
  }
  let medianWidth = 0;
  if (widths.length > 0) {
    widths.sort((a, b) => a - b);
    medianWidth = widths[Math.floor(widths.length / 2)];
  }
  // Half the median = one lane per direction on the typical road.
  const laneUnit = medianWidth > 0 ? Math.max(1e-3, medianWidth / 2) : diag * 0.001;

  // Master-plan PDFs have no separate lane-marking layer, so lane counts come
  // from the link width alone: total lanes = round(width / laneUnit), then
  // split evenly across the two directions. We keep this (well-tuned) total-
  // then-halve scheme and its 1->2/dir boundary (a road must be ~1.75x the
  // median to read as two lanes per direction) so existing outputs don't
  // shift; the only behavioural change is robustness: a width that is null,
  // NaN, +/-Infinity or <= 0 now cleanly falls back to a single carriageway
  // (1 lane/dir) instead of letting NaN propagate through Math.min/Math.max
  // and corrupt lanesPerDir. Clamp per direction to 1..4, the same bound
  // highway-dims.ts applies, so a mis-measured polygon can't run away.
  for (const link of linkArr) {
    let totalLanes = 2;
    if (link.width != null && Number.isFinite(link.width) && link.width > 0) {
      totalLanes = Math.max(2, Math.min(8, Math.round(link.width / laneUnit)));
    }
    link.lanesPerDir = Math.max(1, Math.min(4, Math.floor(totalLanes / 2)));
  }

  // Signal-vs-priority typing. Pure topology can't prove a junction is
  // signalised, but in an urban master-plan the strong cue is geometry: a
  // crossing of two MAJOR carriageways with 4+ legs is overwhelmingly
  // signal-controlled, whereas 3-leg or minor-road junctions are normally
  // priority / two-way-stop (TWSC) controlled. We therefore upgrade only those
  // clear major 4-leg+ crossings to kind:"signal" and leave everything else as
  // the conservative "priority" default. This is gated on widths actually
  // existing (medianWidth > 0); with no width information we can't tell a major
  // road from a minor one, so we make no claim and keep "priority". Downstream
  // this only affects the roundabout/signal/priority summary counts and the
  // junction marker colour — it does NOT pick the HCM control type, which the
  // engineer sets per junction. Bounded: one pass over junctions.
  if (medianWidth > 0) {
    const linkById = new Map(linkArr.map((l) => [l.id, l]));
    // "Major" = clearly above the median carriageway, or already inferred to
    // carry 2+ lanes per direction.
    const majorWidth = medianWidth * 1.1;
    for (const node of nodeArr) {
      if (!node.isJunction || node.kind === "roundabout") continue;
      if (node.links.length < 4) continue; // 3-leg stays priority/TWSC
      let majorLegs = 0;
      for (const lid of node.links) {
        const l = linkById.get(lid);
        if (!l || l.kind === "ring") continue;
        const isMajor =
          (l.width != null && Number.isFinite(l.width) && l.width >= majorWidth) ||
          (l.lanesPerDir != null && l.lanesPerDir >= 2);
        if (isMajor) majorLegs += 1;
      }
      // Need two major roads crossing (>=2 major legs) to call it a signal.
      if (majorLegs >= 2) node.kind = "signal";
    }
  }

  // The movement (turn) table is only consumed by the vehicle simulation,
  // which is deactivated. Building it is O(degree^2) per junction and can be
  // a major cost (or, on an over-coalesced super-node, a blow-up) on the
  // Highway build, so skip it entirely while it has no consumer.
  const movements: Movement[] = [];
  void buildMovementTable; // kept for when the simulation is re-enabled

  return {
    nodes: nodeArr,
    links: linkArr,
    junctions: nodeArr.filter((n) => n.isJunction),
    buildings,
    bounds: { minX, minY, maxX, maxY },
    movements,
  };
}
/**
 * Enumerate every legal turn at every junction. For each
 * (incoming-link, arrival-direction) pair, emit movements onto every
 * other link at the same node, in every direction that points AWAY from
 * the node. U-turns (continuing on the same link) are excluded. Ring
 * links can only be traversed in their +1 direction, so movements onto a
 * ring link in dir=-1 are dropped.
 */
function buildMovementTable(
  nodes: NetworkNode[],
  links: NetworkLink[]
): Movement[] {
  const linksById = new Map(links.map((l) => [l.id, l]));
  const out: Movement[] = [];
  for (const node of nodes) {
    if (node.links.length < 2) continue;
    for (const inId of node.links) {
      const inLink = linksById.get(inId);
      if (!inLink) continue;
      // Direction the vehicle was travelling on inLink to arrive at node.
      const fromDir: 1 | -1 = inLink.toNode === node.id ? 1 : -1;
      // Inbound on a ring link is only legal in dir +1.
      if (inLink.kind === "ring" && fromDir !== 1) continue;
      for (const outId of node.links) {
        if (outId === inId) continue; // exclude U-turn
        const outLink = linksById.get(outId);
        if (!outLink) continue;
        const toDir: 1 | -1 = outLink.fromNode === node.id ? 1 : -1;
        if (outLink.kind === "ring" && toDir !== 1) continue;
        const toS = toDir === 1 ? 0 : outLink.length;
        out.push({
          junctionNodeId: node.id,
          fromLinkId: inId,
          fromDirAtArrival: fromDir,
          toLinkId: outId,
          toDirAtDeparture: toDir,
          toS,
        });
      }
    }
  }
  return out;
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
  // Average the two links' widths weighted by their length so a long
  // wide segment doesn't get diluted by a short narrow one (and vice versa).
  let mergedWidth: number | undefined;
  if (a.width != null || b.width != null) {
    const aw = a.width != null ? a.width * a.length : 0;
    const bw = b.width != null ? b.width * b.length : 0;
    const aL = a.width != null ? a.length : 0;
    const bL = b.width != null ? b.length : 0;
    if (aL + bL > 0) mergedWidth = (aw + bw) / (aL + bL);
  }
  return {
    id: `m${mergedLinkCounter++}`,
    fromNode,
    toNode,
    points: merged,
    length,
    bearing,
    width: mergedWidth,
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

interface BuildingWithLayer extends BuildingFootprint {
  layer?: string;
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
  const compact = label.replace(/\s+/g, "");
  for (const { type, patterns } of BUILDING_TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(label) || p.test(compact))) return type;
  }
  return "other";
}

/** Layer names give us a more authoritative building-type mapping than free text. */
function classifyBuildingLayer(layer: string): BuildingType | null {
  if (/villa|townhouse|town\s*hous|resi[_\s]|residen|apart/i.test(layer))
    return "residential";
  if (/hotel|boutique|amenit|club|gym|spa|grandstand|stable|equine|equest|lounge|brasserie/i.test(layer))
    return "amenity";
  if (/hospital|clinic|medical|health/i.test(layer)) return "hospital";
  if (/religious|mosque|masjid|jami/i.test(layer)) return "mosque";
  if (/school|nursery|kinder|college|univers|education|academy/i.test(layer))
    return "school";
  if (/civic|community|municip|police|fire.?stat|library|museum|gallery|cultural|heritage/i.test(layer))
    return "civic";
  if (/parking|garage/i.test(layer)) return "parking";
  if (/industrial|warehouse|factory|workshop|substation|utility|^ut\b/i.test(layer))
    return "industrial";
  if (/commercial|mixed.?use|retail|shop|mall|tower/i.test(layer))
    return "commercial";
  if (/office|admin|hq\b/i.test(layer)) return "office";
  return null;
}

/**
 * For each text item, find the smallest building polygon whose interior
 * contains the text's centre point. Concatenated lines become the label;
 * the label is run through a regex classifier to pick a building type.
 */
function assignLabels(
  buildings: BuildingWithLayer[],
  texts: {
    text: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    fontSize?: number;
  }[]
): BuildingWithLayer[] {
  // Layer-name pre-classification: even when no text falls inside the polygon,
  // a layer like LU_H-Resi_Villa+TH already tells us the type.
  const seeded = buildings.map((b) => {
    if (!b.layer) return b;
    const t = classifyBuildingLayer(b.layer);
    return t ? { ...b, buildingType: t } : b;
  });
  if (texts.length === 0) return seeded;

  // Pre-compute AABB and area for each building.
  const aabbs: {
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    area: number;
  }[] = [];
  const byId = new Map<string, BuildingWithLayer>();
  for (const b of seeded) {
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

  return seeded.map((b) => {
    const lines = labelMap.get(b.id);
    if (!lines || lines.length === 0) return b;
    const label = lines.join(" ").replace(/\s+/g, " ").trim();
    // Don't downgrade a stronger layer-based type with a weaker text-based
    // guess of "other".
    const fromLabel = classifyBuildingLabel(label);
    const buildingType =
      b.buildingType && fromLabel === "other" ? b.buildingType : fromLabel;
    return { ...b, label, buildingType };
  });
}

/**
 * Merge adjacent same-type building plots (typically villas / townhouses)
 * into a single cluster polygon. Adjacency is by AABB proximity inside a
 * tight tolerance so a row of detached villas joins into one block, but a
 * villa cluster across the road from a hotel does not.
 *
 * The merged geometry is the union's convex hull (cheap, deterministic, and
 * good enough for a simulation TAZ representation - we don't need the
 * cluster's exact concave outline at this stage).
 */
function mergeBuildingClusters(buildings: BuildingWithLayer[]): BuildingFootprint[] {
  if (buildings.length === 0) return [];

  // Bucket buildings by type so we never merge across types.
  const byType = new Map<BuildingType, number[]>();
  buildings.forEach((b, i) => {
    const t: BuildingType = b.buildingType ?? "other";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(i);
  });

  // Drawing-scale heuristic: pick a merge tolerance from the median plot
  // diagonal. Two plots whose AABBs are within `tol` are considered adjacent.
  const aabbs = buildings.map((b) => aabbOf(b.points));
  const diags = aabbs
    .map((a) => Math.hypot(a.maxX - a.minX, a.maxY - a.minY))
    .sort((a, b) => a - b);
  const medianDiag = diags[Math.floor(diags.length / 2)] || 1;

  const merged: BuildingFootprint[] = [];
  let mid = 0;

  for (const [type, idxs] of byType) {
    if (!shouldClusterType(type)) {
      for (const i of idxs) merged.push(buildings[i]);
      continue;
    }
    // Tighter tolerance for big aggregated types so we don't accidentally
    // merge two distinct clusters separated by an internal road.
    const tol = Math.max(3, medianDiag * 0.6);
    const adj = buildAdjacency(idxs, aabbs, tol);
    const components = connectedComponents(idxs, adj);

    for (const comp of components) {
      if (comp.length === 1) {
        merged.push(buildings[comp[0]]);
        continue;
      }
      const allPoints: { x: number; y: number }[] = [];
      let totalArea = 0;
      const labels: string[] = [];
      for (const i of comp) {
        const b = buildings[i];
        totalArea += b.area;
        if (b.label) labels.push(b.label);
        for (let p = 0; p < b.points.length; p += 2) {
          allPoints.push({ x: b.points[p], y: b.points[p + 1] });
        }
      }
      const hullPts = convexHull(allPoints);
      const flat: number[] = [];
      for (const p of hullPts) flat.push(p.x, p.y);
      // Close the hull polygon explicitly.
      if (
        flat.length >= 4 &&
        (flat[0] !== flat[flat.length - 2] || flat[1] !== flat[flat.length - 1])
      ) {
        flat.push(flat[0], flat[1]);
      }
      const dedup = [...new Set(labels)];
      merged.push({
        id: `m${mid++}`,
        points: flat,
        area: totalArea,
        buildingType: type,
        plotCount: comp.length,
        label: dedup.length > 0 ? dedup.join(" / ") : `${prettyType(type)} cluster`,
      });
    }
  }

  return merged;
}

/** Cluster the bulk-style usage types (villas, townhouses, generic resi);
 *  leave anchor assets like hotels / mosques / schools alone. */
function shouldClusterType(t: BuildingType): boolean {
  return t === "residential" || t === "industrial";
}

function aabbOf(points: number[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function aabbsTouch(
  a: ReturnType<typeof aabbOf>,
  b: ReturnType<typeof aabbOf>,
  tol: number
): boolean {
  if (a.maxX + tol < b.minX) return false;
  if (b.maxX + tol < a.minX) return false;
  if (a.maxY + tol < b.minY) return false;
  if (b.maxY + tol < a.minY) return false;
  return true;
}

function buildAdjacency(
  idxs: number[],
  aabbs: ReturnType<typeof aabbOf>[],
  tol: number
): Map<number, number[]> {
  // Spatial grid keyed by floor(x/cell), floor(y/cell). Cell = tol so any
  // two AABBs within tol must share a neighbour cell.
  const cell = Math.max(tol, 1);
  const grid = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx}_${cy}`;
  for (const i of idxs) {
    const a = aabbs[i];
    const cx0 = Math.floor(a.minX / cell);
    const cy0 = Math.floor(a.minY / cell);
    const cx1 = Math.floor(a.maxX / cell);
    const cy1 = Math.floor(a.maxY / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = key(cx, cy);
        const arr = grid.get(k) ?? [];
        arr.push(i);
        grid.set(k, arr);
      }
    }
  }
  const adj = new Map<number, number[]>();
  for (const i of idxs) adj.set(i, []);
  const seen = new Set<string>();
  for (const cellIdxs of grid.values()) {
    for (let p = 0; p < cellIdxs.length; p++) {
      for (let q = p + 1; q < cellIdxs.length; q++) {
        const i = cellIdxs[p];
        const j = cellIdxs[q];
        const pairKey = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        if (aabbsTouch(aabbs[i], aabbs[j], tol)) {
          adj.get(i)!.push(j);
          adj.get(j)!.push(i);
        }
      }
    }
  }
  return adj;
}

function connectedComponents(
  idxs: number[],
  adj: Map<number, number[]>
): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of idxs) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const v = stack.pop()!;
      if (seen.has(v)) continue;
      seen.add(v);
      comp.push(v);
      for (const n of adj.get(v) ?? []) if (!seen.has(n)) stack.push(n);
    }
    out.push(comp);
  }
  return out;
}

/** Andrew's monotone chain convex hull. Returns CCW polygon, no closing copy. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function cross(
  o: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function prettyType(t: BuildingType): string {
  return t === "other" ? "Building" : t.charAt(0).toUpperCase() + t.slice(1);
}

export function junctionDegree(node: NetworkNode): number {
  return node.links.length;
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
