// c02 Crackleap — f01 stage 2, electric (v3 flagship line, DECISIONS D31; design/creatures.md §4 c02 v3).
// Sprightly glider-sprinter: an upright, forward-leaning runner on long digitigrade legs, silver-lilac fleece with a
// cream bib and neck ruff, long swept-back satin ears with crackling rims, capacitor freckles, furry gliding membranes
// from wrist to ankle and a longer coiled tail ending in a glowing bulb (family motif of the f01 line).
import type { SpeciesVisual } from '../assemble';
import { freckles, satinEar } from './_kit';

const CHEEK: [number, number, number] = [0.065, 0.055, 0.055];

export const c02: SpeciesVisual = {
  id: 'c02',
  H: 0.9,
  colors: { P: '#B4A6CE', S: '#8E80B8', A: '#34A8FF', W: '#F2E8D8', D: '#3A3044' },
  mat: 'FUR',
  furLen: 0.018,
  rim: '#B8E4FF',
  rimStrength: 0.4,
  gaze: 0.5,
  eye: { shape: 'almond', sclera: '#FBF8F2', iris: '#2E5BD6', irisRatio: 0.74, pupil: 'round', pupilRatio: 0.44, highlights: 2, lid: 0.1, lidAngle: -2, outline: '#2A2433' },
  mouth: { style: 'smile', color: '#4A3346', inner: '#C65A78' },
  rig: { type: 'BIPED', gaitHz: 3.2, stride: 30, bounce: 0.05, breath: 0.03, breathHz: 0.8, waveAmp: 7, waveHz: 1.1, flapAmp: 8, flapHz: 1.2, attack: 'spin', special: 'cast', faint: 'forward', lean: 12 },
  parts: [
    { name: 'pelvis', prim: { t: 'sphere', r: [0.12, 0.11, 0.12] }, at: [0, 0.4, -0.02] },
    { name: 'torso', parent: 'pelvis', prim: { t: 'sphere', r: [0.13, 0.19, 0.12] }, at: [0, 0.16, 0.02], rot: [16, 0, 0], anim: ['br', 'fx:body'] },
    { name: 'bib', parent: 'torso', prim: { t: 'sphere', r: [0.1, 0.14, 0.07] }, at: [0, 0.0, 0.07], slot: 'W', fluffy: 0.005 },
    { name: 'ruff', parent: 'torso', prim: { t: 'sphere', r: [0.15, 0.075, 0.13] }, at: [0, 0.15, 0.0], slot: 'W', fluffy: 0.008, fur: 1.8 },
    // --- head ---
    { name: 'head', parent: 'torso', prim: { t: 'sphere', r: [0.15, 0.135, 0.145] }, at: [0, 0.27, 0.05], rot: [-16, 0, 0], anim: ['look'], blend: 0.04 },
    { name: 'tuft', parent: 'head', prim: { t: 'sphere', r: [0.05, 0.045, 0.06] }, at: [0, 0.12, 0.02], rot: [-25, 0, 0], slot: 'P+', fluffy: 0.008, fur: 1.8 },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.07, 0.05, 0.06] }, at: [0, -0.055, 0.112], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.02, 0.014, 0.013] }, at: [0, 0.025, 0.056], slot: 'D', mat: 'SKIN_WET' },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.024, w: 1.5 }, at: [0, -0.02, 0.055], rot: [18, 0, 0] },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: CHEEK }, at: [0.085, -0.06, 0.07], slot: 'W', fluffy: 0.003, fur: 0.3 },
    ...freckles('freckle', 'cheek', CHEEK, [[0.62, 0.22, 0.75], [0.85, -0.05, 0.52], [0.52, -0.3, 0.8], [0.95, 0.25, 0.2]], 0.016, 'A', 1.5, 'cheeks'),
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.052 }, at: [0.068, 0.02, 0.115], rot: [0, 24, 0] },
    ...satinEar({ parent: 'head', at: [0.078, 0.12, -0.05], rot: [-38, -12, -18], r: [0.072, 0.17, 0.022], slot: 'P', inner: '#EBCFE3', rim: 'A', rimGlow: 1.3, rimArc: 230, fx: true }),
    // --- arms ---
    { name: 'upperArm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.1 }, at: [0.12, 0.1, 0.05], rot: [150, 0, 18], anim: ['armswing'] },
    { name: 'forearm', parent: 'upperArm', mirror: true, prim: { t: 'capsule', r: 0.028, len: 0.1 }, at: [0, 0.15, 0], rot: [-55, 0, 0] },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.036, 0.03, 0.042] }, at: [0, 0.14, 0], slot: 'W' },
    ...freckles('armFreckle', 'forearm', [0.028, 0.08, 0.028], [[0.3, 0.2, 0.9], [0.3, -0.25, 0.9]], 0.011, 'A', 1.3, undefined, [0, 0.08, 0]),
    // --- furry gliding membranes from the arm to the hip ---
    { name: 'pataN', parent: 'torso', mirror: true, prim: { t: 'none' }, at: [0.115, 0.08, 0.0], rot: [0, 0, 8], anim: ['flap'] },
    { name: 'patagium', parent: 'pataN', mirror: true, mirrorGeom: true, prim: { t: 'extrude', shape: 'X_patagium', w: 0.26, h: 0.14, depth: 0.012 }, rot: [0, 90, -78], slot: 'S' },
    // --- long digitigrade legs ---
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'sphere', r: [0.075, 0.12, 0.1] }, at: [0.1, -0.03, 0.01] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.042, len: 0.12, r2: 0.034 }, at: [0, -0.08, 0.02], rot: [215, 0, 0], anim: ['gait:L'] },
    { name: 'meta', parent: 'shin', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.08 }, at: [0, 0.162, 0], rot: [-50, 0, 0], anim: ['knee'] },
    { name: 'foot', parent: 'meta', mirror: true, prim: { t: 'sphere', r: [0.045, 0.03, 0.09] }, at: [0, 0.13, -0.04], rot: [15, 0, 0], slot: 'W' },
    // --- longer coiled tail with the glowing bulb ---
    { name: 'tail', parent: 'pelvis', prim: { t: 'none' }, chain: { n: 11, r0: 0.042, r1: 0.024, len: 0.85, bend: [-30, 0, 12] }, at: [0, 0.02, -0.1], rot: [-120, 0, 0], anim: ['wave'] },
    { name: 'bulbCap', parent: 'tailTip', prim: { t: 'cyl', r: 0.03, h: 0.025, r2: 0.036 }, at: [0, -0.01, 0], slot: '#ECE8F4', mat: 'SHELL' },
    { name: 'bulb', parent: 'tailTip', prim: { t: 'sphere', r: 0.058 }, at: [0, 0.06, 0], slot: 'A', emissive: 1.4, mat: 'GLOW', anim: ['fx:tail', 'fx:fork'] },
  ],
};
