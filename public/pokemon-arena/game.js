// ============================================================================
// POKÉMON ARENA 3D — Ash & Charmander survival battle
// Self-contained Three.js arcade game. Unofficial fan-made demo.
// ============================================================================
import * as THREE from "three";

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

// ----------------------------------------------------------------------------
// Renderer / scene / camera
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
scene.fog = new THREE.Fog(0x9cc4e4, 60, 220);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------------------------
// Lighting — warm golden-hour look
// ----------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3d5a2a, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe3b0, 2.2);
sun.position.set(55, 80, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.far = 250;
sun.shadow.bias = -0.0008;
scene.add(sun);

// ----------------------------------------------------------------------------
// Procedural textures (glow sprite, sky)
// ----------------------------------------------------------------------------
function makeGlowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTex = makeGlowTexture();

// Sky dome with vertical gradient + sun glow baked in
{
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#3a7bd5");
  grad.addColorStop(0.45, "#7fb6e8");
  grad.addColorStop(0.72, "#ffd9a0");
  grad.addColorStop(1, "#ffb36b");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 18),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(255,245,200,1)", "rgba(255,200,80,0)"),
    fog: false, depthWrite: false,
  }));
  sunSprite.scale.setScalar(110);
  sunSprite.position.set(220, 230, 140);
  scene.add(sunSprite);
}

// ----------------------------------------------------------------------------
// Terrain — flat battle arena in the middle, rolling hills around it
// ----------------------------------------------------------------------------
function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const flat = smoothstep(20, 48, d); // 0 inside the arena, 1 on the hills
  const h =
    Math.sin(x * 0.06) * Math.cos(z * 0.05) * 2.2 +
    Math.sin(x * 0.021 + 3.1) * Math.cos(z * 0.017 + 1.7) * 3.6 +
    Math.sin((x + z) * 0.11) * 0.45;
  return h * flat;
}

{
  const size = 320, segs = 150;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x4f8f3a);
  const grassDark = new THREE.Color(0x3a6e2a);
  const sand = new THREE.Color(0xcbb377);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const d = Math.hypot(x, z);
    const sandMix = 1 - smoothstep(13, 19, d); // sandy battle circle
    const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + 0.5;
    tmp.copy(grass).lerp(grassDark, n).lerp(sand, sandMix);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ----------------------------------------------------------------------------
// Scenery: arena stones, trees, rocks, grass tufts, clouds
// ----------------------------------------------------------------------------
const scenery = new THREE.Group();
scene.add(scenery);
const clouds = [];

{
  // Standing stones marking the battle circle
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8d96, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const x = Math.cos(a) * 17.5, z = Math.sin(a) * 17.5;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(rand(0.8, 1.3), rand(1.4, 2.4), rand(0.7, 1.1)), stoneMat);
    stone.position.set(x, terrainHeight(x, z) + 0.7, z);
    stone.rotation.y = rand(0, TAU);
    stone.rotation.z = rand(-0.12, 0.12);
    stone.castShadow = stone.receiveShadow = true;
    scenery.add(stone);
  }

  // Trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
  const leafMats = [0x2f7a2f, 0x3f8f33, 0x2a6e3e].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  for (let i = 0; i < 60; i++) {
    const a = rand(0, TAU), r = rand(26, 120);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const tree = new THREE.Group();
    const s = rand(0.8, 1.7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 2.2 * s, 7), trunkMat);
    trunk.position.y = 1.1 * s;
    trunk.castShadow = true;
    tree.add(trunk);
    const mat = leafMats[i % leafMats.length];
    for (let j = 0; j < 3; j++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.9 - j * 0.45) * s, 1.9 * s, 8), mat);
      cone.position.y = (2.2 + j * 1.15) * s;
      cone.castShadow = true;
      tree.add(cone);
    }
    tree.position.set(x, y, z);
    tree.rotation.y = rand(0, TAU);
    scenery.add(tree);
  }

  // Boulders
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU), r = rand(24, 110);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.6), 0), rockMat);
    rock.position.set(x, terrainHeight(x, z) + 0.3, z);
    rock.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    rock.castShadow = rock.receiveShadow = true;
    scenery.add(rock);
  }

  // Grass tufts (cheap cones)
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x5fae3f, roughness: 1 });
  const tuftGeo = new THREE.ConeGeometry(0.16, 0.55, 4);
  for (let i = 0; i < 320; i++) {
    const a = rand(0, TAU), r = rand(20, 115);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const tuft = new THREE.Mesh(tuftGeo, tuftMat);
    tuft.position.set(x, terrainHeight(x, z) + 0.22, z);
    tuft.rotation.y = rand(0, TAU);
    tuft.scale.setScalar(rand(0.7, 1.8));
    scenery.add(tuft);
  }

  // Drifting clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(4, 8), 10, 8), cloudMat);
      puff.position.set(rand(-8, 8), rand(-1.5, 1.5), rand(-4, 4));
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(rand(-220, 220), rand(60, 110), rand(-220, 220));
    cloud.userData.speed = rand(0.6, 1.6);
    scenery.add(cloud);
    clouds.push(cloud);
  }
}

