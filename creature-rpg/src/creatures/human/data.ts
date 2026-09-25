// Loader/decoder for the baked MakeHuman-derived character data (scripts/build-humans.mjs).
// The asset is fetched once (gzip, decompressed with DecompressionStream) and shared by every character.
import assetUrl from './assets/humans.bin.gz?url';

export interface HumanData {
  NO: number;
  NR: number;
  bones: [string, string | null][];
  boneIndex: Record<string, number>;
  presets: string[];
  morphs: string[];
  /** render vertex -> O vertex */
  rO: Uint16Array;
  uv: Float32Array;
  basePos: Float32Array;
  skinIdx: Uint8Array;
  skinW: Uint8Array;
  domBone: Uint8Array;
  /** limb parameter t along the dominant bone, decoded to [-0.5, 1.5] */
  regionT: Float32Array;
  /** per O vertex: face x, y (face units), lip mask, mouth-cavity mask */
  faceUV: Float32Array;
  presetDelta: Float32Array[];
  presetJoint: Float32Array[];
  joints: Float32Array;
  morphList: { idx: Uint16Array; d: Float32Array }[];
  tris: Record<string, Uint16Array>;
  lod1: Uint16Array;
  lod2: Uint16Array;
  eyes: { L: number[]; R: number[]; radius: number };
  face: { mid: number[]; unit: number; landmarks: Record<string, number[]> };
  tails: Record<string, number[]>;
  /** O vertices touched by any face morph (their index list) */
  morphVerts: Uint32Array;
  /** O vertex -> list of O triangles (for normals); O-space triangles of the body */
  bodyTrisO: Uint32Array;
}

function unshuffle16(bytes: Uint8Array, n: number, stride: number): Int16Array {
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const z = bytes[i] | (bytes[n + i] << 8);
    const d = (z >>> 1) ^ -(z & 1);
    out[i] = (i >= stride ? out[i - stride] : 0) + d;
  }
  return out;
}

export function decodeHumanData(buf: ArrayBuffer): HumanData {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x4855484d) throw new Error('bad human asset');
  const jl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
  const base = 8 + jl + ((4 - ((8 + jl) % 4)) % 4);
  const C = header.chunks as Record<string, { off: number; len: number; type: string }>;
  const ctor: Record<string, any> = { Uint8Array, Uint16Array, Int16Array, Float32Array, Int32Array, Uint32Array };
  const get = (name: string) => { const c = C[name]; return new ctor[c.type](buf, base + c.off, c.len); };
  const NO: number = header.NO;
  const NR: number = header.NR;
  const U = header.units;
  const bp = unshuffle16(get('basePos'), NO * 3, 3);
  const basePos = new Float32Array(NO * 3);
  for (let i = 0; i < basePos.length; i++) basePos[i] = bp[i] * U.pos;
  const nP = header.presets.length;
  const pd = unshuffle16(get('presetDelta'), nP * NO * 3, 3);
  const presetDelta: Float32Array[] = [];
  for (let p = 0; p < nP; p++) {
    const a = new Float32Array(NO * 3);
    for (let i = 0; i < a.length; i++) a[i] = pd[p * NO * 3 + i] * U.preset;
    presetDelta.push(a);
  }
  const nB = header.bones.length;
  const pj = get('presetJoint') as Float32Array;
  const presetJoint = Array.from({ length: nP }, (_, p) => pj.slice(p * nB * 3, (p + 1) * nB * 3));
  const mIdx = unshuffle16(get('morphIdx'), C.morphIdx.len / 2, 1);
  const mD = unshuffle16(get('morphD'), C.morphD.len / 2, 3);
  const morphList: HumanData['morphList'] = [];
  let off = 0;
  const touched = new Uint8Array(NO);
  for (const n of header.morphCount as number[]) {
    const idx = new Uint16Array(n);
    const d = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      idx[i] = mIdx[off + i] & 0xffff;
      touched[idx[i]] = 1;
      d[i * 3] = mD[(off + i) * 3] * U.morph;
      d[i * 3 + 1] = mD[(off + i) * 3 + 1] * U.morph;
      d[i * 3 + 2] = mD[(off + i) * 3 + 2] * U.morph;
    }
    morphList.push({ idx, d });
    off += n;
  }
  const rUV = get('rUV') as Uint16Array;
  const uv = new Float32Array(rUV.length);
  for (let i = 0; i < uv.length; i++) uv[i] = rUV[i] / 65535;
  const rt = get('regionT') as Uint8Array;
  const regionT = new Float32Array(NO);
  for (let i = 0; i < NO; i++) regionT[i] = rt[i] / 127.5 - 0.5;
  const fu = get('faceUV') as Int16Array;
  const faceUV = new Float32Array(fu.length);
  for (let i = 0; i < fu.length; i++) faceUV[i] = (i & 3) < 2 ? fu[i] * U.faceUV : fu[i] / 1000;
  const tris: Record<string, Uint16Array> = {};
  for (const p of header.parts as string[]) tris[p] = get('tri_' + p);
  const rO = get('rO') as Uint16Array;
  const body = tris.body;
  const bodyTrisO = new Uint32Array(body.length);
  for (let i = 0; i < body.length; i++) bodyTrisO[i] = rO[body[i]];
  const mv: number[] = [];
  for (let i = 0; i < NO; i++) if (touched[i]) mv.push(i);
  return {
    NO, NR, bones: header.bones, boneIndex: Object.fromEntries((header.bones as [string, string | null][]).map(([n], i) => [n, i])),
    presets: header.presets, morphs: header.morphs, rO, uv, basePos,
    skinIdx: get('skinIdx'), skinW: get('skinW'), domBone: get('domBone'), regionT, faceUV,
    presetDelta, presetJoint, joints: get('joints'), morphList, tris, lod1: get('lod1'), lod2: get('lod2'),
    eyes: header.eyes, face: header.face, tails: header.tails, morphVerts: Uint32Array.from(mv), bodyTrisO,
  };
}

let data: HumanData | null = null;
let pending: Promise<HumanData> | null = null;
const waiters = new Set<(d: HumanData) => void>();

export function humanData(): HumanData | null {
  return data;
}

export function loadHumanData(): Promise<HumanData> {
  if (data) return Promise.resolve(data);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error('human asset HTTP ' + res.status);
      let buf: ArrayBuffer;
      const raw = await res.arrayBuffer();
      const u8 = new Uint8Array(raw);
      if (u8[0] === 0x1f && u8[1] === 0x8b) {
        const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
        buf = await new Response(ds).arrayBuffer();
      } else buf = raw; // some servers transparently decode .gz
      data = decodeHumanData(buf);
      for (const w of waiters) w(data);
      waiters.clear();
      return data;
    })();
  }
  return pending;
}

/** Calls cb now if loaded, else once the asset arrives. Returns an unsubscribe. */
export function onHumanData(cb: (d: HumanData) => void): () => void {
  if (data) { cb(data); return () => {}; }
  waiters.add(cb);
  if (typeof window !== 'undefined') loadHumanData().catch((e) => console.error('[humans] asset load failed', e));
  return () => waiters.delete(cb);
}
