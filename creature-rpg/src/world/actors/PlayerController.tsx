// Kinematic trainer controller (rendering doc §2.3): Rapier KinematicCharacterController with
// slope limit, autostep, snap-to-ground, and a fall/ungrounded safety net.
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RigidBody, Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { input } from '../../ui/input/input';
import { runtime, heightAt } from '../../state/runtime';
import { assemble } from '../../creatures/assemble';
import { Animator } from '../../creatures/anim';
import { humanVisual, type HumanLook } from '../../creatures/humans';
import { useSettings } from '../../state/settingsStore';
import { sfx } from '../../audio/sfxBus';
import { safeRemoveBody, safeRemoveController } from '../physicsSafe';

const WALK = 3.4;
const RUN = 6.2;
const HALF = 0.45;
const RADIUS = 0.35;

export function PlayerController({ look, start, killY, hidden = false }: { look: HumanLook; start: { x: number; z: number; yaw: number }; killY: number; hidden?: boolean }) {
  const { world, rapier } = useRapier();
  const quality = useSettings((s) => s.quality);
  const model = useMemo(() => assemble(humanVisual(look), { lod: 0, quality }), [look, quality]);
  const anim = useMemo(() => new Animator(model), [model]);
  const visual = useRef<THREE.Group>(null);
  const refs = useRef<{ body: RigidBody; col: Collider; ctrl: KinematicCharacterController } | null>(null);
  const vel = useRef(new THREE.Vector3());
  const vy = useRef(0);
  const grounded = useRef(true);
  const ungroundedFor = useRef(0);
  const history = useRef<THREE.Vector3[]>([]);
  const stepAcc = useRef(0);

  useEffect(() => {
    const y0 = heightAt(start.x, start.z) + HALF + RADIUS + 0.05;
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, y0, start.z));
    const col = world.createCollider(rapier.ColliderDesc.capsule(HALF, RADIUS), body);
    const ctrl = world.createCharacterController(0.02);
    ctrl.setUp({ x: 0, y: 1, z: 0 });
    ctrl.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    ctrl.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    ctrl.setSlideEnabled(true);
    ctrl.enableAutostep(0.35, 0.2, false);
    ctrl.enableSnapToGround(0.3);
    ctrl.setApplyImpulsesToDynamicBodies(false);
    refs.current = { body, col, ctrl };
    runtime.playerPos.set(start.x, y0 - HALF - RADIUS, start.z);
    runtime.playerYaw = start.yaw;
    runtime.camYaw = start.yaw + Math.PI;
    runtime.lastGrounded.copy(runtime.playerPos);
    return () => {
      safeRemoveController(world, ctrl);
      safeRemoveBody(world, body);
      refs.current = null;
    };
  }, [world, rapier, start.x, start.z, start.yaw]);

  useEffect(() => () => model.dispose(), [model]);

  useBeforePhysicsStep(() => {
    const r = refs.current;
    if (!r) return;
    const dt = 1 / 60;
    if (runtime.teleport) {
      const t = runtime.teleport;
      runtime.teleport = null;
      r.body.setTranslation({ x: t.x, y: t.y + HALF + RADIUS + 0.05, z: t.z }, true);
      r.body.setNextKinematicTranslation({ x: t.x, y: t.y + HALF + RADIUS + 0.05, z: t.z });
      if (t.yaw != null) runtime.playerYaw = t.yaw;
      vel.current.set(0, 0, 0);
      return;
    }
    const [mx, my] = runtime.frozen ? [0, 0] : input.move();
    const run = input.running();
    // camera-relative direction: forward = away from camera
    const yaw = runtime.camYaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const desired = new THREE.Vector3(fx * my + rx * mx, 0, fz * my + rz * mx);
    const target = desired.multiplyScalar(run ? RUN : WALK);
    const acc = target.lengthSq() > vel.current.lengthSq() ? 24 : 30;
    const dv = target.clone().sub(vel.current);
    const maxDv = acc * dt;
    if (dv.length() > maxDv) dv.setLength(maxDv);
    vel.current.add(dv);
    vy.current = grounded.current ? -1.0 : Math.max(vy.current - 22 * dt, -30);
    const move = { x: vel.current.x * dt, y: vy.current * dt, z: vel.current.z * dt };
    r.ctrl.computeColliderMovement(r.col, move, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = r.ctrl.computedMovement();
    const p = r.body.translation();
    const next = { x: p.x + m.x, y: p.y + m.y, z: p.z + m.z };
    r.body.setNextKinematicTranslation(next);
    grounded.current = r.ctrl.computedGrounded();
    // safety net
    if (grounded.current) {
      ungroundedFor.current = 0;
      stepAcc.current += dt;
      if (stepAcc.current > 0.25) {
        stepAcc.current = 0;
        history.current.push(new THREE.Vector3(next.x, next.y - HALF - RADIUS, next.z));
        if (history.current.length > 10) history.current.shift();
      }
    } else ungroundedFor.current += dt;
    if (next.y < killY || ungroundedFor.current > 3) {
      const back = history.current[0] ?? runtime.lastGrounded;
      runtime.teleport = { x: back.x, y: heightAt(back.x, back.z), z: back.z };
      ungroundedFor.current = 0;
    }
  });

  useFrame((_, dtRaw) => {
    const r = refs.current;
    const dt = Math.min(dtRaw, 0.1);
    if (!r) return;
    const p = r.body.translation();
    const prev = runtime.playerPos.clone();
    runtime.playerPos.set(p.x, p.y - HALF - RADIUS, p.z);
    const moved = Math.hypot(runtime.playerPos.x - prev.x, runtime.playerPos.z - prev.z);
    runtime.metersWalked += moved;
    runtime.distSinceBattle += moved;
    if (grounded.current) runtime.lastGrounded.copy(runtime.playerPos);
    const hs = Math.hypot(vel.current.x, vel.current.z);
    runtime.playerSpeed = hs;
    runtime.playerVel.copy(vel.current);
    if (hs > 0.3) {
      const targetYaw = Math.atan2(vel.current.x, vel.current.z);
      let d = targetYaw - runtime.playerYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      runtime.playerYaw += d * Math.min(1, dt * 14);
    }
    if (visual.current) {
      visual.current.position.copy(runtime.playerPos);
      visual.current.rotation.y = runtime.playerYaw;
    }
    anim.reducedMotion = useSettings.getState().reducedMotion;
    anim.setSpeed(hs);
    anim.update(dt);
    // footsteps
    if (hs > 0.5 && grounded.current) {
      footT.current += dt * (hs > 4.5 ? 3.2 : 2.2);
      if (footT.current > 1) {
        footT.current = 0;
        sfx('step');
      }
    }
  });
  const footT = useRef(0);

  return (
    <group ref={visual} visible={!hidden}>
      <primitive object={model.root} />
    </group>
  );
}
