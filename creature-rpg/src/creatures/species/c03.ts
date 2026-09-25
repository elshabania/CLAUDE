// c03 Tempestrel — f01 stage 3, electric / gale (v3 flagship line, DECISIONS D31; design/creatures.md §4 c03 v3).
// Majestic storm glider: a colugo-like body that rides storms on wide membranes stretched from wrists to ankles, a
// cream storm-cloud mane, long swept satin ears with crackling rims, glowing capacitor freckles running along the
// cheeks, and a long tail ending in a crackling orb. Family motifs: satin ears + static rims, freckles, tail bulb, gliding membranes.
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { freckles, satinEar } from './_kit';

const CHEEK: [number, number, number] = [0.05, 0.045, 0.045];
const MW = 0.7;
const MH = 0.85;
// membrane edge (X_glide outline, outer part) as a glowing seam, in the membrane plane
const EDGE: [number, number][] = [[0.62, 0.5], [0.9, 0.44], [1.0, 0.2], [0.99, -0.12], [0.93, -0.4], [0.74, -0.44], [0.56, -0.6], [0.36, -0.53]];
const edge: V3[] = EDGE.map(([x, y]) => [x * MW * 0.985, y * MH * 0.985, 0.004]);
const veins: PartDef[] = [[0.55, 0.3], [0.7, -0.05], [0.55, -0.4]].map(([x, y], i) => ({
  name: `vein${i}`, parent: 'glide', mirror: true, mirrorGeom: true, lod: 0,
  prim: { t: 'tube', pts: [[0.05 * MW, y * 0.3 * MH, 0.004], [x * 0.55 * MW, y * 0.75 * MH, 0.004], [x * MW, y * MH, 0.004]], r0: 0.006, r1: 0.003 },
  slot: 'A', emissive: 0.8, mat: 'GLOW',
}) as PartDef);

