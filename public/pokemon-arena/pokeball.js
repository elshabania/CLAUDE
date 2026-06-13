// ============================================================================
// pokeball.js — Procedural Poké Ball mesh + capture VFX (Three.js r160)
// Self-contained ES module: geometry + canvas textures only, no external URLs,
// no DOM access, no top-level await.
//
// EXPORTS:
//   buildPokeball(scale=1) -> THREE.Group   (origin at center, ~0.5 unit dia)
//   createCaptureFx(scene) -> controller    (pooled, self-managed)
//       .throwBall(from, to, arcHeight=4, duration=0.6, onArrive)
//       .playCapture(at, shakes=3, success=true, onDone)
//       .update(dt)
//
// Engine drive order:
//   fx.throwBall(from, to, arc, dur, () => fx.playCapture(landing, 3, ok, onDone))
//   call fx.update(dt) every frame.
// ============================================================================
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Canvas textures (built once, lazily, cached at module scope)
// ---------------------------------------------------------------------------
let _glowTex = null;
let _starTex = null;
let _sparkTex = null;

function makeCanvas(size) {
  // No DOM: use OffscreenCanvas. Fall back to a shim in headless contexts.
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(size, size);
  }
  return { width: size, height: size, getContext: () => null };
}

function radialTexture(inner, outer, stops) {
  const size = 128;
  const cv = makeCanvas(size);
  const ctx = cv.getContext ? cv.getContext("2d") : null;
  const tex = new THREE.CanvasTexture(cv);
  if (!ctx) {
    tex.needsUpdate = true;
    return tex;
  }
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    inner,
    size / 2,
    size / 2,
    outer
  );
  for (const [pos, col] of stops) g.addColorStop(pos, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.needsUpdate = true;
  return tex;
}

function getGlowTex() {
  if (_glowTex) return _glowTex;
  _glowTex = radialTexture(0, 64, [
    [0.0, "rgba(255,255,255,1)"],
    [0.25, "rgba(255,240,210,0.9)"],
    [0.6, "rgba(255,160,120,0.35)"],
    [1.0, "rgba(255,80,80,0)"],
  ]);
  return _glowTex;
}

function getSparkTex() {
  if (_sparkTex) return _sparkTex;
  _sparkTex = radialTexture(0, 60, [
    [0.0, "rgba(255,255,255,1)"],
    [0.4, "rgba(255,255,255,0.7)"],
    [1.0, "rgba(255,255,255,0)"],
  ]);
  return _sparkTex;
}

function getStarTex() {
  if (_starTex) return _starTex;
  const size = 128;
  const cv = makeCanvas(size);
  const ctx = cv.getContext ? cv.getContext("2d") : null;
  _starTex = new THREE.CanvasTexture(cv);
  if (!ctx) {
    _starTex.needsUpdate = true;
    return _starTex;
  }
  // Soft golden glow behind the star.
  const bg = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  bg.addColorStop(0, "rgba(255,240,170,0.9)");
  bg.addColorStop(1, "rgba(255,200,60,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // 5-point star.
  ctx.translate(64, 64);
  ctx.beginPath();
  const spikes = 5;
  const outerR = 48;
  const innerR = 20;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -outerR, 0, outerR);
  sg.addColorStop(0, "#fff6c8");
  sg.addColorStop(0.5, "#ffd23f");
  sg.addColorStop(1, "#f59e0b");
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(180,110,0,0.7)";
  ctx.stroke();
  _starTex.needsUpdate = true;
  return _starTex;
}

