// Tailored clothing + accessories. Garments are shells derived from the body surface (same topology, same
// CC0 skin weights, so they deform exactly with the body and never drift), pushed out along the normal with
// per-zone ease and wrinkle displacement. Hems are clean because the shader discards by an interpolated
// signed "cut" field (straight hems, necklines, open jacket fronts, sleeve lengths); edges get hem bands,
// stitching or piping. Rigid accessories (cap, bag, badges, props) are built from primitives and skinned
// 100% to one bone so that every cloth part of a character is ONE draw call (and every brass part another).
import * as THREE from 'three';
import type { HumanData } from './data';
import type { BodyShape } from './shape';
import type { ResolvedLook } from './look';
import { clothMaterial, metalMaterial, type HumanQuality } from './materials';

export interface OutfitProps { chime?: THREE.Object3D; handR?: THREE.Object3D[]; handL?: THREE.Object3D[] }

// ------------------------------------------------------------------ geometry builder
class GBuilder {
  pos: number[] = []; nrm: number[] = []; si: number[] = []; sw: number[] = [];
  col: number[] = []; col2: number[] = []; cloth: number[] = []; rest: number[] = []; idx: number[] = [];
  get count() { return this.pos.length / 3; }
  vert(p: THREE.Vector3 | number[], n: THREE.Vector3 | number[], bones: number[], weights: number[], c: THREE.Color, c2: THREE.Color, cl: [number, number, number, number], rest?: number[]) {
    const P = Array.isArray(p) ? p : [p.x, p.y, p.z];
    const N = Array.isArray(n) ? n : [n.x, n.y, n.z];
    this.pos.push(P[0], P[1], P[2]); this.nrm.push(N[0], N[1], N[2]);
    for (let k = 0; k < 4; k++) { this.si.push(bones[k] ?? 0); this.sw.push(weights[k] ?? 0); }
    this.col.push(c.r, c.g, c.b); this.col2.push(c2.r, c2.g, c2.b);
    this.cloth.push(...cl);
    const R = rest ?? P;
    this.rest.push(R[0], R[1], R[2]);
    return this.count - 1;
  }
  /** append a three geometry transformed by m, rigidly skinned to one bone */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, bone: number, c: THREE.Color, c2: THREE.Color, kind: number, pattern = 0, w = 0, cutFn?: (p: THREE.Vector3) => number) {
    const gi = g.index ? g : g;
    const pa = gi.getAttribute('position'), na = gi.getAttribute('normal');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.count;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      this.vert(v, n, [bone, 0, 0, 0], [1, 0, 0, 0], c, c2, [kind, cutFn ? cutFn(v) : -1, pattern, w]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pa.count; i++) this.idx.push(base + i);
    g.dispose();
  }
  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCol2', new THREE.Float32BufferAttribute(this.col2, 3));
    g.setAttribute('aCloth', new THREE.Float32BufferAttribute(this.cloth, 4));
    g.setAttribute('aRest', new THREE.Float32BufferAttribute(this.rest, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

// cheap deterministic 3D value noise for wrinkle displacement
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = THREE.MathUtils.lerp;
  return L(L(L(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u), L(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u), v),
    L(L(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u), L(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u), v), w);
}
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ body regions
export interface Regions {
  armPos: Float32Array; // NaN when not an arm vertex
  legPos: Float32Array; // NaN when not a leg vertex
  torso: Uint8Array;    // hips/spine/chest/neck/clavicle
  head: Uint8Array;
  side: Int8Array;
  J: Record<string, THREE.Vector3>;
}

const regionCache = new WeakMap<BodyShape, Regions>();
export function regions(d: HumanData, s: BodyShape): Regions {
  const c = regionCache.get(s);
  if (c) return c;
  const NO = d.NO;
  const armPos = new Float32Array(NO).fill(NaN), legPos = new Float32Array(NO).fill(NaN);
  const torso = new Uint8Array(NO), head = new Uint8Array(NO), side = new Int8Array(NO);
  const ARM: Record<string, [number, number]> = { clavicle: [-1, 1], upperArm: [0, 1], foreArm: [1, 1], hand: [2, 1], fingers1: [3, 1], fingers2: [4, 1], fingers3: [5, 1], thumb1: [2.5, 0.5], thumb2: [3, 1] };
  const LEG: Record<string, [number, number]> = { upperLeg: [0, 1], lowerLeg: [1, 1], foot: [2, 1], toes: [3, 1] };
  for (let o = 0; o < NO; o++) {
    const bn = d.bones[d.domBone[o]][0];
    const base = bn.split('.')[0];
    const t = d.regionT[o];
    side[o] = s.pos[o * 3] >= 0 ? 1 : -1;
    if (ARM[base]) armPos[o] = ARM[base][0] + t * ARM[base][1];
    if (LEG[base]) legPos[o] = LEG[base][0] + t * LEG[base][1];
    if (base === 'hips' || base === 'spine' || base === 'chest' || base === 'neck' || base === 'clavicle') torso[o] = 1;
    if (base === 'head') head[o] = 1;
  }
  const J: Record<string, THREE.Vector3> = {};
  d.bones.forEach(([n], i) => (J[n] = new THREE.Vector3(s.joints[i * 3], s.joints[i * 3 + 1], s.joints[i * 3 + 2])));
  const r = { armPos, legPos, torso, head, side, J };
  regionCache.set(s, r);
  return r;
}

interface Layer {
  name: string;
  /** signed cut per O vertex: < 0 inside the garment */
  cut: (o: number) => number;
  offset: (o: number) => number;
  color: THREE.Color;
  color2: THREE.Color;
  kind: number;
  pattern: number;
  w?: number;
  /** hide body faces fully inside (cut < -margin) */
  hides: boolean;
  margin?: number;
  /** alternative vertex source (skirt helper) */
  source?: 'skirt';
  /** also hides faces of earlier (inner) garment layers it fully covers */
  over?: boolean;
  /** only hides body faces, emits no geometry */
  ghost?: boolean;
  /** Laplacian drape iterations */
  smooth?: number;
  /** per-vertex override of [colour, colour2, kind] */
  vcol?: (o: number) => [THREE.Color, THREE.Color, number] | null;
}

const C = (s: string) => new THREE.Color(s);
function shade(c: string, k: number) { const x = C(c); const h = { h: 0, s: 0, l: 0 }; x.getHSL(h); return new THREE.Color().setHSL(h.h, h.s, Math.min(1, Math.max(0, h.l * k))); }

export function buildOutfit(d: HumanData, s: BodyShape, L: ResolvedLook, lod: number, q: HumanQuality) {
  const R = regions(d, s);
  const { J } = R;
  const P = s.pos, N = s.nrm;
  const W = L.wear;
  const ex = new Set(L.extras ?? []);
  const x = (o: number) => P[o * 3], y = (o: number) => P[o * 3 + 1], z = (o: number) => P[o * 3 + 2];
  const hipY = J.hips.y, chestY = J.chest.y, neckY = J.neck.y, spineY = J.spine.y;
  const H = L.height;
  const noise = (o: number, f: number) => vnoise(x(o) * f, y(o) * f, z(o) * f);
  const torsoZ = (J.chest.z + J.spine.z) / 2;
  const layers: Layer[] = [];
  const isArm = (o: number) => !Number.isNaN(R.armPos[o]) && R.armPos[o] >= -0.2;
  const isLeg = (o: number) => !Number.isNaN(R.legPos[o]);
  const BIG = 1;

  // ---------------- legs
  const legLen = W.legs === 'shorts' ? 0.55 : W.legs === 'rolled' ? 1.8 : W.legLen;
  const waistY = hipY + 0.075 * (H / 1.7);
  if (W.legs === 'trousers' || W.legs === 'shorts' || W.legs === 'rolled' || W.legs === 'skirt' || W.legs === 'longskirt') {
    const skirtLike = W.legs === 'skirt' || W.legs === 'longskirt';
    const len = skirtLike ? 0.35 : legLen; // under skirts: short leggings/shorts
    layers.push({
      name: 'pants', over: true, smooth: 14, kind: W.legs === 'rolled' || W.legs === 'trousers' ? 1 : 0, pattern: 0, color: C(L.pants), color2: shade(L.pants, 0.7), hides: true,
      cut: (o) => (isLeg(o) ? R.legPos[o] - len : isArm(o) ? BIG : Math.max(y(o) - waistY, (hipY - 0.25) - y(o))),
      offset: (o) => {
        const lp = isLeg(o) ? R.legPos[o] : 0;
        const ease = 0.008 + 0.004 * sstep(0.0, 0.5, lp) + 0.016 * sstep(0.9, 1.9, lp) * (skirtLike ? 0 : 1) + (W.legs === 'rolled' ? 0.004 * sstep(1.2, 1.8, lp) : 0);
        const wr = (noise(o, 60) - 0.5) * 0.006 * sstep(0.7, 1.3, lp) + (noise(o, 25) - 0.5) * 0.006 * sstep(1.4, 2.0, lp);
        return ease + wr;
      },
    });
    if (W.legs === 'rolled' || W.legs === 'trousers') {
      // turned-up cuff band
      const cuffTop = legLen - 0.16;
      if (W.legs === 'rolled') layers.push({
        name: 'cuff', kind: 1, pattern: 0, color: shade(L.pants, 1.18), color2: shade(L.pants, 0.8), hides: false,
        cut: (o) => (isLeg(o) ? Math.max(R.legPos[o] - legLen - 0.02, cuffTop - R.legPos[o]) : BIG),
        offset: (o) => 0.03 + (noise(o, 40) - 0.5) * 0.004,
      });
    }
    if (skirtLike) {
      const sl = W.legs === 'longskirt' ? 0.9 : 0.42; // fraction of skirt helper (waist -> ankle)
      const top = waistY + 0.02, bot = top - (top - 0.05) * sl;
      layers.push({ name: 'skirt', source: 'skirt', kind: 0, pattern: 0, color: C(L.pants), color2: shade(L.pants, 0.75), hides: false, cut: (o) => Math.max(bot - y(o), y(o) - top), offset: (o) => 0.006 + (noise(o, 18) - 0.5) * 0.01 });
    }
  }
  // belt at the waistband
  layers.push({ name: 'belt', kind: 2, pattern: 0, color: C('#3b2a1e'), color2: C('#C8963E'), hides: false, cut: (o) => (R.torso[o] ? Math.abs(y(o) - (waistY - 0.012)) - 0.016 : BIG), offset: () => 0.011 });

  // ---------------- inner top
  const innerNeck = (o: number) => {
    const front = sstep(torsoZ - 0.01, torsoZ + 0.06, z(o));
    const ax = Math.abs(x(o));
    switch (W.inner) {
      case 'turtleneck': return neckY + 0.06 - front * 0.025;
      case 'henley': return neckY - 0.012 - front * 0.045 * (1 - sstep(0.0, 0.03, ax));
      case 'tank': return neckY - 0.03 - front * 0.06;
      case 'blouse': return neckY - 0.01 - front * 0.035;
      case 'shirt': return neckY + 0.012 - front * 0.05 * (1 - sstep(0.0, 0.05, ax));
      default: return neckY - 0.005 - front * 0.025;
    }
  };
  const innerHem = W.outer === 'none' || W.inner === 'tank' ? hipY - 0.04 : waistY - 0.025;
  const iSleeve = W.inner === 'tank' ? -0.02 : W.innerSleeve;
  layers.push({
    name: 'inner', smooth: 26, kind: W.inner === 'sweater' || W.inner === 'turtleneck' ? 3 : 0, pattern: W.stripes ? 1 : W.inner === 'henley' || W.inner === 'shirt' ? 2 : 0, w: 1,
    color: C(L.top2), color2: W.stripes ? C(L.accent) : W.inner === 'henley' ? C('#d9c7a0') : shade(L.top2, 0.8), hides: true,
    cut: (o) => (isArm(o) ? R.armPos[o] - iSleeve : isLeg(o) ? BIG * 0.3 + (innerHem - y(o)) : Math.max(innerHem - y(o), y(o) - innerNeck(o))),
    offset: (o) => {
      const ap = isArm(o) ? R.armPos[o] : 0;
      const e = 0.006 + (W.inner === 'sweater' ? 0.004 : 0) + 0.006 * sstep(0.3, 1.0, ap) * (iSleeve > 1.2 ? 1 : 0) + 0.004 * sstep(-0.05, iSleeve, ap);
      const wr = (noise(o, 70) - 0.5) * 0.004 * (isArm(o) ? sstep(0.6, 1.2, ap) : 0.5);
      const belly = R.torso[o] ? 0.006 * (1 - sstep(chestY - 0.02, chestY + 0.05, y(o))) + 0.008 * sstep(torsoZ, torsoZ + 0.06, z(o)) * (1 - Math.abs(y(o) - (chestY - 0.04)) / 0.12) : 0;
      return e + wr + belly;
    },
  });

  // ---------------- outer layer
  if (W.outer !== 'none') {
    const long = W.outer === 'coat';
    const hem = long ? hipY - 0.06 : W.outer === 'vest' ? hipY - 0.02 : hipY - 0.085;
    const sleeve = W.outer === 'vest' ? -0.05 : W.outerSleeve;
    const open = W.outer === 'jacket' || W.outer === 'cardigan' || W.outer === 'vest';
    const openW = (o: number) => (open ? (W.outer === 'vest' ? 0.045 : 0.03) + 0.055 * sstep(chestY - 0.16, neckY + 0.02, y(o)) : 0.0);
    const collarTopBack = neckY + (long ? 0.065 : 0.045);
    const collarTopF = (o: number) => collarTopBack - (long ? 0.05 : 0.03) * sstep(torsoZ - 0.03, torsoZ + 0.06, z(o));
    const collarTop = collarTopBack;
    const frontW = (o: number) => sstep(torsoZ - 0.02, torsoZ + 0.05, z(o));
    const piping = W.piping ? C(W.piping) : shade(L.top, 0.75);
    layers.push({
      name: 'outer', over: true, smooth: 22, kind: long ? 3 : 1, pattern: W.quilted ? 5 : W.piping ? 4 : 0, color: C(L.top), color2: piping, hides: false,
      cut: (o) => {
        if (isArm(o)) return R.armPos[o] - sleeve;
        if (isLeg(o)) return 0.3 + hem - y(o);
        let c = Math.max(hem - y(o), y(o) - collarTopF(o));
        if (open) c = Math.max(c, (openW(o) - Math.abs(x(o))) * frontW(o) - (1 - frontW(o)) * 0.05);
        return c;
      },
      offset: (o) => {
        const ap = isArm(o) ? R.armPos[o] : 0;
        const collar = sstep(neckY - 0.035, collarTop, y(o)) * (isArm(o) ? 0 : 1) * 0.7;
        const sl = isArm(o) ? 0.004 + 0.01 * sstep(0.0, Math.max(0.3, sleeve), ap) : 0;
        const wr = (noise(o, 40) - 0.5) * 0.008 + (noise(o, 90) - 0.5) * 0.003;
        const hemFlare = R.torso[o] || isLeg(o) ? 0.012 * sstep(spineY, hem, y(o)) : 0;
        return 0.014 + sl + collar * 0.028 + wr + hemFlare;
      },
    });
    // rolled sleeve cuff on short sleeves
    if (sleeve > 0.2 && sleeve < 1.2) layers.push({
      name: 'sleeveCuff', kind: 1, pattern: W.piping ? 4 : 0, color: shade(L.top, 1.12), color2: piping, hides: false,
      cut: (o) => (isArm(o) ? Math.max(R.armPos[o] - sleeve - 0.01, sleeve - 0.14 - R.armPos[o]) : BIG),
      offset: (o) => 0.028 + (noise(o, 50) - 0.5) * 0.003,
    });
    if (long) {
      const coatLen = hipY - 0.6;
      layers.push({
        name: 'coatSkirt', source: 'skirt', kind: 3, pattern: W.quilted ? 5 : W.piping ? 4 : 0, color: C(L.top), color2: piping, hides: false,
        cut: (o) => Math.max(y(o) - (hipY + 0.04), coatLen - y(o), ((0.012 + 0.05 * sstep(hipY - 0.05, coatLen, y(o))) - Math.abs(x(o))) * sstep(torsoZ, torsoZ + 0.05, z(o))),
        offset: (o) => 0.028 + 0.06 * sstep(hipY, coatLen, y(o)) + (noise(o, 14) - 0.5) * 0.012,
        smooth: 2,
      });
      layers.push({ name: 'coatBelt', kind: 2, pattern: 0, color: C('#2e2620'), color2: C('#B08D57'), hides: false, cut: (o) => (R.torso[o] ? Math.abs(y(o) - (waistY + 0.01)) - 0.02 : BIG), offset: () => 0.03 });
    }
  }

  // ---------------- apron / shawl / collar / sash / scarf ring (body-derived)
  if (ex.has('apron')) {
    const apTop = chestY + 0.02;
    layers.push({
      name: 'apronTop', kind: ex.has('tongs') ? 2 : 1, pattern: 0, color: C(L.accent), color2: shade(L.accent, 0.7), hides: false,
      cut: (o) => (R.torso[o] ? Math.max(y(o) - apTop, Math.abs(x(o)) - 0.12 - 0.05 * sstep(apTop, hipY, y(o)), (torsoZ + 0.02) - z(o)) : BIG),
      offset: () => 0.03,
    });
    layers.push({
      name: 'apronSkirt', source: 'skirt', kind: ex.has('tongs') ? 2 : 1, pattern: 0, color: C(L.accent), color2: shade(L.accent, 0.7), hides: false,
      cut: (o) => Math.max(y(o) - (hipY + 0.05), (hipY - 0.5) - y(o), Math.abs(x(o)) - 0.17, torsoZ - z(o)),
      offset: () => 0.03,
    });
  }
  if (ex.has('shawl')) layers.push({
    name: 'shawl', smooth: 6, kind: 3, pattern: 0, color: C(L.accent === L.top ? L.top2 : L.accent), color2: shade(L.accent, 0.7), hides: false,
    cut: (o) => {
      if (!(R.torso[o] || (isArm(o) && R.armPos[o] < 0.7))) return BIG;
      // triangle down the back and a V in front, over the shoulders
      const front = z(o) > torsoZ;
      const bottom = front ? chestY + 0.02 + Math.abs(x(o)) * -0.2 + (0.09 - Math.abs(x(o))) * 0.0 : chestY - 0.16 + Math.abs(x(o)) * 0.9;
      const vOpen = front ? (0.05 + (y(o) - chestY) * 0.4) - Math.abs(x(o)) : -1;
      return Math.max(bottom - y(o), y(o) - (neckY + 0.02), vOpen, isArm(o) ? R.armPos[o] - 0.55 : -1);
    },
    offset: (o) => 0.028 + (noise(o, 30) - 0.5) * 0.008 + (isArm(o) ? 0.006 : 0),
  });
  if (ex.has('collar')) layers.push({
    name: 'furCollar', kind: 3, pattern: 0, color: shade(L.accent, 1.0), color2: shade(L.accent, 0.8), hides: false,
    cut: (o) => (R.torso[o] || R.head[o] ? Math.max(neckY - 0.04 - y(o), y(o) - (neckY + 0.045)) : BIG),
    offset: (o) => 0.032 + 0.018 * sstep(neckY - 0.02, neckY + 0.045, y(o)) + (noise(o, 80) - 0.5) * 0.012,
  });
  const strap = (name: string, fromL: boolean, color: string, width: number, off: number) => {
    const sh = J[fromL ? 'upperArm.L' : 'upperArm.R'].clone().add(new THREE.Vector3(fromL ? -0.05 : 0.05, 0.05, 0));
    const hp = J.hips.clone().add(new THREE.Vector3(fromL ? -0.16 : 0.16, -0.02, 0));
    const dir = hp.clone().sub(sh);
    const nrm = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
    layers.push({
      name, smooth: 12, kind: 2, pattern: 0, color: C(color), color2: shade(color, 1.3), hides: false,
      cut: (o) => (R.torso[o] || (isArm(o) && R.armPos[o] < 0.15) ? Math.abs((x(o) - sh.x) * nrm.x + (y(o) - sh.y) * nrm.y) - width : BIG),
      offset: () => off,
    });
  };
  if (ex.has('satchel')) strap('strap', true, '#6B4128', 0.018, W.outer === 'none' ? 0.02 : 0.046);
  if (ex.has('sash')) strap('sash', false, L.accent, 0.035, W.outer === 'none' ? 0.02 : 0.044);
  if (ex.has('scarf')) layers.push({
    name: 'scarfWrap', kind: 3, pattern: 0, color: C(L.accent), color2: shade(L.accent, 0.8), hides: false,
    cut: (o) => (R.torso[o] || R.head[o] ? Math.max(neckY - 0.045 - y(o), y(o) - (neckY + 0.06)) : BIG),
    offset: (o) => 0.035 + 0.012 * Math.sin(y(o) * 120 + x(o) * 30) + (noise(o, 60) - 0.5) * 0.008,
  });

  if (ex.has('cape')) {
    // asymmetric half-cape: over the left shoulder and down the back
    const capeC = C(L.accent), capeIn = shade(L.accent, 0.7);
    layers.push({
      name: 'capeTop', kind: 3, pattern: 4, color: capeC, color2: C(L.top2), hides: false,
      cut: (o) => {
        if (!(R.torso[o] || (isArm(o) && R.armPos[o] < 0.25 && R.side[o] > 0))) return BIG;
        const back = sstep(torsoZ + 0.03, torsoZ - 0.02, z(o));
        const shoulderL = x(o) > 0.02 && y(o) > chestY + 0.07 ? 1 : 0;
        const inside = Math.max(back, shoulderL * sstep(0.02, 0.08, x(o)));
        return Math.max(y(o) - (neckY - 0.005), 0.5 - inside, (chestY - 0.25) - y(o));
      },
      offset: (o) => 0.036 + (isArm(o) ? 0.012 : 0) + (noise(o, 20) - 0.5) * 0.008,
    });
    layers.push({
      name: 'capeBack', source: 'skirt', kind: 3, pattern: 4, color: capeC, color2: capeIn, hides: false,
      cut: (o) => Math.max(z(o) - (torsoZ - 0.01), (hipY - 0.45) - y(o) + x(o) * 0.25, -0.1 - x(o)),
      offset: (o) => 0.06 + (noise(o, 12) - 0.5) * 0.02,
    });
  }

  // ---------------- shoes & gloves
  // feet are hidden and replaced by lofted shoes (built below); boots add a shaft shell up the shin
  layers.push({ name: 'footHide', ghost: true, kind: 0, pattern: 0, color: C('#000'), color2: C('#000'), hides: true, margin: 0.0, cut: (o) => (isLeg(o) ? 2.02 - R.legPos[o] : BIG), offset: () => 0 });
  if (W.shoe === 'boot') layers.push({
    name: 'bootShaft', smooth: 4, kind: 2, pattern: 0, color: C(L.shoes), color2: shade(L.shoes, 0.7), hides: true, margin: 0.02,
    cut: (o) => (isLeg(o) ? Math.max(1.58 - R.legPos[o], R.legPos[o] - 2.08) : BIG),
    offset: (o) => 0.008 + 0.006 * sstep(1.58, 1.75, isLeg(o) ? R.legPos[o] : 0),
  });
  else layers.push({
    name: 'sock', smooth: 2, kind: 3, pattern: 0, color: C(W.shoe === 'sneaker' ? '#EDE6D6' : shade(L.pants, 0.6).getStyle()), color2: C('#cfc6b4'), hides: true, margin: 0.02,
    cut: (o) => (isLeg(o) ? Math.max(1.8 - R.legPos[o], R.legPos[o] - 2.08) : BIG),
    offset: () => 0.0025,
  });
  if (ex.has('gloves') || ex.has('mitts') || ex.has('glove')) {
    const fingerless = ex.has('gloves');
    const onlyL = ex.has('glove');
    layers.push({
      name: 'gloves', smooth: 1, kind: ex.has('mitts') ? 3 : 2, pattern: 0, color: C(ex.has('gloves') ? '#b3804f' : L.accent), color2: shade(ex.has('gloves') ? '#b3804f' : L.accent, 0.7), hides: true, margin: 0.05,
      cut: (o) => (isArm(o) && (!onlyL || R.side[o] > 0) ? Math.max((onlyL ? 1.1 : 1.84) - R.armPos[o], R.armPos[o] - (fingerless ? 3.3 : 9)) : BIG),
      offset: (o) => 0.0022 + (ex.has('mitts') ? 0.012 : 0) + (isArm(o) && R.armPos[o] < 2.05 ? 0.004 : 0),
    });
  }

  // ------------------------------------------------------------------ assemble body-derived layers
  const bodyTrisR = lod === 0 ? d.tris.body : lod === 1 ? d.lod1 : d.lod2;
  const trisO = new Uint32Array(bodyTrisR.length);
  for (let i = 0; i < bodyTrisR.length; i++) trisO[i] = d.rO[bodyTrisR[i]];
  const skirtO = Uint32Array.from(d.tris.skirt, (r) => d.rO[r]);
  const cloth = new GBuilder();
  const metal = new GBuilder();
  const cutCache = layers.map(() => new Float32Array(0));
  const LEVEL: Record<string, number> = { inner: 1, pants: 2, outer: 3 };
  const overs = layers.filter((l) => l.over && !l.source).map((l) => { const c = new Float32Array(d.NO); for (let o = 0; o < d.NO; o++) c[o] = l.cut(o); return { l, c, lv: LEVEL[l.name] ?? 5 }; });
  layers.forEach((ly, li) => {
    const tris = ly.source === 'skirt' ? skirtO : trisO;
    const myLv = LEVEL[ly.name] ?? 9;
    const coverers = ly.source ? [] : overs.filter((h) => h.l !== ly && h.lv > myLv);
    const cut = new Float32Array(d.NO).fill(NaN);
    const getCut = (o: number) => { let c = cut[o]; if (Number.isNaN(c)) { c = ly.cut(o); cut[o] = c; } return c; };
    const local = new Map<number, number>();
    const verts: number[] = [];
    const ltris: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      if (Math.min(getCut(a), getCut(b), getCut(c)) >= 0) continue;
      let covered = false;
      for (const h of coverers) if (h.c[a] < -0.025 && h.c[b] < -0.025 && h.c[c] < -0.025) { covered = true; break; }
      if (covered) continue;
      for (const o of [a, b, c]) {
        let v = local.get(o);
        if (v === undefined) { v = verts.length; verts.push(o); local.set(o, v); }
        ltris.push(v);
      }
    }
    cutCache[li] = cut;
    if (!verts.length || ly.ghost) return;
    // offset shell
    const n = verts.length;
    const pos = new Float32Array(n * 3), minOff = new Float32Array(n), maxOff = new Float32Array(n);
    verts.forEach((o, i) => {
      const off = ly.offset(o);
      minOff[i] = off * 0.9;
      maxOff[i] = off + (R.torso[o] || (isLeg(o) && R.legPos[o] < 0.35) ? 0.022 : 0.012);
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = P[o * 3 + k] + N[o * 3 + k] * off;
    });
    // fabric drape: Laplacian smoothing removes skin detail (toes, abs, knuckles), then re-inflate to keep clear of the body
    const iters = ly.smooth ?? 0;
    if (iters > 0) {
      const nb: number[][] = Array.from({ length: n }, () => []);
      for (let t = 0; t < ltris.length; t += 3) for (let k = 0; k < 3; k++) { const u = ltris[t + k], w = ltris[t + ((k + 1) % 3)]; nb[u].push(w); nb[w].push(u); }
      const tmp = new Float32Array(pos.length);
      // Laplacian drape with a per-iteration floor: convex highs keep their clearance, concave dips (between pecs,
      // over the navel, behind the knee) get bridged like stretched fabric instead of shrink-wrapping the anatomy
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
          const l = nb[i];
          if (l.length < 3) { tmp[i * 3] = pos[i * 3]; tmp[i * 3 + 1] = pos[i * 3 + 1]; tmp[i * 3 + 2] = pos[i * 3 + 2]; continue; }
          let x = 0, yy = 0, zz = 0;
          for (const j of l) { x += pos[j * 3]; yy += pos[j * 3 + 1]; zz += pos[j * 3 + 2]; }
          // move along the body normal only: no tangential sliding (keeps coverage exact over hidden layers)
          const o = verts[i];
          const dn = ((x / l.length - pos[i * 3]) * N[o * 3] + (yy / l.length - pos[i * 3 + 1]) * N[o * 3 + 1] + (zz / l.length - pos[i * 3 + 2]) * N[o * 3 + 2]) * 0.6;
          tmp[i * 3] = pos[i * 3] + N[o * 3] * dn;
          tmp[i * 3 + 1] = pos[i * 3 + 1] + N[o * 3 + 1] * dn;
          tmp[i * 3 + 2] = pos[i * 3 + 2] + N[o * 3 + 2] * dn;
        }
        pos.set(tmp);
        verts.forEach((o, i) => {
          const dx = pos[i * 3] - P[o * 3], dy = pos[i * 3 + 1] - P[o * 3 + 1], dz = pos[i * 3 + 2] - P[o * 3 + 2];
          const dn = dx * N[o * 3] + dy * N[o * 3 + 1] + dz * N[o * 3 + 2];
          if (dn < minOff[i]) for (let k = 0; k < 3; k++) pos[i * 3 + k] += N[o * 3 + k] * (minOff[i] - dn);
          else if (dn > maxOff[i]) for (let k = 0; k < 3; k++) pos[i * 3 + k] -= N[o * 3 + k] * (dn - maxOff[i]);
        });
      }
    }
    // normals of the draped shell itself (not the body's anatomy)
    const vn = new Float32Array(n * 3);
    if (iters > 0) {
      for (let t = 0; t < ltris.length; t += 3) {
        const a = ltris[t], b = ltris[t + 1], c = ltris[t + 2];
        const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
        const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        for (const v of [a, b, c]) { vn[v * 3] += nx; vn[v * 3 + 1] += ny; vn[v * 3 + 2] += nz; }
      }
      for (let i = 0; i < n; i++) {
        const l = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]);
        const o = verts[i];
        if (l < 1e-12 || vn[i * 3] * N[o * 3] + vn[i * 3 + 1] * N[o * 3 + 1] + vn[i * 3 + 2] * N[o * 3 + 2] < 0) { vn[i * 3] = N[o * 3]; vn[i * 3 + 1] = N[o * 3 + 1]; vn[i * 3 + 2] = N[o * 3 + 2]; }
        else { vn[i * 3] /= l; vn[i * 3 + 1] /= l; vn[i * 3 + 2] /= l; }
      }
      // soften shading further (fabric reads smoother than skin)
      const nb2: number[][] = Array.from({ length: n }, () => []);
      for (let t = 0; t < ltris.length; t += 3) for (let k = 0; k < 3; k++) { const u = ltris[t + k], w = ltris[t + ((k + 1) % 3)]; nb2[u].push(w); nb2[w].push(u); }
      const vt = new Float32Array(vn.length);
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < n; i++) {
          let x = vn[i * 3], yy = vn[i * 3 + 1], zz = vn[i * 3 + 2];
          for (const j of nb2[i]) { x += vn[j * 3]; yy += vn[j * 3 + 1]; zz += vn[j * 3 + 2]; }
          const l = Math.hypot(x, yy, zz) || 1;
          vt[i * 3] = x / l; vt[i * 3 + 1] = yy / l; vt[i * 3 + 2] = zz / l;
        }
        vn.set(vt);
      }
    } else verts.forEach((o, i) => { vn[i * 3] = N[o * 3]; vn[i * 3 + 1] = N[o * 3 + 1]; vn[i * 3 + 2] = N[o * 3 + 2]; });
    const base = cloth.count;
    verts.forEach((o, i) => {
      const bones: number[] = [], ws: number[] = [];
      for (let k = 0; k < 4; k++) { bones.push(d.skinIdx[o * 4 + k]); ws.push(d.skinW[o * 4 + k] / 255); }
      const vc = ly.vcol?.(o);
      cloth.vert([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], [vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]], bones, ws, vc ? vc[0] : ly.color, vc ? vc[1] : ly.color2, [vc ? vc[2] : ly.kind, Math.max(-1, Math.min(1, getCut(o))), ly.pattern, ly.w ?? 0]);
    });
    for (const v of ltris) cloth.idx.push(base + v);
  });

  // ------------------------------------------------------------------ rigid accessories
  const bi = d.boneIndex;
  const headB = bi.head, chestB = bi.chest, hipsB = bi.hips;
  const M = (p: THREE.Vector3 | number[], r?: THREE.Euler, sc?: THREE.Vector3 | number) => {
    const m = new THREE.Matrix4();
    const pos = Array.isArray(p) ? new THREE.Vector3(...p) : p;
    const s3 = typeof sc === 'number' ? new THREE.Vector3(sc, sc, sc) : sc ?? new THREE.Vector3(1, 1, 1);
    return m.compose(pos, new THREE.Quaternion().setFromEuler(r ?? new THREE.Euler()), s3);
  };
  // head ellipsoid from the scalp helper (for hats)
  const hs = headShape(d, s);
  const props: OutfitProps = { handR: [], handL: [] };
  const seg = q === 'mobile' || lod > 0 ? 0.6 : 1;
  const S = (n: number) => Math.max(6, Math.round(n * seg));

  if (ex.has('cap')) {
    // six-panel sporty cap: crown shell over the scalp ellipsoid + curved brim; tuning-fork emblem on the front
    const capC = C(W.cap ?? L.accent);
    const eyeY = (s.eyeL.y + s.eyeR.y) / 2;
    const F = headField(d, s);
    const rimF = eyeY + 0.045, rimB = eyeY - 0.004;
    const rim = (a: number) => THREE.MathUtils.lerp(rimB, rimF, (Math.cos(a) + 1) / 2);
    const crown = fieldCap(F, (a, t) => 0.017 + 0.004 * Math.sin(t * Math.PI), rim, S(40), S(12));
    const emblemY = rimF + 0.034;
    cloth.add(crown, new THREE.Matrix4(), headB, capC, C('#E8C27A'), 5, 3, emblemY);
    const topP = F.point(0, Math.PI / 2 - 0.001, 0.024);
    metal.add(new THREE.SphereGeometry(0.008, 8, 6), M([topP.x, topP.y, topP.z]), headB, capC, capC, 2);
    const k = 1.0;
    const frontR = F.point(0, Math.asin(Math.max(-1, Math.min(1, (rimF - F.c.y) / Math.max(0.05, F.radius(new THREE.Vector3(0, 0.3, 1)))))), 0.02);
    const brimG = capBrim(F, S(20), rimF, frontR);
    void k;
    cloth.add(brimG, new THREE.Matrix4(), headB, capC.clone().multiplyScalar(0.92), capC.clone().multiplyScalar(0.7), 5, 0);
  }
  if (ex.has('hat') || ex.has('brimhat')) {
    const hc = C(L.accent);
    const wide = ex.has('brimhat');
    const prof: THREE.Vector2[] = [];
    const rr = Math.max(hs.r.x, hs.r.z) * 1.08;
    const crownH = wide ? hs.r.y * 0.75 : hs.r.y * 0.95;
    const br = wide ? rr * 2.1 : rr * 1.45;
    prof.push(new THREE.Vector2(0.001, crownH), new THREE.Vector2(rr * 0.85, crownH * 0.98), new THREE.Vector2(rr * 0.98, crownH * 0.7), new THREE.Vector2(rr, 0.01), new THREE.Vector2(rr * 1.02, 0.0), new THREE.Vector2(br, wide ? -0.03 : 0.0), new THREE.Vector2(br + 0.004, wide ? -0.036 : -0.006), new THREE.Vector2(rr * 1.0, -0.008));
    const hat = new THREE.LatheGeometry(prof, S(28));
    cloth.add(hat, M(hs.c.clone().add(new THREE.Vector3(0, hs.r.y * 0.42, -0.005)), new THREE.Euler(-0.06, 0, 0), new THREE.Vector3(1, 1, hs.r.z / hs.r.x)), headB, hc, shade(L.accent, 0.7), 5, 0);
    const band = new THREE.CylinderGeometry(rr * 1.01, rr * 1.03, 0.022, S(28), 1, true);
    cloth.add(band, M(hs.c.clone().add(new THREE.Vector3(0, hs.r.y * 0.42 + 0.014, -0.005)), new THREE.Euler(-0.06, 0, 0), new THREE.Vector3(1, 1, hs.r.z / hs.r.x)), headB, shade(L.accent, 0.55), shade(L.accent, 0.5), 2, 0);
  }
  if (ex.has('earmuffs')) {
    const brass = C('#C8963E');
    for (const sd of [1, -1]) {
      const cup = new THREE.CylinderGeometry(0.036, 0.04, 0.03, S(18));
      metal.add(cup, M([hs.c.x + sd * (hs.r.x + 0.012), hs.c.y - hs.r.y * 0.3, hs.c.z - 0.008], new THREE.Euler(0, 0, Math.PI / 2)), headB, brass, brass, 0);
    }
    const band = new THREE.TorusGeometry(hs.r.x + 0.02, 0.006, 6, S(24), Math.PI);
    metal.add(band, M([hs.c.x, hs.c.y - hs.r.y * 0.3, hs.c.z - 0.008], new THREE.Euler(0, Math.PI / 2 * 0, 0), new THREE.Vector3(1, (hs.r.y * 1.3 + 0.02) / (hs.r.x + 0.02), 1)), headB, brass, brass, 0);
  }
  if (ex.has('goggles')) {
    const F = headField(d, s);
    const gy = (s.eyeL.y + s.eyeR.y) / 2 + 0.06;
    const band = new THREE.TorusGeometry(1, 0.008, 6, S(32));
    const rr = F.radius(new THREE.Vector3(0, 0.35, 1).normalize()) + 0.006;
    cloth.add(band, M([F.c.x, gy, F.c.z - 0.005], new THREE.Euler(Math.PI / 2 + 0.2, 0, 0), new THREE.Vector3(hs.r.x / hs.r.z * rr * 1.02, rr, 1)), headB, C('#4A3A2A'), C('#4A3A2A'), 2, 0);
    for (const sd of [1, -1]) {
      const lens = new THREE.CylinderGeometry(0.021, 0.023, 0.018, S(16));
      const p = F.point(sd * 0.36, Math.asin(Math.min(1, (gy + 0.006 - F.c.y) / rr)), 0.012);
      metal.add(lens, M(p, new THREE.Euler(Math.PI / 2 - 0.55, sd * 0.36, 0)), headB, C('#8a6a3e'), C('#8a6a3e'), 0);
      const glass = new THREE.CircleGeometry(0.017, S(14));
      metal.add(glass, M(p.clone().add(new THREE.Vector3(0, 0.004, 0.008)), new THREE.Euler(-0.55, sd * 0.36, 0)), headB, C('#9fc6d4'), C('#9fc6d4'), 0);
    }
  }
  if (ex.has('glasses') || ex.has('monocle')) {
    const frame = C(ex.has('monocle') ? '#C8963E' : '#2A2A30');
    const sides = ex.has('monocle') ? [1] : [1, -1];
    for (const sd of sides) {
      const e = sd > 0 ? s.eyeL : s.eyeR;
      const ring = new THREE.TorusGeometry(s.eyeRadius * 1.55, 0.0013, 5, S(24));
      metal.add(ring, M([e.x + sd * 0.002, e.y, e.z + s.eyeRadius * 1.9]), headB, frame, frame, 0);
    }
    if (!ex.has('monocle')) {
      const bridge = new THREE.CylinderGeometry(0.0012, 0.0012, Math.abs(s.eyeL.x - s.eyeR.x) - s.eyeRadius * 3.1, 5);
      metal.add(bridge, M([0, s.eyeL.y + 0.004, s.eyeL.z + s.eyeRadius * 2.0], new THREE.Euler(0, 0, Math.PI / 2)), headB, frame, frame, 0);
      for (const sd of [1, -1]) {
        const e = sd > 0 ? s.eyeL : s.eyeR;
        const arm = new THREE.CylinderGeometry(0.001, 0.001, hs.r.z * 1.25, 4);
        metal.add(arm, M([e.x + sd * s.eyeRadius * 1.6, e.y + 0.002, e.z - hs.r.z * 0.35], new THREE.Euler(Math.PI / 2, 0, 0)), headB, frame, frame, 0);
      }
    }
  }
  if (ex.has('satchel')) {
    const bag = roundedBox(0.2, 0.15, 0.06, 0.018, S(3));
    cloth.add(bag, M(J.hips.clone().add(new THREE.Vector3(-0.165, -0.05, 0.02)), new THREE.Euler(0, -0.55, 0.04)), hipsB, C('#8C5A3C'), C('#5e3a24'), 2, 0);
    const flap = roundedBox(0.205, 0.08, 0.066, 0.016, S(3));
    cloth.add(flap, M(J.hips.clone().add(new THREE.Vector3(-0.165, -0.01, 0.022)), new THREE.Euler(0, -0.55, 0.04)), hipsB, C('#6B4128'), C('#5e3a24'), 2, 0);
    metal.add(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 10), M(J.hips.clone().add(new THREE.Vector3(-0.145, -0.045, 0.058)), new THREE.Euler(Math.PI / 2, 0, 0)), hipsB, C('#C8963E'), C('#C8963E'), 0);
    // hanging Reed Chime charm
    const charm = chimeGeometry(0.018);
    metal.add(charm, M(J.hips.clone().add(new THREE.Vector3(-0.11, -0.11, 0.06))), hipsB, C('#C8963E'), C('#C8963E'), 0);
  }
  if (ex.has('badge')) {
    // Tuner's badge loop on the left chest of the jacket
    const badge = new THREE.CylinderGeometry(0.014, 0.014, 0.004, S(16));
    const bpos = new THREE.Vector3(J.chest.x + 0.075, chestY + 0.025, 0);
    bpos.z = surfaceZ(d, s, bpos.x, bpos.y) + 0.022;
    metal.add(badge, M(bpos, new THREE.Euler(Math.PI / 2 - 0.15, 0, 0)), chestB, C('#D8B35A'), C('#D8B35A'), 0);
    const loop = new THREE.TorusGeometry(0.009, 0.0022, 5, 12);
    metal.add(loop, M(bpos.clone().add(new THREE.Vector3(0, 0.02, -0.002)), new THREE.Euler(-0.15, 0, 0)), chestB, C('#C8963E'), C('#C8963E'), 0);
  }
  if (ex.has('bell')) metal.add(chimeGeometry(0.026), M(J.hips.clone().add(new THREE.Vector3(0.16, -0.06, 0.07))), hipsB, C('#C0C4CC'), C('#C0C4CC'), 0);
  if (ex.has('scarf')) {
    // hanging scarf tail from the back of the neck
    const pts = [new THREE.Vector3(0.03, neckY + 0.0, J.neck.z - 0.07), new THREE.Vector3(0.06, neckY - 0.12, J.chest.z - 0.14), new THREE.Vector3(0.08, neckY - 0.32, J.chest.z - 0.17), new THREE.Vector3(0.11, neckY - 0.46, J.chest.z - 0.16)];
    const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), S(12), 0.03, 6, false);
    tail.scale(1, 1, 1);
    const tp = tail.getAttribute('position');
    // flatten the tube into a strip
    const ctr = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < tp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(tp, i);
      const u = Math.floor(i / 7) / S(12);
      const c = ctr.getPointAt(Math.min(1, u));
      v.z = c.z + (v.z - c.z) * 0.3;
      tp.setXYZ(i, v.x, v.y, v.z);
    }
    tail.computeVertexNormals();
    cloth.add(tail, new THREE.Matrix4(), chestB, C(L.accent), shade(L.accent, 0.8), 3, 0);
  }
  if (ex.has('kite')) {
    const kite = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.28), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0, -0.2), new THREE.Vector2(-0.17, 0.02)]));
    cloth.add(kite, M([0, chestY - 0.02, J.chest.z - 0.2], new THREE.Euler(0, Math.PI, 0.3)), chestB, C(L.accent), C(L.top), 0, 0);
    const kite2 = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.28), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0, -0.2), new THREE.Vector2(-0.17, 0.02)]));
    cloth.add(kite2, M([0, chestY - 0.02, J.chest.z - 0.205], new THREE.Euler(0, 0, -0.3)), chestB, C(L.accent), C(L.top), 0, 0);
  }

  for (const sd of ['L', 'R'] as const) buildShoe(cloth, d, s, R, L, sd, S);

  // ------------------------------------------------------------------ hand props (non-skinned, attached to bones by the model)
  const handProps: { bone: string; obj: THREE.Object3D }[] = [];
  const metalM = metalMaterial();
  const propMesh = (g: THREE.BufferGeometry, color: string, rough = 0.5, met = 0) => {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: met }));
    m.castShadow = true;
    return m;
  };
  const hand = (sd: 'L' | 'R') => J['hand.' + sd].clone().lerp(J['fingers1.' + sd], 0.55);
  {
    // the Chime (capture device): hexagonal brass bell-lantern with a top loop (never a ball)
    const g = chimeGeometry(0.04);
    const chime = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#C8963E', metalness: 0.9, roughness: 0.28, emissive: '#5a3a10', emissiveIntensity: 0.25 }));
    chime.position.copy(hand('R')).add(new THREE.Vector3(0, -0.0, 0.035)).sub(J['hand.R']);
    chime.visible = false;
    props.chime = chime;
    handProps.push({ bone: 'hand.R', obj: chime });
  }
  const pole = (len: number, r: number, color: string, sd: 'L' | 'R' = 'L', along = -0.45, tilt = 0.08) => {
    const g = new THREE.CylinderGeometry(r, r, len, 8);
    const m = propMesh(g, color, 0.7);
    m.position.copy(hand(sd)).sub(J['hand.' + sd]).add(new THREE.Vector3(0, len * along + len / 2 - 0.02, 0.03));
    m.rotation.z = tilt;
    handProps.push({ bone: 'hand.' + sd, obj: m });
    return m;
  };
  if (ex.has('staff')) pole(1.45, 0.013, '#6B4A2E', 'L', -0.38);
  if (ex.has('pole')) pole(1.9, 0.014, '#8C6A44', 'L', -0.2);
  if (ex.has('cane')) { const m = pole(0.86, 0.011, '#BFE6F2', 'L', -0.96, 0); (m.material as THREE.MeshStandardMaterial).transparent = true; (m.material as THREE.MeshStandardMaterial).opacity = 0.75; }
  if (ex.has('tongs')) pole(0.42, 0.008, '#3A3A3A', 'L', -0.8, 0.1);
  if (ex.has('mallet')) {
    const m = pole(0.5, 0.012, '#6B4A2E', 'L', -0.82, 0.1);
    const head = propMesh(new THREE.BoxGeometry(0.13, 0.08, 0.08), '#5B6770', 0.5, 0.6);
    head.position.set(0, -0.25, 0);
    m.add(head);
  }
  if (ex.has('clipboard')) {
    const m = propMesh(new THREE.BoxGeometry(0.16, 0.22, 0.01), '#C2A477', 0.8);
    m.position.copy(hand('L')).sub(J['hand.L']).add(new THREE.Vector3(0, 0.02, 0.07));
    m.rotation.set(0.4, 0, 0.2);
    const paper = propMesh(new THREE.PlaneGeometry(0.13, 0.17), '#F3EAD7', 0.9);
    paper.position.z = 0.006;
    m.add(paper);
    handProps.push({ bone: 'hand.L', obj: m });
  }
  if (ex.has('lantern')) {
    const m = propMesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 6), '#3a3440', 0.4, 0.7);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.09, 6), new THREE.MeshStandardMaterial({ color: '#E8C8F2', emissive: '#B98CD6', emissiveIntensity: 1.6 }));
    m.add(glow);
    m.position.copy(hand('R')).sub(J['hand.R']).add(new THREE.Vector3(0, -0.1, 0.02));
    handProps.push({ bone: 'hand.R', obj: m });
  }
  void metalM;

  // ------------------------------------------------------------------ finish
  const meshes: { geo: THREE.BufferGeometry; mat: THREE.Material; name: string }[] = [];
  const cg = cloth.build();
  if (cg) meshes.push({ geo: cg, mat: clothMaterial(q), name: 'cloth' });
  const mg = metal.build();
  if (mg) meshes.push({ geo: mg, mat: metalMaterial(), name: 'brass' });

  const hiding = layers.map((l, i) => ({ l, cut: cutCache[i] })).filter((h) => h.l.hides && !h.l.source);
  for (const h of hiding) if (h.cut.length === 0 || h.cut.every((c) => Number.isNaN(c))) { const c = new Float32Array(d.NO); for (let o = 0; o < d.NO; o++) c[o] = h.l.cut(o); h.cut = c; }
  const hideBody = (tris: Uint16Array) => {
    const out: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = d.rO[tris[i]], b = d.rO[tris[i + 1]], c = d.rO[tris[i + 2]];
      let hidden = false;
      for (const h of hiding) {
        const m = -(h.l.margin ?? 0.03);
        if (Number.isNaN(h.cut[a])) h.cut[a] = h.l.cut(a);
        if (Number.isNaN(h.cut[b])) h.cut[b] = h.l.cut(b);
        if (Number.isNaN(h.cut[c])) h.cut[c] = h.l.cut(c);
        const ca = h.cut[a], cb = h.cut[b], cc = h.cut[c];
        if (ca < m && cb < m && cc < m) { hidden = true; break; }
      }
      if (!hidden) out.push(tris[i], tris[i + 1], tris[i + 2]);
    }
    return Uint16Array.from(out);
  };
  return { meshes, props, hideBody, handProps };
}

