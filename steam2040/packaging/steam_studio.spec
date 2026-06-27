# PyInstaller spec for STEAM 2040 Studio.
#
# Build a single standalone, windowed executable that runs offline on an
# air-gapped machine:
#
#     pip install pyinstaller
#     pyinstaller packaging/steam_studio.spec
#
# The result lands in dist/.  Bundle a parsed-network cache and the land-use
# CSV with --add-data (see the datas list) if you want the app to ship with
# data baked in.

# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# Add ("source", "dest") tuples here to bundle data, e.g. a pre-parsed network
# cache or the land-use CSV:
#   datas = [("sample_data/sample_landuse.csv", "data")]
datas = []

hiddenimports = [
    "numba", "scipy.spatial", "scipy.sparse.csgraph", "shapefile",
]

a = Analysis(
    ["../steam_studio.py"],
    pathex=[os.path.abspath(os.path.join(os.path.dirname("__file__"), ".."))],
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
    upx=True,
    console=False,          # --windowed
    onefile=True,
)
