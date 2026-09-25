// Declarative part-table assembler. Species builders describe parts exactly like the
// build-spec tables in design/creatures.md (dimensions in multiples of H) and this module
// turns them into a named Object3D hierarchy with materials, faces, anchors and bounds.
//
// v3 (DECISIONS D31): organic parts are no longer separate intersecting primitives. Every sculptable part
// (sphere, capsule, cone, cylinder, lathe, chain segment) of a material group is evaluated as one signed-distance
// field with per-pair smooth blending (sdf.ts), meshed once per species/LOD/quality (cached), and rendered as a
// SkinnedMesh whose bones are the part nodes themselves, so the procedural animator (anim.ts) still bends necks,
// legs and tails — now as continuous skin. Hard accessories (horns, claws, crystals, fins, sails, glowing parts,
// translucent parts, tiny details) stay separate crisp meshes on their nodes. Eyes are real geometry with lids
// (eyes.ts); mouths are decals conformed to the sculpted surface.
import * as THREE from 'three';
import { box, capsule, cone, cylinder, ellipsoid, extrude, lathe, segs as segsBase, smoothProfile, torus, tube, vertexNoise, triCount, PROFILES, type Lod, type Quality } from './primitives';
import { cloneCreatureMaterial, makeMaterial, shade, type MatOpts, type Preset } from './materials';
import { discGeometry, faceAtlas, FaceRig, type EyeSpec, type MouthSpec } from './face';
import { buildEye, type Eye3D } from './eyes';
import { cellSizeFor, countTris, K, meshField, SdfField, type BodyGeometry, type SdfPrim } from './sdf';

export type V3 = [number, number, number];

export type Prim =
  | { t: 'sphere'; r: number | V3; half?: boolean }
  | { t: 'capsule'; r: number; len: number; r2?: number }
  | { t: 'cone'; r: number; h: number }
  | { t: 'cyl'; r: number; h: number; r2?: number }
  | { t: 'box'; w: number; h: number; d: number }
  | { t: 'torus'; R: number; r: number; arc?: number }
  | { t: 'lathe'; profile: string | [number, number][]; h: number; rmax: number; axis?: 'y' | 'z' | '-z' | '-y' }
  | { t: 'extrude'; shape: string; w: number; h: number; depth: number }
  | { t: 'tube'; pts: V3[]; r0: number; r1: number; ridge?: [number, number] }
  | { t: 'eye'; r: number; bulge?: number }
  | { t: 'mouth'; r: number; w?: number; bulge?: number }
  | { t: 'none' };

export type Slot = 'P' | 'S' | 'A' | 'D' | 'P+' | 'P-' | 'S+' | 'S-' | 'A+' | 'A-' | 'W' | string; // string => literal hex

export interface ChainSpec {
  n: number;
  r0: number;          // radius at chain root
  r1: number;          // radius at tip
  len: number;         // TOTAL chain length (×H)
  bend?: V3;           // per-segment rest rotation (deg)
}

export interface PartDef {
  name: string;
  parent?: string;     // default 'root'; for mirrored parents use the base name (auto-resolves _L/_R)
  prim: Prim;
  at?: V3;             // ×H, in parent space
  rot?: V3;            // degrees pitch/yaw/roll (X/Y/Z)
  scale?: V3;
  slot?: Slot;
  mat?: Preset;
  mirror?: boolean;    // creates name_L (x as given, creature's left) and name_R (x negated)
  anim?: string[];     // role tags: br, look, gait:FL, wave, flap, glow, jaw, spin, fx:<anchor>, bob, sway
  emissive?: number;   // emissive intensity using the part colour (or `glowColor`)
  glowColor?: Slot;
  opacity?: number;
  fluffy?: number;     // vertex noise amplitude (×H)
  chain?: ChainSpec;   // prim is ignored for chain; segments are tapered capsules along +Y then oriented by rot
  lod?: 0 | 1;         // omitted at LOD greater than this value (small accessories)
  flat?: boolean;      // flat shading
  // ---- v3 sculpting controls (DECISIONS D31) ----
  /** false: never sculpt (keep as a crisp accessory); number: sculpt with this fillet radius (×H) */
  blend?: number | false;
  /** explicit blend partner (part name); default = nearest sculpted ancestor, else the most-overlapping earlier part */
  blendWith?: string;
  /** molten-fissure glow weight on the sculpted skin (0..1), coloured by `SpeciesVisual.fissureColor` */
  fissure?: number;
  /** fur length multiplier for shell fur (FUR/HAIR only) */
  fur?: number;
  /** mirror the geometry itself on the _R side (for asymmetric shapes such as wings) */
  mirrorGeom?: boolean;
}

export interface SpeciesVisual {
  id: string;
  H: number;                           // height in metres
  colors: Record<string, string>;      // P, S, A, D ...
  mat: Preset;                         // default preset
  rim?: string;
  rimStrength?: number;
  eye: EyeSpec;
  mouth?: MouthSpec;
  parts: PartDef[];
  rig: RigParams;
  hoverGap?: number;                   // ×H (floaters)
  /** v3: sculpted SDF body (default true) */
  sculpt?: boolean;
  /** v3: shell-fur length ×H (default 0.02) */
  furLen?: number;
  /** v3: fissure glow colour slot (default A) and intensity */
  fissureColor?: Slot;
  fissureGlow?: number;
  /** v3: eyeball gaze pull toward the creature's forward axis (0..1, default 0.45) */
  gaze?: number;
}

