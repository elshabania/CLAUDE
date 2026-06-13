import * as THREE from "three";

// ---------------------------------------------------------------------------
// LEAFCUB - an original cute GRASS-type cub (leafy lion/fox)
// Self-contained Three.js r160 module. Canvas textures only, no top-level await.
// ---------------------------------------------------------------------------

// --- Toon ramp shader injection (cel shading via onBeforeCompile) ----------
function makeToon(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
       #ifdef USE_TOON_RAMP
       #endif`
    );
    // Quantize the diffuse lighting into bands for a cel-shaded look.
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;",
      `vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
       float _lum = dot(totalDiffuse, vec3(0.299, 0.587, 0.114));
       float _band = _lum > 0.0 ? (floor(_lum * 3.0 + 0.5) / 3.0) / max(_lum, 0.0001) : 1.0;
       totalDiffuse *= mix(1.0, _band, 0.85);`
    );
  };
  mat.needsUpdate = true;
  return mat;
}

// --- Canvas texture helpers ------------------------------------------------
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

function bodyTex() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#6abf3e";
    ctx.fillRect(0, 0, s, s);
    // mottled mossy speckles
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = 2 + Math.random() * 5;
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(120,210,80,0.5)" : "rgba(60,150,40,0.5)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function bodyBump() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = Math.random() > 0.5 ? "#a8a8a8" : "#585858";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function leafTex() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#4aa824";
    ctx.fillRect(0, 0, s, s);
    // central vein + ribs
    ctx.strokeStyle = "rgba(30,110,20,0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, 4);
    ctx.lineTo(s * 0.5, s - 4);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const y = (s / 6) * i;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.18, y - 10);
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.82, y - 10);
      ctx.stroke();
    }
  }, 64);
}

function eyeTex() {
  return canvasTex((ctx, s) => {
    const cx = s / 2, cy = s / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    // iris
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, s * 0.42);
    g.addColorStop(0, "#5ad06b");
    g.addColorStop(0.7, "#1f8a3a");
    g.addColorStop(1, "#0c5a22");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // pupil
    ctx.fillStyle = "#101810";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // highlights
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - s * 0.12, cy - s * 0.13, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + s * 0.08, cy + s * 0.1, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  });
}

// --- Material factory (fresh per call) -------------------------------------
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
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.toon !== false) makeToon(m);
  return m;
}

function outlineMat() {
  return new THREE.MeshBasicMaterial({ color: 0x101510, side: THREE.BackSide });
}

// Add a thin inverted-hull outline child to a mesh.
function addOutline(mesh, scale = 1.045) {
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
  if (opts.outline !== false) addOutline(m, opts.outlineScale ?? 1.045);
  return m;
}

