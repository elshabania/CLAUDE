import type { LinkCollection, LinkProperties, Severity } from '../api/types';
import { SEVERITY_RANK } from '../api/types';
import { CLASS_STYLE, metricColor, METRIC_SCALES, type MetricScale } from '../lib/scales';
import type { RGB } from '../lib/scales';

const SEV_BY_RANK: Severity[] = ['Critical', 'High', 'Medium', 'Info'];

/** Binary attribute buffers for a deck.gl PathLayer; built once per links payload. */
export interface LinkBinary {
  length: number;
  /** XYZ triplets (z = 0), one per vertex, as degree offsets from `origin` (float32-safe). */
  positions: Float32Array;
  /** [lon, lat] the offsets are relative to (COORDINATE_SYSTEM.LNGLAT_OFFSETS). */
  origin: [number, number];
  startIndices: Uint32Array;
  /** Properties of link i (built on demand: a real network has ~150K links). */
  prop: (i: number) => LinkProperties;
  volume: Float32Array;
  vc: Float32Array;
  speed: Float32Array;
  delay: Float32Array;
  lanes: Float32Array;
  /** Index into `classes` per link; 255 = unknown. */
  classIdx: Uint8Array;
  classes: string[];
  maxSeverity: Int8Array; // -1 none, else SEVERITY_RANK
  indexById: Map<string, number>;
  /** Extent of the bulk of the network (0.5-99.5 percentile), for the initial fit. */
  bbox: [number, number, number, number] | null;
  /** Centre of each path (for flyTo) */
  centres: Float64Array;
  /** false for runs without assignment results (inputs only). */
  hasFlows: boolean;
}

/** Percentile extent of the vertex cloud, so a few long external links do not set the view. */
function robustBbox(positions: Float32Array, origin: [number, number], nVerts: number): [number, number, number, number] | null {
  if (!nVerts) return null;
  const step = Math.max(1, Math.floor(nVerts / 50000));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let v = 0; v < nVerts; v += step) {
    xs.push(positions[v * 3]);
    ys.push(positions[v * 3 + 1]);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  const lo = nVerts > 2000 ? 0.005 : 0;
  const hi = 1 - lo;
  return [q(xs, lo) + origin[0], q(ys, lo) + origin[1], q(xs, hi) + origin[0], q(ys, hi) + origin[1]];
}

export function buildLinkBinary(fc: LinkCollection): LinkBinary {
  const n = fc.features.length;
  let nPts = 0;
  for (const f of fc.features) nPts += f.geometry.coordinates.length;
  // Two passes: extent first so positions can be stored as float32 offsets from the centre
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
  const lanes = new Float32Array(n);
  const classIdx = new Uint8Array(n);
  const classes: string[] = [];
  const maxSeverity = new Int8Array(n);
  const centres = new Float64Array(n * 2);
  const props: LinkProperties[] = new Array(n);
  const indexById = new Map<string, number>();
  let hasFlows = false;
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
    if (pr.volume != null) hasFlows = true;
    volume[i] = pr.volume ?? NaN;
    vc[i] = pr.vc_ratio ?? NaN;
    speed[i] = pr.cong_speed_kph ?? NaN;
    delay[i] = pr.delay_s ?? NaN;
    lanes[i] = pr.lanes ?? NaN;
    let ci = pr.link_class ? classes.indexOf(pr.link_class) : 255;
    if (pr.link_class && ci < 0) {
      classes.push(pr.link_class);
      ci = classes.length - 1;
    }
    classIdx[i] = ci;
    maxSeverity[i] = pr.max_severity ? SEVERITY_RANK[pr.max_severity] : -1;
  }
  startIndices[n] = p / 3;
  return {
    length: n,
    positions,
    startIndices,
    prop: (i) => props[i],
    volume,
    vc,
    speed,
    delay,
    lanes,
    classIdx,
    classes,
    maxSeverity,
    indexById,
    origin,
    bbox: robustBbox(positions, origin, nPts),
    centres,
    hasFlows,
  };
}

// --- links.bin (backend steam_ai/api/linkbin.py) -----------------------------------

interface BinHeader {
  version: number;
  n: number;
  n_pts: number;
  origin: [number, number];
  scale: number;
  has_flows: boolean;
  classes: string[];
  area_types: string[];
  sectors: string[];
  source_file: string | null;
  source_row_is_link_id: boolean;
  arrays: { name: string; dtype: string; count: number; offset: number }[];
}

const CTORS = {
  uint32: Uint32Array,
  int32: Int32Array,
  uint16: Uint16Array,
  uint8: Uint8Array,
  int8: Int8Array,
  float32: Float32Array,
} as const;

export interface LinkBinMeta {
  sourceFile: string | null;
  sourceRowIsLinkId: boolean;
  sector: (i: number) => string | null;
  areaType: (i: number) => string | null;
  lengthM: (i: number) => number | null;
}

async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const nn = (v: number) => (Number.isNaN(v) ? null : v);

