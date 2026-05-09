import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DWG_CONVERTER = process.env.DWG_CONVERTER_BIN;

export class DwgConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DwgConversionError";
  }
}

/**
 * Converts a DWG buffer to DXF text.
 *
 * Requires a DWG→DXF converter on the host. Set DWG_CONVERTER_BIN to the
 * absolute path of one of:
 *   - ODA File Converter (https://www.opendesign.com/guestfiles/oda_file_converter)
 *   - LibreDWG's `dwg2dxf` (https://www.gnu.org/software/libredwg/)
 *
 * Both accept input/output directory arguments; the wrapper below targets the
 * `dwg2dxf` CLI signature. Override with a custom binary by exporting a
 * shell-compatible wrapper that takes `<input.dwg> -o <output.dxf>`.
 */
export async function dwgToDxf(dwgBuffer: Buffer): Promise<string> {
  if (!DWG_CONVERTER) {
    throw new DwgConversionError(
      "DWG conversion is not configured. Install LibreDWG or ODA File Converter and set DWG_CONVERTER_BIN to the binary path. For now, please upload a DXF file."
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "dwg-"));
  const inputPath = join(workDir, "input.dwg");
  const outputPath = join(workDir, "input.dxf");

  try {
    await writeFile(inputPath, dwgBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(DWG_CONVERTER, [inputPath, "-o", outputPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new DwgConversionError(`Converter exited ${code}: ${stderr}`));
      });
    });

    const files = await readdir(workDir);
    const dxfName = files.find((f) => f.toLowerCase().endsWith(".dxf"));
    if (!dxfName) {
      throw new DwgConversionError("Converter ran but produced no DXF output");
    }
    return await readFile(join(workDir, dxfName), "utf8");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
