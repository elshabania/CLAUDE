// Pure heightfield generation from TerrainSpec (worker-safe; no three.js).
import type { TerrainSpec, V2 } from '../zoneTypes';

function hash2(x: number, z: number, seed: number): number {
  let h = (x * 374761393 + z * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
export function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const zf = smooth(z - zi);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return (a + (b - a) * xf) * (1 - zf) + (c + (d - c) * xf) * zf;
}
export function fbm(x: number, z: number, seed: number, oct = 4): number {
  let amp = 0.5;
  let f = 1;
  let v = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * (valueNoise(x * f, z * f, seed + i * 17) * 2 - 1);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function distToSeg(p: V2, a: V2, b: V2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0];
  const z = a[1] + t * dz - p[1];
  return Math.sqrt(x * x + z * z);
}

export function distToPath(p: V2, pts: V2[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSeg(p, pts[i], pts[i + 1]));
  return d;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface ExitHole { at: V2; r: number }

/** Analytic height function. Rim walls are lowered at exits so that the player can leave. */
export function makeHeightFn(t: TerrainSpec, exits: ExitHole[] = []) {
  const [W, D] = t.size;
  return (x: number, z: number): number => {
    let h = t.base + fbm(x / t.scale, z / t.scale, t.seed) * t.amp;
    for (const hl of t.hills ?? []) {
      const dx = x - hl.at[0];
      const dz = z - hl.at[1];
      h += hl.h * Math.exp(-(dx * dx + dz * dz) / (hl.r * hl.r));
    }
    // flatten paths & clearings toward a gentle version of the base
    const gentle = t.base + fbm(x / (t.scale * 3), z / (t.scale * 3), t.seed + 99) * t.amp * 0.25;
    let flat = 0;
    let flatH = gentle;
    for (const p of t.paths ?? []) {
      const d = distToPath([x, z], p.pts);
      const w = 1 - smoothstep(p.w * 0.5, p.w * 0.5 + 3, d);
      if (w > flat) {
        flat = w;
        flatH = gentle;
      }
    }
    for (const f of t.flats ?? []) {
      const d = Math.hypot(x - f.at[0], z - f.at[1]);
      const w = 1 - smoothstep(f.r, f.r + 4, d);
      if (w > flat) {
        flat = w;
        flatH = f.h ?? gentle;
      }
    }
    h = h + (flatH - h) * flat;
    // water basins
    for (const wtr of t.water ?? []) {
      const rz = wtr.rz ?? wtr.r;
      const d = Math.hypot((x - wtr.at[0]) / wtr.r, (z - wtr.at[1]) / rz);
      if (d < 1.35) {
        const bed = wtr.level - wtr.depth * (1 - smoothstep(0.4, 1.0, d));
        const shore = wtr.level + 0.4;
        const target = d < 1 ? bed : shore + (h - shore) * smoothstep(1, 1.35, d);
        const k = d < 1 ? 1 : 1 - smoothstep(1, 1.35, d);
        h = h * (1 - k) + target * k;
      }
    }
    // rim walls
    const ex = Math.min(x + W / 2, W / 2 - x);
    const ez = Math.min(z + D / 2, D / 2 - z);
    const edge = Math.min(ex, ez);
    let rim = t.rim * (1 - smoothstep(0, t.rimWidth, edge));
    rim *= 0.85 + 0.3 * valueNoise(x / 9, z / 9, t.seed + 5);
    for (const e of exits) {
      const d = Math.hypot(x - e.at[0], z - e.at[1]);
      rim *= smoothstep(e.r, e.r + 8, d);
    }
    return h + rim;
  };
}

export interface HeightGrid {
  res: number;          // samples per side - 1 along X
  nx: number;
  nz: number;
  width: number;
  depth: number;
  heights: Float32Array; // row-major z then x: heights[iz * nx + ix]
  minH: number;
  maxH: number;
}

export function buildGrid(t: TerrainSpec, exits: ExitHole[], cell = 1): HeightGrid {
  const [W, D] = t.size;
  const nx = Math.round(W / cell) + 1;
  const nz = Math.round(D / cell) + 1;
  const fn = makeHeightFn(t, exits);
  const heights = new Float32Array(nx * nz);
  let minH = Infinity;
  let maxH = -Infinity;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -W / 2 + (ix * W) / (nx - 1);
      const z = -D / 2 + (iz * D) / (nz - 1);
      const h = fn(x, z);
      heights[iz * nx + ix] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  return { res: nx - 1, nx, nz, width: W, depth: D, heights, minH, maxH };
}

/** Bilinear height lookup on the grid (identical to the physics surface up to triangulation). */
export function sampleGrid(g: HeightGrid, x: number, z: number): number {
  const fx = ((x + g.width / 2) / g.width) * (g.nx - 1);
  const fz = ((z + g.depth / 2) / g.depth) * (g.nz - 1);
  const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const h00 = g.heights[iz * g.nx + ix];
  const h10 = g.heights[iz * g.nx + ix + 1];
  const h01 = g.heights[(iz + 1) * g.nx + ix];
  const h11 = g.heights[(iz + 1) * g.nx + ix + 1];
  // match the mesh/collider triangulation: split along the (1,0)-(0,1) anti-diagonal
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

export function slopeAt(g: HeightGrid, x: number, z: number): number {
  const e = 0.75;
  const dx = sampleGrid(g, x + e, z) - sampleGrid(g, x - e, z);
  const dz = sampleGrid(g, x, z + e) - sampleGrid(g, x, z - e);
  return Math.atan(Math.hypot(dx, dz) / (2 * e));
}
