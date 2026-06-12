// environment.js — Pokkén-style stadium atmosphere layer
// Adds: waving team banners, twin jumbotrons, a circling blimp, rim torch
// braziers, and a pooled fireworks system. Self-contained ES module.
import * as THREE from "three";

// ---------------------------------------------------------------------------
// internal state
// ---------------------------------------------------------------------------
const state = {
  banners: [],        // { mesh, phase, speed }
  jumbotrons: [],     // { screenMat, baseIntensity, phase }
  blimp: null,        // { group, angle, speed, radius, height, bannerMat }
  torches: [],        // { sprite, light|null, baseScale, phase }
  isTouch: false,
  scene: null,
  // fireworks
  rockets: [],        // active rockets { sprite, vel, burstY, color }
  particles: [],      // active burst particles { sprite, vel, life, maxLife }
  pool: [],           // free sprites for fireworks
  poolAll: [],        // every pooled sprite ever made (cap)
  time: 0,
};

const FIREWORK_SPRITE_CAP = 250;

// ---------------------------------------------------------------------------
// canvas texture helpers
// ---------------------------------------------------------------------------
function makeCanvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// soft radial glow dot — shared by flames and fireworks
function makeGlowTexture(inner, outer) {
  return makeCanvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

// vertical team banner design
function makeBannerTexture(i) {
  const palettes = [
    ["#e23a3a", "#ffd24a"], // ember red / gold
    ["#2e6fe2", "#9fd4ff"], // hydro blue
    ["#2fa84f", "#c8f06e"], // leaf green
    ["#8b3ae2", "#ff9ff5"], // psychic purple
    ["#e2762e", "#ffe9b0"], // flame orange
  ];
  const [a, b] = palettes[i % palettes.length];
  const emblems = ["★", "⚡", "▲", "●", "✷"];
  return makeCanvas(128, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, a);
    grad.addColorStop(1, "#1c1430");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // diagonal slash
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    ctx.lineTo(w, h * 0.4);
    ctx.lineTo(w, h * 0.52);
    ctx.lineTo(0, h * 0.67);
    ctx.closePath();
    ctx.fill();
    // border
    ctx.strokeStyle = b;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    // emblem
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emblems[i % emblems.length], w / 2, h * 0.26);
    // tail notch
    ctx.fillStyle = b;
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("ARENA", w / 2, h * 0.84);
  });
}

// jumbotron screen
function makeJumbotronTexture(line1, line2) {
  return makeCanvas(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#120a2e");
    grad.addColorStop(1, "#2a0b3d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // scanline stripes
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 3);
    // chunky text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#000000";
    ctx.font = "900 56px Arial Black, sans-serif";
    ctx.fillStyle = "#ffd24a";
    ctx.strokeText(line1, w / 2, h * 0.32);
    ctx.fillText(line1, w / 2, h * 0.32);
    ctx.font = "900 88px Arial Black, sans-serif";
    ctx.fillStyle = "#ff5a3c";
    ctx.strokeText(line2, w / 2, h * 0.72);
    ctx.fillText(line2, w / 2, h * 0.72);
    // border glow
    ctx.strokeStyle = "#7df0ff";
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
}

function makeBlimpBannerTexture() {
  return makeCanvas(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#0c1238";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffd24a";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = "#7df0ff";
    ctx.font = "900 34px Arial Black, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EMBER CROWN", w / 2, h / 2);
  });
}

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------
function buildBanners(scene) {
  const COUNT = 9;
  const RIM_R = 50;
  const RIM_Y = 18;
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 8, 6);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x55607a,
    metalness: 0.7,
    roughness: 0.4,
  });
  const flagGeo = new THREE.PlaneGeometry(2.2, 4.4);
  flagGeo.translate(0, -2.4, 0); // hang from top edge so waving pivots at pole

  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + 0.18;
    const x = Math.cos(a) * RIM_R;
    const z = Math.sin(a) * RIM_R;

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, RIM_Y + 4, z);
    scene.add(pole);

    const tex = makeBannerTexture(i);
    const flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshStandardMaterial({
        map: tex,
        side: THREE.DoubleSide,
        roughness: 0.85,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.25, // readable at dusk, below bloom threshold
      })
    );
    flag.position.set(x, RIM_Y + 7.9, z);
    flag.rotation.y = -a + Math.PI / 2; // face along the rim tangent
    scene.add(flag);

    state.banners.push({
      mesh: flag,
      phase: Math.random() * Math.PI * 2,
      speed: 1.6 + Math.random() * 0.8,
    });
  }
}

