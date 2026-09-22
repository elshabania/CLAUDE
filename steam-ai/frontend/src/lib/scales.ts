/**
 * Colour scales. Sequential = viridis-like (colour-blind safe, monotone lightness);
 * used for V/C, volume, speed, delay. Diverging = blue/neutral/red, reserved for
 * scenario differences only.
 */
export type RGB = [number, number, number];

export const VIRIDIS: RGB[] = [
  [68, 1, 84],
  [65, 68, 135],
  [42, 120, 142],
  [34, 168, 132],
  [122, 209, 81],
  [253, 231, 37],
];

export const DIVERGING: RGB[] = [
  [33, 102, 172],
  [103, 169, 207],
  [209, 229, 240],
  [222, 222, 222],
  [253, 219, 199],
  [239, 138, 98],
  [178, 24, 43],
];

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Interpolate through the stops for t in [0, 1]. */
export function sample(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export interface MetricScale {
  key: 'volume' | 'vc' | 'speed' | 'delay' | 'findings';
  label: string;
  unit: string;
  /** Domain published in the legend; values beyond are clamped. */
  domain: [number, number];
  /** true when higher is worse (ordering of legend text only, colours stay viridis). */
  higherIsWorse: boolean;
  stops: RGB[];
  reverse?: boolean;
  format: (v: number) => string;
}

export const METRIC_SCALES: Record<MetricScale['key'], MetricScale> = {
  volume: {
    key: 'volume',
    label: 'Volume',
    unit: 'veh / period',
    domain: [0, 20000],
    higherIsWorse: false,
    stops: VIRIDIS,
    format: (v) => Math.round(v).toLocaleString('en-GB'),
  },
  vc: {
    key: 'vc',
    label: 'Volume / capacity',
    unit: 'ratio',
    domain: [0, 1.4],
    higherIsWorse: true,
    stops: VIRIDIS,
    format: (v) => v.toFixed(2),
  },
  speed: {
    key: 'speed',
    label: 'Congested speed',
    unit: 'km/h',
    domain: [0, 120],
    higherIsWorse: false,
    stops: VIRIDIS,
    reverse: true,
    format: (v) => Math.round(v).toString(),
  },
  delay: {
    key: 'delay',
    label: 'Delay',
    unit: 's',
    domain: [0, 300],
    higherIsWorse: true,
    stops: VIRIDIS,
    format: (v) => Math.round(v).toString(),
  },
  findings: {
    key: 'findings',
    label: 'Findings',
    unit: 'max severity',
    domain: [0, 1],
    higherIsWorse: true,
    stops: VIRIDIS,
    format: (v) => String(v),
  },
};

export function metricColor(scale: MetricScale, value: number): RGB {
  const [lo, hi] = scale.domain;
  let t = hi === lo ? 0 : (value - lo) / (hi - lo);
  if (scale.reverse) t = 1 - t;
  return sample(scale.stops, t);
}

/** Legend stops: n evenly spaced values with their colours. */
export function legendStops(scale: MetricScale, n = 6): { value: number; color: string }[] {
  const [lo, hi] = scale.domain;
  return Array.from({ length: n }, (_, i) => {
    const v = lo + ((hi - lo) * i) / (n - 1);
    return { value: v, color: rgbToHex(metricColor(scale, v)) };
  });
}

export function divergingColor(t: number): RGB {
  return sample(DIVERGING, (Math.min(1, Math.max(-1, t)) + 1) / 2);
}
