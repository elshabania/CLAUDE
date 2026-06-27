/* Colour ramps: viridis (default) and a colour-blind-safe blue-yellow-red. */
"use strict";

// 12-stop viridis control points (sRGB 0-255)
const VIRIDIS = [
  [68,1,84],[72,36,117],[65,68,135],[53,95,141],[42,120,142],[33,145,140],
  [34,168,132],[68,191,112],[122,209,81],[189,223,38],[253,231,37],[253,231,37],
];
// colour-blind safe: blue -> yellow -> red
const CBSAFE = [
  [44,123,182],[88,159,196],[133,196,210],[178,223,224],[224,243,219],
  [254,224,144],[253,174,97],[244,109,67],[215,48,39],[178,24,43],
];

function lerp(ramp, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const seg = (ramp.length - 1) * t;
  const i = Math.min(ramp.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = ramp[i], b = ramp[i + 1];
  return [
    (a[0] + (b[0] - a[0]) * f) | 0,
    (a[1] + (b[1] - a[1]) * f) | 0,
    (a[2] + (b[2] - a[2]) * f) | 0,
  ];
}

export const Palette = {
  mode: "viridis",
  ramp(t) { return lerp(this.mode === "cbsafe" ? CBSAFE : VIRIDIS, t); },
  css(t) { const c = this.ramp(t); return `rgb(${c[0]},${c[1]},${c[2]})`; },
  // CSS gradient string for the legend swatch
  gradient() {
    const ramp = this.mode === "cbsafe" ? CBSAFE : VIRIDIS;
    return "linear-gradient(90deg," + ramp.map((c, i) =>
      `rgb(${c[0]},${c[1]},${c[2]}) ${(100 * i / (ramp.length - 1)).toFixed(0)}%`).join(",") + ")";
  },
};

// fixed facility colours for the default network view
export const FACILITY_COLOUR = [
  "#c8a24a", // freeway  (gold)
  "#b98a3a", // ramp
  "#5b86c4", // arterial
  "#3f6493", // collector
  "#6f7f5a", // rural
  "#3a4760", // local
  "#2b3650", // junction
];
export const FACILITY_WIDTH = [2.6, 1.6, 1.8, 1.3, 1.1, 0.7, 0.6];
