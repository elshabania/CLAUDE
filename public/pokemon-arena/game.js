// ============================================================================
// POKÉMON ARENA 3D v3 — YOU ARE CHARIZARD
// Fly as Charizard in an over-the-shoulder dragon-flight battle: banking
// turns, dives, boost, fire breathed where you aim, aerial enemies, HDR
// bloom, IBL, shader flames and procedural music. Unofficial fan-made demo.
// ============================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
// Studio character & look modules (built by the art team)
import { buildCharizard, flameUniforms } from "./charizard.js";
import { buildAsh } from "./ash.js";
import { createGradePass, applyAtmosphere } from "./lookdev.js";
import { SPECIES } from "./enemies.js";

// ----------------------------------------------------------------------------
// Small math helpers
// ----------------------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function lerpAngle(a, b, t) {
  return a + angleDiff(b, a) * t;
}

// Touch devices get the virtual joystick UI and lighter render settings
const IS_TOUCH = ("ontouchstart" in window) || matchMedia("(pointer: coarse)").matches;

// ----------------------------------------------------------------------------
// Renderer / scene / camera / post-processing
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.3 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
scene.fog = new THREE.Fog(0xa8c8e0, 80, 340);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

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
const gradePass = createGradePass();
composer.addPass(gradePass);
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
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x9db8ff, 0.35);
fill.position.set(-40, 30, -50);
scene.add(fill);

applyAtmosphere({ scene, sun, hemi });

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

const cloudPuffTex = canvasTex(128, (g) => {
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), r = rand(0, 26);
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    const rad = rand(16, 34);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
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
// Sky — gradient dome, sun glare, mountain ring
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
    new THREE.SphereGeometry(560, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c0, fog: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.setScalar(190);
  sunGlow.position.set(300, 250, 190);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, fog: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunCore.scale.setScalar(60);
  sunCore.position.copy(sunGlow.position);
  scene.add(sunCore);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e7486, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.8, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rand(-0.08, 0.08);
    const r = rand(280, 360);
    const h = rand(50, 130);
    const base = new THREE.Mesh(new THREE.ConeGeometry(rand(40, 75), h, 7), rockMat);
    base.position.set(Math.cos(a) * r, h * 0.32, Math.sin(a) * r);
    base.rotation.y = rand(0, TAU);
    scene.add(base);
    if (h > 80) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rand(12, 20), h * 0.26, 7), snowMat);
      cap.position.set(base.position.x, h * 0.85, base.position.z);
      cap.rotation.y = base.rotation.y;
      scene.add(cap);
    }
  }
}

// Flyable cloud banks — soft sprite clusters at flight altitude
const flyClouds = [];
{
  const COUNT = IS_TOUCH ? 14 : 24;
  for (let i = 0; i < COUNT; i++) {
    const cluster = new THREE.Group();
    const puffs = 4 + (i % 3);
    for (let j = 0; j < puffs; j++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudPuffTex, color: 0xffffff, transparent: true,
        opacity: rand(0.4, 0.6), depthWrite: false,
      }));
      sp.scale.setScalar(rand(14, 30));
      sp.position.set(rand(-14, 14), rand(-3, 4), rand(-10, 10));
      cluster.add(sp);
    }
    const a = rand(0, TAU), r = rand(40, 250);
    cluster.position.set(Math.cos(a) * r, rand(20, 70), Math.sin(a) * r);
    cluster.userData.speed = rand(0.6, 1.8);
    scene.add(cluster);
    flyClouds.push(cluster);
  }
}

// ----------------------------------------------------------------------------
// Terrain
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
  const size = 560, segs = 190;
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
    const high = smoothstep(3.5, 6.5, h);
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

  // lakes — water discs sitting in terrain dips; hills poke through as islands
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2b6e9e, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.2,
    transparent: true, opacity: 0.9,
  });
  for (const [wx, wz, wr] of [[-130, 95, 45], [115, -125, 32]]) {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(wr, 40), waterMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(wx, 1.6, wz);
    scene.add(lake);
  }
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
  const COUNT = IS_TOUCH ? 1500 : 3200;
  const grassMesh = new THREE.InstancedMesh(blade, mat, COUNT);
  grassMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const a = rand(0, TAU), r = 21 + Math.pow(Math.random(), 0.7) * 23;
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
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.05), runeMat);
    rune.position.set(x * 0.95, terrainHeight(x, z) + 1.2, z * 0.95);
    rune.lookAt(0, 1.2, 0);
    scene.add(rune);
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  for (let i = 0; i < 70; i++) {
    const a = rand(0, TAU), r = rand(78, 230);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const tree = new THREE.Group();
    const sc = rand(0.9, 2.2);
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
  for (let i = 0; i < 30; i++) {
    const a = rand(0, TAU), r = rand(75, 220);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rock = new THREE.Mesh(
      jitterGeometry(new THREE.DodecahedronGeometry(rand(0.5, 2.2), 1), 0.22), rockMat);
    rock.position.set(x, terrainHeight(x, z) + 0.25, z);
    rock.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }
}

// ----------------------------------------------------------------------------
// STADIUM — Pokkén-style battle bowl around the arena
// ----------------------------------------------------------------------------
{
  const turfTex = canvasTex(1024, (g, s) => {
    const cx = s / 2;
    for (let r = s / 2; r > 0; r -= 52) {
      g.fillStyle = (Math.floor(r / 52) % 2) ? "#4e8a33" : "#5c9c3e";
      g.beginPath();
      g.arc(cx, cx, r, 0, TAU);
      g.fill();
    }
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = 7;
    g.beginPath(); g.arc(cx, cx, s * 0.47, 0, TAU); g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cx, s * 0.16, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cx, 9, 0, TAU);
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fill();
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 50 | 0},${70 + Math.random() * 70 | 0},25,0.18)`;
      g.fillRect(rand(0, s), rand(0, s), 2, 4);
    }
  });
  turfTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const turf = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    new THREE.MeshStandardMaterial({
      map: turfTex, roughness: 0.95, envMapIntensity: 0.2,
      polygonOffset: true, polygonOffsetFactor: -1,
    }));
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.03;
  turf.receiveShadow = true;
  scene.add(turf);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(48, 48, 5, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.85, side: THREE.DoubleSide }));
  wall.position.y = 2.5;
  scene.add(wall);
  const adColors = [0x22ccff, 0xff8822, 0xffe14d, 0x66ff88];
  for (let i = 0; i < 8; i++) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(48.15, 48.15, 1.3, 16, 1, true, (i / 8) * TAU, TAU / 8 - 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x111111, emissive: adColors[i % adColors.length],
        emissiveIntensity: 1.6, side: THREE.DoubleSide,
      }));
    band.position.y = 3.6;
    scene.add(band);
  }

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(68, 50, 14, 56, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x39415c, roughness: 0.95, side: THREE.DoubleSide }));
  bowl.position.y = 11;
  scene.add(bowl);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(68, 1.1, 8, 56),
    new THREE.MeshStandardMaterial({ color: 0x222840, roughness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 18;
  scene.add(rim);

  const CROWD = IS_TOUCH ? 900 : 2200;
  const fanGeo = new THREE.SphereGeometry(0.34, 6, 5);
  const fanMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  fanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vec4 gw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed.y += sin(uWind * 3.0 + gw.x * 1.7 + gw.z * 2.3) * 0.18;
        }`);
  };
  const crowd = new THREE.InstancedMesh(fanGeo, fanMat, CROWD);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < CROWD; i++) {
    const a = rand(0, TAU);
    const t = Math.random();
    const r = lerp(51.5, 66.5, t);
    m.makeTranslation(Math.cos(a) * r, 4.8 + t * 13 + rand(-0.1, 0.1), Math.sin(a) * r);
    crowd.setMatrixAt(i, m);
    col.setHSL(Math.random(), rand(0.5, 0.9), rand(0.35, 0.7));
    crowd.setColorAt(i, col);
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  scene.add(crowd);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x55607a, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0xfff4d8, emissiveIntensity: 2.6,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(a) * 72, z = Math.sin(a) * 72;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 8), poleMat);
    pole.position.set(x, 15, z);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.8), lampMat);
    lamp.position.set(x, 30, z);
    lamp.lookAt(0, 2, 0);
    scene.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff0c8, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.85,
    }));
    glow.scale.setScalar(16);
    glow.position.set(x, 30, z);
    scene.add(glow);
  }
}

