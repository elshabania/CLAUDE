import type {
  ParsedDrawing,
  RoadCategory,
  DrawingSegment,
} from "@/lib/road-detect";
import { deriveCenterlinesFromCurbs } from "@/lib/centerline-derivation";
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

function polygonPerimeter(points: number[]): number {
  let p = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    p += Math.hypot(points[j] - points[i], points[j + 1] - points[i + 1]);
  }
  return p;
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
  for (const s of drawing.segments) {
    const cat = segCat(s);
    if (roadSet.has(cat)) preClassifiedRoads.push(s);
    else if (cat === "edge" || cat === "curb") curbSegs.push(s);
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
  const shouldDerive =
    opts.deriveCenterlines ??
    (curbSegs.length > preClassifiedRoads.length * 2 && curbSegs.length >= 50);

  type RoadSeg = {
    points: number[];
    length: number;
    width?: number;
    bodyPolygon?: number[];
  };
  let roadSegs: RoadSeg[];
  if (shouldDerive && curbSegs.length > 0) {
    // Primary path: image-based medial-axis extractor. Rasterizes kerbs,
    // distance-transforms the asphalt mask, thins to a 1-pixel-wide
    // skeleton, and traces the skeleton into polylines + body polygons.
    // Falls back to the local pair-matcher when the image path is
    // unavailable (no `document`, e.g. SSR) or returns nothing.
    let derived: {
      points: number[];
      length: number;
      width: number;
      bodyPolygon: number[];
    }[] = [];
    if (typeof document !== "undefined") {
      const skeleton = extractRoadSkeleton(curbSegs, { minX, minY, maxX, maxY });
      if (skeleton.length > 0) derived = skeleton;
    }
    if (derived.length === 0) {
      const maxRoadWidth = diag * (opts.maxRoadWidthFraction ?? 0.025);
      const sampleStep = Math.max(diag * 0.0025, 1);
      const fallback = deriveCenterlinesFromCurbs(curbSegs, {
        maxRoadWidth,
        sampleStep,
        parallelCos: 0.85,
        perpCos: 0.4,
        minPoints: 3,
      });
      derived = fallback;
    }
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

  // Detect junction regions from closed curb polygons (typically roundabouts
  // and signalised junction boxes). We bound by area so we ignore both the
  // tiny dash-loops and the page outline.
  const minRegionArea = Math.pow(diag * 0.005, 2);
  const maxRegionArea = Math.pow(diag * 0.15, 2);
  type RegionRec = {
    id: string;
    cx: number;
    cy: number;
    polygon: number[];
    aabb: { minX: number; minY: number; maxX: number; maxY: number };
    kind: "roundabout" | "signal";
  };
  const regions: RegionRec[] = [];
  for (const c of curbSegs) {
    if (!c.closed) continue;
    if (c.points.length < 8) continue;
    const a = polygonArea(c.points);
    if (a < minRegionArea || a > maxRegionArea) continue;
    let cx = 0,
      cy = 0;
    let count = 0;
    let mnx = Infinity,
      mny = Infinity,
      mxx = -Infinity,
      mxy = -Infinity;
    for (let i = 0; i < c.points.length; i += 2) {
      const x = c.points[i];
      const y = c.points[i + 1];
      cx += x;
      cy += y;
      count += 1;
      if (x < mnx) mnx = x;
      if (y < mny) mny = y;
      if (x > mxx) mxx = x;
      if (y > mxy) mxy = y;
    }
    if (count === 0) continue;
    // Compactness 4 pi A / P^2 in [0, 1]: a circle is 1.0, a square ~0.785,
    // long thin polygons << 0.5. Use this to distinguish a roundabout
    // (typically a smooth ellipse / circle) from a signalised junction box
    // (rectangular, lower compactness).
    const perim = polygonPerimeter(c.points);
    const compact =
      perim > 0 ? Math.min(1, (4 * Math.PI * a) / (perim * perim)) : 0;
    const kind: "roundabout" | "signal" =
      compact > 0.6 ? "roundabout" : "signal";
    regions.push({
      id: `j${regions.length}`,
      cx: cx / count,
      cy: cy / count,
      polygon: c.points,
      aabb: { minX: mnx, minY: mny, maxX: mxx, maxY: mxy },
      kind,
    });
  }

  // Junction-zone detection v3: cluster curb endpoints (where multiple
  // curb polylines END near the same point - the signature of a road
  // intersection). This works directly off the curb geometry so it doesn't
  // depend on having any centerline drawn or derived in the area.
  const endpoints: { x: number; y: number; segId: number }[] = [];
  curbSegs.forEach((c, i) => {
    if (c.points.length < 4) return;
    const x0 = c.points[0];
    const y0 = c.points[1];
    const x1 = c.points[c.points.length - 2];
    const y1 = c.points[c.points.length - 1];
    if (Number.isFinite(x0) && Number.isFinite(y0))
      endpoints.push({ x: x0, y: y0, segId: i });
    if (Number.isFinite(x1) && Number.isFinite(y1))
      endpoints.push({ x: x1, y: y1, segId: i });
  });
  if (endpoints.length > 0) {
    const clusterRadius = diag * 0.014; // ~typical curb-corner radius
    const minClusterEndpoints = 4; // 2 roads meeting = 4 curb ends minimum
    const minDistinctSegs = 3; // require >=3 distinct curb polylines
    const epCell = Math.max(clusterRadius, 1);
    const epGrid = new Map<string, number[]>();
    for (let i = 0; i < endpoints.length; i++) {
      const p = endpoints[i];
      const k = `${Math.floor(p.x / epCell)}_${Math.floor(p.y / epCell)}`;
      if (!epGrid.has(k)) epGrid.set(k, []);
      epGrid.get(k)!.push(i);
    }
    const visited = new Set<number>();
    for (let start = 0; start < endpoints.length; start++) {
      if (visited.has(start)) continue;
      const cluster: number[] = [];
      const queue = [start];
      while (queue.length > 0) {
        const j = queue.pop()!;
        if (visited.has(j)) continue;
        visited.add(j);
        cluster.push(j);
        const p = endpoints[j];
        const cx = Math.floor(p.x / epCell);
        const cy = Math.floor(p.y / epCell);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const ids = epGrid.get(`${cx + dx}_${cy + dy}`);
            if (!ids) continue;
            for (const k of ids) {
              if (visited.has(k)) continue;
              const q = endpoints[k];
              if (Math.hypot(q.x - p.x, q.y - p.y) < clusterRadius) queue.push(k);
            }
          }
        }
      }
      if (cluster.length < minClusterEndpoints) continue;
      const distinct = new Set(cluster.map((i) => endpoints[i].segId));
      if (distinct.size < minDistinctSegs) continue;

      // Compute centroid + AABB. The region polygon = convex hull of the
      // endpoints expanded outward from the centroid by 1.4x so the polygon
      // has a bit of buffer beyond the literal endpoints.
      let cx = 0,
        cy = 0;
      for (const i of cluster) {
        cx += endpoints[i].x;
        cy += endpoints[i].y;
      }
      cx /= cluster.length;
      cy /= cluster.length;

      // Skip if this cluster sits inside an already-detected closed-polygon
      // region (avoid counting roundabouts twice).
      let insideExisting = false;
      for (const r of regions) {
        if (
          cx >= r.aabb.minX &&
          cx <= r.aabb.maxX &&
          cy >= r.aabb.minY &&
          cy <= r.aabb.maxY &&
          pointInPolygon(cx, cy, r.polygon)
        ) {
          insideExisting = true;
          break;
        }
      }
      if (insideExisting) continue;

      const expanded: { x: number; y: number }[] = [];
      for (const i of cluster) {
        const p = endpoints[i];
        expanded.push({
          x: cx + (p.x - cx) * 1.4,
          y: cy + (p.y - cy) * 1.4,
        });
      }
      const hull = convexHull(expanded);
      if (hull.length < 3) continue;
      const flat: number[] = [];
      let mnx = Infinity,
        mny = Infinity,
        mxx = -Infinity,
        mxy = -Infinity;
      for (const h of hull) {
        flat.push(h.x, h.y);
        if (h.x < mnx) mnx = h.x;
        if (h.y < mny) mny = h.y;
        if (h.x > mxx) mxx = h.x;
        if (h.y > mxy) mxy = h.y;
      }
      regions.push({
        id: `jc${regions.length}`,
        cx,
        cy,
        polygon: flat,
        aabb: { minX: mnx, minY: mny, maxX: mxx, maxY: mxy },
        kind: "signal",
      });
    }
  }
  const cell = Math.max(tolerance, 1e-6);

  // Spatial hash on a grid with cell = tolerance. We search the 3x3 cell
  // neighbourhood for a near match before creating a new node.
  const grid = new Map<string, { id: string; x: number; y: number }[]>();
  const nodes: Map<string, NetworkNode> = new Map();

  const cellKey = (x: number, y: number) =>
    `${Math.round(x / cell)}_${Math.round(y / cell)}`;

  // Pre-create one node per junction region; findOrCreate snaps to it when
  // an endpoint falls inside or close to the region's footprint.
  for (const r of regions) {
    nodes.set(r.id, {
      id: r.id,
      x: r.cx,
      y: r.cy,
      links: [],
      isJunction: true,
      region: r.polygon,
      kind: r.kind,
    });
  }

  function findRegion(x: number, y: number): string | null {
    for (const r of regions) {
      if (
        x < r.aabb.minX - tolerance ||
        x > r.aabb.maxX + tolerance ||
        y < r.aabb.minY - tolerance ||
        y > r.aabb.maxY + tolerance
      )
        continue;
      if (pointInPolygon(x, y, r.polygon)) return r.id;
    }
    return null;
  }

  function findOrCreate(x: number, y: number): string {
    const regionId = findRegion(x, y);
    if (regionId) return regionId;
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

  for (const node of nodes.values()) {
    if (node.region) continue;
    node.isJunction = node.links.length >= 3;
    if (node.isJunction && !node.kind) node.kind = "priority";
  }

  // Junction-region v2: cluster nearby high-degree nodes into a single
  // junction footprint. Signal junctions don't have a closed curb polygon
  // around them - they're an open box where multiple roads meet - so the
  // closed-polygon detector at the top of buildRoadNetwork misses them.
  // Here we group degree>=3 nodes that fall within a junction-radius of
  // each other, replace the cluster with one merged node sitting at the
  // cluster centroid, and synthesise a convex-hull polygon for it.
  const junctionRadius = diag * 0.025;
  const allJunctionNodes = Array.from(nodes.values()).filter(
    (n) => n.isJunction && !n.region
  );
  if (allJunctionNodes.length > 0) {
    const adjMap = new Map<string, Set<string>>();
    for (const n of allJunctionNodes) adjMap.set(n.id, new Set());
    for (let i = 0; i < allJunctionNodes.length; i++) {
      for (let j = i + 1; j < allJunctionNodes.length; j++) {
        const a = allJunctionNodes[i];
        const b = allJunctionNodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) <= junctionRadius) {
          adjMap.get(a.id)!.add(b.id);
          adjMap.get(b.id)!.add(a.id);
        }
      }
    }
    const seen = new Set<string>();
    for (const start of allJunctionNodes) {
      if (seen.has(start.id)) continue;
      const cluster: NetworkNode[] = [];
      const stack = [start.id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = nodes.get(id);
        if (!node) continue;
        cluster.push(node);
        for (const nb of adjMap.get(id) ?? []) if (!seen.has(nb)) stack.push(nb);
      }
      if (cluster.length < 2) continue;

      // Merge: pick centroid, build convex-hull polygon of node positions
      // expanded to a square of half-junctionRadius so the region has area.
      let cx = 0,
        cy = 0;
      const ptCloud: { x: number; y: number }[] = [];
      for (const n of cluster) {
        cx += n.x;
        cy += n.y;
        const r = junctionRadius * 0.5;
        ptCloud.push({ x: n.x - r, y: n.y - r });
        ptCloud.push({ x: n.x + r, y: n.y - r });
        ptCloud.push({ x: n.x + r, y: n.y + r });
        ptCloud.push({ x: n.x - r, y: n.y + r });
      }
      cx /= cluster.length;
      cy /= cluster.length;
      const hull = convexHull(ptCloud);
      const flatHull: number[] = [];
      for (const p of hull) flatHull.push(p.x, p.y);

      const mergedId = `jc${regions.length + cluster[0].id}`;
      const mergedNode: NetworkNode = {
        id: mergedId,
        x: cx,
        y: cy,
        links: [],
        isJunction: true,
        region: flatHull,
      };

      // Re-route each link that touched a cluster node to point at mergedId
      // instead. Drop links that ended up with both ends inside the cluster.
      const inCluster = new Set(cluster.map((c) => c.id));
      const allLinks = Array.from(linkMap.values());
      for (const link of allLinks) {
        const fromIn = inCluster.has(link.fromNode);
        const toIn = inCluster.has(link.toNode);
        if (fromIn && toIn) {
          linkMap.delete(link.id);
          continue;
        }
        if (fromIn) link.fromNode = mergedId;
        if (toIn) link.toNode = mergedId;
        if (fromIn || toIn) mergedNode.links.push(link.id);
      }
      // Remove the original cluster nodes; install the merged one.
      for (const c of cluster) nodes.delete(c.id);
      nodes.set(mergedId, mergedNode);
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
  // network's median link width. The lane unit is half the median width
  // because we assume the median road carries 1 lane per direction. Wider
  // links scale up (2 / 3 / 4 lanes per dir, capped at 4 to avoid runaway
  // estimates on weirdly-shaped polygons).
  const widths: number[] = [];
  for (const l of linkArr) if (l.width != null) widths.push(l.width);
  let medianWidth = 0;
  if (widths.length > 0) {
    widths.sort((a, b) => a - b);
    medianWidth = widths[Math.floor(widths.length / 2)];
  }
  const laneUnit = medianWidth > 0 ? Math.max(1e-3, medianWidth / 2) : diag * 0.001;

  // Lane-count derivation from the actual CAD lane markings:
  // for each link with a bodyPolygon (= the asphalt area between paired
  // curbs), count how many lane-separator polylines lie INSIDE the body.
  // N internal markings = N+1 lanes total. This produces an accurate
  // per-link lane count for any road that the curb-pair derivation
  // covered. Fallback to the width-based estimate when there's no body
  // polygon (e.g. a single-curb stretch).
  const laneMarkings: { mid: { x: number; y: number } }[] = [];
  for (const seg of drawing.segments) {
    const cat = groupCategoryOverrides[seg.groupId] ?? seg.category;
    if (cat !== "lane") continue;
    // Skip decorative paint (zebras, stop lines, arrows, drop-kerb marks)
    // - those aren't lane separators.
    const layer = (seg.layer ?? "").toLowerCase();
    if (
      layer.includes("pedestrian") ||
      layer.includes("crosswalk") ||
      layer.includes("zebra") ||
      layer.includes("stop line") ||
      layer.includes("giveway") ||
      layer.includes("give way") ||
      layer.includes("arrow") ||
      layer.includes("drop kerb") ||
      layer.includes("parking") ||
      layer.includes("crossing") ||
      layer.includes("no crossing")
    ) {
      continue;
    }
    if (seg.points.length < 4) continue;
    // Sample the polyline midpoint.
    const midIdx = Math.floor(seg.points.length / 4) * 2;
    laneMarkings.push({
      mid: { x: seg.points[midIdx], y: seg.points[midIdx + 1] },
    });
  }

  for (const link of linkArr) {
    let totalLanes = 2;
    if (link.bodyPolygon && link.bodyPolygon.length >= 6) {
      let mnx = Infinity,
        mny = Infinity,
        mxx = -Infinity,
        mxy = -Infinity;
      for (let i = 0; i < link.bodyPolygon.length; i += 2) {
        const x = link.bodyPolygon[i];
        const y = link.bodyPolygon[i + 1];
        if (x < mnx) mnx = x;
        if (y < mny) mny = y;
        if (x > mxx) mxx = x;
        if (y > mxy) mxy = y;
      }
      let internal = 0;
      for (const m of laneMarkings) {
        if (m.mid.x < mnx || m.mid.x > mxx || m.mid.y < mny || m.mid.y > mxy)
          continue;
        if (pointInPolygon(m.mid.x, m.mid.y, link.bodyPolygon)) internal += 1;
      }
      totalLanes = Math.max(2, Math.min(8, internal + 1));
    } else if (link.width != null) {
      totalLanes = Math.max(2, Math.min(8, Math.round(link.width / laneUnit)));
    }
    link.lanesPerDir = Math.max(1, Math.floor(totalLanes / 2));
  }

  return {
    nodes: nodeArr,
    links: linkArr,
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
