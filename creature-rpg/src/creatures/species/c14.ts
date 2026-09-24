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

/** n azimuths (deg) spaced by equal arc length around the RX×RZ ellipse. */
function eqArcAz(n: number, off: number): number[] {
  const M = 360;
  const cum: number[] = [0];
  for (let i = 1; i <= M; i++) {
    const a0 = rad(((i - 1) * 360) / M), a1 = rad((i * 360) / M);
    cum.push(cum[i - 1] + Math.hypot(RX * (Math.sin(a1) - Math.sin(a0)), RZ * (Math.cos(a1) - Math.cos(a0))));
  }
  const total = cum[M];
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const target = ((k + off) / n) * total;
    let i = 1;
    while (i < M && cum[i] < target) i++;
    const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.push(((i - 1 + f) * 360) / M);
  }
  return out;
}

const plates: PartDef[] = [];
{
  // h, count, phase offset (fraction of a step), plate size — rows ≈ 0.2 H apart along the dome surface
  const rings: [number, number, number, number][] = [
    [1, 1, 0, 0.22],
    [0.93, 8, 0.5, 0.22], // the 8 crown plates (raised, P/S alternating)
    [0.78, 12, 0, 0.22],
    [0.5, 15, 0.5, 0.22],
    [0.12, 16, 0, 0.22],
  ];
  const lichen = new Set([12, 16, 19, 25, 29, 33, 38, 41, 46, 50]);
  let k = 0;
  for (const [h, n, off, size] of rings) {
    const azs = n === 1 ? [0] : eqArcAz(n, off);
    for (const az of azs) {
      const crown = h > 0.9 && h < 1;
      const { p, n: nn } = domePoint(h, az, crown ? 0.012 : 0.004);
      plates.push({
        name: `plate${k}`,
        parent: 'domeP',
        prim: { t: 'extrude', shape: 'X_hexplate', w: size, h: size, depth: crown ? 0.05 : 0.03 },
        at: p,
        rot: faceDir(nn, 0),
        slot: lichen.has(k) ? 'S' : crown && k % 2 ? 'S' : 'P',
        mat: 'STONE',
      });
      k++;
    }
  }
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
  rig: { type: 'QUAD', gaitHz: 1.1, stride: 20, bounce: 0.02, breath: 0.02, breathHz: 0.4, waveAmp: 7, waveHz: 0.3, waveAxis: 'roll', attack: 'whip', special: 'slam', faint: 'side', lean: 2 },
  parts: [
    // dome (grooves = the darker base colour between the hex plates)
    { name: 'domeP', prim: { t: 'none' }, at: [0, 0.23, 0], anim: ['br'] },
    { name: 'dome', parent: 'domeP', prim: { t: 'lathe', profile: DOME_PROFILE, h: HT, rmax: RX }, scale: [1, 1, 1.4], slot: '#57524A', mat: 'STONE' },
    { name: 'domeRim', parent: 'domeP', prim: { t: 'torus', R: 0.53, r: 0.045 }, at: [0, 0.01, 0], rot: [90, 0, 0], scale: [1, 1.4, 1], slot: 'P-', mat: 'STONE' },
    ...plates,
    // under-body (dark skin, mostly hidden under the dome)
    { name: 'body', prim: { t: 'sphere', r: [0.4, 0.16, 0.62] }, at: [0, 0.22, 0], slot: 'D' },
    // head
    { name: 'head', parent: 'body', prim: { t: 'sphere', r: [0.2, 0.17, 0.2] }, at: [0, 0.03, 0.8], slot: 'D', anim: ['look', 'fx:head'] },
    { name: 'headCap', parent: 'head', prim: { t: 'lathe', profile: 'L_dome', h: 0.09, rmax: 0.19 }, at: [0, 0.085, -0.015], rot: [12, 0, 0], scale: [1, 1, 1.15], slot: 'P', mat: 'STONE' },
    { name: 'capPlate', parent: 'headCap', prim: { t: 'extrude', shape: 'X_hexplate', w: 0.14, h: 0.14, depth: 0.03 }, at: [0, 0.085, 0], rot: [-90, 0, 0], slot: 'S', mat: 'STONE' },
    { name: 'muzzle', parent: 'head', prim: { t: 'sphere', r: [0.11, 0.085, 0.1] }, at: [0, -0.045, 0.15], slot: 'D+' },
    { name: 'nostril', parent: 'muzzle', mirror: true, prim: { t: 'sphere', r: 0.014 }, at: [0.035, 0.03, 0.08], slot: '#231D19', lod: 0 },
    { name: 'jaw', parent: 'head', prim: { t: 'sphere', r: [0.085, 0.035, 0.08], half: true }, at: [0, -0.11, 0.11], rot: [180, 0, 0], slot: 'D', anim: ['jaw'] },
    { name: 'mouth', parent: 'muzzle', prim: { t: 'mouth', r: 0.035, w: 1.8 }, at: [0, -0.035, 0.075], rot: [25, 0, 0], anim: ['fx:mouth'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.068 }, at: [0.128, 0.045, 0.142], rot: [-5, 38, 0] },
    // short massive legs with 3 nails each
    { name: 'legF', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.115, len: 0.0 }, at: [0.34, 0.02, 0.36], rot: [180, 0, -6], slot: 'D', anim: ['gait:FL'] },
    { name: 'footF', parent: 'legF', mirror: true, prim: { t: 'cyl', r: 0.13, h: 0.05, r2: 0.115 }, at: [0, 0.2, 0], rot: [180, 0, 0], slot: 'D-' },
    { name: 'nailF', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.05 }, at: [0, 0.215, 0.115], rot: [90, 0, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailFa', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [0.065, 0.215, 0.095], rot: [90, 30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailFb', parent: 'legF', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [-0.065, 0.215, 0.095], rot: [90, -30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'legB', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.115, len: 0.0 }, at: [0.34, 0.02, -0.38], rot: [180, 0, -6], slot: 'D', anim: ['gait:BL'] },
    { name: 'footB', parent: 'legB', mirror: true, prim: { t: 'cyl', r: 0.13, h: 0.05, r2: 0.115 }, at: [0, 0.2, 0], rot: [180, 0, 0], slot: 'D-' },
    { name: 'nailB', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.022, h: 0.05 }, at: [0, 0.215, 0.115], rot: [90, 0, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailBa', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [0.065, 0.215, 0.095], rot: [90, 30, 0], slot: '#D8CFB8', lod: 0 },
    { name: 'nailBb', parent: 'legB', mirror: true, prim: { t: 'cone', r: 0.02, h: 0.045 }, at: [-0.065, 0.215, 0.095], rot: [90, -30, 0], slot: '#D8CFB8', lod: 0 },
    // tail: 5 stone rings on a dark skin chain, ending in the cairn club
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: TAIL_N, r0: 0.08, r1: 0.06, len: 0.55, bend: [5, 0, 0] }, at: [0, 0.02, -0.56], rot: [-104, 0, 0], slot: 'D', anim: ['wave'] },
    ...tailParts,
    // tip frame: local +Y ≈ backwards, local +Z ≈ up. Stones stack upward (a cairn), largest at the bottom.
    { name: 'club', parent: 'tailTip', prim: { t: 'none' }, at: [0, 0.14, -0.04], rot: [-22, 0, 0], anim: ['fx:club'] },
    { name: 'stone0', parent: 'club', prim: { t: 'sphere', r: [0.23, 0.2, 0.11] }, at: [0, 0, -0.03], rot: [0, 0, 8], slot: 'P', mat: 'STONE', flat: true },
    { name: 'stone1', parent: 'club', prim: { t: 'sphere', r: [0.195, 0.175, 0.1] }, at: [0.016, 0.02, 0.14], rot: [0, 0, -14], slot: 'S', mat: 'STONE', flat: true },
    { name: 'stone2', parent: 'club', prim: { t: 'sphere', r: [0.16, 0.145, 0.088] }, at: [-0.014, 0.0, 0.28], rot: [0, 0, 20], slot: 'P', mat: 'STONE', flat: true },
    { name: 'stone3', parent: 'club', prim: { t: 'sphere', r: [0.12, 0.11, 0.08] }, at: [0.01, 0.012, 0.4], rot: [0, 0, -6], slot: 'S', mat: 'STONE', flat: true },
    { name: 'spikeA', parent: 'stone1', mirror: true, prim: { t: 'cone', r: 0.04, h: 0.1 }, at: [0.18, 0.0, 0], rot: [0, 0, -90], slot: 'P-', mat: 'STONE' },
    { name: 'spikeB', parent: 'stone2', mirror: true, prim: { t: 'cone', r: 0.035, h: 0.09 }, at: [0.1, 0.1, 0], rot: [0, 0, -45], slot: 'P-', mat: 'STONE' },
    { name: 'ground', prim: { t: 'none' }, at: [0, 0, 0.9], anim: ['fx:ground'] },
  ],
};
