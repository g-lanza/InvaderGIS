#!/usr/bin/env node
/**
 * bake-manifests.mjs — Static artifact baker for InvaderGIS (Spine 2c-i).
 *
 * Reads all 4,032 real records from data/ and writes static JSON/GeoJSON
 * artifacts into public/data/ and public/index/. The Vite dev server and
 * production build both serve public/ at the URL root, so loaders fetch
 * these files at runtime instead of bundling them.
 *
 * OUTPUT LAYOUT
 * ─────────────
 * public/
 *   data/
 *     manifest.json                   ← dataset id, bake timestamp, counts
 *     records/
 *       polity.json                   ← full record array (268 records)
 *       event.json                    ← full record array (2,914 records)
 *       journey.json                  ← full record array (152 records)
 *       relationship.json             ← full record array (428 records)
 *       ruler.json                    ← full record array (168 records)
 *       source.json                   ← full record array (52 records)
 *       institution.json              ← full record array (38 records)
 *       technology.json               ← full record array (6 records)
 *       text.json                     ← full record array (6 records)
 *     layers/
 *       polities.geojson              ← FeatureCollection, one Feature per
 *                                        polygon_snapshot (GeoJSON [lon,lat])
 *       events.geojson                ← FeatureCollection, Point per event
 *                                        that has coords (stored [lat,lon],
 *                                        emitted as [lon,lat] for GeoJSON)
 *   index/
 *     polity.json                     ← id/name index (light, for search)
 *     event.json
 *     … (one per type)
 *     by-year/
 *       <year>.json                   ← array of record ids active that year
 *     adjacency.json                  ← relationship adjacency map
 *     search.json                     ← flat search index {id,t,n}[]
 *
 * COORDINATE NOTE
 * ───────────────
 * ALL coordinate data in this corpus is stored as [lat, lon] — verified:
 *   - Battle of Hastings event.coords = [50.91, 0.57] → 50.9°N, 0.57°E (Sussex ✓)
 *   - Alhambra event.coords = [37.176, -3.588] → 37.18°N, 3.59°W (Granada ✓)
 *   - Abbasid polygon first vertex = [25.53, 50.14] → 25.5°N, 50.1°E (Persian Gulf ✓)
 *   - Anglo-Saxon polygon first vertex = [51.51, 0.86] → 51.5°N, 0.86°E (Essex ✓)
 *
 * GeoJSON standard requires [lon, lat]. The baker swaps ALL coordinate pairs:
 *   event.coords:    [lat, lon] → geojson: [lon, lat]
 *   polygon ring:    each [lat, lon] pair → [lon, lat] pair (recursive swap)
 *
 * REALNESS LAW
 * ────────────
 * This script reads data/ and writes only public/data/ and public/index/.
 * It never modifies data/ or the quarry. Missing geometry → record simply
 * has no map feature. No fake geometry is ever emitted.
 *
 * Run via: npm run bake
 */

import fs   from 'node:fs';
import path from 'node:path';

// ── Dataset parameterization (additive, 2026-06-01) ───────────────────────────
//
// The baker bakes one dataset per run. By DEFAULT it bakes the medieval dataset
// exactly as before (no behavior change). A second dataset (Fordham Sourcebook,
// Dataset #2) is baked by setting BAKE_DATASET=fordham, which routes input from
// data/fordham/ → output public/data/fordham/ and public/index/fordham/ and
// stamps the manifest datasetId accordingly. Each dataset's window may differ;
// medieval stays 500–1500.
//
// Recognised env vars (all optional; unset = medieval default):
//   BAKE_DATASET     dataset id slug used for output sub-dir + manifest id
//   BAKE_DATA_DIR    absolute/relative input dir (overrides data/<slug>)
//   BAKE_OUT_DIR     absolute/relative output public dir (overrides public/data/<slug>)
//
// Known dataset profiles (id + window) live here so the baker is self-contained;
// the runtime FORDHAM_DATASET constant in datasetStore.ts must agree.

const ROOT = process.cwd();

const DATASETS = {
  medieval: { id: 'medieval-europe-500-1500',     dataDir: 'data',          window: { start: 500, end: 1500 } },
  fordham:  { id: 'fordham-medieval-sourcebook',  dataDir: 'data/fordham',  window: { start: 500, end: 1500 } },
};

