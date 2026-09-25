// c21 Samaraptor — f07 stage 3, gale/verdant. Upright stilt-legged raptor hovering under a living two-blade samara rotor
// (design/creatures.md §4 c21). The rotor hub carries the `spin` tag; blades are children so they turn with it.
import type { SpeciesVisual } from '../assemble';

const HORN = '#3A3A2E';
const CHEST = '#EFE6CF';

export const c21: SpeciesVisual = {
  id: 'c21',
  H: 1.5,
  hoverGap: 0.2,
  colors: { P: '#2F6A55', S: '#D9B45A', A: '#D9B45A', D: HORN },
  mat: 'FUR',
  rim: '#FFE9A0',
  rimStrength: 0.35,
  eye: { shape: 'almond', iris: '#F2C14E', irisRatio: 0.6, pupil: 'round', pupilRatio: 0.34, highlights: 1, lid: 0.15, lidAngle: -15 },
  mouth: { style: 'none' },
  rig: { type: 'WING', spinHz: 1.5, gaitHz: 1.6, stride: 18, breath: 0.025, breathHz: 0.5, flapAmp: 8, flapHz: 1.2, attack: 'dive', special: 'cast', faint: 'sink', lean: 14 },
  parts: [
    { name: 'body', prim: { t: 'none' }, at: [0, 0.55, 0] },
    { name: 'torso', parent: 'body', prim: { t: 'lathe', profile: 'L_egg', h: 0.52, rmax: 0.2 }, at: [0, -0.04, 0], rot: [-10, 0, 0], anim: ['br'] },
    // cream chest ruff
    { name: 'ruff1', parent: 'torso', prim: { t: 'sphere', r: [0.14, 0.1, 0.09] }, at: [0, 0.38, 0.1], slot: CHEST, fluffy: 0.004, anim: ['br'] },
    { name: 'ruff2', parent: 'torso', prim: { t: 'sphere', r: [0.15, 0.11, 0.09] }, at: [0, 0.27, 0.13], slot: CHEST, fluffy: 0.004 },
    { name: 'ruff3', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.1, 0.08] }, at: [0, 0.16, 0.14], slot: CHEST, fluffy: 0.004 },
    // neck + head
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.085, len: 0.1, r2: 0.07 }, at: [0, 0.42, 0.02], rot: [28, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.125, 0.12, 0.145] }, at: [0, 0.22, 0.01], rot: [-18, 0, 0], anim: ['look'] },
    { name: 'face', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.075, 0.09] }, at: [0, -0.045, 0.06], slot: CHEST },
    { name: 'beak', parent: 'head', prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.01, 0.07], [0, -0.02, 0.13], [0, -0.07, 0.15]], r0: 0.045, r1: 0.008 }, at: [0, 0.0, 0.11], scale: [0.9, 1, 1], slot: HORN, mat: 'SHELL' },
    { name: 'jaw', parent: 'head', prim: { t: 'cone', r: 0.032, h: 0.08 }, at: [0, -0.04, 0.1], rot: [96, 0, 0], scale: [1.1, 1, 0.5], slot: HORN, mat: 'SHELL', anim: ['jaw', 'fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.05 }, at: [0.075, 0.03, 0.1], rot: [0, 36, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.018, len: 0.07, r2: 0.012 }, at: [0.035, 0.085, 0.12], rot: [10, 30, -78], slot: 'P-' },
    // crown of three leaf blades
    { name: 'crownC', parent: 'head', prim: { t: 'extrude', shape: 'X_leaf', w: 0.26, h: 0.2, depth: 0.014 }, at: [0, 0.1, -0.02], rot: [-55, 0, 0], slot: 'P+', mat: 'MEMBRANE', opacity: 1, anim: ['sway'] },
    { name: 'crown', parent: 'head', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.22, h: 0.16, depth: 0.012 }, at: [0.03, 0.09, -0.03], rot: [-60, 0, -28], slot: 'P+', mat: 'MEMBRANE', opacity: 1 },
    // rotor: mast from the shoulders, spinning hub above the head, two opposed samara blades
    { name: 'mast', parent: 'torso', prim: { t: 'cyl', r: 0.085, h: 0.52, r2: 0.045 }, at: [0, 0.42, -0.12], rot: [10, 0, 0], slot: 'P' },
    { name: 'hub', parent: 'mast', prim: { t: 'cyl', r: 0.075, h: 0.06 }, at: [0, 0.51, 0], rot: [-10, 0, 0], anim: ['spin', 'fx:rotor'] },
    { name: 'hubCap', parent: 'hub', prim: { t: 'sphere', r: [0.06, 0.035, 0.06] }, at: [0, 0.06, 0], slot: 'S' },
    { name: 'bladeA', parent: 'hub', prim: { t: 'none' }, at: [0, 0.03, 0] },
    { name: 'bladeB', parent: 'hub', prim: { t: 'none' }, at: [0, 0.03, 0], rot: [0, 180, 0] },
    { name: 'nutA', parent: 'bladeA', prim: { t: 'sphere', r: [0.08, 0.05, 0.065] }, at: [0.07, 0, 0], slot: 'S-', mat: 'SKIN' },
    { name: 'nutB', parent: 'bladeB', prim: { t: 'sphere', r: [0.08, 0.05, 0.065] }, at: [0.07, 0, 0], slot: 'S-', mat: 'SKIN' },
    { name: 'blade1', parent: 'bladeA', prim: { t: 'extrude', shape: 'X_samara', w: 0.95, h: 0.66, depth: 0.02 }, at: [0.05, 0, 0], rot: [108, 0, -90], slot: 'S', mat: 'MEMBRANE', opacity: 0.95 },
    { name: 'blade2', parent: 'bladeB', prim: { t: 'extrude', shape: 'X_samara', w: 0.95, h: 0.66, depth: 0.02 }, at: [0.05, 0, 0], rot: [108, 0, -90], slot: 'S', mat: 'MEMBRANE', opacity: 0.95 },
    { name: 'veinA1', parent: 'blade1', prim: { t: 'tube', pts: [[0, 0.1, 0], [0.04, 0.4, 0], [0.05, 0.62, 0]], r0: 0.006, r1: 0.003 }, at: [0, 0, 0.011], slot: 'S-', lod: 0 },
    { name: 'veinA2', parent: 'blade1', prim: { t: 'tube', pts: [[0.01, 0.12, 0], [0.08, 0.3, 0], [0.11, 0.5, 0]], r0: 0.005, r1: 0.003 }, at: [0, 0, 0.011], slot: 'S-', lod: 0 },
    { name: 'veinB1', parent: 'blade2', prim: { t: 'tube', pts: [[0, 0.1, 0], [0.04, 0.4, 0], [0.05, 0.62, 0]], r0: 0.006, r1: 0.003 }, at: [0, 0, 0.011], slot: 'S-', lod: 0 },
    { name: 'veinB2', parent: 'blade2', prim: { t: 'tube', pts: [[0.01, 0.12, 0], [0.08, 0.3, 0], [0.11, 0.5, 0]], r0: 0.005, r1: 0.003 }, at: [0, 0, 0.011], slot: 'S-', lod: 0 },
    // shoulder coverts where the wings used to be
    { name: 'covert', parent: 'torso', mirror: true, prim: { t: 'sphere', r: [0.06, 0.13, 0.1] }, at: [0.15, 0.33, -0.04], rot: [0, 0, -12], slot: 'P' },
    // five-leaf tail fan
    { name: 'tail', parent: 'torso', prim: { t: 'none' }, at: [0, 0.1, -0.15], anim: ['sway'] },
    { name: 'tailC', parent: 'tail', prim: { t: 'extrude', shape: 'X_leaf', w: 0.42, h: 0.34, depth: 0.018 }, rot: [-125, 0, 0], slot: 'P' },
    { name: 'tailM', parent: 'tail', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.4, h: 0.31, depth: 0.018 }, at: [0.02, 0, 0], rot: [-125, 0, -20], slot: 'P-' },
    { name: 'tailO', parent: 'tail', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.38, h: 0.28, depth: 0.018 }, at: [0.04, 0, 0], rot: [-125, 0, -40], slot: 'P' },
    // stilt legs: feathered thigh -> long gold tarsus -> 4 hooked talons
    { name: 'thigh', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.065, len: 0.14, r2: 0.045 }, at: [0.09, 0.06, 0.02], rot: [160, 0, 4], anim: ['gait:L'] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.26, r2: 0.024 }, at: [0, 0.2, 0], rot: [42, 0, 0], slot: 'S-', mat: 'SKIN' },
    { name: 'foot', parent: 'shin', mirror: true, prim: { t: 'none' }, at: [0, 0.31, 0], rot: [162, 0, 0] },
    { name: 'talonF', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, -0.01, 0.07], [0, -0.04, 0.1], [0, -0.07, 0.09]], r0: 0.022, r1: 0.005 }, slot: HORN, mat: 'SHELL' },
    { name: 'talonO', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.04, -0.01, 0.055], [0.06, -0.04, 0.08], [0.06, -0.07, 0.07]], r0: 0.02, r1: 0.005 }, slot: HORN, mat: 'SHELL' },
    { name: 'talonI', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [-0.04, -0.01, 0.055], [-0.06, -0.04, 0.08], [-0.06, -0.07, 0.07]], r0: 0.02, r1: 0.005 }, slot: HORN, mat: 'SHELL' },
    { name: 'talonB', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, -0.01, -0.05], [0, -0.04, -0.07], [0, -0.06, -0.06]], r0: 0.02, r1: 0.005 }, slot: HORN, mat: 'SHELL', lod: 0 },
  ],
};
