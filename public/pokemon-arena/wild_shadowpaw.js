import * as THREE from "three";

// ---------- Canvas texture helpers ----------
function makeColorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  // base violet-black
  g.fillStyle = "#241032";
  g.fillRect(0, 0, 128, 128);
  // soft vertical sheen
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#3a1a55");
  grad.addColorStop(0.5, "#241032");
  grad.addColorStop(1, "#160820");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // crescent moon markings
  g.strokeStyle = "#c8a8ff";
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const x = 24 + (i % 2) * 70;
    const y = 30 + Math.floor(i / 2) * 60;
    g.beginPath();
    g.arc(x, y, 12, Math.PI * 0.25, Math.PI * 1.55);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeBumpTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 128, 128);
  // furry noise
  for (let i = 0; i < 1400; i++) {
    const v = 80 + Math.random() * 120 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Toon ramp shader injection ----------
function toonify(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
       #ifdef USE_TOON_RAMP
       #endif`
    );
    // stepped diffuse via dotNL ramp
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );",
      `vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
       irradiance = floor(irradiance * 3.0 + 0.5) / 3.0;`
    );
  };
  return mat;
}

function mat(color, opts = {}) {
  return toonify(new THREE.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0.0, ...opts,
  }));
}

// outline (inverted hull)
function outline(geo, scale = 1.06) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x080010, side: THREE.BackSide })
  );
  m.scale.setScalar(scale);
  m.userData.noShadow = true;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function part(group, geo, material, x, y, z, outlineScale) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
  if (outlineScale) {
    const o = outline(geo, outlineScale);
    o.position.set(x, y, z);
    group.add(o);
  }
  return mesh;
}

export function buildShadowpaw() {
  const root = new THREE.Group();

  const bodyTex = makeColorTexture();
  const bumpTex = makeBumpTexture();
  const fur = mat(0x2a1240, { map: bodyTex, bumpMap: bumpTex, bumpScale: 0.04 });
  const furDark = mat(0x180826, { bumpMap: bumpTex, bumpScale: 0.03 });
  const pad = mat(0xc070ff, { emissive: 0x551188, emissiveIntensity: 0.3 });

  // ----- Body -----
  const bodyGeo = new THREE.SphereGeometry(0.26, 18, 16);
  const body = part(root, bodyGeo, fur, 0, 0.42, 0, 1.07);
  body.scale.set(1.0, 0.95, 1.25);

  // ----- Head group -----
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0.12);
  root.add(head);
  root.userData.head = head;

  const headGeo = new THREE.SphereGeometry(0.24, 18, 16);
  const headMesh = new THREE.Mesh(headGeo, fur);
  headMesh.castShadow = true;
  head.add(headMesh);
  head.add(outline(headGeo, 1.07));

  // ears (cones)
  const earGeo = new THREE.ConeGeometry(0.09, 0.2, 10);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(earGeo, furDark);
    e.position.set(0.13 * sx, 0.22, 0);
    e.rotation.z = -0.3 * sx;
    e.castShadow = true;
    head.add(e);
    const eo = outline(earGeo, 1.1);
    eo.position.copy(e.position);
    eo.rotation.copy(e.rotation);
    head.add(eo);
  }

  // glowing magenta eyes
  const eyeGeo = new THREE.SphereGeometry(0.055, 12, 12);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff44dd, emissive: 0xff22cc, emissiveIntensity: 2.0,
    roughness: 0.3, metalness: 0,
  });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.09 * sx, 0.02, 0.21);
    head.add(eye);
  }
  // tiny nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), pad);
  nose.position.set(0, -0.05, 0.235);
  head.add(nose);

  // ----- Legs -----
  const legGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 8);
  const legPos = [[-0.14, -0.16, 0.12], [0.14, -0.16, 0.12], [-0.14, -0.16, -0.12], [0.14, -0.16, -0.12]];
  for (const [x, , z] of legPos) {
    part(root, legGeo, furDark, x, 0.15, z, 1.1);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pad);
    paw.position.set(x, 0.02, z);
    paw.castShadow = true;
    root.add(paw);
  }

  // ----- Wispy smoky tail (segments, fading transparent) -----
  const tail = new THREE.Group();
  tail.position.set(0, 0.45, -0.28);
  root.add(tail);
  const segGeo = new THREE.SphereGeometry(0.08, 10, 10);
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const smoke = toonify(new THREE.MeshStandardMaterial({
      color: 0x6a3aa8, emissive: 0x9955ff,
      emissiveIntensity: 0.5 + f * 0.8,
      transparent: true, opacity: 0.85 - f * 0.55,
      roughness: 0.9, metalness: 0,
    }));
    const s = new THREE.Mesh(segGeo, smoke);
    const r = 0.08 * (1 - f * 0.6);
    s.scale.setScalar((1 - f * 0.5));
    s.position.set(Math.sin(f * 4) * 0.06, f * 0.35, -f * 0.18);
    s.castShadow = true;
    tail.add(s);
  }

  root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });
  return root;
}

export const SHADOWPAW = {
  name: "SHADOWPAW", type: "dark", hp: 46, speed: 4.4, damage: 8, range: 18,
  attackCd: 2.0, score: 120, xp: 30, flying: false, catchRate: 0.85,
  projectile: { color: 0xaa55ff, speed: 22, size: 0.15 },
  dex: "Slips between shadows; its crescent marks glow under moonlight.",
  build: buildShadowpaw,
};
