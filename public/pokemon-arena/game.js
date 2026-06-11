// ============================================================================
// POKÉMON ARENA 3D v2 — Ash & Charmander survival battle
// Self-contained Three.js arcade game with HDR bloom, IBL, instanced grass,
// shader flames, homing combat, hit-stop, bosses and procedural music.
// Unofficial fan-made demo.
// ============================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ----------------------------------------------------------------------------
// Small math helpers
// ----------------------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// ----------------------------------------------------------------------------
// Renderer / scene / camera / post-processing
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
scene.fog = new THREE.Fog(0xa8c8e0, 70, 260);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);

// Image-based lighting so PBR materials get believable reflections
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.06).texture;
  pmrem.dispose();
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.8);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------------------------
// Lighting — warm golden-hour key light that follows the player
// ----------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x46622e, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffdfa6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x9db8ff, 0.35);
fill.position.set(-40, 30, -50);
scene.add(fill);

// ----------------------------------------------------------------------------
// Procedural textures
// ----------------------------------------------------------------------------
function canvasTex(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTex = canvasTex(64, (g) => {
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
});

// Turbulent fire puff — irregular blobs make flames look organic, not disc-like
const fireTex = canvasTex(128, (g) => {
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU), r = rand(0, 34);
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    const rad = rand(8, 26);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
});

const smokeTex = canvasTex(128, (g) => {
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU), r = rand(0, 30);
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    const rad = rand(12, 30);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(70,62,58,0.32)");
    grad.addColorStop(1, "rgba(70,62,58,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
});

const scorchTex = canvasTex(128, (g) => {
  g.clearRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, "rgba(12,8,6,0.85)");
  grad.addColorStop(0.55, "rgba(20,12,8,0.55)");
  grad.addColorStop(1, "rgba(20,12,8,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
});

// Ground detail map — grass with mottling and blade streaks, tinted by
// vertex colors underneath
const groundTex = canvasTex(512, (g, s) => {
  g.fillStyle = "#5d8a40";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 420; i++) {
    g.fillStyle = `rgba(${30 + Math.random() * 60 | 0},${70 + Math.random() * 70 | 0},${20 + Math.random() * 40 | 0},${rand(0.05, 0.16)})`;
    const x = rand(0, s), y = rand(0, s), r = rand(6, 42);
    g.beginPath();
    g.ellipse(x, y, r, r * rand(0.4, 1), rand(0, TAU), 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 1600; i++) {
    g.strokeStyle = `rgba(${40 + Math.random() * 70 | 0},${90 + Math.random() * 80 | 0},30,${rand(0.1, 0.3)})`;
    g.lineWidth = 1;
    const x = rand(0, s), y = rand(0, s), l = rand(2, 7);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rand(-2, 2), y - l);
    g.stroke();
  }
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(26, 26);
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// ----------------------------------------------------------------------------
// Sky — gradient dome, sun glare, drifting clouds, mountain ring
// ----------------------------------------------------------------------------
{
  const skyTex = canvasTex(1024, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, "#2e6fce");
    grad.addColorStop(0.4, "#7fb6e8");
    grad.addColorStop(0.62, "#c8dff2");
    grad.addColorStop(0.78, "#ffd9a0");
    grad.addColorStop(1, "#ffb36b");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(480, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c0, fog: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.setScalar(170);
  sunGlow.position.set(250, 210, 160);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, fog: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunCore.scale.setScalar(55);
  sunCore.position.copy(sunGlow.position);
  scene.add(sunCore);
}

const clouds = [];
{
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92,
    emissive: 0xffe8d0, emissiveIntensity: 0.12,
  });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(5, 10), 10, 8), cloudMat);
      puff.position.set(rand(-10, 10), rand(-1.5, 2), rand(-5, 5));
      puff.scale.y = 0.5;
      cloud.add(puff);
    }
    cloud.position.set(rand(-260, 260), rand(70, 130), rand(-260, 260));
    cloud.userData.speed = rand(0.5, 1.6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Distant mountain ring closes off the horizon
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e7486, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.8, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rand(-0.08, 0.08);
    const r = rand(190, 250);
    const h = rand(38, 95);
    const base = new THREE.Mesh(new THREE.ConeGeometry(rand(28, 55), h, 7), rockMat);
    base.position.set(Math.cos(a) * r, h * 0.32, Math.sin(a) * r);
    base.rotation.y = rand(0, TAU);
    scene.add(base);
    if (h > 60) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rand(9, 15), h * 0.26, 7), snowMat);
      cap.position.set(base.position.x, h * 0.85, base.position.z);
      cap.rotation.y = base.rotation.y;
      scene.add(cap);
    }
  }
}

// ----------------------------------------------------------------------------
// Terrain — flat sandy battle circle, multi-octave rolling hills around it
// ----------------------------------------------------------------------------
function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const flat = smoothstep(20, 50, d);
  const h =
    Math.sin(x * 0.021 + 3.1) * Math.cos(z * 0.017 + 1.7) * 3.8 +
    Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.9 +
    Math.sin(x * 0.13 + z * 0.11) * 0.55 +
    Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) * 0.22;
  return h * flat;
}

{
  const size = 360, segs = 170;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0xa8c986);
  const grassDark = new THREE.Color(0x7da45e);
  const sand = new THREE.Color(0xe0c890);
  const dirt = new THREE.Color(0xa08a64);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const d = Math.hypot(x, z);
    const sandMix = 1 - smoothstep(13, 19, d);
    const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + 0.5;
    const high = smoothstep(3.5, 6.5, h); // browner crests
    tmp.copy(grass).lerp(grassDark, n).lerp(dirt, high * 0.6).lerp(sand, sandMix);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: groundTex, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.25,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ----------------------------------------------------------------------------
