const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });

export function fmtNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  const f = digits >= 3 ? nf3 : digits === 2 ? nf2 : digits === 1 ? nf1 : nf0;
  return f.format(v);
}

/** Value with unit, honouring reporting.yaml conventions where obvious. */
export function fmtKpi(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return '–';
  switch (unit) {
    case 'share':
      return `${nf1.format(value * 100)}%`;
    case 'km/h':
      return `${nf0.format(value)} km/h`;
    case 'km':
      return `${nf1.format(value)} km`;
    case 'veh-km':
      return `${compact(value)} veh-km`;
    case 'trips':
      return `${compact(value)} trips`;
    case 'people':
    case 'jobs':
      return `${compact(value)} ${unit}`;
    case 'lane-km':
      return `${nf0.format(value)} lane-km`;
    default:
      return `${nf2.format(value)} ${unit}`.trim();
  }
}

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${nf2.format(v / 1e6)} M`;
  if (a >= 1e4) return `${nf0.format(v / 1e3)} k`;
  return nf0.format(v);
}

export function fmtDelta(delta: number | null | undefined, unit: string): string {
  if (delta === null || delta === undefined) return '–';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const a = Math.abs(delta);
  if (unit === 'share') return `${sign}${nf1.format(a * 100)} pp`;
  if (unit === 'km/h') return `${sign}${nf1.format(a)} km/h`;
  if (unit === 'km') return `${sign}${nf2.format(a)} km`;
  return `${sign}${compact(a)}`;
}

export function fmtShare(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '–';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai',
    timeZoneName: 'short',
  });
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'number') return Number.isInteger(v) ? nf0.format(v) : nf3.format(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map(fmtValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function fmtBytes(n?: number): string {
  if (!n && n !== 0) return '–';
  if (n >= 1e9) return `${nf1.format(n / 1e9)} GB`;
  if (n >= 1e6) return `${nf1.format(n / 1e6)} MB`;
  if (n >= 1e3) return `${nf0.format(n / 1e3)} kB`;
  return `${n} B`;
}

export function locationLabel(loc: { type: string; id: string; label?: string | null }): string {
  return loc.label ? `${loc.label} (${loc.type} ${loc.id})` : `${loc.type} ${loc.id}`;
}
