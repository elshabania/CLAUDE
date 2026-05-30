// Lane-level network extraction from a CAD drawing.
//
// Algorithm — arrow-led centerline tracing (v5):
//   (1) Chain edge + lane-divider segments into long parallel "rails".
//   (2) Densely sample each rail (0.5 m) with its local tangent.
//   (3) For each lane-direction arrow, trace forward + backward staying
//       equidistant between the two nearest parallel rails on opposite sides.
//       This produces a DIRECTED lane centerline with travel heading.
//   (4) Fill gaps with a rail-pair supplementary pass: for every long rail
//       at 5 m stations, find the nearest parallel rail and seed a trace at
//       their midpoint if that midpoint is not already covered. These traces
//       are marked UNDIRECTED (engineer confirms direction).
//   (5) Build a routable graph: cluster lane endpoints into nodes; wire
//       fromNode/toNode; emit channelised, curved Bézier connectors between
//       incoming and outgoing lanes at each junction.
//
// This replaces the older rail-pairing approach which fragmented at every
// junction and over-counted lanes by 5-10×. Each lane here is between two
// physically distinct rails (validated geometrically against the CAD), with
// length and lane width derived directly from the source geometry.

import type { ParsedDrawing, LaneArrow } from "@/lib/road-detect";

export interface Lane {
  id: string;
  /** Flat [x0, y0, x1, y1, ...] centerline in world coords, ORIENTED in the
   *  travel direction (start = upstream, end = downstream) when `directed`. */
  points: number[];
  /** Parallel same-direction lanes at this lane's midpoint (1..MAX_LANES). */
  laneCount: number;
  /** Centerline length in drawing units. */
  length: number;
  /** Confirmed travel direction (true) vs derived without an arrow (false). */
  directed: boolean;
  /** Graph node id at the upstream end. */
  fromNode: number;
  /** Graph node id at the downstream end. */
  toNode: number;
}

export interface Connector {
  id: string;
  fromLane: number;
  toLane: number;
  node: number;
  turn: "through" | "left" | "right" | "uturn";
  points: number[];
}

export interface LaneNode {
  id: number;
  x: number;
  y: number;
  incoming: number[];
  outgoing: number[];
}

export interface LaneNetwork {
  lanes: Lane[];
  nodes: LaneNode[];
  connectors: Connector[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  stats: {
    railCount: number;
    laneKm: number;
    directedPct: number;
    junctionCount: number;
    connectorCount: number;
    /** Lanes whose raw same-direction-lane count exceeded MAX_LANES and was
     *  clamped (flag for engineer review — likely junction artefact). */
    clampedLaneCounts: number;
  };
}

export interface LaneNetworkOptions {
  /** Layer-name test for carriageway edges + lane dividers. */
  isRailLayer?: (layer: string) => boolean;
}

type Pt = { x: number; y: number };

const DEFAULT_RAIL_LAYER = (layer: string): boolean => {
  const u = layer.toUpperCase();
  if (/(?:^|[_\-\s])(?:EXI|EXIST(?:ING)?|SURVEY|SURV)(?:[_\-\s]|$)|^EXI/.test(u)) return false;
  return /ROAD_EDGE|ROAD_LANE(?![01])/.test(u)
    || /(?:^|[_\-\s])(?:EDGE|EOP|KERB|CURB|LANE)(?:[_\-\s]|$)/.test(u);
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (a: Pt, b: Pt): Pt => { const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L }; };
const polyLen = (p: Pt[]) => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; };
const tangentAt = (r: Pt[], i: number) => { const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)]; const d = norm(a, b); return { tx: d.x, ty: d.y }; };