const BAKE_DATASET = process.env.BAKE_DATASET ?? 'medieval';
const PROFILE = DATASETS[BAKE_DATASET] ?? DATASETS.medieval;
const IS_MEDIEVAL = PROFILE.id === DATASETS.medieval.id;

// Input dir: env override → profile.dataDir → data/
const DATA = path.join(ROOT, process.env.BAKE_DATA_DIR ?? PROFILE.dataDir);

// Output dirs: medieval keeps the original public/data + public/index paths so
// nothing about Dataset #1 changes. Non-medieval datasets nest under a slug.
const OUT_DATA = process.env.BAKE_OUT_DIR
  ? path.join(ROOT, process.env.BAKE_OUT_DIR)
  : (IS_MEDIEVAL ? path.join(ROOT, 'public', 'data')  : path.join(ROOT, 'public', 'data',  BAKE_DATASET));
const OUT_INDEX = IS_MEDIEVAL
  ? path.join(ROOT, 'public', 'index')
  : path.join(ROOT, 'public', 'index', BAKE_DATASET);

console.log(`[bake] dataset="${PROFILE.id}"  in="${path.relative(ROOT, DATA)}"  out="${path.relative(ROOT, OUT_DATA)}"`);

// ── Type → directory mapping ──────────────────────────────────────────────────

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
  // Wave 6 / research-first layer — claim / annotation / research_question
  claim:              'claims',
  annotation:         'annotations',
  research_question:  'research_questions',
};

// ── Time window ───────────────────────────────────────────────────────────────

const WINDOW = PROFILE.window;

// ── Coordinate swap helpers ───────────────────────────────────────────────────
//
// All raw records store coordinates as [lat, lon]. GeoJSON requires [lon, lat].
// These helpers recursively swap every [lat, lon] pair in a geometry.

/**
 * Swap a single coordinate pair [lat, lon] → [lon, lat].
 * @param {[number, number]} pair
 * @returns {[number, number]}
 */
function swapPair(pair) {
  return [pair[1], pair[0]];
}

/**
 * Swap all coordinate pairs in a ring (array of [lat,lon] pairs).
 * @param {[number, number][]} ring
 * @returns {[number, number][]}
 */
function swapRing(ring) {
  return ring.map(swapPair);
}

/**
 * Swap all coordinate pairs in a GeoJSON geometry object.
 * Returns a new geometry object; never mutates the input.
 * Only handles Polygon and MultiPolygon (the only types in this corpus).
 *
 * @param {{ type: string, coordinates: unknown }} geom
 * @returns {{ type: string, coordinates: unknown }}
 */
function swapGeometry(geom) {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map(swapRing),
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) => poly.map(swapRing)),
    };
  }
  // Unknown geometry type — pass through unchanged (conservative)
  return geom;
}

// ── Vocabulary (subtypeToCategory) ───────────────────────────────────────────
// Read from data/vocab/medieval.json — the canonical source; never hardcoded.

// Vocab lives with the medieval corpus (data/vocab/medieval.json). Non-medieval
// datasets reuse the same subtype→category mapping until they ship their own;
// read it from the repo data/ dir, not the (possibly different) input DATA dir.
const medievalVocab = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'vocab', 'medieval.json'), 'utf8'),
);
/** @type {Record<string, string>} */
const SUBTYPE_TO_CATEGORY = medievalVocab.subtypeToCategory ?? {};
const FALLBACK_CATEGORY   = medievalVocab.fallbackCategory ?? 'power';

// ── Ensure output directories exist ──────────────────────────────────────────

fs.mkdirSync(path.join(OUT_DATA, 'records'),  { recursive: true });
fs.mkdirSync(path.join(OUT_DATA, 'layers'),   { recursive: true });
fs.mkdirSync(path.join(OUT_INDEX, 'by-year'), { recursive: true });

// ── 1. Read all records ───────────────────────────────────────────────────────

/** @type {Record<string, object[]>} */
const byType = {};
/** @type {object[]} */
const all = [];

for (const [type, dir] of Object.entries(TYPE_DIR)) {
  byType[type] = [];
  const d = path.join(DATA, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    let r;
    try {
      r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    } catch (e) {
      console.warn(`  [SKIP] parse error in ${dir}/${f}: ${e.message}`);
      continue;
    }
    if (!r || typeof r.id !== 'string' || r.id.length === 0) continue;
    r.__type = type;
    byType[type].push(r);
    all.push(r);
  }
}