// ----------------------------------------------------------------------------
// Scorch decals + shockwave rings
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
// Particle system
// ----------------------------------------------------------------------------
const MAX_PARTICLES = IS_TOUCH ? 550 : 900;
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
// Audio — procedural SFX, wind that scales with speed, battle music
// ----------------------------------------------------------------------------
const AudioSys = {
  ctx: null, master: null, muted: false, musicNext: 0, musicStep: 0,
  windGain: null, windFilt: null,
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
    // continuous wind loop, silent until flight speed rises
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.windFilt = this.ctx.createBiquadFilter();
    this.windFilt.type = "lowpass";
    this.windFilt.frequency.value = 400;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilt).connect(this.windGain).connect(this.master);
    src.start();
  },
  setWind(f) {
    if (!this.windGain) return;
    this.windGain.gain.value = this.muted ? 0 : f * 0.16;
    this.windFilt.frequency.value = 300 + f * 1100;
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
  flamethrower() { this.noise({ dur: 1.4, freq: 900, q: 0.7, gain: 0.35, sweep: 0.8 }); },
  hit() { this.tone({ freq: 220, dur: 0.12, type: "square", gain: 0.2, slide: 0.5 }); this.noise({ dur: 0.12, freq: 2500, gain: 0.25, sweep: 0.4 }); },
  crit() { this.tone({ freq: 520, dur: 0.16, type: "square", gain: 0.24, slide: 0.4 }); this.noise({ dur: 0.18, freq: 3200, gain: 0.3, sweep: 0.3 }); },
  hurt() { this.tone({ freq: 160, dur: 0.25, type: "sawtooth", gain: 0.22, slide: 0.4 }); },
  explosion() { this.noise({ dur: 0.7, freq: 500, q: 0.6, gain: 0.6, sweep: 0.12 }); this.tone({ freq: 80, dur: 0.5, type: "sine", gain: 0.4, slide: 0.4 }); },
  ko() { this.tone({ freq: 600, dur: 0.4, type: "square", gain: 0.18, slide: 0.2 }); },
  flap() { this.noise({ dur: 0.18, freq: 500, q: 0.8, gain: 0.1, sweep: 0.4 }); },
  swipe() { this.noise({ dur: 0.16, freq: 2400, gain: 0.32, sweep: 0.18 }); },
  bite() { this.tone({ freq: 95, dur: 0.12, type: "square", gain: 0.26, slide: 0.6 }); this.noise({ dur: 0.08, freq: 3200, gain: 0.3, sweep: 0.5 }); },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.25 }), i * 110));
  },
  waveStart() {
    [392, 523].forEach((f, i) =>
      setTimeout(() => this.tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.22 }), i * 150));
  },
  updateMusic(running) {
    if (!this.ctx || this.muted || !running) return;
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
  flyBtn: document.getElementById("fly-btn"),
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
  mega: false,
  shake: 0,
  fovKick: 0,
  combo: 0,
  comboTimer: 0,
  waveCooldown: 0,
  spawnQueue: 0,
  spawnTimer: 0,
  bossQueued: false,
};

// YOU — Charizard. Starts grounded; the FLY button takes off.
const player = {
  group: buildCharizard(),
  mode: "ground", // "ground" | "fly" | "landing"
  pos: new THREE.Vector3(0, 14, -20),
  vel: new THREE.Vector3(0, 0, 1),
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 14,
  walkPhase: 0,
  hp: 120,
  maxHp: 120,
  dmgMul: 1,
  flameActive: 0,
  jawOpen: 0,
  fireFlash: 0,
  biteT: 0,
  lungeT: 0,
  flapPhase: 0,
  autoTimer: 2,
};
scene.add(player.group);

// where the player is aiming (mouse / joystick steer this)
const aim = { yaw: 0, pitch: 0.05 };

// Ash cheering from the arena floor
const ashNpc = { group: buildAsh(), cheer: 0, lastCheer: 0 };
ashNpc.group.position.set(3, terrainHeight(3, 3) + 0.02, 3);
scene.add(ashNpc.group);
const CHEERS = [
  "Ash: “Yeah! Great shot, CHARIZARD!”",
  "Ash: “Amazing, buddy!”",
  "Ash: “That's the spirit!”",
  "Ash: “Incredible! Keep it up!”",
];

const enemies = [];
const projectiles = [];
const fireSpins = [];

const MOVES = [
  { cd: 0.6, timer: 0 },  // CLAW
  { cd: 2.2, timer: 0 },  // BITE
  { cd: 4.0, timer: 0 },  // FLAMETHROWER
  { cd: 9.0, timer: 0 },  // FLAME BURST
];

// ----------------------------------------------------------------------------
// Melee — claw swipes and bites with slash VFX
// ----------------------------------------------------------------------------
const slashArcs = [];
function slashFX(yaw, color = 0xffeecc) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.14, 6, 24, Math.PI * 0.95),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  const fwd = playerForward();
  m.position.copy(player.pos).addScaledVector(fwd, 2.4).add(new THREE.Vector3(0, 0.5, 0));
  m.rotation.order = "YXZ";
  m.rotation.set(0, yaw, rand(-1.2, 1.2)); // slash plane faces the enemy, random tilt
  m.scale.setScalar(0.5);
  scene.add(m);
  slashArcs.push({ mesh: m, t: 0 });
}
function updateSlashArcs(dt) {
  for (let i = slashArcs.length - 1; i >= 0; i--) {
    const s = slashArcs[i];
    s.t += dt * 5.5;
    const k = Math.min(s.t, 1);
    s.mesh.scale.setScalar(lerp(0.5, 1.4, k));
    s.mesh.material.opacity = 0.95 * (1 - k);
    if (k >= 1) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      slashArcs.splice(i, 1);
    }
  }
}

