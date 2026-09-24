// Parametric building & landmark builders (original designs). Every part carries a PBR surface layer
// (plaster, timber, stone blocks, clay tiles, planks, canvas, iron…) from the procedural texture arrays,
// tinted by the zone's authored colours; bevelled edges on timber/stone; framed, glazed windows that glow
// at night (surface glow mode); doors, shutters, sills, eaves, ridge caps, chimneys. Hedge-coloured walls
// become leafy hedges. Contract kept from v1: BUILDERS[kind](opts) → { geo, colliders, glow, interactR }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SURF } from '../surfaces/recipes';
import { kitAttrs, card, rng, vnoise3 } from './flora';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEAF } from '../vegetation/leafAtlas';
import type { MatKey } from './kit';

type Mode = 0 | 1 | 2; // 0 triplanar, 1 planar/uv (metres), 2 = glazing (uv + night glow)

/** Per-vertex planar projection in metres on the face's own plane (u horizontal, v up-slope). */
function planarUV(g: THREE.BufferGeometry, vertical = false) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const out = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i).normalize();
    if (Math.abs(n.y) > 0.98) T.set(1, 0, 0);
    else T.crossVectors(up, n).normalize();
    B.crossVectors(n, T).normalize();
    const u = p.dot(T), v = p.dot(B);
    out[i * 2] = vertical ? v : u;
    out[i * 2 + 1] = vertical ? u : v;
  }
  g.setAttribute('aUv', new THREE.BufferAttribute(out, 2));
}

/** Lathe/cylinder/cone UVs (0..1) → metres (u around the circumference, v along the side). */
function roundUV(g: THREE.BufferGeometry, circumference: number, length: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const out = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    out[i * 2] = uv.getX(i) * circumference;
    out[i * 2 + 1] = uv.getY(i) * length;
  }
  g.setAttribute('aUv', new THREE.BufferAttribute(out, 2));
}

interface PaintOpts { surf: number; mode?: Mode; vary?: number; vertical?: boolean; round?: [number, number] }
function paint(g: THREE.BufferGeometry, color: string, o: PaintOpts): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const mode = o.mode ?? 1;
  if (o.round) roundUV(g, o.round[0], o.round[1]);
  else if (mode !== 0) planarUV(g, o.vertical);
  g.deleteAttribute('uv');
  g.userData.vertical = !!o.vertical;
  return kitAttrs(g, { color, surf: o.surf, uvMode: mode, rigid: true, vary: o.vary ?? 0.03, seed: g.attributes.position.count });
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
  return g;
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rbox = (w: number, h: number, d: number, r = 0.035) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
function prism(w: number, h: number, d: number): THREE.BufferGeometry {
  // gable wall: triangle cross-section in X/Y, extruded along Z
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g.toNonIndexed();
}

export interface BuiltProp {
  geo: THREE.BufferGeometry;
  colliders: { box: [number, number, number]; at: [number, number, number]; yaw?: number }[];
  glow?: { pos: [number, number, number]; color: string }[];
  label?: string;
  interactR?: number;
  /** material slot per geometry group (default: one 'surface' group) */
  mats?: MatKey[];
}

function finish(parts: THREE.BufferGeometry[], extra?: { leaf?: THREE.BufferGeometry[]; crystal?: THREE.BufferGeometry[] }): { geo: THREE.BufferGeometry; mats: MatKey[] } {
  const groups: [MatKey, THREE.BufferGeometry[]][] = [['surface', parts], ['leaf', extra?.leaf ?? []], ['crystal', extra?.crystal ?? []]];
  const merged: THREE.BufferGeometry[] = [];
  const mats: MatKey[] = [];
  for (const [k, list] of groups) {
    if (!list.length) continue;
    merged.push(mergeGeometries(list, false)!);
    mats.push(k);
  }
  const geo = merged.length === 1 ? merged[0] : mergeGeometries(merged, true)!;
  if (merged.length === 1) {
    geo.clearGroups();
    geo.addGroup(0, geo.index!.count, 0);
  }
  geo.computeBoundingSphere();
  return { geo, mats };
}

const GLASS = '#ffc877';
const IRON = '#3a3a3e';

