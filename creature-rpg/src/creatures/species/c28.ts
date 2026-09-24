// c28 Dawnfry — f10 stage 1, lumen. Round floating fry that "swims" in the air (design/creatures.md §4 c28).
// Family motif: lateral light-stripe, crescent dorsal fin, pale belly.
import * as THREE from 'three';
import type { SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

// small sickle-crescent dorsal fin, root along y = 0, sweeping back toward +x
(SHAPES as Record<string, () => THREE.Shape>).S28_dorsal = () => {
  const c = new THREE.CatmullRomCurve3([[0, 0], [0.22, 0.42], [0.55, 0.82], [1, 1], [0.78, 0.62], [0.72, 0.3], [0.86, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return new THREE.Shape(c.getPoints(28).map((p) => new THREE.Vector2(p.x, p.y)));
};

// Lateral stripe path hugging the body ellipsoid (0.36, 0.34, 0.40) along the equator seam; both ends dip
// under the skin so the band tapers out instead of ending in a blunt cap.
const stripe: V3[] = [0.25, 0.2, 0.1, -0.02, -0.14, -0.24, -0.3].map((z, i, a) => {
  const k = Math.sqrt(Math.max(0, 1 - (z / 0.4) ** 2));
  const sink = i === 0 || i === a.length - 1 ? 0.03 : 0;
  return [0.36 * k + 0.004 - sink, 0, z] as V3;
});
// big fan tail: a ~110° sector spreading from the peduncle with 7 scalloped lobes (unit box, root at origin, +Y = back)
const FAN_A0 = (30 * Math.PI) / 180, FAN_A1 = (150 * Math.PI) / 180, FAN_X = 0.5 / Math.cos(FAN_A0);
(SHAPES as Record<string, () => THREE.Shape>).S28_fan = () => {
  const pts = [new THREE.Vector2(0, 0)];
  const n = 42;
  for (let i = 0; i <= n; i++) {
    const a = FAN_A0 + ((FAN_A1 - FAN_A0) * i) / n;
    const r = 1 - 0.07 * Math.abs(Math.sin((i / n) * Math.PI * 7));
    pts.push(new THREE.Vector2(Math.cos(a) * r * FAN_X, Math.sin(a) * r));
  }
  return new THREE.Shape(pts);
};
const FAN_W = 0.8, FAN_H = 0.42;
// glowing rim along the fan's arc (fan-local ×H)
const fanEdge: V3[] = Array.from({ length: 11 }, (_, i) => {
  const a = FAN_A0 + ((FAN_A1 - FAN_A0) * i) / 10;
  return [Math.cos(a) * FAN_X * FAN_W * 0.97, Math.sin(a) * FAN_H * 0.97, 0] as V3;
});

export const c28: SpeciesVisual = {
  id: 'c28',
  H: 0.3,
  colors: { P: '#FFD6A0', S: '#F59AB5', A: '#FFF4C2', W: '#FFF1DE', D: '#5A3A40' },
  mat: 'SKIN_WET',
  rim: '#FFFFFF',
  rimStrength: 0.45,
  hoverGap: 0.35, // spec 0.8 would put the whole fry above its own height; 0.35 keeps a clear gap under the belly
  eye: { shape: 'round', iris: '#9B7AD6', irisRatio: 0.72, pupil: 'round', pupilRatio: 0.6, highlights: 3, lid: 0 },
  mouth: { style: 'o', color: '#8A4A50', inner: '#B0506A' },
  rig: { type: 'FLOAT', gaitHz: 2, waveAxis: 'yaw', waveAmp: 18, waveHz: 1.1, flapAmp: 28, flapHz: 2.6, breath: 0.03, breathHz: 0.7, attack: 'lunge', special: 'spin', faint: 'sink', lean: 6 },
  parts: [
    // upper dome (peach) + lower dome (pale belly) meeting at the equator, where the light-stripe runs
    { name: 'body', prim: { t: 'sphere', r: [0.36, 0.34, 0.4], half: true }, at: [0, 0.5, 0], anim: ['br', 'fx:body'] },
    { name: 'belly', parent: 'body', prim: { t: 'sphere', r: [0.36, 0.32, 0.4], half: true }, rot: [180, 0, 0], slot: 'W', emissive: 0.22, glowColor: 'A' },
    { name: 'stripe', parent: 'body', mirror: true, prim: { t: 'tube', pts: stripe, r0: 0.024, r1: 0.02 }, slot: 'A', emissive: 1.0, mat: 'GLOW' },
    // face
    { name: 'eye', parent: 'body', mirror: true, prim: { t: 'eye', r: 0.13 }, at: [0.2, 0.08, 0.285], rot: [-12, 36, 0] },
    { name: 'mouthLip', parent: 'body', prim: { t: 'torus', R: 0.05, r: 0.015 }, at: [0, -0.1, 0.378], rot: [-8, 0, 0], slot: '#E58E7E', anim: ['br'] },
    { name: 'mouth', parent: 'body', prim: { t: 'mouth', r: 0.055, bulge: 0.1 }, at: [0, -0.1, 0.376], rot: [-8, 0, 0], anim: ['fx:mouth'] },
    // small crescent dorsal fin
    { name: 'dorsal', parent: 'body', prim: { t: 'extrude', shape: 'S28_dorsal', w: 0.24, h: 0.2, depth: 0.022 }, at: [0, 0.31, 0.02], rot: [0, 90, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.9, anim: ['sway'] },
    // tiny pectorals that flutter
    { name: 'pectoral', parent: 'body', mirror: true, prim: { t: 'extrude', shape: 'X_leaf', w: 0.07, h: 0.15, depth: 0.015 }, at: [0.31, -0.08, 0.06], rot: [0, 35, -100], slot: 'S', mat: 'MEMBRANE', opacity: 0.85, anim: ['flap'] },
    // peduncle + big fan tail with a glowing rim
    { name: 'tail', parent: 'body', prim: { t: 'none' }, chain: { n: 2, r0: 0.15, r1: 0.09, len: 0.16 }, at: [0, 0, -0.26], rot: [-90, 0, 0], anim: ['wave'] },
    { name: 'fan', parent: 'tailTip', prim: { t: 'extrude', shape: 'S28_fan', w: FAN_W, h: FAN_H, depth: 0.02 }, at: [0, -0.06, 0], rot: [0, -90, 0], slot: 'S', mat: 'MEMBRANE', opacity: 0.85, anim: ['fx:tail'] },
    { name: 'fanEdge', parent: 'fan', prim: { t: 'tube', pts: fanEdge, r0: 0.014, r1: 0.014 }, slot: 'A', emissive: 1.2, mat: 'GLOW' },
  ],
};
