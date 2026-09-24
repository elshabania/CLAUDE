// Continuous day/night lighting curve (rendering §5.2). Pure maths + preallocated colours: sampling it
// every frame allocates nothing. Night is moonlit blue, never black (moon key 0.45, hemisphere ≥ 0.7).
import * as THREE from 'three';

interface Key {
  t: number;            // minute of day
  sun: string;          // key light colour
  sunI: number;         // key light intensity
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  tint: string;         // multiplies palette fog / background by day
  night: number;        // 0 day … 1 full night (drives moon, stars, fireflies, fog blend, rim)
}

const KEYS: Key[] = [
  { t: 0, sun: '#A9BEF2', sunI: 0.45, hemiSky: '#7288C8', hemiGround: '#3C3C5C', hemiI: 1.05, tint: '#FFFFFF', night: 1 },
  { t: 270, sun: '#A9BEF2', sunI: 0.45, hemiSky: '#7288C8', hemiGround: '#3C3C5C', hemiI: 1.05, tint: '#FFFFFF', night: 1 },
  { t: 330, sun: '#E9A8B8', sunI: 0.5, hemiSky: '#9C9CCB', hemiGround: '#4A3A48', hemiI: 0.85, tint: '#F2B7B0', night: 0.55 },
  { t: 390, sun: '#FFC58E', sunI: 1.5, hemiSky: '#E7D5E6', hemiGround: '#6B5048', hemiI: 0.95, tint: '#FFD6BC', night: 0.05 },
  { t: 480, sun: '#FFEBD0', sunI: 2.2, hemiSky: '#DCE8FF', hemiGround: '#6B5A40', hemiI: 1.05, tint: '#FFF4E8', night: 0 },
  { t: 720, sun: '#FFF4E0', sunI: 2.45, hemiSky: '#DDE9FF', hemiGround: '#6B5A40', hemiI: 1.1, tint: '#FFFFFF', night: 0 },
  { t: 1020, sun: '#FFE6C4', sunI: 2.25, hemiSky: '#E3E6F6', hemiGround: '#6E5A40', hemiI: 1.05, tint: '#FFF3E2', night: 0 },
  { t: 1110, sun: '#FFB070', sunI: 1.5, hemiSky: '#F0CFC8', hemiGround: '#6E4A3C', hemiI: 0.95, tint: '#FFC49A', night: 0.08 },
  { t: 1170, sun: '#E27E7A', sunI: 0.6, hemiSky: '#A88CB8', hemiGround: '#4A3448', hemiI: 0.85, tint: '#E4A0A8', night: 0.45 },
  { t: 1230, sun: '#A9BEF2', sunI: 0.45, hemiSky: '#7288C8', hemiGround: '#3C3C5C', hemiI: 1.05, tint: '#FFFFFF', night: 1 },
  { t: 1440, sun: '#A9BEF2', sunI: 0.45, hemiSky: '#7288C8', hemiGround: '#3C3C5C', hemiI: 1.05, tint: '#FFFFFF', night: 1 },
];

type ParsedKey = Omit<Key, 'sun' | 'hemiSky' | 'hemiGround' | 'tint'> & { sun: THREE.Color; hemiSky: THREE.Color; hemiGround: THREE.Color; tint: THREE.Color };
const PK: ParsedKey[] = KEYS.map((k) => ({ ...k, sun: new THREE.Color(k.sun), hemiSky: new THREE.Color(k.hemiSky), hemiGround: new THREE.Color(k.hemiGround), tint: new THREE.Color(k.tint) }));

export interface DayNightSample {
  minutes: number;
  sunDir: THREE.Vector3;   // direction TO the key light (sun by day, moon by night), unit length
  skySun: THREE.Vector3;   // sun position for the sky shader (can be below the horizon)
  sunColor: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  tint: THREE.Color;
  night: number;
}

export function createSample(): DayNightSample {
  return { minutes: 720, sunDir: new THREE.Vector3(0, 1, 0), skySun: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunI: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 1, tint: new THREE.Color(), night: 0 };
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const MOON = new THREE.Vector3(-0.45, 0.72, 0.52).normalize();
const tmp = new THREE.Vector3();

export function sampleDayNight(minutes: number, out: DayNightSample): DayNightSample {
  const m = ((minutes % 1440) + 1440) % 1440;
  let i = 0;
  while (i < PK.length - 2 && PK[i + 1].t <= m) i++;
  const a = PK[i], b = PK[i + 1];
  const f = smooth(Math.min(1, Math.max(0, (m - a.t) / Math.max(1, b.t - a.t))));
  out.minutes = m;
  out.sunColor.copy(a.sun).lerp(b.sun, f);
  out.sunI = a.sunI + (b.sunI - a.sunI) * f;
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, f);
  out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, f);
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * f;
  out.tint.copy(a.tint).lerp(b.tint, f);
  out.night = a.night + (b.night - a.night) * f;

  // sun path: east (+x) → south → west, elevation from a half-sine over 06:00–18:30
  const x = (m - 360) / 750;
  const el = Math.sin(Math.PI * x) * 1.1; // < 0 at night
  const az = Math.PI * (0.15 + 0.7 * Math.min(1, Math.max(0, x)));
  out.skySun.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.55).normalize();
  // key light: the sun clamped above ~10°, blended toward the moon as night falls (no direction pop)
  tmp.set(out.skySun.x, Math.max(0.18, out.skySun.y), out.skySun.z).normalize();
  out.sunDir.copy(tmp).lerp(MOON, smooth(Math.min(1, out.night * 1.1))).normalize();
  return out;
}
