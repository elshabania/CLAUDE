// Procedural animation runtime driven by part tags (rendering doc §4.5, creatures.md §2.5).
// Time-based (never frame-count based) so timing is identical across quality profiles.
import * as THREE from 'three';
import type { AttackStyle, CreatureModel, RigParams } from './assemble';

export type ActionName = 'attack' | 'special' | 'status' | 'hit' | 'capture' | 'breakout' | 'faint' | 'victory' | 'happy';

interface ActiveAction {
  name: ActionName;
  t: number;
  dur: number;
  contact: number;
  fired: boolean;
  onContact?: () => void;
  onDone?: () => void;
  hold: boolean;
}

const TAU = Math.PI * 2;
const e = new THREE.Euler();
const q = new THREE.Quaternion();

const LEG_PHASE: Record<string, number> = { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI, L: 0, R: Math.PI, ML: Math.PI / 2, MR: -Math.PI / 2, A: 0, B: TAU / 3, C: (2 * TAU) / 3, D: Math.PI / 3, E: Math.PI, F: (5 * Math.PI) / 3 };

function stageDur(stageScale: number, base: number) {
  return base * stageScale;
}

export class Animator {
  time = Math.random() * 10; // phase offset per instance (never breathe in sync)
  speed = 0;                  // m/s locomotion
  moveBlend = 0;
  action: ActiveAction | null = null;
  faintHeld = false;
  reducedMotion = false;
  private rig: RigParams;
  private H: number;
  private stepAcc = 0;
  private sampled = 0;
  glowGain = 1;
  /** External overlay (e.g. capture shrink) applied to pivot scale. */
  extraScale = 1;
  yawOffset = 0;

