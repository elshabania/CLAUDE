// c06 Smoulderam — f02 stage 3, fire / gale (v3 flagship redesign, DECISIONS D31; design/creatures.md §4 c06 v3).
// Majestic winged fire dragon: obsidian-charcoal scales, great spiral ram horns with burning wick tips (the line's
// motif), a flowing smoke-and-ember ruff of tapered tufts around the neck and shoulders, molten fissures glowing along
// the chest, throat and jaw, broad raised bat-like wings with ember-lit membranes, a heavy chest on powerful legs, and a
// long tapering tail ending in a basalt club (no tail flame).
// Palette: charcoal/obsidian + ember orange/gold + ash cream (never orange body + cream belly + teal wing lining).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { dragonWing, hornSpiral, tufts, wickHorn } from './_kit';

const HORN = hornSpiral(1.18, 0.16, 0.07, 0.12, 44);
const horns = (['L', 'R'] as const).flatMap((s) => wickHorn(s, { parent: 'head', at: [0.08, 0.07, -0.07], rot: [0, -6, -20], pts: HORN, r0: 0.068, r1: 0.02, bone: '#D5C3A3', tip: 'A', flame: 'A', split: 0.9, ridge: [15, 0.13], flameSize: 0.055, fx: 'horns', glow: 1.3 }));
const BONE = '#E4D6BE';
const DARK = '#1B1518';
const claws = (parent: string, z: number, r: number): PartDef[] => [-1, 0, 1].map((k, i) => ({
  name: `${parent}Claw${i}`, parent, mirror: true, prim: { t: 'cone', r, h: r * 2.8 }, at: [k * r * 2.4, 0.012, z], rot: [-90, 0, 0], slot: BONE, mat: 'SHELL',
}) as PartDef);
const spikes = (parent: string, list: [number, number, number, number][]): PartDef[] => list.map(([y, z, s, tilt], i) => ({
  name: `${parent}Spike${i}`, parent, prim: { t: 'cone', r: s * 0.42, h: s }, at: [0, y, z], rot: [-tilt, 0, 0], slot: DARK, mat: 'SHELL',
}) as PartDef);
const tailSpikes: PartDef[] = [1, 3, 5, 7, 9].map((i) => ({
  name: `tailSpike${i}`, parent: `tail${i}`, prim: { t: 'cone', r: 0.032 - i * 0.0022, h: 0.085 - i * 0.005 }, at: [0, 0.05, 0.1 - i * 0.0065], rot: [58, 0, 0], slot: DARK, mat: 'SHELL', lod: 1,
}) as PartDef);
// flowing ruff: [x, y, z, direction, len, r] in the parent frame (neck frames: +Y runs up the neck, -Z is the nape)
const back: V3 = [0, -0.7, -0.7];
const side: V3 = [0.65, -0.45, -0.6];
const low: V3 = [0.75, -0.55, 0.2];
const ruff: PartDef[] = [
  ...tufts('ruffA', 'neck3', [[0, 0.03, -0.05, back, 0.13, 0.055], [0.05, 0.03, -0.03, side, 0.11, 0.05]], 'S', '#A0461E', 0.5),
  ...tufts('ruffB', 'neck2', [[0, 0.04, -0.06, back, 0.16, 0.065], [0.06, 0.04, -0.03, side, 0.14, 0.06], [0.07, 0.0, 0.03, low, 0.1, 0.05]], 'S', '#A0461E', 0.55),
  ...tufts('ruffC', 'neck1', [[0, 0.04, -0.07, back, 0.19, 0.075], [0.07, 0.04, -0.04, side, 0.17, 0.07], [0.085, 0.0, 0.03, low, 0.13, 0.06]], 'S-', '#963E1A', 0.6),
  ...tufts('ruffC2', 'neck0', [[0, 0.1, -0.09, back, 0.2, 0.08], [0.09, 0.08, -0.05, side, 0.19, 0.075], [0.11, 0.05, 0.05, low, 0.15, 0.065]], 'S-', '#963E1A', 0.6),
  ...tufts('ruffD', 'chest', [[0, 0.27, -0.04, [0, 0.1, -1], 0.2, 0.08], [0.13, 0.22, -0.02, [0.8, -0.1, -0.55], 0.2, 0.075], [0.2, 0.12, 0.05, [0.85, -0.5, 0.1], 0.16, 0.065], [0.1, 0.26, 0.07, [0.45, 0.2, -0.85], 0.17, 0.07]], 'S-', '#8A3618', 0.65),
  // smoky collar mass the tufts grow out of
  { name: 'collar0', parent: 'neck0', prim: { t: 'sphere', r: [0.17, 0.14, 0.15] }, at: [0, 0.1, -0.03], slot: 'S-', mat: 'FUR', fluffy: 0.01, fissure: 0.45, fur: 1.6 },
  { name: 'collar1', parent: 'neck1', prim: { t: 'sphere', r: [0.14, 0.13, 0.13] }, at: [0, 0.06, -0.04], slot: 'S-', mat: 'FUR', fluffy: 0.01, fissure: 0.4, fur: 1.6 },
  { name: 'collar2', parent: 'neck2', prim: { t: 'sphere', r: [0.11, 0.11, 0.1] }, at: [0, 0.05, -0.05], slot: 'S', mat: 'FUR', fluffy: 0.01, fissure: 0.35, fur: 1.6 },
  { name: 'collarS', parent: 'chest', prim: { t: 'sphere', r: [0.25, 0.12, 0.2] }, at: [0, 0.22, -0.02], slot: '#6E655F', mat: 'FUR', fluffy: 0.012, fissure: 0.5, fur: 1.6 },
  ...tufts('ruffH', 'head', [[0, 0.07, -0.1, [0, -0.2, -1], 0.11, 0.05], [0.05, 0.02, -0.11, [0.5, -0.4, -0.8], 0.09, 0.045]], 'S', '#A0461E', 0.4),
];

