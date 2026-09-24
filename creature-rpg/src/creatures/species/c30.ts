// c30 Coronaleen (formerly Umbraleen; DECISIONS D7) — f10 stage 3, lumen/shade. Vast floating baleen whale with a
// rotating eclipse corona on its forehead (design/creatures.md §4 c30). Family motif: lateral light-stripe (here a
// row of glowing spots), crescent dorsal fin, pale belly. Never wings, never white/blue, no crescent-moon silhouette.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

type P2 = [number, number];
// H = 1.75 m so the whale is ~4.8 m nose-to-fluke (2.45 H body + 0.3 H flukes).
const RMAX = 0.42;
const LB = 2.45;
const Z0 = 1.2; // snout z
const Y0 = 0.45; // body axis height
const R_CTRL: P2[] = [[0, 0.5], [0.04, 0.78], [0.12, 0.93], [0.28, 1], [0.48, 0.9], [0.66, 0.62], [0.82, 0.36], [0.93, 0.2], [1, 0.13]];
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
const SPLIT = [0, 0.24, 0.44, 0.63, 0.81, 1];
const NSEG = 5;
const OV = 0.12;
const segLen = (i: number) => (SPLIT[i + 1] - SPLIT[i]) * LB;
/** Skin profile covering segments i..j (inclusive), extending backwards from segment i's front. */
function segProfile(i: number, j = i): { pts: P2[]; h: number } {
  const s0 = SPLIT[i], s1 = SPLIT[j + 1];
  const ov = j < NSEG - 1 ? OV : 0;
  const L = (s1 - s0) * LB;
  const h = L + ov;
  // Later segments start slightly inside the previous one (x0.96) so the joint shows no lip; each segment's
  // overlap runs on at full radius, then tucks in under the next segment.
  const pts: P2[] = i === 0 ? [[0, 0]] : [];
  const n = 4 * (j - i + 1);
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * L;
    const r = rOf(Math.min(1, s0 + d / LB)) * (i > 0 && k === 0 ? 0.96 : 1);
    pts.push([r, i === 0 ? Math.max(0.002, d / h) : d / h]);
  }
  if (ov) {
    pts.push([rOf(Math.min(1, s1 + (ov * 0.6) / LB)), (L + ov * 0.6) / h]);
    pts.push([rOf(Math.min(1, s1 + ov / LB)) * 0.9, 0.998]);
  }
  pts.push([0, 1]);
  return { pts, h };
}
/** Which segment holds body station s, and the local z there (segments extend toward −z from their front). */
function station(s: number): { seg: number; z: number } {
  let i = 0;
  while (i < NSEG - 1 && s > SPLIT[i + 1]) i++;
  return { seg: i, z: -(s - SPLIT[i]) * LB };
}
/** Euler (deg, XYZ) that maps shape axes X/Y/Z onto the given world directions (Y and Z are orthogonalised). */
function basisRot(yAxis: V3, zHint: V3): V3 {
  const Y = new THREE.Vector3(...yAxis).normalize();
  const Z = new THREE.Vector3(...zHint);
  Z.sub(Y.clone().multiplyScalar(Z.dot(Y))).normalize();
  const X = Y.clone().cross(Z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z), 'XYZ');
  const D = 180 / Math.PI;
  return [e.x * D, e.y * D, e.z * D];
}

