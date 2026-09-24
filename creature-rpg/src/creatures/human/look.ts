// Resolve a HumanLook (data/looks.ts) into concrete body/face/outfit parameters.
import type { HumanLook, Wear } from './types';

export interface ResolvedLook extends HumanLook {
  sex: 'f' | 'm' | 'n';
  presetWeights: Record<string, number>;
  height: number;
  headScale: number;
  handScale: number;
  browColor: string;
  browThick: number;
  browArch: number;
  age: number;
  freckles: number;
  blush: number;
  iris: string;
  wear: Wear;
  /** shoe sole thickness lifting the body */
  soleLift: number;
  /** upper-back curve for elders (radians) */
  hunch: number;
  seed: number;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const HEIGHT: Record<HumanLook['build'], number> = { child: 1.36, teen: 1.64, slim: 1.78, adult: 1.72, broad: 1.8, elder: 1.62 };

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = [16, 8, 0].map((s) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function defaultWear(l: HumanLook): Wear {
  const ex = new Set(l.extras ?? []);
  const long = ex.has('coat') || ex.has('cape');
  return {
    outer: ex.has('coat') ? 'coat' : ex.has('apron') || ex.has('shawl') ? 'none' : l.build === 'child' ? 'none' : 'jacket',
    outerSleeve: ex.has('coat') ? 2 : 1.6,
    inner: ex.has('collar') ? 'turtleneck' : 'shirt',
    innerSleeve: ex.has('apron') ? 1.1 : 2,
    legs: l.skirt ? (long ? 'longskirt' : 'skirt') : 'trousers',
    legLen: 2.08,
    shoe: l.build === 'elder' ? 'shoe' : 'boot',
  };
}

export function resolveLook(l: HumanLook): ResolvedLook {
  const seed = l.seed ?? hash(l.id);
  const sex = l.sex ?? 'n';
  const pick = (m: string, f: string, n: [number, number] = [0.5, 0.5]) => (sex === 'm' ? { [m]: 1 } : sex === 'f' ? { [f]: 1 } : { [m]: n[0], [f]: n[1] });
  let w: Record<string, number>;
  let headScale = 1.04, handScale = 1.04, hunch = 0;
  switch (l.build) {
    case 'teen': w = pick('teenM', 'teenF', [0.6, 0.4]); headScale = 1.08; break;
    case 'child': w = { child: 1 }; headScale = 1.1; handScale = 1.06; break;
    case 'slim': w = { ...pick('youngM', 'youngF'), thin: 0.55, tall: 0.35 }; break;
    case 'broad': w = { ...pick('youngM', 'youngF'), muscle: 0.55, heavy: 0.45 }; headScale = 1.0; handScale = 1.08; break;
    case 'elder': w = pick('oldM', 'oldF'); headScale = 1.02; hunch = 0.12; break;
    default: w = pick('youngM', 'youngF'); break;
  }
  if (l.body) w = { ...l.body };
  // subtle per-character variety
  const v1 = seed * 2 - 1, v2 = ((seed * 7.31) % 1) * 2 - 1;
  if (l.build !== 'child' && !l.body) {
    w.tall = (w.tall ?? 0) + Math.max(0, v1) * 0.35;
    w.short = (w.short ?? 0) + Math.max(0, -v1) * 0.3;
    w.heavy = (w.heavy ?? 0) + Math.max(0, v2) * 0.2;
    w.thin = (w.thin ?? 0) + Math.max(0, -v2) * 0.2;
  }
  const age = l.build === 'elder' ? 0.9 : l.build === 'child' ? 0.1 : l.build === 'teen' ? 0.3 : 0.5;
  const browColor = l.hairStyle === 'bald' ? mix(l.hair, '#3a2e28', 0.5) : mix(l.hair, '#1c1512', l.hair.toLowerCase() > '#b0' ? 0.35 : 0.2);
  const wear: Wear = { ...defaultWear(l), ...(l.wear ?? {}) };
  return {
    ...l,
    sex,
    seed,
    presetWeights: w,
    height: HEIGHT[l.build] * (1 + ((w.tall ?? 0) - (w.short ?? 0)) * 0.05),
    headScale,
    handScale,
    browColor,
    browThick: sex === 'f' ? 0.85 : sex === 'm' ? 1.12 : 1,
    browArch: sex === 'f' ? 1.2 : 0.8,
    age,
    freckles: seed > 0.7 ? (seed - 0.7) * 3 : 0,
    blush: sex === 'm' ? 0.6 : 1,
    iris: l.iris ?? '#5A3E2B',
    wear,
    hunch,
    soleLift: wear.shoe === 'sneaker' ? 0.024 : wear.shoe === 'boot' ? 0.02 : 0.012,
  };
}