function meleeStrike({ range, dot, dmg, knock = 0, stun = 0 }) {
  const fwd = playerForward();
  let hit = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const to = e.pos.clone().add(new THREE.Vector3(0, e.flying ? 0 : 0.8, 0)).sub(player.pos);
    const d = to.length();
    if (d < range + e.radius && to.normalize().dot(fwd) > dot) {
      damageEnemy(e, dmg);
      if (knock) e.knock.add(to.clone().setY(0.15).multiplyScalar(knock));
      if (stun) e.slow = Math.max(e.slow, stun);
      burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)),
        { count: 12, color: 0xffcc66, speed: 7, size: 0.5, life: 0.4 });
      hit = true;
    }
  }
  if (!hit) AudioSys.noise({ dur: 0.14, freq: 700, gain: 0.12, sweep: 0.5 }); // whiff
  return hit;
}

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
    void HUD.combo.offsetWidth;
    HUD.combo.classList.add("pop");
    setTimeout(() => HUD.combo.classList.remove("pop"), 100);
  }
}

// ----------------------------------------------------------------------------
// Input — mouse steers your flight; joystick on phones
// ----------------------------------------------------------------------------
const keys = {};
const touchBoost = { on: false };
// when the player last actively steered — aim assist only kicks in when idle
const input = { lastSteer: -10 };
const nowSec = () => performance.now() / 1000;

// FLY / LAND toggle — the takeoff button
function toggleFlight() {
  if (!state.running || state.over) return;
  if (player.mode === "ground") {
    player.mode = "fly";
    player.vel.y += 7.5;
    aim.pitch = Math.max(aim.pitch, 0.3);
    burst(player.pos.clone().add(new THREE.Vector3(0, -1.2, 0)),
      { count: 20, color: 0xcfc2a8, speed: 7, size: 0.9, life: 0.6 });
    AudioSys.flap();
    state.shake = Math.max(state.shake, 0.2);
    callout("🐉 CHARIZARD takes flight!");
  } else if (player.mode === "fly") {
    player.mode = "landing";
    callout("Coming in to land…");
  } else {
    player.mode = "fly"; // cancel the landing
  }
}
document.getElementById("fly-btn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  toggleFlight();
});

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") { e.preventDefault(); toggleFlight(); }
  if (e.code === "Tab") { e.preventDefault(); cycleTarget(); }
  if (e.code === "KeyM") {
    const muted = AudioSys.toggleMute();
    AudioSys.setWind(0);
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
  if (state.running && !IS_TOUCH) renderer.domElement.requestPointerLock();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  aim.yaw -= e.movementX * 0.0023;
  aim.pitch = clamp(aim.pitch - e.movementY * 0.0018, -0.8, 0.8);
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) input.lastSteer = nowSec();
});

const joy = { x: 0, y: 0, mag: 0, id: null };
if (IS_TOUCH) {
  document.getElementById("touch-ui").style.display = "block";
  const joyBase = document.getElementById("joy-base");
  const joyKnob = document.getElementById("joy-knob");

  const setJoy = (t) => {
    const r = joyBase.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / 48;
    let dy = (t.clientY - (r.top + r.height / 2)) / 48;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    joy.x = dx; joy.y = dy; joy.mag = Math.min(mag, 1);
    joyKnob.style.transform = `translate(calc(-50% + ${dx * 48}px), calc(-50% + ${dy * 48}px))`;
  };
  const resetJoy = () => {
    joy.x = joy.y = joy.mag = 0;
    joy.id = null;
    joyKnob.style.transform = "translate(-50%,-50%)";
  };

  document.getElementById("joy-zone").addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.id = t.identifier;
    setJoy(t);
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    let handled = false;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { setJoy(t); handled = true; }
    }
    if (handled) e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) resetJoy();
    }
  };
  document.addEventListener("touchend", endTouch);
  document.addEventListener("touchcancel", endTouch);

  const boostBtn = document.getElementById("boost-btn");
  boostBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); touchBoost.on = true; });
  boostBtn.addEventListener("pointerup", () => { touchBoost.on = false; });
  boostBtn.addEventListener("pointerleave", () => { touchBoost.on = false; });

  document.getElementById("tgt-btn").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cycleTarget();
  });
  HUD.moves.forEach((ui, i) => {
    ui.el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state.running && !state.over) useMove(i);
    });
  });
}

// ----------------------------------------------------------------------------
// Targeting — prefers what you're flying toward
// ----------------------------------------------------------------------------
let target = null;
const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.1, 0.06, 8, 36),
  new THREE.MeshBasicMaterial({
    color: 0xff5544, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
targetRing.visible = false;
scene.add(targetRing);

function playerForward() {
  return new THREE.Vector3(
    Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.yaw) * Math.cos(player.pitch));
}

function pickTarget() {
  const fwd = playerForward();
  const to = new THREE.Vector3();
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    to.copy(e.pos).sub(player.pos);
    const d = to.length();
    if (d > 95) continue;
    const dot = to.normalize().dot(fwd);
    const score = d * (dot > 0.45 ? 0.35 : 1); // strongly prefer the front cone
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
function cycleTarget() {
  const alive = enemies.filter(e => !e.dead);
  if (!alive.length) { target = null; return; }
  alive.sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos));
  const i = alive.indexOf(target);
  target = alive[(i + 1) % alive.length];
}

// ----------------------------------------------------------------------------
// Attacks — fire comes from YOUR mouth, along YOUR aim
// ----------------------------------------------------------------------------
const _mouthWorld = new THREE.Vector3();
function mouthPos() {
  player.group.userData.mouthAnchor.getWorldPosition(_mouthWorld);
  return _mouthWorld.clone();
}
function aimDirAt(targetPos, from) {
  return targetPos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(from).normalize();
}

