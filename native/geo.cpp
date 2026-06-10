// Compiled C++ compute core for road-network extraction.
//
// Built straight to WebAssembly with clang (`--target=wasm32`, no Emscripten)
// and loaded by the app inside the Electron/desktop shell. This holds the hot
// pixel kernels that used to freeze the UI as plain JavaScript - they run here
// as native compiled code instead.
//
// Memory model: a simple bump allocator over the wasm heap. The JS side calls
// reset() then alloc() to carve scratch buffers, copies pixel data in, runs a
// kernel, and copies results back.

typedef unsigned char u8;

extern u8 __heap_base;
static unsigned long g_bump = 0;

static inline unsigned long align8(unsigned long p) { return (p + 7UL) & ~7UL; }

// Freestanding intrinsics the optimizer may emit calls to (no libc here).
// no_builtin stops clang from turning these loops into calls to themselves.
extern "C" __attribute__((no_builtin("memset")))
void* memset(void* dst, int v, unsigned long n) {
  u8* p = (u8*)dst;
  for (unsigned long i = 0; i < n; i++) p[i] = (u8)v;
  return dst;
}
extern "C" __attribute__((no_builtin("memcpy")))
void* memcpy(void* dst, const void* src, unsigned long n) {
  u8* d = (u8*)dst;
  const u8* s = (const u8*)src;
  for (unsigned long i = 0; i < n; i++) d[i] = s[i];
  return dst;
}

