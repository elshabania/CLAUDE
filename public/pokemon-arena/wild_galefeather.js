// wild_galefeather.js — ORIGINAL Flying-type catchable Pokémon "GALEFEATHER"
// Three.js r160. Canvas textures only, no top-level await. Self-contained.
// Cartoon look: cel-shaded toon-ramp materials + thin inverted-hull outlines.
import * as THREE from "three";

// ---- toon ramp (shared, cheap) -------------------------------------------
function toonRamp() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const x = c.getContext("2d");
  const stops = ["#3a3a3a", "#777777", "#bcbcbc", "#ffffff"];
  for (let i = 0; i < 4; i++) { x.fillStyle = stops[i]; x.fillRect(i, 0, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  return t;
}

// ---- layered feather texture ---------------------------------------------
function featherTex(base, edge, dark) {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d");
  x.fillStyle = base; x.fillRect(0, 0, s, s);
  // layered overlapping scallops (feather rows)
  for (let row = 0; row < 6; row++) {
    const y = row * 22 + 14;
    const off = (row % 2) * 14;
    x.fillStyle = row % 2 ? dark : edge;
    for (let fx = -14; fx < s + 14; fx += 28) {
      x.beginPath();
      x.arc(fx + off, y, 16, 0, Math.PI, false);
      x.fill();
    }
    // thin shaft highlights
    x.strokeStyle = "rgba(255,255,255,0.45)";
    x.lineWidth = 1.5;
    for (let fx = -14; fx < s + 14; fx += 28) {
      x.beginPath();
      x.moveTo(fx + off, y);
      x.lineTo(fx + off, y - 14);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function toonMat(color, ramp, map) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  if (map) m.map = map;
  return m;
}

// thin inverted-hull outline mesh
function outline(geo, scale) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x10222a, side: THREE.BackSide })
  );
  m.scale.setScalar(scale);
  m.userData.noShadow = true;
  m.castShadow = false; m.receiveShadow = false;
  return m;
}

// helper: mesh + outline added together, returns the main mesh
function shaded(geo, mat, group, outlineScale = 1.06) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  group.add(outline(geo, outlineScale));
  return mesh;
}

