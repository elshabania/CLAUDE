/**
 * Highway Capacity Manual (HCM 6th edition) capacity / delay / queue
 * analytics. Ported from the Junction Operations Suite reference; see
 * comments below for the relevant equation numbers.
 *
 * Scope: signalised intersections (Ch 19), roundabouts (Ch 22), and
 * two-way stop-controlled (TWSC) intersections (Ch 20). Per-approach
 * inputs are kept simple enough to enter for an auto-discovered junction
 * from a master plan PDF, while the published equations are preserved so
 * the output is comparable to a TIS-style hand analysis.
 */

export const DIRS = ["NB", "EB", "SB", "WB"] as const;
export type Cardinal = (typeof DIRS)[number];

export const MOVS = ["L", "T", "R"] as const;
export type Movement = (typeof MOVS)[number];

export type JunctionType = "signalized" | "roundabout" | "twsc";
export type AreaType = "CBD" | "other";
export type CoordinationLevel = "good" | "fair" | "isolated" | "poor";

export type LOS = "A" | "B" | "C" | "D" | "E" | "F";

export const LOS_COLORS: Record<LOS, string> = {
  A: "#22dd77",
  B: "#88ee44",
  C: "#fbbf24",
  D: "#ff8c1a",
  E: "#ff5544",
  F: "#ee2244",
};

export const LOS_TEXT: Record<LOS, string> = {
  A: "free flow",
  B: "reasonable",
  C: "stable",
  D: "unstable",
  E: "at capacity",
  F: "breakdown",
};

const BASE_SAT = 1900;
const HV_DEFAULT = 0.08;
const PCE_HV = 2.0;
const GRADE_DEFAULT = 0;
const AREA_TYPE_DEFAULT: AreaType = "other";

const fHV = (hv: number, pce = PCE_HV) => 1 / (1 + hv * (pce - 1));
const fG = (gradePct: number) => 1 - gradePct / 200;
const fLT = (m: Movement) => (m === "L" ? 0.95 : 1.0);
const fRT = (m: Movement) => (m === "R" ? 0.85 : 1.0);
const fA = (area: AreaType) => (area === "CBD" ? 0.9 : 1.0);
const fLU = (n: number) => (n >= 2 ? 0.95 : 1.0);

interface SatOpts {
  hv?: number;
  grade?: number;
  areaType?: AreaType;
}

/** HCM Eq 19-8 prevailing saturation flow (veh/h). */
export function satFlow(m: Movement, n: number, opts: SatOpts = {}): number {
  const hv = opts.hv ?? HV_DEFAULT;
  const grade = opts.grade ?? GRADE_DEFAULT;
  const area = opts.areaType ?? AREA_TYPE_DEFAULT;
  return BASE_SAT * n * fHV(hv) * fG(grade) * fLT(m) * fRT(m) * fA(area) * fLU(n);
}

/** Uniform delay term d1 (HCM Eq 19-26). */
function d1(C: number, g: number, X: number): number {
  const gC = g / C;
  const Xe = Math.min(1, X);
  const den = 1 - Xe * gC;
  return den <= 0.001 ? 0 : (0.5 * C * (1 - gC) ** 2) / den;
}

/** Incremental delay term d2 (HCM Eq 19-27). */
function d2(X: number, c: number, T = 0.25, k = 0.5, I = 1): number {
  if (c <= 0) return 600;
  const t = (X - 1) ** 2 + (8 * k * I * X) / (c * T);
  const raw = 900 * T * (X - 1 + Math.sqrt(Math.max(0, t)));
  return Math.min(600, raw);
}

/** HCM Eq 19-22 control delay (signalised), bounded at 600s. */
export function ctrlDelay(
  C: number,
  g: number,
  X: number,
  c: number,
  PF = 1
): number {
  return Math.min(600, d1(C, g, X) * PF + d2(X, c));
}

