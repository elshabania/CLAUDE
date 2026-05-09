"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CadViewer, CATEGORY_COLORS } from "@/components/CadViewer";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

const ALL_CATEGORIES: RoadCategory[] = [
  "centerline",
  "edge",
  "lane",
  "curb",
  "shoulder",
  "boundary",
  "building",
  "other",
];

interface ParseResponse {
  filename: string;
  drawing: ParsedDrawing;
}

function rgbCss(c?: [number, number, number]) {
  if (!c) return "transparent";
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

export default function Page() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({});
  const [groupCategory, setGroupCategory] = useState<Record<string, RoadCategory>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset visibility/categories whenever a new file is loaded.
  useEffect(() => {
    if (!result) return;
    const v: Record<string, boolean> = {};
    const c: Record<string, RoadCategory> = {};
    for (const g of result.drawing.groups) {
      v[g.id] = true;
      c[g.id] = g.category;
    }
    setVisibleGroups(v);
    setGroupCategory(c);
  }, [result]);

  const stats = useMemo(() => {
    if (!result) return null;
    const byCategory = new Map<RoadCategory, { count: number; length: number }>();
    for (const s of result.drawing.segments) {
      const cat = groupCategory[s.groupId] ?? s.category;
      const e = byCategory.get(cat) ?? { count: 0, length: 0 };
      e.count += 1;
      e.length += s.length;
      byCategory.set(cat, e);
    }
    return ALL_CATEGORIES.map((c) => ({
      category: c,
      count: byCategory.get(c)?.count ?? 0,
      length: byCategory.get(c)?.length ?? 0,
    })).filter((s) => s.count > 0);
  }, [result, groupCategory]);

  async function handleFile(file: File) {
    setStatus("loading");
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/parse", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to parse file");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }

  return (
    <main style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <aside
        style={{
          width: 360,
          padding: 20,
          borderRight: "1px solid #1e293b",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>Road CAD Viewer</h1>
        <p style={{ margin: "0 0 20px", color: "#94a3b8", fontSize: 13 }}>
          Upload a PDF, DXF or DWG drawing. The app extracts vector geometry, groups it by
          layer or stroke colour, and lets you re-classify each group as roads, buildings,
          boundaries, etc.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".dxf,.dwg,.pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === "loading"}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "#2563eb",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            opacity: status === "loading" ? 0.6 : 1,
          }}
        >
          {status === "loading" ? "Parsing…" : "Choose PDF / DXF / DWG"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#7f1d1d",
              color: "#fee2e2",
              borderRadius: 6,
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        {result && stats && (
          <>
            <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 4, color: "#cbd5e1" }}>
              {result.filename}
            </h2>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              {result.drawing.entityCount} entities · {result.drawing.segments.length} segments
              · {result.drawing.groups.length} {result.drawing.source === "pdf" ? "colour groups" : "layers"}
            </div>

            <h3 style={{ fontSize: 13, color: "#cbd5e1", margin: "16px 0 8px" }}>
              Category totals
            </h3>
            {stats.map((s) => (
              <div
                key={s.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  padding: "2px 0",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: CATEGORY_COLORS[s.category],
                    borderRadius: 2,
                  }}
                />
                <span style={{ flex: 1, textTransform: "capitalize" }}>{s.category}</span>
                <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                  {s.count} · {s.length.toFixed(0)}
                </span>
              </div>
            ))}

            <h3 style={{ fontSize: 13, color: "#cbd5e1", margin: "20px 0 8px" }}>
              {result.drawing.source === "pdf" ? "Colour groups" : "Layers"}
            </h3>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {result.drawing.groups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 0",
                    borderBottom: "1px solid #1e293b",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleGroups[g.id] ?? true}
                    onChange={(e) =>
                      setVisibleGroups((v) => ({ ...v, [g.id]: e.target.checked }))
                    }
                  />
                  {g.color && (
                    <span
                      title={g.label}
                      style={{
                        width: 14,
                        height: 14,
                        background: rgbCss(g.color),
                        border: "1px solid #334155",
                        borderRadius: 2,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={`${g.label} · ${g.count} segments · ${g.totalLength.toFixed(0)} units`}
                  >
                    {g.label}
                  </span>
                  <select
                    value={groupCategory[g.id] ?? g.category}
                    onChange={(e) =>
                      setGroupCategory((c) => ({
                        ...c,
                        [g.id]: e.target.value as RoadCategory,
                      }))
                    }
                    style={{
                      background: "#0f172a",
                      color: "#e2e8f0",
                      border: "1px solid #334155",
                      borderRadius: 4,
                      fontSize: 11,
                      padding: "2px 4px",
                    }}
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>
                    {g.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <section style={{ flex: 1, position: "relative" }}>
        {result ? (
          <CadViewer
            drawing={result.drawing}
            visibleGroups={visibleGroups}
            groupCategory={groupCategory}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#475569",
              fontSize: 14,
            }}
          >
            Upload a drawing to begin
          </div>
        )}
      </section>
    </main>
  );
}
