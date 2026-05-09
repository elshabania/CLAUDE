"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Simulation3DViewer } from "@/components/Simulation3DViewer";
import { JunctionPanel } from "@/components/JunctionPanel";
import { AppHeader } from "@/components/AppHeader";
import { NetworkSummaryCard } from "@/components/NetworkSummaryCard";
import { JunctionTabsStrip } from "@/components/JunctionTabsStrip";
import { BottomNav, type DashTab } from "@/components/BottomNav";
import { CadViewer, CATEGORY_COLORS } from "@/components/CadViewer";
import { PhasingView } from "@/components/PhasingView";
import { AiOptView } from "@/components/AiOptView";
import { InterchgView } from "@/components/InterchgView";
import { detectFromPdf, type ParsedDrawing, type RoadCategory } from "@/lib/road-detect";
import {
  extractPdfPathsInBrowser,
  extractPdfTextItemsInBrowser,
  renderPdfPagePreview,
} from "@/lib/pdf-extract-client";
import {
  buildRoadNetwork,
  classifyJunctionApproaches,
} from "@/lib/road-network";
import {
  analyzeJunction,
  defaultJunctionInputs,
  DIRS,
  type JunctionInputs,
  type JunctionResult,
} from "@/lib/hcm";

interface ParseResponse {
  filename: string;
  drawing: ParsedDrawing;
}

