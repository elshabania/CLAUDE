"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoadNetwork } from "@/lib/road-network";
import type { NetworkDimensions } from "@/lib/highway-dims";
import { LOS_COLORS, type LOS } from "@/lib/hcm";
import type { FunctionalClass } from "@/lib/highway-dims";

const CLASS_COLORS: Record<FunctionalClass, string> = {
  arterial: "#f87171",
  collector: "#fbbf24",
  local: "#38bdf8",
  access: "#a78bfa",
  ramp: "#34d399",
  unknown: "#94a3b8",
};

interface Props {
  network: RoadNetwork;
  dims: NetworkDimensions;
  pageRotation?: number;
  /** "los" colours links by Level of Service, "class" by functional class. */
  colorBy: "los" | "class";
  selectedLinkId?: string | null;
  onSelectLink?: (linkId: string | null) => void;
}

export function HighwayPlanViewer({
  network,
  dims,
  pageRotation = 0,
  colorBy,
  selectedLinkId,
  onSelectLink,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );
  const dragMovedRef = useRef(false);

  const dimsByLink = useMemo(() => {
    const m = new Map<string, NetworkDimensions["links"][number]>();
    for (const d of dims.links) m.set(d.linkId, d);
    return m;
  }, [dims]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setSize({
        width: Math.max(container.clientWidth, 100),
        height: Math.max(container.clientHeight, 100),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const { minX, minY, maxX, maxY } = network.bounds;
    const drawW = Math.max(maxX - minX, 1);
    const drawH = Math.max(maxY - minY, 1);
    const swap = pageRotation === 90 || pageRotation === 270;
    const effW = swap ? drawH : drawW;
    const effH = swap ? drawW : drawH;
    const scale = Math.min(size.width / effW, size.height / effH) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [network, pageRotation, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, size.width, size.height);

    const { scale, tx, ty } = transform;
    const { minX, minY, maxX, maxY } = network.bounds;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const screenCx = cx * scale + tx;
    const screenCy = -cy * scale + ty;
    const rot = (pageRotation * Math.PI) / 180;

    ctx.save();
    try {
      ctx.translate(screenCx, screenCy);
      ctx.rotate(rot);
      // Now draw in a frame where (0,0) is the drawing centre; project a point
      // (x,y) in drawing units to this rotated frame.
      const px = (x: number) => (x - cx) * scale;
      const py = (y: number) => -(y - cy) * scale;

      // Links coloured by LOS or functional class.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const link of network.links) {
        const pts = link.points;
        if (!pts || pts.length < 4) continue;
        const d = dimsByLink.get(link.id);
        let colour = "#64748b";
        if (colorBy === "los" && d?.los) colour = LOS_COLORS[d.los.los as LOS] ?? colour;
        else if (d) colour = CLASS_COLORS[d.functionalClass] ?? colour;
        const isSel = selectedLinkId === link.id;
        ctx.strokeStyle = isSel ? "#ffffff" : colour;
        ctx.lineWidth = isSel ? 5 : Math.max(2, (link.lanesPerDir ?? 1) * 1.6);
        ctx.beginPath();
        ctx.moveTo(px(pts[0]), py(pts[1]));
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(px(pts[i]), py(pts[i + 1]));
        ctx.stroke();
      }

      // Junction markers.
      for (const j of network.junctions) {
        const x = px(j.x);
        const y = py(j.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.beginPath();
        if (j.kind === "roundabout") {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2.5;
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = j.kind === "signal" ? "#f87171" : "#38bdf8";
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } catch (err) {
      // A draw failure must never crash the app; the ErrorBoundary covers
      // render-time throws, this covers anything odd in the 2D context.
      // eslint-disable-next-line no-console
      console.error("HighwayPlanViewer draw failed:", err);
    } finally {
      ctx.restore();
    }
  }, [
    network,
    dimsByLink,
    transform,
    pageRotation,
    colorBy,
    selectedLinkId,
    size.width,
    size.height,
  ]);

  function pickLinkAt(cxp: number, cyp: number): string | null {
    const { scale, tx, ty } = transform;
    const { minX, minY, maxX, maxY } = network.bounds;
    const dcx = (minX + maxX) / 2;
    const dcy = (minY + maxY) / 2;
    const screenCx = dcx * scale + tx;
    const screenCy = -dcy * scale + ty;
    const rot = (-pageRotation * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const sx = cxp - screenCx;
    const sy = cyp - screenCy;
    const ux = cosR * sx - sinR * sy;
    const uy = sinR * sx + cosR * sy;
    const x = ux / scale + dcx;
    const y = dcy - uy / scale;
    const tol = 8 / scale;
    let best: { d: number; id: string } | null = null;
    for (const link of network.links) {
      const pts = link.points;
      for (let i = 2; i < pts.length; i += 2) {
        const dx = pts[i] - pts[i - 2];
        const dy = pts[i + 1] - pts[i - 1];
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        let t = ((x - pts[i - 2]) * dx + (y - pts[i - 1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const qx = pts[i - 2] + t * dx;
        const qy = pts[i - 1] + t * dy;
        const dist = Math.hypot(x - qx, y - qy);
        if (dist < tol && (!best || dist < best.d)) best = { d: dist, id: link.id };
      }
    }
    return best?.id ?? null;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
    dragMovedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
    setTransform((t) => ({ ...t, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (!dragMovedRef.current && onSelectLink) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        onSelectLink(pickLinkAt(e.clientX - rect.left, e.clientY - rect.top));
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
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#070b14" }}>
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
