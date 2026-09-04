// Graph construction: carriageway strips -> a proper node/link network.
//
// The strip extractor (lane-network.ts) yields hundreds of short carriageway
// fragments: the parallel-edge pairing breaks at every kerb radius, driveway
// mouth, marking gap and arrow block. Naively clustering fragment endpoints
// produces a "network" of 1,200 links averaging 29 m, most "junctions" being
// artefacts where both sides of a dual carriageway happen to break at the
// same station. This module turns the fragments into the graph a TIS needs:
//
//   A. CHAIN  - join fragments that geometrically continue each other
//               (collinear, small lateral offset, compatible travel
//               direction) across gaps of up to JOIN_GAP, producing
//               corridors. A corridor is split into links only where its lane
//               count genuinely changes (runs shorter than MIN_RUN are noise).
//   B. T-SPLIT - a side road ends at the major road's kerb; split the major
//               corridor there. Only PERPENDICULAR approaches count - a
//               corridor ending beside a parallel neighbour is a gap, not a
//               junction.
//   C. CONSOLIDATE - at every junction, any corridor passing through the
//               junction box without a node (the far carriageway of a dual
//               road at a T-junction) is split so all approaches meet at one
//               node.
//   D. NODES  - single-linkage clustering of corridor ends within NODE_SNAP
//               gives one node per junction; ends are snapped to it.
//   E. CLEAN  - kerb-radius stubs, dust components and needless degree-2
//               nodes (same lanes, same direction) are removed.
//
// All thresholds are in drawing units (metres for the WSP plan).

import type { Link, LaneNode } from "@/lib/lane-network";

type Pt = { x: number; y: number };

export interface Strip {
  mids: Pt[];
  width: number;
  numLanes: number;
  oneWay: boolean;
  arrowCount: number;
  dividerCount: number;
}

export interface GraphResult {
  links: Link[];
  nodes: LaneNode[];
}

/** Max gap bridged between two fragments of the same corridor. Gaps beyond
 *  JOIN_GAP_NEAR (a wide junction box) need a tighter alignment. */
const JOIN_GAP = 60;
const JOIN_GAP_NEAR = 35;
/** Max lateral offset for a fragment to count as a continuation. */
const LAT_TOL = 5;
const LAT_TOL_FAR = 3;
/** Dangling approach: how far to cast a ray along its heading for a corridor to join. */
const RAY_LEN = 75;
/** Lateral half-width of that ray. */
const RAY_HALF = 8;
/** Lane-count runs shorter than this inside a corridor are absorbed. */
const MIN_RUN = 40;
/** Side-road endpoint to major-corridor interior attach distance. */
const T_TOL = 25;
/** Never split a corridor within this distance of its own ends. */
const END_EXCLUDE = 15;
/** Junction-box radius: corridors passing within this of a junction are split. */
const JUNCTION_R = 30;
/** Corridor ends within this (single-linkage) form one node. */
const NODE_SNAP = 40;
/** A junction node may not span more than this (bounding diagonal). */
const MAX_JUNCTION_DIAM = 110;
/** Dangling links shorter than this hanging off a junction are kerb-radius stubs. */
const STUB_LEN = 30;

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
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Outward unit tangent at a polyline end (pointing away from the line). */
function endTangent(m: Pt[], end: 0 | 1): Pt {
  const n = m.length;
  const k = Math.min(n - 1, 6);
  return end === 0 ? norm(m[k], m[0]) : norm(m[n - 1 - k], m[n - 1]);
}

class Grid<T> {
  private cells = new Map<string, T[]>();
  constructor(private cell: number) {}
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  add(x: number, y: number, v: T) {
    const k = this.key(x, y);
    let a = this.cells.get(k);
    if (!a) this.cells.set(k, (a = []));
    a.push(v);
  }
  near(x: number, y: number, out: T[] = []): T[] {
    const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const a = this.cells.get(`${gx + dx},${gy + dy}`);
        if (a) for (const v of a) out.push(v);
      }
    return out;
  }
}

/** Internal working link (before node ids are assigned). */
interface WLink {
  mids: Pt[];
  width: number;
  numLanes: number;
  oneWay: boolean;
  arrowCount: number;
  dividerCount: number;
  /** Set by the T-split / consolidation stages: this end is a junction. */
  junctionEnd: [boolean, boolean];
}