/** 95th-percentile back-of-queue, vehicles per lane (HCM Eq 19-44/45). */
export function queue95(
  C: number,
  g: number,
  X: number,
  c: number,
  T = 0.25
): number {
  if (c <= 0) return 0;
  const gC = g / C;
  const Q1 = c * gC * (1 - gC) * (1 / Math.max(0.05, 1 - Math.min(1, X) * gC));
  const Q1veh = Q1 * (C / 3600);
  const Q2veh = 0.25 * c * T * (X - 1 + Math.sqrt((X - 1) ** 2 + (8 * X) / (c * T)));
  return Math.max(0, Q1veh) + Math.max(0, Q2veh);
}

/** Convert vehicles to physical queue length in metres (7.5 m/veh — HCM default). */
export const queue95m = (q95veh: number): number => q95veh * 7.5;

/** HCM Ch 22 single- or multi-lane roundabout delay. */
export function rabDelay(v: number, lanes: number, vCirc?: number): number {
  const vc = vCirc ?? v * 0.7;
  const A = lanes >= 2 ? 1420 : 1380;
  const B = lanes >= 2 ? 0.00085 : 0.00102;
  const cap = A * Math.exp(-B * vc) * lanes;
  if (cap <= 0) return 600;
  const X = v / cap;
  if (X >= 1) return Math.min(600, 60 + 100 * (X - 1));
  return Math.min(
    600,
    3600 / cap +
      900 * 0.25 * (X - 1 + Math.sqrt((X - 1) ** 2 + (3600 * X) / (450 * cap)))
  );
}

/** HCM Ch 20 simplified TWSC delay. */
export function twscDelay(v: number, lanes: number): number {
  const cap = 800 * lanes;
  const X = v / cap;
  if (X >= 1) return Math.min(600, 80 + 150 * (X - 1));
  return Math.min(
    600,
    3600 / cap +
      900 * 0.25 * (X - 1 + Math.sqrt((X - 1) ** 2 + (3600 * X) / (450 * cap)))
  );
}

export function progressionFactor(coord: CoordinationLevel): number {
  if (coord === "good") return 0.85;
  if (coord === "fair") return 0.95;
  if (coord === "poor") return 1.2;
  return 1.0;
}

export const losSig = (d: number): LOS =>
  d <= 10 ? "A" : d <= 20 ? "B" : d <= 35 ? "C" : d <= 55 ? "D" : d <= 80 ? "E" : "F";

export const losUns = (d: number): LOS =>
  d <= 10 ? "A" : d <= 15 ? "B" : d <= 25 ? "C" : d <= 35 ? "D" : d <= 50 ? "E" : "F";

/* -------------------------------------------------------------------------
 * Urban street SEGMENT Level of Service (HCM 6th ed, Chapter 18).
 *
 * Segment LOS grades the road LINK itself (not the junction) from the ratio
 * of average travel speed to the base free-flow speed. The travel speed
 * combines segment running time with the through-movement control delay at
 * the downstream boundary intersection.
 * ---------------------------------------------------------------------- */

/** HCM Exhibit 18-1 LOS thresholds: travel speed as % of base FFS.
 *  When the demand/capacity ratio exceeds 1.0, LOS is F regardless. */
export function losSegment(speedRatio: number, vc: number): LOS {
  if (vc > 1.0) return "F";
  if (speedRatio > 0.85) return "A";
  if (speedRatio > 0.67) return "B";
  if (speedRatio > 0.5) return "C";
  if (speedRatio > 0.4) return "D";
  if (speedRatio > 0.3) return "E";
  return "F";
}

/**
 * Estimate base free-flow speed (km/h). Starts from a class default and
 * nudges for narrow carriageways (HCM lowers FFS as lane width drops). The
 * caller can pass a measured posted speed as `baseKmh` to skip the guess.
 */
export function estimateFreeFlowSpeed(
  baseKmh: number,
  widthM: number | null,
  _fclass: string
): number {
  let ffs = baseKmh;
  if (widthM != null && widthM > 0) {
    // Approximate per-lane width; standard lane = 3.6 m. Narrow lanes shed
    // a few km/h (HCM Ch.18 base FFS adjustment, simplified).
    const perLane = widthM / 2; // assume ~2 lanes across the carriageway
    if (perLane < 3.0) ffs -= 5;
    else if (perLane < 3.3) ffs -= 2;
  }
  return Math.max(20, ffs);
}

