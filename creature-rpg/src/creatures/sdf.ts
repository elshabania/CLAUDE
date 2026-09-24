// Signed-distance body sculpting for creatures (DECISIONS D31).
// A species' organic parts (spheres, capsules, lathes, cones, cylinders, boxes, chain segments) are evaluated as
// one signed-distance field: every part is smooth-min blended with its parent part (per-pair fillet radius), so a
// head grows out of a neck instead of intersecting it, while unrelated neighbours (two legs, fleece tufts) keep a
// crisp crease. The field is meshed with naive surface nets on a narrow band of bricks (only bricks that can contain
// the surface are sampled), vertices are projected onto the iso-surface, normals come from the field gradient, and
// skin weights, colours, cavity AO, fur length and glow masks are derived from per-part distances. Geometry is cached
// per species/group/LOD/quality, so a model is meshed once per session (and can be pre-warmed during idle time).
import * as THREE from 'three';

export const enum K { ELL = 0, RCONE = 1, CCONE = 2, LATHE = 3, BOX = 4 }

export interface SdfPrim {
  kind: K;
  /** mesh-space -> part-local affine, row-major 3x4 */
  m: Float64Array;
  /** local -> mesh distance scale (min axis scale of the part's rest transform) */
  s: number;
  mirror: boolean;
  a: number; b: number; c: number; d: number; e: number;
  half?: boolean;
  poly?: Float64Array;    // lathe: 2D polygon (r, y) pairs, closed through the axis
  lax?: 0 | 1 | 2 | 3;    // lathe axis y | z | -z | -y
  fluff: number;          // noise amplitude (metres)
  fluffF: number;         // noise frequency (1/m)
  seed: number;
  // bounds in mesh space
  cx: number; cy: number; cz: number; R: number;
  /** blend partner (index) and fillet radius */
  parent: number;
  k: number;
  /** characteristic thickness (metres) */
  thick: number;
  bone: string;
  color: THREE.Color;
  fur: number;
  glow: number;
}

// ---------------------------------------------------------------- noise
function hash3(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}
function vnoise(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi, s), b = hash3(xi + 1, yi, zi, s), c = hash3(xi, yi + 1, zi, s), d = hash3(xi + 1, yi + 1, zi, s);
  const e = hash3(xi, yi, zi + 1, s), f = hash3(xi + 1, yi, zi + 1, s), g = hash3(xi, yi + 1, zi + 1, s), h = hash3(xi + 1, yi + 1, zi + 1, s);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

