// c22 Ringdrip — f08 stage 1, toxin. Six-armed land octopus (radial crawler) with glowing blue rings
// (design/creatures.md §4 c22). Always SIX arms, never eight.
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const UNDER = '#F6E8B5';

/** Orientation (deg, XYZ order) that points a part's local +Z along unit direction d. */
function faceDir(d: V3): V3 {
  const len = Math.hypot(d[0], d[1], d[2]);
  const [x, y, z] = [d[0] / len, d[1] / len, d[2] / len];
  const yaw = Math.asin(Math.max(-1, Math.min(1, x)));
  const pitch = Math.atan2(-y, z);
  return [(pitch * 180) / Math.PI, (yaw * 180) / Math.PI, 0];
}

// L_bulb radius at height fraction f (piecewise-linear approximation of the profile)
const BULB: [number, number][] = [[0, 0], [0.8, 0.05], [1, 0.35], [0.9, 0.7], [0.5, 0.95], [0, 1]];
function bulbR(f: number): number {
  for (let i = 1; i < BULB.length; i++) {
    const [r0, h0] = BULB[i - 1];
    const [r1, h1] = BULB[i];
    if (f <= h1) return r0 + ((r1 - r0) * (f - h0)) / (h1 - h0);
  }
  return 0;
}

/** A glowing ring decal sitting on the surface of a lathe L_bulb (h, rmax) at height fraction f and angle a (deg from +Z). */
function mantleRing(name: string, parent: string, h: number, rmax: number, f: number, a: number, R: number): PartDef {
  const r = bulbR(f) * rmax;
  const ar = (a * Math.PI) / 180;
  const nx = Math.sin(ar), nz = Math.cos(ar);
  // slope of the profile -> tilt the normal up/down a little
  const slope = ((bulbR(Math.min(1, f + 0.05)) - bulbR(Math.max(0, f - 0.05))) * rmax) / (0.1 * h);
  const n: V3 = [nx, -slope * 0.8, nz];
  return { name, parent, prim: { t: 'torus', R, r: R * 0.24 }, at: [nx * r * 0.99, f * h, nz * r * 0.99], rot: faceDir(n), slot: 'A', mat: 'GLOW', emissive: 0.7, anim: ['glow'] };
}

// six arms: yaw around the body, gait phase group (alternating triplets)
const ARMS: { id: string; yaw: number; gait: string }[] = [
  { id: 'armFL', yaw: 30, gait: 'A' },
  { id: 'armML', yaw: 90, gait: 'E' },
  { id: 'armBL', yaw: 150, gait: 'A' },
  { id: 'armFR', yaw: -30, gait: 'E' },
  { id: 'armMR', yaw: -90, gait: 'A' },
  { id: 'armBR', yaw: -150, gait: 'E' },
];

const armParts: PartDef[] = [];
for (const a of ARMS) {
  const yr = (a.yaw * Math.PI) / 180;
  armParts.push({ name: a.id + 'Root', parent: 'head', prim: { t: 'none' }, at: [Math.sin(yr) * 0.2, -0.1, Math.cos(yr) * 0.18], rot: [0, a.yaw, 0] });
  armParts.push({ name: a.id, parent: a.id + 'Root', prim: { t: 'none' }, chain: { n: 4, r0: 0.075, r1: 0.022, len: 0.55, bend: [-17, 0, 0] }, rot: [118, 0, 0], anim: ['gait:' + a.gait, 'wave'] });
  // rings on top of segments 1 and 2 (local -Z is up for these segments)
  armParts.push({ name: a.id + 'Ring1', parent: a.id + '1', prim: { t: 'torus', R: 0.034, r: 0.009 }, at: [0, 0.06, -0.055], slot: 'A', mat: 'GLOW', emissive: 0.7, anim: ['glow'] });
  armParts.push({ name: a.id + 'Ring2', parent: a.id + '2', prim: { t: 'torus', R: 0.026, r: 0.008 }, at: [0, 0.06, -0.04], slot: 'A', mat: 'GLOW', emissive: 0.7, anim: ['glow'] });
  armParts.push({ name: a.id + 'Drop', parent: a.id + 'Tip', prim: { t: 'sphere', r: [0.022, 0.028, 0.022] }, at: [0, 0.015, 0], slot: '#9FE05A', mat: 'SKIN_WET', emissive: 0.25, lod: 0 });
}

