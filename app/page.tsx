"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Simulation3DViewer } from "@/components/Simulation3DViewer";
import { JunctionPanel } from "@/components/JunctionPanel";
import { NetworkSummaryCard } from "@/components/NetworkSummaryCard";
import { type DashTab } from "@/components/BottomNav";
import { CadViewer } from "@/components/CadViewer";
import { PhasingView } from "@/components/PhasingView";
import { AiOptView } from "@/components/AiOptView";
import {
  detectFromPdf,
  classifyByLegendSwatch,
  CATEGORY_LABELS,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { LegendPanel } from "@/components/LegendPanel";
import { parseDxfInBrowser } from "@/lib/dxf-client";
import { HighwayPlanViewer } from "@/components/HighwayPlanViewer";
import { HighwayDimsPanel } from "@/components/HighwayDimsPanel";
import { Topbar } from "@/components/shell/Topbar";
import { Toolbar, type ViewTool } from "@/components/shell/Toolbar";
import { StatusBar } from "@/components/shell/StatusBar";
import type { ViewportSignals, ViewportCommand } from "@/components/CadViewer";
import {
  computeNetworkDimensions,
  type DimensionAssumptions,
} from "@/lib/highway-dims";
import {
  extractPdfPathsInBrowser,
  extractPdfTextItemsInBrowser,
  renderPdfPagePreview,
  getPdfPageRotation,
} from "@/lib/pdf-extract-client";
import {
  buildRoadNetwork,
  classifyJunctionApproaches,
  type RoadNetwork,
} from "@/lib/road-network";
import {
  analyzeJunction,
  defaultJunctionInputs,
  DIRS,
  LOS_COLORS,
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
  const [pageRotation, setPageRotation] = useState(0);
  const [dimAssumptions, setDimAssumptions] = useState<DimensionAssumptions>({
    unitsPerMetre: 1,
    peakHourVolumePerLane: 0,
  });
  const [colorBy, setColorBy] = useState<"los" | "class">("class");
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [tool, setTool] = useState<ViewTool>("pan");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoomPct, setZoomPct] = useState<number | null>(null);
  const [viewportCmd, setViewportCmd] = useState<ViewportCommand | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sendVp = (kind: ViewportCommand["kind"]) =>
    setViewportCmd({ kind, nonce: Date.now() });

  const onViewportSignals = (sig: ViewportSignals) => {
    setCursor(sig.cursor);
    setZoomPct(sig.zoomPct);
  };

  // Pick tool drives the legend re-pick flow; keep them in sync.
  useEffect(() => {
    if (tool !== "pick") setPickingCategory(null);
  }, [tool]);

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

  // Network building runs the heavy medial-axis skeletonizer, so it's lazy:
  // only built when a network-dependent tab is open, and deferred a tick so
  // the tab switch paints first (with a "Building…" state) instead of
  // freezing. The Drawing/Layers tab never triggers it.
  const [network, setNetwork] = useState<RoadNetwork | null>(null);
  const [networkBuilding, setNetworkBuilding] = useState(false);
  const needsNetwork =
    tab === "highway" ||
    tab === "network" ||
    tab === "movements" ||
    tab === "phasing" ||
    tab === "ai";

  // Drop a stale network as soon as a new drawing loads.
  useEffect(() => {
    setNetwork(null);
  }, [result]);

  useEffect(() => {
    if (!result || !needsNetwork) return;
    let cancelled = false;
    setNetworkBuilding(true);
    const t = setTimeout(() => {
      try {
        const n = buildRoadNetwork(result.drawing, groupCategory);
        if (!cancelled) setNetwork(n);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("buildRoadNetwork failed:", err);
        if (!cancelled) setNetwork(null);
      } finally {
        if (!cancelled) setNetworkBuilding(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [result, groupCategory, needsNetwork]);

  const dims = useMemo(() => {
    if (!network) return null;
    return computeNetworkDimensions(network, dimAssumptions);
  }, [network, dimAssumptions]);

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
    setPageRotation(0);
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    try {
      if (isPdf) {
        // Vector extraction + text + page rotation, all client-side so the
        // app needs no server.
        const [paths, texts, rotation] = await Promise.all([
          extractPdfPathsInBrowser(file),
          extractPdfTextItemsInBrowser(file).catch(() => []),
          getPdfPageRotation(file).catch(() => 0),
        ]);
        const drawing = detectFromPdf(paths, texts);
        setResult({ filename: file.name, drawing });
        setPageRotation(rotation);
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

      const lower = file.name.toLowerCase();
      if (lower.endsWith(".dwg")) {
        setError(
          "DWG isn't supported in the desktop app. Export the drawing as DXF or PDF and load that instead."
        );
        setStatus("error");
        return;
      }
      // DXF: parse client-side so the app needs no server.
      try {
        const drawing = await parseDxfInBrowser(file);
        setResult({ filename: file.name, drawing });
        setStatus("idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse DXF file");
        setStatus("error");
      }
      return;
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

  const hasNetwork = !!network && network.links.length > 0;
  const isPlanTab = tab === "drawing" || tab === "highway";
  // Right dock holds the context-sensitive properties / analysis panel.
  const rightDockWidth =
    tab === "highway"
      ? 440
      : tab === "movements" || tab === "phasing" || tab === "ai" || tab === "interchg"
      ? 360
      : tab === "network"
      ? 300
      : 0;
  const leftDockWidth = tab === "drawing" ? 300 : hasNetwork && !isPlanTab ? 220 : 0;

  return (
    <div className="app-root">
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

      <Topbar
        filename={result?.filename ?? null}
        results={junctionResults}
        onUpload={() => inputRef.current?.click()}
      />

      <Toolbar
        tab={tab}
        onTab={setTab}
        tool={tool}
        onTool={setTool}
        onZoomFit={() => sendVp("fit")}
        onZoomIn={() => sendVp("in")}
        onZoomOut={() => sendVp("out")}
        hasDrawing={!!result}
      />

      <div className="workspace">
        {/* LEFT DOCK */}
        {leftDockWidth > 0 && (
          <div className="dock left" style={{ width: leftDockWidth }}>
            {tab === "drawing" && result && (
              <div className="panel">
                <div className="panel-header">
                  <span>Layers</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  <LegendPanel
                    drawing={result.drawing}
                    visibleCategories={visibleCategories}
                    onToggleCategory={(cat, v) =>
                      setVisibleCategories((m) => ({ ...m, [cat]: v }))
                    }
                    pickingCategory={pickingCategory}
                    onStartPick={(c) => {
                      setPickingCategory(c);
                      if (c) setTool("pick");
                    }}
                    swatchOverrides={swatchOverrides}
                  />
                </div>
              </div>
            )}
            {!isPlanTab && hasNetwork && (
              <div className="panel">
                <div className="panel-header">
                  <span>Junctions ({network!.junctions.length})</span>
                </div>
                <div className="panel-body" style={{ padding: 6 }}>
                  {network!.junctions.map((j, i) => {
                    const r = junctionResults[j.id];
                    const sel = j.id === selectedJunctionId;
                    return (
                      <button
                        key={j.id}
                        onClick={() => setSelectedJunctionId(j.id)}
                        className="btn btn-sm"
                        style={{
                          width: "100%",
                          justifyContent: "space-between",
                          marginBottom: 4,
                          background: sel ? "var(--bg-4)" : "var(--bg-1)",
                          borderColor: sel ? "var(--accent)" : "var(--line)",
                        }}
                      >
                        <span style={{ color: "var(--text-2)" }}>
                          {j.kind ?? "junction"} {i + 1}
                        </span>
                        {r && (
                          <span
                            className="los-chip"
                            style={{ background: LOS_COLORS[r.los] }}
                          >
                            {r.los}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEWPORT */}
        <div className="viewport">
          {tab === "drawing" && result && (
            <CadViewer
              drawing={result.drawing}
              visibleCategories={visibleCategories}
              groupCategory={groupCategory}
              pageRotation={pageRotation}
              tool={tool}
              command={viewportCmd}
              onSignals={onViewportSignals}
              onPickGroup={tool === "pick" && pickingCategory ? handlePickGroup : undefined}
            />
          )}
          {tab === "highway" && hasNetwork && dims && (
            <HighwayPlanViewer
              network={network!}
              dims={dims}
              pageRotation={pageRotation}
              colorBy={colorBy}
              selectedLinkId={selectedLinkId}
              onSelectLink={setSelectedLinkId}
            />
          )}
          {!isPlanTab && hasNetwork && (
            <Simulation3DViewer
              drawing={result!.drawing}
              groupCategory={groupCategory}
              network={network!}
              junctionResults={junctionResults}
              selectedJunctionId={selectedJunctionId}
              onSelectJunction={setSelectedJunctionId}
            />
          )}
          {tab !== "drawing" && !hasNetwork && (
            <SceneEmptyState
              status={status}
              error={error}
              warning={warning}
              rasterPreview={rasterPreview}
            />
          )}
          {!isPlanTab && networkBuilding && !hasNetwork && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-2)",
                fontSize: 13,
                pointerEvents: "none",
              }}
            >
              Building road network…
            </div>
          )}
        </div>

        {/* RIGHT DOCK */}
        {rightDockWidth > 0 && (
          <div className="dock right" style={{ width: rightDockWidth }}>
            {tab === "highway" && dims && (
              <div className="panel">
                <div className="panel-header">
                  <span>Highway Dimensions &amp; LOS</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  <HighwayDimsPanel
                    dims={dims}
                    assumptions={dimAssumptions}
                    onChangeAssumptions={setDimAssumptions}
                    colorBy={colorBy}
                    onChangeColorBy={setColorBy}
                    selectedLinkId={selectedLinkId}
                    onSelectLink={setSelectedLinkId}
                  />
                </div>
              </div>
            )}
            {tab === "network" && hasNetwork && (
              <div className="panel">
                <div className="panel-header">
                  <span>Network Summary</span>
                </div>
                <div className="panel-body">
                  <NetworkSummaryCard
                    results={junctionResults}
                    junctionCount={network!.junctions.length}
                  />
                </div>
              </div>
            )}
            {tab === "movements" && selectedInputs && selectedResult && (
              <div className="panel">
                <div className="panel-body" style={{ padding: 0 }}>
                  <JunctionPanelInline
                    junctionLabel={`Junction ${selectedJunctionIndex + 1}`}
                    inputs={selectedInputs}
                    result={selectedResult}
                    onChange={setSelectedInputs}
                  />
                </div>
              </div>
            )}
            {tab === "phasing" && selectedInputs && selectedResult && (
              <div className="panel">
                <div className="panel-body" style={{ padding: 0 }}>
                  <PhasingView
                    inputs={selectedInputs}
                    result={selectedResult}
                    onChange={setSelectedInputs}
                  />
                </div>
              </div>
            )}
            {tab === "ai" && selectedInputs && selectedResult && (
              <div className="panel">
                <div className="panel-body" style={{ padding: 0 }}>
                  <AiOptView
                    junctionLabel={`J${selectedJunctionIndex + 1}`}
                    inputs={selectedInputs}
                    result={selectedResult}
                    onApply={setSelectedInputs}
                  />
                </div>
              </div>
            )}
            {(tab === "movements" || tab === "phasing" || tab === "ai") &&
              (!selectedInputs || !selectedResult) && (
                <div className="panel">
                  <div className="panel-body">
                    <NoSelection />
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      <StatusBar
        status={status}
        segmentCount={result ? result.drawing.segments.length : null}
        groupCount={result ? result.drawing.groups.length : null}
        linkCount={network ? network.links.length : null}
        junctionCount={network ? network.junctions.length : null}
        cursor={cursor}
        zoomPct={zoomPct}
        units={dims?.units === "m" ? "m" : "pdf u"}
      />
    </div>
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
