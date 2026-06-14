import * as THREE from "three";

// Camera director for the Pokemon arena. Self-contained, allocation-free per frame.
// All scratch vectors are preallocated; no DOM, no top-level await.
export function createCameraDirector(camera) {
  // --- tunables -----------------------------------------------------------
  const TRANSITION = 3.5;        // higher = snappier mode blends
  const FOV_LERP = 4.0;          // fov easing rate
  const SHAKE_DECAY = 6.0;       // screen shake falloff
  const KICK_DECAY = 5.0;        // fov kick falloff
  const CHEST = 1.2;             // Ash chest height above feet

  // --- persistent state ---------------------------------------------------
  let mode = "explore";
  let curFov = 58;
  let shakeAmt = 0;
  let fovKick = 0;
  let orbitTime = 0;             // drives slow auto-orbits (capture/victory/title)
  let initialized = false;

  // Smoothed (actual) camera target & position used for lerping.
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  // --- scratch (reused every frame, never reallocated) --------------------
  const _desiredPos = new THREE.Vector3();
  const _desiredLook = new THREE.Vector3();
  const _tmp = new THREE.Vector3();
  const _tmp2 = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _offset = new THREE.Vector3();
  const _shakeOff = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _zero = new THREE.Vector3();

  function clampToTerrain(pos, terrainHeight, margin) {
    if (typeof terrainHeight === "function") {
      const ground = terrainHeight(pos.x, pos.z) + margin;
      if (pos.y < ground) pos.y = ground;
    }
    return pos;
  }

  // ---- per-mode desired pose computation --------------------------------
  // Each fills _desiredPos / _desiredLook and returns the desired fov.

  function poseExplore(ctx) {
    const yaw = ctx.yaw || 0;
    const pitch = ctx.pitch || 0;
    const speed = Math.max(0, ctx.speed || 0);
    const speedN = Math.min(1, speed / 8);

    // distance breathes: trainer watches from a comfortable distance —
    // in ~7.5 when still, out ~12 when fast.
    const dist = 7.5 + speedN * 4.5;

    // orbit offset behind Ash at yaw/pitch.
    const cp = Math.cos(pitch);
    _offset.set(
      Math.sin(yaw) * cp,
      Math.sin(pitch),
      Math.cos(yaw) * cp
    ).multiplyScalar(dist);

    _desiredLook.copy(ctx.ashPos);
    _desiredLook.y += CHEST;

    _desiredPos.copy(_desiredLook).add(_offset);
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.6);

    return 58 + speedN * 6; // breathing fov
  }

  // Frame the Pokémon clash (partner + target), keeping Ash out of the
  // tight shot so he reads as watching from a distance.
  function poseCommand(ctx) {
    const a = ctx.partnerPos || ctx.ashPos;
    const target = ctx.targetPos || a;
    _mid.copy(a).add(target).multiplyScalar(0.5);
    _mid.y += 0.8;

    const sep = a.distanceTo(target);
    const yaw = ctx.yaw || 0;
    const dist = 6.0 + sep * 0.7;

    const pitch = 0.3;
    const cp = Math.cos(pitch);
    _offset.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist);

    _desiredLook.copy(_mid);
    _desiredPos.copy(_mid).add(_offset);
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.8);
    return 52;
  }

  // Watch the staged duel from behind Ash — over Charizard's shoulder toward
  // the foe (the classic trainer's-eye battle view). Zooms in when a blow lands.
  function poseDuel(ctx) {
    const dir = ctx.duelDir || _tmp2.set(0, 0, 1);
    const home = ctx.duelCharHome || ctx.partnerPos || ctx.ashPos; // Charizard's station
    const zoom = ctx.attackZoom ? 1 : 0;
    const px = dir.z, pz = -dir.x;          // perpendicular (side) axis
    // look out into the gap/foe so the clash is centered and the attacks are
    // clearly visible (don't chase live positions — keeps the shot steady)
    _desiredLook.copy(home).addScaledVector(dir, 5.6);
    _desiredLook.y += 1.3;
    // elevated 3/4 angle: high and offset to the side behind Charizard's station
    // so its wings sit low in the frame instead of covering the battlefield.
    _desiredPos.copy(home).addScaledVector(dir, -(4.4 - zoom * 1.0));
    _desiredPos.x += px * 3.8;
    _desiredPos.z += pz * 3.8;
    _desiredPos.y += 5.8 - zoom * 0.6;
    clampToTerrain(_desiredPos, ctx.terrainHeight, 1.2);
    return 54 - zoom * 5;
  }

  // Riding Charizard: chase cam behind & above the dragon, looking ahead.
  function poseFlight(ctx) {
    const p = ctx.flyerPos || ctx.ashPos;
    const yaw = ctx.flyerYaw || 0;
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    _desiredLook.copy(p); _desiredLook.x += sx * 4; _desiredLook.z += cz * 4; _desiredLook.y += 1.0;
    _desiredPos.set(p.x - sx * 9.5, p.y + 4.6, p.z - cz * 9.5);
    clampToTerrain(_desiredPos, ctx.terrainHeight, 1.5);
    return 62;
  }

  // Punch-in on the Pokémon when an attack lands.
  function poseAttack(ctx) {
    const a = ctx.partnerPos || ctx.ashPos;
    const target = ctx.targetPos || a;
    _mid.copy(a).add(target).multiplyScalar(0.5);
    _mid.y += 0.9;

    const sep = a.distanceTo(target);
    const yaw = ctx.yaw || 0;
    const dist = 4.2 + sep * 0.45;   // tight
    const pitch = 0.22;
    const cp = Math.cos(pitch);
    _offset.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist);

    _desiredLook.copy(_mid);
    _desiredPos.copy(_mid).add(_offset);
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.7);
    return 44;
  }

  // Follow the Seismic Slam: a dramatic side shot that frames the diver and
  // the ground below so the soar + crash both stay on screen.
  function poseSlam(ctx) {
    const a = ctx.partnerPos || ctx.ashPos;
    const groundY = (typeof ctx.terrainHeight === "function") ? ctx.terrainHeight(a.x, a.z) : 0;
    _mid.set(a.x, (a.y + groundY) * 0.5 + 1.0, a.z); // between the dragon and the ground
    const yaw = (ctx.yaw || 0) + 0.6;     // bias to a side angle for drama
    const dist = 13;
    const pitch = 0.16;
    const cp = Math.cos(pitch);
    _offset.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist);

    _desiredLook.copy(_mid);
    _desiredPos.copy(_mid).add(_offset);
    _desiredPos.y += 2.0;
    clampToTerrain(_desiredPos, ctx.terrainHeight, 1.0);
    return 56;
  }

  function poseCapture(ctx, dt) {
    const target = ctx.targetPos || ctx.ashPos;
    orbitTime += dt * 0.5;            // slow orbit
    const radius = 4.5;
    const pitch = 0.14;               // low angle
    const cp = Math.cos(pitch);

    _offset.set(
      Math.sin(orbitTime) * cp,
      Math.sin(pitch),
      Math.cos(orbitTime) * cp
    ).multiplyScalar(radius);

    _desiredLook.copy(target);
    _desiredLook.y += 0.8;
    _desiredPos.copy(target).add(_offset);
    _desiredPos.y += 0.4;
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.5);

    return 40;
  }

  function poseVictory(ctx, dt) {
    orbitTime += dt * 0.35;           // slow rising orbit
    const center = _tmp2.copy(ctx.ashPos);
    if (ctx.partnerPos) center.add(ctx.partnerPos).multiplyScalar(0.5);
    const radius = 6.0;
    const rise = 1.5 + Math.sin(orbitTime * 0.5) * 0.5 + orbitTime * 0.0; // gentle rise via pitch

    const pitch = 0.45;
    const cp = Math.cos(pitch);
    _offset.set(
      Math.sin(orbitTime) * cp,
      Math.sin(pitch),
      Math.cos(orbitTime) * cp
    ).multiplyScalar(radius);

    _desiredLook.copy(center);
    _desiredLook.y += 1.4;
    _desiredPos.copy(center).add(_offset);
    _desiredPos.y += rise;
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.8);

    return 50;
  }

  function poseTitle(ctx, dt) {
    orbitTime += dt * 0.15;           // very slow auto-orbit
    const center = ctx.ashPos || _zero;
    const radius = 8.0;
    const pitch = 0.3;
    const cp = Math.cos(pitch);
    _offset.set(
      Math.sin(orbitTime) * cp,
      Math.sin(pitch),
      Math.cos(orbitTime) * cp
    ).multiplyScalar(radius);

    _desiredLook.copy(center);
    _desiredLook.y += 1.2;
    _desiredPos.copy(center).add(_offset);
    clampToTerrain(_desiredPos, ctx.terrainHeight, 0.8);

    return 54;
  }

  function computeDesired(ctx, dt) {
    switch (mode) {
      case "flight":  return poseFlight(ctx);
      case "duel":    return poseDuel(ctx);
      case "command": return poseCommand(ctx);
      case "attack":  return poseAttack(ctx);
      case "slam":    return poseSlam(ctx);
      case "capture": return poseCapture(ctx, dt);
      case "victory": return poseVictory(ctx, dt);
      case "title":   return poseTitle(ctx, dt);
      case "explore":
      default:        return poseExplore(ctx);
    }
  }

  // ---- public API --------------------------------------------------------
  function setMode(newMode, opts) {
    if (newMode === mode) return;
    mode = newMode;
    // reset orbit phase for orbiting modes so they start cleanly
    if (newMode === "capture" || newMode === "victory" || newMode === "title") {
      if (!opts || opts.resetOrbit !== false) orbitTime = 0;
    }
  }

  function shake(amount) {
    shakeAmt = Math.max(shakeAmt, amount || 0);
  }

  function kickFov(amount) {
    fovKick += amount || 0;
  }

  function update(dt, ctx) {
    if (!ctx || !ctx.ashPos) return;
    const step = Math.min(Math.max(dt || 0, 0), 0.1); // clamp dt for stability

    const desiredFov = computeDesired(ctx, step);

    // First frame: snap to avoid an opening swoop from origin.
    if (!initialized) {
      camPos.copy(_desiredPos);
      camLook.copy(_desiredLook);
      curFov = desiredFov;
      initialized = true;
    }

    // Smooth blend (frame-rate independent lerp).
    const t = 1 - Math.exp(-TRANSITION * step);
    camPos.lerp(_desiredPos, t);
    camLook.lerp(_desiredLook, t);

    // FOV easing + decaying kick.
    const ft = 1 - Math.exp(-FOV_LERP * step);
    curFov += (desiredFov - curFov) * ft;
    fovKick *= Math.exp(-KICK_DECAY * step);

    // Screen shake: decaying random offset applied to position only.
    shakeAmt *= Math.exp(-SHAKE_DECAY * step);
    if (shakeAmt > 1e-4) {
      _shakeOff.set(
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1)
      ).multiplyScalar(shakeAmt);
    } else {
      _shakeOff.set(0, 0, 0);
    }

    // Apply to camera.
    _tmp.copy(camPos).add(_shakeOff);
    camera.position.copy(_tmp);
    camera.up.copy(_up);
    camera.lookAt(camLook);

    const finalFov = curFov + fovKick;
    if (Math.abs(camera.fov - finalFov) > 1e-3) {
      camera.fov = finalFov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    setMode,
    update,
    shake,
    kickFov,
    get mode() { return mode; }
  };
}