// --- Build -----------------------------------------------------------------
export function buildLeafcub() {
  const g = new THREE.Group();
  g.name = "LEAFCUB";

  // fresh textures + materials each call
  const bMap = bodyTex();
  const bBump = bodyBump();
  const lMap = leafTex();
  const eMap = eyeTex();

  const bodyMat = mat({ color: 0x6abf3e, map: bMap, bumpMap: bBump, bumpScale: 0.02, roughness: 0.75 });
  const creamMat = mat({ color: 0xfff2cf, roughness: 0.65 });
  const leafMat = mat({ color: 0x4aa824, map: lMap, roughness: 0.55, side: THREE.DoubleSide });
  const darkMat = mat({ color: 0x2c6b1f, roughness: 0.7 });
  const sproutStemMat = mat({ color: 0x7bd14a, roughness: 0.6 });
  const eyeMat = mat({ color: 0xffffff, map: eMap, emissive: 0x2f7a33, emissiveIntensity: 0.5, roughness: 0.3, toon: false });
  const noseMat = mat({ color: 0x3a8a4a, roughness: 0.4 });

  // ----- BODY -----
  const body = meshOf(new THREE.SphereGeometry(0.36, 22, 18), bodyMat);
  body.scale.set(1.0, 0.92, 1.15);
  body.position.set(0, 0.46, 0);
  g.add(body);

  // cream belly patch
  const belly = meshOf(new THREE.SphereGeometry(0.27, 18, 14), creamMat, { outline: false });
  belly.scale.set(0.9, 0.85, 0.7);
  belly.position.set(0, 0.4, 0.2);
  g.add(belly);

  // ----- LEGS (4 stubby) -----
  const legGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.26, 12);
  const pawGeo = new THREE.SphereGeometry(0.1, 12, 10);
  const legPos = [
    [-0.18, 0.13, 0.18], [0.18, 0.13, 0.18],
    [-0.18, 0.13, -0.16], [0.18, 0.13, -0.16],
  ];
  for (const [x, y, z] of legPos) {
    const leg = meshOf(legGeo, bodyMat);
    leg.position.set(x, y, z);
    g.add(leg);
    const paw = meshOf(pawGeo, creamMat, { outline: false });
    paw.scale.set(1, 0.7, 1.1);
    paw.position.set(x, 0.05, z + 0.03);
    g.add(paw);
  }

  // ----- TAIL with leaf tip -----
  const tail = meshOf(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 10), bodyMat);
  tail.position.set(0, 0.48, -0.34);
  tail.rotation.x = -0.9;
  g.add(tail);
  const tailLeaf = meshOf(makeLeafGeo(), leafMat, { outlineScale: 1.06 });
  tailLeaf.position.set(0, 0.62, -0.46);
  tailLeaf.rotation.set(-0.5, 0, 0.3);
  tailLeaf.scale.setScalar(0.9);
  g.add(tailLeaf);

  // ----- HEAD GROUP (for look-at) -----
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.78, 0.12);
  g.add(head);
  g.userData.head = head;

  const skull = meshOf(new THREE.SphereGeometry(0.3, 22, 18), bodyMat);
  skull.scale.set(1.05, 0.98, 1.0);
  head.add(skull);

  // muzzle / cream face
  const muzzle = meshOf(new THREE.SphereGeometry(0.18, 16, 14), creamMat, { outline: false });
  muzzle.scale.set(1.0, 0.8, 0.85);
  muzzle.position.set(0, -0.05, 0.24);
  head.add(muzzle);

  // nose
  const nose = meshOf(new THREE.SphereGeometry(0.045, 10, 8), noseMat, { outline: false });
  nose.position.set(0, -0.02, 0.4);
  head.add(nose);

  // ----- LEAF-TUFT MANE (ring of leaves around head) -----
  const maneCount = 10;
  for (let i = 0; i < maneCount; i++) {
    const a = (i / maneCount) * Math.PI * 2;
    const leaf = meshOf(makeLeafGeo(), i % 2 ? leafMat : darkMat, { outlineScale: 1.06 });
    const r = 0.32;
    leaf.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.85 - 0.02, -0.05);
    leaf.rotation.z = a - Math.PI / 2;
    leaf.rotation.x = -0.35;
    leaf.scale.setScalar(0.78 + (i % 2) * 0.12);
    head.add(leaf);
  }

  // ----- EARS (rounded, leafy) -----
  for (const sx of [-1, 1]) {
    const ear = meshOf(new THREE.SphereGeometry(0.1, 12, 10), bodyMat);
    ear.scale.set(0.7, 1.1, 0.5);
    ear.position.set(sx * 0.2, 0.24, -0.02);
    ear.rotation.z = sx * 0.3;
    head.add(ear);
    const inner = meshOf(new THREE.SphereGeometry(0.055, 10, 8), creamMat, { outline: false });
    inner.scale.set(0.6, 1.0, 0.4);
    inner.position.set(sx * 0.2, 0.25, 0.04);
    head.add(inner);
  }

  // ----- SPROUT on head (stem + 2 leaves + bud) -----
  const stem = meshOf(new THREE.CylinderGeometry(0.018, 0.03, 0.22, 8), sproutStemMat, { outlineScale: 1.08 });
  stem.position.set(0, 0.34, -0.02);
  head.add(stem);
  for (const sx of [-1, 1]) {
    const sl = meshOf(makeLeafGeo(), leafMat, { outlineScale: 1.07 });
    sl.position.set(sx * 0.06, 0.42, -0.02);
    sl.rotation.set(-0.2, 0, sx * 0.9);
    sl.scale.setScalar(0.5);
    head.add(sl);
  }
  const bud = meshOf(new THREE.SphereGeometry(0.04, 10, 8), sproutStemMat, { outlineScale: 1.1 });
  bud.position.set(0, 0.46, -0.02);
  head.add(bud);

  // ----- EYES (big, emissive-rimmed) -----
  for (const sx of [-1, 1]) {
    // emissive rim
    const rim = meshOf(new THREE.SphereGeometry(0.1, 14, 12), mat({ color: 0x114d1a, emissive: 0x2f9a44, emissiveIntensity: 0.9, toon: false }), { outline: false });
    rim.scale.set(1.0, 1.05, 0.5);
    rim.position.set(sx * 0.13, 0.05, 0.245);
    head.add(rim);
    // eyeball
    const eye = meshOf(new THREE.SphereGeometry(0.088, 16, 14), eyeMat, { outline: false });
    eye.scale.set(1.0, 1.1, 0.7);
    eye.position.set(sx * 0.13, 0.05, 0.27);
    head.add(eye);
  }

  // cheek blushes
  for (const sx of [-1, 1]) {
    const cheek = meshOf(new THREE.SphereGeometry(0.05, 10, 8), mat({ color: 0xff9bb0, roughness: 0.5, toon: false }), { outline: false });
    cheek.scale.set(1.0, 0.7, 0.4);
    cheek.position.set(sx * 0.22, -0.06, 0.2);
    head.add(cheek);
  }

  g.userData.noShadow = false;
  return g;
}

// Simple leaf geometry (flat lathe-ish lens shape via shape extrude-free lathe).
function makeLeafGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.12, 0.12, 0, 0.34);
  shape.quadraticCurveTo(-0.12, 0.12, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.computeVertexNormals();
  return geo;
}

export const LEAFCUB = {
  name: "LEAFCUB",
  type: "grass",
  hp: 46,
  speed: 3.2,
  damage: 7,
  range: 18,
  attackCd: 2.3,
  score: 90,
  xp: 24,
  flying: false,
  catchRate: 1.15,
  projectile: { color: 0x88ee44, speed: 18, size: 0.16 },
  dex: "A playful cub whose mane sprouts fresh leaves each spring.",
  build: buildLeafcub,
};
