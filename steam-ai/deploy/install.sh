#!/usr/bin/env bash
# One-command install for Linux / macOS. Offline mode: set STEAM_AI_WHEELHOUSE
# to a directory of wheels and STEAM_AI_NPM_CACHE to a populated npm cache.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE/backend"
python3 -m venv .venv
if [[ -n "${STEAM_AI_WHEELHOUSE:-}" ]]; then
  .venv/bin/pip install --no-index --find-links "$STEAM_AI_WHEELHOUSE" -e .
else
  .venv/bin/pip install -e .
fi
cd "$HERE/frontend"
if [[ -n "${STEAM_AI_NPM_CACHE:-}" ]]; then
  npm ci --offline --cache "$STEAM_AI_NPM_CACHE"
else
  npm ci
fi
npm run build
mkdir -p "$HERE/data/watch"
echo "STEAM-AI installed. Start with: $HERE/backend/.venv/bin/steam-ai serve"
