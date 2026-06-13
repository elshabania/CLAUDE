// ambience.js — living-world ambience layer for the pokemon arena.
//
// Adds cheap, fully pooled effect systems on top of the stadium scene:
//   1. pollen/dust motes drifting in a bubble that follows the player
//   2. bird flocks flying lazy circuits (with slow dive/swoop arcs) plus a
//      tiny distant 4-dot flock at y 60
//   3. autumn leaves tumbling down through the forest belt (r 75-150),
//      resting briefly on the ground before respawning
//   4. butterflies fluttering low over the battle field (r < 45), a few
//      trailed by a faint additive glow sprite
//   5. faint additive heat-shimmer sprites rising over the arena turf and
//      the two lakes
//   6. fake-volumetric god-ray shafts angled from the sun over the stadium
//   7. warm firefly glows wandering the arena edge (r 20-45)
//
// Everything is preallocated in initAmbience(); updateAmbience() does plain
// arithmetic only (no per-frame allocations) and is safe to call every frame.
//
// Usage:
//   import { initAmbience, updateAmbience } from "./ambience.js";
//   initAmbience(scene, terrainHeight, isTouch);
//   ... in the render loop:
//   updateAmbience(dt, elapsedTime, player.position);

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Module state (filled by initAmbience)
// ---------------------------------------------------------------------------

let _ready = false;
let _root = null;
let _terrainHeight = function (x, z) { return 0; };

// -- pollen motes ------------------------------------------------------------
const MOTE_HALF = 15;            // half-extent of the 30-unit drift bubble
let _motePoints = null;
let _motePos = null;             // Float32Array view of position attribute
let _moteVel = null;             // Float32Array vx,vy,vz per mote
let _motePhase = null;           // Float32Array sway phase per mote
let _moteCount = 0;

// -- birds -------------------------------------------------------------------
const _flocks = [];              // { cx, cz, radius, omega, baseY, angle0, birds[] }
let _farPoints = null;           // distant 4-dot flock (Points)
let _farPos = null;              // Float32Array position view
const _far = { cx: 0, cz: 0, radius: 0, omega: 0, angle0: 0, offs: null };

// -- leaves ------------------------------------------------------------------
let _leafMesh = null;            // InstancedMesh
const _leaves = [];              // per-leaf sim state
const _dummy = new THREE.Object3D(); // reused matrix composer (never re-created)

// -- butterflies ---------------------------------------------------------------
const _butterflies = [];
const _glows = [];               // { mat, phase } pulsed butterfly glow sprites

// -- heat shimmer --------------------------------------------------------------
const _shimmers = [];

// -- god rays -------------------------------------------------------------------
const _rays = [];                // { mat, base, speed, phase }

// -- fireflies ------------------------------------------------------------------
const _fireflies = [];

// ---------------------------------------------------------------------------
// Canvas texture helpers (no external assets)
// ---------------------------------------------------------------------------

function _makeRadialTexture(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft vertical light-shaft gradient: bright center column, feathered edges,
// faded top/bottom so the plane never shows a hard rectangle.
function _makeShaftTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const gx = ctx.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0.0, "rgba(255,244,214,0)");
  gx.addColorStop(0.5, "rgba(255,244,214,1)");
  gx.addColorStop(1.0, "rgba(255,244,214,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, 64, 256);

  ctx.globalCompositeOperation = "destination-in";
  const gy = ctx.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0.0, "rgba(0,0,0,0)");
  gy.addColorStop(0.22, "rgba(0,0,0,0.9)");
  gy.addColorStop(0.75, "rgba(0,0,0,0.55)");
  gy.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, 64, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function initAmbience(scene, terrainHeight, isTouch) {
  if (typeof terrainHeight === "function") _terrainHeight = terrainHeight;

  _root = new THREE.Group();
  _root.name = "ambience";
  scene.add(_root);

  const half = isTouch ? 0.5 : 1.0;

  _initMotes(Math.round(120 * half));
  _initBirds(isTouch);
  _initFarFlock();
  _initLeaves(Math.round(60 * half));
  _initButterflies(isTouch ? 5 : 10);
  _initShimmer(isTouch ? 3 : 5);
  _initGodRays(isTouch ? 4 : 5);
  _initFireflies(isTouch ? 8 : 12);

  _ready = true;
}

// -- 1. pollen / dust motes --------------------------------------------------

