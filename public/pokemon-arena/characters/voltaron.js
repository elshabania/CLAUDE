// characters/voltaron.js
// VOLTARON — ORIGINAL electric storm-panther. Sleek low-slung feline biped in glossy
// black with yellow lightning chevrons, angular wedge head + hinged jaw, glowing cyan
// eyes, a 3-blade lightning crest, copper-gold charged shoulder coils, digitigrade legs
// with blade claws, a long whip tail tipped with a charged prong fork, and a crackling
// spark aura (`flame`) of jittering bolt segments rebuilt every ~80ms via animateExtra.
// Procedural geometry + canvas textures only. Faces +Z, origin at feet.
// Conforms to the Shared CHARACTER RIG contract.

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Palette
// ----------------------------------------------------------------------------
const COL = {
  black:      0x141418, // glossy panther base
  blackDark:  0x0a0a0d,
  blackEdge:  0x26262e,
  bolt:       0xffe24a, // lightning yellow
  boltHot:    0xfff7c0,
  copper:     0xc6803a, // shoulder coil copper-gold
  copperDark: 0x7a4a1e,
  copperHot:  0xffb347,
  cyan:       0x35f0ff, // glowing eyes
  cyanHot:    0xd8ffff,
  steel:      0x9aa6b2,
  steelDark:  0x4a525c,
  claw:       0xe8ecf2,
  mouth:      0x180c04,
};

// ----------------------------------------------------------------------------
// Canvas texture helpers
// ----------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h || w;
  return { c, ctx: c.getContext('2d') };
}

// Glossy black hide: deep black base, sharp jagged yellow bolt stripes raking
// diagonally, faint hex-circuit glow lines.
function makeHideTexture() {
  const { c, ctx } = makeCanvas(512);
  // deep black base with a subtle vertical sheen
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#1b1b22');
  bg.addColorStop(0.5, '#101014');
  bg.addColorStop(1, '#070709');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  // faint hex-circuit glow lines (very low alpha cyan/yellow tech tracery)
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const len = 18 + Math.random() * 60;
    const horiz = Math.random() > 0.5;
    ctx.strokeStyle = Math.random() > 0.5
      ? 'rgba(53,240,255,0.10)' : 'rgba(255,226,74,0.08)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    // an L-shaped circuit trace with a node dot
    if (horiz) { ctx.lineTo(x + len, y); ctx.lineTo(x + len, y + len * 0.5); }
    else { ctx.lineTo(x, y + len); ctx.lineTo(x + len * 0.5, y + len); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(53,240,255,0.12)';
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
  }

  // sparse hex outlines for a circuit-plate feel
  ctx.strokeStyle = 'rgba(80,84,96,0.20)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 28; i++) {
    const cx = Math.random() * 512, cy = Math.random() * 512, r = 8 + Math.random() * 14;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 6;
      const vx = cx + Math.cos(a) * r, vy = cy + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath(); ctx.stroke();
  }

  // sharp jagged yellow bolt stripes raking diagonally across the hide
  function boltStripe(x0, y0, x1, y1, width, glow) {
    // build a jagged polyline between the two points
    const steps = 7;
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const jx = (Math.random() - 0.5) * 46;
      const jy = (Math.random() - 0.5) * 22;
      pts.push([x0 + (x1 - x0) * u + jx, y0 + (y1 - y0) * u + jy]);
    }
    // glow underlay
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (glow) {
      ctx.strokeStyle = 'rgba(255,226,74,0.28)';
      ctx.lineWidth = width + 10;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
      ctx.stroke();
    }
    // bright core
    ctx.strokeStyle = '#ffe24a';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
    ctx.stroke();
    // hot white inner filament
    ctx.strokeStyle = 'rgba(255,247,192,0.9)';
    ctx.lineWidth = Math.max(1.5, width * 0.4);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
    ctx.stroke();
  }
  // several diagonal raking bolts (top-left to bottom-right)
  for (let i = 0; i < 5; i++) {
    const off = i * 110 - 120;
    boltStripe(off, -40, off + 300, 560, 7 + Math.random() * 4, true);
  }
  // a couple of counter-diagonal accent chevrons
  for (let i = 0; i < 3; i++) {
    const off = i * 170 + 60;
    boltStripe(off + 260, -40, off - 40, 560, 4 + Math.random() * 3, false);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Copper coil ribbing texture (for the shoulder torus-stack cylinders).
function makeCoilTexture() {
  const { c, ctx } = makeCanvas(128, 256);
  ctx.fillStyle = '#7a4a1e';
  ctx.fillRect(0, 0, 128, 256);
  // ribbed horizontal bands
  for (let y = 0; y < 256; y += 12) {
    const g = ctx.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, '#3a230e');
    g.addColorStop(0.5, '#d68a44');
    g.addColorStop(1, '#3a230e');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 128, 9);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ----------------------------------------------------------------------------
// Material helper
// ----------------------------------------------------------------------------
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.05,
    map: opts.map || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    envMapIntensity: opts.envMapIntensity ?? 1,
    transparent: opts.transparent || false,
    opacity: opts.opacity ?? 1,
  });
  // hit-flash bookkeeping (HARD RULE)
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  return m;
}

