// c20 Whirlseed — f07 stage 2, gale/verdant. Slender swift with two long samara-blade wings (design/creatures.md §4 c20).
import type { SpeciesVisual, V3 } from '../assemble';

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

const BEAK = '#3A342A';

export const c20: SpeciesVisual = {
  id: 'c20',
  H: 0.60,
  hoverGap: 0.5,
  colors: { P: '#6BA7C9', S: '#C7A05A', A: '#3D6B45', D: '#2A241C' },
  mat: 'FUR',
  rim: '#FFF2C8',
  rimStrength: 0.35,
  eye: { shape: 'almond', iris: '#E0B040', irisRatio: 0.62, pupil: 'round', pupilRatio: 0.38, highlights: 1, lid: 0.12, lidAngle: -10 },
  mouth: { style: 'none' },
  rig: { type: 'WING', flapAmp: 42, flapHz: 5, breath: 0.03, breathHz: 0.9, waveAmp: 8, waveHz: 1.4, attack: 'spin', special: 'cast', faint: 'sink', lean: 10 },
  parts: [
    { name: 'body', prim: { t: 'none' }, at: [0, 0.45, 0], anim: ['fx:body'] },
    { name: 'torso', parent: 'body', prim: { t: 'lathe', profile: 'L_spindle', h: 0.62, rmax: 0.125, axis: 'z' }, at: [0, 0, -0.33], anim: ['br'] },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.095, 0.07, 0.22] }, at: [0, -0.045, 0.0], slot: 'P+' },
    // head
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.13, 0.12, 0.13] }, at: [0, 0.05, 0.28], anim: ['look'] },
    { name: 'throat', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.07, 0.09] }, at: [0, -0.05, 0.03], slot: 'P+' },
    { name: 'beak', parent: 'head', prim: { t: 'cone', r: 0.042, h: 0.07 }, at: [0, -0.005, 0.115], rot: [92, 0, 0], scale: [1.35, 1, 0.55], slot: BEAK, mat: 'SKIN' },
    { name: 'jaw', parent: 'head', prim: { t: 'cone', r: 0.036, h: 0.055 }, at: [0, -0.03, 0.11], rot: [82, 0, 0], scale: [1.3, 1, 0.45], slot: BEAK, mat: 'SKIN', anim: ['jaw', 'fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.06 }, at: [0.07, 0.03, 0.092], rot: [0, 34, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.011, len: 0.055, r2: 0.005 }, at: [0.035, 0.085, 0.1], rot: [0, 20, -70], slot: 'A', lod: 0 },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'tube', pts: spiral(1.4, 0.028), r0: 0.006, r1: 0.006 }, at: [0.105, -0.035, 0.045], rot: [0, 62, 0], slot: 'S', mat: 'SKIN', lod: 0 },
    { name: 'crest', parent: 'head', prim: { t: 'extrude', shape: 'X_leaf', w: 0.28, h: 0.15, depth: 0.012 }, at: [0, 0.1, 0.0], rot: [-50, 0, 0], slot: 'A', mat: 'MEMBRANE', opacity: 1, anim: ['sway'] },
    { name: 'crest2', parent: 'head', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.2, h: 0.1, depth: 0.01 }, at: [0.02, 0.1, -0.02], rot: [-60, 0, -25], slot: 'A', mat: 'MEMBRANE', opacity: 1 },
    // wings: shoulder pivot (flap, swept back) -> green nut -> long samara blade
    { name: 'shoulder', parent: 'body', mirror: true, prim: { t: 'none' }, at: [0.1, 0.04, 0.06], rot: [0, 16, 16], anim: ['flap'] },
    { name: 'nut', parent: 'shoulder', mirror: true, prim: { t: 'sphere', r: [0.07, 0.045, 0.055] }, at: [0.03, 0, 0], slot: 'A', mat: 'SKIN' },
    { name: 'blade', parent: 'shoulder', mirror: true, prim: { t: 'extrude', shape: 'X_samara', w: 0.85, h: 0.68, depth: 0.016 }, at: [0.02, 0, 0.0], rot: [118, 0, -90], slot: 'S', mat: 'MEMBRANE', opacity: 0.95, anim: ['fx:wings'] },
    { name: 'vein1', parent: 'blade', mirror: true, prim: { t: 'tube', pts: [[0.0, 0.1, 0], [0.04, 0.4, 0], [0.05, 0.62, 0]], r0: 0.0045, r1: 0.003 }, at: [0, 0, 0.009], slot: 'P-', lod: 0 },
    { name: 'vein2', parent: 'blade', mirror: true, prim: { t: 'tube', pts: [[0.01, 0.12, 0], [0.07, 0.3, 0], [0.1, 0.5, 0]], r0: 0.004, r1: 0.0025 }, at: [0, 0, 0.009], slot: 'P-', lod: 0 },
    { name: 'vein3', parent: 'blade', mirror: true, prim: { t: 'tube', pts: [[-0.01, 0.12, 0], [-0.03, 0.3, 0], [-0.04, 0.45, 0]], r0: 0.004, r1: 0.0025 }, at: [0, 0, 0.009], slot: 'P-', lod: 0 },
    { name: 'vein4', parent: 'blade', mirror: true, prim: { t: 'tube', pts: [[0.02, 0.1, 0], [0.09, 0.2, 0], [0.11, 0.32, 0]], r0: 0.004, r1: 0.0025 }, at: [0, 0, 0.009], slot: 'P-', lod: 0 },
    // long twin streamers
    { name: 'tailRoot', parent: 'body', prim: { t: 'none' }, at: [0, 0.01, -0.3], anim: ['sway'] },
    { name: 'streamer', parent: 'tailRoot', mirror: true, prim: { t: 'tube', pts: [[0, 0, 0], [0.02, 0.02, -0.14], [0.05, -0.03, -0.3], [0.08, 0.0, -0.46]], r0: 0.022, r1: 0.018 }, at: [0.025, 0, 0], scale: [0.45, 1, 1], slot: 'P', anim: ['sway'] },
    { name: 'streamerTip', parent: 'streamer', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.28, h: 0.1, depth: 0.02 }, at: [0.08, 0.0, -0.45], rot: [-95, -90, 0], slot: 'A' },
    { name: 'tailTuft', parent: 'body', prim: { t: 'extrude', shape: 'X_leaf', w: 0.4, h: 0.12, depth: 0.012 }, at: [0, 0.02, -0.28], rot: [-100, 0, 0], slot: 'P-' },
  ],
};
