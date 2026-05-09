import type { DrawingSegment } from "@/lib/road-detect";

/**
 * A polyline derived as the medial axis between a pair of curbs, with the
 * average pavement width along that pair and the closed polygon describing
 * the road-body asphalt enclosed between the two curbs.
 */
export interface DerivedCenterline {
  /** Flat [x0,y0,x1,y1,...] in source PDF user units, y-up. */
  points: number[];
  /** Average gap between paired curbs (= road body width) in source units. */
  width: number;
  /** Cumulative arc length of the centerline. */
  length: number;
  /** Closed polygon (flat point array) of the asphalt area between the two
   *  curbs. CCW winding when curb A is on the right of the centerline. */
  bodyPolygon: number[];
}

interface Sample {
  x: number;
  y: number;
  /** Unit tangent of the parent curb at this sample. */
  tx: number;
  ty: number;
  /** Index of the parent curb segment in the input array. */
  curbIdx: number;
  /** Position along the parent curb (cumulative arc length). */
  s: number;
}

interface PairedMid {
  /** Midpoint between source sample and paired sample. */
  x: number;
  y: number;
  /** Source curb sample (the side this chain is anchored to). */
  ax: number;
  ay: number;
  /** Paired sample (on the other curb). */
  bx: number;
  by: number;
  s: number; // position along the source curb
  width: number;
  pairCurbIdx: number;
}

interface DeriveOptions {
  /** Maximum gap between two curbs to be considered a pair (= max road width). */
  maxRoadWidth: number;
  /** Distance between consecutive sample points along each curb. */
  sampleStep: number;
  /** Tangent-alignment cosine threshold (0..1). 0.85 = within ~32° parallel. */
  parallelCos?: number;
  /** Perpendicularity cosine threshold (0..1). 0.4 = pair vector within ~24° of perpendicular. */
  perpCos?: number;
  /** Minimum number of midpoints in a centerline before it's emitted. */
  minPoints?: number;
}

/**
 * Walk a polyline at a fixed step, emitting samples with tangents.
 */
function sampleCurb(
  points: number[],
  step: number,
  curbIdx: number,
  out: Sample[]
): void {
  if (points.length < 4) return;
  let cumulative = 0;
  let nextEmit = 0;
  for (let i = 2; i < points.length; i += 2) {
    const x1 = points[i - 2];
    const y1 = points[i - 1];
    const x2 = points[i];
    const y2 = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    const tx = dx / segLen;
    const ty = dy / segLen;
    while (nextEmit <= cumulative + segLen) {
      const t = (nextEmit - cumulative) / segLen;
      out.push({
        x: x1 + dx * t,
        y: y1 + dy * t,
        tx,
        ty,
        curbIdx,
        s: nextEmit,
      });
      nextEmit += step;
    }
    cumulative += segLen;
  }
}

/**
 * For every curb-pair, emit a sequence of midpoints sampled along the
 * source curb. Each midpoint also records the distance to its pair so the
 * caller can derive the road width.
 *
 * Pairing test: a candidate sample on a different curb must be:
 *   - within `maxRoadWidth` distance,
 *   - have a tangent roughly parallel (or anti-parallel) to ours,
 *   - sit roughly perpendicular to our tangent (so we pair across the
 *     pavement, not along it).
 *
 * Among candidates passing those tests we keep the closest one.
 */
