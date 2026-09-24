// c13 Rollith — f05 stage 1, stone. Armoured hex-plate ball with a peeking snout, stubby legs and a
// banded belt-tail (design/creatures.md §4 c13; silhouette §7.3: circle + small forward point + crown bumps).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const DEG = 180 / Math.PI;
/** Euler (pitch, yaw, roll) that turns local +Z onto direction d; roll spins the part about that axis. */
function faceDir(d: V3, roll = 0): V3 {
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  return [Math.atan2(-y, z) * DEG, Math.asin(x) * DEG, roll];
}
const rad = (a: number) => a / DEG;
function sph(el: number, az: number, r: number): V3 {
  return [Math.cos(rad(el)) * Math.sin(rad(az)) * r, Math.sin(rad(el)) * r, Math.cos(rad(el)) * Math.cos(rad(az)) * r];
}

const R = 0.42; // shell radius (×H)
// near-sphere shell profile covering the top ¾ (elevation −40° → 90°), normalised (r, h)
const SHELL_PROFILE: [number, number][] = [];
{
  const lo = -40;
  const s0 = Math.sin(rad(lo));
  for (let e = lo; e <= 90; e += 10) SHELL_PROFILE.push([Math.cos(rad(e)), (Math.sin(rad(e)) - s0) / (1 - s0)]);
  SHELL_PROFILE[SHELL_PROFILE.length - 1] = [0, 1];
}
const SHELL_H = R * (1 - Math.sin(rad(-40)));

// hex plates tiling the dome in rings (elevation, count, azimuth offset, skip-front half-angle)
const plates: PartDef[] = [];
{
  const rings: [number, number, number, number, number][] = [
    // el, n, az0, skipFront, size
    [90, 1, 0, 0, 0.19],
    [62, 6, 0, 0, 0.18],
    [35, 10, 18, 0, 0.18],
    [9, 13, 0, 0, 0.17],
    [-16, 13, 14, 38, 0.15],
  ];
  let k = 0;
  for (const [el, n, az0, skip, size] of rings) {
    for (let i = 0; i < n; i++) {
      const az = az0 + (360 * i) / n;
      const a = ((az + 180) % 360) - 180;
      if (skip && Math.abs(a) < skip) continue;
      const raised = el === 62; // the six raised crown plates
      const p = sph(el, az, R + (raised ? 0.012 : 0.004));
      plates.push({
        name: `plate${k++}`,
        parent: 'shell',
        prim: { t: 'extrude', shape: 'X_hexplate', w: size, h: size, depth: raised ? 0.05 : 0.03 },
        at: p,
        rot: faceDir(p, 0),
        slot: raised ? 'P+' : 'P',
        mat: 'STONE',
      });
    }
  }
}

// banded tail wrapping around the rear-left flank like a belt
const tail: PartDef[] = [];
{
  const el = -22;
  const azs = [182, 158, 134, 110];
  azs.forEach((az, i) => {
    const r = R + 0.06;
    const p = sph(el, az, r);
    const tan: V3 = [-Math.cos(rad(az)), 0, Math.sin(rad(az))]; // direction of decreasing azimuth
    const bandR = 0.075 - i * 0.008;
    tail.push({ name: `band${i}`, parent: 'shell', prim: { t: 'torus', R: bandR, r: 0.03 }, at: p, rot: faceDir(tan), slot: 'P', mat: 'STONE' });
    tail.push({ name: `bandFill${i}`, parent: `band${i}`, prim: { t: 'sphere', r: [bandR + 0.01, bandR + 0.01, 0.055] }, slot: 'P', mat: 'STONE' });
  });
  const az = 88;
  const p = sph(el, az, R + 0.06);
  const tan: V3 = [-Math.cos(rad(az)), 0, Math.sin(rad(az))];
  tail.push({ name: 'tailEnd', parent: 'shell', prim: { t: 'none' }, at: p, rot: faceDir(tan) });
  tail.push({ name: 'tailTip', parent: 'tailEnd', prim: { t: 'cone', r: 0.045, h: 0.11 }, at: [0, 0, -0.02], rot: [90, 0, 0], slot: 'P', mat: 'STONE' });
}

