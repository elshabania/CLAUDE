// Zone inhabitants and interactables: NPCs, trainers (sight), roaming wild kin (contact encounters),
// exits, Resonance nodes, pickups and Waystones. All gameplay outcomes go through the game store.
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ZoneSpec, NpcSpec, NodeSpec } from '../zoneTypes';
import { assemble, type CreatureModel } from '../../creatures/assemble';
import { Animator } from '../../creatures/anim';
import { HumanModel } from '../../creatures/humans';
import { LOOKS } from '../../data/looks';
import { SPECIES_VISUALS } from '../../creatures/registry';
import { TRAINERS, DIALOGUE } from '../../data/registry';
import { CONTENT } from '../../data/index';
import { heightAt, runtime } from '../../state/runtime';
import { useGame, wildFor, nearestStage, attunedFor } from '../../state/game';
import { evalExpr } from '../../sim/world';
import { input } from '../../ui/input/input';
import { useSettings } from '../../state/settingsStore';
import { compassToRotY } from '../yaw';
import { sfx, cry } from '../../audio/sfxBus';
import { TYPE_META } from '../../battle/text';
import { safeRemoveBody } from '../physicsSafe';
import { hashString } from '../../sim/rng';
import type { CreatureInstance } from '../../sim/types';

import { REGISTER_UNLOCK } from '../../sim/world';
export const REGISTER_NAME: Record<string, string> = { verdant: 'Rootcall', electric: 'Spark', fire: 'Kindle', water: 'Swell', stone: 'Heave', toxin: 'Seep', gale: 'Gust', shade: 'Veil', frost: 'Rime', lumen: 'Gleam' };
const HALL_OF: Record<string, string> = { i_keynote_1: 'Rootloft Hall', i_keynote_2: 'Knell Hall', i_keynote_3: 'Mere Hall', i_keynote_4: 'Vane Hall', i_keynote_5: 'Forge Hall', i_keynote_6: 'Rime Hall' };

interface Interactable { kind: 'npc' | 'trainer' | 'node' | 'pickup' | 'waystone' | 'exit'; id: string; x: number; z: number; r: number; label: string; act: () => void }

// NPC/trainer people: full-detail model near the player (face, fingers, talk), a reduced LOD (simplified body,
// fewer hair clumps, no face details) beyond ~14 m; models for the same look share cached body shapes.
function useHuman(lookId: string, lod: 0 | 1) {
  const quality = useSettings((s) => s.quality);
  return useMemo(() => new HumanModel(LOOKS[lookId] ?? LOOKS.villagerA, { lod: quality === 'mobile' ? Math.max(1, lod) as 1 : lod, quality }), [lookId, quality, lod]);
}

function Person({ id, name, at, yaw, look, face }: { id?: string; name?: string; at: [number, number]; yaw?: number; look: string; face?: React.MutableRefObject<boolean> }) {
  const [lod, setLod] = useState<0 | 1>(() => (Math.hypot(runtime.playerPos.x - at[0], runtime.playerPos.z - at[1]) < 14 ? 0 : 1));
  const m = useHuman(look, lod);
  const g = useRef<THREE.Group>(null);
  const lodT = useRef(0);
  useEffect(() => () => m.dispose(), [m]);
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.set(at[0], heightAt(at[0], at[1]), at[1]);
    const toP = Math.atan2(runtime.playerPos.x - at[0], runtime.playerPos.z - at[1]);
    const d = Math.hypot(runtime.playerPos.x - at[0], runtime.playerPos.z - at[1]);
    const base = compassToRotY(yaw ?? 180);
    const dlg = useGame.getState().dialogue;
    // mouth moves while this person's line is on screen (speaker name on the line, or the NPC being talked to)
    const line = dlg?.lines[dlg.index];
    const speaker = line?.s || dlg?.speaker || '';
    const talking = !!dlg && !dlg.choiceOpen && ((!!name && speaker === name) || (!!id && dlg.npcId === id && (!line?.s || line.s === dlg.speaker)));
    const target = d < 4 || face?.current || talking ? toP : base;
    let dy = target - g.current.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.current.rotation.y += dy * Math.min(1, dt * 5);
    m.talking = talking;
    m.reducedMotion = useSettings.getState().reducedMotion;
    // animation LOD: distant people tick at a lower rate
    lodT.current += dt;
    if (d < 30 || lodT.current > 0.1) { m.update(Math.min(lodT.current, 0.1)); lodT.current = 0; }
    const want: 0 | 1 = d < 12 ? 0 : d > 16 ? 1 : lod;
    if (want !== lod) setLod(want);
  });
  return (
    <group ref={g}>
      <primitive object={m.root} />
    </group>
  );
}

