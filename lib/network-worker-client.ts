"use client";

import {
  buildRoadNetwork,
  type RoadNetwork,
  type BuildNetworkOptions,
} from "@/lib/road-network";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

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

/**
 * Build the road network without blocking the UI. Runs in a Web Worker
 * (OffscreenCanvas skeletonizer); if the worker is unavailable or errors, it
 * transparently falls back to building on the main thread so results are never
 * worse than before - only the freeze is gone.
 */
export function buildNetwork(
  drawing: ParsedDrawing,
  groupCategory: Record<string, RoadCategory>,
  opts: BuildNetworkOptions = {}
): Promise<RoadNetwork> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(buildRoadNetwork(drawing, groupCategory, opts));
  }
  const id = ++seq;
  return new Promise((resolve) => {
    const fallback = () => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      resolve(buildRoadNetwork(drawing, groupCategory, opts));
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.id !== id) return;
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      if (d.ok) resolve(d.network as RoadNetwork);
      else fallback();
    };
    const onErr = () => {
      workerBroken = true;
      fallback();
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage({ id, drawing, groupCategory, opts });
  });
}
