// ============================================================================
// ash.js — Procedural Ash Ketchum-style Pokémon trainer NPC
// Self-contained ES module: geometry + canvas textures only, no external URLs.
// export buildAsh() -> THREE.Group, origin at feet, +z forward, ~1.8 units tall.
// group.userData.arms = [leftArm, rightArm], pivoted at the shoulders so that
// rotation.x = 0 hangs naturally and rotation.x = -3.1 reaches straight up.
// ============================================================================
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mat(color, roughness = 0.8, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.0,
    envMapIntensity: 0.5,
    ...opts,
  });
}

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SKIN = 0xf2c099;
const SKIN_MAT = () => mat(SKIN, 0.55);
const FABRIC = 0.8;

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
function makeFaceTexture() {
  return canvasTexture(512, (ctx, s) => {
    // Skin base with a soft vertical gradient
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#f8cfa6");
    g.addColorStop(1, "#eeba8e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);

    // Black hair: hairline band under the cap + hair wrapping the back of head
    ctx.fillStyle = "#181210";
    ctx.fillRect(0, 0, s, 168);
    ctx.fillRect(0, 0, 96, 330);   // back of head (u seam is at -z)
    ctx.fillRect(s - 96, 0, 96, 330);
    // Jagged hairline fringe
    ctx.beginPath();
    for (let x = 96; x <= s - 96; x += 32) {
      ctx.moveTo(x, 168);
      ctx.lineTo(x + 16, 196);
      ctx.lineTo(x + 32, 168);
    }
    ctx.fill();

    // Subtle cheek shading / blush
    for (const cx of [158, 354]) {
      const r = ctx.createRadialGradient(cx, 302, 4, cx, 302, 46);
      r.addColorStop(0, "rgba(226,135,105,0.30)");
      r.addColorStop(1, "rgba(226,135,105,0)");
      ctx.fillStyle = r;
      ctx.fillRect(cx - 50, 252, 100, 100);
    }

    // Eyebrows
    ctx.strokeStyle = "#15100c";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(256 + sgn * 22, 214);
      ctx.lineTo(256 + sgn * 64, 206);
      ctx.stroke();
    }

    // Anime eyes: white sclera, big brown iris, pupil, white highlight
    for (const sgn of [-1, 1]) {
      const ex = 256 + sgn * 42;
      const ey = 256;
      ctx.fillStyle = "#15100c";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 27, 33, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 23, 29, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6b3f1d"; // brown iris
      ctx.beginPath();
      ctx.ellipse(ex, ey + 3, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a0f06";
      ctx.beginPath();
      ctx.ellipse(ex, ey + 5, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff"; // highlight
      ctx.beginPath();
      ctx.arc(ex - 6, ey - 8, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Signature zigzag (lightning-bolt) cheek marks under each eye
    ctx.strokeStyle = "#7a4a22";
    ctx.lineWidth = 8;
    ctx.lineJoin = "round";
    for (const sgn of [-1, 1]) {
      const bx = 256 + sgn * 78;
      ctx.beginPath();
      ctx.moveTo(bx, 296);
      ctx.lineTo(bx + sgn * 20, 308);
      ctx.lineTo(bx + sgn * 6, 314);
      ctx.lineTo(bx + sgn * 26, 328);
      ctx.stroke();
    }

    // Tiny nose
    ctx.strokeStyle = "#c98b62";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(254, 296);
    ctx.lineTo(258, 302);
    ctx.stroke();

    // Small open smile
    ctx.strokeStyle = "#5a2e1a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(256, 312, 28, Math.PI * 0.18, Math.PI * 0.82);
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
    // Green collar band at top
    ctx.fillStyle = "#2f8f5b";
    ctx.fillRect(0, 0, s, 26);
    // White bottom hem
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 468, s, 44);
    // White front trim either side of the zipper (seam sits at +z)
    ctx.fillRect(10, 0, 36, s);
    ctx.fillRect(s - 46, 0, 36, s);
    // Yellow zipper line down the front seam
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(0, 0, 10, s);
    ctx.fillRect(s - 10, 0, 10, s);
    // Pocket stitch hints
    ctx.strokeStyle = "rgba(10,20,60,0.55)";
    ctx.lineWidth = 6;
    for (const px of [86, 426]) {
      ctx.beginPath();
      ctx.moveTo(px, 360);
      ctx.lineTo(px, 440);
      ctx.stroke();
    }
  });
}

function makeCapLogoTexture() {
  return canvasTexture(128, (ctx) => {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 128, 128);
    // Green stylized "L" mark
    ctx.fillStyle = "#1faa59";
    ctx.fillRect(44, 26, 20, 70);
    ctx.fillRect(44, 78, 44, 18);
    ctx.fillStyle = "#157a3f";
    ctx.fillRect(44, 26, 20, 10);
  });
}

function makePokeballTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#e8e8e8";       // white bottom
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#d8242c";       // red top
    ctx.fillRect(0, 0, s, 120);
    ctx.fillStyle = "#181818";       // black band
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
function buildArm(side) {
  // side: +1 = his left (+x), -1 = his right (-x). Pivot at shoulder; the arm
  // hangs along -y at rotation 0 so rotation.x of -3.1 points it overhead.
  const arm = new THREE.Group();
  const white = mat(0xf2f2f2, FABRIC);
  const skin = SKIN_MAT();
  const glove = mat(0x2f8f5b, 0.75);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), white);
  arm.add(shoulder);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.17, 12), white);
  sleeve.position.y = -0.09;
  arm.add(sleeve);

  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.04, 0.21, 12), skin);
  forearm.position.y = -0.275;
  arm.add(forearm);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.05, 12), glove);
  cuff.position.y = -0.385;
  arm.add(cuff);

  // Hand: glove sphere + thumb + knuckle bumps + bare fingertips
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), glove);
  hand.position.y = -0.44;
  hand.scale.set(0.9, 1.1, 0.8);
  arm.add(hand);

  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), glove);
  thumb.position.set(-side * 0.04, -0.435, 0.025);
  arm.add(thumb);

  for (let i = -1; i <= 1; i++) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), glove);
    knuckle.position.set(side * i * 0.025, -0.452, 0.042);
    arm.add(knuckle);
  }

  const fingers = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skin);
  fingers.position.y = -0.492;
  fingers.scale.set(1, 0.7, 0.8);
  arm.add(fingers);

  arm.position.set(side * 0.225, 1.345, 0);
  arm.rotation.z = side * 0.1; // slight outward splay; looks like a V overhead
  return arm;
}

