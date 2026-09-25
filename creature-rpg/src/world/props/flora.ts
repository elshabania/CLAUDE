// Procedural trees, shrubs, ground cover and rocks (original geometry, deterministic per kind).
// Output parts carry a uniform attribute set so they merge and instance together:
//   position, normal, color (tint), sway (0 ground … 1 top), aSurf (layer, uvMode), aUv (metres), uv (atlas)
// Bark/rock parts use the PBR surface material (aSurf/aUv); foliage cards use the leaf atlas (uv).
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURF } from '../surfaces/recipes';
import { cellUV, LEAF } from '../vegetation/leafAtlas';

export type V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}

/** Give a geometry the full kit attribute set (missing ones filled with defaults). */
export function kitAttrs(g: THREE.BufferGeometry, o: { color?: THREE.ColorRepresentation; surf?: number; uvMode?: 0 | 1 | 2; swayH?: number; rigid?: boolean; vary?: number; seed?: number }): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const c = new THREE.Color(o.color ?? '#ffffff');
    const arr = new Float32Array(n * 3);
    const vary = o.vary ?? 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
      const r = Math.sin(p.x * 12.1 + p.y * 7.7 + p.z * 5.3 + (o.seed ?? 1)) * 43758.5;
      const f = 1 + ((r - Math.floor(r)) * 2 - 1) * vary;
      arr[i * 3] = c.r * f;
      arr[i * 3 + 1] = c.g * f;
      arr[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  if (!g.attributes.sway) {
    const sway = new Float32Array(n);
    const h = o.swayH ?? 1;
    for (let i = 0; i < n; i++) sway[i] = o.rigid ? 0 : Math.max(0, g.attributes.position.getY(i) / h);
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
  }
  if (!g.attributes.aSurf) {
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      a[i * 2] = o.surf ?? 0;
      a[i * 2 + 1] = o.uvMode ?? 0;
    }
    g.setAttribute('aSurf', new THREE.BufferAttribute(a, 2));
  }
  if (!g.attributes.aUv) g.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'sway', 'aSurf', 'aUv', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/** Tapered tube along a polyline with bark UVs in metres (u around, v along). */
