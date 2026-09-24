// c11 Lullstalk (formerly Nodbell, renamed per DECISIONS D7) — f04 stage 2, verdant/toxin.
// Lanky stooped knuckle-crutch biped: arms to the ground, short legs, mossy hooded mantle and three hanging
// clusters of foxglove bells (both shoulders + crown) (design/creatures.md §4 c11).
// Originality (§8): no bell-shaped head, no sombrero pad — the bells hang in clusters from the mantle and crown.
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

// one bell cluster: an arching stem with three hanging foxglove bells (speckled pale throats)
function cluster(id: string, parent: string, at: V3, rot: V3, stem: V3[]): PartDef[] {
  const tip = stem[stem.length - 1];
  const out: PartDef[] = [
    { name: `${id}Stem`, parent, prim: { t: 'tube', pts: stem, r0: 0.013, r1: 0.008 }, at, rot, slot: 'P-', anim: ['sway'] },
    { name: `${id}Hub`, parent: `${id}Stem`, prim: { t: 'sphere', r: 0.018 }, at: tip, slot: 'P-', anim: id === 'bellC' ? ['fx:bells'] : [] },
  ];
  const bells: [V3, number, number][] = [[[0.0, -0.2, 0.0], 0, 1], [[0.055, -0.13, 0.03], 18, 0.82], [[-0.05, -0.155, -0.03], -16, 0.9]];
  bells.forEach(([p, roll, s], i) => {
    out.push({ name: `${id}${i}`, parent: `${id}Hub`, prim: { t: 'lathe', profile: 'L_bell', h: 0.1 * s, rmax: 0.052 * s }, at: p, rot: [0, 0, roll], slot: 'A', mat: 'MEMBRANE', emissive: 0.1, anim: ['sway'] });
    out.push({ name: `${id}${i}Throat`, parent: `${id}${i}`, prim: { t: 'cyl', r: 0.036 * s, h: 0.006 }, at: [0, 0.012, 0], slot: '#F1E7A0', lod: 0 });
    out.push({ name: `${id}${i}Stalk`, parent: `${id}${i}`, prim: { t: 'capsule', r: 0.005, len: Math.max(0.005, -p[1] - 0.1 * s - 0.01) }, at: [0, 0.095 * s, 0], rot: [0, 0, -roll], slot: 'P-', lod: 0 });
  });
  return out;
}

// moss lumps on the mantle
const lumps: [V3, number][] = [[[0.13, 0.03, 0.02], 0.065], [[-0.13, 0.03, 0.02], 0.065], [[0.06, 0.08, -0.1], 0.07], [[-0.07, 0.07, -0.1], 0.065], [[0, 0.02, -0.16], 0.06]];
const moss: PartDef[] = lumps.map(([at, r], i) => ({ name: `moss${i}`, parent: 'mantle', prim: { t: 'sphere', r }, at, slot: i % 2 ? 'P' : 'P+', fluffy: 0.01 }));

// hooked claws (3 per hand) pointing forward-down as it crutches on its knuckles
const claws: PartDef[] = [-1, 0, 1].map((k) => ({
  name: `claw${k + 1}`,
  parent: 'hand',
  mirror: true,
  prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.03, 0.06], [0, -0.015, 0.1]], r0: 0.014, r1: 0.004 },
  at: [k * 0.026, -0.01, 0.02],
  rot: [0, k * 10, 0],
  slot: 'D',
  mat: 'SHELL',
}));

