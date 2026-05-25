import type { DrawingSegment, RoadCategory } from "@/lib/road-detect";

/** Minimal 2D-context surface we need - satisfied by both the browser
 *  CanvasRenderingContext2D and @napi-rs/canvas, so the same drawing code
 *  runs in the app and in headless verification. */
export interface Ctx2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

/** Categories drawn from bottom (background) to top (foreground). */
export const DRAW_ORDER: RoadCategory[] = [
  "context",
  "greenery",
  "water",
  "plot_fill",
  "building",
  "road_row",
  "road_plot",
  "emergency_access",
  "apartment_access",
  "plot_access",
  "taxi_layby",
  "shuttle_layby",
  "bridge",
  "bridge_ramp",
  "tunnel",
  "tunnel_ramp",
  "raised_crossing",
  "other",
];

/** Categories drawn as line strokes (pedestrian crossings) rather than fills. */
export const STROKE_CATEGORIES: ReadonlySet<RoadCategory> = new Set([
  "raised_crossing",
]);

export interface RenderDrawingOptions {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Pixels per drawing unit on the offscreen canvas. */
  renderScale: number;
  /** Whether each category is visible. */
  visibleCategories: Record<RoadCategory, boolean>;
  /** Hex colour per category. */
  categoryColors: Record<RoadCategory, string>;
  /** Background fill (default deep navy). */
  background?: string;
  /** Per-group category override resolver. */
  effCat?: (seg: DrawingSegment) => RoadCategory;
  /** When true, stroke each polygon's outline (and open hatch lines) on top of
   *  the solid fill so the line / hatch structure is visible. */
  showOutlines?: boolean;
  /** Categories to NOT draw here (e.g. roads, which the caller renders as a
   *  separate morphologically-closed solid layer). */
  skip?: ReadonlySet<RoadCategory>;
}

/** Darken a #rrggbb hex toward black by factor f (0..1). Used for outlines so
 *  they read as crisp edges against the same-colour fill. */
function darken(hex: string, f: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * f);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * f);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draw a parsed drawing's category fills onto a 2D context sized
 * width x height = (maxX-minX)*renderScale x (maxY-minY)*renderScale.
 *
 * This is the SINGLE source of truth for the Drawing-tab visuals: the
 * CadViewer renders its offscreen layer with it, and the headless
 * verification harness renders with the exact same code so what I inspect
 * is what the app paints.
 */
export function renderDrawingFills(
  ctx: Ctx2D,
  segments: DrawingSegment[],
  opts: RenderDrawingOptions
): void {
  const { minX, maxX, minY, maxY } = opts.bounds;
  const W = Math.ceil((maxX - minX) * opts.renderScale);
  const H = Math.ceil((maxY - minY) * opts.renderScale);
  const effCat = opts.effCat ?? ((s: DrawingSegment) => s.category);

  // A polygon whose bounding box spans most of BOTH page dimensions is a
  // sheet-covering background (e.g. a site/landscape base or a page rectangle)
  // - filling it opaque blankets everything beneath, which is the "one solid
  // layer" symptom. We skip the FILL for such polygons (their outline still
  // draws in outline mode) so the real detail underneath shows through.
  const boundsW = Math.max(maxX - minX, 1);
  const boundsH = Math.max(maxY - minY, 1);
  const BG_SPAN = 0.7;
  const isBackgroundSpan = (pts: number[]): boolean => {
    let xmn = pts[0], ymn = pts[1], xmx = pts[0], ymx = pts[1];
    for (let i = 2; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      if (x < xmn) xmn = x; else if (x > xmx) xmx = x;
      if (y < ymn) ymn = y; else if (y > ymx) ymx = y;
    }
    return (xmx - xmn) > boundsW * BG_SPAN && (ymx - ymn) > boundsH * BG_SPAN;
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = opts.background ?? "#0f172a";
  ctx.fillRect(0, 0, W, H);

  // Bin segments by effective category once.
  const byCat = new Map<RoadCategory, DrawingSegment[]>();
  for (const seg of segments) {
    const c = effCat(seg);
    const arr = byCat.get(c) ?? [];
    arr.push(seg);
    byCat.set(c, arr);
  }

  const ox = (x: number) => (x - minX) * opts.renderScale;
  const oy = (y: number) => (maxY - y) * opts.renderScale;

  for (const cat of DRAW_ORDER) {
    if (opts.visibleCategories[cat] === false) continue;
    if (opts.skip?.has(cat)) continue;
    const segs = byCat.get(cat);
    if (!segs || segs.length === 0) continue;
    const colour = opts.categoryColors[cat];
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (STROKE_CATEGORIES.has(cat)) {
      ctx.lineWidth = Math.max(1.4, opts.renderScale * 0.6);
      for (const seg of segs) {
        const pts = seg.points;
        if (pts.length < 4) continue;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const px = ox(pts[i]);
          const py = oy(pts[i + 1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        if (seg.closed) ctx.closePath();
        ctx.stroke();
      }
      continue;
    }

    const outline = opts.showOutlines === true;
    // Seam-closing: a thin SAME-colour stroke around each filled polygon fuses
    // adjacent hatch tiles into one clean corridor, removing the hairline
    // anti-alias gaps that make the fills look fragmented/ragged.
    const seamW = Math.max(0.6, opts.renderScale * 0.08);
    const outlineColour = darken(colour, 0.5);
    const outlineW = Math.max(1, opts.renderScale * 0.25);
    for (const seg of segs) {
      const pts = seg.points;
      if (pts.length < 4) continue;
      if (!seg.closed) {
        // Open polylines (hatch lines, kerb ticks) are skipped in solid mode;
        // in outline mode they're drawn so the line/hatch detail shows.
        if (!outline) continue;
        ctx.strokeStyle = outlineColour;
        ctx.lineWidth = outlineW;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) ctx.moveTo(ox(pts[i]), oy(pts[i + 1]));
          else ctx.lineTo(ox(pts[i]), oy(pts[i + 1]));
        }
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const px = ox(pts[i]);
        const py = oy(pts[i + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Skip the opaque fill for sheet-spanning backgrounds; keep the outline.
      if (!isBackgroundSpan(pts)) {
        ctx.fill();
        ctx.strokeStyle = colour;
        ctx.lineWidth = seamW;
        ctx.stroke();
      }
      if (outline) {
        ctx.strokeStyle = outlineColour;
        ctx.lineWidth = outlineW;
        ctx.stroke();
      }
    }
  }
}
