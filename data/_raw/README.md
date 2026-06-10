# data/_raw — upstream source blobs (local only)

This folder holds the **raw**, **upstream** data we derive content from.
The files here are NOT committed to git — they're listed in `.gitignore`
because they total ~235 MB and exceed GitHub's per-file size limits.

**This README is the only tracked file in this folder.**

## What's here

| File | Size | Source |
|------|------|--------|
| `cliopatria.geojson` | ~186 MB | Cliopatria historical-polity polygon dataset (GeoJSON export). Used to seed `data/entities/*.json#geographic.polygon_simplified` via the polygon-fetch tooling. |
| `cliopatria.zip` | ~49 MB | The compressed archive corresponding to the GeoJSON above. Keep one or the other, not both, when re-fetching. |
| `gis_names.json` | ~17 KB | GIS gazetteer cross-reference used during entity-name disambiguation. |
| `gis_names.txt` | ~13 KB | Plain-text equivalent of the JSON gazetteer. |

## How to re-fetch

> **Cliopatria** — public release of historical-polity polygons.
> Pick the most recent annual snapshot from
> <https://github.com/cliopatria/cliopatria> (or its successor) and
> place either the unpacked GeoJSON or the zip into this folder under
> the filenames above.

> **GIS names** — used during entity-name disambiguation. The original
> scraping tooling has been retired; if a refresh is needed, fetch a
> current gazetteer snapshot manually and place under the filenames
> above.

If you only want to run the live app (`npm run dev`), you don't need
these blobs — the app reads from `data/` + `public/data/` only.

## Why these aren't committed

GitHub rejects files larger than 100 MB on push (and `cliopatria.geojson`
is ~186 MB). Keeping them out of git means clones stay fast and the repo
stays sub-100 MB. The trade-off: anyone re-running the polygon-seed
scripts needs to fetch them once into this folder.
