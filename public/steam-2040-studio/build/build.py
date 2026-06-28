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

# Several glyphs are written as literal \uXXXX in HTML text in the original
# files, so they render as the raw escape (e.g. "✕"). Convert every
# \uXXXX that is NOT preceded by a backslash to the real character — valid
# both in HTML text and inside JS string/regex literals.
UESC = re.compile(r"(?<!\\)\\u([0-9a-fA-F]{4})")
def unescape_glyphs(s):
    return UESC.sub(lambda m: chr(int(m.group(1), 16)), s)

# CSS injected so the Studio rail can declutter each app (map-first by default,
# panels revealed contextually).
OVERRIDE = {
 "viewer": """
  /* Studio: hide bulky panels until a rail tool is chosen */
  body.studio-hide-agg #agg{display:none!important}
  body.studio-hide-layers #chips,body.studio-hide-layers #dissctl{display:none!important}
 """,
 "assign": """
  /* Studio: the rail controls panels, so hide the in-app panel toggles */
  #panelOpen,#panelToggle{display:none!important}
  /* declutter: the rail labels the section; drop the verbose footer note */
  #note{display:none!important}
  details.sec{margin-bottom:0!important}
 """,
}
# Per-app source tweaks applied before embedding (clarity fixes + Studio hooks).
def tweak(src, appid):
    src = unescape_glyphs(src)
    if appid == "assign":
        # brighten the faint base-network colour so the map reads clearly at rest
        src = src.replace('baseLink:"#46587e"', 'baseLink:"#8298cd"')
        # the embedded OD matrix is gzip but the app ships no pako decompressor,
        # so it always fell back to the all-ones test. Decode with the browser's
        # native DecompressionStream instead (same approach the Viewer uses) so
        # the real OD demand loads — fully offline, no external library.
        assert 'function loadEmbeddedOD(){' in src
        src = src.replace('function loadEmbeddedOD(){',
                          'async function loadEmbeddedOD(){', 1)
        src = src.replace(
            '  if(typeof pako==="undefined"){ setStatus("Embedded OD present but decompressor missing."); return; }',
            '  if(typeof DecompressionStream==="undefined"){ setStatus("Embedded OD present but this browser can\'t gunzip."); return; }', 1)
        assert 'const bytes=pako.ungzip(raw); const buf=bytes.slice().buffer;' in src
        src = src.replace(
            'const bytes=pako.ungzip(raw); const buf=bytes.slice().buffer;',
            'const _ds=new DecompressionStream("gzip"); const _ab=await new Response(new Blob([raw]).stream().pipeThrough(_ds)).arrayBuffer(); const bytes=new Uint8Array(_ab); const buf=bytes.slice().buffer;', 1)
        # keep the decoded O,D,V arrays so the zone-aggregation handoff can
        # re-aggregate the matrix in place (Studio feature)
        src = src.replace(
            'const r=buildODfromArrays(O,D,V,cnt,true);',
            'try{ window.__ODRAW={O:O,D:D,V:V,cnt:cnt}; }catch(_){} const r=buildODfromArrays(O,D,V,cnt,true);', 1)
        # UNIFIED VISUALISATION: draw the base (un-assigned) network and the
        # centroids EXACTLY like the Network Viewer — same per-class colour,
        # alpha, zoom-scaled width (min(max(b,wm*sc),mx)) and the gold centroid
        # dots. Assigned links still render volume/V-C/LOS on top.
        VSTYLE = ('const VSTYLE={'
          'local:{col:"#3f5170",a:.55,wm:7,b:.28,mx:3.5,minS:.004},'
          'junc:{col:"#6b5a35",a:.6,wm:6,b:.3,mx:3,minS:.006},'
          'rural:{col:"#4d7d5f",a:.75,wm:9,b:.35,mx:4,minS:0},'
          'coll:{col:"#5e7ca3",a:.75,wm:10,b:.38,mx:4,minS:.002},'
          'art:{col:"#8fc1e3",a:.85,wm:16,b:.5,mx:5,minS:0},'
          'ramp:{col:"#d98e4a",a:.85,wm:12,b:.42,mx:4.5,minS:0},'
          'fwy:{col:"#ffb454",a:.95,wm:26,b:.75,mx:7,minS:0}};\n')
        assert 'function render(){' in src
        src = src.replace('function render(){', VSTYLE + 'function render(){', 1)
        # base link branch -> viewer per-class style + minS skip
        assert 'else { col=THEME.baseLink; lw=Math.max(.55,base*.7); t.globalAlpha=assignDone?.5:.8; }' in src
        src = src.replace(
            'else { col=THEME.baseLink; lw=Math.max(.55,base*.7); t.globalAlpha=assignDone?.5:.8; }',
            'else { var vs=VSTYLE[c]; if(vs&&sc<vs.minS) continue; '
            'col=vs?vs.col:THEME.baseLink; lw=vs?Math.min(Math.max(vs.b,vs.wm*sc),vs.mx):Math.max(.55,base*.7); '
            't.globalAlpha=vs?vs.a:(assignDone?.5:.8); }', 1)
        # draw centroids (gold dots) exactly like the Viewer, before overlays/legend
        CENTDRAW = ('{var _cr=Math.min(Math.max(2.2,26*sc),6); t.globalAlpha=1; t.setLineDash([]);'
          'for(var _i=0;_i<N0;_i++){ var _x=(CENT[_i*2]-cx)*sc+hw, _y=hh-(CENT[_i*2+1]-cy)*sc;'
          ' if(_x<-8||_x>W+8||_y<-8||_y>H+8) continue;'
          ' t.beginPath(); t.arc(_x,_y,_cr,0,6.2832); t.fillStyle="#ffd60a"; t.fill();'
          ' t.lineWidth=Math.max(.8,_cr*.3); t.strokeStyle="#5c4a00"; t.stroke(); } t.globalAlpha=1;}\n  ')
        assert src.count('drawSelScreen(t);') >= 1
        src = src.replace('drawSelScreen(t);', CENTDRAW + 'drawSelScreen(t);', 1)
    css = OVERRIDE.get(appid)
    if css:
        style = "<style>/* STEAM Studio overrides */" + css + "</style>\n</head>"
        m = list(re.finditer(r"</head\s*>", src, re.IGNORECASE))
        if m:
            i = m[-1].start(); src = src[:i] + style + src[m[-1].end():]
    # start each app map-first (panels hidden) so the Studio rail reveals them
    if appid == "viewer":
        src = src.replace("<body>", '<body class="studio-hide-agg studio-hide-layers">', 1)
    elif appid == "assign":
        src = src.replace("<body>", '<body class="collapsed">', 1)
    return src

def prep(path, appid):
    src = path.read_text(encoding="utf-8")
    src = tweak(src, appid)
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