// ----------------------------------------------------------------------------
// Character builder helpers
// ----------------------------------------------------------------------------
function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.02, ...opts });
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
  const skin = std(0xf0c8a0);
  const jacket = std(0x2b5dd7);
  const white = std(0xf2f2f2);
  const jeans = std(0x3a4a6b);
  const red = std(0xe23b3b, { roughness: 0.5 });

  // torso
  const torso = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.62, 12), jacket));
  torso.position.y = 1.05;
  g.add(torso);
  const chest = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.16), white));
  chest.position.set(0, 1.05, 0.13);
  g.add(chest);

  // head + face
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skin));
  head.position.y = 1.62;
  g.add(head);
  const hair = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10, 0, TAU, 0, Math.PI * 0.55), std(0x1c1c22, { roughness: 0.85 })));
  hair.position.y = 1.65;
  g.add(hair);
  // cap
  const capTop = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 10, 0, TAU, 0, Math.PI * 0.5), red));
  capTop.position.y = 1.7;
  g.add(capTop);
  const brim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84), red));
  brim.scale.z = 1.7;
  brim.position.set(0, 1.7, 0.16);
  g.add(brim);
  const eyeMat = std(0x222222, { roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eye.position.set(sx * 0.09, 1.64, 0.21);
    g.add(eye);
  }

  // limbs — keep references for walk animation
  const parts = { arms: [], legs: [] };
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.52, 8), jacket));
    upper.position.y = -0.26;
    arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skin);
    hand.position.y = -0.55;
    arm.add(hand);
    arm.position.set(sx * 0.34, 1.32, 0);
    g.add(arm);
    parts.arms.push(arm);

    const leg = new THREE.Group();
    const thigh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.62, 8), jeans));
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
// CHARMANDER — your partner
// ----------------------------------------------------------------------------
function buildCharmander() {
  const g = new THREE.Group();
  const orange = std(0xff8c2e, { roughness: 0.55 });
  const cream = std(0xffe2a8, { roughness: 0.6 });

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 16), orange));
  body.scale.set(1, 1.18, 0.92);
  body.position.y = 0.55;
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), cream);
  belly.scale.set(0.9, 1.05, 0.62);
  belly.position.set(0, 0.52, 0.16);
  g.add(belly);

  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 16), orange));
  head.scale.set(1, 0.95, 1);
  head.position.y = 1.18;
  g.add(head);

  const snout = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), orange));
  snout.scale.set(1, 0.7, 1.05);
  snout.position.set(0, 1.1, 0.26);
  g.add(snout);

  // eyes
  const eyeWhite = std(0xffffff, { roughness: 0.25 });
  const pupilMat = std(0x1a2bb0, { roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), eyeWhite);
    ew.position.set(sx * 0.14, 1.26, 0.26);
    g.add(ew);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat);
    pupil.position.set(sx * 0.14, 1.26, 0.32);
    g.add(pupil);
  }

  // arms + legs
  for (const sx of [-1, 1]) {
    const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.32, 8), orange));
    arm.position.set(sx * 0.42, 0.72, 0.1);
    arm.rotation.z = sx * -0.6;
    arm.rotation.x = -0.35;
    g.add(arm);

    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 8), orange));
    leg.position.set(sx * 0.2, 0.16, 0);
    g.add(leg);
    const foot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), cream));
    foot.scale.set(1, 0.55, 1.4);
    foot.position.set(sx * 0.2, 0.05, 0.08);
    g.add(foot);
  }

  // tail — chain of spheres curving up behind
  const tailPts = [
    [0, 0.5, -0.36], [0, 0.42, -0.62], [0, 0.46, -0.86], [0, 0.62, -1.0], [0, 0.84, -1.06],
  ];
  tailPts.forEach((p, i) => {
    const seg = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.02, 10, 10), orange));
    seg.position.set(...p);
    g.add(seg);
  });

  // tail flame — layered additive cones + light, animated each frame
  const flame = new THREE.Group();
  const flameLayers = [];
  const layerSpecs = [
    { color: 0xff3300, r: 0.17, h: 0.5 },
    { color: 0xff9900, r: 0.12, h: 0.4 },
    { color: 0xffee66, r: 0.07, h: 0.28 },
  ];
  for (const spec of layerSpecs) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(spec.r, spec.h, 8),
      new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.y = spec.h / 2;
    flame.add(m);
    flameLayers.push(m);
  }
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(255,170,40,0.9)", "rgba(255,80,0,0)"),
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flameGlow.scale.setScalar(1.1);
  flameGlow.position.y = 0.22;
  flame.add(flameGlow);
  const flameLight = new THREE.PointLight(0xff7722, 6, 7, 2);
  flameLight.position.y = 0.3;
  flame.add(flameLight);
  flame.position.set(0, 0.92, -1.1);
  g.add(flame);

  g.userData.flameLayers = flameLayers;
  g.userData.flame = flame;
  return g;
}

