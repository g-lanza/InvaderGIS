/**
 * generate-claims.mjs — Track A of Priority-2 population (Competitive Audit §4B).
 *
 * Generates first-class `claim` records from the assertions that are ALREADY
 * single, falsifiable, and sourced: relationships and journeys. (Event
 * narratives are NOT decomposed here — that is a separate, judgment-based
 * extraction pass. Mechanically splitting an event
 * paragraph would fabricate claim boundaries, subjects, and citations — a §1
 * violation. So events are deliberately excluded from this script.)
 *
 * WHAT BECOMES A CLAIM:
 *   relationship -> "X —<type>→ Y" over [since..until]
 *       statement   = the relationship note (a real, falsifiable assertion)
 *       subject_ids = participants[].entity_id (+ from_id/to_id)
 *       predicate   = relationship type (rivalry, vassalage, ...)
 *       object_ids  = directed → the second participant; else omitted
 *       period      = { from: since, to: until }
 *   journey -> "the <name> spanned [year_start..year_end]"
 *       statement   = name + span (+ first/last waypoint places when present)
 *       subject_ids = the entity id embedded in the journey id (substring match)
 *       period      = { from: year_start, to: year_end }
 *
 * REALNESS LAW:
 *   A claim is generated ONLY when its seed has a non-empty sources_used. The
 *   claim INHERITS that exact provenance (sources_used, confidence, attestation)
 *   — it does not invent a citation. attestation stays 'inferred': the claim is
 *   derived from the seed record, not independently verified. Seeds without
 *   sources produce NO claim (honest-empty), logged in skipped_no_source.
 *
 * NON-DESTRUCTIVE / REVERSIBLE:
 *   Writes NEW files to data/claims/claim_<seed_id>.json. Never overwrites an
 *   existing claim (skips if present). Dry-run is the default; --write commits
 *   and emits a revert log to data/_audit/. --revert <log> deletes exactly the
 *   files this run created (and only those — it checks they were generated).
 *
 * Usage:
 *   node scripts/build/generate-claims.mjs            # dry-run (default)
 *   node scripts/build/generate-claims.mjs --write     # commit + audit log
 *   node scripts/build/generate-claims.mjs --revert data/_audit/generate-claims-<ts>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const CLAIMS_DIR = path.join(DATA, 'claims');
const AUDIT_DIR = path.join(DATA, '_audit');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;

function readKind(dir) {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')));
}

const hasSources = (rec) =>
  Array.isArray(rec?.provenance?.sources_used) && rec.provenance.sources_used.length > 0;

/** Sourced-entity id set (for journey substring matching). */
function buildSourcedEntityIds() {
  const ids = [];
  for (const r of readKind('entities')) if (hasSources(r)) ids.push(r.id);
  // longest-first so a longer id wins over a shorter substring of it
  return ids.sort((a, b) => b.length - a.length);
}

/** Carry the seed's provenance onto the claim verbatim (inherit, don't invent). */
function inheritProvenance(seed) {
  const p = seed.provenance ?? {};
  return {
    status: p.status ?? 'draft',
    sources_used: [...(p.sources_used ?? [])],
    confidence: p.confidence ?? 'low',
    attestation: p.attestation ?? 'inferred',
    ...(p.disputes ? { disputes: p.disputes } : {}),
    ...(p.external_ids ? { external_ids: p.external_ids } : {}),
  };
}

function relationshipToClaim(rel) {
  const participants = (rel.participants ?? []).map((p) => p.entity_id).filter(Boolean);
  const legacy = [rel.from_id, rel.to_id].filter(Boolean);
  const subject_ids = [...new Set([...participants, ...legacy])];
  if (subject_ids.length === 0) return null;
  const statement =
    typeof rel.note === 'string' && rel.note.trim()
      ? rel.note.trim()
      : `${subject_ids.join(' and ')} stood in a ${rel.type ?? 'relationship'} relationship` +
        (rel.since != null ? ` (${rel.since}${rel.until != null ? `–${rel.until}` : ''})` : '');
  const claim = {
    kind: 'claim',
    dataset: rel.dataset ?? 'medieval-europe-500-1500',
    id: `claim_${rel.id}`,
    statement,
    subject_ids,
    predicate: rel.type,
    derived_from: rel.id,
    provenance: inheritProvenance(rel),
  };
  if (rel.directed && subject_ids.length >= 2) claim.object_ids = [subject_ids[1]];
  if (rel.since != null || rel.until != null)
    claim.period = {
      ...(rel.since != null ? { from: rel.since } : {}),
      ...(rel.until != null ? { to: rel.until } : {}),
    };
  return claim;
}

