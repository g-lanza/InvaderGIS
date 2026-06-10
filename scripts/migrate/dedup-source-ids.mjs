/**
 * dedup-source-ids.mjs — reversible disambiguation of duplicate source ids.
 *
 * PROBLEM (audit H1): 69 source `id` values are each shared by two genuinely
 * different raw files in data/sources/ (a human-titled file and a slug file that
 * collided on the same title-derived id). Because the SourcesLibrary table keys
 * rows by `id`, the 69 collisions produce duplicate React keys and ambiguous
 * citation resolution (a sources_used ref that names a doubled id is ambiguous).
 *
 * STRATEGY (suffix-disambiguate — chosen by human 2026-06-07):
 *   For each colliding id, KEEP the id on the first file in sorted order and
 *   re-id the OTHER file to a unique value derived from its own filename slug.
 *   No record is dropped; no field is lost. The first file keeps the original id,
 *   so the 72 existing sources_used refs (which point at that id) remain valid —
 *   they resolve to the kept record. The second record becomes independently
 *   addressable under its filename-slug id.
 *
 * REVERSIBILITY: writes a revert log (scripts/migrate/_revert/dedup-source-ids.<ts>.json)
 *   mapping {file, oldId, newId} for every change. Re-running with --revert <log>
 *   restores the original ids exactly.
 *
 * USAGE:
 *   node scripts/migrate/dedup-source-ids.mjs            # dry run (prints plan)
 *   node scripts/migrate/dedup-source-ids.mjs --apply    # apply + write revert log
 *   node scripts/migrate/dedup-source-ids.mjs --revert <logfile>
 *
 * After --apply, re-bake: `npm run bake` to regenerate public/data/records/source.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const REVERT_DIR = path.join(__dirname, '_revert');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REVERT_IDX = args.indexOf('--revert');

/** Read a JSON file, returning { file, json } or null on parse failure. */
function readSource(file) {
  try {
    return { file, json: JSON.parse(fs.readFileSync(path.join(SOURCES_DIR, file), 'utf8')) };
  } catch {
    return null;
  }
}

/** Slug-id derived from a filename: drop .json, lowercase, non-alnum → underscore. */
function slugFromFilename(file) {
  return file
    .replace(/\.json$/i, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Revert mode ─────────────────────────────────────────────────────────────────
if (REVERT_IDX !== -1) {
  const logPath = args[REVERT_IDX + 1];
  if (!logPath || !fs.existsSync(logPath)) {
    console.error('[dedup-source-ids] --revert needs a valid log file path.');
    process.exit(1);
  }
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  for (const { file, oldId } of log.changes) {
    const p = path.join(SOURCES_DIR, file);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.id = oldId;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  }
  console.log(`[dedup-source-ids] Reverted ${log.changes.length} files. Re-run \`npm run bake\`.`);
  process.exit(0);
}

// ── Build the collision map from raw files ───────────────────────────────────────
const files = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'));
const byId = new Map();
for (const file of files) {
  const r = readSource(file);
  if (!r) continue;
  if (!byId.has(r.json.id)) byId.set(r.json.id, []);
  byId.get(r.json.id).push(r);
}

const existingIds = new Set(byId.keys());
const changes = [];

for (const [id, recs] of byId) {
  if (recs.length < 2) continue;
  // Keep the first file (sorted) on the original id; re-id the rest.
  recs.sort((a, b) => a.file.localeCompare(b.file));
  for (let i = 1; i < recs.length; i++) {
    const rec = recs[i];
    let newId = slugFromFilename(rec.file);
    // Guarantee global uniqueness (avoid colliding with any id, old or new).
    let candidate = newId;
    let n = 2;
    while (existingIds.has(candidate)) candidate = `${newId}_${n++}`;
    existingIds.add(candidate);
    changes.push({ file: rec.file, oldId: id, newId: candidate });
  }
}

console.log(`[dedup-source-ids] ${changes.length} files to re-id (from ${[...byId].filter(([, v]) => v.length > 1).length} colliding ids).`);
for (const c of changes.slice(0, 5)) {
  console.log(`  ${c.file}: "${c.oldId}" → "${c.newId}"`);
}
if (changes.length > 5) console.log(`  … and ${changes.length - 5} more`);

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write changes + revert log.');
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────────
for (const c of changes) {
  const p = path.join(SOURCES_DIR, c.file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.id = c.newId;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

fs.mkdirSync(REVERT_DIR, { recursive: true });
// Timestamp passed via env (scripts can't use Date.now in some harnesses); fall back to a counter file.
const stamp = process.env.MIGRATE_STAMP || String(fs.readdirSync(REVERT_DIR).length + 1);
const logFile = path.join(REVERT_DIR, `dedup-source-ids.${stamp}.json`);
fs.writeFileSync(logFile, JSON.stringify({ migration: 'dedup-source-ids', changes }, null, 2) + '\n');

console.log(`[dedup-source-ids] Applied ${changes.length} re-ids. Revert log: ${path.relative(ROOT, logFile)}`);
console.log('[dedup-source-ids] Now run `npm run bake` to rebuild public/data/records/source.json.');
