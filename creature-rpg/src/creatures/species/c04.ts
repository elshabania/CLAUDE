// c04 Wickwool — f02 stage 1, fire (v3 flagship redesign, DECISIONS D31; design/creatures.md §4 c04 v3).
// Woolly hatchling drake: a chubby charcoal drake with a fleecy ash-cream ember mane (embers glint between the curls),
// horn nubs whose tips burn like candle wicks (the line's ram-horn + wick motif), big amber eyes, stubby ember-lit
// wings and a short tail ending in a little basalt knob (the stage-3 club in miniature). No tail flame.
import type { PartDef, SpeciesVisual } from '../assemble';
import { dragonWing, hornSpiral, wickHorn } from './_kit';

const HORN = hornSpiral(0.75, 0.06, 0.045, 0.05, 16);
const horns = (['L', 'R'] as const).flatMap((s) => wickHorn(s, { parent: 'head', at: [0.085, 0.13, -0.01], rot: [0, 0, -18], pts: HORN, r0: 0.04, r1: 0.028, bone: '#D9C7A8', tip: 'A', flame: 'A', split: 0.72, flameSize: 0.034, fx: 'horns' }));
const claws = (leg: 'pawF' | 'pawB'): PartDef[] => [-0.035, 0, 0.035].map((x, i) => ({
  name: `${leg}Claw${i}`, parent: leg, mirror: true, prim: { t: 'cone', r: 0.014, h: 0.035 }, at: [x, 0.02, -0.075], rot: [-90, 0, 0], slot: '#E8DCC6', mat: 'SHELL', lod: 0,
}) as PartDef);

export const c04: SpeciesVisual = {
  id: 'c04',
  H: 0.45,
  colors: { P: '#302A31', S: '#E4D8C6', A: '#FF6A1A', W: '#9A6A52', D: '#1E1618' },
  mat: 'SCALE',
  furLen: 0.03,
  fissureColor: 'A',
  fissureGlow: 1.4,
  rim: '#FFC890',
  rimStrength: 0.35,
  gaze: 0.5,
  eye: { shape: 'round', sclera: '#FFF8EC', iris: '#F2A516', irisRatio: 0.76, pupil: 'round', pupilRatio: 0.5, highlights: 3, lid: 0, lidAngle: 8, outline: '#1E1618' },
  mouth: { style: 'smile', color: '#1E1618', inner: '#B2402E' },
  rig: { type: 'QUAD', gaitHz: 3, stride: 28, bounce: 0.07, hop: true, breath: 0.035, breathHz: 0.9, waveAmp: 8, waveHz: 1.1, flapAmp: 18, flapHz: 2.2, attack: 'lunge', special: 'cast', faint: 'side', lean: 4 },
  parts: [
    { name: 'body', prim: { t: 'sphere', r: [0.25, 0.21, 0.3] }, at: [0, 0.38, -0.02], anim: ['br', 'fx:body'] },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.16, 0.12, 0.22] }, at: [0, -0.1, 0.05], slot: 'W' },
    // --- head ---
    { name: 'neck', parent: 'body', prim: { t: 'capsule', r: 0.1, len: 0.05 }, at: [0, 0.1, 0.22], rot: [40, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.21, 0.19, 0.2] }, at: [0, 0.15, 0.04], rot: [-40, 0, 0], anim: ['look'], blend: 0.05 },
    { name: 'snout', parent: 'head', prim: { t: 'capsule', r: 0.085, len: 0.07, r2: 0.072 }, at: [0, -0.06, 0.1], rot: [92, 0, 0] },
    { name: 'snoutRidge', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.022, len: 0.06, r2: 0.012 }, at: [0.05, 0.075, 0.12], rot: [-80, 0, -12], blend: 0.015 },
    { name: 'nostril', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.016, 0.011, 0.01] }, at: [0.035, -0.02, 0.26], slot: 'D', anim: ['fx:nostrils'] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.04, w: 1.6 }, at: [0, -0.1, 0.24], rot: [30, 0, 0] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.085 }, at: [0.105, 0.035, 0.14], rot: [0, 26, 0] },
    ...horns,
    // --- fleecy ember mane (embers glint between the curls) ---
    { name: 'maneTop', parent: 'body', prim: { t: 'sphere', r: [0.2, 0.14, 0.17] }, at: [0, 0.15, 0.16], slot: 'S', mat: 'FUR', fluffy: 0.014, fissure: 0.45, fur: 1.8 },
    { name: 'maneSide', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.13, 0.13, 0.13] }, at: [0.15, 0.06, 0.16], slot: 'S', mat: 'FUR', fluffy: 0.014, fissure: 0.45, fur: 1.8 },
    { name: 'maneBack', parent: 'body', prim: { t: 'sphere', r: [0.14, 0.1, 0.14] }, at: [0, 0.19, 0.0], slot: 'S', mat: 'FUR', fluffy: 0.012, fissure: 0.3, fur: 1.6 },
    { name: 'crown', parent: 'head', prim: { t: 'sphere', r: [0.13, 0.09, 0.12] }, at: [0, 0.15, -0.03], slot: 'S', mat: 'FUR', fluffy: 0.012, fissure: 0.3, fur: 1.6 },
    // --- stubby ember-lit wings ---
    ...dragonWing({ parent: 'body', at: [0.12, 0.16, -0.06], rot: [-10, 30, 40], plane: [0, 0, 0], w: 0.42, h: 0.34, bone: 'P', membrane: '#4A2218', vein: 'A', memGlow: 0.2, veinGlow: 1.0, boneR: 0.018, lod0Veins: true }),
    // --- dorsal spine nubs down the back and tail ---
    ...[[0.19, -0.06], [0.18, -0.16]].map(([y, z], i) => ({ name: `spine${i}`, parent: 'body', prim: { t: 'cone', r: 0.03, h: 0.05 }, at: [0, y, z], rot: [-30, 0, 0], slot: '#1E1618', mat: 'SHELL' }) as PartDef),
    // --- stubby legs ---
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.07, len: 0.09 }, at: [0.14, -0.12, 0.15], rot: [180, 0, 0], anim: ['gait:FL'] },
    { name: 'pawF', parent: 'legF', mirror: true, prim: { t: 'sphere', r: [0.075, 0.05, 0.09] }, at: [0, 0.2, -0.02] },
    ...claws('pawF'),
    { name: 'thigh', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.1, 0.12, 0.12] }, at: [0.15, -0.05, -0.15] },
    { name: 'legB', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.06, len: 0.06 }, at: [0, -0.07, 0.02], rot: [180, 0, 0], anim: ['gait:BL'] },
    { name: 'pawB', parent: 'legB', mirror: true, prim: { t: 'sphere', r: [0.075, 0.05, 0.1] }, at: [0, 0.19, -0.04] },
    ...claws('pawB'),
    // --- short tail with a little basalt knob ---
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 5, r0: 0.08, r1: 0.045, len: 0.36, bend: [14, 0, 0] }, at: [0, 0.03, -0.27], rot: [-112, 0, 0], anim: ['wave'] },
    { name: 'knob', parent: 'tailTip', prim: { t: 'sphere', r: [0.06, 0.055, 0.065] }, at: [0, 0.03, 0], slot: '#3C3538', mat: 'STONE', fissure: 0.9, blend: 0.02 },
    ...[1, 3].map((i) => ({ name: `tailSpine${i}`, parent: `tail${i}`, prim: { t: 'cone', r: 0.022, h: 0.04 }, at: [0, 0.03, 0.06], rot: [60, 0, 0], slot: '#1E1618', mat: 'SHELL' }) as PartDef),
  ],
};
