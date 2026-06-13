// characters/venusaur.js
// VENUSAUR — wide squat teal/blue-green quadruped with a giant blooming pink
// flower + green leaf-frond skirt on its back. Canvas-textured mottled hide,
// broad heavy-browed head, red eyes, wide hinged jaw. The flower is the `flame`
// aura: drifting pink petal/spore sprites + a soft pink-green light.
// Procedural geometry + canvas textures only. Faces +Z, origin at feet.
// 4 legs: front pair live in `arms`, rear pair in `legs` (engine swings both).
// Conforms to the Shared CHARACTER RIG contract.

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Palette
// ----------------------------------------------------------------------------
const COL = {
  skin:       0x4f9e8f, // teal / blue-green hide
  skinDark:   0x2f6e63, // mottled darker spots / shading
  skinLight:  0x73bdac, // belly / highlight
  spot:       0x255a51, // deep teal mottle spot
  trunk:      0x7a5a34, // brown flower trunk / calyx
  trunkDark:  0x553c20,
  petal:      0xe85aa8, // pink petal (magenta-ish center)
  petalTip:   0xfbd6ea, // pale pink / white tip
  stamen:     0xf6d44a, // yellow stamen cluster
  stamenDark: 0xd8a826,
  frond:      0x3f9e3a, // green leaf fronds
  frondDark:  0x2c6f28,
  claw:       0xe9e4d0, // ivory claws
  eye:        0xd83a32, // red eyes
  eyeShine:   0xffffff,
  brow:       0x274c45,
  mouth:      0x3a1a1c,
  mouthGlow:  0x8fe66a, // green mouth glow (grass breath)
  spore:      0xff9ad6, // pink spore sprite tint
};

// ----------------------------------------------------------------------------
// Canvas texture helpers
// ----------------------------------------------------------------------------
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return { c, ctx: c.getContext('2d') };
}

