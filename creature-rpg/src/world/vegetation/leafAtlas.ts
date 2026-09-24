// Procedural foliage atlas (original, canvas-drawn once per session; ~15 ms). 4×2 cells of 256 px:
//  0 broadleaf cluster   1 blossom cluster   2 pine sprig   3 willow strands
//  4 snowy pine sprig    5 flower heads (2×2 types)   6 fern / bush leaves   7 dry grass tuft
// Colour and alpha are drawn on separate canvases and combined into a DataTexture with *straight* alpha,
// so mip-mapped, alpha-tested edges keep the leaf colour instead of fringing dark.
import * as THREE from 'three';

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
export const LEAF = { broad: 0, blossom: 1, pine: 2, willow: 3, snowpine: 4, flowers: 5, fern: 6, drygrass: 7 } as const;
const CELL = 256;

let cached: { data: Uint8Array; w: number; h: number } | null = null;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}

type Ctx = CanvasRenderingContext2D;

function leafShape(c: Ctx, x: number, y: number, len: number, wid: number, ang: number) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid, len, 0);
  c.bezierCurveTo(len * 0.75, wid, len * 0.25, wid, 0, 0);
  c.fill();
  c.restore();
}

function draw(col: Ctx, alp: Ctx) {
  const both = (fn: (c: Ctx, isAlpha: boolean) => void) => {
    fn(col, false);
    fn(alp, true);
  };
  const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;
  // ---- 0 broadleaf cluster / 6 fern-bush ----
  for (const [cell, seed, n, lenK] of [[0, 11, 70, 1], [6, 66, 90, 0.8]] as const) {
    const r = rng(seed);
    const ox = (cell % 4) * CELL, oy = Math.floor(cell / 4) * CELL;
    // twigs
    both((c, a) => {
      c.strokeStyle = a ? '#fff' : '#4a3a2a';
      c.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(ox + CELL / 2, oy + CELL * 0.95);
        c.quadraticCurveTo(ox + CELL / 2 + (r() - 0.5) * 60, oy + CELL * 0.6, ox + CELL * (0.15 + r() * 0.7), oy + CELL * (0.15 + r() * 0.45));
        c.stroke();
      }
    });
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * CELL * 0.4;
      const x = ox + CELL / 2 + Math.cos(a) * d, y = oy + CELL / 2 + Math.sin(a) * d * 0.9;
      const len = (22 + r() * 18) * lenK, wid = len * (0.32 + r() * 0.1), ang = r() * Math.PI * 2;
      const l = 22 + r() * 22 + (1 - d / (CELL * 0.4)) * 6;
      col.fillStyle = hsl(85 + r() * 30, 38 + r() * 20, l);
      alp.fillStyle = '#fff';
      leafShape(col, x, y, len, wid, ang);
      leafShape(alp, x, y, len, wid, ang);
      // midrib highlight
      col.strokeStyle = hsl(80, 30, l + 10);
      col.lineWidth = 1;
      col.beginPath();
      col.moveTo(x, y);
      col.lineTo(x + Math.cos(ang) * len * 0.9, y + Math.sin(ang) * len * 0.9);
      col.stroke();
    }
  }
  // ---- 1 blossom cluster ----
  {
    const r = rng(21);
    const ox = CELL, oy = 0;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * CELL * 0.4;
      const x = ox + CELL / 2 + Math.cos(a) * d, y = oy + CELL / 2 + Math.sin(a) * d;
      col.fillStyle = hsl(95 + r() * 20, 35, 26 + r() * 10);
      alp.fillStyle = '#fff';
      const len = 20 + r() * 10, ang = r() * 6.28;
      leafShape(col, x, y, len, len * 0.35, ang);
      leafShape(alp, x, y, len, len * 0.35, ang);
    }
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * CELL * 0.42;
      const x = ox + CELL / 2 + Math.cos(a) * d, y = oy + CELL / 2 + Math.sin(a) * d;
      const pr = 5 + r() * 4;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + r();
        col.fillStyle = hsl(340 + r() * 15, 55 + r() * 25, 78 + r() * 12);
        alp.fillStyle = '#fff';
        for (const c of [col, alp]) {
          c.beginPath();
          c.ellipse(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr, pr * 0.8, pr * 0.55, pa, 0, Math.PI * 2);
          c.fill();
        }
      }
      col.fillStyle = hsl(45, 80, 55);
      col.beginPath();
      col.arc(x, y, 2, 0, Math.PI * 2);
      col.fill();
    }
  }
  // ---- 2 pine sprig / 4 snowy pine sprig (branch along +x of the cell, needles both sides) ----
  for (const [cell, snow] of [[2, false], [4, true]] as const) {
    const r = rng(31 + (snow ? 7 : 0));
    const ox = (cell % 4) * CELL, oy = Math.floor(cell / 4) * CELL;
    const midY = oy + CELL / 2;
    both((c, a) => {
      c.strokeStyle = a ? '#fff' : '#4b3726';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(ox + 4, midY);
      c.lineTo(ox + CELL - 8, midY + 4);
      c.stroke();
    });
    for (let s = 0; s < 7; s++) {
      // side twigs
      const sx = ox + 20 + s * 32, sy = midY;
      for (const side of [-1, 1]) {
        const ex = sx + 40 + r() * 20, ey = sy + side * (55 + r() * 35) * (1 - s / 9);
        for (let k = 0; k < 16; k++) {
          const t = k / 16;
          const px = sx + (ex - sx) * t, py = sy + (ey - sy) * t;
          for (const nside of [-1, 1]) {
            const na = Math.atan2(ey - sy, ex - sx) + nside * (0.9 + r() * 0.3);
            const nl = 14 + r() * 8;
            col.strokeStyle = hsl(140 + r() * 20, 30 + r() * 15, 18 + r() * 12);
            alp.strokeStyle = '#fff';
            for (const c of [col, alp]) {
              c.lineWidth = 2.2;
              c.beginPath();
              c.moveTo(px, py);
              c.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
              c.stroke();
            }
          }
        }
      }
    }
    if (snow) {
      // snow clumps on the upper half of the sprig
      for (let i = 0; i < 70; i++) {
        const x = ox + 10 + r() * (CELL - 20), y = oy + CELL * (0.18 + r() * 0.34);
        const rr = 5 + r() * 9;
        col.fillStyle = hsl(205, 30, 88 + r() * 10);
        alp.fillStyle = '#fff';
        for (const c of [col, alp]) {
          c.beginPath();
          c.ellipse(x, y, rr * 1.4, rr * 0.8, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }
  // ---- 3 willow strands: sparse hanging strings of narrow leaves, ragged hem ----
  {
    const r = rng(41);
    const ox = 3 * CELL, oy = 0;
    for (let s = 0; s < 9; s++) {
      const x0 = ox + 14 + (s / 8) * (CELL - 28) + (r() - 0.5) * 14;
      const sway = (r() - 0.5) * 24;
      const len = 0.45 + r() * 0.55;
      col.strokeStyle = '#5a5a2e';
      alp.strokeStyle = '#fff';
      for (const c of [col, alp]) {
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x0, oy);
        c.quadraticCurveTo(x0 + sway, oy + CELL * len * 0.5, x0 + sway * 0.6, oy + CELL * len);
        c.stroke();
      }
      const nl = Math.round(26 * len);
      for (let k = 0; k < nl; k++) {
        const t = k / nl;
        const x = x0 + sway * t * (1.4 - t * 0.8), y = oy + t * CELL * len;
        const side = k % 2 ? 1 : -1;
        col.fillStyle = hsl(70 + r() * 20, 35 + r() * 15, 32 + r() * 18);
        alp.fillStyle = '#fff';
        const ang = Math.PI / 2 + side * (0.3 + r() * 0.25);
        const ll = 16 + r() * 8;
        leafShape(col, x, y, ll, 2.6, ang);
        leafShape(alp, x, y, ll, 2.6, ang);
      }
    }
  }
  // ---- 5 flower heads: daisy, poppy, bluebell-ish, clover-ish (tint by vertex colour: drawn light) ----
  {
    const ox = CELL, oy = CELL, h = CELL / 2;
    const r = rng(51);
    const q = (i: number) => [ox + (i % 2) * h + h / 2, oy + Math.floor(i / 2) * h + h / 2] as const;
    // daisy
    {
      const [cx, cy] = q(0);
      for (let p = 0; p < 16; p++) {
        const a = (p / 16) * Math.PI * 2;
        col.fillStyle = hsl(50, 20, 92 + r() * 6);
        alp.fillStyle = '#fff';
        for (const c of [col, alp]) {
          c.beginPath();
          c.ellipse(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 22, 7, a, 0, Math.PI * 2);
          c.fill();
        }
      }
      col.fillStyle = hsl(45, 90, 50);
      col.beginPath();
      col.arc(cx, cy, 14, 0, Math.PI * 2);
      col.fill();
    }
    // poppy / cup (drawn pale warm: tinted by accent)
    {
      const [cx, cy] = q(1);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        col.fillStyle = hsl(20, 30, 86 + r() * 8);
        alp.fillStyle = '#fff';
        for (const c of [col, alp]) {
          c.beginPath();
          c.ellipse(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, 30, 24, a, 0, Math.PI * 2);
          c.fill();
        }
      }
      col.fillStyle = '#2a2320';
      col.beginPath();
      col.arc(cx, cy, 10, 0, Math.PI * 2);
      col.fill();
    }
    // bell cluster
    {
      const [cx, cy] = q(2);
      for (let b = 0; b < 7; b++) {
        const x = cx + (r() - 0.5) * 70, y = cy + (r() - 0.5) * 70;
        col.fillStyle = hsl(240, 25, 85 + r() * 10);
        alp.fillStyle = '#fff';
        for (const c of [col, alp]) {
          c.beginPath();
          c.ellipse(x, y, 13, 16, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // small star flowers
    {
      const [cx, cy] = q(3);
      for (let f = 0; f < 9; f++) {
        const x = cx + (r() - 0.5) * 80, y = cy + (r() - 0.5) * 80;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          col.fillStyle = hsl(0, 0, 90 + r() * 8);
          alp.fillStyle = '#fff';
          for (const c of [col, alp]) {
            c.beginPath();
            c.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6, 3, a, 0, Math.PI * 2);
            c.fill();
          }
        }
        col.fillStyle = hsl(50, 80, 55);
        col.beginPath();
        col.arc(x, y, 3, 0, Math.PI * 2);
        col.fill();
      }
    }
  }
  // ---- 7 dry grass tuft (card) ----
  {
    const r = rng(71);
    const ox = 3 * CELL, oy = CELL;
    for (let i = 0; i < 70; i++) {
      const x0 = ox + CELL / 2 + (r() - 0.5) * 60, y0 = oy + CELL;
      const x1 = x0 + (r() - 0.5) * 200, y1 = oy + 10 + r() * 90;
      col.strokeStyle = hsl(60 + r() * 30, 30 + r() * 20, 30 + r() * 25);
      alp.strokeStyle = '#fff';
      for (const c of [col, alp]) {
        c.lineWidth = 2 + r() * 2;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 30, (y0 + y1) / 2, x1, y1);
        c.stroke();
      }
    }
  }
}

function generate(): { data: Uint8Array; w: number; h: number } {
  const w = CELL * ATLAS_COLS, h = CELL * ATLAS_ROWS;
  const data = new Uint8Array(w * h * 4);
  if (typeof document === 'undefined') {
    data.fill(255);
    return { data, w, h };
  }
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv.getContext('2d', { willReadFrequently: true })!;
  };
  const col = mk(), alp = mk();
  // colour canvas background = per-cell mean foliage colour (bleeds into transparent texels)
  const bgs = ['#3f5a28', '#c89aa6', '#2c4a34', '#566a30', '#9fb0b8', '#d8d0c0', '#3f5a28', '#8a8050'];
  bgs.forEach((b, i) => {
    col.fillStyle = b;
    col.fillRect((i % 4) * CELL, Math.floor(i / 4) * CELL, CELL, CELL);
  });
  alp.fillStyle = '#000';
  alp.fillRect(0, 0, w, h);
  draw(col, alp);
  const c = col.getImageData(0, 0, w, h).data, a = alp.getImageData(0, 0, w, h).data;
  // canvas rows are top-down; flip so v = 0 is the bottom (three's DataTexture has flipY = false)
  for (let y = 0; y < h; y++) {
    const src = y * w * 4, dst = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      data[dst + x] = c[src + x];
      data[dst + x + 1] = c[src + x + 1];
      data[dst + x + 2] = c[src + x + 2];
      data[dst + x + 3] = a[src + x];
    }
  }
  return { data, w, h };
}

/** A fresh texture per canvas (the pixel data is generated once per session and shared). */
export function makeLeafAtlas(): THREE.DataTexture {
  if (!cached) cached = generate();
  const t = new THREE.DataTexture(cached.data, cached.w, cached.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** UV rect of an atlas cell (u0, v0, u1, v1) with v measured from the bottom. */
export function cellUV(cell: number, sub?: number): [number, number, number, number] {
  const cx = cell % ATLAS_COLS, cy = Math.floor(cell / ATLAS_COLS);
  let u0 = cx / ATLAS_COLS, u1 = (cx + 1) / ATLAS_COLS;
  // row 0 (top of the canvas) ends up at the top of the texture after the flip
  let v1 = 1 - cy / ATLAS_ROWS, v0 = 1 - (cy + 1) / ATLAS_ROWS;
  if (sub != null) {
    const hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
    const sx = sub % 2, sy = Math.floor(sub / 2);
    u0 += sx * hu;
    u1 = u0 + hu;
    v1 -= sy * hv;
    v0 = v1 - hv;
  }
  const e = 0.004;
  return [u0 + e, v0 + e, u1 - e, v1 - e];
}
