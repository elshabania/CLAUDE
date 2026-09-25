// c26 Marionyx — f09 stage 2, shade. Jointed marionette hung from its own floating crossbar crown
// (design/creatures.md §4 c26). Family motif: layered cut-out plates with violet rims, punched eye-holes lit
// from behind (ghost cyan), 12 fps stepped motion.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

// ---- species-local outlines (unit box, centred on the origin unless noted) ----
function roundPoly(pts: [number, number][], r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const p0 = lerp(p, a, Math.min(0.45, r / la));
    const p1 = lerp(p, b, Math.min(0.45, r / lb));
    // corner approximated with a few straight points (keeps extrude triangle counts low)
    const q = (t: number): [number, number] => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p[1] + t * t * p1[1]];
    if (i === 0) s.moveTo(p0[0], p0[1]);
    else s.lineTo(p0[0], p0[1]);
    for (const t of [0.33, 0.67]) s.lineTo(...q(t));
    s.lineTo(p1[0], p1[1]);
  }
  s.closePath();
  return s;
}
/** Pointed almond eye-hole, rotated by `tilt` degrees. */
function almondPts(cx: number, cy: number, a: number, b: number, tilt: number, n = 24): [number, number][] {
  const o: [number, number][] = [];
  const c = Math.cos((tilt * Math.PI) / 180), s = Math.sin((tilt * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t) * (0.35 + 0.65 * Math.abs(Math.sin(t)));
    o.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return o;
}
const S = SHAPES as Record<string, () => THREE.Shape>;
// angular mask with two tall horns (face region y -0.5..0.15, horns to 0.5)
const MASK: [number, number][] = [[-0.3, -0.5], [0.3, -0.5], [0.44, -0.12], [0.4, 0.12], [0.5, 0.5], [0.22, 0.16], [0, 0.22], [-0.22, 0.16], [-0.5, 0.5], [-0.4, 0.12], [-0.44, -0.12]];
S.S26_maskSolid = () => roundPoly(MASK, 0.05);
S.S26_mask = () => {
  const s = roundPoly(MASK, 0.05);
  for (const h of [almondPts(0.19, -0.1, 0.17, 0.1, 16), almondPts(-0.19, -0.1, 0.17, 0.1, -16)]) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
};
S.S26_jaw = () => roundPoly([[-0.5, 0.5], [0.5, 0.5], [0.36, -0.05], [0.1, -0.5], [-0.1, -0.5], [-0.36, -0.05]], 0.06);
// cloak: collar 0.34 flaring to 0.40 with a tattered three-point hem
S.S26_cloak = () => roundPoly([[-0.42, 0.5], [0.42, 0.5], [0.5, -0.3], [0.36, -0.5], [0.18, -0.36], [0, -0.5], [-0.18, -0.36], [-0.36, -0.5], [-0.5, -0.3]], 0.04);
// limb slat, base at origin extending +Y
S.S26_slat = () => roundPoly([[-0.5, 0], [0.5, 0], [0.4, 1], [-0.4, 1]], 0.25);
// flat three-finger hand, wrist at origin extending +Y
S.S26_hand = () => roundPoly([[-0.3, 0], [0.3, 0], [0.5, 0.45], [0.46, 1], [0.3, 0.55], [0.12, 1], [-0.06, 0.55], [-0.24, 0.95], [-0.5, 0.5]], 0.06);
// pointed foot, ankle at origin, toe toward +X
S.S26_foot = () => roundPoly([[-0.2, 0.5], [0.15, 0.4], [0.5, -0.1], [0.3, -0.5], [-0.3, -0.5], [-0.4, 0]], 0.08);

const PIN = '#9EA3B0';
/** Visible metal pin joint: a low rivet disc facing the audience. */
const rivet = (name: string, parent: string): PartDef => ({ name, parent, mirror: true, prim: { t: 'cyl', r: 0.024, h: 0.024, r2: 0.017 }, at: [0, 0, 0.012], rot: [90, 0, 0], slot: PIN, mat: 'METAL' });

/** A cut-out plate (P) with a slightly larger violet bevel plate (S) just behind it. */
function plate(name: string, parent: string, shape: string, w: number, h: number, at: V3, o: Partial<PartDef> & { rim?: number; depth?: number; rimShape?: string } = {}): PartDef[] {
  const d = o.depth ?? 0.04;
  const rim = o.rim ?? 0.02;
  const { rim: _r, depth: _d, rimShape, ...rest } = o;
  return [
    { name, parent, prim: { t: 'extrude', shape, w, h, depth: d }, at, ...rest },
    { name: name + 'Rim', parent: name, mirror: o.mirror, prim: { t: 'extrude', shape: rimShape ?? shape, w: w + rim * 2, h: h + rim * 2, depth: d * 0.5 }, at: [0, shape === 'S26_slat' || shape === 'S26_hand' ? -rim : 0, -d * 0.85], slot: 'S', anim: [] },
  ];
}

const parts: PartDef[] = [
  // ---- the floating crossbar crown ----
  { name: 'crossbar', prim: { t: 'box', w: 0.52, h: 0.035, d: 0.035 }, at: [0, 0.95, 0], anim: ['sway'] },
  { name: 'crossbarZ', parent: 'crossbar', prim: { t: 'box', w: 0.035, h: 0.035, d: 0.32 } },
  { name: 'barPin', parent: 'crossbar', mirror: true, prim: { t: 'cyl', r: 0.026, h: 0.03 }, at: [0.25, 0, 0], rot: [0, 0, -90], slot: PIN, mat: 'METAL' },
  { name: 'barPinF', parent: 'crossbar', prim: { t: 'cyl', r: 0.026, h: 0.03 }, at: [0, 0, 0.155], rot: [90, 0, 0], slot: PIN, mat: 'METAL' },
  { name: 'barPinB', parent: 'crossbar', prim: { t: 'cyl', r: 0.026, h: 0.03 }, at: [0, 0, -0.155], rot: [-90, 0, 0], slot: PIN, mat: 'METAL' },
  { name: 'barKnob', parent: 'crossbar', prim: { t: 'sphere', r: 0.032 }, at: [0, 0.01, 0], slot: 'S', mat: 'METAL' },
  // ---- body hangs from a pendulum pivot just under the bar ----
  { name: 'bodyPivot', prim: { t: 'none' }, at: [0, 0.91, 0], anim: ['sway'] },
  // mask head with almond eye-holes (lit cards behind) and a hinged jaw plate
  ...plate('head', 'bodyPivot', 'S26_mask', 0.27, 0.31, [0, -0.225, 0.02], { rimShape: 'S26_maskSolid', depth: 0.05, anim: ['look'] }),
  { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.058, bulge: 0.3 }, at: [0.051, -0.031, -0.022] },
  { name: 'jawHinge', parent: 'head', prim: { t: 'none' }, at: [0.08, -0.155, 0], rot: [0, 90, 0], anim: ['jaw', 'fx:mouth'] },
  ...plate('jaw', 'jawHinge', 'S26_jaw', 0.17, 0.08, [0, -0.04, -0.08], { rot: [0, -90, 0], depth: 0.04, rim: 0.015 }),
  // layered cloak torso (front plate + larger back plate, 0.10 apart)
  ...plate('cloak', 'bodyPivot', 'S26_cloak', 0.34, 0.28, [0, -0.59, 0.04], { depth: 0.05, anim: ['br', 'fx:body'] }),
  ...plate('cloakBack', 'cloak', 'S26_cloak', 0.4, 0.3, [0, -0.01, -0.1], { depth: 0.05, slot: 'P+' }),
  { name: 'collar', parent: 'cloak', prim: { t: 'extrude', shape: 'X_tri', w: 0.16, h: 0.08, depth: 0.03 }, at: [0, 0.14, 0.03], rot: [0, 0, 180], slot: 'S' },
  // ---- arms: shoulder pin -> upper slat -> elbow pin -> forearm slat -> three-finger hand ----
  { name: 'shoulder', parent: 'cloak', mirror: true, prim: { t: 'none' }, at: [0.175, 0.105, 0.035] },
  rivet('shoulderPin', 'shoulder'),
  { name: 'upperArm', parent: 'shoulder', mirror: true, prim: { t: 'none' }, rot: [0, 0, -140], anim: ['sway'] },
  ...plate('upperArmSlat', 'upperArm', 'S26_slat', 0.045, 0.16, [0, 0, -0.01], { mirror: true, depth: 0.035, rim: 0.012 }),
  { name: 'elbow', parent: 'upperArm', mirror: true, prim: { t: 'none' }, at: [0, 0.16, 0] },
  rivet('elbowPin', 'elbow'),
  { name: 'forearm', parent: 'elbow', mirror: true, prim: { t: 'none' }, rot: [0, 0, 105], anim: ['sway'] },
  ...plate('forearmSlat', 'forearm', 'S26_slat', 0.04, 0.15, [0, 0, -0.015], { mirror: true, depth: 0.035, rim: 0.012 }),
  { name: 'wrist', parent: 'forearm', mirror: true, prim: { t: 'none' }, at: [0, 0.15, -0.012], rot: [0, 0, 10] },
  ...plate('hand', 'wrist', 'S26_hand', 0.085, 0.1, [0, 0, 0], { mirror: true, depth: 0.03, rim: 0.012 }),
  // ---- legs: hip pin -> thigh slat -> knee pin -> shin slat -> pointed foot (dangling) ----
  { name: 'hip', parent: 'cloak', mirror: true, prim: { t: 'none' }, at: [0.075, -0.12, 0.05] },
  rivet('hipPin', 'hip'),
  { name: 'thigh', parent: 'hip', mirror: true, prim: { t: 'none' }, rot: [0, 0, 170], anim: ['gait:L'] },
  ...plate('thighSlat', 'thigh', 'S26_slat', 0.05, 0.2, [0, 0, -0.012], { mirror: true, depth: 0.035, rim: 0.012 }),
  { name: 'knee', parent: 'thigh', mirror: true, prim: { t: 'none' }, at: [0, 0.2, 0] },
  rivet('kneePin', 'knee'),
  { name: 'shin', parent: 'knee', mirror: true, prim: { t: 'none' }, rot: [-15, 0, 16], anim: ['sway'] },
  ...plate('shinSlat', 'shin', 'S26_slat', 0.045, 0.19, [0, 0, -0.012], { mirror: true, depth: 0.035, rim: 0.012 }),
  { name: 'ankle', parent: 'shin', mirror: true, prim: { t: 'none' }, at: [0, 0.195, -0.01], rot: [0, 0, 170] },
  ...plate('foot', 'ankle', 'S26_foot', 0.11, 0.05, [0.03, 0.01, 0], { mirror: true, depth: 0.035, rim: 0.012 }),
];

