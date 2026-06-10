"use client";

import DxfParser from "dxf-parser";
import { detectFromDxf, type ParsedDrawing } from "@/lib/road-detect";

/**
 * Parse a DXF file entirely in the browser. DWG is not supported client-side
 * (it needs a native converter); ask the user to export DXF or PDF instead.
 * Keeping this client-side lets the app ship as a static export / desktop
 * build with no server component.
 */
export async function parseDxfInBrowser(file: File): Promise<ParsedDrawing> {
  const text = await file.text();
  const parser = new DxfParser();
  const parsed = parser.parseSync(text);
  if (!parsed) throw new Error("Could not parse DXF file.");
  return detectFromDxf(parsed);
}
