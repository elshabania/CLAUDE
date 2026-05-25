/// <reference lib="webworker" />
// Background worker: parses the PDF and runs the legend classifier off the
// main thread so the UI stays responsive on large (400k-path) drawings.
// pdfjs runs inline here (disableWorker) - already off the main thread.

import { walkPdfDocument, type PdfjsLikeOps } from "@/lib/pdf-extract";
import { detectFromPdf } from "@/lib/road-detect";

interface ReqMsg {
  id: number;
  buffer: ArrayBuffer;
}

self.onmessage = async (e: MessageEvent<ReqMsg>) => {
  const { id, buffer } = e.data;
  try {
    const pdfjs = await import("pdfjs-dist");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      disableFontFace: true,
      // Parse inline in this worker thread (no nested worker).
      disableWorker: true,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]).promise;

    const page = await doc.getPage(1);
    const rotation = (((page.rotate ?? 0) % 360) + 360) % 360;

    const paths = await walkPdfDocument(pdfjs.OPS as unknown as PdfjsLikeOps, doc);
    const drawing = detectFromPdf(paths, []);

    (self as unknown as Worker).postMessage({ id, ok: true, drawing, rotation });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