// ----------------------------------------------------------------------------
// Enemy species — procedural wild creatures
// ----------------------------------------------------------------------------
const SPECIES = {
  rockor: {
    name: "ROCKOR", hp: 90, speed: 2.0, damage: 12, range: 3.0, attackCd: 2.2,
    score: 150, xp: 38, projectile: null, // melee slam
    build() {
      const g = new THREE.Group();
      const rock = std(0x8e887e, { roughness: 1 });
      const body = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rock));
      body.position.y = 0.72;
      g.add(body);
      const head = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rock));
      head.position.y = 1.42;
      g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
        eye.position.set(sx * 0.15, 1.46, 0.28);
        g.add(eye);
        const fist = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), rock));
        fist.position.set(sx * 0.78, 0.6, 0.1);
        g.add(fist);
      }
      return g;
    },
  },
  vinex: {
    name: "VINEX", hp: 60, speed: 2.8, damage: 9, range: 13, attackCd: 2.6,
    score: 120, xp: 30, projectile: { color: 0x77dd33, speed: 14, size: 0.16 },
    build() {
      const g = new THREE.Group();
      const green = std(0x49a83c, { roughness: 0.7 });
      const dark = std(0x2e7029, { roughness: 0.8 });
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), green));
      body.scale.set(1, 0.85, 1.1);
      body.position.y = 0.55;
      g.add(body);
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), dark));
      bulb.scale.set(1, 1.25, 1);
      bulb.position.set(0, 1.05, -0.15);
      g.add(bulb);
      const leafMat = std(0x5fce4a, { side: THREE.DoubleSide });
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 5), leafMat);
        const a = (i / 4) * TAU;
        leaf.position.set(Math.cos(a) * 0.22, 1.32, Math.sin(a) * 0.22 - 0.15);
        leaf.rotation.set(Math.sin(a) * 0.8, 0, Math.cos(a) * -0.8);
        g.add(leaf);
      }
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
        eye.position.set(sx * 0.18, 0.68, 0.45);
        g.add(eye);
      }
      for (const sx of [-1, 1]) {
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 7), green));
        leg.position.set(sx * 0.24, 0.15, 0);
        g.add(leg);
      }
      return g;
    },
  },
  aquish: {
    name: "AQUISH", hp: 50, speed: 4.0, damage: 8, range: 11, attackCd: 2.0,
    score: 110, xp: 26, projectile: { color: 0x44aaff, speed: 18, size: 0.14 },
    build() {
      const g = new THREE.Group();
      const blue = std(0x3a8fd9, { roughness: 0.35, metalness: 0.1 });
      const lite = std(0x9fd8ff, { roughness: 0.4 });
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 14), blue));
      body.scale.set(1, 0.95, 1.25);
      body.position.y = 0.6;
      g.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), lite);
      belly.scale.set(0.85, 0.8, 0.9);
      belly.position.set(0, 0.5, 0.22);
      g.add(belly);
      const finMat = std(0x2a6faf, { side: THREE.DoubleSide });
      const fin = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), finMat));
      fin.position.set(0, 1.1, -0.1);
      fin.rotation.x = -0.3;
      g.add(fin);
      const tail = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), finMat));
      tail.position.set(0, 0.6, -0.72);
      tail.rotation.x = Math.PI / 2;
      g.add(tail);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x113355 });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
        eye.position.set(sx * 0.2, 0.78, 0.42);
        g.add(eye);
      }
      return g;
    },
  },
};