export type RigType = 'QUAD' | 'BIPED' | 'CHAIN' | 'WING' | 'FLOAT' | 'RADIAL' | 'BALL' | 'FLAT' | 'HUMAN';
export type AttackStyle = 'lunge' | 'spin' | 'dive' | 'slam' | 'cast' | 'whip' | 'roll' | 'rear' | 'coil';

export interface RigParams {
  type: RigType;
  gaitHz?: number;
  stride?: number;          // deg leg swing
  bounce?: number;          // ×H
  breath?: number;          // scale amplitude
  breathHz?: number;
  waveAmp?: number;         // deg per chain segment
  waveHz?: number;
  waveAxis?: 'yaw' | 'pitch' | 'roll';
  flapAmp?: number;
  flapHz?: number;
  attack: AttackStyle;
  special?: AttackStyle;
  stepped?: number;         // fps for stepped interpolation (f09 = 12)
  faint?: 'side' | 'forward' | 'sink' | 'collapse';
  spinHz?: number;          // rotor parts
  lean?: number;            // deg forward lean when moving
  hop?: boolean;            // hopping locomotion
}

export interface CreatureModel {
  id: string;
  root: THREE.Group;        // origin on ground; +Z forward
  pivot: THREE.Group;       // animated child of root (whole-body motion)
  parts: Record<string, THREE.Object3D>;
  rest: Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>;
  tags: Map<string, string[]>; // part name -> anim tags
  anchors: Record<string, THREE.Object3D>;
  face: FaceRig;
  glowMats: THREE.MeshStandardMaterial[];
  glowBase: number[];
  bounds: { height: number; radius: number; headHeight: number; length: number };
  stats: { triangles: number; drawCalls: number; materials: number; sculptedTris: number; meshMs: number };
  visual: SpeciesVisual;
  dispose(): void;
}

function colorOf(v: SpeciesVisual, slot: Slot | undefined): string {
  const s = slot ?? 'P';
  if (s.startsWith('#')) return s;
  const base = s.replace(/[+-]$/, '');
  const c = v.colors[base] ?? (base === 'D' ? '#221E1C' : base === 'W' ? '#F4F1EA' : v.colors.P);
  if (s.endsWith('+')) return shade(c, 0.22);
  if (s.endsWith('-')) return shade(c, -0.18);
  return c;
}

const DEG = Math.PI / 180;

function primSize(p: Prim): number {
  switch (p.t) {
    case 'sphere': return 2 * (typeof p.r === 'number' ? p.r : Math.max(...p.r));
    case 'capsule': return Math.max(p.len, 2 * p.r);
    case 'cone': case 'cyl': return Math.max(p.h, 2 * p.r);
    case 'lathe': return Math.max(p.h, 2 * p.rmax);
    case 'torus': return 2 * p.R;
    case 'tube': return 4 * p.r0;
    default: return 1;
  }
}

function mirrorX(g: THREE.BufferGeometry) {
  g.scale(-1, 1, 1);
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  } else {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const swap = (attr: THREE.BufferAttribute) => {
      for (let i = 0; i < attr.count; i += 3) {
        for (let c = 0; c < attr.itemSize; c++) {
          const a = attr.getComponent(i + 1, c);
          attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
          attr.setComponent(i + 2, c, a);
        }
      }
    };
    for (const k of Object.keys(g.attributes)) swap(g.attributes[k] as THREE.BufferAttribute);
    void pos;
  }
  g.computeVertexNormals();
}

function buildGeometry(p: Prim, H: number, lod: Lod, q: Quality): THREE.BufferGeometry | null {
  const size = primSize(p) * H;
  const segs = (k: Parameters<typeof segsBase>[0], l: Lod, qq: Quality) => segsBase(k, l, qq, size);
  switch (p.t) {
    case 'sphere': {
      const [w, hs] = segs('sphere', lod, q);
      const r = typeof p.r === 'number' ? [p.r, p.r, p.r] : p.r;
      const g = ellipsoid(r[0] * H, r[1] * H, r[2] * H, w, hs);
      if (p.half) {
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.15);
        g.computeVertexNormals();
      }
      return g;
    }
    case 'capsule': {
      const [rad, cap] = segs('capsule', lod, q);
      return capsule(p.r * H, p.len * H, rad, cap, p.r2 != null ? p.r2 * H : undefined);
    }
    case 'cone':
      return cone(p.r * H, p.h * H, segs('cone', lod, q)[0]);
    case 'cyl':
      return cylinder(p.r * H, p.h * H, segs('cone', lod, q)[0], p.r2 != null ? p.r2 * H : undefined);
    case 'box':
      return box(p.w * H, p.h * H, p.d * H);
    case 'torus':
      return torus(p.R * H, p.r * H, segs('cone', lod, q)[0], p.arc ?? 360);
    case 'lathe': {
      const g = lathe(p.profile, p.h * H, p.rmax * H, segs('lathe', lod, q)[0]);
      if (p.axis === 'z') g.rotateX(Math.PI / 2);
      else if (p.axis === '-z') g.rotateX(-Math.PI / 2);
      else if (p.axis === '-y') g.rotateX(Math.PI);
      return g;
    }
    case 'extrude':
      return extrude(p.shape, p.w * H, p.h * H, p.depth * H, lod === 2 ? 4 : 8);
    case 'tube': {
      const [rad, len] = segs('tube', lod, q);
      return tube(p.pts.map((v) => [v[0] * H, v[1] * H, v[2] * H]), p.r0 * H, p.r1 * H, rad, p.ridge ? len * 2 : len, p.ridge);
    }
    case 'eye':
      return discGeometry(p.r * H, (p.bulge ?? 0.35) * p.r * H, lod === 2 ? 10 : 22);
    case 'mouth': {
      const g = discGeometry(p.r * H, (p.bulge ?? 0.2) * p.r * H, 18);
      if (p.w) g.scale(p.w, 1, 1);
      return g;
    }
    case 'none':
      return null;
  }
}

