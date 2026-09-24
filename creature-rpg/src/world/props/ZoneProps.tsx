import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { buildKind, windMaterial } from './kit';
import { BUILDERS } from './buildings';
import { distToPath, slopeAt, type HeightGrid, sampleGrid } from '../terrain/heightfield';
import { Rng, hashString } from '../../sim/rng';
import { safeRemoveBody } from '../physicsSafe';
import { compassToRotY } from '../yaw';
import { useGame } from '../../state/game';
import { evalExpr } from '../../sim/world';
import { GlowHalos } from '../atmosphere/GlowHalos';

export interface Placed { kind: string; x: number; z: number; y: number; yaw: number; s: number }

/** Deterministic scatter placement (same zone seed → same layout on every device). */
export function scatterZone(zone: ZoneSpec, grid: HeightGrid, density: number): Placed[] {
  const out: Placed[] = [];
  const rng = new Rng([zone.terrain.seed, hashString(zone.id), 7, 11]);
  const [W, D] = zone.terrain.size;
  const paths = zone.terrain.paths ?? [];
  const flats = zone.terrain.flats ?? [];
  const water = zone.terrain.water ?? [];
  const blockers = [
    ...zone.props.map((p) => ({ at: p.at, r: (p.kind.startsWith('hall') || p.kind === 'spire' ? 11 : p.kind.startsWith('house') || p.kind === 'hearth' ? 7 : 3) * (p.s ?? 1) })),
    ...zone.exits.map((e) => ({ at: e.at, r: e.r + 4 })),
    ...zone.spawns.map((s) => ({ at: s.at, r: 3 })),
    ...zone.npcs.map((n) => ({ at: n.at, r: 2.5 })),
    ...zone.trainers.map((n) => ({ at: n.at, r: 2.5 })),
    ...zone.nodes.map((n) => ({ at: n.at, r: 4 })),
    ...zone.battleStages.map((b) => ({ at: b.at, r: 8 })),
  ];
  for (const sc of zone.scatter) {
    const count = Math.round(((sc.density * W * D) / 1000) * density);
    const minDist = sc.minDist ?? 1.5;
    const mine: Placed[] = [];
    let tries = 0;
    while (mine.length < count && tries < count * 12) {
      tries++;
      const x = (rng.int(0, 100000) / 100000 - 0.5) * (W - 10);
      const z = (rng.int(0, 100000) / 100000 - 0.5) * (D - 10);
      const edge = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
      const onRim = edge < zone.terrain.rimWidth * 0.7;
      const isTreeish = /tree|pine|willow|rock|boulder|basalt|icerock|crystal/.test(sc.kind);
      if (onRim && !isTreeish) continue;
      if (sc.avoidPaths !== false && paths.some((p) => distToPath([x, z], p.pts) < p.w * 0.5 + 1.5)) continue;
      if (flats.some((f) => Math.hypot(x - f.at[0], z - f.at[1]) < f.r * (sc.kind === 'grass' || sc.kind === 'flowers' ? 0.7 : 1))) continue;
      const nearWater = water.some((w) => Math.hypot((x - w.at[0]) / w.r, (z - w.at[1]) / (w.rz ?? w.r)) < (sc.kind === 'reeds' ? 1.15 : 1.1));
      if (sc.kind === 'reeds' ? !water.some((w) => Math.abs(Math.hypot((x - w.at[0]) / w.r, (z - w.at[1]) / (w.rz ?? w.r)) - 1.0) < 0.12) : nearWater) continue;
      if (blockers.some((b) => Math.hypot(x - b.at[0], z - b.at[1]) < b.r)) continue;
      if (!isTreeish && slopeAt(grid, x, z) > 0.6) continue;
      if (mine.some((m) => Math.hypot(m.x - x, m.z - z) < minDist)) continue;
      mine.push({ kind: sc.kind, x, z, y: sampleGrid(grid, x, z) - 0.05, yaw: rng.int(0, 628) / 100, s: 0.8 + rng.int(0, 40) / 100 });
    }
    out.push(...mine);
  }
  return out;
}

