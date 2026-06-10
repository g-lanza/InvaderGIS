/**
 * import-expansion-records.mjs — write the Phase-A web-verified technology + text
 * records and their cited sources, applying the realness law.
 *
 * REALNESS:
 *   - Each record's cited sources are written as `source` records if not already
 *     present (never overwrites an existing one).
 *   - A source whose ONLY evidence is a finding aid (Wikipedia / Britannica) is a
 *     WEAK attestation, not verified scholarship. Such records get
 *     provenance.attestation='weak'; records backed by ≥1 real scholarly source
 *     (book/journal/publisher) get 'inferred' (web-verified but not page-checked).
 *   - sources_used keeps only ids that resolve to a written source record.
 *   - Reversible: data/_audit/import-expansion-<ts>.json. Idempotent.
 *
 * Input: scripts/build/_eventclaims/_phaseA_tech.json and _phaseA_text.json,
 *   each an array of { record, source } where source is one object or an array.
 *
 * Usage: node scripts/build/import-expansion-records.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const AUDIT_DIR = path.join(DATA, '_audit');
const WRITE = process.argv.includes('--write');

const TECH_DIR = path.join(DATA, 'technologies');
const TEXT_DIR = path.join(DATA, 'texts');
const SRC_DIR = path.join(DATA, 'sources');

const isFindingAid = (s) =>
  /wikipedia|britannica/i.test(`${s.id ?? ''} ${s.url ?? ''} ${s.author ?? ''}`);

function loadPairs(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normSources(src) {
  if (!src) return [];
  return Array.isArray(src) ? src : [src];
}

function run() {
  const tech = loadPairs('scripts/build/_eventclaims/_phaseA_tech.json');
  const text = loadPairs('scripts/build/_eventclaims/_phaseA_text.json');
  const created = [];
  const report = { tech: 0, text: 0, sources_new: 0, sources_weak: 0, recordsWeak: 0, skippedExisting: 0 };

  const existingSrc = new Set(fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));

  function writeJson(dir, id, obj) {
    const file = path.join(dir, `${id}.json`);
    if (fs.existsSync(file)) { report.skippedExisting++; return false; }
    if (WRITE) fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    created.push(path.relative(ROOT, file));
    return true;
  }

  function ingest(pairs, dir, kind) {
    for (const pair of pairs) {
      const rec = pair.record;
      if (!rec || !rec.id) continue;
      const sources = normSources(pair.source);
      // Write each cited source that doesn't exist yet.
      const citedIds = [];
      let anyScholarly = false;
      for (const s of sources) {
        if (!s || !s.id || !s.title) continue;
        citedIds.push(s.id);
        const weak = isFindingAid(s);
        if (!weak) anyScholarly = true; else report.sources_weak++;
        if (!existingSrc.has(s.id)) {
          const srcRec = {
            kind: 'source', dataset: 'medieval-europe-500-1500', id: s.id,
            title: s.title, ...(s.author ? { author: s.author } : {}),
            ...(Number.isFinite(s.year) ? { year: s.year } : {}),
            kind_type: weak ? 'popular' : 'monograph',
            status: 'draft',
            ...(s.url && /^https?:\/\//i.test(s.url) ? { url: s.url } : {}),
            _quarry: { recovered: true, recovered_via: 'phaseA-expansion (web-verified)', finding_aid: weak,
              notes: weak ? 'Finding-aid citation (Wikipedia/Britannica) — weak attestation; verify before promoting.' : 'Web-verified scholarly source; verify before promoting to reviewed.' },
          };
          if (writeJson(SRC_DIR, s.id, srcRec)) { existingSrc.add(s.id); report.sources_new++; }
        }
      }
      // Realness: attestation reflects the strongest evidence behind the record.
      const attestation = anyScholarly ? 'inferred' : 'weak';
      if (attestation === 'weak') report.recordsWeak++;
      const provenance = {
        status: 'draft',
        sources_used: citedIds.filter((id) => existingSrc.has(id)),
        confidence: 'low',
        attestation,
      };
      const out = { ...rec, provenance };
      if (writeJson(dir, rec.id, out)) report[kind]++;
    }
  }

  ingest(tech, TECH_DIR, 'tech');
  ingest(text, TEXT_DIR, 'text');

  console.log(`\n=== import-expansion-records (${WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`files to create: ${created.length}`);

  if (WRITE) {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const ts = process.env.TS ?? String(Date.now());
    const auditPath = path.join(AUDIT_DIR, `import-expansion-${ts}.json`);
    fs.writeFileSync(auditPath, JSON.stringify({ script: 'import-expansion-records.mjs', report, created_files: created }, null, 2) + '\n', 'utf8');
    console.log(`WROTE ${created.length} files. Revert log: ${path.relative(ROOT, auditPath)}`);
  } else {
    console.log('(dry-run — add --write to commit.)');
  }
}

run();
