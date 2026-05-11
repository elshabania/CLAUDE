"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Simulation3DViewer } from "@/components/Simulation3DViewer";
import { JunctionPanel } from "@/components/JunctionPanel";
import { AppHeader } from "@/components/AppHeader";
import { NetworkSummaryCard } from "@/components/NetworkSummaryCard";
import { JunctionTabsStrip } from "@/components/JunctionTabsStrip";
import { BottomNav, type DashTab } from "@/components/BottomNav";
import { CadViewer } from "@/components/CadViewer";
import { PhasingView } from "@/components/PhasingView";
import { AiOptView } from "@/components/AiOptView";
import { InterchgView } from "@/components/InterchgView";
import {
  detectFromPdf,
  classifyByLegendSwatch,
  CATEGORY_LABELS,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { LegendPanel } from "@/components/LegendPanel";
import {
  extractPdfPathsInBrowser,
  extractPdfTextItemsInBrowser,
  renderPdfPagePreview,
  renderPdfPageToCanvas,
  getPdfPageRotation,
  type PdfRasterPage,
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
  const [visibleCategories, setVisibleCategories] = useState<
    Record<RoadCategory, boolean>
  >(() => {
    const v = {} as Record<RoadCategory, boolean>;
    for (const c of Object.keys(CATEGORY_LABELS) as RoadCategory[]) {
      v[c] = c !== "context" && c !== "other";
    }
    return v;
  });
  const [pickingCategory, setPickingCategory] = useState<RoadCategory | null>(
    null
  );
  const [swatchOverrides, setSwatchOverrides] = useState<
    Partial<Record<RoadCategory, [number, number, number]>>
  >({});
  const [tab, setTab] = useState<DashTab>("drawing");
  const [selectedJunctionId, setSelectedJunctionId] = useState<string | null>(null);
  const [junctionInputs, setJunctionInputs] = useState<Record<string, JunctionInputs>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [rasterPreview, setRasterPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [rasterPage, setRasterPage] = useState<PdfRasterPage | null>(null);
  const [pageRotation, setPageRotation] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!result) return;
    const c: Record<string, RoadCategory> = {};
    const v: Record<string, boolean> = {};
    for (const g of result.drawing.groups) {
      c[g.id] = g.category;
      // Group-level visibility starts ON; the LegendPanel layers category-
      // level visibility on top via `visibleCategories`.
      v[g.id] = true;
    }
    setGroupCategory(c);
    setVisibleGroups(v);
  }, [result]);

  // Group-level visibility AND category-level visibility, combined.
  // Either toggle off hides the group.
  const effectiveVisibleGroups = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [id, on] of Object.entries(visibleGroups)) {
      const cat = groupCategory[id];
      out[id] = on !== false && (cat ? visibleCategories[cat] !== false : true);
    }
    return out;
  }, [visibleGroups, groupCategory, visibleCategories]);

  /** Handle a click in the drawing while in pick mode: snap the picking
   *  category's swatch to the clicked group's colour and re-classify all
   *  groups against the updated swatch table. */
  function handlePickGroup(groupId: string) {
    if (!pickingCategory || !result) return;
    const group = result.drawing.groups.find((g) => g.id === groupId);
    if (!group?.color) return;
    const rgb: [number, number, number] = [
      Math.round(group.color[0] * 255),
      Math.round(group.color[1] * 255),
      Math.round(group.color[2] * 255),
    ];
    const targetCat = pickingCategory;
    setSwatchOverrides((prev) => ({ ...prev, [targetCat]: rgb }));
    setPickingCategory(null);
  }

  // Re-classify groups whenever swatchOverrides change. Each group has
  // its representative colour stored at detection time; we re-run the
  // legend-swatch classifier with the override map applied.
  useEffect(() => {
    if (!result) return;
    if (Object.keys(swatchOverrides).length === 0) return;
    const next: Record<string, RoadCategory> = {};
    let changed = false;
    for (const g of result.drawing.groups) {
      if (!g.color) {
        next[g.id] = g.category;
        continue;
      }
      const r = Math.round(g.color[0] * 255);
      const grn = Math.round(g.color[1] * 255);
      const b = Math.round(g.color[2] * 255);
      const swatches = LEGEND_SWATCHES.map((sw) => {
        const ov = swatchOverrides[sw.category];
        return ov ? { ...sw, rgb: ov } : sw;
      });
      const newCat = classifyByLegendSwatch(r, grn, b, swatches);
      next[g.id] = newCat;
      if (newCat !== g.category) changed = true;
    }
    if (changed) setGroupCategory(next);
  }, [swatchOverrides, result]);

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
    setRasterPage(null);
    setPageRotation(0);
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    try {
      if (isPdf) {
        // Vector extraction + page rotation read in parallel; the raster
        // render is kept around for the legacy fallback when no vectors
        // are found.
        const [paths, texts, raster, rotation] = await Promise.all([
          extractPdfPathsInBrowser(file),
          extractPdfTextItemsInBrowser(file).catch(() => []),
          renderPdfPageToCanvas(file).catch(() => null),
          getPdfPageRotation(file).catch(() => 0),
        ]);
        const drawing = detectFromPdf(paths, texts);
        setResult({ filename: file.name, drawing });
        setPageRotation(rotation);
        if (raster) setRasterPage(raster);
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
        const res = await fetch("/ju_compressed_1.pdf");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], "ju_compressed_1.pdf", {
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
            visibleCategories={visibleCategories}
            groupCategory={groupCategory}
            pageRotation={pageRotation}
            onPickGroup={pickingCategory ? handlePickGroup : undefined}
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
          <LegendPanel
            drawing={result.drawing}
            visibleCategories={visibleCategories}
            onToggleCategory={(cat, v) =>
              setVisibleCategories((m) => ({ ...m, [cat]: v }))
            }
            pickingCategory={pickingCategory}
            onStartPick={setPickingCategory}
            swatchOverrides={swatchOverrides}
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
