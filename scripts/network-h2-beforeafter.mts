// BEFORE (production) vs AFTER (H2 fix: open road polylines auto-closed
// and fed into curbSegs) — over the PDF. Probe only; no lib changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(__dirname, ".network-out");
mkdirSync(OUT, { recursive: true });

// @ts-expect-error shim
globalThis.OffscreenCanvas = class { constructor(w: number, h: number) { return createCanvas(w, h) as unknown as OffscreenCanvas; } };
// @ts-expect-error shim
globalThis.document = { createElement: () => createCanvas(1, 1) };

const { walkPdfDocument } = await import("@/lib/pdf-extract");
const { detectFromPdf, ROAD_CATEGORIES } = await import("@/lib/road-detect");
const { buildRoadNetwork } = await import("@/lib/road-network");

const pdfjs = await import(pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
const { getDocument, OPS } = pdfjs as any;
class NCF { create(w: number, h: number) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; } reset(cc: any, w: number, h: number) { cc.canvas.width = w; cc.canvas.height = h; } destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; } }

const data = new Uint8Array(readFileSync(resolve(ROOT, "public/ju_compressed_1.pdf")));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false, standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/", canvasFactory: new NCF() }).promise;
const paths = await walkPdfDocument(OPS as any, doc);
const drawing = detectFromPdf(paths as any, []);

// --- BEFORE: production pipeline, unchanged. ---
const before = buildRoadNetwork(drawing, {});

// --- AFTER: same pipeline but with open road polylines auto-closed first. ---
// The investigation's C3 hack: for every open road-category segment, append
// the first point so the canvas-fill in extractRoadSkeleton actually fills,
// and flip s.closed=true so the line-308 gate in road-network admits it.
let opened = 0;
const segsFixed = drawing.segments.map((s) => {
  if (!s.closed && ROAD_CATEGORIES.has(s.category) && s.points.length >= 4) {
    opened++;
    return {
      ...s,
      closed: true,
      points: [...s.points, s.points[0], s.points[1]],
    };
  }
  return s;
});
const drawingFixed = { ...drawing, segments: segsFixed };
const after = buildRoadNetwork(drawingFixed, {});

console.log(`auto-closed ${opened} open road polylines`);
console.log(`BEFORE (production):  ${before.links.length} links, ${before.nodes.length} nodes, ${before.junctions.length} junctions`);
console.log(`AFTER  (H2 fix):      ${after.links.length} links, ${after.nodes.length} nodes, ${after.junctions.length} junctions`);

// --- Render side by side over the PDF underlay. ---
const SCALE = 1.2;
const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: SCALE });
const VW = Math.ceil(viewport.width), VH = Math.ceil(viewport.height);

const pdfCanvas = createCanvas(VW, VH);
await page.render({ canvasContext: pdfCanvas.getContext("2d") as any, viewport, canvasFactory: new NCF() }).promise;
const vp = (x: number, y: number) => viewport.convertToViewportPoint(x, y);

function renderNet(net: any, label: string) {
  const c = createCanvas(VW, VH);
  const ctx = c.getContext("2d");
  ctx.drawImage(pdfCanvas, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(0, 0, VW, VH);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#e11d48"; ctx.fillStyle = "#e11d48";
  for (const link of net.links) {
    const pts = link.points; if (!pts || pts.length < 4) continue;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { const p = vp(pts[i], pts[i + 1]); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
  }
  ctx.fillStyle = "#1d4ed8";
  for (const n of net.junctions ?? []) { const p = vp(n.x, n.y); ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill(); }
  // Label.
  ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.fillRect(0, 0, 760, 56);
  ctx.fillStyle = "#fff"; ctx.font = "28px sans-serif"; ctx.fillText(label, 16, 38);
  return c;
}
const bCanvas = renderNet(before, `BEFORE — ${before.links.length} links, ${before.junctions.length} junctions`);
const aCanvas = renderNet(after, `AFTER — ${after.links.length} links, ${after.junctions.length} junctions (H2: opens admitted)`);

const pad = 14;
const combo = createCanvas(VW * 2 + pad, VH);
const cctx = combo.getContext("2d");
cctx.fillStyle = "#0b1120"; cctx.fillRect(0, 0, combo.width, combo.height);
cctx.drawImage(bCanvas, 0, 0);
cctx.drawImage(aCanvas, VW + pad, 0);
writeFileSync(resolve(OUT, "network-h2-beforeafter.png"), combo.toBuffer("image/png"));
writeFileSync(resolve(OUT, "network-h2-before.png"), bCanvas.toBuffer("image/png"));
writeFileSync(resolve(OUT, "network-h2-after.png"), aCanvas.toBuffer("image/png"));
console.log(`Wrote network-h2-beforeafter.png (${combo.width}x${combo.height}) + before/after panels`);
