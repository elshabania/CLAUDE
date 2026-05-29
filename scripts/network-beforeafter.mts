// Zoomed BEFORE/AFTER of the road-network extraction, over the PDF.
// BEFORE = raw road polygons as links (deriveCenterlines:false) -> fragments.
// AFTER  = fill-mode skeleton (default) -> clean routable centerline graph.
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
const { detectFromPdf } = await import("@/lib/road-detect");
const { buildRoadNetwork } = await import("@/lib/road-network");

const pdfjs = await import(pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
const { getDocument, OPS } = pdfjs as any;
class NCF { create(w: number, h: number) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; } reset(cc: any, w: number, h: number) { cc.canvas.width = w; cc.canvas.height = h; } destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; } }

const data = new Uint8Array(readFileSync(resolve(ROOT, "public/ju_compressed_1.pdf")));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false, standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/", canvasFactory: new NCF() }).promise;
const paths = await walkPdfDocument(OPS as any, doc);
const drawing = detectFromPdf(paths as any, []);

const before = buildRoadNetwork(drawing, {}, { deriveCenterlines: false });
const after = buildRoadNetwork(drawing, {});
console.log(`BEFORE: ${before.links.length} links, ${before.nodes.length} nodes`);
console.log(`AFTER:  ${after.links.length} links, ${after.nodes.length} nodes, ${after.junctions.length} junctions`);

const SCALE = 3.0;
const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: SCALE });
const VW = Math.ceil(viewport.width), VH = Math.ceil(viewport.height);
const pdfCanvas = createCanvas(VW, VH);
await page.render({ canvasContext: pdfCanvas.getContext("2d") as any, viewport, canvasFactory: new NCF() }).promise;
const vp = (x: number, y: number) => viewport.convertToViewportPoint(x, y);

function renderNet(net: any) {
  const c = createCanvas(VW, VH);
  const ctx = c.getContext("2d");
  ctx.drawImage(pdfCanvas, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(0, 0, VW, VH);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#e11d48"; ctx.fillStyle = "#e11d48";
  for (const link of net.links) {
    const pts = link.points; if (!pts || pts.length < 4) continue;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { const p = vp(pts[i], pts[i + 1]); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
  }
  ctx.fillStyle = "#1d4ed8";
  for (const n of net.junctions ?? []) { const p = vp(n.x, n.y); ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill(); }
  return c;
}
const beforeC = renderNet(before);
const afterC = renderNet(after);

// Crop window (fractions): default a busy junction area.
const spec = (process.env.CROP || "0.60,0.55,0.22,0.22").split(",").map(Number);
const wx = Math.floor(VW * spec[0]), wy = Math.floor(VH * spec[1]);
const ww = Math.floor(VW * spec[2]), wh = Math.floor(VH * spec[3]);
const zoom = 3;
function crop(src: any, label: string) {
  const c = createCanvas(ww * zoom, wh * zoom);
  const cx = c.getContext("2d");
  cx.imageSmoothingEnabled = false;
  cx.drawImage(src, wx, wy, ww, wh, 0, 0, ww * zoom, wh * zoom);
  cx.fillStyle = "rgba(0,0,0,0.7)"; cx.fillRect(0, 0, 620, 60);
  cx.fillStyle = "#fff"; cx.font = "34px sans-serif"; cx.fillText(label, 16, 42);
  return c;
}
const bc = crop(beforeC, `BEFORE - ${before.links.length} fragments`);
const ac = crop(afterC, `AFTER - ${after.links.length} routable links`);
const pad = 16;
const combo = createCanvas(ww * zoom * 2 + pad, wh * zoom);
const cctx = combo.getContext("2d");
cctx.fillStyle = "#0b1120"; cctx.fillRect(0, 0, combo.width, combo.height);
cctx.drawImage(bc, 0, 0);
cctx.drawImage(ac, ww * zoom + pad, 0);
writeFileSync(resolve(OUT, "network-before-after.png"), combo.toBuffer("image/png"));
console.log(`Wrote network-before-after.png (crop ${spec.join(",")})`);
