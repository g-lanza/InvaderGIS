# Sourcing Policy — InvaderGIS

> Data and information are the product. This document is the canonical policy for how
> historical sources enter the atlas, how they are cited, and how they are verified.

## 1. The two canonical corpora

| Corpus | Role | Status |
|--------|------|--------|
| **Internet Medieval Sourcebook** (IMS, Fordham University, ed. Paul Halsall) | **Primary corpus** — the bulk of merged records cite it | Public-domain / copy-permitted, 500–1500 CE |
| **Medieval Digital Resources** (MDR, Medieval Academy of America) | **Verification layer** — confirms whether a modern peer-reviewed edition exists | Curation aid, not a data source |

**WALS** (World Atlas of Language Structures) has been **fully removed** — the
synchronic 20th-century language layer (records, map layer, and `language` record
kind) was deleted as irrelevant to a 500–1500 CE atlas. Languages are now recorded
only as an attribute of each polity (primary language, language make-up, and
administrative language), shown in a polity's Demographics tab.

The MDR layer is **curation, not automation.** A workflow surfaces candidate matches; a human
confirms each one before any record is promoted to `reviewed`.

## 2. Source id conventions

| id form | meaning | `kind_type` |
|---------|---------|-------------|
| `ims_fordham` | Umbrella source — the Internet Medieval Sourcebook as a whole | `primary` |
| `ims_fordham_<key>` | A specific Fordham region/index page (e.g. `ims_fordham_sbook1k` = Crusades) | `primary` |
| individual translation records | A single primary-text document (chronicle, charter, saint's life) | `primary_source_translation` |

The 34 `ims_fordham*` source records (umbrella + 33 index pages) live in `data/sources/`.
The `<key>` matches Fordham's URL stem (`sbook1k`, `sbook-law`, `sbook2`, …). Each carries a
working `url` back to the Fordham page (`sbook1b` is served as `.html`, the rest `.asp`).

### Extractor prefix → merge rewrite

The extractor tags every record with
`provenance.sources_used = ["fordham:<key>"]`. At merge time
(`merge-into-main.mjs`, NEW-record branch) the `fordham:` prefix is **stripped** and rewritten
to the resolvable ids `ims_fordham` + `ims_fordham_<key>`. A record whose `_fordham_index` is
unknown still cites the umbrella `ims_fordham` — graceful degradation, never an unresolved ref.

## 3. `kind_type` enum

`kind_type` (rendered in `SourceCard` and the source register's Type column) distinguishes:

- `primary` — a primary-source collection or index (the Fordham IMS pages).
- `primary_source_translation` — an individual translated primary document.
- `dataset` — a structured external dataset. **A `dataset` source MUST carry a `license`**
  (SPDX id) or `validate.mjs` raises a **hard error** (see `scripts/validate/validate.mjs`,
  source branch: `kind === 'dataset' && !r.license`). Fordham index sources are `primary`,
  not `dataset`, so they are exempt — but they still carry `license: "public-domain"`.
- Other curated values in use: `monograph`, `survey`, `edited`, `biography`, `popular`,
  `reference`.

## 4. The realness law (governs every mutation)

1. **read-old / enrich / write-new only.** Never overwrite a curated field.
2. **NEW record** → write with `provenance.sources_used` + `from_sourcebook: true`.
3. **COLLISION** (id already exists) → append the Fordham source id to `sources_used` only
   (deduped). The existing record's own fields are untouched (`merge-into-main.mjs`, collision
   branch).
4. **Coordinates** come ONLY from the hand-verified `GAZETTEER` in `merge-into-main.mjs`.
   For events, any coords the extractor supplied are **discarded** — gazetteer or nothing.
   Texts never carry coords (a document is not a map point). **No coordinate is ever guessed.**
5. **Every mutation is logged** to a reversible manifest in `data/_audit/`
   (`fordham-merge-manifest.json`).

### The gazetteer rule (coordinate-fabrication is the biggest realness risk)

A new event is placed on the map **iff** its `id` is present in the gazetteer — a small,
hand-verified `{ id: [lat, lon] }` table of places whose location is genuinely well-established
(famous battle sites, capitals, named palaces). To add a new event coordinate:

1. Run the merge `--dry` and read the manifest to learn the new event ids.
2. For each event you can place with confidence, add one `id: [lat, lon]` line to `GAZETTEER`
   with a comment naming the place. **If you have any doubt, leave it out** — a coord-less
   event still shows in the registers and timeline, just not as a (potentially fake) map dot.
3. Re-run the merge. Never let the extractor's coords through.

### Reversibility

The merge manifest (`data/_audit/fordham-merge-manifest.json`) is the undo log: it lists every
file written/enriched/coord-applied. There is **no automated revert script today** — undo is
manual from the manifest. A `revert-fordham-merge.mjs` is a recommended follow-up (out of scope).
Deleting `wals.json` is independently reversible by re-running `scripts/ingest/ingest-wals.mjs`.

## 5. The pipeline (end to end)

The Fordham Internet Medieval Sourcebook (IMS) corpus was ingested offline and the
resulting records are committed under `data/`. The end-to-end shape:

| Phase | What it does |
|-------|--------------|
| A — link inventory | Inventoried the document links across the IMS index pages → `data/_raw/fordham/link-inventory.json`. |
| B — extract seed | For each region/index page, extracted SOURCED `text`/event/ruler/polity/institution records into an extraction envelope. |
| `write-seed-records.mjs` | Writes the extraction envelope into `data/fordham/<dir>/` (maps `text → texts`). |
| C — merge | `merge-into-main.mjs` merges `data/fordham/` into `data/` under the realness law (`--dry` first). |
| D — WALS removal | Removed WALS as a source and suppressed the `wals` ref (see §6). |
| E — MDR verify | A discovery aid that surfaces candidate modern editions for human review — see §7. Stamps nothing. |
| F — this document | Policy + template. |

Every record committed under `data/` is the output of this offline pipeline; the
app makes no runtime calls.

## 6. WALS removal — fully removed (2026-06)

The WALS language layer was **entirely deleted** as irrelevant to a 500–1500 CE
historical atlas (WALS is synchronic 20th-century typological data with no
period/nation linkage). This was a hard delete authorised by the project owner.

- **Data:** `data/languages/*.json` (2,510 records), the cache
  (`scripts/ingest/_cache/wals-languages.csv`), and the ingester
  (`scripts/ingest/ingest-wals.mjs`) were deleted. No `wals` source record exists.
- **Code:** the `language` record kind was removed from `RecordType`, the
  loaders, the map layer (`languagesLayer.ts`), `LanguageCard`, `LANGUAGE_SCHEMA`,
  the Layers rail, and the bake/validate scripts. `languages.geojson` is no longer
  emitted and is dropped from the manifest.
- **Replacement:** languages are recorded as a polity attribute
  (`primary_language`, `language_composition[]`, `administrative_language`) and
  shown in a polity's Demographics tab — the real, period-bound language data.
- Nothing else cited `wals` in `provenance.sources_used`, so removing the language
  records cleared every `wals` reference; the validator's `wals` suppression was
  removed as dead code.

`draft` ≠ "unreliable". For a Fordham translation it means *"a real public-domain source, not
yet matched to a modern peer-reviewed edition."*

## 7. MDR verification layer (honest curation)

The MDR verification step is a **discovery aid only**. It searches
[mdr-maa.org](https://mdr-maa.org) for each draft Fordham source / `from_sourcebook` text and
produces a verdict `{ source_id, mdr_match: true|false|"uncertain", mdr_url, note }`. **It
changes no status.** Its output is a report for human curation.

### Human stamp (read-old / write-new), applied only after a person confirms the `mdr_url`:

```json
{
  "status": "reviewed",
  "_quarry": {
    "peer_reviewed": true,
    "notes": "Verified against Medieval Digital Resources (MDR), Medieval Academy of America — <mdr_url>, checked <date>."
  }
}
```

These fields already render in `SourceCard` (the "Peer reviewed" row, the status chip) and the
source register's sortable Status column — **zero UI work**.

**Honesty guardrail:** no MDR match → the record stays `draft`. Many Fordham translations are
old public-domain editions MDR will not list — that is **expected**, not a failure.

## 8. Licensing risk (stated plainly)

Fordham's Internet Medieval Sourcebook is **non-commercial / educational**. Many of its
translations are **old public-domain editions**, not modern peer-reviewed scholarship. This is
precisely why the `draft` / `reviewed` distinction and the MDR verification layer exist:
`reviewed` is reserved for sources confirmed against a modern scholarly edition. Do not present
a `draft` Fordham translation as peer-reviewed scholarship.

## 9. Worked template — a `text` record

An individual primary-source document from the Fordham Crusades index. A text has **no map
point** (coords omitted), and `composed.year` is the date of **composition**, not of any later
translation. It cites both the umbrella and the specific index page.

`data/texts/gesta_francorum.json`:

```json
{
 "kind": "text",
 "id": "gesta_francorum",
 "dataset": "medieval-europe-500-1500",
 "name_primary": "Gesta Francorum et aliorum Hierosolimitanorum",
 "author": "anonymous (a follower of Bohemond of Taranto)",
 "language": "Latin",
 "composed": { "place": null, "year": 1101 },
 "tradition": "chronicle",
 "from_sourcebook": true,
 "provenance": {
  "status": "draft",
  "confidence": "high",
  "attestation": "Eyewitness First Crusade chronicle; full English translation hosted on the Fordham IMS Crusades index.",
  "sources_used": ["ims_fordham", "ims_fordham_sbook1k"]
 }
}
```

Notes on the template:
- **No `coords`** — a document is not a place. The merge step deletes any coords on a `text`.
- `composed.year` = 1101 (composition), even though the hosted translation is modern/PD.
- `sources_used` resolves to two real source records, so `SourcesTab` renders a numbered,
  clickable bibliography with a working **"View source ↗"** to the Fordham Crusades page.
- `kind_type` for an individual translation would be `primary_source_translation`; this record
  uses `kind: "text"` and is merged into `data/texts/` (NOT `data/sources/`), which avoids the
  bake `source.json` id-collision trap (bake dedups sources by internal `r.id`).
