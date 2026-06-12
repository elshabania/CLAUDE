// ============================================================================
// venusaur.js — procedural Venusaur-style GRASS titan for the pokemon-arena
// game. Self-contained ES module: geometry + canvas textures only, no external
// assets, no top-level await. three@0.160.0.
//
// Exports: buildVenusaur() -> THREE.Group
// Orientation: +z forward (snout), +y up, origin at torso center ~1.1 above
// the ground plane (feet bottoms near y = -1.1). Body ~2.8 long, ~2.2 tall
// including the back flower.
//
// userData contract (the game animates these):
//   head, jaw, mouthAnchor, mouthGlow, tailGroup, flame, flameLight,
//   wings (empty []), bodyMats, arms (front-leg pivots), legs (hind-leg pivots)
// ============================================================================

import * as THREE from "three";

// SECTION 1 — small helpers

function canvasTexture(size, draw, { srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);

// ShapeGeometry leaves UVs in shape-space; remap them into 0..1 so gradient
// canvas textures span the whole petal/leaf.
function remapUVs(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, uv = geo.attributes.uv, pos = geo.attributes.position;
  const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy);
  }
  uv.needsUpdate = true;
  return geo;
}

// Curl a flat ShapeGeometry petal: tip recurves backward (curl) and the side
// edges cup upward (cup), then rebuild normals so lighting follows the bend.
function bendPetal(geo, w, l, curl, cup) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = Math.min(Math.max(pos.getY(i) / l, 0), 1);
    pos.setZ(i, curl * l * t * t + cup * (Math.abs(x) / w) ** 2);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// SECTION 2 — canvas textures

// Shared feature layout so the 1024px color map and bump map stay in register:
// the same mottle patches and wart clusters drive both canvases.
function makeHideFeatures(s) {
  const patches = [];
  for (let i = 0; i < 20; i++) {
    const lobes = [];
    for (let k = 0; k < 7; k++) lobes.push(rand(0.6, 1.2));
    patches.push({
      x: rand(0, s), y: rand(0, s), r: rand(s * 0.05, s * 0.13),
      lobes, olive: Math.random() < 0.45, a: rand(0.3, 0.55),
    });
  }
  const warts = [];
  for (let c = 0; c < 30; c++) { // tight clusters of 3..8 warts
    const cx = rand(0, s), cy = rand(0, s), n = 3 + Math.floor(rand(0, 6));
    for (let i = 0; i < n; i++) {
      warts.push({
        x: cx + rand(-s * 0.04, s * 0.04),
        y: cy + rand(-s * 0.04, s * 0.04),
        r: rand(s * 0.004, s * 0.011),
      });
    }
  }
  return { patches, warts };
}