/** Framed window with glazing bars, sill and optional shutters, facing +Z (at the local origin). */
function windowParts(w: number, h: number, trim: string, shutter: string | null): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  out.push(paint(box(w - 0.08, h - 0.08, 0.05), GLASS, { surf: SURF.metal, mode: 2 }));
  const f = 0.09;
  out.push(paint(at(rbox(w + f, f, 0.12, 0.02), 0, h / 2, 0.03), trim, { surf: SURF.wood }));
  out.push(paint(at(rbox(w + f, f, 0.12, 0.02), 0, -h / 2, 0.03), trim, { surf: SURF.wood }));
  out.push(paint(at(rbox(f, h, 0.12, 0.02), -w / 2, 0, 0.03), trim, { surf: SURF.wood, vertical: true }));
  out.push(paint(at(rbox(f, h, 0.12, 0.02), w / 2, 0, 0.03), trim, { surf: SURF.wood, vertical: true }));
  out.push(paint(at(box(0.04, h - 0.1, 0.06), 0, 0, 0.04), trim, { surf: SURF.wood, vertical: true }));
  out.push(paint(at(box(w - 0.1, 0.04, 0.06), 0, h * 0.1, 0.04), trim, { surf: SURF.wood }));
  out.push(paint(at(rbox(w + 0.25, 0.08, 0.24, 0.02), 0, -h / 2 - 0.06, 0.1), '#9a9284', { surf: SURF.brick }));
  if (shutter) {
    for (const sx of [-1, 1]) out.push(paint(at(rbox(w * 0.5, h, 0.05, 0.015), sx * (w * 0.75 + 0.06), 0, 0.03), shutter, { surf: SURF.wood, vertical: true }));
  }
  return out;
}
function place(parts: THREE.BufferGeometry[], x: number, y: number, z: number, ry: number) {
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}
// planar UVs are computed before placement; re-derive after rotation so wall-mounted details stay crisp
function reproject(parts: THREE.BufferGeometry[], vertical = false) {
  for (const p of parts) {
    const s = p.attributes.aSurf as THREE.BufferAttribute;
    if (s && s.getY(0) > 0.5) planarUV(p, vertical || (p.userData.vertical as boolean));
  }
  return parts;
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
  // plinth + plastered walls
  parts.push(paint(at(rbox(w + 0.3, 0.55, d + 0.3, 0.05), 0, 0.27, 0), '#8f887c', { surf: SURF.brick }));
  parts.push(paint(at(box(w, h - 0.5, d), 0, 0.5 + (h - 0.5) / 2, 0), wall, { surf: SURF.plaster }));
  // timber frame: corner posts, sill/top plates, story beam, braces on the long (±X) walls
  const beam = (g: THREE.BufferGeometry, vertical = false) => parts.push(paint(g, trim, { surf: SURF.wood, vertical }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(at(rbox(0.24, h - 0.5, 0.24), sx * (w / 2), 0.5 + (h - 0.5) / 2, sz * (d / 2)), true);
  for (const y of [0.62, h - 0.1, ...(o.stories === 2 ? [h / 2] : [])]) {
    for (const sz of [-1, 1]) beam(at(rbox(w + 0.12, 0.2, 0.16), 0, y, sz * (d / 2 + 0.02)));
    for (const sx of [-1, 1]) beam(at(rbox(0.16, 0.2, d + 0.12), sx * (w / 2 + 0.02), y, 0));
  }
  const storyH = o.stories === 2 ? h / 2 : h;
  for (const sx of [-1, 1]) {
    for (const k of [-1, 1]) {
      // diagonal braces on the side walls
      const len = Math.hypot(d * 0.28, storyH * 0.55);
      const ang = Math.atan2(storyH * 0.55, d * 0.28);
      beam(at(rbox(0.14, len, 0.14), sx * (w / 2 + 0.03), 0.7 + storyH * 0.3, k * d * 0.33, 0, k * (Math.PI / 2 - ang), 0), true);
    }
    beam(at(rbox(0.16, h - 0.6, 0.16), sx * (w / 2 + 0.03), 0.5 + (h - 0.5) / 2, 0), true);
  }
  // gables + roof slabs (ridge along Z, slopes toward ±X), eaves overhang, ridge cap
  const rh = w * 0.42;
  parts.push(paint(at(prism(w, rh, d), 0, h, 0), wall, { surf: SURF.plaster }));
  for (const sz of [-1, 1]) beam(at(rbox(0.2, rh * 0.9, 0.14), 0, h + rh * 0.45, sz * (d / 2 + 0.03)), true);
  const theta = Math.atan2(rh, w / 2);
  const hs = w / 2 + 0.6;
  const L = hs / Math.cos(theta);
  for (const sx of [-1, 1]) {
    const slab = rbox(L, 0.16, d + 1.1, 0.04);
    const cx = (sx * hs) / 2;
    const cy = h + rh - (hs / 2) * Math.tan(theta) + 0.12;
    parts.push(paint(at(slab, cx, cy, 0, 0, 0, -sx * theta), roof, { surf: SURF.roof, vary: 0.02 }));
    // fascia under the eave
    beam(at(rbox(0.12, 0.22, d + 1.1), sx * (hs - 0.05), h + rh - hs * Math.tan(theta) + 0.02, 0));
  }
  // planar projection on the slabs: v runs up-slope so tile rows overlap downhill
  parts.push(paint(at(rbox(0.34, 0.2, d + 1.15, 0.06), 0, h + rh + 0.2, 0), new THREE.Color(roof).multiplyScalar(0.8).getStyle(), { surf: SURF.roof }));
  // door (+Z gable end): frame, planked leaf, handle, stone step, little canopy
  const dz = d / 2;
  parts.push(paint(at(box(1.2, 2.15, 0.08), 0, 0.55 + 1.07, dz + 0.02), '#6B4A33', { surf: SURF.wood, vertical: true }));
  for (const sx of [-1, 1]) beam(at(rbox(0.16, 2.3, 0.18), sx * 0.68, 0.55 + 1.15, dz + 0.05), true);
  beam(at(rbox(1.55, 0.18, 0.2), 0, 0.55 + 2.3, dz + 0.05));
  parts.push(paint(at(new THREE.SphereGeometry(0.05, 8, 6), 0.4, 0.55 + 1.05, dz + 0.1), IRON, { surf: SURF.metal, mode: 0 }));
  parts.push(paint(at(rbox(1.7, 0.2, 0.7, 0.04), 0, 0.1, dz + 0.45), '#8f887c', { surf: SURF.brick }));
  // windows: front (flanking the door), both sides; upper row on two-storey houses
  const shutter = new THREE.Color(roof).lerp(new THREE.Color(trim), 0.5).getStyle();
  const rows = o.stories === 2 ? [0.55 + storyH * 0.5, 0.55 + storyH * 1.45] : [0.55 + h * 0.48];
  for (const y of rows) {
    for (const sx of [-1, 1]) parts.push(...reproject(place(windowParts(1.0, 1.05, trim, shutter), sx * w * 0.3, y, dz + 0.02, 0)));
    for (const sx of [-1, 1]) for (const k of d > 5.5 ? [-0.25, 0.25] : [0]) parts.push(...reproject(place(windowParts(0.9, 1.0, trim, shutter), sx * (w / 2 + 0.02), y, k * d, (sx * Math.PI) / 2)));
  }
  if (o.chimney !== false) {
    parts.push(paint(at(rbox(0.75, 2.6, 0.75, 0.04), w * 0.26, h + rh * 0.55, -d * 0.2), '#8f877a', { surf: SURF.brick }));
    parts.push(paint(at(rbox(0.9, 0.14, 0.9, 0.03), w * 0.26, h + rh * 0.55 + 1.32, -d * 0.2), '#77706a', { surf: SURF.brick }));
  }
  const glow: BuiltProp['glow'] = [];
  if (o.sign) {
    parts.push(paint(at(rbox(1.8, 0.7, 0.1, 0.03), 0, 3.35, dz + 0.4), o.sign, { surf: SURF.wood }));
    for (const sx of [-0.7, 0.7]) parts.push(paint(at(box(0.04, 0.5, 0.04), sx, 3.85, dz + 0.4), IRON, { surf: SURF.metal, mode: 0 }));
    glow.push({ pos: [0, 3.35, dz + 0.55], color: o.sign });
  }
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [w + 0.3, h + rh, d + 0.3], at: [0, (h + rh) / 2, 0] }], glow };
}

