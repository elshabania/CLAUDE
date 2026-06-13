// ============================================================================
// ash.js — Procedural Ash Ketchum-style Pokémon trainer NPC (VISUAL QUALITY v2)
// Self-contained ES module: geometry + canvas textures only, no external URLs.
// export buildAsh() -> THREE.Group, origin at feet, +z forward, ~1.8 units tall.
// group.userData.arms = [leftArm, rightArm], pivoted at the shoulders so that
// rotation.x = 0 hangs naturally and rotation.x = -3.1 reaches straight up.
// ============================================================================
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Cel/toon shading: quantize diffuse lighting into 3 hard bands via an
// onBeforeCompile hook so every MeshStandardMaterial reads like flat anime ink.
function celShade(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
       {
         // Re-quantize the accumulated direct diffuse into 3 toon bands.
         float _lum = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
         float _band = _lum < 0.18 ? 0.45 : (_lum < 0.55 ? 0.78 : 1.0);
         reflectedLight.directDiffuse = _lum > 0.0001
           ? reflectedLight.directDiffuse * (_band / _lum)
           : reflectedLight.directDiffuse;
       }`
    );
  };
  // Force a recompile if the material is reused.
  material.customProgramCacheKey = () => "ashToon3band";
  return material;
}

function mat(color, roughness = 0.8, opts = {}) {
  return celShade(
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.0,
      envMapIntensity: 0.5,
      ...opts,
    })
  );
}

// Thin inverted-hull outline: clone geometry, draw backfaces pushed out along
// the normals in solid black for an anime ink-line silhouette.
function addOutline(mesh, thickness = 0.012) {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      side: THREE.BackSide,
    })
  );
  // Scale the hull outward in local space proportional to the mesh size.
  mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : 1;
  const k = 1 + thickness / Math.max(r, 0.02);
  outline.scale.set(k, k, k);
  outline.userData.noShadow = true;
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

function canvasTexture(size, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Grayscale noise (linear space) used as a bump map for fabric weave.
function makeWeaveBumpTexture() {
  return canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 6000; i++) {
        const v = 96 + ((Math.random() * 64) | 0);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 1);
      }
      // faint horizontal weave threads
      ctx.fillStyle = "rgba(60,60,60,0.18)";
      for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1);
    },
    false
  );
}

// Subtle multiplicative weave noise drawn on top of a colored texture.
function weaveOverlay(ctx, s, alpha = 0.05) {
  for (let i = 0; i < s * 14; i++) {
    ctx.fillStyle =
      Math.random() < 0.5
        ? `rgba(255,255,255,${alpha})`
        : `rgba(0,0,30,${alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 3, 1);
  }
}

