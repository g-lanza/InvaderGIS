/**
 * src/data/loaders.ts — Runtime-fetch data loaders for InvaderGIS (Spine 2c-i).
 *
 * Architecture: FETCH, not bundle.
 *
 * Instead of `import.meta.glob` (which bundled all 4,032 records into the JS
 * bundle — 8.5 MB / 1.5 MB gzip), this module fetches pre-baked JSON artifacts
 * from public/data/ at runtime. Vite and the production server both serve the
 * public/ directory at the URL root, so:
 *
 *   fetch(assetUrl('/data/records/polity.json'))     → public/data/records/polity.json
 *   fetch(assetUrl('/data/manifest.json'))           → public/data/manifest.json
 *
 * The bake step (npm run bake) must be run before `npm run dev` or
 * `npm run build` to populate these files.
 *
 * YEAR INDEX STRATEGY — in-memory, built after load:
 *
 *   We do NOT fetch /index/by-year/<year>.json per scrubber tick because that
 *   would fire 1,001 requests or cause per-tick latency. Instead we build the
 *   same in-memory Map<year, Set<id>> after the per-type record arrays arrive,
 *   exactly as the old eager loader did. Scrubber queries are O(1) forever.
 *   The by-year slice files in public/index/ exist for external consumers
 *   (e.g. server-side rendering, the map renderer direct fetch) but the app
 *   itself uses the in-memory index.
 *
 * LOADING STATE:
 *
 *   `loadDataset()` is now async. bootstrap.ts awaits it and then populates
 *   stores. Until it resolves the UI shows "— loading —" via recordsStore's
 *   initial zero counts (already the documented behaviour).
 *
 * REALNESS LAW:
 *   Every record served is a real baked record from data/. If a fetch fails
 *   (e.g. bake not run), the loader throws with a clear message rather than
 *   silently returning empty arrays.
 *
 * Directory → type mapping (mirrors TYPE_DIR in bake-manifests.mjs). The loader
 * serves all 16 record kinds; live counts are published by recordsStore at boot,
 * so treat public/data/manifest.json as the source of truth, not this comment.
 * Approximate counts at time of writing (see manifest.json for exact):
 *   polity ~276 · event ~2984 · journey ~152 · relationship ~428 · ruler ~214 ·
 *   source ~432 · institution ~52 · technology ~18 · text ~20 · settlement ~4077 ·
 *   military ~2055 · capital ~230 · claim ~4123 · annotation ~12 ·
 *   research_question ~7  →  TOTAL ~15,080 records.
 *
 * Phase: Spine 2c-i (replaces eager-glob loader; additive to stores).
 */

import type { RecordType } from '@/types/record';
import { assetUrl } from '@/data/assetUrl';

// ── Raw JSON envelope ─────────────────────────────────────────────────────────

/**
 * The shape every raw JSON record in data/ carries.
 *
 * Each record is flat: `kind` and `dataset` live at the top level alongside
 * the domain-specific fields (id, name, year, etc.). There is no nested
 * `payload` wrapper in the raw JSON.
 *
 * `_quarry` holds extra fields extracted during migration — preserved read-only.
 */
export interface RawRecord {
  /** Discriminant — matches RecordType (set during migration). */
  kind: RecordType;
  /** Dataset identifier, always `"medieval-europe-500-1500"` in this corpus. */
  dataset: string;
  /** Stable slug id — matches the filename (e.g. `"abbasid_caliphate"`). */
  id: string;
  /** Extra fields from the quarry migration pass — preserved as-is. */
  _quarry?: Record<string, unknown>;
  /** All other domain-specific fields (name, year, formed, etc.). */
  [key: string]: unknown;
}

// ── Grouped dataset result ────────────────────────────────────────────────────

/**
 * Grouped dataset result: all records by kind, with record counts.
 *
 * Counts reflect REAL loaded records; they are never fabricated.
 */
export interface DatasetResult {
  polities:      RawRecord[];
  events:        RawRecord[];
  journeys:      RawRecord[];
  relationships: RawRecord[];
  rulers:        RawRecord[];
  sources:       RawRecord[];
  institutions:  RawRecord[];
  technologies:  RawRecord[];
  texts:         RawRecord[];
  // Wave 3 / Phase C — geo-escalated kinds
  settlements:   RawRecord[];
  militarySites: RawRecord[];
  capitals:      RawRecord[];
  // Wave 6 / research-first layer
  claims:              RawRecord[];
  annotations:         RawRecord[];
  researchQuestions:   RawRecord[];
  counts:        RecordCounts;
}