// ── 1b. Generate readable relationship names (Item 5) ─────────────────────────
//
// Relationship records carry no `name` field — historically the UI fell back to
// the raw id (e.g. "rel_amalfi_byzantine"). Generate a human display name from
// the participants' resolved entity names + the humanized relationship type,
// e.g. "Abbasid Caliphate – Fatimid Caliphate (Rivalry)". This writes a derived
// `name` into the baked OUTPUT only (public/); data/ is never modified.

// id → display name, with POLITY PRECEDENCE. Relationship participants always
// reference polities (verified: 0 non-polity participant ids), but ~231 capital
// and institution records REUSE their polity's id (e.g. capital `abbasid_caliphate`
// has name "Cairo"). Resolving against the merged record set would let a capital
// overwrite its polity, yielding "Cairo – Cairo (Rivalry)". So seed the map from
// polities first, then fill any remaining ids from other types as a fallback.
/** @type {Record<string, string|null>} */
const nameById = {};
for (const r of byType.polity ?? []) {
  nameById[r.id] = r.name_primary ?? r.name ?? r.title ?? null;
}
for (const r of all) {
  if (nameById[r.id] == null) {
    nameById[r.id] = r.name_primary ?? r.name ?? r.title ?? null;
  }
}

/** Title-case a snake_case type token: "dynastic_union" → "Dynastic Union". */
function humanizeRelType(type) {
  if (!type) return '';
  return String(type)
    .split('_')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/**
 * Build a readable relationship name from its participants + type.
 * Returns null when fewer than two participants resolve to names (caller keeps
 * the existing fallback chain — never fabricates).
 */
function relationshipName(r) {
  const ps = Array.isArray(r.participants) ? r.participants : [];
  const a = ps[0]?.entity_id ? nameById[ps[0].entity_id] : null;
  const b = ps[1]?.entity_id ? nameById[ps[1].entity_id] : null;
  if (!a || !b) return null;
  const typeLabel = humanizeRelType(r.type);
  return typeLabel ? `${a} – ${b} (${typeLabel})` : `${a} – ${b}`;
}

let relNamed = 0;
for (const r of byType.relationship ?? []) {
  if (typeof r.name === 'string' && r.name) continue; // never overwrite a real name
  const generated = relationshipName(r);
  if (generated) {
    r.name = generated;
    relNamed++;
  }
}
console.log(`[names]   generated ${relNamed} relationship display names`);

// ── 2. Per-type FULL record bundles → public/data/records/<type>.json ─────────

for (const [type, recs] of Object.entries(byType)) {
  fs.writeFileSync(
    path.join(OUT_DATA, 'records', `${type}.json`),
    JSON.stringify(recs),
  );
}
console.log(`[records] wrote ${Object.keys(byType).length} type bundles → public/data/records/`);

// ── 3. Per-type id/name index → public/index/<type>.json ─────────────────────

for (const [type, recs] of Object.entries(byType)) {
  fs.writeFileSync(
    path.join(OUT_INDEX, `${type}.json`),
    JSON.stringify(
      recs.map((r) => ({
        id:     r.id,
        name:   r.name_primary ?? r.name ?? r.title,
        __type: type,
      })),
    ),
  );
}
console.log(`[index]   wrote per-type id/name index → public/index/`);

// ── 4. Year slices → public/index/by-year/<year>.json ────────────────────────

/**
 * Return the [start, end] active span for a record; null means excluded from
 * the temporal index (sources, institutions, technologies, texts).
 * @param {object} r
 * @returns {[number|null, number|null]}
 */
function spanOf(r) {
  switch (r.__type) {
    case 'polity':       return [r.formed,      r.dissolved ?? WINDOW.end];
    case 'event':        return [r.year,         r.year];
    case 'ruler':        return [r.reign_start,  r.reign_end ?? WINDOW.end];
    case 'relationship': return [r.since,        r.until ?? WINDOW.end];
    case 'journey':      return [r.year_start,   r.year_end ?? r.year_start];
    // Wave 3 / Phase C — geo-escalated kinds use start_year / end_year
    case 'settlement':   return [r.start_year,  r.end_year ?? WINDOW.end];
    case 'military':     return [r.start_year,  r.end_year ?? WINDOW.end];
    case 'capital':      return [r.start_year,  r.end_year ?? WINDOW.end];
    default:             return [null, null];
  }
}

let yearSliceCount = 0;
for (let y = WINDOW.start; y <= WINDOW.end; y++) {
  const ids = [];
  for (const r of all) {
    // Relationships may have active_periods[]
    if (r.__type === 'relationship' && Array.isArray(r.active_periods) && r.active_periods.length > 0) {
      for (const [s, e] of r.active_periods) {
        if (typeof s === 'number' && typeof e === 'number' && s <= y && e >= y) {
          ids.push(r.id);
          break;
        }
      }
      continue;
    }
    const [s, e] = spanOf(r);
    if (s != null && s <= y && (e ?? WINDOW.end) >= y) ids.push(r.id);
  }
  if (ids.length) {
    fs.writeFileSync(
      path.join(OUT_INDEX, 'by-year', `${y}.json`),
      JSON.stringify(ids),
    );
    yearSliceCount++;
  }
}
console.log(`[year]    wrote ${yearSliceCount} year slices → public/index/by-year/`);

// ── 5. Relationship adjacency → public/index/adjacency.json ──────────────────

/** @type {Record<string, {to:string, type:string, since:number|null}[]>} */
const adj = {};
for (const r of byType.relationship ?? []) {
  const fromId = r.from_id || (r.participants?.[0]?.entity_id ?? null);
  const toId   = r.to_id   || (r.participants?.[1]?.entity_id ?? null);
  if (!fromId || !toId) continue;
  (adj[fromId] ??= []).push({ to: toId,   type: r.type, since: r.since ?? null });
  (adj[toId]   ??= []).push({ to: fromId, type: r.type, since: r.since ?? null });
}
fs.writeFileSync(path.join(OUT_INDEX, 'adjacency.json'), JSON.stringify(adj));
console.log(`[adj]     wrote adjacency.json (${Object.keys(adj).length} nodes)`);

// ── 6. Flat search index → public/index/search.json ──────────────────────────

/**
 * Build a compact, lowercased KEYWORDS string for a record from a few facets
 * already on it. This lets the CommandBar match by more than the display name —
 * e.g. "anatolia" (region), "alliance" (relationship type), "war" (event
 * category) — ranked BELOW name matches. Realness law: keywords derive only from
 * existing baked fields; nothing is fabricated.
 */
function buildKeywords(r) {
  const parts = [];
  const push = (v) => {
    if (typeof v === 'string' && v) parts.push(v);
  };
  switch (r.__type) {
    case 'polity':
      push(r.region);
      push(r.type);
      break;
    case 'event':
      push(r.category);
      push(r.type);
      push(r.region);
      break;
    case 'relationship': {
      push(r.type);
      const ps = Array.isArray(r.participants) ? r.participants : [];
      for (const p of ps) {
        const nm = p?.entity_id ? nameById[p.entity_id] : null;
        if (nm) parts.push(nm);
      }
      break;
    }
    case 'ruler':
      push(r.title);
      push(r.region);
      // succeeds/polity link → the polity's name if resolvable
      if (r.polity && nameById[r.polity]) parts.push(nameById[r.polity]);
      break;
    case 'capital':
    case 'settlement':
    case 'military':
      push(r.type);
      push(r.region);
      if (r.entity_id && nameById[r.entity_id]) parts.push(nameById[r.entity_id]);
      break;
    case 'journey':
      push(r.kind);
      push(r.type);
      break;
    default:
      push(r.type);
      push(r.region);
      break;
  }
  // De-dupe, lowercase, join. Replace underscores so "dynastic_union" → "dynastic union".
  const uniq = [...new Set(parts.map((p) => String(p).toLowerCase().replace(/_/g, ' ')))];
  return uniq.join(' ');
}

const search = all.map((r) => {
  const entry = {
    id: r.id,
    t:  r.__type,
    // name fallback chain covers all record kinds:
    //   name_primary  — polity, ruler, technology, text, institution, journey, source
    //   name          — event, relationship, capital, settlement, military, language
    //   title         — (reserved for future use)
    //   statement     — claim (the human-readable assertion text)
    //   question      — research_question (the research question text)
    //   id            — last resort (always present)
    n:  r.name_primary ?? r.name ?? r.title ?? r.statement ?? r.question ?? r.id,
  };
  // k — optional lowercased keywords for field-aware matching (omitted when empty
  // to keep the index small; the search layer treats a missing k as "no keywords").
  const k = buildKeywords(r);
  if (k) entry.k = k;
  return entry;
});
fs.writeFileSync(path.join(OUT_INDEX, 'search.json'), JSON.stringify(search));
const withKeywords = search.filter((e) => e.k).length;
console.log(`[search]  wrote search.json (${search.length} entries, ${withKeywords} with keywords)`);

// ── 7. Polities GeoJSON → public/data/layers/polities.geojson ────────────────
//
// One Feature per polygon_snapshot. Geometry is copied verbatim (already in
// GeoJSON [lon, lat] order — verified by sampling). Records with no snapshots
// or no polygon geometry are silently skipped (no fake shapes).

const polityFeatures = [];

for (const r of byType.polity ?? []) {
  const snapshots = r.polygon_snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) continue;

  for (const snap of snapshots) {
    const rawGeom = snap.polygon;
    if (!rawGeom || !rawGeom.type || !rawGeom.coordinates) continue;
    // Only handle Polygon and MultiPolygon
    if (rawGeom.type !== 'Polygon' && rawGeom.type !== 'MultiPolygon') continue;

    // Swap [lat,lon] → [lon,lat] for every coordinate pair (GeoJSON standard)
    const geom = swapGeometry(rawGeom);

    polityFeatures.push({
      type: 'Feature',
      geometry: geom,
      properties: {
        id:           r.id,
        name:         r.name_primary ?? r.name ?? r.id,
        region:       r.region ?? null,
        formed:       r.formed  ?? null,
        dissolved:    r.dissolved ?? null,
        snapshotYear: snap.year ?? null,
      },
    });
  }
}