/** Chordstone: tall carved monolith with a type-glyph ring; doubles as Waystone. */
export function chordstone(accent = '#2FA39A'): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  const slab = new THREE.CylinderGeometry(0.55, 0.85, 4.2, 6, 6);
  const pos = slab.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + Math.sin(y * 3.1 + pos.getX(i) * 2) * 0.03;
    pos.setX(i, pos.getX(i) * 0.75 * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  slab.computeVertexNormals();
  parts.push(paint(at(slab, 0, 2.1, 0), '#a39a8b', { surf: SURF.rock, mode: 0, vary: 0.04 }));
  parts.push(paint(at(new THREE.CylinderGeometry(1.3, 1.55, 0.4, 8), 0, 0.2, 0), '#8a857a', { surf: SURF.brick, mode: 0 }));
  parts.push(paint(at(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 8), 0, 0.5, 0), '#948e82', { surf: SURF.brick, mode: 0 }));
  const gems = [
    kitAttrs(at(new THREE.TorusGeometry(0.62, 0.06, 6, 24), 0, 3.0, 0), { color: accent, rigid: true }),
    kitAttrs(at(new THREE.OctahedronGeometry(0.28), 0, 4.45, 0), { color: accent, rigid: true }),
  ];
  const f = finish(parts, { crystal: gems });
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [1.4, 4.4, 1.0], at: [0, 2.2, 0] }], glow: [{ pos: [0, 3.2, 0], color: accent }], interactR: 2.6 };
}