/**
 * Per-kind record counts. All fields reflect the number of valid records
 * fetched from the baked artifacts. No synthetic padding.
 */
export interface RecordCounts {
  polities:      number;
  events:        number;
  journeys:      number;
  relationships: number;
  rulers:        number;
  sources:       number;
  institutions:  number;
  technologies:  number;
  texts:         number;
  // Wave 3 / Phase C
  settlements:   number;
  militarySites: number;
  capitals:      number;
  // Wave 6 / research-first layer
  claims:              number;
  annotations:         number;
  researchQuestions:   number;
  /** Sum of all per-kind counts. */
  total:         number;
}

// ── Module-level loaded state ─────────────────────────────────────────────────

/** Populated by loadDataset(). Null until the first successful load. */
let _polities:      RawRecord[] = [];
let _events:        RawRecord[] = [];
let _journeys:      RawRecord[] = [];
let _relationships: RawRecord[] = [];
let _rulers:        RawRecord[] = [];
let _sources:       RawRecord[] = [];
let _institutions:  RawRecord[] = [];
let _technologies:  RawRecord[] = [];
let _texts:         RawRecord[] = [];
// Wave 3 / Phase C
let _settlements:   RawRecord[] = [];
let _militarySites: RawRecord[] = [];
let _capitals:      RawRecord[] = [];
// Wave 6 / research-first layer
let _claims:             RawRecord[] = [];
let _annotations:        RawRecord[] = [];
let _researchQuestions:  RawRecord[] = [];

/** True once loadDataset() has resolved. */
let _loaded = false;

// ── Year index (in-memory, built after load) ──────────────────────────────────

/**
 * In-memory year index: maps year → set of record ids active that year.
 *
 * Built once after all per-type arrays are fetched. Scrubber queries are O(1).
 * We do NOT fetch by-year slices per tick — that would cause per-animation-frame
 * network requests. The public/index/by-year/ files exist for external consumers.
 *
 * Temporal logic per kind:
 *   polity       — formed..dissolved (inclusive); if no dissolved → end of window
 *   event        — instantaneous at `year`
 *   journey      — year_start..year_end
 *   relationship — active_periods[] spans preferred; falls back to since..until
 *   ruler        — reign_start..reign_end
 *   source / institution / technology / text — excluded (non-temporal)
 */
const _yearIndex: Map<number, Set<string>> = new Map();

// ── Id index (in-memory, built after load) ────────────────────────────────────
//
// Maps an id → its record and → its kind, for O(1) cross-kind resolution. Used by
// the inspector to (a) look up a selected record without a per-render linear scan
// and (b) resolve the KIND of an id referenced by another record (e.g. an event's
// participant) — replacing the old prefix-guessing heuristic, which was wrong for
// the prefix-less baked ids.
//
// 255 ids collide across kinds (e.g. `abbasid_caliphate` is both a polity and a
// capital). Resolution uses POLITY PRECEDENCE: polities are indexed first and the
// first writer wins, so a colliding id resolves to its polity — the convention the
// baker's nameById already uses, and the kind relationships/events reference.
const _recordById: Map<string, RawRecord> = new Map();
const _kindById:   Map<string, RecordType> = new Map();

/**
 * Pure builder: given [kind, records][] in PRECEDENCE ORDER, return id→record and
 * id→kind maps where the FIRST writer of a colliding id wins. Exported for tests.
 */
export function buildIdMaps(
  ordered: ReadonlyArray<readonly [RecordType, ReadonlyArray<RawRecord>]>,
): { recordById: Map<string, RawRecord>; kindById: Map<string, RecordType> } {
  const recordById = new Map<string, RawRecord>();
  const kindById   = new Map<string, RecordType>();
  for (const [kind, arr] of ordered) {
    for (const r of arr) {
      if (!recordById.has(r.id)) {
        recordById.set(r.id, r);
        kindById.set(r.id, kind);
      }
    }
  }
  return { recordById, kindById };
}

/**
 * Build the id → record / id → kind module indexes with polity precedence.
 * Polity is indexed first; every later kind only fills ids not already present.
 */
