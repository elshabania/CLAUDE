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
  /** Visibility per group (PDF: by colour cluster, DXF: by layer name). */
  visibleGroups: Record<string, boolean>;
  /** Override the category for a group (used by user re-labelling). */
  groupCategory: Record<string, RoadCategory>;
}

export function CadViewer({ drawing, visibleGroups, groupCategory }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

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
      if (visibleGroups[seg.groupId] === false) continue;
      const cat = groupCategory[seg.groupId] ?? seg.category;
      ctx.strokeStyle = CATEGORY_COLORS[cat];
      ctx.lineWidth = CATEGORY_WIDTH[cat];
      ctx.beginPath();
      const pts = seg.points;
      for (let i = 0; i < pts.length; i += 2) {
        const { px, py } = project(pts[i], pts[i + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (seg.closed) ctx.closePath();
      ctx.stroke();
    }
  }, [drawing, transform, visibleGroups, groupCategory]);

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
      const newTx = mx - (mx - t.tx) * factor;
      const newTy = my - (my - t.ty) * factor;
      return { scale: newScale, tx: newTx, ty: newTy };
    });
  };

  return (
    <canvas
      ref={canvasRef}
      width={1400}
      height={900}
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
