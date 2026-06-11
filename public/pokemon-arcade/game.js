import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ============================================================================
//  EMBER STRIKE — a 3D action brawler.
//  You control Ember, a fire-powered hero (a real rigged + animated model),
//  against a Rival Unit. Run, punch, blast and burn.
// ============================================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const setLoadMsg = (t) => { const e = $('loadMsg'); if (e) e.textContent = t; };

// ----------------------------------------------------------------------------
//  Renderer / scene / camera / post-processing
// ----------------------------------------------------------------------------
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  if (window.__charFail) window.__charFail('WebGL unavailable',
    'Your browser/device could not create a WebGL context.\n' +
    'Enable hardware acceleration / WebGL and reload.\n(' + (err && err.message) + ')');
  throw err;
}
const _coarse = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, _coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x14233f, 0.011);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 7, 12);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ----------------------------------------------------------------------------
//  Lighting
// ----------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x35506b, 0.7));

const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.position.set(18, 30, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
const sS = 34;
sun.shadow.camera.left = -sS; sun.shadow.camera.right = sS;
sun.shadow.camera.top = sS; sun.shadow.camera.bottom = -sS;
sun.shadow.bias = -0.0004;
scene.add(sun);

const rim = new THREE.DirectionalLight(0x5577ff, 0.6);
rim.position.set(-20, 14, -16);
scene.add(rim);

// ----------------------------------------------------------------------------
//  Sky dome
// ----------------------------------------------------------------------------
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x0b2452) },
      mid: { value: new THREE.Color(0x2a5a8c) },
      bot: { value: new THREE.Color(0xe8a86a) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform vec3 top, mid, bot;
      void main(){
        float h = normalize(vP).y;
        vec3 c = mix(bot, mid, smoothstep(-0.1, 0.35, h));
        c = mix(c, top, smoothstep(0.3, 0.9, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat));
}

// ----------------------------------------------------------------------------
//  Glow sprite + procedural textures
// ----------------------------------------------------------------------------
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function makeGlowSprite(color, size) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}
function makeGroundTexture(base, speck, scale) {
  const N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, N, N);
  const b = new THREE.Color(base), sp = new THREE.Color(speck);
  const img = x.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 0.5;
    const col = b.clone().lerp(sp, clamp(0.5 + n, 0, 1));
    d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(scale, scale);
  const bc = document.createElement('canvas'); bc.width = bc.height = N;
  const bx = bc.getContext('2d'); const bimg = bx.createImageData(N, N), bd = bimg.data;
  for (let i = 0; i < bd.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 110; bd[i] = bd[i + 1] = bd[i + 2] = v; bd[i + 3] = 255; }
  bx.putImageData(bimg, 0, 0);
  const bump = new THREE.CanvasTexture(bc); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(scale, scale);
  return { tex, bump };
}

// ----------------------------------------------------------------------------
//  Arena
// ----------------------------------------------------------------------------
const ARENA_R = 26;
{
  const g = new THREE.Group();
  const grass = makeGroundTexture('#46632f', '#5c8a3a', 14);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 30, 64),
    new THREE.MeshStandardMaterial({ map: grass.tex, bumpMap: grass.bump, bumpScale: 0.6, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);

  const sand = makeGroundTexture('#c9a36a', '#a07c44', 8);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 64),
    new THREE.MeshStandardMaterial({ map: sand.tex, bumpMap: sand.bump, bumpScale: 0.5, roughness: 1 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.receiveShadow = true; g.add(ring);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: .8 });
  const line = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.6, ARENA_R, 64), lineMat);
  line.rotation.x = -Math.PI / 2; line.position.y = 0.03; g.add(line);
  const mid = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 48), lineMat);
  mid.rotation.x = -Math.PI / 2; mid.position.y = 0.03; g.add(mid);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: .95, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = rand(ARENA_R + 3, ARENA_R + 26), sz = rand(0.6, 3.2);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), rockMat);
    rock.position.set(Math.cos(a) * r, sz * 0.4, Math.sin(a) * r);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rock.castShadow = rock.receiveShadow = true; g.add(rock);
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a32, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), r = rand(ARENA_R + 18, ARENA_R + 70), h = rand(5, 12);
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, h * 0.4, 6), trunkMat); trunk.position.y = h * 0.2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(h * 0.4, h * 0.8, 7), leafMat); leaf.position.y = h * 0.6;
    t.add(trunk, leaf); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.castShadow = true; g.add(t);
  }
  scene.add(g);
}

