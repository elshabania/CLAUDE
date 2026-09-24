// 3D battle presentation staged in the current zone (rendering doc §2.7, §4.7).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useBattle, type Cue } from './battleStore';
import { SPECIES_VISUALS } from '../creatures/registry';
import { assemble, type CreatureModel } from '../creatures/assemble';
import { Animator } from '../creatures/anim';
import { HumanModel } from '../creatures/humans';
import { LOOKS, playerLook } from '../data/looks';
import { TRAINERS } from '../data/registry';
import { heightAt, runtime } from '../state/runtime';
import { useGame } from '../state/game';
import { useSettings } from '../state/settingsStore';
import { rimUniforms } from '../creatures/materials';
import { TYPE_META } from './text';
import { cry, sfx } from '../audio/sfxBus';
import { CONTENT } from '../data/index';
import type { SideId } from '../sim/battle/types';

interface Slot { model: CreatureModel | null; anim: Animator | null; species: string | null; group: THREE.Group; pop: number; shrink: number }

interface Fx { mesh: THREE.Object3D; t: number; dur: number; update: (k: number, fx: Fx) => void }

export function BattleScene() {
  const { camera, scene } = useThree();
  const quality = useSettings((s) => s.quality);
  const req = useBattle((s) => s.req);
  const stage = runtime.battleStage;
  const root = useMemo(() => new THREE.Group(), []);
  const slots = useRef<Record<SideId, Slot>>({
    player: { model: null, anim: null, species: null, group: new THREE.Group(), pop: 0, shrink: 1 },
    foe: { model: null, anim: null, species: null, group: new THREE.Group(), pop: 0, shrink: 1 },
  });
  const fxList = useRef<Fx[]>([]);
  const lastSeq = useRef(-1);
  const shot = useRef<{ kind: string; t: number; side?: SideId }>({ kind: 'intro', t: 0 });
  const trainers = useRef<{ player?: { m: HumanModel; a: HumanModel }; foe?: { m: HumanModel; a: HumanModel } }>({});
  const endShown = useRef(false);
  const chime = useRef<THREE.Mesh | null>(null);

  // geometry for the stage frame
  const frame = useMemo(() => {
    if (!stage) return null;
    const yaw = ((stage.yaw ?? 90) * Math.PI) / 180;
    const axis = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)); // player -> foe (compass bearing: 0 = north/−z)
    const centre = new THREE.Vector3(stage.x, heightAt(stage.x, stage.z), stage.z);
    return { axis, centre, side: new THREE.Vector3(-axis.z, 0, axis.x) }; // side = player's right
  }, [stage]);

  useEffect(() => {
    scene.add(root);
    root.add(slots.current.player.group, slots.current.foe.group);
    rimUniforms.uRimStrength.value = 0.5;
    return () => {
      scene.remove(root);
      rimUniforms.uRimStrength.value = 0.3;
      for (const sd of ['player', 'foe'] as SideId[]) {
        slots.current[sd].model?.dispose();
        slots.current[sd].group.clear();
        slots.current[sd].model = null;
        slots.current[sd].species = null;
      }
      trainers.current.player?.m.dispose();
      trainers.current.foe?.m.dispose();
      trainers.current = {};
      for (const f of fxList.current) f.mesh.removeFromParent();
      fxList.current = [];
    };
  }, [root, scene]);

  // trainers on stage
  useEffect(() => {
    if (!req || !frame) return;
    const save = useGame.getState().save!;
    const pl = new HumanModel(playerLook(save.player.look.build, save.player.look.skin, save.player.look.hair), { lod: 0, quality });
    trainers.current.player = { m: pl, a: pl };
    endShown.current = false;
    const pp = frame.centre.clone().addScaledVector(frame.axis, -5.4).addScaledVector(frame.side, -1.7);
    pl.root.position.set(pp.x, heightAt(pp.x, pp.z), pp.z);
    pl.root.rotation.y = Math.atan2(frame.axis.x, frame.axis.z);
    root.add(pl.root);
    if (req.trainerId) {
      const t = TRAINERS[req.trainerId];
      const look = LOOKS[t.look] ?? LOOKS.villagerA;
      const fm = new HumanModel(look, { lod: 0, quality });
      fm.setExpression('determined');
      trainers.current.foe = { m: fm, a: fm };
      const fp = frame.centre.clone().addScaledVector(frame.axis, 5.6).addScaledVector(frame.side, 1.7);
      fm.root.position.set(fp.x, heightAt(fp.x, fp.z), fp.z);
      fm.root.rotation.y = Math.atan2(-frame.axis.x, -frame.axis.z);
      root.add(fm.root);
    }
  }, [req, frame, quality, root]);

  const place = (sd: SideId, species: string) => {
    const slot = slots.current[sd];
    if (slot.species === species && slot.model) return;
    slot.model?.dispose();
    slot.group.clear();
    const v = SPECIES_VISUALS[species];
    if (!v) {
      slot.model = null;
      slot.species = species;
      return;
    }
    const m = assemble(v, { lod: 0, quality });
    slot.model = m;
    slot.anim = new Animator(m, CONTENT.species[species]?.stage === 3 ? 1.2 : CONTENT.species[species]?.stage === 2 ? 1.1 : 1);
    slot.species = species;
    // stage presentation scale: large creatures (c30 ≈ 4.8 m long) shrink and tiny ones grow so both faces stay readable
    const L = Math.max(m.bounds.length, m.bounds.height);
    const scale = L > 3 ? 3 / L : L < 1.1 ? 1.1 / L : 1;
    m.root.scale.setScalar(scale);
    slot.group.add(m.root);
  };

  const posFor = (sd: SideId) => {
    if (!frame) return new THREE.Vector3();
    const sp = slots.current;
    const rp = (sp.player.model?.bounds.radius ?? 0.5) * (sp.player.model?.root.scale.x ?? 1);
    const rf = (sp.foe.model?.bounds.radius ?? 0.5) * (sp.foe.model?.root.scale.x ?? 1);
    const half = 1.5 + (rp + rf) * 0.9;
    const p = frame.centre.clone().addScaledVector(frame.axis, sd === 'player' ? -half : half);
    p.y = heightAt(p.x, p.z);
    return p;
  };

  const typeColor = (t?: string) => new THREE.Color(TYPE_META[t ?? 'none']?.color ?? '#ffffff');

  const spawnFx = (cue: Cue, from: SideId, to: SideId) => {
    const kind = cue.vfx ?? 'melee_lunge';
    const col = typeColor(cue.moveType);
    const a = posFor(from).add(new THREE.Vector3(0, 0.6, 0));
    const b = posFor(to).add(new THREE.Vector3(0, 0.6, 0));
    const reduced = useSettings.getState().reducedMotion;
    const mat = () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    const add = (mesh: THREE.Object3D, dur: number, update: Fx['update']) => {
      root.add(mesh);
      fxList.current.push({ mesh, t: 0, dur: reduced ? dur * 0.6 : dur, update });
    };
    if (kind === 'projectile_bolt' || kind === 'projectile_arc') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat());
      add(m, 0.5, (k) => {
        m.position.lerpVectors(a, b, k);
        if (kind === 'projectile_arc') m.position.y += Math.sin(k * Math.PI) * 1.5;
        m.scale.setScalar(1 + Math.sin(k * 20) * 0.15);
      });
    } else if (kind === 'beam') {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 10, 1, true), mat());
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      add(m, 0.55, (k) => {
        (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.9;
        m.scale.set(1 + Math.sin(k * 30) * 0.2, 1, 1 + Math.sin(k * 30) * 0.2);
      });
    } else if (kind === 'rain_down') {
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), mat());
        const off = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
        add(m, 0.6 + i * 0.04, (k) => {
          m.position.copy(b).add(off);
          m.position.y += (1 - k) * 5;
          m.rotation.x += 0.2;
        });
      }
    } else if (kind === 'ground_wave' || kind === 'burst_area' || kind === 'debuff_cloud') {
      const m = new THREE.Mesh(kind === 'ground_wave' ? new THREE.RingGeometry(0.4, 0.8, 32) : new THREE.SphereGeometry(0.5, 16, 12), mat());
      if (kind === 'ground_wave') m.rotation.x = -Math.PI / 2;
      add(m, 0.6, (k) => {
        const p = kind === 'ground_wave' ? a.clone().lerp(b, k) : b.clone();
        m.position.copy(p);
        if (kind === 'ground_wave') m.position.y = heightAt(p.x, p.z) + 0.05;
        m.scale.setScalar(kind === 'ground_wave' ? 1 + k * 2 : 0.4 + k * 2.2);
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
      });
    } else if (kind === 'multi_hit_flurry' || kind === 'melee_lunge' || kind === 'melee_sweep' || kind === 'charge_rush' || kind === 'dash_through') {
      // contact moves: brief trail from attacker toward target
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24, Math.PI), mat());
      add(m, 0.45, (k) => {
        m.position.copy(a).lerp(b, 0.75);
        m.lookAt(b);
        m.rotation.z = k * Math.PI * 1.5;
        (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI);
      });
    } else if (kind === 'aura_self' || kind === 'heal_glow' || kind === 'weather_call' || kind === 'shield') {
      const m = new THREE.Mesh(kind === 'shield' ? new THREE.SphereGeometry(1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(0.8, 0.9, 1.8, 20, 1, true), mat());
      add(m, 0.8, (k) => {
        m.position.copy(posFor(from));
        if (kind !== 'shield') m.position.y += 0.9 + k * 0.4;
        (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * (kind === 'shield' ? 0.35 : 0.5);
        m.rotation.y = k * 3;
      });
    }
  };

  const impactFx = (cue: Cue, sd: SideId) => {
    const col = typeColor(cue.moveType);
    const p = posFor(sd).add(new THREE.Vector3(0, 0.6, 0));
    const n = cue.crit ? 14 : (cue.eff ?? 4) > 4 ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: col, transparent: true, toneMapped: false }));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      root.add(m);
      fxList.current.push({ mesh: m, t: 0, dur: 0.45, update: (k) => {
        m.position.copy(p).addScaledVector(dir, k * 1.4);
        (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      } });
    }
    if (!useSettings.getState().reducedMotion && (cue.crit || (cue.eff ?? 4) > 4)) shake.current = 0.18;
  };
  const shake = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const b = useBattle.getState();
    b.update(dt);
    if (!frame) return;
    const st = b.state;
    // react to newly started cue
    if (b.seq !== lastSeq.current && b.current) {
      lastSeq.current = b.seq;
      const c = b.current;
      const other = (s?: SideId): SideId => (s === 'player' ? 'foe' : 'player');
      if (c.kind === 'sendOut' && c.side && st) {
        const cb = st[c.side].team[c.index ?? st[c.side].active];
        place(c.side, cb.inst.species);
        slots.current[c.side].pop = 0;
        slots.current[c.side].shrink = 1;
        slots.current[c.side].anim?.resetPose();
        cry(cb.inst.species);
        shot.current = { kind: 'focus', t: 0, side: c.side };
        // Tuner throws the Chime to send the kin out (brass bell-lantern prop in hand)
        if (c.side === 'player') trainers.current.player?.a.play('throw');
        if (c.side === 'foe') trainers.current.foe?.a.play('throw');
      }
      if (c.kind === 'recall' && c.side) slots.current[c.side].group.visible = false;
      if (c.kind === 'anim' && c.side) {
        const sl = slots.current[c.side];
        if (c.anim === 'hit') {
          sl.anim?.play('hit');
        } else if (c.anim) {
          sl.anim?.play(c.anim === 'status' ? 'status' : c.anim);
          const tr = trainers.current[c.side];
          if (tr && !tr.a.busy) tr.a.play('command');
          const target = c.vfx && ['aura_self', 'heal_glow', 'weather_call', 'shield'].includes(c.vfx) ? c.side : other(c.side);
          setTimeout(() => spawnFx(c, c.side!, target), 250);
          shot.current = { kind: 'attack', t: 0, side: c.side };
          sfx('move', { type: c.moveType, anim: c.vfx });
        }
      }
      if (c.kind === 'vfx' && c.side) {
        if (c.vfx === 'stat_up' || c.vfx === 'stat_down' || c.vfx === 'heal_glow' || c.vfx === 'shield') spawnFx({ ...c, vfx: c.vfx === 'stat_up' || c.vfx === 'stat_down' ? 'aura_self' : c.vfx }, c.side, c.side);
        else impactFx(c, c.side);
      }
      if (c.kind === 'faint' && c.side) {
        slots.current[c.side].anim?.play('faint');
        if (slots.current[c.side].species) cry(slots.current[c.side].species!, { faint: true });
      }
      if (c.kind === 'capture') {
        // chime arc → absorb → rings → success/breakout
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 6), new THREE.MeshStandardMaterial({ color: '#C8963E', metalness: 0.7, roughness: 0.3, emissive: new THREE.Color('#E8C27A'), emissiveIntensity: 0.4 }));
        root.add(m);
        chime.current = m;
        const a = posFor('player').add(new THREE.Vector3(0, 1.4, 0));
        const bpos = posFor('foe').add(new THREE.Vector3(0, 0.7, 0));
        const rings = c.rings ?? 0;
        const total = c.dur;
        const foe = slots.current.foe;
        foe.anim?.play('capture');
        trainers.current.player?.a.play('throw');
        sfx('chime_throw');
        let rung = 0;
        fxList.current.push({ mesh: m, t: 0, dur: total, update: (k, fx) => {
          const t = fx.t;
          if (t < 0.6) {
            m.position.lerpVectors(a, bpos, t / 0.6);
            m.position.y += Math.sin((t / 0.6) * Math.PI) * 1.2;
            m.rotation.z += 0.3;
          } else if (t < 1.0) {
            foe.shrink = Math.max(0.02, 1 - (t - 0.6) / 0.4);
            m.position.copy(bpos);
            m.position.y = heightAt(bpos.x, bpos.z) + 0.15;
          } else if (t < 1.0 + rings * 0.75) {
            const i = Math.floor((t - 1.0) / 0.75);
            if (i >= rung) {
              rung = i + 1;
              sfx('chime_ring', { n: rung });
              const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: '#E8C27A', transparent: true, toneMapped: false, side: THREE.DoubleSide }));
              ring.position.copy(m.position);
              ring.rotation.x = -Math.PI / 2;
              root.add(ring);
              fxList.current.push({ mesh: ring, t: 0, dur: 0.6, update: (kk) => { ring.scale.setScalar(1 + kk * 3); (ring.material as THREE.MeshBasicMaterial).opacity = 1 - kk; } });
            }
            (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 8)) * 1.2;
          } else if (!c.success) {
            foe.shrink = 1;
            if (!fx.mesh.userData.broke) {
              fx.mesh.userData.broke = true;
              foe.anim?.play('breakout');
              sfx('chime_break');
              m.visible = false;
            }
          } else {
            if (!fx.mesh.userData.bond) {
              fx.mesh.userData.bond = true;
              sfx('chime_bond');
            }
            (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 2;
          }
          void k;
        } });
        shot.current = { kind: 'focus', t: 0, side: 'foe' };
      }
      if (c.kind === 'phase') {
        shot.current = { kind: 'focus', t: 0, side: 'foe' };
        sfx('stone_rehum');
      }
    }
    // update creatures
    for (const sd of ['player', 'foe'] as SideId[]) {
      const sl = slots.current[sd];
      const shown = b.shown[sd];
      sl.group.visible = !!shown?.visible && !!sl.model;
      if (!sl.model || !sl.anim) continue;
      const p = posFor(sd);
      sl.group.position.copy(p);
      const faceYaw = Math.atan2(sd === 'player' ? frame.axis.x : -frame.axis.x, sd === 'player' ? frame.axis.z : -frame.axis.z);
      sl.group.rotation.y = faceYaw;
      sl.pop = Math.min(1, sl.pop + dt * 3);
      const e = 1 - Math.pow(1 - sl.pop, 3);
      sl.anim.extraScale = e * sl.shrink;
      sl.anim.reducedMotion = useSettings.getState().reducedMotion;
      sl.anim.update(dt);
    }
    // trainer staging: command gestures on moves, victory / loss poses at the end
    if (b.phase === 'end' && !endShown.current && st?.outcome) {
      endShown.current = true;
      const won = st.outcome === 'win' || st.outcome === 'captured';
      if (st.outcome === 'win' || st.outcome === 'loss' || st.outcome === 'captured') {
        trainers.current.player?.a.play(won ? 'victory' : 'lose');
        trainers.current.foe?.a.play(won ? 'lose' : 'victory');
      }
    }
    const rm = useSettings.getState().reducedMotion;
    for (const t of [trainers.current.player, trainers.current.foe]) { if (t) { t.a.reducedMotion = rm; t.a.update(dt); } }
    // fx
    fxList.current = fxList.current.filter((f) => {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update(k, f);
      if (f.t >= f.dur) {
        f.mesh.removeFromParent();
        if ((f.mesh as THREE.Mesh).geometry) (f.mesh as THREE.Mesh).geometry.dispose();
        return false;
      }
      return true;
    });
    // camera director
    const s = shot.current;
    s.t += dt;
    const pc = posFor('player');
    const fc = posFor('foe');
    const mid = pc.clone().lerp(fc, 0.5);
    const fh = (slots.current.foe.model?.bounds.height ?? 1) * (slots.current.foe.model?.root.scale.x ?? 1);
    const ph = (slots.current.player.model?.bounds.height ?? 1) * (slots.current.player.model?.root.scale.x ?? 1);
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    const phase = b.phase;
    if (phase === 'intro' && s.kind === 'intro') {
      const ang = 0.6 + s.t * 0.25;
      want.copy(mid).addScaledVector(frame.side, Math.cos(ang) * 6.5).addScaledVector(frame.axis, Math.sin(ang) * 3).add(new THREE.Vector3(0, 2.4, 0));
      look.copy(mid).add(new THREE.Vector3(0, 0.8, 0));
    } else if ((s.kind === 'attack' || s.kind === 'focus') && s.t < 1.4 && s.side) {
      const subj = s.side === 'player' ? pc : fc;
      const h = s.side === 'player' ? ph : fh;
      const toward = s.side === 'player' ? frame.axis : frame.axis.clone().negate();
      want.copy(subj).addScaledVector(toward, 1.8 + h * 1.3).addScaledVector(frame.side, (s.side === 'player' ? 1 : -1) * (1.4 + h * 0.8)).add(new THREE.Vector3(0, 0.6 + h * 0.5, 0));
      look.copy(subj).add(new THREE.Vector3(0, h * 0.55, 0));
    } else {
      // command view: over the player's shoulder, opponent face readable (≥ 8 % of viewport)
      want.copy(pc).addScaledVector(frame.axis, -2.0 - ph * 1.1).addScaledVector(frame.side, 1.3 + ph * 0.7).add(new THREE.Vector3(0, 0.9 + ph * 0.7, 0));
      look.copy(fc).add(new THREE.Vector3(0, fh * 0.45, 0)).lerp(mid, 0.35);
    }
    // keep camera above terrain
    want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.8);
    const k = 1 - Math.exp(-4 * dt);
    camera.position.lerp(want, s.t < 0.05 ? 1 : k);
    if (shake.current > 0) {
      camera.position.x += (Math.random() - 0.5) * shake.current;
      camera.position.y += (Math.random() - 0.5) * shake.current;
      shake.current = Math.max(0, shake.current - dt);
    }
    const cur = (camera as any).__look ?? look.clone();
    cur.lerp(look, k);
    (camera as any).__look = cur;
    camera.lookAt(cur);
  });

  return null;
}
