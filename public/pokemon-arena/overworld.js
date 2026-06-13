// overworld.js — Explorable biome ring around the central stadium.
// Builds a cartoon-bright overworld in radius ~55..230 where Ash walks to
// find wild Pokémon: tall-grass meadow, pond/oasis, rocky canyon w/ arches,
// flower field, ruins site, berry-tree grove, plus a winding dirt path and
// signposts. Self-contained ES module. Three.js r160, canvas textures only.
import * as THREE from "three";

// ---------------------------------------------------------------------------
// tunables
// ---------------------------------------------------------------------------
const INNER_R = 55;   // keep everything outside this
const OUTER_R = 230;  // ...and inside this
const STADIUM_R = 52; // hard no-go core

// ---------------------------------------------------------------------------
// shared state (so update() is allocation-free)
// ---------------------------------------------------------------------------
const state = {
  scene: null,
  terrainHeight: null,
  isTouch: false,
  grass: null,        // { mesh, dummy, blades:[{x,z,y,h,phase}], count }
  pondMat: null,      // ShaderMaterial-free: animate via map offset / verts
  pond: null,         // { mesh, baseY, geo, base:Float32Array }
  lilies: [],         // { mesh, baseY, phase, x, z }
  reeds: null,        // { mesh, dummy, items:[{x,z,y,h,phase}] }
  signs: [],          // { mesh } (static)
  time: 0,
};

// reusable scratch (no per-frame allocation)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// canvas texture helpers
// ---------------------------------------------------------------------------
function makeTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

function bladeTexture() {
  return makeTex(48, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // bright two-tone grass blade, tapering tip
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, "#2f9e2f");
    grd.addColorStop(0.6, "#57c93a");
    grd.addColorStop(1, "#9bef5a");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(w * 0.18, h);
    g.quadraticCurveTo(w * 0.05, h * 0.4, w * 0.5, 0);
    g.quadraticCurveTo(w * 0.95, h * 0.4, w * 0.82, h);
    g.closePath();
    g.fill();
    // cartoon outline
    g.lineWidth = 4;
    g.strokeStyle = "rgba(20,70,20,0.6)";
    g.stroke();
  });
}

function flowerTexture() {
  return makeTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const cols = ["#ff5d8f", "#ffd23f", "#7c5cff", "#ff8c42", "#ffffff"];
    const col = cols[(Math.random() * cols.length) | 0];
    g.fillStyle = col;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 11, 7, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#ffe34d";
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(120,60,30,0.5)"; g.lineWidth = 2; g.stroke();
  });
}

function signTexture(label) {
  return makeTex(256, 160, (g, w, h) => {
    g.fillStyle = "#caa46a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#a87f43"; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = "#f3e2b8"; g.fillRect(20, 20, w - 40, h - 40);
    g.strokeStyle = "#5a3d1c"; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = "#3a2810";
    g.font = "bold 34px sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    const words = label.split(" ");
    if (words.length > 1) {
      g.fillText(words[0], w / 2, h / 2 - 20);
      g.fillText(words.slice(1).join(" "), w / 2, h / 2 + 20);
    } else {
      g.fillText(label, w / 2, h / 2);
    }
  });
}

function waterTexture() {
  return makeTex(256, 256, (g, w, h) => {
    g.fillStyle = "#2e8fd4"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 12, w * 0.6, y - 12, w, y);
      g.stroke();
    }
  }, 2);
}

