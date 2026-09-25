// Real-geometry creature eyes (DECISIONS D31): an eyeball with a painted sclera / gradient iris / pupil texture and
// a glossy cornea, set into the sculpted head, plus upper and lower eyelid shells in the skin colour with a dark lash
// line. Expressions (face.ts FACE_STATES) are lid poses: coverage of the upper and lower lid, lid tilt (inner corner up
// or down) and iris scale. Lids ease toward their targets, so blinks and expression changes are smooth.
import * as THREE from 'three';
import type { Quality } from './primitives';
import type { EyeSpec, FaceState } from './face';

export interface LidPose { up: number; lo: number; tilt: number; iris: number }

/** per eye-shape resting lids (coverage 0..1 of the visible eyeball; tilt deg, + = inner corner up) */
function restPose(e: EyeSpec): LidPose {
  const lid = e.lid ?? 0;
  const tilt = e.lidAngle ?? 0;
  switch (e.shape) {
    case 'almond': return { up: Math.max(0.16, lid), lo: 0.14, tilt, iris: 1 };
    case 'long-almond': return { up: Math.max(0.24, lid), lo: 0.2, tilt, iris: 1 };
    case 'droopy': case 'teardrop': return { up: Math.max(0.22, lid), lo: 0.06, tilt: tilt + 8, iris: 1 };
    case 'halfmoon': return { up: Math.max(0.4, lid), lo: 0.04, tilt, iris: 1 };
    case 'keystone': return { up: Math.max(0.14, lid), lo: 0.16, tilt, iris: 1 };
    default: return { up: Math.max(0.1, lid * 0.8), lo: 0.06, tilt, iris: 1 };
  }
}

export function poseFor(state: FaceState, rest: LidPose): LidPose {
  switch (state) {
    case 'half': return { up: Math.max(rest.up, 0.5), lo: rest.lo, tilt: rest.tilt, iris: 1 };
    case 'closed': return { up: 0.6, lo: 0.42, tilt: rest.tilt * 0.3, iris: 1 };
    case 'happy': return { up: Math.min(rest.up, 0.18), lo: 0.64, tilt: -4, iris: 1 };
    case 'hurt': return { up: 0.58, lo: 0.46, tilt: 16, iris: 0.9 };
    case 'faint': return { up: 0.62, lo: 0.4, tilt: -8, iris: 1 };
    case 'determined': return { up: Math.max(rest.up, 0.3), lo: Math.max(rest.lo, 0.2), tilt: -18, iris: 1 };
    case 'surprised': return { up: 0, lo: 0, tilt: 0, iris: 0.78 };
    default: return { ...rest };
  }
}

const texCache = new Map<string, THREE.Texture>();

