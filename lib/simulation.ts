import type {
  RoadNetwork,
  NetworkLink,
  NetworkNode,
  Movement,
} from "@/lib/road-network";
import { classifyJunctionApproaches, type Cardinal } from "@/lib/road-network";

export interface Vehicle {
  id: number;
  linkId: string;
  /** Distance along the link's polyline, 0..link.length, increasing from-node -> to-node. */
  s: number;
  /** Direction of travel along the link: +1 from->to, -1 to->from. */
  dir: 1 | -1;
  /** Current speed (always non-negative; direction handled by `dir`). */
  v: number;
  /** Desired free-flow speed. */
  v0: number;
  /** Lane index in the current link's direction-of-travel: 0 = closest to
   *  the outer kerb (slowest lane), increasing toward the centerline. */
  lane: number;
  /** Lateral offset along the right-hand normal of travel - kept for
   *  compatibility with single-lane fallback rendering when a link has
   *  no lanesPerDir set. */
  laneOffset: number;
  /** RGB colour for rendering. */
  color: string;
}

export interface SignalState {
  nodeId: string;
  cycleLength: number;
  /** Number of phases - one per cardinal direction that has at least one
   *  incoming link. */
  phases: SignalPhase[];
}

export interface SignalPhase {
  /** Cardinal directions getting green this phase. */
  cardinals: Cardinal[];
  /** Duration of this phase, seconds. */
  duration: number;
  /** Cumulative start time within the cycle. */
  startTime: number;
}

export interface SimulationConfig {
  /** Whether to run signal control. */
  signalsEnabled: boolean;
  /** Cycle length used for new junctions. */
  defaultCycleLength: number;
  /** Lane offset distance, scaled to drawing extent. */
  laneOffset: number;
  /** Stop-line setback from the junction node, in source units. */
  stopBack: number;
  /** Drawing-scale baseline for IDM speed / accel. */
  diag: number;
}

