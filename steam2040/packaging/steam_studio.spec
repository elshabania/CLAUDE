# PyInstaller spec for STEAM 2040 Studio.
#
# Build a single standalone, windowed executable. Invoke from the steam2040/
# project root (CWD-independent — paths are resolved from the spec location):
#
#     pip install pyinstaller
#     pyinstaller packaging/steam_studio.spec
#
# The result lands in dist/  (STEAM2040Studio.exe on Windows, STEAM2040Studio
# elsewhere). PyInstaller cannot cross-compile: build the Windows .exe on
# Windows, the macOS .app on macOS, the Linux binary on Linux. The
# .github/workflows/build-desktop.yml workflow does all three on CI.

# -*- mode: python ; coding: utf-8 -*-
import os

# SPECPATH is injected by PyInstaller = the directory containing this spec.
PROJECT_ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))

block_cipher = None

# Bundle data with ("source", "dest_dir") tuples, e.g. a pre-parsed network
# cache or the land-use CSV, to ship a self-contained offline build:
#   datas = [(os.path.join(PROJECT_ROOT, "sample_data", "sample_landuse.csv"), "data")]
datas = []

hiddenimports = [
    "numba",
    "scipy.spatial",
    "scipy.sparse.csgraph",
    "shapefile",
]

a = Analysis(
    [os.path.join(PROJECT_ROOT, "steam_studio.py")],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name="STEAM2040Studio",
    debug=False,
    strip=False,
    upx=False,             # UPX often absent on CI runners; keep the build simple
    console=False,         # windowed (no console)
    onefile=True,
)
