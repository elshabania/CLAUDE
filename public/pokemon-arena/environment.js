// environment.js — Pokémon Arena 3D
// Pokkén-style stadium at origin + procedural outdoor world.
// export function buildEnvironment({ scene, quality })
//   -> { update(dt, t, playerPos), arenaRadius, getGroundHeight(x, z) }
// All textures are <canvas>-generated; geometry is procedural. No external assets.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tunables / world constants
// ---------------------------------------------------------------------------
const ARENA_RADIUS = 40;          // playable flat radius
const FLAT_RADIUS = ARENA_RADIUS + 10; // terrain stays flat (h=0) inside this
const TERRAIN_SIZE = 560;         // outdoor terrain extent (square)
const MOUNTAIN_RING = 60;         // peak height of the encircling mountains

// Lakes (carved basins): { x, z, r, depth }
const LAKES = [
  { x: -150, z: -120, r: 34, depth: 7 },
  { x: 165, z: -40, r: 28, depth: 6 },
  { x: 40, z: 200, r: 40, depth: 8 },
];

// Forest groves placed on the terrain (sampled via h)
const GROVES = [
  { x: -120, z: 110, r: 46, kind: 'mix' },
  { x: 130, z: 120, r: 40, kind: 'pine' },
  { x: -170, z: -30, r: 38, kind: 'broad' },
  { x: 110, z: -150, r: 44, kind: 'mix' },
  { x: -30, z: -190, r: 36, kind: 'pine' },
];

