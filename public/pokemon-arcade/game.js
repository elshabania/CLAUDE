import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================================
//  Charmander Arena — a 3D Pokémon-style arcade battle.
//  You are Ash; you command Charmander against a wild challenger in real time.
// ============================================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// ----------------------------------------------------------------------------
//  Renderer / scene / camera
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
// Cap resolution on phones so bloom + PBR stay at a smooth frame rate.
const _coarse = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, _coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x14233f, 0.011);

// Image-based lighting: soft procedural environment so every PBR surface
// picks up real reflections and ambient bounce (huge readability win).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 7, 12);

// Post-processing: bloom makes every flame, ember and energy attack glow.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.6, 0.72);
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
//  Lighting — warm key + cool fill + the glow from Charmander's tail
// ----------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x35506b, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(18, 30, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
const s = 34;
sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
sun.shadow.bias = -0.0004;
scene.add(sun);

const rim = new THREE.DirectionalLight(0x5577ff, 0.6);
rim.position.set(-20, 14, -16);
scene.add(rim);

// ----------------------------------------------------------------------------
//  Sky dome (gradient)
// ----------------------------------------------------------------------------
{
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
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
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ----------------------------------------------------------------------------
//  Arena
// ----------------------------------------------------------------------------
const ARENA_R = 26;

// Procedural surface texture: tinted value-noise with a matching bump map so
// ground and sand read as real grainy surfaces under the lighting.
function makeGroundTexture(base, speck, scale = 4) {
  const N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, N, N);
  const b = new THREE.Color(base), sp = new THREE.Color(speck);
  const img = x.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 0.5 + (Math.random() < 0.04 ? (Math.random() - 0.5) : 0);
    const col = b.clone().lerp(sp, clamp(0.5 + n, 0, 1));
    d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale, scale);
  // bump from the same grain
  const bc = document.createElement('canvas'); bc.width = bc.height = N;
  const bx = bc.getContext('2d');
  const bimg = bx.createImageData(N, N), bd = bimg.data;
  for (let i = 0; i < bd.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 110; bd[i] = bd[i + 1] = bd[i + 2] = v; bd[i + 3] = 255; }
  bx.putImageData(bimg, 0, 0);
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(scale, scale);
  return { tex, bump };
}

function buildArena() {
  const g = new THREE.Group();

  // Ground — grassy field
  const grassTex = makeGroundTexture('#46632f', '#5c8a3a', 14);
  const groundMat = new THREE.MeshStandardMaterial({ map: grassTex.tex, bumpMap: grassTex.bump, bumpScale: 0.6, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 30, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // Sandy battle ring
  const sandTex = makeGroundTexture('#c9a36a', '#a07c44', 8);
  const ringMat = new THREE.MeshStandardMaterial({ map: sandTex.tex, bumpMap: sandTex.bump, bumpScale: 0.5, roughness: 1 });
  const ring = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  ring.receiveShadow = true;
  g.add(ring);

  // Painted border line
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: .8 });
  const line = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.6, ARENA_R, 64), lineMat);
  line.rotation.x = -Math.PI / 2; line.position.y = 0.03;
  g.add(line);
  const mid = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 48), lineMat);
  mid.rotation.x = -Math.PI / 2; mid.position.y = 0.03;
  g.add(mid);

  // Scattered rocks & boulders for depth
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: .95, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(ARENA_R + 3, ARENA_R + 26);
    const sz = rand(0.6, 3.2);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), rockMat);
    rock.position.set(Math.cos(a) * r, sz * 0.4, Math.sin(a) * r);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }

  // Distant tree-like cones (forest silhouette)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a32, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(ARENA_R + 18, ARENA_R + 70);
    const h = rand(5, 12);
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, h * 0.4, 6), trunkMat);
    trunk.position.y = h * 0.2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(h * 0.4, h * 0.8, 7), leafMat);
    leaf.position.y = h * 0.6;
    t.add(trunk, leaf);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    t.castShadow = true;
    g.add(t);
  }

  // Grass blade instances inside the ring edge for texture
  const bladeGeo = new THREE.ConeGeometry(0.12, 0.8, 4);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x5c8a3a, roughness: 1 });
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, 600);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 600; i++) {
    const a = rand(0, Math.PI * 2), r = rand(ARENA_R + 1, ARENA_R + 24);
    dummy.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
    dummy.rotation.y = rand(0, 3.14);
    dummy.scale.setScalar(rand(0.6, 1.5));
    dummy.updateMatrix();
    blades.setMatrixAt(i, dummy.matrix);
  }
  blades.receiveShadow = true;
  g.add(blades);

  return g;
}
scene.add(buildArena());

// ----------------------------------------------------------------------------
//  Material helpers
// ----------------------------------------------------------------------------
const M = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, envMapIntensity: 0.9, ...opt });

// Lively creature "skin": physically-based with a subtle clearcoat sheen so
// it catches highlights and reads as a real material, not flat plastic.
const skin = (color, opt = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.42, metalness: 0.0,
  clearcoat: 0.6, clearcoatRoughness: 0.5,
  sheen: 0.4, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5),
  envMapIntensity: 1.0, ...opt,
});

