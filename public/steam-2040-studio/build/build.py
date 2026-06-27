#!/usr/bin/env python3
import re, sys, pathlib

UP = pathlib.Path("/root/.claude/uploads/30055bac-83bd-59e3-8e5d-fb45647ff03f")
SCRATCH = pathlib.Path("/tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad")
OUT = pathlib.Path("/home/user/CLAUDE/public/steam-2040-studio/index.html")

VIEWER = UP / "d499b594-STEAM_2040_Network_Viewer_1.html"
ASSIGN = UP / "5e3e8081-STEAM_2040_Assignment_1.html"
ENDTOK = "__STEAM_ES__"

bridge = (SCRATCH / "bridge.js").read_text(encoding="utf-8")
container = (SCRATCH / "container.html").read_text(encoding="utf-8")

ENDRE = re.compile(r"</script\s*>", re.IGNORECASE)

def prep(path, appid):
    src = path.read_text(encoding="utf-8")
    # sanity: count real closing script tags
    n = len(ENDRE.findall(src))
    # inject the bridge just before the LAST </body>
    inj = "<script>\n" + bridge.replace("__APPID__", appid) + "\n</script>\n"
    matches = list(re.finditer(r"</body\s*>", src, re.IGNORECASE))
    if not matches:
        raise SystemExit(f"no </body> in {path.name}")
    idx = matches[-1].start()
    src = src[:idx] + inj + src[idx:]
    # neutralise every </script> so it can live inside an octet-stream block
    src = ENDRE.sub(ENDTOK, src)
    assert ENDTOK in src and "</script" not in src.lower(), "tokenisation failed"
    print(f"  {path.name}: {n} script-close tags, injected bridge as '{appid}', {len(src):,} chars")
    return src

print("Preparing embedded apps:")
v = prep(VIEWER, "viewer")
a = prep(ASSIGN, "assign")

blocks = (
    f'<script type="application/octet-stream" id="src-viewer">{v}</script>\n'
    f'<script type="application/octet-stream" id="src-assign">{a}</script>\n'
)

if "<!--APP_SOURCES-->" not in container:
    raise SystemExit("container missing <!--APP_SOURCES--> marker")
out = container.replace("<!--APP_SOURCES-->", blocks)

# final guard: the only literal </script> left must be the container's own
# closing tags (octet-stream payloads are tokenised). Just write it.
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(out, encoding="utf-8")
print(f"\nWrote {OUT}  ({len(out):,} chars, {OUT.stat().st_size/1e6:.1f} MB)")
