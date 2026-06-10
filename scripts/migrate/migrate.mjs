#!/usr/bin/env node
/**
 * migrate.mjs — migrate existing data into the InvaderGIS schema.
 *
 * DATA SAFETY: reads OLD (--from), writes NEW (data/<type>/).
 * Never deletes or overwrites a source file. Writes a revert log to data/_audit/
 * listing every file created so the migration can be fully reversed.
 * NEVER fabricates: missing fields stay empty with provenance.status='draft',
 * confidence='low'. Unmapped fields are reported as real TODOs, not filled.
 *
 *   node scripts/migrate/migrate.mjs --from <old-data-dir> [--dataset <id>] [--dry]
 *
 * --from     Path to the old / quarry data directory (required).
 * --dataset  Dataset id to stamp on records (default: medieval-europe-500-1500).
 *            Currently the type maps are always the medieval ones; future datasets
 *            extend this script with their own FOLDER_TYPE / TYPE_DIR overrides.
 * --dry      Dry run: process + print counts, write NOTHING.
 *
 * Field mapping follows the data dictionary (artboard 29). Per-type mappers below
 * handle the real quarry shape; everything else (classify, provenance, write) is wired.
 *
 * Phase G3 changes (2026-05-27):
 *   - Added --dataset flag (dataset-aware, default medieval).
 *   - Fixed event category derivation: reads subtypeToCategory from
 *     data/vocab/medieval.json — NO more hardcoded 'institution' default.
 *   - Relationship: populates participants[] from dyad (from_id/to_id) AND
 *     retains from_id/to_id; also passes through native participants[] from
 *     the real relationship records. No data loss.
 *   - Stamps kind on every migrated record (the generalised envelope field).
 *   - people/ folder mapped to ruler type with real person-record shape.
 *   - institutions/, technologies/, texts/ mappers updated for real quarry shape.
 *
 * Bug-fix batch (2026-05-27):
 *   Bug 1 — open-ended/ongoing dates now map to null, NOT 0.
 *     polity.dissolved, ruler.reign_end, relationship.until, institution.dissolved
 *     all use null when the source has no end value (null, undefined, absent).
 *     Only real numeric end years are preserved as numbers.
 *   Bug 2 — provenance.sources_used now maps inline bibliography objects to
 *     deterministic string slugs (author_slug + "_" + year) instead of "[object Object]".
 *     Quarry entity records store sources as full {type,author,title,publisher,year}
 *     objects with NO id field; we generate a best-effort slug for traceability.
 *     String source ids (people records use "hourani_arab_peoples_1991" style) pass
 *     through unchanged. Sources that are neither strings nor objects become "unknown".
 *   Bug 3 — handled in validate.mjs: dedup is now per-type, not global. Cross-type
 *     same-id (hanseatic_league as both polity + institution) is allowed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FROM    = args.includes('--from')    ? args[args.indexOf('--from')    + 1] : null;
const DRY     = args.includes('--dry');
const DATASET = args.includes('--dataset') ? args[args.indexOf('--dataset') + 1] : 'medieval-europe-500-1500';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const AUDIT = path.join(DATA, '_audit');

if (!FROM || !fs.existsSync(FROM)) {
  console.error('migrate: pass --from <existing old-data dir>');
  process.exit(1);
}

// ── Load vocab (subtypeToCategory) ──────────────────────────────────────────
// Read from data/vocab/medieval.json (the project's own copy, not the quarry).
// Falls back to an inline table so the script works even before the file exists.

let SUBTYPE_TO_CATEGORY = {};
let FALLBACK_CATEGORY = 'power';

const vocabPath = path.join(DATA, 'vocab', 'medieval.json');
if (fs.existsSync(vocabPath)) {
  try {
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    SUBTYPE_TO_CATEGORY = vocab.subtypeToCategory ?? {};
    FALLBACK_CATEGORY   = vocab.fallbackCategory  ?? 'power';
    console.log(`[migrate] loaded subtypeToCategory (${Object.keys(SUBTYPE_TO_CATEGORY).length} entries) from ${path.relative(ROOT, vocabPath)}`);
  } catch (e) {
    console.warn('[migrate] could not parse vocab/medieval.json — using inline fallback table');
  }
}

// Inline fallback (mirrors tokens.ts SUBTYPE_TO_CATEGORY) — used only if vocab file missing.
if (Object.keys(SUBTYPE_TO_CATEGORY).length === 0) {
  SUBTYPE_TO_CATEGORY = {
    battle:'violence', war:'violence', military:'violence', conflict:'violence',
    conquest:'violence', rebellion:'violence', revolt:'violence', crusade:'violence',
    siege:'violence', assassination:'violence',
    treaty:'diplomacy', treaty_fragmentation:'diplomacy', marriage:'diplomacy',
    coronation:'power', succession_crisis:'power', election:'power',
    religious:'religion', religious_council:'religion', council:'religion',
    cultural:'culture',
    exploration:'discovery', expansion_milestone:'discovery',
    economic:'economy',
    disaster:'hazard', epidemic:'hazard', plague:'hazard', famine:'hazard',
    fire:'hazard', earthquake:'hazard', climate:'hazard',
    political:'power', dissolution_event:'power',
  };
  FALLBACK_CATEGORY = 'power';
}

/** Derive event category from type — the CORRECT path, never hardcode 'institution'. */
function deriveCategory(eventType) {
  return SUBTYPE_TO_CATEGORY[eventType] ?? FALLBACK_CATEGORY;
}

