// c15 Lodestodon — f05 stage 3, stone/electric. Colossal hex-plate dome fractured into 3 geode ridges of
// glowing cyan crystals, heavy box head with crystal-tipped horn plates, pillar legs, a tail stub with a
// hovering lodestone boulder behind it, and 6 magnetite stones orbiting the body
// (design/creatures.md §4 c15; silhouette §7.3: spiky ridge crown, 6 detached dots, floating boulder behind).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const DEG = 180 / Math.PI;
function faceDir(d: V3, roll = 0): V3 {
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  return [Math.atan2(-y, z) * DEG, Math.asin(x) * DEG, roll];
}
/** Euler that turns local +Y onto direction d (for cones / prisms that grow along +Y). */
function upDir(d: V3): V3 {
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  // R = Rx(p)·Rz(r) applied to +Y: Rz(r)(0,1,0) = (-sin r, cos r, 0); Rx(p) → (-sin r, cos r cos p, cos r sin p)
  const r = Math.asin(-x);
  const p = Math.atan2(z, y);
  return [p * DEG, 0, r * DEG];
}
const rad = (a: number) => a / DEG;

// Dome: superellipse of revolution (≈ L_dome) rmax 0.50, h 0.48, ×1.3 in Z.
const PX = 2.5;
const RX = 0.5, RZ = 0.65, HT = 0.48, DOME_Y = 0.32;
const DOME_PROFILE: [number, number][] = [];
for (let i = 0; i <= 10; i++) DOME_PROFILE.push([Math.pow(1 - Math.pow(i / 10, PX), 1 / PX), i / 10]);
DOME_PROFILE[10] = [0, 1];
/** Surface point + normal of the dome above (x, z) (dome-local, y from the dome base). */
function surf(x: number, z: number, lift = 0): { p: V3; n: V3 } {
  const rho = Math.min(0.999, Math.hypot(x / RX, z / RZ));
  const h = Math.pow(1 - Math.pow(rho, PX), 1 / PX);
  const k = Math.pow(Math.max(rho, 1e-3), PX - 2);
  const n: V3 = [(k * x) / (RX * RX), Math.pow(h, PX - 1) / HT, (k * z) / (RZ * RZ)];
  const l = Math.hypot(...n);
  return { p: [x + (n[0] / l) * lift, h * HT + (n[1] / l) * lift, z + (n[2] / l) * lift], n };
}
function ringPoint(h: number, az: number, lift: number) {
  const r = Math.pow(1 - Math.pow(h, PX), 1 / PX);
  return surf(r * RX * Math.sin(rad(az)), r * RZ * Math.cos(rad(az)), lift);
}

const parts: PartDef[] = [];

// hex plates around the lower dome (family motif), grooves in the darker base colour
{
  const rings: [number, number, number][] = [
    [0.12, 16, 0],
    [0.46, 14, 0.5 / 14],
    [0.76, 10, 0],
  ];
  let k = 0;
  for (const [h, n, off] of rings) {
    for (let i = 0; i < n; i++) {
      const az = (i / n + off) * 360;
      const { p, n: nn } = ringPoint(h, az, 0.004);
      parts.push({ name: `plate${k++}`, parent: 'domeP', prim: { t: 'extrude', shape: 'X_hexplate', w: 0.215, h: 0.215, depth: 0.035 }, at: p, rot: faceDir(nn), slot: 'P+', mat: 'STONE' });
    }
  }
}

// three geode ridges along Z: jagged flat-shaded rock blocks
const RIDGES: { x: number; zs: number[] }[] = [
  { x: 0, zs: [-0.42, -0.21, 0, 0.21, 0.4] },
  { x: 0.22, zs: [-0.3, -0.08, 0.14, 0.33] },
  { x: -0.22, zs: [-0.3, -0.08, 0.14, 0.33] },
];
{
  let k = 0;
  RIDGES.forEach((rg, j) => {
    rg.zs.forEach((z, i) => {
      const { p, n } = surf(rg.x, z, 0.02);
      const tall = j === 0 ? 0.13 : 0.1;
      parts.push({
        name: `ridge${k++}`,
        parent: 'domeP',
        prim: { t: 'box', w: 0.14, h: 0.2, d: tall },
        at: p,
        rot: faceDir(n, ((i * 37 + j * 11) % 30) - 15),
        slot: 'P',
        mat: 'STONE',
        flat: true,
      });
    });
  });
}

