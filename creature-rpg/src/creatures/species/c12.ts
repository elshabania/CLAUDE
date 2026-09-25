// c12 Belladrowse — f04 stage 3, verdant/toxin. Massive knuckle-walking sloth-mammal carrying a canopy tree:
// a bark trunk rising from its back into a 4-lobed canopy hung with a curtain of vines and 12 dark bells;
// low forward head with a broad mask, moss brows and beard (design/creatures.md §4 c12, v2 colours).
// Originality (§8): a MAMMAL knuckle-walker — never shell plates, rock spikes or horns.
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

const BARK = '#5A4632';

// canopy: 4 noise-displaced lobes around the trunk top (canopy-pivot local coords)
const lobeDefs: [V3, number][] = [[[0.17, 0.0, 0.08], 0.2], [[-0.17, 0.0, 0.04], 0.19], [[0.02, 0.02, -0.19], 0.2], [[-0.01, 0.12, -0.03], 0.18]];
const lobes: PartDef[] = lobeDefs.map(([at, r], i) => ({
  name: `lobe${i}`,
  parent: 'canopy',
  prim: { t: 'sphere', r: [r, r * 0.82, r] },
  at,
  slot: i === 3 ? 'P+' : 'P',
  fluffy: 0.02,
  anim: ['sway'],
}));

// curtain: 8 vines hanging from the canopy rim, each ending in a bell; 4 carry a second bell part-way down (12 bells)
const vines: PartDef[] = [];
for (let i = 0; i < 8; i++) {
  const a = ((i + 0.5) / 8) * Math.PI * 2;
  const L = [0.3, 0.2, 0.34, 0.16, 0.28, 0.22, 0.35, 0.18][i];
  const rr = 0.3 + (i % 2) * 0.03;
  const v = `vine${i}`;
  vines.push({ name: v, parent: 'canopy', prim: { t: 'capsule', r: 0.011, len: L }, at: [Math.sin(a) * rr, -0.1, Math.cos(a) * rr - 0.02], rot: [180, 0, 0], slot: '#4F7A3A', anim: ['sway'] });
  vines.push({ name: `bell${i}`, parent: v, prim: { t: 'lathe', profile: 'L_bell', h: 0.1, rmax: 0.06 }, at: [0, L + 0.11, 0], rot: [180, 0, 0], slot: 'A', mat: 'MEMBRANE', emissive: 0.2, anim: i === 0 ? ['fx:canopy'] : [] });
  vines.push({ name: `bell${i}Speck`, parent: `bell${i}`, prim: { t: 'torus', R: 0.042, r: 0.006 }, at: [0, 0.025, 0], rot: [90, 0, 0], slot: '#E9D34A', lod: 0 });
  if (i % 2 === 0) {
    vines.push({ name: `bellMid${i / 2}`, parent: v, prim: { t: 'lathe', profile: 'L_bell', h: 0.08, rmax: 0.048 }, at: [0.04, L * 0.5 + 0.09, 0], rot: [180, 0, -20], slot: 'A-', mat: 'MEMBRANE', emissive: 0.2 });
  }
}

// moss on the back around the trunk base
const mossBack: PartDef[] = ([[[0.12, 0.17, 0.1], 0.1], [[-0.13, 0.16, 0.08], 0.1], [[0.1, 0.15, -0.14], 0.11], [[-0.1, 0.15, -0.16], 0.1], [[0, 0.19, 0.02], 0.12], [[0, 0.13, -0.26], 0.08]] as [V3, number][]).map(([at, r], i) => ({
  name: `moss${i}`, parent: 'torso', prim: { t: 'sphere', r }, at, slot: 'P', fluffy: 0.015,
}));

// three curled hook claws per fist (it walks on its knuckles, claws curled back)
const claws: PartDef[] = [-1, 0, 1].map((k) => ({
  name: `claw${k + 1}`,
  parent: 'fist',
  mirror: true,
  prim: { t: 'tube', pts: [[0, 0, 0], [0, -0.02, 0.05], [0, 0.03, 0.08], [0, 0.06, 0.05]], r0: 0.02, r1: 0.006 },
  at: [k * 0.04, -0.02, 0.04],
  slot: 'D',
  mat: 'SHELL',
}));

