// HumanModel: a skinned, morph-driven human character built from the baked MakeHuman-derived data.
// API mirrors the old part-assembler Animator usage: root, bounds, setSpeed, play(action), update(dt),
// dispose, plus setExpression / talking for dialogue and battle staging.
import * as THREE from 'three';
import { onHumanData, type HumanData } from './data';
import { blendShape, buildRig, type BodyShape, type Rig } from './shape';
import { FaceMorpher, faceLandmarks, splitHead, subGeometry, type SubMesh } from './body';
import { eyeMaterial, lashMaterial, skinMaterial, teethMaterial, tongueMaterial, type HumanQuality } from './materials';
import type { HumanLook } from './types';
import { resolveLook, type ResolvedLook } from './look';
import { buildOutfit, type OutfitProps } from './garments';
import { buildHair } from './hair';
import { HumanAnimator, type HumanAction, type Expression } from './animator';

export interface HumanOpts {
  quality?: HumanQuality | 'low';
  /** 0 = full detail, 1 = reduced (distant NPC), 2 = far */
  lod?: 0 | 1 | 2;
}



export class HumanModel {
  readonly root = new THREE.Group();
  readonly bounds: { height: number; radius: number; length: number };
  reducedMotion = false;
  talking = false;
  readonly look: ResolvedLook;
  private q: HumanQuality;
  private lodLevel: 0 | 1 | 2;
  private unsub: () => void;
  private cancelJob: (() => void) | null = null;
  private disposables: { dispose(): void }[] = [];
  private rig: Rig | null = null;
  private morpher: FaceMorpher | null = null;
  anim: HumanAnimator | null = null;
  private pendingSpeed = 0;
  private pendingPlay: [HumanAction, { onContact?: () => void; onDone?: () => void }] | null = null;
  private pendingExpr: Expression | null = null;
  private skinnedMeshes: THREE.SkinnedMesh[] = [];
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(look: HumanLook, opts: HumanOpts = {}) {
    this.look = resolveLook(look);
    this.q = opts.quality === 'low' ? 'mobile' : (opts.quality ?? 'balanced');
    this.lodLevel = opts.lod ?? 0;
    this.bounds = { height: this.look.height, radius: 0.32, length: 0.4 };
    this.root.name = 'human:' + look.id;
    this.ready = new Promise((r) => (this.resolveReady = r));
    this.unsub = onHumanData((d) => this.schedule(d));
  }

  /** Builds are spread over frames (one unique look per tick, nearest LOD first) so a zone full of people never
   *  stalls a single frame; cached looks build immediately. */
  private schedule(d: HumanData) {
    let cancelled = false;
    const job = { lod: this.lodLevel, run: () => { if (!cancelled && !this.disposed) this.build(d); } };
    this.cancelJob = () => { cancelled = true; };
    if (assetCache.has(assetKey(this.look, this.lodLevel, this.q))) job.run();
    else enqueue(job);
  }

