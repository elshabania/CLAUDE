// c04 Wickwool — f02 stage 1, fire. Ram-calf lamb: lumpy cream fleece of 7 clusters over brick-red
// skin, knobbly stick legs, ¾-curl horn nubs with glowing wick tips, flame tail tuft (design/creatures.md §4 c04).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

// Ram curl in the head's frame: starts at the base heading up, curls back, down and forward
// (sagittal plane) while drifting outward. Tube points carry X, so each side is built explicitly.
function curl(turns: number, r0: number, r1: number, drift: number, n = 14): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push([drift * Math.sin(t * Math.PI * 0.5), r * Math.sin(th), -r0 + r * Math.cos(th)]);
  }
  return pts;
}
const HORN = curl(0.75, 0.06, 0.045, 0.06);
const SPLIT = 10; // points [0..SPLIT] bone-coloured, [SPLIT..] glowing wick tip
function horn(side: 'L' | 'R'): PartDef[] {
  const sx = side === 'R' ? -1 : 1;
  const m = (p: V3): V3 => [p[0] * sx, p[1], p[2]];
  const base = HORN.slice(0, SPLIT + 1).map(m);
  const tip = HORN.slice(SPLIT).map(m);
  const end = m(HORN[HORN.length - 1]);
  return [
    { name: `horn_${side}`, parent: 'head', prim: { t: 'none' }, at: [0.075 * sx, 0.125, 0.0], rot: [0, 0, -20 * sx] },
    { name: `hornBase_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: base, r0: 0.04, r1: 0.03 }, slot: '#D8B892', mat: 'SHELL' },
    { name: `hornTip_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: tip, r0: 0.03, r1: 0.024 }, slot: 'A', emissive: 1.2, mat: 'SHELL' },
    // wick flame: a small glowing teardrop licking up from the horn tip
    { name: `wick_${side}`, parent: `horn_${side}`, prim: { t: 'sphere', r: [0.032, 0.042, 0.032] }, at: [end[0], end[1] + 0.02, end[2]], slot: 'A+', emissive: 1.5, mat: 'GLOW', anim: side === 'L' ? ['fx:horns'] : [] },
    { name: `wickTip_${side}`, parent: `wick_${side}`, prim: { t: 'cone', r: 0.024, h: 0.075 }, at: [0, 0.025, 0], slot: 'A', emissive: 1.5, mat: 'GLOW' },
  ];
}

