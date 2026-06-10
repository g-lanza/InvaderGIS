/**
 * complete-event-claims.mjs — finish the event-claim decomposition in ONE pass.
 *
 * The remaining ~1,146 eligible events are overwhelmingly terse Wikidata stub
 * summaries ("Battle of X (1423 CE), at Place (part of Y). Source: Wikidata Q…")
 * — each carries ONE fact, not a multi-claim narrative. The handful of rich
 * narratives are sentence-split. This script decomposes every remaining sourced
 * event directly (no subagents) and writes claims through the SAME realness gates
 * as write-event-claims.mjs:
 *   - subject_ids = [event.entity], validated against data/entities/ (invalid → skip)
 *   - provenance inherited; cited source ids split resolved → sources_used /
 *     missing → unresolved_sources; event with NO resolving source → skipped
 *     (no dead-link citations, the project conventions)
 *   - deterministic ids claim_<event>_cNN, never overwrites (idempotent/resumable)
 *   - reversible: data/_audit/complete-event-claims-<ts>.json; --revert deletes exactly those
 *
 * Statement construction (no fabrication — only reshapes the event's own text):
 *   - Strip trailing "Source: Wikidata …" / "Source: …" boilerplate.
 *   - wd-stub or short summary → ONE claim = the cleaned summary.
 *   - rich summary (≥160 chars, multiple sentences) → split on sentence
 *     boundaries into ≤4 atomic claims, dropping fragments < 15 chars.
 *
 * Usage:
 *   node scripts/build/complete-event-claims.mjs           # dry-run
 *   node scripts/build/complete-event-claims.mjs --write
 *   node scripts/build/complete-event-claims.mjs --revert data/_audit/complete-event-claims-<ts>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const EVENTS_DIR = path.join(DATA, 'events');
const CLAIMS_DIR = path.join(DATA, 'claims');
const AUDIT_DIR = path.join(DATA, '_audit');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;

const entityIds = () =>
  new Set(fs.readdirSync(path.join(DATA, 'entities')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));
const sourceIds = () =>
  new Set(fs.readdirSync(path.join(DATA, 'sources')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));

function inheritProvenance(ev, srcs) {
  const p = ev.provenance ?? {};
  const cited = [...(p.sources_used ?? [])];
  const resolved = cited.filter((id) => srcs.has(id));
  const unresolved = cited.filter((id) => !srcs.has(id));
  return {
    provenance: { status: p.status ?? 'draft', sources_used: resolved, confidence: p.confidence ?? 'low', attestation: p.attestation ?? 'inferred' },
    unresolved,
    anyResolved: resolved.length > 0,
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Remove trailing source-citation boilerplate the stub summaries carry. */
function stripBoilerplate(s) {
  return s
    .replace(/\s*Source:\s*Wikidata\s*Q\d+\.?\s*$/i, '')
    .replace(/\s*Source:\s*[^.]*\.?\s*$/i, '')
    .trim();
}

/** Decompose one event summary into atomic claim statements. */
function statementsFor(summary) {
  const cleaned = stripBoilerplate(summary || '').trim();
  if (cleaned.length < 8) return [];
  // Rich narrative → sentence-split into ≤4 atomic claims.
  if (cleaned.length >= 160) {
    const parts = cleaned
      .split(/(?<=[.!?])\s+(?=[A-Z(0-9])/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 15);
    if (parts.length > 1) return parts.slice(0, 4);
  }
  // Stub / short → single clean claim. Ensure it ends with a period.
  return [/[.!?]$/.test(cleaned) ? cleaned : cleaned + '.'];
}

function getRemaining() {
  const work = JSON.parse(fs.readFileSync(path.join(DATA, '../scripts/build/_eventclaims/worklist.json'), 'utf8'));
  const done = new Set(
    fs.readdirSync(CLAIMS_DIR).filter((f) => /_c01\.json$/.test(f)).map((f) => f.replace(/^claim_/, '').replace(/_c01\.json$/, '')),
  );
  return work.filter((id) => !done.has(id));
}

function run() {
  const ents = entityIds();
  const srcs = sourceIds();
  const remaining = getRemaining();
  const toWrite = [];
  const rejected = { noEvent: 0, noSource: 0, badSubject: 0, noStatement: 0 };

  for (const id of remaining) {
    const f = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(f)) { rejected.noEvent++; continue; }
    const ev = JSON.parse(fs.readFileSync(f, 'utf8'));
    const { provenance, unresolved, anyResolved } = inheritProvenance(ev, srcs);
    if (!anyResolved) { rejected.noSource++; continue; }
    if (!ev.entity || !ents.has(ev.entity)) { rejected.badSubject++; continue; }
    const statements = statementsFor(ev.summary);
    if (!statements.length) { rejected.noStatement++; continue; }
    let idx = 0;
    for (const st of statements) {
      idx++;
      const cid = `claim_${id}_c${pad2(idx)}`;
      if (fs.existsSync(path.join(CLAIMS_DIR, `${cid}.json`))) continue;
      toWrite.push({
        kind: 'claim',
        dataset: ev.dataset ?? 'medieval-europe-500-1500',
        id: cid,
        statement: st,
        subject_ids: [ev.entity],
        ...(ev.year != null ? { period: { from: ev.year, to: ev.year } } : {}),
        derived_from: id,
        ...(unresolved.length ? { unresolved_sources: unresolved } : {}),
        provenance,
      });
    }
  }

  console.log(`\n=== complete-event-claims (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  console.log(`remaining events: ${remaining.length} | claims to write: ${toWrite.length}`);
  console.log(`skipped — noEvent:${rejected.noEvent} noResolvingSource:${rejected.noSource} badSubject:${rejected.badSubject} noStatement:${rejected.noStatement}`);
  for (const c of toWrite.slice(0, 4)) console.log(`  [${c.id}] ${c.statement.slice(0, 80)}`);

  if (!MODE_WRITE) { console.log('\n(dry-run — nothing written. Add --write to commit.)'); return; }
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const created = [];
  for (const c of toWrite) {
    const file = path.join(CLAIMS_DIR, `${c.id}.json`);
    fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n', 'utf8');
    created.push(path.relative(ROOT, file));
  }
  const ts = process.env.CLAIMS_TS ?? String(Date.now());
  const auditPath = path.join(AUDIT_DIR, `complete-event-claims-${ts}.json`);
  fs.writeFileSync(auditPath, JSON.stringify({ script: 'scripts/build/complete-event-claims.mjs', mode: 'write', timestamp_ms: Number(ts) || ts, created_count: created.length, skipped: rejected, created_files: created }, null, 2) + '\n', 'utf8');
  console.log(`\nWROTE ${created.length} event-claim files. Revert log: ${path.relative(ROOT, auditPath)}`);
}

function revert(auditFile) {
  const abs = path.isAbsolute(auditFile) ? auditFile : path.join(ROOT, auditFile);
  const log = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let removed = 0;
  for (const rel of log.created_files ?? []) { const file = path.join(ROOT, rel); if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; } }
  console.log(`Reverted: deleted ${removed} files.`);
}

if (REVERT_FILE) revert(REVERT_FILE);
else run();
