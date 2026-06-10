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

  // ---- (5b) Split links at T-junctions ----
  // A minor road's strip ENDS at the major road's kerb line, but the major
  // road's strip passes THROUGH the junction — so the minor link's endpoint
  // lands mid-polyline on the major link. Without a node there the graph is
  // disconnected at every T-junction. Fix: wherever another link's endpoint
  // falls within JOIN_TOL of a link's interior, split that link.
  {
    const JOIN_TOL = 25;     // endpoint-to-interior attach distance
    const END_EXCLUDE = 15;  // don't split within this of a link's own ends
    // collect all endpoints
    const endpoints: Pt[] = [];
    for (const rl of rawLinks) {
      if (rl.mids.length < 2) continue;
      endpoints.push(rl.mids[0], rl.mids[rl.mids.length - 1]);
    }
    const epGrid = new Map<string, Pt[]>();
    const epk = (x: number, y: number) => `${Math.floor(x / JOIN_TOL)},${Math.floor(y / JOIN_TOL)}`;
    for (const e of endpoints) {
      const k = epk(e.x, e.y);
      let a = epGrid.get(k);
      if (!a) epGrid.set(k, (a = []));
      a.push(e);
    }
    const splitLinks: RawLink[] = [];
    for (const rl of rawLinks) {
      const m = rl.mids;
      if (m.length < 6) { splitLinks.push(rl); continue; }
      // arc length per vertex
      const arc: number[] = [0];
      for (let i = 1; i < m.length; i++) arc.push(arc[i - 1] + dist(m[i - 1], m[i]));
      const total = arc[arc.length - 1];
      // find split stations: vertices near a foreign endpoint
      const splitIdx: number[] = [];
      for (let i = 0; i < m.length; i++) {
        if (arc[i] < END_EXCLUDE || total - arc[i] < END_EXCLUDE) continue;
        const gx = Math.floor(m[i].x / JOIN_TOL), gy = Math.floor(m[i].y / JOIN_TOL);
        let near = false;
        for (let dx = -1; dx <= 1 && !near; dx++)
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (const e of epGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
              // skip own endpoints
              if ((e === m[0]) || (e === m[m.length - 1])) continue;
              if (dist(e, m[i]) < JOIN_TOL) { near = true; break; }
            }
        if (near) splitIdx.push(i);
      }
      if (splitIdx.length === 0) { splitLinks.push(rl); continue; }
      // collapse runs of consecutive near-vertices to their midpoint index,
      // and enforce ≥15 m between splits
      const chosen: number[] = [];
      let runStart = splitIdx[0], prevI = splitIdx[0];
      const flushRun = (endI: number) => {
        const mid = Math.round((runStart + endI) / 2);
        if (chosen.length === 0 || arc[mid] - arc[chosen[chosen.length - 1]] > 15) chosen.push(mid);
      };
      for (let k = 1; k < splitIdx.length; k++) {
        if (splitIdx[k] - prevI > 3) { flushRun(prevI); runStart = splitIdx[k]; }
        prevI = splitIdx[k];
      }
      flushRun(prevI);
      // split mids at chosen indices
      let start = 0;
      for (const ci of chosen) {
        const part = m.slice(start, ci + 1);
        if (part.length >= 2 && polyLen(part) >= 8) {
          splitLinks.push({ ...rl, mids: part });
        }
        start = ci;
      }
      const tail = m.slice(start);
      if (tail.length >= 2 && polyLen(tail) >= 8) splitLinks.push({ ...rl, mids: tail });
    }
    rawLinks.length = 0;
    rawLinks.push(...splitLinks);
  }

  // ---- (6) Nodes from endpoint clustering + graph wiring ----
  // Junction node formation must SINGLE-LINKAGE cluster the link endpoints:
  // a 4-arm junction's eight approach-mouth endpoints spread over 40-60 m,
  // farther apart pairwise than any sane snap radius — but they chain
  // (each mouth is within ~35 m of the next around the box). Union-find over
  // endpoint pairs within NODE_SNAP gives one node per junction box.
  const NODE_SNAP = 15;
  const validLinks = rawLinks.filter(rl => rl.mids.length >= 2 && polyLen(rl.mids) >= 8);
  type EndRef = { li: number; end: 0 | 1; p: Pt };
  const endRefs: EndRef[] = [];
  validLinks.forEach((rl, li) => {
    endRefs.push({ li, end: 0, p: rl.mids[0] });
    endRefs.push({ li, end: 1, p: rl.mids[rl.mids.length - 1] });
  });
  const parent = endRefs.map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  {
    const G = NODE_SNAP;
    const grid = new Map<string, number[]>();
    endRefs.forEach((e, i) => {
      const k = `${Math.floor(e.p.x / G)},${Math.floor(e.p.y / G)}`;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    });
    for (let i = 0; i < endRefs.length; i++) {
      const e = endRefs[i];
      const gx = Math.floor(e.p.x / G), gy = Math.floor(e.p.y / G);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const j of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (j <= i) continue;
            if (dist(e.p, endRefs[j].p) <= NODE_SNAP) union(i, j);
          }
    }
  }
  // One node per cluster at the cluster centroid.
  const clusterNode = new Map<number, number>();
  const nodes: LaneNode[] = [];
  const nodeAccum: { sx: number; sy: number; n: number }[] = [];
  for (let i = 0; i < endRefs.length; i++) {
    const r = find(i);
    let nid = clusterNode.get(r);
    if (nid === undefined) {
      nid = nodes.length;
      clusterNode.set(r, nid);
      nodes.push({ id: nid, x: 0, y: 0, links: [] });
      nodeAccum.push({ sx: 0, sy: 0, n: 0 });
    }
    nodeAccum[nid].sx += endRefs[i].p.x;
    nodeAccum[nid].sy += endRefs[i].p.y;
    nodeAccum[nid].n++;
  }
  nodes.forEach((n, i) => {
    n.x = nodeAccum[i].sx / nodeAccum[i].n;
    n.y = nodeAccum[i].sy / nodeAccum[i].n;
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let laneKm = 0, centerlineKm = 0, directedCount = 0, oneWayCount = 0;
  const links: Link[] = [];
  validLinks.forEach((rl, vi) => {
    const length = polyLen(rl.mids);
    const flat: number[] = [];
    for (const q of rl.mids) {
      flat.push(q.x, q.y);
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
    const fromNode = clusterNode.get(find(2 * vi))!;
    const toNode = clusterNode.get(find(2 * vi + 1))!;
    const li = links.length;
    nodes[fromNode].links.push(li);
    if (toNode !== fromNode) nodes[toNode].links.push(li);
    laneKm += (length * rl.numLanes) / 1000;
    centerlineKm += length / 1000;
    if (rl.arrowCount > 0) directedCount++;
    if (rl.oneWay) oneWayCount++;
    links.push({
      id: `link${li}`,
      points: flat,
      numLanes: rl.numLanes,
      width: rl.width,
      length,
      oneWay: rl.oneWay,
      arrowCount: rl.arrowCount,
      dividerCount: rl.dividerCount,
      fromNode,
      toNode,
    });
  });
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  const junctionCount = nodes.filter(n => n.links.length >= 3).length;

  // ---- Junction-interior connectors ----
  // Nodes within JUNCTION_RADIUS of each other that aren't already directly
  // joined by a link sit inside the same intersection. Stitch them with
  // straight connectors so the network reads as a continuous graph (visually
  // and in any downstream routing).
  const JUNCTION_RADIUS = 40;
  const connectors: JunctionConnector[] = [];
  {
    const directLinked = new Set<string>();
    for (const link of links) {
      if (link.fromNode === link.toNode) continue;
      const a = Math.min(link.fromNode, link.toNode);
      const b = Math.max(link.fromNode, link.toNode);
      directLinked.add(`${a}|${b}`);
    }
    const G = JUNCTION_RADIUS;
    const grid = new Map<string, number[]>();
    nodes.forEach(n => {
      const k = `${Math.floor(n.x / G)},${Math.floor(n.y / G)}`;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(n.id);
    });
    for (const n of nodes) {
      if (n.links.length === 0) continue;
      const gx = Math.floor(n.x / G), gy = Math.floor(n.y / G);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const mid of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (mid <= n.id) continue;
            const m = nodes[mid];
            if (m.links.length === 0) continue;
            if (Math.hypot(m.x - n.x, m.y - n.y) > JUNCTION_RADIUS) continue;
            if (directLinked.has(`${n.id}|${mid}`)) continue;
            connectors.push({ from: n.id, to: mid });
          }
    }
  }

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
