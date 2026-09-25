// Procedural skeletal animation for the human cast (no mocap): idle breathing + weight shift, walk/run with
// IK foot placement tied to speed, turn lean, talk gestures, Chime throw, command point, victory fist-pump,
// hurt flinch, lose/kneel, plus face: expressions, blinking, saccades and talk mouth.
import * as THREE from 'three';
import type { HumanData } from './data';
import type { BodyShape, Rig } from './shape';
import type { ResolvedLook } from './look';
import type { FaceMorpher } from './body';
import type { OutfitProps } from './garments';

export type HumanAction =
  | 'attack' | 'special' | 'status' | 'hit' | 'capture' | 'breakout' | 'faint' | 'victory' | 'happy'
  | 'throw' | 'command' | 'talk' | 'wave' | 'lose' | 'hurt';
export type Expression = 'neutral' | 'happy' | 'surprised' | 'determined' | 'shout' | 'sad' | 'hurt' | 'faint' | 'smirk' | 'worried';

const EXPR: Record<Expression, Record<string, number>> = {
  neutral: {},
  happy: { smile: 0.85, cheekUp: 0.55, squint: 0.3, browInnerUp: 0.15, jawOpen: 0.12 },
  smirk: { smile: 0.45, cheekUp: 0.2, browOuterUp: 0.25, squint: 0.15 },
  surprised: { browInnerUp: 0.8, browOuterUp: 0.8, lidUp: 0.7, jawOpen: 0.4, kiss: 0.15 },
  determined: { browDown: 0.75, squint: 0.35, smile: 0.2, wide: 0.15 },
  shout: { browDown: 0.8, squint: 0.3, jawOpen: 0.65, wide: 0.45, upperLipUp: 0.3 },
  sad: { browInnerUp: 0.85, frown: 0.6, blink: 0.18, lowerLipDown: 0.1 },
  worried: { browInnerUp: 0.7, frown: 0.25, lidUp: 0.2 },
  hurt: { squint: 0.8, browDown: 0.55, browInnerUp: 0.3, wide: 0.55, jawOpen: 0.2, nose: 0.45, blink: 0.35 },
  faint: { blink: 1, frown: 0.3, jawOpen: 0.08, browInnerUp: 0.3 },
};

const BASE_FACE: Record<string, number> = { jawOpen: -0.07, lidUp: 0.35, smile: 0.1, kiss: 0.04 };

interface Act { name: HumanAction; t: number; dur: number; contact: number; fired: boolean; hold: boolean; onContact?: () => void; onDone?: () => void }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _v = V(), _v2 = V(), _v3 = V();
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bell = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
const lerp = THREE.MathUtils.lerp;

/** rotation taking basis (dirA, poleA) to (dirB, poleB) */
function frameRot(dirA: THREE.Vector3, poleA: THREE.Vector3, dirB: THREE.Vector3, poleB: THREE.Vector3, out: THREE.Quaternion) {
  const ya = dirA.clone().normalize(), xa = V().crossVectors(ya, poleA).normalize(), za = V().crossVectors(xa, ya);
  const yb = dirB.clone().normalize(), xb = V().crossVectors(yb, poleB).normalize(), zb = V().crossVectors(xb, yb);
  const A = new THREE.Matrix4().makeBasis(xa, ya, za), B = new THREE.Matrix4().makeBasis(xb, yb, zb);
  return out.setFromRotationMatrix(B.multiply(A.transpose()));
}

interface Limb { a: string; b: string; c: string; l1: number; l2: number; dir1: THREE.Vector3; dir2: THREE.Vector3; pole: THREE.Vector3 }

export class HumanAnimator {
  speed = 0;
  reducedMotion = false;
  talking = false;
  props: OutfitProps = {};
  private time = Math.random() * 20;
  private phase = 0;
  private moveBlend = 0;
  private runBlend = 0;
  private act: Act | null = null;
  private held: HumanAction | null = null;
  private heldT = 0;
  private expr: Expression = 'neutral';
  private exprFlash: { e: Expression; t: number } | null = null;
  private faceW: Record<string, number> = {};
  private blinkT = 2;
  private blinkPhase = -1;
  private look = V(0, 0, 1);
  private lookTarget = V(0, 0, 1);
  private sacc = 1;
  private talkT = 0;
  private yawPrev: number | null = null;
  private turnLean = 0;
  private shift = 0;
  private B: Record<string, THREE.Bone>;
  private R: Record<string, THREE.Vector3> = {};
  private legs: Record<'L' | 'R', Limb>;
  private arms: Record<'L' | 'R', Limb>;
  private hipH: number;
  private worldQ: Record<string, THREE.Quaternion> = {};
  private stepSide = 0;

