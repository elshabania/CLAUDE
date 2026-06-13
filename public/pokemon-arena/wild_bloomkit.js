import * as THREE from "three";

// ---------------------------------------------------------------------------
// BLOOMKIT - an original charming GRASS/FAIRY-type fox kit.
// Pastel-green fur, flower-petal ears, a blossom collar, and a leafy plume tail.
// Self-contained Three.js r160 module. Canvas textures only, no top-level await.
// Cartoon look: cel-shaded toon-ramp materials + thin inverted-hull outlines.
//   buildBloomkit() -> THREE.Group, origin at feet (y=0), +z forward, ~1.0 tall.
// ---------------------------------------------------------------------------

// --- Toon ramp shader injection (cel shading via onBeforeCompile) -----------
function makeToon(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;",
      `vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
       float _lum = dot(totalDiffuse, vec3(0.299, 0.587, 0.114));
       float _band = _lum > 0.0 ? (floor(_lum * 3.0 + 0.5) / 3.0) / max(_lum, 0.0001) : 1.0;
       totalDiffuse *= mix(1.0, _band, 0.82);`
    );
  };
  mat.needsUpdate = true;
  return mat;
}

// --- Canvas texture helpers -------------------------------------------------
function canvasTex(draw, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Soft pastel-green fur with downy speckles.
function furTex() {
  return canvasTex((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#bff0a8");
    g.addColorStop(1, "#9fdd86");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = 1.5 + Math.random() * 4;
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(214,247,190,0.55)" : "rgba(140,205,120,0.45)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // faint fur streaks
    ctx.strokeStyle = "rgba(150,210,130,0.3)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 12, y + 6 + Math.random() * 8);
      ctx.stroke();
    }
  });
}

function furBump() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = 1 + Math.random() * 2.5;
      ctx.fillStyle = Math.random() > 0.5 ? "#a8a8a8" : "#585858";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Pink petal: soft radial gradient with delicate veins.
function petalTex() {
  return canvasTex((ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.5, s * 0.85, s * 0.05, s * 0.5, s * 0.4, s * 0.7);
    g.addColorStop(0, "#fff0f7");
    g.addColorStop(0.5, "#ffbfe0");
    g.addColorStop(1, "#ff8fd0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(225,120,180,0.45)";
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.9);
      ctx.quadraticCurveTo(s * (0.5 + i * 0.08), s * 0.5, s * (0.5 + i * 0.14), s * 0.18);
      ctx.stroke();
    }
  });
}

// Leafy plume: green with a bright central vein.
function leafTex() {
  return canvasTex((ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, "#5bbf42");
    g.addColorStop(1, "#8fe06a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(40,130,30,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 4);
    ctx.lineTo(s * 0.5, s - 4);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      const y = (s / 6) * i;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.2, y - 9);
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.8, y - 9);
      ctx.stroke();
    }
  }, 64);
}

// Big sparkly eye.
function eyeTex() {
  return canvasTex((ctx, s) => {
    const cx = s / 2, cy = s / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, s * 0.44);
    g.addColorStop(0, "#a6f08a");
    g.addColorStop(0.55, "#56c06b");
    g.addColorStop(1, "#1d7a3a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0e1810";
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.02, s * 0.21, 0, Math.PI * 2);
    ctx.fill();
    // big sparkle + small sparkle
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - s * 0.13, cy - s * 0.14, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + s * 0.11, cy + s * 0.12, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // tiny star glint
    ctx.beginPath();
    ctx.arc(cx + s * 0.05, cy - s * 0.18, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  });
}

// --- Material factory (fresh per call) --------------------------------------
function mat(opts) {
  const m = new THREE.MeshStandardMaterial({
    roughness: opts.roughness ?? 0.7,
    metalness: 0.0,
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    bumpMap: opts.bumpMap ?? null,
    bumpScale: opts.bumpScale ?? 0.0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1.0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.toon !== false) makeToon(m);
  return m;
}

function outlineMat() {
  return new THREE.MeshBasicMaterial({ color: 0x12180f, side: THREE.BackSide });
}

// Thin inverted-hull outline child.
function addOutline(mesh, scale = 1.05) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat());
  o.scale.setScalar(scale);
  o.userData.noShadow = true;
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return o;
}

function meshOf(geo, material, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = false;
  if (opts.outline !== false) addOutline(m, opts.outlineScale ?? 1.05);
  return m;
}

// Flat petal shape (teardrop).
function makePetalGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.14, 0.1, 0.05, 0.3);
  shape.quadraticCurveTo(0, 0.4, -0.05, 0.3);
  shape.quadraticCurveTo(-0.14, 0.1, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.computeVertexNormals();
  return geo;
}

// Flat leaf shape (lens).
function makeLeafGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.13, 0.16, 0, 0.4);
  shape.quadraticCurveTo(-0.13, 0.16, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.computeVertexNormals();
  return geo;
}