export function deriveCenterlinesFromCurbs(
  curbs: DrawingSegment[],
  opts: DeriveOptions
): DerivedCenterline[] {
  const parallelCos = opts.parallelCos ?? 0.85;
  const perpCos = opts.perpCos ?? 0.4;
  const minPoints = opts.minPoints ?? 3;
  if (curbs.length === 0) return [];

  // 1. Sample every curb at fixed step.
  const samples: Sample[] = [];
  curbs.forEach((c, idx) => sampleCurb(c.points, opts.sampleStep, idx, samples));
  if (samples.length === 0) return [];

  // 2. Spatial grid keyed at cellSize = maxRoadWidth so a paired sample is
  //    always within a 3x3 neighbourhood.
  const cellSize = Math.max(opts.maxRoadWidth, 1);
  const grid = new Map<string, Sample[]>();
  for (const s of samples) {
    const k = `${Math.floor(s.x / cellSize)}_${Math.floor(s.y / cellSize)}`;
    let bucket = grid.get(k);
    if (!bucket) {
      bucket = [];
      grid.set(k, bucket);
    }
    bucket.push(s);
  }

  // 3. For each curb's samples, find the closest paired sample on another
  //    curb. Group results by (this curb, pair curb).
  type PairKey = string;
  const pairChains = new Map<PairKey, PairedMid[]>();

  for (const s of samples) {
    const cx = Math.floor(s.x / cellSize);
    const cy = Math.floor(s.y / cellSize);
    let best: { sample: Sample; dist: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}_${cy + dy}`);
        if (!bucket) continue;
        for (const t of bucket) {
          if (t.curbIdx === s.curbIdx) continue;
          // Tangent alignment - parallel or anti-parallel both ok.
          const cosTan = Math.abs(s.tx * t.tx + s.ty * t.ty);
          if (cosTan < parallelCos) continue;
          // Vector from s to t in world space.
          const vx = t.x - s.x;
          const vy = t.y - s.y;
          const dist = Math.hypot(vx, vy);
          if (dist < 1e-3 || dist > opts.maxRoadWidth) continue;
          // The pair vector should run roughly perpendicular to our tangent.
          const cosWithTan = Math.abs(vx * s.tx + vy * s.ty) / dist;
          if (cosWithTan > perpCos) continue;
          if (!best || dist < best.dist) best = { sample: t, dist };
        }
      }
    }
    if (!best) continue;
    const key: PairKey =
      s.curbIdx < best.sample.curbIdx
        ? `${s.curbIdx}|${best.sample.curbIdx}|${s.curbIdx}`
        : `${best.sample.curbIdx}|${s.curbIdx}|${s.curbIdx}`;
    let chain = pairChains.get(key);
    if (!chain) {
      chain = [];
      pairChains.set(key, chain);
    }
    chain.push({
      x: (s.x + best.sample.x) / 2,
      y: (s.y + best.sample.y) / 2,
      ax: s.x,
      ay: s.y,
      bx: best.sample.x,
      by: best.sample.y,
      s: s.s,
      width: best.dist,
      pairCurbIdx: best.sample.curbIdx,
    });
  }

  // 4. Each pair generates two chains (one from each curb's perspective).
  //    Keep the one with more samples (denser coverage) and dedupe by
  //    unordered curb pair.
  const bestPerUnordered = new Map<string, PairedMid[]>();
  for (const [key, chain] of pairChains) {
    const [a, b] = key.split("|");
    const unordered = `${Math.min(+a, +b)}|${Math.max(+a, +b)}`;
    const cur = bestPerUnordered.get(unordered);
    if (!cur || chain.length > cur.length) {
      bestPerUnordered.set(unordered, chain);
    }
  }

  // 5. Emit centerlines + body polygons.
  const out: DerivedCenterline[] = [];
  for (const chain of bestPerUnordered.values()) {
    if (chain.length < minPoints) continue;
    chain.sort((p, q) => p.s - q.s);
    const points: number[] = [];
    let totalW = 0;
    let totalLen = 0;
    let prevX = chain[0].x;
    let prevY = chain[0].y;
    points.push(prevX, prevY);
    totalW += chain[0].width;
    for (let i = 1; i < chain.length; i++) {
      const p = chain[i];
      points.push(p.x, p.y);
      totalLen += Math.hypot(p.x - prevX, p.y - prevY);
      totalW += p.width;
      prevX = p.x;
      prevY = p.y;
    }

    // Body polygon = curb-A samples in order, then curb-B samples reversed.
    // Closes a band-shaped polygon around the centerline that fills the
    // actual asphalt between the two curbs.
    const body: number[] = [];
    for (const p of chain) body.push(p.ax, p.ay);
    for (let i = chain.length - 1; i >= 0; i--) body.push(chain[i].bx, chain[i].by);

    out.push({
      points,
      width: totalW / chain.length,
      length: totalLen,
      bodyPolygon: body,
    });
  }
  return out;
}
