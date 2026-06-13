// characters/enemies.js
// ENEMY ROSTER for the Ember Crown Grand Prix.
// Four boss-quality procedural monsters: TERRADON (rock golem), VINEMAUL (grass
// plant beast), AQUARITH (water finned duelist), GALVATALON (electric storm hawk).
// Procedural geometry + <canvas> textures + Web-Audio-free; faces +Z, origin at feet.
// Conforms to the Shared CHARACTER RIG contract. Geometry + stats only — AI in engine.

import * as THREE from 'three';

// ============================================================================
// STATS — exactly 4, exact order/ids/names/values per contract.
// ============================================================================
export const ENEMY_SPECIES = [
  { id: 'golem', name: 'TERRADON', element: 'rock', flying: false, hp: 95, speed: 5.2,
    meleeRange: 3.4, dmgMelee: 13, dmgRanged: 8, projectileColor: 0xcc8844, projectileSpeed: 20 },
  { id: 'plant', name: 'VINEMAUL', element: 'grass', flying: false, hp: 85, speed: 6.0,
    meleeRange: 3.2, dmgMelee: 11, dmgRanged: 9, projectileColor: 0x66dd44, projectileSpeed: 24 },
  { id: 'water', name: 'AQUARITH', element: 'water', flying: false, hp: 80, speed: 6.6,
    meleeRange: 3.0, dmgMelee: 10, dmgRanged: 10, projectileColor: 0x44aaff, projectileSpeed: 28 },
  { id: 'storm', name: 'GALVATALON', element: 'electric', flying: true, hp: 75, speed: 7.5,
    meleeRange: 3.4, dmgMelee: 12, dmgRanged: 11, projectileColor: 0xffee55, projectileSpeed: 32 },
];

// ============================================================================
// Shared helpers — canvas-texture maker, sprite glow, material maker.
// ============================================================================
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h || w;
  return { c, ctx: c.getContext('2d') };
}

// MeshStandardMaterial with hit-flash bookkeeping (HARD RULE).
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.05,
    map: opts.map || null,
    side: opts.side ?? THREE.FrontSide,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap || null,
    envMapIntensity: opts.envMapIntensity ?? 1,
    transparent: opts.transparent || false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flatShading || false,
  });
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  return m;
}

// Soft radial sprite (used for ember / spore / bubble / spark motes).
function makeGlowSprite(inner, mid, edge) {
  const { c, ctx } = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

// mouthGlow factory (small emissive sphere, hidden by default).
function makeMouthGlow(color, intensity) {
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity: intensity ?? 2.5,
    roughness: 0.4, transparent: true, opacity: 0.9,
  });
  mat.userData.baseEmissive = mat.emissive.clone();
  mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat);
  m.visible = false;
  return m;
}

// Eye shine helper (tiny white spec).
function eyeShineMat() {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.18, emissive: new THREE.Color(0x222222),
  });
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  return m;
}

// ----------------------------------------------------------------------------
// Canvas textures (one maker per species canvas body texture).
// ----------------------------------------------------------------------------

