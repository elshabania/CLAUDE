// Lane-level network extraction from a CAD drawing.
//
// A detailed road CAD (unlike the PDF) draws the carriageway EDGES and the
// LANE divider lines explicitly. Together those are parallel longitudinal
// "rails"; a travel lane is the strip between two adjacent rails, and its
// centerline is the midline. This module turns the parsed drawing's edge/lane
// segments into discrete lane centerlines with a local lane count — the
// foundation for the microsimulation + TIS capacity analysis (capacity =
// lanes, and the core mitigation is "add a lane").
//
// Pure + deterministic so the headless harness and the app produce identical
// output. Operates on ParsedDrawing.segments (already block-expanded, world
// coords, tagged with their source layer via `groupId`).

import type { ParsedDrawing, LaneArrow } from "@/lib/road-detect";

export interface Lane {
  id: string;
  /** Flat [x0, y0, x1, y1, ...] centerline in world coords, ORIENTED in the
   *  travel direction (start = upstream, end = downstream). */
  points: number[];
  /** Parallel lanes carrying the SAME travel direction at this cross-section. */
  laneCount: number;
  /** Centerline length in drawing units. */
  length: number;
  /** Travel direction confidence: true when an arrow oriented this lane. */
  directed: boolean;
  /** Graph node id at the upstream end. */
  fromNode: number;
  /** Graph node id at the downstream end. */
  toNode: number;
}

/** A lane-to-lane connector through a junction (turning movement geometry). */
export interface Connector {
  id: string;
  fromLane: number; // index into lanes[]
  toLane: number; // index into lanes[]
  /** Junction node both lanes meet at. */
  node: number;
  /** Turn classification by deflection angle. */
  turn: "through" | "left" | "right" | "uturn";
  /** Short bezier-ish polyline joining the lane ends, flat [x,y,...]. */
  points: number[];
}

/** A graph node — a junction point or a lane terminus. */
export interface LaneNode {
  id: number;
  x: number;
  y: number;
  /** Lane indices entering (downstream end here). */
  incoming: number[];
  /** Lane indices leaving (upstream end here). */
  outgoing: number[];
}

