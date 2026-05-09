"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoadNetwork } from "@/lib/road-network";
import type { JunctionResult } from "@/lib/hcm";
import { LOS_COLORS } from "@/lib/hcm";

interface Props {
  network: RoadNetwork;
  results: Record<string, JunctionResult | undefined>;
  selectedJunctionId: string | null;
  onSelectJunction: (id: string | null) => void;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const PICK_RADIUS = 14;

export function NetworkViewer({
  network,
  results,
  selectedJunctionId,
  onSelectJunction,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
    moved: boolean;
  } | null>(null);

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

  useEffect(() => {
    const { minX, minY, maxX, maxY } = network.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(size.width / w, size.height / h) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [network, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, size.width, size.height);

    const { scale, tx, ty } = transform;
    const px = (x: number) => x * scale + tx;
    const py = (y: number) => -y * scale + ty;

    ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 0.5;
    for (const b of network.buildings) {
      ctx.beginPath();
      const pts = b.points;
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(px(pts[i]), py(pts[i + 1]));
        else ctx.lineTo(px(pts[i]), py(pts[i + 1]));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const link of network.links) {
      const fromRes = results[link.fromNode];
      const toRes = results[link.toNode];
      const worstLos = pickWorstLos(fromRes, toRes);
      ctx.strokeStyle = worstLos ? LOS_COLORS[worstLos] : "#475569";
      ctx.lineWidth = worstLos ? 2.4 : 1.6;
      ctx.beginPath();
      const pts = link.points;
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(px(pts[i]), py(pts[i + 1]));
        else ctx.lineTo(px(pts[i]), py(pts[i + 1]));
      }
      ctx.stroke();
    }

    for (const j of network.junctions) {
      const res = results[j.id];
      const cx = px(j.x);
      const cy = py(j.y);
      const r = j.id === selectedJunctionId ? 9 : 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = res ? LOS_COLORS[res.los] : "#1e293b";
      ctx.fill();
      ctx.strokeStyle = j.id === selectedJunctionId ? "#fbbf24" : "#0f172a";
      ctx.lineWidth = j.id === selectedJunctionId ? 2 : 1;
      ctx.stroke();
      if (res) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 9px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(res.los, cx, cy + 0.5);
      }
    }
  }, [network, results, selectedJunctionId, transform, size.width, size.height]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.tx,
      ty: transform.ty,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
    setTransform((t) => ({ ...t, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const project = (x: number, y: number) => ({
      px: x * transform.scale + transform.tx,
      py: -y * transform.scale + transform.ty,
    });
    let best: { id: string; d: number } | null = null;
    for (const j of network.junctions) {
      const { px: jx, py: jy } = project(j.x, j.y);
      const d = Math.hypot(jx - mx, jy - my);
      if (d <= PICK_RADIUS && (!best || d < best.d)) best = { id: j.id, d };
    }
    onSelectJunction(best?.id ?? null);
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

  const stats = useMemo(
    () => ({
      nodes: network.nodes.length,
      links: network.links.length,
      junctions: network.junctions.length,
      buildings: network.buildings.length,
    }),
    [network]
  );

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, background: "#0b1220" }}
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
          cursor: dragRef.current?.moved ? "grabbing" : "grab",
          touchAction: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          padding: "6px 10px",
          background: "rgba(15, 23, 42, 0.85)",
          color: "#94a3b8",
          fontSize: 11,
          borderRadius: 6,
          border: "1px solid #1e293b",
          pointerEvents: "none",
        }}
      >
        {stats.junctions} junctions · {stats.links} links · {stats.nodes} nodes ·{" "}
        {stats.buildings} buildings
      </div>
    </div>
  );
}

function pickWorstLos(
  ...res: (JunctionResult | undefined)[]
): JunctionResult["los"] | null {
  const order: JunctionResult["los"][] = ["A", "B", "C", "D", "E", "F"];
  let worst: JunctionResult["los"] | null = null;
  for (const r of res) {
    if (!r) continue;
    if (!worst || order.indexOf(r.los) > order.indexOf(worst)) worst = r.los;
  }
  return worst;
}
