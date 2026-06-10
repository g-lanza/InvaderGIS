/**
 * backfill-provenance-floor.mjs — Priority 1 of the Competitive Audit.
 *
 * Closes the provenance floor for the three unsourced kinds:
 *   relationships (0%), journeys (0%), events (7%).
 *
 * EVIDENCE RULE:
 *   A relationship / journey / event is, by construction, an assertion DERIVED
 *   from the entity records it references. We therefore set:
 *     provenance.sources_used = union of the referenced entities' sources_used
 *     provenance.attestation  = 'inferred'   ← the honest truth-teller:
 *                                "derived from sourced entity records, not
 *                                 independently attested"
 *     provenance.confidence   = 'low'
 *     provenance.status       = (unchanged; left 'draft')
 *   This fabricates NOTHING. It does not invent a source, date, or citation —
 *   it points at sources that genuinely exist in our dataset and labels the
 *   link as inferred. Independent attestation (upgrading specific records to
 *   attestation:'strong' with a verified citation) is a later, targeted pass.
 *
 * HONEST-EMPTY RULE:
 *   Any record whose references resolve to ZERO sourced entities is left
 *   UNTOUCHED and listed in the audit log's `skipped_no_source`. Never given
 *   a fake citation.
 *
 * ENRICH-ONLY RULE:
 *   Records that already carry a non-empty sources_used are skipped (never
 *   overwritten).
 *
 * REVERSIBILITY:
 *   Default mode is --dry-run (writes nothing, prints counts). --write commits
 *   and emits a full revert log to data/_audit/backfill-provenance-floor-<ts>.json
 *   storing { file, before, after } per mutated record. Run with --revert
 *   <auditfile> to restore exactly.
 *
 * Per-kind source resolution:
 *   relationship -> participants[].entity_id + from_id + to_id
 *   event        -> owning `entity` (polity id)
 *   journey      -> the sourced entity id that appears as a contiguous substring
 *                   of the journey id (conservative; no fuzzy token matching).
 *                   Journeys carry NO entity reference field, so most are
 *                   honest-empty unless their id embeds a known entity id.
 *
 * Usage:
 *   node scripts/build/backfill-provenance-floor.mjs            # dry-run (default)
 *   node scripts/build/backfill-provenance-floor.mjs --write    # commit + audit log
 *   node scripts/build/backfill-provenance-floor.mjs --revert data/_audit/backfill-provenance-floor-<ts>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const AUDIT_DIR = path.join(DATA, '_audit');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;

/** Read every <kind> JSON file as { file, record }. */
function readKind(dir) {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(full, f);
      return { file, record: JSON.parse(fs.readFileSync(file, 'utf8')) };
    });
}

/** Build entityId -> sources_used[] (only entities that ARE sourced). */
function buildEntitySourceMap() {
  const map = new Map();
  for (const { record } of readKind('entities')) {
    const su = record?.provenance?.sources_used;
    if (Array.isArray(su) && su.length) map.set(record.id, su);
  }
  return map;
}

const hasSources = (rec) =>
  Array.isArray(rec?.provenance?.sources_used) && rec.provenance.sources_used.length > 0;

/** Union of sources for a list of entity ids, using the sourced-entity map. */
function unionSources(entityIds, entSrc) {
  const set = new Set();
  for (const id of entityIds) {
    const su = entSrc.get(id);
    if (su) su.forEach((s) => set.add(s));
  }
  return [...set];
}

/** Resolve the referenced entity ids for one record of a given kind. */
function referencedEntityIds(kind, rec, entSrc) {
  if (kind === 'relationship') {
    const ids = [];
    for (const p of rec.participants ?? []) if (p?.entity_id) ids.push(p.entity_id);
    if (rec.from_id) ids.push(rec.from_id);
    if (rec.to_id) ids.push(rec.to_id);
    return [...new Set(ids)];
  }
  if (kind === 'event') {
    return rec.entity ? [rec.entity] : [];
  }
  if (kind === 'journey') {
    // No entity ref field. Accept only a sourced entity id that appears as a
    // contiguous substring of the journey id (deterministic, no fuzzy match).
    // Prefer the LONGEST such id to avoid matching a short id inside a longer one.
    let best = null;
    for (const eid of entSrc.keys()) {
      if (rec.id.includes(eid) && (!best || eid.length > best.length)) best = eid;
    }
    return best ? [best] : [];
  }
  return [];
}

