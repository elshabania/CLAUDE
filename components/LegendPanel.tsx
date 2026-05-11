"use client";

import { useMemo } from "react";
import {
  CATEGORY_LABELS,
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { CATEGORY_COLORS } from "@/components/CadViewer";

const DISPLAY_ORDER: RoadCategory[] = [
  "road_row",
  "road_plot",
  "taxi_layby",
  "shuttle_layby",
  "emergency_access",
  "apartment_access",
  "plot_access",
  "bridge",
  "bridge_ramp",
  "tunnel",
  "tunnel_ramp",
  "raised_crossing",
  "building",
  "context",
  "other",
];

interface Props {
  drawing: ParsedDrawing;
  visibleCategories: Record<RoadCategory, boolean>;
  onToggleCategory: (cat: RoadCategory, visible: boolean) => void;
  pickingCategory: RoadCategory | null;
  onStartPick: (cat: RoadCategory | null) => void;
  swatchOverrides: Partial<Record<RoadCategory, [number, number, number]>>;
}

export function LegendPanel({
  drawing,
  visibleCategories,
  onToggleCategory,
  pickingCategory,
  onStartPick,
  swatchOverrides,
}: Props) {
  // Aggregate segment / length stats per category for the right-hand stats column.
  const stats = useMemo(() => {
    const out: Record<RoadCategory, { count: number; length: number }> = {} as never;
    for (const cat of DISPLAY_ORDER) out[cat] = { count: 0, length: 0 };
    for (const seg of drawing.segments) {
      const cat = seg.category;
      const bucket = out[cat];
      if (!bucket) continue;
      bucket.count += 1;
      bucket.length += seg.length;
    }
    return out;
  }, [drawing]);

  function swatchColor(cat: RoadCategory): string {
    const override = swatchOverrides[cat];
    if (override) {
      return `rgb(${override[0]}, ${override[1]}, ${override[2]})`;
    }
    return CATEGORY_COLORS[cat];
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#0a1120",
        color: "#e2e8f0",
        fontSize: 12,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.6,
            color: "#94a3b8",
            textTransform: "uppercase",
          }}
        >
          Legend
        </div>
        {pickingCategory && (
          <button
            onClick={() => onStartPick(null)}
            style={{
              background: "#1f2937",
              border: "1px solid #475569",
              color: "#e2e8f0",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Cancel pick
          </button>
        )}
      </div>

      {pickingCategory && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            color: "#fde68a",
            fontSize: 11,
          }}
        >
          Click any road in the drawing to re-tag
          <strong> {CATEGORY_LABELS[pickingCategory]}</strong> to its colour.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {DISPLAY_ORDER.map((cat) => {
          const visible = visibleCategories[cat] !== false;
          const isPicking = pickingCategory === cat;
          const isRoad = ROAD_CATEGORIES.has(cat);
          const swatch = LEGEND_SWATCHES.find((s) => s.category === cat);
          const hasOverride = Boolean(swatchOverrides[cat]);
          return (
            <div
              key={cat}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 18px 1fr auto auto",
                alignItems: "center",
                gap: 8,
                padding: "5px 4px",
                borderRadius: 4,
                background: isPicking ? "#1e293b" : "transparent",
                opacity: visible ? 1 : 0.45,
              }}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => onToggleCategory(cat, e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <div
                style={{
                  width: 16,
                  height: 16,
                  background: swatchColor(cat),
                  border: "1px solid #1e293b",
                  borderRadius: 3,
                }}
                title={
                  swatch
                    ? `rgb(${swatch.rgb.join(", ")})${hasOverride ? " (overridden)" : ""}`
                    : ""
                }
              />
              <div>
                <div style={{ color: isRoad ? "#e2e8f0" : "#94a3b8" }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {stats[cat].count.toLocaleString()} seg
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#475569", textAlign: "right" }}>
                {hasOverride ? "custom" : "auto"}
              </div>
              <button
                onClick={() => onStartPick(isPicking ? null : cat)}
                disabled={!isRoad && cat !== "building" && cat !== "context"}
                style={{
                  background: isPicking ? "#fde68a" : "#1f2937",
                  border: "1px solid #334155",
                  color: isPicking ? "#0f172a" : "#cbd5e1",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  cursor:
                    !isRoad && cat !== "building" && cat !== "context"
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    !isRoad && cat !== "building" && cat !== "context"
                      ? 0.3
                      : 1,
                }}
              >
                {isPicking ? "Picking…" : "Re-pick"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
