import * as THREE from "three";

// ---------- canvas rock texture ----------
function makeRockTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#9a8d7a";
  ctx.fillRect(0, 0, 128, 128);
  // mottled speckle
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const r = 1 + Math.random() * 4;
    const shade = 120 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgba(${shade - 20},${shade - 30},${shade - 45},${0.18 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // a few highlights for polished look
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(235,225,205,${0.1 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- toon ramp ----------
function makeToonGradient() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const ctx = c.getContext("2d");
  const data = ctx.createImageData(4, 1);
  const steps = [70, 130, 195, 255];
  for (let i = 0; i < 4; i++) {
    data.data[i * 4 + 0] = steps[i];
    data.data[i * 4 + 1] = steps[i];
    data.data[i * 4 + 2] = steps[i];
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  return tex;
}

function jitter(geo, amt) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (Math.random() - 0.5) * amt,
      pos.getY(i) + (Math.random() - 0.5) * amt,
      pos.getZ(i) + (Math.random() - 0.5) * amt
    );
  }
  geo.computeVertexNormals();
  return geo;
}

// thin inverted-hull outline
function addOutline(mesh, parent) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x111016, side: THREE.BackSide });
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.position.copy(mesh.position);
  o.rotation.copy(mesh.rotation);
  o.scale.copy(mesh.scale).multiplyScalar(1.06);
  o.userData.noShadow = true;
  o.castShadow = false;
  o.receiveShadow = false;
  parent.add(o);
  return o;
}

export function buildPebblade() {
  const group = new THREE.Group();
  group.name = "PEBBLADE";

  const rockTex = makeRockTexture();
  const ramp = makeToonGradient();

  const stoneMat = (col) =>
    new THREE.MeshToonMaterial({ color: col, map: rockTex, gradientMap: ramp });

  const COL_BODY = 0x8f8170;
  const COL_LIMB = 0x7c6f5f;

  // ---- body (river-stone golem) ----
  const bodyGeo = jitter(new THREE.IcosahedronGeometry(0.45, 1), 0.06);
  const body = new THREE.Mesh(bodyGeo, stoneMat(COL_BODY));
  body.position.y = 0.55;
  body.scale.set(1.0, 0.95, 0.9);
  body.castShadow = true;
  group.add(body);
  addOutline(body, group);

  // belly stone (lighter, polished)
  const bellyGeo = jitter(new THREE.IcosahedronGeometry(0.26, 1), 0.03);
  const belly = new THREE.Mesh(bellyGeo, stoneMat(0xa89a85));
  belly.position.set(0, 0.45, 0.32);
  belly.scale.set(0.9, 0.8, 0.6);
  belly.castShadow = true;
  group.add(belly);
  addOutline(belly, group);

  // ---- head ----
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.04);
  group.add(head);
  group.userData.head = head;

  const headGeo = jitter(new THREE.IcosahedronGeometry(0.34, 1), 0.045);
  const headMesh = new THREE.Mesh(headGeo, stoneMat(COL_BODY));
  headMesh.scale.set(1.05, 0.95, 1.0);
  headMesh.castShadow = true;
  head.add(headMesh);
  addOutline(headMesh, head);

  // brow ridge stone
  const browGeo = jitter(new THREE.BoxGeometry(0.4, 0.1, 0.18), 0.02);
  const brow = new THREE.Mesh(browGeo, stoneMat(COL_LIMB));
  brow.position.set(0, 0.12, 0.24);
  brow.castShadow = true;
  head.add(brow);
  addOutline(brow, head);

  // ---- glowing gem eyes ----
  const eyeMat = () =>
    new THREE.MeshStandardMaterial({
      color: 0x6fffd0,
      emissive: 0x33ffbb,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.0,
    });
  const eyeGeo = new THREE.OctahedronGeometry(0.075, 0);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat());
    eye.position.set(sx * 0.13, 0.02, 0.3);
    eye.castShadow = false;
    head.add(eye);
  }

  // ---- crystal blades on back (translucent emissive shards) ----
  const crystalGeo = new THREE.ConeGeometry(0.12, 0.5, 5);
  const crystalMat = () =>
    new THREE.MeshStandardMaterial({
      color: 0x8fd9ff,
      emissive: 0x4ab8ff,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.78,
      roughness: 0.1,
      metalness: 0.0,
    });
  const shardData = [
    { x: -0.14, y: 0.78, z: -0.28, rot: -0.5, s: 1.1 },
    { x: 0.16, y: 0.82, z: -0.26, rot: 0.45, s: 1.0 },
    { x: 0.0, y: 0.92, z: -0.3, rot: 0.0, s: 1.25 },
  ];
  for (const sd of shardData) {
    const sh = new THREE.Mesh(crystalGeo, crystalMat());
    sh.position.set(sd.x, sd.y, sd.z);
    sh.rotation.set(-0.5, 0, sd.rot);
    sh.scale.setScalar(sd.s);
    sh.castShadow = true;
    group.add(sh);
    addOutline(sh, group);
  }

  // ---- arms (stubby stone limbs) ----
  const armGeo = jitter(new THREE.IcosahedronGeometry(0.13, 0), 0.025);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, stoneMat(COL_LIMB));
    arm.position.set(sx * 0.42, 0.5, 0.05);
    arm.scale.set(0.9, 1.3, 0.9);
    arm.castShadow = true;
    group.add(arm);
    addOutline(arm, group);

    // little fist stone
    const fistGeo = jitter(new THREE.IcosahedronGeometry(0.11, 0), 0.02);
    const fist = new THREE.Mesh(fistGeo, stoneMat(COL_BODY));
    fist.position.set(sx * 0.46, 0.32, 0.08);
    fist.castShadow = true;
    group.add(fist);
    addOutline(fist, group);
  }

  // ---- legs / feet stones ----
  const legGeo = jitter(new THREE.IcosahedronGeometry(0.16, 0), 0.03);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, stoneMat(COL_LIMB));
    leg.position.set(sx * 0.18, 0.16, 0.0);
    leg.scale.set(1.0, 1.0, 1.1);
    leg.castShadow = true;
    group.add(leg);
    addOutline(leg, group);
  }

  return group;
}

export const PEBBLADE = {
  name: "PEBBLADE",
  type: "rock",
  hp: 64,
  speed: 2.2,
  damage: 9,
  range: 0,
  attackCd: 2.6,
  score: 110,
  xp: 30,
  flying: false,
  catchRate: 0.9,
  projectile: null,
  dex: "Polishes its stones in rivers; the shinier its crystals, the prouder it stands.",
  build: buildPebblade,
};