function buildIdIndex(): void {
  // Polity first (precedence), then the rest in a stable order.
  const order: Array<[RecordType, RawRecord[]]> = [
    ['polity', _polities],
    ['event', _events],
    ['journey', _journeys],
    ['relationship', _relationships],
    ['ruler', _rulers],
    ['source', _sources],
    ['institution', _institutions],
    ['technology', _technologies],
    ['text', _texts],
    ['settlement', _settlements],
    ['military', _militarySites],
    ['capital', _capitals],
    ['claim', _claims],
    ['annotation', _annotations],
    ['research_question', _researchQuestions],
  ];
  const { recordById, kindById } = buildIdMaps(order);
  _recordById.clear();
  _kindById.clear();
  for (const [k, v] of recordById) _recordById.set(k, v);
  for (const [k, v] of kindById)   _kindById.set(k, v);
}

const INDEX_START = 500;
const INDEX_END   = 1500;

function indexSpan(id: string, start: number, end: number): void {
  const from = Math.max(INDEX_START, Math.round(start));
  const to   = Math.min(INDEX_END,   Math.round(end));
  for (let y = from; y <= to; y++) {
    let bucket = _yearIndex.get(y);
    if (!bucket) { bucket = new Set(); _yearIndex.set(y, bucket); }
    bucket.add(id);
  }
}

function indexInstant(id: string, year: number): void {
  if (year < INDEX_START || year > INDEX_END) return;
  const y = Math.round(year);
  let bucket = _yearIndex.get(y);
  if (!bucket) { bucket = new Set(); _yearIndex.set(y, bucket); }
  bucket.add(id);
}

