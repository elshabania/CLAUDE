// Carriageway-level network extraction from a CAD drawing.
//
// Model (validated against the WSP masterplan with the user):
//   * The CAD draws carriageway EDGES (outer kerbs AND median kerbs on the
//     same EDGE layer), LANE DIVIDERS (dashed paint between same-direction
//     lanes), and LANE-DIRECTION ARROWS (block inserts).
//   * A CARRIAGEWAY is the strip of pavement between two parallel EDGE
//     lines. A median is also a strip between two EDGE lines - but it
//     contains no arrows and no lane dividers, which is how we tell them
//     apart.
//   * A Link here = one carriageway strip: centerline (midline between the
//     two edges), numLanes (from divider count and width), and direction
//     (from the arrows inside the strip: consistently one way -> one-way
//     link; both ways -> two-way undivided street).
//
// This is the abstraction a TIS needs: capacity lives on the carriageway
// (numLanes x saturation flow), and the core mitigation ("add a lane")
// edits numLanes on a Link.
//
// Pipeline:
//   (1) Chain EDGE segments into long rails (collinear continuation + 4 m
//       gap bridging across driveway breaks).
//   (2) Resample each rail at 1 m with local tangents; spatial-index.
//   (3) At every rail station, find the nearest PARALLEL rail on each
//       perpendicular side (2.5-15 m). Continuous runs of the same
//       (railA, railB) pairing = candidate strips.
//   (4) Dedupe (A,B) vs (B,A); classify each strip by its contents:
//       arrows -> travel direction; lane-divider points -> lane count;
//       neither + narrow -> median (dropped).
//   (5) Smooth the midline, build endpoint nodes, wire the graph.

import type { ParsedDrawing, LaneArrow } from "@/lib/road-detect";
import { buildGraph } from "@/lib/network-graph";

/** Default lane width (m) used to infer lane count from strip width. */
const LANE_WIDTH = 3.5;

export interface Link {
  id: string;
  /** Carriageway centerline [x0,y0,x1,y1,...]. For one-way links, oriented
   *  in the travel direction. */
  points: number[];
  /** Total marked lanes across the carriageway (both directions if twoWay). */
  numLanes: number;
  /** Average carriageway width (m). */
  width: number;
  /** Centerline length (m). */
  length: number;
  /** True when arrows in the strip all point one way (a one-way carriageway -
   *  e.g. one side of a divided road). False = two-way undivided street. */
  oneWay: boolean;
  /** Arrows found inside the strip (direction evidence). */
  arrowCount: number;
  /** Distinct lane-divider lines found inside the strip. */
  dividerCount: number;
  /** Graph node at the start of `points`. */
  fromNode: number;
  /** Graph node at the end of `points`. */
  toNode: number;
}

export interface LaneNode {
  id: number;
  x: number;
  y: number;
  /** Link indices incident to this node. */
  links: number[];
}

/**
 * Junction-interior connector — a virtual straight segment between two nodes
 * that sit inside the same physical intersection. The carriageway-pair
 * extraction stops at junction mouths (parallel-edge pairing breaks across
 * the kerb radii), so a 4-arm junction lands as 4-8 unconnected endpoint
 * nodes 15-40 m apart. Connectors stitch them together visually and form a
 * continuous network without altering the per-direction carriageway model.
 */
export interface JunctionConnector {
  from: number;
  to: number;
}

