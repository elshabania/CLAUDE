// c05 Kilnhorn — f02 stage 2, fire (v3 flagship redesign, DECISIONS D31; design/creatures.md §4 c05 v3).
// Bipedal young drake: upright and forward-leaning on strong digitigrade legs, charcoal scales with warm ash belly
// plates, horns that curl a full turn with ember-lit ridges and burning wick tips, a smouldering fleece ruff over the
// shoulders, small ember-lit wings and a tail that is starting to grow its basalt club.
import type { PartDef, SpeciesVisual } from '../assemble';
import { dragonWing, hornSpiral, wickHorn } from './_kit';

const HORN = hornSpiral(1.05, 0.085, 0.05, 0.06, 28);
const horns = (['L', 'R'] as const).flatMap((s) => wickHorn(s, { parent: 'head', at: [0.07, 0.085, -0.04], rot: [0, 0, -20], pts: HORN, r0: 0.036, r1: 0.017, bone: '#D6C3A2', tip: 'A', flame: 'A', split: 0.84, ridge: [9, 0.16], flameSize: 0.028, fx: 'horns' }));
const claws = (parent: string, n: number, r: number, z: number): PartDef[] => Array.from({ length: n }, (_, i) => ({
  name: `${parent}Claw${i}`, parent, mirror: true, prim: { t: 'cone', r, h: r * 2.6 }, at: [(i - (n - 1) / 2) * r * 2.2, 0.01, z], rot: [-90, 0, 0], slot: '#E8DCC6', mat: 'SHELL', lod: 0,
}) as PartDef);

