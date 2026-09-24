// Parametric building & landmark builders (original designs; merged vertex-coloured geometry).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function paint(g: THREE.BufferGeometry, color: string, vary = 0.04): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const tri = Math.floor(i / 3);
    const r = Math.sin(tri * 12.9898) * 43758.5453;
    const f = 1 + ((r - Math.floor(r)) * 2 - 1) * vary;
    arr[i * 3] = c.r * f;
    arr[i * 3 + 1] = c.g * f;
    arr[i * 3 + 2] = c.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
  return g;
};
function prism(w: number, h: number, d: number): THREE.BufferGeometry {
  // gable roof: triangle cross-section along X, extruded along Z
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

export interface BuiltProp {
  geo: THREE.BufferGeometry;
  colliders: { box: [number, number, number]; at: [number, number, number]; yaw?: number }[];
  glow?: { pos: [number, number, number]; color: string }[];
  label?: string;
  interactR?: number;
}

export interface HouseOpts {
  w?: number;
  d?: number;
  h?: number;
  wall?: string;
  roof?: string;
  trim?: string;
  sign?: string;
  chimney?: boolean;
  stories?: number;
}

export function house(o: HouseOpts = {}): BuiltProp {
  const w = o.w ?? 7, d = o.d ?? 6, h = (o.h ?? 3.2) * (o.stories ?? 1);
  const wall = o.wall ?? '#E9D8A6';
  const roof = o.roof ?? '#8C5A3C';
  const trim = o.trim ?? '#6B4128';
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(at(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0), wall));
  parts.push(paint(at(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), 0, 0.2, 0), '#8A8578')); // plinth
  // timber frame corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(paint(at(new THREE.BoxGeometry(0.25, h, 0.25), sx * (w / 2), h / 2, sz * (d / 2)), trim));
  parts.push(paint(at(new THREE.BoxGeometry(w + 0.1, 0.22, 0.22), 0, h, d / 2), trim));
  const rh = w * 0.42;
  parts.push(paint(at(prism(w + 1.2, rh, d + 1.0), 0, h, 0), roof, 0.08));
  parts.push(paint(at(prism(w * 0.98, rh * 0.96, d * 0.98), 0, h, 0), wall));
  // door + windows on +Z face
  parts.push(paint(at(new THREE.BoxGeometry(1.3, 2.2, 0.15), 0, 1.1, d / 2 + 0.05), '#6B4A33'));
  parts.push(paint(at(new THREE.BoxGeometry(1.6, 0.18, 0.4), 0, 2.35, d / 2 + 0.2), trim));
  for (const sx of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(1.1, 1.0, 0.12), sx * w * 0.3, h * 0.55, d / 2 + 0.05), '#F2D98A', 0.02));
    parts.push(paint(at(new THREE.BoxGeometry(1.3, 0.12, 0.25), sx * w * 0.3, h * 0.55 - 0.6, d / 2 + 0.1), trim));
  }
  if (o.chimney !== false) parts.push(paint(at(new THREE.BoxGeometry(0.7, 2.2, 0.7), w * 0.28, h + rh * 0.6, -d * 0.2), '#8A7F72'));
  const glow: BuiltProp['glow'] = [];
  if (o.sign) {
    parts.push(paint(at(new THREE.BoxGeometry(1.8, 0.7, 0.1), 0, 2.9, d / 2 + 0.35), o.sign));
    glow.push({ pos: [0, 2.9, d / 2 + 0.5], color: o.sign });
  }
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [w + 0.3, h + rh, d + 0.3], at: [0, (h + rh) / 2, 0] }], glow };
}

/** Chordstone: tall carved monolith with a type-glyph ring; doubles as Waystone. */
export function chordstone(accent = '#2FA39A'): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  const slab = new THREE.CylinderGeometry(0.55, 0.85, 4.2, 6, 3);
  const pos = slab.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * 0.75);
  slab.computeVertexNormals();
  parts.push(paint(at(slab, 0, 2.1, 0), '#9C9384', 0.06));
  parts.push(paint(at(new THREE.CylinderGeometry(1.3, 1.5, 0.35, 8), 0, 0.17, 0), '#7B7669'));
  parts.push(paint(at(new THREE.TorusGeometry(0.62, 0.06, 6, 24), 0, 3.0, 0, 0, 0, 0), accent, 0.01));
  parts.push(paint(at(new THREE.OctahedronGeometry(0.28), 0, 4.45, 0), accent, 0.01));
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [1.4, 4.4, 1.0], at: [0, 2.2, 0] }], glow: [{ pos: [0, 3.2, 0], color: accent }], interactR: 2.6 };
}

