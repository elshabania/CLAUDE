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

// Layered crescent scales + mottled blobs on a base color.
// Rows are drawn bottom-up so every scale overlaps the one below it, leaving
// a visible lower crescent; each scale gets its own lit-crest -> shadowed-skirt
// radial gradient plus a dark groove and a light catch line on the free edge.
// The same rng sequence is consumed regardless of palette, so the color map,
// bump map and roughness map stay perfectly aligned.
function paintScales(ctx, size, pal, rng, gradStops) {
  const S = size / 512;
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);
  // Mottled organic variation
  const nBlob = Math.round(240 * S * S);
  for (let i = 0; i < nBlob; i++) {
    const x = rng() * size, y = rng() * size, r = (12 + rng() * 46) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? pal.blobLight : pal.blobDark);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Crescent scales, brick-offset rows, drawn bottom-up for downward overlap
  const cw = 26 * S, ch = 15 * S;
  const rows = Math.ceil(size / ch) + 1;
  for (let row = rows; row >= -1; row--) {
    const off = (((row % 2) + 2) % 2) * cw * 0.5;
    for (let col = -1; col * cw < size + cw; col++) {
      const x = col * cw + off + (rng() - 0.5) * 4 * S;
      const y = row * ch + (rng() - 0.5) * 3 * S;
      const r = (11 + rng() * 4) * S;
      // per-scale shading: lit crest up top, shadowed skirt at the rim
      ctx.globalAlpha = 0.78 + rng() * 0.22;
      const g = ctx.createRadialGradient(x, y - r * 0.5, r * 0.12, x, y + r * 0.12, r * 1.12);
      g.addColorStop(0, pal.scaleHi);
      g.addColorStop(0.6, pal.scaleMid);
      g.addColorStop(1, pal.scaleLo);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // dark groove under the free (lower) edge
      ctx.lineWidth = 2.2 * S;
      ctx.strokeStyle = pal.edge;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 0.06, Math.PI * 0.94);
      ctx.stroke();
      // light catch just inside the groove
      ctx.lineWidth = 1.1 * S;
      ctx.strokeStyle = pal.rim;
      ctx.beginPath();
      ctx.arc(x, y - 1.8 * S, r - 1.4 * S, Math.PI * 0.16, Math.PI * 0.84);
      ctx.stroke();
    }
  }
  // large-scale vertical tone: darker dorsal drifting to a warm belly glow
  if (gradStops) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    for (const [t, col] of gradStops) g.addColorStop(t, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

function makeSkinTextures() {
  const SIZE = 1024;
  const make = (pal, grad) => {
    const rng = makeRng(1337);
    const [c, ctx] = makeCanvas(SIZE);
    paintScales(ctx, SIZE, pal, rng, grad);
    return c;
  };
  // Bright saturated show-orange (~0xff7a1c) with flatter, graphic shading so
  // the cel ramp does the heavy lifting; subtle scales for texture only.
  const map = canvasTexture(make({
    base: "#ff8a26",
    blobLight: "rgba(255,190,104,0.08)", blobDark: "rgba(214,100,28,0.05)",
    scaleHi: "rgba(255,202,130,0.22)", scaleMid: "rgba(255,138,40,0.10)",
    scaleLo: "rgba(206,96,24,0.16)",
    edge: "rgba(168,74,16,0.24)", rim: "rgba(255,226,180,0.20)",
  }, [
    [0.0, "rgba(214,104,26,0.08)"], [0.5, "rgba(255,140,40,0.02)"],
    [1.0, "rgba(255,182,96,0.12)"],
  ]), true);
  // Matching grayscale bump (high contrast so the crescents really read)
  const bump = canvasTexture(make({
    base: "#808080",
    blobLight: "rgba(200,200,200,0.10)", blobDark: "rgba(70,70,70,0.12)",
    scaleHi: "rgba(238,238,238,0.85)", scaleMid: "rgba(150,150,150,0.35)",
    scaleLo: "rgba(30,30,30,0.75)",
    edge: "rgba(8,8,8,0.85)", rim: "rgba(255,255,255,0.55)",
  }), false);
  // Roughness: scale crests sit glossier, skirts and grooves rougher
  const rough = canvasTexture(make({
    base: "#a0a0a0",
    blobLight: "rgba(150,150,150,0.10)", blobDark: "rgba(190,190,190,0.10)",
    scaleHi: "rgba(105,105,105,0.70)", scaleMid: "rgba(160,160,160,0.30)",
    scaleLo: "rgba(205,205,205,0.55)",
    edge: "rgba(235,235,235,0.75)", rim: "rgba(120,120,120,0.40)",
  }), false);
  return { map, bump, rough };
}

// Cream belly plates: broad horizontal striations with per-band shading,
// fine intra-plate creases, and a matching roughness variant.
function makeBellyTextures() {
  const SIZE = 1024, S = 2;
  const make = (base, hi, lo, line, crease) => {
    const rng = makeRng(4242);
    const [c, ctx] = makeCanvas(SIZE);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 120 * S * S; i++) {
      const x = rng() * SIZE, y = rng() * SIZE, r = (16 + rng() * 50) * S;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rng() < 0.5 ? hi : lo);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const band = 60 * S;
    for (let y = band; y < SIZE + band; y += band) {
      // soft gradient inside each plate: lighter top, darker toward seam
      const g = ctx.createLinearGradient(0, y - band, 0, y);
      g.addColorStop(0, hi);
      g.addColorStop(0.75, "rgba(0,0,0,0)");
      g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - band, SIZE, band);
      // fine creases running across the plate interior
      for (const f of [0.3, 0.5, 0.68]) {
        ctx.strokeStyle = crease;
        ctx.lineWidth = (0.9 + rng() * 0.6) * S;
        ctx.beginPath();
        for (let x = 0; x <= SIZE; x += 16 * S) {
          const yy = y - band * f + Math.sin(x * 0.011 + y * 1.7 + f * 9) * 2.4 * S;
          x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // seam line with a gentle wave
      ctx.strokeStyle = line;
      ctx.lineWidth = 3.5 * S;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 16 * S) {
        const yy = y + Math.sin(x * 0.015 + y) * 3 * S;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    return c;
  };
  // Cream belly (~0xffe1a0), warm and bright with soft segment seams.
  const map = canvasTexture(
    make("#ffe1a0", "rgba(255,248,220,0.28)", "rgba(214,170,100,0.16)",
      "rgba(176,132,72,0.40)", "rgba(206,162,98,0.16)"), true);
  const bump = canvasTexture(
    make("#8a8a8a", "rgba(225,225,225,0.35)", "rgba(60,60,60,0.30)",
      "rgba(20,20,20,0.75)", "rgba(55,55,55,0.35)"), false);
  const rough = canvasTexture(
    make("#a8a8a8", "rgba(135,135,135,0.30)", "rgba(190,190,190,0.25)",
      "rgba(225,225,225,0.65)", "rgba(195,195,195,0.30)"), false);
  return { map, bump, rough };
}

// Teal membrane: fibrous streaks plus bold veins radiating from the wing root
// (left edge), each fading translucently along its length, over a warm backlit
// pool near the root that deepens toward the tip and trailing edge.
function makeWingTexture() {
  const rng = makeRng(9001);
  const SIZE = 1024, S = 2;
  const [c, ctx] = makeCanvas(SIZE);
  // Bright blue-teal show membrane (~0x39c8c4) — Charizard's iconic wing color
  ctx.fillStyle = "#39c8c4";
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 140 * S * S; i++) {
    const x = rng() * SIZE, y = rng() * SIZE, r = (14 + rng() * 60) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() < 0.5 ? "rgba(150,238,228,0.10)" : "rgba(36,150,140,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // translucent backlight: warm glow pooling at the root, darkening outward
  const rootY = SIZE / 2;
  const back = ctx.createRadialGradient(0, rootY, 40 * S, 0, rootY, SIZE * 1.15);
  back.addColorStop(0, "rgba(255,170,96,0.16)");
  back.addColorStop(0.45, "rgba(120,224,214,0.05)");
  back.addColorStop(1, "rgba(22,96,98,0.18)");
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Fibrous streaks fanning from the root point
  for (let i = 0; i < 220; i++) {
    const ang = (rng() - 0.5) * 1.5;
    const len = (280 + rng() * 260) * S;
    const wob = (rng() - 0.5) * 60 * S;
    ctx.strokeStyle = rng() < 0.55
      ? `rgba(15,62,66,${0.06 + rng() * 0.14})`
      : `rgba(120,210,205,${0.04 + rng() * 0.10})`;
    ctx.lineWidth = (0.7 + rng() * 1.6) * S;
    ctx.beginPath();
    ctx.moveTo(0, rootY + (rng() - 0.5) * 70 * S);
    ctx.quadraticCurveTo(
      len * 0.5, rootY + Math.sin(ang) * len * 0.5 + wob,
      Math.cos(ang) * len, rootY + Math.sin(ang) * len);
    ctx.stroke();
  }
  // Primary veins: soft halo pass + crisp core, alpha fading toward the tip
  for (let i = 0; i < 6; i++) {
    const ang = -0.66 + i * 0.26 + (rng() - 0.5) * 0.08;
    const len = (300 + rng() * 220) * S;
    const ex = Math.cos(ang) * len, ey = rootY + Math.sin(ang) * len;
    const grad = ctx.createLinearGradient(0, rootY, ex, ey);
    grad.addColorStop(0, "rgba(12,48,52,0.60)");
    grad.addColorStop(0.7, "rgba(12,48,52,0.22)");
    grad.addColorStop(1, "rgba(12,48,52,0.04)");
    ctx.strokeStyle = grad;
    const sy = rootY + (rng() - 0.5) * 30 * S;
    const my = rootY + (ey - rootY) * 0.35 + (rng() - 0.5) * 40 * S;
    for (const [w, a] of [[7 * S, 0.45], [2.6 * S, 1]]) {
      ctx.lineWidth = w;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.quadraticCurveTo(ex * 0.45, my, ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // two thinner branches splitting off each primary vein
    for (let b = 0; b < 2; b++) {
      const t = 0.35 + rng() * 0.4;
      const bx = ex * t, by = rootY + (ey - rootY) * t;
      const bang = ang + (rng() < 0.5 ? -1 : 1) * (0.18 + rng() * 0.22);
      const blen = len * (0.25 + rng() * 0.25);
      const bex = bx + Math.cos(bang) * blen, bey = by + Math.sin(bang) * blen;
      const bg = ctx.createLinearGradient(bx, by, bex, bey);
      bg.addColorStop(0, "rgba(12,48,52,0.38)");
      bg.addColorStop(1, "rgba(12,48,52,0.03)");
      ctx.strokeStyle = bg;
      ctx.lineWidth = 1.6 * S;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo((bx + bex) / 2, (by + bey) / 2 + (rng() - 0.5) * 20 * S, bex, bey);
      ctx.stroke();
    }
  }
  return canvasTexture(c, true);
}

// Eye iris: painted for a pole-forward sphere (canvas top = eye center), so
// vertical bands become concentric rings — pupil core, bright iris falling to
// a deep outer ring, then a dark limbal rim; vertical strokes become fibers.
function makeIrisTexture() {
  const rng = makeRng(77);
  const [c, ctx] = makeCanvas(128);
  // Big expressive blue-green anime iris with a hard black pupil and a bold
  // dark limbal ring (the outline-ish rim around the eye).
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, "#070908");
  g.addColorStop(0.22, "#070908");   // large pupil
  g.addColorStop(0.27, "#6fe8c8");   // bright cyan flare at pupil edge
  g.addColorStop(0.42, "#33c2a0");   // blue-green iris body
  g.addColorStop(0.60, "#1c8f86");   // deepening teal outer iris
  g.addColorStop(0.70, "#0a3a3a");   // dark limbal rim
  g.addColorStop(1.00, "#072020");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) {
    const x = rng() * 128;
    ctx.strokeStyle = rng() < 0.5
      ? `rgba(150,255,225,${0.08 + rng() * 0.18})`
      : `rgba(8,60,55,${0.10 + rng() * 0.20})`;
    ctx.lineWidth = 1 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 20 + rng() * 8);
    ctx.lineTo(x + (rng() - 0.5) * 6, 56 + rng() * 8);
    ctx.stroke();
  }
  return canvasTexture(c, true);
}

// Soft radial glow sprite texture
function makeGlowTexture() {
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,252,235,1)");
  g.addColorStop(0.22, "rgba(255,200,95,0.85)");
  g.addColorStop(0.55, "rgba(255,110,25,0.34)");
  g.addColorStop(1, "rgba(255,70,0,0)");
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
    vec3 col = mix(vec3(0.95, 0.16, 0.02), vec3(1.0, 0.52, 0.06), smoothstep(0.10, 0.46, heat));
    col = mix(col, vec3(1.0, 0.92, 0.30), smoothstep(0.44, 0.74, heat));
    col = mix(col, vec3(1.0, 1.0, 0.95), smoothstep(0.72, 0.95, heat));
    col *= 1.05 + uBoost * 1.25; // brighter: punchier bloom for the cartoon look
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
// SECTION 2b — Cel shading + ink outlines (the cartoon look)
// ============================================================================

// Inject a stepped (3-4 band) diffuse ramp into a standard material so lighting
// reads flat like an animation cel. Also flattens specular so highlights stay
// graphic rather than glossy. Applied via onBeforeCompile so the textures,
// bump/rough maps and PBR pipeline keep working underneath.
function celShade(mat, bands = 4) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBands = { value: bands };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uBands;\n" +
        "float celStep(float v){\n" +
        "  float b = max(2.0, uBands);\n" +
        "  // soft-quantize n.l into hard bands with a tiny AA border, then\n" +
        "  // lift the floor so shadowed cels stay bright & saturated\n" +
        "  float q = floor(v * b) / b;\n" +
        "  float f = fract(v * b);\n" +
        "  q += smoothstep(0.80, 0.96, f) / b;\n" +
        "  return clamp(q * 0.80 + 0.34, 0.0, 1.18);\n" +
        "}\n"
      )
      // MeshStandard uses RE_Direct_Physical — quantize dotNL there. The
      // USE_CLEARCOAT marker uniquely identifies the physical direct path so we
      // don't touch the Lambert/Phong copies of the same line.
      .replace(
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;\n\t#ifdef USE_CLEARCOAT",
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tdotNL = celStep( dotNL );\n\tvec3 irradiance = dotNL * directLight.color;\n\t#ifdef USE_CLEARCOAT"
      );
  };
  mat.needsUpdate = true;
  return mat;
}