export function tube(pts: V3[], radii: number[], radial: number, tint: THREE.ColorRepresentation, swayH: number, surf: number = SURF.bark, capEnd = true): THREE.BufferGeometry {
  const rings = pts.length;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const T = pts.map((p, i) => pts[Math.min(rings - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  let N = Math.abs(T[0].y) < 0.9 ? v3(0, 1, 0).cross(T[0]).normalize() : v3(1, 0, 0).cross(T[0]).normalize();
  const around = Math.max(0.5, Math.round((2 * Math.PI * radii[0]) / 1.2)) * 1.2;
  let len = 0;
  for (let i = 0; i < rings; i++) {
    if (i > 0) {
      N = N.clone().sub(T[i].clone().multiplyScalar(N.dot(T[i]))).normalize();
      len += pts[i].distanceTo(pts[i - 1]);
    }
    const B = T[i].clone().cross(N).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const d = N.clone().multiplyScalar(Math.cos(a)).add(B.clone().multiplyScalar(Math.sin(a)));
      const p = pts[i].clone().add(d.clone().multiplyScalar(radii[i]));
      pos.push(p.x, p.y, p.z);
      nrm.push(d.x, d.y, d.z);
      uv.push((j / radial) * around, len);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (capEnd) {
    const c = pos.length / 3;
    const e = pts[rings - 1].clone().add(T[rings - 1].clone().multiplyScalar(radii[rings - 1] * 0.6));
    pos.push(e.x, e.y, e.z);
    nrm.push(T[rings - 1].x, T[rings - 1].y, T[rings - 1].z);
    uv.push(0, len + radii[rings - 1]);
    const base = (rings - 1) * (radial + 1);
    for (let j = 0; j < radial; j++) idx.push(base + j, c, base + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return kitAttrs(g, { color: tint, surf, uvMode: 1, swayH, vary: 0.05 });
}

/**
 * Alpha-tested foliage card. `center`, `right` and `up` (unit) define the plane; normals bend toward
 * `nCenter` (crown centre) so a cluster of cards shades like a soft volume, not like flat paper.
 */
export function card(center: V3, right: V3, up: V3, w: number, h: number, cell: number, tint: THREE.Color, swayH: number, nCenter: V3 | null, sub?: number, pivotBottom = false): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = cellUV(cell, sub);
  const corners: [number, number][] = [[-0.5, pivotBottom ? 0 : -0.5], [0.5, pivotBottom ? 0 : -0.5], [0.5, pivotBottom ? 1 : 0.5], [-0.5, pivotBottom ? 1 : 0.5]];
  const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [];
  const face = right.clone().cross(up).normalize();
  for (let k = 0; k < 4; k++) {
    const [cx, cy] = corners[k];
    const p = center.clone().add(right.clone().multiplyScalar(cx * w)).add(up.clone().multiplyScalar(cy * h));
    pos.push(p.x, p.y, p.z);
    const n = nCenter ? p.clone().sub(nCenter).normalize().multiplyScalar(0.8).add(face.clone().multiplyScalar(0.2)).normalize() : v3(0, 1, 0).multiplyScalar(0.6).add(face.clone().multiplyScalar(0.4)).normalize();
    nrm.push(n.x, n.y, n.z);
    uv.push(uvs[k][0], uvs[k][1]);
    col.push(tint.r, tint.g, tint.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return kitAttrs(g, { swayH });
}

/** 2–3 crossed cards through one point (a leaf cluster). */
function cluster(r: () => number, c: V3, size: number, cell: number, tint: THREE.Color, swayH: number, crown: V3 | null, n = 3): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const base = r() * Math.PI;
  for (let k = 0; k < n; k++) {
    const yaw = base + (k * Math.PI) / n;
    const tilt = (r() - 0.5) * 1.2 + (k === 2 ? Math.PI / 2 : 0);
    const right = v3(Math.cos(yaw), 0, Math.sin(yaw));
    const up = v3(0, 1, 0).applyAxisAngle(right, tilt);
    out.push(card(c, right, up, size, size, cell, tint, swayH, crown));
  }
  return out;
}

export interface FloraParts { surf: THREE.BufferGeometry[]; leaf: THREE.BufferGeometry[]; plain: THREE.BufferGeometry[] }
const parts = (): FloraParts => ({ surf: [], leaf: [], plain: [] });

function shade(base: THREE.Color, k: number) {
  return base.clone().multiplyScalar(k);
}

// ---------------- broadleaf family (tree, blossom, hollowtree) ----------------
export interface BroadleafOpts {
  seed: number; trunkH: number; trunkR: number; crown: [number, number, number]; branches: number; clusters: number;
  clusterSize: number; cell: number; bark: string; leaf: string; lean?: number; lowPoly: boolean; flare?: number;
}
export function broadleaf(o: BroadleafOpts): FloraParts {
  const r = rng(o.seed);
  const out = parts();
  const H = o.trunkH + o.crown[1] * 2;
  const radial = o.lowPoly ? 5 : 8;
  const tp: V3[] = [], tr: number[] = [];
  const segs = 7;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    tp.push(v3(Math.sin(t * 2.3 + o.seed) * 0.12 * o.trunkR * 4 + (o.lean ?? 0) * t * t, t * o.trunkH, Math.cos(t * 1.9 + o.seed) * 0.1 * o.trunkR * 4));
    tr.push(o.trunkR * (1 - 0.45 * t) * (1 + (o.flare ?? 0.35) * Math.pow(1 - t, 6)));
  }
  out.surf.push(tube(tp, tr, radial, o.bark, H));
  const top = tp[segs];
  const crownC = top.clone().add(v3(0, o.crown[1] * 0.6, 0));
  const ends: V3[] = [];
  for (let b = 0; b < o.branches; b++) {
    const phi = (b / o.branches) * Math.PI * 2 + r() * 0.8;
    const a = 0.45 + r() * 0.45;
    const L = (0.55 + r() * 0.35) * Math.max(o.crown[0], o.crown[2]) * 1.05;
    const st = tp[Math.min(segs, Math.round(segs * (0.6 + r() * 0.4)))].clone();
    const dir = v3(Math.sin(a) * Math.cos(phi), Math.cos(a), Math.sin(a) * Math.sin(phi));
    const bp: V3[] = [], br: number[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      bp.push(st.clone().add(dir.clone().multiplyScalar(L * t)).add(v3(0, t * t * 0.35 * L, 0)));
      br.push(o.trunkR * 0.55 * (1 - 0.8 * t) + 0.015);
    }
    out.surf.push(tube(bp, br, o.lowPoly ? 4 : 5, o.bark, H));
    ends.push(bp[4]);
    if (!o.lowPoly) {
      for (let sb = 0; sb < 2; sb++) {
        const s0 = bp[2 + sb].clone();
        const phi2 = phi + (sb ? 0.8 : -0.8) + (r() - 0.5) * 0.3;
        const a2 = Math.min(1.3, a + 0.25);
        const d2 = v3(Math.sin(a2) * Math.cos(phi2), Math.cos(a2), Math.sin(a2) * Math.sin(phi2));
        const L2 = L * (0.45 + r() * 0.2);
        const sp = [s0, s0.clone().add(d2.clone().multiplyScalar(L2 * 0.5)).add(v3(0, 0.08, 0)), s0.clone().add(d2.clone().multiplyScalar(L2)).add(v3(0, 0.22 * L2, 0))];
        out.surf.push(tube(sp, [br[2] * 0.6, br[2] * 0.4, 0.012], 4, o.bark, H, SURF.bark));
        ends.push(sp[2]);
      }
    }
  }
  const tint = new THREE.Color(o.leaf);
  const ymin = crownC.y - o.crown[1], ymax = crownC.y + o.crown[1];
  for (let c = 0; c < o.clusters; c++) {
    let p: V3;
    if (c < ends.length && r() < 0.8) p = ends[c].clone().add(v3((r() - 0.5) * 0.5, r() * 0.3, (r() - 0.5) * 0.5));
    else {
      const th = r() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.min(0.92, r() * 1.05));
      const k = 0.55 + r() * 0.45;
      p = crownC.clone().add(v3(Math.sin(ph) * Math.cos(th) * o.crown[0] * k, Math.cos(ph) * o.crown[1] * k, Math.sin(ph) * Math.sin(th) * o.crown[2] * k));
    }
    // fake crown AO: darker low and inside
    const hk = THREE.MathUtils.clamp((p.y - ymin) / (ymax - ymin), 0, 1);
    const ik = THREE.MathUtils.clamp(p.clone().sub(crownC).divide(v3(...o.crown)).length(), 0, 1);
    const t = shade(tint, (0.55 + 0.45 * hk) * (0.7 + 0.3 * ik) * (0.9 + r() * 0.2));
    out.leaf.push(...cluster(r, p, o.clusterSize * (0.8 + r() * 0.45), o.cell, t, H, crownC, o.lowPoly ? 2 : 3));
  }
  return out;
}

// ---------------- conifers ----------------
export function conifer(seed: number, h: number, baseR: number, snowy: boolean, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const tp: V3[] = [], tr: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(v3(Math.sin(t * 3 + seed) * 0.04, t * h, 0));
    tr.push(0.22 * (1 - 0.9 * t) * (1 + 0.4 * Math.pow(1 - t, 8)) + 0.01);
  }
  out.surf.push(tube(tp, tr, lowPoly ? 5 : 7, '#6a5040', h));
  const cell = snowy ? LEAF.snowpine : LEAF.pine;
  const tint = new THREE.Color(snowy ? '#e6ece8' : '#cfd8c8');
  const whorls = lowPoly ? 7 : 11;
  const axisC = v3(0, h * 0.5, 0);
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls;
    const y = 1.3 + t * (h - 1.6);
    const L = (1 - t) * baseR + 0.35;
    const nb = lowPoly ? 4 : 5 + (w % 2);
    const off = r() * Math.PI * 2;
    for (let b = 0; b < nb; b++) {
      const phi = off + (b / nb) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const droop = -0.25 - (1 - t) * 0.25;
      const dir = v3(Math.cos(phi) * Math.cos(droop), Math.sin(droop), Math.sin(phi) * Math.cos(droop));
      const st = v3(0, y, 0);
      const end = st.clone().add(dir.clone().multiplyScalar(L));
      if (!lowPoly && w < whorls - 3) out.surf.push(tube([st, st.clone().lerp(end, 0.5), end], [0.035 * (1 - t) + 0.012, 0.022, 0.008], 3, '#5a4434', h, SURF.bark, false));
      const mid = st.clone().lerp(end, 0.55);
      const right = dir.clone();
      const side = v3(-Math.sin(phi), 0, Math.cos(phi));
      const dark = shade(tint, (0.55 + 0.45 * t) * (0.85 + r() * 0.25));
      // sprig card lying along the branch (u along the branch), plus a tilted one for volume
      out.leaf.push(card(mid, right, side, L * 1.25, L * 0.95, cell, dark, h, axisC));
      if (!lowPoly) out.leaf.push(card(mid.clone().add(v3(0, 0.05, 0)), right, side.clone().applyAxisAngle(right, 0.9).normalize(), L * 1.1, L * 0.7, cell, shade(dark, 0.9), h, axisC));
    }
  }
  // tip
  out.leaf.push(card(v3(0, h - 0.3, 0), v3(1, 0, 0), v3(0, 1, 0), 0.7, 1.0, cell, tint, h, null));
  out.leaf.push(card(v3(0, h - 0.3, 0), v3(0, 0, 1), v3(0, 1, 0), 0.7, 1.0, cell, tint, h, null));
  return out;
}

// ---------------- willow ----------------
export function willow(seed: number, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const H = 5.5;
  const tp: V3[] = [], tr: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(v3(t * t * 0.5, t * 2.9, Math.sin(t * 2) * 0.15));
    tr.push(0.34 * (1 - 0.5 * t) * (1 + 0.5 * Math.pow(1 - t, 6)));
  }
  out.surf.push(tube(tp, tr, lowPoly ? 5 : 8, '#6e6248', H));
  const top = tp[6];
  const crownC = top.clone().add(v3(0, 0.6, 0));
  const tint = new THREE.Color('#d8dcc0');
  const nb = lowPoly ? 4 : 6;
  for (let b = 0; b < nb; b++) {
    const phi = (b / nb) * Math.PI * 2 + r() * 0.5;
    const L = 1.8 + r() * 0.8;
    const pts = [top.clone(), top.clone().add(v3(Math.cos(phi) * L * 0.45, 1.0, Math.sin(phi) * L * 0.45)), top.clone().add(v3(Math.cos(phi) * L, 0.8 + r() * 0.3, Math.sin(phi) * L))];
    out.surf.push(tube(pts, [0.14, 0.08, 0.03], 4, '#6e6248', H));
  }
  // drape: strands hang from points on a dome; outer strands are longer so the silhouette is a soft bell
  const ns = lowPoly ? 14 : 34;
  const R = 2.7;
  for (let s2 = 0; s2 < ns; s2++) {
    const phi = (s2 / ns) * Math.PI * 2 * 2.618 + r() * 0.3;
    const k = Math.sqrt(0.25 + 0.75 * ((s2 * 0.618) % 1));
    const dome = crownC.clone().add(v3(Math.cos(phi) * R * k, 1.9 * (1 - k * k) + 0.1, Math.sin(phi) * R * k));
    const len = 1.4 + k * (dome.y - 0.6) * 0.95 + r() * 0.6;
    const outward = v3(Math.cos(phi), 0, Math.sin(phi));
    const right = v3(-outward.z, 0, outward.x).applyAxisAngle(v3(0, 1, 0), (r() - 0.5) * 0.8);
    const lean = v3(0, 1, 0).add(outward.clone().multiplyScalar(-0.3 * k)).normalize();
    const g = card(dome.clone().sub(lean.clone().multiplyScalar(len)), right, lean, 1.2 + r() * 0.5, len, LEAF.willow, shade(tint, 0.7 + 0.35 * k * (0.8 + r() * 0.3)), H, crownC, undefined, true);
    out.leaf.push(g);
  }
  for (let c = 0; c < (lowPoly ? 4 : 10); c++) {
    const th = r() * Math.PI * 2, k = Math.sqrt(r()) * 0.8;
    const p = crownC.clone().add(v3(Math.cos(th) * R * k, 1.9 * (1 - k * k) + 0.2, Math.sin(th) * R * k));
    out.leaf.push(...cluster(r, p, 1.4, LEAF.willow, shade(tint, 0.85 + r() * 0.2), H, crownC, 2));
  }
  return out;
}

// ---------------- dead tree ----------------
export function deadtree(seed: number, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const H = 4.2;
  const tp: V3[] = [], tr: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(v3(Math.sin(t * 3.1) * 0.18, t * 3.4, Math.cos(t * 2.3) * 0.12));
    tr.push(0.24 * (1 - 0.75 * t) * (1 + 0.5 * Math.pow(1 - t, 6)) + 0.02);
  }
  out.surf.push(tube(tp, tr, lowPoly ? 5 : 7, '#6b625a', H));
  const grow = (st: V3, dir: V3, L: number, rad: number, depth: number) => {
    const pts = [st, st.clone().add(dir.clone().multiplyScalar(L * 0.5)).add(v3((r() - 0.5) * 0.2, 0.05, (r() - 0.5) * 0.2)), st.clone().add(dir.clone().multiplyScalar(L))];
    out.surf.push(tube(pts, [rad, rad * 0.65, rad * 0.3], 4, '#6b625a', H));
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const nd = dir.clone().applyAxisAngle(v3(0, 1, 0), (k ? 1 : -1) * (0.6 + r() * 0.6)).add(v3(0, 0.25, 0)).normalize();
        grow(pts[1 + k].clone(), nd, L * 0.6, rad * 0.55, depth - 1);
      }
    }
  };
  for (let b = 0; b < 3; b++) {
    const phi = b * 2.1 + r();
    const a = 0.6 + r() * 0.4;
    grow(tp[3 + b].clone(), v3(Math.sin(a) * Math.cos(phi), Math.cos(a), Math.sin(a) * Math.sin(phi)), 1.3 + r() * 0.5, 0.08, lowPoly ? 0 : 2);
  }
  return out;
}

