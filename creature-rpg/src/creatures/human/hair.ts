// Sculpted-clump hair: a scalp shell + tapered lens-section clumps grown from the scalp along a per-style
// direction field, with gravity, stiffness, noise and simple head/neck/shoulder collision. Every clump carries a
// strand tangent (for the anisotropic highlight) and root-to-tip UVs (root shading, tip lift). One draw call.
import * as THREE from 'three';
import type { HumanData } from './data';
import type { BodyShape, Rig } from './shape';
import type { ResolvedLook } from './look';
import { hairMaterial, type HumanQuality } from './materials';
import { headShape, headField, type HeadShape } from './garments';

interface HB { pos: number[]; nrm: number[]; uv: number[]; tan: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }

function rng(seed: number) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildHair(d: HumanData, s: BodyShape, rig: Rig, L: ResolvedLook, lod: number, q: HumanQuality) {
  const style = L.hairStyle;
  const hs = headShape(d, s);
  const F = headField(d, s);
  const eyeY = (s.eyeL.y + s.eyeR.y) / 2;
  const cap = (L.extras ?? []).includes('cap');
  const hat = (L.extras ?? []).some((e) => e === 'hat' || e === 'brimhat');
  const R = rng(L.seed * 0.73 + 0.11);
  const J = (n: string) => V(s.joints[d.boneIndex[n] * 3], s.joints[d.boneIndex[n] * 3 + 1], s.joints[d.boneIndex[n] * 3 + 2]);
  const neck = J('neck'), chest = J('chest');
  const shoulderY = (J('upperArm.L').y + neck.y) / 2 + 0.02;
  const hb: HB = { pos: [], nrm: [], uv: [], tan: [], col: [], si: [], sw: [], idx: [] };
  const headB = d.boneIndex.head, neckB = d.boneIndex.neck, chestB = d.boneIndex.chest;
  const base = new THREE.Color(L.hair);
  const detail = lod === 0 ? 1 : lod === 1 ? 0.5 : 0.3;
  const kHead = 1.02;

  // ---------------------------------------------------------------- helpers
  const onEllipsoid = (a: number, el: number, k = kHead) => F.point(a, el, (k - 1) * 0.1);
  // outward direction (radial, slightly flattened toward the ellipsoid normal)
  const ellN = (p: THREE.Vector3) => {
    const r = p.clone().sub(hs.c).normalize();
    const e = V((p.x - hs.c.x) / (hs.r.x * hs.r.x), (p.y - hs.c.y) / (hs.r.y * hs.r.y), (p.z - hs.c.z) / (hs.r.z * hs.r.z)).normalize();
    return r.multiplyScalar(0.5).add(e.multiplyScalar(0.5)).normalize();
  };
  /** <1 when inside the skull field scaled by k (k as an absolute clearance in cm: 1.035 -> 3.5 mm) */
  const ellF = (p: THREE.Vector3, k: number) => {
    const dir = p.clone().sub(hs.c);
    const r = dir.length();
    const R0 = F.radius(dir) + (k - 1) * 0.1;
    return (r / R0) ** 2;
  };
  /** hairline height (y) for an azimuth: forehead high, temples, nape low */
  const hairline = (a: number) => {
    const front = Math.max(0, Math.cos(a));
    const side = Math.abs(Math.sin(a));
    const back = Math.max(0, -Math.cos(a));
    return eyeY + 0.048 * front ** 2 + 0.024 * side * (1 - back) - 0.07 * back ** 1.5 + (style === 'bald' ? 0.0 : 0);
  };
  const capRim = (a: number) => THREE.MathUtils.lerp(eyeY - 0.005, eyeY + 0.042, (Math.cos(a) + 1) / 2);
  const collide = (p: THREE.Vector3, k: number) => {
    // head
    const f = ellF(p, k);
    if (f < 1) {
      const dir = p.clone().sub(hs.c);
      const sc = 1 / Math.sqrt(f);
      p.copy(hs.c).add(dir.multiplyScalar(sc));
    }
    // cap: hair above the rim stays under the crown
    if (cap) {
      const a = Math.atan2(p.x - hs.c.x, p.z - hs.c.z);
      if (p.y > capRim(a) - 0.004 && ellF(p, 1.17) > 1) {
        const dir = p.clone().sub(hs.c);
        p.copy(hs.c).add(dir.multiplyScalar(1 / Math.sqrt(ellF(p, 1.17))));
      }
    }
    // neck cylinder + shoulders/back
    if (p.y < hs.c.y - hs.r.y * 0.3) {
      const nr = 0.075;
      const dx = p.x - neck.x, dz = p.z - (neck.z - 0.005);
      const r = Math.hypot(dx, dz);
      if (p.y > shoulderY - 0.02 && r < nr) { p.x = neck.x + (dx / (r || 1)) * nr; p.z = neck.z - 0.005 + (dz / (r || 1)) * nr; }
      // torso: elliptic cylinder capped by a sloping shoulder surface
      const ax = Math.abs(J('upperArm.L').x) + 0.05, az = 0.115;
      const tx = p.x / ax, tz = (p.z - chest.z) / az;
      const e = tx * tx + tz * tz;
      const ys = shoulderY - 0.09 * tx * tx - 0.03 * Math.max(0, tz);
      if (e < 1 && p.y < ys + 0.012 && p.y > chest.y - 0.45) {
        if (p.y > ys - 0.035) p.y = ys + 0.012;
        else { const sc = 1 / Math.sqrt(Math.max(e, 1e-4)); p.x *= sc; p.z = chest.z + (p.z - chest.z) * sc; }
      }
    }
  };
  const skin = (p: THREE.Vector3): [number[], number[]] => {
    const t = THREE.MathUtils.smoothstep(p.y, neck.y - 0.02, neck.y + 0.08);
    if (t > 0.99) return [[headB, 0, 0, 0], [1, 0, 0, 0]];
    const u = THREE.MathUtils.smoothstep(p.y, chest.y - 0.05, neck.y - 0.02);
    return [[headB, neckB, chestB, 0], [t, (1 - t) * u, (1 - t) * (1 - u), 0]];
  };

  /** Grow and emit one clump. */
  const clump = (root: THREE.Vector3, dir0: THREE.Vector3, o: { len: number; w: number; th?: number; seg?: number; grav?: number; stiff?: number; curl?: number; noise?: number; col?: number; k?: number; flat?: number; twist?: number; hug?: number; target?: THREE.Vector3; aim?: number }) => {
    const seg = Math.max(3, Math.round((o.seg ?? 6) * (detail < 1 ? 0.7 : 1)));
    const pts: THREE.Vector3[] = [root.clone()];
    let dir = dir0.clone().normalize();
    const step = o.len / seg;
    const grav = o.grav ?? 0.3;
    const side0 = V().crossVectors(dir, ellN(root)).normalize();
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const g = V(0, -1, 0).multiplyScalar(grav * (0.3 + t));
      const n = V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(o.noise ?? 0.25);
      dir.add(g.multiplyScalar(1 - (o.stiff ?? 0.4))).add(n);
      if (o.target) dir.add(o.target.clone().sub(pts[i]).normalize().multiplyScalar(o.aim ?? 0.6));
      if (o.curl) dir.applyAxisAngle(side0, o.curl * step * 10);
      if (o.hug) {
        // lie on the scalp while close to it: remove the outward component
        const f = ellF(pts[i], o.k ?? 1.035);
        if (f < 1.35) {
          const nn = ellN(pts[i]);
          const out = dir.dot(nn);
          dir.addScaledVector(nn, -out * o.hug * (out > 0 ? 1 : 0.6));
        }
      }
      dir.normalize();
      const p = pts[i].clone().addScaledVector(dir, step);
      collide(p, o.k ?? 1.035);
      dir = p.clone().sub(pts[i]).normalize();
      pts.push(p);
    }
    const ring = detail < 0.6 ? 3 : 5;
    const baseI = hb.pos.length / 3;
    const cvar = 0.88 + R() * 0.2;
    const c = base.clone().multiplyScalar(cvar * (o.col ?? 1));
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = pts[i];
      const tan = (i < seg ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
      const out = ellN(p);
      const side = V().crossVectors(tan, out).normalize();
      if (o.twist) side.applyAxisAngle(tan, o.twist * t);
      const nn = V().crossVectors(side, tan).normalize();
      const w = o.w * Math.pow(1 - t, 0.9) * (t < 0.08 ? 0.7 + t * 3.75 : 1) + 0.0006;
      const th = (o.th ?? o.w * 0.35) * (1 - t * 0.85) + 0.0004;
      const [bi, bw] = skin(p);
      for (let r = 0; r < ring; r++) {
        const ang = (r / ring) * Math.PI * 2;
        const off = side.clone().multiplyScalar(Math.cos(ang) * w).addScaledVector(nn, Math.sin(ang) * th * (o.flat ?? 1));
        const v = p.clone().add(off);
        hb.pos.push(v.x, v.y, v.z);
        const nm = off.clone().normalize().multiplyScalar(0.55).addScaledVector(nn, 0.45).normalize();
        hb.nrm.push(nm.x, nm.y, nm.z);
        hb.uv.push(r / ring, t);
        hb.tan.push(tan.x, tan.y, tan.z, 1);
        const rootDark = 0.72 + 0.28 * Math.min(1, t * 3);
        hb.col.push(c.r * rootDark, c.g * rootDark, c.b * rootDark);
        hb.si.push(...bi); hb.sw.push(...bw);
      }
    }
    for (let i = 0; i < seg; i++) for (let r = 0; r < ring; r++) {
      const a = baseI + i * ring + r, b = baseI + i * ring + ((r + 1) % ring);
      const c2 = a + ring, d2 = b + ring;
      hb.idx.push(a, c2, b, b, c2, d2);
    }
  };

  /** Scalp shell (fills gaps between clumps) up to the hairline, following the skull field. */
  const scalp = (off: number, extraDown = 0, col = 0.8) => {
    const na = Math.round(40 * Math.max(0.5, detail)), ne = Math.round(14 * Math.max(0.5, detail));
    const baseI = hb.pos.length / 3;
    const c = base.clone().multiplyScalar(col);
    for (let j = 0; j <= ne; j++) for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2;
      const yl = hairline(a) - extraDown * Math.max(0, -Math.cos(a));
      let lo = -1.0, hi = 1.5;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (F.point(a, m, off).y < yl) lo = m; else hi = m; }
      const t = j / ne;
      const el = THREE.MathUtils.lerp(lo, Math.PI / 2 - 0.001, 1 - Math.pow(1 - t, 1.5));
      const p = F.point(a, el, off + 0.004 * (1 - t) * 0);
      const n = ellN(p);
      hb.pos.push(p.x, p.y, p.z); hb.nrm.push(n.x, n.y, n.z); hb.uv.push(i / na, 0.25 + t * 0.2);
      const tn = V(0, 1, 0).sub(n.clone().multiplyScalar(n.y)).normalize();
      hb.tan.push(tn.x, tn.y, tn.z, 1);
      const edge = Math.min(1, t * 4);
      hb.col.push(c.r * (0.9 + 0.1 * edge), c.g * (0.9 + 0.1 * edge), c.b * (0.9 + 0.1 * edge));
      const [bi, bw] = skin(p);
      hb.si.push(...bi); hb.sw.push(...bw);
    }
    const W = na + 1;
    for (let j = 0; j < ne; j++) for (let i = 0; i < na; i++) {
      const a = baseI + j * W + i, b = a + 1, c3 = a + W, d3 = c3 + 1;
      hb.idx.push(a, b, c3, b, d3, c3);
    }
  };

  /** sample root points on the scalp above the hairline */
  const roots = (n: number, filter?: (a: number, el: number) => boolean) => {
    const out: { p: THREE.Vector3; a: number; el: number }[] = [];
    let tries = 0;
    while (out.length < n && tries++ < n * 40) {
      const a = R() * Math.PI * 2;
      const el = Math.asin(R() * 2 - 1);
      const p = onEllipsoid(a, el, 1.0);
      if (p.y < hairline(a) + 0.004) continue;
      if (filter && !filter(a, el)) continue;
      out.push({ p, a, el });
    }
    return out;
  };

  const N = (n: number) => Math.max(8, Math.round(n * detail));
  const up = V(0, 1, 0), back = V(0, 0, -1);

  if (style === 'bald') {
    // horseshoe fringe around the back and sides
    scalp(0.003, 0.0, 0.0);
    hb.pos.length = hb.nrm.length = hb.uv.length = hb.tan.length = hb.col.length = hb.si.length = hb.sw.length = hb.idx.length = 0;
    for (const r of roots(N(70), (a, el) => Math.cos(a) < 0.25 && el < 0.15)) {
      const t = ellN(r.p).cross(V(0, 1, 0)).cross(ellN(r.p)).normalize().negate();
      clump(r.p, t.add(back.clone().multiplyScalar(0.3)), { len: 0.03, w: 0.009, grav: 0.2, stiff: 0.8, k: 1.03, noise: 0.15 });
    }
  } else {
    scalp(style === 'crop' || style === 'curly' ? 0.006 : 0.004, style === 'long' || style === 'bob' ? 0.02 : 0, 0.82);
  }

  if (style === 'spiky') {
    // messy spikes: up/back on the crown, forward bangs over the brow, flicked tufts at the temples and nape;
    // under a cap the crown hair is squashed and bursts out from beneath the rim in short tufts
    for (const r of roots(N(cap ? 170 : 190))) {
      const n = ellN(r.p);
      const front = Math.cos(r.a), sideA = Math.sin(r.a);
      const isBang = front > 0.45 && r.p.y < hairline(r.a) + 0.06;
      let dir: THREE.Vector3;
      let len = 0.055 + R() * 0.035;
      let grav = 0.12, stiff = 0.75, w = 0.013 + R() * 0.007;
      if (isBang) {
        dir = V(sideA * 0.6 + (R() - 0.5) * 0.6, -0.8, 0.6);
        len = 0.038 + R() * 0.028; grav = 0.35; stiff = 0.5;
      } else if (cap && r.p.y > capRim(r.a) - 0.03) {
        dir = V(sideA, 0, front).normalize().multiplyScalar(0.4).add(V(0, -1, 0));
        len = (front < -0.3 ? 0.035 : 0.045) + R() * 0.025; grav = 0.2; stiff = 0.7;
      } else {
        dir = n.clone().add(up.clone().multiplyScalar(0.4)).add(back.clone().multiplyScalar(0.35 + 0.3 * Math.max(0, -front)));
        if (Math.abs(sideA) > 0.55 && r.p.y < eyeY + 0.05) { dir = n.clone().multiplyScalar(0.5).add(V(0, -0.75, -0.35)); len = 0.035 + R() * 0.025; }
        if (front < -0.4 && r.p.y < eyeY + 0.01) { dir = n.clone().multiplyScalar(0.35).add(V(0, -1, -0.15)); len = 0.035 + R() * 0.02; }
      }
      clump(r.p, dir, { len, w, th: 0.005, grav, stiff, noise: 0.28, k: 1.04, twist: (R() - 0.5) * 1.2, seg: 6, hug: 0.35 });
    }
    } else if (style === 'crop') {
    for (const r of roots(N(240))) {
      const n = ellN(r.p);
      const front = Math.cos(r.a);
      const dir = front > 0.6 && r.p.y < hairline(r.a) + 0.04 ? V(Math.sin(r.a) * 0.5, -0.3, 1).sub(n.clone().multiplyScalar(0.5)) : V(0, 0.4, -1).add(V(Math.sin(r.a), 0, 0).multiplyScalar(0.4)).sub(n.clone().multiplyScalar(0.6));
      clump(r.p, dir, { len: 0.028 + R() * 0.018, w: 0.009, th: 0.003, grav: 0.1, stiff: 0.7, noise: 0.3, k: 1.045, flat: 0.8, hug: 0.6, col: 0.95 });
    }
  } else if (style === 'curly') {
    for (const r of roots(N(170))) {
      const n = ellN(r.p);
      clump(r.p, n.clone().add(V((R() - 0.5), (R() - 0.3), (R() - 0.5))), { len: 0.035 + R() * 0.025, w: 0.009, th: 0.006, grav: 0.05, stiff: 0.6, curl: 1.6 + R() * 0.8, noise: 0.1, k: 1.07, seg: 7 });
    }
  } else if (style === 'long' || style === 'bob') {
    const bob = style === 'bob';
    for (const r of roots(N(bob ? 170 : 190))) {
      const n = ellN(r.p);
      const front = Math.cos(r.a), sideA = Math.sin(r.a);
      const isBang = front > 0.55 && r.p.y < hairline(r.a) + 0.05;
      const sgn = Math.sign(r.p.x - hs.c.x) || 1;
      let dir: THREE.Vector3;
      let len: number;
      if (isBang) { dir = V(sgn * 0.9, -0.5, 0.15); len = bob ? 0.06 : 0.07; }
      else {
        // centre parting: flow away from the part line, over the scalp, then fall
        dir = V(sgn * (0.7 + 0.2 * Math.abs(sideA)), -0.2, -0.35 - 0.3 * Math.max(0, -front) - 0.5 * Math.max(0, front));
        len = bob ? 0.17 + R() * 0.03 - Math.max(0, front) * 0.02 : 0.34 + R() * 0.08 - Math.max(0, front) * 0.07;
      }
      clump(r.p, dir.sub(n.clone().multiplyScalar(dir.dot(n))), { len, w: 0.02 + R() * 0.008, th: 0.004, grav: 0.9, stiff: isBang ? 0.5 : 0.2, noise: 0.06, k: 1.04, seg: bob ? 8 : 12, curl: bob ? -0.35 : 0.0, flat: 0.6, hug: 1 });
    }
  } else if (style === 'bun' || style === 'tail' || style === 'braid') {
    // slicked back toward a tie point
    const tie = style === 'bun' ? onEllipsoid(Math.PI, 0.55, 1.05) : onEllipsoid(Math.PI, style === 'braid' ? 0.1 : 0.3, 1.06);
    for (const r of roots(N(150))) {
      const toTie = tie.clone().sub(r.p);
      const n = ellN(r.p);
      const dir = toTie.clone().sub(n.clone().multiplyScalar(toTie.dot(n))).normalize();
      clump(r.p, dir, { len: toTie.length() * 1.05, w: 0.016, th: 0.003, grav: 0.0, stiff: 1, noise: 0.03, k: 1.035, flat: 0.8, hug: 1, target: tie, aim: 0.5, seg: 7 });
    }
    if (style === 'bun') {
      // wound bun: a flattened sphere wrapped by a few coiled ribbons, sitting on the tie point
      const nrm = ellN(tie);
      const c0 = tie.clone().addScaledVector(nrm, 0.024);
      const bun = new THREE.SphereGeometry(0.034, 16, 12);
      bun.scale(1, 0.85, 0.8);
      const m = new THREE.Matrix4().lookAt(c0, c0.clone().add(nrm), V(0, 1, 0)).setPosition(c0);
      bun.applyMatrix4(m);
      appendRigid(hb, bun, headB, base.clone().multiplyScalar(0.85), true);
      for (let i = 0; i < N(10); i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = c0.clone().add(V(Math.cos(a) * 0.028, Math.sin(a) * 0.024, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m)));
        const dir = V(-Math.sin(a), Math.cos(a), 0).applyMatrix4(new THREE.Matrix4().extractRotation(m));
        clump(p, dir, { len: 0.05, w: 0.012, th: 0.005, grav: 0, stiff: 1, noise: 0.02, k: 1.0, seg: 5 });
      }
    } else if (style === 'tail') {
      for (let i = 0; i < N(30); i++) {
        const p = tie.clone().add(V((R() - 0.5) * 0.018, (R() - 0.5) * 0.018, -0.004));
        clump(p, V((R() - 0.5) * 0.3, 0.1, -1), { len: 0.26 + R() * 0.07, w: 0.013, th: 0.007, grav: 1.0, stiff: 0.3, noise: 0.08, k: 1.04, seg: 10 });
      }
      const g = new THREE.TorusGeometry(0.013, 0.0045, 5, 10);
      g.rotateX(Math.PI / 2 - 0.4);
      g.translate(tie.x, tie.y, tie.z - 0.01);
      appendRigid(hb, g, headB, new THREE.Color(L.accent));
    } else {
      // braid: alternating lobes down the back
      const n = 9;
      let p = tie.clone();
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const next = p.clone().add(V(0, -0.034, -0.01 * (1 - t)));
        collide(next, 1.05);
        const sideO = (i % 2 ? 1 : -1) * 0.008;
        clump(p.clone().add(V(sideO, 0, 0)), next.clone().sub(p).add(V(-sideO * 2, 0, 0)), { len: 0.045, w: 0.018 * (1 - t * 0.4), th: 0.012 * (1 - t * 0.4), grav: 0, stiff: 1, noise: 0, k: 1.0, seg: 4 });
        p = next;
      }
      const g = new THREE.TorusGeometry(0.01, 0.004, 5, 10);
      g.rotateX(Math.PI / 2);
      g.translate(p.x, p.y + 0.01, p.z);
      appendRigid(hb, g, chestB, new THREE.Color(L.accent));
    }
  }
  void hat;

  if (!hb.idx.length) return [];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(hb.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(hb.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(hb.uv, 2));
  g.setAttribute('tangent', new THREE.Float32BufferAttribute(hb.tan, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(hb.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(hb.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(hb.sw, 4));
  g.setIndex(hb.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(hb.idx, 1) : new THREE.Uint16BufferAttribute(hb.idx, 1));
  void rig;
  return [{ geo: g, mat: hairMaterial('#ffffff', q), name: 'hair' }];
}

function appendRigid(hb: HB, g: THREE.BufferGeometry, bone: number, c: THREE.Color, strands = false) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const base = hb.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    hb.pos.push(p.getX(i), p.getY(i), p.getZ(i)); hb.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    hb.uv.push(strands ? Math.atan2(p.getY(i), p.getX(i)) : 0, 0.5); hb.tan.push(1, 0, 0, 1); hb.col.push(c.r, c.g, c.b);
    hb.si.push(bone, 0, 0, 0); hb.sw.push(1, 0, 0, 0);
  }
  for (let i = 0; i < g.index!.count; i++) hb.idx.push(base + g.index!.getX(i));
  g.dispose();
}
export type { HeadShape };
