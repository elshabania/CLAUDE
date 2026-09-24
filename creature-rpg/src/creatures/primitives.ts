// Geometry helpers for procedural creatures (design/creatures.md §2.3, rendering doc §4.2).
import * as THREE from 'three';

export type Quality = 'high' | 'balanced' | 'mobile';
export type Lod = 0 | 1 | 2;

/** Segment counts scale with quality/LOD AND with the part's real size (metres), so tiny parts stay cheap. */
export function segs(kind: 'sphere' | 'capsule' | 'lathe' | 'tube' | 'cone', lod: Lod, q: Quality, sizeM = 1): [number, number] {
  let tier = lod === 2 ? 2 : q === 'high' && lod === 0 ? 0 : q === 'mobile' ? 2 : 1;
  if (sizeM < 0.06) tier = 2;
  else if (sizeM < 0.16) tier = Math.max(tier, 1);
  const T: Record<string, [number, number][]> = {
    sphere: [[24, 16], [16, 12], [10, 7]],
    capsule: [[12, 6], [10, 4], [7, 3]],
    lathe: [[24, 0], [16, 0], [10, 0]],
    tube: [[12, 24], [8, 16], [6, 10]],
    cone: [[16, 1], [12, 1], [8, 1]],
  };
  return T[kind][tier];
}

// ---- lathe profiles (r, h) normalised ----
export const PROFILES: Record<string, [number, number][]> = {
  L_egg: [[0, 0], [0.6, 0.08], [0.95, 0.35], [1, 0.55], [0.85, 0.8], [0.5, 0.97], [0, 1]],
  L_pear: [[0, 0], [0.7, 0.05], [1, 0.3], [0.9, 0.55], [0.6, 0.78], [0.45, 0.92], [0, 1]],
  L_dome: [[0, 0], [1, 0], [0.98, 0.3], [0.85, 0.62], [0.55, 0.9], [0, 1]],
  L_teardrop: [[0, 0], [0.5, 0.1], [0.8, 0.35], [0.6, 0.7], [0.2, 0.95], [0, 1]],
  L_spindle: [[0, 0], [0.55, 0.15], [1, 0.45], [0.8, 0.75], [0.3, 0.95], [0, 1]],
  L_bulb: [[0, 0], [0.8, 0.05], [1, 0.35], [0.9, 0.7], [0.5, 0.95], [0, 1]],
  L_bell: [[1, 0], [0.7, 0.2], [0.35, 0.6], [0.15, 0.95], [0, 1]],
  L_crater: [[0.6, 0], [1, 0], [0.9, 0.8], [0.7, 1], [0.55, 0.6]],
  L_cyl: [[0, 0], [1, 0], [1, 1], [0, 1]],
  L_horn: [[1, 0], [0.8, 0.4], [0.45, 0.8], [0, 1]],
  L_bowl: [[0, 0], [0.8, 0.1], [1, 0.5], [1, 1]],
};

/** Smooth a polyline profile with Catmull-Rom so lathe silhouettes read organic, not faceted. */
export function smoothProfile(pts: [number, number][], n: number): THREE.Vector2[] {
  const v = pts.map((p) => new THREE.Vector3(p[0], p[1], 0));
  const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

export function lathe(profile: string | [number, number][], h: number, rmax: number, radial: number): THREE.BufferGeometry {
  const pts = typeof profile === 'string' ? PROFILES[profile] : profile;
  if (!pts) throw new Error('unknown profile ' + profile);
  const sp = smoothProfile(pts, Math.max(10, pts.length * 3)).map((p) => new THREE.Vector2(p.x * rmax, p.y * h));
  const g = new THREE.LatheGeometry(sp, radial);
  g.computeVertexNormals();
  return g;
}

export function ellipsoid(rx: number, ry: number, rz: number, w: number, hs: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, hs);
  g.scale(rx, ry, rz);
  return g;
}

