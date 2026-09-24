// c24 Venomantle — f08 stage 3, toxin/water. Tall hooded tripod octopus: 3 support arms + 3 display arms joined by a
// dark cloak web whose inner face carries blue-and-gold rings (design/creatures.md §4 c24). Always SIX arms, never eight.
//
// The web panels are planar wedges: the three display arms radiate from one point behind the head in a fan plane, so the
// wedge between two neighbouring arms is exactly flat and can be an extruded outline (S24_web, registered below) that
// lines up with the arms without per-frame rebuilding. The fan (arms + panels) moves as one unit.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

// isoceles wedge: apex at origin, corners at (±0.5, 1), scalloped concave outer edge (web between arm tips)
if (!SHAPES.S24_web) {
  SHAPES.S24_web = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.5, 1);
    const n = 30;
    for (let i = 1; i < n; i++) {
      const x = 0.5 - i / n;
      const y = 1 - 0.2 * (1 - (2 * x) ** 2) - 0.07 * Math.abs(Math.sin(3 * Math.PI * (x + 0.5)));
      s.lineTo(x, y);
    }
    s.lineTo(-0.5, 1);
    s.closePath();
    return s;
  };
}

const GOLD = '#F0C040';
const DEG = Math.PI / 180;

// display fan: arms at in-plane angles (deg from straight up; + is the creature's left), wedges between neighbours
const ARM_LEN = 0.95;
const PANEL_LEN = 0.84;
const ARMS = [
  { id: 'dispL', a: 58 },
  { id: 'dispR', a: -58 },
  { id: 'dispB', a: 180 },
];
const PANELS = [
  { id: 'webT', a0: 58, a1: -58 },
  { id: 'webL', a0: 58, a1: 180 },
  { id: 'webR', a0: -58, a1: -180 },
];

const fan: PartDef[] = [];
for (const arm of ARMS) {
  const d: V3 = [Math.sin(arm.a * DEG), Math.cos(arm.a * DEG), 0];
  const p = (t: number, z = 0): V3 => [d[0] * t * ARM_LEN, d[1] * t * ARM_LEN, z];
  // slight forward hook at the tip so the arm reads as a limb, not a strut
  fan.push({ name: arm.id, parent: 'fan', prim: { t: 'tube', pts: [p(0.05, 0.0), p(0.35, 0.01), p(0.7, 0.02), p(0.92, 0.06), p(1.0, 0.13)], r0: 0.07, r1: 0.022 }, slot: 'P', anim: ['fx:arm_' + arm.id] });
  // two rings along each arm (front face)
  for (const [k, t] of [[1, 0.42], [2, 0.66]] as [number, number][]) {
    const q = p(t);
    fan.push({ name: `${arm.id}Ring${k}`, parent: 'fan', prim: { t: 'torus', R: 0.045 - k * 0.006, r: 0.011 }, at: [q[0], q[1], 0.055 - k * 0.008], slot: k === 1 ? 'A' : GOLD, mat: 'GLOW', emissive: 1.0, anim: ['glow'] });
  }
}
for (const w of PANELS) {
  const half = (Math.abs(w.a1 - w.a0) / 2) * DEG;
  const bis = (w.a0 + w.a1) / 2;
  const wid = 2 * PANEL_LEN * Math.sin(half);
  const hgt = PANEL_LEN * Math.cos(half);
  fan.push({ name: w.id, parent: 'fan', prim: { t: 'extrude', shape: 'S24_web', w: wid, h: hgt, depth: 0.012 }, rot: [0, 0, -bis], slot: 'D', mat: 'MEMBRANE', opacity: 0.95 });
  // ring pattern on the inner (front) face: blue outer rings, gold inner rings
  const pts: [number, number, number, string][] = [
    [-0.2, 0.62, 0.07, 'A'], [0.2, 0.62, 0.07, 'A'], [0, 0.5, 0.06, GOLD], [0, 0.78, 0.055, 'A'],
  ];
  pts.forEach(([u, v, R, col], i) => {
    fan.push({ name: `${w.id}Ring${i}`, parent: w.id, prim: { t: 'torus', R, r: R * 0.2 }, at: [u * wid, v * hgt, 0.012], slot: col, mat: 'GLOW', emissive: 1.0, anim: ['glow'] });
  });
}