function NpcBody({ at, yaw }: { at: [number, number]; yaw?: number }) {
  // simple solid collider so the player doesn't walk through people
  const { world, rapier } = useRapier();
  useEffect(() => {
    const b = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(at[0], heightAt(at[0], at[1]) + 0.8, at[1]));
    world.createCollider(rapier.ColliderDesc.capsule(0.45, 0.3), b);
    return () => safeRemoveBody(world, b);
  }, [world, rapier, at]);
  void yaw;
  return null;
}

// ---------------- wild kin ----------------
interface Wild { key: string; inst: CreatureInstance; model: CreatureModel; anim: Animator; pos: THREE.Vector3; target: THREE.Vector3; idle: number; yaw: number; region: { at: [number, number]; r: number }; fleeing: boolean }

function WildKin({ zone, save }: { zone: ZoneSpec; save: NonNullable<ReturnType<typeof useGame.getState>['save']> }) {
  const group = useMemo(() => new THREE.Group(), []);
  const wilds = useRef<Wild[]>([]);
  const respawnAt = useRef(0);
  const counter = useRef(0);
  const quality = useSettings((s) => s.quality);
  const table = zone.encounters;
  const regions = zone.wildRegions;
  const maxWild = Math.min(6, zone.maxWild);
  const spawnOne = (farFromPlayer: number) => {
    if (!table || !regions.length) return;
    const key = `${zone.id}:${counter.current++}:${Math.floor(save.clockMinutes)}`;
    const reg = regions[hashString(key) % regions.length];
    const tableId = zone.id === 'cave' ? (save.flags.flag_cave_heave_gate && hashString(key) % 2 ? 'cave_lower' : 'cave_upper') : table;
    const inst = wildFor(zone.id, save, tableId, key);
    if (!inst || !SPECIES_VISUALS[inst.species]) return;
    let pos: THREE.Vector3 | null = null;
    for (let i = 0; i < 12; i++) {
      const a = (hashString(key + i) % 628) / 100;
      const rr = ((hashString(key + 'r' + i) % 100) / 100) * reg.r;
      const x = reg.at[0] + Math.cos(a) * rr;
      const z = reg.at[1] + Math.sin(a) * rr;
      if (Math.hypot(x - runtime.playerPos.x, z - runtime.playerPos.z) < farFromPlayer) continue;
      pos = new THREE.Vector3(x, heightAt(x, z), z);
      break;
    }
    if (!pos) return;
    const model = assemble(SPECIES_VISUALS[inst.species], { lod: 1, quality });
    const anim = new Animator(model);
    group.add(model.root);
    wilds.current.push({ key, inst, model, anim, pos, target: pos.clone(), idle: 1 + (hashString(key) % 30) / 10, yaw: 0, region: reg, fleeing: false });
  };
  useEffect(() => {
    for (let i = 0; i < Math.min(4, maxWild); i++) spawnOne(25);
    return () => {
      for (const w of wilds.current) {
        w.model.root.removeFromParent();
        w.model.dispose();
      }
      wilds.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.id]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const g = useGame.getState();
    const now = performance.now();
    // remove defeated/captured
    wilds.current = wilds.current.filter((w) => {
      if (g.defeatedWild.has(w.key) && g.mode === 'explore') {
        w.model.root.removeFromParent();
        w.model.dispose();
        respawnAt.current = now + 15000 + (hashString(w.key) % 15000);
        return false;
      }
      return true;
    });
    if (wilds.current.length < maxWild && now > respawnAt.current && g.mode === 'explore') {
      spawnOne(20);
      respawnAt.current = now + 15000;
    }
    const frozen = g.mode !== 'explore';
    const repel = (g.save?.flags.hush_until as number | undefined) ?? 0;
    for (const w of wilds.current) {
      w.model.root.visible = g.mode !== 'battle' || g.battle?.wildKey === w.key ? g.mode !== 'battle' : false;
      if (!frozen) {
        const temper = CONTENT.species[w.inst.species].temperament;
        const dP = Math.hypot(runtime.playerPos.x - w.pos.x, runtime.playerPos.z - w.pos.z);
        if (temper === 'skittish' && dP < 6 && runtime.playerSpeed > 4) {
          const away = new THREE.Vector3(w.pos.x - runtime.playerPos.x, 0, w.pos.z - runtime.playerPos.z).normalize().multiplyScalar(8);
          w.target.copy(w.pos).add(away);
          w.idle = 0;
        } else if (temper === 'curious' && dP < 10 && dP > 2.5) {
          w.target.set(runtime.playerPos.x, 0, runtime.playerPos.z);
        }
        const to = new THREE.Vector3(w.target.x - w.pos.x, 0, w.target.z - w.pos.z);
        const dist = to.length();
        if (dist < 0.3) {
          w.idle -= dt;
          w.anim.setSpeed(0);
          if (w.idle <= 0) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.random() * w.region.r;
            w.target.set(w.region.at[0] + Math.cos(a) * rr, 0, w.region.at[1] + Math.sin(a) * rr);
            w.idle = 2 + Math.random() * 4;
          }
        } else {
          const sp = temper === 'skittish' && dP < 8 ? 4 : 1.4;
          to.normalize();
          const nx = w.pos.x + to.x * sp * dt;
          const nz = w.pos.z + to.z * sp * dt;
          const ny = heightAt(nx, nz);
          // avoid cliffs and water
          if (Math.abs(ny - w.pos.y) < 0.6 && ny > runtime.waterLevel + 0.15) {
            w.pos.set(nx, ny, nz);
          } else w.target.copy(w.pos);
          const ty = Math.atan2(to.x, to.z);
          let d = ty - w.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          w.yaw += d * Math.min(1, dt * 6);
          w.anim.setSpeed(sp);
        }
        // contact trigger (single-encounter lock, cooldown, grace distance, hush repel)
        const hit = dP < 0.45 + w.model.bounds.radius * 0.8 && Math.abs(runtime.playerPos.y - w.pos.y) < 1.5;
        if (hit && !runtime.encounterLock && now >= runtime.encounterCooldownUntil && runtime.distSinceBattle >= 3 && runtime.metersWalked >= repel && g.save!.party.some((u) => g.save!.instances[u].hp > 0)) {
          runtime.encounterLock = true; // set synchronously before dispatch: no stacked encounters
          cry(w.inst.species);
          const stage = nearestStage(zone, runtime.playerPos.x, runtime.playerPos.z);
          g.startBattle({ kind: 'wild', wild: w.inst, wildKey: w.key, stage, weather: g.weather, attuned: attunedFor(zone.id, g.save!) });
          if (!g.save!.seen.includes(w.inst.species)) g.mutate((s) => ({ ...s, seen: [...s.seen, w.inst.species] }));
        }
      }
      w.model.root.position.copy(w.pos);
      w.model.root.rotation.y = w.yaw;
      w.anim.update(frozen ? 0 : dt);
    }
  });
  return <primitive object={group} />;
}

