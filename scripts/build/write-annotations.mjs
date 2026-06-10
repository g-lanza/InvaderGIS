/**
 * write-annotations.mjs — passage-annotation writer (Recogito-style surface).
 *
 * Activates the dormant `annotation` record layer (model + AnnotationCard +
 * register + loader + bake all already exist; only data was missing). An
 * annotation anchors a REAL, verifiable passage from a `text`/`source` record to
 * the entities and claims it attests (src/types/record.ts §Annotation).
 *
 * REALNESS:
 *   - target_id MUST resolve to a real text/source record — else rejected.
 *   - every links_to / supports_claims id MUST resolve to a real record — unknown
 *     ids are dropped (logged), never written as dead links.
 *   - quotes are genuine passages from public-domain primary sources; provenance
 *     cites the work. Nothing is invented.
 *
 * REVERSIBLE: logs created files to data/_audit/annotations-<ts>.json; --revert.
 *
 * Usage:
 *   node scripts/build/write-annotations.mjs                 # dry-run
 *   node scripts/build/write-annotations.mjs --write
 *   node scripts/build/write-annotations.mjs --revert <auditlog.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const ANNOT_DIR = path.join(DATA, 'annotations');
const AUDIT_DIR = path.join(DATA, '_audit');
const SEED = path.join(__dirname, '_annotations', 'seed.json');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;

/** All real record ids across every record dir (for link validation). */
function buildIdIndex() {
  const ids = new Set();
  const targets = new Set(); // text + source ids only
  for (const d of fs.readdirSync(DATA, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const dir = path.join(DATA, d.name);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      ids.add(id);
      if (d.name === 'texts' || d.name === 'sources') targets.add(id);
    }
  }
  return { ids, targets };
}

function doRevert() {
  if (!REVERT_FILE) { console.error('Provide an audit log to --revert.'); process.exit(1); }
  const log = JSON.parse(fs.readFileSync(path.isAbsolute(REVERT_FILE) ? REVERT_FILE : path.join(ROOT, REVERT_FILE), 'utf8'));
  let n = 0;
  for (const rel of log.created ?? []) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) { fs.unlinkSync(p); n++; }
  }
  console.log(`Reverted: removed ${n} annotation records.`);
}

function run() {
  if (REVERT_FILE) return doRevert();

  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const { ids, targets } = buildIdIndex();

  const toWrite = [];
  const rejected = [];
  for (const a of seed) {
    if (!a.id || !/^[a-z0-9_]+$/.test(a.id)) { rejected.push({ a, reason: 'bad/missing id' }); continue; }
    if (!a.target_id || !targets.has(a.target_id)) {
      rejected.push({ id: a.id, reason: `target_id "${a.target_id}" is not a real text/source` });
      continue;
    }
    if (!a.anchor || (!a.anchor.quote && !a.anchor.locator)) {
      rejected.push({ id: a.id, reason: 'no anchor quote/locator' });
      continue;
    }
    // validate + prune links
    const linksTo = (a.links_to ?? []).filter((id) => ids.has(id));
    const droppedLinks = (a.links_to ?? []).filter((id) => !ids.has(id));
    const supports = (a.supports_claims ?? []).filter((id) => ids.has(id));
    const droppedClaims = (a.supports_claims ?? []).filter((id) => !ids.has(id));
    if (droppedLinks.length) console.warn(`  [${a.id}] dropped ${droppedLinks.length} dead link(s): ${droppedLinks.join(', ')}`);
    if (droppedClaims.length) console.warn(`  [${a.id}] dropped ${droppedClaims.length} dead claim(s): ${droppedClaims.join(', ')}`);

    const rec = {
      id: a.id,
      kind: 'annotation',
      dataset: 'medieval',
      target_id: a.target_id,
      target_kind: a.target_kind ?? 'text',
      anchor: a.anchor,
      ...(a.body ? { body: a.body } : {}),
      ...(linksTo.length ? { links_to: linksTo } : {}),
      ...(supports.length ? { supports_claims: supports } : {}),
      ...(a.tags && a.tags.length ? { tags: a.tags } : {}),
      provenance: a.provenance ?? {
        status: 'draft',
        confidence: 'high',
        attestation: 'strong',
        sources_used: [a.target_id],
      },
    };
    toWrite.push(rec);
  }

  console.log(`=== write-annotations (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  console.log(`seed: ${seed.length} | to write: ${toWrite.length} | rejected: ${rejected.length}`);
  for (const r of rejected) console.log(`  REJECT [${r.id ?? '?'}] ${r.reason}`);
  for (const a of toWrite.slice(0, 6)) {
    const q = a.anchor.quote ?? a.anchor.locator ?? '';
    console.log(`  [${a.id}] → ${a.target_id}: "${q.slice(0, 56)}${q.length > 56 ? '…' : ''}"`);
  }

  if (!MODE_WRITE) { console.log('\n(dry-run — nothing written.)'); return; }

  fs.mkdirSync(ANNOT_DIR, { recursive: true });
  const created = [];
  for (const a of toWrite) {
    const rel = path.relative(ROOT, path.join(ANNOT_DIR, `${a.id}.json`));
    fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(a, null, 2) + '\n', 'utf8');
    created.push(rel);
  }
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const auditPath = path.join(AUDIT_DIR, `annotations-${Date.now()}.json`);
  fs.writeFileSync(auditPath, JSON.stringify({ script: 'write-annotations.mjs', created }, null, 2) + '\n', 'utf8');
  console.log(`\nWROTE ${created.length} annotations. Revert log: ${path.relative(ROOT, auditPath)}`);
}

run();
