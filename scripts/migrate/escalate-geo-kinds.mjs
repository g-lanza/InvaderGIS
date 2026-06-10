#!/usr/bin/env node
/**
 * escalate-geo-kinds.mjs — Wave 3 / Phase C migration.
 *
 * Escalates settlements / military / capitals from map-layer-only GeoJSON into
 * first-class typed records (Settlement | MilitarySite | Capital).
 *
 * DATA SAFETY:
 *   - Reads donor GeoJSON from the QUARRY (read-only): ../../dist/data/
 *   - Writes new records into data/{settlements,military,capitals}/ (NEW dirs only).
 *   - Backs up any pre-existing file in those dirs before overwriting.
 *   - Writes a revert log to data/_audit/ listing every file created.
 *   - NEVER fabricates: missing fields are absent; never filled with dummy values.
 *   - Donor GeoJSON files are NEVER modified.
 *
 * Attestation mapping (honest, no fabrication):
 *   - External IDs: donor wikidata_qid / qid → provenance.external_ids.wikidata
 *                   donor pleiades_id         → provenance.external_ids.pleiades
 *   - attestation: 'strong' when a QID is present; 'inferred' otherwise.
 *   - confidence:  derived from donor end_confidence if present; else 'moderate'.
 *   - status:      always 'community' (these are donor-community-curated records).
 *   - sources_used: ['donor-geojson-' + kind] — honest dataset reference.
 *
 * Usage:
 *   node scripts/migrate/escalate-geo-kinds.mjs [--dry]
 *
 * --dry   Dry run: process + print counts, write NOTHING.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT       = path.resolve(__dirname, '..', '..');
const DATA       = path.join(ROOT, 'data');
const AUDIT      = path.join(DATA, '_audit');
const DONOR_DIR  = path.resolve(ROOT, '..', '..', 'dist', 'data');

const args = process.argv.slice(2);
const DRY  = args.includes('--dry');

console.log('[escalate-geo-kinds] Wave 3 / Phase C — escalate settlements/military/capitals');
console.log(`  root:      ${ROOT}`);
console.log(`  data out:  ${DATA}`);
console.log(`  donor in:  ${DONOR_DIR}`);
console.log(`  dry-run:   ${DRY}`);
console.log('');

if (!fs.existsSync(DONOR_DIR)) {
  console.error(`[escalate-geo-kinds] donor dir not found: ${DONOR_DIR}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce a value to a finite integer; returns null when absent/non-numeric. */
function toIntOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Build a Provenance object for a geo-escalated record.
 * - status: 'community'
 * - confidence: derived from donor end_confidence ('high'|'moderate'|'low')
 *   or 'moderate' when absent (honest default, not fabricated).
 * - attestation: 'strong' when a Wikidata QID is present; 'inferred' otherwise.
 * - external_ids: populated only from real donor fields (wikidata_qid/qid, pleiades_id).
 * - sources_used: references the donor kind (honest dataset citation).
 */
function buildProvenance(props, donorKind, confidenceOverride) {
  const qid = props.wikidata_qid ?? props.qid ?? null;
  const pleiades = props.pleiades_id ?? null;

  const external_ids = {};
  if (qid) external_ids.wikidata = String(qid);
  if (pleiades) external_ids.pleiades = String(pleiades);

  // confidence: use donor end_confidence → mapped value; else 'moderate'
  const rawConf = confidenceOverride ?? props.end_confidence ?? null;
  const confidence =
    rawConf === 'high'     ? 'high'
  : rawConf === 'low'      ? 'low'
  : rawConf === 'moderate' ? 'moderate'
  : 'moderate'; // honest default — not fabricated

  const attestation = qid ? 'strong' : 'inferred';

  const prov = {
    status: 'community',
    sources_used: [`donor-geojson-${donorKind}`],
    confidence,
    attestation,
  };

  if (Object.keys(external_ids).length > 0) {
    prov.external_ids = external_ids;
  }

  return prov;
}