function buildLeg(side) {
  const leg = new THREE.Group();
  const jeans = mat(0x3a5b9e, FABRIC);

  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.068, 0.4, 12), jeans);
  thigh.position.set(side * 0.1, 0.66, 0);
  thigh.rotation.z = -side * 0.05;
  leg.add(thigh);

  // Boot-cut: calf flares slightly at the ankle
  const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.082, 0.36, 12), jeans);
  calf.position.set(side * 0.115, 0.29, 0.005);
  leg.add(calf);

  // Sneaker: white sole, red upper, black stripe
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.045, 0.27), mat(0xe9e9e9, 0.7));
  sole.position.set(side * 0.115, 0.025, 0.045);
  leg.add(sole);

  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mat(0xc8242c, 0.6));
  upper.position.set(side * 0.115, 0.085, 0.06);
  upper.scale.set(0.75, 0.75, 1.5);
  leg.add(upper);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.138, 0.035, 0.13), mat(0x141414, 0.6));
  stripe.position.set(side * 0.115, 0.085, 0.0);
  leg.add(stripe);

  return leg;
}

function buildCap() {
  const cap = new THREE.Group();
  const red = mat(0xd8242c, FABRIC);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.05),
    red
  );
  dome.scale.set(1, 0.8, 1.05);
  cap.add(dome);

  // White front panel with the green league mark, hugging the dome's brow
  const panel = new THREE.Mesh(
    new THREE.CircleGeometry(0.078, 20),
    mat(0xffffff, FABRIC, { map: makeCapLogoTexture() })
  );
  panel.position.set(0, 0.055, 0.152);
  panel.rotation.x = -0.42; // lean back to follow the dome slope
  cap.add(panel);

  // Curved brim: a pie wedge of a thin cylinder, tilted down at the front
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.175, 0.018, 20, 1, false, -0.95, 1.9),
    red
  );
  brim.position.set(0, 0.005, 0.03);
  brim.scale.set(1, 1, 1.35);
  brim.rotation.x = 0.16;
  cap.add(brim);

  const button = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), red);
  button.position.y = 0.135;
  cap.add(button);

  cap.position.y = 1.605;
  return cap;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function buildAsh() {
  const group = new THREE.Group();
  group.name = "ash";

  // ---- Legs & belt ----
  group.add(buildLeg(1), buildLeg(-1));

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.16, 0.12, 16), mat(0x3a5b9e, FABRIC));
  hips.position.y = 0.82;
  hips.scale.z = 0.8;
  group.add(hips);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.045, 16), mat(0x2b2b2b, 0.6));
  belt.position.y = 0.875;
  belt.scale.z = 0.8;
  group.add(belt);

  // Poké Ball clipped to the belt
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 12),
    mat(0xffffff, 0.35, { map: makePokeballTexture() })
  );
  ball.position.set(0.125, 0.875, 0.1);
  ball.rotation.y = 0.5; // angle the button outward
  group.add(ball);

  // ---- Torso: blue jacket over white tee ----
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.15, 0.52, 24, 4),
    mat(0xffffff, FABRIC, { map: makeJacketTexture() })
  );
  torso.position.y = 1.13;
  torso.scale.z = 0.78;
  group.add(torso);

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

  // ---- Backpack ----
  const packMat = mat(0x2f8f5b, FABRIC);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.12), packMat);
  pack.position.set(0, 1.16, -0.185);
  group.add(pack);

  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.045), mat(0x257246, FABRIC));
  pocket.position.set(0, 1.09, -0.255);
  group.add(pocket);

  const pocketClip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), mat(0x141414, 0.5));
  pocketClip.position.set(0, 1.155, -0.282);
  group.add(pocketClip);

  for (const sgn of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.02), packMat);
    strap.position.set(sgn * 0.09, 1.31, -0.06);
    strap.rotation.x = 1.05;
    group.add(strap);
  }

  // ---- Neck & head ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 10), SKIN_MAT());
  neck.position.y = 1.43;
  group.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 28, 22),
    mat(0xffffff, 0.55, { map: makeFaceTexture() })
  );
  head.position.y = 1.555;
  head.rotation.y = -Math.PI / 2; // canvas center -> +z, face forward
  head.scale.set(0.97, 1.03, 0.97);
  group.add(head);

  for (const sgn of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), SKIN_MAT());
    ear.position.set(sgn * 0.143, 1.55, -0.01);
    ear.scale.set(0.6, 1, 0.8);
    group.add(ear);
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
    spike.position.set(dx * 0.125, y, dz * 0.125);
    spike.scale.z = 0.55; // flattened spikes
    // Point the cone outward and downward away from the head
    spike.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx * Math.sin(tilt), Math.cos(tilt), dz * Math.sin(tilt)).normalize()
    );
    group.add(spike);
  }

  // ---- Cap ----
  group.add(buildCap());

  // ---- Arms (the hard contract) ----
  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);
  group.add(leftArm, rightArm);

  // ---- Shadows ----
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = false;
    }
  });

  group.userData.arms = [leftArm, rightArm];
  return group;
}