export const c06: SpeciesVisual = {
  id: 'c06',
  H: 1.9,
  colors: { P: '#2B2428', S: '#9C928A', A: '#FF6A1A', W: '#4A3632', D: '#150F10' },
  mat: 'SCALE',
  furLen: 0.01,
  fissureColor: 'A',
  fissureGlow: 1.4,
  rim: '#FF9A5A',
  rimStrength: 0.35,
  gaze: 0.35,
  eye: { shape: 'almond', sclera: '#3A2620', iris: '#FFB23E', irisRatio: 0.84, pupil: 'v-oval', pupilRatio: 0.4, highlights: 2, lid: 0.2, lidAngle: -14, glow: '#FF9A3A', outline: '#140E0E' },
  mouth: { style: 'none' },
  rig: { type: 'QUAD', gaitHz: 0.9, stride: 16, bounce: 0.012, breath: 0.015, breathHz: 0.35, waveAmp: 5, waveHz: 0.45, flapAmp: 9, flapHz: 0.4, attack: 'rear', special: 'cast', faint: 'side', lean: 3 },
  parts: [
    // --- heavy chest and shoulders, barrel, hips ---
    { name: 'chest', prim: { t: 'sphere', r: [0.27, 0.29, 0.28] }, at: [0, 0.6, 0.24], anim: ['br', 'fx:body'] },
    { name: 'throatPlate', parent: 'chest', prim: { t: 'sphere', r: [0.14, 0.22, 0.12] }, at: [0, -0.03, 0.18], slot: 'W', fissure: 0.75 },
    { name: 'barrel', prim: { t: 'sphere', r: [0.22, 0.21, 0.33] }, at: [0, 0.56, -0.12], anim: ['br'] },
    { name: 'bellyPlate', parent: 'barrel', prim: { t: 'sphere', r: [0.16, 0.13, 0.34] }, at: [0, -0.09, 0.05], slot: 'W', fissure: 0.45 },
    { name: 'hips', prim: { t: 'sphere', r: [0.18, 0.19, 0.2] }, at: [0, 0.56, -0.46] },
    ...spikes('barrel', [[0.21, 0.14, 0.08, 32], [0.22, 0.0, 0.085, 32], [0.21, -0.14, 0.08, 32]]),
    ...spikes('hips', [[0.19, 0.04, 0.075, 38], [0.17, -0.1, 0.065, 45]]),
    // --- long elegant neck (upright S-curve) with a glowing throat ---
    { name: 'neck', parent: 'chest', prim: { t: 'none' }, chain: { n: 5, r0: 0.13, r1: 0.078, len: 0.6, bend: [-5, 0, 0] }, at: [0, 0.16, 0.12], rot: [22, 0, 0] },
    { name: 'throat', parent: 'neck0', prim: { t: 'capsule', r: 0.075, len: 0.44, r2: 0.05 }, at: [0, 0.0, 0.075], rot: [-5, 0, 0], slot: 'W', fissure: 0.75, blend: 0.05 },
    // --- head: proud upward carriage, long snout, jaw line, brow ridges ---
    { name: 'head', parent: 'neckTip', prim: { t: 'sphere', r: [0.11, 0.1, 0.14] }, at: [0, 0.05, 0.04], rot: [-12, 0, 0], anim: ['look'], blend: 0.05 },
    { name: 'snout', parent: 'head', prim: { t: 'capsule', r: 0.074, len: 0.2, r2: 0.056 }, at: [0, -0.02, 0.055], rot: [92, 0, 0] },
    { name: 'jaw', parent: 'head', prim: { t: 'capsule', r: 0.06, len: 0.19, r2: 0.04 }, at: [0, -0.07, 0.02], rot: [99, 0, 0], slot: 'W', fissure: 1, anim: ['jaw', 'fx:mouth'] },
    { name: 'jawAngle', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.035, 0.055, 0.06] }, at: [0.075, -0.06, 0.0], blend: 0.03 },
    { name: 'nostril', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.018, 0.011, 0.013] }, at: [0.033, 0.012, 0.35], slot: 'D', anim: ['fx:nostrils'] },
    { name: 'noseRidge', parent: 'head', prim: { t: 'capsule', r: 0.03, len: 0.2, r2: 0.018 }, at: [0, 0.045, 0.06], rot: [95, 0, 0], blend: 0.025 },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.036, len: 0.11, r2: 0.018 }, at: [0.055, 0.062, 0.075], rot: [-82, 0, -14], blend: 0.02 },
    { name: 'cheekSpike', parent: 'head', mirror: true, prim: { t: 'cone', r: 0.026, h: 0.11 }, at: [0.08, -0.06, -0.04], rot: [-115, 0, -30], slot: BONE, mat: 'SHELL', lod: 1 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.042 }, at: [0.07, 0.03, 0.1], rot: [0, 34, 0] },
    ...horns,
    ...ruff,
    // --- broad raised bat-like wings, ember-lit membranes (≈ 4 m span) ---
    ...dragonWing({ parent: 'chest', at: [0.13, 0.25, -0.1], rot: [-14, 24, 44], plane: [0, 0, 0], w: 1.2, h: 0.8, bone: 'P', membrane: '#4A1C12', vein: 'A', memGlow: 0.22, veinGlow: 1.2, boneR: 0.034, opacity: 0.93 }),
    // --- powerful legs ---
    { name: 'shoulder', parent: 'chest', mirror: true, prim: { t: 'sphere', r: [0.13, 0.19, 0.16] }, at: [0.17, -0.07, 0.0] },
    { name: 'forearm', parent: 'shoulder', mirror: true, prim: { t: 'capsule', r: 0.088, len: 0.22, r2: 0.07 }, at: [0, -0.1, 0.02], rot: [180, 0, 0], anim: ['gait:FL', 'fx:ground'] },
    { name: 'pawF', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.1, 0.06, 0.13] }, at: [0, 0.36, -0.04] },
    ...claws('pawF', -0.125, 0.024),
    { name: 'thigh', parent: 'hips', mirror: true, prim: { t: 'sphere', r: [0.15, 0.21, 0.19] }, at: [0.14, -0.03, 0.02] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.088, len: 0.12, r2: 0.072 }, at: [0, -0.1, -0.02], rot: [200, 0, 0], anim: ['gait:BL'] },
    { name: 'meta', parent: 'shin', mirror: true, prim: { t: 'capsule', r: 0.066, len: 0.06 }, at: [0, 0.27, 0], rot: [-42, 0, 0] },
    { name: 'foot', parent: 'meta', mirror: true, prim: { t: 'sphere', r: [0.1, 0.06, 0.14] }, at: [0, 0.15, -0.04], rot: [22, 0, 0] },
    ...claws('foot', -0.135, 0.024),
    // --- long tapering tail ending in a basalt club ---
    { name: 'tail', parent: 'hips', prim: { t: 'none' }, chain: { n: 11, r0: 0.13, r1: 0.045, len: 1.45, bend: [-2.5, 0, 0] }, at: [0, 0.02, -0.16], rot: [-100, 0, 0], anim: ['wave'] },
    ...tailSpikes,
    { name: 'club', parent: 'tailTip', prim: { t: 'sphere', r: [0.17, 0.22, 0.15] }, at: [0, 0.1, 0], slot: '#35302F', mat: 'STONE', fissure: 0.9, blend: 0.06 },
    { name: 'clubKnob', parent: 'club', mirror: true, prim: { t: 'cone', r: 0.06, h: 0.13 }, at: [0.12, 0.02, 0.0], rot: [0, 0, -80], slot: '#35302F', mat: 'STONE', blend: 0.03 },
    { name: 'clubKnobT', parent: 'club', prim: { t: 'cone', r: 0.06, h: 0.13 }, at: [0, 0.02, 0.1], rot: [80, 0, 0], slot: '#35302F', mat: 'STONE', blend: 0.03 },
    { name: 'clubKnobB', parent: 'club', prim: { t: 'cone', r: 0.055, h: 0.12 }, at: [0, 0.0, -0.1], rot: [-80, 0, 0], slot: '#35302F', mat: 'STONE', blend: 0.03 },
    { name: 'clubKnobE', parent: 'club', prim: { t: 'cone', r: 0.065, h: 0.12 }, at: [0, 0.18, 0], slot: '#35302F', mat: 'STONE', blend: 0.03 },
  ],
};