const KINDS = ['relationships', 'journeys', 'events'];
const KIND_SINGULAR = { relationships: 'relationship', journeys: 'journey', events: 'event' };

function run() {
  const entSrc = buildEntitySourceMap();
  const auditChanges = [];
  const report = {};

  for (const dir of KINDS) {
    const kind = KIND_SINGULAR[dir];
    const items = readKind(dir);
    const r = { total: items.length, already: 0, sourced: 0, skipped_no_source: 0, no_source_ids: [] };

    for (const { file, record } of items) {
      if (hasSources(record)) {
        r.already++;
        continue;
      }
      const refIds = referencedEntityIds(kind, record, entSrc);
      const sources = unionSources(refIds, entSrc);
      if (sources.length === 0) {
        r.skipped_no_source++;
        if (r.no_source_ids.length < 50) r.no_source_ids.push(record.id);
        continue;
      }

      const before = record.provenance ? { ...record.provenance } : undefined;
      const after = {
        ...(record.provenance ?? {}),
        status: record.provenance?.status ?? 'draft',
        sources_used: sources,
        confidence: 'low',
        attestation: 'inferred',
      };

      r.sourced++;
      auditChanges.push({ file: path.relative(ROOT, file), kind, id: record.id, before, after });

      if (MODE_WRITE) {
        const next = { ...record, provenance: after };
        fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
      }
    }
    report[dir] = r;
  }

  // ---- print report ----
  console.log(`\n=== backfill-provenance-floor (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  for (const dir of KINDS) {
    const r = report[dir];
    console.log(
      `${dir.padEnd(14)} total ${String(r.total).padStart(4)} | ` +
        `would-source ${String(r.sourced).padStart(4)} | ` +
        `already ${String(r.already).padStart(4)} | ` +
        `honest-empty ${String(r.skipped_no_source).padStart(4)}`,
    );
  }
  const totalSourced = KINDS.reduce((a, d) => a + report[d].sourced, 0);
  console.log(`\nTOTAL records that would gain provenance: ${totalSourced}`);
  console.log('Honest-empty sample ids:');
  for (const dir of KINDS) {
    if (report[dir].no_source_ids.length)
      console.log(`  ${dir}: ${report[dir].no_source_ids.slice(0, 6).join(', ')}`);
  }

  if (MODE_WRITE) {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const ts = process.env.BACKFILL_TS ?? String(Date.now());
    const auditPath = path.join(AUDIT_DIR, `backfill-provenance-floor-${ts}.json`);
    fs.writeFileSync(
      auditPath,
      JSON.stringify(
        {
          script: 'scripts/build/backfill-provenance-floor.mjs',
          mode: 'write',
          timestamp_ms: Number(ts) || ts,
          evidence_rule: 'inherit union of referenced-entity sources; attestation=inferred; confidence=low',
          report,
          changes: auditChanges,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    console.log(`\nWROTE ${auditChanges.length} records. Revert log: ${path.relative(ROOT, auditPath)}`);
    console.log(`Revert with: node scripts/build/backfill-provenance-floor.mjs --revert ${path.relative(ROOT, auditPath)}`);
  } else {
    console.log('\n(dry-run — no files changed. Re-run with --write to commit.)');
  }
}

function revert(auditFile) {
  const abs = path.isAbsolute(auditFile) ? auditFile : path.join(ROOT, auditFile);
  const log = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let restored = 0;
  for (const ch of log.changes ?? []) {
    const file = path.join(ROOT, ch.file);
    if (!fs.existsSync(file)) continue;
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const next = { ...rec };
    if (ch.before === undefined) delete next.provenance;
    else next.provenance = ch.before;
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
    restored++;
  }
  console.log(`Reverted ${restored} records from ${path.relative(ROOT, abs)}.`);
}

if (REVERT_FILE) revert(REVERT_FILE);
else run();