// Flat extruded zigzag lightning-bolt blade (used for the skull crest).
function makeBoltBladeGeo(scale) {
  const s = scale;
  const shape = new THREE.Shape();
  // a stylised lightning bolt silhouette
  shape.moveTo(0.00 * s, 0.00 * s);
  shape.lineTo(0.30 * s, 0.18 * s);
  shape.lineTo(0.16 * s, 0.22 * s);
  shape.lineTo(0.48 * s, 0.42 * s);
  shape.lineTo(0.30 * s, 0.46 * s);
  shape.lineTo(0.62 * s, 0.74 * s);
  shape.lineTo(0.34 * s, 0.62 * s);
  shape.lineTo(0.40 * s, 0.50 * s);
  shape.lineTo(0.12 * s, 0.34 * s);
  shape.lineTo(0.22 * s, 0.28 * s);
  shape.lineTo(-0.04 * s, 0.06 * s);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05 * s, bevelEnabled: true, bevelThickness: 0.015 * s,
    bevelSize: 0.012 * s, bevelSegments: 1, steps: 1,
  });
  geo.center();
  return geo;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
export function createVoltaron() {
  const group = new THREE.Group();
  group.name = 'VOLTARON';

  const bodyMats = [];
  const arms = [];
  const legs = [];

  const hideTex = makeHideTexture();
  const coilTex = makeCoilTexture();

  // shared materials
  const hideMat     = stdMat(COL.black, { roughness: 0.32, metalness: 0.35, map: hideTex, envMapIntensity: 1.3 });
  const blackMat    = stdMat(COL.blackDark, { roughness: 0.4, metalness: 0.3 });
  const edgeMat     = stdMat(COL.blackEdge, { roughness: 0.45, metalness: 0.3 });
  const boltMat     = stdMat(COL.bolt, { roughness: 0.3, metalness: 0.2, emissive: COL.bolt, emissiveIntensity: 1.8 });
  const boltHotMat  = stdMat(COL.boltHot, { roughness: 0.3, emissive: COL.boltHot, emissiveIntensity: 2.4 });
  const copperMat   = stdMat(COL.copper, { roughness: 0.35, metalness: 0.85, map: coilTex, envMapIntensity: 1.4 });
  const copperDarkMat = stdMat(COL.copperDark, { roughness: 0.45, metalness: 0.8 });
  const coilCoreMat = stdMat(COL.copperHot, { roughness: 0.3, emissive: COL.bolt, emissiveIntensity: 2.6 });
  const clawMat     = stdMat(COL.claw, { roughness: 0.3, metalness: 0.4 });
  const steelMat    = stdMat(COL.steel, { roughness: 0.35, metalness: 0.85, envMapIntensity: 1.3 });
  const mouthMat    = stdMat(COL.mouth, { roughness: 0.8 });

  bodyMats.push(hideMat, blackMat, edgeMat, boltMat, boltHotMat,
                copperMat, copperDarkMat, coilCoreMat, clawMat, steelMat);

  // glowing CYAN eye material (emissive)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: COL.cyan, emissive: new THREE.Color(COL.cyan), emissiveIntensity: 3.0,
    roughness: 0.25, metalness: 0.1,
  });
  eyeMat.userData.baseEmissive = eyeMat.emissive.clone();
  eyeMat.userData.baseEmissiveIntensity = eyeMat.emissiveIntensity;

  // ==========================================================================
  // BODY — sleek, low-slung, forward-leaning feline torso
  // ==========================================================================
  const body = new THREE.Group();
  group.add(body);

  // chest (forward, broad) + slimmer abdomen, slightly hunched
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.42, 8, 18), hideMat);
  chest.position.set(0, 1.46, 0.06);
  chest.rotation.x = 0.28;          // hunched forward
  chest.scale.set(1.12, 1.0, 0.82);
  chest.castShadow = true;
  body.add(chest);

  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.34, 8, 16), hideMat);
  abdomen.position.set(0, 1.06, -0.06);
  abdomen.scale.set(1.0, 1.0, 0.85);
  abdomen.castShadow = true;
  body.add(abdomen);

  // sternum bolt chevron (raised emissive accent on the chest)
  const sternum = new THREE.Mesh(makeBoltBladeGeo(0.5), boltMat);
  sternum.position.set(0, 1.5, 0.42);
  sternum.rotation.set(0.28, 0, 0.15);
  sternum.scale.set(0.7, 0.9, 0.5);
  sternum.castShadow = true;
  body.add(sternum);

  // neck linking torso to head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 14), hideMat);
  neck.position.set(0, 1.82, 0.18);
  neck.rotation.x = 0.5;
  neck.castShadow = true;
  body.add(neck);

  // ==========================================================================
  // HEAD — angular wedge skull, hinged jaw, glowing cyan eyes, lightning crest
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 2.0, 0.3);
  group.add(head);

  // wedge skull: an octahedron-ish faceted block tapering to the snout
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.46), hideMat);
  skull.scale.set(1.0, 1.0, 1.0);
  skull.geometry.translate(0, 0, 0);
  skull.castShadow = true;
  head.add(skull);

  // angular muzzle wedge tapering forward (+Z)
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 4), hideMat);
  muzzle.rotation.x = Math.PI * 0.5;
  muzzle.rotation.z = Math.PI * 0.25; // diamond cross-section
  muzzle.position.set(0, -0.04, 0.34);
  muzzle.scale.set(1.0, 0.7, 1.0);
  muzzle.castShadow = true;
  head.add(muzzle);

  // brow / cheek edge plates (angular accents)
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.3), edgeMat);
    cheek.position.set(sx * 0.22, 0.0, 0.18);
    cheek.rotation.y = sx * 0.2;
    cheek.castShadow = true;
    head.add(cheek);
  }

  // pointed feline ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 4), hideMat);
    ear.position.set(sx * 0.18, 0.26, -0.04);
    ear.rotation.set(-0.2, Math.PI * 0.25, sx * 0.25);
    ear.castShadow = true;
    head.add(ear);
    const earTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), boltMat);
    earTip.position.set(sx * 0.18, 0.4, -0.04);
    earTip.rotation.z = sx * 0.25;
    head.add(earTip);
  }

  // GLOWING CYAN EYES (emissive) — narrow angular feline slits + shine cores
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), eyeMat);
    eye.position.set(sx * 0.17, 0.04, 0.26);
    eye.scale.set(1.5, 0.7, 0.7); // narrowed slit
    eye.rotation.z = sx * -0.35;
    head.add(eye);
    // tiny inner cyan light per eye socket for a glow read
    const eyeGlow = new THREE.PointLight(COL.cyan, 0.4, 1.2, 2.0);
    eyeGlow.position.set(sx * 0.17, 0.04, 0.3);
    head.add(eyeGlow);
  }

  // JAW (hinged) — rotation.x in [0..0.55] opens; lower angular wedge
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.12);
  head.add(jaw);

  const jawMesh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), hideMat);
  jawMesh.rotation.x = Math.PI * 0.5;
  jawMesh.rotation.z = Math.PI * 0.25;
  jawMesh.position.set(0, -0.04, 0.22);
  jawMesh.scale.set(1.0, 0.55, 0.95);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);

  // dark mouth interior
  const mouthInner = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.3), mouthMat);
  mouthInner.position.set(0, 0.0, 0.16);
  jaw.add(mouthInner);

  // small fang rows
  for (const sx of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), clawMat);
    fang.position.set(sx * 0.1, 0.04, 0.22);
    fang.rotation.x = Math.PI;
    jaw.add(fang);
  }

  // mouthAnchor (breath/beam origin) just past the snout tip
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.02, 0.5);
  head.add(mouthAnchor);

  // mouthGlow — electric-yellow emissive sphere, hidden by default
  const mouthGlowMat = new THREE.MeshStandardMaterial({
    color: COL.bolt, emissive: new THREE.Color(COL.bolt), emissiveIntensity: 2.8,
    roughness: 0.35, transparent: true, opacity: 0.9,
  });
  mouthGlowMat.userData.baseEmissive = mouthGlowMat.emissive.clone();
  mouthGlowMat.userData.baseEmissiveIntensity = mouthGlowMat.emissiveIntensity;
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), mouthGlowMat);
  mouthGlow.position.copy(mouthAnchor.position);
  mouthGlow.visible = false;
  head.add(mouthGlow);

  // CREST — 3 swept lightning-bolt blades (flat extruded zigzags) off the skull,
  // emissive yellow edges. Fanned back over the head.
  const crest = new THREE.Group();
  crest.position.set(0, 0.22, -0.12);
  head.add(crest);
  const crestSpecs = [
    { x: 0.0, scale: 1.0, yaw: 0.0, pitch: -0.55 },
    { x: -0.14, scale: 0.82, yaw: 0.45, pitch: -0.4 },
    { x: 0.14, scale: 0.82, yaw: -0.45, pitch: -0.4 },
  ];
  for (const cs of crestSpecs) {
    const blade = new THREE.Mesh(makeBoltBladeGeo(0.6 * cs.scale), blackMat);
    blade.position.set(cs.x, 0.1, -0.06);
    blade.rotation.set(cs.pitch, cs.yaw, 0);
    blade.castShadow = true;
    crest.add(blade);
    // emissive yellow edge rim (a slightly larger ghost behind the blade)
    const rim = new THREE.Mesh(makeBoltBladeGeo(0.6 * cs.scale), boltMat);
    rim.position.set(cs.x, 0.1, -0.085);
    rim.rotation.set(cs.pitch, cs.yaw, 0);
    rim.scale.setScalar(1.12);
    crest.add(rim);
  }

  // ==========================================================================
  // SHOULDER COILS — two ribbed copper-gold torus-stack cylinders, glowing core
  // ==========================================================================
  const coils = [];
  function buildCoil(sign) {
    const coil = new THREE.Group();
    coil.position.set(sign * 0.5, 1.62, 0.0);
    coil.rotation.z = sign * 0.25;
    group.add(coil);

    // core glowing cylinder (the charged heart of the coil)
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 14), coilCoreMat);
    core.castShadow = false;
    coil.add(core);

    // copper torus stack wrapped around the core (the ribbed coil)
    const ringCount = 6;
    for (let i = 0; i < ringCount; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 18), copperMat);
      ring.position.y = -0.15 + (i / (ringCount - 1)) * 0.3;
      ring.rotation.x = Math.PI * 0.5;
      ring.castShadow = true;
      coil.add(ring);
    }
    // copper end caps
    for (const ey of [-0.2, 0.2]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.06, 16), copperDarkMat);
      cap.position.y = ey;
      cap.castShadow = true;
      coil.add(cap);
    }
    // inner glow light
    const light = new THREE.PointLight(COL.bolt, 0.9, 2.6, 2.0);
    coil.add(light);

    // spark emission anchor (top of coil)
    const sparkAnchor = new THREE.Object3D();
    sparkAnchor.position.set(0, 0.22, 0);
    coil.add(sparkAnchor);

    coils.push({ group: coil, light, sparkAnchor, sign });
    return coil;
  }
  buildCoil(1);
  buildCoil(-1);

  // ==========================================================================
  // ARMS — lean shoulder pivots, clawed hands (blade claws)
  // ==========================================================================
  function buildArm(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.5, 1.5, 0.06);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.32, 6, 12), hideMat);
    upper.position.set(0, -0.24, 0);
    upper.castShadow = true;
    pivot.add(upper);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 6, 12), hideMat);
    fore.position.set(0, -0.6, 0.06);
    fore.rotation.x = 0.2;
    fore.castShadow = true;
    pivot.add(fore);

    // forearm bolt accent
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), boltMat);
    accent.position.set(sign * 0.08, -0.58, 0.12);
    accent.rotation.z = sign * 0.3;
    pivot.add(accent);

    // paw
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), blackMat);
    paw.position.set(0, -0.84, 0.1);
    paw.scale.set(1.0, 0.8, 1.1);
    paw.castShadow = true;
    pivot.add(paw);

    // 3 blade claws
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), clawMat);
      const a = (i - 1) * 0.34;
      claw.position.set(Math.sin(a) * 0.12, -0.96, 0.18 + Math.cos(a) * 0.03);
      claw.rotation.x = Math.PI * 0.58;
      claw.rotation.z = -a * 0.5;
      claw.castShadow = true;
      pivot.add(claw);
    }

    arms.push({ pivot });
    return pivot;
  }
  buildArm(1);
  buildArm(-1);

  // ==========================================================================
  // LEGS — digitigrade: thigh, backward-bent shin, paw foot + blade claws
  // ==========================================================================
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.28, 0.92, -0.04);
    group.add(pivot);

    // thigh (angled forward)
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 12), hideMat);
    thigh.position.set(0, -0.2, 0.08);
    thigh.rotation.x = 0.4;
    thigh.castShadow = true;
    pivot.add(thigh);

    // shin (digitigrade backward bend)
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 6, 12), hideMat);
    shin.position.set(0, -0.5, -0.04);
    shin.rotation.x = -0.5;
    shin.castShadow = true;
    pivot.add(shin);

    // ankle / metatarsal
    const ankle = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 6, 10), blackMat);
    ankle.position.set(0, -0.74, 0.04);
    ankle.rotation.x = 0.7;
    ankle.castShadow = true;
    pivot.add(ankle);

    // paw foot
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), blackMat);
    foot.position.set(0, -0.86, 0.18);
    foot.scale.set(1.0, 0.6, 1.4);
    foot.castShadow = true;
    pivot.add(foot);

    // 3 blade toe claws
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), clawMat);
      const a = (i - 1) * 0.3;
      claw.position.set(Math.sin(a) * 0.12, -0.88, 0.36);
      claw.rotation.x = Math.PI * 0.5;
      claw.castShadow = true;
      pivot.add(claw);
    }

    legs.push({ pivot });
    return pivot;
  }
  buildLeg(1);
  buildLeg(-1);

  // ==========================================================================
  // TAIL — long whip tail (tailGroup) tipped with a charged prong fork
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.0, -0.32);
  group.add(tailGroup);

  // segmented whip built as a chain of tapering capsules curving back/up
  const tailSegs = 6;
  let tz = 0, ty = 0;
  for (let i = 0; i < tailSegs; i++) {
    const r = 0.1 * (1 - i / (tailSegs + 1));
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(Math.max(0.03, r), 0.22, 6, 10), hideMat);
    tz -= 0.18;
    ty += i < 3 ? -0.02 : 0.06; // dips then sweeps up at the tip
    seg.position.set(0, ty, tz);
    seg.rotation.x = Math.PI * 0.5 + (i - 2) * 0.18;
    seg.castShadow = true;
    tailGroup.add(seg);
    // thin yellow bolt stripe accents along the whip
    if (i % 2 === 0) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), boltMat);
      stripe.position.set(0, ty, tz + 0.02);
      stripe.rotation.x = Math.PI * 0.5;
      tailGroup.add(stripe);
    }
  }

  // charged prong FORK at the tail tip
  const tailTip = new THREE.Group();
  tailTip.position.set(0, ty + 0.06, tz - 0.1);
  tailGroup.add(tailTip);
  for (const px of [-1, 0, 1]) {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 5), steelMat);
    prong.position.set(px * 0.08, 0.0, -0.1);
    prong.rotation.x = -Math.PI * 0.5;
    prong.rotation.z = px * 0.3;
    prong.castShadow = true;
    tailTip.add(prong);
    // glowing yellow prong tip
    const pt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), boltHotMat);
    pt.position.set(px * 0.12, 0.0, -0.22);
    tailTip.add(pt);
  }
  // a charge node where the prongs meet
  const tipNode = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), coilCoreMat);
  tipNode.position.set(0, 0, 0.0);
  tailTip.add(tipNode);
  const tipLight = new THREE.PointLight(COL.bolt, 0.7, 2.0, 2.0);
  tipLight.position.set(0, 0, -0.1);
  tailTip.add(tipLight);

  // spark anchor at the tail tip (world position resolved later)
  const tailSparkAnchor = new THREE.Object3D();
  tailSparkAnchor.position.set(0, 0, -0.12);
  tailTip.add(tailSparkAnchor);

  // ==========================================================================
  // FLAME — crackling spark system: ~8 jagged bolt segments (thin zigzag boxes,
  // additive emissive yellow-white) around the shoulders + tail. REBUILT/jittered
  // every ~80ms by animateExtra. Plus a yellow flameLight that micro-flashes.
  // ==========================================================================
  const flame = new THREE.Group();
  group.add(flame);

  // additive emissive bolt material (shared)
  const sparkMat = new THREE.MeshBasicMaterial({
    color: COL.boltHot,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // resolve spark emitter origins in group-local space
  const emitterLocals = [];
  for (const cn of coils) {
    const wp = new THREE.Vector3();
    cn.sparkAnchor.getWorldPosition(wp);
    emitterLocals.push({ pos: group.worldToLocal(wp.clone()), kind: 'coil' });
  }
  {
    const wp = new THREE.Vector3();
    tailSparkAnchor.getWorldPosition(wp);
    emitterLocals.push({ pos: group.worldToLocal(wp.clone()), kind: 'tail' });
  }

  // Each spark "bolt" is a small Group holding several thin box segments forming a
  // jagged zigzag. We store them and rewrite their segment transforms on rebuild.
  const SPARK_COUNT = 8;
  const SEGS_PER = 4;
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const em = emitterLocals[i % emitterLocals.length];
    const bolt = new THREE.Group();
    bolt.position.copy(em.pos);
    flame.add(bolt);
    const segMeshes = [];
    for (let s = 0; s < SEGS_PER; s++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.16), sparkMat);
      bolt.add(seg);
      segMeshes.push(seg);
    }
    sparks.push({ bolt, segMeshes, origin: em.pos.clone(), kind: em.kind });
  }

  // Rebuild one spark bolt as a fresh jagged zigzag from its origin.
  function rebuildSpark(sp) {
    const o = sp.origin;
    // random base direction (mostly upward/outward for coils, trailing for tail)
    let dir;
    if (sp.kind === 'tail') {
      dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.5, -0.4 - Math.random() * 0.5,
      ).normalize();
    } else {
      dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 0.6,
      ).normalize();
    }
    // small random recenter of the whole bolt around the emitter
    sp.bolt.position.set(
      o.x + (Math.random() - 0.5) * 0.12,
      o.y + (Math.random() - 0.5) * 0.12,
      o.z + (Math.random() - 0.5) * 0.12,
    );
    // lay the segments end-to-end with jitter to make a zigzag
    let cur = new THREE.Vector3(0, 0, 0);
    const segLen = 0.13;
    const up = new THREE.Vector3(0, 1, 0);
    for (const seg of sp.segMeshes) {
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.12,
      );
      const step = dir.clone().multiplyScalar(segLen).add(jitter);
      const next = cur.clone().add(step);
      const mid = cur.clone().add(next).multiplyScalar(0.5);
      seg.position.copy(mid);
      // orient the box along the step vector
      const len = Math.max(0.04, step.length());
      seg.scale.set(1, 1, len / 0.16);
      const q = new THREE.Quaternion();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), step.clone().normalize());
      seg.quaternion.copy(q);
      // random visibility toggle for a flicker/broken-arc look
      seg.visible = Math.random() > 0.18;
      cur = next;
    }
    // randomize whole-bolt visibility (occasional gaps)
    sp.bolt.visible = Math.random() > 0.12;
  }
  for (const sp of sparks) rebuildSpark(sp);

  // yellow flame light that micro-flashes
  const flameLight = new THREE.PointLight(COL.bolt, 0.8, 4.5, 2.0);
  flameLight.position.set(0, 1.7, -0.1);
  flame.add(flameLight);

  // ==========================================================================
  // animateExtra — spark rebuild every ~80ms (jitter offsets, toggle visibility)
  // + occasional micro-flash of flameLight + gentle coil glow pulse.
  // ==========================================================================
  let sparkTimer = 0;
  let flashTimer = 0;
  let nextFlash = 0.4 + Math.random() * 0.6;
  group.userData.animateExtra = (t, dt, state) => {
    const d = (typeof dt === 'number' && isFinite(dt)) ? Math.min(dt, 0.1) : 0.016;
    const attacking = state && state.attacking;

    // rebuild sparks every ~80ms (faster when attacking)
    sparkTimer += d;
    const interval = attacking ? 0.05 : 0.08;
    if (sparkTimer >= interval) {
      sparkTimer = 0;
      for (const sp of sparks) rebuildSpark(sp);
    }

    // coil core glow pulse + light flicker
    for (const cn of coils) {
      const flick = 1.0 + Math.sin(t * 9 + cn.sign * 1.7) * 0.3 + (attacking ? 0.9 : 0);
      cn.light.intensity = 0.8 * flick;
    }

    // tail-tip charge light flicker
    tipLight.intensity = (attacking ? 1.4 : 0.7) + Math.sin(t * 13) * 0.3;

    // flameLight: low base hum with occasional sharp micro-flash
    flashTimer += d;
    let flash = 0;
    if (flashTimer >= nextFlash) {
      flash = 2.4 + Math.random() * 1.6;
      flashTimer = 0;
      nextFlash = (attacking ? 0.12 : 0.35) + Math.random() * (attacking ? 0.18 : 0.55);
    }
    flameLight.intensity = 0.6 + Math.sin(t * 11) * 0.15 + flash;
  };

  // ==========================================================================
  // Cast shadows on remaining meshes (safety) + rig assembly
  // ==========================================================================
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  group.userData = Object.assign(group.userData || {}, {
    name: 'VOLTARON',
    element: 'electric',
    height: 2.4,
    baseY: 0,
    head,
    jaw,
    mouthAnchor,
    mouthGlow,
    tailGroup,
    flame,
    flameLight,
    wings: [],
    bodyMats,
    arms,
    legs,
  });

  return group;
}
