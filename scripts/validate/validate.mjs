#!/usr/bin/env node
/**
 * validate.mjs — functional validator for migrated InvaderGIS data.
 *
 * Real checks:
 *   - Schema completeness (id, required fields)
 *   - Atlas-window bounds (dates inside dataset time window)
 *   - Date ordering (formed ≤ dissolved, reign_start ≤ reign_end, since ≤ until)
 *   - Reference integrity (provenance.sources_used, relationship from/to, event.entity)
 *   - Deduplication (no two records share an id)
 *   - Geometry bounds (polygon points within dataset bounding box)
 *   - Source licence check: source records of kind 'dataset' require a licence
 *     (docs/03_LEGAL.md §4 — SPDX id required)
 *
 * CI-friendly: exit 1 on any hard error, exit 0 on warnings-only.
 *
 * Usage:
 *   node scripts/validate/validate.mjs [--dataset <id>]
 *
 * --dataset  Dataset id to read bounds from (default: medieval-europe-500-1500).
 *            Time bounds are read from data/vocab/<dataset-id>.json if present,
 *            falling back to hardcoded medieval defaults (500–1500).
 *            Out-of-window dates produce WARNINGS (not hard errors) unless the
 *            dataset's vocab file sets "strictWindow": true.
 *
 * Phase G3 changes (2026-05-27):
 *   - Added --dataset flag; time window / bounds now read from vocab JSON.
 *   - Out-of-window dates downgraded to warning (not error) unless strictWindow.
 *   - Source licence check added (dataset kind → licence required).
 *   - relationship: also validates participants[].entity_id refs in addition
 *     to from_id / to_id back-compat fields.
 *
 * Bug-fix batch (2026-05-27):
 *   Bug 1 — date-ordering checks now treat null/undefined end as "ongoing" (no error).
 *     Only flag when BOTH dates are real numbers AND end < start.
 *   Bug 3 — deduplication is now per-type (within each type folder), not global.
 *     Cross-type same-id (e.g. hanseatic_league as polity + institution) is allowed
 *     because records are keyed by (type, id) at load time, not by id alone.
 */
import fs from 'node:fs';
import path from 'node:path';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DATASET_ID = args.includes('--dataset')
  ? args[args.indexOf('--dataset') + 1]
  : 'medieval-europe-500-1500';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');

// ── Dataset config (time window + spatial bounds) ─────────────────────────────
// Read from data/vocab/<dataset-id>.json if available, else use medieval defaults.

const MEDIEVAL_DEFAULTS = {
  window:  { start: 500, end: 1500 },
  bounds:  { latMin: 20, latMax: 72, lonMin: -25, lonMax: 60 },
  strict:  false,
};

let WINDOW       = MEDIEVAL_DEFAULTS.window;
let BOUNDS       = MEDIEVAL_DEFAULTS.bounds;
let STRICT_WINDOW = MEDIEVAL_DEFAULTS.strict;

// Resolve the vocab file: prefer data/vocab/<datasetId>.json, but fall back to
// data/vocab/medieval.json (the actual dataset #1 bundle the app loads). Without
// this fallback the validator never found the bundle and used a Europe-only bbox,
// flagging ~2,851 real out-of-Europe polygon points as warnings (Wave-2 B.1 fix).
const datasetVocabPath = path.join(DATA, 'vocab', `${DATASET_ID}.json`);
const vocabPath = fs.existsSync(datasetVocabPath)
  ? datasetVocabPath
  : path.join(DATA, 'vocab', 'medieval.json');
// Category derivation map (mirrors bake-manifests.mjs §8). An event's category is
// DERIVED from its `type` at bake time, not stored in the raw record — so the
// validator must check that a category CAN be derived, not that the raw field exists.
let SUBTYPE_TO_CATEGORY = {};
let FALLBACK_CATEGORY = 'power';

if (fs.existsSync(vocabPath)) {
  try {
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    SUBTYPE_TO_CATEGORY = vocab.subtypeToCategory ?? {};
    FALLBACK_CATEGORY   = vocab.fallbackCategory ?? 'power';
    // time window — from datasetId-level fields if present (not in medieval.json currently)
    if (vocab.window?.start != null && vocab.window?.end != null) {
      WINDOW = { start: Number(vocab.window.start), end: Number(vocab.window.end) };
    }
    if (vocab.bounds) {
      BOUNDS = {
        latMin: Number(vocab.bounds.latMin ?? BOUNDS.latMin),
        latMax: Number(vocab.bounds.latMax ?? BOUNDS.latMax),
        lonMin: Number(vocab.bounds.lonMin ?? BOUNDS.lonMin),
        lonMax: Number(vocab.bounds.lonMax ?? BOUNDS.lonMax),
      };
    }
    STRICT_WINDOW = vocab.strictWindow === true;
    console.log(`[validate] dataset: ${DATASET_ID} — window ${WINDOW.start}–${WINDOW.end}${STRICT_WINDOW ? ' (strict)' : ' (warn-only)'}`);
  } catch (e) {
    console.warn(`[validate] could not parse vocab/${DATASET_ID}.json — using medieval defaults`);
  }
} else {
  // For the default medieval dataset, vocab file is medieval.json (not the dataset-id key).
  // If no vocab found, report clearly and proceed with defaults.
  console.log(`[validate] dataset: ${DATASET_ID} — using default window ${WINDOW.start}–${WINDOW.end} (warn-only)`);
}

