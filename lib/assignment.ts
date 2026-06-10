// Static traffic assignment over the carriageway network — the TIS engine.
//
// Purpose (per the project north-star): given the masterplan's road network
// and development traffic demand, put a VOLUME on every link, compute V/C and
// LOS, and let the engineer test mitigations ("add a lane" = numLanes+1 on a
// link) with an instant re-solve and a before/after delta.
//
// Method — deterministic approximate user equilibrium:
//   * Graph: each Link is one arc per travel direction (one arc when oneWay,
//     two arcs when two-way, each direction carrying half the lanes).
//   * Demand: external gates = nodes with exactly one incident link (the
//     points where the masterplan network connects outward / plot accesses).
//     A uniform O-D matrix over all gate pairs, scaled to a user-set total
//     two-way demand (veh/h). Deliberately simple and fully editable later;
//     deterministic so A/B mitigation comparisons are clean.
//   * Volume-delay: BPR  t = t0 · (1 + 0.15·(v/c)^4).
//   * Solver: MSA (method of successive averages) over all-or-nothing
//     Dijkstra assignments — flows converge toward equilibrium and the
//     result is reproducible run-to-run (no randomness anywhere).
//   * LOS: HCM urban-street segment LOS from the speed ratio implied by the
//     BPR travel time (speedRatio = t0/t) + V/C (lib/hcm.ts losSegment).

import type { LaneNetwork } from "@/lib/lane-network";
import type { LOS } from "@/lib/hcm";

/**
 * Planning-level link LOS from volume/capacity. Pure BPR speed ratio stays
 * above the HCM "A" threshold until extreme congestion because it excludes
 * junction control delay, so for a screening TIS we grade links on V/C bands
 * (standard planning practice). Junction-delay-based LOS can replace this
 * once junction control is modelled.
 */
export function losVc(vc: number): LOS {
  if (vc <= 0.3) return "A";
  if (vc <= 0.5) return "B";
  if (vc <= 0.7) return "C";
  if (vc <= 0.85) return "D";
  if (vc <= 1.0) return "E";
  return "F";
}

/** Saturation flow per lane (veh/h) — urban arterial mid-block capacity. */
export const LANE_CAPACITY = 900; // veh/h/lane mid-block (signal-constrained)

export interface AssignmentOptions {
  /** Total two-way demand across all gate pairs (veh/h). */
  totalDemand: number;
  /** MSA iterations (default 15). */
  iterations?: number;
  /** Free-flow speed (km/h) used for travel times (default 50). */
  freeflowKmh?: number;
  /** Mitigation overrides: linkId → replacement numLanes. */
  laneOverrides?: Record<string, number>;
}

export interface LinkResult {
  /** Two-way volume on the link (veh/h, both directions summed). */
  volume: number;
  /** Worst-direction volume / capacity. */
  vc: number;
  /** HCM segment LOS for the worst direction. */
  los: LOS;
  /** Effective lanes used (after overrides). */
  lanesUsed: number;
}

export interface AssignmentResult {
  perLink: LinkResult[];
  /** Node ids used as external gates. */
  gates: number[];
  totals: {
    /** Vehicle-kilometres travelled per hour. */
    vkt: number;
    /** Vehicle-hours travelled per hour (system travel time). */
    vht: number;
    /** Total delay vs free-flow (veh·h/h). */
    delay: number;
    /** Links at LOS E or F. */
    failingLinks: number;
    /** Demand actually routed (veh/h). */
    routedDemand: number;
  };
}

interface Arc {
  from: number;
  to: number;
  linkIdx: number;
  /** Free-flow time (h). */
  t0: number;
  /** Capacity for this direction (veh/h). */
  cap: number;
}