// ---------------- shrubs & ground cover ----------------
export function bush(seed: number, accent: string, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const H = 1.3;
  const tint = new THREE.Color('#d2dcc8');
  const c = v3(0, 0.55, 0);
  const n = lowPoly ? 6 : 13;
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 1.2);
    const p = c.clone().add(v3(Math.sin(ph) * Math.cos(th) * 0.75, Math.cos(ph) * 0.45 - 0.05, Math.sin(ph) * Math.sin(th) * 0.75));
    out.leaf.push(...cluster(r, p, 0.85 + r() * 0.35, LEAF.fern, shade(tint, (0.6 + 0.4 * (p.y / 1.1)) * (0.9 + r() * 0.2)), H, c, 2));
  }
  const acc = new THREE.Color(accent);
  for (let i = 0; i < (lowPoly ? 2 : 5); i++) {
    const th = r() * Math.PI * 2;
    const p = c.clone().add(v3(Math.cos(th) * 0.6, 0.3 + r() * 0.2, Math.sin(th) * 0.6));
    out.leaf.push(card(p, v3(Math.cos(th + 1.57), 0, Math.sin(th + 1.57)), v3(Math.cos(th) * 0.4, 1, Math.sin(th) * 0.4).normalize(), 0.28, 0.28, LEAF.flowers, acc, H, null, 3));
  }
  return out;
}