export interface SegmentLOSInput {
  /** Segment length in metres. */
  lengthM: number;
  /** Base free-flow speed in km/h. */
  ffsKmh: number;
  /** Directional demand volume in veh/h. */
  demandVeh: number;
  /** Number of through lanes in the analysis direction. */
  lanes: number;
  /** Optional through control delay at the downstream node (s/veh). When
   *  omitted, estimated from the demand/capacity ratio. */
  throughDelayS?: number;
  /** Saturation capacity per lane (veh/h/lane). Default 1900 (HCM base). */
  capacityPerLane?: number;
}

export interface SegmentLOSResult {
  /** Average travel speed over the segment (km/h). */
  travelSpeedKmh: number;
  /** Base free-flow speed used (km/h). */
  ffsKmh: number;
  /** Travel speed / FFS. */
  speedRatio: number;
  /** Demand/capacity ratio. */
  vc: number;
  los: LOS;
  /** Running time over the segment (s). */
  runningTimeS: number;
  /** Through control delay applied at the boundary node (s). */
  throughDelayS: number;
}

/**
 * Compute HCM Ch.18 segment LOS. Running time uses the base FFS over the
 * segment length; control delay at the downstream intersection is added to
 * get the effective travel time, hence the travel speed.
 */
export function segmentLOS(input: SegmentLOSInput): SegmentLOSResult {
  const ffs = Math.max(5, input.ffsKmh);
  const cap = (input.capacityPerLane ?? 1900) * Math.max(1, input.lanes);
  const vc = cap > 0 ? input.demandVeh / cap : 0;

  // Free-flow running time over the segment (s) = length / speed.
  const ffsMs = (ffs * 1000) / 3600;
  const runningTimeS = ffsMs > 0 ? input.lengthM / ffsMs : 0;

  // Through control delay at the boundary node. If not supplied, estimate
  // from v/c with a simple BPR-style delay surrogate so LOS still responds
  // to demand without a full signal timing model.
  const throughDelayS =
    input.throughDelayS ??
    (vc <= 0
      ? 0
      : Math.min(120, 8 + 30 * Math.pow(Math.min(vc, 1.2), 4)));

  const travelTimeS = runningTimeS + throughDelayS;
  const travelSpeedMs = travelTimeS > 0 ? input.lengthM / travelTimeS : ffsMs;
  const travelSpeedKmh = (travelSpeedMs * 3600) / 1000;
  const speedRatio = ffs > 0 ? travelSpeedKmh / ffs : 0;

  return {
    travelSpeedKmh,
    ffsKmh: ffs,
    speedRatio,
    vc,
    los: losSegment(speedRatio, vc),
    runningTimeS,
    throughDelayS,
  };
}

export interface ApproachInputs {
  lanes: Record<Movement, number>;
  greenTime: number; // seconds
  volumes: Record<Movement, number>; // veh/h
}

export interface JunctionInputs {
  type: JunctionType;
  cycleLength: number; // seconds
  hv?: number;
  grade?: number;
  areaType?: AreaType;
  coord?: CoordinationLevel;
  /** Available link length downstream — used for spillback flag. */
  linkLength?: number;
  /** Pedestrian flow (ped/h) crossing the approach. */
  pedFlow?: number;
  approaches: Record<Cardinal, ApproachInputs>;
}

export interface MovementResult {
  v: number;
  c: number;
  X: number;
  d: number;
  los: LOS;
  lanes: number;
  q95: number;
  q95m: number;
  s?: number;
}

export interface ApproachResult {
  movements: Record<Movement, MovementResult>;
  delay: number;
  vol: number;
  vcMax: number;
  q95mMax: number;
  los: LOS;
  spillback: boolean;
}

export interface JunctionResult {
  approaches: Record<Cardinal, ApproachResult>;
  delay: number;
  totalVolume: number;
  vcMax: number;
  q95mMax: number;
  los: LOS;
  PF: number;
  pedCallProb: number;
  spillbackAny: boolean;
}

/**
 * Run HCM analysis on one junction. Returns delay, LOS, queue and v/c per
 * approach + a junction-wide rollup.
 */
