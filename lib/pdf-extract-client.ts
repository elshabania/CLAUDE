"use client";

import { walkPdfDocument, type ExtractedPath, type PdfjsLikeOps } from "@/lib/pdf-extract";

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

/**
 * Load pdfjs-dist in the browser, configure its worker, and walk the document.
 * Runs entirely client-side so we sidestep Vercel's request body / function
 * timeout limits when handling large PDFs.
 */
export async function extractPdfPathsInBrowser(file: File): Promise<ExtractedPath[]> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  return walkPdfDocument(pdfjs.OPS as unknown as PdfjsLikeOps, doc);
}

/**
 * Read a PDF page's /Rotate value (degrees, 0/90/180/270) so the viewer
 * can present the drawing in the orientation the source intends. Returns 0
 * if the rotation can't be read.
 */
export async function getPdfPageRotation(file: File, pageNum = 1): Promise<number> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  if (pageNum < 1 || pageNum > doc.numPages) return 0;
  const page = await doc.getPage(pageNum);
  const rot = (page as unknown as { rotate?: number }).rotate ?? 0;
  return ((rot % 360) + 360) % 360;
}

export interface PdfTextItem {
  text: string;
  /** Anchor x (PDF user units, y-up). */
  x: number;
  /** Anchor y. */
  y: number;
  fontSize: number;
  width: number;
  height: number;
  /** Page number this item came from (1-based). */
  page: number;
}

/**
 * Pull positioned text items from every page via pdfjs's `getTextContent`
 * API. Each item carries its CAD-space anchor and approximate size so we can
 * match it against extracted polygons later (e.g. a "Residential" label sat
 * inside a building footprint identifies that polygon as a building).
 */
export async function extractPdfTextItemsInBrowser(
  file: File
): Promise<PdfTextItem[]> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const items: PdfTextItem[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (
        !raw ||
        typeof raw !== "object" ||
        !("str" in raw) ||
        !("transform" in raw)
      ) {
        continue;
      }
      const item = raw as {
        str: string;
        transform: number[];
        width: number;
        height: number;
      };
      const text = item.str.trim();
      if (!text) continue;
      const t = item.transform;
      items.push({
        text,
        x: t[4],
        y: t[5],
        fontSize: Math.hypot(t[0], t[1]),
        width: item.width,
        height: item.height,
        page: pageNum,
      });
    }
  }
  return items;
}

/**
 * Render page 1 of the PDF as a raster image (data URL). Used as a fallback
 * preview when vector extraction returns nothing - typically because the PDF
 * was "optimized" (vectors flattened to a single embedded image).
 */
export async function renderPdfPagePreview(
  file: File,
  pageNum = 1,
  maxWidth = 1600
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  if (pageNum < 1 || pageNum > doc.numPages) return null;
  const page = await doc.getPage(pageNum);
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / viewport0.width, 4);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // pdfjs typings vary across versions on render() arg shape; cast through unknown.
  await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<
    typeof page.render
  >[0]).promise;

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

export interface PdfRasterPage {
  /** Offscreen canvas containing the rendered PDF page. */
  canvas: HTMLCanvasElement;
  /** Pixel size of the rendered canvas. */
  pixelWidth: number;
  pixelHeight: number;
  /** Page size in PDF user units (1pt = 1/72in). */
  pdfWidth: number;
  pdfHeight: number;
  /** pixels-per-PDF-unit at which we rendered. */
  scale: number;
}

/**
 * Render a PDF page to an offscreen HTMLCanvasElement at the given scale
 * (pixels per PDF user unit). Returns the canvas plus the geometry the
 * caller needs to project PDF coordinates to canvas pixels.
 *
 * Used by CadViewer to display the source PDF as a pixel-perfect background;
 * vector overlays on top do click-pick / hide-category dimming. This is far
 * more reliable than re-rendering the PDF from parsed vectors when the PDF
 * stores fills as 100k+ tiny SOLID hatch tiles.
 */
export async function renderPdfPageToCanvas(
  file: File,
  pageNum = 1,
  pixelWidth = 4096
): Promise<PdfRasterPage | null> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  if (pageNum < 1 || pageNum > doc.numPages) return null;
  const page = await doc.getPage(pageNum);
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = Math.min(pixelWidth / viewport0.width, 6);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<
    typeof page.render
  >[0]).promise;

  return {
    canvas,
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
    pdfWidth: viewport0.width,
    pdfHeight: viewport0.height,
    scale,
  };
}