export interface BuildOpts {
  lod: Lod;
  quality: Quality;
  /** force the legacy primitive build (no sculpting) */
  legacy?: boolean;
}

// ------------------------------------------------------------------------------------------------ sculpt setup
const SCULPT_PRESETS = new Set<Preset>(['FUR', 'HAIR', 'SCALE', 'FEATHER', 'SKIN', 'SKIN_WET', 'STONE', 'SHELL']);
const groupOf = (p: Preset): Preset => (p === 'HAIR' ? 'FUR' : p);

interface PartInst {
  pd: PartDef;
  name: string;
  side: '' | '_L' | '_R';
  node: THREE.Object3D;
  color: string;
  stub: boolean;
  seg?: { r: number; r2: number; len: number };
}

const RES: Record<Quality, number> = { high: 66, balanced: 54, mobile: 36 };
const LODK = [1, 0.62, 0.4];
const TRI_CAP: Record<Quality, number> = { high: 12500, balanced: 8500, mobile: 4200 };
/** whole-creature LOD0 target (sculpted body + accessories + fur shells) */
const BUDGET: Record<Quality, number> = { high: 25000, balanced: 16000, mobile: 8500 };
const LOD_TRI = [1, 0.42, 0.18];

const specHash = new WeakMap<SpeciesVisual, string>();
function hashOf(v: SpeciesVisual): string {
  let h = specHash.get(v);
  if (h) return h;
  const s = JSON.stringify(v);
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  h = (x >>> 0).toString(36);
  specHash.set(v, h);
  return h;
}

function seedOf(s: string): number {
  let x = 7;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return x & 0xffff;
}

/** Build the SDF primitive for a sculptable part (null = not sculptable). Mesh space = root space at rest. */
function sdfPrim(pi: PartInst, v: SpeciesVisual): SdfPrim | null {
  const pd = pi.pd;
  const H = v.H;
  const node = pi.node;
  const mw = node.matrixWorld;
  const e = mw.elements;
  const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
  const inv = mw.clone().invert().elements;
  const m = new Float64Array([inv[0], inv[4], inv[8], inv[12], inv[1], inv[5], inv[9], inv[13], inv[2], inv[6], inv[10], inv[14]]);
  const base = {
    m, s: Math.min(sx, sy, sz), mirror: !!pd.mirrorGeom && pi.side === '_R',
    a: 0, b: 0, c: 0, d: 0, e: 0,
    fluff: pd.fluffy ? pd.fluffy * H * 1.5 : 0,
    fluffF: 1 / (0.05 * H),
    seed: seedOf(pi.name),
    cx: 0, cy: 0, cz: 0, R: 0, parent: -1, k: 0, thick: 0,
    bone: pi.name,
    color: new THREE.Color(pi.color),
    fur: 0,
    glow: pd.fissure ?? 0,
  };
  let kind: K;
  let lc = new THREE.Vector3();
  let lr = 0;
  let thick = 0;
  let extra: Partial<SdfPrim> = {};
  if (pi.seg) {
    kind = K.RCONE;
    const { r, r2, len } = pi.seg;
    base.a = r; base.b = r2; base.c = Math.max(len, Math.abs(r - r2) + 1e-4); base.d = 0.4 * r;
    lc.set(0, 0.4 * r + len / 2, 0);
    lr = len / 2 + Math.max(r, r2);
    thick = (r + r2) / 2;
  } else {
    const p = pd.prim;
    switch (p.t) {
      case 'sphere': {
        const r = typeof p.r === 'number' ? [p.r, p.r, p.r] : p.r;
        kind = K.ELL;
        base.a = r[0] * H; base.b = r[1] * H; base.c = r[2] * H;
        extra.half = p.half;
        lr = Math.max(base.a, base.b, base.c);
        thick = Math.min(base.a, base.b, base.c);
        break;
      }
      case 'capsule': {
        kind = K.RCONE;
        const r = p.r * H, r2 = (p.r2 ?? p.r) * H, len = p.len * H;
        base.a = r; base.b = r2; base.c = Math.max(len, Math.abs(r - r2) + 1e-4); base.d = r;
        lc.set(0, r + len / 2, 0);
        lr = len / 2 + Math.max(r, r2);
        thick = (r + r2) / 2;
        break;
      }
      case 'cone': {
        if (pd.blend == null && p.h > 2.2 * p.r) return null;
        kind = K.CCONE;
        base.a = p.r * H; base.b = 0; base.c = p.h * H;
        lc.set(0, base.c / 2, 0);
        lr = Math.hypot(base.c / 2, base.a);
        thick = base.a * 0.55;
        break;
      }
      case 'cyl': {
        kind = K.CCONE;
        base.a = p.r * H; base.b = (p.r2 ?? p.r) * H; base.c = p.h * H;
        lc.set(0, base.c / 2, 0);
        lr = Math.hypot(base.c / 2, Math.max(base.a, base.b));
        thick = Math.min(Math.max(base.a, base.b), base.c / 2);
        break;
      }
      case 'lathe': {
        if (p.profile === 'L_crater' || p.profile === 'L_bowl') return null;
        const pts = typeof p.profile === 'string' ? PROFILES[p.profile] : p.profile;
        if (!pts) return null;
        const sp = smoothProfile(pts, Math.max(10, pts.length * 3)).map((q) => [q.x * p.rmax * H, q.y * p.h * H]);
        const poly: number[] = [];
        if (sp[0][0] > 1e-5) poly.push(0, sp[0][1]);
        for (const q of sp) poly.push(q[0], q[1]);
        if (sp[sp.length - 1][0] > 1e-5) poly.push(0, sp[sp.length - 1][1]);
        kind = K.LATHE;
        extra.poly = new Float64Array(poly);
        extra.lax = p.axis === 'z' ? 1 : p.axis === '-z' ? 2 : p.axis === '-y' ? 3 : 0;
        const hh = p.h * H;
        const ax = hh / 2 * (extra.lax === 2 || extra.lax === 3 ? -1 : 1);
        lc = extra.lax === 1 || extra.lax === 2 ? new THREE.Vector3(0, 0, ax) : new THREE.Vector3(0, ax, 0);
        lr = Math.hypot(hh / 2, p.rmax * H);
        thick = Math.min(p.rmax * H * 0.6, hh / 2);
        break;
      }
      case 'box': {
        if (pd.blend == null) return null;
        kind = K.BOX;
        base.a = (p.w * H) / 2; base.b = (p.h * H) / 2; base.c = (p.d * H) / 2;
        base.d = Math.min(base.a, base.b, base.c) * 0.3;
        lr = Math.hypot(base.a, base.b, base.c);
        thick = Math.min(base.a, base.b, base.c);
        break;
      }
      default:
        return null;
    }
  }
  const smax = Math.max(sx, sy, sz);
  const wc = lc.clone().applyMatrix4(mw);
  return {
    ...base,
    ...extra,
    kind: kind!,
    cx: wc.x, cy: wc.y, cz: wc.z,
    R: lr * smax,
    thick: thick * base.s,
  } as SdfPrim;
}

