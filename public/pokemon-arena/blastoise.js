// ============================================================================
// blastoise.js — procedural Blastoise-style WATER heavyweight for the
// pokemon-arena game. PLAYER character module.
// Self-contained ES module: geometry + canvas textures only, no external
// assets, no top-level await. three@0.160.0.
// Exports: buildBlastoise()
// Orientation: +z forward (nose), +y up, origin at torso center ~1.2 above
// the ground (feet near y = -1.2). Roughly 2.2 units tall, very bulky.
//
// Animation contract (group.userData): head (rot.x ±0.4), jaw (closed local
// y === -0.2 exactly; rot.x 0..0.75; game writes y = -0.2 - open*0.08),
// mouthAnchor + mouthGlow (0x55ccff, intensity 0..18), tailGroup (rot.y ±0.6),
// flame = BACK aura group (twin water cannons + glow + mist; scaled 1..1.8),
// flameLight (0x44bbff ~8/dist 10), wings = [], bodyMats (MEGA recolor),
// arms [left,right] shoulder pivots (rot.x -2.6..+1.0, userData.side -1/+1),
// legs [left,right] hip pivots (rot.x ±0.7 walk, rest 0, userData.side set).
// ============================================================================

import * as THREE from "three";

// ============================================================================
// SECTION 1 — Canvas texture generation
// ============================================================================

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

