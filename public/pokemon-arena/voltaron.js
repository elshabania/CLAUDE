// ============================================================================
// voltaron.js — VOLTARON, a procedural Raichu-meets-dragon ELECTRIC player
// character for the pokemon-arena game.
// Self-contained ES module: geometry + canvas textures only, no external
// assets, no top-level await. three@0.160.0.
// Exports: buildVoltaron()
// Orientation: +z forward (snout), +y up, origin at torso center ~1.15 above
// the ground (feet rest near y = -1.15). Lean, agile, ~2 units tall.
// ============================================================================

import * as THREE from "three";

// ----------------------------------------------------------------------------
// SECTION 1 — canvas helpers + seeded rng
// ----------------------------------------------------------------------------

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

// Seeded pseudo-random so the pelt looks identical every build.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// SECTION 2 — fur painting (soft dappled strands over a dappled base)
// ----------------------------------------------------------------------------

function paintFur(ctx, size, base, dappleHi, dappleLo, strandHi, strandLo, rng) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // soft dappled mottling so big surfaces never look flat
  const dapples = Math.floor(size * 0.43);
  for (let i = 0; i < dapples; i++) {
    const x = rng() * size, y = rng() * size, r = (14 + rng() * 52) * (size / 512);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? dappleHi : dappleLo);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // thousands of short, curved fur strands following a directional flow field —
  // strokes sweep down and around like pelt growth over musculature
  ctx.lineCap = "round";
  const strands = Math.floor((size * size) / 112);
  for (let i = 0; i < strands; i++) {
    const x = rng() * size, y = rng() * size;
    const len = (6 + rng() * 13) * (0.6 + size / 1280);
    // flow field: strands part around the spine line and ripple along height
    const flow = Math.sin((x / size) * Math.PI * 2) * 0.5
               + Math.cos((y / size) * Math.PI * 3) * 0.28;
    const ang = Math.PI / 2 + flow + (rng() - 0.5) * 0.5;
    const bow = (rng() - 0.5) * 7; // sideways belly of the curve
    const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
    ctx.strokeStyle = rng() < 0.5 ? strandHi : strandLo;
    ctx.lineWidth = 0.7 + rng() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + px * bow,
      y + Math.sin(ang) * len * 0.5 + py * bow,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

// Golden-yellow body fur, 1024px (color map + matching grayscale bump).
function makeBodyFurTextures() {
  const [c, ctx] = makeCanvas(1024);
  paintFur(ctx, 1024, "#f2b21e",
    "rgba(255,214,90,0.14)", "rgba(170,105,12,0.14)",
    "rgba(255,228,130,0.32)", "rgba(146,88,10,0.28)", makeRng(60601));
  const map = canvasTexture(c, true);
  const [cb, ctxb] = makeCanvas(1024);
  paintFur(ctxb, 1024, "#808080",
    "rgba(210,210,210,0.12)", "rgba(70,70,70,0.12)",
    "rgba(240,240,240,0.50)", "rgba(30,30,30,0.46)", makeRng(60601));
  const bump = canvasTexture(cb, false);
  return { map, bump };
}

// Lighter cream-gold chest ruff fur (brighter, fluffier strands).
function makeRuffTextures() {
  const [c, ctx] = makeCanvas(512);
  paintFur(ctx, 512, "#fff0bc",
    "rgba(255,250,222,0.18)", "rgba(214,168,80,0.13)",
    "rgba(255,253,236,0.38)", "rgba(190,142,58,0.24)", makeRng(70707));
  const map = canvasTexture(c, true);
  const [cb, ctxb] = makeCanvas(512);
  paintFur(ctxb, 512, "#8a8a8a",
    "rgba(225,225,225,0.13)", "rgba(85,85,85,0.13)",
    "rgba(245,245,245,0.46)", "rgba(40,40,40,0.42)", makeRng(70707));
  const bump = canvasTexture(cb, false);
  return { map, bump };
}

// Radial spark glow for the additive aura sprite at the tail tip.
function makeSparkGlowTexture() {
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,242,150,0.95)");
  g.addColorStop(0.55, "rgba(255,210,60,0.40)");
  g.addColorStop(1.0, "rgba(255,190,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c, true);
}

// ----------------------------------------------------------------------------
// SECTION 3 — small build helpers
// ----------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

// Tapered cylinder spanning two local-space points (root radius r0 -> r1).
function limb(a, b, r0, r1, mat, segs = 10) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, segs), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

