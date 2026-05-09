"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import type { RoadNetwork, BuildingType } from "@/lib/road-network";

const BUILDING_TYPE_FILL: Record<BuildingType, string> = {
  residential: "rgba(74, 222, 128, 0.20)",
  commercial: "rgba(56, 189, 248, 0.22)",
  retail: "rgba(167, 139, 250, 0.22)",
  office: "rgba(96, 165, 250, 0.22)",
  school: "rgba(251, 191, 36, 0.22)",
  mosque: "rgba(45, 212, 191, 0.22)",
  hospital: "rgba(248, 113, 113, 0.22)",
  civic: "rgba(244, 114, 182, 0.22)",
  industrial: "rgba(120, 113, 108, 0.28)",
  parking: "rgba(148, 163, 184, 0.18)",
  amenity: "rgba(232, 121, 249, 0.22)",
  other: "rgba(148, 163, 184, 0.22)",
};

const BUILDING_TYPE_STROKE: Record<BuildingType, string> = {
  residential: "rgba(74, 222, 128, 0.55)",
  commercial: "rgba(56, 189, 248, 0.55)",
  retail: "rgba(167, 139, 250, 0.55)",
  office: "rgba(96, 165, 250, 0.55)",
  school: "rgba(251, 191, 36, 0.55)",
  mosque: "rgba(45, 212, 191, 0.55)",
  hospital: "rgba(248, 113, 113, 0.55)",
  civic: "rgba(244, 114, 182, 0.55)",
  industrial: "rgba(168, 162, 158, 0.55)",
  parking: "rgba(148, 163, 184, 0.45)",
  amenity: "rgba(232, 121, 249, 0.55)",
  other: "rgba(148, 163, 184, 0.45)",
};

const ROAD_CATEGORIES: RoadCategory[] = [
  "centerline",
  "edge",
  "lane",
  "curb",
  "shoulder",
];

const ROAD_STYLE: Record<
  RoadCategory,
  { color: string; width: number; dash?: number[] }
> = {
  centerline: { color: "#fbbf24", width: 1.6, dash: [6, 4] },
  edge: { color: "#cbd5e1", width: 2.4 },
  lane: { color: "#94a3b8", width: 1.2, dash: [3, 6] },
  curb: { color: "#e2e8f0", width: 2.2 },
  shoulder: { color: "#64748b", width: 1.6 },
  // Two below are present so the type is exhaustive but won't be drawn here.
  boundary: { color: "transparent", width: 0 },
  building: { color: "transparent", width: 0 },
  other: { color: "transparent", width: 0 },
};

interface Props {
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  network: RoadNetwork;
  showJunctions: boolean;
}

