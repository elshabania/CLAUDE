// Canvas-painted eye/mouth atlases with 8 emotion states (creative_direction §5.2, rendering §4.4).
import * as THREE from 'three';
import type { Quality } from './primitives';

export type FaceState = 'open' | 'half' | 'closed' | 'happy' | 'hurt' | 'faint' | 'determined' | 'surprised';
export const FACE_STATES: FaceState[] = ['open', 'half', 'closed', 'happy', 'hurt', 'faint', 'determined', 'surprised'];
export type MouthState = 'neutral' | 'open' | 'smile' | 'grimace';
export const MOUTH_STATES: MouthState[] = ['neutral', 'open', 'smile', 'grimace'];

export interface EyeSpec {
  shape: 'round' | 'almond' | 'long-almond' | 'droopy' | 'teardrop' | 'halfmoon' | 'keystone' | 'hole';
  sclera?: string;        // default #F7F3EA
  iris: string;
  irisRatio?: number;     // 0..1 of eye width
  pupil: 'round' | 'v-oval' | 'slit' | 'h-bar' | 'ring' | 'none';
  pupilRatio?: number;    // of iris
  highlights?: number;    // 1..3
  lid?: number;           // resting lid coverage 0..0.6
  lidAngle?: number;      // deg, + inner corner up
  glow?: string;          // emissive iris (lumen/shade/f09 eye holes)
  outline?: string;
}

export interface MouthSpec {
  style: 'smile' | 'beak' | 'fang' | 'line' | 'o' | 'none';
  color?: string;          // line colour
  inner?: string;          // mouth interior
}