extern "C" {

void __attribute__((export_name("reset"))) geo_reset() {
  g_bump = align8((unsigned long)&__heap_base);
}

u8* __attribute__((export_name("alloc"))) geo_alloc(unsigned long n) {
  if (g_bump == 0) g_bump = align8((unsigned long)&__heap_base);
  unsigned long p = align8(g_bump);
  g_bump = p + n;
  unsigned long need = (g_bump + 65535UL) / 65536UL;       // pages required
  unsigned long have = (unsigned long)__builtin_wasm_memory_size(0);
  if (need > have) __builtin_wasm_memory_grow(0, need - have);
  return (u8*)p;
}

// Zhang-Suen thinning to a 1px skeleton, in place on `mask` (values 0/1).
// `list` is caller-provided int32 scratch of size W*H, used to collect the
// pixels removed in each sub-iteration. Bit-for-bit equivalent to the
// reference JavaScript implementation in lib/road-skeleton.ts.
void __attribute__((export_name("thin_zhang_suen")))
thin_zhang_suen(u8* mask, int* list, int W, int H, int cap) {
  int changed = 1;
  int iter = 0;
  while (changed && iter++ < cap) {
    changed = 0;
    for (int subIter = 0; subIter < 2; subIter++) {
      int cnt = 0;
      // Pass 1: collect removable pixels (without mutating, so neighbour
      // reads within this sub-iteration see the pre-removal state).
      for (int y = 1; y < H - 1; y++) {
        const int baseRow = y * W;
        const u8* row = mask + baseRow;
        const u8* up = row - W;
        const u8* dn = row + W;
        for (int x = 1; x < W - 1; x++) {
          if (row[x] != 1) continue;
          const u8 p2 = up[x];
          const u8 p3 = up[x + 1];
          const u8 p4 = row[x + 1];
          const u8 p5 = dn[x + 1];
          const u8 p6 = dn[x];
          const u8 p7 = dn[x - 1];
          const u8 p8 = row[x - 1];
          const u8 p9 = up[x - 1];
          const int B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          int A = 0;
          A += (p2 == 0 && p3 == 1);
          A += (p3 == 0 && p4 == 1);
          A += (p4 == 0 && p5 == 1);
          A += (p5 == 0 && p6 == 1);
          A += (p6 == 0 && p7 == 1);
          A += (p7 == 0 && p8 == 1);
          A += (p8 == 0 && p9 == 1);
          A += (p9 == 0 && p2 == 1);
          if (A != 1) continue;
          if (subIter == 0) {
            if (p2 * p4 * p6 != 0) continue;
            if (p4 * p6 * p8 != 0) continue;
          } else {
            if (p2 * p4 * p8 != 0) continue;
            if (p2 * p6 * p8 != 0) continue;
          }
          list[cnt++] = baseRow + x;
        }
      }
      // Pass 2: apply removals (sparse).
      for (int k = 0; k < cnt; k++) mask[list[k]] = 0;
      if (cnt) changed = 1;
    }
  }
}

// Two-pass L1 (Manhattan) distance transform. `keep` is the binary mask
// (0/1); `dist` (int32, size W*H) receives the distance to the nearest 0.
void __attribute__((export_name("distance_l1")))
distance_l1(const u8* keep, int* dist, int W, int H) {
  const int INF = W + H + 1;
  const int N = W * H;
  for (int i = 0; i < N; i++) dist[i] = keep[i] ? INF : 0;
  for (int y = 0; y < H; y++) {
    for (int x = 0; x < W; x++) {
      const int idx = y * W + x;
      if (!keep[idx]) continue;
      int d = dist[idx];
      if (x > 0 && dist[idx - 1] + 1 < d) d = dist[idx - 1] + 1;
      if (y > 0 && dist[idx - W] + 1 < d) d = dist[idx - W] + 1;
      dist[idx] = d;
    }
  }
  for (int y = H - 1; y >= 0; y--) {
    for (int x = W - 1; x >= 0; x--) {
      const int idx = y * W + x;
      if (!keep[idx]) continue;
      int d = dist[idx];
      if (x < W - 1 && dist[idx + 1] + 1 < d) d = dist[idx + 1] + 1;
      if (y < H - 1 && dist[idx + W] + 1 < d) d = dist[idx + W] + 1;
      dist[idx] = d;
    }
  }
}

// 4-connected connected-component labelling (BFS flood fill), matching the
// reference JS in lib/road-skeleton.ts exactly: raster scan order, neighbour
// order left/right/up/down, labels starting at 1 (0 = non-mask). `labels`
// (int32, size W*H) and `queue` (int32, size W*H) are caller scratch; `sizes`
// (int32, size maxSizes) receives sizes[label] (sizes[0] unused). Returns the
// number of components found.
int __attribute__((export_name("connected_components")))
connected_components(const u8* mask, int* labels, int* queue, int* sizes,
                     int maxSizes, int W, int H) {
  const int N = W * H;
  for (int i = 0; i < N; i++) labels[i] = 0;
  if (maxSizes > 0) sizes[0] = 0;
  int nextLabel = 1;
  for (int i = 0; i < N; i++) {
    if (mask[i] != 1 || labels[i] != 0) continue;
    labels[i] = nextLabel;
    int qHead = 0, qTail = 0;
    queue[qTail++] = i;
    int size = 0;
    while (qHead < qTail) {
      const int idx = queue[qHead++];
      size++;
      const int x = idx % W;
      const int y = idx / W;
      if (x > 0) {
        const int n = idx - 1;
        if (mask[n] == 1 && labels[n] == 0) { labels[n] = nextLabel; queue[qTail++] = n; }
      }
      if (x < W - 1) {
        const int n = idx + 1;
        if (mask[n] == 1 && labels[n] == 0) { labels[n] = nextLabel; queue[qTail++] = n; }
      }
      if (y > 0) {
        const int n = idx - W;
        if (mask[n] == 1 && labels[n] == 0) { labels[n] = nextLabel; queue[qTail++] = n; }
      }
      if (y < H - 1) {
        const int n = idx + W;
        if (mask[n] == 1 && labels[n] == 0) { labels[n] = nextLabel; queue[qTail++] = n; }
      }
    }
    if (nextLabel < maxSizes) sizes[nextLabel] = size;
    nextLabel++;
  }
  return nextLabel - 1;
}

} // extern "C"