// ── Type map ─────────────────────────────────────────────────────────────────

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
  // Wave 3 / Phase C — geo-escalated kinds
  settlement:   'settlements',
  military:     'military',
  capital:      'capitals',
};

// ── Load all records ──────────────────────────────────────────────────────────

const byType = {};
const ids    = new Set();
const all    = [];

for (const [type, dir] of Object.entries(TYPE_DIR)) {
  byType[type] = [];
  const d = path.join(DATA, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      r.__type = type;
      byType[type].push(r);
      all.push(r);
      ids.add(r.id);
    } catch (e) {
      console.warn(`[validate] skip unparseable ${path.join(dir, f)}`);
    }
  }
}

// ── Validation helpers ────────────────────────────────────────────────────────

const errors = [];
const warns  = [];
/** Count of internal donor-geojson-* geometry-provenance markers (not citations). */
let donorGeomRefs = 0;

/** Returns true if year is within the dataset window (or null/undefined = unconstrained). */
const inWindow = (y) => y == null || (y >= WINDOW.start && y <= WINDOW.end);

/**
 * Grace margin (years) for point-in-time / range dates that fall just outside the
 * window. Events foundational to or bleeding just past the medieval era (Clovis
 * 496, Fall of Rome 476, Mohács-context 1515) are legitimately included as
 * context; only dates genuinely distant from the window (Adrianople 378, Union of
 * Lublin 1569) are flagged. Applies to point dates (event.year) and date ranges
 * (start_year/end_year on settlement/military/capital records), NOT to polity
 * intervals (those use interval overlap, which already covers any straddle).
 */
const WINDOW_GRACE = 25;
const inWindowGrace = (y) =>
  y == null || (y >= WINDOW.start - WINDOW_GRACE && y <= WINDOW.end + WINDOW_GRACE);

/**
 * Returns true if an entity's active interval [formed, dissolved] OVERLAPS the
 * dataset window. A null/undefined formed is treated as -∞ (always-existed),
 * a null/undefined dissolved as +∞ (still active). An entity that merely STRADDLES
 * a window boundary (e.g. Byzantium 330–1453, Delhi Sultanate 1206–1526) overlaps
 * and is legitimately in-scope; only an interval ENTIRELY before WINDOW.start or
 * entirely after WINDOW.end is genuinely out of scope. This stops ~47 real medieval
 * polities being flagged just because one endpoint pokes past 500 or 1500.
 */
const intervalOverlapsWindow = (formed, dissolved) => {
  const lo = typeof formed === 'number' ? formed : -Infinity;
  const hi = typeof dissolved === 'number' ? dissolved : Infinity;
  return lo <= WINDOW.end && hi >= WINDOW.start;
};

/** Returns true if the given id is known (empty string is allowed — unresolved refs warn). */
const resolves = (id) => !id || ids.has(id);

/**
 * Yield every [lon, lat] position from a polygon value, regardless of shape.
 * Handles GeoJSON geometry objects ({ type, coordinates }) of arbitrary nesting
 * (Polygon, MultiPolygon) AND legacy flat ring arrays. A position is recognised
 * as a 2-element array of finite numbers; all deeper nesting is walked recursively.
 * Non-array / empty input yields nothing.
 *
 * COORDINATE ORDER (important — was the cause of ~172 false out-of-bounds warns):
 * In the RAW `data/` records, polygon positions are stored [lat, lon] in BOTH
 * forms (the project-wide record convention; the bake step is what later swaps to
 * GeoJSON [lon, lat] for the public layers). Verified 2026-06-01: flat ring
 * `alwa` first pair [12.66, 34.7] = lat,lon; GeoJSON-object `abbasid_caliphate`
 * first pair [25.54, 50.15] = lat,lon. This generator therefore SWAPS each stored
 * [lat, lon] to [lon, lat] before yielding, so the bounds check (which expects
 * [lon, lat]) compares the right axes. Without the swap, east-of-85°-longitude
 * polities (Annam, Champa, Chagatai, …) had their longitude misread as latitude
 * and were wrongly flagged as out of the [-90,90] latitude band.
 */