// ---------------- Resonance node visuals ----------------
function NodeVisual({ node, solved }: { node: NodeSpec; solved: boolean }) {
  const col = TYPE_META[node.type]?.color ?? '#ffffff';
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const reduced = useSettings.getState().reducedMotion;
    const k = solved ? 0.3 : reduced ? 1 : 0.7 + Math.sin(clock.elapsedTime * (Math.PI / 0.6)) * 0.3;
    ref.current.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m?.emissiveIntensity != null) m.emissiveIntensity = k * 1.4;
    });
  });
  const y = heightAt(node.at[0], node.at[1]);
  const shape = node.kind === 'boulder' ? <dodecahedronGeometry args={[1.3, 0]} /> : node.kind === 'vent' ? <cylinderGeometry args={[1, 1.2, 0.4, 10]} /> : node.kind === 'falls' ? <boxGeometry args={[3, 4, 0.6]} /> : node.kind === 'veil' ? <planeGeometry args={[3, 3.2]} /> : <cylinderGeometry args={[0.45, 0.6, 1.4, 8]} />;
  return (
    <group ref={ref} position={[node.at[0], y + (node.kind === 'vent' ? 0.2 : node.kind === 'boulder' ? 1.1 : node.kind === 'falls' ? 2 : 0.7), node.at[1]]} rotation-y={compassToRotY(node.yaw ?? 0)}>
      {!(solved && ['boulder', 'veil', 'thorn', 'grate'].includes(node.kind)) && (
        <mesh castShadow>
          {shape}
          <meshStandardMaterial color={node.kind === 'boulder' ? '#8A8578' : node.kind === 'falls' ? (solved ? '#CFEAF5' : '#5FB7C9') : node.kind === 'veil' ? '#4B3F72' : '#9C9384'} emissive={col} emissiveIntensity={1} transparent={node.kind === 'veil' || node.kind === 'falls'} opacity={node.kind === 'veil' ? 0.7 : node.kind === 'falls' ? 0.85 : 1} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!solved && (
        <mesh position={[0, node.kind === 'boulder' ? 1.5 : 1.2, 0]}>
          <torusGeometry args={[0.35, 0.05, 6, 20]} />
          <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.4} />
        </mesh>
      )}
    </group>
  );
}