  constructor(private rig: Rig, private shape: BodyShape, private d: HumanData, private L: ResolvedLook, private morpher: FaceMorpher | null) {
    this.B = rig.byName;
    rig.bones.forEach((b, i) => (this.R[b.name] = rig.rest[i].clone()));
    const limb = (a: string, b: string, c: string, pole: THREE.Vector3): Limb => {
      const A = this.R[a], Bp = this.R[b], C = this.R[c];
      return { a, b, c, l1: A.distanceTo(Bp), l2: Bp.distanceTo(C), dir1: Bp.clone().sub(A).normalize(), dir2: C.clone().sub(Bp).normalize(), pole };
    };
    this.legs = { L: limb('upperLeg.L', 'lowerLeg.L', 'foot.L', V(0, 0, 1)), R: limb('upperLeg.R', 'lowerLeg.R', 'foot.R', V(0, 0, 1)) };
    this.arms = { L: limb('upperArm.L', 'foreArm.L', 'hand.L', V(0, 0, -1)), R: limb('upperArm.R', 'foreArm.R', 'hand.R', V(0, 0, -1)) };
    this.hipH = this.R.hips.y;
    this.B.head.scale.setScalar(L.headScale);
    this.B['hand.L'].scale.setScalar(L.handScale);
    this.B['hand.R'].scale.setScalar(L.handScale);
    void shape; void d;
  }

  setSpeed(s: number) { this.speed = s; }

  setExpression(e: Expression) { this.expr = e; }

  flash(e: Expression, t: number) { this.exprFlash = { e, t }; }

  get busy() { return !!this.act && !this.act.hold; }

  play(name: HumanAction, cb: { onContact?: () => void; onDone?: () => void } = {}) {
    const n: HumanAction = name === 'attack' || name === 'special' || name === 'status' ? 'command' : name === 'capture' ? 'throw' : name === 'faint' ? 'lose' : name === 'hit' ? 'hurt' : name === 'breakout' ? 'hurt' : name;
    const dur: Record<string, number> = { command: 1.1, throw: 1.15, victory: 2.2, happy: 1.2, hurt: 0.7, lose: 1.4, talk: 2.4, wave: 1.6 };
    const contact: Record<string, number> = { command: 0.45, throw: 0.5 };
    this.act = { name: n, t: 0, dur: dur[n] ?? 1, contact: contact[n] ?? 0, fired: false, hold: n === 'lose' || n === 'victory', onContact: cb.onContact, onDone: cb.onDone };
    this.held = null;
    if (n === 'command' || n === 'throw') this.flash('determined', dur[n]);
    else if (n === 'victory') this.flash('happy', 99);
    else if (n === 'happy' || n === 'wave') this.flash('happy', dur[n] + 0.5);
    else if (n === 'hurt') this.flash('hurt', 0.8);
    else if (n === 'lose') this.flash('sad', 99);
  }

  resetPose() { this.act = null; this.held = null; this.exprFlash = null; }

  // ------------------------------------------------------------------ helpers
  private setWorld(name: string, parentName: string | null, wq: THREE.Quaternion) {
    this.worldQ[name] = wq.clone();
    const b = this.B[name];
    if (parentName) b.quaternion.copy(this.worldQ[parentName]).invert().multiply(wq);
    else b.quaternion.copy(wq);
  }

  /** joint world (model) position after current pose of its ancestors (requires matrices up to date) */
  private jointPos(name: string, out: THREE.Vector3) {
    return this.B[name].getWorldPosition(out).applyMatrix4(_m.copy(this.rig.root.parent!.matrixWorld).invert());
  }