export const c13: SpeciesVisual = {
  id: 'c13',
  H: 0.3,
  colors: { P: '#9A8F80', S: '#E0C7A8', D: '#3A332D' },
  mat: 'FUR',
  rim: '#FFF1D6',
  rimStrength: 0.2,
  eye: { shape: 'round', sclera: '#15110F', iris: '#111111', irisRatio: 0.9, pupil: 'none', highlights: 2, lid: 0 },
  mouth: { style: 'line' },
  rig: { type: 'BALL', gaitHz: 3.2, stride: 30, bounce: 0.05, breath: 0.025, breathHz: 0.7, attack: 'spin', special: 'slam', faint: 'side', lean: 2 },
  parts: [
    { name: 'shell', prim: { t: 'none' }, at: [0, 0.5, 0], rot: [-10, 0, 0], anim: ['br'] },
    // the dome itself is the dark groove colour; the raised hex plates sit on it
    { name: 'dome', parent: 'shell', prim: { t: 'lathe', profile: SHELL_PROFILE, h: SHELL_H, rmax: R }, at: [0, -R * Math.sin(rad(40)), 0], slot: '#5E564D', mat: 'STONE' },
    ...plates,
    { name: 'belly', parent: 'shell', prim: { t: 'sphere', r: [0.34, 0.2, 0.36] }, at: [0, -0.2, 0.02], slot: 'S', fluffy: 0.006 },
    // head peeking out from under the front rim
    { name: 'head', parent: 'shell', prim: { t: 'sphere', r: [0.19, 0.17, 0.18] }, at: [0, -0.1, 0.37], rot: [10, 0, 0], slot: 'S', anim: ['look', 'fx:head'], fluffy: 0.004 },
    { name: 'snout', parent: 'head', prim: { t: 'cone', r: 0.075, h: 0.14 }, at: [0, -0.03, 0.13], rot: [90, 0, 0], slot: 'S' },
    // pale snout shield: a flattened plate over the top of the snout tip
    { name: 'shield', parent: 'snout', prim: { t: 'sphere', r: [0.062, 0.065, 0.04] }, at: [0, 0.085, -0.022], rot: [-24, 0, 0], slot: '#F4E8D6', mat: 'STONE' },
    { name: 'nose', parent: 'snout', prim: { t: 'sphere', r: [0.022, 0.016, 0.018] }, at: [0, 0.135, -0.004], slot: 'D' },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.03, w: 1.6 }, at: [0, -0.08, 0.2], rot: [30, 0, 0], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.062 }, at: [0.095, 0.05, 0.13], rot: [-5, 34, 0] },
    { name: 'cheek', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.03, 0.02, 0.01] }, at: [0.135, -0.035, 0.11], rot: [0, 45, 0], slot: '#E7A89A', lod: 0 },
    // stubby legs
    { name: 'legF', parent: 'shell', mirror: true, prim: { t: 'capsule', r: 0.06, len: 0.08 }, at: [0.19, -0.26, 0.17], rot: [170, 0, -8], slot: 'S', anim: ['gait:FL'] },
    { name: 'footF', parent: 'legF', mirror: true, prim: { t: 'sphere', r: [0.07, 0.035, 0.08] }, at: [0, 0.17, 0.02], slot: 'S-' },
    { name: 'legB', parent: 'shell', mirror: true, prim: { t: 'capsule', r: 0.06, len: 0.08 }, at: [0.19, -0.26, -0.15], rot: [190, 0, -8], slot: 'S', anim: ['gait:BL'] },
    { name: 'footB', parent: 'legB', mirror: true, prim: { t: 'sphere', r: [0.07, 0.035, 0.08] }, at: [0, 0.17, -0.02], slot: 'S-' },
    ...tail,
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.3], anim: ['fx:ground'] },
  ],
};
