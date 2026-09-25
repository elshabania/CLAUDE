// c27 Emberfold (formerly Cinderscrim; DECISIONS D7) — f09 stage 3, shade/fire. A hovering three-panel folding
// screen backlit by an ember core (design/creatures.md §4 c27). Family motif: flat layered cut-out plates with
// bevel frames, punched eye-holes lit from behind, 12 fps stepped motion.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

type P2 = [number, number];
const S = SHAPES as Record<string, () => THREE.Shape>;

/** Build a shape from outline/holes authored in real ×H units (centred), normalised to the unit box. */
function realShape(w: number, h: number, outline: P2[], holes: P2[][] = [], k: P2 = [1, 1]): THREE.Shape {
  const n = (p: P2) => new THREE.Vector2((p[0] * k[0]) / w, (p[1] * k[1]) / h);
  const s = new THREE.Shape(outline.map(n));
  for (const hl of holes) s.holes.push(new THREE.Path(hl.map((p) => new THREE.Vector2(p[0] / w, p[1] / h))));
  return s;
}
/** Flame crenellation along the top edge from x0 to x1 (left→right in outline order is +x→−x). */
function flameTop(xR: number, xL: number, yBase: number, tips: number[], lean = 0.012): P2[] {
  const o: P2[] = [];
  const n = tips.length;
  const span = xR - xL;
  for (let i = 0; i < n; i++) {
    const a = xR - (span * i) / n;
    const b = xR - (span * (i + 1)) / n;
    const m = (a + b) / 2;
    o.push([a - span * 0.02 / n, yBase + 0.02]);
    o.push([m + (a - m) * 0.55, yBase + tips[i] * 0.45]);
    o.push([m + lean, yBase + tips[i]]); // tip leans to one side like a licking flame
    o.push([m - (m - b) * 0.2, yBase + tips[i] * 0.5]);
    o.push([b + span * 0.02 / n, yBase + 0.01]);
  }
  return o;
}
// centre panel (w .36, h .74): flame-crenellated top, two slanted eye-holes and a jagged grin
const CW = 0.36, CH = 0.74;
const centreOutline: P2[] = [[-0.18, -0.37], [0.18, -0.37], [0.18, 0.27], ...flameTop(0.18, -0.18, 0.27, [0.08, 0.12, 0.16, 0.12, 0.08]), [-0.18, 0.27]];
const eyeHoleL: P2[] = [[0.022, 0.08], [0.15, 0.115], [0.145, 0.2], [0.035, 0.145]];
const eyeHoleR: P2[] = eyeHoleL.map(([x, y]) => [-x, y] as P2).reverse();
const grin: P2[] = (() => {
  const top: P2[] = [], bot: P2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const x = -0.12 + (0.24 * i) / n;
    const curve = 0.035 * Math.pow(Math.abs(x) / 0.12, 2);
    top.push([x, -0.015 + curve * 0.6 - (i % 2 ? 0.03 : 0)]);
    bot.push([x, -0.115 + curve * 1.8 + (i % 2 ? 0 : 0.03)]);
  }
  return [...top, ...bot.reverse()];
})();
S.S27_centre = () => realShape(CW, CH, centreOutline, [eyeHoleL, eyeHoleR, grin]);
S.S27_centreRim = () => realShape(CW + 0.04, CH + 0.04, centreOutline, [eyeHoleL, eyeHoleR, grin], [(CW + 0.04) / CW, (CH + 0.04) / CH]);
S.S27_centreBack = () => realShape(CW, CH, centreOutline);
// side panels (w .30, h .66): crenellated top, a column of three diamond cut-outs
const SW = 0.3, SH = 0.66;
const sideOutline: P2[] = [[-0.15, -0.33], [0.15, -0.33], [0.15, 0.23], ...flameTop(0.15, -0.15, 0.23, [0.07, 0.1, 0.07], -0.01), [-0.15, 0.23]];
const diamond = (cy: number, s: number): P2[] => [[0, cy - s * 1.6], [s, cy], [0, cy + s * 1.6], [-s, cy]];
const sideHoles = [diamond(0.1, 0.045), diamond(-0.06, 0.04), diamond(-0.2, 0.034)];
S.S27_side = () => realShape(SW, SH, sideOutline, sideHoles);
S.S27_sideSolid = () => realShape(SW, SH, sideOutline);
// slat arm (base at origin, +Y) and a long blade hand
S.S27_slat = () => new THREE.Shape([[-0.5, 0], [0.5, 0], [0.4, 1], [-0.4, 1]].map(([x, y]) => new THREE.Vector2(x, y)));
S.S27_blade = () => new THREE.Shape([[-0.35, 0], [0.4, 0], [0.5, 0.3], [0.2, 0.75], [-0.1, 1], [-0.15, 0.6], [-0.5, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)));

const FRAME = 'S';
/** Bronze frame plate right behind a panel/slat (slightly larger, METAL). */
const frame = (name: string, parent: string, shape: string, w: number, h: number, at: V3, mirror?: boolean): PartDef => ({ name, parent, mirror, prim: { t: 'extrude', shape, w, h, depth: 0.014 }, at, slot: FRAME, mat: 'METAL' });

