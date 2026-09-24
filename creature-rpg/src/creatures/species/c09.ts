// c09 Floeguard — f03 stage 3, water/frost. Stout upright otter guardian with a back carapace and a broad
// scalloped fan-shell tail used as a grounded shield (design/creatures.md §4 c09).
// Binding D7 / originality F-0-06: NO helmet; whiskers reduced to two short nubs; shell ONLY on the back and the
// tail-fan (no breastplate, no belly shell); the paws never hold or grip any shell part.
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

// seven rib tubes radiating from the fan hinge (shield local frame: straight edge on y=0, arc up to y=R)
const R = 0.44;
const ribs: PartDef[] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const a = (Math.PI * (i + 1)) / 8;
  const p: V3 = [Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, 0];
  return {
    name: `rib${i}`,
    parent: 'shield',
    prim: { t: 'tube', pts: [[0, 0.03, 0], [p[0] * 0.5, p[1] * 0.5 + 0.015, 0.012], p], r0: 0.016, r1: 0.008 },
    at: [0, 0, 0.03],
    slot: 'A',
    emissive: 0.4,
  } as PartDef;
});

// overlapping scallop shingles on the back carapace (the f03 motif): 3 rows, lower rows tucked under upper edges
const CA: V3 = [0.28, 0.3, 0.16]; // carapace ellipsoid radii
const shingles: PartDef[] = [];
const rows: [number, number[]][] = [[38, [-24, 0, 24]], [12, [-42, -14, 14, 42]], [-16, [-36, -12, 12, 36]]];
rows.forEach(([phi, thetas], ri) => thetas.forEach((th, j) => {
  const t = (th * Math.PI) / 180, f = (phi * Math.PI) / 180;
  shingles.push({
    name: `shingle${ri}_${j}`,
    parent: 'carapace',
    prim: { t: 'sphere', r: [0.1, 0.085, 0.03] },
    at: [CA[0] * Math.sin(t) * Math.cos(f) * 0.97, CA[1] * Math.sin(f) * 0.97, -CA[2] * Math.cos(t) * Math.cos(f) * 0.97],
    rot: [phi - 12, 180 - th, 0],
    slot: ri === 1 ? 'S' : 'S+',
    mat: 'SHELL',
  });
}));

// frost crystals on the shoulders (ICE, faint cyan glow)
const crystals: PartDef[] = [
  [0.02, 0.07, 0.0, 0.042, 0.15, 0, -14],
  [-0.05, 0.06, 0.045, 0.03, 0.1, 25, 18],
  [0.07, 0.04, -0.05, 0.03, 0.1, -25, -40],
].map(([x, y, z, r, h, rx, rz], i) => ({
  name: `crystal${i}`,
  parent: 'shoulder',
  mirror: true,
  prim: { t: 'cone', r, h },
  at: [x, y, z],
  rot: [rx, 0, rz],
  slot: 'S',
  mat: 'ICE',
  opacity: 0.88,
  emissive: 0.3,
  glowColor: 'A',
}) as PartDef);

