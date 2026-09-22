#!/usr/bin/env bash
# Rebuild the hosted STEAM-AI demo (served at /steam-ai/ by the repo's Next.js site).
#
# The demo is the web app in static mode: `steam-ai snapshot` saves the API's
# responses for every ingested run, and the frontend answers its API calls from
# those files. Run from anywhere; needs the backend venv and frontend node_modules.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OUT="$REPO/public/steam-ai"

(cd "$HERE/frontend" && npm run build:demo)
rm -rf "$OUT"
cp -r "$HERE/frontend/dist-demo" "$OUT"
"$HERE/backend/.venv/bin/steam-ai" snapshot "$OUT/data"
du -sh "$OUT"
