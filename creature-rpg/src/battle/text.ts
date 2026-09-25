import type { MajorStatus } from '../sim/types';

/** DECISIONS D8: original status names; codes paired with distinct shapes so status never relies on colour. */
export const STATUS_NAMES: Record<MajorStatus, { name: string; code: string; color: string; shape: string }> = {
  burn: { name: 'Scorch', code: 'SCH', color: '#E4572E', shape: '▲' },
  poison: { name: 'Blight', code: 'BLT', color: '#9B4FB0', shape: '●' },
  paralysis: { name: 'Jolt', code: 'JLT', color: '#F2C230', shape: '◆' },
  sleep: { name: 'Drowse', code: 'DRW', color: '#7B6FA8', shape: '☾' },
  frostbite: { name: 'Rimebite', code: 'RMB', color: '#7FD3E6', shape: '✱' },
};

/** Effectiveness in quarters (4 = neutral). */
export function effText(eff: number): string {
  if (eff === 0) return 'No echo.';
  if (eff > 4) return 'Resounding!';
  if (eff < 4) return 'Muffled…';
  return '';
}

export const TYPE_META: Record<string, { color: string; code: string; glyph: string; name: string }> = {
  fire: { color: '#E4572E', code: 'FIR', glyph: '▵', name: 'Fire' },
  water: { color: '#2E86DE', code: 'WTR', glyph: '≋', name: 'Water' },
  electric: { color: '#F2C230', code: 'ELC', glyph: '›•›', name: 'Electric' },
  verdant: { color: '#4CAF50', code: 'VRD', glyph: '⚘', name: 'Verdant' },
  stone: { color: '#9C7A54', code: 'STN', glyph: '⬡', name: 'Stone' },
  frost: { color: '#7FD3E6', code: 'FRS', glyph: '✳', name: 'Frost' },
  gale: { color: '#8FB9A8', code: 'GAL', glyph: '@', name: 'Gale' },
  toxin: { color: '#9B4FB0', code: 'TOX', glyph: '∴', name: 'Toxin' },
  shade: { color: '#4B3F72', code: 'SHD', glyph: '◐', name: 'Shade' },
  lumen: { color: '#F5E6A8', code: 'LUM', glyph: '✦', name: 'Lumen' },
  none: { color: '#9AA5B8', code: '—', glyph: '·', name: 'Typeless' },
};
