// VISSIM-style network extraction from a CAD drawing.
//
// Data model — based on PTV VISSIM (researched against PTV online help +
// Oregon DOT App. 8B + Georgia DOT GDOT-RP-18-33 + PTV KB KA-05114):
//
//   * A Link is ONE-WAY. A dual carriageway is TWO Links (one per direction).
//   * numLanes is a constant Link attribute. A lane drop / add / turn pocket
//     REQUIRES splitting into two Links joined by a Connector.
//   * Geometry = a single centerline polyline per Link; lane positions are
//     derived by offset from the centerline using each lane's width.
//   * Junctions are IMPLICIT — there is no Node primitive in VISSIM. A
//     junction is the spatial cluster of Connectors at the meeting point.
//   * A Connector is a directional short link carrying its own polyline and
//     a (fromLane → toLane) mapping. It is mandatory for every link-to-link
//     join, including straight-through.
//
// Extraction pipeline:
//
//   (1) Arrow-led lane tracing (existing): chain edge + lane-divider rails,
//       trace each arrow into a lane centerline between two parallel rails.
//   (2) Supplementary rail-pair pass: fill un-arrowed gaps with undirected
//       traces (lane-width gated to 4.2 m to avoid medians).
//   (3) Smooth + 1 m resample; bridge fragments across kerb-free gaps.
//   (4) Reorient undirected lanes from their nearest directed neighbour so
//       every lane has a consistent travel direction.
//   (5) Carriageway grouping: union lanes that are same-direction parallel
//       within one lane-width of each other (strict — does NOT cross medians).
//   (6) For each carriageway, build a single averaged centerline and walk it
//       at fixed stations; count active member lanes per station; split into
//       one Link per uniform-numLanes section (so a 3→2 lane drop produces
//       two adjacent Links of 3 lanes and 2 lanes).
//   (7) Emit Connectors at every Link endpoint cluster (the implicit
//       junctions): for each incoming Link, emit through + best-left + best-
//       right per outgoing Link (channelised, U-turns dropped).

import type { ParsedDrawing, LaneArrow } from "@/lib/road-detect";

/** Default lane width when not derived from the CAD (matches VISSIM default). */
const DEFAULT_LANE_WIDTH = 3.5;
/** Maximum lanes per Link (clamp). */
const MAX_LANES_PER_LINK = 5;

export interface Link {
  id: string;
  /** Single centerline polyline [x0, y0, x1, y1, ...], oriented in travel direction. */
  points: number[];
  /** Constant number of lanes along this link (VISSIM Link attribute). */
  numLanes: number;
  /** Lane width in world units (per-lane in VISSIM, here constant per link). */
  laneWidth: number;
  /** Centerline length. */
  length: number;
  /** True if direction was confirmed by a CAD lane arrow (vs inferred). */
  directed: boolean;
  /** Indices into connectors[] that leave this link's downstream end. */
  toConnectors: number[];
  /** Indices into connectors[] that enter this link's upstream end. */
  fromConnectors: number[];
}

export interface Connector {
  id: string;
  fromLink: number; // index into links[]
  toLink: number; // index into links[]
  /** Lane index in fromLink (rightmost = 0). */
  fromLane: number;
  /** Lane index in toLink (rightmost = 0). */
  toLane: number;
  turn: "through" | "left" | "right" | "uturn";
  /** Bézier-tessellated geometry from fromLink end → toLink start. */
  points: number[];
}

