// c02 Crackleap — f01 stage 2, electric. Forward-leaning digitigrade biped sprinter with
// forearm-to-hip rib sails and a long counterbalance tail ending in a wide fork (design/creatures.md §4 c02).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

// Sail outline (X_sail): +Y edge runs along the arm, +X edge runs back toward the hip.
const SAIL_W = 0.36; // span toward the hip
const SAIL_H = 0.46; // along the arm (shoulder -> wrist)
const arc = (n: number, k: number): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * (Math.PI / 2);
    return [Math.sin(a) * SAIL_W * k, Math.cos(a) * SAIL_H * k, 0] as V3;
  });

// The X_sail outline is chiral and lies in a sagittal plane, so the automatic mirror (which
// negates yaw/roll but cannot reflect geometry) would point the right sail forward. Build each
// side explicitly: the right side is the left transform with a local X reflection (scale -1).
function sail(side: 'L' | 'R'): PartDef[] {
  const R = side === 'R';
  const n = (b: string) => `${b}_${side}`;
  return [
    { name: n('sail'), parent: n('arm'), prim: { t: 'extrude', shape: 'X_sail', w: SAIL_W, h: SAIL_H, depth: 0.015 }, at: [0, 0.02, -0.01], rot: [0, R ? 90 : -90, 0], scale: [R ? -1 : 1, 1, 1], mat: 'MEMBRANE', opacity: 0.9 },
    { name: n('sailRib'), parent: n('sail'), prim: { t: 'tube', pts: [[0, 0, 0], [0.09, 0.2, 0], [0.18, 0.38, 0]], r0: 0.012, r1: 0.006 }, slot: 'P-', lod: 0 },
    { name: n('sailRib2'), parent: n('sail'), prim: { t: 'tube', pts: [[0, 0, 0], [0.15, 0.16, 0], [0.27, 0.29, 0]], r0: 0.012, r1: 0.006 }, slot: 'P-', lod: 0 },
    { name: n('sailRib3'), parent: n('sail'), prim: { t: 'tube', pts: [[0, 0, 0], [0.18, 0.08, 0], [0.33, 0.13, 0]], r0: 0.012, r1: 0.006 }, slot: 'P-', lod: 0 },
    { name: n('sailSeam'), parent: n('sail'), prim: { t: 'tube', pts: arc(10, 0.975), r0: 0.013, r1: 0.013 }, slot: 'A', emissive: 0.8, mat: 'GLOW' },
  ];
}