  private ik(limb: Limb, parentName: string, target: THREE.Vector3, pole: THREE.Vector3) {
    const A = this.jointPos(limb.a, V());
    const toT = target.clone().sub(A);
    let dist = toT.length();
    const maxL = (limb.l1 + limb.l2) * 0.999;
    dist = Math.min(maxL, Math.max(Math.abs(limb.l1 - limb.l2) + 1e-3, dist));
    const dir = toT.normalize();
    const cosA = (limb.l1 * limb.l1 + dist * dist - limb.l2 * limb.l2) / (2 * limb.l1 * dist);
    const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const kneeDir = dir.clone().multiplyScalar(Math.cos(ang)).add(pp.clone().multiplyScalar(Math.sin(ang)));
    const K = A.clone().add(kneeDir.clone().multiplyScalar(limb.l1));
    const T = A.clone().add(dir.clone().multiplyScalar(dist));
    const shinDir = T.clone().sub(K).normalize();
    const q1 = frameRot(limb.dir1, limb.pole, kneeDir, pp, new THREE.Quaternion());
    this.setWorld(limb.a, parentName, q1);
    // shin: keep pole consistent (knee axis) so the joint hinges
    const hingePole = pp.clone().sub(shinDir.clone().multiplyScalar(pp.dot(shinDir)));
    if (hingePole.lengthSq() < 1e-6) hingePole.copy(pp);
    const restPole2 = limb.pole.clone().sub(limb.dir2.clone().multiplyScalar(limb.pole.dot(limb.dir2)));
    const q2 = frameRot(limb.dir2, restPole2, shinDir, hingePole.normalize(), new THREE.Quaternion());
    this.setWorld(limb.b, limb.a, q2);
  }

  /** FK aim of a two-segment arm by directions (model space) */
  private aimArm(side: 'L' | 'R', upper: THREE.Vector3, fore: THREE.Vector3, pole: THREE.Vector3) {
    const limb = this.arms[side];
    const q1 = frameRot(limb.dir1, limb.pole, upper, pole.clone().sub(upper.clone().multiplyScalar(pole.dot(upper))), new THREE.Quaternion());
    this.setWorld(limb.a, 'clavicle.' + side, q1);
    const p2 = pole.clone().sub(fore.clone().multiplyScalar(pole.dot(fore)));
    const rp2 = limb.pole.clone().sub(limb.dir2.clone().multiplyScalar(limb.pole.dot(limb.dir2)));
    const q2 = frameRot(limb.dir2, rp2, fore, p2.lengthSq() > 1e-6 ? p2 : pole, new THREE.Quaternion());
    this.setWorld(limb.b, limb.a, q2);
  }

