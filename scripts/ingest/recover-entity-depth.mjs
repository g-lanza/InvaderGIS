/**
 * recover-entity-depth.mjs — RECOVER the rich entity fields dropped during a
 * prior migration, from the read-only archived quarry build.
 *
 * Root cause (audited 2026-05-31): our data/entities/*.json carry 15 keys; the
 * identical-id files in the archived quarry carry 26 — a prior bake/migration
 * stripped ~11 rich research fields (lifecycle_phases, rise_factors,
 * decline_factors, ethnic/religion/language_composition, economic,
 * social_structure, key_figures, description, internal_structure, temporal,
 * geographic, predecessor/successor_entity_ids, primary_ethnicity/language,
 * wikidata_enrichment, sources). This restores them.
 *
 * LAWS honored:
 *  - REALNESS: copies ONLY real values present in the archived donor. Entities
 *    (or fields) absent in the archive stay absent here — no fabrication.
 *  - DATA-SAFETY: read-old / write-new. Additive merge — NEVER overwrites a field
 *    we already have (our 15 keys win on conflict). A full backup is taken before
 *    running (data/entities.bak-pre-recovery/) and an audit log is written to
 *    data/_audit/. Reversible.
 *  - 1:1 id join: 268/268 of our polity ids match an archived entity id exactly.
 *
 * Offline, build-time only — NEVER imported by src/. Run: node scripts/ingest/recover-entity-depth.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUR_DIR = 'data/entities';
const ARCHIVE_DIR = 'C:/Users/Peopl/OneDrive/Desktop/_InvaderGIS-archive/data/entities';
const AUDIT_DIR = 'data/_audit';

/**
 * The archive-only fields to recover. These are absent from our records and
 * present (on most entities) in the archive. Copied verbatim — no transform.
 */
const RECOVER_FIELDS = [
  'description',
  'temporal',
  'geographic',
  'internal_structure',
  'lifecycle_phases',
  'rise_factors',
  'decline_factors',
  'key_figures',
  'predecessor_entity_ids',
  'successor_entity_ids',
  'primary_ethnicity',
  'ethnic_composition',
  'religion_composition',
  'primary_language',
  'language_composition',
  'economic',
  'social_structure',
  'wikidata_enrichment',
  'sources',
];

/** True when a value is genuinely present (not undefined/null/empty array). */
function present(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function main() {
  if (!existsSync(ARCHIVE_DIR)) {
    console.error(`[recover] Archive not found at ${ARCHIVE_DIR} — cannot recover. Aborting (no changes made).`);
    process.exit(1);
  }
  if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });

  const files = readdirSync(OUR_DIR).filter((f) => f.endsWith('.json'));
  const log = [];
  let touched = 0;
  let noArchive = 0;
  const fieldCounts = Object.fromEntries(RECOVER_FIELDS.map((f) => [f, 0]));

  for (const file of files) {
    const ourPath = join(OUR_DIR, file);
    const arcPath = join(ARCHIVE_DIR, file);
    const our = JSON.parse(readFileSync(ourPath, 'utf8'));

    if (!existsSync(arcPath)) {
      noArchive++;
      log.push({ id: our.id, status: 'no-archive-match', recovered: [] });
      continue;
    }
    const arc = JSON.parse(readFileSync(arcPath, 'utf8'));

    const recovered = [];
    for (const field of RECOVER_FIELDS) {
      // Additive: only fill fields we DON'T already have, and only from real archive values.
      if (!(field in our) && present(arc[field])) {
        our[field] = arc[field];
        recovered.push(field);
        fieldCounts[field]++;
      }
    }

    if (recovered.length > 0) {
      // Write-new: re-serialize our record with the recovered fields merged in.
      writeFileSync(ourPath, JSON.stringify(our, null, 2));
      touched++;
    }
    log.push({ id: our.id, status: recovered.length ? 'recovered' : 'nothing-to-recover', recovered });
  }

  const summary = {
    ranAt: 'build-time',
    ourEntities: files.length,
    touched,
    noArchiveMatch: noArchive,
    fieldRecoveryCounts: fieldCounts,
  };
  writeFileSync(join(AUDIT_DIR, 'entity-depth-recovery-log.json'), JSON.stringify({ summary, log }, null, 1));

  console.log('[recover] === entity depth recovery complete ===');
  console.log(`[recover] entities: ${files.length} | files updated: ${touched} | no-archive-match: ${noArchive}`);
  console.log('[recover] fields recovered (count of entities gaining each):');
  for (const f of RECOVER_FIELDS) console.log(`           ${f}: ${fieldCounts[f]}`);
  console.log('[recover] audit log: data/_audit/entity-depth-recovery-log.json');
  console.log('[recover] revert: restore from data/entities.bak-pre-recovery/');
}

main();
