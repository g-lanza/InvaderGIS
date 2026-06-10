# Offline Ingestion Pipeline

This directory previously held build-time ingesters that pulled external datasets
into static JSON under `data/`. The app (`src/`) makes ZERO network calls to
external sources at runtime — it reads only baked static JSON from `public/data/`.

## Current state

The WALS (World Atlas of Language Structures) ingester (`ingest-wals.mjs`) and its
cache were **removed** (2026-06). WALS was synchronic 20th-century language data
with no period/nation linkage, irrelevant to a 500–1500 CE atlas. Languages are
now recorded as a polity attribute (primary language, language make-up,
administrative language), shown in a polity's Demographics tab — see
`docs/SOURCING.md §6`.

There are currently no active ingesters in this directory. Upstream geometry and
gazetteer data are brought in via the build/bake scripts in `scripts/build/` and
the donor GeoJSON in `dist/data/`.
