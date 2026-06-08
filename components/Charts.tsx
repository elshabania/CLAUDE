"use client";

import {
  EMIRATE_TOTALS,
  REGIONS,
  SNAPSHOTS,
  type Metric,
  type RegionCode,
  type YearSnapshot,
  formatCompact,
  formatNumber,
  metricValue,
  rampColor,
} from "@/lib/abudhabi-data";

const REGION_COLORS: Record<RegionCode, string> = {
  AUH: "#38bdf8",
  AIN: "#818cf8",
  DHA: "#f472b6",
};

// --- Bar chart: compare regions for the selected metric & year -------------

export function RegionBars({
  snapshot,
  metric,
  onSelect,
  selected,
}: {
  snapshot: YearSnapshot;
  metric: Metric;
  onSelect: (c: RegionCode) => void;
  selected: RegionCode | null;
}) {
  const data = REGIONS.map((r) => ({ r, v: metricValue(snapshot, r.code, metric) }));
  const max = Math.max(...data.map((d) => d.v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map(({ r, v }) => (
        <button
          key={r.code}
          onClick={() => onSelect(r.code)}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            opacity: selected && selected !== r.code ? 0.55 : 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 4,
              color: "#cbd5e1",
            }}
          >
            <span>{r.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#f8fafc" }}>
              {metric === "density"
                ? `${formatNumber(v)} /km²`
                : metric === "share"
                  ? `${v.toFixed(1)}%`
                  : formatNumber(v)}
            </span>
          </div>
          <div style={{ background: "#0f172a", borderRadius: 6, height: 22, overflow: "hidden" }}>
            <div
              style={{
                width: `${max ? (v / max) * 100 : 0}%`,
                height: "100%",
                background: rampColor(max ? v / max : 0),
                borderRadius: 6,
                transition: "width 250ms ease",
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

// --- Trend line: emirate total + per-region population over time -----------

export function TrendChart({
  selected,
  activeYear,
}: {
  selected: RegionCode | null;
  activeYear: number;
}) {
  const W = 640;
  const H = 320;
  const pad = { top: 24, right: 20, bottom: 40, left: 64 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const years = EMIRATE_TOTALS.map((d) => d.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const maxVal = Math.max(...EMIRATE_TOTALS.map((d) => d.total));

  const x = (year: number) =>
    pad.left + ((year - minYear) / (maxYear - minYear)) * plotW;
  const y = (val: number) => pad.top + plotH - (val / maxVal) * plotH;

  const totalPath = EMIRATE_TOTALS.map((d, i) => `${i ? "L" : "M"} ${x(d.year)} ${y(d.total)}`).join(" ");

  // Per-region lines (only the three snapshot years have a regional split).
  const regionLines = REGIONS.map((r) => ({
    code: r.code,
    name: r.name,
    path: SNAPSHOTS.map(
      (s, i) => `${i ? "L" : "M"} ${x(s.year)} ${y(s.population[r.code])}`,
    ).join(" "),
  }));

  const yTicks = 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* y grid + labels */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const val = (maxVal / yTicks) * i;
        const yy = y(val);
        return (
          <g key={i}>
            <line x1={pad.left} y1={yy} x2={W - pad.right} y2={yy} stroke="#1e293b" strokeWidth={1} />
            <text x={pad.left - 8} y={yy + 4} textAnchor="end" style={{ fontSize: 11, fill: "#64748b" }}>
              {formatCompact(val)}
            </text>
          </g>
        );
      })}

      {/* x labels */}
      {EMIRATE_TOTALS.map((d) => (
        <text key={d.year} x={x(d.year)} y={H - pad.bottom + 18} textAnchor="middle" style={{ fontSize: 11, fill: "#64748b" }}>
          {d.year}
        </text>
      ))}

      {/* active year marker */}
      <line
        x1={x(activeYear)}
        y1={pad.top}
        x2={x(activeYear)}
        y2={pad.top + plotH}
        stroke="#334155"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />

      {/* emirate total */}
      <path d={totalPath} fill="none" stroke="#e2e8f0" strokeWidth={2.5} />
      {EMIRATE_TOTALS.map((d) => (
        <circle key={d.year} cx={x(d.year)} cy={y(d.total)} r={4} fill="#e2e8f0">
          <title>{`${d.year}: ${formatNumber(d.total)}${d.approximate ? " (approx.)" : ""}`}</title>
        </circle>
      ))}

      {/* per-region lines */}
      {regionLines.map((rl) => {
        const dim = selected && selected !== rl.code;
        return (
          <g key={rl.code} opacity={dim ? 0.25 : 1}>
            <path d={rl.path} fill="none" stroke={REGION_COLORS[rl.code]} strokeWidth={2} />
            {SNAPSHOTS.map((s) => (
              <circle
                key={s.year}
                cx={x(s.year)}
                cy={y(s.population[rl.code])}
                r={3.5}
                fill={REGION_COLORS[rl.code]}
              >
                <title>{`${rl.name} ${s.year}: ${formatNumber(s.population[rl.code])}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export { REGION_COLORS };
