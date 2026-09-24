// c17 Sleetribbon — f06 stage 2, frost. Long limbless 12-segment serpent with a raised wedge head, a row of
// 5 separate translucent dorsal sail-fins, two long ribbon fins trailing from the base of the neck and a
// six-armed flake tail fin (design/creatures.md §4 c17; silhouette §7.3: 5 separated sail bumps, long line,
// ribbons behind the head).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const DEG = 180 / Math.PI;
type Vec = [number, number, number];
const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Euler XYZ (deg) of the rotation whose local +Y maps to `y` and local +X lies as close as possible to `xHint`. */
function basisEuler(yDir: Vec, xHint: Vec): V3 {
  const y = norm(yDir);
  const z = norm(cross(xHint, y));
  const x = cross(y, z);
  // matrix columns are x, y, z; three.js Euler XYZ extraction
  const m11 = x[0], m12 = y[0], m13 = z[0], m22 = y[1], m23 = z[1], m32 = y[2], m33 = z[2];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  let rx: number, rz: number;
  if (Math.abs(m13) < 0.9999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    rx = Math.atan2(m32, m22);
    rz = 0;
  }
  return [rx * DEG, ry * DEG, rz * DEG];
}

const N = 12;
const BODY_LEN = 3.6; // 12 × 0.30
const SEG = BODY_LEN / N;
const segR = (i: number) => 0.16 - (0.11 * i) / (N - 1);

const body: PartDef[] = [];
for (let i = 0; i < N; i++) {
  const r = segR(i);
  // chain frame: local +Y runs tail-ward, local +Z is up
  body.push({ name: `shell${i}`, parent: `body${i}`, prim: { t: 'sphere', r: [r, SEG * 0.72, r * 0.9] }, at: [0, SEG * 0.42, 0], slot: 'P', mat: 'SCALE' });
  body.push({ name: `belly${i}`, parent: `shell${i}`, prim: { t: 'sphere', r: [r * 0.8, SEG * 0.62, r * 0.45] }, at: [0, 0, -r * 0.5], slot: '#D6F0FF', mat: 'SCALE' });
}
// five separate dorsal sails on segments 2, 4, 6, 8, 10 (rot [0,90,90]: outline +X → tail-ward, +Y → up)
const SAIL_SEGS = [1, 3, 5, 7, 9];
const sails: PartDef[] = SAIL_SEGS.map((si, k) => {
  const h = 0.35 - k * 0.025;
  return {
    name: `sail${k}`,
    parent: `body${si}`,
    prim: { t: 'extrude', shape: 'X_sailfin', w: 0.46, h, depth: 0.018 },
    at: [0, SEG * 0.1, segR(si) * 0.72],
    rot: [0, 90, 90],
    slot: 'S',
    mat: 'ICE',
    opacity: 0.78,
    emissive: 0.25,
    glowColor: '#CFEFFF',
  } as PartDef;
});

// neck ribbons: 3 hinged strips each, trailing back from the neck base in a near-vertical plane
function ribbon(side: 1 | -1): PartDef[] {
  const s = side > 0 ? 'L' : 'R';
  const holder = `ribbon${s}`;
  const out: PartDef[] = [
    { name: holder, prim: { t: 'none' }, at: [0.11 * side, 0.3, 1.24], rot: basisEuler([0.28 * side, -0.18, -1], [0.15 * side, 1, 0]), anim: ['sway'] },
  ];
  const L = 0.22;
  const bends = [0, -10, 16];
  let parent = holder;
  for (let i = 0; i < 3; i++) {
    const name = `rib${s}${i}`;
    out.push({ name, parent, prim: { t: 'extrude', shape: 'X_strip', w: 1.3 - i * 0.15, h: L, depth: 0.012 }, at: [0, i === 0 ? 0 : L * 0.96, 0], rot: [0, 0, bends[i]], slot: 'S', mat: 'ICE', opacity: 0.82, emissive: 0.2, glowColor: '#CFEFFF', anim: ['sway'] });
    parent = name;
  }
  return out;
}

export const c17: SpeciesVisual = {
  id: 'c17',
  H: 0.7,
  colors: { P: '#8C8FE0', S: '#E6F6FF' },
  mat: 'SCALE',
  rim: '#FFFFFF',
  rimStrength: 0.5,
  eye: { shape: 'long-almond', iris: '#A8E6FF', irisRatio: 0.72, pupil: 'slit', pupilRatio: 0.55, highlights: 1, lid: 0.12, lidAngle: -5 },
  mouth: { style: 'line' },
  rig: { type: 'CHAIN', gaitHz: 1, stride: 0, bounce: 0.01, breath: 0.02, breathHz: 0.5, waveAmp: 9, waveHz: 0.45, waveAxis: 'roll', attack: 'lunge', special: 'cast', faint: 'collapse', lean: 0 },
  parts: [
    // body: 12-segment chain running back from the neck base, gentle rest curve
    { name: 'body', prim: { t: 'none' }, chain: { n: N, r0: 0.07, r1: 0.03, len: BODY_LEN, bend: [0, 0, 7] }, at: [0, 0.16, 1.2], rot: [-90, 0, -32], slot: 'P', anim: ['wave'] },
    ...body,
    ...sails,
    { name: 'flake', parent: 'bodyTip', prim: { t: 'extrude', shape: 'X_flake6', w: 0.66, h: 0.66, depth: 0.025 }, at: [0, 0.12, 0.03], rot: [0, 90, 0], slot: 'S', mat: 'ICE', opacity: 0.85, emissive: 0.3, glowColor: '#CFEFFF', anim: ['fx:tail'] },
    // raised neck (3 segments) curving forward to a level head
    { name: 'neck', prim: { t: 'none' }, chain: { n: 3, r0: 0.13, r1: 0.105, len: 0.66, bend: [16, 0, 0] }, at: [0, 0.14, 1.2], rot: [14, 0, 0], slot: 'P', mat: 'SCALE' },
    { name: 'neckShell', parent: 'neck0', prim: { t: 'sphere', r: [0.16, 0.2, 0.15] }, at: [0, 0.02, 0], slot: 'P' },
    { name: 'throat', parent: 'neck1', prim: { t: 'sphere', r: [0.1, 0.22, 0.06] }, at: [0, 0.1, 0.07], slot: '#D6F0FF' },
    ...ribbon(1),
    ...ribbon(-1),
    { name: 'headP', parent: 'neckTip', prim: { t: 'none' }, at: [0, -0.02, 0], rot: [-46, 0, 0], anim: ['look', 'fx:head'] },
    { name: 'head', parent: 'headP', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.5, rmax: 0.165, axis: 'z' }, at: [0, 0, -0.1], scale: [1, 0.82, 1], slot: 'P' },
    { name: 'jaw', parent: 'headP', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.34, rmax: 0.11, axis: 'z' }, at: [0, -0.06, 0.02], scale: [1, 0.55, 1], slot: '#D6F0FF', anim: ['jaw'] },
    { name: 'mouth', parent: 'headP', prim: { t: 'mouth', r: 0.05, w: 2.2 }, at: [0, -0.045, 0.33], rot: [55, 0, 0], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'headP', mirror: true, prim: { t: 'eye', r: 0.06 }, at: [0.105, 0.04, 0.12], rot: [-8, 58, 0], scale: [1.3, 1, 1] },
    { name: 'brow', parent: 'headP', mirror: true, prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.2, h: 0.14, depth: 0.02 }, at: [0.07, 0.1, 0.18], rot: [-30, 90, 12], slot: 'S', mat: 'ICE', opacity: 0.85, emissive: 0.25, glowColor: '#CFEFFF' },
  ],
};
