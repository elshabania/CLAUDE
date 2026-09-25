// c25 Snipling — f09 stage 1, shade. Flat layered cut-out biped on rod legs (design/creatures.md §4 c25).
// Family motif: flat layered plates with violet bevel rims, punched eye-holes lit from behind, 12 fps stepped motion.
import * as THREE from 'three';
import type { PartDef, SpeciesVisual, V3 } from '../assemble';
import { SHAPES } from '../primitives';

// ---- species-local cut-out outlines (unit box, centred on the origin) ----
function roundPoly(pts: [number, number][], r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const p0 = lerp(p, a, Math.min(0.45, r / la));
    const p1 = lerp(p, b, Math.min(0.45, r / lb));
    // corner approximated with a few straight points (keeps extrude triangle counts low)
    const q = (t: number): [number, number] => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p[1] + t * t * p1[1]];
    if (i === 0) s.moveTo(p0[0], p0[1]);
    else s.lineTo(p0[0], p0[1]);
    for (const t of [0.33, 0.67]) s.lineTo(...q(t));
    s.lineTo(p1[0], p1[1]);
  }
  s.closePath();
  return s;
}
function circlePts(cx: number, cy: number, r: number, n = 28): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i < n; i++) o.push([cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
  return o;
}
/** Lower crescent: circle (cx,cy,r1) minus circle (cx,cy+d,r2). */
function crescentPts(cx: number, cy: number, r1: number, d: number, r2: number, n = 40): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const p: [number, number] = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
    if (Math.hypot(p[0] - cx, p[1] - cy - d) >= r2) out.push(p);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + (i / n) * Math.PI;
    const p: [number, number] = [cx + Math.cos(a) * r2, cy + d + Math.sin(a) * r2];
    if (Math.hypot(p[0] - cx, p[1] - cy) < r1) out.push(p);
  }
  return out;
}
function withHoles(s: THREE.Shape, holes: [number, number][][]): THREE.Shape {
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
function smooth(pts: [number, number][], n = 40): THREE.Shape {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
  const s = new THREE.Shape();
  c.getPoints(n).forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
  s.closePath();
  return s;
}

const S = SHAPES as Record<string, () => THREE.Shape>;
S.S25_torso = () => roundPoly([[-0.5, -0.5], [0.5, -0.5], [0.34, 0.5], [-0.34, 0.5]], 0.12);
S.S25_disc = () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.5, 0, Math.PI * 2, false); return s; };
// head front plate: round eye-hole on the creature's left (+X), crescent on its right
S.S25_head = () => {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  return withHoles(s, [circlePts(0.2, 0.04, 0.17), crescentPts(-0.2, 0.04, 0.175, 0.1, 0.16)]);
};
// tall pointed ear with a cut notch on its outer edge (reads as anatomy, not headwear: narrow rounded root, no brim)
S.S25_earTall = () => roundPoly([[-0.3, -0.5], [0.3, -0.5], [0.5, -0.08], [0.46, 0.1], [0.16, 0.14], [0.36, 0.26], [0.12, 0.5], [-0.12, 0.26], [-0.46, -0.12]], 0.05);
S.S25_earInner = () => roundPoly([[-0.3, -0.5], [0.3, -0.5], [0.42, -0.05], [0.05, 0.5], [-0.35, -0.05]], 0.08);
// short ear stub whose upper half is folded down (the flap is a separate plate hinged on the crease)
S.S25_earStub = () => roundPoly([[-0.5, -0.5], [0.5, -0.5], [0.4, 0.5], [-0.4, 0.5]], 0.12);
S.S25_zig = () => {
  // strip running up +Y with 4 zig-zag teeth on both edges
  const L: [number, number][] = [], R: [number, number][] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const y = -0.5 + i / n;
    const off = i % 2 ? 0.5 : 0.1;
    R.push([off, y]);
    L.push([off - 0.6, y]);
  }
  R[n] = [0.05, 0.5];
  return new THREE.Shape([...R, ...L.reverse()].map(([x, y]) => new THREE.Vector2(x, y)));
};
S.S25_hand = () => smooth([[0, -0.5], [0.45, -0.2], [0.5, 0.25], [0.2, 0.5], [0, 0.3], [-0.2, 0.5], [-0.5, 0.25], [-0.45, -0.2]], 28);

/** A cut-out plate (P) with a slightly larger violet bevel plate (S) just behind it. */
function plate(name: string, parent: string, shape: string, w: number, h: number, at: V3, o: Partial<PartDef> & { rim?: number; depth?: number } = {}): PartDef[] {
  const d = o.depth ?? 0.04;
  const rim = o.rim ?? 0.022;
  const { rim: _r, depth: _d, ...rest } = o;
  return [
    { name, parent, prim: { t: 'extrude', shape, w, h, depth: d }, at, ...rest },
    { name: name + 'Rim', parent: name, mirror: o.mirror, prim: { t: 'extrude', shape: shape === 'S25_head' ? 'S25_disc' : shape, w: w + rim * 2, h: h + rim * 2, depth: d * 0.5 }, at: [0, 0, -d * 0.9], slot: 'S', anim: [] },
  ];
}

