import type { LinkCollection, LinkProperties, Severity } from '../api/types';
import { SEVERITY_RANK } from '../api/types';
import { metricColor, METRIC_SCALES, type MetricScale } from '../lib/scales';
import type { RGB } from '../lib/scales';

/** Binary attribute buffers for a deck.gl PathLayer; built once per links payload. */
export interface LinkBinary {
  length: number;
  positions: Float64Array;
  startIndices: Uint32Array;
  props: LinkProperties[];
  volume: Float32Array;
  vc: Float32Array;
  speed: Float32Array;
  delay: Float32Array;
  maxSeverity: Int8Array; // -1 none, else SEVERITY_RANK
  indexById: Map<string, number>;
  bbox: [number, number, number, number] | null;
  /** Centre of each path (for flyTo) */
  centres: Float64Array;
}

export function buildLinkBinary(fc: LinkCollection): LinkBinary {
  const n = fc.features.length;
  let nPts = 0;
  for (const f of fc.features) nPts += f.geometry.coordinates.length;
  const positions = new Float64Array(nPts * 2);
  const startIndices = new Uint32Array(n + 1);
  const volume = new Float32Array(n);
  const vc = new Float32Array(n);
  const speed = new Float32Array(n);
  const delay = new Float32Array(n);
  const maxSeverity = new Int8Array(n);
  const centres = new Float64Array(n * 2);
  const props: LinkProperties[] = new Array(n);
  const indexById = new Map<string, number>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const f = fc.features[i];
    startIndices[i] = p / 2;
    const coords = f.geometry.coordinates;
    for (const [x, y] of coords) {
      positions[p++] = x;
      positions[p++] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const mid = coords[Math.floor(coords.length / 2)];
    centres[i * 2] = mid[0];
    centres[i * 2 + 1] = mid[1];
    const pr = f.properties;
    props[i] = pr;
    indexById.set(String(pr.link_id), i);
    volume[i] = pr.volume ?? 0;
    vc[i] = pr.vc_ratio ?? 0;
    speed[i] = pr.cong_speed_kph ?? 0;
    delay[i] = pr.delay_s ?? 0;
    maxSeverity[i] = pr.max_severity ? SEVERITY_RANK[pr.max_severity] : -1;
  }
  startIndices[n] = p / 2;
  return {
    length: n,
    positions,
    startIndices,
    props,
    volume,
    vc,
    speed,
    delay,
    maxSeverity,
    indexById,
    bbox: n ? [minX, minY, maxX, maxY] : null,
    centres,
  };
}

export type MetricKey = MetricScale['key'];

const NONE: RGB = [170, 172, 168];

/** Per-link RGBA colours for a metric (viridis) or severity (status palette). */
export function buildColors(b: LinkBinary, metric: MetricKey, sevRgb: Record<Severity, RGB>): Uint8Array {
  const out = new Uint8Array(b.length * 4);
  const scale = METRIC_SCALES[metric];
  const src = metric === 'volume' ? b.volume : metric === 'vc' ? b.vc : metric === 'speed' ? b.speed : metric === 'delay' ? b.delay : null;
  const sevList: Severity[] = ['Critical', 'High', 'Medium', 'Info'];
  for (let i = 0; i < b.length; i++) {
    let c: RGB;
    let a = 235;
    if (src) c = metricColor(scale, src[i]);
    else if (b.maxSeverity[i] >= 0) c = sevRgb[sevList[b.maxSeverity[i]]];
    else {
      c = NONE;
      a = 120;
    }
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = a;
  }
  return out;
}

/** Width in pixels by volume (sqrt so mid volumes stay legible). */
export function buildWidths(b: LinkBinary, maxVolume: number): Float32Array {
  const out = new Float32Array(b.length);
  const m = Math.max(1, maxVolume);
  for (let i = 0; i < b.length; i++) out[i] = 1.2 + 6 * Math.sqrt(Math.max(0, b.volume[i]) / m);
  return out;
}

export function maxOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