// tripod support arms: two front, one back (keeps the face clear); rotating single-arm step
const legs: PartDef[] = [];
for (const [id, yaw, gait] of [['supFL', 55, 'A'], ['supFR', -55, 'B'], ['supB', 180, 'C']] as [string, number, string][]) {
  const yr = yaw * DEG;
  legs.push({ name: id + 'Root', parent: 'head', prim: { t: 'none' }, at: [Math.sin(yr) * 0.13, -0.13, Math.cos(yr) * 0.12], rot: [0, yaw, 0] });
  legs.push({ name: id, parent: id + 'Root', prim: { t: 'none' }, chain: { n: 5, r0: 0.085, r1: 0.032, len: 1.02, bend: [-7, 0, 0] }, rot: [163, 0, 0], anim: ['gait:' + gait] });
}

// peaked hood (L_bulb drawn to a point so the hood reads at 20 px)
const HOOD: [number, number][] = [[0, 0], [0.82, 0.05], [1, 0.3], [0.85, 0.58], [0.5, 0.82], [0.18, 0.96], [0, 1]];

export const c24: SpeciesVisual = {
  id: 'c24',
  H: 1.8,
  colors: { P: '#5A2A6E', A: '#3FA0FF', S: GOLD, D: '#2A1830' },
  mat: 'SKIN_WET',
  rim: '#C79BFF',
  rimStrength: 0.35,
  eye: { shape: 'almond', iris: GOLD, irisRatio: 0.72, pupil: 'h-bar', pupilRatio: 0.55, highlights: 1, lid: 0.4, lidAngle: -12 },
  mouth: { style: 'none' },
  rig: { type: 'RADIAL', gaitHz: 0.9, stride: 12, bounce: 0.02, breath: 0.025, breathHz: 0.4, attack: 'rear', special: 'cast', faint: 'collapse', lean: 4 },
  parts: [
    { name: 'head', prim: { t: 'sphere', r: [0.24, 0.2, 0.24] }, at: [0, 1.0, 0], anim: ['br', 'look'] },
    { name: 'hood', parent: 'head', prim: { t: 'lathe', profile: HOOD, h: 0.54, rmax: 0.205 }, at: [0, 0.1, -0.05], rot: [-20, 0, 0], anim: ['br', 'fx:core'] },
    { name: 'hoodRing', parent: 'hood', prim: { t: 'torus', R: 0.05, r: 0.011 }, at: [0, 0.3, 0.168], rot: [-12, 0, 0], slot: GOLD, mat: 'GLOW', emissive: 0.8, anim: ['glow'] },
    { name: 'hoodSpot', parent: 'hood', mirror: true, prim: { t: 'torus', R: 0.035, r: 0.009 }, at: [0.12, 0.18, 0.13], rot: [-10, 42, 0], slot: 'A', mat: 'GLOW', emissive: 0.8, anim: ['glow'] },
    // hooded eyes with heavy lid caps
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.07 }, at: [0.115, 0.03, 0.195], rot: [-4, 32, 0] },
    { name: 'lid', parent: 'head', mirror: true, prim: { t: 'sphere', r: [0.085, 0.04, 0.07], half: true }, at: [0.115, 0.075, 0.18], rot: [26, 32, 14], slot: 'P-' },
    { name: 'siphon', parent: 'head', prim: { t: 'lathe', profile: 'L_crater', h: 0.1, rmax: 0.05 }, at: [0, -0.13, 0.17], rot: [120, 0, 0], slot: 'P-', anim: ['fx:siphon'] },
    { name: 'mantleSkirt', parent: 'head', prim: { t: 'sphere', r: [0.22, 0.1, 0.22] }, at: [0, -0.13, 0], slot: 'P-' },
    // display fan behind the head (arms + web as one unit)
    { name: 'fan', parent: 'head', prim: { t: 'none' }, at: [0, 0.02, -0.17], rot: [-48, 0, 0], anim: ['sway', 'fx:web'] },
    ...fan,
    ...legs,
  ],
};