export const c25: SpeciesVisual = {
  id: 'c25',
  H: 0.4,
  colors: { P: '#1E1B24', S: '#5B4F7A', A: '#FFE9A8', D: '#0B0A10' },
  mat: 'PAPER',
  rim: '#8B7BB8',
  rimStrength: 0.5,
  eye: { shape: 'hole', iris: '#FFE9A8', irisRatio: 1.42, pupil: 'none', highlights: 1, lid: 0, glow: '#FFD98A', outline: '#FFE9A8' },
  mouth: { style: 'line', color: '#15121B', inner: '#FFE9A8' },
  rig: { type: 'FLAT', stepped: 12, gaitHz: 3, stride: 26, bounce: 0.07, hop: true, breath: 0.025, breathHz: 0.7, flapAmp: 8, flapHz: 1, attack: 'lunge', special: 'cast', faint: 'side', lean: 3 },
  parts: [
    // waist hinge (rod legs hang from it; the torso folds on it)
    { name: 'waist', prim: { t: 'none' }, at: [0, 0.27, 0] },
    ...plate('torso', 'waist', 'S25_torso', 0.46, 0.36, [0, 0.17, 0], { anim: ['br', 'fx:body'] }),
    // back layer peeking behind the torso (parallax depth)
    ...plate('torsoBack', 'torso', 'S25_torso', 0.36, 0.28, [0, 0.03, -0.09], { slot: 'P+', anim: ['sway'] }),
    // head: front plate with punched eye-holes, lit eye cards behind, back plate carrying the ears
    ...plate('head', 'torso', 'S25_head', 0.46, 0.46, [0, 0.36, 0.06], { anim: ['look', 'sway'] }),
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: 0.11, bulge: 0.3 }, at: [0.092, 0.018, -0.018] },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: 0.05, w: 1.5 }, at: [0, -0.11, 0.022] },
    ...plate('headBack', 'head', 'S25_disc', 0.42, 0.42, [0, 0.01, -0.09]),
    // two asymmetric ears set on the sides of the head: a tall notched ear (creature's left) and a short ear folded down (right)
    { name: 'earTall', parent: 'headBack', prim: { t: 'none' }, at: [0.13, 0.12, 0], rot: [0, 0, -32], anim: ['sway'] },
    ...plate('earTallPlate', 'earTall', 'S25_earTall', 0.15, 0.36, [0, 0.17, 0], { rim: 0.022 }),
    { name: 'earTallInner', parent: 'earTallPlate', prim: { t: 'extrude', shape: 'S25_earInner', w: 0.065, h: 0.2, depth: 0.012 }, at: [-0.005, -0.04, 0.024], slot: 'S' },
    { name: 'earFold', parent: 'headBack', prim: { t: 'none' }, at: [-0.14, 0.12, 0], rot: [0, 0, 40] },
    ...plate('earFoldBase', 'earFold', 'S25_earStub', 0.13, 0.12, [0, 0.05, 0], { rim: 0.018 }),
    { name: 'earFoldInner', parent: 'earFoldBase', prim: { t: 'extrude', shape: 'S25_earStub', w: 0.06, h: 0.07, depth: 0.012 }, at: [0, -0.01, 0.024], slot: 'S' },
    { name: 'earFlap', parent: 'earFold', prim: { t: 'extrude', shape: 'X_tri', w: 0.12, h: 0.15, depth: 0.03 }, at: [0.0, 0.11, 0.035], rot: [0, 0, 128], slot: 'S+' },
    // rod legs ending in discs
    { name: 'leg', parent: 'waist', mirror: true, prim: { t: 'capsule', r: 0.02, len: 0.23 }, at: [0.1, 0, 0], rot: [180, 0, 0], anim: ['gait:L'] },
    { name: 'foot', parent: 'leg', mirror: true, prim: { t: 'cyl', r: 0.065, h: 0.016 }, at: [0, 0.255, 0.015], slot: 'S' },
    // rod arms with paper-flap hands
    { name: 'arm', parent: 'torso', mirror: true, prim: { t: 'capsule', r: 0.015, len: 0.19 }, at: [0.14, 0.12, 0.01], rot: [0, 0, -118], anim: ['gait:R', 'sway'] },
    ...plate('hand', 'arm', 'S25_hand', 0.1, 0.11, [0, 0.25, 0], { mirror: true, rim: 0.016, depth: 0.03 }),
    // zig-zag cut strip tail off the back layer, poking out to the creature's right
    { name: 'tail', parent: 'torsoBack', prim: { t: 'none' }, at: [-0.13, -0.14, -0.03], rot: [0, 0, 112], anim: ['sway'] },
    ...plate('tailStrip', 'tail', 'S25_zig', 0.1, 0.36, [0, 0.2, 0], { depth: 0.03, rim: 0.014 }),
  ],
};