function ball(r, mat, sx = 1, sy = 1, sz = 1, w = 18, h = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

// A small claw cone pointing along +z.
function claw(len, r, mat) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, len, 8), mat);
  mesh.rotation.x = Math.PI / 2; // cone tip (+y) -> +z
  return mesh;
}

// One jagged electric arc: a zigzag chain of thin cylinders radiating from the
// spark core outward, like frozen static electricity.
function makeArc(rng, mat, kinks = 3) {
  const group = new THREE.Group();
  const pts = [new THREE.Vector3((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05)];
  const heading = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
  for (let i = 0; i < kinks; i++) {
    const step = heading.clone()
      .addScaledVector(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5), 1.1)
      .normalize().multiplyScalar(0.07 + rng() * 0.06);
    pts.push(pts[pts.length - 1].clone().add(step));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = limb(pts[i], pts[i + 1], 0.009, 0.006, mat, 5);
    seg.userData.noShadow = true;
    group.add(seg);
  }
  return group;
}

// ----------------------------------------------------------------------------
// SECTION 4 — buildVoltaron
// ----------------------------------------------------------------------------

export function buildVoltaron() {
  const root = new THREE.Group();
  root.name = "voltaron";
  const rng = makeRng(20260612);

  // --- materials ------------------------------------------------------------
  const bodyTex = makeBodyFurTextures();
  const furMat = new THREE.MeshStandardMaterial({
    map: bodyTex.map, bumpMap: bodyTex.bump, bumpScale: 0.9,
    color: 0xffd23c, roughness: 0.88, metalness: 0.04,
  });
  const ruffTex = makeRuffTextures();
  const ruffMat = new THREE.MeshStandardMaterial({
    map: ruffTex.map, bumpMap: ruffTex.bump, bumpScale: 0.85,
    color: 0xfff0bc, roughness: 0.92, metalness: 0.02,
  });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xfdf0c8, roughness: 0.85 });
  const brownMat = new THREE.MeshStandardMaterial({ color: 0x6e4218, roughness: 0.92 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.7 });
  const innerEarMat = new THREE.MeshStandardMaterial({
    color: 0xffd84e, roughness: 0.85, emissive: 0x553f00, emissiveIntensity: 0.25,
  });
  const cheekMat = new THREE.MeshStandardMaterial({
    color: 0xff3a22, emissive: 0xff2e08, emissiveIntensity: 2.4, roughness: 0.45,
  });
  const cheekHaloMat = new THREE.MeshStandardMaterial({
    color: 0xff5530, emissive: 0xff4412, emissiveIntensity: 1.2, roughness: 0.6,
    transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x100b04, roughness: 0.18, metalness: 0.25,
  });
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x2a8cff, emissive: 0x3fb8ff, emissiveIntensity: 1.3, roughness: 0.3,
  });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5e1717, roughness: 0.8 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xd4536a, roughness: 0.7 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfdfaf0, roughness: 0.35 });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.4 });
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0xc9a32e, emissive: 0xffe85a, emissiveIntensity: 1.6, roughness: 0.5,
  });
  const chevronEdgeMat = new THREE.MeshStandardMaterial({ color: 0x2c1604, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd9a823, metalness: 0.85, roughness: 0.28,
    emissive: 0xffcf3e, emissiveIntensity: 0.9,
  });
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xfff8c8 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // --- torso: lean, agile, leaning slightly into a sprinter's crouch --------
  const torso = new THREE.Group();
  root.add(torso);
  const chest = ball(0.46, furMat, 0.74, 1.22, 0.9);
  chest.rotation.x = 0.18; // forward lean
  torso.add(chest);
  const hips = ball(0.36, furMat, 0.84, 0.9, 0.95);
  hips.position.set(0, -0.46, -0.06);
  torso.add(hips);
  // lighter chest ruff — three overlapping flattened tufts give a fluffy,
  // broken silhouette instead of one smooth plate
  const ruff = ball(0.32, ruffMat, 0.86, 1.05, 0.55);
  ruff.position.set(0, 0.16, 0.3);
  ruff.rotation.x = 0.22;
  torso.add(ruff);
  for (const s of [-1, 1]) {
    const tuft = ball(0.24, ruffMat, 0.78, 0.92, 0.5);
    tuft.position.set(s * 0.17, 0.04, 0.33);
    tuft.rotation.set(0.3, s * 0.25, s * -0.5); // flared collar lobes
    torso.add(tuft);
  }
  const belly = ball(0.26, ruffMat, 0.8, 1.0, 0.55);
  belly.position.set(0, -0.28, 0.22);
  torso.add(belly);

  // brown back stripes — two flattened chevron patches hugging the spine,
  // each bar backed by a slightly larger near-black plate for a crisp outline
  for (let i = 0; i < 2; i++) {
    const y = 0.34 - i * 0.34, z = -0.385 - i * 0.015;
    for (const s of [-1, 1]) {
      const outline = new THREE.Mesh(new THREE.BoxGeometry(0.305, 0.135, 0.04), chevronEdgeMat);
      outline.position.set(s * 0.115, y + 0.04, z - 0.012);
      outline.rotation.set(0.28, s * 0.22, s * 0.65);
      torso.add(outline);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.05), brownMat);
      bar.position.set(s * 0.115, y + 0.04, z);
      bar.rotation.set(0.28, s * 0.22, s * 0.65); // arms of a V meeting low
      torso.add(bar);
    }
  }

  // faint emissive yellow seams running down the spine (pulse-worthy)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.025), seamMat);
    seam.position.set(0, 0.5 - t * 1.06, -0.36 - Math.sin(t * Math.PI) * 0.07);
    seam.rotation.x = (t - 0.5) * 0.9;
    seam.userData.noShadow = true;
    torso.add(seam);
  }

  // --- neck -----------------------------------------------------------------
  const neck = limb(new THREE.Vector3(0, 0.42, 0.28), new THREE.Vector3(0, 0.86, 0.92),
    0.19, 0.15, furMat, 12);
  root.add(neck);

  // --- head (contract: group around (0, 0.9, 1.0)) ---------------------------
  const head = new THREE.Group();
  head.position.set(0, 0.9, 1.0);
  root.add(head);

  const skull = ball(0.27, furMat, 1.04, 0.96, 1.0);
  skull.position.y = 0.02;
  head.add(skull);

  // cream muzzle + nose
  const muzzle = ball(0.155, creamMat, 0.95, 0.62, 1.45);
  muzzle.position.set(0, -0.07, 0.25);
  head.add(muzzle);
  const nose = ball(0.034, blackMat, 1.1, 0.8, 0.9, 10, 8);
  nose.position.set(0, -0.015, 0.47);
  head.add(nose);

  // upper teeth (visible fangs when the jaw drops)
  for (const [x, z] of [[-0.075, 0.33], [-0.028, 0.38], [0.028, 0.38], [0.075, 0.33]]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), toothMat);
    tooth.rotation.x = Math.PI; // tip down
    tooth.position.set(x, -0.155, z);
    tooth.userData.noShadow = true;
    head.add(tooth);
  }
  // dark palate so the open mouth has depth
  const palate = ball(0.11, mouthMat, 0.95, 0.4, 1.4, 12, 8);
  palate.position.set(0, -0.13, 0.24);
  palate.userData.noShadow = true;
  head.add(palate);

  // --- jaw (contract: CLOSED local position.y is exactly -0.2) ---------------
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.06); // hinge sits behind the chin; y MUST be -0.2
  head.add(jaw);
  const lowerJaw = ball(0.115, creamMat, 1.05, 0.42, 1.65, 14, 10);
  lowerJaw.position.set(0, 0.01, 0.16);
  jaw.add(lowerJaw);
  const tongue = ball(0.06, tongueMat, 1.0, 0.35, 1.7, 10, 8);
  tongue.position.set(0, 0.045, 0.13);
  tongue.userData.noShadow = true;
  jaw.add(tongue);
  for (const s of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 6), toothMat);
    fang.position.set(s * 0.062, 0.055, 0.3);
    fang.userData.noShadow = true;
    jaw.add(fang);
  }

  // --- mouth anchor + glow (projectile spawn point) ---------------------------
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.12, 0.5); // front of the muzzle
  head.add(mouthAnchor);
  const mouthGlow = new THREE.PointLight(0xffee44, 0, 7);
  mouthAnchor.add(mouthGlow);

  // --- fierce dark eyes with glints + brow ridges -----------------------------
  for (const s of [-1, 1]) {
    const eye = ball(0.056, eyeMat, 1, 1.15, 0.8, 14, 10);
    eye.position.set(s * 0.135, 0.075, 0.205);
    eye.rotation.y = s * 0.35;
    eye.userData.noShadow = true;
    head.add(eye);
    // electric-blue iris ring hugging the dark pupil
    const iris = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.011, 8, 20), irisMat);
    iris.position.set(s * 0.151, 0.078, 0.245);
    iris.rotation.y = s * 0.38;
    iris.userData.noShadow = true;
    head.add(iris);
    // double glint: bright key catchlight high, smaller bounce glint low-opposite
    const glint = ball(0.015, glintMat, 1, 1, 1, 8, 6);
    glint.position.set(s * 0.155, 0.105, 0.245);
    glint.userData.noShadow = true;
    head.add(glint);
    const glint2 = ball(0.0075, glintMat, 1, 1, 1, 8, 6);
    glint2.position.set(s * 0.128, 0.052, 0.248);
    glint2.userData.noShadow = true;
    head.add(glint2);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.06), furMat);
    brow.position.set(s * 0.135, 0.145, 0.2);
    brow.rotation.set(-0.15, 0, s * -0.42); // angled-down scowl
    head.add(brow);
  }

  // --- round electric-red cheek pods: layered double-emissive so they BLOOM ---
  // inner core burns at 2.4; a translucent additive halo shell at 1.2 wraps it
  for (const s of [-1, 1]) {
    const pod = ball(0.1, cheekMat, 0.55, 1, 1, 14, 10);
    pod.position.set(s * 0.235, -0.055, 0.1);
    pod.rotation.y = s * 0.2;
    pod.userData.noShadow = true;
    head.add(pod);
    const halo = ball(0.125, cheekHaloMat, 0.55, 1, 1, 14, 10);
    halo.position.set(s * 0.237, -0.055, 0.1);
    halo.rotation.y = s * 0.2;
    halo.userData.noShadow = true;
    head.add(halo);
  }

  // --- long pointed ears: black tips, yellow inner -----------------------------
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.14, 0.2, -0.05);
    ear.rotation.set(-0.62, 0, s * -0.38); // swept back and outward
    head.add(ear);
    const shell = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.52, 10), furMat);
    shell.position.y = 0.26;
    ear.add(shell);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 10), blackMat);
    tip.position.y = 0.46;
    ear.add(tip);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.34, 8), innerEarMat);
    inner.position.set(0, 0.21, 0.045);
    inner.scale.z = 0.38;
    inner.userData.noShadow = true;
    ear.add(inner);
  }

  // --- whisker quills: thin stiff cylinders off the muzzle ----------------------
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.2, 5), blackMat);
      quill.position.set(s * 0.165, -0.05 + i * 0.028, 0.27);
      quill.rotation.set((i - 1) * 0.28, s * -0.35, s * (1.42 - i * 0.12));
      quill.userData.noShadow = true;
      head.add(quill);
    }
  }

  // --- arms: shoulder pivots, slashing strikers --------------------------------
  const arms = [];
  for (const s of [-1, 1]) {
    const armGroup = new THREE.Group();
    armGroup.position.set(s * 0.42, 0.34, 0.14); // shoulder pivot
    armGroup.userData.side = s; // -1 left (-x), +1 right (+x)
    root.add(armGroup);

    armGroup.add(ball(0.135, furMat, 1, 1, 1, 14, 10)); // shoulder ball
    const elbow = new THREE.Vector3(s * 0.09, -0.34, 0.05);
    const wrist = new THREE.Vector3(s * 0.1, -0.6, 0.16);
    armGroup.add(limb(new THREE.Vector3(0, 0, 0), elbow, 0.095, 0.075, furMat));
    const elbowBall = ball(0.078, furMat, 1, 1, 1, 12, 8);
    elbowBall.position.copy(elbow);
    armGroup.add(elbowBall);
    armGroup.add(limb(elbow, wrist, 0.07, 0.055, furMat));

    const hand = ball(0.095, creamMat, 1.05, 0.72, 1.25, 12, 8);
    hand.position.copy(wrist).add(new THREE.Vector3(0, -0.05, 0.05));
    armGroup.add(hand);
    for (let i = -1; i <= 1; i++) {
      const c = claw(0.11, 0.024, clawMat);
      c.position.set(wrist.x + i * 0.05, wrist.y - 0.06, wrist.z + 0.16);
      c.rotation.y = i * 0.3;
      armGroup.add(c);
    }
    arms.push(armGroup);
  }
  arms.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // --- legs: strong digitigrade runners, rest pose at rotation 0 ---------------
  const legs = [];
  for (const s of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(s * 0.29, -0.4, -0.04); // hip pivot
    legGroup.userData.side = s; // -1 left (-x), +1 right (+x)
    root.add(legGroup);

    const thigh = ball(0.175, furMat, 0.95, 1.3, 1.15, 14, 10);
    thigh.position.set(s * 0.025, -0.14, 0.05);
    thigh.rotation.x = 0.35;
    legGroup.add(thigh);
    const knee = new THREE.Vector3(s * 0.04, -0.36, 0.16);   // knee thrust forward
    const ankle = new THREE.Vector3(s * 0.05, -0.62, -0.04); // hock pulled back
    legGroup.add(limb(new THREE.Vector3(s * 0.02, -0.1, 0.04), knee, 0.115, 0.085, furMat));
    legGroup.add(limb(knee, ankle, 0.082, 0.06, furMat));
    const ankleBall = ball(0.065, furMat, 1, 1, 1, 12, 8);
    ankleBall.position.copy(ankle);
    legGroup.add(ankleBall);

    // foot: bottom rests at local y -0.75 -> world y = -0.4 - 0.75 = -1.15
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.36), creamMat);
    foot.position.set(s * 0.05, -0.7, 0.1);
    legGroup.add(foot);
    for (let i = -1; i <= 1; i++) {
      const c = claw(0.12, 0.028, clawMat);
      c.position.set(s * 0.05 + i * 0.055, -0.72, 0.3);
      c.rotation.y = i * 0.25;
      legGroup.add(c);
    }
    legs.push(legGroup);
  }
  legs.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // --- tail: long zigzag lightning bolt, brown base -> yellow tip ---------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.32, -0.42);
  root.add(tailGroup);

  // fleshy brown root cone easing the bolt out of the hips
  const tailRoot = limb(new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0, 0.04, -0.3),
    0.13, 0.07, brownMat);
  tailGroup.add(tailRoot);

  const baseCol = new THREE.Color(0x6e4218);
  const tipCol = new THREE.Color(0xffd84a);
  const segLens = [0.5, 0.46, 0.46, 0.4, 0.36];
  let cursor = new THREE.Vector3(0, 0.04, -0.3);
  for (let i = 0; i < segLens.length; i++) {
    // alternate yaw kinks while the bolt climbs — classic lightning zigzag
    const yaw = (i % 2 === 0 ? 1 : -1) * 0.85;
    const dir = new THREE.Vector3(Math.sin(yaw), 0.22 + i * 0.05, -Math.cos(yaw)).normalize();
    const next = cursor.clone().addScaledVector(dir, segLens[i]);
    const t = i / (segLens.length - 1);
    const segMat = new THREE.MeshStandardMaterial({
      color: baseCol.clone().lerp(tipCol, t),
      roughness: 0.75,
      emissive: new THREE.Color(0x3a2c00).multiplyScalar(t),
      emissiveIntensity: 0.5 + t * 0.6, // segments charge up toward the spark
    });
    // flat chevron plate: wide in x, thin in y, long in z
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24 - i * 0.015, 0.055, segLens[i] * 1.08), segMat);
    seg.position.copy(cursor).addScaledVector(dir, 0.5 * segLens[i]);
    seg.quaternion.setFromUnitVectors(FWD, dir);
    tailGroup.add(seg);
    // metallic-gold edge trim: thin emissive border box across each chevron's
    // leading edge, catching light like hammered brass
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.26 - i * 0.015, 0.062, 0.035), trimMat);
    trim.position.copy(cursor).addScaledVector(dir, segLens[i] * 0.97);
    trim.quaternion.setFromUnitVectors(FWD, dir);
    trim.userData.noShadow = true;
    tailGroup.add(trim);
    // chevron notch cap at each elbow of the bolt
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085 - i * 0.008, 0.16, 4), segMat);
    cap.position.copy(next);
    cap.quaternion.setFromUnitVectors(UP, dir);
    tailGroup.add(cap);
    cursor = next;
  }

  // --- flame: crackling spark-orb aura at the tail tip ---------------------------
  const flame = new THREE.Group();
  flame.position.copy(cursor);
  tailGroup.add(flame);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), coreMat); // white-hot core
  core.userData.noShadow = true;
  flame.add(core);

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSparkGlowTexture(), color: 0xffe055,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  glowSprite.scale.set(0.95, 0.95, 1);
  glowSprite.userData.noShadow = true;
  flame.add(glowSprite);

  // faint, wide outer halo behind the hot glow — soft corona falloff
  const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSparkGlowTexture(), color: 0xfff0a0, opacity: 0.3,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  haloSprite.scale.set(1.7, 1.7, 1);
  haloSprite.userData.noShadow = true;
  flame.add(haloSprite);

  // 6 thin jagged static arcs snapping off the core
  for (let i = 0; i < 6; i++) {
    const arc = makeArc(rng, arcMat, 3);
    arc.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    flame.add(arc);
  }

  const flameLight = new THREE.PointLight(0xffe055, 9, 11);
  flame.add(flameLight);

  // --- shadows on every structural mesh -------------------------------------------
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // --- HARD CONTRACT: animation handles the game drives every frame ----------------
  root.userData.head = head;               // rotation.x in [-0.4, 0.4]
  root.userData.jaw = jaw;                 // rotation.x in [0, 0.75]; y = -0.2 - open*0.08
  root.userData.mouthAnchor = mouthAnchor; // projectile spawn (world position)
  root.userData.mouthGlow = mouthGlow;     // PointLight, intensity 0..18
  root.userData.tailGroup = tailGroup;     // rotation.y in [-0.6, 0.6]
  root.userData.flame = flame;             // spark aura, game scales 1..1.8
  root.userData.flameLight = flameLight;   // 0xffe055, ~9, ~11
  root.userData.wings = [];                // wingless — hovers on crackling energy
  root.userData.bodyMats = [furMat, ruffMat]; // golden fur mats (MEGA recolor)
  root.userData.arms = arms;               // [left, right], pivot = shoulder
  root.userData.legs = legs;               // [left, right], pivot = hip
  return root;
}
