// Cinematics: challenger-intro orbit shot with letterbox bars.
import * as THREE from "three";

const RADIUS = 10, H_START = 4.5, H_END = 2.2, ARC = THREE.MathUtils.degToRad(100);
const BLEND = 0.2; // last 20% eases back to the snapshotted pose

const smoothstep = (t) => t * t * (3 - 2 * t);

let bars = null;
function getBars() {
  if (bars || typeof document === "undefined") return bars;
  const style = document.createElement("style");
  style.textContent = `
    .cine-bar { position: fixed; left: 0; right: 0; height: 0; background: #000;
      z-index: 40; pointer-events: none; transition: height 0.3s ease; }
    .cine-bar.cine-top { top: 0; }
    .cine-bar.cine-bottom { bottom: 0; }
    .cine-bar.cine-on { height: 9vh; }`;
  document.head.appendChild(style);
  const top = document.createElement("div");
  top.className = "cine-bar cine-top";
  const bottom = document.createElement("div");
  bottom.className = "cine-bar cine-bottom";
  document.body.append(top, bottom);
  bars = [top, bottom];
  return bars;
}
function setBars(on) {
  const b = getBars();
  if (b) for (const el of b) el.classList.toggle("cine-on", on);
}

export function createCinematics(camera) {
  let isActive = false;
  let time = 0;
  let duration = 1.8;
  let theta0 = 0;

  // Preallocated scratch — no per-frame allocation.
  const focus = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const orbitPos = new THREE.Vector3();
  const snapPos = new THREE.Vector3();
  const snapQuat = new THREE.Quaternion();
  const shotQuat = new THREE.Quaternion();

  function poseAt(t) {
    // t in [0,1]; writes orbitPos and aims camera via lookTarget.
    const e = smoothstep(t);
    const theta = theta0 + ARC * e;
    const height = THREE.MathUtils.lerp(H_START, H_END, e);
    orbitPos.set(
      focus.x + RADIUS * Math.cos(theta),
      focus.y + height,
      focus.z + RADIUS * Math.sin(theta)
    );
  }

  function applyShot(t) {
    poseAt(t);
    camera.position.copy(orbitPos);
    camera.up.set(0, 1, 0);
    lookTarget.set(focus.x, focus.y + 1.2, focus.z);
    camera.lookAt(lookTarget);

    if (t > 1 - BLEND) {
      // Ease back toward the snapshotted pose for seamless hand-off.
      const k = smoothstep((t - (1 - BLEND)) / BLEND);
      shotQuat.copy(camera.quaternion);
      camera.position.lerpVectors(orbitPos, snapPos, k);
      camera.quaternion.copy(shotQuat).slerp(snapQuat, k);
    }
  }

  function restore() {
    camera.position.copy(snapPos);
    camera.quaternion.copy(snapQuat);
    camera.up.set(0, 1, 0);
  }

  function end() {
    if (!isActive) return;
    isActive = false;
    restore();
    setBars(false);
  }

  return {
    start(focusPos, dur = 1.8) {
      focus.copy(focusPos);
      duration = Math.max(dur, 0.0001);
      time = 0;
      snapPos.copy(camera.position);
      snapQuat.copy(camera.quaternion);
      // Start azimuth on the camera's current side of the focus point.
      theta0 = Math.atan2(snapPos.z - focus.z, snapPos.x - focus.x);
      isActive = true;
      setBars(true);
      applyShot(0);
    },

    get active() {
      return isActive;
    },

    update(dt) {
      if (!isActive) return;
      time += dt;
      if (time >= duration) {
        end();
        return;
      }
      applyShot(time / duration);
    },

    skip() {
      end();
    },
  };
}