export const c02: SpeciesVisual = {
  id: 'c02',
  H: 0.9,
  colors: { P: '#23607E', A: '#F5C518', W: '#D9EEF2' },
  mat: 'SCALE',
  rim: '#FFE680',
  rimStrength: 0.4,
  eye: { shape: 'almond', iris: '#FFB000', irisRatio: 0.62, pupil: 'round', pupilRatio: 0.35, highlights: 1, lid: 0.12, lidAngle: -10 },
  mouth: { style: 'fang' },
  rig: { type: 'BIPED', gaitHz: 3, stride: 38, bounce: 0.05, breath: 0.025, breathHz: 1.5, waveAmp: 9, waveHz: 1.0, attack: 'spin', special: 'cast', faint: 'forward', lean: 14 },
  parts: [
    // --- core ---
    { name: 'pelvis', prim: { t: 'sphere', r: [0.15, 0.14, 0.16] }, at: [0, 0.43, -0.02] },
    { name: 'torso', parent: 'pelvis', prim: { t: 'lathe', profile: 'L_egg', h: 0.44, rmax: 0.16 }, at: [0, 0.0, 0.02], rot: [30, 0, 0], anim: ['br'] },
    { name: 'belly', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.17, 0.07] }, at: [0, 0.2, 0.1], slot: 'W' },
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.07, len: 0.08 }, at: [0, 0.36, 0.03], rot: [-10, 0, 0], anim: ['look'] },
    // --- head (enlarged vs spec for stage-2 appeal) ---
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.15, 0.135, 0.17] }, at: [0, 0.14, 0.03], rot: [-20, 0, 0], anim: ['look'] },
    { name: 'snout', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.075, 0.1] }, at: [0, -0.035, 0.12] },
    { name: 'jaw', parent: 'head', prim: { t: 'sphere', r: [0.095, 0.035, 0.11], half: true }, at: [0, -0.07, 0.07], rot: [180, 180, 0], slot: 'W', anim: ['jaw'] },
    { name: 'mouth', parent: 'snout', prim: { t: 'mouth', r: 0.05, w: 1.7 }, at: [0, -0.03, 0.085], rot: [15, 0, 0] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.064 }, at: [0.085, 0.035, 0.125], rot: [0, 28, 0], scale: [1.25, 1, 1] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.017, len: 0.05 }, at: [0.03, 0.092, 0.112], rot: [25, 30, -98], slot: '#163F54' },
    // three swept-back head spines, yellow tips
    { name: 'spineC', parent: 'head', prim: { t: 'cone', r: 0.035, h: 0.24 }, at: [0, 0.1, -0.06], rot: [-62, 0, 0] },
    { name: 'spineCtip', parent: 'spineC', prim: { t: 'cone', r: 0.015, h: 0.08 }, at: [0, 0.16, 0], slot: 'A', emissive: 0.5 },
    { name: 'spine', parent: 'head', mirror: true, prim: { t: 'cone', r: 0.03, h: 0.19 }, at: [0.065, 0.08, -0.06], rot: [-70, 0, -22] },
    { name: 'spineTip', parent: 'spine', mirror: true, prim: { t: 'cone', r: 0.013, h: 0.07 }, at: [0, 0.125, 0], slot: 'A', emissive: 0.5 },
    // --- arms + sails (sail parented to the upper arm; root edge along the arm, trailing corner at the hip) ---
    { name: 'arm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.038, len: 0.14 }, at: [0.13, 0.3, 0.03], rot: [104, 0, -24], anim: ['gait:R'] },
    { name: 'forearm', parent: 'arm', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.14 }, at: [0, 0.18, 0], rot: [-18, 0, 6] },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: 0.038 }, at: [0, 0.2, 0] },
    { name: 'finger', parent: 'hand', mirror: true, prim: { t: 'cone', r: 0.012, h: 0.06 }, at: [0, 0.02, 0.01], rot: [15, 0, 0], slot: 'D', lod: 0 },
    { name: 'finger2', parent: 'hand', mirror: true, prim: { t: 'cone', r: 0.012, h: 0.055 }, at: [0.018, 0.015, 0], rot: [15, 0, -25], slot: 'D', lod: 0 },
    { name: 'finger3', parent: 'hand', mirror: true, prim: { t: 'cone', r: 0.012, h: 0.055 }, at: [-0.018, 0.015, 0], rot: [15, 0, 25], slot: 'D', lod: 0 },
    ...sail('L'),
    ...sail('R'),
    // --- digitigrade legs: thigh fwd, shin back (reversed knee), metatarsal, 3 splayed toes ---
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'capsule', r: 0.07, len: 0.14, r2: 0.05 }, at: [0.1, -0.02, 0], rot: [130, 0, -6], anim: ['gait:L'] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.045, len: 0.16, r2: 0.035 }, at: [0, 0.2, 0], rot: [95, 0, 0] },
    { name: 'meta', parent: 'shin', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.09 }, at: [0, 0.22, 0], rot: [-95, 0, 6] },
    { name: 'toe', parent: 'meta', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.1 }, at: [0, 0.14, 0.01], rot: [-60, 0, 0], slot: 'D' },
    { name: 'toe2', parent: 'meta', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.09 }, at: [0.012, 0.14, 0.01], rot: [-60, 0, -28], slot: 'D' },
    { name: 'toe3', parent: 'meta', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.09 }, at: [-0.012, 0.14, 0.01], rot: [-60, 0, 28], slot: 'D' },
    // --- long counterbalance tail with wide fork + spark arc ---
    { name: 'tail', parent: 'pelvis', prim: { t: 'none' }, chain: { n: 7, r0: 0.07, r1: 0.022, len: 0.78, bend: [-4, 0, 0] }, at: [0, 0.02, -0.12], rot: [-98, 0, 0], anim: ['wave'] },
    { name: 'prong', parent: 'tailTip', mirror: true, prim: { t: 'cone', r: 0.028, h: 0.17 }, at: [0.03, -0.01, 0], rot: [0, 0, -42], slot: 'A', emissive: 0.8, anim: ['fx:fork'] },
    { name: 'arcSpark', parent: 'tailTip', prim: { t: 'tube', pts: [[0.075, 0.13, 0], [0.03, 0.17, 0.015], [-0.02, 0.13, -0.01], [-0.075, 0.13, 0]], r0: 0.006, r1: 0.006 }, slot: 'A+', emissive: 1.5, mat: 'GLOW', lod: 0 },
  ],
};