// ---------------------------------------------------------------- primitive distances (local space)
function sdEll(x: number, y: number, z: number, a: number, b: number, c: number, half?: boolean): number {
  const ry = half && y < 0 ? b * 0.15 : b;
  const k0 = Math.sqrt((x / a) ** 2 + (y / ry) ** 2 + (z / c) ** 2);
  const k1 = Math.sqrt((x / (a * a)) ** 2 + (y / (ry * ry)) ** 2 + (z / (c * c)) ** 2);
  if (k1 < 1e-12) return -Math.min(a, ry, c);
  return (k0 * (k0 - 1)) / k1;
}
/** round cone: sphere r1 at (0,y0,0) to sphere r2 at (0,y0+h,0) */
function sdRCone(x: number, y: number, z: number, r1: number, r2: number, h: number, y0: number): number {
  const qx = Math.sqrt(x * x + z * z), qy = y - y0;
  const b = (r1 - r2) / h;
  const a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = -b * qx + a * qy;
  if (k < 0) return Math.sqrt(qx * qx + qy * qy) - r1;
  if (k > a * h) return Math.sqrt(qx * qx + (qy - h) * (qy - h)) - r2;
  return qx * a + qy * b - r1;
}
/** capped cone, bottom radius r1 at y=0, top radius r2 at y=h */
function sdCCone(x: number, y: number, z: number, r1: number, r2: number, h: number): number {
  const hh = h / 2;
  const qx = Math.sqrt(x * x + z * z), qy = y - hh;
  const k1x = r2, k1y = hh;
  const k2x = r2 - r1, k2y = 2 * hh;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - hh;
  const t = Math.max(0, Math.min(1, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y)));
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}
function sdPoly(px: number, py: number, v: Float64Array): number {
  const n = v.length / 2;
  let d = (px - v[0]) ** 2 + (py - v[1]) ** 2;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vix = v[i * 2], viy = v[i * 2 + 1], vjx = v[j * 2], vjy = v[j * 2 + 1];
    const ex = vjx - vix, ey = vjy - viy;
    const wx = px - vix, wy = py - viy;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= viy, c2 = py < vjy, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
function sdBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** distance from a mesh-space point to one primitive (mesh units) */
export function primDist(p: SdfPrim, X: number, Y: number, Z: number): number {
  const m = p.m;
  let x = m[0] * X + m[1] * Y + m[2] * Z + m[3];
  const y = m[4] * X + m[5] * Y + m[6] * Z + m[7];
  const z = m[8] * X + m[9] * Y + m[10] * Z + m[11];
  if (p.mirror) x = -x;
  let d: number;
  switch (p.kind) {
    case K.ELL: d = sdEll(x, y, z, p.a, p.b, p.c, p.half); break;
    case K.RCONE: d = sdRCone(x, y, z, p.a, p.b, p.c, p.d); break;
    case K.CCONE: d = sdCCone(x, y, z, p.a, p.b, p.c); break;
    case K.LATHE: {
      let r: number, ax: number;
      if (p.lax === 1) { r = Math.sqrt(x * x + y * y); ax = z; }
      else if (p.lax === 2) { r = Math.sqrt(x * x + y * y); ax = -z; }
      else if (p.lax === 3) { r = Math.sqrt(x * x + z * z); ax = -y; }
      else { r = Math.sqrt(x * x + z * z); ax = y; }
      d = sdPoly(r, ax, p.poly!);
      break;
    }
    default: d = sdBox(x, y, z, p.a, p.b, p.c, p.d);
  }
  d *= p.s;
  if (p.fluff > 0 && d < p.fluff * 2.2 && d > -p.fluff * 2.2) {
    const f = p.fluffF;
    const n = vnoise(x * f, y * f, z * f, p.seed) * 0.7 + vnoise(x * f * 2.3, y * f * 2.3, z * f * 2.3, p.seed + 7) * 0.3;
    d -= (n * 2 - 1) * p.fluff;
  }
  return d;
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------------------------------------------------------------- field with brick acceleration
export class SdfField {
  prims: SdfPrim[];
  min = new THREE.Vector3();
  max = new THREE.Vector3();
  private dv: Float64Array;
  private stamp: Int32Array;
  private tick = 1;
  // spatial hash of candidate prims (coarse cells)
  private hc = 1;
  private hn: [number, number, number] = [1, 1, 1];
  private hlist: Int32Array[] = [];
  private all: Int32Array;

  constructor(prims: SdfPrim[]) {
    this.prims = prims;
    this.dv = new Float64Array(prims.length);
    this.stamp = new Int32Array(prims.length);
    this.all = Int32Array.from(prims.map((_, i) => i));
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    for (const p of prims) {
      const r = p.R + p.k + p.fluff;
      this.min.min(new THREE.Vector3(p.cx - r, p.cy - r, p.cz - r));
      this.max.max(new THREE.Vector3(p.cx + r, p.cy + r, p.cz + r));
    }
    // coarse spatial hash for point queries (eye snapping, AO, weights)
    const size = this.max.clone().sub(this.min);
    const ext = Math.max(size.x, size.y, size.z, 1e-3);
    this.hc = ext / 12;
    this.hn = [Math.max(1, Math.ceil(size.x / this.hc)), Math.max(1, Math.ceil(size.y / this.hc)), Math.max(1, Math.ceil(size.z / this.hc))];
    const [nx, ny, nz] = this.hn;
    const half = this.hc * 0.87;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cx = this.min.x + (i + 0.5) * this.hc, cy = this.min.y + (j + 0.5) * this.hc, cz = this.min.z + (k + 0.5) * this.hc;
      this.hlist.push(this.candidates(cx, cy, cz, half + this.hc * 0.6));
    }
  }

  /** prims whose influence can reach a sphere (c, r) */
  candidates(cx: number, cy: number, cz: number, r: number): Int32Array {
    const out: number[] = [];
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i];
      const d = Math.hypot(cx - p.cx, cy - p.cy, cz - p.cz) - p.R - p.k - p.fluff;
      if (d < r) out.push(i);
    }
    return Int32Array.from(out);
  }

  candAt(x: number, y: number, z: number): Int32Array {
    const i = Math.floor((x - this.min.x) / this.hc), j = Math.floor((y - this.min.y) / this.hc), k = Math.floor((z - this.min.z) / this.hc);
    const [nx, ny, nz] = this.hn;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return this.all;
    return this.hlist[i + nx * (j + ny * k)];
  }

  /** evaluates part distances for `cand` into the scratch buffer and returns the blended field value */
  evalWith(x: number, y: number, z: number, cand: Int32Array): number {
    const t = ++this.tick;
    const dv = this.dv, st = this.stamp, prims = this.prims;
    for (let n = 0; n < cand.length; n++) {
      const i = cand[n];
      dv[i] = primDist(prims[i], x, y, z);
      st[i] = t;
    }
    let F = 1e9;
    for (let n = 0; n < cand.length; n++) {
      const i = cand[n];
      const p = prims[i];
      let v = dv[i];
      const pi = p.parent;
      if (pi >= 0 && st[pi] === t) v = smin(v, dv[pi], p.k);
      if (v < F) F = v;
    }
    return F;
  }

  eval(x: number, y: number, z: number): number {
    return this.evalWith(x, y, z, this.candAt(x, y, z));
  }

  /** per-part distances (valid for the last evalWith call) */
  lastDist(i: number): number {
    return this.stamp[i] === this.tick ? this.dv[i] : 1e9;
  }

  grad(x: number, y: number, z: number, e: number, out: THREE.Vector3): THREE.Vector3 {
    const c = this.candAt(x, y, z);
    out.set(
      this.evalWith(x + e, y, z, c) - this.evalWith(x - e, y, z, c),
      this.evalWith(x, y + e, z, c) - this.evalWith(x, y - e, z, c),
      this.evalWith(x, y, z + e, c) - this.evalWith(x, y, z - e, c),
    );
    return out.multiplyScalar(1 / (2 * e));
  }

  /** march from `o` along unit `dir` looking for the surface; returns distance or null */
  raycast(o: THREE.Vector3, dir: THREE.Vector3, maxT: number): number | null {
    let t = 0;
    const p = new THREE.Vector3();
    let prev = this.eval(o.x, o.y, o.z);
    const step = maxT / 48;
    for (let i = 1; i <= 48; i++) {
      t = i * step;
      p.copy(o).addScaledVector(dir, t);
      const v = this.eval(p.x, p.y, p.z);
      if ((prev < 0) !== (v < 0)) {
        // bisect
        let a = t - step, b = t, fa = prev;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          p.copy(o).addScaledVector(dir, m);
          const fm = this.eval(p.x, p.y, p.z);
          if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
        }
        return (a + b) / 2;
      }
      prev = v;
    }
    return null;
  }
}

