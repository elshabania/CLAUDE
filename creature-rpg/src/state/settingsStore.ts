import { create } from 'zustand';

export type QualityProfile = 'high' | 'balanced' | 'mobile';

export interface Settings {
  quality: QualityProfile;
  qualityAuto: boolean;
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  textSize: 100 | 125 | 150;
  textSpeed: 'slow' | 'normal' | 'instant';
  reducedMotion: boolean;
  cameraSensitivity: number;
  invertY: boolean;
  showPerf: boolean;
  subtitles: boolean;
}

const KEY = 'crpg:settings';

export function detectQuality(): QualityProfile {
  if (typeof navigator === 'undefined') return 'balanced';
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (touch && small) return 'mobile';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 8;
  if (cores >= 8 && mem >= 8 && !touch) return 'high';
  return 'balanced';
}

function defaults(): Settings {
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return {
    quality: detectQuality(),
    qualityAuto: true,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    muted: false,
    textSize: 100,
    textSpeed: 'normal',
    reducedMotion: !!prefersReduced,
    cameraSensitivity: 1,
    invertY: false,
    showPerf: false,
    subtitles: true,
  };
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const env = JSON.parse(raw);
    if (env?.v !== 1) return d;
    const s = { ...d, ...env.settings } as Settings;
    if (s.qualityAuto) s.quality = d.quality;
    return s;
  } catch {
    return d;
  }
}

interface SettingsState extends Settings {
  set: (patch: Partial<Settings>) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const { set: _s, ...rest } = get();
        localStorage.setItem(KEY, JSON.stringify({ v: 1, settings: rest }));
      } catch {
        /* storage unavailable: settings stay in memory */
      }
    }, 300);
  },
}));

export interface QualityParams {
  dpr: number;
  shadows: boolean;
  shadowSize: number;
  vegetation: number;   // density multiplier
  drawDistance: number;
  particles: number;
  bloom: boolean;
  ao: boolean;
  dof: boolean;
  antialias: boolean;
  maxWild: number;
  faceTex: number;
  water: 'full' | 'simple';
}

export const QUALITY: Record<QualityProfile, QualityParams> = {
  high: { dpr: 2, shadows: true, shadowSize: 2048, vegetation: 1, drawDistance: 220, particles: 1, bloom: true, ao: true, dof: true, antialias: true, maxWild: 6, faceTex: 256, water: 'full' },
  balanced: { dpr: 1.5, shadows: true, shadowSize: 1024, vegetation: 0.65, drawDistance: 160, particles: 0.6, bloom: true, ao: false, dof: false, antialias: true, maxWild: 6, faceTex: 256, water: 'full' },
  mobile: { dpr: 1.25, shadows: false, shadowSize: 512, vegetation: 0.35, drawDistance: 110, particles: 0.35, bloom: false, ao: false, dof: false, antialias: false, maxWild: 6, faceTex: 128, water: 'simple' },
};
