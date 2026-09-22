# STEAM-AI frontend

Post-run diagnostics UI for the Abu Dhabi ITC STEAM v4 transport model. Vite + React 18 +
TypeScript, react-router, TanStack Query, MapLibre GL + deck.gl (map), recharts (all charts).
No CSS framework, no runtime CDN calls, system font stack.

The production build (`dist/`) is served by the FastAPI app at `/`; the UI talks to the REST
API described in `docs/api.md` under `/api/v1`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173; `/api` is proxied to `http://localhost:8000` |
| `npm run dev:mock` | Same, but every API call is answered from `src/mock/fixtures` |
| `npm run build` | Typecheck, then production build to `dist/` (base path `/`) |
| `npm run build:mock` | Production build with the mock enabled, to `dist-mock/` (for demos and screenshots) |
| `npm run preview` | Serve `dist/` locally |
| `npm run preview:mock` | Serve `dist-mock/` on :4174 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm run fixtures` | Regenerate the synthetic fixtures (`scripts/gen-fixtures.mjs`) |

## Mock mode (`VITE_USE_MOCK=1`)

`src/api/client.ts` is the single typed fetch wrapper. When the app is built or started with
`VITE_USE_MOCK=1`, the wrapper lazy-loads `src/mock/handler.ts`, which answers the same paths
as `docs/api.md` (`/runs`, `/runs/{id}`, `/health`, `/findings`, `/checks`, `/changes`,
`/kpis`, `/links?period=`, `/links/{link_id}`, `/checks`, `/config/health`) from JSON in
`src/mock/fixtures/`. No MSW or service worker is involved.

The fixture set is deterministic and synthetic: two runs (`run_2035_ref_v4` with base
`run_2035_ref_v3`), 188 one-way links in WGS84 around lon 54.4 / lat 24.45 with flows for
five periods and four user classes, 15 findings across ten checks (one planted V/C 1.36
Critical, a convergence High, a land-use High, etc.), check results, KPIs, and the changes
panel. `npm run fixtures` rebuilds them; the generator is seeded so output is stable.

`VITE_USE_MOCK` is read at build time (Vite `import.meta.env`), so the mock is fully
tree-shaken out of a normal `npm run build`.

## Basemap (`VITE_BASEMAP_STYLE_URL`)

The map (`/runs/:runId/map`) renders links with a deck.gl `PathLayer` over MapLibre GL.
By default MapLibre uses an inline blank style (a single neutral background layer, colour from
the `--map-bg` token, following light/dark mode), so no tiles are fetched. To add a
self-hosted basemap (for example a PMTiles-backed `style.json` served by the backend), set

```
VITE_BASEMAP_STYLE_URL=/tiles/style.json
```

in `.env` before building. Anything that resolves to a MapLibre style works; the URL is
only used when set. See `src/map/basemap.ts`.

Link geometry is converted once per period into binary attributes (`src/map/binary.ts`):
Float32 XYZ offsets from the network centre (`COORDINATE_SYSTEM.LNGLAT_OFFSETS`, so float32
keeps sub-metre precision), a `Uint32Array` of start indices, per-vertex RGBA and width arrays.
Layers are memoised and swapped through `MapboxOverlay.setProps`, never re-mounted per render.
Hover and click use deck's picking index into a parallel properties array.

Note: deck.gl is pinned to exactly 9.4.0. In 9.4 the binary `PathLayer` path (data with
`startIndices` + `attributes`) consumes `getColor`/`getWidth` typed arrays **per vertex**
rather than per path (the documented 9.1 behaviour), so `binary.ts` expands colours and widths
per vertex. Re-check `src/map/binary.ts` before bumping deck.gl.

## Environment variables

Copy `.env.example` to `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_USE_MOCK` | `0` | `1` serves fixtures instead of calling the API |
| `VITE_BASEMAP_STYLE_URL` | empty | MapLibre style URL for a self-hosted basemap |
| `VITE_API_BASE` | `/api/v1` | API prefix |

## Offline install

The deployment target has no internet access. Populate the npm cache on a connected machine
and ship it with the installer:

```
# connected machine, same Node major (22) and npm major (10)
npm ci                                  # produces/uses package-lock.json
npm cache verify
tar czf steam-ai-npm-cache.tgz -C ~/.npm _cacache

# offline machine
mkdir -p ~/.npm && tar xzf steam-ai-npm-cache.tgz -C ~/.npm
npm ci --offline --no-audit --no-fund
npm run build
```

`npm ci --offline` fails loudly if a package is missing from the cache, which is the
intended behaviour. Alternatively, `npm pack` every dependency into a `wheelhouse`-style
folder and point `npm ci` at it with a local registry (Verdaccio) if the installer already
ships one. Playwright is a dev dependency only; screenshots use a pre-installed Chromium via
`executablePath`, and `playwright install` is never required for the build.

## Structure

```
src/
  api/        types.ts (mirrors steam_ai/models.py), client.ts (fetch wrapper), queries.ts (TanStack hooks)
  app/        RunContext.tsx: current run, run switching, URL helpers
  components/ TopBar, Footer, SeverityBadge, FindingDetail, Disclosure, States, charts/ (recharts, lazy)
  lib/        severity.ts, scales.ts (viridis sequential + diverging), format.ts
  map/        basemap.ts, binary.ts, MapView.tsx (MapLibre + MapboxOverlay)
  mock/       handler.ts + fixtures/*.json
  pages/      HomePage, FindingsPage, MapPage (lazy route), ChecksPage, ReportsPage
  styles/     tokens.css (custom properties, dark-mode variant), global.css
```

## Design notes

- One typeface (system-ui stack). Colours are CSS custom properties on `:root` with a
  `prefers-color-scheme: dark` variant; `data-theme="light"` opts out.
- Severity is encoded with colour **and** a letter/shape (C circle, H triangle, M/I squares).
- Sequential scale (V/C, volume, speed, delay) is viridis-like; the diverging blue/red scale is
  used only for scenario differences (KPI deltas vs base run).
- Logical CSS properties throughout so `dir="rtl"` can be enabled later.
- Keyboard: skip link, visible focus rings, sortable headers are buttons, table rows are
  focusable (Enter opens, arrow keys move), disclosures are native `<details>`.
- The map route is a separate chunk (`MapPage` + `map-vendor`), so first paint of Home does
  not load MapLibre or deck.gl.
