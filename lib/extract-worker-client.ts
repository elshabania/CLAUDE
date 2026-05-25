"use client";

import type { ParsedDrawing } from "@/lib/road-detect";

export interface ExtractResult {
  drawing: ParsedDrawing;
  rotation: number;
}

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./extract.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

/**
 * Parse + classify a PDF in a background worker. The ArrayBuffer is
 * transferred (zero-copy) into the worker; the resulting ParsedDrawing is
 * structure-cloned back. Keeps the main thread free during the heavy walk.
 */
export function extractInWorker(buffer: ArrayBuffer): Promise<ExtractResult> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (d.ok) resolve({ drawing: d.drawing, rotation: d.rotation });
      else reject(new Error(d.error || "PDF extraction failed"));
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, buffer }, [buffer]);
  });
}
