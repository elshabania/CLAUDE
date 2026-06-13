import * as THREE from "three";

// ---------- canvas texture helpers ----------
function makeToonRamp(hex) {
  const c = new THREE.Color(hex);
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 1;
  const ctx = cv.getContext("2d");
  // 4-step cel ramp
  const steps = [0.55, 0.78, 1.0, 1.0];
  const seg = 64 / steps.length;
  for (let i = 0; i < steps.length; i++) {
    const r = Math.min(255, Math.round(c.r * 255 * steps[i]));
    const g = Math.min(255, Math.round(c.g * 255 * steps[i]));
    const b = Math.min(255, Math.round(c.b * 255 * steps[i]));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * seg, 0, seg, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function makeEyeTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  // dark iris
  ctx.fillStyle = "#1a1a22";
  ctx.beginPath(); ctx.arc(64, 70, 42, 0, Math.PI * 2); ctx.fill();
  // big sparkle highlights
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(50, 52, 14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, 86, 7, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

// ---------- material factories (fresh per call) ----------
function toonMat(hex) {
  return new THREE.MeshToonMaterial({ color: hex, gradientMap: makeToonRamp(hex) });
}

function buildSparkmouse() {
  const g = new THREE.Group();
  const meshes = [];

  const BODY = 0xffe14a;   // bright yellow
  const CHEEK = 0xff5a6e;  // rosy
  const EAR = 0x3a2b16;    // dark ear tips
  const BROWN = 0x8a5a2a;  // tail base accent

  const matBody = toonMat(BODY);
  const matEarTip = toonMat(EAR);
  const matCheek = new THREE.MeshToonMaterial({
    color: CHEEK,
    gradientMap: makeToonRamp(CHEEK),
    emissive: new THREE.Color(CHEEK),
    emissiveIntensity: 2.0,
  });
  const matEye = new THREE.MeshBasicMaterial({ map: makeEyeTexture() });
  const matNose = new THREE.MeshToonMaterial({ color: 0x2a2020, gradientMap: makeToonRamp(0x2a2020) });
  const matBolt = new THREE.MeshToonMaterial({
    color: 0xffd633,
    gradientMap: makeToonRamp(0xffd633),
    emissive: new THREE.Color(0xffcc22),
    emissiveIntensity: 0.6,
  });
  const matBrown = toonMat(BROWN);
  const matMouth = new THREE.MeshBasicMaterial({ color: 0x3a1d22 });

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });

  // helper: add mesh + optional inverted-hull outline
  function add(geo, mat, parent, outlineScale) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    (parent || g).add(m);
    meshes.push(m);
    if (outlineScale) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.setScalar(outlineScale);
      o.userData.noShadow = true;
      o.castShadow = false;
      m.add(o);
      meshes.push(o);
    }
    return m;
  }

  // ---------- BODY (chubby round) ----------
  const bodyGeo = new THREE.SphereGeometry(0.3, 20, 16);
  const body = add(bodyGeo, matBody, g, 1.07);
  body.scale.set(1.0, 1.05, 0.92);
  body.position.y = 0.33;

  // belly lighter is skipped to keep mesh count low; tummy bump
  const tummy = add(new THREE.SphereGeometry(0.2, 16, 12), matBody, g, 1.08);
  tummy.position.set(0, 0.26, 0.16);
  tummy.scale.set(1.0, 0.9, 0.7);

  // ---------- FEET ----------
  for (const sx of [-1, 1]) {
    const foot = add(new THREE.SphereGeometry(0.1, 12, 10), matBody, g, 1.12);
    foot.position.set(0.14 * sx, 0.07, 0.04);
    foot.scale.set(1.0, 0.7, 1.3);
  }
  // little arms
  for (const sx of [-1, 1]) {
    const arm = add(new THREE.SphereGeometry(0.08, 10, 8), matBody, g, 1.14);
    arm.position.set(0.24 * sx, 0.3, 0.08);
    arm.scale.set(0.8, 1.1, 0.8);
  }

  // ---------- HEAD ----------
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  g.add(head);

  const headMesh = add(new THREE.SphereGeometry(0.27, 20, 16), matBody, head, 1.07);
  headMesh.scale.set(1.05, 0.95, 0.95);

  // ears (cones)
  for (const sx of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.08, 0.34, 12), matBody, head, 1.1);
    ear.position.set(0.16 * sx, 0.26, -0.02);
    ear.rotation.z = -0.35 * sx;
    ear.rotation.x = -0.15;
    // dark tip
    const tip = add(new THREE.ConeGeometry(0.082, 0.14, 12), matEarTip, head, 1.12);
    tip.position.set(0.16 * sx + 0.05 * sx, 0.4, -0.05);
    tip.rotation.z = -0.35 * sx;
    tip.rotation.x = -0.15;
  }

  // eyes
  for (const sx of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.075, 16, 14), matEye, head, 0);
    eye.position.set(0.11 * sx, 0.04, 0.22);
    eye.scale.set(0.9, 1.1, 0.6);
  }

  // nose
  const nose = add(new THREE.SphereGeometry(0.028, 10, 8), matNose, head, 1.2);
  nose.position.set(0, -0.04, 0.27);

  // mouth (small smile)
  const mouth = add(new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI), matMouth, head, 0);
  mouth.position.set(0, -0.1, 0.25);
  mouth.rotation.x = Math.PI;

  // ---------- GLOWING CHEEK PODS ----------
  for (const sx of [-1, 1]) {
    const cheek = add(new THREE.SphereGeometry(0.06, 14, 12), matCheek, head, 1.1);
    cheek.position.set(0.19 * sx, -0.06, 0.18);
    cheek.scale.set(1.1, 1.0, 0.6);
  }

  // ---------- LIGHTNING-BOLT TAIL ----------
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.26);
  g.add(tail);

  // base accent
  const tailBase = add(new THREE.BoxGeometry(0.07, 0.07, 0.05), matBrown, tail, 1.12);
  tailBase.position.set(0, -0.02, 0.02);

  // zig-zag segments forming a bolt
  const seg1 = add(new THREE.BoxGeometry(0.08, 0.14, 0.05), matBolt, tail, 1.12);
  seg1.position.set(0.02, 0.07, 0);
  seg1.rotation.z = 0.3;

  const seg2 = add(new THREE.BoxGeometry(0.2, 0.1, 0.05), matBolt, tail, 1.1);
  seg2.position.set(0.1, 0.18, 0);
  seg2.rotation.z = -0.5;

  const seg3 = add(new THREE.BoxGeometry(0.1, 0.16, 0.05), matBolt, tail, 1.1);
  seg3.position.set(0.06, 0.31, 0);
  seg3.rotation.z = 0.35;

  const seg4 = add(new THREE.BoxGeometry(0.16, 0.1, 0.05), matBolt, tail, 1.1);
  seg4.position.set(0.16, 0.4, 0);
  seg4.rotation.z = -0.45;

  g.userData.head = head;
  g.userData.meshCount = meshes.length;
  return g;
}

const SPARKMOUSE = {
  name: "SPARKMOUSE",
  type: "electric",
  hp: 40,
  speed: 4.6,
  damage: 7,
  range: 20,
  attackCd: 1.9,
  score: 100,
  xp: 26,
  flying: false,
  catchRate: 1.0,
  projectile: { color: 0xffee44, speed: 24, size: 0.14 },
  dex: "Stores storm energy in its cheeks; sneezes tiny lightning when startled.",
  build: buildSparkmouse,
};

export { buildSparkmouse, SPARKMOUSE };
