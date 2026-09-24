// c14 Cairnback — f05 stage 2, stone. Low glyptodont-like quadruped: high elongated hex-plate dome with
// ochre lichen, armoured head cap, stubby nailed legs and a ringed tail ending in a cairn club of 4 stacked
// stones (design/creatures.md §4 c14; silhouette §7.3: dome arc, club knob at the tail end, low head).
import type { PartDef, SpeciesVisual, V3 } from '../assemble';

const DEG = 180 / Math.PI;
function faceDir(d: V3, roll = 0): V3 {
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = d[0] / l, y = d[1] / l, z = d[2] / l;
  return [Math.atan2(-y, z) * DEG, Math.asin(x) * DEG, roll];
}
const rad = (a: number) => a / DEG;

// Dome = superellipse of revolution (exponent 2.5 matches the L_dome profile within ~2%), stretched ×1.4 in Z.
const PX = 2.5;
const RX = 0.52, RZ = 0.52 * 1.4, HT = 0.55;
const DOME_PROFILE: [number, number][] = [];
for (let i = 0; i <= 10; i++) {
  const h = i / 10;
  DOME_PROFILE.push([Math.pow(1 - Math.pow(h, PX), 1 / PX), h]);
}
DOME_PROFILE[10] = [0, 1];
function domePoint(h: number, az: number, lift: number): { p: V3; n: V3 } {
  const r = Math.pow(1 - Math.pow(h, PX), 1 / PX);
  const x = r * RX * Math.sin(rad(az)), z = r * RZ * Math.cos(rad(az)), y = h * HT;
  const k = Math.pow(Math.max(r, 1e-3), PX - 2);
  const n: V3 = [(k * x) / (RX * RX), Math.pow(h, PX - 1) / HT, (k * z) / (RZ * RZ)];
  const l = Math.hypot(...n);
  return { p: [x + (n[0] / l) * lift, y + (n[1] / l) * lift, z + (n[2] / l) * lift], n };
}

const plates: PartDef[] = [];
{
  // h, count, azimuth offset, plate size
  const rings: [number, number, number, number][] = [
    [1, 1, 0, 0.2],
    [0.84, 7, 0, 0.2],
    [0.62, 12, 15, 0.2],
    [0.38, 15, 0, 0.2],
    [0.13, 16, 11, 0.19],
  ];
  const lichen = new Set([2, 5, 9, 14, 17, 22, 26, 31, 35, 40, 44, 47]);
  let k = 0;
  for (const [h, n, az0, size] of rings) {
    for (let i = 0; i < n; i++) {
      const az = az0 + (360 * i) / n;
      const crown = h >= 0.84;
      const { p, n: nn } = domePoint(h, az, crown ? 0.012 : 0.004);
      plates.push({
        name: `plate${k}`,
        parent: 'domeP',
        prim: { t: 'extrude', shape: 'X_hexplate', w: size, h: size, depth: crown ? 0.045 : 0.03 },
        at: p,
        rot: faceDir(nn, 0),
        slot: lichen.has(k) ? 'S' : crown && k % 2 ? 'S' : 'P',
        mat: 'STONE',
      });
      k++;
    }
  }
  // soft lichen blotches spilling over plate seams
  const blotch: [number, number, number][] = [[0.5, 40, 0.09], [0.28, 125, 0.1], [0.72, 210, 0.08], [0.45, 300, 0.09], [0.2, 250, 0.08], [0.9, 90, 0.07]];
  blotch.forEach(([h, az, s], i) => {
    const { p, n } = domePoint(h, az, 0.03);
    plates.push({ name: `lichen${i}`, parent: 'domeP', prim: { t: 'sphere', r: [s, s * 0.8, 0.02] }, at: p, rot: faceDir(n, i * 30), slot: 'S', mat: 'FUR', fluffy: 0.008, lod: 0 });
  });
}

// ringed tail + cairn club
const TAIL_N = 5;
const tailParts: PartDef[] = [];
for (let i = 0; i < TAIL_N; i++) {
  const R = 0.1 - i * 0.008;
  tailParts.push({ name: `ring${i}`, parent: `tail${i}`, prim: { t: 'torus', R, r: 0.032 }, at: [0, 0.05, 0], rot: [90, 0, 0], slot: i % 2 ? 'P' : 'P+', mat: 'STONE' });
}

