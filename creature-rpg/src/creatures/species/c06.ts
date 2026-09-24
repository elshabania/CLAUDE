// c06 Magmouflon — f02 stage 3, fire/stone. Fore-massed bison-taper giant: overlapping basalt hex-plates
// over a glowing magma underlayer on the shoulders and back, horns closed into near-complete kiln rings,
// dark beard, short pillar legs. No crater or hump vent (originality audit) (design/creatures.md §4 c06).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const D = 180 / Math.PI;
/** Euler (XYZ) that turns local +Z onto the unit vector n, plus an in-plane spin. */
function faceZ(n: V3, spin = 0): V3 {
  const l = Math.hypot(n[0], n[1], n[2]);
  const [x, y, z] = [n[0] / l, n[1] / l, n[2] / l];
  return [Math.atan2(-y, z) * D, Math.asin(x) * D, spin];
}

// --- basalt plates over magma ------------------------------------------------------------------
// The shoulder/back hump is a rust-fur ellipsoid (root frame, pitched front-up). Each basalt hex
// plate sits on its surface over a slightly larger glowing magma hex, so magma shows only as seams
// in the gaps between plates (the spec's single underlayer ellipsoid, realised per plate so it
// never shows as a bare orange mass on the flanks).
const UC: V3 = [0, 0.56, 0.02];
const UR: V3 = [0.31, 0.4, 0.5];
// [azimuth around the long axis (0 = top, ±90 = sides) deg, z fraction -1..1, hex radius]
const PLATES: [number, number, number][] = [
  [0, 0.84, 0.12], [-48, 0.8, 0.12], [48, 0.8, 0.12],
  [0, 0.5, 0.15], [-50, 0.42, 0.14], [50, 0.42, 0.14],
  [-26, 0.08, 0.15], [26, 0.08, 0.15], [-74, 0.04, 0.13], [74, 0.04, 0.13],
  [0, -0.3, 0.145], [-48, -0.32, 0.135], [48, -0.32, 0.135],
  [-22, -0.66, 0.12], [22, -0.66, 0.12],
  [-84, 0.42, 0.12], [84, 0.42, 0.12], [-80, -0.34, 0.12], [80, -0.34, 0.12],
];
function plates(): PartDef[] {
  return PLATES.flatMap(([az, zf, r], i): PartDef[] => {
    const a = az / D;
    const cz = zf * 0.92;
    const ring = Math.sqrt(Math.max(0, 1 - cz * cz));
    // point on the unit sphere, then scaled onto the ellipsoid; normal = p / r²
    const u: V3 = [Math.sin(a) * ring, Math.cos(a) * ring, cz];
    const p: V3 = [u[0] * UR[0], u[1] * UR[1], u[2] * UR[2]];
    const n: V3 = [u[0] / UR[0], u[1] / UR[1], u[2] / UR[2]];
    const nl = Math.hypot(...n);
    const along = (d: number): V3 => [p[0] + (n[0] / nl) * d, p[1] + (n[1] / nl) * d, p[2] + (n[2] / nl) * d];
    const rot = faceZ(n, (i * 37) % 60);
    return [
      { name: `magma${i}`, parent: 'hump', prim: { t: 'extrude', shape: 'X_hexplate', w: r * 2.6, h: r * 2.6, depth: 0.02 }, at: along(0.004), rot, slot: '#8A1E08', glowColor: 'A', emissive: 1.6, flat: true },
      { name: `plate${i}`, parent: 'hump', prim: { t: 'extrude', shape: 'X_hexplate', w: r * 2.3, h: r * 2.3, depth: 0.04 }, at: along(0.024), rot, slot: 'P', mat: 'STONE', flat: true },
    ];
  });
}

// --- kiln-ring horns --------------------------------------------------------------------------
// 1.6-turn spiral in the sagittal plane around the ear axis (≈X), slowly drifting outward so the
// coil closes into a ring with a readable hole. Tube points carry X, so each side is explicit.
const TURNS = 1.6;
function hornAt(t: number, rScale = 1): V3 {
  const th = -0.35 + t * TURNS * Math.PI * 2;
  const r = (0.135 - 0.035 * t) * rScale;
  return [0.02 + 0.1 * t, r * Math.sin(th), r * Math.cos(th)];
}
const HN = 30;
function horn(side: 'L' | 'R'): PartDef[] {
  const sx = side === 'R' ? -1 : 1;
  const pts = (k: number): V3[] => Array.from({ length: HN + 1 }, (_, i) => { const p = hornAt(i / HN, k); return [p[0] * sx, p[1], p[2]] as V3; });
  return [
    { name: `horn_${side}`, parent: 'head', prim: { t: 'none' }, at: [0.11 * sx, 0.07, -0.08], rot: [0, 0, -8 * sx], anim: side === 'L' ? ['fx:horns'] : [] },
    { name: `hornRing_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: pts(1), r0: 0.06, r1: 0.024 }, slot: '#3A302C', mat: 'SHELL' },
    // emissive inner face: a glowing strip riding the inside of the coil
    { name: `hornGlow_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: pts(0.72), r0: 0.03, r1: 0.013 }, slot: 'A', emissive: 1.6, mat: 'GLOW' },
  ];
}

