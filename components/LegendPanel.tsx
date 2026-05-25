"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
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
  "greenery",
  "water",
  "plot_fill",
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

  const [showAll, setShowAll] = useState(false);

  function swatchColor(cat: RoadCategory): string {
    const override = swatchOverrides[cat];
    if (override) {
      return `rgb(${override[0]}, ${override[1]}, ${override[2]})`;
    }
    return CATEGORY_COLORS[cat];
  }

  // By default show only layers actually present in the drawing (or ones the
  // user has customised) - empty categories just add noise. "Show all" reveals
  // the rest so a missing category can still be re-picked.
  const presentCats = DISPLAY_ORDER.filter(
    (c) => stats[c].count > 0 || swatchOverrides[c]
  );
  const hiddenCount = DISPLAY_ORDER.length - presentCats.length;
  const shownCats = showAll ? DISPLAY_ORDER : presentCats;

  return (
    <div
      style={{
        padding: "12px 14px",
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
        <div style={{ fontSize: 10, letterSpacing: 1.6, color: "#94a3b8", textTransform: "uppercase" }}>
          Layers · {presentCats.length}
        </div>
        {pickingCategory && (
          <button className="btn btn-sm" onClick={() => onStartPick(null)}>
            Cancel
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
          Click any road in the drawing to set
          <strong> {CATEGORY_LABELS[pickingCategory]}</strong> to its colour.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {shownCats.map((cat) => {
          const visible = visibleCategories[cat] !== false;
          const isPicking = pickingCategory === cat;
          const isRoad = ROAD_CATEGORIES.has(cat);
          const hasOverride = Boolean(swatchOverrides[cat]);
          return (
            <label
              key={cat}
              title={isRoad ? "Road layer" : "Site / context layer"}
              style={{
                display: "grid",
                gridTemplateColumns: "16px 14px 1fr auto",
                alignItems: "center",
                gap: 9,
                padding: "5px 6px",
                borderRadius: 4,
                cursor: "pointer",
                background: isPicking ? "#1e293b" : "transparent",
                opacity: visible ? 1 : 0.4,
              }}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => onToggleCategory(cat, e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span
                style={{
                  width: 13,
                  height: 13,
                  background: swatchColor(cat),
                  border: hasOverride ? "2px solid #fde68a" : "1px solid #1e293b",
                  borderRadius: 3,
                }}
                title={hasOverride ? "Custom colour" : undefined}
              />
              <span style={{ color: isRoad ? "#e2e8f0" : "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {CATEGORY_LABELS[cat]}
                <span style={{ color: "#475569", marginLeft: 6, fontSize: 10 }}>
                  {stats[cat].count.toLocaleString()}
                </span>
              </span>
              {cat !== "other" && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onStartPick(isPicking ? null : cat);
                  }}
                  title="Re-pick this layer's colour from the drawing"
                  style={{
                    background: isPicking ? "#fde68a" : "transparent",
                    border: "1px solid #334155",
                    color: isPicking ? "#0f172a" : "#94a3b8",
                    borderRadius: 4,
                    padding: "2px 7px",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {isPicking ? "Picking…" : "Pick"}
                </button>
              )}
            </label>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: 10,
            width: "100%",
            background: "transparent",
            border: "1px solid #1e293b",
            color: "#64748b",
            borderRadius: 4,
            padding: "5px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {showAll ? "Show fewer" : `Show all layers (+${hiddenCount} empty)`}
        </button>
      )}
    </div>
  );
}
