"use client";

import type { DrawingSegment } from "@/lib/road-detect";
import type { DerivedCenterline } from "@/lib/centerline-derivation";
import { getGeo } from "@/lib/wasm/geo";
import { closeMask } from "@/lib/morphology";

/**
 * Image-based medial-axis road-skeleton extractor.
 *
 * The pair-matching approach in `centerline-derivation.ts` fails on curves,
 * junctions and asymmetric road sections. This extractor sidesteps the
 * pairing problem entirely by working on the *rendered shape* of all kerbs:
 *
 *   1. Rasterize every kerb polyline to a canvas at fixed resolution.
 *   2. Connected-component label the white interior to identify the road
 *      asphalt as one big region (drops page background and small holes).
 *   3. Distance-transform the asphalt mask: each pixel's value = distance
 *      to the nearest kerb. The road *width* at any point is 2 x distance.
 *   4. Zhang-Suen thinning produces a 1-pixel-wide skeleton sitting on the
 *      ridge of the distance field - that's the medial axis = the natural
 *      drive line of every corridor.
 *   5. Trace the skeleton: skeleton-pixel-graph -> polylines, with branch
 *      points becoming junctions and dead-ends becoming corridor caps.
 *   6. Build a body polygon per polyline by sweeping perpendicular to the
 *      tangent at each centerline point, offset by the distance-field
 *      value (so the polygon hugs the actual kerbs).
 *
 * Output shape matches `DerivedCenterline` so the rest of the network
 * builder, simulation and 3D viewer don't change.
 */

interface ExtractOptions {
  /** Pixels along the longer axis of the rasterized canvas. */
  resolution?: number;
  /** Stroke width when drawing kerbs into the raster (in pixels). */
  kerbStrokePx?: number;
  /** Skip components smaller than this many pixels. */
  minComponentPixels?: number;
  /** Skip output polylines shorter than this many pixels. */
  minPolylinePx?: number;
  /** Cap on Zhang-Suen iterations - the algorithm converges in ~30-50 for
   *  a typical road network; this is just a safety. */
  thinIterationCap?: number;
  /** Thinner: 'zhang-suen' (default) | 'guo-hall' | 'distance-ridge' |
   *  'erosion' (iterative one-px morphological erosion). */
  thinner?: "zhang-suen" | "guo-hall" | "distance-ridge" | "erosion";
  /** FILL mode: rasterise the input polygons as FILLED areas and
   *  morphologically close the hatch gaps, instead of stroking kerb outlines
   *  and flood-filling enclosed interiors. This makes the skeleton cover the
   *  full road FOOTPRINT (every hatch-filled corridor), giving full coverage
   *  AND clean topology - the routable network we need. */
  fillMode?: boolean;
  /** Close radius (px) used in fillMode to bridge hatch-tile gaps. */
  closeRadiusPx?: number;
}

type RasterCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

function createRasterContext(w: number, h: number): RasterCtx | null {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext("2d");
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h).getContext("2d");
  }
  return null;
}