export interface LaneNetwork {
  lanes: Lane[];
  nodes: LaneNode[];
  connectors: Connector[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Diagnostics for the verification harness / status bar. */
  stats: {
    railCount: number;
    laneKm: number;
    directedPct: number;
    junctionCount: number;
    connectorCount: number;
  };
}

export interface LaneNetworkOptions {
  /** Layer-name test for carriageway edges + lane dividers (the "rails"). */
  isRailLayer?: (layer: string) => boolean;
  /** Max lane width (world units). Default 5.5 (metres on the WSP plan). */
  maxLaneWidth?: number;
  /** Min lane width. Default 2.0. */
  minLaneWidth?: number;
}

type Pt = { x: number; y: number };

const DEFAULT_RAIL_LAYER = (layer: string): boolean => {
  const u = layer.toUpperCase();
  // Only the PROPOSED design road network — exclude existing/survey layers
  // (EXI_*, SURVEY_*) which carry far-flung control points and existing kerbs
  // that would blow out the bounds and inflate lane counts.
  if (/(?:^|[_\-\s])(?:EXI|EXIST(?:ING)?|SURVEY|SURV)(?:[_\-\s]|$)|^EXI/.test(u)) {
    return false;
  }
  // WSP standard: ...ROAD_EDGE..., ...ROAD_LANE... (divider, not LANE0/LANE1
  // arrow layers); plus generic CAD edge/lane tokens for other standards.
  return (
    /ROAD_EDGE|ROAD_LANE(?![01])/.test(u) ||
    /(?:^|[_\-\s])(?:EDGE|EOP|KERB|CURB|LANE)(?:[_\-\s]|$)/.test(u)
  );
};

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function polyLen(r: Pt[]): number {
  let L = 0;
  for (let i = 1; i < r.length; i++) L += dist(r[i - 1], r[i]);
  return L;
}
function norm(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

/** Resample a polyline to ~`step` spacing for uniform pairing density. */
function resample(r: Pt[], step = 2): Pt[] {
  const out: Pt[] = [r[0]];
  let acc = 0;
  for (let i = 1; i < r.length; i++) {
    let a = r[i - 1];
    const b = r[i];
    let d = dist(a, b);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p;
      d = dist(a, b);
      acc = 0;
    }
    acc += d;
  }
  if (out[out.length - 1] !== r[r.length - 1]) out.push(r[r.length - 1]);
  return out;
}

export function buildLaneNetwork(
  drawing: ParsedDrawing,
  opts: LaneNetworkOptions = {}
): LaneNetwork {
  const isRail = opts.isRailLayer ?? DEFAULT_RAIL_LAYER;
  const MAXW = opts.maxLaneWidth ?? 5.5;
  const MINW = opts.minLaneWidth ?? 2.0;

  // 1. Gather rail segments (2-point) from edge/lane-divider polylines.
  const railSegs: [Pt, Pt][] = [];
  for (const seg of drawing.segments) {
    if (!isRail(seg.groupId)) continue;
    const p = seg.points;
    for (let i = 2; i < p.length; i += 2) {
      railSegs.push([
        { x: p[i - 2], y: p[i - 1] },
        { x: p[i], y: p[i + 1] },
      ]);
    }
  }
  if (railSegs.length === 0) {
    return {
      lanes: [],
      nodes: [],
      connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      stats: { railCount: 0, laneKm: 0, directedPct: 0, junctionCount: 0, connectorCount: 0 },
    };
  }

  // 2. Chain segments into continuous rails: at junctions follow the most
  //    collinear continuation, and bridge gaps up to 2m in the same direction.
  const TOL = 0.3;
  const key = (p: Pt) => `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
  const ptOf = new Map<string, Pt>();
  const inc = new Map<string, number[]>();
  railSegs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      if (!ptOf.has(k)) ptOf.set(k, p);
      let arr = inc.get(k);
      if (!arr) inc.set(k, (arr = []));
      arr.push(i);
    }
  });
  const used = new Array(railSegs.length).fill(false);
  const dirSeg = (i: number, fromK: string) => {
    const s = railSegs[i];
    const aK = key(s[0]);
    const p0 = aK === fromK ? s[0] : s[1];
    const p1 = aK === fromK ? s[1] : s[0];
    const d = norm(p0, p1);
    return { dx: d.x, dy: d.y, nk: aK === fromK ? key(s[1]) : key(s[0]), np: p1 };
  };
  // endpoint grid for gap-bridging
  const EG = 2;
  const egk = (x: number, y: number) => `${Math.floor(x / EG)},${Math.floor(y / EG)}`;
  const endGrid = new Map<string, string[]>();
  for (const [k, p] of ptOf) {
    const gk = egk(p.x, p.y);
    let arr = endGrid.get(gk);
    if (!arr) endGrid.set(gk, (arr = []));
    arr.push(k);
  }
  const bridge = (fromK: string, dx: number, dy: number): string | null => {
    const p = ptOf.get(fromK)!;
    let best: string | null = null;
    let bd = 2.0;
    const gx = Math.floor(p.x / EG);
    const gy = Math.floor(p.y / EG);
    for (let ix = -1; ix <= 1; ix++)
      for (let iy = -1; iy <= 1; iy++) {
        for (const k of endGrid.get(`${gx + ix},${gy + iy}`) ?? []) {
          if (k === fromK) continue;
          const q = ptOf.get(k)!;
          const vx = q.x - p.x;
          const vy = q.y - p.y;
          const d = Math.hypot(vx, vy);
          if (d < 0.05 || d > bd) continue;
          if ((vx / d) * dx + (vy / d) * dy < 0.9) continue;
          if ((inc.get(k) ?? []).some((j) => !used[j])) {
            bd = d;
            best = k;
          }
        }
      }
    return best;
  };
  const rails: Pt[][] = [];
  for (let i = 0; i < railSegs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain: Pt[] = [railSegs[i][0], railSegs[i][1]];
    for (let d = 0; d < 2; d++) {
      let endK = key(chain[chain.length - 1]);
      let cur = dirSeg(i, key(chain[chain.length - 2]));
      // guard against pathological loops
      let guard = 0;
      while (guard++ < 100000) {
        const cands = (inc.get(endK) ?? []).filter((j) => !used[j]);
        let pick = -1;
        let pickDir: ReturnType<typeof dirSeg> | null = null;
        if (cands.length > 0) {
          let bestDot = 0.5;
          for (const j of cands) {
            const dd = dirSeg(j, endK);
            const dot = dd.dx * cur.dx + dd.dy * cur.dy;
            if (dot > bestDot) {
              bestDot = dot;
              pick = j;
              pickDir = dd;
            }
          }
        }
        if (pick < 0) {
          const bk = bridge(endK, cur.dx, cur.dy);
          if (bk) {
            const j = (inc.get(bk) ?? []).find((x) => !used[x]);
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
    rails.push(chain);
  }
  const R = rails.filter((r) => polyLen(r) >= 10).map((r) => resample(r, 2));

  // 3. Pair adjacent parallel rails → lane midline points.
  const GRID = 6;
  const gk = (x: number, y: number) => `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
  const grid = new Map<string, { ri: number; p: Pt }[]>();
  R.forEach((pts, ri) =>
    pts.forEach((p) => {
      const k = gk(p.x, p.y);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push({ ri, p });
    })
  );
  const near = (x: number, y: number) => {
    const out: { ri: number; p: Pt }[] = [];
    const gx = Math.floor(x / GRID);
    const gy = Math.floor(y / GRID);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const a = grid.get(`${gx + dx},${gy + dy}`);
        if (a) for (const z of a) out.push(z);
      }
    return out;
  };
  const tan = (pts: Pt[], i: number) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(a, b);
    return { tx: d.x, ty: d.y };
  };
  const laneAccum = new Map<string, Pt[]>();
  R.forEach((pts, ri) =>
    pts.forEach((p, pi) => {
      const { tx, ty } = tan(pts, pi);
      const nx = -ty;
      const ny = tx;
      for (const side of [1, -1]) {
        let best: { ri: number; p: Pt } | null = null;
        let bd = MAXW;
        for (const o of near(p.x, p.y)) {
          if (o.ri === ri) continue;
          const vx = o.p.x - p.x;
          const vy = o.p.y - p.y;
          const perp = (vx * nx + vy * ny) * side;
          const along = Math.abs(vx * tx + vy * ty);
          if (perp < MINW || perp > MAXW || along > 1.5) continue;
          const d = Math.hypot(vx, vy);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          const mid = { x: (p.x + best.p.x) / 2, y: (p.y + best.p.y) / 2 };
          const a = Math.min(ri, best.ri);
          const b = Math.max(ri, best.ri);
          const k = `${a}_${b}`;
          let arr = laneAccum.get(k);
          if (!arr) laneAccum.set(k, (arr = []));
          arr.push(mid);
        }
      }
    })
  );
  let lanePolys: Pt[][] = [];
  for (const mids of laneAccum.values()) {
    if (mids.length < 4) continue;
    let mnx = Infinity,
      mny = Infinity,
      mxx = -Infinity,
      mxy = -Infinity;
    for (const m of mids) {
      if (m.x < mnx) mnx = m.x;
      if (m.y < mny) mny = m.y;
      if (m.x > mxx) mxx = m.x;
      if (m.y > mxy) mxy = m.y;
    }
    const horiz = mxx - mnx >= mxy - mny;
    mids.sort((p, q) => (horiz ? p.x - q.x : p.y - q.y));
    const out: Pt[] = [mids[0]];
    for (let i = 1; i < mids.length; i++) {
      if (dist(mids[i], out[out.length - 1]) > 1) out.push(mids[i]);
    }
    if (out.length >= 3 && polyLen(out) >= 10) lanePolys.push(out);
  }

  // 4. Merge collinear adjacent lane fragments end-to-end.
  let changed = true;
  let pass = 0;
  while (changed && pass < 6) {
    changed = false;
    pass++;
    const arr: (Pt[] | null)[] = lanePolys;
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i];
      if (!A) continue;
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const B = arr[j];
        if (!B) continue;
        if (dist(A[A.length - 1], B[0]) < 6) {
          const da = norm(A[A.length - 2], A[A.length - 1]);
          const db = norm(B[0], B[1]);
          if (da.x * db.x + da.y * db.y > 0.85) {
            arr[i] = A.concat(B.slice(1));
            arr[j] = null;
            changed = true;
          }
        }
      }
    }
    lanePolys = (lanePolys as (Pt[] | null)[]).filter(Boolean) as Pt[][];
  }

  // 5. Orient each lane in its travel direction using the lane arrows. Arrows
  //    are sparse along a lane (~every 20-30m) and offset from the centerline,
  //    so instead of each lane hunting for arrows we ASSIGN each arrow to its
  //    nearest lane sample point and let it vote on that lane's direction.
  const arrows: LaneArrow[] = drawing.laneArrows ?? [];
  // index lane sample points in a grid for nearest-lane queries. Arrows mark
  // lane centres but sit up to ~1.5 lane-widths from the extracted centerline,
  // so the match radius is generous; adjacent lanes in a carriageway share a
  // travel direction, so a slightly-wrong assignment still orients correctly.
  const ARROW_MATCH = 18;
  const PG = ARROW_MATCH;
  const pgk = (x: number, y: number) => `${Math.floor(x / PG)},${Math.floor(y / PG)}`;
  const pGrid = new Map<string, { li: number; idx: number; p: Pt }[]>();
  lanePolys.forEach((l, li) =>
    l.forEach((p, idx) => {
      const k = pgk(p.x, p.y);
      let arr = pGrid.get(k);
      if (!arr) pGrid.set(k, (arr = []));
      arr.push({ li, idx, p });
    })
  );
  const votes: { agree: number; against: number }[] = lanePolys.map(() => ({ agree: 0, against: 0 }));

  for (const a of arrows) {
    let bestLi = -1;
    let bestIdx = 0;
    let bd = ARROW_MATCH;
    const gx = Math.floor(a.x / PG);
    const gy = Math.floor(a.y / PG);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of pGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const d = Math.hypot(o.p.x - a.x, o.p.y - a.y);
          if (d < bd) {
            bd = d;
            bestLi = o.li;
            bestIdx = o.idx;
          }
        }
      }
    if (bestLi < 0) continue;
    const t = tan(lanePolys[bestLi], bestIdx);
    const dot = a.dx * t.tx + a.dy * t.ty;
    if (dot > 0.3) votes[bestLi].agree++;
    else if (dot < -0.3) votes[bestLi].against++;
  }
  const directedFlags: boolean[] = [];
  for (let li = 0; li < lanePolys.length; li++) {
    const v = votes[li];
    if (v.against > v.agree) lanePolys[li] = lanePolys[li].slice().reverse();
    directedFlags[li] = v.agree + v.against > 0;
  }

  // 5b. Propagate direction across the corridor. Arrows land on the main
  //     through lanes (~9% of fragments); flow their direction into nearby
  //     undirected lanes that run parallel within a lane-width (same corridor,
  //     same way). Build/refresh a grid of DIRECTED lane sample points with
  //     their heading; each pass, an undirected lane votes its orientation
  //     against the nearest directed points and is flipped/marked accordingly.
  //     Iterate to stable so direction spreads lane-by-lane across a carriage.
  const PROP_RADIUS = 5; // within ~1.4 lane-widths → same direction
  let propPass = 0;
  let propChanged = true;
  while (propChanged && propPass < 16) {
    propChanged = false;
    propPass++;
    const dGrid = new Map<string, { dir: Pt }[]>();
    const dgk = (x: number, y: number) =>
      `${Math.floor(x / PROP_RADIUS)},${Math.floor(y / PROP_RADIUS)}`;
    for (let li = 0; li < lanePolys.length; li++) {
      if (!directedFlags[li]) continue;
      const l = lanePolys[li];
      for (let i = 0; i < l.length; i++) {
        const t = tan(l, i);
        const k = dgk(l[i].x, l[i].y);
        let a = dGrid.get(k);
        if (!a) dGrid.set(k, (a = []));
        a.push({ dir: { x: t.tx, y: t.ty } });
      }
    }
    if (dGrid.size === 0) break;
    for (let li = 0; li < lanePolys.length; li++) {
      if (directedFlags[li]) continue;
      const l = lanePolys[li];
      let agree = 0;
      let against = 0;
      for (let i = 0; i < l.length; i += 2) {
        const t = tan(l, i);
        const gx = Math.floor(l[i].x / PROP_RADIUS);
        const gy = Math.floor(l[i].y / PROP_RADIUS);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            for (const e of dGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
              const dot = e.dir.x * t.tx + e.dir.y * t.ty;
              if (dot > 0.7) agree++;
              else if (dot < -0.7) against++;
            }
          }
      }
      if (agree + against < 3) continue; // need real support
      if (against > agree) lanePolys[li] = l.slice().reverse();
      directedFlags[li] = true;
      propChanged = true;
    }
  }

  // 6. Direction-split lane count: count parallel neighbours that travel the
  //    SAME way (heading dot > 0), so a 2+2 dual reads 2 per direction.
  const LGRID = 8;
  const lgk = (x: number, y: number) => `${Math.floor(x / LGRID)},${Math.floor(y / LGRID)}`;
  const lgrid = new Map<string, { li: number; p: Pt }[]>();
  lanePolys.forEach((l, li) =>
    l.forEach((p) => {
      const k = lgk(p.x, p.y);
      let a = lgrid.get(k);
      if (!a) lgrid.set(k, (a = []));
      a.push({ li, p });
    })
  );
  const lnear = (x: number, y: number) => {
    const out: { li: number; p: Pt }[] = [];
    const gx = Math.floor(x / LGRID);
    const gy = Math.floor(y / LGRID);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const a = lgrid.get(`${gx + dx},${gy + dy}`);
        if (a) for (const z of a) out.push(z);
      }
    return out;
  };
  const headingAt = (li: number, idx: number) => tan(lanePolys[li], idx);

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let laneKm = 0;
  let directedCount = 0;
  const lanes: Lane[] = lanePolys.map((l, li) => {
    const mi = Math.floor(l.length / 2);
    const p = l[mi];
    const t = tan(l, mi);
    const nx = -t.ty;
    const ny = t.tx;
    const seen = new Set<number>([li]);
    for (const o of lnear(p.x, p.y)) {
      if (seen.has(o.li)) continue;
      const vx = o.p.x - p.x;
      const vy = o.p.y - p.y;
      const perp = Math.abs(vx * nx + vy * ny);
      const along = Math.abs(vx * t.tx + vy * t.ty);
      if (along >= 3 || perp > 14) continue;
      // same direction only
      const oh = headingAt(o.li, Math.floor(lanePolys[o.li].length / 2));
      if (oh.tx * t.tx + oh.ty * t.ty <= 0.3) continue;
      seen.add(o.li);
    }
    const flat: number[] = [];
    for (const q of l) {
      flat.push(q.x, q.y);
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
    const length = polyLen(l);
    laneKm += length / 1000;
    if (directedFlags[li]) directedCount++;
    return {
      id: `lane${li}`,
      points: flat,
      laneCount: seen.size,
      length,
      directed: directedFlags[li],
      fromNode: -1,
      toNode: -1,
    };
  });

  // 7. Build graph nodes by clustering lane endpoints, then wire up the
  //    fromNode/toNode of each lane.
  const NODE_SNAP = 12; // world units; lane ends within this fuse to one node
  const nodes: LaneNode[] = [];
  const nGrid = new Map<string, number[]>();
  const ngk = (x: number, y: number) => `${Math.floor(x / NODE_SNAP)},${Math.floor(y / NODE_SNAP)}`;
  const findOrAddNode = (x: number, y: number): number => {
    const gx = Math.floor(x / NODE_SNAP);
    const gy = Math.floor(y / NODE_SNAP);
    let best = -1;
    let bd = NODE_SNAP;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of nGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const d = Math.hypot(nodes[id].x - x, nodes[id].y - y);
          if (d < bd) {
            bd = d;
            best = id;
          }
        }
      }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push({ id, x, y, incoming: [], outgoing: [] });
    const k = ngk(x, y);
    let arr = nGrid.get(k);
    if (!arr) nGrid.set(k, (arr = []));
    arr.push(id);
    return id;
  };
  lanes.forEach((lane, li) => {
    const p = lane.points;
    const from = findOrAddNode(p[0], p[1]);
    const to = findOrAddNode(p[p.length - 2], p[p.length - 1]);
    lane.fromNode = from;
    lane.toNode = to;
    nodes[from].outgoing.push(li);
    nodes[to].incoming.push(li);
  });

  // 8. Connectors: at every node with both incoming and outgoing lanes, join
  //    each incoming lane to each plausible outgoing lane (not a U-turn back
  //    down the same lane), classified by turn angle.
  const connectors: Connector[] = [];
  const turnOf = (deflDeg: number): Connector["turn"] => {
    if (deflDeg > 135) return "uturn";
    if (deflDeg > 30) return "left";
    if (deflDeg < -30) return "right";
    return "through";
  };
  let cid = 0;
  for (const node of nodes) {
    if (node.incoming.length === 0 || node.outgoing.length === 0) continue;
    for (const inLi of node.incoming) {
      const inPts = lanes[inLi].points;
      const ihx = inPts[inPts.length - 2] - inPts[inPts.length - 4];
      const ihy = inPts[inPts.length - 1] - inPts[inPts.length - 3];
      const ih = Math.hypot(ihx, ihy) || 1;
      for (const outLi of node.outgoing) {
        if (outLi === inLi) continue;
        const outPts = lanes[outLi].points;
        const ohx = outPts[2] - outPts[0];
        const ohy = outPts[3] - outPts[1];
        const oh = Math.hypot(ohx, ohy) || 1;
        // signed deflection (left positive)
        const cross = (ihx / ih) * (ohy / oh) - (ihy / ih) * (ohx / oh);
        const dot = (ihx / ih) * (ohx / oh) + (ihy / ih) * (ohy / oh);
        const defl = (Math.atan2(cross, dot) * 180) / Math.PI;
        // drop near-reversals that just go back where we came from
        if (Math.abs(defl) > 160) continue;
        const a = { x: inPts[inPts.length - 2], y: inPts[inPts.length - 1] };
        const b = { x: outPts[0], y: outPts[1] };
        connectors.push({
          id: `c${cid++}`,
          fromLane: inLi,
          toLane: outLi,
          node: node.id,
          turn: turnOf(defl),
          points: [a.x, a.y, b.x, b.y],
        });
      }
    }
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  const junctionCount = nodes.filter(
    (n) => n.incoming.length + n.outgoing.length >= 3
  ).length;

  return {
    lanes,
    nodes,
    connectors,
    bounds: { minX, minY, maxX, maxY },
    stats: {
      railCount: R.length,
      laneKm,
      directedPct: lanes.length ? (directedCount / lanes.length) * 100 : 0,
      junctionCount,
      connectorCount: connectors.length,
    },
  };
}
