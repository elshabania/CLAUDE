#!/usr/bin/env node
/**
 * Legend sampler with body-palette alias derivation.
 *
 * 1. Render page 1 of the sample PDF at 200 dpi.
 * 2. Sample each row of the legend block for its primary swatch RGB.
 * 3. Build a histogram of fill colours in the drawing BODY (excluding
 *    the legend block and the white background).
 * 4. For each body palette colour, assign it as an alias of the nearest
 *    legend swatch under CIE-Lab distance (if within MAX_ALIAS_DELTA_E).
 * 5. Also add fixed swatches for site features that aren't in the
 *    printed legend (park / greenery, water, plot interior fills).
 * 6. Write the result to lib/legend-swatches.ts.
 *
 * Run with: node scripts/sample-legend.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const PDF_PATH = "public/ju_compressed_1.pdf";
const TMP_DIR = "/tmp/legend-sample";
const RENDER_DPI = 200;
const MAX_ALIAS_DELTA_E = 55;
const ROAD_TOLERANCE = 35;
const SITE_TOLERANCE = 22;
/** Categories that accept auto-aliasing from the body palette. Road
 *  classes don't get aliases because their pale variants overlap each
 *  other in Lab space (e.g. emergency_access vs tunnel_ramp), and a
 *  wrong alias gives the user a hard-to-fix misclassification. */
const ALIASABLE = new Set([
  "greenery",
  "water",
  "plot_fill",
  "building",
  "context",
]);

/** Legend rows: hand-located y-bands on the 200-dpi render. */
const LEGEND_ROWS = [
  { name: "road_row",          yTop: 3858, yBot: 3906 },
  { name: "road_plot",         yTop: 3922, yBot: 3970 },
  { name: "taxi_layby",        yTop: 3986, yBot: 4026 },
  { name: "shuttle_layby",     yTop: 4050, yBot: 4090 },
  { name: "emergency_access",  yTop: 4106, yBot: 4146 },
  { name: "apartment_access",  yTop: 4162, yBot: 4202 },
  { name: "plot_access",       yTop: 4226, yBot: 4266 },
  { name: "bridge",            yTop: 4282, yBot: 4322 },
  { name: "bridge_ramp",       yTop: 4346, yBot: 4386 },
  { name: "tunnel",            yTop: 4402, yBot: 4442 },
  { name: "tunnel_ramp",       yTop: 4458, yBot: 4498 },
  { name: "raised_crossing",   yTop: 4522, yBot: 4586 },
];

/** Site features not in the printed legend, seeded by the body histogram. */
const SITE_FEATURES = [
  { name: "greenery",  rgb: [230, 245, 234], tolerance: SITE_TOLERANCE },
  { name: "water",     rgb: [212, 237, 237], tolerance: SITE_TOLERANCE },
  { name: "plot_fill", rgb: [252, 250, 230], tolerance: SITE_TOLERANCE },
  // Building category covers both the cream legend swatch AND the dark
  // olive (152,152,0) used by some plot footprints in this drawing.
  { name: "building",  rgb: [253, 245, 217], tolerance: SITE_TOLERANCE,
    extraAliases: [[152, 152, 0]] },
  { name: "context",   rgb: [220, 220, 220], tolerance: 14 },
];

const SWATCH_X_START = 70;
const SWATCH_X_END = 200;

mkdirSync(TMP_DIR, { recursive: true });
if (!existsSync(`${TMP_DIR}/page-1.png`)) {
  execSync(
    `pdftoppm -r ${RENDER_DPI} -png -f 1 -l 1 ${PDF_PATH} ${TMP_DIR}/page`,
    { stdio: ["ignore", "ignore", "ignore"] }
  );
}

const img = sharp(`${TMP_DIR}/page-1.png`);
const meta = await img.metadata();
console.log(`Render: ${meta.width} x ${meta.height}`);
const raw = await img.raw().toBuffer({ resolveWithObject: true });
const { data, info } = raw;