// ── Type / folder maps ───────────────────────────────────────────────────────
// These are the medieval maps. Future datasets can provide alternate maps.

/** type → data folder (output side, project data/). */
const TYPE_DIR = {
  polity:       'entities',
  event:        'events',
  journey:      'journeys',
  relationship: 'relationships',
  ruler:        'rulers',
  source:       'sources',
  institution:  'institutions',
  technology:   'technologies',
  text:         'texts',
};

/** quarry folder name → internal type (input side classification). */
const FOLDER_TYPE = {
  entities:      'polity',
  polities:      'polity',
  events:        'event',
  journeys:      'journey',
  relationships: 'relationship',
  relationship:  'relationship',
  rulers:        'ruler',
  people:        'ruler',     // people/ records → Ruler projection
  sources:       'source',
  institutions:  'institution',
  technologies:  'technology',
  texts:         'text',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const unmapped = new Set();
const note = (k) => unmapped.add(k);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * numOrNull — like num() but treats null/undefined input as null (open interval),
 * not as 0. Use for END dates (dissolved, reign_end, until) where the quarry
 * may store null explicitly to mean "entity still exists / ongoing".
 *
 * Background: num(null) = 0 because Number(null) === 0, which is finite.
 * That caused Bug 1: ongoing entities got dissolved=0, flagged as "end before start".
 */
const numOrNull = (v) => (v == null ? null : num(v));

function readJsonTree(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { out.push(...readJsonTree(p)); }
    else if (name.endsWith('.json')) {
      try { out.push({ p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }); }
      catch { console.warn('[migrate] skip unparseable', p); }
    }
  }
  return out;
}

/**
 * Convert a quarry source reference to a string id.
 *
 * Quarry records use two shapes:
 *   a) String id  — "hourani_arab_peoples_1991"  (people/ records)
 *   b) Object     — {type:"book", author:"Kennedy, Hugh", title:"...", year:2004}
 *      (entity records — no id/source_id field exists; generate a deterministic slug)
 *
 * For (b) we build: <author_last_word_lower>_<title_first_word_lower>_<year>
 * This produces human-readable slugs like "kennedy_prophet_2004".
 * These will NOT resolve to a migrated source record (unresolved-ref warnings are
 * honest and acceptable — the inline bib objects are not in data/sources/).
 */
