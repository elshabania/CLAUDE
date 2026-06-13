// characters/ash.js — Pokémon Arena 3D
// Ash-like PLAYER trainer (walks, throws Poké Balls) + Referee variant.
// Built to read well in 3rd person from BEHIND and the SIDE.
// Shared, parameterized humanoid builder recolored for the two roles.
// Pure procedural geometry + <canvas> textures only. NO external assets.
// Faces +Z, origin at feet, height ~1.7. Conforms to the Shared CHARACTER RIG.
// Fan project — Pokémon © Nintendo / Game Freak / Creatures. Original code.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Material helper — every MeshStandardMaterial records base emissive (HARD RULE)
// for the engine's hit-flash, and is optionally pushed into bodyMats.
// ---------------------------------------------------------------------------
function mkMat(params, bodyMats) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  if (bodyMats) bodyMats.push(m);
  return m;
}

// Mark every mesh under a root to cast shadows (no receiveShadow on characters).
function shadowify(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Canvas texture helpers
// ---------------------------------------------------------------------------
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return { c, g: c.getContext('2d') };
}

function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  t.needsUpdate = true;
  return t;
}

// Soft fabric weave for the jacket / shirt cloth so it doesn't read as plastic.
function makeClothTexture(base, weave) {
  const { c, g } = makeCanvas(128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  // subtle diagonal weave
  g.strokeStyle = weave;
  g.lineWidth = 1;
  g.globalAlpha = 0.5;
  for (let i = -128; i < 128; i += 4) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
  }
  g.globalAlpha = 1;
  // faint mottle for depth
  for (let i = 0; i < 400; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return canvasTex(c, 2);
}

// Zebra vertical-stripe shirt texture for the referee (black/white).
function makeZebraTexture() {
  const { c, g } = makeCanvas(128);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1a1a1a';
  for (let x = 0; x < 128; x += 24) {
    g.fillRect(x, 0, 12, 128);
  }
  // weave noise on top
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return canvasTex(c, 1);
}

// ---------------------------------------------------------------------------
// FACE texture — expressive cartoon trainer face painted onto a canvas:
// eyes + pupils + shines, brows, friendly smile, the two iconic cheek marks.
// Wrapped around the front hemisphere of the head sphere.
// ---------------------------------------------------------------------------
function makeFaceTexture(opts) {
  const o = opts || {};
  const skin = o.skin || '#f1c9a0';
  const { c, g } = makeCanvas(256);

  // skin base
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 256);

  // soft cheek blush + face shading
  const vg = g.createRadialGradient(128, 150, 30, 128, 150, 150);
  vg.addColorStop(0, 'rgba(255,225,200,0.35)');
  vg.addColorStop(1, 'rgba(190,140,100,0.30)');
  g.fillStyle = vg;
  g.fillRect(0, 0, 256, 256);

  // Faces are mapped so the FRONT of the head is centred near u=0.5.
  // We paint features in a horizontal band across the middle.
  const cx = 128;
  const eyeY = 120;

  // --- the two cheek marks (zigzag-ish bars) ---
  g.fillStyle = o.cheek || 'rgba(120,80,60,0.55)';
  for (const sx of [-1, 1]) {
    const mx = cx + sx * 74;
    g.save();
    g.translate(mx, 150);
    g.rotate(sx * -0.15);
    g.fillRect(-12, -5, 24, 10);
    g.restore();
  }

  // --- brows ---
  g.strokeStyle = o.brow || '#3a2a1c';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const sx of [-1, 1]) {
    const bx = cx + sx * 40;
    g.beginPath();
    g.moveTo(bx - sx * 16, eyeY - 30);
    g.lineTo(bx + sx * 16, eyeY - 22);
    g.stroke();
  }

  // --- eyes: white sclera, dark iris, bright shine ---
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 40;
    // sclera
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(ex, eyeY, 20, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(60,40,30,0.5)';
    g.lineWidth = 2;
    g.stroke();
    // iris
    g.fillStyle = o.iris || '#5a3b22';
    g.beginPath();
    g.ellipse(ex, eyeY + 3, 12, 17, 0, 0, Math.PI * 2);
    g.fill();
    // pupil
    g.fillStyle = '#1a120c';
    g.beginPath();
    g.ellipse(ex, eyeY + 4, 6, 9, 0, 0, Math.PI * 2);
    g.fill();
    // shine
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ex - 5, eyeY - 6, 5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ex + 4, eyeY + 8, 2.5, 0, Math.PI * 2);
    g.fill();
  }

  // --- nose dot ---
  g.fillStyle = 'rgba(150,100,75,0.5)';
  g.beginPath();
  g.arc(cx, eyeY + 30, 3.5, 0, Math.PI * 2);
  g.fill();

  // --- friendly smile (or neutral line for ref) ---
  g.strokeStyle = o.mouth || '#7a4030';
  g.lineWidth = 6;
  g.beginPath();
  if (o.stern) {
    g.moveTo(cx - 24, eyeY + 56);
    g.lineTo(cx + 24, eyeY + 56);
  } else {
    g.moveTo(cx - 26, eyeY + 50);
    g.quadraticCurveTo(cx, eyeY + 70, cx + 26, eyeY + 50);
  }
  g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Small cap-emblem texture (front-of-cap badge) — a clean half-disc glyph.