// ===========================================================================
// A. Chain fragments into corridors
// ===========================================================================
function chainStrips(strips: Strip[]): WLink[] {
  type End = { si: number; end: 0 | 1; p: Pt; t: Pt };
  const ends: End[] = [];
  strips.forEach((s, si) => {
    ends.push({ si, end: 0, p: s.mids[0], t: endTangent(s.mids, 0) });
    ends.push({ si, end: 1, p: s.mids[s.mids.length - 1], t: endTangent(s.mids, 1) });
  });
  const grid = new Grid<number>(JOIN_GAP);
  ends.forEach((e, i) => grid.add(e.p.x, e.p.y, i));

  type Cand = { i: number; j: number; score: number };
  const cands: Cand[] = [];
  const scratch: number[] = [];
  for (let i = 0; i < ends.length; i++) {
    const ei = ends[i];
    scratch.length = 0;
    for (const j of grid.near(ei.p.x, ei.p.y, scratch)) {
      if (j <= i) continue;
      const ej = ends[j];
      if (ej.si === ei.si) continue;
      const d = dist(ei.p, ej.p);
      if (d > JOIN_GAP) continue;
      // Outward tangents must oppose (B continues A).
      if (dot(ei.t, ej.t) > -0.6) continue;
      const v: Pt = { x: ej.p.x - ei.p.x, y: ej.p.y - ei.p.y };
      // ej must lie ahead of ei (not behind it).
      if (dot(v, ei.t) < -3) continue;
      const lat = Math.max(Math.abs(cross(ei.t, v)), Math.abs(cross(ej.t, v)));
      if (lat > (d <= JOIN_GAP_NEAR ? LAT_TOL : LAT_TOL_FAR)) continue;
      const A = strips[ei.si], B = strips[ej.si];
      // Head-on / tail-to-tail one-way fragments cannot be one corridor.
      if (A.oneWay && B.oneWay && ei.end === ej.end) continue;
      const wr = Math.max(A.width, B.width) / Math.max(1, Math.min(A.width, B.width));
      if (wr > 2.2) continue;
      cands.push({ i, j, score: d + 3 * lat + 0.5 * Math.abs(A.width - B.width) });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const match = new Int32Array(ends.length).fill(-1);
  for (const c of cands) {
    if (match[c.i] >= 0 || match[c.j] >= 0) continue;
    match[c.i] = c.j;
    match[c.j] = c.i;
  }

  // Walk chains.
  const visited = new Uint8Array(strips.length);
  const out: WLink[] = [];
  const walk = (startSi: number, enterEnd: 0 | 1) => {
    const chain: { si: number; rev: boolean }[] = [];
    let si = startSi, enter = enterEnd;
    for (;;) {
      visited[si] = 1;
      chain.push({ si, rev: enter === 1 });
      const exit: 0 | 1 = enter === 0 ? 1 : 0;
      const m = match[si * 2 + exit];
      if (m < 0) break;
      const next = ends[m];
      if (visited[next.si]) break;
      si = next.si;
      enter = next.end;
    }
    emitChain(chain);
  };
  const emitChain = (chain: { si: number; rev: boolean }[]) => {
    // Orient the whole chain with the traffic if its one-way fragments say so.
    let fwd = 0, bwd = 0;
    for (const c of chain) {
      const s = strips[c.si];
      if (s.oneWay) {
        if (c.rev) bwd += s.arrowCount;
        else fwd += s.arrowCount;
      }
    }
    if (bwd > fwd) {
      chain.reverse();
      for (const c of chain) c.rev = !c.rev;
    }
    const anyOneWay = chain.some(c => strips[c.si].oneWay);
    const anyTwoWayEvidence = chain.some(c => !strips[c.si].oneWay && strips[c.si].arrowCount > 0);
    const oneWay = anyOneWay && !anyTwoWayEvidence;

    // Runs of constant lane count; absorb short noisy runs.
    type Run = { members: typeof chain; numLanes: number; len: number };
    const runs: Run[] = [];
    for (const c of chain) {
      const s = strips[c.si];
      const len = polyLen(s.mids);
      const last = runs[runs.length - 1];
      if (last && last.numLanes === s.numLanes) {
        last.members.push(c);
        last.len += len;
      } else runs.push({ members: [c], numLanes: s.numLanes, len });
    }
    let changed = true;
    while (changed && runs.length > 1) {
      changed = false;
      let idx = -1, best = Infinity;
      runs.forEach((r, i) => {
        if (r.len < MIN_RUN && r.len < best) { best = r.len; idx = i; }
      });
      if (idx < 0) break;
      const prev = runs[idx - 1], next = runs[idx + 1];
      const into = !prev ? next : !next ? prev : prev.len >= next.len ? prev : next;
      const r = runs[idx];
      if (into === prev) {
        prev.members.push(...r.members);
        prev.len += r.len;
      } else {
        into.members.unshift(...r.members);
        into.len += r.len;
      }
      runs.splice(idx, 1);
      // Merge now-adjacent runs with equal lane counts.
      for (let i = runs.length - 2; i >= 0; i--) {
        if (runs[i].numLanes === runs[i + 1].numLanes) {
          runs[i].members.push(...runs[i + 1].members);
          runs[i].len += runs[i + 1].len;
          runs.splice(i + 1, 1);
        }
      }
      changed = true;
    }

    for (const r of runs) {
      const mids: Pt[] = [];
      let wSum = 0, arrowCount = 0, dividerCount = 0;
      for (const c of r.members) {
        const s = strips[c.si];
        const pts = c.rev ? s.mids.slice().reverse() : s.mids;
        for (const p of pts) {
          const last = mids[mids.length - 1];
          if (!last || dist(last, p) > 0.05) mids.push(p);
        }
        wSum += s.width * polyLen(s.mids);
        arrowCount += s.arrowCount;
        dividerCount = Math.max(dividerCount, s.dividerCount);
      }
      if (mids.length < 2) continue;
      out.push({
        mids,
        width: wSum / Math.max(1, r.len),
        numLanes: r.numLanes,
        oneWay,
        arrowCount,
        dividerCount,
        junctionEnd: [false, false],
      });
    }
  };

  // Open chains first (start at an unmatched end), then any cycles.
  for (let si = 0; si < strips.length; si++) {
    if (visited[si]) continue;
    if (match[si * 2] < 0) walk(si, 0);
    else if (match[si * 2 + 1] < 0) walk(si, 1);
  }
  for (let si = 0; si < strips.length; si++) if (!visited[si]) walk(si, 0);
  return out;
}

// ===========================================================================
// Splitting helper: cut a link at vertex indices (sorted, interior).
// ===========================================================================
function splitAt(link: WLink, idxs: number[]): WLink[] {
  const m = link.mids;
  const parts: WLink[] = [];
  let start = 0;
  const cuts = [...new Set(idxs)].sort((a, b) => a - b);
  for (const ci of cuts) {
    if (ci <= start) continue;
    const part = m.slice(start, ci + 1);
    if (part.length >= 2) {
      parts.push({
        ...link,
        mids: part,
        junctionEnd: [parts.length === 0 ? link.junctionEnd[0] : true, true],
      });
    }
    start = ci;
  }
  const tail = m.slice(start);
  if (tail.length >= 2) {
    parts.push({
      ...link,
      mids: tail,
      junctionEnd: [parts.length === 0 ? link.junctionEnd[0] : true, link.junctionEnd[1]],
    });
  }
  return parts.length ? parts : [link];
}

function arcLengths(m: Pt[]): number[] {
  const arc = [0];
  for (let i = 1; i < m.length; i++) arc.push(arc[i - 1] + dist(m[i - 1], m[i]));
  return arc;
}

/** Collapse runs of adjacent candidate vertices to one cut each, ≥15 m apart. */
function chooseCuts(splitIdx: number[], arc: number[]): number[] {
  if (splitIdx.length === 0) return [];
  const chosen: number[] = [];
  let runStart = splitIdx[0], prevI = splitIdx[0];
  const flush = (endI: number) => {
    const mid = Math.round((runStart + endI) / 2);
    if (chosen.length === 0 || arc[mid] - arc[chosen[chosen.length - 1]] > 15) chosen.push(mid);
  };
  for (let k = 1; k < splitIdx.length; k++) {
    if (splitIdx[k] - prevI > 3) { flush(prevI); runStart = splitIdx[k]; }
    prevI = splitIdx[k];
  }
  flush(prevI);
  return chosen;
}

// ===========================================================================
// B. T-junction splits (perpendicular approaches only)
// ===========================================================================
function tSplit(links: WLink[]): WLink[] {
  type End = { li: number; p: Pt; t: Pt };
  const ends: End[] = [];
  links.forEach((l, li) => {
    ends.push({ li, p: l.mids[0], t: endTangent(l.mids, 0) });
    ends.push({ li, p: l.mids[l.mids.length - 1], t: endTangent(l.mids, 1) });
  });
  const grid = new Grid<End>(T_TOL);
  for (const e of ends) grid.add(e.p.x, e.p.y, e);

  const out: WLink[] = [];
  const scratch: End[] = [];
  for (let li = 0; li < links.length; li++) {
    const l = links[li];
    const m = l.mids;
    if (m.length < 4) { out.push(l); continue; }
    const arc = arcLengths(m);
    const total = arc[arc.length - 1];
    const splitIdx: number[] = [];
    for (let i = 1; i < m.length - 1; i++) {
      if (arc[i] < END_EXCLUDE || total - arc[i] < END_EXCLUDE) continue;
      const lt = norm(m[i - 1], m[i + 1]);
      scratch.length = 0;
      let hit = false;
      for (const e of grid.near(m[i].x, m[i].y, scratch)) {
        if (e.li === li) continue;
        if (dist(e.p, m[i]) >= T_TOL) continue;
        // The approach must come IN to this corridor, not run alongside it.
        if (Math.abs(dot(e.t, lt)) > 0.85) continue;
        hit = true;
        break;
      }
      if (hit) splitIdx.push(i);
    }
    const cuts = chooseCuts(splitIdx, arc);
    if (cuts.length === 0) { out.push(l); continue; }
    out.push(...splitAt(l, cuts));
  }
  return out;
}

// ===========================================================================
// B2. Ray extension: a dangling approach continues along its heading into the
// junction box until it meets a corridor. Handles wide dual-carriageway
// junctions where the side road's strip stops at the outer kerb, 30-70 m
// short of the corridor it actually joins.
// ===========================================================================
function rayExtend(links: WLink[]): WLink[] {
  const cl = clusterEnds(links);
  const vertexGrid = new Grid<{ li: number; i: number }>(RAY_LEN);
  links.forEach((l, li) => l.mids.forEach((p, i) => vertexGrid.add(p.x, p.y, { li, i })));

  // Pending cuts per target link, and extensions per source end.
  const cuts = new Map<number, number[]>();
  const extend: { li: number; end: 0 | 1; to: Pt }[] = [];
  const scratch: { li: number; i: number }[] = [];

  for (let li = 0; li < links.length; li++) {
    for (const end of [0, 1] as const) {
      const ei = li * 2 + end;
      if (cl.members[cl.clusterOf[ei]].length !== 1) continue; // not dangling
      const l = links[li];
      const p = end === 0 ? l.mids[0] : l.mids[l.mids.length - 1];
      const t = endTangent(l.mids, end);
      // Sample along the ray so the grid lookup covers its whole length.
      let best: { li: number; i: number; along: number } | null = null;
      for (let s = 0; s <= RAY_LEN; s += RAY_LEN / 2) {
        scratch.length = 0;
        for (const v of vertexGrid.near(p.x + t.x * s, p.y + t.y * s, scratch)) {
          if (v.li === li) continue;
          const q = links[v.li].mids[v.i];
          const d: Pt = { x: q.x - p.x, y: q.y - p.y };
          const along = dot(d, t);
          if (along < 3 || along > RAY_LEN) continue;
          if (Math.abs(cross(t, d)) > RAY_HALF) continue;
          if (!best || along < best.along) best = { li: v.li, i: v.i, along };
        }
      }
      if (!best) continue;
      const target = links[best.li];
      const arc = arcLengths(target.mids);
      const total = arc[arc.length - 1];
      let hit: Pt;
      if (arc[best.i] < END_EXCLUDE) hit = target.mids[0];
      else if (total - arc[best.i] < END_EXCLUDE) hit = target.mids[target.mids.length - 1];
      else {
        hit = target.mids[best.i];
        let arr = cuts.get(best.li);
        if (!arr) cuts.set(best.li, (arr = []));
        arr.push(best.i);
      }
      extend.push({ li, end, to: hit });
    }
  }

  // Apply extensions (geometry) then cuts (topology).
  const extended = links.map(l => ({ ...l, mids: l.mids.slice(), junctionEnd: [...l.junctionEnd] as [boolean, boolean] }));
  for (const e of extend) {
    const l = extended[e.li];
    if (e.end === 0) l.mids.unshift({ x: e.to.x, y: e.to.y });
    else l.mids.push({ x: e.to.x, y: e.to.y });
    l.junctionEnd[e.end] = true;
  }
  const shifted = new Set(extend.filter(e => e.end === 0).map(e => e.li));
  const out: WLink[] = [];
  extended.forEach((l, li) => {
    const c = cuts.get(li);
    if (!c) { out.push(l); return; }
    // Cut indices were taken on the original polyline; an unshift at end 0
    // moved every vertex up by one.
    const adj = shifted.has(li) ? c.map(i => i + 1) : c;
    out.push(...splitAt(l, chooseCuts(adj.sort((a, b) => a - b), arcLengths(l.mids))));
  });
  return out;
}

// ===========================================================================
// B3. Dangling-end junctions: roundabouts and wide junction boxes where every
// approach stops at its mouth (no through corridor for a ray to hit). Ends
// that are still dangling after ray extension and sit within DANGLE_R of each
// other in a group of 3+ (or 2 facing each other) are one junction: extend
// each to the group centroid so the normal clustering catches them.
// ===========================================================================
const DANGLE_R = 75;
function snapDanglingGroups(links: WLink[]): WLink[] {
  const cl = clusterEnds(links);
  const dangling: number[] = [];
  for (let i = 0; i < links.length * 2; i++) if (cl.members[cl.clusterOf[i]].length === 1) dangling.push(i);
  const endPt = (i: number): Pt => {
    const l = links[i >> 1];
    return i & 1 ? l.mids[l.mids.length - 1] : l.mids[0];
  };
  const parent = new Map<number, number>();
  dangling.forEach(i => parent.set(i, i));
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (let a = 0; a < dangling.length; a++)
    for (let b = a + 1; b < dangling.length; b++) {
      const i = dangling[a], j = dangling[b];
      if (i >> 1 === j >> 1) continue;
      if (dist(endPt(i), endPt(j)) > DANGLE_R) continue;
      const ra = find(i), rb = find(j);
      if (ra !== rb) parent.set(ra, rb);
    }
  const groups = new Map<number, number[]>();
  for (const i of dangling) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  }
  const out = links.map(l => ({ ...l, mids: l.mids.slice(), junctionEnd: [...l.junctionEnd] as [boolean, boolean] }));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    if (g.length === 2) {
      // Two ends only: accept if they face each other (opposite approaches
      // across a wide box), not two unrelated stubs that happen to be near.
      const [i, j] = g;
      const ti = endTangent(links[i >> 1].mids, (i & 1) as 0 | 1);
      const tj = endTangent(links[j >> 1].mids, (j & 1) as 0 | 1);
      const v: Pt = { x: endPt(j).x - endPt(i).x, y: endPt(j).y - endPt(i).y };
      if (dot(ti, tj) > -0.3 || dot(v, ti) < 0) continue;
    }
    let sx = 0, sy = 0;
    for (const i of g) { const p = endPt(i); sx += p.x; sy += p.y; }
    const c: Pt = { x: sx / g.length, y: sy / g.length };
    for (const i of g) {
      const l = out[i >> 1];
      if (i & 1) l.mids.push(c); else l.mids.unshift(c);
      l.junctionEnd[i & 1] = true;
    }
  }
  return out;
}

