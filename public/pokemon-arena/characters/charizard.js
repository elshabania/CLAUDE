// characters/charizard.js
// CHARIZARD — the HERO. Vivid-orange bipedal dragon, cream belly plates,
// teal inner bat-wing membranes, two backward-sweeping horns, and the iconic
// BLAZING tail flame (layered additive cones + sprite flicker + point light).
// Procedural geometry + <canvas> textures only. Faces +Z, origin at feet.
// Conforms to the Shared CHARACTER RIG contract. Reproduces the animated-series
// (cartoon) look as closely as primitives + curves allow. ≲28k tris.

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Palette — warm vivid orange (NOT brown), cream belly, teal wings.
// ----------------------------------------------------------------------------
const COL = {
  body:        0xff7a26, // vivid warm orange
  bodyDark:    0xe05a14, // crevice / shaded orange
  bodyLight:   0xff9a4d, // top-lit orange
  belly:       0xfbe9b8, // cream / pale yellow underside
  bellyEdge:   0xe9cf8e, // belly seam shading
  wingArm:     0xf06c1e, // orange wing bone-arm
  wingMembrane:0x2fb6a8, // teal / blue-green inner membrane
  wingVein:    0x238b80, // darker teal veins
  horn:        0xe9e2d2, // pale cream horn
  hornTip:     0xcfc6b0,
  claw:        0xf6f1e3, // white claws / teeth
  sole:        0xf3dfae, // cream foot sole
  eyeIris:     0x2bbfae, // blue-green iris
  eyePupil:    0x161a18, // near-black pupil
  eyeWhite:    0xffffff,
  mouth:       0x4a1410, // dark mouth interior
  tongue:      0xc8525a,
  brow:        0xd9510f, // brow ridge (slightly darker orange)
  flameOuter:  0xff5a14, // deep orange
  flameMid:    0xffb52e, // bright orange/yellow
  flameInner:  0xfff6d8, // white-hot core
  flameLight:  0xff8a2e,
};

// ----------------------------------------------------------------------------
// Canvas texture helpers
// ----------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h || w;
  return { c, ctx: c.getContext('2d') };
}