function buildJumbotrons(scene) {
  const defs = [
    { angle: 0, text1: "EMBER CROWN", text2: "GRAND PRIX" },
    { angle: Math.PI, text1: "EMBER CROWN", text2: "FIGHT!" },
  ];
  const R = 56;
  const Y = 22;
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1a2030,
    metalness: 0.6,
    roughness: 0.5,
  });

  for (const def of defs) {
    const group = new THREE.Group();
    const x = Math.cos(def.angle) * R;
    const z = Math.sin(def.angle) * R;

    // frame box
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 7.5, 1.4), frameMat);
    group.add(frame);

    // support struts down toward stands
    const strutGeo = new THREE.CylinderGeometry(0.25, 0.35, 6, 6);
    for (const sx of [-5, 5]) {
      const strut = new THREE.Mesh(strutGeo, frameMat);
      strut.position.set(sx, -6.5, 0);
      group.add(strut);
    }

    const tex = makeJumbotronTexture(def.text1, def.text2);
    const screenMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.8, // > bloom threshold, glows
      roughness: 1,
      metalness: 0,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 6.3), screenMat);
    screen.position.z = 0.75;
    group.add(screen);

    group.position.set(x, Y, z);
    group.lookAt(0, Y - 4, 0); // tilt slightly down at the field
    scene.add(group);

    state.jumbotrons.push({
      screenMat,
      baseIntensity: 1.8,
      phase: def.angle,
    });
  }
}

function buildBlimp(scene) {
  const group = new THREE.Group();

  // ellipsoid hull
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({
      color: 0xd8dce6,
      roughness: 0.55,
      metalness: 0.1,
    })
  );
  hull.scale.set(9, 3.2, 3.2);
  group.add(hull);

  // tail fins
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xe23a3a,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const finGeo = new THREE.PlaneGeometry(3, 2.2);
  const finV = new THREE.Mesh(finGeo, finMat);
  finV.position.set(-7.8, 0, 0);
  group.add(finV);
  const finH = new THREE.Mesh(finGeo, finMat);
  finH.position.set(-7.8, 0, 0);
  finH.rotation.x = Math.PI / 2;
  group.add(finH);

  // gondola
  const gondola = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 0.5 })
  );
  gondola.position.set(0, -3.4, 0);
  group.add(gondola);

  // emissive side banner
  const bTex = makeBlimpBannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bTex,
    emissive: 0xffffff,
    emissiveMap: bTex,
    emissiveIntensity: 1.7,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.4), bannerMat);
  banner.position.set(0, 0, 0); // wraps wider than hull z, reads from both sides
  group.add(banner);

  scene.add(group);
  state.blimp = {
    group,
    angle: Math.random() * Math.PI * 2,
    speed: 0.045, // rad/s — slow lap (~2.3 min)
    radius: 90,
    height: 70,
    bannerMat,
  };
}

function buildTorches(scene, isTouch) {
  const count = isTouch ? 4 : 8;
  const RIM_R = 48.5;
  const RIM_Y = 18.4;
  const flameTex = makeGlowTexture("rgba(255,240,180,1)", "rgba(255,110,20,0.8)");
  const bowlGeo = new THREE.CylinderGeometry(0.55, 0.3, 0.8, 8);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: 0x3a2e22,
    metalness: 0.5,
    roughness: 0.6,
  });

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count; // offset from banners
    const x = Math.cos(a) * RIM_R;
    const z = Math.sin(a) * RIM_R;

    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.position.set(x, RIM_Y + 0.4, z);
    scene.add(bowl);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flameTex,
        color: 0xffaa44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    );
    sprite.scale.set(1.6, 2.2, 1);
    sprite.position.set(x, RIM_Y + 1.6, z);
    scene.add(sprite);

    let light = null;
    if (!isTouch) {
      light = new THREE.PointLight(0xff8830, 3, 14, 2); // cheap: short range, decay 2
      light.position.set(x, RIM_Y + 1.8, z);
      scene.add(light);
    }

    state.torches.push({
      sprite,
      light,
      baseScale: 1.6,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

// ---------------------------------------------------------------------------
// fireworks (pooled sprites)
// ---------------------------------------------------------------------------
let fireworkTex = null;

function getFireworkSprite() {
  if (state.pool.length > 0) {
    const s = state.pool.pop();
    s.visible = true;
    return s;
  }
  if (state.poolAll.length >= FIREWORK_SPRITE_CAP) return null;
  if (!fireworkTex) {
    fireworkTex = makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0.6)");
  }
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: fireworkTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  state.poolAll.push(s);
  state.scene.add(s);
  return s;
}

function releaseSprite(s) {
  s.visible = false;
  state.pool.push(s);
}

const FIREWORK_COLORS = [0xff4444, 0x44aaff, 0xffd24a, 0x66ff88, 0xff66dd, 0x9d7dff];

function burst(position, color) {
  const n = 30 + Math.floor(Math.random() * 11); // 30-40
  for (let i = 0; i < n; i++) {
    const s = getFireworkSprite();
    if (!s) return; // pool exhausted, skip remainder
    s.material.color.setHex(color);
    s.material.opacity = 1;
    s.scale.set(0.9, 0.9, 1);
    s.position.copy(position);
    // uniform-ish sphere direction
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const speed = 6 + Math.random() * 5;
    state.particles.push({
      sprite: s,
      vel: new THREE.Vector3(r * Math.cos(t) * speed, u * speed, r * Math.sin(t) * speed),
      life: 0,
      maxLife: 1.4 + Math.random() * 0.8,
    });
  }
}

function updateFireworks(dt) {
  // rockets
  for (let i = state.rockets.length - 1; i >= 0; i--) {
    const rk = state.rockets[i];
    rk.sprite.position.addScaledVector(rk.vel, dt);
    if (rk.sprite.position.y >= rk.burstY) {
      burst(rk.sprite.position, rk.color);
      releaseSprite(rk.sprite);
      state.rockets.splice(i, 1);
    }
  }
  // burst particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      releaseSprite(p.sprite);
      state.particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 7 * dt; // gentle gravity
    p.vel.multiplyScalar(1 - 0.9 * dt); // drag
    p.sprite.position.addScaledVector(p.vel, dt);
    const k = 1 - p.life / p.maxLife;
    p.sprite.material.opacity = k;
    const sc = 0.5 + k * 0.7;
    p.sprite.scale.set(sc, sc, 1);
  }
}

