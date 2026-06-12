// ============================================================================
// charizard.js — procedural Charizard-style dragon for the pokemon-arena game.
// Self-contained ES module: geometry + canvas textures only, no external assets.
// Exports: flameUniforms, buildCharizard()
// Orientation: +z forward (nose), +y up, origin at torso center.
// ============================================================================

import * as THREE from "three";

// ----------------------------------------------------------------------------
// Shared flame uniforms (the game drives these every frame)
// ----------------------------------------------------------------------------
export const flameUniforms = { uTime: { value: 0 }, uBoost: { value: 1 } };

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

// Seeded pseudo-random so the hide looks the same every build.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Overlapping downward arc "scales" + mottled blobs on a base color.
function paintScales(ctx, size, base, blobLight, blobDark, arcDark, arcLight, rng) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Mottled organic variation
  for (let i = 0; i < 240; i++) {
    const x = rng() * size, y = rng() * size, r = 12 + rng() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = rng() < 0.5 ? blobLight : blobDark;
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Reptile scale arcs, brick-offset rows
  const cw = 26, ch = 15;
  for (let row = 0; row * ch < size + ch; row++) {
    const off = (row % 2) * cw * 0.5;
    for (let col = -1; col * cw < size + cw; col++) {
      const x = col * cw + off + (rng() - 0.5) * 4;
      const y = row * ch + (rng() - 0.5) * 3;
      const r = 11 + rng() * 4;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = arcDark;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = arcLight;
      ctx.beginPath();
      ctx.arc(x, y - 1.6, r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
}

function makeSkinTextures() {
  const rng = makeRng(1337);
  const [c, ctx] = makeCanvas(512);
  paintScales(ctx, 512, "#e8821f",
    "rgba(255,170,70,0.10)", "rgba(150,70,10,0.12)",
    "rgba(120,52,6,0.30)", "rgba(255,190,110,0.18)", rng);
  const map = canvasTexture(c, true);
  // Matching grayscale bump
  const rng2 = makeRng(1337);
  const [cb, ctxb] = makeCanvas(512);
  paintScales(ctxb, 512, "#7f7f7f",
    "rgba(200,200,200,0.10)", "rgba(70,70,70,0.12)",
    "rgba(40,40,40,0.45)", "rgba(225,225,225,0.40)", rng2);
  const bump = canvasTexture(cb, false);
  return { map, bump };
}

// Cream belly plates: broad horizontal striations with per-band shading.
function makeBellyTextures() {
  const rng = makeRng(4242);
  const make = (base, hi, lo, line) => {
    const [c, ctx] = makeCanvas(512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) {
      const x = rng() * 512, y = rng() * 512, r = 16 + rng() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rng() < 0.5 ? hi : lo);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const band = 60;
    for (let y = band; y < 512 + band; y += band) {
      // soft gradient inside each plate: lighter top, darker toward seam
      const g = ctx.createLinearGradient(0, y - band, 0, y);
      g.addColorStop(0, hi);
      g.addColorStop(0.75, "rgba(0,0,0,0)");
      g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - band, 512, band);
      // seam line with a gentle wave
      ctx.strokeStyle = line;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const yy = y + Math.sin(x * 0.03 + y) * 3;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    return c;
  };
  const map = canvasTexture(
    make("#f3e2b8", "rgba(255,250,225,0.30)", "rgba(180,140,80,0.22)", "rgba(140,105,55,0.55)"), true);
  const bump = canvasTexture(
    make("#8a8a8a", "rgba(225,225,225,0.35)", "rgba(60,60,60,0.30)", "rgba(30,30,30,0.65)"), false);
  return { map, bump };
}

// Teal membrane with fibrous streaks radiating from the wing root (left edge).
function makeWingTexture() {
  const rng = makeRng(9001);
  const [c, ctx] = makeCanvas(512);
  ctx.fillStyle = "#2e8083";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const x = rng() * 512, y = rng() * 512, r = 14 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(90,190,185,0.10)" : "rgba(18,75,80,0.14)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibrous streaks fanning from the root point
  const rootX = 0, rootY = 256;
  for (let i = 0; i < 160; i++) {
    const ang = (rng() - 0.5) * 1.5;
    const len = 280 + rng() * 260;
    const wob = (rng() - 0.5) * 60;
    ctx.strokeStyle = rng() < 0.55
      ? `rgba(15,62,66,${0.06 + rng() * 0.14})`
      : `rgba(120,210,205,${0.04 + rng() * 0.10})`;
    ctx.lineWidth = 0.8 + rng() * 1.8;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY + (rng() - 0.5) * 70);
    ctx.quadraticCurveTo(
      len * 0.5, rootY + Math.sin(ang) * len * 0.5 + wob,
      Math.cos(ang) * len, rootY + Math.sin(ang) * len);
    ctx.stroke();
  }
  return canvasTexture(c, true);
}

// Soft radial glow sprite texture
function makeGlowTexture() {
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,235,190,1)");
  g.addColorStop(0.25, "rgba(255,170,70,0.65)");
  g.addColorStop(0.6, "rgba(255,90,20,0.22)");
  g.addColorStop(1, "rgba(255,60,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c, true);
}

// ============================================================================
// SECTION 2 — Flame shader (tail flame + reused cones)
// ============================================================================

const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  varying float vT;
  varying vec3 vPos;
  void main() {
    vPos = position;
    float t = clamp(position.y / uHeight, 0.0, 1.0);
    vT = t;
    vec3 p = position;
    float sway = t * t;
    p.x += sin(uTime * 7.0 + position.y * 5.0) * 0.16 * uHeight * sway;
    p.z += cos(uTime * 6.3 + position.y * 4.2) * 0.13 * uHeight * sway;
    p.xz *= 1.0 + 0.15 * sin(uTime * 9.0 - t * 6.0) * t;
    p.y *= 1.0 + 0.08 * sin(uTime * 5.2);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBoost;
  uniform float uCore;
  varying float vT;
  varying vec3 vPos;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.1; a *= 0.5; }
    return v;
  }
  void main() {
    // noise coords from local position (no UV seam), scrolling upward
    float n = fbm(vec2(vPos.x * 7.0 - vPos.z * 5.0, vPos.y * 4.5 - uTime * 3.2));
    float body = 1.0 - vT;
    float m = body * 1.15 + n * 0.75 - 0.42 + uCore * 0.18;
    float alpha = smoothstep(0.12, 0.55, m);
    alpha *= 0.82 + 0.18 * sin(uTime * 22.0 + vPos.y * 11.0);
    float heat = clamp(m * 1.25 + uCore * 0.45 - vT * 0.15, 0.0, 1.0);
    vec3 col = mix(vec3(0.65, 0.06, 0.01), vec3(1.0, 0.42, 0.04), smoothstep(0.12, 0.48, heat));
    col = mix(col, vec3(1.0, 0.85, 0.25), smoothstep(0.48, 0.76, heat));
    col = mix(col, vec3(1.0, 0.99, 0.90), smoothstep(0.76, 0.96, heat));
    col *= 0.8 + uBoost * 1.1; // > 1 so UnrealBloom (threshold 0.8) catches it
    gl_FragColor = vec4(col, alpha);
  }
`;

function makeFlameMesh(radius, height, core = 0) {
  const geo = new THREE.ConeGeometry(radius, height, 22, 14, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: flameUniforms.uTime,   // shared objects: game updates propagate
      uBoost: flameUniforms.uBoost,
      uHeight: { value: height },
      uCore: { value: core },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noShadow = true;
  return mesh;
}

// ============================================================================
// SECTION 3 — Small build helpers
// ============================================================================

const _UP = new THREE.Vector3(0, 1, 0);

function sph(mat, r, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

// Tapered limb segment between two points (r1 at a, r2 at b)
function bone(mat, a, b, r1, r2) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, 12);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_UP, dir.normalize());
  return m;
}

// Claw / spike cone pointing along dir from pos
function spike(mat, pos, dir, r, len) {
  const geo = new THREE.ConeGeometry(r, len, 10);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  m.quaternion.setFromUnitVectors(_UP, dir.clone().normalize());
  return m;
}

// ============================================================================
// SECTION 4 — buildCharizard
// ============================================================================

export function buildCharizard() {
  const root = new THREE.Group();
  root.name = "charizard";

  // ---- Materials -----------------------------------------------------------
  const skinTex = makeSkinTextures();
  skinTex.map.repeat.set(2.2, 2.2);
  skinTex.bump.repeat.set(2.2, 2.2);
  const skinMat = new THREE.MeshStandardMaterial({
    map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 0.035,
    color: 0xffffff, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.5,
  });
  const bellyTex = makeBellyTextures();
  bellyTex.map.repeat.set(1.4, 1.6);
  bellyTex.bump.repeat.set(1.4, 1.6);
  const bellyMat = new THREE.MeshStandardMaterial({
    map: bellyTex.map, bumpMap: bellyTex.bump, bumpScale: 0.04,
    color: 0xffffff, roughness: 0.6, metalness: 0.0, envMapIntensity: 0.5,
  });
  const membraneMat = new THREE.MeshStandardMaterial({
    map: makeWingTexture(), color: 0xffffff, roughness: 0.6, metalness: 0.0,
    side: THREE.DoubleSide, envMapIntensity: 0.5,
    emissive: 0xff5512, emissiveIntensity: 0.05, // faint warm translucency feel
  });
  const hornMat = new THREE.MeshStandardMaterial({
    color: 0xf0e0bd, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.5,
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0xf5ead2, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.5,
  });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x4a1410, roughness: 0.9 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0x8e2330, roughness: 0.7 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.25 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x2470c8, roughness: 0.2 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.15 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x331008, roughness: 0.95 });

  // ---- Torso (lathe along z) ----------------------------------------------
  // Profile from tail base (y=-1.05) to neck base (y=+1.0); rotateX maps +y -> +z.
  const profile = [
    [0.04, -1.05], [0.24, -0.96], [0.36, -0.72], [0.44, -0.42],
    [0.50, -0.12], [0.57, 0.20], [0.62, 0.50], [0.60, 0.70],
    [0.50, 0.88], [0.34, 1.00], [0.10, 1.05],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torsoGeo = new THREE.LatheGeometry(profile, 36);
  torsoGeo.rotateX(Math.PI / 2);          // +y axis -> +z (chest forward)
  torsoGeo.scale(0.96, 1.06, 1.0);        // slightly oval cross-section
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  root.add(torso);

  // Belly plate: narrower cream lathe pushed down so it peeks on the underside
  const bellyGeo = new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(p.x * 0.9, p.y * 0.94)), 28);
  bellyGeo.rotateX(Math.PI / 2);
  bellyGeo.scale(0.74, 1.0, 1.0);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, -0.16, 0.10);
  root.add(belly);

  // Shoulder / chest muscle masses
  for (const s of [1, -1]) {
    const sh = sph(skinMat, 0.30, 1.15, 1.0, 1.2);
    sh.position.set(s * 0.42, 0.42, 0.42);
    root.add(sh);
    const pec = sph(skinMat, 0.26, 1.1, 1.0, 1.0);
    pec.position.set(s * 0.26, 0.05, 0.78);
    root.add(pec);
  }

  // ---- Neck: S-curve of blended segments -----------------------------------
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.30, 0.82),
    new THREE.Vector3(0, 0.44, 1.02),
    new THREE.Vector3(0, 0.64, 1.06),
    new THREE.Vector3(0, 0.82, 1.16),
    new THREE.Vector3(0, 0.93, 1.28),
  ]);
  const NECK_N = 7;
  for (let i = 0; i < NECK_N; i++) {
    const t = i / (NECK_N - 1);
    const p = neckCurve.getPoint(t);
    const tan = neckCurve.getTangent(t);
    const r = 0.30 - t * 0.115;
    const seg = sph(skinMat, r, 1, 1, 1.35);
    seg.position.copy(p);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    root.add(seg);
    // cream throat plate peeking out the front of the neck
    if (i > 0) {
      const th = sph(bellyMat, r * 0.82, 0.85, 1, 1.2);
      th.position.copy(p).add(new THREE.Vector3(0, -0.035, 0.085));
      th.quaternion.copy(seg.quaternion);
      root.add(th);
    }
  }

  // ---- Head -----------------------------------------------------------------
  const head = new THREE.Group();
  head.position.set(0, 0.95, 1.3);
  root.add(head);

  const skull = sph(skinMat, 0.30, 1.0, 0.95, 1.12);
  skull.position.set(0, 0.06, 0.02);
  head.add(skull);

  const muzzle = sph(skinMat, 0.24, 0.80, 0.62, 1.85);
  muzzle.position.set(0, -0.03, 0.36);
  head.add(muzzle);

  // dark mouth interior (visible when the jaw opens)
  const palate = sph(mouthMat, 0.215, 0.74, 0.55, 1.8);
  palate.position.set(0, -0.055, 0.36);
  palate.userData.noShadow = true;
  head.add(palate);

  // Brow ridges (slanted toward the nose for a fierce expression)
  for (const s of [1, -1]) {
    const brow = sph(skinMat, 0.10, 1.5, 0.42, 1.05);
    brow.position.set(s * 0.17, 0.225, 0.235);
    brow.rotation.z = -s * 0.38;
    brow.rotation.x = -0.12;
    head.add(brow);
  }

  // Eyes: sclera + blue iris + pupil + specular glint, set under the brow
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.20, 0.135, 0.235);
    eye.rotation.y = s * 0.95;     // local +z points outward/forward
    eye.rotation.x = -0.08;
    const sclera = sph(scleraMat, 0.068, 1, 1, 0.85);
    sclera.userData.noShadow = true;
    const iris = sph(irisMat, 0.040, 1, 1, 0.55);
    iris.position.z = 0.046;
    const pupil = sph(pupilMat, 0.022, 1, 1, 0.5);
    pupil.position.z = 0.062;
    const glint = sph(glintMat, 0.010, 1, 1, 1);
    glint.position.set(0.014, 0.016, 0.070);
    glint.userData.noShadow = true;
    eye.add(sclera, iris, pupil, glint);
    head.add(eye);
  }

  // Nostrils: small dark pits near the snout tip
  for (const s of [1, -1]) {
    const n = sph(nostrilMat, 0.022, 1, 0.8, 1.2);
    n.position.set(s * 0.066, 0.075, 0.755);
    n.userData.noShadow = true;
    head.add(n);
  }

  // Two back-swept cream horns
  for (const s of [1, -1]) {
    const horn = spike(hornMat,
      new THREE.Vector3(s * 0.13, 0.24, -0.06),
      new THREE.Vector3(s * 0.10, 0.42, -0.95), 0.062, 0.5);
    head.add(horn);
  }

  // Upper teeth: cones hanging from the muzzle rim (seen when jaw opens)
  const toothRows = [
    [0.30, 0.135, 0.060], [0.42, 0.125, 0.055], [0.54, 0.112, 0.052],
    [0.66, 0.090, 0.068], // front fangs slightly longer
  ];
  for (const [z, x, len] of toothRows) {
    for (const s of [1, -1]) {
      const tooth = spike(clawMat,
        new THREE.Vector3(s * x, -0.115, z),
        new THREE.Vector3(0, -1, 0.12), 0.016, len);
      tooth.userData.noShadow = true;
      head.add(tooth);
    }
  }

  // ---- Jaw (closed local position.y MUST be -0.2; rotation.x 0..0.6 opens) --
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.10);    // pivot at the hinge, y = -0.2 exactly
  head.add(jaw);
  const mandible = sph(skinMat, 0.20, 0.72, 0.42, 1.95);
  mandible.position.set(0, 0.035, 0.30);
  jaw.add(mandible);
  const chinPlate = sph(bellyMat, 0.165, 0.68, 0.36, 1.85);
  chinPlate.position.set(0, 0.000, 0.31);
  jaw.add(chinPlate);
  const tongue = sph(tongueMat, 0.13, 0.62, 0.28, 1.6);
  tongue.position.set(0, 0.085, 0.30);
  tongue.userData.noShadow = true;
  jaw.add(tongue);
  // Small lower teeth pointing up
  for (const [z, x] of [[0.40, 0.095], [0.52, 0.082]]) {
    for (const s of [1, -1]) {
      const t = spike(clawMat,
        new THREE.Vector3(s * x, 0.095, z),
        new THREE.Vector3(0, 1, 0.1), 0.013, 0.042);
      t.userData.noShadow = true;
      jaw.add(t);
    }
  }

  // ---- Mouth anchor + glow light (fire breath origin) ------------------------
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.12, 0.82);
  head.add(mouthAnchor);
  const mouthGlow = new THREE.PointLight(0xff8a33, 0, 6, 2);
  mouthAnchor.add(mouthGlow);

  // ---- Tail: tapering chain curving back and up, swish pivot at the base ----
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.02, -0.95);
  root.add(tailGroup);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.0),
    new THREE.Vector3(0, -0.06, -0.62),
    new THREE.Vector3(0, 0.02, -1.25),
    new THREE.Vector3(0, 0.28, -1.75),
    new THREE.Vector3(0, 0.58, -2.05),
  ]);
  const TAIL_N = 14;
  let tailTip = new THREE.Vector3();
  for (let i = 0; i < TAIL_N; i++) {
    const t = i / (TAIL_N - 1);
    const p = tailCurve.getPoint(t);
    const tan = tailCurve.getTangent(t);
    const r = 0.30 * (1 - t) + 0.055 * t;
    const seg = sph(skinMat, r, 1, 1, 1.55);
    seg.position.copy(p);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    tailGroup.add(seg);
    if (i === TAIL_N - 1) tailTip.copy(p).addScaledVector(tan, -r * 0.4);
    // dorsal ridge continues onto the tail
    if (i >= 1 && i % 2 === 1 && t < 0.85) {
      tailGroup.add(spike(skinMat,
        p.clone().add(new THREE.Vector3(0, r * 0.85, 0)),
        new THREE.Vector3(0, 1, -0.55), 0.038, 0.11 * (1 - t * 0.6) + 0.03));
    }
  }

  // ---- Dorsal ridge spikes along neck + spine --------------------------------
  const spineSpots = [
    [0, 0.58, 0.55], [0, 0.62, 0.25], [0, 0.60, -0.05],
    [0, 0.54, -0.35], [0, 0.45, -0.65],
  ];
  for (const [x, y, z] of spineSpots) {
    root.add(spike(skinMat, new THREE.Vector3(x, y, z),
      new THREE.Vector3(0, 1, -0.5), 0.045, 0.14));
  }
  // a couple on the neck following the curve
  for (const t of [0.35, 0.65]) {
    const p = neckCurve.getPoint(t);
    root.add(spike(skinMat, p.clone().add(new THREE.Vector3(0, 0.24, -0.06)),
      new THREE.Vector3(0, 1, -0.6), 0.038, 0.11));
  }

  // ---- Tail flame -------------------------------------------------------------
  const flame = new THREE.Group();
  flame.position.copy(tailTip).add(new THREE.Vector3(0, 0.02, 0));
  tailGroup.add(flame);
  const flameOuter = makeFlameMesh(0.30, 1.05, 0);
  const flameInner = makeFlameMesh(0.165, 0.68, 1);
  flameInner.position.y = 0.02;
  flame.add(flameOuter, flameInner);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffa040, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  }));
  glowSprite.scale.set(1.5, 1.5, 1);
  glowSprite.position.y = 0.3;
  glowSprite.userData.noShadow = true;
  flame.add(glowSprite);
  const flameLight = new THREE.PointLight(0xff7726, 10, 7, 2);
  flameLight.position.y = 0.35;
  flame.add(flameLight);

  // ---- Hind legs: defined haunches, bent and trailing back (flight pose) ----
  // Thigh + shin + foot + toe claws live in a pivot group at the HIP joint so
  // the game can swing legs (rotation.x in [-0.7, +0.7]); rest pose unchanged.
  const legs = [];
  for (const s of [1, -1]) {
    const haunch = sph(skinMat, 0.30, 0.85, 1.05, 1.3);
    haunch.position.set(s * 0.46, -0.18, -0.42);
    haunch.rotation.x = 0.35;
    root.add(haunch);
    const hip = new THREE.Vector3(s * 0.50, -0.28, -0.50);
    const legGroup = new THREE.Group();
    legGroup.name = s === 1 ? "legRight" : "legLeft";
    legGroup.position.copy(hip);          // pivot at the hip joint
    legGroup.userData.side = s;           // -1 left (-x), +1 right (+x)
    root.add(legGroup);
    // joint positions local to the hip pivot (world pose identical at rot 0)
    const kneeL = new THREE.Vector3(s * 0.55, -0.52, -0.16).sub(hip);
    const ankleL = new THREE.Vector3(s * 0.55, -0.62, -0.78).sub(hip);
    legGroup.add(bone(skinMat, new THREE.Vector3(0, 0, 0), kneeL, 0.17, 0.115));
    legGroup.add(bone(skinMat, kneeL, ankleL, 0.115, 0.085));
    const foot = sph(skinMat, 0.11, 1.0, 0.7, 1.5);
    foot.position.copy(ankleL).add(new THREE.Vector3(0, -0.02, -0.10));
    legGroup.add(foot);
    // three claws fanning back-down (trailing flight pose)
    for (const a of [-0.32, 0, 0.32]) {
      legGroup.add(spike(clawMat,
        ankleL.clone().add(new THREE.Vector3(s * a * 0.32, -0.05, -0.20)),
        new THREE.Vector3(s * a, -0.35, -1), 0.034, 0.17));
    }
    legs.push(legGroup);
  }
  legs.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // ---- Small arms with three claws -------------------------------------------
  // Arm meshes live in a pivot group at the SHOULDER joint so the game can
  // swing arms (rotation.x in [-2.6, +1.0]); rest pose unchanged at rot 0.
  const arms = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Vector3(s * 0.52, 0.22, 0.62);
    const armGroup = new THREE.Group();
    armGroup.name = s === 1 ? "armRight" : "armLeft";
    armGroup.position.copy(shoulder);     // pivot at the shoulder joint
    armGroup.userData.side = s;           // -1 left (-x), +1 right (+x)
    root.add(armGroup);
    // joint positions local to the shoulder pivot
    const elbowL = new THREE.Vector3(s * 0.66, -0.06, 0.74).sub(shoulder);
    const wristL = new THREE.Vector3(s * 0.60, -0.18, 1.02).sub(shoulder);
    armGroup.add(bone(skinMat, new THREE.Vector3(0, 0, 0), elbowL, 0.105, 0.075));
    armGroup.add(bone(skinMat, elbowL, wristL, 0.075, 0.055));
    const hand = sph(skinMat, 0.065, 1, 0.8, 1.25);
    hand.position.copy(wristL);
    armGroup.add(hand);
    for (const a of [-0.3, 0, 0.3]) {
      armGroup.add(spike(clawMat,
        wristL.clone().add(new THREE.Vector3(s * a * 0.18, -0.015, 0.05)),
        new THREE.Vector3(s * a * 0.5, -0.45, 1), 0.022, 0.115));
    }
    arms.push(armGroup);
  }
  arms.sort((a, b) => a.userData.side - b.userData.side); // [left, right]

  // ---- Wings -------------------------------------------------------------------
  // Each wing: pivot at the shoulder; inner panel + drooped outer panel with the
  // signature scalloped trailing edge. For the +x wing, +rotation.z lifts the tip.
  const wings = [];
  for (const sign of [1, -1]) {
    const wing = buildWing(sign, skinMat, clawMat, membraneMat);
    wing.position.set(sign * 0.42, 0.55, 0.18);
    wing.userData.sign = sign;
    root.add(wing);
    wings.push(wing);
  }

  // ---- Shadows -------------------------------------------------------------------
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---- Animation contract ----------------------------------------------------------
  root.userData.head = head;
  root.userData.jaw = jaw;
  root.userData.mouthAnchor = mouthAnchor;
  root.userData.mouthGlow = mouthGlow;
  root.userData.tailGroup = tailGroup;
  root.userData.flame = flame;
  root.userData.flameLight = flameLight;
  root.userData.wings = wings;
  root.userData.arms = arms;   // [leftArmGroup, rightArmGroup], pivot = shoulder
  root.userData.legs = legs;   // [leftLegGroup, rightLegGroup], pivot = hip
  root.userData.bodyMats = [skinMat];

  return root;
}

// ============================================================================
// SECTION 5 — Wing construction
// ============================================================================
// Membrane shapes are authored in (span, chord) coords, then rotated so
// x = span outward, +z = forward chord, lying horizontal.

function membraneFromPoints(builderFn, sign, mat) {
  const shape = new THREE.Shape();
  builderFn(shape, sign);
  const geo = new THREE.ShapeGeometry(shape, 18);
  geo.rotateX(Math.PI / 2);   // shape (x, y) -> world (x, z): +y becomes +z
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noShadow = false;
  return mesh;
}

function buildWing(sign, skinMat, clawMat, membraneMat) {
  const wing = new THREE.Group();
  const INNER = 1.25;   // inner panel span
  const OUTER = 1.75;   // outer panel span

  // ---- Inner membrane: shoulder out to the mid joint
  const inner = membraneFromPoints((s, g) => {
    s.moveTo(0, 0.34);
    s.quadraticCurveTo(g * INNER * 0.5, 0.40, g * INNER, 0.30);   // leading edge
    s.lineTo(g * INNER, -0.42);
    s.quadraticCurveTo(g * INNER * 0.5, -0.62, 0, -0.52);          // trailing edge
    s.lineTo(0, 0.34);
  }, sign, membraneMat);
  wing.add(inner);

  // Inner leading-edge bone (humerus): shoulder to mid joint
  wing.add(bone(skinMat,
    new THREE.Vector3(0, 0.02, 0.32),
    new THREE.Vector3(sign * INNER, 0.02, 0.30), 0.085, 0.06));
  // small spur claw at the shoulder joint
  wing.add(spike(clawMat,
    new THREE.Vector3(sign * 0.12, 0.04, 0.40),
    new THREE.Vector3(sign * 0.2, 0.4, 1), 0.028, 0.13));

  // ---- Outer panel group: hinged at the mid joint with a downward droop
  const outerGroup = new THREE.Group();
  outerGroup.position.set(sign * INNER, 0.02, 0);
  outerGroup.rotation.z = -sign * 0.17;       // droop: tip sits lower than the joint
  wing.add(outerGroup);

  // Outer membrane: scalloped silhouette — 3 trailing-edge cusps to a swept tip
  const cusps = [
    [OUTER * 1.00, -0.06],  // wingtip
    [OUTER * 0.74, -0.55],
    [OUTER * 0.46, -0.78],
    [OUTER * 0.16, -0.66],
  ];
  const outer = membraneFromPoints((s, g) => {
    s.moveTo(0, 0.30);
    // leading edge: gentle swept curve out to the tip
    s.quadraticCurveTo(g * OUTER * 0.55, 0.34, g * cusps[0][0], cusps[0][1]);
    // scalloped trailing edge: concave arcs between cusps
    for (let i = 0; i < cusps.length - 1; i++) {
      const [x1, y1] = cusps[i];
      const [x2, y2] = cusps[i + 1];
      s.quadraticCurveTo(
        g * (x1 + x2) / 2, Math.min(y1, y2) + 0.30,   // pull arc inward (concave)
        g * x2, y2);
    }
    s.quadraticCurveTo(g * 0.05, -0.55, 0, -0.42);
    s.lineTo(0, 0.30);
  }, sign, membraneMat);
  outerGroup.add(outer);

  // Outer leading-edge bone + finger bones fanning to each scallop cusp
  outerGroup.add(bone(skinMat,
    new THREE.Vector3(0, 0.025, 0.30),
    new THREE.Vector3(sign * OUTER, 0.025, -0.04), 0.06, 0.022));
  for (let i = 1; i < cusps.length - 1; i++) {
    const [cx, cz] = cusps[i];
    outerGroup.add(bone(skinMat,
      new THREE.Vector3(0, 0.012, 0.22),
      new THREE.Vector3(sign * cx, 0.012, cz), 0.034, 0.012));
  }
  // mid-joint knuckle mass + claw spur, and a tiny spur at the wingtip
  const knuckle = sph(skinMat, 0.085, 1.1, 0.9, 1.1);
  outerGroup.add(knuckle);
  outerGroup.add(spike(clawMat,
    new THREE.Vector3(sign * 0.03, 0.05, 0.34),
    new THREE.Vector3(sign * 0.25, 0.55, 1), 0.030, 0.16));
  outerGroup.add(spike(clawMat,
    new THREE.Vector3(sign * (OUTER - 0.02), 0.02, -0.02),
    new THREE.Vector3(sign * 1, 0.05, -0.35), 0.020, 0.12));

  return wing;
}
