// Build-time human character asset baker (design/reviews/human_characters.md).
//
// Source: MakeHuman 1.x assets (CC0 1.0, see CREDITS.md): base mesh hm08, default skeleton + weights,
// macro/face shape targets and the face pose-units BVH. Raw downloads are cached in .cache/mh (not
// committed); the baked output src/creatures/human/assets/humans.bin.gz IS committed so the game runs offline.
//
// What it bakes (all topology shared, per-vertex data indexed by "O" = original MakeHuman vertex subset):
//  - a stylised neutral base shape (young, big-eyed, small-nosed) + linear "preset" deltas (teen/young/old ×
//    female/male, child, muscle, heavy, thin, tall, short) that the runtime blends per character;
//  - a 34-bone game skeleton (identity-rotation bind pose) with the CC0 weights collapsed onto it;
//  - face expression morphs baked from the MakeHuman face pose units (blink, brows, smile, jaw, …);
//  - per-vertex region data (dominant bone + limb parameter) used to tailor clothing at runtime;
//  - face-paint coordinates (uv1) for shader-drawn brows/lips/liner; LOD index buffers via meshoptimizer.
// usage: node scripts/build-humans.mjs [--offline]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache/mh');
const OUT = path.join(ROOT, 'src/creatures/human/assets');
const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';
const OFFLINE = process.argv.includes('--offline');
const used = new Set();