// Bold anime ink line via inverted-hull: a slightly inflated BackSide copy in
// flat unlit near-black. Parented as a CHILD of the source mesh so it inherits
// all animation transforms automatically. Kept out of bodyMats and shadows.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x140a04, side: THREE.BackSide,
});
function addOutline(mesh, thickness = 0.045) {
  // inflate along the mesh's own local scale so the hull hugs the silhouette
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  const sx = 1 + thickness / Math.max(0.05, Math.abs(mesh.scale.x));
  const sy = 1 + thickness / Math.max(0.05, Math.abs(mesh.scale.y));
  const sz = 1 + thickness / Math.max(0.05, Math.abs(mesh.scale.z));
  o.scale.set(sx, sy, sz);
  o.userData.noShadow = true;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

// Flat membranes can't use a back-side hull, so the wing ink line is a slightly
// enlarged, double-sided black copy sitting just behind the membrane — the
// black border peeks out all around the silhouette and scallops.
const WING_OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x140a04, side: THREE.DoubleSide,
});
function addWingOutline(mesh, grow = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, WING_OUTLINE_MAT);
  o.scale.set(grow, grow, grow);
  o.position.y -= 0.012;   // tuck just under the membrane plane
  o.userData.noShadow = true;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
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
  skinTex.rough.repeat.set(2.2, 2.2);
  // Bright cel-shaded show orange. Flat-ish (high roughness, no env) so the
  // toon ramp reads as crisp light/shadow cels rather than a glossy reptile.
  // NOTE: the canvas map already bakes the show-orange; tint stays white so the
  // map isn't multiplied by its own hue (which squares to a muddy red).
  const skinMat = celShade(new THREE.MeshStandardMaterial({
    map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 0.03,
    roughnessMap: skinTex.rough, roughness: 1.0,
    color: 0xffffff, metalness: 0.0, envMapIntensity: 0.12,
  }), 4);
  // darker burnt-orange multiplier on the same maps: dorsal spikes, scars
  const dorsalMat = celShade(new THREE.MeshStandardMaterial({
    map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 0.03,
    roughnessMap: skinTex.rough, roughness: 1.0,
    color: 0xc85a14, metalness: 0.0, envMapIntensity: 0.12,
  }), 4);
  const bellyTex = makeBellyTextures();
  bellyTex.map.repeat.set(1.4, 1.6);
  bellyTex.bump.repeat.set(1.4, 1.6);
  bellyTex.rough.repeat.set(1.4, 1.6);
  const bellyMat = celShade(new THREE.MeshStandardMaterial({
    map: bellyTex.map, bumpMap: bellyTex.bump, bumpScale: 0.03,
    roughnessMap: bellyTex.rough, roughness: 1.0,
    color: 0xffffff, metalness: 0.0, envMapIntensity: 0.12,
    // keeps the cream reading warm on the shadowed underside instead of picking
    // up the scene's greenish hemisphere bounce
    emissive: 0x4a3a1e, emissiveIntensity: 0.22,
  }), 4);
  const membraneMat = celShade(new THREE.MeshStandardMaterial({
    map: makeWingTexture(), color: 0xffffff, roughness: 0.9, metalness: 0.0,
    side: THREE.DoubleSide, envMapIntensity: 0.12,
    emissive: 0x1f8c86, emissiveIntensity: 0.20, // keeps the teal vivid in shadow
  }), 3);
  const hornMat = celShade(new THREE.MeshStandardMaterial({
    color: 0xf5e8c8, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.15,
  }), 3);
  // bright cream keratin claws/teeth, cel-shaded to match the body
  const clawMat = celShade(new THREE.MeshStandardMaterial({
    color: 0xfff4dc, roughness: 0.6, metalness: 0.0, envMapIntensity: 0.1,
  }), 3);
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5a1812, roughness: 1.0 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xc44256, roughness: 0.9 });
  const scleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const irisMat = new THREE.MeshBasicMaterial({ map: makeIrisTexture() });
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
  addOutline(torso, 0.05);   // thick ink line around the main body mass

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
  const NECK_N = 6;
  for (let i = 0; i < NECK_N; i++) {
    const t = i / (NECK_N - 1);
    const p = neckCurve.getPoint(t);
    const tan = neckCurve.getTangent(t);
    const r = 0.30 - t * 0.115;
    const seg = sph(skinMat, r, 1, 1, 1.35);
    seg.position.copy(p);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    root.add(seg);
    // cream throat plate peeking out the front of the neck (every other
    // segment is enough — the plates overlap heavily along the curve)
    if (i % 2 === 1) {
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

  // rounder, friendlier cartoon cranium
  const skull = sph(skinMat, 0.33, 1.02, 1.0, 1.05);
  skull.position.set(0, 0.07, 0.0);
  head.add(skull);
  addOutline(skull, 0.045);

  // short, blunt snout (Charizard has a stubby muzzle, not a long reptilian one)
  const muzzle = sph(skinMat, 0.265, 0.92, 0.78, 1.02);
  muzzle.position.set(0, -0.03, 0.26);
  head.add(muzzle);
  addOutline(muzzle, 0.035);

  // dark mouth interior (visible when the jaw opens)
  const palate = sph(mouthMat, 0.225, 0.78, 0.60, 1.3);
  palate.position.set(0, -0.06, 0.30);
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

  // Big expressive cartoon eyes: bold black outline ring + white sclera +
  // large blue-green iris + a big white catchlight. Unlit so they read flat.
  const eyeRingMat = new THREE.MeshBasicMaterial({ color: 0x140a04 });
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.205, 0.155, 0.225);
    eye.rotation.y = s * 0.85;     // local +z points outward/forward
    eye.rotation.x = -0.06;
    // bold black ink ring framing the eye
    const ring = sph(eyeRingMat, 0.105, 1, 1.05, 0.5);
    ring.position.z = -0.005;
    ring.userData.noShadow = true;
    const sclera = sph(scleraMat, 0.092, 1, 1.02, 0.7);
    sclera.position.z = 0.012;
    sclera.userData.noShadow = true;
    const iris = sph(irisMat, 0.072, 1, 0.78, 1);
    iris.rotation.x = Math.PI / 2; // +y pole (texture center) faces forward
    iris.position.z = 0.052;
    iris.userData.noShadow = true;
    // big white catchlight (the signature cartoon eye sparkle)
    const glint = sph(glintMat, 0.028, 1, 1, 0.5);
    glint.position.set(s * 0.026, 0.034, 0.098);
    glint.userData.noShadow = true;
    eye.add(ring, sclera, iris, glint);
    head.add(eye);
  }

  // Nostrils: small dark pits near the snout tip
  for (const s of [1, -1]) {
    const n = sph(nostrilMat, 0.022, 1, 0.8, 1.2);
    n.position.set(s * 0.07, 0.07, 0.66);
    n.userData.noShadow = true;
    head.add(n);
  }

  // Two straight back-swept horns. In the official art these are the same
  // body-orange as the head (NOT cream), so they use skinMat; the ink outline
  // keeps them reading against the cranium.
  for (const s of [1, -1]) {
    const horn = spike(skinMat,
      new THREE.Vector3(s * 0.135, 0.28, -0.04),
      new THREE.Vector3(s * 0.16, 0.30, -1.0), 0.058, 0.46);
    addOutline(horn, 0.02);
    head.add(horn);
  }

  // (No battle scars — the anime Charizard has clean, smooth skin.)

  // Upper teeth: cones hanging from the muzzle rim (seen when jaw opens)
  const toothRows = [
    [0.26, 0.140, 0.058], [0.37, 0.128, 0.054], [0.47, 0.112, 0.052],
    [0.56, 0.090, 0.066], // front fangs slightly longer
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
  const mandible = sph(skinMat, 0.205, 0.78, 0.46, 1.5);
  mandible.position.set(0, 0.035, 0.26);
  jaw.add(mandible);
  addOutline(mandible, 0.035);   // outline follows the jaw as it opens
  const chinPlate = sph(bellyMat, 0.17, 0.72, 0.40, 1.42);
  chinPlate.position.set(0, 0.000, 0.27);
  jaw.add(chinPlate);
  const tongue = sph(tongueMat, 0.13, 0.64, 0.30, 1.4);
  tongue.position.set(0, 0.085, 0.26);
  tongue.userData.noShadow = true;
  jaw.add(tongue);
  // Small lower teeth pointing up
  for (const [z, x] of [[0.34, 0.095], [0.45, 0.082]]) {
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
  mouthAnchor.position.set(0, -0.12, 0.72);
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
  const TAIL_N = 12;
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
    // (Official Charizard's tail is smooth — no dorsal ridge spikes.)
  }

  // ---- Smooth back -----------------------------------------------------------
  // Official Charizard has NO dorsal spine ridge — the neck, back and tail are
  // smooth, so the generic-dragon spike rows have been removed entirely.

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
  const flameLight = new THREE.PointLight(0xff8a3a, 13, 8, 2);
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
    addOutline(haunch, 0.04);
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
    // sturdy foot with a cream sole pad underneath
    const foot = sph(skinMat, 0.13, 1.05, 0.8, 1.45);
    foot.position.copy(ankleL).add(new THREE.Vector3(0, -0.02, -0.08));
    legGroup.add(foot);
    const sole = sph(bellyMat, 0.10, 1.05, 0.55, 1.4);
    sole.position.copy(ankleL).add(new THREE.Vector3(0, -0.09, -0.05));
    legGroup.add(sole);
    // bony knee spur jutting up-forward off the joint
    legGroup.add(spike(hornMat,
      kneeL.clone().add(new THREE.Vector3(s * 0.05, 0.06, 0.04)),
      new THREE.Vector3(s * 0.35, 0.55, 0.9), 0.030, 0.13));
    // three claws fanning back-down (trailing flight pose), long and keen
    for (const a of [-0.32, 0, 0.32]) {
      legGroup.add(spike(clawMat,
        ankleL.clone().add(new THREE.Vector3(s * a * 0.32, -0.05, -0.20)),
        new THREE.Vector3(s * a, -0.35, -1), 0.030, 0.22));
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
    // small bony elbow spur pointing back off the joint
    armGroup.add(spike(hornMat,
      elbowL.clone().add(new THREE.Vector3(s * 0.05, 0, -0.04)),
      new THREE.Vector3(s * 0.6, -0.1, -1), 0.024, 0.11));
    // three slender claws, slightly longer and needle-sharp
    for (const a of [-0.3, 0, 0.3]) {
      armGroup.add(spike(clawMat,
        wristL.clone().add(new THREE.Vector3(s * a * 0.18, -0.015, 0.05)),
        new THREE.Vector3(s * a * 0.5, -0.45, 1), 0.019, 0.155));
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
  root.userData.bodyMats = [skinMat, dorsalMat];

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
  const INNER = 1.55;   // inner panel span (Charizard's wings are large)
  const OUTER = 2.15;   // outer panel span

  // ---- Inner membrane: shoulder out to the mid joint
  const inner = membraneFromPoints((s, g) => {
    s.moveTo(0, 0.34);
    s.quadraticCurveTo(g * INNER * 0.5, 0.40, g * INNER, 0.30);   // leading edge
    s.lineTo(g * INNER, -0.42);
    s.quadraticCurveTo(g * INNER * 0.5, -0.62, 0, -0.52);          // trailing edge
    s.lineTo(0, 0.34);
  }, sign, membraneMat);
  wing.add(inner);
  addWingOutline(inner);

  // Inner leading-edge bone (humerus): shoulder to mid joint
  wing.add(bone(skinMat,
    new THREE.Vector3(0, 0.02, 0.32),
    new THREE.Vector3(sign * INNER, 0.02, 0.30), 0.085, 0.06));
  // small spur claw at the shoulder joint
  wing.add(spike(clawMat,
    new THREE.Vector3(sign * 0.12, 0.04, 0.40),
    new THREE.Vector3(sign * 0.2, 0.4, 1), 0.026, 0.15));

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
  addWingOutline(outer);

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
    new THREE.Vector3(sign * 0.25, 0.55, 1), 0.028, 0.18));
  outerGroup.add(spike(clawMat,
    new THREE.Vector3(sign * (OUTER - 0.02), 0.02, -0.02),
    new THREE.Vector3(sign * 1, 0.05, -0.35), 0.018, 0.14));

  return wing;
}
