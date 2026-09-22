# Road CAD Viewer

> Also in this repo: [**Abu Dhabi Streets**](public/abu-dhabi-streets/README.md) — a
> standalone map app showing Abu Dhabi's main and local street network as
> toggleable layers over a Google Maps basemap. Served at
> `/abu-dhabi-streets` on the deployed site.
>
> **STEAM-AI** (ITC/T/PSA/1170/25, Task 15) design documents live in `docs/`:
> [data contract](docs/data_contract.md), [assumptions and open questions](docs/assumptions.md),
> [architecture and phased plan](docs/architecture.md), [Slice 1 status review](docs/status.md).
> The application lives in [`steam-ai/`](steam-ai/README.md). A static demo of its
> web app, showing the real STEAM v3.2.2 2025 and 2040 inputs plus two synthetic
> runs, is served at `/steam-ai/` on the deployed site (rebuild with
> `steam-ai/scripts/publish_demo.sh`).

A Next.js app that reads road CAD drawings (DXF and DWG) and detects road
geometry from layer naming conventions (centerline, edge of pavement, lane
markings, curb, shoulder).

## Features

- Upload DXF or DWG files
- Server-side parsing via [`dxf-parser`](https://github.com/gdsestimating/dxf-parser)
- Heuristic road-feature classification based on layer names
- Pan / zoom canvas viewer with per-category visibility toggles
- Layer breakdown sidebar with entity counts and total length

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## DWG support

DWG is Autodesk's proprietary binary format and cannot be parsed in pure
JavaScript. The app shells out to an external converter that produces DXF.
Set the `DWG_CONVERTER_BIN` environment variable to one of:

- [`dwg2dxf`](https://www.gnu.org/software/libredwg/) from LibreDWG
- [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter)

```bash
export DWG_CONVERTER_BIN=/usr/local/bin/dwg2dxf
npm run dev
```

Without the converter installed, DWG uploads return a friendly error and DXF
uploads continue to work.

## Road detection

Layer names are matched against patterns in `lib/road-detect.ts`. To recognise
project-specific naming (for example `RD-CL-EX` for an existing centerline),
extend `LAYER_PATTERNS` there.