/** Decode a links.bin buffer (optionally gzipped) into map buffers. */
export async function decodeLinkBinary(raw: ArrayBuffer): Promise<LinkBinary & { meta: LinkBinMeta }> {
  const buf = await gunzipIfNeeded(raw);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SAL1') throw new Error('Not a links.bin buffer');
  const hlen = new DataView(buf).getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as BinHeader;
  const arr: Record<string, ArrayLike<number>> = {};
  for (const a of h.arrays) {
    const C = CTORS[a.dtype as keyof typeof CTORS];
    if (!C) throw new Error(`links.bin: unsupported dtype ${a.dtype}`);
    arr[a.name] = new C(buf, a.offset, a.count);
  }
  const n = h.n;
  const ids = arr.link_id as Uint32Array;
  const start = arr.start as Uint32Array;
  const coords = arr.coords as Int32Array;
  const nPts = h.n_pts;
  const positions = new Float32Array(nPts * 3);
  const centres = new Float64Array(n * 2);
  let x = 0;
  let y = 0;
  const s = h.scale;
  for (let v = 0; v < nPts; v++) {
    x += coords[v * 2];
    y += coords[v * 2 + 1];
    positions[v * 3] = x / s;
    positions[v * 3 + 1] = y / s;
  }
  const indexById = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    indexById.set(String(ids[i]), i);
    const mid = start[i] + Math.floor((start[i + 1] - start[i]) / 2);
    centres[i * 2] = positions[mid * 3] + h.origin[0];
    centres[i * 2 + 1] = positions[mid * 3 + 1] + h.origin[1];
  }
  const lanesU8 = arr.lanes as Uint8Array;
  const lanes = new Float32Array(n);
  for (let i = 0; i < n; i++) lanes[i] = lanesU8[i] === 255 ? NaN : lanesU8[i];
  const cls = arr.link_class as Uint8Array;
  const area = arr.area_type as Uint8Array;
  const sec = arr.sector as Uint16Array;
  const sev = arr.max_severity as Int8Array;
  const nf = arr.n_findings as Uint16Array;
  const cap = arr.capacity_vph as Float32Array;
  const ffs = arr.ffs_kph as Float32Array;
  const len = arr.length_m as Float32Array;
  const volume = arr.volume as Float32Array;
  const vc = arr.vc_ratio as Float32Array;
  const speed = arr.cong_speed_kph as Float32Array;
  const delay = arr.delay_s as Float32Array;
  const aNode = arr.a_node as Uint32Array;
  const bNode = arr.b_node as Uint32Array;
  const prop = (i: number): LinkProperties => ({
    link_id: String(ids[i]),
    a_node: String(aNode[i]),
    b_node: String(bNode[i]),
    link_class: cls[i] === 255 ? '' : h.classes[cls[i]],
    area_type: area[i] === 255 ? '' : h.area_types[area[i]],
    lanes: nn(lanes[i]),
    capacity_vph: nn(cap[i]),
    ffs_kph: nn(ffs[i]),
    volume: nn(volume[i]),
    vc_ratio: nn(vc[i]),
    cong_speed_kph: nn(speed[i]),
    delay_s: nn(delay[i]),
    n_findings: nf[i],
    max_severity: sev[i] >= 0 ? SEV_BY_RANK[sev[i]] : null,
  });
  return {
    length: n,
    positions,
    origin: h.origin,
    startIndices: start,
    prop,
    volume,
    vc,
    speed,
    delay,
    lanes,
    classIdx: cls,
    classes: h.classes,
    maxSeverity: sev,
    indexById,
    bbox: robustBbox(positions, h.origin, nPts),
    centres,
    hasFlows: h.has_flows,
    meta: {
      sourceFile: h.source_file,
      sourceRowIsLinkId: h.source_row_is_link_id,
      sector: (i) => (sec[i] === 65535 ? null : h.sectors[sec[i]]),
      areaType: (i) => (area[i] === 255 ? null : h.area_types[area[i]]),
      lengthM: (i) => nn(len[i]),
    },
  };
}

export type MetricKey = MetricScale['key'];

const NONE: RGB = [170, 172, 168];

/**
 * Per-vertex RGBA colours (deck.gl 9.4 consumes binary PathLayer attributes per vertex
 * instance, so each link's colour is repeated for each of its vertices).
 * Metric colours come from the viridis scale; link class uses a categorical palette;
 * the findings layer uses the severity palette.
 */
export function buildColors(b: LinkBinary, metric: MetricKey, sevRgb: Record<Severity, RGB>): Uint8Array {
  const nVerts = b.startIndices[b.length];
  const out = new Uint8Array(nVerts * 4);
  const scale = METRIC_SCALES[metric];
  const src =
    metric === 'volume' ? b.volume : metric === 'vc' ? b.vc : metric === 'speed' ? b.speed : metric === 'delay' ? b.delay : metric === 'lanes' ? b.lanes : null;
  const classRgb = b.classes.map((c) => CLASS_STYLE[c]?.rgb ?? CLASS_STYLE.OTHER.rgb);
  for (let i = 0; i < b.length; i++) {
    let c: RGB;
    let a = 235;
    if (metric === 'class') {
      c = b.classIdx[i] === 255 ? NONE : classRgb[b.classIdx[i]];
    } else if (src) {
      if (Number.isNaN(src[i])) {
        c = NONE;
        a = 110;
      } else c = metricColor(scale, src[i]);
    } else if (b.maxSeverity[i] >= 0) c = sevRgb[SEV_BY_RANK[b.maxSeverity[i]]];
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

/**
 * Per-vertex width in pixels: by link volume (sqrt so mid volumes stay legible),
 * or by road class when the run has no assignment results.
 */
export function buildWidths(b: LinkBinary, maxVolume: number): Float32Array {
  const out = new Float32Array(b.startIndices[b.length]);
  const m = Math.max(1, maxVolume);
  const classW = b.classes.map((c) => CLASS_STYLE[c]?.width ?? CLASS_STYLE.OTHER.width);
  for (let i = 0; i < b.length; i++) {
    const w = b.hasFlows
      ? 1.2 + 6 * Math.sqrt(Math.max(0, b.volume[i] || 0) / m)
      : b.classIdx[i] === 255
        ? CLASS_STYLE.OTHER.width
        : classW[b.classIdx[i]];
    for (let v = b.startIndices[i]; v < b.startIndices[i + 1]; v++) out[v] = w;
  }
  return out;
}

export function maxOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