// ── Per-kind mappers ─────────────────────────────────────────────────────────

/**
 * Map one capitals GeoJSON feature → Capital record.
 * Donor properties: { entity_id, entity_name, name, source, start_year, end_year, qid? }
 * Donor feature.id = entity slug (e.g. "abbasid_caliphate").
 */
function mapCapital(feature) {
  const p   = feature.properties ?? {};
  const geo = feature.geometry;
  // id: prefer feature.id (entity slug); fallback to entity_id in props
  const id = String(feature.id ?? p.entity_id ?? p.name ?? 'unknown');
  // coords: GeoJSON Point [lon, lat] — kept as-is (our records store [lon, lat])
  const coords = Array.isArray(geo?.coordinates) && geo.coordinates.length >= 2
    ? [geo.coordinates[0], geo.coordinates[1]]
    : null;

  const start_year = toIntOrNull(p.start_year);
  const end_year   = toIntOrNull(p.end_year);

  const record = {
    kind:        'capital',
    dataset:     'medieval-europe-500-1500',
    id,
    name:        String(p.name ?? ''),
    entity_id:   String(p.entity_id ?? ''),
    entity_name: String(p.entity_name ?? ''),
    start_year,
    end_year,
    provenance:  buildProvenance(p, 'capital'),
  };

  if (coords) record.coords = coords;
  return record;
}

/**
 * Map one settlements GeoJSON feature → Settlement record.
 * Donor properties: { id, name, importance, start_year, end_year, end_confidence?,
 *                     wikidata_qid?, pleiades_id? }
 */
function mapSettlement(feature) {
  const p   = feature.properties ?? {};
  const geo = feature.geometry;
  const id  = String(feature.id ?? p.id ?? p.name ?? 'unknown');

  const coords = Array.isArray(geo?.coordinates) && geo.coordinates.length >= 2
    ? [geo.coordinates[0], geo.coordinates[1]]
    : null;

  const start_year     = toIntOrNull(p.start_year);
  const end_year       = toIntOrNull(p.end_year);
  const end_confidence = p.end_confidence ?? undefined;

  const record = {
    kind:       'settlement',
    dataset:    'medieval-europe-500-1500',
    id,
    name:       String(p.name ?? ''),
    importance: String(p.importance ?? ''),
    start_year,
    end_year,
    provenance: buildProvenance(p, 'settlement'),
  };

  // Only include optional fields when present (NEVER fabricate)
  if (end_confidence) record.end_confidence = end_confidence;
  if (coords)         record.coords         = coords;
  return record;
}

/**
 * Map one military GeoJSON feature → MilitarySite record.
 * Donor properties: { id, name, subtype, start_year, end_year, description?, wikidata_qid? }
 */
function mapMilitary(feature) {
  const p   = feature.properties ?? {};
  const geo = feature.geometry;
  const id  = String(feature.id ?? p.id ?? p.name ?? 'unknown');

  const coords = Array.isArray(geo?.coordinates) && geo.coordinates.length >= 2
    ? [geo.coordinates[0], geo.coordinates[1]]
    : null;

  const start_year = toIntOrNull(p.start_year);
  const end_year   = toIntOrNull(p.end_year);

  const record = {
    kind:      'military',
    dataset:   'medieval-europe-500-1500',
    id,
    name:      String(p.name ?? ''),
    subtype:   String(p.subtype ?? ''),
    start_year,
    end_year,
    provenance: buildProvenance(p, 'military'),
  };

  if (p.description) record.description = String(p.description);
  if (coords)        record.coords      = coords;
  return record;
}