export function lamp(): BuiltProp {
  const parts = [
    paint(at(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), 0, 1.5, 0), '#3A3A3E'),
    paint(at(new THREE.BoxGeometry(0.4, 0.5, 0.4), 0, 3.2, 0), '#F2D98A', 0.01),
    paint(at(new THREE.ConeGeometry(0.4, 0.35, 4), 0, 3.6, 0, Math.PI / 4), '#3A3A3E'),
  ];
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [0.3, 3, 0.3], at: [0, 1.5, 0] }], glow: [{ pos: [0, 3.2, 0], color: '#FFD98A' }] };
}

export function signpost(): BuiltProp {
  const parts = [paint(at(new THREE.BoxGeometry(0.15, 1.8, 0.15), 0, 0.9, 0), '#6B4A33'), paint(at(new THREE.BoxGeometry(1.4, 0.45, 0.08), 0.35, 1.5, 0), '#B08A5E')];
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [0.3, 1.8, 0.3], at: [0, 0.9, 0] }], interactR: 2 };
}

export function well(): BuiltProp {
  const parts = [
    paint(at(new THREE.CylinderGeometry(1.1, 1.2, 1, 12, 1, true), 0, 0.5, 0), '#8A8578'),
    paint(at(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 12), 0, 0.6, 0), '#2E6F95'),
    paint(at(new THREE.BoxGeometry(0.15, 2.4, 0.15), -1, 1.2, 0), '#6B4A33'),
    paint(at(new THREE.BoxGeometry(0.15, 2.4, 0.15), 1, 1.2, 0), '#6B4A33'),
    paint(at(prism(2.6, 0.8, 1.4), 0, 2.4, 0), '#8C5A3C'),
  ];
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [2.5, 1.2, 2.5], at: [0, 0.6, 0] }] };
}

export function stall(color = '#C4553A'): BuiltProp {
  const parts = [
    paint(at(new THREE.BoxGeometry(3, 1, 1.4), 0, 0.5, 0), '#8C6A44'),
    ...[-1.4, 1.4].flatMap((x) => [paint(at(new THREE.BoxGeometry(0.1, 2.6, 0.1), x, 1.3, -0.6), '#6B4A33'), paint(at(new THREE.BoxGeometry(0.1, 2.4, 0.1), x, 1.2, 0.6), '#6B4A33')]),
    paint(at(new THREE.BoxGeometry(3.3, 0.08, 1.8), 0, 2.55, 0, 0, 0.18), color, 0.02),
  ];
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [3, 1, 1.4], at: [0, 0.5, 0] }] };
}

export function bridge(len = 10, w = 3): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < Math.floor(len / 0.6); i++) parts.push(paint(at(new THREE.BoxGeometry(w, 0.15, 0.5), 0, 0, -len / 2 + i * 0.6 + 0.3), '#8C6A44', 0.08));
  for (const sx of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.1, 0.1, len), sx * w / 2, 0.9, 0), '#6B4A33'));
    for (let i = 0; i <= 4; i++) parts.push(paint(at(new THREE.BoxGeometry(0.12, 1, 0.12), sx * w / 2, 0.45, -len / 2 + (i * len) / 4), '#6B4A33'));
  }
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [w, 0.3, len], at: [0, -0.05, 0] }, { box: [0.2, 1, len], at: [-w / 2, 0.5, 0] }, { box: [0.2, 1, len], at: [w / 2, 0.5, 0] }] };
}

/** Cadence Hall exterior: tall building with a bell-tower and a tuning-fork crest in the Cantor's type colour. */
export function hall(color: string, style: 'root' | 'stone' | 'mere' | 'vane' | 'forge' | 'rime' | 'spire'): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  const wall = { root: '#6B4A33', stone: '#C2B8A3', mere: '#E8E1C9', vane: '#E7EEF2', forge: '#3A322E', rime: '#DDEBF2', spire: '#F3EAD7' }[style];
  const roof = { root: '#3E7045', stone: '#5B6770', mere: '#2E6F95', vane: '#C4553A', forge: '#8A2E1E', rime: '#4C6A85', spire: '#C8963E' }[style];
  parts.push(paint(at(new THREE.CylinderGeometry(7, 7.5, 7, 8), 0, 3.5, 0), wall, 0.05));
  parts.push(paint(at(new THREE.ConeGeometry(8.3, 4.5, 8), 0, 9.25, 0), roof, 0.06));
  parts.push(paint(at(new THREE.CylinderGeometry(1.6, 1.8, 8, 8), 0, 13, 0), wall));
  parts.push(paint(at(new THREE.ConeGeometry(2.2, 3, 8), 0, 18.5, 0), roof));
  // tuning fork crest
  parts.push(paint(at(new THREE.BoxGeometry(0.25, 2, 0.25), -0.5, 21, 0), color, 0.01));
  parts.push(paint(at(new THREE.BoxGeometry(0.25, 2, 0.25), 0.5, 21, 0), color, 0.01));
  parts.push(paint(at(new THREE.BoxGeometry(1.25, 0.25, 0.25), 0, 20, 0), color, 0.01));
  parts.push(paint(at(new THREE.BoxGeometry(0.25, 1.4, 0.25), 0, 19.3, 0), color, 0.01));
  // entrance
  parts.push(paint(at(new THREE.BoxGeometry(3, 4, 1.2), 0, 2, 7.1), '#4A3A2A'));
  parts.push(paint(at(new THREE.BoxGeometry(3.8, 0.5, 1.6), 0, 4.2, 7.2), roof));
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [14, 9, 14], at: [0, 4.5, 0] }], glow: [{ pos: [0, 20.5, 0], color }], interactR: 4 };
}