export interface SimulationState {
  vehicles: Vehicle[];
  network: RoadNetwork;
  /** Cumulative-arclength table per link, in source point order. */
  linkArc: Map<string, Float32Array>;
  /** Adjacency: nodeId -> array of links that touch the node. */
  adjacency: Map<string, string[]>;
  /** Successor lookup keyed by `${linkId}_${arrivalDir}`. Tells the
   *  simulator which (link, dir, s) to switch to when a vehicle reaches
   *  the end of its current link. */
  movementsBySource: Map<string, Movement[]>;
  /** Per-junction signal state, keyed by node id. */
  signals: Map<string, SignalState>;
  /** Per-link approach cardinal on entry to each end node. */
  linkApproachCardinal: Map<
    string,
    { fromCardinal: Cardinal; toCardinal: Cardinal }
  >;
  /** Time elapsed in simulation (seconds). */
  time: number;
  config: SimulationConfig;
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

/** IDM constants - the absolute scales (acceleration, jam distance) get
 *  rescaled to the drawing's bounds-diagonal at runtime so behaviour reads
 *  the same regardless of CAD units. */
const IDM_T = 1.4; // safe headway, seconds
const IDM_DELTA = 4;

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

export function pointOnLink(link: NetworkLink, arc: Float32Array, s: number) {
  const pts = link.points;
  const n = arc.length;
  if (n === 0) return { x: 0, y: 0 };
  if (s <= 0) return { x: pts[0], y: pts[1] };
  if (s >= arc[n - 1])
    return { x: pts[2 * (n - 1)], y: pts[2 * (n - 1) + 1] };
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

function bearingToCardinal(deg: number): Cardinal {
  const d = ((deg % 360) + 360) % 360;
  return d >= 315 || d < 45
    ? "NB"
    : d < 135
    ? "EB"
    : d < 225
    ? "SB"
    : "WB";
}

/**
 * Build a fixed-cycle signal for `node`. Each cardinal direction with at
 * least one incoming link gets its own phase. Pairs of opposing cardinals
 * (NB+SB, EB+WB) share a phase to mimic a typical 2-phase intersection.
 */
function buildSignal(
  node: NetworkNode,
  network: RoadNetwork,
  cycleLength: number
): SignalState | null {
  const approaches = classifyJunctionApproaches(node, network);
  const present = new Set<Cardinal>();
  for (const a of approaches) present.add(a.cardinal);
  if (present.size < 2) return null;

  // Pair opposites - if both NB and SB approaches exist, give them green
  // together. Same for EB+WB. Otherwise each cardinal is its own phase.
  const groups: Cardinal[][] = [];
  if (present.has("NB") || present.has("SB")) {
    const g: Cardinal[] = [];
    if (present.has("NB")) g.push("NB");
    if (present.has("SB")) g.push("SB");
    groups.push(g);
  }
  if (present.has("EB") || present.has("WB")) {
    const g: Cardinal[] = [];
    if (present.has("EB")) g.push("EB");
    if (present.has("WB")) g.push("WB");
    groups.push(g);
  }
  if (groups.length === 0) return null;

  const each = cycleLength / groups.length;
  const phases: SignalPhase[] = [];
  let t = 0;
  for (const cardinals of groups) {
    phases.push({ cardinals, duration: each, startTime: t });
    t += each;
  }
  return { nodeId: node.id, cycleLength, phases };
}

function activeCardinals(signal: SignalState, time: number): Set<Cardinal> {
  const t = ((time % signal.cycleLength) + signal.cycleLength) % signal.cycleLength;
  for (const phase of signal.phases) {
    if (t >= phase.startTime && t < phase.startTime + phase.duration) {
      return new Set(phase.cardinals);
    }
  }
  return new Set();
}

/**
 * Determine which cardinal each link "arrives from" at each of its two
 * endpoints. Used to test against signal phases.
 */
function buildApproachCardinals(network: RoadNetwork) {
  const map = new Map<
    string,
    { fromCardinal: Cardinal; toCardinal: Cardinal }
  >();
  const linksById = new Map(network.links.map((l) => [l.id, l]));
  for (const node of network.nodes) {
    const approaches = classifyJunctionApproaches(node, network);
    for (const a of approaches) {
      const link = linksById.get(a.linkId);
      if (!link) continue;
      // The approach cardinal is computed from the link's outgoing bearing
      // at this node. We need the cardinal someone arriving at this node
      // would be on - that's the OPPOSITE of the outgoing bearing.
      const arriving = bearingToCardinal((a.outBearing + 180) % 360);
      const existing = map.get(a.linkId) ?? {
        fromCardinal: "NB" as Cardinal,
        toCardinal: "NB" as Cardinal,
      };
      if (link.fromNode === node.id) {
        existing.fromCardinal = arriving;
      } else if (link.toNode === node.id) {
        existing.toCardinal = arriving;
      }
      map.set(a.linkId, existing);
    }
  }
  return map;
}

export function buildSimulationState(
  network: RoadNetwork,
  partialConfig: Partial<SimulationConfig> = {}
): SimulationState {
  const linkArc = new Map<string, Float32Array>();
  for (const link of network.links) linkArc.set(link.id, buildLinkArc(link));

  const adjacency = new Map<string, string[]>();
  for (const node of network.nodes) adjacency.set(node.id, [...node.links]);

  const movementsBySource = new Map<string, Movement[]>();
  for (const m of network.movements ?? []) {
    const key = `${m.fromLinkId}_${m.fromDirAtArrival}`;
    let arr = movementsBySource.get(key);
    if (!arr) {
      arr = [];
      movementsBySource.set(key, arr);
    }
    arr.push(m);
  }

  const diag =
    Math.hypot(
      network.bounds.maxX - network.bounds.minX,
      network.bounds.maxY - network.bounds.minY
    ) || 1;

  const config: SimulationConfig = {
    signalsEnabled: true,
    defaultCycleLength: 60,
    laneOffset: diag * 0.0015,
    stopBack: diag * 0.0035,
    diag,
    ...partialConfig,
  };

  const signals = new Map<string, SignalState>();
  for (const node of network.junctions) {
    const sig = buildSignal(node, network, config.defaultCycleLength);
    if (sig) signals.set(node.id, sig);
  }

  return {
    vehicles: [],
    network,
    linkArc,
    adjacency,
    movementsBySource,
    signals,
    linkApproachCardinal: buildApproachCardinals(network),
    time: 0,
    config,
  };
}

/**
 * Spawn `count` vehicles distributed over the network. Each vehicle is
 * given a random link, position, direction and a desired speed scaled to
 * the drawing extent.
 */
export function spawnVehicles(
  state: SimulationState,
  count: number,
  baseSpeed: number
): SimulationState {
  const { network, config } = state;
  if (network.links.length === 0) return state;
  const id0 =
    state.vehicles.length > 0
      ? Math.max(...state.vehicles.map((v) => v.id)) + 1
      : 0;
  const vehicles: Vehicle[] = [];
  for (let i = 0; i < count; i++) {
    const link = network.links[Math.floor(Math.random() * network.links.length)];
    const lanesPerDir = Math.max(1, link.lanesPerDir ?? 1);
    vehicles.push({
      id: id0 + i,
      linkId: link.id,
      s: Math.random() * link.length,
      dir: Math.random() < 0.5 ? 1 : -1,
      v: 0,
      v0: baseSpeed * (0.75 + Math.random() * 0.5),
      lane: Math.floor(Math.random() * lanesPerDir),
      laneOffset: config.laneOffset,
      color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
    });
  }
  return { ...state, vehicles: state.vehicles.concat(vehicles) };
}

export function clearVehicles(state: SimulationState): SimulationState {
  return { ...state, vehicles: [] };
}

/**
 * IDM (Intelligent Driver Model, Treiber et al.) acceleration. `gap` is
 * positive distance to the leader's rear; pass +Infinity for no leader.
 */
function idmAccel(
  v: number,
  v0: number,
  gap: number,
  leaderV: number,
  s0: number,
  a: number,
  b: number
): number {
  const vc = Math.max(0, v);
  const vc0 = Math.max(v0, 0.01);
  const free = 1 - Math.pow(vc / vc0, IDM_DELTA);
  if (!Number.isFinite(gap) || gap > 1e7) return a * free;
  const dv = vc - leaderV;
  const sStar =
    s0 + Math.max(0, vc * IDM_T + (vc * dv) / (2 * Math.sqrt(a * b)));
  const interaction = Math.pow(sStar / Math.max(gap, 0.01), 2);
  return a * (free - interaction);
}

interface VehicleGroupEntry {
  idx: number;
  s: number;
}

/**
 * Advance every vehicle by `dt` seconds. Applies IDM car-following so
 * vehicles slow for leaders, plus signal-based stop-line braking.
 */
export function step(state: SimulationState, dt: number): void {
  if (dt <= 0) return;
  const { network, vehicles, signals, linkApproachCardinal, config } = state;
  state.time += dt;

  const linksById = new Map<string, NetworkLink>();
  for (const link of network.links) linksById.set(link.id, link);

  // IDM scale: acceleration / decel based on the diagonal.
  const a = config.diag / 250;
  const b = config.diag / 180;
  const s0 = config.diag * 0.0015; // jam distance

  // Group vehicles by (link, dir) for fast leader lookup.
  // Per-lane grouping: vehicles in adjacent lanes don't block each other,
  // so IDM only sees a leader on the same (link, dir, lane) tuple.
  const groups = new Map<string, VehicleGroupEntry[]>();
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const key = `${v.linkId}_${v.dir}_${v.lane}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push({ idx: i, s: v.s });
  }
  for (const arr of groups.values()) {
    // Sort ascending by s so that for dir=+1 the LEADER is the next entry,
    // and for dir=-1 the leader is the PREVIOUS entry.
    arr.sort((p, q) => p.s - q.s);
  }

  // Active cardinals per signalised node for this timestep.
  const greenAt = new Map<string, Set<Cardinal>>();
  if (config.signalsEnabled) {
    for (const [nodeId, sig] of signals) {
      greenAt.set(nodeId, activeCardinals(sig, state.time));
    }
  }

  for (let i = 0; i < vehicles.length; i++) {
    const veh = vehicles[i];
    const link = linksById.get(veh.linkId);
    if (!link) continue;

    // Leader gap on same (link, dir).
    const key = `${veh.linkId}_${veh.dir}`;
    const arr = groups.get(key);
    let leaderGap = Infinity;
    let leaderV = 0;
    if (arr) {
      const idxInArr = arr.findIndex((e) => e.idx === i);
      if (idxInArr >= 0) {
        if (veh.dir === 1 && idxInArr < arr.length - 1) {
          const lead = vehicles[arr[idxInArr + 1].idx];
          leaderGap = Math.max(0, lead.s - veh.s);
          leaderV = lead.v;
        } else if (veh.dir === -1 && idxInArr > 0) {
          const lead = vehicles[arr[idxInArr - 1].idx];
          leaderGap = Math.max(0, veh.s - lead.s);
          leaderV = lead.v;
        }
      }
    }

    // Signal: distance to the upcoming junction's stop line if it's RED for
    // our approach.
    let signalGap = Infinity;
    if (config.signalsEnabled) {
      const approachingNode = veh.dir === 1 ? link.toNode : link.fromNode;
      const sig = signals.get(approachingNode);
      if (sig) {
        const greens = greenAt.get(approachingNode) ?? new Set();
        const cards = linkApproachCardinal.get(link.id);
        if (cards) {
          // The cardinal we present to this node is the cardinal recorded
          // for this end of the link.
          const presented =
            veh.dir === 1 ? cards.toCardinal : cards.fromCardinal;
          if (!greens.has(presented)) {
            const stopAt =
              veh.dir === 1
                ? Math.max(0, link.length - config.stopBack)
                : Math.min(link.length, config.stopBack);
            const distToStop =
              veh.dir === 1
                ? stopAt - veh.s
                : veh.s - stopAt;
            if (distToStop > -0.5) signalGap = Math.max(0, distToStop);
          }
        }
      }
    }

    const gap = Math.min(leaderGap, signalGap);
    const lv = signalGap < leaderGap ? 0 : leaderV;

    const accel = idmAccel(veh.v, veh.v0, gap, lv, s0, a, b);
    veh.v = Math.max(0, veh.v + accel * dt);
    veh.s += veh.v * dt * veh.dir;

    // Reached the end-node in current travel direction?
    const overshoot =
      veh.dir === 1
        ? Math.max(0, veh.s - link.length)
        : Math.max(0, -veh.s);
    if (overshoot > 0) {
      const movKey = `${veh.linkId}_${veh.dir}`;
      const options = state.movementsBySource.get(movKey);
      if (options && options.length > 0) {
        const mov = options[Math.floor(Math.random() * options.length)];
        const next = linksById.get(mov.toLinkId);
        if (next) {
          veh.linkId = next.id;
          veh.dir = mov.toDirAtDeparture;
          // Carry the overshoot into the new link so vehicles don't lose
          // distance crossing the junction.
          veh.s =
            mov.toDirAtDeparture === 1
              ? Math.min(mov.toS + overshoot, next.length)
              : Math.max(mov.toS - overshoot, 0);
          const newLanesPerDir = Math.max(1, next.lanesPerDir ?? 1);
          if (veh.lane >= newLanesPerDir) veh.lane = newLanesPerDir - 1;
          if (veh.lane < 0) veh.lane = 0;
          continue;
        }
      }
      // No legal successor: bounce back along the current link rather
      // than sit at the end indefinitely.
      veh.dir = (veh.dir === 1 ? -1 : 1) as 1 | -1;
      veh.s = veh.dir === 1 ? overshoot : link.length - overshoot;
    }
  }
}

/** For renderers: which cardinals are currently green at a given node. */
export function activeGreen(
  state: SimulationState,
  nodeId: string
): Set<Cardinal> | null {
  const sig = state.signals.get(nodeId);
  if (!sig || !state.config.signalsEnabled) return null;
  return activeCardinals(sig, state.time);
}
