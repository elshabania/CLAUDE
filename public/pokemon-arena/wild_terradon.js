import * as THREE from "three";

// ---------- canvas texture helpers ----------
function makeColorTexture(base, spots, spotColor) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  if (spots) {
    g.fillStyle = spotColor;
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const r = 3 + Math.random() * 6;
      g.globalAlpha = 0.5 + Math.random() * 0.4;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeBumpTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const r = 1 + Math.random() * 4;
    const v = 90 + Math.floor(Math.random() * 120);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// cel-shaded toon ramp
let _gradTex = null;
function gradientMap() {
  if (_gradTex) return _gradTex;
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const g = c.getContext("2d");
  const steps = ["#5a5a5a", "#9a9a9a", "#cccccc", "#ffffff"];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = steps[i];
    g.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  _gradTex = t;
  return t;
}

function toonMat(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: gradientMap(),
  });
  if (opts.map) m.map = opts.map;
  if (opts.bumpMap) { m.bumpMap = opts.bumpMap; m.bumpScale = opts.bumpScale ?? 0.4; }
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  return m;
}

// thin inverted-hull outline
function addOutline(mesh, group, scale = 1.06) {
  const o = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide })
  );
  o.scale.setScalar(scale);
  o.position.copy(mesh.position);
  o.quaternion.copy(mesh.quaternion);
  o.userData.noShadow = true;
  group.add(o);
}

