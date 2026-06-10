"use client";

import { LOS_COLORS, type JunctionResult } from "@/lib/hcm";

interface Props {
  filename: string | null;
  results: Record<string, JunctionResult | undefined>;
  totalDemand?: number;
  onUpload: () => void;
}

export function AppHeader({
  filename,
  results,
  totalDemand,
  onUpload,
}: Props) {
  const list = Object.values(results).filter(Boolean) as JunctionResult[];
  const totalDelayWeighted = list.reduce(
    (acc, r) => acc + r.delay * r.totalVolume,
    0
  );
  const totalVolume = list.reduce((acc, r) => acc + r.totalVolume, 0);
  const networkDelay = totalVolume > 0 ? totalDelayWeighted / totalVolume : 0;
  const order = ["A", "B", "C", "D", "E", "F"] as const;
  const worstLos = list.reduce<keyof typeof LOS_COLORS | null>(
    (worst, r) =>
      !worst || order.indexOf(r.los) > order.indexOf(worst) ? r.los : worst,
    null
  );

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 20px",
        background: "linear-gradient(180deg, #0e1726 0%, #0a1120 100%)",
        borderBottom: "1px solid #1e293b",
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="Junction OS"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="6" r="2.5" stroke="#0f172a" strokeWidth="1.6" />
          <circle cx="6" cy="18" r="2.5" stroke="#0f172a" strokeWidth="1.6" />
          <circle cx="18" cy="18" r="2.5" stroke="#0f172a" strokeWidth="1.6" />
          <path
            d="M12 8.5L6 15.5M12 8.5L18 15.5M8.5 18H15.5"
            stroke="#0f172a"
            strokeWidth="1.6"
          />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: "#f1f5f9",
          }}
        >
          JUNCTION OS
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          HCM 6th ed · Microsim
        </div>
      </div>

      {filename && (
        <div
          style={{
            marginLeft: 16,
            fontSize: 11,
            color: "#94a3b8",
            maxWidth: 280,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={filename}
        >
          {filename}
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onUpload}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #334155",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 11,
            cursor: "pointer",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Upload
        </button>
        <div style={{ textAlign: "right", lineHeight: 1.1 }}>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1.5 }}>
            NETWORK
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#cbd5e1",
              fontVariantNumeric: "tabular-nums",
              marginTop: 4,
            }}
          >
            {networkDelay > 0 ? `${networkDelay.toFixed(1)}s` : "—"}
            {totalDemand
              ? ` · ${totalDemand.toLocaleString()} trips/h`
              : totalVolume > 0
              ? ` · ${Math.round(totalVolume).toLocaleString()} vph`
              : ""}
          </div>
        </div>
        {worstLos && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: LOS_COLORS[worstLos],
              color: "#0f172a",
              fontWeight: 800,
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {worstLos}
          </div>
        )}
      </div>
    </header>
  );
}
