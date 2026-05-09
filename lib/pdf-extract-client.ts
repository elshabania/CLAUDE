"use client";

import { walkPdfDocument, type ExtractedPath, type PdfjsLikeOps } from "@/lib/pdf-extract";

let workerConfigured = false;

/**
 * Load pdfjs-dist in the browser, configure its worker, and walk the document.
 * Runs entirely client-side so we sidestep Vercel's request body / function
 * timeout limits when handling large PDFs.
 */
export async function extractPdfPathsInBrowser(file: File): Promise<ExtractedPath[]> {
  // pdfjs ships an ESM build alongside its worker. Loading the worker via
  // `new URL(..., import.meta.url)` lets the bundler emit it as a static asset.
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    workerConfigured = true;
  }

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  return walkPdfDocument(pdfjs.OPS as unknown as PdfjsLikeOps, doc);
}