const SKIN = 0xf2c099;
const SKIN_MAT = () => mat(SKIN, 0.55);
const FABRIC = 0.8;

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
function makeFaceTexture() {
  return canvasTexture(1024, (ctx, s) => {
    // Skin base with a soft vertical gradient
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#f8cfa6");
    g.addColorStop(0.55, "#f4c49a");
    g.addColorStop(1, "#eeba8e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);

    // Black hair: hairline band under the cap + hair wrapping the back of head
    ctx.fillStyle = "#181210";
    ctx.fillRect(0, 0, s, 336);
    ctx.fillRect(0, 0, 192, 660);   // back of head (u seam is at -z)
    ctx.fillRect(s - 192, 0, 192, 660);
    // Jagged hairline fringe
    ctx.beginPath();
    for (let x = 192; x <= s - 192; x += 64) {
      ctx.moveTo(x, 336);
      ctx.lineTo(x + 32, 392);
      ctx.lineTo(x + 64, 336);
    }
    ctx.fill();
    // Soft hair sheen
    const sheen = ctx.createLinearGradient(0, 60, 0, 300);
    sheen.addColorStop(0, "rgba(90,80,90,0.25)");
    sheen.addColorStop(1, "rgba(90,80,90,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(192, 60, s - 384, 240);

    // Subtle cheek shading / blush
    for (const cx of [316, 708]) {
      const r = ctx.createRadialGradient(cx, 604, 8, cx, 604, 92);
      r.addColorStop(0, "rgba(226,135,105,0.28)");
      r.addColorStop(1, "rgba(226,135,105,0)");
      ctx.fillStyle = r;
      ctx.fillRect(cx - 100, 504, 200, 200);
    }

    // Confident eyebrows: thick, angled down slightly toward the nose
    ctx.strokeStyle = "#15100c";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const sgn of [-1, 1]) {
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(512 + sgn * 40, 438);
      ctx.quadraticCurveTo(512 + sgn * 92, 408, 512 + sgn * 138, 414);
      ctx.stroke();
    }

    // Anime eyes: dark rim, white sclera, brown gradient iris, pupil, dual highlights
    for (const sgn of [-1, 1]) {
      const ex = 512 + sgn * 84;
      const ey = 512;
      ctx.fillStyle = "#15100c";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 56, 68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex, ey + 2, 47, 59, 0, 0, Math.PI * 2);
      ctx.fill();
      // Iris with radial gradient (lighter top -> deep brown rim)
      const iris = ctx.createRadialGradient(ex - 4, ey - 6, 4, ex, ey + 6, 46);
      iris.addColorStop(0, "#a06a36");
      iris.addColorStop(0.55, "#6b3f1d");
      iris.addColorStop(1, "#3e2210");
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(ex, ey + 6, 33, 45, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pupil
      ctx.fillStyle = "#150b04";
      ctx.beginPath();
      ctx.ellipse(ex, ey + 10, 16, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      // Upper eyelid line for a determined look
      ctx.strokeStyle = "#15100c";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(ex, ey - 4, 52, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
      // Highlights: big upper-left + small lower-right sparkle
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex - 13, ey - 14, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 12, ey + 26, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(ex + 4, ey + 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Signature zigzag (lightning-bolt) cheek marks — crisp, with a darker core
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const sgn of [-1, 1]) {
      const bx = 512 + sgn * 156;
      for (const [w, col] of [
        [20, "#5e3414"],
        [10, "#7a4a22"],
      ]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(bx, 592);
        ctx.lineTo(bx + sgn * 40, 616);
        ctx.lineTo(bx + sgn * 12, 628);
        ctx.lineTo(bx + sgn * 52, 656);
        ctx.stroke();
      }
    }

    // Tiny nose
    ctx.strokeStyle = "#c98b62";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(508, 592);
    ctx.lineTo(516, 604);
    ctx.stroke();

    // Confident smile: wide grin with upturned corners + lower lip hint
    ctx.strokeStyle = "#5a2e1a";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(454, 622);
    ctx.quadraticCurveTo(512, 672, 570, 622);
    ctx.stroke();
    // Corner ticks
    ctx.lineWidth = 10;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(512 + sgn * 58, 622);
      ctx.lineTo(512 + sgn * 66, 612);
      ctx.stroke();
    }
    // Lower lip shadow
    ctx.strokeStyle = "rgba(150,80,50,0.5)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(512, 632, 30, Math.PI * 0.3, Math.PI * 0.7);
    ctx.stroke();
  });
}

function makeJacketTexture() {
  return canvasTexture(512, (ctx, s) => {
    // Blue body with subtle side shading (u seam = front center on cylinder)
    ctx.fillStyle = "#2a5cc8";
    ctx.fillRect(0, 0, s, s);
    for (const cx of [128, 384]) {
      const g = ctx.createLinearGradient(cx - 70, 0, cx + 70, 0);
      g.addColorStop(0, "rgba(0,0,40,0)");
      g.addColorStop(0.5, "rgba(0,0,40,0.18)");
      g.addColorStop(1, "rgba(0,0,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 70, 0, 140, s);
    }
    // Fabric weave noise
    weaveOverlay(ctx, s, 0.045);

    // Green collar trim band at top with stitch line
    ctx.fillStyle = "#2f8f5b";
    ctx.fillRect(0, 0, s, 26);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(s, 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // White bottom hem
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 468, s, 44);
    // White front trim either side of the zipper (seam sits at +z)
    ctx.fillRect(10, 0, 36, s);
    ctx.fillRect(s - 46, 0, 36, s);
    // Trim stitching
    ctx.strokeStyle = "rgba(150,150,160,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    for (const tx of [44, s - 44]) {
      ctx.beginPath();
      ctx.moveTo(tx, 26);
      ctx.lineTo(tx, 468);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Zipper: yellow tape down the front seam with teeth + pull tab
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(0, 0, 10, s);
    ctx.fillRect(s - 10, 0, 10, s);
    ctx.fillStyle = "#b8902a";
    for (let y = 8; y < s; y += 16) {
      ctx.fillRect(0, y, 5, 7);
      ctx.fillRect(s - 5, y + 8, 5, 7);
    }
    // Zipper pull
    ctx.fillStyle = "#8a8a92";
    ctx.fillRect(0, 60, 9, 22);
    ctx.fillRect(s - 9, 60, 9, 22);

    // Pocket lines: angled welt pockets with double stitching
    for (const sgn of [0, 1]) {
      const px = sgn ? 426 : 86;
      const dir = sgn ? -1 : 1;
      ctx.strokeStyle = "rgba(8,16,52,0.7)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px - dir * 14, 352);
      ctx.lineTo(px + dir * 22, 438);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(px - dir * 22, 354);
      ctx.lineTo(px + dir * 14, 440);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function makeJeansTexture() {
  return canvasTexture(512, (ctx, s) => {
    // Denim base with vertical tonal variation
    ctx.fillStyle = "#3a5b9e";
    ctx.fillRect(0, 0, s, s);
    weaveOverlay(ctx, s, 0.05);

    // Knee fade: soft light band around mid height
    const fade = ctx.createLinearGradient(0, 190, 0, 330);
    fade.addColorStop(0, "rgba(190,205,235,0)");
    fade.addColorStop(0.5, "rgba(190,205,235,0.28)");
    fade.addColorStop(1, "rgba(190,205,235,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 190, s, 140);
    // Whisker creases at the knee
    ctx.strokeStyle = "rgba(210,220,240,0.18)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = 230 + i * 14;
      ctx.beginPath();
      ctx.moveTo(60, y + (i % 2) * 6);
      ctx.quadraticCurveTo(s / 2, y - 10, s - 60, y + ((i + 1) % 2) * 6);
      ctx.stroke();
    }

    // Side seam lines (u = 0.25 / 0.75 on the leg cylinders)
    for (const x of [128, 384]) {
      ctx.strokeStyle = "rgba(15,25,60,0.8)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
      // orange double stitching
      ctx.strokeStyle = "rgba(214,150,70,0.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      for (const off of [-6, 6]) {
        ctx.beginPath();
        ctx.moveTo(x + off, 0);
        ctx.lineTo(x + off, s);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // Hem stitching at the bottom
    ctx.strokeStyle = "rgba(214,150,70,0.7)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, s - 14);
    ctx.lineTo(s, s - 14);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function makeSneakerTexture() {
  return canvasTexture(256, (ctx, s) => {
    // Two-tone: red body, white toe zone (front of sphere is u = 0.25 -> x = 64)
    ctx.fillStyle = "#c8242c";
    ctx.fillRect(0, 0, s, s);
    const toe = ctx.createRadialGradient(64, 150, 8, 64, 150, 78);
    toe.addColorStop(0, "#f0f0f0");
    toe.addColorStop(0.8, "#e6e6e6");
    toe.addColorStop(1, "rgba(230,230,230,0)");
    ctx.fillStyle = toe;
    ctx.fillRect(0, 90, 150, 166);
    // Black side stripe
    ctx.fillStyle = "#141414";
    ctx.fillRect(120, 96, 136, 26);
    // Heel patch
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(176, 40, 48, 44);

    // Laces: white crisscross over the tongue area (top-front)
    ctx.strokeStyle = "#fafafa";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const y = 52 + i * 18;
      ctx.beginPath();
      ctx.moveTo(38, y);
      ctx.lineTo(90, y + 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(90, y);
      ctx.lineTo(38, y + 12);
      ctx.stroke();
    }
    // Eyelets
    ctx.fillStyle = "#5a5a5a";
    for (let i = 0; i < 4; i++) {
      const y = 54 + i * 18;
      ctx.beginPath();
      ctx.arc(36, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(92, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    weaveOverlay(ctx, s, 0.03);
  });
}

function makeCapTexture() {
  return canvasTexture(256, (ctx, s) => {
    // Red dome with panel seams + stitching
    ctx.fillStyle = "#d8242c";
    ctx.fillRect(0, 0, s, s);
    weaveOverlay(ctx, s, 0.04);
    for (let i = 0; i < 6; i++) {
      const x = (i * s) / 6;
      ctx.strokeStyle = "rgba(90,8,12,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,200,200,0.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 5, 0);
      ctx.lineTo(x + 5, s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function makeCapLogoTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, s, s);
    weaveOverlay(ctx, s, 0.025);
    // Stitched border around the white panel
    ctx.strokeStyle = "rgba(140,140,150,0.7)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Green stylized league mark: swoosh-backed "L"
    ctx.strokeStyle = "#1faa59";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(70, 178);
    ctx.quadraticCurveTo(128, 210, 190, 162);
    ctx.stroke();
    ctx.fillStyle = "#1faa59";
    ctx.fillRect(92, 52, 36, 124);
    ctx.fillRect(92, 148, 80, 30);
    ctx.fillStyle = "#157a3f";
    ctx.fillRect(92, 52, 36, 18);
  });
}

function makePokeballTexture() {
  return canvasTexture(256, (ctx, s) => {
    // White bottom with a soft sheen
    const wg = ctx.createLinearGradient(0, 138, 0, s);
    wg.addColorStop(0, "#f6f6f6");
    wg.addColorStop(1, "#dcdcdc");
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, s, s);
    // Glossy red top
    const rg = ctx.createLinearGradient(0, 0, 0, 120);
    rg.addColorStop(0, "#ef4048");
    rg.addColorStop(0.5, "#d8242c");
    rg.addColorStop(1, "#a8161e");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, s, 120);
    // Specular streak on the red half
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 22, s, 8);
    // Black band
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 120, s, 18);
    // Button (u = 0.25 -> faces +z on a default sphere)
    ctx.fillStyle = "#181818";
    ctx.beginPath();
    ctx.arc(64, 129, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(64, 129, 14, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Body part builders
// ---------------------------------------------------------------------------
function buildArm(side, restAtBelt = false) {
  // side: +1 = his left (+x), -1 = his right (-x). Pivot at shoulder; the arm
  // hangs along -y at rotation 0 so rotation.x of -3.1 points it overhead.
  // restAtBelt bends the elbow statically so the hand rests near the belt while
  // the shoulder pivot itself stays at 0 = natural hang.
  const arm = new THREE.Group();
  const weaveBump = makeWeaveBumpTexture();
  const white = mat(0xf2f2f2, FABRIC, { bumpMap: weaveBump, bumpScale: 0.6 });
  const skin = SKIN_MAT();
  const glove = mat(0x2f8f5b, 0.7);
  const gloveDark = mat(0x1f6b41, 0.65);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), white);
  arm.add(shoulder);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.17, 12), white);
  sleeve.position.y = -0.09;
  arm.add(sleeve);

  // Lower arm group pivots at the elbow so a static bend can pose the hand.
  const elbow = new THREE.Group();
  elbow.position.y = -0.185;
  arm.add(elbow);

  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.04, 0.21, 12), skin);
  forearm.position.y = -0.09;
  elbow.add(forearm);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.047, 0.05, 12), gloveDark);
  cuff.position.y = -0.2;
  elbow.add(cuff);

  // Hand: glove sphere + thumb + raised knuckle pads + bare fingertips
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), glove);
  hand.position.y = -0.255;
  hand.scale.set(0.9, 1.1, 0.8);
  elbow.add(hand);

  // Knuckle pad plate across the back of the hand
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.018), gloveDark);
  pad.position.set(0, -0.252, 0.042);
  elbow.add(pad);

  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), glove);
  thumb.position.set(-side * 0.04, -0.25, 0.025);
  elbow.add(thumb);

  for (let i = -1; i <= 1; i++) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), gloveDark);
    knuckle.position.set(side * i * 0.025, -0.267, 0.052);
    elbow.add(knuckle);
  }

  const fingers = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skin);
  fingers.position.y = -0.307;
  fingers.scale.set(1, 0.7, 0.8);
  elbow.add(fingers);

  // Ink outlines on the arm masses for the anime line look.
  addOutline(sleeve, 0.012);
  addOutline(forearm, 0.012);
  addOutline(hand, 0.012);

  if (restAtBelt) {
    // Static elbow bend: forearm swings forward/inward so the gloved hand
    // hovers right beside the PokéBall on the belt. Shoulder pivot stays 0.
    elbow.rotation.x = -0.55;
    elbow.rotation.z = -side * 0.35;
  }

  arm.position.set(side * 0.225, 1.345, 0);
  arm.rotation.z = side * (restAtBelt ? 0.06 : 0.1); // slight outward splay
  return arm;
}

