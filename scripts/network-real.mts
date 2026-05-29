// Headless render of the REAL extracted road NETWORK over the PDF underlay.
//
// Runs the actual library pipeline: walkPdfDocument -> detectFromPdf ->
// buildRoadNetwork, shimming OffscreenCanvas with @napi-rs/canvas so the
// skeletonizer works in Node. Draws link centerlines (width by lanes) and
// junction nodes on top of the dimmed PDF page, so we can judge whether the
// network graph is faithful to the plan.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(__dirname, ".network-out");
mkdirSync(OUT, { recursive: true });

// --- shim OffscreenCanvas for the skeletonizer (checked at call time) -------
// @ts-expect-error - minimal shim
globalThis.OffscreenCanvas = class {
  constructor(w: number, h: number) {
    return createCanvas(w, h) as unknown as OffscreenCanvas;
  }
};
// @ts-expect-error - minimal document shim so the skeletonizer's document path runs
globalThis.document = { createElement: (t: string) => createCanvas(1, 1) };

const { walkPdfDocument } = await import("@/lib/pdf-extract");
const { detectFromPdf } = await import("@/lib/road-detect");
const { buildRoadNetwork } = await import("@/lib/road-network");

const pdfjs = await import(
  pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href
);
const { getDocument, OPS } = pdfjs as any;

class NodeCanvasFactory {
  create(w: number, h: number) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; }
  reset(cc: any, w: number, h: number) { cc.canvas.width = w; cc.canvas.height = h; }
  destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; }
}

const PDF_PATH = resolve(ROOT, "public/ju_compressed_1.pdf");
const data = new Uint8Array(readFileSync(PDF_PATH));
const doc = await getDocument({
  data,
  disableWorker: true,
  isEvalSupported: false,
  standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
  canvasFactory: new NodeCanvasFactory(),
}).promise;

const paths = await walkPdfDocument(OPS as any, doc);
const drawing = detectFromPdf(paths as any, []);
const network = buildRoadNetwork(drawing, {});
console.log(`Segments: ${drawing.segments.length}`);
console.log(`Network: ${network.links.length} links, ${network.nodes.length} nodes, ${network.junctions.length} junctions`);

// --- render PDF underlay + network overlay ----------------------------------
const SCALE = Number(process.env.SCALE || 2.0);
const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: SCALE });
const VW = Math.ceil(viewport.width), VH = Math.ceil(viewport.height);

const out = createCanvas(VW, VH);
const ctx = out.getContext("2d");
// PDF raster, then dim it so the network reads on top.
const pdfCanvas = createCanvas(VW, VH);
await page.render({ canvasContext: pdfCanvas.getContext("2d") as any, viewport, canvasFactory: new NodeCanvasFactory() }).promise;
ctx.drawImage(pdfCanvas, 0, 0);
ctx.fillStyle = "rgba(255,255,255,0.62)";
ctx.fillRect(0, 0, VW, VH);

const vp = (x: number, y: number) => viewport.convertToViewportPoint(x, y);

// Links: width by lanes, colour cyan->amber by lane count.
ctx.lineCap = "round";
ctx.lineJoin = "round";
for (const link of network.links) {
  const pts = link.points;
  if (!pts || pts.length < 4) continue;
  const lanes = (link as any).lanesPerDir ?? 1;
  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = Math.max(2.5, lanes * 2.2);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const p = vp(pts[i], pts[i + 1]);
    if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
}
// Junction nodes.
for (const n of network.junctions) {
  const p = vp((n as any).x, (n as any).y);
  ctx.beginPath();
  ctx.fillStyle = "#fbbf24";
  ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
  ctx.fill();
}

writeFileSync(resolve(OUT, "network-over-pdf.png"), out.toBuffer("image/png"));
console.log(`Wrote ${resolve(OUT, "network-over-pdf.png")}`);