// five crystal clusters seated in the ridges: one hex prism with a pyramid tip + two shards each
const CLUSTERS: [number, number, number][] = [
  // x, z, size
  [0, 0.3, 1.1],
  [0, -0.1, 1.25],
  [0.22, 0.03, 0.95],
  [-0.22, -0.18, 0.95],
  [0.02, -0.4, 0.8],
];
CLUSTERS.forEach(([x, z, s], i) => {
  const { p, n } = surf(x, z, 0.05);
  const base = `clus${i}`;
  parts.push({ name: base, parent: 'domeP', prim: { t: 'none' }, at: p, rot: upDir([n[0] * 0.5, n[1], n[2] * 0.5]) });
  const hh = 0.16 * s;
  const rr = 0.042 * s;
  parts.push({ name: `${base}a`, parent: base, prim: { t: 'extrude', shape: 'X_hexplate', w: rr * 2, h: rr * 2, depth: hh }, at: [0, hh / 2, 0], rot: [-90, 0, 0], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true });
  parts.push({ name: `${base}t`, parent: base, prim: { t: 'cone', r: rr * 0.95, h: rr * 1.6 }, at: [0, hh, 0], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true });
  parts.push({ name: `${base}b`, parent: base, prim: { t: 'cone', r: rr * 0.6, h: hh * 0.95 }, at: [rr * 1.3, 0, rr * 0.4], rot: [8, 0, -28], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true });
  parts.push({ name: `${base}c`, parent: base, prim: { t: 'cone', r: rr * 0.5, h: hh * 0.75 }, at: [-rr * 1.1, 0, -rr * 0.6], rot: [-15, 0, 25], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true });
});

// six orbiting magnetite stones (irregular: two intersecting rotated blocks each)
const ORBIT_R = 0.86;
for (let i = 0; i < 6; i++) {
  const a = rad(i * 60 + 15);
  const y = 0.52 + 0.14 * Math.sin(i * 2.1);
  const s = 0.95 + 0.3 * ((i * 7) % 3) / 2;
  parts.push({ name: `stone${i}`, parent: 'orbit', prim: { t: 'none' }, at: [Math.sin(a) * ORBIT_R, y, Math.cos(a) * ORBIT_R], rot: [i * 40, i * 25, i * 15], anim: ['sway'] });
  parts.push({ name: `stone${i}a`, parent: `stone${i}`, prim: { t: 'box', w: 0.11 * s, h: 0.09 * s, d: 0.1 * s }, rot: [20, 35, 10], slot: 'D', mat: 'METAL', flat: true });
  parts.push({ name: `stone${i}b`, parent: `stone${i}`, prim: { t: 'box', w: 0.09 * s, h: 0.1 * s, d: 0.08 * s }, at: [0.02 * s, 0.015 * s, -0.01 * s], rot: [-30, 60, 45], slot: 'D+', mat: 'METAL', flat: true });
}