function eyeMesh(r = 0.16) {
  const grp = new THREE.Group();
  // Glossy wet eyeball
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 24),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 }));
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 18, 18),
    new THREE.MeshPhysicalMaterial({ color: 0x5a3416, roughness: 0.15, clearcoat: 1, envMapIntensity: 1.2 }));
  iris.position.z = r * 0.5; iris.scale.z = 0.5;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 14, 14), M(0x0a0a0a, { roughness: .1 }));
  pupil.position.z = r * 0.78; pupil.scale.z = 0.5;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 8), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2 }));
  shine.position.set(r * 0.28, r * 0.3, r * 0.72); shine.userData.keepEmissive = true;
  const shine2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 8), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.5 }));
  shine2.position.set(-r * 0.2, -r * 0.1, r * 0.78); shine2.userData.keepEmissive = true;
  grp.add(white, iris, pupil, shine, shine2);
  return grp;
}

// ----------------------------------------------------------------------------
//  CHARMANDER  (the player's Pokémon)
// ----------------------------------------------------------------------------
function buildCharmander() {
  const g = new THREE.Group();
  const orange = skin(0xf57e1f, { clearcoat: 0.7 });
  const cream = skin(0xffe2a8);

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 24), orange);
  body.scale.set(0.85, 1.05, 0.8);
  body.position.y = 1.25;
  body.castShadow = true;
  g.add(body);

  // Belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 20), cream);
  belly.scale.set(0.7, 0.95, 0.55);
  belly.position.set(0, 1.15, 0.45);
  g.add(belly);

  // Head
  const head = new THREE.Group();
  head.position.y = 2.35;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 24), orange);
  skull.scale.set(1, 0.92, 1.02);
  skull.castShadow = true;
  head.add(skull);
  // Snout
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 18), orange);
  snout.scale.set(0.9, 0.7, 1.1);
  snout.position.set(0, -0.12, 0.55);
  head.add(snout);
  // Eyes
  const eL = eyeMesh(0.16), eR = eyeMesh(0.16);
  eL.position.set(-0.28, 0.12, 0.55); eR.position.set(0.28, 0.12, 0.55);
  head.add(eL, eR);
  // Nostrils hint
  const nostril = M(0x9c5410);
  const nL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), nostril);
  const nR = nL.clone(); nL.position.set(-0.1, -0.18, 0.95); nR.position.set(0.1, -0.18, 0.95);
  head.add(nL, nR);
  g.add(head);

  // Arms
  function arm(side) {
    const a = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 12), orange);
    upper.castShadow = true;
    a.add(upper);
    const claws = new THREE.Group(); claws.position.y = -0.45;
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), cream);
      c.position.set(i * 0.1, -0.1, 0.08); c.rotation.x = 0.5;
      claws.add(c);
    }
    a.add(claws);
    a.position.set(side * 0.78, 1.35, 0.1);
    a.rotation.z = side * 0.5;
    return a;
  }
  const armL = arm(-1), armR = arm(1);
  g.add(armL, armR);

  // Legs
  function leg(side) {
    const l = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.4, 6, 12), orange);
    thigh.castShadow = true;
    l.add(thigh);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), cream);
    foot.scale.set(1, 0.5, 1.3); foot.position.set(0, -0.45, 0.18);
    l.add(foot);
    // toe claws
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), cream);
      c.position.set(i * 0.12, -0.5, 0.46); c.rotation.x = 1.0;
      l.add(c);
    }
    l.position.set(side * 0.34, 0.55, 0.05);
    return l;
  }
  const legL = leg(-1), legR = leg(1);
  g.add(legL, legR);

  // Tail + flame
  const tail = new THREE.Group();
  const tailCurve = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.2, 12, 24, Math.PI * 1.1),
    orange
  );
  tailCurve.position.set(0, 1.0, -0.7);
  tailCurve.rotation.set(Math.PI * 0.5, 0, 0);
  tailCurve.castShadow = true;
  tail.add(tailCurve);

  const flameAnchor = new THREE.Group();
  flameAnchor.position.set(0, 1.7, -1.1);
  tail.add(flameAnchor);
  g.add(tail);

  // The signature tail flame (sprite + light)
  const flameLight = new THREE.PointLight(0xff7b2a, 6, 12, 2);
  flameLight.position.copy(flameAnchor.position);
  g.add(flameLight);
  const flameSprite = makeGlowSprite(0xffc24a, 1.4);
  flameSprite.position.copy(flameAnchor.position);
  g.add(flameSprite);

  g.userData = { head, armL, armR, legL, legR, tail, flameLight, flameSprite, flameAnchor, body, type: 'charmander' };
  g.scale.setScalar(1.15);
  return g;
}