function useMove(i) {
  const move = MOVES[i];
  if (move.timer > 0) return;
  if (!target || target.dead) target = pickTarget();
  move.timer = move.cd;
  player.fireFlash = 0.3;

  // assisted aim: whip around to face the enemy you're attacking
  if (target && !target.dead) {
    const to = target.pos.clone().sub(player.pos);
    aim.yaw = Math.atan2(to.x, to.z);
    if (player.mode !== "ground") {
      aim.pitch = clamp(Math.atan2(to.y, Math.hypot(to.x, to.z)), -0.75, 0.75);
    }
  }

  const mouth = mouthPos();
  const fwd = playerForward();
  const names = ["CLAW", "BITE", "FLAMETHROWER", "FLAME BURST"];
  if (i !== 0) callout(`<b>${names[i]}</b>!`); // claw is too rapid to narrate

  if (i === 0) {
    // CLAW — fast swipe with a lunge and slash arc
    AudioSys.swipe();
    player.vel.addScaledVector(fwd, 8);
    player.lungeT = 0.18;
    slashFX(player.yaw);
    if (meleeStrike({ range: 4.6, dot: 0.35, dmg: 18 * player.dmgMul, knock: 7 })) {
      hitStop(0.35, 3);
    }
  } else if (i === 1) {
    // BITE — close-range chomp: jaws gape, head snaps, heavy hit + stun
    AudioSys.bite();
    player.biteT = 0.32;
    player.vel.addScaledVector(fwd, 5);
    if (meleeStrike({ range: 3.8, dot: 0.45, dmg: 34 * player.dmgMul, knock: 4, stun: 1.2 })) {
      hitStop(0.18, 5);
      AudioSys.hit();
    }
  } else if (i === 2) {
    AudioSys.flamethrower();
    player.flameActive = 1.6;
  } else if (i === 3) {
    AudioSys.fire();
    spawnProjectile({
      pos: mouth, dir: fwd, speed: 28, size: 0.5, color: 0xff5500,
      damage: 60 * player.dmgMul, friendly: true, trail: 0xff7722,
      gravity: 4, aoe: 7,
    });
  }
}

// ----------------------------------------------------------------------------
// Projectiles
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
    damage, friendly, trail, gravity, aoe, size, color, life: 5,
    homing, targetRef,
  });
}