// ===========================================================================
// Node clustering (single linkage over link ends)
// ===========================================================================
interface Clustering {
  /** cluster id per end index (end index = li*2 + end). */
  clusterOf: Int32Array;
  centroids: Pt[];
  /** end indices per cluster */
  members: number[][];
}

function clusterEnds(links: WLink[], extraUnions: [number, number][] = []): Clustering {
  const n = links.length * 2;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const endPt = (i: number): Pt => {
    const l = links[i >> 1];
    return i & 1 ? l.mids[l.mids.length - 1] : l.mids[0];
  };
  // Per-root bounding box so a merge can be refused when the junction would
  // grow beyond MAX_JUNCTION_DIAM (single linkage otherwise chains along
  // dense areas into one mega-node).
  const bb = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) { const p = endPt(i); bb[i * 4] = p.x; bb[i * 4 + 1] = p.y; bb[i * 4 + 2] = p.x; bb[i * 4 + 3] = p.y; }
  const union = (a: number, b: number, force = false): boolean => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return true;
    const minX = Math.min(bb[ra * 4], bb[rb * 4]), minY = Math.min(bb[ra * 4 + 1], bb[rb * 4 + 1]);
    const maxX = Math.max(bb[ra * 4 + 2], bb[rb * 4 + 2]), maxY = Math.max(bb[ra * 4 + 3], bb[rb * 4 + 3]);
    if (!force && Math.hypot(maxX - minX, maxY - minY) > MAX_JUNCTION_DIAM) return false;
    parent[ra] = rb;
    bb[rb * 4] = minX; bb[rb * 4 + 1] = minY; bb[rb * 4 + 2] = maxX; bb[rb * 4 + 3] = maxY;
    return true;
  };
  const grid = new Grid<number>(NODE_SNAP);
  for (let i = 0; i < n; i++) { const p = endPt(i); grid.add(p.x, p.y, i); }
  // Agglomerate closest pairs first so the diameter cap keeps the tightest groups.
  const pairs: { i: number; j: number; d: number }[] = [];
  const scratch: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = endPt(i);
    scratch.length = 0;
    for (const j of grid.near(p.x, p.y, scratch)) {
      if (j <= i) continue;
      const d = dist(p, endPt(j));
      if (d <= NODE_SNAP) pairs.push({ i, j, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const pr of pairs) union(pr.i, pr.j);
  for (const [a, b] of extraUnions) union(a, b, true);

  const clusterOf = new Int32Array(n);
  const idOf = new Map<number, number>();
  const members: number[][] = [];
  const acc: { sx: number; sy: number; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let id = idOf.get(r);
    if (id === undefined) {
      id = members.length;
      idOf.set(r, id);
      members.push([]);
      acc.push({ sx: 0, sy: 0, k: 0 });
    }
    clusterOf[i] = id;
    members[id].push(i);
    const p = endPt(i);
    acc[id].sx += p.x; acc[id].sy += p.y; acc[id].k++;
  }
  const centroids = acc.map(a => ({ x: a.sx / a.k, y: a.sy / a.k }));
  return { clusterOf, centroids, members };
}

/** Would the cluster stay in one piece (at NODE_SNAP linkage) without link li's two ends? */
function clusterSurvivesWithout(links: WLink[], cl: Clustering, li: number): boolean {
  const id = cl.clusterOf[li * 2];
  const rest = cl.members[id].filter(i => i >> 1 !== li);
  if (rest.length === 0) return false;
  const endPt = (i: number): Pt => {
    const l = links[i >> 1];
    return i & 1 ? l.mids[l.mids.length - 1] : l.mids[0];
  };
  const pts = rest.map(endPt);
  // BFS over the remaining members.
  const seen = new Uint8Array(pts.length);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const a = stack.pop()!;
    for (let b = 0; b < pts.length; b++) if (!seen[b] && dist(pts[a], pts[b]) <= NODE_SNAP) { seen[b] = 1; stack.push(b); }
  }
  if (seen.some(v => !v)) return false;
  // Both of the dropped link's ends must still be adjacent to the remainder.
  const e0 = links[li].mids[0], e1 = links[li].mids[links[li].mids.length - 1];
  return pts.some(p => dist(p, e0) <= NODE_SNAP) && pts.some(p => dist(p, e1) <= NODE_SNAP);
}

