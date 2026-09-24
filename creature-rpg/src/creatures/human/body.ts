// Skinned body meshes for one character: body (shared per look), head (per instance, CPU face morphs)
// and the small face-detail parts (lashes, teeth, tongue) that follow the same morphs.
import * as THREE from 'three';
import type { HumanData } from './data';
import type { BodyShape } from './shape';

export interface FaceLandmarks {
  /** in face units: mouth corner |x|, lip line y, upper lip height, lower lip height */
  mouth: [number, number, number, number];
  cornerZ: number;
}

export function faceLandmarks(d: HumanData, shape: BodyShape): FaceLandmarks {
  const lm = d.face.landmarks;
  void shape;
  const corner = lm['levator05.L'];
  const up = lm.oris05, lo = lm['oris07.L'];
  return { mouth: [corner[0], corner[1], Math.max(0.2, up[1] - corner[1]), Math.max(0.25, corner[1] - (lo[1] + 0.3))], cornerZ: corner[2] };
}

function setSkin(g: THREE.BufferGeometry, d: HumanData, oIdx: ArrayLike<number>) {
  const n = oIdx.length;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = oIdx[i];
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = d.skinIdx[o * 4 + k]; sw[i * 4 + k] = d.skinW[o * 4 + k] / 255; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

export interface SubMesh {
  geo: THREE.BufferGeometry;
  /** O index per local vertex */
  oIdx: Uint32Array;
}

/** Build a geometry from render-space triangles (subset); positions/normals from the shape. */
export function subGeometry(d: HumanData, shape: BodyShape, tris: ArrayLike<number>, opts: { uv?: boolean; face?: FaceLandmarks } = {}): SubMesh {
  const map = new Map<number, number>();
  const rList: number[] = [];
  const idx = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) {
    const r = tris[i];
    let l = map.get(r);
    if (l === undefined) { l = rList.length; map.set(r, l); rList.push(r); }
    idx[i] = l;
  }
  const n = rList.length;
  const oIdx = new Uint32Array(n);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const uv = opts.uv ? new Float32Array(n * 2) : null;
  const face = opts.face ? new Float32Array(n * 4) : null;
  for (let i = 0; i < n; i++) {
    const r = rList[i], o = d.rO[r];
    oIdx[i] = o;
    for (let k = 0; k < 3; k++) { pos[i * 3 + k] = shape.pos[o * 3 + k]; nrm[i * 3 + k] = shape.nrm[o * 3 + k]; }
    if (uv) { uv[i * 2] = d.uv[r * 2]; uv[i * 2 + 1] = d.uv[r * 2 + 1]; }
    if (face) for (let k = 0; k < 4; k++) face[i * 4 + k] = d.faceUV[o * 4 + k];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (face) g.setAttribute('aFace', new THREE.BufferAttribute(face, 4));
  setSkin(g, d, oIdx);
  g.setIndex(new THREE.BufferAttribute(n > 65535 ? idx : Uint16Array.from(idx), 1));
  return { geo: g, oIdx };
}

/** Split body triangles into "head" (touched by face morphs) and the rest. */
export function splitHead(d: HumanData, tris: Uint16Array): { head: number[]; rest: number[] } {
  const touched = new Uint8Array(d.NO);
  for (const o of d.morphVerts) touched[o] = 1;
  const head: number[] = [], rest: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const a = d.rO[tris[i]], b = d.rO[tris[i + 1]], c = d.rO[tris[i + 2]];
    const t = touched[a] || touched[b] || touched[c] || d.domBone[a] === d.boneIndex.head;
    (t ? head : rest).push(tris[i], tris[i + 1], tris[i + 2]);
  }
  return { head, rest };
}

/** Per-instance CPU face morph driver over one or more sub meshes (only touched vertices are rewritten). */
export class FaceMorpher {
  private targets: { geo: THREE.BufferGeometry; base: Float32Array; morphs: { li: Uint32Array; d: Float32Array }[] }[] = [];
  weights: Float32Array;
  private last: Float32Array;
  constructor(d: HumanData, meshes: SubMesh[]) {
    for (const m of meshes) {
      const locals = new Map<number, number[]>();
      m.oIdx.forEach((o, i) => { const l = locals.get(o); if (l) l.push(i); else locals.set(o, [i]); });
      const morphs = d.morphList.map((ml) => {
        const li: number[] = [], dd: number[] = [];
        for (let k = 0; k < ml.idx.length; k++) {
          const ls = locals.get(ml.idx[k]);
          if (!ls) continue;
          for (const i of ls) { li.push(i); dd.push(ml.d[k * 3], ml.d[k * 3 + 1], ml.d[k * 3 + 2]); }
        }
        return { li: Uint32Array.from(li), d: Float32Array.from(dd) };
      });
      const base = Float32Array.from(m.geo.getAttribute('position').array as Float32Array);
      this.targets.push({ geo: m.geo, base, morphs });
    }
    this.weights = new Float32Array(d.morphs.length);
    this.last = new Float32Array(d.morphs.length).fill(-1);
  }
  apply() {
    let dirty = false;
    for (let i = 0; i < this.weights.length; i++) if (Math.abs(this.weights[i] - this.last[i]) > 2e-3) dirty = true;
    if (!dirty) return;
    this.last.set(this.weights);
    for (const t of this.targets) {
      const attr = t.geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      arr.set(t.base);
      for (let mi = 0; mi < this.weights.length; mi++) {
        const w = this.weights[mi];
        if (w < 2e-3 && w > -2e-3) continue;
        const { li, d } = t.morphs[mi];
        for (let k = 0; k < li.length; k++) {
          const i = li[k] * 3;
          arr[i] += d[k * 3] * w; arr[i + 1] += d[k * 3 + 1] * w; arr[i + 2] += d[k * 3 + 2] * w;
        }
      }
      attr.needsUpdate = true;
    }
  }
}
