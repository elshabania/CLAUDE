"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

export const CATEGORY_COLORS: Record<RoadCategory, string> = {
  centerline: "#facc15",
  edge: "#38bdf8",
  lane: "#a78bfa",
  curb: "#f472b6",
  shoulder: "#34d399",
  boundary: "#22c55e",
  building: "#94a3b8",
  other: "#475569",
};

const CATEGORY_WIDTH: Record<RoadCategory, number> = {
  centerline: 2,
  edge: 1.6,
  lane: 1.2,
  curb: 1.4,
  shoulder: 1.2,
  boundary: 1.2,
  building: 1,
  other: 0.6,
};

interface Props {
  drawing: ParsedDrawing;
  visibleGroups: Record<string, boolean>;
  groupCategory: Record<string, RoadCategory>;
}

export function CadViewer({ drawing, visibleGroups, groupCategory }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Track the container's actual rendered size and the device pixel ratio so
  // the canvas backing buffer matches what the user sees - independent of any
  // flex-chain quirks above us.
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

  // Fit-to-view whenever drawing changes or the viewport resizes.
  useEffect(() => {
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(size.width / w, size.height / h) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [drawing, size.width, size.height]);

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

    const { scale, tx, ty } = transform;
    for (const seg of drawing.segments) {
      if (visibleGroups[seg.groupId] === false) continue;
      const cat = groupCategory[seg.groupId] ?? seg.category;
      ctx.strokeStyle = CATEGORY_COLORS[cat];
      ctx.lineWidth = CATEGORY_WIDTH[cat];
      ctx.beginPath();
      const pts = seg.points;
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i] * scale + tx;
        const py = -pts[i + 1] * scale + ty;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (seg.closed) ctx.closePath();
      ctx.stroke();
    }
  }, [drawing, transform, visibleGroups, groupCategory, size.width, size.height]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTransform((t) => ({ ...t, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
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
        background: "#0f172a",
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
          cursor: dragRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
      />
    </div>
  );
}