// ----------------------------------------------------------------------------
// Particle system — pooled additive sprites
// ----------------------------------------------------------------------------
const MAX_PARTICLES = 700;
const particles = [];
const particlePool = [];

function spawnParticle(opts) {
  let p;
  if (particlePool.length) {
    p = particlePool.pop();
  } else {
    if (particles.length >= MAX_PARTICLES) return null;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    p = { sprite, vel: new THREE.Vector3() };
    scene.add(sprite);
  }
  p.sprite.visible = true;
  p.sprite.material.color.set(opts.color ?? 0xffaa33);
  p.sprite.material.opacity = opts.opacity ?? 1;
  p.sprite.position.copy(opts.pos);
  p.vel.copy(opts.vel ?? ZERO3);
  p.life = p.maxLife = opts.life ?? 0.6;
  p.size = opts.size ?? 0.5;
  p.endSize = opts.endSize ?? p.size * 0.2;
  p.gravity = opts.gravity ?? 0;
  p.drag = opts.drag ?? 0;
  p.sprite.scale.setScalar(p.size);
  particles.push(p);
  return p;
}
const ZERO3 = new THREE.Vector3();

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.sprite.visible = false;
      particles.splice(i, 1);
      particlePool.push(p);
      continue;
    }
    p.vel.y -= p.gravity * dt;
    if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.sprite.position.addScaledVector(p.vel, dt);
    const t = 1 - p.life / p.maxLife;
    p.sprite.scale.setScalar(lerp(p.size, p.endSize, t));
    p.sprite.material.opacity = (1 - t) * 0.95;
  }
}

function burst(pos, { count = 14, color = 0xff8822, speed = 6, size = 0.55, life = 0.55, up = 2 } = {}) {
  for (let i = 0; i < count; i++) {
    spawnParticle({
      pos, color, size: size * rand(0.6, 1.3), life: life * rand(0.6, 1.3),
      vel: new THREE.Vector3(rand(-1, 1), rand(0, 1) * up / 2 + 0.3, rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1.2)),
      gravity: 4, drag: 1.5,
    });
  }
}

