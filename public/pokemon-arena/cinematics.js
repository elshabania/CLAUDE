// cinematics.js — Pokémon Arena 3D challenger-intro camera cinematic.
// Contract: export createCinematics({ camera, letterboxTop, letterboxBottom })
//   -> { playChallengerIntro(enemyGroup, playerGroup, onDone), skip(), isActive(), update(dt) }
// While isActive() the engine yields camera control; the engine reframes after onDone.

import * as THREE from 'three';

const DURATION = 1.8;          // total intro length (s)
const PHASE_A_END = 0.9;       // low hero orbit around the challenger's face
const PHASE_B_END = 1.55;      // fast swooping pull to the duel two-shot
const ORBIT_RADIUS = 4.5;      // units from enemy head
const ORBIT_SWEEP = THREE.MathUtils.degToRad(70);
const FOV_PUNCH = 8;           // 60 -> 52 -> 60 style punch during the pull
const MAX_DT = 0.1;            // clamp per-step dt so huge frames never explode
const BAR_HEIGHT = 'calc(8vh)';

function smoothstep01(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

// World position of a rig's head: userData.head if present, else feet + height*0.8.
function getHeadWorldPos(group, out) {
  const head = group && group.userData ? group.userData.head : null;
  if (head && typeof head.getWorldPosition === 'function') {
    head.getWorldPosition(out);
    if (Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)) return out;
  }
  group.getWorldPosition(out);
  const h = (group.userData && Number.isFinite(group.userData.height)) ? group.userData.height : 2.0;
  out.y += h * 0.8;
  return out;
}

