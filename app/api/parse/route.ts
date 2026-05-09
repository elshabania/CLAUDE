import { NextResponse } from "next/server";
import DxfParser from "dxf-parser";
import { detectFromDxf } from "@/lib/road-detect";
import { dwgToDxf, DwgConversionError } from "@/lib/dwg";

export const runtime = "nodejs";
export const maxDuration = 60;

// PDFs are parsed entirely client-side (see lib/pdf-extract-client.ts) so this
// route only handles DXF and DWG, both of which are typically much smaller than
// PDFs and stay under serverless body limits.
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isDwg = name.endsWith(".dwg");
  const isDxf = name.endsWith(".dxf");

  if (!isDwg && !isDxf) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a .dxf or .dwg file." },
      { status: 400 }
    );
  }

  try {
    let dxfText: string;
    if (isDwg) {
      const buf = Buffer.from(await file.arrayBuffer());
      dxfText = await dwgToDxf(buf);
    } else {
      dxfText = await file.text();
    }

    const parser = new DxfParser();
    const parsed = parser.parseSync(dxfText);
    const drawing = detectFromDxf(parsed);
    return NextResponse.json({ filename: file.name, drawing });
  } catch (err) {
    if (err instanceof DwgConversionError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process file" },
      { status: 500 }
    );
  }
}
