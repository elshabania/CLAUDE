"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { JunctionPanel } from "@/components/JunctionPanel";
import { NetworkSummaryCard } from "@/components/NetworkSummaryCard";
import { type DashTab } from "@/components/BottomNav";
import { CadViewer } from "@/components/CadViewer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  detectFromPdf,
  classifyByLegendSwatch,
  CATEGORY_LABELS,
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { LegendPanel } from "@/components/LegendPanel";
import { parseDxfInBrowser } from "@/lib/dxf-client";
import { HighwayDimsPanel } from "@/components/HighwayDimsPanel";
import { Topbar } from "@/components/shell/Topbar";
import { Toolbar, type ViewTool } from "@/components/shell/Toolbar";
import { StatusBar } from "@/components/shell/StatusBar";
import type { ViewportSignals, ViewportCommand } from "@/components/CadViewer";
import {
  computeNetworkDimensions,
  type DimensionAssumptions,
  type LinkOverride,
} from "@/lib/highway-dims";
import {
  extractPdfPathsInBrowser,
  extractPdfTextItemsInBrowser,
  renderPdfPagePreview,
  getPdfPageRotation,
} from "@/lib/pdf-extract-client";
import {
  classifyJunctionApproaches,
  type RoadNetwork,
} from "@/lib/road-network";
import { buildNetwork } from "@/lib/network-worker-client";
import {
  serializeProject,
  parseProject,
  projectFileName,
  type ProjectDoc,
} from "@/lib/project";
import { junctionResultsToCsv, dimensionsToCsv } from "@/lib/export-csv";
import {
  saveText,
  saveBinary,
  openDrawing as openDrawingFile,
  openProjectText,
} from "@/lib/io-client";
import {
  analyzeJunction,
  defaultJunctionInputs,
  DIRS,
  LOS_COLORS,
  type JunctionInputs,
  type JunctionResult,
} from "@/lib/hcm";

// Tab views are loaded on demand so only the default drawing view ships in the
// startup bundle. (The Three.js 3D network view is deactivated for now, so its
// ~600 KB never enters the bundle at all.)
const HighwayPlanViewer = dynamic(
  () => import("@/components/HighwayPlanViewer").then((m) => m.HighwayPlanViewer),
  { ssr: false, loading: () => <ViewLoading label="Loading highway view…" /> }
);
const PhasingView = dynamic(
  () => import("@/components/PhasingView").then((m) => m.PhasingView),
  { ssr: false, loading: () => <ViewLoading label="Loading…" /> }
);
const AiOptView = dynamic(
  () => import("@/components/AiOptView").then((m) => m.AiOptView),
  { ssr: false, loading: () => <ViewLoading label="Loading…" /> }
);

