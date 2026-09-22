import type { Severity } from '../api/types';

/** Letter encoding so severity never relies on colour alone. */
export const SEVERITY_LETTER: Record<Severity, string> = { Critical: 'C', High: 'H', Medium: 'M', Info: 'I' };

/** CSS custom property name for each severity colour (see styles/tokens.css). */
export const SEVERITY_VAR: Record<Severity, string> = {
  Critical: '--sev-critical',
  High: '--sev-high',
  Medium: '--sev-medium',
  Info: '--sev-info',
};

/** Static RGB for WebGL layers; kept in sync with tokens.css by resolveSeverityRgb at runtime. */
export const SEVERITY_RGB_FALLBACK: Record<Severity, [number, number, number]> = {
  Critical: [168, 32, 26],
  High: [201, 106, 0],
  Medium: [43, 108, 176],
  Info: [107, 114, 128],
};

export function resolveSeverityRgb(): Record<Severity, [number, number, number]> {
  if (typeof window === 'undefined') return SEVERITY_RGB_FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = { ...SEVERITY_RGB_FALLBACK };
  (Object.keys(SEVERITY_VAR) as Severity[]).forEach((s) => {
    const v = cs.getPropertyValue(SEVERITY_VAR[s]).trim();
    const rgb = hexToRgb(v);
    if (rgb) out[s] = rgb;
  });
  return out;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const SEVERITY_RADIUS_PX: Record<Severity, number> = { Critical: 11, High: 9, Medium: 7, Info: 5 };