  private curlHand(side: 'L' | 'R', curl: number, thumb: number, indexCurl = curl) {
    const f1 = this.B['fingers1.' + side], f2 = this.B['fingers2.' + side], f3 = this.B['fingers3.' + side];
    const axis = this.curlAxis(side);
    f1.quaternion.setFromAxisAngle(axis, curl * 1.35);
    f2.quaternion.setFromAxisAngle(axis, curl * 1.65);
    f3.quaternion.setFromAxisAngle(axis, curl * 1.05);
    // index finger has its own chain so it can point
    const i1 = this.B['index1.' + side], i2 = this.B['index2.' + side], i3 = this.B['index3.' + side];
    if (i1) {
      i1.quaternion.setFromAxisAngle(axis, indexCurl * 1.3);
      i2.quaternion.setFromAxisAngle(axis, indexCurl * 1.6);
      i3.quaternion.setFromAxisAngle(axis, indexCurl * 1.0);
    }
    // thumb: opposition (swing under the palm) + curl of the distal segment
    const t1 = this.B['thumb1.' + side], t2 = this.B['thumb2.' + side];
    const fd = this.axisCache['f' + side];
    const ta = this.thumbAxis(side);
    _q.setFromAxisAngle(fd, (side === 'L' ? -1 : 1) * thumb * 0.5);
    t1.quaternion.setFromAxisAngle(ta, thumb * 0.35).premultiply(_q);
    t2.quaternion.setFromAxisAngle(ta, thumb * 0.8);
  }
  /** grip point (bind space, relative to the hand joint): in front of the palm where curled fingers close */
  gripOffset(side: 'L' | 'R') {
    this.curlAxis(side);
    const fd = this.axisCache['f' + side], axis = this.axisCache['c' + side];
    const palmDir = V().crossVectors(axis, fd).normalize();
    const len = this.R['fingers1.' + side].distanceTo(this.R['hand.' + side]);
    return fd.clone().multiplyScalar(len * 1.05).addScaledVector(palmDir, 0.028);
  }
  private axisCache: Record<string, THREE.Vector3> = {};
  private curlAxis(side: 'L' | 'R') {
    const k = 'c' + side;
    if (!this.axisCache[k]) {
      const fd = this.R['fingers2.' + side].clone().sub(this.R['fingers1.' + side]).normalize();
      const th = this.R['thumb2.' + side].clone().sub(this.R['hand.' + side]);
      const pa = this.R['fingers1.' + side].clone().sub(this.R['hand.' + side]).normalize();
      // palm normal: perpendicular to finger dir, on the side away from which fingers curl (thumb side gives handedness)
      const across = th.clone().sub(pa.clone().multiplyScalar(th.dot(pa))).normalize();
      const palm = V().crossVectors(pa, across).multiplyScalar(side === 'L' ? 1 : -1).normalize();
      // fingers curl toward -palm... axis = palm x fd
      this.axisCache[k] = V().crossVectors(fd, palm).normalize();
      this.axisCache['f' + side] = fd;
      this.axisCache['p' + side] = palm;
      this.axisCache['t' + side] = V().crossVectors(th.clone().normalize(), palm).normalize();
    }
    return this.axisCache[k];
  }
  private thumbAxis(side: 'L' | 'R') { this.curlAxis(side); return this.axisCache['t' + side]; }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const act = this.act;
    let at = 0;
    if (act) {
      act.t += dt;
      at = Math.min(1, act.t / act.dur);
      if (!act.fired && act.contact > 0 && at >= act.contact) { act.fired = true; act.onContact?.(); }
      if (act.t >= act.dur) {
        if (act.hold) { this.held = act.name; this.heldT = 0; }
        if (!act.fired && act.contact > 0) act.onContact?.();
        this.act = null;
        act.onDone?.();
      }
    }
    if (this.held) this.heldT += dt;
    const name = this.act?.name ?? this.held;
    const T = this.act ? at : 1;

    // locomotion parameters
    const sp = this.reducedMotion ? Math.min(this.speed, 6) : this.speed;
    const target = Math.min(1, sp / 0.6);
    this.moveBlend += (target - this.moveBlend) * Math.min(1, dt * 8);
    this.runBlend += (smooth(2.4, 4.5, sp) - this.runBlend) * Math.min(1, dt * 5);
    const mv = this.moveBlend, run = this.runBlend;
    const stepLen = lerp(lerp(0.62, 0.9, smooth(0.5, 2.5, sp)), 1.25, run) * (this.L.height / 1.7);
    this.phase = (this.phase + (dt * Math.max(sp, 0.001)) / (2 * stepLen)) % 1;
    const ph = this.phase;

    // turning lean (from root yaw rate)
    const root = this.rig.root.parent!;
    root.updateMatrixWorld(true);
    const e = new THREE.Euler().setFromQuaternion(root.getWorldQuaternion(_q), 'YXZ');
    if (this.yawPrev != null && dt > 0) {
      let dy = e.y - this.yawPrev;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const rate = THREE.MathUtils.clamp(dy / dt, -6, 6);
      this.turnLean += (rate * 0.03 * mv * (0.5 + run) - this.turnLean) * Math.min(1, dt * 6);
    }
    this.yawPrev = e.y;

    const breath = Math.sin(t * (Math.PI * 2) / 3.6);
    const idle = 1 - mv;
    // weight shift every ~6 s
    const shiftTarget = Math.sin(t * 0.17 + this.L.seed * 9) > 0 ? 1 : -1;
    this.shift += (shiftTarget * idle - this.shift) * Math.min(1, dt * 0.8);

