#!/usr/bin/env python3
"""Rebuild STEAM-AI Brain (../index.html) from the files in this folder.

The original single-file Network Viewer and Assignment apps are not in the
repository; their prepared sources already live inside ../index.html as
octet-stream blocks. This script:

  1. lifts those blocks out of the current ../index.html,
  2. applies the STEAM-AI patches to the embedded apps (idempotent: every
     patch is wrapped in /*AI:name*/ ... /*/AI:name*/ markers and replaced
     on re-run; the engine script is replaced wholesale),
  3. splices them into container.html together with ai-shell.css,
     ai-shell.js and preload-agg.json,
  4. writes ../index.html.

Run:  python3 rebuild_ai.py
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "index.html"
ENDTOK = "__STEAM_ES__"

src = OUT.read_text(encoding="utf-8")
start = src.index('<script type="application/octet-stream" id="src-viewer">')
pd = src.index('<script type="application/octet-stream" id="preload-diff">')
end = src.index("</script>", pd) + len("</script>")
blocks = src[start:end]


def block(name):
    tag = '<script type="application/octet-stream" id="%s">' % name
    i = blocks.index(tag) + len(tag)
    # payloads are tokenised, so the first real </script> closes the block
    j = blocks.index("</script>", i)
    return i, j


def mpatch(text, name, anchor, insert, where="before", count=1):
    """Insert `insert` next to `anchor`, wrapped in markers. Re-running
    replaces the marked region instead of inserting twice."""
    a, b = "/*AI:%s*/" % name, "/*/AI:%s*/" % name
    wrapped = a + insert + b
    if a in text:
        text2, n = re.subn(re.escape(a) + r".*?" + re.escape(b), lambda m: wrapped, text, flags=re.S)
        return text2
    n = text.count(anchor)
    if count and n != count:
        sys.exit("patch %s: anchor found %d times (expected %d)" % (name, n, count))
    if n == 0:
        sys.exit("patch %s: anchor missing" % name)
    return text.replace(anchor, (wrapped + anchor) if where == "before" else (anchor + wrapped))


def mreplace(text, name, old, new):
    """Replace `old` with a marker-wrapped `new`; re-running refreshes it."""
    a, b = "/*AI:%s*/" % name, "/*/AI:%s*/" % name
    wrapped = a + new + b
    if a in text:
        return re.sub(re.escape(a) + r".*?" + re.escape(b), lambda m: wrapped, text, flags=re.S)
    if text.count(old) != 1:
        sys.exit("replace %s: anchor found %d times" % (name, text.count(old)))
    return text.replace(old, wrapped)


def munreplace(text, name, old):
    """Restore the original text of a patch made by mreplace."""
    a, b = "/*AI:%s*/" % name, "/*/AI:%s*/" % name
    return re.sub(re.escape(a) + r".*?" + re.escape(b), lambda m: old, text, flags=re.S)


def patch_bridge(t):
    # route ai.* commands to the STEAM-AI engine (assign) before the bridge switch
    return mpatch(t, "route", "switch(m.cmd){",
                  'if(/^ai\\./.test(m.cmd)){ out = window.__AICMD ? window.__AICMD(m) : {ok:false, err:"STEAM-AI engine not loaded in this app"}; } else ')


def patch_assign(t):
    t = patch_bridge(t)
    # keep the flow before the final update, to measure last-iteration change
    t = mpatch(t, "pv", 'if(method==="aon") vol.set(aux);', "var __pv=vol.slice();")
    t = mpatch(t, "ld", "it++; recompTimes(vol);",
               "{ var __ld=new Float32Array(me); for(let __g=0;__g<me;__g++) __ld[__g]=Math.abs(vol[__g]-__pv[__g]);"
               " window.__LASTDELTA=__ld; window.__LASTGAP=gap; window.__LASTMETHOD=method; }")
    t = mpatch(t, "bd", "baseVol=vol.slice(0,GLINK.m);",
               " window.__BASEDELTA=window.__LASTDELTA; window.__BASEGAP=window.__LASTGAP; window.__BASEMETHOD=window.__LASTMETHOD;"
               " if(window.__AI){ window.__AI.volSource=\"engine\"; window.__AI.pairClamp=null; } ", where="after", count=2)
    t = mpatch(t, "sd", "scnVol=vol; scnMet=metricsOf(vol);",
               " window.__SCNDELTA=window.__LASTDELTA; window.__SCNGAP=window.__LASTGAP; window.__SCNMETHOD=window.__LASTMETHOD; if(window.__AI){ window.__AI.pairClamp=null; } ",
               where="after")
    # routing keeps the full BPR curve (a bound there lets flow pile onto the
    # shortest links); only reporting times use window.__APPRCLAMP. Undo the
    # earlier routing-bound patches if a previous build applied them.
    t = munreplace(t, "rt", "const x=vol[g]/ECAP[g]; ew[e]=EFF[g]*(1+a*Math.pow(x,b));")
    t = munreplace(t, "ls", "const f=x[g]+lam*d; const t=EFF[g]*(1+a*Math.pow(f/ECAP[g],b));")
    # noise screening in the difference view
    t = mpatch(t, "nz", "if(_adv<1e-6||_hide){",
               "if(window.__NOISEON&&window.__NOISETOLD&&gi&&_adv<window.__NOISETOLD[gi[i]]) _hide=true; ")
    # the STEAM-AI engine, injected before the last </body>
    engine = (HERE / "ai-engine.js").read_text(encoding="utf-8")
    assert "</script" not in engine.lower()
    t = re.sub(r'<script id="steam-ai-engine">.*?' + ENDTOK + r"\n", "", t, flags=re.S)
    k = [m.start() for m in re.finditer(r"</body\s*>", t, re.I)][-1]
    return t[:k] + '<script id="steam-ai-engine">\n' + engine + "\n" + ENDTOK + "\n" + t[k:]


for name, fn in (("src-assign", patch_assign), ("src-viewer", patch_bridge)):
    i, j = block(name)
    blocks = blocks[:i] + fn(blocks[i:j]) + blocks[j:]

container = (HERE / "container.html").read_text(encoding="utf-8")
css = (HERE / "ai-shell.css").read_text(encoding="utf-8")
js = (HERE / "ai-shell.js").read_text(encoding="utf-8")
assert "</script" not in js.replace("<\\/script", "").lower(), "ai-shell.js must not close the script tag"
for tok in ("<!--APP_SOURCES-->", "/*__AI_SHELL_CSS__*/", "/*__AI_SHELL_JS__*/", "var PRELOAD_AGG=null; /*__PRELOAD_AGG__*/"):
    assert container.count(tok) == 1, "container token missing: " + tok
out = container.replace("<!--APP_SOURCES-->", blocks + "\n")
out = out.replace("/*__AI_SHELL_CSS__*/", css)
out = out.replace("/*__AI_SHELL_JS__*/", js)
pre = json.loads((HERE / "preload-agg.json").read_text(encoding="utf-8"))
for r in pre.get("results", []):
    r.pop("merged", None)
pre_js = json.dumps(pre, separators=(",", ":"))
assert "</" not in pre_js.replace("<\\/", "")
out = out.replace("var PRELOAD_AGG=null; /*__PRELOAD_AGG__*/", "var PRELOAD_AGG=" + pre_js + ";")
OUT.write_text(out, encoding="utf-8")
print("Wrote %s (%.1f MB)" % (OUT, OUT.stat().st_size / 1e6))
