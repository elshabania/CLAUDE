"use client";

import { useEffect, useRef, useState } from "react";
import {
  ROAD_CATEGORIES,
  type ParsedDrawing,
  type RoadCategory,
} from "@/lib/road-detect";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import type { PdfRasterPage } from "@/lib/pdf-extract-client";

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

interface Props {
  drawing: ParsedDrawing;
  /** PDF rendered to a raster canvas - drawn as the pixel-perfect background. */
  rasterPage: PdfRasterPage | null;
  visibleCategories: Record<RoadCategory, boolean>;
  /** Optional per-group category override (re-pick updates this map). */
  groupCategory?: Record<string, RoadCategory>;
  /** Optional click handler. When set, clicking reports the matched group id. */
  onPickGroup?: (groupId: string) => void;
}

export function CadViewer({
  drawing,
  rasterPage,
  visibleCategories,
  groupCategory,
  onPickGroup,
}: Props) {
  /** Effective category for a segment: per-group override first, else the
   *  baseline category from detection. */
  function effCat(seg: { groupId: string; category: RoadCategory }): RoadCategory {
    return groupCategory?.[seg.groupId] ?? seg.category;
  }
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );

  // Track the container's actual rendered size so the canvas backing buffer
  // matches what the user sees - independent of any flex-chain quirks above us.
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

  // Fit-to-view: prefer the raster page's extent so the legend block is in
  // frame, fall back to the parsed-drawing bounds otherwise.
  useEffect(() => {
    let minX = 0,
      minY = 0,
      maxX = 1,
      maxY = 1;
    if (rasterPage) {
      maxX = rasterPage.pdfWidth;
      maxY = rasterPage.pdfHeight;
    } else {
      ({ minX, minY, maxX, maxY } = drawing.bounds);
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(size.width / w, size.height / h) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [drawing, rasterPage, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, size.width, size.height);

    const { scale, tx, ty } = transform;

    // 1. Background: PDF rendered raster (pixel-perfect to the source).
    //    PDF units are y-up; canvas is y-down. We project PDF (0,0) bottom-left
    //    onto the screen using the same affine the vector overlay uses, then
    //    drawImage the raster canvas to fill the rect from PDF (0,0) to
    //    (pdfWidth, pdfHeight).
    if (rasterPage && rasterPage.canvas.width > 0) {
      const dx = tx;
      const dy = ty - rasterPage.pdfHeight * scale;
      const dw = rasterPage.pdfWidth * scale;
      const dh = rasterPage.pdfHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(rasterPage.canvas, dx, dy, dw, dh);
    }

    // 2. Hide-category overlay: paint a translucent dark fill over every
    //    closed polygon belonging to a hidden category. Open polylines get
    //    a thicker dark stroke. Hidden = visibleCategories[cat] === false.
    const hidden = new Set<RoadCategory>();
    for (const [cat, on] of Object.entries(visibleCategories)) {
      if (on === false) hidden.add(cat as RoadCategory);
    }
    if (hidden.size > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(15, 23, 42, 0.92)";
      ctx.lineWidth = 1.6;
      for (const seg of drawing.segments) {
        if (!hidden.has(effCat(seg))) continue;
        const pts = seg.points;
        if (pts.length < 4) continue;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const px = pts[i] * scale + tx;
          const py = -pts[i + 1] * scale + ty;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        if (seg.closed) {
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. When picking, draw a faint highlight over the picking-target
    //    category's polygons so the user can see what they're aiming at.
    //    (Picking state is signalled via onPickGroup being defined.)
    // (Per-pick highlight is handled separately if needed.)
  }, [
    drawing,
    rasterPage,
    transform,
    visibleCategories,
    size.width,
    size.height,
  ]);

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

  /** Hit-test: returns the topmost visible segment under (canvasX, canvasY). */
  function pickGroupAt(cx: number, cy: number): string | null {
    const { scale, tx, ty } = transform;
    const x = (cx - tx) / scale;
    const y = -(cy - ty) / scale;
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
    if (!dragRef.current) return;
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
    dragRef.current = null;
    if (!dragMovedRef.current && onPickGroup) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const groupId = pickGroupAt(cx, cy);
        if (groupId) onPickGroup(groupId);
      }
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "#1f2937",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: "block",
          cursor: onPickGroup
            ? "crosshair"
            : dragRef.current
            ? "grabbing"
            : "grab",
          touchAction: "none",
        }}
      />
      {!rasterPage && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            padding: "6px 10px",
            background: "rgba(15,23,42,0.85)",
            color: "#cbd5e1",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Rendering PDF…
        </div>
      )}
    </div>
  );
}