    // ---------------- root / hips
    const hipsB = this.B.hips;
    const rootB = this.B.root;
    rootB.quaternion.identity();
    rootB.position.copy(this.R.root);
    const cyc = ph * Math.PI * 2;
    const bobWalk = -Math.cos(cyc * 2) * 0.022 * (1 - run);
    const bobRun = (Math.abs(Math.sin(cyc)) - 0.64) * 0.07 * run;
    let hipY = (bobWalk + bobRun) * mv - 0.012 * mv - 0.03 * run;
    let hipX = this.shift * 0.022 * idle;
    let hipZ = 0;
    let lean = mv * (0.05 + 0.26 * run) + this.L.hunch * 0.3;
    let twist = 0, roll = 0;
    let spineBend = this.L.hunch, spineTwist = 0, chestRoll = 0;
    let headPitch = -this.L.hunch * 0.8, headYaw = 0, headRoll = 0;
    let crouch = 0;
    // default arms (hang + swing)
    const armSwing = mv * lerp(0.35, 0.8, run);
    const upperL = V(), upperR = V(), foreL = V(), foreR = V();
    const hang = (side: number, swing: number, elbow: number, out: THREE.Vector3, fore: THREE.Vector3) => {
      const a = swing;
      out.set(side * (0.13 + 0.05 * run), -Math.cos(a), Math.sin(a)).normalize();
      const fb = elbow + Math.max(0, a) * 0.6;
      fore.set(side * 0.06, -Math.cos(a + fb), Math.sin(a + fb)).normalize();
    };
    const sw = Math.sin(cyc) * armSwing;
    hang(1, -sw + breath * 0.01, lerp(0.22, 1.35, run * mv) + idle * 0.05, upperL, foreL);
    hang(-1, sw + breath * 0.01, lerp(0.22, 1.35, run * mv) + idle * 0.05, upperR, foreR);
    let curlL = 0.24, curlR = 0.24, thumbL = 0.4, thumbR = 0.4;
    let pointR = -1;
    if (run > 0.3) { curlL = curlR = lerp(0.24, 0.8, run); thumbL = thumbR = lerp(0.15, 0.7, run); }
    twist = Math.sin(cyc) * 0.12 * mv;
    roll = Math.sin(cyc) * 0.05 * mv * (1 - run * 0.5) + this.shift * 0.06 * idle;
    spineTwist = -twist * 0.9;
    chestRoll = -roll * 0.5;
    headYaw = -twist * 0.3;
    let armIK: { L?: THREE.Vector3; R?: THREE.Vector3 } = {};
    let footPlant = true;
    let showChime = false;

    // ---------------- idle look-around
    if (idle > 0.5 && !name) {
      const la = Math.sin(t * 0.23 + this.L.seed * 20) * Math.sin(t * 0.11);
      headYaw += la * 0.22;
      headPitch += Math.sin(t * 0.19) * 0.05;
    }

    // ---------------- talking gesture (not a full action: overlay while talking)
    if (this.talking && !name) {
      const g = Math.sin(t * 1.3) * 0.5 + 0.5;
      upperR.set(-0.25, -0.95, 0.25).normalize();
      foreR.set(-0.15 - 0.2 * g, -0.25, 0.95).normalize();
      curlR = 0.15;
      headRoll = Math.sin(t * 1.7) * 0.05;
      headPitch += Math.sin(t * 2.3) * 0.03;
    }

