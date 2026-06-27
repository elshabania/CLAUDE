# PyInstaller spec for STEAM 2040 Studio — the web-app build.
#
# Produces a single standalone executable that starts the local server and
# opens the browser UI. Build from the steam2040/ project root:
#
#     pip install pyinstaller
#     pyinstaller packaging/steam_web.spec
#
# PyInstaller can't cross-compile: build the Windows .exe on Windows, etc.
# (.github/workflows/build-desktop.yml does all three on CI.)

# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_submodules

PROJECT_ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))

block_cipher = None

# Bundle the browser front-end (HTML/JS/CSS) so the app is self-contained.
datas = [(os.path.join(PROJECT_ROOT, "steam_app", "web", "static"),
          os.path.join("steam_app", "web", "static"))]

hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + ["numba", "scipy.spatial", "scipy.sparse.csgraph", "shapefile",
       "anyio", "starlette", "httptools", "websockets",
       "uvicorn.lifespan.on", "uvicorn.protocols.http.auto",
       "uvicorn.protocols.websockets.auto", "uvicorn.loops.auto"]
)

a = Analysis(
    [os.path.join(PROJECT_ROOT, "steam_web.py")],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "PySide6", "PyQt5", "PyQt6"],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name="STEAM2040Studio",
    debug=False,
    strip=False,
    upx=False,
    console=True,          # keep a console so the user sees the local URL
    onefile=True,
)