export const c04: SpeciesVisual = {
  id: 'c04',
  H: 0.45,
  colors: { P: '#B5462E', S: '#F2E3C6', A: '#FF8A1F', W: '#E7A58A' },
  mat: 'FUR',
  rim: '#FFD9A0',
  rimStrength: 0.3,
  eye: { shape: 'round', iris: '#4A2A1A', irisRatio: 0.72, pupil: 'round', pupilRatio: 0.55, highlights: 2, lid: 0.05, lidAngle: 8 },
  mouth: { style: 'o' },
  rig: { type: 'QUAD', gaitHz: 3, stride: 30, bounce: 0.07, hop: true, breath: 0.03, breathHz: 0.9, attack: 'lunge', special: 'cast', faint: 'side', lean: 3 },
  parts: [
    // --- body + 7 fleece clusters ---
    { name: 'torso', prim: { t: 'sphere', r: [0.26, 0.2, 0.32] }, at: [0, 0.48, 0], anim: ['br'] },
    { name: 'fleeceTop', parent: 'torso', prim: { t: 'sphere', r: 0.18 }, at: [0, 0.13, 0.1], slot: 'S', fluffy: 0.012 },
    { name: 'fleeceBack', parent: 'torso', prim: { t: 'sphere', r: 0.19 }, at: [0, 0.14, -0.12], slot: 'S', fluffy: 0.012 },
    { name: 'fleeceRump', parent: 'torso', prim: { t: 'sphere', r: 0.165 }, at: [0, 0.04, -0.25], slot: 'S', fluffy: 0.012 },
    { name: 'fleeceSide', parent: 'torso', mirror: true, prim: { t: 'sphere', r: 0.165 }, at: [0.17, 0.0, 0.07], slot: 'S', fluffy: 0.012 },
    { name: 'fleeceHaunch', parent: 'torso', mirror: true, prim: { t: 'sphere', r: 0.16 }, at: [0.16, -0.01, -0.16], slot: 'S', fluffy: 0.012 },
    // --- neck + head (enlarged vs spec for stage-1 appeal) ---
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.08, len: 0.08 }, at: [0, 0.06, 0.24], rot: [35, 0, 0], anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.19, 0.175, 0.19] }, at: [0, 0.16, 0.05], rot: [-35, 0, 0], anim: ['look'] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.11, 0.085, 0.09] }, at: [0, -0.07, 0.14], slot: 'W' },
    { name: 'nostril', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.012, 0.008, 0.006] }, at: [0.035, 0.025, 0.085], slot: 'D', lod: 0 },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.03 }, at: [0, -0.035, 0.08], rot: [25, 0, 0] },
    { name: 'forelock', parent: 'head', prim: { t: 'sphere', r: 0.085 }, at: [0, 0.15, 0.03], slot: 'S', fluffy: 0.01 },
    { name: 'forelock2', parent: 'head', mirror: true, prim: { t: 'sphere', r: 0.06 }, at: [0.06, 0.13, 0.07], slot: 'S', fluffy: 0.008 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.075 }, at: [0.085, 0.02, 0.145], rot: [0, 27, 0] },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.045, len: 0.075 }, at: [0.15, 0.04, -0.03], rot: [10, 0, -145], scale: [1, 1, 0.45], anim: ['sway'] },
    { name: 'earIn', parent: 'ear', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.08 }, at: [0, 0.02, 0.012], scale: [1, 1, 0.4], slot: 'W', lod: 0 },
    ...horn('L'),
    ...horn('R'),
    // --- four stick legs with knobbly knees and charcoal hooves ---
    { name: 'legF', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.035, len: 0.1 }, at: [0.13, -0.14, 0.17], rot: [180, 0, 0], anim: ['gait:FL'] },
    { name: 'kneeF', parent: 'legF', mirror: true, prim: { t: 'sphere', r: 0.046 }, at: [0, 0.15, 0] },
    { name: 'shinF', parent: 'kneeF', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.09 }, at: [0, 0.01, 0] },
    { name: 'hoofF', parent: 'shinF', mirror: true, prim: { t: 'cyl', r: 0.038, h: 0.05, r2: 0.03 }, at: [0, 0.18, 0], rot: [180, 0, 0], slot: 'D', anim: ['fx:hoof'] },
    { name: 'legB', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.037, len: 0.1 }, at: [0.13, -0.14, -0.18], rot: [180, 0, 0], anim: ['gait:BL'] },
    { name: 'kneeB', parent: 'legB', mirror: true, prim: { t: 'sphere', r: 0.046 }, at: [0, 0.15, 0] },
    { name: 'shinB', parent: 'kneeB', mirror: true, prim: { t: 'capsule', r: 0.03, len: 0.09 }, at: [0, 0.01, 0] },
    { name: 'hoofB', parent: 'shinB', mirror: true, prim: { t: 'cyl', r: 0.038, h: 0.05, r2: 0.03 }, at: [0, 0.18, 0], rot: [180, 0, 0], slot: 'D' },
    // --- flame-shaped tail tuft with an ember tip ---
    { name: 'tail', parent: 'torso', prim: { t: 'extrude', shape: 'X_flame_tuft', w: 0.16, h: 0.2, depth: 0.05 }, at: [0, 0.1, -0.33], rot: [-35, 0, 0], slot: 'S', anim: ['sway'] },
    { name: 'tailTip', parent: 'tail', prim: { t: 'extrude', shape: 'X_flame_tuft', w: 0.09, h: 0.12, depth: 0.055 }, at: [0, 0.09, 0], slot: 'A', emissive: 1.0 },
  ],
};
