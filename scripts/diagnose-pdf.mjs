#!/usr/bin/env node
/**
 * Pure-investigation diagnostic for public/ju_compressed_1.pdf.
 *
 * Mirrors lib/pdf-extract.ts's path-extraction protocol but accumulates
 * statistics rather than constructing ExtractedPath objects. Cross-references
 * the dominant fill clusters against lib/legend-swatches.ts.
 *
 * Run: node scripts/diagnose-pdf.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PDF_PATH = resolve(ROOT, "public/ju_compressed_1.pdf");

// pdfjs-dist legacy build is ESM and works in Node.
const pdfjsModUrl = pathToFileURL(
  resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
).href;
const pdfjs = await import(pdfjsModUrl);
const { getDocument, OPS } = pdfjs;

// Disable worker (Node).
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
}

// Load LEGEND_SWATCHES by parsing the .ts file as text (we only need the
// JSON-shaped array literal, no TS type checking).
const swatchesSrc = readFileSync(resolve(ROOT, "lib/legend-swatches.ts"), "utf8");
const arrMatch = swatchesSrc.match(/LEGEND_SWATCHES[^=]*=\s*(\[[\s\S]*?\]);/);
if (!arrMatch) throw new Error("Could not locate LEGEND_SWATCHES array");
const LEGEND_SWATCHES = JSON.parse(arrMatch[1]);

// ---- color helpers (CIE Lab via D65) -------------------------------------
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

// Pre-compute Lab for swatch primaries + aliases.
const swatchLabIndex = [];
for (const sw of LEGEND_SWATCHES) {
  swatchLabIndex.push({ cat: sw.category, lab: rgbToLab(sw.rgb), tol: sw.tolerance, isAlias: false, rgb: sw.rgb });
  for (const alias of sw.aliases ?? []) {
    swatchLabIndex.push({ cat: sw.category, lab: rgbToLab(alias), tol: sw.tolerance, isAlias: true, rgb: alias });
  }
}
function nearestSwatch(rgb255) {
  const lab = rgbToLab(rgb255);
  let best = null;
  for (const s of swatchLabIndex) {
    const d = deltaE(lab, s.lab);
    if (!best || d < best.d) best = { d, ...s };
  }
  return best;
}

// ---- minimal CTM + path math --------------------------------------------
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
function cloneState(s) {
  return {
    ctm: [...s.ctm],
    strokeColor: s.strokeColor ? [...s.strokeColor] : null,
    fillColor: s.fillColor ? [...s.fillColor] : null,
    lineWidth: s.lineWidth,
  };
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
function flattenCubic(p0, c1, c2, p1, out, steps = 8) {
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
    if (op === MINI.MOVE) { finish(); const p = applyCTM(ctm, buffer[i], buffer[i+1]); current.push(p); i += 2; }
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
      argIdx += 4;
    }
  }
  finish();
  return { subpaths, closed };
}

// Polygon area (shoelace) over all subpaths.
function pathArea(subpaths) {
  let total = 0;
  for (const sp of subpaths) {
    if (sp.length < 3) continue;
    let a = 0;
    for (let i = 0; i < sp.length; i++) {
      const j = (i + 1) % sp.length;
      a += sp[i].x * sp[j].y - sp[j].x * sp[i].y;
    }
    total += Math.abs(a) / 2;
  }
  return total;
}
function pathLength(subpaths) {
  let total = 0;
  for (const sp of subpaths) {
    for (let i = 1; i < sp.length; i++) {
      total += Math.hypot(sp[i].x - sp[i-1].x, sp[i].y - sp[i-1].y);
    }
  }
  return total;
}
function pathPointCount(subpaths) {
  let n = 0;
  for (const sp of subpaths) n += sp.length;
  return n;
}

// ---- main ---------------------------------------------------------------
const issues = [];

const data = new Uint8Array(readFileSync(PDF_PATH));
const loadingTask = getDocument({
  data,
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: false,
  standardFontDataUrl: resolve(ROOT, "node_modules/pdfjs-dist/standard_fonts") + "/",
});
loadingTask.onUnsupportedFeature = (f) => issues.push("unsupportedFeature: " + f);
const doc = await loadingTask.promise.catch((e) => {
  issues.push("getDocument FAILED: " + e.message);
  throw e;
});
console.log(`Loaded PDF: numPages=${doc.numPages}`);

const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: 1 });
console.log(`Page 1 viewport: ${viewport.width.toFixed(1)} x ${viewport.height.toFixed(1)} (PDF units)`);

let opList;
try {
  opList = await page.getOperatorList();
} catch (e) {
  issues.push("getOperatorList FAILED: " + e.message);
  throw e;
}
console.log(`Operator list length: ${opList.fnArray.length}`);

const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const PAINT_OPS = new Set([...STROKE_OPS, ...FILL_OPS, OPS.endPath]);

let state = { ctm: [...IDENTITY], strokeColor: null, fillColor: null, lineWidth: 1 };
const stack = [];
let pendingPath = null;

const stats = {
  totalPaths: 0,
  filledOnly: 0,
  strokedOnly: 0,
  fillStroke: 0,
  noPaint: 0,
};

// cluster keys = round(r*255/8)*8 etc.  bin width = 8 per channel
function binKey(rgb01) {
  const r = Math.min(255, Math.max(0, Math.round(rgb01[0] * 255)));
  const g = Math.min(255, Math.max(0, Math.round(rgb01[1] * 255)));
  const b = Math.min(255, Math.max(0, Math.round(rgb01[2] * 255)));
  const rb = Math.floor(r / 8) * 8;
  const gb = Math.floor(g / 8) * 8;
  const bb = Math.floor(b / 8) * 8;
  return `${rb}_${gb}_${bb}`;
}
function keyToRgb(key) {
  return key.split("_").map(Number);
}

const fillClusters = new Map(); // key -> { count, area, pointCounts: [] }
const strokeClusters = new Map(); // key -> { count, length }

function recordPath({ isStroked, isFilled, fillColor, strokeColor, subpaths }) {
  stats.totalPaths += 1;
  if (isStroked && isFilled) stats.fillStroke += 1;
  else if (isFilled) stats.filledOnly += 1;
  else if (isStroked) stats.strokedOnly += 1;
  else stats.noPaint += 1;

  if (isFilled && fillColor) {
    const key = binKey(fillColor);
    let c = fillClusters.get(key);
    if (!c) { c = { count: 0, area: 0, pointCounts: [] }; fillClusters.set(key, c); }
    c.count += 1;
    c.area += pathArea(subpaths);
    c.pointCounts.push(pathPointCount(subpaths));
  }
  if (isStroked && strokeColor) {
    const key = binKey(strokeColor);
    let c = strokeClusters.get(key);
    if (!c) { c = { count: 0, length: 0 }; strokeClusters.set(key, c); }
    c.count += 1;
    c.length += pathLength(subpaths);
  }
}

for (let i = 0; i < opList.fnArray.length; i++) {
  const op = opList.fnArray[i];
  const args = opList.argsArray[i];

  if (op === OPS.save) { stack.push(cloneState(state)); }
  else if (op === OPS.restore) { const p = stack.pop(); if (p) state = p; }
  else if (op === OPS.transform && args) {
    state.ctm = multiply([args[0], args[1], args[2], args[3], args[4], args[5]], state.ctm);
  }
  else if (op === OPS.setLineWidth && args) { state.lineWidth = args[0]; }
  else if (op === OPS.setStrokeRGBColor && args) {
    state.strokeColor = parseColor(args) ?? parseColor(args[0]);
  }
  else if (op === OPS.setFillRGBColor && args) {
    state.fillColor = parseColor(args) ?? parseColor(args[0]);
  }
  else if (op === OPS.constructPath && args) {
    const arg0 = args[0];
    if (Array.isArray(arg0)) {
      const ops2 = arg0;
      const flat = (args[1] ?? []);
      const { subpaths, closed } = decodeModernPath(ops2, flat, state.ctm);
      pendingPath = {
        subpaths, closed,
        strokeColor: state.strokeColor, fillColor: state.fillColor,
      };
    } else if (typeof arg0 === "number") {
      const terminal = arg0;
      const buf = Array.isArray(args[1]) ? args[1][0] : null;
      if (!buf) continue;
      const isStroked = STROKE_OPS.has(terminal);
      const isFilled = FILL_OPS.has(terminal);
      if (!isStroked && !isFilled) continue;
      const { subpaths } = decodeLegacyBuffer(buf, state.ctm);
      if (!subpaths.length) continue;
      recordPath({ isStroked, isFilled, fillColor: state.fillColor, strokeColor: state.strokeColor, subpaths });
    }
  }
  else if (PAINT_OPS.has(op) && pendingPath) {
    const isStroked = STROKE_OPS.has(op);
    const isFilled = FILL_OPS.has(op);
    if (isStroked || isFilled) {
      recordPath({ isStroked, isFilled,
        fillColor: pendingPath.fillColor, strokeColor: pendingPath.strokeColor,
        subpaths: pendingPath.subpaths });
    }
    pendingPath = null;
  }
}

console.log("\n========== TOTALS ==========");
console.log(`Total paths emitted:    ${stats.totalPaths}`);
console.log(`  filled only:          ${stats.filledOnly}`);
console.log(`  stroked only:         ${stats.strokedOnly}`);
console.log(`  filled + stroked:     ${stats.fillStroke}`);
console.log(`  endPath / no-paint:   ${stats.noPaint}`);

// Top fill clusters
const fillSorted = [...fillClusters.entries()]
  .map(([k, v]) => ({ key: k, rgb: keyToRgb(k), ...v }))
  .sort((a, b) => b.count - a.count);

console.log(`\n========== TOP 20 FILL CLUSTERS (bin=8 per channel) ==========`);
console.log(`Distinct fill clusters: ${fillSorted.length}`);
console.log(`rank | rgb (bin start)   | count    | total area      | avg area`);
for (let i = 0; i < Math.min(20, fillSorted.length); i++) {
  const c = fillSorted[i];
  const avg = c.area / c.count;
  console.log(
    `${String(i+1).padStart(3)}  | ${c.rgb.join(",").padEnd(15)}   | ${String(c.count).padStart(6)}   | ${c.area.toExponential(3).padStart(11)}    | ${avg.toExponential(3)}`
  );
}

// Top stroke clusters
const strokeSorted = [...strokeClusters.entries()]
  .map(([k, v]) => ({ key: k, rgb: keyToRgb(k), ...v }))
  .sort((a, b) => b.count - a.count);

console.log(`\n========== TOP 20 STROKE CLUSTERS ==========`);
console.log(`Distinct stroke clusters: ${strokeSorted.length}`);
console.log(`rank | rgb (bin start)   | count    | total length    | avg length`);
for (let i = 0; i < Math.min(20, strokeSorted.length); i++) {
  const c = strokeSorted[i];
  const avg = c.length / c.count;
  console.log(
    `${String(i+1).padStart(3)}  | ${c.rgb.join(",").padEnd(15)}   | ${String(c.count).padStart(6)}   | ${c.length.toExponential(3).padStart(11)}    | ${avg.toExponential(3)}`
  );
}

// Average path length per fill cluster
console.log(`\n========== AVG PATH LENGTH PER TOP-20 FILL CLUSTER ==========`);
console.log(`(low avg + high count = hatching strokes; large area + few = real polygon)`);
for (let i = 0; i < Math.min(20, fillSorted.length); i++) {
  const c = fillSorted[i];
  const avgPts = c.pointCounts.reduce((s, n) => s + n, 0) / c.count;
  console.log(`  ${c.rgb.join(",").padEnd(15)}  count=${String(c.count).padStart(5)}  avg_pts=${avgPts.toFixed(1).padStart(7)}`);
}

// P10 / median / P90 point-count for top 5
function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}
console.log(`\n========== POINT-COUNT DISTRIBUTION (TOP 5 FILL CLUSTERS) ==========`);
for (let i = 0; i < Math.min(5, fillSorted.length); i++) {
  const c = fillSorted[i];
  const p10 = quantile(c.pointCounts, 0.10);
  const p50 = quantile(c.pointCounts, 0.50);
  const p90 = quantile(c.pointCounts, 0.90);
  const max = Math.max(...c.pointCounts);
  const min = Math.min(...c.pointCounts);
  console.log(
    `  ${c.rgb.join(",").padEnd(15)} count=${String(c.count).padStart(5)} ` +
    `min=${String(min).padStart(4)} P10=${p10.toFixed(1).padStart(6)} ` +
    `P50=${p50.toFixed(1).padStart(6)} P90=${p90.toFixed(1).padStart(7)} max=${max}`
  );
}

// Cross-reference top fill clusters against legend swatches (Lab distance).
console.log(`\n========== TOP-20 FILL CLUSTERS vs LEGEND SWATCHES ==========`);
console.log(`(matched? = within that swatch's tolerance, alias-aware)`);
for (let i = 0; i < Math.min(20, fillSorted.length); i++) {
  const c = fillSorted[i];
  const m = nearestSwatch(c.rgb);
  const within = m.d <= m.tol;
  console.log(
    `  ${c.rgb.join(",").padEnd(15)} count=${String(c.count).padStart(5)}  ` +
    `nearest=${m.cat.padEnd(18)} dE=${m.d.toFixed(2).padStart(6)} tol=${String(m.tol).padStart(3)} ` +
    `${within ? "MATCH" : "MISS "} ${m.isAlias ? "(alias)" : ""}`
  );
}

// All clusters with > 20 paths that DON'T match any swatch within tolerance.
console.log(`\n========== UNMATCHED CLUSTERS (>20 paths, no swatch within tolerance) ==========`);
const unmatched = fillSorted.filter((c) => {
  if (c.count <= 20) return false;
  const m = nearestSwatch(c.rgb);
  return m.d > m.tol;
});
console.log(`Found ${unmatched.length} such clusters.`);
console.log(`rank | rgb            | count  | nearest swatch       | dE     | tol`);
for (let i = 0; i < unmatched.length; i++) {
  const c = unmatched[i];
  const m = nearestSwatch(c.rgb);
  console.log(
    `${String(i+1).padStart(3)}  | ${c.rgb.join(",").padEnd(13)} | ${String(c.count).padStart(5)}  | ${m.cat.padEnd(20)} | ${m.d.toFixed(2).padStart(6)} | ${m.tol}`
  );
}

if (issues.length > 0) {
  console.log(`\n========== PDFJS API ISSUES ENCOUNTERED ==========`);
  for (const m of issues) console.log("  - " + m);
} else {
  console.log(`\n========== PDFJS API ISSUES: none ==========`);
}