// Instanced grass field with vertex-shader wind sway
// ----------------------------------------------------------------------------
const uWind = { value: 0 };
{
  const blade = new THREE.ConeGeometry(0.055, 1, 4, 3);
  blade.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: 0.2 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vec4 gw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uWind * 2.1 + gw.x * 0.35 + gw.z * 0.43) * 0.22 * position.y;
          transformed.x += sway;
          transformed.z += sway * 0.55;
        }`);
  };
  const COUNT = 3200;
  const grassMesh = new THREE.InstancedMesh(blade, mat, COUNT);
  grassMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const a = rand(0, TAU), r = 19 + Math.pow(Math.random(), 0.7) * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    e.set(rand(-0.12, 0.12), rand(0, TAU), rand(-0.12, 0.12));
    q.setFromEuler(e);
    s.set(rand(0.8, 1.6), rand(0.5, 1.5), rand(0.8, 1.6));
    m.compose(new THREE.Vector3(x, terrainHeight(x, z), z), q, s);
    grassMesh.setMatrixAt(i, m);
    c.setHSL(rand(0.23, 0.3), rand(0.45, 0.62), rand(0.3, 0.48));
    grassMesh.setColorAt(i, c);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  scene.add(grassMesh);
}

// ----------------------------------------------------------------------------
// Scenery: arena stones, natural trees, craggy rocks
// ----------------------------------------------------------------------------
function jitterGeometry(geo, amt) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + rand(-amt, amt);
    pos.setXYZ(i, v.x * k, v.y * (1 + rand(-amt, amt)), v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

{
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8d96, roughness: 0.92, flatShading: true });
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x445, roughness: 0.6, emissive: 0xff8830, emissiveIntensity: 0.9,
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const x = Math.cos(a) * 17.5, z = Math.sin(a) * 17.5;
    const stone = new THREE.Mesh(
      jitterGeometry(new THREE.BoxGeometry(rand(0.9, 1.4), rand(1.6, 2.7), rand(0.8, 1.2), 2, 3, 2), 0.1),
      stoneMat);
    stone.position.set(x, terrainHeight(x, z) + 0.8, z);
    stone.rotation.y = rand(0, TAU);
    stone.rotation.z = rand(-0.1, 0.1);
    stone.castShadow = stone.receiveShadow = true;
    scene.add(stone);
    // glowing rune chip — pops nicely with bloom
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.05), runeMat);
    rune.position.set(x * 0.95, terrainHeight(x, z) + 1.2, z * 0.95);
    rune.lookAt(0, 1.2, 0);
    scene.add(rune);
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  for (let i = 0; i < 55; i++) {
    const a = rand(0, TAU), r = rand(27, 125);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const tree = new THREE.Group();
    const sc = rand(0.9, 1.9);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * sc, 0.32 * sc, 2.6 * sc, 7), trunkMat);
    trunk.position.y = 1.3 * sc;
    trunk.rotation.z = rand(-0.06, 0.06);
    trunk.castShadow = true;
    tree.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rand(0.22, 0.32), rand(0.4, 0.6), rand(0.28, 0.42)),
      roughness: 1, flatShading: true, envMapIntensity: 0.25,
    });
    const blobs = 4 + (i % 3);
    for (let j = 0; j < blobs; j++) {
      const blob = new THREE.Mesh(
        jitterGeometry(new THREE.DodecahedronGeometry(rand(0.8, 1.4) * sc, 1), 0.12), leafMat);
      blob.position.set(rand(-0.9, 0.9) * sc, (2.6 + rand(0, 1.3)) * sc, rand(-0.9, 0.9) * sc);
      blob.scale.y = rand(0.7, 0.95);
      blob.castShadow = true;
      tree.add(blob);
    }
    tree.position.set(x, y, z);
    scene.add(tree);
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x97918a, roughness: 1, flatShading: true });
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU), r = rand(24, 115);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rock = new THREE.Mesh(
      jitterGeometry(new THREE.DodecahedronGeometry(rand(0.5, 1.8), 1), 0.22), rockMat);
    rock.position.set(x, terrainHeight(x, z) + 0.25, z);
    rock.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }
}

// ----------------------------------------------------------------------------
// Scorch decals + shockwave rings (pooled)
// ----------------------------------------------------------------------------
const scorches = [];
function addScorch(pos, radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({
      map: scorchTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rand(0, TAU);
  m.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.04, pos.z);
  scene.add(m);
  scorches.push({ mesh: m, life: 9 });
  if (scorches.length > 18) {
    const old = scorches.shift();
    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
}
function updateScorches(dt) {
  for (let i = scorches.length - 1; i >= 0; i--) {
    const s = scorches[i];
    s.life -= dt;
    s.mesh.material.opacity = clamp(s.life / 4, 0, 1);
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      scorches.splice(i, 1);
    }
  }
}

const shockwaves = [];
function addShockwave(pos, maxR, color = 0xffa040) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.8, 32),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.15, pos.z);
  scene.add(m);
  shockwaves.push({ mesh: m, t: 0, maxR });
}
function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.t += dt * 2.6;
    const k = Math.min(w.t, 1);
    w.mesh.scale.setScalar(1 + k * w.maxR);
    w.mesh.material.opacity = 0.9 * (1 - k);
    if (k >= 1) {
      scene.remove(w.mesh);
      w.mesh.geometry.dispose();
      w.mesh.material.dispose();
      shockwaves.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Character helpers
// ----------------------------------------------------------------------------
function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.5, ...opts,
  });
}
function shadowed(mesh) {
  mesh.castShadow = true;
  return mesh;
}

// ----------------------------------------------------------------------------
// ASH — the trainer you control
// ----------------------------------------------------------------------------
function buildAsh() {
  const g = new THREE.Group();
  const skin = std(0xf0c8a0, { roughness: 0.55 });
  const jacket = std(0x2b5dd7, { roughness: 0.5 });
  const white = std(0xf2f2f2, { roughness: 0.55 });
  const jeans = std(0x3a4a6b, { roughness: 0.8 });
  const red = std(0xe23b3b, { roughness: 0.45 });
  const green = std(0x3fae5a, { roughness: 0.5 });

  const torso = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.64, 14), jacket));
  torso.position.y = 1.05;
  g.add(torso);
  const chest = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.5, 0.16), white));
  chest.position.set(0, 1.05, 0.13);
  g.add(chest);
  const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 14), white));
  collar.position.y = 1.38;
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  // backpack
  const pack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), green));
  pack.position.set(0, 1.08, -0.25);
  g.add(pack);

  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), skin));
  head.position.y = 1.62;
  g.add(head);
  const hair = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 14, 10, 0, TAU, 0, Math.PI * 0.55),
    std(0x1c1c22, { roughness: 0.8 })));
  hair.position.y = 1.65;
  g.add(hair);
  const capTop = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 12, 0, TAU, 0, Math.PI * 0.5), red));
  capTop.position.y = 1.7;
  g.add(capTop);
  const capPanel = new THREE.Mesh(new THREE.SphereGeometry(0.262, 16, 8, -0.55, 1.1, 0.25, 0.55), white);
  capPanel.position.y = 1.7;
  capPanel.rotation.y = Math.PI; // front panel
  g.add(capPanel);
  const brim = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.045, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84), red));
  brim.scale.z = 1.7;
  brim.position.set(0, 1.7, 0.16);
  g.add(brim);
  const eyeMat = std(0x222222, { roughness: 0.25 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eye.position.set(sx * 0.09, 1.64, 0.21);
    g.add(eye);
  }

  const parts = { arms: [], legs: [] };
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.52, 10), jacket));
    upper.position.y = -0.26;
    arm.add(upper);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), green);
    glove.position.y = -0.55;
    arm.add(glove);
    arm.position.set(sx * 0.34, 1.32, 0);
    g.add(arm);
    parts.arms.push(arm);

    const leg = new THREE.Group();
    const thigh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.62, 10), jeans));
    thigh.position.y = -0.31;
    leg.add(thigh);
    const shoe = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), red));
    shoe.position.set(0, -0.66, 0.05);
    leg.add(shoe);
    leg.position.set(sx * 0.14, 0.72, 0);
    g.add(leg);
    parts.legs.push(leg);
  }

  g.userData.parts = parts;
  return g;
}

// ----------------------------------------------------------------------------
// CHARMANDER — your partner, with a shader-driven tail flame
// ----------------------------------------------------------------------------
const flameUniforms = { uTime: { value: 0 }, uBoost: { value: 1 } };

function makeFlameMesh(radius, height) {
  const geo = new THREE.ConeGeometry(radius, height, 12, 8, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: flameUniforms,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float sway = sin(uTime * 14.0 + p.y * 6.0) * 0.10 * uv.y
                   + sin(uTime * 23.0 + p.y * 11.0) * 0.05 * uv.y;
        p.x += sway;
        p.z += sway * 0.7;
        p.x *= 1.0 + sin(uTime * 17.0) * 0.12 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        float y = vUv.y;
        float n = noise(vec2(vUv.x * 6.0, y * 4.0 - uTime * 3.2));
        float edge = smoothstep(0.0, 0.25, 1.0 - y) * smoothstep(1.0, 0.65, 1.0 - y + (n - 0.5) * 0.7);
        float core = smoothstep(0.55, 0.0, y + (n - 0.5) * 0.4);
        vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.62, 0.08), core);
        col = mix(col, vec3(1.0, 0.95, 0.55), core * core);
        float a = edge * (0.55 + 0.45 * n) * uBoost;
        gl_FragColor = vec4(col * (1.2 + core * 1.6) * uBoost, a);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function buildCharmander() {
  const g = new THREE.Group();
  const orangeMat = std(0xff7a1e, { roughness: 0.45 });
  const creamMat = std(0xffe2a8, { roughness: 0.5 });
  const bodyMats = [orangeMat];

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 18), orangeMat));
  body.scale.set(1, 1.18, 0.92);
  body.position.y = 0.55;
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 16), creamMat);
  belly.scale.set(0.9, 1.05, 0.62);
  belly.position.set(0, 0.52, 0.16);
  g.add(belly);

  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 18), orangeMat));
  head.scale.set(1, 0.95, 1);
  head.position.y = 1.18;
  g.add(head);
  const snout = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 14), orangeMat));
  snout.scale.set(1, 0.68, 1.1);
  snout.position.set(0, 1.08, 0.27);
  g.add(snout);
  // mouth line + nostrils
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.1),
    std(0x7a2e08, { roughness: 0.7 }));
  mouth.position.set(0, 1.04, 0.36);
  g.add(mouth);
  // brow ridges
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), orangeMat);
    brow.scale.set(1.1, 0.5, 0.8);
    brow.position.set(sx * 0.14, 1.36, 0.22);
    g.add(brow);
  }

  const eyeWhite = std(0xffffff, { roughness: 0.15 });
  const pupilMat = std(0x14206e, { roughness: 0.1 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 12), eyeWhite);
    ew.position.set(sx * 0.14, 1.26, 0.26);
    g.add(ew);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), pupilMat);
    pupil.position.set(sx * 0.14, 1.26, 0.325);
    g.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), shineMat);
    shine.position.set(sx * 0.125, 1.285, 0.36);
    g.add(shine);
  }

  const clawMat = std(0xf5f0e0, { roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.078, 0.34, 10), orangeMat));
    arm.position.set(sx * 0.42, 0.72, 0.1);
    arm.rotation.z = sx * -0.6;
    arm.rotation.x = -0.35;
    g.add(arm);
    for (let cI = -1; cI <= 1; cI++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), clawMat);
      claw.position.set(sx * 0.52 + cI * 0.025, 0.58, 0.2);
      claw.rotation.x = Math.PI * 0.55;
      g.add(claw);
    }
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.135, 0.3, 10), orangeMat));
    leg.position.set(sx * 0.2, 0.16, 0);
    g.add(leg);
    const foot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), creamMat));
    foot.scale.set(1, 0.55, 1.45);
    foot.position.set(sx * 0.2, 0.05, 0.08);
    g.add(foot);
    for (let cI = -1; cI <= 1; cI++) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 6), clawMat);
      nail.position.set(sx * 0.2 + cI * 0.05, 0.05, 0.26);
      nail.rotation.x = Math.PI / 2;
      g.add(nail);
    }
  }

  const tailPts = [
    [0, 0.5, -0.36], [0, 0.42, -0.62], [0, 0.46, -0.86], [0, 0.62, -1.0], [0, 0.84, -1.06],
  ];
  tailPts.forEach((p, i) => {
    const seg = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.02, 12, 12), orangeMat));
    seg.position.set(...p);
    g.add(seg);
  });

  // shader flame, inner hot core, glow sprite, flickering light
  const flame = new THREE.Group();
  flame.add(makeFlameMesh(0.18, 0.62));
  const inner = makeFlameMesh(0.1, 0.4);
  inner.position.y = 0.02;
  flame.add(inner);
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffa030, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flameGlow.scale.setScalar(1.25);
  flameGlow.position.y = 0.26;
  flame.add(flameGlow);
  const flameLight = new THREE.PointLight(0xff7722, 9, 9, 2);
  flameLight.position.y = 0.32;
  flame.add(flameLight);
  flame.position.set(0, 0.92, -1.1);
  g.add(flame);

  g.userData.flame = flame;
  g.userData.flameLight = flameLight;
  g.userData.bodyMats = bodyMats;
  return g;
}

// ----------------------------------------------------------------------------
// Enemy species
// ----------------------------------------------------------------------------
const SPECIES = {
  rockor: {
    name: "ROCKOR", hp: 85, speed: 2.1, damage: 12, range: 3.0, attackCd: 2.2,
    score: 150, xp: 38, projectile: null,
    build() {
      const g = new THREE.Group();
      const rock = std(0x8e887e, { roughness: 1, flatShading: true });
      const moss = std(0x5a7a3a, { roughness: 1 });
      const body = shadowed(new THREE.Mesh(
        jitterGeometry(new THREE.DodecahedronGeometry(0.62, 1), 0.12), rock));
      body.position.y = 0.72;
      g.add(body);
      const mossPatch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), moss);
      mossPatch.scale.set(1, 0.35, 1);
      mossPatch.position.set(0.1, 1.18, -0.1);
      g.add(mossPatch);
      const head = shadowed(new THREE.Mesh(
        jitterGeometry(new THREE.DodecahedronGeometry(0.34, 1), 0.12), rock));
      head.position.y = 1.42;
      g.add(head);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x332200, emissive: 0xffb830, emissiveIntensity: 2.2,
      });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
        eye.position.set(sx * 0.15, 1.46, 0.28);
        g.add(eye);
        const fist = shadowed(new THREE.Mesh(
          jitterGeometry(new THREE.DodecahedronGeometry(0.26, 1), 0.15), rock));
        fist.position.set(sx * 0.78, 0.6, 0.1);
        g.add(fist);
      }
      return g;
    },
  },
  vinex: {
    name: "VINEX", hp: 58, speed: 2.9, damage: 9, range: 13, attackCd: 2.5,
    score: 120, xp: 30, projectile: { color: 0x88ee33, speed: 15, size: 0.16 },
    build() {
      const g = new THREE.Group();
      const green = std(0x49a83c, { roughness: 0.6 });
      const dark = std(0x2e7029, { roughness: 0.7 });
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 16), green));
      body.scale.set(1, 0.85, 1.1);
      body.position.y = 0.55;
      g.add(body);
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), dark));
      bulb.scale.set(1, 1.25, 1);
      bulb.position.set(0, 1.05, -0.15);
      g.add(bulb);
      const leafMat = std(0x5fce4a, { side: THREE.DoubleSide, roughness: 0.7 });
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 5), leafMat);
        const a = (i / 5) * TAU;
        leaf.position.set(Math.cos(a) * 0.22, 1.34, Math.sin(a) * 0.22 - 0.15);
        leaf.rotation.set(Math.sin(a) * 0.85, 0, Math.cos(a) * -0.85);
        g.add(leaf);
      }
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x220000, emissive: 0xff3030, emissiveIntensity: 2,
      });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
        eye.position.set(sx * 0.18, 0.68, 0.45);
        g.add(eye);
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 8), green));
        leg.position.set(sx * 0.24, 0.15, 0);
        g.add(leg);
      }
      return g;
    },
  },
  aquish: {
    name: "AQUISH", hp: 48, speed: 4.2, damage: 8, range: 11, attackCd: 1.9,
    score: 110, xp: 26, projectile: { color: 0x44aaff, speed: 19, size: 0.14 },
    build() {
      const g = new THREE.Group();
      const blue = std(0x3a8fd9, { roughness: 0.25, metalness: 0.15, envMapIntensity: 0.9 });
      const lite = std(0x9fd8ff, { roughness: 0.35 });
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 16), blue));
      body.scale.set(1, 0.95, 1.25);
      body.position.y = 0.6;
      g.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), lite);
      belly.scale.set(0.85, 0.8, 0.9);
      belly.position.set(0, 0.5, 0.22);
      g.add(belly);
      const finMat = std(0x2a6faf, { side: THREE.DoubleSide, roughness: 0.4 });
      const fin = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), finMat));
      fin.position.set(0, 1.1, -0.1);
      fin.rotation.x = -0.3;
      g.add(fin);
      const tail = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), finMat));
      tail.position.set(0, 0.6, -0.72);
      tail.rotation.x = Math.PI / 2;
      g.add(tail);
      const eyeMat = std(0x113355, { roughness: 0.1 });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), eyeMat);
        eye.position.set(sx * 0.2, 0.78, 0.42);
        g.add(eye);
      }
      return g;
    },
  },
};

// ----------------------------------------------------------------------------
// Particle system — pooled sprites, additive fire or normal-blend smoke
// ----------------------------------------------------------------------------
const MAX_PARTICLES = 900;
const particles = [];
const firePool = [];
const smokePool = [];
const ZERO3 = new THREE.Vector3();

function spawnParticle(opts) {
  const smoke = !!opts.smoke;
  const pool = smoke ? smokePool : firePool;
  let p;
  if (pool.length) {
    p = pool.pop();
  } else {
    if (particles.length >= MAX_PARTICLES) return null;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smoke ? smokeTex : fireTex,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    }));
    p = { sprite, vel: new THREE.Vector3(), smoke };
    scene.add(sprite);
  }
  p.sprite.visible = true;
  p.sprite.material.color.set(opts.color ?? 0xffaa33);
  p.sprite.material.rotation = rand(0, TAU);
  p.sprite.position.copy(opts.pos);
  p.vel.copy(opts.vel ?? ZERO3);
  p.life = p.maxLife = opts.life ?? 0.6;
  p.size = opts.size ?? 0.5;
  p.endSize = opts.endSize ?? p.size * 0.25;
  p.gravity = opts.gravity ?? 0;
  p.drag = opts.drag ?? 0;
  p.spin = opts.spin ?? rand(-2, 2);
  p.sprite.scale.setScalar(p.size);
  particles.push(p);
  return p;
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.sprite.visible = false;
      particles.splice(i, 1);
      (p.smoke ? smokePool : firePool).push(p);
      continue;
    }
    p.vel.y -= p.gravity * dt;
    if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.sprite.position.addScaledVector(p.vel, dt);
    p.sprite.material.rotation += p.spin * dt;
    const t = 1 - p.life / p.maxLife;
    p.sprite.scale.setScalar(lerp(p.size, p.endSize, t));
    p.sprite.material.opacity = (1 - t * t) * 0.95;
  }
}

function burst(pos, { count = 14, color = 0xff8822, speed = 6, size = 0.55, life = 0.55, up = 2 } = {}) {
  for (let i = 0; i < count; i++) {
    spawnParticle({
      pos, color, size: size * rand(0.6, 1.4), life: life * rand(0.6, 1.3),
      vel: new THREE.Vector3(rand(-1, 1), rand(0, 1) * up / 2 + 0.3, rand(-1, 1))
        .normalize().multiplyScalar(speed * rand(0.4, 1.25)),
      gravity: 4, drag: 1.5,
    });
  }
}

function explosionFX(pos, scale = 1) {
  burst(pos, { count: Math.round(30 * scale), color: 0xff6611, speed: 11 * scale, size: 1.2 * scale, life: 0.8 });
  burst(pos, { count: Math.round(14 * scale), color: 0xffdd55, speed: 7 * scale, size: 0.8 * scale, life: 0.5 });
  for (let i = 0; i < 8 * scale; i++) {
    spawnParticle({
      pos, smoke: true, color: 0x554c44, size: rand(1, 2) * scale, endSize: 3.4 * scale,
      life: rand(0.9, 1.6),
      vel: new THREE.Vector3(rand(-1.5, 1.5), rand(1.5, 3.2), rand(-1.5, 1.5)),
      drag: 0.8, spin: rand(-1, 1),
    });
  }
  // glowing embers with gravity
  for (let i = 0; i < 10 * scale; i++) {
    spawnParticle({
      pos, color: 0xffcc66, size: rand(0.1, 0.22), endSize: 0.03, life: rand(0.6, 1.2),
      vel: new THREE.Vector3(rand(-1, 1), rand(0.7, 1), rand(-1, 1)).normalize().multiplyScalar(rand(5, 12) * scale),
      gravity: 11,
    });
  }
  addShockwave(pos, 5.5 * scale);
  addScorch(pos, 1.6 * scale);
}

// ----------------------------------------------------------------------------
// Floating damage numbers
// ----------------------------------------------------------------------------
const dmgNumbers = [];
function spawnDamageNumber(pos, amount, { color = "#ffd24d", crit = false } = {}) {
  const c = document.createElement("canvas");
  c.width = 192; c.height = 80;
  const g = c.getContext("2d");
  const text = crit ? `${Math.round(amount)}!` : String(Math.round(amount));
  g.font = `700 ${crit ? 58 : 44}px Rajdhani, sans-serif`;
  g.textAlign = "center";
  g.lineWidth = crit ? 9 : 7;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(text, 96, 56);
  g.fillStyle = crit ? "#ff5e3a" : color;
  g.fillText(text, 96, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(crit ? 2.6 : 1.9, crit ? 1.1 : 0.8, 1);
  sprite.position.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), rand(0.2, 0.6), 0));
  scene.add(sprite);
  dmgNumbers.push({ sprite, life: crit ? 1.1 : 0.9 });
}
function updateDamageNumbers(dt) {
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.life -= dt;
    d.sprite.position.y += dt * 1.7;
    d.sprite.material.opacity = clamp(d.life / 0.4, 0, 1);
    if (d.life <= 0) {
      d.sprite.material.map.dispose();
      d.sprite.material.dispose();
      scene.remove(d.sprite);
      dmgNumbers.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Audio — procedural WebAudio SFX + ambient battle music
// ----------------------------------------------------------------------------
const AudioSys = {
  ctx: null, master: null, muted: false, musicNext: 0, musicStep: 0,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.musicNext = this.ctx.currentTime + 0.3;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },
  noise({ dur = 0.4, freq = 1200, q = 1, gain = 0.5, sweep = 0.3, at = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = at || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(freq, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    filt.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  },
  tone({ freq = 440, dur = 0.15, type = "square", gain = 0.18, slide = 1, at = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = at || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },
  fire() { this.noise({ dur: 0.35, freq: 1800, gain: 0.4, sweep: 0.25 }); },
  flamethrower() { this.noise({ dur: 1.3, freq: 900, q: 0.7, gain: 0.35, sweep: 0.8 }); },
  hit() { this.tone({ freq: 220, dur: 0.12, type: "square", gain: 0.2, slide: 0.5 }); this.noise({ dur: 0.12, freq: 2500, gain: 0.25, sweep: 0.4 }); },
  crit() { this.tone({ freq: 520, dur: 0.16, type: "square", gain: 0.24, slide: 0.4 }); this.noise({ dur: 0.18, freq: 3200, gain: 0.3, sweep: 0.3 }); },
  hurt() { this.tone({ freq: 160, dur: 0.25, type: "sawtooth", gain: 0.22, slide: 0.4 }); },
  explosion() { this.noise({ dur: 0.7, freq: 500, q: 0.6, gain: 0.6, sweep: 0.12 }); this.tone({ freq: 80, dur: 0.5, type: "sine", gain: 0.4, slide: 0.4 }); },
  ko() { this.tone({ freq: 600, dur: 0.4, type: "square", gain: 0.18, slide: 0.2 }); },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.25 }), i * 110));
  },
  waveStart() {
    [392, 523].forEach((f, i) =>
      setTimeout(() => this.tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.22 }), i * 150));
  },
  // sparse pentatonic battle loop, scheduled slightly ahead of playback
  updateMusic(running) {
    if (!this.ctx || this.muted || !running) return;
    // skip ahead instead of cramming missed notes after a backgrounded tab
    if (this.musicNext < this.ctx.currentTime - 0.2) this.musicNext = this.ctx.currentTime;
    const stepDur = 0.22;
    const lead = [0, -1, 2, -1, 4, -1, 3, 1, 0, -1, 2, 4, -1, 3, -1, 1];
    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    while (this.musicNext < this.ctx.currentTime + 0.3) {
      const s = this.musicStep % 16;
      const t = this.musicNext;
      if (s % 4 === 0) {
        const bass = [110, 110, 87.3, 98][(Math.floor(this.musicStep / 4)) % 4];
        this.tone({ freq: bass, dur: 0.4, type: "triangle", gain: 0.075, at: t });
        this.tone({ freq: 55, dur: 0.1, type: "sine", gain: 0.1, slide: 0.6, at: t });
      }
      if (s % 2 === 1) this.noise({ dur: 0.04, freq: 7000, gain: 0.025, sweep: 0.9, at: t });
      const li = lead[s];
      if (li >= 0) this.tone({ freq: scale[li], dur: 0.18, type: "triangle", gain: 0.045, at: t });
      this.musicNext += stepDur;
      this.musicStep++;
    }
  },
};

// ----------------------------------------------------------------------------
// HUD references
// ----------------------------------------------------------------------------
const HUD = {
  hpFill: document.getElementById("hp-fill"),
  hpLabel: document.getElementById("hp-label"),
  xpFill: document.getElementById("xp-fill"),
  lvlLabel: document.getElementById("lvl-label"),
  pkmnName: document.getElementById("pkmn-name"),
  waveLabel: document.getElementById("wave-label"),
  scoreLabel: document.getElementById("score-label"),
  enemiesLeft: document.getElementById("enemies-left"),
  targetPanel: document.getElementById("target-panel"),
  targetName: document.getElementById("target-name"),
  targetHpFill: document.getElementById("target-hp-fill"),
  targetHpLabel: document.getElementById("target-hp-label"),
  announce: document.getElementById("announce"),
  callout: document.getElementById("callout"),
  combo: document.getElementById("combo"),
  vignette: document.getElementById("vignette"),
  muteHint: document.getElementById("mute-hint"),
  moves: [1, 2, 3, 4].map(i => {
    const el = document.getElementById(`move-${i}`);
    return { el, shade: el.querySelector(".cd-shade"), num: el.querySelector(".cd-num") };
  }),
};

let announceTimer = null;
function announce(text, ms = 2200) {
  HUD.announce.textContent = text;
  HUD.announce.style.opacity = "1";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { HUD.announce.style.opacity = "0"; }, ms);
}
let calloutTimer = null;
function callout(html, ms = 1800) {
  HUD.callout.innerHTML = html;
  HUD.callout.style.opacity = "1";
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => { HUD.callout.style.opacity = "0"; }, ms);
}

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------
const state = {
  running: false,
  over: false,
  time: 0,
  timeScale: 1,
  score: 0,
  wave: 0,
  level: 1,
  xp: 0,
  xpNeeded: 60,
  evolved: false,
  shake: 0,
  fovKick: 0,
  combo: 0,
  comboTimer: 0,
  waveCooldown: 0,
  spawnQueue: 0,
  spawnTimer: 0,
  bossQueued: false,
};

const charmander = {
  group: buildCharmander(),
  pos: new THREE.Vector3(1.8, 0, 2.5),
  yaw: 0,
  hp: 100,
  maxHp: 100,
  dmgMul: 1,
  flameActive: 0,
  flameDir: new THREE.Vector3(0, 0, 1),
  lunge: 0,
  autoTimer: 1.5,
};
scene.add(charmander.group);

const ash = {
  group: buildAsh(),
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  walkPhase: 0,
  speed: 0,
};
scene.add(ash.group);

const enemies = [];
const projectiles = [];
const fireSpins = [];

const MOVES = [
  { cd: 0.8, timer: 0 },
  { cd: 4.0, timer: 0 },
  { cd: 7.0, timer: 0 },
  { cd: 9.0, timer: 0 },
];

function hitStop(amount = 0.18, fov = 4) {
  state.timeScale = Math.min(state.timeScale, amount);
  state.fovKick = Math.max(state.fovKick, fov);
}

function bumpCombo(crit) {
  state.combo++;
  state.comboTimer = 3;
  if (state.combo >= 2) {
    HUD.combo.innerHTML = crit
      ? `×${state.combo} COMBO <span class="crit">CRIT!</span>`
      : `×${state.combo} COMBO`;
    HUD.combo.style.opacity = "1";
    HUD.combo.classList.remove("pop");
    void HUD.combo.offsetWidth; // restart the pop animation
    HUD.combo.classList.add("pop");
    setTimeout(() => HUD.combo.classList.remove("pop"), 100);
  }
}

// ----------------------------------------------------------------------------
// Camera control (pointer lock orbit)
// ----------------------------------------------------------------------------
const cam = { yaw: 0.4, pitch: 0.32, dist: 7.5 };
const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Tab") { e.preventDefault(); cycleTarget(); }
  if (e.code === "KeyM") {
    const muted = AudioSys.toggleMute();
    HUD.muteHint.textContent = muted ? "🔇 muted" : "";
  }
  if (state.running && !state.over) {
    if (e.code === "Digit1") useMove(0);
    if (e.code === "Digit2") useMove(1);
    if (e.code === "Digit3") useMove(2);
    if (e.code === "Digit4") useMove(3);
  }
});
document.addEventListener("keyup", (e) => { keys[e.code] = false; });

renderer.domElement.addEventListener("click", () => {
  if (state.running) renderer.domElement.requestPointerLock();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  cam.yaw -= e.movementX * 0.0024;
  cam.pitch = clamp(cam.pitch + e.movementY * 0.0019, -0.15, 1.05);
});

// ----------------------------------------------------------------------------
// Targeting
// ----------------------------------------------------------------------------
let target = null;
const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.1, 0.06, 8, 36),
  new THREE.MeshBasicMaterial({
    color: 0xff5544, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
targetRing.rotation.x = -Math.PI / 2;
targetRing.visible = false;
scene.add(targetRing);

function pickTarget() {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = e.pos.distanceTo(charmander.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
function cycleTarget() {
  const alive = enemies.filter(e => !e.dead);
  if (!alive.length) { target = null; return; }
  alive.sort((a, b) => a.pos.distanceTo(charmander.pos) - b.pos.distanceTo(charmander.pos));
  const i = alive.indexOf(target);
  target = alive[(i + 1) % alive.length];
}

// ----------------------------------------------------------------------------
// Attacks
// ----------------------------------------------------------------------------
function charmanderMouth() {
  const fwd = new THREE.Vector3(Math.sin(charmander.yaw), 0, Math.cos(charmander.yaw));
  const s = charmander.group.scale.x;
  return charmander.pos.clone().add(fwd.multiplyScalar(0.45 * s)).add(new THREE.Vector3(0, 1.1 * s, 0));
}
function aimDirAt(targetPos, from) {
  return targetPos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(from).normalize();
}

function useMove(i) {
  const move = MOVES[i];
  if (move.timer > 0) return;
  if (!target || target.dead) target = pickTarget();
  if (!target) { callout("No wild Pokémon in sight!"); return; }

  const to = target.pos.clone().sub(charmander.pos);
  charmander.yaw = Math.atan2(to.x, to.z);
  charmander.lunge = 0.25;
  move.timer = move.cd;

  const mouth = charmanderMouth();
  const names = ["EMBER", "FLAMETHROWER", "FIRE SPIN", "FLAME BURST"];
  callout(`Ash: “Charmander, use <b>${names[i]}</b>!”`);

  if (i === 0) {
    AudioSys.fire();
    for (let j = 0; j < 3; j++) {
      setTimeout(() => {
        if (!target || target.dead) target = pickTarget();
        if (!target) return;
        const from = charmanderMouth();
        spawnProjectile({
          pos: from, dir: aimDirAt(target.pos, from), speed: 26, size: 0.22, color: 0xff7711,
          damage: 14 * charmander.dmgMul, friendly: true, trail: 0xffaa33,
          homing: 6, targetRef: target,
        });
      }, j * 110);
    }
  } else if (i === 1) {
    AudioSys.flamethrower();
    charmander.flameActive = 1.5;
    charmander.flameDir.copy(aimDirAt(target.pos, mouth));
  } else if (i === 2) {
    AudioSys.noise({ dur: 0.9, freq: 1400, gain: 0.4, sweep: 0.5 });
    const light = new THREE.PointLight(0xff6611, 9, 10, 2);
    scene.add(light);
    fireSpins.push({ enemy: target, life: 4, light });
    addShockwave(target.pos, 3, 0xff7722);
  } else if (i === 3) {
    AudioSys.fire();
    const dist = target.pos.distanceTo(mouth);
    const dir = aimDirAt(target.pos, mouth);
    dir.y += clamp(dist * 0.025, 0.15, 0.55);
    dir.normalize();
    spawnProjectile({
      pos: mouth, dir, speed: 21, size: 0.45, color: 0xff5500,
      damage: 55 * charmander.dmgMul, friendly: true, trail: 0xff7722,
      gravity: 8, aoe: 6,
    });
  }
}

// ----------------------------------------------------------------------------
// Projectiles — friendly shots home in on their target
// ----------------------------------------------------------------------------
function spawnProjectile({ pos, dir, speed, size, color, damage, friendly, trail, gravity = 0, aoe = 0, homing = 0, targetRef = null }) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
  group.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(size * 7);
  group.add(glow);
  const light = new THREE.PointLight(color, 6, 9, 2);
  group.add(light);
  group.position.copy(pos);
  scene.add(group);
  projectiles.push({
    group, vel: dir.clone().multiplyScalar(speed), speed,
    damage, friendly, trail, gravity, aoe, size, color, life: 4,
    homing, targetRef,
  });
}

function explodeProjectile(p, hitPos) {
  if (p.aoe > 0) {
    AudioSys.explosion();
    state.shake = Math.max(state.shake, 0.5);
    hitStop(0.12, 6);
    explosionFX(hitPos, 1.2);
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(hitPos);
      if (d < p.aoe) {
        const dmg = p.damage * (1 - d / p.aoe * 0.6);
        damageEnemy(e, dmg);
        const push = e.pos.clone().sub(hitPos).setY(0).normalize().multiplyScalar(7 * (1 - d / p.aoe));
        e.knock.add(push);
      }
    }
  } else {
    burst(hitPos, { count: 10, color: p.color, speed: 5, size: 0.5, life: 0.4 });
  }
}

const tmpAim = new THREE.Vector3();
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;

    // steer toward a live target — guarantees the player's shots connect
    if (p.homing > 0 && p.targetRef && !p.targetRef.dead) {
      tmpAim.copy(p.targetRef.pos).add(new THREE.Vector3(0, 0.8, 0)).sub(p.group.position)
        .normalize().multiplyScalar(p.speed);
      p.vel.lerp(tmpAim, Math.min(1, p.homing * dt));
      p.vel.setLength(p.speed);
    }

    p.vel.y -= p.gravity * dt;
    p.group.position.addScaledVector(p.vel, dt);
    const pos = p.group.position;

    if (p.trail) {
      spawnParticle({
        pos, color: p.trail, size: p.size * 2.6, endSize: 0.05, life: 0.35,
        vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5)),
      });
    }

    let dead = p.life <= 0;

    const groundY = terrainHeight(pos.x, pos.z);
    if (!dead && pos.y <= groundY + 0.15) {
      pos.y = groundY + 0.15;
      explodeProjectile(p, pos.clone());
      dead = true;
    }

    if (!dead && p.friendly) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (pos.distanceTo(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0))) < e.radius + p.size + 0.5) {
          if (p.aoe > 0) {
            explodeProjectile(p, pos.clone());
          } else {
            damageEnemy(e, p.damage);
            burst(pos, { count: 9, color: 0xffaa33, speed: 5, size: 0.5, life: 0.4 });
          }
          dead = true;
          break;
        }
      }
    } else if (!dead && !p.friendly) {
      if (pos.distanceTo(charmander.pos.clone().add(new THREE.Vector3(0, 0.8, 0))) < 1.0) {
        damageCharmander(p.damage);
        burst(pos, { count: 8, color: p.color, speed: 4, size: 0.45, life: 0.35 });
        dead = true;
      }
    }

    if (dead) {
      scene.remove(p.group);
      projectiles.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Enemies
// ----------------------------------------------------------------------------
function spawnEnemy(boss = false) {
  const keysArr = Object.keys(SPECIES);
  const spec = boss ? SPECIES.rockor : SPECIES[keysArr[Math.floor(Math.random() * keysArr.length)]];

  const a = rand(0, TAU), dist = rand(28, 42);
  const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
  const group = spec.build();
  group.position.set(x, terrainHeight(x, z), z);
  if (boss) group.scale.setScalar(2.2);
  scene.add(group);

  const mul = (1 + (state.wave - 1) * 0.18) * (boss ? 6 : 1);
  const e = {
    spec, group, boss,
    pos: group.position,
    hp: spec.hp * mul, maxHp: spec.hp * mul,
    damage: spec.damage * (1 + (state.wave - 1) * 0.1) * (boss ? 1.8 : 1),
    radius: boss ? 2.4 : 1.1,
    yaw: 0,
    attackTimer: rand(0.5, 1.5),
    knock: new THREE.Vector3(),
    slow: 0, dead: false, deathT: 0, flash: 0,
    bobPhase: rand(0, TAU),
    mats: [],
  };
  // collect this enemy's materials once so hits can flash them white
  const seen = new Set();
  group.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive && !seen.has(o.material)) {
      seen.add(o.material);
      e.mats.push({ mat: o.material, baseEmissive: o.material.emissive.getHex(), baseIntensity: o.material.emissiveIntensity ?? 1 });
    }
  });

  const bar = new THREE.Group();
  const barW = boss ? 2.6 : 1.5;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(barW, 0.17),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(barW, 0.17),
    new THREE.MeshBasicMaterial({ color: boss ? 0xff2222 : 0xff4433, depthWrite: false }));
  fg.position.z = 0.01;
  bar.add(bg, fg);
  bar.position.y = boss ? 2.6 : 2.2;
  group.add(bar);
  e.hpBar = bar;
  e.hpFg = fg;
  e.barW = barW;

  enemies.push(e);
  burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)),
    { count: boss ? 30 : 16, color: 0xffffff, speed: 4, size: 0.8, life: 0.6 });
  if (boss) {
    announce("⚠ BOSS ROCKOR APPEARED!", 2800);
    state.shake = Math.max(state.shake, 0.5);
    addShockwave(e.pos, 8, 0xffffff);
  }
  return e;
}

function damageEnemy(e, amount) {
  if (e.dead) return;
  const crit = Math.random() < 0.16;
  if (crit) amount *= 1.6;
  e.hp -= amount;
  e.flash = 0.12;
  bumpCombo(crit);
  spawnDamageNumber(e.pos.clone().add(new THREE.Vector3(0, e.boss ? 2.8 : 1.8, 0)), amount, { crit });
  if (crit) AudioSys.crit(); else AudioSys.hit();
  if (e.hp <= 0) {
    e.dead = true;
    e.deathT = 0;
    AudioSys.ko();
    hitStop(0.15, 5);
    state.score += (e.spec.score + state.wave * 10) * (e.boss ? 4 : 1);
    gainXp(e.spec.xp * (e.boss ? 4 : 1));
    explosionFX(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), e.boss ? 2 : 0.9);
    if (e.boss) AudioSys.explosion();
    if (target === e) target = pickTarget();
  }
}

// damage-over-time path with throttled numbers; kills route to damageEnemy
const dotAccum = new Map();
function damageEnemyTick(e, amount) {
  if (e.dead) return;
  e.hp -= amount;
  e.flash = Math.max(e.flash, 0.05);
  const acc = (dotAccum.get(e) || 0) + amount;
  if (acc >= 12) {
    spawnDamageNumber(e.pos.clone().add(new THREE.Vector3(0, e.boss ? 2.8 : 1.8, 0)), acc);
    bumpCombo(false);
    dotAccum.set(e, 0);
  } else {
    dotAccum.set(e, acc);
  }
  if (e.hp <= 0) {
    e.hp = 1;
    damageEnemy(e, 2);
  }
}

function updateEnemies(dt) {
  const charPos = charmander.pos;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.dead) {
      e.deathT += dt;
      const s = Math.max(0.01, 1 - e.deathT * 1.4) * (e.boss ? 2.2 : 1);
      e.group.scale.setScalar(s);
      e.group.rotation.z = e.deathT * 2;
      if (e.deathT > 0.75) {
        scene.remove(e.group);
        enemies.splice(i, 1);
      }
      continue;
    }

    // white-hot hit flash
    if (e.flash > 0) {
      e.flash -= dt;
      const on = e.flash > 0;
      for (const m of e.mats) {
        if (on) {
          m.mat.emissive.set(0xffffff);
          m.mat.emissiveIntensity = 0.85;
        } else {
          m.mat.emissive.setHex(m.baseEmissive);
          m.mat.emissiveIntensity = m.baseIntensity;
        }
      }
    }

    const toChar = charPos.clone().sub(e.pos).setY(0);
    const dist = toChar.length();
    const dir = toChar.normalize();
    e.yaw = Math.atan2(dir.x, dir.z);
    e.group.rotation.y = e.yaw;

    const slowMul = e.slow > 0 ? 0.3 : 1;
    e.slow = Math.max(0, e.slow - dt);

    if (dist > e.spec.range * 0.85) {
      e.pos.addScaledVector(dir, e.spec.speed * slowMul * dt);
    }
    e.pos.addScaledVector(e.knock, dt);
    e.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));

    e.pos.y = terrainHeight(e.pos.x, e.pos.z);
    e.bobPhase += dt * 8 * slowMul;
    e.group.position.y = e.pos.y + Math.abs(Math.sin(e.bobPhase)) * 0.12;

    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && dist < e.spec.range + 1) {
      e.attackTimer = e.spec.attackCd * rand(0.9, 1.2);
      if (e.spec.projectile && !e.boss) {
        const pr = e.spec.projectile;
        const from = e.pos.clone().add(new THREE.Vector3(0, 1, 0));
        spawnProjectile({
          pos: from, dir: aimDirAt(charPos, from), speed: pr.speed, size: pr.size,
          color: pr.color, damage: e.damage, friendly: false, trail: pr.color,
        });
        AudioSys.tone({ freq: 300, dur: 0.1, type: "sine", gain: 0.12, slide: 1.6 });
      } else if (e.boss && dist > 4) {
        // boss hurls a boulder
        const from = e.pos.clone().add(new THREE.Vector3(0, 2.4, 0));
        spawnProjectile({
          pos: from, dir: aimDirAt(charPos, from), speed: 15, size: 0.45,
          color: 0xaa9988, damage: e.damage, friendly: false, trail: 0x887766,
        });
        AudioSys.tone({ freq: 120, dur: 0.3, type: "sawtooth", gain: 0.2, slide: 0.5 });
      } else if (dist < e.spec.range + 0.5 || (e.boss && dist <= 4.5)) {
        damageCharmander(e.damage);
        burst(charPos.clone().add(new THREE.Vector3(0, 0.8, 0)),
          { count: 10, color: 0xcccccc, speed: 5, size: 0.5, life: 0.4 });
        state.shake = Math.max(state.shake, e.boss ? 0.5 : 0.3);
        if (e.boss) addShockwave(e.pos, 5, 0xbbaa88);
      }
    }

    e.hpBar.lookAt(camera.position);
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    e.hpFg.scale.x = Math.max(frac, 0.001);
    e.hpFg.position.x = -(1 - frac) * e.barW / 2;
  }
}

// ----------------------------------------------------------------------------
// Charmander damage / XP / levels
// ----------------------------------------------------------------------------
function damageCharmander(amount) {
  if (state.over) return;
  charmander.hp -= amount;
  AudioSys.hurt();
  state.shake = Math.max(state.shake, 0.25);
  HUD.vignette.style.opacity = "1";
  setTimeout(() => { HUD.vignette.style.opacity = "0"; }, 250);
  spawnDamageNumber(charmander.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), amount, { color: "#ff6666" });
  if (charmander.hp <= 0) {
    charmander.hp = 0;
    gameOver();
  }
}

function gainXp(amount) {
  state.xp += amount;
  while (state.xp >= state.xpNeeded) {
    state.xp -= state.xpNeeded;
    state.level++;
    state.xpNeeded = Math.round(state.xpNeeded * 1.35);
    charmander.maxHp += 20;
    charmander.hp = charmander.maxHp;
    charmander.dmgMul = 1 + (state.level - 1) * 0.15;
    AudioSys.levelUp();
    announce(`CHARMANDER grew to Lv ${state.level}!`);
    burst(charmander.pos.clone().add(new THREE.Vector3(0, 1, 0)),
      { count: 30, color: 0x7ee0ff, speed: 6, size: 0.8, life: 0.9 });
    addShockwave(charmander.pos, 4, 0x7ee0ff);

    if (state.level >= 5 && !state.evolved) {
      state.evolved = true;
      charmander.group.scale.setScalar(1.3);
      charmander.dmgMul += 0.35;
      for (const m of charmander.group.userData.bodyMats) {
        m.color.set(0xe85f2a);
        m.emissive.set(0x661a00);
        m.emissiveIntensity = 0.35;
      }
      HUD.pkmnName.textContent = "CHARMANDER ⚡BLAZE AURA";
      announce("⚡ BLAZE AWAKENED! Charmander surges with power!", 3000);
      explosionFX(charmander.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 1.6);
      state.shake = 0.55;
      hitStop(0.1, 8);
    }
  }
}

// ----------------------------------------------------------------------------
// Waves — a boss joins every third wave
// ----------------------------------------------------------------------------
function startWave() {
  state.wave++;
  state.spawnQueue = 2 + state.wave;
  state.spawnTimer = 0.5;
  state.bossQueued = state.wave % 3 === 0;
  AudioSys.waveStart();
  announce(`WAVE ${state.wave} — Wild Pokémon appeared!`);
}

function updateWaves(dt) {
  if (state.spawnQueue > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = rand(0.7, 1.4);
      state.spawnQueue--;
      spawnEnemy(false);
      if (state.spawnQueue === 0 && state.bossQueued) {
        state.bossQueued = false;
        spawnEnemy(true);
      }
    }
  } else if (enemies.length === 0) {
    if (state.waveCooldown <= 0) {
      state.waveCooldown = 4;
      announce("WAVE CLEARED!");
      charmander.hp = Math.min(charmander.maxHp, charmander.hp + charmander.maxHp * 0.3);
      AudioSys.levelUp();
    } else {
      state.waveCooldown -= dt;
      if (state.waveCooldown <= 0) startWave();
    }
  }
}

// ----------------------------------------------------------------------------
// Game over / restart
// ----------------------------------------------------------------------------
function gameOver() {
  state.over = true;
  document.exitPointerLock?.();
  AudioSys.explosion();
  explosionFX(charmander.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1.6);
  document.getElementById("final-stats").innerHTML =
    `SCORE ${state.score}<br/>WAVE ${state.wave} · Lv ${state.level}`;
  setTimeout(() => { document.getElementById("gameover-overlay").style.display = "flex"; }, 900);
}

document.getElementById("retry-btn").addEventListener("click", () => location.reload());
document.getElementById("start-btn").addEventListener("click", () => {
  AudioSys.init();
  document.getElementById("title-overlay").style.display = "none";
  state.running = true;
  renderer.domElement.requestPointerLock();
  startWave();
});

// ----------------------------------------------------------------------------
// Per-frame updates
// ----------------------------------------------------------------------------
const tmpV = new THREE.Vector3();

function updateAsh(dt) {
  let mx = 0, mz = 0;
  if (keys["KeyW"]) mz += 1;
  if (keys["KeyS"]) mz -= 1;
  if (keys["KeyA"]) mx -= 1;
  if (keys["KeyD"]) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  const sprint = keys["ShiftLeft"] || keys["ShiftRight"];
  const speed = sprint ? 11 : 6.5;

  if (moving && !state.over) {
    // camera sits at +offset along cam.yaw, so "forward" is the negated z axis
    const ang = Math.atan2(mx, -mz) + cam.yaw;
    tmpV.set(Math.sin(ang), 0, Math.cos(ang));
    ash.pos.addScaledVector(tmpV, speed * dt);
    const maxR = 130;
    const r = Math.hypot(ash.pos.x, ash.pos.z);
    if (r > maxR) ash.pos.multiplyScalar(maxR / r);
    ash.yaw = lerpAngle(ash.yaw, ang, 1 - Math.pow(0.0001, dt));
    ash.walkPhase += dt * (sprint ? 13 : 9);
    ash.speed = speed;
  } else {
    ash.walkPhase = lerp(ash.walkPhase, Math.round(ash.walkPhase / Math.PI) * Math.PI, 1 - Math.pow(0.001, dt));
    ash.speed = 0;
  }

  ash.pos.y = terrainHeight(ash.pos.x, ash.pos.z);
  ash.group.position.copy(ash.pos);
  ash.group.rotation.y = ash.yaw;

  const sw = Math.sin(ash.walkPhase) * (ash.speed > 0 ? 0.55 : 0.18);
  const { arms, legs } = ash.group.userData.parts;
  arms[0].rotation.x = sw;
  arms[1].rotation.x = -sw;
  legs[0].rotation.x = -sw;
  legs[1].rotation.x = sw;
  ash.group.position.y += Math.abs(Math.sin(ash.walkPhase)) * 0.06 * (ash.speed > 0 ? 1 : 0);

  // sprinting kicks up dust
  if (ash.speed > 8 && Math.random() < dt * 14) {
    spawnParticle({
      pos: ash.pos.clone().add(new THREE.Vector3(rand(-0.2, 0.2), 0.1, rand(-0.2, 0.2))),
      smoke: true, color: 0x9a8a70, size: rand(0.3, 0.6), endSize: 1.2, life: rand(0.4, 0.8),
      vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0.5, 1.2), rand(-0.5, 0.5)),
    });
  }
}

function updateCharmander(dt) {
  const followOffset = tmpV.set(Math.sin(ash.yaw + 2.4), 0, Math.cos(ash.yaw + 2.4)).multiplyScalar(2.2);
  const goal = ash.pos.clone().add(followOffset);
  const dist = charmander.pos.distanceTo(goal);
  if (dist > 0.4) {
    const dir = goal.clone().sub(charmander.pos).setY(0).normalize();
    const speed = clamp(dist * 2.2, 0, 12);
    charmander.pos.addScaledVector(dir, speed * dt);
    if (charmander.flameActive <= 0 && (!target || target.dead)) {
      charmander.yaw = lerpAngle(charmander.yaw, Math.atan2(dir.x, dir.z), 1 - Math.pow(0.0005, dt));
    }
  }
  if (target && !target.dead) {
    const to = target.pos.clone().sub(charmander.pos);
    charmander.yaw = lerpAngle(charmander.yaw, Math.atan2(to.x, to.z), 1 - Math.pow(0.001, dt));
  }

  charmander.pos.y = terrainHeight(charmander.pos.x, charmander.pos.z);
  charmander.group.position.copy(charmander.pos);
  charmander.lunge = Math.max(0, charmander.lunge - dt);
  const bob = Math.sin(state.time * 4) * 0.04;
  charmander.group.position.y += bob + charmander.lunge * 0.5;
  charmander.group.rotation.y = charmander.yaw;

  // tail flame: shader time, flicker light, Blaze boost at low HP
  const lowHp = charmander.hp / charmander.maxHp < 0.3;
  flameUniforms.uBoost.value = lerp(flameUniforms.uBoost.value, lowHp ? 1.8 : 1, 1 - Math.pow(0.01, dt));
  charmander.group.userData.flame.scale.setScalar(lowHp ? 1.5 : 1);
  charmander.group.userData.flameLight.intensity = 8 + Math.sin(state.time * 23) * 2.5 + (lowHp ? 5 : 0);
  // ember motes drifting off the tail flame
  if (Math.random() < dt * 12) {
    const fp = new THREE.Vector3();
    charmander.group.userData.flame.getWorldPosition(fp);
    spawnParticle({
      pos: fp.add(new THREE.Vector3(rand(-0.1, 0.1), 0.3, rand(-0.1, 0.1))),
      color: 0xffaa44, size: rand(0.08, 0.16), endSize: 0.02, life: rand(0.5, 1),
      vel: new THREE.Vector3(rand(-0.4, 0.4), rand(0.8, 1.6), rand(-0.4, 0.4)),
    });
  }

  // auto-ember: a small jab every couple of seconds keeps damage flowing
  charmander.autoTimer -= dt;
  if (charmander.autoTimer <= 0 && state.running && !state.over) {
    charmander.autoTimer = 2.2;
    if (target && !target.dead && target.pos.distanceTo(charmander.pos) < 32) {
      const from = charmanderMouth();
      spawnProjectile({
        pos: from, dir: aimDirAt(target.pos, from), speed: 24, size: 0.13, color: 0xff9933,
        damage: 6 * charmander.dmgMul, friendly: true, trail: 0xffbb55,
        homing: 6, targetRef: target,
      });
    }
  }

  // flamethrower stream
  if (charmander.flameActive > 0) {
    charmander.flameActive -= dt;
    if (target && !target.dead) charmander.flameDir.copy(aimDirAt(target.pos, charmanderMouth()));
    const mouth = charmanderMouth();
    for (let j = 0; j < 5; j++) {
      const spread = new THREE.Vector3(rand(-0.13, 0.13), rand(-0.06, 0.1), rand(-0.13, 0.13));
      spawnParticle({
        pos: mouth, color: [0xff4400, 0xff8800, 0xffcc44][j % 3],
        size: rand(0.5, 1.1), endSize: 2.1, life: rand(0.4, 0.7),
        vel: charmander.flameDir.clone().add(spread).normalize().multiplyScalar(rand(13, 20)),
        drag: 1.1,
      });
    }
    if (Math.random() < dt * 18) {
      spawnParticle({
        pos: mouth.clone().addScaledVector(charmander.flameDir, rand(4, 9)),
        smoke: true, color: 0x4a423c, size: rand(0.7, 1.3), endSize: 2.6, life: rand(0.7, 1.2),
        vel: new THREE.Vector3(rand(-0.5, 0.5), rand(1, 2), rand(-0.5, 0.5)),
      });
    }
    for (const e of enemies) {
      if (e.dead) continue;
      const to = e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(charmanderMouth());
      const d = to.length();
      if (d < 17 && to.normalize().dot(charmander.flameDir) > 0.78) {
        damageEnemyTick(e, 40 * charmander.dmgMul * dt);
      }
    }
  }
}

function updateFireSpins(dt) {
  for (let i = fireSpins.length - 1; i >= 0; i--) {
    const fs = fireSpins[i];
    fs.life -= dt;
    const e = fs.enemy;
    if (fs.life <= 0 || e.dead) {
      scene.remove(fs.light);
      fireSpins.splice(i, 1);
      continue;
    }
    e.slow = 0.3;
    fs.light.position.copy(e.pos).add(new THREE.Vector3(0, 1, 0));
    fs.light.intensity = 7 + Math.sin(state.time * 20) * 2.5;
    for (let j = 0; j < 3; j++) {
      const a = state.time * 7 + (j / 3) * TAU;
      const r = e.boss ? 3 : 1.7;
      spawnParticle({
        pos: e.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2 + ((state.time * 2 + j) % 1.8), Math.sin(a) * r)),
        color: j === 0 ? 0xffcc44 : 0xff6611,
        size: rand(0.5, 1), endSize: 0.1, life: 0.45,
        vel: new THREE.Vector3(-Math.sin(a) * 3, 1.6, Math.cos(a) * 3),
      });
    }
    damageEnemyTick(e, 14 * charmander.dmgMul * dt);
  }
}

function updateCamera(dt) {
  const lookTarget = ash.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const off = new THREE.Vector3(
    Math.sin(cam.yaw) * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
    Math.cos(cam.yaw) * Math.cos(cam.pitch)
  ).multiplyScalar(cam.dist);
  const desired = lookTarget.clone().add(off);
  const minY = terrainHeight(desired.x, desired.z) + 0.6;
  if (desired.y < minY) desired.y = minY;
  camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.6);
    camera.position.x += rand(-1, 1) * state.shake * 0.32;
    camera.position.y += rand(-1, 1) * state.shake * 0.32;
  }
  camera.lookAt(lookTarget);

  state.fovKick = Math.max(0, state.fovKick - dt * 22);
  const targetFov = 62 + state.fovKick;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.pow(0.0001, dt));
    camera.updateProjectionMatrix();
  }

  // keep the shadow frustum centered on the player
  sun.position.set(ash.pos.x + 55, 80, ash.pos.z + 35);
  sun.target.position.copy(ash.pos);
}

function updateHud() {
  const hpFrac = clamp(charmander.hp / charmander.maxHp, 0, 1);
  HUD.hpFill.style.width = `${hpFrac * 100}%`;
  HUD.hpFill.className = "fill" + (hpFrac < 0.25 ? " danger" : hpFrac < 0.55 ? " warn" : "");
  HUD.hpLabel.textContent = `${Math.ceil(charmander.hp)} / ${charmander.maxHp}`;
  HUD.xpFill.style.width = `${(state.xp / state.xpNeeded) * 100}%`;
  HUD.lvlLabel.textContent = `Lv ${state.level}`;
  HUD.waveLabel.textContent = `WAVE ${state.wave}`;
  HUD.scoreLabel.textContent = `SCORE ${state.score}`;
  const alive = enemies.filter(e => !e.dead).length + state.spawnQueue + (state.bossQueued ? 1 : 0);
  HUD.enemiesLeft.textContent = alive > 0 ? `${alive} wild remaining` : "area clear";

  if (target && !target.dead) {
    HUD.targetPanel.style.display = "block";
    HUD.targetName.textContent = `${target.boss ? "👑 BOSS" : "WILD"} ${target.spec.name}`;
    const f = clamp(target.hp / target.maxHp, 0, 1);
    HUD.targetHpFill.style.width = `${f * 100}%`;
    HUD.targetHpLabel.textContent = `${Math.ceil(target.hp)} / ${Math.round(target.maxHp)}`;
    targetRing.visible = true;
    targetRing.position.copy(target.pos).add(new THREE.Vector3(0, 0.12, 0));
    targetRing.scale.setScalar((target.boss ? 2 : 1) * (1 + Math.sin(state.time * 5) * 0.07));
  } else {
    HUD.targetPanel.style.display = "none";
    targetRing.visible = false;
  }

  if (state.comboTimer <= 0 && state.combo > 0) {
    state.combo = 0;
    HUD.combo.style.opacity = "0";
  }

  for (let i = 0; i < 4; i++) {
    const m = MOVES[i], ui = HUD.moves[i];
    if (m.timer > 0) {
      ui.el.classList.remove("ready");
      ui.shade.style.transform = `scaleY(${m.timer / m.cd})`;
      ui.num.style.opacity = "1";
      ui.num.textContent = m.timer >= 1 ? Math.ceil(m.timer) : m.timer.toFixed(1);
    } else {
      ui.el.classList.add("ready");
      ui.shade.style.transform = "scaleY(0)";
      ui.num.style.opacity = "0";
    }
  }
}

// ----------------------------------------------------------------------------
// Main loop — gameplay runs on scaled time so hit-stop feels punchy
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  state.timeScale += (1 - state.timeScale) * Math.min(1, 7 * dt);
  const sdt = dt * state.timeScale;
  state.time += sdt;
  uWind.value = state.time;
  flameUniforms.uTime.value = state.time;
  state.comboTimer -= sdt;

  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 280) cloud.position.x = -280;
  }

  if (state.running && !state.over) {
    for (const m of MOVES) m.timer = Math.max(0, m.timer - sdt);
    if (!target || target.dead) target = pickTarget();
    updateAsh(sdt);
    updateCharmander(sdt);
    updateEnemies(sdt);
    updateProjectiles(sdt);
    updateFireSpins(sdt);
    updateWaves(sdt);
    updateHud();
    AudioSys.updateMusic(true);
  } else if (!state.running) {
    cam.yaw += dt * 0.12;
    updateCharmander(dt);
    updateAsh(dt);
  }

  updateParticles(sdt);
  updateDamageNumbers(sdt);
  updateScorches(sdt);
  updateShockwaves(sdt);
  updateCamera(dt);
  composer.render();
}
tick();
