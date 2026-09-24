// c06 Smoulderam — f02 stage 3, fire / gale (v3 flagship redesign, DECISIONS D31; design/creatures.md §4 c06 v3).
// Majestic winged fire dragon: obsidian-charcoal scales, great spiral ram horns with burning wick tips (the line's
// motif), a smoke-and-ember fleece mane over the neck and shoulders, molten fissures glowing along the chest, throat
// and jaw, wide wings with ember-lit membranes, powerful legs, and a long tail ending in a basalt club (no tail flame).
// Palette: charcoal/obsidian + ember orange/gold + ash cream (never orange body + cream belly + teal wing lining).
import type { PartDef, SpeciesVisual } from '../assemble';
import { dragonWing, hornSpiral, wickHorn } from './_kit';

const HORN = hornSpiral(1.12, 0.13, 0.06, 0.11, 40);
const horns = (['L', 'R'] as const).flatMap((s) => wickHorn(s, { parent: 'head', at: [0.075, 0.07, -0.05], rot: [0, -8, -22], pts: HORN, r0: 0.056, r1: 0.018, bone: '#D5C3A3', tip: 'A', flame: 'A', split: 0.88, ridge: [13, 0.14], flameSize: 0.045, fx: 'horns', glow: 1.3 }));
const BONE = '#E4D6BE';
const claws = (parent: string, z: number, r: number): PartDef[] => [-1, 0, 1].map((k, i) => ({
  name: `${parent}Claw${i}`, parent, mirror: true, prim: { t: 'cone', r, h: r * 2.8 }, at: [k * r * 2.3, 0.015, z], rot: [-90, 0, 0], slot: BONE, mat: 'SHELL',
}) as PartDef);
const spikes = (parent: string, list: [number, number, number, number][]): PartDef[] => list.map(([y, z, s, tilt], i) => ({
  name: `${parent}Spike${i}`, parent, prim: { t: 'cone', r: s * 0.45, h: s }, at: [0, y, z], rot: [-tilt, 0, 0], slot: '#1B1518', mat: 'SHELL',
}) as PartDef);
const tailSpikes: PartDef[] = [1, 3, 5, 7].map((i) => ({
  name: `tailSpike${i}`, parent: `tail${i}`, prim: { t: 'cone', r: 0.026 - i * 0.002, h: 0.07 - i * 0.005 }, at: [0, 0.05, 0.075 - i * 0.004], rot: [58, 0, 0], slot: '#1B1518', mat: 'SHELL', lod: 1,
}) as PartDef);