const polityGeoJSON = {
  type: 'FeatureCollection',
  features: polityFeatures,
};
fs.writeFileSync(
  path.join(OUT_DATA, 'layers', 'polities.geojson'),
  JSON.stringify(polityGeoJSON),
);
console.log(`[polities.geojson] ${polityFeatures.length} features (polygon snapshots)`);

// ── 8. Events GeoJSON → public/data/layers/events.geojson ────────────────────
//
// COORDINATE ORDER: Event records store coords as [lat, lon] (verified:
// Battle of Hastings [50.91, 0.57] = 50.9°N, 0.57°E; Alhambra [37.176, -3.588]
// = 37.18°N, 3.59°W). GeoJSON standard requires [lon, lat].
// We swap: geojson_position = [record.coords[1], record.coords[0]].
//
// Events without coords are skipped (no fake positions).

// ── Tier mapping ──────────────────────────────────────────────────────────────
//
// Each event feature is stamped with a `tier` integer (1 = highest render
// priority, 3 = lowest) derived DETERMINISTICALLY from the existing `category`
// field. This is render-declutter priority only — NOT a historical-importance
// judgment. The mapping reflects which categories tend to dominate at world
// overview zoom in a medieval atlas context, and is documented here for
// auditability. Every event remains fully queryable and clickable at every zoom
// regardless of tier (see eventsLayer.ts Wave 4B comment).
//
// Tier 1 — power, religion, diplomacy, discovery  (~527 events, ~18%)
//   The rare, high-signal categories: political state changes, religious
//   institutions, diplomatic acts, and exploration milestones. These are the
//   turning points that remain legible and uncluttered at world-overview zoom
//   precisely because they are few.
// Tier 2 — culture, economy, hazard  (~126 events, ~4%)
//   Significant but not the visual priority at overview zoom; surface at zoom 4+.
// Tier 3 — violence + any unmapped fallback  (~2261 events, ~78%)
//   Violence (2,250 records) is 77% of the corpus and creates severe overdraw
//   at low zoom. Thinning it first is a render-frequency decision, NOT a claim
//   that any individual violent event matters less historically. Every violence
//   event remains fully queryable and clickable at every zoom; only its opacity
//   is reduced below zoom 4. At zoom 6+ the full corpus renders at full opacity.
//
// This mapping is a pure function of `category` (deterministic, no per-event
// invention). It is render-declutter priority by category frequency and signal
// density — NOT a historical-importance ranking. Adding a new category: assign
// its tier here; existing records are unchanged.
/** @type {Record<string, 1|2|3>} */
const CATEGORY_TIER = {
  power:     1,
  religion:  1,
  diplomacy: 1,
  discovery: 1,
  culture:   2,
  economy:   2,
  hazard:    2,
  violence:  3,
  // Any unmapped category falls through to tier 3 below.
};

