"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import { renderDrawingFills, type Ctx2D } from "@/lib/render-drawing";

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
}

export function CadViewer({
  drawing,
  visibleCategories,
  groupCategory,
  pageRotation = 0,
  tool = "pan",
  command,
  onSignals,
  onPickGroup,
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
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );

  // Pre-bin segments by *effective* category so the render loop only walks
  // the segments it'll actually paint.
  const segmentsByCategory = useMemo(() => {
    const m = new Map<RoadCategory, ParsedDrawing["segments"]>();
    for (const seg of drawing.segments) {
      const cat = effCat(seg);
      const arr = m.get(cat) ?? [];
      arr.push(seg);
      m.set(cat, arr);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, groupCategory]);

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
    const targetLong = 3500;
    const renderScale = Math.min(
      targetLong / Math.max(drawW, drawH),
      4096 / Math.max(drawW, drawH)
    );
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

    renderDrawingFills(octx as unknown as Ctx2D, drawing.segments, {
      bounds: drawing.bounds,
      renderScale,
      visibleCategories,
      categoryColors: CATEGORY_COLORS,
      effCat,
    });
  }, [drawing, segmentsByCategory, visibleCategories]);

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
  }, [drawing, transform, pageRotation, size.width, size.height, visibleCategories, segmentsByCategory, measure]);

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

  function pickGroupAt(cx: number, cy: number): string | null {
    const { scale } = transform;
    const { x, y } = screenToDrawing(cx, cy);
    let best: { dist: number; groupId: string } | null = null;
    const tol = 6 / scale;
    for (const seg of drawing.segments) {
      if (visibleCategories[effCat(seg)] === false) continue;
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
          if (!best || best.dist > 0) best = { dist: 0, groupId: seg.groupId };
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
    if (tool === "measure") {
      const p = screenToDrawing(cx, cy);
      setMeasure((m) => {
        if (!m || m.b) return { a: p, b: null }; // start fresh
        return { a: m.a, b: p }; // finish
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
