#!/usr/bin/env bash
# Compile the C++ compute core to WebAssembly with clang (no Emscripten) and
# embed it as base64 into lib/wasm/geo-wasm.ts.
set -euo pipefail
cd "$(dirname "$0")"

OUT=geo.wasm
clang++ --target=wasm32 -O3 -flto \
  -fno-exceptions -fno-rtti -nostdlib \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--lto-O3 \
  -o "$OUT" geo.cpp

node ./embed.mjs "$OUT" ../lib/wasm/geo-wasm.ts
echo "built $OUT ($(wc -c < "$OUT") bytes)"