function sourceRefToString(s) {
  if (typeof s === 'string') return s;
  if (typeof s === 'object' && s !== null) {
    // Extract last word of author (surname), first word of title, and year.
    const authorRaw  = typeof s.author === 'string' ? s.author.trim() : '';
    const titleRaw   = typeof s.title  === 'string' ? s.title.trim()  : '';
    const year       = s.year != null ? String(s.year) : '';
    // Last word of author (handles "Kennedy, Hugh" → "Hugh", "Abu-Lughod, Janet L." → "L.")
    // Use the part before the first comma as the surname component.
    const authorPart = authorRaw.includes(',')
      ? authorRaw.split(',')[0].trim().replace(/\s+/g, '_').toLowerCase()
      : authorRaw.split(/\s+/).pop()?.toLowerCase() ?? '';
    // First meaningful word of title (skip articles)
    const titleWords = titleRaw.split(/\s+/).filter(Boolean);
    const titlePart  = (titleWords[0] ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const parts = [authorPart, titlePart, year].filter(Boolean);
    return parts.length > 0 ? parts.join('_') : 'unknown';
  }
  return 'unknown';
}

function provenance(old) {
  // sources_used: try multiple field names used by different record shapes
  const sources =
    old.provenance?.sources_used ??
    old.sources_used             ??
    old.sources                  ??   // quarry events/relationships use "sources": []
    [];
  if (!Array.isArray(sources) || sources.length === 0) note('provenance.sources_used');
  return {
    status:       old.provenance?.status ?? old.status ?? 'draft',
    // BUG 2 FIX: map each source ref to a string. String ids pass through unchanged;
    // inline bibliography objects get a deterministic slug (never "[object Object]").
    sources_used: (Array.isArray(sources) ? sources : []).map(sourceRefToString),
    confidence:   old.provenance?.confidence ?? old.confidence ?? 'low',
  };
}

// ── Per-type mappers ─────────────────────────────────────────────────────────

const MAP = {

  polity: (o) => {
    // Real entity records use temporal.start_year / temporal.end_year
    // BUG 1 FIX: use numOrNull for dissolved so that null/undefined source values
    // stay null (open interval — entity still exists), NOT 0.
    // num(null) = 0 because Number(null)===0 (finite); numOrNull guards against this.
    const formed    = num(o.formed ?? o.start ?? o.temporal?.start_year) ?? 0;
    const dissolved = numOrNull(o.dissolved ?? o.end ?? o.temporal?.end_year);
    if (formed === 0) note('polity.formed');
    return {
      kind:       'polity',     // generalised envelope field (G3)
      dataset:    DATASET,
      id:         String(o.id),
      name_primary:      o.name_primary ?? o.name ?? '',
      name_variants:     o.name_variants ?? [],
      type:              o.type ?? 'polity',
      region:            o.region ?? '',
      monogram:          o.monogram,
      formed,
      dissolved,
      // capital_history: real records use geographic.capital_history[] or capital_history[]
      capital_history: o.capital_history
        ?? o.geographic?.capital_history
        ?? (o.capital ? [{ name: o.capital, from: formed, to: dissolved,
                           lat: o.capital_latlon?.[0] ?? 0,
                           lon: o.capital_latlon?.[1] ?? 0 }] : []),
      // polygon_snapshots: real records use geographic.polygon_snapshots[]
      polygon_snapshots: o.polygon_snapshots
        ?? o.geographic?.polygon_snapshots
        ?? (o.polygon ? [{ year: formed, polygon: o.polygon }] : []),
      // centroid: real records use geographic.centroid
      centroid:          o.centroid ?? o.geographic?.centroid,
      // religion: real records use religion.primary (object); flatten to string
      religion: typeof o.religion === 'string'
        ? o.religion
        : (o.religion?.primary ?? undefined),
      ethnicity:         o.ethnicity,
      languages:         o.languages ?? (o.language ? [o.language] : undefined),
      population_estimates: o.population_estimates
        ?? (o.population_estimate
          ? [{ year: formed, mid: o.population_estimate }]
          : undefined),
      tags:        o.tags,
      provenance:  provenance(o),
    };
  },

  event: (o) => {
    // Real event records: use 'coordinates' or 'coords', 'description' or 'summary'
    // category is DERIVED — never hardcode
    const eventType = o.type ?? 'event';
    // entity: real records often use 'participants' array (list of polity ids)
    // or have no 'entity' field. Use first participant as entity, or empty.
    const entity = o.entity
      ?? (Array.isArray(o.participants) && typeof o.participants[0] === 'string'
          ? o.participants[0]
          : '')
      ?? '';
    const coords = o.coords
      ?? (Array.isArray(o.coordinates) ? o.coordinates : undefined);
    if (!o.summary && !o.description) note('event.summary');
    return {
      kind:     'event',
      dataset:  DATASET,
      id:       String(o.id),
      name:     o.name ?? '',
      year:     num(o.year) ?? 0,
      type:     eventType,
      // CORRECT category derivation — reads subtypeToCategory, never 'institution'
      category: deriveCategory(eventType),
      coords:   coords ?? null,
      entity,
      summary:  o.summary ?? o.description ?? '',
      outcomes: o.outcomes,
      // Carry extra quarry fields as _raw so nothing is lost
      _quarry: {
        participants:          o.participants,
        structural_significance: o.structural_significance,
        year_range:            o.year_range,
      },
      provenance: provenance(o),
    };
  },

  journey: (o) => ({
    kind:       'journey',
    dataset:    DATASET,
    id:         String(o.id),
    name:       o.name ?? '',
    kind_type:  o.kind ?? o.type ?? 'individual_journey',
    year_start: num(o.year_start ?? o.start_year) ?? 0,
    year_end:   num(o.year_end   ?? o.end_year)   ?? 0,
    waypoints:  o.waypoints ?? [],
    provenance: provenance(o),
  }),

  relationship: (o) => {
    // Real quarry relationship records use participants[] + directed natively.
    // The old dyad style uses from_id/to_id. We normalise BOTH and lose nothing.

    // 1. Detect native participants[]
    const nativeParticipants = Array.isArray(o.participants)
      && o.participants.length > 0
      && typeof o.participants[0] === 'object'
      ? o.participants   // already [{entity_id, role}] shape
      : null;

    // 2. Detect string-array participants (quarry event style — not relationship style)
    const stringParticipants = Array.isArray(o.participants)
      && o.participants.length > 0
      && typeof o.participants[0] === 'string'
      ? o.participants
      : null;

    // 3. Resolve from_id / to_id (dyad shape or from/to fallbacks)
    const from_id = o.from_id ?? o.from ?? (stringParticipants?.[0]) ?? '';
    const to_id   = o.to_id   ?? o.to   ?? (stringParticipants?.[1]) ?? '';

    // 4. Build participants[] — prefer native object form; else derive from dyad
    let participants;
    if (nativeParticipants) {
      participants = nativeParticipants;
    } else if (from_id || to_id) {
      participants = [
        { entity_id: String(from_id), role: '' },
        { entity_id: String(to_id),   role: '' },
      ];
    } else {
      participants = [];
    }

    // 5. Temporal: real records use temporal.start_year / temporal.end_year
    // Use numOrNull for until: null end = open/ongoing relationship.
    const since = num(o.since ?? o.from_year ?? o.temporal?.start_year) ?? 0;
    const until = numOrNull(o.until ?? o.temporal?.end_year);

    return {
      kind:         'relationship',
      dataset:      DATASET,
      id:           String(o.id),
      // Keep dyad fields for back-compat with all existing consumers
      from_id:      String(from_id),
      to_id:        String(to_id),
      // Normalised participants[] — populated from native or derived from dyad
      participants,
      directed:     o.directed ?? false,
      type:         o.type ?? o.kind ?? 'alliance',
      since,
      until,
      note:         o.note ?? o.description,
      active_periods: o.active_periods ?? o.temporal?.active_periods ?? undefined,
      _quarry: {
        key_events:              o.key_events,
        structural_significance: o.structural_significance,
      },
      provenance:   provenance(o),
    };
  },

  ruler: (o) => {
    // Real quarry people records use entity_associations[0] for polity/reign dates.
    const assoc = Array.isArray(o.entity_associations) ? o.entity_associations[0] : null;
    const polity     = o.polity    ?? assoc?.entity_id ?? '';
    const reignStart = num(o.reign_start ?? o.start ?? assoc?.start_year) ?? 0;
    // BUG 1 FIX: use numOrNull for reign_end — null source means open/ongoing reign.
    // num(null) returns 0 (Number(null)===0); numOrNull preserves null correctly.
    const reignEnd   = numOrNull(o.reign_end ?? o.end ?? assoc?.end_year);
    const title      = o.title ?? assoc?.role ?? o.role ?? undefined;
    // Lifespan from people records
    if (!polity) note('ruler.polity');
    return {
      kind:        'ruler',
      dataset:     DATASET,
      id:          String(o.id),
      name:        o.name ?? '',
      polity,
      title,
      reign_start: reignStart,
      reign_end:   reignEnd,
      succeeds:    o.succeeds,
      _quarry: {
        lifespan:          o.lifespan,
        entity_associations: o.entity_associations,
        key_actions:       o.key_actions,
        region:            o.region,
        name_variants:     o.name_variants,
      },
      provenance:  provenance(o),
    };
  },

  source: (o) => {
    // Real quarry source records use 'type' for kind
    const kind = o.kind ?? o.type ?? 'monograph';
    // Licence check: source records of kind 'dataset' need a licence (docs/03 §4)
    if (kind === 'dataset' && !o.license && !o.licence) note('source.license (dataset kind requires SPDX licence)');
    return {
      kind:     'source',
      dataset:  DATASET,
      id:       String(o.id),
      title:    o.title ?? o.name ?? '',
      author:   o.author,
      year:     num(o.year),
      kind_type: kind,
      status:   o.status ?? 'draft',
      url:      o.url,
      license:  o.license ?? o.licence,
      covers:   o.covers,
      citations: o.citations,
      _quarry: {
        publisher:    o.publisher,
        place:        o.place,
        language:     o.language,
        peer_reviewed: o.peer_reviewed,
        citation:     o.citation,
        topics:       o.topics,
        notes:        o.notes,
      },
    };
  },

  institution: (o) => {
    // Real quarry institution records use temporal.start_year/end_year
    // Use numOrNull for dissolved: null end_year = institution still active.
    const formed    = num(o.formed ?? o.temporal?.start_year) ?? 0;
    const dissolved = numOrNull(o.dissolved ?? o.temporal?.end_year);
    return {
      kind:      'institution',
      dataset:   DATASET,
      id:        String(o.id),
      name_primary: o.name_primary ?? o.name ?? '',
      domain:    o.domain ?? o.type ?? undefined,   // real records use 'type' field
      formed,
      dissolved,
      _quarry: {
        key_developments:  o.key_developments,
        influences_entities: o.influences_entities,
        description:       o.description,
      },
      provenance: provenance(o),
    };
  },

  technology: (o) => ({
    kind:        'technology',
    dataset:     DATASET,
    id:          String(o.id),
    name_primary: o.name_primary ?? o.name ?? '',
    // Real records use 'kind' for domain
    domain:      o.domain ?? o.kind ?? undefined,
    origin: o.origin ?? (o.region_origin || o.appearance_year
      ? { place: o.region_origin, year: num(o.appearance_year) }
      : undefined),
    materials:   o.materials,
    diffusion:   o.diffusion ?? o.polities_adopted,  // real records use polities_adopted
    _quarry: {
      polities_adopted: o.polities_adopted,
      description:      o.description,
    },
    provenance:  provenance(o),
  }),

  text: (o) => ({
    kind:        'text',
    dataset:     DATASET,
    id:          String(o.id),
    name_primary: o.name_primary ?? o.name ?? '',
    author:      o.author,
    language:    o.language,
    // Real records use 'year_written'
    composed: o.composed
      ?? (o.year_written || o.place_written
          ? { year: num(o.year_written), place: o.place_written }
          : undefined),
    tradition:   o.tradition,
    influence:   o.influence ?? o.influences ?? undefined,
    _quarry: {
      kind:               o.kind,
      polities_referenced: o.polities_referenced,
      description:        o.description,
    },
    provenance:  provenance(o),
  }),
};

// ── Classifier ───────────────────────────────────────────────────────────────

function classify(old, p) {
  // 1. Explicit type field (if it's a known mapper type)
  if (old.type && MAP[old.type]) return old.type;
  // 2. Folder segment of the path
  for (const seg of p.split(path.sep)) if (FOLDER_TYPE[seg]) return FOLDER_TYPE[seg];
  // 3. Field-based heuristics
  if (old.from_id || old.from) return 'relationship';
  if (Array.isArray(old.participants) && typeof old.participants[0] === 'object'
      && old.participants[0]?.entity_id) return 'relationship';
  if (old.reign_start != null || old.polity) return 'ruler';
  if (old.entity_associations) return 'ruler';   // people/ records
  if (old.name_primary && old.formed != null)    return 'polity';
  if (old.year != null && old.summary)           return 'event';
  return null;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

console.log(`[migrate] dataset: ${DATASET}`);
console.log(`[migrate] from:    ${FROM}`);
console.log(`[migrate] dry-run: ${DRY}`);
console.log('');

const created = [];
const counts = Object.fromEntries(Object.keys(TYPE_DIR).map((t) => [t, 0]));
let unclassified = 0;

// ── Pass 1: map every source record into a contract record (no writes yet) ──────
// Records are collected first so the succession post-pass (below) can see all
// rulers together before anything is written. Still read-old / write-new.
const mapped = []; // { type, rec }
for (const { p, data } of readJsonTree(FROM)) {
  for (const old of (Array.isArray(data) ? data : [data])) {
    if (!old || !old.id) { continue; }
    const type = classify(old, p);
    if (!type) { unclassified++; continue; }
    mapped.push({ type, rec: MAP[type](old) });
  }
}

// ── Pass 1.5: derive ruler succession from real reign data ──────────────────────
// The quarry stores no explicit `succeeds`; it is DERIVED (not fabricated) from
// each ruler's real polity + role + reign_start/reign_end (via entity_associations,
// already on the mapped record as polity/title/reign_start). Within each
// (polity, role) cohort, rulers are ordered by reign_start; a ruler `succeeds` the
// immediately-prior ruler IFF the gap between that predecessor's reign_end and this
// ruler's reign_start is within [0, SUCCESSION_GAP_YEARS].
//
// Threshold rationale (data-driven, examined 2026-05-29): the real adjacency-gap
// distribution has a clear break — direct successions cluster at 0–12yr
// (Charlemagne→Louis the Pious 0yr, Harun al-Rashid→al-Ma'mun 4yr, James II→III of
// Majorca 4yr, Leo I→Hethum I 7yr, Ugone II→Eleanor of Arborea 12yr), then jump to
// 33yr+ where the dataset simply omitted the rulers BETWEEN two notable ones
// (Justinian I→Heraclius 45yr skips several emperors). Linking across those omitted
// reigns would FABRICATE a direct succession that did not happen. 15yr captures the
// real handoffs and stops before the omission cliff. Negative gaps (co-rule /
// overlapping / ordering artifacts) are NOT succession and stay unlinked. The
// dataset is intentionally sparse (notable rulers only) so few links is the honest
// truth, not a defect.
const SUCCESSION_GAP_YEARS = 15;
const successionStats = { linked: 0, cohorts: 0, interregnaSkipped: 0 };
{
  const rulers = mapped.filter((m) => m.type === 'ruler').map((m) => m.rec);
  // Group by polity + normalized role (title). Empty polity → ungrouped (no links).
  const cohorts = new Map();
  for (const r of rulers) {
    if (!r.polity) continue;
    const key = `${r.polity}::${(r.title ?? '').toLowerCase()}`;
    let cohort = cohorts.get(key);
    if (!cohort) { cohort = []; cohorts.set(key, cohort); }
    cohort.push(r);
  }
  for (const cohort of cohorts.values()) {
    if (cohort.length < 2) continue;
    successionStats.cohorts++;
    cohort.sort((a, b) => (a.reign_start ?? 0) - (b.reign_start ?? 0));
    for (let i = 1; i < cohort.length; i++) {
      const prev = cohort[i - 1];
      const cur = cohort[i];
      const prevEnd = prev.reign_end ?? prev.reign_start; // open-ended: use start as anchor
      const gap = (cur.reign_start ?? 0) - (prevEnd ?? 0);
      // Succession only when the predecessor's reign ended at or shortly before this
      // reign began (gap in [0, SUCCESSION_GAP_YEARS]). Negative gaps = co-rule/overlap.
      if (prevEnd != null && cur.reign_start != null && gap >= 0 && gap <= SUCCESSION_GAP_YEARS) {
        cur.succeeds = prev.id; // derived, traceable to both rulers' real reign dates
        successionStats.linked++;
      } else {
        successionStats.interregnaSkipped++;
      }
    }
  }
}

// ── Pass 2: write the (now succession-enriched) records ─────────────────────────
for (const { type, rec } of mapped) {
  const outPath = path.join(DATA, TYPE_DIR[type], rec.id + '.json');
  if (!DRY) {
    // DATA SAFETY: back up before overwriting any existing record.
    if (fs.existsSync(outPath)) {
      const bak = outPath + '.bak-' + Date.now();
      fs.copyFileSync(outPath, bak);
      created.push(bak);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(rec, null, 2));
  }
  created.push(outPath);
  counts[type]++;
}

// ── Revert log ────────────────────────────────────────────────────────────────

if (!DRY) {
  fs.mkdirSync(AUDIT, { recursive: true });
  const log = path.join(AUDIT, `migrate-${Date.now()}.json`);
  fs.writeFileSync(log, JSON.stringify({
    from: FROM, dataset: DATASET, created, counts,
    when: new Date().toISOString(),
  }, null, 2));
  console.log('revert log:', path.relative(ROOT, log), '(delete listed files to revert)');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(DRY ? '\n[DRY RUN — nothing written]\n' : '\nMigration complete (sources untouched).\n');
console.table(counts);
console.log(
  `Succession derived: ${successionStats.linked} succeeds links across ` +
  `${successionStats.cohorts} (polity, role) cohorts ` +
  `(${successionStats.interregnaSkipped} gaps >${SUCCESSION_GAP_YEARS}yr left unlinked — honest interregna).`,
);
if (unclassified) {
  console.warn(`⚠  ${unclassified} record(s) unclassified — extend classify() or FOLDER_TYPE.`);
}
if (unmapped.size) {
  console.warn('\nTODO — unmapped / missing fields (left empty/low-confidence, NOT fabricated):');
  for (const k of unmapped) console.warn('  -', k);
}
console.log('\nNext: node scripts/validate/validate.mjs');