export const c06: SpeciesVisual = {
  id: 'c06',
  H: 1.7,
  colors: { P: '#2B2A2E', S: '#6E2A1C', A: '#FF5A1F', W: '#8A3A26' },
  mat: 'FUR',
  rim: '#FF7A40',
  rimStrength: 0.3,
  eye: { shape: 'almond', sclera: '#1A1414', iris: '#FFB347', irisRatio: 0.85, pupil: 'h-bar', pupilRatio: 0.4, highlights: 1, lid: 0.2, lidAngle: -6, glow: '#FFB347' },
  mouth: { style: 'line' },
  rig: { type: 'QUAD', gaitHz: 0.8, stride: 18, bounce: 0.015, breath: 0.012, breathHz: 0.35, attack: 'slam', special: 'cast', faint: 'forward', lean: 2 },
  parts: [
    // --- massive forequarters tapering to small hips ---
    { name: 'fore', prim: { t: 'sphere', r: [0.34, 0.32, 0.34] }, at: [0, 0.62, 0.12], anim: ['br'], slot: 'S', fluffy: 0.008 },
    { name: 'hind', prim: { t: 'sphere', r: [0.22, 0.23, 0.24] }, at: [0, 0.48, -0.38], slot: 'S', fluffy: 0.006 },
    { name: 'barrel', prim: { t: 'capsule', r: 0.24, len: 0.24 }, at: [0, 0.55, -0.42], rot: [90, 0, 0], slot: 'S' },
    { name: 'shoulder', parent: 'fore', prim: { t: 'lathe', profile: 'L_dome', h: 0.18, rmax: 0.26 }, at: [0, 0.2, -0.06], slot: 'S' },
    // shoulder/back hump carrying the plates
    { name: 'hump', prim: { t: 'none' }, at: UC, rot: [-24, 0, 0], anim: ['br'] },
    { name: 'humpFur', parent: 'hump', prim: { t: 'sphere', r: UR }, slot: 'S', anim: ['fx:body'] },
    ...plates(),
    // --- neck + head, carried low in front ---
    { name: 'neck', parent: 'fore', prim: { t: 'capsule', r: 0.17, len: 0.1 }, at: [0, 0.04, 0.2], rot: [108, 0, 0], slot: 'S', anim: ['look'] },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [0.16, 0.165, 0.185] }, at: [0, 0.26, 0.02], rot: [-108, 0, 0], slot: 'S', anim: ['look'] },
    { name: 'forelock', parent: 'head', prim: { t: 'sphere', r: [0.12, 0.07, 0.1] }, at: [0, 0.12, 0.02], slot: 'S-', fluffy: 0.008 },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'box', w: 0.1, h: 0.035, d: 0.07 }, at: [0.065, 0.085, 0.13], rot: [15, 15, -14], slot: 'P', mat: 'STONE', flat: true },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.044 }, at: [0.075, 0.035, 0.152], rot: [0, 28, 0], scale: [1.2, 1, 1] },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.105, 0.09, 0.1] }, at: [0, -0.07, 0.14], slot: 'W' },
    { name: 'nostril', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: [0.016, 0.012, 0.01] }, at: [0.035, 0.02, 0.092], slot: 'D', lod: 0, anim: ['fx:nostrils'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.04, w: 1.4 }, at: [0, -0.04, 0.085], rot: [25, 0, 0] },
    { name: 'jaw', parent: 'muzzle', prim: { t: 'sphere', r: [0.085, 0.04, 0.085], half: true }, at: [0, -0.06, -0.01], rot: [180, 0, 0], slot: 'W', anim: ['jaw'] },
    { name: 'beard', parent: 'jaw', prim: { t: 'sphere', r: [0.075, 0.12, 0.06] }, at: [0, 0.08, -0.03], rot: [-12, 0, 0], slot: 'P', fluffy: 0.008, anim: ['sway'] },
    ...horn('L'),
    ...horn('R'),
    // --- short thick pillar legs ---
    { name: 'legF', parent: 'fore', mirror: true, prim: { t: 'capsule', r: 0.09, len: 0.14, r2: 0.075 }, at: [0.2, -0.16, 0.04], rot: [180, 0, 0], slot: 'S', anim: ['gait:FL'] },
    { name: 'shinF', parent: 'legF', mirror: true, prim: { t: 'capsule', r: 0.072, len: 0.1 }, at: [0, 0.22, 0], slot: 'S' },
    { name: 'hoofF', parent: 'shinF', mirror: true, prim: { t: 'cyl', r: 0.075, h: 0.06, r2: 0.085 }, at: [0, 0.2, 0], slot: 'D', emissive: 0.2, glowColor: 'A', anim: ['fx:ground'] },
    { name: 'legB', parent: 'hind', mirror: true, prim: { t: 'capsule', r: 0.075, len: 0.1, r2: 0.062 }, at: [0.14, -0.1, 0], rot: [180, 0, 0], slot: 'S', anim: ['gait:BL'] },
    { name: 'shinB', parent: 'legB', mirror: true, prim: { t: 'capsule', r: 0.058, len: 0.08 }, at: [0, 0.17, 0], slot: 'S' },
    { name: 'hoofB', parent: 'shinB', mirror: true, prim: { t: 'cyl', r: 0.062, h: 0.05, r2: 0.07 }, at: [0, 0.16, 0], slot: 'D', emissive: 0.2, glowColor: 'A' },
    // --- small tail tuft ---
    { name: 'tail', parent: 'hind', prim: { t: 'capsule', r: 0.035, len: 0.1, r2: 0.05 }, at: [0, 0.08, -0.24], rot: [-150, 0, 0], slot: 'P', anim: ['sway'] },
  ],
};