function buildLeg(side, jeansTex, sneakerTex) {
  // Hip-pivot Group: rest rotation 0, the engine swings rotation.x +-0.7 for a
  // walk/run cycle. The pivot sits at the hip joint (HY); every child keeps the
  // same WORLD position it had before by being offset -HY in y, so the rest pose
  // is pixel-identical to the previous static stance.
  const HY = 0.86;
  const leg = new THREE.Group();
  leg.position.y = HY;
  leg.userData.side = side;
  const jeans = mat(0xffffff, FABRIC, { map: jeansTex });

  // Stance v2: feet planted slightly apart with a hint of toe-out.
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.068, 0.4, 12), jeans);
  thigh.position.set(side * 0.105, 0.66 - HY, 0);
  thigh.rotation.z = -side * 0.08;
  leg.add(thigh);

  // Boot-cut: calf flares slightly at the ankle
  const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.082, 0.36, 12), jeans);
  calf.position.set(side * 0.13, 0.29 - HY, 0.005);
  leg.add(calf);

  // Sneaker: white sole, two-tone laced upper from texture, black stripe
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.045, 0.27), mat(0xe9e9e9, 0.7));
  sole.position.set(side * 0.132, 0.025 - HY, 0.045);
  sole.rotation.y = side * 0.09;
  leg.add(sole);

  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 14, 12),
    mat(0xffffff, 0.65, { map: sneakerTex })
  );
  upper.position.set(side * 0.132, 0.085 - HY, 0.06);
  upper.scale.set(0.75, 0.75, 1.5);
  upper.rotation.y = side * 0.09;
  leg.add(upper);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.13), mat(0x141414, 0.6));
  stripe.position.set(side * 0.132, 0.085 - HY, 0.0);
  stripe.rotation.y = side * 0.09;
  leg.add(stripe);

  // Ink outlines on the leg masses.
  addOutline(thigh, 0.014);
  addOutline(calf, 0.014);
  addOutline(upper, 0.012);

  return leg;
}