// ----------------------------------------------------------------------------
//  SQUIRTLE  (the wild opponent)
// ----------------------------------------------------------------------------
function buildSquirtle() {
  const g = new THREE.Group();
  const blue = skin(0x5fb8e6, { clearcoat: 0.7 });
  const cream = skin(0xf6e6c4);
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xb5742f, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.25, envMapIntensity: 1.2 });
  const shellRim = skin(0xf2e7c0, { clearcoat: 0.8 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 24), blue);
  body.scale.set(0.9, 1.0, 0.85); body.position.y = 1.2; body.castShadow = true;
  g.add(body);

  // Shell back
  const shellBack = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), shell);
  shellBack.scale.set(1.05, 1.0, 1.0); shellBack.position.set(0, 1.2, -0.18); shellBack.castShadow = true;
  g.add(shellBack);
  const shellTrim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 28), shellRim);
  shellTrim.rotation.x = Math.PI / 2; shellTrim.position.set(0, 1.05, -0.1);
  g.add(shellTrim);
  // Belly plate
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 20), cream);
  belly.scale.set(0.75, 0.9, 0.5); belly.position.set(0, 1.1, 0.5);
  g.add(belly);

  // Head
  const head = new THREE.Group(); head.position.y = 2.25;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 24), blue);
  skull.castShadow = true; head.add(skull);
  const eL = eyeMesh(0.15), eR = eyeMesh(0.15);
  eL.position.set(-0.26, 0.1, 0.55); eR.position.set(0.26, 0.1, 0.55);
  head.add(eL, eR);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16, Math.PI), M(0x7a3b1c));
  mouth.position.set(0, -0.22, 0.62); mouth.rotation.x = Math.PI;
  head.add(mouth);
  g.add(head);

  function limb(x, y, z, sx) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 6, 12), blue);
    a.position.set(x, y, z); a.castShadow = true; a.scale.x = sx || 1;
    return a;
  }
  const armL = limb(-0.85, 1.3, 0.2), armR = limb(0.85, 1.3, 0.2);
  const legL = limb(-0.4, 0.5, 0.1), legR = limb(0.4, 0.5, 0.1);
  g.add(armL, armR, legL, legR);

  // Curly tail
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 10, 20, Math.PI * 1.4), cream);
  tail.position.set(0, 0.9, -0.85); tail.rotation.x = Math.PI / 2;
  g.add(tail);

  g.userData = { head, armL, armR, legL, legR, type: 'squirtle' };
  g.scale.setScalar(1.15);
  return g;
}

// ----------------------------------------------------------------------------
//  ASH  (the trainer — stands behind, cheers, throws stance)
// ----------------------------------------------------------------------------
function buildAsh() {
  const g = new THREE.Group();
  const skin = M(0xf2c39b, { roughness: .7 });
  const jacket = M(0x2b6cb0, { roughness: .7 });
  const white = M(0xf4f4f4, { roughness: .7 });
  const jeans = M(0x39507a, { roughness: .8 });
  const capRed = M(0xd23b3b, { roughness: .6 });
  const capWhite = M(0xf4f4f4, { roughness: .5 });

  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5, 6, 12), jeans);
  hips.position.y = 1.0; hips.castShadow = true; g.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.65, 6, 12), jacket);
  torso.position.y = 1.75; torso.castShadow = true; g.add(torso);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16), white);
  collar.position.y = 1.45; g.add(collar);

  // Arms
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.6, 6, 10), jacket);
  armL.position.set(-0.55, 1.75, 0); armL.rotation.z = 0.3; armL.castShadow = true;
  const armR = armL.clone(); armR.position.x = 0.55; armR.rotation.z = -0.3;
  g.add(armL, armR);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skin); handL.position.set(-0.75, 1.35, 0);
  const handR = handL.clone(); handR.position.x = 0.75;
  g.add(handL, handR);

  // Legs
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 6, 10), jeans);
  legL.position.set(-0.2, 0.5, 0); legL.castShadow = true;
  const legR = legL.clone(); legR.position.x = 0.2;
  g.add(legL, legR);

  // Head
  const head = new THREE.Group(); head.position.y = 2.45;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 20), skin);
  face.castShadow = true; head.add(face);
  const eL = eyeMesh(0.07), eR = eyeMesh(0.07);
  eL.position.set(-0.13, 0.04, 0.3); eR.position.set(0.13, 0.04, 0.3);
  head.add(eL, eR);
  // Cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2), capRed);
  cap.position.y = 0.12; head.add(cap);
  const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.1, 18), capWhite);
  capBand.position.y = 0.12; head.add(capBand);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.05, 18, 1, false, 0, Math.PI), capRed);
  brim.position.set(0, 0.1, 0.28); head.add(brim);
  // Hair tufts
  const hair = M(0x1d1d22);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), hair);
    t.position.set(rand(-0.3, 0.3), -0.05, -0.28); t.rotation.x = -2.4;
    head.add(t);
  }
  g.add(head);

  g.userData = { head, armL, armR, handL, handR, legL, legR };
  g.scale.setScalar(1.0);
  return g;
}

// ----------------------------------------------------------------------------
//  Glow sprite helper (cheap bloom substitute for flames / projectiles)
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
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.setScalar(size);
  return sp;
}

// ----------------------------------------------------------------------------
//  Particle system — shared pool of additive sprites for all FX
// ----------------------------------------------------------------------------
class Particles {
  constructor(max = 700) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.scl = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('pscale', new THREE.BufferAttribute(this.scl, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: glowTex } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true,
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
    this.list = [];
    this.max = max;
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
      const pr = this.list[i];
      pr.life -= dt;
      if (pr.life <= 0) { this.list.splice(i, 1); continue; }
    }
    for (const pr of this.list) {
      pr.v.y -= pr.grav * dt;
      pr.p.addScaledVector(pr.v, dt);
      const t = pr.life / pr.max;
      const idx = n * 3;
      this.pos[idx] = pr.p.x; this.pos[idx + 1] = pr.p.y; this.pos[idx + 2] = pr.p.z;
      this.col[idx] = pr.c.r * t; this.col[idx + 1] = pr.c.g * t; this.col[idx + 2] = pr.c.b * t;
      this.scl[n] = pr.size * (0.4 + t * 0.8);
      n++;
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
  water: new THREE.Color(0x4cc9f0),
  waterPale: new THREE.Color(0xcdf3ff),
  spark: new THREE.Color(0xffffff),
  smoke: new THREE.Color(0x555555),
};

// ----------------------------------------------------------------------------
//  Spawn fighters
// ----------------------------------------------------------------------------
const charmander = buildCharmander();
const squirtle = buildSquirtle();
const ash = buildAsh();
scene.add(charmander, squirtle, ash);

// ----------------------------------------------------------------------------
//  Cinematic dressing: glowing sun disc, soft contact shadows, ambient embers
// ----------------------------------------------------------------------------
// Sun disc high in the sky — bloom turns it into a real flare.
const sunDisc = makeGlowSprite(0xffe6b0, 26);
sunDisc.position.set(60, 70, -40);
scene.add(sunDisc);
const sunCore = makeGlowSprite(0xffffff, 10);
sunCore.position.copy(sunDisc.position);
scene.add(sunCore);

// Soft round contact shadows that follow each fighter (grounding + polish).
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
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04;
  scene.add(m); return m;
}
const blobChar = makeBlob(3.4), blobSqui = makeBlob(3.4), blobAsh = makeBlob(2.6);