export function lamp(): BuiltProp {
  const parts = [
    paint(at(rbox(0.45, 0.35, 0.45, 0.05), 0, 0.17, 0), '#8f887c', { surf: SURF.brick }),
    paint(at(new THREE.CylinderGeometry(0.06, 0.09, 3, 8), 0, 1.6, 0), IRON, { surf: SURF.metal, round: [0.4, 3] }),
    paint(at(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), 0, 2.95, 0), IRON, { surf: SURF.metal, mode: 0 }),
    paint(at(box(0.3, 0.42, 0.3), 0, 3.22, 0), GLASS, { surf: SURF.metal, mode: 2 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => paint(at(box(0.04, 0.46, 0.04), sx * 0.16, 3.22, sz * 0.16), IRON, { surf: SURF.metal, mode: 0 }))),
    paint(at(new THREE.ConeGeometry(0.3, 0.3, 4), 0, 3.58, 0, Math.PI / 4), IRON, { surf: SURF.metal, mode: 0 }),
    paint(at(new THREE.SphereGeometry(0.05, 6, 4), 0, 3.76, 0), IRON, { surf: SURF.metal, mode: 0 }),
  ];
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [0.3, 3, 0.3], at: [0, 1.5, 0] }], glow: [{ pos: [0, 3.2, 0], color: '#FFD98A' }] };
}

export function signpost(): BuiltProp {
  const parts = [
    paint(at(rbox(0.14, 1.9, 0.14, 0.03), 0, 0.95, 0), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(rbox(1.4, 0.42, 0.07, 0.03), 0.35, 1.5, 0), '#a88458', { surf: SURF.wood }),
    paint(at(new THREE.ConeGeometry(0.1, 0.12, 4), 0, 1.96, 0, Math.PI / 4), '#5a3e2b', { surf: SURF.wood, mode: 0 }),
  ];
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [0.3, 1.8, 0.3], at: [0, 0.9, 0] }], interactR: 2 };
}

export function well(): BuiltProp {
  const ring = new THREE.CylinderGeometry(1.1, 1.2, 1, 16, 1, true);
  const inner = new THREE.CylinderGeometry(0.95, 0.95, 0.95, 16, 1, true);
  inner.scale(-1, 1, 1);
  const parts = [
    paint(at(ring, 0, 0.5, 0), '#8f887c', { surf: SURF.brick, round: [7.2, 1] }),
    paint(at(inner, 0, 0.5, 0), '#77706a', { surf: SURF.brick, round: [6, 1] }),
    paint(at(new THREE.TorusGeometry(1.08, 0.12, 6, 20), 0, 1.0, 0, 0, Math.PI / 2), '#9a9284', { surf: SURF.brick, mode: 0 }),
    paint(at(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 16), 0, 0.45, 0), '#1e3a4a', { surf: SURF.ice, mode: 0 }),
    paint(at(rbox(0.15, 2.4, 0.15), -1, 1.2, 0), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(rbox(0.15, 2.4, 0.15), 1, 1.2, 0), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), 0, 1.9, 0, 0, 0, Math.PI / 2), '#7a5a3c', { surf: SURF.wood, mode: 0 }),
    paint(at(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 10), 0.25, 1.35, 0), '#6a5038', { surf: SURF.wood, mode: 0 }),
  ];
  for (const sx of [-1, 1]) parts.push(paint(at(rbox(1.7, 0.08, 1.7, 0.02), sx * 0.62, 2.62, 0, 0, 0, -sx * 0.62), '#8C5A3C', { surf: SURF.roof }));
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [2.5, 1.2, 2.5], at: [0, 0.6, 0] }] };
}

export function stall(color = '#C4553A'): BuiltProp {
  const parts = [
    paint(at(rbox(3, 1, 1.4, 0.04), 0, 0.5, 0), '#8C6A44', { surf: SURF.wood }),
    paint(at(rbox(3.1, 0.08, 1.5, 0.02), 0, 1.02, 0), '#7a5a3c', { surf: SURF.wood }),
    ...[-1.4, 1.4].flatMap((x) => [paint(at(rbox(0.1, 2.6, 0.1, 0.02), x, 1.3, -0.6), '#6B4A33', { surf: SURF.wood, vertical: true }), paint(at(rbox(0.1, 2.4, 0.1, 0.02), x, 1.2, 0.6), '#6B4A33', { surf: SURF.wood, vertical: true })]),
    paint(at(box(3.3, 0.04, 1.8), 0, 2.55, 0, 0, 0.18), color, { surf: SURF.canvas }),
  ];
  // scalloped valance
  for (let i = 0; i < 8; i++) parts.push(paint(at(box(0.4, 0.22, 0.02), -1.45 + i * 0.41, 2.28, 0.88, 0, 0.1), color, { surf: SURF.canvas }));
  // produce crates
  for (let i = 0; i < 3; i++) parts.push(paint(at(rbox(0.6, 0.25, 0.45, 0.02), -0.9 + i * 0.9, 1.17, 0.2), '#9C7A54', { surf: SURF.wood }));
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [3, 1, 1.4], at: [0, 0.5, 0] }] };
}