function canvasTexture(canvas, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Seeded pseudo-random so the hide looks identical every build.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- Blue hide: mottled organic blue with subtle pore speckle + bump -------
function makeHideTextures() {
  const rng = makeRng(90210);
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = "#3f7fc4";
  ctx.fillRect(0, 0, S, S);
  // Large soft mottle blobs, alternating lighter/darker blue
  for (let i = 0; i < 260; i++) {
    const x = rng() * S, y = rng() * S, r = 14 + rng() * 52;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(110,170,225,0.20)" : "rgba(36,82,140,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fine pore speckle for a thick-hide read
  for (let i = 0; i < 2400; i++) {
    const x = rng() * S, y = rng() * S, r = 0.6 + rng() * 1.6;
    ctx.fillStyle = rng() < 0.5 ? "rgba(25,60,105,0.16)" : "rgba(160,205,240,0.10)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Bump map: same statistics in grayscale
  const rng2 = makeRng(90210);
  const [cb, ctb] = makeCanvas(S);
  ctb.fillStyle = "#808080";
  ctb.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rng2() * S, y = rng2() * S, r = 14 + rng2() * 52;
    const g = ctb.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng2() < 0.5 ? "rgba(200,200,200,0.16)" : "rgba(70,70,70,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctb.fillStyle = g;
    ctb.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2400; i++) {
    const x = rng2() * S, y = rng2() * S, r = 0.6 + rng2() * 1.6;
    ctb.fillStyle = rng2() < 0.5 ? "rgba(40,40,40,0.30)" : "rgba(220,220,220,0.18)";
    ctb.beginPath(); ctb.arc(x, y, r, 0, Math.PI * 2); ctb.fill();
  }
  return { map: canvasTexture(c, true), bump: canvasTexture(cb, false) };
}

// ---- Carapace: brown shell with engraved scute plate grid + bump -----------
function makeShellTextures() {
  const rng = makeRng(424242);
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [cb, ctb] = makeCanvas(S);
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(0, 0, S, S);
  ctb.fillStyle = "#909090";
  ctb.fillRect(0, 0, S, S);
  // Weathering mottle on the brown
  for (let i = 0; i < 220; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 44;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(168,116,62,0.20)" : "rgba(92,54,24,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Scute plates: brick-offset rounded rectangles with deep groove lines.
  const pw = 128, ph = 100;
  const plate = (cx2, dark, groove, inset) => {
    for (let row = -1; row * ph < S + ph; row++) {
      const off = (row % 2 === 0) ? 0 : pw * 0.5;
      for (let col = -1; col * pw < S + pw; col++) {
        const x = col * pw + off, y = row * ph;
        const m = 7; // groove half-width
        cx2.lineJoin = "round";
        cx2.lineWidth = m * 2;
        cx2.strokeStyle = groove;
        cx2.strokeRect(x + m, y + m, pw - m * 2, ph - m * 2);
        cx2.lineWidth = 3;
        cx2.strokeStyle = dark;
        cx2.strokeRect(x + m, y + m, pw - m * 2, ph - m * 2);
        // raised-center highlight ring inside each plate
        cx2.lineWidth = 4;
        cx2.strokeStyle = inset;
        cx2.strokeRect(x + m + 12, y + m + 10, pw - m * 2 - 24, ph - m * 2 - 20);
      }
    }
  };
  plate(ctx, "rgba(58,32,12,0.85)", "rgba(74,44,18,0.55)", "rgba(186,132,76,0.30)");
  plate(ctb, "rgba(20,20,20,0.9)", "rgba(45,45,45,0.7)", "rgba(225,225,225,0.4)");
  // Subtle scratch lines across plates
  for (let i = 0; i < 70; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI, l = 8 + rng() * 30;
    ctx.strokeStyle = "rgba(60,34,14,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return { map: canvasTexture(c, true), bump: canvasTexture(cb, false) };
}

// ---- Plastron: lighter cream belly with horizontal plate striations --------
function makePlastronTextures() {
  const rng = makeRng(777);
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [cb, ctb] = makeCanvas(S);
  ctx.fillStyle = "#e9d9a6";
  ctx.fillRect(0, 0, S, S);
  ctb.fillStyle = "#9a9a9a";
  ctb.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 36;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(255,246,214,0.22)" : "rgba(190,164,110,0.20)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Horizontal plate striations: bold seam + soft shadow under each seam.
  // hline draws one full-width stroke on a context.
  const hline = (cx2, y, style, w) => {
    cx2.strokeStyle = style;
    cx2.lineWidth = w;
    cx2.beginPath();
    cx2.moveTo(0, y); cx2.lineTo(S, y);
    cx2.stroke();
  };
  for (let y = 38; y < S; y += 86) {
    const grad = ctx.createLinearGradient(0, y, 0, y + 16);
    grad.addColorStop(0, "rgba(132,102,52,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, S, 16);
    hline(ctx, y, "rgba(96,70,32,0.8)", 4);
    hline(ctx, y - 3, "rgba(255,248,222,0.5)", 2);
    hline(ctb, y, "rgba(30,30,30,0.9)", 5);       // bump groove
    hline(ctb, y - 4, "rgba(230,230,230,0.6)", 2); // bump ridge
  }
  return { map: canvasTexture(c, true), bump: canvasTexture(cb, false) };
}

// ---- Soft radial glow (sprite) ----------------------------------------------
function makeGlowTexture() {
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(190,235,255,0.85)");
  g.addColorStop(0.6, "rgba(90,180,255,0.30)");
  g.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c, true);
}

// ---- Wispy mist puff (sprite) ------------------------------------------------
function makeMistTexture() {
  const rng = makeRng(5150);
  const [c, ctx] = makeCanvas(128);
  for (let i = 0; i < 14; i++) {
    const x = 30 + rng() * 68, y = 30 + rng() * 68, r = 14 + rng() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(225,245,255,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return canvasTexture(c, true);
}

// ============================================================================
// SECTION 2 — Primitive helpers
// ============================================================================

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function sph(mat, r, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 22), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

// Tapered capsule limb between two joints: cylinder + sphere caps.
function bone(mat, a, b, r1, r2) {
  const g = new THREE.Group();
  const dir = b.clone().sub(a);
  const len = dir.length();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 20, 1), mat);
  cyl.position.copy(a).addScaledVector(dir, 0.5);
  cyl.quaternion.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
  const capA = new THREE.Mesh(new THREE.SphereGeometry(r1, 20, 16), mat);
  capA.position.copy(a);
  const capB = new THREE.Mesh(new THREE.SphereGeometry(r2, 20, 16), mat);
  capB.position.copy(b);
  g.add(cyl, capA, capB);
  return g;
}

// Cone spike from pos along dir, base radius r, length len.
function spike(mat, pos, dir, r, len) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 14), mat);
  const d = dir.clone().normalize();
  m.position.copy(pos).addScaledVector(d, len * 0.5);
  m.quaternion.setFromUnitVectors(Y_AXIS, d);
  return m;
}

// ============================================================================
// SECTION 3 — Water cannon (one barrel of the shoulder pair)
// ============================================================================

function buildCannon(side, mats) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3(side * 0.14, 0.36, 1).normalize(); // forward+up
  const LEN = 0.92;
  const muzzle = dir.clone().multiplyScalar(LEN);

  // Housing collar where the barrel emerges from the shell
  const housing = sph(mats.gunmetalDark, 0.20, 1.0, 1.0, 0.9);
  housing.position.copy(dir).multiplyScalar(0.06);
  g.add(housing);

  // Main barrel: slight taper toward the muzzle
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.155, LEN, 26, 1), mats.gunmetal);
  barrel.position.copy(dir).multiplyScalar(LEN * 0.5);
  barrel.quaternion.setFromUnitVectors(Y_AXIS, dir);
  g.add(barrel);

  // Mid reinforcement band
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.020, 12, 30), mats.gunmetalDark);
  band.position.copy(dir).multiplyScalar(LEN * 0.55);
  band.quaternion.setFromUnitVectors(Z_AXIS, dir);
  g.add(band);

  // Ringed muzzle rim: heavy outer ring + thin lip ring
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.032, 14, 32), mats.gunmetalDark);
  rim.position.copy(muzzle);
  rim.quaternion.setFromUnitVectors(Z_AXIS, dir);
  g.add(rim);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 10, 28), mats.gunmetal);
  lip.position.copy(muzzle).addScaledVector(dir, 0.028);
  lip.quaternion.setFromUnitVectors(Z_AXIS, dir);
  g.add(lip);

  // Dark bore sleeve + faint cyan emissive inner disc (blooms in-game)
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.10, 24, 1, true), mats.boreMat);
  bore.position.copy(muzzle).addScaledVector(dir, -0.04);
  bore.quaternion.setFromUnitVectors(Y_AXIS, dir);
  bore.userData.noShadow = true;
  g.add(bore);
  const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.092, 26), mats.coreGlow);
  innerDisc.position.copy(muzzle).addScaledVector(dir, -0.075);
  innerDisc.quaternion.setFromUnitVectors(Z_AXIS, dir);
  innerDisc.userData.noShadow = true;
  g.add(innerDisc);

  // Occasional water-drip detail: tiny translucent droplets around the muzzle
  const rng = makeRng(side > 0 ? 1234 : 5678);
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const drop = sph(mats.dripMat, 0.016 + rng() * 0.012, 1, 1.45, 1);
    drop.position.copy(muzzle)
      .addScaledVector(dir, -0.02 - rng() * 0.05)
      .add(new THREE.Vector3(Math.cos(a) * 0.13, Math.sin(a) * 0.13 - 0.05, 0));
    drop.userData.noShadow = true;
    g.add(drop);
  }

  // Per-cannon mist wisp drifting off the muzzle
  const mist = new THREE.Sprite(mats.mistMat);
  mist.scale.set(0.55, 0.55, 1);
  mist.position.copy(muzzle).addScaledVector(dir, 0.10);
  mist.userData.noShadow = true;
  g.add(mist);
  return g;
}

