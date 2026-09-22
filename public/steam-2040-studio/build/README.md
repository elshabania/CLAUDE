# Build sources for STEAM 2040 Studio

The shipped `../index.html` (~19 MB) is **generated** from these inputs. They
are kept here so the integration is reviewable without reading the generated
blob.

- **`container.html`** — the unified shell: top-bar tab switcher, the two app
  iframes, and the entire **Copilot** (intent matcher, knowledge base, app
  driver). The marker `<!--APP_SOURCES-->` is where the two embedded apps are
  spliced in.
- **`bridge.js`** — a thin, generic executor injected into each embedded app.
  It receives `postMessage` commands from the container (click / set / check /
  seg / read / snap / open / key) and runs them against the app's own DOM, then
  reports back. No app internals are required — everything goes through the
  public controls.
- **`build.py`** — reads the two original STEAM 2040 HTML files, injects the
  bridge before each `</body>`, neutralises every `</script>` so each app can
  live inside a `<script type="application/octet-stream">` block, splices them
  into `container.html`, and writes `../index.html`.

## Regenerate

`build.py` reads the two original single-file apps (the *Network Viewer* and
*Assignment* HTML). Point the `VIEWER` / `ASSIGN` paths at them and run:

```bash
python3 build.py
```

At runtime the container reads each octet-stream block, restores the
`</script>` tokens, builds a `Blob` URL and loads it into an iframe — so the
two apps run unmodified and fully isolated from each other.