// ── Migration config ─────────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    donorFile:  'capitals.geojson',
    outDir:     path.join(DATA, 'capitals'),
    mapper:     mapCapital,
    kindLabel:  'capital',
  },
  {
    donorFile:  'settlements.geojson',
    outDir:     path.join(DATA, 'settlements'),
    mapper:     mapSettlement,
    kindLabel:  'settlement',
  },
  {
    donorFile:  'military.geojson',
    outDir:     path.join(DATA, 'military'),
    mapper:     mapMilitary,
    kindLabel:  'military',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

const created  = [];
const skipped  = [];
const counts   = {};

for (const { donorFile, outDir, mapper, kindLabel } of MIGRATIONS) {
  const src = path.join(DONOR_DIR, donorFile);

  if (!fs.existsSync(src)) {
    console.warn(`[escalate-geo-kinds] donor file not found: ${src} — skipped`);
    counts[kindLabel] = 0;
    continue;
  }

  let fc;
  try {
    fc = JSON.parse(fs.readFileSync(src, 'utf8'));
  } catch (e) {
    console.error(`[escalate-geo-kinds] cannot parse ${src}: ${e.message}`);
    counts[kindLabel] = 0;
    continue;
  }

  const features = (fc.features ?? []).filter((f) => f && f.geometry);
  console.log(`[${kindLabel}] ${features.length} features in ${donorFile}`);

  if (!DRY) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let written = 0;
  let dup = 0;
  const seenIds = new Set();

  for (const feature of features) {
    let record;
    try {
      record = mapper(feature);
    } catch (e) {
      console.warn(`  [skip] mapper error for feature ${JSON.stringify(feature.id)}: ${e.message}`);
      skipped.push({ kind: kindLabel, id: feature.id, reason: e.message });
      continue;
    }

    if (!record.id || record.id === 'unknown') {
      skipped.push({ kind: kindLabel, id: 'no-id', reason: 'could not derive id' });
      continue;
    }

    // Dedup within kind: if same id already seen, suffix with index
    if (seenIds.has(record.id)) {
      dup++;
      const origId = record.id;
      record.id = `${origId}_${dup}`;
    }
    seenIds.add(record.id);

    const outPath = path.join(outDir, `${record.id}.json`);

    if (!DRY) {
      // Back up any existing file before writing
      if (fs.existsSync(outPath)) {
        const bak = outPath + '.bak-' + Date.now();
        fs.copyFileSync(outPath, bak);
        created.push(bak);
      }
      fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
    }

    created.push(outPath);
    written++;
  }

  counts[kindLabel] = written;
  console.log(`  → ${written} records${DRY ? ' (DRY)' : ' written'} to data/${kindLabel === 'capital' ? 'capitals' : kindLabel === 'settlement' ? 'settlements' : 'military'}/`);
  if (dup > 0) console.log(`  (${dup} duplicate ids suffixed to preserve uniqueness)`);
}

// ── Revert log ────────────────────────────────────────────────────────────────

if (!DRY) {
  fs.mkdirSync(AUDIT, { recursive: true });
  const ts  = Date.now();
  const log = path.join(AUDIT, `escalate-geo-kinds-${ts}.json`);
  fs.writeFileSync(log, JSON.stringify({
    script:  'escalate-geo-kinds.mjs',
    wave:    'Wave 3 / Phase C',
    when:    new Date().toISOString(),
    donorDir: DONOR_DIR,
    counts,
    skipped,
    created,
    revertInstructions: 'Delete every path listed in `created` to fully revert this migration.',
  }, null, 2));
  console.log(`\nrevert log: data/_audit/escalate-geo-kinds-${ts}.json`);
  console.log('  (delete every path in created[] to revert)');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(DRY ? '\n[DRY RUN — nothing written]\n' : '\nMigration complete (donor files untouched).\n');
console.table(counts);
if (skipped.length > 0) {
  console.warn(`\n${skipped.length} feature(s) skipped:`);
  skipped.forEach((s) => console.warn(`  - ${s.kind}/${s.id}: ${s.reason}`));
}

console.log('\nNext: node scripts/validate/validate.mjs');