// ---------------------------------------------------------------- mesher
export interface MeshOpts {
  /** target cell count along the characteristic extent */
  res: number;
  /** triangle cap (the resolution backs off until under it) */
  maxTris: number;
  ao: boolean;
  /** metres; used for weights */
  H: number;
  /** explicit cell size (metres); overrides res/maxTris */
  cell?: number;
}

export interface BodyGeometry {
  geometry: THREE.BufferGeometry;
  bones: string[];
  tris: number;
  cell: number;
}

export function cellSizeFor(field: SdfField, res: number): number {
  const s = field.max.clone().sub(field.min);
  const ext = Math.max(s.x, s.y, s.z);
  const vol = Math.cbrt(Math.max(1e-9, s.x * s.y * s.z));
  return Math.max(ext / (res * 1.7), vol / res);
}

/** triangle count the mesher would produce at `cell` (cheap: grid + nets only) */
export function countTris(field: SdfField, cell: number): number {
  return meshOnce(field, cell, { res: 0, maxTris: 0, ao: false, H: 1 }, true).tris;
}

export function meshField(field: SdfField, opts: MeshOpts): BodyGeometry {
  if (opts.cell) return meshOnce(field, opts.cell, opts);
  let res = opts.res;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = meshOnce(field, cellSizeFor(field, res), opts);
    if (r.tris <= opts.maxTris || attempt === 4) return r;
    res *= Math.sqrt(opts.maxTris / r.tris) * 0.97;
    r.geometry.dispose();
  }
  throw new Error('unreachable');
}

