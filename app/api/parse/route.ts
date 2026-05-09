import { NextResponse } from "next/server";
import DxfParser from "dxf-parser";
import { detectRoads } from "@/lib/road-detect";
import { dwgToDxf, DwgConversionError } from "@/lib/dwg";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  let dxfText: string;
  try {
    if (isDwg) {
      const buf = Buffer.from(await file.arrayBuffer());
      dxfText = await dwgToDxf(buf);
    } else {
      dxfText = await file.text();
    }
  } catch (err) {
    if (err instanceof DwgConversionError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read file" },
      { status: 500 }
    );
  }

  let parsed;
  try {
    const parser = new DxfParser();
    parsed = parser.parseSync(dxfText);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse DXF: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 }
    );
  }

  const drawing = detectRoads(parsed);
  return NextResponse.json({ filename: file.name, drawing });
}