/**
 * Return the render tier (1–3) for a given category string.
 * Pure function of the category value — no per-event invention.
 * @param {string} category
 * @returns {1|2|3}
 */
function categoryTier(category) {
  return CATEGORY_TIER[category] ?? 3;
}

// Tier distribution counters for the bake summary.
const tierCounts = { 1: 0, 2: 0, 3: 0 };

const eventFeatures = [];

for (const r of byType.event ?? []) {
  const coords = r.coords;
  if (!Array.isArray(coords) || coords.length < 2) continue;
  if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;

  // Swap [lat, lon] → [lon, lat] for GeoJSON
  const lon = coords[1];
  const lat = coords[0];

  // Basic sanity check: lat in [-90,90], lon in [-180,180]
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

  const subtype  = typeof r.type === 'string' ? r.type : '';
  const category = SUBTYPE_TO_CATEGORY[subtype] ?? FALLBACK_CATEGORY;
  const tier     = categoryTier(category);
  tierCounts[tier]++;

  eventFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lon, lat],
    },
    properties: {
      id:       r.id,
      name:     r.name ?? r.id,
      year:     r.year ?? null,
      type:     subtype,
      category: category,
      tier:     tier,
    },
  });
}

// ── 8·b. Fold battle + siege military sites into the events layer as VIOLENCE ──
// Battles and sieges are violence events; the standalone "military" map layer
// rendered them with an exact start_year==end_year filter, so a single-year
// battle was invisible at almost every scrubber year. Routing them through the
// events layer gives them the events span window, the violence category solo,
// the legend, and the swords glyph. Military record coords are already [lon, lat]
// (NOT swapped, unlike event records which are [lat, lon]).
let battleEventCount = 0;
for (const r of byType.military ?? []) {
  if (r.subtype !== 'battle' && r.subtype !== 'siege') continue;
  const coords = r.coords;
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;
  const lon = coords[0];
  const lat = coords[1];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

  const category = 'violence';
  const tier = categoryTier(category);
  tierCounts[tier]++;
  eventFeatures.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id:       r.id,
      name:     r.name ?? r.id,
      // Battles are point-in-time: use start_year as the event year.
      year:     typeof r.start_year === 'number' ? r.start_year : null,
      type:     r.subtype,        // 'battle' | 'siege'
      category: category,         // violence
      tier:     tier,
    },
  });
  battleEventCount++;
}