function sculptable(pi: PartInst, v: SpeciesVisual): boolean {
  const pd = pi.pd;
  if (pi.stub || pd.blend === false) return false;
  if (pd.prim.t === 'none' && !pi.seg) return false;
  if (pd.emissive && pd.emissive > 0) return false;
  if (pd.opacity != null && pd.opacity < 1) return false;
  if (pd.flat) return false;
  const preset = pd.mat ?? v.mat;
  if (!SCULPT_PRESETS.has(preset)) return false;
  const explicit = typeof pd.blend === 'number';
  if (!explicit && pd.lod != null) return false;
  if (!explicit && (pd.slot ?? 'P').replace(/[+-]$/, '') === 'D') return false;
  return true;
}

interface SculptSet {
  groups: { preset: Preset; field: SdfField; members: PartInst[]; glow: boolean }[];
  accessory: Set<PartInst>;
  cell: number;
}

function planSculpt(insts: PartInst[], v: SpeciesVisual, opts: BuildOpts): SculptSet {
  const H = v.H;
  const cand: { pi: PartInst; prim: SdfPrim }[] = [];
  for (const pi of insts) {
    if (!sculptable(pi, v)) continue;
    const prim = sdfPrim(pi, v);
    if (prim) cand.push({ pi, prim });
  }
  const accessory = new Set<PartInst>(insts);
  if (!cand.length) return { groups: [], accessory, cell: 0 };
  const res = RES[opts.quality] * LODK[opts.lod];
  const cell = cellSizeFor(new SdfField(cand.map((c) => c.prim)), res);
  // thin parts would alias on the grid: they stay crisp accessories at this resolution
  const keep = cand.filter((c) => typeof c.pi.pd.blend === 'number' ? c.prim.thick >= cell * 0.8 : c.prim.thick >= cell * 1.25);
  const byGroup = new Map<Preset, { pi: PartInst; prim: SdfPrim }[]>();
  for (const c of keep) {
    const g = groupOf(c.pi.pd.mat ?? v.mat);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(c);
  }
  const groups: SculptSet['groups'] = [];
  for (const [preset, list] of byGroup) {
    const prims = list.map((c) => c.prim);
    const nodeIndex = new Map<THREE.Object3D, number>();
    list.forEach((c, i) => nodeIndex.set(c.pi.node, i));
    const byName = new Map<string, number>();
    list.forEach((c, i) => byName.set(c.pi.name, i));
    list.forEach((c, i) => {
      const pr = prims[i];
      const pd = c.pi.pd;
      let partner = -1;
      if (pd.blendWith) {
        partner = byName.get(pd.blendWith + c.pi.side) ?? byName.get(pd.blendWith) ?? -1;
      }
      if (partner < 0) {
        let n: THREE.Object3D | null = c.pi.node.parent;
        while (n && partner < 0) {
          const j = nodeIndex.get(n);
          if (j != null && j !== i) partner = j;
          n = n.parent;
        }
      }
      if (partner < 0) {
        let best = 0;
        for (let j = 0; j < i; j++) {
          const q = prims[j];
          const ov = pr.R + q.R - Math.hypot(pr.cx - q.cx, pr.cy - q.cy, pr.cz - q.cz);
          if (ov > best) { best = ov; partner = j; }
        }
      }
      pr.parent = partner;
      if (typeof pd.blend === 'number') pr.k = pd.blend * H;
      else if (partner >= 0) pr.k = Math.min(0.12 * H, 0.55 * Math.min(pr.thick, prims[partner].thick));
      pr.fur = preset === 'FUR' ? (pd.fur ?? (pd.fluffy ? 1.6 : 0.3)) : 0;
      accessory.delete(c.pi);
    });
    groups.push({ preset, field: new SdfField(prims), members: list.map((c) => c.pi), glow: list.some((c) => (c.pi.pd.fissure ?? 0) > 0) });
  }
  return { groups, accessory, cell };
}