function _initMotes(count) {
  _moteCount = count;

  const tex = _makeRadialTexture(64, [
    [0.0, "rgba(255,244,214,0.9)"],
    [0.4, "rgba(255,238,200,0.35)"],
    [1.0, "rgba(255,238,200,0)"],
  ]);

  const geo = new THREE.BufferGeometry();
  _motePos = new Float32Array(count * 3);
  _moteVel = new Float32Array(count * 3);
  _motePhase = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    _motePos[i * 3 + 0] = (Math.random() * 2 - 1) * MOTE_HALF;
    _motePos[i * 3 + 1] = (Math.random() * 2 - 1) * MOTE_HALF;
    _motePos[i * 3 + 2] = (Math.random() * 2 - 1) * MOTE_HALF;
    _moteVel[i * 3 + 0] = (Math.random() * 2 - 1) * 0.25;
    _moteVel[i * 3 + 1] = (Math.random() * 2 - 1) * 0.12;
    _moteVel[i * 3 + 2] = (Math.random() * 2 - 1) * 0.25;
    _motePhase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(_motePos, 3));

  const mat = new THREE.PointsMaterial({
    map: tex,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    blending: THREE.NormalBlending,
    depthWrite: false,
    color: 0xfff2cf, // warm golden-hour dust, dim enough to stay under bloom
  });

  _motePoints = new THREE.Points(geo, mat);
  _motePoints.frustumCulled = false; // bubble follows the camera anyway
  _root.add(_motePoints);
}

// -- 2. bird flocks ------------------------------------------------------------

function _initBirds(isTouch) {
  // One thin triangle wing, span along +x, hinge at the body.
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    0.0, 0, -0.18,
    0.0, 0, 0.18,
    1.15, 0, 0.04,
  ]), 3));
  wingGeo.computeVertexNormals();

  const wingMat = new THREE.MeshBasicMaterial({
    color: 0x16161e, // dark silhouette against the golden sky
    side: THREE.DoubleSide,
  });

  const flockDefs = isTouch
    ? [{ n: 3 }, { n: 4 }, { n: 3 }]
    : [{ n: 5 }, { n: 7 }, { n: 6 }];

  for (let f = 0; f < flockDefs.length; f++) {
    const flock = {
      cx: (Math.random() * 2 - 1) * 90,
      cz: (Math.random() * 2 - 1) * 90,
      radius: 70 + Math.random() * 110,       // long circuits, stays inside r~260
      omega: (0.05 + Math.random() * 0.04) * (f % 2 === 0 ? 1 : -1),
      baseY: 27 + Math.random() * 15,          // y 25-45 band
      angle0: Math.random() * Math.PI * 2,
      flapSpeed: 5.5 + Math.random() * 1.5,
      diveAmp: 4 + Math.random() * 5,          // occasional dive/swoop arcs
      diveFreq: 0.1 + Math.random() * 0.08,
      divePhase: Math.random() * Math.PI * 2,
      birds: [],
    };

    for (let b = 0; b < flockDefs[f].n; b++) {
      const bird = new THREE.Group();

      const wingR = new THREE.Mesh(wingGeo, wingMat);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.scale.x = -1;
      bird.add(wingR, wingL);

      _root.add(bird);

      flock.birds.push({
        obj: bird,
        wingR: wingR,
        wingL: wingL,
        angleOff: -b * 0.045 + (Math.random() - 0.5) * 0.02, // trail the leader
        radiusOff: (Math.random() * 2 - 1) * 3.0,
        heightOff: (Math.random() * 2 - 1) * 2.5,
        bobPhase: Math.random() * Math.PI * 2,
        flapPhase: Math.random() * Math.PI * 2,
      });
    }
    _flocks.push(flock);
  }
}

// Second, far-off flock: just 4 dark dots circling high at y 60.
function _initFarFlock() {
  _far.cx = (Math.random() * 2 - 1) * 40;
  _far.cz = (Math.random() * 2 - 1) * 40;
  _far.radius = 150 + Math.random() * 50;
  _far.omega = (0.03 + Math.random() * 0.02) * (Math.random() < 0.5 ? 1 : -1);
  _far.angle0 = Math.random() * Math.PI * 2;
  _far.offs = new Float32Array([0, -0.045, -0.085, -0.13]); // trail spacing

  _farPos = new Float32Array(4 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(_farPos, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x1a1a24,
    size: 0.9,
    sizeAttenuation: true,
  });

  _farPoints = new THREE.Points(geo, mat);
  _farPoints.frustumCulled = false;
  _root.add(_farPoints);
}