const eventsGeoJSON = {
  type: 'FeatureCollection',
  features: eventFeatures,
};
fs.writeFileSync(
  path.join(OUT_DATA, 'layers', 'events.geojson'),
  JSON.stringify(eventsGeoJSON),
);
console.log(
  `[events.geojson]   ${eventFeatures.length} features (events with coords; +${battleEventCount} battle/siege as violence)` +
  ` | tier 1: ${tierCounts[1]}, tier 2: ${tierCounts[2]}, tier 3: ${tierCounts[3]}`,
);

// ── 8b. Journeys GeoJSON → public/data/layers/journeys.geojson ───────────────
//
// Each journey record (data/journeys/*.json) carries an ordered `waypoints[]`
// array, every waypoint with coords stored [lat, lon] (verified: Kaffa
// [45.04, 35.38] = 45°N, 35.4°E, Crimea ✓). GeoJSON needs [lon, lat], so each
// pair is swapped via swapPair().
//
// Output is ONE FeatureCollection holding two feature flavours, distinguished
// by the `geomKind` property so the layer module can split them into a line
// layer and a waypoint-dot layer off a single source:
//   - geomKind "line"     : a LineString through the journey's waypoints in
//                           chronological order (the path itself).
//   - geomKind "waypoint" : a Point per waypoint (the dots along the path).
//
// HONEST CURATION (mirrors the quarry useJourneysLayer logic, adapted to our
// schema): of the 152 journey records, 147 are kind_type "conquest" whose
// waypoints chain battle sites in date order and render as visually
// nonsensical zigzags — they are real records but NOT real travelled routes.
// We bake ALL journeys (data stays intact) but stamp each feature with a
// boolean `curated` flag (true only for the seven hand-authored journeys that
// trace genuine routes). The layer module defaults to curated-only so the map
// shows real journeys, not zigzag noise; the flag — not record deletion —
// keeps every record honest and recoverable.
//
// A journey contributes geometry only when it has ≥2 waypoints with valid
// coords (a LineString needs two points). Single-waypoint or coord-less
// journeys are skipped (no fake paths).