// ------------------------------------------------------------------------------------------------ assemble
export function assemble(v: SpeciesVisual, opts: BuildOpts): CreatureModel {
  const H = v.H;
  const root = new THREE.Group();
  root.name = v.id;
  const pivot = new THREE.Group();
  pivot.name = 'pivot';
  root.add(pivot);
  const parts: Record<string, THREE.Object3D> = { root: pivot };
  const tags = new Map<string, string[]>();
  const anchors: Record<string, THREE.Object3D> = {};
  const geoms: THREE.BufferGeometry[] = [];
  const ownedMats = new Set<THREE.Material>();
  const ownedTex: THREE.Texture[] = [];
  const mats = new Set<THREE.Material>();
  const eyeMats: THREE.MeshStandardMaterial[] = [];
  let mouthMat: THREE.MeshStandardMaterial | null = null;
  const glowMats: THREE.MeshStandardMaterial[] = [];
  const glowBase: number[] = [];
  let tris = 0;
  let draws = 0;
  let sculptedTris = 0;
  let meshMs = 0;
  const atlas = faceAtlas(v.id, v.eye, v.mouth ?? null, opts.quality);
  const matBase = (preset: Preset): Omit<MatOpts, 'color'> => ({ preset, quality: opts.quality, rim: v.rim, rimStrength: v.rimStrength, H });

  // ---------------- pass 1: node hierarchy
  const insts: PartInst[] = [];
  const instOfNode = new Map<THREE.Object3D, PartInst>();
  const resolveParent = (name: string | undefined, side: '' | '_L' | '_R'): THREE.Object3D => {
    const n = name ?? 'root';
    if (side && parts[n + side]) return parts[n + side];
    if (parts[n]) return parts[n];
    if (parts[n + '_L']) return parts[n + '_L'];
    throw new Error(`${v.id}: unknown parent ${n}`);
  };
  const addNode = (pd: PartDef, name: string, side: '' | '_L' | '_R', stub: boolean) => {
    const parent = resolveParent(pd.parent, side);
    const node = new THREE.Bone();
    node.name = name;
    const at = pd.at ?? [0, 0, 0];
    const rot = pd.rot ?? [0, 0, 0];
    const sx = side === '_R' ? -1 : 1;
    node.position.set(at[0] * H * sx, at[1] * H, at[2] * H);
    node.rotation.set(rot[0] * DEG, rot[1] * DEG * sx, rot[2] * DEG * sx, 'XYZ');
    if (pd.scale) node.scale.set(...pd.scale);
    parent.add(node);
    parts[name] = node;
    const sideTags = (pd.anim ?? []).map((t) => (side === '_R' && t.startsWith('gait:') ? t.replace(/L$/, 'R') : t));
    tags.set(name, sideTags);
    for (const t of pd.anim ?? []) if (t.startsWith('fx:')) anchors[t.slice(3)] = node;
    const color = colorOf(v, pd.slot);
    if (pd.chain) {
      const ch = pd.chain;
      const segLen = (ch.len / ch.n) * H;
      let prev: THREE.Object3D = node;
      for (let i = 0; i < ch.n; i++) {
        const r = (ch.r0 + (ch.r1 - ch.r0) * (i / ch.n)) * H;
        const r2 = (ch.r0 + (ch.r1 - ch.r0) * ((i + 1) / ch.n)) * H;
        const seg = new THREE.Bone();
        seg.name = `${name}${i}`;
        if (i > 0) seg.position.set(0, segLen, 0);
        if (ch.bend && i > 0) seg.rotation.set(ch.bend[0] * DEG, ch.bend[1] * DEG * sx, ch.bend[2] * DEG * sx);
        prev.add(seg);
        parts[seg.name] = seg;
        tags.set(seg.name, [...sideTags.filter((x) => !x.startsWith('fx:')), `chain:${i}:${ch.n}`]);
        const inst: PartInst = { pd, name: seg.name, side, node: seg, color, stub, seg: { r, r2, len: Math.max(0.001, segLen - r) } };
        insts.push(inst);
        instOfNode.set(seg, inst);
        prev = seg;
      }
      const tip = new THREE.Bone();
      tip.name = `${name}Tip`;
      tip.position.set(0, segLen, 0);
      prev.add(tip);
      parts[tip.name] = tip;
      return;
    }
    const inst: PartInst = { pd, name, side, node, color, stub };
    insts.push(inst);
    instOfNode.set(node, inst);
  };
  for (const pd of v.parts) {
    const stub = pd.lod != null && opts.lod > pd.lod;
    if (pd.mirror) {
      addNode(pd, pd.name + '_L', '_L', stub);
      addNode(pd, pd.name + '_R', '_R', stub);
    } else addNode(pd, pd.name, '', stub);
  }
  root.updateMatrixWorld(true);

  // ---------------- pass 2: sculpted bodies
  const sculptOn = !opts.legacy && v.sculpt !== false;
  const plan: SculptSet = sculptOn ? planSculpt(insts, v, opts) : { groups: [], accessory: new Set(insts), cell: 0 };
  const fields: SdfField[] = plan.groups.map((g) => g.field);
  // ---------------- pass 2: accessories (crisp meshes on their nodes)
  const makeMesh = (pd: PartDef, geom: THREE.BufferGeometry, color: string) => {
    let mat: THREE.MeshStandardMaterial;
    if (pd.prim.t === 'eye') {
      mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 0.25, emissive: new THREE.Color(v.eye.glow ?? '#ffffff'), emissiveIntensity: v.eye.glow ? 0.9 : 0.35, alphaTest: 0.02 });
      eyeMats.push(mat);
      ownedMats.add(mat);
    } else if (pd.prim.t === 'mouth') {
      mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 0.6, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      mouthMat = mat;
      ownedMats.add(mat);
    } else {
      const glow = pd.emissive && pd.emissive > 0;
      const mo: MatOpts = {
        ...matBase(pd.mat ?? v.mat),
        color,
        emissive: glow ? colorOf(v, pd.glowColor ?? pd.slot) : undefined,
        emissiveIntensity: pd.emissive,
        opacity: pd.opacity,
        flatShading: pd.flat,
      };
      mat = makeMaterial(mo);
      if (glow) {
        // glow parts get their own material instance so gain can be animated per creature
        mat = cloneCreatureMaterial(mat, mo);
        ownedMats.add(mat);
        glowMats.push(mat);
        glowBase.push(pd.emissive!);
      }
    }
    mats.add(mat);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = pd.prim.t !== 'eye' && pd.prim.t !== 'mouth';
    mesh.receiveShadow = false;
    tris += triCount(geom);
    draws += 1;
    return mesh;
  };

  const nearestField = (p: THREE.Vector3): SdfField | null => {
    let best: SdfField | null = null;
    let bd = Infinity;
    for (const f of fields) {
      const d = Math.abs(f.eval(p.x, p.y, p.z));
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  };
  const eyes3d: Eye3D[] = [];
  const use3dEyes = v.eye.shape !== 'hole' && !opts.legacy;
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  for (const pi of insts) {
    if (!plan.accessory.has(pi) || pi.stub) continue;
    const pd = pi.pd;
    const node = pi.node;
    if (pi.seg) {
      const { r, r2, len } = pi.seg;
      const [rad, cap] = segsBase('capsule', opts.lod, opts.quality, Math.max(r * 2, len + r));
      const g = capsule(r, len, rad, cap, r2);
      g.translate(0, -r * 0.6, 0);
      if (pd.fluffy) vertexNoise(g, pd.fluffy * H, 3 / H, pi.name.length);
      geoms.push(g);
      node.add(makeMesh(pd, g, pi.color));
      continue;
    }
    if (pd.prim.t === 'eye' && use3dEyes) {
      // real eyeball set into the sculpted head
      const R = pd.prim.r * H * 1.02;
      const origin = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      fwd.set(0, 0, 1).transformDirection(node.matrixWorld);
      const f = nearestField(origin);
      let centreW = origin.clone().addScaledVector(fwd, -R * 0.38);
      if (f) {
        const start = origin.clone().addScaledVector(fwd, -R * 1.6);
        const t = f.raycast(start, fwd, R * 3.2);
        if (t != null) centreW = start.addScaledVector(fwd, t - R * 0.42);
      }
      const centre = node.worldToLocal(centreW.clone());
      // gaze: pull toward the creature's forward axis so the pupils read as looking ahead, not wall-eyed
      const fwdLocal = new THREE.Vector3(0, 0, 1).transformDirection(node.matrixWorld.clone().invert());
      const gaze = new THREE.Vector3(0, 0, 1).lerp(fwdLocal, v.gaze ?? 0.45).normalize();
      const parentInst = instOfNode.get(node.parent!) ?? null;
      const skin = parentInst ? parentInst.color : colorOf(v, 'P');
      const eb = buildEye({ R, spec: v.eye, skin, quality: opts.quality, lod: opts.lod, side: pi.side === '_R' ? -1 : 1, gaze, centre, rimColor: new THREE.Color(v.rim ?? '#ffffff') });
      node.add(eb.group);
      eyes3d.push(eb.eye);
      geoms.push(...eb.geoms);
      eb.mats.forEach((m) => { ownedMats.add(m); mats.add(m); });
      ownedTex.push(...eb.texs);
      tris += eb.tris;
      draws += 4;
      continue;
    }
    const g = buildGeometry(pd.prim, H, opts.lod, opts.quality);
    if (!g) continue;
    if (pd.fluffy) vertexNoise(g, pd.fluffy * H, 3 / H, pi.name.length);
    if (pd.mirrorGeom && pi.side === '_R') mirrorX(g);
    if ((pd.prim.t === 'mouth' || pd.prim.t === 'eye') && fields.length && !opts.legacy) {
      // conform the decal to the sculpted surface (it was authored against the old primitive)
      const pos = g.attributes.position as THREE.BufferAttribute;
      const mw = node.matrixWorld;
      fwd.set(0, 0, 1).transformDirection(mw);
      const origin = new THREE.Vector3().setFromMatrixPosition(mw);
      const f = nearestField(origin);
      if (f) {
        const span = pd.prim.r * H * 2.5;
        const inv = mw.clone().invert();
        const off = H * 0.004;
        for (let i = 0; i < pos.count; i++) {
          tmp.set(pos.getX(i), pos.getY(i), -span).applyMatrix4(mw);
          const t = f.raycast(tmp, fwd, span * 2);
          if (t == null) continue;
          const hit = tmp.addScaledVector(fwd, t + off).applyMatrix4(inv);
          pos.setZ(i, hit.z);
        }
        g.computeVertexNormals();
      }
    }
    geoms.push(g);
    const mesh = makeMesh(pd, g, pi.color);
    if (pi.side === '_R' && (pd.prim.t === 'eye' || pd.prim.t === 'mouth')) mesh.scale.x = -1; // mirror UVs
    node.add(mesh);
  }

  // ---------------- pass 3: sculpted bodies (after the accessories, so the body takes the remaining triangle budget)
  const accTris = tris;
  if (plan.groups.length) {
    const key = `${v.id}|${hashOf(v)}|${opts.lod}|${opts.quality}`;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let built = false;
    const bodies = cachedBodies(key, () => {
      built = true;
      const cap = Math.max(TRI_CAP[opts.quality] * 0.55, Math.min(TRI_CAP[opts.quality], BUDGET[opts.quality] - accTris / LOD_TRI[opts.lod])) * LOD_TRI[opts.lod];
      let cell = plan.cell;
      // predict the triangle count from a 2x coarser pass (tris scale ~ 1/cell^2) and back off before meshing
      const pred = plan.groups.reduce((s, g) => s + countTris(g.field, cell * 2), 0) * 4;
      if (pred > cap) cell *= Math.sqrt(pred / cap) * 1.04;
      const out = plan.groups.map((g) => meshFieldAt(g.field, cell, { H, ao: opts.quality !== 'mobile' || opts.lod === 0 }));
      const shells: (BodyGeometry | null)[] = plan.groups.map((g) =>
        g.preset === 'FUR' && opts.quality === 'high' && opts.lod === 0 && g.members.some((m) => (m.pd.fur ?? (m.pd.fluffy ? 1.6 : 0.3)) >= 0.55)
          ? furOnly(meshFieldAt(g.field, cell * 1.9, { H, ao: false }))
          : null,
      );
      return { bodies: out, shells };
    });
    if (built && typeof performance !== 'undefined') meshMs = performance.now() - t0;
    plan.groups.forEach((g, gi) => {
      const bg = bodies.bodies[gi];
      const pd0 = g.members[0].pd;
      void pd0;
      const mo: MatOpts = { ...matBase(g.preset), color: '#ffffff', vertexColors: true, attrs: true };
      let mat: THREE.MeshStandardMaterial;
      if (g.glow) {
        const gi2 = v.fissureGlow ?? 1.3;
        mo.glowMask = true;
        mo.emissive = colorOf(v, v.fissureColor ?? 'A');
        mo.emissiveIntensity = gi2;
        mat = cloneCreatureMaterial(makeMaterial(mo), mo);
        ownedMats.add(mat);
        glowMats.push(mat);
        glowBase.push(gi2);
      } else mat = makeMaterial(mo);
      mats.add(mat);
      const bones = bg.bones.map((n) => parts[n]) as THREE.Bone[];
      const mesh = new THREE.SkinnedMesh(bg.geometry, mat);
      mesh.name = 'body_' + g.preset;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      pivot.add(mesh);
      mesh.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(bones);
      mesh.bind(skeleton, mesh.matrixWorld);
      if (bg.geometry.boundingSphere) {
        mesh.boundingSphere = bg.geometry.boundingSphere.clone();
        mesh.boundingSphere.radius *= 1.35;
      }
      tris += bg.tris;
      sculptedTris += bg.tris;
      draws += 1;
      const sh = bodies.shells[gi];
      if (sh) {
        const room = BUDGET[opts.quality] - tris;
        const layers = Math.max(2, Math.min(4, Math.floor(room / Math.max(1, sh.tris))));
        const len = (v.furLen ?? 0.02) * H;
        for (let l = 1; l <= layers; l++) {
          const so: MatOpts = { ...matBase('FUR'), color: '#ffffff', vertexColors: true, attrs: true, shell: { h: l / layers, len, strand: len } };
          const sm = makeMaterial(so);
          mats.add(sm);
          const shell = new THREE.SkinnedMesh(sh.geometry, sm);
          shell.name = `fur_shell_${l}`;
          shell.castShadow = false;
          shell.userData.furShell = true;
          pivot.add(shell);
          shell.updateMatrixWorld(true);
          shell.bind(skeleton, shell.matrixWorld);
          if (mesh.boundingSphere) shell.boundingSphere = mesh.boundingSphere.clone();
          tris += sh.tris;
          draws += 1;
        }
      }
    });
  }

  const face = new FaceRig(atlas, eyeMats, mouthMat, eyes3d);

  // rest pose capture
  const rest = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  for (const o of Object.values(parts)) rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });

  // hover
  if (v.hoverGap) pivot.position.y = v.hoverGap * H;
  rest.set(pivot, { p: pivot.position.clone(), q: pivot.quaternion.clone(), s: pivot.scale.clone() });

  // bounds
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const size = bb.getSize(new THREE.Vector3());
  const head = parts.head ?? parts.body ?? pivot;
  const hp = new THREE.Vector3();
  head.getWorldPosition(hp);
  const ensureAnchor = (n: string, parent: THREE.Object3D, pos: THREE.Vector3) => {
    if (anchors[n]) return;
    const a = new THREE.Object3D();
    a.name = 'anchor_' + n;
    parent.worldToLocal(pos);
    a.position.copy(pos);
    parent.add(a);
    anchors[n] = a;
  };
  ensureAnchor('head', head, hp.clone());
  ensureAnchor('mouth', head, hp.clone().add(new THREE.Vector3(0, 0, 0.15 * H)));
  ensureAnchor('core', pivot, new THREE.Vector3(0, size.y * 0.5, 0));
  ensureAnchor('overhead', pivot, new THREE.Vector3(0, bb.max.y + 0.2, 0));
  const bounds = {
    height: bb.max.y,
    radius: Math.max(size.x, size.z) / 2,
    headHeight: hp.y,
    length: size.z,
  };

  return {
    id: v.id,
    root,
    pivot,
    parts,
    rest,
    tags,
    anchors,
    face,
    glowMats,
    glowBase,
    bounds,
    stats: { triangles: tris, drawCalls: draws, materials: mats.size, sculptedTris, meshMs },
    visual: v,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of ownedMats) m.dispose();
      for (const t of ownedTex) t.dispose();
      root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose(); });
      face.dispose();
    },
  };
}