function tracePatch(ctx, p) {
  ctx.beginPath();
  for (let k = 0; k < p.lobes.length; k++) {
    const a = (k / p.lobes.length) * Math.PI * 2;
    const rr = p.r * p.lobes[k];
    ctx[k ? "lineTo" : "moveTo"](p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// Teal-green warty hide: two-tone mottled patches + crisp clustered warts.
function makeHideTexture(features) {
  return canvasTexture(1024, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#3da06d");
    g.addColorStop(0.55, "#349161");
    g.addColorStop(1, "#2c7d54");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);

    // Two-tone mottle: deep forest patches vs warm olive patches
    for (const p of features.patches) {
      ctx.fillStyle = p.olive
        ? `rgba(104, 138, 58, ${p.a * 0.8})`
        : `rgba(24, 80, 52, ${p.a})`;
      tracePatch(ctx, p);
      ctx.fill();
      // darker core gives the patch a soft two-step edge
      ctx.save();
      ctx.translate(p.x, p.y); ctx.scale(0.62, 0.62); ctx.translate(-p.x, -p.y);
      ctx.fillStyle = p.olive
        ? `rgba(86, 116, 44, ${p.a * 0.55})`
        : `rgba(16, 62, 40, ${p.a * 0.6})`;
      tracePatch(ctx, p);
      ctx.fill();
      ctx.restore();
    }
    // Mid-tone mottle scatter
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(46, 120, 80, ${rand(0.18, 0.4)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(10, 36), 0, Math.PI * 2); ctx.fill();
    }
    // Crisp warts: dark rim ring, bright body, sharp highlight dot
    for (const w of features.warts) {
      ctx.fillStyle = "rgba(18, 60, 38, 0.6)";
      ctx.beginPath(); ctx.arc(w.x, w.y + w.r * 0.18, w.r * 1.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(116, 206, 152, ${rand(0.55, 0.85)})`;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(214, 248, 222, 0.8)";
      ctx.beginPath(); ctx.arc(w.x - w.r * 0.32, w.y - w.r * 0.32, w.r * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Grayscale bump partner: raised warts and recessed patches, matching layout.
function makeHideBump(features) {
  return canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = "#7f7f7f";
    ctx.fillRect(0, 0, s, s);
    // Patches recess slightly
    for (const p of features.patches) {
      ctx.fillStyle = `rgba(58, 58, 58, ${p.a * 0.9})`;
      tracePatch(ctx, p);
      ctx.fill();
    }
    // Fine grain so the hide isn't mirror-flat between features
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(rand(105, 150));
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(1.5, 4), 0, Math.PI * 2); ctx.fill();
    }
    // Warts: steep radial falloff for a crisp raised bead
    for (const w of features.warts) {
      const rg = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.r * 1.15);
      rg.addColorStop(0, "rgba(255,255,255,0.95)");
      rg.addColorStop(0.7, "rgba(255,255,255,0.75)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 1.15, 0, Math.PI * 2); ctx.fill();
    }
  }, { srgb: false });
}

// Cream underbelly with subtle horizontal banding.
function makeBellyTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#eedfb4");
    g.addColorStop(1, "#dcc795");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(170, 145, 95, 0.45)";
    ctx.lineWidth = 4;
    for (let y = 28; y < s; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 3);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(200, 175, 120, ${rand(0.15, 0.35)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(3, 9), 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Pink/magenta petal gradient: pale base, hot magenta tip, darker streaks.
function makePetalTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0); // v=0 (petal base) at bottom
    g.addColorStop(0, "#ffe3ee");
    g.addColorStop(0.35, "#ff9ec4");
    g.addColorStop(0.75, "#f25b9b");
    g.addColorStop(1, "#d62f78");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // Deep magenta vein streaks fanning from the base, with pale echoes
    for (let i = 0; i < 11; i++) {
      const x0 = s * 0.5 + rand(-12, 12);
      const xTip = s * 0.5 + (i - 5) * 22, yTip = rand(0, s * 0.28);
      const cx = x0 + rand(-26, 26);
      ctx.strokeStyle = `rgba(186, 30, 96, ${rand(0.3, 0.55)})`;
      ctx.lineWidth = rand(2, 4.5);
      ctx.beginPath();
      ctx.moveTo(x0, s);
      ctx.quadraticCurveTo(cx, s * 0.55, xTip, yTip);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 240, 248, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 + 4, s);
      ctx.quadraticCurveTo(cx + 5, s * 0.55, xTip + 5, yTip + 8);
      ctx.stroke();
    }
    // Deep magenta freckles toward the tip
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(168, 22, 84, ${rand(0.25, 0.5)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s * 0.5), rand(2, 6), 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Dark green frond with a pale midrib and side veins.
function makeLeafTexture() {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, "#2f7d36");
    g.addColorStop(1, "#174f1f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(150, 210, 130, 0.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s / 2, s);
    ctx.lineTo(s / 2, 6);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(140, 200, 120, 0.45)";
    for (let i = 1; i < 9; i++) {
      const y = s - (i / 9) * s;
      ctx.beginPath();
      ctx.moveTo(s / 2, y);
      ctx.lineTo(s / 2 - s * 0.4, y - s * 0.1);
      ctx.moveTo(s / 2, y);
      ctx.lineTo(s / 2 + s * 0.4, y - s * 0.1);
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(12, 50, 18, ${rand(0.2, 0.4)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(3, 8), 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Brown trunk-spot where the flower roots into the back.
function makeTrunkTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#7a4a28";
    ctx.fillRect(0, 0, s, s);
    // Growth rings
    ctx.strokeStyle = "rgba(92, 54, 26, 0.8)";
    for (let r = 14; r < s * 0.7; r += 13) {
      ctx.lineWidth = rand(2, 5);
      ctx.beginPath(); ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(58, 33, 14, ${rand(0.3, 0.55)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(2, 7), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(168, 116, 64, ${rand(0.25, 0.45)})`;
      ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(2, 5), 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Soft round green glow for the flower's additive aura sprite.
function makeGlowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(170, 255, 140, 0.9)");
    g.addColorStop(0.4, "rgba(110, 230, 90, 0.45)");
    g.addColorStop(1, "rgba(60, 180, 60, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// SECTION 3 — 2D shapes for petals and serrated leaf fronds

function petalShape(w, l) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(w * 0.85, l * 0.12, w * 0.95, l * 0.62, w * 0.28, l * 0.9);
  sh.quadraticCurveTo(w * 0.1, l * 0.99, 0, l);
  sh.quadraticCurveTo(-w * 0.1, l * 0.99, -w * 0.28, l * 0.9);
  sh.bezierCurveTo(-w * 0.95, l * 0.62, -w * 0.85, l * 0.12, 0, 0);
  return sh;
}

function serratedLeafShape(w, l, teeth) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  // Right edge: bulge out then saw-tooth in toward the tip
  for (let i = 1; i <= teeth; i++) {
    const t = i / teeth;
    const edge = w * Math.sin(Math.min(t * 1.25, 1) * Math.PI) * (1 - t * 0.25);
    sh.lineTo(edge + w * 0.22, l * (t - 0.5 / teeth)); // tooth point
    sh.lineTo(edge * (i === teeth ? 0 : 1), l * t);    // notch back in
  }
  // Left edge mirrored back down to the stem
  for (let i = teeth - 1; i >= 1; i--) {
    const t = i / teeth;
    const edge = w * Math.sin(Math.min(t * 1.25, 1) * Math.PI) * (1 - t * 0.25);
    sh.lineTo(-edge, l * t);
    sh.lineTo(-(edge + w * 0.22), l * (t - 0.5 / teeth));
  }
  sh.lineTo(0, 0);
  return sh;
}

// SECTION 4 — buildVenusaur

export function buildVenusaur() {
  const root = new THREE.Group();
  root.name = "venusaur";

  // ---- materials -----------------------------------------------------------
  const hideFeatures = makeHideFeatures(1024);
  const hideTex = makeHideTexture(hideFeatures);
  const hideBump = makeHideBump(hideFeatures);
  const hideMat = new THREE.MeshStandardMaterial({
    map: hideTex, bumpMap: hideBump, bumpScale: 1.4, roughness: 0.88, metalness: 0.02,
  });
  const limbMat = new THREE.MeshStandardMaterial({
    map: hideTex, bumpMap: hideBump, bumpScale: 1.1, roughness: 0.92, metalness: 0.02,
    color: 0xd8f0e0, // slight cool tint variation on the shared hide texture
  });
  const headMat = new THREE.MeshStandardMaterial({
    map: hideTex, bumpMap: hideBump, bumpScale: 0.9, roughness: 0.82, metalness: 0.02,
  });
  const bellyMat = new THREE.MeshStandardMaterial({ map: makeBellyTexture(), roughness: 0.9 });
  const petalTexture = makePetalTexture();
  const petalMat = new THREE.MeshStandardMaterial({
    map: petalTexture, roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    emissive: 0x551133, emissiveIntensity: 0.18,
  });
  const leafTex = makeLeafTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex, roughness: 0.78, side: THREE.DoubleSide,
  });
  // Big fronds droop with their +z normal facing the ground, so the visible
  // topside is the BackSide and the underside is the FrontSide.
  const leafTopMat = new THREE.MeshStandardMaterial({
    map: leafTex, roughness: 0.68, side: THREE.BackSide,
  });
  const leafUnderMat = new THREE.MeshStandardMaterial({
    color: 0x76ad6e, roughness: 0.96, side: THREE.FrontSide,
  });
  const trunkMat = new THREE.MeshStandardMaterial({ map: makeTrunkTexture(), roughness: 0.95 });
  const pistilMat = new THREE.MeshStandardMaterial({ color: 0xf7c930, roughness: 0.55, emissive: 0x664400, emissiveIntensity: 0.25 });
  const pollenMat = new THREE.MeshStandardMaterial({
    color: 0xffe27a, emissive: 0xffc83c, emissiveIntensity: 1.7, roughness: 0.4,
  });
  const dewMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8fbff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
    transparent: true, opacity: 0.68, envMapIntensity: 1.5,
  });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x3f9148, roughness: 0.8 });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0xf3eedd, roughness: 0.2, metalness: 0.08, envMapIntensity: 1.3,
  });
  const fangMat = new THREE.MeshStandardMaterial({ color: 0xfffcf2, roughness: 0.3 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x55181c, roughness: 0.9 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xc25668, roughness: 0.7 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfff6ee, roughness: 0.35 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0xd41f1f, roughness: 0.25, emissive: 0x551010, emissiveIntensity: 0.5 });
  const irisRimMat = new THREE.MeshStandardMaterial({ color: 0x5e0a0e, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x140808, roughness: 0.2 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // ---- torso: wide, low-slung quadruped bulk -------------------------------
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), hideMat);
  torso.scale.set(1.06, 0.76, 1.34); // ~2.1 wide, ~1.5 tall, ~2.7 long
  torso.position.y = -0.04;
  root.add(torso);

  // Muscle masses over the shoulders and haunches
  const musclePos = [
    [0.7, 0.12, 0.78, 0.5], [-0.7, 0.12, 0.78, 0.5],   // shoulders
    [0.74, 0.1, -0.74, 0.58], [-0.74, 0.1, -0.74, 0.58], // haunches
  ];
  for (const [x, y, z, r] of musclePos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), hideMat);
    m.position.set(x, y, z);
    m.scale.set(1, 0.88, 1.05);
    root.add(m);
  }
  // Neck fold rolls up toward the head
  const neck = new THREE.Mesh(new THREE.SphereGeometry(0.62, 26, 20), hideMat);
  neck.position.set(0, 0.32, 0.92);
  neck.scale.set(1.15, 0.8, 1.0);
  root.add(neck);

  // Cream underbelly plate
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.92, 32, 22), bellyMat);
  belly.scale.set(0.96, 0.62, 1.28);
  belly.position.y = -0.32;
  root.add(belly);

  // ==========================================================================
  // HEAD — broad skull, fierce red eyes, fangs, nostril pits, ear nubs
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 0.7, 1.1);
  root.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), headMat);
  skull.scale.set(1.18, 0.84, 1.02);
  head.add(skull);

  // Blunt snout / upper muzzle
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.36, 26, 18), headMat);
  snout.scale.set(1.25, 0.62, 1.1);
  snout.position.set(0, -0.1, 0.34);
  head.add(snout);

  // Dark palate so the open mouth reads as a cavity
  const palate = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12), mouthMat);
  palate.scale.set(1.2, 0.45, 1.05);
  palate.position.set(0, -0.16, 0.3);
  palate.userData.noShadow = true;
  head.add(palate);

  // Angry brow ridges
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.22), headMat);
    brow.position.set(s * 0.3, 0.22, 0.4);
    brow.rotation.z = -s * 0.42;
    brow.rotation.y = -s * 0.25;
    head.add(brow);
  }

  // Eyes: sclera / red iris / slit pupil / glint
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.33, 0.1, 0.37);
    eye.rotation.y = s * 0.55;
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), scleraMat);
    sclera.scale.set(1, 1.05, 0.7);
    sclera.userData.noShadow = true;
    eye.add(sclera);
    // Dark crimson limbal rim framing the iris
    const rim = new THREE.Mesh(new THREE.SphereGeometry(0.079, 16, 12), irisRimMat);
    rim.position.z = 0.046;
    rim.scale.set(1, 1.1, 0.5);
    rim.userData.noShadow = true;
    eye.add(rim);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 12), irisMat);
    iris.position.z = 0.052;
    iris.scale.set(1, 1.1, 0.55);
    iris.userData.noShadow = true;
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), pupilMat);
    pupil.position.z = 0.085;
    pupil.scale.set(0.62, 1.45, 0.4); // vertical slit
    pupil.userData.noShadow = true;
    eye.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), glintMat);
    glint.position.set(0.03, 0.044, 0.103);
    glint.userData.noShadow = true;
    eye.add(glint);
    head.add(eye);
  }

  // Nostril pits on the snout tip
  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), pupilMat);
    n.position.set(s * 0.12, -0.02, 0.72);
    n.scale.set(1, 0.7, 0.5);
    n.userData.noShadow = true;
    head.add(n);
  }

  // Pointed ear nubs
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 10), headMat);
    ear.position.set(s * 0.34, 0.43, -0.02);
    ear.rotation.z = -s * 0.35;
    head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), mouthMat);
    inner.position.set(s * 0.33, 0.42, 0.02);
    inner.rotation.z = -s * 0.35;
    inner.userData.noShadow = true;
    head.add(inner);
  }

  // Upper fangs hanging from the snout rim
  for (const s of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), fangMat);
    fang.position.set(s * 0.27, -0.2, 0.56);
    fang.rotation.x = Math.PI; // point downward
    fang.userData.noShadow = true;
    head.add(fang);
  }

  // ---- JAW: closed local position.y is exactly -0.2; opens with rotation.x +
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.06); // hinge at the back of the mouth
  head.add(jaw);

  const jawShell = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 16), headMat);
  jawShell.scale.set(1.22, 0.42, 1.25);
  jawShell.position.set(0, -0.04, 0.3);
  jaw.add(jawShell);

  const jawFloor = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), mouthMat);
  jawFloor.scale.set(1.18, 0.3, 1.18);
  jawFloor.position.set(0, 0.02, 0.3);
  jawFloor.userData.noShadow = true;
  jaw.add(jawFloor);

  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), tongueMat);
  tongue.scale.set(1.05, 0.32, 1.7);
  tongue.position.set(0, 0.05, 0.32);
  tongue.userData.noShadow = true;
  jaw.add(tongue);

  // Small white fangs visible along the jaw rim, pointing up
  for (const [x, z] of [[-0.3, 0.5], [-0.13, 0.6], [0.13, 0.6], [0.3, 0.5]]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), fangMat);
    tooth.position.set(x, 0.1, z);
    tooth.userData.noShadow = true;
    jaw.add(tooth);
  }

  // ---- mouth anchor + glow (projectile spawn point) -------------------------
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.14, 0.78); // front of the mouth, head-local
  head.add(mouthAnchor);
  const mouthGlow = new THREE.PointLight(0x88ff44, 0, 7, 2);
  mouthAnchor.add(mouthGlow);

  // ==========================================================================
  // TAIL — short stubby cone at the rear
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.18, -1.26);
  root.add(tailGroup);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 14), hideMat);
  tail.rotation.x = -Math.PI / 2; // point backwards along -z
  tail.position.set(0, 0.02, -0.26);
  tail.scale.set(1, 0.8, 1);
  tailGroup.add(tail);

  // ==========================================================================
  // FLAME == the great back flower (element aura, scaled 1..1.8 by the game)
  // ==========================================================================
  const flame = new THREE.Group();
  flame.position.set(0, 0.6, -0.48);
  root.add(flame);

  // Brown trunk-spot rooting the flower into the hide
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 0.4, 18), trunkMat);
  trunk.position.y = 0.02;
  flame.add(trunk);

  // Fan of large serrated fronds drooping under the flower. Each frond is two
  // meshes sharing one geometry: textured topside (BackSide, faces the sky)
  // and a pale matte underside (FrontSide).
  const leafGeo = remapUVs(new THREE.ShapeGeometry(serratedLeafShape(0.42, 1.25, 8), 12));
  const dewGeo = new THREE.SphereGeometry(0.034, 12, 10);
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 9) * Math.PI * 2 + rand(-0.1, 0.1);
    const leaf = new THREE.Mesh(leafGeo, leafTopMat);
    leaf.position.set(0, 0.16, 0.18);
    leaf.rotation.x = 1.62 + rand(0.06, 0.22); // a hair past flat = slight droop
    leaf.rotation.z = rand(-0.08, 0.08);
    pivot.add(leaf);
    const under = new THREE.Mesh(leafGeo, leafUnderMat);
    under.position.copy(leaf.position);
    under.rotation.copy(leaf.rotation);
    pivot.add(under);
    // Dew drop resting on every other frond's topside (local -z is up)
    if (i % 2 === 0) {
      const dew = new THREE.Mesh(dewGeo, dewMat);
      dew.position.set(rand(-0.14, 0.14), rand(0.45, 0.92), -0.024);
      dew.scale.set(1, 1.15, 0.72); // squashed against the leaf
      dew.userData.noShadow = true;
      leaf.add(dew);
    }
    flame.add(pivot);
  }

  // Two rings of big gradient-pink petals, gently recurved and cupped
  const petalGeoOuter = bendPetal(
    remapUVs(new THREE.ShapeGeometry(petalShape(0.46, 1.05), 16)), 0.46, 1.05, 0.22, -0.09);
  const petalGeoInner = bendPetal(
    remapUVs(new THREE.ShapeGeometry(petalShape(0.38, 0.85), 16)), 0.38, 0.85, 0.16, -0.07);
  for (let i = 0; i < 7; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.26;
    pivot.rotation.y = (i / 7) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeoOuter, petalMat);
    petal.position.z = 0.16;
    petal.rotation.x = 1.02 + rand(-0.06, 0.06); // splayed open ring
    pivot.add(petal);
    flame.add(pivot);
  }
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.32;
    pivot.rotation.y = (i / 5) * Math.PI * 2 + 0.35;
    const petal = new THREE.Mesh(petalGeoInner, petalMat);
    petal.position.z = 0.1;
    petal.rotation.x = 0.55 + rand(-0.05, 0.05); // upright inner cup
    pivot.add(petal);
    flame.add(pivot);
  }

  // Yellow pistil column + stamen dots
  const pistil = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.42, 14), pistilMat);
  pistil.position.y = 0.5;
  flame.add(pistil);
  const pistilTip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 14), pistilMat);
  pistilTip.position.y = 0.78;
  flame.add(pistilTip);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), pistilMat);
    stem.position.set(Math.cos(a) * 0.16, 0.66, Math.sin(a) * 0.16);
    stem.rotation.z = -Math.cos(a) * 0.45;
    stem.rotation.x = Math.sin(a) * 0.45;
    flame.add(stem);
    const anther = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pistilMat);
    anther.position.set(Math.cos(a) * 0.27, 0.78, Math.sin(a) * 0.27);
    flame.add(anther);
  }

  // Static glowing pollen dots drifting around the pistil
  const pollenGeo = new THREE.SphereGeometry(0.022, 8, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.25, 0.25);
    const r = rand(0.2, 0.34);
    const dot = new THREE.Mesh(pollenGeo, pollenMat);
    dot.position.set(Math.cos(a) * r, rand(0.56, 0.92), Math.sin(a) * r);
    dot.userData.noShadow = true;
    flame.add(dot);
  }

  // Soft green additive aura sprite
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0x99ff77, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0.85,
  }));
  glowSprite.scale.set(2.6, 2.6, 1);
  glowSprite.position.y = 0.55;
  glowSprite.userData.noShadow = true;
  flame.add(glowSprite);

  // Flower light
  const flameLight = new THREE.PointLight(0x77ee55, 8, 10, 2);
  flameLight.position.y = 0.7;
  flame.add(flameLight);

  // Curling vine tendrils draping off the flower base
  const vineSpecs = [
    { a0: 0.5, swing: 1.7, drop: 1.15, reach: 1.0 },
    { a0: 2.6, swing: -1.5, drop: 1.0, reach: 0.9 },
    { a0: 4.4, swing: 1.9, drop: 1.25, reach: 1.1 },
  ];
  for (const v of vineSpecs) {
    const pts = [];
    const N = 11;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ang = v.a0 + t * v.swing;
      const r = 0.4 + t * v.reach - Math.max(0, t - 0.75) * 1.6; // curl back in at the tip
      pts.push(new THREE.Vector3(
        Math.cos(ang) * r,
        0.12 - t * v.drop + Math.sin(t * 9.5) * 0.06,
        Math.sin(ang) * r
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.034, 6, false), vineMat);
    flame.add(vine);
    // tiny leaf at the tendril tip
    const tipLeaf = new THREE.Mesh(new THREE.ShapeGeometry(petalShape(0.07, 0.2), 6), leafMat);
    tipLeaf.position.copy(pts[N]);
    tipLeaf.rotation.set(rand(0, 2), rand(0, 6), rand(0, 2));
    flame.add(tipLeaf);
  }

  // ==========================================================================
  // LEGS — thick columns with three white claws each.
  // arms = FRONT leg shoulder pivots, legs = HIND leg hip pivots.
  // ==========================================================================
  function buildLeg(side, front) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (front ? 0.74 : 0.8), front ? -0.02 : -0.06, front ? 0.8 : -0.78);
    pivot.userData.side = side;

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(front ? 0.36 : 0.42, 20, 14), limbMat);
    haunch.position.y = -0.12;
    haunch.scale.set(1, 1.05, 1.1);
    pivot.add(haunch);

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(front ? 0.26 : 0.3, front ? 0.32 : 0.36, 0.78, 16),
      limbMat
    );
    column.position.y = -0.5;
    pivot.add(column);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), limbMat);
    foot.position.set(0, -0.94, 0.05);
    foot.scale.set(1.05, 0.46, 1.2);
    pivot.add(foot);

    // Three white claw cones fanned over the toes, pointing forward
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 10), clawMat);
      const a = i * 0.5;
      claw.position.set(Math.sin(a) * 0.26, -1.0, 0.08 + Math.cos(a) * 0.32);
      claw.rotation.x = 1.35;
      claw.rotation.y = a;
      pivot.add(claw);
    }
    return pivot;
  }

  const armL = buildLeg(-1, true);
  const armR = buildLeg(1, true);
  const legL = buildLeg(-1, false);
  const legR = buildLeg(1, false);
  root.add(armL, armR, legL, legR);

  // ---- shadows --------------------------------------------------------------
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---- HARD CONTRACT: userData ----------------------------------------------
  root.userData.head = head;
  root.userData.jaw = jaw;
  root.userData.mouthAnchor = mouthAnchor;
  root.userData.mouthGlow = mouthGlow;
  root.userData.tailGroup = tailGroup;
  root.userData.flame = flame;
  root.userData.flameLight = flameLight;
  root.userData.wings = []; // Venusaur doesn't fly with wings; the game hovers it
  root.userData.bodyMats = [hideMat, limbMat, headMat];
  root.userData.arms = [armL, armR]; // front-leg shoulder pivots, side -1/+1
  root.userData.legs = [legL, legR]; // hind-leg hip pivots, side -1/+1

  return root;
}