// TERRADON — mossy cracked grey stone with dark cracks + green moss in crevices.
function makeStoneTexture() {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = '#6e6b66'; ctx.fillRect(0, 0, 512, 512);
  // mottled granite grain
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 1 + Math.random() * 4;
    const v = Math.random();
    ctx.fillStyle = v > 0.66 ? 'rgba(120,116,110,0.30)'
      : v > 0.33 ? 'rgba(70,67,62,0.30)' : 'rgba(150,146,138,0.22)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // jagged dark cracks
  ctx.strokeStyle = 'rgba(28,24,20,0.85)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + (Math.random() * 6 | 0);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // green moss tufts settling in crevices
  for (let k = 0; k < 380; k++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 2 + Math.random() * 9;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(96,138,52,0.55)');
    g.addColorStop(1, 'rgba(54,86,34,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}

// VINEMAUL — fibrous green-brown bark/fiber strands.
function makeFiberTexture() {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = '#4f6a2e'; ctx.fillRect(0, 0, 512, 512);
  // vertical fibrous strands, green→brown
  for (let i = 0; i < 520; i++) {
    const x = Math.random() * 512;
    const hue = Math.random();
    ctx.strokeStyle = hue > 0.5
      ? `rgba(${90 + Math.random() * 40 | 0},${110 + Math.random() * 50 | 0},40,0.5)`
      : `rgba(${80 + Math.random() * 40 | 0},${64 + Math.random() * 30 | 0},34,0.5)`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    let y = 0, x2 = x;
    ctx.moveTo(x2, y);
    while (y < 512) { y += 16 + Math.random() * 24; x2 += (Math.random() - 0.5) * 12; ctx.lineTo(x2, y); }
    ctx.stroke();
  }
  // knots / bark nodes
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 3 + Math.random() * 7;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(50,38,22,0.7)');
    g.addColorStop(1, 'rgba(50,38,22,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}

// AQUARITH — glossy teal scale sheen with faint scale rows.
function makeScaleTexture() {
  const { c, ctx } = makeCanvas(512);
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#1fae9e'); bg.addColorStop(1, '#0e7d86');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 512);
  // overlapping scale arcs
  const sw = 30, sh = 22;
  for (let ry = 0; ry * sh < 512 + sh; ry++) {
    for (let cx = 0; cx * sw < 512 + sw; cx++) {
      const ox = cx * sw + (ry % 2 ? sw * 0.5 : 0);
      const oy = ry * sh;
      ctx.beginPath();
      ctx.arc(ox, oy, sw * 0.55, Math.PI * 0.15, Math.PI * 0.85);
      ctx.strokeStyle = 'rgba(8,70,76,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy - 2, sw * 0.5, Math.PI * 0.2, Math.PI * 0.8);
      ctx.strokeStyle = 'rgba(180,255,250,0.30)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}

// GALVATALON — charcoal-violet layered feathers, glowing yellow tips.
function makeFeatherTexture() {
  const { c, ctx } = makeCanvas(512);
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#2a2436'); bg.addColorStop(1, '#181522');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 512);
  // overlapping feather scallops in offset rows
  const fw = 46, fh = 34;
  for (let ry = 0; ry * fh < 512 + fh; ry++) {
    for (let cx = 0; cx * fw < 512 + fw; cx++) {
      const ox = cx * fw + (ry % 2 ? fw * 0.5 : 0);
      const oy = ry * fh;
      ctx.beginPath();
      ctx.moveTo(ox - fw * 0.5, oy);
      ctx.quadraticCurveTo(ox, oy + fh * 1.1, ox + fw * 0.5, oy);
      const g = ctx.createLinearGradient(ox, oy, ox, oy + fh);
      g.addColorStop(0, 'rgba(64,52,90,0.55)');
      g.addColorStop(1, 'rgba(20,17,30,0.55)');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(12,10,18,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();
      // glowing tip
      ctx.beginPath();
      ctx.moveTo(ox - 4, oy + fh * 0.9); ctx.lineTo(ox + 4, oy + fh * 0.9);
      ctx.strokeStyle = 'rgba(255,238,90,0.7)'; ctx.lineWidth = 2.2; ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}

// ============================================================================
// 1) TERRADON — hulking boulder golem, magma seams, h~3.0
// ============================================================================
function buildTerradon() {
  const group = new THREE.Group();
  group.name = 'TERRADON';
  const bodyMats = [], arms = [], legs = [];

  const stoneTex = makeStoneTexture();
  const emberTex = makeGlowSprite('rgba(255,240,180,0.95)', 'rgba(255,150,40,0.6)', 'rgba(200,60,0,0)');

  const rockMat = stdMat(0x6e6b66, { roughness: 0.95, metalness: 0.02, map: stoneTex, flatShading: true });
  const rockDarkMat = stdMat(0x4a4742, { roughness: 0.98, metalness: 0.02, flatShading: true });
  const magmaMat = stdMat(0xff7a1e, { roughness: 0.5, emissive: 0xff5500, emissiveIntensity: 2.6 });
  const emberEyeMat = stdMat(0xff8a2a, { roughness: 0.4, emissive: 0xff5a00, emissiveIntensity: 2.8 });
  const mossMat = stdMat(0x5a7a32, { roughness: 1.0 });
  bodyMats.push(rockMat, rockDarkMat, magmaMat, mossMat);

  // irregular stacked rock chunk (low-poly icosahedron, jittered scale).
  function rockChunk(mat, r, detail) {
    const geo = new THREE.IcosahedronGeometry(r, detail ?? 0);
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(0.85 + Math.random() * 0.4, 0.8 + Math.random() * 0.5, 0.85 + Math.random() * 0.4);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.castShadow = true;
    return m;
  }

  // glowing magma seam strip placed in a gap.
  function magmaSeam(x, y, z, len, rot) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.07), magmaMat);
    s.position.set(x, y, z); s.rotation.z = rot || 0;
    return s;
  }

  // ---- TORSO: stacked irregular boulders ----
  const body = new THREE.Group(); group.add(body);
  const coreChunks = [
    [0, 1.55, 0, 0.95], [0.35, 1.95, 0.05, 0.7], [-0.32, 1.9, -0.05, 0.66],
    [0.1, 2.25, 0.1, 0.6], [0, 1.2, 0.18, 0.7],
  ];
  for (const [x, y, z, r] of coreChunks) {
    const ch = rockChunk(rockMat, r, 0);
    ch.position.set(x, y, z); body.add(ch);
  }
  // magma seams glowing in the gaps between chunks
  body.add(magmaSeam(0.18, 1.75, 0.4, 0.5, 0.4));
  body.add(magmaSeam(-0.2, 1.55, 0.42, 0.6, -0.3));
  body.add(magmaSeam(0.0, 2.05, 0.42, 0.4, 0.1));
  body.add(magmaSeam(0.3, 1.35, 0.38, 0.45, 0.6));
  // moss patches on shoulders
  for (const [x, y, z] of [[0.5, 2.2, 0.1], [-0.5, 2.15, 0.05]]) {
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mossMat);
    moss.position.set(x, y, z); moss.scale.set(1.2, 0.5, 1.2); moss.castShadow = true; body.add(moss);
  }
  // magma core glow light buried in chest
  const coreLight = new THREE.PointLight(0xff5a10, 1.4, 4.0, 2.0);
  coreLight.position.set(0, 1.65, 0.3); body.add(coreLight);

  // ---- HEAD: heavy brow boulder, deep ember eyes, jaw = lower slab ----
  const head = new THREE.Group();
  head.position.set(0, 2.7, 0.1); group.add(head);
  const skull = rockChunk(rockMat, 0.5, 0);
  skull.scale.set(1.1, 0.9, 1.0); skull.rotation.set(0, 0, 0); head.add(skull);
  // heavy brow ridge
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.3), rockDarkMat);
  brow.position.set(0, 0.16, 0.34); brow.rotation.x = -0.2; brow.castShadow = true; head.add(brow);
  // deep-set ember eyes
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), emberEyeMat);
    eye.position.set(sx * 0.24, 0.02, 0.36); head.add(eye);
    const el = new THREE.PointLight(0xff5a10, 0.5, 1.4, 2.0);
    el.position.set(sx * 0.24, 0.02, 0.42); head.add(el);
  }

  // JAW = lower rock slab (hinged)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.24, 0.16); head.add(jaw);
  const jawSlab = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.5), rockMat);
  jawSlab.position.set(0, -0.06, 0.16); jawSlab.castShadow = true; jaw.add(jawSlab);
  // glowing mouth interior between slabs
  const mouthInner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), magmaMat);
  mouthInner.position.set(0, 0.04, 0.18); jaw.add(mouthInner);

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.16, 0.4); head.add(mouthAnchor);
  const mouthGlow = makeMouthGlow(0xff6a10, 2.6);
  mouthGlow.position.copy(mouthAnchor.position); head.add(mouthGlow);

  // ---- ARMS: massive boulder fists ----
  function buildArm(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.78, 2.25, 0.0); group.add(pivot);
    const upper = rockChunk(rockMat, 0.34, 0); upper.position.set(0, -0.42, 0); pivot.add(upper);
    const fore = rockChunk(rockMat, 0.32, 0); fore.position.set(0, -0.95, 0.04); pivot.add(fore);
    // massive fist
    const fist = rockChunk(rockMat, 0.46, 0);
    fist.scale.set(1.1, 1.0, 1.0); fist.position.set(0, -1.5, 0.1); pivot.add(fist);
    // knuckle chunks
    for (let i = 0; i < 3; i++) {
      const k = rockChunk(rockDarkMat, 0.14, 0);
      k.position.set((i - 1) * 0.22, -1.78, 0.28); pivot.add(k);
    }
    // magma seam down the forearm
    const seam = magmaSeam(0.0, -1.2, 0.3, 0.5, 0.0); pivot.add(seam);
    arms.push({ pivot });
  }
  buildArm(1); buildArm(-1);

  // ---- LEGS: stumpy rock legs ----
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.4, 1.0, 0.0); group.add(pivot);
    const thigh = rockChunk(rockMat, 0.36, 0); thigh.position.set(0, -0.34, 0); pivot.add(thigh);
    const foot = rockChunk(rockMat, 0.42, 0);
    foot.scale.set(1.1, 0.7, 1.3); foot.position.set(0, -0.82, 0.12); pivot.add(foot);
    legs.push({ pivot });
  }
  buildLeg(1); buildLeg(-1);

  // ---- TAIL: rubble stub ----
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.2, -0.62); group.add(tailGroup);
  const stub = rockChunk(rockMat, 0.3, 0); stub.position.set(0, -0.1, -0.2); tailGroup.add(stub);
  const stub2 = rockChunk(rockDarkMat, 0.18, 0); stub2.position.set(0, -0.2, -0.45); tailGroup.add(stub2);

  // ---- FLAME: drifting ember motes + warm light ----
  const flame = new THREE.Group(); group.add(flame);
  const emberMat = new THREE.SpriteMaterial({
    map: emberTex, color: 0xff8a30, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const embers = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(emberMat.clone());
    const sc = 0.06 + Math.random() * 0.1; s.scale.setScalar(sc);
    s.userData = {
      ox: (Math.random() - 0.5) * 1.0, oy: 1.3 + Math.random() * 1.0, oz: (Math.random() - 0.5) * 0.8,
      phase: Math.random(), speed: 0.3 + Math.random() * 0.4, baseScale: sc,
    };
    flame.add(s); embers.push(s);
  }
  const flameLight = new THREE.PointLight(0xff6a1a, 1.2, 5.0, 2.0);
  flameLight.position.set(0, 1.8, 0.2); flame.add(flameLight);

  group.userData.animateExtra = (t) => {
    for (const s of embers) {
      const u = (s.userData.phase + t * 0.3 * s.userData.speed) % 1;
      s.position.set(
        s.userData.ox + Math.sin(t * 2 + s.userData.phase * 9) * 0.1,
        s.userData.oy + u * 1.4,
        s.userData.oz + Math.cos(t * 1.7 + s.userData.phase * 7) * 0.1,
      );
      s.material.opacity = Math.sin(u * Math.PI) * 0.85;
      s.scale.setScalar(s.userData.baseScale * (1 - u * 0.5));
    }
    coreLight.intensity = 1.2 + Math.sin(t * 3) * 0.3;
    flameLight.intensity = 1.0 + Math.sin(t * 4) * 0.3;
  };

  return finalize(group, {
    name: 'TERRADON', element: 'rock', height: 3.0,
    head, jaw, mouthAnchor, mouthGlow, tailGroup, flame, flameLight,
    wings: [], bodyMats, arms, legs,
  });
}