// ------------------------------------------------------------------------------------------------ mesh cache
/** keep only shell triangles that touch fluffy regions (aFur ≥ 0.5); the shader discards the rest anyway */
function furOnly(b: BodyGeometry): BodyGeometry | null {
  const idx = b.geometry.index!;
  const fur = b.geometry.attributes.aFur as THREE.BufferAttribute;
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), c = idx.getX(i + 1), d = idx.getX(i + 2);
    if (Math.max(fur.getX(a), fur.getX(c), fur.getX(d)) >= 0.5) keep.push(a, c, d);
  }
  if (!keep.length) { b.geometry.dispose(); return null; }
  const n = b.geometry.attributes.position.count;
  b.geometry.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
  return { ...b, tris: keep.length / 3 };
}

interface BodySet { bodies: BodyGeometry[]; shells: (BodyGeometry | null)[] }
const bodyCache = new Map<string, BodySet>();

function cachedBodies(key: string, build: () => BodySet): BodySet {
  const hit = bodyCache.get(key);
  if (hit) {
    bodyCache.delete(key);
    bodyCache.set(key, hit);
    return hit;
  }
  const r = build();
  bodyCache.set(key, r);
  if (bodyCache.size > 120) bodyCache.delete(bodyCache.keys().next().value as string);
  return r;
}

