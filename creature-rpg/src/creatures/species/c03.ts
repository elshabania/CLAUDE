// c03 Tempestrel — f01 stage 3, electric/gale. Draco-style kite glider: long horizontal body,
// one delta rib-sail per side growing from the flank ribs, crescent head crest, tucked limbs and a
// long tail with two ribbon streamers and the widened fork (design/creatures.md §4 c03).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

// Draco-style rib sail: 6 rib spars fan from the flank (capsules: roll -90 -> +Y points out, yaw
// sweeps back). The membrane is one X_tri per rib pair with its apex at the root pair and its base
// spanning the two rib tips, so the trailing edge scallops between the ribs. X_tri is symmetric in its
// local X, so auto-mirroring is exact.
const RIBS: [number, number, number][] = [ // z root, sweep deg, length
  [0.32, 6, 0.9], [0.2, 20, 0.9], [0.08, 34, 0.84], [-0.04, 48, 0.76], [-0.16, 62, 0.66], [-0.28, 76, 0.52],
];
const D2R = Math.PI / 180;
const ribTip = (i: number): V3 => {
  const [z, sw, len] = RIBS[i];
  return [Math.cos(sw * D2R) * len, 0.01, z - Math.sin(sw * D2R) * len];
};
const ribParts: PartDef[] = RIBS.map(([z, sw, len], i) => ({ name: `rib${i}`, parent: 'wing', mirror: true, prim: { t: 'capsule', r: 0.013, len, r2: 0.006 }, at: [0, 0.012, z], rot: [0, sw, -90], slot: 'P+' }));
const membrane: PartDef[] = RIBS.slice(0, -1).flatMap(([z0, sw0, l0], i): PartDef[] => {
  const [z1, sw1, l1] = RIBS[i + 1];
  const half = ((sw1 - sw0) / 2) * D2R;
  const len = (l0 + l1) / 2;
  const hgt = len * Math.cos(half);
  const base = 2 * len * Math.sin(half) * 1.12; // slight overlap so the membrane reads continuous
  return [
    { name: `panel${i}`, parent: 'wing', mirror: true, prim: { t: 'none' }, at: [0, 0, (z0 + z1) / 2], rot: [0, (sw0 + sw1) / 2, -90] },
    { name: `mem${i}`, parent: `panel${i}`, mirror: true, prim: { t: 'extrude', shape: 'X_tri', w: base, h: hgt, depth: 0.01 }, at: [0, hgt, 0], rot: [0, 90, 180], slot: 'S', mat: 'MEMBRANE', opacity: 0.85, emissive: 0.15 },
  ];
});
// zig-seam through the rib tips along the outer trailing edge (explicit per side: tube points carry X)
function seam(side: 'L' | 'R'): PartDef {
  const sx = side === 'R' ? -1 : 1;
  const pts: V3[] = [];
  for (let i = 1; i < RIBS.length; i++) {
    const a = ribTip(i);
    if (i > 1) {
      const b = ribTip(i - 1);
      pts.push([((a[0] + b[0]) / 2) * 0.9 * sx, 0.012, ((a[2] + b[2]) / 2) * 0.9 + 0.02]);
    }
    pts.push([a[0] * sx, 0.012, a[2]]);
  }
  return { name: `seam_${side}`, parent: `wing_${side}`, prim: { t: 'tube', pts, r0: 0.014, r1: 0.01 }, slot: 'A', emissive: 1.2, mat: 'GLOW' };
}