function dirtTexture() {
  return makeTex(128, 512, (g, w, h) => {
    g.fillStyle = "#a9824e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${100 + Math.random() * 60 | 0},${70 + Math.random() * 40 | 0},40,0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    // soft edges
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "rgba(120,90,50,0.6)");
    grd.addColorStop(0.15, "rgba(0,0,0,0)");
    grd.addColorStop(0.85, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(120,90,50,0.6)");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

// ---------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------
function ground(x, z) {
  return state.terrainHeight ? state.terrainHeight(x, z) : 0;
}

// flat-ish toon material
function toonMat(color, opts) {
  return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
}

// cheap dark-backface outline shell
function addOutline(mesh, scale, color) {
  const m = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: color || 0x101810, side: THREE.BackSide })
  );
  m.scale.setScalar(scale || 1.06);
  mesh.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// BIOMES
// ---------------------------------------------------------------------------
function buildTallGrass(group, center, radius, count) {
  const tex = bladeTexture();
  const geo = new THREE.PlaneGeometry(1.1, 2.4);
  geo.translate(0, 1.2, 0); // pivot at base
  const mat = new THREE.MeshLambertMaterial({
    map: tex, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count * 2); // 2 crossed planes
  mesh.frustumCulled = false;
  const blades = [];
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    const h = 0.8 + Math.random() * 0.7;
    const rot = Math.random() * Math.PI;
    const phase = Math.random() * Math.PI * 2;
    blades.push({ x, z, y, h, phase });
    for (let k = 0; k < 2; k++) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rot + k * Math.PI / 2, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  mesh.count = idx;
  group.add(mesh);
  state.grass = { mesh, dummy, blades, count };
}

function buildFlowerField(group, center, radius, count) {
  const tex = flowerTexture();
  const geo = new THREE.PlaneGeometry(1.0, 1.0);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({
    map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    const s = 0.7 + Math.random() * 0.8;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  group.add(mesh);
  // a few stems-as-grass scattered for fill (instanced low grass)
}

function buildPond(group, center, radius) {
  // water disc
  const geo = new THREE.CircleGeometry(radius, 48);
  geo.rotateX(-Math.PI / 2);
  const base = geo.attributes.position.array.slice(); // copy for ripple
  const baseY = ground(center.x, center.z) + 0.05;
  const mat = new THREE.MeshLambertMaterial({
    map: waterTexture(), transparent: true, opacity: 0.9, color: 0xbfe6ff,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, baseY, center.z);
  group.add(mesh);
  state.pond = { mesh, baseY, geo, base };

  // reeds around the rim (instanced)
  const reedCount = state.isTouch ? 40 : 80;
  const rgeo = new THREE.PlaneGeometry(0.5, 2.6);
  rgeo.translate(0, 1.3, 0);
  const rmat = new THREE.MeshLambertMaterial({
    color: 0x4a8b2f, transparent: true, side: THREE.DoubleSide,
    map: bladeTexture(), alphaTest: 0.45,
  });
  const reedMesh = new THREE.InstancedMesh(rgeo, rmat, reedCount * 2);
  reedMesh.frustumCulled = false;
  const items = [];
  const d = new THREE.Object3D();
  let ri = 0;
  for (let i = 0; i < reedCount; i++) {
    const a = (i / reedCount) * Math.PI * 2 + Math.random() * 0.2;
    const r = radius * (0.9 + Math.random() * 0.25);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    const h = 1 + Math.random() * 0.8;
    const phase = Math.random() * Math.PI * 2;
    items.push({ x, z, y, h, phase });
    for (let k = 0; k < 2; k++) {
      d.position.set(x, y, z);
      d.rotation.set(0, Math.random() * Math.PI, 0);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      reedMesh.setMatrixAt(ri++, d.matrix);
    }
  }
  reedMesh.count = ri;
  group.add(reedMesh);
  state.reeds = { mesh: reedMesh, dummy: d, items };

  // lily pads (a handful, individually bobbed)
  const padGeo = new THREE.CircleGeometry(1, 12);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = toonMat(0x3aa83a);
  const padCount = 7;
  for (let i = 0; i < padCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.7;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const pad = new THREE.Mesh(padGeo, padMat);
    const s = 0.8 + Math.random() * 0.9;
    pad.scale.setScalar(s);
    pad.position.set(x, baseY + 0.06, z);
    group.add(pad);
    // optional little flower on some pads
    if (Math.random() < 0.5) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), toonMat(0xff6fa3));
      fl.position.set(0, 0.12, 0);
      pad.add(fl);
    }
    state.lilies.push({ mesh: pad, baseY: baseY + 0.06, phase: Math.random() * 6.28, x, z });
  }
}

function buildCanyon(group, center) {
  const rockMat = toonMat(0xb08a5a);
  const darkRock = toonMat(0x8a6a3e);
  // scattered boulders
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 26;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    const s = 1.5 + Math.random() * 4;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const m = new THREE.Mesh(geo, Math.random() < 0.5 ? rockMat : darkRock);
    m.position.set(x, y + s * 0.4, z);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    m.scale.y = 0.7 + Math.random() * 0.5;
    addOutline(m, 1.04);
    group.add(m);
  }
  // two stone arches
  for (let j = 0; j < 2; j++) {
    const ax = center.x + (j === 0 ? -12 : 10);
    const az = center.z + (j === 0 ? 6 : -8);
    buildArch(group, ax, az, rockMat, 7 + j * 2);
  }
}

function buildArch(group, x, z, mat, span) {
  const arch = new THREE.Group();
  const y = ground(x, z);
  const legH = span * 0.9;
  const legGeo = new THREE.CylinderGeometry(span * 0.16, span * 0.22, legH, 8);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(sx * span * 0.45, legH / 2, 0);
    arch.add(leg);
  }
  // top torus half
  const topGeo = new THREE.TorusGeometry(span * 0.45, span * 0.16, 8, 16, Math.PI);
  const top = new THREE.Mesh(topGeo, mat);
  top.position.set(0, legH, 0);
  arch.add(top);
  arch.position.set(x, y, z);
  arch.rotation.y = Math.random() * Math.PI;
  group.add(arch);
}

