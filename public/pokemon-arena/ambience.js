// ambience.js — living-world ambience layer for the pokemon arena.
//
// Adds five cheap, fully pooled effect systems on top of the stadium scene:
//   1. pollen/dust motes drifting in a bubble that follows the player
//   2. bird flocks flying lazy circuits high over the map
//   3. autumn leaves tumbling down through the forest belt (r 75-150)
//   4. butterflies fluttering low over the battle field (r < 45)
//   5. faint additive heat-shimmer sprites rising over the arena turf
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

// -- leaves ------------------------------------------------------------------
let _leafMesh = null;            // InstancedMesh
const _leaves = [];              // per-leaf sim state
const _dummy = new THREE.Object3D(); // reused matrix composer (never re-created)

// -- butterflies ---------------------------------------------------------------
const _butterflies = [];

// -- heat shimmer --------------------------------------------------------------
const _shimmers = [];

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
  _initLeaves(Math.round(60 * half));
  _initButterflies(isTouch ? 5 : 10);
  _initShimmer(isTouch ? 3 : 5);

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
  leaf.srx = (Math.random() * 2 - 1) * 2.2;
  leaf.sry = (Math.random() * 2 - 1) * 2.2;
  leaf.srz = (Math.random() * 2 - 1) * 1.4;
}

// -- 4. butterflies --------------------------------------------------------------

const BUTTERFLY_COLORS = [0xffd34d, 0xff7ab8, 0x7ad7ff, 0xc7ff6b, 0xffa04d];

function _initButterflies(count) {
  // Wing plane lying flat (XZ), hinged at the body on the inner edge.
  const wingGeo = new THREE.PlaneGeometry(0.26, 0.2);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0.15, 0, 0);

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
    const scale = 16 + Math.random() * 12;
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

  // -- 2. birds: leader on a circle, birds trail with offsets, wings flap ----
  for (let f = 0; f < _flocks.length; f++) {
    const fl = _flocks[f];
    const leaderAngle = fl.angle0 + time * fl.omega;
    for (let b = 0; b < fl.birds.length; b++) {
      const bd = fl.birds[b];
      const a = leaderAngle + bd.angleOff;
      const r = fl.radius + bd.radiusOff;
      const obj = bd.obj;

      obj.position.set(
        fl.cx + Math.cos(a) * r,
        fl.baseY + bd.heightOff + Math.sin(time * 0.5 + bd.bobPhase) * 1.2,
        fl.cz + Math.sin(a) * r
      );
      // face along the tangent of the circuit
      const dirx = -Math.sin(a) * fl.omega;
      const dirz = Math.cos(a) * fl.omega;
      obj.rotation.y = Math.atan2(dirx, dirz);

      const flap = Math.sin(time * fl.flapSpeed + bd.flapPhase) * 0.75;
      bd.wingR.rotation.z = flap;
      bd.wingL.rotation.z = -flap;
    }
  }

  // -- 3. leaves: tumble down with sway, respawn at canopy on landing --------
  for (let i = 0; i < _leaves.length; i++) {
    const lf = _leaves[i];
    lf.y -= lf.fall * dt;
    if (lf.y <= lf.groundY) _respawnLeaf(lf, false);

    lf.rx += lf.srx * dt;
    lf.ry += lf.sry * dt;
    lf.rz += lf.srz * dt;

    _dummy.position.set(
      lf.bx + Math.sin(time * lf.swayFreq + lf.phase) * lf.swayAmp,
      lf.y,
      lf.bz + Math.cos(time * lf.swayFreq * 0.8 + lf.phase) * lf.swayAmp
    );
    _dummy.rotation.set(lf.rx, lf.ry, lf.rz);
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
}