// ----------------------------------------------------------------------------
// Floating damage numbers
// ----------------------------------------------------------------------------
const dmgNumbers = [];
function spawnDamageNumber(pos, amount, color = "#ffd24d") {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.font = "700 44px Rajdhani, sans-serif";
  g.textAlign = "center";
  g.lineWidth = 7;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(String(Math.round(amount)), 64, 46);
  g.fillStyle = color;
  g.fillText(String(Math.round(amount)), 64, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(1.6, 0.8, 1);
  sprite.position.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), rand(0.2, 0.6), 0));
  scene.add(sprite);
  dmgNumbers.push({ sprite, life: 0.9 });
}
function updateDamageNumbers(dt) {
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.life -= dt;
    d.sprite.position.y += dt * 1.6;
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
// Audio — procedural WebAudio SFX
// ----------------------------------------------------------------------------
const AudioSys = {
  ctx: null, master: null, muted: false,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // pre-render 1s of white noise
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },
  noise({ dur = 0.4, freq = 1200, q = 1, gain = 0.5, sweep = 0.3 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
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
  tone({ freq = 440, dur = 0.15, type = "square", gain = 0.18, slide = 1 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
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
  score: 0,
  wave: 0,
  level: 1,
  xp: 0,
  xpNeeded: 60,
  evolved: false,
  shake: 0,
  waveCooldown: 0,
  spawnQueue: 0,
  spawnTimer: 0,
};

const charmander = {
  group: buildCharmander(),
  pos: new THREE.Vector3(1.8, 0, 2.5),
  yaw: 0,
  hp: 100,
  maxHp: 100,
  dmgMul: 1,
  flameActive: 0,       // flamethrower time remaining
  flameDir: new THREE.Vector3(0, 0, 1),
  lunge: 0,
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
  { name: "EMBER", cd: 0.9, timer: 0 },
  { name: "FLAMETHROWER", cd: 4.5, timer: 0 },
  { name: "FIRE SPIN", cd: 8, timer: 0 },
  { name: "FLAME BURST", cd: 10, timer: 0 },
];

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
  new THREE.TorusGeometry(1.1, 0.06, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
);
targetRing.rotation.x = -Math.PI / 2;
targetRing.visible = false;
scene.add(targetRing);

function pickTarget() {
  // nearest living enemy to Charmander
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
  return targetPos.clone().add(new THREE.Vector3(0, 0.7, 0)).sub(from).normalize();
}

function useMove(i) {
  const move = MOVES[i];
  if (move.timer > 0) return;
  if (!target || target.dead) target = pickTarget();
  if (!target) { callout("No wild Pokémon in sight!"); return; }

  // turn Charmander toward the target
  const to = target.pos.clone().sub(charmander.pos);
  charmander.yaw = Math.atan2(to.x, to.z);
  charmander.lunge = 0.25;
  move.timer = move.cd;

  const mouth = charmanderMouth();
  const names = ["EMBER", "FLAMETHROWER", "FIRE SPIN", "FLAME BURST"];
  callout(`Ash: “Charmander, use <b>${names[i]}</b>!”`);

  if (i === 0) {
    // EMBER — three quick fireballs with slight spread
    AudioSys.fire();
    for (let j = 0; j < 3; j++) {
      setTimeout(() => {
        if (!target || target.dead) return;
        const dir = aimDirAt(target.pos, charmanderMouth());
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.05, 0.05));
        spawnProjectile({
          pos: charmanderMouth(), dir, speed: 26, size: 0.22, color: 0xff7711,
          damage: 12 * charmander.dmgMul, friendly: true, trail: 0xffaa33,
        });
      }, j * 110);
    }
  } else if (i === 1) {
    // FLAMETHROWER — sustained cone of fire
    AudioSys.flamethrower();
    charmander.flameActive = 1.4;
    charmander.flameDir.copy(aimDirAt(target.pos, mouth));
  } else if (i === 2) {
    // FIRE SPIN — flame vortex traps the target
    AudioSys.noise({ dur: 0.9, freq: 1400, gain: 0.4, sweep: 0.5 });
    fireSpins.push({ enemy: target, life: 4, tick: 0 });
    const light = new THREE.PointLight(0xff6611, 8, 9, 2);
    scene.add(light);
    fireSpins[fireSpins.length - 1].light = light;
  } else if (i === 3) {
    // FLAME BURST — arcing AoE bomb
    AudioSys.fire();
    const dist = target.pos.distanceTo(mouth);
    const dir = aimDirAt(target.pos, mouth);
    dir.y += clamp(dist * 0.025, 0.15, 0.55); // lob it
    dir.normalize();
    spawnProjectile({
      pos: mouth, dir, speed: 20, size: 0.45, color: 0xff5500,
      damage: 45 * charmander.dmgMul, friendly: true, trail: 0xff7722,
      gravity: 9, aoe: 5,
    });
  }
}

// ----------------------------------------------------------------------------
// Projectiles
// ----------------------------------------------------------------------------
function spawnProjectile({ pos, dir, speed, size, color, damage, friendly, trail, gravity = 0, aoe = 0 }) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffcc })
  );
  group.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(size * 6);
  group.add(glow);
  const light = new THREE.PointLight(color, 5, 8, 2);
  group.add(light);
  group.position.copy(pos);
  scene.add(group);
  projectiles.push({
    group, vel: dir.clone().multiplyScalar(speed),
    damage, friendly, trail, gravity, aoe, size, color, life: 4,
  });
}

