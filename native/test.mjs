// Equivalence test: the compiled C++ kernels must match the reference JS
// implementations exactly. Run: node native/test.mjs
import { readFileSync } from "node:fs";

const bytes = readFileSync(new URL("./geo.wasm", import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const ex = instance.exports;
const mem = () => new Uint8Array(ex.memory.buffer);

function wasmThin(mask, W, H, cap) {
  ex.reset();
  const N = W * H;
  const mp = ex.alloc(N) >>> 0;
  const lp = ex.alloc(N * 4) >>> 0;
  new Uint8Array(ex.memory.buffer, mp, N).set(mask);
  ex.thin_zhang_suen(mp, lp, W, H, cap);
  return new Uint8Array(ex.memory.buffer, mp, N).slice();
}

function wasmDist(keep, W, H) {
  ex.reset();
  const N = W * H;
  const kp = ex.alloc(N) >>> 0;
  const dp = ex.alloc(N * 4) >>> 0;
  new Uint8Array(ex.memory.buffer, kp, N).set(keep);
  ex.distance_l1(kp, dp, W, H);
  return new Int32Array(ex.memory.buffer, dp, N).slice();
}

// ---- Reference JS (copied from lib/road-skeleton.ts) --------------------
function jsThin(mask, W, H, cap) {
  mask = mask.slice();
  let changed = true,
    iter = 0;
  const toRemove = [];
  while (changed && iter++ < cap) {
    changed = false;
    for (const subIter of [0, 1]) {
      toRemove.length = 0;
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          if (mask[idx] !== 1) continue;
          const p2 = mask[idx - W], p3 = mask[idx - W + 1], p4 = mask[idx + 1],
            p5 = mask[idx + W + 1], p6 = mask[idx + W], p7 = mask[idx + W - 1],
            p8 = mask[idx - 1], p9 = mask[idx - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          let A = 0;
          if (p2 === 0 && p3 === 1) A++;
          if (p3 === 0 && p4 === 1) A++;
          if (p4 === 0 && p5 === 1) A++;
          if (p5 === 0 && p6 === 1) A++;
          if (p6 === 0 && p7 === 1) A++;
          if (p7 === 0 && p8 === 1) A++;
          if (p8 === 0 && p9 === 1) A++;
          if (p9 === 0 && p2 === 1) A++;
          if (A !== 1) continue;
          if (subIter === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toRemove.push(idx);
        }
      for (const idx of toRemove) {
        mask[idx] = 0;
        changed = true;
      }
    }
  }
  return mask;
}

function jsDist(keep, W, H) {
  const INF = W + H + 1;
  const N = W * H;
  const dist = new Int32Array(N);
  for (let i = 0; i < N; i++) dist[i] = keep[i] === 1 ? INF : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (keep[idx] === 0) continue;
      let d = dist[idx];
      if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
      if (y > 0) d = Math.min(d, dist[idx - W] + 1);
      dist[idx] = d;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const idx = y * W + x;
      if (keep[idx] === 0) continue;
      let d = dist[idx];
      if (x < W - 1) d = Math.min(d, dist[idx + 1] + 1);
      if (y < H - 1) d = Math.min(d, dist[idx + W] + 1);
      dist[idx] = d;
    }
  return dist;
}

// ---- Run ----------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let failures = 0;
for (let trial = 0; trial < 12; trial++) {
  const r = rng(1000 + trial);
  const W = 30 + Math.floor(r() * 200);
  const H = 30 + Math.floor(r() * 200);
  const N = W * H;
  const mask = new Uint8Array(N);
  // Blobs of 1s so thinning has structure to chew on.
  for (let b = 0; b < 8; b++) {
    const cx = Math.floor(r() * W), cy = Math.floor(r() * H);
    const rad = 3 + Math.floor(r() * 20);
    for (let y = Math.max(0, cy - rad); y < Math.min(H, cy + rad); y++)
      for (let x = Math.max(0, cx - rad); x < Math.min(W, cx + rad); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad) mask[y * W + x] = 1;
  }

  const a = wasmThin(mask, W, H, 80);
  const b = jsThin(mask, W, H, 80);
  let thinDiff = 0;
  for (let i = 0; i < N; i++) if (a[i] !== b[i]) thinDiff++;

  const dc = wasmDist(mask, W, H);
  const dj = jsDist(mask, W, H);
  let distDiff = 0;
  for (let i = 0; i < N; i++) if (dc[i] !== dj[i]) distDiff++;

  const ok = thinDiff === 0 && distDiff === 0;
  if (!ok) failures++;
  console.log(
    `trial ${trial} ${W}x${H}: thin diff=${thinDiff} dist diff=${distDiff} ${ok ? "OK" : "FAIL"}`
  );
}
console.log(failures === 0 ? "\nALL EQUIVALENT ✓" : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