export function windmill(): BuiltProp {
  const parts = [
    paint(at(new THREE.CylinderGeometry(1.6, 2.4, 8, 8), 0, 4, 0), '#E7EEF2'),
    paint(at(new THREE.ConeGeometry(2, 2.2, 8), 0, 9.1, 0), '#C4553A'),
    ...[0, 1, 2, 3].map((i) => paint(at(new THREE.BoxGeometry(0.5, 5, 0.1), 0, 7.2, 2.1, 0, 0, (i * Math.PI) / 2), '#B08A5E')),
  ];
  // shift blades so they rotate around hub
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [4, 8, 4], at: [0, 4, 0] }] };
}

export function tent(color = '#4A4F5C'): BuiltProp {
  const parts = [paint(at(prism(4, 2.6, 4), 0, 0, 0), color, 0.05), paint(at(new THREE.BoxGeometry(0.1, 2.8, 0.1), 0, 1.4, 2), '#6B4A33')];
  return { geo: mergeGeometries(parts)!, colliders: [{ box: [4, 2.6, 4], at: [0, 1.3, 0] }] };
}

export function stilthouse(): BuiltProp {
  const h = house({ w: 5, d: 5, h: 3, wall: '#E8E1C9', roof: '#2E6F95', chimney: false });
  const parts = [h.geo.clone().translate(0, 2.2, 0)];
  for (const sx of [-2, 2]) for (const sz of [-2, 2]) parts.push(paint(at(new THREE.CylinderGeometry(0.18, 0.2, 3, 6), sx, 0.9, sz), '#6B4A33'));
  parts.push(paint(at(new THREE.BoxGeometry(6.5, 0.2, 6.5), 0, 2.2, 0), '#8C6A44'));
  return { geo: mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, colliders: [{ box: [6.5, 6, 6.5], at: [0, 3, 0] }] };
}

export function crate(): BuiltProp {
  return { geo: paint(at(new THREE.BoxGeometry(1, 1, 1), 0, 0.5, 0), '#9C7A54', 0.06), colliders: [{ box: [1, 1, 1], at: [0, 0.5, 0] }] };
}

export function wallSeg(len = 6, h = 2.5, color = '#8A8578'): BuiltProp {
  return { geo: paint(at(new THREE.BoxGeometry(len, h, 0.8), 0, h / 2, 0), color, 0.08), colliders: [{ box: [len, h, 0.8], at: [0, h / 2, 0] }] };
}

export const BUILDERS: Record<string, (p: { color?: string; roof?: string; w?: number; d?: number; h?: number; label?: string }) => BuiltProp> = {
  house: (p) => house({ wall: p.color, roof: p.roof, w: p.w, d: p.d }),
  house2: (p) => house({ wall: p.color, roof: p.roof, w: p.w ?? 8, d: p.d ?? 7, stories: 2 }),
  hearth: () => house({ w: 9, d: 7, wall: '#F3EAD7', roof: '#B5543C', sign: '#E4572E', stories: 1 }),
  chordstone: (p) => chordstone(p.color),
  lamp: () => lamp(),
  sign: () => signpost(),
  well: () => well(),
  stall: (p) => stall(p.color),
  bridge: (p) => bridge(p.d ?? 10, p.w ?? 3),
  hall_root: (p) => hall(p.color ?? '#4CAF50', 'root'),
  hall_stone: (p) => hall(p.color ?? '#9C7A54', 'stone'),
  hall_mere: (p) => hall(p.color ?? '#2E86DE', 'mere'),
  hall_vane: (p) => hall(p.color ?? '#8FB9A8', 'vane'),
  hall_forge: (p) => hall(p.color ?? '#E4572E', 'forge'),
  hall_rime: (p) => hall(p.color ?? '#7FD3E6', 'rime'),
  spire: (p) => hall(p.color ?? '#2FA39A', 'spire'),
  windmill: () => windmill(),
  tent: (p) => tent(p.color),
  stilthouse: () => stilthouse(),
  crate: () => crate(),
  wall: (p) => wallSeg(p.w ?? 6, p.h ?? 2.5, p.color),
};