function buildYearIndex(): void {
  // Polities
  for (const r of _polities) {
    const formed    = typeof r.formed    === 'number' ? r.formed    : null;
    const dissolved = typeof r.dissolved === 'number' ? r.dissolved : null;
    if (formed !== null) {
      indexSpan(r.id, formed, dissolved ?? INDEX_END);
    }
  }

  // Events (instantaneous)
  for (const r of _events) {
    const year = typeof r.year === 'number' ? r.year : null;
    if (year !== null) indexInstant(r.id, year);
  }

  // Journeys
  for (const r of _journeys) {
    const ys = typeof r.year_start === 'number' ? r.year_start : null;
    const ye = typeof r.year_end   === 'number' ? r.year_end   : null;
    if (ys !== null) {
      if (ye !== null) indexSpan(r.id, ys, ye);
      else indexInstant(r.id, ys);
    }
  }

  // Relationships: active_periods[] preferred; fall back to since..until
  for (const r of _relationships) {
    const periods = r.active_periods;
    if (Array.isArray(periods) && periods.length > 0) {
      for (const span of periods as [number, number][]) {
        if (Array.isArray(span) && span.length === 2) {
          indexSpan(r.id, span[0], span[1]);
        }
      }
    } else {
      const since = typeof r.since === 'number' ? r.since : null;
      const until = typeof r.until === 'number' ? r.until
                  : r.until === null             ? INDEX_END
                  :                                null;
      if (since !== null) {
        indexSpan(r.id, since, until ?? INDEX_END);
      }
    }
  }

  // Rulers
  for (const r of _rulers) {
    const rs = typeof r.reign_start === 'number' ? r.reign_start : null;
    const re = typeof r.reign_end   === 'number' ? r.reign_end   : null;
    if (rs !== null) {
      if (re !== null) indexSpan(r.id, rs, re);
      else indexInstant(r.id, rs);
    }
  }
  // Wave 3 / Phase C — settlements, military sites, capitals use start_year / end_year
  for (const r of [..._settlements, ..._militarySites, ..._capitals]) {
    const s = typeof r.start_year === 'number' ? r.start_year : null;
    const e = typeof r.end_year   === 'number' ? r.end_year   : null;
    if (s !== null) indexSpan(r.id, s, e ?? INDEX_END);
  }
  // sources, institutions, technologies, texts: no temporal indexing
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

/**
 * Fetch a JSON file from the public/ directory (served at URL root by Vite).
 * Throws with a clear message if the fetch fails — the bake step must run first.
 */
async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    throw new Error(
      `[loaders] Network error fetching ${url}. ` +
      `Ensure the dev server is running and npm run bake has been executed. ` +
      `Original: ${networkErr}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `[loaders] Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}. ` +
      `Run \`npm run bake\` to generate public/data/ artifacts.`,
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Filter an array returned from a baked record bundle: keep only entries
 * that have a non-empty string id. Guards against any corrupt entries.
 */
function validRecords(arr: unknown[]): RawRecord[] {
  const out: RawRecord[] = [];
  for (const v of arr) {
    if (v && typeof (v as RawRecord).id === 'string' && (v as RawRecord).id.length > 0) {
      out.push(v as RawRecord);
    }
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load all records from the baked public/data/records/ bundles.
 *
 * Fetches all 9 per-type JSON files in parallel, builds the in-memory year
 * index, then resolves with a DatasetResult. Idempotent: subsequent calls
 * return the same already-populated arrays without re-fetching.
 *
 * Throws if any per-type fetch fails (e.g. bake not run, server not started).
 *
 * @returns DatasetResult with records grouped by kind and a `counts` summary.
 */
export async function loadDataset(): Promise<DatasetResult> {
  if (_loaded) return buildResult();

  // Fetch all 13 type bundles in parallel for maximum speed.
  const [
    polities,
    events,
    journeys,
    relationships,
    rulers,
    sources,
    institutions,
    technologies,
    texts,
    settlements,
    militarySites,
    capitals,
    claims,
    annotations,
    researchQuestions,
  ] = await Promise.all([
    fetchJson<unknown[]>(assetUrl('/data/records/polity.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/event.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/journey.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/relationship.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/ruler.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/source.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/institution.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/technology.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/text.json')),
    // Wave 3 / Phase C
    fetchJson<unknown[]>(assetUrl('/data/records/settlement.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/military.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/capital.json')),
    // Wave 6 / research-first layer
    fetchJson<unknown[]>(assetUrl('/data/records/claim.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/annotation.json')),
    fetchJson<unknown[]>(assetUrl('/data/records/research_question.json')),
  ]);

  _polities      = validRecords(polities);
  _events        = validRecords(events);
  _journeys      = validRecords(journeys);
  _relationships = validRecords(relationships);
  _rulers        = validRecords(rulers);
  _sources       = validRecords(sources);
  _institutions  = validRecords(institutions);
  _technologies  = validRecords(technologies);
  _texts         = validRecords(texts);
  // Wave 3 / Phase C
  _settlements   = validRecords(settlements);
  _militarySites = validRecords(militarySites);
  _capitals      = validRecords(capitals);
  // Wave 6 / research-first layer
  _claims             = validRecords(claims);
  _annotations        = validRecords(annotations);
  _researchQuestions  = validRecords(researchQuestions);

  // Build in-memory year index from the freshly loaded arrays.
  _yearIndex.clear();
  buildYearIndex();

  // Build the id → record / id → kind index (polity precedence).
  buildIdIndex();

  _loaded = true;
  return buildResult();
}

/** Assemble a DatasetResult from the current module-level arrays. */
function buildResult(): DatasetResult {
  const polities      = _polities.length;
  const events        = _events.length;
  const journeys      = _journeys.length;
  const relationships = _relationships.length;
  const rulers        = _rulers.length;
  const sources       = _sources.length;
  const institutions  = _institutions.length;
  const technologies  = _technologies.length;
  const texts         = _texts.length;
  const settlements   = _settlements.length;
  const militarySites = _militarySites.length;
  const capitals      = _capitals.length;
  const claims             = _claims.length;
  const annotations        = _annotations.length;
  const researchQuestions  = _researchQuestions.length;

  const counts: RecordCounts = {
    polities, events, journeys, relationships, rulers,
    sources, institutions, technologies, texts,
    settlements, militarySites, capitals,
    claims, annotations, researchQuestions,
    total: polities + events + journeys + relationships + rulers +
           sources + institutions + technologies + texts +
           settlements + militarySites + capitals +
           claims + annotations + researchQuestions,
  };

  return {
    polities:      _polities,
    events:        _events,
    journeys:      _journeys,
    relationships: _relationships,
    rulers:        _rulers,
    sources:       _sources,
    institutions:  _institutions,
    technologies:  _technologies,
    texts:         _texts,
    settlements:   _settlements,
    militarySites: _militarySites,
    capitals:      _capitals,
    claims:             _claims,
    annotations:        _annotations,
    researchQuestions:  _researchQuestions,
    counts,
  };
}

/**
 * Return all records for a given kind.
 *
 * Returns the pre-loaded in-memory array. Empty before loadDataset() resolves.
 * Use `loadDataset()` at bootstrap and this for subsequent synchronous access.
 *
 * @param kind - The record type to retrieve.
 * @returns Flat array of RawRecord for that kind.
 */
export function loadRecords(kind: RecordType): RawRecord[] {
  switch (kind) {
    case 'polity':       return _polities;
    case 'event':        return _events;
    case 'journey':      return _journeys;
    case 'relationship': return _relationships;
    case 'ruler':        return _rulers;
    case 'source':       return _sources;
    case 'institution':  return _institutions;
    case 'technology':   return _technologies;
    case 'text':         return _texts;
    // Wave 3 / Phase C
    case 'settlement':   return _settlements;
    case 'military':     return _militarySites;
    case 'capital':      return _capitals;
    // Wave 6 / research-first layer
    case 'claim':              return _claims;
    case 'annotation':         return _annotations;
    case 'research_question':  return _researchQuestions;
  }
}

/**
 * Look up a single record by id across all kinds, O(1).
 * Returns null before loadDataset() resolves or when the id is unknown.
 * On a cross-kind id collision, returns the polity-precedence winner.
 */
export function findRecordById(id: string): RawRecord | null {
  return _recordById.get(id) ?? null;
}

/**
 * Resolve the KIND of an id across all kinds, O(1) (polity precedence).
 * Returns null before loadDataset() resolves or when the id is unknown.
 * Replaces the old prefix-guessing heuristic — accurate for the prefix-less
 * baked ids.
 */
export function kindOfId(id: string): RecordType | null {
  return _kindById.get(id) ?? null;
}

/**
 * Look up a single record by an EXPLICIT kind + id, bypassing the polity-precedence
 * id index. Use this when the caller already knows the kind (e.g. a map click that
 * carries `kind: 'capital'`).
 *
 * Why this exists: 230 capital ids collide 1:1 with polity ids (`abbasid_caliphate`
 * is both a polity and its capital). `findRecordById()` resolves every collision to
 * the polity (first-writer-wins), so clicking a capital marker would otherwise
 * surface the polity record. Resolving by kind+id makes all colliding records
 * reachable. O(n) over the one kind's array; acceptable for a per-selection lookup.
 *
 * Returns null before loadDataset() resolves or when the kind/id combo is unknown.
 */
export function findRecordByKindId(kind: RecordType, id: string): RawRecord | null {
  const records = loadRecords(kind);
  if (!records) return null;
  for (const r of records) {
    if (r.id === id) return r;
  }
  return null;
}

/**
 * Return the ids of all records active in a given year.
 *
 * Uses the in-memory year index (built once after loadDataset() resolves).
 * Lookup is O(1). Returns an empty set before the dataset is loaded.
 *
 * @param year - The year to query (clamped by index to 500–1500).
 * @returns Readonly set of record id strings active at that year.
 */
export function recordsActiveInYear(year: number): ReadonlySet<string> {
  return _yearIndex.get(Math.round(year)) ?? new Set<string>();
}

/**
 * Return the complete per-kind counts.
 *
 * Returns all-zero counts before loadDataset() resolves — the UI shows
 * "— loading —" in that window (existing recordsStore behaviour).
 *
 * @returns RecordCounts with real counts from the loaded arrays.
 */
export function getRecordCounts(): RecordCounts {
  const polities      = _polities.length;
  const events        = _events.length;
  const journeys      = _journeys.length;
  const relationships = _relationships.length;
  const rulers        = _rulers.length;
  const sources       = _sources.length;
  const institutions  = _institutions.length;
  const technologies  = _technologies.length;
  const texts         = _texts.length;
  const settlements   = _settlements.length;
  const militarySites = _militarySites.length;
  const capitals      = _capitals.length;
  const claims             = _claims.length;
  const annotations        = _annotations.length;
  const researchQuestions  = _researchQuestions.length;
  return {
    polities, events, journeys, relationships, rulers,
    sources, institutions, technologies, texts,
    settlements, militarySites, capitals,
    claims, annotations, researchQuestions,
    total: polities + events + journeys + relationships + rulers +
           sources + institutions + technologies + texts +
           settlements + militarySites + capitals +
           claims + annotations + researchQuestions,
  };
}
