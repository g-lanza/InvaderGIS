# InvaderGIS — Historical Data Visualizer

**A custom GIS for historical research, covering 500–1500 CE.** Built from the
ground up — its own map stack, time model, data spine, record schema, analytical
views, and theme engine — not a reskin of any donor app or a wrapper around a
third‑party engine. A serious tool for people's historical research.

**A product of Gavin Lanza.**

![Full UI](showcase/02-atlas-ready.png)

---

## What it is

InvaderGIS renders a real, sourced historical dataset across **time and space**.
Drag the year scrubber and the whole workspace updates live — polygons grow and
dissolve, events accrete, journeys trace, relationships connect. Every fact shown
traces to a real source record; nothing is invented.

The first dataset is **Medieval Europe & the wider world, 500–1500 CE** — **16,415
real records**:

| Kind | Count | | Kind | Count |
|---|---:|---|---|---:|
| Polities | 306 | | Settlements | 4,077 |
| Events | 3,075 | | Military sites | 2,055 |
| Relationships | 428 | | Capitals | 230 |
| Rulers | 285 | | Institutions | 92 |
| Journeys | 152 | | Technologies / Texts | 18 / 1,097 |
| Sources | 458 | | | |

Languages are recorded as an attribute of each polity (its primary language,
language make-up, and administrative language), shown in a polity's Demographics
tab — not as a separate record kind.

The system is **dataset‑general**: the medieval corpus is "dataset #1" loaded into
a generalized schema, so other historical datasets can be added without forking
the engine.

---

## Features

- **Time‑scoped map** — real polity polygons, capitals, settlements, military
  sites, journeys, trade routes and relationship arcs, all filtered to the active
  year. Hover for a tip, click to inspect. Lazy‑loaded MapLibre; the initial
  shell is tiny.
- **Chronoscope** — a year scrubber over 500–1500 CE with a record‑density
  histogram, era bands, and timeline playback.
- **Layers & legend** — collapsible layer groups, per‑layer opacity, and a live
  colour legend that decodes event categories, region tints and relationship
  types.
- **Inspector** — a full detail surface per record. Polities get a tabbed profile
  (Overview, Demographics, Economy, Lifecycle, Connections, Sources) with charts
  drawn from the real record. Every claim shows its provenance and citations.
- **Analytical views** — a relationship **Network** graph + adjacency matrix, a
  ruler **Lineage** Gantt with succession, a **Compare** table and two‑entity
  **Storyline**, **Registers** (sortable attribute tables), and a **Sources**
  bibliography.
- **Search & command palette** — ⌘K / Ctrl‑K fuzzy search, year‑jump, slash
  commands; a prose (TF‑IDF) search over the same index.
- **Four themes, three map styles** — Atlas / Manuscript / Dark / Contrast and
  Parchment / Plain / Relief, switchable live with no reload.
- **My Data** — upload your own GeoJSON/CSV to plot alongside the historical
  layers; it stays only in your browser and is never transmitted.
- **Guided tour** — a first‑open walkthrough of the workspace, replayable from
  Settings → Guides, which also hosts the manual, data sources, attribution and
  licences.

| | | |
|---|---|---|
| ![Network](screenshots/network-open.png) | ![Matrix](screenshots/matrix-view.png) | ![Dark](screenshots/audit-dark.png) |

---

## The four absolutes

These govern every line of the project:

1. **Everything is real.** No mock data, no fake components, no simulated
   functionality. Unfinished work is a clearly marked stub, never a fake.
2. **Every fact is sourced.** No record claim without `provenance.sources_used`
   resolving to a real `source` record. No date, ruler, or border is invented.
   Wikipedia is a finding aid only; citations point to the underlying scholarly
   source, and unverifiable claims are marked weakly attested.
3. **Data safety is absolute.** No script or migration ever deletes or overwrites
   source data destructively. Migrations are read‑old / write‑new with a revert
   log in `data/_audit/`.
4. **One token tree, four themes.** No hard‑coded hex, radius, or shadow outside
   the design tokens. Square corners, hairline borders, no panel shadows.
   Everything looks right in all four themes.

---

## Getting started

Requires Node 18+. Install, then run the dev server.

```bash
npm install         # app dependencies (React, MapLibre, Zustand, …)
npm run dev         # bakes data + starts the Vite dev server (http://localhost:5173)
```

