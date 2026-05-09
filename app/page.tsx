"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CadViewer, CATEGORY_COLORS } from "@/components/CadViewer";
import { NetworkViewer } from "@/components/NetworkViewer";
import { SimulationViewer } from "@/components/SimulationViewer";
import { Simulation3DViewer } from "@/components/Simulation3DViewer";
import { detectFromPdf, type ParsedDrawing, type RoadCategory } from "@/lib/road-detect";
import {
  extractPdfPathsInBrowser,
  extractPdfTextItemsInBrowser,
  renderPdfPagePreview,
} from "@/lib/pdf-extract-client";
import { buildRoadNetwork } from "@/lib/road-network";

type ViewMode = "drawing" | "network" | "simulation" | "simulation3d";

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
  const [view, setView] = useState<ViewMode>("drawing");
  const [showJunctions, setShowJunctions] = useState(true);
  const [rasterPreview, setRasterPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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

  // Build the road network whenever drawing or category overrides change.
  // Skip when only the Drawing tab is being viewed since the network builder
  // is the more expensive step.
  const network = useMemo(() => {
    if (!result || view === "drawing") return null;
    return buildRoadNetwork(result.drawing, groupCategory);
  }, [result, groupCategory, view]);

  const networkReady = !!network;

  async function handleFile(file: File) {
    setStatus("loading");
    setError(null);
    setWarning(null);
    setRasterPreview(null);
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    try {
      if (isPdf) {
        // Run path + text extraction in parallel - both go through the same
        // worker but pdfjs queues them so the cost is roughly additive on
        // smaller PDFs and amortises on larger ones.
        const [paths, texts] = await Promise.all([
          extractPdfPathsInBrowser(file),
          extractPdfTextItemsInBrowser(file).catch(() => []),
        ]);
        const drawing = detectFromPdf(paths, texts);
        setResult({ filename: file.name, drawing });
        if (drawing.segments.length === 0) {
          setWarning(
            "No vector geometry found in this PDF. The file is likely an 'optimized' / image-flattened export — try uploading the original CAD-exported PDF (or the source DXF/DWG) to extract roads."
          );
          // Still render a raster preview so the user can see the file content.
          try {
            const preview = await renderPdfPagePreview(file);
            if (preview) setRasterPreview(preview);
          } catch {
            // ignore preview failure - warning is enough.
          }
        }
        setStatus("idle");
        return;
      }

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body });
      const text = await res.text();
      let data: { error?: string; filename?: string; drawing?: ParsedDrawing };
      try {
        data = JSON.parse(text);
      } catch {
        setError(
          res.status === 413
            ? "File too large for the deployed server. Run locally with `npm run dev` or use a smaller file."
            : `Server returned ${res.status}: ${text.slice(0, 200)}`
        );
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to parse file");
        setStatus("error");
        return;
      }
      if (data.filename && data.drawing) {
        setResult({ filename: data.filename, drawing: data.drawing });
      }
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file");
      setStatus("error");
    }
  }

  // Auto-load the bundled CMP layout PDF on first mount so the app has
  // something to show without an upload step. The fetch is no-op'd if a
  // result is already in state (e.g. user already uploaded).
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (result) return;
    void (async () => {
      try {
        setStatus("loading");
        const res = await fetch("/sample-cmp-layout.pdf");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], "WSPTRA_Prime_CMPRoad_Layout.pdf", {
          type: "application/pdf",
        });
        await handleFile(file);
      } catch (err) {
        // Bundled file isn't available - user can still upload manually.
        if (err instanceof Error) {
          // eslint-disable-next-line no-console
          console.warn("default PDF load failed:", err.message);
        }
        setStatus("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          Upload a PDF, DXF or DWG drawing. Switch to the Network tab to derive a
          junction-level model and run HCM analysis on each intersection.
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

        {warning && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#78350f",
              color: "#fde68a",
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>
              No vector roads found
            </strong>
            {warning}
          </div>
        )}

        {result && stats && (
          <>
            <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 4, color: "#cbd5e1" }}>
              {result.filename}
            </h2>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              {result.drawing.entityCount} entities · {result.drawing.segments.length}{" "}
              segments · {result.drawing.groups.length}{" "}
              {result.drawing.groups.some((g) => g.layer)
                ? "PDF layers"
                : result.drawing.source === "pdf"
                ? "colour groups"
                : "layers"}
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
              {result.drawing.groups.some((g) => g.layer)
                ? "PDF layers"
                : result.drawing.source === "pdf"
                ? "Colour groups"
                : "Layers"}
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
                  <span
                    style={{
                      color: "#64748b",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 28,
                      textAlign: "right",
                    }}
                  >
                    {g.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <section
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {result && (
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 12px",
              borderBottom: "1px solid #1e293b",
              background: "#0b1220",
            }}
          >
            <TabButton
              active={view === "drawing"}
              onClick={() => setView("drawing")}
            >
              Drawing
            </TabButton>
            <TabButton
              active={view === "network"}
              onClick={() => setView("network")}
            >
              Network
            </TabButton>
            <TabButton
              active={view === "simulation"}
              onClick={() => setView("simulation")}
            >
              Simulation
            </TabButton>
            <TabButton
              active={view === "simulation3d"}
              onClick={() => setView("simulation3d")}
            >
              3D Sim
            </TabButton>
            {view === "network" && network && (
              <div
                style={{
                  marginLeft: "auto",
                  alignSelf: "center",
                  fontSize: 11,
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showJunctions}
                    onChange={(e) => setShowJunctions(e.target.checked)}
                  />
                  Show junctions
                </label>
                <span>
                  {network.junctions.length} junctions · {network.links.length} links
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, position: "relative", display: "flex", minHeight: 0 }}>
          {!result && (
            <div
              style={{
                flex: 1,
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

          {result && view === "drawing" && (
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              {result.drawing.segments.length > 0 ? (
                <CadViewer
                  drawing={result.drawing}
                  visibleGroups={visibleGroups}
                  groupCategory={groupCategory}
                />
              ) : rasterPreview ? (
                <RasterPreview preview={rasterPreview} />
              ) : (
                <EmptyState
                  title="No vector geometry"
                  body="The file uploaded successfully but contains no extractable vector paths. Upload a CAD-exported PDF (vectors preserved) or a DXF/DWG."
                />
              )}
            </div>
          )}

          {result && view === "network" && network && (
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              {result.drawing.segments.length === 0 ? (
                <EmptyState
                  title="No road geometry"
                  body="This file has no vector roads to render. Try uploading the original CAD-exported PDF or a DXF."
                />
              ) : (
                <NetworkViewer
                  drawing={result.drawing}
                  groupCategory={groupCategory}
                  network={network}
                  showJunctions={showJunctions}
                />
              )}
            </div>
          )}

          {result && view === "simulation" && network && (
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              {network.links.length === 0 ? (
                <EmptyState
                  title="No drivable network"
                  body="Switch to the Network tab and confirm that at least one cluster is classified as 'centerline'. The simulator drives vehicles along centerline links."
                />
              ) : (
                <SimulationViewer
                  drawing={result.drawing}
                  groupCategory={groupCategory}
                  network={network}
                />
              )}
            </div>
          )}

          {result && view === "simulation3d" && network && (
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              {network.links.length === 0 ? (
                <EmptyState
                  title="No drivable network"
                  body="Switch to the Network tab and confirm that at least one cluster is classified as 'centerline'."
                />
              ) : (
                <Simulation3DViewer
                  drawing={result.drawing}
                  groupCategory={groupCategory}
                  network={network}
                />
              )}
            </div>
          )}

          {!networkReady && result && view !== "drawing" && (
            <EmptyState
              title="Building network…"
              body="Computing nodes, links and building clusters from the drawing."
            />
          )}
        </div>
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 32,
        color: "#94a3b8",
      }}
    >
      <div style={{ fontSize: 16, color: "#cbd5e1", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 480, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function RasterPreview({
  preview,
}: {
  preview: { dataUrl: string; width: number; height: number };
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.dataUrl}
        alt="PDF page raster preview"
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          background: "#fff",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          padding: "6px 10px",
          background: "rgba(15, 23, 42, 0.85)",
          color: "#fde68a",
          fontSize: 11,
          borderRadius: 6,
          border: "1px solid #78350f",
        }}
      >
        Raster preview only — no vectors to extract
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#1e293b" : "transparent",
        color: active ? "#fbbf24" : "#94a3b8",
        border: 0,
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
