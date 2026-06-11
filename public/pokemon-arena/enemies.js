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

function applyShadows(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
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
  return canvasTex("rockColor", 256, (ctx, S) => {
    const rng = mulberry32(101);
    ctx.fillStyle = "#8a7e6a";
    ctx.fillRect(0, 0, S, S);
    // Mottled mineral splotches
    for (let i = 0; i < 420; i++) {
      const g = 95 + rng() * 90;
      ctx.fillStyle = `rgba(${g | 0},${(g * 0.92) | 0},${(g * 0.74) | 0},${0.10 + rng() * 0.1})`;
      const r = 3 + rng() * 16;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Faint sediment strata
    ctx.globalAlpha = 0.12;
    for (let y = 0; y < S; y += 14 + (rng() * 10) | 0) {
      ctx.fillStyle = rng() < 0.5 ? "#6f6453" : "#9c8f78";
      ctx.fillRect(0, y, S, 2 + rng() * 4);
    }
    ctx.globalAlpha = 1;
    // Dark jagged cracks with side branches
    ctx.strokeStyle = "#322b21";
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      let x = rng() * S, y = rng() * S;
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 5 + (rng() * 5) | 0;
      for (let k = 0; k < steps; k++) {
        x += (rng() - 0.5) * 44;
        y += (rng() - 0.3) * 36;
        ctx.lineTo(x, y);
        if (rng() < 0.4) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rng() - 0.5) * 26, y + (rng() - 0.5) * 26);
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
    // Lichen / moss dusting
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(86,118,52,${0.10 + rng() * 0.14})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, 4 + rng() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

function texRockBump() {
  return canvasTex("rockBump", 256, (ctx, S) => {
    const rng = mulberry32(202);
    ctx.fillStyle = "#7f7f7f";
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 600; i++) {
      const g = 70 + rng() * 130;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},0.22)`;
      const r = 2 + rng() * 14;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#101010";
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      let x = rng() * S, y = rng() * S;
      ctx.lineWidth = 1.5 + rng() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rng() - 0.5) * 46;
        y += (rng() - 0.3) * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function texRune() {
  return canvasTex("rune", 256, (ctx, S) => {
    const rng = mulberry32(303);
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = "#ffb547";
    ctx.lineCap = "round";
    ctx.shadowColor = "#ff9020";
    ctx.shadowBlur = 9;
    // Jagged glowing fissures radiating from the heart of the chest
    const cx = S * 0.5, cy = S * 0.46;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + rng() * 0.5;
      let x = cx + Math.cos(ang) * 8;
      let y = cy + Math.sin(ang) * 8;
      ctx.lineWidth = 4.5 - i * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const steps = 4 + (rng() * 3) | 0;
      for (let k = 0; k < steps; k++) {
        x += Math.cos(ang + (rng() - 0.5) * 1.1) * (14 + rng() * 18);
        y += Math.sin(ang + (rng() - 0.5) * 1.1) * (14 + rng() * 18);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Small angular rune glyphs scattered around the fissures
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
    // Molten core hot-spot
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
    g.addColorStop(0, "rgba(255,220,150,0.95)");
    g.addColorStop(1, "rgba(255,150,40,0)");
    ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
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
  return canvasTex("leaf", 256, (ctx, S) => {
    const grad = ctx.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, "#2f7a26");
    grad.addColorStop(1, "#79bf3f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Central vein (leaf shapes run bottom -> top in UV space)
    ctx.strokeStyle = "rgba(214,240,150,0.85)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(S / 2, S * 0.98);
    ctx.lineTo(S / 2, S * 0.04);
    ctx.stroke();
    // Side veins
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(206,235,140,0.55)";
    for (let i = 0; i < 9; i++) {
      const y = S * (0.12 + i * 0.095);
      ctx.beginPath();
      ctx.moveTo(S / 2, y + 12);
      ctx.quadraticCurveTo(S * 0.3, y + 2, S * 0.08, y - 10);
      ctx.moveTo(S / 2, y + 12);
      ctx.quadraticCurveTo(S * 0.7, y + 2, S * 0.92, y - 10);
      ctx.stroke();
    }
  }, { srgb: true });
}

function texPetal() {
  return canvasTex("petal", 128, (ctx, S) => {
    const grad = ctx.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, "#c23a8c");
    grad.addColorStop(0.6, "#f06bb4");
    grad.addColorStop(1, "#ffe2f2");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const x = S * (0.2 + i * 0.1);
      ctx.beginPath();
      ctx.moveTo(S / 2, S * 0.98);
      ctx.quadraticCurveTo(x, S * 0.5, x * 0.7 + S * 0.15, S * 0.05);
      ctx.stroke();
    }
  }, { srgb: true });
}

// --- AQUISH textures ---------------------------------------------------------
function texWave() {
  return canvasTex("wave", 256, (ctx, S) => {
    const rng = mulberry32(505);
    // v=1 (texture top) is the creature's back: deep blue fading to pale belly
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, "#0a3a72");
    grad.addColorStop(0.45, "#1873c2");
    grad.addColorStop(0.78, "#6fc2ec");
    grad.addColorStop(1, "#dff4fd");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    // Rolling wave streaks
    ctx.lineWidth = 2.2;
    for (let row = 0; row < 9; row++) {
      const y0 = S * (0.08 + row * 0.105);
      ctx.strokeStyle = `rgba(220,245,255,${0.30 - row * 0.025})`;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = y0 + Math.sin((x / S) * Math.PI * 4 + row * 1.7) * 5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Subtle darker dapples along the back
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(8,40,80,${0.08 + rng() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(rng() * S, rng() * S * 0.45, 4 + rng() * 9, 2 + rng() * 4, rng(), 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

// --- ZEPHYRA textures --------------------------------------------------------
function texFeather() {
  return canvasTex("feather", 256, (ctx, S) => {
    const rng = mulberry32(606);
    ctx.fillStyle = "#5b3fa0";
    ctx.fillRect(0, 0, S, S);
    // Layered feather scallops, row by row, each row offset like shingles
    const rowH = 22;
    for (let row = 0; row < S / rowH + 1; row++) {
      const y = row * rowH;
      const off = (row % 2) * 14;
      for (let x = -14; x < S + 14; x += 28) {
        const cx = x + off;
        const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
        grad.addColorStop(0, "#7c5fc8");
        grad.addColorStop(1, "#4a3088");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx - 13, y);
        ctx.quadraticCurveTo(cx, y + rowH * 1.35, cx + 13, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(30,18,64,0.7)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // Tiny shaft line on each feather
        ctx.strokeStyle = "rgba(190,170,255,0.30)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y + 2);
        ctx.lineTo(cx, y + rowH * 0.9);
        ctx.stroke();
      }
    }
    // Storm shimmer flecks
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(170,220,255,${0.06 + rng() * 0.1})`;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, 1 + rng() * 2.5, 0, Math.PI * 2);
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
    emissiveIntensity: 1.8,
    transparent: true,
    depthWrite: false,
    roughness: 1,
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

  applyShadows(g);
  runePatch.castShadow = false;
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
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), pistilMat);
    bud.position.copy(curve.getPoint(1));
    g.add(bud);
  }

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
    roughness: 0.15,
    metalness: 0.05,
    envMapIntensity: 1.2,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x7fd8f2,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    envMapIntensity: 1.2,
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

  applyShadows(g);
  dorsalMesh.castShadow = false;
  caudalMesh.castShadow = false;
  return g;
}

// ============================================================================
// ZEPHYRA — violet storm bird (flying), origin at body centre
// ============================================================================
function buildZephyra() {
  const g = new THREE.Group();

  const featherMat = () => new THREE.MeshStandardMaterial({
    map: texFeather(), roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
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

  // Crest: three swept feathers fanned back off the crown
  for (let i = 0; i < 3; i++) {
    const cf = shapeMesh(featherShape(0.34 + i * 0.07, 0.09), featherMat(), 8);
    cf.rotation.set(0.55 + i * 0.28, Math.PI / 2, 0); // sweep back (-z) and up
    cf.position.set((i - 1) * 0.05, 0.32, 0.4);
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
      const f = shapeMesh(featherShape(len, wid), featherMat(), 10);
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

  // Forked tail: two long feathers splayed behind, plus a short centre feather
  const tailDefs = [
    [0.7, 0.16, Math.PI / 2 - 0.2, -0.06],
    [0.7, 0.16, Math.PI / 2 + 0.2, 0.06],
    [0.45, 0.14, Math.PI / 2, 0],
  ];
  for (const [len, wid, rotY, x] of tailDefs) {
    const tf = shapeMesh(featherShape(len, wid), featherMat(), 8);
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
