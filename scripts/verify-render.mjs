#!/usr/bin/env node
/**
 * Pixel-faithfulness check for the new pdfjs-dist + raster background pipeline
 * used by components/CadViewer.tsx.
 *
 * What it does:
 *  1. Renders public/ju_compressed_1.pdf page 1 using the SAME pdfjs-dist API
 *     that lib/pdf-extract-client.ts::renderPdfPageToCanvas uses (page.render()
 *     into a canvas), but wired to @napi-rs/canvas so it works in Node.
 *  2. Renders the same page with `pdftoppm -r N -png` (Poppler) at a matching
 *     pixel width.  Treated as the ground truth.
 *  3. Decodes both PNGs to raw RGBA using a Node canvas and computes:
 *       - per-pixel L1 mean colour diff
 *       - % of pixels where any channel differs by > 10
 *       - perceptual coverage (% of "non-background" pixels that match)
 *  4. Crops three regions of interest (legend, road centre, building cluster)
 *     from each render and saves side-by-side previews.
 *  5. Generates a fit-to-view (1200px wide) preview crop of the legend block
 *     so we can eyeball legibility.
 *
 * Run:  node scripts/verify-render.mjs
 *
 * No browser, playwright, or puppeteer required.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PDF_PATH = resolve(ROOT, "public/ju_compressed_1.pdf");
const OUT_DIR = resolve(ROOT, "scripts/.verify-out");

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const napiCanvas = await import("@napi-rs/canvas");
const { createCanvas, loadImage, Image } = napiCanvas;

// pdfjs-dist legacy build (ESM, Node-friendly).
const pdfjsModUrl = pathToFileURL(
  resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
).href;
const pdfjs = await import(pdfjsModUrl);
const { getDocument } = pdfjs;

// Disable worker for Node.
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
}

// ---------------------------------------------------------------------------
// 1. Render with pdfjs-dist + @napi-rs/canvas (mirrors renderPdfPageToCanvas)
// ---------------------------------------------------------------------------
const TARGET_WIDTH_PX = 4096;

const data = new Uint8Array(readFileSync(PDF_PATH));
console.log(`Loading PDF (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)...`);
const doc = await getDocument({
  data,
  isEvalSupported: false,
  disableFontFace: true,
  standardFontDataUrl:
    resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
}).promise;

const page = await doc.getPage(1);
const v0 = page.getViewport({ scale: 1 });
const pdfScale = Math.min(TARGET_WIDTH_PX / v0.width, 6);
const viewport = page.getViewport({ scale: pdfScale });
const canvasW = Math.ceil(viewport.width);
const canvasH = Math.ceil(viewport.height);
console.log(
  `pdfjs render: pdf ${v0.width.toFixed(1)}x${v0.height.toFixed(1)} -> ` +
    `${canvasW}x${canvasH} px @ scale ${pdfScale.toFixed(3)}`
);

const pdfjsCanvas = createCanvas(canvasW, canvasH);
const pdfjsCtx = pdfjsCanvas.getContext("2d");
// Paint white, since some renderers leave bg transparent.
pdfjsCtx.fillStyle = "#ffffff";
pdfjsCtx.fillRect(0, 0, canvasW, canvasH);

// pdfjs's render() needs a `canvas` arg in v4+; pass both `canvasContext` and
// `canvas` to be safe across minor versions.
await page.render({
  canvasContext: pdfjsCtx,
  viewport,
  canvas: pdfjsCanvas,
}).promise;

const pdfjsPngPath = resolve(OUT_DIR, "pdfjs.png");
writeFileSync(pdfjsPngPath, pdfjsCanvas.encodeSync("png"));
console.log(`  wrote ${pdfjsPngPath}`);

// ---------------------------------------------------------------------------
// 2. Render with pdftoppm at matching DPI.
// ---------------------------------------------------------------------------
// pdfjs scale 1 == 72 dpi. To get same pixel width we need DPI = pdfScale*72.
const popplerDpi = Math.round(pdfScale * 72);
console.log(`pdftoppm render at ${popplerDpi} dpi (target match for pdfjs)...`);
const popplerOutBase = resolve(OUT_DIR, "poppler");
const popplerProc = spawnSync(
  "pdftoppm",
  ["-r", String(popplerDpi), "-png", "-f", "1", "-l", "1", PDF_PATH, popplerOutBase],
  { encoding: "utf8" }
);
if (popplerProc.status !== 0) {
  console.error("pdftoppm failed:", popplerProc.stderr);
  process.exit(1);
}
// pdftoppm names file "<base>-<page>.png" but page number padding varies
// based on total pages. For a single-page doc it'll be "poppler-1.png".
const popplerPngCandidates = [
  `${popplerOutBase}-1.png`,
  `${popplerOutBase}-01.png`,
  `${popplerOutBase}-001.png`,
];
const popplerPngPath = popplerPngCandidates.find(existsSync);
if (!popplerPngPath) {
  console.error("Could not find pdftoppm output, tried:", popplerPngCandidates);
  process.exit(1);
}
console.log(`  wrote ${popplerPngPath}`);

// ---------------------------------------------------------------------------
// 3. Decode both PNGs and compare.
// ---------------------------------------------------------------------------
async function decodePng(path) {
  const img = await loadImage(path);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, img.width, img.height);
  return { canvas: c, ctx, width: img.width, height: img.height, data: id.data };
}

const a = await decodePng(pdfjsPngPath);
const b = await decodePng(popplerPngPath);
console.log(`pdfjs png:    ${a.width}x${a.height}`);
console.log(`poppler png:  ${b.width}x${b.height}`);

// If sizes differ, scale poppler to match pdfjs (drawImage with scaling).
let bMatched = b;
if (b.width !== a.width || b.height !== a.height) {
  console.log(`  resizing poppler -> ${a.width}x${a.height} for diff`);
  const c = createCanvas(a.width, a.height);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(b.canvas, 0, 0, a.width, a.height);
  const id = ctx.getImageData(0, 0, a.width, a.height);
  bMatched = { canvas: c, ctx, width: a.width, height: a.height, data: id.data };
}

let sumL1 = 0;
let bigDiff = 0;
let nonWhiteCount = 0;
let nonWhiteMatch = 0;
const W = a.width;
const H = a.height;
const N = W * H;
const da = a.data;
const db = bMatched.data;

// also build a heat-map (16-bit downsampled) for visual inspection
const heatScale = 8;
const heatW = Math.ceil(W / heatScale);
const heatH = Math.ceil(H / heatScale);
const heatCanvas = createCanvas(heatW, heatH);
const heatCtx = heatCanvas.getContext("2d");
const heatImg = heatCtx.createImageData(heatW, heatH);
const heatBuf = new Float64Array(heatW * heatH);
const heatCnt = new Uint32Array(heatW * heatH);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const dr = Math.abs(da[i] - db[i]);
    const dg = Math.abs(da[i + 1] - db[i + 1]);
    const dbl = Math.abs(da[i + 2] - db[i + 2]);
    const l1 = (dr + dg + dbl) / 3;
    sumL1 += l1;
    if (dr > 10 || dg > 10 || dbl > 10) bigDiff++;

    // poppler is the reference; "non-white" = something is drawn.
    const pr = db[i],
      pg = db[i + 1],
      pb = db[i + 2];
    const isNonWhite = pr < 245 || pg < 245 || pb < 245;
    if (isNonWhite) {
      nonWhiteCount++;
      if (dr <= 20 && dg <= 20 && dbl <= 20) nonWhiteMatch++;
    }

    const hi = Math.floor(y / heatScale) * heatW + Math.floor(x / heatScale);
    heatBuf[hi] += l1;
    heatCnt[hi] += 1;
  }
}

for (let i = 0; i < heatBuf.length; i++) {
  const v = Math.min(255, Math.round((heatBuf[i] / Math.max(1, heatCnt[i])) * 4));
  heatImg.data[i * 4] = v; // red where diff is high
  heatImg.data[i * 4 + 1] = 0;
  heatImg.data[i * 4 + 2] = 0;
  heatImg.data[i * 4 + 3] = 255;
}
heatCtx.putImageData(heatImg, 0, 0);
const heatPath = resolve(OUT_DIR, "diff-heat.png");
writeFileSync(heatPath, heatCanvas.encodeSync("png"));

console.log(`\n========== PIXEL DIFF (pdfjs vs poppler) ==========`);
console.log(`pixels:                   ${N}`);
console.log(`mean L1 diff (RGB avg):   ${(sumL1 / N).toFixed(3)} / 255`);
console.log(`% pixels with any-channel diff > 10:   ${((100 * bigDiff) / N).toFixed(2)}%`);
console.log(`non-white pixels (poppler ref):        ${nonWhiteCount} (${((100 * nonWhiteCount) / N).toFixed(1)}%)`);
console.log(`  of which match within 20/channel:    ${nonWhiteMatch} (${((100 * nonWhiteMatch) / Math.max(1, nonWhiteCount)).toFixed(1)}%)`);
console.log(`heat map:                              ${heatPath}`);

// ---------------------------------------------------------------------------
// 4. Side-by-side region crops.
// ---------------------------------------------------------------------------
function sideBySideCrop(label, x, y, w, h) {
  // Clamp.
  x = Math.max(0, Math.min(W - 1, x));
  y = Math.max(0, Math.min(H - 1, y));
  w = Math.max(1, Math.min(W - x, w));
  h = Math.max(1, Math.min(H - y, h));

  const out = createCanvas(w * 2 + 16, h + 28);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "14px sans-serif";
  ctx.fillText(`pdfjs (${label})`, 4, 18);
  ctx.fillText(`poppler (${label})`, w + 16 + 4, 18);
  ctx.drawImage(a.canvas, x, y, w, h, 0, 24, w, h);
  ctx.drawImage(bMatched.canvas, x, y, w, h, w + 16, 24, w, h);
  const path = resolve(OUT_DIR, `crop-${label}.png`);
  writeFileSync(path, out.encodeSync("png"));
  console.log(`  ${label} -> ${path}`);
  return path;
}

console.log(`\n========== SIDE-BY-SIDE CROPS ==========`);
// A1 portrait -> wider than tall; legend is bottom-left, ~12% wide x ~22% tall.
const legendCrop = sideBySideCrop(
  "legend",
  Math.round(W * 0.02),
  Math.round(H * 0.78),
  Math.round(W * 0.20),
  Math.round(H * 0.20)
);
const centreCrop = sideBySideCrop(
  "centre-roads",
  Math.round(W * 0.40),
  Math.round(H * 0.40),
  Math.round(W * 0.20),
  Math.round(H * 0.20)
);
const buildingsCrop = sideBySideCrop(
  "buildings-right",
  Math.round(W * 0.65),
  Math.round(H * 0.30),
  Math.round(W * 0.20),
  Math.round(H * 0.25)
);

// ---------------------------------------------------------------------------
// 5. Fit-to-view legibility check.
//    Resize pdfjs render to ~1200px wide; show legend block at that scale.
// ---------------------------------------------------------------------------
const fitWidth = 1200;
const fitScale = fitWidth / W;
const fitH = Math.round(H * fitScale);
const fitCanvas = createCanvas(fitWidth, fitH);
const fitCtx = fitCanvas.getContext("2d");
fitCtx.imageSmoothingEnabled = true;
fitCtx.imageSmoothingQuality = "high";
fitCtx.drawImage(a.canvas, 0, 0, fitWidth, fitH);
const fitPath = resolve(OUT_DIR, "fit-1200.png");
writeFileSync(fitPath, fitCanvas.encodeSync("png"));
console.log(`  fit-to-view (1200px wide) -> ${fitPath}`);

// Legend crop FROM the downscaled fit render (so we see what the user sees).
const fitLegendX = Math.round(fitWidth * 0.02);
const fitLegendY = Math.round(fitH * 0.78);
const fitLegendW = Math.round(fitWidth * 0.20);
const fitLegendH = Math.round(fitH * 0.20);
const fitLegendCanvas = createCanvas(fitLegendW, fitLegendH);
fitLegendCanvas
  .getContext("2d")
  .drawImage(
    fitCanvas,
    fitLegendX,
    fitLegendY,
    fitLegendW,
    fitLegendH,
    0,
    0,
    fitLegendW,
    fitLegendH
  );
const fitLegendPath = resolve(OUT_DIR, "fit-legend.png");
writeFileSync(fitLegendPath, fitLegendCanvas.encodeSync("png"));
console.log(`  fit-view legend crop      -> ${fitLegendPath}`);

// ---------------------------------------------------------------------------
// 6. Colour-cluster cross-check (pdfjs vs poppler).
//    For every non-white pixel in poppler, bin its colour into 16-step bins.
//    Compare top bins between the two images; flag any bin that's >0.1% in
//    poppler but absent from pdfjs.
// ---------------------------------------------------------------------------
function histogram(buf, width, height) {
  const m = new Map();
  for (let i = 0; i < width * height * 4; i += 4) {
    const r = buf[i],
      g = buf[i + 1],
      bl = buf[i + 2];
    if (r > 245 && g > 245 && bl > 245) continue;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const histA = histogram(a.data, W, H);
const histB = histogram(bMatched.data, W, H);

const totalA = [...histA.values()].reduce((s, n) => s + n, 0) || 1;
const totalB = [...histB.values()].reduce((s, n) => s + n, 0) || 1;
const sortedB = [...histB.entries()].sort((p, q) => q[1] - p[1]);

console.log(`\n========== COLOUR CLUSTERS (poppler ref) ==========`);
console.log(`total non-white px - pdfjs: ${totalA}, poppler: ${totalB}`);
console.log(`top-30 poppler bins, with pdfjs match:`);
console.log(`rgb(bin)         | poppler %  | pdfjs %    | ratio`);
let missingClusters = 0;
for (let i = 0; i < Math.min(30, sortedB.length); i++) {
  const [k, vB] = sortedB[i];
  const r = ((k >> 8) & 0xf) << 4;
  const g = ((k >> 4) & 0xf) << 4;
  const bl = (k & 0xf) << 4;
  const vA = histA.get(k) ?? 0;
  const pctA = (100 * vA) / totalA;
  const pctB = (100 * vB) / totalB;
  const ratio = vA === 0 ? "0" : (pctA / pctB).toFixed(2);
  const flag = vA === 0 && pctB > 0.1 ? "  <-- MISSING from pdfjs" : "";
  if (vA === 0 && pctB > 0.1) missingClusters++;
  console.log(
    `  ${[r, g, bl].join(",").padEnd(13)}  | ${pctB.toFixed(3).padStart(7)}%  | ${pctA.toFixed(3).padStart(7)}%  | ${String(ratio).padStart(5)}${flag}`
  );
}

console.log(`\n========== SUMMARY ==========`);
console.log(`Mean L1 / channel:        ${(sumL1 / N).toFixed(3)}`);
console.log(`% pixels diff > 10:       ${((100 * bigDiff) / N).toFixed(2)}%`);
console.log(`Coverage match (non-bg):  ${((100 * nonWhiteMatch) / Math.max(1, nonWhiteCount)).toFixed(1)}%`);
console.log(`Missing colour clusters (>0.1%): ${missingClusters}`);
console.log(`\nDone. Outputs in: ${OUT_DIR}`);