export function bridge(len = 10, w = 3): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(len * 13 + w);
  for (let i = 0; i < Math.floor(len / 0.5); i++) parts.push(paint(at(rbox(w, 0.12, 0.44, 0.02), 0, (r() - 0.5) * 0.02, -len / 2 + i * 0.5 + 0.25, (r() - 0.5) * 0.03), '#8C6A44', { surf: SURF.wood, vary: 0.08 }));
  for (const sx of [-1, 1]) {
    parts.push(paint(at(rbox(0.22, 0.2, len + 0.2), sx * (w / 2 - 0.2), -0.15, 0), '#6B4A33', { surf: SURF.wood }));
    parts.push(paint(at(rbox(0.12, 0.12, len), (sx * w) / 2, 0.95, 0), '#6B4A33', { surf: SURF.wood }));
    for (let i = 0; i <= 4; i++) parts.push(paint(at(rbox(0.14, 1.1, 0.14), (sx * w) / 2, 0.45, -len / 2 + (i * len) / 4), '#5e4430', { surf: SURF.wood, vertical: true }));
  }
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [w, 0.3, len], at: [0, -0.05, 0] }, { box: [0.2, 1, len], at: [-w / 2, 0.5, 0] }, { box: [0.2, 1, len], at: [w / 2, 0.5, 0] }] };
}

/** Cadence Hall exterior: stone rotunda with buttresses, tiled cone roofs, bell tower, crest in the Cantor's colour. */
export function hall(color: string, style: 'root' | 'stone' | 'mere' | 'vane' | 'forge' | 'rime' | 'spire'): BuiltProp {
  const parts: THREE.BufferGeometry[] = [];
  const wall = { root: '#7a6048', stone: '#c2b8a3', mere: '#e8e1c9', vane: '#e7eef2', forge: '#4a403a', rime: '#d4e2ea', spire: '#f0e6d2' }[style];
  const roof = { root: '#3E7045', stone: '#5B6770', mere: '#2E6F95', vane: '#C4553A', forge: '#8A2E1E', rime: '#4C6A85', spire: '#C8963E' }[style];
  const wallSurf = style === 'root' ? SURF.wood : style === 'mere' || style === 'vane' ? SURF.plaster : SURF.brick;
  const roofSurf = style === 'forge' ? SURF.metal : SURF.roof;
  const cyl = (rt: number, rb: number, h: number, seg: number) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true);
  parts.push(paint(at(new THREE.CylinderGeometry(7.8, 8.1, 0.6, 16), 0, 0.3, 0), '#8f887c', { surf: SURF.brick, mode: 0 }));
  parts.push(paint(at(cyl(7, 7.5, 7, 24), 0, 3.5 + 0.3, 0), wall, { surf: wallSurf, round: [45, 7] }));
  // buttresses + tall windows between them
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(paint(at(rbox(0.9, 6.8, 1.2, 0.06), Math.sin(a) * 7.4, 3.7, Math.cos(a) * 7.4, a), '#9a9284', { surf: SURF.brick }));
    const b = a + Math.PI / 8;
    if (i === 7) continue; // entrance side
    parts.push(...reproject(place(windowParts(0.9, 2.2, '#5e4430', null), Math.sin(b) * 7.22, 4.4, Math.cos(b) * 7.22, b)));
  }
  parts.push(paint(at(new THREE.CylinderGeometry(7.6, 7.6, 0.4, 24), 0, 7.35, 0), '#9a9284', { surf: SURF.brick, mode: 0 }));
  parts.push(paint(at(new THREE.ConeGeometry(8.4, 4.5, 24, 1, true), 0, 9.75, 0), roof, { surf: roofSurf, round: [52, 9.6] }));
  // bell tower
  parts.push(paint(at(cyl(1.6, 1.8, 8, 12), 0, 13, 0), wall, { surf: wallSurf, round: [11, 8] }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(...reproject(place(windowParts(0.5, 1.4, '#5e4430', null), Math.sin(a) * 1.72, 15, Math.cos(a) * 1.72, a)));
  }
  parts.push(paint(at(new THREE.CylinderGeometry(2.0, 2.0, 0.3, 12), 0, 17.1, 0), '#9a9284', { surf: SURF.brick, mode: 0 }));
  parts.push(paint(at(new THREE.ConeGeometry(2.3, 3.2, 12, 1, true), 0, 18.8, 0), roof, { surf: roofSurf, round: [14.5, 4] }));
  // tuning fork crest
  const crest = [
    at(new THREE.BoxGeometry(0.25, 2, 0.25), -0.5, 21.2, 0),
    at(new THREE.BoxGeometry(0.25, 2, 0.25), 0.5, 21.2, 0),
    at(new THREE.BoxGeometry(1.25, 0.25, 0.25), 0, 20.2, 0),
    at(new THREE.BoxGeometry(0.25, 1.4, 0.25), 0, 19.6, 0),
  ].map((g) => kitAttrs(g, { color, rigid: true }));
  // entrance: stone portal, planked double door, tiled canopy
  parts.push(paint(at(rbox(3.6, 4.6, 1.4, 0.08), 0, 2.3 + 0.3, 7.1), '#9a9284', { surf: SURF.brick }));
  parts.push(paint(at(box(2.4, 3.5, 0.2), 0, 1.75 + 0.3, 7.82), '#4A3A2A', { surf: SURF.wood, vertical: true }));
  parts.push(paint(at(box(0.08, 3.5, 0.22), 0, 1.75 + 0.3, 7.84), '#2e241a', { surf: SURF.wood, vertical: true }));
  for (const sx of [-1, 1]) parts.push(paint(at(new THREE.TorusGeometry(0.14, 0.025, 6, 12), sx * 0.3, 2.1, 7.95), IRON, { surf: SURF.metal, mode: 0 }));
  for (const sx of [-1, 1]) parts.push(paint(at(rbox(2.3, 0.14, 2.0, 0.03), sx * 1.0, 5.2, 7.4, 0, 0, -sx * 0.45), roof, { surf: roofSurf }));
  parts.push(paint(at(rbox(4.4, 0.3, 2.4, 0.05), 0, 0.15, 8.2), '#8f887c', { surf: SURF.brick }));
  const f = finish(parts, { crystal: crest });
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [14, 9, 14], at: [0, 4.5, 0] }], glow: [{ pos: [0, 20.5, 0], color }], interactR: 4 };
}