export const c14: SpeciesVisual = {
  id: 'c14',
  H: 0.9,
  colors: { P: '#7A7468', S: '#C4B454', D: '#4A4038' },
  mat: 'FUR',
  rim: '#FFF4C2',
  rimStrength: 0.2,
  eye: { shape: 'round', iris: '#B89A3A', irisRatio: 0.68, pupil: 'round', pupilRatio: 0.4, highlights: 1, lid: 0.35, lidAngle: -8 },
  mouth: { style: 'line' },
  rig: { type: 'QUAD', gaitHz: 1.1, stride: 20, bounce: 0.02, breath: 0.02, breathHz: 0.4, waveAmp: 7, waveHz: 0.3, waveAxis: 'yaw', attack: 'whip', special: 'slam', faint: 'side', lean: 2 },
  parts: [
    // dome (grooves = the darker base colour between the hex plates)
    { name: 'domeP', prim: { t: 'none' }, at: [0, 0.28, 0], anim: ['br'] },
    { name: 'dome', parent: 'domeP', prim: { t: 'lathe', profile: DOME_PROFILE, h: HT, rmax: RX }, scale: [1, 1, 1.4], slot: 'P-', mat: 'STONE' },
    { name: 'domeRim', parent: 'domeP', prim: { t: 'torus', R: 0.53, r: 0.045 }, at: [0, 0.01, 0], rot: [90, 0, 0], scale: [1, 1.4, 1], slot: 'P-', mat: 'STONE' },
    ...plates,
    // under-body (dark skin, mostly hidden under the dome)
    { name: 'body', prim: { t: 'sphere', r: [0.4, 0.18, 0.62] }, at: [0, 0.26, 0], slot: 'D' },
    // head
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.17, 0.15, 0.18] }, at: [0, 0.0, 0.78], slot: 'D', anim: ['look', 'fx:head'] },
    { name: 'headCap', parent: 'head', prim: { t: 'lathe', profile: 'L_dome', h: 0.08, rmax: 0.16 }, at: [0, 0.075, -0.01], rot: [12, 0, 0], scale: [1, 1, 1.15], slot: 'P', mat: 'STONE' },
    { name: 'capPlate', parent: 'headCap', prim: { t: 'extrude', shape: 'X_hexplate', w: 0.12, h: 0.12, depth: 0.03 }, at: [0, 0.075, 0], rot: [-90, 0, 0], slot: 'S', mat: 'STONE' },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.1, 0.08, 0.09] }, at: [0, -0.04, 0.14], slot: 'D+' },
    { name: 'nostril', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: 0.014 }, at: [0.035, 0.03, 0.08], slot: '#231D19', lod: 0 },
    { name: 'jaw', parent: 'head', prim: { t: 'sphere', r: [0.085, 0.035, 0.08], half: true }, at: [0, -0.1, 0.1], rot: [180, 0, 0], slot: 'D', anim: ['jaw'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.035, w: 1.8 }, at: [0, -0.035, 0.075], rot: [25, 0, 0], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.052 }, at: [0.1, 0.035, 0.11], rot: [-5, 38, 0] },
    // short massive legs with 3 nails each
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.1, len: 0.06 }, at: [0.34, 0.02, 0.36], rot: [180, 0, -6], slot: 'D', anim: ['gait:FL'] },
    { name: 'footF', parent: 'legF', mirror: true, prim: { t: 'cyl', r: 0.115, h: 0.05, r2: 0.1 }, at: [0, 0.24, 0], rot: [180, 0, 0], slot: 'D-' },
    { name: 'nailF', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.05 }, at: [0, 0.255, 0.1], rot: [90, 0, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailFa', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [0.055, 0.255, 0.085], rot: [90, 30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailFb', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [-0.055, 0.255, 0.085], rot: [90, -30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'legB', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.1, len: 0.06 }, at: [0.34, 0.02, -0.38], rot: [180, 0, -6], slot: 'D', anim: ['gait:BL'] },
    { name: 'footB', parent: 'legB', mirror: true, prim: { t: 'cyl', r: 0.115, h: 0.05, r2: 0.1 }, at: [0, 0.24, 0], rot: [180, 0, 0], slot: 'D-' },
    { name: 'nailB', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.05 }, at: [0, 0.255, 0.1], rot: [90, 0, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailBa', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [0.055, 0.255, 0.085], rot: [90, 30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailBb', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [-0.055, 0.255, 0.085], rot: [90, -30, 0], slot: '#D8CFB8', lod: 0 },
    // tail: 5 stone rings on a dark skin chain, ending in the cairn club
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: TAIL_N, r0: 0.075, r1: 0.055, len: 0.5, bend: [-4, 0, 0] }, at: [0, 0.02, -0.56], rot: [-100, 0, 0], slot: 'D', anim: ['wave'] },
    ...tailParts,
    // tip frame: local +Y ≈ backwards, local +Z ≈ up. Stones stack upward (a cairn), largest at the bottom.
    { name: 'club', parent: 'tailTip', prim: { t: 'none' }, at: [0, 0.1, 0], rot: [-12, 0, 0], anim: ['fx:club'] },
    { name: 'stone0', parent: 'club', prim: { t: 'sphere', r: [0.17, 0.15, 0.085] }, at: [0, 0, -0.02], rot: [0, 0, 8], slot: 'P', mat: 'STONE', flat: true },
    { name: 'stone1', parent: 'club', prim: { t: 'sphere', r: [0.145, 0.13, 0.075] }, at: [0.012, 0.015, 0.105], rot: [0, 0, -14], slot: 'S', mat: 'STONE', flat: true },
    { name: 'stone2', parent: 'club', prim: { t: 'sphere', r: [0.12, 0.11, 0.065] }, at: [-0.01, 0.0, 0.21], rot: [0, 0, 20], slot: 'P', mat: 'STONE', flat: true },
    { name: 'stone3', parent: 'club', prim: { t: 'sphere', r: [0.09, 0.085, 0.06] }, at: [0.008, 0.01, 0.3], rot: [0, 0, -6], slot: 'S', mat: 'STONE', flat: true },
    { name: 'spikeA', parent: 'stone1', mirror: true, prim: { t: 'cone', r: 0.032, h: 0.08 }, at: [0.13, 0.0, 0], rot: [0, 0, -90], slot: 'P-', mat: 'STONE' },
    { name: 'spikeB', parent: 'stone2', mirror: true, prim: { t: 'cone', r: 0.028, h: 0.07 }, at: [0.075, 0.075, 0], rot: [0, 0, -45], slot: 'P-', mat: 'STONE' },
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.9], anim: ['fx:ground'] },
  ],
};