export const c06: SpeciesVisual = {
  id: 'c06',
  H: 1.9,
  colors: { P: '#2B2428', S: '#C4B9AB', A: '#FF6A1A', W: '#4A3632', D: '#150F10' },
  mat: 'SCALE',
  furLen: 0.01,
  fissureColor: 'A',
  fissureGlow: 1.6,
  rim: '#FF9A5A',
  rimStrength: 0.35,
  gaze: 0.35,
  eye: { shape: 'almond', sclera: '#3A2620', iris: '#FFB23E', irisRatio: 0.84, pupil: 'v-oval', pupilRatio: 0.42, highlights: 2, lid: 0.22, lidAngle: -12, glow: '#FF9A3A', outline: '#140E0E' },
  mouth: { style: 'none' },
  rig: { type: 'QUAD', gaitHz: 0.9, stride: 18, bounce: 0.015, breath: 0.015, breathHz: 0.35, waveAmp: 5, waveHz: 0.5, flapAmp: 12, flapHz: 0.45, attack: 'rear', special: 'cast', faint: 'side', lean: 3 },
  parts: [
    // --- powerful torso: raised chest, barrel, hips ---
    { name: 'chest', prim: { t: 'sphere', r: [0.21, 0.25, 0.25] }, at: [0, 0.64, 0.28], anim: ['br', 'fx:body'] },
    { name: 'throatPlate', parent: 'chest', prim: { t: 'sphere', r: [0.14, 0.18, 0.12] }, at: [0, -0.01, 0.15], slot: 'W', fissure: 1 },
    { name: 'barrel', prim: { t: 'sphere', r: [0.19, 0.19, 0.3] }, at: [0, 0.6, -0.05], anim: ['br'] },
    { name: 'bellyPlate', parent: 'barrel', prim: { t: 'sphere', r: [0.14, 0.12, 0.33] }, at: [0, -0.08, 0.06], slot: 'W', fissure: 0.45 },
    { name: 'hips', prim: { t: 'sphere', r: [0.16, 0.17, 0.18] }, at: [0, 0.59, -0.38] },
    ...spikes('barrel', [[0.19, 0.18, 0.07, 30], [0.2, 0.02, 0.075, 30], [0.19, -0.14, 0.07, 30]]),
    ...spikes('hips', [[0.17, 0.02, 0.065, 35]]),
    // --- neck (curved chain) with a glowing throat ---
    { name: 'neck', parent: 'chest', prim: { t: 'none' }, chain: { n: 4, r0: 0.115, r1: 0.085, len: 0.44, bend: [-7, 0, 0] }, at: [0, 0.12, 0.14], rot: [28, 0, 0] },
    { name: 'throat', parent: 'neck0', prim: { t: 'capsule', r: 0.075, len: 0.3, r2: 0.06 }, at: [0, 0.0, 0.055], rot: [-6, 0, 0], slot: 'W', fissure: 1, blend: 0.05 },
    // --- head ---
    { name: 'head', parent: 'neckTip', prim: { t: 'sphere', r: [0.1, 0.095, 0.13] }, at: [0, 0.06, 0.03], rot: [-6, 0, 0], anim: ['look'], blend: 0.05 },
    { name: 'snout', parent: 'head', prim: { t: 'capsule', r: 0.07, len: 0.14, r2: 0.058 }, at: [0, -0.02, 0.05], rot: [90, 0, 0] },
    { name: 'jaw', parent: 'head', prim: { t: 'capsule', r: 0.055, len: 0.13, r2: 0.042 }, at: [0, -0.065, 0.02], rot: [97, 0, 0], slot: 'W', fissure: 1, anim: ['jaw', 'fx:mouth'] },
    { name: 'nostril', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.016, 0.01, 0.012] }, at: [0.032, 0.012, 0.3], slot: 'D', anim: ['fx:nostrils'] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.09, r2: 0.016 }, at: [0.05, 0.06, 0.09], rot: [-80, 0, -14], blend: 0.018 },
    { name: 'cheekSpike', parent: 'head', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.08 }, at: [0.07, -0.05, -0.03], rot: [-110, 0, -35], slot: BONE, mat: 'SHELL', lod: 1 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.036 }, at: [0.066, 0.03, 0.095], rot: [0, 34, 0] },
    ...horns,
    // --- smoke-and-ember fleece mane ---
    { name: 'mane0', parent: 'chest', prim: { t: 'sphere', r: [0.22, 0.15, 0.2] }, at: [0, 0.2, 0.06], slot: 'S', mat: 'FUR', fluffy: 0.016, fissure: 0.55, fur: 2 },
    { name: 'mane1', parent: 'chest', mirror: true, prim: { t: 'sphere', r: [0.13, 0.14, 0.13] }, at: [0.15, 0.14, 0.13], slot: 'S', mat: 'FUR', fluffy: 0.016, fissure: 0.55, fur: 2 },
    { name: 'mane2', parent: 'neck1', prim: { t: 'sphere', r: [0.12, 0.14, 0.11] }, at: [0, 0.03, -0.07], slot: 'S-', mat: 'FUR', fluffy: 0.016, fissure: 0.5, fur: 2 },
    { name: 'mane3', parent: 'neck3', prim: { t: 'sphere', r: [0.1, 0.12, 0.1] }, at: [0, 0.04, -0.06], slot: 'S', mat: 'FUR', fluffy: 0.014, fissure: 0.4, fur: 2 },
    { name: 'maneN2', parent: 'neck2', prim: { t: 'sphere', r: [0.11, 0.13, 0.1] }, at: [0, 0.03, -0.065], slot: 'S-', mat: 'FUR', fluffy: 0.015, fissure: 0.45, fur: 2 },
    { name: 'maneN0', parent: 'neck0', mirror: true, prim: { t: 'sphere', r: [0.1, 0.13, 0.1] }, at: [0.07, 0.05, -0.03], slot: 'S', mat: 'FUR', fluffy: 0.016, fissure: 0.5, fur: 2 },
    { name: 'maneHead', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.08, 0.1] }, at: [0, 0.07, -0.07], slot: 'S-', mat: 'FUR', fluffy: 0.012, fissure: 0.4, fur: 1.8 },
    { name: 'maneBack', parent: 'barrel', prim: { t: 'sphere', r: [0.14, 0.08, 0.16] }, at: [0, 0.17, 0.12], slot: 'S-', mat: 'FUR', fluffy: 0.014, fissure: 0.4, fur: 1.8 },
    // --- wide ember-lit wings ---
    ...dragonWing({ parent: 'chest', at: [0.15, 0.19, -0.04], rot: [0, 26, 40], w: 1.05, h: 0.7, bone: 'P', membrane: '#2E1410', vein: 'A', memGlow: 0.14, veinGlow: 1.2, boneR: 0.028 }),
    // --- powerful legs ---
    { name: 'shoulder', parent: 'chest', mirror: true, prim: { t: 'sphere', r: [0.11, 0.17, 0.13] }, at: [0.14, -0.1, 0.02] },
    { name: 'forearm', parent: 'shoulder', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.28, r2: 0.058 }, at: [0, -0.08, 0.02], rot: [180, 0, 0], anim: ['gait:FL', 'fx:ground'] },
    { name: 'pawF', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.085, 0.05, 0.11] }, at: [0, 0.41, -0.03] },
    ...claws('pawF', -0.105, 0.02),
    { name: 'thigh', parent: 'hips', mirror: true, prim: { t: 'sphere', r: [0.125, 0.19, 0.16] }, at: [0.13, -0.02, 0.02] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.17, r2: 0.06 }, at: [0, -0.1, -0.02], rot: [205, 0, 0], anim: ['gait:BL'] },
    { name: 'meta', parent: 'shin', mirror: true, prim: { t: 'capsule', r: 0.055, len: 0.1 }, at: [0, 0.28, 0], rot: [-45, 0, 0] },
    { name: 'foot', parent: 'meta', mirror: true, prim: { t: 'sphere', r: [0.08, 0.05, 0.12] }, at: [0, 0.16, -0.04], rot: [20, 0, 0] },
    ...claws('foot', -0.115, 0.02),
    // --- long tail ending in a basalt club ---
    { name: 'tail', parent: 'hips', prim: { t: 'none' }, chain: { n: 10, r0: 0.1, r1: 0.045, len: 1.15, bend: [-3, 0, 0] }, at: [0, 0.02, -0.15], rot: [-100, 0, 0], anim: ['wave'] },
    ...tailSpikes,
    { name: 'club', parent: 'tailTip', prim: { t: 'sphere', r: [0.13, 0.17, 0.11] }, at: [0, 0.08, 0], slot: '#35302F', mat: 'STONE', fissure: 0.85, blend: 0.05 },
    { name: 'clubKnob', parent: 'club', mirror: true, prim: { t: 'cone', r: 0.055, h: 0.1 }, at: [0.1, 0.02, 0.0], rot: [0, 0, -80], slot: '#35302F', mat: 'STONE', blend: 0.025 },
    { name: 'clubKnobT', parent: 'club', prim: { t: 'cone', r: 0.055, h: 0.1 }, at: [0, 0.02, 0.09], rot: [80, 0, 0], slot: '#35302F', mat: 'STONE', blend: 0.025 },
    { name: 'clubKnobE', parent: 'club', prim: { t: 'cone', r: 0.06, h: 0.09 }, at: [0, 0.15, 0], slot: '#35302F', mat: 'STONE', blend: 0.03 },
  ],
};