// Teal hide: base teal + darker mottled blue-green spots + fine wrinkle noise.
function makeHideTexture() {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = '#4f9e8f';
  ctx.fillRect(0, 0, 512, 512);

  // broad soft shading blobs (uneven tone)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 30 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(47,110,99,0.30)');
    g.addColorStop(1, 'rgba(47,110,99,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // iconic darker blue-green mottled spots (irregular ovals)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const rx = 8 + Math.random() * 26, ry = rx * (0.5 + Math.random() * 0.6);
    const rot = Math.random() * Math.PI;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
    g.addColorStop(0, 'rgba(37,90,81,0.85)');
    g.addColorStop(0.7, 'rgba(37,90,81,0.6)');
    g.addColorStop(1, 'rgba(37,90,81,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // fine skin-wrinkle noise (short squiggly strokes)
  ctx.strokeStyle = 'rgba(20,60,53,0.18)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const a = Math.random() * Math.PI * 2;
    const len = 4 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // sparse light specks (skin highlight pores)
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.fillStyle = 'rgba(115,189,172,0.22)';
    ctx.beginPath(); ctx.arc(x, y, 0.8 + Math.random() * 1.4, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Petal texture: magenta-ish center fading to white tip, soft veins.
// Mapped so v=0 (center/base) is magenta, v=1 (tip) is white.
function makePetalTexture() {
  const { c, ctx } = makeCanvas(128);
  const g = ctx.createLinearGradient(0, 128, 0, 0); // bottom(base)->top(tip)
  g.addColorStop(0, '#d83a8e');   // deep magenta base
  g.addColorStop(0.45, '#ec64ad');
  g.addColorStop(0.8, '#f9bcdb');
  g.addColorStop(1, '#ffffff');   // white tip
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  // soft central blush
  const rg = ctx.createRadialGradient(64, 110, 4, 64, 110, 70);
  rg.addColorStop(0, 'rgba(190,30,110,0.55)');
  rg.addColorStop(1, 'rgba(190,30,110,0.0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, 128, 128);

  // faint veins radiating from base
  ctx.strokeStyle = 'rgba(200,60,130,0.30)';
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(64, 124);
    ctx.quadraticCurveTo(64 + i * 6, 70, 64 + i * 16, 8);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Frond/leaf texture: green with a central midrib + lateral veins.
function makeFrondTexture() {
  const { c, ctx } = makeCanvas(128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#4cab44');
  g.addColorStop(1, '#2c6f28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // mottled tone
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(44,111,40,0.3)' : 'rgba(110,190,90,0.25)';
    ctx.beginPath(); ctx.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // central midrib (runs along v, x=64)
  ctx.strokeStyle = 'rgba(225,245,205,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(64, 6); ctx.lineTo(64, 122); ctx.stroke();
  // lateral veins
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(220,240,200,0.4)';
  for (let y = 16; y < 120; y += 14) {
    ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(108, y - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(20, y - 10); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Soft pink spore/petal sprite — radial glow.
function makeSporeSprite() {
  const { c, ctx } = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,225,242,0.95)');
  g.addColorStop(0.4, 'rgba(255,140,210,0.6)');
  g.addColorStop(1, 'rgba(240,110,190,0.0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ----------------------------------------------------------------------------
// Material helper (stores hit-flash bookkeeping — HARD RULE)
// ----------------------------------------------------------------------------
function stdMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.04,
    map: opts.map || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    envMapIntensity: opts.envMapIntensity ?? 1,
    transparent: opts.transparent || false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  return m;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
export function createVenusaur() {
  const group = new THREE.Group();
  group.name = 'VENUSAUR';

  const bodyMats = [];
  const arms = [];
  const legs = [];

  const hideTex  = makeHideTexture();
  const petalTex = makePetalTexture();
  const frondTex = makeFrondTexture();
  const sporeTex = makeSporeSprite();

  // shared materials
  const skinMat      = stdMat(COL.skin, { roughness: 0.7, map: hideTex });
  const skinDarkMat  = stdMat(COL.skinDark, { roughness: 0.72 });
  const skinLightMat = stdMat(COL.skinLight, { roughness: 0.68, map: hideTex });
  const trunkMat     = stdMat(COL.trunk, { roughness: 0.85 });
  const trunkDarkMat = stdMat(COL.trunkDark, { roughness: 0.88 });
  const petalMat     = stdMat(COL.petal, {
    roughness: 0.55, map: petalTex, side: THREE.DoubleSide,
    emissive: 0x5a1030, emissiveIntensity: 0.25,
  });
  const stamenMat    = stdMat(COL.stamen, { roughness: 0.5, emissive: 0x4a3800, emissiveIntensity: 0.3 });
  const frondMat     = stdMat(COL.frond, {
    roughness: 0.7, map: frondTex, side: THREE.DoubleSide,
  });
  const clawMat      = stdMat(COL.claw, { roughness: 0.45 });
  const browMat      = stdMat(COL.brow, { roughness: 0.6 });
  const eyeMat       = stdMat(COL.eye, { roughness: 0.3, emissive: COL.eye, emissiveIntensity: 0.35 });
  const mouthMat     = stdMat(COL.mouth, { roughness: 0.85 });

  bodyMats.push(skinMat, skinDarkMat, skinLightMat, trunkMat, trunkDarkMat,
                petalMat, stamenMat, frondMat, clawMat, eyeMat);

  // ==========================================================================
  // BODY — wide squat barrel torso (quadruped stance)
  // ==========================================================================
  const body = new THREE.Group();
  group.add(body);

  // main torso: a big flattened, wide ellipsoid sitting low to the ground
  const torsoGeo = new THREE.SphereGeometry(0.9, 24, 20);
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  torso.position.set(0, 1.0, -0.05);
  torso.scale.set(1.35, 0.95, 1.5); // wide + deep, squat
  torso.castShadow = true;
  body.add(torso);

  // lighter belly underside
  const bellyGeo = new THREE.SphereGeometry(0.78, 20, 16);
  const belly = new THREE.Mesh(bellyGeo, skinLightMat);
  belly.position.set(0, 0.72, 0.08);
  belly.scale.set(1.25, 0.6, 1.35);
  belly.castShadow = true;
  body.add(belly);

  // shoulder hump (front, where head meets body)
  const humpGeo = new THREE.SphereGeometry(0.62, 18, 16);
  const hump = new THREE.Mesh(humpGeo, skinMat);
  hump.position.set(0, 1.22, 0.55);
  hump.scale.set(1.15, 0.95, 1.0);
  hump.castShadow = true;
  body.add(hump);

  // ==========================================================================
  // HEAD — broad, heavy brow, small ears, red eyes, wide hinged jaw
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 1.34, 1.05);
  group.add(head);

  // broad squashed skull
  const skullGeo = new THREE.SphereGeometry(0.55, 22, 18);
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.scale.set(1.2, 0.92, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // blunt muzzle / upper snout
  const snoutGeo = new THREE.SphereGeometry(0.42, 18, 14);
  const snout = new THREE.Mesh(snoutGeo, skinMat);
  snout.position.set(0, -0.1, 0.36);
  snout.scale.set(1.15, 0.72, 0.8);
  snout.castShadow = true;
  head.add(snout);

  // heavy brow ridge (thick, scowling)
  const browGeo = new THREE.BoxGeometry(0.92, 0.18, 0.26);
  const brow = new THREE.Mesh(browGeo, browMat);
  brow.position.set(0, 0.2, 0.4);
  brow.rotation.x = -0.3;
  brow.castShadow = true;
  head.add(brow);
  // brow corner bulges
  for (const sx of [-1, 1]) {
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
    bb.position.set(sx * 0.42, 0.16, 0.34);
    bb.scale.set(1.0, 0.9, 0.9);
    bb.castShadow = true;
    head.add(bb);
  }

  // small ears (short rounded cones, set back on the skull)
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 10), skinMat);
    ear.position.set(sx * 0.5, 0.42, -0.04);
    ear.rotation.z = sx * -0.4;
    ear.rotation.x = -0.2;
    ear.castShadow = true;
    head.add(ear);
  }

  // red eyes + shine (under the heavy brow)
  const eyeShineMat = new THREE.MeshStandardMaterial({
    color: COL.eyeShine, roughness: 0.2, emissive: new THREE.Color(0x222222),
  });
  eyeShineMat.userData.baseEmissive = eyeShineMat.emissive.clone();
  eyeShineMat.userData.baseEmissiveIntensity = eyeShineMat.emissiveIntensity;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), eyeMat);
    eye.position.set(sx * 0.3, 0.06, 0.46);
    eye.scale.set(1.0, 1.15, 0.85);
    eye.castShadow = true;
    head.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeShineMat);
    shine.position.set(sx * 0.3 + 0.03, 0.1, 0.54);
    head.add(shine);
  }

  // JAW (hinged) — rotation.x in [0..0.55] opens; wide grass maw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.18);
  head.add(jaw);

  const jawGeo = new THREE.SphereGeometry(0.42, 18, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58);
  const jawMesh = new THREE.Mesh(jawGeo, skinMat);
  jawMesh.position.set(0, -0.02, 0.18);
  jawMesh.scale.set(1.12, 0.7, 0.85);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);

  // jaw hinge knobs (strong-jaw look)
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinDarkMat);
    knob.position.set(sx * 0.36, 0.0, 0.06);
    knob.castShadow = true;
    jaw.add(knob);
  }

  // dark mouth interior (attached to jaw)
  const mouthInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    mouthMat,
  );
  mouthInner.position.set(0, 0.04, 0.14);
  mouthInner.rotation.x = Math.PI;
  mouthInner.scale.set(1.0, 0.6, 0.7);
  jaw.add(mouthInner);

  // mouthAnchor (breath/beam origin) inside the mouth
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.04, 0.5);
  head.add(mouthAnchor);

  // mouthGlow — small emissive GREEN sphere (grass breath), hidden by default
  const mouthGlowMat = new THREE.MeshStandardMaterial({
    color: COL.mouthGlow, emissive: new THREE.Color(COL.mouthGlow), emissiveIntensity: 2.5,
    roughness: 0.4, transparent: true, opacity: 0.9,
  });
  mouthGlowMat.userData.baseEmissive = mouthGlowMat.emissive.clone();
  mouthGlowMat.userData.baseEmissiveIntensity = mouthGlowMat.emissiveIntensity;
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), mouthGlowMat);
  mouthGlow.position.copy(mouthAnchor.position);
  mouthGlow.visible = false;
  head.add(mouthGlow);

  // ==========================================================================
  // FRONT LEGS (stored in `arms`) + REAR LEGS (stored in `legs`)
  // Stumpy, clawed quadruped legs. sign: +1 left, -1 right.
  // ==========================================================================
  function buildLeg(sign, frontness) {
    // frontness: +1 front leg, -1 rear leg (affects z position)
    const pivot = new THREE.Group();
    const zBase = frontness > 0 ? 0.62 : -0.62;
    pivot.position.set(sign * 0.72, 0.72, zBase);
    group.add(pivot);

    // thick stumpy upper leg
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.24, 6, 12), skinMat);
    upper.position.set(0, -0.22, 0);
    upper.castShadow = true;
    pivot.add(upper);

    // lower stump
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.16, 6, 12), skinMat);
    lower.position.set(0, -0.5, 0.02);
    lower.castShadow = true;
    pivot.add(lower);

    // wide rounded foot
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), skinMat);
    foot.position.set(0, -0.66, 0.06);
    foot.scale.set(1.05, 0.62, 1.2);
    foot.castShadow = true;
    pivot.add(foot);

    // 3 ivory toe claws
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 8), clawMat);
      const a = (i - 1) * 0.4;
      claw.position.set(Math.sin(a) * 0.2, -0.7, 0.26);
      claw.rotation.x = Math.PI * 0.5;
      claw.rotation.z = -a * 0.5;
      claw.castShadow = true;
      pivot.add(claw);
    }
    return pivot;
  }

  // front pair → arms; rear pair → legs
  arms.push({ pivot: buildLeg(1, 1) });
  arms.push({ pivot: buildLeg(-1, 1) });
  legs.push({ pivot: buildLeg(1, -1) });
  legs.push({ pivot: buildLeg(-1, -1) });

  // ==========================================================================
  // TAIL — stubby
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.9, -1.0);
  group.add(tailGroup);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 12), skinMat);
  tail.position.set(0, -0.04, -0.16);
  tail.rotation.x = Math.PI * 0.62;
  tail.castShadow = true;
  tailGroup.add(tail);

  // ==========================================================================
  // FLOWER CROWN — on the back: brown trunk-calyx, ring of pink petals,
  // yellow stamen cluster, surrounded by a skirt of big green fronds.
  // The flowerCore group is swayed in animateExtra.
  // ==========================================================================
  const flowerCore = new THREE.Group();
  flowerCore.position.set(0, 1.72, -0.18); // seated on the back
  group.add(flowerCore);

  // brown trunk / stalk rising from the back
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 0.5, 16);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.22;
  trunk.castShadow = true;
  flowerCore.add(trunk);

  // calyx — segmented brown collar at the top of the trunk (ridged ring)
  const calyx = new THREE.Group();
  calyx.position.y = 0.46;
  flowerCore.add(calyx);
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), trunkDarkMat);
    const a = (i / 8) * Math.PI * 2;
    seg.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
    seg.scale.set(1.0, 0.8, 1.0);
    seg.castShadow = true;
    calyx.add(seg);
  }

  // petal ring — large curved petal planes radiating outward & up
  const petalGroup = new THREE.Group();
  petalGroup.position.y = 0.5;
  flowerCore.add(petalGroup);

  // curved petal geometry: a plane bent into a gentle cup (shared, reused)
  function makePetalGeometry() {
    const g = new THREE.PlaneGeometry(0.62, 0.86, 6, 8);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // cup curl: bend tips back along z based on x (side) and y (length)
      const curlX = -(x * x) * 1.2;            // sides curl up toward viewer
      const tip = (y + 0.43) / 0.86;           // 0 at base .. 1 at tip
      const curlY = -tip * tip * 0.35;         // tip leans back
      pos.setZ(i, curlX + curlY);
    }
    g.computeVertexNormals();
    return g;
  }
  const petalGeo = makePetalGeometry();

  const NUM_PETALS = 7;
  const petals = [];
  for (let i = 0; i < NUM_PETALS; i++) {
    const petalPivot = new THREE.Group();
    const a = (i / NUM_PETALS) * Math.PI * 2;
    petalPivot.rotation.y = a;
    petalGroup.add(petalPivot);

    const petal = new THREE.Mesh(petalGeo, petalMat);
    // push outward, tilt up so the bloom opens like a cup
    petal.position.set(0, 0.34, 0.34);
    petal.rotation.x = -0.85;     // lay back / open outward
    petal.scale.set(1.05, 1.1, 1.0);
    petal.castShadow = true;
    petalPivot.add(petal);
    petals.push(petalPivot);
  }

  // inner shorter petals (fuller bloom)
  for (let i = 0; i < NUM_PETALS; i++) {
    const petalPivot = new THREE.Group();
    const a = (i / NUM_PETALS) * Math.PI * 2 + Math.PI / NUM_PETALS;
    petalPivot.rotation.y = a;
    petalGroup.add(petalPivot);

    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(0, 0.28, 0.2);
    petal.rotation.x = -1.15;
    petal.scale.set(0.72, 0.8, 0.72);
    petal.castShadow = true;
    petalPivot.add(petal);
    petals.push(petalPivot);
  }

  // yellow stamen cluster in the flower center
  const stamenCluster = new THREE.Group();
  stamenCluster.position.y = 0.6;
  flowerCore.add(stamenCluster);
  // central pad
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), stamenMat);
  pad.scale.set(1.0, 0.5, 1.0);
  pad.castShadow = true;
  stamenCluster.add(pad);
  // little stamen knobs on filaments
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const r = 0.05 + (i % 3) * 0.035;
    const h = 0.1 + Math.random() * 0.08;
    const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 6), stamenMat);
    fil.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
    stamenCluster.add(fil);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), stamenMat);
    knob.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    knob.castShadow = true;
    stamenCluster.add(knob);
  }

  // ==========================================================================
  // LEAF SKIRT — big green fronds fanning out around the flower base
  // DoubleSide, vein texture. Slight per-frond animation in animateExtra.
  // ==========================================================================
  const skirtGroup = new THREE.Group();
  skirtGroup.position.set(0, 1.5, -0.18);
  group.add(skirtGroup);

  // a single broad leaf shape (rounded-tip plane), reused
  function makeFrondGeometry() {
    const g = new THREE.PlaneGeometry(0.7, 1.25, 5, 9);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const tip = (y + 0.625) / 1.25; // 0 base .. 1 tip
      // taper width toward the tip
      pos.setX(i, x * (1.0 - tip * 0.55));
      // gentle droop + slight cup
      pos.setZ(i, -tip * tip * 0.45 - (x * x) * 0.5);
    }
    g.computeVertexNormals();
    return g;
  }
  const frondGeo = makeFrondGeometry();

  const fronds = [];
  const NUM_FRONDS = 9;
  for (let i = 0; i < NUM_FRONDS; i++) {
    const frondPivot = new THREE.Group();
    const a = (i / NUM_FRONDS) * Math.PI * 2;
    frondPivot.rotation.y = a;
    skirtGroup.add(frondPivot);

    const frond = new THREE.Mesh(frondGeo, frondMat);
    // splay outward and droop down around the body
    frond.position.set(0, -0.1, 0.55);
    frond.rotation.x = 1.55; // nearly horizontal, drooping outward
    const sc = 0.9 + (i % 2) * 0.25;
    frond.scale.set(sc, sc, sc);
    frond.castShadow = true;
    frondPivot.add(frond);
    fronds.push({ pivot: frondPivot, mesh: frond, baseRotX: frond.rotation.x, phase: Math.random() * Math.PI * 2 });
  }

  // ==========================================================================
  // FLAME — drifting pink petal/spore sprites around the flower + soft light.
  // ==========================================================================
  const flame = new THREE.Group();
  group.add(flame);

  const sporeMat = new THREE.SpriteMaterial({
    map: sporeTex,
    color: COL.spore,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // emit center (world-ish local around the flower top)
  const emitCenter = new THREE.Vector3(0, 2.3, -0.18);
  const NUM_SPORES = 26;
  const spores = [];
  for (let i = 0; i < NUM_SPORES; i++) {
    const s = new THREE.Sprite(sporeMat.clone());
    const scl = 0.06 + Math.random() * 0.12;
    s.scale.setScalar(scl);
    s.userData = {
      phase: Math.random(),
      speed: 0.25 + Math.random() * 0.4,
      radius: 0.3 + Math.random() * 0.7,
      ang: Math.random() * Math.PI * 2,
      angSpeed: (Math.random() - 0.5) * 0.6,
      rise: 0.6 + Math.random() * 0.9,
      baseScale: scl,
    };
    s.position.copy(emitCenter);
    flame.add(s);
    spores.push(s);
  }

  // soft pink-green light glowing from the flower
  const flameLight = new THREE.PointLight(0xff9ad6, 1.0, 5.0, 2.0);
  flameLight.position.set(0, 2.2, -0.1);
  flame.add(flameLight);
  // a faint green undertone fill
  const flameLight2 = new THREE.PointLight(0x9fe87a, 0.5, 4.0, 2.0);
  flameLight2.position.set(0, 1.7, -0.18);
  flame.add(flameLight2);

  // ==========================================================================
  // animateExtra — flower sway + frond flutter + spore drift
  // ==========================================================================
  group.userData.animateExtra = (t, dt, state) => {
    const attacking = state && state.attacking;
    const speed = (state && state.speed) || 0;

    // whole-flower gentle sway (weight of the bloom)
    flowerCore.rotation.z = Math.sin(t * 1.1) * 0.05 + Math.sin(t * 0.37) * 0.02;
    flowerCore.rotation.x = Math.sin(t * 0.9 + 1.0) * 0.04;

    // petals breathe (subtle open/close) — scale the petal ring slightly
    const bloom = 1.0 + Math.sin(t * 1.4) * 0.025 + (attacking ? 0.04 : 0);
    petalGroup.scale.set(bloom, bloom, bloom);

    // fronds flutter individually
    for (const f of fronds) {
      f.mesh.rotation.x = f.baseRotX + Math.sin(t * 1.6 + f.phase) * 0.08
        + speed * 0.04 * Math.sin(t * 6 + f.phase);
    }

    // spores spiral up and out from the flower, fade & recycle
    const opMul = attacking ? 1.0 : 0.7;
    for (const s of spores) {
      const u = (s.userData.phase + t * s.userData.speed * 0.2) % 1;
      s.userData.ang += s.userData.angSpeed * dt;
      const r = s.userData.radius * (0.4 + u * 0.9);
      s.position.set(
        emitCenter.x + Math.cos(s.userData.ang) * r,
        emitCenter.y + u * s.userData.rise + Math.sin(t * 2 + s.userData.phase * 7) * 0.04,
        emitCenter.z + Math.sin(s.userData.ang) * r,
      );
      const fade = Math.sin(u * Math.PI);
      s.material.opacity = opMul * fade;
      s.scale.setScalar(s.userData.baseScale * (0.6 + u * 0.8));
    }

    flameLight.intensity = (attacking ? 1.8 : 1.0) + Math.sin(t * 3.5) * 0.2;
    flameLight2.intensity = (attacking ? 0.9 : 0.5) + Math.sin(t * 2.7 + 1) * 0.12;
  };

  // ==========================================================================
  // Safety: cast shadows on all meshes + rig assembly
  // ==========================================================================
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  group.userData = Object.assign(group.userData || {}, {
    name: 'VENUSAUR',
    element: 'grass',
    height: 2.3,
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
