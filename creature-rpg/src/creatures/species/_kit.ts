// Shared part builders for the v3 flagship lines (DECISIONS D31). Not a species file (the registry only loads c??.ts).
import type { PartDef, Slot, V3 } from '../assemble';
import { DRAGON_WING_PTS } from '../primitives';

const D = 180 / Math.PI;

/** Euler (XYZ, degrees) that turns local +Z onto the direction n, plus an in-plane spin. */
export function faceZ(n: V3, spin = 0): V3 {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const [x, y, z] = [n[0] / l, n[1] / l, n[2] / l];
  return [Math.atan2(-y, z) * D, Math.asin(Math.max(-1, Math.min(1, x))) * D, spin];
}

/** Point on an ellipsoid (radii r, centred at c) along direction dir, lifted by `lift` along the normal; plus a rotation facing the normal. */
export function onEllipsoid(r: V3, dir: V3, lift = 0, c: V3 = [0, 0, 0]): { at: V3; rot: V3 } {
  const l = Math.hypot(dir[0] / r[0], dir[1] / r[1], dir[2] / r[2]);
  const p: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  const n: V3 = [p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])];
  const nl = Math.hypot(...n);
  return { at: [c[0] + p[0] + (n[0] / nl) * lift, c[1] + p[1] + (n[1] / nl) * lift, c[2] + p[2] + (n[2] / nl) * lift], rot: faceZ(n) };
}

/** Glowing "capacitor freckle" dots on an ellipsoidal cheek (parent part `parent` with radii r). dirs are for the L side (+X). */
export function freckles(name: string, parent: string, r: V3, dirs: V3[], size: number, slot: Slot, glow: number, fx?: string, c: V3 = [0, 0, 0]): PartDef[] {
  return dirs.map((d, i) => {
    const { at, rot } = onEllipsoid(r, d, size * 0.1, c);
    const sz = size * (1 - i * 0.12);
    return {
      name: `${name}${i}`, parent, mirror: true, prim: { t: 'sphere', r: [sz, sz, sz * 0.45] }, at, rot,
      slot, emissive: glow, mat: 'GLOW', blend: false, anim: i === 0 && fx ? [`fx:${fx}`] : [],
    } as PartDef;
  });
}

/**
 * Oversized satin ear: a flattened ellipsoid (sculpted into the head), a satin inner face and a glowing static rim
 * (elliptical torus arc along the outer edge). Ear plane = local XY, opening faces +Z.
 */
export function satinEar(o: { parent: string; at: V3; rot: V3; r: [number, number, number]; slot: Slot; inner: Slot; rim: Slot; rimGlow: number; rimArc?: number; fx?: boolean }): PartDef[] {
  const [a, b, c] = o.r;
  const arc = o.rimArc ?? 200;
  return [
    { name: 'ear', parent: o.parent, mirror: true, prim: { t: 'sphere', r: [a, b, c] }, at: o.at, rot: o.rot, slot: o.slot, anim: ['sway'], blend: Math.min(a, c * 2) * 0.6 },
    { name: 'earIn', parent: 'ear', mirror: true, prim: { t: 'sphere', r: [a * 0.72, b * 0.76, c * 0.5] }, at: [0, -b * 0.04, c * 0.62], slot: o.inner, mat: 'SKIN', blend: false },
    { name: 'earRimN', parent: 'ear', mirror: true, prim: { t: 'none' }, at: [0, 0, c * 0.2], rot: [0, 0, 90 - arc / 2], scale: [a / b, 1, 1] },
    { name: 'earRim', parent: 'earRimN', mirror: true, mirrorGeom: true, prim: { t: 'torus', R: b * 0.985, r: c * 0.2, arc }, slot: o.rim, emissive: o.rimGlow, mat: 'GLOW', anim: o.fx ? ['fx:ears'] : [] },
  ];
}

/** Spiral ram horn tube points in the head frame (L side): starts heading up, curls back, down and forward, drifting outward. */
export function hornSpiral(turns: number, r0: number, r1: number, drift: number, n = 28, phase = 0): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = phase + t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push([drift * Math.sin(t * Math.PI * 0.5) + drift * 0.6 * t, r * Math.sin(th), -r0 * Math.cos(phase) + r * Math.cos(th)]);
  }
  return pts;
}

