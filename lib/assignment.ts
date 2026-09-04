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
//   * Zones:
//       - EXTERNAL zones = the network's gates. A gate node is a degree-1
//         node; the two one-way carriageways of a dual road leave the plan as
//         two gate nodes a few metres apart, so gates within ZONE_R are ONE
//         zone, with entry nodes (an arc leaves) and exit nodes (an arc
//         enters).
//       - INTERNAL zones = every junction / lane-change node, weighted by its
//         incident carriageway length (a proxy for plot frontage until
//         land-use trip generation exists).
//   * Demand (development traffic, veh/h): half INBOUND (external -> internal,
//     the development's arrivals) and half OUTBOUND (internal -> external),
//     spread over reachable zone pairs in proportion to internal weight and
//     scaled so the whole demand is routed.
//   * Volume-delay: BPR  t = t0 · (1 + 0.15·(v/c)^4).
//   * Solver: MSA (method of successive averages) over all-or-nothing
//     Dijkstra assignments — reproducible run-to-run (no randomness).
//   * LOS: planning link LOS from V/C bands (losVc).

import type { LaneNetwork } from "@/lib/lane-network";
import type { LOS } from "@/lib/hcm";

/**
 * Planning-level link LOS from volume/capacity (standard screening practice
 * for a TIS). Junction-delay-based LOS can replace this once junction control
 * is modelled.
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

/** Gate nodes within this distance are one external zone. */
const ZONE_R = 60;

export interface AssignmentOptions {
  /** Total development demand, both directions summed (veh/h). */
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
  /** Planning LOS for the worst direction. */
  los: LOS;
  /** Effective lanes used (after overrides). */
  lanesUsed: number;
}

