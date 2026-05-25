#!/usr/bin/env node
/**
 * High-quality comparison: the real PDF page vs. the layer the app renders.
 *
 * 1. Rasterises PDF page 1 with pdfjs (ground truth - every line, fill,
 *    hatch and label).
 * 2. Renders the app's classified-fill layer in the SAME viewport space.
 * 3. Emits: pdf.png, layer.png, sidebyside.png, overlay.png, and a
 *    coverage report (how much of the PDF's inked area the app's fills
 *    actually cover, and how much the app paints where the PDF is blank).
 *
 * Run: node scripts/compare-pdf-layer.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PDF_PATH = resolve(ROOT, "public/ju_compressed_1.pdf");
const OUT = resolve(__dirname, ".compare-out");
mkdirSync(OUT, { recursive: true });

const pdfjs = await import(
  pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href
);
const { getDocument, OPS } = pdfjs;
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
}

// ---- legend swatches + CIELAB classifier (same as preview-render) ----------
const swatchesSrc = readFileSync(resolve(ROOT, "lib/legend-swatches.ts"), "utf8");
const LEGEND_SWATCHES = JSON.parse(
  swatchesSrc.match(/LEGEND_SWATCHES[^=]*=\s*(\[[\s\S]*?\]);/)[1]
);
const srgbToLinear = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
function rgbToLab([r, g, b]) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const swatchLab = [];
for (const sw of LEGEND_SWATCHES) {
  swatchLab.push({ cat: sw.category, lab: rgbToLab(sw.rgb), tol: sw.tolerance });
  for (const a of sw.aliases ?? [])
    swatchLab.push({ cat: sw.category, lab: rgbToLab(a), tol: sw.tolerance });
}
function classify(rgb) {
  const lab = rgbToLab(rgb);
  let best = null;
  for (const s of swatchLab) {
    const d = deltaE(lab, s.lab);
    if (d <= s.tol && (!best || d < best.d)) best = { cat: s.cat, d };
  }
  return best?.cat ?? "other";
}
function categoryHex(cat) {
  const sw = LEGEND_SWATCHES.find((s) => s.category === cat);
  if (!sw) return "#475569";
  const [r, g, b] = sw.rgb;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---- CTM + path decode (same logic the app's extractor uses) ----------------
const I = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [
  a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
  a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
  a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5],
];
const ap = (m, x, y) => ({ x: m[0]*x+m[2]*y+m[4], y: m[1]*x+m[3]*y+m[5] });
function parseColor(arg) {
  if (arg && (arg instanceof Uint8ClampedArray || arg instanceof Uint8Array) && arg.length >= 3)
    return [arg[0]/255, arg[1]/255, arg[2]/255];
  if (Array.isArray(arg) && arg.length >= 3 && typeof arg[0] === "number") {
    const n = Math.max(arg[0], arg[1], arg[2]) > 1 ? 255 : 1;
    return [arg[0]/n, arg[1]/n, arg[2]/n];
  }
  return null;
}
function flattenCubic(p0, c1, c2, p1, out, steps = 6) {
  for (let s = 1; s <= steps; s++) {
    const t = s/steps, u = 1-t;
    out.push({ x: u*u*u*p0.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*p1.x,
               y: u*u*u*p0.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*p1.y });
  }
}
function decodeLegacy(buf, ctm) {
  const subpaths = []; let cur = [], closed = false, i = 0;
  const fin = () => { if (cur.length) subpaths.push(cur); cur = []; };
  while (i < buf.length) {
    const op = buf[i++];
    if (op === 0) { fin(); cur.push(ap(ctm, buf[i], buf[i+1])); i += 2; }
    else if (op === 1) { cur.push(ap(ctm, buf[i], buf[i+1])); i += 2; }
    else if (op === 2) { const l = cur[cur.length-1], c1 = ap(ctm,buf[i],buf[i+1]), c2 = ap(ctm,buf[i+2],buf[i+3]), e = ap(ctm,buf[i+4],buf[i+5]); if (l) flattenCubic(l,c1,c2,e,cur); else cur.push(e); i += 6; }
    else if (op === 3) { const l = cur[cur.length-1], c2 = ap(ctm,buf[i],buf[i+1]), e = ap(ctm,buf[i+2],buf[i+3]); if (l) flattenCubic(l,l,c2,e,cur); else cur.push(e); i += 4; }
    else if (op === 4) { const l = cur[cur.length-1], c1 = ap(ctm,buf[i],buf[i+1]), e = ap(ctm,buf[i+2],buf[i+3]); if (l) flattenCubic(l,c1,e,e,cur); else cur.push(e); i += 4; }
    else if (op === 5) { if (cur.length) cur.push({ ...cur[0] }); closed = true; }
    else if (op === 6) { fin(); const x=buf[i],y=buf[i+1],w=buf[i+2],h=buf[i+3]; subpaths.push([ap(ctm,x,y),ap(ctm,x+w,y),ap(ctm,x+w,y+h),ap(ctm,x,y+h),ap(ctm,x,y)]); closed = true; i += 4; }
    else break;
  }
  fin(); return { subpaths, closed };
}
function decodeModern(ops, args, ctm) {
  const subpaths = []; let cur = [], closed = false, k = 0;
  const fin = () => { if (cur.length) subpaths.push(cur); cur = []; };
  for (const op of ops) {
    if (op === OPS.moveTo) { fin(); cur.push(ap(ctm, args[k], args[k+1])); k += 2; }
    else if (op === OPS.lineTo) { cur.push(ap(ctm, args[k], args[k+1])); k += 2; }
    else if (op === OPS.curveTo) { const l=cur[cur.length-1],c1=ap(ctm,args[k],args[k+1]),c2=ap(ctm,args[k+2],args[k+3]),e=ap(ctm,args[k+4],args[k+5]); if(l)flattenCubic(l,c1,c2,e,cur);else cur.push(e); k+=6; }
    else if (op === OPS.curveTo2) { const l=cur[cur.length-1],c2=ap(ctm,args[k],args[k+1]),e=ap(ctm,args[k+2],args[k+3]); if(l)flattenCubic(l,l,c2,e,cur);else cur.push(e); k+=4; }
    else if (op === OPS.curveTo3) { const l=cur[cur.length-1],c1=ap(ctm,args[k],args[k+1]),e=ap(ctm,args[k+2],args[k+3]); if(l)flattenCubic(l,c1,e,e,cur);else cur.push(e); k+=4; }
    else if (op === OPS.closePath) { if (cur.length) cur.push({ ...cur[0] }); closed = true; }
    else if (op === OPS.rectangle) { fin(); const x=args[k],y=args[k+1],w=args[k+2],h=args[k+3]; subpaths.push([ap(ctm,x,y),ap(ctm,x+w,y),ap(ctm,x+w,y+h),ap(ctm,x,y+h),ap(ctm,x,y)]); closed = true; k += 4; }
  }
  fin(); return { subpaths, closed };
}

// ---- node canvas factory for pdfjs rasterisation ---------------------------
class NodeCanvasFactory {
  create(w, h) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; }
  reset(cc, w, h) { cc.canvas.width = w; cc.canvas.height = h; }
  destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; }
}

// ---- load + rasterise the real PDF (ground truth) --------------------------
const data = new Uint8Array(readFileSync(PDF_PATH));
const doc = await getDocument({
  data,
  disableWorker: true,
  isEvalSupported: false,
  standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
  canvasFactory: new NodeCanvasFactory(),
}).promise;
const page = await doc.getPage(1);

const SCALE = Number(process.env.SCALE || 2.0); // raster quality
const viewport = page.getViewport({ scale: SCALE });
const VW = Math.ceil(viewport.width), VH = Math.ceil(viewport.height);
console.log(`PDF page raster: ${VW} x ${VH} (scale ${SCALE}, rotate ${page.rotate || 0})`);

const pdfCanvas = createCanvas(VW, VH);
const pdfCtx = pdfCanvas.getContext("2d");
await page.render({ canvasContext: pdfCtx, viewport, canvasFactory: new NodeCanvasFactory() }).promise;
writeFileSync(resolve(OUT, "pdf.png"), pdfCanvas.toBuffer("image/png"));

// ---- walk + classify, render the app layer in the SAME viewport ------------
const opList = await page.getOperatorList();
const FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const PAINT = new Set([...FILL, ...STROKE, OPS.endPath]);
const DRAW_ORDER = ["context","greenery","water","plot_fill","building","road_row","road_plot","emergency_access","apartment_access","plot_access","taxi_layby","shuttle_layby","bridge","bridge_ramp","tunnel","tunnel_ramp","raised_crossing"];
const STROKE_CATS = new Set(["raised_crossing"]);

let st = { ctm: [...I], fillColor: null, strokeColor: null };
const stack = []; let pend = null;
const buckets = new Map(DRAW_ORDER.map((c) => [c, []]));
const other = [];
let totalFills = 0, classified = 0;

for (let i = 0; i < opList.fnArray.length; i++) {
  const fn = opList.fnArray[i], args = opList.argsArray[i] || [];
  if (fn === OPS.save) { stack.push({ ...st, ctm: [...st.ctm] }); }
  else if (fn === OPS.restore) { const p = stack.pop(); if (p) st = p; }
  else if (fn === OPS.transform) { st.ctm = mul(args, st.ctm); }
  else if (fn === OPS.setFillRGBColor) { st.fillColor = parseColor(args) ?? parseColor(args[0]); }
  else if (fn === OPS.setStrokeRGBColor) { st.strokeColor = parseColor(args) ?? parseColor(args[0]); }
  else if (fn === OPS.setFillColor || fn === OPS.setFillColorN) { const p = parseColor(args[args.length-1]); if (p) st.fillColor = p; }
  else if (fn === OPS.setStrokeColor || fn === OPS.setStrokeColorN) { const p = parseColor(args[args.length-1]); if (p) st.strokeColor = p; }
  else if (fn === OPS.constructPath) {
    const subOps = args[0], subArgs = args[1] || [];
    let dec;
    if (subOps && subOps.length === 0 && (subArgs instanceof Float32Array || subArgs instanceof Float64Array)) dec = decodeLegacy(subArgs, st.ctm);
    else if (subOps && (subOps.length || subOps.byteLength)) dec = decodeModern(Array.from(subOps), subArgs, st.ctm);
    else if (subArgs instanceof Float32Array || subArgs instanceof Float64Array) dec = decodeLegacy(subArgs, st.ctm);
    if (dec) pend = { ...dec, fillColor: st.fillColor ? [...st.fillColor] : null, strokeColor: st.strokeColor ? [...st.strokeColor] : null };
  } else if (PAINT.has(fn)) {
    if (!pend) continue;
    const isFill = FILL.has(fn);
    if (isFill) totalFills++;
    const col = isFill && pend.fillColor ? pend.fillColor : pend.strokeColor ?? pend.fillColor;
    if (col) {
      const rgb = [Math.round(col[0]*255), Math.round(col[1]*255), Math.round(col[2]*255)];
      const cat = classify(rgb);
      if (cat !== "other") classified++;
      (buckets.get(cat) ?? other).push({ subpaths: pend.subpaths, closed: pend.closed, isFill, isStroke: STROKE.has(fn) });
    }
    pend = null;
  }
}

// Match render-drawing.ts: skip the FILL for sheet-spanning background
// polygons (bbox covers >70% of both dimensions of the geometry extent).
let umnX = Infinity, umnY = Infinity, umxX = -Infinity, umxY = -Infinity;
for (const segs of [...buckets.values(), other])
  for (const seg of segs)
    for (const sp of seg.subpaths)
      for (const p of sp) {
        if (p.x < umnX) umnX = p.x; if (p.y < umnY) umnY = p.y;
        if (p.x > umxX) umxX = p.x; if (p.y > umxY) umxY = p.y;
      }
const uBW = Math.max(umxX - umnX, 1), uBH = Math.max(umxY - umnY, 1);
const isBgSeg = (seg) => {
  let xmn = Infinity, ymn = Infinity, xmx = -Infinity, ymx = -Infinity;
  for (const sp of seg.subpaths) for (const p of sp) {
    if (p.x < xmn) xmn = p.x; if (p.y < ymn) ymn = p.y;
    if (p.x > xmx) xmx = p.x; if (p.y > ymx) ymx = p.y;
  }
  return (xmx - xmn) > uBW * 0.7 && (ymx - ymn) > uBH * 0.7;
};

// Render app layer onto a transparent canvas in viewport pixel space.
const layerCanvas = createCanvas(VW, VH);
const lctx = layerCanvas.getContext("2d");
const vp = (x, y) => viewport.convertToViewportPoint(x, y); // user -> raster px
const OUTLINES = process.env.OUTLINES === "1"; // preview the solid+outlines look
const darken = (hex, f) => {
  const r = Math.round(parseInt(hex.slice(1,3),16)*f), g = Math.round(parseInt(hex.slice(3,5),16)*f), b = Math.round(parseInt(hex.slice(5,7),16)*f);
  return `rgb(${r}, ${g}, ${b})`;
};
const ROADS_ONLY = process.env.ROADS_ONLY === "1";
const ROAD_SET = new Set(["road_row","road_plot","taxi_layby","shuttle_layby","emergency_access","apartment_access","plot_access","bridge","bridge_ramp","tunnel","tunnel_ramp"]);
for (const cat of DRAW_ORDER) {
  if (ROADS_ONLY && !ROAD_SET.has(cat)) continue;
  const segs = buckets.get(cat) ?? [];
  if (!segs.length) continue;
  const hex = categoryHex(cat);
  lctx.fillStyle = hex; lctx.strokeStyle = hex; lctx.lineCap = "round"; lctx.lineJoin = "round";
  const strokeCat = STROKE_CATS.has(cat);
  if (strokeCat) lctx.lineWidth = Math.max(1.4, SCALE * 1.2);
  const outlineW = Math.max(1, SCALE * 0.5);
  for (const seg of segs) {
    if (!strokeCat && !seg.closed && !seg.isFill) continue;
    const bg = !strokeCat && isBgSeg(seg);
    if (bg && !OUTLINES) continue; // skip sheet-spanning background fills
    for (const sp of seg.subpaths) {
      if (sp.length < (strokeCat ? 2 : 3)) continue;
      lctx.beginPath();
      for (let i = 0; i < sp.length; i++) {
        const p = vp(sp[i].x, sp[i].y);
        if (i === 0) lctx.moveTo(p[0], p[1]); else lctx.lineTo(p[0], p[1]);
      }
      if (strokeCat) { lctx.stroke(); continue; }
      lctx.closePath();
      if (!bg) lctx.fill();
      if (OUTLINES) {
        lctx.strokeStyle = darken(hex, 0.5);
        lctx.lineWidth = outlineW;
        lctx.stroke();
        lctx.strokeStyle = hex; // restore for any stroke cats
      }
    }
  }
}
writeFileSync(resolve(OUT, OUTLINES ? "layer-outlines.png" : "layer.png"), layerCanvas.toBuffer("image/png"));

// ---- per-category coverage: which layer blankets the page? -----------------
console.log("\n=== Per-category painted coverage (% of page) ===");
const catCov = [];
for (const cat of DRAW_ORDER) {
  const segs = buckets.get(cat) ?? [];
  if (!segs.length) continue;
  const cc = createCanvas(VW, VH);
  const cx = cc.getContext("2d");
  cx.fillStyle = "#fff";
  const strokeCat = STROKE_CATS.has(cat);
  if (strokeCat) { cx.strokeStyle = "#fff"; cx.lineWidth = Math.max(1.4, SCALE * 1.2); }
  for (const seg of segs) {
    if (!strokeCat && !seg.closed && !seg.isFill) continue;
    if (!strokeCat && isBgSeg(seg)) continue; // skip sheet-spanning background fills
    for (const sp of seg.subpaths) {
      if (sp.length < (strokeCat ? 2 : 3)) continue;
      cx.beginPath();
      for (let i = 0; i < sp.length; i++) { const p = vp(sp[i].x, sp[i].y); if (i===0) cx.moveTo(p[0],p[1]); else cx.lineTo(p[0],p[1]); }
      if (strokeCat) cx.stroke(); else { cx.closePath(); cx.fill(); }
    }
  }
  const px = cx.getImageData(0, 0, VW, VH).data;
  let c = 0;
  for (let i = 0; i < VW * VH; i++) if (px[i*4+3] > 10) c++;
  catCov.push({ cat, segs: segs.length, cov: (100*c)/(VW*VH) });
}
catCov.sort((a, b) => b.cov - a.cov);
for (const r of catCov) console.log(`  ${r.cat.padEnd(18)} ${r.cov.toFixed(1).padStart(5)}%  (${r.segs} paths)`);

// ---- composites: side-by-side + overlay ------------------------------------
const sbs = createCanvas(VW * 2 + 20, VH);
const sctx = sbs.getContext("2d");
sctx.fillStyle = "#0b1120"; sctx.fillRect(0, 0, sbs.width, sbs.height);
sctx.drawImage(pdfCanvas, 0, 0);
sctx.drawImage(layerCanvas, VW + 20, 0);
writeFileSync(resolve(OUT, "sidebyside.png"), sbs.toBuffer("image/png"));

const ov = createCanvas(VW, VH);
const octx = ov.getContext("2d");
octx.drawImage(pdfCanvas, 0, 0);
octx.globalAlpha = 0.55;
octx.drawImage(layerCanvas, 0, 0);
octx.globalAlpha = 1;
writeFileSync(resolve(OUT, "overlay.png"), ov.toBuffer("image/png"));

// ---- coverage metrics: PDF inked vs app-painted ----------------------------
const pdfPx = pdfCtx.getImageData(0, 0, VW, VH).data;
const layPx = lctx.getImageData(0, 0, VW, VH).data;
let inked = 0, painted = 0, paintedOnInked = 0, paintedOnBlank = 0;
const N = VW * VH;
for (let i = 0; i < N; i++) {
  const o = i * 4;
  // PDF "inked" = not near-white (the page background is white).
  const isInked = !(pdfPx[o] > 240 && pdfPx[o+1] > 240 && pdfPx[o+2] > 240);
  const isPainted = layPx[o+3] > 10; // app layer alpha
  if (isInked) inked++;
  if (isPainted) {
    painted++;
    if (isInked) paintedOnInked++; else paintedOnBlank++;
  }
}
const pct = (n) => ((100 * n) / N).toFixed(1);
console.log("\n=== Coverage (page-pixel basis) ===");
console.log(`PDF inked area:            ${pct(inked)}% of page`);
console.log(`App layer painted area:    ${pct(painted)}% of page`);
console.log(`  painted over PDF ink:    ${pct(paintedOnInked)}%  (matches real content)`);
console.log(`  painted over blank page: ${pct(paintedOnBlank)}%  (app paints where PDF is white)`);
console.log(`App covers of PDF ink:     ${((100*paintedOnInked)/Math.max(1,inked)).toFixed(1)}%`);
console.log(`\nFills: ${totalFills} total, ${classified} classified to a road/area category`);
console.log(`Wrote pdf.png, layer.png, sidebyside.png, overlay.png to ${OUT}`);