function explodeProjectile(p, hitPos) {
  if (p.aoe > 0) {
    AudioSys.explosion();
    state.shake = Math.max(state.shake, 0.45);
    burst(hitPos, { count: 36, color: 0xff6611, speed: 11, size: 1.1, life: 0.8 });
    burst(hitPos, { count: 16, color: 0xffdd55, speed: 7, size: 0.7, life: 0.5 });
    // splash damage + knockback
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(hitPos);
      if (d < p.aoe) {
        const dmg = p.damage * (1 - d / p.aoe * 0.6);
        damageEnemy(e, dmg);
        const push = e.pos.clone().sub(hitPos).setY(0).normalize().multiplyScalar(6 * (1 - d / p.aoe));
        e.knock.add(push);
      }
    }
  } else {
    burst(hitPos, { count: 10, color: p.color, speed: 5, size: 0.5, life: 0.4 });
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.vel.y -= p.gravity * dt;
    p.group.position.addScaledVector(p.vel, dt);
    const pos = p.group.position;

    if (p.trail) {
      spawnParticle({
        pos, color: p.trail, size: p.size * 2.4, endSize: 0.05, life: 0.35,
        vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5)),
      });
    }

    let dead = p.life <= 0;

    // ground hit
    const groundY = terrainHeight(pos.x, pos.z);
    if (!dead && pos.y <= groundY + 0.15) {
      pos.y = groundY + 0.15;
      explodeProjectile(p, pos.clone());
      dead = true;
    }

    if (!dead && p.friendly) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (pos.distanceTo(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0))) < 1.0 + p.size) {
          if (p.aoe > 0) {
            explodeProjectile(p, pos.clone());
          } else {
            damageEnemy(e, p.damage);
            burst(pos, { count: 9, color: 0xffaa33, speed: 5, size: 0.5, life: 0.4 });
            AudioSys.hit();
          }
          dead = true;
          break;
        }
      }
    } else if (!dead && !p.friendly) {
      // hostile shot vs Charmander
      if (pos.distanceTo(charmander.pos.clone().add(new THREE.Vector3(0, 0.8, 0))) < 0.95) {
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
function spawnEnemy() {
  const keysArr = Object.keys(SPECIES);
  const weights = state.wave < 2 ? [0.34, 0.33, 0.33] : [0.4, 0.3, 0.3];
  let r = Math.random(), idx = 0;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
  const spec = SPECIES[keysArr[idx]];

  const a = rand(0, TAU), dist = rand(28, 42);
  const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
  const group = spec.build();
  group.position.set(x, terrainHeight(x, z), z);
  scene.add(group);

  const mul = 1 + (state.wave - 1) * 0.18;
  const e = {
    spec, group,
    pos: group.position,
    hp: spec.hp * mul, maxHp: spec.hp * mul,
    damage: spec.damage * (1 + (state.wave - 1) * 0.1),
    yaw: 0, state: "approach",
    attackTimer: rand(0.5, 1.5),
    knock: new THREE.Vector3(),
    slow: 0, dead: false, deathT: 0,
    bobPhase: rand(0, TAU),
  };

  // floating HP bar
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xff4433, depthWrite: false }));
  fg.position.z = 0.01;
  bar.add(bg, fg);
  bar.position.y = 2.2;
  group.add(bar);
  e.hpBar = bar;
  e.hpFg = fg;

  enemies.push(e);
  // entry puff
  burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 16, color: 0xffffff, speed: 4, size: 0.8, life: 0.6 });
  return e;
}

function damageEnemy(e, amount) {
  if (e.dead) return;
  e.hp -= amount;
  spawnDamageNumber(e.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), amount);
  if (e.hp <= 0) {
    e.dead = true;
    e.deathT = 0;
    AudioSys.ko();
    state.score += e.spec.score + state.wave * 10;
    gainXp(e.spec.xp);
    burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 26, color: 0xffee88, speed: 8, size: 0.9, life: 0.7 });
    if (target === e) target = pickTarget();
  }
}

