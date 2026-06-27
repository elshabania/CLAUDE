/* Canvas map renderer: pan/zoom, level-of-detail, link & zone colouring. */
"use strict";
import { Palette, FACILITY_COLOUR, FACILITY_WIDTH } from "./palette.js";

const NBUCKET = 28;

export class Renderer {
  constructor(canvas, model) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.m = model;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.view = { cx: 0, cy: 0, scale: 1 };
    this.fitScale = 1;

    // link colouring state
    this.linkVals = null;          // Float32Array(NL) or null -> default class view
    this.linkBucket = null;        // Uint8Array(NL)
    this.linkWidth = null;         // Float32Array(NL)
    this.linkLegend = "";
    this.filterClasses = null;     // Set<int> | null
    this.highlight = null;         // Set<int> | null

    // zone colouring state
    this.zoneVals = null;          // Float32Array(Z+1)
    this.zoneBucket = null;        // Int16Array(Z+1)  (-1 = skip)
    this.zoneLegend = "";

    this.resize();
    window.addEventListener("resize", () => { this.resize(); this.draw(); });
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  fit(bbox) {
    const [x0, y0, x1, y1] = bbox;
    const sx = this.W / (x1 - x0), sy = this.H / (y1 - y0);
    this.fitScale = Math.min(sx, sy) * 0.92;
    this.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: this.fitScale };
  }

  sx(x) { return (x - this.view.cx) * this.view.scale + this.W / 2; }
  sy(y) { return this.H / 2 - (y - this.view.cy) * this.view.scale; }
  wx(px) { return (px - this.W / 2) / this.view.scale + this.view.cx; }
  wy(py) { return (this.H / 2 - py) / this.view.scale + this.view.cy; }

  panBy(dx, dy) {
    this.view.cx -= dx / this.view.scale;
    this.view.cy += dy / this.view.scale;
  }
  zoomAt(px, py, factor) {
    const wx = this.wx(px), wy = this.wy(py);
    this.view.scale *= factor;
    this.view.scale = Math.max(this.fitScale * 0.3, Math.min(this.fitScale * 400, this.view.scale));
    this.view.cx = wx - (px - this.W / 2) / this.view.scale;
    this.view.cy = wy + (py - this.H / 2) / this.view.scale;
  }
  zoomToBBox(bbox, pad = 0.18) {
    const [x0, y0, x1, y1] = bbox;
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const sx = this.W / w, sy = this.H / h;
    this.view.scale = Math.min(sx, sy) * (1 - pad);
    this.view.scale = Math.max(this.fitScale * 0.3, Math.min(this.fitScale * 400, this.view.scale));
    this.view.cx = (x0 + x1) / 2; this.view.cy = (y0 + y1) / 2;
  }
  zoomToPoint(x, y, scale) {
    this.view.cx = x; this.view.cy = y;
    if (scale) this.view.scale = scale;
  }

  // ---- colouring setters ----
  // values: Float32Array(NL); opts {widthByVal, legend, sqrtWidth}
  setLinkValues(values, legend, opts = {}) {
    this.linkVals = values; this.linkLegend = legend;
    const NL = this.m.NL;
    const bucket = new Uint8Array(NL);
    const width = new Float32Array(NL);
    // percentile mapping over positive values
    const pos = [];
    let vmax = 0;
    for (let l = 0; l < NL; l++) { const v = values[l]; if (v > 0) { pos.push(v); if (v > vmax) vmax = v; } }
    pos.sort((a, b) => a - b);
    const pn = pos.length;
    const rank = (v) => {
      let lo = 0, hi = pn;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pos[mid] < v) lo = mid + 1; else hi = mid; }
      return pn > 1 ? lo / (pn - 1) : 0;
    };
    for (let l = 0; l < NL; l++) {
      const v = values[l];
      if (v <= 0) { bucket[l] = 255; width[l] = 0.8; continue; } // muted grey marker
      const t = rank(v);
      bucket[l] = Math.min(NBUCKET - 1, (t * NBUCKET) | 0);
      width[l] = opts.sqrtWidth ? 0.8 + 2.8 * Math.sqrt(v / (vmax || 1)) : FACILITY_WIDTH[this.m.link.cls[l]];
    }
    this.linkBucket = bucket; this.linkWidth = width;
  }
  clearLinkValues() { this.linkVals = null; this.linkBucket = null; this.linkLegend = ""; }

  setZoneValues(values, legend) {
    this.zoneVals = values; this.zoneLegend = legend;
    const Z = this.m.Z;
    const bucket = new Int16Array(Z + 1).fill(-1);
    const pos = [];
    for (let z = 1; z <= Z; z++) { const v = values[z]; if (Number.isFinite(v)) pos.push(v); }
    pos.sort((a, b) => a - b);
    const pn = pos.length;
    const rank = (v) => {
      let lo = 0, hi = pn;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pos[mid] < v) lo = mid + 1; else hi = mid; }
      return pn > 1 ? lo / (pn - 1) : 0;
    };
    for (let z = 1; z <= Z; z++) {
      const v = values[z];
      if (!Number.isFinite(v)) continue;
      bucket[z] = Math.min(NBUCKET - 1, (rank(v) * NBUCKET) | 0);
    }
    this.zoneBucket = bucket;
  }
  clearZoneValues() { this.zoneVals = null; this.zoneBucket = null; this.zoneLegend = ""; }

  setFilter(classes) { this.filterClasses = classes; }
  setHighlight(set) { this.highlight = set; }

  // which classes are visible at the current zoom (LOD), unless filtered
  visibleClasses() {
    if (this.filterClasses) return this.filterClasses;
    const r = this.view.scale / this.fitScale;
    const s = new Set([0, 1, 2]);               // freeway, ramp, arterial always
    if (r >= 2.2) { s.add(3); s.add(4); }       // collector, rural
    if (r >= 5.0) { s.add(5); s.add(6); }       // local, junction
    return s;
  }

  strokeLink(ctx, l) {
    const g = this.m.link.geomXY, off = this.m.link.geomOff;
    let s = off[l] * 2, e = off[l + 1] * 2;
    ctx.moveTo(this.sx(g[s]), this.sy(g[s + 1]));
    for (let i = s + 2; i < e; i += 2) ctx.lineTo(this.sx(g[i]), this.sy(g[i + 1]));
  }

  inView(l) {
    const m = this.m.link;
    return !(m.bMaxX[l] < this.view.cx - this.W / 2 / this.view.scale ||
             m.bMinX[l] > this.view.cx + this.W / 2 / this.view.scale ||
             m.bMaxY[l] < this.view.cy - this.H / 2 / this.view.scale ||
             m.bMinY[l] > this.view.cy + this.H / 2 / this.view.scale);
  }

  draw() {
    const ctx = this.ctx, m = this.m;
    ctx.clearRect(0, 0, this.W, this.H);
    const vis = this.visibleClasses();

    ctx.lineCap = "round"; ctx.lineJoin = "round";

    if (this.linkBucket) {
      // grey (unused) first
      ctx.strokeStyle = "rgba(120,134,160,.28)"; ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let l = 0; l < m.NL; l++) {
        if (this.linkBucket[l] !== 255 || !vis.has(m.link.cls[l]) || !this.inView(l)) continue;
        this.strokeLink(ctx, l);
      }
      ctx.stroke();
      // coloured buckets
      for (let b = 0; b < NBUCKET; b++) {
        const c = Palette.ramp(b / (NBUCKET - 1));
        ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.lineWidth = 0.8 + 2.6 * (b / (NBUCKET - 1));
        ctx.beginPath();
        let any = false;
        for (let l = 0; l < m.NL; l++) {
          if (this.linkBucket[l] !== b || !vis.has(m.link.cls[l]) || !this.inView(l)) continue;
          this.strokeLink(ctx, l); any = true;
        }
        if (any) ctx.stroke();
      }
    } else {
      // default class view
      for (let cls = 6; cls >= 0; cls--) {
        if (!vis.has(cls)) continue;
        ctx.strokeStyle = FACILITY_COLOUR[cls];
        ctx.lineWidth = FACILITY_WIDTH[cls];
        ctx.beginPath();
        let any = false;
        for (let l = 0; l < m.NL; l++) {
          if (m.link.cls[l] !== cls || !this.inView(l)) continue;
          this.strokeLink(ctx, l); any = true;
        }
        if (any) ctx.stroke();
      }
    }

    // highlight set
    if (this.highlight && this.highlight.size) {
      ctx.strokeStyle = Palette.mode === "cbsafe" ? "#ffd24a" : "#7df9ff";
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      for (const l of this.highlight) this.strokeLink(ctx, l);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // zones
    if (this.zoneBucket) {
      const Z = m.Z, xy = m.zone.xy;
      for (let z = 1; z <= Z; z++) {
        const b = this.zoneBucket[z];
        if (b < 0) continue;
        const x = xy[2 * (z - 1)], y = xy[2 * (z - 1) + 1];
        const px = this.sx(x), py = this.sy(y);
        if (px < -5 || px > this.W + 5 || py < -5 || py > this.H + 5) continue;
        const c = Palette.ramp(b / (NBUCKET - 1));
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 6.283); ctx.fill();
      }
    }
  }
}