const MH = 0.55, MR = 0.28;

export const c22: SpeciesVisual = {
  id: 'c22',
  H: 0.30,
  colors: { P: '#E8C547', A: '#2E6BFF', S: UNDER, D: '#3A2A10' },
  mat: 'SKIN_WET',
  rim: '#FFF6C0',
  rimStrength: 0.35,
  eye: { shape: 'round', iris: '#D9A21E', irisRatio: 0.66, pupil: 'h-bar', pupilRatio: 0.5, highlights: 1, lid: 0.1 },
  mouth: { style: 'none' },
  rig: { type: 'RADIAL', gaitHz: 2.2, stride: 18, bounce: 0.05, breath: 0.05, breathHz: 0.6, waveAmp: 9, waveHz: 0.6, waveAxis: 'pitch', attack: 'lunge', special: 'cast', faint: 'forward', lean: 6 },
  parts: [
    { name: 'head', prim: { t: 'sphere', r: [0.3, 0.22, 0.28] }, at: [0, 0.3, 0], anim: ['br'] },
    { name: 'under', parent: 'head', prim: { t: 'sphere', r: [0.27, 0.12, 0.25] }, at: [0, -0.1, 0.01], slot: UNDER },
    { name: 'mantle', parent: 'head', prim: { t: 'lathe', profile: 'L_bulb', h: MH, rmax: MR }, at: [0, 0.1, -0.08], rot: [-25, 0, 0], anim: ['br', 'fx:core'] },
    // eyes on top ridges with bulgy lid caps
    { name: 'ridge', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.14, 0.13, 0.13] }, at: [0.14, 0.13, 0.1] },
    { name: 'eye', parent: 'ridge', mirror: true, prim: { t: 'eye', r: 0.118 }, at: [0.053, 0.026, 0.104], rot: [-12, 27, 0] },
    { name: 'lid', parent: 'ridge', mirror: true, prim: { t: 'sphere', r: [0.125, 0.05, 0.105], half: true }, at: [0.014, 0.112, 0.0], rot: [14, 27, -6], slot: 'P' },
    { name: 'siphon', parent: 'head', prim: { t: 'lathe', profile: 'L_crater', h: 0.1, rmax: 0.045 }, at: [0.26, 0.0, -0.06], rot: [0, 0, -70], slot: 'P-', anim: ['fx:siphon'] },
    // mantle rings (flat tori on the mantle surface)
    mantleRing('mRing1', 'mantle', MH, MR, 0.35, 40, 0.045),
    mantleRing('mRing2', 'mantle', MH, MR, 0.35, -40, 0.045),
    mantleRing('mRing3', 'mantle', MH, MR, 0.6, 0, 0.04),
    mantleRing('mRing4', 'mantle', MH, MR, 0.55, 95, 0.04),
    mantleRing('mRing5', 'mantle', MH, MR, 0.55, -95, 0.04),
    mantleRing('mRing6', 'mantle', MH, MR, 0.35, 150, 0.04),
    mantleRing('mRing7', 'mantle', MH, MR, 0.35, -150, 0.04),
    mantleRing('mRing8', 'mantle', MH, MR, 0.78, 60, 0.032),
    mantleRing('mRing9', 'mantle', MH, MR, 0.78, -60, 0.032),
    mantleRing('mRing10', 'mantle', MH, MR, 0.8, 180, 0.03),
    ...armParts,
  ],
};
