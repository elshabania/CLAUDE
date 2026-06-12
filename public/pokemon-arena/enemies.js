// ============================================================================
// POKÉMON ARENA 3D — WILD CREATURE SPECIES (enemies.js)
// Self-contained ES module exporting the four wild-creature species for the
// dragon-flight battle game. Pure procedural content: jittered geometry plus
// canvas-painted color / bump / emissive textures. No external assets.
//
// Contracts honoured here:
//   * +z is each creature's forward.
//   * rockor / vinex / aquish stand with their feet at y = 0, ~1.5-1.8 tall.
//   * zephyra is centred on its body, wingspan ~3.2, and exposes
//     group.userData.flapWings = [wingR, wingL] with userData.sign = +1 / -1,
//     pivoted at the wing roots (positive rotation.z raises the +x wing tip).
//   * build() always returns a fresh Group with FRESH materials (the game
//     mutates material.emissive for hit flashes); textures are cached at
//     species level and shared safely.
//   * Models are scale-friendly (boss variant uses group.scale.setScalar).
// ============================================================================
import * as THREE from "three";

// ----------------------------------------------------------------------------
// Deterministic pseudo-random helpers (stable silhouettes between builds)
// ----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// Radially displace vertices of a (non-indexed, flat-shaded) polyhedron.
// The hash keys off quantised ORIGINAL positions, so duplicated corner
// vertices move together and the surface stays watertight but craggy.
function jitterGeometry(geom, amount, seed = 0) {
  const pos = geom.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const qx = Math.round(v.x * 500) / 500;
    const qy = Math.round(v.y * 500) / 500;
    const qz = Math.round(v.z * 500) / 500;
    const h = hash3(qx + seed * 13.7, qy - seed * 5.3, qz + seed * 2.9);
    const s = 1 + (h - 0.5) * 2 * amount;
    pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

// ShapeGeometry UVs come out in shape-space; remap them to 0..1 so canvas
// textures stretch once across the whole leaf / feather / fin.
function normalizeShapeUVs(geom) {
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const sx = Math.max(1e-6, bb.max.x - bb.min.x);
  const sy = Math.max(1e-6, bb.max.y - bb.min.y);
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy);
  }
  uv.needsUpdate = true;
  return geom;
}

// Bow a flat ShapeGeometry out of its plane: vertices lift toward +z with
// distance up the shape (+y) and out to the sides, cupping petals / fins.
function curlShapeGeometry(geom, curl) {
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const maxY = Math.max(1e-6, bb.max.y - bb.min.y);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / maxY;
    const side = Math.abs(pos.getX(i)) / maxY;
    pos.setZ(i, pos.getZ(i) + (t * t + side * side * 0.7) * curl * maxY);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

function applyShadows(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.userData.noShadow; // decorative glow bits opt out
      o.receiveShadow = false;
    }
  });
  return group;
}

// ----------------------------------------------------------------------------
// Canvas texture factory + species-level texture cache
// ----------------------------------------------------------------------------
const TEX = {};

function makeCanvas(size, painter) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  painter(c.getContext("2d"), size);
  return c;
}

function canvasTex(name, size, painter, opts = {}) {
  if (TEX[name]) return TEX[name];
  const t = new THREE.CanvasTexture(makeCanvas(size, painter));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX[name] = t;
  return t;
}

