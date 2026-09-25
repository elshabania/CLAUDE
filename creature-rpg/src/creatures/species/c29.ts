// c29 Lumarlin — f10 stage 2, lumen. Streamlined air-swimming marlin with a glowing light-bill
// (design/creatures.md §4 c29). Family motif: bright lateral light-stripe, crescent dorsal (here the tall sail), pale belly.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual } from '../assemble';
import { SHAPES } from '../primitives';

type P2 = [number, number];
const RMAX = 0.2; // body radius (×H)
const LB = 1.5; // body length nose→peduncle (×H); + bill 0.75 + tail ≈ 2.5 H = 2.0 m
const Z0 = 0.72; // z of the nose (body front)
// spindle radius along the body, s = 0 at the nose, 1 at the peduncle (in units of RMAX)
const R_CTRL: P2[] = [[0, 0.16], [0.06, 0.52], [0.2, 0.9], [0.34, 1], [0.55, 0.84], [0.75, 0.52], [0.9, 0.27], [1, 0.16]];
function rOf(s: number): number {
  for (let i = 1; i < R_CTRL.length; i++) {
    const [s0, r0] = R_CTRL[i - 1], [s1, r1] = R_CTRL[i];
    if (s <= s1) {
      const t = (s - s0) / (s1 - s0);
      return r0 + (r1 - r0) * (t * t * (3 - 2 * t));
    }
  }
  return R_CTRL[R_CTRL.length - 1][1];
}
const SPLIT = [0, 0.26, 0.5, 0.74, 1];
const OV = 0.08; // overlap into the next segment (×H) so joints never open while the body waves
const segLen = (i: number) => (SPLIT[i + 1] - SPLIT[i]) * LB;