export const c12: SpeciesVisual = {
  id: 'c12',
  H: 2.2,
  colors: { P: '#22421F', A: '#B36BD1', S: '#6F5A48', D: '#2A221C' },
  mat: 'FUR',
  rim: '#C9FF9E',
  rimStrength: 0.2,
  eye: { shape: 'halfmoon', iris: '#C28A2E', irisRatio: 0.62, pupil: 'round', pupilRatio: 0.4, highlights: 1, lid: 0.5, lidAngle: 6 },
  mouth: { style: 'line' },
  rig: { type: 'QUAD', gaitHz: 0.6, stride: 16, bounce: 0.015, breath: 0.02, breathHz: 0.25, attack: 'rear', special: 'cast', faint: 'side', lean: 0 },
  parts: [
    { name: 'torso', prim: { t: 'sphere', r: [0.26, 0.2, 0.34] }, at: [0, 0.4, -0.02], slot: 'S', anim: ['br'] },
    // fore-massed shoulders
    { name: 'shoulders', parent: 'torso', prim: { t: 'sphere', r: [0.25, 0.21, 0.21] }, at: [0, 0.07, 0.24], slot: 'S' },
    ...mossBack,
    // low forward head with broad mask
    { name: 'head', parent: 'shoulders', prim: { t: 'sphere', r: [0.15, 0.13, 0.14] }, at: [0, -0.02, 0.23], scale: [1.3, 1.3, 1.3], slot: 'S', anim: ['look'] },
    { name: 'face', parent: 'head', prim: { t: 'sphere', r: [0.13, 0.11, 0.06] }, at: [0, -0.005, 0.105], slot: 'S+' },
    { name: 'mask', parent: 'face', mirror: true, prim: { t: 'sphere', r: [0.05, 0.022, 0.02] }, at: [0.066, -0.012, 0.04], rot: [0, 28, -24], slot: '#4A3A2C' },
    { name: 'eye', parent: 'face', mirror: true, prim: { t: 'eye', r: 0.048 }, at: [0.05, 0.02, 0.05], rot: [0, 20, 0] },
    { name: 'brow', parent: 'face', mirror: true, prim: { t: 'sphere', r: [0.04, 0.026, 0.026] }, at: [0.055, 0.075, 0.032], rot: [0, 0, -10], slot: 'P', fluffy: 0.006 },
    { name: 'nose', parent: 'face', prim: { t: 'sphere', r: [0.028, 0.02, 0.02] }, at: [0, -0.022, 0.055], slot: 'D' },
    { name: 'mouth', parent: 'face', prim: { t: 'mouth', r: 0.03, w: 1.8 }, at: [0, -0.055, 0.046], rot: [18, 0, 0], anim: ['fx:mouth'] },
    { name: 'jaw', parent: 'face', prim: { t: 'sphere', r: [0.07, 0.03, 0.06], half: true }, at: [0, -0.075, 0.0], rot: [180, 0, 0], slot: 'S', anim: ['jaw'] },
    { name: 'beard0', parent: 'jaw', prim: { t: 'sphere', r: 0.038 }, at: [0, 0.03, 0.03], slot: 'P', fluffy: 0.008, anim: ['sway'] },
    { name: 'beard1', parent: 'jaw', prim: { t: 'sphere', r: 0.032 }, at: [0.045, 0.02, 0.02], slot: 'P', fluffy: 0.008 },
    { name: 'beard2', parent: 'jaw', prim: { t: 'sphere', r: 0.032 }, at: [-0.045, 0.02, 0.02], slot: 'P', fluffy: 0.008 },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.035, 0.03, 0.018] }, at: [0.13, 0.03, -0.02], rot: [0, 40, 0], slot: 'S-' },
    // long forelimbs ending in knuckle fists
    { name: 'foreleg', parent: 'shoulders', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.17 }, at: [0.21, -0.04, 0.04], rot: [168, 0, -14], slot: 'S', anim: ['gait:FL'] },
    { name: 'forearm', parent: 'foreleg', mirror: true, prim: { t: 'capsule', r: 0.062, len: 0.12, r2: 0.066 }, at: [0, 0.3, 0], rot: [-8, 0, 16], slot: 'S' },
    { name: 'fist', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.075, 0.065, 0.08] }, at: [0, 0.26, 0.01], slot: 'S-' },
    ...claws,
    // hind legs
    { name: 'thigh', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.085, len: 0.08 }, at: [0.17, -0.08, -0.2], rot: [172, 0, -6], slot: 'S', anim: ['gait:BL'] },
    { name: 'hindFoot', parent: 'thigh', mirror: true, prim: { t: 'sphere', r: [0.07, 0.045, 0.1] }, at: [0, 0.23, -0.03], slot: 'S-' },
    { name: 'tailNub', parent: 'torso', prim: { t: 'sphere', r: 0.045 }, at: [0, 0.02, -0.34], slot: 'S' },
    // bark trunk (S-curve) rising into the canopy
    { name: 'trunk', parent: 'torso', prim: { t: 'tube', pts: [[0, 0, 0], [0.03, 0.08, -0.02], [-0.02, 0.17, 0.0], [0.0, 0.26, 0.02]], r0: 0.065, r1: 0.045 }, at: [0, 0.14, -0.08], slot: BARK, mat: 'STONE', anim: ['sway'] },
    { name: 'root', parent: 'trunk', prim: { t: 'sphere', r: [0.1, 0.04, 0.1] }, at: [0, 0.01, 0], slot: BARK, mat: 'STONE', lod: 0 },
    { name: 'canopy', parent: 'trunk', prim: { t: 'none' }, at: [0, 0.28, 0.0], anim: ['sway'] },
    { name: 'branchL', parent: 'trunk', prim: { t: 'tube', pts: [[0, 0, 0], [0.08, 0.05, 0.03], [0.15, 0.08, 0.06]], r0: 0.03, r1: 0.018 }, at: [0, 0.2, 0.01], slot: BARK, mat: 'STONE' },
    { name: 'branchR', parent: 'trunk', prim: { t: 'tube', pts: [[0, 0, 0], [-0.08, 0.06, 0.0], [-0.15, 0.08, 0.02]], r0: 0.03, r1: 0.018 }, at: [0, 0.22, 0.01], slot: BARK, mat: 'STONE' },
    ...lobes,
    ...vines,
  ],
};