// Drifting ambient embers/dust for atmosphere (separate slow particle field).
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
dust.frustumCulled = false;
scene.add(dust);
function updateDust(dt) {
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3 + 1] += (0.25 + Math.sin(GAME.time * 0.6 + dustPhase[i]) * 0.15) * dt;
    dustPos[i * 3] += Math.sin(GAME.time * 0.4 + dustPhase[i]) * 0.06 * dt * 10;
    if (dustPos[i * 3 + 1] > 10) dustPos[i * 3 + 1] = 0.4;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ----------------------------------------------------------------------------
//  Game state
// ----------------------------------------------------------------------------
const GAME = {
  state: 'loading', // loading | title | battle | result
  player: { hp: 100, maxHp: 100, flame: 100, maxFlame: 100, pos: new THREE.Vector3(0, 0, 7), vel: new THREE.Vector3(), facing: Math.PI, dodge: 0, hitFlash: 0, attackAnim: 0, attackType: null },
  enemy: { hp: 100, maxHp: 100, pos: new THREE.Vector3(0, 0, -7), facing: 0, ai: 0, attackAnim: 0, hitFlash: 0, telegraph: 0, attackType: null },
  projectiles: [],
  beams: [], // active flamethrower / watergun cones
  cooldowns: { J: 0, K: 0, L: 0 },
  time: 0,
  shake: 0,
};

const MOVES = {
  J: { name: 'SCRATCH', cd: 0.45, range: 3.2, dmg: 9 },
  K: { name: 'EMBER', cd: 0.9, dmg: 14 },
  L: { name: 'FLAMETHROWER', cd: 0.05, dmg: 22 /*per second*/, cost: 38 /*per second*/ },
};

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

// Touch joystick
const touch = { active: false, dx: 0, dy: 0, id: null };
const stick = $('stick'), nub = $('stickNub');
function stickStart(e) {
  touch.active = true; touch.id = e.changedTouches ? e.changedTouches[0].identifier : 'mouse';
  stickMove(e);
}
function stickMove(e) {
  if (!touch.active) return;
  const rect = stick.getBoundingClientRect();
  const pt = e.changedTouches ? [...e.changedTouches].find(t => t.identifier === touch.id) : e;
  if (!pt) return;
  let dx = pt.clientX - (rect.left + rect.width / 2);
  let dy = pt.clientY - (rect.top + rect.height / 2);
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
  b.addEventListener('touchstart', (e) => { e.preventDefault(); if (act === 'dodge') keys['space'] = true; else keys[act.toLowerCase()] = true; }, { passive: false });
  b.addEventListener('touchend', (e) => { e.preventDefault(); if (act === 'dodge') keys['space'] = false; else keys[act.toLowerCase()] = false; });
});

// ----------------------------------------------------------------------------
//  HUD helpers
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
  const a = $('announce');
  a.textContent = text; a.style.color = color; a.classList.add('show');
  announceTimer = 1.1;
}

// ----------------------------------------------------------------------------
//  Combat actions
// ----------------------------------------------------------------------------
function tailFlamePos() {
  return GAME.player.pos.clone().add(new THREE.Vector3(Math.sin(GAME.player.facing) * -0.6, 2.0, Math.cos(GAME.player.facing) * -0.6));
}
function muzzlePos(ent, height = 2.0, fwd = 1.0) {
  return ent.pos.clone().add(new THREE.Vector3(Math.sin(ent.facing) * fwd, height, Math.cos(ent.facing) * fwd));
}

function doScratch() {
  const m = MOVES.J;
  GAME.cooldowns.J = m.cd;
  GAME.player.attackAnim = 0.3; GAME.player.attackType = 'scratch';
  const dist = GAME.player.pos.distanceTo(GAME.enemy.pos);
  // face enemy check
  const toE = Math.atan2(GAME.enemy.pos.x - GAME.player.pos.x, GAME.enemy.pos.z - GAME.player.pos.z);
  const facingDiff = Math.abs(angleDiff(GAME.player.facing, toE));
  if (dist < m.range && facingDiff < 1.1 && GAME.enemy.hp > 0) {
    damageEnemy(m.dmg + rand(-1, 2));
    const hp = muzzlePos(GAME.enemy, 1.4, 0);
    FX.burst(hp, COL.spark, 18, 7, 0.3, 1.0, 6);
    FX.burst(hp, COL.fire, 10, 5, 0.4, 1.2, 2);
    GAME.shake = Math.max(GAME.shake, 0.25);
  } else {
    // whiff swipe sparks
    FX.burst(muzzlePos(GAME.player, 1.6, 1.4), COL.fire, 6, 4, 0.25, 0.8, 3);
  }
}

