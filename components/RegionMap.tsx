"use client";

import {
  REGIONS,
  type Metric,
  type RegionCode,
  type YearSnapshot,
  metricValue,
  rampColor,
  formatNumber,
} from "@/lib/abudhabi-data";

interface Props {
  snapshot: YearSnapshot;
  metric: Metric;
  selected: RegionCode | null;
  onSelect: (code: RegionCode) => void;
  hovered: RegionCode | null;
  onHover: (code: RegionCode | null) => void;
}

export function RegionMap({ snapshot, metric, selected, onSelect, hovered, onHover }: Props) {
  const values = REGIONS.map((r) => metricValue(snapshot, r.code, metric));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));

  return (
    <svg
      viewBox="0 0 1000 640"
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Schematic map of Abu Dhabi's three regions"
    >
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      {REGIONS.map((r) => {
        const v = metricValue(snapshot, r.code, metric);
        const isActive = selected === r.code || hovered === r.code;
        return (
          <g
            key={r.code}
            onClick={() => onSelect(r.code)}
            onMouseEnter={() => onHover(r.code)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: "pointer" }}
          >
            <polygon
              points={r.polygon}
              fill={rampColor(norm(v))}
              stroke={isActive ? "#f8fafc" : "#0f172a"}
              strokeWidth={isActive ? 4 : 2}
              opacity={selected && selected !== r.code ? 0.55 : 1}
              filter={isActive ? "url(#softShadow)" : undefined}
            />
            <text
              x={r.label.x}
              y={r.label.y}
              textAnchor="middle"
              style={{ pointerEvents: "none", fontWeight: 700, fontSize: 22, fill: "#f8fafc" }}
            >
              {r.shortName}
            </text>
            <text
              x={r.label.x}
              y={r.label.y + 26}
              textAnchor="middle"
              style={{
                pointerEvents: "none",
                fontSize: 18,
                fill: "#e2e8f0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {metric === "density"
                ? `${formatNumber(v)} /km²`
                : metric === "share"
                  ? `${v.toFixed(1)}%`
                  : formatNumber(v)}
            </text>
          </g>
        );
      })}

      <text x={20} y={628} style={{ fontSize: 14, fill: "#475569" }}>
        Schematic — regions not drawn to scale · Gulf coast along the top edge
      </text>
    </svg>
  );
}
