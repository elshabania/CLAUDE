# PyInstaller spec for STEAM 2040 Studio (spec section 6).
# Build:  pyinstaller packaging/steam2040.spec
# Produces one --onefile --windowed executable bundling the backend, the static
# front-end assets, and (when present) a parsed-network cache + land-use CSV.
import os
from PyInstaller.utils.hooks import collect_submodules

ROOT = os.path.abspath(os.getcwd())

# bundle the front end; data files use os-specific separator handled by spec.
datas = [
    (os.path.join(ROOT, "frontend"), "frontend"),
]
# Optionally bundle a parsed-network cache + land-use CSV if the user dropped
# them next to the build (kept optional so the repo has no large binaries).
for opt in ("data/network_cache.npz", "data/STEAM_landuse_2040.csv"):
    p = os.path.join(ROOT, opt)
    if os.path.exists(p):
        datas.append((p, "data"))

hiddenimports = (collect_submodules("numba") + collect_submodules("llvmlite")
                 + collect_submodules("uvicorn") + ["scipy.spatial"])

a = Analysis(
    ["main.py"],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="STEAM-2040-Studio",
    debug=False,
    strip=False,
    upx=True,
    runtime_tmpdir=None,
    console=False,          # --windowed
)
