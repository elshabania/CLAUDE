// Body shape blending, normals and skeleton construction for baked human data.
import * as THREE from 'three';
import type { HumanData } from './data';

export interface BodyShape {
  /** rest positions (metres, feet on y=0), O space */
  pos: Float32Array;
  /** smooth normals, O space (body + helpers) */
  nrm: Float32Array;
  /** joint heads, per game bone */
  joints: Float32Array;
  eyeL: THREE.Vector3;
  eyeR: THREE.Vector3;
  eyeRadius: number;
}

export function blendShape(d: HumanData, weights: Record<string, number>): BodyShape {
  const pos = Float32Array.from(d.basePos);
  const joints = Float32Array.from(d.joints);
  for (const [k, w] of Object.entries(weights)) {
    const i = d.presets.indexOf(k);
    if (i < 0 || !w) continue;
    const pd = d.presetDelta[i];
    for (let j = 0; j < pos.length; j++) pos[j] += pd[j] * w;
    const pj = d.presetJoint[i];
    for (let j = 0; j < joints.length; j++) joints[j] += pj[j] * w;
  }
  const nrm = computeNormals(d, pos);
  const eyeC = (part: string) => {
    const t = d.tris[part];
    const seen = new Set<number>();
    const c = new THREE.Vector3();
    for (let i = 0; i < t.length; i++) {
      const o = d.rO[t[i]];
      if (seen.has(o)) continue;
      seen.add(o);
      c.x += pos[o * 3]; c.y += pos[o * 3 + 1]; c.z += pos[o * 3 + 2];
    }
    c.multiplyScalar(1 / seen.size);
    let r = 0;
    for (const o of seen) r += Math.hypot(pos[o * 3] - c.x, pos[o * 3 + 1] - c.y, pos[o * 3 + 2] - c.z);
    return { c, r: r / seen.size };
  };
  const L = eyeC('eyeL');
  const R = eyeC('eyeR');
  return { pos, nrm, joints, eyeL: L.c, eyeR: R.c, eyeRadius: (L.r + R.r) / 2 };
}

export function computeNormals(d: HumanData, pos: Float32Array): Float32Array {
  const n = new Float32Array(pos.length);
  const acc = (tris: ArrayLike<number>, mapO: boolean) => {
    for (let i = 0; i < tris.length; i += 3) {
      const a = mapO ? d.rO[tris[i]] : tris[i];
      const b = mapO ? d.rO[tris[i + 1]] : tris[i + 1];
      const c = mapO ? d.rO[tris[i + 2]] : tris[i + 2];
      const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
      const bx = pos[c * 3] - pos[a * 3], by = pos[c * 3 + 1] - pos[a * 3 + 1], bz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (const v of [a, b, c]) { n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz; }
    }
  };
  acc(d.bodyTrisO, false);
  for (const p of Object.keys(d.tris)) if (p !== 'body') acc(d.tris[p], true);
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

export interface Rig {
  bones: THREE.Bone[];
  byName: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  /** bind-pose world (model-space) head positions */
  rest: THREE.Vector3[];
  root: THREE.Bone;
}

/** Game skeleton with identity bind rotations; extra eye bones appended after the baked ones. */
export function buildRig(d: HumanData, shape: BodyShape): Rig {
  const bones: THREE.Bone[] = [];
  const rest: THREE.Vector3[] = [];
  const byName: Record<string, THREE.Bone> = {};
  d.bones.forEach(([name, parent], i) => {
    const b = new THREE.Bone();
    b.name = name;
    const p = new THREE.Vector3(shape.joints[i * 3], shape.joints[i * 3 + 1], shape.joints[i * 3 + 2]);
    rest.push(p);
    if (parent) {
      const pi = d.boneIndex[parent];
      b.position.copy(p).sub(rest[pi]);
      bones[pi].add(b);
    } else b.position.copy(p);
    bones.push(b);
    byName[name] = b;
  });
  for (const [name, c] of [['eye.L', shape.eyeL], ['eye.R', shape.eyeR]] as const) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(c).sub(rest[d.boneIndex.head]);
    byName.head.add(b);
    bones.push(b);
    rest.push(c.clone());
    byName[name] = b;
  }
  const root = bones[0];
  root.updateMatrixWorld(true);
  const inverses = rest.map((p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  const skeleton = new THREE.Skeleton(bones, inverses);
  return { bones, byName, skeleton, rest, root };
}