// ------------------------------------------------------------------ shoes
function buildShoe(cloth: GBuilder, d: HumanData, s: BodyShape, R: Regions, L: ResolvedLook, sd: 'L' | 'R', S: (n: number) => number) {
  const W = L.wear;
  const sign = sd === 'L' ? 1 : -1;
  const fb = d.boneIndex['foot.' + sd], tb = d.boneIndex['toes.' + sd];
  // foot outline from the actual foot vertices
  const pts: number[][] = [];
  for (let o = 0; o < 13378; o++) {
    const lp = R.legPos[o];
    if (Number.isNaN(lp) || lp < 2.0 || R.side[o] !== sign) continue;
    pts.push([s.pos[o * 3], s.pos[o * 3 + 1], s.pos[o * 3 + 2]]);
  }
  if (!pts.length) return;
  const A = R.J['foot.' + sd], T = R.J['toes.' + sd];
  let zmin = 1e9, zmax = -1e9;
  for (const p of pts) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); }
  const K = S(14);
  const sl = Array.from({ length: K + 1 }, (_, i) => ({ z: zmin + ((zmax - zmin) * i) / K, x0: 1e9, x1: -1e9, top: 0 }));
  for (const p of pts) {
    const i = Math.round(((p[2] - zmin) / (zmax - zmin)) * K);
    for (const j of [i - 1, i, i + 1]) {
      const q = sl[j];
      if (!q) continue;
      q.x0 = Math.min(q.x0, p[0]); q.x1 = Math.max(q.x1, p[0]);
      if (p[1] < A.y + 0.02) q.top = Math.max(q.top, p[1]);
    }
  }
  for (let it = 0; it < 2; it++) for (let i = 1; i < K; i++) { sl[i].x0 = (sl[i - 1].x0 + sl[i].x0 * 2 + sl[i + 1].x0) / 4; sl[i].x1 = (sl[i - 1].x1 + sl[i].x1 * 2 + sl[i + 1].x1) / 4; sl[i].top = (sl[i - 1].top + sl[i].top * 2 + sl[i + 1].top) / 4; }
  const lift = L.soleLift;
  const soleH = W.shoe === 'shoe' ? 0.012 : W.shoe === 'boot' ? 0.02 : 0.024;
  const bottom = -lift;
  const upperC = C(L.shoes);
  const trimC = W.shoe === 'sneaker' ? C('#2A3A44') : shade(L.shoes, 0.72);
  const soleC = W.shoe === 'sneaker' ? C('#EFE6D2') : C('#2a211c');
  const outC = W.shoe === 'sneaker' ? C('#5a4a3e') : C('#1a1512');
  // ring profile (half, mirrored): [xFactor(0 center .. 1 side), y param], built per slice
  const ring = (i: number) => {
    const q = sl[i];
    const t = i / K; // 0 heel -> 1 toe
    const pad = 0.007 + 0.004 * Math.sin(t * Math.PI);
    const hw = Math.max(0.015, (q.x1 - q.x0) / 2 + pad);
    const cx = (q.x0 + q.x1) / 2;
    const toeRise = 0.012 * THREE.MathUtils.smoothstep(t, 0.8, 1.0);
    const b = bottom + toeRise;
    const collar = W.shoe === 'boot' ? A.y + 0.05 : W.shoe === 'sneaker' ? A.y - 0.004 : A.y - 0.014;
    let top = Math.max(q.top + 0.012, b + soleH + 0.03);
    if (t < 0.35) top = THREE.MathUtils.lerp(collar, top, THREE.MathUtils.smoothstep(t, 0.2, 0.35));
    top -= 0.01 * THREE.MathUtils.smoothstep(t, 0.85, 1.0);
    const sh = soleH;
    const P: [number, number, number][] = []; // x, y, kind(0 upper 1 sole 2 outsole)
    const half: [number, number, number][] = [
      [0.0, b, 2], [0.75, b, 2], [1.02, b + 0.004, 1], [1.05, b + sh * 0.5, 1], [1.04, b + sh, 1], [1.0, b + sh + 0.001, 0],
      [0.99, b + sh + (top - b - sh) * 0.45, 0], [0.9, top - (top - b - sh) * 0.18, 0], [0.62, top - 0.004, 0], [0.0, top, 0],
    ];
    for (const h of half) P.push([cx + h[0] * hw * sign, h[1], h[2]]);
    for (let k = half.length - 2; k >= 1; k--) { const h = half[k]; P.push([cx - h[0] * hw * sign, h[1], h[2]]); }
    return { P, z: q.z - (t < 0.02 ? 0.006 : 0) + (t > 0.98 ? 0.008 : 0), t, top, hw, cx };
  };
  const rings = sl.map((_, i) => ring(i));
  const M = rings[0].P.length;
  const base = cloth.count;
  const heelOpen = W.shoe !== 'boot';
  for (const r of rings) {
    const wT = THREE.MathUtils.smoothstep(r.t, 0.62, 0.78);
    for (let k = 0; k < M; k++) {
      const [x, y, kind] = r.P[k];
      const c = kind === 2 ? outC : kind === 1 ? soleC : (W.shoe === 'sneaker' && (r.t < 0.18 || r.t > 0.86)) ? trimC : upperC;
      const cl: [number, number, number, number] = [kind > 0 ? 4 : W.shoe === 'sneaker' ? 1 : 2, -1, 0, 0];
      cloth.vert([x, y, r.z], [0, 0, 0], [fb, tb, 0, 0], [1 - wT, wT, 0, 0], c, trimC, cl);
    }
  }
  const idx: number[] = [];
  const half = (M + 2) / 2;
  for (let i = 0; i < K; i++) {
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      // heel collar opening: drop the top faces of heel slices
      const topArc = (kk: number) => Math.abs(kk - (half - 1)) <= 2;
      if (heelOpen && rings[i].t < 0.3 && topArc(k) && topArc(k2)) continue;
      if (!heelOpen && rings[i].t < 0.25 && topArc(k) && topArc(k2)) continue;
      const a = base + i * M + k, b = base + i * M + k2, c = base + (i + 1) * M + k, dd = base + (i + 1) * M + k2;
      if (sign > 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
    }
  }
  // end caps (heel and toe)
  for (const [ri, flip] of [[0, true], [K, false]] as const) {
    const cIdx = cloth.vert([rings[ri].cx, (rings[ri].top + bottom) / 2, rings[ri].z + (ri === 0 ? -0.004 : 0.004)], [0, 0, 0], [ri === 0 ? fb : tb, 0, 0, 0], [1, 0, 0, 0], ri === 0 ? trimC : trimC, trimC, [W.shoe === 'sneaker' ? 1 : 2, -1, 0, 0]);
    for (let k = 0; k < M; k++) {
      const a = base + ri * M + k, b = base + ri * M + ((k + 1) % M);
      if (heelOpen && ri === 0 && Math.abs(k - (half - 1)) <= 2 && Math.abs(((k + 1) % M) - (half - 1)) <= 2) continue;
      if ((flip ? 1 : -1) * sign > 0) idx.push(cIdx, b, a); else idx.push(cIdx, a, b);
    }
  }
  // normals
  const vn = new Float32Array((cloth.count - base) * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] - base, idx[t + 1] - base, idx[t + 2] - base];
    const pa = cloth.pos.slice((a + base) * 3, (a + base) * 3 + 3), pb = cloth.pos.slice((b + base) * 3, (b + base) * 3 + 3), pc = cloth.pos.slice((c + base) * 3, (c + base) * 3 + 3);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const x of [a, b, c]) { vn[x * 3] += n[0]; vn[x * 3 + 1] += n[1]; vn[x * 3 + 2] += n[2]; }
  }
  for (let i = 0; i < vn.length / 3; i++) {
    const l = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) cloth.nrm[(base + i) * 3 + k] = vn[i * 3 + k] / l;
  }
  for (const i of idx) cloth.idx.push(i);
  // laces across the instep (sneakers/boots)
  if (W.shoe !== 'shoe') {
    const laceC = W.shoe === 'sneaker' ? C('#F3EDE0') : C('#3a2a1c');
    for (let j = 0; j < 5; j++) {
      const t = 0.36 + j * 0.075;
      const i = Math.round(t * K);
      const r = rings[Math.min(K, i)];
      const g = new THREE.CylinderGeometry(0.0022, 0.0022, r.hw * 0.75, 5);
      g.rotateZ(Math.PI / 2 + (j % 2 ? 0.25 : -0.25));
      g.translate(r.cx, r.top + 0.0015, r.z);
      const wT = THREE.MathUtils.smoothstep(t, 0.62, 0.78);
      const gi = cloth.count;
      cloth.add(g, new THREE.Matrix4(), fb, laceC, laceC, 0, 0);
      void gi; void wT;
    }
  }
}