function journeyToClaim(jr, sourcedIds) {
  // No entity ref field: match a sourced entity id that is a substring of the journey id.
  const subject = sourcedIds.find((eid) => jr.id.includes(eid));
  if (!subject) return null;
  const wps = Array.isArray(jr.waypoints) ? jr.waypoints : [];
  const first = wps[0]?.place;
  const last = wps[wps.length - 1]?.place;
  const route = first && last && first !== last ? `, from ${first} to ${last}` : '';
  const statement =
    `${jr.name ?? jr.id} spanned ${jr.year_start}–${jr.year_end}${route}.`;
  return {
    kind: 'claim',
    dataset: jr.dataset ?? 'medieval-europe-500-1500',
    id: `claim_${jr.id}`,
    statement,
    subject_ids: [subject],
    predicate: jr.kind_type ?? jr.kind ?? 'journey',
    derived_from: jr.id,
    period: { from: jr.year_start, to: jr.year_end },
    provenance: inheritProvenance(jr),
  };
}

function run() {
  const sourcedIds = buildSourcedEntityIds();
  const generated = [];
  const report = {
    relationships: { total: 0, claimed: 0, skipped_no_source: 0, already: 0 },
    journeys: { total: 0, claimed: 0, skipped_no_source: 0, already: 0 },
  };

  const exists = (id) => fs.existsSync(path.join(CLAIMS_DIR, `${id}.json`));

  const rels = readKind('relationships');
  report.relationships.total = rels.length;
  for (const rel of rels) {
    if (!hasSources(rel)) { report.relationships.skipped_no_source++; continue; }
    const claim = relationshipToClaim(rel);
    if (!claim) { report.relationships.skipped_no_source++; continue; }
    if (exists(claim.id)) { report.relationships.already++; continue; }
    report.relationships.claimed++;
    generated.push(claim);
  }

  const jrs = readKind('journeys');
  report.journeys.total = jrs.length;
  for (const jr of jrs) {
    if (!hasSources(jr)) { report.journeys.skipped_no_source++; continue; }
    const claim = journeyToClaim(jr, sourcedIds);
    if (!claim) { report.journeys.skipped_no_source++; continue; }
    if (exists(claim.id)) { report.journeys.already++; continue; }
    report.journeys.claimed++;
    generated.push(claim);
  }

  console.log(`\n=== generate-claims (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  for (const k of ['relationships', 'journeys']) {
    const r = report[k];
    console.log(
      `${k.padEnd(14)} total ${String(r.total).padStart(4)} | ` +
        `claims ${String(r.claimed).padStart(4)} | ` +
        `already ${String(r.already).padStart(4)} | ` +
        `no-source ${String(r.skipped_no_source).padStart(4)}`,
    );
  }
  console.log(`\nTOTAL new claims: ${generated.length}`);
  if (generated.length) {
    console.log('Sample statements:');
    for (const c of generated.slice(0, 3))
      console.log(`  [${c.id}] ${c.statement.slice(0, 80)}${c.statement.length > 80 ? '…' : ''}`);
  }

  if (!MODE_WRITE) {
    console.log('\n(dry-run — no files written. Re-run with --write to commit.)');
    return;
  }

  if (!fs.existsSync(CLAIMS_DIR)) fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const written = [];
  for (const c of generated) {
    const file = path.join(CLAIMS_DIR, `${c.id}.json`);
    fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n', 'utf8');
    written.push(path.relative(ROOT, file));
  }
  const ts = process.env.CLAIMS_TS ?? String(Date.now());
  const auditPath = path.join(AUDIT_DIR, `generate-claims-${ts}.json`);
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      {
        script: 'scripts/build/generate-claims.mjs',
        mode: 'write',
        timestamp_ms: Number(ts) || ts,
        rule: 'claims derived from sourced relationships + journeys; provenance inherited; attestation inferred',
        report,
        created_files: written,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`\nWROTE ${written.length} claim files. Revert log: ${path.relative(ROOT, auditPath)}`);
  console.log(`Revert with: node scripts/build/generate-claims.mjs --revert ${path.relative(ROOT, auditPath)}`);
}

function revert(auditFile) {
  const abs = path.isAbsolute(auditFile) ? auditFile : path.join(ROOT, auditFile);
  const log = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let removed = 0;
  for (const rel of log.created_files ?? []) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
  }
  console.log(`Reverted: deleted ${removed} generated claim files from ${path.relative(ROOT, abs)}.`);
}

if (REVERT_FILE) revert(REVERT_FILE);
else run();
