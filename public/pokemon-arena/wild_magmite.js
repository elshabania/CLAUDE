import * as THREE from "three";

// ---------------------------------------------------------------------------
// MAGMITE — an original FIRE/ROCK-type molten-rock beetle/golem.
// Stocky craggy obsidian shell with glowing lava cracks, ember vents,
// and emissive eyes. Cartoon / cel-shaded toon look + inverted-hull outlines.
// ---------------------------------------------------------------------------

// ----- canvas texture helpers ----------------------------------------------

function makeRockTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  // dark obsidian base
  g.fillStyle = "#241c20";
  g.fillRect(0, 0, 256, 256);
  // mottled rock patches
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 4 + Math.random() * 22;
    const sh = 20 + Math.random() * 40;
    g.fillStyle = `rgba(${sh + 20},${sh},${sh + 5},${0.25 + Math.random() * 0.4})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // glowing lava cracks
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.strokeStyle = `rgba(255,${90 + Math.random() * 90 | 0},20,0.9)`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    const seg = 3 + (Math.random() * 4 | 0);
    for (let s = 0; s < seg; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBumpTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 2 + Math.random() * 14;
    const v = Math.random() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.1 + Math.random() * 0.3})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 3-step toon ramp gradient for cel shading
function makeToonRamp() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const g = c.getContext("2d");
  const steps = ["#3a3a3a", "#7a7a7a", "#bdbdbd", "#ffffff"];
  for (let i = 0; i < 4; i++) { g.fillStyle = steps[i]; g.fillRect(i, 0, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
}

// ----- material helpers ----------------------------------------------------

function toonMat(opts, ramp) {
  return new THREE.MeshToonMaterial(Object.assign({ gradientMap: ramp }, opts));
}

function outlineMat() {
  return new THREE.MeshBasicMaterial({ color: 0x080608, side: THREE.BackSide });
}

// jitter a geometry's verts for a craggy low-poly look
function jitter(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) + (Math.random() - 0.5) * amt,
      p.getY(i) + (Math.random() - 0.5) * amt,
      p.getZ(i) + (Math.random() - 0.5) * amt
    );
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ----- builder -------------------------------------------------------------

export function buildMagmite() {
  const group = new THREE.Group();

  const rockTex = makeRockTexture();
  const bumpTex = makeBumpTexture();
  const ramp = makeToonRamp();

  const shellMat = toonMat({
    map: rockTex,
    bumpMap: bumpTex,
    bumpScale: 0.08,
    color: 0x4a3a40,
    emissive: 0xff4410,
    emissiveIntensity: 2.2,
    emissiveMap: rockTex,
  }, ramp);

  const plainRock = toonMat({
    map: rockTex, bumpMap: bumpTex, bumpScale: 0.06, color: 0x3a2e32,
  }, ramp);

  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
  const ventMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });

  const meshes = []; // track for outlines

  function add(geo, mat, parent, x, y, z, sx, sy, sz, noShadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
    (parent || group).add(m);
    if (!noShadow) meshes.push(m);
    return m;
  }

  // ---- BODY (stocky shell) ----
  const body = add(jitter(new THREE.SphereGeometry(0.55, 10, 8), 0.07), shellMat, group, 0, 0.55, 0, 1.1, 0.95, 1.2);

  // ---- HEAD ----
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.42);
  group.add(head);
  const headMesh = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.34, 9, 7), 0.05), shellMat);
  headMesh.castShadow = true; headMesh.receiveShadow = true;
  head.add(headMesh);
  meshes.push(headMesh);

  // craggy obsidian crest plates on head
  for (let i = 0; i < 3; i++) {
    const cr = add(jitter(new THREE.ConeGeometry(0.1, 0.26, 5), 0.03), plainRock, head, (i - 1) * 0.16, 0.28, -0.02, 1, 1, 1);
    cr.rotation.x = -0.3;
    cr.rotation.z = (i - 1) * 0.2;
  }

  // glowing eyes
  add(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, head, -0.13, 0.04, 0.28, 1, 1, 1, true);
  add(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, head, 0.13, 0.04, 0.28, 1, 1, 1, true);
  // angry brow rocks
  add(jitter(new THREE.BoxGeometry(0.16, 0.06, 0.08), 0.02), plainRock, head, -0.13, 0.13, 0.28, 1, 1, 1).rotation.z = 0.35;
  add(jitter(new THREE.BoxGeometry(0.16, 0.06, 0.08), 0.02), plainRock, head, 0.13, 0.13, 0.28, 1, 1, 1).rotation.z = -0.35;

  // fierce mandibles
  const mL = add(jitter(new THREE.ConeGeometry(0.05, 0.22, 5), 0.02), plainRock, head, -0.12, -0.18, 0.3, 1, 1, 1);
  mL.rotation.set(1.6, 0, 0.4);
  const mR = add(jitter(new THREE.ConeGeometry(0.05, 0.22, 5), 0.02), plainRock, head, 0.12, -0.18, 0.3, 1, 1, 1);
  mR.rotation.set(1.6, 0, -0.4);

  // ---- craggy back/shell plates with glow ----
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const px = Math.cos(a) * 0.42, pz = Math.sin(a) * 0.5;
    const plate = add(jitter(new THREE.ConeGeometry(0.14, 0.3 + Math.random() * 0.15, 5), 0.04), shellMat, group, px, 0.75 + Math.random() * 0.1, pz, 1, 1, 1);
    plate.lookAt(px * 3, 1.6, pz * 3);
  }

  // ---- ember vents (glowing nubs) on shoulders/back ----
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    add(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 6), ventMat, group, Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.45, 1, 1, 1, true);
  }

  // ---- glowing lava-crack rings (thin emissive bands) ----
  for (let i = 0; i < 3; i++) {
    const ring = add(new THREE.TorusGeometry(0.46 - i * 0.05, 0.025, 6, 16), lavaMat, group, 0, 0.4 + i * 0.18, 0, 1, 0.6, 1.1, true);
    ring.rotation.x = Math.PI / 2;
  }

  // ---- six craggy legs ----
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 3; i++) {
      const lz = 0.3 - i * 0.3;
      const upper = add(jitter(new THREE.CylinderGeometry(0.07, 0.05, 0.3, 5), 0.02), plainRock, group, s * 0.5, 0.32, lz, 1, 1, 1);
      upper.rotation.z = s * 0.7;
      const foot = add(jitter(new THREE.ConeGeometry(0.08, 0.2, 5), 0.02), shellMat, group, s * 0.62, 0.08, lz, 1, 1, 1);
      foot.rotation.x = Math.PI;
    }
  }

  // ---- INVERTED-HULL OUTLINES (cartoon edges) ----
  const oMat = outlineMat();
  const snapshot = meshes.slice();
  for (const src of snapshot) {
    const o = new THREE.Mesh(src.geometry, oMat);
    o.position.copy(src.position);
    o.rotation.copy(src.rotation);
    o.scale.copy(src.scale).multiplyScalar(1.06);
    o.userData.noShadow = true;
    o.castShadow = false;
    o.receiveShadow = false;
    src.parent.add(o);
  }

  group.userData.head = head;
  group.userData.type = "MAGMITE";

  group.traverse((o) => { if (o.isMesh && !o.userData.noShadow && o.castShadow === undefined) o.castShadow = true; });

  return group;
}

export const MAGMITE = {
  name: "MAGMITE",
  type: "fire",
  hp: 60,
  speed: 2.8,
  damage: 10,
  range: 16,
  attackCd: 2.3,
  score: 135,
  xp: 35,
  flying: false,
  catchRate: 0.8,
  projectile: { color: 0xff5522, speed: 20, size: 0.18 },
  dex: "Its shell cools to obsidian by night and reglows molten by day.",
  build: buildMagmite,
};