function* geoCoords(polygon) {
  const coords = Array.isArray(polygon) ? polygon : polygon?.coordinates;
  yield* walk(coords);
  function* walk(node) {
    if (!Array.isArray(node)) return;
    if (
      node.length === 2 &&
      typeof node[0] === 'number' &&
      typeof node[1] === 'number'
    ) {
      // Stored [lat, lon] → yield as [lon, lat] to match the bounds check.
      yield [node[1], node[0]];
      return;
    }
    for (const child of node) yield* walk(child);
  }
}

function windowIssue(id, msg) {
  if (STRICT_WINDOW) errors.push(`${id}: ${msg}`);
  else warns.push(`${id}: ${msg}`);
}

// ── Main validation loop ──────────────────────────────────────────────────────

for (const r of all) {
  if (!r.id) { errors.push('record with no id'); continue; }

  // Provenance source references.
  // `donor-geojson-*` ids are NOT bibliographic citations — they are internal
  // geometry-provenance markers meaning "this point's coordinates came from the
  // donor GeoJSON" (settlement/military/capital geo-layers escalated to records
  // in wave 3). They have no source record by design and must not be flagged as a
  // missing citation. They are tallied separately so coverage stays honest.
  for (const s of r.provenance?.sources_used ?? []) {
    if (typeof s === 'string' && s.startsWith('donor-geojson-')) {
      donorGeomRefs++;
      continue;
    }
    if (!resolves(s)) warns.push(`${r.id}: source not found → ${s}`);
  }

  // ── polity ───────────────────────────────────────────────────────────────
  if (r.__type === 'polity') {
    // Warn only when the entity's whole [formed, dissolved] interval lies OUTSIDE
    // the window. A boundary straddle (formed<500 but active into the window, or
    // dissolved>1500 having existed within it) is a real in-scope medieval entity,
    // not an error — flagging those was ~47 false positives.
    if (!intervalOverlapsWindow(r.formed, r.dissolved)) {
      windowIssue(r.id, `interval (${r.formed}–${r.dissolved}) entirely outside ${WINDOW.start}–${WINDOW.end}`);
    }
    // BUG 1 FIX: null dissolved = open interval (entity still exists). Only error
    // when BOTH are real numbers AND end is before start.
    if (typeof r.formed === 'number' && typeof r.dissolved === 'number' && r.dissolved < r.formed) {
      errors.push(`${r.id}: dissolved (${r.dissolved}) before formed (${r.formed})`);
    }
    for (const snap of r.polygon_snapshots ?? []) {
      // polygon may be a GeoJSON geometry object ({type, coordinates}) — the real
      // donor shape — or a legacy flat [[lon,lat],…] ring. Walk coords generically.
      // GeoJSON position order is [lon, lat].
      let pointCount = 0;
      let outOfBounds = 0;
      for (const [lon, lat] of geoCoords(snap.polygon)) {
        pointCount++;
        if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) {
          outOfBounds++;
        }
      }
      // Report once per snapshot, not per point, to avoid flooding on large rings.
      if (outOfBounds > 0) {
        warns.push(`${r.id}: ${outOfBounds}/${pointCount} polygon points outside dataset bounds (year ${snap.year})`);
      }
    }
  }

  // ── event ────────────────────────────────────────────────────────────────
  if (r.__type === 'event') {
    if (!inWindowGrace(r.year)) {
      windowIssue(r.id, `year (${r.year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
    }
    // entity ref check (empty string is allowed — coords-only events have no entity)
    if (r.entity && !resolves(r.entity)) {
      errors.push(`${r.id}: event.entity unresolved → ${r.entity}`);
    }
    // Category is DERIVED from `type` at bake time (SUBTYPE_TO_CATEGORY[type] ??
    // FALLBACK_CATEGORY), not stored on the raw record. So warn only when a
    // category can NOT be derived — i.e. the event carries neither an explicit
    // category nor a `type` to map from. A type that isn't in the map still
    // resolves to FALLBACK_CATEGORY at bake, so a present type is sufficient.
    if (!r.category && !r.type) {
      warns.push(`${r.id}: event has no category and no type to derive one from`);
    }
  }

  // ── journey ──────────────────────────────────────────────────────────────
  if (r.__type === 'journey') {
    if (r.year_start != null && r.year_end != null && r.year_end < r.year_start) {
      errors.push(`${r.id}: year_end before year_start`);
    }
  }

  // ── ruler ────────────────────────────────────────────────────────────────
  if (r.__type === 'ruler') {
    // BUG 1 FIX: null reign_end = open/ongoing reign. Only error when both are real numbers.
    if (typeof r.reign_start === 'number' && typeof r.reign_end === 'number' && r.reign_end < r.reign_start) {
      errors.push(`${r.id}: reign_end (${r.reign_end}) before reign_start (${r.reign_start})`);
    }
    if (r.polity && !resolves(r.polity)) {
      warns.push(`${r.id}: ruler.polity unresolved → ${r.polity}`);
    }
  }

  // ── relationship ─────────────────────────────────────────────────────────
  if (r.__type === 'relationship') {
    // Validate legacy dyad fields
    if (r.from_id && !resolves(r.from_id)) {
      errors.push(`${r.id}: relationship.from_id unresolved → ${r.from_id}`);
    }
    if (r.to_id && !resolves(r.to_id)) {
      errors.push(`${r.id}: relationship.to_id unresolved → ${r.to_id}`);
    }
    // Validate participants[] entity_id refs
    for (const p of r.participants ?? []) {
      if (p.entity_id && !resolves(p.entity_id)) {
        warns.push(`${r.id}: participants entity_id unresolved → ${p.entity_id}`);
      }
    }
    // BUG 1 FIX: null until = open/ongoing relationship. Only error when both are real numbers.
    if (typeof r.since === 'number' && typeof r.until === 'number' && r.until < r.since) {
      errors.push(`${r.id}: until (${r.until}) before since (${r.since})`);
    }
  }

  // ── source ───────────────────────────────────────────────────────────────
  if (r.__type === 'source') {
    // docs/03_LEGAL.md §4: source records of kind 'dataset' MUST carry a licence.
    const kind = r.kind_type ?? r.kind;
    if (kind === 'dataset' && !r.license) {
      errors.push(`${r.id}: source of kind 'dataset' is missing required license (SPDX id)`);
    }
  }

  // ── settlement (Wave 3 / Phase C) ────────────────────────────────────────
  if (r.__type === 'settlement') {
    if (!r.name) warns.push(`${r.id}: settlement.name missing`);
    // Date ordering: null end = open interval (settlement still exists) — no error.
    if (typeof r.start_year === 'number' && typeof r.end_year === 'number' && r.end_year < r.start_year) {
      errors.push(`${r.id}: end_year (${r.end_year}) before start_year (${r.start_year})`);
    }
    if (!inWindowGrace(r.start_year)) windowIssue(r.id, `start_year (${r.start_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
    if (!inWindowGrace(r.end_year))   windowIssue(r.id, `end_year (${r.end_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
  }

  // ── military (Wave 3 / Phase C) ──────────────────────────────────────────
  if (r.__type === 'military') {
    if (!r.name) warns.push(`${r.id}: military.name missing`);
    if (typeof r.start_year === 'number' && typeof r.end_year === 'number' && r.end_year < r.start_year) {
      errors.push(`${r.id}: end_year (${r.end_year}) before start_year (${r.start_year})`);
    }
    if (!inWindowGrace(r.start_year)) windowIssue(r.id, `start_year (${r.start_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
    if (!inWindowGrace(r.end_year))   windowIssue(r.id, `end_year (${r.end_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
  }

  // ── capital (Wave 3 / Phase C) ────────────────────────────────────────────
  if (r.__type === 'capital') {
    if (!r.name) warns.push(`${r.id}: capital.name missing`);
    if (typeof r.start_year === 'number' && typeof r.end_year === 'number' && r.end_year < r.start_year) {
      errors.push(`${r.id}: end_year (${r.end_year}) before start_year (${r.start_year})`);
    }
    if (!inWindowGrace(r.start_year)) windowIssue(r.id, `start_year (${r.start_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
    if (!inWindowGrace(r.end_year))   windowIssue(r.id, `end_year (${r.end_year}) outside ${WINDOW.start}–${WINDOW.end} (±${WINDOW_GRACE})`);
  }
}

// ── Deduplication ────────────────────────────────────────────────────────────
// BUG 3 FIX: dedup is per-type, not global. Records are always loaded and keyed
// by (type, id) — each type lives in its own folder and its own byType[] array.
// Cross-type same-id (e.g. hanseatic_league exists as both polity in entities/
// AND institution in institutions/) is legitimate: they are distinct record types
// modelling different facets of the same historical entity.
// Only flag duplicates WITHIN the same type.

for (const [type, records] of Object.entries(byType)) {
  const seenInType = new Set();
  for (const r of records) {
    if (seenInType.has(r.id)) errors.push(`duplicate id within type '${type}': ${r.id}`);
    seenInType.add(r.id);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const typeCount = Object.values(byType).filter((a) => a.length > 0).length;
console.log(`\nvalidated ${all.length} records across ${typeCount} types`);
warns.forEach((w)  => console.warn('warn:', w));
errors.forEach((e) => console.error('ERROR:', e));
console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
if (donorGeomRefs > 0) {
  console.log(`(plus ${donorGeomRefs} internal donor-geojson geometry-provenance refs — not citations, not counted as warnings)`);
}
process.exit(errors.length ? 1 : 0);
