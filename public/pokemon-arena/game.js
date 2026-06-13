// POKÉMON ARENA 3D — Ember Crown Grand Prix
// Engine: you are ASH, directing your partner Pokémon and collecting wild ones.
import * as THREE from 'three';
import { createCharizard } from './characters/charizard.js';
import { createVenusaur } from './characters/venusaur.js';
import { createBlastoise } from './characters/blastoise.js';
import { createVoltaron } from './characters/voltaron.js';
import { createAsh, createReferee } from './characters/ash.js';
import { ENEMY_SPECIES, createEnemy } from './characters/enemies.js';
import { initLookdev } from './lookdev.js';
import { buildEnvironment } from './environment.js';
import { initAmbience } from './ambience.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { createCinematics } from './cinematics.js';
import {
  FAN_DISCLAIMER, getRoundIntro, getMilestone, getKOLine,
  getVictory, getDefeat, getTaunt,
} from './story.js';
import { detectQuality, createPerf } from './perf.js';

// ----------------------------------------------------------------------------
// Small DOM helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ----------------------------------------------------------------------------
// Data: playable species (starters) + how wild species map to playable partners
const STARTERS = {
  charizard: { factory: createCharizard, name: 'CHARIZARD', element: 'fire' },
  venusaur:  { factory: createVenusaur,  name: 'VENUSAUR',  element: 'grass' },
  blastoise: { factory: createBlastoise, name: 'BLASTOISE', element: 'water' },
  voltaron:  { factory: createVoltaron,  name: 'VOLTARON',  element: 'electric' },
};
// Starters can also appear as rare wild encounters you can catch (so you collect them all).
const STARTER_WILD = {
  charizard: { id: 'charizard', name: 'CHARIZARD', element: 'fire', flying: true, hp: 96, speed: 7.0, meleeRange: 3.6, dmgMelee: 13, dmgRanged: 11, projectileColor: 0xff6b2e, projectileSpeed: 28, starter: true },
  venusaur:  { id: 'venusaur',  name: 'VENUSAUR',  element: 'grass', flying: false, hp: 110, speed: 5.4, meleeRange: 3.4, dmgMelee: 12, dmgRanged: 10, projectileColor: 0x57d957, projectileSpeed: 24, starter: true },
  blastoise: { id: 'blastoise', name: 'BLASTOISE', element: 'water', flying: false, hp: 104, speed: 5.8, meleeRange: 3.4, dmgMelee: 12, dmgRanged: 12, projectileColor: 0x3fa8ff, projectileSpeed: 28, starter: true },
  voltaron:  { id: 'voltaron',  name: 'VOLTARON',  element: 'electric', flying: false, hp: 92, speed: 7.6, meleeRange: 3.2, dmgMelee: 13, dmgRanged: 11, projectileColor: 0xffe14d, projectileSpeed: 32, starter: true },
};
const SPECIES_BY_ID = {};
for (const s of ENEMY_SPECIES) SPECIES_BY_ID[s.id] = s;
for (const k in STARTER_WILD) SPECIES_BY_ID[k] = STARTER_WILD[k];

// Build any roster member's model + meta from a roster entry.
function buildPokemon(entry) {
  if (entry.kind === 'starter') {
    const s = STARTERS[entry.id];
    const g = s.factory();
    return { group: g, name: s.name, element: s.element };
  }
  const s = SPECIES_BY_ID[entry.id];
  const g = createEnemy(entry.id);
  return { group: g, name: s.name, element: s.element };
}

// Per-element move flavor (names + colors). Moves are mechanically shared.
const ELEM = {
  fire:     { color: 0xff6b2e, light: 0xffa050, names: ['FLAME CLAW', 'FANG STRIKE', 'FLAMETHROWER', 'FIRE BURST', 'BLAZE SPIN', 'INFERNO BEAM'] },
  grass:    { color: 0x57d957, light: 0x9bf08a, names: ['VINE RAKE', 'LEECH BITE', 'SEED STREAM', 'BLOOM BURST', 'PETAL CYCLONE', 'SOLAR BEAM'] },
  water:    { color: 0x3fa8ff, light: 0x86d0ff, names: ['AQUA CLAW', 'CHOMP', 'HYDRO STREAM', 'AQUA BURST', 'TIDAL SPIN', 'HYDRO CANNON'] },
  electric: { color: 0xffe14d, light: 0xfff29a, names: ['THUNDER CLAW', 'SHOCK BITE', 'SPARK STREAM', 'VOLT BURST', 'STORM SPIN', 'ZAP CANNON'] },
  rock:     { color: 0xc89858, light: 0xe6c79a, names: ['BOULDER FIST', 'STONE BITE', 'EMBER STREAM', 'ROCK BURST', 'QUAKE SPIN', 'METEOR BEAM'] },
};
const STATUS_BY_ELEM = { fire: 'burn', water: 'soak', grass: 'leech', electric: 'paralyze', rock: 'burn' };

// Type chart. multiplier(atk -> def)
const ADV = {
  fire:     { grass: 1.5, water: 0.65, rock: 0.65 },
  grass:    { water: 1.5, rock: 1.5, fire: 0.65 },
  water:    { fire: 1.5, rock: 1.5, grass: 0.65 },
  electric: { water: 1.5, storm: 1.5, flying: 1.5, electric: 0.65 },
  rock:     { fire: 1.5, flying: 1.5, grass: 0.65 },
};
function typeMult(atk, def) {
  const r = ADV[atk]; if (!r) return 1;
  return r[def] != null ? r[def] : 1;
}

// Moves: cooldown (s), base damage, range, kind
const MOVES = [
  { id: 1, kind: 'strike', cd: 0.0,  dmg: 16, range: 4.5 },   // 3-hit chain
  { id: 2, kind: 'bite',   cd: 2.2,  dmg: 20, range: 4.0 },   // counter
  { id: 3, kind: 'breath', cd: 4.5,  dmg: 9,  range: 16 },    // stream x6
  { id: 4, kind: 'burst',  cd: 5.5,  dmg: 24, range: 22 },    // projectile AoE
  { id: 5, kind: 'spin',   cd: 6.0,  dmg: 22, range: 5.0 },   // 360 slam
  { id: 6, kind: 'beam',   cd: 12.0, dmg: 55, range: 70 },    // hyper beam line
];

// ============================================================================
class Game {
  constructor() {
    this.quality = detectQuality();
    document.body.classList.toggle('is-touch', this.quality.isMobile);
    this.clock = new THREE.Clock();
    this.tmp = { v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.state = {
      phase: 'boot',
      roster: [],           // [{kind,id,level,xp,hpMax,hp,megaReady,mega}]
      activeIdx: 0,
      caught: {},           // id -> true
      score: 0,
      round: 1,
    };
    this.wilds = [];        // active wild Pokémon
    this.projectiles = [];
    this.vfx = [];
    this.cmdQueue = null;
    this.cooldowns = [0, 0, 0, 0, 0, 0, 0];
    this.keys = {};
    this.lockIdx = -1;
    this.catchCooldown = 0;
    this.camShake = 0;
    this.hitStop = 0;
    this.initRenderer();
  }

  // --------------------------------------------------------------------------
  initRenderer() {
    const canvas = document.createElement('canvas');
    $('app').appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.quality.isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(0, 8, 16);

    this.look = initLookdev({
      renderer: this.renderer, scene: this.scene, camera: this.camera,
      width: window.innerWidth, height: window.innerHeight, quality: this.quality,
    });
    this.env = buildEnvironment({ scene: this.scene, quality: this.quality });
    this.arenaR = this.env.arenaRadius || 40;
    this.amb = initAmbience({ scene: this.scene, quality: this.quality });
    this.perf = createPerf({ renderer: this.renderer, composer: this.look.composer, quality: this.quality });
    this.cinematics = createCinematics({
      camera: this.camera, letterboxTop: $('letterbox-top'), letterboxBottom: $('letterbox-bottom'),
    });

    // Camera rig
    this.cam = { yaw: 0, pitch: 0.34, dist: 15, distTarget: 15, focus: new THREE.Vector3(), shake: new THREE.Vector3() };

    window.addEventListener('resize', () => this.onResize());
    this.bindBoot();
    this.boot();
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.look.setSize(w, h);
  }

  // --------------------------------------------------------------------------
  async boot() {
    $('title-disclaimer').textContent = FAN_DISCLAIMER;
    // Pre-place Ash + a partner preview on the title? Keep it simple: render the world.
    this.buildAsh();
    this.startLoop();
    $('boot-status').textContent = 'Select your partner';
    $('btn-start').disabled = false;
    // Title music after first gesture (autoplay policy)
    this.state.phase = 'title';
  }

  bindBoot() {
    // Title card selection
    this.selectedStarter = 'charizard';
    document.querySelectorAll('.char-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.ensureAudio();
        document.querySelectorAll('.char-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedStarter = card.dataset.char;
        const meta = STARTERS[this.selectedStarter];
        $('char-desc').textContent = this.starterDesc(this.selectedStarter);
        if (this.sfx) this.sfx.select();
        this.previewStarter(this.selectedStarter);
      });
    });
    document.querySelector('.char-card[data-char="charizard"]').classList.add('selected');
    $('char-desc').textContent = this.starterDesc('charizard');

    $('btn-start').addEventListener('click', () => { this.ensureAudio(); this.startGame(); });
    $('btn-restart').addEventListener('click', () => { this.ensureAudio(); this.restart(); });

    // Dialogue advance
    $('dialogue').addEventListener('click', () => this.advanceDialogue());