// -- 3. falling leaves ---------------------------------------------------------

const LEAF_COLORS = [0xc8742a, 0xd9a02f, 0xa8552a, 0xb8862c, 0x9c6b25, 0xcc5b22];

function _initLeaves(count) {
  const geo = new THREE.PlaneGeometry(0.32, 0.26);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  _leafMesh = new THREE.InstancedMesh(geo, mat, count);
  _leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _leafMesh.frustumCulled = false;
  _root.add(_leafMesh);

  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const leaf = {
      bx: 0, bz: 0, y: 0, groundY: 0,
      fall: 0, swayAmp: 0, swayFreq: 0, phase: 0,
      rx: 0, ry: 0, rz: 0, srx: 0, sry: 0, srz: 0,
      scale: 1, rest: 0, restX: 0, restZ: 0,
    };
    _respawnLeaf(leaf, true);
    _leaves.push(leaf);

    col.setHex(LEAF_COLORS[i % LEAF_COLORS.length]);
    col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    _leafMesh.setColorAt(i, col);
  }
  if (_leafMesh.instanceColor) _leafMesh.instanceColor.needsUpdate = true;
}

function _respawnLeaf(leaf, randomizeHeight) {
  // Forest belt annulus: radius 75-150.
  const a = Math.random() * Math.PI * 2;
  const r = 75 + Math.random() * 75;
  leaf.bx = Math.cos(a) * r;
  leaf.bz = Math.sin(a) * r;
  leaf.groundY = _terrainHeight(leaf.bx, leaf.bz) + 0.08;
  const top = leaf.groundY + 22 + Math.random() * 14; // canopy height-ish
  leaf.y = randomizeHeight ? leaf.groundY + Math.random() * (top - leaf.groundY) : top;
  leaf.fall = 0.9 + Math.random() * 0.9;
  leaf.swayAmp = 0.6 + Math.random() * 0.9;
  leaf.swayFreq = 0.8 + Math.random() * 0.8;
  leaf.phase = Math.random() * Math.PI * 2;
  leaf.rx = Math.random() * Math.PI * 2;
  leaf.ry = Math.random() * Math.PI * 2;
  leaf.rz = Math.random() * Math.PI * 2;
  leaf.srx = (Math.random() * 2 - 1) * (1.2 + Math.random() * 2.4); // tumble variety
  leaf.sry = (Math.random() * 2 - 1) * (1.2 + Math.random() * 2.4);
  leaf.srz = (Math.random() * 2 - 1) * (0.6 + Math.random() * 1.8);
  leaf.scale = 0.75 + Math.random() * 0.65;    // size variety
  leaf.rest = 0;                               // 0 = falling
}

// -- 4. butterflies --------------------------------------------------------------

const BUTTERFLY_COLORS = [0xffd34d, 0xff7ab8, 0x7ad7ff, 0xc7ff6b, 0xffa04d];

function _initButterflies(count) {
  // Wing plane lying flat (XZ), hinged at the body on the inner edge.
  const wingGeo = new THREE.PlaneGeometry(0.26, 0.2);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0.15, 0, 0);

  const glowTex = _makeRadialTexture(64, [
    [0.0, "rgba(255,255,255,0.8)"],
    [0.5, "rgba(255,255,255,0.25)"],
    [1.0, "rgba(255,255,255,0)"],
  ]);

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length],
      side: THREE.DoubleSide,
    });

    const fly = new THREE.Group();
    const wingR = new THREE.Mesh(wingGeo, mat);
    const wingL = new THREE.Mesh(wingGeo, mat);
    wingL.scale.x = -1;
    fly.add(wingR, wingL);

    // a few butterflies carry a faint additive glow that follows for free
    if (i < 3) {
      const gmat = new THREE.SpriteMaterial({
        map: glowTex,
        color: BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length],
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(gmat);
      glow.scale.set(0.95, 0.95, 1);
      fly.add(glow);
      _glows.push({ mat: gmat, phase: Math.random() * Math.PI * 2 });
    }
    _root.add(fly);

    // Wander home inside the field (keep |home| + amp < 45).
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 30;
    const hx = Math.cos(a) * r;
    const hz = Math.sin(a) * r;

    _butterflies.push({
      obj: fly,
      wingR: wingR,
      wingL: wingL,
      hx: hx,
      hz: hz,
      groundY: _terrainHeight(hx, hz),
      baseY: 1.6 + Math.random() * 1.8,        // hover band y ~1-4
      ax: 0.21 + Math.random() * 0.16,         // wander frequencies
      az: 0.17 + Math.random() * 0.16,
      rxAmp: 5 + Math.random() * 7,
      rzAmp: 5 + Math.random() * 7,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
      bobFreq: 1.1 + Math.random() * 0.9,
      bobPhase: Math.random() * Math.PI * 2,
      flapSpeed: 16 + Math.random() * 8,       // fast flutter
      flapPhase: Math.random() * Math.PI * 2,
    });
  }
}