export function analyzeJunction(j: JunctionInputs): JunctionResult {
  const C = j.cycleLength;
  const hv = j.hv ?? HV_DEFAULT;
  const grade = j.grade ?? GRADE_DEFAULT;
  const area = j.areaType ?? AREA_TYPE_DEFAULT;
  const PF = progressionFactor(j.coord ?? "isolated");
  const linkLen = j.linkLength ?? 285;
  const pedFlow = j.pedFlow ?? 0;
  const pedCallProb = 1 - Math.exp((-pedFlow * C) / 3600);
  const pedLostTime = 12 * pedCallProb;

  const approaches = {} as Record<Cardinal, ApproachResult>;
  let totalDelayWeighted = 0;
  let totalVolume = 0;
  let q95mMaxOverall = 0;
  let vcMaxOverall = 0;

  for (const dir of DIRS) {
    const a = j.approaches[dir];
    const ap: ApproachResult = {
      movements: {} as Record<Movement, MovementResult>,
      delay: 0,
      vol: 0,
      vcMax: 0,
      q95mMax: 0,
      los: "A",
      spillback: false,
    };

    for (const m of MOVS) {
      const v = a.volumes[m] || 0;
      const lanes = a.lanes[m] || 0;
      if (v <= 0 || lanes <= 0) {
        ap.movements[m] = {
          v: 0,
          c: 0,
          X: 0,
          d: 0,
          los: "A",
          lanes,
          q95: 0,
          q95m: 0,
        };
        continue;
      }
      const s = satFlow(m, lanes, { hv, grade, areaType: area });
      const g = Math.max(5, a.greenTime - pedLostTime);
      const c = s * (g / C);
      const X = v / c;
      const d =
        j.type === "signalized"
          ? ctrlDelay(C, g, X, c, PF)
          : j.type === "roundabout"
          ? rabDelay(v, lanes)
          : twscDelay(v, lanes);
      const los = j.type === "signalized" ? losSig(d) : losUns(d);
      const q95 =
        j.type === "signalized"
          ? queue95(C, g, X, c) / lanes
          : X > 0.5
          ? (v / Math.max(1, lanes)) * 0.06
          : 0;
      const q95m = queue95m(q95);
      if (q95m > linkLen * 0.85) ap.spillback = true;

      ap.movements[m] = { v, s, c, X, d, los, lanes, q95, q95m };
      ap.vol += v;
      ap.delay += d * v;
      ap.vcMax = Math.max(ap.vcMax, X);
      ap.q95mMax = Math.max(ap.q95mMax, q95m);
    }

    ap.delay = ap.vol > 0 ? ap.delay / ap.vol : 0;
    ap.los = j.type === "signalized" ? losSig(ap.delay) : losUns(ap.delay);
    approaches[dir] = ap;
    totalDelayWeighted += ap.delay * ap.vol;
    totalVolume += ap.vol;
    q95mMaxOverall = Math.max(q95mMaxOverall, ap.q95mMax);
    vcMaxOverall = Math.max(vcMaxOverall, ap.vcMax);
  }

  const overallDelay = totalVolume > 0 ? totalDelayWeighted / totalVolume : 0;
  return {
    approaches,
    delay: overallDelay,
    totalVolume,
    vcMax: vcMaxOverall,
    q95mMax: q95mMaxOverall,
    los: j.type === "signalized" ? losSig(overallDelay) : losUns(overallDelay),
    PF,
    pedCallProb,
    spillbackAny: DIRS.some((d) => approaches[d].spillback),
  };
}

/** Default per-approach inputs for a freshly discovered junction. */
export function defaultApproachInputs(): ApproachInputs {
  return {
    lanes: { L: 1, T: 2, R: 1 },
    greenTime: 30,
    volumes: { L: 100, T: 600, R: 100 },
  };
}

export function defaultJunctionInputs(): JunctionInputs {
  return {
    type: "signalized",
    cycleLength: 120,
    hv: HV_DEFAULT,
    grade: GRADE_DEFAULT,
    areaType: AREA_TYPE_DEFAULT,
    coord: "isolated",
    linkLength: 285,
    pedFlow: 0,
    approaches: {
      NB: defaultApproachInputs(),
      EB: defaultApproachInputs(),
      SB: defaultApproachInputs(),
      WB: defaultApproachInputs(),
    },
  };
}
