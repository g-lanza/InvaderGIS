/**
 * write-recovered-sources.mjs — Source-recovery writer (Priority-2 support).
 *
 * The RESOLUTION (slug → real author/title/year/url) is done by web-verification
 * (human/LLM with WebSearch), NOT by this script — guessing bibliographic data
 * would violate the project conventions. This script only WRITES already-verified source
 * records and enforces realness:
 *
 *   - Only writes a source whose entry has a real `title` (the minimum bar for a
 *     citation). Entries lacking a verified title are REJECTED (logged) and left
 *     as honest unresolved flags on the claims.
 *   - Never overwrites an existing source record (idempotent / resumable).
 *   - Writes data/sources/<id>.json in the established Source shape.
 *   - Reversible: appends created files to data/_audit/recovered-sources-<ts>.json;
 *     --revert deletes exactly those.
 *
 * Input batch JSON shape (one verified source per entry):
 *   [ { "id":"treadgold_a_1997", "title":"A History of the Byzantine State and Society",
 *       "author":"Warren Treadgold", "year":1997, "kind":"monograph",
 *       "url":"https://archive.org/details/historyofbyzanti0000trea",
 *       "verified_via":"websearch:abebooks+archive.org" }, ... ]
 *   kind ∈ primary|monograph|biography|survey|edited|popular|dataset (default monograph).
 *
 * Usage:
 *   node scripts/build/write-recovered-sources.mjs <batch.json>           # dry-run
 *   node scripts/build/write-recovered-sources.mjs <batch.json> --write
 *   node scripts/build/write-recovered-sources.mjs --revert <auditlog.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const SOURCES_DIR = path.join(DATA, 'sources');
const AUDIT_DIR = path.join(DATA, '_audit');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;
const BATCH_FILE = argv.find((a) => !a.startsWith('--') && a !== REVERT_FILE);

const KINDS = new Set(['primary', 'monograph', 'biography', 'survey', 'edited', 'popular', 'dataset']);

function run() {
  if (!BATCH_FILE) { console.error('Provide a batch JSON file.'); process.exit(1); }
  const batch = JSON.parse(fs.readFileSync(path.isAbsolute(BATCH_FILE) ? BATCH_FILE : path.join(ROOT, BATCH_FILE), 'utf8'));

  const toWrite = [];
  const rejected = [];
  for (const e of batch) {
    if (!e.id || typeof e.id !== 'string') { rejected.push({ entry: e, reason: 'no id' }); continue; }
    if (!e.title || typeof e.title !== 'string' || e.title.trim().length < 3) {
      rejected.push({ id: e.id, reason: 'no verified title — left as honest unresolved flag' });
      continue;
    }
    if (fs.existsSync(path.join(SOURCES_DIR, `${e.id}.json`))) continue; // resumable, never overwrite
    const rec = {
      kind: 'source',
      dataset: 'medieval-europe-500-1500',
      id: e.id,
      title: e.title.trim(),
      ...(e.author ? { author: String(e.author).trim() } : {}),
      ...(Number.isFinite(e.year) ? { year: e.year } : {}),
      kind_type: KINDS.has(e.kind) ? e.kind : 'monograph',
      status: 'draft', // recovered, not yet promoted to reviewed
      ...(e.url && /^https?:\/\//i.test(e.url) ? { url: e.url } : {}),
      _quarry: {
        recovered: true,
        recovered_via: 'source-recovery-pass (web-verified)',
        verified_via: e.verified_via ?? 'websearch',
        notes: 'Recovered to resolve dangling citation slug. Verify before promoting to reviewed.',
      },
    };
    toWrite.push(rec);
  }

  console.log(`\n=== write-recovered-sources (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) batch=${path.basename(BATCH_FILE)} ===`);
  console.log(`entries: ${batch.length} | to write: ${toWrite.length} | rejected: ${rejected.length}`);
  for (const r of rejected.slice(0, 8)) console.log('  REJECT', r.id ?? '(no id)', '—', r.reason);
  for (const c of toWrite.slice(0, 4)) console.log(`  [${c.id}] ${c.author ?? '?'} — ${c.title.slice(0, 60)} (${c.year ?? '?'})`);

  if (!MODE_WRITE) { console.log('\n(dry-run — nothing written.)'); return; }
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const created = [];
  for (const c of toWrite) {
    const file = path.join(SOURCES_DIR, `${c.id}.json`);
    fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n', 'utf8');
    created.push(path.relative(ROOT, file));
  }
  const ts = process.env.SRC_TS ?? String(Date.now());
  const auditPath = path.join(AUDIT_DIR, `recovered-sources-${ts}.json`);
  fs.writeFileSync(auditPath, JSON.stringify(
    { script: 'scripts/build/write-recovered-sources.mjs', batch: path.basename(BATCH_FILE), mode: 'write',
      timestamp_ms: Number(ts) || ts, created_count: created.length, rejected, created_files: created }, null, 2) + '\n', 'utf8');
  console.log(`\nWROTE ${created.length} source records. Revert log: ${path.relative(ROOT, auditPath)}`);
}

function revert(auditFile) {
  const abs = path.isAbsolute(auditFile) ? auditFile : path.join(ROOT, auditFile);
  const log = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let removed = 0;
  for (const rel of log.created_files ?? []) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
  }
  console.log(`Reverted: deleted ${removed} recovered source records.`);
}

if (REVERT_FILE) revert(REVERT_FILE);
else run();
