"use client";

// Loader for the compiled C++ road-network core (native/geo.cpp -> WebAssembly).
// The module is embedded as base64 so it ships inline through the bundler and
// loads identically on the main thread, inside Web Workers, and in the
// Electron static export. Instantiation is async (once); callers await
// ensureGeo() and then use the kernels synchronously via getGeo().

import { GEO_WASM_BASE64 } from "./geo-wasm";

interface GeoExports {
  memory: WebAssembly.Memory;
  reset(): void;
  alloc(n: number): number;
  thin_zhang_suen(mask: number, list: number, W: number, H: number, cap: number): void;
  distance_l1(keep: number, dist: number, W: number, H: number): void;
  connected_components(
    mask: number,
    labels: number,
    queue: number,
    sizes: number,
    maxSizes: number,
    W: number,
    H: number
  ): number;
}

export interface GeoModule {
  /** Zhang-Suen thin, in place on `mask` (0/1). */
  thinZhangSuen(mask: Uint8Array, W: number, H: number, cap: number): void;
  /** L1 distance transform of `keep` (0/1) into a fresh Int32Array. */
  distanceL1(keep: Uint8Array, W: number, H: number): Int32Array;
  /** 4-connected labelling. Returns labels (1-based, 0=non-mask) + sizes[]. */
  connectedComponents(
    mask: Uint8Array,
    W: number,
    H: number
  ): { count: number; labels: Int32Array; sizes: number[] };
}

let modPromise: Promise<GeoModule | null> | null = null;
let mod: GeoModule | null = null;

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node (tests / SSR).
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function wrap(ex: GeoExports): GeoModule {
  return {
    thinZhangSuen(mask, W, H, cap) {
      ex.reset();
      const N = W * H;
      const maskPtr = ex.alloc(N) >>> 0;
      const listPtr = ex.alloc(N * 4) >>> 0; // int32 removal list
      new Uint8Array(ex.memory.buffer, maskPtr, N).set(mask);
      ex.thin_zhang_suen(maskPtr, listPtr, W, H, cap);
      mask.set(new Uint8Array(ex.memory.buffer, maskPtr, N));
    },
    distanceL1(keep, W, H) {
      ex.reset();
      const N = W * H;
      const keepPtr = ex.alloc(N) >>> 0;
      const distPtr = ex.alloc(N * 4) >>> 0;
      new Uint8Array(ex.memory.buffer, keepPtr, N).set(keep);
      ex.distance_l1(keepPtr, distPtr, W, H);
      return new Int32Array(ex.memory.buffer, distPtr, N).slice();
    },
    connectedComponents(mask, W, H) {
      ex.reset();
      const N = W * H;
      const maxSizes = N + 1; // worst case: every pixel its own component
      const maskPtr = ex.alloc(N) >>> 0;
      const labelsPtr = ex.alloc(N * 4) >>> 0;
      const queuePtr = ex.alloc(N * 4) >>> 0;
      const sizesPtr = ex.alloc(maxSizes * 4) >>> 0;
      new Uint8Array(ex.memory.buffer, maskPtr, N).set(mask);
      const count = ex.connected_components(
        maskPtr,
        labelsPtr,
        queuePtr,
        sizesPtr,
        maxSizes,
        W,
        H
      );
      const labels = new Int32Array(ex.memory.buffer, labelsPtr, N).slice();
      const sizesArr = new Int32Array(ex.memory.buffer, sizesPtr, count + 1);
      const sizes: number[] = [];
      for (let i = 0; i <= count; i++) sizes.push(sizesArr[i]);
      return { count, labels, sizes };
    },
  };
}

export function ensureGeo(): Promise<GeoModule | null> {
  if (mod) return Promise.resolve(mod);
  if (!modPromise) {
    modPromise = (async () => {
      try {
        const bytes = decodeBase64(GEO_WASM_BASE64);
        const src = (await WebAssembly.instantiate(
          bytes as BufferSource,
          {}
        )) as WebAssembly.WebAssemblyInstantiatedSource;
        mod = wrap(src.instance.exports as unknown as GeoExports);
        return mod;
      } catch {
        return null; // callers fall back to the JS implementation
      }
    })();
  }
  return modPromise;
}

export function getGeo(): GeoModule | null {
  return mod;
}
