// Parametric humanoid builder for the protagonist, rival, Cantors and NPCs (creative_direction §5.1, §5.6).
// Same part-table DSL as kin, so faces/animation/rim lighting are consistent across the cast.
import type { PartDef, SpeciesVisual } from './assemble';

export type HairStyle = 'crop' | 'long' | 'bun' | 'spiky' | 'braid' | 'bob' | 'bald' | 'tail' | 'curly';
export type Build = 'teen' | 'adult' | 'elder' | 'broad' | 'slim' | 'child';
export type Extra =
  | 'satchel' | 'scarf' | 'apron' | 'cape' | 'hat' | 'brimhat' | 'lantern' | 'monocle' | 'glasses' | 'earmuffs'
  | 'mitts' | 'shawl' | 'goggles' | 'staff' | 'mallet' | 'kite' | 'tongs' | 'collar' | 'glove' | 'coat' | 'sash' | 'bell' | 'pole' | 'cane' | 'clipboard';

export interface HumanLook {
  id: string;
  build: Build;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;        // jacket / main garment
  top2: string;       // shirt / inner
  pants: string;
  shoes: string;
  accent: string;     // extras (scarf, sash, brooch, buckle)
  iris?: string;
  extras?: Extra[];
  skirt?: boolean;
}

const BUILD: Record<Build, { H: number; head: number; shoulder: number; girth: number; leg: number }> = {
  child: { H: 1.2, head: 0.14, shoulder: 0.14, girth: 0.12, leg: 0.4 },
  teen: { H: 1.5, head: 0.125, shoulder: 0.15, girth: 0.12, leg: 0.44 },
  slim: { H: 1.72, head: 0.105, shoulder: 0.15, girth: 0.11, leg: 0.47 },
  adult: { H: 1.7, head: 0.105, shoulder: 0.165, girth: 0.13, leg: 0.46 },
  broad: { H: 1.78, head: 0.1, shoulder: 0.2, girth: 0.17, leg: 0.44 },
  elder: { H: 1.6, head: 0.11, shoulder: 0.155, girth: 0.14, leg: 0.44 },
};