export const c15: SpeciesVisual = {
  id: 'c15',
  H: 1.9,
  colors: { P: '#3F4550', A: '#6FE3FF', D: '#2A2A30', S: '#8C95A3' },
  mat: 'STONE',
  rim: '#9FF7FF',
  rimStrength: 0.35,
  eye: { shape: 'round', sclera: '#10222A', iris: '#6FE3FF', irisRatio: 0.86, pupil: 'slit', pupilRatio: 0.34, highlights: 1, lid: 0.15, lidAngle: -6, glow: '#6FE3FF' },
  mouth: { style: 'line' },
  rig: { type: 'QUAD', gaitHz: 0.7, stride: 14, bounce: 0.015, breath: 0.015, breathHz: 0.3, attack: 'slam', special: 'cast', faint: 'collapse', lean: 1 },
  parts: [
    { name: 'domeP', prim: { t: 'none' }, at: [0, DOME_Y, 0], anim: ['br'] },
    { name: 'dome', parent: 'domeP', prim: { t: 'lathe', profile: DOME_PROFILE, h: HT, rmax: RX }, scale: [1, 1, RZ / RX], slot: '#343A44', mat: 'STONE' },
    { name: 'domeRim', parent: 'domeP', prim: { t: 'torus', R: 0.505, r: 0.04 }, at: [0, 0.01, 0], rot: [90, 0, 0], scale: [1, RZ / RX, 1], slot: 'P-' },
    ...parts.filter((p) => p.parent === 'domeP' || p.parent?.startsWith('clus')),
    // under-body
    { name: 'body', prim: { t: 'sphere', r: [0.44, 0.2, 0.56] }, at: [0, 0.3, 0], slot: 'P-' },
    // heavy box head
    { name: 'head', parent: 'body', prim: { t: 'box', w: 0.32, h: 0.22, d: 0.3 }, at: [0, 0.05, 0.72], slot: 'P', anim: ['look', 'fx:head'] },
    { name: 'brow', parent: 'head', prim: { t: 'box', w: 0.34, h: 0.06, d: 0.11 }, at: [0, 0.11, 0.1], rot: [-8, 0, 0], slot: 'P-' },
    { name: 'snoutPlate', parent: 'head', prim: { t: 'box', w: 0.2, h: 0.09, d: 0.06 }, at: [0, 0.0, 0.16], slot: 'P+' },
    { name: 'jaw', parent: 'head', prim: { t: 'box', w: 0.28, h: 0.07, d: 0.26 }, at: [0, -0.13, 0.02], slot: 'P', anim: ['jaw'] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.05, w: 1.8 }, at: [0, -0.08, 0.152], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.056 }, at: [0.095, 0.035, 0.153], rot: [0, 14, 0] },
    { name: 'horn', parent: 'head', mirror: true, prim: { t: 'extrude', shape: 'X_tri', w: 0.11, h: 0.17, depth: 0.06 }, at: [0.12, 0.12, 0.06], rot: [38, 14, -14], slot: 'P+' },
    { name: 'hornTip', parent: 'horn', mirror: true, prim: { t: 'cone', r: 0.025, h: 0.07 }, at: [0, 0.15, 0], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true, anim: ['fx:horn'] },
    // pillar legs
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'lathe', profile: [[0.85, 0], [1, 0.15], [0.9, 0.6], [1.05, 1]], h: 0.24, rmax: 0.11, axis: '-y' }, at: [0.3, -0.06, 0.36], slot: 'P', anim: ['gait:FL'] },
    { name: 'footF', parent: 'legF', mirror: true, prim: { t: 'cyl', r: 0.13, h: 0.05, r2: 0.115 }, at: [0, -0.26, 0], slot: 'D' },
    { name: 'legB', parent: 'body', mirror: true, prim: { t: 'lathe', profile: [[0.85, 0], [1, 0.15], [0.9, 0.6], [1.05, 1]], h: 0.24, rmax: 0.11, axis: '-y' }, at: [0.3, -0.06, -0.36], slot: 'P', anim: ['gait:BL'] },
    { name: 'footB', parent: 'legB', mirror: true, prim: { t: 'cyl', r: 0.13, h: 0.05, r2: 0.115 }, at: [0, -0.26, 0], slot: 'D' },
    // tail stub + hovering boulder + arcs
    { name: 'tailStub', parent: 'body', prim: { t: 'cone', r: 0.09, h: 0.16 }, at: [0, 0.04, -0.54], rot: [-105, 0, 0], slot: 'P-' },
    { name: 'boulderP', prim: { t: 'none' }, at: [0, 0.5, -1.06], anim: ['sway', 'fx:boulder'] },
    { name: 'boulderA', parent: 'boulderP', prim: { t: 'box', w: 0.27, h: 0.24, d: 0.25 }, rot: [18, 30, 12], slot: 'D', mat: 'METAL', flat: true },
    { name: 'boulderB', parent: 'boulderP', prim: { t: 'box', w: 0.24, h: 0.26, d: 0.22 }, at: [0.03, 0.02, -0.02], rot: [-25, 70, 40], slot: 'D+', mat: 'METAL', flat: true },
    { name: 'boulderC', parent: 'boulderP', prim: { t: 'box', w: 0.2, h: 0.18, d: 0.24 }, at: [-0.04, -0.03, 0.03], rot: [40, -20, -30], slot: 'D', mat: 'METAL', flat: true },
    { name: 'boulderGem', parent: 'boulderP', prim: { t: 'cone', r: 0.03, h: 0.08 }, at: [0.02, 0.13, 0.02], rot: [0, 0, -12], slot: 'A', mat: 'ICE', emissive: 1.0, opacity: 0.9, flat: true, lod: 0 },
    { name: 'arc1', prim: { t: 'tube', pts: [[0, 0.62, -0.62], [0.05, 0.6, -0.72], [-0.03, 0.56, -0.8], [0.04, 0.53, -0.9]], r0: 0.008, r1: 0.006 }, slot: 'A', mat: 'GLOW', emissive: 1.6, lod: 0 },
    { name: 'arc2', prim: { t: 'tube', pts: [[0.2, 0.55, -0.48], [0.16, 0.58, -0.66], [0.12, 0.5, -0.78], [0.07, 0.52, -0.94]], r0: 0.007, r1: 0.005 }, slot: 'A', mat: 'GLOW', emissive: 1.6, lod: 0 },
    // orbit pivot (0.1 rev/s via the shared `orbit` tag)
    { name: 'orbit', prim: { t: 'none' }, anim: ['orbit', 'fx:orbit'] },
    ...parts.filter((p) => p.parent === 'orbit' || p.parent?.startsWith('stone')),
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.9], anim: ['fx:ground'] },
  ],
};