> The app fetches the baked JSON/GeoJSON at runtime rather than bundling it, so
> `npm run bake` (data/ → public/data/ + public/index/) must run first. `dev` and
> `build` run it automatically via their `pre*` hooks; you can also run `npm run
> bake` on its own.

Build, type‑check, and validate:

```bash
npm run build       # bake → tsc --noEmit && vite build → dist/ (static SPA)
npm run typecheck   # tsc --noEmit
npm run validate    # schema / reference / window / licence checks on data/
npm run check       # lint + typecheck + test + build (the full gate)
```

## Deployment

A static SPA — host the `dist/` output anywhere. The repo includes a GitHub Pages
workflow (`.github/workflows/deploy.yml`) that bakes, builds, and publishes on every
push to `main`. The production build is served from the `/InvaderGIS/` base path (set
in `vite.config.ts`); change it to match your repo name, or to `/` for a root/custom
domain. Runtime asset URLs resolve against that base automatically.

---

## How the data pipeline works

Data flows **outside‑in**, always read‑old / write‑new:

```
data/<kind>/*.json
   │  migrate.mjs   read old records → contract records (+ revert log; derives,
   │                never fabricates — e.g. ruler succession from real reign data)
   ▼
data/  (validated)
   │  validate.mjs  schema + reference integrity + date ordering + dataset window
   │                + geometry bounds + licence field checks (CI: exit 1 on error)
   ▼
   │  bake-manifests.mjs   write static artifacts
   ▼
public/data/records/<kind>.json     full per‑kind record bundles
public/data/layers/*.geojson        map layers (coords swapped to GeoJSON order)
public/index/{search,adjacency}.json + by-year/<year>.json
   │
   ▼  loaders.ts fetch at runtime → in‑memory year index (O(1) scrub)
```

Build‑time ingesters (`scripts/ingest/`) bring in upstream data offline, with all
external fields validated and sanitised at the boundary. The app itself makes
**zero runtime external calls**.

---

## Data sources

The dataset incorporates these upstream sources. When reusing the data you must
respect both the project licences (below) and every upstream licence here. This
mirrors `docs/03_LEGAL.md §2` and the in‑app Settings → Guides → Attribution page.

| Source | Contribution | Licence | SPDX | Share‑alike |
|---|---|---|---|:---:|
| [Wikidata](https://www.wikidata.org/) | QID backbone; dates, capitals, rulers | CC0 1.0 | `CC0-1.0` | — |
| [PLEIADES](https://pleiades.stoa.org/) (ISAW, NYU) | Settlement gazetteer; capital coordinates | CC BY 3.0 | `CC-BY-3.0` | — |
| [Cliopatria](https://github.com/aourednik/historical-basemaps) | Historical polity polygon shapes | CC BY‑SA 4.0 | `CC-BY-SA-4.0` | **yes** |
| [Natural Earth](https://www.naturalearthdata.com/) | Coastlines, rivers, lakes, graticule | Public domain | `publicdomain` | — |
| [OpenHistoricalMap](https://www.openhistoricalmap.org/) | Historical settlements, routes | ODbL 1.0 | `ODbL-1.0` | **yes** |

**Attribution:** PLEIADES and the share‑alike sources (Cliopatria,
OpenHistoricalMap) require credit on redistribution; assess share‑alike
obligations when building derivative products. See `docs/03_LEGAL.md` and
`ATTRIBUTIONS.md` for the canonical detail.

---

## Licences

Two‑licence split (`docs/03_LEGAL.md §1`):

| Layer | Covers | Licence | SPDX |
|---|---|---|---|
| **Software** | app code, scripts, styles, docs | PolyForm Noncommercial 1.0.0 | `LicenseRef-PolyForm-Noncommercial-1.0.0` |
| **Data** | curation, schema, aggregation of the dataset | CC BY‑NC 4.0 | `CC-BY-NC-4.0` |

Both permit research, study, and personal use. **Commercial use of either layer
requires prior written permission** — contact **lanzagavin@gmail.com**. The
CC BY‑NC 4.0 licence covers the curation/schema/aggregation; it does not override
the upstream licences of raw imported facts (see Data sources above).

---

## Tech stack

React 18 · Vite 5 · MapLibre GL 4 (lazy) · Zustand 4 · TypeScript 5 (strict).
No charting library — all charts are hand‑rolled SVG. No backend — a static SPA
that runs entirely in the browser.

---

*Built to the standard of a serious research tool. A product of Gavin Lanza.*