function hasCanvas() {
  return typeof document !== 'undefined' && !!document.createElement;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (!hasCanvas()) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function eyePath(ctx: CanvasRenderingContext2D, shape: EyeSpec['shape'], cx: number, cy: number, r: number) {
  ctx.beginPath();
  switch (shape) {
    case 'almond':
    case 'long-almond': {
      const w = shape === 'long-almond' ? r * 1.0 : r * 0.95;
      const h = shape === 'long-almond' ? r * 0.62 : r * 0.78;
      ctx.moveTo(cx - w, cy + h * 0.12);
      ctx.quadraticCurveTo(cx - w * 0.2, cy - h * 1.25, cx + w, cy - h * 0.12);
      ctx.quadraticCurveTo(cx + w * 0.2, cy + h * 1.25, cx - w, cy + h * 0.12);
      break;
    }
    case 'droopy':
    case 'teardrop':
      ctx.moveTo(cx - r * 0.9, cy - r * 0.1);
      ctx.bezierCurveTo(cx - r * 0.9, cy - r * 1.1, cx + r * 0.9, cy - r * 1.1, cx + r * 0.9, cy - r * 0.1);
      ctx.bezierCurveTo(cx + r * 0.9, cy + r * 0.8, cx + r * 0.1, cy + r * 1.0, cx - r * 0.3, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 0.8, cy + r * 0.7, cx - r * 0.9, cy + r * 0.4, cx - r * 0.9, cy - r * 0.1);
      break;
    case 'halfmoon':
      ctx.moveTo(cx - r * 0.95, cy - r * 0.25);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.25);
      ctx.bezierCurveTo(cx + r * 0.95, cy + r * 1.05, cx - r * 0.95, cy + r * 1.05, cx - r * 0.95, cy - r * 0.25);
      break;
    case 'keystone':
      ctx.moveTo(cx - r * 0.95, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.8);
      ctx.quadraticCurveTo(cx + r * 0.9, cy + r * 0.9, cx, cy + r * 0.9);
      ctx.quadraticCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r * 0.95, cy - r * 0.8);
      break;
    default:
      ctx.ellipse(cx, cy, r * 0.92, r * 0.96, 0, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function drawEyeCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, size: number, e: EyeSpec, state: FaceState) {
  const pad = Math.max(4, size * 0.03);
  const cx = ox + size / 2;
  const cy = oy + size / 2;
  const r = size / 2 - pad - size * 0.04;
  const outline = e.outline ?? '#1B1B22';
  const lw = Math.max(2, size * 0.035);
  ctx.save();
  // skin backdrop (transparent) — closed states draw arcs only
  if (state === 'closed' || state === 'happy' || state === 'faint' || state === 'hurt') {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (state === 'closed') {
      ctx.moveTo(cx - r * 0.8, cy + r * 0.05);
      ctx.quadraticCurveTo(cx, cy + r * 0.35, cx + r * 0.8, cy + r * 0.05);
    } else if (state === 'happy') {
      ctx.moveTo(cx - r * 0.75, cy + r * 0.25);
      ctx.quadraticCurveTo(cx, cy - r * 0.55, cx + r * 0.75, cy + r * 0.25);
    } else if (state === 'faint') {
      ctx.moveTo(cx - r * 0.75, cy - r * 0.1);
      ctx.quadraticCurveTo(cx, cy + r * 0.5, cx + r * 0.75, cy - r * 0.1);
      ctx.moveTo(cx - r * 0.55, cy + r * 0.45);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.6);
    } else {
      // hurt: squeezed wedges > <
      ctx.moveTo(cx - r * 0.7, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.35, cy);
      ctx.lineTo(cx - r * 0.7, cy + r * 0.45);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const open = state === 'surprised' ? 1.08 : 1;
  const rr = r * open;
  // clip to eye shape
  eyePath(ctx, e.shape, cx, cy, rr);
  ctx.save();
  ctx.clip();
  if (e.shape === 'hole') {
    ctx.fillStyle = '#0B0A10';
    ctx.fillRect(ox, oy, size, size);
  } else {
    ctx.fillStyle = e.sclera ?? '#F7F3EA';
    ctx.fillRect(ox, oy, size, size);
  }
  // iris
  const irisR = rr * (e.irisRatio ?? 0.62) * (e.shape === 'hole' ? 0.7 : 1);
  const icx = cx + rr * 0.02;
  const icy = cy + rr * 0.04;
  const g = ctx.createRadialGradient(icx - irisR * 0.2, icy - irisR * 0.25, irisR * 0.1, icx, icy, irisR);
  const irisCol = new THREE.Color(e.iris);
  g.addColorStop(0, '#' + irisCol.clone().offsetHSL(0, 0, 0.12).getHexString());
  g.addColorStop(0.75, e.iris);
  g.addColorStop(1, '#' + irisCol.clone().offsetHSL(0, 0, -0.18).getHexString());
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(icx, icy, irisR, irisR * (e.shape === 'long-almond' ? 0.95 : 1), 0, 0, Math.PI * 2);
  ctx.fill();
  // pupil
  const pr = irisR * (e.pupilRatio ?? 0.45) * (state === 'surprised' ? 0.8 : 1);
  ctx.fillStyle = '#111018';
  ctx.beginPath();
  switch (e.pupil) {
    case 'v-oval':
      ctx.ellipse(icx, icy, pr * 0.62, pr * 1.2, 0, 0, Math.PI * 2);
      break;
    case 'slit':
      ctx.ellipse(icx, icy, pr * 0.28, pr * 1.3, 0, 0, Math.PI * 2);
      break;
    case 'h-bar':
      ctx.ellipse(icx, icy, pr * 1.3, pr * 0.45, 0, 0, Math.PI * 2);
      break;
    case 'ring':
      ctx.arc(icx, icy, pr, 0, Math.PI * 2);
      ctx.arc(icx, icy, pr * 0.5, 0, Math.PI * 2, true);
      break;
    case 'none':
      break;
    default:
      ctx.arc(icx, icy, pr, 0, Math.PI * 2);
  }
  ctx.fill('evenodd');
  // upper lid shadow
  ctx.fillStyle = 'rgba(20,16,30,0.12)';
  ctx.fillRect(ox, cy - rr, size, rr * 0.35);
  // lids: resting lid + state lids
  let lid = e.lid ?? 0;
  let lidAngle = e.lidAngle ?? 0;
  if (state === 'half') lid = Math.max(lid, 0.55);
  if (state === 'determined') {
    lid = Math.max(lid, 0.22);
    lidAngle = Math.min(lidAngle, -14);
  }
  if (state === 'surprised') lid = 0;
  if (lid > 0) {
    ctx.fillStyle = '#' + new THREE.Color(e.outline ?? '#1B1B22').getHexString();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-lidAngle * Math.PI) / 180);
    ctx.fillStyle = 'rgba(40,30,45,0.92)';
    ctx.fillRect(-size, -size, size * 2, size - rr + lid * 2 * rr);
    ctx.restore();
  }
  // highlights (upper-left key light)
  const hl = state === 'surprised' ? 0.8 : 1;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(icx - irisR * 0.38, icy - irisR * 0.42, irisR * 0.22 * hl, irisR * 0.17 * hl, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if ((e.highlights ?? 2) >= 2) {
    ctx.beginPath();
    ctx.arc(icx + irisR * 0.35, icy + irisR * 0.38, irisR * 0.08 * hl, 0, Math.PI * 2);
    ctx.fill();
  }
  if ((e.highlights ?? 2) >= 3) {
    ctx.beginPath();
    ctx.arc(icx - irisR * 0.05, icy - irisR * 0.62, irisR * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // outline
  eyePath(ctx, e.shape, cx, cy, rr);
  ctx.strokeStyle = outline;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

function drawMouthCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, size: number, m: MouthSpec, state: MouthState) {
  const cx = ox + size / 2;
  const cy = oy + size / 2;
  const w = size * 0.36;
  ctx.save();
  ctx.strokeStyle = m.color ?? '#2A1A1E';
  ctx.fillStyle = m.inner ?? '#7A2F3A';
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (state === 'open' || (state === 'grimace' && m.style === 'o')) {
    ctx.ellipse(cx, cy + size * 0.02, w * 0.55, w * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (state === 'smile') {
    ctx.moveTo(cx - w, cy - w * 0.15);
    ctx.quadraticCurveTo(cx, cy + w * 1.1, cx + w, cy - w * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (state === 'grimace') {
    ctx.moveTo(cx - w, cy + w * 0.2);
    ctx.lineTo(cx - w * 0.33, cy - w * 0.1);
    ctx.lineTo(cx + w * 0.33, cy + w * 0.2);
    ctx.lineTo(cx + w, cy - w * 0.1);
    ctx.stroke();
  } else {
    if (m.style === 'o') {
      ctx.ellipse(cx, cy, w * 0.25, w * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.style === 'line') {
      ctx.moveTo(cx - w * 0.7, cy);
      ctx.lineTo(cx + w * 0.7, cy);
      ctx.stroke();
    } else {
      ctx.moveTo(cx - w * 0.8, cy - w * 0.1);
      ctx.quadraticCurveTo(cx, cy + w * 0.55, cx + w * 0.8, cy - w * 0.1);
      ctx.stroke();
    }
  }
  if (m.style === 'fang' && state !== 'grimace') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.45, cy + w * 0.05);
    ctx.lineTo(cx - w * 0.3, cy + w * 0.4);
    ctx.lineTo(cx - w * 0.15, cy + w * 0.08);
    ctx.fill();
  }
  ctx.restore();
}

export interface FaceAtlas {
  eye: THREE.Texture;
  mouth: THREE.Texture | null;
  cell: number;
  hasCanvas: boolean;
}

const atlasCache = new Map<string, FaceAtlas>();

export function faceAtlas(key: string, eye: EyeSpec, mouth: MouthSpec | null, q: Quality): FaceAtlas {
  const ck = key + ':' + q;
  const hit = atlasCache.get(ck);
  if (hit) return hit;
  const cell = q === 'mobile' ? 128 : 256;
  const cv = makeCanvas(cell * 4, cell * 2);
  let eyeTex: THREE.Texture;
  let mouthTex: THREE.Texture | null = null;
  if (cv) {
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    FACE_STATES.forEach((s, i) => drawEyeCell(ctx, (i % 4) * cell, Math.floor(i / 4) * cell, cell, eye, s));
    eyeTex = new THREE.CanvasTexture(cv);
    if (mouth && mouth.style !== 'none') {
      const mc = makeCanvas(cell * 4, cell)!;
      const mctx = mc.getContext('2d')!;
      MOUTH_STATES.forEach((s, i) => drawMouthCell(mctx, i * cell, 0, cell, mouth, s));
      mouthTex = new THREE.CanvasTexture(mc);
    }
  } else {
    // node (unit tests): tiny data texture placeholder with identical UV layout
    eyeTex = new THREE.DataTexture(new Uint8Array(4 * 8), 4, 2);
    if (mouth && mouth.style !== 'none') mouthTex = new THREE.DataTexture(new Uint8Array(4 * 4), 4, 1);
  }
  for (const t of [eyeTex, mouthTex]) {
    if (!t) continue;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = q === 'high' ? 4 : 2;
    t.needsUpdate = true;
  }
  const a = { eye: eyeTex, mouth: mouthTex, cell, hasCanvas: !!cv };
  atlasCache.set(ck, a);
  return a;
}

/** Bulged disc for eyes and mouth decals (UV 0..1 across the disc). */
export function discGeometry(r: number, bulge: number, segsN = 20): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, segsN);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.min(1, Math.hypot(x, y) / r);
    pos.setZ(i, Math.sqrt(Math.max(0, 1 - d * d)) * bulge);
  }
  g.computeVertexNormals();
  return g;
}

/** Per-instance face rig: owns cloned textures so states are independent per creature. */
export class FaceRig {
  state: FaceState = 'open';
  mouthState: MouthState = 'neutral';
  private eyeTexes: THREE.Texture[] = [];
  private mouthTex: THREE.Texture | null = null;
  private nextBlink = 2 + Math.random() * 3;
  private blinkT = -1;
  private holdUntil = 0;
  private time = 0;
  private override: FaceState | null = null;

  constructor(atlas: FaceAtlas, eyeMats: THREE.MeshStandardMaterial[], mouthMat: THREE.MeshStandardMaterial | null) {
    for (const m of eyeMats) {
      const t = atlas.eye.clone();
      t.repeat.set(0.25, 0.5);
      m.map = t;
      m.emissiveMap = t;
      this.eyeTexes.push(t);
    }
    if (mouthMat && atlas.mouth) {
      const t = atlas.mouth.clone();
      t.repeat.set(0.25, 1);
      mouthMat.map = t;
      this.mouthTex = t;
    }
    this.apply('open');
    this.applyMouth('neutral');
  }
  private apply(s: FaceState) {
    const i = FACE_STATES.indexOf(s);
    for (const t of this.eyeTexes) t.offset.set((i % 4) * 0.25, i < 4 ? 0.5 : 0);
  }
  private applyMouth(s: MouthState) {
    if (!this.mouthTex) return;
    this.mouthTex.offset.set(MOUTH_STATES.indexOf(s) * 0.25, 0);
  }
  set(s: FaceState, holdSec = 0) {
    this.state = s;
    this.override = null;
    this.holdUntil = holdSec > 0 ? this.time + holdSec : 0;
    this.apply(s);
    const mouth: MouthState = s === 'happy' ? 'smile' : s === 'hurt' ? 'grimace' : s === 'surprised' || s === 'determined' ? 'open' : 'neutral';
    this.setMouth(mouth);
  }
  setMouth(s: MouthState) {
    this.mouthState = s;
    this.applyMouth(s);
  }
  /** Temporary expression that reverts to `base` after `sec`. */
  flash(s: FaceState, sec: number, base: FaceState = 'open') {
    this.set(s);
    this.override = base;
    this.holdUntil = this.time + sec;
  }
  update(dt: number) {
    this.time += dt;
    if (this.holdUntil && this.time >= this.holdUntil) {
      this.holdUntil = 0;
      if (this.override) {
        const b = this.override;
        this.override = null;
        this.set(b);
      }
    }
    if (this.state !== 'open' && this.state !== 'determined') return;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT;
      this.apply(t < 0.04 ? 'half' : t < 0.08 ? 'closed' : t < 0.12 ? 'half' : this.state);
      if (t >= 0.12) {
        this.blinkT = -1;
        this.nextBlink = 2.5 + Math.random() * 3.5;
      }
    } else {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) this.blinkT = 0;
    }
  }
  dispose() {
    for (const t of this.eyeTexes) t.dispose();
    this.mouthTex?.dispose();
  }
}