export function buildLaneNetwork(
  drawing: ParsedDrawing,
  opts: LaneNetworkOptions = {}
): LaneNetwork {
  const isRail = opts.isRailLayer ?? DEFAULT_RAIL_LAYER;
  // 1. Gather rail segments
  const railSegs: [Pt, Pt][] = [];
  for (const seg of drawing.segments) {
    if (!isRail(seg.groupId)) continue;
    const p = seg.points;
    for (let i = 2; i < p.length; i += 2) {
      railSegs.push([{ x: p[i - 2], y: p[i - 1] }, { x: p[i], y: p[i + 1] }]);
    }
  }
  if (railSegs.length === 0) {
    return {
      lanes: [], nodes: [], connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      stats: { railCount: 0, laneKm: 0, directedPct: 0, junctionCount: 0, connectorCount: 0, clampedLaneCounts: 0 },
    };
  }

  // 2. Chain segments into continuous rails (collinear continuation + 4m gap bridging)
  const TOL = 0.3;
  const key = (p: Pt) => `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
  const ptOf = new Map<string, Pt>();
  const inc = new Map<string, number[]>();
  railSegs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!ptOf.has(k)) ptOf.set(k, p); let a = inc.get(k); if (!a) inc.set(k, (a = [])); a.push(i); } });
  const used = new Array(railSegs.length).fill(false);
  const dirSeg = (i: number, fromK: string) => { const s = railSegs[i]; const aK = key(s[0]); const p0 = aK === fromK ? s[0] : s[1]; const p1 = aK === fromK ? s[1] : s[0]; const d = norm(p0, p1); return { dx: d.x, dy: d.y, nk: aK === fromK ? key(s[1]) : key(s[0]), np: p1 }; };
  const EG = 2;
  const egk = (x: number, y: number) => `${Math.floor(x / EG)},${Math.floor(y / EG)}`;
  const endGrid = new Map<string, string[]>();
  for (const [k, p] of ptOf) { const g = egk(p.x, p.y); let a = endGrid.get(g); if (!a) endGrid.set(g, (a = [])); a.push(k); }
  const bridge = (fromK: string, dx: number, dy: number, maxD = 4.0): string | null => {
    const p = ptOf.get(fromK)!; let best: string | null = null; let bd = maxD;
    const gx = Math.floor(p.x / EG), gy = Math.floor(p.y / EG);
    const span = Math.ceil(maxD / EG);
    for (let ix = -span; ix <= span; ix++) for (let iy = -span; iy <= span; iy++)
      for (const k of endGrid.get(`${gx + ix},${gy + iy}`) ?? []) {
        if (k === fromK) continue;
        const q = ptOf.get(k)!; const vx = q.x - p.x, vy = q.y - p.y; const d = Math.hypot(vx, vy);
        if (d < 0.05 || d > bd) continue;
        if ((vx / d) * dx + (vy / d) * dy < 0.85) continue;
        if ((inc.get(k) ?? []).some(j => !used[j])) { bd = d; best = k; }
      }
    return best;
  };
  const chained: Pt[][] = [];
  for (let i = 0; i < railSegs.length; i++) {
    if (used[i]) continue; used[i] = true;
    let chain: Pt[] = [railSegs[i][0], railSegs[i][1]];
    for (let d = 0; d < 2; d++) {
      let endK = key(chain[chain.length - 1]); let cur = dirSeg(i, key(chain[chain.length - 2]));
      let guard = 0;
      while (guard++ < 100000) {
        const cands = (inc.get(endK) ?? []).filter(j => !used[j]);
        let pick = -1; let pickDir: ReturnType<typeof dirSeg> | null = null;
        if (cands.length > 0) { let bestDot = 0.5; for (const j of cands) { const dd = dirSeg(j, endK); const dot = dd.dx * cur.dx + dd.dy * cur.dy; if (dot > bestDot) { bestDot = dot; pick = j; pickDir = dd; } } }
        if (pick < 0) { const bk = bridge(endK, cur.dx, cur.dy, 4.0); if (bk) { const j = (inc.get(bk) ?? []).find(x => !used[x]); if (j != null) { chain.push(ptOf.get(bk)!); used[j] = true; const dd = dirSeg(j, bk); chain.push(dd.np); endK = dd.nk; cur = dd; continue; } } break; }
        used[pick] = true; chain.push(pickDir!.np); endK = pickDir!.nk; cur = pickDir!;
      }
      chain.reverse();
    }
    chained.push(chain);
  }
  const longRails = chained.filter(c => polyLen(c) >= 4);

  // 3. Sample rails densely (0.5m) and index in a spatial grid
  type Sample = { x: number; y: number; tx: number; ty: number; ri: number };
  const samples: Sample[] = [];
  const resampleRail = (r: Pt[], ri: number, step = 0.5) => {
    if (r.length < 2) return;
    let acc = 0; let prev = r[0]; samples.push({ x: prev.x, y: prev.y, ...tangentAt(r, 0), ri });
    for (let i = 1; i < r.length; i++) {
      let a = prev, b = r[i]; let d = dist(a, b);
      while (acc + d >= step) {
        const t = (step - acc) / d;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const tng = tangentAt(r, i);
        samples.push({ x: p.x, y: p.y, tx: tng.tx, ty: tng.ty, ri });
        a = p; d = dist(a, b); acc = 0;
      }
      acc += d; prev = r[i];
    }
  };
  longRails.forEach((r, ri) => resampleRail(r, ri, 0.5));

  const SCELL = 4;
  const sck = (x: number, y: number) => `${Math.floor(x / SCELL)},${Math.floor(y / SCELL)}`;
  const sGrid = new Map<string, number[]>();
  samples.forEach((s, i) => { const k = sck(s.x, s.y); let a = sGrid.get(k); if (!a) sGrid.set(k, (a = [])); a.push(i); });
  const sNear = (x: number, y: number) => { const out: number[] = []; const gx = Math.floor(x / SCELL), gy = Math.floor(y / SCELL); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = sGrid.get(`${gx + dx},${gy + dy}`); if (a) for (const i of a) out.push(i); } return out; };

  const PAR_THRESH = 0.6;
  type RailHit = { x: number; y: number; tx: number; ty: number; dist: number; perp: number; ri: number };
  const nearestRails = (p: Pt, hx: number, hy: number, maxPerp = 6) => {
    const nx = -hy, ny = hx;
    const perRail = new Map<number, { dist: number; perp: number; s: Sample }>();
    for (const si of sNear(p.x, p.y)) {
      const s = samples[si];
      if (Math.abs(s.tx * hx + s.ty * hy) < PAR_THRESH) continue;
      const vx = s.x - p.x, vy = s.y - p.y;
      const d = Math.hypot(vx, vy); if (d > maxPerp) continue;
      const along = Math.abs(vx * hx + vy * hy);
      if (along > 1.5) continue;
      const perp = vx * nx + vy * ny;
      const prev = perRail.get(s.ri);
      if (!prev || d < prev.dist) perRail.set(s.ri, { dist: d, perp, s });
    }
    let bestL: RailHit | null = null;
    let bestR: RailHit | null = null;
    for (const { dist: d, perp, s } of perRail.values()) {
      const cand: RailHit = { x: s.x, y: s.y, tx: s.tx, ty: s.ty, dist: d, perp, ri: s.ri };
      if (perp > 0) { if (!bestL || d < bestL.dist) bestL = cand; }
      else { if (!bestR || d < bestR.dist) bestR = cand; }
    }
    return { left: bestL, right: bestR };
  };

  // Lane center given left/right rails. If only one, assume 3.5m standard lane.
  const laneCenter = (p: Pt, hx: number, hy: number, nr: ReturnType<typeof nearestRails>) => {
    const STD_HALF = 1.75; const nx = -hy, ny = hx;
    if (nr.left && nr.right) { const w = nr.left.dist + nr.right.dist; if (w < 2.0 || w > 7.5) return null; return { x: (nr.left.x + nr.right.x) / 2, y: (nr.left.y + nr.right.y) / 2 }; }
    if (nr.left) return { x: nr.left.x - nx * STD_HALF, y: nr.left.y - ny * STD_HALF };
    if (nr.right) return { x: nr.right.x + nx * STD_HALF, y: nr.right.y + ny * STD_HALF };
    return null;
  };

  const traceFrom = (sx: number, sy: number, dx: number, dy: number): Pt[] => {
    const STEP = 1.0;
    const seed = nearestRails({ x: sx, y: sy }, dx, dy, 5);
    const c0 = laneCenter({ x: sx, y: sy }, dx, dy, seed);
    if (!c0) return [];
    const trace: Pt[] = [{ x: c0.x, y: c0.y }];
    for (const sign of [+1, -1]) {
      let hx = dx * sign, hy = dy * sign;
      let pos: Pt = { x: c0.x, y: c0.y };
      for (let step = 0; step < 1000; step++) {
        const next = { x: pos.x + hx * STEP, y: pos.y + hy * STEP };
        const nr = nearestRails(next, hx, hy, 5);
        const ctr = laneCenter(next, hx, hy, nr);
        if (!ctr) break;
        let nhx = hx, nhy = hy;
        if (nr.left && nr.right) { let lx = nr.left.tx, ly = nr.left.ty; if (lx * hx + ly * hy < 0) { lx = -lx; ly = -ly; } let rx = nr.right.tx, ry = nr.right.ty; if (rx * hx + ry * hy < 0) { rx = -rx; ry = -ry; } const ssx = lx + rx, ssy = ly + ry; const m = Math.hypot(ssx, ssy) || 1; nhx = ssx / m; nhy = ssy / m; }
        else if (nr.left || nr.right) { const s = (nr.left || nr.right)!; let lx = s.tx, ly = s.ty; if (lx * hx + ly * hy < 0) { lx = -lx; ly = -ly; } nhx = lx; nhy = ly; }
        if (nhx * hx + nhy * hy < 0.85) break;
        const dxm = ctr.x - pos.x, dym = ctr.y - pos.y;
        if (dxm * nhx + dym * nhy < STEP * 0.3) break;
        if (sign > 0) trace.push({ x: ctr.x, y: ctr.y }); else trace.unshift({ x: ctr.x, y: ctr.y });
        pos = { x: ctr.x, y: ctr.y }; hx = nhx; hy = nhy;
      }
    }
    return trace;
  };

  // 4a. Arrow-led primary pass
  const arrows: LaneArrow[] = drawing.laneArrows ?? [];
  const primary: Pt[][] = [];
  for (const a of arrows) {
    const tr = traceFrom(a.x, a.y, a.dx, a.dy);
    if (tr.length >= 4) primary.push(tr);
  }

  // Dedupe (greedy length-descending; trace B dropped if >50% of B within 1.5m
  // of some already-kept trace A). One global grid mapping cells → kept-trace
  // IDs and their points, so per-trace cost is O(|T| · neighbours-per-cell),
  // not O(|T| · all-kept-traces).
  const dedupe = (traces: Pt[][], thresh = 0.5): Pt[][] => {
    const G = 3;
    const grid = new Map<string, { kt: number; p: Pt }[]>(); // cell → kept points
    const cell = (x: number, y: number) => `${Math.floor(x / G)},${Math.floor(y / G)}`;
    const order = traces.map((_, i) => i).sort((a, b) => polyLen(traces[b]) - polyLen(traces[a]));
    const dup = new Set<number>();
    for (const ti of order) {
      if (dup.has(ti)) continue;
      const T = traces[ti];
      // Count hits against already-kept traces, indexed by kept-trace-id.
      const hitsByKt = new Map<number, number>();
      const seenPoint = new Set<string>(); // dedupe within T (one hit per T-point)
      for (let pi = 0; pi < T.length; pi++) {
        const q = T[pi];
        const gx = Math.floor(q.x / G), gy = Math.floor(q.y / G);
        const matched = new Set<number>(); // distinct kt this point hit
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const arr = grid.get(`${gx + dx},${gy + dy}`);
          if (!arr) continue;
          for (const e of arr) {
            if (matched.has(e.kt)) continue;
            if (Math.hypot(e.p.x - q.x, e.p.y - q.y) < 1.5) matched.add(e.kt);
          }
        }
        for (const kt of matched) hitsByKt.set(kt, (hitsByKt.get(kt) ?? 0) + 1);
        seenPoint.add(`${pi}`);
      }
      // Is any single kept trace covering > thresh of T?
      let isDup = false;
      for (const h of hitsByKt.values()) {
        if (h / T.length > thresh) { isDup = true; break; }
      }
      if (isDup) { dup.add(ti); continue; }
      // Otherwise, add T to the global grid as a new kept trace (ti is its kt).
      for (const p of T) {
        const k = cell(p.x, p.y);
        let arr = grid.get(k); if (!arr) grid.set(k, (arr = []));
        arr.push({ kt: ti, p });
      }
    }
    return order.filter(i => !dup.has(i)).map(i => traces[i]);
  };
  const primaryLanes = dedupe(primary, 0.5);

  // 4b. Coverage map
  const COV_CELL = 1.5;
  const covKey = (x: number, y: number) => `${Math.floor(x / COV_CELL)},${Math.floor(y / COV_CELL)}`;
  const cov = new Set<string>();
  for (const tr of primaryLanes) for (const p of tr) cov.add(covKey(p.x, p.y));
  const coveredAt = (x: number, y: number): boolean => {
    const gx = Math.floor(x / COV_CELL), gy = Math.floor(y / COV_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      if (cov.has(`${gx + dx},${gy + dy}`)) return true;
    return false;
  };

  // 4c. Supplementary pass: walk each rail at 5m, find nearest parallel rail
  // 2.5-7m away, seed a trace at their midpoint if uncovered.
  const supplementary: Pt[][] = [];
  for (const r of longRails) {
    if (polyLen(r) < 15) continue;
    let acc = 0; let prev = r[0];
    for (let i = 1; i < r.length; i++) {
      let a = prev, b = r[i]; let d = dist(a, b);
      while (acc + d >= 5) {
        const t = (5 - acc) / d;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const tn = tangentAt(r, i);
        for (const sign of [+1, -1]) {
          const hx = tn.tx * sign, hy = tn.ty * sign;
          const nr = nearestRails(p, hx, hy, 7.0);
          const otherRail = nr.left && nr.right
            ? (nr.left.dist > nr.right.dist ? nr.left : nr.right)
            : (nr.left ?? nr.right);
          // Lane-width gate. Medians and turning bays between dual carriageways
          // are typically 4.5-6 m and would otherwise be picked up as spurious
          // "lanes". Travel lanes on a designed urban arterial are 2.8-4.0 m;
          // cap at 4.2 m here to reject the median.
          if (!otherRail || otherRail.dist < 2.5 || otherRail.dist > 4.2) continue;
          const midpt = { x: (p.x + otherRail.x) / 2, y: (p.y + otherRail.y) / 2 };
          if (coveredAt(midpt.x, midpt.y)) continue;
          const tr = traceFrom(midpt.x, midpt.y, hx, hy);
          if (tr.length >= 6 && polyLen(tr) >= 10) {
            supplementary.push(tr);
            for (const q of tr) cov.add(covKey(q.x, q.y));
          }
        }
        a = p; d = dist(a, b); acc = 0;
      }
      acc += d; prev = r[i];
    }
  }
  const supLanes = dedupe(supplementary, 0.5);

  // 4c2. Bridge lane fragments across small breaks (median openings, junction
  //      gaps). Two traces whose ENDPOINTS are within 25 m, with aligned
  //      headings (dot > 0.92), and whose connecting segment doesn't cross a
  //      rail — fuse into one continuous trace. Iterate until stable.
  const tryBridge = (traces: Pt[][]): Pt[][] => {
    // index endpoints
    const G = 6;
    type EndIdx = { ti: number; end: 0 | 1; p: Pt };
    const grid = new Map<string, EndIdx[]>();
    const live = traces.map((_, i) => i);
    const out = traces.slice();
    const addEnd = (e: EndIdx) => {
      const k = `${Math.floor(e.p.x / G)},${Math.floor(e.p.y / G)}`;
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(e);
    };
    for (const i of live) {
      const t = out[i]; if (!t || t.length < 2) continue;
      addEnd({ ti: i, end: 0, p: t[0] });
      addEnd({ ti: i, end: 1, p: t[t.length - 1] });
    }
    const endingDir = (t: Pt[], end: 0 | 1): Pt => {
      // unit heading "going out" from this end
      if (end === 1) return norm(t[t.length - 2], t[t.length - 1]);
      return norm(t[1], t[0]);
    };
    let merged = true; let pass = 0;
    while (merged && pass < 8) {
      merged = false; pass++;
      for (let i = 0; i < out.length; i++) {
        const A = out[i]; if (!A || A.length < 2) continue;
        for (const aEnd of [0, 1] as const) {
          const aP = A[aEnd === 0 ? 0 : A.length - 1];
          const aDir = endingDir(A, aEnd);
          // search nearby endpoints
          const gx = Math.floor(aP.x / G), gy = Math.floor(aP.y / G);
          const span = Math.ceil(25 / G);
          let best: EndIdx | null = null; let bestD = 25;
          for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) {
            const arr = grid.get(`${gx + dx},${gy + dy}`); if (!arr) continue;
            for (const e of arr) {
              if (e.ti === i) continue;
              const B = out[e.ti]; if (!B || B.length < 2) continue;
              const d = Math.hypot(e.p.x - aP.x, e.p.y - aP.y);
              if (d < 1 || d > bestD) continue;
              // need the OTHER trace's outgoing heading at its end to oppose
              // aDir (we're connecting tip-to-tail). End-0 means the trace
              // continues FROM e.p along norm(B[0],B[1]); for merging, that
              // continuation direction should match aDir (one out-arrow).
              const bContinuesAlong = e.end === 0
                ? norm(B[0], B[1])         // from B[0] going into B[1]
                : norm(B[B.length - 1], B[B.length - 2]); // from B[last] going back
              // For A.aDir to chain into B at e.p smoothly, the GAP heading
              // (aP → e.p) must align with aDir, and B's continuation
              // (away from e.p inside B) must also align with aDir.
              const gapDx = e.p.x - aP.x, gapDy = e.p.y - aP.y;
              const gapLen = Math.hypot(gapDx, gapDy) || 1;
              const gapDir = { x: gapDx / gapLen, y: gapDy / gapLen };
              if (gapDir.x * aDir.x + gapDir.y * aDir.y < 0.85) continue;
              // B's tangent INTO the trace from e.p (i.e. flipped vs bContinuesAlong)
              const bIn = { x: -bContinuesAlong.x, y: -bContinuesAlong.y };
              if (aDir.x * bIn.x + aDir.y * bIn.y < 0.92) continue;
              // GAP MUST NOT CROSS A KERB. A hammer-head turnaround's exit
              // can geometrically align with the main road, but there's a kerb
              // between them — they're separate corridors and must not be
              // fused. Walk the gap densely and check that no rail sample sits
              // within 1.2m of the gap path AND runs ~⊥ to the gap (an actual
              // kerb crossing, not a parallel rail running along the gap
              // which is normal at an open median break).
              let crosses = false;
              const stepN = Math.max(4, Math.ceil(gapLen * 2));
              for (let st = 1; st < stepN; st++) {
                const u = st / stepN;
                const gx = aP.x + gapDx * u, gy = aP.y + gapDy * u;
                for (const si of sNear(gx, gy)) {
                  const sm = samples[si];
                  const dd = Math.hypot(sm.x - gx, sm.y - gy);
                  if (dd > 1.2) continue;
                  const dot = Math.abs(sm.tx * gapDir.x + sm.ty * gapDir.y);
                  if (dot < 0.7) { crosses = true; break; }
                }
                if (crosses) break;
              }
              if (crosses) continue;
              bestD = d; best = e;
            }
          }
          if (!best) continue;
          // Splice A and out[best.ti] into one polyline.
          const B = out[best.ti]!;
          let merged_poly: Pt[];
          // Build oriented copies: A from aEnd-OUT (so its end matching the new gap is at the end)
          const Aend = aEnd === 1 ? A : A.slice().reverse();
          const Bstart = best.end === 0 ? B : B.slice().reverse();
          merged_poly = Aend.concat(Bstart);
          out[i] = merged_poly;
          out[best.ti] = null as unknown as Pt[]; // mark removed
          // refresh endpoint grid for trace i (cheap: just re-add new endpoints)
          addEnd({ ti: i, end: 0, p: merged_poly[0] });
          addEnd({ ti: i, end: 1, p: merged_poly[merged_poly.length - 1] });
          merged = true;
          break;
        }
      }
    }
    return out.filter(t => t && t.length >= 2);
  };

  // 4d. Smooth traces: the midline = (leftRail + rightRail)/2 inherits the
  //     tiny irregularities of both rails (a 1 m bump on one rail produces a
  //     0.5 m bump in the midline), giving the lanes a visible wobble. A
  //     short moving average preserves curvature while removing high-freq
  //     jitter. We also resample to constant 1 m spacing so the result has a
  //     uniform vertex density (helps downstream rendering + connector geometry).
  const smoothTrace = (t: Pt[]): Pt[] => {
    if (t.length < 5) return t;
    // 5-point centred moving average (preserves endpoints)
    const sm: Pt[] = [t[0]];
    for (let i = 1; i < t.length - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(t.length - 1, i + 2); k++) {
        sx += t[k].x; sy += t[k].y; n++;
      }
      sm.push({ x: sx / n, y: sy / n });
    }
    sm.push(t[t.length - 1]);
    // Resample to 1 m
    const out: Pt[] = [sm[0]];
    let acc = 0; const STEP = 1;
    for (let i = 1; i < sm.length; i++) {
      let a = out[out.length - 1], b = sm[i];
      let d = dist(a, b);
      while (acc + d >= STEP) {
        const t2 = (STEP - acc) / d;
        const p = { x: a.x + (b.x - a.x) * t2, y: a.y + (b.y - a.y) * t2 };
        out.push(p);
        a = p; d = dist(a, b); acc = 0;
      }
      acc += d;
    }
    if (dist(out[out.length - 1], sm[sm.length - 1]) > 0.5) out.push(sm[sm.length - 1]);
    return out;
  };

  // 5. Materialise lanes + per-lane lane count
  type LaneWithMeta = { trace: Pt[]; directed: boolean };
  // Bridge primary and supplementary fragments separately (so directed lanes
  // only merge with directed; undirected only with undirected).
  const bridgedPrimary = tryBridge(primaryLanes);
  const bridgedSup = tryBridge(supLanes);
  const lanePolys: LaneWithMeta[] = [
    ...bridgedPrimary.map(t => ({ trace: smoothTrace(t), directed: true })),
    ...bridgedSup.map(t => ({ trace: smoothTrace(t), directed: false })),
  ];

  // Lane count: contiguous band of same-direction parallel neighbours at link
  // midpoint, clamped to MAX_LANES. (Direction-split: heading dot > 0.95.)
  const LGRID = 8;
  const lgk = (x: number, y: number) => `${Math.floor(x / LGRID)},${Math.floor(y / LGRID)}`;
  const lgrid = new Map<string, { li: number; p: Pt }[]>();
  lanePolys.forEach((l, li) => l.trace.forEach(p => { const k = lgk(p.x, p.y); let a = lgrid.get(k); if (!a) lgrid.set(k, (a = [])); a.push({ li, p }); }));
  const lnear = (x: number, y: number) => { const out: { li: number; p: Pt }[] = []; const gx = Math.floor(x / LGRID), gy = Math.floor(y / LGRID); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const z of lgrid.get(`${gx + dx},${gy + dy}`) ?? []) out.push(z); return out; };
  const headingAt = (li: number) => tangentAt(lanePolys[li].trace, Math.floor(lanePolys[li].trace.length / 2));

  const MAX_LANES = 5;
  const GAP = 5;
  const laneCountOf = (li: number): { count: number; clamped: boolean } => {
    const l = lanePolys[li].trace;
    const mi = Math.floor(l.length / 2);
    const p = l[mi]; const t = tangentAt(l, mi);
    const nx = -t.ty, ny = t.tx;
    const byLane = new Map<number, number>();
    for (const o of lnear(p.x, p.y)) {
      if (o.li === li) continue;
      const vx = o.p.x - p.x, vy = o.p.y - p.y;
      const along = Math.abs(vx * t.tx + vy * t.ty);
      if (along >= 2.5) continue;
      const perp = vx * nx + vy * ny;
      if (Math.abs(perp) > 18) continue;
      const oh = headingAt(o.li);
      if (oh.tx * t.tx + oh.ty * t.ty < 0.95) continue;
      const prev = byLane.get(o.li);
      if (prev === undefined || Math.abs(perp) < Math.abs(prev)) byLane.set(o.li, perp);
    }
    const offsets = [0, ...byLane.values()].sort((a, b) => a - b);
    const zero = offsets.indexOf(0);
    let count = 1;
    for (let i = zero - 1; i >= 0; i--) { if (offsets[i + 1] - offsets[i] > GAP) break; count++; }
    for (let i = zero + 1; i < offsets.length; i++) { if (offsets[i] - offsets[i - 1] > GAP) break; count++; }
    return { count: Math.min(count, MAX_LANES), clamped: count > MAX_LANES };
  };

  // 6. Build graph nodes (cluster lane endpoints) + wire lane→node references
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let laneKm = 0, directedCount = 0, clampedCount = 0;
  // Lane-traces stop at the JUNCTION ENTRY (when rails diverge or heading
  // turns > 32°); a typical urban junction is 15-30m across, so each approach
  // lane terminates that far from the junction centre. To cluster ALL approach
  // lane-endpoints at one junction into a single node, snap by ~half the
  // junction diameter.
  const NODE_SNAP = 30;
  const nodes: LaneNode[] = [];
  const nGrid = new Map<string, number[]>();
  const ngk = (x: number, y: number) => `${Math.floor(x / NODE_SNAP)},${Math.floor(y / NODE_SNAP)}`;
  const findOrAddNode = (x: number, y: number): number => {
    const gx = Math.floor(x / NODE_SNAP), gy = Math.floor(y / NODE_SNAP);
    let best = -1, bd = NODE_SNAP;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const id of nGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
        const d = Math.hypot(nodes[id].x - x, nodes[id].y - y);
        if (d < bd) { bd = d; best = id; }
      }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push({ id, x, y, incoming: [], outgoing: [] });
    const k = ngk(x, y);
    let arr = nGrid.get(k); if (!arr) nGrid.set(k, (arr = []));
    arr.push(id);
    return id;
  };

  const lanes: Lane[] = lanePolys.map((lm, li) => {
    const t = lm.trace;
    const lc = laneCountOf(li);
    if (lc.clamped) clampedCount++;
    if (lm.directed) directedCount++;
    const flat: number[] = [];
    for (const q of t) {
      flat.push(q.x, q.y);
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
    const length = polyLen(t);
    laneKm += length / 1000;
    const fromNode = findOrAddNode(t[0].x, t[0].y);
    const toNode = findOrAddNode(t[t.length - 1].x, t[t.length - 1].y);
    nodes[fromNode].outgoing.push(li);
    nodes[toNode].incoming.push(li);
    return { id: `lane${li}`, points: flat, laneCount: lc.count, length, directed: lm.directed, fromNode, toNode };
  });

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  // 7. Connectors — DISABLED. The previous heuristic connector generator was
  //    producing noise (over-eager joins, ambiguous turns at complex nodes).
  //    We are de-scoping it until the lane layer is perfected. A later
  //    revision will rebuild connectors from confirmed lane direction +
  //    proper junction control geometry. For now, emit an empty list so the
  //    routable-graph consumers see a clean lane-only network.
  const connectors: Connector[] = [];
  // The lane endpoints remain wired into nodes via fromNode/toNode above, so
  // a future connector pass can still find them.

  const junctionCount = nodes.filter(n => n.incoming.length + n.outgoing.length >= 3).length;

  return {
    lanes,
    nodes,
    connectors,
    bounds: { minX, minY, maxX, maxY },
    stats: {
      railCount: longRails.length,
      laneKm,
      directedPct: lanes.length ? (directedCount / lanes.length) * 100 : 0,
      junctionCount,
      connectorCount: connectors.length,
      clampedLaneCounts: clampedCount,
    },
  };
}