// Sun disc, contact shadows, ambient embers
const sunDisc = makeGlowSprite(0xffe6b0, 26); sunDisc.position.set(60, 70, -40); scene.add(sunDisc);
const sunCore = makeGlowSprite(0xffffff, 10); sunCore.position.copy(sunDisc.position); scene.add(sunCore);

const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function makeBlob(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.05; scene.add(m); return m;
}
const blobPlayer = makeBlob(2.8), blobEnemy = makeBlob(2.8);

const dustN = 140;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(dustN * 3);
const dustPhase = new Float32Array(dustN);
for (let i = 0; i < dustN; i++) {
  const a = rand(0, Math.PI * 2), r = rand(2, ARENA_R + 6);
  dustPos[i * 3] = Math.cos(a) * r; dustPos[i * 3 + 1] = rand(0.5, 9); dustPos[i * 3 + 2] = Math.sin(a) * r;
  dustPhase[i] = rand(0, Math.PI * 2);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  map: glowTex, color: 0xffb060, size: 0.5, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
}));
dust.frustumCulled = false; scene.add(dust);
function updateDust(dt) {
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3 + 1] += (0.25 + Math.sin(GAME.time * 0.6 + dustPhase[i]) * 0.15) * dt;
    if (dustPos[i * 3 + 1] > 10) dustPos[i * 3 + 1] = 0.4;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ----------------------------------------------------------------------------