export interface AssignmentResult {
  perLink: LinkResult[];
  /** Gate node ids (external connections) that took part in the assignment. */
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
  const nNodes = net.nodes.length;

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
      // lanes are fine for capacity math and keep "add a lane" continuous.
      const dirLanes = Math.max(0.5, lanes / 2);
      const cap = dirLanes * LANE_CAPACITY;
      arcs.push({ from: link.fromNode, to: link.toNode, linkIdx: li, t0, cap });
      arcs.push({ from: link.toNode, to: link.fromNode, linkIdx: li, t0, cap });
    }
  });
  const out: number[][] = Array.from({ length: nNodes }, () => []);
  const inn: number[][] = Array.from({ length: nNodes }, () => []);
  arcs.forEach((a, ai) => {
    if (a.from < nNodes && a.to < nNodes) { out[a.from].push(ai); inn[a.to].push(ai); }
  });

  // ---- External zones from gate nodes ----
  const gateNodes = net.nodes.filter(n => n.links.length === 1).map(n => n.id);
  const zoneParent = new Map<number, number>();
  gateNodes.forEach(g => zoneParent.set(g, g));
  const zfind = (x: number): number => {
    let r = x;
    while (zoneParent.get(r) !== r) r = zoneParent.get(r)!;
    zoneParent.set(x, r);
    return r;
  };
  for (let i = 0; i < gateNodes.length; i++)
    for (let j = i + 1; j < gateNodes.length; j++) {
      const a = net.nodes[gateNodes[i]], b = net.nodes[gateNodes[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= ZONE_R) {
        const ra = zfind(a.id), rb = zfind(b.id);
        if (ra !== rb) zoneParent.set(ra, rb);
      }
    }
  interface ExtZone { entries: number[]; exits: number[] }
  const extZones = new Map<number, ExtZone>();
  for (const g of gateNodes) {
    const r = zfind(g);
    let z = extZones.get(r);
    if (!z) extZones.set(r, (z = { entries: [], exits: [] }));
    if (out[g].length > 0) z.entries.push(g);
    if (inn[g].length > 0) z.exits.push(g);
  }
  const zones = [...extZones.values()];
  const entryNodes = zones.flatMap(z => z.entries);
  const exitNodes = zones.flatMap(z => z.exits);

  // ---- Internal zones: junction / lane-change nodes weighted by frontage ----
  const internal: number[] = [];
  const weight = new Float64Array(nNodes);
  for (const n of net.nodes) {
    if (n.links.length < 2) continue;
    internal.push(n.id);
    weight[n.id] = n.links.reduce((s, li) => s + net.links[li].length, 0) / 2;
  }

  // ---- Reachability (cost-independent): which O-D pairs can route ----
  const reach = (s: number): Uint8Array => {
    const seen = new Uint8Array(nNodes);
    seen[s] = 1;
    const stack = [s];
    while (stack.length) {
      const n = stack.pop()!;
      for (const ai of out[n]) {
        const t = arcs[ai].to;
        if (!seen[t]) { seen[t] = 1; stack.push(t); }
      }
    }
    return seen;
  };

  // Demand table: per origin node, list of {dest, veh/h}.
  const od = new Map<number, { d: number; v: number }[]>();
  const addOd = (o: number, d: number, v: number) => {
    let arr = od.get(o);
    if (!arr) od.set(o, (arr = []));
    arr.push({ d, v });
  };
  let routedDemand = 0;
  const usedGates = new Set<number>();
  if (opts.totalDemand > 0 && internal.length > 0 && zones.length > 0) {
    // Inbound: every entry node -> every reachable internal node.
    const inbound: { o: number; d: number; w: number }[] = [];
    for (const e of entryNodes) {
      const r = reach(e);
      for (const i of internal) if (r[i] && i !== e) inbound.push({ o: e, d: i, w: weight[i] });
    }
    // Outbound: every internal node -> every reachable exit node.
    const outbound: { o: number; d: number; w: number }[] = [];
    for (const i of internal) {
      const r = reach(i);
      for (const x of exitNodes) if (r[x] && x !== i) outbound.push({ o: i, d: x, w: weight[i] });
    }
    const half = opts.totalDemand / 2;
    const wIn = inbound.reduce((s, p) => s + p.w, 0);
    const wOut = outbound.reduce((s, p) => s + p.w, 0);
    // If only one direction is routable, give it the full demand.
    const inShare = wIn > 0 && wOut > 0 ? half : wIn > 0 ? opts.totalDemand : 0;
    const outShare = wIn > 0 && wOut > 0 ? half : wOut > 0 ? opts.totalDemand : 0;
    for (const p of inbound) {
      const v = (inShare * p.w) / wIn;
      addOd(p.o, p.d, v);
      routedDemand += v;
      usedGates.add(p.o);
    }
    for (const p of outbound) {
      const v = (outShare * p.w) / wOut;
      addOd(p.o, p.d, v);
      routedDemand += v;
      usedGates.add(p.d);
    }
  }

  // ---- MSA over all-or-nothing assignments ----
  const arcFlow = new Float64Array(arcs.length);
  if (od.size > 0) {
    const iterFlow = new Float64Array(arcs.length);
    const cost = new Float64Array(arcs.length);
    const origins = [...od.keys()];
    for (let it = 1; it <= iterations; it++) {
      for (let ai = 0; ai < arcs.length; ai++) {
        const a = arcs[ai];
        const vc = arcFlow[ai] / a.cap;
        cost[ai] = a.t0 * (1 + 0.15 * Math.pow(vc, 4));
      }
      iterFlow.fill(0);
      for (const o of origins) {
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
        for (const { d, v } of od.get(o)!) {
          if (!isFinite(distArr[d])) continue;
          let n = d;
          let guard = 0;
          while (n !== o && guard++ < 100000) {
            const ai = prevArc[n];
            if (ai < 0) break;
            iterFlow[ai] += v;
            n = arcs[ai].from;
          }
        }
      }
      const w = 1 / it;
      for (let ai = 0; ai < arcs.length; ai++) {
        arcFlow[ai] = (1 - w) * arcFlow[ai] + w * iterFlow[ai];
      }
    }
  }

  // ---- Per-link results ----
  const perLink: LinkResult[] = net.links.map(() => ({ volume: 0, vc: 0, los: "A" as LOS, lanesUsed: 1 }));
  const worstVc = new Float64Array(net.links.length);
  for (let ai = 0; ai < arcs.length; ai++) {
    const a = arcs[ai];
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
    const t0 = lenKm / ffs;
    const t = t0 * (1 + 0.15 * Math.pow(r.vc, 4));
    vht += r.volume * t;
    delay += r.volume * (t - t0);
  });

  return {
    perLink,
    gates: [...usedGates],
    totals: { vkt, vht, delay, failingLinks, routedDemand },
  };
}