// ============================================================================
// 2) VINEMAUL — feral thorned plant beast, vine-whip tails, h~2.6
// ============================================================================
function buildVinemaul() {
  const group = new THREE.Group();
  group.name = 'VINEMAUL';
  const bodyMats = [], arms = [], legs = [];

  const fiberTex = makeFiberTexture();
  const sporeTex = makeGlowSprite('rgba(220,255,180,0.95)', 'rgba(120,220,80,0.55)', 'rgba(60,160,30,0)');

  const fiberMat = stdMat(0x4f6a2e, { roughness: 0.9, map: fiberTex });
  const barkMat = stdMat(0x5a4326, { roughness: 0.92 });
  const leafMat = stdMat(0x4f9a36, { roughness: 0.7, side: THREE.DoubleSide });
  const thornMat = stdMat(0xcfc7a0, { roughness: 0.55 });
  const mawMat = stdMat(0x3a1f22, { roughness: 0.8 });
  const eyeMat = stdMat(0xe8d23a, { roughness: 0.4, emissive: 0x9a8a10, emissiveIntensity: 0.8 });
  const vineMat = stdMat(0x3f7a2e, { roughness: 0.8 });
  bodyMats.push(fiberMat, barkMat, leafMat, thornMat, vineMat);

  // ---- TORSO: fibrous hunched body ----
  const body = new THREE.Group(); group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.7, 8, 16), fiberMat);
  torso.position.set(0, 1.5, -0.05); torso.scale.set(1.05, 1.0, 0.95); torso.rotation.x = 0.18;
  torso.castShadow = true; body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), barkMat);
  chest.position.set(0, 1.55, 0.32); chest.scale.set(1.0, 1.1, 0.6); chest.castShadow = true; body.add(chest);

  // thorn spikes along the spine
  for (let i = 0; i < 6; i++) {
    const th = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34 - i * 0.025, 6), thornMat);
    th.position.set(0, 2.1 - i * 0.26, -0.42 + i * 0.02);
    th.rotation.x = -0.5; th.castShadow = true; body.add(th);
  }
  // leaf mane collar (ring of leaves)
  const mane = new THREE.Group(); mane.position.set(0, 2.0, 0.0); body.add(mane);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), leafMat);
    leaf.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.42);
    leaf.rotation.set(Math.PI * 0.5, 0, -a + Math.PI * 0.5);
    leaf.rotation.x = Math.PI * 0.5 + 0.5;
    leaf.castShadow = true; mane.add(leaf);
  }

  // ---- HEAD: huge maw with two thorn-fang rows in the hinged jaw ----
  const head = new THREE.Group();
  head.position.set(0, 2.25, 0.32); group.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 16), fiberMat);
  skull.scale.set(1.0, 0.92, 1.15); skull.castShadow = true; head.add(skull);
  // upper maw (fixed) — wide forward
  const upperMaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), barkMat);
  upperMaw.position.set(0, -0.02, 0.3); upperMaw.scale.set(1.0, 0.7, 1.0); upperMaw.castShadow = true; head.add(upperMaw);
  // upper thorn-fang row (points down)
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), thornMat);
    const a = (i / 6 - 0.5) * 1.5;
    f.position.set(Math.sin(a) * 0.32, -0.16, 0.34 + Math.cos(a) * 0.06);
    f.rotation.x = Math.PI; f.castShadow = true; head.add(f);
  }
  // eyes
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), eyeMat);
    e.position.set(sx * 0.26, 0.2, 0.32); e.scale.set(1, 0.8, 0.8); head.add(e);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeShineMat());
    sh.position.set(sx * 0.26 + 0.03, 0.23, 0.4); head.add(sh);
  }

  // JAW (hinged) with lower thorn-fang row + dark maw interior
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.12); head.add(jaw);
  const lowerMaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), barkMat);
  lowerMaw.position.set(0, -0.04, 0.22); lowerMaw.scale.set(0.95, 0.7, 0.95); lowerMaw.castShadow = true; jaw.add(lowerMaw);
  const mawInner = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mawMat);
  mawInner.position.set(0, 0.0, 0.2); mawInner.scale.set(0.9, 0.5, 0.8); jaw.add(mawInner);
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), thornMat);
    const a = (i / 6 - 0.5) * 1.5;
    f.position.set(Math.sin(a) * 0.3, 0.06, 0.3 + Math.cos(a) * 0.06);
    f.castShadow = true; jaw.add(f);
  }

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.05, 0.5); head.add(mouthAnchor);
  const mouthGlow = makeMouthGlow(0x88ff44, 2.4);
  mouthGlow.position.copy(mouthAnchor.position); head.add(mouthGlow);

  // ---- ARMS: clawed forelimbs ----
  function buildArm(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.66, 1.78, 0.1); group.add(pivot);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 6, 10), fiberMat);
    upper.position.set(0, -0.3, 0); pivot.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 6, 10), barkMat);
    fore.position.set(0, -0.7, 0.06); fore.rotation.x = 0.2; pivot.add(fore);
    // clawed hand
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), thornMat);
      const a = (i - 1) * 0.34;
      claw.position.set(Math.sin(a) * 0.14, -0.98, 0.18); claw.rotation.x = Math.PI * 0.6; claw.castShadow = true; pivot.add(claw);
    }
    arms.push({ pivot });
  }
  buildArm(1); buildArm(-1);

  // ---- LEGS: strong haunches ----
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.36, 1.0, -0.05); group.add(pivot);
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), fiberMat);
    haunch.position.set(0, -0.2, 0); haunch.scale.set(1.0, 1.1, 1.1); pivot.add(haunch);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 6, 10), barkMat);
    shin.position.set(0, -0.62, 0.08); shin.rotation.x = 0.2; pivot.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), barkMat);
    foot.position.set(0, -0.92, 0.2); foot.scale.set(1.0, 0.5, 1.4); pivot.add(foot);
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), thornMat);
      claw.position.set((i - 1) * 0.13, -0.94, 0.36); claw.rotation.x = Math.PI * 0.5; pivot.add(claw);
    }
    legs.push({ pivot });
  }
  buildLeg(1); buildLeg(-1);

  // ---- TAIL: 3 writhing vine whips (capsule chains) ----
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.35, -0.55); group.add(tailGroup);
  const vines = [];
  for (let v = 0; v < 3; v++) {
    const vine = new THREE.Group();
    vine.position.set((v - 1) * 0.18, 0, -0.1); tailGroup.add(vine);
    const segs = [];
    let parent = vine;
    for (let s = 0; s < 5; s++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0, -0.32);
      const r = 0.1 - s * 0.013;
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.26, 5, 8), vineMat);
      m.rotation.x = Math.PI * 0.5; m.position.z = -0.13; m.castShadow = true;
      seg.add(m);
      // small thorn on each segment
      const th = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), thornMat);
      th.position.set(0, r + 0.02, -0.13); th.rotation.x = -0.5; seg.add(th);
      parent.add(seg); segs.push(seg); parent = seg;
    }
    vines.push({ segs, phase: v * 1.1 });
  }

  // ---- FLAME: spore motes + green light ----
  const flame = new THREE.Group(); group.add(flame);
  const sporeMat = new THREE.SpriteMaterial({
    map: sporeTex, color: 0x9aff5a, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const spores = [];
  for (let i = 0; i < 20; i++) {
    const s = new THREE.Sprite(sporeMat.clone());
    const sc = 0.05 + Math.random() * 0.08; s.scale.setScalar(sc);
    s.userData = {
      ox: (Math.random() - 0.5) * 1.2, oy: 1.4 + Math.random() * 1.1, oz: (Math.random() - 0.5) * 0.9,
      phase: Math.random(), speed: 0.2 + Math.random() * 0.4, baseScale: sc,
    };
    flame.add(s); spores.push(s);
  }
  const flameLight = new THREE.PointLight(0x66dd44, 0.9, 4.5, 2.0);
  flameLight.position.set(0, 1.8, 0.2); flame.add(flameLight);

  group.userData.animateExtra = (t) => {
    // vine whips coil & lash
    for (const vn of vines) {
      vn.segs.forEach((seg, i) => {
        const k = (i + 1) * 0.6;
        seg.rotation.y = Math.sin(t * 2.2 + vn.phase + i * 0.7) * 0.45;
        seg.rotation.x = Math.sin(t * 2.6 + vn.phase + i * 0.9) * 0.3 + 0.1 * k * 0.0;
      });
    }
    for (const s of spores) {
      const u = (s.userData.phase + t * 0.25 * s.userData.speed) % 1;
      s.position.set(
        s.userData.ox + Math.sin(t * 1.5 + s.userData.phase * 8) * 0.12,
        s.userData.oy + u * 1.2,
        s.userData.oz + Math.cos(t * 1.3 + s.userData.phase * 6) * 0.12,
      );
      s.material.opacity = Math.sin(u * Math.PI) * 0.7;
    }
    flameLight.intensity = 0.8 + Math.sin(t * 3.5) * 0.2;
  };

  return finalize(group, {
    name: 'VINEMAUL', element: 'grass', height: 2.6,
    head, jaw, mouthAnchor, mouthGlow, tailGroup, flame, flameLight,
    wings: [], bodyMats, arms, legs,
  });
}

// ============================================================================
// 3) AQUARITH — sleek finned aquatic duelist, glossy teal, h~2.4
// ============================================================================
function buildAquarith() {
  const group = new THREE.Group();
  group.name = 'AQUARITH';
  const bodyMats = [], arms = [], legs = [];

  const scaleTex = makeScaleTexture();
  const dropTex = makeGlowSprite('rgba(220,250,255,0.95)', 'rgba(90,190,255,0.55)', 'rgba(40,140,255,0)');

  // glossy teal: high envMapIntensity, low roughness
  const bodyMat = stdMat(0x18b6ae, { roughness: 0.22, metalness: 0.1, map: scaleTex, envMapIntensity: 1.6 });
  const bellyMat = stdMat(0xaef0ec, { roughness: 0.3, envMapIntensity: 1.4 });
  const finMat = stdMat(0x2fd6e0, { roughness: 0.25, envMapIntensity: 1.6, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
  const crestMat = stdMat(0x1290b0, { roughness: 0.3, envMapIntensity: 1.5 });
  const teethMat = stdMat(0xf4ffff, { roughness: 0.3 });
  const eyeMat = stdMat(0x10303a, { roughness: 0.12, metalness: 0.2, envMapIntensity: 1.8 });
  const mawMat = stdMat(0x14323a, { roughness: 0.6 });
  bodyMats.push(bodyMat, bellyMat, finMat, crestMat);

  // ---- TORSO: sleek streamlined ----
  const body = new THREE.Group(); group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.8, 10, 18), bodyMat);
  torso.position.set(0, 1.35, 0); torso.scale.set(1.0, 1.0, 0.85); torso.castShadow = true; body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), bellyMat);
  belly.position.set(0, 1.25, 0.28); belly.scale.set(0.9, 1.3, 0.5); belly.castShadow = true; body.add(belly);

  // dorsal sail fin (membrane, DoubleSide) — a tall translucent blade along the back
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0, 0);
  dorsalShape.lineTo(-0.5, 0.7);
  dorsalShape.lineTo(-0.15, 0.95);
  dorsalShape.lineTo(0.2, 0.55);
  dorsalShape.lineTo(0.45, 0.0);
  dorsalShape.closePath();
  const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(dorsalShape), finMat);
  dorsal.position.set(0, 1.55, -0.36); dorsal.rotation.y = Math.PI * 0.5; dorsal.castShadow = true; body.add(dorsal);
  // fin spines
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), crestMat);
    sp.position.set(0, 1.7 + i * 0.04, -0.36 - i * 0.16); sp.rotation.x = 0.2; body.add(sp);
  }

  // ---- HEAD: crested, jaw + needle teeth, big reflective eyes ----
  const head = new THREE.Group();
  head.position.set(0, 2.05, 0.08); group.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 16), bodyMat);
  skull.scale.set(1.0, 0.95, 1.2); skull.castShadow = true; head.add(skull);
  // upper snout
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), bodyMat);
  snout.position.set(0, -0.04, 0.28); snout.scale.set(0.9, 0.6, 1.0); snout.castShadow = true; head.add(snout);
  // upper needle teeth
  for (let i = 0; i < 6; i++) {
    const tt = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), teethMat);
    const a = (i / 5 - 0.5) * 1.1;
    tt.position.set(Math.sin(a) * 0.2, -0.12, 0.32); tt.rotation.x = Math.PI; head.add(tt);
  }
  // head crest fins (swept-back blades)
  for (const sx of [-1, 1]) {
    const cr = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 4), crestMat);
    cr.position.set(sx * 0.18, 0.28, -0.18); cr.rotation.set(-0.7, 0, sx * 0.4); cr.scale.set(0.4, 1, 1); cr.castShadow = true; head.add(cr);
  }
  const topCrest = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 4), crestMat);
  topCrest.position.set(0, 0.34, -0.1); topCrest.rotation.set(-0.5, 0, 0); topCrest.scale.set(0.35, 1, 1); topCrest.castShadow = true; head.add(topCrest);
  // big reflective eyes
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), eyeMat);
    e.position.set(sx * 0.24, 0.06, 0.22); head.add(e);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeShineMat());
    sh.position.set(sx * 0.24 + 0.04, 0.11, 0.32); head.add(sh);
  }

  // JAW (hinged) + needle teeth + dark maw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.08); head.add(jaw);
  const lowerJaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), bodyMat);
  lowerJaw.position.set(0, -0.02, 0.24); lowerJaw.scale.set(0.85, 0.6, 1.0); lowerJaw.castShadow = true; jaw.add(lowerJaw);
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mawMat);
  maw.position.set(0, 0.02, 0.18); maw.scale.set(0.9, 0.4, 0.8); jaw.add(maw);
  for (let i = 0; i < 6; i++) {
    const tt = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), teethMat);
    const a = (i / 5 - 0.5) * 1.1;
    tt.position.set(Math.sin(a) * 0.18, 0.06, 0.28); jaw.add(tt);
  }

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.06, 0.42); head.add(mouthAnchor);
  const mouthGlow = makeMouthGlow(0x55c8ff, 2.4);
  mouthGlow.position.copy(mouthAnchor.position); head.add(mouthGlow);

  // ---- ARMS: forearm fin blades ----
  function buildArm(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.52, 1.6, 0.04); group.add(pivot);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 6, 10), bodyMat);
    upper.position.set(0, -0.28, 0); pivot.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 6, 10), bodyMat);
    fore.position.set(0, -0.62, 0.04); pivot.add(fore);
    // fin blade along the forearm
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0); bladeShape.lineTo(0.0, -0.55); bladeShape.lineTo(0.32, -0.4); bladeShape.lineTo(0.18, 0.05); bladeShape.closePath();
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(bladeShape), finMat);
    blade.position.set(sign * 0.12, -0.62, 0); blade.rotation.y = sign * 0.3; blade.castShadow = true; pivot.add(blade);
    arms.push({ pivot });
  }
  buildArm(1); buildArm(-1);

  // ---- LEGS: webbed leg fins ----
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.3, 0.95, 0.0); group.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 10), bodyMat);
    thigh.position.set(0, -0.26, 0); pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 6, 10), bodyMat);
    shin.position.set(0, -0.6, 0.04); pivot.add(shin);
    // webbed foot fin (fan)
    const webShape = new THREE.Shape();
    webShape.moveTo(0, 0); webShape.lineTo(-0.22, -0.3); webShape.lineTo(0, -0.4); webShape.lineTo(0.22, -0.3); webShape.closePath();
    const web = new THREE.Mesh(new THREE.ShapeGeometry(webShape), finMat);
    web.position.set(0, -0.82, 0.18); web.rotation.x = -Math.PI * 0.5; web.castShadow = true; pivot.add(web);
    legs.push({ pivot });
  }
  buildLeg(1); buildLeg(-1);

  // ---- TAIL: broad flat tail fin (slow sweep via animateExtra) ----
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.25, -0.5); group.add(tailGroup);
  const tailStem = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 6, 10), bodyMat);
  tailStem.position.set(0, -0.1, -0.25); tailStem.rotation.x = Math.PI * 0.55; tailStem.castShadow = true; tailGroup.add(tailStem);
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, 0);
  flukeShape.lineTo(-0.5, -0.35); flukeShape.lineTo(-0.2, -0.5);
  flukeShape.lineTo(0, -0.3);
  flukeShape.lineTo(0.2, -0.5); flukeShape.lineTo(0.5, -0.35); flukeShape.closePath();
  const fluke = new THREE.Mesh(new THREE.ShapeGeometry(flukeShape), finMat);
  fluke.position.set(0, -0.3, -0.5); fluke.rotation.x = -0.4; fluke.castShadow = true; tailGroup.add(fluke);

  // ---- FLAME: water-drip / bubble particles + blue light ----
  const flame = new THREE.Group(); group.add(flame);
  const dropMat = new THREE.SpriteMaterial({
    map: dropTex, color: 0x66c8ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const drops = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(dropMat.clone());
    const sc = 0.04 + Math.random() * 0.07; s.scale.setScalar(sc);
    s.userData = {
      ox: (Math.random() - 0.5) * 0.9, oy: 1.2 + Math.random() * 1.0, oz: (Math.random() - 0.5) * 0.7,
      phase: Math.random(), speed: 0.3 + Math.random() * 0.5, baseScale: sc, dir: Math.random() > 0.5 ? 1 : -1,
    };
    flame.add(s); drops.push(s);
  }
  const flameLight = new THREE.PointLight(0x44aaff, 0.9, 4.0, 2.0);
  flameLight.position.set(0, 1.5, 0.2); flame.add(flameLight);

  group.userData.animateExtra = (t) => {
    // broad tail fin slow sweep
    tailGroup.rotation.y = Math.sin(t * 1.1) * 0.35;
    fluke.rotation.z = Math.sin(t * 1.1 + 0.4) * 0.2;
    for (const s of drops) {
      // bubbles rise, drips fall — gentle vertical drift
      const u = (s.userData.phase + t * 0.35 * s.userData.speed) % 1;
      s.position.set(
        s.userData.ox + Math.sin(t * 2 + s.userData.phase * 7) * 0.08,
        s.userData.oy + s.userData.dir * u * 0.9,
        s.userData.oz + Math.cos(t * 1.8 + s.userData.phase * 5) * 0.08,
      );
      s.material.opacity = Math.sin(u * Math.PI) * 0.7;
    }
    flameLight.intensity = 0.8 + Math.sin(t * 4) * 0.25;
  };

  return finalize(group, {
    name: 'AQUARITH', element: 'water', height: 2.4,
    head, jaw, mouthAnchor, mouthGlow, tailGroup, flame, flameLight,
    wings: [], bodyMats, arms, legs,
  });
}

