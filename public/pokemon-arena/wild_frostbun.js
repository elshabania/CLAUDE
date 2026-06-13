import * as THREE from "three";

// ---------------------------------------------------------------------------
// FROSTBUN — an original adorable ICE-type catchable Pokemon.
// A fluffy white-and-pale-blue rabbit with long ears, a snowflake forehead
// mark, and frosty crystal whiskers. Cartoon / cel-shaded look with thin
// inverted-hull black outlines. Origin at feet (y=0), +z forward, ~1.0 tall.
// ---------------------------------------------------------------------------

// ---- shared palette --------------------------------------------------------
const COL_BODY = 0xf4fbff; // near-white frosty fur
const COL_BLUE = 0xbfe6ff; // pale ice blue accents
const COL_DEEP = 0x8fd4ff; // deeper ice blue
const COL_ICE = 0xaaf0ff; // glowing crystal
const COL_PINK = 0xffc4d6; // inner ear / nose blush
const COL_DARK = 0x223844; // eyes / outline

// ---- toon gradient ramp (cel shading) -------------------------------------
function makeToonRamp() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const ctx = c.getContext("2d");
  const steps = ["#404a52", "#8a96a0", "#cdd6dd", "#ffffff"];
  for (let i = 0; i < steps.length; i++) {
    ctx.fillStyle = steps[i];
    ctx.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// ---- canvas fur texture ----------------------------------------------------
function makeFurTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  // soft frosty base gradient
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.6, "#eaf6ff");
  g.addColorStop(1, "#d6eeff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // fine fur strokes
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 3 + Math.random() * 7;
    const a = -1.3 + Math.random() * 0.5;
    ctx.strokeStyle = Math.random() > 0.5
      ? "rgba(255,255,255,0.55)"
      : "rgba(160,210,240,0.35)";
    ctx.lineWidth = 0.8 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // a few sparkle dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const r = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---- snowflake forehead mark texture --------------------------------------
function makeSnowflakeTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.translate(64, 64);
  ctx.strokeStyle = "#7fd2ff";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.shadowColor = "#aaf0ff";
  ctx.shadowBlur = 8;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -46);
    // branches
    ctx.moveTo(0, -22); ctx.lineTo(-12, -32);
    ctx.moveTo(0, -22); ctx.lineTo(12, -32);
    ctx.moveTo(0, -36); ctx.lineTo(-9, -44);
    ctx.moveTo(0, -36); ctx.lineTo(9, -44);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ---------------------------------------------------------------------------