export function buildGalefeather() {
  const ramp = toonRamp();
  const TEAL = 0x2fbfb3, LTEAL = 0x6fe0d4, WHITE = 0xf2fdfb, DARK = 0x176b6b;
  const bodyTex = featherTex("#2fbfb3", "#6fe0d4", "#176b6b");
  const wingTex = featherTex("#3fd0c2", "#eafffb", "#1c8e86");

  const matBody = toonMat(TEAL, ramp, bodyTex);
  const matWing = toonMat(LTEAL, ramp, wingTex);
  const matWhite = toonMat(WHITE, ramp);
  const matBeak = toonMat(0xffcf5a, ramp);
  const matDark = toonMat(DARK, ramp);

  const root = new THREE.Group();
  root.name = "GALEFEATHER";

  // ---- BODY (origin at body center) --------------------------------------
  const body = shaded(new THREE.SphereGeometry(0.55, 16, 12), matBody, root, 1.05);
  body.scale.set(1, 1.05, 1.35);

  // white chest patch
  const chest = shaded(new THREE.SphereGeometry(0.4, 14, 10), matWhite, root, 1.06);
  chest.scale.set(0.9, 0.9, 1.0);
  chest.position.set(0, -0.12, 0.42);

  // ---- HEAD --------------------------------------------------------------
  const head = new THREE.Group();
  head.position.set(0, 0.45, 0.55);
  root.add(head);
  root.userData.head = head;

  const skull = shaded(new THREE.SphereGeometry(0.34, 14, 12), matBody, head, 1.06);
  // face/cheeks white
  const face = shaded(new THREE.SphereGeometry(0.27, 12, 10), matWhite, head, 1.07);
  face.scale.set(1, 0.85, 0.9);
  face.position.set(0, -0.04, 0.16);

  // beak (forked falcon hook)
  const beak = shaded(new THREE.ConeGeometry(0.14, 0.34, 10), matBeak, head, 1.08);
  beak.rotation.x = Math.PI / 2 + 0.35;
  beak.position.set(0, -0.06, 0.34);
  const beakTip = shaded(new THREE.ConeGeometry(0.06, 0.14, 8), matBeak, head, 1.1);
  beakTip.rotation.x = Math.PI / 2 + 0.9;
  beakTip.position.set(0, -0.14, 0.42);

  // emissive cyan eyes (~2)
  const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMat = () => new THREE.MeshStandardMaterial({
    color: 0x9ff5ff, emissive: 0x2fe8ff, emissiveIntensity: 2.0
  });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat());
    e.castShadow = false;
    e.position.set(0.13 * sx, 0.02, 0.26);
    head.add(e);
  }

  // crest — three swept feathers off the top of the head
  for (let i = 0; i < 3; i++) {
    const cf = shaded(new THREE.ConeGeometry(0.05, 0.34 - i * 0.04, 6), matWing, head, 1.1);
    cf.position.set((i - 1) * 0.07, 0.28, -0.04);
    cf.rotation.set(-0.9, 0, (i - 1) * 0.25);
  }

  // ---- WINGS (flappable pivots at wing root) -----------------------------
  // Each wing is a Group pivoted at the root. +rotation.z raises the +x wingtip.
  function buildWing(sign) {
    const wing = new THREE.Group();
    // root sits at shoulder; pivot here so rotation.z swings tip up/down
    wing.position.set(0.45 * sign, 0.12, 0.05);
    wing.userData.sign = sign;

    // long swept primary plane (flat box), feathered canvas tex
    const span = shaded(new THREE.BoxGeometry(1.05, 0.06, 0.5), matWing, wing, 1.04);
    // place outward along +x*sign, swept slightly back
    span.position.set(0.55 * sign, 0, -0.04);
    span.rotation.z = sign * -0.12;
    span.rotation.y = sign * 0.28;

    // inner covert (upper arm)
    const cov = shaded(new THREE.BoxGeometry(0.5, 0.06, 0.4), matBody, wing, 1.05);
    cov.position.set(0.22 * sign, 0.02, 0.02);
    cov.rotation.y = sign * 0.18;

    // three trailing primary feathers (swept tip)
    for (let i = 0; i < 3; i++) {
      const pf = shaded(new THREE.ConeGeometry(0.07, 0.55 - i * 0.06, 6), matWhite, wing, 1.06);
      pf.position.set((1.0 - i * 0.18) * sign, -0.01, -0.18 - i * 0.05);
      pf.rotation.z = sign * Math.PI / 2;
      pf.rotation.y = sign * (0.5 + i * 0.12);
    }
    return wing;
  }
  const wingR = buildWing(+1);
  const wingL = buildWing(-1);
  root.add(wingR, wingL);
  root.userData.flapWings = [wingR, wingL];

  // ---- FORKED TAIL -------------------------------------------------------
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, -0.02, -0.6);
  root.add(tailRoot);
  for (const sx of [-1, 1]) {
    const fork = shaded(new THREE.ConeGeometry(0.1, 0.7, 6), matWing, tailRoot, 1.05);
    fork.rotation.x = -Math.PI / 2 - 0.25;
    fork.rotation.z = sx * 0.28;
    fork.position.set(0.12 * sx, 0.02, -0.3);
  }
  // central short tail feather
  const tailMid = shaded(new THREE.ConeGeometry(0.08, 0.45, 6), matBody, tailRoot, 1.06);
  tailMid.rotation.x = -Math.PI / 2 - 0.1;
  tailMid.position.set(0, 0, -0.22);

  // ---- LEGS / TALONS -----------------------------------------------------
  for (const sx of [-1, 1]) {
    const leg = shaded(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6), matBeak, root, 1.08);
    leg.position.set(0.15 * sx, -0.5, 0.18);
    const talon = shaded(new THREE.SphereGeometry(0.08, 8, 6), matDark, root, 1.1);
    talon.position.set(0.15 * sx, -0.64, 0.22);
  }

  // shadow flags
  root.traverse((o) => {
    if (o.isMesh && o.userData.noShadow) o.castShadow = false;
  });

  root.userData.flying = true;
  return root;
}

export const GALEFEATHER = {
  name: "GALEFEATHER", type: "flying", hp: 42, speed: 9, damage: 9, range: 28,
  attackCd: 2.0, score: 140, xp: 38, flying: true, catchRate: 0.85,
  projectile: { color: 0xbfeaff, speed: 26, size: 0.15 },
  dex: "Rides thermals for days; a single beat of its wings stirs a gale.",
  build: buildGalefeather
};
