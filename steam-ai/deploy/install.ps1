# One-command install for Windows Server. Run from an elevated PowerShell.
# Offline mode: set $env:STEAM_AI_WHEELHOUSE to a folder of wheels and
# $env:STEAM_AI_NPM_CACHE to a populated npm cache.
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location "$Here\backend"
python -m venv .venv
if ($env:STEAM_AI_WHEELHOUSE) {
  & .\.venv\Scripts\pip install --no-index --find-links $env:STEAM_AI_WHEELHOUSE -e .
} else {
  & .\.venv\Scripts\pip install -e .
}
Set-Location "$Here\frontend"
if ($env:STEAM_AI_NPM_CACHE) {
  npm ci --offline --cache $env:STEAM_AI_NPM_CACHE
} else {
  npm ci
}
npm run build
New-Item -ItemType Directory -Force -Path "$Here\data\watch" | Out-Null
Write-Host "STEAM-AI installed. Start with: $Here\backend\.venv\Scripts\steam-ai serve"