/** Lathe profile (r in RMAX units, h normalised) for body segment i, extending backwards from its front. */
function segProfile(i: number): { pts: P2[]; h: number } {
  const s0 = SPLIT[i], s1 = SPLIT[i + 1];
  const ov = i < 3 ? OV : 0;
  const h = segLen(i) + ov;
  // only the nose segment gets a front cap; later segments start open inside the previous segment's overlap
  const pts: P2[] = i === 0 ? [[0, 0]] : [];
  const n = 4;
  const len = segLen(i);
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * len; // distance behind segment front
    pts.push([rOf(Math.min(1, s0 + d / LB)), i === 0 ? Math.max(0.002, d / h) : d / h]);
  }
  // overlap tucks slightly inside the next segment so no ridge shows at the joint
  if (ov) pts.push([rOf(Math.min(1, s1 + ov / LB)) * 0.93, 1 - 0.002]);
  pts.push([0, 1]);
  return { pts, h };
}
/** Light-stripe band for segment i, as a top-view outline (x out from the axis, y = distance back), ×H. */
function bandShape(i: number): THREE.Shape {
  const s0 = Math.max(SPLIT[i], 0.1), s1 = Math.min(SPLIT[i + 1] + (i < 3 ? 0.02 : 0), 0.92);
  const n = 8;
  const outer: P2[] = [], inner: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n;
    const y = (s - SPLIT[i]) * LB;
    const r = rOf(s) * RMAX;
    outer.push([r + 0.005, y]);
    inner.push([r - 0.025, y]);
  }
  return new THREE.Shape([...outer, ...inner.reverse()].map(([x, y]) => new THREE.Vector2(x, y)));
}
const SH = SHAPES as Record<string, () => THREE.Shape>;
for (let i = 0; i < 4; i++) SH['S29_band' + i] = () => bandShape(i);
// long sickle pectoral (root at origin, +Y along the fin)
SH.S29_sickle = () => {
  const c = new THREE.CatmullRomCurve3([[-0.3, 0], [0.35, 0.05], [0.5, 0.4], [0.3, 0.8], [0, 1], [0.05, 0.6], [-0.2, 0.25]].map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return new THREE.Shape(c.getPoints(30).map((p) => new THREE.Vector2(p.x, p.y)));
};

const parts: PartDef[] = [];
for (let i = 0; i < 4; i++) {
  const { pts, h } = segProfile(i);
  const name = 'seg' + i;
  const tags = i === 0 ? ['br', 'look', 'fx:body'] : ['wave', `chain:${i}:4`];
  parts.push({ name, parent: i === 0 ? 'root' : 'seg' + (i - 1), prim: { t: 'lathe', profile: pts, h, rmax: RMAX, axis: '-z' }, at: i === 0 ? [0, 0.3, Z0] : [0, 0, -segLen(i - 1)], anim: tags });
  // periwinkle back: a slightly narrower copy lifted so only the top shows
  parts.push({ name: name + 'Back', parent: name, prim: { t: 'lathe', profile: pts, h, rmax: RMAX }, at: [0, 0.03, 0], rot: [-90, 0, 0], scale: [0.93, 1, 0.95], slot: 'S' });
  // bright lateral light-stripe on both flanks
  parts.push({ name: name + 'StripeL', parent: name, prim: { t: 'extrude', shape: 'S29_band' + i, w: 1, h: 1, depth: 0.03 }, rot: [-90, 0, 0], slot: 'A', emissive: 1.3, mat: 'GLOW' });
  parts.push({ name: name + 'StripeR', parent: name, prim: { t: 'extrude', shape: 'S29_band' + i, w: 1, h: 1, depth: 0.03 }, rot: [90, 0, 180], slot: 'A', emissive: 1.3, mat: 'GLOW' });
}
parts.push(
  // glowing gold light-bill
  { name: 'bill', parent: 'seg0', prim: { t: 'cone', r: 0.03, h: 0.76 }, at: [0, -0.005, -0.03], rot: [90, 0, 0], slot: 'A', emissive: 1.5, anim: ['fx:bill'] },
  { name: 'billBase', parent: 'seg0', prim: { t: 'sphere', r: [0.045, 0.04, 0.06] }, at: [0, -0.005, -0.02], slot: 'A', emissive: 1.0 },
  // face: sleek almond eyes with a painted brow stripe, thin mouth line under the bill base
  { name: 'eye', parent: 'seg0', mirror: true, prim: { t: 'eye', r: 0.085 }, at: [0.132, 0.045, -0.21], rot: [-6, 62, 0] },
  { name: 'brow', parent: 'seg0', mirror: true, prim: { t: 'capsule', r: 0.011, len: 0.07 }, at: [0.118, 0.098, -0.14], rot: [100, 0, -8], slot: 'S-' },
  { name: 'mouth', parent: 'seg0', prim: { t: 'mouth', r: 0.04, w: 1.6, bulge: 0.1 }, at: [0, -0.07, -0.085], rot: [35, 0, 0] },
  // tall crescent sail (folds flat at speed) with a glowing leading edge
  { name: 'sailHinge', parent: 'seg1', prim: { t: 'none' }, at: [0, 0.18, 0.1], anim: ['sway'] },
  { name: 'sail', parent: 'sailHinge', prim: { t: 'extrude', shape: 'X_sailfin', w: 0.72, h: 0.5, depth: 0.012 }, rot: [0, 90, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.9 },
  { name: 'sailSpine', parent: 'sailHinge', prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.35, -0.04], [0, 0.49, -0.13], [0, 0.46, -0.2]], r0: 0.012, r1: 0.006 }, slot: 'A', emissive: 0.9 },
  // long sickle pectorals, small pelvic fins
  { name: 'pectoral', parent: 'seg0', mirror: true, prim: { t: 'extrude', shape: 'S29_sickle', w: 0.1, h: 0.38, depth: 0.012 }, at: [0.14, -0.09, -0.3], rot: [0, 48, -108], slot: 'S', mat: 'MEMBRANE', opacity: 0.9, anim: ['flap'] },
  { name: 'pelvic', parent: 'seg1', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.11 }, at: [0.05, -0.17, -0.12], rot: [-125, 0, -15], slot: 'S' },
  { name: 'analFin', parent: 'seg2', prim: { t: 'extrude', shape: 'X_tri', w: 0.1, h: 0.12, depth: 0.01 }, at: [0, -0.1, -0.2], rot: [180, 90, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.9 },
  // sickle (lunate) tail at the peduncle
  { name: 'tailRoot', parent: 'seg3', prim: { t: 'none' }, at: [0, 0, -segLen(3) + 0.02], anim: ['fx:tail'] },
  { name: 'tail', parent: 'tailRoot', prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.26, h: 0.6, depth: 0.018 }, at: [0, -0.3, -0.25], rot: [0, -90, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.95 },
);

export const c29: SpeciesVisual = {
  id: 'c29',
  H: 0.8,
  colors: { P: '#F2F0FF', S: '#8BA6E8', A: '#FFD86B', D: '#2A2A40' },
  mat: 'SHELL',
  rim: '#FFF3C4',
  rimStrength: 0.5,
  hoverGap: 0.3,
  eye: { shape: 'almond', iris: '#FFD86B', irisRatio: 0.66, pupil: 'round', pupilRatio: 0.35, highlights: 1, lid: 0.12, lidAngle: -8 },
  mouth: { style: 'line', color: '#4A4A6A', inner: '#5A4A7A' },
  rig: { type: 'FLOAT', waveAxis: 'yaw', waveAmp: 7, waveHz: 0.6, flapAmp: 14, flapHz: 0.9, breath: 0.015, breathHz: 0.5, attack: 'lunge', special: 'cast', faint: 'sink', lean: 0 },
  parts,
};
