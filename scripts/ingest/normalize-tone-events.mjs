/**
 * normalize-tone-events.mjs
 *
 * Strips em-dashes from EVENT prose fields and rewrites them in
 * computer-manual style (no em-dashes, no flowery phrasing).
 *
 * Companion to normalize-tone.mjs (which handles data/entities/*.json).
 * Same replacement rules and same reversibility guarantees.
 *
 * SCOPE: data/events/*.json (skip .bak files)
 * FIELDS TOUCHED (verified by scan — these are the only event keys that
 *                 actually contain em-dashes):
 *                 name, summary, _quarry.structural_significance,
 *                 outcomes[*] (only the string entries that are prose sentences)
 *
 * REPLACEMENT RULE (identical to normalize-tone.mjs):
 *   "Stub — "                    ->  "Stub: "
 *   " — " (space–em-dash–space)  ->  ", "
 *   "word—word" (no surrounding spaces) -> ", "
 *
 * NO FABRICATION: punctuation/phrasing normalization of existing real text only.
 *
 * SAFETY: read-old, write-new. Backs up each changed file with
 *   .bak-<timestamp>. Writes a revert log to data/_audit/normalize-tone-events-<ts>.json.
 *   To revert: restore each `backup` over its `file`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVENTS_DIR = join(ROOT, 'data', 'events');
const AUDIT_DIR = join(ROOT, 'data', '_audit');

const EM_DASH = '—';

/**
 * Collect the prose fields of an event record that may hold em-dashes.
 * Returns [{ get, set, label }].
 */
function getProseFields(record) {
  const fields = [];

  // name
  if (typeof record.name === 'string') {
    fields.push({
      get: () => record.name,
      set: (v) => { record.name = v; },
      label: 'name',
    });
  }

  // summary
  if (typeof record.summary === 'string') {
    fields.push({
      get: () => record.summary,
      set: (v) => { record.summary = v; },
      label: 'summary',
    });
  }

  // _quarry.structural_significance
  if (record._quarry && typeof record._quarry.structural_significance === 'string') {
    fields.push({
      get: () => record._quarry.structural_significance,
      set: (v) => { record._quarry.structural_significance = v; },
      label: '_quarry.structural_significance',
    });
  }

  // outcomes[*] — only the entries that are prose strings containing an em-dash.
  // (Most outcomes are snake_case id tokens with no em-dash and are left untouched.)
  if (Array.isArray(record.outcomes)) {
    record.outcomes.forEach((o, i) => {
      if (typeof o === 'string') {
        fields.push({
          get: () => record.outcomes[i],
          set: (v) => { record.outcomes[i] = v; },
          label: `outcomes[${i}]`,
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
 * 1. "Stub — " -> "Stub: "
 * 2. " — " -> ", "
 * 3. remaining "—" -> ", "
 */
function normalize(str) {
  let s = str;
  s = s.replace(new RegExp(`Stub ${EM_DASH} `, 'g'), 'Stub: ');
  s = s.replace(new RegExp(` ${EM_DASH} `, 'g'), ', ');
  s = s.replace(new RegExp(`${EM_DASH}`, 'g'), ', ');
  return s;
}

function main() {
  const ts = Date.now();

  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  const files = readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('.bak'));

  const revertLog = {
    timestamp: new Date(ts).toISOString(),
    script: 'scripts/ingest/normalize-tone-events.mjs',
    description: 'Strip em-dashes from event prose fields (name, summary, structural_significance, prose outcomes); replace with comma-space.',
    changed: [],
  };

  let filesChanged = 0;
  let fieldsChanged = 0;
  let emDashesReplaced = 0;

  for (const fname of files) {
    const fpath = join(EVENTS_DIR, fname);
    const raw = readFileSync(fpath, 'utf-8');

    if (!raw.includes(EM_DASH)) continue;

    const record = JSON.parse(raw);
    const fields = getProseFields(record);

    const fieldChanges = [];
    for (const field of fields) {
      const original = field.get();
      if (typeof original !== 'string' || !original.includes(EM_DASH)) continue;
      const normalized = normalize(original);
      if (normalized !== original) {
        const count = (original.match(new RegExp(EM_DASH, 'g')) || []).length;
        fieldChanges.push({ field: field.label, count });
        field.set(normalized);
        fieldsChanged++;
        emDashesReplaced += count;
      }
    }

    if (fieldChanges.length === 0) continue;

    // Backup original, then write updated record.
    const bakPath = `${fpath}.bak-${ts}`;
    writeFileSync(bakPath, raw, 'utf-8');
    writeFileSync(fpath, JSON.stringify(record, null, 2) + '\n', 'utf-8');

    revertLog.changed.push({
      file: fpath,
      backup: bakPath,
      fields: fieldChanges,
    });

    filesChanged++;
  }

  const auditPath = join(AUDIT_DIR, `normalize-tone-events-${ts}.json`);
  writeFileSync(auditPath, JSON.stringify(revertLog, null, 2) + '\n', 'utf-8');

  console.log(`normalize-tone-events: ${filesChanged} files changed, ${fieldsChanged} fields, ${emDashesReplaced} em-dashes replaced.`);
  console.log(`Audit log: ${auditPath}`);
  console.log('Run `node scripts/build/bake-manifests.mjs` to re-bake.');
}

main();
