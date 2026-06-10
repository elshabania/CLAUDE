"use client";

import type { NetworkNode } from "@/lib/road-network";
import { LOS_COLORS, type JunctionResult } from "@/lib/hcm";

interface Props {
  junctions: NetworkNode[];
  results: Record<string, JunctionResult | undefined>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function JunctionTabsStrip({
  junctions,
  results,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div
      style={{
        background: "#0a1120",
        borderTop: "1px solid #1e293b",
        borderBottom: "1px solid #1e293b",
        padding: "8px 12px",
        overflowX: "auto",
        display: "flex",
        gap: 8,
        flex: "0 0 auto",
      }}
    >
      {junctions.length === 0 && (
        <div style={{ color: "#64748b", fontSize: 11, padding: "6px 8px" }}>
          No junctions detected yet
        </div>
      )}
      {junctions.map((j, i) => {
        const r = results[j.id];
        const isSelected = j.id === selectedId;
        const label = labelFor(j, i);
        return (
          <button
            key={j.id}
            onClick={() => onSelect(j.id)}
            style={{
              minWidth: 145,
              textAlign: "left",
              padding: "8px 10px",
              border: isSelected ? "1px solid #fbbf24" : "1px solid #1e293b",
              borderRadius: 8,
              background: isSelected ? "#101a2c" : "#0a1120",
              color: "#cbd5e1",
              cursor: "pointer",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 1 }}>
              {label.code} · C={r ? "130" : "—"}s
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#e2e8f0",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              {r ? (
                <>
                  <span
                    style={{
                      background: LOS_COLORS[r.los],
                      color: "#0f172a",
                      fontWeight: 700,
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 3,
                    }}
                  >
                    {r.los}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#94a3b8",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.delay.toFixed(0)}s
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 10, color: "#475569" }}>—</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function labelFor(node: NetworkNode, idx: number) {
  return {
    code: `J${idx + 1}`,
    name: node.region ? `Junction ${idx + 1}` : `Node ${idx + 1}`,
  };
}