function paintEye(e: EyeSpec, size: number): THREE.Texture {
  const key = JSON.stringify(e) + size;
  const hit = texCache.get(key);
  if (hit) return hit;
  let tex: THREE.Texture;
  if (typeof document === 'undefined') {
    tex = new THREE.DataTexture(new Uint8Array([240, 236, 228, 255]), 1, 1);
  } else {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    const c = size / 2;
    // sclera with soft edge shading (the eyeball's own ambient occlusion)
    const sclera = e.sclera ?? '#F7F3EA';
    const sg = g.createRadialGradient(c, c * 0.92, size * 0.1, c, c, size * 0.5);
    const sc = new THREE.Color(sclera);
    sg.addColorStop(0, '#' + sc.clone().offsetHSL(0, 0, 0.03).getHexString());
    sg.addColorStop(0.72, sclera);
    sg.addColorStop(1, '#' + sc.clone().lerp(new THREE.Color('#6d6272'), 0.35).getHexString());
    g.fillStyle = sg;
    g.fillRect(0, 0, size, size);
    // iris: vertical gradient + radial fibres + limbal ring
    const ir = size * 0.5 * 0.92 * (e.irisRatio ?? 0.62);
    const icol = new THREE.Color(e.iris);
    const light = '#' + icol.clone().offsetHSL(0, 0.05, 0.18).getHexString();
    const dark = '#' + icol.clone().offsetHSL(0, 0, -0.2).getHexString();
    const ig = g.createLinearGradient(0, c - ir, 0, c + ir);
    ig.addColorStop(0, dark);
    ig.addColorStop(0.45, e.iris);
    ig.addColorStop(1, light);
    g.fillStyle = ig;
    g.beginPath();
    g.arc(c, c, ir, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(c, c, ir, 0, Math.PI * 2);
    g.clip();
    g.globalAlpha = 0.22;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05;
      g.strokeStyle = i % 2 ? light : dark;
      g.lineWidth = size * 0.006;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * ir * 0.3, c + Math.sin(a) * ir * 0.3);
      g.lineTo(c + Math.cos(a) * ir * 0.95, c + Math.sin(a) * ir * 0.95);
      g.stroke();
    }
    g.globalAlpha = 1;
    const lg = g.createRadialGradient(c, c, ir * 0.72, c, c, ir);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(10,8,20,0.75)');
    g.fillStyle = lg;
    g.fillRect(0, 0, size, size);
    g.restore();
    // pupil
    const pr = ir * (e.pupilRatio ?? 0.45);
    g.fillStyle = '#0c0a12';
    g.beginPath();
    switch (e.pupil) {
      case 'v-oval': g.ellipse(c, c, pr * 0.62, pr * 1.18, 0, 0, Math.PI * 2); break;
      case 'slit': g.ellipse(c, c, pr * 0.3, pr * 1.3, 0, 0, Math.PI * 2); break;
      case 'h-bar': g.ellipse(c, c, pr * 1.35, pr * 0.46, 0, 0, Math.PI * 2); break;
      case 'ring': g.arc(c, c, pr, 0, Math.PI * 2); g.arc(c, c, pr * 0.5, 0, Math.PI * 2, true); break;
      case 'none': break;
      default: g.arc(c, c, pr, 0, Math.PI * 2);
    }
    g.fill('evenodd');
    // painted catch-lights (stylised key light upper-left) — the cornea adds a real specular on top
    const hl = e.highlights ?? 2;
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath();
    g.ellipse(c - ir * 0.36, c - ir * 0.4, ir * 0.24, ir * 0.18, -0.5, 0, Math.PI * 2);
    g.fill();
    if (hl >= 2) {
      g.beginPath();
      g.arc(c + ir * 0.34, c + ir * 0.36, ir * 0.09, 0, Math.PI * 2);
      g.fill();
    }
    if (hl >= 3) {
      g.beginPath();
      g.arc(c - ir * 0.02, c - ir * 0.62, ir * 0.06, 0, Math.PI * 2);
      g.fill();
    }
    tex = new THREE.CanvasTexture(cv);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/** Sphere with poles on Z and a planar front projection (the painted iris faces +Z). */
function eyeballGeometry(R: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, seg, Math.max(6, Math.floor(seg * 0.7)));
  g.rotateX(Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z > 0) uv.setXY(i, 0.5 + (x / R) * 0.5, 0.5 + (y / R) * 0.5);
    else {
      const l = Math.hypot(x, y) || 1;
      uv.setXY(i, 0.5 + (x / l) * 0.5, 0.5 + (y / l) * 0.5);
    }
  }
  // flip V so canvas top is up
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

function lidGeometry(R: number, upper: boolean, seg: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, seg, Math.max(4, Math.floor(seg / 3)), 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2);
  return g;
}

const ALPHA = (62 * Math.PI) / 180; // half-angle of the visible eyeball cap

export interface EyeBuild {
  group: THREE.Group;       // placed on the eye node
  eye: Eye3D;
  tris: number;
  geoms: THREE.BufferGeometry[];
  mats: THREE.Material[];
  texs: THREE.Texture[];
}

export class Eye3D {
  cur: LidPose;
  target: LidPose;
  rest: LidPose;
  constructor(
    private lidRoll: THREE.Object3D,
    private upper: THREE.Object3D,
    private lower: THREE.Object3D,
    private tex: THREE.Texture | null,
    private side: 1 | -1,
    rest: LidPose,
  ) {
    this.rest = rest;
    this.cur = { ...rest };
    this.target = { ...rest };
    this.apply();
  }
  setTarget(p: LidPose, snap = false) {
    this.target = p;
    if (snap) {
      this.cur = { ...p };
      this.apply();
    }
  }
  update(dt: number) {
    const k = 1 - Math.exp(-dt * 40);
    const c = this.cur, t = this.target;
    c.up += (t.up - c.up) * k;
    c.lo += (t.lo - c.lo) * k;
    c.tilt += (t.tilt - c.tilt) * Math.min(1, k * 0.8);
    c.iris += (t.iris - c.iris) * k;
    this.apply();
  }
  private apply() {
    const c = this.cur;
    const eu = ALPHA - c.up * 2 * ALPHA;
    const el = -ALPHA + c.lo * 2 * ALPHA;
    this.upper.rotation.x = -eu;
    this.lower.rotation.x = -el;
    // L eye (+X) has its inner corner toward -X: raising it is a negative roll; mirrored for R
    this.lidRoll.rotation.z = ((-c.tilt * Math.PI) / 180) * this.side;
    if (this.tex) {
      const s = c.iris;
      this.tex.repeat.set(1 / s, 1 / s);
      this.tex.offset.set(0.5 - 0.5 / s, 0.5 - 0.5 / s);
    }
  }
}