// ---------------------------------------------------------------------------
// exports
// ---------------------------------------------------------------------------
export function initEnvironment(scene, terrainHeight, isTouch) {
  state.scene = scene;
  state.isTouch = !!isTouch;
  buildBanners(scene);
  buildJumbotrons(scene);
  buildBlimp(scene);
  buildTorches(scene, state.isTouch);
}

export function updateEnvironment(dt, time) {
  state.time = time;
  const d = Math.min(dt || 0.016, 0.1);

  // banners — pivot at the pole, lazy sine wave plus a slight twist
  for (const b of state.banners) {
    const w = Math.sin(time * b.speed + b.phase);
    b.mesh.rotation.z = w * 0.16;
    b.mesh.rotation.x = Math.sin(time * b.speed * 0.7 + b.phase * 1.3) * 0.08;
  }

  // jumbotrons — subtle electric shimmer (stays near 1.8, always blooming)
  for (const j of state.jumbotrons) {
    j.screenMat.emissiveIntensity =
      j.baseIntensity + Math.sin(time * 9 + j.phase) * 0.12;
  }

  // blimp — drift around its circle, nose along the path, gentle bob
  if (state.blimp) {
    const bl = state.blimp;
    bl.angle += bl.speed * d;
    const x = Math.cos(bl.angle) * bl.radius;
    const z = Math.sin(bl.angle) * bl.radius;
    bl.group.position.set(x, bl.height + Math.sin(time * 0.4) * 1.5, z);
    bl.group.rotation.y = -bl.angle; // hull +x axis points along the tangent
    bl.bannerMat.emissiveIntensity = 1.6 + Math.sin(time * 2.2) * 0.2;
  }

  // torches — flicker scale, opacity, and light intensity
  for (const t of state.torches) {
    const f =
      Math.sin(time * 11 + t.phase) * 0.3 +
      Math.sin(time * 23 + t.phase * 2.7) * 0.18;
    const s = t.baseScale * (1 + f * 0.25);
    t.sprite.scale.set(s, s * 1.4, 1);
    t.sprite.material.opacity = 0.8 + f * 0.2;
    if (t.light) t.light.intensity = 3 + f * 1.2;
  }

  updateFireworks(d);
}

export function launchFireworks(center) {
  const c = center || new THREE.Vector3();
  const n = 4 + Math.floor(Math.random() * 3); // 4-6 rockets
  for (let i = 0; i < n; i++) {
    const s = getFireworkSprite();
    if (!s) return;
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    s.material.color.setHex(0xfff2cc); // bright rising ember
    s.material.opacity = 1;
    s.scale.set(0.7, 1.1, 1);
    // launch from the stands rim ring
    const a = Math.random() * Math.PI * 2;
    const r = 52 + Math.random() * 14;
    s.position.set(c.x + Math.cos(a) * r, 18, c.z + Math.sin(a) * r);
    // aim slightly inward as it climbs
    const inward = new THREE.Vector3(c.x - s.position.x, 0, c.z - s.position.z)
      .normalize()
      .multiplyScalar(3 + Math.random() * 3);
    state.rockets.push({
      sprite: s,
      vel: new THREE.Vector3(inward.x, 16 + Math.random() * 6, inward.z),
      burstY: 25 + Math.random() * 15,
      color,
    });
  }
}
