import * as THREE from "three";

// ---------- canvas texture helpers ----------
function makeFurTexture(base, light, dark) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  // soft mottled fur fibers
  for (let i = 0; i < 900; i++) {
    const px = Math.random() * 128;
    const py = Math.random() * 128;
    const len = 3 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    x.strokeStyle = Math.random() > 0.5 ? light : dark;
    x.globalAlpha = 0.18 + Math.random() * 0.22;
    x.lineWidth = 0.8 + Math.random() * 0.7;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeFlameTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 40, 4, 32, 40, 32);
  g.addColorStop(0, "#fff6c0");
  g.addColorStop(0.4, "#ffcc33");
  g.addColorStop(0.75, "#ff7722");
  g.addColorStop(1, "#cc3300");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 3-step toon ramp
function makeToonGradient() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const x = c.getContext("2d");
  const cols = ["#7a4a2a", "#b87038", "#e8a050", "#ffd9a0"];
  for (let i = 0; i < 4; i++) { x.fillStyle = cols[i]; x.fillRect(i, 0, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------- material helpers ----------
function toonMat(color, map, gradient) {
  return new THREE.MeshToonMaterial({ color, map: map || null, gradientMap: gradient });
}

function outlineMat() {
  return new THREE.MeshBasicMaterial({ color: 0x120800, side: THREE.BackSide });
}

// add a thin inverted-hull outline twin of a mesh
function addOutline(mesh, group, scale = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat());
  o.position.copy(mesh.position);
  o.rotation.copy(mesh.rotation);
  o.scale.copy(mesh.scale).multiplyScalar(scale);
  o.userData.noShadow = true;
  o.castShadow = false;
  o.receiveShadow = false;
  group.add(o);
  return o;
}

export function buildEmberpup() {
  const root = new THREE.Group();
  root.name = "EMBERPUP";

  const grad = makeToonGradient();
  const furTex = makeFurTexture("#e8842f", "#ffb066", "#a85318");
  const creamTex = makeFurTexture("#fff0d6", "#fffaf0", "#e8cba0");
  const flameTex = makeFlameTexture();

  const orange = toonMat(0xe8842f, furTex, grad);
  const cream = toonMat(0xfff0d6, creamTex, grad);
  const dark = toonMat(0x4a2a14, null, grad);
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeDark = new THREE.MeshBasicMaterial({ color: 0x1a1208 });
  const eyeShine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff8822, map: flameTex, emissive: 0xff5500,
  });
  // MeshBasic has no emissive; use a standard for the glow tuft instead
  const flameGlow = new THREE.MeshStandardMaterial({
    color: 0xffcc33, map: flameTex,
    emissive: 0xff5a14, emissiveIntensity: 1.6,
    roughness: 0.5, metalness: 0,
  });

  const body = new THREE.Group();
  body.position.y = 0.0;
  root.add(body);

  // ---- legs ----
  const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.26, 10);
  const legPos = [[-0.13, 0.13, 0.12], [0.13, 0.13, 0.12], [-0.13, 0.13, -0.14], [0.13, 0.13, -0.14]];
  for (const p of legPos) {
    const leg = new THREE.Mesh(legGeo, orange);
    leg.position.set(p[0], p[1], p[2]);
    leg.castShadow = true;
    body.add(leg);
    addOutline(leg, body, 1.12);
    // cream paw
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), cream);
    paw.position.set(p[0], 0.04, p[2]);
    paw.scale.y = 0.7;
    paw.castShadow = true;
    body.add(paw);
    addOutline(paw, body, 1.1);
  }

  // ---- torso ----
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 16), orange);
  torso.position.set(0, 0.42, -0.02);
  torso.scale.set(1.0, 0.92, 1.25);
  torso.castShadow = true;
  body.add(torso);
  addOutline(torso, body, 1.05);

  // cream chest patch
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), cream);
  chest.position.set(0, 0.38, 0.2);
  chest.scale.set(0.85, 0.95, 0.6);
  chest.castShadow = true;
  body.add(chest);

  // ---- head group ----
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.22);
  body.add(head);
  root.userData.head = head;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), orange);
  skull.scale.set(1.05, 1.0, 1.0);
  skull.castShadow = true;
  head.add(skull);
  addOutline(skull, head, 1.05);

  // muzzle / snout (cream)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), cream);
  snout.position.set(0, -0.04, 0.21);
  snout.scale.set(1.0, 0.8, 0.9);
  snout.castShadow = true;
  head.add(snout);
  addOutline(snout, head, 1.07);

  // nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeDark);
  nose.position.set(0, 0.0, 0.32);
  head.add(nose);

  // ---- big eyes ----
  for (const sx of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), eyeWhite);
    ew.position.set(sx * 0.1, 0.04, 0.19);
    ew.scale.set(0.85, 1.05, 0.7);
    head.add(ew);
    const ep = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), eyeDark);
    ep.position.set(sx * 0.11, 0.03, 0.24);
    head.add(ep);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeShine);
    sh.position.set(sx * 0.13, 0.06, 0.27);
    head.add(sh);
  }

  // ---- floppy ears ----
  const earGeo = new THREE.ConeGeometry(0.09, 0.22, 10);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, orange);
    ear.position.set(sx * 0.18, 0.18, -0.02);
    ear.rotation.z = sx * 0.5;
    ear.rotation.x = -0.3;
    ear.castShadow = true;
    head.add(ear);
    addOutline(ear, head, 1.1);
    const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), cream);
    earIn.position.set(sx * 0.18, 0.17, 0.0);
    earIn.rotation.z = sx * 0.5;
    earIn.rotation.x = -0.3;
    head.add(earIn);
  }

  // ---- forehead flame tuft (small glowing emissive) ----
  const foreTuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 10), flameGlow);
  foreTuft.position.set(0, 0.26, 0.06);
  foreTuft.castShadow = false;
  head.add(foreTuft);
  const foreLight = new THREE.PointLight(0xff7722, 0.6, 1.2);
  foreLight.position.set(0, 0.3, 0.1);
  foreLight.userData.noShadow = true;
  head.add(foreLight);

  // ---- tail with flame tuft ----
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.28);
  body.add(tail);
  const tailBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 10), orange);
  tailBase.position.set(0, 0.05, -0.05);
  tailBase.rotation.x = -0.7;
  tailBase.castShadow = true;
  tail.add(tailBase);
  addOutline(tailBase, tail, 1.12);

  // big glowing flame
  const flameMain = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 12), flameGlow);
  flameMain.position.set(0, 0.28, -0.12);
  tail.add(flameMain);
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  flameInner.position.set(0, 0.26, -0.12);
  tail.add(flameInner);
  const tailLight = new THREE.PointLight(0xff6611, 1.0, 2.0);
  tailLight.position.set(0, 0.3, -0.12);
  tailLight.userData.noShadow = true;
  tail.add(tailLight);

  // keep flameMat referenced (avoid unused warnings) by tagging userData
  root.userData.flameMat = flameMat;

  root.scale.setScalar(1.0);
  root.traverse((o) => {
    if (o.isMesh && o.userData.noShadow !== true && o.castShadow === undefined) {
      o.castShadow = true;
    }
  });

  return root;
}

export const EMBERPUP = {
  name: "EMBERPUP",
  type: "fire",
  hp: 44,
  speed: 4.0,
  damage: 8,
  range: 17,
  attackCd: 2.1,
  score: 95,
  xp: 25,
  flying: false,
  catchRate: 1.0,
  projectile: { color: 0xff7722, speed: 20, size: 0.16 },
  dex: "An eager pup whose tail flame flares brighter the braver it feels.",
  build: buildEmberpup,
};