// ===========================================================================
// C. Junction consolidation: split corridors passing through a junction box
// ===========================================================================
function consolidateJunctions(links: WLink[]): WLink[] {
  const cl = clusterEnds(links);
  // A junction is a cluster with ≥2 corridor ends, or one containing a
  // T-split end. Gates (a single corridor end) are not junctions.
  const isJunction = cl.members.map(mem =>
    mem.length >= 2 || mem.some(i => links[i >> 1].junctionEnd[i & 1])
  );
  const jGrid = new Grid<number>(JUNCTION_R);
  cl.centroids.forEach((c, id) => { if (isJunction[id]) jGrid.add(c.x, c.y, id); });

  const out: WLink[] = [];
  const scratch: number[] = [];
  for (let li = 0; li < links.length; li++) {
    const l = links[li];
    const m = l.mids;
    const own = new Set([cl.clusterOf[li * 2], cl.clusterOf[li * 2 + 1]]);
    if (m.length < 4) { out.push(l); continue; }
    const arc = arcLengths(m);
    const total = arc[arc.length - 1];
    // For each nearby junction, the closest interior vertex.
    const best = new Map<number, { i: number; d: number }>();
    for (let i = 1; i < m.length - 1; i++) {
      if (arc[i] < END_EXCLUDE || total - arc[i] < END_EXCLUDE) continue;
      scratch.length = 0;
      for (const id of jGrid.near(m[i].x, m[i].y, scratch)) {
        if (own.has(id)) continue;
        const d = dist(cl.centroids[id], m[i]);
        if (d > JUNCTION_R) continue;
        const b = best.get(id);
        if (!b || d < b.d) best.set(id, { i, d });
      }
    }
    if (best.size === 0) { out.push(l); continue; }
    const cuts = chooseCuts([...best.values()].map(b => b.i).sort((a, b) => a - b), arc);
    out.push(...splitAt(l, cuts));
  }
  return out;
}