export function grassClump(seed: number, colA: string, colB: string, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const n = lowPoly ? 7 : 16;
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  const A = new THREE.Color(colA), B = new THREE.Color(colB);
  const segs = 4;
  for (let b = 0; b < n; b++) {
    const yaw = r() * Math.PI * 2;
    const f = v3(Math.cos(yaw), 0, Math.sin(yaw));
    const s = v3(-f.z, 0, f.x);
    const h = 0.45 + r() * 0.5, w = 0.035 + r() * 0.02, lean = 0.15 + r() * 0.35;
    const o = v3((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    const c = A.clone().lerp(B, r());
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const p = o.clone().add(f.clone().multiplyScalar(lean * t * t * h)).add(v3(0, t * h, 0));
      const ww = w * (1 - t * 0.9);
      for (const sd of [-1, 1]) {
        const q = p.clone().add(s.clone().multiplyScalar(sd * ww));
        pos.push(q.x, q.y, q.z);
        const n2 = f.clone().multiplyScalar(0.4).add(v3(0, 0.9, 0)).normalize();
        nrm.push(n2.x, n2.y, n2.z);
        const k2 = 0.35 + 0.65 * t;
        col.push(c.r * k2, c.g * k2, c.b * k2);
      }
      if (k < segs) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  out.plain.push(kitAttrs(g, { swayH: 0.8 }));
  return out;
}

export function flowers(seed: number, accent: string, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const cols = ['#ffffff', '#f2c4cf', '#e8d27a', accent, '#b9b4e8', '#f4a07a'];
  const n = lowPoly ? 4 : 7;
  const stems: number[] = [], sc: number[] = [], sn: number[] = [], si: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.25;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 0.25 + r() * 0.25;
    const lean = v3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
    // stem: thin double-sided ribbon
    const base = stems.length / 3;
    const top = v3(x, h, z).add(lean);
    for (const [p, w] of [[v3(x, 0, z), 0.012], [top, 0.006]] as const) {
      for (const sd of [-1, 1]) {
        stems.push(p.x + sd * w, p.y, p.z);
        sn.push(0, 0.3, 1);
        sc.push(0.22, 0.34, 0.12);
      }
    }
    si.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    const type = Math.floor(r() * 4);
    const tint = new THREE.Color(cols[Math.floor(r() * cols.length)]);
    const sz = type === 0 ? 0.13 : type === 1 ? 0.15 : 0.16;
    const faceUp = v3((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize();
    const right = v3(1, 0, 0).applyAxisAngle(v3(0, 1, 0), r() * 6.28);
    const up2 = faceUp.clone().cross(right).normalize();
    out.leaf.push(card(top.clone().add(v3(0, 0.01, 0)), right.clone().sub(faceUp.clone().multiplyScalar(right.dot(faceUp))).normalize(), up2, sz, sz, LEAF.flowers, tint, 0.5, null, type));
    if (!lowPoly) out.leaf.push(card(top, right, v3(0, 1, 0), sz * 0.9, sz * 0.9, LEAF.flowers, shade(tint, 0.9), 0.5, null, type));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(stems, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  g.setIndex(si);
  out.plain.push(kitAttrs(g, { swayH: 0.5 }));
  return out;
}

export function reeds(seed: number, lowPoly: boolean): FloraParts {
  const r = rng(seed);
  const out = parts();
  const n = lowPoly ? 8 : 18;
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  const A = new THREE.Color('#6b7a3a'), B = new THREE.Color('#a8a060');
  for (let b = 0; b < n; b++) {
    const yaw = r() * Math.PI * 2;
    const f = v3(Math.cos(yaw), 0, Math.sin(yaw));
    const s = v3(-f.z, 0, f.x);
    const h = 0.9 + r() * 0.8, w = 0.02 + r() * 0.012, lean = 0.05 + r() * 0.2;
    const o = v3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
    const c = A.clone().lerp(B, r());
    const base = pos.length / 3;
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const p = o.clone().add(f.clone().multiplyScalar(lean * t * t * h)).add(v3(0, t * h, 0));
      for (const sd of [-1, 1]) {
        const q = p.clone().add(s.clone().multiplyScalar(sd * w * (1 - t * 0.85)));
        pos.push(q.x, q.y, q.z);
        nrm.push(f.x * 0.5, 0.85, f.z * 0.5);
        const k2 = 0.45 + 0.55 * t;
        col.push(c.r * k2, c.g * k2, c.b * k2);
      }
      if (k < 5) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  out.plain.push(kitAttrs(g, { swayH: 1.6 }));
  // cattail heads
  for (let i = 0; i < (lowPoly ? 2 : 5); i++) {
    const x = (r() - 0.5) * 0.35, z = (r() - 0.5) * 0.35, h = 1.2 + r() * 0.4;
    const stem = kitAttrs(new THREE.CylinderGeometry(0.008, 0.012, h, 4).translate(x, h / 2, z), { color: '#7a7a44', swayH: 1.6 });
    const head = kitAttrs(new THREE.CapsuleGeometry(0.035, 0.16, 2, 6).translate(x, h + 0.05, z), { color: '#5a3f28', swayH: 1.6 });
    out.plain.push(stem, head);
  }
  return out;
}

// ---------------- rocks ----------------
export function vhash(x: number, y: number, z: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise3(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
  let v = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    v += w * vhash(xi + dx, yi + dy, zi + dz, s);
  }
  return v * 2 - 1;
}
export function rockGeo(seed: number, radius: number, squash: [number, number, number], detail: number, cuts: number, tint: string, top: string | null, topAmt: number, surf: number = SURF.rock): THREE.BufferGeometry {
  const r = rng(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  // weld so displacement keeps the surface closed and normals smooth
  const { mergeVertices } = BufferGeometryUtils;
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const planes = Array.from({ length: cuts }, () => {
    const n = v3(r() - 0.5, r() * 0.7 - 0.1, r() - 0.5).normalize();
    return { n, d: 0.62 + r() * 0.25 };
  });
  const p = v3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let k = 1 + 0.22 * vnoise3(p.x * 1.6, p.y * 1.6, p.z * 1.6, seed) + 0.1 * vnoise3(p.x * 3.7, p.y * 3.7, p.z * 3.7, seed + 1) + 0.04 * vnoise3(p.x * 8, p.y * 8, p.z * 8, seed + 2);
    p.multiplyScalar(k);
    for (const pl of planes) {
      const dd = p.dot(pl.n);
      if (dd > pl.d) p.sub(pl.n.clone().multiplyScalar(dd - pl.d));
    }
    p.set(p.x * squash[0], p.y * squash[1], p.z * squash[2]).multiplyScalar(radius);
    if (p.y < -radius * squash[1] * 0.35) p.y = -radius * squash[1] * 0.35 + (p.y + radius * squash[1] * 0.35) * 0.25;
    pos.setXYZ(i, p.x, p.y + radius * squash[1] * 0.3, p.z);
  }
  g.computeVertexNormals();
  // tint: darker crevices (concave by normal·position), top cover (moss / snow) on upward faces
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(tint), cover = top ? new THREE.Color(top) : null;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const q = v3(), nn = v3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    q.fromBufferAttribute(pos, i);
    nn.fromBufferAttribute(nrm, i);
    const conv = THREE.MathUtils.clamp(nn.dot(q.clone().setY(q.y - radius * 0.3).normalize()), 0, 1);
    c.copy(base).multiplyScalar(0.7 + 0.3 * conv * (0.9 + 0.2 * vhash(i, 1, 2, seed)));
    if (cover) c.lerp(cover, THREE.MathUtils.smoothstep(nn.y + vnoise3(q.x * 2, q.y * 2, q.z * 2, seed + 9) * 0.25, 0.55, 0.85) * topAmt);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return kitAttrs(g, { surf, uvMode: 0, rigid: true });
}