export interface LaneNetwork {
  links: Link[];
  nodes: LaneNode[];
  connectors: JunctionConnector[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  stats: {
    linkCount: number;
    /** Sum of length*numLanes (km) - drivable lane length. */
    laneKm: number;
    /** Sum of length (km). */
    centerlineKm: number;
    /** % of links whose direction is confirmed by arrows. */
    directedPct: number;
    junctionCount: number;
    oneWayCount: number;
    twoWayCount: number;
  };
}

export interface LaneNetworkOptions {
  isRailLayer?: (layer: string) => boolean;
}

type Pt = { x: number; y: number };

const isExi = (l: string) =>
  /(?:^|[_\-\s])(?:EXI|EXIST(?:ING)?|SURVEY|SURV)(?:[_\-\s]|$)|^EXI/i.test(l);
const DEFAULT_EDGE_LAYER = (l: string): boolean => {
  if (isExi(l)) return false;
  const u = l.toUpperCase();
  return /MAIN_ROAD_EDGE/.test(u)
    || /(?:^|[_\-\s])(?:EDGE|EOP|KERB|CURB)(?:[_\-\s]|$)/.test(u);
};
const isLaneDividerLayer = (l: string): boolean => {
  if (isExi(l)) return false;
  const u = l.toUpperCase();
  // The negative lookahead excludes the LANE0/LANE1 arrow-block layers.
  return /MAIN_ROAD_LANE(?![01])/.test(u);
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
};
const polyLen = (p: Pt[]) => {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]);
  return L;
};

