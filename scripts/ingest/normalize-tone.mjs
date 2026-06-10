/**
 * normalize-tone.mjs
 *
 * Strips em-dashes from entity prose fields and rewrites them in
 * computer-manual style (no em-dashes, no flowery phrasing).
 *
 * SCOPE: data/entities/*.json (skip .bak files)
 * FIELDS TOUCHED: description, lifecycle_phases[*].description,
 *                 rise_factors[*].description, decline_factors[*].description,
 *                 temporal.notes, geographic.notes, geographic.no_central_capital_reason,
 *                 wikidata_enrichment.extraction_note, population_estimates[*].note,
 *                 key_figures[*].notes, polygon_snapshots[*].label,
 *                 geographic.polygon_snapshots[*].label
 *
 * REPLACEMENT RULE:
 *   " — " (space–em-dash–space)  ->  ", "   (comma-space)
 *   "Stub — "                    ->  "Stub: "  (special case in temporal.notes)
 *   "word—word" (no surrounding spaces) -> "word, word"
 *
 * SAFETY: read-old, write-new. Backs up each changed file with
 *   .bak-<timestamp>. Writes a revert log to data/_audit/normalize-tone-<ts>.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENTITIES_DIR = join(ROOT, 'data', 'entities');
const AUDIT_DIR = join(ROOT, 'data', '_audit');

const EM_DASH = '—';

// Fields within an entity record object to normalize (string values only).
// Nested: list of [getter, setter] pairs that return/set the string.
function getProseFields(record) {
  const fields = [];

  // Top-level description
  if (typeof record.description === 'string') {
    fields.push({
      get: () => record.description,
      set: (v) => { record.description = v; },
      label: 'description',
    });
  }

  // lifecycle_phases[*].description
  if (Array.isArray(record.lifecycle_phases)) {
    record.lifecycle_phases.forEach((phase, i) => {
      if (typeof phase.description === 'string') {
        fields.push({
          get: () => phase.description,
          set: (v) => { phase.description = v; },
          label: `lifecycle_phases[${i}].description`,
        });
      }
    });
  }

  // rise_factors[*].description
  if (Array.isArray(record.rise_factors)) {
    record.rise_factors.forEach((f, i) => {
      if (typeof f.description === 'string') {
        fields.push({
          get: () => f.description,
          set: (v) => { f.description = v; },
          label: `rise_factors[${i}].description`,
        });
      }
    });
  }

  // decline_factors[*].description
  if (Array.isArray(record.decline_factors)) {
    record.decline_factors.forEach((f, i) => {
      if (typeof f.description === 'string') {
        fields.push({
          get: () => f.description,
          set: (v) => { f.description = v; },
          label: `decline_factors[${i}].description`,
        });
      }
    });
  }

  // temporal.notes
  if (record.temporal && typeof record.temporal.notes === 'string') {
    fields.push({
      get: () => record.temporal.notes,
      set: (v) => { record.temporal.notes = v; },
      label: 'temporal.notes',
    });
  }

  // geographic.notes
  if (record.geographic && typeof record.geographic.notes === 'string') {
    fields.push({
      get: () => record.geographic.notes,
      set: (v) => { record.geographic.notes = v; },
      label: 'geographic.notes',
    });
  }

  // geographic.no_central_capital_reason
  if (record.geographic && typeof record.geographic.no_central_capital_reason === 'string') {
    fields.push({
      get: () => record.geographic.no_central_capital_reason,
      set: (v) => { record.geographic.no_central_capital_reason = v; },
      label: 'geographic.no_central_capital_reason',
    });
  }

  // wikidata_enrichment.extraction_note
  if (record.wikidata_enrichment && typeof record.wikidata_enrichment.extraction_note === 'string') {
    fields.push({
      get: () => record.wikidata_enrichment.extraction_note,
      set: (v) => { record.wikidata_enrichment.extraction_note = v; },
      label: 'wikidata_enrichment.extraction_note',
    });
  }

  // population_estimates[*].note
  if (Array.isArray(record.population_estimates)) {
    record.population_estimates.forEach((pe, i) => {
      if (typeof pe.note === 'string') {
        fields.push({
          get: () => pe.note,
          set: (v) => { pe.note = v; },
          label: `population_estimates[${i}].note`,
        });
      }
    });
  }

  // key_figures[*].notes
  if (Array.isArray(record.key_figures)) {
    record.key_figures.forEach((kf, i) => {
      if (typeof kf.notes === 'string') {
        fields.push({
          get: () => kf.notes,
          set: (v) => { kf.notes = v; },
          label: `key_figures[${i}].notes`,
        });
      }
    });
  }

  // polygon_snapshots[*].label (top-level)
  if (Array.isArray(record.polygon_snapshots)) {
    record.polygon_snapshots.forEach((ps, i) => {
      if (typeof ps.label === 'string') {
        fields.push({
          get: () => ps.label,
          set: (v) => { ps.label = v; },
          label: `polygon_snapshots[${i}].label`,
        });
      }
    });
  }

  // geographic.polygon_snapshots[*].label
  if (record.geographic && Array.isArray(record.geographic.polygon_snapshots)) {
    record.geographic.polygon_snapshots.forEach((ps, i) => {
      if (typeof ps.label === 'string') {
        fields.push({
          get: () => ps.label,
          set: (v) => { ps.label = v; },
          label: `geographic.polygon_snapshots[${i}].label`,
        });
      }
    });
  }

  return fields;
}

/**
 * Replace em-dashes in a prose string.
 *
 * Rules (in order):
 * 1. "Stub — " at the start -> "Stub: "
 * 2. " — " -> ", "
 * 3. "word—word" (no space either side) -> "word, word"
 */