export function extractRoadSkeleton(
  curbs: DrawingSegment[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  opts: ExtractOptions = {}
): DerivedCenterline[] {
  if (curbs.length === 0) return [];

  const targetSize = opts.resolution ?? 1100;
  const stroke = opts.kerbStrokePx ?? 2;
  const minComponent = opts.minComponentPixels ?? 800;
  const minPolylinePx = opts.minPolylinePx ?? 18;
  const thinCap = opts.thinIterationCap ?? 80;

  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (w <= 0 || h <= 0) return [];
  const aspect = w / h;
  const W = aspect >= 1 ? targetSize : Math.max(64, Math.round(targetSize * aspect));
  const H = aspect >= 1 ? Math.max(64, Math.round(targetSize / aspect)) : targetSize;
  const scale = W / w;

  const x2px = (x: number) => (x - bounds.minX) * scale;
  const y2py = (y: number) => (bounds.maxY - y) * scale;
  const px2x = (px: number) => bounds.minX + px / scale;
  const py2y = (py: number) => bounds.maxY - py / scale;

  const fillMode = opts.fillMode === true;
  const N = W * H;

  // 1. Rasterize. Works on the main thread (HTMLCanvas) and inside a Web
  // Worker (OffscreenCanvas) so the heavy thinning can run off the UI thread.
  const ctx = createRasterContext(W, H);
  if (!ctx) return [];
  const mask = new Uint8Array(N);

  if (fillMode) {
    // FILL the road polygons (white on black), so the mask IS the road
    // footprint. Hatch tiles render as stripes; the close below fuses them.
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "white";
    for (const c of curbs) {
      const p = c.points;
      if (p.length < 6) continue;
      ctx.beginPath();
      ctx.moveTo(x2px(p[0]), y2py(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(x2px(p[i]), y2py(p[i + 1]));
      ctx.closePath();
      ctx.fill();
    }
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < N; i++) mask[i] = img.data[i * 4] > 128 ? 1 : 0;
  } else {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "black";
    ctx.lineWidth = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const c of curbs) {
      if (c.points.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(x2px(c.points[0]), y2py(c.points[1]));
      for (let i = 2; i < c.points.length; i += 2) {
        ctx.lineTo(x2px(c.points[i]), y2py(c.points[i + 1]));
      }
      ctx.stroke();
    }
    const img = ctx.getImageData(0, 0, W, H);
    // 1 = white (potential interior / asphalt); 0 = black (kerb) or unset.
    for (let i = 0; i < N; i++) mask[i] = img.data[i * 4] > 128 ? 1 : 0;
  }

  // The compiled C++ core (WASM) runs the hot pixel kernels (labelling,
  // distance transform, thinning) when loaded; otherwise identical JS runs.
  const geo = getGeo();

  // 2. Build the asphalt `keep` mask.
  const keep = new Uint8Array(N);
  if (fillMode) {
    // Close the hatch gaps so the striped tiles fuse into solid corridors,
    // then the closed footprint IS the asphalt. (No flood-fill / background
    // drop needed: black = off-road, white = road.)
    const radius = opts.closeRadiusPx ?? Math.max(2, Math.round(scale * 1.5));
    const closed = closeMask(mask, W, H, radius);
    keep.set(closed);
  } else {
  // Connected-component label all white pixels (4-connected). Drop the
  // largest (page background) and tiny components. The remaining is/are the
  // asphalt.
  let labels: Int32Array;
  let sizes: number[];
  if (geo) {
    const cc = geo.connectedComponents(mask, W, H);
    labels = cc.labels;
    sizes = cc.sizes;
  } else {
    labels = new Int32Array(N);
    sizes = [0];
    const queue = new Int32Array(N);
    let nextLabel = 1;
    for (let i = 0; i < N; i++) {
      if (mask[i] !== 1 || labels[i] !== 0) continue;
      labels[i] = nextLabel;
      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = i;
      let size = 0;
      while (qHead < qTail) {
        const idx = queue[qHead++];
        size++;
        const x = idx % W;
        const y = (idx / W) | 0;
        if (x > 0) {
          const n = idx - 1;
          if (mask[n] === 1 && labels[n] === 0) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (x < W - 1) {
          const n = idx + 1;
          if (mask[n] === 1 && labels[n] === 0) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (y > 0) {
          const n = idx - W;
          if (mask[n] === 1 && labels[n] === 0) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (y < H - 1) {
          const n = idx + W;
          if (mask[n] === 1 && labels[n] === 0) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
      }
      sizes.push(size);
      nextLabel++;
    }
  }
  if (sizes.length <= 2) return [];
  // The largest white component is the page background. Drop it. Keep
  // every other component above minComponent threshold.
  let largestLabel = 0;
  let largestSize = 0;
  for (let l = 1; l < sizes.length; l++) {
    if (sizes[l] > largestSize) {
      largestSize = sizes[l];
      largestLabel = l;
    }
  }
  for (let i = 0; i < N; i++) {
    const l = labels[i];
    if (l === 0 || l === largestLabel) continue;
    if (sizes[l] < minComponent) continue;
    keep[i] = 1;
  }
  } // end non-fill (kerb-flood) mode

  // 3. Distance transform of the asphalt mask. Two-pass Manhattan (close
  // enough to Euclidean for our purpose; faster than the proper EDT).
  let dist: Int32Array;
  if (geo) {
    dist = geo.distanceL1(keep, W, H);
  } else {
    const INF = W + H + 1;
    dist = new Int32Array(N);
    for (let i = 0; i < N; i++) dist[i] = keep[i] === 1 ? INF : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (keep[idx] === 0) continue;
        let d = dist[idx];
        if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
        if (y > 0) d = Math.min(d, dist[idx - W] + 1);
        dist[idx] = d;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const idx = y * W + x;
        if (keep[idx] === 0) continue;
        let d = dist[idx];
        if (x < W - 1) d = Math.min(d, dist[idx + 1] + 1);
        if (y < H - 1) d = Math.min(d, dist[idx + W] + 1);
        dist[idx] = d;
      }
    }
  }

  // 4. Thin to a 1-pixel-wide skeleton. Algorithm chosen by opts.thinner.
  // All variants operate on a copy so we keep `keep` for the body-polygon
  // sweep later.
  const skel = keep.slice();
  const thinner = opts.thinner ?? "zhang-suen";
  if (thinner === "guo-hall") guoHall(skel, W, H, thinCap);
  else if (thinner === "distance-ridge") distanceRidge(skel, dist, W, H);
  else if (thinner === "erosion") morphologicalErosion(skel, W, H, thinCap);
  else if (geo) geo.thinZhangSuen(skel, W, H, thinCap);
  else zhangSuen(skel, W, H, thinCap);

  // 5. Trace skeleton -> polylines.
  const polylines = traceSkeleton(skel, W, H, minPolylinePx);

  // 6. Convert polylines to DerivedCenterline + sweep perpendicular for
  // body polygons.
  const out: DerivedCenterline[] = [];
  const pixelToUnit = 1 / scale;
  for (const px of polylines) {
    if (px.length < 4) continue;
    // Convert pixel coords to PDF units.
    const points: number[] = [];
    for (let i = 0; i < px.length; i += 2) {
      points.push(px2x(px[i]), py2y(px[i + 1]));
    }
    // Length in PDF units.
    let length = 0;
    for (let i = 2; i < points.length; i += 2) {
      length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    }
    // Average half-width from distance field.
    let totalDistPx = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 2) {
      const idx = px[i + 1] * W + px[i];
      totalDistPx += dist[idx];
      n++;
    }
    const avgHalfWidth = ((totalDistPx / n) - 0.5) * pixelToUnit;
    const width = Math.max(0, avgHalfWidth * 2);

    // Body polygon: at each centerline point, offset perpendicular by the
    // local distance-field value to land exactly on the kerb.
    const bodyPolygon = sweepBody(px, dist, W, scale, x2px, y2py, px2x, py2y);

    out.push({ points, width, length, bodyPolygon });
  }
  return out;
}

function zhangSuen(mask: Uint8Array, W: number, H: number, cap: number) {
  let changed = true;
  let iter = 0;
  const toRemove: number[] = [];
  while (changed && iter++ < cap) {
    changed = false;
    for (const subIter of [0, 1]) {
      toRemove.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          if (mask[idx] !== 1) continue;
          const p2 = mask[idx - W];
          const p3 = mask[idx - W + 1];
          const p4 = mask[idx + 1];
          const p5 = mask[idx + W + 1];
          const p6 = mask[idx + W];
          const p7 = mask[idx + W - 1];
          const p8 = mask[idx - 1];
          const p9 = mask[idx - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          // Count 0->1 transitions in the cyclic sequence p2..p9.
          let A = 0;
          if (p2 === 0 && p3 === 1) A++;
          if (p3 === 0 && p4 === 1) A++;
          if (p4 === 0 && p5 === 1) A++;
          if (p5 === 0 && p6 === 1) A++;
          if (p6 === 0 && p7 === 1) A++;
          if (p7 === 0 && p8 === 1) A++;
          if (p8 === 0 && p9 === 1) A++;
          if (p9 === 0 && p2 === 1) A++;
          if (A !== 1) continue;
          if (subIter === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toRemove.push(idx);
        }
      }
      for (const idx of toRemove) {
        mask[idx] = 0;
        changed = true;
      }
    }
  }
}

const NEIGHBORS_8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function traceSkeleton(
  skel: Uint8Array,
  W: number,
  H: number,
  minLengthPx: number
): number[][] {
  // Walk the skeleton from each branch- or end-point, emitting one polyline
  // per ridge segment between specials.
  const visitedEdge = new Uint8Array(skel.length); // marks (idx) visited as a path interior
  const polylines: number[][] = [];

  function neighbours(idx: number): number[] {
    const x = idx % W;
    const y = (idx / W) | 0;
    const out: number[] = [];
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nidx = ny * W + nx;
      if (skel[nidx] === 1) out.push(nidx);
    }
    return out;
  }

  // Find endpoints + branch points.
  const specials: number[] = [];
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] !== 1) continue;
    const n = neighbours(i).length;
    if (n === 1 || n >= 3) specials.push(i);
  }

  // Walk from each special pixel along each unvisited neighbour edge.
  for (const start of specials) {
    const startNeighbors = neighbours(start);
    for (const firstStep of startNeighbors) {
      const edgeKey = start < firstStep ? start * skel.length + firstStep : firstStep * skel.length + start;
      // Use visitedEdge as an approximate per-edge-mark by hashing into the
      // smaller pixel: each edge is visited at most once.
      if (visitedEdge[start] && visitedEdge[firstStep]) continue;
      void edgeKey;

      const path: number[] = [];
      const sx = start % W;
      const sy = (start / W) | 0;
      path.push(sx, sy);
      let prev = start;
      let cur = firstStep;
      let lengthPx = Math.hypot(
        (firstStep % W) - sx,
        ((firstStep / W) | 0) - sy
      );
      // Mark the start as visited from this neighbour.
      visitedEdge[start] = 1;
      while (true) {
        const cx = cur % W;
        const cy = (cur / W) | 0;
        path.push(cx, cy);
        visitedEdge[cur] = 1;
        const nb = neighbours(cur);
        if (nb.length !== 2) break; // hit a special or endpoint
        // Pick the neighbour that isn't `prev`.
        const next = nb[0] === prev ? nb[1] : nb[0];
        if (visitedEdge[next] && nb.length !== 2) break;
        if (next === prev) break;
        // To avoid revisiting in loops:
        if (visitedEdge[next] === 1 && next !== firstStep) {
          path.push(next % W, (next / W) | 0);
          break;
        }
        const px = next % W;
        const py = (next / W) | 0;
        lengthPx += Math.hypot(px - cx, py - cy);
        prev = cur;
        cur = next;
        if (path.length > 2 * (W + H)) break; // pathological safety
      }
      if (lengthPx >= minLengthPx && path.length >= 4) {
        polylines.push(simplify(path));
      }
    }
  }

  // Catch isolated loops (no specials).
  for (let i = 0; i < skel.length; i++) {
    if (skel[i] !== 1 || visitedEdge[i]) continue;
    const path: number[] = [];
    let cur = i;
    let prev = -1;
    let lengthPx = 0;
    while (true) {
      visitedEdge[cur] = 1;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      path.push(cx, cy);
      const nb = neighbours(cur);
      const next = nb.find((x) => x !== prev && !visitedEdge[x]);
      if (next === undefined) break;
      lengthPx += Math.hypot((next % W) - cx, ((next / W) | 0) - cy);
      prev = cur;
      cur = next;
      if (path.length > 2 * (W + H)) break;
    }
    if (lengthPx >= minLengthPx && path.length >= 4) {
      polylines.push(simplify(path));
    }
  }

  return polylines;
}

