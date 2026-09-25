// Third-person orbit camera with shape-cast collision (rendering doc §2.4).
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useRef } from 'react';
import * as THREE from 'three';
import { input } from '../../ui/input/input';
import { runtime } from '../../state/runtime';
import { useSettings } from '../../state/settingsStore';

const pivot = new THREE.Vector3();
const desired = new THREE.Vector3();

export function ThirdPersonCamera({ enabled = true }: { enabled?: boolean }) {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const cur = useRef(new THREE.Vector3().copy(runtime.playerPos));
  const dist = useRef(runtime.camDist);
  const idle = useRef(0);
  const ball = useRef<any>(null);
  useFrame((_, dtRaw) => {
    if (!enabled) return;
    const dt = Math.min(dtRaw, 0.1);
    const s = useSettings.getState();
    const [dx, dy, zoom] = input.consumeCamera();
    const sens = 0.0042 * s.cameraSensitivity;
    if (!runtime.frozen) {
      runtime.camYaw -= dx * sens;
      runtime.camPitch += dy * sens * (s.invertY ? -1 : 1);
    }
    runtime.camPitch = THREE.MathUtils.clamp(runtime.camPitch, -0.2, 1.05);
    runtime.camDist = THREE.MathUtils.clamp(runtime.camDist + zoom * 0.6, 3, 9);
    // auto-recentre when moving without camera input (touch/gamepad friendliness)
    if (dx === 0 && dy === 0 && runtime.playerSpeed > 1) {
      idle.current += dt;
      if (idle.current > 1.5) {
        const behind = runtime.playerYaw + Math.PI;
        let d = behind - runtime.camYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        runtime.camYaw += THREE.MathUtils.clamp(d, -dt, dt) * 1.05;
      }
    } else idle.current = 0;
    // smoothed pivot
    const target = runtime.playerPos;
    const kh = 1 - Math.exp(-12 * dt);
    const kv = 1 - Math.exp(-8 * dt);
    cur.current.x += (target.x - cur.current.x) * kh;
    cur.current.z += (target.z - cur.current.z) * kh;
    cur.current.y += (target.y - cur.current.y) * kv;
    if (cur.current.distanceTo(target) > 8) cur.current.copy(target);
    pivot.set(cur.current.x, cur.current.y + 1.45, cur.current.z);
    const cp = Math.cos(runtime.camPitch);
    const dir = new THREE.Vector3(Math.sin(runtime.camYaw) * cp, Math.sin(runtime.camPitch), Math.cos(runtime.camYaw) * cp);
    let want = runtime.camDist;
    // collision: sphere cast from pivot toward desired camera position
    if (!ball.current) ball.current = new rapier.Ball(0.25);
    const hit = world.castShape(pivot, { x: 0, y: 0, z: 0, w: 1 }, dir, ball.current, 0, want, true, rapier.QueryFilterFlags.EXCLUDE_KINEMATIC);
    if (hit) want = Math.max(0.8, hit.time_of_impact - 0.1);
    if (want < dist.current) dist.current = want;
    else dist.current += (want - dist.current) * (1 - Math.exp(-6 * dt));
    desired.copy(pivot).addScaledVector(dir, dist.current);
    camera.position.copy(desired);
    camera.lookAt(pivot);
  });
  return null;
}
