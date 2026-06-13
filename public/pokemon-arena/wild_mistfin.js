import * as THREE from "three";

// ---------- canvas texture helpers ----------
function makeWaveTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  // aqua gradient base
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#7fe0ff");
  grad.addColorStop(0.5, "#3fb8f5");
  grad.addColorStop(1, "#1f8fd8");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // wavy highlight bands
  g.lineWidth = 6;
  for (let row = 0; row < 6; row++) {
    g.strokeStyle = row % 2 === 0 ? "rgba(255,255,255,0.35)" : "rgba(150,235,255,0.45)";
    g.beginPath();
    const y = 24 + row * 40;
    for (let x = 0; x <= 256; x += 8) {
      const yy = y + Math.sin((x / 256) * Math.PI * 4 + row) * 8;
      if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // sparkles
  g.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 30; i++) {
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 2.5 + 1, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeToonRamp(hex) {
  // 4-step cel ramp from a base color
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const g = c.getContext("2d");
  const base = new THREE.Color(hex);
  const steps = [0.45, 0.7, 0.88, 1.0];
  for (let i = 0; i < 4; i++) {
    const col = base.clone().multiplyScalar(steps[i]);
    g.fillStyle = "#" + col.getHexString();
    g.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---------- material factories (fresh per call) ----------
function bodyMat(hex, map) {
  const m = new THREE.MeshToonMaterial({
    color: hex,
    gradientMap: makeToonRamp(hex),
  });
  if (map) m.map = map;
  return m;
}
function glossyMat(hex) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.15, metalness: 0.0 });
}
function finMat(hex) {
  return new THREE.MeshToonMaterial({
    color: hex,
    gradientMap: makeToonRamp(hex),
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
function outlineMat() {
  return new THREE.MeshBasicMaterial({ color: 0x0a1822, side: THREE.BackSide });
}

// inverted-hull outline clone
function addOutline(mesh, scale = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat());
  o.scale.setScalar(scale);
  o.userData.noShadow = true;
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return o;
}

function mk(geo, mat, outline = true, outlineScale = 1.06) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (outline) addOutline(m, outlineScale);
  return m;
}

// ---------- main builder ----------
export function buildMistfin() {
  const root = new THREE.Group();
  root.name = "MISTFIN";

  const waveTex = makeWaveTexture();
  const AQUA = 0x3fb8f5;
  const AQUA_DARK = 0x2a93d6;
  const BELLY = 0xf2fbff;
  const FRILL = 0xff9ec7;
  const FIN = 0x8fe3ff;

  // ----- body (round) -----
  const body = mk(new THREE.SphereGeometry(0.32, 24, 18), bodyMat(AQUA, waveTex), true, 1.05);
  body.geometry.scale(1.0, 0.95, 1.05);
  body.position.y = 0.36;
  root.add(body);

  // pale belly patch
  const belly = mk(new THREE.SphereGeometry(0.245, 20, 14), bodyMat(BELLY), true, 1.04);
  belly.geometry.scale(1.0, 0.95, 0.7);
  belly.position.set(0, 0.31, 0.16);
  root.add(belly);

  // ----- head group -----
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.66, 0.06);
  root.add(head);

  const headBall = mk(new THREE.SphereGeometry(0.27, 24, 18), bodyMat(AQUA, waveTex), true, 1.05);
  head.add(headBall);

  // cheeks (lighter)
  const cheekGeo = new THREE.SphereGeometry(0.075, 12, 10);
  for (const sx of [-1, 1]) {
    const ch = new THREE.Mesh(cheekGeo, glossyMat(FRILL));
    ch.castShadow = true;
    ch.position.set(0.15 * sx, -0.04, 0.21);
    head.add(ch);
  }

  // ----- eyes (big dark glossy) -----
  const eyeGeo = new THREE.SphereGeometry(0.072, 16, 14);
  const eyeMat = glossyMat(0x111c26);
  const hiGeo = new THREE.SphereGeometry(0.024, 10, 8);
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.castShadow = true;
    eye.position.set(0.1 * sx, 0.03, 0.235);
    head.add(eye);
    const hi = new THREE.Mesh(hiGeo, hiMat);
    hi.position.set(0.1 * sx + 0.02, 0.06, 0.29);
    head.add(hi);
  }

  // tiny nose / mouth
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), glossyMat(0x2a3a46));
  nose.position.set(0, -0.05, 0.27);
  head.add(nose);

  // ----- frilly gills (3 frills each side, translucent toon-pink) -----
  const frillGeo = new THREE.ConeGeometry(0.05, 0.18, 8);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const fr = new THREE.Mesh(frillGeo, finMat(FRILL));
      fr.castShadow = true;
      const ang = (i - 1) * 0.35;
      fr.position.set(0.24 * sx, 0.02 + i * 0.04, -0.02);
      fr.rotation.z = (Math.PI / 2 - 0.3) * sx;
      fr.rotation.x = ang;
      head.add(fr);
    }
  }

  // ----- ear-like top fin frills -----
  const topFrillGeo = new THREE.ConeGeometry(0.045, 0.14, 8);
  for (const sx of [-1, 1]) {
    const tf = new THREE.Mesh(topFrillGeo, finMat(FRILL));
    tf.castShadow = true;
    tf.position.set(0.12 * sx, 0.24, -0.02);
    tf.rotation.z = -0.3 * sx;
    head.add(tf);
  }

  // ----- side fins (flippers, translucent) -----
  const flipGeo = new THREE.SphereGeometry(0.12, 12, 10);
  flipGeo.scale(1.0, 0.4, 0.6);
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(flipGeo, finMat(FIN));
    fl.castShadow = true;
    fl.position.set(0.32 * sx, 0.32, 0.05);
    fl.rotation.z = -0.5 * sx;
    root.add(fl);
  }

  // ----- finned tail -----
  const tailBase = mk(new THREE.SphereGeometry(0.13, 16, 12), bodyMat(AQUA, waveTex), true, 1.05);
  tailBase.geometry.scale(1.0, 0.9, 1.2);
  tailBase.position.set(0, 0.32, -0.32);
  root.add(tailBase);

  // tail fin (flat translucent fan)
  const tailFinGeo = new THREE.CircleGeometry(0.2, 16, Math.PI * 0.15, Math.PI * 0.7);
  const tailFin = new THREE.Mesh(tailFinGeo, finMat(FIN));
  tailFin.castShadow = true;
  tailFin.position.set(0, 0.32, -0.46);
  tailFin.rotation.y = Math.PI / 2;
  tailFin.rotation.z = -Math.PI / 2;
  root.add(tailFin);

  // ----- little feet -----
  const footGeo = new THREE.SphereGeometry(0.085, 12, 10);
  footGeo.scale(1.0, 0.55, 1.2);
  for (const sx of [-1, 1]) {
    const ft = mk(footGeo, bodyMat(BELLY), true, 1.05);
    ft.position.set(0.13 * sx, 0.05, 0.12);
    root.add(ft);
  }

  // dorsal fin
  const dorsalGeo = new THREE.CircleGeometry(0.13, 12, Math.PI * 0.1, Math.PI * 0.8);
  const dorsal = new THREE.Mesh(dorsalGeo, finMat(FIN));
  dorsal.castShadow = true;
  dorsal.position.set(0, 0.6, -0.12);
  dorsal.rotation.y = Math.PI / 2;
  root.add(dorsal);

  // ensure outlines flagged noShadow & shadows on body meshes
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) o.castShadow = true;
  });

  root.userData.head = head;
  return root;
}

export const MISTFIN = {
  name: "MISTFIN",
  type: "water",
  hp: 50,
  speed: 3.4,
  damage: 7,
  range: 19,
  attackCd: 2.2,
  score: 95,
  xp: 25,
  flying: false,
  catchRate: 1.05,
  projectile: { color: 0x44bbff, speed: 22, size: 0.15 },
  dex: "Its frilly gills glow when it is happy; it spouts mist to cool hot days.",
  build: buildMistfin,
};
