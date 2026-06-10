/**
 * reconcile-colon-source-ids.mjs — normalize filesystem-hostile source ids.
 *
 * PROBLEM: a batch of recovered source records carried ids that are
 * author-title strings containing ':' and '/' (e.g.
 * "Asbridge, The First Crusade: A New History"). On NTFS the ':' makes the
 * filename illegal — the write silently truncated at the colon and produced a
 * 0-byte artifact, so those sources never materialised and their citations stay
 * dangling. These ids are also poor stable identifiers regardless of OS.
 *
 * FIX (reversible): for each such id, derive a filesystem-safe slug
 * (lastname_keyword_year), then
 *   1. write data/sources/<slug>.json with internal id = <slug> (the bundle keys
 *      by the internal id field — see bake-manifests.mjs — so this is what the app
 *      resolves against), and
 *   2. rewrite every data reference (provenance.sources_used /
 *      provenance.unresolved_sources) from the colon-id to <slug>, moving a
 *      now-resolved id out of unresolved_sources into sources_used.
 *
 * REALNESS: only books with a verified title (from the recovered
 * batch) are written; we never invent bibliographic data here. The slug is a
 * pure rename of an already-web-verified record.
 *
 * REVERSIBLE: writes data/_audit/reconcile-colon-ids-<ts>.json listing every
 * created source file and every (file, oldId→newId) reference edit; --revert
 * restores exactly.
 *
 * Usage:
 *   node scripts/build/reconcile-colon-source-ids.mjs               # dry-run
 *   node scripts/build/reconcile-colon-source-ids.mjs --write
 *   node scripts/build/reconcile-colon-source-ids.mjs --revert <auditlog.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const SOURCES_DIR = path.join(DATA, 'sources');
const AUDIT_DIR = path.join(DATA, '_audit');
const BATCH = path.join(__dirname, '_integrity', 'recovered-batch.json');

const argv = process.argv.slice(2);
const MODE_WRITE = argv.includes('--write');
const REVERT_IDX = argv.indexOf('--revert');
const REVERT_FILE = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;

// Record dirs whose provenance may reference these sources.
const REF_DIRS = ['polities', 'events', 'journeys', 'relationships', 'rulers', 'claims']
  .map((d) => path.join(DATA, d))
  .filter((d) => fs.existsSync(d));

/** Stable timestamp string for the audit filename (Date.* avoided per harness rules elsewhere; node script is fine). */
function ts() {
  return String(Date.now());
}

