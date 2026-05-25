/// <reference lib="webworker" />
// Builds the road network (medial-axis skeletonization + graph assembly) off
// the main thread. The skeletonizer rasterizes onto an OffscreenCanvas here,
// so the heavy Zhang-Suen thinning never freezes the UI.

import { buildRoadNetwork, type BuildNetworkOptions } from "@/lib/road-network";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";

interface ReqMsg {
  id: number;
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  opts?: BuildNetworkOptions;
}

self.onmessage = (e: MessageEvent<ReqMsg>) => {
  const { id, drawing, groupCategory, opts } = e.data;
  try {
    const network = buildRoadNetwork(drawing, groupCategory, opts ?? {});
    (self as unknown as Worker).postMessage({ id, ok: true, network });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