export interface LaneNetwork {
  links: Link[];
  connectors: Connector[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  stats: {
    linkCount: number;
    connectorCount: number;
    /** sum of link.length * link.numLanes — total drivable lane-km. */
    laneKm: number;
    /** sum of link.length — total centerline length. */
    centerlineKm: number;
    /** Fraction of links with confirmed direction. */
    directedPct: number;
    /** Count of implicit junctions (spatial clusters of link endpoints). */
    junctionCount: number;
  };
}

export interface LaneNetworkOptions {
  isRailLayer?: (layer: string) => boolean;
}

type Pt = { x: number; y: number };

const DEFAULT_RAIL_LAYER = (layer: string): boolean => {
  const u = layer.toUpperCase();
  if (/(?:^|[_\-\s])(?:EXI|EXIST(?:ING)?|SURVEY|SURV)(?:[_\-\s]|$)|^EXI/.test(u)) return false;
  // Carriageway boundaries: outer kerbs (EDGE / KERB / EOP), intra-carriageway
  // lane dividers (LANE — but not the LANE0/LANE1 arrow blocks), AND the
  // SOLID PAINTED CENTERLINE that separates the two travel directions of a
  // two-way street. The WSP CAD encodes this last one on the NO_CR (no-
  // crossing) layer; including it as a rail means lanes traced on either side
  // never share their inner boundary, so the two directions of a two-way
  // street naturally come out as separate corridors.
  return /ROAD_EDGE|ROAD_LANE(?![01])|ROAD_NO_CR/.test(u)
    || /(?:^|[_\-\s])(?:EDGE|EOP|KERB|CURB|LANE|NO[_\-\s]?CR(?:OSS)?|CENTRELINE|CENTERLINE)(?:[_\-\s]|$)/.test(u);
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

  // --------- (1) Gather rail segments ---------
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
      links: [], connectors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      stats: { linkCount: 0, connectorCount: 0, laneKm: 0, centerlineKm: 0, directedPct: 0, junctionCount: 0 },
    };
  }

  // --------- (2) Chain rails: collinear continuation + 4 m gap bridge ---------
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

  // --------- (3) Sample rails at 0.5 m; index in a grid ---------
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

  const laneCenter = (p: Pt, hx: number, hy: number, nr: ReturnType<typeof nearestRails>) => {
    const STD_HALF = DEFAULT_LANE_WIDTH / 2;
    const nx = -hy, ny = hx;
    if (nr.left && nr.right) { const w = nr.left.dist + nr.right.dist; if (w < 2.0 || w > 7.5) return null; return { x: (nr.left.x + nr.right.x) / 2, y: (nr.left.y + nr.right.y) / 2 }; }
    if (nr.left) return { x: nr.left.x - nx * STD_HALF, y: nr.left.y - ny * STD_HALF };
    if (nr.right) return { x: nr.right.x + nx * STD_HALF, y: nr.right.y + ny * STD_HALF };
    return null;
  };

  // --------- (4) Trace one lane forward + backward from a seed ---------
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

  // --------- (5) Arrow-led primary pass ---------
  const arrows: LaneArrow[] = drawing.laneArrows ?? [];
  const primary: Pt[][] = [];
  for (const a of arrows) {
    const tr = traceFrom(a.x, a.y, a.dx, a.dy);
    if (tr.length >= 4) primary.push(tr);
  }

  // Dedupe (greedy length-desc; B dropped if >50% of B within 1.5 m of A).
  const dedupe = (traces: Pt[][], thresh = 0.5): Pt[][] => {
    const G = 3;
    const grid = new Map<string, { kt: number; p: Pt }[]>();
    const cell = (x: number, y: number) => `${Math.floor(x / G)},${Math.floor(y / G)}`;
    const order = traces.map((_, i) => i).sort((a, b) => polyLen(traces[b]) - polyLen(traces[a]));
    const dup = new Set<number>();
    for (const ti of order) {
      if (dup.has(ti)) continue;
      const T = traces[ti];
      const hitsByKt = new Map<number, number>();
      for (const q of T) {
        const gx = Math.floor(q.x / G), gy = Math.floor(q.y / G);
        const matched = new Set<number>();
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const arr = grid.get(`${gx + dx},${gy + dy}`);
          if (!arr) continue;
          for (const e of arr) {
            if (matched.has(e.kt)) continue;
            if (Math.hypot(e.p.x - q.x, e.p.y - q.y) < 1.5) matched.add(e.kt);
          }
        }
        for (const kt of matched) hitsByKt.set(kt, (hitsByKt.get(kt) ?? 0) + 1);
      }
      let isDup = false;
      for (const h of hitsByKt.values()) if (h / T.length > thresh) { isDup = true; break; }
      if (isDup) { dup.add(ti); continue; }
      for (const p of T) { const k = cell(p.x, p.y); let arr = grid.get(k); if (!arr) grid.set(k, (arr = [])); arr.push({ kt: ti, p }); }
    }
    return order.filter(i => !dup.has(i)).map(i => traces[i]);
  };
  const primaryLanes = dedupe(primary, 0.5);

  // --------- (6) Supplementary rail-pair gap-fill ---------
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
          // medians (4.5-6 m) excluded; travel lanes are 2.8-4.0 m
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

  // --------- (7) Bridge fragments across kerb-free gaps + smooth + resample ---------
  const tryBridge = (traces: Pt[][]): Pt[][] => {
    const G = 6;
    type EndIdx = { ti: number; end: 0 | 1; p: Pt };
    const grid = new Map<string, EndIdx[]>();
    const out = traces.slice();
    const addEnd = (e: EndIdx) => { const k = `${Math.floor(e.p.x / G)},${Math.floor(e.p.y / G)}`; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(e); };
    for (let i = 0; i < out.length; i++) { const t = out[i]; if (!t || t.length < 2) continue; addEnd({ ti: i, end: 0, p: t[0] }); addEnd({ ti: i, end: 1, p: t[t.length - 1] }); }
    const endingDir = (t: Pt[], end: 0 | 1): Pt => end === 1 ? norm(t[t.length - 2], t[t.length - 1]) : norm(t[1], t[0]);
    let merged = true; let pass = 0;
    while (merged && pass < 8) {
      merged = false; pass++;
      for (let i = 0; i < out.length; i++) {
        const A = out[i]; if (!A || A.length < 2) continue;
        for (const aEnd of [0, 1] as const) {
          const aP = A[aEnd === 0 ? 0 : A.length - 1];
          const aDir = endingDir(A, aEnd);
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
              const bContinuesAlong = e.end === 0 ? norm(B[0], B[1]) : norm(B[B.length - 1], B[B.length - 2]);
              const gapDx = e.p.x - aP.x, gapDy = e.p.y - aP.y;
              const gapLen = Math.hypot(gapDx, gapDy) || 1;
              const gapDir = { x: gapDx / gapLen, y: gapDy / gapLen };
              if (gapDir.x * aDir.x + gapDir.y * aDir.y < 0.85) continue;
              const bIn = { x: -bContinuesAlong.x, y: -bContinuesAlong.y };
              if (aDir.x * bIn.x + aDir.y * bIn.y < 0.92) continue;
              // gap must not cross a kerb (rail running ~⊥ to gap)
              let crosses = false;
              const stepN = Math.max(4, Math.ceil(gapLen * 2));
              for (let st = 1; st < stepN; st++) {
                const u = st / stepN;
                const ggx = aP.x + gapDx * u, ggy = aP.y + gapDy * u;
                for (const si of sNear(ggx, ggy)) {
                  const sm = samples[si];
                  const dd = Math.hypot(sm.x - ggx, sm.y - ggy);
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
          const B = out[best.ti]!;
          const Aend = aEnd === 1 ? A : A.slice().reverse();
          const Bstart = best.end === 0 ? B : B.slice().reverse();
          const mergedPoly = Aend.concat(Bstart);
          out[i] = mergedPoly;
          out[best.ti] = null as unknown as Pt[];
          addEnd({ ti: i, end: 0, p: mergedPoly[0] });
          addEnd({ ti: i, end: 1, p: mergedPoly[mergedPoly.length - 1] });
          merged = true;
          break;
        }
      }
    }
    return out.filter(t => t && t.length >= 2);
  };

  const smoothTrace = (t: Pt[]): Pt[] => {
    if (t.length < 5) return t;
    const sm: Pt[] = [t[0]];
    for (let i = 1; i < t.length - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(t.length - 1, i + 2); k++) { sx += t[k].x; sy += t[k].y; n++; }
      sm.push({ x: sx / n, y: sy / n });
    }
    sm.push(t[t.length - 1]);
    const out: Pt[] = [sm[0]];
    let acc = 0; const STEP = 1;
    for (let i = 1; i < sm.length; i++) {
      let a = out[out.length - 1], b = sm[i]; let d = dist(a, b);
      while (acc + d >= STEP) {
        const t2 = (STEP - acc) / d;
        const p = { x: a.x + (b.x - a.x) * t2, y: a.y + (b.y - a.y) * t2 };
        out.push(p); a = p; d = dist(a, b); acc = 0;
      }
      acc += d;
    }
    if (dist(out[out.length - 1], sm[sm.length - 1]) > 0.5) out.push(sm[sm.length - 1]);
    return out;
  };

  type LaneTrace = { trace: Pt[]; directed: boolean };
  const bridgedPrimary = tryBridge(primaryLanes);
  const bridgedSup = tryBridge(supLanes);
  const laneTraces: LaneTrace[] = [
    ...bridgedPrimary.map(t => ({ trace: smoothTrace(t), directed: true })),
    ...bridgedSup.map(t => ({ trace: smoothTrace(t), directed: false })),
  ];

  // --------- (8) Reorient undirected lanes — SAME-SIDE-OF-CENTERLINE ONLY ---------
  // Highway-engineer model: a TWO-WAY STREET has a painted centerline (not a
  // physical median); opposite-direction lanes sit ~3.5 m apart, ONE lane
  // width. A radius-based vote (the previous 12 m approach) captures both
  // directions and is ambiguous. To stay on the correct side of the
  // centerline, we only sample directed neighbours within ONE LANE WIDTH
  // perpendicular at each station — that captures siblings in the same
  // travel direction but excludes the opposing lane across the centerline.
  // We also require a STRONG MAJORITY (3:1 with min 4 votes) before flipping.
  {
    type DS = { dx: number; dy: number; p: Pt };
    const dirIdx: DS[] = [];
    laneTraces.forEach(L => {
      if (!L.directed) return;
      const p = L.trace;
      for (let i = 0; i < p.length; i++) {
        const d = norm(p[Math.max(0, i - 1)], p[Math.min(p.length - 1, i + 1)]);
        dirIdx.push({ dx: d.x, dy: d.y, p: p[i] });
      }
    });
    const RG = 4;
    const rgk = (x: number, y: number) => `${Math.floor(x / RG)},${Math.floor(y / RG)}`;
    const rGrid = new Map<string, DS[]>();
    for (const ds of dirIdx) { const k = rgk(ds.p.x, ds.p.y); let a = rGrid.get(k); if (!a) rGrid.set(k, (a = [])); a.push(ds); }
    const NEIGHBOUR_RADIUS = 8.0; // captures further-along same-side neighbours
    const PERP_LIMIT = 4.0;       // STAYS within one lane width perp → never
                                  // reaches the opposing lane across the painted
                                  // centerline (~7 m away).
    for (let li = 0; li < laneTraces.length; li++) {
      const L = laneTraces[li];
      if (L.directed) continue;
      const p = L.trace;
      let agree = 0, against = 0;
      for (let i = 0; i < p.length; i += 5) {
        const t = norm(p[Math.max(0, i - 1)], p[Math.min(p.length - 1, i + 1)]);
        const nxn = -t.y, nyn = t.x;
        const gx = Math.floor(p[i].x / RG), gy = Math.floor(p[i].y / RG);
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const arr = rGrid.get(`${gx + dx},${gy + dy}`); if (!arr) continue;
          for (const ds of arr) {
            const vx = ds.p.x - p[i].x, vy = ds.p.y - p[i].y;
            const d = Math.hypot(vx, vy);
            if (d > NEIGHBOUR_RADIUS) continue;
            // perpendicular component (signed) — discard if > one lane width
            const perp = Math.abs(vx * nxn + vy * nyn);
            if (perp > PERP_LIMIT) continue;
            const dot = ds.dx * t.x + ds.dy * t.y;
            if (dot > 0.7) agree++; else if (dot < -0.7) against++;
          }
        }
      }
      // 2:1 majority with min 3 votes. Still beats single-vote noise but
      // catches lanes whose only directed neighbours are on the same side.
      if (against >= 3 && against > agree * 2) laneTraces[li].trace = p.slice().reverse();
      else if (agree >= 3 && agree > against * 2) {
        // already oriented correctly — explicitly mark as directed so it
        // participates in carriageway grouping
        laneTraces[li].directed = true;
      }
    }
  }

  // --------- (9) Carriageway grouping (union-find, strict same-direction adjacent) ---------
  // Two lanes are in the same CARRIAGEWAY (= VISSIM Link container) only if:
  //   - same travel direction (heading dot > 0.85 at coincident cross-section)
  //   - perpendicular separation = one-lane-width range (2.0-5.0 m)
  //   - direction is unambiguous (median NEVER bridged because opposite lanes
  //     fail the heading-dot check)
  const N = laneTraces.length;
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  type LSamp = { li: number; p: Pt; t: Pt };
  const lSamples: LSamp[] = [];
  laneTraces.forEach((L, li) => {
    const p = L.trace; if (p.length < 2) return;
    let acc = 0;
    lSamples.push({ li, p: p[0], t: norm(p[0], p[1]) });
    for (let i = 1; i < p.length; i++) {
      acc += dist(p[i - 1], p[i]);
      if (acc >= 5 || i === p.length - 1) {
        const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
        lSamples.push({ li, p: p[i], t: norm(a, b) });
        acc = 0;
      }
    }
  });
  const LG = 8;
  const lgk = (x: number, y: number) => `${Math.floor(x / LG)},${Math.floor(y / LG)}`;
  const lGrid = new Map<string, number[]>();
  lSamples.forEach((s, i) => { const k = lgk(s.p.x, s.p.y); let a = lGrid.get(k); if (!a) lGrid.set(k, (a = [])); a.push(i); });
  for (let i = 0; i < lSamples.length; i++) {
    const A = lSamples[i];
    const gx = Math.floor(A.p.x / LG), gy = Math.floor(A.p.y / LG);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = lGrid.get(`${gx + dx},${gy + dy}`); if (!arr) continue;
      for (const j of arr) {
        if (j <= i) continue;
        const B = lSamples[j];
        if (A.li === B.li) continue;
        const par = A.t.x * B.t.x + A.t.y * B.t.y;
        if (par < 0.85) continue; // same-direction parallel (opposite-direction fails)
        const vx = B.p.x - A.p.x, vy = B.p.y - A.p.y;
        const along = Math.abs(vx * A.t.x + vy * A.t.y);
        const perp = Math.abs(vx * (-A.t.y) + vy * A.t.x);
        if (along > 3) continue;
        if (perp < 2.0 || perp > 5.0) continue; // adjacent same-direction lane width
        union(A.li, B.li);
      }
    }
  }
  const carriageways = new Map<number, number[]>();
  for (let i = 0; i < N; i++) { const r = find(i); let a = carriageways.get(r); if (!a) carriageways.set(r, (a = [])); a.push(i); }

  // --------- (10) For each carriageway, build averaged centerline + split by numLanes ---------
  const arcLen = (p: Pt[]): number[] => { const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1] + dist(p[i - 1], p[i])); return s; };
  const projectOnto = (p: Pt[], s: number[], q: Pt): number => {
    let bestS = 0, bestD = Infinity;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y; const segL2 = dx * dx + dy * dy; if (segL2 < 1e-9) continue;
      let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / segL2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const fx = a.x + dx * t, fy = a.y + dy * t;
      const d = Math.hypot(fx - q.x, fy - q.y);
      if (d < bestD) { bestD = d; bestS = s[i] + Math.sqrt(segL2) * t; }
    }
    return bestS;
  };

  type RawLink = { pts: Pt[]; numLanes: number; directed: boolean; corId: number };
  const rawLinks: RawLink[] = [];

  for (const memberSet of carriageways.values()) {
    let refLi = memberSet[0], refLen = polyLen(laneTraces[refLi].trace);
    for (const li of memberSet) { const L = polyLen(laneTraces[li].trace); if (L > refLen) { refLen = L; refLi = li; } }
    const ref = laneTraces[refLi].trace;
    const refS = arcLen(ref);

    type Span = { li: number; sA: number; sB: number; reversed: boolean };
    const spans: Span[] = [];
    for (const li of memberSet) {
      const p = laneTraces[li].trace;
      const sStart = projectOnto(ref, refS, p[0]);
      const sEnd = projectOnto(ref, refS, p[p.length - 1]);
      const reversed = sStart > sEnd;
      const sA = Math.min(sStart, sEnd), sB = Math.max(sStart, sEnd);
      if (sB - sA < 2) continue;
      spans.push({ li, sA, sB, reversed });
    }
    if (spans.length === 0) continue;

    const memberPointAt = (sp: Span, s: number): Pt | null => {
      if (s < sp.sA || s > sp.sB) return null;
      const u = (s - sp.sA) / Math.max(0.001, sp.sB - sp.sA);
      const p = laneTraces[sp.li].trace;
      const ms = arcLen(p);
      const m = sp.reversed ? (1 - u) : u;
      const sMember = m * ms[ms.length - 1];
      for (let i = 0; i < p.length - 1; i++) {
        if (sMember <= ms[i + 1]) {
          const t = (sMember - ms[i]) / Math.max(1e-9, ms[i + 1] - ms[i]);
          return { x: p[i].x + (p[i + 1].x - p[i].x) * t, y: p[i].y + (p[i + 1].y - p[i].y) * t };
        }
      }
      return p[p.length - 1];
    };

    const sMin = Math.min(...spans.map(s => s.sA));
    const sMax = Math.max(...spans.map(s => s.sB));
    const STATIONS: { s: number; cnt: number; cx: number; cy: number }[] = [];
    const STEP = 2;
    for (let s = sMin; s <= sMax; s += STEP) {
      const pts: Pt[] = [];
      for (const sp of spans) {
        const q = memberPointAt(sp, s);
        if (q) pts.push(q);
      }
      if (pts.length === 0) continue;
      let sx = 0, sy = 0; for (const q of pts) { sx += q.x; sy += q.y; }
      STATIONS.push({ s, cnt: pts.length, cx: sx / pts.length, cy: sy / pts.length });
    }
    if (STATIONS.length < 2) continue;

    // Split STATIONS into runs of constant cnt. Cap numLanes to MAX_LANES_PER_LINK.
    let segStart = 0;
    for (let i = 1; i <= STATIONS.length; i++) {
      const same = i < STATIONS.length && STATIONS[i].cnt === STATIONS[segStart].cnt;
      if (same) continue;
      const segPts: Pt[] = [];
      for (let k = segStart; k < i; k++) segPts.push({ x: STATIONS[k].cx, y: STATIONS[k].cy });
      if (segPts.length >= 2 && polyLen(segPts) >= 3) {
        const nl = Math.min(STATIONS[segStart].cnt, MAX_LANES_PER_LINK);
        // directed iff ANY member span is from a directed lane
        const directed = spans.some(sp => laneTraces[sp.li].directed);
        rawLinks.push({ pts: segPts, numLanes: nl, directed, corId: refLi });
      }
      segStart = i;
    }
  }

  // Consolidate consecutive same-numLanes raw links in the same carriageway.
  type Consol = { pts: Pt[]; numLanes: number; directed: boolean; corId: number };
  const byCor = new Map<number, RawLink[]>();
  for (const rl of rawLinks) { let a = byCor.get(rl.corId); if (!a) byCor.set(rl.corId, (a = [])); a.push(rl); }
  const consolidated: Consol[] = [];
  for (const arr of byCor.values()) {
    let cur: Consol | null = null;
    for (const rl of arr) {
      const fits = cur && cur.numLanes === rl.numLanes
        && dist({ x: cur.pts[cur.pts.length - 1].x, y: cur.pts[cur.pts.length - 1].y }, rl.pts[0]) < 5;
      if (cur && fits) {
        cur.pts = cur.pts.concat(rl.pts.slice(1));
        cur.directed = cur.directed || rl.directed;
      } else {
        if (cur) consolidated.push(cur);
        cur = { pts: rl.pts.slice(), numLanes: rl.numLanes, directed: rl.directed, corId: rl.corId };
      }
    }
    if (cur) consolidated.push(cur);
  }

  // Build Link[] from consolidated; bbox + dropping tiny ones
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let directedCount = 0;
  const links: Link[] = [];
  let linkId = 0;
  for (const c of consolidated) {
    if (c.pts.length < 2 || polyLen(c.pts) < 5) continue;
    const flat: number[] = [];
    for (const q of c.pts) {
      flat.push(q.x, q.y);
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
    if (c.directed) directedCount++;
    links.push({
      id: `link${linkId++}`,
      points: flat,
      numLanes: c.numLanes,
      laneWidth: DEFAULT_LANE_WIDTH,
      length: polyLen(c.pts),
      directed: c.directed,
      toConnectors: [],
      fromConnectors: [],
    });
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  // --------- (11) Implicit junctions + Connectors ---------
  // VISSIM has no Node primitive — a junction is the spatial cluster of
  // Connectors. We cluster Link endpoints; for each cluster emit a Connector
  // from each incoming Link to its through + best-left + best-right outgoing
  // Link, with a cubic Bézier whose tangents match the Link headings.
  const NODE_SNAP = 25;
  type EndKey = { linkId: number; end: 0 | 1; p: Pt };
  const ends: EndKey[] = [];
  links.forEach((l, li) => {
    ends.push({ linkId: li, end: 0, p: { x: l.points[0], y: l.points[1] } });
    ends.push({ linkId: li, end: 1, p: { x: l.points[l.points.length - 2], y: l.points[l.points.length - 1] } });
  });
  // cluster ends within NODE_SNAP via simple grid
  const cluster = ends.map((_, i) => i);
  const find2 = (a: number): number => { while (cluster[a] !== a) { cluster[a] = cluster[cluster[a]]; a = cluster[a]; } return a; };
  const union2 = (a: number, b: number) => { const ra = find2(a), rb = find2(b); if (ra !== rb) cluster[ra] = rb; };
  const eg2 = new Map<string, number[]>();
  ends.forEach((e, i) => { const k = `${Math.floor(e.p.x / NODE_SNAP)},${Math.floor(e.p.y / NODE_SNAP)}`; let a = eg2.get(k); if (!a) eg2.set(k, (a = [])); a.push(i); });
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i];
    const gx = Math.floor(e.p.x / NODE_SNAP), gy = Math.floor(e.p.y / NODE_SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = eg2.get(`${gx + dx},${gy + dy}`); if (!arr) continue;
      for (const j of arr) {
        if (j <= i) continue;
        const f = ends[j]; if (dist(e.p, f.p) > NODE_SNAP) continue;
        union2(i, j);
      }
    }
  }
  const clusters = new Map<number, EndKey[]>();
  ends.forEach((e, i) => { const r = find2(i); let a = clusters.get(r); if (!a) clusters.set(r, (a = [])); a.push(e); });

  const connectors: Connector[] = [];
  const turnOf = (d: number): Connector["turn"] => Math.abs(d) > 135 ? "uturn" : d > 30 ? "left" : d < -30 ? "right" : "through";
  const bezier = (a: Pt, ad: Pt, b: Pt, bd: Pt): number[] => {
    const h = dist(a, b) / 3;
    const c1x = a.x + ad.x * h, c1y = a.y + ad.y * h;
    const c2x = b.x - bd.x * h, c2y = b.y - bd.y * h;
    const out: number[] = []; const NN = 8;
    for (let i = 0; i <= NN; i++) {
      const u = i / NN, m = 1 - u;
      out.push(
        m * m * m * a.x + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * b.x,
        m * m * m * a.y + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * b.y,
      );
    }
    return out;
  };
  let cid = 0;
  for (const cl of clusters.values()) {
    if (cl.length < 2) continue;
    const incoming = cl.filter(e => e.end === 1); // link ends HERE = incoming
    const outgoing = cl.filter(e => e.end === 0); // link starts HERE = outgoing
    if (!incoming.length || !outgoing.length) continue;
    for (const inE of incoming) {
      const inL = links[inE.linkId];
      const ip = inL.points;
      const ihx = ip[ip.length - 2] - ip[ip.length - 4];
      const ihy = ip[ip.length - 1] - ip[ip.length - 3];
      const ihn = Math.hypot(ihx, ihy) || 1;
      const ih = { x: ihx / ihn, y: ihy / ihn };
      const cands: { liOut: number; turn: Connector["turn"]; defl: number; oh: Pt }[] = [];
      for (const outE of outgoing) {
        if (outE.linkId === inE.linkId) continue;
        const outL = links[outE.linkId];
        const op = outL.points;
        const ohx = op[2] - op[0]; const ohy = op[3] - op[1];
        const ohn = Math.hypot(ohx, ohy) || 1;
        const oh = { x: ohx / ohn, y: ohy / ohn };
        const cross = ih.x * oh.y - ih.y * oh.x;
        const dot = ih.x * oh.x + ih.y * oh.y;
        const defl = (Math.atan2(cross, dot) * 180) / Math.PI;
        if (Math.abs(defl) > 150) continue;
        cands.push({ liOut: outE.linkId, turn: turnOf(defl), defl, oh });
      }
      const chosen = cands.filter(c => c.turn === "through");
      const left = cands.filter(c => c.turn === "left").sort((p, q) => p.defl - q.defl)[0];
      const right = cands.filter(c => c.turn === "right").sort((p, q) => q.defl - p.defl)[0];
      if (left) chosen.push(left);
      if (right) chosen.push(right);
      const a = { x: ip[ip.length - 2], y: ip[ip.length - 1] };
      for (const c of chosen) {
        const op = links[c.liOut].points;
        const b = { x: op[0], y: op[1] };
        // map outermost source lane to outermost target lane (placeholder)
        const fromLane = Math.max(0, links[inE.linkId].numLanes - 1);
        const toLane = Math.max(0, links[c.liOut].numLanes - 1);
        const conIdx = connectors.length;
        connectors.push({
          id: `c${cid++}`,
          fromLink: inE.linkId,
          toLink: c.liOut,
          fromLane,
          toLane,
          turn: c.turn,
          points: bezier(a, ih, b, c.oh),
        });
        links[inE.linkId].toConnectors.push(conIdx);
        links[c.liOut].fromConnectors.push(conIdx);
      }
    }
  }

  // Junction count = clusters with ≥3 distinct links meeting.
  let junctionCount = 0;
  for (const cl of clusters.values()) {
    const linkIds = new Set(cl.map(e => e.linkId));
    if (linkIds.size >= 3) junctionCount++;
  }

  const centerlineKm = links.reduce((s, l) => s + l.length, 0) / 1000;
  const laneKm = links.reduce((s, l) => s + l.length * l.numLanes, 0) / 1000;
  const directedPct = links.length ? (directedCount / links.length) * 100 : 0;

  return {
    links,
    connectors,
    bounds: { minX, minY, maxX, maxY },
    stats: {
      linkCount: links.length,
      connectorCount: connectors.length,
      laneKm,
      centerlineKm,
      directedPct,
      junctionCount,
    },
  };
}