export default function Page() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [groupCategory, setGroupCategory] = useState<Record<string, RoadCategory>>({});
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<DashTab>("drawing");
  const [selectedJunctionId, setSelectedJunctionId] = useState<string | null>(null);
  const [junctionInputs, setJunctionInputs] = useState<Record<string, JunctionInputs>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [rasterPreview, setRasterPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!result) return;
    const c: Record<string, RoadCategory> = {};
    const v: Record<string, boolean> = {};
    for (const g of result.drawing.groups) {
      c[g.id] = g.category;
      // Default-hide everything tagged 'other' - the user's narrow active
      // category set is { building, lane, edge }, and 'other' is the
      // catch-all for ROW / boundaries / dimensions / anchor assets / etc.
      v[g.id] = g.category !== "other";
    }
    setGroupCategory(c);
    setVisibleGroups(v);
  }, [result]);

  const network = useMemo(() => {
    if (!result) return null;
    try {
      return buildRoadNetwork(result.drawing, groupCategory);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("buildRoadNetwork failed:", err);
      return null;
    }
  }, [result, groupCategory]);

  // Seed default junction inputs when new junctions appear.
  useEffect(() => {
    if (!network) return;
    setJunctionInputs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const j of network.junctions) {
        if (next[j.id]) continue;
        const seed = defaultJunctionInputs();
        const present = new Set(
          classifyJunctionApproaches(j, network).map((a) => a.cardinal)
        );
        for (const dir of DIRS) {
          if (!present.has(dir)) {
            seed.approaches[dir] = {
              lanes: { L: 0, T: 0, R: 0 },
              greenTime: 0,
              volumes: { L: 0, T: 0, R: 0 },
            };
          }
        }
        next[j.id] = seed;
        changed = true;
      }
      return changed ? next : prev;
    });
    // Auto-select the first junction.
    if (!selectedJunctionId && network.junctions.length > 0) {
      setSelectedJunctionId(network.junctions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const junctionResults = useMemo(() => {
    if (!network) return {};
    const out: Record<string, JunctionResult> = {};
    for (const j of network.junctions) {
      const inputs = junctionInputs[j.id];
      if (!inputs) continue;
      out[j.id] = analyzeJunction(inputs);
    }
    return out;
  }, [network, junctionInputs]);

  const selectedJunctionIndex =
    network && selectedJunctionId
      ? network.junctions.findIndex((j) => j.id === selectedJunctionId)
      : -1;
  const selectedInputs = selectedJunctionId
    ? junctionInputs[selectedJunctionId]
    : undefined;
  const selectedResult = selectedJunctionId
    ? junctionResults[selectedJunctionId]
    : undefined;
  const setSelectedInputs = (next: JunctionInputs) => {
    if (!selectedJunctionId) return;
    setJunctionInputs((m) => ({ ...m, [selectedJunctionId]: next }));
  };

  async function handleFile(file: File) {
    setStatus("loading");
    setError(null);
    setWarning(null);
    setRasterPreview(null);
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    try {
      if (isPdf) {
        const [paths, texts] = await Promise.all([
          extractPdfPathsInBrowser(file),
          extractPdfTextItemsInBrowser(file).catch(() => []),
        ]);
        const drawing = detectFromPdf(paths, texts);
        setResult({ filename: file.name, drawing });
        if (drawing.segments.length === 0) {
          setWarning(
            "No vector geometry found. The file is likely an 'optimized' / image-flattened export — upload the original CAD-exported PDF."
          );
          try {
            const preview = await renderPdfPagePreview(file);
            if (preview) setRasterPreview(preview);
          } catch {
            // ignore preview failure.
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
            ? "File too large for the deployed server."
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
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: "#070b14",
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
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

      <AppHeader
        filename={result?.filename ?? null}
        results={junctionResults}
        onUpload={() => inputRef.current?.click()}
      />

      {/* Top: scene area - 2D drawing on the Drawing tab, 3D otherwise.
          flex: 1 1 0 with min-height: 0 so the scene shrinks to fit when
          the drawer is open and never overflows the page. */}
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          position: "relative",
          background: "#070b14",
          borderBottom: "1px solid #1e293b",
        }}
      >
        {tab === "drawing" && result && (
          <CadViewer
            drawing={result.drawing}
            visibleGroups={visibleGroups}
            groupCategory={groupCategory}
          />
        )}
        {tab !== "drawing" && network && network.links.length > 0 && (
          <Simulation3DViewer
            drawing={result!.drawing}
            groupCategory={groupCategory}
            network={network}
            junctionResults={junctionResults}
            selectedJunctionId={selectedJunctionId}
            onSelectJunction={setSelectedJunctionId}
          />
        )}
        {tab !== "drawing" && (!network || network.links.length === 0) && (
          <SceneEmptyState
            status={status}
            error={error}
            warning={warning}
            rasterPreview={rasterPreview}
          />
        )}
        {tab !== "drawing" && network && (
          <NetworkSummaryCard
            results={junctionResults}
            junctionCount={network.junctions.length}
          />
        )}
      </div>

      {/* Junction tabs - hidden on the Drawing tab. */}
      {tab !== "drawing" && network && (
        <JunctionTabsStrip
          junctions={network.junctions}
          results={junctionResults}
          selectedId={selectedJunctionId}
          onSelect={setSelectedJunctionId}
        />
      )}

      {/* Tab content - uses flex shorthand so it can never push BottomNav
          off the bottom of the viewport. The drawer's content scrolls
          internally instead. */}
      <div
        style={{
          flex:
            tab === "network"
              ? "0 0 0px"
              : tab === "drawing"
              ? "0 0 280px"
              : "0 0 280px",
          overflowY: "auto",
          background: "#070b14",
          transition: "flex-basis 220ms ease",
          minHeight: 0,
        }}
      >
        {tab === "drawing" && result && (
          <DrawingPanel
            drawing={result.drawing}
            groupCategory={groupCategory}
            visibleGroups={visibleGroups}
            onToggleVisible={(id, v) =>
              setVisibleGroups((m) => ({ ...m, [id]: v }))
            }
            onChangeCategory={(id, cat) =>
              setGroupCategory((m) => ({ ...m, [id]: cat }))
            }
          />
        )}
        {tab === "movements" && selectedJunctionId && selectedInputs && selectedResult && (
          <JunctionPanelInline
            junctionLabel={`Junction ${selectedJunctionIndex + 1}`}
            inputs={selectedInputs}
            result={selectedResult}
            onChange={setSelectedInputs}
          />
        )}
        {tab === "phasing" && selectedInputs && selectedResult && (
          <PhasingView
            inputs={selectedInputs}
            result={selectedResult}
            onChange={setSelectedInputs}
          />
        )}
        {tab === "ai" && selectedJunctionId && selectedInputs && selectedResult && (
          <AiOptView
            junctionLabel={`J${selectedJunctionIndex + 1} · Junction ${selectedJunctionId}`}
            inputs={selectedInputs}
            result={selectedResult}
            onApply={setSelectedInputs}
          />
        )}
        {tab === "interchg" && selectedInputs && (
          <InterchgView inputs={selectedInputs} onChange={setSelectedInputs} />
        )}
        {tab !== "network" && tab !== "drawing" && (!selectedInputs || !selectedResult) && (
          <NoSelection />
        )}
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </main>
  );
}

/** Inlined bottom-sheet variant of JunctionPanel - no close button, no
 *  position: absolute, sized to the bottom drawer. */
function JunctionPanelInline(props: {
  junctionLabel: string;
  inputs: JunctionInputs;
  result: JunctionResult;
  onChange: (next: JunctionInputs) => void;
}) {
  return (
    <div style={{ padding: "0 0 16px 0" }}>
      <JunctionPanel
        junctionLabel={props.junctionLabel}
        inputs={props.inputs}
        result={props.result}
        onChange={props.onChange}
        onClose={() => {
          /* no-op in dashboard mode */
        }}
      />
    </div>
  );
}

function SceneEmptyState({
  status,
  error,
  warning,
  rasterPreview,
}: {
  status: "idle" | "loading" | "error";
  error: string | null;
  warning: string | null;
  rasterPreview: { dataUrl: string; width: number; height: number } | null;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        textAlign: "center",
        padding: 32,
        color: "#94a3b8",
      }}
    >
      {status === "loading" && (
        <div style={{ fontSize: 13 }}>Loading the master plan…</div>
      )}
      {status === "error" && error && (
        <div
          style={{
            background: "#7f1d1d",
            color: "#fee2e2",
            padding: 12,
            borderRadius: 6,
            maxWidth: 480,
          }}
        >
          {error}
        </div>
      )}
      {warning && (
        <div
          style={{
            color: "#fde68a",
            fontSize: 12,
            maxWidth: 480,
            marginTop: 12,
          }}
        >
          {warning}
        </div>
      )}
      {rasterPreview && (
        <img
          src={rasterPreview.dataUrl}
          alt="PDF preview"
          style={{
            maxWidth: "60%",
            marginTop: 12,
            border: "1px solid #1e293b",
            borderRadius: 6,
          }}
        />
      )}
    </div>
  );
}

function DrawingPanel({
  drawing,
  groupCategory,
  visibleGroups,
  onToggleVisible,
  onChangeCategory,
}: {
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  visibleGroups: Record<string, boolean>;
  onToggleVisible: (id: string, v: boolean) => void;
  onChangeCategory: (id: string, cat: RoadCategory) => void;
}) {
  // Only four user-facing categories: building / lane / edge / other.
  // Everything previously classified as boundary / curb / shoulder /
  // centerline now falls under 'other' and is hidden by default.
  const ALL: RoadCategory[] = ["building", "lane", "edge", "other"];
  const groups = drawing.groups;
  return (
    <div style={{ padding: "16px 18px" }}>
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
            color: "#94a3b8",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {drawing.source === "pdf" ? "PDF layers" : "DXF layers"} ·{" "}
          {drawing.segments.length.toLocaleString()} segments
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 8,
          fontSize: 12,
        }}
      >
        {groups.map((g) => (
          <div
            key={g.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              border: "1px solid #1e293b",
              borderRadius: 6,
            }}
          >
            <input
              type="checkbox"
              checked={visibleGroups[g.id] ?? true}
              onChange={(e) => onToggleVisible(g.id, e.target.checked)}
            />
            {g.color && (
              <span
                style={{
                  width: 12,
                  height: 12,
                  background: `rgb(${Math.round(g.color[0] * 255)}, ${Math.round(g.color[1] * 255)}, ${Math.round(g.color[2] * 255)})`,
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
                color: "#cbd5e1",
              }}
              title={g.label}
            >
              {g.label}
            </span>
            <select
              value={groupCategory[g.id] ?? g.category}
              onChange={(e) =>
                onChangeCategory(g.id, e.target.value as RoadCategory)
              }
              style={{
                background: "#0a1120",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 4,
                fontSize: 11,
                padding: "2px 4px",
              }}
            >
              {ALL.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span
              style={{
                color: "#64748b",
                fontVariantNumeric: "tabular-nums",
                minWidth: 36,
                textAlign: "right",
                fontSize: 11,
              }}
            >
              {g.count}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginTop: 8 }}>
        Categories preview colour palette:{" "}
        {ALL.map((c) => (
          <span
            key={c}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginRight: 10,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                background: CATEGORY_COLORS[c],
                borderRadius: 2,
              }}
            />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function NoSelection() {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "#64748b",
        fontSize: 12,
      }}
    >
      Select a junction in the strip above to inspect its analysis.
    </div>
  );
}