/**
 * Douglas-Peucker-ish simplifier with a cheap 1-pixel-tolerance heuristic:
 * walking the skeleton produces ladder-like jitter in straight runs; drop
 * collinear pixels so the polyline is small.
 */
function simplify(path: number[]): number[] {
  if (path.length <= 6) return path;
  const out: number[] = [path[0], path[1]];
  for (let i = 2; i < path.length - 2; i += 2) {
    const ax = out[out.length - 2];
    const ay = out[out.length - 1];
    const bx = path[i];
    const by = path[i + 1];
    const cx = path[i + 2];
    const cy = path[i + 3];
    // Cross product of (b - a) x (c - a). 0 (or close) = collinear.
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) < 1) continue; // collinear, skip b
    out.push(bx, by);
  }
  out.push(path[path.length - 2], path[path.length - 1]);
  return out;
}

function sweepBody(
  pxPath: number[],
  dist: Int32Array,
  W: number,
  _scale: number,
  _x2px: (x: number) => number,
  _y2py: (y: number) => number,
  px2x: (px: number) => number,
  py2y: (py: number) => number
): number[] {
  if (pxPath.length < 4) return [];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < pxPath.length; i += 2) {
    const px = pxPath[i];
    const py = pxPath[i + 1];
    let tx: number;
    let ty: number;
    if (i === 0) {
      tx = pxPath[2] - pxPath[0];
      ty = pxPath[3] - pxPath[1];
    } else if (i === pxPath.length - 2) {
      tx = px - pxPath[i - 2];
      ty = py - pxPath[i - 1];
    } else {
      tx = pxPath[i + 2] - pxPath[i - 2];
      ty = pxPath[i + 3] - pxPath[i - 1];
    }
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    const nx = -ty;
    const ny = tx;
    const r = dist[py * W + px];
    const lpx = px + nx * r;
    const lpy = py + ny * r;
    const rpx = px - nx * r;
    const rpy = py - ny * r;
    left.push(px2x(lpx), py2y(lpy));
    right.push(px2x(rpx), py2y(rpy));
  }
  // Closed polygon: left side forwards, right side backwards.
  const poly: number[] = [];
  for (let i = 0; i < left.length; i += 2) poly.push(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  return poly;
}