// ------------------------------------------------------------------ helpers
export interface HeadShape { c: THREE.Vector3; r: THREE.Vector3 }
const headCache = new WeakMap<BodyShape, HeadShape>();
export function headShape(d: HumanData, s: BodyShape): HeadShape {
  const h = headCache.get(s);
  if (h) return h;
  // skull ellipsoid from the head-bone vertices above the eyes (ears excluded by |x| limit from the eye spacing)
  const eyeY = (s.eyeL.y + s.eyeR.y) / 2;
  const hb = d.boneIndex.head;
  let top = -1e9, minZ = 1e9, maxZ = -1e9, maxX = 0;
  const earX = Math.abs(s.eyeL.x) * 2.6;
  for (let o = 0; o < 13378; o++) {
    if (d.domBone[o] !== hb) continue;
    const x = s.pos[o * 3], y = s.pos[o * 3 + 1], z = s.pos[o * 3 + 2];
    if (y < eyeY) continue;
    top = Math.max(top, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (Math.abs(x) < earX) maxX = Math.max(maxX, Math.abs(x));
  }
  const ry = (top - eyeY) * 1.05;
  const r = new THREE.Vector3(maxX, ry, (maxZ - minZ) / 2);
  const c = new THREE.Vector3(0, top - ry, (maxZ + minZ) / 2 - 0.004);
  const res = { c, r };
  headCache.set(s, res);
  return res;
}

export interface HeadField { c: THREE.Vector3; radius(dir: THREE.Vector3): number; point(a: number, el: number, off: number): THREE.Vector3 }
const fieldCache = new WeakMap<BodyShape, HeadField>();
/** Radial height field of the skull around the head-ellipsoid centre (ears excluded): exact coverage for caps/hair. */
export function headField(d: HumanData, s: BodyShape): HeadField {
  const f0 = fieldCache.get(s);
  if (f0) return f0;
  const hs = headShape(d, s);
  const NA = 48, NE = 24;
  const grid = new Float32Array(NA * NE).fill(0);
  const hb = d.boneIndex.head;
  const eyeY = (s.eyeL.y + s.eyeR.y) / 2;
  const earX = hs.r.x * 0.86;
  for (let o = 0; o < 13378; o++) {
    if (d.domBone[o] !== hb) continue;
    const x = s.pos[o * 3] - hs.c.x, y = s.pos[o * 3 + 1] - hs.c.y, z = s.pos[o * 3 + 2] - hs.c.z;
    if (Math.abs(x) > earX && s.pos[o * 3 + 1] < eyeY + 0.035 && z < 0.03 && z > -0.06) continue; // ears
    const r = Math.hypot(x, y, z);
    const a = Math.atan2(x, z), el = Math.asin(y / r);
    const i = Math.min(NA - 1, Math.floor(((a + Math.PI) / (Math.PI * 2)) * NA));
    const j = Math.min(NE - 1, Math.floor(((el + Math.PI / 2) / Math.PI) * NE));
    grid[j * NA + i] = Math.max(grid[j * NA + i], r);
  }
  // fill holes, then blur (wrap in azimuth)
  for (let it = 0; it < 6; it++) {
    const g2 = Float32Array.from(grid);
    for (let j = 0; j < NE; j++) for (let i = 0; i < NA; i++) {
      let sum = 0, n = 0, mx = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = Math.min(NE - 1, Math.max(0, j + dj)), ii = (i + di + NA) % NA;
        const v = grid[jj * NA + ii];
        if (v > 0) { sum += v; n++; mx = Math.max(mx, v); }
      }
      const cur = grid[j * NA + i];
      g2[j * NA + i] = cur > 0 ? (it < 3 ? Math.max(cur, (sum / Math.max(1, n)) * 0.5 + mx * 0.5) : cur * 0.5 + (sum / n) * 0.5) : n ? sum / n : 0;
    }
    grid.set(g2);
  }
  const radius = (dir: THREE.Vector3) => {
    const a = Math.atan2(dir.x, dir.z), el = Math.asin(Math.max(-1, Math.min(1, dir.y / (dir.length() || 1))));
    const fi = ((a + Math.PI) / (Math.PI * 2)) * NA - 0.5, fj = Math.max(0, Math.min(NE - 1.001, ((el + Math.PI / 2) / Math.PI) * NE - 0.5));
    const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
    const g = (i: number, j: number) => grid[j * NA + ((i % NA) + NA) % NA];
    const v = (g(i0, j0) * (1 - ti) + g(i0 + 1, j0) * ti) * (1 - tj) + (g(i0, j0 + 1) * (1 - ti) + g(i0 + 1, j0 + 1) * ti) * tj;
    return v || Math.max(hs.r.x, hs.r.z);
  };
  const point = (a: number, el: number, off: number) => {
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
    return hs.c.clone().addScaledVector(dir, radius(dir) + off);
  };
  const res = { c: hs.c.clone(), radius, point };
  fieldCache.set(s, res);
  return res;
}