/** The seven hand-authored journeys that trace genuine travelled/spread routes. */
const CURATED_JOURNEY_IDS = new Set([
  'arab_conquest_634_661',
  'black_death_1346_1353',
  'ibn_battuta_1325_1354',
  'magyar_migration_830_900',
  'mansa_musa_hajj_1324_1325',
  'marco_polo_1271_1295',
  'mongol_invasions_1206_1260',
]);

/**
 * Validate + swap a waypoint's coords from [lat, lon] to GeoJSON [lon, lat].
 * Returns null when coords are missing, malformed, or out of range.
 * @param {{ coords?: unknown }} wp
 * @returns {[number, number] | null}
 */
function waypointLonLat(wp) {
  const c = wp && wp.coords;
  if (!Array.isArray(c) || c.length < 2) return null;
  if (typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  const lat = c[0];
  const lon = c[1];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

const journeyFeatures = [];
let journeyLineCount = 0;
let journeyCuratedLineCount = 0;

for (const r of byType.journey ?? []) {
  const waypoints = Array.isArray(r.waypoints) ? r.waypoints : [];
  // Collect valid [lon,lat] points in record order, retaining per-waypoint meta.
  const points = [];
  for (const wp of waypoints) {
    const lonLat = waypointLonLat(wp);
    if (lonLat === null) continue;
    points.push({ lonLat, place: typeof wp.place === 'string' ? wp.place : null, year: typeof wp.year === 'number' ? wp.year : null });
  }
  if (points.length < 2) continue; // No path without at least two points.

  const kind     = typeof r.kind_type === 'string' ? r.kind_type : 'individual_journey';
  const curated  = CURATED_JOURNEY_IDS.has(r.id);
  const yearStart = typeof r.year_start === 'number' ? r.year_start : null;
  const yearEnd   = typeof r.year_end === 'number' ? r.year_end : yearStart;

  journeyLineCount++;
  if (curated) journeyCuratedLineCount++;

  // LineString feature — the path.
  journeyFeatures.push({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map((p) => p.lonLat) },
    properties: {
      id:        r.id,
      name:      r.name ?? r.id,
      kind,
      curated,
      year_start: yearStart,
      year_end:   yearEnd,
      geomKind:  'line',
    },
  });

  // One Point feature per waypoint — the dots.
  points.forEach((p, i) => {
    journeyFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.lonLat },
      properties: {
        id:        r.id,
        name:      r.name ?? r.id,
        kind,
        curated,
        year_start: yearStart,
        year_end:   yearEnd,
        geomKind:  'waypoint',
        place:     p.place,
        waypointYear: p.year,
        waypointIndex: i,
      },
    });
  });
}

const journeysGeoJSON = {
  type: 'FeatureCollection',
  features: journeyFeatures,
};
fs.writeFileSync(
  path.join(OUT_DATA, 'layers', 'journeys.geojson'),
  JSON.stringify(journeysGeoJSON),
);
console.log(
  `[journeys.geojson] ${journeyLineCount} journeys ` +
  `(${journeyCuratedLineCount} curated) → ${journeyFeatures.length} features (lines + waypoints)`,
);

// ── 9. Manifest → public/data/manifest.json ───────────────────────────────────

const counts = {};
for (const [type, recs] of Object.entries(byType)) counts[type] = recs.length;
counts.total = all.length;