/**
 * Guo-Hall thinning. Slightly different deletion mask than Zhang-Suen;
 * tends to produce skeletons with fewer spurs near junctions.
 */
function guoHall(mask: Uint8Array, W: number, H: number, cap: number) {
  let changed = true;
  let iter = 0;
  const toRemove: number[] = [];
  while (changed && iter++ < cap) {
    changed = false;
    for (const subIter of [0, 1]) {
      toRemove.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          if (mask[idx] !== 1) continue;
          const p2 = mask[idx - W];
          const p3 = mask[idx - W + 1];
          const p4 = mask[idx + 1];
          const p5 = mask[idx + W + 1];
          const p6 = mask[idx + W];
          const p7 = mask[idx + W - 1];
          const p8 = mask[idx - 1];
          const p9 = mask[idx - W - 1];
          // C: number of distinct 8-neighbour pairs that don't have both 1.
          const C =
            ((p9 === 0 ? 1 : 0) & (p2 === 1 || p3 === 1 ? 1 : 0)) +
            ((p3 === 0 ? 1 : 0) & (p4 === 1 || p5 === 1 ? 1 : 0)) +
            ((p5 === 0 ? 1 : 0) & (p6 === 1 || p7 === 1 ? 1 : 0)) +
            ((p7 === 0 ? 1 : 0) & (p8 === 1 || p9 === 1 ? 1 : 0));
          if (C !== 1) continue;
          const N1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8);
          const N2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9);
          const N = Math.min(N1, N2);
          if (N < 2 || N > 3) continue;
          const m =
            subIter === 0
              ? (p2 | p3 | (1 - p5)) & p4
              : (p6 | p7 | (1 - p9)) & p8;
          if (m !== 0) continue;
          toRemove.push(idx);
        }
      }
      for (const idx of toRemove) {
        mask[idx] = 0;
        changed = true;
      }
    }
  }
}

