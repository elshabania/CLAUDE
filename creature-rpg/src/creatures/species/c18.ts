// c18 Borealoop — f06 stage 3, frost/lumen. Floating near-closed vertical ring-coil serpent (the tail tucks in
// under the chin with a gap — not tail-biting), ten aurora ribbon-plumes streaming from the outer edge, a
// glowing six-armed flake core at the centre and two small clawed forelimbs near the head
// (design/creatures.md §4 c18; silhouette §7.3: ring hole, circular outline with trailing plumes, bright centre).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const DEG = 180 / Math.PI;
const rad = (a: number) => a / DEG;
type Vec = [number, number, number];
const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Euler that turns local +Z onto direction d. */
function faceDir(d: Vec, roll = 0): V3 {
  const [x, y, z] = norm(d);
  return [Math.atan2(-y, z) * DEG, Math.asin(x) * DEG, roll];
}
/** Euler XYZ (deg) whose local +Y maps to `yDir` and local +X lies as close as possible to `xHint`. */
function basisEuler(yDir: Vec, xHint: Vec): V3 {
  const y = norm(yDir);
  const z = norm(cross(xHint, y));
  const x = cross(y, z);
  const m11 = x[0], m12 = y[0], m13 = z[0], m22 = y[1], m23 = z[1], m32 = y[2], m33 = z[2];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999) return [Math.atan2(-m23, m33) * DEG, ry * DEG, Math.atan2(-m12, m11) * DEG];
  return [Math.atan2(m32, m22) * DEG, ry * DEG, 0];
}
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const RING_R = 0.34;
const N = 16;
const TH0 = 28; // neck angle (deg from the top, towards the front)
const STEP = 20.8; // segments run back over the top and round; the tail ends at ≈ 81° (under the chin)
const th = (i: number) => TH0 - i * STEP;
const ringPos = (t: number, r = RING_R): Vec => [0, Math.cos(rad(t)) * r, Math.sin(rad(t)) * r];
const segR = (i: number) => 0.1 - (0.045 * i) / (N - 1);

const ring: PartDef[] = [];
for (let i = 0; i < N; i++) {
  const t = th(i);
  const r = segR(i);
  const tan: Vec = [0, -Math.sin(rad(t)), Math.cos(rad(t))];
  // pill segments along the ring tangent (capsule base at origin → shift back by half its length)
  const half = 0.03 + r;
  const c = ringPos(t);
  ring.push({ name: `seg${i}`, parent: 'ringP', prim: { t: 'capsule', r, len: 0.06 }, at: [0, c[1] - tan[1] * half, c[2] - tan[2] * half], rot: [Math.atan2(tan[2], tan[1]) * DEG, 0, 0], slot: 'P' });
  // emissive star flecks on the outer face (tiny boxes: cheap)
  if (i % 2 === 1 || i === 4 || i === 10) {
    const o = ringPos(t + 4, RING_R + r * 0.92);
    ring.push({ name: `star${i}`, parent: 'ringP', prim: { t: 'box', w: 0.018, h: 0.018, d: 0.018 }, at: [((i * 37) % 5) * 0.012 - 0.024, o[1], o[2]], rot: [45, 45, 0], slot: 'S', mat: 'GLOW', emissive: 1.5, lod: 0 });
  }
}
// tail tip: a small tapering cone continuing along the ring
{
  const t = th(N - 1) - STEP * 0.45;
  const tan: Vec = [0, Math.sin(rad(t)), -Math.cos(rad(t))];
  ring.push({ name: 'tailTipP', parent: 'ringP', prim: { t: 'none' }, at: ringPos(t), rot: faceDir(tan) });
  ring.push({ name: 'tailTip', parent: 'tailTipP', prim: { t: 'cone', r: 0.045, h: 0.08 }, rot: [90, 0, 0], slot: 'P' });
}

// ten aurora plumes on segments 3–14: two strips each (green root, tip shading towards violet round the ring)
const PLUME_SEGS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14];
const plumes: PartDef[] = [];
PLUME_SEGS.forEach((si, k) => {
  const t = th(si);
  const radial: Vec = [0, Math.cos(rad(t)), Math.sin(rad(t))];
  const dir = norm([0, radial[1] * 0.55 + 0.25, radial[2] * 0.55 - 1]);
  const xHint: Vec = [0, -dir[2], dir[1]];
  const len = 0.55 + 0.35 * Math.sin((k / (PLUME_SEGS.length - 1)) * Math.PI) + (k % 2) * 0.08;
  const name = `plume${k}`;
  plumes.push({ name, parent: 'ringP', prim: { t: 'extrude', shape: 'X_strip', w: 0.85, h: len * 0.55, depth: 0.006 }, at: ringPos(t, RING_R + segR(si) * 0.6), rot: basisEuler(dir, xHint), slot: '#47E6A8', mat: 'GLOW', emissive: 1.3, opacity: 0.8, anim: ['sway'] });
  plumes.push({ name: `${name}t`, parent: name, prim: { t: 'extrude', shape: 'X_strip', w: 0.7, h: len * 0.5, depth: 0.006 }, at: [0, len * 0.5, 0], rot: [0, 0, k % 2 ? 9 : -9], slot: lerpHex('#47E6A8', '#B266FF', 0.35 + 0.65 * (k / (PLUME_SEGS.length - 1))), mat: 'GLOW', emissive: 1.4, opacity: 0.75, anim: ['sway'] });
});