function meshFieldAt(field: SdfField, cell: number, o: { H: number; ao: boolean }): BodyGeometry {
  return meshField(field, { res: 0, maxTris: Infinity, ao: o.ao, H: o.H, cell });
}

/**
 * Pre-mesh species during idle time so the first assemble() of a species (entering battle, a follower swap) does not
 * hitch. Each species/LOD is one idle task (~10–60 ms of CPU); cancels itself when the returned function is called.
 */
export function prewarmCreatures(visuals: SpeciesVisual[], quality: Quality, lods: Lod[] = [0, 1]): () => void {
  const jobs: [SpeciesVisual, Lod][] = [];
  for (const v of visuals) for (const l of lods) jobs.push([v, l]);
  let cancelled = false;
  const ric: (cb: () => void) => void = typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb) => (window as unknown as { requestIdleCallback: (f: () => void, o?: object) => void }).requestIdleCallback(cb, { timeout: 2000 })
    : (cb) => setTimeout(cb, 30);
  const step = () => {
    if (cancelled) return;
    const j = jobs.shift();
    if (!j) return;
    const key = `${j[0].id}|${hashOf(j[0])}|${j[1]}|${quality}`;
    if (!bodyCache.has(key)) {
      try {
        assemble(j[0], { lod: j[1], quality }).dispose();
      } catch {
        /* a broken spec surfaces when it is actually used */
      }
    }
    ric(step);
  };
  ric(step);
  return () => { cancelled = true; };
}