function makeEmblemTexture(col) {
  const { c, g } = makeCanvas(64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = col || '#3fae5a';
  g.beginPath();
  g.arc(32, 40, 22, Math.PI, 0);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(32, 40, 9, Math.PI, 0);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Palettes for the two roles. Both drive the SAME builder.
// ---------------------------------------------------------------------------
const TRAINER = {
  name: 'ASH',
  skin: 0xf1c9a0,
  hair: 0x161616,
  capRed: 0xe2402f,
  capWhite: 0xf4f4f4,
  capButton: 0xc23223,
  emblem: 0x3fae5a, // green front emblem
  jacket: 0x2f6dc4, // blue jacket body
  jacketWhite: 0xf2f2f2, // white shoulders/sleeves
  trimYellow: 0xf2c318, // yellow/black trim line
  trimBlack: 0x141414,
  collar: 0x244e92,
  undershirt: 0x161616, // black undershirt
  gloveBody: 0x1d1d1d,
  gloveCuff: 0x3fae5a, // green cuffs
  jeans: 0x2f4f86,
  jeansDark: 0x223a64,
  shoeRed: 0xd23a2c,
  shoeWhite: 0xf2f2f2,
  shoeBlack: 0x161616,
  pouch: 0x3a3a3a,
  faceCfg: { skin: '#f1c9a0', iris: '#5a3b22', cheek: 'rgba(150,90,70,0.5)' },
  emissive: 0x000000,
};

const REFEREE = {
  name: 'REFEREE',
  skin: 0xe9bd92,
  hair: 0x2a2520,
  capRed: 0x161616, // black cap
  capWhite: 0x161616,
  capButton: 0x444444,
  emblem: 0xffffff,
  zebra: true, // black/white vertical zebra shirt
  jacket: 0x303030,
  jacketWhite: 0xf2f2f2,
  trimYellow: 0xf2f2f2,
  trimBlack: 0x141414,
  collar: 0x1a1a1a,
  undershirt: 0x161616,
  gloveBody: 0x1d1d1d,
  gloveCuff: 0x222222,
  jeans: 0x222222, // black slacks
  jeansDark: 0x161616,
  shoeRed: 0x161616,
  shoeWhite: 0xf2f2f2,
  shoeBlack: 0x0c0c0c,
  pouch: 0x222222,
  whistle: true,
  flag: true,
  faceCfg: { skin: '#e9bd92', iris: '#3a2a1c', stern: true, mouth: '#5a3a2c' },
  emissive: 0x000000,
};

// ---------------------------------------------------------------------------
// Shared humanoid builder. Returns a fully rigged THREE.Group per contract.
// `P` = palette (TRAINER or REFEREE).
// ---------------------------------------------------------------------------
function buildTrainer(P) {
  const group = new THREE.Group();
  group.name = P.name;

  const bodyMats = [];
  const arms = [];
  const legs = [];

  // ---- textures ----
  const faceTex = makeFaceTexture(P.faceCfg);
  const jacketTex = P.zebra
    ? makeZebraTexture()
    : makeClothTexture(rgb(P.jacket), 'rgba(255,255,255,0.4)');
  const shirtTex = makeClothTexture(rgb(P.undershirt), 'rgba(255,255,255,0.18)');
  const jeansTex = makeClothTexture(rgb(P.jeans), 'rgba(255,255,255,0.22)');

  // ---- materials ----
  const skinMat = mkMat({ color: P.skin, roughness: 0.72, metalness: 0.02 }, bodyMats);
  const faceMat = mkMat({ map: faceTex, color: 0xffffff, roughness: 0.7 }, bodyMats);
  const hairMat = mkMat({ color: P.hair, roughness: 0.85 }, bodyMats);
  const capRedMat = mkMat({ color: P.capRed, roughness: 0.6, map: P.zebra ? null : null }, bodyMats);
  const capWhiteMat = mkMat({ color: P.capWhite, roughness: 0.55 }, bodyMats);
  const capBtnMat = mkMat({ color: P.capButton, roughness: 0.5 }, bodyMats);
  const emblemMat = mkMat({ map: makeEmblemTexture(rgb(P.emblem)), transparent: true, roughness: 0.5 }, null);
  const jacketMat = mkMat({ color: P.zebra ? 0xffffff : P.jacket, map: jacketTex, roughness: 0.8 }, bodyMats);
  const jacketWhiteMat = mkMat({ color: P.jacketWhite, roughness: 0.7 }, bodyMats);
  const trimYMat = mkMat({ color: P.trimYellow, roughness: 0.5, emissive: P.zebra ? 0x000000 : 0x161000, emissiveIntensity: 0.2 }, bodyMats);
  const trimBMat = mkMat({ color: P.trimBlack, roughness: 0.6 }, bodyMats);
  const collarMat = mkMat({ color: P.collar, roughness: 0.7 }, bodyMats);
  const shirtMat = mkMat({ color: P.undershirt, map: shirtTex, roughness: 0.85 }, bodyMats);
  const gloveMat = mkMat({ color: P.gloveBody, roughness: 0.7 }, bodyMats);
  const gloveCuffMat = mkMat({ color: P.gloveCuff, roughness: 0.6 }, bodyMats);
  const jeansMat = mkMat({ color: P.jeans, map: jeansTex, roughness: 0.85 }, bodyMats);
  const jeansDarkMat = mkMat({ color: P.jeansDark, roughness: 0.85 }, bodyMats);
  const shoeRedMat = mkMat({ color: P.shoeRed, roughness: 0.55 }, bodyMats);
  const shoeWhiteMat = mkMat({ color: P.shoeWhite, roughness: 0.5 }, bodyMats);
  const shoeBlackMat = mkMat({ color: P.shoeBlack, roughness: 0.6 }, bodyMats);
  const pouchMat = mkMat({ color: P.pouch, roughness: 0.6 }, bodyMats);

  // shared little eye-shine/white material (non-body)
  const whiteMat = mkMat({ color: 0xf6f6f6, roughness: 0.4 }, null);
  const redMat = mkMat({ color: 0xd8352a, roughness: 0.45 }, null);
  const darkMat = mkMat({ color: 0x141414, roughness: 0.5 }, null);

  // ==========================================================================
  // TORSO — blue jacket body, black undershirt strip, trim line, collar
  // ==========================================================================
  const torsoG = new THREE.Group();
  group.add(torsoG);

  // jacket trunk (slightly tapered capsule)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 6, 16), jacketMat);
  torso.position.y = 1.18;
  torso.scale.set(1.0, 1.0, 0.78);
  torsoG.add(torso);

  // black undershirt front strip (chest V) — thin box on +Z
  const chestStrip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.06), shirtMat);
  chestStrip.position.set(0, 1.2, 0.21);
  torsoG.add(chestStrip);

  // collar ring at the neck
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 18), collarMat);
  collar.position.set(0, 1.45, 0.02);
  collar.rotation.x = Math.PI * 0.5;
  collar.scale.set(1.0, 0.8, 1.0);
  torsoG.add(collar);

  // yellow/black horizontal trim line across the chest
  const trimY = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.022, 6, 22), trimYMat);
  trimY.position.set(0, 1.12, 0);
  trimY.rotation.x = Math.PI * 0.5;
  trimY.scale.set(1.0, 0.78, 1.0);
  torsoG.add(trimY);
  const trimB = new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.012, 6, 22), trimBMat);
  trimB.position.set(0, 1.085, 0);
  trimB.rotation.x = Math.PI * 0.5;
  trimB.scale.set(1.0, 0.78, 1.0);
  torsoG.add(trimB);

  // white jacket shoulder yokes (read strongly from behind)
  for (const sx of [-1, 1]) {
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), jacketWhiteMat);
    yoke.position.set(sx * 0.22, 1.4, 0);
    yoke.scale.set(1.0, 0.7, 0.85);
    torsoG.add(yoke);
  }
  // white back panel (visible from behind)
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), jacketWhiteMat);
  backPanel.position.set(0, 1.32, -0.2);
  torsoG.add(backPanel);

  // small Poké Ball belt pouch (right hip)
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.1), pouchMat);
  pouch.position.set(0.2, 0.92, 0.12);
  torsoG.add(pouch);
  const pouchBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), redMat);
  pouchBall.position.set(0.2, 0.93, 0.18);
  pouchBall.scale.set(1, 1, 0.5);
  torsoG.add(pouchBall);
  // belt strap
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 20), darkMat);
  belt.position.set(0, 0.96, 0);
  belt.rotation.x = Math.PI * 0.5;
  belt.scale.set(1.0, 0.78, 1.0);
  torsoG.add(belt);

  // referee whistle dot (on a cord) — only for ref
  if (P.whistle) {
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), darkMat);
    cord.position.set(0, 1.34, 0.06);
    cord.rotation.x = Math.PI * 0.46;
    cord.scale.set(1.0, 1.2, 1.0);
    torsoG.add(cord);
    const whistle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), trimYMat);
    whistle.position.set(0.06, 1.18, 0.2);
    whistle.scale.set(1.2, 0.8, 0.9);
    torsoG.add(whistle);
  }

  // ==========================================================================
  // HEAD — skin sphere with a painted face, spiky hair, the cap with emblem
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  group.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 22, 20), faceMat);
  skull.scale.set(1.0, 1.05, 1.0);
  head.add(skull);

  // back of skull / neck-sides use plain skin so face texture only reads front
  const backSkull = new THREE.Mesh(
    new THREE.SphereGeometry(0.201, 18, 16, Math.PI * 0.55, Math.PI * 0.9),
    skinMat,
  );
  backSkull.scale.set(1.0, 1.05, 1.0);
  head.add(backSkull);

  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), skinMat);
  neck.position.set(0, -0.18, 0);
  head.add(neck);

  // ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skinMat);
    ear.position.set(sx * 0.19, -0.01, 0);
    ear.scale.set(0.6, 1.1, 0.8);
    head.add(ear);
  }

  // --- spiky black hair: jagged cones poking out under the brim & at back ---
  const hairRoot = new THREE.Group();
  head.add(hairRoot);
  // back-of-head hair mass (under brim, pokes out the back)
  const hairMass = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 16, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65),
    hairMat,
  );
  hairMass.position.set(0, 0.02, -0.02);
  hairMass.scale.set(1.04, 0.95, 1.06);
  hairRoot.add(hairMass);
  // spiky tufts around the lower back/sides + a couple under the front brim
  const spikes = [
    [0, 0.0, -0.2, 0.0, -0.5], [0.13, -0.02, -0.18, 0.4, -0.6], [-0.13, -0.02, -0.18, -0.4, -0.6],
    [0.19, 0.0, -0.05, 0.9, 0.0], [-0.19, 0.0, -0.05, -0.9, 0.0],
    [0.08, -0.04, -0.22, 0.2, -0.9], [-0.08, -0.04, -0.22, -0.2, -0.9],
    [0.1, -0.06, 0.16, 0.3, 0.7], [-0.1, -0.06, 0.16, -0.3, 0.7], // under-brim front tufts
  ];
  for (const s of spikes) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), hairMat);
    sp.position.set(s[0], 0.01 + s[1], s[2]);
    sp.rotation.z = s[3];
    sp.rotation.x = s[4];
    hairRoot.add(sp);
  }

  // --- CAP: red crown + white front + brim, green emblem, button on top ---
  const cap = new THREE.Group();
  cap.position.set(0, 0.1, 0);
  head.add(cap);
  // crown (red half-dome)
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    capRedMat,
  );
  crown.scale.set(1.04, 0.92, 1.06);
  cap.add(crown);
  // white front panel of the crown (the iconic white face of the cap)
  const frontPanel = new THREE.Mesh(
    new THREE.SphereGeometry(0.216, 18, 14, -Math.PI * 0.28, Math.PI * 0.56, 0, Math.PI * 0.5),
    capWhiteMat,
  );
  frontPanel.scale.set(1.04, 0.92, 1.06);
  frontPanel.rotation.y = 0; // panel already centred toward +Z
  cap.add(frontPanel);
  // brim (flattened disc on the front)
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.025, 20, 1, false, -Math.PI * 0.55, Math.PI * 1.1),
    capWhiteMat,
  );
  brim.position.set(0, -0.04, 0.16);
  brim.rotation.x = -0.18;
  brim.scale.set(0.95, 1, 1.15);
  cap.add(brim);
  // green front emblem on the white panel
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), emblemMat);
  emblem.position.set(0, 0.03, 0.205);
  emblem.rotation.x = -0.12;
  cap.add(emblem);
  // button on top of the cap
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), capBtnMat);
  button.position.set(0, 0.18, 0);
  cap.add(button);

  // ==========================================================================
  // tiny hidden JAW hinge (contract requires jaw on head; trainer rarely opens)
  // ==========================================================================
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.12);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.04), skinMat);
  jawMesh.position.set(0, -0.03, 0.04);
  jawMesh.visible = false; // hidden — face is painted
  jaw.add(jawMesh);

  // mouthAnchor (breath/beam origin) just in front of the mouth
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.05, 0.22);
  head.add(mouthAnchor);

  // mouthGlow — small emissive sphere, hidden by default (contract)
  const mouthGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffcc66, emissive: new THREE.Color(0xffaa33), emissiveIntensity: 2.0,
    roughness: 0.4, transparent: true, opacity: 0.85,
  });
  mouthGlowMat.userData.baseEmissive = mouthGlowMat.emissive.clone();
  mouthGlowMat.userData.baseEmissiveIntensity = mouthGlowMat.emissiveIntensity;
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), mouthGlowMat);
  mouthGlow.position.copy(mouthAnchor.position);
  mouthGlow.visible = false;
  head.add(mouthGlow);

  // ==========================================================================
  // ARMS — shoulder pivots. White short sleeves + skin forearm +
  // green-cuffed fingerless gloves. Right arm is the THROW arm.
  // ==========================================================================
  function buildArm(sign) { // sign: +1 left, -1 right
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.3, 1.42, 0);
    group.add(pivot);

    // white short sleeve (jacket sleeve cap)
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.16, 5, 12), jacketWhiteMat);
    sleeve.position.set(0, -0.14, 0);
    pivot.add(sleeve);
    // yellow trim cuff at the sleeve hem
    const sleeveTrim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), trimYMat);
    sleeveTrim.position.set(0, -0.25, 0);
    sleeveTrim.rotation.x = Math.PI * 0.5;
    pivot.add(sleeveTrim);

    // bare skin forearm
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 5, 12), skinMat);
    fore.position.set(0, -0.42, 0.01);
    pivot.add(fore);

    // green glove cuff
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.07, 12), gloveCuffMat);
    cuff.position.set(0, -0.55, 0.01);
    pivot.add(cuff);

    // glove hand (dark, fingerless — stub fingers exposed as skin tips)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), gloveMat);
    hand.position.set(0, -0.62, 0.02);
    hand.scale.set(1.0, 1.05, 0.9);
    pivot.add(hand);
    // exposed fingertips
    for (let i = 0; i < 3; i++) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat);
      tip.position.set((i - 1) * 0.045, -0.69, 0.06);
      pivot.add(tip);
    }

    arms.push({ pivot });
    return pivot;
  }
  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);
  // gentle rest pose so arms read in 3rd person (slight outward + forward)
  leftArm.rotation.z = 0.12;
  rightArm.rotation.z = -0.12;

  // Referee carries a small red flag on a stick in the RIGHT hand.
  let flagGroup = null;
  if (P.flag) {
    flagGroup = new THREE.Group();
    flagGroup.position.set(0, -0.66, 0.06);
    rightArm.add(flagGroup);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), shoeBlackMat);
    stick.position.set(0, 0.18, 0.06);
    stick.rotation.x = -0.4;
    flagGroup.add(stick);
    const flagMat = mkMat({ color: 0xd8352a, roughness: 0.6, side: THREE.DoubleSide }, bodyMats);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), flagMat);
    flag.position.set(0.1, 0.34, 0.12);
    flag.rotation.y = Math.PI * 0.5;
    flagGroup.add(flag);
    flagGroup.userData.flagMesh = flag;
    flagGroup.userData.restRotX = 0;
  }

  // ==========================================================================
  // LEGS — hip pivots. Blue jeans + red/white/black sneakers.
  // ==========================================================================
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.13, 0.84, 0);
    group.add(pivot);

    // thigh (jeans)
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 5, 12), jeansMat);
    thigh.position.set(0, -0.2, 0);
    pivot.add(thigh);
    // shin (jeans, slightly darker)
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.26, 5, 12), jeansDarkMat);
    shin.position.set(0, -0.52, 0.01);
    pivot.add(shin);

    // --- sneaker: white sole, red body, black accents ---
    const shoe = new THREE.Group();
    shoe.position.set(0, -0.76, 0.06);
    pivot.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), shoeWhiteMat);
    sole.position.set(0, -0.02, 0.02);
    shoe.add(sole);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), shoeRedMat);
    upper.position.set(0, 0.04, 0.0);
    upper.scale.set(1.0, 0.8, 1.5);
    shoe.add(upper);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), shoeWhiteMat);
    toe.position.set(0, 0.0, 0.13);
    toe.scale.set(1.0, 0.7, 0.9);
    shoe.add(toe);
    // black accent stripe
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.08), shoeBlackMat);
    lace.position.set(0, 0.07, -0.02);
    shoe.add(lace);

    legs.push({ pivot });
    return pivot;
  }
  buildLeg(1);
  buildLeg(-1);

  // ==========================================================================
  // FLAME — contract requires it as an empty Group + a dim PointLight.
  // (Trainer/ref have no element aura; engine may still pulse the light.)
  // ==========================================================================
  const flame = new THREE.Group();
  group.add(flame);
  const flameLight = new THREE.PointLight(0xffd9a0, 0.18, 2.0, 2.0);
  flameLight.position.set(0, 1.2, 0.2);
  flame.add(flameLight);

  // ==========================================================================
  // tailGroup — contract requires an (empty) tail root.
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.9, -0.2);
  group.add(tailGroup);

  // ==========================================================================
  // animateExtra — engine handles walk arm/leg swing; we add subtle idle:
  // head glance, weight shift, gentle cap/flag flair.
  // ==========================================================================
  const idle = {
    leftRestZ: leftArm.rotation.z,
    rightRestZ: rightArm.rotation.z,
    headBaseY: head.rotation.y,
  };
  group.userData.animateExtra = (t, dt, state) => {
    const speed = (state && state.speed) || 0;
    const moving = speed > 0.4;

    // subtle head glance (look around when idle, steadier when moving)
    const glance = moving ? 0.04 : 0.16;
    head.rotation.y = idle.headBaseY + Math.sin(t * 0.6) * glance;
    head.rotation.x = Math.sin(t * 0.9 + 1.0) * 0.04;

    // weight shift: tiny torso sway + hip bob when idle
    torsoG.rotation.z = (moving ? 0.0 : Math.sin(t * 0.8) * 0.025);
    torsoG.position.y = (moving ? 0 : Math.sin(t * 1.6) * 0.005);

    // arms breathe a touch when idle (engine overrides with swing while walking)
    if (!moving) {
      leftArm.rotation.z = idle.leftRestZ + Math.sin(t * 1.2) * 0.03;
      rightArm.rotation.z = idle.rightRestZ - Math.sin(t * 1.2) * 0.03;
    }

    // referee: occasionally raise the red flag
    if (flagGroup) {
      // raise roughly every ~6s for ~1s
      const phase = (t % 6) / 6;
      const raise = phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI) : 0;
      rightArm.rotation.x = -raise * 1.3; // lift whole right arm
      if (flagGroup.userData.flagMesh) {
        flagGroup.userData.flagMesh.rotation.z = Math.sin(t * 8) * 0.25 * (0.4 + raise);
      }
    }

    // dim flame light flicker
    flameLight.intensity = 0.16 + Math.sin(t * 3) * 0.03;
  };

  // ==========================================================================
  // Finalize: shadows + rig userData
  // ==========================================================================
  shadowify(group);

  // ensure all body materials carry the requested base emissive baseline
  for (const m of bodyMats) {
    if (P.emissive) {
      m.emissive = new THREE.Color(P.emissive);
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
    }
  }

  group.userData = Object.assign(group.userData || {}, {
    name: P.name,
    element: 'fire', // unused for trainer/ref
    height: 1.7,
    baseY: 0,
    head,
    jaw,
    mouthAnchor,
    mouthGlow,
    tailGroup,
    flame,
    flameLight,
    wings: [],
    bodyMats,
    arms,
    legs,
    // PLAYER throw: expose the right-arm pivot (also present in `arms`).
    throwArm: rightArm,
  });

  return group;
}

// tiny hex helper for canvas fillStyle from a 0xRRGGBB int
function rgb(hex) {
  return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// Public factories
// ---------------------------------------------------------------------------
export function createAsh() {
  return buildTrainer(TRAINER);
}

export function createReferee() {
  return buildTrainer(REFEREE);
}
