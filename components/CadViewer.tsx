"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { renderDrawingFills, type Ctx2D } from "@/lib/render-drawing";
import { closeMask } from "@/lib/morphology";
import type { LaneNetwork } from "@/lib/lane-network";

/** Lane centerline colour by lane count (matches the legend in the panel). */
function laneCountColor(n: number): string {
  if (n >= 4) return "#a855f7"; // 4+ lanes — main carriageway
  if (n === 3) return "#ef4444";
  if (n === 2) return "#f97316";
  if (n === 1) return "#3b82f6";
  return "#94a3b8";
}

const ROAD_CATEGORIES_ARR = Array.from(ROAD_CATEGORIES);

function swatchHex(cat: RoadCategory, fallback = "#475569"): string {
  const sw = LEGEND_SWATCHES.find((s) => s.category === cat);
  if (!sw) return fallback;
  const [r, g, b] = sw.rgb;
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

export const CATEGORY_COLORS: Record<RoadCategory, string> = {
  road_row: swatchHex("road_row"),
  road_plot: swatchHex("road_plot"),
  taxi_layby: swatchHex("taxi_layby"),
  shuttle_layby: swatchHex("shuttle_layby"),
  emergency_access: swatchHex("emergency_access"),
  apartment_access: swatchHex("apartment_access"),
  plot_access: swatchHex("plot_access"),
  bridge: swatchHex("bridge"),
  bridge_ramp: swatchHex("bridge_ramp"),
  tunnel: swatchHex("tunnel"),
  tunnel_ramp: swatchHex("tunnel_ramp"),
  raised_crossing: swatchHex("raised_crossing"),
  building: swatchHex("building"),
  context: swatchHex("context"),
  greenery: swatchHex("greenery", "#86efac"),
  water: swatchHex("water", "#7dd3fc"),
  plot_fill: swatchHex("plot_fill", "#fde68a"),
  other: "#475569",
};

/** Live cursor + zoom readout pushed to the status bar. */
export interface ViewportSignals {
  cursor: { x: number; y: number } | null;
  zoomPct: number;
}
/** One-shot zoom command from the toolbar, consumed via its nonce. */
export interface ViewportCommand {
  kind: "fit" | "in" | "out";
  nonce: number;
}
export type ViewTool = "pan" | "measure" | "pick";

interface Props {
  drawing: ParsedDrawing;
  visibleCategories: Record<RoadCategory, boolean>;
  /** Optional per-group category override (re-pick updates this map). */
  groupCategory?: Record<string, RoadCategory>;
  /** Draw polygon outlines + hatch lines over the solid fills. */
  showOutlines?: boolean;
  /** PDF page /Rotate value in degrees (0 / 90 / 180 / 270). */
  pageRotation?: number;
  /** Active interaction tool. */
  tool?: ViewTool;
  /** One-shot zoom command from the toolbar. */
  command?: ViewportCommand | null;
  /** Cursor + zoom reporting for the status bar. */
  onSignals?: (s: ViewportSignals) => void;
  /** Optional click handler. When set, clicking reports the matched group id. */
  onPickGroup?: (groupId: string) => void;
  /** Reports the length (in drawing units) of a completed measurement, for
   *  scale calibration. */
  onMeasure?: (distanceUnits: number) => void;
  /** Carriageway network (from a detailed CAD) to overlay on the plan. */
  laneNetwork?: LaneNetwork | null;
  /** Whether to draw the network overlay. */
  showLanes?: boolean;
  /** Optional per-link colours (e.g. LOS colours from the assignment).
   *  Falls back to lane-count colours when null/absent. */
  linkColors?: (string | null)[] | null;
  /** Index of the selected link (highlighted + ring). */
  selectedLink?: number | null;
  /** Plain-click link picking (pan tool). null = clicked empty space. */
  onPickLink?: (linkIdx: number | null) => void;
}

export function CadViewer({
  drawing,
  visibleCategories,
  groupCategory,
  showOutlines = false,
  pageRotation = 0,
  tool = "pan",
  command,
  onSignals,
  onPickGroup,
  onMeasure,
  laneNetwork = null,
  showLanes = true,
  linkColors = null,
  selectedLink = null,
  onPickLink,
}: Props) {
  function effCat(seg: { groupId: string; category: RoadCategory }): RoadCategory {
    return groupCategory?.[seg.groupId] ?? seg.category;
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fitScaleRef = useRef(1);
  const signalRafRef = useRef<number | null>(null);
  const pendingSignalRef = useRef<ViewportSignals | null>(null);
  const [measure, setMeasure] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number } | null;
  } | null>(null);
  /** Offscreen canvas where we composite all visible category fills at high
   *  resolution so the thousands of tiny hatch tiles fuse into clean
   *  coloured regions. The display canvas just drawImages this with
   *  pan/zoom. */
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  /** Bumped whenever the offscreen layer's pixels change (new drawing,
   *  re-classification, or visibility toggle). The blit effect depends on this
   *  instead of the heavyweight `drawing`/`visibleCategories` objects so it
   *  re-blits exactly when the offscreen content actually changed - and the
   *  cheap per-frame pan/zoom path never touches the offscreen render at all. */
  const [offscreenVersion, setOffscreenVersion] = useState(0);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );

  // Build a uniform spatial grid over the drawing in a single pass. The grid
  // lets pickGroupAt query only the handful of segments whose bounding box
  // overlaps the click cell instead of linearly scanning all ~80k every click.
  //
  // Each segment's bounding box is rasterised into the cells it spans and we
  // store the segment's index into `drawing.segments` (a plain number, not an
  // object - keeps the structure allocation-light). Indexing by bbox (every
  // overlapped cell) guarantees no false negatives: any closed polygon that
  // contains the click, or any open polyline within tolerance of it, has a
  // bbox covering the queried cell range, so it is always a candidate.
  //
  // We intentionally do NOT pre-bin segments by category here: the offscreen
  // paint goes through the shared `renderDrawingFills`, which does its own
  // category binning, so a second copy in this component would just allocate
  // per-category arrays of all ~80k segment refs for nothing.
  const spatialIndex = useMemo(() => {
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const diag = Math.hypot(spanX, spanY) || 1;
    // ~256 cells across the diagonal: a good balance between bucket size and
    // grid memory for plans up to ~80k segments.
    const cell = Math.max(diag / 256, 1e-6);
    const invCell = 1 / cell;
    const colsX = Math.max(1, Math.ceil(spanX * invCell) + 1);
    const colsY = Math.max(1, Math.ceil(spanY * invCell) + 1);
    const cells = new Map<number, number[]>();
    // Segments whose bounding box covers too many cells (e.g. a sheet-spanning
    // boundary or context polygon) are NOT rasterised into every cell - that
    // is O(grid) per segment and, with many large polygons in a masterplan,
    // tens of millions of inserts that freeze/OOM the renderer on load. They
    // go in this fallback list which the query always scans.
    const oversized: number[] = [];
    const MAX_CELLS_PER_SEG = 64;
    const clampCol = (v: number) => (v < 0 ? 0 : v >= colsX ? colsX - 1 : v);
    const clampRow = (v: number) => (v < 0 ? 0 : v >= colsY ? colsY - 1 : v);

    const segs = drawing.segments;
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s];
      const pts = seg.points;
      if (pts.length < 2) continue;
      // Segment bounding box in drawing units.
      let sxMin = pts[0],
        syMin = pts[1],
        sxMax = pts[0],
        syMax = pts[1];
      for (let i = 2; i < pts.length; i += 2) {
        const x = pts[i];
        const y = pts[i + 1];
        if (x < sxMin) sxMin = x;
        else if (x > sxMax) sxMax = x;
        if (y < syMin) syMin = y;
        else if (y > syMax) syMax = y;
      }
      const c0 = clampCol(Math.floor((sxMin - minX) * invCell));
      const c1 = clampCol(Math.floor((sxMax - minX) * invCell));
      const r0 = clampRow(Math.floor((syMin - minY) * invCell));
      const r1 = clampRow(Math.floor((syMax - minY) * invCell));
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_CELLS_PER_SEG) {
        oversized.push(s);
        continue;
      }
      for (let cy = r0; cy <= r1; cy++) {
        const base = cy * colsX;
        for (let cx = c0; cx <= c1; cx++) {
          const key = base + cx;
          const bucket = cells.get(key);
          if (bucket) bucket.push(s);
          else cells.set(key, [s]);
        }
      }
    }

    return {
      minX,
      minY,
      invCell,
      colsX,
      colsY,
      cells,
      oversized,
      clampCol,
      clampRow,
    };
    // The grid is purely geometric (segment positions), so it only needs to
    // rebuild when the drawing itself changes - not on re-classification.
  }, [drawing]);

  // Clear a measurement when leaving the measure tool or loading a new file.
  useEffect(() => {
    if (tool !== "measure") setMeasure(null);
  }, [tool]);
  useEffect(() => {
    setMeasure(null);
  }, [drawing]);

  // Track container size.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const w = Math.max(container.clientWidth, 100);
      const h = Math.max(container.clientHeight, 100);
      setSize({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Fit-to-view on drawing / viewport change. Account for page rotation:
  // a 90/270 rotation swaps effective width and height for screen sizing.
  useEffect(() => {
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const drawW = Math.max(maxX - minX, 1);
    const drawH = Math.max(maxY - minY, 1);
    const swap = pageRotation === 90 || pageRotation === 270;
    const effW = swap ? drawH : drawW;
    const effH = swap ? drawW : drawH;
    const scale = Math.min(size.width / effW, size.height / effH) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    fitScaleRef.current = scale;
    setTransform({ scale, tx, ty });
  }, [drawing, pageRotation, size.width, size.height]);

  // Toolbar zoom commands (fit / in / out), consumed by nonce.
  const lastCmdRef = useRef(0);
  useEffect(() => {
    if (!command || command.nonce === lastCmdRef.current) return;
    lastCmdRef.current = command.nonce;
    if (command.kind === "fit") {
      const { minX, minY, maxX, maxY } = drawing.bounds;
      const drawW = Math.max(maxX - minX, 1);
      const drawH = Math.max(maxY - minY, 1);
      const swap = pageRotation === 90 || pageRotation === 270;
      const effW = swap ? drawH : drawW;
      const effH = swap ? drawW : drawH;
      const scale = Math.min(size.width / effW, size.height / effH) * 0.9;
      fitScaleRef.current = scale;
      setTransform({
        scale,
        tx: size.width / 2 - ((minX + maxX) / 2) * scale,
        ty: size.height / 2 + ((minY + maxY) / 2) * scale,
      });
    } else {
      const factor = command.kind === "in" ? 1.25 : 1 / 1.25;
      const mx = size.width / 2;
      const my = size.height / 2;
      setTransform((t) => ({
        scale: t.scale * factor,
        tx: mx - (mx - t.tx) * factor,
        ty: my - (my - t.ty) * factor,
      }));
    }
  }, [command, drawing, pageRotation, size.width, size.height]);

  // Report zoom to the status bar whenever the transform changes.
  useEffect(() => {
    if (!onSignals) return;
    const pct = fitScaleRef.current > 0 ? (transform.scale / fitScaleRef.current) * 100 : 100;
    onSignals({ cursor: null, zoomPct: pct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform.scale]);

  // Re-render the offscreen layer whenever the drawing, classification, or
  // category visibility changes. Uses the shared renderDrawingFills so the
  // headless verification harness paints byte-identical output.
  useEffect(() => {
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const drawW = Math.max(maxX - minX, 1);
    const drawH = Math.max(maxY - minY, 1);
    // Higher offscreen resolution = crisper roads when zoomed. 4096 on the
    // long axis is a good quality/memory balance (~16-65 MB canvas).
    const targetLong = 4096;
    const renderScale = targetLong / Math.max(drawW, drawH);
    const W = Math.ceil(drawW * renderScale);
    const H = Math.ceil(drawH * renderScale);

    let off = offscreenRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offscreenRef.current = off;
    }
    if (off.width !== W || off.height !== H) {
      off.width = W;
      off.height = H;
    }
    const octx = off.getContext("2d");
    if (!octx) return;

    // Non-road categories (greenery, buildings, plots, context…) via the
    // shared filler. Roads are handled below as one solid closed layer.
    renderDrawingFills(octx as unknown as Ctx2D, drawing.segments, {
      bounds: drawing.bounds,
      renderScale,
      visibleCategories,
      categoryColors: CATEGORY_COLORS,
      effCat,
      showOutlines,
      skip: ROAD_CATEGORIES,
    });

    // ROAD NETWORK as one solid layer. PDF roads are hatch-filled (many thin
    // tiles with gaps), so filling them per-tile looks patchy. Instead we
    // rasterise every visible road polygon to a mask, morphologically close
    // the hatch gaps, and paint the result as a single solid corridor colour -
    // a clean "Road Network" consistent with the PDF footprint.
    const roadCatsVisible = ROAD_CATEGORIES_ARR.filter(
      (c) => visibleCategories[c] !== false
    );
    if (roadCatsVisible.length > 0) {
      const ox = (x: number) => (x - minX) * renderScale;
      const oy = (y: number) => (maxY - y) * renderScale;
      const mc = document.createElement("canvas");
      mc.width = W;
      mc.height = H;
      const mctx = mc.getContext("2d", { willReadFrequently: true });
      if (mctx) {
        mctx.fillStyle = "#fff";
        // Pick the dominant visible road colour for the unified network.
        let domCat: RoadCategory = roadCatsVisible[0];
        let domN = -1;
        const counts = new Map<RoadCategory, number>();
        // Stroke width for OPEN road polylines (edges, kerbs, lane lines from
        // DXF). The morph-close radius below fuses parallel kerbs into a solid
        // corridor.
        mctx.strokeStyle = "#fff";
        mctx.lineWidth = Math.max(1, renderScale * 0.8);
        mctx.lineCap = "round";
        mctx.lineJoin = "round";
        for (const seg of drawing.segments) {
          const cat = effCat(seg);
          if (visibleCategories[cat] === false || !ROAD_CATEGORIES.has(cat)) continue;
          const pts = seg.points;
          if (pts.length < 4) continue;
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
          mctx.beginPath();
          mctx.moveTo(ox(pts[0]), oy(pts[1]));
          for (let i = 2; i < pts.length; i += 2) mctx.lineTo(ox(pts[i]), oy(pts[i + 1]));
          if (seg.closed) {
            mctx.closePath();
            mctx.fill();
          } else {
            // Open polyline (kerb, lane marking, edge) - stroke so the close
            // operator fuses parallel edges into a single corridor.
            mctx.stroke();
          }
        }
        for (const [c, n] of counts) if (n > domN) { domN = n; domCat = c; }

        const N = W * H;
        const src = mctx.getImageData(0, 0, W, H).data;
        const mask = new Uint8Array(N);
        for (let i = 0; i < N; i++) mask[i] = src[i * 4 + 3] > 10 ? 1 : 0;
        const radius = Math.max(3, Math.round(renderScale * 2));
        const closed = closeMask(mask, W, H, radius);

        const hex = CATEGORY_COLORS[domCat] ?? "#fbbf24";
        const rr = parseInt(hex.slice(1, 3), 16);
        const gg = parseInt(hex.slice(3, 5), 16);
        const bb = parseInt(hex.slice(5, 7), 16);
        const out = mctx.createImageData(W, H);
        const od = out.data;
        for (let i = 0; i < N; i++) {
          if (closed[i]) {
            const o = i * 4;
            od[o] = rr; od[o + 1] = gg; od[o + 2] = bb; od[o + 3] = 255;
          }
        }
        mctx.putImageData(out, 0, 0);
        octx.drawImage(mc, 0, 0); // composite solid roads over the rest
      }
    }
    // Signal the blit effect that the offscreen pixels changed.
    setOffscreenVersion((v) => v + 1);
    // Repaint when the drawing, the per-group classification override
    // (`groupCategory`, which `effCat` reads to decide each segment's colour),
    // or category visibility changes. This is the single expensive raster path;
    // the per-frame pan/zoom blit below is gated separately so it never lands
    // here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, groupCategory, visibleCategories, showOutlines]);

  // Display loop: blit the offscreen layer with pan/zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, size.width, size.height);

    const off = offscreenRef.current;
    if (!off || off.width === 0) return;

    const { minX, minY, maxX, maxY } = drawing.bounds;
    const drawW = Math.max(maxX - minX, 1);
    const drawH = Math.max(maxY - minY, 1);
    const { scale, tx, ty } = transform;
    // Apply page rotation around the drawing centre, then drawImage the
    // offscreen (which lives in unrotated drawing coords).
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const screenCx = cx * scale + tx;
    const screenCy = -cy * scale + ty;
    const rotRad = (pageRotation * Math.PI) / 180;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(screenCx, screenCy);
    ctx.rotate(rotRad);
    ctx.drawImage(
      off,
      (-drawW / 2) * scale,
      (-drawH / 2) * scale,
      drawW * scale,
      drawH * scale
    );
    ctx.restore();

    // Forward-project drawing units → screen, through pan + page rotation.
    const rotForProj = (pageRotation * Math.PI) / 180;
    const cosRP = Math.cos(rotForProj);
    const sinRP = Math.sin(rotForProj);
    const toScreenPt = (px: number, py: number) => {
      const ux = (px - cx) * scale;
      const uy = -(py - cy) * scale;
      return {
        x: screenCx + (cosRP * ux - sinRP * uy),
        y: screenCy + (sinRP * ux + cosRP * uy),
      };
    };

    // Carriageway-network overlay: one polyline per Link, stroke width
    // proportional to numLanes. Colour comes from `linkColors` when supplied
    // (LOS colours after an assignment run) or lane-count colours otherwise.
    // One-way links get a direction arrowhead; the selected link is haloed.
    if (showLanes && laneNetwork && laneNetwork.links.length > 0) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const links = laneNetwork.links;
      for (let li = 0; li < links.length; li++) {
        const link = links[li];
        const pts = link.points;
        if (pts.length < 4) continue;
        const color = linkColors?.[li] ?? laneCountColor(link.numLanes);
        const isSel = selectedLink === li;
        // Selection halo underneath
        if (isSel) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 6 + link.numLanes * 1.4;
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) {
            const s = toScreenPt(pts[i], pts[i + 1]);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, 1 + link.numLanes * 1.4);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const s = toScreenPt(pts[i], pts[i + 1]);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        // Direction arrowhead for one-way carriageways when zoomed in.
        if (scale > 0.5 && link.oneWay && pts.length >= 6) {
          const mi = (pts.length >> 2) * 2;
          const a = toScreenPt(pts[mi], pts[mi + 1]);
          const nIdx = Math.min(pts.length - 2, mi + 2);
          const b = toScreenPt(pts[nIdx], pts[nIdx + 1]);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.fillStyle = color;
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(9, 0);
          ctx.lineTo(-5, 5);
          ctx.lineTo(-5, -5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // numLanes label when zoomed in close.
        if (scale > 1.2) {
          const mi = (pts.length >> 2) * 2;
          const a = toScreenPt(pts[mi], pts[mi + 1]);
          ctx.font = "bold 11px sans-serif";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 3;
          ctx.strokeText(String(link.numLanes), a.x + 6, a.y - 6);
          ctx.fillStyle = "#fff";
          ctx.fillText(String(link.numLanes), a.x + 6, a.y - 6);
        }
      }
      ctx.restore();
    }

    // Measure overlay (drawn in screen space). Forward-project drawing units
    // through pan + rotation.
    if (measure) {
      const rot = (pageRotation * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const toScreen = (p: { x: number; y: number }) => {
        const ux = (p.x - cx) * scale;
        const uy = -(p.y - cy) * scale;
        return { x: screenCx + (cosR * ux - sinR * uy), y: screenCy + (sinR * ux + cosR * uy) };
      };
      const a = toScreen(measure.a);
      const b = measure.b ? toScreen(measure.b) : null;
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.fillStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      if (b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of [a, b].filter(Boolean) as { x: number; y: number }[]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // `offscreenVersion` stands in for the offscreen pixel content: it bumps
    // after every offscreen re-render, so we re-blit on data/visibility changes
    // without depending on the heavyweight `visibleCategories` / `groupCategory`
    // objects (which don't otherwise affect the blit). The per-frame pan/zoom
    // path only mutates `transform`, so it lands here and does the cheap blit -
    // never the expensive offscreen raster above.
  }, [drawing, transform, pageRotation, size.width, size.height, offscreenVersion, measure, laneNetwork, showLanes, linkColors, selectedLink]);

  const dragMovedRef = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.tx,
      ty: transform.ty,
    };
    dragMovedRef.current = false;
  };

  /** Screen pixels -> drawing units, inverting pan + rotation. */
  function screenToDrawing(cx: number, cy: number): { x: number; y: number } {
    const { scale, tx, ty } = transform;
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const dcx = (minX + maxX) / 2;
    const dcy = (minY + maxY) / 2;
    const screenCx = dcx * scale + tx;
    const screenCy = -dcy * scale + ty;
    const rotRad = (-pageRotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const sx = cx - screenCx;
    const sy = cy - screenCy;
    const ux = cosR * sx - sinR * sy;
    const uy = sinR * sx + cosR * sy;
    return { x: ux / scale + dcx, y: dcy - uy / scale };
  }

  /** Run the point/polygon hit-test for a single segment index against the
   *  query point, folding any improvement into `best`. Pulled out of the loop
   *  so the grid- and (fallback) full-scan code share one source of truth and
   *  the semantics stay identical. */
  function testSeg(
    s: number,
    x: number,
    y: number,
    tol: number,
    best: { dist: number; groupId: string } | null
  ): { dist: number; groupId: string } | null {
    const seg = drawing.segments[s];
    if (visibleCategories[effCat(seg)] === false) return best;
    const pts = seg.points;
    if (seg.closed && pts.length >= 6) {
      let inside = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i],
          yi = pts[i + 1];
        const xj = pts[j],
          yj = pts[j + 1];
        const intersect =
          yi > y !== yj > y &&
          x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) {
        if (!best || best.dist > 0) return { dist: 0, groupId: seg.groupId };
      }
    } else {
      for (let i = 2; i < pts.length; i += 2) {
        const dx = pts[i] - pts[i - 2];
        const dy = pts[i + 1] - pts[i - 1];
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        let t = ((x - pts[i - 2]) * dx + (y - pts[i - 1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px2 = pts[i - 2] + t * dx;
        const py2 = pts[i - 1] + t * dy;
        const d = Math.hypot(x - px2, y - py2);
        if (d < tol && (!best || d < best.dist)) {
          best = { dist: d, groupId: seg.groupId };
        }
      }
    }
    return best;
  }

  function pickGroupAt(cx: number, cy: number): string | null {
    const { scale } = transform;
    const { x, y } = screenToDrawing(cx, cy);
    let best: { dist: number; groupId: string } | null = null;
    const tol = 6 / scale;

    // Query the spatial grid: only segments whose bounding box overlaps a cell
    // within `tol` of the click can possibly match (a closed polygon
    // containing the point, or an open polyline passing within tolerance, must
    // have a bbox covering this cell range). This turns the per-click cost from
    // O(all ~80k segments) into O(segments near the cursor).
    const { minX, minY, invCell, colsX, clampCol, clampRow, cells, oversized } =
      spatialIndex;
    const c0 = clampCol(Math.floor((x - tol - minX) * invCell));
    const c1 = clampCol(Math.floor((x + tol - minX) * invCell));
    const r0 = clampRow(Math.floor((y - tol - minY) * invCell));
    const r1 = clampRow(Math.floor((y + tol - minY) * invCell));

    // De-dup candidate indices across the (small) overlapped cell range so a
    // segment spanning several cells is hit-tested once, not once per cell.
    const seen = new Set<number>();
    for (let cyc = r0; cyc <= r1; cyc++) {
      const base = cyc * colsX;
      for (let cxc = c0; cxc <= c1; cxc++) {
        const bucket = cells.get(base + cxc);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) seen.add(bucket[k]);
      }
    }
    // Sheet-spanning segments aren't in the grid; always consider them.
    for (let k = 0; k < oversized.length; k++) seen.add(oversized[k]);
    // Test candidates in ascending segment index, i.e. their order in
    // `drawing.segments`. This makes ties break identically to the old full
    // linear scan: among overlapping closed polygons that all contain the
    // point (all dist 0), or open polylines at equal distance, the lowest-index
    // segment wins - so the returned group id is unchanged from before.
    const candidates = Array.from(seen).sort((a, b) => a - b);
    for (let k = 0; k < candidates.length; k++) {
      best = testSeg(candidates[k], x, y, tol, best);
    }
    return best?.groupId ?? null;
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    // Report cursor position in drawing units for the status bar, coalesced
    // to one update per animation frame so mouse-move doesn't spam parent
    // re-renders faster than the screen refreshes.
    if (onSignals && canvas) {
      const rect = canvas.getBoundingClientRect();
      const p = screenToDrawing(e.clientX - rect.left, e.clientY - rect.top);
      const pct =
        fitScaleRef.current > 0 ? (transform.scale / fitScaleRef.current) * 100 : 100;
      pendingSignalRef.current = { cursor: p, zoomPct: pct };
      if (signalRafRef.current == null) {
        signalRafRef.current = requestAnimationFrame(() => {
          signalRafRef.current = null;
          if (pendingSignalRef.current) onSignals(pendingSignalRef.current);
        });
      }
      // Live measure rubber-band.
      if (tool === "measure" && measure && !measure.b) {
        setMeasure({ a: measure.a, b: p });
      }
    }
    // Pan only with the pan tool (or middle-drag); measure/pick don't pan.
    if (!dragRef.current || tool !== "pan") return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
    setTransform((t) => ({
      ...t,
      tx: dragRef.current!.tx + dx,
      ty: dragRef.current!.ty + dy,
    }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasDrag = dragMovedRef.current;
    dragRef.current = null;
    if (wasDrag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (tool === "pick" && onPickGroup) {
      const groupId = pickGroupAt(cx, cy);
      if (groupId) onPickGroup(groupId);
      return;
    }
    // Plain-click link picking (pan tool): report the nearest network link
    // within ~12 screen px, or null when clicking empty space.
    if (tool === "pan" && onPickLink && laneNetwork && showLanes) {
      const p = screenToDrawing(cx, cy);
      const tolDraw = 12 / Math.max(transform.scale, 1e-9);
      let best = -1;
      let bd = tolDraw;
      const links = laneNetwork.links;
      for (let li = 0; li < links.length; li++) {
        const pts = links[li].points;
        for (let i = 2; i < pts.length; i += 2) {
          const ax = pts[i - 2], ay = pts[i - 1];
          const bx = pts[i], by = pts[i + 1];
          const dx = bx - ax, dy = by - ay;
          const L2 = dx * dx + dy * dy;
          let t = L2 > 0 ? ((p.x - ax) * dx + (p.y - ay) * dy) / L2 : 0;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const qx = ax + dx * t, qy = ay + dy * t;
          const d = Math.hypot(p.x - qx, p.y - qy);
          if (d < bd) { bd = d; best = li; }
        }
      }
      onPickLink(best >= 0 ? best : null);
      return;
    }
    if (tool === "measure") {
      const p = screenToDrawing(cx, cy);
      setMeasure((m) => {
        if (!m || m.b) return { a: p, b: null }; // start fresh
        onMeasure?.(Math.hypot(p.x - m.a.x, p.y - m.a.y)); // finished: report length
        return { a: m.a, b: p };
      });
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setTransform((t) => ({
      scale: t.scale * factor,
      tx: mx - (mx - t.tx) * factor,
      ty: my - (my - t.ty) * factor,
    }));
  };

  const measureDist =
    measure && measure.b ? Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y) : null;

  const cursorStyle =
    tool === "pick" || tool === "measure"
      ? "crosshair"
      : dragRef.current
      ? "grabbing"
      : "grab";

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, background: "#0f172a" }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => onSignals?.({ cursor: null, zoomPct: fitScaleRef.current > 0 ? (transform.scale / fitScaleRef.current) * 100 : 100 })}
        onWheel={onWheel}
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: "block",
          cursor: cursorStyle,
          touchAction: "none",
        }}
      />
      {measureDist != null && (
        <div className="vp-overlay vp-readout" style={{ left: 12, bottom: 12 }}>
          Measured: {measureDist.toFixed(1)} units
        </div>
      )}
    </div>
  );
}