function explodeProjectile(p, hitPos) {
  if (p.aoe > 0) {
    AudioSys.explosion();
    state.shake = Math.max(state.shake, 0.5);
    hitStop(0.12, 6);
    explosionFX(hitPos, 1.3);
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

    if (p.homing > 0) {
      let aimPos = null;
      if (p.friendly && p.targetRef && !p.targetRef.dead) {
        aimPos = tmpAim.copy(p.targetRef.pos).add(new THREE.Vector3(0, 0.8, 0));
      } else if (!p.friendly) {
        aimPos = tmpAim.copy(player.pos);
      }
      if (aimPos) {
        const desired = aimPos.sub(p.group.position).normalize().multiplyScalar(p.speed);
        p.vel.lerp(desired, Math.min(1, p.homing * dt));
        p.vel.setLength(p.speed);
      }
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
        if (pos.distanceTo(e.pos.clone().add(new THREE.Vector3(0, e.flying ? 0 : 0.8, 0))) < e.radius + p.size + 0.5) {
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
      if (pos.distanceTo(player.pos) < 1.5) {
        damagePlayer(p.damage);
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
// Enemies — grounded gunners and aerial chasers
// ----------------------------------------------------------------------------
function spawnEnemy(boss = false) {
  let spec;
  if (boss) {
    spec = SPECIES.rockor;
  } else if (state.wave >= 2 && Math.random() < 0.35) {
    spec = SPECIES.zephyra;
  } else {
    const ground = [SPECIES.rockor, SPECIES.vinex, SPECIES.aquish];
    spec = ground[Math.floor(Math.random() * ground.length)];
  }

  // duelists step in close — this is a brawl, not a shooting gallery
  const a = player.yaw + rand(-0.9, 0.9); // roughly in front of you
  const dist = spec.flying ? rand(16, 22) : rand(13, 17);
  const x = clamp(player.pos.x + Math.sin(a) * dist, -150, 150);
  const z = clamp(player.pos.z + Math.cos(a) * dist, -150, 150);
  const group = spec.build();
  const y = spec.flying ? player.pos.y + rand(1, 5) : terrainHeight(x, z);
  group.position.set(x, y, z);
  if (boss) group.scale.setScalar(2.2);
  scene.add(group);

  const mul = (1 + (state.wave - 1) * 0.35) * (boss ? 3.5 : 1.7);
  const e = {
    spec, group, boss,
    flying: spec.flying,
    pos: group.position,
    hp: spec.hp * mul, maxHp: spec.hp * mul,
    damage: spec.damage * (1 + (state.wave - 1) * 0.12) * (boss ? 1.6 : 1),
    radius: boss ? 2.4 : 1.1,
    yaw: 0,
    attackTimer: rand(1.2, 2),
    chase: spec.speed * 2.6 + state.wave * 0.12,
    meleeRange: boss ? 5.2 : 3.6,
    windup: 0,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    orbitA: rand(0, TAU),
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    knock: new THREE.Vector3(),
    slow: 0, dead: false, deathT: 0, flash: 0,
    bobPhase: rand(0, TAU),
    mats: [],
  };
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
  bar.position.y = boss ? 2.6 : (spec.flying ? 1.2 : 2.2);
  group.add(bar);
  e.hpBar = bar;
  e.hpFg = fg;
  e.barW = barW;

  // red arrow marker above the head — always visible, gold when targeted
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.6, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff3030, transparent: true, opacity: 0.95, depthTest: false,
    }));
  marker.rotation.x = Math.PI; // point down at the enemy
  marker.renderOrder = 999;
  marker.position.y = boss ? 3.3 : (spec.flying ? 1.6 : 2.9);
  group.add(marker);
  e.marker = marker;
  e.markerBaseY = marker.position.y;

  enemies.push(e);
  burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)),
    { count: boss ? 30 : 16, color: 0xffffff, speed: 4, size: 0.8, life: 0.6 });
  if (boss) {
    announce(`⚠ ROUND ${state.wave} — BOSS ${spec.name} challenges you!`, 2800);
    state.shake = Math.max(state.shake, 0.5);
    addShockwave(e.pos, 8, 0xffffff);
  } else {
    announce(`ROUND ${state.wave} — WILD ${spec.name} challenges you!`, 2400);
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
    // Ash celebrates your kills
    if (state.time - ashNpc.lastCheer > 6) {
      ashNpc.lastCheer = state.time;
      ashNpc.cheer = 1.8;
      callout(CHEERS[Math.floor(Math.random() * CHEERS.length)], 2200);
    }
    if (target === e) target = pickTarget();
  }
}

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
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.dead) {
      e.deathT += dt;
      const s = Math.max(0.01, 1 - e.deathT * 1.4) * (e.boss ? 2.2 : 1);
      e.group.scale.setScalar(s);
      e.group.rotation.z = e.deathT * 2;
      if (e.flying) e.pos.y -= 9 * e.deathT * dt; // birds drop from the sky
      if (e.deathT > 0.75) {
        scene.remove(e.group);
        enemies.splice(i, 1);
      }
      continue;
    }

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

    const toPlayer = player.pos.clone().sub(e.pos);
    const dist3 = toPlayer.length();
    const flatDir = toPlayer.clone().setY(0).normalize();
    e.yaw = Math.atan2(flatDir.x, flatDir.z);
    e.group.rotation.y = e.yaw;

    const slowMul = e.slow > 0 ? 0.3 : 1;
    e.slow = Math.max(0, e.slow - dt);

    if (e.flying) {
      // tight orbit around you, pressing in for swoop attacks
      e.orbitA += dt * 0.7 * e.orbitDir;
      const orbR = e.windup > 0 ? 2.5 : 8;
      const want = new THREE.Vector3(
        player.pos.x + Math.cos(e.orbitA) * orbR,
        clamp(player.pos.y + Math.sin(state.time * 0.7 + e.orbitA) * 2.5, terrainHeight(e.pos.x, e.pos.z) + 3, 88),
        player.pos.z + Math.sin(e.orbitA) * orbR);
      const dir = want.sub(e.pos);
      const d = dir.length();
      if (d > 0.5) e.pos.addScaledVector(dir.normalize(), Math.min(e.chase * slowMul, d * 1.6) * dt);
      const wings = e.group.userData.flapWings;
      if (wings) {
        for (const w of wings) {
          w.rotation.z = w.userData.sign * Math.sin(state.time * 11 + e.bobPhase) * 0.5;
        }
      }
    } else {
      // DUEL AI: rush into melee range, then circle-strafe like a fighter
      const flatDist = Math.hypot(toPlayer.x, toPlayer.z);
      const stop = e.meleeRange * 0.8;
      if (flatDist > stop) {
        e.pos.addScaledVector(flatDir, Math.min(e.chase * slowMul, (flatDist - stop) * 3 + 2) * dt);
      } else if (e.windup <= 0) {
        const tangent = new THREE.Vector3(-flatDir.z, 0, flatDir.x).multiplyScalar(e.strafeDir);
        e.pos.addScaledVector(tangent, e.spec.speed * 0.9 * slowMul * dt);
        if (Math.random() < dt * 0.35) e.strafeDir *= -1;
      }
      e.pos.y = terrainHeight(e.pos.x, e.pos.z);
      e.bobPhase += dt * 8 * slowMul;
      // crouch during the windup telegraph
      e.group.position.y = e.pos.y + Math.abs(Math.sin(e.bobPhase)) * 0.12
        - (e.windup > 0 ? 0.18 : 0);
    }
    e.pos.addScaledVector(e.knock, dt);
    e.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));

    // attacks — melee lunge with a telegraphed windup; spit only when you run
    e.attackTimer -= dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        if (dist3 < e.meleeRange + 2.4) {
          damagePlayer(e.damage);
          burst(player.pos.clone(), { count: 12, color: 0xffffff, speed: 6, size: 0.6, life: 0.4 });
          state.shake = Math.max(state.shake, e.boss ? 0.5 : 0.35);
        }
      }
    } else if (e.attackTimer <= 0) {
      if (dist3 < e.meleeRange + 1.6) {
        e.windup = 0.45; // rear back — your cue to dodge or strike first
        e.attackTimer = e.spec.attackCd * rand(0.8, 1.15);
        AudioSys.tone({ freq: 180, dur: 0.32, type: "sawtooth", gain: 0.15, slide: 2.2 });
      } else if (e.spec.projectile && dist3 > 8 && dist3 < 60) {
        const pr = e.spec.projectile;
        const from = e.pos.clone().add(new THREE.Vector3(0, e.flying ? 0 : 1.2, 0));
        spawnProjectile({
          pos: from, dir: player.pos.clone().sub(from).normalize(),
          speed: pr.speed * (e.boss ? 0.85 : 1), size: pr.size * (e.boss ? 1.8 : 1),
          color: pr.color, damage: e.damage * 0.8, friendly: false, trail: pr.color,
          homing: 1.1,
        });
        AudioSys.tone({ freq: e.boss ? 120 : 300, dur: 0.12, type: e.boss ? "sawtooth" : "sine", gain: 0.14, slide: 1.5 });
        e.attackTimer = e.spec.attackCd * rand(1.3, 1.7);
      }
    }

    e.hpBar.lookAt(camera.position);
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    e.hpFg.scale.x = Math.max(frac, 0.001);
    e.hpFg.position.x = -(1 - frac) * e.barW / 2;

    // marker: bob + spin; gold when locked, white strobe during attack windup
    const locked = e === target;
    e.marker.position.y = e.markerBaseY + Math.sin(state.time * 3.2 + e.bobPhase) * 0.18;
    e.marker.rotation.y += dt * 2.5;
    if (e.windup > 0) {
      e.marker.material.color.setHex(Math.sin(state.time * 40) > 0 ? 0xffffff : 0xff3030);
      e.marker.scale.setScalar(1.8);
    } else {
      e.marker.material.color.setHex(locked ? 0xffcc22 : 0xff3030);
      e.marker.scale.setScalar(locked ? 1.55 + Math.sin(state.time * 6) * 0.18 : 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Player damage / XP / levels
// ----------------------------------------------------------------------------
function damagePlayer(amount) {
  if (state.over) return;
  player.hp -= amount;
  AudioSys.hurt();
  state.shake = Math.max(state.shake, 0.28);
  HUD.vignette.style.opacity = "1";
  setTimeout(() => { HUD.vignette.style.opacity = "0"; }, 250);
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

function gainXp(amount) {
  state.xp += amount;
  while (state.xp >= state.xpNeeded) {
    state.xp -= state.xpNeeded;
    state.level++;
    state.xpNeeded = Math.round(state.xpNeeded * 1.35);
    player.maxHp += 25;
    player.hp = player.maxHp;
    player.dmgMul = 1 + (state.level - 1) * 0.15;
    AudioSys.levelUp();
    announce(`CHARIZARD grew to Lv ${state.level}!`);
    burst(player.pos.clone(), { count: 30, color: 0x7ee0ff, speed: 6, size: 0.8, life: 0.9 });

    if (state.level >= 5 && !state.mega) {
      state.mega = true;
      player.dmgMul += 0.4;
      for (const m of player.group.userData.bodyMats) {
        m.color.set(0xd9541f);
        m.emissive.set(0x6e1c00);
        m.emissiveIntensity = 0.4;
      }
      HUD.pkmnName.textContent = "CHARIZARD ⚡MEGA BLAZE";
      announce("⚡ MEGA BLAZE! Your inner fire erupts!", 3000);
      explosionFX(player.pos.clone(), 1.6);
      state.shake = 0.55;
      hitStop(0.1, 8);
    }
  }
}

// ----------------------------------------------------------------------------
// Waves
// ----------------------------------------------------------------------------
// 1-on-1 duel: each round, a single challenger steps into the arena
function startWave() {
  state.wave++;
  state.spawnQueue = 1;
  state.spawnTimer = 0.6;
  state.bossQueued = state.wave % 4 === 0;
  AudioSys.waveStart();
}

function updateWaves(dt) {
  if (state.spawnQueue > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnQueue--;
      spawnEnemy(state.bossQueued); // boss rounds get the boss as the duelist
      state.bossQueued = false;
    }
  } else if (enemies.length === 0) {
    if (state.waveCooldown <= 0) {
      state.waveCooldown = 4;
      announce("ROUND WON!");
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
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
  AudioSys.setWind(0);
  explosionFX(player.pos.clone(), 1.6);
  document.getElementById("final-stats").innerHTML =
    `SCORE ${state.score}<br/>WAVE ${state.wave} · Lv ${state.level}`;
  setTimeout(() => { document.getElementById("gameover-overlay").style.display = "flex"; }, 900);
}

document.getElementById("retry-btn").addEventListener("click", () => location.reload());
document.getElementById("start-btn").addEventListener("click", () => {
  AudioSys.init();
  document.getElementById("title-overlay").style.display = "none";
  state.running = true;
  // begin grounded on the stadium turf, facing the center
  player.mode = "ground";
  player.pos.set(5, terrainHeight(5, -11) + 1.45, -11);
  player.vel.set(0, 0, 0);
  player.speed = 0;
  player.yaw = Math.atan2(-5, 11);
  aim.yaw = player.yaw;
  aim.pitch = 0.04;
  if (!IS_TOUCH) renderer.domElement.requestPointerLock();
  startWave();
  setTimeout(() => callout("Press 🕊 FLY (or Space) to take off!", 3500), 1200);
});

// ----------------------------------------------------------------------------
// Flight — the heart of feeling like the Pokémon
// ----------------------------------------------------------------------------
function updatePlayer(dt) {
  const grounded = player.mode === "ground";
  const landing = player.mode === "landing";

  // steering input
  if (joy.mag > 0.1) {
    aim.yaw -= joy.x * 2.1 * dt;
    if (!grounded) aim.pitch = clamp(aim.pitch - joy.y * 1.5 * dt, -0.8, 0.8);
    if (Math.abs(joy.x) > 0.25) input.lastSteer = nowSec();
  }
  if (keys["ArrowLeft"]) { aim.yaw += 1.8 * dt; input.lastSteer = nowSec(); }
  if (keys["ArrowRight"]) { aim.yaw -= 1.8 * dt; input.lastSteer = nowSec(); }
  if (!grounded && keys["ArrowUp"]) aim.pitch = clamp(aim.pitch + 1.4 * dt, -0.8, 0.8);
  if (!grounded && keys["ArrowDown"]) aim.pitch = clamp(aim.pitch - 1.4 * dt, -0.8, 0.8);
  if (grounded) aim.pitch = lerp(aim.pitch, 0.04, 1 - Math.pow(0.05, dt));
  if (landing) aim.pitch = lerp(aim.pitch, -0.42, 1 - Math.pow(0.1, dt));

  // AIM ASSIST — when you aren't actively steering, track the locked enemy
  if (target && !target.dead && nowSec() - input.lastSteer > 0.55) {
    const to = target.pos.clone().sub(player.pos);
    const yawT = Math.atan2(to.x, to.z);
    const diff = Math.abs(angleDiff(yawT, aim.yaw));
    if (grounded) {
      aim.yaw = lerpAngle(aim.yaw, yawT, 1 - Math.pow(0.18, dt)); // pivot onto the target
    } else if (diff < 1.1 && !landing) {
      aim.yaw = lerpAngle(aim.yaw, yawT, 1 - Math.pow(0.5, dt)); // gentle in flight
      const pitchT = clamp(Math.atan2(to.y, Math.hypot(to.x, to.z)), -0.7, 0.7);
      aim.pitch = lerp(aim.pitch, pitchT, 1 - Math.pow(0.5, dt));
    }
  }

  // the dragon chases your aim with weight
  player.yaw = lerpAngle(player.yaw, aim.yaw, 1 - Math.pow(grounded ? 0.03 : 0.085, dt));
  player.pitch = lerp(player.pitch, grounded ? 0 : aim.pitch, 1 - Math.pow(0.05, dt));

  const boost = keys["ShiftLeft"] || keys["ShiftRight"] || touchBoost.on;
  const brake = keys["KeyS"];
  // on the ground he stands still unless you actually push forward
  let walkInput = 0;
  if (grounded) {
    if (keys["KeyW"]) walkInput = 1;
    if (joy.mag > 0.15) walkInput = Math.max(walkInput, clamp(-joy.y, 0, 1));
  }
  const targetSpeed = grounded
    ? walkInput * (boost ? 12 : 6.5)
    : (boost ? 32 : brake ? 5 : keys["KeyW"] ? 20 : 14);
  player.speed = lerp(player.speed, targetSpeed, 1 - Math.pow(0.3, dt));

  const fwd = playerForward();
  tmpAim.copy(fwd).multiplyScalar(player.speed);
  if (grounded) tmpAim.y = 0;
  player.vel.lerp(tmpAim, 1 - Math.pow(0.02, dt));
  player.pos.addScaledVector(player.vel, dt);

  // world bounds
  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > 260) {
    player.pos.multiplyScalar(260 / r);
    callout("Turn back — the battle is here!");
  }

  const groundY = terrainHeight(player.pos.x, player.pos.z);
  if (grounded) {
    // stick to the terrain with a walk bob
    player.walkPhase += dt * player.speed * 1.6;
    const bob = Math.abs(Math.sin(player.walkPhase)) * 0.07 * Math.min(1, player.speed / 4);
    player.pos.y = lerp(player.pos.y, groundY + 1.45 + bob, 1 - Math.pow(0.0001, dt));
    player.vel.y = 0;
    if (player.speed > 8 && Math.random() < dt * 12) {
      spawnParticle({
        pos: player.pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), -1.3, rand(-0.5, 0.5))),
        smoke: true, color: 0x9a8a70, size: rand(0.4, 0.8), endSize: 1.6, life: rand(0.4, 0.7),
        vel: new THREE.Vector3(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)),
      });
    }
  } else {
    const minY = groundY + (landing ? 1.45 : 2.2);
    if (player.pos.y < minY) {
      player.pos.y = minY;
      if (landing) {
        // touchdown
        player.mode = "ground";
        player.vel.y = 0;
        aim.pitch = 0.04;
        burst(player.pos.clone().add(new THREE.Vector3(0, -1.2, 0)),
          { count: 16, color: 0xcfc2a8, speed: 6, size: 0.8, life: 0.55 });
        state.shake = Math.max(state.shake, 0.22);
        callout("CHARIZARD landed.");
      } else {
        if (aim.pitch < 0) aim.pitch *= 0.6; // ease out of the dive
        if (player.speed > 18 && Math.random() < dt * 20) {
          spawnParticle({
            pos: player.pos.clone().add(new THREE.Vector3(rand(-1, 1), -1.5, rand(-1, 1))),
            smoke: true, color: 0x9a8a70, size: rand(0.6, 1.2), endSize: 2.4, life: rand(0.5, 0.9),
            vel: new THREE.Vector3(rand(-2, 2), rand(1, 3), rand(-2, 2)),
          });
        }
      }
    }
    if (player.pos.y > 92) {
      player.pos.y = 92;
      if (aim.pitch > 0) aim.pitch *= 0.6;
    }
  }

  // banking — roll into turns (level on the ground)
  const yawErr = angleDiff(aim.yaw, player.yaw);
  player.roll = lerp(player.roll, grounded ? 0 : clamp(-yawErr * 2.2, -1, 1), 1 - Math.pow(0.05, dt));

  const g = player.group;
  g.position.copy(player.pos);
  g.rotation.order = "YXZ";
  g.rotation.set(-player.pitch, player.yaw, player.roll);

  // ---- animation: wings, head, jaw, tail ----
  const ud = g.userData;
  const hover = player.speed < 9;
  const flapRate = grounded ? 1.4 : boost ? 2.2 : hover ? 7.5 : 3.4;
  const flapAmp = grounded ? 0.05 : boost ? 0.12 : hover ? 0.55 : 0.28;
  const prevPhase = player.flapPhase;
  player.flapPhase += dt * flapRate;
  // wing-beat whoosh at the bottom of each stroke
  if (Math.floor(prevPhase / Math.PI) !== Math.floor(player.flapPhase / Math.PI) && !boost && !grounded) {
    AudioSys.flap();
  }
  for (const w of ud.wings) {
    // folded against the back on the ground, spread in flight
    const lift = grounded ? -0.95 : boost ? -0.25 : 0.15;
    w.rotation.z = w.userData.sign * (lift + Math.sin(player.flapPhase) * flapAmp);
    w.rotation.x = grounded ? 0 : Math.sin(player.flapPhase - 0.6) * 0.1 * flapAmp * 3;
  }
  ud.tailGroup.rotation.y = Math.sin(state.time * 2.1) * 0.08 + clamp(yawErr, -0.5, 0.5) * 0.4;

  // jaw + mouth glow while breathing fire; gaping snap during a bite
  player.fireFlash = Math.max(0, player.fireFlash - dt);
  player.biteT = Math.max(0, player.biteT - dt);
  player.lungeT = Math.max(0, player.lungeT - dt);
  const jawTarget = player.biteT > 0 ? 0.72
    : player.flameActive > 0 ? 0.5 : player.fireFlash > 0 ? 0.3 : 0;
  player.jawOpen = lerp(player.jawOpen, jawTarget, 1 - Math.pow(player.biteT > 0 ? 1e-7 : 0.001, dt));
  ud.jaw.rotation.x = player.jawOpen;
  ud.jaw.position.y = -0.2 - player.jawOpen * 0.08;
  // head lunges into the bite, recoils out of it
  ud.head.rotation.x = -aim.pitch * 0.35 + (player.biteT > 0 ? Math.sin(player.biteT * 22) * 0.28 : 0);
  ud.mouthGlow.intensity = player.flameActive > 0 ? 14 : player.fireFlash * 18;

  // tail flame burns hotter with speed and MEGA BLAZE
  const heat = (boost ? 1.6 : 1) * (state.mega ? 1.35 : 1) * (player.hp / player.maxHp < 0.3 ? 1.5 : 1);
  flameUniforms.uBoost.value = lerp(flameUniforms.uBoost.value, heat, 1 - Math.pow(0.01, dt));
  ud.flame.scale.setScalar(0.72 * clamp(heat, 1, 1.8)); // trimmed so it can't wall off the camera
  ud.flameLight.intensity = 8 + Math.sin(state.time * 23) * 2.5 + (heat - 1) * 8;
  if (Math.random() < dt * (10 + player.speed * 0.6)) {
    const fp = new THREE.Vector3();
    ud.flame.getWorldPosition(fp);
    spawnParticle({
      pos: fp, color: 0xffaa44, size: rand(0.1, 0.2), endSize: 0.02, life: rand(0.4, 0.9),
      vel: player.vel.clone().multiplyScalar(-0.3).add(new THREE.Vector3(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1))),
    });
  }

  // boost: wind streaks past your head + engine-of-fire trail
  if (boost) {
    if (Math.random() < dt * 40) {
      const side = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      spawnParticle({
        pos: player.pos.clone().addScaledVector(fwd, rand(5, 11))
          .addScaledVector(side, rand(-5, 5)).add(new THREE.Vector3(0, rand(-3, 4), 0)),
        color: 0xffffff, size: 0.14, endSize: 0.03, life: 0.3,
        vel: player.vel.clone().multiplyScalar(-0.9),
      });
    }
    state.fovKick = Math.max(state.fovKick, 0.01); // handled via speed FOV below
  }
  AudioSys.setWind(clamp((player.speed - 5) / 27, 0, 1));

  // auto-fireball keeps the pressure on between your commands
  player.autoTimer -= dt;
  if (player.autoTimer <= 0 && state.running && !state.over) {
    player.autoTimer = 2.4;
    if (target && !target.dead && target.pos.distanceTo(player.pos) < 60) {
      const from = mouthPos();
      spawnProjectile({
        pos: from, dir: aimDirAt(target.pos, from), speed: 30, size: 0.14, color: 0xff9933,
        damage: 7 * player.dmgMul, friendly: true, trail: 0xffbb55,
        homing: 6, targetRef: target,
      });
      player.fireFlash = Math.max(player.fireFlash, 0.15);
    }
  }

  // flamethrower stream pours out along your facing
  if (player.flameActive > 0) {
    player.flameActive -= dt;
    const mouth = mouthPos();
    for (let j = 0; j < 5; j++) {
      const spread = new THREE.Vector3(rand(-0.12, 0.12), rand(-0.1, 0.08), rand(-0.12, 0.12));
      spawnParticle({
        pos: mouth, color: [0xff4400, 0xff8800, 0xffcc44][j % 3],
        size: rand(0.6, 1.2), endSize: 2.6, life: rand(0.4, 0.75),
        vel: fwd.clone().add(spread).normalize().multiplyScalar(rand(16, 26) + player.speed * 0.5),
        drag: 1.0,
      });
    }
    if (Math.random() < dt * 18) {
      spawnParticle({
        pos: mouth.clone().addScaledVector(fwd, rand(6, 14)),
        smoke: true, color: 0x4a423c, size: rand(0.8, 1.5), endSize: 3, life: rand(0.7, 1.2),
        vel: new THREE.Vector3(rand(-0.5, 0.5), rand(1, 2), rand(-0.5, 0.5)),
      });
    }
    for (const e of enemies) {
      if (e.dead) continue;
      const to = e.pos.clone().sub(mouth);
      const d = to.length();
      if (d < 26 && to.normalize().dot(fwd) > 0.78) {
        damageEnemyTick(e, 42 * player.dmgMul * dt);
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
    damageEnemyTick(e, 14 * player.dmgMul * dt);
  }
}

// ----------------------------------------------------------------------------
// Ash cheering
// ----------------------------------------------------------------------------
function updateAshNpc(dt) {
  const g = ashNpc.group;
  // face the dragon
  const to = player.pos.clone().sub(g.position);
  g.rotation.y = Math.atan2(to.x, to.z);
  ashNpc.cheer = Math.max(0, ashNpc.cheer - dt);
  const arms = g.userData.arms;
  if (ashNpc.cheer > 0) {
    // both arms pumping overhead
    arms[0].rotation.x = -2.6 + Math.sin(state.time * 10) * 0.5;
    arms[1].rotation.x = -2.6 + Math.sin(state.time * 10 + 1.2) * 0.5;
  } else {
    arms[0].rotation.x = Math.sin(state.time * 1.8) * 0.12;
    arms[1].rotation.x = -Math.sin(state.time * 1.8) * 0.12;
  }
}

// ----------------------------------------------------------------------------
// Camera — tight over-the-shoulder dragon cam with banked horizon
// ----------------------------------------------------------------------------
function updateCamera(dt) {
  const grounded = player.mode === "ground";
  const fwd = playerForward();
  // over-the-shoulder framing: offset to the right so the tail flame
  // doesn't sit between the camera and the view center
  const side = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const desired = player.pos.clone()
    .addScaledVector(fwd, grounded ? -5.8 : -7.4)
    .addScaledVector(side, grounded ? 1.7 : 2.2)
    .add(new THREE.Vector3(0, grounded ? 2.2 : 2.9, 0));
  const minY = terrainHeight(desired.x, desired.z) + 0.7;
  if (desired.y < minY) desired.y = minY;
  camera.position.lerp(desired, 1 - Math.pow(0.0005, dt));

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.6);
    camera.position.x += rand(-1, 1) * state.shake * 0.32;
    camera.position.y += rand(-1, 1) * state.shake * 0.32;
  }

  // bank the horizon with the dragon's roll — sells the turn
  camera.up.set(Math.sin(-player.roll * 0.45), Math.cos(player.roll * 0.45), 0);
  camera.lookAt(player.pos.clone().addScaledVector(fwd, 9)
    .addScaledVector(side, 1.1).add(new THREE.Vector3(0, 0.6, 0)));

  state.fovKick = Math.max(0, state.fovKick - dt * 22);
  const speedFov = 58 + clamp((player.speed - 5) / 27, 0, 1) * 18;
  const targetFov = speedFov + state.fovKick;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.pow(0.001, dt));
    camera.updateProjectionMatrix();
  }

  sun.position.set(player.pos.x + 55, player.pos.y + 80, player.pos.z + 35);
  sun.target.position.copy(player.pos);
}