/** Shell over the skull field between a rim (per-azimuth y) and the crown. */
function fieldCap(F: HeadField, off: (a: number, t: number) => number, rimY: (a: number) => number, na: number, nt: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nt; j++) {
    const t = j / nt;
    for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2;
      // elevation of the rim: solve y(el) = rimY by bisection
      let lo = -0.9, hi = 1.5;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (F.point(a, m, off(a, 0)).y < rimY(a)) lo = m; else hi = m; }
      const el = THREE.MathUtils.lerp(lo, Math.PI / 2 - 0.001, 1 - Math.pow(1 - t, 1.4));
      const p = F.point(a, el, off(a, t));
      pos.push(p.x, p.y, p.z);
    }
  }
  const W = na + 1;
  for (let j = 0; j < nt; j++) for (let i = 0; i < na; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function surfaceZ(d: HumanData, s: BodyShape, x: number, y: number) {
  let best = -1e9;
  for (let o = 0; o < 13378; o++) {
    const px = s.pos[o * 3], py = s.pos[o * 3 + 1];
    if (Math.abs(px - x) < 0.015 && Math.abs(py - y) < 0.015) best = Math.max(best, s.pos[o * 3 + 2]);
  }
  void d;
  return best > -1e8 ? best : 0.1;
}

function capBrim(F: HeadField, n: number, rimY: number, front: THREE.Vector3): THREE.BufferGeometry {
  // curved bill: follows the crown rim at the front, extends forward ~7 cm, arched, thin slab
  const pos: number[] = [], idx: number[] = [];
  const rows = 4;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= n; i++) {
      const a = (-1 + (2 * i) / n) * 0.95;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const base = F.c.clone().addScaledVector(dir, F.radius(new THREE.Vector3(Math.sin(a), (rimY - F.c.y) / 0.1, Math.cos(a)).normalize()) + 0.016);
      const ext = 0.062 * Math.pow(Math.max(0, Math.cos(a * 1.05)), 0.9) * v;
      const p = base.addScaledVector(dir, ext);
      p.x *= 1 + 0.0 * v;
      const yy = rimY + 0.001 - v * 0.012 - Math.pow(Math.abs(Math.sin(a)), 1.5) * 0.02 * v;
      for (const t of [0, 1]) pos.push(p.x, yy - t * 0.0045, p.z);
    }
  }
  void front;
  const W = n + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    for (const t of [0, 1]) {
      const a = ((j * W + i) * 2) + t, b = ((j * W + i + 1) * 2) + t, c = (((j + 1) * W + i) * 2) + t, dd = (((j + 1) * W + i + 1) * 2) + t;
      if (t === 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = ((rows * W + i) * 2), b = ((rows * W + i + 1) * 2);
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function roundedBox(w: number, h: number, dd: number, r: number, seg: number) {
  const g = new THREE.BoxGeometry(w, h, dd, seg * 2, seg * 2, seg * 2);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, dd / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = v.clone().clamp(inner.clone().negate(), inner);
    const n = v.clone().sub(c);
    if (n.lengthSq() > 0) v.copy(c).add(n.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Chime: hexagonal bell-lantern with a top loop (brass). ~size = radius. */
export function chimeGeometry(r: number): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(0.0, -0.95), new THREE.Vector2(0.55, -0.95), new THREE.Vector2(1.0, -0.8), new THREE.Vector2(0.92, -0.55),
    new THREE.Vector2(0.78, 0.1), new THREE.Vector2(0.62, 0.55), new THREE.Vector2(0.35, 0.8), new THREE.Vector2(0.18, 0.86), new THREE.Vector2(0.0, 0.88),
  ].map((v) => v.multiplyScalar(r));
  const bell = new THREE.LatheGeometry(prof, 6);
  const loop = new THREE.TorusGeometry(r * 0.28, r * 0.07, 5, 10);
  loop.translate(0, r * 1.1, 0);
  const band = new THREE.TorusGeometry(r * 0.86, r * 0.07, 4, 6);
  band.rotateX(Math.PI / 2);
  band.translate(0, -r * 0.55, 0);
  const merged = mergeSimple([bell, loop, band]);
  return merged;
}

function mergeSimple(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0 : g0;
    const base = pos.length / 3;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}