export function windmill(): BuiltProp {
  const parts = [
    paint(at(new THREE.CylinderGeometry(1.6, 2.4, 8, 16, 1, true), 0, 4, 0), '#e7eef2', { surf: SURF.plaster, round: [12.6, 8] }),
    paint(at(new THREE.CylinderGeometry(2.5, 2.6, 0.5, 16), 0, 0.25, 0), '#8f887c', { surf: SURF.brick, mode: 0 }),
    paint(at(new THREE.ConeGeometry(2.05, 2.2, 16, 1, true), 0, 9.1, 0), '#C4553A', { surf: SURF.roof, round: [12.9, 3] }),
    paint(at(box(1.0, 1.9, 0.1), 0, 0.95 + 0.5, 2.3, 0, -0.1), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 10), 0, 7.2, 1.9, 0, Math.PI / 2), '#5e4430', { surf: SURF.wood, mode: 0 }),
  ];
  for (let i = 0; i < 4; i++) {
    const rz = (i * Math.PI) / 2 + 0.3;
    const g1 = rbox(0.14, 5, 0.1, 0.02);
    const sail = box(0.9, 3.6, 0.03);
    sail.translate(0.55, 0.6, 0);
    g1.translate(0, 2.5, 0).rotateZ(rz).translate(0, 7.2, 2.35);
    sail.translate(0, 2.5, 0).rotateZ(rz).translate(0, 7.2, 2.33);
    parts.push(paint(g1, '#8a6c4c', { surf: SURF.wood, mode: 0 }));
    parts.push(paint(sail, '#e8e0cc', { surf: SURF.canvas }));
  }
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [4, 8, 4], at: [0, 4, 0] }] };
}

export function tent(color = '#4A4F5C'): BuiltProp {
  const parts = [
    paint(at(prism(4, 2.6, 4), 0, 0, 0), color, { surf: SURF.canvas, vary: 0.04 }),
    paint(at(rbox(0.1, 2.8, 0.1, 0.02), 0, 1.4, 2.02), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(rbox(0.1, 2.8, 0.1, 0.02), 0, 1.4, -2.02), '#6B4A33', { surf: SURF.wood, vertical: true }),
    paint(at(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), 1.2, 1.3, 2.4, 0, 0.6), '#c8b890', { surf: SURF.canvas, mode: 0 }),
    paint(at(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), -1.2, 1.3, 2.4, 0, -0.6), '#c8b890', { surf: SURF.canvas, mode: 0 }),
  ];
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [4, 2.6, 4], at: [0, 1.3, 0] }] };
}

export function stilthouse(): BuiltProp {
  const h = house({ w: 5, d: 5, h: 3, wall: '#E8E1C9', roof: '#2E6F95', chimney: false });
  const parts = [h.geo.clone().translate(0, 2.2, 0)];
  const extra: THREE.BufferGeometry[] = [];
  for (const sx of [-2, 2]) for (const sz of [-2, 2]) extra.push(paint(at(new THREE.CylinderGeometry(0.18, 0.22, 3, 8), sx, 0.9, sz), '#6B4A33', { surf: SURF.wood, round: [1.2, 3] }));
  for (let i = 0; i < 13; i++) extra.push(paint(at(rbox(6.5, 0.1, 0.48, 0.015), 0, 2.2, -3.0 + i * 0.5), '#8C6A44', { surf: SURF.wood, vary: 0.08 }));
  const ex = mergeGeometries(extra, false)!;
  // keep the house's group layout: [surface] only
  const geo = mergeGeometries([parts[0], ex], false)!;
  geo.clearGroups();
  geo.addGroup(0, geo.index!.count, 0);
  geo.computeBoundingSphere();
  return { geo, mats: ['surface'], colliders: [{ box: [6.5, 6, 6.5], at: [0, 3, 0] }] };
}