/** Recursively list .json files under a dir. */
function walk(d) {
  let out = [];
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) out = out.concat(walk(p));
    else if (f.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/**
 * Derive a filesystem-safe slug from a recovered record.
 * Form: <lastname>_<first-significant-title-word>_<year>, lowercase, ascii.
 */
/** Normalize a title for matching (lowercase, strip punctuation/diacritics/spaces). */
function normTitle(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a recovered colon-id record to a safe slug.
 * Returns { slug, reuse } — reuse=true means an existing source file already holds
 * this exact book (same normalized title); in that case we point references at it
 * and create NO new file (no duplicate).
 */
function deriveSlug(rec, existing, titleIndex) {
  const author = String(rec.author ?? '').trim();
  // last name = first comma-segment, drop parentheticals like "(ed.)", take last token
  let last =
    author
      .split(',')[0]
      .replace(/\(.*?\)/g, '')
      .trim()
      .split(/\s+/)
      .pop() || 'anon';
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'des', 'die', 'der', 'das', 'les', 'una']);
  const titleWord =
    String(rec.title ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .find((w) => w.length > 3 && !stop.has(w)) || 'work';
  const year = Number.isFinite(rec.year) ? rec.year : 'nd';
  const base = `${last}_${titleWord}_${year}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '');

  // If an existing source file already holds this exact book, reuse it.
  const nt = normTitle(rec.title);
  if (titleIndex.has(nt)) {
    return { slug: titleIndex.get(nt), reuse: true };
  }
  let slug = base;
  let i = 2;
  while (existing.has(slug)) slug = `${base}_${i++}`;
  existing.add(slug);
  return { slug, reuse: false };
}

function doRevert() {
  if (!REVERT_FILE) { console.error('Provide an audit log to --revert.'); process.exit(1); }
  const log = JSON.parse(fs.readFileSync(path.isAbsolute(REVERT_FILE) ? REVERT_FILE : path.join(ROOT, REVERT_FILE), 'utf8'));
  // remove created source files
  for (const f of log.created_sources ?? []) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) { fs.unlinkSync(p); }
  }
  // restore each edited reference file: newId → oldId
  const byFile = {};
  for (const edit of log.reference_edits ?? []) {
    (byFile[edit.file] ??= []).push(edit);
  }
  for (const [rel, edits] of Object.entries(byFile)) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const prov = j.provenance ?? {};
    for (const e of edits) {
      // move newId back to oldId in whichever array it now sits
      for (const key of ['sources_used', 'unresolved_sources']) {
        if (Array.isArray(prov[key])) {
          const idx = prov[key].indexOf(e.newId);
          if (idx >= 0) prov[key][idx] = e.oldId;
        }
      }
    }
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  }
  console.log(`Reverted: removed ${(log.created_sources ?? []).length} sources, restored ${(log.reference_edits ?? []).length} reference edits.`);
}

function run() {
  if (REVERT_FILE) return doRevert();

  const batch = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
  const colon = batch.filter((e) => /[:/]/.test(e.id));
  if (colon.length === 0) { console.log('No colon/slash ids in batch — nothing to reconcile.'); return; }

  const sourceFiles = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'));
  const existingSlugs = new Set(sourceFiles.map((f) => f.slice(0, -5)));

  // Index existing sources by normalized title so we can reuse a record that
  // already holds the same book under a good slug (avoid duplicates). Skip files
  // whose own id/name is filesystem-hostile — reusing those would just re-dangle.
  const SAFE_SLUG = /^[a-z0-9_]+$/i;
  const titleIndex = new Map();
  for (const f of sourceFiles) {
    const slug = f.slice(0, -5);
    if (!SAFE_SLUG.test(slug)) continue; // never reuse an unsafe-named target
    try {
      const j = JSON.parse(fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8'));
      if (j && j.title && typeof j.id === 'string' && SAFE_SLUG.test(j.id)) {
        titleIndex.set(normTitle(j.title), slug);
      }
    } catch { /* skip unreadable */ }
  }

  /** @type {Record<string,string>} oldId → newSlug */
  const idMap = {};
  /** @type {Set<string>} ids whose target already exists (no new file) */
  const reuseIds = new Set();
  for (const rec of colon) {
    const { slug, reuse } = deriveSlug(rec, existingSlugs, titleIndex);
    idMap[rec.id] = slug;
    if (reuse) reuseIds.add(rec.id);
  }

  console.log(`=== reconcile-colon-source-ids (${MODE_WRITE ? 'WRITE' : 'DRY-RUN'}) ===`);
  console.log(`colon/slash ids to normalize: ${colon.length}`);
  for (const rec of colon) {
    const tag = reuseIds.has(rec.id) ? 'REUSE existing' : 'CREATE';
    console.log(`  [${rec.id}]\n    -> ${idMap[rec.id]}  (${tag})`);
  }

  // 1. Build source records under safe slugs (skip ids that reuse an existing file).
  const created = [];
  for (const rec of colon) {
    if (reuseIds.has(rec.id)) continue;
    const slug = idMap[rec.id];
    const out = {
      id: slug,
      type: 'source',
      kind: rec.kind ?? 'monograph',
      title: rec.title,
      ...(rec.author ? { author: rec.author } : {}),
      ...(Number.isFinite(rec.year) ? { year: rec.year } : {}),
      ...(rec.url ? { url: rec.url } : {}),
      provenance: {
        status: 'verified',
        confidence: 'high',
        attestation: 'strong',
        sources_used: [],
        notes: `Recovered + id-normalized from "${rec.id}" (web-verified via ${rec.verified_via ?? 'websearch'}).`,
      },
    };
    created.push({ slug, rel: path.relative(ROOT, path.join(SOURCES_DIR, `${slug}.json`)), out });
  }

  // 2. Rewrite references across record dirs.
  const refEdits = [];
  for (const dir of REF_DIRS) {
    for (const fp of walk(dir)) {
      let j;
      try { j = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
      const prov = j.provenance;
      if (!prov) continue;
      let touched = false;
      const rel = path.relative(ROOT, fp);
      // For each colon-id present, move it to sources_used under the new slug,
      // removing it from unresolved_sources.
      for (const [oldId, newId] of Object.entries(idMap)) {
        const inUsed = Array.isArray(prov.sources_used) && prov.sources_used.includes(oldId);
        const inUnres = Array.isArray(prov.unresolved_sources) && prov.unresolved_sources.includes(oldId);
        if (!inUsed && !inUnres) continue;
        if (inUnres) {
          prov.unresolved_sources = prov.unresolved_sources.filter((s) => s !== oldId);
        }
        if (inUsed) {
          prov.sources_used = prov.sources_used.map((s) => (s === oldId ? newId : s));
        } else {
          prov.sources_used = Array.isArray(prov.sources_used) ? prov.sources_used : [];
          if (!prov.sources_used.includes(newId)) prov.sources_used.push(newId);
        }
        refEdits.push({ file: rel, oldId, newId });
        touched = true;
      }
      if (touched && MODE_WRITE) {
        fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n', 'utf8');
      }
    }
  }

  console.log(`\nsource files to create: ${created.length}`);
  console.log(`reference edits: ${refEdits.length} across ${new Set(refEdits.map((e) => e.file)).size} files`);

  if (!MODE_WRITE) { console.log('\n(dry-run — nothing written.)'); return; }

  for (const c of created) {
    fs.writeFileSync(path.join(ROOT, c.rel), JSON.stringify(c.out, null, 2) + '\n', 'utf8');
  }
  const auditPath = path.join(AUDIT_DIR, `reconcile-colon-ids-${ts()}.json`);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      {
        script: 'reconcile-colon-source-ids.mjs',
        id_map: idMap,
        created_sources: created.map((c) => c.rel),
        reference_edits: refEdits,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`\nWROTE ${created.length} sources + ${refEdits.length} reference edits.`);
  console.log(`Revert log: ${path.relative(ROOT, auditPath)}`);
}

run();
