// c23 Brineloop — f08 stage 2, toxin/water. Upright octopus on 4 leg-arms with 2 lasso arms; its mantle is a
// translucent, brine-filled balloon (NOT a helmet) with a sloshing water surface inside (design/creatures.md §4 c23).
// Six arms total: 4 legs + 2 lassos.
import type { PartDef, SpeciesVisual } from '../assemble';

const RING = { slot: 'A', mat: 'GLOW' as const, emissive: 0.7, anim: ['glow'] };


/** Orientation (deg, XYZ order) that points a part's local +Z along direction d. */
function faceDir(d: [number, number, number]): [number, number, number] {
  const len = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / len, y = d[1] / len, z = d[2] / len;
  return [(Math.atan2(-y, z) * 180) / Math.PI, (Math.asin(x) * 180) / Math.PI, 0];
}
const BULB: [number, number][] = [[0, 0], [0.8, 0.05], [1, 0.35], [0.9, 0.7], [0.5, 0.95], [0, 1]];
function bulbR(f: number): number {
  for (let i = 1; i < BULB.length; i++) {
    const [r0, h0] = BULB[i - 1];
    const [r1, h1] = BULB[i];
    if (f <= h1) return r0 + ((r1 - r0) * (f - h0)) / (h1 - h0);
  }
  return 0;
}
const MH = 0.5, MR = 0.26;
/** Large ring loop lying on the mantle skin at height fraction f, angle a (deg from +Z). */
function mantleRing(name: string, f: number, a: number, R: number): PartDef {
  const r = bulbR(f) * MR;
  const ar = (a * Math.PI) / 180;
  const slope = ((bulbR(Math.min(1, f + 0.05)) - bulbR(Math.max(0, f - 0.05))) * MR) / (0.1 * MH);
  return { name, parent: 'mantle', prim: { t: 'torus', R, r: R * 0.2 }, at: [Math.sin(ar) * r, f * MH, Math.cos(ar) * r], rot: faceDir([Math.sin(ar), -slope * 0.8, Math.cos(ar)]), ...RING };
}

const legs: PartDef[] = [];
// four leg-arms splayed at ±35° / ±145° (diagonal gait pairs)
for (const [id, yaw, gait] of [['legFL', 35, 'FL'], ['legFR', -35, 'FR'], ['legBL', 145, 'BL'], ['legBR', -145, 'BR']] as [string, number, string][]) {
  const yr = (yaw * Math.PI) / 180;
  legs.push({ name: id + 'Root', parent: 'body', prim: { t: 'none' }, at: [Math.sin(yr) * 0.1, -0.1, Math.cos(yr) * 0.09], rot: [0, yaw, 0] });
  legs.push({ name: id, parent: id + 'Root', prim: { t: 'none' }, chain: { n: 4, r0: 0.07, r1: 0.03, len: 0.44, bend: [-15, 0, 0] }, rot: [148, 0, 0], anim: ['gait:' + gait] });
  // rings on top of segments (local -Z is up/outward for these)
  legs.push({ name: id + 'Ring1', parent: id + '1', prim: { t: 'torus', R: 0.045, r: 0.01 }, at: [0, 0.05, -0.058], ...RING });
  legs.push({ name: id + 'Ring2', parent: id + '2', prim: { t: 'torus', R: 0.038, r: 0.009 }, at: [0, 0.05, -0.046], ...RING });
}
// two lasso arms raised from the sides: a gently curved reach (3 segments) then a tight loop (4 segments)
for (const [id, side] of [['lassoL', 1], ['lassoR', -1]] as [string, number][]) {
  legs.push({ name: id, parent: 'body', prim: { t: 'none' }, chain: { n: 3, r0: 0.052, r1: 0.034, len: 0.3, bend: [0, 0, 14 * side] }, at: [0.19 * side, 0.03, 0.06], rot: [12, 0, -58 * side], anim: ['wave'] });
  legs.push({ name: id + 'Loop', parent: id + 'Tip', prim: { t: 'none' }, chain: { n: 5, r0: 0.034, r1: 0.016, len: 0.4, bend: [0, 0, 68 * side] }, rot: [0, 0, 30 * side], anim: ['wave'] });
  legs.push({ name: id + 'Ring1', parent: id + '0', prim: { t: 'torus', R: 0.042, r: 0.009 }, at: [0, 0.05, 0.045], ...RING });
  legs.push({ name: id + 'Ring2', parent: id + '1', prim: { t: 'torus', R: 0.036, r: 0.008 }, at: [0, 0.05, 0.04], ...RING });
  legs.push({ name: id + 'Ring3', parent: id + 'Loop0', prim: { t: 'torus', R: 0.03, r: 0.007 }, at: [0, 0.04, 0.03], ...RING });
  legs.push({ name: id + 'Ring4', parent: id + 'Loop2', prim: { t: 'torus', R: 0.025, r: 0.006 }, at: [0, 0.04, 0.024], ...RING });
}