function doEmber() {
  const m = MOVES.K;
  GAME.cooldowns.K = m.cd;
  GAME.player.attackAnim = 0.35; GAME.player.attackType = 'cast';
  const start = tailFlamePos();
  const target = muzzlePos(GAME.enemy, 1.3, 0);
  const dir = target.clone().sub(start).normalize();
  const speed = 16;
  GAME.projectiles.push({
    side: 'player', p: start, v: dir.multiplyScalar(speed).add(new THREE.Vector3(0, 3, 0)),
    grav: 9, life: 2.5, dmg: m.dmg, color: COL.emberHot, radius: 0.7, type: 'ember',
  });
}

let flameSound = 0;
function doFlamethrower(dt) {
  if (GAME.player.flame < 6) return false;
  const m = MOVES.L;
  GAME.player.flame = Math.max(0, GAME.player.flame - m.cost * dt);
  GAME.player.attackAnim = 0.12; GAME.player.attackType = 'breathe';
  const origin = muzzlePos(GAME.player, 2.05, 0.9);
  const dir = new THREE.Vector3(Math.sin(GAME.player.facing), 0.04, Math.cos(GAME.player.facing));
  // emit fire particles in a cone
  for (let i = 0; i < 4; i++) {
    const spread = new THREE.Vector3(rand(-.25, .25), rand(-.18, .25), rand(-.25, .25));
    const v = dir.clone().add(spread).normalize().multiplyScalar(rand(11, 16));
    const hot = Math.random() < 0.5;
    FX.spawn(origin.clone().add(spread.multiplyScalar(0.3)), v, hot ? COL.emberHot : COL.fire, rand(0.3, 0.55), rand(1.4, 2.4), -2);
  }
  // smoke tail
  if (Math.random() < 0.4) FX.spawn(origin, dir.clone().multiplyScalar(3).add(new THREE.Vector3(0, 1, 0)), COL.smoke, 0.7, 2.5, -1);

  // cone hit test against enemy
  const toE = GAME.enemy.pos.clone().sub(GAME.player.pos);
  const horiz = new THREE.Vector3(toE.x, 0, toE.z);
  const dist = horiz.length();
  const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const dot = horiz.clone().normalize().dot(flat);
  if (dist < 8.5 && dot > 0.82 && GAME.enemy.hp > 0) {
    damageEnemy(m.dmg * dt);
    if (Math.random() < 0.5) FX.burst(muzzlePos(GAME.enemy, 1.4, 0), COL.fire, 4, 4, 0.3, 1.4, 1);
    GAME.shake = Math.max(GAME.shake, 0.08);
  }
  return true;
}

function damageEnemy(amount) {
  if (GAME.enemy.hp <= 0) return;
  GAME.enemy.hp = Math.max(0, GAME.enemy.hp - amount);
  GAME.enemy.hitFlash = 0.12;
  if (GAME.enemy.hp <= 0) endBattle(true);
}
function damagePlayer(amount) {
  if (GAME.player.dodge > 0.05) return; // i-frames during dodge
  if (GAME.player.hp <= 0) return;
  GAME.player.hp = Math.max(0, GAME.player.hp - amount);
  GAME.player.hitFlash = 0.14;
  GAME.shake = Math.max(GAME.shake, 0.3);
  if (GAME.player.hp <= 0) endBattle(false);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ----------------------------------------------------------------------------
//  Enemy AI — Squirtle: approaches, fires Water Gun bursts & Tackle
// ----------------------------------------------------------------------------
function updateEnemyAI(dt) {
  const e = GAME.enemy, p = GAME.player;
  if (e.hp <= 0) return;
  const toP = p.pos.clone().sub(e.pos); toP.y = 0;
  const dist = toP.length();
  e.facing = Math.atan2(toP.x, toP.z);

  e.ai -= dt;
  e.telegraph = Math.max(0, e.telegraph - dt);

  // Movement: keep mid-range, strafe a bit
  let move = new THREE.Vector3();
  const ideal = 7;
  if (dist > ideal + 1) move.copy(toP).normalize();
  else if (dist < ideal - 1) move.copy(toP).normalize().multiplyScalar(-1);
  // strafe
  const strafe = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.sin(GAME.time * 0.8) * 0.6);
  move.add(strafe);
  const speed = 4.2;
  e.pos.addScaledVector(move.normalize(), speed * dt);
  // keep in ring
  const r = Math.hypot(e.pos.x, e.pos.z);
  if (r > ARENA_R - 1.5) { e.pos.x *= (ARENA_R - 1.5) / r; e.pos.z *= (ARENA_R - 1.5) / r; }

  // Decide attack
  if (e.ai <= 0 && e.telegraph <= 0 && e.attackAnim <= 0) {
    if (dist < 3.4 && Math.random() < 0.5) {
      // Tackle
      e.telegraph = 0.45; e.attackType = 'tackle'; e.ai = rand(1.4, 2.4);
    } else {
      // Water gun
      e.telegraph = 0.4; e.attackType = 'watergun'; e.ai = rand(1.1, 2.0);
    }
  }
  // Telegraph visual
  if (e.telegraph > 0) {
    if (e.attackType === 'watergun' && Math.random() < 0.5)
      FX.spawn(muzzlePos(e, 2.0, 0.8), new THREE.Vector3(0, rand(.5, 1.2), 0), COL.water, 0.3, 1.2, -1);
  }
  // When telegraph crosses from >0 to <=0, execute the wind-up attack once
  if (e._lastTele > 0 && e.telegraph <= 0) {
    if (e.attackType === 'watergun') enemyWaterGun();
    else if (e.attackType === 'tackle') enemyTackle();
  }
  e._lastTele = e.telegraph;
}