// ---------------------------------------------------------------------------
// buildPokeball
// ---------------------------------------------------------------------------
export function buildPokeball(scale = 1) {
  const g = new THREE.Group();
  const R = 0.25; // radius -> 0.5 diameter
  const SEG = 40;

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xe4222b,
    metalness: 0.3,
    roughness: 0.25,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.3,
    roughness: 0.25,
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x101012,
    metalness: 0.35,
    roughness: 0.35,
  });
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.2,
    roughness: 0.2,
    emissive: 0xffeedd,
    emissiveIntensity: 0.25,
  });

  // Top red hemisphere (phiStart..length so the open edge sits at equator).
  const topGeo = new THREE.SphereGeometry(R, SEG, SEG, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = new THREE.Mesh(topGeo, redMat);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // Bottom white hemisphere.
  const botGeo = new THREE.SphereGeometry(R, SEG, SEG, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const bot = new THREE.Mesh(botGeo, whiteMat);
  bot.castShadow = true;
  bot.receiveShadow = true;
  g.add(bot);

  // Black equator band (a slightly larger torus-ish cylinder ring).
  const bandGeo = new THREE.CylinderGeometry(R * 1.005, R * 1.005, R * 0.16, SEG, 1, true);
  const band = new THREE.Mesh(bandGeo, blackMat);
  band.castShadow = true;
  g.add(band);

  // Center button assembly: black ring + white button, on +z face.
  const btnGroup = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(R * 0.30, R * 0.05, 16, 32);
  const ring = new THREE.Mesh(ringGeo, blackMat);
  btnGroup.add(ring);
  const buttonGeo = new THREE.CircleGeometry(R * 0.28, 28);
  const button = new THREE.Mesh(buttonGeo, buttonMat);
  button.position.z = R * 0.02;
  btnGroup.add(button);
  // Thin white outline ring just outside the black ring.
  const outerRingGeo = new THREE.TorusGeometry(R * 0.40, R * 0.012, 12, 40);
  const outerRing = new THREE.Mesh(
    outerRingGeo,
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.3, roughness: 0.25 })
  );
  btnGroup.add(outerRing);
  // Push button group to the front surface of the ball.
  btnGroup.position.z = R * 0.97;
  btnGroup.castShadow = true;
  g.add(btnGroup);

  g.userData.button = buttonMat;
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------------------
// createCaptureFx — pooled controller
// ---------------------------------------------------------------------------
export function createCaptureFx(scene) {
  const POOL_CAP = 200;

  // Scratch vectors (reused everywhere).
  const _v0 = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _axis = new THREE.Vector3();

  // ---- particle sprite pool ----
  const glowMatTemplate = new THREE.SpriteMaterial({
    map: getGlowTex(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pool = [];
  for (let i = 0; i < POOL_CAP; i++) {
    const s = new THREE.Sprite(glowMatTemplate.clone());
    s.visible = false;
    scene.add(s);
    pool.push({
      sprite: s,
      active: false,
      life: 0,
      maxLife: 1,
      vel: new THREE.Vector3(),
      grav: 0,
      // "suck" particles spiral toward a target instead of free flight.
      mode: "free", // free | suck
      target: new THREE.Vector3(),
      ang: 0,
      angVel: 0,
      radius: 0,
      radVel: 0,
      size0: 0.3,
      size1: 0.0,
      color: new THREE.Color(1, 1, 1),
    });
  }

  function spawnParticle(cfg) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.active) continue;
      p.active = true;
      p.life = 0;
      p.maxLife = cfg.maxLife;
      p.mode = cfg.mode || "free";
      p.grav = cfg.grav || 0;
      p.size0 = cfg.size0;
      p.size1 = cfg.size1 != null ? cfg.size1 : 0;
      p.color.copy(cfg.color || _whiteCol);
      if (cfg.tex) p.sprite.material.map = cfg.tex;
      p.sprite.material.opacity = 1;
      p.sprite.scale.setScalar(cfg.size0);
      p.sprite.position.copy(cfg.pos);
      p.sprite.visible = true;
      if (p.mode === "suck") {
        p.target.copy(cfg.target);
        p.ang = cfg.ang;
        p.angVel = cfg.angVel;
        p.radius = cfg.radius;
        p.radVel = cfg.radVel;
        p.height = cfg.pos.y;
        p.heightVel = cfg.heightVel || 0;
      } else {
        p.vel.copy(cfg.vel || _zeroVec);
      }
      return p;
    }
    return null;
  }
  const _whiteCol = new THREE.Color(1, 1, 1);
  const _zeroVec = new THREE.Vector3();

  function updateParticles(dt) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      if (p.mode === "suck") {
        p.ang += p.angVel * dt;
        p.radius = Math.max(0, p.radius + p.radVel * dt);
        p.height += p.heightVel * dt;
        p.sprite.position.set(
          p.target.x + Math.cos(p.ang) * p.radius,
          p.height,
          p.target.z + Math.sin(p.ang) * p.radius
        );
      } else {
        p.vel.y -= p.grav * dt;
        p.sprite.position.addScaledVector(p.vel, dt);
      }
      const sz = THREE.MathUtils.lerp(p.size0, p.size1, t);
      p.sprite.scale.setScalar(sz);
      p.sprite.material.opacity = 1 - t;
      p.sprite.material.color.copy(p.color);
    }
  }

  // ---- shared one-shot effect meshes (flash, beam, ring) ----
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTex(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
  );
  flash.visible = false;
  scene.add(flash);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff3030,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Cone points up: apex at top by default; we flip so wide end is up.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 24, 1, true), beamMat);
  beam.visible = false;
  scene.add(beam);

  const ringMat = new THREE.MeshBasicMaterial({
    map: getSparkTex(),
    color: 0xffe070,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sparkleRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), ringMat);
  sparkleRing.rotation.x = -Math.PI / 2;
  sparkleRing.visible = false;
  scene.add(sparkleRing);

  // ---- the working ball ----
  const ball = buildPokeball(1);
  ball.visible = false;
  scene.add(ball);

  // ---- state machines ----
  // throw state
  const thr = {
    active: false,
    t: 0,
    dur: 0.6,
    arc: 4,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    onArrive: null,
  };

  // capture sequence state
  const cap = {
    active: false,
    phase: "idle", // open | shut | wobble | result | done
    t: 0,
    at: new THREE.Vector3(),
    shakes: 3,
    shakeIdx: 0,
    success: true,
    onDone: null,
  };

  function resetBall() {
    ball.rotation.set(0, 0, 0);
    ball.scale.setScalar(1);
  }

  // ---------------- throwBall ----------------
  function throwBall(from, to, arcHeight = 4, duration = 0.6, onArrive) {
    thr.active = true;
    thr.t = 0;
    thr.dur = Math.max(0.0001, duration);
    thr.arc = arcHeight;
    thr.from.copy(from);
    thr.to.copy(to);
    thr.onArrive = onArrive || null;
    resetBall();
    ball.visible = true;
    ball.position.copy(from);
    // random spin axis, mostly tumbling forward.
    _axis.set(Math.random() * 0.4, 1, Math.random() * 0.4).normalize();
    thr.axis = _axis.clone();
  }

  function updateThrow(dt) {
    if (!thr.active) return;
    thr.t += dt;
    const t = Math.min(1, thr.t / thr.dur);
    // parabolic arc: lerp horizontal, add sine hump for height.
    _v0.copy(thr.from).lerp(thr.to, t);
    _v0.y += Math.sin(t * Math.PI) * thr.arc;
    ball.position.copy(_v0);
    // fast spin (~ a few rotations over the flight).
    ball.rotateOnAxis(thr.axis, dt * 22);
    if (t >= 1) {
      thr.active = false;
      ball.position.copy(thr.to);
      resetBall();
      const cb = thr.onArrive;
      thr.onArrive = null;
      if (cb) cb();
    }
  }

  // ---------------- playCapture ----------------
  function playCapture(at, shakes = 3, success = true, onDone) {
    cap.active = true;
    cap.phase = "open";
    cap.t = 0;
    cap.at.copy(at);
    cap.shakes = shakes;
    cap.shakeIdx = 0;
    cap.success = success;
    cap.onDone = onDone || null;

    resetBall();
    ball.visible = true;
    ball.position.copy(at);
    // raise the ball a touch so it can "drop" later.
    ball.position.y = at.y + 0.25;

    // White flash at the ball.
    flash.visible = true;
    flash.position.copy(ball.position);
    flash.scale.setScalar(0.5);
    flash.material.opacity = 1;
    flash.material.color.setHex(0xffffff);

    // Red suction beam: wide end up over the target.
    beam.visible = true;
    beam.position.copy(at);
    beam.position.y = at.y + 1.2;
    beam.rotation.set(Math.PI, 0, 0); // wide end up
    beam.scale.set(1, 1, 1);
    beamMat.opacity = 0.0;

    // Burst of red swirl particles to be sucked INTO the ball.
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.5 + Math.random() * 0.6;
      _v1.set(at.x + Math.cos(ang) * rad, at.y + Math.random() * 2.0, at.z + Math.sin(ang) * rad);
      spawnParticle({
        mode: "suck",
        pos: _v1,
        target: ball.position,
        ang,
        angVel: 6 + Math.random() * 4,
        radius: rad,
        radVel: -rad / 0.55, // collapse to center over the open phase
        heightVel: (ball.position.y - _v1.y) / 0.55,
        maxLife: 0.55,
        size0: 0.18 + Math.random() * 0.12,
        size1: 0.02,
        tex: getGlowTex(),
        color: _redCol,
      });
    }
  }
  const _redCol = new THREE.Color(0xff2a2a);
  const _goldCol = new THREE.Color(0xffd23f);

  function endCapture() {
    cap.active = false;
    cap.phase = "idle";
    beam.visible = false;
    flash.visible = false;
    const cb = cap.onDone;
    cap.onDone = null;
    if (cb) cb(cap.success);
  }

  function startResult() {
    cap.phase = "result";
    cap.t = 0;
    if (cap.success) {
      // Gold stars burst upward.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        _v1.copy(ball.position);
        _v1.y += 0.1;
        _v2.set(Math.cos(a) * 0.8, 2.4 + Math.random() * 0.6, Math.sin(a) * 0.8);
        spawnParticle({
          mode: "free",
          pos: _v1,
          vel: _v2,
          grav: 3.2,
          maxLife: 1.1,
          size0: 0.4,
          size1: 0.5,
          tex: getStarTex(),
          color: _goldCol,
        });
      }
      // Sparkle ring expands on the ground.
      sparkleRing.visible = true;
      sparkleRing.position.copy(cap.at);
      sparkleRing.position.y = cap.at.y + 0.02;
      sparkleRing.scale.setScalar(0.3);
      ringMat.opacity = 1;
      // Ball glows.
      ball.userData.button.emissiveIntensity = 1.2;
      // A few gold sparkles.
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        _v1.copy(ball.position);
        _v2.set(Math.cos(a) * 1.5, 1.5 + Math.random() * 1.5, Math.sin(a) * 1.5);
        spawnParticle({
          mode: "free",
          pos: _v1,
          vel: _v2,
          grav: 4,
          maxLife: 0.9,
          size0: 0.18,
          size1: 0.0,
          tex: getSparkTex(),
          color: _goldCol,
        });
      }
    } else {
      // Fail: white flash + ball bursts open + creature "puff".
      flash.visible = true;
      flash.position.copy(ball.position);
      flash.material.opacity = 1;
      flash.scale.setScalar(0.6);
      flash.material.color.setHex(0xffffff);
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random();
        _v1.copy(ball.position);
        _v2.set(
          Math.cos(a) * (1.5 + e),
          1.0 + Math.random() * 2.0,
          Math.sin(a) * (1.5 + e)
        );
        spawnParticle({
          mode: "free",
          pos: _v1,
          vel: _v2,
          grav: 2.0,
          maxLife: 1.0,
          size0: 0.5,
          size1: 0.7,
          tex: getGlowTex(),
          color: _whiteCol,
        });
      }
    }
  }

  function updateCapture(dt) {
    if (!cap.active) return;
    cap.t += dt;

    // Decay the white flash whenever visible.
    if (flash.visible && cap.phase !== "result") {
      flash.material.opacity = Math.max(0, flash.material.opacity - dt * 3);
      flash.scale.setScalar(flash.scale.x + dt * 4);
      if (flash.material.opacity <= 0) flash.visible = false;
    }

    if (cap.phase === "open") {
      const D = 0.55;
      const t = Math.min(1, cap.t / D);
      // Beam pulses up bright then fades.
      beamMat.opacity = Math.sin(t * Math.PI) * 0.8;
      beam.scale.set(1, 1 + t * 0.4, 1);
      // Ball "open" = squash slightly + tip back.
      ball.rotation.x = -0.35 * Math.sin(t * Math.PI);
      ball.scale.set(1 + 0.15 * Math.sin(t * Math.PI), 1 + 0.1 * Math.sin(t * Math.PI), 1);
      if (t >= 1) {
        // snap shut
        cap.phase = "shut";
        cap.t = 0;
        beam.visible = false;
        beamMat.opacity = 0;
        // small white snap flash
        flash.visible = true;
        flash.position.copy(ball.position);
        flash.material.opacity = 0.8;
        flash.scale.setScalar(0.4);
        flash.material.color.setHex(0xfff0e0);
      }
    } else if (cap.phase === "shut") {
      const D = 0.35;
      const t = Math.min(1, cap.t / D);
      resetBall();
      // drop to ground.
      ball.position.y = THREE.MathUtils.lerp(cap.at.y + 0.25, cap.at.y, t * t);
      if (t >= 1) {
        ball.position.y = cap.at.y;
        cap.phase = "wobble";
        cap.t = 0;
        cap.shakeIdx = 0;
      }
    } else if (cap.phase === "wobble") {
      const D = 0.5; // per shake
      const t = Math.min(1, cap.t / D);
      // left/right/left wobble exposed via rotation.z; settle to 0.
      // one shake = full sine over the duration, decaying.
      const dir = cap.shakeIdx % 2 === 0 ? 1 : -1;
      const env = Math.sin(t * Math.PI); // up then back to 0
      ball.rotation.z = dir * 0.5 * env;
      // slight lean as it tilts
      ball.position.x = cap.at.x + dir * 0.06 * env;
      if (t >= 1) {
        ball.rotation.z = 0;
        ball.position.x = cap.at.x;
        cap.shakeIdx++;
        cap.t = 0;
        if (cap.shakeIdx >= cap.shakes) {
          startResult();
        }
      }
    } else if (cap.phase === "result") {
      const D = cap.success ? 1.2 : 1.0;
      const t = Math.min(1, cap.t / D);
      if (cap.success) {
        if (sparkleRing.visible) {
          sparkleRing.scale.setScalar(0.3 + t * 1.6);
          ringMat.opacity = Math.max(0, 1 - t);
          if (t >= 1) sparkleRing.visible = false;
        }
        // pulse the button glow then settle.
        ball.userData.button.emissiveIntensity = 0.25 + 0.9 * (1 - t);
      } else {
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 2.5);
        flash.scale.setScalar(flash.scale.x + dt * 5);
        // ball fades / hides as creature escapes
        if (t > 0.5) ball.visible = false;
      }
      if (t >= 1) {
        if (!cap.success) ball.visible = false;
        ball.userData.button.emissiveIntensity = 0.25;
        endCapture();
      }
    }
  }

  // ---------------- public update ----------------
  function update(dt) {
    if (dt > 0.1) dt = 0.1; // clamp big frame gaps
    updateThrow(dt);
    updateCapture(dt);
    updateParticles(dt);
  }

  return {
    throwBall,
    playCapture,
    update,
    ball, // exposed for convenience (read-only intent)
  };
}