export const c27: SpeciesVisual = {
  id: 'c27',
  H: 2.0,
  colors: { P: '#231A1A', S: '#8A5A2B', A: '#FF7A2E', D: '#0E0808' },
  mat: 'PAPER',
  rim: '#FF9A5A',
  rimStrength: 0.4,
  hoverGap: 0.05,
  eye: { shape: 'hole', iris: '#FFA548', irisRatio: 1.42, pupil: 'none', highlights: 1, lid: 0, lidAngle: -10, glow: '#FF8A3A', outline: '#FFB060' },
  mouth: { style: 'none' },
  rig: { type: 'FLAT', stepped: 12, gaitHz: 1, stride: 10, bounce: 0.02, breath: 0.012, breathHz: 0.4, flapAmp: 30, flapHz: 0.35, attack: 'lunge', special: 'cast', faint: 'collapse', lean: 4 },
  parts: [
    // ---- ember core behind the centre panel ----
    { name: 'core', prim: { t: 'sphere', r: 0.1 }, at: [0, 0.5, -0.045], slot: 'A', mat: 'GLOW', emissive: 1.5, anim: ['br', 'fx:core'] },
    // ---- centre panel: face cut-outs, bronze frame, warm-lit back layer ----
    { name: 'centre', prim: { t: 'extrude', shape: 'S27_centre', w: CW, h: CH, depth: 0.03 }, at: [0, 0.57, 0.08], anim: ['look'] },
    frame('centreFrame', 'centre', 'S27_centreRim', CW + 0.04, CH + 0.04, [0, 0, -0.024]),
    { name: 'eye', parent: 'centre', mirror: true, prim: { t: 'eye', r: 0.085, bulge: 0.25 }, at: [0.088, 0.14, -0.05], rot: [0, 0, 12] },
    { name: 'grinGlow', parent: 'centre', prim: { t: 'box', w: 0.26, h: 0.11, d: 0.01 }, at: [0, -0.065, -0.042], slot: 'A', emissive: 1.4 },
    { name: 'centreBack', parent: 'centre', prim: { t: 'extrude', shape: 'S27_centreBack', w: CW - 0.02, h: CH - 0.02, depth: 0.03 }, at: [0, 0, -0.26], slot: '#2A1512', emissive: 0.18, glowColor: 'A' },
    { name: 'flameCrest', parent: 'centre', mirror: true, prim: { t: 'extrude', shape: 'X_flame_tuft', w: 0.1, h: 0.17, depth: 0.025 }, at: [0.165, 0.26, 0.02], rot: [0, 0, -18], slot: '#E8501A', emissive: 0.7, glowColor: '#FF5A1E', anim: ['sway'] },
    { name: 'hinge', parent: 'centre', mirror: true, prim: { t: 'cyl', r: 0.022, h: 0.09 }, at: [0.185, 0.12, 0], slot: FRAME, mat: 'METAL' },
    { name: 'hingeLo', parent: 'centre', mirror: true, prim: { t: 'cyl', r: 0.022, h: 0.09 }, at: [0.185, -0.28, 0], slot: FRAME, mat: 'METAL' },
    // ---- side panels: hinged at the centre edges, angled 30° toward the audience; flex on their hinges ----
    { name: 'sideHinge', parent: 'centre', mirror: true, prim: { t: 'none' }, at: [0.19, 0, 0], rot: [0, -30, 0] },
    { name: 'sideFlex', parent: 'sideHinge', mirror: true, prim: { t: 'none' }, rot: [-90, 0, 0], anim: ['flap'] },
    { name: 'side', parent: 'sideFlex', mirror: true, prim: { t: 'extrude', shape: 'S27_side', w: SW, h: SH, depth: 0.03 }, at: [0.16, 0, -0.04], rot: [90, 0, 0] },
    { name: 'sideGlow', parent: 'side', mirror: true, prim: { t: 'extrude', shape: 'S27_sideSolid', w: SW - 0.05, h: SH - 0.12, depth: 0.01 }, at: [0, -0.04, -0.022], slot: 'A', emissive: 1.1 },
    frame('sideFrame', 'side', 'S27_sideSolid', SW + 0.04, SH + 0.04, [0, 0, -0.034], true),
    { name: 'hemSide', parent: 'side', mirror: true, prim: { t: 'cone', r: 0.11, h: 0.16 }, at: [0, -0.33, -0.01], rot: [180, 0, 0], slot: '#3B2B29', opacity: 0.72, fluffy: 0.01 },
    // ---- smoky hem instead of legs ----
    { name: 'hem', parent: 'centre', prim: { t: 'cone', r: 0.13, h: 0.19 }, at: [0, -0.36, -0.03], rot: [180, 0, 0], slot: '#3B2B29', opacity: 0.72, fluffy: 0.01, anim: ['sway', 'fx:smoke'] },
    // ---- slat arms with flat blade hands, emerging from behind the side panels ----
    { name: 'arm', mirror: true, prim: { t: 'none' }, at: [0.28, 0.7, -0.08], rot: [0, 0, -135], anim: ['sway'] },
    { name: 'armSlat', parent: 'arm', mirror: true, prim: { t: 'extrude', shape: 'S27_slat', w: 0.05, h: 0.34, depth: 0.03 } },
    frame('armFrame', 'armSlat', 'S27_slat', 0.07, 0.36, [0, -0.01, -0.02], true),
    { name: 'wrist', parent: 'arm', mirror: true, prim: { t: 'cyl', r: 0.024, h: 0.05 }, at: [0, 0.34, -0.025], rot: [90, 0, 0], slot: FRAME, mat: 'METAL' },
    { name: 'blade', parent: 'arm', mirror: true, prim: { t: 'extrude', shape: 'S27_blade', w: 0.1, h: 0.28, depth: 0.025 }, at: [0, 0.33, 0], rot: [0, 0, 95], anim: ['fx:blade'] },
    { name: 'bladeEdge', parent: 'blade', mirror: true, prim: { t: 'extrude', shape: 'S27_blade', w: 0.125, h: 0.29, depth: 0.012 }, at: [0, -0.012, -0.018], slot: 'A', emissive: 1.4 },
  ],
};