function enemyWaterGun() {
  const e = GAME.enemy;
  e.attackAnim = 0.4;
  const start = muzzlePos(e, 2.0, 0.9);
  const dir = GAME.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(start).normalize();
  for (let i = 0; i < 3; i++) {
    GAME.projectiles.push({
      side: 'enemy', p: start.clone(), v: dir.clone().multiplyScalar(15).add(new THREE.Vector3(rand(-1, 1), rand(-.5, .5), rand(-1, 1))),
      grav: 2, life: 1.6, dmg: 8, color: COL.water, radius: 0.7, type: 'water',
    });
  }
  FX.burst(start, COL.waterPale, 10, 4, 0.4, 1.0, 1);
}
function enemyTackle() {
  const e = GAME.enemy, p = GAME.player;
  e.attackAnim = 0.45;
  const dir = p.pos.clone().sub(e.pos); dir.y = 0; dir.normalize();
  e.pos.addScaledVector(dir, 2.4); // lunge
  if (e.pos.distanceTo(p.pos) < 2.6) {
    damagePlayer(13);
    FX.burst(muzzlePos(p, 1.4, 0), COL.spark, 14, 6, 0.3, 1.0, 5);
  }
}

// ----------------------------------------------------------------------------
//  Projectiles
// ----------------------------------------------------------------------------
function updateProjectiles(dt) {
  for (let i = GAME.projectiles.length - 1; i >= 0; i--) {
    const pr = GAME.projectiles[i];
    pr.v.y -= pr.grav * dt;
    pr.p.addScaledVector(pr.v, dt);
    pr.life -= dt;

    // trail
    const tcol = pr.type === 'ember' ? (Math.random() < .5 ? COL.emberHot : COL.emberDeep)
      : pr.type === 'water' ? COL.water : COL.fire;
    FX.spawn(pr.p.clone(), new THREE.Vector3(rand(-.5, .5), rand(-.2, .5), rand(-.5, .5)), tcol, rand(.2, .4), pr.type === 'water' ? 1.6 : 2.0, 0.5);

    let hit = false;
    if (pr.side === 'player') {
      if (GAME.enemy.hp > 0 && pr.p.distanceTo(muzzlePos(GAME.enemy, 1.3, 0)) < pr.radius + 1.0) {
        damageEnemy(pr.dmg + rand(-1, 2));
        FX.burst(pr.p, COL.fire, 22, 7, 0.5, 2.0, 2);
        FX.burst(pr.p, COL.emberHot, 12, 5, 0.4, 1.4, 1);
        GAME.shake = Math.max(GAME.shake, 0.2);
        hit = true;
      }
    } else {
      if (GAME.player.hp > 0 && pr.p.distanceTo(muzzlePos(GAME.player, 1.3, 0)) < pr.radius + 1.0) {
        damagePlayer(pr.dmg + rand(-1, 1));
        FX.burst(pr.p, COL.water, 18, 6, 0.45, 1.6, 2);
        hit = true;
      }
    }
    // ground splash
    if (pr.p.y < 0.2) {
      FX.burst(new THREE.Vector3(pr.p.x, 0.15, pr.p.z), pr.type === 'water' ? COL.water : COL.fire, 12, 4, 0.4, 1.2, 3);
      hit = true;
    }
    if (hit || pr.life <= 0) GAME.projectiles.splice(i, 1);
  }
}

// ----------------------------------------------------------------------------
//  Player update
// ----------------------------------------------------------------------------
function updatePlayer(dt) {
  const p = GAME.player;
  // input dir
  let ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup']) iz -= 1;
  if (keys['s'] || keys['arrowdown']) iz += 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (touch.active) { ix += touch.dx; iz += touch.dy; }

  const inMag = Math.hypot(ix, iz);
  const sprint = (keys['shift']) ? 1.6 : 1.0;
  const speed = 6.2 * sprint;

  // Dodge roll
  if (keys['space'] && p.dodge <= 0 && GAME.cooldowns.dodge <= 0 && inMag > 0.1) {
    p.dodge = 0.32; GAME.cooldowns.dodge = 0.7;
    p.dodgeDir = new THREE.Vector3(ix, 0, iz).normalize();
  }
  GAME.cooldowns.dodge = Math.max(0, (GAME.cooldowns.dodge || 0) - dt);

  if (p.dodge > 0) {
    p.dodge -= dt;
    p.pos.addScaledVector(p.dodgeDir, 13 * dt);
    FX.spawn(p.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, 1, 0), COL.fire, 0.25, 1.2, -1);
  } else if (inMag > 0.1) {
    const dir = new THREE.Vector3(ix, 0, iz).normalize();
    p.pos.addScaledVector(dir, speed * dt);
    p.facing = Math.atan2(dir.x, dir.z);
  }

  // keep in ring
  const r = Math.hypot(p.pos.x, p.pos.z);
  if (r > ARENA_R - 1.5) { p.pos.x *= (ARENA_R - 1.5) / r; p.pos.z *= (ARENA_R - 1.5) / r; }

  // Cooldowns
  GAME.cooldowns.J = Math.max(0, GAME.cooldowns.J - dt);
  GAME.cooldowns.K = Math.max(0, GAME.cooldowns.K - dt);
  GAME.cooldowns.L = Math.max(0, GAME.cooldowns.L - dt);

  // Attacks
  const wantFlame = keys['l'];
  if (keys['j'] && GAME.cooldowns.J <= 0) { faceEnemy(); doScratch(); }
  if (keys['k'] && GAME.cooldowns.K <= 0) { faceEnemy(); doEmber(); }
  if (wantFlame && GAME.cooldowns.L <= 0) {
    faceEnemy(0.3);
    const ok = doFlamethrower(dt);
    if (!ok && p.flame < 6) { /* out of flame */ }
  }

  // Flame meter regen (faster when not flaming)
  if (!wantFlame) p.flame = Math.min(p.maxFlame, p.flame + 26 * dt);
  else p.flame = Math.min(p.maxFlame, p.flame + 4 * dt);

  // timers
  p.attackAnim = Math.max(0, p.attackAnim - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
}