export function NetworkViewer({
  drawing,
  groupCategory,
  network,
  showJunctions,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
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

  // Group road segments by category for drawing-order control. Drawing edges
  // / curbs last keeps lane and centerline markings underneath the road body.
  const segmentsByCat = useMemo(() => {
    const map = new Map<RoadCategory, typeof drawing.segments>();
    for (const cat of ROAD_CATEGORIES) map.set(cat, []);
    for (const s of drawing.segments) {
      const cat = groupCategory[s.groupId] ?? s.category;
      const bucket = map.get(cat);
      if (bucket) bucket.push(s);
    }
    return map;
  }, [drawing, groupCategory]);

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

    // Building footprints: filled per type; faint outline.
    ctx.lineWidth = 0.6;
    for (const b of network.buildings) {
      const pts = b.points;
      if (pts.length < 6) continue;
      const type = b.buildingType ?? "other";
      ctx.fillStyle = BUILDING_TYPE_FILL[type];
      ctx.strokeStyle = BUILDING_TYPE_STROKE[type];
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(px(pts[i]), py(pts[i + 1]));
        else ctx.lineTo(px(pts[i]), py(pts[i + 1]));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Building labels (only when zoom is sufficient to render legibly).
    if (transform.scale >= 0.5) {
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "10px ui-sans-serif, system-ui";
      for (const b of network.buildings) {
        if (!b.label) continue;
        const c = polygonCentroid(b.points);
        if (!c) continue;
        const widthPx = polygonAabbWidth(b.points) * transform.scale;
        if (widthPx < 24) continue; // too small at this zoom
        const label = truncateForWidth(b.label, ctx, Math.max(widthPx - 6, 20));
        if (!label) continue;
        ctx.fillText(label, px(c.x), py(c.y));
      }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw roads in a sensible z-order: shoulders -> edges/curbs -> lane -> centerline.
    const drawOrder: RoadCategory[] = [
      "shoulder",
      "edge",
      "curb",
      "lane",
      "centerline",
    ];
    for (const cat of drawOrder) {
      const segs = segmentsByCat.get(cat);
      const style = ROAD_STYLE[cat];
      if (!segs || segs.length === 0 || style.width === 0) continue;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      if (style.dash) ctx.setLineDash(style.dash);
      else ctx.setLineDash([]);
      for (const s of segs) {
        const pts = s.points;
        if (pts.length < 4) continue;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) ctx.moveTo(px(pts[i]), py(pts[i + 1]));
          else ctx.lineTo(px(pts[i]), py(pts[i + 1]));
        }
        if (s.closed) ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    if (showJunctions) {
      for (const j of network.junctions) {
        ctx.beginPath();
        ctx.arc(px(j.x), py(j.y), 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(251, 191, 36, 0.85)";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }, [
    drawing,
    network,
    segmentsByCat,
    transform,
    size.width,
    size.height,
    showJunctions,
  ]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.tx,
      ty: transform.ty,
    };
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

  const stats = useMemo(() => {
    const counts: Partial<Record<RoadCategory, number>> = {};
    for (const cat of ROAD_CATEGORIES) {
      counts[cat] = segmentsByCat.get(cat)?.length ?? 0;
    }
    return {
      counts,
      buildings: network.buildings.length,
    };
  }, [segmentsByCat, network.buildings.length]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#0b1220" }}>
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
      <NetworkLegend stats={stats} />
    </div>
  );
}

function polygonCentroid(points: number[]): { x: number; y: number } | null {
  if (points.length < 6) return null;
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const cross = points[i] * points[j + 1] - points[j] * points[i + 1];
    area += cross;
    cx += (points[i] + points[j]) * cross;
    cy += (points[i + 1] + points[j + 1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-3) {
    // Degenerate ring: fall back to AABB centroid.
    let mnx = Infinity,
      mny = Infinity,
      mxx = -Infinity,
      mxy = -Infinity;
    for (let i = 0; i < n; i += 2) {
      const x = points[i],
        y = points[i + 1];
      if (x < mnx) mnx = x;
      if (y < mny) mny = y;
      if (x > mxx) mxx = x;
      if (y > mxy) mxy = y;
    }
    return { x: (mnx + mxx) / 2, y: (mny + mxy) / 2 };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function polygonAabbWidth(points: number[]): number {
  let mnx = Infinity,
    mxx = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < mnx) mnx = points[i];
    if (points[i] > mxx) mxx = points[i];
  }
  return mxx - mnx;
}

function truncateForWidth(
  text: string,
  ctx: CanvasRenderingContext2D,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = ((lo + hi) >> 1) + 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + "…" : "";
}

function NetworkLegend({
  stats,
}: {
  stats: {
    counts: Partial<Record<RoadCategory, number>>;
    buildings: number;
  };
}) {
  const items: { label: string; color: string; count: number; dash?: boolean }[] = [
    {
      label: "Edges / kerbs",
      color: ROAD_STYLE.edge.color,
      count: stats.counts.edge ?? 0,
    },
    {
      label: "Lane markings",
      color: ROAD_STYLE.lane.color,
      count: stats.counts.lane ?? 0,
      dash: true,
    },
    {
      label: "Centerlines",
      color: ROAD_STYLE.centerline.color,
      count: stats.counts.centerline ?? 0,
      dash: true,
    },
    {
      label: "Curbs",
      color: ROAD_STYLE.curb.color,
      count: stats.counts.curb ?? 0,
    },
    {
      label: "Shoulders",
      color: ROAD_STYLE.shoulder.color,
      count: stats.counts.shoulder ?? 0,
    },
    {
      label: "Buildings",
      color: "rgba(148, 163, 184, 0.5)",
      count: stats.buildings,
    },
  ].filter((i) => i.count > 0);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        padding: "8px 12px",
        background: "rgba(15, 23, 42, 0.85)",
        color: "#cbd5e1",
        fontSize: 11,
        borderRadius: 6,
        border: "1px solid #1e293b",
        pointerEvents: "none",
        display: "grid",
        gap: 4,
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 18,
              height: 0,
              borderTop: `${it.dash ? "2px dashed" : "2px solid"} ${it.color}`,
              display: it.label === "Buildings" ? "none" : "inline-block",
            }}
          />
          {it.label === "Buildings" && (
            <span
              style={{
                width: 14,
                height: 10,
                background: it.color,
                border: "1px solid rgba(148, 163, 184, 0.45)",
                display: "inline-block",
              }}
            />
          )}
          <span style={{ flex: 1 }}>{it.label}</span>
          <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
            {it.count}
          </span>
        </div>
      ))}
    </div>
  );
}
