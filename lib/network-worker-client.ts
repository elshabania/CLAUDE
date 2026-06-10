"use client";

import {
  buildRoadNetwork,
  type RoadNetwork,
  type BuildNetworkOptions,
} from "@/lib/road-network";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import { ensureGeo } from "@/lib/wasm/geo";

// Build on the main thread (fallback), loading the C++ core first.
async function buildOnMain(
  drawing: ParsedDrawing,
  groupCategory: Record<string, RoadCategory>,
  opts: BuildNetworkOptions
): Promise<RoadNetwork> {
  await ensureGeo();
  return buildRoadNetwork(drawing, groupCategory, opts);
}

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./network.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("error", () => {
        workerBroken = true;
      });
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

/** Hard ceiling on a single build. Past this we assume the worker is wedged
 *  (or the drawing is pathological) and fail with a message rather than let
 *  the UI sit on a spinner forever. */
const BUILD_TIMEOUT_MS = 60000;

/**
 * Build the road network in a Web Worker (OffscreenCanvas skeletonizer) so the
 * UI never blocks. The promise REJECTS on worker crash or timeout instead of
 * falling back to a synchronous main-thread build - that fallback could itself
 * freeze/OOM the renderer on a large drawing, which is exactly the "app stops
 * working" failure we're avoiding. Callers show a message on rejection.
 */
export function buildNetwork(
  drawing: ParsedDrawing,
  groupCategory: Record<string, RoadCategory>,
  opts: BuildNetworkOptions = {}
): Promise<RoadNetwork> {
  const w = getWorker();
  if (!w) {
    // No Worker support at all (not normal in the desktop shell).
    return buildOnMain(drawing, groupCategory, opts);
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      clearTimeout(timer);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.id !== id || done) return;
      done = true;
      cleanup();
      if (d.ok) resolve(d.network as RoadNetwork);
      else reject(new Error(d.error || "Network build failed."));
    };
    const onErr = () => {
      if (done) return;
      done = true;
      cleanup();
      // Recreate a fresh worker next time, but don't fall back to a blocking
      // main-thread build.
      worker = null;
      reject(
        new Error("The network builder crashed — the drawing may be too large or complex.")
      );
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      try {
        w.terminate();
      } catch {
        // ignore
      }
      worker = null;
      reject(
        new Error("Building the network timed out — the drawing may be too large or complex.")
      );
    }, BUILD_TIMEOUT_MS);
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage({ id, drawing, groupCategory, opts });
  });
}
