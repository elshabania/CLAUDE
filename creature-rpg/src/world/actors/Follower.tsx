// Lead-kin follower (rendering doc §2.5): breadcrumb trail, no collider, never blocks the player.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SPECIES_VISUALS } from '../../creatures/registry';
import { assemble } from '../../creatures/assemble';
import { Animator } from '../../creatures/anim';
import { runtime, heightAt } from '../../state/runtime';
import { useSettings } from '../../state/settingsStore';

export function Follower({ species }: { species: string }) {
  const quality = useSettings((s) => s.quality);
  const model = useMemo(() => (SPECIES_VISUALS[species] ? assemble(SPECIES_VISUALS[species], { lod: 1, quality }) : null), [species, quality]);
  const anim = useMemo(() => (model ? new Animator(model) : null), [model]);
  const group = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Vector3[]>([]);
  const pos = useRef(new THREE.Vector3().copy(runtime.playerPos).add(new THREE.Vector3(0, 0, 1.5)));
  const yaw = useRef(0);
  const idleT = useRef(0);
  useEffect(() => () => model?.dispose(), [model]);
  useFrame((_, dtRaw) => {
    if (!model || !anim || !group.current) return;
    const dt = Math.min(dtRaw, 0.1);
    const p = runtime.playerPos;
    const t = trail.current;
    if (!t.length || t[t.length - 1].distanceTo(p) > 0.2) {
      t.push(p.clone());
      if (t.length > 128) t.shift();
    }
    const follow = THREE.MathUtils.clamp(1.2 + model.bounds.radius * 1.5, 1.5, 4);
    // walk back along the trail by `follow` metres
    let target = t[0] ?? p;
    let acc = 0;
    for (let i = t.length - 1; i > 0; i--) {
      acc += t[i].distanceTo(t[i - 1]);
      if (acc >= follow) {
        target = t[i - 1];
        break;
      }
    }
    const cur = pos.current;
    if (cur.distanceTo(p) > 12 || runtime.teleport) {
      cur.copy(p).add(new THREE.Vector3(Math.sin(runtime.playerYaw + Math.PI) * follow, 0, Math.cos(runtime.playerYaw + Math.PI) * follow));
      t.length = 0;
    }
    const d = new THREE.Vector3(target.x - cur.x, 0, target.z - cur.z);
    const dist = d.length();
    const speed = Math.min(dist * 3, Math.max(runtime.playerSpeed * 1.15, 0.5));
    if (dist > 0.05 && acc >= follow * 0.5) {
      d.normalize();
      cur.x += d.x * speed * dt;
      cur.z += d.z * speed * dt;
      const ty = Math.atan2(d.x, d.z);
      let dy = ty - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * Math.min(1, dt * 8);
      anim.setSpeed(speed);
      idleT.current = 0;
    } else {
      anim.setSpeed(0);
      idleT.current += dt;
      // face the trainer when close and idle
      const toP = Math.atan2(p.x - cur.x, p.z - cur.z);
      let dy = toP - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * Math.min(1, dt * 3);
      if (idleT.current > 6 && !anim.busy) {
        anim.play('happy');
        idleT.current = 0;
      }
    }
    cur.y = heightAt(cur.x, cur.z);
    group.current.position.copy(cur);
    group.current.rotation.y = yaw.current;
    anim.reducedMotion = useSettings.getState().reducedMotion;
    anim.update(dt);
  });
  if (!model) return null;
  return (
    <group ref={group}>
      <primitive object={model.root} />
    </group>
  );
}