// Body: smooth warm orange + very subtle scale shading + soft AO in crevices.
function makeBodyTexture() {
  const { c, ctx } = makeCanvas(512);
  // base vertical gradient (top-lit -> shaded toward belly line)
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#ff8f3a');
  g.addColorStop(0.5, '#ff7a26');
  g.addColorStop(1.0, '#ec6418');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // very subtle scale shading — faint overlapping arcs, low alpha
  ctx.lineWidth = 1.4;
  for (let ry = 0; ry < 22; ry++) {
    const y = ry * 24 + 8;
    const off = (ry % 2) * 12;
    for (let cx = -1; cx < 23; cx++) {
      const x = cx * 24 + off;
      ctx.beginPath();
      ctx.arc(x, y, 12, Math.PI * 0.12, Math.PI * 0.88);
      ctx.strokeStyle = 'rgba(190,70,14,0.10)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 1.5, 12, Math.PI * 0.12, Math.PI * 0.88);
      ctx.strokeStyle = 'rgba(255,180,120,0.07)';
      ctx.stroke();
    }
  }

  // soft ambient-occlusion blotches in "crevices"
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 10 + Math.random() * 26;
    const ao = ctx.createRadialGradient(x, y, 1, x, y, r);
    ao.addColorStop(0, 'rgba(150,52,10,0.0)');
    ao.addColorStop(1, 'rgba(150,52,10,0.10)');
    ctx.fillStyle = ao;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Belly: cream with horizontal plate seams (the iconic belly segments).
function makeBellyTexture() {
  const { c, ctx } = makeCanvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#fdeec3');
  g.addColorStop(1, '#f2dca0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);

  // side vignette so the plate centre reads brighter than edges
  const vg = ctx.createLinearGradient(0, 0, 256, 0);
  vg.addColorStop(0, 'rgba(180,150,90,0.30)');
  vg.addColorStop(0.5, 'rgba(255,250,225,0.0)');
  vg.addColorStop(1, 'rgba(180,150,90,0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 256, 512);

  // horizontal plate seams — gently bowed lines, soft shadow under each
  const seams = 9;
  for (let i = 1; i < seams; i++) {
    const y = (512 / seams) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(128, y + 10, 256, y);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(150,120,70,0.45)';
    ctx.stroke();
    // soft shadow band just under the seam (plate overlap)
    ctx.beginPath();
    ctx.moveTo(0, y + 5);
    ctx.quadraticCurveTo(128, y + 15, 256, y + 5);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(150,120,70,0.16)';
    ctx.stroke();
    // thin highlight just above (plate lip)
    ctx.beginPath();
    ctx.moveTo(0, y - 4);
    ctx.quadraticCurveTo(128, y + 6, 256, y - 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,252,235,0.5)';
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Wing membrane: teal with radiating vein lines from the apex.
function makeWingTexture() {
  const { c, ctx } = makeCanvas(512);
  const g = ctx.createRadialGradient(60, 60, 10, 60, 60, 560);
  g.addColorStop(0, '#3fd0c0');
  g.addColorStop(0.5, '#2fb6a8');
  g.addColorStop(1, '#1f9286');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // radiating veins from near the apex corner (60,60)
  ctx.strokeStyle = 'rgba(28,110,102,0.55)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * 0.5) * (i / 8) + 0.05;
    ctx.beginPath();
    ctx.moveTo(60, 60);
    const ex = 60 + Math.cos(a) * 600;
    const ey = 60 + Math.sin(a) * 600;
    // slight bow for an organic vein
    ctx.quadraticCurveTo(60 + Math.cos(a) * 280 + 30, 60 + Math.sin(a) * 280 - 30, ex, ey);
    ctx.lineWidth = 3.2;
    ctx.stroke();
    // fine secondary veins
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(28,110,102,0.30)';
    ctx.beginPath();
    ctx.moveTo(60 + Math.cos(a) * 180, 60 + Math.sin(a) * 180);
    ctx.lineTo(60 + Math.cos(a + 0.12) * 360, 60 + Math.sin(a + 0.12) * 360);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(28,110,102,0.55)';
  }
  // subtle membrane mottle
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5
      ? 'rgba(60,200,185,0.06)' : 'rgba(20,120,110,0.06)';
    ctx.beginPath(); ctx.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Soft flame sprite — radial warm glow for the billboard flicker.
function makeFlameSprite() {
  const { c, ctx } = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 70, 4, 64, 64, 62);
  g.addColorStop(0.0, 'rgba(255,250,225,0.95)');
  g.addColorStop(0.3, 'rgba(255,200,90,0.75)');
  g.addColorStop(0.6, 'rgba(255,120,30,0.35)');
  g.addColorStop(1.0, 'rgba(255,80,10,0.0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ----------------------------------------------------------------------------
// Material helper — stores hit-flash bookkeeping (HARD RULE).
// ----------------------------------------------------------------------------
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.04,
    map: opts.map || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    envMapIntensity: opts.envMapIntensity ?? 1,
    transparent: opts.transparent || false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  return m;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
export function createCharizard() {
  const group = new THREE.Group();
  group.name = 'CHARIZARD';

  const bodyMats = [];
  const arms = [];
  const legs = [];
  const wings = [];

  // textures
  const bodyTex   = makeBodyTexture();
  const bellyTex  = makeBellyTexture();
  const wingTex   = makeWingTexture();
  const flameTex  = makeFlameSprite();

  // shared materials
  const bodyMat    = stdMat(COL.body,     { roughness: 0.6,  map: bodyTex });
  const bodyDarkMat= stdMat(COL.bodyDark, { roughness: 0.66 });
  const bellyMat   = stdMat(COL.belly,    { roughness: 0.52, map: bellyTex });
  const wingArmMat = stdMat(COL.wingArm,  { roughness: 0.6,  map: bodyTex });
  const hornMat    = stdMat(COL.horn,     { roughness: 0.45 });
  const clawMat    = stdMat(COL.claw,     { roughness: 0.38 });
  const soleMat    = stdMat(COL.sole,     { roughness: 0.6 });
  const browMat    = stdMat(COL.brow,     { roughness: 0.62 });
  const irisMat    = stdMat(COL.eyeIris,  { roughness: 0.3, emissive: COL.eyeIris, emissiveIntensity: 0.25 });
  const pupilMat   = stdMat(COL.eyePupil, { roughness: 0.3 });
  const mouthMat   = stdMat(COL.mouth,    { roughness: 0.85 });
  const tongueMat  = stdMat(COL.tongue,   { roughness: 0.7 });

  // teal wing membrane: DoubleSide, slight translucency
  const wingMembraneMat = stdMat(COL.wingMembrane, {
    roughness: 0.55, map: wingTex, side: THREE.DoubleSide,
    transparent: true, opacity: 0.93,
  });

  bodyMats.push(bodyMat, bodyDarkMat, bellyMat, wingArmMat, hornMat,
                clawMat, soleMat, browMat, wingMembraneMat);

  // ==========================================================================
  // BODY — barrel chest, broad shoulders, cream belly down the front.
  // ==========================================================================
  const body = new THREE.Group();
  group.add(body);

  // hips / lower torso
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), bodyMat);
  hips.position.set(0, 1.18, 0);
  hips.scale.set(1.0, 0.9, 0.95);
  hips.castShadow = true;
  body.add(hips);

  // barrel chest (capsule, broadened)
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.56, 0.5, 10, 22), bodyMat);
  chest.position.set(0, 1.66, 0.02);
  chest.scale.set(1.12, 1.0, 0.98);
  chest.castShadow = true;
  body.add(chest);

  // broad shoulder yoke
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), bodyMat);
  shoulders.position.set(0, 2.0, -0.02);
  shoulders.scale.set(1.55, 0.6, 0.95);
  shoulders.castShadow = true;
  body.add(shoulders);

  // cream belly — runs chin->throat->chest->abdomen. Front patch (chest+abdomen).
  const bellyChest = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 18), bellyMat);
  bellyChest.position.set(0, 1.62, 0.4);
  bellyChest.scale.set(0.92, 1.35, 0.55);
  bellyChest.castShadow = true;
  body.add(bellyChest);

  const bellyLow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 16), bellyMat);
  bellyLow.position.set(0, 1.2, 0.34);
  bellyLow.scale.set(0.95, 1.0, 0.55);
  bellyLow.castShadow = true;
  body.add(bellyLow);

  // ==========================================================================
  // NECK — long, thick, S-curved, leaning slightly forward. Cream throat front.
  // Built from a short chain of capsules following an S curve.
  // ==========================================================================
  const neck = new THREE.Group();
  body.add(neck);
  // neck segments: (y, z, radius) along an S — base leans back then forward.
  const neckSeg = [
    { y: 2.12, z: -0.04, r: 0.34 },
    { y: 2.30, z: 0.02,  r: 0.31 },
    { y: 2.46, z: 0.12,  r: 0.29 },
    { y: 2.60, z: 0.22,  r: 0.28 },
  ];
  for (const s of neckSeg) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(s.r, 16, 14), bodyMat);
    seg.position.set(0, s.y, s.z);
    seg.scale.set(1.0, 1.05, 1.0);
    seg.castShadow = true;
    neck.add(seg);
    // cream throat plate on the front of each segment
    const throat = new THREE.Mesh(new THREE.SphereGeometry(s.r * 0.78, 14, 12), bellyMat);
    throat.position.set(0, s.y, s.z + s.r * 0.62);
    throat.scale.set(0.85, 0.95, 0.42);
    throat.castShadow = true;
    neck.add(throat);
  }

  // ==========================================================================
  // HEAD — long muzzle, brow ridges, round eyes, backward horns, hinged jaw.
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 2.74, 0.28);
  group.add(head);

  // skull
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 18), bodyMat);
  skull.scale.set(1.0, 0.96, 1.05);
  skull.castShadow = true;
  head.add(skull);

  // long upper muzzle / snout (tapered)
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.26, 8, 16), bodyMat);
  snout.rotation.x = Math.PI * 0.5;
  snout.position.set(0, -0.04, 0.34);
  snout.scale.set(1.0, 1.0, 0.9);
  snout.castShadow = true;
  head.add(snout);
  // muzzle top bridge (slimmer, gives the long-snout silhouette)
  const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 6, 12), bodyMat);
  bridge.rotation.x = Math.PI * 0.5;
  bridge.position.set(0, 0.06, 0.36);
  bridge.castShadow = true;
  head.add(bridge);
  // snout tip cap with nostril dents
  const snoutTip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 14), bodyMat);
  snoutTip.position.set(0, -0.03, 0.56);
  snoutTip.scale.set(1.0, 0.85, 0.8);
  snoutTip.castShadow = true;
  head.add(snoutTip);
  for (const sx of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), bodyDarkMat);
    nostril.position.set(sx * 0.07, 0.02, 0.66);
    head.add(nostril);
  }

  // prominent brow ridges (two angled wedges over the eyes -> fierce look)
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.2), browMat);
    brow.position.set(sx * 0.16, 0.16, 0.3);
    brow.rotation.z = sx * 0.18;
    brow.rotation.x = -0.28;
    brow.castShadow = true;
    head.add(brow);
  }

  // ROUND eyes — white, blue-green iris, black pupil, emissive white highlight.
  const eyeWhiteMat = stdMat(COL.eyeWhite, { roughness: 0.25 });
  const highlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.15,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.6,
  });
  highlightMat.userData.baseEmissive = highlightMat.emissive.clone();
  highlightMat.userData.baseEmissiveIntensity = highlightMat.emissiveIntensity;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), eyeWhiteMat);
    eye.position.set(sx * 0.2, 0.08, 0.34);
    eye.scale.set(0.95, 1.1, 0.7);
    eye.castShadow = true;
    head.add(eye);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), irisMat);
    iris.position.set(sx * 0.21, 0.075, 0.41);
    iris.scale.set(1, 1.1, 0.6);
    head.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), pupilMat);
    pupil.position.set(sx * 0.215, 0.07, 0.45);
    head.add(pupil);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), highlightMat);
    dot.position.set(sx * 0.235, 0.11, 0.47);
    head.add(dot);
  }

  // TWO horns — sweep straight BACK off the back of the skull.
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 12), hornMat);
    horn.position.set(sx * 0.16, 0.18, -0.28);
    // point backward and slightly up/out
    horn.rotation.x = Math.PI * 0.62;
    horn.rotation.z = sx * 0.18;
    horn.castShadow = true;
    head.add(horn);
  }

  // JAW (hinge) — rotation.x in [0..0.55] opens. Lower jaw + teeth + tongue.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.18);
  head.add(jaw);

  const jawMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 8, 14), bodyMat);
  jawMesh.rotation.x = Math.PI * 0.5;
  jawMesh.position.set(0, -0.06, 0.2);
  jawMesh.scale.set(1.0, 1.0, 0.8);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);
  // cream chin (belly colour starts at the chin)
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), bellyMat);
  chin.position.set(0, -0.1, 0.28);
  chin.scale.set(0.9, 0.7, 0.9);
  chin.castShadow = true;
  jaw.add(chin);

  // dark mouth interior (attached to jaw so it opens with it)
  const mouthInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mouthMat);
  mouthInner.rotation.x = Math.PI;
  mouthInner.position.set(0, 0.02, 0.16);
  mouthInner.scale.set(0.9, 0.7, 0.9);
  jaw.add(mouthInner);
  // tongue
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), tongueMat);
  tongue.position.set(0, -0.01, 0.18);
  tongue.scale.set(0.8, 0.4, 1.0);
  jaw.add(tongue);

  // small white teeth — upper row (fixed to head) + lower row (on jaw).
  function toothRow(parent, y, z, count, size, up) {
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1) - 0.5);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(size, size * 2.6, 6), clawMat);
      tooth.position.set(t * 0.26, y, z + Math.cos(t * 1.2) * 0.02);
      tooth.rotation.x = up ? Math.PI : 0;
      tooth.rotation.z = t * 0.3;
      tooth.castShadow = true;
      parent.add(tooth);
    }
  }
  toothRow(head, -0.06, 0.42, 5, 0.022, true);  // upper teeth point down
  toothRow(jaw, 0.0, 0.34, 5, 0.022, false);     // lower teeth point up

  // mouthAnchor (breath/beam origin) just inside the mouth
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.02, 0.5);
  head.add(mouthAnchor);

  // mouthGlow — emissive orange sphere, hidden by default
  const mouthGlowMat = new THREE.MeshStandardMaterial({
    color: COL.flameMid, emissive: new THREE.Color(COL.flameMid),
    emissiveIntensity: 2.6, roughness: 0.4, transparent: true, opacity: 0.92,
  });
  mouthGlowMat.userData.baseEmissive = mouthGlowMat.emissive.clone();
  mouthGlowMat.userData.baseEmissiveIntensity = mouthGlowMat.emissiveIntensity;
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), mouthGlowMat);
  mouthGlow.position.copy(mouthAnchor.position);
  mouthGlow.visible = false;
  head.add(mouthGlow);

  // ==========================================================================
  // ARMS — shorter, shoulder pivots, 3 white claws each.
  // ==========================================================================
  function buildArm(sign) { // +1 left, -1 right
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.66, 1.96, 0.02);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.26, 6, 12), bodyMat);
    upper.position.set(sign * 0.06, -0.22, 0.02);
    upper.rotation.z = sign * 0.2;
    upper.castShadow = true;
    pivot.add(upper);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 6, 12), bodyMat);
    fore.position.set(sign * 0.12, -0.5, 0.08);
    fore.rotation.z = sign * 0.1;
    fore.rotation.x = 0.2;
    fore.castShadow = true;
    pivot.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), bodyMat);
    hand.position.set(sign * 0.16, -0.7, 0.16);
    hand.scale.set(1.0, 0.9, 1.0);
    hand.castShadow = true;
    pivot.add(hand);

    // 3 white claws
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.34;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 8), clawMat);
      claw.position.set(sign * 0.16 + Math.sin(a) * 0.13, -0.8, 0.24 + Math.cos(a) * 0.02);
      claw.rotation.x = Math.PI * 0.55;
      claw.rotation.z = -a * 0.5;
      claw.castShadow = true;
      pivot.add(claw);
    }

    arms.push({ pivot });
    return pivot;
  }
  buildArm(1);
  buildArm(-1);

  // ==========================================================================
  // LEGS — big powerful digitigrade hind legs, 3 forward toe-claws + cream sole.
  // ==========================================================================
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.34, 1.0, 0.0);
    group.add(pivot);

    // thick thigh
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.32, 8, 14), bodyMat);
    thigh.position.set(0, -0.26, 0.02);
    thigh.scale.set(1.1, 1.0, 1.05);
    thigh.castShadow = true;
    pivot.add(thigh);

    // shin angled forward (digitigrade) then ankle back
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 6, 12), bodyMat);
    shin.position.set(0, -0.62, 0.12);
    shin.rotation.x = -0.18;
    shin.castShadow = true;
    pivot.add(shin);

    // ankle
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), bodyMat);
    ankle.position.set(0, -0.86, 0.02);
    ankle.castShadow = true;
    pivot.add(ankle);

    // foot — flat-ish, forward
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), bodyMat);
    foot.position.set(0, -0.96, 0.16);
    foot.scale.set(1.0, 0.5, 1.4);
    foot.castShadow = true;
    pivot.add(foot);
    // cream sole underside
    const sole = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), soleMat);
    sole.position.set(0, -1.0, 0.16);
    sole.scale.set(1.0, 0.6, 1.4);
    pivot.add(sole);

    // 3 forward toe-claws
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.4;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), clawMat);
      claw.position.set(Math.sin(a) * 0.16, -0.98, 0.38);
      claw.rotation.x = Math.PI * 0.5;
      claw.rotation.z = -a * 0.4;
      claw.castShadow = true;
      pivot.add(claw);
    }

    legs.push({ pivot });
    return pivot;
  }
  buildLeg(1);
  buildLeg(-1);

  // ==========================================================================
  // WINGS — LARGE bat wings on the back. Orange bone-arm + 3-4 finger struts
  // + teal membrane (DoubleSide) + thumb-claw at apex. Pivot at shoulder blades.
  // Elegant raised/spread rest pose. wings:[{group, sign}].
  // ==========================================================================
  function buildWing(sign) { // +1 left, -1 right
    const wingGroup = new THREE.Group();
    // pivot at the shoulder blade
    wingGroup.position.set(sign * 0.28, 2.04, -0.28);
    // elegant raised + spread rest pose
    wingGroup.rotation.z = sign * 0.5;   // raised
    wingGroup.rotation.y = sign * -0.35; // swept back
    wingGroup.rotation.x = -0.15;        // tilted up
    group.add(wingGroup);

    // main bone-arm (humerus) — orange, extends outward
    const humerus = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 6, 10), wingArmMat);
    humerus.rotation.z = Math.PI * 0.5;
    humerus.position.set(sign * 0.45, 0.0, 0);
    humerus.castShadow = true;
    wingGroup.add(humerus);

    // wing "wrist" knuckle at the apex
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), wingArmMat);
    wrist.position.set(sign * 0.9, 0.05, 0);
    wrist.castShadow = true;
    wingGroup.add(wrist);

    // thumb-claw at the wing apex
    const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 8), clawMat);
    thumb.position.set(sign * 0.96, 0.2, 0);
    thumb.rotation.z = sign * -0.4;
    thumb.castShadow = true;
    wingGroup.add(thumb);

    // finger struts radiating from the wrist (4 struts) -> orange bones
    // and build the membrane shape spanning between strut tips & the body.
    const fingerAngles = [0.15, -0.35, -0.85, -1.3]; // fan downward/back
    const fingerLen    = [0.95, 1.25, 1.2, 0.85];
    const tips = [];
    for (let i = 0; i < fingerAngles.length; i++) {
      const a = fingerAngles[i];
      const len = fingerLen[i];
      const strut = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, len, 5, 8), wingArmMat);
      // orient strut from wrist outward at angle a (in wing's local XY plane)
      strut.position.set(
        sign * 0.9 + sign * Math.cos(a) * (len * 0.5 + 0.05),
        0.05 + Math.sin(a) * (len * 0.5 + 0.05),
        0,
      );
      strut.rotation.z = (Math.PI * 0.5) + (sign > 0 ? -a : a);
      strut.castShadow = true;
      wingGroup.add(strut);
      tips.push(new THREE.Vector3(
        sign * 0.9 + sign * Math.cos(a) * (len + 0.05),
        0.05 + Math.sin(a) * (len + 0.05),
        0,
      ));
    }

    // membrane — build a triangle fan from the shoulder root across strut tips.
    // Root anchor near the body shoulder, plus wrist, plus finger tips.
    const root = new THREE.Vector3(sign * 0.05, -0.05, 0);
    const wristV = new THREE.Vector3(sign * 0.9, 0.05, 0);
    const verts = [wristV, ...tips, root];
    const positions = [];
    const uvs = [];
    // fan: center = root, around the chain wrist->tips
    const chain = [wristV, ...tips];
    function uvFor(v) {
      // map relative to wrist apex (apex near canvas 0,0)
      return [
        Math.min(1, Math.abs(v.x - wristV.x) / 2.2 + 0.05),
        Math.min(1, Math.abs(v.y - wristV.y) / 2.2 + 0.05),
      ];
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      // winding so DoubleSide is moot but keep consistent
      positions.push(root.x, root.y, root.z, a.x, a.y, a.z, b.x, b.y, b.z);
      const ur = uvFor(root), ua = uvFor(a), ub = uvFor(b);
      uvs.push(...ur, ...ua, ...ub);
    }
    const memGeo = new THREE.BufferGeometry();
    memGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    memGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    memGeo.computeVertexNormals();
    const membrane = new THREE.Mesh(memGeo, wingMembraneMat);
    membrane.castShadow = true;
    wingGroup.add(membrane);

    wings.push({ group: wingGroup, sign });
    return wingGroup;
  }
  buildWing(1);
  buildWing(-1);

  // ==========================================================================
  // TAIL — long, thick at base, tapering chain of capsules under tailGroup,
  // ending in the BLAZING tail flame.
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.1, -0.42);
  group.add(tailGroup);

  // chain of capsules curving down-back then up to the flame
  const tailSeg = [
    { x: 0, y: -0.05, z: -0.3,  r: 0.24 },
    { x: 0, y: -0.18, z: -0.62, r: 0.2 },
    { x: 0, y: -0.22, z: -0.95, r: 0.17 },
    { x: 0, y: -0.16, z: -1.26, r: 0.14 },
    { x: 0, y: 0.0,   z: -1.5,  r: 0.11 },
    { x: 0, y: 0.22,  z: -1.62, r: 0.09 },
  ];
  for (let i = 0; i < tailSeg.length; i++) {
    const s = tailSeg[i];
    const seg = new THREE.Mesh(new THREE.SphereGeometry(s.r, 14, 12), bodyMat);
    seg.position.set(s.x, s.y, s.z);
    seg.scale.set(1.0, 1.0, 1.1);
    seg.castShadow = true;
    tailGroup.add(seg);
  }
  // tail tip anchor (where the flame sits)
  const tip = tailSeg[tailSeg.length - 1];
  const flameAnchor = new THREE.Object3D();
  flameAnchor.position.set(tip.x, tip.y + 0.14, tip.z + 0.02);
  tailGroup.add(flameAnchor);

  // ==========================================================================
  // FLAME — layered additive transparent cones (outer deep-orange, mid bright,
  // inner white-hot) + soft sprite billboard flicker + orange flameLight.
  // The flame group sits at the tail tip. animateExtra flickers it.
  // ==========================================================================
  const flame = new THREE.Group();
  flameAnchor.add(flame);

  function flameCone(radius, height, color, opacity, intensity) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 16, 1, true), mat);
    cone.position.y = height * 0.5 - 0.04;
    return cone;
  }
  const flameOuter = flameCone(0.3,  0.85, COL.flameOuter, 0.5, 1);
  const flameMid   = flameCone(0.2,  0.62, COL.flameMid,   0.7, 1);
  const flameInner = flameCone(0.11, 0.4,  COL.flameInner, 0.9, 1);
  flame.add(flameOuter, flameMid, flameInner);

  // soft billboard sprite flicker behind the cones
  const flameSpriteMat = new THREE.SpriteMaterial({
    map: flameTex, color: COL.flameMid, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flameSprite = new THREE.Sprite(flameSpriteMat);
  flameSprite.scale.set(0.9, 1.2, 1);
  flameSprite.position.y = 0.34;
  flame.add(flameSprite);

  // flameLight — orange PointLight inside the flame
  const flameLight = new THREE.PointLight(COL.flameLight, 2.2, 9.0, 2.0);
  flameLight.position.y = 0.3;
  flame.add(flameLight);

  // ==========================================================================
  // animateExtra — flicker tail flame (layered noise/sine), wing idle settle,
  // flight flare + wing spread, gentle chest breathing.
  // ==========================================================================
  const chestBaseY = chest.position.y;
  const bellyBaseY = bellyChest.position.y;
  const wingRest = wings.map((w) => ({
    z: w.group.rotation.z, y: w.group.rotation.y, x: w.group.rotation.x,
  }));

  group.userData.animateExtra = (t, dt, state) => {
    const flying = state && state.flying;

    // --- tail flame flicker: layered sine + cheap noise ---
    const n = Math.sin(t * 21.0) * 0.5 + Math.sin(t * 13.3 + 1.7) * 0.3
            + Math.sin(t * 33.7 + 0.6) * 0.2;
    const flare = flying ? 1.55 : 1.0;
    const baseS = (1.0 + n * 0.12) * flare;
    flameOuter.scale.set(baseS * (1 + Math.sin(t * 9) * 0.04), baseS, baseS);
    flameMid.scale.set(baseS * (1 + Math.sin(t * 11 + 1) * 0.05), baseS * 1.03, baseS);
    flameInner.scale.set(baseS, baseS * (1 + n * 0.08), baseS);
    // gentle sway of the whole flame
    flame.rotation.z = Math.sin(t * 5.0) * 0.06 * baseS;
    flame.rotation.x = Math.sin(t * 4.1 + 0.5) * 0.04;
    // sprite + light flicker
    const lf = 0.85 + (n * 0.5 + 0.5) * 0.5;
    flameSprite.material.opacity = (0.6 + lf * 0.25) * (flying ? 1.2 : 1.0);
    flameSprite.scale.set(0.9 * baseS, (1.2 + n * 0.12) * baseS, 1);
    flameLight.intensity = (flying ? 3.4 : 2.2) * lf;
    flameLight.distance = flying ? 12 : 9;

    // --- wing idle settle (and flight spread) ---
    for (let i = 0; i < wings.length; i++) {
      const w = wings[i];
      const rest = wingRest[i];
      const idle = Math.sin(t * 1.6 + i * Math.PI) * 0.04;
      if (flying) {
        // spread wider + slow powerful beat
        const beat = Math.sin(t * 3.2) * 0.25;
        w.group.rotation.z = rest.z + w.sign * (0.25 + beat);
        w.group.rotation.y = rest.y * 0.5;
      } else {
        w.group.rotation.z = rest.z + w.sign * idle;
        w.group.rotation.y = rest.y;
      }
      w.group.rotation.x = rest.x + Math.sin(t * 1.3 + i) * 0.02;
    }

    // --- gentle chest breathing ---
    const breath = Math.sin(t * 1.5) * 0.02;
    chest.position.y = chestBaseY + breath;
    chest.scale.x = 1.12 + breath * 0.5;
    bellyChest.position.y = bellyBaseY + breath;
  };

  // ==========================================================================
  // Cast shadows on all meshes + rig assembly.
  // ==========================================================================
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  group.userData = Object.assign(group.userData || {}, {
    name: 'CHARIZARD',
    element: 'fire',
    height: 2.7,
    baseY: 0,
    head,
    jaw,
    mouthAnchor,
    mouthGlow,
    tailGroup,
    flame,
    flameLight,
    wings,
    bodyMats,
    arms,
    legs,
  });

  return group;
}
