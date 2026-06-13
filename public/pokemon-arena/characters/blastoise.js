// characters/blastoise.js
// BLASTOISE — blue bipedal turtle, brown canvas-textured plate-grid shell,
// twin steel HYDRO CANNONS on the shell shoulders, cyan mist/bubble aura.
// Procedural geometry + canvas textures only. Faces +Z, origin at feet.
// Conforms to the Shared CHARACTER RIG contract.

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Palette
// ----------------------------------------------------------------------------
const COL = {
  skin:       0x7db4d8, // pale blue
  skinDark:   0x4f86ad,
  belly:      0xf3e6c4, // cream chest/belly plate
  bellyEdge:  0xd9c79a,
  shell:      0x7a4a26, // iconic brown shell
  shellDark:  0x5a3318,
  shellSeam:  0x3a2110,
  shellPlate: 0x9a6238,
  shellRim:   0xc99458,
  steel:      0x9aa6b2, // hydro cannon barrel
  steelDark:  0x5b6470,
  steelMuzzle:0xc7d0d9,
  bore:       0x18f0ff, // glowing cyan bore
  claw:       0xf4f1e6,
  eye:        0x5a3a1c, // brown eyes
  eyeShine:   0xffffff,
  brow:       0x3c2914,
  mouth:      0x331a10,
  cyan:       0x35e6ff,
};

// ----------------------------------------------------------------------------
// Canvas texture helpers
// ----------------------------------------------------------------------------
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return { c, ctx: c.getContext('2d') };
}

// Brown shell: dark hexagon-ish seams, lighter plate centers, a rim band.
function makeShellTexture() {
  const { c, ctx } = makeCanvas(512);
  // base plate fill
  ctx.fillStyle = '#7a4a26';
  ctx.fillRect(0, 0, 512, 512);

  // subtle mottle
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 1 + Math.random() * 3;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(90,51,24,0.25)' : 'rgba(154,98,56,0.22)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // hex-ish plate grid: offset rows of rounded plates with dark seams
  const cols = 6, rows = 6;
  const cw = 512 / cols, ch = 512 / rows;
  ctx.lineJoin = 'round';
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const ox = cx * cw + (ry % 2 ? cw * 0.5 : 0);
      const oy = ry * ch;
      const pad = 6;
      // plate center (lighter), painted as a rounded hexagon
      const px = ox + cw / 2, py = oy + ch / 2;
      const rw = cw / 2 - pad, rh = ch / 2 - pad;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 6;
        const vx = px + Math.cos(a) * rw;
        const vy = py + Math.sin(a) * rh;
        if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      // gradient fill for a domed plate look
      const g = ctx.createRadialGradient(px, py - rh * 0.3, rw * 0.1, px, py, rw * 1.1);
      g.addColorStop(0, '#a86c3e');
      g.addColorStop(0.6, '#8a5630');
      g.addColorStop(1, '#6b3f20');
      ctx.fillStyle = g;
      ctx.fill();
      // dark seam outline
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#3a2110';
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(201,148,88,0.55)'; // inner rim highlight
      ctx.stroke();
    }
  }

  // outer rim band (top + bottom edges) to suggest the shell rim
  ctx.fillStyle = '#c99458';
  ctx.fillRect(0, 0, 512, 26);
  ctx.fillRect(0, 486, 512, 26);
  ctx.fillStyle = 'rgba(58,33,16,0.5)';
  ctx.fillRect(0, 26, 512, 5);
  ctx.fillRect(0, 481, 512, 5);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Cream front plate ring (chest shell underbelly) with concentric plate seams.