// --- Build ------------------------------------------------------------------
export function buildBloomkit() {
  const g = new THREE.Group();
  g.name = "BLOOMKIT";

  // fresh textures + materials each call
  const fMap = furTex();
  const fBump = furBump();
  const pMap = petalTex();
  const lMap = leafTex();
  const eMap = eyeTex();

  const furMat = mat({ color: 0xb8ee9e, map: fMap, bumpMap: fBump, bumpScale: 0.02, roughness: 0.8 });
  const creamMat = mat({ color: 0xfdfbe6, roughness: 0.7 });
  const petalMat = mat({ color: 0xffb0dd, map: pMap, roughness: 0.5, side: THREE.DoubleSide });
  const leafMat = mat({ color: 0x6fcf52, map: lMap, roughness: 0.55, side: THREE.DoubleSide });
  const blossomMat = mat({ color: 0xffd6ee, roughness: 0.5, side: THREE.DoubleSide });
  const eyeMat = mat({ color: 0xffffff, map: eMap, emissive: 0x66dd88, emissiveIntensity: 0.4, roughness: 0.25, toon: false });
  const noseMat = mat({ color: 0xe88bb8, roughness: 0.4 });
  const moteMat = mat({ color: 0xfff2a0, emissive: 0xffe14d, emissiveIntensity: 1.3, roughness: 0.4, toon: false, transparent: true, opacity: 0.92 });

  g.userData.bodyMats = [furMat, petalMat, leafMat, blossomMat];

  // ----- BODY -----
  const body = meshOf(new THREE.SphereGeometry(0.32, 22, 18), furMat);
  body.scale.set(1.0, 0.95, 1.2);
  body.position.set(0, 0.42, 0);
  g.add(body);

  // cream belly
  const belly = meshOf(new THREE.SphereGeometry(0.24, 18, 14), creamMat, { outline: false });
  belly.scale.set(0.85, 0.85, 0.7);
  belly.position.set(0, 0.36, 0.18);
  g.add(belly);

  // ----- LEGS (4 stubby) -----
  const legGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.24, 12);
  const pawGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const legPos = [
    [-0.16, 0.12, 0.16], [0.16, 0.12, 0.16],
    [-0.16, 0.12, -0.15], [0.16, 0.12, -0.15],
  ];
  for (const [x, y, z] of legPos) {
    const leg = meshOf(legGeo, furMat);
    leg.position.set(x, y, z);
    g.add(leg);
    const paw = meshOf(pawGeo, creamMat, { outline: false });
    paw.scale.set(1, 0.7, 1.1);
    paw.position.set(x, 0.04, z + 0.03);
    g.add(paw);
  }

  // ----- LEAFY PLUME TAIL (fan of leaves on a stalk) -----
  const tailGroup = new THREE.Group();
  tailGroup.name = "tail";
  tailGroup.position.set(0, 0.46, -0.34);
  g.add(tailGroup);
  g.userData.tailGroup = tailGroup;

  const tailStalk = meshOf(new THREE.CylinderGeometry(0.04, 0.06, 0.34, 10), furMat);
  tailStalk.rotation.x = -1.0;
  tailStalk.position.set(0, 0.08, -0.06);
  tailGroup.add(tailStalk);

  const plumeCount = 7;
  for (let i = 0; i < plumeCount; i++) {
    const t = (i / (plumeCount - 1)) - 0.5; // -0.5..0.5 fan
    const leaf = meshOf(makeLeafGeo(), leafMat, { outlineScale: 1.07 });
    leaf.position.set(t * 0.12, 0.24 + Math.abs(t) * -0.04, -0.18);
    leaf.rotation.set(-1.0, 0, t * 1.4);
    leaf.scale.setScalar(1.05 - Math.abs(t) * 0.5);
    tailGroup.add(leaf);
  }

  // ----- BLOSSOM COLLAR (ring of small flowers around the neck) -----
  const collarCount = 8;
  for (let i = 0; i < collarCount; i++) {
    const a = (i / collarCount) * Math.PI * 2;
    const r = 0.3;
    const flowerCenter = new THREE.Vector3(Math.cos(a) * r, 0.62, Math.sin(a) * r * 0.8 + 0.04);
    // each flower = 1 mesh: a small blossom disc with petal bumps drawn implicitly
    const blossom = meshOf(new THREE.CircleGeometry(0.06, 5), blossomMat, { outlineScale: 1.12 });
    blossom.position.copy(flowerCenter);
    blossom.lookAt(flowerCenter.x * 2, flowerCenter.y + 0.3, flowerCenter.z * 2 + 0.3);
    g.add(blossom);
    // tiny gold center
    const cen = meshOf(new THREE.SphereGeometry(0.022, 8, 6), mat({ color: 0xffe79a, emissive: 0xffcf4d, emissiveIntensity: 0.5, toon: false }), { outline: false });
    cen.position.copy(flowerCenter);
    cen.position.y += 0.005;
    cen.position.z += 0.02;
    g.add(cen);
  }

  // ----- HEAD GROUP (for look-at) -----
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.74, 0.12);
  g.add(head);
  g.userData.head = head;

  const skull = meshOf(new THREE.SphereGeometry(0.27, 22, 18), furMat);
  skull.scale.set(1.05, 0.98, 1.0);
  head.add(skull);

  // cream muzzle
  const muzzle = meshOf(new THREE.SphereGeometry(0.16, 16, 14), creamMat, { outline: false });
  muzzle.scale.set(1.0, 0.78, 0.85);
  muzzle.position.set(0, -0.05, 0.22);
  head.add(muzzle);

  // heart-ish nose
  const nose = meshOf(new THREE.SphereGeometry(0.04, 10, 8), noseMat, { outline: false });
  nose.scale.set(1.2, 0.9, 1.0);
  nose.position.set(0, -0.01, 0.37);
  head.add(nose);

  // ----- FLOWER-PETAL EARS (each ear = fan of 3 petals on a base) -----
  for (const sx of [-1, 1]) {
    const earBase = new THREE.Group();
    earBase.position.set(sx * 0.18, 0.22, -0.02);
    earBase.rotation.z = sx * 0.35;
    head.add(earBase);
    for (let p = 0; p < 3; p++) {
      const petal = meshOf(makePetalGeo(), petalMat, { outlineScale: 1.08 });
      petal.position.set(0, 0.02, 0);
      petal.rotation.set(-0.3, 0, (p - 1) * 0.5);
      petal.scale.setScalar(0.95 - Math.abs(p - 1) * 0.12);
      earBase.add(petal);
    }
    // small green calyx at petal base
    const calyx = meshOf(new THREE.SphereGeometry(0.045, 10, 8), leafMat, { outline: false });
    calyx.scale.set(1, 0.6, 1);
    calyx.position.set(sx * 0.18, 0.2, -0.01);
    head.add(calyx);
  }

  // ----- EYES (big, sparkly, emissive-rimmed) -----
  for (const sx of [-1, 1]) {
    const rim = meshOf(
      new THREE.SphereGeometry(0.095, 14, 12),
      mat({ color: 0x1a5d28, emissive: 0x5fe07a, emissiveIntensity: 1.0, toon: false }),
      { outline: false }
    );
    rim.scale.set(1.0, 1.08, 0.5);
    rim.position.set(sx * 0.12, 0.04, 0.225);
    head.add(rim);
    const eye = meshOf(new THREE.SphereGeometry(0.082, 16, 14), eyeMat, { outline: false });
    eye.scale.set(1.0, 1.12, 0.7);
    eye.position.set(sx * 0.12, 0.04, 0.25);
    head.add(eye);
  }

  // cheek blushes
  for (const sx of [-1, 1]) {
    const cheek = meshOf(new THREE.SphereGeometry(0.045, 10, 8), mat({ color: 0xffa6c4, roughness: 0.5, toon: false }), { outline: false });
    cheek.scale.set(1.0, 0.7, 0.4);
    cheek.position.set(sx * 0.2, -0.06, 0.18);
    head.add(cheek);
  }

  // ----- HEAD BLOSSOM (single flower tuft on the crown) -----
  const crownStem = meshOf(new THREE.CylinderGeometry(0.014, 0.022, 0.12, 8), leafMat, { outlineScale: 1.1 });
  crownStem.position.set(0.02, 0.3, -0.04);
  head.add(crownStem);
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const cp = meshOf(makePetalGeo(), petalMat, { outlineScale: 1.1 });
    cp.position.set(0.02 + Math.cos(a) * 0.03, 0.38, -0.04 + Math.sin(a) * 0.03);
    cp.rotation.set(-1.2, a, 0);
    cp.scale.setScalar(0.5);
    head.add(cp);
  }
  const crownCen = meshOf(new THREE.SphereGeometry(0.03, 10, 8), mat({ color: 0xffe79a, emissive: 0xffcf4d, emissiveIntensity: 0.7, toon: false }), { outline: false });
  crownCen.position.set(0.02, 0.39, -0.04);
  head.add(crownCen);

  // ----- POLLEN MOTES (soft emissive, ~1.3 intensity) -----
  const motes = [];
  const motePos = [
    [0.34, 0.7, 0.1], [-0.3, 0.85, -0.08], [0.18, 1.0, 0.04], [-0.22, 0.6, 0.28],
  ];
  for (const [x, y, z] of motePos) {
    const mote = meshOf(new THREE.SphereGeometry(0.022, 8, 6), moteMat, { outline: false, shadow: false });
    mote.position.set(x, y, z);
    mote.userData.noShadow = true;
    g.add(mote);
    motes.push(mote);
  }
  g.userData.motes = motes;

  // empty contracts other creatures expose
  g.userData.wings = [];
  g.userData.noShadow = false;
  return g;
}

export const BLOOMKIT = {
  name: "BLOOMKIT",
  type: "grass",
  hp: 46,
  speed: 4.0,
  damage: 8,
  range: 18,
  attackCd: 2.1,
  score: 125,
  xp: 32,
  flying: false,
  catchRate: 0.95,
  projectile: { color: 0xff99dd, speed: 21, size: 0.15 },
  dex: "Where it naps, wildflowers bloom by morning.",
  build: buildBloomkit,
};
