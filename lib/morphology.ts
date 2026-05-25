// Binary morphological close on a row-major mask (0 = empty, 1 = set), used to
// turn a hatch-filled region (many thin tiles/lines with gaps) into one solid
// area. Close = dilate then erode by the same radius: it bridges gaps up to
// ~2*radius wide while keeping the region's overall size, so hatched roads
// render as solid corridors instead of patchy stripes.
//
// Separable box min/max (horizontal then vertical pass), O(N * radius).

function boxPass(
  src: Uint8Array,
  dst: Uint8Array,
  W: number,
  H: number,
  r: number,
  takeMax: boolean
): void {
  const tmp = new Uint8Array(W * H);
  // Horizontal.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let v = takeMax ? 0 : 1;
      const lo = x - r < 0 ? 0 : x - r;
      const hi = x + r >= W ? W - 1 : x + r;
      for (let xx = lo; xx <= hi; xx++) {
        const s = src[row + xx];
        if (takeMax ? s > v : s < v) v = s;
      }
      tmp[row + x] = v;
    }
  }
  // Vertical.
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = takeMax ? 0 : 1;
      const lo = y - r < 0 ? 0 : y - r;
      const hi = y + r >= H ? H - 1 : y + r;
      for (let yy = lo; yy <= hi; yy++) {
        const s = tmp[yy * W + x];
        if (takeMax ? s > v : s < v) v = s;
      }
      dst[y * W + x] = v;
    }
  }
}

/** Morphological close (dilate r, then erode r) in place-ish; returns a new
 *  mask. radius <= 0 returns a copy unchanged. */
export function closeMask(mask: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const dil = new Uint8Array(W * H);
  boxPass(mask, dil, W, H, radius, true); // dilate
  const out = new Uint8Array(W * H);
  boxPass(dil, out, W, H, radius, false); // erode
  return out;
}