function buildCap() {
  const cap = new THREE.Group();
  const red = mat(0xffffff, FABRIC, { map: makeCapTexture() });

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.05),
    red
  );
  dome.scale.set(1, 0.8, 1.05);
  cap.add(dome);

  // White front panel with the green league mark + stitched border
  const panel = new THREE.Mesh(
    new THREE.CircleGeometry(0.078, 24),
    mat(0xffffff, FABRIC, { map: makeCapLogoTexture() })
  );
  panel.position.set(0, 0.055, 0.152);
  panel.rotation.x = -0.42; // lean back to follow the dome slope
  cap.add(panel);

  // Curved brim: a pie wedge of a thin cylinder, tilted down at the front
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.175, 0.018, 20, 1, false, -0.95, 1.9),
    mat(0xd8242c, FABRIC)
  );
  brim.position.set(0, 0.005, 0.03);
  brim.scale.set(1, 1, 1.35);
  brim.rotation.x = 0.16;
  cap.add(brim);

  const button = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mat(0xd8242c, FABRIC));
  button.position.y = 0.135;
  cap.add(button);

  // Ink outline on the cap dome + brim.
  addOutline(dome, 0.013);
  addOutline(brim, 0.01);

  cap.position.y = 1.605;
  return cap;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function buildAsh() {
  const group = new THREE.Group();
  group.name = "ash";

  const jeansTex = makeJeansTexture();
  const sneakerTex = makeSneakerTexture();
  const weaveBump = makeWeaveBumpTexture();

  // ---- Legs & belt (feet slightly apart for a confident stance) ----
  // Hip-pivot Groups: the engine swings rotation.x +-0.7 for the walk/run cycle.
  const leftLeg = buildLeg(1, jeansTex, sneakerTex);
  const rightLeg = buildLeg(-1, jeansTex, sneakerTex);
  group.add(leftLeg, rightLeg);

  const hips = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.16, 0.12, 16),
    mat(0xffffff, FABRIC, { map: jeansTex })
  );
  hips.position.y = 0.82;
  hips.scale.z = 0.8;
  group.add(hips);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.045, 16), mat(0x2b2b2b, 0.55));
  belt.position.y = 0.875;
  belt.scale.z = 0.8;
  group.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), mat(0xc9c9cf, 0.3, { metalness: 0.7 }));
  buckle.position.set(0, 0.875, 0.128);
  group.add(buckle);

  // Poké Ball clipped to the belt — glossy with a tiny emissive button
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 20, 16),
    mat(0xffffff, 0.2, { map: makePokeballTexture(), envMapIntensity: 1.0 })
  );
  ball.position.set(0.125, 0.875, 0.1);
  ball.rotation.y = 0.5; // angle the button outward
  const ballButton = new THREE.Mesh(
    new THREE.SphereGeometry(0.009, 8, 8),
    celShade(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        emissive: 0xbfe8ff,
        emissiveIntensity: 0.9,
      })
    )
  );
  ballButton.position.set(0, 0, 0.048); // sits on the drawn button (+z local)
  ball.add(ballButton);
  group.add(ball);

  // ---- Torso: blue jacket over white tee (weave bump for fabric feel) ----
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.15, 0.52, 24, 4),
    mat(0xffffff, FABRIC, { map: makeJacketTexture(), bumpMap: weaveBump, bumpScale: 0.7 })
  );
  torso.position.y = 1.13;
  torso.scale.z = 0.78;
  group.add(torso);
  addOutline(torso, 0.016);

  // White t-shirt peeking at the neckline
  const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.08, 14), mat(0xf2f2f2, FABRIC));
  tee.position.y = 1.4;
  tee.scale.z = 0.85;
  group.add(tee);

  // Green collar ring
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 18), mat(0x2f8f5b, FABRIC));
  collar.position.y = 1.43;
  collar.rotation.x = Math.PI / 2;
  collar.scale.z = 0.85;
  group.add(collar);

  // ---- Backpack: main bag, front pocket, buckle straps, side pocket ----
  const packMat = mat(0x2f8f5b, FABRIC, { bumpMap: weaveBump, bumpScale: 0.5 });
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.12), packMat);
  pack.position.set(0, 1.16, -0.185);
  group.add(pack);

  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.045), mat(0x257246, FABRIC));
  pocket.position.set(0, 1.09, -0.255);
  group.add(pocket);

  // Vertical buckle straps running over the front pocket
  for (const sgn of [-1, 1]) {
    const vstrap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.012), mat(0x1d5938, 0.7));
    vstrap.position.set(sgn * 0.045, 1.1, -0.281);
    group.add(vstrap);
    const buckleClip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.022), mat(0x141414, 0.45));
    buckleClip.position.set(sgn * 0.045, 1.135, -0.284);
    group.add(buckleClip);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.024), mat(0x8a8a92, 0.3, { metalness: 0.6 }));
    clasp.position.set(sgn * 0.045, 1.135, -0.288);
    group.add(clasp);
  }

  // Side pocket (his left flank) with a small flap
  const sidePocket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.09), mat(0x257246, FABRIC));
  sidePocket.position.set(0.15, 1.12, -0.185);
  group.add(sidePocket);
  const sideFlap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.095), mat(0x1d5938, 0.7));
  sideFlap.position.set(0.15, 1.2, -0.185);
  group.add(sideFlap);

  // Shoulder straps
  for (const sgn of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.02), packMat);
    strap.position.set(sgn * 0.09, 1.31, -0.06);
    strap.rotation.x = 1.05;
    group.add(strap);
  }

  // ---- Neck (stays on the body so it doesn't shear during a look-at) ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 10), SKIN_MAT());
  neck.position.y = 1.43;
  group.add(neck);

  // ---- Head Group: pivots at the neck base so the engine can do a subtle
  // look-at (small rotation.x/y). Every child is offset by -HPY in y so the
  // rest pose (rotation 0) is identical to the previous static head.
  const headGroup = new THREE.Group();
  const HPY = 1.45; // pivot at the top of the neck
  headGroup.position.y = HPY;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 32, 24),
    mat(0xffffff, 0.55, { map: makeFaceTexture() })
  );
  head.position.y = 1.555 - HPY;
  head.rotation.y = -Math.PI / 2; // canvas center -> +z, face forward
  head.scale.set(0.97, 1.03, 0.97);
  headGroup.add(head);
  addOutline(head, 0.012);

  for (const sgn of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), SKIN_MAT());
    ear.position.set(sgn * 0.143, 1.55 - HPY, -0.01);
    ear.scale.set(0.6, 1, 0.8);
    headGroup.add(ear);
  }

  // ---- Spiky black hair poking out under the cap ----
  const hairMat = mat(0x181210, 0.85);
  const spikes = [
    // [angle around head (0 = +z), y, outward tilt, length]
    [Math.PI * 0.32, 1.6, 1.85, 0.13],  // left temple sideburn
    [-Math.PI * 0.32, 1.6, 1.85, 0.13], // right temple sideburn
    [Math.PI * 0.55, 1.57, 2.0, 0.14],
    [-Math.PI * 0.55, 1.57, 2.0, 0.14],
    [Math.PI * 0.8, 1.55, 2.15, 0.15],  // back-left
    [-Math.PI * 0.8, 1.55, 2.15, 0.15], // back-right
    [Math.PI, 1.56, 2.2, 0.16],         // straight back
  ];
  for (const [ang, y, tilt, len] of spikes) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.038, len, 6), hairMat);
    const dx = Math.sin(ang), dz = Math.cos(ang);
    spike.position.set(dx * 0.125, y - HPY, dz * 0.125);
    spike.scale.z = 0.55; // flattened spikes
    // Point the cone outward and downward away from the head
    spike.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx * Math.sin(tilt), Math.cos(tilt), dz * Math.sin(tilt)).normalize()
    );
    headGroup.add(spike);
  }

  // ---- Cap (re-parented into the head so it turns with the look-at) ----
  const cap = buildCap();
  cap.position.y -= HPY;
  headGroup.add(cap);

  group.add(headGroup);

  // ---- Arms (the hard contract) ----
  // Left hangs naturally; right elbow is statically bent so the hand rests by
  // the belt/PokéBall. Both shoulder pivots stay at rotation.x = 0 and swing
  // -3.1..+0.5 exactly as before.
  const leftArm = buildArm(1);
  const rightArm = buildArm(-1, true);
  group.add(leftArm, rightArm);

  // ---- Shadows (outline hulls opt out via userData.noShadow) ----
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = !obj.userData.noShadow;
      obj.receiveShadow = false;
    }
  });

  // ---- Rig contract for the engine ----
  group.userData.arms = [leftArm, rightArm];
  group.userData.legs = [leftLeg, rightLeg];     // hip-pivot Groups, swing rotation.x +-0.7
  group.userData.throwArm = rightArm;            // engine cocks/snaps to throw a Poke Ball
  group.userData.head = headGroup;               // subtle look-at via rotation.x/y
  return group;
}