function faceEnemy(blend = 1.0) {
  const p = GAME.player;
  const toE = Math.atan2(GAME.enemy.pos.x - p.pos.x, GAME.enemy.pos.z - p.pos.z);
  p.facing = p.facing + angleDiff(toE, p.facing) * blend;
}

// ----------------------------------------------------------------------------
//  Visual sync + animation
// ----------------------------------------------------------------------------
function applyHitFlash(model, flash) {
  model.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive && !o.userData.keepEmissive) {
      if (flash > 0) { o.material.emissive.setHex(0xff3333); o.material.emissiveIntensity = flash * 6; }
      else if (o.material.emissiveIntensity > 0) { o.material.emissiveIntensity = 0; }
    }
  });
}

function animateChar(dt) {
  const p = GAME.player, ud = charmander.userData;
  charmander.position.set(p.pos.x, 0, p.pos.z);
  charmander.rotation.y = p.facing;

  const t = GAME.time;
  const moving = (p.vel.length() > 0.1) || keys['w'] || keys['a'] || keys['s'] || keys['d'] || touch.active;
  const bob = Math.sin(t * 9) * (moving ? 0.12 : 0.05);
  ud.body.position.y = 1.25 + bob;
  ud.head.position.y = 2.35 + bob * 0.7;
  // leg walk
  const swing = moving ? Math.sin(t * 9) * 0.5 : 0;
  ud.legL.rotation.x = swing; ud.legR.rotation.x = -swing;
  // idle arm sway
  ud.armL.rotation.x = Math.sin(t * 3) * 0.1;
  ud.armR.rotation.x = -Math.sin(t * 3) * 0.1;
  // tail sway
  ud.tail.rotation.y = Math.sin(t * 2.2) * 0.18;

  // Attack poses
  if (p.attackType === 'scratch' && p.attackAnim > 0) {
    const a = 1 - p.attackAnim / 0.3;
    ud.armR.rotation.x = -1.6 + Math.sin(a * Math.PI) * 2.4;
  } else if (p.attackType === 'breathe' && keys['l']) {
    ud.head.rotation.x = -0.25;
  } else if (p.attackType === 'cast' && p.attackAnim > 0) {
    ud.armL.rotation.x = -1.2; ud.armR.rotation.x = -1.2;
  } else {
    ud.head.rotation.x = lerp(ud.head.rotation.x, 0, 0.2);
  }

  // Tail flame anchor world pos
  const fp = tailFlamePos();
  ud.flameLight.position.copy(fp);
  ud.flameSprite.position.copy(fp);
  const flick = 1 + Math.sin(t * 22) * 0.12 + Math.sin(t * 9) * 0.06;
  const flameHealth = p.flame / p.maxFlame;
  ud.flameSprite.scale.setScalar((1.0 + flameHealth * 0.8) * flick);
  ud.flameLight.intensity = (3 + flameHealth * 5) * flick;
  ud.flameSprite.material.color.copy(flameHealth > 0.3 ? COL.emberHot : COL.emberDeep);
  // emit gentle flame particles
  if (Math.random() < 0.6) FX.spawn(fp.clone(), new THREE.Vector3(rand(-.3, .3), rand(1, 2), rand(-.3, .3)), flameHealth > 0.3 ? COL.fire : COL.emberDeep, rand(.3, .6), rand(.8, 1.6), -1.5);

  applyHitFlash(charmander, p.hitFlash);
}

function animateSquirtle(dt) {
  const e = GAME.enemy, ud = squirtle.userData;
  squirtle.position.set(e.pos.x, 0, e.pos.z);
  squirtle.rotation.y = e.facing;
  const t = GAME.time;
  const bob = Math.sin(t * 7 + 1) * 0.08;
  ud.head.position.y = 2.25 + bob;
  ud.legL.rotation.x = Math.sin(t * 7) * 0.4;
  ud.legR.rotation.x = -Math.sin(t * 7) * 0.4;
  // telegraph crouch
  if (e.telegraph > 0) { squirtle.scale.y = 1.15 * (1 - e.telegraph * 0.15); ud.head.rotation.x = -0.3; }
  else { squirtle.scale.y = lerp(squirtle.scale.y, 1.15, 0.2); ud.head.rotation.x = lerp(ud.head.rotation.x, 0, 0.2); }
  if (e.attackType === 'watergun' && e.attackAnim > 0) ud.head.rotation.x = -0.4;
  if (e.attackType === 'tackle' && e.attackAnim > 0) squirtle.rotation.x = Math.sin((1 - e.attackAnim / 0.45) * Math.PI) * 0.5;
  else squirtle.rotation.x = lerp(squirtle.rotation.x, 0, 0.2);
  e.attackAnim = Math.max(0, e.attackAnim - dt);
  e.hitFlash = Math.max(0, e.hitFlash - dt);

  // KO sink
  if (e.hp <= 0) { squirtle.rotation.z = lerp(squirtle.rotation.z, 1.4, 0.06); squirtle.position.y = lerp(squirtle.position.y, -0.3, 0.05); }
  applyHitFlash(squirtle, e.hitFlash);
}

