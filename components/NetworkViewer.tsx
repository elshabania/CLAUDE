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

export function NetworkViewer({
  network,
  results,
  selectedJunctionId,
  onSelectJunction,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null
  );

  // Junction picking radius in screen px.
  const PICK_RADIUS = 14;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { minX, minY, maxX, maxY } = network.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(canvas.width / w, canvas.height / h) * 0.9;
    const tx = canvas.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = canvas.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [network]);

  const project = (t: Transform, x: number, y: number) => ({
    px: x * t.scale + t.tx,
    py: -y * t.scale + t.ty,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Buildings.
    ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 0.5;
    for (const b of network.buildings) {
      ctx.beginPath();
      for (let i = 0; i < b.points.length; i += 2) {
        const { px, py } = project(transform, b.points[i], b.points[i + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Links.
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
        const { px, py } = project(transform, pts[i], pts[i + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Junctions.
    for (const j of network.junctions) {
      const res = results[j.id];
      const { px, py } = project(transform, j.x, j.y);
      const r = j.id === selectedJunctionId ? 9 : 6;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
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
        ctx.fillText(res.los, px, py + 0.5);
      }
    }
  }, [network, results, selectedJunctionId, transform]);

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
    // Click — find closest junction.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
    let best: { id: string; d: number } | null = null;
    for (const j of network.junctions) {
      const { px, py } = project(transform, j.x, j.y);
      const d = Math.hypot(px - mx, py - my);
      if (d <= PICK_RADIUS && (!best || d < best.d)) best = { id: j.id, d };
    }
    onSelectJunction(best?.id ?? null);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setTransform((t) => ({
      scale: t.scale * factor,
      tx: mx - (mx - t.tx) * factor,
      ty: my - (my - t.ty) * factor,
    }));
  };

  const stats = useMemo(() => {
    return {
      nodes: network.nodes.length,
      links: network.links.length,
      junctions: network.junctions.length,
      buildings: network.buildings.length,
    };
  }, [network]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