function normalize(str) {
  let s = str;
  // Rule 1: Stub sentinel
  s = s.replace(new RegExp(`Stub ${EM_DASH} `, 'g'), 'Stub: ');
  // Rule 2: spaced em-dash
  s = s.replace(new RegExp(` ${EM_DASH} `, 'g'), ', ');
  // Rule 3: unspaced em-dash (between word chars, or after ')' or digit)
  s = s.replace(new RegExp(`${EM_DASH}`, 'g'), ', ');
  return s;
}

function main() {
  const ts = Date.now();

  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  const files = readdirSync(ENTITIES_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('.bak'));

  const revertLog = {
    timestamp: new Date(ts).toISOString(),
    script: 'scripts/ingest/normalize-tone.mjs',
    description: 'Strip em-dashes from entity prose fields; replace with comma-space or period.',
    changed: [],
  };

  let filesChanged = 0;
  let fieldsChanged = 0;
  let emDashesReplaced = 0;

  for (const fname of files) {
    const fpath = join(ENTITIES_DIR, fname);
    const raw = readFileSync(fpath, 'utf-8');

    if (!raw.includes(EM_DASH)) continue;

    const record = JSON.parse(raw);
    const fields = getProseFields(record);

    const fieldChanges = [];
    for (const field of fields) {
      const original = field.get();
      if (!original.includes(EM_DASH)) continue;
      const normalized = normalize(original);
      if (normalized !== original) {
        const count = (original.match(new RegExp(EM_DASH, 'g')) || []).length;
        fieldChanges.push({ field: field.label, before: original, after: normalized, count });
        field.set(normalized);
        fieldsChanged++;
        emDashesReplaced += count;
      }
    }

    if (fieldChanges.length === 0) continue;

    // Backup original
    const bakPath = `${fpath}.bak-${ts}`;
    writeFileSync(bakPath, raw, 'utf-8');

    // Write updated record
    writeFileSync(fpath, JSON.stringify(record, null, 2) + '\n', 'utf-8');

    revertLog.changed.push({
      file: fpath,
      backup: bakPath,
      fields: fieldChanges.map(c => ({ field: c.field, count: c.count })),
    });

    filesChanged++;
  }

  // Write audit log
  const auditPath = join(AUDIT_DIR, `normalize-tone-${ts}.json`);
  writeFileSync(auditPath, JSON.stringify(revertLog, null, 2) + '\n', 'utf-8');

  console.log(`normalize-tone: ${filesChanged} files changed, ${fieldsChanged} fields, ${emDashesReplaced} em-dashes replaced.`);
  console.log(`Audit log: ${auditPath}`);
  console.log('Run `node scripts/build/bake-manifests.mjs` to re-bake.');
}

main();