// --- ROCKOR textures ---------------------------------------------------------
function texRockColor() {
  return canvasTex("rockColor", 1024, (ctx, S) => {
    const rng = mulberry32(101);
    const u = S / 256; // feature scale relative to the old 256 layout
    // Granite base with a subtle top-light gradient
    const base = ctx.createLinearGradient(0, 0, 0, S);
    base.addColorStop(0, "#958871");
    base.addColorStop(0.55, "#867a64");
    base.addColorStop(1, "#6e6351");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    // Mottled mineral splotches (fine grain at 1024)
    for (let i = 0; i < 2400; i++) {
      const g = 92 + rng() * 96;
      ctx.fillStyle = `rgba(${g | 0},${(g * 0.92) | 0},${(g * 0.73) | 0},${0.07 + rng() * 0.1})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, (1.5 + rng() * 12) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bold wavy sediment strata bands with dark parting seams
    let y = 0, band = 0;
    while (y < S) {
      const h = S * (0.028 + rng() * 0.05);
      ctx.fillStyle = band % 3 === 0 ? "#5d5242" : band % 3 === 1 ? "#a08f72" : "#7d7160";
      ctx.globalAlpha = 0.18 + rng() * 0.14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += S / 24)
        ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 3 + band * 1.7) * S * 0.008);
      ctx.lineTo(S, y + h);
      for (let x = S; x >= 0; x -= S / 24)
        ctx.lineTo(x, y + h + Math.sin((x / S) * Math.PI * 3 + band * 1.7 + 1.4) * S * 0.008);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#3b3325";
      ctx.fillRect(0, y + h, S, 1.6 * u);
      y += h + S * (0.012 + rng() * 0.02);
      band++;
    }
    ctx.globalAlpha = 1;
    // Deep jagged cracks: wide soft shadow halo, then a sharp dark core
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      const rng2 = mulberry32(909);
      ctx.strokeStyle = pass === 0 ? "rgba(42,35,25,0.45)" : "#241e15";
      ctx.shadowColor = pass === 0 ? "rgba(30,25,16,0.8)" : "transparent";
      ctx.shadowBlur = pass === 0 ? 6 * u : 0;
      for (let i = 0; i < 14; i++) {
        let x = rng2() * S, yy = rng2() * S;
        ctx.lineWidth = (pass === 0 ? 3.4 : 1.2) * u * (0.7 + rng2() * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        const steps = 5 + (rng2() * 5) | 0;
        for (let k = 0; k < steps; k++) {
          x += (rng2() - 0.5) * 44 * u;
          yy += (rng2() - 0.3) * 36 * u;
          ctx.lineTo(x, yy);
          if (rng2() < 0.45) {
            ctx.moveTo(x, yy);
            ctx.lineTo(x + (rng2() - 0.5) * 26 * u, yy + (rng2() - 0.5) * 26 * u);
            ctx.moveTo(x, yy);
          }
        }
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    // Lichen / moss dusting
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(86,118,52,${0.08 + rng() * 0.14})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, (3 + rng() * 10) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

function texRockBump() {
  return canvasTex("rockBump", 1024, (ctx, S) => {
    const rng = mulberry32(202);
    const u = S / 256;
    ctx.fillStyle = "#7f7f7f";
    ctx.fillRect(0, 0, S, S);
    // Height noise: bright knobs and dark pits
    for (let i = 0; i < 2000; i++) {
      const g = 60 + rng() * 150;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},0.2)`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, (1.5 + rng() * 12) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // Strata height steps matching the color bands
    ctx.globalAlpha = 0.18;
    let y = 0, band = 0;
    const rngB = mulberry32(111);
    while (y < S) {
      const h = S * (0.03 + rngB() * 0.05);
      ctx.fillStyle = band % 2 ? "#9a9a9a" : "#646464";
      ctx.fillRect(0, y, S, h);
      y += h + S * 0.012;
      band++;
    }
    ctx.globalAlpha = 1;
    // DEEP crack normals: blurred dark trench + crisp black floor + lit rim
    ctx.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const pts = [];
      let x = rng() * S, yy = rng() * S;
      pts.push([x, yy]);
      for (let k = 0; k < 6; k++) {
        x += (rng() - 0.5) * 46 * u;
        yy += (rng() - 0.3) * 36 * u;
        pts.push([x, yy]);
      }
      const trace = (w, style, blur) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.shadowColor = blur ? style : "transparent";
        ctx.shadowBlur = blur || 0;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
      };
      trace(7 * u, "rgba(30,30,30,0.55)", 8 * u); // wide soft trench
      trace(2.2 * u, "#050505", 0);               // sharp crack floor
      ctx.save();                                  // bright rim catch-light
      ctx.translate(-1.6 * u, -1.6 * u);
      trace(1 * u, "rgba(230,230,230,0.35)", 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  });
}

function texRune() {
  return canvasTex("rune", 256, (ctx, S) => {
    const rng = mulberry32(303);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = "round";
    const cx = S * 0.5, cy = S * 0.46;
    // Jagged molten fissures, drawn twice: wide hot halo then white-hot core,
    // with varying width along each branch for a pulsing-magma feel.
    for (let pass = 0; pass < 2; pass++) {
      const rng2 = mulberry32(303);
      ctx.strokeStyle = pass === 0 ? "#ff8c1e" : "#ffe9b0";
      ctx.shadowColor = "#ff7a10";
      ctx.shadowBlur = pass === 0 ? 14 : 6;
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + rng2() * 0.5;
        let x = cx + Math.cos(ang) * 8;
        let y = cy + Math.sin(ang) * 8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const steps = 4 + (rng2() * 3) | 0;
        for (let k = 0; k < steps; k++) {
          ctx.lineWidth = (pass === 0 ? 7 : 3) * (1 - k / (steps + 1)) * (0.8 + rng2() * 0.4);
          x += Math.cos(ang + (rng2() - 0.5) * 1.1) * (14 + rng2() * 18);
          y += Math.sin(ang + (rng2() - 0.5) * 1.1) * (14 + rng2() * 18);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // Small angular rune glyphs scattered around the fissures
    ctx.strokeStyle = "#ffd266";
    ctx.shadowColor = "#ff9020";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const x = 30 + rng() * (S - 60), y = 30 + rng() * (S - 60);
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 8);
      ctx.lineTo(x, y - 8);
      ctx.lineTo(x + 7, y + 8);
      if (rng() < 0.6) { ctx.moveTo(x - 4, y + 2); ctx.lineTo(x + 4, y + 2); }
      ctx.stroke();
    }
    // Molten core hot-spot, white-hot centre
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
    g.addColorStop(0, "rgba(255,245,215,1)");
    g.addColorStop(0.4, "rgba(255,200,110,0.8)");
    g.addColorStop(1, "rgba(255,140,30,0)");
    ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
  }, { srgb: true });
}

// --- VINEX textures ----------------------------------------------------------
function texBulb() {
  return canvasTex("bulb", 256, (ctx, S) => {
    const rng = mulberry32(404);
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, "#3c8a30");
    grad.addColorStop(0.55, "#5cab3e");
    grad.addColorStop(1, "#8cc956");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Vertical leaf-vein striations that wrap the bulb
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i++) {
      const x0 = (i / 18) * S + rng() * 8;
      ctx.strokeStyle = i % 2 ? "rgba(34,84,28,0.5)" : "rgba(190,230,140,0.4)";
      ctx.lineWidth = i % 2 ? 2.5 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + 14, S * 0.3, x0 - 14, S * 0.7, x0 + 6, S);
      ctx.stroke();
    }
    // Side veinlets
    ctx.strokeStyle = "rgba(40,92,30,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const x = rng() * S, y = rng() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 10, y + 4 + rng() * 6, x + 18 + rng() * 8, y + 2);
      ctx.stroke();
    }
    // Pale spots like a young gourd
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(220,245,170,${0.10 + rng() * 0.16})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S * 0.8, 2 + rng() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

