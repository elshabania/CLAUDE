#!/usr/bin/env node
/**
 * Server-side preview of what CadViewer will paint.
 *
 * Walks the same PDF the browser will, classifies every path against the
 * legend swatches, then renders each category's closed polygons as
 * filled regions (NO strokes) onto a per-category-coloured canvas at
 * the same target resolution CadViewer uses.
 *
 * The point: confirm visually that "fill all hatch tiles" produces
 * clean coloured corridors before showing the user.
 *
 * Run: node scripts/preview-render.mjs
 * Output: scripts/.preview-out/preview.png plus per-category masks.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PDF_PATH = resolve(ROOT, "public/ju_compressed_1.pdf");
const OUT_DIR = resolve(__dirname, ".preview-out");
mkdirSync(OUT_DIR, { recursive: true });

const pdfjsModUrl = pathToFileURL(
  resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
).href;
const pdfjs = await import(pdfjsModUrl);
const { getDocument, OPS } = pdfjs;

if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
}

// Load swatches by parsing the .ts file as text.
const swatchesSrc = readFileSync(resolve(ROOT, "lib/legend-swatches.ts"), "utf8");
const arrMatch = swatchesSrc.match(/LEGEND_SWATCHES[^=]*=\s*(\[[\s\S]*?\]);/);
if (!arrMatch) throw new Error("Could not locate LEGEND_SWATCHES array");
const LEGEND_SWATCHES = JSON.parse(arrMatch[1]);

// CIE-Lab classifier.
function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function rgbToLab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
const swatchLabIndex = [];
for (const sw of LEGEND_SWATCHES) {
  swatchLabIndex.push({ cat: sw.category, lab: rgbToLab(sw.rgb), tol: sw.tolerance, rgb: sw.rgb });
  for (const alias of sw.aliases ?? []) {
    swatchLabIndex.push({ cat: sw.category, lab: rgbToLab(alias), tol: sw.tolerance, rgb: alias });
  }
}
function classify(rgb255) {
  const lab = rgbToLab(rgb255);
  let best = null;
  for (const s of swatchLabIndex) {
    const d = deltaE(lab, s.lab);
    if (d > s.tol) continue;
    if (!best || d < best.d) best = { cat: s.cat, d, rgb: s.rgb };
  }
  return best?.cat ?? "other";
}
function categoryHex(cat) {
  const sw = LEGEND_SWATCHES.find((s) => s.category === cat);
  if (!sw) return "#475569";
  const [r, g, b] = sw.rgb;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// CTM math
const IDENTITY = [1, 0, 0, 1, 0, 0];
function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
function applyCTM(ctm, x, y) {
  return { x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] };
}
function parseColor(arg) {
  if (arg && (arg instanceof Uint8ClampedArray || arg instanceof Uint8Array)) {
    if (arg.length >= 3) return [arg[0] / 255, arg[1] / 255, arg[2] / 255];
  }
  if (Array.isArray(arg) && arg.length >= 3) {
    const [r, g, b] = arg;
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
      const norm = Math.max(r, g, b) > 1 ? 255 : 1;
      return [r / norm, g / norm, b / norm];
    }
  }
  return null;
}

const MINI = { MOVE: 0, LINE: 1, CURVE: 2, CURVE2: 3, CURVE3: 4, CLOSE: 5, RECT: 6 };
function flattenCubic(p0, c1, c2, p1, out, steps = 6) {
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    out.push({
      x: u*u*u*p0.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*p1.x,
      y: u*u*u*p0.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*p1.y,
    });
  }
}
function decodeLegacyBuffer(buffer, ctm) {
  const subpaths = [];
  let current = [], closed = false, i = 0;
  const len = buffer.length;
  const finish = () => { if (current.length) subpaths.push(current); current = []; };
  while (i < len) {
    const op = buffer[i++];
    if (op === MINI.MOVE) { finish(); current.push(applyCTM(ctm, buffer[i], buffer[i+1])); i += 2; }
    else if (op === MINI.LINE) { current.push(applyCTM(ctm, buffer[i], buffer[i+1])); i += 2; }
    else if (op === MINI.CURVE) {
      const last = current[current.length-1];
      const c1 = applyCTM(ctm, buffer[i], buffer[i+1]);
      const c2 = applyCTM(ctm, buffer[i+2], buffer[i+3]);
      const end = applyCTM(ctm, buffer[i+4], buffer[i+5]);
      if (last) flattenCubic(last, c1, c2, end, current); else current.push(end);
      i += 6;
    } else if (op === MINI.CURVE2) {
      const last = current[current.length-1];
      const c2 = applyCTM(ctm, buffer[i], buffer[i+1]);
      const end = applyCTM(ctm, buffer[i+2], buffer[i+3]);
      if (last) flattenCubic(last, last, c2, end, current); else current.push(end);
      i += 4;
    } else if (op === MINI.CURVE3) {
      const last = current[current.length-1];
      const c1 = applyCTM(ctm, buffer[i], buffer[i+1]);
      const end = applyCTM(ctm, buffer[i+2], buffer[i+3]);
      if (last) flattenCubic(last, c1, end, end, current); else current.push(end);
      i += 4;
    } else if (op === MINI.CLOSE) {
      if (current.length) current.push({ ...current[0] });
      closed = true;
    } else if (op === MINI.RECT) {
      finish();
      const x = buffer[i], y = buffer[i+1], w = buffer[i+2], h = buffer[i+3];
      const p1 = applyCTM(ctm, x, y), p2 = applyCTM(ctm, x+w, y);
      const p3 = applyCTM(ctm, x+w, y+h), p4 = applyCTM(ctm, x, y+h);
      subpaths.push([p1, p2, p3, p4, p1]);
      closed = true;
      i += 4;
    } else { break; }
  }
  finish();
  return { subpaths, closed };
}
function decodeModernPath(ops, args, ctm) {
  const subpaths = [];
  let current = [], closed = false, argIdx = 0;
  const finish = () => { if (current.length) subpaths.push(current); current = []; };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === OPS.moveTo) { finish(); current.push(applyCTM(ctm, args[argIdx], args[argIdx+1])); argIdx += 2; }
    else if (op === OPS.lineTo) { current.push(applyCTM(ctm, args[argIdx], args[argIdx+1])); argIdx += 2; }
    else if (op === OPS.curveTo) {
      const last = current[current.length-1];
      const c1 = applyCTM(ctm, args[argIdx], args[argIdx+1]);
      const c2 = applyCTM(ctm, args[argIdx+2], args[argIdx+3]);
      const end = applyCTM(ctm, args[argIdx+4], args[argIdx+5]);
      if (last) flattenCubic(last, c1, c2, end, current); else current.push(end);
      argIdx += 6;
    } else if (op === OPS.curveTo2) {
      const last = current[current.length-1];
      const c2 = applyCTM(ctm, args[argIdx], args[argIdx+1]);
      const end = applyCTM(ctm, args[argIdx+2], args[argIdx+3]);
      if (last) flattenCubic(last, last, c2, end, current); else current.push(end);
      argIdx += 4;
    } else if (op === OPS.curveTo3) {
      const last = current[current.length-1];
      const c1 = applyCTM(ctm, args[argIdx], args[argIdx+1]);
      const end = applyCTM(ctm, args[argIdx+2], args[argIdx+3]);
      if (last) flattenCubic(last, c1, end, end, current); else current.push(end);
      argIdx += 4;
    } else if (op === OPS.closePath) {
      if (current.length) current.push({ ...current[0] });
      closed = true;
    } else if (op === OPS.rectangle) {
      finish();
      const x = args[argIdx], y = args[argIdx+1], w = args[argIdx+2], h = args[argIdx+3];
      const p1 = applyCTM(ctm, x, y), p2 = applyCTM(ctm, x+w, y);
      const p3 = applyCTM(ctm, x+w, y+h), p4 = applyCTM(ctm, x, y+h);
      subpaths.push([p1, p2, p3, p4, p1]);
      closed = true;
      argIdx += 4;
    }
  }
  finish();
  return { subpaths, closed };
}

// Load PDF
const data = new Uint8Array(readFileSync(PDF_PATH));
const doc = await getDocument({
  data,
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: false,
  standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
}).promise;

const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: 1 });
const pdfWidth = viewport.width;
const pdfHeight = viewport.height;
console.log(`Page: ${pdfWidth.toFixed(0)} x ${pdfHeight.toFixed(0)} PDF units`);

const opList = await page.getOperatorList();
console.log(`Ops: ${opList.fnArray.length}`);

const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const PAINT_OPS = new Set([...STROKE_OPS, ...FILL_OPS, OPS.endPath]);

let state = { ctm: [...IDENTITY], strokeColor: null, fillColor: null, lineWidth: 1 };
const stack = [];
let pendingPath = null;

// Compute bounds the way detectFromPdf does (over the actual decoded paths,
// not the page viewport - the page may be rotated and the decoded coords
// live in unrotated user space).
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
function visit(sp) {
  for (const p of sp) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
}
// Bounds will be filled during the walk; defer canvas allocation.
let canvas, ctx, W, H, renderScale;
function projX(x) { return (x - minX) * renderScale; }
function projY(y) { return (maxY - y) * renderScale; }

// Per-category bucket of segments to render in z-order.
const DRAW_ORDER = [
  "context", "greenery", "water", "plot_fill", "building",
  "road_row", "road_plot", "emergency_access", "apartment_access",
  "plot_access", "taxi_layby", "shuttle_layby",
  "bridge", "bridge_ramp", "tunnel", "tunnel_ramp", "raised_crossing",
];
const STROKE_CATS = new Set(["raised_crossing"]);
// ROADS_ONLY=1 renders just the driveable road categories (the "isolate the
// road network" view) on a dark background, to confirm corridors form cleanly.
const ROADS_ONLY = process.env.ROADS_ONLY === "1";
const ROAD_ONLY_CATS = new Set([
  "road_row", "road_plot", "taxi_layby", "shuttle_layby",
  "emergency_access", "apartment_access", "plot_access",
  "bridge", "bridge_ramp", "tunnel", "tunnel_ramp",
]);
const buckets = new Map();
for (const c of DRAW_ORDER) buckets.set(c, []);
const otherBucket = [];


// Walk operator list
for (let i = 0; i < opList.fnArray.length; i++) {
  const fn = opList.fnArray[i];
  const args = opList.argsArray[i] || [];

  if (fn === OPS.save) { stack.push({ ...state, ctm: [...state.ctm] }); continue; }
  if (fn === OPS.restore) { const popped = stack.pop(); if (popped) state = popped; continue; }
  if (fn === OPS.transform) { state.ctm = multiply(args, state.ctm); continue; }
  if (fn === OPS.setStrokeRGBColor) { state.strokeColor = parseColor(args) ?? parseColor(args[0]); continue; }
  if (fn === OPS.setFillRGBColor) { state.fillColor = parseColor(args) ?? parseColor(args[0]); continue; }
  if (fn === OPS.setStrokeColor || fn === OPS.setStrokeColorN) { const p = parseColor(args[args.length-1]); if (p) state.strokeColor = p; continue; }
  if (fn === OPS.setFillColor || fn === OPS.setFillColorN) { const p = parseColor(args[args.length-1]); if (p) state.fillColor = p; continue; }
  if (fn === OPS.setLineWidth) { state.lineWidth = args[0]; continue; }

  if (fn === OPS.constructPath) {
    const subOps = args[0];
    const subArgs = args[1] || [];
    let decoded;
    if (subOps && (subOps instanceof Uint8Array || subOps instanceof Uint8ClampedArray) && subOps.length === 0 && subArgs && (subArgs instanceof Float32Array || subArgs instanceof Float64Array)) {
      decoded = decodeLegacyBuffer(subArgs, state.ctm);
    } else if (subOps && (subOps.length || subOps.byteLength)) {
      decoded = decodeModernPath(Array.from(subOps), subArgs, state.ctm);
    } else if (subArgs && (subArgs instanceof Float32Array || subArgs instanceof Float64Array)) {
      decoded = decodeLegacyBuffer(subArgs, state.ctm);
    }
    if (decoded) {
      pendingPath = {
        subpaths: decoded.subpaths,
        closed: decoded.closed,
        fillColor: state.fillColor ? [...state.fillColor] : null,
        strokeColor: state.strokeColor ? [...state.strokeColor] : null,
      };
      for (const sp of decoded.subpaths) visit(sp);
    }
    continue;
  }

  if (PAINT_OPS.has(fn)) {
    if (!pendingPath) continue;
    const isFill = FILL_OPS.has(fn);
    const isStroke = STROKE_OPS.has(fn);
    const colour = isFill && pendingPath.fillColor
      ? pendingPath.fillColor
      : pendingPath.strokeColor ?? pendingPath.fillColor;
    if (colour) {
      const r = Math.round(colour[0] * 255);
      const g = Math.round(colour[1] * 255);
      const b = Math.round(colour[2] * 255);
      const cat = classify([r, g, b]);
      const bucket = buckets.get(cat) ?? otherBucket;
      bucket.push({ subpaths: pendingPath.subpaths, closed: pendingPath.closed, isFill, isStroke });
    }
    pendingPath = null;
    continue;
  }
}

// Bounds are now known. Allocate output canvas matching CadViewer's sizing.
if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
const drawW = Math.max(maxX - minX, 1);
const drawH = Math.max(maxY - minY, 1);
const targetLong = 3500;
renderScale = Math.min(targetLong / Math.max(drawW, drawH), 4096 / Math.max(drawW, drawH));
W = Math.ceil(drawW * renderScale);
H = Math.ceil(drawH * renderScale);
console.log(`Bounds: x=[${minX.toFixed(0)}, ${maxX.toFixed(0)}]  y=[${minY.toFixed(0)}, ${maxY.toFixed(0)}]`);
console.log(`Output canvas: ${W} x ${H} (scale ${renderScale.toFixed(3)})`);
canvas = createCanvas(W, H);
ctx = canvas.getContext("2d");
ctx.fillStyle = "#0f172a";
ctx.fillRect(0, 0, W, H);

// Render in DRAW_ORDER. Fill closed polygons; stroke for stroke categories.
for (const cat of DRAW_ORDER) {
  if (ROADS_ONLY && !ROAD_ONLY_CATS.has(cat)) continue;
  const segs = buckets.get(cat) ?? [];
  if (segs.length === 0) continue;
  const colour = categoryHex(cat);
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (STROKE_CATS.has(cat)) {
    ctx.lineWidth = Math.max(1.4, renderScale * 0.6);
    for (const seg of segs) {
      for (const sp of seg.subpaths) {
        if (sp.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < sp.length; i++) {
          if (i === 0) ctx.moveTo(projX(sp[i].x), projY(sp[i].y));
          else ctx.lineTo(projX(sp[i].x), projY(sp[i].y));
        }
        ctx.stroke();
      }
    }
    continue;
  }
  let painted = 0;
  for (const seg of segs) {
    if (!seg.closed && !seg.isFill) continue;
    for (const sp of seg.subpaths) {
      if (sp.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i < sp.length; i++) {
        if (i === 0) ctx.moveTo(projX(sp[i].x), projY(sp[i].y));
        else ctx.lineTo(projX(sp[i].x), projY(sp[i].y));
      }
      ctx.closePath();
      ctx.fill();
      painted += 1;
    }
  }
  console.log(`  ${cat.padEnd(20)} segs=${segs.length}  painted=${painted}  colour=${colour}`);
}

// Apply the page /Rotate so the output presents in the orientation users see
// when opening the PDF in a normal viewer (the source is stored portrait
// with /Rotate 270 to display landscape).
const rotation = (page.rotate ?? 0) % 360;
const swap = rotation === 90 || rotation === 270;
const finalCanvas = createCanvas(swap ? H : W, swap ? W : H);
const fctx = finalCanvas.getContext("2d");
fctx.fillStyle = "#0f172a";
fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
fctx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
fctx.rotate((rotation * Math.PI) / 180);
fctx.drawImage(canvas, -W / 2, -H / 2);

const buf = finalCanvas.toBuffer("image/png");
const outPath = resolve(OUT_DIR, "preview.png");
import("node:fs").then((fs) => fs.writeFileSync(outPath, buf));
console.log(`\nWrote ${outPath} (rotated ${rotation}°)`);
