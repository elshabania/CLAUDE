"use client";

import { parseDxfInBrowser } from "@/lib/dxf-client";
import type { ParsedDrawing } from "@/lib/road-detect";

/**
 * Fetch and parse the bundled WSP masterplan DXF (shipped gzipped in public/).
 * Decompressed with the browser-native DecompressionStream and routed through
 * the normal client-side DXF pipeline.
 */
export async function loadSampleDrawing(): Promise<ParsedDrawing> {
  const res = await fetch("/sample-masterplan.dxf.gz");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let blob: Blob;
  if (res.body && typeof DecompressionStream !== "undefined") {
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    blob = await new Response(stream).blob();
  } else {
    blob = await res.blob();
  }
  const file = new File([blob], "sample-masterplan.dxf", { type: "application/dxf" });
  return parseDxfInBrowser(file);
}