const PROF = (globalThis as { __sdfProf?: Record<string, number> }).__sdfProf;
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
function meshOnce(field: SdfField, cell: number, opts: MeshOpts, countOnly = false): BodyGeometry {
  let T = now();
  const lap = (k: string) => { if (PROF) { const t = now(); PROF[k] = (PROF[k] ?? 0) + t - T; T = t; } };
  const min = field.min.clone().subScalar(cell * 1.5);
  const size = field.max.clone().addScalar(cell * 1.5).sub(min);
  const BR = 5; // brick size in cells
  const nbx = Math.max(1, Math.ceil(size.x / (cell * BR))), nby = Math.max(1, Math.ceil(size.y / (cell * BR))), nbz = Math.max(1, Math.ceil(size.z / (cell * BR)));
  const nx = nbx * BR, ny = nby * BR, nz = nbz * BR;
  const px = nx + 1, py = ny + 1;
  const vals = new Float32Array(px * py * (nz + 1));
  const known = new Uint8Array(px * py * (nz + 1));
  const bh = (cell * BR * Math.sqrt(3)) / 2;
  const active: number[] = [];
  // brick classification: only bricks that can contain the surface are sampled
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const cx = min.x + (bi + 0.5) * BR * cell, cy = min.y + (bj + 0.5) * BR * cell, cz = min.z + (bk + 0.5) * BR * cell;
    const cand = field.candidates(cx, cy, cz, bh + cell);
    const i0 = bi * BR, j0 = bj * BR, k0 = bk * BR;
    let fill = 0;
    if (!cand.length) fill = bh;
    else {
      const F = field.evalWith(cx, cy, cz, cand);
      if (Math.abs(F) > bh * 1.3 + cell) fill = F;
    }
    if (fill !== 0) {
      for (let k = k0; k <= k0 + BR; k++) for (let j = j0; j <= j0 + BR; j++) for (let i = i0; i <= i0 + BR; i++) {
        const id = i + px * (j + py * k);
        if (!known[id]) vals[id] = fill;
      }
      continue;
    }
    active.push(i0, j0, k0);
    for (let k = k0; k <= k0 + BR; k++) for (let j = j0; j <= j0 + BR; j++) for (let i = i0; i <= i0 + BR; i++) {
      const id = i + px * (j + py * k);
      if (known[id] === 2) continue;
      vals[id] = field.evalWith(min.x + i * cell, min.y + j * cell, min.z + k * cell, cand);
      known[id] = 2;
    }
  }
  lap('grid');
  // surface nets: one vertex per sign-changing cell (cells of active bricks only)
  const cellVert = new Map<number, number>();
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let b = 0; b < active.length; b += 3) {
    const i0 = active[b], j0 = active[b + 1], k0 = active[b + 2];
    for (let k = k0; k < k0 + BR; k++) for (let j = j0; j < j0 + BR; j++) for (let i = i0; i < i0 + BR; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = vals[i + CO[c][0] + px * (j + CO[c][1] + py * (k + CO[c][2]))];
        corner[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, bb] of EDGES) {
        const va = corner[a], vb = corner[bb];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += CO[a][0] + (CO[bb][0] - CO[a][0]) * t;
        sy += CO[a][1] + (CO[bb][1] - CO[a][1]) * t;
        sz += CO[a][2] + (CO[bb][2] - CO[a][2]) * t;
        cnt++;
      }
      cellVert.set(i + nx * (j + ny * k), pos.length / 3);
      pos.push(min.x + (i + sx / cnt) * cell, min.y + (j + sy / cnt) * cell, min.z + (k + sz / cnt) * cell);
    }
  }
  const idx: number[] = [];
  const cv = (i: number, j: number, k: number) => cellVert.get(i + nx * (j + ny * k)) ?? -1;
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // split along the shorter diagonal
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let b = 0; b < active.length; b += 3) {
    const i0 = active[b], j0 = active[b + 1], k0 = active[b + 2];
    for (let k = k0; k < k0 + BR; k++) for (let j = j0; j < j0 + BR; j++) for (let i = i0; i < i0 + BR; i++) {
      const v0 = vals[i + px * (j + py * k)] < 0;
      if (j > 0 && k > 0 && (vals[i + 1 + px * (j + py * k)] < 0) !== v0) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k));
      if (i > 0 && k > 0 && (vals[i + px * (j + 1 + py * k)] < 0) !== v0) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1));
      if (i > 0 && j > 0 && (vals[i + px * (j + py * (k + 1))] < 0) !== v0) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k));
    }
  }
  lap('nets');
  if (countOnly) return { geometry: new THREE.BufferGeometry(), bones: [], tris: idx.length / 3, cell };
  const nv = pos.length / 3;
  // project onto the iso-surface (one Newton step), normals from the field gradient (forward differences)
  const P = new Float32Array(pos);
  const N = new Float32Array(nv * 3);
  const e = cell * 0.3;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let c = field.candAt(x, y, z);
    let f = field.evalWith(x, y, z, c);
    let gx = (field.evalWith(x + e, y, z, c) - f) / e, gy = (field.evalWith(x, y + e, z, c) - f) / e, gz = (field.evalWith(x, y, z + e, c) - f) / e;
    let l2 = gx * gx + gy * gy + gz * gz;
    if (l2 > 1e-10) {
      let s = f / l2;
      const mv = Math.abs(s) * Math.sqrt(l2);
      if (mv > cell * 0.8) s *= (cell * 0.8) / mv;
      x -= gx * s; y -= gy * s; z -= gz * s;
      c = field.candAt(x, y, z);
      f = field.evalWith(x, y, z, c);
      gx = (field.evalWith(x + e, y, z, c) - f) / e; gy = (field.evalWith(x, y + e, z, c) - f) / e; gz = (field.evalWith(x, y, z + e, c) - f) / e;
      l2 = gx * gx + gy * gy + gz * gz;
    }
    const il = l2 > 1e-12 ? 1 / Math.sqrt(l2) : 0;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = gx * il; N[v * 3 + 1] = gy * il; N[v * 3 + 2] = gz * il;
  }
  lap('project');
  // make the winding agree with the field gradient (outward, CCW)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const abx = P[b * 3] - P[a * 3], aby = P[b * 3 + 1] - P[a * 3 + 1], abz = P[b * 3 + 2] - P[a * 3 + 2];
    const acx = P[c * 3] - P[a * 3], acy = P[c * 3 + 1] - P[a * 3 + 1], acz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = aby * acz - abz * acy, fy = abz * acx - abx * acz, fz = abx * acy - aby * acx;
    const nx2 = N[a * 3] + N[b * 3] + N[c * 3], ny2 = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz2 = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  // attributes from per-part distances
  const prims = field.prims;
  const boneIndex = new Map<string, number>();
  const bones: string[] = [];
  const primBone = prims.map((p) => {
    let b = boneIndex.get(p.bone);
    if (b == null) { b = bones.length; bones.push(p.bone); boneIndex.set(p.bone, b); }
    return b;
  });
  const col = new Float32Array(nv * 3);
  const skinI = new Uint16Array(nv * 4);
  const skinW = new Float32Array(nv * 4);
  const fur = new Float32Array(nv);
  const glow = new Float32Array(nv);
  const wBone = new Float64Array(bones.length);
  const minW = opts.H * 0.03;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const cand = field.candAt(x, y, z);
    field.evalWith(x, y, z, cand);
    let dmin = 1e9;
    for (let n = 0; n < cand.length; n++) dmin = Math.min(dmin, field.lastDist(cand[n]));
    wBone.fill(0);
    let cr = 0, cg = 0, cb = 0, cw = 0, fw = 0, gw = 0;
    for (let n = 0; n < cand.length; n++) {
      const i = cand[n];
      const p = prims[i];
      const s = field.lastDist(i) - dmin;
      const wb = Math.max(p.k * 0.9, minW, p.thick * 0.35);
      const w = Math.exp(-((s / wb) ** 2) * 2.5);
      wBone[primBone[i]] += w;
      const cwid = Math.max(p.k * 0.3, opts.H * 0.008);
      const c = Math.exp(-((s / cwid) ** 2) * 3);
      cr += p.color.r * c; cg += p.color.g * c; cb += p.color.b * c; cw += c;
      fw += p.fur * c; gw += p.glow * c;
    }
    // top-4 bones
    const top: number[] = [];
    for (let b = 0; b < bones.length; b++) if (wBone[b] > 1e-4) top.push(b);
    top.sort((a, b) => wBone[b] - wBone[a]);
    let sum = 0;
    for (let q = 0; q < 4 && q < top.length; q++) sum += wBone[top[q]];
    for (let q = 0; q < 4; q++) {
      if (q < top.length && sum > 0) { skinI[v * 4 + q] = top[q]; skinW[v * 4 + q] = wBone[top[q]] / sum; }
    }
    if (!top.length) { skinI[v * 4] = 0; skinW[v * 4] = 1; }
    const inv = cw > 0 ? 1 / cw : 0;
    let ao = 1;
    if (opts.ao) {
      // cavity AO: how much the field closes in along the normal
      const nx3 = N[v * 3], ny3 = N[v * 3 + 1], nz3 = N[v * 3 + 2];
      let occ = 0;
      const step = Math.max(cell * 1.2, opts.H * 0.02);
      for (let s = 1; s <= 3; s++) {
        const d = step * s;
        const f = field.eval(x + nx3 * d, y + ny3 * d, z + nz3 * d);
        occ += Math.max(0, d - f) / d / s;
      }
      ao = Math.max(0.45, 1 - occ * 0.55);
    }
    col[v * 3] = cr * inv * ao; col[v * 3 + 1] = cg * inv * ao; col[v * 3 + 2] = cb * inv * ao;
    fur[v] = fw * inv;
    glow[v] = gw * inv;
  }
  lap('attrs');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
  geo.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geometry: geo, bones, tris: idx.length / 3, cell };
}