// -- 5. heat shimmer --------------------------------------------------------------

function _initShimmer(count) {
  const tex = _makeRadialTexture(128, [
    [0.0, "rgba(255,236,200,0.55)"],
    [0.5, "rgba(255,230,190,0.22)"],
    [1.0, "rgba(255,230,190,0)"],
  ]);

  const turfY = _terrainHeight(0, 0);

  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x665a44, // very dim: additive + bloom threshold 0.8 stays safe
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 20 + Math.random() * 14;     // slightly larger haze pockets
    sprite.scale.set(scale, scale * 0.55, 1);
    _root.add(sprite);

    _shimmers.push({
      obj: sprite,
      mat: mat,
      x: (Math.random() * 2 - 1) * 12,
      z: (Math.random() * 2 - 1) * 12,
      y0: turfY + 2.0,
      rise: 7 + Math.random() * 4,            // total climb over one loop
      period: 7 + Math.random() * 5,          // slow loop, seconds
      phase: Math.random(),                    // 0-1 loop offset
      drift: (Math.random() * 2 - 1) * 1.5,
    });
  }

  // two extra shimmers over the lakes (only where the terrain dips under the
  // water plane at y~1.6 — i.e. there actually is a lake there)
  const lakes = [[-130, 95], [115, -125]];
  for (let k = 0; k < lakes.length; k++) {
    const lx = lakes[k][0], lz = lakes[k][1];
    if (_terrainHeight(lx, lz) >= 1.6) continue;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x4e5c66, // cooler, dimmer haze over water
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 20 + Math.random() * 10;
    sprite.scale.set(scale, scale * 0.5, 1);
    _root.add(sprite);

    _shimmers.push({
      obj: sprite,
      mat: mat,
      x: lx,
      z: lz,
      y0: 1.6 + 0.8,                          // just above the water surface
      rise: 5 + Math.random() * 3,
      period: 8 + Math.random() * 5,
      phase: Math.random(),
      drift: (Math.random() * 2 - 1) * 2.0,
    });
  }
}

// -- 6. god-ray shafts -----------------------------------------------------------

function _initGodRays(count) {
  const tex = _makeShaftTexture();

  // shaft axis aligned with the sun direction (~55, 80, 35)
  const sunDir = new THREE.Vector3(55, 80, 35).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), sunDir
  );

  for (let i = 0; i < count; i++) {
    const w = 7 + Math.random() * 7;
    const h = 55 + Math.random() * 20;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xffeec8,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const a = (i / count) * Math.PI * 2 + Math.random() * 0.8;
    const r = 8 + Math.random() * 26;
    mesh.position.set(Math.cos(a) * r, 20 + Math.random() * 10, Math.sin(a) * r);
    mesh.quaternion.copy(q);
    mesh.rotateY(Math.random() * Math.PI); // spin around the shaft axis
    mesh.frustumCulled = false;
    _root.add(mesh);

    _rays.push({
      mat: mat,
      base: 0.04 + Math.random() * 0.025,    // ~0.05 peak
      speed: 0.2 + Math.random() * 0.2,      // slow pulse
      phase: Math.random() * Math.PI * 2,
    });
  }
}

// -- 7. fireflies ------------------------------------------------------------------

function _initFireflies(count) {
  const tex = _makeRadialTexture(64, [
    [0.0, "rgba(255,225,150,1)"],
    [0.35, "rgba(255,200,110,0.4)"],
    [1.0, "rgba(255,190,90,0)"],
  ]);

  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffc966,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 0.4 + Math.random() * 0.25;
    sprite.scale.set(s, s, 1);
    _root.add(sprite);

    // home ring around the arena edge, r 20-45
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const r = 20 + Math.random() * 25;
    const hx = Math.cos(a) * r;
    const hz = Math.sin(a) * r;

    _fireflies.push({
      obj: sprite,
      mat: mat,
      hx: hx,
      hz: hz,
      groundY: _terrainHeight(hx, hz),
      baseY: 1.2 + Math.random() * 1.6,      // y ~1-3 above ground
      ax: 0.14 + Math.random() * 0.12,       // smooth sin wander
      az: 0.11 + Math.random() * 0.12,
      ampX: 2.5 + Math.random() * 3.5,
      ampZ: 2.5 + Math.random() * 3.5,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
      bobFreq: 0.5 + Math.random() * 0.5,
      bobPhase: Math.random() * Math.PI * 2,
      blinkFreq: 0.6 + Math.random() * 0.7,  // gentle blink
      blinkPhase: Math.random() * Math.PI * 2,
    });
  }
}

