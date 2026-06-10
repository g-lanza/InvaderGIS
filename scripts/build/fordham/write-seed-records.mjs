#!/usr/bin/env node
/**
 * write-seed-records.mjs — Promote the A2/A3 seed extraction result into the
 * data/fordham/ typed-record tree (write-new only; never touches medieval data).
 *
 * Reads the workflow output envelope (tasks/<id>.output → .result), validates
 * each record minimally, and writes one JSON file per record under the folder
 * that matches the medieval TYPE_DIR convention. Source records get written too.
 *
 * REALNESS / DATA-SAFETY: writes only into data/fordham/<dir>/. Skips malformed
 * records (no id / no kind). No coordinate is added that the extractor did not
 * already provide. Idempotent: re-running overwrites the same per-id files.
 *
 * Usage: node scripts/build/fordham/write-seed-records.mjs <path-to-output-json>
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = process.argv[2] || path.join(ROOT, 'data', '_raw', 'fordham', '_seed_extraction.json');

const TYPE_DIR = {
  polity: 'entities',
  event: 'events',
  journey: 'journeys',
  relationship: 'relationships',
  ruler: 'rulers',
  source: 'sources',
  institution: 'institutions',
  technology: 'technologies',
  text: 'texts',
};

const env = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const result = env.result ?? env;

/** Collect all records: the per-kind buckets + the synthesized source records. */
const all = [];
const byKind = result.records_by_kind ?? {};
for (const kind of Object.keys(byKind)) {
  for (const r of byKind[kind]) all.push(r);
}
for (const s of (result.source_records ?? [])) all.push(s);

let written = 0;
let skipped = 0;
const perKind = {};

for (const rec of all) {
  if (!rec || typeof rec.kind !== 'string' || typeof rec.id !== 'string' || !rec.id) {
    skipped++;
    continue;
  }
  const dir = TYPE_DIR[rec.kind];
  if (!dir) { skipped++; continue; }

  // Ensure dataset stamp + minimal provenance presence (source records exempt).
  rec.dataset = 'fordham-medieval-sourcebook';
  if (rec.kind !== 'source' && (!rec.provenance || !Array.isArray(rec.provenance.sources_used))) {
    // Honest: if a record arrived without provenance, attach the index source if we can infer it.
    const idx = rec._fordham_index;
    rec.provenance = rec.provenance && typeof rec.provenance === 'object' ? rec.provenance : {};
    rec.provenance.sources_used = idx ? ['fordham:' + idx] : [];
    rec.provenance.status = rec.provenance.status || 'draft';
  }

  const outDir = path.join(ROOT, 'data', 'fordham', dir);
  fs.mkdirSync(outDir, { recursive: true });
  // Filename: slugified id (already snake_case); strip any path-unsafe chars.
  const slug = rec.id.replace(/[^a-z0-9_:-]/gi, '_').replace(/:/g, '_');
  fs.writeFileSync(path.join(outDir, slug + '.json'), JSON.stringify(rec, null, 1));
  written++;
  perKind[rec.kind] = (perKind[rec.kind] || 0) + 1;
}

console.log('[write-seed] wrote ' + written + ' records, skipped ' + skipped);
for (const k of Object.keys(perKind)) console.log('  ' + k + ': ' + perKind[k]);
console.log('[write-seed] → data/fordham/');