export function buildLaneNetwork(
  drawing: ParsedDrawing,
  opts: LaneNetworkOptions = {}
): LaneNetwork {
  const isEdge = opts.isRailLayer ?? DEFAULT_EDGE_LAYER;
  const arrows: LaneArrow[] = drawing.laneArrows ?? [];

  // ---- (1) Gather EDGE segments and chain into rails ----
  const edgeSegs: [Pt, Pt][] = [];
  for (const seg of drawing.segments) {
    if (!isEdge(seg.groupId)) continue;
    const p = seg.points;
    for (let i = 2; i < p.length; i += 2) {
      edgeSegs.push([{ x: p[i - 2], y: p[i - 1] }, { x: p[i], y: p[i + 1] }]);
    }
  }
  if (edgeSegs.length === 0) {
    return {
      links: [], nodes: [], connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      stats: { linkCount: 0, laneKm: 0, centerlineKm: 0, directedPct: 0, junctionCount: 0, oneWayCount: 0, twoWayCount: 0 },
    };
  }

  const TOL = 0.3;
  const key = (p: Pt) => `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
  const ptOf = new Map<string, Pt>();
  const inc = new Map<string, number[]>();
  edgeSegs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      if (!ptOf.has(k)) ptOf.set(k, p);
      let a = inc.get(k);
      if (!a) inc.set(k, (a = []));
      a.push(i);
    }
  });
  const used = new Array(edgeSegs.length).fill(false);
  const dirSeg = (i: number, fromK: string) => {
    const s = edgeSegs[i];
    const aK = key(s[0]);
    const p0 = aK === fromK ? s[0] : s[1];
    const p1 = aK === fromK ? s[1] : s[0];
    const d = norm(p0, p1);
    return { dx: d.x, dy: d.y, nk: aK === fromK ? key(s[1]) : key(s[0]), np: p1 };
  };
  const EG = 2;
  const egk = (x: number, y: number) => `${Math.floor(x / EG)},${Math.floor(y / EG)}`;
  const endGrid = new Map<string, string[]>();
  for (const [k, p] of ptOf) {
    const g = egk(p.x, p.y);
    let a = endGrid.get(g);
    if (!a) endGrid.set(g, (a = []));
    a.push(k);
  }
  const bridgeGap = (fromK: string, dx: number, dy: number, maxD = 4.0): string | null => {
    const p = ptOf.get(fromK)!;
    let best: string | null = null;
    let bd = maxD;
    const gx = Math.floor(p.x / EG), gy = Math.floor(p.y / EG);
    const span = Math.ceil(maxD / EG);
    for (let ix = -span; ix <= span; ix++)
      for (let iy = -span; iy <= span; iy++)
        for (const k of endGrid.get(`${gx + ix},${gy + iy}`) ?? []) {
          if (k === fromK) continue;
          const q = ptOf.get(k)!;
          const vx = q.x - p.x, vy = q.y - p.y;
          const d = Math.hypot(vx, vy);
          if (d < 0.05 || d > bd) continue;
          if ((vx / d) * dx + (vy / d) * dy < 0.85) continue;
          if ((inc.get(k) ?? []).some(j => !used[j])) { bd = d; best = k; }
        }
    return best;
  };
  const rails: Pt[][] = [];
  for (let i = 0; i < edgeSegs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain: Pt[] = [edgeSegs[i][0], edgeSegs[i][1]];
    for (let d = 0; d < 2; d++) {
      let endK = key(chain[chain.length - 1]);
      let cur = dirSeg(i, key(chain[chain.length - 2]));
      let guard = 0;
      while (guard++ < 100000) {
        const cands = (inc.get(endK) ?? []).filter(j => !used[j]);
        let pick = -1;
        let pickDir: ReturnType<typeof dirSeg> | null = null;
        if (cands.length > 0) {
          let bestDot = 0.5;
          for (const j of cands) {
            const dd = dirSeg(j, endK);
            const dot = dd.dx * cur.dx + dd.dy * cur.dy;
            if (dot > bestDot) { bestDot = dot; pick = j; pickDir = dd; }
          }
        }
        if (pick < 0) {
          const bk = bridgeGap(endK, cur.dx, cur.dy, 4.0);
          if (bk) {
            const j = (inc.get(bk) ?? []).find(x => !used[x]);
            if (j != null) {
              chain.push(ptOf.get(bk)!);
              used[j] = true;
              const dd = dirSeg(j, bk);
              chain.push(dd.np);
              endK = dd.nk;
              cur = dd;
              continue;
            }
          }
          break;
        }
        used[pick] = true;
        chain.push(pickDir!.np);
        endK = pickDir!.nk;
        cur = pickDir!;
      }
      chain.reverse();
    }
    if (polyLen(chain) >= 8) rails.push(chain);
  }

  // ---- (2) Resample rails at 1 m ----
  type RailSample = { x: number; y: number; tx: number; ty: number };
  const resampleRail = (r: Pt[]): RailSample[] => {
    if (r.length < 2) return [];
    const out: RailSample[] = [];
    const tan = (i: number): Pt => norm(r[Math.max(0, i - 1)], r[Math.min(r.length - 1, i + 1)]);
    let acc = 0;
    let prev = r[0];
    const t0 = tan(0);
    out.push({ x: prev.x, y: prev.y, tx: t0.x, ty: t0.y });
    for (let i = 1; i < r.length; i++) {
      let a = prev;
      const b = r[i];
      let d = dist(a, b);
      const tt = tan(i);
      while (acc + d >= 1) {
        const u = (1 - acc) / d;
        const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        out.push({ x: p.x, y: p.y, tx: tt.x, ty: tt.y });
        a = p;
        d = dist(a, b);
        acc = 0;
      }
      acc += d;
      prev = b;
    }
    return out;
  };
  const railSamples = rails.map(resampleRail);

  const SCELL = 5;
  const sk = (x: number, y: number) => `${Math.floor(x / SCELL)},${Math.floor(y / SCELL)}`;
  const sGrid = new Map<string, { ri: number; i: number }[]>();
  railSamples.forEach((rs, ri) =>
    rs.forEach((p, i) => {
      const k = sk(p.x, p.y);
      let a = sGrid.get(k);
      if (!a) sGrid.set(k, (a = []));
      a.push({ ri, i });
    })
  );
  const sNear = (x: number, y: number, r = 12) => {
    const out: { ri: number; i: number }[] = [];
    const span = Math.ceil(r / SCELL);
    const gx = Math.floor(x / SCELL), gy = Math.floor(y / SCELL);
    for (let dx = -span; dx <= span; dx++)
      for (let dy = -span; dy <= span; dy++) {
        const a = sGrid.get(`${gx + dx},${gy + dy}`);
        if (a) for (const e of a) out.push(e);
      }
    return out;
  };

  // ---- (3) Pair stations with the nearest parallel rail on each side ----
  type Strip = { riA: number; riB: number; mids: Pt[]; widths: number[]; tangents: Pt[] };
  const strips: Strip[] = [];

  for (let ri = 0; ri < railSamples.length; ri++) {
    const rs = railSamples[ri];
    const runs: (Strip | null)[] = [null, null];
    const runLastIdx = [-10, -10];
    const flush = (s: number) => {
      const r = runs[s];
      if (r && r.mids.length >= 8) strips.push(r);
      runs[s] = null;
    };
    for (let i = 0; i < rs.length; i++) {
      const A = rs[i];
      const nx = -A.ty, ny = A.tx;
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const side = sideIdx === 0 ? 1 : -1;
        let bestRi = -1, bestPerp = 0, bestD = Infinity, bx = 0, by = 0;
        for (const cand of sNear(A.x + nx * side * 7, A.y + ny * side * 7, 12)) {
          if (cand.ri === ri) continue;
          const B = railSamples[cand.ri][cand.i];
          if (Math.abs(A.tx * B.tx + A.ty * B.ty) < 0.7) continue;
          const vx = B.x - A.x, vy = B.y - A.y;
          const along = vx * A.tx + vy * A.ty;
          const perp = vx * nx + vy * ny;
          if (Math.abs(along) > 2.5) continue;
          if (perp * side < 0) continue;
          const ap = Math.abs(perp);
          if (ap < 2.5 || ap > 15) continue;
          const d = Math.hypot(vx, vy);
          if (d < bestD) { bestD = d; bestRi = cand.ri; bestPerp = ap; bx = B.x; by = B.y; }
        }
        if (bestRi < 0) {
          if (i - runLastIdx[sideIdx] > 3) flush(sideIdx);
          continue;
        }
        const cur = runs[sideIdx];
        const mid = { x: (A.x + bx) / 2, y: (A.y + by) / 2 };
        if (!cur || cur.riB !== bestRi || i - runLastIdx[sideIdx] > 3) {
          flush(sideIdx);
          runs[sideIdx] = { riA: ri, riB: bestRi, mids: [mid], widths: [bestPerp], tangents: [{ x: A.tx, y: A.ty }] };
        } else {
          cur.mids.push(mid);
          cur.widths.push(bestPerp);
          cur.tangents.push({ x: A.tx, y: A.ty });
        }
        runLastIdx[sideIdx] = i;
      }
    }
    flush(0);
    flush(1);
  }

  // ---- (4) Dedupe (A,B)/(B,A): keep the longest strip per unordered pair ----
  const byPair = new Map<string, Strip>();
  for (const s of strips) {
    const k = `${Math.min(s.riA, s.riB)}_${Math.max(s.riA, s.riB)}`;
    const prev = byPair.get(k);
    if (!prev || s.mids.length > prev.mids.length) byPair.set(k, s);
  }
  const uniqStrips = [...byPair.values()];

  // ---- Index arrows + lane-divider sample points ----
  const arrowGrid = new Map<string, number[]>();
  arrows.forEach((a, i) => {
    const k = sk(a.x, a.y);
    let arr = arrowGrid.get(k);
    if (!arr) arrowGrid.set(k, (arr = []));
    arr.push(i);
  });
  const laneSamps: { x: number; y: number; tx: number; ty: number }[] = [];
  for (const seg of drawing.segments) {
    if (!isLaneDividerLayer(seg.groupId)) continue;
    const p = seg.points;
    let acc = 0;
    let prev = { x: p[0], y: p[1] };
    for (let i = 2; i < p.length; i += 2) {
      let a = prev;
      const b = { x: p[i], y: p[i + 1] };
      let d = dist(a, b);
      const t = norm(prev, b);
      while (acc + d >= 1) {
        const u = (1 - acc) / d;
        const pt = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        laneSamps.push({ x: pt.x, y: pt.y, tx: t.x, ty: t.y });
        a = pt;
        d = dist(a, b);
        acc = 0;
      }
      acc += d;
      prev = b;
    }
  }
  const laneGrid = new Map<string, number[]>();
  laneSamps.forEach((l, i) => {
    const k = sk(l.x, l.y);
    let arr = laneGrid.get(k);
    if (!arr) laneGrid.set(k, (arr = []));
    arr.push(i);
  });

  // ---- (5) Classify strips into Links ----
  const smooth = (t: Pt[]): Pt[] => {
    if (t.length < 5) return t;
    const sm: Pt[] = [t[0]];
    for (let i = 1; i < t.length - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(t.length - 1, i + 2); k++) {
        sx += t[k].x;
        sy += t[k].y;
        n++;
      }
      sm.push({ x: sx / n, y: sy / n });
    }
    sm.push(t[t.length - 1]);
    return sm;
  };

  type RawLink = {
    mids: Pt[];
    width: number;
    numLanes: number;
    oneWay: boolean;
    arrowCount: number;
    dividerCount: number;
  };
  const rawLinks: RawLink[] = [];

  for (const st of uniqStrips) {
    const halfW = st.widths.reduce((a, b) => a + b, 0) / st.widths.length / 2;
    let fwd = 0, bwd = 0, arrowCount = 0;
    const divPositions = new Set<number>();
    for (let i = 0; i < st.mids.length; i++) {
      const m = st.mids[i], t = st.tangents[i];
      const nx = -t.y, ny = t.x;
      for (const ai of arrowGrid.get(sk(m.x, m.y)) ?? []) {
        const a = arrows[ai];
        const vx = a.x - m.x, vy = a.y - m.y;
        const along = vx * t.x + vy * t.y;
        const perp = vx * nx + vy * ny;
        if (Math.abs(along) < 1.5 && Math.abs(perp) < halfW - 0.3) {
          arrowCount++;
          const dot = a.dx * t.x + a.dy * t.y;
          if (dot > 0.3) fwd++;
          else if (dot < -0.3) bwd++;
        }
      }
      for (const li of laneGrid.get(sk(m.x, m.y)) ?? []) {
        const lp = laneSamps[li];
        const vx = lp.x - m.x, vy = lp.y - m.y;
        const along = vx * t.x + vy * t.y;
        const perp = vx * nx + vy * ny;
        if (Math.abs(along) < 0.5 && Math.abs(perp) < halfW - 0.5) {
          if (Math.abs(lp.tx * t.x + lp.ty * t.y) > 0.8) divPositions.add(Math.round(perp / 2));
        }
      }
    }
    const width = halfW * 2;
    const dividerCount = divPositions.size;
    // Median / verge: no travel evidence and too narrow for a lane.
    if (arrowCount === 0 && dividerCount === 0 && width < 3.5) continue;
    const widthLanes = Math.max(1, Math.round(width / LANE_WIDTH));
    const numLanes = dividerCount > 0
      ? Math.min(Math.max(widthLanes, 1), dividerCount + 1)
      : Math.min(6, widthLanes);
    const oneWay = arrowCount > 0 && (fwd === 0 || bwd === 0);
    let mids = smooth(st.mids);
    if (oneWay && bwd > fwd) mids = mids.slice().reverse();
    rawLinks.push({ mids, width, numLanes, oneWay, arrowCount, dividerCount });
  }

  // ---- (6) Graph construction ----
  // Chain fragments into corridors, split at T-junctions, consolidate
  // junction boxes, cluster ends into nodes, clean stubs. See network-graph.ts.
  const { links, nodes } = buildGraph(rawLinks);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let laneKm = 0, centerlineKm = 0, directedCount = 0, oneWayCount = 0;
  for (const link of links) {
    const p = link.points;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < minX) minX = p[i];
      if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1];
      if (p[i + 1] > maxY) maxY = p[i + 1];
    }
    laneKm += (link.length * link.numLanes) / 1000;
    centerlineKm += link.length / 1000;
    if (link.arrowCount > 0) directedCount++;
    if (link.oneWay) oneWayCount++;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  const junctionCount = nodes.filter(n => n.links.length >= 3).length;
  // Links now meet at shared junction nodes, so no interior connectors are
  // needed. The field is kept for viewer compatibility.
  const connectors: JunctionConnector[] = [];

  return {
    links,
    nodes,
    connectors,
    bounds: { minX, minY, maxX, maxY },
    stats: {
      linkCount: links.length,
      laneKm,
      centerlineKm,
      directedPct: links.length ? (directedCount / links.length) * 100 : 0,
      junctionCount,
      oneWayCount,
      twoWayCount: links.length - oneWayCount,
    },
  };
}
