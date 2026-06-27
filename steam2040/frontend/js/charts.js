/* Palettes + small chart helpers (spec section 4). */
const STEAM = (window.STEAM = window.STEAM || {});

// Viridis approximation (sampled control points), for volume colouring.
const VIRIDIS = [
  [68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],
  [31,158,137],[53,183,121],[110,206,88],[181,222,43],[253,231,37]
];
// Colour-blind-safe sequential (blue->orange).
const CIVIDIS = [
  [0,32,76],[0,42,102],[40,70,120],[90,100,120],[140,130,120],
  [180,160,105],[210,190,80],[240,225,80]
];

function lerpRamp(ramp, t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (ramp.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = ramp[i], b = ramp[Math.min(i + 1, ramp.length - 1)];
  return [Math.round(a[0] + (b[0]-a[0])*f),
          Math.round(a[1] + (b[1]-a[1])*f),
          Math.round(a[2] + (b[2]-a[2])*f)];
}

// LOS A..F green->red (and colour-blind variant).
const LOS_COLORS = ['#2bb673','#7ac143','#c8c83c','#e8a13c','#e8643c','#c0392b'];
const LOS_CB     = ['#2166ac','#67a9cf','#d1e5f0','#fddbc7','#ef8a62','#b2182b'];

STEAM.palette = {
  cbSafe: false,
  volume(t) { const r = lerpRamp(this.cbSafe ? CIVIDIS : VIRIDIS, t); return `rgb(${r[0]},${r[1]},${r[2]})`; },
  los(band) { return (this.cbSafe ? LOS_CB : LOS_COLORS)[Math.max(0, Math.min(5, band))]; },
  // diverging green(down)/red(up) for scenario diffs, or blue/orange cb-safe.
  diff(v) {
    const t = Math.max(-1, Math.min(1, v));
    if (this.cbSafe) return t < 0 ? `rgba(33,102,172,${Math.abs(t)})` : `rgba(230,140,40,${t})`;
    return t < 0 ? `rgba(54,196,107,${Math.abs(t)})` : `rgba(224,82,74,${t})`;
  }
};

// Draw a line chart (gap history) into a canvas.
STEAM.sparkline = function (canvas, values, opts = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const muted = css.getPropertyValue('--muted').trim();
  ctx.fillStyle = muted; ctx.font = '10px system-ui';
  ctx.fillText(opts.title || 'convergence (rel. gap)', 8, 14);
  if (!values || values.length < 1) return;
  const pad = 8, top = 20;
  const max = Math.max(...values, 1e-6), min = Math.min(...values, 0);
  const sx = (w - pad * 2) / Math.max(1, values.length - 1);
  const sy = (h - top - pad) / (max - min || 1);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + i * sx, y = h - pad - (v - min) * sy;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
};

// Draw a histogram (v/c distribution).
STEAM.histogram = function (canvas, counts, edges) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!counts || !counts.length) return;
  const max = Math.max(...counts, 1), bw = (w - 8) / counts.length;
  counts.forEach((c, i) => {
    const bh = (c / max) * (h - 18);
    const t = i / counts.length;
    ctx.fillStyle = STEAM.palette.volume(t);
    ctx.fillRect(4 + i * bw, h - 14 - bh, bw - 1.5, bh);
  });
};