// ----------------------------------------------------------------------------
// HUD
// ----------------------------------------------------------------------------
function updateHud() {
  const hpFrac = clamp(player.hp / player.maxHp, 0, 1);
  HUD.hpFill.style.width = `${hpFrac * 100}%`;
  HUD.hpFill.className = "fill" + (hpFrac < 0.25 ? " danger" : hpFrac < 0.55 ? " warn" : "");
  HUD.hpLabel.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  HUD.xpFill.style.width = `${(state.xp / state.xpNeeded) * 100}%`;
  HUD.lvlLabel.textContent = `Lv ${state.level}`;
  HUD.waveLabel.textContent = `ROUND ${state.wave}`;
  HUD.scoreLabel.textContent = `SCORE ${state.score}`;
  const alive = enemies.filter(e => !e.dead).length + state.spawnQueue;
  HUD.enemiesLeft.textContent = alive > 0 ? "⚔ FIGHT!" : "round won";

  if (target && !target.dead) {
    HUD.targetPanel.style.display = "block";
    HUD.targetName.textContent = `${target.boss ? "👑 BOSS" : "WILD"} ${target.spec.name}`;
    const f = clamp(target.hp / target.maxHp, 0, 1);
    HUD.targetHpFill.style.width = `${f * 100}%`;
    HUD.targetHpLabel.textContent = `${Math.ceil(target.hp)} / ${Math.round(target.maxHp)}`;
    targetRing.visible = true;
    targetRing.position.copy(target.pos);
    if (target.flying) {
      targetRing.lookAt(camera.position); // halo facing you in the air
    } else {
      targetRing.rotation.set(-Math.PI / 2, 0, 0);
      targetRing.position.y = terrainHeight(target.pos.x, target.pos.z) + 0.12;
    }
    targetRing.scale.setScalar((target.boss ? 2 : 1) * (1 + Math.sin(state.time * 5) * 0.07));
  } else {
    HUD.targetPanel.style.display = "none";
    targetRing.visible = false;
  }

  if (state.comboTimer <= 0 && state.combo > 0) {
    state.combo = 0;
    HUD.combo.style.opacity = "0";
  }

  const flyLabel = player.mode === "ground" ? "🕊<small>FLY</small>"
    : player.mode === "fly" ? "🛬<small>LAND</small>" : "⏬<small>…</small>";
  if (HUD.flyBtn.innerHTML !== flyLabel) HUD.flyBtn.innerHTML = flyLabel;

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
// Main loop
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
  gradePass.uniforms.uTime.value = state.time;
  state.comboTimer -= sdt;

  for (const cloud of flyClouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 280) cloud.position.x = -280;
  }

  if (state.running && !state.over) {
    for (const m of MOVES) m.timer = Math.max(0, m.timer - sdt);
    if (!target || target.dead) target = pickTarget();
    updatePlayer(sdt);
    updateEnemies(sdt);
    updateProjectiles(sdt);
    updateFireSpins(sdt);
    updateWaves(sdt);
    updateAshNpc(sdt);
    updateHud();
    AudioSys.updateMusic(true);
    updateCamera(dt);
  } else if (!state.running) {
    // title screen: Charizard hovers over the stadium while the camera circles
    player.pos.set(0, 12 + Math.sin(state.time * 1.2) * 0.6, 0);
    player.yaw = state.time * 0.25;
    player.pitch = 0;
    player.speed = 6;
    aim.yaw = player.yaw;
    const g = player.group;
    g.position.copy(player.pos);
    g.rotation.order = "YXZ";
    g.rotation.set(0, player.yaw, 0);
    player.flapPhase += dt * 7;
    for (const w of g.userData.wings) {
      w.rotation.z = w.userData.sign * (0.15 + Math.sin(player.flapPhase) * 0.5);
    }
    const a = state.time * 0.1;
    camera.position.lerp(new THREE.Vector3(Math.sin(a) * 17, 14.5, Math.cos(a) * 17), 1 - Math.pow(0.01, dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(player.pos);
  } else {
    // game over: keep rendering the scene from where the battle ended
    updateCamera(dt);
  }

  updateParticles(sdt);
  updateDamageNumbers(sdt);
  updateScorches(sdt);
  updateShockwaves(sdt);
  updateSlashArcs(sdt);
  composer.render();
}
tick();