export function crate(): BuiltProp {
  const parts = [paint(at(box(0.94, 0.94, 0.94), 0, 0.5, 0), '#9C7A54', { surf: SURF.wood, vary: 0.06 })];
  for (const [w, h, d, x, y, z] of [
    [1, 0.1, 0.1, 0, 0.05, 0.47], [1, 0.1, 0.1, 0, 0.95, 0.47], [1, 0.1, 0.1, 0, 0.05, -0.47], [1, 0.1, 0.1, 0, 0.95, -0.47],
    [0.1, 0.1, 1, 0.47, 0.05, 0], [0.1, 0.1, 1, 0.47, 0.95, 0], [0.1, 0.1, 1, -0.47, 0.05, 0], [0.1, 0.1, 1, -0.47, 0.95, 0],
    [0.1, 1, 0.1, 0.47, 0.5, 0.47], [0.1, 1, 0.1, -0.47, 0.5, 0.47], [0.1, 1, 0.1, 0.47, 0.5, -0.47], [0.1, 1, 0.1, -0.47, 0.5, -0.47],
  ] as const) parts.push(paint(at(rbox(w, h, d, 0.02), x, y, z), '#7a5a3c', { surf: SURF.wood, vertical: h > 0.5 }));
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders: [{ box: [1, 1, 1], at: [0, 0.5, 0] }] };
}

function hsl(color: string) {
  const o = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(o);
  return o;
}
const isHedge = (c: string) => { const o = hsl(c); return o.h > 0.17 && o.h < 0.45 && o.s > 0.2; };
const isWood = (c: string) => { const o = hsl(c); return o.h > 0.04 && o.h < 0.12 && o.s > 0.25 && o.l < 0.5; };

export interface BuildCtx { indoor?: boolean; biome?: string }

/** Natural rock face: a subdivided slab displaced by 3-D noise (bulges, ledges, ragged crest). */
function rockFace(len: number, h: number, color: string, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(len, h, 0.9, Math.max(2, Math.ceil(len / 0.6)), Math.max(2, Math.ceil(h / 0.6)), 2);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n1 = vnoise3(p.x * 0.35, p.y * 0.35, p.z * 0.35, seed), n2 = vnoise3(p.x * 1.1, p.y * 1.1, p.z * 1.1, seed + 1);
    const ledge = Math.round(p.y / 1.3) * 1.3 - p.y;
    const bulge = 0.35 * n1 + 0.14 * n2 + 0.05 * ledge;
    const side = Math.sign(p.z) || 1;
    if (Math.abs(p.z) > 0.3) p.z += side * Math.max(-0.1, bulge + 0.15);
    if (p.y > h / 2 - 0.05) p.y += 0.45 * vnoise3(p.x * 0.5, 0, p.z, seed + 2) + 0.2 * n2;
    if (Math.abs(p.x) > len / 2 - 0.05) p.x += Math.sign(p.x) * 0.25 * n1;
    pos.setXYZ(i, p.x, p.y + h / 2, p.z);
  }
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color), c = new THREE.Color();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const top = hsl(color).l > 0.6 ? new THREE.Color('#f4f8fb') : new THREE.Color('#4f5e34');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.copy(base).multiplyScalar(0.62 + 0.38 * Math.min(1, y / h + 0.2) * (0.9 + 0.2 * vnoise3(i * 0.1, y, 0, seed + 3)));
    c.lerp(top, THREE.MathUtils.smoothstep(nrm.getY(i), 0.55, 0.85) * 0.75);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return kitAttrs(g, { surf: SURF.rock, uvMode: 0, rigid: true });
}

