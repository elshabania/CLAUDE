"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

const CATEGORY_COLORS: Record<RoadCategory, string> = {
  centerline: "#facc15",
  edge: "#38bdf8",
  lane: "#a78bfa",
  curb: "#f472b6",
  shoulder: "#34d399",
  other: "#475569",
};

const CATEGORY_WIDTH: Record<RoadCategory, number> = {
  centerline: 2,
  edge: 1.6,
  lane: 1.2,
  curb: 1.4,
  shoulder: 1.2,
  other: 0.8,
};

interface Props {
  drawing: ParsedDrawing;
  visible: Record<RoadCategory, boolean>;
}

export function CadViewer({ drawing, visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Fit drawing to canvas on first load / when drawing changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { minX, minY, maxX, maxY } = drawing.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(canvas.width / w, canvas.height / h) * 0.9;
    const tx = canvas.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = canvas.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [drawing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { scale, tx, ty } = transform;
    const project = (x: number, y: number) => ({
      px: x * scale + tx,
      py: -y * scale + ty,
    });

    for (const seg of drawing.segments) {
      if (!visible[seg.category]) continue;
      ctx.strokeStyle = CATEGORY_COLORS[seg.category];
      ctx.lineWidth = CATEGORY_WIDTH[seg.category];
      ctx.beginPath();
      seg.points.forEach((p, i) => {
        const { px, py } = project(p.x, p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (seg.closed) ctx.closePath();
      ctx.stroke();
    }
  }, [drawing, transform, visible]);

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
    setTransform((t) => {
      const newScale = t.scale * factor;
      // Keep cursor anchor stable across zoom.
      const newTx = mx - (mx - t.tx) * factor;
      const newTy = my - (my - t.ty) * factor;
      return { scale: newScale, tx: newTx, ty: newTy };
    });
  };

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={800}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: dragRef.current ? "grabbing" : "grab",
        touchAction: "none",
      }}
    />
  );
}

export { CATEGORY_COLORS };