/**
 * Ram horn with a burning wick tip, built explicitly per side (tube points carry X).
 * `split` = fraction of the horn that is bone before the glowing tip.
 */
export function wickHorn(side: 'L' | 'R', o: { parent: string; at: V3; rot: V3; pts: V3[]; r0: number; r1: number; bone: Slot; tip: Slot; flame: Slot; split?: number; ridge?: [number, number]; flameSize: number; fx?: string; glow?: number }): PartDef[] {
  const sx = side === 'R' ? -1 : 1;
  const m = (p: V3): V3 => [p[0] * sx, p[1], p[2]];
  const n = o.pts.length - 1;
  const cut = Math.round(n * (o.split ?? 0.78));
  const base = o.pts.slice(0, cut + 1).map(m);
  const tip = o.pts.slice(cut).map(m);
  const end = m(o.pts[n]);
  const rc = o.r0 + (o.r1 - o.r0) * (cut / n);
  const fs = o.flameSize;
  return [
    { name: `horn_${side}`, parent: o.parent, prim: { t: 'none' }, at: [o.at[0] * sx, o.at[1], o.at[2]], rot: [o.rot[0], o.rot[1] * sx, o.rot[2] * sx], anim: o.fx && side === 'L' ? [`fx:${o.fx}`] : [] },
    { name: `hornBase_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: base, r0: o.r0, r1: rc, ridge: o.ridge }, slot: o.bone, mat: 'SHELL' },
    { name: `hornTip_${side}`, parent: `horn_${side}`, prim: { t: 'tube', pts: tip, r0: rc, r1: o.r1 }, slot: o.tip, emissive: (o.glow ?? 1.2), mat: 'SHELL' },
    { name: `wick_${side}`, parent: `horn_${side}`, prim: { t: 'sphere', r: [fs * 0.75, fs, fs * 0.75] }, at: [end[0], end[1] + fs * 0.5, end[2]], slot: o.flame, emissive: 1.1, mat: 'GLOW', anim: ['sway'] },
    { name: `wickTip_${side}`, parent: `wick_${side}`, prim: { t: 'cone', r: fs * 0.62, h: fs * 2.1 }, at: [0, fs * 0.35, 0], slot: o.flame, emissive: 1.3, mat: 'GLOW' },
    { name: `wickCore_${side}`, parent: `wick_${side}`, prim: { t: 'sphere', r: [fs * 0.42, fs * 0.6, fs * 0.42] }, at: [0, -fs * 0.1, fs * 0.2], slot: '#FFD27A', emissive: 1.5, mat: 'GLOW', lod: 1 },
  ];
}

/**
 * Dragon wing (mirrored): a root node that flaps (roll), an arm of bone, four finger struts and an ember-lit membrane.
 * w/h = membrane size (×H) in the wing plane (x outward, y forward after the membrane's 90° pitch).
 */
export function dragonWing(o: {
  parent: string; at: V3; rot: V3; w: number; h: number; bone: Slot; membrane: Slot; vein: Slot; memGlow: number; veinGlow: number; boneR: number; lod0Veins?: boolean;
  /** wing-plane orientation inside the flap node; default [90,0,0] = horizontal glide sheet, [0,0,0] = raised (plane faces forward) */
  plane?: V3; opacity?: number;
}): PartDef[] {
  const P = DRAGON_WING_PTS;
  const s = (p: [number, number] | number[]): V3 => [p[0] * o.w, p[1] * o.h, 0];
  const parts: PartDef[] = [
    { name: 'wing', parent: o.parent, mirror: true, prim: { t: 'none' }, at: o.at, rot: o.rot, anim: ['flap'] },
    { name: 'wingPlane', parent: 'wing', mirror: true, prim: { t: 'none' }, rot: o.plane ?? [90, 0, 0] },
    { name: 'wingMem', parent: 'wingPlane', mirror: true, mirrorGeom: true, prim: { t: 'extrude', shape: 'X_dragonwing', w: o.w, h: o.h, depth: 0.006 }, slot: o.membrane, mat: 'MEMBRANE', emissive: o.memGlow, glowColor: o.vein, opacity: o.opacity ?? 0.97 },
    { name: 'wingArm', parent: 'wingPlane', mirror: true, mirrorGeom: true, prim: { t: 'tube', pts: [s(P.root), s(P.elbow), s(P.wrist)], r0: o.boneR, r1: o.boneR * 0.75 }, slot: o.bone, mat: 'SCALE' },
    { name: 'wingWrist', parent: 'wingPlane', mirror: true, prim: { t: 'sphere', r: o.boneR * 1.35 }, at: [P.wrist[0] * o.w, P.wrist[1] * o.h, 0], slot: o.bone, mat: 'SCALE', blend: false },
    { name: 'wingElbow', parent: 'wingPlane', mirror: true, prim: { t: 'sphere', r: o.boneR * 1.2 }, at: [P.elbow[0] * o.w, P.elbow[1] * o.h, 0], slot: o.bone, mat: 'SCALE', blend: false },
    { name: 'wingThumb', parent: 'wingPlane', mirror: true, prim: { t: 'cone', r: o.boneR * 0.8, h: o.boneR * 3.2 }, at: [P.wrist[0] * o.w, P.wrist[1] * o.h + o.boneR * 0.5, 0], rot: [0, 0, -30], slot: '#E9D9BC', mat: 'SHELL', lod: 0 },
  ];
  P.tips.forEach((t, i) => {
    const mid: V3 = [(P.wrist[0] * 0.45 + t[0] * 0.55) * o.w, (P.wrist[1] * 0.45 + t[1] * 0.55) * o.h + o.h * 0.02, 0];
    parts.push({ name: `wingFinger${i}`, parent: 'wingPlane', mirror: true, mirrorGeom: true, prim: { t: 'tube', pts: [s(P.wrist), mid, s(t)], r0: o.boneR * 0.7, r1: o.boneR * 0.25 }, slot: o.bone, mat: 'SCALE' });
    parts.push({ name: `wingVein${i}`, parent: 'wingPlane', mirror: true, mirrorGeom: true, prim: { t: 'tube', pts: [[mid[0], mid[1] - o.h * 0.05, 0.004 * o.h], [(mid[0] + t[0] * o.w) / 2 - 0.03 * o.w, (mid[1] + t[1] * o.h) / 2 - 0.08 * o.h, 0.004 * o.h], [t[0] * o.w * 0.94 - 0.05 * o.w, t[1] * o.h * 0.94 - 0.06 * o.h, 0.004 * o.h]], r0: o.boneR * 0.18, r1: o.boneR * 0.08 }, slot: o.vein, emissive: o.veinGlow, mat: 'GLOW', lod: o.lod0Veins ? 0 : undefined });
  });
  return parts;
}

/** Euler XYZ (deg, yaw 0) that turns local +Y onto direction d. */
export function alongY(d: V3): V3 {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const [x, y, z] = [d[0] / l, d[1] / l, d[2] / l];
  return [Math.atan2(z, y) * D, 0, Math.asin(Math.max(-1, Math.min(1, -x))) * D];
}

/**
 * Flowing ruff of tapered tufts: each tuft is a sculpted tapering capsule (ash base) with a thinner ember-dark tip
 * continuing it. `list` = [x, y, z, dir, len, r] in the parent's frame (L side; mirrored when x != 0).
 */
export function tufts(name: string, parent: string, list: [number, number, number, V3, number, number][], base: Slot, tip: Slot, glow = 0.5): PartDef[] {
  return list.flatMap(([x, y, z, dir, len, r], i): PartDef[] => {
    const mirror = Math.abs(x) > 1e-4;
    return [
      { name: `${name}${i}`, parent, mirror, prim: { t: 'capsule', r, len, r2: r * 0.45 }, at: [x, y, z], rot: alongY(dir), slot: base, mat: 'FUR', fissure: glow * 0.4, fur: 1.4, blend: r * 0.9 },
      { name: `${name}${i}t`, parent: `${name}${i}`, mirror, prim: { t: 'capsule', r: r * 0.45, len: len * 0.45, r2: r * 0.1 }, at: [0, len + r * 0.2, 0], rot: [10, 0, 0], slot: tip, mat: 'FUR', fissure: glow, fur: 1.2, blend: r * 0.3 },
    ];
  });
}