const manifest = {
  datasetId:  PROFILE.id,
  bakedAt:    new Date().toISOString(),
  window:     WINDOW,
  counts,
  files: {
    records:   Object.keys(TYPE_DIR).map((t) => `/data/records/${t}.json`),
    polities:  '/data/layers/polities.geojson',
    events:    '/data/layers/events.geojson',
    journeys:  '/data/layers/journeys.geojson',
    adjacency: '/index/adjacency.json',
    search:    '/index/search.json',
  },
};
fs.writeFileSync(
  path.join(OUT_DATA, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
console.log(`[manifest] wrote manifest.json`);

// ── 9. Geographic point/line layers from the real donor GeoJSON ─────────────────
// capitals / settlements / military / trade are inherently geographic features
// (points + lines). capitals/settlements/military exist as in-repo record kinds
// (data/<kind>/*.json) — we build their map-layer GeoJSON directly from those REAL
// records (coords are stored [lon, lat]; verified). trade has NO record kind: it is
// a donor-built line layer, so we preserve the already-baked trade.geojson if present.
// No geometry is invented. A missing required source FAILS LOUDLY rather than being
// silently skipped (previously a stale path `../../dist/data` dropped all four layers
// without error — pre-launch audit 2026-06 finding).
const geoLayerCounts = {};

// Point geo-layers belong to the medieval dataset only. Other datasets (e.g. Fordham)
// supply geometry through their own record kinds + the GeoJSON steps above.
if (!IS_MEDIEVAL) {
  console.log('[geo-layer] non-medieval dataset — skipping medieval geo-layers (honest, no fake)');
}

/** Build a point Feature from an in-repo record, preserving real props. */
function pointFeatureFromRecord(r, kind) {
  const c = r.coords;
  if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
    return null; // no coords → no feature (REALNESS LAW: never invent geometry)
  }
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c[0], c[1]] }, // stored [lon, lat]
    properties: {
      id: String(r.id ?? ''),
      name: String(r.name ?? r.id ?? ''),
      kind,
      start_year: typeof r.start_year === 'number' ? r.start_year : null,
      end_year: typeof r.end_year === 'number' ? r.end_year : null,
      ...(r.subtype ? { subtype: r.subtype } : {}),
      ...(r.importance ? { importance: r.importance } : {}),
      ...(r.entity_id ? { entity_id: r.entity_id } : {}),
      ...(r.source ? { source: r.source } : {}),
    },
  };
}

if (IS_MEDIEVAL) {
  // Point layers built from real in-repo records.
  for (const [kind, outName] of [
    ['capital', 'capitals'],
    ['settlement', 'settlements'],
    ['military', 'military'],
  ]) {
    const recs = byType[kind] ?? [];
    if (recs.length === 0) {
      throw new Error(
        `[geo-layer] FATAL: no '${kind}' records found in data/${TYPE_DIR[kind]}/ — ` +
        `cannot build ${outName}.geojson. Aborting bake rather than silently shipping an empty layer.`,
      );
    }
    const feats = recs.map((r) => pointFeatureFromRecord(r, kind)).filter(Boolean);
    fs.writeFileSync(
      path.join(OUT_DATA, 'layers', `${outName}.geojson`),
      JSON.stringify({ type: 'FeatureCollection', features: feats }),
    );
    geoLayerCounts[outName] = feats.length;
    console.log(`[geo-layer] ${outName}.geojson ← ${feats.length} real features (from data/${TYPE_DIR[kind]}/)`);
  }

  // trade: no record kind. Preserve the existing baked trade.geojson (donor-built
  // line layer) if it is already present; otherwise FAIL LOUDLY — do not drop it.
  const tradeOut = path.join(OUT_DATA, 'layers', 'trade.geojson');
  if (fs.existsSync(tradeOut)) {
    try {
      const fc = JSON.parse(fs.readFileSync(tradeOut, 'utf8'));
      geoLayerCounts.trade = (fc.features ?? []).length;
      console.log(`[geo-layer] trade.geojson ← ${geoLayerCounts.trade} features (preserved existing donor-built layer)`);
    } catch (e) {
      throw new Error(`[geo-layer] FATAL: existing trade.geojson is unreadable: ${e.message}`);
    }
  } else {
    throw new Error(
      `[geo-layer] FATAL: trade.geojson is missing and there is no trade record kind to rebuild it from. ` +
      `Restore the donor-built layer (public/data/layers/trade.geojson) before baking, or remove the trade layer.`,
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nbaked ${all.length} records total`);
console.log(`  polities:      ${counts.polity ?? 0}`);
console.log(`  events:        ${counts.event ?? 0}`);
console.log(`  journeys:      ${counts.journey ?? 0}`);
console.log(`  relationships: ${counts.relationship ?? 0}`);
console.log(`  rulers:        ${counts.ruler ?? 0}`);
console.log(`  sources:       ${counts.source ?? 0}`);
console.log(`  institutions:  ${counts.institution ?? 0}`);
console.log(`  technologies:  ${counts.technology ?? 0}`);
console.log(`  texts:         ${counts.text ?? 0}`);
console.log(`  settlements:   ${counts.settlement ?? 0}`);
console.log(`  military:      ${counts.military ?? 0}`);
console.log(`  capitals:      ${counts.capital ?? 0}`);
console.log(`\npublic/data/ artifacts ready — loaders can fetch at runtime.`);