export function capsule(r: number, len: number, radial: number, cap: number, r2?: number): THREE.BufferGeometry {
  if (r2 == null || Math.abs(r2 - r) < 1e-4) {
    const g = new THREE.CapsuleGeometry(r, len, cap, radial);
    g.translate(0, len / 2 + r, 0); // base at origin, extends +Y
    return g;
  }
  // tapered capsule: lathe with hemispherical ends
  const pts: [number, number][] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push([Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([Math.cos(a) * r2, r + len + Math.sin(a) * r2]);
  }
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(0.0001, p[0]), p[1])), radial);
  g.computeVertexNormals();
  return g;
}

export function cone(r: number, h: number, radial: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, radial, 1);
  g.translate(0, h / 2, 0); // base at origin, tip +Y
  return g;
}

export function cylinder(r: number, h: number, radial: number, r2?: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2 ?? r, r, h, radial, 1);
  g.translate(0, h / 2, 0);
  return g;
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  // rounded-ish box via a slightly subdivided box with normalised corners
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bevel = Math.min(w, h, d) * 0.12;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sx = Math.sign(v.x), sy = Math.sign(v.y), sz = Math.sign(v.z);
    const cx = Math.abs(v.x) > w / 2 - 1e-4, cy = Math.abs(v.y) > h / 2 - 1e-4, cz = Math.abs(v.z) > d / 2 - 1e-4;
    if (cx && cy && cz) v.set(v.x - sx * bevel * 0.4, v.y - sy * bevel * 0.4, v.z - sz * bevel * 0.4);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function torus(R: number, r: number, radial: number, arcDeg = 360): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, Math.max(6, Math.floor(radial / 2)), radial * 2, (arcDeg * Math.PI) / 180);
}

// ---- extrude shapes (2D outlines in unit box, x right, y up) ----
type ShapeFn = () => THREE.Shape;
function shapeFrom(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
function smoothShape(pts: [number, number][], n = 48): THREE.Shape {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
  return shapeFrom(curve.getPoints(n).map((p) => [p.x, p.y] as [number, number]));
}

export const SHAPES: Record<string, ShapeFn> = {
  // quarter-ellipse fan with scalloped trailing edge; root along +Y at x=0
  X_sail: () => {
    const pts: [number, number][] = [[0, 0]];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      const sc = 1 - 0.07 * Math.abs(Math.sin(i * Math.PI * 0.5));
      pts.push([Math.sin(a) * sc, Math.cos(a) * sc]);
    }
    return shapeFrom(pts);
  },
  X_delta: () => {
    const pts: [number, number][] = [[0, 0.5], [0.95, 0.08]];
    for (let i = 0; i <= 5; i++) pts.push([1 - i * 0.19, 0.02 + (i % 2 ? 0.06 : 0) ]);
    pts.push([0, -0.5]);
    return smoothShape(pts, 40);
  },
  X_sailfin: () => smoothShape([[0, 0], [0.1, 0.9], [0.25, 1], [0.4, 0.85], [0.55, 0.9], [0.7, 0.6], [0.85, 0.55], [1, 0.1], [1, 0]]),
  X_fin_crescent: () => {
    const pts: [number, number][] = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = (-75 + (150 * i) / n) * (Math.PI / 180);
      pts.push([Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5]);
    }
    for (let i = n; i >= 0; i--) {
      const a = (-75 + (150 * i) / n) * (Math.PI / 180);
      pts.push([Math.cos(a) * 0.3 + 0.42, Math.sin(a) * 0.3 + 0.5]);
    }
    return shapeFrom(pts);
  },
  X_fan: () => {
    const pts: [number, number][] = [[0, 0]];
    const n = 7 * 6;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      const lobe = 1 - 0.08 * Math.abs(Math.sin((i / n) * Math.PI * 7));
      pts.push([Math.cos(a) * 0.5 * lobe, Math.sin(a) * lobe]);
    }
    return shapeFrom(pts);
  },
  X_leaf: () => smoothShape([[0, 0], [0.18, 0.25], [0.16, 0.7], [0, 1], [-0.16, 0.7], [-0.18, 0.25]]),
  X_samara: () => smoothShape([[0, 0], [0.13, 0.05], [0.14, 0.22], [0.18, 0.5], [0.16, 0.85], [0.05, 1], [-0.04, 0.8], [-0.08, 0.45], [-0.1, 0.2], [-0.12, 0.05]]),
  X_hexplate: () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) pts.push([Math.cos((i * Math.PI) / 3) * 0.5, Math.sin((i * Math.PI) / 3) * 0.5]);
    return shapeFrom(pts);
  },
  X_flake6: () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const b = a + Math.PI / 6;
      pts.push([Math.cos(a - 0.12) * 0.12, Math.sin(a - 0.12) * 0.12]);
      pts.push([Math.cos(a - 0.05) * 0.5, Math.sin(a - 0.05) * 0.5]);
      pts.push([Math.cos(a) * 0.52, Math.sin(a) * 0.52]);
      pts.push([Math.cos(a + 0.05) * 0.5, Math.sin(a + 0.05) * 0.5]);
      pts.push([Math.cos(b) * 0.14, Math.sin(b) * 0.14]);
    }
    return shapeFrom(pts);
  },
  X_flame_tuft: () => smoothShape([[-0.5, 0], [-0.42, 0.45], [-0.3, 0.6], [-0.2, 0.35], [0, 1], [0.15, 0.4], [0.3, 0.7], [0.45, 0.35], [0.5, 0]]),
  X_strip: () => smoothShape([[-0.04, 0], [0.04, 0], [0.04, 0.96], [0, 1], [-0.04, 0.96]], 24),
  X_corona: () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 === 0 ? (i % 4 === 0 ? 0.5 : 0.42) : 0.3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return shapeFrom(pts);
  },
  X_ear: () => smoothShape([[-0.35, 0], [-0.4, 0.4], [-0.15, 0.9], [0, 1], [0.15, 0.9], [0.4, 0.4], [0.35, 0]]),
  X_wing: () => smoothShape([[0, 0], [0.3, 0.4], [0.7, 0.55], [1, 0.45], [0.85, 0.25], [0.9, 0.05], [0.6, 0.02], [0.45, -0.08], [0.2, -0.05]]),
  X_heart_leaf: () => smoothShape([[0, 0], [0.3, 0.3], [0.35, 0.65], [0.15, 0.85], [0, 0.7], [-0.15, 0.85], [-0.35, 0.65], [-0.3, 0.3]]),
  X_disc: () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
    return s;
  },
  X_rect: () => shapeFrom([[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]),
  X_tri: () => shapeFrom([[-0.5, 0], [0.5, 0], [0, 1]]),
};