export function ZoneProps({ zone, grid, density, lowPoly, shadows, hdr = false }: { zone: ZoneSpec; grid: HeightGrid; density: number; lowPoly: boolean; shadows: boolean; hdr?: boolean }) {
  const placed = useMemo(() => {
    // hand-placed scatter kinds (individual trees, rocks, fences…) join the instanced batches
    const hand: Placed[] = zone.props
      .filter((p) => !BUILDERS[p.kind] && !p.showIf && !p.hideIf)
      .map((p) => ({ kind: p.kind, x: p.at[0], z: p.at[1], y: sampleGrid(grid, p.at[0], p.at[1]) - 0.05, yaw: compassToRotY(p.yaw ?? 0), s: p.s ?? 1 }));
    return [...scatterZone(zone, grid, density), ...hand];
  }, [zone, grid, density]);
  const batches = useMemo(() => {
    const byKind = new Map<string, Placed[]>();
    for (const p of placed) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
    const out: { kind: string; mesh: THREE.InstancedMesh; def: ReturnType<typeof buildKind>; items: Placed[] }[] = [];
    for (const [kind, items] of byKind) {
      const def = buildKind(kind, zone.palette, lowPoly);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: /rock|boulder|crystal|icerock|basalt/.test(kind) });
      if (def.sway) windMaterial(mat);
      const mesh = new THREE.InstancedMesh(def.geo, mat, items.length);
      const m = new THREE.Matrix4();
      items.forEach((it, i) => {
        m.compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw), new THREE.Vector3(it.s, it.s, it.s));
        mesh.setMatrixAt(i, m);
      });
      mesh.castShadow = shadows && def.cast;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      out.push({ kind, mesh, def, items });
    }
    return out;
  }, [placed, zone.palette, lowPoly, shadows]);

  const built = useMemo(
    () =>
      zone.props.map((p) => {
        const b = BUILDERS[p.kind]?.({ color: p.color, roof: p.roof, w: p.w, d: p.d, h: p.h, label: p.label });
        if (!b) return null;
        const mesh = new THREE.Mesh(b.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
        const y = sampleGrid(grid, p.at[0], p.at[1]) - 0.1;
        mesh.position.set(p.at[0], y, p.at[1]);
        mesh.rotation.y = compassToRotY(p.yaw ?? 0);
        mesh.scale.setScalar(p.s ?? 1);
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        return { p, b, mesh, y };
      }).filter(Boolean) as { p: ZoneSpec['props'][number]; b: ReturnType<(typeof BUILDERS)[string]>; mesh: THREE.Mesh; y: number }[],
    [zone.props, grid, shadows],
  );

  // night halos for lamps / glowing props (unconditional props only; one draw call)
  const halos = useMemo(
    () =>
      built.flatMap((b) => {
        if (b.p.showIf || b.p.hideIf) return [];
        const ry = b.mesh.rotation.y, s = b.p.s ?? 1;
        return (b.b.glow ?? []).map((g) => ({
          pos: [b.mesh.position.x + (g.pos[0] * Math.cos(ry) + g.pos[2] * Math.sin(ry)) * s, b.y + g.pos[1] * s, b.mesh.position.z + (-g.pos[0] * Math.sin(ry) + g.pos[2] * Math.cos(ry)) * s] as [number, number, number],
          color: g.color,
        }));
      }),
    [built],
  );

  // story-conditional props (gates, blockers, hall pillars): showIf / hideIf flag expressions
  const vis = useGame((st) =>
    built.map((b) => {
      const sv = st.save;
      if (!sv) return '1';
      const show = b.p.showIf ? evalExpr(b.p.showIf, sv) : true;
      const hide = b.p.hideIf ? evalExpr(b.p.hideIf, sv) : false;
      return show && !hide ? '1' : '0';
    }).join(''),
  );

  // colliders (single fixed body for scatter; conditional props rebuild their own body when story flags change)
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const [i, b] of built.entries()) {
      if (vis[i] !== '1') continue;
      const s = b.p.s ?? 1;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.mesh.rotation.y);
      for (const c of b.b.colliders) {
        const off = new THREE.Vector3(...c.at).multiplyScalar(s).applyQuaternion(q);
        world.createCollider(rapier.ColliderDesc.cuboid((c.box[0] * s) / 2, (c.box[1] * s) / 2, (c.box[2] * s) / 2).setTranslation(b.mesh.position.x + off.x, b.y + off.y, b.mesh.position.z + off.z).setRotation(q), body);
      }
    }
    return () => safeRemoveBody(world, body);
  }, [built, vis, world, rapier]);

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const bt of batches) {
      const c = bt.def.collider;
      if (!c) continue;
      for (const it of bt.items) {
        if ('r' in c) world.createCollider(rapier.ColliderDesc.cylinder((c.h * it.s) / 2, c.r * it.s * 0.6).setTranslation(it.x, it.y + (c.h * it.s) / 2, it.z), body);
        else world.createCollider(rapier.ColliderDesc.cuboid((c.box[0] * it.s) / 2, (c.box[1] * it.s) / 2, (c.box[2] * it.s) / 2).setTranslation(it.x, it.y + (c.box[1] * it.s) / 2, it.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw)), body);
      }
    }
    return () => safeRemoveBody(world, body);
  }, [batches, world, rapier]);

  useEffect(
    () => () => {
      for (const b of batches) {
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        b.mesh.dispose();
      }
      for (const b of built) {
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
      }
    },
    [batches, built],
  );

  return (
    <group>
      {batches.map((b) => <primitive key={b.kind} object={b.mesh} />)}
      {built.map((b, i) => (
        <group key={i} visible={vis[i] === '1'}>
          <primitive object={b.mesh} />
          {(b.b.glow ?? []).map((g, j) => (
            <mesh key={j} position={[b.mesh.position.x + g.pos[0] * Math.cos(b.mesh.rotation.y) + g.pos[2] * Math.sin(b.mesh.rotation.y), b.y + g.pos[1], b.mesh.position.z - g.pos[0] * Math.sin(b.mesh.rotation.y) + g.pos[2] * Math.cos(b.mesh.rotation.y)]}>
              <sphereGeometry args={[0.18, 8, 6]} />
              <meshBasicMaterial color={g.color} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <GlowHalos points={halos} hdr={hdr} />
    </group>
  );
}