function makeBellyTexture() {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#f3e6c4';
  ctx.fillRect(0, 0, 256, 256);
  // soft vignette shading
  const vg = ctx.createRadialGradient(128, 128, 30, 128, 128, 150);
  vg.addColorStop(0, 'rgba(255,250,235,0.6)');
  vg.addColorStop(1, 'rgba(190,170,120,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 256, 256);
  // concentric ring plates
  ctx.strokeStyle = 'rgba(150,120,70,0.55)';
  for (let r = 30; r < 130; r += 26) {
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
  }
  // radial seams
  ctx.strokeStyle = 'rgba(150,120,70,0.4)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 26, 128 + Math.sin(a) * 26);
    ctx.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Cyan mist/bubble sprite — soft radial glow.
function makeMistSprite() {
  const { c, ctx } = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(190,250,255,0.95)');
  g.addColorStop(0.4, 'rgba(60,220,255,0.55)');
  g.addColorStop(1, 'rgba(40,180,255,0.0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ----------------------------------------------------------------------------
// Material helpers
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

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
export function createBlastoise() {
  const group = new THREE.Group();
  group.name = 'BLASTOISE';

  const bodyMats = [];
  const arms = [];
  const legs = [];

  const shellTex = makeShellTexture();
  const bellyTex = makeBellyTexture();
  const mistTex = makeMistSprite();

  // shared materials
  const skinMat   = stdMat(COL.skin, { roughness: 0.62, map: null });
  const skinDarkMat = stdMat(COL.skinDark, { roughness: 0.65 });
  const bellyMat  = stdMat(COL.belly, { roughness: 0.55, map: bellyTex });
  const shellMat  = stdMat(COL.shell, { roughness: 0.78, map: shellTex });
  const shellRimMat = stdMat(COL.shellRim, { roughness: 0.6 });
  const steelMat  = stdMat(COL.steel, { roughness: 0.35, metalness: 0.85, envMapIntensity: 1.3 });
  const steelDarkMat = stdMat(COL.steelDark, { roughness: 0.4, metalness: 0.9 });
  const muzzleMat = stdMat(COL.steelMuzzle, { roughness: 0.28, metalness: 0.9, envMapIntensity: 1.4 });
  const boreMat   = stdMat(COL.bore, { roughness: 0.3, emissive: COL.bore, emissiveIntensity: 2.4 });
  const clawMat   = stdMat(COL.claw, { roughness: 0.4 });
  const browMat   = stdMat(COL.brow, { roughness: 0.6 });
  const eyeMat    = stdMat(COL.eye, { roughness: 0.35 });
  const mouthMat  = stdMat(COL.mouth, { roughness: 0.8 });

  bodyMats.push(skinMat, skinDarkMat, bellyMat, shellMat, shellRimMat,
                steelMat, steelDarkMat, muzzleMat, clawMat);

  // ==========================================================================
  // BODY — stocky capsule
  // ==========================================================================
  const body = new THREE.Group();
  group.add(body);

  // torso: capsule (stocky)
  const torsoGeo = new THREE.CapsuleGeometry(0.62, 0.55, 8, 18);
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  torso.position.y = 1.18;
  torso.scale.set(1.0, 1.0, 0.92);
  torso.castShadow = true;
  body.add(torso);

  // cream chest/belly plate (front patch) — slightly flattened sphere on +Z
  const chestGeo = new THREE.SphereGeometry(0.5, 18, 16);
  const chest = new THREE.Mesh(chestGeo, bellyMat);
  chest.position.set(0, 1.12, 0.42);
  chest.scale.set(1.0, 1.18, 0.55);
  chest.castShadow = true;
  body.add(chest);

  // cream front plate RING (shell underside collar around the chest)
  const frontRingGeo = new THREE.TorusGeometry(0.46, 0.09, 10, 28);
  const frontRing = new THREE.Mesh(frontRingGeo, bellyMat);
  frontRing.position.set(0, 1.1, 0.5);
  frontRing.scale.set(1.05, 1.25, 0.5);
  frontRing.castShadow = true;
  body.add(frontRing);

  // ==========================================================================
  // SHELL — back dome with plate-grid canvas texture + cream rim
  // ==========================================================================
  const shell = new THREE.Group();
  body.add(shell);

  const shellDomeGeo = new THREE.SphereGeometry(0.82, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const shellDome = new THREE.Mesh(shellDomeGeo, shellMat);
  // orient dome to face backward (-Z), bulging out the back
  shellDome.rotation.x = Math.PI * 0.5;       // open side faces forward
  shellDome.position.set(0, 1.2, -0.34);
  shellDome.scale.set(1.0, 0.95, 1.05);
  shellDome.castShadow = true;
  shell.add(shellDome);

  // shell rim band (cream torus around the dome opening)
  const rimGeo = new THREE.TorusGeometry(0.78, 0.07, 10, 30);
  const rim = new THREE.Mesh(rimGeo, shellRimMat);
  rim.rotation.x = Math.PI * 0.5;
  rim.position.set(0, 1.18, -0.32);
  rim.scale.set(1.0, 1.0, 0.9);
  rim.castShadow = true;
  shell.add(rim);

  // ==========================================================================
  // HEAD — rounded with strong jaw hinge, brown eyes, fierce brow
  // ==========================================================================
  const head = new THREE.Group();
  head.position.set(0, 1.92, 0.06);
  group.add(head);

  const skullGeo = new THREE.SphereGeometry(0.42, 20, 18);
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.scale.set(1.0, 0.95, 1.02);
  skull.castShadow = true;
  head.add(skull);

  // upper snout / muzzle
  const snoutGeo = new THREE.SphereGeometry(0.3, 16, 14);
  const snout = new THREE.Mesh(snoutGeo, skinMat);
  snout.position.set(0, -0.06, 0.3);
  snout.scale.set(1.0, 0.7, 0.85);
  snout.castShadow = true;
  head.add(snout);

  // fierce brow ridge
  const browGeo = new THREE.BoxGeometry(0.62, 0.1, 0.16);
  const brow = new THREE.Mesh(browGeo, browMat);
  brow.position.set(0, 0.16, 0.34);
  brow.rotation.x = -0.25;
  brow.castShadow = true;
  head.add(brow);

  // eyes (brown) + shine
  const eyeShineMat = new THREE.MeshStandardMaterial({
    color: COL.eyeShine, roughness: 0.2, emissive: new THREE.Color(0x222222),
  });
  eyeShineMat.userData.baseEmissive = eyeShineMat.emissive.clone();
  eyeShineMat.userData.baseEmissiveIntensity = eyeShineMat.emissiveIntensity;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), eyeMat);
    eye.position.set(sx * 0.2, 0.08, 0.36);
    eye.scale.set(1, 1.15, 0.8);
    eye.castShadow = true;
    head.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeShineMat);
    shine.position.set(sx * 0.2 + 0.025, 0.11, 0.43);
    head.add(shine);
  }

  // JAW (hinged) — rotation.x in [0..0.55] opens
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.12);
  head.add(jaw);

  const jawGeo = new THREE.SphereGeometry(0.3, 16, 14, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6);
  const jawMesh = new THREE.Mesh(jawGeo, skinMat);
  jawMesh.position.set(0, -0.02, 0.18);
  jawMesh.scale.set(0.95, 0.7, 0.9);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);

  // jaw hinge knobs (strong jaw look)
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), skinDarkMat);
    knob.position.set(sx * 0.26, 0.0, 0.05);
    knob.castShadow = true;
    jaw.add(knob);
  }

  // mouth interior (dark) attached to jaw
  const mouthInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    mouthMat,
  );
  mouthInner.position.set(0, 0.02, 0.16);
  mouthInner.rotation.x = Math.PI;
  mouthInner.scale.set(0.9, 0.6, 0.7);
  jaw.add(mouthInner);

  // mouthAnchor (breath/beam origin) inside the mouth
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.02, 0.34);
  head.add(mouthAnchor);

  // mouthGlow — small emissive cyan sphere, hidden by default
  const mouthGlowMat = new THREE.MeshStandardMaterial({
    color: COL.cyan, emissive: new THREE.Color(COL.cyan), emissiveIntensity: 2.5,
    roughness: 0.4, transparent: true, opacity: 0.9,
  });
  mouthGlowMat.userData.baseEmissive = mouthGlowMat.emissive.clone();
  mouthGlowMat.userData.baseEmissiveIntensity = mouthGlowMat.emissiveIntensity;
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mouthGlowMat);
  mouthGlow.position.copy(mouthAnchor.position);
  mouthGlow.visible = false;
  head.add(mouthGlow);

  // ==========================================================================
  // ARMS — shoulder pivots, 3-claw hands
  // ==========================================================================
  function buildArm(sign) { // sign: +1 left, -1 right
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.66, 1.42, 0.04);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.34, 6, 12), skinMat);
    upper.position.set(0, -0.28, 0);
    upper.castShadow = true;
    pivot.add(upper);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 12), skinMat);
    fore.position.set(0, -0.66, 0.04);
    fore.rotation.x = 0.15;
    fore.castShadow = true;
    pivot.add(fore);

    // hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
    hand.position.set(0, -0.94, 0.08);
    hand.scale.set(1.0, 0.85, 1.0);
    hand.castShadow = true;
    pivot.add(hand);

    // 3 claws
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), clawMat);
      const a = (i - 1) * 0.35;
      claw.position.set(Math.sin(a) * 0.16, -1.06, 0.16 + Math.cos(a) * 0.04);
      claw.rotation.x = Math.PI * 0.55;
      claw.rotation.z = -a * 0.6;
      claw.castShadow = true;
      pivot.add(claw);
    }

    arms.push({ pivot });
    return pivot;
  }
  buildArm(1);
  buildArm(-1);

  // ==========================================================================
  // LEGS — thick, hip pivots, 3-claw feet
  // ==========================================================================
  function buildLeg(sign) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.34, 0.78, 0.0);
    group.add(pivot);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.3, 6, 12), skinMat);
    thigh.position.set(0, -0.26, 0);
    thigh.castShadow = true;
    pivot.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.22, 6, 12), skinMat);
    shin.position.set(0, -0.58, 0.02);
    shin.castShadow = true;
    pivot.add(shin);

    // foot
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skinMat);
    foot.position.set(0, -0.78, 0.12);
    foot.scale.set(1.0, 0.6, 1.3);
    foot.castShadow = true;
    pivot.add(foot);

    // 3 toe claws
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 8), clawMat);
      const a = (i - 1) * 0.3;
      claw.position.set(Math.sin(a) * 0.16, -0.82, 0.32);
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
  // TAIL — short, tailGroup root
  // ==========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.95, -0.55);
  group.add(tailGroup);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), skinMat);
  tail.position.set(0, -0.05, -0.18);
  tail.rotation.x = Math.PI * 0.62;
  tail.castShadow = true;
  tailGroup.add(tail);

  // ==========================================================================
  // HYDRO CANNONS — twin steel cannons on the shell shoulders
  // Stored for animateExtra recoil; each has an inner cyan PointLight.
  // ==========================================================================
  const cannons = [];

  function buildCannon(sign) {
    const cannon = new THREE.Group();
    // mounted on the upper shell shoulders, angled outward + forward
    cannon.position.set(sign * 0.5, 1.62, -0.18);
    cannon.rotation.y = sign * -0.32; // outward
    cannon.rotation.x = -0.22;        // forward/up tilt
    group.add(cannon);

    // socket collar (dark steel) seating the cannon into the shell
    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.18, 16), steelDarkMat,
    );
    socket.rotation.x = Math.PI * 0.5;
    socket.position.z = 0.02;
    socket.castShadow = true;
    cannon.add(socket);

    // main barrel (steel)
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.175, 0.62, 18), steelMat,
    );
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.z = 0.34;
    barrel.castShadow = true;
    cannon.add(barrel);

    // barrel reinforcing bands
    for (const zz of [0.18, 0.46]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.168, 0.028, 8, 18), steelDarkMat,
      );
      band.position.z = zz;
      band.castShadow = true;
      cannon.add(band);
    }

    // lighter muzzle ring at the tip
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.155, 0.12, 18), muzzleMat,
    );
    muzzle.rotation.x = Math.PI * 0.5;
    muzzle.position.z = 0.66;
    muzzle.castShadow = true;
    cannon.add(muzzle);

    // inner glowing cyan bore disc
    const bore = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 18), boreMat,
    );
    bore.position.z = 0.715;
    cannon.add(bore);

    // tiny inner cyan point light
    const light = new THREE.PointLight(COL.cyan, 1.2, 2.4, 2.0);
    light.position.z = 0.7;
    cannon.add(light);

    // muzzle world-position anchor for mist emission
    const muzzleTip = new THREE.Object3D();
    muzzleTip.position.z = 0.73;
    cannon.add(muzzleTip);

    cannons.push({ group: cannon, light, muzzleTip, baseZ: cannon.position.z, sign });
    return cannon;
  }
  buildCannon(1);
  buildCannon(-1);

  // ==========================================================================
  // FLAME — cyan mist/bubble sprite cloud (additive) drifting from muzzles
  // + a cyan flameLight. Stored particles animated in animateExtra.
  // ==========================================================================
  const flame = new THREE.Group();
  group.add(flame);

  const mistMat = new THREE.SpriteMaterial({
    map: mistTex,
    color: COL.cyan,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const PARTS_PER_CANNON = 14;
  const mistParts = [];
  for (const cn of cannons) {
    // muzzle world position
    const wp = new THREE.Vector3();
    cn.muzzleTip.getWorldPosition(wp);
    const local = group.worldToLocal(wp.clone());
    for (let i = 0; i < PARTS_PER_CANNON; i++) {
      const s = new THREE.Sprite(mistMat.clone());
      const scl = 0.1 + Math.random() * 0.16;
      s.scale.setScalar(scl);
      const phase = Math.random();
      s.userData = {
        origin: local.clone(),
        sign: cn.sign,
        phase,
        speed: 0.4 + Math.random() * 0.5,
        baseScale: scl,
        spread: (Math.random() - 0.5) * 0.22,
      };
      // initial placement
      s.position.copy(local);
      flame.add(s);
      mistParts.push(s);
    }
  }

  const flameLight = new THREE.PointLight(COL.cyan, 1.1, 4.0, 2.0);
  flameLight.position.set(0, 1.65, 0.3);
  flame.add(flameLight);

  // ==========================================================================
  // animateExtra — subtle cannon recoil-breathing + mist shimmer
  // ==========================================================================
  group.userData.animateExtra = (t, dt, state) => {
    const attacking = state && state.attacking;
    // cannon recoil-breathing: gentle in/out along local Z
    for (const cn of cannons) {
      const breathe = Math.sin(t * 1.6 + (cn.sign > 0 ? 0 : Math.PI)) * 0.012;
      const recoil = attacking ? Math.sin(t * 22) * 0.05 : 0;
      cn.group.position.z = cn.baseZ - breathe - Math.max(0, recoil);
      const flick = 1.0 + Math.sin(t * 7 + cn.sign) * 0.25 + (attacking ? 0.8 : 0);
      cn.light.intensity = 1.0 * flick;
    }

    // mist shimmer: rise + drift forward from muzzles, fade & recycle
    for (const s of mistParts) {
      const u = (s.userData.phase + t * 0.4 * s.userData.speed) % 1;
      const o = s.userData.origin;
      // drift forward (+Z) and slightly up/out
      s.position.set(
        o.x + s.userData.spread * u + Math.sin(t * 3 + s.userData.phase * 9) * 0.03,
        o.y + u * 0.45 + Math.sin(t * 4 + s.userData.phase * 6) * 0.02,
        o.z + u * 0.5,
      );
      const fade = Math.sin(u * Math.PI);
      s.material.opacity = (attacking ? 0.85 : 0.5) * fade;
      s.scale.setScalar(s.userData.baseScale * (0.7 + u * 0.9));
    }

    flameLight.intensity = (attacking ? 2.0 : 1.0) + Math.sin(t * 6) * 0.25;
  };

  // ==========================================================================
  // Cast shadows on any remaining meshes (safety) + rig assembly
  // ==========================================================================
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  group.userData = Object.assign(group.userData || {}, {
    name: 'BLASTOISE',
    element: 'water',
    height: 2.5,
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
