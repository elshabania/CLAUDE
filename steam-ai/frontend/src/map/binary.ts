import type { LinkCollection, LinkProperties, Severity } from '../api/types';
import { SEVERITY_RANK } from '../api/types';
import { metricColor, METRIC_SCALES, type MetricScale } from '../lib/scales';
import type { RGB } from '../lib/scales';

/** Binary attribute buffers for a deck.gl PathLayer; built once per links payload. */
export interface LinkBinary {
  length: number;
  /** XYZ triplets (z = 0), one per vertex, as degree offsets from `origin` (float32-safe). */
  positions: Float32Array;
  /** [lon, lat] the offsets are relative to (COORDINATE_SYSTEM.LNGLAT_OFFSETS). */
  origin: [number, number];
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
  // Two passes: bbox first so positions can be stored as float32 offsets from the centre
  // (raw lon/lat in float32 loses ~0.4 m; offsets keep sub-mm precision).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    for (const [x, y] of f.geometry.coordinates) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const origin: [number, number] = n ? [(minX + maxX) / 2, (minY + maxY) / 2] : [0, 0];
  const positions = new Float32Array(nPts * 3); // XYZ, z = 0 (matches deck's vertexPositions size)
  const startIndices = new Uint32Array(n + 1);
  const volume = new Float32Array(n);
  const vc = new Float32Array(n);
  const speed = new Float32Array(n);
  const delay = new Float32Array(n);
  const maxSeverity = new Int8Array(n);
  const centres = new Float64Array(n * 2);
  const props: LinkProperties[] = new Array(n);
  const indexById = new Map<string, number>();
  let p = 0;
  for (let i = 0; i < n; i++) {
    const f = fc.features[i];
    startIndices[i] = p / 3;
    const coords = f.geometry.coordinates;
    for (const [x, y] of coords) {
      positions[p++] = x - origin[0];
      positions[p++] = y - origin[1];
      positions[p++] = 0;
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
  startIndices[n] = p / 3;
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
    origin,
    bbox: n ? [minX, minY, maxX, maxY] : null,
    centres,
  };
}

export type MetricKey = MetricScale['key'];

const NONE: RGB = [170, 172, 168];

/**
 * Per-vertex RGBA colours (deck.gl 9.4 consumes binary PathLayer attributes per vertex
 * instance, so each link's colour is repeated for each of its vertices).
 * Metric colours come from the viridis scale; the findings layer uses the severity palette.
 */
export function buildColors(b: LinkBinary, metric: MetricKey, sevRgb: Record<Severity, RGB>): Uint8Array {
  const nVerts = b.startIndices[b.length];
  const out = new Uint8Array(nVerts * 4);
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
    for (let v = b.startIndices[i]; v < b.startIndices[i + 1]; v++) {
      out[v * 4] = c[0];
      out[v * 4 + 1] = c[1];
      out[v * 4 + 2] = c[2];
      out[v * 4 + 3] = a;
    }
  }
  return out;
}

/** Per-vertex width in pixels by link volume (sqrt so mid volumes stay legible). */
export function buildWidths(b: LinkBinary, maxVolume: number): Float32Array {
  const out = new Float32Array(b.startIndices[b.length]);
  const m = Math.max(1, maxVolume);
  for (let i = 0; i < b.length; i++) {
    const w = 1.2 + 6 * Math.sqrt(Math.max(0, b.volume[i]) / m);
    for (let v = b.startIndices[i]; v < b.startIndices[i + 1]; v++) out[v] = w;
  }
  return out;
}

export function maxOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
