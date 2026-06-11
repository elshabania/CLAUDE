import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================================
//  COSMOS — a living spiral galaxy rendered entirely on the GPU.
//  Hundreds of thousands of stars, differential rotation, nebulae, bloom.
// ============================================================================
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const isMobile = matchMedia('(pointer: coarse)').matches;

// ---- Renderer / scene / camera --------------------------------------------
const canvas = $('scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (err) { window.__cosmosFail && window.__cosmosFail('WebGL unavailable', String(err && err.message)); throw err; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060f, 0.0065);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 9, 24);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 90;
controls.target.set(0, 0, 0);

// ---- Post-processing (bloom is what makes stars *glow*) --------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.7, 0.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});

// ---- Soft radial sprite texture -------------------------------------------
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const cloudTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 28; i++) {
    const px = rand(40, 216), py = rand(40, 216), r = rand(30, 90);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function glowSprite(color, size, tex = softTex) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size); return sp;
}

// ---- Starfield backdrop ----------------------------------------------------
{
  const N = isMobile ? 3500 : 7000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = rand(90, 260);
    const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = new THREE.Color().setHSL(rand(0.55, 0.65), 0.4, rand(0.6, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.7, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: softTex,
  })));
}

// ---- Nebula clouds (slow-drifting tinted gas) ------------------------------
const nebula = new THREE.Group();
scene.add(nebula);
function buildNebula(hue) {
  nebula.clear();
  const n = isMobile ? 7 : 12;
  for (let i = 0; i < n; i++) {
    const col = new THREE.Color().setHSL((hue + rand(0.4, 0.75)) % 1, 0.7, 0.5);
    const sp = glowSprite(col, rand(10, 26), cloudTex);
    sp.material.opacity = rand(0.12, 0.3);
    const a = rand(0, Math.PI * 2), r = rand(2, 16);
    sp.position.set(Math.cos(a) * r, rand(-1.5, 1.5), Math.sin(a) * r);
    nebula.add(sp);
  }
}

// ---- Galaxy core glow ------------------------------------------------------
const core = glowSprite(0xfff0c8, 9); scene.add(core);
const coreHot = glowSprite(0xffffff, 4); scene.add(coreHot);

// ---- The galaxy (custom-shader GPU points) ---------------------------------
const galaxyMat = new THREE.ShaderMaterial({
  depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, vertexColors: true,
  uniforms: {
    uTime: { value: 0 },
    uSize: { value: 30 * renderer.getPixelRatio() },
  },
  vertexShader: `
    uniform float uTime; uniform float uSize;
    attribute float aScale; attribute float aRadius; attribute float aAngle; attribute vec3 aRand;
    varying vec3 vColor; varying float vCore;
    void main(){
      // differential rotation: inner stars orbit faster than outer ones
      float angle = aAngle + uTime * (1.6 / (aRadius * 0.16 + 0.5));
      vec3 pos;
      pos.x = cos(angle) * aRadius + aRand.x;
      pos.z = sin(angle) * aRadius + aRand.z;
      pos.y = aRand.y;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(uSize * aScale * (1.0 / -mv.z), 1.0, 16.0);
      vColor = color;
      vCore = 1.0 - smoothstep(0.0, 7.0, aRadius);
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vCore;
    void main(){
      float d = distance(gl_PointCoord, vec2(0.5));
      float strength = pow(1.0 - clamp(d * 2.0, 0.0, 1.0), 4.0);
      vec3 col = vColor + vCore * 0.7;
      gl_FragColor = vec4(col * strength, strength);
    }`,
});

let galaxyPoints = null;
const PARAMS = {
  count: isMobile ? 70000 : 180000,
  branches: 5,
  radius: 18,
  spin: 0.9,        // animated swirl speed
  twist: 0.85,      // static spiral tightness
  randomness: 0.28,
  randomnessPower: 2.6,
  hue: 0.05,
};