// ---- ghost-cyan strings: static glowing threads from the crossbar to head, hands and knees ----
// Rest-pose forward kinematics over the part table above (creature's left side; right is mirrored).
function restWorld(name: string, local: V3 = [0, 0, 0]): THREE.Vector3 {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const v = new THREE.Vector3(...local);
  let n: string | undefined = name;
  const DEG = Math.PI / 180;
  while (n && n !== 'root') {
    const p = byName.get(n);
    if (!p) break;
    const r = p.rot ?? [0, 0, 0];
    v.applyEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'));
    v.add(new THREE.Vector3(...(p.at ?? [0, 0, 0])));
    n = p.parent;
  }
  return v;
}
function stringPart(name: string, from: THREE.Vector3, to: THREE.Vector3): PartDef {
  const dir = to.clone().sub(from);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const D = 180 / Math.PI;
  const pv = restWorld('bodyPivot');
  return { name, parent: 'bodyPivot', prim: { t: 'cyl', r: 0.0045, h: dir.length() }, at: [from.x - pv.x, from.y - pv.y, from.z - pv.z], rot: [e.x * D, e.y * D, e.z * D], slot: 'A', emissive: 1.2, opacity: 0.8, mat: 'GLOW' };
}
const bar = restWorld('crossbar');
const targets: [string, THREE.Vector3, THREE.Vector3][] = [
  ['stringHead', restWorld('head', [0, 0.07, 0]), bar.clone()],
  ['stringHand', restWorld('wrist', [0, 0.05, 0]), bar.clone().add(new THREE.Vector3(0.26, 0, 0))],
  ['stringKnee', restWorld('knee'), bar.clone().add(new THREE.Vector3(0.05, 0, -0.15))],
];
for (const [n, a, b] of targets) {
  parts.push(stringPart(n + '_L', a, b));
  if (n !== 'stringHead') parts.push(stringPart(n + '_R', new THREE.Vector3(-a.x, a.y, a.z), new THREE.Vector3(-b.x, b.y, b.z)));
}

export const c26: SpeciesVisual = {
  id: 'c26',
  H: 1.1,
  colors: { P: '#2A2433', S: '#6A5C88', A: '#9EE7F2', D: '#0D0B12' },
  mat: 'PAPER',
  rim: '#9EE7F2',
  rimStrength: 0.5,
  hoverGap: 0.04,
  eye: { shape: 'hole', iris: '#9EE7F2', irisRatio: 1.42, pupil: 'none', highlights: 1, lid: 0, glow: '#9EE7F2', outline: '#9EE7F2' },
  mouth: { style: 'none' },
  rig: { type: 'FLAT', stepped: 12, gaitHz: 1.4, stride: 34, bounce: 0.03, breath: 0.02, breathHz: 0.5, attack: 'dive', special: 'whip', faint: 'collapse', lean: 0 },
  parts,
};