function Blockers({ zone, save }: { zone: ZoneSpec; save: NonNullable<ReturnType<typeof useGame.getState>['save']> }) {
  // solid walls for unsolved nodes' blockers and closed exits
  const { world, rapier } = useRapier();
  const key = zone.nodes.filter((n) => n.blocker && !save.nodes.includes(n.id)).map((n) => n.id).join(',');
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const n of zone.nodes) {
      if (!n.blocker || save.nodes.includes(n.id)) continue;
      const b = n.blocker;
      const y = heightAt(b.at[0], b.at[1]);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), compassToRotY(b.yaw ?? 0));
      world.createCollider(rapier.ColliderDesc.cuboid(b.w / 2, 3, b.d / 2).setTranslation(b.at[0], y + 2, b.at[1]).setRotation(q), body);
    }
    return () => safeRemoveBody(world, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, world, rapier]);
  return (
    <group>
      {zone.nodes.filter((n) => n.blocker && !save.nodes.includes(n.id)).map((n) => (
        <mesh key={n.id} position={[n.blocker!.at[0], heightAt(n.blocker!.at[0], n.blocker!.at[1]) + 1.2, n.blocker!.at[1]]} rotation-y={compassToRotY(n.blocker!.yaw ?? 0)} castShadow>
          <boxGeometry args={[n.blocker!.w, 2.4, n.blocker!.d]} />
          <meshStandardMaterial color={n.kind === 'vine' ? '#3E7045' : n.kind === 'boulder' ? '#7B7669' : n.kind === 'falls' ? '#5FB7C9' : n.kind === 'thorn' ? '#5B4636' : '#6B6F78'} roughness={0.9} transparent={n.kind === 'falls'} opacity={n.kind === 'falls' ? 0.8 : 1} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------- main component ----------------
export function ZoneActors({ zone }: { zone: ZoneSpec }) {
  const save = useGame((s) => s.save)!;
  const mode = useGame((s) => s.mode);
  const facing = useRef(false);
  const interactables = useRef<Interactable[]>([]);
  const trainerApproach = useRef<string | null>(null);
  const exitCooldown = useRef(performance.now() + 1500);

  const visibleNpcs = zone.npcs.filter((n) => evalExpr(n.showIf, save) && !(n.hideIf && evalExpr(n.hideIf, save)));
  const visibleTrainers = zone.trainers.filter((t) => TRAINERS[t.id] && evalExpr((t as any).showIf, save) && !((t as any).hideIf && evalExpr((t as any).hideIf, save)));
  const pickups = zone.pickups.filter((p) => !save.pickups.includes(p.id) && evalExpr(p.showIf, save));

  const hasType = (t: string) => save.party.some((u) => CONTENT.species[save.instances[u].species].types.includes(t as any));
  const unlocked = (t: string) => {
    const k = REGISTER_UNLOCK[t];
    if (!k) return true;
    return k.startsWith('i_') ? (save.inventory[k] ?? 0) > 0 : !!save.flags[k];
  };

  // build interactables each render (cheap; zone-scale lists)
  const list: Interactable[] = [];
  for (const n of visibleNpcs) {
    list.push({ kind: 'npc', id: n.id, x: n.at[0], z: n.at[1], r: 2.4, label: `Talk to ${n.name}`, act: () => useGame.getState().talk(n.dialogue, { speaker: n.name, npcId: n.id, look: n.look }) });
  }
  for (const t of visibleTrainers) {
    const def = TRAINERS[t.id];
    const beaten = save.defeatedTrainers.includes(t.id);
    list.push({
      kind: 'trainer', id: t.id, x: t.at[0], z: t.at[1], r: 2.4, label: `Talk to ${def.name}`,
      act: () => {
        const g = useGame.getState();
        const dlg = `dlg_${t.id}`;
        if (beaten) {
          if (!!DIALOGUE[dlg + '_after']) g.talk(dlg + '_after', { speaker: def.name });
          else g.toast(`${def.name}: "${def.lines?.lose ?? 'Good battle!'}"`);
          return;
        }
        startTrainer(t.id);
      },
    });
  }
  for (const n of zone.nodes) {
    const solved = save.nodes.includes(n.id);
    if (solved) continue;
    const reg = REGISTER_NAME[n.type];
    const ok = unlocked(n.type);
    const typed = hasType(n.type);
    const label = !ok ? `This register is still silent — earn the Keynote of ${HALL_OF[REGISTER_UNLOCK[n.type] ?? ''] ?? 'a Cadence Hall'}.` : !typed ? `Needs a ${TYPE_META[n.type].name} kin in your troupe.` : `Resonate — ${reg}`;
    list.push({
      kind: 'node', id: n.id, x: n.at[0], z: n.at[1], r: 3, label,
      act: () => {
        const g = useGame.getState();
        if (!ok || !typed) {
          g.toast(label, 'warn');
          if (n.mandatory && ok && !typed) g.toast('A Resonance Steward nearby can help.', 'info');
          return;
        }
        const performer = save.party.map((u) => save.instances[u]).find((i) => CONTENT.species[i.species].types.includes(n.type));
        sfx('res_trigger', { type: n.type });
        if (performer) cry(performer.species, { happy: true });
        g.mutate((s) => {
          let ns = { ...s, nodes: [...s.nodes, n.id] };
          if (n.reward?.item) ns = { ...ns, inventory: { ...ns.inventory, [n.reward.item]: (ns.inventory[n.reward.item] ?? 0) + (n.reward.count ?? 1) } };
          if (n.reward?.money) ns = { ...ns, player: { ...ns.player, money: ns.player.money + n.reward.money } };
          if (n.sets) ns = { ...ns, flags: { ...ns.flags, [n.sets]: true } };
          return ns;
        }, 'resonance');
        g.toast(`${performer ? CONTENT.species[performer.species].name : 'Your kin'} sings ${reg}! The ${n.kind} transforms.`, 'good');
        if (n.reward?.item) g.toast(`Found ${CONTENT.items[n.reward.item]?.name}!`, 'good');
      },
    });
  }
  for (const p of pickups) {
    list.push({
      kind: 'pickup', id: p.id, x: p.at[0], z: p.at[1], r: 2, label: p.hidden ? 'Something glints here' : 'Pick up',
      act: () => {
        const g = useGame.getState();
        g.mutate((s) => {
          let ns = { ...s, pickups: [...s.pickups, p.id] };
          if (p.item && p.item !== 'money') ns = { ...ns, inventory: { ...ns.inventory, [p.item]: Math.min(99, (ns.inventory[p.item] ?? 0) + (p.count ?? 1)) } };
          if ((p as any).money) ns = { ...ns, player: { ...ns.player, money: ns.player.money + (p as any).money } };
          return ns;
        }, 'pickup');
        sfx('item_pickup');
        g.toast(p.item && p.item !== 'money' ? `Found ${CONTENT.items[p.item]?.name ?? p.item}${(p.count ?? 1) > 1 ? ' ×' + p.count : ''}!` : `Found ◇ ${(p as any).money}!`, 'good');
      },
    });
  }
  if (zone.waystone) {
    const wid = `ws_${zone.id}`;
    const reg = save.waystones.includes(wid);
    list.push({
      kind: 'waystone', id: wid, x: zone.waystone[0], z: zone.waystone[1], r: 3, label: reg ? 'Waystone — travel' : 'Resonate with the Chordstone',
      act: () => {
        const g = useGame.getState();
        if (!reg) {
          g.mutate((s) => ({ ...s, waystones: [...s.waystones, wid], flags: { ...s.flags, [`flag_ws_${zone.id}`]: true } }), 'waystone');
          sfx('res_waystone_register');
          g.toast(`Waystone registered: ${zone.name}. You can travel here from any Chordstone.`, 'good');
        } else {
          useGame.setState({ mode: 'menu', menuTab: 'travel' });
          runtime.frozen = true;
        }
      },
    });
  }
  interactables.current = list;

  function startTrainer(tid: string) {
    const g = useGame.getState();
    const def = TRAINERS[tid];
    const pre = `dlg_${tid}_pre`;
    const exists = !!DIALOGUE[pre];
    const go = () => useGame.getState().runActions([{ battle: tid }]); // post-battle dialogue is played by the battle action
    if (exists) g.talk(pre, { speaker: def.name, onDone: go });
    else go();
  }

  // interaction + trainer sight + exits
  useEffect(() => {
    const off = input.on((a) => {
      if (a !== 'interact') return;
      const g = useGame.getState();
      if (g.mode !== 'explore') return;
      const best = nearest();
      if (best) best.act();
    });
    return () => {
      off();
    };
  }, []);

  function nearest(): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of interactables.current) {
      const d = Math.hypot(it.x - runtime.playerPos.x, it.z - runtime.playerPos.z);
      if (d < it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  useFrame(() => {
    const g = useGame.getState();
    if (g.mode !== 'explore') {
      if (g.interactHint) useGame.setState({ interactHint: null });
      return;
    }
    const best = nearest();
    const hint = best ? best.label : null;
    if (hint !== g.interactHint) useGame.setState({ interactHint: hint });
    // exits
    if (performance.now() > exitCooldown.current) {
      for (const e of zone.exits) {
        const d = Math.hypot(e.at[0] - runtime.playerPos.x, e.at[1] - runtime.playerPos.z);
        if (d < e.r) {
          if (e.gate && !((e.gate.flag ? evalExpr(e.gate.flag, g.save!) : true) && (e.gate.register ? g.save!.nodes.includes(e.gate.register) : true))) {
            exitCooldown.current = performance.now() + 2500;
            g.toast(e.gate.message, 'warn');
            return;
          }
          const node = zone.nodes.find((n) => n.opens === e.id);
          if (node && !g.save!.nodes.includes(node.id)) {
            exitCooldown.current = performance.now() + 2500;
            g.toast(`The way is blocked. ${REGISTER_NAME[node.type]} (${TYPE_META[node.type].name}) could open it.`, 'warn');
            return;
          }
          exitCooldown.current = performance.now() + 4000;
          g.warp(e.to, e.spawn);
          return;
        }
      }
    }
    // trainer sight: approach then battle
    if (!trainerApproach.current && !runtime.encounterLock) {
      for (const t of visibleTrainers) {
        const def = TRAINERS[t.id];
        const sight = (t as any).sight ?? def.sight;
        if (!sight || g.save!.defeatedTrainers.includes(t.id)) continue;
        const d = Math.hypot(t.at[0] - runtime.playerPos.x, t.at[1] - runtime.playerPos.z);
        if (d < sight && g.save!.party.some((u) => g.save!.instances[u].hp > 0)) {
          trainerApproach.current = t.id;
          sfx('battle_start_trainer');
          g.toast(`${def.title} ${def.name} spotted you!`, 'info');
          setTimeout(() => {
            trainerApproach.current = null;
            startTrainer(t.id);
          }, 700);
          break;
        }
      }
    }
  });

  void mode;
  return (
    <group>
      {visibleNpcs.map((n: NpcSpec) => (
        <group key={n.id}>
          <Person id={n.id} name={n.name} at={n.at} yaw={n.yaw} look={n.look} face={facing} />
          <NpcBody at={n.at} />
        </group>
      ))}
      {visibleTrainers.map((t) => (
        <group key={t.id}>
          <Person id={t.id} name={TRAINERS[t.id].name} at={t.at} yaw={(t as any).yaw} look={TRAINERS[t.id].look} />
          <NpcBody at={t.at} />
        </group>
      ))}
      {zone.nodes.map((n) => <NodeVisual key={n.id} node={n} solved={save.nodes.includes(n.id)} />)}
      <Blockers zone={zone} save={save} />
      {pickups.filter((p) => !p.hidden).map((p) => (
        <mesh key={p.id} position={[p.at[0], heightAt(p.at[0], p.at[1]) + 0.35, p.at[1]]}>
          <octahedronGeometry args={[0.22]} />
          <meshStandardMaterial color="#E8C27A" emissive="#C8963E" emissiveIntensity={0.8} />
        </mesh>
      ))}
      <WildKin zone={zone} save={save} />
    </group>
  );
}