export const c03: SpeciesVisual = {
  id: 'c03',
  H: 1.6,
  colors: { P: '#1E3A5F', S: '#5FD4E8', A: '#FFE66D', W: '#A9C3DA' },
  mat: 'SCALE',
  rim: '#9FF3FF',
  rimStrength: 0.5,
  hoverGap: 0.35,
  eye: { shape: 'long-almond', iris: '#5FD4E8', irisRatio: 0.58, pupil: 'round', pupilRatio: 0.3, highlights: 2, lid: 0.18, lidAngle: -4 },
  mouth: { style: 'smile' },
  rig: { type: 'WING', flapAmp: 7, flapHz: 0.67, waveAmp: 9, waveHz: 0.45, breath: 0.015, breathHz: 0.4, attack: 'dive', special: 'cast', faint: 'sink' },
  parts: [
    // --- body ---
    { name: 'body', prim: { t: 'none' }, at: [0, 0.55, 0], anim: ['br'] },
    { name: 'bodyMesh', parent: 'body', prim: { t: 'lathe', profile: 'L_spindle', h: 1.2, rmax: 0.165, axis: 'z' }, at: [0, 0, -0.6], anim: ['fx:body'] },
    { name: 'keel', parent: 'body', prim: { t: 'sphere', r: [0.13, 0.09, 0.28] }, at: [0, -0.07, 0.12], slot: 'W' },
    { name: 'dorsal', parent: 'body', prim: { t: 'capsule', r: 0.018, len: 0.7 }, at: [0, 0.1, -0.4], rot: [90, 0, 0], slot: 'A', emissive: 0.5, lod: 0 },
    // --- neck + head ---
    { name: 'neck', parent: 'body', prim: { t: 'capsule', r: 0.085, len: 0.16, r2: 0.07 }, at: [0, 0.03, 0.5], rot: [72, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.4, rmax: 0.13, axis: 'z' }, at: [0, 0.22, -0.02], rot: [-72, 0, 0], scale: [1.18, 1.18, 1.1], anim: ['look'] },
    { name: 'jaw', parent: 'head', prim: { t: 'lathe', profile: 'L_teardrop', h: 0.28, rmax: 0.075, axis: 'z' }, at: [0, -0.055, 0.08], rot: [4, 0, 0], slot: 'P+', anim: ['jaw'] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.035, w: 1.8 }, at: [0, -0.03, 0.33], rot: [30, 0, 0] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.08 }, at: [0.082, 0.045, 0.18], rot: [-8, 34, 0], scale: [1.35, 1.1, 1] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.07 }, at: [0.025, 0.08, 0.225], rot: [0, 50, -100], slot: '#2F5F8F' },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: 0.02 }, at: [0.088, -0.05, 0.05], slot: 'A', emissive: 0.6 },
    // crescent crest blade sweeping up-back from the crown, cyan with a yellow edge
    { name: 'crest', parent: 'head', prim: { t: 'extrude', shape: 'X_fin_crescent', w: 0.4, h: 0.34, depth: 0.018 }, at: [0, -0.09, 0.07], rot: [0, -90, 72], slot: 'S', emissive: 0.3, mat: 'MEMBRANE' },
    { name: 'crestEdge', parent: 'crest', prim: { t: 'tube', pts: Array.from({ length: 11 }, (_, i) => { const a = ((-75 + 15 * i) * Math.PI) / 180; return [(Math.cos(a) * 0.5 + 0.5) * 0.4, (Math.sin(a) * 0.5 + 0.5) * 0.34, 0] as V3; }), r0: 0.01, r1: 0.01 }, slot: 'A', emissive: 1.2, mat: 'GLOW' },
    // --- wings: flapping root pivots, rib spars, 3 delta panels per side ---
    { name: 'wing', parent: 'body', mirror: true, prim: { t: 'none' }, at: [0.08, 0.03, 0], rot: [0, 0, 20], anim: ['flap'] },
    ...ribParts,
    ...membrane,
    seam('L'),
    seam('R'),
    // --- 4 slender tucked limbs ---
    { name: 'armU', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.028, len: 0.16 }, at: [0.08, -0.07, 0.34], rot: [-120, 0, -12], anim: ['gait:FL'] },
    { name: 'armL', parent: 'armU', mirror: true, prim: { t: 'capsule', r: 0.022, len: 0.14 }, at: [0, 0.2, 0], rot: [60, 0, 0] },
    { name: 'handToe', parent: 'armL', mirror: true, prim: { t: 'cone', r: 0.018, h: 0.07 }, at: [0, 0.17, 0], slot: 'D', lod: 0 },
    { name: 'legU', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.032, len: 0.18 }, at: [0.08, -0.07, -0.34], rot: [-115, 0, -12], anim: ['gait:BL'] },
    { name: 'legL', parent: 'legU', mirror: true, prim: { t: 'capsule', r: 0.024, len: 0.16 }, at: [0, 0.22, 0], rot: [50, 0, 0] },
    { name: 'footToe', parent: 'legL', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.08 }, at: [0, 0.19, 0], slot: 'D', lod: 0 },
    // --- long tail: streamers + widened fork ---
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 10, r0: 0.055, r1: 0.016, len: 1.0, bend: [2, 0, 0] }, at: [0, 0.0, -0.56], rot: [-94, 0, 0], anim: ['wave'] },
    { name: 'streamer', parent: 'tail7', mirror: true, prim: { t: 'extrude', shape: 'X_strip', w: 0.9, h: 0.5, depth: 0.006 }, at: [0.02, 0.02, 0], rot: [0, 55, -18], slot: 'S', mat: 'MEMBRANE', opacity: 0.9, emissive: 0.25 },
    { name: 'prong', parent: 'tailTip', mirror: true, prim: { t: 'cone', r: 0.024, h: 0.16 }, at: [0.02, -0.01, 0], rot: [0, 0, -35], slot: 'A', emissive: 1.2, anim: ['fx:fork'] },
  ],
};
