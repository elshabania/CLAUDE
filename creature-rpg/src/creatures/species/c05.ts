// c05 Kilnhorn — f02 stage 2, fire. Lean, leggy cliff-leaping ram: smoky charcoal mane collar flecked
// with embers, one full glowing-ridged spiral horn per side, chin tuft, short flat tail (design/creatures.md §4 c05).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

// Logarithmic ram spiral in the head frame (sagittal plane, axis ≈ X): heads up, curls back, down
// and forward while drifting outward. Tube points carry X, so each side is built explicitly.
const TURNS = 1.1;
const R0 = 0.14;
const R1 = 0.045;
const DRIFT = 0.11;
function spiralAt(t: number): V3 {
  const th = t * TURNS * Math.PI * 2;
  const r = R0 * Math.pow(R1 / R0, t);
  return [DRIFT * Math.sin(t * Math.PI * 0.5), r * Math.sin(th), -R0 + r * Math.cos(th)];
}
const N = 22;
const HORN: V3[] = Array.from({ length: N + 1 }, (_, i) => spiralAt(i / N));
const HR0 = 0.05;
const HR1 = 0.016;
const D = 180 / Math.PI;

function horn(side: 'L' | 'R'): PartDef[] {
  const sx = side === 'R' ? -1 : 1;
  const m = (p: V3): V3 => [p[0] * sx, p[1], p[2]];
  const parts: PartDef[] = [
    { name: `horn_${side}`, parent: 'head', prim: { t: 'none' }, at: [0.07 * sx, 0.085, -0.03], rot: [0, 0, -12 * sx], anim: side === 'L' ? ['fx:horns'] : [] },
    { name: `hornTube_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: HORN.map(m), r0: HR0, r1: HR1 }, slot: '#C9A27A', mat: 'SHELL' },
  ];
  // 8 emissive ridge rings: torus (axis Z) turned so its axis follows the spiral tangent
  for (let k = 0; k < 8; k++) {
    const t = 0.12 + (k / 7) * 0.8;
    const p = m(spiralAt(t));
    const q = m(spiralAt(t + 0.01));
    const tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2];
    const l = Math.hypot(tx, ty, tz);
    const pitch = Math.atan2(-ty / l, tz / l) * D;
    const yaw = Math.asin(tx / l) * D;
    const rr = HR0 + (HR1 - HR0) * t;
    parts.push({ name: `ridge${k}_${side}`, parent: `horn_${side}`, prim: { t: 'torus', R: rr * 1.02, r: 0.007 }, at: p, rot: [pitch, yaw, 0], slot: 'A', emissive: 1.5, mat: 'GLOW' });
  }
  return parts;
}

export const c05: SpeciesVisual = {
  id: 'c05',
  H: 1.0,
  colors: { P: '#8E2F22', S: '#3B2B26', A: '#FFA431', W: '#B8604A' },
  mat: 'FUR',
  rim: '#FFB070',
  rimStrength: 0.35,
  eye: { shape: 'almond', iris: '#FF9A2E', irisRatio: 0.72, pupil: 'h-bar', pupilRatio: 0.42, highlights: 1, lid: 0.18, lidAngle: -12 },
  mouth: { style: 'line' },
  rig: { type: 'QUAD', gaitHz: 2.2, stride: 40, bounce: 0.08, hop: true, breath: 0.025, breathHz: 0.7, attack: 'rear', special: 'cast', faint: 'side', lean: 5 },
  parts: [
    // --- lean pear torso, chest forward ---
    { name: 'torso', prim: { t: 'none' }, at: [0, 0.6, 0], anim: ['br'] },
    { name: 'torsoMesh', parent: 'torso', prim: { t: 'lathe', profile: 'L_pear', h: 0.62, rmax: 0.17, axis: '-z' }, at: [0, 0, 0.31] },
    { name: 'belly', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.1, 0.24] }, at: [0, -0.07, 0.02], slot: 'W' },
    // --- smoky charcoal mane collar with ember flecks ---
    { name: 'mane', parent: 'torso', prim: { t: 'sphere', r: 0.15 }, at: [0, 0.13, 0.2], slot: 'S', fluffy: 0.014 },
    { name: 'maneNape', parent: 'torso', prim: { t: 'sphere', r: 0.12 }, at: [0, 0.24, 0.33], slot: 'S', fluffy: 0.012 },
    { name: 'maneSide', parent: 'torso', mirror: true, prim: { t: 'sphere', r: 0.13 }, at: [0.11, 0.08, 0.26], slot: 'S', fluffy: 0.012 },
    { name: 'maneChest', parent: 'torso', prim: { t: 'sphere', r: 0.12 }, at: [0, 0.02, 0.35], slot: 'S', fluffy: 0.012 },
    { name: 'ember', parent: 'mane', mirror: true, prim: { t: 'sphere', r: 0.013 }, at: [0.09, 0.1, 0.06], slot: 'A', emissive: 1.8, mat: 'GLOW', lod: 0 },
    { name: 'ember2', parent: 'maneSide', mirror: true, prim: { t: 'sphere', r: 0.011 }, at: [0.1, 0.05, 0.05], slot: 'A', emissive: 1.8, mat: 'GLOW', lod: 0 },
    { name: 'ember3', parent: 'maneChest', mirror: true, prim: { t: 'sphere', r: 0.011 }, at: [0.06, -0.02, 0.11], slot: 'A', emissive: 1.8, mat: 'GLOW', lod: 0 },
    { name: 'ember4', parent: 'maneNape', prim: { t: 'sphere', r: 0.012 }, at: [0, 0.11, 0.03], slot: 'A', emissive: 1.8, mat: 'GLOW', lod: 0 },
    // --- neck + head ---
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.075, len: 0.2, r2: 0.065 }, at: [0, 0.08, 0.3], rot: [40, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.11, 0.115, 0.15] }, at: [0, 0.3, 0.02], rot: [-30, 0, 0], anim: ['look'] },
    { name: 'muzzle', parent: 'head', prim: { t: 'capsule', r: 0.066, len: 0.03, r2: 0.058 }, at: [0, -0.045, 0.07], rot: [100, 0, 0], slot: 'W' },
    { name: 'nostril', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.012, 0.018, 0.008] }, at: [0.03, 0.14, 0.035], slot: 'D', lod: 0, anim: ['fx:nostrils'] },
    { name: 'jaw', parent: 'head', prim: { t: 'capsule', r: 0.045, len: 0.04 }, at: [0, -0.1, 0.05], rot: [95, 0, 0], slot: 'W', anim: ['jaw'] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.03, w: 1.5 }, at: [0, -0.085, 0.19], rot: [30, 0, 0] },
    { name: 'chinTuft', parent: 'jaw', prim: { t: 'cone', r: 0.035, h: 0.1 }, at: [0, 0.08, -0.03], rot: [150, 0, 0], slot: 'S' },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.048 }, at: [0.075, 0.035, 0.085], rot: [0, 38, 0], scale: [1.2, 1, 1] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.018, len: 0.05 }, at: [0.03, 0.078, 0.105], rot: [20, 35, -100], slot: 'S' },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.028, len: 0.07 }, at: [0.09, 0.03, -0.05], rot: [0, 20, -95], scale: [1, 1, 0.45], anim: ['sway'] },
    ...horn('L'),
    ...horn('R'),
    // --- long goat legs: upper, cannon, pastern, hoof ---
    { name: 'legF', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.055, len: 0.14, r2: 0.04 }, at: [0.09, -0.08, 0.2], rot: [185, 0, 4], anim: ['gait:FL'] },
    { name: 'cannonF', parent: 'legF', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.17 }, at: [0, 0.2, 0], rot: [-12, 0, 0] },
    { name: 'pasternF', parent: 'cannonF', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.05 }, at: [0, 0.22, 0], rot: [-20, 0, 0] },
    { name: 'hoofF', parent: 'pasternF', mirror: true, prim: { t: 'cyl', r: 0.028, h: 0.04, r2: 0.034 }, at: [0, 0.08, 0], rot: [20, 0, 0], slot: 'D', emissive: 0.25, glowColor: 'A' },
    { name: 'legB', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.065, len: 0.14, r2: 0.045 }, at: [0.09, -0.06, -0.2], rot: [160, 0, 4], anim: ['gait:BL'] },
    { name: 'cannonB', parent: 'legB', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.18 }, at: [0, 0.21, 0], rot: [48, 0, 0] },
    { name: 'pasternB', parent: 'cannonB', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.05 }, at: [0, 0.23, 0], rot: [-32, 0, 0] },
    { name: 'hoofB', parent: 'pasternB', mirror: true, prim: { t: 'cyl', r: 0.028, h: 0.04, r2: 0.034 }, at: [0, 0.08, 0], rot: [4, 0, 0], slot: 'D', emissive: 0.25, glowColor: 'A' },
    // --- short flat tail ---
    { name: 'tail', parent: 'torso', prim: { t: 'capsule', r: 0.035, len: 0.06 }, at: [0, 0.07, -0.3], rot: [-60, 0, 0], scale: [1.3, 1, 0.5], slot: 'S', anim: ['sway'] },
  ],
};