export function buildTerradon() {
  const root = new THREE.Group();
  root.name = "TERRADON";

  const bodyTex = makeColorTexture("#b5905c", true, "#8a6a3a");
  const bumpTex = makeBumpTexture();
  const plateTex = makeColorTexture("#7d7368", true, "#5c544c");
  const bellyTex = makeColorTexture("#e3cfa6", false);

  const bodyMat = toonMat("#b5905c", { map: bodyTex, bumpMap: bumpTex, bumpScale: 0.5 });
  const plateMat = toonMat("#7d7368", { map: plateTex, bumpMap: bumpTex, bumpScale: 0.6 });
  const bellyMat = toonMat("#e3cfa6", { map: bellyTex });
  const clawMat = toonMat("#4a4038");

  const mk = (geo, mat, x, y, z, outline = true, oScale = 1.06) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    root.add(m);
    if (outline) addOutline(m, root, oScale);
    return m;
  };

  // ----- legs (stubby) -----
  const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10);
  const footGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const legPos = [[-0.24, 0.2, 0.18], [0.24, 0.2, 0.18], [-0.26, 0.2, -0.2], [0.26, 0.2, -0.2]];
  for (const [x, y, z] of legPos) {
    mk(legGeo, bodyMat, x, y, z);
    const f = mk(footGeo, bodyMat, x, 0.07, z + 0.05);
    f.scale.set(1, 0.6, 1.2);
    // toe claws
    for (let i = -1; i <= 1; i++) {
      const claw = mk(new THREE.ConeGeometry(0.04, 0.12, 6), clawMat, x + i * 0.1, 0.05, z + 0.22, false);
      claw.rotation.x = Math.PI / 2.4;
    }
  }

  // ----- body (chunky) -----
  const body = mk(new THREE.SphereGeometry(0.5, 16, 14), bodyMat, 0, 0.62, 0);
  body.scale.set(1.05, 0.95, 1.25);
  // belly patch
  const belly = mk(new THREE.SphereGeometry(0.4, 14, 12), bellyMat, 0, 0.5, 0.18, false);
  belly.scale.set(0.9, 0.8, 0.7);

  // ----- back rocky plates -----
  const plateGeo = new THREE.ConeGeometry(0.22, 0.3, 5);
  const platePos = [[0, 0.95, 0.18], [0, 1.02, -0.05], [0, 0.98, -0.3]];
  let pi = 0;
  for (const [x, y, z] of platePos) {
    const p = mk(plateGeo, plateMat, x, y, z, true, 1.08);
    p.rotation.x = -0.15 + pi * 0.12;
    p.scale.set(1.1 - pi * 0.1, 1, 0.8);
    pi++;
  }
  // side shoulder plates
  for (const sx of [-1, 1]) {
    const sp = mk(new THREE.ConeGeometry(0.15, 0.22, 5), plateMat, sx * 0.4, 0.85, 0.05, true, 1.08);
    sp.rotation.z = sx * 0.6;
  }

  // ----- head group -----
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.42);
  root.add(head);
  root.userData.head = head;

  const hAdd = (geo, mat, x, y, z, outline = true, oScale = 1.06) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    head.add(m);
    if (outline) {
      const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide }));
      o.scale.setScalar(oScale);
      o.position.copy(m.position);
      o.quaternion.copy(m.quaternion);
      o.userData.noShadow = true;
      head.add(o);
    }
    return m;
  };

  const skull = hAdd(new THREE.SphereGeometry(0.38, 16, 14), bodyMat, 0, 0, 0);
  skull.scale.set(1.05, 0.95, 1.05);
  // snout
  const snout = hAdd(new THREE.BoxGeometry(0.42, 0.3, 0.34), bodyMat, 0, -0.08, 0.28);
  snout.geometry.translate(0, 0, 0); // keep
  // nostrils
  for (const nx of [-0.1, 0.1]) {
    hAdd(new THREE.SphereGeometry(0.035, 8, 6), clawMat, nx, -0.06, 0.45, false);
  }
  // small brow plate
  const brow = hAdd(new THREE.BoxGeometry(0.4, 0.12, 0.22), plateMat, 0, 0.18, 0.12);
  brow.rotation.x = -0.2;

  // friendly amber eyes (emissive-rimmed)
  const eyeWhiteMat = toonMat("#fff4d8");
  const pupilMat = toonMat("#241a10");
  const rimMat = toonMat("#ffb030", { emissive: "#ff8a00", emissiveIntensity: 0.9 });
  for (const ex of [-1, 1]) {
    const rim = hAdd(new THREE.SphereGeometry(0.135, 12, 10), rimMat, ex * 0.18, 0.05, 0.26, false);
    rim.scale.set(1, 1, 0.6);
    const w = hAdd(new THREE.SphereGeometry(0.1, 12, 10), eyeWhiteMat, ex * 0.18, 0.05, 0.3, false);
    w.scale.set(1, 1, 0.6);
    hAdd(new THREE.SphereGeometry(0.05, 10, 8), pupilMat, ex * 0.18, 0.05, 0.36, false);
  }

  // tiny horn nubs
  for (const hx of [-1, 1]) {
    const horn = hAdd(new THREE.ConeGeometry(0.07, 0.18, 6), plateMat, hx * 0.22, 0.32, -0.02, true, 1.08);
    horn.rotation.z = hx * 0.3;
  }

  // ----- tail with club -----
  const tail1 = mk(new THREE.CylinderGeometry(0.16, 0.22, 0.35, 10), bodyMat, 0, 0.55, -0.5);
  tail1.rotation.x = Math.PI / 2.2;
  const tail2 = mk(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 10), bodyMat, 0, 0.45, -0.75);
  tail2.rotation.x = Math.PI / 2.4;
  const club = mk(new THREE.SphereGeometry(0.26, 12, 10), plateMat, 0, 0.38, -0.98, true, 1.08);
  club.scale.set(1, 0.9, 1);
  // club spikes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sp = mk(new THREE.ConeGeometry(0.06, 0.14, 5), plateMat, Math.cos(a) * 0.22, 0.38 + Math.sin(a) * 0.18, -0.98, false);
    sp.rotation.z = -a + Math.PI / 2;
  }

  // ----- finalize -----
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // normalize height to ~1.4
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y;
  const s = 1.4 / h;
  root.scale.setScalar(s);
  // re-seat feet at y=0
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  return root;
}

export const TERRADON = {
  name: "TERRADON",
  type: "ground",
  hp: 66,
  speed: 2.6,
  damage: 10,
  range: 0,
  attackCd: 2.5,
  score: 130,
  xp: 34,
  flying: false,
  catchRate: 0.85,
  projectile: null,
  dex: "Headbutts boulders for fun; its back plates harden as it grows.",
  build: buildTerradon,
};