async function fetchData(rel) {
  const file = path.join(CACHE, rel);
  used.add(rel);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (OFFLINE) throw new Error('missing cached file ' + rel);
  const res = await fetch(RAW + rel);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${rel}`);
  const txt = await res.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, txt);
  return txt;
}

// ---------------------------------------------------------------- OBJ
function parseObj(txt) {
  const v = [], vt = [], faces = [];
  let g = '';
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('vt ')) { const p = line.split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (line.startsWith('g ')) g = line.slice(2).trim();
    else if (line.startsWith('f ')) {
      const c = line.trim().split(/\s+/).slice(1).map((t) => { const [a, b] = t.split('/'); return [+a - 1, b ? +b - 1 : -1]; });
      faces.push({ g, c });
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), faces };
}

// ---------------------------------------------------------------- targets
const targetCache = new Map();
async function target(rel) {
  if (targetCache.has(rel)) return targetCache.get(rel);
  const txt = await fetchData('targets/' + rel);
  const idx = [], d = [];
  for (const line of txt.split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  const t = { idx: Int32Array.from(idx), d: Float64Array.from(d) };
  targetCache.set(rel, t);
  return t;
}
function addTarget(pos, t, w) {
  if (!w) return;
  for (let i = 0; i < t.idx.length; i++) {
    const k = t.idx[i] * 3;
    pos[k] += t.d[i * 3] * w; pos[k + 1] += t.d[i * 3 + 1] * w; pos[k + 2] += t.d[i * 3 + 2] * w;
  }
}

// MakeHuman macro modifier weights (humanmodifier.py / human.py semantics).
function macroTargets(m) {
  const gender = { female: 1 - m.gender, male: m.gender };
  let age;
  if (m.age < 0.5) {
    const young = Math.max(0, (m.age - 0.1875) * 3.2);
    const baby = Math.max(0, 1 - m.age * 5.333);
    age = { baby, child: Math.max(0, Math.min(1, 5.333 * m.age) - young), young, old: 0 };
  } else {
    const old = Math.max(0, m.age * 2 - 1);
    age = { baby: 0, child: 0, young: 1 - old, old };
  }
  const tri = (x, lo, mid, hi) => { const a = Math.max(0, 2 * x - 1), b = Math.max(0, 1 - 2 * x); return { [lo]: b, [mid]: 1 - a - b, [hi]: a }; };
  const muscle = tri(m.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle');
  const weight = tri(m.weight, 'minweight', 'averageweight', 'maxweight');
  const height = { minheight: Math.max(0, 1 - 2 * m.height), maxheight: Math.max(0, 2 * m.height - 1) };
  const prop = { uncommonproportions: Math.max(0, 1 - 2 * m.prop), idealproportions: Math.max(0, 2 * m.prop - 1) };
  const race = { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
  const out = [];
  for (const [g, wg] of Object.entries(gender)) for (const [a, wa] of Object.entries(age)) {
    if (!wg || !wa) continue;
    for (const [r, wr] of Object.entries(race)) out.push([`macrodetails/${r}-${g}-${a}.target`, wg * wa * wr]);
    for (const [mu, wm] of Object.entries(muscle)) for (const [we, ww] of Object.entries(weight)) {
      const w = wg * wa * wm * ww;
      if (w < 1e-4) continue;
      out.push([`macrodetails/universal-${g}-${a}-${mu}-${we}.target`, w]);
      for (const [h, wh] of Object.entries(height)) if (wh > 1e-4) out.push([`macrodetails/height/${g}-${a}-${mu}-${we}-${h}.target`, w * wh]);
      for (const [p, wp] of Object.entries(prop)) if (wp > 1e-4) out.push([`macrodetails/proportions/${g}-${a}-${mu}-${we}-${p}.target`, w * wp]);
    }
  }
  return out;
}

async function applyMacro(base, m) {
  const pos = Float64Array.from(base);
  for (const [rel, w] of macroTargets(m)) {
    if (rel.includes('-baby')) continue; // presets never go below age 11
    let t;
    try { t = await target(rel); } catch (e) { console.warn('  skip', rel, e.message); continue; }
    addTarget(pos, t, w);
  }
  return pos;
}

// stylisation applied to every character: appealing, slightly youthful face (CC0 face modifiers).
const STYLE = [
  ['eyes/r-eye-scale-incr.target', 0.45], ['eyes/l-eye-scale-incr.target', 0.45],
  ['eyes/r-eye-height2-incr.target', 0.2], ['eyes/l-eye-height2-incr.target', 0.2],
  ['nose/nose-scale-horiz-decr.target', 0.25], ['nose/nose-scale-vert-decr.target', 0.2], ['nose/nose-scale-depth-decr.target', 0.15],
  ['nose/nose-point-width-decr.target', 0.3],
  ['mouth/mouth-scale-horiz-decr.target', 0.12], ['mouth/mouth-upperlip-volume-decr.target', 0.15], ['mouth/mouth-lowerlip-volume-decr.target', 0.2], ['mouth/mouth-trans-backward.target', 0.25], ['mouth/mouth-lowerlip-height-decr.target', 0.15], ['chin/chin-prominent-incr.target', 0.15],
  ['head/head-age-decr.target', 0.35], ['chin/chin-width-decr.target', 0.15], ['chin/chin-height-decr.target', 0.15],
  ['cheek/l-cheek-bones-incr.target', 0.2], ['cheek/r-cheek-bones-incr.target', 0.2],
  ['neck/neck-scale-horiz-decr.target', 0.1], ['mouth/mouth-angles-up.target', 0.25],
];

// ---------------------------------------------------------------- BVH (face pose units)
function parseBvh(txt) {
  const lines = txt.split('\n').map((l) => l.trim());
  const joints = []; const stack = []; let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('ROOT') || l.startsWith('JOINT')) {
      const j = { name: l.split(/\s+/)[1], parent: stack.length ? stack[stack.length - 1] : null, channels: [] };
      joints.push(j); stack.push(j);
    } else if (l.startsWith('End Site')) { stack.push(null); }
    else if (l.startsWith('CHANNELS')) stack[stack.length - 1].channels = l.split(/\s+/).slice(2);
    else if (l === '}') stack.pop();
    else if (l.startsWith('MOTION')) break;
  }
  const frames = [];
  for (i += 3; i < lines.length; i++) if (lines[i]) frames.push(lines[i].split(/\s+/).map(Number));
  return { joints, frames };
}
const mat = {
  ident: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  mul: (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; },
  rot: (axis, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c]; if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c]; return [c, -s, 0, s, c, 0, 0, 0, 1]; },
  apply: (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]],
  T: (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]],
};

// ---------------------------------------------------------------- packing
// int16 stream -> per-component delta (stride) -> zigzag -> byte planes (lo then hi): gzip-friendly
function shuffle16(a, stride) {
  const n = a.length; const out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    const prev = i >= stride ? a[i - stride] : 0;
    const d = a[i] - prev; const z = ((d << 1) ^ (d >> 31)) & 0xffff;
    out[i] = z & 255; out[n + i] = z >> 8;
  }
  return out;
}
// ---------------------------------------------------------------- binary container
function writeBin(chunks, header) {
  const parts = []; let off = 0; const meta = {};
  for (const [name, arr] of Object.entries(chunks)) {
    const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    meta[name] = { off, len: arr.length, type: arr.constructor.name };
    parts.push(buf); off += buf.length;
  }
  const json = Buffer.from(JSON.stringify({ ...header, chunks: meta }));
  const hl = Buffer.alloc(8); hl.writeUInt32LE(0x4855484d, 0); hl.writeUInt32LE(json.length, 4);
  const pad = (4 - ((8 + json.length) % 4)) % 4;
  return Buffer.concat([hl, json, Buffer.alloc(pad), ...parts]);
}

// ---------------------------------------------------------------- main
const GAME_BONES = [
  ['root', null], ['hips', 'root'], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ...['L', 'R'].flatMap((s) => [
    ['clavicle.' + s, 'chest'], ['upperArm.' + s, 'clavicle.' + s], ['foreArm.' + s, 'upperArm.' + s], ['hand.' + s, 'foreArm.' + s],
    ['fingers1.' + s, 'hand.' + s], ['fingers2.' + s, 'fingers1.' + s], ['fingers3.' + s, 'fingers2.' + s], ['thumb1.' + s, 'hand.' + s], ['thumb2.' + s, 'thumb1.' + s],
    ['upperLeg.' + s, 'hips'], ['lowerLeg.' + s, 'upperLeg.' + s], ['foot.' + s, 'lowerLeg.' + s], ['toes.' + s, 'foot.' + s],
  ]),
];
const BI = Object.fromEntries(GAME_BONES.map(([n], i) => [n, i]));

function mapBone(b) {
  const m = b.match(/^(.*)\.(L|R)$/); const base = m ? m[1] : b; const s = m ? '.' + m[2] : '';
  if (b === 'root' || b === 'spine05' || base === 'pelvis') return [['hips', 1]];
  if (b === 'spine04' || b === 'spine03') return [['spine', 1]];
  if (b === 'spine02' || b === 'spine01' || base === 'breast') return [['chest', 1]];
  if (base === 'clavicle') return [['clavicle' + s, 1]];
  if (base === 'shoulder01') return [['clavicle' + s, 0.45], ['upperArm' + s, 0.55]];
  if (base.startsWith('upperarm')) return [['upperArm' + s, 1]];
  if (base.startsWith('lowerarm')) return [['foreArm' + s, 1]];
  if (base === 'wrist' || base.startsWith('metacarpal')) return [['hand' + s, 1]];
  if (base === 'finger1-1') return [['thumb1' + s, 1]];
  if (base === 'finger1-2' || base === 'finger1-3') return [['thumb2' + s, 1]];
  if (/^finger[2-5]-1$/.test(base)) return [['fingers1' + s, 1]];
  if (/^finger[2-5]-2$/.test(base)) return [['fingers2' + s, 1]];
  if (/^finger[2-5]-3$/.test(base)) return [['fingers3' + s, 1]];
  if (base.startsWith('upperleg')) return [['upperLeg' + s, 1]];
  if (base.startsWith('lowerleg')) return [['lowerLeg' + s, 1]];
  if (base === 'foot') return [['foot' + s, 1]];
  if (base.startsWith('toe')) return [['toes' + s, 1]];
  if (b.startsWith('neck')) return [['neck', 1]];
  return [['head', 1]]; // head + every face bone (face motion comes from morphs)
}

// Relaxed-hand rest pose baked into every shape: MakeHuman's rest hand has splayed fingers; the game rig merges the
// four fingers per segment, so the spread is closed here (each finger rotated at its knuckle toward the middle
// finger) and the thumb is drawn in toward the palm. Uses the full CC0 MakeHuman rig + weights.
function poseHands(pos, skel, mhw) {
  const jp = (name) => { const vs = skel.joints[name]; let x = 0, y = 0, z = 0; for (const i of vs) { x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; } return [x / vs.length, y / vs.length, z / vs.length]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rotAround = (v, axis, ang) => { const c = Math.cos(ang), s = Math.sin(ang); const k = axis; const d = dot(k, v); const cr = cross(k, v); return [v[0] * c + cr[0] * s + k[0] * d * (1 - c), v[1] * c + cr[1] * s + k[1] * d * (1 - c), v[2] * c + cr[2] * s + k[2] * d * (1 - c)]; };
  const orig = Float64Array.from(pos);
  for (const sd of ['L', 'R']) {
    const dir = (f) => norm(sub(jp(`finger${f}-2.${sd}____head`), jp(`finger${f}-1.${sd}____head`)));
    const mid = dir(3);
    const rots = [];
    for (const [f, amt] of [[2, 0.55], [4, 0.6], [5, 0.75]]) {
      const d = dir(f);
      const ax = norm(cross(d, mid));
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(d, mid)))) * amt;
      rots.push({ bones: [`finger${f}-1.${sd}`, `finger${f}-2.${sd}`, `finger${f}-3.${sd}`], pivot: jp(`finger${f}-1.${sd}____head`), ax, ang });
    }
    // thumb: rotate toward the index knuckle about the palm-ish axis
    const th = norm(sub(jp(`finger1-2.${sd}____head`), jp(`finger1-1.${sd}____head`)));
    const toIdx = norm(sub(jp(`finger2-1.${sd}____head`), jp(`finger1-1.${sd}____head`)));
    rots.push({ bones: [`finger1-1.${sd}`, `finger1-2.${sd}`, `finger1-3.${sd}`], pivot: jp(`finger1-1.${sd}____head`), ax: norm(cross(th, toIdx)), ang: Math.acos(Math.max(-1, Math.min(1, dot(th, toIdx)))) * 0.28 });
    for (const r of rots) {
      const w = new Map();
      for (const b of r.bones) for (const [vi, ww] of mhw[b] ?? []) w.set(vi, (w.get(vi) ?? 0) + ww);
      for (const [vi, ww] of w) {
        const p = [orig[vi * 3] - r.pivot[0], orig[vi * 3 + 1] - r.pivot[1], orig[vi * 3 + 2] - r.pivot[2]];
        const q = rotAround(p, r.ax, r.ang);
        pos[vi * 3] += (q[0] - p[0]) * ww; pos[vi * 3 + 1] += (q[1] - p[1]) * ww; pos[vi * 3 + 2] += (q[2] - p[2]) * ww;
      }
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const obj = parseObj(await fetchData('3dobjs/base.obj'));
  const skel = JSON.parse(await fetchData('rigs/default.mhskel'));
  const mhw = JSON.parse(await fetchData('rigs/default_weights.mhw')).weights;
  const bvh = parseBvh(await fetchData('poseunits/face-poseunits.bvh'));
  const units = JSON.parse(await fetchData('poseunits/face-poseunits.json')).framemapping;
  const NV = obj.v.length / 3;

  // ---- groups we keep
  const KEEP = (g) => g === 'body' || g === 'helper-hair' || g === 'helper-skirt' || g === 'helper-upper-teeth' || g === 'helper-lower-teeth' || g.startsWith('helper-l-eyelashes') || g.startsWith('helper-r-eyelashes') || g === 'helper-l-eye' || g === 'helper-r-eye' || g === 'helper-tongue';
  const PART = (g) => (g === 'body' ? 'body' : g.startsWith('helper-l-eyelashes') || g.startsWith('helper-r-eyelashes') ? (g.endsWith('-2') ? 'lashUp' : 'lashLo') : g.startsWith('helper-upper-teeth') || g.startsWith('helper-lower-teeth') ? 'teeth' : g === 'helper-l-eye' ? 'eyeL' : g === 'helper-r-eye' ? 'eyeR' : g === 'helper-tongue' ? 'tongue' : g.replace('helper-', ''));

  // ---- shapes (MakeHuman decimetres, centred)
  const style = Float64Array.from(obj.v);
  let styleRaw;
  for (const [rel, w] of STYLE) { try { addTarget(style, await target(rel), w); } catch (e) { console.warn('style target missing', rel, e.message); } }
  styleRaw = Float64Array.from(style);
  const neutral = style; // gender .5 age .5 etc == the base mesh itself
  poseHands(neutral, skel, mhw);
  const PRESETS = {
    teenM: { gender: 1, age: 0.33, muscle: 0.55, weight: 0.45, height: 0.5, prop: 0.85 },
    teenF: { gender: 0, age: 0.33, muscle: 0.45, weight: 0.48, height: 0.45, prop: 0.85 },
    youngM: { gender: 1, age: 0.5, muscle: 0.55, weight: 0.5, height: 0.55, prop: 0.75 },
    youngF: { gender: 0, age: 0.5, muscle: 0.5, weight: 0.5, height: 0.5, prop: 0.75 },
    oldM: { gender: 1, age: 0.88, muscle: 0.42, weight: 0.55, height: 0.45, prop: 0.5 },
    oldF: { gender: 0, age: 0.88, muscle: 0.4, weight: 0.58, height: 0.42, prop: 0.5 },
    child: { gender: 0.5, age: 0.19, muscle: 0.5, weight: 0.5, height: 0.5, prop: 0.5 },
    muscle: { gender: 0.5, age: 0.5, muscle: 1, weight: 0.5, height: 0.5, prop: 0.5 },
    heavy: { gender: 0.5, age: 0.5, muscle: 0.5, weight: 1, height: 0.5, prop: 0.5 },
    thin: { gender: 0.5, age: 0.5, muscle: 0.5, weight: 0, height: 0.5, prop: 0.5 },
    tall: { gender: 0.5, age: 0.5, muscle: 0.5, weight: 0.5, height: 1, prop: 0.5 },
    short: { gender: 0.5, age: 0.5, muscle: 0.5, weight: 0.5, height: 0, prop: 0.5 },
  };
  const presetPos = {};
  for (const [k, m] of Object.entries(PRESETS)) {
    const p = await applyMacro(obj.v, m);
    for (let i = 0; i < p.length; i++) p[i] = p[i] - obj.v[i]; // macro-only delta (stylisation stays in neutral)
    presetPos[k] = p;
    console.log('preset', k);
  }

  // ---- joints
  const jointPos = (pos, name) => {
    const vs = skel.joints[name]; let x = 0, y = 0, z = 0;
    for (const i of vs) { x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; }
    return [x / vs.length, y / vs.length, z / vs.length];
  };
  const groundOf = (pos) => {
    let mn = 1e9; for (let i = 0; i < 13380; i++) mn = Math.min(mn, pos[i * 3 + 1]); return mn;
  };
  const avg = (...a) => a.reduce((s, p) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length, s[2] + p[2] / a.length], [0, 0, 0]);
  function gameJoints(pos) {
    const J = (n, t = 'head') => jointPos(pos, `${n}____${t}`);
    const g = groundOf(pos);
    const out = {};
    const hips = J('root');
    out.root = [0, g, hips[2]];
    out.hips = hips; out.spine = J('spine04'); out.chest = J('spine02'); out.neck = J('neck01'); out.head = J('head');
    for (const s of ['L', 'R']) {
      out['clavicle.' + s] = J('clavicle.' + s); out['upperArm.' + s] = J('upperarm01.' + s); out['foreArm.' + s] = J('lowerarm01.' + s); out['hand.' + s] = J('wrist.' + s);
      out['fingers1.' + s] = avg(...[2, 3, 4, 5].map((f) => J(`finger${f}-1.${s}`)));
      out['fingers2.' + s] = avg(...[2, 3, 4, 5].map((f) => J(`finger${f}-2.${s}`)));
      out['fingers3.' + s] = avg(...[2, 3, 4, 5].map((f) => J(`finger${f}-3.${s}`)));
      out['thumb1.' + s] = J('finger1-1.' + s); out['thumb2.' + s] = J('finger1-2.' + s);
      out['upperLeg.' + s] = J('upperleg01.' + s); out['lowerLeg.' + s] = J('lowerleg01.' + s); out['foot.' + s] = J('foot.' + s);
      out['toes.' + s] = avg(...[1, 2, 3, 4, 5].map((f) => J(`toe${f}-1.${s}`)));
    }
    // tails for leaf bones (used for lengths/aim)
    const tails = { head: J('head', 'tail') };
    for (const s of ['L', 'R']) {
      tails['fingers3.' + s] = avg(...[2, 3, 4, 5].map((f) => J(`finger${f}-3.${s}`, 'tail')));
      tails['thumb2.' + s] = J('finger1-3.' + s, 'tail');
      tails['toes.' + s] = avg(...[1, 2, 3, 4, 5].map((f) => J(`toe${f}-1.${s}`, 'tail')));
    }
    return { joints: GAME_BONES.map(([n]) => out[n]), tails, ground: g };
  }

  // ---- vertex subset (O space)
  const keepV = new Int32Array(NV).fill(-1);
  const oList = [];
  const partFaces = {};
  for (const f of obj.faces) {
    if (!KEEP(f.g)) continue;
    const part = PART(f.g);
    (partFaces[part] ??= []).push(f);
    for (const [vi] of f.c) if (keepV[vi] < 0) { keepV[vi] = oList.length; oList.push(vi); }
  }
  // joint helper verts are needed for joint positions but are not rendered: handled via full arrays above.
  const NO = oList.length;
  console.log('O verts', NO, Object.fromEntries(Object.entries(partFaces).map(([k, v]) => [k, v.length])));

  // ---- render vertices (split at UV seams) + triangles
  const rKey = new Map(); const rO = []; const rUV = [];
  const tris = {};
  for (const [part, fs] of Object.entries(partFaces)) {
    const out = (tris[part] = []);
    for (const f of fs) {
      const ids = f.c.map(([vi, ti]) => {
        const key = vi * 65536 + (ti < 0 ? 65535 : ti);
        let r = rKey.get(key);
        if (r === undefined) { r = rO.length; rKey.set(key, r); rO.push(keepV[vi]); rUV.push(ti < 0 ? 0 : obj.vt[ti * 2], ti < 0 ? 0 : obj.vt[ti * 2 + 1]); }
        return r;
      });
      for (let k = 1; k + 1 < ids.length; k++) out.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  const NR = rO.length;
  console.log('render verts', NR);

  // ---- neutral / presets in metres, ground at 0
  const S = 0.1;
  const nJ = gameJoints(neutral);
  const g0 = nJ.ground;
  const toM = (pos, g) => { const a = new Float64Array(NO * 3); oList.forEach((vi, o) => { a[o * 3] = pos[vi * 3] * S; a[o * 3 + 1] = (pos[vi * 3 + 1] - g) * S; a[o * 3 + 2] = pos[vi * 3 + 2] * S; }); return a; };
  const basePos = toM(neutral, g0);
  const baseJoints = nJ.joints.map((p) => [p[0] * S, (p[1] - g0) * S, p[2] * S]);
  const baseTails = Object.fromEntries(Object.entries(nJ.tails).map(([k, p]) => [k, [p[0] * S, (p[1] - g0) * S, p[2] * S]]));
  const presetNames = Object.keys(PRESETS);
  const presetDelta = []; const presetJoint = [];
  for (const k of presetNames) {
    // stylised base + macro delta, then the same relaxed-hand pose as the neutral
    const full = Float64Array.from(styleRaw); for (let i = 0; i < full.length; i++) full[i] += presetPos[k][i];
    poseHands(full, skel, mhw);
    const pj = gameJoints(full);
    const pm = toM(full, pj.ground);
    const d = new Int16Array(NO * 3);
    for (let i = 0; i < NO * 3; i++) d[i] = Math.round((pm[i] - basePos[i]) * 4000); // 0.25 mm
    presetDelta.push(d);
    const jd = new Float32Array(GAME_BONES.length * 3);
    pj.joints.forEach((p, b) => { jd[b * 3] = p[0] * S - baseJoints[b][0]; jd[b * 3 + 1] = (p[1] - pj.ground) * S - baseJoints[b][1]; jd[b * 3 + 2] = p[2] * S - baseJoints[b][2]; });
    presetJoint.push(jd);
  }

  // ---- skin weights collapsed to game bones
  const acc = Array.from({ length: NV }, () => new Map());
  for (const [bone, list] of Object.entries(mhw)) {
    for (const [gb, f] of mapBone(bone)) {
      const bi = BI[gb];
      for (const [vi, w] of list) { const m = acc[vi]; m.set(bi, (m.get(bi) ?? 0) + w * f); }
    }
  }
  const skinIdx = new Uint8Array(NO * 4), skinW = new Uint8Array(NO * 4);
  const domBone = new Uint8Array(NO);
  oList.forEach((vi, o) => {
    const e = [...acc[vi].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!e.length) e.push([BI.head, 1]);
    const sum = e.reduce((s, x) => s + x[1], 0);
    let q = e.map(([, w]) => Math.round((w / sum) * 255));
    const diff = 255 - q.reduce((a, b) => a + b, 0); q[0] += diff;
    e.forEach(([b], k) => { skinIdx[o * 4 + k] = b; skinW[o * 4 + k] = q[k]; });
    domBone[o] = e[0][0];
  });
  // eye / lash / teeth helpers: rigid to head (lids come from morphs)
  // ---- region parameter t along the dominant bone (0 = bone head, 1 = child joint / tail)
  const childOf = {}; GAME_BONES.forEach(([n, p]) => { if (p && !(p in childOf)) childOf[p] = n; });
  childOf['clavicle.L'] = 'upperArm.L'; childOf['clavicle.R'] = 'upperArm.R';
  childOf['hand.L'] = 'fingers1.L'; childOf['hand.R'] = 'fingers1.R';
  childOf.hips = 'spine'; childOf.chest = 'neck';
  const tailOf = (n) => (childOf[n] ? baseJoints[BI[childOf[n]]] : baseTails[n] ?? baseJoints[BI[n]]);
  const regionT = new Uint8Array(NO);
  for (let o = 0; o < NO; o++) {
    const b = domBone[o]; const n = GAME_BONES[b][0];
    const h = baseJoints[b], t = tailOf(n);
    const ax = [t[0] - h[0], t[1] - h[1], t[2] - h[2]]; const L2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2 || 1;
    const p = [basePos[o * 3] - h[0], basePos[o * 3 + 1] - h[1], basePos[o * 3 + 2] - h[2]];
    const tt = (p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]) / L2;
    regionT[o] = Math.max(0, Math.min(255, Math.round((tt + 0.5) * 127.5))); // encodes t in [-0.5, 1.5]
  }

  // ---- face-paint coordinates (uv1): frontal projection, origin between the eyes, unit = half interocular distance
  const eyeC = (part) => { const s = [0, 0, 0]; let n = 0; const seen = new Set(); for (const f of partFaces[part]) for (const [vi] of f.c) { if (seen.has(vi)) continue; seen.add(vi); const o = keepV[vi]; s[0] += basePos[o * 3]; s[1] += basePos[o * 3 + 1]; s[2] += basePos[o * 3 + 2]; n++; } return s.map((x) => x / n); };
  const eyeRad = (part, c) => { let r = 0, n = 0; const seen = new Set(); for (const f of partFaces[part]) for (const [vi] of f.c) { if (seen.has(vi)) continue; seen.add(vi); const o = keepV[vi]; r += Math.hypot(basePos[o * 3] - c[0], basePos[o * 3 + 1] - c[1], basePos[o * 3 + 2] - c[2]); n++; } return r / n; };
  const eL = eyeC('eyeL'), eR = eyeC('eyeR');
  const eyeR = eyeRad('eyeL', eL);
  const mid = avg(eL, eR); const unit = Math.abs(eL[0] - eR[0]) / 2;
  // paint masks from the CC0 weights: lips (orbicularis oris), brows (orbicularis oculi upper), mouth cavity
  const wSum = (pred) => { const a = new Float64Array(NV); for (const [bone, list] of Object.entries(mhw)) if (pred(bone)) for (const [vi, w] of list) a[vi] += w; return a; };
  const lipW = wSum((b) => /^oris/.test(b));
  const cavW = wSum((b) => /^(tongue|special01|special03|special04|jaw)/.test(b));
  const browW = wSum((b) => /^oculi0[12]/.test(b));
  const faceUV = new Int16Array(NO * 4);
  const bn = new Float64Array(NO * 3);
  for (const f of partFaces.body) {
    const ids = f.c.map(([vi]) => keepV[vi]);
    for (let k = 1; k + 1 < ids.length; k++) {
      const [a, b, c] = [ids[0], ids[k], ids[k + 1]];
      const ux = basePos[b * 3] - basePos[a * 3], uy = basePos[b * 3 + 1] - basePos[a * 3 + 1], uz = basePos[b * 3 + 2] - basePos[a * 3 + 2];
      const vx = basePos[c * 3] - basePos[a * 3], vy = basePos[c * 3 + 1] - basePos[a * 3 + 1], vz = basePos[c * 3 + 2] - basePos[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { bn[v * 3] += nx; bn[v * 3 + 1] += ny; bn[v * 3 + 2] += nz; }
    }
  }
  const landmark = (n) => { const p = jointPos(neutral, n + '____head'); return [(p[0] * S - mid[0]) / unit, ((p[1] - g0) * S - mid[1]) / unit, p[2] * S]; };
  const lipZ = landmark('oris04.L')[2];
  for (let o = 0; o < NO; o++) {
    const vi = oList[o];
    faceUV[o * 4] = Math.round(((basePos[o * 3] - mid[0]) / unit) * 2000);
    faceUV[o * 4 + 1] = Math.round(((basePos[o * 3 + 1] - mid[1]) / unit) * 2000);
    faceUV[o * 4 + 2] = Math.round(Math.min(1, lipW[vi]) * 1000) + Math.round(Math.min(1, browW[vi]) * 1000) * 0; // lips
    const fx = Math.abs((basePos[o * 3] - mid[0]) / unit), fy = (basePos[o * 3 + 1] - mid[1]) / unit;
    const inBox = fx < 0.9 && fy > -2.75 && fy < -1.5 ? 1 : 0;
    const nz = bn[o * 3 + 2] / (Math.hypot(bn[o * 3], bn[o * 3 + 1], bn[o * 3 + 2]) || 1);
    const behind = Math.max(0, Math.min(1, (lipZ - 0.006 - basePos[o * 3 + 2]) / 0.006)) * Math.max(0, Math.min(1, (0.35 - nz) / 0.3));
    faceUV[o * 4 + 3] = Math.round(Math.min(1, cavW[vi] * 2 + 0.5) * behind * inBox * 1000);
  }
  const landmarks = Object.fromEntries(['oris01', 'oris02', 'oris03.L', 'oris04.L', 'oris05', 'oris06', 'oris07.L', 'levator05.L', 'levator04.L', 'oculi01.L', 'oculi02.L', 'jaw', 'special04', 'levator06.L'].map((n) => [n, landmark(n)]));
  const browTail = (n) => { const p = jointPos(neutral, n + '____tail'); return [(p[0] * S - mid[0]) / unit, ((p[1] - g0) * S - mid[1]) / unit]; };
  landmarks.browInner = browTail('oculi01.L');
  console.log('landmarks', JSON.stringify(landmarks));

  // ---- face expression morphs from the pose-unit BVH (full MakeHuman rig, neutral shape)
  const C = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // z-up (bvh) -> y-up
  const CT = mat.T(C);
  const headPos = (name) => { const p = jointPos(neutral, `${name}____head`); return [p[0] * S, (p[1] - g0) * S, p[2] * S]; };
  const fullPos = new Float64Array(NV * 3); for (let i = 0; i < NV; i++) { fullPos[i * 3] = neutral[i * 3] * S; fullPos[i * 3 + 1] = (neutral[i * 3 + 1] - g0) * S; fullPos[i * 3 + 2] = neutral[i * 3 + 2] * S; }
  const bvhIndex = {}; let ch = 0; for (const j of bvh.joints) { bvhIndex[j.name] = { j, off: ch }; ch += j.channels.length; }
  const faceSet = new Set(); const addDesc = (n) => { faceSet.add(n); for (const j of bvh.joints) if (j.parent && j.parent.name === n) addDesc(j.name); };
  for (const j of bvh.joints) if (j.name === 'head') for (const c of bvh.joints.filter((x) => x.parent === j)) addDesc(c.name);
  function unitDelta(frameIdx, conv) {
    const fr = bvh.frames[frameIdx];
    const G = {}; // name -> {R, t}
    for (const j of bvh.joints) {
      const hp = skel.bones[j.name] ? headPos(j.name) : [0, 0, 0];
      let R = mat.ident();
      if (faceSet.has(j.name)) {
        const { off } = bvhIndex[j.name];
        let k = off;
        for (const c of j.channels) { if (c.endsWith('rotation')) R = mat.mul(R, mat.rot(c[0], fr[k])); k++; }
        if (conv) R = mat.mul(mat.mul(C, R), CT);
      }
      if (!j.parent) { G[j.name] = { R, t: hp, h: hp }; continue; }
      const P = G[j.parent.name];
      // world transform: parent * T(h - hp_parent) * R  => rotation P.R*R ; origin = P.R*(h-hparent) + P.t
      const rel = [hp[0] - P.h[0], hp[1] - P.h[1], hp[2] - P.h[2]];
      const o = mat.apply(P.R, rel);
      G[j.name] = { R: mat.mul(P.R, R), t: [o[0] + P.t[0], o[1] + P.t[1], o[2] + P.t[2]], h: hp };
    }
    const d = new Float64Array(NO * 3);
    for (const [bone, list] of Object.entries(mhw)) {
      const g = G[bone]; if (!g || !faceSet.has(bone)) continue;
      for (const [vi, w] of list) {
        const o = keepV[vi]; if (o < 0) continue;
        const p = [fullPos[vi * 3] - g.h[0], fullPos[vi * 3 + 1] - g.h[1], fullPos[vi * 3 + 2] - g.h[2]];
        const q = mat.apply(g.R, p);
        d[o * 3] += w * (q[0] + g.t[0] - fullPos[vi * 3]);
        d[o * 3 + 1] += w * (q[1] + g.t[1] - fullPos[vi * 3 + 1]);
        d[o * 3 + 2] += w * (q[2] + g.t[2] - fullPos[vi * 3 + 2]);
      }
    }
    return d;
  }
  // choose the axis convention by checking that JawDrop moves the chin down
  const chinO = (() => { let best = -1, by = 1e9; for (let o = 0; o < NO; o++) { if (Math.abs(basePos[o * 3]) < 0.004 && basePos[o * 3 + 2] > mid[2] - 0.02 && basePos[o * 3 + 1] < mid[1] - 0.06 && basePos[o * 3 + 1] > mid[1] - 0.14) { const s = -basePos[o * 3 + 1] + basePos[o * 3 + 2]; if (s < by || best < 0) { /* keep most forward-low */ } if (best < 0 || basePos[o * 3 + 2] - basePos[o * 3 + 1] * 0.5 > basePos[best * 3 + 2] - basePos[best * 3 + 1] * 0.5) best = o; } } return best; })();
  const jawIdx = units.indexOf('JawDrop');
  const conv = true; // verified: kiss pushes lips forward, brow-down moves brows down
  {
    const stat = (name, c) => { const d = unitDelta(units.indexOf(name), c); let sx = 0, sy = 0, sz = 0, n = 0; for (let o = 0; o < NO; o++) { const m = Math.hypot(d[o * 3], d[o * 3 + 1], d[o * 3 + 2]); if (m > 0.0005) { sx += d[o * 3] * Math.sign(basePos[o * 3] || 1); sy += d[o * 3 + 1]; sz += d[o * 3 + 2]; n++; } } return [sx / n, sy / n, sz / n].map((x) => (x * 1000).toFixed(2)).join(','); };
    for (const u of ['JawDrop', 'LipsKiss', 'MouthLeftPullUp', 'MouthLeftPullSide', 'LeftUpperLidClosed', 'LeftBrowDown']) console.log(u, 'conv', stat(u, true), 'noconv', stat(u, false));
    void jawIdx; void chinO;
  }
  const MORPHS = {
    blink: [['LeftUpperLidClosed', 1], ['RightUpperLidClosed', 1]],
    blinkL: [['LeftUpperLidClosed', 1]],
    blinkR: [['RightUpperLidClosed', 1]],
    lidUp: [['LeftUpperLidOpen', 1], ['RightUpperLidOpen', 1]],
    squint: [['LeftLowerLidUp', 1], ['RightLowerLidUp', 1]],
    browDown: [['LeftBrowDown', 1], ['RightBrowDown', 1]],
    browInnerUp: [['LeftInnerBrowUp', 1], ['RightInnerBrowUp', 1]],
    browOuterUp: [['LeftOuterBrowUp', 1], ['RightOuterBrowUp', 1]],
    cheekUp: [['LeftCheekUp', 1], ['RightCheekUp', 1]],
    jawOpen: [['JawDrop', 1]],
    jawWide: [['JawDropStretched', 1]],
    kiss: [['LipsKiss', 1]],
    smile: [['MouthLeftPullUp', 1], ['MouthRightPullUp', 1]],
    frown: [['MouthLeftPullDown', 1], ['MouthRightPullDown', 1]],
    wide: [['MouthLeftPullSide', 1], ['MouthRightPullSide', 1]],
    upperLipUp: [['UpperLipUp', 1]],
    lowerLipDown: [['lowerLipDown', 1]],
    nose: [['NoseWrinkler', 1]],
  };
  const morphNames = Object.keys(MORPHS);
  const morphIdx = [], morphD = [], morphCount = [];
  for (const name of morphNames) {
    const d = new Float64Array(NO * 3);
    for (const [u, w] of MORPHS[name]) { const fi = units.indexOf(u); if (fi < 0) throw new Error('unit ' + u); const ud = unitDelta(fi, conv); for (let i = 0; i < d.length; i++) d[i] += ud[i] * w; }
    let n = 0;
    for (let o = 0; o < NO; o++) {
      const m = Math.hypot(d[o * 3], d[o * 3 + 1], d[o * 3 + 2]);
      if (m > 0.00002) { morphIdx.push(o); morphD.push(Math.round(d[o * 3] * 100000), Math.round(d[o * 3 + 1] * 100000), Math.round(d[o * 3 + 2] * 100000)); n++; }
    }
    morphCount.push(n);
  }
  console.log('morphs', morphNames.map((n, i) => n + ':' + morphCount[i]).join(' '));

  // ---- LOD index buffers (body only) via meshoptimizer, simplified on seam-free O topology
  await MeshoptSimplifier.ready;
  const oTris = Uint32Array.from(tris.body.map((r) => rO[r]));
  const posF = Float32Array.from(basePos);
  const rOf = Array.from({ length: NO }, () => []); rO.forEach((o, r) => rOf[o].push(r));
  const lods = [];
  for (const ratio of [0.3, 0.1]) {
    const [ind] = MeshoptSimplifier.simplify(oTris, posF, 3, Math.floor((oTris.length * ratio) / 3) * 3, 0.02, ['LockBorder']);
    const out = new Uint16Array(ind.length);
    for (let t = 0; t < ind.length; t += 3) {
      const cands = [0, 1, 2].map((k) => rOf[ind[t + k]]);
      const uv0 = [0, 1, 2].map((k) => [rUV[cands[k][0] * 2], rUV[cands[k][0] * 2 + 1]]);
      for (let k = 0; k < 3; k++) {
        const ref = [(uv0[(k + 1) % 3][0] + uv0[(k + 2) % 3][0]) / 2, (uv0[(k + 1) % 3][1] + uv0[(k + 2) % 3][1]) / 2];
        let best = cands[k][0], bd = 1e9;
        for (const r of cands[k]) { const dd = (rUV[r * 2] - ref[0]) ** 2 + (rUV[r * 2 + 1] - ref[1]) ** 2; if (dd < bd) { bd = dd; best = r; } }
        out[t + k] = best;
      }
    }
    lods.push(out);
    console.log('lod', ratio, ind.length / 3, 'tris');
  }

  // ---- pack
  const chunks = {
    rO: Uint16Array.from(rO),
    rUV: Uint16Array.from(rUV.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 65535))),
    basePos: shuffle16(Int16Array.from(basePos, (x) => Math.round(x * 10000)), 3),
    skinIdx, skinW, domBone, regionT, faceUV,
    presetDelta: (() => { const a = new Int16Array(presetDelta.length * NO * 3); presetDelta.forEach((d, i) => a.set(d, i * NO * 3)); return shuffle16(a, 3); })(),
    presetJoint: (() => { const a = new Float32Array(presetJoint.length * GAME_BONES.length * 3); presetJoint.forEach((d, i) => a.set(d, i * GAME_BONES.length * 3)); return a; })(),
    joints: Float32Array.from(baseJoints.flat()),
    morphIdx: shuffle16(Int16Array.from(morphIdx), 1), morphD: shuffle16(Int16Array.from(morphD), 3),
    lod1: lods[0], lod2: lods[1],
  };
  for (const [part, t] of Object.entries(tris)) chunks['tri_' + part] = Uint16Array.from(t);
  const header = {
    version: 1, NO, NR, bones: GAME_BONES, presets: presetNames, morphs: morphNames, morphCount,
    eyes: { L: eL, R: eR, radius: eyeR }, face: { mid, unit, landmarks }, tails: baseTails, parts: Object.keys(tris),
    units: { pos: 1e-4, preset: 1 / 4000, morph: 1e-5, faceUV: 1 / 2000 }, packed: ['basePos', 'presetDelta', 'morphIdx', 'morphD'],
  };
  const bin = writeBin(chunks, header);
  const gz = zlib.gzipSync(bin, { level: 9 });
  fs.writeFileSync(path.join(OUT, 'humans.bin.gz'), gz);
  fs.writeFileSync(path.join(CACHE, 'used-files.json'), JSON.stringify([...used].sort(), null, 1));
  console.log('wrote humans.bin.gz', (bin.length / 1024).toFixed(0), 'KB raw,', (gz.length / 1024).toFixed(0), 'KB gz');
}

main().catch((e) => { console.error(e); process.exit(1); });
