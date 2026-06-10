/**
 * write-event-claims.mjs — Track B writer for event-narrative decomposition.
 *
 * The DECOMPOSITION (splitting an event narrative into atomic, falsifiable
 * claims with the correct subject entities) is done by a human/LLM with
 * judgment — NOT by this script (a mechanical split would fabricate claim
 * boundaries and subjects, violating the project conventions). This script only WRITES the
 * already-extracted claims into proper records, and it enforces realness:
 *
 *   - Every claim's provenance is INHERITED from its source event (sources_used,
 *     attestation, confidence). Citations are never invented here — they come
 *     from the real event record. If an event is unsourced, its claims are
 *     REJECTED (logged), never written sourceless.
 *   - Subject ids are VALIDATED against real entity ids; an unknown subject is
 *     rejected (logged), never written.
 *   - Deterministic ids: claim_<event_id>_c<NN>. Existing files are never
 *     overwritten (idempotent / resumable across batches).
 *   - Reversible: appends created files to a per-run audit log; --revert deletes
 *     exactly those files.
 *
 * Input: a JSON file (the "batch") shaped as
 *   [ { "derived_from": "<event_id>",
 *       "claims": [ { "statement": "...", "subject_ids": ["abbasid_caliphate"] }, ... ] }, ... ]
 * subject_ids may be omitted on a claim to default to [event.entity].
 *
 * Usage:
 *   node scripts/build/write-event-claims.mjs <batch.json>            # dry-run
 *   node scripts/build/write-event-claims.mjs <batch.json> --write    # commit
 *   node scripts/build/write-event-claims.mjs --revert <auditlog.json>
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
const BATCH_FILE = argv.find((a) => !a.startsWith('--') && a !== REVERT_FILE);

let _entIds = null;
function entityIds() {
  if (_entIds) return _entIds;
  _entIds = new Set(
    fs.readdirSync(path.join(DATA, 'entities')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')),
  );
  return _entIds;
}

let _srcIds = null;
/** Ids of source records that actually EXIST in the library (resolve to a real citation). */
function sourceIds() {
  if (_srcIds) return _srcIds;
  _srcIds = new Set(
    fs.readdirSync(path.join(DATA, 'sources')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')),
  );
  return _srcIds;
}

function loadEvent(id) {
  const f = path.join(EVENTS_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/**
 * Inherit the event's provenance, but SPLIT cited source ids into those that
 * resolve to a real source record (→ sources_used, which ClaimCitations renders
 * as readable Chicago footnotes hyperlinked to the Sources page) and those that
 * do NOT (→ unresolved_sources, flagged honestly per the user's directive, never
 * shown as a bare-slug citation). 42% of event citations currently point at
 * source records not yet in the library; this keeps claims from presenting dead
 * footnotes while preserving the record of what was cited for a recovery pass.
 */
function inheritProvenance(ev) {
  const p = ev.provenance ?? {};
  const srcs = sourceIds();
  const cited = [...(p.sources_used ?? [])];
  const resolved = cited.filter((id) => srcs.has(id));
  const unresolved = cited.filter((id) => !srcs.has(id));
  return {
    provenance: {
      status: p.status ?? 'draft',
      sources_used: resolved,
      confidence: p.confidence ?? 'low',
      attestation: p.attestation ?? 'inferred',
    },
    unresolved,
    anyResolved: resolved.length > 0,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function run() {
  if (!BATCH_FILE) {
    console.error('Provide a batch JSON file. See header for shape.');
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(path.isAbsolute(BATCH_FILE) ? BATCH_FILE : path.join(ROOT, BATCH_FILE), 'utf8'));
  const ents = entityIds();

  const toWrite = [];
  const rejected = [];
  let eventsSeen = 0;

  for (const entry of batch) {
    const ev = loadEvent(entry.derived_from);
    eventsSeen++;
    if (!ev) { rejected.push({ event: entry.derived_from, reason: 'event not found' }); continue; }
    const { provenance, unresolved, anyResolved } = inheritProvenance(ev);
    if (!anyResolved) {
      rejected.push({ event: entry.derived_from, reason: 'no cited source resolves to a library record — claims rejected (no dead-link citations)' });
      continue;
    }
    let idx = 0;
    for (const c of entry.claims ?? []) {
      const subjects = (c.subject_ids && c.subject_ids.length ? c.subject_ids : [ev.entity]).filter(Boolean);
      const validSubjects = subjects.filter((s) => ents.has(s));
      if (!validSubjects.length) {
        rejected.push({ event: entry.derived_from, statement: c.statement?.slice(0, 60), reason: 'no valid subject entity' });
        continue;
      }
      if (!c.statement || c.statement.trim().length < 8) {
        rejected.push({ event: entry.derived_from, reason: 'empty/too-short statement' });
        continue;
      }
      idx++;
      const id = `claim_${entry.derived_from}_c${pad2(idx)}`;
      if (fs.existsSync(path.join(CLAIMS_DIR, `${id}.json`))) continue; // resumable
      toWrite.push({
        kind: 'claim',
        dataset: ev.dataset ?? 'medieval-europe-500-1500',
        id,
        statement: c.statement.trim(),
        subject_ids: validSubjects,
        ...(ev.year != null ? { period: { from: ev.year, to: ev.year } } : {}),
        derived_from: entry.derived_from,
        ...(unresolved.length ? { unresolved_sources: unresolved } : {}),
        provenance,
      });
    }
  }

  console.log(`\n=== write-event-claims (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) batch=${path.basename(BATCH_FILE)} ===`);
  console.log(`events in batch: ${eventsSeen} | claims to write: ${toWrite.length} | rejected: ${rejected.length}`);
  if (rejected.length) {
    const byReason = {};
    for (const r of rejected) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    console.log('rejected by reason:', JSON.stringify(byReason));
  }
  for (const c of toWrite.slice(0, 3)) console.log(`  [${c.id}] ${c.statement.slice(0, 76)}`);

  if (!MODE_WRITE) {
    console.log('\n(dry-run — nothing written. Add --write to commit.)');
    return;
  }
  if (!fs.existsSync(CLAIMS_DIR)) fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const created = [];
  for (const c of toWrite) {
    const file = path.join(CLAIMS_DIR, `${c.id}.json`);
    fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n', 'utf8');
    created.push(path.relative(ROOT, file));
  }
  const ts = process.env.CLAIMS_TS ?? String(Date.now());
  const auditPath = path.join(AUDIT_DIR, `write-event-claims-${ts}.json`);
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      { script: 'scripts/build/write-event-claims.mjs', batch: path.basename(BATCH_FILE), mode: 'write',
        timestamp_ms: Number(ts) || ts, created_count: created.length, rejected, created_files: created },
      null, 2,
    ) + '\n',
    'utf8',
  );
  console.log(`\nWROTE ${created.length} event-claim files. Revert log: ${path.relative(ROOT, auditPath)}`);
}

function revert(auditFile) {
  const abs = path.isAbsolute(auditFile) ? auditFile : path.join(ROOT, auditFile);
  const log = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let removed = 0;
  for (const rel of log.created_files ?? []) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
  }
  console.log(`Reverted: deleted ${removed} event-claim files from ${path.relative(ROOT, abs)}.`);
}

if (REVERT_FILE) revert(REVERT_FILE);
else run();