function buildGalaxy() {
  if (galaxyPoints) { galaxyPoints.geometry.dispose(); scene.remove(galaxyPoints); }
  const { count, branches, radius, twist, randomness, randomnessPower, hue } = PARAMS;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3); // unused placeholder, positions come from attrs
  const aRadius = new Float32Array(count);
  const aAngle = new Float32Array(count);
  const aRand = new Float32Array(count * 3);
  const aScale = new Float32Array(count);
  const color = new Float32Array(count * 3);

  const inside = new THREE.Color().setHSL((hue + 0.08) % 1, 0.9, 0.82);
  const outside = new THREE.Color().setHSL((hue + 0.62) % 1, 0.85, 0.42);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1.6) * radius;
    const branch = (i % branches) / branches * Math.PI * 2;
    aRadius[i] = r;
    aAngle[i] = branch + r * twist;

    const sp = (p) => Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * randomness * (r + 1) * p;
    aRand[i * 3] = sp(1);
    aRand[i * 3 + 1] = sp(0.35);
    aRand[i * 3 + 2] = sp(1);

    const c = inside.clone().lerp(outside, Math.min(1, r / radius));
    // a sprinkle of hot white giant stars
    if (Math.random() < 0.02) { c.lerp(new THREE.Color(0xffffff), 0.7); aScale[i] = rand(1.6, 3.0); }
    else aScale[i] = rand(0.5, 1.3);
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // required by three
  geo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(aScale, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.6);

  galaxyPoints = new THREE.Points(geo, galaxyMat);
  galaxyPoints.frustumCulled = false;
  scene.add(galaxyPoints);

  core.material.color.copy(inside);
  buildNebula(hue);
}
buildGalaxy();

// ---- Supernova bursts on click ---------------------------------------------
class Bursts {
  constructor(max = 1200) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 1.1, map: softTex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false; scene.add(this.points);
    this.list = []; this.max = max;
  }
  explode(center) {
    const flash = glowSprite(0xffffff, 0.5); flash.position.copy(center); scene.add(flash);
    const start = performance.now();
    const grow = () => {
      const t = (performance.now() - start) / 600;
      if (t >= 1) { scene.remove(flash); flash.material.dispose(); return; }
      flash.scale.setScalar(0.5 + t * 14); flash.material.opacity = 1 - t;
      requestAnimationFrame(grow);
    };
    grow();
    const hue = Math.random();
    for (let i = 0; i < 220; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 14));
      const c = new THREE.Color().setHSL((hue + rand(-0.1, 0.1) + 1) % 1, 0.8, rand(0.6, 0.9));
      this.list.push({ p: center.clone(), v: dir, c, life: rand(0.8, 1.6), max: 1.6 });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) { const b = this.list[i]; b.life -= dt; if (b.life <= 0) this.list.splice(i, 1); }
    let n = 0;
    for (const b of this.list) {
      b.v.multiplyScalar(0.96); b.p.addScaledVector(b.v, dt);
      const t = Math.max(0, b.life / b.max), idx = n * 3;
      this.pos[idx] = b.p.x; this.pos[idx + 1] = b.p.y; this.pos[idx + 2] = b.p.z;
      this.col[idx] = b.c.r * t; this.col[idx + 1] = b.c.g * t; this.col[idx + 2] = b.c.b * t;
      n++; if (n >= this.max) break;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
const bursts = new Bursts();

// click (not drag) → supernova at a point on the galaxy disk
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return; // it was a drag-orbit
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
    if (hit.length() > PARAMS.radius * 1.4) hit.setLength(rand(3, PARAMS.radius));
    bursts.explode(hit);
  }
});

// ---- UI --------------------------------------------------------------------
function bindUI() {
  const cCount = $('cCount'), cSpin = $('cSpin'), cBranches = $('cBranches'), cHue = $('cHue');
  cCount.value = PARAMS.count; cSpin.value = PARAMS.spin; cBranches.value = PARAMS.branches; cHue.value = PARAMS.hue;
  cCount.addEventListener('input', () => { PARAMS.count = +cCount.value; buildGalaxy(); });
  cBranches.addEventListener('input', () => { PARAMS.branches = +cBranches.value; buildGalaxy(); });
  cHue.addEventListener('input', () => { PARAMS.hue = +cHue.value; buildGalaxy(); });
  cSpin.addEventListener('input', () => { PARAMS.spin = +cSpin.value; });
  $('cShuffle').addEventListener('click', () => {
    PARAMS.branches = Math.floor(rand(2, 8)); PARAMS.twist = rand(0.4, 1.3);
    PARAMS.hue = Math.random(); PARAMS.randomness = rand(0.18, 0.4);
    cBranches.value = PARAMS.branches; cHue.value = PARAMS.hue;
    buildGalaxy();
  });
}

// ---- Loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let spinPhase = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  spinPhase += dt * PARAMS.spin;
  galaxyMat.uniforms.uTime.value = spinPhase;
  nebula.rotation.y = spinPhase * 0.15;
  bursts.update(dt);
  const tw = 1 + Math.sin(performance.now() * 0.004) * 0.12;
  core.scale.setScalar(9 * tw); coreHot.scale.setScalar(4 * tw);
  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}

// ---- Boot ------------------------------------------------------------------
window.__cosmosBooted = true;
$('loading').classList.add('hidden');
$('ui').classList.remove('hidden');
bindUI();
tick();