function updateEnemies(dt) {
  const charPos = charmander.pos;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.dead) {
      // KO animation: sink + shrink, then remove
      e.deathT += dt;
      e.group.scale.setScalar(Math.max(0.01, 1 - e.deathT * 1.4));
      e.group.rotation.z = e.deathT * 2;
      if (e.deathT > 0.75) {
        scene.remove(e.group);
        enemies.splice(i, 1);
      }
      continue;
    }

    const toChar = charPos.clone().sub(e.pos).setY(0);
    const dist = toChar.length();
    const dir = toChar.normalize();
    e.yaw = Math.atan2(dir.x, dir.z);
    e.group.rotation.y = e.yaw;

    const slowMul = e.slow > 0 ? 0.3 : 1;
    e.slow = Math.max(0, e.slow - dt);

    // movement: approach until in range
    if (dist > e.spec.range * 0.85) {
      e.pos.addScaledVector(dir, e.spec.speed * slowMul * dt);
    }
    // knockback decay
    e.pos.addScaledVector(e.knock, dt);
    e.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));

    e.pos.y = terrainHeight(e.pos.x, e.pos.z);
    // bob while moving
    e.bobPhase += dt * 8 * slowMul;
    e.group.position.y = e.pos.y + Math.abs(Math.sin(e.bobPhase)) * 0.12;

    // attack
    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && dist < e.spec.range + 1) {
      e.attackTimer = e.spec.attackCd * rand(0.9, 1.2);
      if (e.spec.projectile) {
        const pr = e.spec.projectile;
        const from = e.pos.clone().add(new THREE.Vector3(0, 1, 0));
        spawnProjectile({
          pos: from, dir: aimDirAt(charPos, from), speed: pr.speed, size: pr.size,
          color: pr.color, damage: e.damage, friendly: false, trail: pr.color,
        });
        AudioSys.tone({ freq: 300, dur: 0.1, type: "sine", gain: 0.12, slide: 1.6 });
      } else if (dist < e.spec.range + 0.5) {
        // melee slam
        damageCharmander(e.damage);
        burst(charPos.clone().add(new THREE.Vector3(0, 0.8, 0)), { count: 10, color: 0xcccccc, speed: 5, size: 0.5, life: 0.4 });
        state.shake = Math.max(state.shake, 0.3);
      }
    }

    // billboard HP bar
    e.hpBar.lookAt(camera.position);
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    e.hpFg.scale.x = frac;
    e.hpFg.position.x = -(1 - frac) * 0.75;
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
  spawnDamageNumber(charmander.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), amount, "#ff6666");
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
    charmander.dmgMul = 1 + (state.level - 1) * 0.13;
    AudioSys.levelUp();
    announce(`CHARMANDER grew to Lv ${state.level}!`);
    burst(charmander.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 30, color: 0x7ee0ff, speed: 6, size: 0.8, life: 0.9 });

    if (state.level >= 5 && !state.evolved) {
      state.evolved = true;
      charmander.group.scale.setScalar(1.3);
      charmander.dmgMul += 0.35;
      // deepen the body color for the evolution aura
      charmander.group.traverse(o => {
        if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xff8c2e) {
          o.material = o.material.clone();
          o.material.color.set(0xe85f2a);
        }
      });
      HUD.pkmnName.textContent = "CHARMANDER ⚡EVOLVED AURA";
      announce("⚡ BLAZE AWAKENED! Charmander surges with power!", 3000);
      burst(charmander.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), { count: 50, color: 0xff3300, speed: 10, size: 1.2, life: 1.1 });
      state.shake = 0.5;
    }
  }
}

// ----------------------------------------------------------------------------
// Waves
// ----------------------------------------------------------------------------
function startWave() {
  state.wave++;
  state.spawnQueue = 2 + state.wave;
  state.spawnTimer = 0.5;
  AudioSys.waveStart();
  announce(`WAVE ${state.wave} — Wild Pokémon appeared!`);
}

function updateWaves(dt) {
  if (state.spawnQueue > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = rand(0.7, 1.4);
      state.spawnQueue--;
      spawnEnemy();
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
  burst(charmander.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 40, color: 0xff4444, speed: 9, size: 1, life: 1 });
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
  // camera-relative movement
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

  // walk cycle
  const sw = Math.sin(ash.walkPhase) * (ash.speed > 0 ? 0.55 : 0.18);
  const { arms, legs } = ash.group.userData.parts;
  arms[0].rotation.x = sw;
  arms[1].rotation.x = -sw;
  legs[0].rotation.x = -sw;
  legs[1].rotation.x = sw;
  ash.group.position.y += Math.abs(Math.sin(ash.walkPhase)) * 0.06 * (ash.speed > 0 ? 1 : 0);
}

function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

function updateCharmander(dt) {
  // follow a spot beside-and-behind Ash unless attacking
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
  // face the target while one is locked
  if (target && !target.dead) {
    const to = target.pos.clone().sub(charmander.pos);
    charmander.yaw = lerpAngle(charmander.yaw, Math.atan2(to.x, to.z), 1 - Math.pow(0.001, dt));
  }

  charmander.pos.y = terrainHeight(charmander.pos.x, charmander.pos.z);
  charmander.group.position.copy(charmander.pos);
  // idle bob + attack lunge
  charmander.lunge = Math.max(0, charmander.lunge - dt);
  const bob = Math.sin(state.time * 4) * 0.04;
  charmander.group.position.y += bob + charmander.lunge * 0.5;
  charmander.group.rotation.y = charmander.yaw;

  // animate tail flame flicker
  const layers = charmander.group.userData.flameLayers;
  for (let i = 0; i < layers.length; i++) {
    const f = 1 + Math.sin(state.time * (14 + i * 5) + i * 2) * 0.22;
    layers[i].scale.set(f, 1 + Math.sin(state.time * 11 + i) * 0.3, f);
  }
  // a hotter, larger flame when low HP (Blaze!)
  const blaze = charmander.hp / charmander.maxHp < 0.3 ? 1.6 : 1;
  charmander.group.userData.flame.scale.setScalar(blaze);

  // flamethrower stream
  if (charmander.flameActive > 0) {
    charmander.flameActive -= dt;
    if (target && !target.dead) charmander.flameDir.copy(aimDirAt(target.pos, charmanderMouth()));
    const mouth = charmanderMouth();
    for (let j = 0; j < 4; j++) {
      const spread = new THREE.Vector3(rand(-0.12, 0.12), rand(-0.06, 0.1), rand(-0.12, 0.12));
      spawnParticle({
        pos: mouth, color: [0xff4400, 0xff8800, 0xffcc44][j % 3],
        size: rand(0.5, 1.0), endSize: 1.8, life: rand(0.4, 0.7),
        vel: charmander.flameDir.clone().add(spread).normalize().multiplyScalar(rand(13, 19)),
        drag: 1.2,
      });
    }
    // cone damage tick
    for (const e of enemies) {
      if (e.dead) continue;
      const to = e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(charmanderMouth());
      const d = to.length();
      if (d < 15 && to.normalize().dot(charmander.flameDir) > 0.92) {
        damageEnemyTick(e, 38 * charmander.dmgMul * dt);
      }
    }
  }
}