    // ---------------- actions
    if (name === 'command') {
      const w = bell(0, 0.18, 0.8, 1, T);
      const ant = bell(0, 0.2, 0.3, 0.45, T);
      lean += 0.06 * w;
      spineTwist += 0.25 * w - 0.2 * ant;
      upperR.lerp(V(-0.35, 0.2 - 0.25 * ant, 0.9).normalize(), w).normalize();
      foreR.lerp(V(-0.25, 0.25, 0.95).normalize(), w).normalize();
      curlR = lerp(curlR, 0.95, w);
      thumbR = lerp(thumbR, 0.85, w);
      pointR = lerp(0.24, 0.02, w);
      upperL.lerp(V(0.35, -0.8, 0.1).normalize(), w * 0.5).normalize();
      headPitch += -0.06 * w;
    } else if (name === 'throw') {
      // wind-up (arm back, torso twists), release at 0.5, follow-through
      const up = bell(0.0, 0.3, 0.42, 0.52, T);
      const rel = bell(0.42, 0.52, 0.7, 1.0, T);
      showChime = T < 0.5;
      spineTwist += -0.45 * up + 0.4 * rel;
      lean += -0.05 * up + 0.14 * rel;
      hipX += 0;
      upperR.lerp(V(-0.55, 0.45, -0.7).normalize(), up).normalize();
      foreR.lerp(V(-0.1, 0.95, -0.2).normalize(), up).normalize();
      upperR.lerp(V(-0.15, -0.35, 0.92).normalize(), rel).normalize();
      foreR.lerp(V(0.05, -0.6, 0.8).normalize(), rel).normalize();
      upperL.lerp(V(0.45, 0.1, 0.85).normalize(), up).normalize();
      foreL.lerp(V(0.2, 0.2, 0.95).normalize(), up).normalize();
      curlR = lerp(curlR, showChime ? 0.65 : 0.2, Math.max(up, rel));
      headYaw += 0.2 * up;
    } else if (name === 'victory') {
      // anticipation dip -> jump-ish fist pump, then held pose with the Chime raised
      const k = this.act ? T : 1;
      const dip = bell(0, 0.12, 0.18, 0.3, k);
      const pump = smooth(0.18, 0.34, k);
      const bounce = this.act ? Math.max(0, Math.sin(Math.min(1, (k - 0.18) / 0.3) * Math.PI)) * 0.06 : 0;
      const hold = this.held ? Math.sin(this.heldT * 2.2) * 0.012 : 0;
      crouch += 0.07 * dip;
      hipY += bounce + hold;
      showChime = true;
      lean += -0.05 * pump;
      spineBend -= 0.08 * pump;
      upperR.lerp(V(-0.22, 0.97, 0.1).normalize(), pump).normalize();
      foreR.lerp(V(0.05, 0.99, 0.05).normalize(), pump).normalize();
      curlR = lerp(curlR, 0.75, pump);
      thumbR = lerp(thumbR, 0.8, pump);
      upperL.lerp(V(0.45, -0.85, 0.2).normalize(), pump).normalize();
      foreL.lerp(V(-0.3, 0.1, 0.95).normalize(), pump).normalize();
      curlL = lerp(curlL, 0.95, pump);
      thumbL = lerp(thumbL, 0.9, pump);
      headPitch += -0.18 * pump;
      headRoll += 0.06 * pump;
    } else if (name === 'happy' || name === 'wave') {
      const w = bell(0, 0.15, 0.8, 1, T);
      upperR.lerp(V(-0.55, 0.75, 0.2).normalize(), w).normalize();
      foreR.lerp(V(-0.05 + Math.sin(T * 25) * 0.35, 0.95, 0.1).normalize(), w).normalize();
      curlR = lerp(curlR, 0.05, w);
      thumbR = lerp(thumbR, 0.1, w);
      headRoll += 0.08 * w;
    } else if (name === 'hurt') {
      const w = bell(0, 0.08, 0.5, 1, T);
      lean += -0.18 * w; hipZ -= 0.05 * w;
      spineBend -= 0.1 * w;
      headPitch += 0.15 * w; headYaw += 0.2 * w;
      upperR.lerp(V(-0.4, -0.2, 0.85).normalize(), w).normalize();
      foreR.lerp(V(0.3, 0.6, 0.6).normalize(), w).normalize();
      upperL.lerp(V(0.4, -0.3, 0.8).normalize(), w * 0.7).normalize();
      foreL.lerp(V(-0.3, 0.5, 0.7).normalize(), w * 0.7).normalize();
      crouch += 0.05 * w;
    } else if (name === 'lose') {
      const k = this.act ? T : 1;
      const w = smooth(0, 0.7, k);
      crouch += 0.36 * w;
      lean += 0.28 * w;
      spineBend += 0.35 * w;
      headPitch += 0.45 * w;
      upperL.lerp(V(0.2, -0.9, 0.35).normalize(), w).normalize();
      foreL.lerp(V(0.0, -0.8, 0.6).normalize(), w).normalize();
      upperR.lerp(V(-0.2, -0.9, 0.35).normalize(), w).normalize();
      foreR.lerp(V(0.0, -0.8, 0.6).normalize(), w).normalize();
      curlL = curlR = lerp(0.24, 0.6, w);
      footPlant = true;
    } else if (name === 'talk') {
      const w = bell(0, 0.15, 0.85, 1, T);
      upperR.lerp(V(-0.3, -0.9, 0.3).normalize(), w).normalize();
      foreR.lerp(V(-0.35, 0.1, 0.93).normalize(), w).normalize();
      curlR = lerp(curlR, 0.1, w);
    }
    if (this.reducedMotion) { crouch *= 0.5; }

