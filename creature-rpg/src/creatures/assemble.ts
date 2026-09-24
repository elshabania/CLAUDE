// Declarative part-table assembler. Species builders describe parts exactly like the
// build-spec tables in design/creatures.md (dimensions in multiples of H) and this module
// turns them into a named Object3D hierarchy with materials, faces, anchors and bounds.
import * as THREE from 'three';
import { box, capsule, cone, cylinder, ellipsoid, extrude, lathe, segs, torus, tube, vertexNoise, triCount, type Lod, type Quality } from './primitives';
import { injectRim, makeMaterial, shade, type Preset } from './materials';
import { discGeometry, faceAtlas, FaceRig, type EyeSpec, type MouthSpec } from './face';

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
  | { t: 'tube'; pts: V3[]; r0: number; r1: number }
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
  stats: { triangles: number; drawCalls: number; materials: number };
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

function buildGeometry(p: Prim, H: number, lod: Lod, q: Quality): THREE.BufferGeometry | null {
  switch (p.t) {
    case 'sphere': {
      const [w, hs] = segs('sphere', lod, q);
      const r = typeof p.r === 'number' ? [p.r, p.r, p.r] : p.r;
      const g = ellipsoid(r[0] * H, r[1] * H, r[2] * H, w, hs);
      if (p.half) {
        // keep upper hemisphere (y >= 0) by squashing lower half flat
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
      return tube(p.pts.map((v) => [v[0] * H, v[1] * H, v[2] * H]), p.r0 * H, p.r1 * H, rad, len);
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
}

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
  const mats = new Set<THREE.Material>();
  const eyeMats: THREE.MeshStandardMaterial[] = [];
  let mouthMat: THREE.MeshStandardMaterial | null = null;
  const glowMats: THREE.MeshStandardMaterial[] = [];
  const glowBase: number[] = [];
  let tris = 0;
  let draws = 0;
  const atlas = faceAtlas(v.id, v.eye, v.mouth ?? null, opts.quality);

  const resolveParent = (name: string | undefined, side: '' | '_L' | '_R'): THREE.Object3D => {
    const n = name ?? 'root';
    if (side && parts[n + side]) return parts[n + side];
    if (parts[n]) return parts[n];
    if (parts[n + '_L']) return parts[n + '_L'];
    throw new Error(`${v.id}: unknown parent ${n}`);
  };

  const makeMesh = (pd: PartDef, geom: THREE.BufferGeometry, color: string) => {
    let mat: THREE.MeshStandardMaterial;
    if (pd.prim.t === 'eye') {
      mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 0.25, emissive: new THREE.Color(v.eye.glow ?? '#ffffff'), emissiveIntensity: v.eye.glow ? 0.9 : 0.35, alphaTest: 0.02 });
      eyeMats.push(mat);
    } else if (pd.prim.t === 'mouth') {
      mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 0.6, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      mouthMat = mat;
    } else {
      const glow = pd.emissive && pd.emissive > 0;
      mat = makeMaterial({
        color,
        preset: pd.mat ?? v.mat,
        quality: opts.quality,
        emissive: glow ? colorOf(v, pd.glowColor ?? pd.slot) : undefined,
        emissiveIntensity: pd.emissive,
        rim: v.rim,
        rimStrength: v.rimStrength,
        opacity: pd.opacity,
        flatShading: pd.flat,
      });
      if (glow) {
        // glow parts get their own material instance so gain can be animated per creature
        mat = mat.clone();
        injectRim(mat, new THREE.Color(v.rim ?? '#ffffff'), v.rimStrength ?? 0.3);
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

  const addOne = (pd: PartDef, name: string, side: '' | '_L' | '_R') => {
    const parent = resolveParent(pd.parent, side);
    const node = new THREE.Group();
    node.name = name;
    const at = pd.at ?? [0, 0, 0];
    const rot = pd.rot ?? [0, 0, 0];
    const sx = side === '_R' ? -1 : 1;
    node.position.set(at[0] * H * sx, at[1] * H, at[2] * H);
    node.rotation.set(rot[0] * DEG, rot[1] * DEG * sx, rot[2] * DEG * sx, 'XYZ');
    if (pd.scale) node.scale.set(...pd.scale);
    parent.add(node);
    parts[name] = node;
    tags.set(name, pd.anim ?? []);
    for (const t of pd.anim ?? []) if (t.startsWith('fx:')) anchors[t.slice(3)] = node;
    const color = colorOf(v, pd.slot);
    if (pd.chain) {
      const ch = pd.chain;
      const segLen = (ch.len / ch.n) * H;
      let prev: THREE.Object3D = node;
      for (let i = 0; i < ch.n; i++) {
        const t0 = i / ch.n;
        const r = (ch.r0 + (ch.r1 - ch.r0) * t0) * H;
        const r2 = (ch.r0 + (ch.r1 - ch.r0) * ((i + 1) / ch.n)) * H;
        const seg = new THREE.Group();
        seg.name = `${name}${i}`;
        if (i > 0) seg.position.set(0, segLen, 0);
        if (ch.bend && i > 0) seg.rotation.set(ch.bend[0] * DEG, ch.bend[1] * DEG * sx, ch.bend[2] * DEG * sx);
        prev.add(seg);
        parts[seg.name] = seg;
        tags.set(seg.name, [...(pd.anim ?? []).filter((x) => !x.startsWith('fx:')), `chain:${i}:${ch.n}`]);
        const [rad, cap] = segs('capsule', opts.lod, opts.quality);
        const g = capsule(r, Math.max(0.001, segLen - r), rad, cap, r2);
        g.translate(0, -r * 0.6, 0);
        if (pd.fluffy) vertexNoise(g, pd.fluffy * H, 3 / H, i + 1);
        geoms.push(g);
        seg.add(makeMesh(pd, g, color));
        prev = seg;
      }
      const tip = new THREE.Group();
      tip.name = `${name}Tip`;
      tip.position.set(0, segLen, 0);
      prev.add(tip);
      parts[tip.name] = tip;
      return;
    }
    const g = buildGeometry(pd.prim, H, opts.lod, opts.quality);
    if (g) {
      if (pd.fluffy) vertexNoise(g, pd.fluffy * H, 3 / H, name.length);
      geoms.push(g);
      const mesh = makeMesh(pd, g, color);
      if (side === '_R' && (pd.prim.t === 'eye' || pd.prim.t === 'mouth')) mesh.scale.x = -1; // mirror UVs
      node.add(mesh);
    }
  };

  for (const pd of v.parts) {
    if (pd.lod != null && opts.lod > pd.lod) {
      // keep the node (animation/anchors rely on it) but skip geometry
      const stub: PartDef = { ...pd, prim: { t: 'none' }, chain: undefined };
      if (pd.mirror) {
        addOne(stub, pd.name + '_L', '_L');
        addOne(stub, pd.name + '_R', '_R');
      } else addOne(stub, pd.name, '');
      continue;
    }
    if (pd.mirror) {
      addOne(pd, pd.name + '_L', '_L');
      addOne(pd, pd.name + '_R', '_R');
    } else addOne(pd, pd.name, '');
  }

  const face = new FaceRig(atlas, eyeMats, mouthMat);

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
  // default anchors
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
    stats: { triangles: tris, drawCalls: draws, materials: mats.size },
    visual: v,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) if (glowMats.includes(m as any) || eyeMats.includes(m as any) || m === mouthMat) m.dispose();
      face.dispose();
    },
  };
}