// ---------------------------------------------------------------------------
// Quality defaults (guard against missing fields)
// ---------------------------------------------------------------------------
function resolveQuality(q) {
  q = q || {};
  return {
    tier: q.tier || 'high',
    isMobile: !!q.isMobile,
    crowdCount: (q.crowdCount | 0) || 2200,
    grassCount: (q.grassCount | 0) || 9000,
    cloudCount: (q.cloudCount | 0) || 26,
    shadowMapSize: q.shadowMapSize || 2048,
    bloom: q.bloom !== false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helper (stable layout per build)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Terrain height function h(x,z) — sampled by both mesh and getGroundHeight
// ---------------------------------------------------------------------------
function baseHeight(x, z) {
  // Rolling ground: a few sines/ridges.
  let h = 0;
  h += Math.sin(x * 0.018 + 0.5) * Math.cos(z * 0.021) * 5.5;
  h += Math.sin(x * 0.041 - z * 0.03) * 2.6;
  h += Math.cos(z * 0.06 + 1.3) * 1.6;
  // Ridge lines (abs of sine) for a more mountainous feel away from center.
  h += (1.0 - Math.abs(Math.sin(x * 0.012 + z * 0.009))) * 3.0;
  return h;
}

function heightAt(x, z) {
  const dist = Math.sqrt(x * x + z * z);

  // Flat playable zone, smoothly blending into rolling terrain.
  const flatBlend = smoothstep(FLAT_RADIUS, FLAT_RADIUS + 70, dist);
  let h = baseHeight(x, z) * flatBlend;

  // Mountain ring at the terrain edge.
  const edge = TERRAIN_SIZE * 0.5;
  const ringStart = edge - 150;
  const ring = smoothstep(ringStart, edge - 8, dist);
  // Add jagged variation to the ring so it reads as peaks, not a wall.
  const jag = 0.55 + 0.45 * Math.sin(Math.atan2(z, x) * 7.0 + dist * 0.03);
  h += ring * MOUNTAIN_RING * jag;

  // Carve lake basins (radial depression so water sits naturally).
  for (let i = 0; i < LAKES.length; i++) {
    const L = LAKES[i];
    const dx = x - L.x, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < L.r * 1.4) {
      const k = smoothstep(L.r * 1.4, L.r * 0.15, d); // 0 at rim -> 1 at center
      h -= L.depth * k;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Canvas texture helpers
// ---------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function addNoise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    if (alpha != null) d[i + 3] = Math.min(255, d[i + 3] * alpha);
  }
  ctx.putImageData(img, 0, 0);
}

// Turf disc: striped two-tone radial turf, painted rings + center emblem.
function makeTurfTexture() {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const cx = S / 2, cy = S / 2;

  // Base grass green.
  ctx.fillStyle = '#1f6b2e';
  ctx.fillRect(0, 0, S, S);

  // Two-tone radial mow stripes (wedges).
  const wedges = 28;
  for (let i = 0; i < wedges; i++) {
    ctx.fillStyle = (i % 2 === 0) ? '#23793a' : '#1c5f2a';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, S * 0.7, (i / wedges) * Math.PI * 2, ((i + 1) / wedges) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  // Concentric mow rings (alternating brightness).
  for (let r = 40; r < cx; r += 46) {
    ctx.strokeStyle = ((r / 46) | 0) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Painted boundary rings.
  ctx.strokeStyle = 'rgba(245,245,245,0.85)';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(cx, cy, cx * 0.94, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255,210,70,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, cx * 0.62, 0, Math.PI * 2); ctx.stroke();

  // Center emblem: glowing flame-crown disc.
  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 150);
  g.addColorStop(0, 'rgba(255,180,60,0.95)');
  g.addColorStop(0.5, 'rgba(220,90,30,0.55)');
  g.addColorStop(1, 'rgba(120,30,10,0.0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 150, 0, Math.PI * 2); ctx.fill();

  // Crown spikes.
  ctx.fillStyle = '#ffd24a';
  const spikes = 8;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-16, -70);
    ctx.lineTo(0, -120);
    ctx.lineTo(16, -70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Emblem text.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EMBER', cx, cy - 14);
  ctx.fillText('CROWN', cx, cy + 30);

  // Grain.
  addNoise(ctx, S, S, 22);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Ad-band wall: scrolling emissive sponsor canvas (invented brands).
function makeAdBandTexture() {
  const W = 2048, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(0, 0, W, H);

  const brands = [
    ['PIKAVOLT', '#ffe24a'], ['AQUACELL', '#4ad0ff'], ['EMBERTECH', '#ff7a3c'],
    ['LEAFLINE', '#7cff6a'], ['STONECORP', '#caa46a'], ['NIMBUS AIR', '#a0c4ff'],
    ['HYPERDYNE', '#ff5ec8'], ['ZAPMART', '#ffd24a'], ['TERRAFORGE', '#ff9b4a'],
    ['VOLTNET', '#9affef'],
  ];
  const slot = W / brands.length;
  for (let i = 0; i < brands.length; i++) {
    const [name, col] = brands[i];
    const x = i * slot;
    // Panel glow.
    const g = ctx.createLinearGradient(x, 0, x, H);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.5, col + '');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = col;
    ctx.fillRect(x + 6, 30, slot - 12, H - 60);
    ctx.globalAlpha = 1;
    // Glow text.
    ctx.shadowColor = col;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + slot / 2, H / 2);
    ctx.shadowBlur = 0;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  return tex;
}

// Terrain detail: grass/dirt mottling tiled across the world.
function makeTerrainDetailTexture() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a6b2e';
  ctx.fillRect(0, 0, S, S);
  // Mottled patches.
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 3 + Math.random() * 22;
    const tone = Math.random();
    if (tone < 0.4) ctx.fillStyle = 'rgba(70,110,50,0.5)';
    else if (tone < 0.7) ctx.fillStyle = 'rgba(40,80,34,0.5)';
    else if (tone < 0.88) ctx.fillStyle = 'rgba(110,90,55,0.45)'; // dirt
    else ctx.fillStyle = 'rgba(150,160,90,0.35)'; // dry
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  addNoise(ctx, S, S, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Jumbotron canvas (repainted in update).
function makeJumbotron() {
  const W = 512, H = 288;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  return { canvas: c, ctx, tex, W, H };
}

function paintJumbotron(jb, t) {
  const { ctx, W, H } = jb;
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, W, H);
  // Scanline backdrop.
  ctx.fillStyle = 'rgba(20,40,80,0.4)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

  // Title.
  ctx.fillStyle = '#ffcf4a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff8a30';
  ctx.shadowBlur = 18;
  ctx.fillText('EMBER CROWN', W / 2, 50);
  ctx.fillText('GRAND PRIX', W / 2, 86);
  ctx.shadowBlur = 0;

  // Round ticker.
  const round = 1 + (Math.floor(t * 0.2) % 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('ROUND ' + round + ' / 16', W / 2, 140);

  // Pulsing VS / live bar.
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.fillStyle = `rgba(255,${Math.floor(80 + 120 * pulse)},60,1)`;
  ctx.fillRect(60, 180, W - 120, 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('• LIVE •', W / 2, 202);

  // Scrolling sponsor strip.
  ctx.fillStyle = '#10203a';
  ctx.fillRect(0, H - 44, W, 44);
  ctx.fillStyle = '#7fe0ff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  const msg = 'PIKAVOLT  •  EMBERTECH  •  AQUACELL  •  HYPERDYNE  •  ';
  const off = (t * 80) % (msg.length * 13);
  ctx.fillText(msg + msg, 40 - off, H - 14);

  jb.tex.needsUpdate = true;
}

// Soft radial puff sprite for clouds.
function makePuffTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(245,248,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Fire sprite (brazier particles).
function makeFireTexture() {
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.35, 'rgba(255,150,40,0.9)');
  g.addColorStop(0.7, 'rgba(200,50,10,0.5)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Bark / leaf textures for trees.
function makeBarkTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a3c22';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 6) {
    ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${20 + Math.random() * 20},10,0.5)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(i + (Math.random() - 0.5) * 6, 0);
    ctx.lineTo(i + (Math.random() - 0.5) * 6, S);
    ctx.stroke();
  }
  addNoise(ctx, S, S, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Banner / flag texture.
function makeBannerTexture(idx) {
  const W = 256, H = 384;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const cols = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d68910', '#16a085'];
  const col = cols[idx % cols.length];
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, W, H);
  // Diagonal stripes.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 14;
  for (let x = -H; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
  }
  // Emblem disc.
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(W / 2, H * 0.4, 56, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col;
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', W / 2, H * 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------
export function buildEnvironment({ scene, quality }) {
  const Q = resolveQuality(quality);
  const rng = mulberry32(0xA17EE);
  const castTrees = (Q.tier === 'high' || Q.tier === 'medium');

  const root = new THREE.Group();
  root.name = 'environment';
  scene.add(root);

  // Per-frame updaters registered by each subsystem.
  const updaters = [];

  // ======================================================================
  // 1. TURF DISC
  // ======================================================================
  {
    const turfTex = makeTurfTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: turfTex, roughness: 0.92, metalness: 0.0,
    });
    mat.userData.baseEmissive = mat.emissive.clone();
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
    const geo = new THREE.CircleGeometry(ARENA_RADIUS, 96);
    const turf = new THREE.Mesh(geo, mat);
    turf.rotation.x = -Math.PI / 2;
    turf.position.y = 0.02;
    turf.receiveShadow = true;
    root.add(turf);

    // Subtle raised lip / kerb around the turf.
    const kerb = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS + 0.4, 0.6, 8, 96),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 })
    );
    kerb.rotation.x = -Math.PI / 2;
    kerb.position.y = 0.2;
    kerb.receiveShadow = true;
    root.add(kerb);
  }

  // ======================================================================
  // 2. AD-BAND WALL (scrolling emissive sponsor canvas)
  // ======================================================================
  let adMat;
  {
    const adTex = makeAdBandTexture();
    adMat = new THREE.MeshStandardMaterial({
      map: adTex, emissive: 0xffffff, emissiveMap: adTex,
      emissiveIntensity: 1.1, roughness: 0.5, metalness: 0.1,
      side: THREE.DoubleSide,
    });
    adMat.userData.baseEmissive = adMat.emissive.clone();
    adMat.userData.baseEmissiveIntensity = adMat.emissiveIntensity;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 1.5, ARENA_RADIUS + 1.5, 3.0, 96, 1, true),
      adMat
    );
    wall.position.y = 1.5;
    root.add(wall);

    updaters.push((dt) => { adTex.offset.x = (adTex.offset.x + dt * 0.06) % 1; });
  }

  // ======================================================================
  // 3. CROWD BOWL: tiered stands + InstancedMesh crowd
  // ======================================================================
  const BOWL_INNER = ARENA_RADIUS + 4;
  const TIERS = 9;
  const TIER_STEP_R = 2.4;
  const TIER_STEP_H = 1.5;
  {
    // Tiered concrete stands (stacked thin cylinders = steps).
    const standMat = new THREE.MeshStandardMaterial({ color: 0x6c6f78, roughness: 0.9 });
    for (let i = 0; i < TIERS; i++) {
      const r = BOWL_INNER + i * TIER_STEP_R;
      const step = new THREE.Mesh(
        new THREE.CylinderGeometry(r + TIER_STEP_R, r, 0.6, 80, 1, true),
        standMat
      );
      step.position.y = 0.3 + i * TIER_STEP_H;
      step.receiveShadow = true;
      root.add(step);
    }
    // Outer bowl shell.
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(
        BOWL_INNER + TIERS * TIER_STEP_R + 3,
        BOWL_INNER + 2,
        TIERS * TIER_STEP_H + 4, 80, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.95, side: THREE.BackSide })
    );
    shell.position.y = (TIERS * TIER_STEP_H + 4) / 2;
    root.add(shell);
  }

  // Crowd instances.
  let crowdMesh = null;
  const crowdData = []; // { baseY, phase, height }
  {
    const count = Q.crowdCount;
    const personGeo = new THREE.CapsuleGeometry(0.32, 0.5, 3, 6);
    const personMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    personMat.userData.baseEmissive = personMat.emissive.clone();
    personMat.userData.baseEmissiveIntensity = personMat.emissiveIntensity;
    crowdMesh = new THREE.InstancedMesh(personGeo, personMat, count);
    crowdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    const center = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const tier = Math.floor(rng() * TIERS);
      const r = BOWL_INNER + 1.0 + tier * TIER_STEP_R + rng() * (TIER_STEP_R - 0.6);
      const a = rng() * Math.PI * 2;
      const y = 0.9 + tier * TIER_STEP_H + rng() * 0.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.set(x, y, z);
      // Face the arena center.
      center.set(0, y, 0);
      const dir = Math.atan2(center.x - x, center.z - z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dir);
      const s = 0.85 + rng() * 0.4;
      scl.set(s, s, s);
      m.compose(pos, quat, scl);
      crowdMesh.setMatrixAt(i, m);

      // Bright, varied shirt colors.
      color.setHSL(rng(), 0.55 + rng() * 0.35, 0.45 + rng() * 0.2);
      crowdMesh.setColorAt(i, color);

      crowdData.push({ baseY: y, phase: rng() * Math.PI * 2, angle: a, x, z, scl: s, dir });
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
    crowdMesh.frustumCulled = false;
    root.add(crowdMesh);

    // Animate: per-instance bounce + traveling stadium wave.
    // Only refresh ~1/8 of instances per frame to stay cheap.
    const mm = new THREE.Matrix4();
    const pp = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const ss = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    let cursor = 0;
    const chunk = Math.max(1, Math.ceil(count / 8));

    updaters.push((dt, t) => {
      for (let k = 0; k < chunk; k++) {
        const i = (cursor + k) % count;
        const d = crowdData[i];
        // Individual idle bounce.
        let bounce = Math.sin(t * 3.0 + d.phase) * 0.06;
        // Traveling wave: a band of raised arms sweeping around the ring.
        const wavePhase = (d.angle - t * 1.4);
        const waveBand = Math.cos(wavePhase);
        const wave = waveBand > 0.86 ? (waveBand - 0.86) / 0.14 : 0;
        bounce += wave * 0.7;
        pp.set(d.x, d.baseY + bounce, d.z);
        qq.setFromAxisAngle(yAxis, d.dir);
        const stretch = 1 + wave * 0.35;
        ss.set(d.scl, d.scl * stretch, d.scl);
        mm.compose(pp, qq, ss);
        crowdMesh.setMatrixAt(i, mm);
      }
      cursor = (cursor + chunk) % count;
      crowdMesh.instanceMatrix.needsUpdate = true;
    });
  }

  // ======================================================================
  // 4. JUMBOTRONS (4) — repaint ~3x/sec
  // ======================================================================
  {
    const jbs = [];
    const topY = TIERS * TIER_STEP_H + 6;
    const ringR = BOWL_INNER + TIERS * TIER_STEP_R + 1;
    for (let i = 0; i < 4; i++) {
      const jb = makeJumbotron();
      paintJumbotron(jb, 0);
      const mat = new THREE.MeshStandardMaterial({
        map: jb.tex, emissive: 0xffffff, emissiveMap: jb.tex,
        emissiveIntensity: 1.0, roughness: 0.4,
      });
      mat.userData.baseEmissive = mat.emissive.clone();
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.2), mat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      screen.position.set(Math.cos(a) * ringR, topY, Math.sin(a) * ringR);
      screen.lookAt(0, topY - 2, 0);
      // Support frame.
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(12, 7.2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.7 })
      );
      frame.position.copy(screen.position);
      frame.quaternion.copy(screen.quaternion);
      frame.translateZ(-0.3);
      root.add(frame);
      root.add(screen);
      jbs.push(jb);
    }
    let acc = 0;
    updaters.push((dt, t) => {
      acc += dt;
      if (acc >= 1 / 3) { // ~3x per second
        acc = 0;
        for (let i = 0; i < jbs.length; i++) paintJumbotron(jbs[i], t);
      }
    });
  }

  // ======================================================================
  // 5. BANNERS / FLAGS (vertex-waved)
  // ======================================================================
  {
    const flags = [];
    const ringR = BOWL_INNER + 1.5;
    const NF = 16;
    for (let i = 0; i < NF; i++) {
      const a = (i / NF) * Math.PI * 2;
      // Pole.
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
      );
      pole.position.set(Math.cos(a) * ringR, 3 + TIERS * TIER_STEP_H * 0.0, Math.sin(a) * ringR);
      root.add(pole);
      // Banner.
      const geo = new THREE.PlaneGeometry(1.6, 2.4, 8, 6);
      geo.userData.base = geo.attributes.position.array.slice();
      const mat = new THREE.MeshStandardMaterial({
        map: makeBannerTexture(i), side: THREE.DoubleSide, roughness: 0.8,
      });
      const flag = new THREE.Mesh(geo, mat);
      flag.position.set(
        Math.cos(a) * ringR + Math.cos(a) * 0.9,
        4.5, Math.sin(a) * ringR + Math.sin(a) * 0.9
      );
      flag.lookAt(0, 4.5, 0);
      root.add(flag);
      flags.push({ geo, phase: i * 0.7 });
    }
    updaters.push((dt, t) => {
      for (let f = 0; f < flags.length; f++) {
        const { geo, phase } = flags[f];
        const pos = geo.attributes.position;
        const base = geo.userData.base;
        for (let v = 0; v < pos.count; v++) {
          const bx = base[v * 3], by = base[v * 3 + 1];
          const wav = Math.sin(t * 4 + bx * 2.5 + phase) * 0.18 * (bx + 0.8);
          pos.setZ(v, wav);
          pos.setX(v, bx + Math.sin(t * 3 + by + phase) * 0.04);
        }
        pos.needsUpdate = true;
      }
    });
  }

  // ======================================================================
  // 6. FLOODLIGHT PYLONS with additive glow cones
  // ======================================================================
  {
    const pylonR = BOWL_INNER + TIERS * TIER_STEP_R + 8;
    const topY = TIERS * TIER_STEP_H + 14;
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff3c0, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * pylonR, pz = Math.sin(a) * pylonR;
      // Mast.
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.6, topY, 8),
        new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.8 })
      );
      mast.position.set(px, topY / 2, pz);
      root.add(mast);
      // Lamp bank.
      const bank = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2.2, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0x111111, emissive: 0xfff2c0, emissiveIntensity: 1.4, roughness: 0.4,
        })
      );
      bank.position.set(px, topY, pz);
      bank.lookAt(0, 6, 0);
      root.add(bank);
      // Additive light cone aimed at arena.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(14, topY * 1.2, 20, 1, true), coneMat);
      cone.position.set(px * 0.5, topY * 0.55, pz * 0.5);
      // Orient cone tip toward bank, base toward arena floor.
      const dir = new THREE.Vector3(0, 6, 0).sub(new THREE.Vector3(px, topY, pz)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      cone.quaternion.copy(q);
      root.add(cone);
    }
  }

  // ======================================================================
  // 7. TORCH BRAZIERS (6) with sprite-particle fire
  // ======================================================================
  {
    const fireTex = makeFireTexture();
    const braziers = [];
    const NB = 6;
    const brR = ARENA_RADIUS - 2;
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * Math.PI * 2 + Math.PI / NB;
      const bx = Math.cos(a) * brR, bz = Math.sin(a) * brR;
      // Bowl + stand.
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.5, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x33363d, metalness: 0.7, roughness: 0.5 })
      );
      stand.position.set(bx, 1.2, bz);
      stand.castShadow = true;
      root.add(stand);
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.5, 0.7, 10),
        new THREE.MeshStandardMaterial({
          color: 0x22242a, metalness: 0.7, roughness: 0.5,
          emissive: 0xff5a18, emissiveIntensity: 0.8,
        })
      );
      bowl.position.set(bx, 2.6, bz);
      root.add(bowl);

      // Point light for the flame.
      const light = new THREE.PointLight(0xff7a2a, 6, 16, 2);
      light.position.set(bx, 3.4, bz);
      root.add(light);

      // Particle sprites.
      const N = 14;
      const grp = new THREE.Group();
      grp.position.set(bx, 2.9, bz);
      const parts = [];
      for (let p = 0; p < N; p++) {
        const sm = new THREE.SpriteMaterial({
          map: fireTex, color: 0xffffff, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
        });
        const sp = new THREE.Sprite(sm);
        const seed = rng();
        sp.userData = {
          t: rng(), speed: 0.7 + rng() * 0.8,
          rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5, seed,
        };
        grp.add(sp);
        parts.push(sp);
      }
      root.add(grp);
      braziers.push({ parts, light, phase: i });
    }
    updaters.push((dt, t) => {
      for (let b = 0; b < braziers.length; b++) {
        const { parts, light, phase } = braziers[b];
        for (let p = 0; p < parts.length; p++) {
          const sp = parts[p];
          const u = sp.userData;
          u.t += dt * u.speed;
          if (u.t > 1) u.t -= 1;
          const life = u.t;
          const y = life * 2.4;
          const spread = 0.4 * (0.3 + life);
          sp.position.set(u.rx * spread, y, u.rz * spread);
          const s = (1 - life) * 1.1 + 0.25;
          sp.scale.set(s, s, s);
          sp.material.opacity = (1 - life) * 0.9;
        }
        light.intensity = 5 + Math.sin(t * 14 + phase) * 1.6 + Math.sin(t * 31 + phase) * 0.8;
      }
    });
  }

  // ======================================================================
  // 8. BLIMP orbiting with searchlight cone
  // ======================================================================
  {
    const blimp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(7, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xdde3ee, roughness: 0.6, metalness: 0.1 })
    );
    body.scale.set(2.2, 1, 1);
    blimp.add(body);
    // Fins.
    const finMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
    for (let f = 0; f < 3; f++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.3), finMat);
      const fa = (f / 3) * Math.PI * 2;
      fin.position.set(-13, Math.cos(fa) * 4, Math.sin(fa) * 4);
      fin.rotation.x = fa;
      blimp.add(fin);
    }
    // Gondola.
    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.6, 2),
      new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.7 })
    );
    gondola.position.y = -7;
    blimp.add(gondola);
    // Side ad text.
    const adTex = makeBannerTexture(2);
    const ad = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 6),
      new THREE.MeshStandardMaterial({
        map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      })
    );
    ad.position.set(0, 0, 7.2);
    blimp.add(ad);

    // Searchlight cone (additive).
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(10, 80, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff4c8, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.y = -7;
    blimp.add(beam);

    blimp.position.set(0, 90, 0);
    root.add(blimp);

    updaters.push((dt, t) => {
      const a = t * 0.08;
      const R = 120;
      blimp.position.set(Math.cos(a) * R, 90 + Math.sin(t * 0.2) * 3, Math.sin(a) * R);
      // Face travel direction (tangent).
      blimp.rotation.y = -a + Math.PI / 2;
      // Sweep the searchlight.
      const sweep = Math.sin(t * 0.6) * 0.5;
      beam.rotation.z = Math.PI + sweep; // point cone downward, swaying
      beam.rotation.x = sweep * 0.6;
    });
  }

  // ======================================================================
  // 9. OUTDOOR TERRAIN (heightfield)
  // ======================================================================
  let terrainGeo;
  {
    const SEG = 180;
    terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
    }
    pos.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    const detailTex = makeTerrainDetailTexture();
    const terrainMat = new THREE.MeshStandardMaterial({
      map: detailTex, roughness: 1.0, metalness: 0.0,
    });
    terrainMat.userData.baseEmissive = terrainMat.emissive.clone();
    terrainMat.userData.baseEmissiveIntensity = terrainMat.emissiveIntensity;
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.position.y = -0.05;
    terrain.receiveShadow = true;
    root.add(terrain);
  }

  // ======================================================================
  // 10. WIND-SWAYING INSTANCED GRASS (outside stadium only)
  // ======================================================================
  let grassMat = null;
  {
    const count = Q.grassCount;
    const bladeGeo = new THREE.PlaneGeometry(0.18, 1.0, 1, 3);
    bladeGeo.translate(0, 0.5, 0); // pivot at base
    grassMat = new THREE.MeshStandardMaterial({
      color: 0x4a7a32, roughness: 0.9, side: THREE.DoubleSide,
      alphaTest: 0.3,
    });
    grassMat.userData.baseEmissive = grassMat.emissive.clone();
    grassMat.userData.baseEmissiveIntensity = grassMat.emissiveIntensity;

    // Inject a time uniform; bend by blade height.
    grassMat.userData.uTime = { value: 0 };
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = grassMat.userData.uTime;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float bladeH = clamp(position.y, 0.0, 1.0);
           vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
           float ph = wp.x * 0.15 + wp.z * 0.15;
           float sway = sin(uTime * 1.8 + ph) * 0.35 + sin(uTime * 3.1 + ph * 1.7) * 0.12;
           transformed.x += sway * bladeH * bladeH;
           transformed.z += cos(uTime * 1.3 + ph) * 0.12 * bladeH * bladeH;`
        );
    };

    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, count);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const half = TERRAIN_SIZE * 0.5 - 20;
    let placed = 0, attempts = 0;
    while (placed < count && attempts < count * 6) {
      attempts++;
      const x = (rng() * 2 - 1) * half;
      const z = (rng() * 2 - 1) * half;
      const d = Math.sqrt(x * x + z * z);
      if (d < FLAT_RADIUS + 4) continue; // stadium only outside
      // Avoid lakes.
      let inLake = false;
      for (let l = 0; l < LAKES.length; l++) {
        const L = LAKES[l];
        if ((x - L.x) ** 2 + (z - L.z) ** 2 < (L.r * 1.05) ** 2) { inLake = true; break; }
      }
      if (inLake) continue;
      const y = heightAt(x, z);
      p.set(x, y, z);
      q.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
      const sc = 0.6 + rng() * 1.1;
      s.set(0.8 + rng() * 0.6, sc, 1);
      m.compose(p, q, s);
      grass.setMatrixAt(placed, m);
      color.setHSL(0.27 + rng() * 0.08, 0.5, 0.32 + rng() * 0.12);
      grass.setColorAt(placed, color);
      placed++;
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.frustumCulled = false;
    grass.castShadow = false;
    grass.receiveShadow = false;
    root.add(grass);

    updaters.push((dt, t) => { grassMat.userData.uTime.value = t; });
  }

  // ======================================================================
  // 11. FORESTS: instanced pines + broadleaf placed on terrain
  // ======================================================================
  {
    const barkTex = makeBarkTexture();
    // Estimate capacity.
    const PINE_MAX = 1200, BROAD_MAX = 1000;

    // Pine: trunk + stacked cones merged into one geometry via groups not needed;
    // use a single cone cluster geometry for instancing.
    const pineGeo = (() => {
      const geos = [];
      const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6);
      trunk.translate(0, 0.8, 0);
      geos.push({ geo: trunk, mat: 0 });
      const cone1 = new THREE.ConeGeometry(1.5, 2.2, 8); cone1.translate(0, 2.3, 0);
      const cone2 = new THREE.ConeGeometry(1.1, 1.9, 8); cone2.translate(0, 3.4, 0);
      const cone3 = new THREE.ConeGeometry(0.7, 1.5, 8); cone3.translate(0, 4.4, 0);
      return { trunk, cones: [cone1, cone2, cone3] };
    })();

    // We make two InstancedMeshes for pines: trunks and foliage (merged cones).
    const mergeCones = mergeGeometries([pineGeo.cones[0], pineGeo.cones[1], pineGeo.cones[2]]);

    const pineTrunkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x6b4a2c, roughness: 0.95 });
    const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x265c30, roughness: 0.9 });
    const broadTrunkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0x7a5630, roughness: 0.95 });
    const broadLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f8b3a, roughness: 0.85 });
    [pineLeafMat, broadLeafMat, pineTrunkMat, broadTrunkMat].forEach((mt) => {
      mt.userData.baseEmissive = mt.emissive.clone();
      mt.userData.baseEmissiveIntensity = mt.emissiveIntensity;
    });

    // Broadleaf: trunk + sphere canopy.
    const broadTrunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6);
    broadTrunkGeo.translate(0, 1.1, 0);
    const broadCanopyGeo = new THREE.IcosahedronGeometry(1.8, 1);
    broadCanopyGeo.translate(0, 3.2, 0);

    // Gather positions per grove.
    const pinePts = [];
    const broadPts = [];
    for (let g = 0; g < GROVES.length; g++) {
      const G = GROVES[g];
      const density = Math.floor((G.r * G.r) * 0.10);
      for (let i = 0; i < density; i++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * G.r;
        const x = G.x + Math.cos(a) * rr;
        const z = G.z + Math.sin(a) * rr;
        const d = Math.sqrt(x * x + z * z);
        if (d < FLAT_RADIUS + 6) continue;
        // Skip lakes.
        let inLake = false;
        for (let l = 0; l < LAKES.length; l++) {
          const L = LAKES[l];
          if ((x - L.x) ** 2 + (z - L.z) ** 2 < (L.r * 1.1) ** 2) { inLake = true; break; }
        }
        if (inLake) continue;
        const y = heightAt(x, z);
        const pine = G.kind === 'pine' ? true : G.kind === 'broad' ? false : rng() < 0.55;
        const entry = { x, y, z, s: 0.8 + rng() * 0.9, rot: rng() * Math.PI * 2 };
        if (pine) pinePts.push(entry); else broadPts.push(entry);
      }
    }

    function buildInstanced(geo, mat, pts, max) {
      const n = Math.min(pts.length, max);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < n; i++) {
        const e = pts[i];
        p.set(e.x, e.y, e.z);
        q.setFromAxisAngle(yAxis, e.rot);
        s.set(e.s, e.s, e.s);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = castTrees;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      return inst;
    }

    // Pines (two instanced meshes: trunk + foliage share same transforms).
    root.add(buildInstanced(pineGeo.trunk, pineTrunkMat, pinePts, PINE_MAX));
    root.add(buildInstanced(mergeCones, pineLeafMat, pinePts, PINE_MAX));
    // Broadleaf (trunk + canopy).
    root.add(buildInstanced(broadTrunkGeo, broadTrunkMat, broadPts, BROAD_MAX));
    root.add(buildInstanced(broadCanopyGeo, broadLeafMat, broadPts, BROAD_MAX));
  }

  // ======================================================================
  // 12. LAKES (shimmering semi-transparent planes in carved basins)
  // ======================================================================
  {
    const lakeMeshes = [];
    for (let i = 0; i < LAKES.length; i++) {
      const L = LAKES[i];
      const geo = new THREE.CircleGeometry(L.r, 48);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a6f9e, transparent: true, opacity: 0.78,
        roughness: 0.15, metalness: 0.5,
        emissive: 0x0a2030, emissiveIntensity: 0.3,
      });
      mat.userData.baseEmissive = mat.emissive.clone();
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
      const water = new THREE.Mesh(geo, mat);
      // Water level near basin floor + small offset.
      const wy = heightAt(L.x, L.z) + L.depth * 0.45;
      water.position.set(L.x, wy, L.z);
      water.userData.geo = geo;
      water.userData.base = geo.attributes.position.array.slice();
      root.add(water);
      lakeMeshes.push(water);
    }
    updaters.push((dt, t) => {
      for (let i = 0; i < lakeMeshes.length; i++) {
        const w = lakeMeshes[i];
        const pos = w.userData.geo.attributes.position;
        const base = w.userData.base;
        for (let v = 0; v < pos.count; v++) {
          const bx = base[v * 3], bz = base[v * 3 + 2];
          pos.setY(v, Math.sin(t * 1.5 + bx * 0.3) * 0.08 + Math.cos(t * 1.1 + bz * 0.35) * 0.08);
        }
        pos.needsUpdate = true;
        w.material.opacity = 0.74 + Math.sin(t * 0.8 + i) * 0.06;
      }
    });
  }

  // ======================================================================
  // 13. CLOUD BANKS (soft radial-gradient sprite puffs, drifting)
  // ======================================================================
  {
    const puffTex = makePuffTexture();
    const clouds = [];
    const N = Q.cloudCount;
    for (let i = 0; i < N; i++) {
      const grp = new THREE.Group();
      const cx = (rng() * 2 - 1) * 260;
      const cz = (rng() * 2 - 1) * 260;
      const cy = 60 + rng() * 80; // y 60..140
      const puffs = 5 + Math.floor(rng() * 5);
      for (let p = 0; p < puffs; p++) {
        const mat = new THREE.SpriteMaterial({
          map: puffTex, color: 0xffffff, transparent: true,
          opacity: 0.5 + rng() * 0.3, depthWrite: false,
        });
        const sp = new THREE.Sprite(mat);
        sp.position.set((rng() - 0.5) * 30, (rng() - 0.5) * 8, (rng() - 0.5) * 20);
        const s = 14 + rng() * 22;
        sp.scale.set(s, s * 0.7, 1);
        grp.add(sp);
      }
      grp.position.set(cx, cy, cz);
      root.add(grp);
      clouds.push({ grp, speed: 1.5 + rng() * 2.5, dir: rng() * Math.PI * 2 });
    }
    updaters.push((dt) => {
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.grp.position.x += Math.cos(c.dir) * c.speed * dt;
        c.grp.position.z += Math.sin(c.dir) * c.speed * dt;
        if (c.grp.position.x > 320) c.grp.position.x = -320;
        if (c.grp.position.x < -320) c.grp.position.x = 320;
        if (c.grp.position.z > 320) c.grp.position.z = -320;
        if (c.grp.position.z < -320) c.grp.position.z = 320;
      }
    });
  }

  // ======================================================================
  // Public API
  // ======================================================================
  function update(dt, t, playerPos) {
    for (let i = 0; i < updaters.length; i++) updaters[i](dt, t, playerPos);
  }

  return {
    update,
    arenaRadius: ARENA_RADIUS,
    getGroundHeight(x, z) {
      const d = Math.sqrt(x * x + z * z);
      if (d <= ARENA_RADIUS) return 0;
      return heightAt(x, z);
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal geometry merge (avoids importing BufferGeometryUtils addon).
// Merges non-indexed/indexed BufferGeometries that share attributes.
// ---------------------------------------------------------------------------
function mergeGeometries(geos) {
  // Convert all to non-indexed for simple concatenation.
  const nonIndexed = geos.map((g) => g.index ? g.toNonIndexed() : g);
  const attrNames = ['position', 'normal', 'uv'];
  const merged = new THREE.BufferGeometry();
  for (let a = 0; a < attrNames.length; a++) {
    const name = attrNames[a];
    if (!nonIndexed[0].attributes[name]) continue;
    const itemSize = nonIndexed[0].attributes[name].itemSize;
    let total = 0;
    for (let i = 0; i < nonIndexed.length; i++) total += nonIndexed[i].attributes[name].count;
    const arr = new Float32Array(total * itemSize);
    let offset = 0;
    for (let i = 0; i < nonIndexed.length; i++) {
      const src = nonIndexed[i].attributes[name].array;
      arr.set(src, offset);
      offset += src.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  return merged;
}
