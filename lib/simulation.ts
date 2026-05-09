import type { RoadNetwork, NetworkLink } from "@/lib/road-network";

export interface Vehicle {
  id: number;
  linkId: string;
  /** Distance along the link's polyline, 0..link.length. */
  s: number;
  /** Direction of travel: +1 from fromNode -> toNode, -1 the other way. */
  dir: 1 | -1;
  /** Cruising speed in user-units / second. */
  speed: number;
  /** RGB colour for rendering. */
  color: string;
}

export interface SimulationState {
  vehicles: Vehicle[];
  network: RoadNetwork;
  /** Cumulative-arclength table per link, in source point order. */
  linkArc: Map<string, Float32Array>;
  /** Adjacency: nodeId -> array of links that touch the node. */
  adjacency: Map<string, string[]>;
}

const VEHICLE_COLORS = [
  "#fbbf24",
  "#fb923c",
  "#fde68a",
  "#34d399",
  "#a78bfa",
  "#60a5fa",
  "#f472b6",
  "#e2e8f0",
];

function buildLinkArc(link: NetworkLink): Float32Array {
  const pts = link.points;
  const n = pts.length / 2;
  const arc = new Float32Array(n);
  arc[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[2 * i] - pts[2 * (i - 1)];
    const dy = pts[2 * i + 1] - pts[2 * (i - 1) + 1];
    arc[i] = arc[i - 1] + Math.hypot(dx, dy);
  }
  return arc;
}

/**
 * Locate (x, y) on a link's polyline at distance `s` from its first point.
 * Uses the cumulative-arc table for O(log n) sample lookup.
 */
export function pointOnLink(link: NetworkLink, arc: Float32Array, s: number) {
  const pts = link.points;
  const n = arc.length;
  if (n === 0) return { x: 0, y: 0 };
  if (s <= 0) return { x: pts[0], y: pts[1] };
  if (s >= arc[n - 1])
    return { x: pts[2 * (n - 1)], y: pts[2 * (n - 1) + 1] };
  // Binary search.
  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (arc[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segLen = arc[hi] - arc[lo] || 1;
  const t = (s - arc[lo]) / segLen;
  return {
    x: pts[2 * lo] * (1 - t) + pts[2 * hi] * t,
    y: pts[2 * lo + 1] * (1 - t) + pts[2 * hi + 1] * t,
  };
}

/** Tangent (unit dx, dy) along a link at distance s, oriented from->to. */
export function tangentOnLink(link: NetworkLink, arc: Float32Array, s: number) {
  const pts = link.points;
  const n = arc.length;
  if (n < 2) return { dx: 1, dy: 0 };
  let lo = 0;
  let hi = n - 1;
  if (s <= 0) {
    lo = 0;
    hi = 1;
  } else if (s >= arc[n - 1]) {
    lo = n - 2;
    hi = n - 1;
  } else {
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (arc[mid] <= s) lo = mid;
      else hi = mid;
    }
  }
  const dx = pts[2 * hi] - pts[2 * lo];
  const dy = pts[2 * hi + 1] - pts[2 * lo + 1];
  const m = Math.hypot(dx, dy) || 1;
  return { dx: dx / m, dy: dy / m };
}

export function buildSimulationState(network: RoadNetwork): SimulationState {
  const linkArc = new Map<string, Float32Array>();
  for (const link of network.links) linkArc.set(link.id, buildLinkArc(link));
  const adjacency = new Map<string, string[]>();
  for (const node of network.nodes) adjacency.set(node.id, [...node.links]);
  return {
    vehicles: [],
    network,
    linkArc,
    adjacency,
  };
}

/**
 * Spawn `count` vehicles distributed over the network. Each vehicle is given
 * a random link, random position along it, random direction and a speed
 * scaled to the drawing extent so things move at a perceivable rate
 * regardless of the underlying CAD unit.
 */
export function spawnVehicles(
  state: SimulationState,
  count: number,
  baseSpeed: number
): SimulationState {
  const { network } = state;
  if (network.links.length === 0) return state;
  const vehicles: Vehicle[] = [];
  const id0 = state.vehicles.length > 0
    ? Math.max(...state.vehicles.map((v) => v.id)) + 1
    : 0;
  for (let i = 0; i < count; i++) {
    const link = network.links[Math.floor(Math.random() * network.links.length)];
    const s = Math.random() * link.length;
    vehicles.push({
      id: id0 + i,
      linkId: link.id,
      s,
      dir: Math.random() < 0.5 ? 1 : -1,
      // +/- 25% jitter so vehicles bunch and spread realistically.
      speed: baseSpeed * (0.75 + Math.random() * 0.5),
      color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
    });
  }
  return { ...state, vehicles: state.vehicles.concat(vehicles) };
}

export function clearVehicles(state: SimulationState): SimulationState {
  return { ...state, vehicles: [] };
}

/**
 * Advance every vehicle by `dt` seconds. Vehicles that reach a node pick a
 * random outgoing link (other than the one they came from when possible).
 * Mutates state.vehicles in place for performance - the array reference is
 * preserved so React re-renders on demand from a refresh tick instead.
 */
export function step(state: SimulationState, dt: number): void {
  const { network, linkArc, adjacency, vehicles } = state;
  const linksById = new Map<string, NetworkLink>();
  for (const link of network.links) linksById.set(link.id, link);

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const link = linksById.get(v.linkId);
    if (!link) continue;
    v.s += v.speed * dt * v.dir;

    // Reached the end-node in current travel direction?
    const overshoot =
      v.dir === 1 ? Math.max(0, v.s - link.length) : Math.max(0, -v.s);
    if (overshoot > 0) {
      const arrivedAt = v.dir === 1 ? link.toNode : link.fromNode;
      const candidates = (adjacency.get(arrivedAt) ?? []).filter(
        (id) => id !== link.id
      );
      // Dead-end: U-turn along the same link.
      const nextId = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : link.id;
      const next = linksById.get(nextId);
      if (!next) {
        // Bounce back along current link.
        v.dir = (v.dir === 1 ? -1 : 1) as 1 | -1;
        v.s = v.dir === 1 ? overshoot : link.length - overshoot;
        continue;
      }

      // Determine which end of `next` corresponds to `arrivedAt` so the
      // vehicle continues moving "forwards" into the new link.
      v.linkId = next.id;
      if (next.fromNode === arrivedAt) {
        v.dir = 1;
        v.s = Math.min(overshoot, next.length);
      } else if (next.toNode === arrivedAt) {
        v.dir = -1;
        v.s = Math.max(0, next.length - overshoot);
      } else {
        // The link list said it touched this node but neither end matches -
        // skip rather than crash.
        v.s = 0;
        v.dir = 1;
      }
    }
  }

  // Suppress unused-var lint: linkArc is exposed for the renderer.
  void linkArc;
}