export function extrude(shape: string | THREE.Shape, w: number, h: number, depth: number, curveSegs = 8): THREE.BufferGeometry {
  const sh = typeof shape === 'string' ? SHAPES[shape]?.() : shape;
  if (!sh) throw new Error('unknown shape ' + shape);
  const bevel = depth * 0.15;
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, depth), bevelEnabled: depth > 0.004, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curveSegs });
  g.translate(0, 0, -depth / 2);
  g.scale(w, h, 1);
  g.computeVertexNormals();
  return g;
}

/** Tapered tube through points (local), radius r0 -> r1. */
export function tube(points: [number, number, number][], r0: number, r1: number, radial: number, lenSegs: number, ridge?: [number, number]): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, lenSegs, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  const ringSize = radial + 1;
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / ringSize);
    const t = seg / lenSegs;
    curve.getPointAt(Math.min(1, t), center);
    v.fromBufferAttribute(pos, i).sub(center);
    let r = r0 + (r1 - r0) * t;
    if (ridge) r *= 1 + ridge[1] * Math.pow(Math.max(0, Math.sin(t * ridge[0] * Math.PI * 2)), 3);
    v.multiplyScalar(r).add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Apply low-amplitude deterministic vertex noise (fluffy fur, rocky stone). */
export function vertexNoise(g: THREE.BufferGeometry, amp: number, freq: number, seed = 1) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * freq * 12.9898 + y * freq * 78.233 + z * freq * 37.719 + seed) * 43758.5453;
    const d = ((n - Math.floor(n)) * 2 - 1) * amp;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  g.computeVertexNormals();
}

/** Vertex colour painter: gradient belly / tips etc. */
export function paintVertexColors(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const c = fn(p, n);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

export function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}