// ============================================================================
// 4) GALVATALON — regal storm hawk, FLYING, body h~2.4, wingspan ~6
// ============================================================================
function buildGalvatalon() {
  const group = new THREE.Group();
  group.name = 'GALVATALON';
  const bodyMats = [], arms = [], legs = [], wings = [];

  const featherTex = makeFeatherTexture();
  const sparkTex = makeGlowSprite('rgba(255,255,210,0.98)', 'rgba(255,238,90,0.6)', 'rgba(255,180,20,0)');

  const featherMat = stdMat(0x2a2436, { roughness: 0.7, map: featherTex });
  const featherDarkMat = stdMat(0x181522, { roughness: 0.75 });
  const goldMat = stdMat(0xe6b22e, { roughness: 0.35, metalness: 0.6, envMapIntensity: 1.3 });
  const beakMat = stdMat(0xf0c84a, { roughness: 0.3, metalness: 0.5, envMapIntensity: 1.3 });
  const tipMat = stdMat(0xffee55, { roughness: 0.5, emissive: 0xffd722, emissiveIntensity: 1.8 });
  const eyeMat = stdMat(0xffcc22, { roughness: 0.3, emissive: 0xaa7700, emissiveIntensity: 0.9 });
  const mawMat = stdMat(0x2a1a1a, { roughness: 0.7 });
  bodyMats.push(featherMat, featherDarkMat, goldMat, beakMat, tipMat);

  // ---- BODY: layered-feather torso ----
  const body = new THREE.Group(); group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 10, 16), featherMat);
  torso.position.set(0, 1.55, 0); torso.rotation.x = 0.25; torso.scale.set(1.0, 1.0, 0.9); torso.castShadow = true; body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), featherMat);
  chest.position.set(0, 1.7, 0.22); chest.scale.set(1.0, 1.05, 0.7); chest.castShadow = true; body.add(chest);
  // layered chest feather scallops
  for (let i = 0; i < 4; i++) {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.3 - i * 0.03, 12, 8, 0, Math.PI, 0, Math.PI * 0.5), featherDarkMat);
    sc.position.set(0, 1.55 - i * 0.18, 0.3 - i * 0.02); sc.rotation.x = Math.PI * 0.5; sc.scale.set(1, 0.5, 0.6); body.add(sc);
  }

  // ---- HEAD: golden crowned crest, hooked beak, fierce ringed eyes ----
  const head = new THREE.Group();
  head.position.set(0, 2.15, 0.12); group.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 16), featherMat);
  skull.scale.set(1.0, 1.0, 1.05); skull.castShadow = true; head.add(skull);
  // golden crowned crest (swept feather blades)
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.2;
    const cr = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 - Math.abs(a) * 0.18, 4), goldMat);
    cr.position.set(Math.sin(a) * 0.16, 0.28, -0.12 - Math.cos(a) * 0.05);
    cr.rotation.set(-0.8, 0, Math.sin(a) * 0.5); cr.scale.set(0.5, 1, 1); cr.castShadow = true; head.add(cr);
  }
  // hooked golden upper beak (fixed to head)
  const upperBeak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), beakMat);
  upperBeak.position.set(0, -0.02, 0.34); upperBeak.rotation.x = Math.PI * 0.5; upperBeak.scale.set(1, 1, 0.8); upperBeak.castShadow = true; head.add(upperBeak);
  // hook tip curving down
  const hook = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), beakMat);
  hook.position.set(0, -0.1, 0.52); hook.rotation.x = Math.PI * 0.85; hook.castShadow = true; head.add(hook);
  // fierce ringed eyes
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 14), goldMat);
    ring.position.set(sx * 0.22, 0.08, 0.2); ring.rotation.y = sx * 0.3; head.add(ring);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), eyeMat);
    e.position.set(sx * 0.22, 0.08, 0.22); head.add(e);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeShineMat());
    sh.position.set(sx * 0.22 + 0.03, 0.11, 0.3); head.add(sh);
  }

  // JAW = lower beak (hinged)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.18); head.add(jaw);
  const lowerBeak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), beakMat);
  lowerBeak.position.set(0, -0.04, 0.18); lowerBeak.rotation.x = Math.PI * 0.5; lowerBeak.scale.set(1, 0.7, 0.8); lowerBeak.castShadow = true; jaw.add(lowerBeak);
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mawMat);
  maw.position.set(0, 0.0, 0.12); maw.scale.set(1, 0.5, 1); jaw.add(maw);

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.04, 0.56); head.add(mouthAnchor);
  const mouthGlow = makeMouthGlow(0xffee55, 2.5);
  mouthGlow.position.copy(mouthAnchor.position); head.add(mouthGlow);

  // ---- WINGS: large articulated, flap at shoulders. wings:[{group,sign}] ----
  const wingFlap = []; // store feather refs for ruffle in animateExtra
  function buildWing(sign) {
    const wingGroup = new THREE.Group();
    // pivot at the shoulder
    wingGroup.position.set(sign * 0.4, 1.85, 0.0);
    group.add(wingGroup);

    // upper arm bone
    const arm0 = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.7, 6, 8), featherDarkMat);
    arm0.position.set(sign * 0.45, 0, 0); arm0.rotation.z = sign * Math.PI * 0.5; arm0.castShadow = true; wingGroup.add(arm0);
    // forearm bone (angled back)
    const arm1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.7, 6, 8), featherDarkMat);
    arm1.position.set(sign * 0.95, 0, -0.2); arm1.rotation.z = sign * Math.PI * 0.5; arm1.rotation.y = sign * 0.4; arm1.castShadow = true; wingGroup.add(arm1);

    // layered primary-feather planes fanning along the wing
    const tips = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const fShape = new THREE.Shape();
      const len = 0.9 + f * 0.6;
      fShape.moveTo(0, 0);
      fShape.lineTo(0.12, -len * 0.5);
      fShape.lineTo(0.0, -len);
      fShape.lineTo(-0.08, -len * 0.5);
      fShape.closePath();
      const fmat = (i === N - 1 || i === 0) ? featherDarkMat : featherMat;
      const feather = new THREE.Mesh(new THREE.ShapeGeometry(fShape), fmat);
      feather.position.set(sign * (0.5 + f * 1.0), 0.0, -0.1 - f * 0.35);
      feather.rotation.set(Math.PI * 0.5, 0, sign * (0.4 + f * 0.7));
      feather.castShadow = true;
      wingGroup.add(feather);
      // glowing crackling tip
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), tipMat);
      tip.position.set(sign * (0.5 + f * 1.0), 0.0, -0.1 - f * 0.35 - len);
      tip.rotation.x = -Math.PI * 0.5; wingGroup.add(tip);
      tips.push(feather);
    }
    // covert feathers near shoulder
    const covert = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI, 0, Math.PI), featherMat);
    covert.position.set(sign * 0.35, 0.05, -0.05); covert.scale.set(1, 0.5, 1); covert.castShadow = true; wingGroup.add(covert);

    wings.push({ group: wingGroup, sign });
    wingFlap.push({ tips, sign });
  }
  buildWing(1); buildWing(-1);

  // ---- ARMS: small grasping claws (near the chest) ----
  function buildArm(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.34, 1.5, 0.18); group.add(pivot);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 6, 8), featherDarkMat);
    limb.position.set(0, -0.18, 0.02); pivot.add(limb);
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), goldMat);
      claw.position.set((i - 1) * 0.06, -0.36, 0.08); claw.rotation.x = Math.PI * 0.6; claw.castShadow = true; pivot.add(claw);
    }
    arms.push({ pivot });
  }
  buildArm(1); buildArm(-1);

  // ---- LEGS: talon legs ----
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.26, 1.05, 0.0); group.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 6, 10), featherMat);
    thigh.position.set(0, -0.26, 0); pivot.add(thigh);
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8), goldMat);
    shank.position.set(0, -0.6, 0.04); shank.castShadow = true; pivot.add(shank);
    // talon foot — grasping claws
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), goldMat);
    foot.position.set(0, -0.82, 0.08); pivot.add(foot);
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.5;
      const back = i === 3;
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), goldMat);
      talon.position.set(Math.sin(a) * 0.1, -0.9, back ? -0.1 : 0.18);
      talon.rotation.x = back ? -Math.PI * 0.6 : Math.PI * 0.65; talon.castShadow = true; pivot.add(talon);
    }
    legs.push({ pivot });
  }
  buildLeg(1); buildLeg(-1);

  // ---- TAIL: long fan tail ----
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.4, -0.45); group.add(tailGroup);
  const tailFeathers = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.0;
    const fShape = new THREE.Shape();
    fShape.moveTo(0, 0); fShape.lineTo(0.08, -1.0); fShape.lineTo(0, -1.15); fShape.lineTo(-0.08, -1.0); fShape.closePath();
    const f = new THREE.Mesh(new THREE.ShapeGeometry(fShape), i % 2 ? featherMat : featherDarkMat);
    f.position.set(Math.sin(a) * 0.12, 0, -0.1); f.rotation.set(Math.PI * 0.5 + 0.5, 0, a);
    f.castShadow = true; tailGroup.add(f);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), tipMat);
    tip.position.set(Math.sin(a) * 0.12, -1.15 * Math.cos(0.5), -0.1 - 1.15 * Math.sin(0.5)); tailGroup.add(tip);
    tailFeathers.push(f);
  }

  // ---- FLAME: spark arcs around wings + electric light ----
  const flame = new THREE.Group(); group.add(flame);
  const sparkMat = new THREE.SpriteMaterial({
    map: sparkTex, color: 0xffee66, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(sparkMat.clone());
    const sc = 0.05 + Math.random() * 0.08; s.scale.setScalar(sc);
    s.userData = {
      side: Math.random() > 0.5 ? 1 : -1, phase: Math.random(),
      r: 0.8 + Math.random() * 1.4, y: 1.6 + (Math.random() - 0.5) * 0.7, baseScale: sc,
      speed: 0.6 + Math.random() * 0.8,
    };
    flame.add(s); sparks.push(s);
  }
  const flameLight = new THREE.PointLight(0xffee55, 1.1, 5.5, 2.0);
  flameLight.position.set(0, 1.8, 0.0); flame.add(flameLight);

  group.userData.animateExtra = (t, dt, state) => {
    // crest / feather ruffle + tail fan sway
    for (const wf of wingFlap) {
      wf.tips.forEach((f, i) => {
        f.rotation.z = wf.sign * (0.4 + (i / wf.tips.length) * 0.7) + Math.sin(t * 6 + i) * 0.05;
      });
    }
    tailFeathers.forEach((f, i) => {
      f.rotation.x = Math.PI * 0.5 + 0.5 + Math.sin(t * 2 + i * 0.5) * 0.04;
    });
    // spark arcs jitter around the wings
    for (const s of sparks) {
      const u = (s.userData.phase + t * 0.5 * s.userData.speed) % 1;
      const ang = u * Math.PI * 2 + s.userData.phase * 6;
      s.position.set(
        s.userData.side * (s.userData.r * (0.5 + 0.5 * Math.abs(Math.sin(ang)))),
        s.userData.y + Math.sin(ang * 2) * 0.4,
        Math.cos(ang) * 0.5 + (Math.random() - 0.5) * 0.1,
      );
      s.material.opacity = (0.4 + Math.random() * 0.6) * Math.sin(u * Math.PI);
    }
    flameLight.intensity = 1.0 + Math.random() * 0.6;
  };

  return finalize(group, {
    name: 'GALVATALON', element: 'electric', height: 2.4, baseY: 2.6,
    head, jaw, mouthAnchor, mouthGlow, tailGroup, flame, flameLight,
    wings, bodyMats, arms, legs,
  });
}