/**
 * Distance-ridge thinning: keep pixels that are local maxima (or strict
 * ridges) of the distance field. Cheap O(N), produces a thicker
 * skeleton than morphological thinners but is robust on noisy kerbs.
 */
function distanceRidge(mask: Uint8Array, dist: Int32Array, W: number, H: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (mask[idx] !== 1) continue;
      const d = dist[idx];
      if (d < 2) continue;
      // Pixel is on the ridge if its distance is >= each 8-neighbour.
      let isRidge = true;
      for (const off of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) {
        if (dist[idx + off] > d) {
          isRidge = false;
          break;
        }
      }
      if (isRidge) out[idx] = 1;
    }
  }
  for (let i = 0; i < mask.length; i++) mask[i] = out[i];
}

/**
 * Iterative morphological erosion: peel one pixel layer at a time until
 * each connected component is 1-2 pixels wide. Simple but can collapse
 * narrow corridors entirely; good for sanity-comparison.
 */
function morphologicalErosion(mask: Uint8Array, W: number, H: number, cap: number) {
  const buf = new Uint8Array(mask.length);
  for (let iter = 0; iter < cap; iter++) {
    let changed = false;
    for (let i = 0; i < mask.length; i++) buf[i] = mask[i];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (buf[idx] !== 1) continue;
        // Erode if any 4-neighbour is 0.
        if (
          buf[idx - 1] === 0 ||
          buf[idx + 1] === 0 ||
          buf[idx - W] === 0 ||
          buf[idx + W] === 0
        ) {
          // Don't erode if this pixel only has 2 neighbours (otherwise
          // we'd disconnect the skeleton).
          const n =
            (buf[idx - 1] === 1 ? 1 : 0) +
            (buf[idx + 1] === 1 ? 1 : 0) +
            (buf[idx - W] === 1 ? 1 : 0) +
            (buf[idx + W] === 1 ? 1 : 0);
          if (n >= 3) {
            mask[idx] = 0;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}
