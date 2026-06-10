"use client";

import type { JunctionInputs, JunctionType } from "@/lib/hcm";

interface Props {
  inputs: JunctionInputs;
  onChange: (next: JunctionInputs) => void;
}

const TYPES: { id: JunctionType; label: string; desc: string; glyph: string }[] = [
  {
    id: "signalized",
    label: "Signalized",
    desc: "Fixed-cycle signal with NS / EW phases.",
    glyph: "🚦",
  },
  {
    id: "roundabout",
    label: "Roundabout",
    desc: "HCM Ch 22 single- or multi-lane roundabout.",
    glyph: "🔄",
  },
  {
    id: "twsc",
    label: "Two-way stop",
    desc: "Minor approaches stop; major approaches uncontrolled.",
    glyph: "🛑",
  },
];

export function InterchgView({ inputs, onChange }: Props) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontSize: 9,
          color: "#94a3b8",
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        Interchange typology
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {TYPES.map((t) => {
          const active = t.id === inputs.type;
          return (
            <button
              key={t.id}
              onClick={() => onChange({ ...inputs, type: t.id })}
              style={{
                padding: 14,
                border: active ? "1px solid #fbbf24" : "1px solid #1e293b",
                background: active ? "rgba(251, 191, 36, 0.07)" : "#0a1120",
                color: "#e2e8f0",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 24 }}>{t.glyph}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t.label}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
                {t.desc}
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          color: "#64748b",
          fontSize: 11,
          lineHeight: 1.5,
          marginTop: 8,
          paddingTop: 12,
          borderTop: "1px solid #1e293b",
        }}
      >
        Picking a type re-routes HCM analysis through the matching capacity
        model. Roundabouts use HCM Ch 22 (Akçelik gap-acceptance form);
        TWSC uses HCM Ch 20 simplified.
      </div>
    </div>
  );
}