// head at the neck, pointing forward and slightly down
const NECK = ringPos(TH0 + 8, RING_R + 0.01);

export const c18: SpeciesVisual = {
  id: 'c18',
  H: 1.8,
  colors: { P: '#1B2A4A', A: '#47E6A8', S: '#E8F7FF' },
  mat: 'SCALE',
  rim: '#9FFFD9',
  rimStrength: 0.5,
  eye: { shape: 'almond', sclera: '#0E3A3A', iris: '#47E6A8', irisRatio: 0.9, pupil: 'v-oval', pupilRatio: 0.5, highlights: 2, lid: 0.1, glow: '#47E6A8', outline: '#7FF2C4' },
  mouth: { style: 'line', color: '#9FFFD9' },
  hoverGap: 0.3,
  rig: { type: 'FLOAT', breath: 0.02, breathHz: 0.35, attack: 'spin', special: 'cast', faint: 'sink', spinHz: 0.06, lean: 0 },
  parts: [
    { name: 'ringP', prim: { t: 'none' }, at: [0, 0.42, 0], anim: ['sway', 'br'] },
    // continuous spine arc under the segment spheres (fills the joints so the ring reads as one body)
    { name: 'spine', parent: 'ringP', prim: { t: 'torus', R: RING_R, r: 0.056, arc: (N - 1) * STEP }, rot: [0, 90, th(N - 1) + 90], slot: 'P' },
    ...ring,
    { name: 'headP', parent: 'ringP', prim: { t: 'none' }, at: NECK, rot: faceDir([0, -0.18, 1]), scale: [1.35, 1.35, 1.35], anim: ['look', 'fx:head'] },
    { name: 'head', parent: 'headP', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.34, rmax: 0.115, axis: 'z' }, at: [0, 0, -0.06], scale: [1, 0.88, 1], slot: 'P' },
    { name: 'chin', parent: 'headP', prim: { t: 'sphere', r: [0.06, 0.03, 0.1] }, at: [0, -0.055, 0.1], slot: 'P+' },
    { name: 'eye', parent: 'headP', mirror: true, prim: { t: 'eye', r: 0.05 }, at: [0.072, 0.034, 0.085], rot: [-6, 50, 0], scale: [1.35, 1.05, 1] },
    { name: 'mouth', parent: 'headP', prim: { t: 'mouth', r: 0.035, w: 2 }, at: [0, -0.04, 0.21], rot: [45, 0, 0], anim: ['fx:mouth'] },
    { name: 'crest', parent: 'headP', mirror: true, prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.24, h: 0.2, depth: 0.018 }, at: [0.045, 0.07, 0.07], rot: [-24, 90, 16], slot: 'S', mat: 'ICE', opacity: 0.85, emissive: 0.4 },
    // small clawed forelimbs just behind the head, reaching down to hold the ring rim
    { name: 'arm', parent: 'ringP', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.07 }, at: [0.075, NECK[1] - 0.04, NECK[2] - 0.05], rot: [140, 0, 22], slot: 'P' },
    { name: 'clawA', parent: 'arm', mirror: true, prim: { t: 'cone', r: 0.009, h: 0.035 }, at: [0, 0.11, 0.012], rot: [30, 0, 0], slot: 'S' },
    { name: 'clawB', parent: 'arm', mirror: true, prim: { t: 'cone', r: 0.009, h: 0.035 }, at: [0.012, 0.11, -0.004], rot: [20, 0, -25], slot: 'S' },
    { name: 'clawC', parent: 'arm', mirror: true, prim: { t: 'cone', r: 0.009, h: 0.035 }, at: [-0.012, 0.11, -0.004], rot: [20, 0, 25], slot: 'S' },
    ...plumes,
    // glowing six-armed flake core, two flakes crossed at 90° plus a bright sphere
    { name: 'core', parent: 'ringP', prim: { t: 'sphere', r: 0.07 }, slot: 'S', mat: 'GLOW', emissive: 1.5, anim: ['spin', 'fx:core'] },
    { name: 'flakeA', parent: 'core', prim: { t: 'extrude', shape: 'X_flake6', w: 0.36, h: 0.36, depth: 0.05 }, slot: 'S', mat: 'GLOW', emissive: 1.5 },
    { name: 'flakeB', parent: 'core', prim: { t: 'extrude', shape: 'X_flake6', w: 0.36, h: 0.36, depth: 0.05 }, rot: [0, 90, 0], slot: 'S', mat: 'GLOW', emissive: 1.5 },
  ],
};