function buildRuins(group, center) {
  const stone = toonMat(0xcfc7b0);
  const moss = toonMat(0x7fae5a);
  // ring of broken pillars
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 9;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    const hgt = 1.5 + Math.random() * 4; // broken -> varied heights
    const geo = new THREE.CylinderGeometry(0.7, 0.85, hgt, 10);
    const m = new THREE.Mesh(geo, i % 3 === 0 ? moss : stone);
    m.position.set(x, y + hgt / 2, z);
    m.rotation.y = Math.random() * 0.4;
    addOutline(m, 1.05);
    group.add(m);
    // a fallen capital chunk near base sometimes
    if (Math.random() < 0.4) {
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), stone);
      chunk.position.set(x + (Math.random() - 0.5) * 2, y + 0.3, z + (Math.random() - 0.5) * 2);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(chunk);
    }
  }
  // central stone arch / gateway
  buildArch(group, center.x, center.z, stone, 9);
  // broken floor slabs
  const slab = new THREE.Mesh(new THREE.CircleGeometry(11, 24), toonMat(0xb9b09a));
  slab.geometry.rotateX(-Math.PI / 2);
  slab.position.set(center.x, ground(center.x, center.z) + 0.03, center.z);
  group.add(slab);
}

function buildBerryGrove(group, center) {
  const trunkMat = toonMat(0x7a4a23);
  const leafMat = toonMat(0x3f9e3f);
  const berryCols = [0xff4d4d, 0xffb13d, 0x9a5cff];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 24;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = ground(x, z);
    const tree = new THREE.Group();
    const th = 3 + Math.random() * 1.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, th, 7), trunkMat);
    trunk.position.y = th / 2;
    tree.add(trunk);
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + Math.random(), 1), leafMat);
    canopy.position.y = th + 1;
    canopy.scale.y = 0.85;
    addOutline(canopy, 1.05);
    tree.add(canopy);
    // berries as a tiny instanced cluster (cheap: a few spheres)
    const bcol = berryCols[i % berryCols.length];
    const berryGeo = new THREE.SphereGeometry(0.22, 6, 5);
    const berryMat = toonMat(bcol);
    for (let b = 0; b < 6; b++) {
      const berry = new THREE.Mesh(berryGeo, berryMat);
      const ba = Math.random() * Math.PI * 2;
      berry.position.set(
        Math.cos(ba) * (1.6 + Math.random()),
        th + 0.6 + Math.random() * 1.4,
        Math.sin(ba) * (1.6 + Math.random())
      );
      tree.add(berry);
    }
    tree.position.set(x, y, z);
    group.add(tree);
  }
}

