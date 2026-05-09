"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import type { RoadNetwork } from "@/lib/road-network";
import {
  buildSimulationState,
  spawnVehicles,
  clearVehicles,
  pointOnLink,
  tangentOnLink,
  step,
  type SimulationState,
} from "@/lib/simulation";

interface Props {
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  network: RoadNetwork;
}

const ROAD_BG_STYLE: Record<
  RoadCategory,
  { color: string; width: number; dash?: number[] }
> = {
  centerline: { color: "#fbbf2466", width: 1.4, dash: [6, 4] },
  edge: { color: "#94a3b8aa", width: 2.2 },
  lane: { color: "#64748b", width: 1, dash: [3, 6] },
  curb: { color: "#cbd5e1aa", width: 2 },
  shoulder: { color: "#475569", width: 1.4 },
  boundary: { color: "transparent", width: 0 },
  building: { color: "transparent", width: 0 },
  other: { color: "transparent", width: 0 },
};

export function SimulationViewer({ drawing, groupCategory, network }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Simulation control state.
  const [running, setRunning] = useState(true);
  const [speedMul, setSpeedMul] = useState(1);
  const [vehicleCount, setVehicleCount] = useState(150);

  // Persistent simulation state across renders.
  const stateRef = useRef<SimulationState | null>(null);
  // Tick counter to drive a rerender each animation frame for the React-only
  // overlays (the canvas itself paints inside the rAF loop).
  const [, setTick] = useState(0);

  // Resize observer keeps the canvas pixel size synced to the container.
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

  // Rebuild the simulation state when the network changes.
  useEffect(() => {
    const fresh = buildSimulationState(network);
    // Speed scales with the drawing extents so the demo looks sensible
    // regardless of CAD units (the WSPTRA file is in PDF points, ~2300 wide).
    const diag = Math.hypot(
      network.bounds.maxX - network.bounds.minX,
      network.bounds.maxY - network.bounds.minY
    ) || 1;
    const baseSpeed = diag / 60; // cross the drawing in ~60 s
    stateRef.current = spawnVehicles(fresh, vehicleCount, baseSpeed);
    setTick((t) => t + 1);
    // Vehicle count change handled separately so we don't re-snap positions
    // every time the slider moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Adjust population when the slider changes without resetting the rest.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const diag = Math.hypot(
      network.bounds.maxX - network.bounds.minX,
      network.bounds.maxY - network.bounds.minY
    ) || 1;
    const baseSpeed = diag / 60;
    if (vehicleCount > s.vehicles.length) {
      stateRef.current = spawnVehicles(s, vehicleCount - s.vehicles.length, baseSpeed);
    } else if (vehicleCount < s.vehicles.length) {
      stateRef.current = {
        ...s,
        vehicles: s.vehicles.slice(0, vehicleCount),
      };
    }
    setTick((t) => t + 1);
  }, [vehicleCount, network]);

  // Auto-fit transform when the network or canvas size changes.
  useEffect(() => {
    const { minX, minY, maxX, maxY } = network.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min(size.width / w, size.height / h) * 0.9;
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 + ((minY + maxY) / 2) * scale;
    setTransform({ scale, tx, ty });
  }, [network, size.width, size.height]);

  // Group road segments by category (drawn behind the vehicles).
  const segmentsByCat = useMemo(() => {
    const map = new Map<RoadCategory, typeof drawing.segments>();
    for (const cat of Object.keys(ROAD_BG_STYLE) as RoadCategory[]) map.set(cat, []);
    for (const s of drawing.segments) {
      const cat = groupCategory[s.groupId] ?? s.category;
      map.get(cat)?.push(s);
    }
    return map;
  }, [drawing, groupCategory]);

  // The animation loop. requestAnimationFrame gives us tick deltas; we feed
  // dt into step() and re-render the canvas every frame.
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const tickFn = (now: number) => {
      const dt = Math.min(0.1, (now - lastT) / 1000) * speedMul;
      lastT = now;
      const s = stateRef.current;
      if (s && running) step(s, dt);
      drawFrame();
      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speedMul, transform, size.width, size.height, drawing, groupCategory]);

  function drawFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== Math.round(size.width * dpr)) {
      canvas.width = Math.round(size.width * dpr);
    }
    if (canvas.height !== Math.round(size.height * dpr)) {
      canvas.height = Math.round(size.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, size.width, size.height);

    const { scale, tx, ty } = transform;
    const px = (x: number) => x * scale + tx;
    const py = (y: number) => -y * scale + ty;

    // Buildings as faint outlines (cluster polygons from network).
    ctx.strokeStyle = "rgba(148, 163, 184, 0.30)";
    ctx.fillStyle = "rgba(148, 163, 184, 0.10)";
    ctx.lineWidth = 0.5;
    for (const b of network.buildings) {
      const pts = b.points;
      if (pts.length < 6) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(px(pts[i]), py(pts[i + 1]));
        else ctx.lineTo(px(pts[i]), py(pts[i + 1]));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Roads behind vehicles.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const drawOrder: RoadCategory[] = [
      "shoulder",
      "edge",
      "curb",
      "lane",
      "centerline",
    ];
    for (const cat of drawOrder) {
      const segs = segmentsByCat.get(cat);
      const style = ROAD_BG_STYLE[cat];
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
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Vehicles.
    const sim = stateRef.current;
    if (sim) {
      const linksById = new Map(network.links.map((l) => [l.id, l]));
      for (const v of sim.vehicles) {
        const link = linksById.get(v.linkId);
        const arc = sim.linkArc.get(v.linkId);
        if (!link || !arc) continue;
        const pos = pointOnLink(link, arc, v.s);
        const tan = tangentOnLink(link, arc, v.s);
        // Flip tangent for backward-driving vehicles so their "front" matches
        // direction of travel.
        const fx = v.dir === 1 ? tan.dx : -tan.dx;
        const fy = v.dir === 1 ? tan.dy : -tan.dy;
        const screenX = px(pos.x);
        const screenY = py(pos.y);

        // Draw a small oriented rectangle. Width / length are in screen px,
        // not world units, so vehicles stay readable at any zoom.
        const lengthPx = 8;
        const widthPx = 4;
        ctx.save();
        ctx.translate(screenX, screenY);
        // Canvas y is downwards; world y is upwards. Flip dy when rotating.
        ctx.rotate(Math.atan2(-fy, fx));
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.rect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(lengthPx / 2 - 1.5, -widthPx / 2, 1.5, widthPx); // headlights tip
        ctx.restore();
      }
    }
  }

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
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          padding: "10px 12px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#e2e8f0",
          fontSize: 12,
          borderRadius: 8,
          border: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 220,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setRunning((r) => !r)}
            style={{
              background: running ? "#dc2626" : "#22c55e",
              color: "white",
              border: 0,
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              const s = stateRef.current;
              if (!s) return;
              const diag = Math.hypot(
                network.bounds.maxX - network.bounds.minX,
                network.bounds.maxY - network.bounds.minY
              ) || 1;
              stateRef.current = spawnVehicles(
                clearVehicles(s),
                vehicleCount,
                diag / 60
              );
              setTick((t) => t + 1);
            }}
            style={{
              background: "#334155",
              color: "white",
              border: 0,
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Respawn
          </button>
          <span
            style={{
              marginLeft: "auto",
              color: "#94a3b8",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {network.links.length} links · {network.junctions.length} junctions
          </span>
        </div>
        <Field label="Vehicles">
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={vehicleCount}
            onChange={(e) => setVehicleCount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {vehicleCount}
          </span>
        </Field>
        <Field label="Speed">
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={speedMul}
            onChange={(e) => setSpeedMul(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {speedMul.toFixed(2)}×
          </span>
        </Field>
        {network.links.length === 0 && (
          <div style={{ color: "#fda4af", fontSize: 11 }}>
            No road links to drive on. Switch to the Network tab and adjust
            categories so at least one cluster is tagged as centerline.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: "#94a3b8",
      }}
    >
      <span style={{ minWidth: 60 }}>{label}</span>
      {children}
    </label>
  );
}