function getPixel(x, y) {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

function dominantColor(x0, y0, x1, y1) {
  const bins = new Map();
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const [r, g, b] = getPixel(x, y);
      if (r > 245 && g > 245 && b > 245) continue;
      if (r < 16 && g < 16 && b < 16) continue;
      const key = `${r >> 3}_${g >> 3}_${b >> 3}`;
      const cur = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      cur.count += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
      bins.set(key, cur);
    }
  }
  let best = null;
  for (const v of bins.values()) {
    if (!best || v.count > best.count) best = v;
  }
  if (!best) return [128, 128, 128];
  return [
    Math.round(best.r / best.count),
    Math.round(best.g / best.count),
    Math.round(best.b / best.count),
  ];
}

/** Drawing-body palette: top-N dominant colours outside the legend block. */
function bodyPalette(topN) {
  const bins = new Map();
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  for (let y = 200; y < H - 200; y += 4) {
    for (let x = 200; x < W - 200; x += 4) {
      if (x < 1100 && y > 3700) continue;
      const i = (y * W + x) * C;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 248 && g > 248 && b > 248) continue;
      if (r < 16 && g < 16 && b < 16) continue;
      const key = (((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)).toString();
      const cur = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      cur.count += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
      bins.set(key, cur);
    }
  }
  const sorted = [...bins.values()].sort((a, b) => b.count - a.count);
  return sorted.slice(0, topN).map((v) => ({
    rgb: [
      Math.round(v.r / v.count),
      Math.round(v.g / v.count),
      Math.round(v.b / v.count),
    ],
    count: v.count,
  }));
}

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
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const swatches = [];
for (const { name, yTop, yBot } of LEGEND_ROWS) {
  const rgb = dominantColor(SWATCH_X_START, yTop + 4, SWATCH_X_END, yBot - 4);
  swatches.push({
    category: name,
    rgb,
    tolerance: ROAD_TOLERANCE,
    aliases: [],
  });
  console.log(`legend ${name.padEnd(20)} ${rgb.join(",")}`);
}
for (const f of SITE_FEATURES) {
  swatches.push({
    category: f.name,
    rgb: f.rgb,
    tolerance: f.tolerance,
    aliases: f.extraAliases ? [...f.extraAliases] : [],
  });
}

const palette = bodyPalette(50);
console.log(`\nBody palette: ${palette.length} colours`);
const swatchLab = swatches.map((s) => rgbToLab(s.rgb));
let aliasCount = 0;
for (const p of palette) {
  const lab = rgbToLab(p.rgb);
  // Only consider site-feature swatches as alias targets. This prevents
  // pale road colours (emergency_access / tunnel_ramp / etc.) from
  // poaching each other's colour space.
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < swatches.length; i += 1) {
    if (!ALIASABLE.has(swatches[i].category)) continue;
    const d = deltaE(lab, swatchLab[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestDist > MAX_ALIAS_DELTA_E) continue;
  const sw = swatches[bestIdx];
  const dup =
    sw.rgb[0] === p.rgb[0] && sw.rgb[1] === p.rgb[1] && sw.rgb[2] === p.rgb[2];
  if (dup) continue;
  if (
    sw.aliases.some(([r, g, b]) => r === p.rgb[0] && g === p.rgb[1] && b === p.rgb[2])
  ) {
    continue;
  }
  sw.aliases.push(p.rgb);
  aliasCount += 1;
}
console.log(`\nAssigned ${aliasCount} body aliases:`);
for (const sw of swatches) {
  console.log(
    `  ${sw.category.padEnd(20)} primary=${sw.rgb.join(",")}  aliases=${sw.aliases.length}`
  );
}

const tsBody =
  `// AUTOGENERATED by scripts/sample-legend.mjs - do not edit by hand.\n` +
  `// Run \`node scripts/sample-legend.mjs\` to regenerate from the sample PDF.\n\n` +
  `import type { RoadCategory } from "@/lib/road-detect";\n\n` +
  `export interface LegendSwatch {\n` +
  `  category: RoadCategory;\n` +
  `  rgb: [number, number, number];\n` +
  `  tolerance: number;\n` +
  `  aliases?: [number, number, number][];\n` +
  `}\n\n` +
  `export const LEGEND_SWATCHES: LegendSwatch[] = ${JSON.stringify(
    swatches.map((s) => ({
      ...s,
      aliases: s.aliases.length > 0 ? s.aliases : undefined,
    })),
    null,
    2
  )};\n`;

writeFileSync("lib/legend-swatches.ts", tsBody);
console.log("\nWrote lib/legend-swatches.ts");
