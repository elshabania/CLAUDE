// c01 Fizzkit — f01 stage 1, electric (v3 flagship redesign, DECISIONS D31; design/creatures.md §4 c01 v3).
// Small round dormouse/sugar-glider hybrid: silver-lilac fleece, cream face and bib, oversized satin ears whose rims
// crackle with static (electric blue), glowing capacitor-freckles on the cheeks, soft furry gliding membranes from
// wrist to ankle and a springy coiled tail ending in a little glowing bulb. Never yellow, no red cheeks, no zig-zag tail,
// no black-tipped ears.
import type { SpeciesVisual } from '../assemble';
import { freckles, satinEar } from './_kit';

const CHEEK: [number, number, number] = [0.12, 0.1, 0.1];

export const c01: SpeciesVisual = {
  id: 'c01',
  H: 0.35,
  colors: { P: '#C8BCDB', S: '#F2E9DA', A: '#3CB6FF', W: '#F6EFE4', D: '#3E3448' },
  mat: 'FUR',
  furLen: 0.03,
  rim: '#BDE6FF',
  rimStrength: 0.4,
  gaze: 0.55,
  eye: { shape: 'round', sclera: '#FBF8F2', iris: '#2E5BD6', irisRatio: 0.78, pupil: 'round', pupilRatio: 0.5, highlights: 3, lid: 0, lidAngle: 6, outline: '#2A2433' },
  mouth: { style: 'smile', color: '#4A3346', inner: '#C65A78' },
  rig: { type: 'QUAD', gaitHz: 3.2, stride: 26, bounce: 0.08, hop: true, breath: 0.04, breathHz: 0.9, waveAmp: 7, waveHz: 1.3, flapAmp: 6, flapHz: 1.4, attack: 'lunge', special: 'cast', faint: 'side', lean: 5 },
  parts: [
    // --- round fleecy body with a cream bib ---
    { name: 'body', prim: { t: 'sphere', r: [0.27, 0.24, 0.3] }, at: [0, 0.31, -0.02], fluffy: 0.006, anim: ['br', 'fx:body'] },
    { name: 'chest', parent: 'body', prim: { t: 'sphere', r: [0.19, 0.18, 0.15] }, at: [0, -0.03, 0.17], slot: 'W', fluffy: 0.006 },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.2, 0.13, 0.22] }, at: [0, -0.1, 0.0], slot: 'W' },
    // --- big head (mascot proportion: head ≈ body) ---
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.3, 0.27, 0.27] }, at: [0, 0.28, 0.17], anim: ['look'], blend: 0.07 },
    { name: 'tuft', parent: 'head', prim: { t: 'sphere', r: [0.075, 0.065, 0.08] }, at: [0, 0.245, 0.03], rot: [-20, 0, 0], slot: 'P+', fluffy: 0.01, fur: 1.8 },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: CHEEK }, at: [0.15, -0.1, 0.13], slot: 'W', fluffy: 0.004, fur: 0.3 },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.075, 0.085] }, at: [0, -0.085, 0.2], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.03, 0.021, 0.02] }, at: [0, 0.035, 0.078], slot: 'D', mat: 'SKIN_WET' },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.034, w: 1.4 }, at: [0, -0.028, 0.08], rot: [18, 0, 0] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.105 }, at: [0.125, 0.03, 0.2], rot: [0, 24, 0] },
    ...freckles('freckle', 'cheek', CHEEK, [[0.62, 0.2, 0.76], [0.84, -0.1, 0.54], [0.5, -0.3, 0.82]], 0.027, 'A', 1.5, 'cheeks'),
    // --- oversized satin ears with static-crackling rims ---
    ...satinEar({ parent: 'head', at: [0.18, 0.2, -0.07], rot: [-8, -18, -26], r: [0.15, 0.2, 0.045], slot: 'P', inner: '#EBCFE3', rim: 'A', rimGlow: 1.3, fx: true }),
    // --- stubby legs with cream paws ---
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.06, len: 0.05 }, at: [0.14, -0.13, 0.17], rot: [180, 0, 0], anim: ['gait:FL'] },
    { name: 'pawF', parent: 'legF', mirror: true, prim: { t: 'sphere', r: [0.065, 0.045, 0.08] }, at: [0, 0.14, -0.03], slot: 'W' },
    { name: 'haunch', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.11, 0.13, 0.14] }, at: [0.16, -0.06, -0.13], fluffy: 0.004 },
    { name: 'legB', parent: 'haunch', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.03 }, at: [0, -0.08, 0.03], rot: [180, 0, 0], anim: ['gait:BL'] },
    { name: 'pawB', parent: 'legB', mirror: true, prim: { t: 'sphere', r: [0.065, 0.042, 0.1] }, at: [0, 0.13, -0.05], slot: 'W' },
    // --- furry gliding membranes, wrist to ankle (folded along the flanks) ---
    { name: 'pataN', parent: 'body', mirror: true, prim: { t: 'none' }, at: [0.245, -0.03, 0.13], rot: [0, 0, 12], anim: ['flap'] },
    { name: 'patagium', parent: 'pataN', mirror: true, mirrorGeom: true, prim: { t: 'extrude', shape: 'X_patagium', w: 0.3, h: 0.15, depth: 0.014 }, rot: [0, 90, 0], slot: 'P-' },
    // --- springy coiled tail with a glowing bulb ---
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 9, r0: 0.05, r1: 0.03, len: 0.8, bend: [-36, 0, 16] }, at: [0, 0.02, -0.27], rot: [-55, 0, 0], anim: ['wave'] },
    { name: 'bulbCap', parent: 'tailTip', prim: { t: 'cyl', r: 0.036, h: 0.03, r2: 0.042 }, at: [0, -0.01, 0], slot: '#ECE8F4', mat: 'SHELL' },
    { name: 'bulb', parent: 'tailTip', prim: { t: 'sphere', r: 0.072 }, at: [0, 0.075, 0], slot: 'A', emissive: 1.4, mat: 'GLOW', anim: ['fx:tail', 'fx:fork'] },
  ],
};