function buildPath(group, waypoints) {
  // a thin textured ribbon following waypoints, draped on terrain
  const tex = dirtTexture();
  const width = 3.2;
  const positions = [];
  const uvs = [];
  const indices = [];
  let vi = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const segs = 8;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // perpendicular in XZ
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const px = -dz, pz = dx;
      const yL = ground(x + px * width / 2, z + pz * width / 2) + 0.07;
      const yR = ground(x - px * width / 2, z - pz * width / 2) + 0.07;
      positions.push(x + px * width / 2, yL, z + pz * width / 2);
      positions.push(x - px * width / 2, yR, z - pz * width / 2);
      const v = (i + t);
      uvs.push(0, v, 1, v);
      if (s > 0 || i > 0) {
        const c = vi;
        indices.push(c - 2, c - 1, c, c - 1, c + 1, c);
      }
      vi += 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  group.add(mesh);
}

function buildSign(group, x, z, label, facing) {
  const y = ground(x, z);
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 6), toonMat(0x8a5a2b));
  post.position.y = 1.1;
  sign.add(post);
  const boardMat = new THREE.MeshLambertMaterial({ map: signTexture(label), side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), boardMat);
  board.position.y = 2;
  sign.add(board);
  sign.position.set(x, y, z);
  sign.rotation.y = facing != null ? facing : 0;
  group.add(sign);
  state.signs.push({ mesh: sign });
}

// place a biome center at angle/radius (always in the legal ring)
function biomePos(angleDeg, radius) {
  const a = (angleDeg * Math.PI) / 180;
  const r = Math.max(INNER_R + 10, Math.min(OUTER_R - 30, radius));
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

// ---------------------------------------------------------------------------
// public init
// ---------------------------------------------------------------------------
export function initOverworld(scene, terrainHeight, isTouch) {
  state.scene = scene;
  state.terrainHeight = terrainHeight;
  state.isTouch = !!isTouch;
  state.grass = null; state.pond = null; state.reeds = null;
  state.lilies = []; state.signs = []; state.time = 0;

  const group = new THREE.Group();
  group.name = "overworld";
  scene.add(group);

  const half = isTouch ? 0.5 : 1;

  // biome centers spread around the ring
  const meadow = biomePos(20, 110);
  const pond = biomePos(80, 130);
  const canyon = biomePos(140, 150);
  const flowers = biomePos(200, 115);
  const ruins = biomePos(260, 145);
  const grove = biomePos(320, 125);

  // --- build biomes ---
  buildTallGrass(group, meadow, 30, Math.round(900 * half));
  buildPond(group, pond, 16);
  buildCanyon(group, canyon);
  buildFlowerField(group, flowers, 26, Math.round(500 * half));
  buildRuins(group, ruins);
  buildBerryGrove(group, grove);

  // an extra small tall-grass patch in the flower field for variety encounters
  // (kept light; not stored in state.grass so it just stands still)

  // --- winding dirt path connecting biomes (loop through centers) ---
  const order = [meadow, pond, canyon, ruins, grove, flowers, meadow];
  const waypoints = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i], b = order[i + 1];
    // add a wobble midpoint so it winds
    const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 30;
    const mz = (a.z + b.z) / 2 + (Math.random() - 0.5) * 30;
    waypoints.push({ x: a.x, z: a.z });
    waypoints.push({ x: mx, z: mz });
  }
  waypoints.push({ x: order[order.length - 1].x, z: order[order.length - 1].z });
  buildPath(group, waypoints);

  // --- signposts at a few biome entrances (face roughly toward stadium) ---
  function entrance(center, label) {
    const dir = Math.atan2(center.z, center.x);
    const ex = center.x - Math.cos(dir) * 24;
    const ez = center.z - Math.sin(dir) * 24;
    buildSign(group, ex, ez, label, -dir + Math.PI / 2);
  }
  entrance(meadow, "TALL GRASS");
  entrance(pond, "OASIS POND");
  entrance(ruins, "OLD RUINS");

  // --- encounter / tall-grass zones ---
  const tallGrassZones = [
    { x: meadow.x, z: meadow.z, r: 30 },
    { x: pond.x, z: pond.z, r: 22 },        // reeds
    { x: flowers.x, z: flowers.z, r: 26 },
    { x: grove.x, z: grove.z, r: 24 },
  ];

  // --- encounter points (~12) spread across biomes, on terrain ---
  const encounterPoints = [];
  function addEnc(center, spread, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      encounterPoints.push({ x, y: ground(x, z), z });
    }
  }
  addEnc(meadow, 24, 4);
  addEnc(pond, 16, 2);
  addEnc(flowers, 20, 2);
  addEnc(grove, 18, 2);
  addEnc(canyon, 18, 1);
  addEnc(ruins, 9, 1);

  return { tallGrassZones, encounterPoints, update };
}