export const c05: SpeciesVisual = {
  id: 'c05',
  H: 1.0,
  colors: { P: '#2E282E', S: '#C4B8A8', A: '#FF6A1A', W: '#96664E', D: '#1C1416' },
  mat: 'SCALE',
  furLen: 0.016,
  fissureColor: 'A',
  fissureGlow: 1.5,
  rim: '#FFB070',
  rimStrength: 0.35,
  gaze: 0.4,
  eye: { shape: 'almond', sclera: '#FFF3DE', iris: '#FFB02E', irisRatio: 0.72, pupil: 'round', pupilRatio: 0.38, highlights: 2, lid: 0.14, lidAngle: -8, outline: '#1C1416' },
  mouth: { style: 'fang', color: '#1C1416', inner: '#A63A2A' },
  rig: { type: 'BIPED', gaitHz: 2.4, stride: 28, bounce: 0.03, breath: 0.025, breathHz: 0.6, waveAmp: 7, waveHz: 0.9, flapAmp: 14, flapHz: 1.6, attack: 'rear', special: 'cast', faint: 'side', lean: 10 },
  parts: [
    { name: 'pelvis', prim: { t: 'sphere', r: [0.15, 0.14, 0.14] }, at: [0, 0.42, -0.04] },
    { name: 'torso', parent: 'pelvis', prim: { t: 'sphere', r: [0.17, 0.23, 0.15] }, at: [0, 0.2, 0.04], rot: [15, 0, 0], anim: ['br', 'fx:body'] },
    { name: 'belly', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.2, 0.08] }, at: [0, -0.03, 0.09], slot: 'W', fissure: 0.25 },
    // smouldering fleece ruff over the shoulders
    { name: 'ruff', parent: 'torso', prim: { t: 'sphere', r: [0.21, 0.1, 0.17] }, at: [0, 0.19, -0.01], slot: 'S', mat: 'FUR', fluffy: 0.012, fissure: 0.7, fur: 1.8 },
    { name: 'ruffS', parent: 'torso', mirror: true, prim: { t: 'sphere', r: [0.1, 0.1, 0.1] }, at: [0.14, 0.15, 0.03], slot: 'S', mat: 'FUR', fluffy: 0.012, fissure: 0.7, fur: 1.8 },
    { name: 'ruffF', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.08, 0.08] }, at: [0, 0.14, 0.1], slot: 'S', mat: 'FUR', fluffy: 0.012, fissure: 0.6, fur: 1.6 },
    // --- neck + head ---
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.07, len: 0.08 }, at: [0, 0.24, 0.03], rot: [22, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.12, 0.11, 0.13] }, at: [0, 0.13, 0.02], rot: [-37, 0, 0], anim: ['look'], blend: 0.03 },
    { name: 'snout', parent: 'head', prim: { t: 'capsule', r: 0.07, len: 0.06, r2: 0.058 }, at: [0, -0.035, 0.06], rot: [90, 0, 0] },
    { name: 'jaw', parent: 'head', prim: { t: 'capsule', r: 0.05, len: 0.07, r2: 0.04 }, at: [0, -0.075, 0.04], rot: [96, 0, 0], slot: 'W', fissure: 0.6, anim: ['jaw', 'fx:mouth'] },
    { name: 'nostril', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.013, 0.009, 0.009] }, at: [0.03, -0.0, 0.195], slot: 'D', anim: ['fx:nostrils'] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.035, w: 1.6 }, at: [0, -0.06, 0.18], rot: [30, 0, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.022, len: 0.06, r2: 0.014 }, at: [0.035, 0.065, 0.075], rot: [0, 0, -72], blend: 0.012 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.045 }, at: [0.068, 0.028, 0.095], rot: [0, 28, 0] },
    ...horns,
    // --- small ember-lit wings ---
    ...dragonWing({ parent: 'torso', at: [0.1, 0.18, -0.1], rot: [-10, 30, 42], plane: [0, 0, 0], w: 0.62, h: 0.46, bone: 'P', membrane: '#4A2218', vein: 'A', memGlow: 0.2, veinGlow: 1.1, boneR: 0.02 }),
    // --- dorsal spines down the back and tail ---
    ...[[0.2, -0.1, 0.06], [0.08, -0.14, 0.055], [-0.05, -0.14, 0.05]].map(([y, z, h], i) => ({ name: `spine${i}`, parent: 'torso', prim: { t: 'cone', r: h * 0.45, h }, at: [0, y, z], rot: [-70, 0, 0], slot: '#1C1416', mat: 'SHELL' }) as PartDef),
    // --- arms ---
    { name: 'upperArm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.048, len: 0.1, r2: 0.04 }, at: [0.15, 0.11, 0.04], rot: [160, 0, 16], anim: ['armswing'] },
    { name: 'forearm', parent: 'upperArm', mirror: true, prim: { t: 'capsule', r: 0.04, len: 0.1, r2: 0.034 }, at: [0, 0.16, 0], rot: [-55, 0, 0] },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.042, 0.036, 0.045] }, at: [0, 0.15, 0] },
    ...claws('hand', 3, 0.012, 0.035).map((c) => ({ ...c, at: [c.at![0], 0.035, 0.03] as [number, number, number], rot: [0, 0, 0] as [number, number, number] })),
    // --- strong digitigrade legs ---
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'sphere', r: [0.1, 0.15, 0.13] }, at: [0.11, -0.03, 0.01] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.058, len: 0.1, r2: 0.045 }, at: [0, -0.09, 0.03], rot: [215, 0, 0], anim: ['gait:L'] },
    { name: 'meta', parent: 'shin', mirror: true, prim: { t: 'capsule', r: 0.042, len: 0.07, r2: 0.036 }, at: [0, 0.17, 0], rot: [-50, 0, 0], anim: ['knee'] },
    { name: 'foot', parent: 'meta', mirror: true, prim: { t: 'sphere', r: [0.055, 0.035, 0.1] }, at: [0, 0.13, -0.05], rot: [15, 0, 0] },
    ...claws('foot', 3, 0.016, -0.1).map((c) => ({ ...c, rot: [-90, 0, 0] as [number, number, number] })),
    // --- tail growing its club ---
    { name: 'tail', parent: 'pelvis', prim: { t: 'none' }, chain: { n: 7, r0: 0.085, r1: 0.035, len: 0.72, bend: [7, 0, 0] }, at: [0, 0.0, -0.12], rot: [-118, 0, 0], anim: ['wave'] },
    { name: 'club', parent: 'tailTip', prim: { t: 'sphere', r: [0.06, 0.05, 0.075] }, at: [0, 0.035, 0], slot: '#3A3236', mat: 'STONE', fissure: 0.9, blend: 0.025 },
    { name: 'clubKnob', parent: 'club', mirror: true, prim: { t: 'cone', r: 0.03, h: 0.05 }, at: [0.04, 0.0, 0.0], rot: [0, 0, -80], slot: '#3A3236', mat: 'STONE', blend: 0.015 },
    ...[1, 3, 5].map((i) => ({ name: `tailSpine${i}`, parent: `tail${i}`, prim: { t: 'cone', r: 0.024, h: 0.05 }, at: [0, 0.04, 0.065 - i * 0.005], rot: [60, 0, 0], slot: '#1C1416', mat: 'SHELL' }) as PartDef),
  ],
};
