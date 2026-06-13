// ambience.js — Pokémon Arena 3D atmospheric ambience layer.
// Contract: export initAmbience({ scene, quality }) -> { update(dt, t, playerPos, camera) }
// Builds: god-ray slanted additive planes (camera-faded), firefly field outside the arena,
// 2 banking instanced bird flocks on lissajous loops, falling leaves over forest groves,
// fluttering two-quad butterflies near grass, and a heat-shimmer ring above the arena torches.
// Pure procedural geometry + <canvas> textures only. No per-frame allocations.

import * as THREE from 'three';

const ARENA_RADIUS = 45;          // fireflies/butterflies activate beyond this
const FOREST_INNER = 120;         // forest grove ring (matches environment.js radius band)
const FOREST_OUTER = 220;

// ── Count tuning (halved on low, 0.75x on medium) ───────────────────────────
const BASE = {
  godRays: 9,
  fireflies: 120,
  birdsPerFlock: 14,
  leaves: 80,
  butterflies: 30,
  shimmer: 14,
};

function tierScale(tier) {
  if (tier === 'low') return 0.5;
  if (tier === 'medium') return 0.75;
  return 1;
}

// ── Canvas textures (generated once at build) ───────────────────────────────

function makeRadialTexture(size, inner, outer, falloff) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(falloff, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShaftTexture() {
  const w = 64, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // vertical bright core fading to the sides, brighter at top (the light source)
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,235,180,0)');
  g.addColorStop(0.5, 'rgba(255,240,200,0.9)');
  g.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // top-to-bottom fade so the shaft dissolves before it reaches the ground
  const v = ctx.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(255,255,255,1)');
  v.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLeafTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // simple autumn leaf shape
  ctx.fillStyle = '#c8702a';
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.08);
  ctx.bezierCurveTo(s * 0.95, s * 0.3, s * 0.85, s * 0.85, s * 0.5, s * 0.95);
  ctx.bezierCurveTo(s * 0.15, s * 0.85, s * 0.05, s * 0.3, s * 0.5, s * 0.08);
  ctx.fill();
  // central vein
  ctx.strokeStyle = 'rgba(120,60,20,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.12);
  ctx.lineTo(s * 0.5, s * 0.9);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWingTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // butterfly half-wing: warm body color with eyespot
  ctx.fillStyle = '#e0742c';
  ctx.beginPath();
  ctx.ellipse(s * 0.4, s * 0.5, s * 0.36, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40,20,10,0.85)';
  ctx.beginPath();
  ctx.ellipse(s * 0.45, s * 0.4, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,210,0.9)';
  ctx.beginPath();
  ctx.ellipse(s * 0.45, s * 0.4, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Heat-shimmer material (cheap wobble shader) ─────────────────────────────

function makeShimmerMaterial() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // gentle vertical ripple so the plane appears to refract heat
        p.y += sin(uv.x * 12.0 + uTime * 3.0) * 0.08;
        p.x += cos(uv.y * 10.0 + uTime * 2.3) * 0.06;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        // wobbling near-transparent veil; visible only as a faint distorting sheen
        float w = sin(vUv.x * 22.0 + uTime * 4.0) * 0.5 + 0.5;
        w *= sin(vUv.y * 18.0 - uTime * 3.0) * 0.5 + 0.5;
        float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float a = (0.05 + 0.07 * w) * edge;
        gl_FragColor = vec4(uTint, a);
      }`,
  });
  return mat;
}

export function initAmbience({ scene, quality }) {
  const tier = (quality && quality.tier) || 'high';
  const s = tierScale(tier);
  const N = {
    godRays: Math.max(3, Math.round(BASE.godRays * s)),
    fireflies: Math.max(20, Math.round(BASE.fireflies * s)),
    birdsPerFlock: Math.max(6, Math.round(BASE.birdsPerFlock * s)),
    leaves: Math.max(20, Math.round(BASE.leaves * s)),
    butterflies: Math.max(8, Math.round(BASE.butterflies * s)),
    shimmer: Math.max(5, Math.round(BASE.shimmer * s)),
  };

  const group = new THREE.Group();
  group.name = 'ambience';
  scene.add(group);

  // Shared textures (built once).
  const shaftTex = makeShaftTexture();
  const fireflyTex = makeRadialTexture(64, 'rgba(220,255,180,1)', 'rgba(180,230,120,0.5)', 0.4);
  const leafTex = makeLeafTexture();
  const wingTex = makeWingTexture();

  // Reusable temporaries (NO per-frame allocations below this point).
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _mat = new THREE.Matrix4();
  const _scale = new THREE.Vector3();
  const _euler = new THREE.Euler();
  const _color = new THREE.Color();
  const _up = new THREE.Vector3(0, 1, 0);

  // ── 1. God-ray shafts ─────────────────────────────────────────────────────
  const godRays = [];
  {
    const mat = new THREE.MeshBasicMaterial({
      map: shaftTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      color: 0xfff0cf,
    });
    const geo = new THREE.PlaneGeometry(10, 60);
    for (let i = 0; i < N.godRays; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      const ang = (i / N.godRays) * Math.PI * 2 + 0.4;
      const r = 18 + (i % 3) * 6;
      m.position.set(Math.cos(ang) * r, 26, Math.sin(ang) * r);
      // slant the shaft: tilt away from vertical and rotate to face roughly inward
      m.rotation.order = 'YXZ';
      m.rotation.y = ang + Math.PI / 2;
      m.rotation.x = THREE.MathUtils.degToRad(22 + (i % 4) * 4);
      m.renderOrder = 3;
      godRays.push({
        mesh: m,
        baseAng: ang,
        driftPhase: i * 1.7,
        baseOpacity: 0.18 + (i % 3) * 0.05,
      });
      group.add(m);
    }
  }

  // ── 2. Firefly field (Points, active outside arena) ───────────────────────
  let fireflies = null;
  let fireflyMat = null;
  const fireflyData = []; // {ox,oy,oz, phase, speed, amp}
  {
    const positions = new Float32Array(N.fireflies * 3);
    for (let i = 0; i < N.fireflies; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = ARENA_RADIUS + 6 + Math.random() * 120;
      const ox = Math.cos(ang) * r;
      const oz = Math.sin(ang) * r;
      const oy = 1.2 + Math.random() * 5;
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
      fireflyData.push({
        ox, oy, oz,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.8,
        amp: 0.6 + Math.random() * 1.4,
        blink: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fireflyMat = new THREE.PointsMaterial({
      map: fireflyTex,
      size: 1.6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xcaff8c,
      sizeAttenuation: true,
    });
    fireflies = new THREE.Points(geo, fireflyMat);
    fireflies.frustumCulled = false;
    fireflies.renderOrder = 4;
    group.add(fireflies);
  }

  // ── 3. Bird flocks (2 InstancedMesh, banking, wing-flap via scale.y) ──────
  const flocks = [];
  {
    // two-triangle bird: a shallow V (two wing tris sharing the body apex)
    const birdGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0, 0.6,    -1, 0, -0.4,   0, 0.08, -0.1,   // left wing tri
      0, 0, 0.6,    0, 0.08, -0.1,  1, 0, -0.4,      // right wing tri
    ]);
    birdGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    birdGeo.computeVertexNormals();

    const flockDefs = [
      { color: 0x2a2a33, a: 95, b: 70, ax: 2.2, az: 3.1, baseY: 42, speed: 0.18, scale: 1.6 },
      { color: 0x3a2f28, a: 120, b: 90, ax: 1.7, az: 2.4, baseY: 52, speed: 0.13, scale: 2.0 },
    ];

    for (let f = 0; f < flockDefs.length; f++) {
      const def = flockDefs[f];
      const mat = new THREE.MeshBasicMaterial({
        color: def.color,
        side: THREE.DoubleSide,
        fog: true,
      });
      const inst = new THREE.InstancedMesh(birdGeo, mat, N.birdsPerFlock);
      inst.frustumCulled = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const birds = [];
      for (let i = 0; i < N.birdsPerFlock; i++) {
        birds.push({
          phaseOffset: (i / N.birdsPerFlock) * 1.4,        // spacing along the loop
          lateral: (i - N.birdsPerFlock / 2) * 1.8,        // formation spread
          flapPhase: Math.random() * Math.PI * 2,
          flapSpeed: 9 + Math.random() * 4,
          yJitter: (Math.random() - 0.5) * 4,
        });
      }
      group.add(inst);
      flocks.push({ inst, def, birds });
    }
  }

  // ── 4. Falling leaves (InstancedMesh quads over forest groves) ────────────
  let leafInst = null;
  const leafData = [];
  {
    const quad = new THREE.PlaneGeometry(0.5, 0.6);
    const mat = new THREE.MeshBasicMaterial({
      map: leafTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    leafInst = new THREE.InstancedMesh(quad, mat, N.leaves);
    leafInst.frustumCulled = false;
    leafInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N.leaves; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = FOREST_INNER + Math.random() * (FOREST_OUTER - FOREST_INNER);
      leafData.push({
        x: Math.cos(ang) * r,
        z: Math.sin(ang) * r,
        y: 6 + Math.random() * 16,
        fall: 1.2 + Math.random() * 1.4,
        spin: (Math.random() - 0.5) * 2.5,
        tumble: (Math.random() - 0.5) * 2.0,
        sway: 0.6 + Math.random() * 1.0,
        swayPhase: Math.random() * Math.PI * 2,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        scale: 0.8 + Math.random() * 0.9,
      });
    }
    group.add(leafInst);
  }

  // ── 5. Butterflies (two-quad fluttering instances, low, outside arena) ────
  // Each butterfly = 2 InstancedMesh wings (left/right) sharing one body transform.
  let leftWing = null, rightWing = null;
  const flyData = [];
  {
    // wing quad pivoted at its inner edge so flapping hinges at the body
    const wingGeo = new THREE.PlaneGeometry(0.7, 0.6);
    wingGeo.translate(0.35, 0, 0); // hinge at x=0
    const leftMat = new THREE.MeshBasicMaterial({
      map: wingTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false,
    });
    const rightMat = leftMat.clone();
    leftWing = new THREE.InstancedMesh(wingGeo, leftMat, N.butterflies);
    rightWing = new THREE.InstancedMesh(wingGeo, rightMat, N.butterflies);
    leftWing.frustumCulled = false;
    rightWing.frustumCulled = false;
    leftWing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rightWing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leftWing.renderOrder = 4;
    rightWing.renderOrder = 4;
    for (let i = 0; i < N.butterflies; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = ARENA_RADIUS + 4 + Math.random() * 70;
      flyData.push({
        cx: Math.cos(ang) * r,
        cz: Math.sin(ang) * r,
        roamR: 2 + Math.random() * 5,
        roamSpeed: 0.3 + Math.random() * 0.5,
        roamPhase: Math.random() * Math.PI * 2,
        baseY: 0.5 + Math.random() * 1.5,
        bobAmp: 0.2 + Math.random() * 0.4,
        bobSpeed: 1.0 + Math.random() * 1.5,
        flapPhase: Math.random() * Math.PI * 2,
        flapSpeed: 11 + Math.random() * 6,
        heading: Math.random() * Math.PI * 2,
        scale: 0.7 + Math.random() * 0.6,
      });
    }
    group.add(leftWing);
    group.add(rightWing);
  }

  // ── 6. Heat-shimmer ring above arena torches ──────────────────────────────
  const shimmerMats = [];
  {
    const geo = new THREE.PlaneGeometry(5, 3.5, 8, 6);
    for (let i = 0; i < N.shimmer; i++) {
      const mat = makeShimmerMaterial();
      const m = new THREE.Mesh(geo, mat);
      const ang = (i / N.shimmer) * Math.PI * 2;
      const r = ARENA_RADIUS - 3;
      m.position.set(Math.cos(ang) * r, 4.5, Math.sin(ang) * r);
      m.rotation.y = ang + Math.PI / 2; // face inward (engine billboards not needed; subtle)
      m.renderOrder = 5;
      group.add(m);
      shimmerMats.push(mat);
    }
  }

  // ── Helper: write a bird instance matrix (banking + wing-flap) ─────────────
  function setInstance(inst, idx, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
    _v.set(px, py, pz);
    _quat.set(qx, qy, qz, qw);
    _scale.set(sx, sy, sz);
    _mat.compose(_v, _quat, _scale);
    inst.setMatrixAt(idx, _mat);
  }

  // ── Update loop ────────────────────────────────────────────────────────────
  function update(dt, t, playerPos, camera) {
    // camera view direction (for god-ray view-angle fade)
    if (camera) camera.getWorldDirection(_camDir);

    // 1. God rays — opacity modulated by view angle + slow drift.
    for (let i = 0; i < godRays.length; i++) {
      const gr = godRays[i];
      const drift = Math.sin(t * 0.25 + gr.driftPhase) * 0.5 + 0.5;
      let viewFade = 1;
      if (camera) {
        // shaft "axis" points downward into the arena; brighter when looking across it
        _v.set(gr.mesh.position.x, 0, gr.mesh.position.z).normalize();
        const align = Math.abs(_v.dot(_camDir)); // 1 when looking along the shaft radial
        viewFade = 0.35 + 0.65 * (1 - align);     // fade when looking straight down a shaft
      }
      const op = gr.baseOpacity * (0.45 + 0.55 * drift) * viewFade;
      gr.mesh.material.opacity = op;
      // gentle sway of the slant
      gr.mesh.rotation.z = Math.sin(t * 0.3 + gr.driftPhase) * 0.05;
    }

    // 2. Fireflies — active only when player is outside arena radius; smooth fade.
    if (fireflies && playerPos) {
      const pr = Math.hypot(playerPos.x, playerPos.z);
      // 0 inside, ramps to 1 as player moves out past the radius
      const target = THREE.MathUtils.clamp((pr - ARENA_RADIUS) / 20, 0, 1);
      // ease opacity toward target (frame-rate independent)
      const cur = fireflyMat.opacity;
      fireflyMat.opacity = cur + (target * 0.9 - cur) * Math.min(1, dt * 2.5);
      if (fireflyMat.opacity > 0.005) {
        const attr = fireflies.geometry.attributes.position;
        const arr = attr.array;
        for (let i = 0; i < fireflyData.length; i++) {
          const d = fireflyData[i];
          const ph = t * d.speed + d.phase;
          arr[i * 3] = d.ox + Math.sin(ph) * d.amp;
          arr[i * 3 + 1] = d.oy + Math.sin(ph * 1.7 + d.blink) * d.amp * 0.6;
          arr[i * 3 + 2] = d.oz + Math.cos(ph * 0.8) * d.amp;
        }
        attr.needsUpdate = true;
      }
      fireflies.visible = fireflyMat.opacity > 0.005;
    }

    // 3. Bird flocks — lissajous loop, banking into turns, wing-flap via scale.y.
    for (let f = 0; f < flocks.length; f++) {
      const fl = flocks[f];
      const def = fl.def;
      const base = t * def.speed;
      for (let i = 0; i < fl.birds.length; i++) {
        const b = fl.birds[i];
        const u = base + b.phaseOffset;
        // lissajous path
        const x = Math.sin(u * def.ax) * def.a;
        const z = Math.cos(u * def.az) * def.b;
        const y = def.baseY + b.yJitter + Math.sin(u * 2.0) * 4;
        // velocity (derivative) for heading + banking
        const vx = Math.cos(u * def.ax) * def.a * def.ax;
        const vz = -Math.sin(u * def.az) * def.b * def.az;
        const heading = Math.atan2(vx, vz);
        // bank angle proportional to turn rate (use lateral accel proxy)
        const bank = Math.sin(u * def.ax * 1.0) * 0.5;
        // formation lateral offset perpendicular to heading
        const offX = Math.cos(heading) * b.lateral;
        const offZ = -Math.sin(heading) * b.lateral;
        _euler.set(0, heading, bank, 'YXZ');
        _quat.setFromEuler(_euler);
        // wing flap: scale.y oscillation (also a touch of scale.x to sell the V)
        const flap = Math.sin(t * b.flapSpeed + b.flapPhase);
        const sy = def.scale * (0.5 + 0.6 * (flap * 0.5 + 0.5));
        setInstance(fl.inst, i, x + offX, y, z + offZ,
          _quat.x, _quat.y, _quat.z, _quat.w,
          def.scale, sy, def.scale);
      }
      fl.inst.instanceMatrix.needsUpdate = true;
    }

    // 4. Falling leaves — tumble down, sway, respawn at top.
    if (leafInst) {
      for (let i = 0; i < leafData.length; i++) {
        const d = leafData[i];
        d.y -= d.fall * dt;
        d.rx += d.tumble * dt;
        d.rz += d.spin * dt;
        if (d.y < 0.5) {
          d.y = 18 + Math.random() * 6; // respawn at the top of the canopy band
        }
        const swayX = Math.sin(t * d.sway + d.swayPhase) * 0.8;
        const swayZ = Math.cos(t * d.sway * 0.8 + d.swayPhase) * 0.8;
        _v.set(d.x + swayX, d.y, d.z + swayZ);
        _euler.set(d.rx, d.ry, d.rz, 'XYZ');
        _quat.setFromEuler(_euler);
        _scale.set(d.scale, d.scale, d.scale);
        _mat.compose(_v, _quat, _scale);
        leafInst.setMatrixAt(i, _mat);
      }
      leafInst.instanceMatrix.needsUpdate = true;
    }

    // 5. Butterflies — roam low outside arena, two-quad wing flutter.
    if (leftWing && rightWing) {
      for (let i = 0; i < flyData.length; i++) {
        const d = flyData[i];
        const rp = t * d.roamSpeed + d.roamPhase;
        const x = d.cx + Math.sin(rp) * d.roamR;
        const z = d.cz + Math.cos(rp * 0.9) * d.roamR;
        const y = d.baseY + Math.sin(t * d.bobSpeed + d.roamPhase) * d.bobAmp;
        // heading follows roam motion so it points where it flies
        const heading = rp + Math.PI / 2;
        const flap = Math.sin(t * d.flapSpeed + d.flapPhase); // -1..1 wing dihedral

        // body transform (position + heading), wings hinge off it
        _v.set(x, y, z);

        // LEFT wing: rotate up/down about body forward axis (z in local)
        _euler.set(0, heading, 0.2 + flap * 1.0, 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.set(d.scale, d.scale, d.scale);
        _mat.compose(_v, _quat, _scale);
        leftWing.setMatrixAt(i, _mat);

        // RIGHT wing: mirrored (negative x scale + opposite dihedral)
        _euler.set(0, heading, -(0.2 + flap * 1.0), 'YXZ');
        _quat.setFromEuler(_euler);
        _scale.set(-d.scale, d.scale, d.scale);
        _mat.compose(_v, _quat, _scale);
        rightWing.setMatrixAt(i, _mat);
      }
      leftWing.instanceMatrix.needsUpdate = true;
      rightWing.instanceMatrix.needsUpdate = true;
    }

    // 6. Heat shimmer — advance wobble time.
    for (let i = 0; i < shimmerMats.length; i++) {
      shimmerMats[i].uniforms.uTime.value = t + i * 0.37;
    }
  }

  return { update };
}