// ---------------------------------------------------------------------------
// per-frame update — cheap, allocation-free
// ---------------------------------------------------------------------------
function update(dt, time, playerPos) {
  state.time = time;

  // --- rustle tall grass: stronger sway near the player ---
  const g = state.grass;
  if (g) {
    const blades = g.blades;
    const dummy = g.dummy;
    const mesh = g.mesh;
    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;
    let idx = 0;
    const n = blades.length;
    for (let i = 0; i < n; i++) {
      const b = blades[i];
      const dx = b.x - px, dz = b.z - pz;
      const d2 = dx * dx + dz * dz;
      // base wind + proximity boost (within ~6 units)
      let amp = 0.12;
      if (d2 < 36) amp += (1 - d2 / 36) * 0.6;
      const sway = Math.sin(time * 2.2 + b.phase) * amp;
      _v.set(b.x, b.y, b.z);
      for (let k = 0; k < 2; k++) {
        dummy.position.copy(_v);
        _q.setFromAxisAngle(_up, b.phase + k * Math.PI / 2);
        dummy.quaternion.copy(_q);
        // lean by rotating slightly around Z via euler after the y-rot:
        dummy.rotation.set(sway * 0.6, b.phase + k * Math.PI / 2, sway);
        _s.set(1, b.h, 1);
        dummy.scale.copy(_s);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- reeds gentle constant sway ---
  const reeds = state.reeds;
  if (reeds) {
    const items = reeds.items;
    const dummy = reeds.dummy;
    const mesh = reeds.mesh;
    let idx = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const sway = Math.sin(time * 1.6 + it.phase) * 0.18;
      for (let k = 0; k < 2; k++) {
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(sway * 0.5, it.phase + k * Math.PI / 2, sway);
        dummy.scale.set(1, it.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- ripple the pond surface (vertical wave on copy of base) ---
  const pond = state.pond;
  if (pond) {
    const pos = pond.geo.attributes.position.array;
    const base = pond.base;
    for (let i = 0; i < pos.length; i += 3) {
      const bx = base[i], bz = base[i + 2];
      pos[i + 1] = base[i + 1] + Math.sin(time * 2 + bx * 0.3 + bz * 0.25) * 0.08;
    }
    pond.geo.attributes.position.needsUpdate = true;
    // subtle texture drift for shimmer
    const map = pond.mesh.material.map;
    if (map) { map.offset.x = time * 0.01; map.offset.y = time * 0.006; }
  }

  // --- bob lily pads ---
  const lil = state.lilies;
  for (let i = 0; i < lil.length; i++) {
    const l = lil[i];
    l.mesh.position.y = l.baseY + Math.sin(time * 1.4 + l.phase) * 0.05;
    l.mesh.rotation.z = Math.sin(time * 1.1 + l.phase) * 0.04;
  }
}