export function humanVisual(l: HumanLook): SpeciesVisual {
  const b = BUILD[l.build];
  const hy = b.leg + 0.02;              // hip height (×H)
  const neckY = 1 - b.head * 2 - 0.01;  // top of torso
  const headY = 1 - b.head;             // head centre
  const torsoH = neckY - hy;
  const ex = new Set(l.extras ?? []);
  const P: PartDef[] = [
    { name: 'hips', prim: { t: 'sphere', r: [b.girth * 0.95, 0.06, b.girth * 0.7] }, at: [0, hy, 0], slot: 'S', mat: 'CLOTH' },
    { name: 'body', parent: 'hips', prim: { t: 'lathe', profile: [[0.75, 0], [0.95, 0.25], [1, 0.6], [0.92, 0.85], [0.5, 1], [0, 1]], h: torsoH, rmax: b.girth }, at: [0, 0.0, 0], scale: [1.18, 1, 0.82], slot: 'P', mat: 'CLOTH', anim: ['br'] },
    { name: 'shirt', parent: 'body', prim: { t: 'cone', r: b.girth * 0.42, h: torsoH * 0.34 }, at: [0, torsoH * 1.0, b.girth * 0.66], rot: [180, 0, 0], scale: [1, 1, 0.22], slot: 'T2', mat: 'CLOTH' },
    { name: 'neck', parent: 'body', prim: { t: 'capsule', r: 0.032, len: 0.03 }, at: [0, torsoH - 0.01, 0], slot: 'K', mat: 'SKIN' },
    { name: 'head', parent: 'neck', prim: { t: 'sphere', r: [b.head * 0.98, b.head, b.head * 0.96] }, at: [0, 0.03 + b.head * 0.95, 0.01], slot: 'K', mat: 'SKIN', anim: ['look'] },
    { name: 'eye', parent: 'head', mirror: true, prim: { t: 'eye', r: b.head * 0.36 }, at: [b.head * 0.36, b.head * 0.05, b.head * 0.86], rot: [0, 16, 0] },
    { name: 'brow', parent: 'head', mirror: true, prim: { t: 'capsule', r: 0.006, len: b.head * 0.32 }, at: [b.head * 0.22, b.head * 0.43, b.head * 0.9], rot: [0, 0, 80], slot: 'H' },
    { name: 'mouth', parent: 'head', prim: { t: 'mouth', r: b.head * 0.22, w: 1.3 }, at: [0, -b.head * 0.42, b.head * 0.87], rot: [12, 0, 0] },
    { name: 'nose', parent: 'head', prim: { t: 'sphere', r: [b.head * 0.1, b.head * 0.12, b.head * 0.1] }, at: [0, -b.head * 0.12, b.head * 0.95], slot: 'K-', mat: 'SKIN' },
    { name: 'ear', parent: 'head', mirror: true, prim: { t: 'sphere', r: [b.head * 0.12, b.head * 0.22, b.head * 0.12] }, at: [b.head * 0.95, -b.head * 0.05, 0], slot: 'K', mat: 'SKIN' },
    // arms
    { name: 'arm', parent: 'body', mirror: true, prim: { t: 'capsule', r: 0.034, len: 0.15, r2: 0.03 }, at: [b.shoulder, torsoH - 0.03, 0], rot: [180, 0, -12], slot: 'P', mat: 'CLOTH', anim: ['armswing'] },
    { name: 'forearm', parent: 'arm', mirror: true, prim: { t: 'capsule', r: 0.029, len: 0.13, r2: 0.026 }, at: [0, 0.17, 0], rot: [-12, 0, 4], slot: 'P', mat: 'CLOTH' },
    { name: 'hand', parent: 'forearm', mirror: true, prim: { t: 'sphere', r: [0.034, 0.042, 0.03] }, at: [0, 0.16, 0], slot: 'K', mat: 'SKIN', anim: ['fx:hand'] },
    // legs
    { name: 'leg', parent: 'hips', mirror: true, prim: { t: 'capsule', r: 0.05, len: b.leg * 0.43, r2: 0.043 }, at: [b.girth * 0.5, 0, 0], rot: [180, 0, 0], slot: 'L', mat: 'CLOTH', anim: ['gait:L'] },
    { name: 'shin', parent: 'leg', mirror: true, prim: { t: 'capsule', r: 0.042, len: b.leg * 0.4, r2: 0.036 }, at: [0, b.leg * 0.5, 0], slot: 'L', mat: 'CLOTH', anim: ['knee'] },
    { name: 'shoe', parent: 'shin', mirror: true, prim: { t: 'sphere', r: [0.05, 0.035, 0.085] }, at: [0, b.leg * 0.47, 0.03], slot: 'F', mat: 'SKIN' },
  ];
  // hair
  const hr = b.head * 1.06;
  const hairPart = (p: PartDef) => P.push({ slot: 'H', mat: 'HAIR', parent: 'head', ...p });
  if (l.hairStyle !== 'bald') hairPart({ name: 'hairCap', prim: { t: 'sphere', r: [hr, hr * 0.8, hr], half: true }, at: [0, b.head * 0.15, -b.head * 0.06] });
  if (l.hairStyle === 'crop' || l.hairStyle === 'curly') hairPart({ name: 'fringe', prim: { t: 'sphere', r: [hr * 0.8, hr * 0.3, hr * 0.4] }, at: [0.01, b.head * 0.62, b.head * 0.55], rot: [-20, 0, 8] });
  if (l.hairStyle === 'curly') for (let i = 0; i < 5; i++) hairPart({ name: 'curl' + i, prim: { t: 'sphere', r: hr * 0.32 }, at: [Math.cos(i * 1.26) * hr * 0.75, b.head * 0.55, Math.sin(i * 1.26) * hr * 0.75 - b.head * 0.1] });
  if (l.hairStyle === 'long' || l.hairStyle === 'bob') {
    const len = l.hairStyle === 'long' ? 1.9 : 1.15;
    hairPart({ name: 'hairBack', prim: { t: 'sphere', r: [hr * 1.02, b.head * len * 0.62, hr * 0.62] }, at: [0, b.head * (0.45 - len * 0.45), -b.head * 0.42] });
    hairPart({ name: 'hairSide', mirror: true, prim: { t: 'sphere', r: [hr * 0.28, b.head * len * 0.5, hr * 0.45] }, at: [b.head * 0.82, b.head * (0.35 - len * 0.35), -b.head * 0.05] });
  }
  if (l.hairStyle === 'bun') hairPart({ name: 'bun', prim: { t: 'sphere', r: hr * 0.42 }, at: [0, b.head * 0.9, -b.head * 0.55] });
  if (l.hairStyle === 'tail' || l.hairStyle === 'braid') hairPart({ name: 'tail', prim: { t: 'none' }, chain: { n: 4, r0: 0.04, r1: 0.018, len: l.hairStyle === 'braid' ? 0.3 : 0.2, bend: [12, 0, 0] }, at: [0, b.head * 0.35, -b.head * 0.9], rot: [-160, 0, 0], anim: ['wave'] });
  if (l.hairStyle === 'spiky') for (let i = 0; i < 6; i++) hairPart({ name: 'spike' + i, prim: { t: 'cone', r: hr * 0.22, h: hr * 0.6 }, at: [Math.sin(i * 1.05) * hr * 0.55, b.head * 0.55, Math.cos(i * 1.05) * hr * 0.55 - b.head * 0.1], rot: [-35 * Math.cos(i * 1.05), 0, 35 * Math.sin(i * 1.05)] });
  if (l.skirt) P.push({ name: 'skirt', parent: 'hips', prim: { t: 'lathe', profile: [[0.7, 1], [1.4, 0]], h: 0.2, rmax: b.girth, axis: 'y' }, at: [0, -0.19, 0], slot: 'L', mat: 'CLOTH' });
  // extras
  if (ex.has('satchel')) {
    P.push({ name: 'satchel', parent: 'hips', prim: { t: 'box', w: 0.1, h: 0.09, d: 0.05 }, at: [-b.girth * 1.1, 0.02, 0.02], slot: '#8C5A3C', mat: 'CLOTH' });
    P.push({ name: 'strap', parent: 'body', prim: { t: 'tube', pts: [[-b.girth * 1.05, 0.0, 0.02], [0, torsoH * 0.5, b.girth * 0.85], [b.girth * 0.9, torsoH * 0.95, 0.0]], r0: 0.008, r1: 0.008 }, slot: '#6B4128' });
    P.push({ name: 'chimeCharm', parent: 'satchel', prim: { t: 'cyl', r: 0.02, h: 0.035 }, at: [0, -0.07, 0.03], slot: 'A', mat: 'METAL', lod: 0 });
  }
  if (ex.has('scarf')) {
    P.push({ name: 'scarfRing', parent: 'neck', prim: { t: 'torus', R: 0.055, r: 0.022 }, at: [0, 0.02, 0], rot: [90, 0, 0], slot: 'A', mat: 'CLOTH' });
    P.push({ name: 'scarfTail', parent: 'neck', prim: { t: 'none' }, chain: { n: 4, r0: 0.024, r1: 0.018, len: 0.34, bend: [18, 0, 0] }, at: [0.02, 0.02, -0.05], rot: [-150, 0, 10], slot: 'A', mat: 'CLOTH', anim: ['wave'] });
  }
  if (ex.has('apron')) P.push({ name: 'apron', parent: 'body', prim: { t: 'extrude', shape: 'X_rect', w: b.girth * 1.7, h: torsoH * 1.3, depth: 0.006 }, at: [0, -0.2, b.girth * 0.86], slot: 'A', mat: 'CLOTH' });
  if (ex.has('cape') || ex.has('coat')) P.push({ name: 'cape', parent: 'body', prim: { t: 'lathe', profile: [[0.8, 1], [1.05, 0.5], [1.3, 0]], h: torsoH * (ex.has('coat') ? 1.35 : 1.1), rmax: b.girth * 1.05 }, at: [0, -torsoH * (ex.has('coat') ? 0.4 : 0.1), -0.01], scale: [1.15, 1, 0.9], slot: ex.has('coat') ? 'P' : 'A', mat: 'CLOTH' });
  if (ex.has('shawl')) P.push({ name: 'shawl', parent: 'body', prim: { t: 'lathe', profile: [[0.6, 1], [1.1, 0.6], [1.15, 0.3]], h: torsoH * 0.45, rmax: b.girth * 1.1 }, at: [0, torsoH * 0.55, 0], scale: [1.15, 1, 0.95], slot: 'A', mat: 'CLOTH' });
  if (ex.has('hat')) P.push({ name: 'hat', parent: 'head', prim: { t: 'cyl', r: hr * 0.8, h: b.head * 0.6, r2: hr * 0.7 }, at: [0, b.head * 0.75, -0.01], slot: 'A', mat: 'CLOTH' }, { name: 'brim', parent: 'head', prim: { t: 'cyl', r: hr * 1.35, h: 0.01 }, at: [0, b.head * 0.75, 0], slot: 'A', mat: 'CLOTH' });
  if (ex.has('brimhat')) P.push({ name: 'brim', parent: 'head', prim: { t: 'cyl', r: hr * 1.9, h: 0.012, r2: hr * 1.2 }, at: [0, b.head * 0.7, 0], slot: 'A', mat: 'CLOTH' }, { name: 'crown', parent: 'head', prim: { t: 'sphere', r: [hr * 0.95, hr * 0.55, hr * 0.95], half: true }, at: [0, b.head * 0.7, 0], slot: 'A', mat: 'CLOTH' });
  if (ex.has('earmuffs')) P.push({ name: 'muff', parent: 'head', mirror: true, prim: { t: 'cyl', r: b.head * 0.38, h: 0.05 }, at: [b.head * 0.95, 0, 0], rot: [0, 0, -90], slot: '#C8963E', mat: 'METAL' }, { name: 'muffBand', parent: 'head', prim: { t: 'torus', R: hr * 1.02, r: 0.012, arc: 180 }, at: [0, 0, 0], rot: [0, 90, 0], slot: '#C8963E', mat: 'METAL' });
  if (ex.has('monocle')) P.push({ name: 'monocle', parent: 'eye_L', prim: { t: 'torus', R: b.head * 0.36, r: 0.006 }, at: [0, 0, 0.01], slot: '#C8963E', mat: 'METAL' });
  if (ex.has('glasses')) P.push({ name: 'glass', parent: 'eye', mirror: true, prim: { t: 'torus', R: b.head * 0.36, r: 0.005 }, at: [0, 0, 0.012], slot: '#2A2A30', mat: 'METAL' });
  if (ex.has('goggles')) P.push({ name: 'goggles', parent: 'head', prim: { t: 'torus', R: hr * 1.0, r: 0.012 }, at: [0, b.head * 0.55, 0], rot: [80, 0, 0], slot: '#4A3A2A', mat: 'CLOTH' });
  if (ex.has('lantern')) P.push({ name: 'lantern', parent: 'hand_R', prim: { t: 'cyl', r: 0.045, h: 0.1 }, at: [0, 0.05, 0.02], slot: '#F2C94C', mat: 'GLOW', emissive: 1.2 });
  if (ex.has('mitts')) P.push({ name: 'mitt', parent: 'hand', mirror: true, prim: { t: 'sphere', r: [0.05, 0.06, 0.045] }, slot: 'A', mat: 'FUR' });
  if (ex.has('collar')) P.push({ name: 'collar', parent: 'body', prim: { t: 'cyl', r: b.girth * 0.55, h: 0.09, r2: b.girth * 0.8 }, at: [0, torsoH - 0.03, -0.01], slot: 'P', mat: 'CLOTH' });
  if (ex.has('sash')) P.push({ name: 'sash', parent: 'body', prim: { t: 'tube', pts: [[b.girth, torsoH * 0.9, 0], [0, torsoH * 0.5, b.girth * 0.88], [-b.girth, 0.02, 0]], r0: 0.02, r1: 0.02 }, slot: 'A', mat: 'CLOTH' });
  if (ex.has('bell')) P.push({ name: 'bell', parent: 'hips', prim: { t: 'lathe', profile: 'L_bell', h: 0.05, rmax: 0.025 }, at: [b.girth * 0.8, 0, 0.05], slot: '#C0C4CC', mat: 'METAL', lod: 0 });
  const handProp = (name: string, prim: PartDef['prim'], color: string, at: [number, number, number] = [0, 0.02, 0.02], rot: [number, number, number] = [0, 0, 0]) =>
    P.push({ name, parent: 'hand_L', prim, at, rot, slot: color, mat: 'METAL' });
  if (ex.has('staff')) handProp('staff', { t: 'cyl', r: 0.012, h: 1.4 }, '#6B4A2E', [0, -0.55, 0]);
  if (ex.has('pole')) handProp('pole', { t: 'cyl', r: 0.014, h: 1.9 }, '#8C6A44', [0, -0.8, 0]);
  if (ex.has('cane')) handProp('cane', { t: 'cyl', r: 0.012, h: 0.85 }, '#BFE6F2', [0, -0.35, 0]);
  if (ex.has('mallet')) handProp('mallet', { t: 'box', w: 0.14, h: 0.09, d: 0.09 }, '#5B6770', [0, 0.1, 0]);
  if (ex.has('tongs')) handProp('tongs', { t: 'cyl', r: 0.01, h: 0.4 }, '#3A3A3A', [0, -0.1, 0]);
  if (ex.has('clipboard')) handProp('clipboard', { t: 'box', w: 0.12, h: 0.16, d: 0.01 }, '#C2A477', [0, 0.02, 0.04], [60, 0, 0]);
  if (ex.has('kite')) P.push({ name: 'kite', parent: 'body', prim: { t: 'extrude', shape: 'X_delta', w: 0.3, h: 0.35, depth: 0.004 }, at: [0, torsoH * 0.6, -b.girth - 0.02], rot: [0, 180, 90], slot: 'A', mat: 'CLOTH' });

  return {
    id: 'human:' + l.id,
    H: b.H,
    colors: { P: l.top, S: l.pants, A: l.accent, K: l.skin, H: l.hair, L: l.pants, F: l.shoes, T2: l.top2 },
    mat: 'CLOTH',
    rim: '#FFF2D6',
    rimStrength: 0.25,
    eye: { shape: l.build === 'teen' || l.build === 'child' ? 'round' : 'almond', iris: l.iris ?? '#5A3E2B', irisRatio: 0.62, pupil: 'round', pupilRatio: 0.45, highlights: 2, lid: l.build === 'elder' ? 0.2 : 0.06 },
    mouth: { style: 'smile' },
    rig: { type: 'HUMAN', gaitHz: 1.6, stride: 32, bounce: 0.02, breath: 0.012, breathHz: 0.3, attack: 'cast', faint: 'forward', lean: 4, waveAmp: 14, waveHz: 0.9 },
    parts: P,
  };
}

// colour keys used above: K skin, H hair, T2 shirt, L legs, F shoes