export function buildFrostbun() {
  const ramp = makeToonRamp();
  const fur = makeFurTexture();
  const flake = makeSnowflakeTexture();

  // material factory: cel-shaded toon material (fresh per call)
  const toon = (color, opts = {}) => {
    const m = new THREE.MeshToonMaterial({
      color,
      gradientMap: ramp,
      ...opts,
    });
    return m;
  };

  // glossy frosty body uses standard for low roughness gloss + fur map
  const frosty = (color, map = null) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.0,
    map,
  });

  // translucent glowing ice crystal
  const crystal = (color = COL_ICE) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.15,
    metalness: 0.0,
    transparent: true,
    opacity: 0.7,
    emissive: new THREE.Color(color),
    emissiveIntensity: 1.2,
  });

  const outlineMat = new THREE.MeshBasicMaterial({
    color: COL_DARK,
    side: THREE.BackSide,
  });

  const root = new THREE.Group();
  root.name = "FROSTBUN";

  // helper: add a mesh with shadow + optional inverted-hull outline
  const meshes = [];
  function addMesh(geo, mat, parent, { outline = 0, noShadow = false } = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !noShadow;
    mesh.receiveShadow = false;
    if (noShadow) mesh.userData.noShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    if (outline > 0) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.multiplyScalar(1 + outline);
      o.userData.noShadow = true;
      o.castShadow = false;
      mesh.add(o);
      meshes.push(o);
    }
    return mesh;
  }

  // ---- BODY (egg-shaped fluffy torso) -------------------------------------
  const bodyGeo = new THREE.SphereGeometry(0.34, 20, 18);
  const body = addMesh(bodyGeo, frosty(COL_BODY, fur), root, { outline: 0.05 });
  body.position.y = 0.42;
  body.scale.set(1.0, 1.15, 0.95);

  // belly patch (pale blue)
  const belly = addMesh(new THREE.SphereGeometry(0.26, 16, 14),
    frosty(COL_BLUE), root, {});
  belly.position.set(0, 0.40, 0.16);
  belly.scale.set(0.85, 1.0, 0.55);

  // ---- HEAD ---------------------------------------------------------------
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.78, 0.04);
  root.add(head);
  root.userData.head = head;

  const headGeo = new THREE.SphereGeometry(0.30, 22, 20);
  const headMesh = addMesh(headGeo, frosty(COL_BODY, fur), head, { outline: 0.05 });
  headMesh.scale.set(1.05, 1.0, 1.0);

  // cheek puffs
  for (const sx of [-1, 1]) {
    const cheek = addMesh(new THREE.SphereGeometry(0.10, 12, 10),
      frosty(COL_BODY), head, {});
    cheek.position.set(sx * 0.20, -0.05, 0.18);
    cheek.scale.set(1, 0.85, 0.8);
  }

  // ---- SNOWFLAKE FOREHEAD MARK -------------------------------------------
  const markMat = new THREE.MeshBasicMaterial({
    map: flake, transparent: true, depthWrite: false,
  });
  const mark = addMesh(new THREE.PlaneGeometry(0.26, 0.26), markMat, head,
    { noShadow: true });
  mark.position.set(0, 0.12, 0.285);
  mark.rotation.x = -0.15;

  // ---- EYES (big cute) ----------------------------------------------------
  const eyeWhiteMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp });
  const eyeDarkMat = toon(COL_DARK);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const ew = addMesh(new THREE.SphereGeometry(0.085, 14, 12), eyeWhiteMat, head, {});
    ew.position.set(sx * 0.135, 0.02, 0.255);
    ew.scale.set(0.9, 1.15, 0.7);
    const ed = addMesh(new THREE.SphereGeometry(0.058, 14, 12), eyeDarkMat, head, {});
    ed.position.set(sx * 0.135, 0.01, 0.31);
    ed.scale.set(0.95, 1.1, 0.7);
    const glint = addMesh(new THREE.SphereGeometry(0.022, 8, 8), glintMat, head,
      { noShadow: true });
    glint.position.set(sx * 0.115, 0.05, 0.345);
  }

  // ---- NOSE + MOUTH -------------------------------------------------------
  const nose = addMesh(new THREE.SphereGeometry(0.035, 10, 8), toon(COL_PINK), head, {});
  nose.position.set(0, -0.08, 0.30);
  nose.scale.set(1.3, 0.9, 0.8);

  // ---- LONG EARS ----------------------------------------------------------
  const earGeo = new THREE.CapsuleGeometry(0.055, 0.34, 4, 10);
  const earInnerGeo = new THREE.CapsuleGeometry(0.032, 0.28, 4, 8);
  for (const sx of [-1, 1]) {
    const earPivot = new THREE.Group();
    earPivot.position.set(sx * 0.12, 0.22, -0.02);
    earPivot.rotation.z = sx * 0.28;
    earPivot.rotation.x = -0.12;
    head.add(earPivot);
    const ear = addMesh(earGeo, frosty(COL_BODY, fur), earPivot, { outline: 0.06 });
    ear.position.y = 0.22;
    const inner = addMesh(earInnerGeo, toon(COL_PINK), earPivot, {});
    inner.position.set(0, 0.22, 0.035);
    inner.scale.set(1, 0.92, 0.5);
    // frosty blue tip
    const tip = addMesh(new THREE.SphereGeometry(0.06, 10, 8), frosty(COL_DEEP), earPivot, {});
    tip.position.y = 0.40;
    tip.scale.set(1, 0.8, 1);
  }

  // ---- CRYSTAL WHISKERS (glowing ice) ------------------------------------
  const whiskerGeo = new THREE.CylinderGeometry(0.004, 0.012, 0.22, 5);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const w = addMesh(whiskerGeo, crystal(COL_ICE), head, { noShadow: true });
      w.position.set(sx * 0.16, -0.05 - i * 0.04, 0.24);
      w.rotation.z = Math.PI / 2 + sx * (0.1 + i * 0.15);
      w.rotation.y = sx * 0.5;
    }
  }

  // ---- ICE CRYSTAL ACCENTS on back ---------------------------------------
  const shardGeo = new THREE.ConeGeometry(0.05, 0.18, 5);
  const shards = [
    { x: 0, y: 0.56, z: -0.28, rx: -0.5, s: 1.0 },
    { x: -0.13, y: 0.50, z: -0.25, rx: -0.6, rz: 0.4, s: 0.8 },
    { x: 0.13, y: 0.50, z: -0.25, rx: -0.6, rz: -0.4, s: 0.8 },
  ];
  for (const s of shards) {
    const shard = addMesh(shardGeo, crystal(COL_DEEP), root, { noShadow: true });
    shard.position.set(s.x, s.y, s.z);
    shard.rotation.x = s.rx || 0;
    shard.rotation.z = s.rz || 0;
    shard.scale.setScalar(s.s);
  }

  // ---- FRONT PAWS ---------------------------------------------------------
  const pawGeo = new THREE.SphereGeometry(0.075, 10, 8);
  for (const sx of [-1, 1]) {
    const paw = addMesh(pawGeo, frosty(COL_BODY), root, { outline: 0.06 });
    paw.position.set(sx * 0.16, 0.18, 0.20);
    paw.scale.set(0.9, 1.1, 1.1);
  }

  // ---- BIG HIND FEET ------------------------------------------------------
  const footGeo = new THREE.SphereGeometry(0.11, 12, 10);
  for (const sx of [-1, 1]) {
    const foot = addMesh(footGeo, frosty(COL_BODY), root, { outline: 0.05 });
    foot.position.set(sx * 0.17, 0.08, 0.06);
    foot.scale.set(0.85, 0.55, 1.5);
    // pale blue toe pad
    const pad = addMesh(new THREE.SphereGeometry(0.045, 8, 8), toon(COL_BLUE), root, {});
    pad.position.set(sx * 0.17, 0.06, 0.20);
    pad.scale.set(0.9, 0.5, 0.7);
  }

  // ---- FLUFFY TAIL --------------------------------------------------------
  const tail = addMesh(new THREE.SphereGeometry(0.13, 12, 10),
    frosty(COL_BODY), root, { outline: 0.06 });
  tail.position.set(0, 0.40, -0.30);
  tail.scale.set(1.0, 1.0, 0.9);

  // ---- finalize -----------------------------------------------------------
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) o.castShadow = true;
  });

  // sanity: keep mesh budget visible (<=70)
  root.userData.meshCount = meshes.length;

  return root;
}

// ---------------------------------------------------------------------------
export const FROSTBUN = {
  name: "FROSTBUN",
  type: "ice",
  hp: 44,
  speed: 4.2,
  damage: 8,
  range: 19,
  attackCd: 2.1,
  score: 120,
  xp: 30,
  flying: false,
  catchRate: 0.95,
  projectile: { color: 0xaaf0ff, speed: 22, size: 0.15 },
  dex: "Hops across frozen lakes; exhales tiny snowflakes when it dozes.",
  build: buildFrostbun,
};
