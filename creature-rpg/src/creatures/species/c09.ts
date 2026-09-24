// c09 Floeguard — f03 stage 3, water/frost. Upright otter guardian: long otter body with a thick neck and flat
// otter head, a BACK carapace only (frost-crystal ridge along the spine), and a thick otter tail that leads
// into a broad scalloped fan-shell shield resting on the ground beside it (design/creatures.md §4 c09, v2).
// Binding D7 / originality F-0-06: NO helmet; whiskers reduced to two short nubs; shell ONLY on the back and the
// tail-fan (no breastplate, no pauldrons, no belly shell); the paws never hold or grip any shell part.
import type { SpeciesVisual, PartDef, V3 } from '../assemble';

// ---- tail-fan shield: X_fan (straight hinge edge on y=0, 7 scalloped lobes up to y=R) + 7 glowing rib tubes
const R = 0.44;
const ribs: PartDef[] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const a = (Math.PI * (i + 1)) / 8;
  const p: V3 = [Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, 0];
  return {
    name: `rib${i}`,
    parent: 'shield',
    prim: { t: 'tube', pts: [[0, 0.035, 0], [p[0] * 0.5, p[1] * 0.5 + 0.02, 0.015], p], r0: 0.016, r1: 0.009 },
    at: [0, 0, 0.038],
    slot: 'A',
    emissive: 0.4,
  } as PartDef;
});

// ---- back carapace: ellipsoid shell with 3 rows of overlapping scallop shingles (the f03 motif)
const CA: V3 = [0.25, 0.28, 0.14];
const shingles: PartDef[] = [];
const rows: [number, number[]][] = [[36, [-22, 0, 22]], [10, [-40, -13, 13, 40]], [-18, [-34, -11, 11, 34]]];
rows.forEach(([phi, thetas], ri) => thetas.forEach((th, j) => {
  const t = (th * Math.PI) / 180, f = (phi * Math.PI) / 180;
  shingles.push({
    name: `shingle${ri}_${j}`,
    parent: 'carapace',
    prim: { t: 'sphere', r: [0.09, 0.08, 0.028] },
    at: [CA[0] * Math.sin(t) * Math.cos(f) * 0.97, CA[1] * Math.sin(f) * 0.97, -CA[2] * Math.cos(t) * Math.cos(f) * 0.97],
    rot: [phi - 12, 180 - th, 0],
    slot: ri === 1 ? 'S' : 'S+',
    mat: 'SHELL',
  });
}));

// ---- six frost crystals in a row along the spine (top ridge of the carapace), v2
const crystals: PartDef[] = [
  [0.3, 0.035, 0.1], [0.2, 0.032, 0.12], [0.1, 0.03, 0.1], [-0.0, 0.028, 0.09], [-0.1, 0.024, 0.075], [-0.2, 0.02, 0.06],
].map(([y, r, h], i) => {
  const f = Math.asin(Math.max(-1, Math.min(1, y / CA[1])));
  return {
    name: `crystal${i}`,
    parent: 'carapace',
    prim: { t: 'cone', r, h },
    at: [0, y * 0.97, -CA[2] * Math.cos(f) * 0.92],
    rot: [-(90 - (f * 180) / Math.PI) + (i % 2 ? 8 : -8), 0, i % 2 ? 10 : -10],
    slot: 'S',
    mat: 'ICE',
    opacity: 0.88,
    emissive: 0.3,
    glowColor: 'A',
  } as PartDef;
});

