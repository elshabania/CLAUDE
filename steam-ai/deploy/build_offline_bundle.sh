#!/usr/bin/env bash
# Build the offline artefacts on a connected machine: a Python wheelhouse and
# an npm cache, to copy to the air-gapped VM alongside the source tree.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$HERE/deploy/offline}"
mkdir -p "$OUT/wheelhouse" "$OUT/npm-cache"
python3 -m pip wheel --wheel-dir "$OUT/wheelhouse" "$HERE/backend"
python3 -m pip wheel --wheel-dir "$OUT/wheelhouse" pip setuptools wheel
( cd "$HERE/frontend" && npm ci --cache "$OUT/npm-cache" )
echo "Offline bundle in $OUT. On the VM: STEAM_AI_WHEELHOUSE=$OUT/wheelhouse STEAM_AI_NPM_CACHE=$OUT/npm-cache deploy/install.sh"
