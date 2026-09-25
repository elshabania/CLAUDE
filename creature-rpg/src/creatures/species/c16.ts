// c16 Rimelet — f06 stage 1, frost. Legless sidewinding hatchling serpent: big head (≈40% of its length)
// with one tall translucent ice crest, 4 small back crests and a six-armed flake tail tip. No legs, no
// feelers (design/creatures.md §4 c16; silhouette §7.3: head ≥ 40% of length, single fin spike, flake tail).
import type { PartDef, SpeciesVisual } from '../assemble';

const SEG_N = 5;
const SEG_LEN = 1.45;
const segR = (i: number) => 0.34 - (0.13 * i) / (SEG_N - 1);
// back crests on segments 1–4 (chain frame: local +Y runs tail-ward, local +Z is up)
// rot [0,90,90] maps the crescent outline's +X to the tail (+Y) and its +Y to up (+Z)
// smooth sphere shells over the (thin) animated chain cores: spheres r0.34 → 0.21, flattened ×0.9 in height
const shells: PartDef[] = Array.from({ length: SEG_N }, (_, i) => ({
  name: `seg${i}`,
  parent: `body${i}`,
  prim: { t: 'sphere', r: [segR(i), segR(i) * 1.05, segR(i) * 0.9] },
  at: [0, (SEG_LEN / SEG_N) * 0.5, 0.02],
  slot: 'P',
  emissive: 0.1,
  glowColor: 'S',
}) as PartDef);
const crests: PartDef[] = [0, 1, 2, 3].map((i) => {
  const r = segR(i + 1) * 0.9;
  const h = 0.3 - i * 0.04;
  return {
    name: `crest${i}`,
    parent: `body${i + 1}`,
    prim: { t: 'extrude', shape: 'X_fin_crescent', w: h * 1.1, h, depth: 0.035 },
    at: [0, (SEG_LEN / SEG_N) * 0.5 - h * 0.75, r * 0.8],
    rot: [0, 90, 90],
    slot: 'S',
    mat: 'ICE',
    opacity: 0.85,
    emissive: 0.25,
    anim: ['glow'],
  } as PartDef;
});

export const c16: SpeciesVisual = {
  id: 'c16',
  H: 0.25,
  colors: { P: '#EAF6FF', S: '#8FD8E8', A: '#B7A9F2' },
  mat: 'SKIN_WET',
  rim: '#FFFFFF',
  rimStrength: 0.6,
  eye: { shape: 'round', iris: '#6FB6E8', irisRatio: 0.66, pupil: 'round', pupilRatio: 0.6, highlights: 3, lid: 0 },
  mouth: { style: 'smile' },
  rig: { type: 'CHAIN', gaitHz: 1.4, stride: 0, bounce: 0.03, breath: 0.03, breathHz: 0.6, waveAmp: 14, waveHz: 0.9, waveAxis: 'roll', attack: 'rear', special: 'cast', faint: 'side', lean: 0 },
  parts: [
    // big round head
    { name: 'head', prim: { t: 'sphere', r: [0.42, 0.4, 0.38] }, at: [0, 0.5, 0.42], slot: 'P', emissive: 0.1, glowColor: 'S', anim: ['look', 'br', 'fx:head'] },
    { name: 'throat', parent: 'head', prim: { t: 'sphere', r: [0.33, 0.2, 0.3] }, at: [0, -0.2, 0.04], slot: 'A+' },
    // the single tall ice crest: a crescent sail sweeping back (yaw 90 → outline +X points tail-ward)
    { name: 'headCrest', parent: 'head', prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.62, h: 0.62, depth: 0.05 }, at: [0, 0.26, 0.3], rot: [-14, 90, 0], slot: 'S', mat: 'ICE', opacity: 0.85, emissive: 0.3, anim: ['glow', 'fx:crest'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.165 }, at: [0.195, 0.06, 0.29], rot: [-4, 32, 0] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.07, w: 1.5 }, at: [0, -0.13, 0.345], rot: [22, 0, 0], anim: ['fx:mouth'] },
    { name: 'freckA', parent: 'head', mirror: true, prim: { t: 'sphere', r: 0.03 }, at: [0.3, -0.1, 0.25], slot: 'S', lod: 0 },
    { name: 'freckB', parent: 'head', mirror: true, prim: { t: 'sphere', r: 0.025 }, at: [0.345, -0.05, 0.18], slot: 'S', lod: 0 },
    { name: 'freckC', parent: 'head', mirror: true, prim: { t: 'sphere', r: 0.025 }, at: [0.265, -0.17, 0.25], slot: 'S', lod: 0 },
    // body: 5 tapering segments trailing back (sidewinding wave)
    { name: 'body', prim: { t: 'none' }, chain: { n: SEG_N, r0: 0.08, r1: 0.05, len: SEG_LEN, bend: [-3, 0, 14] }, at: [0, 0.35, 0.2], rot: [-90, 0, -20], slot: 'P', anim: ['wave'] },
    ...shells,
    ...crests,
    // six-armed flake tail tip, vertical
    { name: 'flake', parent: 'bodyTip', prim: { t: 'extrude', shape: 'X_flake6', w: 0.44, h: 0.44, depth: 0.04 }, at: [0, 0.14, 0.04], rot: [0, 90, 0], slot: 'S', mat: 'ICE', opacity: 0.9, emissive: 0.35, anim: ['glow', 'fx:flake'] },
  ],
};
