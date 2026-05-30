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

import type { ParsedDrawing } from "@/lib/road-detect";

export interface Lane {
  id: string;
  /** Flat [x0, y0, x1, y1, ...] centerline in world coords. */
  points: number[];
  /** Local number of parallel lanes in this lane's corridor cross-section. */
  laneCount: number;
  /** Centerline length in drawing units. */
  length: number;
}

export interface LaneNetwork {
  lanes: Lane[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Diagnostics for the verification harness / status bar. */
  stats: { railCount: number; laneKm: number };
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
    return { lanes: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, stats: { railCount: 0, laneKm: 0 } };
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

  // 5. Local lane count per lane (parallel lanes within ~14m laterally).
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

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let laneKm = 0;
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
      if (along < 3 && perp <= 14) seen.add(o.li);
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
    return { id: `lane${li}`, points: flat, laneCount: seen.size, length };
  });

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    lanes,
    bounds: { minX, minY, maxX, maxY },
    stats: { railCount: R.length, laneKm },
  };
}