const SH = SHAPES as Record<string, () => THREE.Shape>;
// humpback flipper: root at origin, +Y along the fin, leading edge (+x) with 6 knobs
SH.S30_flipper = () => {
  const lead: P2[] = [];
  for (let k = 0; k <= 12; k++) {
    const y = 0.06 + (k / 12) * 0.86;
    const x = 0.46 - 0.36 * y + (k % 2 ? 0.07 : 0);
    lead.push([x, y]);
  }
  const pts: P2[] = [[-0.3, 0], [0.4, 0.0], ...lead, [0.1, 1], [-0.05, 0.9], [-0.28, 0.55], [-0.45, 0.2]];
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return new THREE.Shape(c.getPoints(56).map((p) => new THREE.Vector2(p.x, p.y)));
};
// small sickle dorsal fin, root on y = 0, sweeping back toward +x
SH.S30_dorsal = () => {
  const c = new THREE.CatmullRomCurve3([[0, 0], [0.3, 0.45], [0.7, 0.85], [1, 1], [0.8, 0.5], [0.85, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return new THREE.Shape(c.getPoints(20).map((p) => new THREE.Vector2(p.x, p.y)));
};
// broad horizontal flukes with a centre notch (unit box: span along x, root at y = 0 toward +y = back)
SH.S30_flukes = () => {
  const half: P2[] = [[0, 0.12], [0.08, 0.05], [0.25, 0.1], [0.42, 0.3], [0.5, 0.62], [0.44, 0.78], [0.3, 0.72], [0.12, 0.8], [0.03, 0.95], [0, 0.88]];
  const pts = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return new THREE.Shape(c.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y)));
};

const parts: PartDef[] = [];
for (let i = 0; i < NSEG; i++) {
  // head + chest share one rigid skin on seg0 (seg1 stays a chain node carrying the flippers) to avoid a seam
  const { pts, h } = segProfile(i, i === 0 ? 1 : i);
  const name = 'seg' + i;
  parts.push({ name, parent: i === 0 ? 'root' : 'seg' + (i - 1), prim: { t: 'none' }, at: i === 0 ? [0, Y0, Z0] : [0, 0, -segLen(i - 1)], anim: i === 0 ? ['br', 'fx:body'] : ['wave', `chain:${i}:${NSEG}`] });
  // head segment is broader and flatter; seg1 eases back to round so the neck joint has no step
  // (spec x ×1.1, y ×0.85 on the head alone produced a visible ledge at the joint)
  const sc: V3 = i === 0 ? [1.06, 1, 0.92] : [1, 1, 1];
  if (i !== 1) parts.push({ name: name + 'Skin', parent: name, prim: { t: 'lathe', profile: pts, h, rmax: RMAX }, rot: [-90, 0, 0], scale: sc });
  // pale lavender belly: a narrower copy dropped so only the underside shows
  if (i === 0 || i === 2 || i === 3) parts.push({ name: name + 'Belly', parent: name, prim: { t: 'lathe', profile: pts, h: i === 0 ? h - 0.3 : h, rmax: RMAX }, at: [0, -0.07, i === 0 ? -0.3 : 0], rot: [-90, 0, 0], scale: i === 0 ? [0.92, 1, 0.92] : [0.9, 1, 0.9], slot: 'S' });
}
// lower jaw (hinged at the back, opens 15°) in belly lavender with throat grooves
const JAW: V3 = [0.4, 0.17, 0.52];
parts.push({ name: 'jawHinge', parent: 'seg0', prim: { t: 'none' }, at: [0, -0.2, -0.82], anim: ['jaw', 'fx:mouth'] });
parts.push({ name: 'jaw', parent: 'jawHinge', prim: { t: 'sphere', r: JAW, half: true }, at: [0, 0, 0.32], rot: [180, 0, 0], slot: 'S' });
for (const gx of [0.07, 0.2]) {
  const pts: V3[] = [-0.4, -0.2, 0, 0.2, 0.38].map((z) => {
    const k = Math.sqrt(Math.max(0, 1 - (gx / JAW[0]) ** 2 - (z / JAW[2]) ** 2));
    return [gx, JAW[1] * k + 0.004, z] as V3;
  });
  parts.push({ name: 'groove' + Math.round(gx * 100), parent: 'jaw', mirror: true, prim: { t: 'tube', pts, r0: 0.01, r1: 0.008 }, slot: 'S-', lod: 0 });
}
// dark jawline crease from the snout back to the mouth corner
parts.push({ name: 'jawline', parent: 'seg0', mirror: true, prim: { t: 'tube', pts: [[0.27, -0.19, -0.1], [0.4, -0.2, -0.3], [0.45, -0.16, -0.52], [0.44, -0.1, -0.66]], r0: 0.012, r1: 0.016 }, slot: 'D' });
// small kind eyes set low near the mouth corner
parts.push({ name: 'eye', parent: 'seg0', mirror: true, prim: { t: 'eye', r: 0.088 }, at: [0.428, 0.0, -0.64], rot: [0, 78, 0] });
// eclipse crown: dark disc ringed by a slowly rotating 12-ray corona, standing up from the forehead
parts.push({ name: 'crown', parent: 'seg0', prim: { t: 'none' }, at: [0, 0.34, -0.42], rot: [50, 0, 0] });
parts.push({ name: 'eclipse', parent: 'crown', prim: { t: 'cyl', r: 0.21, h: 0.03 }, at: [0, 0.01, 0], slot: 'D', mat: 'SHELL' });
parts.push({ name: 'eclipseRing', parent: 'crown', prim: { t: 'torus', R: 0.215, r: 0.014 }, at: [0, 0.03, 0], rot: [-90, 0, 0], slot: 'A', emissive: 1.5, mat: 'GLOW' });
parts.push({ name: 'coronaSpin', parent: 'crown', prim: { t: 'none' }, anim: ['spin', 'fx:corona'] });
parts.push({ name: 'corona', parent: 'coronaSpin', prim: { t: 'extrude', shape: 'X_corona', w: 0.9, h: 0.9, depth: 0.02 }, at: [0, 0.0, 0], rot: [-90, 0, 0], slot: 'A', emissive: 1.5, mat: 'GLOW' });
// long knobbly pectoral flippers with glowing edges (explicit L/R so the knobbed leading edge faces forward on both)
{
  const at: V3 = [0.36, -0.2, -0.2];
  const rot = basisRot([0.72, -0.42, -0.5], [0.3, 1, 0.1]);
  for (const side of [1, -1]) {
    const n = side > 0 ? '_L' : '_R';
    parts.push({ name: 'pectoral' + n, parent: 'seg1', prim: { t: 'none' }, at: [at[0] * side, at[1], at[2]], rot: [rot[0], rot[1] * side, rot[2] * side], scale: [side, 1, 1], anim: ['flap'] });
    parts.push({ name: 'flipper' + n, parent: 'pectoral' + n, prim: { t: 'extrude', shape: 'S30_flipper', w: 0.22, h: 0.9, depth: 0.045 } });
    parts.push({ name: 'flipperEdge' + n, parent: 'pectoral' + n, prim: { t: 'extrude', shape: 'S30_flipper', w: 0.245, h: 0.93, depth: 0.018 }, at: [0.004, -0.01, 0], slot: 'A', emissive: 1.1 });
  }
}
// row of 5 glowing lateral spots per side (the family light-stripe)
[0.34, 0.43, 0.52, 0.61, 0.7].forEach((s, k) => {
  const { seg, z } = station(s);
  const r = rOf(s) * RMAX;
  parts.push({ name: 'spot' + k, parent: 'seg' + seg, mirror: true, prim: { t: 'cyl', r: 0.034 - k * 0.003, h: 0.014 }, at: [r - 0.006, -0.02, z], rot: [0, 0, -90], slot: 'A', emissive: 1.4, mat: 'GLOW' });
});
// star flecks scattered over the back (tiny flat emissive studs)
[[0.1, 30], [0.2, -40], [0.3, 10], [0.36, 55], [0.47, -20], [0.55, 35], [0.62, -60], [0.7, 5]].forEach(([s, a], k) => {
  const { seg, z } = station(s);
  const r = rOf(s) * RMAX * (seg === 0 ? 0.9 : 1);
  const ar = (a * Math.PI) / 180;
  parts.push({ name: 'fleck' + k, parent: 'seg' + seg, prim: { t: 'cone', r: 0.013, h: 0.006 }, at: [Math.sin(ar) * r * 0.99, Math.cos(ar) * r * 0.99, z], rot: [0, 0, -a], slot: 'A', emissive: 1.5, mat: 'GLOW', lod: 0 });
});
// tiny crescent dorsal fin and broad horizontal flukes
{
  const { seg, z } = station(0.74);
  parts.push({ name: 'dorsal', parent: 'seg' + seg, prim: { t: 'extrude', shape: 'S30_dorsal', w: 0.22, h: 0.12, depth: 0.03 }, at: [0, rOf(0.74) * RMAX - 0.02, z + 0.08], rot: [0, 90, 0] });
}
parts.push({ name: 'flukeRoot', parent: 'seg4', prim: { t: 'none' }, at: [0, 0, -segLen(4) + 0.04], anim: ['fx:tail'] });
parts.push({ name: 'flukes', parent: 'flukeRoot', prim: { t: 'extrude', shape: 'S30_flukes', w: 0.95, h: 0.34, depth: 0.04 }, rot: [-90, 0, 0] });

export const c30: SpeciesVisual = {
  id: 'c30',
  H: 1.75,
  colors: { P: '#2A2552', S: '#C9C3E6', A: '#FFE8A3', D: '#0B0A12' },
  mat: 'SCALE',
  rim: '#D9D0FF',
  rimStrength: 0.3,
  hoverGap: 0.25,
  eye: { shape: 'round', iris: '#FFE8A3', irisRatio: 0.7, pupil: 'ring', pupilRatio: 0.4, highlights: 2, lid: 0.22, lidAngle: 6, outline: '#FFE8A3' },
  mouth: { style: 'none' },
  rig: { type: 'FLOAT', waveAxis: 'pitch', waveAmp: 4, waveHz: 0.25, flapAmp: 12, flapHz: 0.3, breath: 0.012, breathHz: 0.25, spinHz: 0.028, attack: 'slam', special: 'cast', faint: 'sink', lean: 0 },
  parts,
};
