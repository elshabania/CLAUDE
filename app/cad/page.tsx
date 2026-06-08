"use client";

import { useMemo, useRef, useState } from "react";
import { CadViewer, CATEGORY_COLORS } from "@/components/CadViewer";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

const ALL_CATEGORIES: RoadCategory[] = [
  "centerline",
  "edge",
  "lane",
  "curb",
  "shoulder",
  "other",
];

interface ParseResponse {
  filename: string;
  drawing: ParsedDrawing;
}

export default function Page() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [visible, setVisible] = useState<Record<RoadCategory, boolean>>(() =>
    Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<RoadCategory, boolean>
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => {
    if (!result) return null;
    const byCategory = new Map<RoadCategory, { count: number; length: number }>();
    for (const s of result.drawing.segments) {
      const e = byCategory.get(s.category) ?? { count: 0, length: 0 };
      e.count += 1;
      e.length += s.length;
      byCategory.set(s.category, e);
    }
    return ALL_CATEGORIES.map((c) => ({
      category: c,
      count: byCategory.get(c)?.count ?? 0,
      length: byCategory.get(c)?.length ?? 0,
    }));
  }, [result]);

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
          width: 320,
          padding: 20,
          borderRight: "1px solid #1e293b",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>Road CAD Viewer</h1>
        <p style={{ margin: "0 0 20px", color: "#94a3b8", fontSize: 13 }}>
          Upload a DXF or DWG drawing. The app detects road geometry from layer names and
          renders it below.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".dxf,.dwg"
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
          {status === "loading" ? "Parsing…" : "Choose DXF / DWG file"}
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
            <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8, color: "#cbd5e1" }}>
              {result.filename}
            </h2>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              {result.drawing.entityCount} entities · {result.drawing.segments.length} road
              segments
            </div>

            <h3 style={{ fontSize: 13, color: "#cbd5e1", margin: "16px 0 8px" }}>Categories</h3>
            {stats.map((s) => (
              <label
                key={s.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "4px 0",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={visible[s.category]}
                  onChange={(e) =>
                    setVisible((v) => ({ ...v, [s.category]: e.target.checked }))
                  }
                />
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
              </label>
            ))}

            <h3 style={{ fontSize: 13, color: "#cbd5e1", margin: "20px 0 8px" }}>Layers</h3>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {result.drawing.layers
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((l) => (
                  <div
                    key={l.name}
                    style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}
                  >
                    <span style={{ color: CATEGORY_COLORS[l.category] }}>{l.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{l.count}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </aside>

      <section style={{ flex: 1, position: "relative" }}>
        {result ? (
          <CadViewer drawing={result.drawing} visible={visible} />
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
