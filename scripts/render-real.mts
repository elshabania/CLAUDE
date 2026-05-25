// Headless render of the REAL Drawing-tab pipeline.
//
// Bundled by esbuild (resolves @/ aliases) and run in Node with
// @napi-rs/canvas as the 2D surface. Uses the actual library code:
//   walkPdfDocument (lib/pdf-extract) -> detectFromPdf (lib/road-detect)
//   -> renderDrawingFills (lib/render-drawing)
// so the PNG it writes is what the app's CadViewer offscreen paints.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { walkPdfDocument, type PdfjsLikeOps } from "@/lib/pdf-extract";
import { detectFromPdf } from "@/lib/road-detect";
import { renderDrawingFills, type Ctx2D } from "@/lib/render-drawing";
import { LEGEND_SWATCHES } from "@/lib/legend-swatches";
import type { RoadCategory } from "@/lib/road-detect";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(__dirname, ".preview-out");
mkdirSync(OUT, { recursive: true });

const pdfjs = await import(
  pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href
);

function swatchHex(cat: RoadCategory, fallback = "#475569"): string {
  const sw = LEGEND_SWATCHES.find((s) => s.category === cat);
  if (!sw) return fallback;
  const [r, g, b] = sw.rgb;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const CATEGORY_COLORS: Record<RoadCategory, string> = {
  road_row: swatchHex("road_row"),
  road_plot: swatchHex("road_plot"),
  taxi_layby: swatchHex("taxi_layby"),
  shuttle_layby: swatchHex("shuttle_layby"),
  emergency_access: swatchHex("emergency_access"),
  apartment_access: swatchHex("apartment_access"),
  plot_access: swatchHex("plot_access"),
  bridge: swatchHex("bridge"),
  bridge_ramp: swatchHex("bridge_ramp"),
  tunnel: swatchHex("tunnel"),
  tunnel_ramp: swatchHex("tunnel_ramp"),
  raised_crossing: swatchHex("raised_crossing"),
  building: swatchHex("building"),
  context: swatchHex("context"),
  greenery: swatchHex("greenery", "#86efac"),
  water: swatchHex("water", "#7dd3fc"),
  plot_fill: swatchHex("plot_fill", "#fde68a"),
  other: "#475569",
};

const data = new Uint8Array(readFileSync(resolve(ROOT, "public/ju_compressed_1.pdf")));
const doc = await pdfjs.getDocument({
  data,
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: false,
  standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
}).promise;

const page = await doc.getPage(1);
const rotation = (page.rotate ?? 0) % 360;

const paths = await walkPdfDocument(pdfjs.OPS as PdfjsLikeOps, doc as never);
console.log(`Extracted ${paths.length} paths`);

const drawing = detectFromPdf(paths, []);
console.log(`Segments: ${drawing.segments.length}, groups: ${drawing.groups.length}`);
console.log(
  `Bounds: x=[${drawing.bounds.minX.toFixed(0)}, ${drawing.bounds.maxX.toFixed(0)}] ` +
    `y=[${drawing.bounds.minY.toFixed(0)}, ${drawing.bounds.maxY.toFixed(0)}]`
);

// Segment count by category (what the user sees in the legend).
const byCat: Record<string, number> = {};
for (const s of drawing.segments) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
console.log("Segments by category:");
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}

// Group -> category -> representative colour, to spot misclassifications.
console.log("\nGroups (category <- rgb, count):");
for (const g of [...drawing.groups].sort((a, b) => b.count - a.count)) {
  const c = g.color
    ? `rgb(${Math.round(g.color[0] * 255)},${Math.round(g.color[1] * 255)},${Math.round(g.color[2] * 255)})`
    : "n/a";
  console.log(`  ${g.category.padEnd(18)} <- ${c.padEnd(18)} x${g.count}  [${g.id}]`);
}

const { minX, minY, maxX, maxY } = drawing.bounds;
const drawW = Math.max(maxX - minX, 1);
const drawH = Math.max(maxY - minY, 1);
const renderScale = Math.min(3500 / Math.max(drawW, drawH), 4096 / Math.max(drawW, drawH));
const W = Math.ceil(drawW * renderScale);
const H = Math.ceil(drawH * renderScale);

const off = createCanvas(W, H);
const octx = off.getContext("2d");
const visibleCategories = Object.fromEntries(
  (Object.keys(CATEGORY_COLORS) as RoadCategory[]).map((c) => [c, c !== "context" && c !== "other"])
) as Record<RoadCategory, boolean>;

renderDrawingFills(octx as unknown as Ctx2D, drawing.segments, {
  bounds: drawing.bounds,
  renderScale,
  visibleCategories,
  categoryColors: CATEGORY_COLORS,
});

// Apply page rotation for final orientation.
const swap = rotation === 90 || rotation === 270;
const fin = createCanvas(swap ? H : W, swap ? W : H);
const fctx = fin.getContext("2d");
fctx.fillStyle = "#0f172a";
fctx.fillRect(0, 0, fin.width, fin.height);
fctx.translate(fin.width / 2, fin.height / 2);
fctx.rotate((rotation * Math.PI) / 180);
fctx.drawImage(off, -W / 2, -H / 2);

writeFileSync(resolve(OUT, "real-drawing.png"), fin.toBuffer("image/png"));
console.log(`\nWrote real-drawing.png (rotation ${rotation})`);