    hipY -= crouch * this.hipH * 0.9 + 0.004 * breath * idle;
    hipY += this.L.soleLift;
    hipsB.position.set(this.R.hips.x - this.R.root.x + hipX, this.R.hips.y - this.R.root.y + hipY, this.R.hips.z - this.R.root.z + hipZ);
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.6, twist, roll + this.turnLean * 0.3, 'YXZ'));
    this.setWorld('root', null, _q.identity());
    this.setWorld('hips', 'root', hq);
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.25 + spineBend * 0.5 + breath * 0.01 * idle, spineTwist * 0.5, -roll * 0.5 + this.turnLean, 'YXZ'));
    this.setWorld('spine', 'hips', hq.clone().multiply(sq));
    const cq = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.15 + spineBend * 0.5 - breath * 0.012 * idle, spineTwist * 0.5, chestRoll, 'YXZ'));
    this.setWorld('chest', 'spine', this.worldQ.spine.clone().multiply(cq));
    // neck/head: stabilise toward upright, add look
    const chestE = new THREE.Euler().setFromQuaternion(this.worldQ.chest, 'YXZ');
    const nq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-chestE.x * 0.4 + headPitch * 0.4, headYaw * 0.4, -chestE.z * 0.4 + headRoll * 0.4, 'YXZ'));
    this.setWorld('neck', 'chest', this.worldQ.chest.clone().multiply(nq));
    const hdq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-chestE.x * 0.4 + headPitch * 0.6, headYaw * 0.6, -chestE.z * 0.3 + headRoll * 0.6, 'YXZ'));
    this.setWorld('head', 'neck', this.worldQ.neck.clone().multiply(hdq));

    // ---------------- legs (IK)
    this.rig.root.updateMatrixWorld(true);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), twist * 0.3);
    for (const side of ['L', 'R'] as const) {
      const limb = this.legs[side];
      const s = side === 'L' ? 1 : -1;
      const off = side === 'L' ? 0 : 0.5;
      const p = (ph + off) % 1;
      const restFoot = this.R['foot.' + side];
      const footX = restFoot.x * 0.78 + s * 0.012 * run;
      const target = V(footX, restFoot.y + this.L.soleLift, restFoot.z);
      let pitch = 0;
      if (mv > 0.01 && footPlant) {
        const duty = lerp(0.6, 0.36, run);
        const S = stepLen;
        let z, y;
        if (p < duty) {
          const k = p / duty;
          z = lerp(S * 0.5, -S * 0.5, k);
          y = 0;
          pitch = lerp(-0.12, 0.05, k) * (1 - run) + (k > 0.7 ? (k - 0.7) * 1.2 : 0);
        } else {
          const k = (p - duty) / (1 - duty);
          z = lerp(-S * 0.5, S * 0.5, smooth(0, 1, k));
          y = Math.sin(k * Math.PI) * lerp(0.07, 0.2, run) + run * Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.12;
          pitch = lerp(0.5, -0.2, k) * (0.6 + run * 0.6);
        }
        target.z += z * mv;
        target.y += y * mv;
        pitch *= mv;
        // lift the pelvis side of the planted foot a hair
      } else {
        target.x += (side === 'L' ? 1 : -1) * 0.01 + this.shift * 0.01;
        target.y += 0;
      }
      if (crouch > 0.2 && name === 'lose') {
        // kneel: right knee down, left foot forward
        if (side === 'R') { target.z -= 0.22 * crouch; target.y += 0.05 * crouch; pitch = 0.9 * crouch; }
        else { target.z += 0.12 * crouch; }
      }
      const pole = V(s * 0.08, 0, 1).applyQuaternion(this.worldQ.hips).normalize();
      this.ik(limb, 'hips', target, pole);
      const fq = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch));
      this.setWorld('foot.' + side, 'lowerLeg.' + side, fq);
      this.setWorld('toes.' + side, 'foot.' + side, fq.clone().multiply(_q2.setFromAxisAngle(V(1, 0, 0), -Math.max(0, pitch) * 0.6)));
    }

    // ---------------- arms
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1;
      const cl = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * (breath * 0.01 * idle)));
      this.setWorld('clavicle.' + side, 'chest', this.worldQ.chest.clone().multiply(cl));
      const up = side === 'L' ? upperL : upperR, fo = side === 'L' ? foreL : foreR;
      // express arm directions relative to the chest orientation
      const cq2 = this.worldQ.chest;
      const u = up.clone().applyQuaternion(cq2), f = fo.clone().applyQuaternion(cq2);
      const pole = V(s * 0.3, 0, -1).applyQuaternion(cq2).normalize();
      if (armIK[side]) this.ik(this.arms[side], 'clavicle.' + side, armIK[side]!, pole);
      else this.aimArm(side, u, f, pole);
      // hand follows forearm (relaxed wrist)
      const hq2 = this.worldQ['foreArm.' + side].clone().multiply(_q2.setFromEuler(new THREE.Euler(0, 0, -s * 0.12)));
      this.setWorld('hand.' + side, 'foreArm.' + side, hq2);
      this.curlHand(side, side === 'L' ? curlL : curlR, side === 'L' ? thumbL : thumbR, side === 'R' && pointR >= 0 ? pointR : undefined);
    }
    if (this.props.chime) this.props.chime.visible = showChime;

    // ---------------- face
    this.updateFace(dt, name);
  }

  private updateFace(dt: number, name: HumanAction | null) {
    if (!this.morpher) return;
    if (this.exprFlash) { this.exprFlash.t -= dt; if (this.exprFlash.t <= 0) this.exprFlash = null; }
    const e = this.exprFlash?.e ?? (name === 'lose' ? 'sad' : this.expr);
    const target: Record<string, number> = { ...EXPR[e] };
    // resting face: lips closed, eyes a touch more open, faint pleasant mouth corners
    for (const [k, v] of Object.entries(BASE_FACE)) target[k] = (target[k] ?? 0) + v * (e === 'faint' ? 0 : 1);
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkPhase < 0) { this.blinkPhase = 0; this.blinkT = 1.8 + Math.random() * 4; }
    let blink = 0;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16;
      blink = this.blinkPhase < 0.5 ? this.blinkPhase * 2 : Math.max(0, 2 - this.blinkPhase * 2);
      if (this.blinkPhase >= 1) this.blinkPhase = -1;
    }
    // talk mouth
    if (this.talking) {
      this.talkT += dt;
      const s = this.talkT;
      const open = Math.max(0, Math.sin(s * 13) * 0.5 + Math.sin(s * 7.3) * 0.35 + 0.15);
      target.jawOpen = (target.jawOpen ?? 0) + open * 0.45;
      target.kiss = (target.kiss ?? 0) + Math.max(0, Math.sin(s * 4.1)) * 0.25;
      target.wide = (target.wide ?? 0) + Math.max(0, Math.sin(s * 5.7 + 1)) * 0.15;
    }
    const names = this.d.morphs;
    const W = this.morpher.weights;
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      const tv = target[n] ?? 0;
      const cur = this.faceW[n] ?? 0;
      const nv = cur + (tv - cur) * (n === 'jawOpen' && this.talking ? Math.min(1, dt * 30) : k);
      this.faceW[n] = nv;
      W[i] = nv;
    }
    const bi = names.indexOf('blink');
    W[bi] = Math.min(1, W[bi] + blink * (1 - W[bi]));
    this.morpher.apply();
    // eyes: saccades toward a slowly wandering target
    this.sacc -= dt;
    if (this.sacc <= 0) {
      this.sacc = 0.6 + Math.random() * 2.2;
      this.lookTarget.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.18, 1).normalize();
    }
    this.look.lerp(this.lookTarget, Math.min(1, dt * 25));
    const eq = _q.setFromUnitVectors(V(0, 0, 1), this.look);
    this.B['eye.L'].quaternion.copy(eq);
    this.B['eye.R'].quaternion.copy(eq);
  }
}
void _v; void _v2; void _v3;