// brine volume: lower ~55% of the L_bulb, flat top = water surface
const BRINE: [number, number][] = [[0, 0.02], [0.72, 0.07], [0.93, 0.35], [0.9, 0.56], [0, 0.56]];

export const c23: SpeciesVisual = {
  id: 'c23',
  H: 0.90,
  colors: { P: '#D98F2B', A: '#2E6BFF', S: '#9FE3F0', D: '#3A2210' },
  mat: 'SKIN_WET',
  rim: '#FFD7A0',
  rimStrength: 0.3,
  eye: { shape: 'round', iris: '#D9A21E', irisRatio: 0.64, pupil: 'h-bar', pupilRatio: 0.5, highlights: 2, lid: 0.12 },
  mouth: { style: 'none' },
  rig: { type: 'RADIAL', gaitHz: 1.4, stride: 16, bounce: 0.04, breath: 0.04, breathHz: 0.6, waveAmp: 10, waveHz: 0.7, waveAxis: 'roll', attack: 'whip', special: 'cast', faint: 'collapse', lean: 4 },
  parts: [
    { name: 'body', prim: { t: 'sphere', r: [0.22, 0.18, 0.21] }, at: [0, 0.4, 0], anim: ['br'] },
    { name: 'under', parent: 'body', prim: { t: 'sphere', r: [0.17, 0.08, 0.17] }, at: [0, -0.09, 0], slot: 'P+' },
    // eyes on the body below the mantle, with wry tilted lid caps (deliberately asymmetric)
    { name: 'eye', parent: 'body', mirror: true, prim: { t: 'eye', r: 0.08 }, at: [0.1, 0.055, 0.165], rot: [-6, 30, 0] },
    { name: 'lidL', parent: 'body', prim: { t: 'sphere', r: [0.088, 0.036, 0.075], half: true }, at: [0.105, 0.117, 0.14], rot: [20, 30, -22], slot: 'P' },
    { name: 'lidR', parent: 'body', prim: { t: 'sphere', r: [0.088, 0.036, 0.075], half: true }, at: [-0.105, 0.124, 0.14], rot: [20, -30, 4], slot: 'P' },
    // translucent brine-filled mantle (no helmet: this IS the mantle, attached to the body)
    { name: 'mantle', parent: 'body', prim: { t: 'lathe', profile: 'L_bulb', h: MH, rmax: MR }, at: [0, 0.02, -0.05], rot: [-26, 0, 0], slot: '#EDAA55', mat: 'MEMBRANE', opacity: 0.5, anim: ['br', 'fx:core'] },
    { name: 'brine', parent: 'mantle', prim: { t: 'lathe', profile: BRINE, h: MH, rmax: MR * 0.94 }, at: [0, 0.0, 0], slot: 'S', mat: 'ICE', opacity: 0.72, anim: ['sway'] },
    { name: 'brineTop', parent: 'brine', prim: { t: 'cyl', r: MR * 0.86, h: 0.006 }, at: [0, MH * 0.555, 0], rot: [26, 0, 0], slot: 'S+', mat: 'ICE', opacity: 0.8 },
    mantleRing('mRing1', 0.42, 55, 0.06),
    mantleRing('mRing2', 0.42, -55, 0.06),
    mantleRing('mRing3', 0.62, 140, 0.055),
    mantleRing('mRing4', 0.62, -140, 0.055),
    mantleRing('mRing5', 0.78, 0, 0.045),
    { name: 'organ', parent: 'mantle', prim: { t: 'sphere', r: [0.07, 0.06, 0.07] }, at: [0, 0.2, -0.01], slot: 'P-', mat: 'SKIN' },
    { name: 'bubble', parent: 'mantle', prim: { t: 'sphere', r: 0.018 }, at: [0.08, 0.32, 0.05], slot: '#E8FFFF', mat: 'ICE', opacity: 0.8, lod: 0 },
    { name: 'bubble2', parent: 'mantle', prim: { t: 'sphere', r: 0.012 }, at: [-0.06, 0.36, 0.08], slot: '#E8FFFF', mat: 'ICE', opacity: 0.8, lod: 0 },
    // curling snorkel siphon from the mantle's side, up and forward
    { name: 'snorkel', parent: 'mantle', prim: { t: 'tube', pts: [[0, 0, 0], [0.03, 0.08, -0.01], [0.05, 0.16, 0.04], [0.04, 0.19, 0.12], [0.02, 0.17, 0.18]], r0: 0.035, r1: 0.026 }, at: [0.07, MH * 0.86, 0.0], rot: [20, 0, 0], slot: 'P' },
    { name: 'snorkelTip', parent: 'snorkel', prim: { t: 'lathe', profile: 'L_crater', h: 0.05, rmax: 0.036 }, at: [0.02, 0.17, 0.18], rot: [110, 0, 0], slot: 'P-', anim: ['fx:snorkel'] },
    ...legs,
  ],
};