function texLeaf() {
  return canvasTex("leaf", 512, (ctx, S) => {
    const rng = mulberry32(414);
    const grad = ctx.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, "#2c7423");
    grad.addColorStop(0.6, "#4f9c33");
    grad.addColorStop(1, "#82c645");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Faint cell mottling between veins
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = rng() < 0.5
        ? `rgba(30,72,22,${0.05 + rng() * 0.08})`
        : `rgba(170,215,110,${0.05 + rng() * 0.07})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, 2 + rng() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = "round";
    // Crisp central midrib, tapering toward the tip (bottom -> top in UV)
    const mid = (w, style) => {
      ctx.strokeStyle = style;
      for (let t = 0; t < 1; t += 0.05) {
        ctx.lineWidth = w * (1 - t * 0.8);
        ctx.beginPath();
        ctx.moveTo(S / 2, S * (0.98 - t * 0.94));
        ctx.lineTo(S / 2, S * (0.98 - (t + 0.05) * 0.94));
        ctx.stroke();
      }
    };
    mid(13, "rgba(36,86,26,0.9)");      // dark groove
    mid(7, "rgba(222,244,158,0.95)");   // bright ridge
    // Sharp paired side veins with darker undershadow for crispness
    for (let i = 0; i < 11; i++) {
      const y = S * (0.1 + i * 0.078);
      const reach = Math.sin(((i + 1) / 12) * Math.PI) * 0.42 + 0.08;
      for (const [w, style, dy] of [[5, "rgba(34,80,24,0.6)", 2.5], [2.2, "rgba(214,240,150,0.85)", 0]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = style;
        ctx.beginPath();
        ctx.moveTo(S / 2, y + 24 + dy);
        ctx.quadraticCurveTo(S * (0.5 - reach * 0.55), y + 4 + dy, S * (0.5 - reach), y - 20 + dy);
        ctx.moveTo(S / 2, y + 24 + dy);
        ctx.quadraticCurveTo(S * (0.5 + reach * 0.55), y + 4 + dy, S * (0.5 + reach), y - 20 + dy);
        ctx.stroke();
      }
      // Tertiary veinlets branching off each side vein
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(200,232,140,0.4)";
      for (let k = 0; k < 4; k++) {
        const t = 0.25 + k * 0.18;
        for (const sx of [-1, 1]) {
          const x0 = S * (0.5 + sx * reach * t);
          const y0 = y + 18 - t * 34;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + sx * 9, y0 - 11);
          ctx.stroke();
        }
      }
    }
  }, { srgb: true });
}

function texPetal() {
  return canvasTex("petal", 256, (ctx, S) => {
    // Rich three-stop gradient: deep magenta throat -> hot pink -> pale tip
    const grad = ctx.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, "#8e1d63");
    grad.addColorStop(0.35, "#d4429a");
    grad.addColorStop(0.72, "#f57fc0");
    grad.addColorStop(1, "#fff0f9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Soft radial blush at the throat
    const blush = ctx.createRadialGradient(S / 2, S * 0.95, 4, S / 2, S * 0.95, S * 0.5);
    blush.addColorStop(0, "rgba(120,10,80,0.55)");
    blush.addColorStop(1, "rgba(120,10,80,0)");
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, S, S);
    // Streaking nectar guides fanning from the base
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const x = S * (0.14 + i * 0.09);
      ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.4)" : "rgba(150,30,100,0.3)";
      ctx.lineWidth = i % 2 ? 2.4 : 3.6;
      ctx.beginPath();
      ctx.moveTo(S / 2, S * 0.98);
      ctx.quadraticCurveTo(x, S * 0.5, x * 0.7 + S * 0.15, S * 0.05);
      ctx.stroke();
    }
    // Pale shimmering rim along the tip edge
    const rim = ctx.createLinearGradient(0, S * 0.16, 0, 0);
    rim.addColorStop(0, "rgba(255,255,255,0)");
    rim.addColorStop(1, "rgba(255,255,255,0.65)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, S, S * 0.16);
  }, { srgb: true });
}

// --- AQUISH textures ---------------------------------------------------------
function texWave() {
  return canvasTex("wave", 512, (ctx, S) => {
    const rng = mulberry32(505);
    const u = S / 256;
    // v=1 (texture top) is the creature's back: deep blue fading to pale belly
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, "#0a3a72");
    grad.addColorStop(0.45, "#1873c2");
    grad.addColorStop(0.78, "#6fc2ec");
    grad.addColorStop(1, "#dff4fd");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Rolling wave streaks — doubled sine layers reads as drifting water
    for (let row = 0; row < 11; row++) {
      const y0 = S * (0.06 + row * 0.09);
      for (const [amp, freq, ph, alpha, w] of [
        [5, 4, row * 1.7, 0.3 - row * 0.02, 2.2],
        [3, 7, row * 2.3 + 1.1, 0.18 - row * 0.012, 1.2],
      ]) {
        ctx.strokeStyle = `rgba(220,245,255,${Math.max(0.04, alpha)})`;
        ctx.lineWidth = w * u;
        ctx.beginPath();
        for (let x = 0; x <= S; x += 3 * u) {
          const y = y0 + Math.sin((x / S) * Math.PI * freq + ph) * amp * u;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // Caustic dapples: bright wobbly cell rings, as if lit through water
    ctx.lineCap = "round";
    for (let i = 0; i < 46; i++) {
      const cx = rng() * S, cy = rng() * S * 0.85;
      const r = (6 + rng() * 16) * u;
      ctx.strokeStyle = `rgba(225,250,255,${0.10 + rng() * 0.16})`;
      ctx.lineWidth = (1.4 + rng() * 1.8) * u;
      ctx.shadowColor = "rgba(190,240,255,0.7)";
      ctx.shadowBlur = 4 * u;
      ctx.beginPath();
      const arms = 8;
      for (let k = 0; k <= arms; k++) {
        const a = (k / arms) * Math.PI * 2;
        const rr = r * (0.7 + hash3(i, k % arms, 3.7) * 0.6);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.7;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // Subtle darker dapples along the back
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(8,40,80,${0.08 + rng() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(rng() * S, rng() * S * 0.45, (4 + rng() * 9) * u, (2 + rng() * 4) * u, rng(), 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

function texFin() {
  return canvasTex("fin", 256, (ctx, S) => {
    // Translucent membrane with radial structural ribs fanning from the root
    // (shape origin maps to the left edge after UV normalisation)
    const grad = ctx.createLinearGradient(0, 0, S, 0);
    grad.addColorStop(0, "#c4f0fd");
    grad.addColorStop(1, "#6cc8ec");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const sp = (i / 8 - 0.5) * 1.05; // spread factor
      ctx.strokeStyle = i % 2 ? "rgba(18,86,134,0.42)" : "rgba(12,70,115,0.6)";
      ctx.lineWidth = i % 2 ? 1.6 : 2.6;
      ctx.beginPath();
      ctx.moveTo(S * 0.02, S * 0.5);
      ctx.quadraticCurveTo(S * 0.55, S * (0.5 + sp * 0.55), S * 0.99, S * (0.5 + sp));
      ctx.stroke();
      // Bright catch-light alongside each rib
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(S * 0.04, S * 0.49);
      ctx.quadraticCurveTo(S * 0.55, S * (0.49 + sp * 0.55), S * 0.99, S * (0.49 + sp));
      ctx.stroke();
    }
    // Faint membrane wrinkles arcing between ribs
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 6; i++) {
      const x = S * (i / 6);
      ctx.beginPath();
      ctx.moveTo(x, S * 0.12);
      ctx.quadraticCurveTo(x + S * 0.05, S * 0.5, x, S * 0.88);
      ctx.stroke();
    }
  }, { srgb: true });
}

// --- ZEPHYRA textures --------------------------------------------------------
function texFeather() {
  return canvasTex("feather", 512, (ctx, S) => {
    const rng = mulberry32(606);
    const u = S / 256;
    ctx.fillStyle = "#5b3fa0";
    ctx.fillRect(0, 0, S, S);
    // Layered feather scallops, row by row, each row offset like shingles
    const rowH = 22 * u;
    for (let row = 0; row < S / rowH + 1; row++) {
      const y = row * rowH;
      const off = (row % 2) * 14 * u;
      for (let x = -14 * u; x < S + 14 * u; x += 28 * u) {
        const cx = x + off;
        const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
        grad.addColorStop(0, "#7c5fc8");
        grad.addColorStop(1, "#4a3088");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx - 13 * u, y);
        ctx.quadraticCurveTo(cx, y + rowH * 1.35, cx + 13 * u, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(30,18,64,0.7)";
        ctx.lineWidth = 1.4 * u;
        ctx.stroke();
        // Shaft line down each feather
        ctx.strokeStyle = "rgba(200,182,255,0.45)";
        ctx.lineWidth = 1.1 * u;
        ctx.beginPath();
        ctx.moveTo(cx, y + 2 * u);
        ctx.lineTo(cx, y + rowH * 0.92);
        ctx.stroke();
        // Fine barbs angling off both sides of the shaft
        ctx.strokeStyle = "rgba(176,150,236,0.34)";
        ctx.lineWidth = 0.7 * u;
        ctx.beginPath();
        for (let b = 1; b <= 6; b++) {
          const by = y + (b / 7) * rowH;
          const reach = 11 * u * (1 - b / 9);
          ctx.moveTo(cx, by);
          ctx.lineTo(cx - reach, by + 3.5 * u);
          ctx.moveTo(cx, by);
          ctx.lineTo(cx + reach, by + 3.5 * u);
        }
        ctx.stroke();
        // Occasional split in the vane for a preened, naturalistic read
        if (rng() < 0.3) {
          ctx.strokeStyle = "rgba(36,22,74,0.5)";
          ctx.lineWidth = 1 * u;
          const sx = cx + (rng() - 0.5) * 12 * u;
          ctx.beginPath();
          ctx.moveTo(sx, y + rowH * 0.3);
          ctx.lineTo(sx + (rng() - 0.5) * 5 * u, y + rowH * 1.05);
          ctx.stroke();
        }
      }
    }
    // Storm shimmer flecks
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(170,220,255,${0.06 + rng() * 0.1})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, (1 + rng() * 2.5) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

// ----------------------------------------------------------------------------
// Shared shape builders
// ----------------------------------------------------------------------------
function featherShape(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.25, wid * 0.55, len * 0.72, wid * 0.38);
  s.quadraticCurveTo(len * 1.04, wid * 0.13, len, 0);
  s.quadraticCurveTo(len * 1.04, -wid * 0.13, len * 0.72, -wid * 0.38);
  s.quadraticCurveTo(len * 0.25, -wid * 0.55, 0, 0);
  return s;
}

function serratedLeafShape(len, wid, teeth) {
  // Single clean perimeter: up the left edge with serrations, tip, then
  // back down the right edge — keeps earcut triangulation happy.
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (let i = 1; i <= teeth; i++) {
    const t = i / (teeth + 1);
    const bulge = Math.sin(t * Math.PI) * wid * 0.5;
    s.lineTo(-(bulge + wid * 0.10), len * (t - 0.04));
    s.lineTo(-bulge * 0.86, len * t);
  }
  s.lineTo(0, len);
  for (let i = teeth; i >= 1; i--) {
    const t = i / (teeth + 1);
    const bulge = Math.sin(t * Math.PI) * wid * 0.5;
    s.lineTo(bulge * 0.86, len * t);
    s.lineTo(bulge + wid * 0.10, len * (t - 0.04));
  }
  return s;
}

function petalShape(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid * 0.62, len * 0.3, wid * 0.42, len * 0.72);
  s.quadraticCurveTo(wid * 0.2, len * 1.0, 0, len);
  s.quadraticCurveTo(-wid * 0.2, len * 1.0, -wid * 0.42, len * 0.72);
  s.quadraticCurveTo(-wid * 0.62, len * 0.3, 0, 0);
  return s;
}

function shapeMesh(shape, material, curveSegments = 10) {
  const geom = new THREE.ShapeGeometry(shape, curveSegments);
  normalizeShapeUVs(geom);
  return new THREE.Mesh(geom, material);
}

// ============================================================================
// ROCKOR — craggy rune-cracked rock golem
// ============================================================================
function buildRockor() {
  const g = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({
    map: texRockColor(),
    bumpMap: texRockBump(),
    bumpScale: 0.5,
    roughness: 0.96,
    metalness: 0.04,
  });
  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x5f8a33, roughness: 1.0, metalness: 0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0d02, emissive: 0xffa030, emissiveIntensity: 1.8, roughness: 0.5,
  });
  const runeMat = new THREE.MeshStandardMaterial({
    map: texRune(),
    emissiveMap: texRune(),
    emissive: 0xff9226,
    emissiveIntensity: 2.2,
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  const quartzMat = new THREE.MeshStandardMaterial({
    color: 0xd8c6ff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.05,
    metalness: 0.1,
    emissive: 0xb398ff,
    emissiveIntensity: 0.35,
    depthWrite: false,
  });

  const boulder = (r, detail, jit, seed) =>
    new THREE.Mesh(jitterGeometry(new THREE.DodecahedronGeometry(r, detail), jit, seed), rockMat);

  // Torso — big craggy boulder
  const torso = boulder(0.6, 1, 0.16, 1);
  torso.scale.set(1, 1.05, 0.85);
  torso.position.y = 0.98;
  g.add(torso);

  // Pelvis boulder
  const pelvis = boulder(0.42, 1, 0.14, 2);
  pelvis.scale.set(1, 0.85, 0.85);
  pelvis.position.y = 0.46;
  g.add(pelvis);

  // Stumpy legs + flat slab feet (feet sit on y = 0)
  for (const sx of [-1, 1]) {
    const leg = boulder(0.24, 0, 0.16, 3 + sx);
    leg.scale.set(0.9, 1.15, 0.9);
    leg.position.set(sx * 0.28, 0.3, 0);
    g.add(leg);
    const foot = boulder(0.27, 0, 0.14, 5 + sx);
    foot.scale.set(1.15, 0.5, 1.3);
    foot.position.set(sx * 0.3, 0.12, 0.06);
    g.add(foot);
  }

  // Massive shoulders, hanging forearms and knuckle-dragging fists
  for (const sx of [-1, 1]) {
    const shoulder = boulder(0.3, 1, 0.16, 7 + sx);
    shoulder.position.set(sx * 0.63, 1.34, 0);
    g.add(shoulder);

    const forearm = boulder(0.2, 0, 0.14, 9 + sx);
    forearm.scale.set(0.8, 2.3, 0.8);
    forearm.position.set(sx * 0.74, 0.85, 0.08);
    forearm.rotation.z = sx * -0.12;
    g.add(forearm);

    const fist = boulder(0.32, 1, 0.18, 11 + sx);
    fist.scale.set(1, 0.95, 1.05);
    fist.position.set(sx * 0.8, 0.32, 0.16);
    g.add(fist);

    // Knuckle pebbles on the fist tops
    for (let k = 0; k < 3; k++) {
      const kn = boulder(0.07, 0, 0.2, 20 + sx * 3 + k);
      kn.position.set(sx * (0.68 + k * 0.1), 0.58, 0.24 + k * 0.04);
      g.add(kn);
    }
  }

  // Head with overhanging stone brow and deep-set ember eyes
  const head = boulder(0.27, 1, 0.14, 15);
  head.scale.set(1, 0.85, 0.95);
  head.position.set(0, 1.55, 0.12);
  g.add(head);

  const brow = boulder(0.16, 0, 0.18, 16);
  brow.scale.set(1.6, 0.45, 0.9);
  brow.position.set(0, 1.68, 0.27);
  g.add(brow);

  const jaw = boulder(0.14, 0, 0.16, 17);
  jaw.scale.set(1.4, 0.5, 1.0);
  jaw.position.set(0, 1.4, 0.22);
  g.add(jaw);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
    eye.position.set(sx * 0.12, 1.57, 0.31);
    g.add(eye);
  }

  // Glowing rune-crack patch hugging the chest (spherical shell segment)
  const runePatch = new THREE.Mesh(
    new THREE.SphereGeometry(0.64, 24, 18,
      Math.PI / 2 - 0.75, 1.5,   // phi: centred on +z (forward)
      Math.PI / 2 - 0.7, 1.3),   // theta: centred on the equator
    runeMat
  );
  runePatch.scale.set(1, 1.05, 0.92);
  runePatch.position.copy(torso.position);
  runePatch.castShadow = false;
  g.add(runePatch);

  // Moss patches draped over shoulders, back and head
  const mossSpots = [
    [-0.55, 1.55, -0.05, 0.16], [0.5, 1.58, 0.08, 0.13],
    [0.1, 1.5, -0.42, 0.2], [-0.15, 1.76, 0.0, 0.11], [0.3, 0.62, -0.3, 0.12],
  ];
  for (const [x, y, z, r] of mossSpots) {
    const moss = new THREE.Mesh(
      jitterGeometry(new THREE.SphereGeometry(r, 10, 8), 0.25, x * 7 + z * 3), mossMat);
    moss.scale.y = 0.38;
    moss.position.set(x, y, z);
    g.add(moss);
  }

  // Loose rubble chunks resting on the shoulders / traps
  const rubbleSeats = [
    [-0.52, 1.66, 0.1, 0.09], [-0.66, 1.6, -0.12, 0.07],
    [0.58, 1.64, -0.06, 0.1], [0.44, 1.7, 0.12, 0.06], [0.05, 1.62, -0.3, 0.08],
  ];
  rubbleSeats.forEach(([x, y, z, r], i) => {
    const chunk = boulder(r, 0, 0.22, 30 + i);
    chunk.position.set(x, y, z);
    chunk.rotation.set(i * 1.3, i * 0.7, i * 2.1);
    g.add(chunk);
  });

  // Translucent quartz crystal shards jutting from the back: hexagonal
  // prism column capped by a pointed tip, leaning backwards off the spine.
  const shardDefs = [
    // [x, y, z, radius, height, leanX, leanZ]
    [0.0, 1.42, -0.42, 0.09, 0.55, -0.85, 0.05],
    [-0.26, 1.18, -0.38, 0.07, 0.42, -0.7, -0.3],
    [0.24, 1.02, -0.36, 0.06, 0.34, -0.65, 0.35],
  ];
  const shardMeshes = [];
  for (const [x, y, z, r, h, leanX, leanZ] of shardDefs) {
    const shard = new THREE.Group();
    const column = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r, h, 6), quartzMat);
    column.position.y = h * 0.5;
    shard.add(column);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, h * 0.45, 6), quartzMat);
    tip.position.y = h + h * 0.225;
    shard.add(tip);
    shard.position.set(x, y, z);
    shard.rotation.set(leanX, 0, leanZ);
    shard.traverse((o) => { if (o.isMesh) shardMeshes.push(o); });
    g.add(shard);
  }

  applyShadows(g);
  runePatch.castShadow = false;
  shardMeshes.forEach((m) => { m.castShadow = false; });
  return g;
}

// ============================================================================
// VINEX — budding plant creature with vines, leaves and root feet
// ============================================================================
function buildVinex() {
  const g = new THREE.Group();

  const bulbMat = new THREE.MeshStandardMaterial({
    map: texBulb(), roughness: 0.7, metalness: 0,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    map: texLeaf(), roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
  });
  const petalMat = new THREE.MeshStandardMaterial({
    map: texPetal(), roughness: 0.6, metalness: 0, side: THREE.DoubleSide,
  });
  const vineMat = new THREE.MeshStandardMaterial({
    color: 0x3f7a2c, roughness: 0.8, metalness: 0,
  });
  const rootMat = new THREE.MeshStandardMaterial({
    color: 0x6b4e2e, roughness: 0.95, metalness: 0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x200404, emissive: 0xff2222, emissiveIntensity: 1.9, roughness: 0.4,
  });
  const pistilMat = new THREE.MeshStandardMaterial({
    color: 0xffd84d, emissive: 0xffc428, emissiveIntensity: 0.7, roughness: 0.6,
  });

  // Bulb body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 28, 22), bulbMat);
  body.scale.set(1, 1.18, 0.95);
  body.position.y = 0.85;
  g.add(body);

  // Head bud with glowing red eyes and a sprout
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 18), bulbMat);
  head.scale.set(1, 0.92, 1.02);
  head.position.set(0, 1.46, 0.12);
  g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), eyeMat);
    eye.position.set(sx * 0.11, 1.5, 0.3);
    g.add(eye);
  }
  const sproutStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.16, 6), vineMat);
  sproutStem.position.set(0, 1.72, 0.06);
  sproutStem.rotation.x = -0.2;
  g.add(sproutStem);
  const sproutLeaf = shapeMesh(serratedLeafShape(0.18, 0.1, 4), leafMat, 6);
  sproutLeaf.position.set(0, 1.78, 0.04);
  sproutLeaf.rotation.x = -0.9;
  g.add(sproutLeaf);

  // Root-like feet: four gnarled tubes splaying to the ground + tip caps
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.42, 0),
      new THREE.Vector3(0.02, 0.24, 0.2),
      new THREE.Vector3(-0.02, 0.08, 0.36),
      new THREE.Vector3(0.01, 0.045, 0.52),
    ]);
    const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.058, 7), rootMat);
    holder.add(root);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), rootMat);
    tip.position.set(0.01, 0.045, 0.52);
    holder.add(tip);
    g.add(holder);
  }

  // Big budding flower on the back: stem, two petal rings, glowing pistil
  const flower = new THREE.Group();
  flower.position.set(0, 1.16, -0.36);
  flower.rotation.x = -0.95; // axis leans up and back
  g.add(flower);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.34, 8), vineMat);
  stem.position.y = -0.14;
  flower.add(stem);

  const ringSpecs = [
    { n: 6, len: 0.4, wid: 0.22, tilt: 0.95, off: 0 },
    { n: 5, len: 0.3, wid: 0.17, tilt: 0.5, off: 0.5 },
  ];
  for (const ring of ringSpecs) {
    for (let i = 0; i < ring.n; i++) {
      const holder = new THREE.Group();
      holder.rotation.y = (i / ring.n) * Math.PI * 2 + ring.off;
      const petal = shapeMesh(petalShape(ring.len, ring.wid), petalMat, 8);
      curlShapeGeometry(petal.geometry, -0.22); // cup each petal backwards
      petal.rotation.x = ring.tilt;
      petal.position.y = 0.02;
      holder.add(petal);
      flower.add(holder);
    }
  }
  const pistil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), pistilMat);
  pistil.position.y = 0.06;
  flower.add(pistil);

  // Broad serrated leaves skirting the body
  const leafSpots = [0.35, 1.45, 2.6, 3.7, 4.9];
  leafSpots.forEach((ang, i) => {
    const holder = new THREE.Group();
    holder.rotation.y = ang;
    const leaf = shapeMesh(serratedLeafShape(0.62, 0.34, 7), leafMat, 6);
    leaf.position.set(0, 0.52, 0.36);
    leaf.rotation.x = 1.15 + (i % 2) * 0.22; // droop outward
    holder.add(leaf);
    g.add(holder);
  });

  // Curling vine tendrils from the shoulders
  const tendrilDefs = [
    { sx: 1, seedY: 0 },
    { sx: -1, seedY: 0.6 },
    { sx: 1, seedY: 2.4, back: true },
  ];
  const thornMat = new THREE.MeshStandardMaterial({
    color: 0x7c4f24, roughness: 0.8, metalness: 0,
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of tendrilDefs) {
    const sx = t.sx;
    const zb = t.back ? -1 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.3, 1.05, zb * 0.06),
      new THREE.Vector3(sx * 0.58, 1.18 + Math.sin(t.seedY) * 0.06, zb * 0.2),
      new THREE.Vector3(sx * 0.78, 0.95, zb * 0.05),
      new THREE.Vector3(sx * 0.7, 0.72, zb * -0.12),
      new THREE.Vector3(sx * 0.86, 0.6, zb * 0.06),
      new THREE.Vector3(sx * 0.78, 0.52, zb * 0.16),
    ]);
    const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.032, 7), vineMat);
    g.add(vine);
    // Recurved thorns studding the tendril, pointing away from the body
    for (let k = 1; k <= 5; k++) {
      const tt = 0.1 + (k / 6) * 0.82;
      const p = curve.getPoint(tt);
      const out = new THREE.Vector3(p.x, 0, p.z).normalize().add(new THREE.Vector3(0, 0.5, 0)).normalize();
      const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.075, 5), thornMat);
      thorn.quaternion.setFromUnitVectors(up, out);
      thorn.position.copy(p).addScaledVector(out, 0.045);
      g.add(thorn);
    }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), pistilMat);
    bud.position.copy(curve.getPoint(1));
    g.add(bud);
  }

  // Three hanging seed pods on drooping stalks beneath the leaf skirt
  const podMat = new THREE.MeshStandardMaterial({
    color: 0x9c8030, roughness: 0.65, metalness: 0,
  });
  const podAngles = [0.95, 3.1, 5.3];
  podAngles.forEach((ang, i) => {
    const holder = new THREE.Group();
    holder.rotation.y = ang;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.2, 5), vineMat);
    stalk.position.set(0, 0.66, 0.4);
    stalk.rotation.x = 0.3;
    holder.add(stalk);
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.09, 4, 10), podMat);
    pod.scale.set(1, 1.1 + i * 0.08, 1);
    pod.position.set(0, 0.5, 0.43);
    holder.add(pod);
    const podTip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 6), thornMat);
    podTip.rotation.x = Math.PI;
    podTip.position.set(0, 0.4, 0.43);
    holder.add(podTip);
    g.add(holder);
  });

  applyShadows(g);
  return g;
}

// ============================================================================
// AQUISH — sleek glossy amphibian with translucent fins
// ============================================================================
function buildAquish() {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    map: texWave(),
    roughness: 0.1,
    metalness: 0.05,
    envMapIntensity: 1.4,
  });
  const finMat = new THREE.MeshStandardMaterial({
    map: texFin(),
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    envMapIntensity: 1.3,
    depthWrite: false,
  });
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xd4f1ff,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x04121f, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.6,
  });
  const highlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xeaf8ff, emissiveIntensity: 1.2, roughness: 0.3,
  });
  const gillMat = new THREE.MeshStandardMaterial({
    color: 0x062a40, roughness: 0.5, metalness: 0,
  });
  const dropletMat = new THREE.MeshStandardMaterial({
    color: 0x9fdfff, emissive: 0x66ccff, emissiveIntensity: 0.7,
    roughness: 0.1, transparent: true, opacity: 0.9,
  });

  // Torso — sleek upright capsule with a slight forward lean
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 8, 20), bodyMat);
  torso.position.set(0, 0.82, 0);
  torso.rotation.x = 0.12;
  g.add(torso);

  // Head with a smooth muzzle
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 26, 20), bodyMat);
  head.scale.set(1, 0.95, 1.12);
  head.position.set(0, 1.32, 0.1);
  g.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), bodyMat);
  muzzle.scale.set(1.1, 0.7, 1.2);
  muzzle.position.set(0, 1.26, 0.31);
  g.add(muzzle);

  // Big dark reflective eyes with emissive catchlights
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), eyeMat);
    eye.position.set(sx * 0.145, 1.38, 0.2);
    g.add(eye);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), highlightMat);
    dot.position.set(sx * 0.165, 1.42, 0.26);
    dot.castShadow = false;
    g.add(dot);
  }

  // Gill slits: three thin dark grooves on each side of the neck
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const gill = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.15, 0.045), gillMat);
      gill.position.set(sx * 0.225, 1.1, 0.12 - i * 0.075);
      gill.rotation.set(0.1, sx * 0.25, sx * (0.12 + i * 0.05));
      gill.castShadow = false;
      g.add(gill);
    }
  }

  // Spiky translucent dorsal fin running down the spine
  const dorsal = new THREE.Shape();
  dorsal.moveTo(0, 0);
  dorsal.quadraticCurveTo(0.1, 0.34, 0.24, 0.3);
  dorsal.quadraticCurveTo(0.3, 0.16, 0.36, 0.26);
  dorsal.quadraticCurveTo(0.46, 0.22, 0.52, 0.12);
  dorsal.quadraticCurveTo(0.62, 0.1, 0.68, 0);
  dorsal.lineTo(0, 0);
  const dorsalMesh = shapeMesh(dorsal, finMat, 10);
  dorsalMesh.rotation.y = Math.PI / 2; // shape +x now runs toward -z (down the back)
  dorsalMesh.position.set(0, 1.2, 0.02);
  g.add(dorsalMesh);

  // Small translucent head crest
  const crest = shapeMesh(featherShape(0.22, 0.12), finMat, 8);
  crest.rotation.set(0.7, Math.PI / 2, 0);
  crest.position.set(0, 1.5, 0.02);
  g.add(crest);

  // Tail: tapering tube curving back and down, ending in a caudal fin
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.62, -0.18),
    new THREE.Vector3(0, 0.42, -0.42),
    new THREE.Vector3(0, 0.33, -0.64),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.075, 10), bodyMat);
  g.add(tail);
  const caudal = new THREE.Shape();
  caudal.moveTo(0, 0);
  caudal.quadraticCurveTo(0.18, 0.26, 0.4, 0.3);
  caudal.quadraticCurveTo(0.3, 0.06, 0.34, -0.16);
  caudal.quadraticCurveTo(0.14, -0.14, 0, 0);
  const caudalMesh = shapeMesh(caudal, finMat, 10);
  caudalMesh.rotation.y = Math.PI / 2;
  caudalMesh.position.set(0, 0.33, -0.62);
  g.add(caudalMesh);

  // Flipper arms
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 6, 12), bodyMat);
    arm.position.set(sx * 0.32, 0.92, 0.06);
    arm.rotation.z = sx * 0.85;
    arm.rotation.y = sx * -0.3;
    g.add(arm);
    const palmFin = shapeMesh(featherShape(0.2, 0.14), finMat, 8);
    palmFin.rotation.set(-0.4, sx * 0.9, sx * -0.9);
    palmFin.position.set(sx * 0.42, 0.78, 0.1);
    g.add(palmFin);
  }

  // Legs with webbed feet (soles on y = 0)
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.2, 6, 12), bodyMat);
    thigh.position.set(sx * 0.18, 0.38, 0);
    thigh.rotation.z = sx * 0.18;
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 6, 12), bodyMat);
    shin.position.set(sx * 0.21, 0.18, 0.02);
    g.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), bodyMat);
    foot.scale.set(1.25, 0.4, 1.9);
    foot.position.set(sx * 0.21, 0.045, 0.12);
    g.add(foot);
  }

  // Very subtle emissive water-droplet speckles clinging to the body
  const drops = [
    [0.2, 1.0, 0.2], [-0.24, 0.9, 0.14], [0.1, 1.22, 0.24], [-0.12, 0.66, 0.26],
    [0.26, 0.74, -0.08], [-0.2, 1.18, -0.1], [0.04, 0.52, -0.22], [0.16, 1.42, 0.05],
  ];
  for (const [x, y, z] of drops) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), dropletMat);
    d.position.set(x, y, z);
    d.castShadow = false;
    g.add(d);
  }

  // Bubbles drifting up beside the head, as if just exhaled
  const bubbleDefs = [
    [0.26, 1.5, 0.32, 0.05], [-0.32, 1.4, 0.24, 0.034], [0.1, 1.66, 0.2, 0.042],
  ];
  const bubbles = [];
  for (const [x, y, z, r] of bubbleDefs) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), bubbleMat);
    b.position.set(x, y, z);
    g.add(b);
    bubbles.push(b);
  }

  applyShadows(g);
  dorsalMesh.castShadow = false;
  caudalMesh.castShadow = false;
  bubbles.forEach((b) => { b.castShadow = false; });
  return g;
}

// ============================================================================
// ZEPHYRA — violet storm bird (flying), origin at body centre
// ============================================================================
function buildZephyra() {
  const g = new THREE.Group();

  const featherMat = (tint = 0xffffff) => new THREE.MeshStandardMaterial({
    map: texFeather(), color: tint,
    roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
  });
  const crestTipMat = () => new THREE.MeshStandardMaterial({
    color: 0x0a2630, emissive: 0x66f2ff, emissiveIntensity: 1.8,
    roughness: 0.5, side: THREE.DoubleSide,
  });
  const bodyMat = featherMat();
  const beakMat = new THREE.MeshStandardMaterial({
    color: 0xe8b430, roughness: 0.35, metalness: 0.45, envMapIntensity: 1.1,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x06222e, emissive: 0x66e4ff, emissiveIntensity: 2.0, roughness: 0.4,
  });
  const nostrilMat = new THREE.MeshStandardMaterial({
    color: 0x2a1c05, roughness: 0.8, metalness: 0,
  });
  const streakMat = () => new THREE.MeshStandardMaterial({
    color: 0x0a2630, emissive: 0x7fe9ff, emissiveIntensity: 1.6,
    roughness: 0.6, side: THREE.DoubleSide,
  });
  const talonMat = new THREE.MeshStandardMaterial({
    color: 0xd9a82c, roughness: 0.5, metalness: 0.3,
  });

  // Body — streamlined along +z
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 26, 20), bodyMat);
  body.scale.set(0.85, 0.9, 1.4);
  g.add(body);

  // Chest tuft (slightly lighter puff under the throat)
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), featherMat());
  tuft.scale.set(1, 0.9, 0.9);
  tuft.position.set(0, -0.08, 0.3);
  g.add(tuft);

  // Head, golden beak with nostril dots, blazing cyan eyes
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 22, 16), bodyMat);
  head.position.set(0, 0.18, 0.44);
  g.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 12), beakMat);
  beak.rotation.x = Math.PI / 2; // point along +z
  beak.position.set(0, 0.15, 0.72);
  g.add(beak);
  for (const sx of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), nostrilMat);
    nostril.position.set(sx * 0.028, 0.185, 0.66);
    nostril.castShadow = false;
    g.add(nostril);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), eyeMat);
    eye.position.set(sx * 0.1, 0.23, 0.55);
    g.add(eye);
  }

  // Crest: three swept feathers fanned back off the crown, each finished
  // with an emissive cyan tip that reads even in silhouette
  for (let i = 0; i < 3; i++) {
    const len = 0.34 + i * 0.07;
    const cf = shapeMesh(featherShape(len, 0.09), featherMat(i % 2 ? 0xcfc2f2 : 0xffffff), 8);
    cf.rotation.set(0.55 + i * 0.28, Math.PI / 2, 0); // sweep back (-z) and up
    cf.position.set((i - 1) * 0.05, 0.32, 0.4);
    const tip = shapeMesh(featherShape(0.13, 0.05), crestTipMat(), 6);
    tip.position.set(len - 0.13, 0, 0.004);
    tip.userData.noShadow = true;
    cf.add(tip);
    g.add(cf);
  }

  // Wings: each is a Group pivoted at the wing root. Feathers extend along
  // local +x; the left wing mirrors via scale.x = -1, so with sign = -1 the
  // game's wing.rotation.z = sign * sin(t*11) * 0.5 flaps both tips upward
  // in mirror symmetry (positive rotation.z raises the +x wing tip).
  function buildWingContents(wing) {
    const featherDefs = [
      // [length, width, zOffset, fanRotY, liftRotZ]
      [1.35, 0.3, 0.14, -0.1, 0.02],
      [1.22, 0.28, 0.02, 0.08, 0.0],
      [1.04, 0.26, -0.1, 0.26, -0.02],
      [0.84, 0.24, -0.2, 0.45, -0.04],
    ];
    featherDefs.forEach(([len, wid, z, fan, lift], i) => {
      // Alternating light / dusky tone per layered feather for depth
      const f = shapeMesh(featherShape(len, wid), featherMat(i % 2 ? 0xc4b4ee : 0xffffff), 10);
      f.rotation.x = -Math.PI / 2; // lay flat: shape +y -> -z
      const holder = new THREE.Group();
      holder.add(f);
      holder.position.set(0.02 * i, -0.004 * i, z);
      holder.rotation.y = fan;
      holder.rotation.z = lift;
      wing.add(holder);
      // Faint cyan emissive streak near the tips of the two leading feathers
      if (i < 2) {
        const streak = shapeMesh(featherShape(0.3, 0.06), streakMat(), 6);
        streak.rotation.x = -Math.PI / 2;
        streak.position.set(len - 0.32, 0.012, 0);
        streak.castShadow = false;
        holder.add(streak);
      }
    });
    // Feathered shoulder covert hiding the root
    const covert = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), featherMat());
    covert.scale.set(1.5, 0.7, 1.1);
    covert.position.set(0.08, 0.02, 0);
    wing.add(covert);
  }

  const wingR = new THREE.Group();
  wingR.position.set(0.26, 0.1, 0.05); // pivot at the right wing root
  wingR.userData.sign = 1;             // +rotation.z raises the +x tip
  buildWingContents(wingR);
  g.add(wingR);

  const wingL = new THREE.Group();
  wingL.position.set(-0.26, 0.1, 0.05); // pivot at the left wing root
  wingL.scale.x = -1;                   // mirror of the right wing
  wingL.userData.sign = -1;             // -rotation.z raises the -x tip
  buildWingContents(wingL);
  g.add(wingL);

  g.userData.flapWings = [wingR, wingL];

  // Forked tail: two long trailing streamers splayed behind, a shorter
  // dusky pair just inside them, plus a short centre feather
  const tailDefs = [
    [1.05, 0.15, Math.PI / 2 - 0.22, -0.07, 0xffffff],
    [1.05, 0.15, Math.PI / 2 + 0.22, 0.07, 0xffffff],
    [0.78, 0.13, Math.PI / 2 - 0.1, -0.035, 0xc4b4ee],
    [0.78, 0.13, Math.PI / 2 + 0.1, 0.035, 0xc4b4ee],
    [0.55, 0.13, Math.PI / 2, 0, 0xffffff],
  ];
  for (const [len, wid, rotY, x, tint] of tailDefs) {
    const tf = shapeMesh(featherShape(len, wid), featherMat(tint), 8);
    tf.rotation.set(-0.18, rotY, 0); // along -z, tips lifted slightly
    tf.position.set(x, 0.02, -0.36);
    g.add(tf);
  }

  // Tucked talons
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.08, 4, 8), bodyMat);
    leg.position.set(sx * 0.12, -0.26, 0.1);
    g.add(leg);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), talonMat);
    claw.rotation.x = Math.PI / 2.4;
    claw.position.set(sx * 0.12, -0.32, 0.16);
    g.add(claw);
  }

  applyShadows(g);
  return g;
}

// ============================================================================
// SPECIES EXPORT
// ============================================================================
const rockor = {
  name: "ROCKOR",
  hp: 85, speed: 2.1, damage: 11, range: 26, attackCd: 2.6,
  score: 150, xp: 38, flying: false,
  projectile: { color: 0xa89878, speed: 17, size: 0.28 },
  build: buildRockor,
};

const vinex = {
  name: "VINEX",
  hp: 58, speed: 2.9, damage: 9, range: 30, attackCd: 2.4,
  score: 120, xp: 30, flying: false,
  projectile: { color: 0x88ee33, speed: 19, size: 0.16 },
  build: buildVinex,
};

const aquish = {
  name: "AQUISH",
  hp: 48, speed: 4.2, damage: 8, range: 28, attackCd: 2.0,
  score: 110, xp: 26, flying: false,
  projectile: { color: 0x44aaff, speed: 23, size: 0.14 },
  build: buildAquish,
};

const zephyra = {
  name: "ZEPHYRA",
  hp: 42, speed: 9, damage: 9, range: 30, attackCd: 2.2,
  score: 160, xp: 42, flying: true,
  projectile: { color: 0x9fe8ff, speed: 26, size: 0.16 },
  build: buildZephyra,
};

export const SPECIES = { rockor, vinex, aquish, zephyra };
