/**
 * remap-dangling-source-refs.mjs — Reversible citation-key remap (pre-launch audit 2026-06).
 *
 * PROBLEM (audit finding): a handful of records cite a source by a stale slug or a
 * raw bibliographic string whose id is absent from data/sources/ — dangling
 * `provenance.sources_used` refs that breach the "every fact is sourced" rule.
 *
 * For the four refs whose CANONICAL source record already exists (verified by web
 * lookup, 2026-06), the citing records simply use the wrong key. This script remaps
 * those keys to the existing canonical ids. It does NOT invent any source data — every
 * target id below is an existing data/sources/<id>.json (asserted at runtime).
 *
 * DATA SAFETY:
 *   - Only rewrites entries inside provenance.sources_used; never deletes a record.
 *   - Each target id MUST already exist as a source record, or the script aborts.
 *   - Writes a revert log to data/_audit/remap-dangling-<ts>.json listing every
 *     {file, before, after}. `--revert <log.json>` restores the exact prior arrays.
 *
 * The four refs that could NOT be web-verified (rippmann_die_2006, the Binding /
 * Sjöberg-Margaret / Sonderegger strings) are intentionally LEFT dangling — honest
 * weakly-attested flags, not fabricated sources.
 *
 * Usage:
 *   node scripts/migrate/remap-dangling-source-refs.mjs            # dry-run
 *   node scripts/migrate/remap-dangling-source-refs.mjs --write
 *   node scripts/migrate/remap-dangling-source-refs.mjs --revert data/_audit/remap-dangling-<ts>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const SOURCES_DIR = path.join(DATA, 'sources');
const AUDIT_DIR = path.join(DATA, '_audit');

// stale cite-key → existing canonical source id (all targets verified to exist).
const REMAP = {
  'smith_the_2012': 'smith_aztecs_2012',
  "d'altroy_the_2014": 'daltroy_incas_2014',
  'Hammel-Kiesow, The Hanseatic League': 'hammel-kiesow_die_2000',
  'Lindkvist & Sjöberg, Det medeltida Sverige': 'lindkvist_det_2003',
};

// Record kinds whose files may carry provenance.sources_used.
const KIND_DIRS = ['entities','events','relationships','rulers','capitals','settlements','military','institutions','technologies','texts','journeys','claims'];

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const revertIdx = argv.indexOf('--revert');

function sourceExists(id) {
  return fs.existsSync(path.join(SOURCES_DIR, `${id}.json`));
}

function listRecordFiles() {
  const files = [];
  for (const k of KIND_DIRS) {
    const d = path.join(DATA, k);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.json')) files.push(path.join(d, f));
    }
  }
  return files;
}

if (revertIdx !== -1) {
  const logPath = argv[revertIdx + 1];
  if (!logPath || !fs.existsSync(logPath)) { console.error('revert log not found:', logPath); process.exit(1); }
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  for (const e of log.changes) {
    const j = JSON.parse(fs.readFileSync(e.file, 'utf8'));
    j.provenance.sources_used = e.before;
    fs.writeFileSync(e.file, JSON.stringify(j, null, 2) + '\n');
  }
  console.log(`reverted ${log.changes.length} files from ${path.basename(logPath)}`);
  process.exit(0);
}

// Assert every target exists before touching anything (fail loudly, no fabrication).
const missingTargets = [...new Set(Object.values(REMAP))].filter((id) => !sourceExists(id));
if (missingTargets.length) {
  console.error('ABORT — these canonical target source ids do not exist:', missingTargets.join(', '));
  process.exit(1);
}

const changes = [];
for (const file of listRecordFiles()) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const su = j.provenance && j.provenance.sources_used;
  if (!Array.isArray(su)) continue;
  let touched = false;
  const before = su.slice();
  const after = su.map((s) => {
    if (REMAP[s]) { touched = true; return REMAP[s]; }
    return s;
  });
  // de-dup in case the canonical id was already present alongside the stale one
  const deduped = [...new Set(after)];
  if (touched) {
    changes.push({ file: path.relative(ROOT, file), before, after: deduped });
    if (WRITE) {
      j.provenance.sources_used = deduped;
      fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
    }
  }
}

console.log(`\n=== remap-dangling-source-refs (${WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
console.log(`records touched: ${changes.length}`);
for (const c of changes) {
  const remapped = c.before.filter((s) => REMAP[s]);
  console.log(`  ${c.file}: ${remapped.map((s) => `${s} → ${REMAP[s]}`).join(', ')}`);
}

if (WRITE) {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const stamp = process.env.AUDIT_STAMP || 'remap-dangling';
  const logPath = path.join(AUDIT_DIR, `${stamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ remap: REMAP, changes }, null, 2));
  console.log(`\nrevert log → ${path.relative(ROOT, logPath)}`);
} else {
  console.log('\n(dry-run — nothing written.)');
}
