// Embeds the compiled geo.wasm as base64 in a TS module, so the bundler ships
// the C++ core inline (no asset-path resolution needed in the Electron static
// export or inside Web Workers).
import { readFileSync, writeFileSync } from "node:fs";

const [, , inp, outp] = process.argv;
if (!inp || !outp) {
  console.error("usage: embed.mjs <in.wasm> <out.ts>");
  process.exit(1);
}
const b64 = readFileSync(inp).toString("base64");
const ts =
  "// AUTO-GENERATED from native/geo.cpp by native/build.sh. Do not edit.\n" +
  "// Compiled C++ road-network core (clang --target=wasm32), embedded as base64.\n" +
  "export const GEO_WASM_BASE64 =\n  \"" +
  b64 +
  "\";\n";
writeFileSync(outp, ts);
console.log(`embedded ${b64.length} base64 chars -> ${outp}`);