  constructor(public model: CreatureModel, private stageScale = 1) {
    this.rig = model.visual.rig;
    this.H = model.visual.H;
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  play(name: ActionName, cb: { onContact?: () => void; onDone?: () => void } = {}) {
    const dur: Record<ActionName, number> = {
      attack: stageDur(this.stageScale, 1.0),
      special: stageDur(this.stageScale, 1.05),
      status: 0.9,
      hit: 0.45,
      capture: 0.8,
      breakout: 0.5,
      faint: stageDur(this.stageScale, 1.2),
      victory: 1.4,
      happy: 0.9,
    };
    const contact = name === 'attack' ? 0.45 : name === 'special' ? 0.5 : name === 'status' ? 0.55 : 0;
    if (name !== 'faint') this.faintHeld = false;
    this.action = { name, t: 0, dur: dur[name], contact, fired: false, onContact: cb.onContact, onDone: cb.onDone, hold: name === 'faint' };
    const f = this.model.face;
    if (name === 'attack' || name === 'special' || name === 'status') f.set('determined');
    else if (name === 'hit') f.flash('hurt', 0.6, 'open');
    else if (name === 'capture' || name === 'breakout') f.flash('surprised', 0.8, 'open');
    else if (name === 'faint') f.set('faint');
    else if (name === 'victory' || name === 'happy') f.flash('happy', 1.4, 'open');
  }

  resetPose() {
    this.action = null;
    this.faintHeld = false;
    this.extraScale = 1;
    this.model.face.set('open');
  }

  get busy() {
    return !!this.action && !this.action.hold;
  }

  update(dt: number) {
    const rig = this.rig;
    this.time += dt;
    this.model.face.update(dt);
    const target = Math.min(1, this.speed / 2.5);
    this.moveBlend += (target - this.moveBlend) * Math.min(1, dt * 6);
    let actionT = 0;
    const act = this.action;
    if (act) {
      act.t += dt;
      actionT = Math.min(1, act.t / act.dur);
      if (!act.fired && act.contact > 0 && actionT >= act.contact) {
        act.fired = true;
        act.onContact?.();
      }
      if (act.t >= act.dur) {
        if (act.hold) {
          this.faintHeld = true;
          actionT = 1;
        } else {
          const done = act.onDone;
          if (act.contact > 0 && !act.fired) act.onContact?.();
          this.action = null;
          if (act.name === 'attack' || act.name === 'special' || act.name === 'status') this.model.face.set('open');
          done?.();
        }
      }
    }
    // stepped interpolation (shade family signature)
    let t = this.time;
    if (rig.stepped) {
      this.stepAcc += dt;
      if (this.stepAcc >= 1 / rig.stepped) {
        this.stepAcc = 0;
        this.sampled = this.time;
      }
      t = this.sampled;
    }
    this.pose(t, act && this.action ? actionT : this.faintHeld ? 1 : 0, this.action?.name ?? (this.faintHeld ? 'faint' : null));
  }

  private pose(t: number, at: number, action: ActionName | null) {
    const m = this.model;
    const rig = this.rig;
    const H = this.H;
    const rm = this.reducedMotion ? 0.6 : 1;
    const w = this.moveBlend;
    const fainted = action === 'faint';
    // reset to rest
    for (const [o, r] of m.rest) {
      o.position.copy(r.p);
      o.quaternion.copy(r.q);
      o.scale.copy(r.s);
    }
    const gaitHz = (rig.gaitHz ?? 2) * (0.6 + 0.6 * Math.min(1.6, this.speed / 2.5));
    const gaitPhase = t * TAU * gaitHz;
    const breath = (rig.breath ?? 0.03) * rm * (fainted ? 0 : 1);
    const breathHz = rig.breathHz ?? 0.5;
    for (const [name, tags] of m.tags) {
      if (!tags.length) continue;
      const o = m.parts[name];
      let rx = 0, ry = 0, rz = 0;
      let sy = 1;
      for (const tag of tags) {
        if (tag === 'br') sy *= 1 + breath * Math.sin(t * TAU * breathHz);
        else if (tag === 'look' && !fainted) {
          ry += (0.22 * Math.sin(t * 0.37) + 0.1 * Math.sin(t * 1.3)) * (1 - w * 0.7) * rm;
          rx += 0.05 * Math.sin(t * 0.5) * rm;
        } else if (tag.startsWith('gait')) {
          const leg = tag.split(':')[1] ?? 'L';
          const ph = LEG_PHASE[leg] ?? 0;
          const amp = ((rig.stride ?? 30) * Math.PI) / 180;
          rx += Math.sin(gaitPhase + ph) * amp * w;
          if (rig.type === 'RADIAL') rz += Math.sin(gaitPhase + ph) * amp * 0.5 * w + Math.sin(t * 1.3 + ph) * 0.08;
        } else if (tag.startsWith('chain:') && tags.includes('wave')) {
          const [, iS, nS] = tag.split(':');
          const i = +iS;
          const n = +nS;
          const amp = ((rig.waveAmp ?? 10) * Math.PI) / 180 * rm * (0.35 + 0.65 * w) * (fainted ? 0.1 : 1);
          const hz = (rig.waveHz ?? 0.8) * (1 + w);
          const a = Math.sin(t * TAU * hz - i * 0.75) * amp * (0.5 + i / n);
          if (rig.waveAxis === 'pitch') rx += a;
          else if (rig.waveAxis === 'roll') rz += a;
          else ry += a;
        } else if (tag === 'flap') {
          const side = name.endsWith('_R') ? -1 : 1;
          const amp = ((rig.flapAmp ?? 20) * Math.PI) / 180 * (0.25 + 0.75 * w) * rm * (fainted ? 0 : 1);
          rz += side * Math.sin(t * TAU * (rig.flapHz ?? 2)) * amp;
        } else if (tag === 'spin' && !fainted) {
          ry += t * TAU * (rig.spinHz ?? 2);
        } else if (tag === 'sway' && !fainted) {
          rz += Math.sin(t * 1.1 + name.length) * 0.12 * rm;
        } else if (tag === 'jaw') {
          const open = action === 'attack' || action === 'special' ? Math.sin(Math.min(1, at * 2) * Math.PI) * 0.45 : 0;
          rx += open;
        } else if (tag === 'orbit' && !fainted) {
          ry += t * 0.8;
        }
      }
      if (rx || ry || rz) {
        e.set(rx, ry, rz, 'XYZ');
        q.setFromEuler(e);
        o.quaternion.multiply(q);
      }
      if (sy !== 1) {
        o.scale.y *= sy;
        const xz = 1 / Math.sqrt(sy);
        o.scale.x *= xz;
        o.scale.z *= xz;
      }
    }

    // whole-body (pivot) motion
    const pv = m.pivot;
    let px = 0, py = 0, pz = 0, prx = 0, pry = 0, prz = 0, ps = 1;
    const float = rig.type === 'FLOAT' || rig.type === 'WING' || !!m.visual.hoverGap;
    if (float && !fainted) py += Math.sin(t * TAU * 0.4) * 0.05 * H * rm;
    if (!float && w > 0.05 && !fainted) {
      const b = (rig.bounce ?? 0.04) * H * rm;
      py += Math.abs(Math.sin(gaitPhase)) * b * w * (rig.hop ? 2.5 : 1);
      prx += (((rig.lean ?? 6) * Math.PI) / 180) * w;
    }
    if (rig.type === 'BALL' && w > 0.05) prx += 0; // rolling handled by species tags

    if (action) {
      const a = at;
      const st = rig.attack;
      const style: AttackStyle = action === 'special' ? rig.special ?? 'cast' : st;
      const env = (x0: number, x1: number) => Math.max(0, Math.min(1, (a - x0) / (x1 - x0)));
      const bell = (x0: number, x1: number) => Math.sin(env(x0, x1) * Math.PI);
      if (action === 'attack' || action === 'special') {
        // anticipation (crouch/lean back) then action then settle
        const antic = bell(0, 0.3);
        switch (style) {
          case 'lunge':
            pz += (bell(0.2, 0.8) * 1.2 - antic * 0.15) * H;
            py += bell(0.25, 0.6) * 0.25 * H;
            prx += bell(0.3, 0.6) * 0.3 - antic * 0.15;
            break;
          case 'spin':
            pz += bell(0.15, 0.85) * 0.9 * H;
            pry += env(0.3, 0.65) * TAU;
            break;
          case 'dive':
            py += bell(0, 0.4) * 0.5 * H - bell(0.4, 0.7) * 0.2 * H;
            pz += bell(0.3, 0.85) * 1.4 * H;
            prx += bell(0.35, 0.7) * 0.6;
            break;
          case 'slam':
            prx -= bell(0, 0.45) * 0.5;
            py += bell(0, 0.45) * 0.3 * H;
            pz += bell(0.35, 0.8) * 0.5 * H;
            prx += bell(0.45, 0.7) * 0.35;
            break;
          case 'rear':
            prx -= bell(0, 0.5) * 0.7;
            py += bell(0, 0.5) * 0.15 * H;
            pz += bell(0.4, 0.8) * 0.6 * H;
            break;
          case 'whip':
            pry += bell(0.1, 0.7) * Math.PI * 0.9;
            pz += bell(0.2, 0.8) * 0.5 * H;
            break;
          case 'roll':
            pz += bell(0.1, 0.9) * 1.3 * H;
            prx += env(0.15, 0.75) * TAU;
            break;
          case 'coil':
            ps *= 1 - bell(0, 0.4) * 0.12;
            pz += bell(0.35, 0.75) * 1.0 * H;
            break;
          case 'cast':
          default:
            prx -= antic * 0.2;
            py += bell(0.2, 0.8) * 0.12 * H;
            ps *= 1 + bell(0.35, 0.65) * 0.08;
            break;
        }
        this.glowGain = 1 + bell(0.3, 0.75) * 2.2;
      } else if (action === 'status') {
        py += bell(0, 1) * 0.15 * H;
        ps *= 1 + bell(0.3, 0.7) * 0.06;
        this.glowGain = 1 + bell(0.3, 0.8) * 1.5;
      } else if (action === 'hit') {
        const k = bell(0, 1);
        pz -= k * 0.3 * H;
        prx -= k * 0.25;
        ps *= 1 - bell(0, 0.4) * 0.08;
        this.glowGain = 0.6;
      } else if (action === 'capture') {
        prx -= bell(0, 0.6) * 0.35;
        ps *= 1 + bell(0, 0.5) * 0.1;
      } else if (action === 'breakout') {
        py += bell(0, 1) * 0.35 * H;
        ps *= 1 + bell(0, 0.6) * 0.12;
      } else if (action === 'victory' || action === 'happy') {
        py += Math.abs(Math.sin(a * Math.PI * 2)) * 0.3 * H * rm;
        pry += Math.sin(a * Math.PI * 2) * 0.3;
      } else if (action === 'faint') {
        const k = Math.min(1, a * 1.2);
        const ease = k * k * (3 - 2 * k);
        const mode = rig.faint ?? (float ? 'sink' : 'side');
        if (mode === 'side') {
          prz += ease * (Math.PI / 2) * 0.95;
          py += ease * m.bounds.radius * 0.5 - ease * (m.visual.hoverGap ?? 0) * H;
        } else if (mode === 'forward') {
          prx += ease * 0.9;
          py -= ease * 0.1 * H;
        } else if (mode === 'collapse') {
          ps *= 1 - ease * 0.25;
          prz += ease * 0.2;
        } else {
          py -= ease * ((m.visual.hoverGap ?? 0) * H + 0.05 * H);
          prz += ease * 0.5;
        }
        this.glowGain = 1 - ease;
      }
    } else if (!fainted) this.glowGain += (1 - this.glowGain) * 0.1;

    const r = m.rest.get(pv)!;
    pv.position.set(r.p.x + px, r.p.y + py, r.p.z + pz);
    e.set(prx, pry + this.yawOffset, prz, 'XYZ');
    pv.quaternion.setFromEuler(e);
    pv.scale.setScalar(ps * this.extraScale);
    for (let i = 0; i < m.glowMats.length; i++) m.glowMats[i].emissiveIntensity = m.glowBase[i] * Math.max(0, this.glowGain);
  }
}
