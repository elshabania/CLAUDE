// c10 Dozebud — f04 stage 1, verdant. Moss-backed baby sloth curled around a seed pod as big as itself,
// dark eye-mask, closed bell-bud sprout on its head (design/creatures.md §4 c10).
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

// moss tufts over the back and crown (fluffy)
const tufts: [V3, number][] = [
  [[0, 0.24, -0.08], 0.11], [[0.17, 0.18, -0.12], 0.1], [[-0.17, 0.18, -0.12], 0.1],
  [[0.1, 0.05, -0.24], 0.1], [[-0.1, 0.05, -0.24], 0.1], [[0, 0.27, 0.06], 0.08],
];
const moss: PartDef[] = tufts.map(([at, r], i) => ({
  name: `moss${i}`,
  parent: 'body',
  prim: { t: 'sphere', r },
  at,
  slot: i % 2 ? 'P' : 'P+',
  fluffy: 0.012,
  anim: ['br'],
}));

// three curved hook claws per hand, hooked into the pod
const claws: PartDef[] = [-1, 0, 1].map((k) => ({
  name: `claw${k + 1}`,
  parent: 'hand',
  mirror: true,
  prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.06, 0.03], [0, 0.085, -0.02]], r0: 0.018, r1: 0.005 },
  at: [k * 0.03, 0.02, 0.0],
  rot: [0, 0, -k * 8],
  slot: '#3A3028',
  mat: 'SHELL',
}));

// seed pod: almond-shaped lathe with pointed ends and three raised seams following its profile
const POD: [number, number][] = [[0, 0], [0.45, 0.06], [0.85, 0.22], [1, 0.45], [0.9, 0.7], [0.55, 0.9], [0.12, 0.99], [0, 1]];
const POD_H = 0.52, POD_R = 0.245;
const seamPts: V3[] = POD.slice(1, -1).map(([r, h]) => [0, h * POD_H, r * POD_R * 1.02]);
const seams: PartDef[] = [0, 55, -55].map((yaw, i) => ({
  name: `podSeam${i}`,
  parent: 'pod',
  prim: { t: 'tube', pts: seamPts, r0: 0.009, r1: 0.009 },
  rot: [0, yaw, 0],
  slot: '#5E3C28',
  mat: 'SHELL',
  lod: i ? 0 : 1,
}));

export const c10: SpeciesVisual = {
  id: 'c10',
  H: 0.35,
  colors: { P: '#7FA650', S: '#C9B48A', D: '#8A5A3B', A: '#B05FC4', W: '#EDE4CC' },
  mat: 'FUR',
  rim: '#E8FFC0',
  rimStrength: 0.25,
  eye: { shape: 'droopy', iris: '#5A3A22', irisRatio: 0.6, pupil: 'round', pupilRatio: 0.5, highlights: 1, lid: 0.45, lidAngle: 6 },
  mouth: { style: 'smile' },
  rig: { type: 'BALL', gaitHz: 1.2, stride: 14, bounce: 0.05, breath: 0.04, breathHz: 0.3, attack: 'lunge', special: 'cast', faint: 'side', lean: 10 },
  parts: [
    // curled body
    { name: 'body', prim: { t: 'sphere', r: [0.33, 0.31, 0.29] }, at: [0, 0.36, -0.06], anim: ['br'], fluffy: 0.006 },
    ...moss,
    // the seed pod, as large as its body, hugged in front
    { name: 'pod', prim: { t: 'lathe', profile: POD, h: POD_H, rmax: POD_R }, at: [0, 0.0, 0.17], slot: 'D', mat: 'SHELL', anim: ['fx:pod'] },
    ...seams,
    // tan face disc with a dark downward-sloping eye mask
    { name: 'face', parent: 'body', prim: { t: 'sphere', r: [0.22, 0.18, 0.11] }, at: [0, 0.225, 0.2], rot: [-8, 0, 0], slot: 'S' },
    { name: 'head', parent: 'face', prim: { t: 'none' }, at: [0, 0, 0.02], anim: ['look'] },
    { name: 'mask', parent: 'face', mirror: true, prim: { t: 'sphere', r: [0.085, 0.036, 0.03] }, at: [0.115, -0.03, 0.058], rot: [0, 34, -32], slot: '#4A3526' },
    { name: 'eye', parent: 'face', mirror: true, prim: { t: 'eye', r: 0.078 }, at: [0.078, 0.03, 0.09], rot: [0, 22, 0] },
    { name: 'nose', parent: 'face', prim: { t: 'sphere', r: [0.03, 0.022, 0.022] }, at: [0, -0.03, 0.1], slot: '#3A2A20' },
    { name: 'mouth', parent: 'face', prim: { t: 'mouth', r: 0.035, w: 1.5 }, at: [0, -0.068, 0.088], rot: [20, 0, 0], anim: ['fx:mouth'] },
    // arms wrap over the pod (two segments), hooked claws
    { name: 'arm', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.055, len: 0.1 }, at: [0.25, 0.08, 0.1], rot: [70, 0, 30] },
    { name: 'forearm', parent: 'arm', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.1 }, at: [0, 0.16, 0], rot: [50, 0, 20] },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: 0.05 }, at: [0, 0.16, 0], slot: 'P' },
    ...claws,
    // short legs tucked under the pod
    { name: 'leg', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.08 }, at: [0.16, -0.22, 0.1], rot: [100, 0, 25] },
    { name: 'toe', parent: 'leg', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.04, 0.02], [0, 0.05, -0.012]], r0: 0.013, r1: 0.004 }, at: [0, 0.16, 0], slot: '#3A3028', mat: 'SHELL' },
    { name: 'toe2', parent: 'leg', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.04, 0.02], [0, 0.05, -0.012]], r0: 0.013, r1: 0.004 }, at: [0.03, 0.15, 0], rot: [0, 0, -12], slot: '#3A3028', mat: 'SHELL' },
    // closed bell-bud sprout (family motif)
    { name: 'budStem', parent: 'body', prim: { t: 'tube', pts: [[0, 0, 0], [0.01, 0.07, 0.01], [0.04, 0.12, 0.03], [0.07, 0.13, 0.05]], r0: 0.014, r1: 0.01 }, at: [0, 0.3, 0.02], slot: 'P-', anim: ['sway'] },
    { name: 'bud', parent: 'budStem', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.13, rmax: 0.065 }, at: [0.075, 0.135, 0.05], rot: [0, 0, 150], slot: 'A', mat: 'MEMBRANE' },
    { name: 'budLeaf', parent: 'budStem', prim: { t: 'extrude', shape: 'X_leaf', w: 0.2, h: 0.08, depth: 0.01 }, at: [0.01, 0.06, 0.01], rot: [0, 30, 60], slot: 'P', mat: 'MEMBRANE', lod: 0 },
  ],
};