export const c11: SpeciesVisual = {
  id: 'c11',
  H: 1.2,
  colors: { P: '#4E7D3A', A: '#B05FC4', S: '#9C8466', D: '#2E2620' },
  mat: 'FUR',
  rim: '#D9A6FF',
  rimStrength: 0.25,
  eye: { shape: 'droopy', iris: '#8C6A2F', irisRatio: 0.6, pupil: 'round', pupilRatio: 0.4, highlights: 1, lid: 0.45, lidAngle: 8 },
  mouth: { style: 'o' },
  rig: { type: 'BIPED', gaitHz: 0.9, stride: 20, bounce: 0.03, breath: 0.025, breathHz: 0.35, attack: 'slam', special: 'cast', faint: 'side', lean: 25 },
  parts: [
    { name: 'pelvis', prim: { t: 'sphere', r: [0.14, 0.12, 0.12] }, at: [0, 0.3, 0], slot: 'S' },
    // stooped pear torso, pitched forward
    { name: 'torso', parent: 'pelvis', prim: { t: 'lathe', profile: 'L_pear', h: 0.4, rmax: 0.16 }, at: [0, 0.03, 0], rot: [22, 0, 0], slot: 'S', anim: ['br'] },
    { name: 'belly', parent: 'torso', prim: { t: 'sphere', r: [0.12, 0.14, 0.08] }, at: [0, 0.14, 0.08], slot: 'S+' },
    // mossy hooded mantle over the shoulders
    { name: 'mantle', parent: 'torso', prim: { t: 'lathe', profile: 'L_dome', h: 0.14, rmax: 0.21 }, at: [0, 0.28, -0.01], scale: [1, 1, 0.95], slot: 'P', fluffy: 0.008 },
    ...moss,
    // head hangs forward from the mantle; the hood hump rises behind it
    { name: 'head', parent: 'torso', prim: { t: 'sphere', r: [0.11, 0.135, 0.11] }, at: [0, 0.42, 0.1], rot: [-18, 0, 0], slot: 'S', anim: ['look'] },
    { name: 'hood', parent: 'head', prim: { t: 'lathe', profile: 'L_dome', h: 0.16, rmax: 0.145 }, at: [0, -0.02, -0.03], rot: [-35, 0, 0], scale: [1, 1, 1.05], slot: 'P', fluffy: 0.008 },
    { name: 'hoodRim', parent: 'hood', prim: { t: 'torus', R: 0.14, r: 0.022, arc: 180 }, at: [0, 0.02, 0.0], rot: [70, 0, 0], slot: 'P+', fluffy: 0.004 },
    { name: 'face', parent: 'head', prim: { t: 'sphere', r: [0.095, 0.115, 0.05] }, at: [0, -0.01, 0.075], slot: 'S+' },
    { name: 'stripe', parent: 'face', mirror: true, prim: { t: 'sphere', r: [0.026, 0.085, 0.02] }, at: [0.042, -0.01, 0.034], rot: [0, 20, 12], slot: '#3A2C22' },
    { name: 'eye', parent: 'face', mirror: true, prim: { t: 'eye', r: 0.048 }, at: [0.045, 0.02, 0.045], rot: [0, 20, 0] },
    { name: 'nose', parent: 'face', prim: { t: 'sphere', r: [0.024, 0.018, 0.018] }, at: [0, -0.04, 0.05], slot: 'D' },
    { name: 'mouth', parent: 'face', prim: { t: 'mouth', r: 0.028 }, at: [0, -0.078, 0.036], rot: [20, 0, 0], anim: ['fx:mouth'] },
    // very long arms reaching the ground (knuckle-crutch)
    { name: 'upperArm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.042, len: 0.3 }, at: [0.17, 0.3, 0.0], rot: [138, 0, -12], slot: 'S', anim: ['gait:BL'] },
    { name: 'forearm', parent: 'upperArm', mirror: true, prim: { t: 'capsule', r: 0.036, len: 0.28, r2: 0.04 }, at: [0, 0.37, 0], rot: [18, 0, 4], slot: 'S' },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.048, 0.042, 0.05] }, at: [0, 0.36, 0], slot: 'S-' },
    ...claws,
    // short legs
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'capsule', r: 0.05, len: 0.05 }, at: [0.08, -0.05, 0.0], rot: [180, 0, -4], slot: 'S', anim: ['gait:L'] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.042, len: 0.03 }, at: [0, 0.13, 0], slot: 'S' },
    { name: 'foot', parent: 'shin', mirror: true, prim: { t: 'sphere', r: [0.05, 0.03, 0.07] }, at: [0, 0.11, 0.03], slot: 'S-' },
    { name: 'toeClaw', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.01, 0.04], [0, -0.02, 0.06]], r0: 0.011, r1: 0.003 }, at: [0.015, 0.0, 0.05], slot: 'D', lod: 0 },
    { name: 'toeClaw2', parent: 'foot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0, 0.01, 0.04], [0, -0.02, 0.06]], r0: 0.011, r1: 0.003 }, at: [-0.015, 0.0, 0.05], slot: 'D', lod: 0 },
    // three foxglove bell clusters: left shoulder, right shoulder, crown
    ...cluster('bellL', 'mantle', [0.17, 0.02, 0.03], [0, 0, 0], [[0, 0, 0], [0.05, 0.05, 0.01], [0.1, 0.03, 0.02], [0.12, -0.02, 0.02]]),
    ...cluster('bellR', 'mantle', [-0.17, 0.02, 0.03], [0, 0, 0], [[0, 0, 0], [-0.05, 0.05, 0.01], [-0.1, 0.03, 0.02], [-0.12, -0.02, 0.02]]),
    ...cluster('bellC', 'hood', [0, 0.15, 0.0], [0, 0, 0], [[0, 0, 0], [0.0, 0.07, 0.03], [0.0, 0.08, 0.1], [0.0, 0.04, 0.15]]),
  ],
};
