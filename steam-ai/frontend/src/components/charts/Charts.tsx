/**
 * All charts use recharts (the single chart library). Loaded lazily via ./index.tsx.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KpiDelta, LinkFlow, Severity } from '../../api/types';
import { SEVERITIES } from '../../api/types';
import { fmtDelta, fmtNumber } from '../../lib/format';

const css = (name: string, fallback: string) =>
  typeof window === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const tickStyle = { fontSize: 11, fill: 'var(--ink-3)' };
const axisLine = { stroke: 'var(--border)' };

function TipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="chart-tip">
      <strong>{title}</strong>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="muted">{k}</span> {v}
        </div>
      ))}
    </div>
  );
}

/** Findings per check, stacked by severity (horizontal). */
export function FindingsByCheckChart({ rows }: { rows: { check: string; counts: Record<Severity, number> }[] }) {
  const data = rows.map((r) => ({ check: r.check, ...r.counts }));
  const colors: Record<Severity, string> = {
    Critical: css('--sev-critical', '#a8201a'),
    High: css('--sev-high', '#c96a00'),
    Medium: css('--sev-medium', '#2b6cb0'),
    Info: css('--sev-info', '#6b7280'),
  };
  const h = Math.max(120, rows.length * 26 + 30);
  return (
    <div className="chart" style={{ blockSize: h }} role="img" aria-label="Findings per check, stacked by severity">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 3" />
          <XAxis type="number" allowDecimals={false} tick={tickStyle} axisLine={axisLine} tickLine={false} />
          <YAxis type="category" dataKey="check" width={170} tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ payload, label }) =>
              payload?.length ? (
                <TipBox
                  title={String(label)}
                  rows={SEVERITIES.map((s) => [s, String((payload[0].payload as Record<string, number>)[s] ?? 0)])}
                />
              ) : null
            }
          />
          {SEVERITIES.map((s) => (
            <Bar key={s} dataKey={s} stackId="a" fill={colors[s]} stroke="var(--surface)" strokeWidth={1} maxBarSize={14} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Link volume per period, stacked by user class (ALL excluded). */
export function FlowsByPeriodChart({ flows, periods }: { flows: LinkFlow[]; periods: string[] }) {
  const classes = Array.from(new Set(flows.map((f) => f.user_class))).filter((c) => c !== 'ALL');
  const data = periods.map((p) => {
    const row: Record<string, number | string> = { period: p };
    for (const c of classes) row[c] = flows.find((f) => f.period === p && f.user_class === c)?.volume ?? 0;
    return row;
  });
  const palette = ['#3b6fb6', '#2a9d8f', '#7b5ea7', '#8c7a4e', '#b05c8a'];
  return (
    <div className="chart" role="img" aria-label="Volume per period by user class">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 3" />
          <XAxis dataKey="period" tick={tickStyle} axisLine={axisLine} tickLine={false} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ payload, label }) =>
              payload?.length ? (
                <TipBox
                  title={String(label)}
                  rows={classes.map((c) => [c, fmtNumber((payload[0].payload as Record<string, number>)[c])])}
                />
              ) : null
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
          {classes.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="a" fill={palette[i % palette.length]} stroke="var(--surface)" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** KPI change vs base run, as share; diverging colours reserved for scenario differences. */
export function KpiDeltaChart({ deltas }: { deltas: KpiDelta[] }) {
  const data = deltas.map((d) => ({ name: d.name, share: (d.delta_share ?? 0) * 100, d }));
  const pos = css('--div-pos', '#b2182b');
  const neg = css('--div-neg', '#2166ac');
  const ns = css('--div-mid', '#dedede');
  const h = Math.max(120, deltas.length * 26 + 30);
  return (
    <div className="chart" style={{ blockSize: h }} role="img" aria-label="KPI change versus base run, percent">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 3" />
          <XAxis type="number" tick={tickStyle} axisLine={axisLine} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
          <YAxis type="category" dataKey="name" width={190} tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke="var(--border-strong)" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ payload }) =>
              payload?.length ? (
                <TipBox
                  title={(payload[0].payload as { d: KpiDelta }).d.name}
                  rows={[
                    ['change', fmtDelta((payload[0].payload as { d: KpiDelta }).d.delta, (payload[0].payload as { d: KpiDelta }).d.unit)],
                    ['share', `${(payload[0].payload as { share: number }).share.toFixed(1)}%`],
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="share" maxBarSize={14} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.d.kpi_id} fill={row.d.is_significant === false ? ns : row.share >= 0 ? pos : neg} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