function ViewLoading({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-2)",
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

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
    // Default to roads only - the driveable network. Non-road layers
    // (buildings, greenery, plots, context…) start hidden and can be toggled
    // on from the Layers panel.
    const v = {} as Record<RoadCategory, boolean>;
    for (const c of Object.keys(CATEGORY_LABELS) as RoadCategory[]) {
      v[c] = ROAD_CATEGORIES.has(c);
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
  const [linkOverrides, setLinkOverrides] = useState<
    Record<string, LinkOverride>
  >({});
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [tool, setTool] = useState<ViewTool>("pan");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Scale calibration: the length (drawing units) of the last completed
  // measurement, awaiting the user's real-world distance to derive the scale.
  const [calibUnits, setCalibUnits] = useState<number | null>(null);
  const [showOutlines, setShowOutlines] = useState(false);
  const [calibMetres, setCalibMetres] = useState("");
  const [zoomPct, setZoomPct] = useState<number | null>(null);
  const [viewportCmd, setViewportCmd] = useState<ViewportCommand | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingProjectRef = useRef<ProjectDoc | null>(null);

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
    const v: Record<string, boolean> = {};
    for (const g of result.drawing.groups) v[g.id] = true;
    setVisibleGroups(v);
    // Loading a project: restore its saved classification rather than
    // re-deriving the legend defaults.
    const pending = pendingProjectRef.current;
    if (pending && pending.drawing === result.drawing) {
      setGroupCategory(pending.groupCategory);
      pendingProjectRef.current = null;
      return;
    }
    const c: Record<string, RoadCategory> = {};
    for (const g of result.drawing.groups) c[g.id] = g.category;
    setGroupCategory(c);
    setLinkOverrides({});
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
  const [networkSlow, setNetworkSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const needsNetwork = tab === "highway";

  // Drop a stale network as soon as a new drawing loads.
  useEffect(() => {
    setNetwork(null);
  }, [result]);

  // The network is built ONLY from the road categories currently shown in the
  // Layers panel - so the highway network matches the selected layers, not the
  // whole drawing.
  const visibleRoadCats = useMemo(
    () =>
      (Array.from(ROAD_CATEGORIES) as RoadCategory[]).filter(
        (c) => visibleCategories[c] !== false
      ),
    [visibleCategories]
  );
  const visibleRoadKey = visibleRoadCats.join(",");

  useEffect(() => {
    if (!result || !needsNetwork) return;
    let cancelled = false;
    setNetworkBuilding(true);
    setNetworkSlow(false);
    setNetworkError(null);
    // After a few seconds on a big drawing, reassure rather than look hung.
    const slowTimer = setTimeout(() => {
      if (!cancelled) setNetworkSlow(true);
    }, 8000);
    buildNetwork(result.drawing, groupCategory, { roadCategories: visibleRoadCats })
      .then((n) => {
        if (!cancelled) setNetwork(n);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("buildNetwork failed:", err);
        if (!cancelled) {
          setNetwork(null);
          setNetworkError(
            err instanceof Error ? err.message : "Couldn't build the highway network."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNetworkBuilding(false);
          setNetworkSlow(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, groupCategory, needsNetwork, visibleRoadKey]);

  const dims = useMemo(() => {
    if (!network) return null;
    return computeNetworkDimensions(network, dimAssumptions, linkOverrides);
  }, [network, dimAssumptions, linkOverrides]);

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

  // The sample masterplan is loaded ON DEMAND (button / drag-drop), never
  // automatically on launch - parsing a 6 MB / 400k-path PDF on the main
  // thread would otherwise freeze the window on every startup.
  async function loadSample() {
    try {
      setStatus("loading");
      setError(null);
      const res = await fetch("/ju_compressed_1.pdf");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], "ju_compressed_1.pdf", {
        type: "application/pdf",
      });
      await handleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the sample drawing.");
      setStatus("error");
    }
  }

  // ----- Project save / open -----------------------------------------------
  function applyProject(doc: ProjectDoc) {
    setError(null);
    setWarning(null);
    setRasterPreview(null);
    setNetwork(null);
    setSelectedLinkId(null);
    setPickingCategory(null);
    setTool("pan");
    // Geometry first; the result-effect reads pendingProjectRef to restore
    // the saved classification instead of re-deriving defaults.
    pendingProjectRef.current = doc;
    setResult({ filename: doc.filename ?? "untitled", drawing: doc.drawing });
    setVisibleCategories(doc.visibleCategories);
    setSwatchOverrides(doc.swatchOverrides);
    setJunctionInputs(doc.junctionInputs);
    setLinkOverrides(doc.linkOverrides ?? {});
    setDimAssumptions(doc.dimAssumptions);
    setPageRotation(doc.pageRotation);
    setColorBy(doc.colorBy);
    setSelectedJunctionId(doc.selectedJunctionId);
    setStatus("idle");
  }

  async function doOpenDrawing() {
    const file = await openDrawingFile();
    if (file) void handleFile(file);
  }

  async function doOpenProject() {
    try {
      const text = await openProjectText();
      if (text == null) return;
      applyProject(parseProject(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open project");
      setStatus("error");
    }
  }

  async function doSaveProject() {
    if (!result) return;
    const text = serializeProject({
      filename: result.filename,
      drawing: result.drawing,
      groupCategory,
      visibleCategories,
      swatchOverrides,
      junctionInputs,
      linkOverrides,
      dimAssumptions,
      pageRotation,
      colorBy,
      selectedJunctionId,
    });
    await saveText(
      projectFileName(result.filename),
      text,
      "Analyzer Project",
      "mhp"
    );
  }

  // ----- Exports -----------------------------------------------------------
  const baseName = (result?.filename ?? "analysis").replace(/\.[^.]+$/, "");

  async function doExportCsv() {
    if (!network) return;
    const labelOf = (id: string) => {
      const i = network.junctions.findIndex((j) => j.id === id);
      return i >= 0 ? `J${i + 1}` : id;
    };
    const csv = junctionResultsToCsv(junctionResults, labelOf);
    await saveText(`${baseName}-LOS.csv`, csv, "CSV", "csv");
  }

  async function doExportDimsCsv() {
    if (!dims) return;
    await saveText(
      `${baseName}-dimensions.csv`,
      dimensionsToCsv(dims),
      "CSV",
      "csv"
    );
  }

  async function doExportPng() {
    const canvas = document.querySelector<HTMLCanvasElement>(".viewport canvas");
    if (!canvas) {
      setError("Nothing to export from the current view.");
      return;
    }
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/png")
    );
    if (!blob) return;
    const buf = await blob.arrayBuffer();
    await saveBinary(`${baseName}-${tab}.png`, buf, "PNG Image", "png", "image/png");
  }

  // ----- Undo / redo -------------------------------------------------------
  // Coarse-grained: snapshots the editable document (classifications, junction
  // inputs, view options) on every change. Geometry isn't part of history.
  const editDoc = useMemo(
    () => ({
      groupCategory,
      visibleCategories,
      swatchOverrides,
      junctionInputs,
      linkOverrides,
      dimAssumptions,
      pageRotation,
      colorBy,
    }),
    [
      groupCategory,
      visibleCategories,
      swatchOverrides,
      junctionInputs,
      linkOverrides,
      dimAssumptions,
      pageRotation,
      colorBy,
    ]
  );
  const histPast = useRef<string[]>([]);
  const histFuture = useRef<string[]>([]);
  const histApplying = useRef(false);
  const histLast = useRef<string>("");
  const [histVersion, setHistVersion] = useState(0);

  // Reset history when a new drawing/project loads.
  useEffect(() => {
    histPast.current = [];
    histFuture.current = [];
    histLast.current = "";
    setHistVersion((v) => v + 1);
  }, [result]);

  useEffect(() => {
    const cur = JSON.stringify(editDoc);
    if (histApplying.current) {
      histApplying.current = false;
      histLast.current = cur;
      return;
    }
    if (histLast.current && histLast.current !== cur) {
      histPast.current.push(histLast.current);
      if (histPast.current.length > 100) histPast.current.shift();
      histFuture.current = [];
      setHistVersion((v) => v + 1);
    }
    histLast.current = cur;
  }, [editDoc]);

  function applyEditSnapshot(snap: string) {
    const d = JSON.parse(snap) as typeof editDoc;
    histApplying.current = true;
    setGroupCategory(d.groupCategory);
    setVisibleCategories(d.visibleCategories);
    setSwatchOverrides(d.swatchOverrides);
    setJunctionInputs(d.junctionInputs);
    setLinkOverrides(d.linkOverrides);
    setDimAssumptions(d.dimAssumptions);
    setPageRotation(d.pageRotation);
    setColorBy(d.colorBy);
  }

  function doUndo() {
    const prev = histPast.current.pop();
    if (prev == null) return;
    histFuture.current.push(histLast.current);
    applyEditSnapshot(prev);
    setHistVersion((v) => v + 1);
  }

  function doRedo() {
    const next = histFuture.current.pop();
    if (next == null) return;
    histPast.current.push(histLast.current);
    applyEditSnapshot(next);
    setHistVersion((v) => v + 1);
  }

  const canUndo = histPast.current.length > 0;
  const canRedo = histFuture.current.length > 0;
  void histVersion; // re-render trigger for canUndo/canRedo

  // ----- Native menu + keyboard shortcuts ----------------------------------
  useEffect(() => {
    const dispatch = (command: string) => {
      if (command.startsWith("tab:")) {
        setTab(command.slice(4) as DashTab);
        return;
      }
      switch (command) {
        case "open-drawing": void doOpenDrawing(); break;
        case "open-project": void doOpenProject(); break;
        case "save-project": void doSaveProject(); break;
        case "export-csv": void doExportCsv(); break;
        case "export-dims-csv": void doExportDimsCsv(); break;
        case "export-png": void doExportPng(); break;
        case "undo": doUndo(); break;
        case "redo": doRedo(); break;
        case "zoom-fit": sendVp("fit"); break;
        case "zoom-in": sendVp("in"); break;
        case "zoom-out": sendVp("out"); break;
      }
    };
    const offMenu = window.desktop?.onMenu(dispatch);
    // In-browser keyboard shortcuts (also a fallback if menu accelerators miss).
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
      else if (k === "s") { e.preventDefault(); void doSaveProject(); }
      else if (k === "o" && e.shiftKey) { e.preventDefault(); void doOpenProject(); }
      else if (k === "o") { e.preventDefault(); void doOpenDrawing(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      offMenu?.();
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // ----- Drag & drop a drawing or project onto the window -----------------
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.(mhp|json)$/i.test(file.name)) {
        void file.text().then((text) => {
          try {
            applyProject(parseProject(text));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to open project");
            setStatus("error");
          }
        });
      } else {
        void handleFile(file);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the open file in the native window title.
  useEffect(() => {
    const name = result?.filename;
    window.desktop?.setTitle(
      name ? `${name} — Masterplan Highway Analyzer` : "Masterplan Highway Analyzer"
    );
  }, [result?.filename]);

  const hasNetwork = !!network && network.links.length > 0;
  const isPlanTab = tab === "drawing" || tab === "highway";
  // Right dock holds the context-sensitive properties / analysis panel. The
  // junction-analysis tabs are deactivated for now, so only the Highway
  // dimensions panel uses it.
  const rightDockWidth = tab === "highway" ? 440 : 0;
  const leftDockWidth = tab === "drawing" ? 300 : 0;

  return (
    <ErrorBoundary>
    <div className="app-root">
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-card">
            Drop a PDF / DXF drawing or .mhp project to open
          </div>
        </div>
      )}
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
        results={{}}
        onUpload={() => void doOpenDrawing()}
        onOpenProject={() => void doOpenProject()}
        onSaveProject={() => void doSaveProject()}
        onExportCsv={() => void doExportCsv()}
        onExportPng={() => void doExportPng()}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        hasProject={!!result}
        hasNetwork={hasNetwork}
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
                    showOutlines={showOutlines}
                    onToggleOutlines={setShowOutlines}
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
          <ErrorBoundary key={tab}>
          {tab === "drawing" && !result && (
            <WelcomeScreen
              status={status}
              error={error}
              onOpen={() => void doOpenDrawing()}
              onSample={() => void loadSample()}
            />
          )}
          {tab === "drawing" && result && (
            <CadViewer
              drawing={result.drawing}
              visibleCategories={visibleCategories}
              groupCategory={groupCategory}
              showOutlines={showOutlines}
              pageRotation={pageRotation}
              tool={tool}
              command={viewportCmd}
              onSignals={onViewportSignals}
              onPickGroup={tool === "pick" && pickingCategory ? handlePickGroup : undefined}
              onMeasure={(units) => {
                setCalibUnits(units);
                setCalibMetres("");
              }}
            />
          )}
          {tab === "drawing" && calibUnits != null && (
            <div className="vp-overlay" style={{ left: 12, bottom: 48, maxWidth: 320 }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Measured <b>{calibUnits.toFixed(1)}</b> drawing units. Enter its
                real length to set the scale:
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  autoFocus
                  value={calibMetres}
                  onChange={(e) => setCalibMetres(e.target.value)}
                  placeholder="metres"
                  style={{ width: 90 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const m = parseFloat(calibMetres);
                      if (m > 0 && calibUnits > 0) {
                        setDimAssumptions((d) => ({ ...d, unitsPerMetre: calibUnits / m }));
                        setCalibUnits(null);
                      }
                    }
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>m</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const m = parseFloat(calibMetres);
                    if (m > 0 && calibUnits > 0) {
                      setDimAssumptions((d) => ({ ...d, unitsPerMetre: calibUnits / m }));
                      setCalibUnits(null);
                    }
                  }}
                >
                  Set scale
                </button>
                <button className="btn btn-sm" onClick={() => setCalibUnits(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {(tab === "highway" ||
            tab === "movements" ||
            tab === "phasing" ||
            tab === "ai") &&
            hasNetwork &&
            dims && (
              <HighwayPlanViewer
                network={network!}
                dims={dims}
                pageRotation={pageRotation}
                colorBy={colorBy}
                selectedLinkId={selectedLinkId}
                onSelectLink={setSelectedLinkId}
              />
            )}
          {tab !== "drawing" &&
            !hasNetwork &&
            !networkBuilding &&
            !networkError && (
              <SceneEmptyState
                status={status}
                error={error}
                warning={warning}
                rasterPreview={rasterPreview}
              />
            )}
          {needsNetwork && networkBuilding && !hasNetwork && (
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
              {networkSlow
                ? "Still building — large drawing, hang tight…"
                : "Building road network…"}
            </div>
          )}
          {needsNetwork && networkError && !hasNetwork && !networkBuilding && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: 24,
                textAlign: "center",
              }}
            >
              <div style={{ color: "#fca5a5", fontSize: 13, maxWidth: 420 }}>
                {networkError}
              </div>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setTab("drawing");
                  setTimeout(() => setTab("highway"), 0);
                }}
              >
                Try again
              </button>
            </div>
          )}
          </ErrorBoundary>
        </div>

        {/* RIGHT DOCK */}
        {rightDockWidth > 0 && (
          <div className="dock right" style={{ width: rightDockWidth }}>
            {tab === "highway" && dims && (
              <div className="panel">
                <div className="panel-header">
                  <span>Road Network</span>
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
                    overrides={linkOverrides}
                    onChangeOverride={(id, patch) =>
                      setLinkOverrides((prev) => ({
                        ...prev,
                        [id]: { ...prev[id], ...patch },
                      }))
                    }
                    onResetOverride={(id) =>
                      setLinkOverrides((prev) => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                      })
                    }
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
    </ErrorBoundary>
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

function WelcomeScreen({
  status,
  error,
  onOpen,
  onSample,
}: {
  status: "idle" | "loading" | "error";
  error: string | null;
  onOpen: () => void;
  onSample: () => void;
}) {
  const loading = status === "loading";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="panel" style={{ maxWidth: 460, width: "100%" }}>
        <div className="panel-header">
          <span>Masterplan Highway Analyzer</span>
        </div>
        <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ marginTop: 0, color: "var(--text-2)" }}>
            Open a masterplan drawing to extract its road network and highway
            dimensions. You can also drag a PDF, DXF or .mhp project onto the
            window.
          </p>
          {loading ? (
            <div style={{ color: "var(--text-2)", padding: "8px 0" }}>
              Loading &amp; parsing the drawing… this can take a few seconds on
              a large plan.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={onOpen}>
                Open drawing (PDF / DXF)
              </button>
              <button className="btn btn-sm" onClick={onSample}>
                Load sample masterplan
              </button>
            </div>
          )}
          {error && (
            <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>
      </div>
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