//  Particle FX pool (fire / sparks / smoke)
// ----------------------------------------------------------------------------
class Particles {
  constructor(max = 900) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.scl = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('pscale', new THREE.BufferAttribute(this.scl, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: glowTex } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `
        attribute float pscale; varying vec3 vCol;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = pscale * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D tex; varying vec3 vCol;
        void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vCol,1.0) * t; }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.list = []; this.max = max;
  }
  spawn(p, v, color, life, size, grav = 0) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), c: color, life, max: life, size, grav });
  }
  burst(center, color, n, speed, life, size, grav = 0) {
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed);
      this.spawn(center, dir, color, rand(life * 0.6, life), size * rand(0.7, 1.3), grav);
    }
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i]; pr.life -= dt;
      if (pr.life <= 0) this.list.splice(i, 1);
    }
    for (const pr of this.list) {
      pr.v.y -= pr.grav * dt; pr.p.addScaledVector(pr.v, dt);
      const t = pr.life / pr.max, idx = n * 3;
      this.pos[idx] = pr.p.x; this.pos[idx + 1] = pr.p.y; this.pos[idx + 2] = pr.p.z;
      this.col[idx] = pr.c.r * t; this.col[idx + 1] = pr.c.g * t; this.col[idx + 2] = pr.c.b * t;
      this.scl[n] = pr.size * (0.4 + t * 0.8); n++;
      if (n >= this.max) break;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.pscale.needsUpdate = true;
  }
}
const FX = new Particles(900);
scene.add(FX.points);

const COL = {
  fire: new THREE.Color(0xff7b2a),
  emberHot: new THREE.Color(0xffd23f),
  emberDeep: new THREE.Color(0xd63a00),
  ice: new THREE.Color(0x8fd0ff),
  spark: new THREE.Color(0xffffff),
  smoke: new THREE.Color(0x555555),
};

// ----------------------------------------------------------------------------
//  Character: a real rigged + animated glTF model with a state machine
// ----------------------------------------------------------------------------
class Fighter {
  constructor(gltf, tint, emissiveTint) {
    this.root = SkeletonUtils.clone(gltf.scene);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = o.material.clone();
        if (tint) o.material.color.lerp(new THREE.Color(tint), 0.55);
        o.material.envMapIntensity = 1.1;
        if (emissiveTint && o.material.emissive) {
          o.material.emissive = new THREE.Color(emissiveTint);
          o.material.emissiveIntensity = 0.0;
          o.userData.glowMat = true;
        }
      }
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.lock = 0;          // one-shot animation lock timer
    this.flash = 0;         // hit flash timer
    this.glow = 0;          // fire-attack body glow
    this.play('Idle');
    scene.add(this.root);
  }
  play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }
  once(name, fade = 0.1, lock) {
    const a = this.actions[name];
    if (!a) return 0.3;
    a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).fadeIn(fade).play();
    a.clampWhenFinished = true;
    // optionally speed up the clip so the action feels snappy
    const dur = a.getClip().duration;
    if (lock != null && dur > lock + 0.1) a.timeScale = dur / (lock + 0.15);
    else a.timeScale = 1;
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.current = a;
    this.lock = lock != null ? lock : dur;
    return this.lock;
  }
  locomotion(speed) {
    if (this.dead || this.lock > 0) return;
    if (speed < 0.06) this.play('Idle');
    else if (speed < 0.62) this.play('Walking');
    else this.play('Running');
  }
  update(dt) {
    if (this.lock > 0) this.lock -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    // glow + hit-flash on body materials
    this.root.traverse((o) => {
      if (o.isMesh && o.material.emissive) {
        if (this.flash > 0.01) { o.material.emissive.setHex(0xff5544); o.material.emissiveIntensity = this.flash; }
        else if (o.userData.glowMat) { o.material.emissive.setHex(0xff5a1e); o.material.emissiveIntensity = this.glow; }
        else o.material.emissiveIntensity = 0;
      }
    });
    this.mixer.update(dt);
  }
}

// ----------------------------------------------------------------------------
//  Game state
// ----------------------------------------------------------------------------
const GAME = {
  state: 'loading',
  player: { hp: 100, maxHp: 100, flame: 100, maxFlame: 100, pos: new THREE.Vector3(0, 0, 7), facing: Math.PI, vis: 0, y: 0, vy: 0, jumping: false },
  enemy: { hp: 100, maxHp: 100, pos: new THREE.Vector3(0, 0, -7), facing: 0, ai: 1.2, tele: 0, lastTele: 0, attackType: null, busy: 0 },
  projectiles: [],
  cooldowns: { J: 0, K: 0, L: 0, dodge: 0 },
  time: 0, shake: 0,
};

const MOVES = {
  J: { cd: 0.55, range: 2.9, dmg: 12 },
  K: { cd: 1.0, dmg: 16 },
  L: { dmg: 26, cost: 38 },
};

let player, enemy; // Fighter instances, assigned after load

// ----------------------------------------------------------------------------
//  Input
// ----------------------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') keys['space'] = true;
});
addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  if (e.key === ' ') keys['space'] = false;
});

const touch = { active: false, dx: 0, dy: 0, id: null };
const stick = $('stick'), nub = $('stickNub');
function stickStart(e) { touch.active = true; touch.id = e.changedTouches ? e.changedTouches[0].identifier : 'mouse'; stickMove(e); }
function stickMove(e) {
  if (!touch.active) return;
  const rect = stick.getBoundingClientRect();
  const pt = e.changedTouches ? [...e.changedTouches].find(t => t.identifier === touch.id) : e;
  if (!pt) return;
  let dx = pt.clientX - (rect.left + rect.width / 2), dy = pt.clientY - (rect.top + rect.height / 2);
  const mag = Math.hypot(dx, dy), max = rect.width / 2;
  if (mag > max) { dx = dx / mag * max; dy = dy / mag * max; }
  nub.style.transform = `translate(${dx}px,${dy}px)`;
  touch.dx = dx / max; touch.dy = dy / max;
}
function stickEnd() { touch.active = false; touch.dx = touch.dy = 0; nub.style.transform = 'translate(0,0)'; }
stick.addEventListener('touchstart', stickStart, { passive: true });
stick.addEventListener('touchmove', stickMove, { passive: true });
stick.addEventListener('touchend', stickEnd);
document.querySelectorAll('#touchBtns button').forEach(b => {
  const act = b.dataset.act;
  b.addEventListener('touchstart', (e) => { e.preventDefault(); keys[act === 'dodge' ? 'space' : act.toLowerCase()] = true; }, { passive: false });
  b.addEventListener('touchend', (e) => { e.preventDefault(); keys[act === 'dodge' ? 'space' : act.toLowerCase()] = false; });
});

// ----------------------------------------------------------------------------
//  HUD
// ----------------------------------------------------------------------------
function setBar(el, frac) {
  el.style.width = (clamp(frac, 0, 1) * 100) + '%';
  if (el.id === 'playerHp' || el.id === 'enemyHp') {
    const c = frac > 0.5 ? 'var(--hp-good)' : frac > 0.22 ? 'var(--hp-mid)' : 'var(--hp-low)';
    const c2 = frac > 0.5 ? '#6cf08a' : frac > 0.22 ? '#ffe08a' : '#ff7aa0';
    el.style.background = `linear-gradient(90deg, ${c}, ${c2})`;
  }
}
let announceTimer = 0;
function announce(text, color = '#ffd23f') {
  const a = $('announce'); a.textContent = text; a.style.color = color; a.classList.add('show'); announceTimer = 1.1;
}
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function muzzle(ent, h = 1.6, fwd = 0.8) {
  return ent.pos.clone().add(new THREE.Vector3(Math.sin(ent.facing) * fwd, h, Math.cos(ent.facing) * fwd));
}

// ----------------------------------------------------------------------------
//  Combat
// ----------------------------------------------------------------------------
function faceEnemy(blend = 1) {
  const p = GAME.player;
  const toE = Math.atan2(GAME.enemy.pos.x - p.pos.x, GAME.enemy.pos.z - p.pos.z);
  p.facing += angleDiff(toE, p.facing) * blend;
}
function damageEnemy(amount) {
  const e = GAME.enemy; if (e.hp <= 0) return;
  e.hp = Math.max(0, e.hp - amount); enemy.flash = 1;
  if (e.hp <= 0) endBattle(true);
}
function damagePlayer(amount) {
  const p = GAME.player;
  if (GAME.cooldowns.dodge > 0.42) return; // i-frames at start of a jump/dodge
  if (p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - amount); player.flash = 1; GAME.shake = Math.max(GAME.shake, 0.3);
  if (p.hp <= 0) endBattle(false);
}

function doPunch() {
  GAME.cooldowns.J = MOVES.J.cd; faceEnemy();
  player.once('Punch', 0.06, 0.45);
  const dist = GAME.player.pos.distanceTo(GAME.enemy.pos);
  const toE = Math.atan2(GAME.enemy.pos.x - GAME.player.pos.x, GAME.enemy.pos.z - GAME.player.pos.z);
  setTimeout(() => {
    if (dist < MOVES.J.range && Math.abs(angleDiff(GAME.player.facing, toE)) < 1.2 && GAME.enemy.hp > 0) {
      damageEnemy(MOVES.J.dmg + rand(-1, 3));
      const hp = muzzle(GAME.enemy, 1.5, 0);
      FX.burst(hp, COL.spark, 20, 8, 0.3, 1.1, 6);
      FX.burst(hp, COL.fire, 12, 5, 0.4, 1.3, 2);
      GAME.shake = Math.max(GAME.shake, 0.28);
    } else FX.burst(muzzle(GAME.player, 1.5, 1.2), COL.fire, 6, 4, 0.25, 0.9, 3);
  }, 220);
}

function doBlast() {
  GAME.cooldowns.K = MOVES.K.cd; faceEnemy();
  player.once('Punch', 0.06, 0.4); player.glow = 1.4;
  const start = muzzle(GAME.player, 1.6, 1.0);
  const dir = muzzle(GAME.enemy, 1.4, 0).sub(start).normalize();
  GAME.projectiles.push({ side: 'player', p: start, v: dir.multiplyScalar(20), grav: 0, life: 2, dmg: MOVES.K.dmg, color: COL.emberHot, radius: 0.9, type: 'fire' });
  FX.burst(start, COL.fire, 14, 5, 0.35, 1.6, 0);
}

function doFlame(dt) {
  if (GAME.player.flame < 6) return;
  GAME.player.flame = Math.max(0, GAME.player.flame - MOVES.L.cost * dt);
  player.glow = 1.8; faceEnemy(0.35);
  const origin = muzzle(GAME.player, 1.7, 0.9);
  const dir = new THREE.Vector3(Math.sin(GAME.player.facing), 0.04, Math.cos(GAME.player.facing));
  for (let i = 0; i < 4; i++) {
    const spread = new THREE.Vector3(rand(-.25, .25), rand(-.18, .25), rand(-.25, .25));
    const v = dir.clone().add(spread).normalize().multiplyScalar(rand(11, 16));
    FX.spawn(origin.clone().add(spread.multiplyScalar(0.3)), v, Math.random() < .5 ? COL.emberHot : COL.fire, rand(0.3, 0.55), rand(1.6, 2.6), -2);
  }
  if (Math.random() < 0.4) FX.spawn(origin, dir.clone().multiplyScalar(3).add(new THREE.Vector3(0, 1, 0)), COL.smoke, 0.7, 2.5, -1);
  const toE = GAME.enemy.pos.clone().sub(GAME.player.pos); const horiz = new THREE.Vector3(toE.x, 0, toE.z);
  const dist = horiz.length(); const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  if (dist < 8.5 && horiz.clone().normalize().dot(flat) > 0.82 && GAME.enemy.hp > 0) {
    damageEnemy(MOVES.L.dmg * dt);
    if (Math.random() < 0.5) FX.burst(muzzle(GAME.enemy, 1.4, 0), COL.fire, 4, 4, 0.3, 1.5, 1);
    GAME.shake = Math.max(GAME.shake, 0.08);
  }
}

// ----------------------------------------------------------------------------
//  Player update
// ----------------------------------------------------------------------------
function updatePlayer(dt) {
  const p = GAME.player;
  for (const k of ['J', 'K', 'L', 'dodge']) GAME.cooldowns[k] = Math.max(0, GAME.cooldowns[k] - dt);

  let ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup']) iz -= 1;
  if (keys['s'] || keys['arrowdown']) iz += 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (touch.active) { ix += touch.dx; iz += touch.dy; }
  const inMag = Math.min(1, Math.hypot(ix, iz));
  const sprint = keys['shift'] ? 1.7 : 1.0;
  const speed = 6.0 * sprint;

  // Jump
  if (keys['space'] && !p.jumping && GAME.cooldowns.dodge <= 0) {
    p.jumping = true; p.vy = 7.0; GAME.cooldowns.dodge = 0.7; player.once('Jump', 0.06, 0.32);
  }
  if (p.jumping) {
    p.vy -= 20 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.jumping = false; p.vy = 0; }
  }

  const busy = player.lock > 0;
  let moveSpeed = 0;
  if (inMag > 0.1 && !busy) {
    const dir = new THREE.Vector3(ix, 0, iz).normalize();
    p.pos.addScaledVector(dir, speed * dt);
    p.facing = Math.atan2(dir.x, dir.z);
    moveSpeed = (speed / 6.0) * inMag; // 0..1.7
  }
  const r = Math.hypot(p.pos.x, p.pos.z);
  if (r > ARENA_R - 1.5) { p.pos.x *= (ARENA_R - 1.5) / r; p.pos.z *= (ARENA_R - 1.5) / r; }

  // Attacks
  if (keys['j'] && GAME.cooldowns.J <= 0 && !busy) doPunch();
  if (keys['k'] && GAME.cooldowns.K <= 0 && !busy) doBlast();
  const flaming = keys['l'] && !busy;
  if (flaming) doFlame(dt);

  if (!flaming) p.flame = Math.min(p.maxFlame, p.flame + 26 * dt);
  else p.flame = Math.min(p.maxFlame, p.flame + 4 * dt);
  player.glow = Math.max(0, player.glow - dt * 3.5);

  // drive locomotion animation
  player.locomotion(p.jumping ? 0 : moveSpeed * 0.6);
}

// ----------------------------------------------------------------------------
//  Enemy AI
// ----------------------------------------------------------------------------
function updateEnemyAI(dt) {
  const e = GAME.enemy, p = GAME.player;
  if (e.hp <= 0) return;
  const toP = p.pos.clone().sub(e.pos); toP.y = 0;
  const dist = toP.length();
  e.facing = Math.atan2(toP.x, toP.z);
  e.ai -= dt; e.tele = Math.max(0, e.tele - dt);

  const busy = enemy.lock > 0;
  let move = new THREE.Vector3(), moveSpeed = 0;
  const ideal = 3.0;
  if (!busy && e.tele <= 0) {
    if (dist > ideal + 0.4) move.copy(toP).normalize();
    else if (dist < ideal - 1.2) move.copy(toP).normalize().multiplyScalar(-1);
    const strafe = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.sin(GAME.time * 0.8) * 0.5);
    move.add(strafe);
    if (move.lengthSq() > 0.001) {
      const sp = 4.4; e.pos.addScaledVector(move.normalize(), sp * dt); moveSpeed = 0.9;
    }
  }
  const r = Math.hypot(e.pos.x, e.pos.z);
  if (r > ARENA_R - 1.5) { e.pos.x *= (ARENA_R - 1.5) / r; e.pos.z *= (ARENA_R - 1.5) / r; }

  // decide attack
  if (e.ai <= 0 && e.tele <= 0 && !busy && dist < 3.4) {
    e.tele = 0.4; e.ai = rand(1.3, 2.3);
  }
  if (e.lastTele > 0 && e.tele <= 0) enemyPunch();
  e.lastTele = e.tele;

  enemy.locomotion(moveSpeed);
}
function enemyPunch() {
  const e = GAME.enemy, p = GAME.player;
  enemy.once('Punch', 0.06, 0.5);
  const dir = p.pos.clone().sub(e.pos); dir.y = 0; dir.normalize();
  e.pos.addScaledVector(dir, 1.4);
  setTimeout(() => {
    if (e.pos.distanceTo(p.pos) < 2.8 && p.hp > 0) {
      damagePlayer(11);
      FX.burst(muzzle(p, 1.5, 0), COL.spark, 14, 6, 0.3, 1.0, 5);
    }
  }, 220);
}

// ----------------------------------------------------------------------------
//  Projectiles
// ----------------------------------------------------------------------------
function updateProjectiles(dt) {
  for (let i = GAME.projectiles.length - 1; i >= 0; i--) {
    const pr = GAME.projectiles[i];
    pr.v.y -= pr.grav * dt; pr.p.addScaledVector(pr.v, dt); pr.life -= dt;
    FX.spawn(pr.p.clone(), new THREE.Vector3(rand(-.5, .5), rand(-.2, .5), rand(-.5, .5)), Math.random() < .5 ? COL.emberHot : COL.emberDeep, rand(.2, .4), 2.0, 0.5);
    let hit = false;
    if (pr.side === 'player' && GAME.enemy.hp > 0 && pr.p.distanceTo(muzzle(GAME.enemy, 1.4, 0)) < pr.radius + 1.0) {
      damageEnemy(pr.dmg + rand(-1, 3));
      FX.burst(pr.p, COL.fire, 24, 7, 0.5, 2.2, 2); FX.burst(pr.p, COL.emberHot, 12, 5, 0.4, 1.5, 1);
      GAME.shake = Math.max(GAME.shake, 0.22); hit = true;
    }
    if (pr.p.y < 0.2) { FX.burst(new THREE.Vector3(pr.p.x, 0.15, pr.p.z), COL.fire, 12, 4, 0.4, 1.3, 3); hit = true; }
    if (hit || pr.life <= 0) GAME.projectiles.splice(i, 1);
  }
}

// ----------------------------------------------------------------------------
//  Visual sync
// ----------------------------------------------------------------------------
const FOOT = { y: 0 }; // model foot offset, set after load
function syncFighters(dt) {
  player.root.position.set(GAME.player.pos.x, FOOT.y + GAME.player.y, GAME.player.pos.z);
  player.root.rotation.y = GAME.player.facing;
  enemy.root.position.set(GAME.enemy.pos.x, GAME.enemy.hp <= 0 ? FOOT.y : FOOT.y, GAME.enemy.pos.z);
  enemy.root.rotation.y = GAME.enemy.facing;
  blobPlayer.position.set(GAME.player.pos.x, 0.05, GAME.player.pos.z);
  blobPlayer.material.opacity = clamp(1 - GAME.player.y * 0.4, 0.2, 1);
  blobEnemy.position.set(GAME.enemy.pos.x, 0.05, GAME.enemy.pos.z);
  player.update(dt); enemy.update(dt);

  // tail/hand fire aura while glowing
  if (player.glow > 0.2 && Math.random() < 0.6)
    FX.spawn(muzzle(GAME.player, 1.6, 0.8), new THREE.Vector3(rand(-.3, .3), rand(.5, 1.4), rand(-.3, .3)), COL.fire, rand(.3, .55), rand(1, 1.8), -1.5);
}

// ----------------------------------------------------------------------------
//  Camera
// ----------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = GAME.player.pos, e = GAME.enemy.pos;
  const mid = p.clone().add(e).multiplyScalar(0.5);
  const sep = p.distanceTo(e);
  const behind = p.clone().sub(e).setY(0);
  if (behind.lengthSq() < 0.01) behind.set(0, 0, 1);
  behind.normalize();
  const desired = mid.clone().add(behind.multiplyScalar(7.5 + sep * 0.4)).add(new THREE.Vector3(0, 5.5 + sep * 0.16, 0));
  camera.position.lerp(desired, 1 - Math.pow(0.0015, dt));
  camTarget.lerp(mid.clone().add(new THREE.Vector3(0, 1.6, 0)), 1 - Math.pow(0.0015, dt));
  if (GAME.shake > 0) {
    GAME.shake = Math.max(0, GAME.shake - dt * 1.6);
    const sh = GAME.shake * 0.6;
    camera.position.add(new THREE.Vector3(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
  }
  camera.lookAt(camTarget);
}

// ----------------------------------------------------------------------------
//  HUD refresh
// ----------------------------------------------------------------------------
function updateHUD(dt) {
  setBar($('playerHp'), GAME.player.hp / GAME.player.maxHp);
  setBar($('playerFlame'), GAME.player.flame / GAME.player.maxFlame);
  setBar($('enemyHp'), GAME.enemy.hp / GAME.enemy.maxHp);
  $('cdJ').style.height = (GAME.cooldowns.J / MOVES.J.cd * 100) + '%';
  $('cdK').style.height = (GAME.cooldowns.K / MOVES.K.cd * 100) + '%';
  $('cdL').style.height = ((1 - GAME.player.flame / GAME.player.maxFlame) * 100) + '%';
  if (announceTimer > 0) { announceTimer -= dt; if (announceTimer <= 0) $('announce').classList.remove('show'); }
}

// ----------------------------------------------------------------------------
//  Battle flow
// ----------------------------------------------------------------------------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function startBattle() {
  GAME.state = 'battle';
  const p = GAME.player, e = GAME.enemy;
  p.hp = p.maxHp; p.flame = p.maxFlame; p.pos.set(0, 0, 7); p.facing = Math.PI; p.y = 0; p.vy = 0; p.jumping = false;
  e.hp = e.maxHp; e.pos.set(0, 0, -7); e.ai = 1.2; e.tele = 0; e.lastTele = 0;
  GAME.projectiles.length = 0;
  GAME.cooldowns = { J: 0, K: 0, L: 0, dodge: 0 };
  enemy.root.rotation.set(0, 0, 0);
  player.dead = false; enemy.dead = false; player.lock = 0; enemy.lock = 0;
  player.play('Idle'); enemy.play('Idle');
  $('title').classList.add('hidden'); $('result').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  announce('FIGHT!', '#ffd23f');
}
function endBattle(win) {
  if (GAME.state !== 'battle') return;
  GAME.state = 'result';
  if (win) { enemy.dead = true; enemy.once('Death', 0.2); GAME.shake = Math.max(GAME.shake, 0.4); }
  else { player.dead = true; player.once('Death', 0.2); }
  setTimeout(() => {
    $('result').classList.remove('hidden'); $('touch').classList.add('hidden');
    const title = $('resultTitle'), text = $('resultText');
    if (win) {
      title.textContent = 'K.O.!'; title.className = 'win';
      text.textContent = 'The Rival Unit is scrap. Ember stands victorious — run it back?';
      for (let i = 0; i < 40; i++) FX.burst(muzzle(GAME.player, 1.6, 0), Math.random() < .5 ? COL.emberHot : COL.fire, 6, 9, 1.0, 2.2, 2);
    } else {
      title.textContent = 'DOWN'; title.className = 'lose';
      text.textContent = 'Ember was overwhelmed. Shake it off and try again.';
    }
  }, 1100);
}

// ----------------------------------------------------------------------------
//  Main loop
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  GAME.time += dt;
  if (GAME.state === 'battle') { updatePlayer(dt); updateEnemyAI(dt); updateProjectiles(dt); }
  else { player.locomotion(0); enemy.locomotion(0); }
  syncFighters(dt);
  FX.update(dt); updateDust(dt); updateCamera(dt);
  if (GAME.state === 'battle' || GAME.state === 'result') updateHUD(dt);
  composer.render();
  requestAnimationFrame(tick);
}

// ----------------------------------------------------------------------------
//  Load the rigged hero model, then boot
// ----------------------------------------------------------------------------
async function loadHero() {
  const urls = [
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
    'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
    'https://unpkg.com/three@0.160.0/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
  ];
  const loader = new GLTFLoader();
  let lastErr;
  for (const u of urls) {
    try {
      return await new Promise((res, rej) => loader.load(u,
        res,
        (ev) => { if (ev.total) setLoadMsg('Loading hero… ' + Math.round(ev.loaded / ev.total * 100) + '%'); },
        rej));
    } catch (e) { lastErr = e; }
  }
  throw new Error('Could not download the character model: ' + (lastErr && lastErr.message));
}

(async function boot() {
  try {
    setLoadMsg('Loading hero…');
    const gltf = await loadHero();

    // normalize model height so it's robust to the asset's native scale
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const h = box.max.y - box.min.y || 1;
    const targetH = 2.6;
    const s = targetH / h;
    gltf.scene.scale.multiplyScalar(s);   // scale on top of any native scale
    gltf.scene.updateMatrixWorld(true);
    FOOT.y = -box.min.y * s;               // box was measured at native scale

    player = new Fighter(gltf, 0xff7a1a, 0xff5a1e);   // Ember — orange, fire glow
    enemy = new Fighter(gltf, 0x3a4a6a, 0x224488);    // Rival Unit — steel blue

    // title-screen diorama poses
    GAME.player.pos.set(2.4, 0, 5.5); GAME.player.facing = Math.PI - 0.5;
    GAME.enemy.pos.set(-2.4, 0, -2.5); GAME.enemy.facing = 0.5;

    window.__charBooted = true;
    $('loading').classList.add('hidden');
    $('title').classList.remove('hidden');
    GAME.state = 'title';

    $('startBtn').addEventListener('click', startBattle);
    $('againBtn').addEventListener('click', startBattle);
    tick();
  } catch (err) {
    if (window.__charFail) window.__charFail('Could not start the game', (err && err.message) || String(err));
    throw err;
  }
})();