/** Min-heap keyed on cost for Dijkstra. */
class Heap {
  private ids: number[] = [];
  private costs: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, cost: number) {
    const ids = this.ids, costs = this.costs;
    let i = ids.length;
    ids.push(id);
    costs.push(cost);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (costs[p] <= costs[i]) break;
      [ids[p], ids[i]] = [ids[i], ids[p]];
      [costs[p], costs[i]] = [costs[i], costs[p]];
      i = p;
    }
  }
  pop(): { id: number; cost: number } | null {
    const ids = this.ids, costs = this.costs;
    if (ids.length === 0) return null;
    const top = { id: ids[0], cost: costs[0] };
    const lastId = ids.pop()!;
    const lastCost = costs.pop()!;
    if (ids.length > 0) {
      ids[0] = lastId;
      costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < ids.length && costs[l] < costs[m]) m = l;
        if (r < ids.length && costs[r] < costs[m]) m = r;
        if (m === i) break;
        [ids[m], ids[i]] = [ids[i], ids[m]];
        [costs[m], costs[i]] = [costs[i], costs[m]];
        i = m;
      }
    }
    return top;
  }
}

export function runAssignment(
  net: LaneNetwork,
  opts: AssignmentOptions
): AssignmentResult {
  const iterations = opts.iterations ?? 15;
  const ffs = opts.freeflowKmh ?? 50;
  const overrides = opts.laneOverrides ?? {};

  // ---- Build directed arcs from links ----
  const arcs: Arc[] = [];
  const lanesUsed: number[] = [];
  net.links.forEach((link, li) => {
    const lanes = Math.max(1, overrides[link.id] ?? link.numLanes);
    lanesUsed[li] = lanes;
    const t0 = link.length / 1000 / ffs; // hours
    if (link.oneWay) {
      arcs.push({ from: link.fromNode, to: link.toNode, linkIdx: li, t0, cap: lanes * LANE_CAPACITY });
    } else {
      // Two-way undivided street: half the lanes per direction. Fractional
      // lanes are fine for capacity math (3 lanes two-way = 1.5 lanes/dir),
      // and they make the "add a lane" mitigation continuous instead of only
      // mattering on even counts.
      const dirLanes = Math.max(0.5, lanes / 2);
      const cap = dirLanes * LANE_CAPACITY;
      arcs.push({ from: link.fromNode, to: link.toNode, linkIdx: li, t0, cap });
      arcs.push({ from: link.toNode, to: link.fromNode, linkIdx: li, t0, cap });
    }
  });

  // ---- Junction-crossing arcs ----
  // Carriageway strips stop at the junction MOUTH (kerb radii break the
  // parallel-edge pairing inside the junction box), so approach links of the
  // same junction end at distinct nodes 10-60 m apart. The junction interior
  // does carry traffic between those mouths — model it explicitly: a
  // bidirectional crossing arc between every pair of nodes within
  // JUNCTION_RADIUS, traversed at a junction crawl speed. linkIdx = -1 keeps
  // these arcs out of the per-link results.
  const JUNCTION_RADIUS = 50;
  const CROSS_KMH = 20;
  {
    const G = JUNCTION_RADIUS;
    const grid = new Map<string, number[]>();
    net.nodes.forEach(n => {
      const k = `${Math.floor(n.x / G)},${Math.floor(n.y / G)}`;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(n.id);
    });
    for (const n of net.nodes) {
      const gx = Math.floor(n.x / G), gy = Math.floor(n.y / G);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const m of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (m <= n.id) continue;
            const o = net.nodes[m];
            const d = Math.hypot(o.x - n.x, o.y - n.y);
            if (d > JUNCTION_RADIUS) continue;
            const t0 = Math.max(d, 5) / 1000 / CROSS_KMH;
            const cap = 4 * LANE_CAPACITY;
            arcs.push({ from: n.id, to: m, linkIdx: -1, t0, cap });
            arcs.push({ from: m, to: n.id, linkIdx: -1, t0, cap });
          }
    }
  }

  // Adjacency
  const nNodes = net.nodes.length;
  const out: number[][] = Array.from({ length: nNodes }, () => []);
  arcs.forEach((a, ai) => { if (a.from < nNodes && a.to < nNodes) out[a.from].push(ai); });

  // ---- Gates: degree-1 nodes (network boundary connections / accesses) ----
  const gates = net.nodes.filter(n => n.links.length === 1).map(n => n.id);

  // Keep only gates that can reach ≥1 other gate (avoid wasting demand on
  // isolated stubs). Cheap BFS reachability over arcs.
  const reachable = (s: number): Set<number> => {
    const seen = new Set<number>([s]);
    const stack = [s];
    while (stack.length) {
      const n = stack.pop()!;
      for (const ai of out[n]) {
        const t = arcs[ai].to;
        if (!seen.has(t)) { seen.add(t); stack.push(t); }
      }
    }
    return seen;
  };
  const gateSet = new Set(gates);
  const liveGates = gates.filter(g => {
    const r = reachable(g);
    for (const o of gateSet) if (o !== g && r.has(o)) return true;
    return false;
  });

  const arcFlow = new Float64Array(arcs.length);
  let routedDemand = 0;

  if (liveGates.length >= 2 && opts.totalDemand > 0) {
    // Uniform demand per ordered gate pair.
    const pairs = liveGates.length * (liveGates.length - 1);
    const perPair = opts.totalDemand / pairs;

    const iterFlow = new Float64Array(arcs.length);
    const cost = new Float64Array(arcs.length);

    for (let it = 1; it <= iterations; it++) {
      // BPR costs from current flows
      for (let ai = 0; ai < arcs.length; ai++) {
        const a = arcs[ai];
        const vc = arcFlow[ai] / a.cap;
        cost[ai] = a.t0 * (1 + 0.15 * Math.pow(vc, 4));
      }
      iterFlow.fill(0);
      // All-or-nothing: one Dijkstra per origin gate, assign to all dest gates.
      let routed = 0;
      for (const o of liveGates) {
        const distArr = new Float64Array(nNodes).fill(Infinity);
        const prevArc = new Int32Array(nNodes).fill(-1);
        distArr[o] = 0;
        const heap = new Heap();
        heap.push(o, 0);
        while (heap.size > 0) {
          const top = heap.pop()!;
          if (top.cost > distArr[top.id]) continue;
          for (const ai of out[top.id]) {
            const a = arcs[ai];
            const nd = top.cost + cost[ai];
            if (nd < distArr[a.to]) {
              distArr[a.to] = nd;
              prevArc[a.to] = ai;
              heap.push(a.to, nd);
            }
          }
        }
        for (const d of liveGates) {
          if (d === o || !isFinite(distArr[d])) continue;
          // walk back, add perPair to each arc on the path
          let n = d;
          let guard = 0;
          while (n !== o && guard++ < 100000) {
            const ai = prevArc[n];
            if (ai < 0) break;
            iterFlow[ai] += perPair;
            n = arcs[ai].from;
          }
          routed += perPair;
        }
      }
      // MSA blend
      const w = 1 / it;
      for (let ai = 0; ai < arcs.length; ai++) {
        arcFlow[ai] = (1 - w) * arcFlow[ai] + w * iterFlow[ai];
      }
      routedDemand = routed;
    }
  }

  // ---- Per-link results ----
  const perLink: LinkResult[] = net.links.map(() => ({ volume: 0, vc: 0, los: "A" as LOS, lanesUsed: 1 }));
  // Track worst-direction vc per link
  const worstVc = new Float64Array(net.links.length);
  for (let ai = 0; ai < arcs.length; ai++) {
    const a = arcs[ai];
    if (a.linkIdx < 0) continue; // junction-crossing arcs have no link
    const r = perLink[a.linkIdx];
    r.volume += arcFlow[ai];
    const vc = arcFlow[ai] / a.cap;
    if (vc > worstVc[a.linkIdx]) worstVc[a.linkIdx] = vc;
  }
  let vkt = 0, vht = 0, delay = 0, failingLinks = 0;
  net.links.forEach((link, li) => {
    const r = perLink[li];
    r.lanesUsed = lanesUsed[li];
    r.vc = worstVc[li];
    r.los = losVc(r.vc);
    if (r.los === "E" || r.los === "F") failingLinks++;
    const lenKm = link.length / 1000;
    vkt += r.volume * lenKm;
    const t0 = lenKm / (opts.freeflowKmh ?? 50);
    const t = t0 * (1 + 0.15 * Math.pow(r.vc, 4));
    vht += r.volume * t;
    delay += r.volume * (t - t0);
  });

  return {
    perLink,
    gates: liveGates,
    totals: { vkt, vht, delay, failingLinks, routedDemand },
  };
}