export function wallSeg(len = 6, h = 2.5, color = '#8A8578', ctx: BuildCtx = {}): BuiltProp {
  const colliders: BuiltProp['colliders'] = [{ box: [len, h, 0.8], at: [0, h / 2, 0] }];
  if (isHedge(color) && !ctx.indoor) {
    // clipped hedge: dark twiggy core wrapped in leaf cards
    const core = paint(at(box(len - 0.2, h - 0.15, 0.6), 0, (h - 0.15) / 2, 0), new THREE.Color(color).multiplyScalar(0.35).getStyle(), { surf: SURF.litter, mode: 0 });
    const r = rng(Math.round(len * 100 + h * 10));
    const leaves: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color('#cfdcc0');
    const center = new THREE.Vector3(0, h / 2, 0);
    const n = Math.round(len * h * 5.5);
    for (let i = 0; i < n; i++) {
      const face = r();
      let p: THREE.Vector3, nrm: THREE.Vector3;
      if (face < 0.4) { p = new THREE.Vector3((r() - 0.5) * len, r() * h, 0.34); nrm = new THREE.Vector3(0, 0, 1); }
      else if (face < 0.8) { p = new THREE.Vector3((r() - 0.5) * len, r() * h, -0.34); nrm = new THREE.Vector3(0, 0, -1); }
      else { p = new THREE.Vector3((r() - 0.5) * len, h - 0.05, (r() - 0.5) * 0.7); nrm = new THREE.Vector3(0, 1, 0); }
      const right = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(nrm).normalize();
      const up = nrm.clone().cross(right).normalize().lerp(nrm, 0.35).normalize();
      const shade = tint.clone().multiplyScalar((0.55 + 0.45 * (p.y / h)) * (0.85 + r() * 0.3));
      leaves.push(card(p, right, up, 0.75, 0.75, LEAF.fern, shade, h * 4, center));
    }
    const f = finish([core], { leaf: leaves });
    return { geo: f.geo, mats: f.mats, colliders };
  }
  const seed = Math.round(len * 31 + h * 7);
  if (ctx.indoor) {
    // dressed masonry (hall interiors) with a coping course
    const parts = [paint(at(rbox(len, h - 0.2, 0.8, 0.06), 0, (h - 0.2) / 2, 0), color, { surf: SURF.brick, vary: 0.05 })];
    const nC = Math.max(1, Math.round(len / 0.9));
    for (let i = 0; i < nC; i++) parts.push(paint(at(rbox(len / nC - 0.04, 0.22, 0.95, 0.05), -len / 2 + (i + 0.5) * (len / nC), h - 0.1, 0, (i % 2 ? 1 : -1) * 0.01), new THREE.Color(color).multiplyScalar(0.92).getStyle(), { surf: SURF.brick }));
    const f = finish(parts);
    return { geo: f.geo, mats: f.mats, colliders };
  }
  if (isWood(color) && len <= 3) {
    // heavy timber (mine props, gate posts): bevelled beam with vertical grain
    const f = finish([paint(at(rbox(len, h, 0.8, 0.06), 0, h / 2, 0), color, { surf: SURF.wood, vertical: true })]);
    return { geo: f.geo, mats: f.mats, colliders };
  }
  if (h >= 3.4) {
    const f = finish([rockFace(len, h, color, seed)]);
    return { geo: f.geo, mats: f.mats, colliders };
  }
  if (isWood(color)) {
    // plank fence / palisade: posts, vertical boards, capping rail
    const parts: THREE.BufferGeometry[] = [];
    const nb = Math.max(2, Math.round(len / 0.22));
    const r = rng(seed);
    for (let i = 0; i < nb; i++) parts.push(paint(at(box(len / nb - 0.02, h - 0.1 + (r() - 0.5) * 0.06, 0.05), -len / 2 + (i + 0.5) * (len / nb), (h - 0.1) / 2, 0), color, { surf: SURF.wood, vertical: true, vary: 0.08 }));
    for (let x = -len / 2; x <= len / 2 + 0.01; x += Math.max(1.5, len / Math.max(1, Math.round(len / 2)))) parts.push(paint(at(rbox(0.14, h + 0.1, 0.14, 0.03), x, (h + 0.1) / 2, -0.08), new THREE.Color(color).multiplyScalar(0.85).getStyle(), { surf: SURF.wood, vertical: true }));
    parts.push(paint(at(rbox(len + 0.1, 0.1, 0.12, 0.02), 0, h - 0.05, 0.02), color, { surf: SURF.wood }));
    const f = finish(parts);
    return { geo: f.geo, mats: f.mats, colliders };
  }
  // dry-stone rubble wall with irregular capstones
  const parts = [paint(at(rbox(len, h - 0.15, 0.75, 0.08), 0, (h - 0.15) / 2, 0), color, { surf: SURF.cobble, mode: 0, vary: 0.05 })];
  const r = rng(seed);
  const nC = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i < nC; i++) {
    const w = len / nC;
    parts.push(paint(at(rbox(w * (0.85 + r() * 0.2), 0.16 + r() * 0.1, 0.55 + r() * 0.25, 0.06), -len / 2 + (i + 0.5) * w, h - 0.12 + r() * 0.05, (r() - 0.5) * 0.1, (r() - 0.5) * 0.3, (r() - 0.5) * 0.15, (r() - 0.5) * 0.12), new THREE.Color(color).multiplyScalar(0.85 + r() * 0.25).getStyle(), { surf: SURF.rock, mode: 0 }));
  }
  const f = finish(parts);
  return { geo: f.geo, mats: f.mats, colliders };
}

export const BUILDERS: Record<string, (p: { color?: string; roof?: string; w?: number; d?: number; h?: number; label?: string }, ctx?: BuildCtx) => BuiltProp> = {
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
  wall: (p, ctx) => wallSeg(p.w ?? 6, p.h ?? 2.5, p.color, ctx),
};