export interface EyeBuildOpts {
  R: number;                 // eyeball radius (metres)
  spec: EyeSpec;
  skin: string;              // lid colour
  quality: Quality;
  lod: 0 | 1 | 2;
  side: 1 | -1;
  /** gaze direction in the eye node's local frame (unit) */
  gaze: THREE.Vector3;
  /** eyeball centre in the eye node's local frame */
  centre: THREE.Vector3;
  rimColor: THREE.Color;
}

export function buildEye(o: EyeBuildOpts): EyeBuild {
  const seg = o.lod === 2 ? 10 : o.quality === 'mobile' ? 14 : o.lod === 1 ? 16 : 22;
  const group = new THREE.Group();
  group.name = 'eye3d';
  group.position.copy(o.centre);
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  let tris = 0;
  // eyeball
  const tex = paintEye(o.spec, o.quality === 'mobile' ? 128 : 256).clone();
  tex.needsUpdate = true;
  const glow = o.spec.glow;
  const ballMat = o.quality === 'high'
    ? new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06, emissive: new THREE.Color(glow ?? '#ffffff'), emissiveMap: tex, emissiveIntensity: glow ? 0.9 : 0.16 })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, emissive: new THREE.Color(glow ?? '#ffffff'), emissiveMap: tex, emissiveIntensity: glow ? 0.9 : 0.2 });
  mats.push(ballMat);
  const ballGeo = eyeballGeometry(o.R, seg);
  geoms.push(ballGeo);
  const aim = new THREE.Group();
  aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), o.gaze.clone().normalize());
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.name = 'eyeball';
  aim.add(ball);
  group.add(aim);
  tris += ballGeo.index!.count / 3;
  // lids (aligned with the eye node frame, not the gaze, so the lid line stays level)
  const lidRoll = new THREE.Group();
  lidRoll.name = 'lids';
  group.add(lidRoll);
  const lidMat = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.7, side: THREE.DoubleSide });
  mats.push(lidMat);
  const lr = o.R * 1.075;
  const up = new THREE.Group();
  const lo = new THREE.Group();
  lidRoll.add(up, lo);
  const lseg = Math.max(10, Math.floor(seg * 0.9));
  const ug = lidGeometry(lr, true, lseg);
  const lg = lidGeometry(lr * 0.995, false, lseg);
  geoms.push(ug, lg);
  up.add(new THREE.Mesh(ug, lidMat));
  lo.add(new THREE.Mesh(lg, lidMat));
  tris += (ug.index!.count + lg.index!.count) / 3;
  if (o.lod < 2) {
    // lash / lid-edge lines (front half of the rim circle)
    const outline = new THREE.Color(o.spec.outline ?? '#1B1B22');
    const lashMat = new THREE.MeshStandardMaterial({ color: outline, roughness: 0.6, emissive: outline, emissiveIntensity: o.spec.outline ? 0.25 : 0 });
    mats.push(lashMat);
    const mk = (thick: number) => {
      const t = new THREE.TorusGeometry(lr * 1.003, thick, 5, Math.max(12, lseg), Math.PI);
      t.rotateX(Math.PI / 2);
      t.rotateY(0);
      geoms.push(t);
      tris += t.index!.count / 3;
      return t;
    };
    up.add(new THREE.Mesh(mk(o.R * 0.045), lashMat));
    lo.add(new THREE.Mesh(mk(o.R * 0.022), lashMat));
  }
  for (const m of [up, lo]) m.traverse((x) => { if ((x as THREE.Mesh).isMesh) (x as THREE.Mesh).castShadow = false; });
  ball.castShadow = false;
  const eye = new Eye3D(lidRoll, up, lo, tex, o.side, restPose(o.spec));
  return { group, eye, tris, geoms, mats, texs: [tex] };
}