// ============================================================================
// SECTION 4 — Main build
// ============================================================================

export function buildBlastoise() {
  const root = new THREE.Group();
  root.name = "blastoise";

  // ---- Materials -------------------------------------------------------------
  const hideTex = makeHideTextures();
  const shellTex = makeShellTextures();
  const plastronTex = makePlastronTextures();

  const hideMat = new THREE.MeshStandardMaterial({
    color: 0x4f8fd0, map: hideTex.map, bumpMap: hideTex.bump,
    bumpScale: 0.9, roughness: 0.62, metalness: 0.04,
  });
  const hideDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3a72ad, map: hideTex.map, bumpMap: hideTex.bump,
    bumpScale: 0.9, roughness: 0.66, metalness: 0.04,
  });
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xa97a48, map: shellTex.map, bumpMap: shellTex.bump,
    bumpScale: 1.4, roughness: 0.74, metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xf2e6c2, roughness: 0.6, metalness: 0.02,
    bumpMap: plastronTex.bump, bumpScale: 0.5,
  });
  const plastronMat = new THREE.MeshStandardMaterial({
    color: 0xf0e0ae, map: plastronTex.map, bumpMap: plastronTex.bump,
    bumpScale: 1.0, roughness: 0.58, metalness: 0.02,
  });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.35, metalness: 0.05 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfdfdf8, roughness: 0.25 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.25 }); // brown eyes
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0b0805, roughness: 0.3 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x431c26, roughness: 0.85 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xc25a6e, roughness: 0.65 });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x16314f, roughness: 0.8 });

  const cannonMats = {
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x5d6670, metalness: 0.6, roughness: 0.3 }),
    gunmetalDark: new THREE.MeshStandardMaterial({ color: 0x3c434c, metalness: 0.62, roughness: 0.34 }),
    boreMat: new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.9, side: THREE.DoubleSide }),
    coreGlow: new THREE.MeshStandardMaterial({
      color: 0x081018, emissive: 0x55ccff, emissiveIntensity: 2.4, roughness: 1,
    }),
    dripMat: new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ff, transparent: true, opacity: 0.5,
      roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    }),
    mistMat: new THREE.SpriteMaterial({
      map: makeMistTexture(), color: 0xbfe9ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    }),
  };

  // ---- Torso core: thick blue hide barrel ------------------------------------
  const torso = sph(hideMat, 0.66, 0.98, 1.06, 0.92);
  torso.position.set(0, 0.02, 0.10);
  root.add(torso);
  // Belly plastron: lighter cream front shield with horizontal striations
  const plastron = sph(plastronMat, 0.60, 0.88, 1.04, 0.62);
  plastron.position.set(0, -0.04, 0.40);
  root.add(plastron);

  // ---- Carapace: big rounded brown shell + cream rim band --------------------
  const carapace = sph(shellMat, 0.84, 1.0, 1.04, 0.80);
  carapace.position.set(0, 0.06, -0.26);
  root.add(carapace);
  // Cream rim band ringing the shell edge, tilted slightly forward at the top
  const rimBand = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.105, 16, 44), rimMat);
  rimBand.position.set(0, 0.05, 0.16);
  rimBand.rotation.x = 0.10;
  rimBand.scale.set(1.0, 1.1, 1.0);
  root.add(rimBand);

  // ---- Neck: short, thick, slightly forward ----------------------------------
  const neck = bone(hideMat,
    new THREE.Vector3(0, 0.55, 0.45), new THREE.Vector3(0, 0.82, 0.78), 0.26, 0.21);
  root.add(neck);
  // Cream throat wedge under the chin line
  const throat = sph(plastronMat, 0.17, 0.85, 1.1, 0.9);
  throat.position.set(0, 0.68, 0.72);
  root.add(throat);

  // ---- Head (game pitches head.rotation.x in [-0.4, 0.4]) ---------------------
  const head = new THREE.Group();
  head.position.set(0, 0.85, 0.95);
  root.add(head);

  const skull = sph(hideMat, 0.295, 1.08, 0.96, 1.04);
  skull.position.set(0, 0.05, 0.0);
  head.add(skull);
  const muzzleMass = sph(hideMat, 0.205, 1.05, 0.66, 1.3);
  muzzleMass.position.set(0, -0.045, 0.235);
  head.add(muzzleMass);
  // Dark mouth interior, revealed when the jaw drops
  const palate = sph(mouthMat, 0.185, 1.0, 0.56, 1.26);
  palate.position.set(0, -0.065, 0.235);
  palate.userData.noShadow = true;
  head.add(palate);

  // Heavy brow ridges for the determined veteran look
  for (const s of [1, -1]) {
    const brow = sph(hideDarkMat, 0.095, 1.6, 0.42, 1.0);
    brow.position.set(s * 0.155, 0.175, 0.205);
    brow.rotation.z = -s * 0.30;
    brow.rotation.x = -0.10;
    head.add(brow);
  }

  // Eyes: sclera + brown iris + pupil + specular glint
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.185, 0.10, 0.20);
    eye.rotation.y = s * 0.85; // local +z looks outward/forward
    eye.rotation.x = -0.06;
    const sclera = sph(scleraMat, 0.062, 1, 1, 0.8);
    sclera.userData.noShadow = true;
    const iris = sph(irisMat, 0.038, 1, 1, 0.55);
    iris.position.z = 0.040;
    const pupil = sph(pupilMat, 0.020, 1, 1, 0.5);
    pupil.position.z = 0.056;
    const glint = sph(glintMat, 0.0095, 1, 1, 1);
    glint.position.set(0.013, 0.015, 0.063);
    glint.userData.noShadow = true;
    eye.add(sclera, iris, pupil, glint);
    head.add(eye);
  }

  // Nostrils on the blunt snout
  for (const s of [1, -1]) {
    const n = sph(nostrilMat, 0.018, 1, 0.75, 1.1);
    n.position.set(s * 0.055, 0.035, 0.50);
    n.userData.noShadow = true;
    head.add(n);
  }

  // Ear nubs: small rounded bumps high on the skull sides
  for (const s of [1, -1]) {
    const ear = sph(hideDarkMat, 0.062, 0.85, 1.25, 0.8);
    ear.position.set(s * 0.225, 0.295, -0.04);
    ear.rotation.z = -s * 0.35;
    head.add(ear);
  }

  // Small white fang nubs hanging from the upper lip (visible on jaw open)
  for (const [z, x, len] of [[0.40, 0.115, 0.052], [0.46, 0.055, 0.044]]) {
    for (const s of [1, -1]) {
      const fang = spike(clawMat,
        new THREE.Vector3(s * x, -0.095, z), new THREE.Vector3(0, -1, 0.12), 0.014, len);
      fang.userData.noShadow = true;
      head.add(fang);
    }
  }

  // ---- Jaw: CLOSED local position.y MUST be exactly -0.2 ----------------------
  // Game: jaw.rotation.x in [0, 0.75], jaw.position.y = -0.2 - open * 0.08.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.06); // hinge pivot, y = -0.2 exactly when closed
  head.add(jaw);
  const mandible = sph(hideMat, 0.175, 1.0, 0.46, 1.45);
  mandible.position.set(0, 0.045, 0.21);
  jaw.add(mandible);
  const chinPlate = sph(plastronMat, 0.145, 0.95, 0.40, 1.38);
  chinPlate.position.set(0, 0.012, 0.215);
  jaw.add(chinPlate);
  const tongue = sph(tongueMat, 0.115, 0.85, 0.30, 1.25);
  tongue.position.set(0, 0.095, 0.20);
  tongue.userData.noShadow = true;
  jaw.add(tongue);
  // Tiny lower fang nubs pointing up
  for (const s of [1, -1]) {
    const t = spike(clawMat,
      new THREE.Vector3(s * 0.085, 0.105, 0.33), new THREE.Vector3(0, 1, 0.1), 0.012, 0.036);
    t.userData.noShadow = true;
    jaw.add(t);
  }

  // ---- Mouth anchor + cool cyan glow (hydro-blast origin) ---------------------
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.10, 0.56); // mouth front
  head.add(mouthAnchor);
  const mouthGlow = new THREE.PointLight(0x55ccff, 0, 6, 2); // game: 0..18
  mouthAnchor.add(mouthGlow);

  // ---- Stubby curled tail (game yaws tailGroup.rotation.y ±0.6) ---------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.42, -0.78);
  root.add(tailGroup);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.02),
    new THREE.Vector3(0, -0.06, -0.22),
    new THREE.Vector3(0.10, -0.04, -0.40),
    new THREE.Vector3(0.26, 0.05, -0.46),
    new THREE.Vector3(0.34, 0.16, -0.36),
  ]);
  const TAIL_N = 9;
  for (let i = 0; i < TAIL_N; i++) {
    const t = i / (TAIL_N - 1);
    const p = tailCurve.getPoint(t);
    const tan = tailCurve.getTangent(t);
    const r = 0.155 * (1 - t) + 0.045 * t;
    const seg = sph(hideMat, r, 1, 1, 1.35);
    seg.position.copy(p);
    seg.quaternion.setFromUnitVectors(Z_AXIS, tan);
    tailGroup.add(seg);
  }

  // ---- Element aura "flame": twin shoulder WATER CANNONS + glow + mist --------
  // Mounted at the BACK on top of the carapace; the game scales it 1..1.8.
  const flame = new THREE.Group();
  flame.position.set(0, 0.46, -0.42);
  root.add(flame);
  for (const s of [1, -1]) {
    const cannon = buildCannon(s, cannonMats);
    cannon.position.set(s * 0.42, 0.10, 0.05);
    flame.add(cannon);
  }
  // Soft additive cyan aura sprite between the barrels
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0x66ccff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
  }));
  glowSprite.scale.set(1.5, 1.5, 1);
  glowSprite.position.set(0, 0.32, 0.15);
  glowSprite.userData.noShadow = true;
  flame.add(glowSprite);
  // Gentle ambient mist hanging over the shell
  const mistBack = new THREE.Sprite(cannonMats.mistMat.clone());
  mistBack.material.opacity = 0.35;
  mistBack.scale.set(1.2, 0.8, 1);
  mistBack.position.set(0, 0.42, -0.12);
  mistBack.userData.noShadow = true;
  flame.add(mistBack);
  // Aura light (game reads/boosts this)
  const flameLight = new THREE.PointLight(0x44bbff, 8, 10, 2);
  flameLight.position.set(0, 0.30, 0.2);
  flame.add(flameLight);

  // ---- Burly arms: pivot at the shoulder (rotation.x in [-2.6, +1.0]) ---------
  // Rest pose: hanging down, slightly out and forward — at rotation 0.
  const arms = [];
  for (const s of [1, -1]) {
    const shoulderPad = sph(hideMat, 0.245, 1.05, 0.95, 1.0);
    shoulderPad.position.set(s * 0.72, 0.30, 0.16);
    root.add(shoulderPad);
    const shoulder = new THREE.Vector3(s * 0.78, 0.26, 0.16);
    const armGroup = new THREE.Group();
    armGroup.name = s === 1 ? "armRight" : "armLeft";
    armGroup.position.copy(shoulder); // pivot exactly at the shoulder joint
    armGroup.userData.side = s;       // -1 left (-x), +1 right (+x)
    root.add(armGroup);
    // Joints local to the shoulder pivot (world pose unchanged at rotation 0)
    const elbowL = new THREE.Vector3(s * 0.94, -0.18, 0.26).sub(shoulder);
    const wristL = new THREE.Vector3(s * 0.92, -0.58, 0.40).sub(shoulder);
    armGroup.add(bone(hideMat, new THREE.Vector3(0, 0, 0), elbowL, 0.185, 0.150));
    armGroup.add(bone(hideMat, elbowL, wristL, 0.150, 0.125));
    // Mitt-like fist
    const hand = sph(hideDarkMat, 0.150, 1.05, 0.85, 1.15);
    hand.position.copy(wristL).add(new THREE.Vector3(0, -0.05, 0.05));
    armGroup.add(hand);
    // Three stubby white claws raking forward-down
    for (const a of [-0.42, 0, 0.42]) {
      armGroup.add(spike(clawMat,
        wristL.clone().add(new THREE.Vector3(s * a * 0.26, -0.10, 0.13)),
        new THREE.Vector3(s * a * 0.5, -0.55, 1), 0.040, 0.155));
    }
    arms.push(armGroup);
  }
  arms.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // ---- Thick legs: pivot at the hip (rotation.x ±0.7 walk swing) --------------
  const legs = [];
  for (const s of [1, -1]) {
    const haunch = sph(hideMat, 0.27, 1.0, 1.05, 1.05);
    haunch.position.set(s * 0.42, -0.52, 0.02);
    root.add(haunch);
    const hip = new THREE.Vector3(s * 0.42, -0.55, 0.02);
    const legGroup = new THREE.Group();
    legGroup.name = s === 1 ? "legRight" : "legLeft";
    legGroup.position.copy(hip);     // pivot exactly at the hip joint
    legGroup.userData.side = s;      // -1 left (-x), +1 right (+x)
    root.add(legGroup);
    // Joints local to the hip pivot
    const kneeL = new THREE.Vector3(s * 0.46, -0.86, 0.08).sub(hip);
    const ankleL = new THREE.Vector3(s * 0.46, -1.10, 0.02).sub(hip);
    legGroup.add(bone(hideMat, new THREE.Vector3(0, 0, 0), kneeL, 0.20, 0.165));
    legGroup.add(bone(hideMat, kneeL, ankleL, 0.165, 0.145));
    // Broad flat foot planted near y = -1.2, toes forward
    const foot = sph(hideDarkMat, 0.165, 1.25, 0.55, 1.6);
    foot.position.copy(ankleL).add(new THREE.Vector3(0, -0.055, 0.13));
    legGroup.add(foot);
    // Three white toe claws fanning forward
    for (const a of [-0.4, 0, 0.4]) {
      legGroup.add(spike(clawMat,
        ankleL.clone().add(new THREE.Vector3(s * a * 0.32, -0.085, 0.32)),
        new THREE.Vector3(s * a * 0.55, -0.18, 1), 0.042, 0.14));
    }
    legs.push(legGroup);
  }
  legs.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // ---- Shadows -----------------------------------------------------------------
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---- Animation contract --------------------------------------------------------
  root.userData.head = head;
  root.userData.jaw = jaw;
  root.userData.mouthAnchor = mouthAnchor;
  root.userData.mouthGlow = mouthGlow;
  root.userData.tailGroup = tailGroup;
  root.userData.flame = flame;
  root.userData.flameLight = flameLight;
  root.userData.wings = [];                 // water-jet hover, no wings
  root.userData.bodyMats = [hideMat, hideDarkMat];
  root.userData.arms = arms;                // [left, right], pivot = shoulder
  root.userData.legs = legs;                // [left, right], pivot = hip

  return root;
}