export const c09: SpeciesVisual = {
  id: 'c09',
  H: 1.6,
  colors: { P: '#3E4E63', S: '#CFE9F5', A: '#1FA6C9', W: '#C9D6DE', D: '#1B222C' },
  mat: 'FUR',
  rim: '#E8FBFF',
  rimStrength: 0.5,
  eye: { shape: 'round', iris: '#1F5FA6', irisRatio: 0.66, pupil: 'round', pupilRatio: 0.35, highlights: 1, lid: 0.3, lidAngle: 4 },
  mouth: { style: 'line' },
  rig: { type: 'BIPED', gaitHz: 1.2, stride: 18, bounce: 0.02, breath: 0.02, breathHz: 0.4, attack: 'spin', special: 'slam', faint: 'collapse', lean: 3 },
  parts: [
    { name: 'pelvis', prim: { t: 'sphere', r: [0.21, 0.19, 0.19] }, at: [0, 0.34, 0] },
    // long otter torso tapering into a thick neck
    { name: 'torso', parent: 'pelvis', prim: { t: 'lathe', profile: [[0, 0], [0.75, 0.06], [0.98, 0.28], [1, 0.45], [0.86, 0.72], [0.62, 0.92], [0.55, 1]], h: 0.5, rmax: 0.235 }, at: [0, -0.02, 0], anim: ['br'] },
    { name: 'chest', parent: 'torso', prim: { t: 'sphere', r: [0.18, 0.24, 0.1] }, at: [0, 0.24, 0.135], slot: 'P+', fluffy: 0.003 },
    { name: 'neck', parent: 'torso', prim: { t: 'capsule', r: 0.13, len: 0.06 }, at: [0, 0.42, 0.0], rot: [14, 0, 0] },
    // back carapace (shell on the back only) + rim seam (arc 180) + shingles + spine crystals
    { name: 'carapace', parent: 'torso', prim: { t: 'sphere', r: CA }, at: [0, 0.27, -0.1], slot: 'S', mat: 'SHELL' },
    { name: 'seam', parent: 'carapace', prim: { t: 'torus', R: 0.255, r: 0.013, arc: 180 }, scale: [1, 1.1, 1], slot: 'A', emissive: 0.4 },
    { name: 'seamLow', parent: 'carapace', prim: { t: 'torus', R: 0.255, r: 0.013, arc: 180 }, rot: [0, 0, 180], scale: [1, 1.1, 1], slot: 'A', emissive: 0.4 },
    ...shingles,
    ...crystals,
    // flat otter head: wider than tall, rounded muzzle with whisker pads, small low ears, no helmet
    { name: 'head', parent: 'torso', prim: { t: 'sphere', r: [0.155, 0.12, 0.165] }, at: [0, 0.54, 0.06], anim: ['look'] },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.03, 0.028, 0.016] }, at: [0.135, 0.04, -0.05], rot: [0, 50, -10] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.06, 0.08] }, at: [0, -0.04, 0.12], slot: 'W' },
    { name: 'pad', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.055, 0.045, 0.045] }, at: [0.04, -0.005, 0.035], slot: 'W' },
    { name: 'nose', parent: 'muzzle', prim: { t: 'sphere', r: [0.04, 0.024, 0.024] }, at: [0, 0.035, 0.07], slot: 'D', mat: 'SKIN_WET' },
    { name: 'nostrils', parent: 'nose', prim: { t: 'none' }, at: [0, 0, 0.02], anim: ['fx:nostrils'] },
    { name: 'jaw', parent: 'muzzle', prim: { t: 'sphere', r: [0.08, 0.028, 0.065], half: true }, at: [0, -0.042, -0.005], rot: [180, 0, 0], slot: 'W', anim: ['jaw'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.034, w: 1.6 }, at: [0, -0.022, 0.072], rot: [14, 0, 0], anim: ['fx:mouth'] },
    { name: 'whiskerNub', parent: 'pad', mirror: true, prim: { t: 'cone', r: 0.012, h: 0.04 }, at: [0.045, 0.0, 0.01], rot: [0, 0, -90], slot: 'A+' },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.048 }, at: [0.075, 0.04, 0.13], rot: [-6, 28, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.015, len: 0.045 }, at: [0.1, 0.098, 0.12], rot: [0, 28, 96], slot: 'P-' },
    // arms: thick, hanging at the sides; webbed paws (empty — never gripping shell)
    { name: 'shoulder', parent: 'torso', mirror: true, prim: { t: 'sphere', r: [0.09, 0.09, 0.1] }, at: [0.2, 0.36, 0.0] },
    { name: 'arm', parent: 'shoulder', mirror: true, prim: { t: 'capsule', r: 0.07, len: 0.14 }, at: [0.03, 0.0, 0.0], rot: [168, 0, -10], anim: ['gait:BL'] },
    { name: 'forearm', parent: 'arm', mirror: true, prim: { t: 'capsule', r: 0.064, len: 0.12 }, at: [0, 0.25, 0], rot: [-28, 0, 4] },
    { name: 'paw', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.075, 0.055, 0.075] }, at: [0, 0.24, 0.01] },
    { name: 'pawWeb', parent: 'paw', mirror: true, prim: { t: 'extrude', shape: 'X_fan', w: 0.15, h: 0.08, depth: 0.014 }, at: [0, 0.035, 0.02], rot: [-70, 0, 0], slot: 'P+', mat: 'SKIN' },
    // legs: thick thigh, short shin, broad webbed foot with toe ridges
    { name: 'thigh', parent: 'pelvis', mirror: true, prim: { t: 'sphere', r: [0.12, 0.13, 0.13] }, at: [0.12, -0.1, 0.03], anim: ['gait:L'] },
    { name: 'shin', parent: 'thigh', mirror: true, prim: { t: 'capsule', r: 0.07, len: 0.06 }, at: [0, -0.02, 0], rot: [180, 0, 0] },
    { name: 'foot', parent: 'shin', mirror: true, prim: { t: 'extrude', shape: 'X_fan', w: 0.24, h: 0.19, depth: 0.04 }, at: [0, 0.18, 0.0], rot: [-90, 0, 0] },
    { name: 'toes', parent: 'foot', mirror: true, prim: { t: 'torus', R: 0.085, r: 0.016, arc: 150 }, at: [0, 0.02, 0.028], rot: [0, 0, 15], slot: 'P+', lod: 0 },
    // thick otter tail sweeping round the left side on the ground into the fan-shell hinge
    { name: 'tail', parent: 'pelvis', prim: { t: 'tube', pts: [[0, -0.02, -0.12], [0.04, -0.17, -0.3], [0.18, -0.26, -0.44], [0.36, -0.27, -0.48], [0.47, -0.25, -0.43]], r0: 0.115, r1: 0.07 } },
    { name: 'shield', parent: 'pelvis', prim: { t: 'extrude', shape: 'X_fan', w: 2 * R, h: R, depth: 0.075 }, at: [0.5, -0.33, -0.42], rot: [0, 62, 0], slot: 'S', mat: 'SHELL', anim: ['fx:shield'] },
    { name: 'hinge', parent: 'shield', prim: { t: 'sphere', r: [0.06, 0.05, 0.06] }, at: [0, 0.03, 0.0], slot: 'S-', mat: 'SHELL' },
    ...ribs,
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.3], anim: ['fx:ground'] },
  ],
};
