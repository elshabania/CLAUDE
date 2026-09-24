// c07 Rippleback — f03 stage 1, water (v2: E1 round eyes with sclera ring, brow meshes). Sitting otter pup with a thick shingle-plated tail (design/creatures.md §4 c07).
// Originality (§8, D7): shell plates ONLY on the tail; nothing shell-like on chest or belly; the chest is cream fur.
import type { SpeciesVisual, PartDef } from '../assemble';

// five overlapping shingle plates, one per tail segment, shrinking toward the paddle
const plates: PartDef[] = [0, 1, 2, 3, 4].map((i) => {
  const rmax = 0.15 - i * 0.015;
  return {
    name: `plate${i}`,
    parent: `tail${i}`,
    prim: { t: 'lathe', profile: 'L_dome', h: 0.1, rmax, axis: 'z' },
    at: [0, 0.085, 0.035],
    rot: [-14, 0, 0],
    scale: [1, 1.45, 1],
    slot: 'S',
    mat: 'SHELL',
  } as PartDef;
});
// lighter teal scalloped edge on each plate (vertex hue-shift stand-in)
const plateEdges: PartDef[] = [0, 1, 2, 3, 4].map((i) => ({
  name: `plateEdge${i}`,
  parent: `plate${i}`,
  prim: { t: 'torus', R: 0.143 - i * 0.015, r: 0.012 },
  at: [0, 0, 0.004],
  slot: 'A',
  mat: 'SHELL',
  lod: 0,
}));

export const c07: SpeciesVisual = {
  id: 'c07',
  H: 0.4,
  colors: { P: '#5B4636', S: '#3FA7B5', A: '#6FD0C8', W: '#F1E6D2', D: '#2A211C' },
  mat: 'FUR',
  rim: '#BFF6FF',
  rimStrength: 0.3,
  eye: { shape: 'round', iris: '#1B1B1B', irisRatio: 0.84, pupil: 'round', pupilRatio: 0.8, highlights: 2, lid: 0 },
  mouth: { style: 'smile' },
  rig: { type: 'QUAD', gaitHz: 2.5, stride: 26, bounce: 0.08, breath: 0.03, breathHz: 0.7, waveAmp: 6, waveHz: 1.1, waveAxis: 'pitch', attack: 'spin', special: 'cast', faint: 'side', lean: 8 },
  parts: [
    { name: 'body', prim: { t: 'none' }, at: [0, 0.3, 0], anim: ['br'] },
    // torso tilted up at the front: the otter sits up on its haunches
    { name: 'torso', parent: 'body', prim: { t: 'capsule', r: 0.2, len: 0.3 }, at: [0, -0.1, -0.2], rot: [42, 0, 0] },
    { name: 'chest', parent: 'torso', prim: { t: 'sphere', r: [0.145, 0.26, 0.1] }, at: [0, 0.34, 0.13], slot: 'W' },
    // head
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.2, 0.185, 0.18] }, at: [0, 0.47, 0.27], anim: ['look'] },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.09, 0.08, 0.08] }, at: [0.11, -0.07, 0.07] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.07, 0.08] }, at: [0, -0.07, 0.14], slot: 'W' },
    { name: 'pad', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.06, 0.05, 0.05] }, at: [0.045, 0.0, 0.04], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.042, 0.03, 0.03] }, at: [0, 0.042, 0.075], slot: 'D', mat: 'SKIN_WET' },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.045, w: 1.5 }, at: [0, -0.022, 0.078], rot: [12, 0, 0], anim: ['fx:mouth'] },
    { name: 'whiskerA', parent: 'pad', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.07, 0.01, 0.0], [0.13, 0.025, -0.02]], r0: 0.005, r1: 0.002 }, at: [0.03, 0.01, 0.03], slot: 'W', lod: 0 },
    { name: 'whiskerB', parent: 'pad', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.07, -0.01, 0.0], [0.13, -0.03, -0.02]], r0: 0.005, r1: 0.002 }, at: [0.03, -0.005, 0.03], slot: 'W', lod: 0 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.068 }, at: [0.095, 0.045, 0.14], rot: [-4, 28, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.012, len: 0.05 }, at: [0.13, 0.125, 0.125], rot: [0, 28, 94], slot: 'D' },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.05, 0.048, 0.025] }, at: [0.15, 0.115, -0.03], rot: [0, 35, -20] },
    { name: 'earIn', parent: 'ear', mirror: true, prim: { t: 'sphere', r: [0.032, 0.03, 0.01] }, at: [0, 0, 0.018], slot: 'P-', lod: 0 },
    // forelegs: left paw on the ground, right paw raised holding the pebble
    { name: 'foreleg', parent: 'body', prim: { t: 'capsule', r: 0.056, len: 0.3 }, at: [0.13, 0.16, 0.24], rot: [162, 0, -6], anim: ['gait:FL'] },
    { name: 'forepaw', parent: 'foreleg', prim: { t: 'sphere', r: [0.058, 0.04, 0.07] }, at: [0, 0.4, -0.02], slot: 'P-' },
    { name: 'armR', parent: 'body', prim: { t: 'capsule', r: 0.05, len: 0.12 }, at: [-0.13, 0.17, 0.24], rot: [135, 0, -10], anim: ['gait:FR'] },
    { name: 'forearmR', parent: 'armR', prim: { t: 'capsule', r: 0.045, len: 0.1 }, at: [0, 0.2, 0], rot: [-120, 0, 15] },
    { name: 'pawR', parent: 'forearmR', prim: { t: 'sphere', r: [0.055, 0.05, 0.05] }, at: [0, 0.18, 0], slot: 'P-' },
    { name: 'pebble', parent: 'pawR', prim: { t: 'sphere', r: [0.05, 0.042, 0.045] }, at: [0.035, 0.03, 0.035], slot: '#9A9A9A', mat: 'STONE' },
    // haunches and webbed hind feet
    { name: 'haunch', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.1, 0.12, 0.13] }, at: [0.14, -0.16, -0.08], anim: ['gait:BL'] },
    { name: 'hindFoot', parent: 'haunch', mirror: true, prim: { t: 'capsule', r: 0.045, len: 0.08 }, at: [0.01, -0.1, 0.02], rot: [90, 0, 0] },
    { name: 'web', parent: 'hindFoot', mirror: true, prim: { t: 'extrude', shape: 'X_fan', w: 0.13, h: 0.1, depth: 0.018 }, at: [0, 0.12, 0.02], slot: 'P-', mat: 'SKIN' },
    // plated tail: base + 5-segment chain curling up, a shingle plate per segment, rounded paddle plate
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 5, r0: 0.12, r1: 0.075, len: 0.66, bend: [17, 0, 0] }, at: [0, -0.2, -0.3], rot: [-108, 0, 0], anim: ['wave'] },
    ...plates,
    ...plateEdges,
    { name: 'paddle', parent: 'tailTip', prim: { t: 'extrude', shape: 'X_disc', w: 0.2, h: 0.16, depth: 0.035 }, at: [0, 0.06, 0.02], slot: 'S', mat: 'SHELL', anim: ['fx:tail'] },
  ],
};