// ---------------------------------------------------------------------------
// update — plain arithmetic only, zero allocations
// ---------------------------------------------------------------------------

export function updateAmbience(dt, time, playerPos) {
  if (!_ready) return;
  if (dt > 0.1) dt = 0.1; // tab-switch guard

  const px = playerPos.x, py = playerPos.y, pz = playerPos.z;

  // -- 1. motes: drift + wrap inside the 30-unit bubble around the player ----
  const pos = _motePos, vel = _moteVel, ph = _motePhase;
  const span = MOTE_HALF * 2;
  for (let i = 0; i < _moteCount; i++) {
    const j = i * 3;
    pos[j]     += (vel[j]     + Math.sin(time * 0.6 + ph[i]) * 0.08) * dt;
    pos[j + 1] += (vel[j + 1] + Math.sin(time * 0.4 + ph[i] * 1.7) * 0.05) * dt;
    pos[j + 2] += (vel[j + 2] + Math.cos(time * 0.5 + ph[i]) * 0.08) * dt;

    // wrap each axis relative to the player (seamless parallax bubble)
    let d = pos[j] - px;
    if (d > MOTE_HALF) pos[j] -= span; else if (d < -MOTE_HALF) pos[j] += span;
    d = pos[j + 1] - py;
    if (d > MOTE_HALF) pos[j + 1] -= span; else if (d < -MOTE_HALF) pos[j + 1] += span;
    d = pos[j + 2] - pz;
    if (d > MOTE_HALF) pos[j + 2] -= span; else if (d < -MOTE_HALF) pos[j + 2] += span;
  }
  _motePoints.geometry.attributes.position.needsUpdate = true;

  // -- 2. birds: leader on a circle with slow dive/swoop arcs, wings flap ----
  for (let f = 0; f < _flocks.length; f++) {
    const fl = _flocks[f];
    const leaderAngle = fl.angle0 + time * fl.omega;
    // leader path height swells and dips: occasional dive/swoop arcs
    const diveT = time * fl.diveFreq + fl.divePhase;
    const leaderY = fl.baseY + Math.sin(diveT) * fl.diveAmp;
    const diveVy = Math.cos(diveT) * fl.diveFreq * fl.diveAmp; // dY/dt
    const pitch = -diveVy * 0.5;                               // nose into the dive

    for (let b = 0; b < fl.birds.length; b++) {
      const bd = fl.birds[b];
      const a = leaderAngle + bd.angleOff;
      const r = fl.radius + bd.radiusOff;
      const obj = bd.obj;

      obj.position.set(
        fl.cx + Math.cos(a) * r,
        leaderY + bd.heightOff + Math.sin(time * 0.5 + bd.bobPhase) * 1.2,
        fl.cz + Math.sin(a) * r
      );
      // face along the tangent of the circuit, pitch with the swoop
      const dirx = -Math.sin(a) * fl.omega;
      const dirz = Math.cos(a) * fl.omega;
      obj.rotation.y = Math.atan2(dirx, dirz);
      obj.rotation.x = pitch;

      const flap = Math.sin(time * fl.flapSpeed + bd.flapPhase) * 0.75;
      bd.wingR.rotation.z = flap;
      bd.wingL.rotation.z = -flap;
    }
  }

  // distant 4-dot flock at y 60
  const fa = _far.angle0 + time * _far.omega;
  for (let i = 0; i < 4; i++) {
    const a = fa + _far.offs[i];
    _farPos[i * 3]     = _far.cx + Math.cos(a) * _far.radius;
    _farPos[i * 3 + 1] = 60 + Math.sin(time * 0.18 + i * 1.3) * 1.5;
    _farPos[i * 3 + 2] = _far.cz + Math.sin(a) * _far.radius;
  }
  _farPoints.geometry.attributes.position.needsUpdate = true;

  // -- 3. leaves: tumble down with sway, rest on the ground, then respawn ----
  for (let i = 0; i < _leaves.length; i++) {
    const lf = _leaves[i];

    if (lf.rest > 0) {
      // brief ground rest: frozen where it landed
      lf.rest -= dt;
      if (lf.rest <= 0) _respawnLeaf(lf, false);
      _dummy.position.set(lf.restX, lf.y, lf.restZ);
    } else {
      lf.y -= lf.fall * dt;
      lf.rx += lf.srx * dt;
      lf.ry += lf.sry * dt;
      lf.rz += lf.srz * dt;

      const sx = lf.bx + Math.sin(time * lf.swayFreq + lf.phase) * lf.swayAmp;
      const sz = lf.bz + Math.cos(time * lf.swayFreq * 0.8 + lf.phase) * lf.swayAmp;

      if (lf.y <= lf.groundY) {
        // touch down: lie nearly flat and rest for a moment
        lf.y = lf.groundY;
        lf.rest = 0.8 + Math.random() * 2.2;
        lf.restX = sx;
        lf.restZ = sz;
        lf.rx = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        lf.rz = 0;
      }
      _dummy.position.set(sx, lf.y, sz);
    }

    _dummy.rotation.set(lf.rx, lf.ry, lf.rz);
    _dummy.scale.set(lf.scale, lf.scale, lf.scale);
    _dummy.updateMatrix();
    _leafMesh.setMatrixAt(i, _dummy.matrix);
  }
  _leafMesh.instanceMatrix.needsUpdate = true;

  // -- 4. butterflies: smooth sin wander + fast flutter -----------------------
  for (let i = 0; i < _butterflies.length; i++) {
    const bf = _butterflies[i];
    const obj = bf.obj;

    const x = bf.hx + Math.sin(time * bf.ax + bf.p1) * bf.rxAmp;
    const z = bf.hz + Math.cos(time * bf.az + bf.p2) * bf.rzAmp;
    const y = bf.groundY + bf.baseY + Math.sin(time * bf.bobFreq + bf.bobPhase) * 0.8;
    obj.position.set(x, y, z);

    // yaw toward the analytic travel direction
    const dx = Math.cos(time * bf.ax + bf.p1) * bf.ax * bf.rxAmp;
    const dz = -Math.sin(time * bf.az + bf.p2) * bf.az * bf.rzAmp;
    obj.rotation.y = Math.atan2(dx, dz);

    const flap = Math.sin(time * bf.flapSpeed + bf.flapPhase) * 1.0 + 0.25;
    bf.wingR.rotation.z = flap;
    bf.wingL.rotation.z = -flap;
  }

  // soft pulse on the butterfly glow sprites
  for (let i = 0; i < _glows.length; i++) {
    const g = _glows[i];
    g.mat.opacity = 0.12 + 0.07 * Math.sin(time * 1.7 + g.phase);
  }

  // -- 5. heat shimmer: rise + fade in/out on loop -----------------------------
  for (let i = 0; i < _shimmers.length; i++) {
    const sh = _shimmers[i];
    const t01 = (time / sh.period + sh.phase) % 1;
    sh.obj.position.set(
      sh.x + Math.sin(time * 0.15 + sh.phase * 6.28) * sh.drift,
      sh.y0 + t01 * sh.rise,
      sh.z
    );
    sh.mat.opacity = Math.sin(t01 * Math.PI) * 0.06;
  }

  // -- 6. god rays: slow opacity pulse ------------------------------------------
  for (let i = 0; i < _rays.length; i++) {
    const ry = _rays[i];
    ry.mat.opacity = ry.base * (0.7 + 0.3 * Math.sin(time * ry.speed + ry.phase));
  }

  // -- 7. fireflies: smooth sin wander + gentle blink ---------------------------
  for (let i = 0; i < _fireflies.length; i++) {
    const ff = _fireflies[i];
    ff.obj.position.set(
      ff.hx + Math.sin(time * ff.ax + ff.p1) * ff.ampX,
      ff.groundY + ff.baseY + Math.sin(time * ff.bobFreq + ff.bobPhase) * 0.6,
      ff.hz + Math.cos(time * ff.az + ff.p2) * ff.ampZ
    );
    const b = 0.5 + 0.5 * Math.sin(time * ff.blinkFreq + ff.blinkPhase);
    ff.mat.opacity = 0.1 + 0.6 * b * b * b; // mostly dim, soft warm flares
  }
}
