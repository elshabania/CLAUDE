// c08 Tidesleek — f03 stage 2, water. Long low 8-segment serpentine otter with a raised periscope neck,
// a dorsal row of 10 shingled hex scutes and a vertical shell rudder (design/creatures.md §4 c08).
// Originality (§8): no twin tails, no flotation collar, no head fins.
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

const N = 8;
// rest-pose yaw per segment gives the lying body a loose horizontal S
const yaw = [0, 12, 14, 6, -14, -20, -12, 10];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const body: PartDef[] = [];
for (let i = 0; i < N; i++) {
  const t = i / (N - 1);
  const r: V3 = [lerp(0.17, 0.08, t), lerp(0.145, 0.07, t), lerp(0.3, 0.19, t)];
  body.push({
    name: `seg${i}`,
    parent: i === 0 ? 'root' : `seg${i - 1}`,
    prim: { t: 'sphere', r },
    at: i === 0 ? [0, 0.16, 0.8] : [0, lerp(0.0, -0.01, t), -0.215],
    rot: [0, yaw[i], 0],
    anim: i === 0 ? ['br'] : ['wave', `chain:${i}:${N}`],
  });
  // pale belly shows as a lighter band low on the flanks (vertex-gradient stand-in)
  body.push({ name: `belly${i}`, parent: `seg${i}`, prim: { t: 'sphere', r: [r[0] * 0.9, r[1] * 0.62, r[2] * 0.96] }, at: [0, -r[1] * 0.42, 0], slot: 'W' });
}

// 10 hex scutes: lying on the back, back edge lifted like roof shingles (the f03 motif)
const scuteSpots: [string, number, number][] = [
  ['seg0', 0.07, 0.95], ['seg0', -0.1, 1], ['seg1', 0.0, 0.93], ['seg2', 0.02, 0.86], ['seg2', -0.12, 0.8],
  ['seg3', 0.0, 0.76], ['seg4', 0.0, 0.66], ['seg5', 0.0, 0.56], ['seg6', 0.0, 0.46], ['seg7', 0.0, 0.38],
];
const scutes: PartDef[] = scuteSpots.map(([p, z, s], i) => {
  const seg = +p.slice(3);
  const ry = lerp(0.145, 0.07, seg / (N - 1));
  return {
    name: `scute${i}`,
    parent: p,
    prim: { t: 'extrude', shape: 'X_hexplate', w: 0.2 * s, h: 0.2 * s, depth: 0.03 },
    at: [0, ry * 0.9, z],
    rot: [-62, 0, 0],
    slot: 'S',
    mat: 'SHELL',
  } as PartDef;
});

export const c08: SpeciesVisual = {
  id: 'c08',
  H: 0.8,
  colors: { P: '#2F5E7A', S: '#8FD3D1', W: '#E6EEF0', D: '#1C2630' },
  mat: 'SKIN_WET',
  rim: '#D8FFFF',
  rimStrength: 0.45,
  eye: { shape: 'round', iris: '#3FB8B0', irisRatio: 0.66, pupil: 'round', pupilRatio: 0.4, highlights: 1, lid: 0.12, lidAngle: -6 },
  mouth: { style: 'smile' },
  rig: { type: 'CHAIN', gaitHz: 1.2, stride: 28, bounce: 0.01, breath: 0.025, breathHz: 0.5, waveAmp: 11, waveHz: 0.6, waveAxis: 'yaw', attack: 'lunge', special: 'cast', faint: 'forward', lean: 0 },
  parts: [
    ...body,
    ...scutes,
    // periscope neck: rises from the front segment, S-curving back to vertical
    { name: 'neck', parent: 'seg0', prim: { t: 'none' }, chain: { n: 3, r0: 0.115, r1: 0.085, len: 0.56, bend: [-14, 0, 0] }, at: [0, 0.02, 0.1], rot: [30, 0, 0] },
    { name: 'head', parent: 'neckTip', prim: { t: 'sphere', r: [0.14, 0.115, 0.19] }, at: [0, 0.05, 0.03], rot: [-2, 0, 0], anim: ['look'] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.085, 0.055, 0.075] }, at: [0, -0.035, 0.15], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.03, 0.022, 0.022] }, at: [0, 0.03, 0.068], slot: 'D' },
    { name: 'jaw', parent: 'muzzle', prim: { t: 'sphere', r: [0.07, 0.025, 0.07], half: true }, at: [0, -0.04, -0.01], rot: [180, 0, 0], slot: 'W', anim: ['jaw'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.04, w: 1.7 }, at: [0, -0.018, 0.066], rot: [14, 0, 0], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.066 }, at: [0.085, 0.04, 0.1], rot: [-6, 38, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'cone', r: 0.016, h: 0.07 }, at: [0.075, 0.095, 0.1], rot: [-95, 30, -10], slot: 'P-' },
    { name: 'earSlit', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.012, 0.03, 0.02] }, at: [0.135, 0.035, -0.04], slot: 'P-' },
    { name: 'whiskerA', parent: 'muzzle', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.1, 0.01, -0.02], [0.2, 0.03, -0.06]], r0: 0.005, r1: 0.002 }, at: [0.06, 0.0, 0.03], slot: 'W', lod: 0 },
    { name: 'whiskerB', parent: 'muzzle', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.1, -0.015, -0.02], [0.19, -0.04, -0.07]], r0: 0.005, r1: 0.002 }, at: [0.06, -0.01, 0.03], slot: 'W', lod: 0 },
    { name: 'whiskerC', parent: 'muzzle', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.09, 0.03, -0.03], [0.17, 0.07, -0.08]], r0: 0.004, r1: 0.002 }, at: [0.06, 0.005, 0.02], slot: 'W', lod: 0 },
    // four short flipper-legs on seg2 and seg6, paddling close to the body
    { name: 'legF', parent: 'seg1', mirror: true, prim: { t: 'capsule', r: 0.04, len: 0.06 }, at: [0.12, -0.08, 0.04], rot: [0, 25, -104], anim: ['gait:FL'] },
    { name: 'flipperF', parent: 'legF', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.4, h: 0.17, depth: 0.02 }, at: [0, 0.1, 0], rot: [0, 90, 0], slot: 'P' },
    { name: 'legB', parent: 'seg5', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.045 }, at: [0.085, -0.05, 0.02], rot: [0, 25, -104], anim: ['gait:BL'] },
    { name: 'flipperB', parent: 'legB', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.34, h: 0.13, depth: 0.018 }, at: [0, 0.08, 0], rot: [0, 90, 0], slot: 'P' },
    // vertical shell rudder
    { name: 'rudderStem', parent: 'seg7', prim: { t: 'capsule', r: 0.05, len: 0.1, r2: 0.03 }, at: [0, 0, -0.08], rot: [-90, 0, 0], anim: ['wave', `chain:${N}:${N}`] },
    { name: 'rudder', parent: 'rudderStem', prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.42, h: 0.52, depth: 0.05 }, at: [0, 0.04, -0.26], rot: [0, 90, 90], slot: 'S', mat: 'SHELL', anim: ['fx:tail'] },
  ],
};