  private build(d: HumanData) {
    const t0 = performance.now();
    const L = this.look;
    const lod = this.lodLevel;
    const set = acquireAssets(d, L, lod, this.q);
    this.disposables.push({ dispose: () => releaseAssets(set) });
    const shape = set.shape;
    const rig = buildRig(d, shape);
    this.rig = rig;
    this.root.add(rig.root);
    const addSkinned = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], name: string) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.name = name;
      m.frustumCulled = false;
      m.castShadow = true;
      m.bind(rig.skeleton, new THREE.Matrix4());
      this.root.add(m);
      this.skinnedMeshes.push(m);
      return m;
    };
    const morphTargets: SubMesh[] = [];
    for (const p of set.parts) {
      if (p.morph && lod === 0) {
        // per-instance copy: the CPU face morpher rewrites its positions
        const geo = p.geo.clone();
        this.disposables.push(geo);
        addSkinned(geo, p.mat, p.name);
        morphTargets.push({ geo, oIdx: p.oIdx! });
      } else addSkinned(p.geo, p.mat, p.name);
    }
    this.morpher = morphTargets.length ? new FaceMorpher(d, morphTargets) : null;
    this.anim = new HumanAnimator(rig, shape, d, L, this.morpher);
    this.anim.setSpeed(this.pendingSpeed);
    if (this.pendingExpr) this.anim.setExpression(this.pendingExpr);
    if (this.pendingPlay) this.anim.play(...this.pendingPlay);
    const props: OutfitProps = {};
    for (const hp of set.handProps) {
      const obj = hp.obj.clone();
      rig.byName[hp.bone].add(obj);
      if (hp.obj === set.chime) { props.chime = obj; obj.position.copy(this.anim.gripOffset('R')); obj.visible = false; }
    }
    this.anim.props = props;
    this.anim.update(0.0001);
    this.bounds.height = this.look.height;
    if ((globalThis as any).__humanTiming) console.log('[human] build', this.look.id, 'lod', lod, (performance.now() - t0).toFixed(1), 'ms', set.refs > 1 ? '(shared)' : '');
    this.resolveReady();
  }

  setSpeed(s: number) {
    this.pendingSpeed = s;
    this.anim?.setSpeed(s);
  }

  play(name: HumanAction, cb: { onContact?: () => void; onDone?: () => void } = {}) {
    if (this.anim) this.anim.play(name, cb);
    else this.pendingPlay = [name, cb];
  }

  setExpression(e: Expression) {
    this.pendingExpr = e;
    this.anim?.setExpression(e);
  }

  get busy() {
    return this.anim?.busy ?? false;
  }

  update(dt: number) {
    if (this.disposed) this.revive();
    if (!this.anim) return;
    this.anim.reducedMotion = this.reducedMotion;
    this.anim.talking = this.talking;
    this.anim.update(dt);
  }

  private disposed = false;

  /** Frees GPU resources and detaches the built meshes. The root group stays usable: a model that is updated again
   *  after dispose (React StrictMode double effects) transparently rebuilds itself. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsub();
    this.cancelJob?.();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const m of this.skinnedMeshes) m.skeleton?.dispose();
    this.skinnedMeshes = [];
    this.root.clear();
    this.anim = null;
    this.rig = null;
    this.morpher = null;
  }

  private revive() {
    this.disposed = false;
    this.unsub = onHumanData((d) => this.schedule(d));
  }
}

// ------------------------------------------------------------------ shared per-look assets
interface Part { name: string; geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; morph?: boolean; oIdx?: Uint32Array }
interface AssetSet { key: string; shape: BodyShape; parts: Part[]; handProps: { bone: string; obj: THREE.Object3D }[]; chime?: THREE.Object3D; refs: number; dispose: () => void }
const shapeCache = new Map<string, { shape: BodyShape; refs: number }>();
const assetCache = new Map<string, AssetSet>();
const assetKey = (L: ResolvedLook, lod: number, q: string) => `${L.id}|${lod}|${q}|${JSON.stringify(L.presetWeights)}`;
const queue: { lod: number; run: () => void }[] = [];
let pumping = false;
function enqueue(job: { lod: number; run: () => void }) {
  queue.push(job);
  queue.sort((a, b) => a.lod - b.lod);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    const j = queue.shift();
    if (j) j.run();
    if (queue.length) setTimeout(pump, 0);
    else pumping = false;
  };
  setTimeout(pump, 0);
}

function acquireAssets(d: HumanData, L: ResolvedLook, lod: 0 | 1 | 2, q: HumanQuality): AssetSet {
  const key = assetKey(L, lod, q);
  const hit = assetCache.get(key);
  if (hit) { hit.refs++; return hit; }
  const sk = JSON.stringify(L.presetWeights);
  let se = shapeCache.get(sk);
  if (!se) { se = { shape: blendShape(d, L.presetWeights), refs: 0 }; shapeCache.set(sk, se); }
  se.refs++;
  const shape = se.shape;
  const disposables: { dispose(): void }[] = [];
  const parts: Part[] = [];
  const faceL = faceLandmarks(d, shape);
  const outfit = buildOutfit(d, shape, L, lod, q);
  const bodyTris = lod === 0 ? d.tris.body : lod === 1 ? d.lod1 : d.lod2;
  const { head, rest } = splitHead(d, outfit.hideBody(bodyTris));
  const skinP = { skin: L.skin, brow: L.browColor, mouth: faceL.mouth, browThick: L.browThick, browArch: L.browArch, age: L.age, freckles: L.freckles, blush: L.blush, lipAmt: L.sex === 'm' ? 0.4 : L.sex === 'n' ? 0.55 : 0.8 };
  const bodyMat = skinMaterial(skinP, false, q);
  const headMat = skinMaterial(skinP, true, q);
  disposables.push(bodyMat, headMat);
  parts.push({ name: 'body', geo: subGeometry(d, shape, rest, {}).geo, mat: bodyMat });
  const headSub = subGeometry(d, shape, head, { face: faceL });
  parts.push({ name: 'head', geo: headSub.geo, mat: headMat, morph: true, oIdx: headSub.oIdx });
  if (lod < 2) {
    // face details: lashes + teeth (+ tongue) in one geometry with material groups
    const mats: [string, THREE.Material][] = [['lashUp', lashMaterial()], ['lashLo', lashMaterial()], ['teeth', teethMaterial()], ['tongue', tongueMaterial()]];
    const all: number[] = [];
    const groups: [number, number, number][] = [];
    mats.forEach(([p], mi) => { const t = d.tris[p]; if (!t) return; groups.push([all.length, t.length, mi]); for (const x of t) all.push(x); });
    const det = subGeometry(d, shape, all, {});
    for (const [s0, c, mi] of groups) det.geo.addGroup(s0, c, mi);
    // lash strand coordinates: along = angle around the eye, across = root (0) -> tip (1), lower lashes flagged
    const pa = det.geo.getAttribute('position');
    const lashA = new Float32Array(pa.count * 3);
    const ix = det.geo.getIndex()!.array;
    for (const [s0, c, mi] of groups) {
      if (mi > 1) continue;
      for (let k = s0; k < s0 + c; k++) {
        const v = ix[k];
        const e = pa.getX(v) > 0 ? shape.eyeL : shape.eyeR;
        const dx = pa.getX(v) - e.x, dy = pa.getY(v) - e.y, dz = pa.getZ(v) - e.z;
        const dist = Math.hypot(dx, dy, dz) / shape.eyeRadius;
        lashA[v * 3] = Math.atan2(dy, Math.abs(dx));
        lashA[v * 3 + 1] = Math.min(1, Math.max(0, (dist - 1.17) / (mi === 0 ? 0.5 : 0.3)));
        lashA[v * 3 + 2] = mi;
      }
    }
    det.geo.setAttribute('aLash', new THREE.BufferAttribute(lashA, 3));
    parts.push({ name: 'faceDetail', geo: det.geo, mat: mats.map((m) => m[1]), morph: true, oIdx: det.oIdx });
    const tmpRig = buildRig(d, shape);
    const eyes = buildEyes(d, shape, tmpRig, L.iris, q);
    parts.push({ name: 'eyes', geo: eyes.geo, mat: eyes.mat });
    disposables.push(eyes.mat);
  }
  for (const g of outfit.meshes) parts.push({ name: g.name, geo: g.geo, mat: g.mat });
  for (const g of buildHair(d, shape, null as unknown as Rig, L, lod, q)) parts.push({ name: g.name, geo: g.geo, mat: g.mat });
  for (const p of parts) disposables.push(p.geo);
  for (const hp of outfit.handProps) hp.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) disposables.push(m.geometry, m.material as THREE.Material); });
  const set: AssetSet = {
    key, shape, parts, handProps: outfit.handProps, chime: outfit.props.chime, refs: 1,
    dispose: () => { for (const x of disposables) x.dispose(); se!.refs--; if (se!.refs <= 0) shapeCache.delete(sk); },
  };
  assetCache.set(key, set);
  return set;
}

function releaseAssets(set: AssetSet) {
  set.refs--;
  if (set.refs > 0) return;
  assetCache.delete(set.key);
  set.dispose();
}

function buildEyes(d: HumanData, shape: BodyShape, rig: Rig, iris: string, q: HumanQuality) {
  const geo = new THREE.BufferGeometry();
  const sphere = new THREE.SphereGeometry(shape.eyeRadius * 1.0, q === 'mobile' ? 18 : 28, q === 'mobile' ? 12 : 20);
  sphere.rotateX(Math.PI / 2); // pole forward: finer iris tessellation
  const n = sphere.getAttribute('position').count;
  const pos = new Float32Array(n * 6), nrm = new Float32Array(n * 6);
  const si = new Uint16Array(n * 8), sw = new Float32Array(n * 8);
  const idx: number[] = [];
  const si0 = sphere.getIndex()!.array;
  [shape.eyeL, shape.eyeR].forEach((c, e) => {
    const bi = rig.bones.indexOf(rig.byName[e === 0 ? 'eye.L' : 'eye.R']);
    for (let i = 0; i < n; i++) {
      const j = e * n + i;
      pos[j * 3] = sphere.getAttribute('position').getX(i) + c.x;
      pos[j * 3 + 1] = sphere.getAttribute('position').getY(i) + c.y;
      pos[j * 3 + 2] = sphere.getAttribute('position').getZ(i) + c.z;
      nrm[j * 3] = sphere.getAttribute('normal').getX(i);
      nrm[j * 3 + 1] = sphere.getAttribute('normal').getY(i);
      nrm[j * 3 + 2] = sphere.getAttribute('normal').getZ(i);
      si[j * 4] = bi; sw[j * 4] = 1;
    }
    for (let k = 0; k < si0.length; k++) idx.push(si0[k] + e * n);
  });
  sphere.dispose();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  void d;
  return { geo, mat: eyeMaterial(iris, q) };
}