    this.bindInput();
  }

  starterDesc(id) {
    const d = {
      charizard: 'CHARIZARD — Fire/Flying. Your loyal starter. A blazing aerial bruiser with a devastating Inferno Beam.',
      venusaur:  'VENUSAUR — Grass. A bulky frontline tank that drains foes and blankets the field in petals.',
      blastoise: 'BLASTOISE — Water. Twin hydro cannons and heavy plating. Punishes from range and up close.',
      voltaron:  'VOLTARON — Electric. An original storm-panther: blinding speed and chain-lightning bursts.',
    };
    return d[id] || '';
  }

  previewStarter() { /* world stays; starter shown after start */ }

  // --------------------------------------------------------------------------
  ensureAudio() {
    if (this.audioCtx) { if (this.audioCtx.state === 'suspended') this.audioCtx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AC();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.audioCtx.destination);
    this.music = createMusic(this.audioCtx, this.masterGain);
    this.sfx = createSfx(this.audioCtx, this.masterGain);
    this.music.setMode('title');
  }

  // --------------------------------------------------------------------------
  buildAsh() {
    this.ash = createAsh();
    this.ash.position.set(0, 0, 6);
    this.scene.add(this.ash);
    this.ashVel = new THREE.Vector3();
    this.ashFacing = Math.PI;
    this.ashAnim = { t: 0, speed: 0, throw: 0 };
    // Referee on the sideline
    const ref = createReferee();
    ref.position.set(this.arenaR * 0.7, this.env.getGroundHeight(this.arenaR * 0.7, 0), 0);
    ref.rotation.y = -Math.PI / 2;
    this.scene.add(ref);
    this.referee = ref;
  }

  deployPartner(idx) {
    if (this.partner && this.partner.group) {
      if (this.partner.beamStop) { this.partner.beamStop(); this.partner.beamStop = null; }
      this.scene.remove(this.partner.group);
    }
    const entry = this.state.roster[idx];
    const built = buildPokemon(entry);
    const grp = built.group;
    grp.position.copy(this.ash.position).add(new THREE.Vector3(2.5, 0, 0));
    this.scene.add(grp);
    this.partner = {
      group: grp, ud: grp.userData, name: built.name, element: built.element,
      entry, anim: { t: 0, speed: 0, attacking: false, flying: false },
      cmd: 'idle', cmdT: 0, move: null, hitTargets: new Set(), strikeStep: 0,
      home: new THREE.Vector3(), basePos: grp.position.clone(), facing: this.ashFacing,
      fly: false, flyH: 0, beamStop: null,
    };
    this.state.activeIdx = idx;
    this.refreshMoveBar();
    this.refreshRoster();
    this.updatePlayerPanel();
  }

  // --------------------------------------------------------------------------
  startGame() {
    if (this.state.phase === 'play') return;
    $('title-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    // Seed roster with chosen starter
    const id = this.selectedStarter;
    const meta = STARTERS[id];
    this.state.roster = [this.makeRosterEntry('starter', id, meta.element)];
    this.state.caught = {}; this.state.caught[id] = true;
    this.state.score = 0; this.state.round = 1; this.state.activeIdx = 0;
    this.deployPartner(0);
    this.state.phase = 'play';
    if (this.music) this.music.setMode('battle');
    this.beginRound(1);
  }

  makeRosterEntry(kind, id, element) {
    const lvl = 1;
    const hpMax = this.hpForLevel(lvl, kind, id);
    return { kind, id, element, level: lvl, xp: 0, xpNext: 55, hpMax, hp: hpMax, megaReady: false, mega: 0, _megaCharge: 0 };
  }
  hpForLevel(lvl, kind, id) {
    let base = 120;
    if (kind === 'wild') { const s = SPECIES_BY_ID[id]; base = 90 + (s ? s.hp : 80); }
    return Math.round(base + (lvl - 1) * 22);
  }

  restart() {
    // Cancel any pending encounter / firework timers so they don't fire into the new game.
    if (this._encounterTimer) { clearTimeout(this._encounterTimer); this._encounterTimer = null; }
    (this._fwTimers || []).forEach(clearTimeout); this._fwTimers = [];
    this._roundStarting = false;
    this.queuedCommand = null;
    // Clear wilds/projectiles/vfx
    for (const w of this.wilds) this.scene.remove(w.group);
    this.wilds.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const v of this.vfx) this.scene.remove(v.obj);
    this.vfx.length = 0;
    if (this._beamMesh) { this.scene.remove(this._beamMesh); this._beamMesh = null; this._beamCore = null; }
    $('end-screen').classList.add('hidden');
    this.startGame();
  }

  // --------------------------------------------------------------------------
  // ROUNDS & WILD SPAWNING
  beginRound(round) {
    if (this._encounterTimer) { clearTimeout(this._encounterTimer); this._encounterTimer = null; }
    if (this._roundStarting) return; // guard against double-advance
    this._roundStarting = true;
    this.state.round = round;
    $('round-value').textContent = round;
    const isBoss = round % 4 === 0;
    // pick a wild species for this encounter; cycle through the 4 wild species,
    // with a chance from round 3+ for a rare wild STARTER you can add to your team.
    let species = ENEMY_SPECIES[(round - 1) % ENEMY_SPECIES.length];
    if (!isBoss && round >= 3) {
      const uncaught = Object.values(STARTER_WILD).filter((s) => !this.state.caught[s.id]);
      if (uncaught.length && Math.random() < 0.3) {
        species = uncaught[(Math.random() * uncaught.length) | 0];
        this.showAnnouncer('A RARE CHAMPION APPEARS! ' + species.name + ' enters the arena!');
      }
    }
    this.pendingSpecies = species; this.pendingBoss = isBoss;
    // Spawn the challenger
    const wild = this.spawnWild(species, isBoss);
    // Intro cinematic
    this.state.phase = 'cinematic';
    if (this.music) this.music.setMode(isBoss ? 'boss' : 'battle');
    if (this.sfx) { this.sfx.announcer(); setTimeout(() => this.sfx && this.sfx.roar(species.element), 700); }
    this.showAnnouncer(getRoundIntro(round, species, isBoss).announcer);
    this.cinematics.playChallengerIntro(wild.group, this.partner ? this.partner.group : this.ash, () => {
      this.state.phase = 'play';
      this._roundStarting = false;
      this.queueDialogue(getRoundIntro(round, species, isBoss));
      this.lockNearest();
      if (round === 1) this.runTutorial();
    });
  }

  runTutorial() {
    if (this._tutorialDone) return;
    this._tutorialDone = true;
    const touch = this.quality.isMobile;
    const steps = touch ? [
      ['YOU ARE ASH — drag the left stick to move', 3200],
      ['Tap LOCK ◎ to target the wild Pokémon', 3200],
      ['Tap a MOVE to COMMAND your partner to attack!', 3600],
      ['Weaken it, then tap CATCH ⊙ to add it to your team', 4000],
    ] : [
      ['YOU ARE ASH — move with W A S D', 3000],
      ['Press TAB to LOCK onto the wild Pokémon', 3000],
      ['Press 1–6 to COMMAND your partner to attack!', 3400],
      ['Weaken it, then press C to CATCH and collect it', 3800],
      ['R swaps partner · SPACE flies · Q/E dodge · F mega', 3600],
    ];
    let i = 0;
    const show = () => {
      if (i >= steps.length || this.state.phase !== 'play') { $('center-msg').style.opacity = '0'; return; }
      const [txt, ms] = steps[i++];
      const el = $('center-msg');
      el.textContent = txt;
      el.style.fontSize = 'clamp(16px,2.6vw,26px)';
      el.style.letterSpacing = '2px';
      el.style.opacity = '1';
      this._tutTimer = setTimeout(() => { el.style.opacity = '0'; setTimeout(show, 350); }, ms);
    };
    show();
  }

  spawnWild(species, isBoss) {
    const g = species.starter ? STARTERS[species.id].factory() : createEnemy(species.id);
    g.userData.species = species;
    const bossScale = isBoss ? 1.45 : 1;
    g.scale.setScalar(bossScale);
    const ang = rand(0, TAU);
    const r = this.arenaR * 0.55;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const flying = !!species.flying;
    const baseY = flying ? 3.0 : this.env.getGroundHeight(x, z);
    g.position.set(x, baseY, z);
    this.scene.add(g);
    const hpMax = Math.round(species.hp * (1 + 0.22 * (this.state.round - 1)) * (isBoss ? 2.2 : 1));
    const wild = {
      group: g, ud: g.userData, species, isBoss, flying, baseY, scale: isBoss ? 1.45 : 1,
      hp: hpMax, hpMax, dmgScale: (1 + 0.07 * (this.state.round - 1)) * (isBoss ? 1.25 : 1),
      ai: 'idle', aiT: rand(0.3, 1.2), facing: 0,
      anim: { t: 0, speed: 0, attacking: false, flying },
      statuses: {}, marker: null, windup: 0, recovery: 0, stagger: 0, flash: 0,
      level: this.state.round,
    };
    wild.marker = this.makeMarker(g, isBoss);
    this.wilds.push(wild);
    this.updateEnemyPanel(wild);
    return wild;
  }

  makeMarker(group, isBoss) {
    // Overhead arrow marker
    const geo = new THREE.ConeGeometry(0.55, 1.0, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI;
    const h = (group.userData.height || 2.6) * (group.scale.y || 1);
    m.position.y = h + 1.4;
    m.userData.baseY = m.position.y;
    group.add(m);
    return m;
  }

  // --------------------------------------------------------------------------
  // INPUT
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.ensureAudio();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (this.state.phase !== 'play') {
        if (k === 'enter' || k === ' ') this.advanceDialogue();
        return;
      }
      if (k >= '1' && k <= '6') this.command(parseInt(k, 10));
      else if (k === 'tab') { e.preventDefault(); this.cycleLock(1); }
      else if (k === 'q') this.orderDodge(-1);
      else if (k === 'e') this.orderDodge(1);
      else if (k === 'c') this.throwBall();
      else if (k === 'r') this.swapPartner();
      else if (k === 'f') this.activateMega();
      else if (k === ' ') { e.preventDefault(); this.toggleFly(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // Mouse orbit + zoom
    const dom = this.renderer.domElement;
    let dragging = false, px = 0, py = 0;
    dom.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.cam.yaw -= (e.clientX - px) * 0.005;
      this.cam.pitch = clamp(this.cam.pitch - (e.clientY - py) * 0.004, -0.2, 1.1);
      px = e.clientX; py = e.clientY;
      this.userOrbit = 3.5;
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.distTarget = clamp(this.cam.distTarget + e.deltaY * 0.02, 7, 34);
    }, { passive: false });

    this.bindTouch();
  }

  bindTouch() {
    if (!this.quality.isMobile) return;
    // Joystick
    const zone = $('joystick-zone'), knob = $('joystick-knob');
    this.joy = { x: 0, y: 0, active: false };
    let cx = 0, cy = 0, R = 60;
    const start = (t) => { const r = zone.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; this.joy.active = true; move(t); };
    const move = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy) || 1; const cl = Math.min(d, R);
      dx = dx / d * cl; dy = dy / d * cl;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.joy.x = dx / R; this.joy.y = dy / R;
    };
    const end = () => { this.joy.active = false; this.joy.x = 0; this.joy.y = 0; knob.style.transform = 'translate(-50%,-50%)'; };
    zone.addEventListener('touchstart', (e) => { e.preventDefault(); this.ensureAudio(); start(e.changedTouches[0]); }, { passive: false });
    zone.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.changedTouches[0]); }, { passive: false });
    zone.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });

    const hold = (id, on, off) => {
      const el = $(id); if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.ensureAudio(); el.classList.add('held'); on && on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('held'); off && off(); }, { passive: false });
    };
    hold('btn-fly', () => this.toggleFly());
    hold('btn-boost', () => { this.boostHeld = true; }, () => { this.boostHeld = false; });
    hold('btn-dodge', () => this.orderDodge(1));
    hold('btn-target', () => this.cycleLock(1));
    hold('btn-catch', () => this.throwBall());
    hold('btn-swap', () => this.swapPartner());
    hold('btn-mega', () => this.activateMega());
    document.querySelectorAll('.mmove').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.ensureAudio(); this.command(parseInt(b.dataset.move, 10)); }, { passive: false });
    });
    // Long-press target button to throw ball; double tap handled simply by a catch button if present
  }

  // --------------------------------------------------------------------------
  // LOCK-ON
  cycleLock(dir) {
    if (!this.wilds.length) { this.lockIdx = -1; return; }
    this.lockIdx = (this.lockIdx + dir + this.wilds.length) % this.wilds.length;
    if (this.sfx) this.sfx.uiMove();
    this.markLock();
  }
  lockNearest() {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.wilds.length; i++) {
      const d = this.wilds[i].group.position.distanceToSquared(this.ash.position);
      if (d < bd) { bd = d; best = i; }
    }
    this.lockIdx = best; this.markLock();
  }
  get locked() { return this.lockIdx >= 0 && this.lockIdx < this.wilds.length ? this.wilds[this.lockIdx] : null; }
  markLock() {
    for (let i = 0; i < this.wilds.length; i++) {
      const w = this.wilds[i];
      const c = i === this.lockIdx ? 0xffcc33 : 0xff4444;
      if (w.marker) w.marker.material.color.setHex(c);
    }
    const w = this.locked;
    if (w) this.updateEnemyPanel(w);
  }

  // --------------------------------------------------------------------------
  // COMMANDS to partner
  command(slot) {
    if (this.state.phase !== 'play' || !this.partner) return;
    const move = MOVES[slot - 1];
    if (this.cooldowns[slot] > 0) { this.flashMoveSlot(slot); if (this.sfx) this.sfx.uiMove(); return; }
    if (this.partner.cmd !== 'idle') {
      // Buffer the input so it fires the instant the partner is free — keeps commands responsive.
      this.queuedCommand = slot; this.flashMoveSlot(slot); if (this.sfx) this.sfx.uiMove();
      return;
    }
    if (!this.locked) this.lockNearest();
    const target = this.locked;
    if (!target) { this.flashMoveSlot(slot); return; }
    this.partner.cmd = 'dash';
    this.partner.move = move;
    this.partner.moveSlot = slot;
    this.partner.cmdT = 0;
    this.partner.hitTargets.clear();
    this.partner.strikeStep = 0;
    this.flashMoveSlot(slot);
    if (this.sfx) this.sfx.swing();
  }

  consumeQueuedCommand() {
    if (this.queuedCommand && this.partner && this.partner.cmd === 'idle') {
      const slot = this.queuedCommand; this.queuedCommand = null;
      if (this.cooldowns[slot] <= 0) this.command(slot);
    }
  }

  orderDodge(dir) {
    if (!this.partner || this.partner.cmd === 'dodge' || this.partner.cmd === 'attack') return;
    this.partner.cmd = 'dodge'; this.partner.cmdT = 0; this.partner.dodgeDir = dir; this.partner.iframe = 0.45;
    if (this.sfx) this.sfx.dodge();
  }

  toggleFly() {
    if (!this.partner) return;
    this.partner.fly = !this.partner.fly;
    this.partner.anim.flying = this.partner.fly;
    if (this.sfx) this.sfx.wingFlap();
    this.showCallout(this.partner.fly ? 'AIRBORNE!' : 'GROUNDED', 0x86d0ff);
  }

  activateMega() {
    const e = this.state.roster[this.state.activeIdx];
    if (!e || e.level < 5 || !e.megaReady || e.mega > 0) return;
    e.mega = 10; e.megaReady = false; e._megaCharge = 0;
    if (this.sfx) this.sfx.megaSurge();
    this.showCallout('MEGA EVOLUTION!', 0xffd24d);
    this.spawnRing(this.partner.group.position, 0xffd24d, 6);
    this.camShake = 0.6;
  }

  swapPartner() {
    if (this.state.roster.length < 2) { this.showCallout('NO OTHER PARTNER', 0xff8888); return; }
    const next = (this.state.activeIdx + 1) % this.state.roster.length;
    // Preserve hp ratios handled per-entry. Remove current group.
    const old = this.partner.group;
    this.scene.remove(old);
    this.deployPartner(next);
    if (this.sfx) this.sfx.select();
    this.showCallout('GO, ' + this.partner.name + '!', ELEM[this.partner.element].color);
    this.spawnRing(this.partner.group.position, ELEM[this.partner.element].color, 3);
  }

  // --------------------------------------------------------------------------
  // CATCHING
  throwBall() {
    if (this.state.phase !== 'play' || this.catchCooldown > 0) return;
    const w = this.locked;
    if (!w) { this.showCallout('NO TARGET', 0xff8888); return; }
    if (this.state.caught[w.species.id]) { this.showCallout('ALREADY CAUGHT', 0x88ccff); }
    this.catchCooldown = 1.6;
    this.ashAnim.throw = 0.4; // trigger throw-arm animation
    if (this.sfx) this.sfx.catchBall();
    // Ball projectile
    const ball = this.makeBall();
    const from = this.tmp.v1.copy(this.ash.position); from.y += 1.4;
    ball.position.copy(from);
    this.scene.add(ball);
    const to = w.group.position.clone(); to.y += (w.ud.height || 2.5) * 0.5 * (w.scale || 1);
    this.projectiles.push({ mesh: ball, kind: 'ball', from: from.clone(), to, t: 0, dur: 0.55, target: w, arc: 4 });
    // catch cam — frame the ball in flight
    this.catchCam = 2.2;
    this.catchBallMesh = ball;
  }

  makeBall() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe53935, metalness: 0.3, roughness: 0.35, emissive: 0x661111, emissiveIntensity: 0.3 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.3, roughness: 0.35 }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 28), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    band.rotation.x = Math.PI / 2;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88ccff, emissiveIntensity: 0.5 }));
    btn.rotation.x = Math.PI / 2; btn.position.z = 0.31;
    g.add(top, bot, band, btn);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  resolveCatch(w, ball) {
    w.catching = true; // freeze its AI while the ball does its thing
    this.catchBallMesh = ball;
    this.hitStop = 0.12; // brief slow-mo punch as it connects
    // catch chance based on HP ratio + status
    const ratio = w.hp / w.hpMax;
    let chance = 0.1 + (1 - ratio) * 0.62;
    if (w.statuses.burn || w.statuses.soak || w.statuses.paralyze || w.statuses.leech) chance += 0.14;
    if (w.hp <= 0) chance = Math.max(chance, 0.82); // KO'd is likely but never guaranteed
    if (w.isBoss) chance *= 0.6;
    chance = clamp(chance, 0.05, 0.92);
    const success = Math.random() < chance;
    // Wobble animation: keep ball, suck wild in
    w.group.visible = false;
    this.vfx.push({ kind: 'wobble', obj: ball, t: 0, dur: success ? 1.6 : 1.1, success, wild: w });
    this.spawnRing(w.group.position, success ? 0xffd24d : 0xff7744, 2.5);
  }

  completeCatch(w, ball, success) {
    this.disposeObj(ball);
    if (this.catchBallMesh === ball) this.catchBallMesh = null;
    if (success) {
      // remove wild, add to roster (if not already a usable partner)
      this.removeWild(w);
      if (this.sfx) this.sfx.catchSuccess();
      this.showCallout('GOTCHA! ' + w.species.name + ' CAUGHT!', 0xffd24d);
      this.flashScreen(0.5);
      this.spawnFireworks(3);
      if (!this.state.caught[w.species.id]) {
        this.state.caught[w.species.id] = true;
        const kind = w.species.starter ? 'starter' : 'wild';
        this.state.roster.push(this.makeRosterEntry(kind, w.species.id, w.species.element));
      }
      this.gainXP(30);
      this.state.score += 250;
      this.updateScore();
      this.refreshRoster();
      this.afterEncounter(true);
    } else {
      w.group.visible = true;
      w.catching = false;
      this.showCallout('IT BROKE FREE!', 0xff8888);
      if (this.sfx) this.sfx.hurt();
    }
  }

  // --------------------------------------------------------------------------
  // DAMAGE
  damageWild(w, baseDmg, opts = {}) {
    if (w.hp <= 0) return;
    const atkEl = this.partner.element;
    const defEl = w.species.element === 'storm' ? 'electric' : w.species.element;
    let mult = typeMult(atkEl, w.flying ? 'flying' : defEl);
    if (mult === 1) mult = typeMult(atkEl, defEl);
    const e = this.state.roster[this.state.activeIdx];
    const lvlScale = 1 + (e.level - 1) * 0.08;
    const megaScale = e.mega > 0 ? 1.5 : 1;
    const crit = Math.random() < 0.14 ? 1.7 : 1;
    let dmg = baseDmg * mult * lvlScale * megaScale * crit * (opts.scale || 1);
    dmg = Math.round(dmg);
    w.hp = Math.max(0, w.hp - dmg);
    w.flash = 0.18; w.stagger = Math.max(w.stagger, 0.16);
    this.floatDamage(w.group, dmg, mult, crit > 1);
    if (this.sfx) this.sfx.hit(atkEl, clamp(dmg / 50, 0.2, 1));
    if (mult >= 1.5 && !opts.silentType) this.showCallout('SUPER EFFECTIVE!', 0xffd24d);
    // apply status sometimes
    if (opts.status && Math.random() < 0.6) this.applyStatus(w, STATUS_BY_ELEM[atkEl]);
    // mega meter gain
    if (!e.megaReady && e.level >= 5) { e.mega <= 0 && (e._megaCharge = (e._megaCharge || 0) + dmg); if (e._megaCharge > 220) { e.megaReady = true; this.showCallout('MEGA READY — PRESS F', 0xffd24d); } }
    this.updateEnemyPanel(w);
    this.camShake = Math.max(this.camShake, opts.heavy ? 0.5 : 0.22);
    if (opts.heavy) this.hitStop = 0.09;
    if (w.hp <= 0) this.onWildDown(w);
  }

  applyStatus(w, st) {
    if (!st) return;
    const fresh = !w.statuses[st];
    w.statuses[st] = st === 'burn' ? 5 : st === 'leech' ? 5 : 4;
    if (fresh) {
      const labels = { burn: 'BURN!', soak: 'SOAKED!', paralyze: 'PARALYZED!', leech: 'LEECH SEED!' };
      const colors = { burn: 0xff7733, soak: 0x3fa8ff, paralyze: 0xffe14d, leech: 0x57d957 };
      this.showCallout(labels[st], colors[st]);
    }
    this.updateEnemyStatus(w);
  }

  onWildDown(w) {
    w.ai = 'down'; w.aiT = 0;
    this.showCallout(getKOLine(w.species), 0xffffff);
    if (this.sfx) { this.sfx.hit(w.species.element, 1); this.sfx.cheer(0.8); }
    this.gainXP(w.isBoss ? 42 : 20);
    this.state.score += w.isBoss ? 400 : 150;
    this.updateScore();
    this.spawnRing(w.group.position, 0xffffff, 3);
    // Offer catch window: wild lingers downed for a moment, then if not caught, faints
    this.vfx.push({ kind: 'downed', obj: w.group, t: 0, dur: 3.2, wild: w });
  }

  removeWild(w) {
    const i = this.wilds.indexOf(w);
    if (i >= 0) this.wilds.splice(i, 1);
    this.scene.remove(w.group);
    if (this.lockIdx >= this.wilds.length) this.lockIdx = this.wilds.length - 1;
    this.markLock();
  }

  afterEncounter(caught) {
    // heal partner a bit, advance round
    const e = this.state.roster[this.state.activeIdx];
    e.hp = Math.min(e.hpMax, e.hp + Math.round(e.hpMax * 0.2));
    this.updatePlayerPanel();
    const next = this.state.round + 1;
    // milestone
    const mile = getMilestone(this.state.round);
    if (mile) this.queueDialogue(mile);
    if (this.state.round >= 16 && Object.keys(this.state.caught).length >= 4) {
      this.win();
      return;
    }
    if (this._encounterTimer) clearTimeout(this._encounterTimer);
    this._encounterTimer = setTimeout(() => {
      this._encounterTimer = null;
      if (this.state.phase === 'play' || this.state.phase === 'dialogue') this.beginRound(next);
    }, 1600);
  }

  // --------------------------------------------------------------------------
  // XP / LEVEL
  gainXP(amount) {
    const e = this.state.roster[this.state.activeIdx];
    e.xp += amount;
    while (e.xp >= e.xpNext) {
      e.xp -= e.xpNext; e.level++; e.xpNext = Math.round(e.xpNext * 1.35);
      const oldMax = e.hpMax;
      e.hpMax = this.hpForLevel(e.level, e.kind, e.id);
      e.hp = Math.min(e.hpMax, e.hp + (e.hpMax - oldMax) + Math.round(e.hpMax * 0.5));
      if (this.sfx) this.sfx.levelUp();
      this.showCallout('LEVEL ' + e.level + '!', 0x86f0a0);
      if (e.level >= 5 && !e.megaReady && e.mega <= 0) { /* mega charges via damage */ }
      this.spawnRing(this.partner.group.position, 0x86f0a0, 3);
    }
    this.updatePlayerPanel();
  }

  // --------------------------------------------------------------------------
  // PARTNER-DEALT DAMAGE TO ASH? (wild attacks hit the partner)
  damagePartner(amount, attacker) {
    const e = this.state.roster[this.state.activeIdx];
    if (this.partner.iframe > 0) { this.showCallout('DODGED!', 0x86d0ff); return; }
    let mult = 1;
    if (attacker) {
      const atkEl = attacker.species.element === 'storm' ? 'electric' : attacker.species.element;
      mult = typeMult(atkEl, this.partner.element);
    }
    const dmg = Math.round(amount * mult);
    e.hp = Math.max(0, e.hp - dmg);
    this.updatePlayerPanel();
    this.hurtFlash();
    if (this.sfx) this.sfx.hurt();
    this.camShake = Math.max(this.camShake, 0.3);
    if (e.hp <= 0) this.onPartnerFaint();
  }

  onPartnerFaint() {
    this.showCallout(this.partner.name + ' FAINTED!', 0xff5555);
    // auto-swap to next healthy
    const healthy = this.state.roster.findIndex((r, i) => i !== this.state.activeIdx && r.hp > 0);
    if (healthy >= 0) {
      this.scene.remove(this.partner.group);
      this.deployPartner(healthy);
      this.showCallout('GO, ' + this.partner.name + '!', ELEM[this.partner.element].color);
    } else {
      this.lose();
    }
  }

  // --------------------------------------------------------------------------
  win() {
    this.state.phase = 'victory';
    if (this.music) this.music.playVictory();
    const v = getVictory(this.partner.name);
    $('end-title').textContent = 'EMBER CROWN CHAMPION';
    $('end-lines').innerHTML = v.lines.map((l) => `<div>${l}</div>`).join('') +
      `<div style="margin-top:12px;color:#ffd24d">Pokémon caught: ${Object.keys(this.state.caught).length} · Score: ${this.state.score}</div>`;
    $('end-screen').classList.remove('hidden');
    this.spawnFireworks(8);
  }
  lose() {
    this.state.phase = 'gameover';
    if (this.music) this.music.playDefeat();
    const d = getDefeat(this.state.round);
    $('end-title').textContent = 'DEFEATED';
    $('end-lines').innerHTML = d.lines.map((l) => `<div>${l}</div>`).join('') +
      `<div style="margin-top:12px;color:#ffd24d">Reached round ${this.state.round} · Caught ${Object.keys(this.state.caught).length} · Score ${this.state.score}</div>`;
    $('end-screen').classList.remove('hidden');
  }

  // ==========================================================================
  // MAIN LOOP
  startLoop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      let dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;
      if (dt > 0.1) dt = 0.1;
      this.perf.update(dt);
      if (this.music) this.music.update();

      if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.12; }

      if (this.cinematics.isActive()) {
        this.cinematics.update(dt);
      } else if (this.state.phase === 'play') {
        this.updateAsh(dt, t);
        this.updatePartner(dt, t);
        this.updateWilds(dt, t);
      }
      this.updateProjectiles(dt);
      this.updateVfx(dt);
      this.env.update(dt, t, this.ash ? this.ash.position : this.tmp.v1.set(0, 0, 0));
      this.amb.update(dt, t, this.ash ? this.ash.position : this.tmp.v1, this.camera);
      this.look.update(dt, t, this.ash ? this.ash.position : this.tmp.v1);
      if (!this.cinematics.isActive()) this.updateCamera(dt);

      // timers
      for (let i = 1; i <= 6; i++) if (this.cooldowns[i] > 0) this.cooldowns[i] -= dt;
      this.refreshCooldownUI();
      if (this.catchCooldown > 0) this.catchCooldown -= dt;
      if (this.userOrbit > 0) this.userOrbit -= dt;
      if (this.catchCam > 0) this.catchCam -= dt;
      const e = this.state.roster[this.state.activeIdx];
      if (e && e.mega > 0) { e.mega -= dt; if (e.mega <= 0) { e._megaCharge = 0; this.showCallout('MEGA ENDED', 0xffaa55); } this.updateMegaUI(); }

      this.look.composer.render();
    };
    tick();
  }

  // --------------------------------------------------------------------------
  updateAsh(dt, t) {
    let ix = 0, iz = 0;
    if (this.keys['w'] || this.keys['arrowup']) iz -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) iz += 1;
    if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
    if (this.keys['d'] || this.keys['arrowright']) ix += 1;
    if (this.joy && this.joy.active) { ix += this.joy.x; iz += this.joy.y; }
    const mag = Math.hypot(ix, iz);
    const speed = (this.boostHeld ? 11 : 7);
    // camera-relative movement
    const cy = this.cam.yaw;
    let wx = 0, wz = 0;
    if (mag > 0.01) {
      const nx = ix / mag, nz = iz / mag;
      wx = (nx * Math.cos(cy) - nz * Math.sin(cy));
      wz = (nx * Math.sin(cy) + nz * Math.cos(cy));
      this.ashFacing = Math.atan2(wx, wz);
    }
    const tgt = this.tmp.v1.set(wx, 0, wz).multiplyScalar(Math.min(mag, 1) * speed);
    this.ashVel.x = damp(this.ashVel.x, tgt.x, 10, dt);
    this.ashVel.z = damp(this.ashVel.z, tgt.z, 10, dt);
    this.ash.position.x += this.ashVel.x * dt;
    this.ash.position.z += this.ashVel.z * dt;
    // keep within world / arena soft bounds
    const distC = Math.hypot(this.ash.position.x, this.ash.position.z);
    const maxR = this.arenaR + 200;
    if (distC > maxR) { this.ash.position.x *= maxR / distC; this.ash.position.z *= maxR / distC; }
    this.ash.position.y = this.env.getGroundHeight(this.ash.position.x, this.ash.position.z);
    // face & animate
    this.ash.rotation.y = damp(this.ash.rotation.y, this.ashFacing, 12, dt);
    const moveSpeed = Math.hypot(this.ashVel.x, this.ashVel.z);
    this.animateRig(this.ash, dt, t, moveSpeed, false, this.ashAnim, false);
    // Throw-arm flourish when tossing a Poké Ball.
    if (this.ashAnim.throw > 0) {
      this.ashAnim.throw -= dt;
      const arm = this.ash.userData.throwArm;
      if (arm) arm.rotation.x = -Math.sin(clamp(this.ashAnim.throw / 0.4, 0, 1) * Math.PI) * 2.4;
    }
    if (moveSpeed > 1 && this.sfx && Math.random() < dt * moveSpeed * 0.6) this.sfx.step();
  }

  // --------------------------------------------------------------------------
  updatePartner(dt, t) {
    const p = this.partner; if (!p) return;
    const target = this.locked;
    const pos = p.group.position;
    // desired home: beside Ash, offset to the side facing target
    const sideAng = this.ashFacing + Math.PI * 0.5;
    const home = this.tmp.v2.copy(this.ash.position);
    home.x += Math.sin(sideAng) * 2.6 - Math.sin(this.ashFacing) * 1.2;
    home.z += Math.cos(sideAng) * 2.6 - Math.cos(this.ashFacing) * 1.2;
    const groundH = this.env.getGroundHeight(home.x, home.z);
    const hoverH = p.fly ? 6.5 : 1.0;
    home.y = groundH + hoverH;

    let attacking = false, moveSpeed = 0;
    p.cmdT += dt;
    if (p.iframe > 0) p.iframe -= dt;

    // If our target vanished (caught/KO'd) mid-action, bail out so we don't get stuck.
    if ((p.cmd === 'dash' || p.cmd === 'attack') && !target) { this.endMove(p); }

    if (p.cmd === 'dash' && target) {
      // dash toward target until in move range
      const tp = target.group.position;
      const d = this.tmp.v3.copy(tp).sub(pos); d.y = 0;
      const dist = d.length();
      const desired = (p.move.range * 0.6) + 1.5;
      p.facing = Math.atan2(d.x, d.z);
      if (dist > desired && p.move.kind !== 'breath' && p.move.kind !== 'burst' && p.move.kind !== 'beam') {
        d.normalize();
        const sp = 22;
        pos.x += d.x * sp * dt; pos.z += d.z * sp * dt;
        moveSpeed = sp;
      } else {
        p.cmd = 'attack'; p.cmdT = 0; this.startMoveAction(p, target);
      }
      pos.y = damp(pos.y, groundH + (p.fly ? 6.5 : 1.0), 8, dt);
      if (p.cmdT > 1.2) { p.cmd = 'attack'; p.cmdT = 0; this.startMoveAction(p, target); }
    } else if (p.cmd === 'attack') {
      attacking = true;
      this.runMoveAction(p, target, dt);
    } else if (p.cmd === 'dodge') {
      const dir = p.dodgeDir;
      const ang = this.ashFacing + Math.PI * 0.5 * dir;
      pos.x += Math.sin(ang) * 16 * dt; pos.z += Math.cos(ang) * 16 * dt;
      moveSpeed = 16;
      if (p.cmdT > 0.3) { p.cmd = 'return'; p.cmdT = 0; }
    } else if (p.cmd === 'return') {
      const d = this.tmp.v3.copy(home).sub(pos); const dist = d.length();
      if (dist > 0.4) { d.normalize(); const sp = Math.min(dist * 4, 18); pos.x += d.x * sp * dt; pos.z += d.z * sp * dt; pos.y = damp(pos.y, home.y, 8, dt); moveSpeed = sp; }
      else { p.cmd = 'idle'; p.cmdT = 0; this.consumeQueuedCommand(); }
      if (target) p.facing = Math.atan2(target.group.position.x - pos.x, target.group.position.z - pos.z);
    } else {
      // idle: follow home, face target
      const d = this.tmp.v3.copy(home).sub(pos); const dist = d.length();
      if (dist > 0.3) { const sp = Math.min(dist * 4.5, 16); d.normalize(); pos.x += d.x * sp * dt; pos.z += d.z * sp * dt; moveSpeed = sp; }
      pos.y = damp(pos.y, home.y, 6, dt);
      if (target) p.facing = Math.atan2(target.group.position.x - pos.x, target.group.position.z - pos.z);
      else p.facing = this.ashFacing;
    }

    p.group.rotation.y = damp(p.group.rotation.y, p.facing, 12, dt);
    p.anim.flying = p.fly;
    this.animateRig(p.group, dt, t, moveSpeed, p.fly, p.anim, attacking);
  }

  startMoveAction(p, target) {
    const m = p.move;
    p.actionT = 0; p.actionPhase = 0; p.hitTargets.clear(); p.strikeStep = 0;
    this.cooldowns[p.moveSlot] = m.cd;
    const el = p.element;
    if (m.kind === 'breath') { if (this.sfx) p.beamStop = this.sfx.beamStart(el); }
    else if (m.kind === 'beam') { if (this.sfx) { this.sfx.roar(el); p.beamStop = this.sfx.beamStart(el); } this.camShake = 0.4; }
    else if (m.kind === 'spin') { if (this.sfx) this.sfx.spin(); }
    else if (m.kind === 'bite') { if (this.sfx) this.sfx.bite(); }
    else if (m.kind === 'burst') { if (this.sfx) this.sfx.burst(el); }
    else if (m.kind === 'strike') { if (this.sfx) this.sfx.swing(); }
    // punch-in camera
    this.cam.distTarget = clamp(this.cam.dist - 4, 7, 34);
    this.attackZoom = 0.55;
  }

  runMoveAction(p, target, dt) {
    const m = p.move; p.actionT += dt;
    const el = p.element;
    const origin = this.tmp.v1.copy(p.group.position); origin.y += (p.ud.height || 2.5) * 0.5;
    const tp = target ? target.group.position : origin;

    switch (m.kind) {
      case 'strike': {
        // 3-hit chain at 0.0/0.22/0.5, finisher knockdown
        const hits = [0.05, 0.27, 0.55];
        for (let i = 0; i < 3; i++) {
          if (p.strikeStep === i && p.actionT >= hits[i]) {
            p.strikeStep++;
            const finisher = i === 2;
            this.slashArc(origin, p.facing, ELEM[el].color);
            if (target && this.inRange(p, target, m.range)) {
              this.damageWild(target, finisher ? 26 : 16, { heavy: finisher, status: finisher });
              if (finisher) { target.stagger = 0.5; this.knockback(target, p, 2.2); }
            }
            if (this.sfx) this.sfx.swing();
          }
        }
        if (p.actionT > 0.8) this.endMove(p);
        break;
      }
      case 'bite': {
        if (p.actionPhase === 0 && p.actionT >= 0.18) {
          p.actionPhase = 1;
          // counter: bonus if target in windup/recovery
          let dmg = m.dmg;
          if (target && target.ai === 'recovery') { dmg *= 1.75; this.showCallout('COUNTER!', 0xffd24d); if (this.sfx) this.sfx.counter(); }
          if (target && this.inRange(p, target, m.range)) this.damageWild(target, dmg, { heavy: true, status: true });
          this.spawnRing(origin, ELEM[el].color, 1.6);
        }
        if (p.actionT > 0.5) this.endMove(p);
        break;
      }
      case 'breath': {
        // continuous stream for 1.1s, tick damage
        this.streamVfx(origin, tp, ELEM[el].color, dt);
        if (!p._tick) p._tick = 0; p._tick += dt;
        if (p._tick > 0.16) { p._tick = 0; if (target && origin.distanceTo(tp) < m.range) this.damageWild(target, m.dmg, { silentType: false, status: true, scale: 1 }); }
        if (p.actionT > 1.1) { p._tick = 0; if (p.beamStop) { p.beamStop(); p.beamStop = null; } this.endMove(p); }
        break;
      }
      case 'burst': {
        if (p.actionPhase === 0 && p.actionT >= 0.2) {
          p.actionPhase = 1;
          this.fireProjectile(origin, tp, ELEM[el].color, el, m.dmg, true);
        }
        if (p.actionT > 0.5) this.endMove(p);
        break;
      }
      case 'spin': {
        // 360 whirl, hit all in radius once per 0.2s
        p.group.rotation.y += dt * 18;
        if (!p._tick) p._tick = 0; p._tick += dt;
        if (p._tick > 0.2) {
          p._tick = 0;
          this.spawnRing(p.group.position, ELEM[el].color, m.range * 0.6);
          for (const w of this.wilds) { if (w.hp > 0 && p.group.position.distanceTo(w.group.position) < m.range) this.damageWild(w, m.dmg / 2, { silentType: true }); }
          if (this.sfx) this.sfx.swing();
        }
        if (p.actionT > 0.9) { p._tick = 0; this.endMove(p); }
        break;
      }
      case 'beam': {
        // sustained line beam for 0.8s
        this.beamVfx(origin, p.facing, ELEM[el].color, m.range);
        if (!p._tick) p._tick = 0; p._tick += dt;
        if (p._tick > 0.12) {
          p._tick = 0;
          for (const w of this.wilds) {
            if (w.hp <= 0) continue;
            // line check: is wild roughly in facing direction within range
            const d = this.tmp.v2.copy(w.group.position).sub(origin); d.y = 0;
            const dist = d.length(); if (dist > m.range) continue;
            const ang = Math.atan2(d.x, d.z);
            let da = Math.abs(((ang - p.facing + Math.PI) % TAU) - Math.PI);
            if (da < 0.25) this.damageWild(w, m.dmg / 6, { heavy: true, status: true });
          }
        }
        this.camShake = Math.max(this.camShake, 0.25);
        if (p.actionT > 0.85) { p._tick = 0; if (p.beamStop) { p.beamStop(); p.beamStop = null; } this.endMove(p); }
        break;
      }
      default: this.endMove(p);
    }
  }

  endMove(p) {
    if (p.beamStop) { p.beamStop(); p.beamStop = null; }
    p.cmd = 'return'; p.cmdT = 0; p.move = null;
    this.attackZoom = 0;
  }

  inRange(p, w, range) { return p.group.position.distanceTo(w.group.position) <= range + 1.5; }
  knockback(w, from, force) {
    const d = this.tmp.v2.copy(w.group.position).sub(from.group.position); d.y = 0; d.normalize();
    w.kbX = d.x * force; w.kbZ = d.z * force;
  }

  // --------------------------------------------------------------------------
  // WILD AI
  updateWilds(dt, t) {
    const ptarget = this.partner ? this.partner.group.position : this.ash.position;
    for (const w of this.wilds) {
      const pos = w.group.position;
      if (w.flash > 0) w.flash -= dt;
      if (w.stagger > 0) w.stagger -= dt;
      // status ticks
      this.tickStatus(w, dt);
      // knockback
      if (w.kbX || w.kbZ) { pos.x += w.kbX * dt * 6; pos.z += w.kbZ * dt * 6; w.kbX *= (1 - dt * 6); w.kbZ *= (1 - dt * 6); if (Math.abs(w.kbX) < 0.02) w.kbX = 0; if (Math.abs(w.kbZ) < 0.02) w.kbZ = 0; }
      this.applyFlash(w);

      let moveSpeed = 0;
      if (w.catching) { continue; }
      if (w.hp <= 0 || w.ai === 'down') {
        // downed: slump, no action
        this.animateRig(w.group, dt, t, 0, w.flying, w.anim, false);
        if (w.marker) w.marker.visible = false;
        continue;
      }
      w.aiT -= dt;
      const toP = this.tmp.v1.copy(ptarget).sub(pos); const distP = Math.hypot(toP.x, toP.z);
      w.facing = Math.atan2(toP.x, toP.z);
      const paralyzed = w.statuses.paralyze > 0;
      const spd = w.species.speed * (paralyzed ? 0.45 : 1) * (w.stagger > 0 ? 0.2 : 1);

      switch (w.ai) {
        case 'idle':
          if (w.aiT <= 0) { w.ai = distP < w.species.meleeRange + 1 ? 'windup' : 'chase'; w.aiT = rand(0.4, 1.0); }
          break;
        case 'chase': {
          if (distP > w.species.meleeRange) { toP.normalize(); pos.x += toP.x * spd * dt; pos.z += toP.z * spd * dt; moveSpeed = spd; }
          else { w.ai = 'windup'; w.aiT = 0.65; }
          // circle-strafe sometimes
          if (Math.random() < dt * 0.4) { const s = Math.random() < 0.5 ? 1 : -1; pos.x += Math.cos(w.facing) * s * spd * dt; pos.z -= Math.sin(w.facing) * s * spd * dt; }
          if (w.aiT <= 0 && distP > 16) { w.ai = 'ranged'; w.aiT = 0.5; }
          break;
        }
        case 'windup': {
          // telegraph (white strobe marker)
          if (w.marker) { w.marker.material.color.setHex((Math.floor(t * 12) % 2) ? 0xffffff : 0xff4444); }
          if (w.aiT <= 0) { w.ai = 'attack'; w.aiT = 0; this.wildAttack(w, distP); }
          break;
        }
        case 'attack': {
          w.ai = 'recovery'; w.aiT = 0.4;
          break;
        }
        case 'recovery': {
          if (w.marker) w.marker.material.color.setHex(0x4499ff); // punishable blue
          if (w.aiT <= 0) { w.ai = 'idle'; w.aiT = rand(0.3, 0.8); this.markLock(); }
          break;
        }
        case 'ranged': {
          if (w.aiT <= 0) {
            this.fireProjectile(this.tmp.v2.copy(pos).setY(pos.y + 1.5), ptarget, w.species.projectileColor, w.species.element === 'storm' ? 'electric' : w.species.element, w.species.dmgRanged * (w.dmgScale || 1), false, w);
            w.ai = 'idle'; w.aiT = rand(0.8, 1.6);
            if (this.sfx) this.sfx.burst(w.species.element === 'storm' ? 'electric' : w.species.element);
          }
          break;
        }
      }

      // height for flyers
      if (w.flying) { w.baseY = 3.0 + Math.sin(t * 1.5 + pos.x) * 0.8; pos.y = damp(pos.y, w.baseY, 4, dt); }
      else pos.y = this.env.getGroundHeight(pos.x, pos.z);

      w.group.rotation.y = damp(w.group.rotation.y, w.facing, 8, dt);
      // squash stagger
      const sq = w.stagger > 0 ? 1 - w.stagger * 0.5 : 1;
      const baseScale = w.scale || 1;
      w.group.scale.set(baseScale * (2 - sq) * 0.5 + baseScale * 0.5, baseScale * sq, baseScale * (2 - sq) * 0.5 + baseScale * 0.5);

      this.animateRig(w.group, dt, t, moveSpeed, w.flying, w.anim, w.ai === 'windup' || w.ai === 'attack');
      // marker bob
      if (w.marker) { w.marker.visible = true; w.marker.position.y = w.marker.userData.baseY + Math.sin(t * 3) * 0.15; w.marker.rotation.y += dt; }
    }
  }

  wildAttack(w, distP) {
    if (this.sfx) this.sfx.swing();
    const p = this.partner;
    if (!p) return;
    const reach = w.species.meleeRange + 1.5;
    if (p.group.position.distanceTo(w.group.position) <= reach) {
      this.damagePartner(w.species.dmgMelee * (w.dmgScale || 1), w);
      this.slashArc(this.tmp.v1.copy(w.group.position).setY(w.group.position.y + 1.2), w.facing, 0xff5555);
    }
  }

  tickStatus(w, dt) {
    for (const k of ['burn', 'soak', 'paralyze', 'leech']) {
      if (w.statuses[k] > 0) {
        w.statuses[k] -= dt;
        if (k === 'burn' && Math.random() < dt * 2) { w.hp = Math.max(0, w.hp - 1); this.floatDamage(w.group, 1, 1, false, 0xff7733); if (w.hp <= 0) this.onWildDown(w); }
        if (k === 'leech' && Math.random() < dt * 1.5) { const e = this.state.roster[this.state.activeIdx]; e.hp = Math.min(e.hpMax, e.hp + 1); w.hp = Math.max(0, w.hp - 1); this.updatePlayerPanel(); }
        if (w.statuses[k] <= 0) { delete w.statuses[k]; this.updateEnemyStatus(w); }
      }
    }
  }

  applyFlash(w) {
    const on = w.flash > 0;
    for (const m of (w.ud.bodyMats || [])) {
      if (!m.userData.baseEmissive) continue;
      if (on) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 1.2; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEmissiveIntensity; }
    }
  }

  // ==========================================================================
  // RIG ANIMATION (shared)
  animateRig(group, dt, t, speed, flying, anim, attacking) {
    const ud = group.userData; if (!ud) return;
    anim.t += dt * (1 + speed * 0.18);
    const phase = anim.t * 6;
    const swing = Math.min(speed * 0.12, 1);
    // legs/arms swing
    const legs = ud.legs || [], arms = ud.arms || [];
    for (let i = 0; i < legs.length; i++) {
      const s = (i % 2 === 0 ? 1 : -1);
      if (legs[i] && legs[i].pivot) legs[i].pivot.rotation.x = Math.sin(phase + (i % 2) * Math.PI) * 0.5 * swing;
    }
    for (let i = 0; i < arms.length; i++) {
      if (arms[i] && arms[i].pivot) {
        let a = Math.sin(phase + (i % 2 ? 0 : Math.PI)) * 0.4 * swing;
        if (attacking) a += Math.sin(t * 30) * 0.5;
        arms[i].pivot.rotation.x = a;
      }
    }
    // idle bob
    const bob = Math.sin(anim.t * 2.2) * 0.04 + (flying ? Math.sin(t * 2) * 0.25 : 0);
    if (ud.baseY != null) group.position.y += 0; // handled by controller
    // jaw
    if (ud.jaw) ud.jaw.rotation.x = damp(ud.jaw.rotation.x, attacking ? 0.5 : (0.05 + Math.abs(Math.sin(anim.t)) * 0.05), 10, dt);
    if (ud.mouthGlow) ud.mouthGlow.visible = attacking;
    // tail sway
    if (ud.tailGroup) ud.tailGroup.rotation.y = Math.sin(anim.t * 3) * 0.18 + (speed > 1 ? Math.sin(phase) * 0.1 : 0);
    // wings flap
    const wings = ud.wings || [];
    for (const w of wings) {
      if (!w || !w.group) continue;
      const flap = flying ? Math.sin(t * 8) * 0.6 + 0.3 : Math.sin(anim.t * 2) * 0.12 + 0.1;
      w.group.rotation.z = (w.sign || 1) * flap;
    }
    // flame light pulse
    if (ud.flameLight) ud.flameLight.intensity = (ud.flameLight.userData._base || (ud.flameLight.userData._base = ud.flameLight.intensity)) * (0.8 + Math.sin(t * 9) * 0.2 + (attacking ? 0.5 : 0));
    if (typeof ud.animateExtra === 'function') ud.animateExtra(t, dt, { speed, flying, attacking });
  }

  // ==========================================================================
  // CAMERA
  updateCamera(dt) {
    if (!this.ash) return;
    const p = this.partner, target = this.locked;
    // focus: blend Ash, partner, and target
    const f = this.tmp.v1.copy(this.ash.position); f.y += 1.4;
    if (p) { f.lerp(this.tmp.v2.copy(p.group.position).setY(p.group.position.y + 0.8), 0.35); }
    if (target && (this.attackZoom > 0 || this.catchCam > 0)) {
      f.lerp(this.tmp.v2.copy(target.group.position).setY(target.group.position.y + 1.0), 0.3);
    }
    // During a catch, ride the ball for a dramatic tracking shot.
    if (this.catchCam > 0 && this.catchBallMesh && this.catchBallMesh.parent) {
      f.lerp(this.tmp.v2.copy(this.catchBallMesh.position).add(this.tmp.v3.set(0, 0.5, 0)), 0.55);
    }
    this.cam.focus.x = damp(this.cam.focus.x, f.x, 6, dt);
    this.cam.focus.y = damp(this.cam.focus.y, f.y, 6, dt);
    this.cam.focus.z = damp(this.cam.focus.z, f.z, 6, dt);

    // auto-yaw toward facing the action when not user-orbiting
    if (this.userOrbit <= 0) {
      let desiredYaw = this.ashFacing + Math.PI; // behind ash
      if (target) {
        const d = this.tmp.v2.copy(target.group.position).sub(this.ash.position);
        desiredYaw = Math.atan2(-d.x, -d.z);
      }
      // shortest angle damp — gentle so it eases behind the action without yanking
      let dy = ((desiredYaw - this.cam.yaw + Math.PI) % TAU) - Math.PI;
      const aimSpeed = (this.attackZoom > 0 || this.catchCam > 0) ? 2.2 : 0.9;
      this.cam.yaw += dy * Math.min(1, dt * aimSpeed);
    }

    // distance: zoom in on attack / catch
    let dTarget = this.cam.distTarget;
    if (this.attackZoom > 0) { this.attackZoom -= dt; dTarget = clamp(dTarget - 3.5, 7, 34); }
    if (this.catchCam > 0) dTarget = clamp(dTarget - 2, 7, 34);
    this.cam.dist = damp(this.cam.dist, dTarget, 5, dt);
    // restore distTarget after attack zoom
    if (this.attackZoom <= 0) this.cam.distTarget = damp(this.cam.distTarget, 15, 1.5, dt);

    const pitch = this.catchCam > 0 ? this.cam.pitch * 0.45 : this.cam.pitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ox = Math.sin(this.cam.yaw) * cp * this.cam.dist;
    const oz = Math.cos(this.cam.yaw) * cp * this.cam.dist;
    const oy = sp * this.cam.dist + 2;
    const camPos = this.tmp.v2.set(this.cam.focus.x + ox, this.cam.focus.y + oy, this.cam.focus.z + oz);

    // shake
    if (this.camShake > 0) {
      this.camShake -= dt * 1.5;
      const s = this.camShake * 0.5;
      camPos.x += rand(-s, s); camPos.y += rand(-s, s); camPos.z += rand(-s, s);
    }
    this.camera.position.copy(camPos);
    this.camera.lookAt(this.cam.focus);

    // FOV stretch on boost/beam
    let fov = 60;
    if (this.boostHeld) fov = 68;
    if (this.partner && this.partner.move && this.partner.move.kind === 'beam') fov = 64;
    this.camera.fov = damp(this.camera.fov, fov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  // ==========================================================================
  // PROJECTILES & VFX
  fireProjectile(from, to, color, element, dmg, fromPartner, wildSource) {
    const geo = new THREE.SphereGeometry(0.45, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    const light = new THREE.PointLight(color, 1.5, 8); mesh.add(light);
    // glow shell
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
    mesh.add(glow);
    this.scene.add(mesh);
    const dir = this.tmp.v1.copy(to).sub(from).normalize();
    const speed = fromPartner ? 30 : 22;
    this.projectiles.push({ mesh, kind: fromPartner ? 'partner' : 'wild', vel: dir.multiplyScalar(speed), dmg, element, color, life: 3, fromPartner, wildSource, aoe: fromPartner });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.kind === 'ball') {
        pr.t += dt;
        const a = clamp(pr.t / pr.dur, 0, 1);
        const pos = this.tmp.v1.copy(pr.from).lerp(pr.to, a);
        pos.y += Math.sin(a * Math.PI) * pr.arc;
        pr.mesh.position.copy(pos);
        pr.mesh.rotation.x += dt * 12; pr.mesh.rotation.z += dt * 8;
        if (a >= 1) {
          this.resolveCatch(pr.target, pr.mesh);
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      pr.life -= dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      pr.mesh.rotation.x += dt * 6;
      let hit = false;
      if (pr.fromPartner) {
        for (const w of this.wilds) {
          if (w.hp <= 0) continue;
          if (pr.mesh.position.distanceTo(w.group.position) < 1.8 + (w.scale || 1)) {
            if (pr.aoe) { for (const w2 of this.wilds) { if (w2.hp > 0 && pr.mesh.position.distanceTo(w2.group.position) < 6) this.damageWild(w2, this.partner.move ? pr.dmg * (w2 === w ? 1 : 0.5) : pr.dmg * 0.5, { silentType: w2 !== w }); } this.spawnRing(pr.mesh.position, pr.color, 6); }
            else this.damageWild(w, pr.dmg, {});
            hit = true; break;
          }
        }
      } else {
        // wild projectile hits partner
        if (this.partner && pr.mesh.position.distanceTo(this.partner.group.position) < 1.8) {
          this.damagePartner(pr.dmg, pr.wildSource); hit = true;
        }
      }
      if (hit || pr.life <= 0) { this.scene.remove(pr.mesh); this.projectiles.splice(i, 1); }
    }
  }

  slashArc(pos, facing, color) {
    const geo = new THREE.RingGeometry(1.2, 2.4, 16, 1, -0.7, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -facing;
    m.rotation.y = 0;
    this.scene.add(m);
    this.vfx.push({ kind: 'fade', obj: m, t: 0, dur: 0.25, scale: 1.6 });
  }

  spawnRing(pos, color, radius) {
    const geo = new THREE.RingGeometry(radius * 0.4, radius * 0.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos); m.position.y += 0.2; m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.vfx.push({ kind: 'ring', obj: m, t: 0, dur: 0.5, scale: radius * 2 });
  }

  streamVfx(from, to, color, dt) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rand(0.25, 0.5), 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    const a = rand(0, 1);
    m.position.copy(from).lerp(to, a * 0.5);
    m.position.x += rand(-0.4, 0.4); m.position.y += rand(-0.3, 0.3); m.position.z += rand(-0.4, 0.4);
    this.scene.add(m);
    const dir = this.tmp.v3.copy(to).sub(from).normalize();
    this.vfx.push({ kind: 'move-fade', obj: m, t: 0, dur: 0.4, vel: dir.multiplyScalar(rand(10, 18)).clone() });
  }

  beamVfx(origin, facing, color, range) {
    if (!this._beamMesh) {
      const geo = new THREE.CylinderGeometry(0.6, 1.0, 1, 16, 1, true);
      this._beamMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.scene.add(this._beamMesh);
      this._beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      this._beamMesh.add(this._beamCore);
    }
    const m = this._beamMesh; m.visible = true; m.material.color.setHex(color);
    const len = range;
    m.scale.set(1 + Math.sin(performance.now() * 0.02) * 0.1, len, 1);
    m.position.copy(origin);
    m.rotation.set(Math.PI / 2, 0, 0);
    m.rotation.z = -facing;
    // orient along facing: rotate cylinder (default Y) to point along XZ facing
    m.quaternion.setFromUnitVectors(this.tmp.v1.set(0, 1, 0), this.tmp.v2.set(Math.sin(facing), 0, Math.cos(facing)));
    m.position.copy(origin).add(this.tmp.v3.set(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(len / 2));
    this._beamMesh.userData.hideAt = performance.now() + 80;
  }

  disposeObj(obj) {
    this.scene.remove(obj);
    obj.traverse ? obj.traverse((o) => { if (o.isMesh) { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); } })
      : (obj.geometry && obj.geometry.dispose(), obj.material && obj.material.dispose && obj.material.dispose());
  }

  updateVfx(dt) {
    // beam auto-hide
    if (this._beamMesh && this._beamMesh.visible && performance.now() > (this._beamMesh.userData.hideAt || 0)) this._beamMesh.visible = false;
    for (let i = this.vfx.length - 1; i >= 0; i--) {
      const v = this.vfx[i]; v.t += dt;
      const a = clamp(v.t / v.dur, 0, 1);
      if (v.kind === 'ring' || v.kind === 'fade') {
        const s = lerp(0.3, v.scale || 2, a);
        if (v.kind === 'ring') v.obj.scale.set(s, s, s);
        else v.obj.scale.setScalar(lerp(0.6, v.scale || 1.6, a));
        v.obj.material.opacity = (1 - a) * 0.85;
      } else if (v.kind === 'move-fade') {
        v.obj.position.addScaledVector(v.vel, dt);
        v.obj.material.opacity = (1 - a) * 0.9;
      } else if (v.kind === 'wobble') {
        // ball wobble before catch resolves
        v.obj.rotation.z = Math.sin(v.t * 12) * 0.4 * (1 - a);
        v.obj.position.y += Math.sin(v.t * 20) * dt * 0.5;
        if (v.t > v.dur) { this.completeCatch(v.wild, v.obj, v.success); this.vfx.splice(i, 1); }
        continue;
      } else if (v.kind === 'downed') {
        // sink slowly; if still here at end, faint (remove)
        v.obj.rotation.z = damp(v.obj.rotation.z, 0.5, 4, dt);
        if (v.t > v.dur) {
          if (this.wilds.includes(v.wild)) { this.removeWild(v.wild); this.afterEncounter(false); }
          this.vfx.splice(i, 1);
        }
        continue;
      } else if (v.kind === 'firework') {
        v.parts.forEach((pt) => { pt.position.addScaledVector(pt.userData.vel, dt); pt.userData.vel.y -= dt * 4; pt.material.opacity = (1 - a); });
        if (a >= 1) { this.disposeObj(v.obj); this.vfx.splice(i, 1); }
        continue;
      }
      if (a >= 1) { this.disposeObj(v.obj); this.vfx.splice(i, 1); }
    }
  }

  spawnFireworks(n) {
    this._fwTimers = this._fwTimers || [];
    for (let k = 0; k < n; k++) {
      const id = setTimeout(() => {
        if (this.sfx) this.sfx.fireworks();
        const center = new THREE.Vector3(rand(-20, 20), rand(14, 26), rand(-20, 20));
        const grp = new THREE.Group(); grp.position.copy(center);
        const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
        const parts = [];
        for (let i = 0; i < 30; i++) {
          const pt = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
          const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9));
          pt.userData.vel = dir; grp.add(pt); parts.push(pt);
        }
        this.scene.add(grp);
        this.vfx.push({ kind: 'firework', obj: grp, parts, t: 0, dur: 1.4 });
      }, k * 350);
      this._fwTimers.push(id);
    }
  }

  // ==========================================================================
  // HUD
  floatDamage(group, dmg, mult, crit, colorOverride) {
    const v = this.tmp.v1.copy(group.position); v.y += (group.userData.height || 2.5) * (group.scale.y || 1);
    v.project(this.camera);
    if (v.z > 1) return; // behind camera
    const left = (v.x * 0.5 + 0.5) * window.innerWidth;
    const top = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const now = performance.now();
    const key = group.uuid;
    this._dmgAgg = this._dmgAgg || {};
    const a = this._dmgAgg[key];
    // Aggregate rapid multi-tick hits (beam/breath/spin) into one rising number.
    if (a && a.el.isConnected && now - a.t < 260 && !crit) {
      a.sum += dmg; a.t = now; a.crit = a.crit || crit;
      a.el.textContent = (a.crit ? '✦' : '') + a.sum;
      a.el.style.left = left + 'px'; a.el.style.top = top + 'px';
      return;
    }
    const layer = $('damage-layer');
    const el = document.createElement('div');
    el.className = 'dmg-num';
    el.textContent = (crit ? '✦' : '') + dmg;
    el.style.fontSize = (crit ? 34 : mult >= 1.5 ? 30 : 22) + 'px';
    el.style.color = colorOverride ? '#ff7733' : crit ? '#ffd24d' : mult >= 1.5 ? '#ffec8a' : mult < 1 ? '#9ab0c8' : '#ffffff';
    el.style.left = left + 'px'; el.style.top = top + 'px';
    layer.appendChild(el);
    this._dmgAgg[key] = { el, sum: dmg, t: now, crit };
    setTimeout(() => el.remove(), 1000);
  }

  showCallout(text, color) {
    const el = $('callout');
    el.textContent = text;
    el.style.color = '#' + (color || 0xffffff).toString(16).padStart(6, '0');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  showCenter(text) {
    const el = $('center-msg'); el.textContent = text; el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1400);
  }

  showAnnouncer(text) {
    const b = $('announcer-banner'); $('announcer-text').textContent = text;
    b.classList.add('show');
    clearTimeout(this._annT); this._annT = setTimeout(() => b.classList.remove('show'), 4200);
  }

  flashScreen(intensity) {
    const o = $('flash-overlay');
    o.style.transition = 'none'; o.style.opacity = String(intensity);
    requestAnimationFrame(() => { o.style.transition = 'opacity 0.4s'; o.style.opacity = '0'; });
  }
  hurtFlash() {
    const v = $('hurt-vignette'); v.style.opacity = '1';
    clearTimeout(this._hurtT); this._hurtT = setTimeout(() => { v.style.opacity = '0'; }, 220);
  }

  // dialogue queue
  queueDialogue(data) {
    this.dialogueQueue = (this.dialogueQueue || []).concat([data]);
    if (!this.dialogueActive) this.nextDialogue();
  }
  nextDialogue() {
    if (!this.dialogueQueue || !this.dialogueQueue.length) { this.dialogueActive = false; $('dialogue').classList.add('hidden'); return; }
    this.dialogueActive = true;
    const data = this.dialogueQueue[0];
    this._dlgLines = (data.lines || []).slice();
    this._dlgName = data.speaker || data.announcer || '';
    $('dialogue').classList.remove('hidden');
    this.showDialogueLine();
  }
  showDialogueLine() {
    if (!this._dlgLines.length) { this.dialogueQueue.shift(); this.nextDialogue(); return; }
    $('dialogue-name').textContent = this._dlgName;
    $('dialogue-text').textContent = this._dlgLines.shift();
    if (this.sfx) this.sfx.uiMove();
  }
  advanceDialogue() {
    if (!this.dialogueActive) return;
    this.showDialogueLine();
  }

  // panels
  updatePlayerPanel() {
    const e = this.state.roster[this.state.activeIdx]; if (!e) return;
    const meta = e.kind === 'starter' ? STARTERS[e.id] : SPECIES_BY_ID[e.id];
    $('player-name').textContent = 'ASH & ' + (this.partner ? this.partner.name : meta.name);
    $('player-level').textContent = 'Lv ' + e.level;
    const hpPct = clamp(e.hp / e.hpMax, 0, 1) * 100;
    const fill = $('player-hp-fill'); fill.style.width = hpPct + '%';
    fill.classList.toggle('low', hpPct < 30);
    $('xp-fill').style.width = clamp(e.xp / e.xpNext, 0, 1) * 100 + '%';
    this.updateMegaUI();
    this.updatePlayerStatus();
  }
  updateMegaUI() {
    const e = this.state.roster[this.state.activeIdx]; if (!e) return;
    const wrap = $('mega-wrap');
    if (e.mega > 0) { $('mega-fill').style.width = clamp(e.mega / 10, 0, 1) * 100 + '%'; wrap.classList.remove('ready'); }
    else if (e.megaReady) { $('mega-fill').style.width = '100%'; wrap.classList.add('ready'); }
    else { $('mega-fill').style.width = clamp((e._megaCharge || 0) / 220, 0, 1) * 100 + '%'; wrap.classList.remove('ready'); }
  }
  updatePlayerStatus() {
    $('status-row').innerHTML = '';
  }

  updateEnemyPanel(w) {
    if (!w || this.locked !== w) { if (!this.locked) { $('enemy-panel').style.opacity = '0'; return; } w = this.locked; }
    $('enemy-panel').style.opacity = '1';
    $('enemy-name').textContent = w.species.name + (w.isBoss ? ' ★BOSS' : '');
    $('enemy-sub').textContent = w.species.element.toUpperCase() + ' · Lv ' + w.level + (w.hp <= 0 ? ' · WEAK! catch it (C)' : '');
    const fill = $('enemy-hp-fill'); const pct = clamp(w.hp / w.hpMax, 0, 1) * 100;
    fill.style.width = pct + '%';
    this.updateEnemyStatus(w);
  }
  updateEnemyStatus(w) {
    const row = $('enemy-status-row'); if (!row) return; row.innerHTML = '';
    const colors = { burn: '#ff7733', soak: '#3fa8ff', paralyze: '#ffe14d', leech: '#57d957' };
    for (const k of ['burn', 'soak', 'paralyze', 'leech']) {
      if (w.statuses && w.statuses[k] > 0) {
        const c = document.createElement('span'); c.className = 'status-chip'; c.textContent = k.toUpperCase();
        c.style.color = colors[k]; row.appendChild(c);
      }
    }
  }

  refreshMoveBar() {
    const names = ELEM[this.partner.element].names;
    for (let i = 1; i <= 6; i++) {
      const slot = $('move-slot-' + i); if (slot) slot.querySelector('.move-name').textContent = names[i - 1];
      const mm = document.querySelector('.mmove[data-move="' + i + '"]');
      if (mm) mm.firstChild.textContent = names[i - 1].split(' ')[0];
    }
  }
  flashMoveSlot(slot) {
    const el = $('move-slot-' + slot); if (!el) return;
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 200);
  }
  refreshCooldownUI() {
    for (let i = 1; i <= 6; i++) {
      const m = MOVES[i - 1];
      const frac = m.cd > 0 ? clamp(this.cooldowns[i] / m.cd, 0, 1) : 0;
      const slot = $('move-slot-' + i);
      if (slot) slot.querySelector('.move-cd').style.transform = `scaleY(${frac})`;
      const mm = document.querySelector('.mmove[data-move="' + i + '"]');
      if (mm) { const cd = mm.querySelector('.move-cd'); if (cd) cd.style.transform = `scaleY(${frac})`; }
    }
  }

  refreshRoster() {
    let bar = $('roster-bar');
    if (!bar) return;
    bar.innerHTML = '';
    for (let i = 0; i < this.state.roster.length; i++) {
      const e = this.state.roster[i];
      const meta = e.kind === 'starter' ? STARTERS[e.id] : SPECIES_BY_ID[e.id];
      const b = document.createElement('div');
      b.className = 'roster-ball' + (i === this.state.activeIdx ? ' active' : '') + (e.hp <= 0 ? ' fainted' : '');
      b.style.setProperty('--rc', '#' + ELEM[e.element].color.toString(16).padStart(6, '0'));
      b.title = meta.name;
      b.textContent = meta.name[0];
      b.addEventListener('click', () => { if (i !== this.state.activeIdx && this.state.phase === 'play') { this.scene.remove(this.partner.group); this.deployPartner(i); } });
      bar.appendChild(b);
    }
  }

  updateScore() { $('score-value').textContent = this.state.score; }
}

// ----------------------------------------------------------------------------
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => { new Game(); });
else new Game();
