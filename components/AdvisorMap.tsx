"use client";

// 2D plan map for the Mitigation Studio. Purpose-built for the TIS loop:
// draws the carriageway network coloured by the ACTIVE scenario's LOS, with
// junction-interior connectors, one-way arrowheads, mitigation highlights
// (widened links get a dashed white halo), and click-to-inspect. Pan with
// drag, zoom with wheel (about the cursor), programmatic zoom-to-focus for
// "click a measure -> fly to it".
//
// Deliberately independent of CadViewer: that component is entangled with the
// PDF/drawing layer stack; this one needs only a LaneNetwork and per-link
// colours, which keeps the studio page simple and the redraw cheap (one pass
// over ~1.2k polylines).

import { useCallback, useEffect, useRef } from "react";
import type { LaneNetwork } from "@/lib/lane-network";

export interface MapFocus {
  x: number;
  y: number;
  /** Target zoom in px per metre. */
  scale: number;
  /** Change this value to re-trigger the same focus target. */
  token: number;
}

interface AdvisorMapProps {
  net: LaneNetwork;
  /** Per-link stroke colours (LOS). Null = neutral grey (no assignment yet). */
  linkColors: string[] | null;
  /** Effective lanes per link (after overrides) for stroke width; null = as drawn. */
  laneCounts: number[] | null;
  /** Link indices carrying a mitigation (lane override) — drawn with a halo. */
  widened: ReadonlySet<number>;
  selected: number | null;
  onSelect: (li: number | null) => void;
  focus: MapFocus | null;
}

interface View {
  scale: number; // px per metre
  tx: number;
  ty: number;
}

const PICK_TOL_PX = 9;

export function AdvisorMap({
  net,
  linkColors,
  laneCounts,
  widened,
  selected,
  onSelect,
  focus,
}: AdvisorMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ sx: number; sy: number; tx: number; ty: number; moved: boolean } | null>(null);
  // Latest props for the draw closure (draw() is also called from event
  // handlers that shouldn't be re-bound every render).
  const propsRef = useRef({ net, linkColors, laneCounts, widened, selected });
  propsRef.current = { net, linkColors, laneCounts, widened, selected };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { net, linkColors, laneCounts, widened, selected } = propsRef.current;
    const { scale, tx, ty } = viewRef.current;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050810";
    ctx.fillRect(0, 0, W, H);

    const sx = (wx: number) => wx * scale + tx;
    const sy = (wy: number) => -wy * scale + ty;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Junction-interior connectors underneath everything.
    if (net.connectors.length > 0) {
      ctx.strokeStyle = "rgba(160, 180, 210, 0.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const c of net.connectors) {
        const a = net.nodes[c.from];
        const b = net.nodes[c.to];
        ctx.moveTo(sx(a.x), sy(a.y));
        ctx.lineTo(sx(b.x), sy(b.y));
      }
      ctx.stroke();
    }

    // Links.
    for (let li = 0; li < net.links.length; li++) {
      const link = net.links[li];
      const pts = link.points;
      if (pts.length < 4) continue;
      const lanes = laneCounts?.[li] ?? link.numLanes;
      const color = linkColors?.[li] ?? "#5b6678";

      // Mitigation halo first so the coloured stroke sits on top of it.
      if (widened.has(li)) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(2, 1 + lanes * 1.3) + 5;
        ctx.setLineDash([7, 5]);
        strokePolyline(ctx, pts, sx, sy);
        ctx.setLineDash([]);
      }
      if (selected === li) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(2, 1 + lanes * 1.3) + 5;
        strokePolyline(ctx, pts, sx, sy);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.6, 1 + lanes * 1.3);
      strokePolyline(ctx, pts, sx, sy);

      // One-way arrowhead at mid-polyline when zoomed in enough to read it.
      if (scale > 0.45 && link.oneWay && pts.length >= 6) {
        const mi = (pts.length >> 2) * 2;
        const nIdx = Math.min(pts.length - 2, mi + 2);
        const ax = sx(pts[mi]);
        const ay = sy(pts[mi + 1]);
        const ang = Math.atan2(sy(pts[nIdx + 1]) - ay, sx(pts[nIdx]) - ax);
        ctx.fillStyle = color;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-5, 5);
        ctx.lineTo(-5, -5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // Lane-count label close in.
      if (scale > 1.1) {
        const mi = (pts.length >> 2) * 2;
        const ax = sx(pts[mi]);
        const ay = sy(pts[mi + 1]);
        ctx.font = "bold 11px sans-serif";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 3;
        ctx.strokeText(String(lanes), ax + 6, ay - 6);
        ctx.fillStyle = "#fff";
        ctx.fillText(String(lanes), ax + 6, ay - 6);
      }
    }

    // Junction dots.
    if (scale > 0.4) {
      ctx.fillStyle = "#fbbf24";
      for (const n of net.nodes) {
        if (n.links.length < 3) continue;
        ctx.beginPath();
        ctx.arc(sx(n.x), sy(n.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, []);

  // Fit to bounds when the network changes (and on first mount).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { minX, minY, maxX, maxY } = net.bounds;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const pad = 30;
    const W = wrap.clientWidth || 800;
    const H = wrap.clientHeight || 600;
    const scale = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
    viewRef.current = {
      scale,
      tx: (W - bw * scale) / 2 - minX * scale,
      ty: (H - bh * scale) / 2 + maxY * scale,
    };
    draw();
  }, [net, draw]);

  // Redraw on any visual prop change.
  useEffect(() => {
    draw();
  }, [linkColors, laneCounts, widened, selected, draw]);

  // Programmatic focus (fly to a measure).
  useEffect(() => {
    if (!focus) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    viewRef.current = {
      scale: focus.scale,
      tx: W / 2 - focus.x * focus.scale,
      ty: H / 2 + focus.y * focus.scale,
    };
    draw();
  }, [focus, draw]);

  // Canvas sizing (dpr-aware) + redraw on resize.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, wrap.clientWidth * dpr);
      canvas.height = Math.max(1, wrap.clientHeight * dpr);
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // ---- interaction ----
  const pick = useCallback((px: number, py: number): number | null => {
    const { net } = propsRef.current;
    const { scale, tx, ty } = viewRef.current;
    const sx = (wx: number) => wx * scale + tx;
    const sy = (wy: number) => -wy * scale + ty;
    let best: number | null = null;
    let bestD = PICK_TOL_PX;
    for (let li = 0; li < net.links.length; li++) {
      const pts = net.links[li].points;
      for (let i = 2; i < pts.length; i += 2) {
        const ax = sx(pts[i - 2]);
        const ay = sy(pts[i - 1]);
        const bx = sx(pts[i]);
        const by = sy(pts[i + 1]);
        const dx = bx - ax;
        const dy = by - ay;
        const L2 = dx * dx + dy * dy;
        if (L2 < 1e-3) continue;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < bestD) {
          bestD = d;
          best = li;
        }
      }
    }
    return best;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const v = viewRef.current;
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      viewRef.current.tx = d.tx + dx;
      viewRef.current.ty = d.ty + dy;
      draw();
    },
    [draw]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.moved) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      onSelect(pick(e.clientX - rect.left, e.clientY - rect.top));
    },
    [onSelect, pick]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const v = viewRef.current;
      v.tx = px - (px - v.tx) * f;
      v.ty = py - (py - v.ty) * f;
      v.scale *= f;
      draw();
    },
    [draw]
  );

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  );
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  sx: (x: number) => number,
  sy: (y: number) => number
) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = sx(pts[i]);
    const y = sy(pts[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