function animateAsh(dt) {
  // Ash stands a few units behind Charmander's starting side
  const target = new THREE.Vector3(-6, 0, 11);
  ash.position.lerp(target, 0.04);
  ash.lookAt(GAME.enemy.pos.x, 2, GAME.enemy.pos.z);
  const t = GAME.time, ud = ash.userData;
  ud.armR.rotation.x = -0.4 + Math.sin(t * 4) * 0.3; // cheering arm
  ud.head.rotation.y = Math.sin(t * 1.5) * 0.2;
  if (GAME.player.attackType && GAME.player.attackAnim > 0.2) {
    // throw-forward pose on big moves
    ud.armR.rotation.x = -2.2;
  }
}

// ----------------------------------------------------------------------------
//  Camera — dynamic third-person framing both fighters
// ----------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = GAME.player.pos, e = GAME.enemy.pos;
  const mid = p.clone().add(e).multiplyScalar(0.5);
  const sep = p.distanceTo(e);
  // camera sits behind the player, looking toward enemy
  const behind = p.clone().sub(e).setY(0);
  if (behind.lengthSq() < 0.01) behind.set(0, 0, 1);
  behind.normalize();
  const desired = mid.clone()
    .add(behind.multiplyScalar(8 + sep * 0.35))
    .add(new THREE.Vector3(0, 6 + sep * 0.18, 0));
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camTarget.lerp(mid.clone().add(new THREE.Vector3(0, 1.6, 0)), 1 - Math.pow(0.001, dt));

  // shake
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
function startBattle() {
  GAME.state = 'battle';
  GAME.player.hp = GAME.player.maxHp; GAME.player.flame = GAME.player.maxFlame;
  GAME.player.pos.set(0, 0, 7); GAME.player.facing = Math.PI;
  GAME.enemy.hp = GAME.enemy.maxHp; GAME.enemy.pos.set(0, 0, -7); GAME.enemy.ai = 1.2;
  GAME.enemy._lastTele = 0; squirtle.rotation.set(0, 0, 0); squirtle.scale.setScalar(1.15);
  GAME.projectiles.length = 0;
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  announce('FIGHT!', '#ffd23f');
}

function endBattle(win) {
  if (GAME.state !== 'battle') return;
  GAME.state = 'result';
  setTimeout(() => {
    $('result').classList.remove('hidden');
    $('touch').classList.add('hidden');
    const title = $('resultTitle'), text = $('resultText');
    if (win) {
      title.textContent = 'VICTORY!'; title.className = 'win';
      text.textContent = 'The wild Squirtle fainted. Charmander gained EXP and Ash is fired up!';
      // celebratory burst
      for (let i = 0; i < 60; i++) FX.burst(muzzlePos(GAME.player, 2, 0), Math.random() < .5 ? COL.emberHot : COL.fire, 6, 9, 1.0, 2.2, 2);
    } else {
      title.textContent = 'DEFEAT'; title.className = 'lose';
      text.textContent = 'Charmander fainted! Ash recalls it — train up and challenge again.';
      charmander.rotation.z = 1.3;
    }
  }, win ? 700 : 500);
}

// ----------------------------------------------------------------------------
//  Main loop
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  GAME.time += dt;

  if (GAME.state === 'battle') {
    updatePlayer(dt);
    updateEnemyAI(dt);
    updateProjectiles(dt);
  }
  // animate always (so KO poses & title idle look alive)
  animateChar(dt);
  animateSquirtle(dt);
  animateAsh(dt);
  // contact shadows track the fighters
  blobChar.position.set(GAME.player.pos.x, 0.04, GAME.player.pos.z);
  blobSqui.position.set(GAME.enemy.pos.x, 0.04, GAME.enemy.pos.z);
  blobAsh.position.set(ash.position.x, 0.04, ash.position.z);
  FX.update(dt);
  updateDust(dt);
  updateCamera(dt);
  if (GAME.state === 'battle' || GAME.state === 'result') updateHUD(dt);

  composer.render();
  requestAnimationFrame(tick);
}

// ----------------------------------------------------------------------------
//  Boot
// ----------------------------------------------------------------------------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function boot() {
  window.__charBooted = true; // tells the startup watchdog we made it
  // place fighters at title positions
  GAME.player.pos.set(2, 0, 6); GAME.player.facing = Math.PI - 0.5;
  GAME.enemy.pos.set(-2, 0, -3); GAME.enemy.facing = 0.5;
  ash.position.set(-6, 0, 11);
  charmander.position.copy(GAME.player.pos);
  squirtle.position.copy(GAME.enemy.pos);

  // fake-loading then reveal title
  setTimeout(() => {
    $('loading').classList.add('hidden');
    $('title').classList.remove('hidden');
    GAME.state = 'title';
  }, 700);

  $('startBtn').addEventListener('click', startBattle);
  $('againBtn').addEventListener('click', startBattle);
  tick();
}
boot();