// ===========================================================================
// D + E. Nodes, cleanup, final graph
// ===========================================================================
export function buildGraph(strips: Strip[]): GraphResult {
  let links = chainStrips(strips.filter(s => s.mids.length >= 2));
  links = tSplit(links);
  links = rayExtend(links);
  links = snapDanglingGroups(links);
  links = consolidateJunctions(links);
  // Drop dust.
  links = links.filter(l => polyLen(l.mids) >= 5);

  // Iterate: cluster -> remove stubs/self-loops -> merge degree-2 -> repeat
  // until stable (each cleanup can expose another).
  for (let pass = 0; pass < 4; pass++) {
    const cl = clusterEnds(links);
    const degree = cl.members.map(m => m.length);
    const keep = new Uint8Array(links.length).fill(1);
    let changed = false;

    links.forEach((l, li) => {
      const a = cl.clusterOf[li * 2], b = cl.clusterOf[li * 2 + 1];
      const len = polyLen(l.mids);
      // Junction-internal fragment (slip lane, turning loop, kerb radius):
      // both ends in the same junction. A real loop road is far longer.
      if (a === b && len < 150 && clusterSurvivesWithout(links, cl, li)) { keep[li] = 0; changed = true; return; }
      // Kerb-radius stub: short, dangling off a junction.
      const dangA = degree[a] === 1, dangB = degree[b] === 1;
      if ((dangA !== dangB) && len < STUB_LEN) {
        const other = dangA ? b : a;
        if (degree[other] >= 3) { keep[li] = 0; changed = true; }
      }
    });

    // Merge degree-2 nodes where the two links are one corridor.
    const merged = new Uint8Array(links.length);
    const newLinks: WLink[] = [];
    if (!changed) {
      for (let id = 0; id < cl.members.length; id++) {
        if (cl.members[id].length !== 2) continue;
        const [e1, e2] = cl.members[id];
        const l1 = links[e1 >> 1], l2 = links[e2 >> 1];
        const i1 = e1 >> 1, i2 = e2 >> 1;
        if (i1 === i2 || merged[i1] || merged[i2] || !keep[i1] || !keep[i2]) continue;
        if (l1.numLanes !== l2.numLanes || l1.oneWay !== l2.oneWay) continue;
        // Orientation: need l1 -> node -> l2 with consistent travel direction.
        const end1 = e1 & 1, end2 = e2 & 1;
        if (l1.oneWay && end1 === end2) continue; // head-on / tail-to-tail
        // Order so that the chain runs first.end1 -> second.end0
        let first = l1, second = l2, fEnd = end1, sEnd = end2;
        if (fEnd === 0 && sEnd === 1) { first = l2; second = l1; fEnd = 1; sEnd = 0; }
        let a = first.mids, b = second.mids;
        if (fEnd === 0) a = a.slice().reverse();      // both ends were 0: flip first
        if (sEnd === 1) b = b.slice().reverse();      // both ends were 1: flip second
        // A flipped one-way link would reverse traffic — refuse.
        if (first.oneWay && fEnd === 0) continue;
        if (second.oneWay && sEnd === 1) continue;
        const mids = [...a];
        for (const p of b) { const last = mids[mids.length - 1]; if (dist(last, p) > 0.05) mids.push(p); }
        const la = polyLen(first.mids), lb = polyLen(second.mids);
        newLinks.push({
          mids,
          width: (first.width * la + second.width * lb) / Math.max(1, la + lb),
          numLanes: first.numLanes,
          oneWay: first.oneWay,
          arrowCount: first.arrowCount + second.arrowCount,
          dividerCount: Math.max(first.dividerCount, second.dividerCount),
          junctionEnd: [
            fEnd === 0 ? first.junctionEnd[1] : first.junctionEnd[0],
            sEnd === 1 ? second.junctionEnd[0] : second.junctionEnd[1],
          ],
        });
        merged[i1] = 1; merged[i2] = 1;
        changed = true;
      }
    }
    if (!changed) break;
    links = links.filter((_, li) => keep[li] && !merged[li]).concat(newLinks);
  }

  // Remove dust components (< 3 links and < 150 m).
  {
    const cl = clusterEnds(links);
    const parent = cl.centroids.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    links.forEach((_, li) => {
      const a = find(cl.clusterOf[li * 2]), b = find(cl.clusterOf[li * 2 + 1]);
      if (a !== b) parent[a] = b;
    });
    const compLinks = new Map<number, number[]>();
    links.forEach((_, li) => {
      const r = find(cl.clusterOf[li * 2]);
      let arr = compLinks.get(r);
      if (!arr) compLinks.set(r, (arr = []));
      arr.push(li);
    });
    const drop = new Uint8Array(links.length);
    for (const arr of compLinks.values()) {
      const len = arr.reduce((s, li) => s + polyLen(links[li].mids), 0);
      if (arr.length < 3 && len < 150) for (const li of arr) drop[li] = 1;
    }
    links = links.filter((_, li) => !drop[li]);
  }

  // Final nodes + output links (ends snapped to their node).
  const cl = clusterEnds(links);
  const nodes: LaneNode[] = cl.centroids.map((c, id) => ({ id, x: c.x, y: c.y, links: [] }));
  const outLinks: Link[] = [];
  links.forEach((l, li) => {
    const fromNode = cl.clusterOf[li * 2];
    const toNode = cl.clusterOf[li * 2 + 1];
    const mids = l.mids.slice();
    const nf = nodes[fromNode], nt = nodes[toNode];
    if (dist(mids[0], nf) > 1) mids.unshift({ x: nf.x, y: nf.y });
    if (dist(mids[mids.length - 1], nt) > 1) mids.push({ x: nt.x, y: nt.y });
    const flat: number[] = [];
    for (const p of mids) flat.push(p.x, p.y);
    const id = outLinks.length;
    nodes[fromNode].links.push(id);
    if (toNode !== fromNode) nodes[toNode].links.push(id);
    outLinks.push({
      id: `link${id}`,
      points: flat,
      numLanes: l.numLanes,
      width: l.width,
      length: polyLen(mids),
      oneWay: l.oneWay,
      arrowCount: l.arrowCount,
      dividerCount: l.dividerCount,
      fromNode,
      toNode,
    });
  });
  // Drop orphan nodes (none expected, but keep ids dense).
  const used = nodes.filter(n => n.links.length > 0);
  const remap = new Map<number, number>();
  used.forEach((n, i) => remap.set(n.id, i));
  used.forEach((n, i) => (n.id = i));
  for (const l of outLinks) {
    l.fromNode = remap.get(l.fromNode)!;
    l.toNode = remap.get(l.toNode)!;
  }
  return { links: outLinks, nodes: used };
}
