// c01 Fizzkit — f01 stage 1, electric. Small splay-legged quadruped lizard (design/creatures.md §4 c01).
import type { SpeciesVisual } from '../assemble';

export const c01: SpeciesVisual = {
  id: 'c01',
  H: 0.35,
  colors: { P: '#2E8FA3', A: '#FFD23F', 'W': '#E8F4E4' },
  mat: 'SCALE',
  rim: '#FFF3B0',
  rimStrength: 0.35,
  eye: { shape: 'round', iris: '#F2A900', irisRatio: 0.7, pupil: 'v-oval', pupilRatio: 0.45, highlights: 2, lid: 0.1 },
  mouth: { style: 'smile' },
  rig: { type: 'QUAD', gaitHz: 4, stride: 34, bounce: 0.06, breath: 0.03, breathHz: 0.8, waveAmp: 8, waveHz: 1.2, flapAmp: 6, flapHz: 1.5, attack: 'lunge', special: 'cast', faint: 'side', lean: 4 },
  parts: [
    { name: 'body', prim: { t: 'sphere', r: [0.30, 0.20, 0.42] }, at: [0, 0.30, 0], anim: ['br'] },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.26, 0.14, 0.36] }, at: [0, -0.06, 0], slot: 'W' },
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.26, 0.24, 0.28] }, at: [0, 0.18, 0.42], anim: ['look'] },
    { name: 'snout', parent: 'head', prim: { t: 'sphere', r: [0.18, 0.12, 0.16] }, at: [0, -0.06, 0.22] },
    { name: 'mouth', parent: 'snout', prim: { t: 'mouth', r: 0.07, w: 1.6 }, at: [0, -0.02, 0.15], rot: [10, 0, 0] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.10 }, at: [0.15, 0.07, 0.19], rot: [0, 35, 0] },
    { name: 'lidRidge', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.018, len: 0.1 }, at: [0.16, 0.18, 0.15], rot: [0, 0, 70], slot: 'P-' },
    { name: 'nubC', parent: 'head', prim: { t: 'cone', r: 0.03, h: 0.07 }, at: [0, 0.22, -0.10], rot: [-40, 0, 0], slot: 'A', emissive: 0.6 },
    { name: 'nub', parent: 'head', mirror: true, prim: { t: 'cone', r: 0.03, h: 0.07 }, at: [0.07, 0.21, -0.08], rot: [-40, 0, -15], slot: 'A', emissive: 0.6 },
    // folded flank flaps (roll ±70 folded) with ribs and glowing seam
    { name: 'flap', parent: 'body', mirror: true, prim: { t: 'extrude', shape: 'X_sail', w: 0.30, h: 0.45, depth: 0.02 }, at: [0.24, 0.04, 0.2], rot: [-90, 0, 55], mat: 'MEMBRANE', anim: ['flap'] },
    { name: 'rib', parent: 'flap', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.12, 0.2, 0.01], [0.22, 0.36, 0]], r0: 0.012, r1: 0.006 }, at: [0, 0, 0.012], slot: 'P-', lod: 0 },
    { name: 'rib2', parent: 'flap', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.18, 0.14, 0.01], [0.3, 0.22, 0]], r0: 0.012, r1: 0.006 }, at: [0, 0, 0.012], slot: 'P-', lod: 0 },
    { name: 'seam', parent: 'flap', mirror: true, prim: { t: 'tube', pts: [[0.02, 0.44, 0], [0.2, 0.36, 0], [0.29, 0.2, 0], [0.3, 0.02, 0]], r0: 0.014, r1: 0.014 }, slot: 'A', emissive: 0.7, mat: 'GLOW' },
    // legs: upper + lower + foot, splayed
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.14 }, at: [0.22, -0.06, 0.26], rot: [180, 0, -35], anim: ['gait:FL'] },
    { name: 'shinF', parent: 'legF', mirror: true, prim: { t: 'capsule', r: 0.04, len: 0.10 }, at: [0, 0.2, 0], rot: [0, 0, 45] },
    { name: 'footF', parent: 'shinF', mirror: true, prim: { t: 'sphere', r: [0.06, 0.03, 0.08] }, at: [0, 0.16, 0.02] },
    { name: 'legB', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.14 }, at: [0.22, -0.06, -0.26], rot: [180, 0, -35], anim: ['gait:BL'] },
    { name: 'shinB', parent: 'legB', mirror: true, prim: { t: 'capsule', r: 0.04, len: 0.10 }, at: [0, 0.2, 0], rot: [0, 0, 45] },
    { name: 'footB', parent: 'shinB', mirror: true, prim: { t: 'sphere', r: [0.06, 0.03, 0.08] }, at: [0, 0.16, 0.02] },
    // tail chain along -Z ending in a two-prong fork
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 5, r0: 0.08, r1: 0.03, len: 0.6, bend: [8, 0, 0] }, at: [0, 0, -0.38], rot: [-100, 0, 0], anim: ['wave'] },
    { name: 'prong', parent: 'tailTip', mirror: true, prim: { t: 'cone', r: 0.03, h: 0.12 }, at: [0.03, 0, 0], rot: [0, 0, -25], slot: 'A', emissive: 0.6, anim: ['fx:fork'] },
  ],
};