// ============================================================================
// finalize — apply shadows + rig userData (keeps factories DRY).
// ============================================================================
function finalize(group, rig) {
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.userData = Object.assign(group.userData || {}, {
    name: rig.name,
    element: rig.element,
    height: rig.height,
    baseY: rig.baseY ?? 0,
    head: rig.head,
    jaw: rig.jaw,
    mouthAnchor: rig.mouthAnchor,
    mouthGlow: rig.mouthGlow,
    tailGroup: rig.tailGroup,
    flame: rig.flame,
    flameLight: rig.flameLight,
    wings: rig.wings,
    bodyMats: rig.bodyMats,
    arms: rig.arms,
    legs: rig.legs,
  });
  return group;
}

// ============================================================================
// createEnemy — factory by speciesId; attaches userData.species.
// ============================================================================
const BUILDERS = {
  golem: buildTerradon,
  plant: buildVinemaul,
  water: buildAquarith,
  storm: buildGalvatalon,
};

export function createEnemy(speciesId) {
  const builder = BUILDERS[speciesId];
  if (!builder) throw new Error('createEnemy: unknown speciesId "' + speciesId + '"');
  const group = builder();
  const species = ENEMY_SPECIES.find((s) => s.id === speciesId);
  group.userData.species = species;
  return group;
}