export const c03: SpeciesVisual = {
  id: 'c03',
  H: 1.6,
  colors: { P: '#7B70AF', S: '#3A3470', A: '#3BB8FF', W: '#EEE6DA', D: '#2E2840' },
  mat: 'FUR',
  furLen: 0.012,
  rim: '#A6E6FF',
  rimStrength: 0.45,
  gaze: 0.5,
  hoverGap: 0.3,
  eye: { shape: 'long-almond', sclera: '#FBF8F2', iris: '#2F6BE0', irisRatio: 0.72, pupil: 'round', pupilRatio: 0.38, highlights: 2, lid: 0.2, lidAngle: -4, outline: '#221C30' },
  mouth: { style: 'line', color: '#3A2A3C' },
  rig: { type: 'WING', breath: 0.02, breathHz: 0.4, waveAmp: 6, waveHz: 0.6, flapAmp: 10, flapHz: 0.5, attack: 'dive', special: 'cast', faint: 'sink', lean: 4 },
  parts: [
    { name: 'body', prim: { t: 'sphere', r: [0.17, 0.14, 0.34] }, at: [0, 0.42, 0], fluffy: 0.004, anim: ['br', 'fx:body'] },
    { name: 'chest', parent: 'body', prim: { t: 'sphere', r: [0.12, 0.1, 0.14] }, at: [0, -0.03, 0.2], slot: 'W', fluffy: 0.004 },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.11, 0.07, 0.24] }, at: [0, -0.06, -0.02], slot: 'W' },
    // storm-cloud mane
    { name: 'mane', parent: 'body', prim: { t: 'sphere', r: [0.21, 0.15, 0.15] }, at: [0, 0.1, 0.25], slot: 'W', fluffy: 0.01, fur: 2 },
    { name: 'maneS', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.13, 0.12, 0.12] }, at: [0.14, 0.04, 0.2], slot: 'W', fluffy: 0.01, fur: 2 },
    { name: 'maneB', parent: 'body', prim: { t: 'sphere', r: [0.11, 0.08, 0.12] }, at: [0, 0.1, 0.1], slot: 'W', fluffy: 0.01, fur: 2 },
    // --- neck + head ---
    { name: 'neck', parent: 'body', prim: { t: 'capsule', r: 0.08, len: 0.1 }, at: [0, 0.06, 0.3], rot: [55, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.105, 0.095, 0.12] }, at: [0, 0.13, 0.02], rot: [-55, 0, 0], scale: [1.3, 1.3, 1.3], anim: ['look'], blend: 0.035 },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.055, 0.045, 0.06] }, at: [0, -0.04, 0.095], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.017, 0.012, 0.011] }, at: [0, 0.022, 0.056], slot: 'D', mat: 'SKIN_WET' },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.02, w: 1.5 }, at: [0, -0.02, 0.054], rot: [18, 0, 0] },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: CHEEK }, at: [0.06, -0.045, 0.06], slot: 'W', fur: 0.3 },
    ...freckles('freckle', 'cheek', CHEEK, [[0.55, 0.25, 0.8], [0.8, 0.0, 0.6], [0.95, -0.2, 0.2], [0.7, 0.35, -0.3]], 0.012, 'A', 1.6, 'cheeks'),
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.038 }, at: [0.05, 0.02, 0.09], rot: [0, 26, 0] },
    ...satinEar({ parent: 'head', at: [0.055, 0.08, -0.045], rot: [-62, -8, -14], r: [0.048, 0.19, 0.014], slot: 'P', inner: '#E6C9E4', rim: 'A', rimGlow: 1.5, rimArc: 250, fx: true }),
    // --- storm membranes: the limbs ride inside the flap node so they spread with the sails ---
    { name: 'glideN', parent: 'body', mirror: true, prim: { t: 'none' }, at: [0.1, 0.0, 0.0], rot: [0, 0, 16], anim: ['flap'] },
    { name: 'glide', parent: 'glideN', mirror: true, mirrorGeom: true, prim: { t: 'extrude', shape: 'X_glide', w: MW, h: MH, depth: 0.006 }, rot: [90, 0, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.97, emissive: 0.07, glowColor: 'A' },
    { name: 'seam', parent: 'glide', mirror: true, mirrorGeom: true, prim: { t: 'tube', pts: edge, r0: 0.007, r1: 0.007 }, slot: 'A', emissive: 1.2, mat: 'GLOW' },
    ...veins,
    { name: 'armU', parent: 'glideN', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.22, r2: 0.024 }, at: [0.02, 0.0, 0.2], rot: [0, -16, -90], blend: false },
    { name: 'armL', parent: 'armU', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.28, r2: 0.018 }, at: [0, 0.26, 0], rot: [0, 0, 3], blend: false },
    { name: 'hand', parent: 'armL', mirror: true, prim: { t: 'sphere', r: [0.03, 0.035, 0.025] }, at: [0, 0.32, 0], slot: 'W', blend: false },
    { name: 'legU', parent: 'glideN', mirror: true, prim: { t: 'capsule', r: 0.034, len: 0.22, r2: 0.026 }, at: [0.01, -0.02, -0.2], rot: [0, 12, -90], blend: false },
    { name: 'legL', parent: 'legU', mirror: true, prim: { t: 'capsule', r: 0.026, len: 0.26, r2: 0.02 }, at: [0, 0.26, 0], rot: [0, 0, -3], blend: false },
    { name: 'foot', parent: 'legL', mirror: true, prim: { t: 'sphere', r: [0.034, 0.04, 0.028] }, at: [0, 0.31, 0], slot: 'W', blend: false },
    // --- long tail ending in a crackling orb ---
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 12, r0: 0.05, r1: 0.02, len: 1.0, bend: [-9, 0, 7] }, at: [0, 0.0, -0.32], rot: [-92, 0, 0], anim: ['wave'] },
    { name: 'bulbCap', parent: 'tailTip', prim: { t: 'cyl', r: 0.024, h: 0.02, r2: 0.03 }, at: [0, -0.008, 0], slot: '#ECE8F4', mat: 'SHELL' },
    { name: 'bulb', parent: 'tailTip', prim: { t: 'sphere', r: 0.07 }, at: [0, 0.055, 0], slot: 'A', emissive: 1.5, mat: 'GLOW', anim: ['fx:tail', 'fx:fork'] },
    { name: 'spark', parent: 'bulb', mirror: true, prim: { t: 'cone', r: 0.012, h: 0.06 }, at: [0.04, 0.03, 0], rot: [0, 0, -50], slot: 'A+', emissive: 1.5, mat: 'GLOW', lod: 0, anim: ['sway'] },
  ],
};