export function createCinematics({ camera, letterboxTop, letterboxBottom }) {
  let active = false;
  let doneFired = true;        // true => nothing pending
  let onDoneCb = null;
  let t = 0;                   // elapsed time within the cinematic
  let baseFov = camera.fov;    // stored at play start, restored at end
  let barsOut = false;

  // Snapshot of the shot geometry, captured once at play() time.
  const enemyHead = new THREE.Vector3();
  const enemyFeet = new THREE.Vector3();
  const playerFeet = new THREE.Vector3();
  const playerHeadH = { v: 1.6 };          // player height * 0.8 (eye-ish line)

  // Derived keyframes.
  const orbitCenter = new THREE.Vector3(); // enemy head
  let orbitBaseAngle = 0;                  // azimuth from enemy toward player
  let orbitY0 = 0, orbitY1 = 0;            // camera height across phase A
  const pullStart = new THREE.Vector3();   // end of phase A == start of phase B
  const twoShotPos = new THREE.Vector3();  // final over-the-shoulder camera pos
  const twoShotLook = new THREE.Vector3(); // midpoint biased toward the enemy
  const bezierCtrl = new THREE.Vector3();  // curved swoop control point

  // Scratch vectors (no per-frame allocation).
  const _pos = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  function setBars(h) {
    if (letterboxTop && letterboxTop.style) letterboxTop.style.height = h;
    if (letterboxBottom && letterboxBottom.style) letterboxBottom.style.height = h;
  }

  function orbitPosAt(u, out) {
    // u in [0,1] across phase A; subtle ease-in-out on the sweep.
    const e = smoothstep01(u);
    const ang = orbitBaseAngle - ORBIT_SWEEP * 0.5 + ORBIT_SWEEP * e;
    out.set(
      orbitCenter.x + Math.sin(ang) * ORBIT_RADIUS,
      orbitY0 + (orbitY1 - orbitY0) * e,
      orbitCenter.z + Math.cos(ang) * ORBIT_RADIUS
    );
    return out;
  }

  function captureShot(enemyGroup, playerGroup) {
    getHeadWorldPos(enemyGroup, enemyHead);
    enemyGroup.getWorldPosition(enemyFeet);
    playerGroup.getWorldPosition(playerFeet);
    const ph = (playerGroup.userData && Number.isFinite(playerGroup.userData.height))
      ? playerGroup.userData.height : 2.0;
    playerHeadH.v = ph * 0.8;

    // --- Phase A orbit around the challenger's face ---------------------
    orbitCenter.copy(enemyHead);
    // Azimuth of the enemy->player direction: the camera sweeps across the
    // side of the head the player sees (the face, since fighters face off).
    _a.copy(playerFeet).sub(enemyFeet);
    _a.y = 0;
    if (_a.lengthSq() < 1e-6) _a.set(0, 0, 1);
    _a.normalize();
    orbitBaseAngle = Math.atan2(_a.x, _a.z);
    orbitY0 = enemyHead.y - 0.45;            // start slightly below eye line
    orbitY1 = enemyHead.y + 0.15;            // drift up past it
    orbitPosAt(1, pullStart);

    // --- Final duel two-shot: behind/over the player's shoulder ---------
    _b.copy(enemyFeet).sub(playerFeet);      // player -> enemy axis
    _b.y = 0;
    if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1);
    _b.normalize();
    const lateral = _a.set(-_b.z, 0, _b.x);  // horizontal perpendicular
    twoShotPos.copy(playerFeet)
      .addScaledVector(_b, -3.5)             // 3.5 behind the player
      .addScaledVector(lateral, 1.2);        // 1.2 to the side (over-shoulder)
    twoShotPos.y = playerFeet.y + 2.2;       // 2.2 up

    // Look target: player/enemy midpoint, biased toward the enemy.
    _look.copy(playerFeet);
    _look.y += playerHeadH.v * 0.85;
    twoShotLook.copy(_look).lerp(enemyHead, 0.62);

    // Curved swoop: quadratic bezier control point bulged up and outward.
    bezierCtrl.copy(pullStart).lerp(twoShotPos, 0.5);
    bezierCtrl.y += 1.6;
    bezierCtrl.addScaledVector(lateral, 1.4);
  }

  function applyPoseAt(time) {
    if (time <= PHASE_A_END) {
      // Phase A — low hero orbit, locked on the challenger's face.
      orbitPosAt(time / PHASE_A_END, _pos);
      camera.position.copy(_pos);
      camera.lookAt(enemyHead);
      if (camera.fov !== baseFov) {
        camera.fov = baseFov;
        camera.updateProjectionMatrix();
      }
    } else if (time <= PHASE_B_END) {
      // Phase B — fast swooping pull along a curved path to the two-shot.
      const uRaw = (time - PHASE_A_END) / (PHASE_B_END - PHASE_A_END);
      const s = smoothstep01(uRaw);
      // Quadratic bezier: pullStart -> bezierCtrl -> twoShotPos.
      const inv = 1 - s;
      _pos.set(0, 0, 0)
        .addScaledVector(pullStart, inv * inv)
        .addScaledVector(bezierCtrl, 2 * inv * s)
        .addScaledVector(twoShotPos, s * s);
      camera.position.copy(_pos);
      // Look target blends from the enemy head to the duel midpoint.
      _look.copy(enemyHead).lerp(twoShotLook, s);
      camera.lookAt(_look);
      // FOV punch: base -> base-8 -> base (60 -> 52 -> 60 at default fov).
      camera.fov = baseFov - FOV_PUNCH * Math.sin(Math.PI * Math.min(1, Math.max(0, uRaw)));
      camera.updateProjectionMatrix();
    } else {
      // Phase C — hold the two-shot while the letterbox bars animate out.
      camera.position.copy(twoShotPos);
      camera.lookAt(twoShotLook);
      if (camera.fov !== baseFov) {
        camera.fov = baseFov;
        camera.updateProjectionMatrix();
      }
      if (!barsOut) {
        barsOut = true;
        setBars('0px');        // CSS transition handles the slide-out
      }
    }
  }

  function finish() {
    if (!active && doneFired) return;
    active = false;
    // Hard end state: final framing, bars out, fov restored.
    camera.position.copy(twoShotPos);
    camera.lookAt(twoShotLook);
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    if (!barsOut) {
      barsOut = true;
      setBars('0px');
    }
    if (!doneFired) {
      doneFired = true;
      const cb = onDoneCb;
      onDoneCb = null;
      if (typeof cb === 'function') cb();
    }
  }

  function playChallengerIntro(enemyGroup, playerGroup, onDone) {
    // If a previous intro is somehow still pending, resolve it first.
    if (active) finish();
    baseFov = camera.fov;
    captureShot(enemyGroup, playerGroup);
    t = 0;
    active = true;
    doneFired = false;
    onDoneCb = onDone || null;
    barsOut = false;
    setBars(BAR_HEIGHT);       // bars slide in (CSS transition already exists)
    applyPoseAt(0);            // pose immediately — no one-frame pop
  }

  function skip() {
    if (!active) return;
    t = DURATION;
    finish();                  // jumps to end state, fires onDone exactly once
  }

  function isActive() {
    return active;
  }

  function update(dt) {
    if (!active) return;
    // Never NaN / never explode: reject bad dt, clamp huge frames.
    let step = Number.isFinite(dt) ? dt : 0;
    step = Math.min(Math.max(step, 0), MAX_DT);
    t += step;
    if (t >= DURATION) {
      finish();
      return;
    }
    applyPoseAt(t);
  }

  return { playChallengerIntro, skip, isActive, update };
}