export const c09: SpeciesVisual = {
  id: 'c09',
  H: 1.6,
  colors: { P: '#3E4E63', S: '#CFE9F5', A: '#1FA6C9', W: '#E4EEF2', D: '#1B222C' },
  mat: 'FUR',
  rim: '#E8FBFF',
  rimStrength: 0.5,
  eye: { shape: 'droopy', iris: '#1F5FA6', irisRatio: 0.62, pupil: 'round', pupilRatio: 0.35, highlights: 1, lid: 0.3, lidAngle: 4 },
  mouth: { style: 'line' },
  rig: { type: 'BIPED', gaitHz: 1.2, stride: 18, bounce: 0.02, breath: 0.02, breathHz: 0.4, attack: 'spin', special: 'slam', faint: 'collapse', lean: 3 },
  parts: [
    { name: 'pelvis', prim: { t: 'sphere', r: [0.22, 0.19, 0.2] }, at: [0, 0.36, 0] },
    { name: 'torso', parent: 'pelvis', prim: { t: 'lathe', profile: 'L_egg', h: 0.5, rmax: 0.27 }, at: [0, -0.04, 0], anim: ['br'] },
    // soft pale chest FUR (not shell) — the otter line never wears a breastplate
    { name: 'chest', parent: 'torso', prim: { t: 'sphere', r: [0.2, 0.22, 0.12] }, at: [0, 0.27, 0.135], slot: '#566A80', fluffy: 0.004 },
    // back carapace (shell on the back only) with glowing rim seam and shingle rows
    { name: 'carapace', parent: 'torso', prim: { t: 'sphere', r: CA }, at: [0, 0.3, -0.1], slot: 'S', mat: 'SHELL' },
    { name: 'seam', parent: 'carapace', prim: { t: 'torus', R: 0.285, r: 0.014 }, at: [0, 0, 0.0], scale: [1, 1.06, 1], slot: 'A', emissive: 0.4 },
    ...shingles,
    // shoulders: fur humps with frost crystals
    { name: 'shoulder', parent: 'torso', mirror: true, prim: { t: 'sphere', r: [0.12, 0.1, 0.13] }, at: [0.21, 0.4, -0.01] },
    ...crystals,
    // head: no helmet (D7)
    { name: 'head', parent: 'torso', prim: { t: 'sphere', r: [0.16, 0.15, 0.155] }, at: [0, 0.54, 0.04], anim: ['look'] },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.03, 0.028, 0.016] }, at: [0.135, 0.06, -0.02], rot: [0, 35, -15] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.09, 0.065, 0.075] }, at: [0, -0.055, 0.115], slot: 'W' },
    { name: 'pad', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.05, 0.045, 0.045] }, at: [0.04, 0.0, 0.035], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.034, 0.024, 0.024] }, at: [0, 0.04, 0.068], slot: 'D' },
    { name: 'jaw', parent: 'muzzle', prim: { t: 'sphere', r: [0.075, 0.028, 0.065], half: true }, at: [0, -0.045, -0.005], rot: [180, 0, 0], slot: 'W', anim: ['jaw'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.035, w: 1.6 }, at: [0, -0.02, 0.07], rot: [14, 0, 0], anim: ['fx:mouth'] },
    { name: 'whiskerNub', parent: 'pad', mirror: true, prim: { t: 'capsule', r: 0.007, len: 0.025 }, at: [0.035, 0.005, 0.015], rot: [0, 0, -80], slot: 'A+', lod: 0 },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.052 }, at: [0.072, 0.03, 0.128], rot: [-4, 26, 0] },
    { name: 'nostrils', parent: 'nose', prim: { t: 'none' }, at: [0, 0, 0.02], anim: ['fx:nostrils'] },
    // arms hang at the sides, empty webbed paws
    { name: 'arm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.17 }, at: [0.27, 0.38, 0.0], rot: [175, 0, -12], anim: ['gait:BL'] },
    { name: 'forearm', parent: 'arm', mirror: true, prim: { t: 'capsule', r: 0.068, len: 0.14 }, at: [0, 0.27, 0], rot: [-18, 0, 4] },
    { name: 'paw', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.085, 0.06, 0.085] }, at: [0, 0.26, 0.01], slot: '#33414F' },
    { name: 'pawWeb', parent: 'paw', mirror: true, prim: { t: 'extrude', shape: 'X_fan', w: 0.13, h: 0.07, depth: 0.014 }, at: [0, 0.03, 0.03], rot: [0, 0, 180], slot: 'P+', mat: 'SKIN', lod: 0 },
    // legs: thick thigh, short shin, broad webbed foot
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'sphere', r: 0.13 }, at: [0.12, -0.1, 0.02], anim: ['gait:L'] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.08 }, at: [0, -0.02, 0], rot: [180, 0, 0] },
    { name: 'foot', parent: 'shin', mirror: true, prim: { t: 'extrude', shape: 'X_fan', w: 0.24, h: 0.2, depth: 0.045 }, at: [0, 0.2, 0.0], rot: [-90, 0, 0] },
    // tail stem sweeping to the left side, ending in the grounded fan-shell shield
    { name: 'tailStem', parent: 'pelvis', prim: { t: 'tube', pts: [[0, -0.02, -0.14], [0.08, -0.12, -0.3], [0.26, -0.24, -0.34], [0.38, -0.3, -0.28]], r0: 0.09, r1: 0.06 } },
    { name: 'shield', parent: 'pelvis', prim: { t: 'extrude', shape: 'X_fan', w: 2 * R, h: R, depth: 0.075 }, at: [0.42, -0.35, -0.24], rot: [0, 72, 0], slot: 'S', mat: 'SHELL', anim: ['fx:shield'] },
    { name: 'hinge', parent: 'shield', prim: { t: 'sphere', r: [0.035, 0.03, 0.035] }, at: [0, 0.02, 0.0], slot: 'S-', mat: 'SHELL' },
    ...ribs,
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.3], anim: ['fx:ground'] },
  ],
};
