#!/usr/bin/env node
/**
 * drop-unknown-sources.mjs — Wave 2 / Phase B.2 (data integrity).
 *
 * Replaces the literal `"unknown"` (and empty-string) source-ref PLACEHOLDERS in
 * provenance.sources_used with the honest empty array `[]`. These placeholders were
 * emitted at migration for Wikidata-derived events that carry no scholarly source;
 * `status:"draft"` + `confidence:"low"` already mark them as unsourced. A literal
 * `"unknown"` ref is a fake reference to a non-existent source record — dropping it
 * is honest cleanup (no-fabrication law, docs/03 §5), not data loss.
 *
 * DATA-SAFETY (docs/01 §1): read-old / write-new. Every modified file is backed up
 * (.bak-unknownsrc) and a revert entry is written to data/_audit/ before any write.
 * Reversibility: restore each .bak-unknownsrc over its .json to undo exactly.
 *
 *   node scripts/migrate/drop-unknown-sources.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const AUDIT = path.join(DATA, '_audit');
const DRY = process.argv.includes('--dry');

const BAD = new Set(['unknown', '']);
const touched = [];
let scanned = 0;

for (const dir of fs.readdirSync(DATA)) {
  const d = path.join(DATA, dir);
  if (!fs.statSync(d).isDirectory() || dir === '_audit' || dir === 'vocab' || dir.startsWith('_')) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    const fp = path.join(d, f);
    const raw = fs.readFileSync(fp, 'utf8');
    if (!raw.trim()) continue;
    scanned++;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    const su = rec.provenance?.sources_used;
    if (!Array.isArray(su) || !su.some((s) => BAD.has(s))) continue;

    const cleaned = su.filter((s) => !BAD.has(s));
    rec.provenance.sources_used = cleaned; // honest [] when only placeholders existed
    touched.push(path.relative(ROOT, fp));

    if (!DRY) {
      fs.copyFileSync(fp, fp + '.bak-unknownsrc'); // reversibility backup
      fs.writeFileSync(fp, JSON.stringify(rec, null, 2));
    }
  }
}

if (!DRY && touched.length) {
  fs.mkdirSync(AUDIT, { recursive: true });
  const log = path.join(AUDIT, `drop-unknown-sources-${touched.length}.json`);
  fs.writeFileSync(log, JSON.stringify({
    operation: 'B.2 drop literal "unknown"/empty source-ref placeholders → []',
    when: new Date().toISOString(),
    count: touched.length,
    revert: 'restore each <file>.bak-unknownsrc over its .json',
    files: touched,
  }, null, 2));
  console.log('revert log:', path.relative(ROOT, log));
}

console.log(DRY ? '\n[DRY RUN — nothing written]' : '\nB.2 complete (sources_used placeholders dropped to []).');
console.log(`scanned ${scanned} records · ${touched.length} cleaned`);
