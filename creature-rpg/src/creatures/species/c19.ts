// c19 Gustling — f07 stage 1, gale. Round hopping fledgling with stub samara wings (design/creatures.md §4 c19).
// H = 0.40 m per DECISIONS (overrides the 0.30 m in the spec table).
import type { SpeciesVisual, V3 } from '../assemble';

// small flat spiral (cheek swirl), in local XY plane, facing +Z
function spiral(turns: number, r: number, n = 14): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const rr = r * (0.25 + 0.75 * t);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr, 0]);
  }
  return pts;
}

const BEAK = '#F2B05E';

export const c19: SpeciesVisual = {
  id: 'c19',
  H: 0.40,
  colors: { P: '#F4F1E8', S: '#7FB3D5', A: '#E07A5F', D: '#2B1D14' },
  mat: 'FUR',
  rim: '#FFFFFF',
  rimStrength: 0.35,
  eye: { shape: 'round', iris: '#2B1D14', irisRatio: 0.78, pupil: 'round', pupilRatio: 0.7, highlights: 2, lid: 0, lidAngle: 5 },
  mouth: { style: 'none' },
  rig: { type: 'BIPED', hop: true, gaitHz: 2.8, stride: 22, bounce: 0.08, breath: 0.05, breathHz: 0.7, flapAmp: 28, flapHz: 3.2, attack: 'lunge', special: 'cast', faint: 'side', lean: 8 },
  parts: [
    { name: 'body', prim: { t: 'sphere', r: [0.42, 0.40, 0.42] }, at: [0, 0.52, 0], fluffy: 0.007, anim: ['br', 'fx:body'] },
    // sky-blue back cap: a slightly larger shell tilted back so the face and belly stay white
    { name: 'cap', parent: 'body', prim: { t: 'sphere', r: [0.43, 0.39, 0.43], half: true }, at: [0, 0.03, -0.05], rot: [-38, 0, 0], slot: 'S', fluffy: 0.006 },
    // head tuft (brow feather tufts, S)
    { name: 'tuft', parent: 'body', prim: { t: 'capsule', r: 0.035, len: 0.08, r2: 0.012 }, at: [0, 0.36, 0.08], rot: [-25, 0, 0], slot: 'S' },
    { name: 'tuftS', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.028, len: 0.06, r2: 0.01 }, at: [0.05, 0.35, 0.05], rot: [-30, 0, -35], slot: 'S' },
    { name: 'brow', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.018, len: 0.07, r2: 0.008 }, at: [0.11, 0.30, 0.29], rot: [0, 25, -75], slot: 'S-', lod: 0 },
    // face
    { name: 'eye', parent: 'body', mirror: true, prim: { t: 'eye', r: 0.13 }, at: [0.165, 0.11, 0.345], rot: [-6, 26, 0] },
    { name: 'cheek', parent: 'body', mirror: true, prim: { t: 'tube', pts: spiral(1.6, 0.05), r0: 0.011, r1: 0.011 }, at: [0.28, -0.04, 0.30], rot: [0, 44, 0], slot: 'A', emissive: 0.15, mat: 'SKIN' },
    { name: 'blush', parent: 'body', mirror: true, prim: { t: 'sphere', r: [0.06, 0.045, 0.02] }, at: [0.28, -0.04, 0.295], rot: [0, 44, 0], slot: 'A+', mat: 'SKIN', lod: 0 },
    { name: 'beak', parent: 'body', prim: { t: 'cone', r: 0.07, h: 0.09 }, at: [0, 0.015, 0.395], rot: [95, 0, 0], scale: [1.25, 1, 0.55], slot: BEAK, mat: 'SKIN' },
    { name: 'jaw', parent: 'body', prim: { t: 'cone', r: 0.055, h: 0.065 }, at: [0, -0.02, 0.39], rot: [80, 0, 0], scale: [1.2, 1, 0.45], slot: '#E59B45', mat: 'SKIN', anim: ['jaw', 'fx:mouth'] },
    // stub samara wings: flap pivot at the shoulder, blade hangs out and down with the nut at the root
    { name: 'shoulder', parent: 'body', mirror: true, prim: { t: 'none' }, at: [0.38, 0.02, -0.03], anim: ['flap'] },
    { name: 'wing', parent: 'shoulder', mirror: true, prim: { t: 'extrude', shape: 'X_samara', w: 0.42, h: 0.34, depth: 0.025 }, at: [0.0, 0.0, 0.0], rot: [0, 40, -118], slot: 'S', mat: 'MEMBRANE', opacity: 1 },
    { name: 'nut', parent: 'shoulder', mirror: true, prim: { t: 'sphere', r: [0.045, 0.04, 0.05] }, at: [0.0, 0.0, 0.0], slot: 'S-', mat: 'SKIN' },
    { name: 'vein', parent: 'wing', mirror: true, prim: { t: 'tube', pts: [[0.0, 0.08, 0], [0.02, 0.2, 0], [0.03, 0.3, 0]], r0: 0.006, r1: 0.003 }, at: [0, 0, 0.014], slot: 'S-', lod: 0 },
    // twin tail streamers (vertical ribbons, droop in two segments)
    { name: 'tailRoot', parent: 'body', prim: { t: 'none' }, at: [0, 0.02, -0.38], anim: ['sway'] },
    { name: 'streamer', parent: 'tailRoot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.03, 0.06, -0.14], [0.07, 0.07, -0.29], [0.11, 0.02, -0.43]], r0: 0.036, r1: 0.03 }, at: [0.045, 0, 0], scale: [0.5, 1, 1], slot: 'S', anim: ['sway'] },
    { name: 'streamerTip', parent: 'streamer', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.35, h: 0.12, depth: 0.03 }, at: [0.11, 0.02, -0.42], rot: [-105, -90, 0], slot: 'S-' },
    // legs + big three-toed feet
    { name: 'leg', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.08 }, at: [0.13, -0.34, 0.03], rot: [180, 0, 0], slot: BEAK, mat: 'SKIN', anim: ['gait:L'] },
    { name: 'foot', parent: 'leg', mirror: true, prim: { t: 'none' }, at: [0, 0.14, 0], rot: [180, 0, 0] },
    { name: 'toe', parent: 'foot', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.07, r2: 0.016 }, at: [0, 0, 0], rot: [90, 0, 0], slot: BEAK, mat: 'SKIN' },
    { name: 'toeO', parent: 'foot', mirror: true, prim: { t: 'capsule', r: 0.022, len: 0.055, r2: 0.014 }, at: [0, 0, 0], rot: [90, 0, -35], slot: BEAK, mat: 'SKIN' },
    { name: 'toeI', parent: 'foot', mirror: true, prim: { t: 'capsule', r: 0.022, len: 0.055, r2: 0.014 }, at: [0, 0, 0], rot: [90, 0, 35], slot: BEAK, mat: 'SKIN' },
  ],
};