// throttled damage numbers for damage-over-time effects
const dotAccum = new Map();
function damageEnemyTick(e, amount) {
  if (e.dead) return;
  e.hp -= amount;
  const acc = (dotAccum.get(e) || 0) + amount;
  if (acc >= 10) {
    spawnDamageNumber(e.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), acc);
    dotAccum.set(e, 0);
  } else {
    dotAccum.set(e, acc);
  }
  if (e.hp <= 0 && !e.dead) {
    e.hp = 1;
    damageEnemy(e, 2); // route the kill through the normal path
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
    e.slow = 0.3; // keep them trapped
    fs.light.position.copy(e.pos).add(new THREE.Vector3(0, 1, 0));
    fs.light.intensity = 6 + Math.sin(state.time * 20) * 2;
    // spiral of flames
    for (let j = 0; j < 3; j++) {
      const a = state.time * 7 + (j / 3) * TAU;
      const r = 1.6;
      spawnParticle({
        pos: e.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2 + ((state.time * 2 + j) % 1.6), Math.sin(a) * r)),
        color: j === 0 ? 0xffcc44 : 0xff6611,
        size: rand(0.5, 0.9), endSize: 0.1, life: 0.45,
        vel: new THREE.Vector3(-Math.sin(a) * 3, 1.5, Math.cos(a) * 3),
      });
    }
    damageEnemyTick(e, 11 * charmander.dmgMul * dt);
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
    camera.position.x += rand(-1, 1) * state.shake * 0.3;
    camera.position.y += rand(-1, 1) * state.shake * 0.3;
  }
  camera.lookAt(lookTarget);
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
  const alive = enemies.filter(e => !e.dead).length + state.spawnQueue;
  HUD.enemiesLeft.textContent = alive > 0 ? `${alive} wild remaining` : "area clear";

  if (target && !target.dead) {
    HUD.targetPanel.style.display = "block";
    HUD.targetName.textContent = `WILD ${target.spec.name}`;
    const f = clamp(target.hp / target.maxHp, 0, 1);
    HUD.targetHpFill.style.width = `${f * 100}%`;
    HUD.targetHpLabel.textContent = `${Math.ceil(target.hp)} / ${Math.round(target.maxHp)}`;
    targetRing.visible = true;
    targetRing.position.copy(target.pos).add(new THREE.Vector3(0, 0.12, 0));
    targetRing.rotation.z = state.time * 1.5;
    targetRing.scale.setScalar(1 + Math.sin(state.time * 5) * 0.07);
  } else {
    HUD.targetPanel.style.display = "none";
    targetRing.visible = false;
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
// Main loop
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  // ambient scenery motion runs even on the title screen
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 240) cloud.position.x = -240;
  }

  if (state.running && !state.over) {
    for (const m of MOVES) m.timer = Math.max(0, m.timer - dt);
    if (!target || target.dead) target = pickTarget();
    updateAsh(dt);
    updateCharmander(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateFireSpins(dt);
    updateWaves(dt);
    updateHud();
  } else if (!state.running) {
    // title screen: slow cinematic orbit
    cam.yaw += dt * 0.12;
    updateCharmander(dt);
    updateAsh(dt);
  }

  updateParticles(dt);
  updateDamageNumbers(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
tick();
